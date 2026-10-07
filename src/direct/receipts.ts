import {
  PublicKey,
  type Connection,
  type ParsedInstruction,
  type PartiallyDecodedInstruction,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";
import * as pump from "@pump-fun/pump-sdk";

/** Confirmed execution quantities; SOL and token amounts are whole units, timestamp is milliseconds. */
export interface ConfirmedSolTrade {
  mint: string;
  wallet: string;
  side: "buy" | "sell";
  solAmount: number;
  tokenAmount: number;
  priceSol: number;
  signature: string;
  index: number;
  slot: number;
  timestamp: number;
}

type Instruction = (ParsedInstruction | PartiallyDecodedInstruction) & {
  stackHeight?: number | null;
};
type SwapLayout = {
  program: string;
  discriminators: number[][];
  user: number;
  mintA: number;
  mintB: number;
  vaultA: number;
  vaultB: number;
  userAccounts: number[];
};
const swapLayouts: SwapLayout[] = [
  {
    program: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
    discriminators: [
      [250, 234, 13, 123, 213, 156, 19, 236],
      [24, 211, 116, 40, 105, 3, 153, 56],
      [149, 39, 222, 155, 211, 124, 152, 26],
    ],
    user: 0,
    mintA: 9,
    mintB: 10,
    vaultA: 7,
    vaultB: 8,
    userAccounts: [5, 6],
  },
  {
    program: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
    discriminators: [[143, 190, 90, 218, 196, 30, 51, 222]],
    user: 0,
    mintA: 10,
    mintB: 11,
    vaultA: 6,
    vaultB: 7,
    userAccounts: [4, 5],
  },
  {
    program: "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
    discriminators: [
      [248, 198, 158, 145, 225, 117, 135, 200],
      [65, 75, 63, 76, 235, 91, 91, 136],
    ],
    user: 9,
    mintA: 7,
    mintB: 8,
    vaultA: 5,
    vaultB: 6,
    userAccounts: [3, 4],
  },
  {
    program: "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
    discriminators: [
      [248, 198, 158, 145, 225, 117, 135, 200],
      [65, 75, 63, 76, 235, 91, 91, 136],
    ],
    user: 8,
    mintA: 6,
    mintB: 7,
    vaultA: 4,
    vaultB: 5,
    userAccounts: [2, 3],
  },
];

/**
 * Decode successful confirmed Pump events and verified swaps on supported SOL-paired venues.
 * Other venues use actual SPL transfers between the swap's user accounts and vaults.
 * Pump quantities are event swap principal; other venues report vault settlement amounts,
 * including fees retained by the vault but excluding separate fee-recipient transfers.
 * Rent, transaction fees, unrelated transfers, launches and liquidity migration never become volume.
 * Missing or truncated execution evidence produces no invented trade.
 */
export async function decodeConfirmedSolTrades(
  connection: Connection,
  signature: string,
  mints: readonly string[],
): Promise<ConfirmedSolTrade[]> {
  const tx = await connection.getParsedTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 1,
  });
  return decodeConfirmedSolTradeReceipt(connection, signature, mints, tx);
}

/**
 * Decode a caller-fetched confirmed jsonParsed receipt, including native v1 transactions.
 * @remarks Fetch with at least confirmed commitment and maxSupportedTransactionVersion: 1.
 * RPC receipt bodies do not prove commitment; the caller owns transport and confirmation.
 * Both raw RPC string addresses and web3.js PublicKey addresses are accepted. The receipt
 * signature must match the requested signature. Unknown or malformed evidence rejects.
 */
export async function decodeConfirmedSolTradeReceipt(
  connection: Connection,
  signature: string,
  mints: readonly string[],
  receipt: unknown,
): Promise<ConfirmedSolTrade[]> {
  const tx = parseReceipt(receipt, signature);
  if (!tx)
    throw new Error(`Confirmed receipt ${signature} is not available yet`);
  if (!tx.meta || tx.meta.err) return [];
  const result: ConfirmedSolTrade[] = [];
  let blockTimestamp: Promise<number> | undefined;
  const confirmedTimestamp = () => {
    blockTimestamp ??= connection.getBlockTime(tx.slot).then((seconds) => {
      if (seconds === null || !Number.isSafeInteger(seconds) || seconds <= 0) {
        throw new Error(
          `Confirmed block timestamp for slot ${tx.slot} is unavailable`,
        );
      }
      return seconds * 1000;
    });
    return blockTimestamp;
  };
  const append = (
    trade: Omit<ConfirmedSolTrade, "priceSol" | "signature" | "index" | "slot">,
  ) => {
    if (!(trade.solAmount > 0 && trade.tokenAmount > 0)) return;
    result.push({
      ...trade,
      priceSol: trade.solAmount / trade.tokenAmount,
      signature,
      index: result.length,
      slot: tx.slot,
    });
  };
  const stack: string[] = [];
  const curveDiscriminator = Buffer.from(
    pump.pumpIdl.events.find((event) => event.name === "TradeEvent")!
      .discriminator,
  );
  const ammEvents = pump.getPumpAmmProgram(connection).idl.events!;
  const buyDiscriminator = Buffer.from(
    ammEvents.find((event) => event.name === "buyEvent")!.discriminator,
  );
  const sellDiscriminator = Buffer.from(
    ammEvents.find((event) => event.name === "sellEvent")!.discriminator,
  );
  for (const log of tx.meta.logMessages ?? []) {
    const invoked = /^Program (\w+) invoke \[\d+\]$/.exec(log);
    if (invoked) {
      stack.push(invoked[1]!);
      continue;
    }
    if (/^Program \w+ (success|failed:)/.test(log)) {
      stack.pop();
      continue;
    }
    if (!log.startsWith("Program data: ")) continue;
    const bytes = Buffer.from(log.slice(14), "base64");
    const discriminator = bytes.subarray(0, 8);
    const body = bytes.subarray(8);
    if (
      stack.at(-1) === pump.PUMP_PROGRAM_ID.toBase58() &&
      discriminator.equals(curveDiscriminator)
    ) {
      const event = pump.PUMP_SDK.decodeTradeEventBc(body);
      if (mints.includes(event.mint.toBase58()))
        append({
          mint: event.mint.toBase58(),
          wallet: event.user.toBase58(),
          side: event.isBuy ? "buy" : "sell",
          solAmount: Number(event.solAmount) / 1e9,
          tokenAmount: Number(event.tokenAmount) / 1e6,
          timestamp: Number(event.timestamp) * 1000,
        });
    } else if (
      stack.at(-1) === pump.PUMP_AMM_PROGRAM_ID.toBase58() &&
      (discriminator.equals(buyDiscriminator) ||
        discriminator.equals(sellDiscriminator))
    ) {
      const side = discriminator.equals(buyDiscriminator) ? "buy" : "sell";
      const event =
        side === "buy"
          ? pump.PUMP_SDK.decodeBuyEventAmm(body)
          : pump.PUMP_SDK.decodeSellEventAmm(body);
      const mint = mints.find((mint) =>
        pump.canonicalPumpPoolPda(new PublicKey(mint)).equals(event.pool),
      );
      if (mint)
        append({
          mint,
          wallet: event.user.toBase58(),
          side,
          solAmount:
            Number(
              "quoteAmountIn" in event
                ? event.quoteAmountIn
                : event.quoteAmountOut,
            ) / 1e9,
          tokenAmount:
            Number(
              "baseAmountOut" in event
                ? event.baseAmountOut
                : event.baseAmountIn,
            ) / 1e6,
          timestamp: Number(event.timestamp) * 1000,
        });
    }
  }

  const decimalsByMint = new Map<string, number>();
  for (const balance of [
    ...(tx.meta.preTokenBalances ?? []),
    ...(tx.meta.postTokenBalances ?? []),
  ])
    decimalsByMint.set(balance.mint, balance.uiTokenAmount.decimals);
  for (const [index, outer] of tx.transaction.message.instructions.entries()) {
    const inner =
      tx.meta.innerInstructions?.find((group) => group.index === index)
        ?.instructions ?? [];
    const instructions: Instruction[] = [outer, ...inner];
    for (const [position, instruction] of instructions.entries()) {
      if (!("data" in instruction)) continue;
      const layout = swapLayouts.find(
        (layout) =>
          layout.program === instruction.programId.toBase58() &&
          layout.discriminators.some((discriminator) =>
            Buffer.from(bs58.decode(instruction.data))
              .subarray(0, 8)
              .equals(Buffer.from(discriminator)),
          ),
      );
      if (!layout) continue;
      const account = (index: number) =>
        instruction.accounts[index]?.toBase58();
      const mintA = account(layout.mintA),
        mintB = account(layout.mintB),
        wallet = account(layout.user);
      if (!mintA || !mintB || !wallet) continue;
      const tokenMint =
        mintA === NATIVE_MINT.toBase58()
          ? mintB
          : mintB === NATIVE_MINT.toBase58()
            ? mintA
            : undefined;
      if (!tokenMint || !mints.includes(tokenMint)) continue;
      const vaults = new Map([
        [account(layout.vaultA), mintA],
        [account(layout.vaultB), mintB],
      ]);
      const userAccounts = new Set(layout.userAccounts.map(account));
      const changes = new Map<string, bigint>();
      const height =
        instruction.stackHeight ?? (position === 0 ? 1 : undefined);
      if (height === undefined) continue;
      for (const transfer of instructions.slice(position + 1)) {
        if (
          height !== undefined &&
          transfer.stackHeight !== undefined &&
          transfer.stackHeight !== null &&
          transfer.stackHeight <= height
        )
          break;
        if (
          !("parsed" in transfer) ||
          ![
            TOKEN_PROGRAM_ID.toBase58(),
            TOKEN_2022_PROGRAM_ID.toBase58(),
          ].includes(transfer.programId.toBase58())
        )
          continue;
        const parsed = transfer.parsed as {
          type: string;
          info: {
            source?: string;
            destination?: string;
            amount?: string;
            tokenAmount?: { amount: string; decimals: number };
            mint?: string;
          };
        };
        if (
          !["transfer", "transferChecked", "transferCheckedWithFee"].includes(
            parsed.type,
          )
        )
          continue;
        const { source, destination, amount, tokenAmount } = parsed.info;
        const inbound = userAccounts.has(source) && vaults.has(destination);
        const outbound = vaults.has(source) && userAccounts.has(destination);
        const mint = inbound
          ? vaults.get(destination)
          : outbound
            ? vaults.get(source)
            : undefined;
        const raw = tokenAmount?.amount ?? amount;
        if (!mint || !raw) continue;
        if (tokenAmount) decimalsByMint.set(mint, tokenAmount.decimals);
        changes.set(
          mint,
          (changes.get(mint) ?? 0n) + BigInt(raw) * (outbound ? 1n : -1n),
        );
      }
      const tokenChange = changes.get(tokenMint) ?? 0n;
      const quoteChange = changes.get(NATIVE_MINT.toBase58()) ?? 0n;
      const decimals = decimalsByMint.get(tokenMint);
      if (
        decimals === undefined ||
        tokenChange === 0n ||
        quoteChange === 0n ||
        tokenChange > 0n === quoteChange > 0n
      )
        continue;
      append({
        mint: tokenMint,
        wallet,
        side: tokenChange > 0n ? "buy" : "sell",
        solAmount: Math.abs(Number(quoteChange)) / 1e9,
        tokenAmount: Math.abs(Number(tokenChange)) / 10 ** decimals,
        timestamp: await confirmedTimestamp(),
      });
    }
  }
  return result;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Invalid confirmed receipt ${field}`);
  return value as Record<string, unknown>;
}
function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value))
    throw new Error(`Invalid confirmed receipt ${field}`);
  return value;
}
function key(value: unknown): PublicKey {
  if (value instanceof PublicKey) return value;
  if (typeof value !== "string")
    throw new Error("Invalid confirmed receipt address");
  return new PublicKey(value);
}
function instruction(value: unknown): Instruction {
  const raw = record(value, "instruction");
  const programId = key(raw.programId);
  const stackHeight = raw.stackHeight;
  if (
    stackHeight !== undefined &&
    stackHeight !== null &&
    (!Number.isSafeInteger(stackHeight) || Number(stackHeight) < 1)
  )
    throw new Error("Invalid confirmed receipt stack height");
  const height = { stackHeight: stackHeight as number | null | undefined };
  if ("parsed" in raw)
    return {
      ...height,
      programId,
      program: typeof raw.program === "string" ? raw.program : "",
      parsed: record(raw.parsed, "parsed instruction"),
    };
  if (typeof raw.data !== "string")
    throw new Error("Invalid confirmed receipt instruction data");
  return {
    ...height,
    programId,
    data: raw.data,
    accounts: array(raw.accounts, "instruction accounts").map(key),
  };
}
function balances(value: unknown) {
  return array(value ?? [], "token balances").map((entry) => {
    const raw = record(entry, "token balance");
    const tokenAmount = record(raw.uiTokenAmount, "token amount");
    if (
      !Number.isInteger(tokenAmount.decimals) ||
      Number(tokenAmount.decimals) < 0 ||
      Number(tokenAmount.decimals) > 255
    )
      throw new Error("Invalid confirmed receipt token decimals");
    return {
      mint: key(raw.mint).toBase58(),
      uiTokenAmount: { decimals: Number(tokenAmount.decimals) },
    };
  });
}
function parseReceipt(receipt: unknown, signature: string) {
  if (receipt === null) return null;
  const raw = record(receipt, "envelope");
  if (
    !Number.isSafeInteger(raw.slot) ||
    Number(raw.slot) < 0 ||
    (raw.version !== undefined &&
      !["legacy", 0, 1].includes(raw.version as string | number))
  )
    throw new Error("Invalid confirmed receipt slot or version");
  const transaction = record(raw.transaction, "transaction");
  if (array(transaction.signatures, "signatures")[0] !== signature)
    throw new Error("Confirmed receipt signature mismatch");
  const message = record(transaction.message, "message");
  const meta = raw.meta === null ? null : record(raw.meta, "metadata");
  if (meta && !("err" in meta))
    throw new Error("Confirmed receipt status is missing");
  const logs = meta?.logMessages == null ? [] : array(meta.logMessages, "logs");
  if (!logs.every((line) => typeof line === "string"))
    throw new Error("Invalid confirmed receipt log");
  return {
    slot: Number(raw.slot),
    transaction: {
      message: {
        instructions: array(message.instructions, "instructions").map(
          instruction,
        ),
      },
    },
    meta: meta
      ? {
          err: meta.err,
          logMessages: logs as string[],
          preTokenBalances: balances(meta.preTokenBalances),
          postTokenBalances: balances(meta.postTokenBalances),
          innerInstructions: array(
            meta.innerInstructions ?? [],
            "inner instructions",
          ).map((entry) => {
            const group = record(entry, "inner instruction group");
            if (!Number.isSafeInteger(group.index) || Number(group.index) < 0)
              throw new Error("Invalid confirmed receipt instruction index");
            return {
              index: Number(group.index),
              instructions: array(group.instructions, "inner instructions").map(
                instruction,
              ),
            };
          }),
        }
      : null,
  };
}
