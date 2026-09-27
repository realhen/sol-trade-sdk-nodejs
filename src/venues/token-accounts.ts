import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import {
  NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction, createCloseAccountInstruction,
} from '../common/spl-token';

export interface PrepareTokenAccountsParams {
  owner: PublicKey;
  /** Pays for ATA creation and, when requested, wrapping SOL. Defaults to owner. */
  payer?: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  inputTokenProgram: PublicKey;
  outputTokenProgram: PublicKey;
  amountIn: bigint;
  /** Transfer exactly amountIn lamports into the input WSOL ATA and sync it. */
  wrapNativeInput?: boolean;
  /** Explicitly close the output WSOL ATA, returning its ENTIRE balance to owner. */
  unwrapNativeOutput?: boolean;
}

/** Pure ATA/WSOL setup. Compose setup, venue swap, then cleanup; caller signs. */
export function prepareTokenAccounts(params: PrepareTokenAccountsParams): {
  inputTokenAccount: PublicKey;
  outputTokenAccount: PublicKey;
  setupInstructions: TransactionInstruction[];
  cleanupInstructions: TransactionInstruction[];
} {
  const { owner, inputMint, outputMint, inputTokenProgram, outputTokenProgram, amountIn } = params;
  const payer = params.payer ?? owner;
  if (typeof amountIn !== 'bigint' || amountIn <= 0n || amountIn > (1n << 64n) - 1n) throw new Error('amountIn must be a positive u64 bigint');
  if (inputMint.equals(outputMint)) throw new Error('Input and output mints must be different');
  for (const program of [inputTokenProgram, outputTokenProgram]) {
    if (!program.equals(TOKEN_PROGRAM_ID) && !program.equals(TOKEN_2022_PROGRAM_ID)) throw new Error('Unsupported token program');
  }
  if (params.wrapNativeInput && !inputMint.equals(NATIVE_MINT)) throw new Error('Wrapping requires native input mint');
  if (params.unwrapNativeOutput && !outputMint.equals(NATIVE_MINT)) throw new Error('Unwrapping requires native output mint');
  if ((inputMint.equals(NATIVE_MINT) && !inputTokenProgram.equals(TOKEN_PROGRAM_ID)) ||
      (outputMint.equals(NATIVE_MINT) && !outputTokenProgram.equals(TOKEN_PROGRAM_ID))) throw new Error('Native mint requires the classic token program');
  const inputTokenAccount = getAssociatedTokenAddressSync(inputMint, owner, true, inputTokenProgram);
  const outputTokenAccount = getAssociatedTokenAddressSync(outputMint, owner, true, outputTokenProgram);
  const setupInstructions = [
    createAssociatedTokenAccountIdempotentInstruction(payer, inputTokenAccount, owner, inputMint, inputTokenProgram),
    createAssociatedTokenAccountIdempotentInstruction(payer, outputTokenAccount, owner, outputMint, outputTokenProgram),
  ];
  if (params.wrapNativeInput) {
    setupInstructions.push(SystemProgram.transfer({ fromPubkey: payer, toPubkey: inputTokenAccount, lamports: amountIn }));
    setupInstructions.push(createSyncNativeInstruction(inputTokenAccount));
  }
  const cleanupInstructions = params.unwrapNativeOutput
    ? [createCloseAccountInstruction(outputTokenAccount, owner, owner)] : [];
  return { inputTokenAccount, outputTokenAccount, setupInstructions, cleanupInstructions };
}
