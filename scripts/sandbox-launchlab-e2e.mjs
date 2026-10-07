import fs from "node:fs";
import zlib from "node:zlib";
import { build } from "esbuild";
import {
  Connection,
  Keypair,
  Transaction,
  ComputeBudgetProgram,
  AddressLookupTableProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import assert from "node:assert/strict";
await build({
  entryPoints: ["src/sandbox/launchlab.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outfile: "scripts/sandbox-launchlab-built.mjs",
});
await build({
  entryPoints: ["src/sandbox/receipts.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outfile: "scripts/sandbox-launchlab-receipts-built.mjs",
});
const { decodeSandboxTransaction } =
  await import("./sandbox-launchlab-receipts-built.mjs");
const { LaunchLabSandbox } = await import("./sandbox-launchlab-built.mjs");
const url = process.env.SANDBOX_RPC_URL ?? "http://127.0.0.1:19399";
async function rpc(method, params = []) {
  const j = await (
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    })
  ).json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}
const version = await rpc("getVersion");
assert.ok(
  "surfnet-version" in version,
  "Test requires an identified Surfpool bank",
);
console.log("version", version);
const fixtures = JSON.parse(
  zlib.gunzipSync(
    fs.readFileSync(
      process.env.SANDBOX_FIXTURE_PATH ??
        (() => {
          throw new Error(
            "Set SANDBOX_FIXTURE_PATH to Moixa fixtures/programs.json.gz",
          );
        })(),
    ),
  ),
);
for (const [address, account] of Object.entries(fixtures)) {
  if (account.executable && Buffer.from(account.data, "base64").length < 1000)
    await rpc("surfnet_setAccount", [
      address,
      {
        lamports: account.lamports,
        owner: account.owner,
        executable: true,
        data: Buffer.from(account.data, "base64").toString("hex"),
      },
    ]);
}
const c = new Connection(url, "confirmed");
const payer = Keypair.generate();
await rpc("surfnet_setAccount", [
  payer.publicKey.toBase58(),
  { lamports: 1e13 },
]);
async function submit(tx) {
  try {
    const sig = await c.sendRawTransaction(tx.serialize());
    for (let i = 0; i < 100; i++) {
      const r = await c.getSignatureStatus(sig);
      if (r.value?.err) throw new Error(JSON.stringify(r.value.err));
      if (
        r.value?.confirmationStatus === "confirmed" ||
        r.value?.confirmationStatus === "finalized"
      ) {
        console.log("tx", sig);
        return sig;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("confirmation timeout");
  } catch (e) {
    console.error(e.logs ?? e);
    throw e;
  }
}
async function send(ixs, signer, extra = []) {
  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    ...ixs,
  ];
  const tx = new Transaction().add(...instructions);
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = (await c.getLatestBlockhash()).blockhash;
  tx.sign(signer, ...extra);
  try {
    tx.serialize();
    return await submit(tx);
  } catch (e) {
    if (!e.message.includes("too large")) throw e;
  }
  const [create, tableAddress] = AddressLookupTableProgram.createLookupTable({
    authority: signer.publicKey,
    payer: signer.publicKey,
    recentSlot: await c.getSlot("finalized"),
  });
  await send([create], signer);
  const addresses = [
    ...new Map(
      instructions.flatMap((i) =>
        i.keys
          .filter((k) => !k.isSigner)
          .map((k) => [k.pubkey.toBase58(), k.pubkey]),
      ),
    ).values(),
  ];
  for (let i = 0; i < addresses.length; i += 20)
    await send(
      [
        AddressLookupTableProgram.extendLookupTable({
          lookupTable: tableAddress,
          authority: signer.publicKey,
          payer: signer.publicKey,
          addresses: addresses.slice(i, i + 20),
        }),
      ],
      signer,
    );
  await new Promise((r) => setTimeout(r, 800));
  const table = (await c.getAddressLookupTable(tableAddress)).value;
  const vtx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: signer.publicKey,
      recentBlockhash: (await c.getLatestBlockhash()).blockhash,
      instructions,
    }).compileToV0Message([table]),
  );
  vtx.sign([signer, ...extra]);
  return submit(vtx);
}
const adapter = new LaunchLabSandbox({ connection: c, send });
const customization = await adapter.initialize(payer);
assert.equal(customization.field, "migrateToCpmmWallet");
console.log("customization", customization.config, customization.field);
const market = await adapter.launch(payer, "Sandbox Raydium", "SANDBOX");
console.log("market", market);
console.log("curve", await adapter.inspect(market));
const trader = Keypair.generate();
await rpc("surfnet_setAccount", [
  trader.publicKey.toBase58(),
  { lamports: 100_000_000_000 },
]);
const signatures = [];
signatures.push(await adapter.trade(market, trader, "buy", 1_000_000_000n));
signatures.push(await adapter.trade(market, trader, "sell", 1_000_000_000n));
const pre = await adapter.inspect(market);
assert.equal(pre.venue, "LaunchLab");
assert.ok(pre.progress > 0 && pre.progress < 100);
const migration = await adapter.migrate(market, payer);
console.log("migration", migration);
market.pool = migration.pool;
assert.deepEqual(await adapter.migrate(market, payer), {
  pool: migration.pool,
  signature: "already-migrated",
});
assert.deepEqual(
  await decodeSandboxTransaction(c, migration.signature, [market]),
  [],
);

signatures.push(await adapter.trade(market, trader, "buy", 100_000_000n));
signatures.push(await adapter.trade(market, trader, "sell", 100_000_000n));
for (const [i, sig] of signatures.entries()) {
  const receipts = await decodeSandboxTransaction(c, sig, [market]);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].side, i % 2 === 0 ? "buy" : "sell");
  assert.equal(receipts[0].wallet, trader.publicKey.toBase58());
  assert.ok(receipts[0].solAmount > 0 && receipts[0].tokenAmount > 0);
  assert.ok(receipts[0].timestamp > 1_000_000_000_000);
  console.log("receipt", receipts[0]);
}
const post = await adapter.inspect(market);
assert.equal(post.venue, "Raydium CPMM");
assert.equal(post.progress, 100);
assert.ok(post.priceSol > 0);
console.log("PASS", post);

fs.unlinkSync("scripts/sandbox-launchlab-built.mjs");
fs.unlinkSync("scripts/sandbox-launchlab-receipts-built.mjs");
