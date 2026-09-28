import type { TransactionInstruction } from "@solana/web3.js";

/** Conservative swap envelopes, excluding outer setup/cleanup and delivery overhead.
 * Concentrated venues scale with instruction accounts (tick/bin traversal). These are
 * resource safety envelopes, not congestion fees or a promise of exact CU consumption.
 */
const SWAP_UNITS: Record<string, number> = {
  "Pump.fun": 130_000,
  PumpSwap: 190_000,
  "Raydium CPMM": 130_000,
  "Raydium AMM v4": 180_000,
  "Raydium LaunchLab": 160_000,
  "Meteora DAMM v2": 140_000,
  "Meteora DAMM v1": 240_000,
  "Meteora DBC": 170_000,
  "Raydium CLMM": 300_000,
  "Orca Whirlpool": 300_000,
  "Meteora DLMM": 300_000,
};

/** Sizes the SDK-built instruction shape, including worst-case ATA creation, Token-2022,
 * native SOL setup, cleanup, nonce, memo and one relay tip. Never silently clamps an
 * oversized estimate. Callers may use successful simulation evidence to tighten further.
 */
export function directComputeUnitLimit(
  venue: string,
  setup: TransactionInstruction[],
  swap: TransactionInstruction[],
  cleanup: TransactionInstruction[],
): number {
  const base = SWAP_UNITS[venue];
  if (!base || !swap.length)
    throw new Error("Compute budget unavailable for direct venue");
  const traversal = ["Raydium CLMM", "Orca Whirlpool", "Meteora DLMM"].includes(
    venue,
  )
    ? swap.reduce(
        (sum, ix) => sum + Math.max(0, ix.keys.length - 12) * 12_000,
        0,
      )
    : 0;
  const units =
    base +
    traversal +
    (swap.length - 1) * 30_000 +
    (setup.length + cleanup.length) * 25_000 +
    15_000;
  const rounded = Math.ceil(units / 5_000) * 5_000;
  if (rounded > 1_400_000)
    throw new Error("Direct route exceeds the available compute budget");
  return rounded;
}
