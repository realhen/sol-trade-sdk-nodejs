import { PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  GLOBAL_PDA,
  PUMP_FEE_CONFIG_PDA,
  bondingCurvePda,
  canonicalPumpPoolPda,
} from "@pump-fun/pump-sdk";
import {
  GLOBAL_CONFIG_PDA,
  PUMP_AMM_FEE_CONFIG_PDA,
} from "@pump-fun/pump-swap-sdk";

/** Shared direct-market inputs that a caller may snapshot and maintain by account subscription.
 * @remarks These accounts are mutable. Cached values require a healthy subscription and
 * recovery after disconnect; this list grants no freshness or trading authorization.
 */
export function directSharedAccounts(): PublicKey[] {
  return [
    GLOBAL_PDA,
    PUMP_FEE_CONFIG_PDA,
    GLOBAL_CONFIG_PDA,
    PUMP_AMM_FEE_CONFIG_PDA,
    NATIVE_MINT,
  ].map((key) => new PublicKey(key.toBytes()));
}

/** Returns speculative initial addresses without performing RPC or trusting page venue hints.
 * @remarks Canonical Pump curves can start with a SOL-quoted dependency set derived from
 * the mint. Preparation must still validate owner, pair, quote, migration and token state;
 * other quote currencies or migrated pools require additional discovery. Other venues
 * start with the selected pool and mint. Missing future pools are valid observations.
 */
export function directMarketAccountHints(
  pool: PublicKey,
  mint: PublicKey,
): PublicKey[] {
  const keys = pool.equals(bondingCurvePda(mint))
    ? [
        pool,
        mint,
        NATIVE_MINT,
        canonicalPumpPoolPda(mint),
        GLOBAL_PDA,
        PUMP_FEE_CONFIG_PDA,
      ]
    : [pool, mint];
  return [
    ...new Map(
      keys.map((key) => [key.toBase58(), new PublicKey(key.toBytes())]),
    ).values(),
  ];
}
