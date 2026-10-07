import {
  Keypair,
  PublicKey,
  ComputeBudgetProgram,
  SystemProgram,
} from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DynamicBondingCurveClient,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  SwapMode,
  buildCurve,
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  deriveDbcPoolAddress,
  deriveDammV2PoolAddress,
  deriveDbcPoolAuthority,
  deriveDammV2PoolAuthority,
  getCurrentPoint,
  getPriceFromSqrtPrice,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import type {
  SandboxAdapter,
  SandboxContext,
  SandboxMarket,
  SandboxObservation,
} from "./types";

const DAMM_CONFIG =
  DAMM_V2_MIGRATION_FEE_ADDRESS[MigrationFeeOption.FixedBps25]!;

/** Real local DBC launches and DAMM v2 migrations built by Meteora's official SDKs. */
export class DbcSandbox implements SandboxAdapter {
  private readonly dbc: DynamicBondingCurveClient;
  private readonly damm: CpAmm;
  private configuration?: Promise<PublicKey>;
  private verifiedBank?: Promise<void>;

  constructor(private readonly context: SandboxContext) {
    const endpoint = new URL(context.connection.rpcEndpoint);
    if (
      ![
        "127.0.0.1",
        "localhost",
        "[::1]",
        process.env.SURFPOOL_PRIVATE_HOST,
      ].includes(endpoint.hostname)
    ) {
      throw new Error(
        "Sandbox DBC requires a loopback or explicitly configured private RPC host",
      );
    }
    this.dbc = new DynamicBondingCurveClient(context.connection, "confirmed");
    this.damm = new CpAmm(context.connection);
  }

  private async verifyBank(): Promise<void> {
    if (!this.verifiedBank)
      this.verifiedBank = this.context.connection
        .getVersion()
        .then((version) => {
          if (!("surfnet-version" in version))
            throw new Error("Sandbox DBC requires Surfpool");
        });
    await this.verifiedBank;
  }

  private sourcePool(market: SandboxMarket): PublicKey {
    if (!market.config) throw new Error("DBC market configuration is missing");
    return deriveDbcPoolAddress(
      NATIVE_MINT,
      new PublicKey(market.mint),
      new PublicKey(market.config),
    );
  }

  /** Creates one shared, permissionless configuration through the deployed DBC program. */
  private async createConfiguration(payer: Keypair): Promise<PublicKey> {
    const config = Keypair.generate();
    const curve = buildCurve({
      token: {
        tokenType: TokenType.SPLToken,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: 9,
        tokenAuthorityOption: TokenAuthorityOption.Immutable,
        totalTokenSupply: 1_000_000_000,
        leftover: 0,
      },
      fee: {
        baseFeeParams: {
          baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
          feeSchedulerParam: {
            startingFeeBps: 100,
            endingFeeBps: 100,
            numberOfPeriod: 0,
            totalDuration: 0,
          },
        },
        dynamicFeeEnabled: false,
        collectFeeMode: CollectFeeMode.QuoteToken,
        creatorTradingFeePercentage: 0,
        poolCreationFee: 0,
        enableFirstSwapWithMinFee: false,
      },
      migration: {
        migrationOption: MigrationOption.MET_DAMM_V2,
        migrationFeeOption: MigrationFeeOption.FixedBps25,
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
      activationType: ActivationType.Slot,
      percentageSupplyOnMigration: 20,
      migrationQuoteThreshold: 10,
    });
    const transaction = await this.dbc.partner.createConfig({
      ...curve,
      config: config.publicKey,
      feeClaimer: payer.publicKey,
      leftoverReceiver: payer.publicKey,
      quoteMint: NATIVE_MINT,
      payer: payer.publicKey,
    });
    await this.context.send(transaction.instructions, payer, [config]);
    return config.publicKey;
  }

  /** Launches a real mint and curve pool; the returned signature is confirmed by the caller. */
  async launch(
    payer: Keypair,
    name: string,
    symbol: string,
  ): Promise<SandboxMarket> {
    await this.verifyBank();
    if (!this.configuration)
      this.configuration = this.createConfiguration(payer).catch((error) => {
        this.configuration = undefined;
        throw error;
      });
    const config = await this.configuration;
    const mint = Keypair.generate();
    const transaction = await this.dbc.creator.createPool({
      name,
      symbol,
      uri: "",
      payer: payer.publicKey,
      poolCreator: payer.publicKey,
      config,
      baseMint: mint.publicKey,
    });
    const creationSignature = await this.context.send(
      transaction.instructions,
      payer,
      [mint],
    );
    return {
      mint: mint.publicKey.toBase58(),
      pool: deriveDbcPoolAddress(
        NATIVE_MINT,
        mint.publicKey,
        config,
      ).toBase58(),
      config: config.toBase58(),
      launchpad: "Meteora DBC",
      creationSignature,
    };
  }

  private migratedPool(market: SandboxMarket): PublicKey {
    return deriveDammV2PoolAddress(
      DAMM_CONFIG,
      new PublicKey(market.mint),
      NATIVE_MINT,
    );
  }

  /** Executes an exact-input swap, with an on-chain quote and one percent slippage. */
  async trade(
    market: SandboxMarket,
    signer: Keypair,
    side: "buy" | "sell",
    rawAmount: bigint,
  ): Promise<string> {
    await this.verifyBank();
    const virtualPool = await this.dbc.state.getPool(this.sourcePool(market));
    if (!virtualPool) throw new Error("DBC pool is missing");
    const amountIn = new BN(rawAmount.toString());
    if (virtualPool.poolState.isMigrated) {
      const pool = this.migratedPool(market);
      const state = await this.damm.fetchPoolState(pool);
      const inputTokenMint =
        side === "buy" ? NATIVE_MINT : new PublicKey(market.mint);
      const slot = await this.context.connection.getSlot("confirmed");
      const quote = this.damm.getQuote({
        inAmount: amountIn,
        inputTokenMint,
        slippage: 1,
        poolState: state,
        currentSlot: slot,
        currentTime: (await this.context.connection.getBlockTime(slot)) ?? 0,
        tokenADecimal: 6,
        tokenBDecimal: 9,
      });
      const transaction = await this.damm.swap({
        payer: signer.publicKey,
        pool,
        inputTokenMint,
        outputTokenMint:
          side === "buy" ? new PublicKey(market.mint) : NATIVE_MINT,
        amountIn,
        minimumAmountOut: quote.minSwapOutAmount,
        tokenAMint: state.tokenAMint,
        tokenBMint: state.tokenBMint,
        tokenAVault: state.tokenAVault,
        tokenBVault: state.tokenBVault,
        tokenAProgram: TOKEN_PROGRAM_ID,
        tokenBProgram: TOKEN_PROGRAM_ID,
        referralTokenAccount: null,
        poolState: state,
      });
      return this.context.send(transaction.instructions, signer);
    }
    const config = await this.dbc.state.getPoolConfig(
      virtualPool.poolState.config,
    );
    if (!config) throw new Error("DBC configuration is missing");
    const quote = this.dbc.pool.swapQuote({
      virtualPool,
      config,
      swapBaseForQuote: side === "sell",
      amountIn,
      slippageBps: 100,
      hasReferral: false,
      eligibleForFirstSwapWithMinFee: false,
      currentPoint: await getCurrentPoint(
        this.context.connection,
        config.activationType,
      ),
    });
    const transaction = await this.dbc.pool.swap({
      owner: signer.publicKey,
      pool: this.sourcePool(market),
      amountIn,
      minimumAmountOut: quote.minimumAmountOut,
      swapBaseForQuote: side === "sell",
      referralTokenAccount: null,
    });
    return this.context.send(transaction.instructions, signer);
  }

  /**
   * Completes the curve with real SOL and migrates it to DAMM v2.
   * @remarks The sandbox signer contributes 0.1 SOL to DBC's shared authority for
   * migration account rent; the isolated bank does not inherit its mainnet treasury.
   */
  async migrate(
    market: SandboxMarket,
    signer: Keypair,
  ): Promise<{ pool: string; signature: string }> {
    await this.verifyBank();
    const virtualPool = await this.dbc.state.getPool(this.sourcePool(market));
    if (!virtualPool) throw new Error("DBC pool is missing");
    if (virtualPool.poolState.isMigrated)
      throw new Error("DBC pool has already migrated");
    const config = await this.dbc.state.getPoolConfig(
      virtualPool.poolState.config,
    );
    if (!config) throw new Error("DBC configuration is missing");
    if (virtualPool.poolState.quoteReserve.lt(config.migrationQuoteThreshold)) {
      const remaining = config.migrationQuoteThreshold.sub(
        virtualPool.poolState.quoteReserve,
      );
      const transaction = await this.dbc.pool.swap2({
        owner: signer.publicKey,
        pool: this.sourcePool(market),
        amountIn: remaining.muln(2).addn(1_000_000),
        minimumAmountOut: new BN(1),
        swapBaseForQuote: false,
        referralTokenAccount: null,
        swapMode: SwapMode.PartialFill,
      });
      await this.context.send(transaction.instructions, signer);
    }
    const migration = await this.dbc.migration.migrateToDammV2({
      payer: signer.publicKey,
      pool: this.sourcePool(market),
      dammConfig: DAMM_CONFIG,
    });
    const signature = await this.context.send(
      [
        SystemProgram.transfer({
          fromPubkey: signer.publicKey,
          toPubkey: deriveDbcPoolAuthority(),
          lamports: 100_000_000,
        }),
        ...migration.transaction.instructions.filter(
          (instruction) =>
            !instruction.programId.equals(ComputeBudgetProgram.programId),
        ),
      ],
      signer,
      [migration.firstPositionNftKeypair, migration.secondPositionNftKeypair],
    );
    const migrated = await this.dbc.state.getPool(this.sourcePool(market));
    if (!migrated?.poolState.isMigrated)
      throw new Error(
        "Confirmed DBC migration did not mark its source pool migrated",
      );
    await this.damm.fetchPoolState(this.migratedPool(market));
    return { pool: this.migratedPool(market).toBase58(), signature };
  }

  /** Reads progress, price and reserves directly from the local bank's decoded pool accounts. */
  async inspect(market: SandboxMarket): Promise<SandboxObservation> {
    await this.verifyBank();
    const source = await this.dbc.state.getPool(this.sourcePool(market));
    if (!source) throw new Error("DBC pool is missing");
    const excludedOwners = [
      deriveDbcPoolAuthority().toBase58(),
      deriveDammV2PoolAuthority().toBase58(),
    ];
    if (source.poolState.isMigrated) {
      const pool = this.migratedPool(market);
      const state = await this.damm.fetchPoolState(pool);
      const reserve = await this.context.connection.getTokenAccountBalance(
        state.tokenBVault,
      );
      return {
        pool: pool.toBase58(),
        venue: "Meteora DAMM v2",
        progress: 100,
        priceSol: getPriceFromSqrtPrice(state.sqrtPrice, 6, 9).toNumber(),
        liquiditySol: Number(reserve.value.amount) / 1e9,
        excludedOwners,
      };
    }
    const config = await this.dbc.state.getPoolConfig(source.poolState.config);
    if (!config) throw new Error("DBC configuration is missing");
    return {
      pool: this.sourcePool(market).toBase58(),
      venue: "Meteora DBC",
      progress:
        100 *
        Math.min(
          1,
          source.poolState.quoteReserve.toNumber() /
            config.migrationQuoteThreshold.toNumber(),
        ),
      priceSol: getPriceFromSqrtPrice(
        source.poolState.sqrtPrice,
        6,
        9,
      ).toNumber(),
      liquiditySol: source.poolState.quoteReserve.toNumber() / 1e9,
      excludedOwners,
    };
  }
}
