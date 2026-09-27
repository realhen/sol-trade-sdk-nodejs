/** Keyless Meteora DLMM exact-input swaps. RPC preparation is separate from quote/build.
 *
 * State is a caller-owned snapshot, not a subscription. Refresh before trading: bins,
 * volatility, clock epoch and transfer-fee schedules can change. Quotes use explicit
 * chain time; no machine-clock fallback, signing or submission occurs.
 */
import BN from 'bn.js';
import { type Connection, PublicKey, type TransactionInstruction } from '@solana/web3.js';
import { ExtensionType, getExtensionTypes, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import DLMM, {
  deriveBinArray, deriveEventAuthority, findNextBinArrayIndexWithLiquidity,
  getBinArrayLowerUpperBinId, MEMO_PROGRAM_ID, type BinArrayAccount,
} from '@meteora-ag/dlmm';

import { quoteAtChainTime } from './meteora-dlmm-quote';

export const PROGRAM_ID = new PublicKey('LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo');
const U64_MAX = (1n << 64n) - 1n;

export interface ChainTime {
  readonly unixTimestampSeconds: bigint;
  readonly epoch: bigint;
}

export interface QuoteOptions {
  /** A coherent chain clock, with timestamp and epoch together. Defaults to the
   * prepared snapshot clock. A later clock projects fees on the same cached state;
   * it does not refresh liquidity or mint transfer-fee configuration.
   */
  readonly chainTime?: ChainTime;
}

export interface SnapshotFreshnessPolicy {
  /** Trusted chain time or an explicitly chosen external reference, never inferred. */
  readonly currentUnixTimestampSeconds: bigint;
  readonly maxAgeSeconds: bigint;
  /** Allowed snapshot lead over reference time; defaults to zero. */
  readonly maxFutureSkewSeconds?: bigint;
}

export interface PreparedPool {
  readonly pool: PublicKey;
  readonly tokenXMint: PublicKey;
  readonly tokenYMint: PublicKey;
  readonly tokenXProgram: PublicKey;
  readonly tokenYProgram: PublicKey;
  /** Informational local receipt time; never used by quote or freshness validation. */
  readonly preparedAtMs: number;
  readonly chainTime: ChainTime;
  /** Official public-account snapshot. Do not mutate while quoting/building. */
  readonly client: DLMM;
  readonly binArrays: readonly BinArrayAccount[];
}

export interface SwapQuote {
  readonly chainTime: ChainTime;
  readonly pool: PublicKey;
  readonly inputMint: PublicKey;
  readonly outputMint: PublicKey;
  readonly amountIn: bigint;
  /** Net output after any mint transfer fee. */
  readonly amountOut: bigint;
  readonly minimumAmountOut: bigint;
  readonly fee: bigint;
  readonly protocolFee: bigint;
  readonly binArrays: readonly PublicKey[];
}

export interface BuildSwapParams {
  readonly quote: SwapQuote;
  readonly owner: PublicKey;
  /** Existing token accounts; native SOL must be wrapped separately by the caller. */
  readonly inputTokenAccount: PublicKey;
  readonly outputTokenAccount: PublicKey;
  /** Explicit protection, at least the quote's slippage-adjusted minimum. */
  readonly minimumAmountOut: bigint;
}

const quoteSources = new WeakMap<SwapQuote, PreparedPool>();

function u64(value: bigint, name: string, positive = false): void {
  if (typeof value !== 'bigint' || value < (positive ? 1n : 0n) || value > U64_MAX) {
    throw new Error(`${name} must be ${positive ? 'a positive' : 'an unsigned'} u64 bigint`);
  }
}

function safeClockValue(value: bigint, name: string): void {
  if (typeof value !== 'bigint' || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${name} must be a nonnegative safe-integer bigint for the DLMM clock`);
  }
}

function validateChainTime(time: ChainTime): void {
  safeClockValue(time.unixTimestampSeconds, 'unixTimestampSeconds');
  safeClockValue(time.epoch, 'epoch');
}

/** Explicit freshness gate for cached/streamed public state. Equality at either
 * boundary is accepted. Passing this gate does not make multi-account RPC reads
 * atomic; callers still own slot consistency. No local wall clock is consulted.
 */
export function validateSnapshotFreshness(prepared: PreparedPool, policy: SnapshotFreshnessPolicy): void {
  safeClockValue(policy.currentUnixTimestampSeconds, 'currentUnixTimestampSeconds');
  safeClockValue(policy.maxAgeSeconds, 'maxAgeSeconds');
  const skew = policy.maxFutureSkewSeconds ?? 0n;
  safeClockValue(skew, 'maxFutureSkewSeconds');
  const age = policy.currentUnixTimestampSeconds - prepared.chainTime.unixTimestampSeconds;
  if (age > policy.maxAgeSeconds) throw new Error('DLMM snapshot is stale');
  if (age < -skew) throw new Error('DLMM snapshot is in the future beyond allowed clock skew');
}

function supported(client: DLMM): void {
  if (!client.program.programId.equals(PROGRAM_ID)) throw new Error('Unsupported DLMM program');
  if (client.lbPair.status !== 0) throw new Error('DLMM pool is disabled');
  if (client.lbPair.pairType === 1) throw new Error('Permissioned DLMM pools are unsupported');
  if (![0, 2, 3].includes(client.lbPair.pairType)) throw new Error('Unsupported DLMM pair type');
  const point = client.lbPair.activationPoint;
  if (point && !point.isZero()) {
    const currentPoint = client.lbPair.activationType === 0 ? client.clock.slot :
      client.lbPair.activationType === 1 ? client.clock.unixTimestamp : undefined;
    if (!currentPoint || currentPoint.lt(point)) throw new Error('DLMM pool has not activated in this snapshot');
  }
  for (const [token, mint, reserve] of [
    [client.tokenX, client.lbPair.tokenXMint, client.lbPair.reserveX],
    [client.tokenY, client.lbPair.tokenYMint, client.lbPair.reserveY],
  ] as const) {
    if (!token.publicKey.equals(mint) || !token.mint.address.equals(mint) || !token.reserve.equals(reserve)) {
      throw new Error('DLMM token snapshot does not match pool mints/reserves');
    }
    if (!token.mint.isInitialized) throw new Error('DLMM mint is not initialized');
    if (!token.owner.equals(TOKEN_PROGRAM_ID) && !token.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      throw new Error('Unsupported DLMM token program');
    }
    if (token.transferHookAccountMetas.length) throw new Error('DLMM transfer hook mints are unsupported');
    const allowed = [ExtensionType.TransferFeeConfig, ExtensionType.MetadataPointer, ExtensionType.TokenMetadata];
    for (const extension of getExtensionTypes(token.mint.tlvData)) {
      if (!allowed.includes(extension)) throw new Error(`Unsupported DLMM mint extension: ${extension}`);
    }
  }
  if (client.tokenX.publicKey.equals(client.tokenY.publicKey)) throw new Error('DLMM pool mints must differ');
}

/** Adopt already decoded, authoritative public accounts without RPC. The caller must
 * verify account owners when decoding and keep the supplied snapshot consistent.
 */
export function prepareFromSnapshot(client: DLMM, binArrays: readonly BinArrayAccount[]): PreparedPool {
  supported(client);
  const chainTime = Object.freeze({ unixTimestampSeconds: BigInt(client.clock.unixTimestamp.toString()),
    epoch: BigInt(client.clock.epoch.toString()) });
  validateChainTime(chainTime);
  const unique = new Set<string>();
  for (const binArray of binArrays) {
    if (!binArray.account.lbPair.equals(client.pubkey)) throw new Error('DLMM bin array belongs to another pool');
    const expected = deriveBinArray(client.pubkey, binArray.account.index, PROGRAM_ID)[0];
    if (!binArray.publicKey.equals(expected)) throw new Error('Invalid DLMM bin array address');
    if (binArray.account.bins.length !== 70) throw new Error('Invalid DLMM bin array length');
    const address = binArray.publicKey.toBase58();
    if (unique.has(address)) throw new Error('Duplicate DLMM bin array');
    unique.add(address);
  }
  return Object.freeze({ pool: client.pubkey, tokenXMint: client.tokenX.publicKey,
    tokenYMint: client.tokenY.publicKey, tokenXProgram: client.tokenX.owner,
    tokenYProgram: client.tokenY.owner, preparedAtMs: Date.now(), chainTime, client,
    binArrays: Object.freeze([...binArrays]),
  });
}

/** Fetch pool/mints/clock and discover liquidity-bearing bin arrays in both directions.
 * Coverage is bounded; quote rejects an input that needs unloaded arrays.
 * RPC calls are not an atomic bank snapshot; use a consistent caller-owned feed when required.
 */
export async function prepare(connection: Connection, pool: PublicKey,
  options: { binArraysPerDirection?: number } = {}): Promise<PreparedPool> {
  const count = options.binArraysPerDirection ?? 4;
  if (!Number.isInteger(count) || count < 1 || count > 16) {
    throw new Error('binArraysPerDirection must be an integer from 1 to 16');
  }
  const poolAccount = await connection.getAccountInfo(pool);
  if (!poolAccount || !poolAccount.owner.equals(PROGRAM_ID)) throw new Error('Invalid DLMM pool account owner');
  const client = await DLMM.create(connection, pool, { skipSolWrappingOperation: true });
  supported(client);
  const addresses = new Map<string, PublicKey>();
  for (const swapForY of [true, false]) {
    let activeId = new BN(client.lbPair.activeId);
    for (let i = 0; i < count; i++) {
      const index = findNextBinArrayIndexWithLiquidity(swapForY, activeId, client.lbPair,
        client.binArrayBitmapExtension?.account ?? null);
      if (index === null) break;
      const address = deriveBinArray(pool, index, PROGRAM_ID)[0];
      addresses.set(address.toBase58(), address);
      const [lower, upper] = getBinArrayLowerUpperBinId(index);
      activeId = swapForY ? lower!.subn(1) : upper!.addn(1);
    }
  }
  const keys = [...addresses.values()];
  const accounts = keys.length ? await connection.getMultipleAccountsInfo(keys) : [];
  const arrays = accounts.map((account, index): BinArrayAccount => {
    if (!account || !account.owner.equals(PROGRAM_ID)) throw new Error('Missing or invalid DLMM bin array account');
    return { publicKey: keys[index]!, account: client.program.coder.accounts.decode('binArray', account.data) };
  });
  return prepareFromSnapshot(client, arrays);
}

/** Quote exact input in either direction using the official fee, bin and transfer-fee math.
 * Defaults to the prepared chain timestamp and epoch, regardless of machine time.
 * Use validateSnapshotFreshness explicitly before execution; offline quotes do not
 * expire implicitly. Never returns a partial fill. No RPC, signer or submission.
 */
export function quote(prepared: PreparedPool, inputMint: PublicKey, amountIn: bigint, slippageBps: number, options: QuoteOptions = {}): SwapQuote {
  u64(amountIn, 'amountIn', true);
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10000) {
    throw new Error('slippageBps must be an integer from 0 to 10000');
  }
  supported(prepared.client);
  const swapForY = inputMint.equals(prepared.tokenXMint);
  if (!swapForY && !inputMint.equals(prepared.tokenYMint)) throw new Error('Input mint is not in the DLMM pool');
  const chainTime = Object.freeze({ ...(options.chainTime ?? prepared.chainTime) });
  validateChainTime(chainTime);
  const lastUpdateTimestamp = BigInt(prepared.client.lbPair.vParameters.lastUpdateTimestamp.toString());
  if (chainTime.unixTimestampSeconds < prepared.chainTime.unixTimestampSeconds ||
      chainTime.unixTimestampSeconds < lastUpdateTimestamp) {
    throw new Error('DLMM quote timestamp predates the snapshot or volatility update; incoherent chain clock');
  }
  if (chainTime.epoch < prepared.chainTime.epoch) throw new Error('DLMM quote epoch predates the snapshot epoch');
  const raw = quoteAtChainTime(prepared.client, prepared.binArrays, new BN(amountIn.toString()),
    swapForY, slippageBps, Number(chainTime.unixTimestampSeconds), Number(chainTime.epoch));
  if (BigInt(raw.consumedInAmount.toString()) !== amountIn) {
    throw new Error('DLMM quote did not consume the full exact input (partial fill or transfer-fee rounding)');
  }
  const amountOut = BigInt(raw.outAmount.toString());
  u64(amountOut, 'amountOut', true);
  const result: SwapQuote = Object.freeze({ chainTime, pool: prepared.pool, inputMint,
    outputMint: swapForY ? prepared.tokenYMint : prepared.tokenXMint, amountIn, amountOut,
    minimumAmountOut: BigInt(raw.minOutAmount.toString()), fee: BigInt(raw.fee.toString()),
    protocolFee: BigInt(raw.protocolFee.toString()), binArrays: Object.freeze([...raw.binArraysPubkey]),
  });
  quoteSources.set(result, prepared);
  return result;
}

/** Build only the swap instruction from a quote returned for this exact prepared snapshot.
 * The supplied token accounts must exist, belong to owner, and match input/output mints.
 * ATA creation, WSOL lifecycle, compute budget, signing and submission belong to the caller.
 */
export async function buildSwapInstructions(prepared: PreparedPool, params: BuildSwapParams): Promise<TransactionInstruction[]> {
  const q = params.quote;
  if (quoteSources.get(q) !== prepared) throw new Error('Quote must be produced from this prepared DLMM snapshot');
  supported(prepared.client);
  u64(params.minimumAmountOut, 'minimumAmountOut');
  if (params.minimumAmountOut < q.minimumAmountOut || params.minimumAmountOut > q.amountOut) {
    throw new Error('minimumAmountOut must be between the quote minimum and quoted output');
  }
  if (params.inputTokenAccount.equals(params.outputTokenAccount)) throw new Error('Input and output token accounts must differ');
  const client = prepared.client;
  const instruction = await client.program.methods.swap2(
    new BN(q.amountIn.toString()), new BN(params.minimumAmountOut.toString()), { slices: [] },
  ).accountsStrict({
    lbPair: prepared.pool, binArrayBitmapExtension: client.binArrayBitmapExtension?.publicKey ?? null,
    reserveX: client.lbPair.reserveX, reserveY: client.lbPair.reserveY,
    userTokenIn: params.inputTokenAccount, userTokenOut: params.outputTokenAccount,
    tokenXMint: prepared.tokenXMint, tokenYMint: prepared.tokenYMint, oracle: client.lbPair.oracle,
    hostFeeIn: null, user: params.owner, tokenXProgram: client.tokenX.owner, tokenYProgram: client.tokenY.owner,
    memoProgram: MEMO_PROGRAM_ID, eventAuthority: deriveEventAuthority(PROGRAM_ID)[0], program: PROGRAM_ID,
  }).remainingAccounts(q.binArrays.map(pubkey => ({ pubkey, isSigner: false, isWritable: true }))).instruction();
  return [instruction];
}
