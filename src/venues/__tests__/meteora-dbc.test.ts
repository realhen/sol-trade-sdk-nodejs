import snapshot from './fixtures/meteora-dbc.json';
import { describe, expect, it } from 'vitest';
import { Connection, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { createDbcProgram, deriveDbcPoolAuthority, deriveDbcEventAuthority, DYNAMIC_BONDING_CURVE_PROGRAM_ID } from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';
import { buildSwapInstructions, quote, type PreparedPool } from '../meteora-dbc';
const pk = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
const prepared = { pool: pk(1), baseMint: pk(2), quoteMint: pk(3), baseTokenProgram: TOKEN_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID,
  virtualPool: { poolState: { baseMint: pk(2), config: pk(4), baseVault: pk(5), quoteVault: pk(6), activationPoint: new BN(0), isMigrated: 0, quoteReserve: new BN(0) } },
  config: { enableFirstSwapWithMinFee: false, poolFees: { baseFee: { baseFeeMode: 0 } }, migrationQuoteThreshold: new BN(1e9) }, currentPoint: new BN(100),
} as unknown as PreparedPool;
const args = { owner: pk(7), inputMint: pk(2), outputMint: pk(3), inputTokenAccount: pk(8), outputTokenAccount: pk(9), amountIn: 123n, minimumAmountOut: 45n };
describe('DBC keyless builder', () => {
  it.each([false, true])('matches the official instruction in both directions (%s)', async (reverse) => {
    const p = reverse ? { ...args, inputMint: pk(3), outputMint: pk(2) } : args;
    const actual = await buildSwapInstructions(prepared, p);
    const { program } = createDbcProgram(new Connection('http://localhost:8899'));
    const expected = await program.methods.swap({ amountIn: new BN(123), minimumAmountOut: new BN(45) }).accountsStrict({
      poolAuthority: deriveDbcPoolAuthority(), config: pk(4), pool: pk(1), inputTokenAccount: pk(8), outputTokenAccount: pk(9), baseVault: pk(5), quoteVault: pk(6), baseMint: pk(2), quoteMint: pk(3), payer: pk(7), tokenBaseProgram: TOKEN_PROGRAM_ID, tokenQuoteProgram: TOKEN_PROGRAM_ID, referralTokenAccount: null, eventAuthority: deriveDbcEventAuthority(), program: DYNAMIC_BONDING_CURVE_PROGRAM_ID,
    }).instruction();
    expect(actual).toEqual([expected]);
  });
  it('rejects invalid amount, pair, and slippage before quote math', () => {
    expect(() => quote(prepared, { ...args, amountIn: 0n, slippageBps: 0 })).toThrow();
    expect(() => quote(prepared, { ...args, outputMint: pk(10), slippageBps: 0 })).toThrow();
    expect(() => quote(prepared, { ...args, slippageBps: 10001 })).toThrow();
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

describe('DBC captured curve math', () => {
  const p = hydrate(snapshot) as PreparedPool;
  it.each([
    [false, 1_000_000_000_000n, 65_354n, 64_700n, 1_334n],
    [true, 1_000_000n, 14_694_982_786_537n, 14_548_032_958_671n, 20_000n],
  ])('quotes real curve state and integer slippage (%s)', (reverse, amountIn, amountOut, minimumAmountOut, feeAmount) => {
    expect(quote(p, { inputMint: reverse ? p.quoteMint : p.baseMint, outputMint: reverse ? p.baseMint : p.quoteMint, amountIn: amountIn as bigint, slippageBps: 100 })).toEqual({ amountIn, amountOut, minimumAmountOut, feeAmount });
  });
  it.each([1n, 10n, 100n])('rejects a dust input yielding zero output (%s)', amountIn => {
    expect(() => quote(p, { inputMint: p.baseMint, outputMint: p.quoteMint, amountIn, slippageBps: 0 })).toThrow('zero output');
  });
  it('keeps an explicitly permitted zero minimum at 10000 bps', () => {
    const result = quote(p, { inputMint: p.quoteMint, outputMint: p.baseMint, amountIn: 1_000_000n, slippageBps: 10000 });
    expect(result.amountOut).toBeGreaterThan(0n);
    expect(result.minimumAmountOut).toBe(0n);
  });
  it('rejects input remaining at the migration boundary instead of returning a partial fill', () => {
    expect(() => quote(p, { inputMint: p.quoteMint, outputMint: p.baseMint, amountIn: (1n << 64n) - 1n, slippageBps: 0 })).toThrow('Insufficient Liquidity');
  });
  it('rejects migrated and not-yet-active snapshots', () => {
    const args = { inputMint: p.quoteMint, outputMint: p.baseMint, amountIn: 1_000_000n, slippageBps: 0 };
    expect(() => quote({ ...p, currentPoint: p.virtualPool.poolState.activationPoint.subn(1) }, args)).toThrow('not active');
    expect(() => quote({ ...p, virtualPool: { ...p.virtualPool, poolState: { ...p.virtualPool.poolState, isMigrated: 1 } } }, args)).toThrow('migrated');
  });
});

it('adds the instructions sysvar for first-swap fee handling', () => {
  const p = { ...prepared, config: { ...prepared.config, enableFirstSwapWithMinFee: true } };
  const instruction = buildSwapInstructions(p, args)[0]!;
  expect(instruction.keys.at(-1)).toEqual({ pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false });
});
