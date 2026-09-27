import { describe, expect, it, vi } from 'vitest';
import BN from 'bn.js';
import { Buffer } from 'buffer';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TransferFeeConfigLayout, ExtensionType, unpackMint } from '@solana/spl-token';
import DLMM, { ClockLayout, createProgram, deriveBinArray, deriveEventAuthority, getQPriceFromId, MEMO_PROGRAM_ID, type BinArrayAccount, type LbPair, type TokenReserve } from '@meteora-ag/dlmm';
import { prepareFromSnapshot, quote, buildSwapInstructions, validateSnapshotFreshness } from '../meteora-dlmm';
import publicSnapshot from './fixtures/meteora-dlmm-public-snapshot.json';

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
// Synthetic public state with two adjacent arrays; all arithmetic remains the official SDK's.
function fixture(activeId = 0, indices = [-1, 0, 1]) {
  const connection = new Connection('http://127.0.0.1:8899');
  const program = createProgram(connection);
  const pool = key(1);
  const bitmap = Array.from({ length: 16 }, () => new BN(0));
  for (const i of indices) { const bit = i + 512; bitmap[Math.floor(bit / 64)]!.setn(bit % 64, true); }
  const lbPair = {
    activeId, binStep: 10, status: 0, pairType: 0, activationType: 0, activationPoint: new BN(0),
    tokenXMint: key(2), tokenYMint: key(3), reserveX: key(4), reserveY: key(5), oracle: key(6),
    parameters: { baseFactor: 100, baseFeePowerFactor: 0, filterPeriod: 30, decayPeriod: 600,
      reductionFactor: 5000, variableFeeControl: 100, maxVolatilityAccumulator: 100000,
      protocolShare: 500, functionType: 1, collectFeeMode: 0 },
    vParameters: { volatilityAccumulator: 0, volatilityReference: 0, indexReference: activeId,
      lastUpdateTimestamp: new BN(1700000000) },
    binArrayBitmap: bitmap, rewardInfos: [],
  } as unknown as LbPair;
  const token = (mint: PublicKey, reserve: PublicKey): TokenReserve => ({ publicKey: mint, reserve,
    owner: TOKEN_PROGRAM_ID, amount: 100000000n, transferHookAccountMetas: [],
    mint: { address: mint, decimals: 6, supply: 1000000000n, isInitialized: true,
      mintAuthority: null, freezeAuthority: null, tlvData: Buffer.alloc(0) },
  });
  const client = new DLMM(pool, program, lbPair, null, token(key(2), key(4)), token(key(3), key(5)), [],
    { slot: new BN(1), epoch: new BN(1), epochStartTimestamp: new BN(0),
      leaderScheduleEpoch: new BN(1), unixTimestamp: new BN(1700000000) });
  const arrays: BinArrayAccount[] = indices.map(index => ({
    publicKey: deriveBinArray(pool, new BN(index), program.programId)[0],
    account: { index: new BN(index), lbPair: pool, version: 1,
      bins: Array.from({ length: 70 }, (_, i) => ({ amountX: new BN(1000), amountY: new BN(1000),
        price: getQPriceFromId(new BN(index * 70 + i), new BN(10)),
        liquiditySupply: new BN(1000000), openOrderAmount: new BN(0), processedOrderRemainingAmount: new BN(0),
      })) } as unknown as BinArrayAccount['account'],
  }));
  return { client, arrays, prepared: prepareFromSnapshot(client, arrays), connection };
}

describe('Meteora DLMM keyless exact-input adapter', () => {
  it('is independent of a skewed local wall clock and never reads it during quote', () => {
    const f = fixture();
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    try {
      const first = quote(f.prepared, key(2), 2000n, 100);
      now.mockReturnValue(9999999999999);
      expect(quote(f.prepared, key(2), 2000n, 100)).toEqual(first);
      now.mockImplementation(() => { throw new Error('wall clock forbidden'); });
      expect(quote(f.prepared, key(2), 2000n, 100)).toEqual(first);
      expect(first.chainTime).toEqual({ unixTimestampSeconds: 1700000000n, epoch: 1n });
    } finally { now.mockRestore(); }
  });

  it('decays dynamic fees only across explicitly supplied chain times without mutating the snapshot', () => {
    const f = fixture();
    f.client.lbPair.parameters.variableFeeControl = 100000;
    f.client.lbPair.parameters.maxVolatilityAccumulator = 1000000;
    f.client.lbPair.vParameters.volatilityAccumulator = 800000;
    f.client.lbPair.vParameters.volatilityReference = 800000;
    for (const a of f.arrays) for (const b of a.account.bins) { b.amountX = new BN(1000000000); b.amountY = new BN(1000000000); }
    const evaluate = (seconds: bigint) => quote(f.prepared, key(2), 100000n, 100,
      { chainTime: { unixTimestampSeconds: 1700000000n + seconds, epoch: 1n } });
    const initial = evaluate(0n), reduced = evaluate(30n), decayed = evaluate(600n);
    // Base fee is 0.001%; variable fees are 6.4%, 1.6%, then zero.
    expect([initial.amountOut, reduced.amountOut, decayed.amountOut]).toEqual([93599n, 98399n, 99999n]);
    expect(evaluate(29n).amountOut).toBe(initial.amountOut);
    expect(evaluate(599n).amountOut).toBe(reduced.amountOut);
    expect(initial.amountOut).toBeLessThan(reduced.amountOut);
    expect(reduced.amountOut).toBeLessThan(decayed.amountOut);
    expect(evaluate(0n)).toEqual(initial);
    expect(f.client.lbPair.vParameters.volatilityReference).toBe(800000);
    expect(f.client.lbPair.vParameters.volatilityAccumulator).toBe(800000);
  });

  it('binds explicit quote clocks to the originating snapshot and copies caller overrides', async () => {
    const f = fixture();
    const chainTime = { unixTimestampSeconds: 1700000010n, epoch: 1n };
    const q = quote(f.prepared, key(2), 100n, 100, { chainTime });
    chainTime.epoch = 2n;
    expect(q.chainTime.epoch).toBe(1n);
    expect(Object.isFrozen(q.chainTime)).toBe(true);
    const params = { quote: q, owner: key(7), inputTokenAccount: key(8), outputTokenAccount: key(9),
      minimumAmountOut: q.minimumAmountOut };
    await expect(buildSwapInstructions(f.prepared, params)).resolves.toHaveLength(1);
    await expect(buildSwapInstructions(fixture().prepared, params)).rejects.toThrow(/quote/i);
    await expect(buildSwapInstructions(f.prepared, { ...params,
      quote: { ...q, chainTime: { ...q.chainTime, epoch: 2n } } })).rejects.toThrow(/quote/i);
  });

  it('rejects stale/future snapshots using explicit age and clock-skew bounds', () => {
    const f = fixture();
    const check = (now: bigint, skew = 0n) => validateSnapshotFreshness(f.prepared, {
      currentUnixTimestampSeconds: now, maxAgeSeconds: 5n, maxFutureSkewSeconds: skew,
    });
    expect(() => check(1700000005n)).not.toThrow();
    expect(() => check(1700000006n)).toThrow(/stale/i);
    expect(() => check(1699999999n)).toThrow(/future|skew/i);
    expect(() => check(1699999999n, 1n)).not.toThrow();
    expect(() => validateSnapshotFreshness(f.prepared, { currentUnixTimestampSeconds: 1700000000n, maxAgeSeconds: -1n })).toThrow();
  });

  it('rejects invalid, reversed and incoherent explicit chain clocks', () => {
    const f = fixture();
    for (const chainTime of [
      { unixTimestampSeconds: 1699999999n, epoch: 1n },
      { unixTimestampSeconds: 1700000000n, epoch: 0n },
      { unixTimestampSeconds: 1n << 60n, epoch: 1n },
      { unixTimestampSeconds: 1700000000n, epoch: 1n << 60n },
    ]) expect(() => quote(f.prepared, key(2), 100n, 100, { chainTime })).toThrow(/time|epoch|clock/i);
    f.client.lbPair.vParameters.lastUpdateTimestamp = new BN(1700000001);
    expect(() => quote(f.prepared, key(2), 100n, 100)).toThrow(/time|clock/i);
  });

  it.each([true, false])('uses explicit epochs for transfer fees, input side=%s', (inputSide) => {
    const f = fixture();
    const token = inputSide ? f.client.tokenX : f.client.tokenY;
    token.owner = TOKEN_2022_PROGRAM_ID;
    token.mint.tlvData = Buffer.alloc(4 + TransferFeeConfigLayout.span);
    token.mint.tlvData.writeUInt16LE(ExtensionType.TransferFeeConfig, 0);
    token.mint.tlvData.writeUInt16LE(TransferFeeConfigLayout.span, 2);
    TransferFeeConfigLayout.encode({ transferFeeConfigAuthority: key(20), withdrawWithheldAuthority: key(21), withheldAmount: 0n,
      olderTransferFee: { epoch: 1n, maximumFee: 1000000000n, transferFeeBasisPoints: 100 },
      newerTransferFee: { epoch: 2n, maximumFee: 1000000000n, transferFeeBasisPoints: 1000 },
    }, token.mint.tlvData.subarray(4));
    const prepared = prepareFromSnapshot(f.client, f.arrays);
    const older = quote(prepared, key(2), 1000n, 0);
    const newer = quote(prepared, key(2), 1000n, 0, { chainTime: { unixTimestampSeconds: 1700000001n, epoch: 2n } });
    expect(older.amountOut).toBe(989n);
    expect(newer.amountOut).toBe(899n);
    expect(newer.amountOut).toBeLessThan(older.amountOut);
    expect(older.amountIn).toBe(1000n);
    expect(newer.amountIn).toBe(1000n);
    // Clock epoch stays caller-owned; explicit projections do not mutate it.
    expect(f.client.clock.epoch.toString()).toBe('1');
  });

  it('quotes the captured public pool in both directions without RPC', () => {
    const program = createProgram(new Connection('http://127.0.0.1:1'));
    const accounts = publicSnapshot.accounts.map(account => ({ ...account,
      address: new PublicKey(account.address), owner: new PublicKey(account.owner), data: Buffer.from(account.data, 'base64'),
    }));
    const lbPair = program.coder.accounts.decode('lbPair', accounts[0]!.data) as LbPair;
    const token = (index: number, reserve: PublicKey): TokenReserve => {
      const account = accounts[index]!;
      return { publicKey: account.address, reserve, amount: 0n, owner: account.owner, transferHookAccountMetas: [],
        mint: unpackMint(account.address, { ...account, executable: false, lamports: 0, rentEpoch: 0 }, account.owner) };
    };
    const client = new DLMM(accounts[0]!.address, program, lbPair, null,
      token(1, lbPair.reserveX), token(2, lbPair.reserveY), [], ClockLayout.decode(accounts[3]!.data));
    const arrays = accounts.slice(4).map(account => ({ publicKey: account.address,
      account: program.coder.accounts.decode('binArray', account.data) as BinArrayAccount['account'] }));
    const prepared = prepareFromSnapshot(client, arrays);
    {
      const xToY = quote(prepared, client.tokenX.publicKey, 1000000n, 100);
      const yToX = quote(prepared, client.tokenY.publicKey, 1000000n, 100);
      expect(xToY.amountOut).toBe(2425n);
      expect(yToX.amountOut).toBe(337010790n);
      expect(xToY.binArrays[0]!.toBase58()).toBe('7xBUyiKNqWt8MrpsjmRMyWBwY7eqcyVVYstLSavHBk66');
      expect(xToY.minimumAmountOut).toBe(2400n);
      expect(yToX.minimumAmountOut).toBe(333640682n);
    }
  });

  it.each([true, false])('matches official quote with swapForY=%s and traverses array boundary', (swapForY) => {
    const f = fixture(swapForY ? 0 : 69);
    const official = f.client.swapQuote(new BN(2000), swapForY, new BN(50), f.arrays, false);
    const result = quote(f.prepared, swapForY ? key(2) : key(3), 2000n, 50);
    expect(result.amountOut).toBe(BigInt(official.outAmount.toString()));
    expect(result.minimumAmountOut).toBe(BigInt(official.minOutAmount.toString()));
    expect(result.binArrays.map(k => k.toBase58())).toEqual(official.binArraysPubkey.map(k => k.toBase58()));
    expect(result.binArrays.length).toBe(2);
    expect(result.outputMint.equals(swapForY ? key(3) : key(2))).toBe(true);
  });

  it('rejects partial fill when cached bin coverage is exhausted', () => {
    const f = fixture(0, [0]);
    expect(() => quote(f.prepared, key(2), 1000000n, 50)).toThrow(/liquidity/i);
  });

  it.each([true, false])('builds byte/account parity with official swap2 without RPC (%s)', async (swapForY) => {
    const f = fixture();
    const result = quote(f.prepared, swapForY ? key(2) : key(3), 100n, 100);
    const owner = key(7), inputTokenAccount = key(8), outputTokenAccount = key(9);
    // Strict account supply means even an unusable RPC connection cannot affect construction.
    const rpc = vi.spyOn(f.connection, 'getAccountInfo').mockRejectedValue(new Error('RPC forbidden'));
    const instructions = await buildSwapInstructions(f.prepared, {
      quote: result, owner, inputTokenAccount, outputTokenAccount, minimumAmountOut: result.minimumAmountOut,
    });
    const expected = await f.client.program.methods.swap2(new BN(100), new BN(result.minimumAmountOut.toString()), { slices: [] })
      .accountsStrict({ lbPair: key(1), binArrayBitmapExtension: null,
        reserveX: key(4), reserveY: key(5), userTokenIn: key(8), userTokenOut: key(9),
        tokenXMint: key(2), tokenYMint: key(3), oracle: key(6), hostFeeIn: null, user: key(7),
        tokenXProgram: TOKEN_PROGRAM_ID, tokenYProgram: TOKEN_PROGRAM_ID, memoProgram: MEMO_PROGRAM_ID,
        eventAuthority: deriveEventAuthority(f.client.program.programId)[0], program: f.client.program.programId,
      }).remainingAccounts(result.binArrays.map(pubkey => ({ pubkey, isSigner: false, isWritable: true }))).instruction();
    expect(instructions).toHaveLength(1);
    expect(instructions[0]!.data).toEqual(expected.data);
    expect(instructions[0]!.keys).toEqual(expected.keys);
    expect(instructions[0]!.keys[4]!.pubkey.equals(inputTokenAccount)).toBe(true);
    expect(instructions[0]!.keys[5]!.pubkey.equals(outputTokenAccount)).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('validates bounds, mints, disabled pools and quote binding', async () => {
    const f = fixture();
    for (const n of [0n, -1n, 1n << 64n]) expect(() => quote(f.prepared, key(2), n, 10)).toThrow(/u64/i);
    for (const bps of [-1, 10001, 0.5, NaN]) expect(() => quote(f.prepared, key(2), 100n, bps)).toThrow(/slippage/i);
    expect(() => quote(f.prepared, key(25), 100n, 10)).toThrow(/mint/i);
    const result = quote(f.prepared, key(2), 100n, 10);
    await expect(buildSwapInstructions(f.prepared, { quote: { ...result, amountIn: 1000n }, owner: key(7),
      inputTokenAccount: key(8), outputTokenAccount: key(9), minimumAmountOut: 1n })).rejects.toThrow(/quote/i);
    f.client.lbPair.status = 1;
    expect(() => quote(f.prepared, key(2), 100n, 10)).toThrow(/disabled/i);
  });

  it('rejects foreign bins and transfer hook mints', () => {
    const f = fixture();
    f.arrays[0]!.account.lbPair = key(28);
    expect(() => prepareFromSnapshot(f.client, f.arrays)).toThrow(/bin.*pool/i);
    f.client.tokenX.transferHookAccountMetas = [{ pubkey: key(29), isSigner: false, isWritable: false }];
    expect(() => prepareFromSnapshot(f.client, [])).toThrow(/transfer hook/i);
  });
});
