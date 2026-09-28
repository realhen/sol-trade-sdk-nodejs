import {
  quoteDirectSwap,
  type DirectQuote,
  type PreparedDirectMarket,
} from "./index";
import { assert } from "./snapshot";

/** Caller-selected wallet capacity and relative allocation weight, in atomic token units. */
export interface SellBatchWallet {
  readonly id: string;
  readonly balance: bigint;
  readonly weight: bigint;
}
/** One aggregate sizing estimate and sealed per-wallet quotes from the same cached market.
 * @remarks Aggregate output is a single-swap curve estimate, not guaranteed batch proceeds.
 * Separate swaps may incur different rounding, transfer caps or state-dependent fees and may
 * execute in any order. Each allocation retains its own snapshot quote and slippage floor.
 */
export interface DirectSellBatch {
  readonly inputAmount: bigint;
  readonly aggregateExpectedOutput: bigint;
  readonly sellAll: boolean;
  readonly allocations: readonly {
    readonly id: string;
    readonly quote: DirectQuote;
  }[];
}

/** Distributes a fixed input with integer weights, redistributing capped shares deterministically. */
function allocate(
  total: bigint,
  wallets: readonly SellBatchWallet[],
): bigint[] {
  const amounts = wallets.map(() => 0n);
  let remaining = total;
  let active = wallets
    .map((_, index) => index)
    .filter((i) => wallets[i]!.balance > 0n);
  while (remaining > 0n && active.length) {
    const weight = active.reduce((sum, i) => sum + wallets[i]!.weight, 0n);
    const capped = active.filter(
      (i) => (remaining * wallets[i]!.weight) / weight >= wallets[i]!.balance,
    );
    if (capped.length) {
      for (const i of capped) {
        amounts[i] = wallets[i]!.balance;
        remaining -= amounts[i]!;
      }
      active = active.filter((i) => !capped.includes(i));
      continue;
    }
    const budget = remaining;
    for (const i of active) {
      amounts[i] = (budget * wallets[i]!.weight) / weight;
      remaining -= amounts[i]!;
    }
    for (const i of active) {
      if (remaining === 0n) break;
      if (amounts[i]! < wallets[i]!.balance) {
        amounts[i] = amounts[i]! + 1n;
        remaining--;
      }
    }
  }
  assert(remaining === 0n, "Sell allocation exceeds wallet balances");
  return amounts;
}

const dust =
  /zero|dust|round|positive u64|amount out must be greater than 0|fees exceed total output; final quote is negative/i;
const capacity = /liquidity|capacity|partial|remaining|exceed.*reserve/i;

/** Converts a quote-value target to token input once, then distributes it across selected wallets.
 * @remarks Uses only the prepared market. Slippage changes output floors, never the sized input.
 * Insufficient holdings sell all; insufficient prepared liquidity caps the input to what can be
 * quoted. Dust allocations are omitted. No balances, keys, network calls or transaction retries
 * are owned here. Per-wallet quotes are evaluated after allocation, not inverse-sized separately.
 */
export function planDirectSellBatch(
  market: PreparedDirectMarket,
  target: bigint,
  wallets: readonly SellBatchWallet[],
  slippageBps: number,
): DirectSellBatch {
  const max = (1n << 64n) - 1n;
  assert(
    typeof target === "bigint" && target > 0n && target <= max,
    "Invalid sell target",
  );
  assert(
    Number.isInteger(slippageBps) && slippageBps >= 0 && slippageBps < 10000,
    "Invalid sell slippage",
  );
  assert(
    wallets.length > 0 && wallets.length <= 16,
    "Use one to sixteen sell wallets",
  );
  const ids = new Set<string>();
  for (const wallet of wallets) {
    assert(
      typeof wallet.id === "string" &&
        wallet.id.length > 0 &&
        wallet.id.length <= 128,
      "Invalid sell wallet identity",
    );
    assert(!ids.has(wallet.id), "Duplicate sell wallet identity");
    ids.add(wallet.id);
    assert(
      typeof wallet.balance === "bigint" &&
        wallet.balance >= 0n &&
        wallet.balance <= max &&
        typeof wallet.weight === "bigint" &&
        wallet.weight > 0n &&
        wallet.weight <= max,
      "Invalid sell wallet capacity or weight",
    );
  }
  const available = wallets.reduce((sum, wallet) => sum + wallet.balance, 0n);
  assert(available <= max, "Combined holdings exceed u64");
  const evaluate = (amount: bigint): bigint | null => {
    if (!amount) return 0n;
    try {
      return quoteDirectSwap(market, market.mint, amount, 0).expectedOutput;
    } catch (error) {
      if (error instanceof Error && dust.test(error.message)) return 0n;
      if (error instanceof Error && capacity.test(error.message)) return null;
      throw error;
    }
  };
  let low = 0n,
    high = available > 0n ? 1n : 0n;
  while (high < available) {
    const output = evaluate(high);
    if (output === null || output >= target) break;
    low = high;
    high = high * 2n > available ? available : high * 2n;
  }
  while (low < high) {
    const mid = (low + high) / 2n;
    const output = evaluate(mid);
    if (output === null || output >= target) high = mid;
    else low = mid + 1n;
  }
  let amount = low;
  if (evaluate(amount) === null) amount--;
  if (amount <= 0n || evaluate(amount) === 0n)
    return Object.freeze({
      inputAmount: 0n,
      aggregateExpectedOutput: 0n,
      sellAll: false,
      allocations: Object.freeze([]),
    });
  let eligible = [...wallets];
  let allocations: { id: string; quote: DirectQuote }[] = [];
  // An unexecutable dust share is redistributed instead of reducing an achievable target.
  for (let attempt = 0; attempt < wallets.length; attempt++) {
    const capacity = eligible.reduce((sum, wallet) => sum + wallet.balance, 0n);
    const amounts = allocate(amount < capacity ? amount : capacity, eligible);
    const omitted = new Set<string>();
    allocations = [];
    for (const [index, input] of amounts.entries()) {
      if (!input) continue;
      const wallet = eligible[index]!;
      try {
        allocations.push(
          Object.freeze({
            id: wallet.id,
            quote: quoteDirectSwap(market, market.mint, input, slippageBps),
          }),
        );
      } catch (error) {
        if (!(error instanceof Error && dust.test(error.message))) throw error;
        omitted.add(wallet.id);
      }
    }
    if (!omitted.size) break;
    const remaining = eligible.filter(
      (wallet) => wallet.balance > 0n && !omitted.has(wallet.id),
    );
    if (!remaining.length && eligible.length > 1) {
      eligible = [
        eligible.reduce((largest, wallet) =>
          wallet.balance > largest.balance ? wallet : largest,
        ),
      ];
    } else {
      eligible = remaining;
    }
    if (!eligible.length) break;
  }
  const inputAmount = allocations.reduce(
    (sum, allocation) => sum + allocation.quote.inputAmount,
    0n,
  );
  return Object.freeze({
    inputAmount,
    aggregateExpectedOutput: evaluate(inputAmount) ?? 0n,
    sellAll: available > 0n && inputAmount === available,
    allocations: Object.freeze(allocations),
  });
}
