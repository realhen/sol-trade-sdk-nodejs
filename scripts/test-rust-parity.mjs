/** Executable Rust-vs-built-Node instruction differential. No RPC, signing, or sends.
 * Rust requires caller-supplied min-out: this is builder parity, NOT quote parity.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import provenance from './rust-parity/verify-source.mjs';
const require = createRequire(import.meta.url);
const { PublicKey, Connection } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');
const BN = require('bn.js');
const { CLMM_PROGRAM_ID } = require('@raydium-io/raydium-sdk-v2');
const { WhirlpoolContext, ORCA_WHIRLPOOL_PROGRAM_ID, NO_TOKEN_EXTENSION_CONTEXT } = require('@orca-so/whirlpools-sdk');
const dlmm = require('@meteora-ag/dlmm');
const DLMM = dlmm.default ?? dlmm;
const cargoArgs = ['run', '--locked', '--offline', '--quiet', '--manifest-path', fileURLToPath(new URL('./rust-parity/Cargo.toml', import.meta.url))];
const result = spawnSync('cargo', cargoArgs, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
assert.equal(result.status, 0, `Rust harness failed: ${result.error ?? ''}\n${result.stderr}\nRun cargo fetch --locked --manifest-path scripts/rust-parity/Cargo.toml once if dependencies are uncached.`);
const vectors = JSON.parse(result.stdout);
assert.equal(vectors.length, 60);
const key = n => new PublicKey(new Uint8Array(32).fill(n));
const serialize = ix => ({ programId: ix.programId.toBase58(), keys: ix.keys.map(k => ({ pubkey: k.pubkey.toBase58(), isSigner: k.isSigner, isWritable: k.isWritable })), data: [...ix.data] });
const connection = new Connection('http://127.0.0.1:1', { fetch: async () => { throw new Error('RPC forbidden in instruction parity'); } });
const context = WhirlpoolContext.from(connection, { publicKey: key(10), signTransaction: async () => { throw Error('Signing forbidden'); }, signAllTransactions: async () => { throw Error('Signing forbidden'); } });
const dlmmProgram = dlmm.createProgram(connection);
const token = (mint, reserve, owner) => ({ publicKey: mint, reserve, owner, amount: 0n, transferHookAccountMetas: [], mint: { address: mint, decimals: 6, supply: 0n, isInitialized: true, mintAuthority: null, freezeAuthority: null, tlvData: Buffer.alloc(0) } });
for (const [format, sdk] of [['CJS', require('sol-trade-sdk/venues')], ['ESM', await import('sol-trade-sdk/venues')]]) {
  const dlmmInputs = [], dlmmInstructions = [];
  for (const v of vectors) {
    const amount = BigInt(v.amount), minimum = BigInt(v.minimum);
    const ticks = Array.from({ length: v.count ?? 3 }, (_, i) => key(20 + i));
    const inputMint = key(v.forward ? 2 : 3), outputMint = key(v.forward ? 3 : 2);
    const accounts = { payer: key(10), inputTokenAccount: key(11), outputTokenAccount: key(12) };
    let instruction;
    if (v.venue === 'raydiumClmm') {
      const snapshot = { pool: key(1), poolInfo: { programId: CLMM_PROGRAM_ID, accInfo: { status: 0, startTime: new BN(0) }, mintA: { address: key(2).toBase58() }, mintB: { address: key(3).toBase58() }, vaultA: key(4), vaultB: key(5), ammConfig: { id: key(6) }, observationId: key(7), exBitmapAccount: v.bitmap ? PublicKey.findProgramAddressSync([Buffer.from('pool_tick_array_bitmap_extension'), key(1).toBuffer()], CLMM_PROGRAM_ID)[0] : undefined }, blockTimestamp: 100, mintA: { ...token(key(2), key(4), TOKEN_PROGRAM_ID).mint, tokenProgram: TOKEN_PROGRAM_ID }, mintB: { ...token(key(3), key(5), TOKEN_2022_PROGRAM_ID).mint, tokenProgram: TOKEN_2022_PROGRAM_ID } };
      instruction = sdk.raydiumClmm.buildSwapInstruction(snapshot, { pool: key(1), inputMint, outputMint, amountIn: amount, minimumAmountOut: minimum, expectedAmountOut: minimum, feeAmount: 0n, remainingAccounts: ticks }, accounts);
      // Deliberate behavioral difference: Rust high-level clmm_sqrt_limit(0)
      // chooses a nonzero full-range boundary. Node emits zero (on-chain FOK).
      // Equivalent low-level Rust configuration is zero, compared in full below.
      assert.deepEqual(v.highLevelDefaultInstruction.keys, v.instruction.keys);
      const high = Buffer.from(v.highLevelDefaultInstruction.data);
      assert.notDeepEqual([...high.subarray(24, 40)], [...instruction.data.subarray(24, 40)]);
      high.fill(0, 24, 40);
      assert.deepEqual([...high], [...instruction.data]);
    } else if (v.venue === 'orcaWhirlpool') {
      const snapshot = { pool: key(1), programId: ORCA_WHIRLPOOL_PROGRAM_ID, program: context.program, poolData: { tokenMintA: key(2), tokenMintB: key(3), tokenVaultA: key(4), tokenVaultB: key(5) }, tokenExtensionCtx: { ...NO_TOKEN_EXTENSION_CONTEXT, tokenMintWithProgramA: { ...NO_TOKEN_EXTENSION_CONTEXT.tokenMintWithProgramA, address: key(2), isInitialized: true, tokenProgram: TOKEN_PROGRAM_ID }, tokenMintWithProgramB: { ...NO_TOKEN_EXTENSION_CONTEXT.tokenMintWithProgramB, address: key(3), isInitialized: true, tokenProgram: TOKEN_2022_PROGRAM_ID } } };
      instruction = sdk.orcaWhirlpool.buildSwapInstruction(snapshot, { pool: key(1), inputMint, outputMint, amountIn: amount, minimumAmountOut: minimum, expectedAmountOut: minimum, estimatedAmountIn: amount, executionMayPartiallyFill: true, requiresTransferHookAccounts: { tokenA: false, tokenB: false }, feeAmount: 0n, swap: { amount: new BN(v.amount), otherAmountThreshold: new BN(v.minimum), sqrtPriceLimit: new BN(v.sqrt), amountSpecifiedIsInput: true, aToB: v.forward, tickArray0: ticks[0], tickArray1: ticks[1], tickArray2: ticks[2] } }, accounts);
    } else {
      const indices = Array.from({ length: v.count }, (_, i) => v.forward ? -i : i);
      const bitmap = Array.from({ length: 16 }, () => new BN(0));
      for (const index of indices) { const bit = index + 512; bitmap[Math.floor(bit / 64)].setn(bit % 64, true); }
      const pool = { activeId: 0, binStep: 1, status: 0, pairType: 0, activationPoint: new BN(0), tokenXMint: key(2), tokenYMint: key(3), reserveX: key(4), reserveY: key(5), oracle: key(7), binArrayBitmap: bitmap, rewardInfos: [],
        parameters: { baseFactor: 0, baseFeePowerFactor: 0, filterPeriod: 30, decayPeriod: 600, reductionFactor: 5000, variableFeeControl: 0, maxVolatilityAccumulator: 100000, protocolShare: 0, functionType: 1, collectFeeMode: 0 },
        vParameters: { volatilityAccumulator: 0, volatilityReference: 0, indexReference: 0, lastUpdateTimestamp: new BN(100) } };
      const arrays = indices.map((index, position) => ({ publicKey: dlmm.deriveBinArray(key(1), new BN(index), dlmmProgram.programId)[0], account: { index: new BN(index), lbPair: key(1), version: 1,
        bins: Array.from({ length: 70 }, (_, offset) => {
          const liquid = offset === 0;
          const reserve = !liquid ? 0n : position === indices.length - 1 ? (1n << 64n) - 1n : amount > 4n ? amount / 4n : 1n;
          return { amountX: new BN(reserve.toString()), amountY: new BN(reserve.toString()), price: dlmm.getQPriceFromId(new BN(index * 70 + offset), new BN(1)), liquiditySupply: new BN(1), openOrderAmount: new BN(0), processedOrderRemainingAmount: new BN(0) };
        }) } }));
      const clock = { slot: new BN(1), epoch: new BN(1), epochStartTimestamp: new BN(0), leaderScheduleEpoch: new BN(1), unixTimestamp: new BN(100) };
      const client = new DLMM(key(1), dlmmProgram, pool, v.bitmap ? { publicKey: key(8), account: {} } : null, token(key(2), key(4), TOKEN_PROGRAM_ID), token(key(3), key(5), TOKEN_2022_PROGRAM_ID), [], clock);
      const prepared = sdk.meteoraDlmm.prepareFromSnapshot(client, arrays);
      const quote = sdk.meteoraDlmm.quote(prepared, inputMint, amount, 10000);
      assert.equal(quote.binArrays.length, amount === 1n ? 1 : v.count, 'Real bin traversal must cover the requested vector');
      const floor = minimum > quote.amountOut ? quote.amountOut : minimum;
      [instruction] = await sdk.meteoraDlmm.buildSwapInstructions(prepared, { quote, owner: key(10), inputTokenAccount: key(v.forward ? 11 : 12), outputTokenAccount: key(v.forward ? 12 : 11), minimumAmountOut: floor });
      // Pass only builder inputs to executable Rust, never Node-encoded bytes/metas.
      dlmmInputs.push({ forward: v.forward, bitmap: v.bitmap, amount: v.amount, minimum: floor.toString(), binArrays: quote.binArrays.map(key => key.toBase58()) });
      dlmmInstructions.push(serialize(instruction));
      continue;
    }
    assert.deepEqual(serialize(instruction), v.instruction, `${format}: ${JSON.stringify({ ...v, instruction: undefined, highLevelDefaultInstruction: undefined })}`);
  }
  const dlmmResult = spawnSync('cargo', [...cargoArgs, '--', '--dlmm-input'], { input: JSON.stringify(dlmmInputs), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  assert.equal(dlmmResult.status, 0, dlmmResult.stderr);
  assert.deepEqual(dlmmInstructions, JSON.parse(dlmmResult.stdout), `${format}: DLMM actual quotes to Rust/Node builder parity`);
}
console.log(`Rust ${provenance.commit}: ${vectors.length} vectors × built CJS/ESM passed (program, every account/flag, every byte). Instruction parity only; no Rust quote engine exists in these builders.`);
