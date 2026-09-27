import { AmmImpl, CURVE_TYPE_ACCOUNTS, PROGRAM_ID } from '@meteora-ag/dynamic-amm-sdk';
import snapshot from './fixtures/meteora-damm-v1.json';
import { describe, expect, it, vi } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { createDammV1Program, VAULT_PROGRAM_ID } from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';
import { buildSwapInstructions, prepare, quote, type PreparedPool } from '../meteora-damm-v1';
const pk = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
const client = { address: pk(1), poolState: { tokenAMint: pk(2), tokenBMint: pk(3), aVault: pk(4), bVault: pk(5), aVaultLp: pk(6), bVaultLp: pk(7), protocolTokenAFee: pk(8), protocolTokenBFee: pk(9), enabled: true }, vaultA: { vaultState: { tokenVault: pk(10), lpMint: pk(11) } }, vaultB: { vaultState: { tokenVault: pk(12), lpMint: pk(13) } } };
const prepared = { pool: pk(1), baseMint: pk(2), quoteMint: pk(3), client, remainingAccounts: [] } as unknown as PreparedPool;
const args = { owner: pk(14), inputMint: pk(2), outputMint: pk(3), inputTokenAccount: pk(15), outputTokenAccount: pk(16), amountIn: 123n, minimumAmountOut: 45n };
describe('DAMM v1 keyless builder', () => {
  it.each([false, true])('matches the official instruction in both directions (%s)', async (reverse) => {
    const p = reverse ? { ...args, inputMint: pk(3), outputMint: pk(2) } : args;
    const actual = buildSwapInstructions(prepared, p);
    const program = createDammV1Program(new Connection('http://localhost:8899'));
    const expected = await program.methods.swap(new BN(123), new BN(45)).accountsStrict({
      pool: pk(1), userSourceToken: pk(15), userDestinationToken: pk(16), aVault: pk(4), bVault: pk(5), aTokenVault: pk(10), bTokenVault: pk(12), aVaultLpMint: pk(11), bVaultLpMint: pk(13), aVaultLp: pk(6), bVaultLp: pk(7), protocolTokenFee: reverse ? pk(9) : pk(8), user: pk(14), vaultProgram: VAULT_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
    }).instruction();
    expect(actual).toEqual([expected]);
  });
  it('rejects wrong pair and invalid u64 input', () => {
    expect(() => buildSwapInstructions(prepared, { ...args, outputMint: pk(20) })).toThrow();
    expect(() => buildSwapInstructions(prepared, { ...args, amountIn: 1n << 64n })).toThrow();
    expect(() => quote(prepared, { ...args, slippageBps: -1 })).toThrow();
  });
});

// Public mainnet-derived state read from a local Surfpool fork on 2026-09-27.
// Tagged fields preserve exact integer widths without unsafe JSON number conversion.
function hydrate(value: unknown): any {
  if (Array.isArray(value)) return value.map(hydrate);
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.bn === 'string') return new BN(v.bn);
    if (typeof v.publicKey === 'string') return new PublicKey(v.publicKey);
    if (typeof v.buffer === 'string') return Buffer.from(v.buffer, 'base64');
    return Object.fromEntries(Object.entries(v).map(([key, child]) => [key, hydrate(child)]));
  }
  return value;
}

describe('DAMM v1 captured vault-share math', () => {
  const raw = hydrate(snapshot);
  raw.client.depegAccounts = new Map(raw.client.depegAccounts);
  const p: PreparedPool = { ...raw, client: Object.assign(Object.create(AmmImpl.prototype), raw.client) };
  it.each([
    [false, 1_000_000_000_000n, 6_484_107_215n, 6_419_266_142n],
    [true, 1_000_000n, 153_116_821n, 151_585_652n],
  ])('quotes real vault state and integer slippage (%s)', (reverse, amountIn, amountOut, minimumAmountOut) => {
    const result = quote(p, { inputMint: reverse ? p.quoteMint : p.baseMint, outputMint: reverse ? p.baseMint : p.quoteMint, amountIn: amountIn as bigint, slippageBps: 100 });
    expect(result).toMatchObject({ amountIn, amountOut, minimumAmountOut, feeAmount: (amountIn as bigint) * 3n / 1000n });
  });
  it.each([1n, 10n, 100n])('rejects a dust input yielding zero output (%s)', amountIn => {
    expect(() => quote(p, { inputMint: p.baseMint, outputMint: p.quoteMint, amountIn, slippageBps: 0 })).toThrow();
  });
  it('keeps an explicitly permitted zero minimum at 10000 bps', () => {
    const result = quote(p, { inputMint: p.quoteMint, outputMint: p.baseMint, amountIn: 1_000_000n, slippageBps: 10000 });
    expect(result.amountOut).toBeGreaterThan(0n);
    expect(result.minimumAmountOut).toBe(0n);
  });
  it('uses stable-curve math in both directions without RPC', () => {
    const client = Object.assign(Object.create(AmmImpl.prototype), raw.client, { poolState: { ...raw.client.poolState, curveType: { stable: { amp: new BN(100), tokenMultiplier: { tokenAMultiplier: new BN(1), tokenBMultiplier: new BN(1), precisionFactor: 9 }, depeg: { depegType: { none: {} }, baseVirtualPrice: new BN(1_000_000), baseCacheUpdated: new BN(0) } } } } });
    const stable = { ...p, client };
    for (const reverse of [false, true]) {
      const result = quote(stable, { inputMint: reverse ? p.quoteMint : p.baseMint, outputMint: reverse ? p.baseMint : p.quoteMint, amountIn: 1_000_000n, slippageBps: 25 });
      expect(result.amountOut).toBeGreaterThan(0n);
      expect(result.minimumAmountOut).toBe(result.amountOut * 9975n / 10000n);
    }
  });
});

it('prepares stable/depeg remaining accounts and preserves them on warm builds', async () => {
  const stableClient = { ...client, poolState: { ...client.poolState, stake: pk(25), curveType: { stable: { amp: new BN(100), tokenMultiplier: { tokenAMultiplier: new BN(1), tokenBMultiplier: new BN(1), precisionFactor: 9 }, depeg: { depegType: { marinade: {} } } } } } };
  const create = vi.spyOn(AmmImpl, 'create').mockResolvedValue(stableClient as unknown as AmmImpl);
  const connection = new Connection('http://localhost:8899');
  const fetch = vi.spyOn(connection, 'getAccountInfo').mockResolvedValue({ owner: new PublicKey(PROGRAM_ID), data: Buffer.alloc(0), executable: false, lamports: 0 });
  try {
    const p = await prepare(connection, pk(1));
    expect(p.remainingAccounts.map(m => m.pubkey.toBase58())).toEqual([CURVE_TYPE_ACCOUNTS.marinade.toBase58(), pk(25).toBase58()]);
    const callsBefore = fetch.mock.calls.length;
    expect(buildSwapInstructions(p, args)[0]!.keys.slice(-2)).toEqual(p.remainingAccounts);
    expect(fetch.mock.calls.length).toBe(callsBefore);
  } finally { create.mockRestore(); fetch.mockRestore(); }
});
