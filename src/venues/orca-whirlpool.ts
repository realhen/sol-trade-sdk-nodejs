/** Orca Whirlpool exact-input swaps using the official tick traversal and swap-v2 builder. */
import { Connection, PublicKey, type AccountMeta, type TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';
import { Percentage } from '@orca-so/common-sdk';
import { getTransferHook } from '@solana/spl-token';
import { IGNORE_CACHE, ORCA_WHIRLPOOL_PROGRAM_ID, PDAUtil, PoolUtil, SwapUtils, TokenExtensionUtil, WhirlpoolContext, WhirlpoolIx, swapQuoteWithParams, type OracleData, type SwapQuote, type TickArray, type TokenExtensionContextForPool, type WhirlpoolData } from '@orca-so/whirlpools-sdk';

export interface Snapshot {
  pool: PublicKey;
  programId: PublicKey;
  /** Official instruction coder, created with a wallet that cannot sign. */
  program: WhirlpoolContext['program'];
  poolData: WhirlpoolData;
  tickArraysAtoB: TickArray[];
  tickArraysBtoA: TickArray[];
  tokenExtensionCtx: TokenExtensionContextForPool;
  oracleData: OracleData | null;
  blockTimestamp: number;
}
export interface Quote {
  pool: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  amountIn: bigint;
  expectedAmountOut: bigint;
  minimumAmountOut: bigint;
  feeAmount: bigint;
  swap: SwapQuote;
}
export interface SwapAccounts {
  payer: PublicKey;
  inputTokenAccount: PublicKey;
  outputTokenAccount: PublicKey;
  minimumAmountOut?: bigint;
  /** Required for mints with enabled transfer hooks. Resolve during preparation. */
  tokenTransferHookAccountsA?: AccountMeta[];
  tokenTransferHookAccountsB?: AccountMeta[];
}
const U64_MAX = (1n << 64n) - 1n;
function u64(value: bigint, name: string, positive = false): void {
  if (typeof value !== 'bigint' || value < (positive ? 1n : 0n) || value > U64_MAX) throw new Error(`${name} must fit ${positive ? 'positive ' : ''}u64`);
}
function direction(snapshot: Snapshot, inputMint: PublicKey): boolean {
  if (inputMint.equals(snapshot.poolData.tokenMintA)) return true;
  if (inputMint.equals(snapshot.poolData.tokenMintB)) return false;
  throw new Error('Input mint is not in this Whirlpool');
}

/** Fetches both directional tick windows, transfer-fee epoch and adaptive-fee oracle. */
export async function prepare(connection: Connection, pool: PublicKey): Promise<Snapshot> {
  const account = await connection.getAccountInfo(pool);
  if (!account || !account.owner.equals(ORCA_WHIRLPOOL_PROGRAM_ID)) throw new Error('Not an Orca Whirlpool');
  const context = WhirlpoolContext.from(connection, {
    publicKey: PublicKey.default,
    signTransaction: async () => { throw new Error('Keyless adapter cannot sign'); },
    signAllTransactions: async () => { throw new Error('Keyless adapter cannot sign'); },
  });
  const poolData = await context.fetcher.getPool(pool, IGNORE_CACHE);
  if (!poolData) throw new Error('Whirlpool data unavailable');
  const [tickArraysAtoB, tickArraysBtoA, tokenExtensionCtx, oracleData, slot] = await Promise.all([
    SwapUtils.getTickArrays(poolData.tickCurrentIndex, poolData.tickSpacing, true, context.program.programId, pool, context.fetcher, IGNORE_CACHE),
    SwapUtils.getTickArrays(poolData.tickCurrentIndex, poolData.tickSpacing, false, context.program.programId, pool, context.fetcher, IGNORE_CACHE),
    TokenExtensionUtil.buildTokenExtensionContextForPool(context.fetcher, poolData.tokenMintA, poolData.tokenMintB, IGNORE_CACHE),
    PoolUtil.isInitializedWithAdaptiveFee(poolData) ? SwapUtils.getOracle(context.program.programId, pool, context.fetcher, IGNORE_CACHE) : Promise.resolve(null),
    connection.getSlot(),
  ]);
  if (PoolUtil.isInitializedWithAdaptiveFee(poolData) && !oracleData) throw new Error('Adaptive-fee oracle unavailable');
  const blockTimestamp = await connection.getBlockTime(slot);
  if (blockTimestamp === null) throw new Error('Chain timestamp unavailable');
  return { pool, programId: context.program.programId, program: context.program, poolData, tickArraysAtoB, tickArraysBtoA, tokenExtensionCtx, oracleData, blockTimestamp };
}

/** Pure quote over a prepared snapshot. Insufficient tick coverage fails rather than giving a partial fill. */
export function quote(snapshot: Snapshot, inputMint: PublicKey, amountIn: bigint, slippageBps: number): Quote {
  u64(amountIn, 'amountIn', true);
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10000) throw new Error('slippageBps must be an integer from 0 to 10000');
  const aToB = direction(snapshot, inputMint);
  const swap = swapQuoteWithParams({
    whirlpoolData: snapshot.poolData, tokenAmount: new BN(amountIn.toString()),
    otherAmountThreshold: new BN(0), sqrtPriceLimit: SwapUtils.getDefaultSqrtPriceLimit(aToB),
    aToB, amountSpecifiedIsInput: true, tickArrays: aToB ? snapshot.tickArraysAtoB : snapshot.tickArraysBtoA,
    oracleData: snapshot.oracleData, tokenExtensionCtx: snapshot.tokenExtensionCtx,
    timestampInSeconds: new BN(snapshot.blockTimestamp),
  }, Percentage.fromFraction(0, 10000));
  if (BigInt(swap.estimatedAmountIn.toString()) !== amountIn) throw new Error('Insufficient prepared liquidity to consume the full input');
  const expectedAmountOut = BigInt(swap.estimatedAmountOut.toString());
  if (expectedAmountOut <= 0n) throw new Error('Swap output rounds to zero');
  const minimumAmountOut = expectedAmountOut * BigInt(10000 - slippageBps) / 10000n;
  swap.otherAmountThreshold = new BN(minimumAmountOut.toString());
  return { pool: snapshot.pool, inputMint, outputMint: aToB ? snapshot.poolData.tokenMintB : snapshot.poolData.tokenMintA, amountIn, expectedAmountOut, minimumAmountOut, feeAmount: BigInt(swap.estimatedFeeAmount.toString()), swap };
}

/** Builds a single unsigned swap-v2 instruction; token-account setup and submission remain caller-owned. */
export function buildSwapInstruction(snapshot: Snapshot, quote: Quote, accounts: SwapAccounts): TransactionInstruction {
  if (!quote.pool.equals(snapshot.pool)) throw new Error('Quote belongs to a different pool');
  const aToB = direction(snapshot, quote.inputMint);
  const data = snapshot.poolData;
  if (!quote.outputMint.equals(aToB ? data.tokenMintB : data.tokenMintA)) throw new Error('Quote output mint mismatch');
  if (quote.swap.aToB !== aToB || !quote.swap.amountSpecifiedIsInput || BigInt(quote.swap.amount.toString()) !== quote.amountIn) throw new Error('Quote swap parameters mismatch');
  u64(quote.amountIn, 'amountIn', true);
  const minimum = accounts.minimumAmountOut ?? quote.minimumAmountOut;
  u64(minimum, 'minimumAmountOut');
  if (minimum < quote.minimumAmountOut) throw new Error('Explicit minimumAmountOut cannot weaken the quoted floor');
  const { tokenMintWithProgramA: mintA, tokenMintWithProgramB: mintB } = snapshot.tokenExtensionCtx;
  for (const [mint, metas] of [[mintA, accounts.tokenTransferHookAccountsA], [mintB, accounts.tokenTransferHookAccountsB]] as const) {
    const hook = getTransferHook(mint);
    if (hook && !hook.programId.equals(PublicKey.default) && !metas?.length) throw new Error('Transfer-hook accounts must be prepared before building');
  }
  return WhirlpoolIx.swapV2Ix(snapshot.program, {
    ...quote.swap, amount: new BN(quote.amountIn.toString()), otherAmountThreshold: new BN(minimum.toString()),
    whirlpool: snapshot.pool, tokenAuthority: accounts.payer,
    tokenMintA: data.tokenMintA, tokenMintB: data.tokenMintB, tokenVaultA: data.tokenVaultA, tokenVaultB: data.tokenVaultB,
    tokenOwnerAccountA: aToB ? accounts.inputTokenAccount : accounts.outputTokenAccount,
    tokenOwnerAccountB: aToB ? accounts.outputTokenAccount : accounts.inputTokenAccount,
    tokenProgramA: mintA.tokenProgram, tokenProgramB: mintB.tokenProgram,
    oracle: PDAUtil.getOracle(snapshot.programId, snapshot.pool).publicKey,
    tokenTransferHookAccountsA: accounts.tokenTransferHookAccountsA,
    tokenTransferHookAccountsB: accounts.tokenTransferHookAccountsB,
  }).instructions[0]!;
}
