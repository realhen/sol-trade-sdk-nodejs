import { PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";
import { Buffer } from "buffer";
import { decodeJupiterRouteInstruction } from "./jupiter";

export interface JupiterFillExpectation {
  owner: string;
  inputMint: string;
  outputMint: string;
  inputTokenProgram: string;
  outputTokenProgram: string;
  amountIn: string;
  minimumAmountOut: string;
  /** Exact base64 swap instruction returned by the trusted route preparation. */
  swapInstructionData?: string;
}
export interface NormalizedJupiterFill {
  inputAmount: bigint;
  outputAmount: bigint;
  inputDecimals: number;
  outputDecimals: number;
  slot: number;
  blockTime: number | null;
}

type ObjectValue = Record<string, unknown>;
const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const EVENT = "D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf";
const TOKEN = TOKEN_PROGRAM_ID.toBase58(),
  TOKEN22 = TOKEN_2022_PROGRAM_ID.toBase58();
const WSOL = NATIVE_MINT.toBase58(),
  ATA_PROGRAM = ASSOCIATED_TOKEN_PROGRAM_ID.toBase58();
const U64_MAX = (1n << 64n) - 1n;
function fail(reason: string): never {
  throw new Error(`Invalid Jupiter fill: ${reason}`);
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
function integer(
  value: unknown,
  name: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    fail(`${name} must be a safe integer`);
  return value;
}
function amount(value: unknown, name: string, positive = false): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value))
    fail(`${name} must be a raw integer string`);
  const result = BigInt(value);
  if (result > U64_MAX || (positive && result === 0n))
    fail(`${name} is outside u64 bounds`);
  return result;
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
function program(value: unknown): string {
  const key = address(value, "token program");
  if (key !== TOKEN && key !== TOKEN22) fail("unsupported token program");
  return key;
}
interface Endpoint {
  mint: string;
  program: string;
  ata: string;
  index: number;
  native: boolean;
  decimals: number;
  delta: bigint;
}
interface ParsedInstruction {
  type: string;
  info: ObjectValue;
}
function parsed(ix: ObjectValue): ParsedInstruction | null {
  if (ix.parsed === undefined) return null;
  const p = object(ix.parsed, "parsed instruction");
  if (typeof p.type !== "string") fail("invalid parsed instruction type");
  return { type: p.type, info: object(p.info, "parsed instruction info") };
}

/**
 * Normalize a trusted confirmed/finalized jsonParsed getTransaction receipt.
 * RPC receipts do not carry commitment; the caller must fetch at least confirmed.
 * This supports verified route_v2/shared_accounts_route_v2 contracts only.
 */
export function normalizeJupiterFill(
  tx: unknown,
  expected: JupiterFillExpectation,
): NormalizedJupiterFill {
  const owner = address(expected.owner, "owner");
  const inputMint = address(expected.inputMint, "input mint"),
    outputMint = address(expected.outputMint, "output mint");
  if (inputMint === outputMint) fail("endpoints must be distinct");
  const inputProgram = program(expected.inputTokenProgram),
    outputProgram = program(expected.outputTokenProgram);
  const budget = amount(expected.amountIn, "amountIn", true),
    floor = amount(expected.minimumAmountOut, "minimumAmountOut", true);
  const receipt = object(tx, "transaction receipt"),
    meta = object(receipt.meta, "meta");
  if (meta.err !== null) fail("transaction did not succeed");
  const slot = integer(receipt.slot, "slot", 1);
  const blockTime =
    receipt.blockTime === null ? null : integer(receipt.blockTime, "blockTime");
  const message = object(
    object(receipt.transaction, "transaction").message,
    "message",
  );
  const keys = array(message.accountKeys, "accountKeys").map((v) =>
    object(v, "account key"),
  );
  const addresses = keys.map((k) => address(k.pubkey, "account key"));
  if (new Set(addresses).size !== addresses.length)
    fail("duplicate message account key");
  const ownerIndex = addresses.indexOf(owner);
  if (ownerIndex < 0 || keys[ownerIndex]!.signer !== true)
    fail("owner is not a transaction signer");
  const top = array(message.instructions, "instructions").map((v) =>
    object(v, "instruction"),
  );
  const routeIndices = top.flatMap((ix, i) =>
    ix.programId === JUPITER ? [i] : [],
  );
  if (routeIndices.length !== 1)
    fail("requires exactly one top-level Jupiter instruction");
  const routeIndex = routeIndices[0]!,
    route = top[routeIndex]!;
  const accounts = array(route.accounts, "route accounts").map((v) =>
    address(v, "route account"),
  );
  if (typeof route.data !== "string")
    fail("missing raw route instruction data");
  let data: Uint8Array;
  try {
    data = bs58.decode(route.data);
  } catch {
    fail("invalid route base58 data");
  }
  const decoded = decodeJupiterRouteInstruction(data);
  if (decoded.amountIn !== budget || decoded.minimumAmountOut !== floor)
    fail("route amounts do not match expected fill");
  if (expected.swapInstructionData !== undefined) {
    const encoded = expected.swapInstructionData;
    if (
      typeof encoded !== "string" ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        encoded,
      )
    )
      fail("invalid expected swap data");
    const expectedBytes = Buffer.from(encoded, "base64");
    if (!Buffer.from(data).equals(expectedBytes))
      fail("route data differs from persisted swap instruction");
  }
  const makeEndpoint = (mint: string, tokenProgram: string): Endpoint => {
    const native = mint === WSOL;
    if (native && tokenProgram !== TOKEN)
      fail("WSOL requires classic Token program");
    const ata = getAssociatedTokenAddressSync(
      new PublicKey(mint),
      new PublicKey(owner),
      false,
      new PublicKey(tokenProgram),
    ).toBase58();
    const index = addresses.indexOf(ata);
    if (index < 0) fail("endpoint ATA is absent from message");
    return {
      mint,
      program: tokenProgram,
      ata,
      index,
      native,
      decimals: native ? 9 : 0,
      delta: 0n,
    };
  };
  const input = makeEndpoint(inputMint, inputProgram),
    output = makeEndpoint(outputMint, outputProgram);
  const shared = decoded.sharedAccountsId;
  if (shared === undefined) {
    const required = [
      owner,
      input.ata,
      output.ata,
      inputMint,
      outputMint,
      inputProgram,
      outputProgram,
      undefined,
      EVENT,
      JUPITER,
    ];
    if (
      accounts.length < required.length ||
      required.some((v, i) => v !== undefined && accounts[i] !== v) ||
      (accounts[7] !== JUPITER && accounts[7] !== output.ata)
    )
      fail("route authority, endpoints or token programs mismatch");
  } else {
    const authority = PublicKey.findProgramAddressSync(
      [Buffer.from("authority"), Buffer.of(shared)],
      new PublicKey(JUPITER),
    )[0];
    const sharedInput = getAssociatedTokenAddressSync(
      new PublicKey(inputMint),
      authority,
      true,
      new PublicKey(inputProgram),
    ).toBase58();
    const sharedOutput = getAssociatedTokenAddressSync(
      new PublicKey(outputMint),
      authority,
      true,
      new PublicKey(outputProgram),
    ).toBase58();
    const required = [
      authority.toBase58(),
      owner,
      input.ata,
      undefined,
      undefined,
      output.ata,
      inputMint,
      outputMint,
      inputProgram,
      outputProgram,
      EVENT,
      JUPITER,
    ];
    if (
      accounts.length < required.length ||
      required.some((v, i) => v !== undefined && accounts[i] !== v) ||
      (accounts[3] !== sharedInput && accounts[3] !== input.ata) ||
      (accounts[4] !== sharedOutput && accounts[4] !== output.ata)
    )
      fail("shared route authority, endpoints or token programs mismatch");
  }

  const groups = array(meta.innerInstructions, "innerInstructions").map((v) =>
    object(v, "inner instruction group"),
  );
  const groupIndices = new Set<number>();
  const allInner: { index: number; instructions: ObjectValue[] }[] = groups.map(
    (g) => {
      const index = integer(
        g.index,
        "inner instruction index",
        0,
        top.length - 1,
      );
      if (groupIndices.has(index)) fail("duplicate inner instruction group");
      groupIndices.add(index);
      return {
        index,
        instructions: array(g.instructions, "inner instructions").map((v) =>
          object(v, "inner instruction"),
        ),
      };
    },
  );
  const swapInner = allInner.find((g) => g.index === routeIndex)?.instructions;
  if (!swapInner?.length) fail("missing Jupiter inner execution evidence");
  const allInstructions = [...top, ...allInner.flatMap((g) => g.instructions)];
  const outside = [
    ...top.filter((_ix, i) => i !== routeIndex),
    ...allInner
      .filter((g) => g.index !== routeIndex)
      .flatMap((g) => g.instructions),
  ];
  const rows = (value: unknown, name: string): Map<number, ObjectValue> => {
    const result = new Map<number, ObjectValue>();
    for (const item of array(value, name)) {
      const row = object(item, "token balance"),
        index = integer(row.accountIndex, "balance index", 0, keys.length - 1);
      if (result.has(index)) fail("duplicate token balance account");
      result.set(index, row);
    }
    return result;
  };
  const pre = rows(meta.preTokenBalances, "preTokenBalances"),
    post = rows(meta.postTokenBalances, "postTokenBalances");
  for (const endpoint of [input, output]) {
    const decodeRow = (
      row: ObjectValue | undefined,
    ): { amount: bigint; decimals: number } | null => {
      if (!row) return null;
      if (
        row.owner !== owner ||
        row.programId !== endpoint.program ||
        row.mint !== endpoint.mint
      )
        fail("endpoint balance identity mismatch");
      const token = object(row.uiTokenAmount, "token amount");
      return {
        amount: amount(token.amount, "token balance"),
        decimals: integer(token.decimals, "token decimals", 0, 255),
      };
    };
    const before = decodeRow(pre.get(endpoint.index)),
      after = decodeRow(post.get(endpoint.index));
    const created = allInstructions.some((ix) => {
      const p = parsed(ix);
      if (!p) return false;
      if (
        ix.programId === ATA_PROGRAM &&
        ["create", "createIdempotent"].includes(p.type)
      )
        return (
          p.info.account === endpoint.ata &&
          p.info.wallet === owner &&
          p.info.mint === endpoint.mint &&
          p.info.tokenProgram === endpoint.program
        );
      return (
        ix.programId === endpoint.program &&
        [
          "initializeAccount",
          "initializeAccount2",
          "initializeAccount3",
        ].includes(p.type) &&
        p.info.account === endpoint.ata &&
        p.info.owner === owner &&
        p.info.mint === endpoint.mint
      );
    });
    const closed = allInstructions.some((ix) => {
      const p = parsed(ix);
      return (
        ix.programId === endpoint.program &&
        p?.type === "closeAccount" &&
        p.info.account === endpoint.ata &&
        p.info.owner === owner &&
        p.info.destination === owner
      );
    });
    if ((!before && !created) || (!after && !closed))
      fail("missing endpoint balance without matching account lifecycle");
    if (before && after && before.decimals !== after.decimals)
      fail("endpoint decimals changed");
    if (!endpoint.native && !before && !after)
      fail("missing non-native amount evidence");
    const decimals = (after ?? before)?.decimals;
    if (endpoint.native && decimals !== undefined && decimals !== 9)
      fail("invalid WSOL decimals");
    endpoint.decimals = decimals ?? 9;
    endpoint.delta = (after?.amount ?? 0n) - (before?.amount ?? 0n);
    // Global token balances are only attributable when no other instruction can
    // mutate this non-native endpoint outside the one verified route.
    if (!endpoint.native)
      for (const ix of outside) {
        const p = parsed(ix);
        if (
          p &&
          p.info.account === endpoint.ata &&
          ![
            "initializeAccount",
            "initializeAccount2",
            "initializeAccount3",
            "closeAccount",
            "create",
            "createIdempotent",
          ].includes(p.type)
        )
          fail("unsupported endpoint mutation outside Jupiter route");
        if (
          p &&
          (p.info.source === endpoint.ata ||
            p.info.destination === endpoint.ata) &&
          p.type !== "closeAccount"
        )
          fail("endpoint transfer outside Jupiter route");
        if (
          !p &&
          Array.isArray(ix.accounts) &&
          ix.accounts.includes(endpoint.ata)
        )
          fail("opaque endpoint mutation outside Jupiter route");
      }
    let transferCount = 0,
      transferDelta = 0n;
    for (const ix of swapInner) {
      const p = parsed(ix);
      if (!p) {
        if (
          (ix.programId === TOKEN || ix.programId === TOKEN22) &&
          (!Array.isArray(ix.accounts) || ix.accounts.includes(endpoint.ata))
        )
          fail("unparsed endpoint token instruction");
        continue;
      }
      if (
        p.info.account === endpoint.ata &&
        ![
          "initializeAccount",
          "initializeAccount2",
          "initializeAccount3",
          "closeAccount",
          "syncNative",
          "create",
          "createIdempotent",
        ].includes(p.type)
      )
        fail("unsupported endpoint mutation within Jupiter route");
      const info = p.info,
        outgoing = info.source === endpoint.ata,
        incoming = info.destination === endpoint.ata;
      if (!outgoing && !incoming) continue;
      if (
        !["transfer", "transferChecked", "transferCheckedWithFee"].includes(
          p.type,
        )
      )
        fail("unsupported endpoint token mutation");
      if (endpoint.native && p.type === "transferCheckedWithFee")
        fail("unsupported WSOL transfer fee");
      if (ix.programId !== endpoint.program)
        fail("spoofed endpoint token program");
      if (info.mint !== undefined && info.mint !== endpoint.mint)
        fail("endpoint transfer mint mismatch");
      if (
        outgoing &&
        info.authority !== owner &&
        info.multisigAuthority !== owner
      )
        fail("endpoint debit authority mismatch");
      if (p.type !== "transfer") {
        if (info.mint !== endpoint.mint) fail("missing endpoint transfer mint");
        const token = object(info.tokenAmount, "transfer token amount");
        if (
          integer(token.decimals, "transfer decimals", 0, 255) !==
          endpoint.decimals
        )
          fail("endpoint transfer decimals mismatch");
      }
      const raw =
        p.type === "transfer"
          ? info.amount
          : object(info.tokenAmount, "transfer token amount").amount;
      const value = amount(raw, "transfer amount");
      transferCount++;
      transferDelta += (incoming ? value : 0n) - (outgoing ? value : 0n);
    }
    if (!transferCount)
      fail("missing endpoint transfer evidence within Jupiter route");
    if (endpoint.native) endpoint.delta = transferDelta;
  }
  const inputAmount = -input.delta,
    outputAmount = output.delta;
  if (inputAmount <= 0n || inputAmount > budget)
    fail("actual input outside approved budget");
  if (outputAmount < floor) fail("actual net output below approved floor");
  return {
    inputAmount,
    outputAmount,
    inputDecimals: input.decimals,
    outputDecimals: output.decimals,
    slot,
    blockTime,
  };
}
