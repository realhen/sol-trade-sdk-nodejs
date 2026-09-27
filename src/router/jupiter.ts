import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  NATIVE_MINT,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
  unpackMint,
} from "@solana/spl-token";
import { Buffer } from "buffer";
import type {
  DecodedJupiterRoute,
  JupiterDecodedStep,
  PreparedRouterTrade,
  PrepareJupiterRouteOptions,
  PrepareJupiterSellForSolValueOptions,
  RouterLeg,
} from "./types";

const PROGRAM = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
const EVENT = new PublicKey("D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf");
const U64_MAX = (1n << 64n) - 1n;
const MAX_BODY = 1024 * 1024;
const snapshots = new WeakMap<object, string>();
function requireThat(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Jupiter route: ${message}`);
}
function record(value: unknown): Record<string, any> {
  requireThat(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "invalid object",
  );
  return value as Record<string, any>;
}
function array(value: unknown, max: number): any[] {
  requireThat(Array.isArray(value) && value.length <= max, "invalid array");
  return value;
}
function key(value: unknown): PublicKey {
  requireThat(typeof value === "string", "invalid public key");
  try {
    return new PublicKey(value);
  } catch {
    throw new Error("Jupiter route: invalid public key");
  }
}
function amount(value: unknown): bigint {
  requireThat(
    typeof value === "string" && /^(0|[1-9][0-9]{0,19})$/.test(value),
    "invalid amount",
  );
  const n = BigInt(value);
  requireThat(n <= U64_MAX, "amount exceeds u64");
  return n;
}
function positive(value: bigint): void {
  requireThat(
    typeof value === "bigint" && value > 0n && value <= U64_MAX,
    "input amount must be positive u64",
  );
}
function slippage(value: number): void {
  requireThat(
    Number.isInteger(value) && value >= 0 && value <= 9999,
    "invalid slippage",
  );
}
function normalize(mint: PublicKey): PublicKey {
  return mint.equals(SystemProgram.programId) ? NATIVE_MINT : mint;
}
function base64(value: unknown): Buffer {
  requireThat(
    typeof value === "string" &&
      value.length <= 22000 &&
      value.length % 4 === 0 &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        value,
      ),
    "invalid base64",
  );
  const b = Buffer.from(value, "base64");
  requireThat(b.toString("base64") === value, "noncanonical base64");
  return b;
}

class Reader {
  offset = 0;
  constructor(readonly bytes: Buffer) {}
  take(n: number): Buffer {
    requireThat(
      n >= 0 && this.offset + n <= this.bytes.length,
      "truncated route data",
    );
    const b = this.bytes.subarray(this.offset, this.offset + n);
    this.offset += n;
    return b;
  }
  u8(): number {
    return this.take(1)[0]!;
  }
  u16(): number {
    return this.take(2).readUInt16LE();
  }
  u32(): number {
    return this.take(4).readUInt32LE();
  }
  decode(type: any, depth = 0): any {
    requireThat(depth < 12, "route nesting limit");
    if (type === "u8") return this.u8();
    if (type === "u16") return this.u16();
    if (type === "u32") return this.u32();
    if (type === "u64") return this.take(8).readBigUInt64LE();
    if (type === "u128") {
      const b = this.take(16);
      return b.readBigUInt64LE() + (b.readBigUInt64LE(8) << 64n);
    }
    if (type === "bool") {
      const v = this.u8();
      requireThat(v <= 1, "invalid boolean");
      return v === 1;
    }
    requireThat(typeof type === "object", "unsupported route field");
    if (type.option) {
      const v = this.u8();
      requireThat(v <= 1, "invalid option");
      return v === 0 ? null : this.decode(type.option, depth + 1);
    }
    if (type.vec || type.array) {
      const length = type.vec ? this.u32() : type.array[1];
      requireThat(length <= 64, "route vector limit");
      return Array.from({ length }, () =>
        this.decode(type.vec ?? type.array[0], depth + 1),
      );
    }
    const name = type.defined?.name;
    const def = SCHEMA[name];
    requireThat(def, "unknown route type");
    if (def.kind === "struct") {
      const value: Record<string, any> = {};
      for (const f of def.fields)
        value[f.name] = this.decode(f.type, depth + 1);
      return value;
    }
    const variant = def.variants[this.u8()];
    requireThat(variant, "unknown swap variant");
    // These instructions select nested candidates or carry opaque execution data; no partial validation.
    requireThat(
      !["DynamicV1", "DynamicV2", "JupiterRfqV2"].includes(variant.name),
      "unsupported dynamic route",
    );
    const value: Record<string, any> = { variant: variant.name };
    for (const f of variant.fields ?? [])
      value[f.name] = this.decode(f.type, depth + 1);
    requireThat(
      value.share_fee_rate === undefined || value.share_fee_rate === 0n,
      "unexpected venue referral fee",
    );
    return value;
  }
}
/** Decode the pinned on-chain exact-input route_v2 layout. Unsupported variants fail closed. */
export function decodeJupiterRouteInstruction(
  data: Uint8Array,
): DecodedJupiterRoute {
  requireThat(data.length <= 16384, "route data too large");
  const r = new Reader(Buffer.from(data));
  const discriminator = r.take(8).toString("hex");
  requireThat(
    discriminator === "bb64facc31c4af14" ||
      discriminator === "d19853937cfed8e9",
    "unsupported router instruction",
  );
  const sharedAccountsId =
    discriminator === "d19853937cfed8e9" ? r.u8() : undefined;
  const amountIn = r.take(8).readBigUInt64LE(),
    quotedAmountOut = r.take(8).readBigUInt64LE(),
    slippageBps = r.u16();
  positive(amountIn);
  positive(quotedAmountOut);
  slippage(slippageBps);
  requireThat(r.u16() === 0 && r.u16() === 0, "unexpected router fee");
  const count = r.u32();
  requireThat(count > 0 && count <= 32, "invalid route leg count");
  const steps: JupiterDecodedStep[] = [];
  for (let i = 0; i < count; i++) {
    const x = r.decode({ defined: { name: "RoutePlanStepV2" } });
    requireThat(
      x.bps > 0 && x.bps <= 10000 && x.input_index !== x.output_index,
      "invalid route step",
    );
    steps.push({
      allowsPartialFill: x.swap.allow_partial_fill === true,
      variant: x.swap.variant,
      bps: x.bps,
      inputIndex: x.input_index,
      outputIndex: x.output_index,
    });
  }
  requireThat(r.offset === r.bytes.length, "trailing route data");
  return {
    sharedAccountsId,
    amountIn,
    quotedAmountOut,
    minimumAmountOut:
      (quotedAmountOut * BigInt(10000 - slippageBps) + 9999n) / 10000n,
    slippageBps,
    steps,
  };
}
function instruction(value: unknown, owner: PublicKey): TransactionInstruction {
  const x = record(value);
  const keys = array(x.accounts, 256).map((a) => {
    const k = record(a);
    requireThat(
      typeof k.isSigner === "boolean" && typeof k.isWritable === "boolean",
      "invalid account flags",
    );
    const pubkey = key(k.pubkey);
    requireThat(!k.isSigner || pubkey.equals(owner), "unexpected signer");
    return { pubkey, isSigner: k.isSigner, isWritable: k.isWritable };
  });
  return new TransactionInstruction({
    programId: key(x.programId),
    keys,
    data: base64(x.data),
  });
}
async function mintProgram(
  connection: Connection,
  mint: PublicKey,
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint, "confirmed").catch(() => {
    throw new Error("Jupiter route: mint lookup failed");
  });
  requireThat(info && !info.executable, "missing mint");
  requireThat(
    info.owner.equals(TOKEN_PROGRAM_ID) ||
      info.owner.equals(TOKEN_2022_PROGRAM_ID),
    "unsupported token program",
  );
  try {
    const decoded = unpackMint(mint, info, info.owner);
    requireThat(decoded.isInitialized, "uninitialized mint");
  } catch {
    throw new Error("Jupiter route: invalid mint account");
  }
  return info.owner;
}
async function fetchBuild(
  options: PrepareJupiterRouteOptions,
  input: PublicKey,
  output: PublicKey,
  destination: PublicKey,
): Promise<Record<string, any>> {
  const url = new URL("https://api.jup.ag/swap/v2/build");
  Object.entries({
    inputMint: input.toBase58(),
    outputMint: output.toBase58(),
    amount: options.amountIn.toString(),
    taker: options.owner.toBase58(),
    slippageBps: String(options.slippageBps),
    wrapAndUnwrapSol: "false",
    destinationTokenAccount: destination.toBase58(),
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const task = (async () => {
      const response = await (options.transport ?? fetch)(url.toString(), {
        method: "GET",
        headers: options.apiKey ? { "x-api-key": options.apiKey } : undefined,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
      } as RequestInit);
      requireThat(response.ok, "provider request failed");
      requireThat(!response.redirected, "redirected provider response");
      requireThat(
        Number(response.headers.get("content-length") ?? 0) <= MAX_BODY,
        "provider response too large",
      );
      requireThat(response.body, "missing provider response");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          requireThat(size <= MAX_BODY, "provider response too large");
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      return record(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    })();
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Jupiter route: provider timeout"));
        }, 6000);
      }),
    ]);
  } catch {
    throw new Error(
      "Jupiter route: provider request failed or response invalid",
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function canonical(trade: PreparedRouterTrade): string {
  return JSON.stringify({
    ...trade,
    amountIn: trade.amountIn.toString(),
    quotedAmountOut: trade.quotedAmountOut.toString(),
    minimumAmountOut: trade.minimumAmountOut.toString(),
    instructions: trade.instructions.map((i) => ({
      p: i.programId.toBase58(),
      k: i.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]),
      d: i.data.toString("base64"),
    })),
    lookupTables: trade.lookupTables.map((t) => ({
      key: t.key.toBase58(),
      addresses: t.state.addresses.map((a) => a.toBase58()),
      deactivation: t.state.deactivationSlot.toString(),
      extended: t.state.lastExtendedSlot,
      start: t.state.lastExtendedSlotStartIndex,
      authority: t.state.authority?.toBase58(),
    })),
  });
}
/** Check immediately before signing. Only unchanged objects returned by this SDK instance are accepted. */
export function assertRouterTradeFresh(
  trade: PreparedRouterTrade,
  now = Date.now(),
): void {
  requireThat(
    Number.isFinite(now) &&
      now >= trade.preparedAtMs &&
      now < trade.expiresAtMs,
    "stale or expired trade",
  );
  requireThat(
    snapshots.get(trade) === canonical(trade),
    "prepared trade was modified or is unrecognized",
  );
}
export async function prepareJupiterRoute(
  options: PrepareJupiterRouteOptions,
): Promise<PreparedRouterTrade> {
  positive(options.amountIn);
  slippage(options.slippageBps);
  const now = options.now ?? Date.now;
  const preparedAtMs = now(),
    ttl = options.maxAgeMs ?? 10000;
  requireThat(
    Number.isFinite(preparedAtMs) &&
      Number.isInteger(ttl) &&
      ttl > 0 &&
      ttl <= 30000,
    "invalid quote lifetime",
  );
  const inputMint = normalize(options.inputMint),
    outputMint = normalize(options.outputMint);
  requireThat(!inputMint.equals(outputMint), "identical swap mints");
  const wrapNativeInput = options.wrapNativeInput ?? false,
    unwrapNativeOutput = options.unwrapNativeOutput ?? false;
  requireThat(
    typeof wrapNativeInput === "boolean" &&
      typeof unwrapNativeOutput === "boolean",
    "invalid native policy",
  );
  requireThat(
    !wrapNativeInput || inputMint.equals(NATIVE_MINT),
    "cannot wrap nonnative input",
  );
  requireThat(
    !unwrapNativeOutput || outputMint.equals(NATIVE_MINT),
    "cannot unwrap nonnative output",
  );
  const [inputTokenProgram, outputTokenProgram] = await Promise.all([
    mintProgram(options.connection, inputMint),
    mintProgram(options.connection, outputMint),
  ]);
  const source = getAssociatedTokenAddressSync(
      inputMint,
      options.owner,
      true,
      inputTokenProgram,
    ),
    destination = getAssociatedTokenAddressSync(
      outputMint,
      options.owner,
      true,
      outputTokenProgram,
    );
  const body = await fetchBuild(options, inputMint, outputMint, destination);
  requireThat(
    body.inputMint === inputMint.toBase58() &&
      body.outputMint === outputMint.toBase58() &&
      body.swapMode === "ExactIn" &&
      amount(body.inAmount) === options.amountIn &&
      body.slippageBps === options.slippageBps,
    "quote does not match request",
  );
  const quotedAmountOut = amount(body.outAmount),
    minimumAmountOut = amount(body.otherAmountThreshold);
  positive(quotedAmountOut);
  requireThat(minimumAmountOut > 0n, "zero output floor");
  requireThat(
    array(body.otherInstructions, 0).length === 0 &&
      (body.tipInstruction === null || body.tipInstruction === undefined) &&
      (body.cleanupInstruction === null ||
        body.cleanupInstruction === undefined),
    "unexpected extra instruction",
  );
  const swap = instruction(body.swapInstruction, options.owner);
  requireThat(swap.programId.equals(PROGRAM), "unexpected swap program");
  const decoded = decodeJupiterRouteInstruction(swap.data);
  requireThat(
    decoded.amountIn === options.amountIn &&
      decoded.quotedAmountOut === quotedAmountOut &&
      decoded.minimumAmountOut === minimumAmountOut &&
      decoded.slippageBps === options.slippageBps,
    "binary quote mismatch",
  );
  const shared = decoded.sharedAccountsId;
  const authority =
    shared === undefined
      ? undefined
      : PublicKey.findProgramAddressSync(
          [Buffer.from("authority"), Buffer.of(shared)],
          PROGRAM,
        )[0];
  const expected = authority
    ? [
        authority,
        options.owner,
        source,
        undefined,
        undefined,
        destination,
        inputMint,
        outputMint,
        inputTokenProgram,
        outputTokenProgram,
        EVENT,
        PROGRAM,
      ]
    : [
        options.owner,
        source,
        destination,
        inputMint,
        outputMint,
        inputTokenProgram,
        outputTokenProgram,
        undefined,
        EVENT,
        PROGRAM,
      ];
  requireThat(swap.keys.length >= expected.length, "missing route accounts");
  expected.forEach((p, i) =>
    requireThat(
      !p || swap.keys[i]!.pubkey.equals(p),
      "route endpoint mismatch",
    ),
  );
  const signerIndex = authority ? 1 : 0;
  requireThat(swap.keys[signerIndex]!.isSigner, "missing owner signer");
  for (let i = 0; i < expected.length; i++)
    requireThat(
      swap.keys[i]!.isSigner === (i === signerIndex),
      "unexpected header signer",
    );
  for (const i of authority ? [2, 3, 4, 5] : [1, 2])
    requireThat(swap.keys[i]!.isWritable, "readonly token account");
  if (authority) {
    // Token2022 routes can use the owner's ATA directly to avoid an extra transfer.
    // Only the exact endpoint ATA or this route authority's canonical ATA is allowed.
    const programSource = swap.keys[3]!.pubkey;
    requireThat(
      programSource.equals(source) ||
        programSource.equals(
          getAssociatedTokenAddressSync(
            inputMint,
            authority,
            true,
            inputTokenProgram,
          ),
        ),
      "redirected shared source",
    );
    const target = swap.keys[4]!.pubkey;
    requireThat(
      target.equals(destination) ||
        target.equals(
          getAssociatedTokenAddressSync(
            outputMint,
            authority,
            true,
            outputTokenProgram,
          ),
        ),
      "redirected shared destination",
    );
  } else
    requireThat(
      swap.keys[7]!.pubkey.equals(PROGRAM) ||
        swap.keys[7]!.pubkey.equals(destination),
      "redirected optional destination",
    );
  const plans = array(body.routePlan, 32);
  requireThat(
    plans.length === decoded.steps.length,
    "route metadata length mismatch",
  );
  const routeLegs: RouterLeg[] = plans.map((raw, i) => {
    const p = record(raw),
      s = record(p.swapInfo),
      step = decoded.steps[i]!;
    key(s.ammKey);
    key(s.inputMint);
    key(s.outputMint);
    requireThat(
      typeof s.label === "string" &&
        s.label.length > 0 &&
        s.label.length <= 80 &&
        p.bps === step.bps,
      "route metadata mismatch",
    );
    requireThat(
      s.ammKey !== s.inputMint &&
        s.ammKey !== s.outputMint &&
        s.ammKey !== options.owner.toBase58() &&
        swap.keys.some((k) => k.pubkey.toBase58() === s.ammKey && k.isWritable),
      "route pool missing",
    );
    return {
      pool: s.ammKey,
      label: s.label,
      inputMint: s.inputMint,
      outputMint: s.outputMint,
      bps: p.bps,
    };
  });
  const indices = new Map<number, string>([[0, inputMint.toBase58()]]);
  const spent = new Map<number, number>();
  const produced = new Set<number>([0]);
  for (let i = 0; i < routeLegs.length; i++) {
    const leg = routeLegs[i]!,
      step = decoded.steps[i]!;
    requireThat(
      produced.has(step.inputIndex) &&
        indices.get(step.inputIndex) === leg.inputMint,
      "invalid route input graph",
    );
    requireThat(step.outputIndex !== 0, "cyclic route");
    const prev = indices.get(step.outputIndex);
    requireThat(!prev || prev === leg.outputMint, "route mint index mismatch");
    indices.set(step.outputIndex, leg.outputMint);
    produced.add(step.outputIndex);
    spent.set(step.inputIndex, (spent.get(step.inputIndex) ?? 0) + step.bps);
  }
  const sinks = [...produced].filter((i) => !spent.has(i));
  requireThat(
    sinks.length === 1 && indices.get(sinks[0]!) === outputMint.toBase58(),
    "invalid route destination graph",
  );
  for (const bps of spent.values())
    requireThat(bps === 10000, "incomplete route input allocation");
  const programs = new Map<string, PublicKey>([
    [inputMint.toBase58(), inputTokenProgram],
    [outputMint.toBase58(), outputTokenProgram],
  ]);
  for (const mint of new Set(
    routeLegs.flatMap((l) => [l.inputMint, l.outputMint]),
  )) {
    if (!programs.has(mint))
      programs.set(
        mint,
        await mintProgram(options.connection, new PublicKey(mint)),
      );
  }
  const instructions: TransactionInstruction[] = [];
  const seen = new Set<string>();
  for (const raw of array(body.setupInstructions, 64)) {
    const ix = instruction(raw, options.owner);
    requireThat(
      ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID) &&
        ix.data.equals(Buffer.of(1)) &&
        ix.keys.length === 6,
      "unsupported setup instruction",
    );
    const mint = ix.keys[3]!.pubkey,
      program = programs.get(mint.toBase58());
    requireThat(program, "unexpected setup mint");
    const canonicalIx = createAssociatedTokenAccountIdempotentInstruction(
      options.owner,
      getAssociatedTokenAddressSync(mint, options.owner, true, program),
      options.owner,
      mint,
      program,
    );
    requireThat(
      ix.keys.every((k, i) => {
        const c = canonicalIx.keys[i]!;
        return (
          k.pubkey.equals(c.pubkey) &&
          k.isSigner === c.isSigner &&
          k.isWritable === c.isWritable
        );
      }),
      "invalid setup account",
    );
    const ata = ix.keys[1]!.pubkey.toBase58();
    if (!seen.has(ata)) {
      instructions.push(canonicalIx);
      seen.add(ata);
    }
  }
  for (const [mint, program, ata] of [
    [inputMint, inputTokenProgram, source],
    [outputMint, outputTokenProgram, destination],
  ] as const) {
    if (!seen.has(ata.toBase58()))
      instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          options.owner,
          ata,
          options.owner,
          mint,
          program,
        ),
      );
  }
  if (wrapNativeInput)
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: options.owner,
        toPubkey: source,
        lamports: options.amountIn,
      }),
      createSyncNativeInstruction(source, inputTokenProgram),
    );
  instructions.push(swap);
  if (unwrapNativeOutput)
    instructions.push(
      createCloseAccountInstruction(
        destination,
        options.owner,
        options.owner,
        [],
        outputTokenProgram,
      ),
    );
  const advertised = record(body.addressesByLookupTableAddress);
  const lookupTables: AddressLookupTableAccount[] = [];
  requireThat(Object.keys(advertised).length <= 16, "too many lookup tables");
  for (const [address, entries] of Object.entries(advertised)) {
    const pubkey = key(address);
    const list = array(entries, 256).map(key);
    const result = await options.connection
      .getAddressLookupTable(pubkey, {
        commitment: "confirmed",
      })
      .catch(() => {
        throw new Error("Jupiter route: lookup table request failed");
      });
    const table = result.value;
    requireThat(
      table && table.key.equals(pubkey) && table.isActive(),
      "lookup table unavailable",
    );
    requireThat(
      list.length === table.state.addresses.length &&
        list.every((p, i) => p.equals(table.state.addresses[i]!)),
      "lookup table contents disagree",
    );
    lookupTables.push(table);
  }
  const trade: PreparedRouterTrade = {
    provider: "jupiter",
    routeId: globalThis.crypto.randomUUID(),
    swapInstructionData: swap.data.toString("base64"),
    owner: options.owner,
    inputMint,
    outputMint,
    inputTokenProgram,
    outputTokenProgram,
    amountIn: options.amountIn,
    quotedAmountOut,
    minimumAmountOut,
    preparedAtMs,
    expiresAtMs: preparedAtMs + ttl,
    wrapNativeInput,
    unwrapNativeOutput,
    allowsPartialFill: decoded.steps.some((s) => s.allowsPartialFill === true),
    routeLegs,
    instructions,
    lookupTables,
  };
  snapshots.set(trade, canonical(trade));
  assertRouterTradeFresh(trade, now());
  return trade;
}

/**
 * Size an exact-input token sale to an expected SOL value, using at most eight
 * validated route preparations. Never exceeds holdings or the expected SOL target.
 * Returns a fresh quote within targetToleranceBps below that target (at least one
 * lamport tolerance). Execution can differ within the requested swap slippage.
 * A failed maximum-holdings quote or nonmonotonic liquidity fails closed; it does
 * not prove that every smaller amount lacks a route. No transaction is submitted.
 */
export async function prepareJupiterSellForSolValue(
  options: PrepareJupiterSellForSolValueOptions,
): Promise<PreparedRouterTrade> {
  positive(options.maximumInputAmount);
  positive(options.targetLamports);
  requireThat(
    normalize(options.outputMint).equals(NATIVE_MINT),
    "sell-value output must be SOL",
  );
  const toleranceBps = options.targetToleranceBps ?? 10;
  requireThat(
    Number.isInteger(toleranceBps) && toleranceBps >= 0 && toleranceBps <= 100,
    "invalid sell target tolerance",
  );
  const tolerance = (options.targetLamports * BigInt(toleranceBps)) / 10000n;
  const lowerTarget =
    options.targetLamports - (tolerance > 0n ? tolerance : 1n);
  const acceptable = (trade: PreparedRouterTrade) =>
    trade.quotedAmountOut <= options.targetLamports &&
    trade.quotedAmountOut >= lowerTarget;
  let highAmount = options.maximumInputAmount;
  const maximum = await prepareJupiterRoute({
    ...options,
    amountIn: highAmount,
  });
  if (acceptable(maximum)) return maximum;
  requireThat(
    maximum.quotedAmountOut >= options.targetLamports,
    "target exceeds quoted holdings output",
  );
  let highOutput = maximum.quotedAmountOut,
    lowAmount = 0n,
    lowOutput = 0n;
  for (let attempt = 1; attempt < 8; attempt++) {
    requireThat(
      highAmount - lowAmount > 1n && highOutput > lowOutput,
      "token granularity cannot meet target",
    );
    let candidate =
      lowAmount +
      ((options.targetLamports - lowOutput) * (highAmount - lowAmount)) /
        (highOutput - lowOutput);
    if (candidate <= lowAmount) candidate = lowAmount + 1n;
    if (candidate >= highAmount) candidate = highAmount - 1n;
    const trade = await prepareJupiterRoute({
      ...options,
      amountIn: candidate,
    });
    if (acceptable(trade)) return trade;
    requireThat(
      trade.quotedAmountOut >= lowOutput && trade.quotedAmountOut <= highOutput,
      "nonmonotonic sell quotes; cannot converge",
    );
    if (trade.quotedAmountOut > options.targetLamports) {
      highAmount = candidate;
      highOutput = trade.quotedAmountOut;
    } else {
      lowAmount = candidate;
      lowOutput = trade.quotedAmountOut;
    }
  }
  throw new Error(
    "Jupiter route: sell sizing did not converge within eight preparations",
  );
}

// Pinned 2026-09-27 on-chain Anchor IDL, account C88XWfp26heEmDkmfSzeXP7Fd7GQJ2j9dDTUsyiZbUTa, owner JUP6.
// Full source snapshot: __tests__/fixtures/jupiter-onchain-idl.json; SHA256 2563f75d6fb24858a5f9d11577ae9ca71083add31272c07cc5739b256ceb1bff.
// Schema only: no downloaded executable code. Unknown discriminators/variants fail closed.
const SCHEMA: Record<string, any> = {
  RemainingAccountsInfo: {
    kind: "struct",
    fields: [
      {
        name: "slices",
        type: { vec: { defined: { name: "RemainingAccountsSlice" } } },
      },
    ],
  },
  RemainingAccountsSlice: {
    kind: "struct",
    fields: [
      { name: "accounts_type", type: "u8" },
      { name: "length", type: "u8" },
    ],
  },
  RoutePlanStepV2: {
    kind: "struct",
    fields: [
      { name: "swap", type: { defined: { name: "Swap" } } },
      { name: "bps", type: "u16" },
      { name: "input_index", type: "u8" },
      { name: "output_index", type: "u8" },
    ],
  },
  Side: { kind: "enum", variants: [{ name: "Bid" }, { name: "Ask" }] },
  BisonFiPredictSide: {
    kind: "enum",
    variants: [{ name: "Yes" }, { name: "No" }],
  },
  Swap: {
    kind: "enum",
    variants: [
      { name: "Saber" },
      { name: "SaberAddDecimalsDeposit" },
      { name: "SaberAddDecimalsWithdraw" },
      { name: "TokenSwap" },
      { name: "Sencha" },
      { name: "Step" },
      { name: "Cropper" },
      { name: "Raydium" },
      { name: "Crema", fields: [{ name: "a_to_b", type: "bool" }] },
      { name: "Lifinity" },
      { name: "Mercurial" },
      { name: "Cykura" },
      {
        name: "Serum",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      { name: "MarinadeDeposit" },
      { name: "MarinadeUnstake" },
      {
        name: "Aldrin",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      {
        name: "AldrinV2",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      { name: "Whirlpool", fields: [{ name: "a_to_b", type: "bool" }] },
      { name: "Invariant", fields: [{ name: "x_to_y", type: "bool" }] },
      { name: "Meteora" },
      { name: "GooseFX" },
      { name: "DeltaFi", fields: [{ name: "stable", type: "bool" }] },
      { name: "Balansol" },
      { name: "MarcoPolo", fields: [{ name: "x_to_y", type: "bool" }] },
      {
        name: "Dradex",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      { name: "LifinityV2" },
      { name: "RaydiumClmm" },
      {
        name: "Openbook",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      {
        name: "Phoenix",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      {
        name: "Symmetry",
        fields: [
          { name: "from_token_id", type: "u64" },
          { name: "to_token_id", type: "u64" },
        ],
      },
      { name: "TokenSwapV2" },
      { name: "HeliumTreasuryManagementRedeemV0" },
      { name: "StakeDexStakeWrappedSol" },
      {
        name: "StakeDexSwapViaStake",
        fields: [{ name: "bridge_stake_seed", type: "u32" }],
      },
      { name: "GooseFXV2" },
      { name: "Perps" },
      { name: "PerpsAddLiquidity" },
      { name: "PerpsRemoveLiquidity" },
      { name: "MeteoraDlmm" },
      {
        name: "OpenBookV2",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      { name: "RaydiumClmmV2" },
      {
        name: "StakeDexPrefundWithdrawStakeAndDepositStake",
        fields: [{ name: "bridge_stake_seed", type: "u32" }],
      },
      {
        name: "Clone",
        fields: [
          { name: "pool_index", type: "u8" },
          { name: "quantity_is_input", type: "bool" },
          { name: "quantity_is_collateral", type: "bool" },
        ],
      },
      {
        name: "SanctumS",
        fields: [
          { name: "src_lst_value_calc_accs", type: "u8" },
          { name: "dst_lst_value_calc_accs", type: "u8" },
          { name: "src_lst_index", type: "u32" },
          { name: "dst_lst_index", type: "u32" },
        ],
      },
      {
        name: "SanctumSAddLiquidity",
        fields: [
          { name: "lst_value_calc_accs", type: "u8" },
          { name: "lst_index", type: "u32" },
        ],
      },
      {
        name: "SanctumSRemoveLiquidity",
        fields: [
          { name: "lst_value_calc_accs", type: "u8" },
          { name: "lst_index", type: "u32" },
        ],
      },
      { name: "RaydiumCP" },
      {
        name: "WhirlpoolSwapV2",
        fields: [
          { name: "a_to_b", type: "bool" },
          {
            name: "remaining_accounts_info",
            type: { option: { defined: { name: "RemainingAccountsInfo" } } },
          },
        ],
      },
      { name: "OneIntro" },
      { name: "PumpWrappedBuy" },
      { name: "PumpWrappedSell" },
      { name: "PerpsV2" },
      { name: "PerpsV2AddLiquidity" },
      { name: "PerpsV2RemoveLiquidity" },
      { name: "MoonshotWrappedBuy" },
      { name: "MoonshotWrappedSell" },
      { name: "StabbleStableSwap" },
      { name: "StabbleWeightedSwap" },
      { name: "Obric", fields: [{ name: "x_to_y", type: "bool" }] },
      { name: "FoxBuyFromEstimatedCost" },
      { name: "FoxClaimPartial", fields: [{ name: "is_y", type: "bool" }] },
      { name: "SolFi", fields: [{ name: "is_quote_to_base", type: "bool" }] },
      { name: "SolayerDelegateNoInit" },
      { name: "SolayerUndelegateNoInit" },
      {
        name: "TokenMill",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      { name: "DaosFunBuy" },
      { name: "DaosFunSell" },
      { name: "ZeroFi" },
      { name: "StakeDexWithdrawWrappedSol" },
      { name: "VirtualsBuy" },
      { name: "VirtualsSell" },
      {
        name: "Perena",
        fields: [
          { name: "in_index", type: "u8" },
          { name: "out_index", type: "u8" },
        ],
      },
      { name: "PumpSwapBuy" },
      { name: "PumpSwapSell" },
      { name: "Gamma" },
      {
        name: "MeteoraDlmmSwapV2",
        fields: [
          {
            name: "remaining_accounts_info",
            type: { defined: { name: "RemainingAccountsInfo" } },
          },
        ],
      },
      { name: "Woofi" },
      { name: "MeteoraDammV2" },
      { name: "MeteoraDynamicBondingCurveSwap" },
      { name: "StabbleStableSwapV2" },
      { name: "StabbleWeightedSwapV2" },
      {
        name: "RaydiumLaunchlabBuy",
        fields: [{ name: "share_fee_rate", type: "u64" }],
      },
      {
        name: "RaydiumLaunchlabSell",
        fields: [{ name: "share_fee_rate", type: "u64" }],
      },
      { name: "BoopdotfunWrappedBuy" },
      { name: "BoopdotfunWrappedSell" },
      {
        name: "Plasma",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      {
        name: "GoonFi",
        fields: [
          { name: "is_bid", type: "bool" },
          { name: "blacklist_bump", type: "u8" },
        ],
      },
      {
        name: "HumidiFi",
        fields: [
          { name: "swap_id", type: "u64" },
          { name: "is_base_to_quote", type: "bool" },
        ],
      },
      { name: "MeteoraDynamicBondingCurveSwapWithRemainingAccounts" },
      {
        name: "TesseraV",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      { name: "PumpWrappedBuyV2" },
      { name: "PumpWrappedSellV2" },
      { name: "PumpSwapBuyV2" },
      { name: "PumpSwapSellV2" },
      { name: "Heaven", fields: [{ name: "a_to_b", type: "bool" }] },
      { name: "SolFiV2", fields: [{ name: "is_quote_to_base", type: "bool" }] },
      { name: "Aquifer" },
      { name: "PumpWrappedBuyV3" },
      { name: "PumpWrappedSellV3" },
      { name: "PumpSwapBuyV3" },
      { name: "PumpSwapSellV3" },
      { name: "JupiterLendDeposit" },
      { name: "JupiterLendRedeem" },
      {
        name: "DefiTuna",
        fields: [
          { name: "a_to_b", type: "bool" },
          {
            name: "remaining_accounts_info",
            type: { option: { defined: { name: "RemainingAccountsInfo" } } },
          },
        ],
      },
      { name: "AlphaQ", fields: [{ name: "a_to_b", type: "bool" }] },
      { name: "RaydiumV2" },
      { name: "SarosDlmm", fields: [{ name: "swap_for_y", type: "bool" }] },
      {
        name: "Futarchy",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      { name: "MeteoraDammV2WithRemainingAccounts" },
      { name: "Obsidian" },
      {
        name: "WhaleStreet",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      {
        name: "DynamicV1",
        fields: [
          {
            name: "candidate_swaps",
            type: { vec: { defined: { name: "CandidateSwap" } } },
          },
          { name: "best_position", type: { option: "u8" } },
        ],
      },
      { name: "PumpWrappedBuyV4" },
      { name: "PumpWrappedSellV4" },
      { name: "CarrotIssue" },
      { name: "CarrotRedeem" },
      {
        name: "Manifest",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      { name: "BisonFi", fields: [{ name: "a_to_b", type: "bool" }] },
      {
        name: "HumidiFiV2",
        fields: [
          { name: "swap_id", type: "u64" },
          { name: "is_base_to_quote", type: "bool" },
        ],
      },
      { name: "PerenaStar", fields: [{ name: "is_mint", type: "bool" }] },
      {
        name: "JupiterRfqV2",
        fields: [
          { name: "side", type: { defined: { name: "Side" } } },
          { name: "fill_data", type: "bytes" },
        ],
      },
      { name: "GoonFiV2", fields: [{ name: "is_bid", type: "bool" }] },
      { name: "Scorch", fields: [{ name: "swap_id", type: "u128" }] },
      {
        name: "VaultLiquidUnstake",
        fields: [
          { name: "lst_amounts", type: { array: ["u64", 5] } },
          { name: "seed", type: "u64" },
        ],
      },
      { name: "XOrca" },
      {
        name: "Quantum",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      {
        name: "WhaleStreetV2",
        fields: [
          { name: "side", type: { defined: { name: "Side" } } },
          { name: "auth_amount_in", type: "u64" },
          { name: "auth", type: "u64" },
        ],
      },
      {
        name: "Riptide",
        fields: [{ name: "amount_is_token_a", type: "bool" }],
      },
      { name: "RunnerRodeo" },
      { name: "TaurusFi", fields: [{ name: "is_base_in", type: "bool" }] },
      { name: "Omnipair" },
      { name: "MSwap" },
      {
        name: "Hylo",
        fields: [
          { name: "swap_type", type: { defined: { name: "HyloSwapType" } } },
        ],
      },
      { name: "VoltrDeposit" },
      { name: "VoltrWithdraw" },
      {
        name: "SanctumSV2",
        fields: [
          { name: "src_lst_value_calc_accs", type: "u8" },
          { name: "dst_lst_value_calc_accs", type: "u8" },
          { name: "src_lst_index", type: "u32" },
          { name: "dst_lst_index", type: "u32" },
        ],
      },
      { name: "LemmingsFi", fields: [{ name: "is_base_in", type: "bool" }] },
      { name: "ScaleVmmBuy" },
      { name: "ScaleVmmSell" },
      { name: "ScaleAmmBuy" },
      { name: "ScaleAmmSell" },
      { name: "BisonFiV2", fields: [{ name: "a_to_b", type: "bool" }] },
      { name: "Trends" },
      { name: "HumaDeposit" },
      { name: "HumaInstantWithdraw" },
      { name: "Kipseli", fields: [{ name: "is_base_to_quote", type: "bool" }] },
      {
        name: "DynamicV2",
        fields: [
          {
            name: "candidate_swaps",
            type: { vec: { defined: { name: "CandidateSwapWithBps" } } },
          },
          { name: "max_split_quote_calls", type: "u8" },
          { name: "max_split_candidates", type: "u8" },
        ],
      },
      { name: "PumpSwapBuyV3WithCashbackClaim" },
      { name: "PumpSwapSellV3WithCashbackClaim" },
      { name: "PumpWrappedBuyV4WithCashbackClaim" },
      { name: "PumpWrappedSellV4WithCashbackClaim" },
      { name: "GoonFiV3", fields: [{ name: "is_bid", type: "bool" }] },
      {
        name: "PumpWrappedBuyV5",
        fields: [{ name: "claim_cashback", type: "bool" }],
      },
      {
        name: "PumpWrappedSellV5",
        fields: [{ name: "claim_cashback", type: "bool" }],
      },
      { name: "ZeroFiSwapV2" },
      {
        name: "BisonFiPredict",
        fields: [
          { name: "side", type: { defined: { name: "BisonFiPredictSide" } } },
          { name: "is_buy", type: "bool" },
        ],
      },
      { name: "ByrealDynamicV3" },
      {
        name: "Flux",
        fields: [
          { name: "swap_id", type: "u64" },
          { name: "base_to_quote", type: "bool" },
        ],
      },
      { name: "VaultLiquidSellLst" },
      {
        name: "VaultLiquidBuyLst",
        fields: [{ name: "lst_amount", type: "u64" }],
      },
      {
        name: "KipseliV2",
        fields: [{ name: "is_base_to_quote", type: "bool" }],
      },
      {
        name: "Deriverse",
        fields: [
          { name: "side", type: { defined: { name: "Side" } } },
          { name: "instr_id", type: "u32" },
        ],
      },
      { name: "Hadron", fields: [{ name: "is_x", type: "bool" }] },
      { name: "BinaryFi" },
      { name: "Metric", fields: [{ name: "zero_for_one", type: "bool" }] },
      {
        name: "JupiterLendDexSwap",
        fields: [{ name: "swap0to1", type: "bool" }],
      },
      { name: "Gatorswap", fields: [{ name: "base_to_quote", type: "bool" }] },
      {
        name: "Flint",
        fields: [
          { name: "is_global", type: "bool" },
          { name: "taker_buy", type: "bool" },
        ],
      },
      { name: "Denali", fields: [{ name: "base_to_quote", type: "bool" }] },
      { name: "PerenaStarV2Deposit" },
      {
        name: "PerenaStarV2WithdrawFromExternal",
        fields: [{ name: "external_liquidity_source", type: "u8" }],
      },
      {
        name: "SanctumSols",
        fields: [
          {
            name: "swap_type",
            type: { defined: { name: "SanctumSolsSwapType" } },
          },
        ],
      },
      {
        name: "HyloV2",
        fields: [
          { name: "swap_type", type: { defined: { name: "HyloSwapType" } } },
        ],
      },
      { name: "SanctumPamm" },
      {
        name: "Archer",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      { name: "TrenchWrappedBuy" },
      { name: "TrenchWrappedSell" },
      {
        name: "BisonFiMarketBacked",
        fields: [{ name: "a_to_b", type: "bool" }],
      },
      {
        name: "TesseraVV2",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      { name: "Stableswap" },
      { name: "BinaryFiV2" },
      {
        name: "KipseliV3",
        fields: [{ name: "is_base_to_quote", type: "bool" }],
      },
      {
        name: "PerenaStarV2TrancheDeposit",
        fields: [
          { name: "kind", type: { defined: { name: "PerenaTrancheKind" } } },
        ],
      },
      {
        name: "PerenaStarV2TrancheWithdrawFromExternal",
        fields: [
          { name: "kind", type: { defined: { name: "PerenaTrancheKind" } } },
          { name: "external_liquidity_source", type: { option: "u8" } },
        ],
      },
      { name: "Quay", fields: [{ name: "sell_base", type: "bool" }] },
      {
        name: "HumidiFiRouter",
        fields: [
          { name: "claimed_ms", type: "u64" },
          { name: "seed_rng", type: { array: ["u8", 32] } },
          { name: "token", type: { array: ["u8", 16] } },
          { name: "is_base_to_quote", type: "bool" },
        ],
      },
      {
        name: "HumidiFiRouterV2",
        fields: [
          { name: "router_id", type: "u64" },
          { name: "claimed_ms", type: "u64" },
          { name: "seed_rng", type: { array: ["u8", 32] } },
          { name: "token", type: { array: ["u8", 16] } },
          { name: "is_base_to_quote", type: "bool" },
        ],
      },
      {
        name: "PumpWrappedBuyV6",
        fields: [
          { name: "claim_cashback", type: "bool" },
          { name: "allow_partial_fill", type: "bool" },
        ],
      },
      { name: "HyloRouter" },
    ],
  },
  PerenaTrancheKind: {
    kind: "enum",
    variants: [{ name: "Junior" }, { name: "Senior" }],
  },
  CandidateSwapWithBps: {
    kind: "struct",
    fields: [
      { name: "candidate_swap", type: { defined: { name: "CandidateSwap" } } },
      { name: "bps", type: "u32" },
    ],
  },
  CandidateSwap: {
    kind: "enum",
    variants: [
      {
        name: "HumidiFi",
        fields: [
          { name: "swap_id", type: "u64" },
          { name: "is_base_to_quote", type: "bool" },
        ],
      },
      {
        name: "TesseraV",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      {
        name: "HumidiFiV2",
        fields: [
          { name: "swap_id", type: "u64" },
          { name: "is_base_to_quote", type: "bool" },
        ],
      },
      { name: "RaydiumV2" },
      { name: "RaydiumClmm" },
      { name: "Whirlpool", fields: [{ name: "a_to_b", type: "bool" }] },
      { name: "ZeroFi" },
      { name: "BisonFiV2", fields: [{ name: "a_to_b", type: "bool" }] },
      { name: "GoonFiV2", fields: [{ name: "is_bid", type: "bool" }] },
      { name: "GoonFiV3", fields: [{ name: "is_bid", type: "bool" }] },
      {
        name: "WhirlpoolV2",
        fields: [
          { name: "a_to_b", type: "bool" },
          {
            name: "remaining_accounts_info",
            type: { option: { defined: { name: "RemainingAccountsInfo" } } },
          },
        ],
      },
      { name: "ZeroFiSwapV2" },
      {
        name: "BisonFiMarketBacked",
        fields: [{ name: "a_to_b", type: "bool" }],
      },
      { name: "RaydiumClmmV2" },
      {
        name: "TesseraVV2",
        fields: [{ name: "side", type: { defined: { name: "Side" } } }],
      },
      {
        name: "HumidiFiRouter",
        fields: [
          { name: "claimed_ms", type: "u64" },
          { name: "seed_rng", type: { array: ["u8", 32] } },
          { name: "token", type: { array: ["u8", 16] } },
          { name: "is_base_to_quote", type: "bool" },
        ],
      },
      {
        name: "HumidiFiRouterV2",
        fields: [
          { name: "router_id", type: "u64" },
          { name: "claimed_ms", type: "u64" },
          { name: "seed_rng", type: { array: ["u8", 32] } },
          { name: "token", type: { array: ["u8", 16] } },
          { name: "is_base_to_quote", type: "bool" },
        ],
      },
    ],
  },
  SanctumSolsSwapType: {
    kind: "enum",
    variants: [{ name: "Mint" }, { name: "Claim" }, { name: "ClaimHolding" }],
  },
  HyloSwapType: {
    kind: "enum",
    variants: [
      { name: "MintStable" },
      { name: "RedeemStable" },
      { name: "MintLever" },
      { name: "RedeemLever" },
      { name: "SwapStableToLever" },
      { name: "SwapLeverToStable" },
      { name: "StabilityPoolDeposit" },
      { name: "StabilityPoolWithdraw" },
    ],
  },
};
