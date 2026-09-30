import * as esbuild from "esbuild";

const options = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  loader: { ".svg": "text" },
  external: ["obsidian"],
  format: "cjs",
  platform: "browser",
  target: ["es2022", "safari16"],
  outfile: "main.js",
  logLevel: "info",
  sourcemap: process.argv.includes("--watch") ? "inline" : false,
};

if (process.argv.includes("--watch")) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  await esbuild.build(options);
}
