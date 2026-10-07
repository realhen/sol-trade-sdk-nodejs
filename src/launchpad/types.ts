/** Launch origin retained after migration to its destination pool. */
export type Launchpad = "Pump.fun" | "LaunchLab" | "Meteora DBC";
export type LaunchpadVenue =
  Launchpad | "PumpSwap" | "Raydium CPMM" | "Meteora DAMM v2";
/** Public identity of a launch. Config identifies the original curve after migration. */
export interface LaunchpadMarket {
  mint: string;
  pool: string;
  launchpad: Launchpad;
  config?: string;
}
/** Confirmed SOL-pair observations. Progress is percent 0..100; price is SOL per whole token. */
export interface LaunchpadObservation {
  pool: string;
  venue: LaunchpadVenue;
  progress: number;
  priceSol: number;
  liquiditySol: number;
  excludedOwners: string[];
}
