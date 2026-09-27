import { describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Connection, PublicKey } from '@solana/web3.js';
import accounts from './fixtures/meteora-damm-v1-accounts.json';

describe('DAMM v1 bundled browser compatibility', () => {
  it('decodes native RPC buffers with the bundled browser Buffer implementation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'meteora-v1-browser-'));
    try {
      const outfile = join(directory, 'adapter.mjs');
      // Match the published browser entry's dependency bundling and lexical shims.
      await build({ entryPoints: [resolve('src/venues/meteora-damm-v1.ts')], outfile, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, inject: [resolve('scripts/browser-globals.ts')], define: { 'process.env.ANCHOR_BROWSER': 'true' } });
      const adapter = await import(pathToFileURL(outfile).href);
      const values = accounts as Record<string, { owner: string; data: string; executable: boolean; lamports: number } | null>;
      const read = (key: PublicKey) => {
        const value = values[key.toBase58()];
        if (value === undefined) throw new Error(`Unrecorded RPC account: ${key}`);
        return value && { ...value, owner: new PublicKey(value.owner), data: Buffer.from(value.data, 'base64') };
      };
      const connection = Object.assign(new Connection('http://localhost:8899'), {
        getAccountInfo: async (key: PublicKey) => read(key),
        getAccountInfoAndContext: async (key: PublicKey) => ({ context: { slot: 450902235 }, value: read(key) }),
        getMultipleAccountsInfo: async (keys: PublicKey[]) => keys.map(read),
        getMultipleAccountsInfoAndContext: async (keys: PublicKey[]) => ({ context: { slot: 450902235 }, value: keys.map(read) }),
        getTokenSupply: async (key: PublicKey) => {
          const data = read(key)!.data;
          return { context: { slot: 450902235 }, value: { amount: data.readBigUInt64LE(36).toString(), decimals: data[44], uiAmount: null, uiAmountString: '0' } };
        },
        _rpcRequest: async (method: string) => { throw new Error(`Unexpected RPC: ${method}`); },
      });
      const prepared = await adapter.prepare(connection, new PublicKey('B1AdQ85N2mJ2xtMg9bgThhsPoA6T3M26rt4TChWSiPpr'));
      for (const reverse of [false, true]) {
        const q = adapter.quote(prepared, { inputMint: reverse ? prepared.quoteMint : prepared.baseMint, outputMint: reverse ? prepared.baseMint : prepared.quoteMint, amountIn: 1_000_000n, slippageBps: 100 });
        expect(q.amountOut).toBeGreaterThan(0n);
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 20_000);
});
