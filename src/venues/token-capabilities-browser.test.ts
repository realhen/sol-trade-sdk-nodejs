import { expect, it } from 'vitest';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';
import { PublicKey } from '@solana/web3.js';
import { ExtensionType, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

it('validates native RPC Buffer metadata using the bundled browser Buffer implementation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'token-capabilities-browser-'));
  try {
    const outfile = join(directory, 'capabilities.mjs');
    await build({ entryPoints: [resolve('src/venues/token-capabilities.ts')], outfile, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, inject: [resolve('scripts/browser-globals.ts')], define: { 'process.env.ANCHOR_BROWSER': 'true' } });
    const { assertTokenCapabilities } = await import(pathToFileURL(outfile).href);
    const address = new PublicKey(new Uint8Array(32).fill(1));
    const string = (value: string) => {
      const bytes = Buffer.from(value, 'utf8');
      const length = Buffer.alloc(4); length.writeUInt32LE(bytes.length);
      return Buffer.concat([length, bytes]);
    };
    const payload = Buffer.concat([Buffer.alloc(32), address.toBuffer(), string('Équité 株式 🚀'), string('X株'), string('https://example.test/metadata.json'), Buffer.alloc(4)]);
    const header = Buffer.alloc(4); header.writeUInt16LE(ExtensionType.TokenMetadata); header.writeUInt16LE(payload.length, 2);
    const nativeBufferMint = { address, tokenProgram: TOKEN_2022_PROGRAM_ID, isInitialized: true, decimals: 6, supply: 1000000n, mintAuthority: null, freezeAuthority: null, tlvData: Buffer.concat([header, payload]) };
    const policy = { venue: 'browser regression', transferFee: true, transferHook: 'reject' };
    expect(assertTokenCapabilities(nativeBufferMint, address, policy)).toEqual({ transferFee: false, transferHookProgram: null });
    const malformed = Buffer.from(nativeBufferMint.tlvData);
    // First name byte is the start of a multi-byte sequence; force an invalid UTF-8 continuation.
    malformed[4 + 64 + 4] = 0xff;
    expect(() => assertTokenCapabilities({ ...nativeBufferMint, tlvData: malformed }, address, policy)).toThrow(/UTF-8/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);
