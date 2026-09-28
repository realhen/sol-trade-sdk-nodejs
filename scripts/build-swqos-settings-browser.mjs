/** Keep the transport-free ESM settings entry usable by browsers after the Node multi-entry build. */
import { build } from "esbuild";
await build({
  entryPoints: ["src/swqos-settings.ts"],
  outfile: "dist/swqos-settings.mjs",
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  sourcemap: true,
});
