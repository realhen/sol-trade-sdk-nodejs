import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { NATIVE_MINT, unpackMint } from "@solana/spl-token";
import {
  prepareDirectMarket,
  quoteDirectSwap,
  buildDirectSwap,
  sizeDirectSellForQuoteValue,
} from "../index";
beforeAll(() =>
  vi.stubGlobal("fetch", () => {
    throw new Error(
      "External HTTP is forbidden for recorded direct preparation",
    );
  }),
);
afterAll(() => vi.unstubAllGlobals());
function cache(f: any) {
  let warmed = false;
  const calls: string[] = [];
  const read = (key: PublicKey) => {
    if (warmed) throw Error("Unexpected warmed RPC");
    calls.push(key.toBase58());
    const a = f.accounts[key.toBase58()];
    if (a === undefined) throw Error("Missing recorded account " + key);
    return (
      a && {
        ...a,
        owner: new PublicKey(a.owner),
        data: Buffer.from(a.data, "base64"),
      }
    );
  };
  const connection = Object.assign(new Connection("http://localhost:8899"), {
    getAccountInfo: async (k: PublicKey) => read(k),
    getMultipleAccountsInfo: async (ks: PublicKey[]) => ks.map(read),
    getAccountInfoAndContext: async (k: PublicKey) => ({
      context: { slot: 0 },
      value: read(k),
    }),
    getMultipleAccountsInfoAndContext: async (ks: PublicKey[]) => ({
      context: { slot: 0 },
      value: ks.map(read),
    }),
    getTokenSupply: async (k: PublicKey) => {
      const a = read(k),
        m = unpackMint(k, a!, a!.owner);
      return {
        context: { slot: 0 },
        value: {
          amount: String(m.supply),
          decimals: m.decimals,
          uiAmount: null,
          uiAmountString: "0",
        },
      };
    },
    getEpochInfo: async () => f.meta.getEpochInfo,
    getSlot: async () => f.meta.getSlot,
    getBlockTime: async () => f.meta.getBlockTime,
    _rpcRequest: async (method: string) => {
      throw Error("Unexpected RPC " + method);
    },
  });
  return {
    connection,
    warm() {
      warmed = true;
    },
    calls,
  };
}
const fixtures = readdirSync(new URL("./fixtures/", import.meta.url))
  .filter((n) => n.endsWith(".json"))
  .map((n) =>
    JSON.parse(
      readFileSync(new URL("./fixtures/" + n, import.meta.url), "utf8"),
    ),
  )
  .filter((f) => f.accounts && f.quotes);
describe("direct facade public account workflows", () => {
  for (const fixture of fixtures)
    it(`${fixture.venue}: prepares and builds both directions without warmed RPC`, async () => {
      const c = cache(fixture),
        owner = Keypair.generate().publicKey;
      const m = await prepareDirectMarket(
        c.connection,
        new PublicKey(fixture.pool),
        new PublicKey(fixture.mint),
      );
      c.warm();
      expect(m.venue).toBe(fixture.venue);
      for (const saved of fixture.quotes) {
        const q = quoteDirectSwap(
          m,
          new PublicKey(saved.input),
          BigInt(saved.amount),
          100,
        );
        expect(q.expectedOutput).toBe(BigInt(saved.output));
        const b = await buildDirectSwap(m, q, owner);
        expect(b.computeUnitLimit).toBeGreaterThan(0);
        expect(b.computeUnitLimit).toBeLessThan(1_400_000);
        expect(b.computeUnitLimit % 5_000).toBe(0);
        expect(b.expectation.swapInstructions).toHaveLength(1);
        expect(b.expectation.pool).toBe(fixture.pool);
        expect(b.expectation.inputAmount).toBe(saved.amount);
        if (
          !q.inputMint.equals(NATIVE_MINT) &&
          !q.outputMint.equals(NATIVE_MINT)
        )
          expect(
            b.instructions.some((i) =>
              i.programId.equals(SystemProgram.programId),
            ),
          ).toBe(false);
        await expect(buildDirectSwap(m, { ...q }, owner)).rejects.toThrow(
          "bound",
        );
      }
    });
  it("rejects quotes transplanted between prepared snapshots and sizes below whale liquidity bound", async () => {
    const f = fixtures.find((f) => f.venue === "Raydium CPMM")!,
      c = cache(f);
    const a = await prepareDirectMarket(
      c.connection,
      new PublicKey(f.pool),
      new PublicKey(f.mint),
    );
    const b = await prepareDirectMarket(
      c.connection,
      new PublicKey(f.pool),
      new PublicKey(f.mint),
    );
    c.warm();
    const q = quoteDirectSwap(a, a.mint, 1_000_000n, 100);
    await expect(
      buildDirectSwap(b, q, Keypair.generate().publicKey),
    ).rejects.toThrow("bound");
    const sized = sizeDirectSellForQuoteValue(
      a,
      q.minimumOutput,
      1n << 63n,
      100,
    );
    expect(sized.inputAmount).toBeLessThanOrEqual(q.inputAmount);
    expect(sized.minimumOutput).toBeGreaterThanOrEqual(q.minimumOutput);
  });
});

it("sizes a concentrated-liquidity sell without requiring the entire holding to fit", async () => {
  const f = fixtures.find((f) => f.venue === "Raydium CLMM")!,
    c = cache(f);
  const m = await prepareDirectMarket(
    c.connection,
    new PublicKey(f.pool),
    new PublicKey(f.mint),
  );
  c.warm();
  const target = quoteDirectSwap(m, m.mint, 100_000n, 100).minimumOutput;
  const q = sizeDirectSellForQuoteValue(m, target, (1n << 64n) - 1n, 100);
  expect(q.minimumOutput).toBeGreaterThanOrEqual(target);
  expect(q.inputAmount).toBeLessThanOrEqual(100_000n);
});
for (const f of fixtures.filter((f) => f.venue !== "Pump.fun"))
  it(`${f.venue}: supports selecting either pool mint as the target`, async () => {
    const c = cache(f),
      first = await prepareDirectMarket(
        c.connection,
        new PublicKey(f.pool),
        new PublicKey(f.mint),
      );
    const flipped = await prepareDirectMarket(
      c.connection,
      new PublicKey(f.pool),
      first.quoteMint,
    );
    c.warm();
    expect(flipped.quoteMint.equals(first.mint)).toBe(true);
    for (const saved of f.quotes) {
      const q = quoteDirectSwap(
        flipped,
        new PublicKey(saved.input),
        BigInt(saved.amount),
        100,
      );
      expect(q.expectedOutput).toBe(BigInt(saved.output));
      await buildDirectSwap(flipped, q, Keypair.generate().publicKey);
    }
  });

it("rejects a Pump buy capped at the migration boundary", async () => {
  const f = fixtures.find((f) => f.venue === "Pump.fun")!,
    c = cache(f);
  const m = await prepareDirectMarket(
    c.connection,
    new PublicKey(f.pool),
    new PublicKey(f.mint),
  );
  c.warm();
  expect(() => quoteDirectSwap(m, m.quoteMint, (1n << 64n) - 1n, 100)).toThrow(
    "remaining curve capacity",
  );
});
it("binds the current Pump buyback recipient and rejects a changed quote mint snapshot", async () => {
  const { PUMP_SDK, GLOBAL_PDA } = await import("@pump-fun/pump-sdk");
  const f = fixtures.find((f) => f.venue === "Pump.fun")!,
    c = cache(f);
  const m = await prepareDirectMarket(
    c.connection,
    new PublicKey(f.pool),
    new PublicKey(f.mint),
  );
  c.warm();
  const raw = f.accounts[GLOBAL_PDA.toBase58()];
  const global = PUMP_SDK.decodeGlobal({
    ...raw,
    data: Buffer.from(raw.data, "base64"),
    owner: new PublicKey(raw.owner),
  });
  const expected = global.buybackFeeRecipients.find(
    (k) => !k.equals(PublicKey.default),
  )!;
  const q = quoteDirectSwap(m, m.quoteMint, 1_000_000n, 100),
    b = await buildDirectSwap(m, q, Keypair.generate().publicKey);
  expect(
    b.expectation.swapInstructions[0]!.keys.some(
      (k) => k.pubkey === expected.toBase58(),
    ),
  ).toBe(true);
  const changed = cache(f),
    original = changed.connection.getAccountInfo.bind(changed.connection);
  let poolReads = 0;
  changed.connection.getAccountInfo = async (key) => {
    const a = await original(key);
    if (key.toBase58() === f.pool && ++poolReads === 2) {
      Keypair.generate().publicKey.toBuffer().copy(a!.data, 83);
    }
    return a;
  };
  const wrong = await prepareDirectMarket(
    changed.connection,
    new PublicKey(f.pool),
    new PublicKey(f.mint),
  );
  expect(() =>
    quoteDirectSwap(wrong, wrong.quoteMint, 1_000_000n, 100),
  ).toThrow("changed during preparation");
});

for (const f of fixtures)
  it(`${f.venue}: sizes quote value through atomic dust probes`, async () => {
    const c = cache(f),
      m = await prepareDirectMarket(
        c.connection,
        new PublicKey(f.pool),
        new PublicKey(f.mint),
      );
    c.warm();
    const saved = f.quotes.find((q: any) => q.input === f.mint)!;
    const full = quoteDirectSwap(m, m.mint, BigInt(saved.amount), 100);
    const target = full.minimumOutput / 2n || 1n;
    const sized = sizeDirectSellForQuoteValue(
      m,
      target,
      BigInt(saved.amount),
      100,
    );
    expect(sized.minimumOutput).toBeGreaterThanOrEqual(target);
    expect(sized.inputAmount).toBeLessThanOrEqual(BigInt(saved.amount));
    await buildDirectSwap(m, sized, Keypair.generate().publicKey);
  });

it("accepts the official PumpSwap coder 270-byte account prefix", async () => {
  const { PUMP_AMM_SDK, POOL_SIZE } = await import("@pump-fun/pump-swap-sdk");
  const f = structuredClone(fixtures.find((f) => f.venue === "PumpSwap")!);
  const full = f.accounts[f.pool],
    data = Buffer.from(full.data, "base64");
  expect(POOL_SIZE).toBe(270);
  const decoded = PUMP_AMM_SDK.decodePool({
    ...full,
    data,
    owner: new PublicKey(full.owner),
  });
  const encoded = await PUMP_AMM_SDK.offlineProgram.coder.accounts.encode(
    "pool",
    decoded,
  );
  expect(encoded.length).toBe(POOL_SIZE);
  full.data = encoded.toString("base64");
  const c = cache(f),
    m = await prepareDirectMarket(
      c.connection,
      new PublicKey(f.pool),
      new PublicKey(f.mint),
    );
  c.warm();
  const q = quoteDirectSwap(m, m.quoteMint, 1_000_000n, 100);
  const result = await buildDirectSwap(m, q, Keypair.generate().publicKey);
  expect(result.expectation.swapInstructions).toHaveLength(2);
});

describe("single-swap sell sizing with captured pools", () => {
  for (const fixture of fixtures) {
    it(`${fixture.venue}: sizes expected proceeds and builds explicit token amounts without RPC`, async () => {
      const { sizeDirectSellForExpectedOutput, tryQuoteDirectSell } =
        await import("../index");
      const c = cache(fixture);
      const market = await prepareDirectMarket(
        c.connection,
        new PublicKey(fixture.pool),
        new PublicKey(fixture.mint),
      );
      c.warm();
      const sell = fixture.quotes.find((q: any) => q.input === fixture.mint);
      const amount = BigInt(sell.amount) * 10n;
      const target = quoteDirectSwap(
        market,
        market.mint,
        amount,
        0,
      ).expectedOutput;
      const sized = sizeDirectSellForExpectedOutput(
        market,
        target,
        amount * 2n,
      );
      expect(sized.inputAmount).toBeLessThanOrEqual(amount);
      expect(sized.expectedOutput).toBeGreaterThanOrEqual(target);
      for (const slippage of [500, 2000]) {
        const quote = tryQuoteDirectSell(market, sized.inputAmount, slippage)!;
        expect(quote.inputAmount).toBe(sized.inputAmount);
        expect(
          (await buildDirectSwap(market, quote, Keypair.generate().publicKey))
            .instructions.length,
        ).toBeGreaterThan(0);
      }
      const capped = sizeDirectSellForExpectedOutput(
        market,
        target * 100n,
        amount,
      );
      expect(capped.inputAmount).toBe(amount);
      expect(capped.expectedOutput).toBeLessThan(target * 100n);
      expect(
        sizeDirectSellForExpectedOutput(market, target, 0n).inputAmount,
      ).toBe(0n);
      const tiny = sizeDirectSellForExpectedOutput(market, 1n, amount);
      expect(tiny.expectedOutput).toBeGreaterThanOrEqual(1n);
      expect(tryQuoteDirectSell(market, tiny.inputAmount, 0)).not.toBeNull();
      if (tiny.inputAmount > 1n)
        expect(tryQuoteDirectSell(market, tiny.inputAmount - 1n, 0)).toBeNull();
      expect(() => tryQuoteDirectSell(market, sized.inputAmount, -1)).toThrow(
        /slippage/,
      );
      expect(() =>
        sizeDirectSellForExpectedOutput(market, target, -1n),
      ).toThrow(/limit/);
    });
  }
});
