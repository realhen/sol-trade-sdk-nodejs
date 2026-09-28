import { defineConfig } from "tsup";

export default defineConfig({
  // Upstream DLMM ESM imports an Anchor directory, invalid in native Node ESM.
  // Resolve/bundle that dependency at publish time; do not patch node_modules.
  noExternal: [
    "@meteora-ag/dlmm",
    /^@pump-fun\//,
    /^@coral-xyz\/anchor/,
    /^@coral-xyz\/borsh/,
  ],
  esbuildOptions(options) {
    if (options.platform === "node") options.mainFields = ["main", "module"];
    if (options.platform === "node" && options.format === "esm") {
      options.banner = {
        js: "import { createRequire as __sdkCreateRequire } from 'node:module'; const require = __sdkCreateRequire(import.meta.url);",
      };
    }
  },
});
