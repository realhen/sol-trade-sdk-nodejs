import bs58 from "bs58";
import { Buffer } from "buffer";

/** Normalized landed bid, never divided by actual compute consumed. */
export interface PriorityObservation {
  slot: number;
  blockTime: number;
  computeUnitLimit: number;
  computeUnitsConsumed: number;
  priorityLamports: bigint;
  microLamportsPerCu: bigint;
}

/** Decode an RPC jsonParsed transaction, requiring a successful write to the selected pool.
 * Unsupported/malformed messages return undefined; callers own stream age and deduplication.
 */
export function readPriorityObservation(
  raw: unknown,
  pool: string,
): PriorityObservation | undefined {
  try {
    const tx = raw as any;
    const message = tx.transaction.message;
    if (
      tx.meta.err !== null ||
      !Number.isSafeInteger(tx.slot) ||
      !Number.isSafeInteger(tx.blockTime) ||
      !message.accountKeys.some(
        (key: any) => key.pubkey === pool && key.writable === true,
      )
    )
      return;
    let limit: number | undefined;
    let fee: bigint | undefined;
    let price = 0n;
    if (tx.version === 1) {
      limit = message.transactionConfig?.computeUnitLimit;
      const value = message.transactionConfig?.priorityFee;
      if (!Number.isSafeInteger(value) || value < 0) return;
      fee = BigInt(value);
    } else {
      const seen = new Set<number>();
      for (const ix of message.instructions) {
        if (ix.programId !== "ComputeBudget111111111111111111111111111111")
          continue;
        const data = Buffer.from(bs58.decode(ix.data));
        if (seen.has(data[0]!)) return;
        seen.add(data[0]!);
        if (data[0] === 2 && data.length === 5) limit = data.readUInt32LE(1);
        if (data[0] === 3 && data.length === 9) price = data.readBigUInt64LE(1);
      }
    }
    if (
      !Number.isSafeInteger(limit) ||
      !limit ||
      limit > 1_400_000 ||
      limit < 1
    )
      return;
    const consumed = tx.meta.computeUnitsConsumed;
    if (!Number.isSafeInteger(consumed) || consumed <= 0 || consumed > limit)
      return;
    fee ??= (price * BigInt(limit) + 999_999n) / 1_000_000n;
    return {
      slot: tx.slot,
      blockTime: tx.blockTime,
      computeUnitLimit: limit,
      computeUnitsConsumed: consumed,
      priorityLamports: fee,
      microLamportsPerCu:
        (fee * 1_000_000n + BigInt(limit) - 1n) / BigInt(limit),
    };
  } catch {
    return;
  }
}
