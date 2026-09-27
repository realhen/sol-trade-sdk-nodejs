import { compileV1Transaction, TransactionV1 } from "./transaction-v1";
import { Buffer } from "buffer";
import {
  AddressLookupTableAccount,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { TradeType } from "../enums";
import type { GasFeeStrategyConfig } from "../index";
import { CONSTANTS as SDK_CONSTANTS } from "../constants";
import { computeBudgetInstructions } from "./compute-budget";
import { TradeError } from "../sdk-errors";
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
    throw new Error("Tip must be a positive safe integer in lamports");
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
  version?: 0 | 1;
}

/** Compile locally without a wallet or RPC; only the payer may be required to sign. */
export function compileTransaction(
  options: CompileTransactionOptions & { version: 1 },
): TransactionV1;
export function compileTransaction(
  options: CompileTransactionOptions & { version?: 0 },
): VersionedTransaction;
export function compileTransaction(
  options: CompileTransactionOptions,
): VersionedTransaction | TransactionV1;
export function compileTransaction({
  payer,
  instructions,
  recentBlockhash,
  lookupTables = [],
  version = 0,
}: CompileTransactionOptions): VersionedTransaction | TransactionV1 {
  if (version === 1) {
    const tx = compileV1Transaction({ payer, instructions, recentBlockhash });
    if (tx.message.header.numRequiredSignatures !== 1)
      throw new Error("Transaction must require only the payer signature");
    return tx;
  }
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash,
    instructions,
  }).compileToV0Message(lookupTables);
  if (
    message.header.numRequiredSignatures !== 1 ||
    !message.staticAccountKeys[0]?.equals(payer)
  ) {
    throw new Error("Transaction must require only the payer signature");
  }
  const tx = new VersionedTransaction(message);
  let serializedLen: number;
  try {
    serializedLen = tx.serialize().length;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("encoding overruns") ||
      message.toLowerCase().includes("too large")
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
  /** Public identifier included as a memo to distinguish otherwise identical intentional swaps.
   * Reuse it when rebuilding the same intent; callers own generation and idempotency.
   */
  transactionId?: string;
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
  options: BuildSwapTransactionOptions & { version: 1 },
): TransactionV1;
export function buildSwapTransaction(
  options: BuildSwapTransactionOptions & { version?: 0 },
): VersionedTransaction;
export function buildSwapTransaction(
  options: BuildSwapTransactionOptions,
): VersionedTransaction | TransactionV1 {
  const {
    payer,
    instructions,
    durableNonce,
    computeUnitLimit,
    computeUnitPriceMicroLamports,
    transactionId,
  } = options;
  if (
    !Number.isInteger(computeUnitLimit) ||
    computeUnitLimit <= 0 ||
    computeUnitLimit > 1_400_000
  ) {
    throw new Error("Compute unit limit must be between 1 and 1400000");
  }
  if (
    computeUnitPriceMicroLamports < 0n ||
    computeUnitPriceMicroLamports > 0xffffffffffffffffn
  ) {
    throw new Error("Compute unit price must be an unsigned 64-bit integer");
  }
  if (durableNonce && !durableNonce.authority.equals(payer)) {
    throw new Error("Durable nonce authority must be the payer");
  }
  if (
    transactionId !== undefined &&
    !/^[A-Za-z0-9:_-]{1,128}$/.test(transactionId)
  ) {
    throw new Error(
      "Transaction ID must contain 1 to 128 ASCII identifier characters",
    );
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
      ...(transactionId === undefined
        ? []
        : [
            new TransactionInstruction({
              programId: new PublicKey(
                "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
              ),
              keys: [],
              data: Buffer.from(transactionId, "utf8"),
            }),
          ]),
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
