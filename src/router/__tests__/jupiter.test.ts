import { describe, it, expect } from "vitest";
import {
  AddressLookupTableAccount,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  MintLayout,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import direct from "./fixtures/sol-usdc-build.json";
import fundedPump from "./fixtures/funded-met-pump-build.json";
import live from "./fixtures/pump-met-build.json";
import mask from "./fixtures/mask-build.json";
import maskReverse from "./fixtures/mask-reverse-build.json";
import three from "./fixtures/three-hop-build.json";
import * as router from "../index";
const owner = SystemProgram.programId;
const output = new PublicKey(live.outputMint);
function fixture(source: any = live) {
  const b = structuredClone(source);
  b.setupInstructions = b.setupInstructions.filter((i: any) =>
    i.programId.startsWith("AToken"),
  );
  b.cleanupInstruction = null;
  return b;
}
function harness(body = fixture(), overrides: any = {}) {
  const programs = new Map<string, PublicKey>();
  programs.set(NATIVE_MINT.toBase58(), TOKEN_PROGRAM_ID);
  // Owners observed for the Token2022 assets in these live fixtures; input ATAs may already exist.
  programs.set(
    "BwgWHpEAyPnHxmRfYN1tNPS5ADLSiZG3io7uHLJQiT4A",
    TOKEN_2022_PROGRAM_ID,
  );
  programs.set(
    "HuAXPyDWDaMYFKuwQHpqL1oPnj93zdzWmtvFGzCeCUa7",
    TOKEN_2022_PROGRAM_ID,
  );

  for (const ix of body.setupInstructions)
    programs.set(ix.accounts[3].pubkey, new PublicKey(ix.accounts[5].pubkey));
  const connection: any = {
    getAccountInfo: async (mint: PublicKey) => {
      const data = Buffer.alloc(82);
      MintLayout.encode(
        {
          mintAuthorityOption: 0,
          mintAuthority: owner,
          supply: 1000000000n,
          decimals: 6,
          isInitialized: true,
          freezeAuthorityOption: 0,
          freezeAuthority: owner,
        },
        data,
      );
      return {
        owner: programs.get(mint.toBase58()) ?? TOKEN_PROGRAM_ID,
        data,
        executable: false,
        lamports: 1,
        rentEpoch: 0,
      };
    },
    getAddressLookupTable: async (key: PublicKey) => ({
      value: new AddressLookupTableAccount({
        key,
        state: {
          deactivationSlot: 18446744073709551615n,
          lastExtendedSlot: 0,
          lastExtendedSlotStartIndex: 0,
          addresses: body.addressesByLookupTableAddress[key.toBase58()].map(
            (x: string) => new PublicKey(x),
          ),
        },
      }),
    }),
  };
  const transport: any = async (_url: string, init: RequestInit) => {
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("error");
    return new Response(JSON.stringify(body));
  };
  return {
    connection,
    owner,
    inputMint: new PublicKey(body.inputMint),
    outputMint: new PublicKey(body.outputMint),
    amountIn: 100000000n,
    slippageBps: 100,
    transport,
    now: () => 1000,
    ...overrides,
  };
}
describe("Jupiter prepared route trust boundary", () => {
  it("prepares the funded MET-to-Pump fixture with only its existing quote-token balance", async () => {
    const trade = await router.prepareJupiterRoute(
      harness(fixture(fundedPump), {
        directPairOnly: true,
        amountIn: BigInt(fundedPump.inAmount),
      }),
    );
    expect(trade.inputMint.toBase58()).toBe(
      "METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL",
    );
    expect(trade.routeLegs).toEqual([
      expect.objectContaining({
        inputMint: fundedPump.inputMint,
        outputMint: fundedPump.outputMint,
        bps: 10000,
      }),
    ]);
    expect(
      trade.instructions.every(
        (ix) => !ix.programId.equals(SystemProgram.programId),
      ),
    ).toBe(true);
  });
  it.each([false, true])(
    "uses funded SPL endpoints without a SOL conversion (reverse=%s)",
    async (reverse) => {
      // Deterministic transport workflow, not a claim of on-chain execution.
      const left = new PublicKey(
        "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      );
      const right = new PublicKey(direct.outputMint);
      const input = reverse ? right : left,
        output = reverse ? left : right;
      const replacements = new Map([
        [direct.inputMint, input.toBase58()],
        [direct.outputMint, output.toBase58()],
        [
          direct.swapInstruction.accounts[1]!.pubkey,
          getAssociatedTokenAddressSync(input, owner, true).toBase58(),
        ],
        [
          direct.swapInstruction.accounts[2]!.pubkey,
          getAssociatedTokenAddressSync(output, owner, true).toBase58(),
        ],
      ]);
      const body = JSON.parse(JSON.stringify(fixture(direct)), (_, value) =>
        typeof value === "string" ? (replacements.get(value) ?? value) : value,
      );
      const args = harness(body, { directPairOnly: true });
      args.transport = async (url: string) => {
        const query = new URL(url).searchParams;
        expect(query.get("inputMint")).toBe(input.toBase58());
        expect(query.get("outputMint")).toBe(output.toBase58());
        expect(query.get("wrapAndUnwrapSol")).toBe("false");
        return new Response(JSON.stringify(body));
      };
      const trade = await router.prepareJupiterRoute(args);
      expect(trade.directPairOnly).toBe(true);
      expect(trade.routeLegs).toHaveLength(1);
      expect(
        trade.instructions.every(
          (ix) =>
            ix.programId.toBase58() ===
              "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4" ||
            ix.programId.toBase58().startsWith("AToken"),
        ),
      ).toBe(true);
      expect(trade.wrapNativeInput || trade.unwrapNativeOutput).toBe(false);
      router.assertRouterTradeFresh(trade, 1001);
      trade.directPairOnly = false;
      expect(() => router.assertRouterTradeFresh(trade, 1001)).toThrow(
        /modified/,
      );
    },
  );
  it.each([live, mask, three])(
    "rejects conversion/split routes from their instruction bytes",
    async (source) => {
      const body = fixture(source);
      // Dishonest JSON cannot hide the binary graph.
      body.routePlan = [body.routePlan[0]];
      await expect(
        router.prepareJupiterRoute(harness(body, { directPairOnly: true })),
      ).rejects.toThrow(/direct pair/);
    },
  );
  it("prepares a real non-SOL Pump multi-hop instruction with the on-chain floor", async () => {
    const t = await router.prepareJupiterRoute(harness());
    expect(t.amountIn).toBe(100000000n);
    expect(t.inputTokenProgram.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(t.outputTokenProgram.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(t.quotedAmountOut).toBe(2839894159191n);
    expect(t.minimumAmountOut).toBe(2811495217600n);
    expect(t.routeLegs).toHaveLength(2);
    expect(t.instructions.at(-1)?.programId.toBase58()).toBe(
      "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
    );
    expect(t.wrapNativeInput).toBe(false);
    expect(t.unwrapNativeOutput).toBe(false);
    expect(t.expiresAtMs).toBe(11000);
  });
  it.each([
    ["transfer-fee split", mask],
    ["three-hop", three],
  ])("accepts the full binary graph for %s", async (_, b) => {
    const t = await router.prepareJupiterRoute(harness(fixture(b)));
    expect(t.routeLegs).toHaveLength(3);
  });
  it.each([
    [
      "wrong JSON endpoint",
      (b: any) => (b.outputMint = NATIVE_MINT.toBase58()),
    ],
    ["wrong amount", (b: any) => (b.inAmount = "1")],
    ["wrong slippage", (b: any) => (b.slippageBps = 10000)],
    ["wrong floor", (b: any) => (b.otherAmountThreshold = "1")],
    [
      "redirected destination",
      (b: any) => (b.swapInstruction.accounts[2].pubkey = owner.toBase58()),
    ],
    [
      "wrong program",
      (b: any) => (b.swapInstruction.programId = owner.toBase58()),
    ],
    [
      "extra transfer",
      (b: any) =>
        (b.otherInstructions = [
          { programId: owner.toBase58(), accounts: [], data: "AA==" },
        ]),
    ],
    [
      "cleanup",
      (b: any) =>
        (b.cleanupInstruction = {
          programId: owner.toBase58(),
          accounts: [],
          data: "AA==",
        }),
    ],
    [
      "unexpected signer",
      (b: any) => (b.swapInstruction.accounts[10].isSigner = true),
    ],
    [
      "wrong token program",
      (b: any) =>
        (b.swapInstruction.accounts[6].pubkey = TOKEN_PROGRAM_ID.toBase58()),
    ],
    ["malformed base64", (b: any) => (b.swapInstruction.data = "!!!!")],
    [
      "truncated data",
      (b: any) =>
        (b.swapInstruction.data = Buffer.from(b.swapInstruction.data, "base64")
          .subarray(0, 35)
          .toString("base64")),
    ],
    [
      "binary amount",
      (b: any) => {
        const d = Buffer.from(b.swapInstruction.data, "base64");
        d.writeBigUInt64LE(1n, 8);
        b.swapInstruction.data = d.toString("base64");
      },
    ],
    [
      "platform fee",
      (b: any) => {
        const d = Buffer.from(b.swapInstruction.data, "base64");
        d.writeUInt16LE(1, 26);
        b.swapInstruction.data = d.toString("base64");
      },
    ],
    [
      "unknown swap variant",
      (b: any) => {
        const d = Buffer.from(b.swapInstruction.data, "base64");
        d[34] = 255;
        b.swapInstruction.data = d.toString("base64");
      },
    ],
    [
      "trailing data",
      (b: any) =>
        (b.swapInstruction.data = Buffer.concat([
          Buffer.from(b.swapInstruction.data, "base64"),
          Buffer.of(0),
        ]).toString("base64")),
    ],
    [
      "setup owner",
      (b: any) =>
        (b.setupInstructions[0].accounts[2].pubkey = output.toBase58()),
    ],
    [
      "pool mismatch",
      (b: any) => (b.routePlan[0].swapInfo.ammKey = output.toBase58()),
    ],
    ["bps mismatch", (b: any) => (b.routePlan[0].bps = 1)],
  ])("rejects %s before returning executable data", async (_, mutate) => {
    const b = fixture();
    const opts = harness(b);
    mutate(b);
    await expect(router.prepareJupiterRoute(opts)).rejects.toThrow();
  });
  it("rejects unsupported mint owners", async () => {
    const o = harness();
    o.connection.getAccountInfo = async () => ({
      owner,
      data: Buffer.alloc(82),
    });
    await expect(router.prepareJupiterRoute(o)).rejects.toThrow();
  });
  it("rejects ALT contents that disagree with chain data", async () => {
    const o = harness();
    const prev = o.connection.getAddressLookupTable;
    o.connection.getAddressLookupTable = async (k: PublicKey) => {
      const x = await prev(k);
      x.value.state.addresses[0] = owner;
      return x;
    };
    await expect(router.prepareJupiterRoute(o)).rejects.toThrow();
  });
  it("expires from request start, including a slow provider", async () => {
    let n = 0;
    const o = harness(undefined, { now: () => (n++ === 0 ? 1000 : 12000) });
    await expect(router.prepareJupiterRoute(o)).rejects.toThrow(
      /stale|expired/i,
    );
  });
  it("freshness rejects modified prepared instructions", async () => {
    const t = await router.prepareJupiterRoute(harness());
    t.instructions.at(-1)!.data[8] ^= 1;
    expect(() => router.assertRouterTradeFresh(t, 1001)).toThrow();
  });
  it("wraps exact native input without closing a preexisting WSOL ATA", async () => {
    const t = await router.prepareJupiterRoute(
      harness(undefined, { wrapNativeInput: true }),
    );
    const sys = t.instructions.filter((i) => i.programId.equals(owner));
    expect(sys).toHaveLength(1);
    expect(sys[0]!.data.readBigUInt64LE(4)).toBe(100000000n);
    expect(
      t.instructions.some(
        (i) => i.programId.equals(TOKEN_PROGRAM_ID) && i.data[0] === 9,
      ),
    ).toBe(false);
  });
  it.each([0n, -1n, 1n << 64n])(
    "rejects invalid input %s",
    async (amountIn) => {
      await expect(
        router.prepareJupiterRoute(harness(undefined, { amountIn })),
      ).rejects.toThrow();
    },
  );
});

describe("additional router rejection and native policy", () => {
  it.each([0, 3, 4, 5, 6, 8, 10, 11])(
    "rejects redirected shared account %s",
    async (index) => {
      const b = fixture(mask);
      b.swapInstruction.accounts[index].pubkey = output.toBase58();
      await expect(router.prepareJupiterRoute(harness(b))).rejects.toThrow();
    },
  );
  it("rejects noncanonical setup token program even when address is retained", async () => {
    const b = fixture();
    b.setupInstructions[0].accounts[5].pubkey = owner.toBase58();
    await expect(router.prepareJupiterRoute(harness(b))).rejects.toThrow();
  });
  it("rejects caller native unwrap on token output", async () => {
    await expect(
      router.prepareJupiterRoute(
        harness(undefined, { unwrapNativeOutput: true }),
      ),
    ).rejects.toThrow();
  });
  it("rejects missing owner signature", async () => {
    const b = fixture();
    b.swapInstruction.accounts[0].isSigner = false;
    await expect(router.prepareJupiterRoute(harness(b))).rejects.toThrow();
  });
  it("rejects provider HTTP errors without leaking URL or credentials", async () => {
    const opts = harness(undefined, {
      apiKey: "test-secret",
      transport: async () => {
        throw new Error("https://bad.test/?token=test-secret");
      },
    });
    await expect(router.prepareJupiterRoute(opts)).rejects.toThrow(
      "provider request failed",
    );
    try {
      await router.prepareJupiterRoute(opts);
    } catch (e) {
      expect(String(e)).not.toContain("test-secret");
    }
  });
  it("rejects a response over the byte limit", async () => {
    await expect(
      router.prepareJupiterRoute(
        harness(undefined, {
          transport: async () => new Response(" ".repeat(1048577)),
        }),
      ),
    ).rejects.toThrow();
  });
  it("rejects quote lifetimes that bypass freshness", async () => {
    await expect(
      router.prepareJupiterRoute(harness(undefined, { maxAgeMs: Infinity })),
    ).rejects.toThrow();
  });
  it("checks freshness at the exact expiry boundary", async () => {
    const t = await router.prepareJupiterRoute(harness());
    expect(() => router.assertRouterTradeFresh(t, 10999)).not.toThrow();
    expect(() => router.assertRouterTradeFresh(t, 11000)).toThrow();
  });
});
it("sanitizes RPC errors that may include private endpoint credentials", async () => {
  const opts = harness();
  opts.connection.getAccountInfo = async () => {
    throw new Error("https://rpc.test/?api-key=private-credential");
  };
  try {
    await router.prepareJupiterRoute(opts);
    throw new Error("expected rejection");
  } catch (e) {
    expect(String(e)).not.toContain("private-credential");
    expect(String(e)).toContain("mint");
  }
});

it("accepts the live reverse Token2022 route that reuses the owner input ATA", async () => {
  const b = fixture(maskReverse);
  const options = harness(b, {
    owner: new PublicKey(b.swapInstruction.accounts[1].pubkey),
    amountIn: BigInt(b.inAmount),
    slippageBps: b.slippageBps,
  });
  const trade = await router.prepareJupiterRoute(options);
  const swap = trade.instructions.find(
    (ix) => ix.programId.toBase58() === b.swapInstruction.programId,
  )!;
  expect(swap.keys[3]!.pubkey.equals(swap.keys[2]!.pubkey)).toBe(true);
  expect(trade.inputTokenProgram.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
  expect(trade.amountIn).toBe(212063638114n);
});
it("rejects a redirected program source in the optimized reverse route", async () => {
  const b = fixture(maskReverse);
  b.swapInstruction.accounts[3].pubkey = b.swapInstruction.accounts[5].pubkey;
  const options = harness(b, {
    owner: new PublicKey(b.swapInstruction.accounts[1].pubkey),
    amountIn: BigInt(b.inAmount),
    slippageBps: b.slippageBps,
  });
  await expect(router.prepareJupiterRoute(options)).rejects.toThrow();
});
