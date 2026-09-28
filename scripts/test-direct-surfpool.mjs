import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
/** Direct SDK end-to-end execution against a verified loopback Surfpool only.
 * Generates an ephemeral wallet, funds local test balances, and verifies both quote directions.
 * No user keys or remote mutation method is accepted.
 */
import assert from "node:assert/strict";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  prepareDirectMarket,
  quoteDirectSwap,
  buildDirectSwap,
  normalizeDirectFill,
} from "../dist/direct/browser.mjs";
import {
  buildSwapTransaction,
  readTradingPriorityObservation,
  readPriorityObservation,
} from "../dist/browser.mjs";
const endpoint = new URL(
  process.env.SURFPOOL_RPC_URL ?? "http://127.0.0.1:8999",
);
assert(
  endpoint.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname) &&
    !endpoint.username &&
    !endpoint.password &&
    !endpoint.search &&
    !endpoint.hash,
  "Only credential-free loopback Surfpool is permitted",
);
const localFetch = (input, options) => {
  assert.equal(
    new URL(typeof input === "string" ? input : (input.url ?? String(input)))
      .origin,
    endpoint.origin,
  );
  return fetch(input, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(45000),
  });
};
const connection = new Connection(endpoint.href, {
  commitment: "confirmed",
  fetch: localFetch,
});
async function rpc(method, params = []) {
  const r = await localFetch(endpoint.href, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await r.json();
  assert(!body.error, `${method}: ${body.error?.message}`);
  return body.result;
}
assert(
  (await rpc("getVersion"))["surfnet-version"],
  "Loopback server must identify itself as Surfpool",
);
const owner = Keypair.generate();
await rpc("surfnet_setAccount", [
  owner.publicKey.toBase58(),
  { lamports: 2_000_000_000 },
]);
async function send(
  instructions,
  computeUnitLimit = 50_000,
  priorityFeeLamports = 0n,
) {
  const block = await connection.getLatestBlockhash();
  const tx = buildSwapTransaction({
    version: 1,
    payer: owner.publicKey,
    instructions,
    recentBlockhash: block.blockhash,
    computeUnitLimit,
    computeUnitPriceMicroLamports: 0n,
    priorityFeeLamports,
  });
  tx.sign([owner]);
  const wire = Buffer.from(tx.serialize()).toString("base64");
  const sim = await rpc("simulateTransaction", [
    wire,
    { encoding: "base64", sigVerify: true, commitment: "confirmed" },
  ]);
  assert.equal(
    sim.value.err,
    null,
    JSON.stringify({ error: sim.value.err, logs: sim.value.logs }),
  );
  const signature = await rpc("sendTransaction", [
    wire,
    { encoding: "base64", skipPreflight: true, maxRetries: 0 },
  ]);
  let receipt;
  for (let i = 0; i < 30; i++) {
    receipt = await rpc("getTransaction", [
      signature,
      {
        encoding: "jsonParsed",
        commitment: "confirmed",
        maxSupportedTransactionVersion: 1,
      },
    ]);
    if (receipt) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert(receipt, `Local receipt unavailable ${signature}`);
  assert.equal(receipt.meta.err, null);
  return { receipt, signature, computeUnits: sim.value.unitsConsumed };
}
const fixtures = [
  {
    venue: "Meteora DAMM v2",
    pool: "BnztueWcXv93mgW7yJe8WYpnCxpz34nujPhfjQT6SLu1",
    mint: "METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL",
  },
];
for (const fixture of fixtures) {
  const pool = new PublicKey(fixture.pool),
    mint = new PublicKey(fixture.mint);
  let market = await prepareDirectMarket(connection, pool, mint);
  const input = getAssociatedTokenAddressSync(
    market.quoteMint,
    owner.publicKey,
    false,
    market.quoteProgram,
  );
  await send([
    createAssociatedTokenAccountIdempotentInstruction(
      owner.publicKey,
      input,
      owner.publicKey,
      market.quoteMint,
      market.quoteProgram,
    ),
  ]);
  const info = await connection.getAccountInfo(input);
  assert(info);
  const data = Buffer.from(info.data);
  data.writeBigUInt64LE(10_000_000n, 64);
  await rpc("surfnet_setAccount", [
    input.toBase58(),
    {
      lamports: info.lamports,
      owner: info.owner.toBase58(),
      executable: false,
      data: data.toString("hex"),
    },
  ]);
  const quote = quoteDirectSwap(market, market.quoteMint, 100_000n, 100);
  const buy = await buildDirectSwap(market, quote, owner.publicKey);
  const bought = await send(buy.instructions, buy.computeUnitLimit, 100_000n);
  const buyBid = readTradingPriorityObservation(bought.receipt);
  assert(buyBid, "Real jsonParsed v1 receipt must decode as program activity");
  assert.deepEqual(buyBid.venues, [fixture.venue]);
  assert.equal(buyBid.priorityLamports, 100_000n);
  assert.equal(buyBid.computeUnitLimit, buy.computeUnitLimit);
  assert.equal(
    readPriorityObservation(bought.receipt, fixture.pool)?.priorityLamports,
    100_000n,
  );
  if (process.env.DIRECT_TEST_OUTPUT_DIR) {
    await mkdir(process.env.DIRECT_TEST_OUTPUT_DIR, { recursive: true });
    await writeFile(
      join(process.env.DIRECT_TEST_OUTPUT_DIR, "buy.json"),
      JSON.stringify({ ...bought, expectation: buy.expectation }, null, 2),
    );
  }
  const buyFill = normalizeDirectFill(bought.receipt, buy.expectation);
  assert.equal(buyFill.inputAmount, 100_000n);
  assert(buyFill.outputAmount >= quote.minimumOutput);
  market = await prepareDirectMarket(connection, pool, mint);
  const sellQuote = quoteDirectSwap(market, mint, buyFill.outputAmount, 100);
  const sell = await buildDirectSwap(market, sellQuote, owner.publicKey);
  const sold = await send(sell.instructions, sell.computeUnitLimit, 80_000n);
  assert.equal(
    readTradingPriorityObservation(sold.receipt)?.priorityLamports,
    80_000n,
  );
  if (process.env.DIRECT_TEST_OUTPUT_DIR) {
    await mkdir(process.env.DIRECT_TEST_OUTPUT_DIR, { recursive: true });
    await writeFile(
      join(process.env.DIRECT_TEST_OUTPUT_DIR, "sell.json"),
      JSON.stringify({ ...sold, expectation: sell.expectation }, null, 2),
    );
  }
  const sellFill = normalizeDirectFill(sold.receipt, sell.expectation);
  assert.equal(sellFill.inputAmount, buyFill.outputAmount);
  assert(sellFill.outputAmount >= sellQuote.minimumOutput);
  console.log(
    JSON.stringify({
      venue: fixture.venue,
      pool: fixture.pool,
      buy: {
        signature: bought.signature,
        input: String(buyFill.inputAmount),
        output: String(buyFill.outputAmount),
        quoted: String(quote.expectedOutput),
        computeUnits: bought.computeUnits,
        computeUnitLimit: buy.computeUnitLimit,
      },
      sell: {
        signature: sold.signature,
        input: String(sellFill.inputAmount),
        output: String(sellFill.outputAmount),
        quoted: String(sellQuote.expectedOutput),
        computeUnits: sold.computeUnits,
        computeUnitLimit: sell.computeUnitLimit,
      },
      localOnly: true,
    }),
  );
}
