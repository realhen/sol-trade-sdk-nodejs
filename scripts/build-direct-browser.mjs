import { build } from "esbuild";
import { copyFile, readFile } from "node:fs/promises";
await build({
  entryPoints: ["src/direct/index.ts"],
  outfile: "dist/direct/browser.mjs",
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  inject: ["scripts/browser-globals.ts"],
  define: { "process.env.ANCHOR_BROWSER": "true" },
  sourcemap: true,
  minify: true,
  // js-sha256's Node-only acceleration uses eval(require). Keep its browser
  // implementation and remove that unreachable Node branch for extension CSP.
  plugins: [
    {
      name: "sha256-browser-only",
      setup(build) {
        build.onLoad(
          { filter: /js-sha256[\/]src[\/]sha256\.js$/ },
          async ({ path }) => ({
            contents: (await readFile(path, "utf8"))
              .replace(/var NODE_JS = [^;]+;/, "var NODE_JS = false;")
              .replace(/eval\("require\('crypto'\)"\)/g, "undefined")
              .replace(/eval\("require\('buffer'\)\.Buffer"\)/g, "undefined"),
            loader: "js",
          }),
        );
      },
    },
  ],
});
await copyFile("dist/direct/index.d.mts", "dist/direct/browser.d.mts");
