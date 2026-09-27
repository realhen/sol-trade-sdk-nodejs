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

export interface DirectSwapExpectation {
  provider: "direct";
  owner: string;
  pool: string;
  venue: string;
  inputMint: string;
  outputMint: string;
  inputTokenProgram: string;
  outputTokenProgram: string;
  inputAccount: string;
  outputAccount: string;
  inputAmount: string;
  minimumOutput: string;
  swapInstructions: {
    programId: string;
    keys: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
    data: string;
  }[];
}
export interface NormalizedDirectFill {
  inputAmount: bigint;
  outputAmount: bigint;
  inputDecimals: number;
  outputDecimals: number;
  slot: number;
  blockTime: number | null;
}

type ObjectValue = Record<string, unknown>;
const SYSTEM = "11111111111111111111111111111111";
const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const TOKEN = TOKEN_PROGRAM_ID.toBase58(),
  TOKEN22 = TOKEN_2022_PROGRAM_ID.toBase58();
const WSOL = NATIVE_MINT.toBase58(),
  ATA_PROGRAM = ASSOCIATED_TOKEN_PROGRAM_ID.toBase58();
const U64_MAX = (1n << 64n) - 1n;
function fail(reason: string): never {
  throw new Error(`Invalid direct fill: ${reason}`);
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
  system: boolean;
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
 * Exact persisted swap instructions bind the selected venue and pool; only their
 * endpoint cash flow is attributed. Other instructions must have proven effects.
 */
export function normalizeDirectFill(
  tx: unknown,
  expected: DirectSwapExpectation,
): NormalizedDirectFill {
  const owner = address(expected.owner, "owner");
  const inputMint = address(expected.inputMint, "input mint"),
    outputMint = address(expected.outputMint, "output mint");
  if (inputMint === outputMint) fail("endpoints must be distinct");
  const inputProgram = program(expected.inputTokenProgram),
    outputProgram = program(expected.outputTokenProgram);
  const budget = amount(expected.inputAmount, "amountIn", true),
    floor = amount(expected.minimumOutput, "minimumAmountOut", true);
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
  if (expected.provider !== "direct") fail("invalid provider");
  const pool = address(expected.pool, "pool");
  const wanted = array(expected.swapInstructions, "expected swaps").map((v) =>
    object(v, "expected swap"),
  );
  if (!wanted.length || wanted.length > 16)
    fail("invalid swap instruction count");
  const routeIndices: number[] = [];
  let after = -1;
  for (const raw of wanted) {
    const id = address(raw.programId, "swap program");
    const metas = array(raw.keys, "swap keys").map((v) =>
      object(v, "swap key"),
    );
    const expectedKeys = metas.map((k) => address(k.pubkey, "swap key"));
    if (!expectedKeys.includes(pool)) fail("swap does not bind selected pool");
    if (
      typeof raw.data !== "string" ||
      !raw.data ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        raw.data,
      )
    )
      fail("invalid expected instruction bytes");
    const bytes = Buffer.from(raw.data, "base64");
    const matches = top.flatMap((ix, i) => {
      if (
        ix.programId !== id ||
        !Array.isArray(ix.accounts) ||
        typeof ix.data !== "string"
      )
        return [];
      let data: Uint8Array;
      try {
        data = bs58.decode(ix.data);
      } catch {
        fail("invalid instruction encoding");
      }
      return Buffer.from(data).equals(bytes) &&
        JSON.stringify(ix.accounts) === JSON.stringify(expectedKeys)
        ? [i]
        : [];
    });
    if (matches.length !== 1 || matches[0]! <= after)
      fail("swap instruction bytes or accounts differ");
    after = matches[0]!;
    routeIndices.push(after);
    for (const meta of metas) {
      if (
        typeof meta.isSigner !== "boolean" ||
        typeof meta.isWritable !== "boolean"
      )
        fail("invalid expected privilege");
      const index = addresses.indexOf(meta.pubkey as string);
      if (
        index < 0 ||
        (meta.isSigner && keys[index]!.signer !== true) ||
        (meta.isWritable && keys[index]!.writable !== true)
      )
        fail("missing swap account privilege");
    }
  }
  const swapPrograms = new Set(wanted.map((ix) => ix.programId));
  if (
    top.some(
      (ix, i) => swapPrograms.has(ix.programId) && !routeIndices.includes(i),
    )
  )
    fail("unexpected additional venue instruction");
  const makeEndpoint = (
    mint: string,
    tokenProgram: string,
    account: string,
  ): Endpoint => {
    const native = mint === WSOL;
    if (native && tokenProgram !== TOKEN)
      fail("WSOL requires classic Token program");
    const canonicalAta = getAssociatedTokenAddressSync(
      new PublicKey(mint),
      new PublicKey(owner),
      false,
      new PublicKey(tokenProgram),
    ).toBase58();
    const ata = address(account, "endpoint account");
    const system = native && ata === owner;
    if (system && !wanted.every((ix) => ix.programId === PUMP))
      fail("native owner endpoint requires Pump");
    if (!system && ata !== canonicalAta) fail("endpoint is not owner ATA");
    const index = addresses.indexOf(ata);
    if (index < 0) fail("endpoint ATA is absent from message");
    return {
      mint,
      program: tokenProgram,
      ata,
      index,
      native,
      system,
      decimals: native ? 9 : 0,
      delta: 0n,
    };
  };
  const input = makeEndpoint(inputMint, inputProgram, expected.inputAccount),
    output = makeEndpoint(outputMint, outputProgram, expected.outputAccount);
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
  const swapInner = allInner
    .filter((g) => routeIndices.includes(g.index))
    .flatMap((g) => g.instructions);
  if (!swapInner?.length) fail("missing direct inner execution evidence");
  const allInstructions = [...top, ...allInner.flatMap((g) => g.instructions)];
  const outside = [
    ...top.filter((_ix, i) => !routeIndices.includes(i)),
    ...allInner
      .filter((g) => !routeIndices.includes(g.index))
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
    if (endpoint.system) {
      const before = array(meta.preBalances, "preBalances"),
        after = array(meta.postBalances, "postBalances");
      if (before.length !== keys.length || after.length !== keys.length)
        fail("missing native balance evidence");
      let delta =
        BigInt(integer(after[ownerIndex], "native post balance")) -
        BigInt(integer(before[ownerIndex], "native pre balance"));
      if (ownerIndex === 0)
        delta += BigInt(integer(meta.fee, "transaction fee"));
      const effect = (ix: ObjectValue, within: boolean): bigint => {
        const p = parsed(ix);
        if (!p) {
          if (
            Array.isArray(ix.accounts) &&
            ix.accounts.includes(owner) &&
            ix.programId !== "ComputeBudget111111111111111111111111111111" &&
            !within
          )
            fail("opaque native mutation outside swap");
          return 0n;
        }
        const info = p.info;
        if (ix.programId === SYSTEM) {
          const outgoing = info.source === owner,
            incoming = info.destination === owner || info.newAccount === owner;
          if (!outgoing && !incoming) return 0n;
          if (p.type === "advanceNonce") return 0n;
          if (
            ![
              "transfer",
              "transferWithSeed",
              "createAccount",
              "createAccountWithSeed",
            ].includes(p.type)
          )
            fail("unsupported native mutation");
          if (
            within &&
            !["createAccount", "createAccountWithSeed"].includes(p.type)
          )
            return 0n;
          const value = BigInt(
            integer(info.lamports, "native instruction amount"),
          );
          return (incoming ? value : 0n) - (outgoing ? value : 0n);
        }
        if (p.type === "closeAccount" && info.destination === owner)
          fail("unproven native account closure");
        if (!within && (info.destination === owner || info.source === owner))
          fail("unproven native mutation outside swap");
        if (
          !within &&
          ![
            TOKEN,
            TOKEN22,
            ATA_PROGRAM,
            "ComputeBudget111111111111111111111111111111",
          ].includes(String(ix.programId)) &&
          JSON.stringify(info).includes(owner)
        )
          fail("unsupported external native instruction");
        return 0n;
      };
      for (const ix of outside) delta -= effect(ix, false);
      for (const ix of swapInner) delta -= effect(ix, true);
      endpoint.delta = delta;
      continue;
    }

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
    // ATA creation may initialize immutable ownership before initializeAccount3.
    // This affects authority metadata, not balances, and is accepted only on a
    // newly created canonical endpoint with independently matched lifecycle.
    const immutableInitialization = (
      ix: ObjectValue,
      p: ParsedInstruction | null,
    ) =>
      !before &&
      created &&
      ix.programId === endpoint.program &&
      p?.type === "initializeImmutableOwner" &&
      p.info.account === endpoint.ata;
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
          ].includes(p.type) &&
          !immutableInitialization(ix, p)
        )
          fail("unsupported endpoint mutation outside direct swap");
        if (
          p &&
          (p.info.source === endpoint.ata ||
            p.info.destination === endpoint.ata) &&
          p.type !== "closeAccount"
        )
          fail("endpoint transfer outside direct swap");
        if (
          !p &&
          Array.isArray(ix.accounts) &&
          ix.accounts.includes(endpoint.ata)
        )
          fail("opaque endpoint mutation outside direct swap");
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
        ].includes(p.type) &&
        !immutableInitialization(ix, p)
      )
        fail("unsupported endpoint mutation within direct swap");
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
      fail("missing endpoint transfer evidence within direct swap");
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
