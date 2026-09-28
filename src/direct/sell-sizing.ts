import {
  quoteDirectSwap,
  type DirectQuote,
  type PreparedDirectMarket,
} from "./index";
import { assert } from "./snapshot";

/** Single-swap curve estimate, with amounts expressed in atomic input and quote units. */
export interface DirectSellSizing {
  readonly inputAmount: bigint;
  readonly expectedOutput: bigint;
}

const dust =
  /zero|dust|round|positive u64|amount out must be greater than 0|fees exceed total output; final quote is negative/i;
const capacity = /liquidity|capacity|partial|remaining|exceed.*reserve/i;

/** Quotes an explicit token input; returns null only when the amount is unexecutable dust.
 * @remarks Protocol/state errors propagate. The caller owns any decision to skip or redistribute
 * a dust amount. A successful result is a sealed quote accepted by buildDirectSwap.
 */
export function tryQuoteDirectSell(
  market: PreparedDirectMarket,
  inputAmount: bigint,
  slippageBps: number,
): DirectQuote | null {
  assert(
    typeof inputAmount === "bigint" &&
      inputAmount > 0n &&
      inputAmount <= (1n << 64n) - 1n,
    "Invalid sell input",
  );
  assert(
    Number.isInteger(slippageBps) && slippageBps >= 0 && slippageBps < 10000,
    "Invalid sell slippage",
  );
  try {
    return quoteDirectSwap(market, market.mint, inputAmount, slippageBps);
  } catch (error) {
    if (error instanceof Error && dust.test(error.message)) return null;
    throw error;
  }
}

/** Finds token input for expected quote proceeds, bounded by a caller-specified input limit.
 * @remarks Uses only prepared pool state. Returns the closest quoteable amount when the target
 * exceeds the input limit or prepared liquidity; returns zero for wholly unexecutable dust.
 * This is a single-swap curve estimate. It knows no wallets, allocation weights or presets.
 * Slippage is applied separately when quoting the chosen token amount.
 */
export function sizeDirectSellForExpectedOutput(
  market: PreparedDirectMarket,
  target: bigint,
  maxInput: bigint,
): DirectSellSizing {
  const max = (1n << 64n) - 1n;
  assert(
    typeof target === "bigint" && target > 0n && target <= max,
    "Invalid sell target",
  );
  assert(
    typeof maxInput === "bigint" && maxInput >= 0n && maxInput <= max,
    "Invalid sell input limit",
  );
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
    high = maxInput > 0n ? 1n : 0n;
  while (high < maxInput) {
    const output = evaluate(high);
    if (output === null || output >= target) break;
    low = high;
    high = high * 2n > maxInput ? maxInput : high * 2n;
  }
  while (low < high) {
    const mid = (low + high) / 2n;
    const output = evaluate(mid);
    if (output === null || output >= target) high = mid;
    else low = mid + 1n;
  }
  let amount = low;
  if (evaluate(amount) === null) amount--;
  const expectedOutput = amount > 0n ? (evaluate(amount) ?? 0n) : 0n;
  return Object.freeze({
    inputAmount: expectedOutput > 0n ? amount : 0n,
    expectedOutput,
  });
}
