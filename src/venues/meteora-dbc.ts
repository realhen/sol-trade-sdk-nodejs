/** Keyless Meteora Dynamic Bonding Curve exact-input swaps. */
import { Buffer } from 'buffer';
import BN from 'bn.js';
import { Connection, PublicKey, SYSVAR_CLOCK_PUBKEY, SYSVAR_INSTRUCTIONS_PUBKEY, TransactionInstruction } from '@solana/web3.js';
import { ExtensionType, getExtensionTypes, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, unpackMint } from '@solana/spl-token';
import { BaseFeeMode, DynamicBondingCurveClient, DYNAMIC_BONDING_CURVE_PROGRAM_ID, deriveDbcEventAuthority, deriveDbcPoolAuthority, isRateLimiterApplied, swapQuote, TradeDirection, type PoolConfig, type VirtualPool } from '@meteora-ag/dynamic-bonding-curve-sdk';

export interface PreparedPool {
  readonly pool: PublicKey;
  readonly baseMint: PublicKey;
  readonly quoteMint: PublicKey;
  readonly baseTokenProgram: PublicKey;
  readonly quoteTokenProgram: PublicKey;
  readonly virtualPool: VirtualPool;
  readonly config: PoolConfig;
  /** Slot or Unix timestamp, according to the config activation type. Refresh before reusing stale state. */
  readonly currentPoint: BN;
}
export interface QuoteParams {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amountIn: bigint;
  slippageBps: number;
}
export interface SwapParams extends Omit<QuoteParams, 'slippageBps'> {
  owner: PublicKey;
  inputTokenAccount: PublicKey;
  outputTokenAccount: PublicKey;
  minimumAmountOut: bigint;
}
const U64_MAX = (1n << 64n) - 1n;
function u64(value: bigint, name: string, positive = false): void {
  if (typeof value !== 'bigint' || value < (positive ? 1n : 0n) || value > U64_MAX) throw new Error(`${name} must be a ${positive ? 'positive ' : ''}u64 bigint`);
}
function direction(p: PreparedPool, a: Pick<QuoteParams, 'inputMint' | 'outputMint' | 'amountIn'>): boolean {
  u64(a.amountIn, 'amountIn', true);
  const forward = a.inputMint.equals(p.baseMint) && a.outputMint.equals(p.quoteMint);
  if (!forward && !(a.inputMint.equals(p.quoteMint) && a.outputMint.equals(p.baseMint))) throw new Error('Mint pair does not match DBC pool');
  if (p.virtualPool.poolState.isMigrated || p.virtualPool.poolState.quoteReserve.gte(p.config.migrationQuoteThreshold)) throw new Error('DBC pool has completed or migrated');
  if (p.currentPoint.lt(p.virtualPool.poolState.activationPoint)) throw new Error('DBC pool is not active');
  return forward;
}

/** RPC preparation only; never signs or sends. Metadata-only Token-2022 extensions are supported. */
export async function prepare(connection: Connection, pool: PublicKey): Promise<PreparedPool> {
  const account = await connection.getAccountInfo(pool, 'confirmed');
  if (!account || !account.owner.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID)) throw new Error('Invalid DBC pool owner');
  const client = new DynamicBondingCurveClient(connection, 'confirmed');
  const virtualPool = await client.state.getPool(pool);
  if (!virtualPool) throw new Error('DBC pool not found');
  const config = await client.state.getPoolConfig(virtualPool.poolState.config);
  if (!config) throw new Error('DBC config not found');
  const baseMint = virtualPool.poolState.baseMint;
  const quoteMint = config.quoteMint;
  const infos = await connection.getMultipleAccountsInfo([baseMint, quoteMint, SYSVAR_CLOCK_PUBKEY], 'confirmed');
  function tokenProgram(index: number, mint: PublicKey, tokenType: number): PublicKey {
    const info = infos[index];
    if (!info || (tokenType !== 0 && tokenType !== 1)) throw new Error('Unsupported or missing DBC mint');
    const program = tokenType === 0 ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
    const decoded = unpackMint(mint, info, program);
    if (!decoded.isInitialized) throw new Error('Uninitialized DBC mint');
    for (const extension of getExtensionTypes(decoded.tlvData)) {
      if (extension !== ExtensionType.MetadataPointer && extension !== ExtensionType.TokenMetadata) throw new Error(`Unsupported DBC mint extension: ${extension}`);
    }
    return program;
  }
  const baseTokenProgram = tokenProgram(0, baseMint, virtualPool.poolState.poolType);
  const quoteTokenProgram = tokenProgram(1, quoteMint, config.quoteTokenFlag);
  const clock = infos[2];
  if (!clock || clock.data.length < 40 || (config.activationType !== 0 && config.activationType !== 1)) throw new Error('Invalid DBC clock or activation type');
  const point = config.activationType === 0 ? clock.data.readBigUInt64LE(0) : clock.data.readBigInt64LE(32);
  return { pool, baseMint, quoteMint, baseTokenProgram, quoteTokenProgram, virtualPool, config, currentPoint: new BN(point.toString()) };
}

/**
 * Pure quote over the prepared snapshot; no referral or first-swap fee privilege is assumed.
 * feeAmount is in the output mint for OutputToken fee mode, otherwise in the pool quote mint.
 * State/clock is a snapshot: prepare again when it is stale; a quote is not an execution guarantee.
 */
export function quote(prepared: PreparedPool, params: QuoteParams) {
  if (!Number.isInteger(params.slippageBps) || params.slippageBps < 0 || params.slippageBps > 10000) throw new Error('slippageBps must be an integer from 0 to 10000');
  const forward = direction(prepared, params);
  // The official legacy exact-in quote rejects nonzero amountLeft at the migration boundary.
  // Its actualInputAmount excludes input fees, so comparing it to the gross input is incorrect.
  const result = swapQuote(prepared.virtualPool, prepared.config, forward, new BN(params.amountIn.toString()), params.slippageBps, false, prepared.currentPoint, false);
  const amountOut = BigInt(result.outputAmount.toString());
  if (amountOut <= 0n) throw new Error('DBC quote produces zero output');
  return { amountIn: params.amountIn, amountOut, minimumAmountOut: BigInt(result.minimumAmountOut.toString()), feeAmount: BigInt(result.tradingFee.add(result.protocolFee).toString()) };
}

/** Pure instruction construction. Caller creates/funds token accounts and handles WSOL lifecycle. */
export function buildSwapInstructions(prepared: PreparedPool, params: SwapParams): TransactionInstruction[] {
  const forward = direction(prepared, params);
  u64(params.minimumAmountOut, 'minimumAmountOut');
  const state = prepared.virtualPool.poolState;
  const meta = (pubkey: PublicKey, isWritable = false, isSigner = false) => ({ pubkey, isWritable, isSigner });
  const keys = [meta(deriveDbcPoolAuthority()), meta(state.config), meta(prepared.pool, true), meta(params.inputTokenAccount, true), meta(params.outputTokenAccount, true), meta(state.baseVault, true), meta(state.quoteVault, true), meta(prepared.baseMint), meta(prepared.quoteMint), meta(params.owner, false, true), meta(prepared.baseTokenProgram), meta(prepared.quoteTokenProgram), meta(DYNAMIC_BONDING_CURVE_PROGRAM_ID), meta(deriveDbcEventAuthority()), meta(DYNAMIC_BONDING_CURVE_PROGRAM_ID)];
  const fee = prepared.config.poolFees.baseFee;
  if (prepared.config.enableFirstSwapWithMinFee || (fee.baseFeeMode === BaseFeeMode.RateLimiter && isRateLimiterApplied(prepared.currentPoint, state.activationPoint, forward ? TradeDirection.BaseToQuote : TradeDirection.QuoteToBase, fee.secondFactor, fee.thirdFactor, new BN(fee.firstFactor)))) keys.push(meta(SYSVAR_INSTRUCTIONS_PUBKEY));
  const data = Buffer.alloc(24);
  data.set([248, 198, 158, 145, 225, 117, 135, 200]);
  data.writeBigUInt64LE(params.amountIn, 8);
  data.writeBigUInt64LE(params.minimumAmountOut, 16);
  return [new TransactionInstruction({ programId: DYNAMIC_BONDING_CURVE_PROGRAM_ID, keys, data })];
}
