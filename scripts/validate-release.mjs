import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const versions = JSON.parse(await readFile("versions.json", "utf8"));
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(pkg.version, manifest.version);
assert.equal(lock.version, manifest.version);
assert.equal(lock.packages[""].version, manifest.version);
assert.equal(versions[manifest.version], manifest.minAppVersion);
assert.equal(pkg.license, "MIT");
assert.match(await readFile("LICENSE", "utf8"), /MIT License/);
assert.match(manifest.id, /^[a-z0-9-]+$/);
assert.ok(!manifest.id.includes("obsidian"));
assert.ok(manifest.description.length <= 250 && manifest.description.endsWith("."));
assert.equal(typeof manifest.isDesktopOnly, "boolean");
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  assert.ok((await stat(`dist/marglow/${file}`)).size > 0);
  assert.deepEqual(await readFile(`dist/marglow/${file}`), await readFile(file));
}
assert.ok((await stat(`dist/marglow-${manifest.version}.zip`)).size > 0);
const bundle = await readFile("main.js", "utf8");
assert.ok(!/require\(["'](?:node:|fs["']|electron["']|crypto["'])/.test(bundle), "No Node/Electron runtime dependencies");
console.log(`Release ${manifest.version}: metadata, license, mobile bundle, and assets verified.`);
