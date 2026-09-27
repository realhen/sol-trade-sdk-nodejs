import { describe, expect, it } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import bs58 from 'bs58';
import { NO_TOKEN_EXTENSION_CONTEXT, SwapUtils, WhirlpoolContext, WhirlpoolIx, ORCA_WHIRLPOOL_PROGRAM_ID } from '@orca-so/whirlpools-sdk';
import { buildSwapInstruction, quote, type Snapshot } from './orca-whirlpool';
const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
function snapshot(): Snapshot {
 const context = WhirlpoolContext.from(new Connection('http://localhost:8899'), { publicKey: key(20), signTransaction: async () => { throw Error('must not sign'); }, signAllTransactions: async () => { throw Error('must not sign'); } });
 const poolData = { tokenMintA: key(2), tokenMintB: key(3), tokenVaultA: key(4), tokenVaultB: key(5), tickCurrentIndex: 10, tickSpacing: 64, feeTierIndexSeed: [64, 0], sqrtPrice: new BN('18455969290605290427'), liquidity: new BN('1000000000000'), feeRate: 3000, protocolFeeRate: 0, feeGrowthGlobalA: new BN(0), feeGrowthGlobalB: new BN(0) };
 const arrays = (aToB: boolean) => SwapUtils.getTickArrayPublicKeys(10, 64, aToB, ORCA_WHIRLPOOL_PROGRAM_ID, key(1)).map((address, i) => ({ address, startTickIndex: aToB ? -i * 5632 : i * 5632, data: null }));
 return { pool: key(1), programId: ORCA_WHIRLPOOL_PROGRAM_ID, program: context.program, poolData, tickArraysAtoB: arrays(true), tickArraysBtoA: arrays(false), tokenExtensionCtx: NO_TOKEN_EXTENSION_CONTEXT, oracleData: null, blockTimestamp: 100 } as unknown as Snapshot;
}
describe('Whirlpool keyless exact input', () => {
 it.each([true, false])('quotes with official tick traversal and encodes swap-v2, A to B=%s', aToB => {
  const s = snapshot();
  const q = quote(s, key(aToB ? 2 : 3), 100000n, 100);
  expect(q.expectedAmountOut).toBeGreaterThan(99000n);
  expect(q.expectedAmountOut).toBeLessThan(101000n);
  expect(q.minimumAmountOut).toBe(q.expectedAmountOut * 9900n / 10000n);
  const got = buildSwapInstruction(s, q, { payer: key(10), inputTokenAccount: key(11), outputTokenAccount: key(12) });
  const expected = WhirlpoolIx.swapV2Ix(s.program, { ...q.swap, whirlpool: s.pool, tokenMintA: key(2), tokenMintB: key(3), tokenVaultA: key(4), tokenVaultB: key(5), tokenOwnerAccountA: key(aToB ? 11 : 12), tokenOwnerAccountB: key(aToB ? 12 : 11), tokenProgramA: s.tokenExtensionCtx.tokenMintWithProgramA.tokenProgram, tokenProgramB: s.tokenExtensionCtx.tokenMintWithProgramB.tokenProgram, tokenAuthority: key(10), oracle: PublicKey.findProgramAddressSync([Buffer.from('oracle'), key(1).toBuffer()], s.programId)[0] }).instructions[0];
  expect(got.data).toEqual(expected?.data);
  expect(got.keys).toEqual(expected?.keys);
 });
 it('rejects foreign mints and amount/slippage boundaries before quote math', () => {
  const s = snapshot();
  expect(() => quote(s, key(2), 100000 as unknown as bigint, 0)).toThrow(/u64/);
  expect(() => quote(s, key(99), 1n, 0)).toThrow(/mint/i);
  for (const amount of [0n, -1n, 1n << 64n]) expect(() => quote(s, key(2), amount, 0)).toThrow();
  for (const bps of [-1, 10001, 0.1, NaN]) expect(() => quote(s, key(2), 1n, bps)).toThrow();
 });
});

// Finalized Axiom CPI fixture: https://solscan.io/tx/2bMW2G1xJH5txWzXzKHahqapWabANWiV9Fq7aAQVX3DJbgmRkv5W5fGJzZyHLTjHvKRXdnDA8ku6fq4Mg4rf5d1P
it('reproduces a finalized Axiom swap-v2 instruction fixture', () => {
 const keys = ["TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", "43DziXh67pQRxF58nxQjrf7jNcYBMHraC63tVTFekMSS", "hSQxf9L7Tpwf1PKjWWSbnew2vyTPpGrfWwNa4gq2n2x", "Xsf9mBktVB9BSU5kf4nHxPq5hCBJ2j2ui3ecFGxPRGc", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "HPHnbU2qxoimk28NYW1uW1uBp2Ji89ntEt88T4jmVieq", "DYVwasvF7Vvvnx8nL9oYTYBAX1pMBt7H5sGSwLXRZhn4", "By73MSpWtgX49H3wYa8GPjsRv7GRcY8XGaKcP3VXvkva", "8T1wnPCX1Wzg7x9nyPKimxn9vFHzt6VfUCMAFcRPA24C", "76qbZMmm2SibDrH7CWmF4FdN1gVt9ic3MkQvYVNJ6q6G", "6DUqLvFPfBds8Ywa236E4XoHhGBsVEpaAiQAqWPpBRNY", "52YtdoEfU26nGV5w3K6r3xEE2WCqLrkJQvJH5oXajnEr", "6QRxFPctxatnEuNpHTYTeZoV7DvgxB7S1o5jLsTycrb5", "FMjpVcmLQBzqCZRwmJeRz4p5HiLgk8XLamrvABULtctD", "9HMAGceuaukaXTBV3roy93pWemhZii8Ax1o4R7wvPua"].map(k => new PublicKey(k));
 const data = Buffer.from(bs58.decode('7xyvrq5sWf7NVA1sMNfFApQNAvAEQnRK75Z1sJZyLBWDG7bqci3wUBEbAmGBWQX3uJ9'));
 const s = snapshot();
 s.pool = keys[4]!;
 s.poolData = { ...s.poolData, tokenMintA: keys[5]!, tokenMintB: keys[6]!, tokenVaultA: keys[8]!, tokenVaultB: keys[10]! };
 s.tokenExtensionCtx = { ...s.tokenExtensionCtx, tokenMintWithProgramA: { ...s.tokenExtensionCtx.tokenMintWithProgramA, tokenProgram: keys[0]! }, tokenMintWithProgramB: { ...s.tokenExtensionCtx.tokenMintWithProgramB, tokenProgram: keys[1]! } };
 const q = { pool: s.pool, inputMint: keys[6]!, outputMint: keys[5]!, amountIn: data.readBigUInt64LE(8), minimumAmountOut: 0n, expectedAmountOut: 1n, feeAmount: 0n, swap: { amount: new BN(data.readBigUInt64LE(8).toString()), otherAmountThreshold: new BN(0), sqrtPriceLimit: new BN(0), amountSpecifiedIsInput: true, aToB: false, tickArray0: keys[11]!, tickArray1: keys[12]!, tickArray2: keys[13]!, supplementalTickArrays: keys.slice(15) } };
 const built = buildSwapInstruction(s, q as Parameters<typeof buildSwapInstruction>[1], { payer: keys[3]!, inputTokenAccount: keys[9]!, outputTokenAccount: keys[7]! });
 expect(built.data).toEqual(data);
 expect(built.keys.map(k => k.pubkey)).toEqual(keys);
});
