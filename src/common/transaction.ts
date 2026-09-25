import { Buffer } from 'buffer';
import {
  AddressLookupTableAccount,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { TradeType } from '../enums';
import type { GasFeeStrategyConfig } from '../index';
import { CONSTANTS as SDK_CONSTANTS } from '../constants';
import { computeBudgetInstructions } from './compute-budget';
import { TradeError } from '../sdk-errors';
const PACKET_DATA_SIZE = 1232;

/** Instruction order matches Rust `trading/common/transaction_builder.rs` `build_transaction`: nonce → tip → compute budget → business. */
export function buildInstructionListWithGasAndTip(
  coreInstructions: TransactionInstruction[],
  payer: PublicKey,
  tradeType: TradeType,
  gas: GasFeeStrategyConfig | undefined,
  tipRecipient: PublicKey | null,
  addTip: boolean,
): TransactionInstruction[] {
  const isBuy = tradeType === TradeType.Buy;
  const cuLimit = gas
    ? isBuy
      ? gas.buyComputeUnits
      : gas.sellComputeUnits
    : SDK_CONSTANTS.DEFAULT_COMPUTE_UNITS;
  const cuPrice = BigInt(
    gas
      ? isBuy
        ? gas.buyPriorityFee
        : gas.sellPriorityFee
      : SDK_CONSTANTS.DEFAULT_PRIORITY_FEE,
  );
  const tipLamports = gas
    ? isBuy
      ? gas.buyTipLamports
      : gas.sellTipLamports
    : 0;

  const out: TransactionInstruction[] = [];
  if (addTip && tipRecipient && tipLamports > 0) {
    out.push(buildTipInstruction(payer, tipRecipient, tipLamports));
  }
  out.push(...computeBudgetInstructions(cuPrice, cuLimit));
  return [...out, ...coreInstructions];
}

export function buildTipInstruction(
  payer: PublicKey,
  recipient: PublicKey,
  lamports: number,
): TransactionInstruction {
  if (!Number.isSafeInteger(lamports) || lamports <= 0) {
    throw new Error('Tip must be a positive safe integer in lamports');
  }
  return SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: recipient,
    lamports,
  });
}

export interface CompileTransactionOptions {
  payer: PublicKey;
  instructions: TransactionInstruction[];
  recentBlockhash: string;
  lookupTables?: AddressLookupTableAccount[];
}

/** Compile locally without a wallet or RPC; only the payer may be required to sign. */
export function compileTransaction({
  payer,
  instructions,
  recentBlockhash,
  lookupTables = [],
}: CompileTransactionOptions): VersionedTransaction {
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash,
    instructions,
  }).compileToV0Message(lookupTables);
  if (
    message.header.numRequiredSignatures !== 1 ||
    !message.staticAccountKeys[0]?.equals(payer)
  ) {
    throw new Error('Transaction must require only the payer signature');
  }
  const tx = new VersionedTransaction(message);
  let serializedLen: number;
  try {
    serializedLen = tx.serialize().length;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('encoding overruns') ||
      message.toLowerCase().includes('too large')
    ) {
      throw new TradeError(
        109,
        `transaction too large: exceeds ${PACKET_DATA_SIZE}; SDK did not remove compute budget or relay tip because that changes transaction priority semantics. Use an address lookup table or pre-create token ATAs before submitting`,
        error as Error,
      );
    }
    throw error;
  }
  if (serializedLen > PACKET_DATA_SIZE) {
    throw new TradeError(
      109,
      `transaction too large: ${serializedLen} > ${PACKET_DATA_SIZE}; SDK did not remove compute budget or relay tip because that changes transaction priority semantics. Use an address lookup table or pre-create token ATAs before submitting`,
    );
  }
  return tx;
}

export interface BuildSwapTransactionOptions extends CompileTransactionOptions {
  computeUnitLimit: number;
  computeUnitPriceMicroLamports: bigint;
  durableNonce?: {
    nonceAccount: PublicKey;
    authority: PublicKey;
    nonceHash: string;
  };
}

/** Build nonce, compute budget, then business instructions for external wallet signing. */
export function buildSwapTransaction(
  options: BuildSwapTransactionOptions,
): VersionedTransaction {
  const {
    payer,
    instructions,
    durableNonce,
    computeUnitLimit,
    computeUnitPriceMicroLamports,
  } = options;
  if (
    !Number.isInteger(computeUnitLimit) ||
    computeUnitLimit <= 0 ||
    computeUnitLimit > 1_400_000
  ) {
    throw new Error('Compute unit limit must be between 1 and 1400000');
  }
  if (
    computeUnitPriceMicroLamports < 0n ||
    computeUnitPriceMicroLamports > 0xffffffffffffffffn
  ) {
    throw new Error('Compute unit price must be an unsigned 64-bit integer');
  }
  if (durableNonce && !durableNonce.authority.equals(payer)) {
    throw new Error('Durable nonce authority must be the payer');
  }
  return compileTransaction({
    ...options,
    recentBlockhash: durableNonce?.nonceHash ?? options.recentBlockhash,
    instructions: [
      ...(durableNonce
        ? [
            SystemProgram.nonceAdvance({
              noncePubkey: durableNonce.nonceAccount,
              authorizedPubkey: durableNonce.authority,
            }),
          ]
        : []),
      ...computeBudgetInstructions(
        computeUnitPriceMicroLamports,
        computeUnitLimit,
      ),
      ...instructions,
    ],
  });
}

/** Existing Node signing path shares the exact same compilation and size checks. */
export function buildSignedVersionedTransaction(
  payer: Keypair,
  instructions: TransactionInstruction[],
  recentBlockhash: string,
  addressLookupTableAccount?: AddressLookupTableAccount,
): VersionedTransaction {
  const tx = compileTransaction({
    payer: payer.publicKey,
    instructions,
    recentBlockhash,
    lookupTables: addressLookupTableAccount ? [addressLookupTableAccount] : [],
  });
  tx.sign([payer]);
  return tx;
}
