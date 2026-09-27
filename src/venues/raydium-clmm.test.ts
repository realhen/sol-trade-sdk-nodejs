import { afterEach, describe, expect, it, vi } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { ExtensionType, MintLayout, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TransferFeeConfigLayout, calculateEpochFee, getTransferFeeConfig } from '@solana/spl-token';
import bs58 from 'bs58';
import Decimal from 'decimal.js';
import { ClmmInstrument, CLMM_PROGRAM_ID, Raydium, PoolUtils, PoolInfoLayout, TickArrayLayout, TickArrayBitmapExtensionLayout, TickUtil } from '@raydium-io/raydium-sdk-v2';
import { buildSwapInstruction, prepare, quote, type Snapshot } from './raydium-clmm';
const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
function plainMint(address: PublicKey) { return { address, decimals: 6, supply: 1000000000000n, isInitialized: true, mintAuthority: null, freezeAuthority: null, tlvData: Buffer.alloc(0), tokenProgram: TOKEN_PROGRAM_ID }; }
function extension(type: number, data: Buffer) { const header = Buffer.alloc(4); header.writeUInt16LE(type); header.writeUInt16LE(data.length, 2); return Buffer.concat([header, data]); }
function feeMint(address: PublicKey) {
 const data = Buffer.alloc(TransferFeeConfigLayout.span);
 TransferFeeConfigLayout.encode({ transferFeeConfigAuthority: key(20), withdrawWithheldAuthority: key(21), withheldAmount: 0n, olderTransferFee: { epoch: 0n, maximumFee: 50n, transferFeeBasisPoints: 100 }, newerTransferFee: { epoch: 10n, maximumFee: 100n, transferFeeBasisPoints: 200 } }, data);
 return { ...plainMint(address), tokenProgram: TOKEN_2022_PROGRAM_ID, tlvData: extension(ExtensionType.TransferFeeConfig, data) };
}
const snapshot = () => ({ pool: key(1), mintA: plainMint(key(2)), mintB: plainMint(key(3)), poolInfo: { id: key(1), programId: CLMM_PROGRAM_ID, accInfo: PoolInfoLayout.decode(Buffer.alloc(PoolInfoLayout.span)), mintA: { address: key(2).toBase58() }, mintB: { address: key(3).toBase58() }, vaultA: key(4), vaultB: key(5), ammConfig: { id: key(6) }, observationId: key(7), exBitmapAccount: key(8) }, tickArrays: {}, epochInfo: { epoch: 1 }, blockTimestamp: 100 }) as unknown as Snapshot;
afterEach(() => vi.restoreAllMocks());
describe('Raydium CLMM keyless exact input', () => {
  it.each([true, false])('uses official swap-v2 accounts and bytes, A to B=%s', (aToB) => {
    const s = snapshot();
    vi.spyOn(PoolUtils, 'computeAmountOut').mockReturnValue({ allTrade: true, amountOut: { amount: new BN(900), fee: new BN(10) }, remainingAccounts: [key(9)], fee: new BN(3) } as any);
    const q = quote(s, key(aToB ? 2 : 3), 1000n, 100);
    expect(q.expectedAmountOut).toBe(890n);
    expect(q.minimumAmountOut).toBe(881n);
    const got = buildSwapInstruction(s, q, { payer: key(10), inputTokenAccount: key(11), outputTokenAccount: key(12) });
    const expected = ClmmInstrument.swapV2Instruction(CLMM_PROGRAM_ID, key(10), key(1), key(6), key(11), key(12), key(aToB ? 4 : 5), key(aToB ? 5 : 4), key(aToB ? 2 : 3), key(aToB ? 3 : 2), [key(9)], key(7), new BN(1000), new BN(881), new BN(0), true, key(8));
    expect(got.data).toEqual(expected.data);
    expect(got.keys).toEqual(expected.keys);
    expect(got.keys.filter(k => k.isSigner).map(k => k.pubkey)).toEqual([key(10)]);
  });
  it('rejects invalid amounts, slippage, foreign mints, and incomplete input consumption', () => {
    const s = snapshot();
    for (const amount of [0n, -1n, 1n << 64n]) expect(() => quote(s, key(2), amount, 0)).toThrow();
    for (const bps of [-1, 10001, 0.1, NaN]) expect(() => quote(s, key(2), 1n, bps)).toThrow();
    expect(() => quote(s, key(99), 1n, 0)).toThrow(/mint/i);
    vi.spyOn(PoolUtils, 'computeAmountOut').mockReturnValue({ allTrade: false } as any);
    expect(() => quote(s, key(2), 1n, 0)).toThrow(/liquidity|input/i);
  });
});

function mathSnapshot(): Snapshot {
 const s = snapshot();
 const accInfo = PoolInfoLayout.decode(Buffer.alloc(PoolInfoLayout.span));
 accInfo.tickSpacing = 1;
 accInfo.tickCurrent = 10;
 accInfo.sqrtPriceX64 = TickUtil.getSqrtPriceAtTick(10);
 accInfo.liquidity = new BN('1000000000000');
 accInfo.tickArrayBitmap[64] = 1;
 accInfo.dynamicFeeInfo.filterPeriod = 1;
 accInfo.dynamicFeeInfo.decayPeriod = 10;
 accInfo.dynamicFeeInfo.maxVolatilityAccumulator = 10000;
 const array = TickArrayLayout.decode(Buffer.alloc(TickArrayLayout.span));
 array.startTickIndex = 0;
 array.ticks.forEach((tick, i) => { tick.tick = i; tick.liquidityGross = new BN(1); });
 s.poolInfo = { ...s.poolInfo, accInfo, sqrtPriceX64: accInfo.sqrtPriceX64, liquidity: accInfo.liquidity, tickSpacing: 1, tickCurrent: 10, currentPrice: new Decimal('1.001000450120021'), exBitmapInfo: TickArrayBitmapExtensionLayout.decode(Buffer.alloc(TickArrayBitmapExtensionLayout.span)), mintA: { ...s.poolInfo.mintA, decimals: 6, extensions: {} }, mintB: { ...s.poolInfo.mintB, decimals: 6, extensions: {} }, ammConfig: { ...s.poolInfo.ammConfig, tradeFeeRate: 3000, protocolFeeRate: 0, fundFeeRate: 0 } };
 s.tickArrays = { '0': { ...array, address: key(9) } };
 return s;
}
it.each([true, false])('runs official CLMM concentrated math without mutating the snapshot, A to B=%s', aToB => {
 const s = mathSnapshot();
 const before = JSON.stringify(s, (_, value) => typeof value === 'bigint' ? value.toString() : value);
 const result = quote(s, key(aToB ? 2 : 3), 100000n, 100);
 expect(result.expectedAmountOut).toBeGreaterThan(99000n);
 expect(result.expectedAmountOut).toBeLessThan(101000n);
 expect(result.minimumAmountOut).toBe(result.expectedAmountOut * 9900n / 10000n);
 expect(JSON.stringify(s, (_, value) => typeof value === 'bigint' ? value.toString() : value)).toBe(before);
 expect(quote(s, key(aToB ? 2 : 3), 100000n, 100)).toEqual(result);
});
it('fails when real CLMM tick data cannot consume the full amount', () => {
 const s = mathSnapshot();
 s.tickArrays = {};
 expect(() => quote(s, key(2), 100000n, 100)).toThrow(/liquidity|input/i);
});

// Finalized Axiom CPI fixture: https://solscan.io/tx/52hsCrddCD3dZxAwNo81kHnubdRc8B83AAhD8iaVzc1pRTya9tK1aDtAuRci38ooNBb5Qc3dymKD2Mttanm3Fvuv
it('reproduces a finalized Axiom swap-v2 instruction fixture', () => {
 const keys = ["Dutv8fpU5Rt8mvb4xaJYZuoBd98nLc1RuUpTAgE4ZUm4", "E64NGkDLLCdQ2yFNPcavaKptrEgmiQaNykUuLC1Qgwyp", "3L7KbPVaAQA4UTecaGQYsm6UCq5F3sZM9zAYkxqYt63j", "WHMHV1SoLoHzmQGYKUWzm1eM71UMDpNH8J69Nq334pb", "665fQCcNWmxsUiAg71Whcyng2eApojaQZYURwnf7H5CL", "EbqkNhtHX6oNRzWuArFut7C5WXfiU2fEVEmg8rmHKsmc", "BMS7RrFtXNByMZoAAyViq4LhhUDDZBLfyY3Ni1W9iptc", "99mqK4idithnTyMAKveAN2Wo7PPA3P5VhPdSjRUy9D94", "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", "EML4Vgw36v89Csrmms7HCRVuBxAnkYq4SbijmjRprbpC", "HL1uJFMQ46gYom3CZpKdbymUicN4tXMYRqKGRB21BGyM", "2H31cGPQJHoenegpgFsHVGyjKG1e8SjXoq7FB5MnMqfY", "GTiKg1YEKgohmiRgzpoaPhzJ1MNqbdyKGo2RSChXfgoU", "FEVmRscRxD483GRTEXjsGYXboUTpz1dFznjyj4M4Jr4H"].map(k => new PublicKey(k));
 const data = Buffer.from(bs58.decode('ASCsAbe1UnEF5e1JrYuAjosqC1Y1b5dc167gAq2SVBsQh1tuJe5B4jMz'));
 const s = snapshot();
 s.pool = keys[2]!;
 s.mintA = plainMint(keys[11]!); s.mintB = plainMint(keys[12]!);
 s.poolInfo = { ...s.poolInfo, id: s.pool, mintA: { ...s.poolInfo.mintA, address: keys[11]!.toBase58() }, mintB: { ...s.poolInfo.mintB, address: keys[12]!.toBase58() }, ammConfig: { ...s.poolInfo.ammConfig, id: keys[1]! }, vaultA: keys[5]!, vaultB: keys[6]!, observationId: keys[7]!, exBitmapAccount: keys[13]! };
 const q = { pool: s.pool, inputMint: keys[11]!, outputMint: keys[12]!, amountIn: data.readBigUInt64LE(8), minimumAmountOut: 0n, expectedAmountOut: 173368137n, feeAmount: 0n, remainingAccounts: keys.slice(14) };
 const built = buildSwapInstruction(s, q, { payer: keys[0]!, inputTokenAccount: keys[3]!, outputTokenAccount: keys[4]! });
 expect(built.data).toEqual(data);
 expect(built.keys.map(k => k.pubkey)).toEqual(keys);
});


it('rejects paused or unopened pools for quotes and cached-quote builds', () => {
 const ready = mathSnapshot();
 const q = quote(ready, key(2), 100000n, 100);
 for (const unavailable of ['paused', 'opening-now', 'opening-later']) {
  const s = mathSnapshot();
  if (unavailable === 'paused') s.poolInfo.accInfo.status = 1 << 4;
  else s.poolInfo.accInfo.startTime = new BN(s.blockTimestamp + (unavailable === 'opening-later' ? 1 : 0));
  expect(() => quote(s, key(2), 100000n, 100)).toThrow(/disabled|open/i);
  expect(() => buildSwapInstruction(s, q, { payer: key(9), inputTokenAccount: key(10), outputTokenAccount: key(11) })).toThrow(/disabled|open/i);
 }
});

it.each([5, 10])('applies Token-2022 input/output fees at epoch %s from raw mint state', epoch => {
 const s = mathSnapshot();
 s.epochInfo.epoch = epoch; s.mintA = feeMint(key(2)); s.mintB = feeMint(key(3));
 for (const inputMint of [key(2), key(3)]) {
  const amount = 100000n;
  const inputFee = calculateEpochFee(getTransferFeeConfig(s.mintA)!, BigInt(epoch), amount);
  const gross = quote(mathSnapshot(), inputMint, amount - inputFee, 0).expectedAmountOut;
  const outputFee = calculateEpochFee(getTransferFeeConfig(s.mintB)!, BigInt(epoch), gross);
  const q = quote(s, inputMint, amount, 37);
  expect(q.expectedAmountOut).toBe(gross - outputFee);
  expect(q.minimumAmountOut).toBe((gross - outputFee) * 9963n / 10000n);
  const ix = buildSwapInstruction(s, q, { payer: key(9), inputTokenAccount: key(10), outputTokenAccount: key(11) });
  expect(ix.data.readBigUInt64LE(8)).toBe(amount);
  expect(ix.data.subarray(24, 40)).toEqual(Buffer.alloc(16)); // preserve CLMM on-chain full-input check
 }
});
it('rejects unsupported extensions even when handed a previously valid cached quote', () => {
 const s = mathSnapshot(); const q = quote(s, key(2), 100000n, 100);
 s.mintA = { ...s.mintA, tokenProgram: TOKEN_2022_PROGRAM_ID, tlvData: extension(ExtensionType.NonTransferable, Buffer.alloc(0)) };
 expect(() => quote(s, key(2), 100000n, 100)).toThrow(/unsupported/i);
 expect(() => buildSwapInstruction(s, q, { payer: key(9), inputTokenAccount: key(10), outputTokenAccount: key(11) })).toThrow(/unsupported/i);
});

it('fails closed during RPC preparation for an unsupported mint extension', async () => {
 const s = mathSnapshot();
 const data = Buffer.alloc(170);
 MintLayout.encode({ mintAuthorityOption: 0, mintAuthority: PublicKey.default, supply: 1000000n, decimals: 6, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default }, data);
 data[165] = 1; data.writeUInt16LE(ExtensionType.NonTransferable, 166);
 const info = { data, owner: TOKEN_2022_PROGRAM_ID, lamports: 1, executable: false, rentEpoch: 0 };
 vi.spyOn(Raydium, 'load').mockResolvedValue({ clmm: { getPoolInfoFromRpc: async () => ({ computePoolInfo: s.poolInfo, tickData: { [s.pool.toBase58()]: s.tickArrays }, rpcPoolInfo: { mintA: key(2), mintB: key(3) } }) } } as any);
 const connection = { getAccountInfo: async () => ({ owner: CLMM_PROGRAM_ID }), getEpochInfo: async () => s.epochInfo, getSlot: async () => 1, getBlockTime: async () => s.blockTimestamp, getMultipleAccountsInfo: async () => [info, info] } as unknown as Connection;
 await expect(prepare(connection, s.pool)).rejects.toThrow(/unsupported.*NonTransferable/i);
});
