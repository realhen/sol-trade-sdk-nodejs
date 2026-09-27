import {
  TransactionV1,
  compileV1Transaction,
  decompileV1Transaction,
} from "../common/transaction-v1";
import { createServer, type Server } from "node:http";
import { Buffer } from "buffer";
import bs58 from "bs58";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemInstruction,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  buildSignedVersionedTransaction,
  buildSwapTransaction,
  compileTransaction,
} from "../common/transaction";
import {
  assertSenderVariants,
  prepareTransactionVariants,
  sendPreparedTransactions,
  type HttpSenderRoute,
} from "../swqos/prepared";
import { SwqosType } from "../enums";

const payer = Keypair.generate();
const recipient = Keypair.generate().publicKey;
const nonceAccount = Keypair.generate().publicKey;
const nonceHash = Keypair.generate().publicKey.toBase58();
const core = [
  SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: recipient,
    lamports: 17,
  }),
];
const makeBase = (
  nonce = true,
  lookupTables: AddressLookupTableAccount[] = [],
) =>
  buildSwapTransaction({
    payer: payer.publicKey,
    instructions: core,
    recentBlockhash: nonceHash,
    lookupTables,
    computeUnitLimit: 200_000,
    computeUnitPriceMicroLamports: 50n,
    durableNonce: nonce
      ? { nonceAccount, authority: payer.publicKey, nonceHash }
      : undefined,
  });
const makeRoutes = (url = "http://127.0.0.1:1234"): HttpSenderRoute[] => [
  { id: "rpc", name: "RPC", url: `${url}/rpc`, tipLamports: 0 },
  {
    id: "relay",
    name: "Jito",
    url,
    type: SwqosType.Jito,
    tipAccount: Keypair.generate().publicKey.toBase58(),
    tipLamports: 10_000,
    headers: { "x-test-auth": "test-only" },
  },
];
const signed = (variants: ReturnType<typeof prepareTransactionVariants>) =>
  variants.map((variant) => {
    variant.transaction.sign([payer]);
    return {
      routeId: variant.routeId,
      signedBase64: Buffer.from(variant.transaction.serialize()).toString(
        "base64",
      ),
      expectedSignature: bs58.encode(variant.transaction.signatures[0]!),
    };
  });
const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});
async function localEndpoint(
  mode:
    | "accept"
    | "wrong"
    | "reject"
    | "timeout"
    | "empty"
    | "negative"
    | "positive" = "accept",
) {
  const received: {
    path: string;
    body: any;
    headers: Record<string, any>;
    bytes: Buffer;
    transaction: VersionedTransaction | TransactionV1;
  }[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks);
    const binary =
      request.headers["content-type"] === "application/octet-stream";
    const body = binary ? {} : JSON.parse(raw.toString());
    const bytes = binary
      ? raw
      : Buffer.from(body.params?.[0] ?? body.transaction, "base64");
    const transaction =
      bytes[0] === 0x81
        ? TransactionV1.deserialize(bytes)
        : VersionedTransaction.deserialize(bytes);
    received.push({
      path: request.url!,
      body,
      bytes,
      transaction,
      headers: request.headers,
    });
    if (mode === "timeout") return;
    response.setHeader("content-type", "application/json");
    if (mode === "empty") {
      response.end("");
      return;
    }
    if (mode === "negative" || mode === "positive") {
      response.end(JSON.stringify({ success: mode === "positive" }));
      return;
    }
    response.end(
      JSON.stringify(
        mode === "reject"
          ? { error: { message: "secret-provider-error" } }
          : {
              jsonrpc: "2.0",
              id: 1,
              result:
                mode === "wrong"
                  ? "wrong-signature"
                  : bs58.encode(transaction.signatures[0]!),
            },
      ),
    );
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing local server address");
  return { url: `http://127.0.0.1:${address.port}`, received };
}

describe("caller-signed browser HTTP submission workflow", () => {
  it("shares compilation with the signed Node path and enforces payer-only packets", () => {
    const unsigned = compileTransaction({
      payer: payer.publicKey,
      instructions: core,
      recentBlockhash: nonceHash,
    });
    const node = buildSignedVersionedTransaction(payer, core, nonceHash);
    expect(unsigned.message.serialize()).toEqual(node.message.serialize());
    expect(unsigned.signatures[0]!.every((byte) => byte === 0)).toBe(true);
    expect(() =>
      compileTransaction({
        payer: payer.publicKey,
        recentBlockhash: nonceHash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: Keypair.generate().publicKey,
            toPubkey: recipient,
            lamports: 1,
          }),
        ],
      }),
    ).toThrow(/only the payer/);
    expect(() =>
      compileTransaction({
        payer: payer.publicKey,
        recentBlockhash: nonceHash,
        instructions: [
          new TransactionInstruction({
            programId: SystemProgram.programId,
            keys: [],
            data: Buffer.alloc(1300),
          }),
        ],
      }),
    ).toThrow(/too large/);
  });

  it("prepares independent unsigned nonce variants with only the configured appended tip", () => {
    const routes = makeRoutes();
    const base = makeBase();
    base.sign([payer]);
    const before = base.serialize();
    const variants = prepareTransactionVariants(base, [], routes);
    assertSenderVariants(variants, [], routes);
    expect(base.serialize()).toEqual(before);
    const messages = variants.map((variant) =>
      TransactionMessage.decompile(variant.transaction.message),
    );
    expect(messages[0]!.instructions).toHaveLength(4);
    expect(messages[1]!.instructions).toHaveLength(5);
    expect(
      SystemInstruction.decodeNonceAdvance(messages[0]!.instructions[0]!)
        .noncePubkey,
    ).toEqual(nonceAccount);
    expect(messages[1]!.recentBlockhash).toBe(nonceHash);
    expect(
      SystemInstruction.decodeTransfer(messages[1]!.instructions.at(-1)!),
    ).toMatchObject({
      fromPubkey: payer.publicKey,
      toPubkey: new PublicKey(routes[1]!.tipAccount!),
      lamports: 10_000n,
    });
    expect(
      variants.every((variant) =>
        variant.transaction.signatures[0]!.every((byte) => byte === 0),
      ),
    ).toBe(true);
    messages[1]!.instructions[3] = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient,
      lamports: 18,
    });
    variants[1]!.transaction = compileTransaction({
      payer: payer.publicKey,
      instructions: messages[1]!.instructions,
      recentBlockhash: nonceHash,
    });
    expect(() => assertSenderVariants(variants, [], routes)).toThrow(/differs/);
  });

  it("resolves lookup tables and rejects missing tables", () => {
    const table = new AddressLookupTableAccount({
      key: Keypair.generate().publicKey,
      state: {
        deactivationSlot: 0xffffffffffffffffn,
        lastExtendedSlot: 0,
        lastExtendedSlotStartIndex: 0,
        authority: payer.publicKey,
        addresses: [recipient, nonceAccount],
      },
    });
    const routes = makeRoutes();
    const base = makeBase(true, [table]);
    expect(base.message.addressTableLookups.length).toBe(1);
    const variants = prepareTransactionVariants(base, [table], routes);
    expect(() => assertSenderVariants(variants, [table], routes)).not.toThrow();
    expect(() => prepareTransactionVariants(base, [], routes)).toThrow();
  });

  it("rejects unsafe route sets and malformed or misplaced durable nonce instructions", () => {
    const routes = makeRoutes();
    expect(() =>
      prepareTransactionVariants(makeBase(false), [], routes),
    ).toThrow(/first nonce/);
    expect(() => prepareTransactionVariants(makeBase(), [], [])).toThrow(
      /1 to 5/,
    );
    expect(() =>
      prepareTransactionVariants(makeBase(), [], [routes[0]!, routes[0]!]),
    ).toThrow(/unique/);
    expect(() =>
      prepareTransactionVariants(
        makeBase(),
        [],
        Array.from({ length: 6 }, (_, i) => ({ ...routes[0]!, id: `${i}` })),
      ),
    ).toThrow(/1 to 5/);
    expect(() =>
      prepareTransactionVariants(
        makeBase(),
        [],
        [{ ...routes[0]!, tipLamports: 1, tipAccount: recipient.toBase58() }],
      ),
    ).toThrow(/untipped/);
    const instructions = TransactionMessage.decompile(
      makeBase().message,
    ).instructions;
    instructions[0]!.keys[1]!.pubkey = Keypair.generate().publicKey;
    expect(() =>
      prepareTransactionVariants(
        compileTransaction({
          payer: payer.publicKey,
          instructions,
          recentBlockhash: nonceHash,
        }),
        [],
        routes,
      ),
    ).toThrow(/first nonce/);
    expect(() =>
      prepareTransactionVariants(makeBase(false), [], [routes[0]!]),
    ).not.toThrow();
  });

  it("submits exact wallet-signed bytes through existing RPC and Jito HTTP clients", async () => {
    const endpoint = await localEndpoint();
    const routes = makeRoutes(endpoint.url);
    const prepared = prepareTransactionVariants(makeBase(), [], routes);
    assertSenderVariants(prepared, [], routes);
    const variants = signed(prepared);
    const result = await sendPreparedTransactions(routes, variants, {
      minContextSlot: 456,
      timeoutMs: 2_000,
    });
    expect(result).toEqual([
      { routeId: "rpc", accepted: true },
      { routeId: "relay", accepted: true },
    ]);
    expect(endpoint.received).toHaveLength(2);
    for (const request of endpoint.received) {
      const index = request.path === "/rpc" ? 0 : 1;
      expect(request.bytes.toString("base64")).toBe(
        variants[index]!.signedBase64,
      );
      expect(request.body.method).toBe("sendTransaction");
      expect(request.body.params[1]).toMatchObject({
        encoding: "base64",
        minContextSlot: 456,
        maxRetries: 0,
      });
      expect(request.transaction.message.recentBlockhash).toBe(nonceHash);
      if (index === 1) {
        expect(request.path).toBe("/api/v1/transactions");
        expect(request.headers["x-test-auth"]).toBe("test-only");
      }
    }
  });

  it("reports each route dispatch after serialization and response before body parsing", async () => {
    const routes = makeRoutes();
    const variants = signed(prepareTransactionVariants(makeBase(), [], routes));
    const order: string[] = [];
    const events: { routeId: string; phase: string; at: number }[] = [];
    const stringify = JSON.stringify;
    vi.spyOn(JSON, "stringify").mockImplementation((value, ...args) => {
      if (value?.method === "sendTransaction") {
        const index = variants.findIndex(
          (variant) => variant.signedBase64 === value.params[0],
        );
        order.push(`${routes[index]!.id}:serialize`);
      }
      return stringify(value, ...args);
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, request) => {
      const routeId = String(url).endsWith("/rpc") ? "rpc" : "relay";
      order.push(`${routeId}:fetch`);
      const variant = variants.find((entry) => entry.routeId === routeId)!;
      expect(JSON.parse(request!.body as string).params[0]).toBe(
        variant.signedBase64,
      );
      const response = new Response(
        stringify({ jsonrpc: "2.0", id: 1, result: variant.expectedSignature }),
      );
      const readText = response.text.bind(response);
      vi.spyOn(response, "text").mockImplementation(() => {
        order.push(`${routeId}:body`);
        return readText();
      });
      return response;
    });
    const before = performance.timeOrigin + performance.now();
    const result = await sendPreparedTransactions(routes, variants, {
      minContextSlot: 1,
      onTiming: (event) => {
        events.push(event);
        order.push(`${event.routeId}:${event.phase}`);
      },
    });
    const after = performance.timeOrigin + performance.now();
    expect(result).toEqual([
      { routeId: "rpc", accepted: true },
      { routeId: "relay", accepted: true },
    ]);
    for (const route of routes) {
      expect(order.filter((entry) => entry.startsWith(`${route.id}:`))).toEqual(
        [
          `${route.id}:serialize`,
          `${route.id}:dispatch`,
          `${route.id}:fetch`,
          `${route.id}:response`,
          `${route.id}:body`,
          `${route.id}:accepted`,
        ],
      );
    }
    expect(events).toHaveLength(6);
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(["at", "phase", "routeId"]);
      expect(event.at).toBeGreaterThanOrEqual(before);
      expect(event.at).toBeLessThanOrEqual(after);
    }
  });

  it.each([
    "accept",
    "mismatch",
    "http-error",
    "parse-error",
    "transport-error",
  ] as const)(
    "isolates throwing timing observers from %s without retries",
    async (mode) => {
      const routes = [makeRoutes()[0]!];
      const variants = signed(
        prepareTransactionVariants(makeBase(false), [], routes),
      );
      const phases: string[] = [];
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async () => {
          if (mode === "transport-error")
            throw new Error("private transport error");
          const response = new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result:
                mode === "mismatch"
                  ? "wrong-signature"
                  : variants[0]!.expectedSignature,
            }),
            {
              status: mode === "http-error" ? 503 : 200,
            },
          );
          if (mode === "parse-error")
            vi.spyOn(response, "text").mockRejectedValue(
              new Error("private body error"),
            );
          return response;
        });
      const result = await sendPreparedTransactions(routes, variants, {
        minContextSlot: 1,
        onTiming: (event) => {
          phases.push(event.phase);
          throw new Error("observer failure");
        },
      });
      expect(result).toEqual([{ routeId: "rpc", accepted: mode === "accept" }]);
      expect(phases).toEqual([
        "dispatch",
        mode === "transport-error" ? "error" : "response",
        mode === "accept" ? "accepted" : "rejected",
      ]);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("reports a fast route acceptance before a slower route finishes with its own timestamp", async () => {
    const routes = makeRoutes();
    const variants = signed(prepareTransactionVariants(makeBase(), [], routes));
    const events: { routeId: string; phase: string; at: number }[] = [];
    let clock = 100;
    vi.spyOn(performance, "now").mockImplementation(() => clock++);
    let releaseSlow!: () => void;
    const slow = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const index = String(url).endsWith("/rpc") ? 0 : 1;
      if (index === 1) await slow;
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: variants[index]!.expectedSignature,
        }),
      );
    });
    let finished = false;
    const pending = sendPreparedTransactions(routes, variants, {
      minContextSlot: 1,
      onTiming: (event) => {
        events.push(event);
      },
    }).then((result) => {
      finished = true;
      return result;
    });
    try {
      await vi.waitFor(
        () => {
          expect(
            events.some(
              (event) => event.routeId === "rpc" && event.phase === "accepted",
            ),
          ).toBe(true);
        },
        { timeout: 100 },
      );
      expect(finished).toBe(false);
      expect(
        events
          .filter((event) => event.routeId === "relay")
          .map((event) => event.phase),
      ).toEqual(["dispatch"]);
      const response = events.find(
        (event) => event.routeId === "rpc" && event.phase === "response",
      )!;
      const accepted = events.find(
        (event) => event.routeId === "rpc" && event.phase === "accepted",
      )!;
      expect(accepted.at).toBeGreaterThan(response.at);
      expect(accepted.at).toBeGreaterThanOrEqual(performance.timeOrigin + 100);
    } finally {
      releaseSlow();
      await pending;
    }
    expect(
      events
        .filter((event) => event.phase === "accepted")
        .map((event) => event.routeId),
    ).toEqual(["rpc", "relay"]);
  });

  it("validates every signature, byte sequence and header before any request", async () => {
    const endpoint = await localEndpoint();
    const routes = makeRoutes(endpoint.url);
    const variants = signed(prepareTransactionVariants(makeBase(), [], routes));
    await expect(
      sendPreparedTransactions(
        routes,
        [
          variants[0]!,
          {
            ...variants[1]!,
            expectedSignature: variants[0]!.expectedSignature,
          },
        ],
        { minContextSlot: 1 },
      ),
    ).rejects.toThrow(/signature/);
    await expect(
      sendPreparedTransactions(
        routes,
        [
          variants[0]!,
          { ...variants[1]!, signedBase64: `${variants[1]!.signedBase64}\n` },
        ],
        { minContextSlot: 1 },
      ),
    ).rejects.toThrow(/canonical/);
    const damaged = VersionedTransaction.deserialize(
      Buffer.from(variants[1]!.signedBase64, "base64"),
    );
    damaged.signatures[0]![0] ^= 1;
    await expect(
      sendPreparedTransactions(
        routes,
        [
          variants[0]!,
          {
            ...variants[1]!,
            signedBase64: Buffer.from(damaged.serialize()).toString("base64"),
            expectedSignature: bs58.encode(damaged.signatures[0]!),
          },
        ],
        { minContextSlot: 1 },
      ),
    ).rejects.toThrow(/signature/);
    await expect(
      sendPreparedTransactions(
        [routes[0]!, { ...routes[1]!, headers: { "bad\nheader": "value" } }],
        variants,
        { minContextSlot: 1 },
      ),
    ).rejects.toThrow();
    expect(endpoint.received).toHaveLength(0);
  });

  it("rejects direct-send attempts that bypass nonce or swap equivalence checks before HTTP", async () => {
    const endpoint = await localEndpoint();
    const routes = makeRoutes(endpoint.url);
    const noNonce = signed(
      routes.map((route) => ({
        routeId: route.id,
        transaction: makeBase(false),
      })),
    );
    await expect(
      sendPreparedTransactions(routes, noNonce, { minContextSlot: 1 }),
    ).rejects.toThrow(/first nonce/);
    const prepared = prepareTransactionVariants(makeBase(), [], routes);
    const changed = TransactionMessage.decompile(
      prepared[1]!.transaction.message,
    );
    changed.instructions[3] = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient,
      lamports: 18,
    });
    prepared[1]!.transaction = compileTransaction({
      payer: payer.publicKey,
      instructions: changed.instructions,
      recentBlockhash: nonceHash,
    });
    await expect(
      sendPreparedTransactions(routes, signed(prepared), { minContextSlot: 1 }),
    ).rejects.toThrow(/differs/);
    expect(endpoint.received).toHaveLength(0);
  });

  it("requires lookup table snapshots for direct submission and preserves the signed bytes", async () => {
    const endpoint = await localEndpoint();
    const routes = makeRoutes(endpoint.url);
    const table = new AddressLookupTableAccount({
      key: Keypair.generate().publicKey,
      state: {
        deactivationSlot: 0xffffffffffffffffn,
        lastExtendedSlot: 0,
        lastExtendedSlotStartIndex: 0,
        authority: payer.publicKey,
        addresses: [recipient, nonceAccount],
      },
    });
    const variants = signed(
      prepareTransactionVariants(makeBase(true, [table]), [table], routes),
    );
    await expect(
      sendPreparedTransactions(routes, variants, { minContextSlot: 1 }),
    ).rejects.toThrow();
    expect(endpoint.received).toHaveLength(0);
    expect(
      await sendPreparedTransactions(routes, variants, {
        minContextSlot: 1,
        lookupTables: [table],
      }),
    ).toEqual([
      { routeId: "rpc", accepted: true },
      { routeId: "relay", accepted: true },
    ]);
    expect(
      endpoint.received
        .map((request) => request.bytes.toString("base64"))
        .sort(),
    ).toEqual(variants.map((variant) => variant.signedBase64).sort());
  });

  it.each([SwqosType.BlockRazor, SwqosType.Astralane])(
    "requires positive acknowledgement from %s",
    async (type) => {
      for (const mode of ["empty", "negative", "positive"] as const) {
        const endpoint = await localEndpoint(mode);
        const routes = makeRoutes(endpoint.url);
        routes[1]!.type = type;
        const variants = signed(
          prepareTransactionVariants(makeBase(), [], routes),
        );
        const results = await sendPreparedTransactions(routes, variants, {
          minContextSlot: 1,
          timeoutMs: 1_000,
        });
        expect(results[1]).toEqual({
          routeId: "relay",
          accepted: mode === "positive",
        });
        expect(endpoint.received).toHaveLength(2);
      }
    },
  );

  it.each(["wrong", "reject", "timeout"] as const)(
    "returns unaccepted for %s without retries or provider text",
    async (mode) => {
      const endpoint = await localEndpoint(mode);
      const routes = [makeRoutes(endpoint.url)[0]!];
      const variants = signed(
        prepareTransactionVariants(makeBase(false), [], routes),
      );
      expect(
        await sendPreparedTransactions(routes, variants, {
          minContextSlot: 1,
          timeoutMs: 100,
        }),
      ).toEqual([{ routeId: "rpc", accepted: false }]);
      expect(endpoint.received).toHaveLength(1);
    },
  );
});

describe("v1 browser submission workflow", () => {
  it("rejects ambiguous legacy priority fees without an explicit compute limit", () => {
    expect(() =>
      compileV1Transaction({
        payer: payer.publicKey,
        recentBlockhash: nonceHash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000000 }),
          ...core,
        ],
      }),
    ).toThrow(/explicit compute unit limit/);
  });
  it("signs and submits canonical v1 variants with nonce first and exact resource fees", async () => {
    const endpoint = await localEndpoint();
    const routes = makeRoutes(endpoint.url);
    const base = buildSwapTransaction({
      version: 1,
      payer: payer.publicKey,
      instructions: core,
      recentBlockhash: nonceHash,
      computeUnitLimit: 350_000,
      computeUnitPriceMicroLamports: 2_857_143n,
      durableNonce: { nonceAccount, authority: payer.publicKey, nonceHash },
    });
    expect(base.message.config.priorityFeeLamports).toBe(1_000_001n);
    expect(base.message.config.computeUnitLimit).toBe(350_000);
    expect(base.message.config.loadedAccountsDataSizeLimit).toBe(
      64 * 1024 * 1024,
    );
    expect(base.message.addressTableLookups).toEqual([]);
    const variants = prepareTransactionVariants(base, [], routes);
    for (const variant of variants) {
      expect(variant.transaction.version).toBe(1);
      expect(variant.transaction.message.config).toEqual(base.message.config);
      expect(
        Buffer.from(variant.transaction.message.compiledInstructions[0]!.data),
      ).toEqual(
        SystemProgram.nonceAdvance({
          noncePubkey: nonceAccount,
          authorizedPubkey: payer.publicKey,
        }).data,
      );
    }
    const result = await sendPreparedTransactions(routes, signed(variants), {
      minContextSlot: 10,
    });
    expect(result.every((entry) => entry.accepted)).toBe(true);
    expect(endpoint.received.every((entry) => entry.bytes[0] === 0x81)).toBe(
      true,
    );
    const altered = compileV1Transaction({
      payer: payer.publicKey,
      recentBlockhash: nonceHash,
      instructions: decompileV1Transaction(variants[1]!.transaction)
        .instructions,
      config: { ...base.message.config, priorityFeeLamports: 2_000_000n },
    });
    expect(() =>
      assertSenderVariants(
        [variants[0]!, { routeId: "relay", transaction: altered }],
        [],
        routes,
      ),
    ).toThrow(/differs/);
  });

  it("submits a v1 packet larger than 1232 bytes and rejects packets beyond 4096", async () => {
    const endpoint = await localEndpoint();
    const instruction = new TransactionInstruction({
      programId: SystemProgram.programId,
      keys: [],
      data: Buffer.alloc(1500),
    });
    const tx = compileV1Transaction({
      payer: payer.publicKey,
      recentBlockhash: nonceHash,
      instructions: [instruction],
    });
    expect(tx.serialize().length).toBeGreaterThan(1232);
    const routes = [makeRoutes(endpoint.url)[0]!];
    expect(
      (
        await sendPreparedTransactions(
          routes,
          signed(prepareTransactionVariants(tx, [], routes)),
          { minContextSlot: 0 },
        )
      )[0]!.accepted,
    ).toBe(true);
    expect(() =>
      compileV1Transaction({
        payer: payer.publicKey,
        recentBlockhash: nonceHash,
        instructions: [
          new TransactionInstruction({
            ...instruction,
            data: Buffer.alloc(4096),
          }),
        ],
      }),
    ).toThrow(/4096/);
    expect(() =>
      TransactionV1.deserialize(new Uint8Array([...tx.serialize(), 0])),
    ).toThrow();
  });
});
