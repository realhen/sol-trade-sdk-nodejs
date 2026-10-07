export {
  directLaunchTargets,
  readDirectLaunchPools,
  type DirectLaunchTargets,
} from "./launch-discovery";
export {
  inspectDirectMigration,
  resolveDirectMigration,
  type DirectMigration,
  type ResolvedDirectMigration,
} from "./migration";
import { TRADING_PROGRAMS } from "../common/trading-programs";
/** Pool-specific direct execution. No route service, signer, HTTP API or submission. */
import {
  PublicKey,
  type Connection,
  type TransactionInstruction,
  type AccountInfo,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  unpackMint,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  getTransferFeeConfig,
  calculateEpochFee,
  getEpochFee,
  type TransferFeeConfig,
} from "@solana/spl-token";
import { discoverPoolQuoteMint } from "./pool-identity";
import { directComputeUnitLimit } from "./compute-budget";
import { assertTokenCapabilities } from "../venues/token-capabilities";
import * as clmm from "../venues/raydium-clmm";
import * as orca from "../venues/orca-whirlpool";
import * as dlmm from "../venues/meteora-dlmm";
import * as dbc from "../venues/meteora-dbc";
import * as damm1 from "../venues/meteora-damm-v1";
import { prepareTokenAccounts } from "../venues/token-accounts";
import { venueAccounts, venueAdapter } from "./legacy-venues";
import { pumpAdapter, pumpDependencies } from "./pump";
import { registerDirectCompletion } from "./completion";
export {
  quoteDirectCurveCompletion,
  planDirectCurveCompletion,
  buildDirectCurveCompletionBuy,
  buildDirectCurveCompletionMigration,
  type DirectCompletionWallet,
  type DirectCurveCompletionQuote,
  type DirectCurveCompletionAllocation,
  type DirectCurveCompletionPlan,
} from "./completion";
export {
  directSharedAccounts,
  directMarketAccountHints,
} from "./account-discovery";
import { assert, type MarketSnapshot, type ChainAccount } from "./snapshot";
import { sizeDirectSellForExpectedOutput } from "./sell-sizing";
import type { DirectSwapExpectation } from "./settlement";
export { discoverPoolQuoteMint } from "./pool-identity";
export {
  normalizeDirectFill,
  type DirectSwapExpectation,
  type NormalizedDirectFill,
} from "./settlement";
export interface PreparedDirectMarket {
  readonly pool: PublicKey;
  readonly venue: string;
  readonly mint: PublicKey;
  readonly quoteMint: PublicKey;
  readonly tokenProgram: PublicKey;
  readonly quoteProgram: PublicKey;
  readonly decimals: number;
  readonly quoteDecimals: number;
}
export interface DirectQuote {
  readonly inputMint: PublicKey;
  readonly outputMint: PublicKey;
  readonly inputAmount: bigint;
  readonly expectedOutput: bigint;
  readonly minimumOutput: bigint;
}
interface BuiltQuote {
  expectedOutput: bigint;
  minimumOutput: bigint;
  build: (
    owner: PublicKey,
    input: PublicKey,
    output: PublicKey,
  ) => Promise<TransactionInstruction[]>;
}
interface State {
  pool: string;
  mint: string;
  quoteMint: string;
  program: string;
  tokenProgram: string;
  quoteProgram: string;
  nativePump: boolean;
  quote: (input: PublicKey, amount: bigint, slippage: number) => BuiltQuote;
  inputForOutput: (amount: bigint) => bigint | undefined;
}
const states = new WeakMap<PreparedDirectMarket, State>();
const quotes = new WeakMap<
  DirectQuote,
  {
    market: PreparedDirectMarket;
    value: BuiltQuote;
    input: string;
    output: string;
    amount: bigint;
  }
>();
const clone = (key: PublicKey) => new PublicKey(key.toBytes());
const u64 = (n: bigint) => {
  assert(
    typeof n === "bigint" && n > 0n && n < 1n << 64n,
    "Amount must be a positive u64",
  );
};
/** Prepares a validated market from dependency reads through the supplied Connection.
 * @remarks A recording/cache-only connection may hydrate once and rebuild snapshots
 * on account updates. Preparation rejects market-wide disabled or unsupported states;
 * amount-dependent capacity and liquidity checks still occur when quoting. Returned
 * state is opaque, and quote/build have no access to the supplied Connection.
 */
export async function prepareDirectMarket(
  connection: Connection,
  pool: PublicKey,
  targetMint: PublicKey,
): Promise<PreparedDirectMarket> {
  pool = clone(pool);
  targetMint = clone(targetMint);
  const quoteMint = await discoverPoolQuoteMint(connection, pool, targetMint);
  const info = await connection.getAccountInfo(pool);
  assert(info && !info.executable, "Pool unavailable");
  const venue = TRADING_PROGRAMS[info.owner.toBase58()];
  assert(venue, "Unsupported direct venue");
  const mintInfos = await connection.getMultipleAccountsInfo([
    targetMint,
    quoteMint,
    ...(venue === "Pump.fun" || venue === "PumpSwap"
      ? pumpDependencies(info, venue === "PumpSwap")
      : []),
  ]);
  const tokens = [targetMint, quoteMint].map((key, i) => {
    const a = mintInfos[i];
    assert(a && !a.executable, "Mint unavailable");
    return { ...unpackMint(key, a, a.owner), tokenProgram: a.owner };
  });
  for (let i = 0; i < 2; i++)
    assertTokenCapabilities(tokens[i]!, [targetMint, quoteMint][i]!, {
      venue,
      transferFee: [
        "Raydium CLMM",
        "Orca Whirlpool",
        "Meteora DLMM",
        "Raydium CPMM",
        "Meteora DAMM v2",
      ].includes(venue),
      transferHook: "reject",
    });
  const market: PreparedDirectMarket = Object.freeze({
    pool: clone(pool),
    venue,
    mint: clone(targetMint),
    quoteMint: clone(quoteMint),
    tokenProgram: clone(tokens[0]!.tokenProgram),
    quoteProgram: clone(tokens[1]!.tokenProgram),
    decimals: tokens[0]!.decimals,
    quoteDecimals: tokens[1]!.decimals,
  });
  let factory: State["quote"];
  let inverse: State["inputForOutput"];
  if (venue === "Raydium CLMM") {
    const s = await clmm.prepare(connection, pool);
    inverse = (amount) => clmm.quoteInputForOutput(s, targetMint, amount);
    factory = (input, amount, bps) => {
      const q = clmm.quote(s, input, amount, bps);
      return {
        expectedOutput: q.expectedAmountOut,
        minimumOutput: q.minimumAmountOut,
        build: async (owner, a, b) => [
          clmm.buildSwapInstruction(s, q, {
            payer: owner,
            inputTokenAccount: a,
            outputTokenAccount: b,
          }),
        ],
      };
    };
  } else if (venue === "Orca Whirlpool") {
    const s = await orca.prepare(connection, pool);
    inverse = (amount) => orca.quoteInputForOutput(s, targetMint, amount);
    factory = (input, amount, bps) => {
      const q = orca.quote(s, input, amount, bps);
      return {
        expectedOutput: q.expectedAmountOut,
        minimumOutput: q.minimumAmountOut,
        build: async (owner, a, b) => [
          orca.buildSwapInstruction(s, q, {
            payer: owner,
            inputTokenAccount: a,
            outputTokenAccount: b,
          }),
        ],
      };
    };
  } else if (venue === "Meteora DLMM") {
    const s = await dlmm.prepare(connection, pool);
    inverse = (amount) => dlmm.quoteInputForOutput(s, targetMint, amount);
    factory = (input, amount, bps) => {
      const mint = tokens[input.equals(targetMint) ? 0 : 1]!;
      const fee = getTransferFeeConfig(mint);
      // The upstream quote reports "Insufficient liquidity" when transfer fees
      // consume a one-atomic probe before it visits any bin. Classify this exact
      // dust case before the quote so sizing does not mistake it for a price cap.
      assert(
        !fee || amount > calculateEpochFee(fee, s.chainTime.epoch, amount),
        "Input rounds to zero after transfer fees",
      );
      const q = dlmm.quote(s, input, amount, bps);
      return {
        expectedOutput: q.amountOut,
        minimumOutput: q.minimumAmountOut,
        build: async (owner, a, b) =>
          dlmm.buildSwapInstructions(s, {
            quote: q,
            owner,
            inputTokenAccount: a,
            outputTokenAccount: b,
            minimumAmountOut: q.minimumAmountOut,
          }),
      };
    };
  } else if (venue === "Meteora DBC" || venue === "Meteora DAMM v1") {
    const make =
      <S>(
        s: S,
        adapter: {
          quote: (
            s: S,
            p: {
              inputMint: PublicKey;
              outputMint: PublicKey;
              amountIn: bigint;
              slippageBps: number;
            },
          ) => { amountOut: bigint; minimumAmountOut: bigint };
          buildSwapInstructions: (
            s: S,
            p: {
              inputMint: PublicKey;
              outputMint: PublicKey;
              amountIn: bigint;
              minimumAmountOut: bigint;
              owner: PublicKey;
              inputTokenAccount: PublicKey;
              outputTokenAccount: PublicKey;
            },
          ) => TransactionInstruction[];
        },
      ): State["quote"] =>
      (input, amount, bps) => {
        const output = input.equals(targetMint) ? quoteMint : targetMint;
        const q = adapter.quote(s, {
          inputMint: input,
          outputMint: output,
          amountIn: amount,
          slippageBps: bps,
        });
        return {
          expectedOutput: q.amountOut,
          minimumOutput: q.minimumAmountOut,
          build: async (owner, a, b) =>
            adapter.buildSwapInstructions(s, {
              inputMint: input,
              outputMint: output,
              amountIn: amount,
              minimumAmountOut: q.minimumAmountOut,
              owner,
              inputTokenAccount: a,
              outputTokenAccount: b,
            }),
        };
      };
    if (venue === "Meteora DBC") {
      const s = await dbc.prepare(connection, pool);
      factory = make(s, dbc);
      inverse = (amount) => dbc.quoteInputForOutput(s, targetMint, amount);
    } else {
      const s = await damm1.prepare(connection, pool);
      factory = make(s, damm1);
      inverse = (amount) => damm1.quoteInputForOutput(s, targetMint, amount);
    }
  } else {
    const accounts = new Map<string, ChainAccount | null>();
    const add = (key: PublicKey, a: AccountInfo<Buffer> | null) =>
      accounts.set(
        key.toBase58(),
        a ? { ...a, data: Buffer.from(a.data) } : null,
      );
    add(pool, info);
    add(targetMint, mintInfos[0]!);
    add(quoteMint, mintInfos[1]!);
    const hydrate = async (keys: PublicKey[]) => {
      const unique = [
        ...new Map(
          keys
            .filter((k) => !accounts.has(k.toBase58()))
            .map((k) => [k.toBase58(), k]),
        ).values(),
      ];
      if (!unique.length) return;
      const values = await connection.getMultipleAccountsInfo(unique);
      unique.forEach((k, i) => {
        assert(values[i], `Missing direct dependency ${k.toBase58()}`);
        add(k, values[i]!);
      });
    };
    if (venue === "Pump.fun" || venue === "PumpSwap")
      await hydrate(pumpDependencies(info, venue === "PumpSwap"));
    else {
      await hydrate(venueAccounts(info, (k) => accounts.get(k)).addresses);
      await hydrate(venueAccounts(info, (k) => accounts.get(k)).addresses);
    }
    const snapshot: MarketSnapshot = {
      pool: pool.toBase58(),
      mint: targetMint.toBase58(),
      quoteMint: quoteMint.toBase58(),
      venue,
      wallet: PublicKey.default.toBase58(),
      accounts,
    };
    if (venue === "Pump.fun") registerDirectCompletion(market, snapshot);
    const adapter = (input: PublicKey, owner: PublicKey) =>
      venue === "Pump.fun" || venue === "PumpSwap"
        ? pumpAdapter(snapshot, input, owner)
        : venueAdapter(
            { ...snapshot, wallet: owner.toBase58() },
            input.equals(quoteMint) ? "buy" : "sell",
          );
    const cachedAdapters = new Map<string, ReturnType<typeof adapter>>();
    const quoteAdapter = (input: PublicKey) => {
      const key = input.toBase58();
      let value = cachedAdapters.get(key);
      if (!value) {
        value = adapter(input, PublicKey.default);
        cachedAdapters.set(key, value);
      }
      return value;
    };
    quoteAdapter(targetMint);
    quoteAdapter(quoteMint);
    const clock = accounts.get("SysvarC1ock11111111111111111111111111111111");
    const epoch = clock?.data.readBigUInt64LE(16) ?? 0n;
    const fees = tokens.map(getTransferFeeConfig);
    const includeTransferFee = (
      amount: bigint,
      config: TransferFeeConfig | null,
    ) => {
      if (!config || amount === 0n) return amount;
      const fee = getEpochFee(config, epoch);
      const bps = BigInt(fee.transferFeeBasisPoints);
      const uncapped =
        bps === 10000n
          ? fee.maximumFee
          : (amount * bps + 9999n - bps) / (10000n - bps);
      return amount + (uncapped < fee.maximumFee ? uncapped : fee.maximumFee);
    };
    inverse = (amount) => {
      const netInput = quoteAdapter(targetMint).inputForOutput(
        includeTransferFee(amount, fees[1]!),
      );
      return netInput === undefined
        ? undefined
        : includeTransferFee(netInput, fees[0]!);
    };
    factory = (input, amount, bps) => {
      const inputIndex = input.equals(targetMint) ? 0 : 1,
        outputIndex = 1 - inputIndex;
      const inputFee = fees[inputIndex];
      const outputFee = fees[outputIndex];
      const netInput =
        amount - (inputFee ? calculateEpochFee(inputFee, epoch, amount) : 0n);
      const grossOutput = quoteAdapter(input).quote(netInput);
      const expectedOutput =
        grossOutput -
        (outputFee ? calculateEpochFee(outputFee, epoch, grossOutput) : 0n);
      const minimumOutput = (expectedOutput * BigInt(10000 - bps)) / 10000n;
      return {
        expectedOutput,
        minimumOutput,
        build: async (owner) =>
          adapter(input, owner).instructions(amount, minimumOutput),
      };
    };
  }
  states.set(market, {
    pool: pool.toBase58(),
    mint: targetMint.toBase58(),
    quoteMint: quoteMint.toBase58(),
    program: info.owner.toBase58(),
    tokenProgram: market.tokenProgram.toBase58(),
    quoteProgram: market.quoteProgram.toBase58(),
    nativePump: venue === "Pump.fun" && quoteMint.equals(NATIVE_MINT),
    quote: factory,
    inputForOutput: inverse,
  });
  return market;
}
function state(market: PreparedDirectMarket): State {
  const s = states.get(market);
  assert(
    s &&
      market.pool.toBase58() === s.pool &&
      market.mint.toBase58() === s.mint &&
      market.quoteMint.toBase58() === s.quoteMint &&
      market.tokenProgram.toBase58() === s.tokenProgram &&
      market.quoteProgram.toBase58() === s.quoteProgram,
    "Market must be an unmodified prepared snapshot",
  );
  return s;
}
/** Pure exact-input quote, bound by identity to this prepared snapshot. */
export function quoteDirectSwap(
  market: PreparedDirectMarket,
  inputMint: PublicKey,
  inputAmount: bigint,
  slippageBps: number,
): DirectQuote {
  const s = state(market);
  u64(inputAmount);
  assert(
    Number.isInteger(slippageBps) && slippageBps >= 0 && slippageBps < 10000,
    "Invalid slippage basis points",
  );
  const input = inputMint.toBase58();
  assert(
    input === s.mint || input === s.quoteMint,
    "Input mint is not in selected pool",
  );
  const output = input === s.mint ? s.quoteMint : s.mint;
  const value = s.quote(new PublicKey(input), inputAmount, slippageBps);
  u64(value.expectedOutput);
  u64(value.minimumOutput);
  const q = Object.freeze({
    inputMint: new PublicKey(input),
    outputMint: new PublicKey(output),
    inputAmount,
    expectedOutput: value.expectedOutput,
    minimumOutput: value.minimumOutput,
  });
  quotes.set(q, { market, value, input, output, amount: inputAmount });
  return q;
}
/** Find the least token input whose slippage-protected quote reaches targetAmount.
 * @remarks Uses prepared state only. Venue inverse estimates are verified against exact-input quotes.
 * @throws When the balance or prepared liquidity cannot meet the protected target.
 */
export function sizeDirectSellForQuoteValue(
  market: PreparedDirectMarket,
  targetAmount: bigint,
  maximumInputAmount: bigint,
  slippageBps: number,
): DirectQuote {
  u64(targetAmount);
  u64(maximumInputAmount);
  assert(
    Number.isInteger(slippageBps) && slippageBps >= 0 && slippageBps < 10000,
    "Invalid slippage basis points",
  );
  const protection = BigInt(10000 - slippageBps);
  const target = (targetAmount * 10000n + protection - 1n) / protection;
  u64(target);
  const result = sizeDirectSellForExpectedOutput(
    market,
    target,
    maximumInputAmount,
  );
  assert(
    result.inputAmount > 0n && result.expectedOutput >= target,
    "Insufficient token balance or prepared liquidity for requested quote value",
  );
  return quoteDirectSwap(market, market.mint, result.inputAmount, slippageBps);
}
/** Internal quote context for one sizing operation; never used to authorize a transaction.
 * @remarks Snapshot identity is checked once. Final executable quotes still use quoteDirectSwap.
 */
export function directSellSizingContext(market: PreparedDirectMarket) {
  const s = state(market);
  const mint = new PublicKey(s.mint);
  return {
    inputForOutput: s.inputForOutput,
    quote: (amount: bigint) => {
      u64(amount);
      const output = s.quote(mint, amount, 0).expectedOutput;
      u64(output);
      return output;
    },
  };
}
/** Build ATA/native-SOL setup plus a single pool swap from the sealed quote.
 * Non-native inputs are never funded or converted; the caller supplies their balance. */
export async function buildDirectSwap(
  market: PreparedDirectMarket,
  quote: DirectQuote,
  owner: PublicKey,
): Promise<{
  instructions: TransactionInstruction[];
  expectation: DirectSwapExpectation;
  computeUnitLimit: number;
}> {
  owner = clone(owner);
  const s = state(market),
    q = quotes.get(quote);
  assert(
    q &&
      q.market === market &&
      quote.inputMint.toBase58() === q.input &&
      quote.outputMint.toBase58() === q.output &&
      quote.inputAmount === q.amount &&
      quote.expectedOutput === q.value.expectedOutput &&
      quote.minimumOutput === q.value.minimumOutput,
    "Quote is not bound to this market snapshot",
  );
  const inputMint = new PublicKey(q.input),
    outputMint = new PublicKey(q.output),
    inputProgram = inputMint.equals(market.mint)
      ? market.tokenProgram
      : market.quoteProgram,
    outputProgram = outputMint.equals(market.mint)
      ? market.tokenProgram
      : market.quoteProgram;
  let inputAccount: PublicKey,
    outputAccount: PublicKey,
    setup: TransactionInstruction[],
    cleanup: TransactionInstruction[];
  if (s.nativePump) {
    const ata = getAssociatedTokenAddressSync(
      market.mint,
      owner,
      false,
      market.tokenProgram,
    );
    inputAccount = inputMint.equals(NATIVE_MINT) ? owner : ata;
    outputAccount = outputMint.equals(NATIVE_MINT) ? owner : ata;
    setup = [
      createAssociatedTokenAccountIdempotentInstruction(
        owner,
        ata,
        owner,
        market.mint,
        market.tokenProgram,
      ),
    ];
    cleanup = [];
  } else {
    const a = prepareTokenAccounts({
      owner,
      inputMint,
      outputMint,
      inputTokenProgram: inputProgram,
      outputTokenProgram: outputProgram,
      amountIn: q.amount,
      wrapNativeInput: inputMint.equals(NATIVE_MINT),
      unwrapNativeOutput: outputMint.equals(NATIVE_MINT),
    });
    inputAccount = a.inputTokenAccount;
    outputAccount = a.outputTokenAccount;
    setup = a.setupInstructions;
    cleanup = a.cleanupInstructions;
  }
  const swap = await q.value.build(owner, inputAccount, outputAccount);
  // Bind same-program account extension as well as the swap, so settlement can
  // authenticate the entire venue invocation sequence.
  const execution = swap.filter(
    (ix) =>
      ix.programId.toBase58() === s.program &&
      !(market.venue === "PumpSwap" && ix.data.length === 8),
  );
  assert(
    execution.length === 1,
    "Direct execution must contain exactly one pool swap",
  );
  const expectation: DirectSwapExpectation = {
    provider: "direct",
    owner: owner.toBase58(),
    pool: s.pool,
    venue: market.venue,
    inputMint: q.input,
    outputMint: q.output,
    inputTokenProgram: inputProgram.toBase58(),
    outputTokenProgram: outputProgram.toBase58(),
    inputAccount: inputAccount.toBase58(),
    outputAccount: outputAccount.toBase58(),
    inputAmount: q.amount.toString(),
    minimumOutput: q.value.minimumOutput.toString(),
    swapInstructions: swap
      .filter((ix) => ix.programId.toBase58() === s.program)
      .map((ix) => ({
        programId: ix.programId.toBase58(),
        keys: ix.keys.map((k) => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: ix.data.toString("base64"),
      })),
  };
  return {
    instructions: [...setup, ...swap, ...cleanup],
    expectation,
    computeUnitLimit: directComputeUnitLimit(
      market.venue,
      setup,
      swap,
      cleanup,
    ),
  };
}

export {
  sizeDirectSellForExpectedOutput,
  tryQuoteDirectSell,
  type DirectSellSizing,
} from "./sell-sizing";

export { createDirectBuySizer } from "./buy-sizing";

export {
  decodeConfirmedSolTrades,
  decodeConfirmedSolTradeReceipt,
  type ConfirmedSolTrade,
} from "./receipts";
