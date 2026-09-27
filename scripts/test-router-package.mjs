/** Validate published routing entrypoints in Node and an extension-like CSP context. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
const require = createRequire(import.meta.url);
const names = [
  "prepareJupiterRoute",
  "prepareJupiterSellForSolValue",
  "prepareJupiterSellForQuoteValue",
  "discoverPoolQuoteMint",
  "assertRouterTradeFresh",
  "normalizeJupiterFill",
];
for (const sdk of [
  await import("sol-trade-sdk/router"),
  require("sol-trade-sdk/router"),
  (await import("sol-trade-sdk")).router,
  require("sol-trade-sdk").router,
]) {
  for (const name of names) assert.equal(typeof sdk[name], "function", name);
}
const bundle = await build({
  stdin: {
    contents: `export * from 'sol-trade-sdk/router/browser'; export { isSenderTipAddress } from 'sol-trade-sdk/swqos-settings'`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "Sdk",
  write: false,
});
const context = {
  console,
  structuredClone,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  setTimeout,
  clearTimeout,
};
context.self = context;
const sdk = runInNewContext(`${bundle.outputFiles[0].text}\nSdk`, context, {
  contextCodeGeneration: { strings: false, wasm: false },
});
for (const name of names) assert.equal(typeof sdk[name], "function", name);
assert.equal(sdk.isSenderTipAddress("11111111111111111111111111111111"), true);
assert.throws(() => sdk.normalizeJupiterFill({}, {}));
assert(
  !("Buffer" in context) && !("process" in context),
  "Routing entrypoint must not mutate browser globals",
);
console.log("Router CJS, ESM, root and browser CSP entrypoints passed.");
