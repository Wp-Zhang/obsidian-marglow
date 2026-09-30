import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

/** Handle only our freshly built plugin in our explicitly identified test Vault. */
export async function trustTestVault(page, vault) {
  const directory = `${vault}/.obsidian/plugins`;
  assert.deepEqual(await readdir(directory), ["marglow"], "Refusing to trust unexpected test plugins");
  for (const file of ["main.js", "manifest.json", "styles.css"]) {
    assert.deepEqual(await readFile(`${directory}/marglow/${file}`), await readFile(`dist/marglow/${file}`));
  }
  const labels = /^(Trust author and enable plugins|信任仓库作者并启用插件|信任作者并启用插件)$/;
  await page.waitForFunction(expected => {
    if (window.app?.vault?.adapter?.basePath !== expected) return false;
    const prompt = [...document.querySelectorAll('button')].some(button =>
      /^(Trust author and enable plugins|信任仓库作者并启用插件|信任作者并启用插件)$/.test(button.textContent.trim()) && button.getBoundingClientRect().width > 0);
    return prompt || (app.workspace?.layoutReady && !!app.plugins?.plugins?.marglow);
  }, vault, { timeout: 25000 });
  assert.equal(await page.evaluate(() => app.vault.adapter.basePath), vault);
  const button = page.getByRole("button", { name: labels });
  if (await button.isVisible()) {
    await button.click();
    console.log("Approved the verified Marglow build in the isolated test Vault.");
  }
  await page.waitForFunction(expected => window.app?.vault?.adapter?.basePath === expected && app.workspace?.layoutReady && !!app.plugins?.plugins?.marglow, vault, { timeout: 25000 });
}
