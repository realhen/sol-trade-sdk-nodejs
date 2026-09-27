import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
const require = createRequire(import.meta.url);
const names = [
  "prepareDirectMarket",
  "discoverPoolQuoteMint",
  "quoteDirectSwap",
  "sizeDirectSellForQuoteValue",
  "buildDirectSwap",
  "normalizeDirectFill",
];
for (const sdk of [
  await import("sol-trade-sdk/direct"),
  require("sol-trade-sdk/direct"),
])
  for (const name of names) assert.equal(typeof sdk[name], "function");
const code = await readFile("dist/direct/browser.mjs", "utf8");
assert(!/\beval\s*\(/.test(code), "No eval in extension browser bundle");
const browser = await build({
  stdin: {
    contents: `export * from 'sol-trade-sdk/direct/browser'`,
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
const sdk = runInNewContext(`${browser.outputFiles[0].text}\nSdk`, context, {
  contextCodeGeneration: { strings: false, wasm: false },
});
for (const name of names) assert.equal(typeof sdk[name], "function");
assert(!("Buffer" in context) && !("process" in context));
console.log("Direct Node ESM/CJS and browser CSP entrypoints passed");
