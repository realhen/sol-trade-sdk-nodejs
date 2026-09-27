import { build } from "esbuild";
import { copyFile } from "node:fs/promises";
await build({
  entryPoints: ["src/router/index.ts"],
  outfile: "dist/router/browser.mjs",
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  inject: ["scripts/browser-globals.ts"],
  sourcemap: true,
  minify: true,
});
await copyFile("dist/router/index.d.mts", "dist/router/browser.d.mts");
