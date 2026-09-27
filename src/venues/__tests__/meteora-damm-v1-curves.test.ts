import { describe, expect, it } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { prepare, quote, buildSwapInstructions } from '../meteora-damm-v1';
import stable from './fixtures/meteora-damm-v1-stable-accounts.json';
import depeg from './fixtures/meteora-damm-v1-depeg-accounts.json';

type RecordedAccount = { owner: string; data: string; executable: boolean; lamports: number } | null;
function recordedConnection(accounts: Record<string, RecordedAccount>): Connection {
  const read = (key: PublicKey) => {
    const value = accounts[key.toBase58()];
    if (value === undefined) throw new Error(`Unrecorded public account ${key}`);
    return value && { ...value, owner: new PublicKey(value.owner), data: Buffer.from(value.data, 'base64') };
  };
  return Object.assign(new Connection('http://localhost:8899'), {
    getAccountInfo: async (key: PublicKey) => read(key),
    getAccountInfoAndContext: async (key: PublicKey) => ({ context: { slot: 0 }, value: read(key) }),
    getMultipleAccountsInfo: async (keys: PublicKey[]) => keys.map(read),
    getMultipleAccountsInfoAndContext: async (keys: PublicKey[]) => ({ context: { slot: 0 }, value: keys.map(read) }),
    getTokenSupply: async (key: PublicKey) => {
      const data = read(key)!.data;
      return { context: { slot: 0 }, value: { amount: data.readBigUInt64LE(36).toString(), decimals: data[44], uiAmount: null, uiAmountString: '0' } };
    },
    _rpcRequest: async (method: string) => { throw new Error(`Unexpected RPC: ${method}`); },
  });
}

describe('DAMM v1 public stable and depeg snapshots', () => {
  for (const [name, fixture] of [['stable', stable], ['marinade depeg', depeg]] as const) {
    it(`quotes both directions and constructs the ${name} account list`, async () => {
      const prepared = await prepare(recordedConnection(fixture.accounts), new PublicKey(fixture.pool));
      expect('stable' in prepared.client.poolState.curveType).toBe(true);
      expect(prepared.remainingAccounts).toHaveLength(name === 'stable' ? 0 : 1);
      if (name !== 'stable') expect(prepared.remainingAccounts[0]!.pubkey.toBase58()).toBe('8szGkuLTAux9XMgZ2vtY39jVSowEcpBfFfD8hXSEqdGC');
      for (const reverse of [false, true]) {
        const params = { inputMint: reverse ? prepared.quoteMint : prepared.baseMint, outputMint: reverse ? prepared.baseMint : prepared.quoteMint, amountIn: 100_000n, slippageBps: 100 };
        const result = quote(prepared, params);
        expect(result.amountOut.toString()).toBe(fixture.quotes[reverse ? 1 : 0]);
        const [ix] = buildSwapInstructions(prepared, { ...params, minimumAmountOut: result.minimumAmountOut, owner: PublicKey.default, inputTokenAccount: new PublicKey(new Uint8Array(32).fill(1)), outputTokenAccount: new PublicKey(new Uint8Array(32).fill(2)) });
        expect(ix!.keys).toHaveLength(15 + prepared.remainingAccounts.length);
      }
    });
  }
});
