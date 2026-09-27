import { afterEach, describe, expect, it, vi } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { ExtensionType, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TransferFeeConfigLayout, TransferHookLayout, calculateEpochFee, getTransferFeeConfig } from '@solana/spl-token';
import { Percentage } from '@orca-so/common-sdk';
import bs58 from 'bs58';
import { NO_TOKEN_EXTENSION_CONTEXT, PriceMath, swapQuoteWithParams, SwapUtils, TokenExtensionUtil, WhirlpoolContext, WhirlpoolIx, ORCA_WHIRLPOOL_PROGRAM_ID } from '@orca-so/whirlpools-sdk';
import { buildSwapInstruction, prepare, quote, type Snapshot } from './orca-whirlpool';
const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
function plainMint(address: PublicKey) { return { address, decimals: 6, supply: 1000000000000n, isInitialized: true, mintAuthority: null, freezeAuthority: null, tlvData: Buffer.alloc(0), tokenProgram: TOKEN_PROGRAM_ID }; }
function extension(type: number, data: Buffer) { const header = Buffer.alloc(4); header.writeUInt16LE(type); header.writeUInt16LE(data.length, 2); return Buffer.concat([header, data]); }
function feeMint(address: PublicKey) {
 const data = Buffer.alloc(TransferFeeConfigLayout.span);
 TransferFeeConfigLayout.encode({ transferFeeConfigAuthority: key(20), withdrawWithheldAuthority: key(21), withheldAmount: 0n, olderTransferFee: { epoch: 0n, maximumFee: 50n, transferFeeBasisPoints: 100 }, newerTransferFee: { epoch: 10n, maximumFee: 100n, transferFeeBasisPoints: 200 } }, data);
 return { ...plainMint(address), tokenProgram: TOKEN_2022_PROGRAM_ID, tlvData: extension(ExtensionType.TransferFeeConfig, data) };
}
function snapshot(): Snapshot {
 const context = WhirlpoolContext.from(new Connection('http://localhost:8899'), { publicKey: key(20), signTransaction: async () => { throw Error('must not sign'); }, signAllTransactions: async () => { throw Error('must not sign'); } });
 const poolData = { tokenMintA: key(2), tokenMintB: key(3), tokenVaultA: key(4), tokenVaultB: key(5), tickCurrentIndex: 10, tickSpacing: 64, feeTierIndexSeed: [64, 0], sqrtPrice: new BN('18455969290605290427'), liquidity: new BN('1000000000000'), feeRate: 3000, protocolFeeRate: 0, feeGrowthGlobalA: new BN(0), feeGrowthGlobalB: new BN(0) };
 const arrays = (aToB: boolean) => SwapUtils.getTickArrayPublicKeys(10, 64, aToB, ORCA_WHIRLPOOL_PROGRAM_ID, key(1)).map((address, i) => ({ address, startTickIndex: aToB ? -i * 5632 : i * 5632, data: null }));
 return { pool: key(1), programId: ORCA_WHIRLPOOL_PROGRAM_ID, program: context.program, poolData, tickArraysAtoB: arrays(true), tickArraysBtoA: arrays(false), tokenExtensionCtx: { ...NO_TOKEN_EXTENSION_CONTEXT, tokenMintWithProgramA: plainMint(key(2)), tokenMintWithProgramB: plainMint(key(3)) }, oracleData: null, blockTimestamp: 100 } as unknown as Snapshot;
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
 s.tokenExtensionCtx = { ...s.tokenExtensionCtx, tokenMintWithProgramA: { ...s.tokenExtensionCtx.tokenMintWithProgramA, address: keys[5]!, tokenProgram: keys[0]! }, tokenMintWithProgramB: { ...s.tokenExtensionCtx.tokenMintWithProgramB, address: keys[6]!, tokenProgram: keys[1]! } };
 const q = { pool: s.pool, inputMint: keys[6]!, outputMint: keys[5]!, amountIn: data.readBigUInt64LE(8), minimumAmountOut: 0n, expectedAmountOut: 1n, feeAmount: 0n, swap: { amount: new BN(data.readBigUInt64LE(8).toString()), otherAmountThreshold: new BN(0), sqrtPriceLimit: new BN(0), amountSpecifiedIsInput: true, aToB: false, tickArray0: keys[11]!, tickArray1: keys[12]!, tickArray2: keys[13]!, supplementalTickArrays: keys.slice(15) } };
 const built = buildSwapInstruction(s, q as Parameters<typeof buildSwapInstruction>[1], { payer: keys[3]!, inputTokenAccount: keys[9]!, outputTokenAccount: keys[7]! });
 expect(built.data).toEqual(data);
 expect(built.keys.map(k => k.pubkey)).toEqual(keys);
});

it.each([5, 10])('applies Token-2022 input/output transfer fees at epoch %s', epoch => {
 const s = snapshot(); s.tokenExtensionCtx.currentEpoch = epoch;
 s.tokenExtensionCtx.tokenMintWithProgramA = feeMint(key(2)); s.tokenExtensionCtx.tokenMintWithProgramB = feeMint(key(3));
 for (const inputMint of [key(2), key(3)]) {
  const amount = 100000n;
  const inputFee = calculateEpochFee(getTransferFeeConfig(s.tokenExtensionCtx.tokenMintWithProgramA)!, BigInt(epoch), amount);
  const gross = quote(snapshot(), inputMint, amount - inputFee, 0).expectedAmountOut;
  const outputFee = calculateEpochFee(getTransferFeeConfig(s.tokenExtensionCtx.tokenMintWithProgramB)!, BigInt(epoch), gross);
  const q = quote(s, inputMint, amount, 37);
  expect(q.expectedAmountOut).toBe(gross - outputFee);
  expect(q.minimumAmountOut).toBe((gross - outputFee) * 9963n / 10000n);
  expect(BigInt(q.swap.transferFee.deductingFromEstimatedAmountIn.toString())).toBe(inputFee);
  expect(BigInt(q.swap.transferFee.deductedFromEstimatedAmountOut.toString())).toBe(outputFee);
 }
});
it('rejects unsupported mint features during quote and cached-quote construction', () => {
 const s = snapshot(); const q = quote(s, key(2), 100000n, 100);
 s.tokenExtensionCtx.tokenMintWithProgramA = { ...plainMint(key(2)), tokenProgram: TOKEN_2022_PROGRAM_ID, tlvData: extension(ExtensionType.NonTransferable, Buffer.alloc(0)) };
 expect(() => quote(s, key(2), 100000n, 100)).toThrow(/unsupported/i);
 expect(() => buildSwapInstruction(s, q, { payer: key(9), inputTokenAccount: key(10), outputTokenAccount: key(11) })).toThrow(/unsupported/i);
});
it('makes active-hook support conditional and requires resolved metas when building', () => {
 const s = snapshot(); const data = Buffer.alloc(TransferHookLayout.span);
 TransferHookLayout.encode({ authority: key(21), programId: key(22) }, data);
 s.tokenExtensionCtx.tokenMintWithProgramA = { ...plainMint(key(2)), tokenProgram: TOKEN_2022_PROGRAM_ID, tlvData: extension(ExtensionType.TransferHook, data) };
 const q = quote(s, key(2), 100000n, 100);
 expect(q.requiresTransferHookAccounts).toEqual({ tokenA: true, tokenB: false });
 const accounts = { payer: key(9), inputTokenAccount: key(10), outputTokenAccount: key(11) };
 expect(() => buildSwapInstruction(s, q, accounts)).toThrow(/transfer.hook accounts/i);
 const metas = [{ pubkey: key(22), isSigner: false, isWritable: false }];
 const ix = buildSwapInstruction(s, q, { ...accounts, tokenTransferHookAccountsA: metas });
 expect(ix.keys.slice(-1)).toEqual(metas);
});

it.each([true, false])('uses adaptive oracle fees without mutating the oracle, A to B=%s', aToB => {
 const s = snapshot();
 const staticQuote = quote(s, key(aToB ? 2 : 3), 100000n, 0);
 s.poolData.feeTierIndexSeed = [65, 0];
 s.oracleData = { whirlpool: s.pool, tradeEnableTimestamp: new BN(0), adaptiveFeeConstants: { filterPeriod: 10, decayPeriod: 100, reductionFactor: 5000, adaptiveFeeControlFactor: 100000, maxVolatilityAccumulator: 1000000, tickGroupSize: 64, majorSwapThresholdTicks: 64 }, adaptiveFeeVariables: { lastReferenceUpdateTimestamp: new BN(100), lastMajorSwapTimestamp: new BN(100), volatilityReference: 100000, tickGroupIndexReference: 0, volatilityAccumulator: 100000 } };
 const before = JSON.stringify(s.oracleData);
 const q = quote(s, key(aToB ? 2 : 3), 100000n, 0);
 expect(q.feeAmount).toBeGreaterThan(staticQuote.feeAmount);
 expect(q.expectedAmountOut).toBeLessThan(staticQuote.expectedAmountOut);
 expect(q.swap.estimatedFeeRateMin).toBeGreaterThan(s.poolData.feeRate);
 expect(JSON.stringify(s.oracleData)).toBe(before);
 expect(quote(s, key(aToB ? 2 : 3), 100000n, 0)).toEqual(q);
 s.oracleData = null;
 expect(() => quote(s, key(2), 100000n, 0)).toThrow(/oracle/i);
});
it.each([true, false])('crosses initialized ticks and tick-array boundaries, A to B=%s', aToB => {
 const s = snapshot();
 s.poolData.tickSpacing = 1; s.poolData.feeTierIndexSeed = [1, 0];
 s.poolData.sqrtPrice = PriceMath.tickIndexToSqrtPriceX64(10); s.poolData.liquidity = new BN(100000000);
 const arrays = [0, aToB ? -88 : 88, aToB ? -176 : 176].map((startTickIndex, arrayIndex) => ({ address: key(30 + arrayIndex), startTickIndex, data: { whirlpool: s.pool, startTickIndex, ticks: Array.from({ length: 88 }, (_, index) => ({ initialized: index % 16 === 0, liquidityNet: new BN(index % 32 === 0 ? 1000000 : -1000000), liquidityGross: new BN(1000000), feeGrowthOutsideA: new BN(0), feeGrowthOutsideB: new BN(0), rewardGrowthsOutside: [new BN(0), new BN(0), new BN(0)] })) } }));
 if (aToB) s.tickArraysAtoB = arrays; else s.tickArraysBtoA = arrays;
 const q = quote(s, key(aToB ? 2 : 3), 700000n, 100);
 expect(aToB ? q.swap.estimatedEndTickIndex < -88 : q.swap.estimatedEndTickIndex > 88).toBe(true);
 expect(q.swap.tickArray0.equals(q.swap.tickArray1)).toBe(false);
 const before = q.expectedAmountOut;
 for (const array of arrays) for (const tick of array.data.ticks) tick.liquidityNet = new BN(0);
 expect(quote(s, key(aToB ? 2 : 3), 700000n, 100).expectedAmountOut).not.toBe(before);
});
it('labels full local estimates as potentially partial execution and encodes a demonstrated partial quote', () => {
 const s = snapshot();
 const full = quote(s, key(2), 1000000000n, 10000);
 expect(full.estimatedAmountIn).toBe(full.amountIn);
 expect(full.executionMayPartiallyFill).toBe(true);
 // Protocol-semantics fixture: an explicit tighter price limit reaches a boundary
 // after part of the requested input. This is not produced by the default quote API.
 const partial = swapQuoteWithParams({ whirlpoolData: s.poolData, tokenAmount: new BN(full.amountIn.toString()), otherAmountThreshold: new BN(0), sqrtPriceLimit: s.poolData.sqrtPrice.add(full.swap.estimatedEndSqrtPrice).divn(2), aToB: true, amountSpecifiedIsInput: true, tickArrays: s.tickArraysAtoB, oracleData: null, tokenExtensionCtx: s.tokenExtensionCtx, timestampInSeconds: new BN(100) }, Percentage.fromFraction(0, 10000));
 expect(partial.estimatedAmountIn.lt(partial.amount)).toBe(true);
 expect(partial.estimatedAmountOut.gt(new BN(0))).toBe(true);
 const actualEstimate = { ...full, swap: partial, estimatedAmountIn: BigInt(partial.estimatedAmountIn.toString()), expectedAmountOut: BigInt(partial.estimatedAmountOut.toString()), minimumAmountOut: 0n };
 const ix = buildSwapInstruction(s, actualEstimate, { payer: key(9), inputTokenAccount: key(10), outputTokenAccount: key(11) });
 expect(ix.data.readBigUInt64LE(8)).toBe(full.amountIn); // maximum stays the requested amount
 expect(ix.data.readBigUInt64LE(16)).toBe(0n);
 expect(ix.data[40]).toBe(1); // exact-input mode does not encode a fill-or-kill flag
 expect(actualEstimate.executionMayPartiallyFill).toBe(true);
});

afterEach(() => vi.restoreAllMocks());
it('fails closed during RPC preparation for an unsupported mint extension', async () => {
 const s = snapshot();
 s.tokenExtensionCtx.tokenMintWithProgramA = { ...plainMint(key(2)), tokenProgram: TOKEN_2022_PROGRAM_ID, tlvData: extension(ExtensionType.NonTransferable, Buffer.alloc(0)) };
 vi.spyOn(WhirlpoolContext, 'from').mockReturnValue({ program: s.program, fetcher: { getPool: async () => s.poolData } } as any);
 vi.spyOn(SwapUtils, 'getTickArrays').mockResolvedValue(s.tickArraysAtoB);
 vi.spyOn(TokenExtensionUtil, 'buildTokenExtensionContextForPool').mockResolvedValue(s.tokenExtensionCtx);
 const connection = { getAccountInfo: async () => ({ owner: ORCA_WHIRLPOOL_PROGRAM_ID }), getSlot: async () => 1, getBlockTime: async () => s.blockTimestamp } as unknown as Connection;
 await expect(prepare(connection, s.pool)).rejects.toThrow(/unsupported.*NonTransferable/i);
});
