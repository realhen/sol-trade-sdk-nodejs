import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BorshAccountsCoder } from "@coral-xyz/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import { DynamicBondingCurveIdl } from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  inspectDirectMigration,
  prepareDirectMarket,
} from "../dist/direct/index.mjs";
const fixture = JSON.parse(
  await readFile(
    "src/direct/__tests__/fixtures/9D1ByLbUU8S5JSik4oDDdCHntt7PEaootedWDN94kjGh.json",
    "utf8",
  ),
);
const accounts = new Map(
  Object.entries(fixture.accounts).map(([key, value]) => [
    key,
    value && {
      ...value,
      owner: new PublicKey(value.owner),
      data: Buffer.from(value.data, "base64"),
    },
  ]),
);
const reads = [];
const read = async (key) => {
  reads.push(key.toBase58());
  return accounts.get(key.toBase58()) ?? null;
};
const connection = Object.assign(new Connection("http://127.0.0.1:1"), {
  getAccountInfo: read,
  getAccountInfoAndContext: async (key) => ({
    context: { slot: 0 },
    value: await read(key),
  }),
  getMultipleAccountsInfo: async (keys) => Promise.all(keys.map(read)),
});
const pool = new PublicKey(fixture.pool),
  mint = new PublicKey(fixture.mint);
const active = await inspectDirectMigration(connection, pool, mint);
assert.equal(active.state, "active");
assert(active.destination && reads.includes(active.destination.toBase58()));
const coder = new BorshAccountsCoder(DynamicBondingCurveIdl);
const source = accounts.get(fixture.pool);
const decoded = coder.decode("VirtualPool", source.data);
decoded.pool_state.is_migrated = 1;
source.data = await coder.encode("VirtualPool", decoded);
const waiting = await inspectDirectMigration(connection, pool, mint);
assert.equal(waiting.state, "migrating");
await assert.rejects(
  prepareDirectMarket(connection, pool, mint),
  /completed or migrated/,
);
for (const [option, file, offsets] of [
  [0, "B1AdQ85N2mJ2xtMg9bgThhsPoA6T3M26rt4TChWSiPpr", [40, 72]],
  [1, "BnztueWcXv93mgW7yJe8WYpnCxpz34nujPhfjQT6SLu1", [168, 200]],
]) {
  const configInfo = accounts.get(decoded.pool_state.config.toBase58());
  const config = coder.decode("PoolConfig", configInfo.data);
  config.migration_option = option;
  config.migration_fee_option = 0;
  // Official account layout encoding avoids hand-coded config offsets.
  const layout = coder.accountLayouts.get("PoolConfig");
  const encoded = Buffer.alloc(configInfo.data.length);
  Buffer.from(layout.discriminator).copy(encoded);
  layout.layout.encode(config, encoded, 8);
  configInfo.data = encoded;
  const pending = await inspectDirectMigration(connection, pool, mint);
  assert.equal(pending.state, "migrating");
  const targetFixture = JSON.parse(
    await readFile(`src/direct/__tests__/fixtures/${file}.json`, "utf8"),
  );
  const target = targetFixture.accounts[file];
  const data = Buffer.from(target.data, "base64");
  decoded.pool_state.base_mint.toBuffer().copy(data, offsets[0]);
  config.quote_mint.toBuffer().copy(data, offsets[1]);
  accounts.set(pending.destination.toBase58(), {
    ...target,
    owner: new PublicKey(target.owner),
    data,
  });
  const migrated = await inspectDirectMigration(connection, pool, mint);
  assert.equal(migrated.state, "migrated");
  accounts.get(pending.destination.toBase58()).owner = PublicKey.default;
  await assert.rejects(
    inspectDirectMigration(connection, pool, mint),
    /destination owner mismatch/,
  );
  accounts.delete(pending.destination.toBase58());
}
console.log(
  "DBC recorded-account workflow: active -> completed -> missing destination -> authenticated DAMM v1/v2; source preparation and spoofed owner rejected",
);

const { LaunchpadPool, getPdaLaunchpadPoolId } =
  await import("@raydium-io/raydium-sdk-v2");
const { resolveDirectMigration, discoverPoolQuoteMint } =
  await import("../dist/direct/index.mjs");
const {
  TransactionInstruction,
  TransactionMessage,
  AddressLookupTableAccount,
} = await import("@solana/web3.js");
for (const [
  type,
  targetFile,
  programString,
  discriminator,
  sourceIndex,
  targetIndex,
  programIndex,
  configIndex,
] of [
  [
    0,
    "AgFnRLUScRD2E4nWQxW73hdbSN7eKEUb2jHX7tx9YTYc",
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    [207, 82, 192, 145, 254, 207, 145, 223],
    23,
    13,
    12,
    24,
  ],
  [
    1,
    "9yczkyRw4xxC8xntgeURtahoT3aad51fUPLxjenLbVbf",
    "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
    [136, 92, 200, 103, 28, 218, 144, 140],
    17,
    5,
    4,
    18,
  ],
]) {
  const launch = JSON.parse(
    await readFile(
      "src/direct/__tests__/fixtures/B8GoQQZFfXhS813NXnMQWxdr9to3XNz8DiLf1QR61RYX.json",
      "utf8",
    ),
  );
  const targetFixture = JSON.parse(
    await readFile(`src/direct/__tests__/fixtures/${targetFile}.json`, "utf8"),
  );
  const original = launch.accounts[launch.pool];
  const state = LaunchpadPool.decode(Buffer.from(original.data, "base64"));
  state.mintA = new PublicKey(targetFixture.mint);
  state.mintB = await discoverPoolQuoteMint(
    {
      getAccountInfo: async (key) => {
        const a = targetFixture.accounts[key.toBase58()];
        return (
          a && {
            ...a,
            owner: new PublicKey(a.owner),
            data: Buffer.from(a.data, "base64"),
          }
        );
      },
    },
    new PublicKey(targetFile),
    state.mintA,
  );
  state.status = 2;
  state.migrateType = type;
  const launchProgram = new PublicKey(original.owner);
  const sourceKey = getPdaLaunchpadPoolId(
    launchProgram,
    state.mintA,
    state.mintB,
  ).publicKey;
  const sourceData = Buffer.from(original.data, "base64");
  LaunchpadPool.encode(state, sourceData);
  accounts.set(sourceKey.toBase58(), {
    ...original,
    owner: launchProgram,
    data: sourceData,
  });
  const targetKey = new PublicKey(targetFile);
  const target = targetFixture.accounts[targetFile];
  accounts.set(targetFile, {
    ...target,
    owner: new PublicKey(target.owner),
    data: Buffer.from(target.data, "base64"),
  });
  const keys = Array.from({ length: configIndex + 1 }, () => ({
    pubkey: PublicKey.default,
    isSigner: false,
    isWritable: false,
  }));
  for (const [index, pubkey] of [
    [1, state.mintA],
    [2, state.mintB],
    [sourceIndex, sourceKey],
    [targetIndex, targetKey],
    [programIndex, new PublicKey(programString)],
    [configIndex, state.configId],
  ])
    keys[index] = { pubkey, isSigner: false, isWritable: false };
  const instruction = new TransactionInstruction({
    programId: launchProgram,
    keys,
    data: Buffer.from(discriminator),
  });
  const table = new AddressLookupTableAccount({
    key: PublicKey.default,
    state: {
      deactivationSlot: 18446744073709551615n,
      lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0,
      authority: undefined,
      addresses: keys.map((k) => k.pubkey),
    },
  });
  const message = new TransactionMessage({
    payerKey: state.creator,
    recentBlockhash: PublicKey.default.toBase58(),
    instructions: [instruction],
  }).compileToV0Message([table]);
  const lookup = message.addressTableLookups[0];
  assert(lookup, "migration keys should exercise v0 loaded addresses");
  const loadedAddresses = {
    writable: lookup.writableIndexes.map((i) => table.state.addresses[i]),
    readonly: lookup.readonlyIndexes.map((i) => table.state.addresses[i]),
  };
  connection.getSignaturesForAddress = async () => [
    { signature: "recorded-migration", err: null },
  ];
  let transactionError = null;
  connection.getTransaction = async () => ({
    transaction: { message },
    meta: { err: transactionError, innerInstructions: [], loadedAddresses },
  });
  assert.equal(
    (await inspectDirectMigration(connection, sourceKey, state.mintA)).state,
    "migrating",
  );
  transactionError = { InstructionError: [0, "Custom"] };
  assert.equal(
    await resolveDirectMigration(connection, sourceKey, state.mintA),
    undefined,
  );
  transactionError = null;
  const compiled = message.compiledInstructions[0];
  const savedProgram = compiled.programIdIndex;
  compiled.programIdIndex = 0;
  const bs58 = (await import("bs58")).default;
  connection.getTransaction = async () => ({
    transaction: { message },
    meta: {
      err: null,
      loadedAddresses,
      innerInstructions: [
        {
          index: 0,
          instructions: [
            {
              programIdIndex: savedProgram,
              accounts: compiled.accountKeyIndexes,
              data: bs58.encode(compiled.data),
            },
          ],
        },
      ],
    },
  });
  assert.equal(
    await resolveDirectMigration(connection, sourceKey, state.mintA),
    undefined,
    "caught failed CPI must not authorize destination",
  );
  const rootProgram = message.staticAccountKeys[0].toBase58();
  const invokeTarget = `Program ${launchProgram} invoke [2]`;
  const successTarget = `Program ${launchProgram} success`;
  const inner = {
    programIdIndex: savedProgram,
    accounts: compiled.accountKeyIndexes,
    data: bs58.encode(compiled.data),
    stackHeight: 2,
  };
  const logs = [
    `Program ${rootProgram} invoke [1]`,
    invokeTarget,
    successTarget,
    `Program ${rootProgram} success`,
  ];
  const cpiTransaction = {
    transaction: { message },
    meta: {
      err: null,
      loadedAddresses,
      innerInstructions: [{ index: 0, instructions: [inner] }],
      logMessages: logs,
    },
  };
  connection.getTransaction = async () => cpiTransaction;
  assert(
    await resolveDirectMigration(connection, sourceKey, state.mintA),
    "successful CPI accepted",
  );
  cpiTransaction.meta.logMessages = [
    logs[0],
    invokeTarget,
    `Program ${launchProgram} failed: custom error`,
    logs[3],
  ];
  assert.equal(
    await resolveDirectMigration(connection, sourceKey, state.mintA),
    undefined,
    "caught failed target CPI rejected",
  );
  cpiTransaction.meta.logMessages = logs.slice(0, -1);
  assert.equal(
    await resolveDirectMigration(connection, sourceKey, state.mintA),
    undefined,
    "truncated logs rejected",
  );
  inner.stackHeight = 3;
  const middle = PublicKey.default.toBase58();
  cpiTransaction.meta.logMessages = [
    logs[0],
    `Program ${middle} invoke [2]`,
    `Program ${launchProgram} invoke [3]`,
    successTarget,
    `Program ${middle} failed: caught error`,
    logs[3],
  ];
  assert.equal(
    await resolveDirectMigration(connection, sourceKey, state.mintA),
    undefined,
    "successful child rolled back by failed parent rejected",
  );
  compiled.programIdIndex = savedProgram;
  connection.getTransaction = async () => ({
    transaction: { message },
    meta: { err: null, innerInstructions: [], loadedAddresses },
  });
  const evidence = await resolveDirectMigration(
    connection,
    sourceKey,
    state.mintA,
  );
  assert(evidence);
  assert.equal(
    (
      await inspectDirectMigration(connection, sourceKey, state.mintA, evidence)
    ).destination.toBase58(),
    targetFile,
  );
  await assert.rejects(
    inspectDirectMigration(connection, sourceKey, state.mintA, {
      signature: evidence.signature,
    }),
    /invalid migration evidence/,
  );
}
console.log(
  "LaunchLab AMM/CPMM account and instruction replay: failed transaction ignored, confirmed source-linked migration accepted, forged proof rejected",
);
