import { PublicKey } from "@solana/web3.js";
import {
  PUMP_SDK,
  PUMP_PROGRAM_ID,
  creatorVaultPda,
  bondingCurvePda,
  pumpIdl,
  type TradeEventBc,
} from "@pump-fun/pump-sdk";
import { Buffer } from "buffer";
import type { DirectSwapExpectation } from "./settlement";
import { assert } from "./snapshot";
type RecordValue = Record<string, unknown>;
const SYSTEM = "11111111111111111111111111111111";
const PROGRAM = PUMP_PROGRAM_ID.toBase58();
const discriminator = Buffer.from(
  pumpIdl.events.find((event) => event.name === "TradeEvent")!.discriminator,
);
const atoms = (value: { toString(): string }) => {
  const text = value.toString();
  assert(/^(0|[1-9][0-9]*)$/.test(text), "Invalid Pump buy event amount");
  const result = BigInt(text);
  assert(result < 1n << 64n, "Invalid Pump buy event u64");
  return result;
};
/** Reconcile native Pump buy cash flow against its authenticated trade event.
 * @remarks Only the sole top-level Pump invocation can supply the event. Curve and
 * creator-vault funding are returned separately from swap input, after every owner
 * transfer is reconciled. Funding is an expense, not refundable wallet-account rent.
 */
export function normalizePumpBuyInput(
  expected: DirectSwapExpectation,
  top: RecordValue[],
  inner: RecordValue[],
  logs: unknown,
  tokenOutput: bigint,
  observedInput: bigint,
): { inputAmount: bigint; accountFundingLamports: bigint } {
  assert(
    expected.venue === "Pump.fun" &&
      top.filter((ix) => ix.programId === PROGRAM).length === 1 &&
      Array.isArray(logs),
    "Missing authenticated Pump buy event",
  );
  const stack: string[] = [];
  const events: TradeEventBc[] = [];
  let pumpRoots = 0;
  for (const line of logs) {
    assert(typeof line === "string", "Invalid Pump buy invocation logs");
    const invoke = /^Program ([1-9A-HJ-NP-Za-km-z]+) invoke \[(\d+)\]$/.exec(
      line,
    );
    if (invoke) {
      assert(
        Number(invoke[2]) === stack.length + 1,
        "Ambiguous Pump buy invocation depth",
      );
      if (!stack.length && invoke[1] === PROGRAM) pumpRoots++;
      stack.push(invoke[1]!);
      continue;
    }
    const finish = /^Program ([1-9A-HJ-NP-Za-km-z]+) (success|failed:.*)$/.exec(
      line,
    );
    if (finish) {
      assert(
        finish[2] === "success" && stack.pop() === finish[1],
        "Incomplete Pump buy invocation logs",
      );
      continue;
    }
    if (
      stack.length === 1 &&
      stack[0] === PROGRAM &&
      line.startsWith("Program data: ")
    ) {
      const data = Buffer.from(line.slice("Program data: ".length), "base64");
      if (data.subarray(0, 8).equals(discriminator))
        events.push(PUMP_SDK.decodeTradeEventBc(data.subarray(8)));
    }
  }
  assert(
    !stack.length && pumpRoots === 1 && events.length === 1,
    "Missing or ambiguous Pump buy TradeEvent",
  );
  const event = events[0]!;
  assert(
    event.user.toBase58() === expected.owner &&
      event.mint.toBase58() === expected.outputMint &&
      event.isBuy &&
      (expected.amountMode === "exact-output"
        ? event.ixName === "buy"
        : event.ixName === "buy" || event.ixName === "buy_exact_sol_in") &&
      !event.mayhemMode &&
      event.quoteMint.equals(PublicKey.default) &&
      atoms(event.cashback) === 0n &&
      atoms(event.tokenAmount) === tokenOutput &&
      (expected.amountMode !== "exact-output" ||
        tokenOutput === BigInt(expected.minimumOutput)),
    "Pump buy event does not match execution",
  );
  const route = expected.swapInstructions[0]!;
  const instruction = pumpIdl.instructions.find(
    (ix) => ix.name === event.ixName,
  );
  assert(
    expected.swapInstructions.length === 1 &&
      route.programId === PROGRAM &&
      instruction &&
      Buffer.from(route.data, "base64")
        .subarray(0, 8)
        .equals(Buffer.from(instruction.discriminator)) &&
      bondingCurvePda(event.mint).toBase58() === expected.pool,
    "Pump buy event does not match selected instruction and curve",
  );
  const creatorVault = creatorVaultPda(event.creator).toBase58();
  const buybackRecipient = route.keys[route.keys.length - 1]!.pubkey;
  const feeRecipient = event.feeRecipient.toBase58();
  assert(
    new Set([expected.pool, creatorVault, feeRecipient, buybackRecipient])
      .size === 4 &&
      [expected.pool, creatorVault, feeRecipient, buybackRecipient].every(
        (address) =>
          route.keys.some((key) => key.pubkey === address && key.isWritable),
      ),
    "Pump buy event fee accounts mismatch",
  );
  const transfers = new Map<string, bigint[]>();
  for (const ix of inner) {
    if (ix.programId !== SYSTEM || !ix.parsed || typeof ix.parsed !== "object")
      continue;
    const parsed = ix.parsed as RecordValue,
      info = parsed.info as RecordValue;
    if (
      !info ||
      info.source !== expected.owner ||
      parsed.type === "createAccount" ||
      parsed.type === "createAccountWithSeed"
    )
      continue;
    assert(
      parsed.type === "transfer" &&
        typeof info.destination === "string" &&
        typeof info.lamports === "number" &&
        Number.isSafeInteger(info.lamports) &&
        info.lamports >= 0,
      "Unsupported Pump buy native transfer",
    );
    assert(
      [expected.pool, creatorVault, feeRecipient, buybackRecipient].includes(
        info.destination,
      ),
      "Unexpected Pump buy native destination",
    );
    const values = transfers.get(info.destination) ?? [];
    values.push(BigInt(info.lamports));
    transfers.set(info.destination, values);
  }
  const sum = (key: string) =>
    (transfers.get(key) ?? []).reduce((total, value) => total + value, 0n);
  const sol = atoms(event.solAmount),
    creator = atoms(event.creatorFee),
    fee = atoms(event.fee),
    buyback = atoms(event.buybackFee);
  assert(
    fee >= buyback &&
      sum(feeRecipient) === fee - buyback &&
      sum(buybackRecipient) === buyback,
    "Pump buy event disagrees with curve or fee transfers",
  );
  const funding = (address: string, payment: bigint) => {
    const values = transfers.get(address) ?? [];
    const extra = sum(address) - payment;
    assert(
      extra >= 0n &&
        (extra === 0n ||
          (values.length === 2 &&
            values[0] === extra &&
            values[1] === payment)),
      "Unproven Pump buy account funding",
    );
    return extra;
  };
  const accountFundingLamports =
    funding(expected.pool, sol) + funding(creatorVault, creator);
  const input = sol + creator + fee;
  assert(
    observedInput === input + accountFundingLamports,
    "Pump buy native cash flow disagrees with event",
  );
  return { inputAmount: input, accountFundingLamports };
}
