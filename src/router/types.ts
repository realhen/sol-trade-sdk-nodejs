import type {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";

export interface PrepareJupiterRouteOptions {
  connection: Connection;
  owner: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  amountIn: bigint;
  slippageBps: number;
  apiKey?: string;
  transport?: typeof fetch;
  now?: () => number;
  /** Local quote lifetime, from preparation start. Default 10 seconds; maximum 30 seconds. */
  maxAgeMs?: number;
  /** Require exactly one 100% on-chain swap leg between the requested mints.
   * V2 /build has no documented direct-only request parameter; a multihop or
   * split response is rejected, never silently converted or retried as a route.
   */
  directPairOnly?: boolean;
  /** Explicit native SOL input: fund the owner's WSOL ATA by exactly amountIn. Does not close it. */
  wrapNativeInput?: boolean;
  /** Explicit native SOL output: close the owner's WSOL ATA to that owner, including any prior WSOL balance. */
  unwrapNativeOutput?: boolean;
}
export interface RouterLeg {
  pool: string;
  label: string;
  inputMint: string;
  outputMint: string;
  bps: number;
}
export interface PreparedRouterTrade {
  provider: "jupiter";
  routeId: string;
  swapInstructionData: string;
  owner: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  inputTokenProgram: PublicKey;
  outputTokenProgram: PublicKey;
  amountIn: bigint;
  quotedAmountOut: bigint;
  minimumAmountOut: bigint;
  preparedAtMs: number;
  expiresAtMs: number;
  wrapNativeInput: boolean;
  unwrapNativeOutput: boolean;
  directPairOnly: boolean;
  /** A bonding-curve leg permits spending less than the input budget; settle actual debits. */
  allowsPartialFill: boolean;
  routeLegs: RouterLeg[];
  instructions: TransactionInstruction[];
  lookupTables: AddressLookupTableAccount[];
}
export interface JupiterDecodedStep {
  allowsPartialFill?: boolean;
  variant: string;
  bps: number;
  inputIndex: number;
  outputIndex: number;
}
export interface DecodedJupiterRoute {
  sharedAccountsId?: number;
  amountIn: bigint;
  quotedAmountOut: bigint;
  minimumAmountOut: bigint;
  slippageBps: number;
  steps: JupiterDecodedStep[];
}

export interface PrepareJupiterSellForSolValueOptions extends Omit<
  PrepareJupiterRouteOptions,
  "amountIn"
> {
  maximumInputAmount: bigint;
  targetLamports: bigint;
  /** Expected SOL output may undershoot by this tolerance, never exceed the target. Default 10 bps. */
  targetToleranceBps?: number;
}

export interface PrepareJupiterSellForQuoteValueOptions extends Omit<
  PrepareJupiterRouteOptions,
  "amountIn"
> {
  maximumInputAmount: bigint;
  /** Desired expected output, in outputMint atomic units. */
  targetAmount: bigint;
  /** Expected output may undershoot by this tolerance, never exceed the target. Default 10 bps. */
  targetToleranceBps?: number;
}
