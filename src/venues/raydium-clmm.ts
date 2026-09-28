/** Raydium CLMM exact-input swaps. Preparation reads RPC; quote/build never sign or send. */
import {
  Connection,
  PublicKey,
  type EpochInfo,
  type TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { getTransferFeeConfig, unpackMint } from "@solana/spl-token";
import { assertTokenCapabilities, type TokenMint } from "./token-capabilities";
import {
  ClmmInstrument,
  CLMM_PROGRAM_ID,
  getTransferAmountFee,
  PoolUtils,
  Raydium,
  toFeeConfig,
  type ComputeClmmPoolInfo,
  type TickArrayLayout,
} from "@raydium-io/raydium-sdk-v2";

export interface Snapshot {
  pool: PublicKey;
  poolInfo: ComputeClmmPoolInfo;
  /** Full decoded mint state is required to validate cached snapshots and fee schedules. */
  mintA: TokenMint;
  mintB: TokenMint;
  tickArrays: Record<
    string,
    ReturnType<typeof TickArrayLayout.decode> & { address: PublicKey }
  >;
  epochInfo: EpochInfo;
  /** Chain timestamp used by dynamic fees; refresh snapshots before execution. */
  blockTimestamp: number;
}
export interface Quote {
  pool: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  amountIn: bigint;
  /** Net tokens received after any Token-2022 output transfer fee. */
  expectedAmountOut: bigint;
  minimumAmountOut: bigint;
  feeAmount: bigint;
  remainingAccounts: PublicKey[];
}
export interface SwapAccounts {
  payer: PublicKey;
  inputTokenAccount: PublicKey;
  outputTokenAccount: PublicKey;
  /** Optional stricter net-output floor, in output token base units. */
  minimumAmountOut?: bigint;
}
const U64_MAX = (1n << 64n) - 1n;
function u64(value: bigint, name: string, positive = false): void {
  if (
    typeof value !== "bigint" ||
    value < (positive ? 1n : 0n) ||
    value > U64_MAX
  )
    throw new Error(`${name} must fit ${positive ? "positive " : ""}u64`);
}
function validateTokens(snapshot: Snapshot): void {
  const policy = {
    venue: "Raydium CLMM",
    transferFee: true,
    transferHook: "reject" as const,
  };
  assertTokenCapabilities(
    snapshot.mintA,
    new PublicKey(snapshot.poolInfo.mintA.address),
    policy,
  );
  assertTokenCapabilities(
    snapshot.mintB,
    new PublicKey(snapshot.poolInfo.mintB.address),
    policy,
  );
}
function available(snapshot: Snapshot): void {
  validateTokens(snapshot);
  const state = snapshot.poolInfo.accInfo;
  // PoolStatusBitIndex::Swap = 4; swap_v2 requires clock strictly after open_time.
  if ((state.status & (1 << 4)) !== 0)
    throw new Error("CLMM swaps are disabled");
  if (state.startTime.gte(new BN(snapshot.blockTimestamp)))
    throw new Error("CLMM pool is not open");
}
function direction(snapshot: Snapshot, mint: PublicKey): boolean {
  if (mint.toBase58() === snapshot.poolInfo.mintA.address) return true;
  if (mint.toBase58() === snapshot.poolInfo.mintB.address) return false;
  throw new Error("Input mint is not in this CLMM pool");
}

/** Reads pool/config/mints/bitmap/ticks through the official SDK; no owner or signer required. */
export async function prepare(
  connection: Connection,
  pool: PublicKey,
): Promise<Snapshot> {
  const account = await connection.getAccountInfo(pool);
  if (!account || !account.owner.equals(CLMM_PROGRAM_ID))
    throw new Error("Not a Raydium CLMM pool");
  const sdk = await Raydium.load({
    connection,
    disableLoadToken: true,
    disableFeatureCheck: true,
  });
  const [data, epochInfo, slot] = await Promise.all([
    sdk.clmm.getPoolInfoFromRpc(pool.toBase58()),
    connection.getEpochInfo(),
    connection.getSlot(),
  ]);
  const blockTimestamp = await connection.getBlockTime(slot);
  if (blockTimestamp === null) throw new Error("Chain timestamp unavailable");
  const tickArrays = data.tickData[pool.toBase58()];
  if (!tickArrays) throw new Error("CLMM tick arrays unavailable");
  const mints = [data.rpcPoolInfo.mintA, data.rpcPoolInfo.mintB];
  const mintAccounts = await connection.getMultipleAccountsInfo(mints);
  const decoded = mints.map((mint, index) => {
    const account = mintAccounts[index];
    if (!account) throw new Error("CLMM mint account unavailable");
    return {
      ...unpackMint(mint, account, account.owner),
      tokenProgram: account.owner,
    };
  });
  const snapshot = {
    pool,
    poolInfo: data.computePoolInfo,
    mintA: decoded[0]!,
    mintB: decoded[1]!,
    tickArrays,
    epochInfo,
    blockTimestamp,
  };
  validateTokens(snapshot);
  return snapshot;
}

/** Both directions; integer slippage applies to the net output without floating-point rounding. */
export function quote(
  snapshot: Snapshot,
  inputMint: PublicKey,
  amountIn: bigint,
  slippageBps: number,
): Quote {
  available(snapshot);
  u64(amountIn, "amountIn", true);
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10000)
    throw new Error("slippageBps must be an integer from 0 to 10000");
  const aToB = direction(snapshot, inputMint);
  const result = PoolUtils.computeAmountOut({
    // The upstream simulator updates dynamic fees and limit-order tick fields in place.
    poolInfo: {
      ...snapshot.poolInfo,
      // Derive fee schedules from validated raw mint state, not potentially stale API summaries.
      mintA: {
        ...snapshot.poolInfo.mintA,
        extensions: {
          ...snapshot.poolInfo.mintA.extensions,
          feeConfig: toFeeConfig(getTransferFeeConfig(snapshot.mintA)),
        },
      },
      mintB: {
        ...snapshot.poolInfo.mintB,
        extensions: {
          ...snapshot.poolInfo.mintB.extensions,
          feeConfig: toFeeConfig(getTransferFeeConfig(snapshot.mintB)),
        },
      },
      accInfo: snapshot.poolInfo.accInfo
        ? {
            ...snapshot.poolInfo.accInfo,
            dynamicFeeInfo: { ...snapshot.poolInfo.accInfo.dynamicFeeInfo },
          }
        : snapshot.poolInfo.accInfo,
    },
    tickarrayBitmapExtension: snapshot.poolInfo.exBitmapInfo,
    tickArrayCache: Object.fromEntries(
      Object.entries(snapshot.tickArrays).map(([key, array]) => [
        key,
        { ...array, ticks: array.ticks.map((tick) => ({ ...tick })) },
      ]),
    ),
    baseMint: inputMint,
    epochInfo: snapshot.epochInfo,
    amountIn: new BN(amountIn.toString()),
    slippage: 0,
    catchLiquidityInsufficient: false,
    blockTimestamp: snapshot.blockTimestamp,
  });
  if (!result.allTrade)
    throw new Error(
      "Insufficient prepared liquidity to consume the full input",
    );
  const expectedAmountOut = BigInt(
    result.amountOut.amount.sub(result.amountOut.fee ?? new BN(0)).toString(),
  );
  if (expectedAmountOut <= 0n) throw new Error("Swap output rounds to zero");
  const minimumAmountOut =
    (expectedAmountOut * BigInt(10000 - slippageBps)) / 10000n;
  return {
    pool: snapshot.pool,
    inputMint,
    outputMint: new PublicKey(
      aToB ? snapshot.poolInfo.mintB.address : snapshot.poolInfo.mintA.address,
    ),
    amountIn,
    expectedAmountOut,
    minimumAmountOut,
    feeAmount: BigInt(result.fee.toString()),
    remainingAccounts: result.remainingAccounts,
  };
}

/**
 * Estimates gross input for a desired net output in atomic units using cached ticks,
 * chain time and transfer-fee epoch. The caller must verify exact-input rounding with
 * quote before execution. No RPC or mutation of the prepared snapshot occurs.
 * @throws If tokens, pool availability, amounts or cached liquidity are invalid.
 */
export function quoteInputForOutput(
  snapshot: Snapshot,
  inputMint: PublicKey,
  amountOut: bigint,
): bigint | undefined {
  available(snapshot);
  u64(amountOut, "amountOut", true);
  const aToB = direction(snapshot, inputMint);
  const outputMint = new PublicKey(
    aToB ? snapshot.poolInfo.mintB.address : snapshot.poolInfo.mintA.address,
  );
  const grossOutput = getTransferAmountFee(
    new BN(amountOut.toString()),
    getTransferFeeConfig(aToB ? snapshot.mintB : snapshot.mintA) ?? undefined,
    snapshot.epochInfo,
    true,
  ).amount;
  u64(BigInt(grossOutput.toString()), "gross output", true);
  const result = PoolUtils.getInputAmountAndRemainAccounts(
    {
      ...snapshot.poolInfo,
      accInfo: {
        ...snapshot.poolInfo.accInfo,
        dynamicFeeInfo: { ...snapshot.poolInfo.accInfo.dynamicFeeInfo },
      },
    },
    snapshot.poolInfo.exBitmapInfo,
    Object.fromEntries(
      Object.values(snapshot.tickArrays).map((array) => [
        array.address.toBase58(),
        { ...array, ticks: array.ticks.map((tick) => ({ ...tick })) },
      ]),
    ),
    outputMint,
    grossOutput,
    snapshot.blockTimestamp,
  );
  if (!result.allTrade)
    throw new Error(
      "Insufficient prepared liquidity to produce the full output",
    );
  const grossInput = getTransferAmountFee(
    result.expectedAmountIn,
    getTransferFeeConfig(aToB ? snapshot.mintA : snapshot.mintB) ?? undefined,
    snapshot.epochInfo,
    true,
  ).amount;
  const amountIn = BigInt(grossInput.toString());
  u64(amountIn, "amountIn", true);
  return amountIn;
}

/**
 * Builds only swap_v2. The zero sqrt-price limit preserves CLMM's on-chain full-input
 * check; changed state may fail instead of settling the quoted amount. Caller owns
 * token-account setup, signing and submission.
 */
export function buildSwapInstruction(
  snapshot: Snapshot,
  swap: Quote,
  accounts: SwapAccounts,
): TransactionInstruction {
  available(snapshot);
  if (!swap.pool.equals(snapshot.pool))
    throw new Error("Quote belongs to a different pool");
  const aToB = direction(snapshot, swap.inputMint);
  const pool = snapshot.poolInfo;
  if (
    swap.outputMint.toBase58() !==
    (aToB ? pool.mintB.address : pool.mintA.address)
  )
    throw new Error("Quote output mint mismatch");
  u64(swap.amountIn, "amountIn", true);
  const minimum = accounts.minimumAmountOut ?? swap.minimumAmountOut;
  u64(minimum, "minimumAmountOut");
  if (minimum < swap.minimumAmountOut)
    throw new Error("Explicit minimumAmountOut cannot weaken the quoted floor");
  if (swap.remainingAccounts.length === 0)
    throw new Error("Missing CLMM tick array accounts");
  return ClmmInstrument.swapV2Instruction(
    pool.programId,
    accounts.payer,
    snapshot.pool,
    pool.ammConfig.id,
    accounts.inputTokenAccount,
    accounts.outputTokenAccount,
    aToB ? pool.vaultA : pool.vaultB,
    aToB ? pool.vaultB : pool.vaultA,
    swap.inputMint,
    swap.outputMint,
    swap.remainingAccounts,
    pool.observationId,
    new BN(swap.amountIn.toString()),
    new BN(minimum.toString()),
    new BN(0),
    true,
    pool.exBitmapAccount,
  );
}
