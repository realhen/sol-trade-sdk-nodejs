/** Real DBC creation, graduation and DAMM v2 migration on a loopback Surfpool fork. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import BN from "bn.js";
import {
  Connection,
  PublicKey,
  Keypair,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  DynamicBondingCurveClient,
  buildCurve,
  deriveDbcPoolAddress,
  deriveDammV2PoolAddress,
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  DYNAMIC_BONDING_CURVE_PROGRAM_ID,
  DAMM_V2_PROGRAM_ID,
  SwapMode,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  inspectDirectMigration,
  prepareDirectMarket,
} from "../dist/direct/index.mjs";

/** Create an ephemeral, real on-chain DBC fixture with separately callable graduation and migration stages.
 * @param endpoint - Credential-free loopback Surfpool URL; remote endpoints are rejected before any RPC.
 * @returns Disposable owner, connection, pool/mint/config/destination keys, stage methods and public receipts.
 * @remarks The only funding is a local airdrop. Pool/config state is created exclusively by official program instructions.
 */
export async function createDammV2MigrationFixture(
  endpoint = "http://127.0.0.1:8899",
  { onReceipt = () => {} } = {},
) {
  const url = new URL(endpoint);
  assert(
    url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash,
    "Only credential-free loopback Surfpool is permitted",
  );
  const guardedFetch = (input, options) => {
    assert.equal(
      new URL(typeof input === "string" ? input : (input.url ?? String(input)))
        .origin,
      url.origin,
    );
    return fetch(input, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(90000),
    });
  };
  const connection = new Connection(url.href, {
    commitment: "confirmed",
    fetch: guardedFetch,
  });
  const version = await connection.getVersion();
  assert(
    version["surfnet-version"],
    "Loopback server must identify itself as Surfpool",
  );
  const programs = [];
  for (const address of [
    DYNAMIC_BONDING_CURVE_PROGRAM_ID,
    DAMM_V2_PROGRAM_ID,
  ]) {
    const program = await connection.getAccountInfo(address);
    assert(program?.executable, `Missing executable program ${address}`);
    const evidence = {
      program: address.toBase58(),
      owner: program.owner.toBase58(),
      executable: program.executable,
      accountSha256: createHash("sha256").update(program.data).digest("hex"),
    };
    if (
      program.owner.toBase58() ===
        "BPFLoaderUpgradeab1e11111111111111111111111" &&
      program.data.length === 36 &&
      program.data.readUInt32LE(0) === 2
    ) {
      const programDataAddress = new PublicKey(program.data.subarray(4, 36));
      const programData = await connection.getAccountInfo(programDataAddress);
      assert(
        programData &&
          programData.owner.equals(program.owner) &&
          programData.data.readUInt32LE(0) === 3,
        "Invalid program data account",
      );
      evidence.programData = programDataAddress.toBase58();
      evidence.programDataSha256 = createHash("sha256")
        .update(programData.data)
        .digest("hex");
      evidence.executableSha256 = createHash("sha256")
        .update(programData.data.subarray(45))
        .digest("hex");
    }
    programs.push(evidence);
  }
  const owner = Keypair.generate(),
    configKeypair = Keypair.generate(),
    mintKeypair = Keypair.generate();
  const client = new DynamicBondingCurveClient(connection, "confirmed");
  const pool = deriveDbcPoolAddress(
    NATIVE_MINT,
    mintKeypair.publicKey,
    configKeypair.publicKey,
  );
  const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[0];
  const destination = deriveDammV2PoolAddress(
    dammConfig,
    mintKeypair.publicKey,
    NATIVE_MINT,
  );
  const receipts = [];
  async function confirmed(signature) {
    for (let attempt = 0; attempt < 300; attempt++) {
      const status = (await connection.getSignatureStatuses([signature]))
        .value[0];
      if (status?.err)
        throw new Error(
          `Transaction ${signature} failed: ${JSON.stringify(status.err)}`,
        );
      if (
        status?.confirmationStatus === "confirmed" ||
        status?.confirmationStatus === "finalized"
      )
        return;
      await delay(100);
    }
    throw new Error(`Local confirmation timed out: ${signature}`);
  }
  async function submit(stage, transaction, signers = []) {
    const addresses = [
      ...new Map(
        transaction.instructions
          .flatMap((ix) => [ix.programId, ...ix.keys.map((key) => key.pubkey)])
          .map((key) => [key.toBase58(), key]),
      ).values(),
    ];
    for (let offset = 0; offset < addresses.length; offset += 10)
      await connection.getMultipleAccountsInfo(
        addresses.slice(offset, offset + 10),
      );
    const beforeLamports = await connection.getBalance(owner.publicKey);
    transaction.instructions = transaction.instructions.filter(
      (ix) => !ix.programId.equals(ComputeBudgetProgram.programId),
    );
    transaction.instructions.unshift(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    );
    transaction.feePayer = owner.publicKey;
    transaction.recentBlockhash = (
      await connection.getLatestBlockhash()
    ).blockhash;
    transaction.sign(owner, ...signers);
    const simulation = await connection.simulateTransaction(transaction);
    assert.equal(
      simulation.value.err,
      null,
      `${stage} simulation failed: ${JSON.stringify(simulation.value)}`,
    );
    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      { skipPreflight: false, maxRetries: 0 },
    );
    await confirmed(signature);
    const receipt = {
      stage,
      signature,
      beforeLamports,
      afterLamports: await connection.getBalance(owner.publicKey),
      slot: (await connection.getSignatureStatuses([signature])).value[0].slot,
    };
    receipts.push(receipt);
    onReceipt(receipt);
    return receipt;
  }
  const airdrop = await connection.requestAirdrop(
    owner.publicKey,
    100_000_000_000,
  );
  await confirmed(airdrop);
  receipts.push({
    stage: "local-airdrop",
    signature: airdrop,
    afterLamports: await connection.getBalance(owner.publicKey),
  });
  const curve = buildCurve({
    token: {
      tokenType: 0,
      tokenBaseDecimal: 6,
      tokenQuoteDecimal: 9,
      tokenAuthorityOption: 1,
      totalTokenSupply: 1_000_000_000,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: 0,
        feeSchedulerParam: {
          startingFeeBps: 25,
          endingFeeBps: 25,
          numberOfPeriod: 0,
          totalDuration: 0,
        },
      },
      dynamicFeeEnabled: false,
      collectFeeMode: 0,
      creatorTradingFeePercentage: 0,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: 1,
      migrationFeeOption: 0,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    },
    liquidityDistribution: {
      partnerPermanentLockedLiquidityPercentage: 100,
      partnerLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 0,
      creatorLiquidityPercentage: 0,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: 0,
    percentageSupplyOnMigration: 20,
    migrationQuoteThreshold: 1,
  });
  await submit(
    "create-config",
    await client.partner.createConfig({
      ...curve,
      config: configKeypair.publicKey,
      feeClaimer: owner.publicKey,
      leftoverReceiver: owner.publicKey,
      quoteMint: NATIVE_MINT,
      payer: owner.publicKey,
    }),
    [configKeypair],
  );
  await submit(
    "create-pool",
    await client.creator.createPool({
      name: "Local Migration Fixture",
      symbol: "MIGTEST",
      uri: "https://example.invalid/local-migration.json",
      payer: owner.publicKey,
      poolCreator: owner.publicKey,
      config: configKeypair.publicKey,
      baseMint: mintKeypair.publicKey,
    }),
    [mintKeypair],
  );
  assert.equal(
    (await inspectDirectMigration(connection, pool, mintKeypair.publicKey))
      .state,
    "active",
  );
  return {
    connection,
    owner,
    pool,
    mint: mintKeypair.publicKey,
    config: configKeypair.publicKey,
    destination,
    receipts,
    programs,
    /** Buy through the actual DBC stop price using the official partial-fill swap instruction. */
    async graduate() {
      const receipt = await submit(
        "graduate",
        await client.pool.swap2({
          owner: owner.publicKey,
          pool,
          swapBaseForQuote: false,
          referralTokenAccount: null,
          swapMode: SwapMode.PartialFill,
          amountIn: new BN(2_000_000_000),
          minimumAmountOut: new BN(1),
        }),
      );
      assert.equal(
        (await inspectDirectMigration(connection, pool, mintKeypair.publicKey))
          .state,
        "migrating",
      );
      await assert.rejects(
        prepareDirectMarket(connection, pool, mintKeypair.publicKey),
        /completed or migrated/,
      );
      return receipt;
    },
    /** Execute the real migration with fresh position NFT signers; no account state overrides. */
    async migrate() {
      const built = await client.migration.migrateToDammV2({
        payer: owner.publicKey,
        pool,
        dammConfig,
      });
      const receipt = await submit("migrate", built.transaction, [
        built.firstPositionNftKeypair,
        built.secondPositionNftKeypair,
      ]);
      const migration = await inspectDirectMigration(
        connection,
        pool,
        mintKeypair.publicKey,
      );
      assert.equal(migration.state, "migrated");
      assert(migration.destination.equals(destination));
      return receipt;
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const fixture = await createDammV2MigrationFixture(
    process.env.SURFPOOL_RPC_URL,
    { onReceipt: (receipt) => console.log(JSON.stringify(receipt)) },
  );
  console.log(
    JSON.stringify({
      stage: "created",
      pool: fixture.pool,
      mint: fixture.mint,
      destination: fixture.destination,
      owner: fixture.owner.publicKey,
    }),
  );
  await fixture.graduate();
  await fixture.migrate();
  console.log(
    JSON.stringify(
      {
        stage: "complete",
        programs: fixture.programs,
        receipts: fixture.receipts,
      },
      null,
      2,
    ),
  );
}
