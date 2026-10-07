import type {
  Connection,
  Keypair,
  TransactionInstruction,
} from "@solana/web3.js";

/** Launch origin retained after its destination pool replaces the curve. */
export type SandboxLaunchpad = "Pump.fun" | "LaunchLab" | "Meteora DBC";
export type SandboxVenue =
  SandboxLaunchpad | "PumpSwap" | "Raydium CPMM" | "Meteora DAMM v2";
/** Confirmed local token identity. Configuration identifies the original curve after migration. */
export interface SandboxMarket {
  mint: string;
  pool: string;
  launchpad: SandboxLaunchpad;
  creationSignature: string;
  config?: string;
}
/** Confirmed pool values: progress in percent0..100, prices and liquidity in SOL. */
export interface SandboxObservation {
  pool: string;
  venue: SandboxVenue;
  progress: number;
  priceSol: number;
  liquiditySol: number;
  excludedOwners: string[];
}
/** Signing and sending remain owned by the sandbox application. */
export interface SandboxContext {
  connection: Connection;
  send: (
    instructions: TransactionInstruction[],
    signer: Keypair,
    extra?: Keypair[],
  ) => Promise<string>;
}
export interface SandboxAdapter {
  launch(payer: Keypair, name: string, symbol: string): Promise<SandboxMarket>;
  trade(
    market: SandboxMarket,
    signer: Keypair,
    side: "buy" | "sell",
    rawAmount: bigint,
  ): Promise<string>;
  migrate(
    market: SandboxMarket,
    signer: Keypair,
  ): Promise<{ pool: string; signature: string }>;
  inspect(market: SandboxMarket): Promise<SandboxObservation>;
}
