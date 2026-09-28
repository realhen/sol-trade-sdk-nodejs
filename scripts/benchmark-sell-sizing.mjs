import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { platform, arch, cpus } from "node:os";
import { Connection, PublicKey } from "@solana/web3.js";
import { unpackMint } from "@solana/spl-token";

// Supply two independently bundled modules so each owns its prepared-state registry.
const [beforePath, afterPath, venueFilter] = process.argv.slice(2);
assert(
  beforePath && afterPath,
  "Usage: node scripts/benchmark-sell-sizing.mjs BEFORE_MODULE AFTER_MODULE",
);
const apis = {
  before: await import(pathToFileURL(resolve(beforePath))),
  after: await import(pathToFileURL(resolve(afterPath))),
};
globalThis.fetch = () => {
  throw Error("Network forbidden in captured benchmark");
};
function cache(fixture) {
  let warmed = false;
  const read = (key) => {
    assert(!warmed, "Unexpected warmed RPC");
    const account = fixture.accounts[key.toBase58()];
    assert(account !== undefined, `Missing captured account ${key}`);
    return (
      account && {
        ...account,
        owner: new PublicKey(account.owner),
        data: Buffer.from(account.data, "base64"),
      }
    );
  };
  const connection = Object.assign(new Connection("http://127.0.0.1:8899"), {
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
      const account = read(key),
        mint = unpackMint(key, account, account.owner);
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
    getEpochInfo: async () => {
      assert(!warmed);
      return fixture.meta.getEpochInfo;
    },
    getSlot: async () => {
      assert(!warmed);
      return fixture.meta.getSlot;
    },
    getBlockTime: async () => {
      assert(!warmed);
      return fixture.meta.getBlockTime;
    },
    _rpcRequest: async () => {
      throw Error("Unexpected RPC");
    },
  });
  return {
    connection,
    warm() {
      warmed = true;
    },
  };
}
const fixtures = readdirSync(
  new URL("../src/direct/__tests__/fixtures/", import.meta.url),
)
  .filter((name) => name.endsWith(".json"))
  .map((name) =>
    JSON.parse(
      readFileSync(
        new URL("../src/direct/__tests__/fixtures/" + name, import.meta.url),
        "utf8",
      ),
    ),
  )
  .filter(
    (fixture) =>
      fixture.accounts &&
      fixture.quotes &&
      (!venueFilter || fixture.venue === venueFilter),
  );
const results = [];
const samples = 100,
  warmups = 20;
const summary = (values) => {
  values.sort((a, b) => a - b);
  return {
    p50Ms: values[Math.floor(values.length * 0.5)],
    p95Ms: values[Math.floor(values.length * 0.95)],
  };
};
for (const fixture of fixtures) {
  const markets = {};
  for (const [name, api] of Object.entries(apis)) {
    const reader = cache(fixture);
    markets[name] = await api.prepareDirectMarket(
      reader.connection,
      new PublicKey(fixture.pool),
      new PublicKey(fixture.mint),
    );
    reader.warm();
  }
  const saved = fixture.quotes.find((quote) => quote.input === fixture.mint);
  const amount = BigInt(saved.amount) * 10n;
  const full = apis.before.quoteDirectSwap(
    markets.before,
    markets.before.mint,
    amount,
    0,
  ).expectedOutput;
  assert.equal(
    apis.after.quoteDirectSwap(markets.after, markets.after.mint, amount, 0)
      .expectedOutput,
    full,
  );
  const wallets = [
    { id: "a", balance: amount / 3n, weight: 1n },
    { id: "b", balance: amount / 3n, weight: 1n },
    { id: "c", balance: amount - 2n * (amount / 3n), weight: 1n },
  ];
  const scenarios = ["sizing"];
  if (apis.before.planSellBatch && apis.after.planSellBatch)
    scenarios.push(
      "partial preset",
      "full preset",
      "fresh snapshot partial preset",
    );
  for (const scenario of scenarios) {
    const target = scenario === "full preset" ? full * 100n : full / 2n;
    const timings = { before: [], after: [] };
    for (let iteration = 0; iteration < warmups + samples; iteration++) {
      const answers = {};
      for (const name of iteration % 2
        ? ["before", "after"]
        : ["after", "before"]) {
        let market = markets[name];
        if (scenario === "fresh snapshot partial preset") {
          const reader = cache(fixture);
          market = await apis[name].prepareDirectMarket(
            reader.connection,
            new PublicKey(fixture.pool),
            new PublicKey(fixture.mint),
          );
          reader.warm();
        }
        const start = performance.now();
        answers[name] =
          scenario === "sizing"
            ? apis[name].sizeDirectSellForExpectedOutput(
                markets[name],
                target,
                amount,
              )
            : apis[name].planSellBatch(market, target, wallets, 5000);
        if (iteration >= warmups) timings[name].push(performance.now() - start);
      }
      const normalize = (value) =>
        JSON.parse(
          JSON.stringify(value, (_, item) =>
            typeof item === "bigint" ? item.toString() : item,
          ),
        );
      assert.deepEqual(
        normalize(answers.after),
        normalize(answers.before),
        `${fixture.venue} ${scenario}: amount or quote changed`,
      );
    }
    results.push({
      venue: fixture.venue,
      scenario,
      before: summary(timings.before),
      after: summary(timings.after),
    });
  }
}
console.log(
  JSON.stringify(
    {
      environment: {
        node: process.version,
        platform: platform(),
        arch: arch(),
        cpu: cpus()[0]?.model,
      },
      samples,
      warmups,
      slippageBps: 5000,
      note: "Local replay of captured pool state; warmed RPC prohibited; excludes signing, submission and mainnet landing.",
      results,
    },
    null,
    2,
  ),
);
