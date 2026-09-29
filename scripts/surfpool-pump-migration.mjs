import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Connection, Keypair, ComputeBudgetProgram } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  inspectDirectMigration,
  prepareDirectMarket,
} from "../dist/direct/index.mjs";
import { compileV1Transaction } from "../dist/browser.mjs";
const require = createRequire(import.meta.url);
const {
  PUMP_SDK,
  OnlinePumpSdk,
  bondingCurvePda,
  canonicalPumpPoolPda,
  getBuySolAmountFromTokenAmount,
} = require("@pump-fun/pump-sdk");

/**
 * Creates an unmodified Pump curve on verified local Surfpool.
 * @param rpcUrl - Credential-free loopback Surfpool endpoint; remote endpoints are rejected before RPC.
 * @returns Disposable owner, pool/mint/destination identities, staged graduation and migration methods, and public receipts.
 * @remarks Uses only local airdrop funding and official program instructions. No account bytes or privileged signers are substituted.
 */
export async function createPumpMigrationFixture(
  rpcUrl = process.env.SURFPOOL_RPC_URL ?? "http://127.0.0.1:8899",
) {
  const endpoint = new URL(rpcUrl);
  assert(
    endpoint.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname) &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.search &&
      !endpoint.hash,
    "Only credential-free loopback Surfpool is permitted",
  );
  const localFetch = (input, init) => {
    assert.equal(
      new URL(typeof input === "string" ? input : (input.url ?? String(input)))
        .origin,
      endpoint.origin,
    );
    return fetch(input, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(45000),
    });
  };
  const connection = new Connection(endpoint.href, {
    commitment: "confirmed",
    fetch: localFetch,
  });
  async function rpc(method, params = []) {
    const response = await localFetch(endpoint.href, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body = await response.json();
    assert(!body.error, JSON.stringify(body.error));
    return body.result;
  }
  assert(
    (await rpc("getVersion"))["surfnet-version"],
    "Local endpoint must identify itself as Surfpool",
  );
  const owner = Keypair.generate();
  const mintKey = Keypair.generate();
  const mint = mintKey.publicKey;
  const source = bondingCurvePda(mint);
  const destination = canonicalPumpPoolPda(mint);
  const signatures = {};
  const receipts = [];
  async function send(stage, instructions, signers = [owner]) {
    const keys = [
      ...new Map(
        instructions
          .flatMap((instruction) => [
            instruction.programId,
            ...instruction.keys.map((key) => key.pubkey),
          ])
          .map((key) => [key.toBase58(), key]),
      ).values(),
    ];
    for (let offset = 0; offset < keys.length; offset += 10)
      await connection.getMultipleAccountsInfo(keys.slice(offset, offset + 10));
    const beforeLamports = await connection.getBalance(owner.publicKey);
    const block = await connection.getLatestBlockhash();
    const transaction = compileV1Transaction({
      payer: owner.publicKey,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
        ...instructions,
      ],
      recentBlockhash: block.blockhash,
    });
    transaction.sign(signers);
    const wire = Buffer.from(transaction.serialize()).toString("base64");
    const simulation = await rpc("simulateTransaction", [
      wire,
      { encoding: "base64", sigVerify: true, commitment: "confirmed" },
    ]);
    assert.equal(simulation.value.err, null, JSON.stringify(simulation.value));
    const signature = await rpc("sendTransaction", [
      wire,
      { encoding: "base64", skipPreflight: true, maxRetries: 0 },
    ]);
    for (let attempt = 0; attempt < 100; attempt++) {
      const receipt = await rpc("getTransaction", [
        signature,
        {
          encoding: "json",
          commitment: "confirmed",
          maxSupportedTransactionVersion: 1,
        },
      ]);
      if (receipt) {
        assert.equal(receipt.meta.err, null, JSON.stringify(receipt.meta));
        receipts.push({
          stage,
          signature,
          beforeLamports,
          afterLamports: await connection.getBalance(owner.publicKey),
          slot: receipt.slot,
        });
        return signature;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Local fixture transaction confirmation timed out");
  }
  signatures.funding = await connection.requestAirdrop(
    owner.publicKey,
    250_000_000_000,
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await connection.getBalance(owner.publicKey)) >= 250_000_000_000)
      break;
    assert(attempt < 99, "Local airdrop did not fund disposable owner");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const online = new OnlinePumpSdk(connection);
  const global = await online.fetchGlobal();
  const create = await PUMP_SDK.createV2Instruction({
    mint,
    name: "Local Migration Fixture",
    symbol: "MIGTEST",
    uri: "https://example.invalid/migration.json",
    creator: owner.publicKey,
    user: owner.publicKey,
    mayhemMode: false,
  });
  signatures.creation = await send("create", [create], [owner, mintKey]);
  async function graduate() {
    const state = await online.fetchBuyState(
      mint,
      owner.publicKey,
      TOKEN_2022_PROGRAM_ID,
    );
    assert(!state.bondingCurve.complete, "Curve is already complete");
    const amount = state.bondingCurve.realTokenReserves;
    const feeConfig = await online.fetchFeeConfig();
    const solAmount = getBuySolAmountFromTokenAmount({
      global,
      feeConfig,
      mintSupply: state.bondingCurve.tokenTotalSupply,
      bondingCurve: state.bondingCurve,
      amount,
      quoteMint: NATIVE_MINT,
    });
    const instructions = await PUMP_SDK.buyInstructions({
      global,
      ...state,
      mint,
      user: owner.publicKey,
      amount,
      solAmount,
      slippage: 1,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    });
    signatures.graduation = await send("graduate", instructions);
    assert(
      (await online.fetchBondingCurve(mint)).complete,
      "Real buy must complete curve",
    );
    assert.equal(
      (await inspectDirectMigration(connection, source, mint)).state,
      "migrating",
    );
    await assert.rejects(
      prepareDirectMarket(connection, source, mint),
      /completed|complete|migrated/i,
    );
    return signatures.graduation;
  }
  async function migrate() {
    assert(
      (await online.fetchBondingCurve(mint)).complete,
      "Graduate the curve first",
    );
    const instruction = await PUMP_SDK.migrateInstruction({
      withdrawAuthority: global.withdrawAuthority,
      mint,
      user: owner.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    });
    assert(
      instruction.keys
        .filter((key) => key.isSigner)
        .every((key) => key.pubkey.equals(owner.publicKey)),
      "Migration unexpectedly needs a privileged signer",
    );
    signatures.migration = await send("migrate", [instruction]);
    assert(
      await connection.getAccountInfo(destination),
      "Migration must create destination pool",
    );
    const handoff = await inspectDirectMigration(connection, source, mint);
    assert.equal(handoff.state, "migrated");
    assert(handoff.destination.equals(destination));
    const market = await prepareDirectMarket(connection, destination, mint);
    assert(market.pool.equals(destination));
    return signatures.migration;
  }
  return {
    connection,
    owner,
    mint,
    source,
    pool: source,
    destination,
    graduate,
    migrate,
    signatures,
    receipts,
    sourceVenue: "Pump.fun",
    destinationVenue: "PumpSwap",
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const fixture = await createPumpMigrationFixture();
  console.log(
    JSON.stringify({
      stage: "created",
      mint: fixture.mint.toBase58(),
      source: fixture.source.toBase58(),
      destination: fixture.destination.toBase58(),
      signatures: fixture.signatures,
    }),
  );
  await fixture.graduate();
  console.log(
    JSON.stringify({ stage: "graduated", signatures: fixture.signatures }),
  );
  await fixture.migrate();
  console.log(
    JSON.stringify({
      stage: "migrated",
      signatures: fixture.signatures,
      receipts: fixture.receipts,
    }),
  );
}
