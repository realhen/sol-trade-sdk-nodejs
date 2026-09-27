import { Buffer } from "buffer";
/**
 * Bonk Protocol Instruction Builder
 *
 * Production-grade instruction builder for Bonk AMM protocol.
 * Builds LaunchLab exact-input trades with explicit pool quote context.
 * Arbitrary quote configurations require a caller-validated output floor.
 */

import {
  PublicKey,
  Keypair,
  AccountMeta,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  NATIVE_MINT,
  createSyncNativeInstruction,
} from "../common/spl-token";

import {
  assertU64Amount,
  resolveMintPair,
  validatePoolTokenProgram,
  validateSwapAmounts,
} from "./mint-pair";

// ============================================
// Program IDs and Constants - from Rust src/instruction/utils/bonk.rs
// ============================================

/** Bonk program ID */
export const BONK_PROGRAM_ID = new PublicKey(
  "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
);

/** Bonk Authority */
export const BONK_AUTHORITY = new PublicKey(
  "WLhv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh",
);

/** Bonk Global Config */
export const BONK_GLOBAL_CONFIG = new PublicKey(
  "6s1xP3hpbAfFoNtUNF8mfHsjr2Bd97JxFJRWLbL6aHuX",
);

/** Bonk USD1 Global Config */
export const BONK_USD1_GLOBAL_CONFIG = new PublicKey(
  "EPiZbnrThjyLnoQ6QQzkxeFqyL5uyg9RzNHHAudUPxBz",
);

/** Bonk Event Authority */
export const BONK_EVENT_AUTHORITY = new PublicKey(
  "2DPAtwB8L12vrMRExbLuyGnC7n2J5LNoZQSejeQGpwkr",
);

/** WSOL Token Account (mint) */
export const WSOL_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112",
);

/** USD1 Token Account (mint) */
export const USD1_MINT = new PublicKey(
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB",
);

/** USDC Token Account (mint) */
export const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);

/** Fee rates - from Rust */
export const BONK_PLATFORM_FEE_RATE = BigInt(100); // 1%
export const BONK_PROTOCOL_FEE_RATE = BigInt(25); // 0.25%
export const BONK_SHARE_FEE_RATE = BigInt(0); // 0%

// ============================================
// Discriminators - from Rust src/instruction/utils/bonk.rs
// ============================================

/** Buy exact in instruction discriminator */
export const BONK_BUY_EXACT_IN_DISCRIMINATOR: Buffer = Buffer.from([
  250, 234, 13, 123, 213, 156, 19, 236,
]);

/** Sell exact in instruction discriminator */
export const BONK_SELL_EXACT_IN_DISCRIMINATOR: Buffer = Buffer.from([
  149, 39, 222, 155, 211, 124, 152, 26,
]);

// ============================================
// Seeds
// ============================================

export const BONK_POOL_SEED = Buffer.from("pool");
export const BONK_POOL_VAULT_SEED = Buffer.from("pool_vault");

// ============================================
// PDA Derivation Functions
// ============================================

/**
 * Derive the pool PDA for given base and quote mints
 */
export function getBonkPoolPda(
  baseMint: PublicKey,
  quoteMint: PublicKey,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [BONK_POOL_SEED, baseMint.toBuffer(), quoteMint.toBuffer()],
    BONK_PROGRAM_ID,
  );
  return pda;
}

/**
 * Derive the vault PDA for given pool and mint
 */
export function getBonkVaultPda(
  poolState: PublicKey,
  mint: PublicKey,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [BONK_POOL_VAULT_SEED, poolState.toBuffer(), mint.toBuffer()],
    BONK_PROGRAM_ID,
  );
  return pda;
}

/**
 * Get platform associated account PDA
 */
export function getBonkPlatformAssociatedAccount(
  platformConfig: PublicKey,
  quoteMint: PublicKey = WSOL_MINT,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [platformConfig.toBuffer(), quoteMint.toBuffer()],
    BONK_PROGRAM_ID,
  );
  return pda;
}

/**
 * Get creator associated account PDA
 */
export function getBonkCreatorAssociatedAccount(
  creator: PublicKey,
  quoteMint: PublicKey = WSOL_MINT,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [creator.toBuffer(), quoteMint.toBuffer()],
    BONK_PROGRAM_ID,
  );
  return pda;
}

// ============================================
// Types
// ============================================

export interface BonkParams {
  /** Validated pool base mint; required for arbitrary quote configurations. */
  baseMint?: PublicKey;
  /** Actual SPL quote mint from the pool. Omitted only for legacy SOL/USD1 configurations. */
  quoteMint?: PublicKey;
  /** Quote mint owner. Only the classic token program is supported by this direct builder. */
  quoteTokenProgram?: PublicKey;
  poolState: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  virtualBase: bigint;
  virtualQuote: bigint;
  realBase: bigint;
  realQuote: bigint;
  mintTokenProgram: PublicKey;
  platformConfig: PublicKey;
  platformAssociatedAccount: PublicKey;
  creatorAssociatedAccount: PublicKey;
  globalConfig?: PublicKey;
}

export interface BonkBuildBuyParams {
  payer: Keypair | PublicKey;
  outputMint: PublicKey;
  /** Requested quote asset; the native SOL alias is accepted for WSOL pools. */
  inputMint?: PublicKey;
  inputAmount: bigint;
  slippageBasisPoints?: bigint;
  /** Legacy exact-input minimum-output alias; does not select exact-output mode. */
  fixedOutputAmount?: bigint;
  /** Exact-input output floor in output-mint atomic units, already adjusted for slippage. */
  minimumOutputAmount?: bigint;
  createInputMintAta?: boolean;
  createOutputMintAta?: boolean;
  closeInputMintAta?: boolean;
  protocolParams: BonkParams;
}

export interface BonkBuildSellParams {
  payer: Keypair | PublicKey;
  inputMint: PublicKey;
  /** Requested quote asset; the native SOL alias is accepted for WSOL pools. */
  outputMint?: PublicKey;
  inputAmount: bigint;
  slippageBasisPoints?: bigint;
  /** Legacy exact-input minimum-output alias; does not select exact-output mode. */
  fixedOutputAmount?: bigint;
  /** Exact-input output floor in output-mint atomic units, already adjusted for slippage. */
  minimumOutputAmount?: bigint;
  createOutputMintAta?: boolean;
  closeOutputMintAta?: boolean;
  closeInputMintAta?: boolean;
  protocolParams: BonkParams;
}

/**
 * Resolve a caller-validated LaunchLab account context. This builder does not fetch or
 * authenticate config accounts. New quote configurations require all identities and an
 * explicit floor because legacy hardcoded fee arithmetic does not describe their fees.
 */
function accountContext(params: BonkParams, requestedBase: PublicKey) {
  const legacyUsd1 =
    params.globalConfig?.equals(BONK_USD1_GLOBAL_CONFIG) ?? false;
  const knownConfig =
    params.globalConfig === undefined ||
    legacyUsd1 ||
    params.globalConfig.equals(BONK_GLOBAL_CONFIG);
  if (!knownConfig && !params.quoteMint)
    throw new Error("Custom LaunchLab config requires an explicit quote mint");
  const quoteMint = params.quoteMint ?? (legacyUsd1 ? USD1_MINT : WSOL_MINT);
  const legacyQuote =
    quoteMint.equals(WSOL_MINT) || quoteMint.equals(USD1_MINT);
  if (
    !legacyQuote &&
    (!params.baseMint || !params.quoteTokenProgram || !params.globalConfig)
  ) {
    throw new Error(
      "Arbitrary LaunchLab quote requires explicit baseMint, quoteMint, quoteTokenProgram and globalConfig",
    );
  }
  const globalConfig =
    params.globalConfig ??
    (quoteMint.equals(USD1_MINT)
      ? BONK_USD1_GLOBAL_CONFIG
      : BONK_GLOBAL_CONFIG);
  if (
    (globalConfig.equals(BONK_GLOBAL_CONFIG) && !quoteMint.equals(WSOL_MINT)) ||
    (globalConfig.equals(BONK_USD1_GLOBAL_CONFIG) &&
      !quoteMint.equals(USD1_MINT))
  ) {
    throw new Error("LaunchLab global config does not match the quote mint");
  }
  if (
    [
      globalConfig,
      params.platformConfig,
      params.platformAssociatedAccount,
      params.creatorAssociatedAccount,
    ].some((key) => key.equals(PublicKey.default))
  ) {
    throw new Error("Incomplete LaunchLab account context");
  }
  const baseMint = params.baseMint ?? requestedBase;
  const quoteTokenProgram = params.quoteTokenProgram ?? TOKEN_PROGRAM_ID;
  validatePoolTokenProgram(baseMint, params.mintTokenProgram);
  // The classic quote path is verified; Token-2022 quote extensions need separate protocol validation.
  if (!quoteTokenProgram.equals(TOKEN_PROGRAM_ID))
    throw new Error(
      "LaunchLab direct quotes require the classic token program; Token-2022 quotes are unsupported",
    );
  resolveMintPair(baseMint, quoteMint, baseMint, quoteMint);
  return {
    baseMint,
    quoteMint,
    quoteTokenProgram,
    globalConfig,
    requiresFloor: !legacyQuote || !knownConfig,
  };
}

/** Legacy reserve-based floor retained for built-in SOL/USD1 callers. */
function legacyAmountOut(
  amountIn: bigint,
  params: BonkParams,
  slippageBps: bigint,
  buy: boolean,
): bigint {
  for (const [name, value] of Object.entries({
    virtualBase: params.virtualBase,
    virtualQuote: params.virtualQuote,
    realBase: params.realBase,
    realQuote: params.realQuote,
  })) {
    assertU64Amount(value, name);
  }
  const inputReserve = params.virtualQuote + params.realQuote;
  const outputReserve = params.virtualBase - params.realBase;
  if (inputReserve <= 0n || outputReserve <= 0n)
    throw new Error("Invalid LaunchLab reserves");
  const afterFees = (amount: bigint) =>
    amount -
    (amount * BONK_PROTOCOL_FEE_RATE) / 10000n -
    (amount * BONK_PLATFORM_FEE_RATE) / 10000n -
    (amount * BONK_SHARE_FEE_RATE) / 10000n;
  const netInput = buy ? afterFees(amountIn) : amountIn;
  const grossOutput = buy
    ? (netInput * outputReserve) / (inputReserve + netInput)
    : (netInput * inputReserve) / (outputReserve + netInput);
  const output = buy ? grossOutput : afterFees(grossOutput);
  return output - (output * slippageBps) / 10000n;
}

/**
 * Build an exact-input LaunchLab buy against a caller-validated pool and config.
 * Arbitrary quotes require an explicit minimum; no SOL conversion is performed.
 */
export function buildBonkBuyInstructions(
  params: BonkBuildBuyParams,
): TransactionInstruction[] {
  return buildBonkInstructions(params, "buy");
}

/**
 * Build an exact-input LaunchLab sell against a caller-validated pool and config.
 * fixedOutputAmount retains its legacy meaning as an output floor, not an exact-output request.
 */
export function buildBonkSellInstructions(
  params: BonkBuildSellParams,
): TransactionInstruction[] {
  return buildBonkInstructions(params, "sell");
}

function buildBonkInstructions(
  params: BonkBuildBuyParams | BonkBuildSellParams,
  side: "buy" | "sell",
): TransactionInstruction[] {
  validateSwapAmounts(params);
  const { payer, inputAmount, protocolParams } = params;
  const buy = side === "buy";
  const requestedBase = (buy ? params.outputMint : params.inputMint)!;
  const {
    baseMint,
    quoteMint,
    quoteTokenProgram,
    globalConfig,
    requiresFloor,
  } = accountContext(protocolParams, requestedBase);
  const pair = resolveMintPair(
    baseMint,
    quoteMint,
    params.inputMint,
    params.outputMint,
  );
  if (pair.aToB === buy)
    throw new Error(
      "Requested mint pair has the wrong LaunchLab buy/sell direction",
    );
  const explicitFloor = params.minimumOutputAmount ?? params.fixedOutputAmount;
  if (requiresFloor && explicitFloor === undefined)
    throw new Error(
      "Custom LaunchLab quote/config requires an explicit minimumOutputAmount floor",
    );
  const minimumAmountOut =
    explicitFloor ??
    legacyAmountOut(
      inputAmount,
      protocolParams,
      params.slippageBasisPoints ?? 1000n,
      buy,
    );
  assertU64Amount(minimumAmountOut, "minimumOutputAmount");
  const payerPubkey = payer instanceof Keypair ? payer.publicKey : payer;
  const poolState = protocolParams.poolState.equals(PublicKey.default)
    ? getBonkPoolPda(baseMint, quoteMint)
    : protocolParams.poolState;
  const baseVault = protocolParams.baseVault.equals(PublicKey.default)
    ? getBonkVaultPda(poolState, baseMint)
    : protocolParams.baseVault;
  const quoteVault = protocolParams.quoteVault.equals(PublicKey.default)
    ? getBonkVaultPda(poolState, quoteMint)
    : protocolParams.quoteVault;
  const userBaseTokenAccount = getAssociatedTokenAddressSync(
    baseMint,
    payerPubkey,
    true,
    protocolParams.mintTokenProgram,
  );
  const userQuoteTokenAccount = getAssociatedTokenAddressSync(
    quoteMint,
    payerPubkey,
    true,
    quoteTokenProgram,
  );
  const instructions: TransactionInstruction[] = [];
  const createQuoteAta = buy
    ? ((params as BonkBuildBuyParams).createInputMintAta ?? true)
    : (params.createOutputMintAta ?? true);
  if (createQuoteAta) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        userQuoteTokenAccount,
        payerPubkey,
        quoteMint,
        quoteTokenProgram,
      ),
    );
    if (buy && quoteMint.equals(NATIVE_MINT)) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: payerPubkey,
          toPubkey: userQuoteTokenAccount,
          lamports: inputAmount,
        }),
      );
      instructions.push(createSyncNativeInstruction(userQuoteTokenAccount));
    }
  }
  if (buy && (params.createOutputMintAta ?? true)) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        userBaseTokenAccount,
        payerPubkey,
        baseMint,
        protocolParams.mintTokenProgram,
      ),
    );
  }
  const data = Buffer.alloc(32);
  (buy
    ? BONK_BUY_EXACT_IN_DISCRIMINATOR
    : BONK_SELL_EXACT_IN_DISCRIMINATOR
  ).copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 8);
  data.writeBigUInt64LE(minimumAmountOut, 16);
  data.writeBigUInt64LE(0n, 24);
  const keys: AccountMeta[] = [
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: BONK_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: globalConfig, isSigner: false, isWritable: false },
    {
      pubkey: protocolParams.platformConfig,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: poolState, isSigner: false, isWritable: true },
    { pubkey: userBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: baseVault, isSigner: false, isWritable: true },
    { pubkey: quoteVault, isSigner: false, isWritable: true },
    { pubkey: baseMint, isSigner: false, isWritable: false },
    { pubkey: quoteMint, isSigner: false, isWritable: false },
    {
      pubkey: protocolParams.mintTokenProgram,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: quoteTokenProgram, isSigner: false, isWritable: false },
    { pubkey: BONK_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: BONK_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    {
      pubkey: protocolParams.platformAssociatedAccount,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: protocolParams.creatorAssociatedAccount,
      isSigner: false,
      isWritable: true,
    },
  ];
  instructions.push(
    new TransactionInstruction({ keys, programId: BONK_PROGRAM_ID, data }),
  );
  const closeQuoteAta = buy
    ? params.closeInputMintAta
    : (params as BonkBuildSellParams).closeOutputMintAta;
  if (closeQuoteAta && quoteMint.equals(NATIVE_MINT)) {
    instructions.push(
      createCloseAccountInstruction(
        userQuoteTokenAccount,
        payerPubkey,
        payerPubkey,
      ),
    );
  }
  if (!buy && params.closeInputMintAta) {
    instructions.push(
      createCloseAccountInstruction(
        userBaseTokenAccount,
        payerPubkey,
        payerPubkey,
        [],
        protocolParams.mintTokenProgram,
      ),
    );
  }
  return instructions;
}

// ===== Pool State Decoder - from Rust: src/instruction/utils/bonk_types.rs =====

/** Full Anchor account length, including the discriminator and 64-byte reserved tail. */
export const BONK_POOL_STATE_SIZE = 429;
export const BONK_POOL_STATE_DISCRIMINATOR = Buffer.from([
  247, 237, 227, 245, 215, 195, 222, 70,
]);

export interface BonkVestingSchedule {
  totalLockedAmount: bigint;
  cliffPeriod: bigint;
  unlockPeriod: bigint;
  startTime: bigint;
  allocatedShareAmount: bigint;
}

export interface BonkPoolState {
  epoch: bigint;
  authBump: number;
  status: number;
  baseDecimals: number;
  quoteDecimals: number;
  migrateType: number;
  supply: bigint;
  totalBaseSell: bigint;
  virtualBase: bigint;
  virtualQuote: bigint;
  realBase: bigint;
  realQuote: bigint;
  totalQuoteFundRaising: bigint;
  quoteProtocolFee: bigint;
  platformFee: bigint;
  migrateFee: bigint;
  vestingSchedule: BonkVestingSchedule;
  globalConfig: PublicKey;
  platformConfig: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  creator: PublicKey;
}

/**
 * Decode the full LaunchLab RPC account, including its Anchor discriminator.
 * Matches Raydium LaunchpadPool; truncated or wrong-type accounts fail closed.
 * Trailing reserved bytes are tolerated, matching the Rust account loader.
 * Owner and pool-address validation remain the caller's responsibility.
 */
export function decodeBonkPoolState(data: Buffer): BonkPoolState | null {
  if (
    data.length < BONK_POOL_STATE_SIZE ||
    !data.subarray(0, 8).equals(BONK_POOL_STATE_DISCRIMINATOR)
  ) {
    return null;
  }

  try {
    let offset = 8;

    // epoch: u64
    const epoch = data.readBigUInt64LE(offset);
    offset += 8;

    // auth_bump: u8
    const authBump = data.readUInt8(offset);
    offset += 1;

    // status: u8
    const status = data.readUInt8(offset);
    offset += 1;

    // base_decimals: u8
    const baseDecimals = data.readUInt8(offset);
    offset += 1;

    // quote_decimals: u8
    const quoteDecimals = data.readUInt8(offset);
    offset += 1;

    // migrate_type: u8
    const migrateType = data.readUInt8(offset);
    offset += 1;

    // supply: u64
    const supply = data.readBigUInt64LE(offset);
    offset += 8;

    // total_base_sell: u64
    const totalBaseSell = data.readBigUInt64LE(offset);
    offset += 8;

    // virtual_base: u64
    const virtualBase = data.readBigUInt64LE(offset);
    offset += 8;

    // virtual_quote: u64
    const virtualQuote = data.readBigUInt64LE(offset);
    offset += 8;

    // real_base: u64
    const realBase = data.readBigUInt64LE(offset);
    offset += 8;

    // real_quote: u64
    const realQuote = data.readBigUInt64LE(offset);
    offset += 8;

    // total_quote_fund_raising: u64
    const totalQuoteFundRaising = data.readBigUInt64LE(offset);
    offset += 8;

    // quote_protocol_fee: u64
    const quoteProtocolFee = data.readBigUInt64LE(offset);
    offset += 8;

    // platform_fee: u64
    const platformFee = data.readBigUInt64LE(offset);
    offset += 8;

    // migrate_fee: u64
    const migrateFee = data.readBigUInt64LE(offset);
    offset += 8;

    // vesting_schedule: VestingSchedule (5 * u64)
    const vestingSchedule: BonkVestingSchedule = {
      totalLockedAmount: data.readBigUInt64LE(offset),
      cliffPeriod: data.readBigUInt64LE(offset + 8),
      unlockPeriod: data.readBigUInt64LE(offset + 16),
      startTime: data.readBigUInt64LE(offset + 24),
      allocatedShareAmount: data.readBigUInt64LE(offset + 32),
    };
    offset += 40;

    // global_config: Pubkey
    const globalConfig = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // platform_config: Pubkey
    const platformConfig = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // base_mint: Pubkey
    const baseMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // quote_mint: Pubkey
    const quoteMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // base_vault: Pubkey
    const baseVault = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // quote_vault: Pubkey
    const quoteVault = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // creator: Pubkey
    const creator = new PublicKey(data.subarray(offset, offset + 32));
    // offset += 32; // Not needed, last field

    return {
      epoch,
      authBump,
      status,
      baseDecimals,
      quoteDecimals,
      migrateType,
      supply,
      totalBaseSell,
      virtualBase,
      virtualQuote,
      realBase,
      realQuote,
      totalQuoteFundRaising,
      quoteProtocolFee,
      platformFee,
      migrateFee,
      vestingSchedule,
      globalConfig,
      platformConfig,
      baseMint,
      quoteMint,
      baseVault,
      quoteVault,
      creator,
    };
  } catch {
    return null;
  }
}

// ===== Async Fetch Functions - from Rust: src/instruction/utils/bonk.rs =====

/**
 * Fetch a Bonk pool state from RPC.
 * 100% from Rust: src/instruction/utils/bonk.rs fetch_pool_state
 */
export async function fetchBonkPoolState(
  connection: {
    getAccountInfo: (
      pubkey: PublicKey,
    ) => Promise<{ value?: { data: Buffer } }>;
  },
  poolAddress: PublicKey,
): Promise<BonkPoolState | null> {
  const account = await connection.getAccountInfo(poolAddress);
  if (!account?.value?.data) {
    return null;
  }
  return decodeBonkPoolState(account.value.data);
}

/**
 * Get pool PDA for Bonk.
 * Seeds: ["pool", base_mint, quote_mint]
 */
export function getBonkPoolPDA(
  baseMint: PublicKey,
  quoteMint: PublicKey,
): PublicKey {
  const POOL_SEED = Buffer.from("pool");
  const [pda] = PublicKey.findProgramAddressSync(
    [POOL_SEED, baseMint.toBuffer(), quoteMint.toBuffer()],
    BONK_PROGRAM_ID,
  );
  return pda;
}

/**
 * Get vault PDA for Bonk.
 * Seeds: ["pool_vault", pool_state, mint]
 */
export function getBonkVaultPDA(
  poolState: PublicKey,
  mint: PublicKey,
): PublicKey {
  const POOL_VAULT_SEED = Buffer.from("pool_vault");
  const [pda] = PublicKey.findProgramAddressSync(
    [POOL_VAULT_SEED, poolState.toBuffer(), mint.toBuffer()],
    BONK_PROGRAM_ID,
  );
  return pda;
}
