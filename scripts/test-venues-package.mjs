/** Verify published entrypoints, not only the TypeScript source graph. Run after build. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { Keypair, PublicKey } from '@solana/web3.js';
const require = createRequire(import.meta.url);
const names = ['raydiumClmm', 'orcaWhirlpool', 'meteoraDlmm', 'meteoraDbc', 'meteoraDammV1'];
for (const sdk of [await import('sol-trade-sdk/venues'), require('sol-trade-sdk/venues'), (await import('sol-trade-sdk')).venues, require('sol-trade-sdk').venues]) {
  for (const name of names) {
    assert.equal(typeof sdk[name].prepare, 'function');
    assert.equal(typeof sdk[name].quote, 'function');
  }
}
const browser = await build({ stdin: { contents: `export * from 'sol-trade-sdk/venues/browser'`, resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'iife', globalName: 'Sdk', write: false });
const context = { console, structuredClone, TextEncoder, TextDecoder, Uint8Array, setTimeout, clearTimeout };
context.self = context; // Browser Window and Worker both expose self.
const sdk = runInNewContext(`${browser.outputFiles[0].text}\nSdk`, context, { contextCodeGeneration: { strings: false, wasm: false } });
for (const name of names) assert.equal(typeof sdk[name].quote, 'function');
const owner = Keypair.generate().publicKey;
const tokenProgram = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const setup = sdk.prepareTokenAccounts({ owner, inputMint: new PublicKey('So11111111111111111111111111111111111111112'), outputMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), inputTokenProgram: tokenProgram, outputTokenProgram: tokenProgram, amountIn: 9007199254740993n, wrapNativeInput: true });
assert.equal(setup.setupInstructions.length, 4);
assert.equal(setup.setupInstructions[2].data.readBigUInt64LE(4), 9007199254740993n);
assert(!('Buffer' in context) && !('process' in context), 'SDK must not install host globals');
console.log('Node CJS, Node ESM, root exports, and browser-without-Node-globals passed.');
