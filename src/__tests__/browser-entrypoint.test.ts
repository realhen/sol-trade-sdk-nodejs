import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Bundle and initialize the entrypoint without a Node Buffer or process global. */
async function browserBundle() {
  return build({
    entryPoints: ['src/browser.ts'],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: 'TradeSdk',
    target: 'es2022',
    write: false,
    metafile: true,
  });
}

describe('browser entrypoint', () => {
  it('loads all builder namespaces without Node globals or transports', async () => {
    const result = await browserBundle();
    const context = { TextEncoder, TextDecoder, Uint8Array, console };
    const exports = runInNewContext(`${result.outputFiles[0]!.text}\nTradeSdk`, context);
    expect(exports.prepareTransactionVariants).toBeTypeOf('function');
    expect(exports.sendPreparedTransactions).toBeTypeOf('function');
    expect(exports.buildSwapTransaction).toBeTypeOf('function');
    expect(exports.swqos.ClientFactory.createClient).toBeTypeOf('function');
    const mint = exports.constants.WSOL_TOKEN_ACCOUNT;
    expect(exports.pumpfun.getBondingCurvePda(mint).toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(exports.pumpswap.closeWsol(mint).data[0]).toBe(9);
    const inputs = Object.keys(result.metafile!.inputs);
    expect(inputs.some((path) => /src\/(rpc|trading|nonce|perf)\//.test(path))).toBe(false);
    expect(inputs.some((path) => path.includes('@grpc') || path.includes('@matrixai'))).toBe(false);
    expect('Buffer' in context).toBe(false);
    expect('process' in context).toBe(false);
  });

  it('keeps existing Node exports and adds a separate browser subpath', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(manifest.main).toBe('dist/index.js');
    expect(manifest.module).toBe('dist/index.mjs');
    for (const path of ['.', './cache', './pool', './rpc', './swqos', './trading', './perf']) {
      expect(manifest.exports[path].require).toMatch(/\.js$/);
      expect(manifest.exports[path].import).toMatch(/\.mjs$/);
    }
    expect(manifest.exports['./browser']).toEqual({
      types: './dist/browser.d.mts',
      import: './dist/browser.mjs',
    });
    expect(manifest.dependencies.buffer).toBe('^6.0.3');
  });
});
