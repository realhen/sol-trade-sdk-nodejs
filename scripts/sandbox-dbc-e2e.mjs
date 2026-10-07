import { build } from "esbuild";
import assert from "node:assert/strict";
import {
  Connection,
  Keypair,
  Transaction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
const adapterOutput = new URL(
  "../node_modules/.cache/sandbox-dbc/adapter.mjs",
  import.meta.url,
);
const receiptsOutput = new URL(
  "../node_modules/.cache/sandbox-dbc/receipts.mjs",
  import.meta.url,
);
await build({
  entryPoints: [new URL("../src/sandbox/dbc.ts", import.meta.url).pathname],
  outfile: adapterOutput.pathname,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
await build({
  entryPoints: [
    new URL("../src/sandbox/receipts.ts", import.meta.url).pathname,
  ],
  outfile: receiptsOutput.pathname,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const { decodeSandboxTransaction } = await import(receiptsOutput.href);
const { DbcSandbox } = await import(adapterOutput.href);
const connection = new Connection(
  process.env.SANDBOX_RPC ?? "http://127.0.0.1:19599",
  "confirmed",
);
const payer = Keypair.generate();
const signatures = [];
await connection.requestAirdrop(payer.publicKey, 1_000_000_000_000);
const send = async (instructions, signer, extra = []) => {
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    ...instructions.filter(
      (i) => !i.programId.equals(ComputeBudgetProgram.programId),
    ),
  );
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [signer, ...extra],
      { commitment: "confirmed", skipPreflight: false },
    );
    signatures.push(signature);
    return signature;
  } catch (e) {
    console.error(e, await e.getLogs?.(connection));
    throw e;
  }
};
const adapter = new DbcSandbox({ connection, send });
const market = await adapter.launch(payer, "Sandbox DBC Real", "SDBC");
console.log("launch", market, await adapter.inspect(market));
const balance = async () =>
  (
    await getAccount(
      connection,
      getAssociatedTokenAddressSync(
        new (await import("@solana/web3.js")).PublicKey(market.mint),
        payer.publicKey,
      ),
    )
  ).amount;
const buy = await adapter.trade(market, payer, "buy", 500_000_000n);
const bought = await balance();
assert(bought > 0n);
const sell = await adapter.trade(market, payer, "sell", bought / 10n);
assert((await balance()) < bought);
console.log("curve trades", buy, sell, await adapter.inspect(market));
const migration = await adapter.migrate(market, payer);
market.pool = migration.pool;
const inspected = await adapter.inspect(market);
assert.equal(inspected.progress, 100);
assert.equal(inspected.venue, "Meteora DAMM v2");
assert.equal(inspected.pool, migration.pool);
console.log("migration", migration, inspected);
const before = await balance();
const ammBuy = await adapter.trade(market, payer, "buy", 100_000_000n);
assert((await balance()) > before);
const ammSell = await adapter.trade(
  market,
  payer,
  "sell",
  (await balance()) / 100n,
);
console.log("amm trades", ammBuy, ammSell, await adapter.inspect(market));
for (const [signature, side] of [
  [buy, "buy"],
  [sell, "sell"],
  [ammBuy, "buy"],
  [ammSell, "sell"],
]) {
  const receipts = await decodeSandboxTransaction(connection, signature, [
    market,
  ]);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].side, side);
  console.log("receipt", receipts[0]);
}
assert.equal(
  (await decodeSandboxTransaction(connection, migration.signature, [market]))
    .length,
  0,
);
const initialReceipt = (
  await decodeSandboxTransaction(connection, buy, [market])
)[0];
assert.equal(initialReceipt.solAmount, 0.5);
assert.equal(initialReceipt.tokenAmount, Number(bought) / 1e6);
const completionReceipt = await decodeSandboxTransaction(
  connection,
  signatures[4],
  [market],
);
assert.equal(completionReceipt.length, 1);
assert.equal(completionReceipt[0].side, "buy");
assert(completionReceipt[0].solAmount > 0);
console.log(
  "PASS real DBC launch, curve buy/sell, completion, migration and DAMM v2 buy/sell",
);
