import { PublicKey } from "@solana/web3.js";
import {
  PUMP_SDK,
  PUMP_PROGRAM_ID,
  creatorVaultPda,
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
  assert(/^(0|[1-9][0-9]*)$/.test(text), "Invalid completion event amount");
  const result = BigInt(text);
  assert(result < 1n << 64n, "Invalid completion event u64");
  return result;
};
/** Authenticate the official exact-token Pump event against the executed native transfers.
 * @remarks Only an event emitted by the sole top-level Pump invocation is accepted.
 * Creator-vault rent topups are excluded after independently reconciling all swap transfers.
 */
export function normalizeCompletionInput(
  expected: DirectSwapExpectation,
  top: RecordValue[],
  inner: RecordValue[],
  logs: unknown,
  tokenOutput: bigint,
  observedInput: bigint,
): bigint {
  assert(
    expected.venue === "Pump.fun" &&
      top.filter((ix) => ix.programId === PROGRAM).length === 1 &&
      Array.isArray(logs),
    "Missing authenticated Pump completion event",
  );
  const stack: string[] = [];
  const events: TradeEventBc[] = [];
  let pumpRoots = 0;
  for (const line of logs) {
    assert(typeof line === "string", "Invalid completion invocation logs");
    const invoke = /^Program ([1-9A-HJ-NP-Za-km-z]+) invoke \[(\d+)\]$/.exec(
      line,
    );
    if (invoke) {
      assert(
        Number(invoke[2]) === stack.length + 1,
        "Ambiguous completion invocation depth",
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
        "Incomplete completion invocation logs",
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
    "Missing or ambiguous completion TradeEvent",
  );
  const event = events[0]!;
  assert(
    event.user.toBase58() === expected.owner &&
      event.mint.toBase58() === expected.outputMint &&
      event.isBuy &&
      event.ixName === "buy" &&
      !event.mayhemMode &&
      event.quoteMint.equals(PublicKey.default) &&
      atoms(event.cashback) === 0n &&
      atoms(event.tokenAmount) === tokenOutput &&
      tokenOutput === BigInt(expected.minimumOutput),
    "Completion event does not match exact-token execution",
  );
  const route = expected.swapInstructions[0]!;
  const creatorVault = creatorVaultPda(event.creator).toBase58();
  const buybackRecipient = route.keys[route.keys.length - 1]!.pubkey;
  const feeRecipient = event.feeRecipient.toBase58();
  assert(
    route.keys.some((key) => key.pubkey === creatorVault) &&
      route.keys.some((key) => key.pubkey === feeRecipient),
    "Completion event fee accounts mismatch",
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
      "Unsupported completion native transfer",
    );
    assert(
      [expected.pool, creatorVault, feeRecipient, buybackRecipient].includes(
        info.destination,
      ),
      "Unexpected completion native destination",
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
      sum(expected.pool) === sol &&
      sum(feeRecipient) === fee - buyback &&
      sum(buybackRecipient) === buyback,
    "Completion event disagrees with curve or fee transfers",
  );
  const creatorTransfers = transfers.get(creatorVault) ?? [];
  const rent = sum(creatorVault) - creator;
  assert(
    rent >= 0n &&
      (rent === 0n ||
        (creatorTransfers.length === 2 &&
          creatorTransfers[0] === rent &&
          creatorTransfers[1] === creator)),
    "Unproven completion creator-vault funding",
  );
  const input = sol + creator + fee;
  assert(
    observedInput === input + rent,
    "Completion native cash flow disagrees with event",
  );
  return input;
}
