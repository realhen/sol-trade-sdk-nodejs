import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { readFile, readdir } from "node:fs/promises";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { unpackMint } from "@solana/spl-token";
import { CpmmPoolInfoLayout } from "@raydium-io/raydium-sdk-v2";
import { build } from "esbuild";
const require = createRequire(import.meta.url);
const names = [
  "prepareDirectMarket",
  "directSharedAccounts",
  "directMarketAccountHints",
  "inspectDirectMigration",
  "resolveDirectMigration",
  "discoverPoolQuoteMint",
  "quoteDirectSwap",
  "createDirectBuySizer",
  "sizeDirectSellForQuoteValue",
  "buildDirectSwap",
  "normalizeDirectFill",
  "quoteDirectCurveCompletion",
  "planDirectCurveCompletion",
  "buildDirectCurveCompletionBuy",
  "buildDirectCurveCompletionMigration",
];
const nodeSdks = [
  await import("sol-trade-sdk/direct"),
  require("sol-trade-sdk/direct"),
];
for (const sdk of nodeSdks)
  for (const name of names) assert.equal(typeof sdk[name], "function");
const code = await readFile("dist/direct/browser.mjs", "utf8");
assert(!/\beval\s*\(/.test(code), "No eval in extension browser bundle");
const browser = await build({
  stdin: {
    contents: `export * from 'sol-trade-sdk/direct/browser'`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "Sdk",
  write: false,
});
const context = {
  console,
  structuredClone,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  setTimeout,
  clearTimeout,
};
context.self = context;
const sdk = runInNewContext(`${browser.outputFiles[0].text}\nSdk`, context, {
  contextCodeGeneration: { strings: false, wasm: false },
});
for (const name of names) assert.equal(typeof sdk[name], "function");
assert(!("Buffer" in context) && !("process" in context));
console.log("Direct Node ESM/CJS and browser CSP entrypoints passed");

/** Recorded public accounts exercise the distributed API without an RPC or wallet. */
function recordedConnection(fixture) {
  let warmed = false;
  const read = (key) => {
    assert(!warmed, "Quote/build must not read accounts after preparation");
    const value = fixture.accounts[key.toBase58()];
    assert(value !== undefined, `Missing recorded account ${key}`);
    return (
      value && {
        ...value,
        owner: new PublicKey(value.owner),
        data: Buffer.from(value.data, "base64"),
      }
    );
  };
  const connection = Object.assign(new Connection("http://127.0.0.1:1"), {
    getAccountInfo: async (key) => read(key),
    getMultipleAccountsInfo: async (keys) => keys.map(read),
    getAccountInfoAndContext: async (key) => ({
      context: { slot: 0 },
      value: read(key),
    }),
    getMultipleAccountsInfoAndContext: async (keys) => ({
      context: { slot: 0 },
      value: keys.map(read),
    }),
    getTokenSupply: async (key) => {
      const info = read(key);
      const mint = unpackMint(key, info, info.owner);
      return {
        context: { slot: 0 },
        value: {
          amount: String(mint.supply),
          decimals: mint.decimals,
          uiAmount: null,
          uiAmountString: "0",
        },
      };
    },
    getSlot: async () => fixture.meta.getSlot,
    getEpochInfo: async () => fixture.meta.getEpochInfo,
    getBlockTime: async () => fixture.meta.getBlockTime,
    _rpcRequest: async () => {
      throw new Error("Unexpected external RPC");
    },
  });
  return {
    connection,
    warm: () => {
      warmed = true;
    },
  };
}
const fixtures = await Promise.all(
  (await readdir("src/direct/__tests__/fixtures"))
    .filter((name) => name.endsWith(".json"))
    .map(async (name) =>
      JSON.parse(
        await readFile(`src/direct/__tests__/fixtures/${name}`, "utf8"),
      ),
    ),
);
const owner = Keypair.fromSeed(new Uint8Array(32).fill(119)).publicKey;
for (const [index, entrypoint] of [...nodeSdks, sdk].entries()) {
  for (const fixture of fixtures.filter(
    (value) => value.accounts && value.quotes,
  )) {
    const recorded = recordedConnection(fixture);
    const market = await entrypoint.prepareDirectMarket(
      recorded.connection,
      new PublicKey(fixture.pool),
      new PublicKey(fixture.mint),
    );
    recorded.warm();
    if (fixture.venue === "Pump.fun") {
      const completion = entrypoint.quoteDirectCurveCompletion(market, 0);
      const buyer = {
        id: "full-capacity",
        owner,
        maximumInputAmount: completion.expectedInputAmount,
        maximumTokenAmount: completion.remainingTokenAmount,
      };
      const boundary = entrypoint.planDirectCurveCompletion(market, {
        wallets: [
          {
            id: "boundary",
            owner: Keypair.fromSeed(new Uint8Array(32).fill(125)).publicKey,
            maximumInputAmount: 101250003n,
            maximumTokenAmount: 3564784043564n,
          },
          { ...buyer, maximumInputAmount: 85966676279n },
        ],
        maxWalletCount: 2,
        slippageBps: 0,
      });
      assert.equal(boundary.allocations[0].tokenAmount, 3564784043563n);
      assert.equal(boundary.allocations[0].maximumInputAmount, 101250000n);
      assert.equal(boundary.allocations[1].maximumInputAmount, 85966676279n);
      assert.equal(
        boundary.allocations.reduce(
          (sum, allocation) => sum + allocation.tokenAmount,
          0n,
        ),
        completion.remainingTokenAmount,
      );
      for (let walletCount = 2; walletCount <= 4; walletCount++) {
        const dust = Array.from(
          { length: walletCount - 1 },
          (_unused, position) => ({
            id: `dust-${position}`,
            owner: Keypair.fromSeed(new Uint8Array(32).fill(120 + position))
              .publicKey,
            maximumInputAmount: completion.expectedInputAmount,
            maximumTokenAmount: 1n,
          }),
        );
        const plan = entrypoint.planDirectCurveCompletion(market, {
          wallets: [...dust, buyer],
          maxWalletCount: walletCount,
          slippageBps: 0,
        });
        assert.equal(
          plan.allocations.length,
          1,
          "Optional dust buys must not block a fully funded buyer through reserve rounding",
        );
        assert.equal(plan.allocations[0].walletId, buyer.id);
        assert.equal(
          plan.allocations[0].tokenAmount,
          completion.remainingTokenAmount,
        );
        assert.equal(plan.maximumInputAmount, completion.expectedInputAmount);
        const built = await entrypoint.buildDirectCurveCompletionBuy(
          market,
          plan,
          0,
        );
        assert.equal(
          built.expectation.minimumOutput,
          completion.remainingTokenAmount.toString(),
        );
        assert.equal(
          built.expectation.inputAmount,
          completion.expectedInputAmount.toString(),
        );
        const fundedSplit = entrypoint.planDirectCurveCompletion(market, {
          wallets: [
            ...dust,
            { ...buyer, maximumInputAmount: buyer.maximumInputAmount + 100n },
          ],
          maxWalletCount: walletCount,
          slippageBps: 0,
        });
        assert.equal(
          fundedSplit.allocations.length,
          walletCount,
          "Feasible dust allocations should retain the requested wallet split",
        );
      }
    }
    const savedBuy = fixture.quotes.find(
      (value) => value.input !== fixture.mint,
    );
    const buyAmount = BigInt(savedBuy.amount);
    const sizer = entrypoint.createDirectBuySizer(market, 100);
    const uncapped = sizer.capacity(buyAmount, (1n << 64n) - 1n);
    assert.equal(uncapped, buyAmount);
    const full = sizer.quote(uncapped);
    assert.equal(full.expectedOutput, BigInt(savedBuy.output));
    assert.equal(
      sizer.quote(uncapped),
      full,
      "Same-snapshot quotes are reused",
    );
    const ceiling = full.expectedOutput / 2n;
    const capped = sizer.capacity(buyAmount, ceiling);
    assert(capped < buyAmount);
    if (capped > 0n) {
      const limited = sizer.quote(capped);
      assert(limited && limited.expectedOutput <= ceiling);
      assert(
        entrypoint.quoteDirectSwap(market, market.quoteMint, capped + 1n, 100)
          .expectedOutput > ceiling,
      );
      assert(
        (await entrypoint.buildDirectSwap(market, limited, owner)).instructions
          .length > 0,
      );
    }
    assert.equal(sizer.capacity(0n, ceiling), 0n);
    assert.equal(sizer.capacity(buyAmount, 0n), 0n);
    for (const saved of fixture.quotes) {
      const quote = entrypoint.quoteDirectSwap(
        market,
        new PublicKey(saved.input),
        BigInt(saved.amount),
        100,
      );
      assert.equal(quote.expectedOutput, BigInt(saved.output));
      const built = await entrypoint.buildDirectSwap(market, quote, owner);
      assert(built.instructions.length > 0);
      assert.equal(built.expectation.pool, fixture.pool);
    }
  }
  for (const venue of ["Pump.fun", "Raydium CPMM"]) {
    const disabled = structuredClone(
      fixtures.find((fixture) => fixture.venue === venue),
    );
    const pool = Buffer.from(disabled.accounts[disabled.pool].data, "base64");
    if (venue === "Pump.fun") pool[48] = 1;
    else {
      const decoded = CpmmPoolInfoLayout.decode(pool);
      decoded.status |= 4;
      CpmmPoolInfoLayout.encode(decoded, pool);
    }
    disabled.accounts[disabled.pool].data = pool.toString("base64");
    await assert.rejects(
      entrypoint.prepareDirectMarket(
        recordedConnection(disabled).connection,
        new PublicKey(disabled.pool),
        new PublicKey(disabled.mint),
      ),
      /migrated|paused/,
      `${venue} must reject preparation before a quote is requested`,
    );
  }
  const limitedBuy = structuredClone(
    fixtures.find((fixture) => fixture.venue === "Pump.fun"),
  );
  const curve = Buffer.from(
    limitedBuy.accounts[limitedBuy.pool].data,
    "base64",
  );
  curve.writeBigUInt64LE(1n, 24);
  limitedBuy.accounts[limitedBuy.pool].data = curve.toString("base64");
  const recorded = recordedConnection(limitedBuy);
  const market = await entrypoint.prepareDirectMarket(
    recorded.connection,
    new PublicKey(limitedBuy.pool),
    new PublicKey(limitedBuy.mint),
  );
  recorded.warm();
  assert.throws(
    () => entrypoint.quoteDirectSwap(market, market.quoteMint, 1_000_000n, 100),
    /remaining curve capacity/,
  );
  const sell = limitedBuy.quotes.find(
    (quote) => quote.input === limitedBuy.mint,
  );
  const quote = entrypoint.quoteDirectSwap(
    market,
    market.mint,
    BigInt(sell.amount),
    100,
  );
  assert.equal(quote.expectedOutput, BigInt(sell.output));
  assert(
    (await entrypoint.buildDirectSwap(market, quote, owner)).instructions
      .length > 0,
  );
  console.log(
    `Direct ${["ESM", "CJS", "browser CSP"][index]}: eleven venue quote/build workflows, invalid-state preparation and buy-capacity/sell control passed`,
  );
}

// Public native-SOL transactions exercise the distributed settlement path, including ATA rent.
const pumpReceipts = JSON.parse(
  await readFile("src/direct/__tests__/fixtures/mainnet-pump-ata.json", "utf8"),
);
for (const entrypoint of [...nodeSdks, sdk]) {
  for (const { transaction, receipt, expectedSolLamports } of pumpReceipts) {
    const fill = entrypoint.normalizeDirectFill(transaction, receipt.route);
    const buy = receipt.route.side === "buy";
    assert.equal(
      String(buy ? fill.inputAmount : fill.outputAmount),
      expectedSolLamports,
    );
    assert.equal(
      String(buy ? fill.outputAmount : fill.inputAmount),
      "71373144979",
    );
    for (const field of [
      "account",
      "mint",
      "wallet",
      "source",
      "tokenProgram",
      "systemProgram",
    ]) {
      const invalid = structuredClone(transaction);
      invalid.transaction.message.instructions[0].parsed.info[field] =
        receipt.pool;
      assert.throws(
        () => entrypoint.normalizeDirectFill(invalid, receipt.route),
        undefined,
        field,
      );
    }
    const spoofed = structuredClone(transaction);
    spoofed.transaction.message.instructions[0].programId = receipt.pool;
    assert.throws(() => entrypoint.normalizeDirectFill(spoofed, receipt.route));
    const unknown = structuredClone(transaction);
    unknown.transaction.message.instructions[0].parsed.type = "unrecognized";
    assert.throws(() => entrypoint.normalizeDirectFill(unknown, receipt.route));
  }
}
console.log(
  "Direct ESM/CJS/browser CSP: public Pump buy/sell settlement and malformed ATA rejection passed",
);
