import assert from "node:assert/strict";
import { trustTestVault } from "./obsidian-test-trust.mjs";
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
if (process.env.OBSIDIAN_ASAR) await copyFile(process.env.OBSIDIAN_ASAR, `${profile}/${process.env.OBSIDIAN_ASAR.split('/').at(-1)}`);
for (const file of ["main.js", "manifest.json", "styles.css"]) await copyFile(`dist/marglow/${file}`, `${vault}/.obsidian/plugins/marglow/${file}`);

let markdown = "# Smoke test\n\nFirst **important sentence** with a [link](https://example.com).\n\nAnother paragraph for context.\n\n- A useful list item.\n\n| A | B |\n| --- | --- |\n| Table text | Context |\n";
await writeFile(`${vault}/Smoke.md`, markdown);

function pdfFixture(pageCount = 2) {
  const pageIds = Array.from({ length: pageCount }, (_, index) => 3 + index * 2);
  const fontId = 3 + pageCount * 2;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`];
  for (const page of pageIds) {
    const stream = page + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 360] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${stream} 0 R >>`);
    const content = `BT /F1 16 Tf 50 280 Td (Marglow page ${(page - 1) / 2}) Tj 0 -35 Td (An important PDF passage.) Tj ET`;
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  const size = objects.length + 1;
  pdf += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  return Buffer.from(pdf + `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
const pdf = pdfFixture();
const longPdf = pdfFixture(30);
await writeFile(`${vault}/Long.pdf`, longPdf);
await writeFile(`${vault}/Smoke.pdf`, pdf);
await writeFile(`${vault}/.obsidian/app.json`, JSON.stringify({ livePreview: false, defaultViewMode: "preview", showInlineTitle: false, alwaysUpdateLinks: true }));
await writeFile(`${vault}/.obsidian/community-plugins.json`, JSON.stringify(["marglow"]));
await writeFile(`${vault}/.obsidian/workspace.json`, JSON.stringify({ main: { id: "main", type: "split", children: [{ id: "smoke-leaf", type: "leaf", state: { type: "markdown", state: { file: "Smoke.md", mode: "preview" } } }], direction: "vertical" }, active: "smoke-leaf" }));
await writeFile(`${profile}/obsidian.json`, JSON.stringify({ vaults: { "123456789abcdef0": { path: vault, ts: Date.now(), open: true } }, updateDisabled: true }));

if (process.env.OBSIDIAN_TEST_PDF && process.env.OBSIDIAN_TEST_NOTE) {
  await copyFile(process.env.OBSIDIAN_TEST_PDF, `${vault}/Reference.pdf`);
  await mkdir(`${vault}/_marglow`, {recursive:true});
  const note=(await readFile(process.env.OBSIDIAN_TEST_NOTE,'utf8')).replace(/^annotation_source:.*$/m,'annotation_source: "[[Reference.pdf]]"').replace(/^Source:.*$/m,'Source: [[Reference.pdf]]');
  await writeFile(`${vault}/_marglow/Reference.pdf.annotations.md`,note);
}

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

  await trustTestVault(page, vault);
  await page.setViewportSize({width:402,height:874});
  await page.evaluate(()=>app.emulateMobile(true));
  await page.waitForFunction(expected => window.app?.vault?.adapter?.basePath===expected&&app.isMobile, vault, {timeout:25000});
  await trustTestVault(page, vault);
  await page.evaluate(async()=>{await app.plugins.enablePluginAndSave('marglow');await app.workspace.getMostRecentLeaf().openFile(app.vault.getFileByPath('Smoke.md'),{state:{mode:'preview'}});});
  await page.waitForSelector(".marglow-file-tools button");
  await page.evaluate(() => app.setting.close());

  await page.evaluate(async()=>app.workspace.getMostRecentLeaf().openFile(app.vault.getFileByPath('Smoke.md'),{state:{mode:'preview'}}));
  await page.waitForSelector('.markdown-preview-view .marglow-highlight, .markdown-reading-view .marglow-file-tools');
  assert.equal(await page.evaluate(()=>app.isMobile), true);
  assert.equal(await page.locator('.marglow-file-tools.marglow-mobile').count(), 1);
  assert.equal((await page.locator('.marglow-notes-button').textContent()).trim(), '0');
  assert.ok(await page.evaluate(()=>{
    const buttons=[...document.querySelectorAll('.marglow-file-tools > button')].map(b=>b.getBoundingClientRect());
    const toolbar=document.querySelector('.marglow-file-tools').getBoundingClientRect();
    return buttons.every(b=>Math.abs(b.top-buttons[0].top)<1&&b.width>=44&&b.height>=44)&&buttons.at(-1).right<=toolbar.right;
  }));
  const control = page.getByRole('button',{name:'Choose green',exact:true});
  await control.click();assert.equal(await control.getAttribute('aria-pressed'),'true');
  const position=await page.evaluate(()=>{
    const toolbar=document.querySelector('.marglow-file-tools'),box=toolbar.getBoundingClientRect();
    const padding=parseFloat(getComputedStyle(toolbar.parentElement).paddingTop);
    return {top:box.top,inset:padding,paneTop:toolbar.parentElement.getBoundingClientRect().top};
  });
  assert.ok(Math.abs(position.top-position.paneTop-position.inset)<1);
  await page.evaluate(()=>document.querySelector('.markdown-preview-view').scrollTop=100);
  assert.ok(Math.abs((await page.locator('.marglow-file-tools').boundingBox()).y-position.top)<1);
  await page.screenshot({path:`${output}/mobile-toolbar.png`});
  await page.getByRole('button',{name:/^Reading notes/}).click();
  await page.getByRole('complementary',{name:'Annotation comments'}).waitFor();
  console.log('PASS Native mobile emulation, reachable toolbar, scroll stability and sidebar:',await page.title());

  await page.screenshot({path:`${output}/mobile-emulation.png`});
  await writeFile(`${output}/mobile-report.json`,JSON.stringify({title:await page.title(),mobileEmulation:true,physicalIOS:false,position},null,2));
  if (process.env.OBSIDIAN_TEST_PDF && process.env.OBSIDIAN_TEST_NOTE) {
    const noteBefore=await readFile(`${vault}/_marglow/Reference.pdf.annotations.md`,'utf8');
    await page.evaluate(async()=>{
      app.workspace.rightSplit.collapse();
      await app.workspace.getMostRecentLeaf().openFile(app.vault.getFileByPath('Reference.pdf'));
    });
    await page.waitForFunction(()=>[...app.plugins.plugins.marglow.mounted.values()].some(m=>m.session.source.path==='Reference.pdf'&&m.session.entries.length));
    const targetPage=await page.evaluate(()=>{const session=[...app.plugins.plugins.marglow.mounted.values()].find(m=>m.session.source.path==='Reference.pdf').session;return session.entries.at(-1).annotation.anchor.segments[0].page;});
    await page.evaluate(number=>{app.workspace.getLeavesOfType('pdf')[0].view.viewer.child.pdfViewer.pdfViewer.currentPageNumber=number;},targetPage);
    await page.waitForSelector(`.page[data-page-number="${targetPage}"] .textLayer span`);
    const result=await page.evaluate(async targetPage=>{
      const session=[...app.plugins.plugins.marglow.mounted.values()].find(m=>m.session.source.path==='Reference.pdf').session;
      const entry=session.entries.find(e=>e.annotation.anchor.segments.some(s=>s.page===targetPage));
      const before=JSON.stringify(entry.annotation.anchor);
      const rects=session.adapter.locate(entry.annotation);
      const stored=entry.annotation.anchor.segments.reduce((n,s)=>n+s.rects.length,0);
      const layer=session.adapter.root.querySelector(`.page[data-page-number="${targetPage}"] .textLayer`);
      return {stored,displayed:rects.length,unchanged:before===JSON.stringify(entry.annotation.anchor),quotePresent:layer.textContent.length>0};
    },targetPage);
    assert.equal(result.unchanged,true);assert.ok(result.displayed>0);
    assert.equal(await readFile(`${vault}/_marglow/Reference.pdf.annotations.md`,'utf8'),noteBefore);
    assert.deepEqual(await readFile(`${vault}/Reference.pdf`),await readFile(process.env.OBSIDIAN_TEST_PDF));
    console.log('Read-only copied PDF/annotation check:',result);
    await page.screenshot({path:`${output}/copied-pdf.png`});
  }
  console.log('Mobile artifacts:',output);
 } catch(error) {
  if(page){console.log(await page.evaluate(()=>({mobile:app.isMobile,loaded:!!app.plugins.plugins.marglow,views:[...app.workspace.getLeavesOfType('markdown'),...app.workspace.getLeavesOfType('pdf')].map(l=>({path:l.view.file?.path,type:l.view.getViewType()})),tools:document.querySelectorAll('.marglow-file-tools').length,ready:app.workspace.layoutReady})));await page.screenshot({path:`${output}/mobile-failure.png`});}
  console.log('Mobile artifacts:',output);throw error;
}finally{if(browser)await browser.close();child.kill('SIGTERM');}
