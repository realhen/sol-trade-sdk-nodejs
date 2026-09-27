import { type AccountInfo, PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
export type ChainAccount = AccountInfo<Buffer>;
export type AccountReader = (
  address: string,
) => ChainAccount | null | undefined;
export interface MarketSnapshot {
  pool: string;
  mint: string;
  quoteMint: string;
  venue: string;
  wallet: string;
  accounts: ReadonlyMap<string, ChainAccount | null>;
}
export function assert(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(reason);
}
export function account(snapshot: MarketSnapshot, key: PublicKey) {
  return snapshot.accounts.get(key.toBase58());
}
