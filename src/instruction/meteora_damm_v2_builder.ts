import { Buffer } from 'buffer';
import { resolveMintPair, validateSwapAmounts, validatePoolTokenProgram } from './mint-pair';
/**
 * Meteora DAMM V2 Protocol Instruction Builder
 *
 * Production-grade instruction builder for Meteora DAMM V2 protocol.
 * 100% port of Rust implementation.
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

// ============================================
// Program IDs and Constants
// ============================================


/** Meteora DAMM V2 program ID */
export const METEORA_DAMM_V2_PROGRAM_ID = new PublicKey(
  "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG"
);

/** Authority */
export const METEORA_DAMM_V2_AUTHORITY = new PublicKey(
  "HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC"
);

// ============================================
// Discriminators
// ============================================

/** Swap instruction discriminator */
export const METEORA_DAMM_V2_SWAP_DISCRIMINATOR: Buffer = Buffer.from([
  248, 198, 158, 145, 225, 117, 135, 200,
]);
export const METEORA_DAMM_V2_SWAP2_DISCRIMINATOR: Buffer = Buffer.from([
  65, 75, 63, 76, 235, 91, 91, 136,
]);
export const METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL = 1;

// ============================================
// Seeds
// ============================================

export const METEORA_DAMM_V2_EVENT_AUTHORITY_SEED = Buffer.from("__event_authority");

// ============================================
// PDA Derivation Functions
// ============================================

/**
 * Derive the event authority PDA
 */
export function getMeteoraDammV2EventAuthorityPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [METEORA_DAMM_V2_EVENT_AUTHORITY_SEED],
    METEORA_DAMM_V2_PROGRAM_ID
  );
  return pda;
}

// ============================================
// Types
// ============================================

export interface MeteoraDammV2Params {
  pool: PublicKey;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAVault: PublicKey;
  tokenBVault: PublicKey;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
}

export interface BuildMeteoraDammV2BuyInstructionsParams {
  payer: Keypair | PublicKey;
  inputMint?: PublicKey;
  outputMint?: PublicKey;
  inputAmount: bigint;
  slippageBasisPoints?: bigint;
  /** Legacy name for the partial-fill minimum output, not an exact-output request. */
  fixedOutputAmount?: bigint;
  /** Partial-fill exact-input output floor; cannot be combined with fixedOutputAmount. */
  minimumOutputAmount?: bigint;
  createInputMintAta?: boolean;
  createOutputMintAta?: boolean;
  closeInputMintAta?: boolean;
  protocolParams: MeteoraDammV2Params;
}

export interface BuildMeteoraDammV2SellInstructionsParams {
  payer: Keypair | PublicKey;
  inputMint?: PublicKey;
  outputMint?: PublicKey;
  inputAmount: bigint;
  slippageBasisPoints?: bigint;
  /** Legacy name for the partial-fill minimum output, not an exact-output request. */
  fixedOutputAmount?: bigint;
  /** Partial-fill exact-input output floor; cannot be combined with fixedOutputAmount. */
  minimumOutputAmount?: bigint;
  createOutputMintAta?: boolean;
  closeOutputMintAta?: boolean;
  closeInputMintAta?: boolean;
  protocolParams: MeteoraDammV2Params;
}

// ============================================
// Instruction Builders
// ============================================

/**
 * Build buy instructions for Meteora DAMM V2 protocol
 */
export function buildMeteoraDammV2BuyInstructions(
  params: BuildMeteoraDammV2BuyInstructionsParams
): TransactionInstruction[] {
  const {
    payer,
    inputMint: requestedInputMint,
    outputMint: requestedOutputMint,
    inputAmount,
    fixedOutputAmount,
    createInputMintAta = true,
    createOutputMintAta = true,
    closeInputMintAta = false,
    protocolParams,
  } = params;

  validateSwapAmounts(params);
  const minimumOutputAmount = params.minimumOutputAmount ?? fixedOutputAmount;
  if (minimumOutputAmount === undefined) {
    throw new Error('minimumOutputAmount or fixedOutputAmount must be set for Meteora DAMM V2 swap');
  }

  const payerPubkey = payer instanceof Keypair ? payer.publicKey : payer;
  const instructions: TransactionInstruction[] = [];

  const WSOL_TOKEN_ACCOUNT = new PublicKey("So11111111111111111111111111111111111111112");

  const {
    pool,
    tokenAMint,
    tokenBMint,
    tokenAVault,
    tokenBVault,
    tokenAProgram,
    tokenBProgram,
  } = protocolParams;

  const { inputMint, outputMint, aToB: isAIn } = resolveMintPair(tokenAMint, tokenBMint, requestedInputMint, requestedOutputMint);
  validatePoolTokenProgram(tokenAMint, tokenAProgram);
  validatePoolTokenProgram(tokenBMint, tokenBProgram);

  // Derive user token accounts
  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    payerPubkey,
    true,
    isAIn ? tokenAProgram : tokenBProgram
  );
  const outputTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    payerPubkey,
    true,
    isAIn ? tokenBProgram : tokenAProgram
  );

  // Derive event authority
  const eventAuthority = getMeteoraDammV2EventAuthorityPda();

  const inputTokenProgram = isAIn ? tokenAProgram : tokenBProgram;
  const outputTokenProgram = isAIn ? tokenBProgram : tokenAProgram;

  // Handle input account creation/wrapping
  if (createInputMintAta && inputMint.equals(WSOL_TOKEN_ACCOUNT)) {
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, payerPubkey, true);
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        wsolAta,
        payerPubkey,
        NATIVE_MINT,
        TOKEN_PROGRAM_ID
      )
    );
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: payerPubkey,
        toPubkey: wsolAta,
        lamports: inputAmount,
      })
    );
    instructions.push(createSyncNativeInstruction(wsolAta));
  } else if (createInputMintAta) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        inputTokenAccount,
        payerPubkey,
        inputMint,
        inputTokenProgram
      )
    );
  }

  // Create output mint ATA if needed
  if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        outputTokenAccount,
        payerPubkey,
        outputMint,
        outputTokenProgram
      )
    );
  }

  // Build swap2 instruction data
  const data = Buffer.alloc(25);
  METEORA_DAMM_V2_SWAP2_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 8);
  data.writeBigUInt64LE(minimumOutputAmount, 16);
  data.writeUInt8(METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL, 24);

  // Build accounts (14 accounts including the optional-referral placeholder)
  const accounts: AccountMeta[] = [
    { pubkey: METEORA_DAMM_V2_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: inputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: outputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: tokenAVault, isSigner: false, isWritable: true },
    { pubkey: tokenBVault, isSigner: false, isWritable: true },
    { pubkey: tokenAMint, isSigner: false, isWritable: false },
    { pubkey: tokenBMint, isSigner: false, isWritable: false },
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: tokenAProgram, isSigner: false, isWritable: false },
    { pubkey: tokenBProgram, isSigner: false, isWritable: false },
    // Anchor optional accounts still occupy a slot; program ID means no referral.
    { pubkey: METEORA_DAMM_V2_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: METEORA_DAMM_V2_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  instructions.push(
    new TransactionInstruction({
      keys: accounts,
      programId: METEORA_DAMM_V2_PROGRAM_ID,
      data,
    })
  );

  // Close WSOL ATA if requested
  if (closeInputMintAta && inputMint.equals(WSOL_TOKEN_ACCOUNT)) {
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, payerPubkey, true);
    instructions.push(
      createCloseAccountInstruction(wsolAta, payerPubkey, payerPubkey, [], TOKEN_PROGRAM_ID)
    );
  }

  return instructions;
}

/**
 * Build sell instructions for Meteora DAMM V2 protocol
 */
export function buildMeteoraDammV2SellInstructions(
  params: BuildMeteoraDammV2SellInstructionsParams
): TransactionInstruction[] {
  const {
    payer,
    inputMint: requestedInputMint,
    outputMint: requestedOutputMint,
    inputAmount,
    fixedOutputAmount,
    createOutputMintAta = true,
    closeOutputMintAta = false,
    closeInputMintAta = false,
    protocolParams,
  } = params;

  validateSwapAmounts(params);
  const minimumOutputAmount = params.minimumOutputAmount ?? fixedOutputAmount;
  if (minimumOutputAmount === undefined) {
    throw new Error('minimumOutputAmount or fixedOutputAmount must be set for Meteora DAMM V2 swap');
  }

  const payerPubkey = payer instanceof Keypair ? payer.publicKey : payer;
  const instructions: TransactionInstruction[] = [];

  const WSOL_TOKEN_ACCOUNT = new PublicKey("So11111111111111111111111111111111111111112");

  const {
    pool,
    tokenAMint,
    tokenBMint,
    tokenAVault,
    tokenBVault,
    tokenAProgram,
    tokenBProgram,
  } = protocolParams;

  const { inputMint, outputMint, aToB: isAIn } = resolveMintPair(tokenAMint, tokenBMint, requestedInputMint, requestedOutputMint);
  validatePoolTokenProgram(tokenAMint, tokenAProgram);
  validatePoolTokenProgram(tokenBMint, tokenBProgram);

  // Derive user token accounts
  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    payerPubkey,
    true,
    isAIn ? tokenAProgram : tokenBProgram
  );
  const outputTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    payerPubkey,
    true,
    isAIn ? tokenBProgram : tokenAProgram
  );

  // Derive event authority
  const eventAuthority = getMeteoraDammV2EventAuthorityPda();

  const inputTokenProgram = isAIn ? tokenAProgram : tokenBProgram;
  const outputTokenProgram = isAIn ? tokenBProgram : tokenAProgram;

  // Create output ATA for receiving if needed
  if (createOutputMintAta && outputMint.equals(WSOL_TOKEN_ACCOUNT)) {
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, payerPubkey, true);
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        wsolAta,
        payerPubkey,
        NATIVE_MINT,
        TOKEN_PROGRAM_ID
      )
    );
  } else if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        outputTokenAccount,
        payerPubkey,
        outputMint,
        outputTokenProgram
      )
    );
  }

  // Build swap2 instruction data
  const data = Buffer.alloc(25);
  METEORA_DAMM_V2_SWAP2_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 8);
  data.writeBigUInt64LE(minimumOutputAmount, 16);
  data.writeUInt8(METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL, 24);

  // Build accounts
  const accounts: AccountMeta[] = [
    { pubkey: METEORA_DAMM_V2_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: inputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: outputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: tokenAVault, isSigner: false, isWritable: true },
    { pubkey: tokenBVault, isSigner: false, isWritable: true },
    { pubkey: tokenAMint, isSigner: false, isWritable: false },
    { pubkey: tokenBMint, isSigner: false, isWritable: false },
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: tokenAProgram, isSigner: false, isWritable: false },
    { pubkey: tokenBProgram, isSigner: false, isWritable: false },
    // Anchor optional accounts still occupy a slot; program ID means no referral.
    { pubkey: METEORA_DAMM_V2_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: METEORA_DAMM_V2_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  instructions.push(
    new TransactionInstruction({
      keys: accounts,
      programId: METEORA_DAMM_V2_PROGRAM_ID,
      data,
    })
  );

  // Close WSOL ATA if requested
  if (closeOutputMintAta && outputMint.equals(WSOL_TOKEN_ACCOUNT)) {
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, payerPubkey, true);
    instructions.push(
      createCloseAccountInstruction(wsolAta, payerPubkey, payerPubkey, [], TOKEN_PROGRAM_ID)
    );
  }

  // Close input token ATA if requested
  if (closeInputMintAta) {
    instructions.push(
      createCloseAccountInstruction(
        inputTokenAccount,
        payerPubkey,
        payerPubkey,
        [],
        isAIn ? tokenAProgram : tokenBProgram
      )
    );
  }

  return instructions;
}

// ===== Pool Types and Decoder - from Rust: src/instruction/utils/meteora_damm_v2_types.rs =====

/** Raw pool body size in bytes, excluding the Anchor discriminator. */
export const METEORA_POOL_SIZE = 1104;
export const METEORA_POOL_DISCRIMINATOR = Buffer.from([241, 154, 109, 4, 17, 177, 109, 188]);

/**
 * Meteora DAMM V2 Pool structure (simplified for essential fields)
 * 100% from Rust: src/instruction/utils/meteora_damm_v2_types.rs Pool
 */
export interface MeteoraDammV2Pool {
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAVault: PublicKey;
  tokenBVault: PublicKey;
  liquidity: bigint;
  sqrtPrice: bigint;
  poolStatus: number;
  tokenAFlag: number;
  tokenBFlag: number;
}

/**
 * Decode a Meteora DAMM V2 raw pool body (without the 8-byte Anchor discriminator).
 * 100% from Rust: src/instruction/utils/meteora_damm_v2_types.rs pool_decode
 */
export function decodeMeteoraPool(data: Buffer): MeteoraDammV2Pool | null {
  if (data.length < METEORA_POOL_SIZE) {
    return null;
  }

  try {
    // Official cp_amm IDL PoolFeesStruct: base fee 40 + percentages/padding 8
    // + dynamic fee 96 + padding 16 = 160 bytes. Mints begin at account offset 168.
    let offset = 160;

    // token_a_mint: Pubkey (32 bytes)
    const tokenAMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // token_b_mint: Pubkey
    const tokenBMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // token_a_vault: Pubkey
    const tokenAVault = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // token_b_vault: Pubkey
    const tokenBVault = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // Skip whitelisted_vault, partner (64 bytes)
    offset += 64;

    // liquidity: u128 (16 bytes)
    const liquidity = data.readBigUInt64LE(offset) | (data.readBigUInt64LE(offset + 8) << BigInt(64));
    offset += 16;

    // Skip padding (16 bytes)
    offset += 16;

    // Skip protocol_a_fee, protocol_b_fee, partner_a_fee, partner_b_fee (32 bytes)
    offset += 32;

    // Skip sqrt_min_price, sqrt_max_price (32 bytes)
    offset += 32;

    // sqrt_price: u128
    const sqrtPrice = data.readBigUInt64LE(offset) | (data.readBigUInt64LE(offset + 8) << BigInt(64));
    offset += 16;

    // Skip activation_point (8 bytes)
    offset += 8;

    // activation_type: u8, pool_status: u8, token_a_flag: u8, token_b_flag: u8
    const poolStatus = data.readUInt8(offset + 1);
    const tokenAFlag = data.readUInt8(offset + 2);
    const tokenBFlag = data.readUInt8(offset + 3);

    return {
      tokenAMint,
      tokenBMint,
      tokenAVault,
      tokenBVault,
      liquidity,
      sqrtPrice,
      poolStatus,
      tokenAFlag,
      tokenBFlag,
    };
  } catch {
    return null;
  }
}

// ===== Async Fetch Functions - from Rust: src/instruction/utils/meteora_damm_v2.rs =====

/**
 * Fetch a Meteora DAMM V2 pool from RPC.
 * 100% from Rust: src/instruction/utils/meteora_damm_v2.rs fetch_pool
 */
export async function fetchMeteoraPool(
  connection: { getAccountInfo: (pubkey: PublicKey) => Promise<{ value?: { data: Buffer; owner?: PublicKey } }> },
  poolAddress: PublicKey
): Promise<MeteoraDammV2Pool | null> {
  const account = await connection.getAccountInfo(poolAddress);
  if (!account?.value?.data) {
    return null;
  }

  const { data, owner } = account.value;
  if (!owner?.equals(METEORA_DAMM_V2_PROGRAM_ID) || data.length < METEORA_POOL_SIZE + 8 ||
      !data.subarray(0, 8).equals(METEORA_POOL_DISCRIMINATOR)) return null;
  return decodeMeteoraPool(data.subarray(8));
}
