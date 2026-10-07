import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { Buffer } from "buffer";
import { TransactionV1 } from "./transaction-v1";

/** Persisted identity and sender intent for one submitted transaction. */
export interface ExecutionCostExpectation {
  signature: string;
  owner: string;
  /** Undefined means legacy intent is unknown; null explicitly records no tip. */
  tip?: { account: string; lamports: string } | null;
}

/** Actual owner-paid expenses, excluding swap cash flow and refundable deposits. */
export interface NormalizedExecutionCosts {
  networkFeeLamports: bigint;
  tipLamports: bigint;
  /** False means tipLamports is only a known subtotal, not a proven zero tip. */
  tipComplete: boolean;
  slot: number;
  blockTime: number | null;
  succeeded: boolean;
}

type ObjectValue = Record<string, unknown>;
const SYSTEM = "11111111111111111111111111111111";
const U64_MAX = (1n << 64n) - 1n;

function fail(reason: string): never {
  throw new Error(`Invalid execution costs: ${reason}`);
}

function object(value: unknown, name: string): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${name} must be an object`);
  return value as ObjectValue;
}

function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) fail(`${name} must be an array`);
  return value;
}

function integer(value: unknown, name: string, minimum = 0): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum
  )
    fail(`${name} must be a safe integer`);
  return value;
}

function address(value: unknown, name: string): string {
  if (typeof value !== "string") fail(`${name} must be an address string`);
  try {
    if (new PublicKey(value).toBase58() !== value)
      fail(`${name} is not canonical`);
  } catch {
    fail(`${name} is invalid`);
  }
  return value;
}

function signature(value: unknown): string {
  if (typeof value !== "string") fail("signature must be a string");
  try {
    const bytes = bs58.decode(value);
    if (bytes.length !== 64 || bs58.encode(bytes) !== value)
      fail("invalid signature length or encoding");
  } catch {
    fail("invalid signature encoding");
  }
  return value;
}

function tipAmount(value: unknown): bigint {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value))
    fail("tip must be a positive integer string");
  const result = BigInt(value);
  if (result > U64_MAX) fail("tip exceeds u64");
  return result;
}

interface AccountKey {
  address: string;
  signer: boolean;
  writable: boolean;
}

function receiptTransaction(value: unknown): ObjectValue {
  if (!Array.isArray(value)) return object(value, "transaction");
  if (
    value.length !== 2 ||
    value[1] !== "base64" ||
    typeof value[0] !== "string"
  )
    fail("invalid encoded transaction tuple");
  const bytes = Buffer.from(value[0], "base64");
  if (
    !bytes.length ||
    bytes.toString("base64") !== value[0] ||
    bytes.length > (bytes[0] === 0x81 ? 4096 : 1232)
  )
    fail("invalid canonical transaction bytes");
  let tx: VersionedTransaction | TransactionV1;
  try {
    tx =
      bytes[0] === 0x81
        ? TransactionV1.deserialize(bytes)
        : VersionedTransaction.deserialize(bytes);
    if (!Buffer.from(tx.serialize()).equals(bytes))
      fail("transaction bytes do not round trip");
  } catch {
    fail("cannot decode transaction bytes");
  }
  return {
    signatures: tx.signatures.map((value) => bs58.encode(value)),
    message: {
      header: tx.message.header,
      accountKeys: tx.message.staticAccountKeys.map((key) => key.toBase58()),
      instructions: tx.message.compiledInstructions.map((instruction) => ({
        programIdIndex: instruction.programIdIndex,
        accounts: instruction.accountKeyIndexes,
        data: bs58.encode(instruction.data),
      })),
    },
  };
}

function accountKeys(message: ObjectValue, meta: ObjectValue): AccountKey[] {
  const values = array(message.accountKeys, "accountKeys");
  if (!values.length) fail("missing fee payer");
  let keys: AccountKey[];
  if (typeof values[0] === "string") {
    const header = object(message.header, "message header");
    const signers = integer(header.numRequiredSignatures, "signer count", 1);
    const readonlySigned = integer(
      header.numReadonlySignedAccounts,
      "readonly signer count",
    );
    const readonlyUnsigned = integer(
      header.numReadonlyUnsignedAccounts,
      "readonly account count",
    );
    if (
      signers > values.length ||
      readonlySigned >= signers ||
      readonlyUnsigned > values.length - signers
    )
      fail("invalid message header");
    keys = values.map((value, index) => ({
      address: address(value, "account key"),
      signer: index < signers,
      writable:
        index < signers
          ? index < signers - readonlySigned
          : index < values.length - readonlyUnsigned,
    }));
    if (meta.loadedAddresses !== undefined) {
      const loaded = object(meta.loadedAddresses, "loadedAddresses");
      for (const field of ["writable", "readonly"] as const) {
        for (const value of array(loaded[field], `loaded ${field}`)) {
          keys.push({
            address: address(value, "loaded account key"),
            signer: false,
            writable: field === "writable",
          });
        }
      }
    }
  } else {
    keys = values.map((value) => {
      const key = object(value, "account key");
      if (typeof key.signer !== "boolean" || typeof key.writable !== "boolean")
        fail("missing account privileges");
      return {
        address: address(key.pubkey, "account key"),
        signer: key.signer,
        writable: key.writable,
      };
    });
  }
  if (new Set(keys.map((key) => key.address)).size !== keys.length)
    fail("duplicate account key");
  if (!keys[0]!.signer || !keys[0]!.writable)
    fail("invalid fee payer privileges");
  const firstUnsigned = keys.findIndex((key) => !key.signer);
  if (firstUnsigned >= 0 && keys.slice(firstUnsigned).some((key) => key.signer))
    fail("signers are not the leading accounts");
  return keys;
}

interface Transfer {
  source: string;
  destination: string;
  lamports: bigint;
}

function systemTransfer(ix: ObjectValue, keys: AccountKey[]): Transfer | null {
  const keyAt = (value: unknown): string => {
    const index = integer(value, "instruction account index");
    if (index >= keys.length) fail("instruction account index is out of range");
    return keys[index]!.address;
  };
  const program =
    ix.programId === undefined
      ? keyAt(ix.programIdIndex)
      : address(ix.programId, "instruction program");
  if (program !== SYSTEM) return null;
  if (ix.parsed !== undefined) {
    const parsed = object(ix.parsed, "parsed System instruction");
    if (parsed.type !== "transfer") return null;
    const info = object(parsed.info, "parsed transfer info");
    return {
      source: address(info.source, "transfer source"),
      destination: address(info.destination, "transfer destination"),
      lamports: BigInt(integer(info.lamports, "transfer amount")),
    };
  }
  if (typeof ix.data !== "string") fail("missing System instruction bytes");
  let data: Buffer;
  try {
    data = Buffer.from(bs58.decode(ix.data));
  } catch {
    fail("invalid System instruction encoding");
  }
  if (data.length < 4) fail("truncated System instruction");
  if (data.readUInt32LE(0) !== 2) return null;
  const accounts = array(ix.accounts, "transfer accounts");
  if (data.length !== 12 || accounts.length !== 2)
    fail("invalid transfer layout");
  const key = (value: unknown) =>
    typeof value === "string"
      ? address(value, "transfer account")
      : keyAt(value);
  return {
    source: key(accounts[0]),
    destination: key(accounts[1]),
    lamports: data.readBigUInt64LE(4),
  };
}

/**
 * Normalize costs from a trusted confirmed/finalized RPC JSON transaction receipt.
 *
 * @remarks Supports json, jsonParsed, and base64 RPC messages, including native v1. The caller
 * owns commitment verification and persists sender intent before submission.
 * meta.fee already includes priority fees and is charged only to the fee payer.
 * Only a proven top-level owner-funded System transfer is attributed as the
 * expected tip. Failed transactions roll back tips; account deposits, refunds,
 * venue fees, and unrelated transfers are never inferred from balance deltas.
 * This function performs no network requests and does not mutate the receipt.
 * @throws When receipt identity, account privileges, metadata, or an expected tip
 * cannot be verified. Unknown legacy tip intent remains explicitly incomplete.
 */
export function normalizeExecutionCosts(
  transaction: unknown,
  expected: ExecutionCostExpectation,
): NormalizedExecutionCosts {
  const owner = address(expected.owner, "owner");
  const expectedSignature = signature(expected.signature);
  const tip =
    expected.tip == null
      ? expected.tip
      : {
          account: address(expected.tip.account, "tip account"),
          lamports: tipAmount(expected.tip.lamports),
        };
  if (tip?.account === owner) fail("tip cannot pay its owner");
  const receipt = object(transaction, "transaction receipt");
  const tx = receiptTransaction(receipt.transaction);
  const signatures = array(tx.signatures, "signatures").map(signature);
  if (signatures[0] !== expectedSignature)
    fail("transaction signature mismatch");
  const meta = object(receipt.meta, "meta");
  if (
    meta.err !== null &&
    typeof meta.err !== "string" &&
    (!meta.err || typeof meta.err !== "object" || Array.isArray(meta.err))
  )
    fail("missing transaction execution status");
  const message = object(tx.message, "message");
  const keys = accountKeys(message, meta);
  if (signatures.length !== keys.filter((key) => key.signer).length)
    fail("signature count does not match signers");
  const ownerIndex = keys.findIndex((key) => key.address === owner);
  if (ownerIndex < 0 || !keys[ownerIndex]!.signer)
    fail("owner is not a transaction signer");
  const fee = BigInt(integer(meta.fee, "transaction fee"));
  const result: NormalizedExecutionCosts = {
    networkFeeLamports: ownerIndex === 0 ? fee : 0n,
    tipLamports: 0n,
    tipComplete: expected.tip !== undefined || meta.err !== null,
    slot: integer(receipt.slot, "slot", 1),
    blockTime:
      receipt.blockTime === null
        ? null
        : integer(receipt.blockTime, "blockTime"),
    succeeded: meta.err === null,
  };
  if (!result.succeeded || !tip) return result;
  const transfers = array(message.instructions, "instructions")
    .map((value) => systemTransfer(object(value, "instruction"), keys))
    .filter(
      (value): value is Transfer =>
        value !== null &&
        value.source === owner &&
        value.destination === tip.account,
    );
  if (transfers.length !== 1 || transfers[0]!.lamports !== tip.lamports)
    fail("expected tip transfer is missing, duplicated, or differs");
  const recipient = keys.find((key) => key.address === tip.account);
  if (!recipient?.writable || !keys[ownerIndex]!.writable)
    fail("tip transfer account privileges are missing");
  result.tipLamports = tip.lamports;
  return result;
}
