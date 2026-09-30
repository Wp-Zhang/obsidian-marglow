import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

if (process.platform !== "darwin") throw new Error("This smoke test launches the macOS Obsidian app.");
await mkdir("dev", { recursive: true });
const output = await mkdtemp(resolve("dev/smoke-"));
const vault = `${output}/vault`;
const profile = `${output}/profile`;
await mkdir(`${vault}/.obsidian/plugins/marglow`, { recursive: true });
await mkdir(profile);
for (const file of ["main.js", "manifest.json", "styles.css"]) await copyFile(`dist/marglow/${file}`, `${vault}/.obsidian/plugins/marglow/${file}`);

let markdown = "# Smoke test\n\nFirst **important sentence** with a [link](https://example.com).\n\nAnother paragraph for context.\n\n- A useful list item.\n\n| A | B |\n| --- | --- |\n| Table text | Context |\n";
await writeFile(`${vault}/Smoke.md`, markdown);

function pdfFixture() {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>"];
  for (const [page, stream] of [[3, 4], [5, 6]]) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 360] /Resources << /Font << /F1 7 0 R >> >> /Contents ${stream} 0 R >>`);
    const content = `BT /F1 16 Tf 50 280 Td (Marglow page ${(page - 1) / 2}) Tj 0 -35 Td (An important PDF passage.) Tj ET`;
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += "xref\n0 8\n0000000000 65535 f \n";
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  return Buffer.from(pdf + `trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
const pdf = pdfFixture();
await writeFile(`${vault}/Smoke.pdf`, pdf);
await writeFile(`${vault}/.obsidian/app.json`, JSON.stringify({ livePreview: false, defaultViewMode: "preview", showInlineTitle: false, alwaysUpdateLinks: true }));
await writeFile(`${vault}/.obsidian/community-plugins.json`, JSON.stringify(["marglow"]));
await writeFile(`${vault}/.obsidian/workspace.json`, JSON.stringify({ main: { id: "main", type: "split", children: [{ id: "smoke-leaf", type: "leaf", state: { type: "markdown", state: { file: "Smoke.md", mode: "preview" } } }], direction: "vertical" }, active: "smoke-leaf" }));
await writeFile(`${profile}/obsidian.json`, JSON.stringify({ vaults: { "123456789abcdef0": { path: vault, ts: Date.now(), open: true } }, updateDisabled: true }));

const child = spawn(process.env.OBSIDIAN_BIN ?? "/Applications/Obsidian.app/Contents/MacOS/Obsidian", [`--user-data-dir=${profile}`, "--remote-debugging-port=0"], { stdio: ["ignore", "pipe", "pipe"] });
let log = "";
let browser;
let page;
const checks = [];
const passed = name => { checks.push(name); console.log(`PASS ${name}`); };
try {
  const endpoint = await new Promise((resolveEndpoint, reject) => {
    const timer = setTimeout(() => reject(new Error("Obsidian did not start its isolated debugging endpoint.")), 30000);
    const accept = data => {
      log += data.toString();
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(log);
      if (match) { clearTimeout(timer); resolveEndpoint(match[1]); }
    };
    child.stdout.on("data", accept); child.stderr.on("data", accept);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Obsidian exited early (${code}).`)); });
  });
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  page = context.pages()[0] ?? await context.waitForEvent("page");
  await page.waitForFunction(expected => window.app?.vault?.adapter?.basePath === expected, vault, { timeout: 25000 });
  assert.equal(await page.evaluate(() => app.vault.adapter.basePath), vault, "Refusing to operate on any other Vault.");
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.evaluate(() => {
    window.marglowSmokeErrors = [];
    new MutationObserver(() => {
      for (const element of document.querySelectorAll(".notice")) {
        const text = element.textContent;
        if (text.startsWith("Marglow:") && text !== "Marglow: Select replacement text, then press Reassociate." && !window.marglowSmokeErrors.includes(text)) window.marglowSmokeErrors.push(text);
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  const trust = page.getByRole("button", { name: "Trust author and enable plugins", exact: true });
  await trust.waitFor({ timeout: 15000 });
  await trust.click();
  await page.waitForSelector(".marglow-file-tools button");
  await page.evaluate(() => app.setting.close());
  const closeSidebar = () => page.evaluate(() => {
    const source = app.plugins.plugins.marglow.commentsSource;
    app.workspace.detachLeavesOfType("marglow-comments");
    if (source) app.workspace.setActiveLeaf(source.leaf, { focus: true });
  });
  const pageTools = page.getByRole("toolbar", { name: "Page annotation tools" });
  assert.equal(await pageTools.locator(".marglow-color").count(), 4);
  assert.ok(await page.evaluate(() => {
    const toolbar = document.querySelector('.marglow-file-tools'), container = document.querySelector('.marglow-reading-container');
    return toolbar.parentElement === container && Math.abs(toolbar.getBoundingClientRect().top - container.getBoundingClientRect().top) < 1;
  }));
  for (const dark of [false, true]) {
    const swatches = await page.evaluate(dark => {
      document.body.classList.toggle("theme-dark", dark);
      document.body.classList.toggle("theme-light", !dark);
      return [...document.querySelectorAll(".marglow-file-tools .marglow-color-dot")].map(dot => {
        const rect = dot.getBoundingClientRect();
        return { color: getComputedStyle(dot).backgroundColor, width: rect.width, height: rect.height };
      });
    }, dark);
    assert.deepEqual(swatches.map(swatch => swatch.color), ["rgb(246, 205, 83)", "rgb(114, 200, 144)", "rgb(121, 183, 237)", "rgb(233, 151, 183)"]);
    assert.ok(swatches.every(swatch => swatch.width > 16 && Math.abs(swatch.width - swatch.height) < 0.1));
  }
  await pageTools.getByRole("button", { name: "Choose blue", exact: true }).click();
  assert.equal(await pageTools.getByRole("button", { name: "Choose blue", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await page.evaluate(() => !!app.vault.getFileByPath("_marglow/Smoke.md.annotations.md")), false);
  passed("Persistent toolbar and round visible color swatches in light/dark themes");

  const selectStrong = async end => {
    await page.evaluate(end => {
      const text = document.querySelector(".markdown-preview-view strong").firstChild;
      const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, end ?? text.length);
      getSelection().removeAllRanges(); getSelection().addRange(range);
    }, end);
  };
  const noteText = () => page.evaluate(async () => app.vault.read(app.vault.getFileByPath("_marglow/Smoke.md.annotations.md")));
  const highlightCount = count => page.waitForFunction(count => document.querySelectorAll(".marglow-highlight").length === count, count);
  await selectStrong();
  await page.getByRole("button", { name: "Highlight yellow", exact: true }).click();
  await highlightCount(1);
  passed("Markdown selection, companion creation, and highlight");

  const clickHighlight = async () => {
    const handle = await page.waitForFunction(() => {
      const rect = document.querySelector(".marglow-highlight")?.getBoundingClientRect();
      return rect?.width && rect.height ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : false;
    });
    const box = await handle.jsonValue();
    await handle.dispose();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };
  await clickHighlight();
  await page.locator('.marglow-toolbar').getByRole("button", { name: "Comment", exact: true }).click();
  await page.getByRole("textbox", { name: "Comment", exact: true }).fill("A persisted comment.");
  await page.locator(".markdown-preview-view h1").click();
  await page.waitForFunction(async () => (await app.vault.read(app.vault.getFileByPath("_marglow/Smoke.md.annotations.md"))).includes("A persisted comment."));
  passed("Outside-click autosave");

  await selectStrong();
  await page.getByRole("button", { name: "Highlight green", exact: true }).click();
  assert.equal((await noteText()).match(/oa:annotation:start/g).length, 1);
  passed("Exact selection reuse");
  await selectStrong(9);
  await page.getByRole("button", { name: "Highlight pink", exact: true }).click();
  await highlightCount(2);
  const ids = [...(await noteText()).matchAll(/oa:annotation:start ([a-zA-Z0-9-]+)/g)].map(match => match[1]);
  await clickHighlight();
  await page.locator(".marglow-choices button").first().click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  passed("Overlapping selection and entry picker");

  await page.evaluate(async () => { await app.vault.process(app.vault.getFileByPath("_marglow/Smoke.md.annotations.md"), text => text.replace("A persisted comment.", "Direct edit.") + "\nHandwritten summary.\n"); });
  await page.waitForFunction(() => [...app.plugins.plugins.marglow.mounted.values()].some(mount => mount.session.entries.some(entry => entry.annotation.comment === "Direct edit.")));
  await page.waitForFunction(ids => ids.every(id => app.metadataCache.getFileCache(app.vault.getFileByPath("_marglow/Smoke.md.annotations.md"))?.blocks?.[id]), ids);
  passed("Direct Markdown edit and native block IDs");
  await pageTools.getByRole("button", { name: "Comments", exact: true }).click();
  const sidebar = page.getByRole("complementary", { name: "Annotation comments" });
  await sidebar.waitFor({ state: "visible" });
  assert.equal(await sidebar.getByRole("button", { name: "Close", exact: true }).count(), 0);
  assert.equal(await sidebar.locator("time").count(), 2);
  const card = sidebar.locator('.marglow-comment-card').filter({ hasText: "Direct edit." });
  await card.getByRole("button", { name: /^Go to annotation:/ }).click();
  await page.waitForFunction(id => [...document.querySelectorAll('.marglow-highlight.is-active')].every(node => node.dataset.annotationId === id) && document.querySelectorAll('.marglow-highlight.is-active').length > 0, ids[0]);
  assert.equal(await card.getByRole("button", { name: /^Go to annotation:/ }).getAttribute("aria-current"), "true");
  await card.hover();
  await page.waitForFunction(id => !!document.querySelector(`.marglow-highlight.is-hovered[data-annotation-id="${id}"]`), ids[0]);
  await page.mouse.move(10, 10);
  const bodyRect = await page.locator(`.marglow-highlight[data-annotation-id="${ids[0]}"]`).first().boundingBox();
  await page.mouse.move(bodyRect.x + bodyRect.width - 2, bodyRect.y + bodyRect.height / 2);
  await page.waitForFunction(id => !!document.querySelector(`.marglow-comment-card.is-hovered[data-annotation-id="${id}"]`), ids[0]);
  await card.locator(".marglow-comment-text").click();
  assert.equal(await sidebar.locator(".marglow-inline-composer textarea").count(), 1);
  assert.equal(await page.locator("body > .marglow-composer").count(), 0);
  await page.getByRole("textbox", { name: "Comment", exact: true }).fill("Sidebar edit.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.marglow-sidebar')?.textContent.includes("Sidebar edit."));
  assert.ok((await noteText()).includes(`^${ids[0]}`));
  await page.evaluate(async () => app.vault.process(app.vault.getFileByPath("_marglow/Smoke.md.annotations.md"), text => text.replace("Sidebar edit.", "Direct edit.")));
  await page.waitForFunction(() => document.querySelector('.marglow-sidebar')?.textContent.includes("Direct edit."));
  assert.equal(await page.evaluate(() => app.workspace.getLeavesOfType('marglow-comments').length), 1);
  assert.equal(await sidebar.evaluate(element => !!element.closest('.mod-right-split')), true);
  assert.equal(await page.locator('.marglow-sidebar-docked, .marglow-pane').count(), 0);
  await page.screenshot({ path: `${output}/comments-sidebar.png` });
  await closeSidebar();
  passed("Markdown selected outline, bidirectional hover, sidebar navigation/edit and external update");


  markdown = "Inserted introduction.\n\n" + markdown;
  await page.evaluate(async text => app.vault.modify(app.vault.getFileByPath("Smoke.md"), text), markdown);
  await page.waitForFunction(() => document.querySelector(".marglow-file-tools > button:last-child")?.textContent === "Reading notes · 2");
  await highlightCount(2);
  passed("Relocation after earlier source insertion");

  markdown = markdown.replace("important sentence", "changed source");
  await page.evaluate(async text => app.vault.modify(app.vault.getFileByPath("Smoke.md"), text), markdown);
  await page.waitForFunction(() => document.querySelector(".marglow-file-tools > button:last-child")?.textContent.includes("2 unlocated"));
  await page.evaluate(() => app.commands.executeCommandById("marglow:reassociate-annotation"));
  await page.locator(".suggestion-item").first().click();
  await selectStrong();
  await page.getByRole("button", { name: "Reassociate", exact: true }).click();
  await highlightCount(1);
  assert.ok((await noteText()).includes(`^${ids[0]}`));
  assert.ok((await noteText()).includes("Direct edit."));
  passed("Unlocated preservation and manual reassociation");

  await page.evaluate(async id => app.vault.process(app.vault.getFileByPath("_marglow/Smoke.md.annotations.md"), text => text.replace(new RegExp(`%% oa:annotation:start ${id} %%[\\s\\S]*?%% oa:annotation:end ${id} %%`), "")), ids[1]);
  await page.waitForFunction(() => document.querySelector(".marglow-file-tools > button:last-child")?.textContent === "Reading notes · 1");
  assert.ok((await noteText()).includes("Handwritten summary."));
  passed("Complete entry deletion and handwritten content preservation");
  await page.screenshot({ path: `${output}/markdown.png` });
  await page.evaluate(async () => app.fileManager.renameFile(app.vault.getFileByPath("Smoke.md"), "Renamed.md"));
  await page.waitForFunction(() => !!app.vault.getFileByPath("_marglow/Renamed.md.annotations.md"));
  await page.waitForFunction(() => document.querySelector(".marglow-file-tools > button:last-child")?.textContent === "Reading notes · 1");
  assert.ok((await page.evaluate(async () => app.vault.read(app.vault.getFileByPath("_marglow/Renamed.md.annotations.md")))).includes(`^${ids[0]}`));
  await page.waitForFunction(() => [...app.plugins.plugins.marglow.mounted.values()].some(mount => mount.session.source.path === "Renamed.md" && !mount.session.suspended));
  passed("Native source rename and companion association preservation");
  await page.evaluate(async () => {
    getSelection().removeAllRanges();
    const session = [...app.plugins.plugins.marglow.mounted.values()].find(mount => mount.session.source.path === "Renamed.md").session;
    await session.ui.finish();
  });
  await pageTools.getByRole("button", { name: "Choose pink", exact: true }).click();
  await pageTools.getByRole("button", { name: "Highlight", exact: true }).click();
  assert.equal(await pageTools.getByRole("button", { name: "Highlight", exact: true }).getAttribute("aria-pressed"), "true");
  await selectStrong();
  await page.waitForFunction(async () => {
    const session = [...app.plugins.plugins.marglow.mounted.values()].find(mount => mount.session.source.path === "Renamed.md")?.session;
    return session && !session.pageBusy && getSelection().isCollapsed && (await app.vault.read(app.vault.getFileByPath("_marglow/Renamed.md.annotations.md"))).includes('"color":"pink"');
  });
  await pageTools.getByRole("button", { name: "Highlight", exact: true }).click();
  assert.equal(await pageTools.getByRole("button", { name: "Highlight", exact: true }).getAttribute("aria-pressed"), "false");
  await pageTools.getByRole("button", { name: "Comment", exact: true }).click();
  await selectStrong(7);
  await page.waitForFunction(() => document.querySelectorAll(".marglow-highlight.is-active").length > 0);
  await page.getByRole("textbox", { name: "Comment", exact: true }).fill("Comment from the page toolbar.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(async () => (await app.vault.read(app.vault.getFileByPath("_marglow/Renamed.md.annotations.md"))).includes("Comment from the page toolbar."));
  await page.screenshot({ path: `${output}/page-toolbar-dark.png` });
  const afterToolbar = await page.evaluate(async () => app.vault.read(app.vault.getFileByPath("_marglow/Renamed.md.annotations.md")));
  assert.equal(afterToolbar.match(/oa:annotation:start/g)?.length, 2);
  passed("Page toolbar highlight mode and comment-before-selection workflow");

  await page.evaluate(async () => app.workspace.getLeaf(false).openFile(app.vault.getFileByPath("Smoke.pdf")));
  await page.waitForFunction(() => document.querySelectorAll(".textLayer span").length >= 4);
  await page.evaluate(() => {
    const layers = [...document.querySelectorAll(".textLayer")];
    const start = layers[0].querySelector("span").firstChild, end = layers[1].querySelector("span").firstChild;
    const range = document.createRange(); range.setStart(start, 0); range.setEnd(end, end.length);
    getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await page.getByRole("button", { name: "Highlight blue", exact: true }).click();
  await highlightCount(3);
  const geometryMatches = () => {
    const first = document.querySelector('.page[data-page-number="1"] .textLayer span');
    const highlight = document.querySelector(".marglow-highlight");
    if (!first || !highlight) return false;
    const range = document.createRange(); range.selectNodeContents(first.firstChild);
    const text = range.getBoundingClientRect(), overlay = highlight.getBoundingClientRect();
    return ["left", "top", "width", "height"].every(key => Math.abs(text[key] - overlay[key]) < 3);
  };
  await page.waitForFunction(geometryMatches);
  passed("PDF cross-page annotation with correctly aligned geometry");
  await page.setViewportSize({ width: 1100, height: 650 });
  await page.evaluate(() => { app.workspace.getLeavesOfType("pdf")[0].view.viewer.child.pdfViewer.pdfViewer.currentScale = 2; });
  await page.waitForFunction(() => app.workspace.getLeavesOfType("pdf")[0].view.viewer.child.pdfViewer.pdfViewer.currentScale === 2);
  await page.waitForFunction(geometryMatches);
  const scrollError = await page.evaluate(async () => {
    const first = document.querySelector('.page[data-page-number="1"] .textLayer span');
    const highlight = document.querySelector('.page[data-page-number="1"] .marglow-highlight');
    if (!highlight) throw new Error("PDF highlight must belong to its page.");
    let scroller = first.parentElement;
    while (scroller && !(/auto|scroll/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) scroller = scroller.parentElement;
    if (!scroller) {
      const chain = []; let element = first.parentElement;
      while (element) { chain.push([element.className, getComputedStyle(element).overflowY, element.scrollHeight, element.clientHeight]); element = element.parentElement; }
      throw new Error("Missing PDF scroll container: " + JSON.stringify(chain));
    }
    const origin = scroller.scrollTop;
    scroller.scrollTop = 70;
    if (scroller.scrollTop < 20) throw new Error("PDF fixture did not scroll");
    let worst = 0;
    for (let frame = 0; frame < 20; frame++) {
      scroller.scrollTop = origin + (frame % 2 ? 180 : 70);
      const currentText = document.querySelector('.page[data-page-number="1"] .textLayer span');
      const currentHighlight = document.querySelector('.page[data-page-number="1"] .marglow-highlight');
      if (!currentText || !currentHighlight) throw new Error("PDF layer missing during scroll");
      const range = document.createRange(); range.selectNodeContents(currentText.firstChild);
      const text = range.getBoundingClientRect(), overlay = currentHighlight.getBoundingClientRect();
      worst = Math.max(worst, ...["left", "top", "width", "height"].map(key => Math.abs(text[key] - overlay[key])));
      await new Promise(requestAnimationFrame);
    }
    scroller.scrollTop = origin;
    return worst;
  });
  assert.ok(scrollError < 3, `PDF scrolling drift: ${scrollError}px`);
  passed("PDF page-attached highlights follow every scroll frame without delayed positioning");
  if (await sidebar.isHidden()) await pageTools.getByRole("button", { name: "Comments", exact: true }).click();
  const pdfCard = sidebar.locator('.marglow-comment-card').first();
  await pdfCard.getByRole("button", { name: /^Go to annotation:/ }).click();
  assert.equal(await page.locator('.marglow-highlight.is-active').count(), 3);
  await pdfCard.hover();
  assert.equal(await page.locator('.marglow-highlight.is-hovered').count(), 3);
  await page.screenshot({ path: `${output}/pdf-comments-sidebar.png` });
  await closeSidebar();
  passed("PDF sidebar navigation and cross-page selection/hover emphasis");
  await pageTools.getByRole("button", { name: "Comments", exact: true }).click();
  await page.evaluate(async () => app.workspace.getLeaf("tab").openFile(app.vault.getFileByPath("Renamed.md"), { state: { mode: "preview" } }));
  await page.waitForFunction(() => document.querySelector('.marglow-comments-source')?.textContent === "Renamed.md");
  assert.ok(await sidebar.locator('.marglow-comment-card').filter({ hasText: "Comment from the page toolbar." }).count());
  await page.evaluate(() => app.workspace.revealLeaf(app.workspace.getLeavesOfType("marglow-comments")[0]));
  await page.waitForFunction(() => document.querySelector('.marglow-comments-source')?.textContent === "Renamed.md");
  await page.evaluate(() => app.workspace.setActiveLeaf(app.workspace.getLeavesOfType("pdf")[0], { focus: true }));
  await page.waitForFunction(() => document.querySelector('.marglow-comments-source')?.textContent === "Smoke.pdf");
  assert.equal(await sidebar.locator('.marglow-comment-card').count(), 1);
  await closeSidebar();
  await page.evaluate(() => app.workspace.getLeavesOfType("markdown").filter(leaf => leaf.view.file?.path === "Renamed.md").forEach(leaf => leaf.detach()));
  await highlightCount(3);
  passed("Native right-sidebar tab follows source switches and retains association on focus");

  await page.evaluate(() => { app.workspace.getLeavesOfType("pdf")[0].view.viewer.child.pdfViewer.pdfViewer.currentScale = 1.25; });
  await page.waitForFunction(geometryMatches);
  await page.evaluate(() => { app.workspace.getLeavesOfType("pdf")[0].view.viewer.child.pdfViewer.pdfViewer.pagesRotation = 90; });
  await page.waitForFunction(() => app.workspace.getLeavesOfType("pdf")[0].view.viewer.child.pdfViewer.pdfViewer.getPageView(0).viewport.rotation === 90);
  await page.waitForFunction(geometryMatches);
  await page.screenshot({ path: `${output}/pdf-rotated.png` });
  passed("PDF zoom and rotation geometry");

  await page.evaluate(async () => { await app.plugins.disablePlugin("marglow"); });
  assert.equal(await page.locator(".marglow-overlay").count(), 0);
  assert.equal(await page.locator(".marglow-sidebar").count(), 0);
  assert.equal(await page.evaluate(() => app.workspace.getLeavesOfType("marglow-comments").length), 0);
  await page.evaluate(async () => { await app.plugins.enablePlugin("marglow"); });
  await highlightCount(3);
  await page.waitForFunction(geometryMatches);
  passed("Plugin cleanup, reload, and persistent PDF restoration");
  await pageTools.getByRole("button", { name: "Comments", exact: true }).click();
  await sidebar.locator('.marglow-comment-jump').first().click();
  await page.keyboard.press("Meta+Backspace");
  await highlightCount(0);
  await page.waitForFunction(() => document.querySelectorAll('.marglow-comment-card').length === 0);
  assert.equal((await page.evaluate(async () => app.vault.read(app.vault.getFileByPath("_marglow/Smoke.pdf.annotations.md")))).includes("oa:annotation:start"), false);
  passed("Mac command-delete removes the selected cross-page PDF annotation");
  await closeSidebar();
  await page.evaluate(async () => app.workspace.getLeaf(false).openFile(app.vault.getFileByPath("Renamed.md"), { state: { mode: "preview" } }));
  await page.waitForFunction(() => document.querySelectorAll('.marglow-highlight').length === 2);
  await pageTools.getByRole("button", { name: "Comments", exact: true }).click();
  await sidebar.locator('.marglow-comment-jump').first().click();
  await page.keyboard.press("Delete");
  await page.waitForFunction(() => document.querySelectorAll('.marglow-comment-card').length === 1);
  const remaining = sidebar.locator('.marglow-comment-card').first();
  await remaining.locator('.marglow-comment-text').click();
  const draft = page.getByRole("textbox", { name: "Comment", exact: true });
  await draft.fill("Do not delete");
  await page.keyboard.press("Backspace");
  assert.equal(await draft.inputValue(), "Do not delet");
  await page.keyboard.press("Meta+Backspace");
  assert.equal(await sidebar.locator('.marglow-comment-card').count(), 1);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await remaining.hover();
  assert.equal(await remaining.locator('.marglow-comment-delete').evaluate(button => getComputedStyle(button).opacity), "1");
  await remaining.getByRole("button", { name: "Delete annotation", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.marglow-comment-card').length === 0);
  await highlightCount(0);
  assert.ok((await page.evaluate(async () => app.vault.read(app.vault.getFileByPath("_marglow/Renamed.md.annotations.md")))).includes("Handwritten summary."));
  passed("Markdown Delete shortcut, protected text editing, and card hover-delete preserve handwritten notes");
  assert.equal(await pageTools.getByRole("button", { name: "Highlight", exact: true }).locator("svg").count(), 1);
  assert.equal(await pageTools.getByRole("button", { name: "Underline", exact: true }).locator("svg").count(), 1);
  assert.equal(await pageTools.getByRole("button", { name: "Comment", exact: true }).locator("svg").count(), 1);
  await selectStrong();
  await page.getByRole("button", { name: "Highlight yellow", exact: true }).click();
  await highlightCount(1);
  await selectStrong();
  await pageTools.getByRole("button", { name: "Underline", exact: true }).click();
  await highlightCount(2);
  await page.waitForFunction(() => document.querySelectorAll('.marglow-underline').length === 1);
  const underlineStyle = await page.locator('.marglow-underline').evaluate(element => ({ background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderBottomWidth }));
  assert.equal(underlineStyle.background, "rgba(0, 0, 0, 0)"); assert.equal(underlineStyle.border, "2px");
  await selectStrong();
  await pageTools.getByRole("button", { name: "Underline", exact: true }).click();
  const mdText = await page.evaluate(async () => app.vault.read(app.vault.getFileByPath("_marglow/Renamed.md.annotations.md")));
  assert.equal(mdText.match(/oa:annotation:start/g).length, 2);
  const underlineCard = sidebar.locator('.marglow-comment-card').filter({ hasText: "Underline · no comment" });
  await underlineCard.locator('.marglow-comment-text').click();
  await sidebar.getByRole("textbox", { name: "Comment", exact: true }).fill("Inline underline comment.");
  await sidebar.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.marglow-sidebar')?.textContent.includes("Inline underline comment."));
  await page.screenshot({ path: `${output}/inline-underline.png` });
  await closeSidebar();
  await page.evaluate(async () => app.workspace.getLeavesOfType("markdown").find(leaf => leaf.view.file?.path === "Renamed.md").openFile(app.vault.getFileByPath("Smoke.pdf")));
  await page.waitForFunction(() => document.querySelectorAll('.textLayer').length === 2);
  await page.evaluate(() => {
    const layers = [...document.querySelectorAll('.textLayer')];
    const start = layers[0].querySelector('span').firstChild, end = layers[1].querySelector('span').firstChild;
    const range = document.createRange(); range.setStart(start, 0); range.setEnd(end, end.length);
    getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await pageTools.getByRole("button", { name: "Underline", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.marglow-underline').length === 3);
  await page.waitForFunction(geometryMatches);
  passed("Icon tools, independent same-range underlines, inline comments and cross-page PDF underlines");


  await page.evaluate(async () => {
    await app.vault.createFolder("Folder");
    await app.vault.create("Folder/Article.md", "Source text");
    await app.plugins.plugins.marglow.store.save({ path: "Folder/Article.md", type: "markdown" }, {
      id: "ann-folder-test", blockId: "ann-folder-test", color: "yellow", style: "highlight", quote: "Source text", comment: "Folder note",
      anchor: { kind: "markdown", textStart: 0, prefix: "", suffix: "" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await app.vault.create("Reference.md", "[[Folder/_marglow/Article.md.annotations#^ann-folder-test]]");
  });
  await page.waitForFunction(() => app.metadataCache.getFileCache(app.vault.getFileByPath("Folder/_marglow/Article.md.annotations.md"))?.blocks?.["ann-folder-test"]);
  await page.evaluate(async () => app.fileManager.renameFile(app.vault.getAbstractFileByPath("Folder"), "Moved"));
  await page.waitForFunction(async () => {
    try { return (await app.plugins.plugins.marglow.store.load({ path: "Moved/Article.md", type: "markdown" })).note?.entries[0]?.annotation.id === "ann-folder-test"; }
    catch { return false; }
  });
  await page.waitForFunction(() => {
    const ref = app.vault.getFileByPath("Reference.md"), link = app.metadataCache.getFileCache(ref)?.links?.[0]?.link;
    return link?.includes("#^ann-folder-test") && app.metadataCache.getFirstLinkpathDest(link.split("#")[0], ref.path)?.path === "Moved/_marglow/Article.md.annotations.md";
  });
  assert.equal(await readFile(`${vault}/Moved/Article.md`, "utf8"), "Source text");
  assert.equal(await page.evaluate(() => !!app.vault.getFileByPath("Moved/Article.md.annotations.md")), false);
  passed("Grouped reading-note folders move with sources and retain native block references");
  assert.equal(await readFile(`${vault}/Renamed.md`, "utf8"), markdown);
  assert.deepEqual(await readFile(`${vault}/Smoke.pdf`), pdf);
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => window.marglowSmokeErrors), []);
  passed("Source-byte preservation and no renderer exceptions");
  await writeFile(`${output}/report.json`, JSON.stringify({ title: await page.title(), checks }, null, 2));
  console.log(`Smoke artifacts: ${output}`);
} catch (error) {
  if (page) console.error(await page.evaluate(() => [...document.querySelectorAll('.page[data-page-number="1"] .canvasWrapper, .page[data-page-number="1"] .textLayer, .page[data-page-number="1"] .marglow-overlay, .marglow-highlight')].slice(0, 7).map(element => ({ class: element.className, rect: element.getBoundingClientRect().toJSON(), z: getComputedStyle(element).zIndex, opacity: getComputedStyle(element).opacity, color: getComputedStyle(element).backgroundColor }))));
  if (page) await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  console.error(`Smoke artifacts: ${output}`);
  throw error;
} finally {
  await writeFile(`${output}/obsidian.log`, log);
  if (browser) await browser.close();
  child.kill("SIGTERM");
}
