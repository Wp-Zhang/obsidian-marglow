import { mkdir, copyFile, rm, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const directory = "dist/marglow";
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  await copyFile(file, `${directory}/${file}`);
}
console.log(`Installable plugin files: ${directory}`);
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const archive = `marglow-${manifest.version}.zip`;
await rm(`dist/${archive}`, { force: true });
execFileSync("zip", ["-q", "-r", archive, "marglow"], { cwd: "dist" });
console.log(`Plugin archive: dist/${archive}`);
