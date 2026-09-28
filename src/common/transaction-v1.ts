import { ed25519 } from "@noble/curves/ed25519";
import { Buffer } from "buffer";
import {
  address,
  blockhash,
  compileTransaction as compileKitTransaction,
  getTransactionDecoder,
  getTransactionEncoder,
  getCompiledTransactionMessageDecoder,
  getCompiledTransactionMessageEncoder,
  decompileTransactionMessage,
  type Transaction as KitTransaction,
  type V1TransactionConfig,
} from "@solana/kit";
import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type AddressLookupTableAccount,
} from "@solana/web3.js";

export const V1_TRANSACTION_SIZE = 4096;

/** Official Kit wire codecs with web3-compatible account inspection for existing SDK builders. */
export class TransactionV1 {
  readonly version = 1;
  readonly message: MessageV1;
  signatures: Uint8Array[];

  constructor(private readonly transaction: KitTransaction) {
    this.message = new MessageV1(transaction.messageBytes);
    this.signatures = this.message.staticAccountKeys
      .slice(0, this.message.header.numRequiredSignatures)
      .map((key) =>
        Uint8Array.from(
          transaction.signatures[address(key.toBase58())] ?? new Uint8Array(64),
        ),
      );
    this.serialize();
  }

  /** Decodes only canonical v1 bytes, enforcing the runtime's size and structural limits. */
  static deserialize(bytes: Uint8Array): TransactionV1 {
    if (bytes[0] !== 0x81 || bytes.length > V1_TRANSACTION_SIZE)
      throw new Error("Expected a v1 transaction of at most 4096 bytes");
    const tx = new TransactionV1(getTransactionDecoder().decode(bytes));
    if (!Buffer.from(tx.serialize()).equals(Buffer.from(bytes)))
      throw new Error("Non-canonical v1 transaction");
    return tx;
  }

  /** Signs the exact message with caller-owned keys; does not fetch or submit. */
  sign(signers: { publicKey: PublicKey; secretKey: Uint8Array }[]): void {
    for (const signer of signers)
      this.addSignature(
        signer.publicKey,
        ed25519.sign(
          this.message.serialize(),
          signer.secretKey.subarray(0, 32),
        ),
      );
  }

  addSignature(key: PublicKey, signature: Uint8Array): void {
    const index = this.message.staticAccountKeys.findIndex((entry) =>
      entry.equals(key),
    );
    if (index < 0 || index >= this.signatures.length || signature.length !== 64)
      throw new Error("Unexpected v1 signer");
    this.signatures[index] = Uint8Array.from(signature);
  }

  serialize(): Uint8Array {
    if (
      this.signatures.length !== this.message.header.numRequiredSignatures ||
      this.signatures.some((signature) => signature.length !== 64)
    )
      throw new Error("Invalid v1 signatures");
    const signatures = Object.fromEntries(
      this.message.staticAccountKeys
        .slice(0, this.signatures.length)
        .map((key, index) => [key.toBase58(), this.signatures[index]]),
    ) as KitTransaction["signatures"];
    const bytes = Uint8Array.from(
      getTransactionEncoder().encode({ ...this.transaction, signatures }),
    );
    if (bytes.length > V1_TRANSACTION_SIZE)
      throw new Error("Transaction exceeds 4096 bytes");
    return bytes;
  }
}

/** Immutable decoded message; signatures always cover the original Kit message bytes. */
class MessageV1 {
  readonly version = 1;
  readonly header;
  readonly staticAccountKeys: PublicKey[];
  readonly compiledInstructions: {
    programIdIndex: number;
    accountKeyIndexes: number[];
    data: Uint8Array;
  }[];
  readonly addressTableLookups = [];
  readonly recentBlockhash: string;
  readonly config: V1TransactionConfig;

  constructor(private readonly bytes: KitTransaction["messageBytes"]) {
    const compiled = getCompiledTransactionMessageDecoder().decode(bytes);
    if (compiled.version !== 1) throw new Error("Expected v1 message");
    if (
      !Buffer.from(
        getCompiledTransactionMessageEncoder().encode(compiled),
      ).equals(Buffer.from(bytes))
    )
      throw new Error("Non-canonical v1 message");
    const source = decompileTransactionMessage(compiled);
    this.config = source.config ?? {};
    this.header = {
      numRequiredSignatures: compiled.header.numSignerAccounts,
      numReadonlySignedAccounts: compiled.header.numReadonlySignerAccounts,
      numReadonlyUnsignedAccounts: compiled.header.numReadonlyNonSignerAccounts,
    };
    this.staticAccountKeys = compiled.staticAccounts.map(
      (key) => new PublicKey(key),
    );
    this.recentBlockhash = compiled.lifetimeToken;
    this.compiledInstructions = compiled.instructionHeaders.map(
      (header, index) => ({
        programIdIndex: header.programAccountIndex,
        accountKeyIndexes:
          compiled.instructionPayloads[index]!.instructionAccountIndices,
        data: Uint8Array.from(
          compiled.instructionPayloads[index]!.instructionData,
        ),
      }),
    );
    const h = this.header;
    if (
      h.numRequiredSignatures < 1 ||
      h.numRequiredSignatures > 12 ||
      h.numReadonlySignedAccounts >= h.numRequiredSignatures ||
      h.numRequiredSignatures + h.numReadonlyUnsignedAccounts >
        this.staticAccountKeys.length ||
      this.staticAccountKeys.length > 64 ||
      new Set(compiled.staticAccounts).size !==
        compiled.staticAccounts.length ||
      this.compiledInstructions.length > 64 ||
      this.compiledInstructions.some(
        (ix) =>
          ix.programIdIndex >= this.staticAccountKeys.length ||
          ix.accountKeyIndexes.some(
            (index) => index >= this.staticAccountKeys.length,
          ),
      )
    )
      throw new Error("Invalid v1 transaction structure");
    if (
      !this.config.computeUnitLimit ||
      this.config.computeUnitLimit > 1_400_000 ||
      !this.config.loadedAccountsDataSizeLimit ||
      this.config.loadedAccountsDataSizeLimit > 64 * 1024 * 1024
    )
      throw new Error("Invalid v1 resource limits");
  }

  serialize(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
  isAccountSigner(index: number): boolean {
    return index < this.header.numRequiredSignatures;
  }
  isAccountWritable(index: number): boolean {
    return this.isAccountSigner(index)
      ? index <
          this.header.numRequiredSignatures -
            this.header.numReadonlySignedAccounts
      : index <
          this.staticAccountKeys.length -
            this.header.numReadonlyUnsignedAccounts;
  }
  getAccountKeys(_options?: unknown) {
    return { get: (index: number) => this.staticAccountKeys[index] };
  }
}

export interface CompileV1Options {
  payer: PublicKey;
  instructions: TransactionInstruction[];
  recentBlockhash: string;
  config?: V1TransactionConfig;
}

/** Compiles v1 with explicit resources; translates legacy compute settings without changing their fee units. */
export function compileV1Transaction(options: CompileV1Options): TransactionV1 {
  const config: V1TransactionConfig = {
    computeUnitLimit: Math.min(
      1_400_000,
      options.instructions.filter(
        (ix) => !ix.programId.equals(ComputeBudgetProgram.programId),
      ).length * 200_000,
    ),
    loadedAccountsDataSizeLimit: 64 * 1024 * 1024,
    ...options.config,
  };
  let price: bigint | undefined;
  const seen = new Set<number>();
  const instructions = options.instructions.filter((ix) => {
    if (!ix.programId.equals(ComputeBudgetProgram.programId)) return true;
    const kind = ix.data[0]!;
    if (seen.has(kind)) throw new Error("Duplicate compute budget instruction");
    seen.add(kind);
    if (kind === 1 && ix.data.length === 5)
      config.heapSize = ix.data.readUInt32LE(1);
    else if (kind === 2 && ix.data.length === 5)
      config.computeUnitLimit = ix.data.readUInt32LE(1);
    else if (kind === 3 && ix.data.length === 9)
      price = ix.data.readBigUInt64LE(1);
    else if (kind === 4 && ix.data.length === 5)
      config.loadedAccountsDataSizeLimit = ix.data.readUInt32LE(1);
    else throw new Error("Unsupported compute budget instruction");
    return false;
  });
  if (
    price !== undefined &&
    price > 0n &&
    !seen.has(2) &&
    options.config?.computeUnitLimit === undefined
  )
    throw new Error(
      "An explicit compute unit limit is required to preserve the priority fee when converting to v1",
    );
  if (price !== undefined && options.config?.priorityFeeLamports === undefined)
    config.priorityFeeLamports =
      (price * BigInt(config.computeUnitLimit!) + 999_999n) / 1_000_000n;
  return new TransactionV1(
    compileKitTransaction({
      version: 1,
      feePayer: { address: address(options.payer.toBase58()) },
      lifetimeConstraint: {
        blockhash: blockhash(options.recentBlockhash),
        lastValidBlockHeight: 0n,
      },
      config,
      instructions: instructions.map((ix) => ({
        programAddress: address(ix.programId.toBase58()),
        accounts: ix.keys.map((key) => ({
          address: address(key.pubkey.toBase58()),
          role: (key.isSigner ? 2 : 0) | (key.isWritable ? 1 : 0),
        })),
        data: ix.data,
      })),
    }),
  );
}

/** Expands inline v1 accounts into existing SDK instruction objects without RPC. */
export function decompileV1Transaction(tx: TransactionV1): TransactionMessage {
  return new TransactionMessage({
    payerKey: tx.message.staticAccountKeys[0]!,
    recentBlockhash: tx.message.recentBlockhash,
    instructions: tx.message.compiledInstructions.map(
      (ix) =>
        new TransactionInstruction({
          programId: tx.message.staticAccountKeys[ix.programIdIndex]!,
          data: Buffer.from(ix.data),
          keys: ix.accountKeyIndexes.map((index) => ({
            pubkey: tx.message.staticAccountKeys[index]!,
            isSigner: tx.message.isAccountSigner(index),
            isWritable: tx.message.isAccountWritable(index),
          })),
        }),
    ),
  });
}

/** Converts only unsigned provider transactions; the caller must validate provenance and supply every lookup table. */
export function upgradeTransactionToV1(
  bytes: Uint8Array,
  tables: AddressLookupTableAccount[] = [],
): TransactionV1 {
  if (bytes[0] === 0x81) return TransactionV1.deserialize(bytes);
  const old = VersionedTransaction.deserialize(bytes);
  if (old.signatures.some((signature) => signature.some((byte) => byte !== 0)))
    throw new Error("Cannot convert an already signed transaction");
  const message = TransactionMessage.decompile(old.message, {
    addressLookupTableAccounts: tables,
  });
  return compileV1Transaction({
    payer: message.payerKey,
    recentBlockhash: message.recentBlockhash,
    instructions: message.instructions,
  });
}
