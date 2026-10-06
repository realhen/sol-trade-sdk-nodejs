import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  PUMP_SDK,
  PUMP_PROGRAM_ID,
  PUMP_FEE_PROGRAM_ID,
  GLOBAL_PDA,
  PUMP_FEE_CONFIG_PDA,
  bondingCurvePda,
  canonicalPumpPoolPda,
  getBuySolAmountFromTokenAmount,
  type BondingCurve,
  type Global,
  type FeeConfig,
} from "@pump-fun/pump-sdk";
import BN from "bn.js";
import type { PreparedDirectMarket } from "./index";
import type { DirectSwapExpectation } from "./settlement";
import { account, assert, type MarketSnapshot } from "./snapshot";

/** Caller-selected wallet capacity, after reserving rent, transaction fees and delivery costs.
 * @remarks Amounts are SOL lamports and target-token atoms. Selection and holding policies belong to the caller.
 */
export interface DirectCompletionWallet {
  readonly id: string;
  readonly owner: PublicKey;
  readonly maximumInputAmount: bigint;
  readonly maximumTokenAmount: bigint;
}
/** Exact remaining inventory and its single-buyer cost, including protocol and creator fees. */
export interface DirectCurveCompletionQuote {
  readonly remainingTokenAmount: bigint;
  readonly expectedInputAmount: bigint;
  readonly maximumInputAmount: bigint;
  readonly destination: PublicKey;
}
/** One exact-token buy in execution order. Maximum input includes caller-requested slippage. */
export interface DirectCurveCompletionAllocation {
  readonly walletId: string;
  readonly owner: PublicKey;
  readonly tokenAmount: bigint;
  readonly expectedInputAmount: bigint;
  readonly maximumInputAmount: bigint;
}
/** Opaque, immutable full-exhaustion plan scoped to one prepared market snapshot. */
export interface DirectCurveCompletionPlan extends DirectCurveCompletionQuote {
  readonly allocations: readonly DirectCurveCompletionAllocation[];
}
interface Context {
  market: PreparedDirectMarket;
  snapshot: MarketSnapshot;
  identities: readonly string[];
}
interface Proof {
  context: Context;
  allocations: readonly {
    walletId: string;
    owner: string;
    tokenAmount: bigint;
    expectedInputAmount: bigint;
    maximumInputAmount: bigint;
  }[];
  remainingTokenAmount: bigint;
  expectedInputAmount: bigint;
  maximumInputAmount: bigint;
  destination: string;
}
const contexts = new WeakMap<PreparedDirectMarket, Context>();
const plans = new WeakMap<DirectCurveCompletionPlan, Proof>();
const bn = (amount: bigint) => new BN(amount.toString());
const atoms = (amount: BN) => BigInt(amount.toString());
const identities = (market: PreparedDirectMarket) =>
  [
    market.pool,
    market.mint,
    market.quoteMint,
    market.tokenProgram,
    market.quoteProgram,
  ].map((key) => key.toBase58());
const copy = (key: PublicKey) => new PublicKey(key.toBytes());
function amount(value: bigint, positive = false) {
  assert(
    typeof value === "bigint" &&
      value >= (positive ? 1n : 0n) &&
      value < 1n << 64n,
    "Completion capacity must be a u64",
  );
}
function protection(bps: number) {
  assert(
    Number.isInteger(bps) && bps >= 0 && bps < 10000,
    "Invalid completion slippage basis points",
  );
  return (input: bigint) => (input * BigInt(10000 + bps) + 9999n) / 10000n;
}
/** Internal registration preserves the SDK-owned authenticated account snapshot. */
export function registerDirectCompletion(
  market: PreparedDirectMarket,
  snapshot: MarketSnapshot,
): void {
  contexts.set(market, { market, snapshot, identities: identities(market) });
}
function context(market: PreparedDirectMarket) {
  const value = contexts.get(market);
  assert(
    value &&
      market.venue === "Pump.fun" &&
      identities(market).every((key, index) => key === value.identities[index]),
    "Completion requires an unmodified prepared Pump.fun market",
  );
  assert(
    market.quoteMint.equals(NATIVE_MINT) &&
      market.quoteProgram.equals(TOKEN_PROGRAM_ID),
    "Completion supports only SOL curves",
  );
  const read = (key: PublicKey, owner: PublicKey) => {
    const info = account(value.snapshot, key);
    assert(
      info && !info.executable && info.owner.equals(owner),
      "Invalid completion dependency owner",
    );
    return info;
  };
  assert(
    bondingCurvePda(market.mint).equals(market.pool),
    "Completion curve does not belong to mint",
  );
  const curveInfo = read(market.pool, PUMP_PROGRAM_ID);
  const curve = PUMP_SDK.decodeBondingCurve(curveInfo);
  const global = PUMP_SDK.decodeGlobal(read(GLOBAL_PDA, PUMP_PROGRAM_ID));
  const feeConfig = PUMP_SDK.decodeFeeConfig(
    read(PUMP_FEE_CONFIG_PDA, PUMP_FEE_PROGRAM_ID),
  );
  assert(
    !curve.complete && !curve.realTokenReserves.isZero(),
    "Completion curve is already complete",
  );
  assert(
    curve.quoteMint.equals(PublicKey.default),
    "Completion supports only legacy SOL quote semantics",
  );
  assert(
    !curve.isMayhemMode && !curve.isCashbackCoin && !curve.isHolderReward,
    "Completion does not support Mayhem, cashback or holder-reward curves",
  );
  assert(global.enableMigrate, "Pump migration is disabled");
  assert(
    curve.virtualTokenReserves.gt(curve.realTokenReserves) &&
      curve.virtualQuoteReserves.gt(new BN(0)),
    "Invalid completion reserves",
  );
  return { value, curve, curveInfo, global, feeConfig };
}
function quote(
  curve: BondingCurve,
  global: Global,
  feeConfig: FeeConfig,
  tokenAmount: bigint,
) {
  const params = {
    global,
    feeConfig,
    mintSupply: curve.tokenTotalSupply,
    bondingCurve: curve,
    amount: bn(tokenAmount),
    quoteMint: NATIVE_MINT,
  };
  const input = atoms(getBuySolAmountFromTokenAmount(params));
  const reserveInput = getBuySolAmountFromTokenAmount({
    ...params,
    feeConfig: null,
    global: {
      ...global,
      feeBasisPoints: new BN(0),
      creatorFeeBasisPoints: new BN(0),
    },
    bondingCurve: {
      ...curve,
      creator: PublicKey.default,
      creatorFeeBps: new BN(0),
    },
  });
  amount(input, true);
  return {
    input,
    reserveInput: atoms(reserveInput),
    next: {
      ...curve,
      virtualTokenReserves: curve.virtualTokenReserves.sub(bn(tokenAmount)),
      realTokenReserves: curve.realTokenReserves.sub(bn(tokenAmount)),
      virtualQuoteReserves: curve.virtualQuoteReserves.add(reserveInput),
      realQuoteReserves: curve.realQuoteReserves.add(reserveInput),
    },
  };
}
/** Quote graduation from warm state without RPC. Rent, transaction fees and tips are excluded.
 * @remarks The caller must enforce snapshot freshness. A multi-wallet plan has its own sequentially rounded aggregate cost.
 * @throws If the prepared curve or its quote semantics are unsupported.
 */
export function quoteDirectCurveCompletion(
  market: PreparedDirectMarket,
  slippageBps: number,
): DirectCurveCompletionQuote {
  const { curve, global, feeConfig } = context(market);
  const protect = protection(slippageBps);
  const remainingTokenAmount = atoms(curve.realTokenReserves);
  const expectedInputAmount = quote(
    curve,
    global,
    feeConfig,
    remainingTokenAmount,
  ).input;
  const maximumInputAmount = protect(expectedInputAmount);
  amount(maximumInputAmount, true);
  return Object.freeze({
    remainingTokenAmount,
    expectedInputAmount,
    maximumInputAmount,
    destination: canonicalPumpPoolPda(market.mint),
  });
}
/** Allocate the entire remaining curve inventory across ordered caller-selected wallets.
 * @remarks Targets an equal token split, then redistributes deficits within each wallet's capacity at the sequential price. Up to four wallets are accepted; unused wallets do not produce transactions. No partial plan is returned. Fees are quoted by the official SDK at each preceding reserve state.
 * @throws If capacities, holding limits or wallet count cannot fully complete the curve.
 */
export function planDirectCurveCompletion(
  market: PreparedDirectMarket,
  options: {
    wallets: readonly DirectCompletionWallet[];
    maxWalletCount: number;
    slippageBps: number;
  },
): DirectCurveCompletionPlan {
  const { value, curve: initial, global, feeConfig } = context(market);
  const protect = protection(options.slippageBps);
  assert(
    Number.isInteger(options.maxWalletCount) &&
      options.maxWalletCount >= 1 &&
      options.maxWalletCount <= 4 &&
      options.wallets.length > 0 &&
      options.wallets.length <= options.maxWalletCount,
    "Completion requires one to four preselected wallets",
  );
  const owners = new Set<string>(),
    ids = new Set<string>();
  for (const wallet of options.wallets) {
    amount(wallet.maximumInputAmount);
    amount(wallet.maximumTokenAmount);
    assert(
      wallet.id &&
        !ids.has(wallet.id) &&
        !owners.has(wallet.owner.toBase58()) &&
        PublicKey.isOnCurve(wallet.owner.toBytes()),
      "Completion wallets must have unique IDs and signing owners",
    );
    ids.add(wallet.id);
    owners.add(wallet.owner.toBase58());
  }
  const insufficient =
    "Insufficient wallet SOL or holding capacity to complete curve";
  assert(
    options.wallets.reduce(
      (sum, wallet) => sum + wallet.maximumTokenAmount,
      0n,
    ) >= atoms(initial.realTokenReserves),
    insufficient,
  );
  const rawCompletionCost = quote(
    initial,
    global,
    feeConfig,
    atoms(initial.realTokenReserves),
  ).reserveInput;
  /** Each rounded buy strictly increases the virtual reserve product, so splitting cannot lower the raw full-exhaustion cost. Fees and slippage only add spend. */
  assert(
    options.wallets.reduce(
      (sum, wallet) => sum + wallet.maximumInputAmount,
      0n,
    ) >= rawCompletionCost,
    insufficient,
  );
  const capacity = (
    curve: BondingCurve,
    wallet: DirectCompletionWallet,
  ): bigint => {
    let low = 0n;
    let high = atoms(curve.realTokenReserves);
    if (wallet.maximumTokenAmount < high) high = wallet.maximumTokenAmount;
    if (
      !high ||
      protect(quote(curve, global, feeConfig, high).input) <=
        wallet.maximumInputAmount
    )
      return high;
    while (low < high) {
      const middle = (low + high + 1n) / 2n;
      if (
        protect(quote(curve, global, feeConfig, middle).input) <=
        wallet.maximumInputAmount
      )
        low = middle;
      else high = middle - 1n;
    }
    return low;
  };
  const previousReservePlateau = (
    curve: BondingCurve,
    maximum: bigint,
  ): bigint => {
    if (!maximum) return 0n;
    const maximumCost = quote(curve, global, feeConfig, maximum).reserveInput;
    let low = 0n,
      high = maximum - 1n;
    while (low < high) {
      const middle = (low + high + 1n) / 2n;
      if (quote(curve, global, feeConfig, middle).reserveInput < maximumCost)
        low = middle;
      else high = middle - 1n;
    }
    return low;
  };
  const witnesses = new Map<string, readonly bigint[] | undefined>();
  /** Tests maximum, preceding raw-cost plateau and skip choices, retaining an actual feasible suffix.
   * @remarks Raw reserve cost is monotonic at a fixed curve; suffix affordability is not. At most four wallets bound the three-way recursion.
   */
  const findCompletion = (
    curve: BondingCurve,
    index: number,
  ): readonly bigint[] | undefined => {
    if (curve.realTokenReserves.isZero()) return [];
    const wallet = options.wallets[index];
    if (!wallet) return undefined;
    const key = `${index}:${curve.virtualTokenReserves}:${curve.virtualQuoteReserves}:${curve.realTokenReserves}`;
    if (witnesses.has(key)) return witnesses.get(key);
    const maximum = capacity(curve, wallet);
    const candidates = function* () {
      yield maximum;
      yield previousReservePlateau(curve, maximum);
      yield 0n;
    };
    const tried = new Set<bigint>();
    for (const tokens of candidates()) {
      if (tried.has(tokens)) continue;
      tried.add(tokens);
      const next = tokens
        ? quote(curve, global, feeConfig, tokens).next
        : curve;
      const suffix = findCompletion(next, index + 1);
      if (suffix) {
        const witness = [tokens, ...suffix];
        witnesses.set(key, witness);
        return witness;
      }
    }
    witnesses.set(key, undefined);
    return undefined;
  };
  let witness = findCompletion(initial, 0);
  assert(witness, insufficient);
  let curve = initial;
  const allocations: DirectCurveCompletionAllocation[] = [];
  for (const [index, wallet] of options.wallets.entries()) {
    const remaining = atoms(curve.realTokenReserves);
    if (!remaining) break;
    const maximum = capacity(curve, wallet);
    const walletCount = BigInt(options.wallets.length - index);
    const target = (remaining + walletCount - 1n) / walletCount;
    const preferred = target < maximum ? target : maximum;
    let tokens = witness[0]!;
    let suffix: readonly bigint[] = witness.slice(1);
    const preferredSuffix = preferred
      ? findCompletion(
          quote(curve, global, feeConfig, preferred).next,
          index + 1,
        )
      : undefined;
    if (preferredSuffix) {
      tokens = preferred;
      suffix = preferredSuffix;
    } else if (tokens > preferred) {
      let low = preferred + 1n,
        high = tokens;
      while (low < high) {
        const middle = (low + high) / 2n;
        const checked = findCompletion(
          quote(curve, global, feeConfig, middle).next,
          index + 1,
        );
        if (checked) {
          high = middle;
          suffix = checked;
        } else low = middle + 1n;
      }
      tokens = high;
    }
    witness = suffix;
    if (!tokens) continue;
    const result = quote(curve, global, feeConfig, tokens);
    allocations.push(
      Object.freeze({
        walletId: wallet.id,
        owner: copy(wallet.owner),
        tokenAmount: tokens,
        expectedInputAmount: result.input,
        maximumInputAmount: protect(result.input),
      }),
    );
    curve = result.next;
  }
  assert(
    curve.realTokenReserves.isZero(),
    "Insufficient wallet SOL or holding capacity to complete curve",
  );
  const plan = Object.freeze({
    remainingTokenAmount: atoms(initial.realTokenReserves),
    expectedInputAmount: allocations.reduce(
      (sum, allocation) => sum + allocation.expectedInputAmount,
      0n,
    ),
    maximumInputAmount: allocations.reduce(
      (sum, allocation) => sum + allocation.maximumInputAmount,
      0n,
    ),
    destination: canonicalPumpPoolPda(market.mint),
    allocations: Object.freeze(allocations),
  });
  plans.set(plan, {
    ...plan,
    context: value,
    destination: plan.destination.toBase58(),
    allocations: allocations.map((allocation) => ({
      ...allocation,
      owner: allocation.owner.toBase58(),
    })),
  });
  return plan;
}
function proof(market: PreparedDirectMarket, plan: DirectCurveCompletionPlan) {
  const { value } = context(market),
    sealed = plans.get(plan);
  assert(
    sealed &&
      sealed.context === value &&
      plan.destination.toBase58() === sealed.destination &&
      plan.remainingTokenAmount === sealed.remainingTokenAmount &&
      plan.expectedInputAmount === sealed.expectedInputAmount &&
      plan.maximumInputAmount === sealed.maximumInputAmount &&
      plan.allocations.length === sealed.allocations.length &&
      plan.allocations.every((allocation, index) => {
        const expected = sealed.allocations[index]!;
        return (
          allocation.walletId === expected.walletId &&
          allocation.owner.toBase58() === expected.owner &&
          allocation.tokenAmount === expected.tokenAmount &&
          allocation.expectedInputAmount === expected.expectedInputAmount &&
          allocation.maximumInputAmount === expected.maximumInputAmount
        );
      }),
    "Completion plan must be unmodified and bound to this market snapshot",
  );
  return sealed;
}
/** Build one exact-token buy with an idempotent ATA, from a sealed completion plan.
 * @remarks Requires ordered execution of all allocations followed by migration. Expectation input is the protected maximum; receipt normalization determines actual SOL spent.
 */
export async function buildDirectCurveCompletionBuy(
  market: PreparedDirectMarket,
  plan: DirectCurveCompletionPlan,
  allocationIndex: number,
): Promise<{
  instructions: TransactionInstruction[];
  expectation: DirectSwapExpectation;
  computeUnitLimit: number;
}> {
  const sealed = proof(market, plan);
  assert(
    Number.isInteger(allocationIndex) &&
      allocationIndex >= 0 &&
      allocationIndex < sealed.allocations.length,
    "Invalid completion allocation index",
  );
  const allocation = sealed.allocations[allocationIndex]!;
  const owner = new PublicKey(allocation.owner),
    { curve, curveInfo, global } = context(market);
  const instructions = await PUMP_SDK.buyInstructions({
    global,
    bondingCurveAccountInfo: curveInfo,
    bondingCurve: curve,
    associatedUserAccountInfo: null,
    mint: copy(market.mint),
    user: owner,
    amount: bn(allocation.tokenAmount),
    solAmount: bn(allocation.maximumInputAmount),
    slippage: 0,
    tokenProgram: copy(market.tokenProgram),
  });
  const swaps = instructions.filter((instruction) =>
    instruction.programId.equals(PUMP_PROGRAM_ID),
  );
  assert(
    swaps.length === 1,
    "Completion must build exactly one exact-token buy",
  );
  const expectation: DirectSwapExpectation = {
    provider: "direct",
    amountMode: "exact-output",
    owner: allocation.owner,
    pool: market.pool.toBase58(),
    venue: market.venue,
    inputMint: NATIVE_MINT.toBase58(),
    outputMint: market.mint.toBase58(),
    inputTokenProgram: TOKEN_PROGRAM_ID.toBase58(),
    outputTokenProgram: market.tokenProgram.toBase58(),
    inputAccount: allocation.owner,
    outputAccount: getAssociatedTokenAddressSync(
      market.mint,
      owner,
      false,
      market.tokenProgram,
    ).toBase58(),
    inputAmount: allocation.maximumInputAmount.toString(),
    minimumOutput: allocation.tokenAmount.toString(),
    swapInstructions: swaps.map((instruction) => ({
      programId: instruction.programId.toBase58(),
      keys: instruction.keys.map((key) => ({
        ...key,
        pubkey: key.pubkey.toBase58(),
      })),
      data: instruction.data.toString("base64"),
    })),
  };
  return { instructions, expectation, computeUnitLimit: 200_000 };
}
/** Build canonical migration after every exact-token allocation, without RPC or signing.
 * @remarks The payer must be one of the plan's buyers. The caller reserves transaction and relay costs and must compile/simulate the full transaction before signing.
 */
export async function buildDirectCurveCompletionMigration(
  market: PreparedDirectMarket,
  plan: DirectCurveCompletionPlan,
  payer: PublicKey,
): Promise<{
  instructions: TransactionInstruction[];
  computeUnitLimit: number;
}> {
  const sealed = proof(market, plan),
    { global } = context(market);
  payer = copy(payer);
  assert(
    sealed.allocations.some(
      (allocation) => allocation.owner === payer.toBase58(),
    ),
    "Migration payer must belong to completion plan",
  );
  const instruction = await PUMP_SDK.migrateInstruction({
    withdrawAuthority: global.withdrawAuthority,
    mint: copy(market.mint),
    user: payer,
    tokenProgram: copy(market.tokenProgram),
  });
  assert(
    instruction.keys.some(
      (key) => key.pubkey.toBase58() === sealed.destination,
    ) &&
      instruction.keys
        .filter((key) => key.isSigner)
        .every((key) => key.pubkey.equals(payer)),
    "Invalid canonical migration instruction",
  );
  return { instructions: [instruction], computeUnitLimit: 1_400_000 };
}
