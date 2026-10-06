import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  Connection,
  Keypair,
  PublicKey,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { BorshAccountsCoder } from "@coral-xyz/anchor";
import { createPumpMigrationFixture } from "./surfpool-pump-migration.mjs";
import * as sdk from "../dist/direct/index.mjs";
import { compileTransaction, compileV1Transaction } from "../dist/browser.mjs";
const require = createRequire(import.meta.url);
const {
  PUMP_SDK,
  pumpIdl,
  canonicalPumpPoolPda,
  bondingCurvePda,
} = require("@pump-fun/pump-sdk");
const fixture = await createPumpMigrationFixture();
const { connection, source, mint } = fixture;
const recorded = new Map();
let warm = false;
const cached = Object.assign(new Connection("http://127.0.0.1:1"), {
  getAccountInfo: async (key) => {
    assert(
      !warm,
      "Completion must not perform account reads after preparation",
    );
    const value = await connection.getAccountInfo(key);
    recorded.set(key.toBase58(), value);
    return value;
  },
  getMultipleAccountsInfo: async (keys) => {
    assert(
      !warm,
      "Completion must not perform account reads after preparation",
    );
    const values = await connection.getMultipleAccountsInfo(keys);
    keys.forEach((key, index) => recorded.set(key.toBase58(), values[index]));
    return values;
  },
});
const market = await sdk.prepareDirectMarket(cached, source, mint);
warm = true;
const quote = sdk.quoteDirectCurveCompletion(market, 100);
assert(quote.destination.equals(canonicalPumpPoolPda(mint)));
assert.throws(
  () => sdk.quoteDirectSwap(market, NATIVE_MINT, quote.maximumInputAmount, 0),
  /capacity/,
);
const buyers = Array.from({ length: 4 }, () => Keypair.generate());
for (const buyer of buyers) {
  await connection.requestAirdrop(buyer.publicKey, 100_000_000_000);
  assert((await connection.getBalance(buyer.publicKey)) >= 100_000_000_000);
}
const tokenCap = quote.remainingTokenAmount / 4n;
const wallets = buyers.map((buyer, index) => ({
  id: `buyer-${index}`,
  owner: buyer.publicKey,
  maximumInputAmount: 99_000_000_000n,
  maximumTokenAmount:
    index === 3 ? quote.remainingTokenAmount - tokenCap * 3n : tokenCap,
}));
const options = { wallets, maxWalletCount: 4, slippageBps: 100 };
const plan = sdk.planDirectCurveCompletion(market, options);
assert.equal(plan.allocations.length, 4);
const unboundedPlan = sdk.planDirectCurveCompletion(market, {
  ...options,
  wallets: wallets.map((wallet) => ({
    ...wallet,
    maximumTokenAmount: quote.remainingTokenAmount,
  })),
});
assert.equal(
  unboundedPlan.allocations.length,
  4,
  "Rich wallets should retain the requested split",
);
assert(
  unboundedPlan.allocations.every(
    (allocation) =>
      allocation.tokenAmount >= tokenCap &&
      allocation.tokenAmount <= tokenCap + 1n,
  ),
);

assert.equal(
  plan.allocations.reduce(
    (sum, allocation) => sum + allocation.tokenAmount,
    0n,
  ),
  quote.remainingTokenAmount,
);
assert.equal(
  plan.expectedInputAmount,
  plan.allocations.reduce(
    (sum, allocation) => sum + allocation.expectedInputAmount,
    0n,
  ),
);
assert.equal(
  plan.maximumInputAmount,
  plan.allocations.reduce(
    (sum, allocation) => sum + allocation.maximumInputAmount,
    0n,
  ),
);
assert(
  plan.allocations[3].expectedInputAmount >
    plan.allocations[0].expectedInputAmount,
);
assert.throws(
  () => sdk.quoteDirectCurveCompletion({ ...market }, 100),
  /prepared/,
);
await assert.rejects(
  sdk.buildDirectCurveCompletionBuy(market, { ...plan }, 0),
  /bound/,
);
await assert.rejects(
  sdk.buildDirectCurveCompletionMigration(
    market,
    plan,
    Keypair.generate().publicKey,
  ),
  /payer/,
);
assert.throws(
  () =>
    sdk.planDirectCurveCompletion(market, {
      ...options,
      wallets: wallets.map((wallet) => ({ ...wallet, maximumInputAmount: 1n })),
    }),
  /Insufficient/,
);
assert.throws(
  () =>
    sdk.planDirectCurveCompletion(market, {
      ...options,
      wallets: wallets.map((wallet) => ({
        ...wallet,
        maximumTokenAmount: tokenCap - 1n,
      })),
    }),
  /Insufficient/,
);
assert.throws(
  () =>
    sdk.planDirectCurveCompletion(market, { ...options, maxWalletCount: 3 }),
  /preselected/,
);
assert.throws(
  () =>
    sdk.planDirectCurveCompletion(market, {
      ...options,
      wallets: [wallets[0], wallets[0]],
    }),
  /unique/,
);
const unequal = sdk.planDirectCurveCompletion(market, {
  ...options,
  wallets: [
    {
      ...wallets[0],
      maximumInputAmount: quote.expectedInputAmount / 10n,
      maximumTokenAmount: quote.remainingTokenAmount,
    },
    { ...wallets[1], maximumTokenAmount: quote.remainingTokenAmount },
  ],
});
assert.equal(unequal.allocations.length, 2);
assert.equal(
  unequal.allocations[0].maximumInputAmount,
  quote.expectedInputAmount / 10n,
);
assert.equal(
  unequal.allocations.reduce(
    (sum, allocation) => sum + allocation.tokenAmount,
    0n,
  ),
  quote.remainingTokenAmount,
);
const coder = new BorshAccountsCoder(pumpIdl);
async function changedCurve(changes) {
  const original = recorded.get(source.toBase58());
  const decoded = coder.decode("BondingCurve", original.data);
  const encodedChanges = Object.fromEntries(
    Object.entries(changes).map(([key, value]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      value,
    ]),
  );
  const data = await coder.encode("BondingCurve", {
    ...decoded,
    ...encodedChanges,
  });
  const read = (key) =>
    key.equals(source) ? { ...original, data } : recorded.get(key.toBase58());
  const changed = Object.assign(new Connection("http://127.0.0.1:1"), {
    getAccountInfo: async (key) => read(key),
    getMultipleAccountsInfo: async (keys) => keys.map(read),
  });
  return sdk.prepareDirectMarket(changed, source, mint);
}
for (const changes of [
  { isMayhemMode: true },
  { isCashbackCoin: true },
  { isHolderReward: true },
]) {
  const unsupported = await changedCurve(changes);
  assert.throws(
    () => sdk.quoteDirectCurveCompletion(unsupported, 0),
    /does not support/,
  );
}
await assert.rejects(changedCurve({ complete: true }), /migrated/);
const unsupportedQuote = await changedCurve({ quoteMint: NATIVE_MINT });
assert.throws(
  () => sdk.quoteDirectCurveCompletion(unsupportedQuote, 0),
  /legacy SOL quote/,
);
await assert.rejects(
  sdk.prepareDirectMarket(cached, source, Keypair.generate().publicKey),
  /reads|target|belong/,
);
async function receipt(signature) {
  const response = await fetch(connection.rpcEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [
        signature,
        {
          encoding: "jsonParsed",
          commitment: "confirmed",
          maxSupportedTransactionVersion: 1,
        },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  });
  const body = await response.json();
  assert(!body.error, JSON.stringify(body.error));
  return body.result;
}
const sizes = [];
for (const [index, allocation] of plan.allocations.entries()) {
  const built = await sdk.buildDirectCurveCompletionBuy(market, plan, index);
  assert.equal(
    built.expectation.minimumOutput,
    allocation.tokenAmount.toString(),
  );
  const block = await connection.getLatestBlockhash();
  const args = {
    payer: allocation.owner,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({
        units: built.computeUnitLimit,
      }),
      ...built.instructions,
    ],
    recentBlockhash: block.blockhash,
  };
  sizes.push({
    stage: `buy-${index}`,
    v0: compileTransaction(args).serialize().length,
    v1: compileV1Transaction(args).serialize().length,
  });
  const before = PUMP_SDK.decodeBondingCurve(
    await connection.getAccountInfo(source),
  );
  const signature = await fixture.sendInstructions(
    `buy-${index}`,
    built.instructions,
    [buyers[index]],
    built.computeUnitLimit,
  );
  const received = await receipt(signature);
  const fill = sdk.normalizeDirectFill(received, built.expectation);
  if (index === 0) {
    const missing = structuredClone(received);
    missing.meta.logMessages = [];
    assert.throws(
      () => sdk.normalizeDirectFill(missing, built.expectation),
      /completion/,
    );
    const duplicate = structuredClone(received);
    const eventIndex = duplicate.meta.logMessages.findIndex((log) =>
      log.startsWith("Program data: "),
    );
    duplicate.meta.logMessages.splice(
      eventIndex,
      0,
      duplicate.meta.logMessages[eventIndex],
    );
    assert.throws(
      () => sdk.normalizeDirectFill(duplicate, built.expectation),
      /ambiguous/,
    );
    const cpi = structuredClone(received);
    const eventLog = cpi.meta.logMessages[eventIndex];
    cpi.meta.logMessages.splice(
      eventIndex,
      1,
      `Program ${TOKEN_PROGRAM_ID} invoke [2]`,
      eventLog,
      `Program ${TOKEN_PROGRAM_ID} success`,
    );
    assert.throws(
      () => sdk.normalizeDirectFill(cpi, built.expectation),
      /TradeEvent/,
    );
    const transfer = structuredClone(received);
    const curveTransfer = transfer.meta.innerInstructions
      .flatMap((group) => group.instructions)
      .find(
        (ix) =>
          ix.parsed?.type === "transfer" &&
          ix.parsed.info.destination === source.toBase58(),
      );
    curveTransfer.parsed.info.lamports += 1;
    assert.throws(
      () => sdk.normalizeDirectFill(transfer, built.expectation),
      /disagrees/,
    );
  }
  assert.equal(fill.outputAmount, allocation.tokenAmount);
  assert.equal(fill.inputAmount, allocation.expectedInputAmount);
  const after = PUMP_SDK.decodeBondingCurve(
    await connection.getAccountInfo(source),
  );
  assert.equal(
    BigInt(before.realTokenReserves.sub(after.realTokenReserves).toString()),
    allocation.tokenAmount,
  );
}
assert(
  PUMP_SDK.decodeBondingCurve(await connection.getAccountInfo(source)).complete,
);
assert.equal(
  PUMP_SDK.decodeBondingCurve(
    await connection.getAccountInfo(source),
  ).realTokenReserves.toString(),
  "0",
);
await assert.rejects(
  sdk.prepareDirectMarket(connection, source, mint),
  /migrated/,
);
const migration = await sdk.buildDirectCurveCompletionMigration(
  market,
  plan,
  buyers[0].publicKey,
);
const migrationArgs = {
  payer: buyers[0].publicKey,
  instructions: [
    ComputeBudgetProgram.setComputeUnitLimit({
      units: migration.computeUnitLimit,
    }),
    ...migration.instructions,
  ],
  recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
};
sizes.push({
  stage: "migration",
  v0: compileTransaction(migrationArgs).serialize().length,
  v1: compileV1Transaction(migrationArgs).serialize().length,
});
const migrationSignature = await fixture.sendInstructions(
  "sdk-migrate",
  migration.instructions,
  [buyers[0]],
);
const migrationReceipt = await receipt(migrationSignature);
const migrationFunding = fixture.receipts.at(-1);
const migrationCosts = {
  totalPayerDebit:
    migrationFunding.beforeLamports - migrationFunding.afterLamports,
  networkFee: migrationReceipt.meta.fee,
  netRentDebit:
    migrationFunding.beforeLamports -
    migrationFunding.afterLamports -
    migrationReceipt.meta.fee,
};
assert(migrationCosts.totalPayerDebit <= 20_000_000);
const handoff = await sdk.inspectDirectMigration(connection, source, mint);
assert.equal(handoff.state, "migrated");
assert(handoff.destination.equals(plan.destination));
await sdk.prepareDirectMarket(connection, plan.destination, mint);
for (const size of sizes)
  assert(size.v0 <= 1232 && size.v1 <= 4096, JSON.stringify(size));
assert(
  migration.instructions[0].keys.some((key) =>
    key.pubkey.equals(
      getAssociatedTokenAddressSync(
        mint,
        plan.destination,
        true,
        TOKEN_2022_PROGRAM_ID,
      ),
    ),
  ),
);
assert(bondingCurvePda(mint).equals(source));
const classic = await createPumpMigrationFixture(undefined, {
  tokenProgram: TOKEN_PROGRAM_ID,
});
const classicMarket = await sdk.prepareDirectMarket(
  classic.connection,
  classic.source,
  classic.mint,
);
assert(classicMarket.tokenProgram.equals(TOKEN_PROGRAM_ID));
const classicQuote = sdk.quoteDirectCurveCompletion(classicMarket, 0);
const classicPlan = sdk.planDirectCurveCompletion(classicMarket, {
  wallets: [
    {
      id: "optional-dust-buyer",
      owner: buyers[0].publicKey,
      maximumInputAmount: classicQuote.expectedInputAmount,
      maximumTokenAmount: 1n,
    },
    {
      id: "classic-buyer",
      owner: classic.owner.publicKey,
      maximumInputAmount: classicQuote.expectedInputAmount,
      maximumTokenAmount: classicQuote.remainingTokenAmount,
    },
  ],
  maxWalletCount: 2,
  slippageBps: 0,
});
assert.equal(classicPlan.allocations.length, 1);
assert.equal(classicPlan.allocations[0].walletId, "classic-buyer");
const classicBuy = await sdk.buildDirectCurveCompletionBuy(
  classicMarket,
  classicPlan,
  0,
);
const classicSignature = await classic.sendInstructions(
  "sdk-classic-buy",
  classicBuy.instructions,
  [classic.owner],
  classicBuy.computeUnitLimit,
);
const classicFill = sdk.normalizeDirectFill(
  await receipt(classicSignature),
  classicBuy.expectation,
);
assert.equal(classicFill.outputAmount, classicQuote.remainingTokenAmount);
assert.equal(classicFill.inputAmount, classicPlan.expectedInputAmount);
const classicMigration = await sdk.buildDirectCurveCompletionMigration(
  classicMarket,
  classicPlan,
  classic.owner.publicKey,
);
assert(
  classicMigration.instructions[0].keys.some((key) =>
    key.pubkey.equals(
      getAssociatedTokenAddressSync(
        classic.mint,
        classicPlan.destination,
        true,
        TOKEN_PROGRAM_ID,
      ),
    ),
  ),
);
await classic.sendInstructions(
  "sdk-classic-migrate",
  classicMigration.instructions,
);
const classicHandoff = await sdk.inspectDirectMigration(
  classic.connection,
  classic.source,
  classic.mint,
);
assert.equal(classicHandoff.state, "migrated");
assert(classicHandoff.destination.equals(classicPlan.destination));
await sdk.prepareDirectMarket(
  classic.connection,
  classicPlan.destination,
  classic.mint,
);
console.log(
  JSON.stringify(
    {
      status: "passed",
      mint: mint.toBase58(),
      transactions: sizes,
      expectedInputAmount: plan.expectedInputAmount.toString(),
      maximumInputAmount: plan.maximumInputAmount.toString(),
      remainingTokenAmount: plan.remainingTokenAmount.toString(),
      destination: plan.destination.toBase58(),
      migrationCosts,
      classicToken: {
        mint: classic.mint.toBase58(),
        destination: classicPlan.destination.toBase58(),
        receipts: classic.receipts,
      },
      receipts: fixture.receipts,
    },
    null,
    2,
  ),
);
