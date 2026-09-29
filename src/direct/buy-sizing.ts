import {
  quoteDirectSwap,
  type DirectQuote,
  type PreparedDirectMarket,
} from "./index";
import { assert } from "./snapshot";

const dust = /zero|dust|round|positive u64|amount out must be greater than 0/i;
const capacity = /liquidity|capacity|partial|remaining|exceed.*reserve/i;
const max = (1n << 64n) - 1n;

/** Creates a cached exact-input buy evaluator for one prepared snapshot.
 * @remarks No RPC, wallet selection or fee budgeting. Capacity is the largest quoteable
 * input within both bounds; output caps refer to expected received tokens. Dust returns
 * zero, recognized liquidity limits narrow the search, and other protocol errors propagate.
 * Cache ownership lasts only for this planning operation. Final quotes are sealed to market.
 */
export function createDirectBuySizer(
  market: PreparedDirectMarket,
  slippageBps: number,
) {
  assert(
    Number.isInteger(slippageBps) && slippageBps >= 0 && slippageBps < 10000,
    "Invalid buy slippage",
  );
  const cache = new Map<bigint, DirectQuote | null | "capacity">();
  const evaluate = (amount: bigint) => {
    assert(amount > 0n && amount <= max, "Invalid buy input");
    if (cache.has(amount)) return cache.get(amount)!;
    let result: DirectQuote | null | "capacity";
    try {
      result = quoteDirectSwap(market, market.quoteMint, amount, slippageBps);
    } catch (error) {
      if (error instanceof Error && dust.test(error.message)) result = null;
      else if (error instanceof Error && capacity.test(error.message))
        result = "capacity";
      else throw error;
    }
    cache.set(amount, result);
    return result;
  };
  return {
    capacity(maxInput: bigint, maxOutput: bigint): bigint {
      assert(
        maxInput >= 0n &&
          maxInput <= max &&
          maxOutput >= 0n &&
          maxOutput <= max,
        "Invalid buy capacity bounds",
      );
      if (!maxInput || !maxOutput) return 0n;
      const allowed = (value: ReturnType<typeof evaluate>) =>
        value !== "capacity" && (!value || value.expectedOutput <= maxOutput);
      const full = evaluate(maxInput);
      if (allowed(full))
        return full && full !== "capacity" && full.expectedOutput > 0n
          ? maxInput
          : 0n;
      let low = 0n,
        high = maxInput;
      while (low < high) {
        const mid = (low + high + 1n) / 2n;
        if (allowed(evaluate(mid))) low = mid;
        else high = mid - 1n;
      }
      const result = low ? evaluate(low) : null;
      return result && result !== "capacity" && result.expectedOutput > 0n
        ? low
        : 0n;
    },
    quote(amount: bigint): DirectQuote | null {
      const result = evaluate(amount);
      assert(result !== "capacity", "Buy exceeds prepared liquidity");
      return result && result.expectedOutput > 0n ? result : null;
    },
  };
}
