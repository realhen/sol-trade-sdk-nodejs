import {
  type Connection,
  type GetProgramAccountsFilter,
  PublicKey,
} from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { bondingCurvePda } from "@pump-fun/pump-sdk";
import { getBonkPoolPDA } from "../instruction/bonk_builder";

/** Subscription candidates, not authenticated markets or permission to trade. */
export interface DirectLaunchTargets {
  accounts: string[];
  programs: { address: string; filters: GetProgramAccountsFilter[] }[];
}

/** Returns mint-scoped discovery targets for Pump.fun, SOL LaunchLab and Meteora DBC.
 * @remarks DBC's base mint is at offset 136 in VirtualPool (official DBC IDL,
 * SHA256 beedc8c869bc04865c26349a72a3ba9c773e61f48be2d33093c591a015fe82fd).
 * Missing accounts are expected before launch. Every candidate must go through
 * prepareDirectMarket before it is usable; subscriptions confer no trust.
 */
export function directLaunchTargets(mint: PublicKey): DirectLaunchTargets {
  if (mint.equals(PublicKey.default) || mint.equals(NATIVE_MINT)) {
    throw new Error("Enter a token mint address.");
  }
  return {
    accounts: [bondingCurvePda(mint), getBonkPoolPDA(mint, NATIVE_MINT)].map(
      (key) => key.toBase58(),
    ),
    programs: [
      {
        address: "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
        filters: [{ memcmp: { offset: 136, bytes: mint.toBase58() } }],
      },
    ],
  };
}

/** Recovers candidates after subscriptions are acknowledged, including launches missed offline.
 * @returns Existing candidate addresses, bounded to eight; callers validate identity and readiness.
 * @throws Rejects on RPC failure or excessive matching pools rather than silently losing coverage.
 */
export async function readDirectLaunchPools(
  connection: Pick<
    Connection,
    "getMultipleAccountsInfo" | "getProgramAccounts"
  >,
  mint: PublicKey,
): Promise<string[]> {
  const targets = directLaunchTargets(mint);
  const [accounts, ...programs] = await Promise.all([
    connection.getMultipleAccountsInfo(
      targets.accounts.map((key) => new PublicKey(key)),
      "confirmed",
    ),
    ...targets.programs.map((target) =>
      connection.getProgramAccounts(new PublicKey(target.address), {
        commitment: "confirmed",
        filters: target.filters,
        dataSlice: { offset: 0, length: 0 },
      }),
    ),
  ]);
  const pools = [
    ...targets.accounts.filter((_, index) => accounts[index] !== null),
    ...programs.flatMap((values) =>
      values.map((value) => value.pubkey.toBase58()),
    ),
  ];
  if (pools.length > 8) throw new Error("Too many launch pools for this mint.");
  return [...new Set(pools)];
}
