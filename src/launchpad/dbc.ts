import {
  PublicKey,
  SystemProgram,
  type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  DynamicBondingCurveClient,
  MigrationOption,
  SwapMode,
  buildCurve,
  createDbcProgram,
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  DAMM_V2_PROGRAM_ID,
  U64_MAX,
  deriveDbcPoolAddress,
  deriveDammV2PoolAddress,
  deriveDbcPoolAuthority,
  deriveDammV2PoolAuthority,
  deriveDammV2EventAuthority,
  deriveDammV2MigrationMetadataAddress,
  deriveDammV2TokenVaultAddress,
  derivePositionAddress,
  derivePositionNftAccount,
  getCurrentPoint,
  getPriceFromSqrtPrice,
  type BuildCurveParams,
  type PoolConfig,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import type { LaunchpadMarket, LaunchpadObservation } from "./types";

export {
  ActivationType as DbcActivationType,
  BaseFeeMode as DbcBaseFeeMode,
  CollectFeeMode as DbcCollectFeeMode,
  MigrationFeeOption as DbcMigrationFeeOption,
  MigrationOption as DbcMigrationOption,
  TokenAuthorityOption as DbcTokenAuthorityOption,
  TokenDecimal as DbcTokenDecimal,
  TokenType as DbcTokenType,
  MigratedCollectFeeMode as DbcMigratedCollectFeeMode,
  DammV2DynamicFeeMode as DbcDammV2DynamicFeeMode,
  DammV2BaseFeeMode as DbcDammV2BaseFeeMode,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
export type { BuildCurveParams as DbcCurveOptions } from "@meteora-ag/dynamic-bonding-curve-sdk";

/** Caller-selected configuration; every economic parameter is explicit. */
export interface DbcBuildConfigOptions {
  payer: PublicKey;
  config: PublicKey;
  feeClaimer: PublicKey;
  leftoverReceiver: PublicKey;
  quoteMint: PublicKey;
  curve: BuildCurveParams;
  tokenBadge?: PublicKey;
}

/** Public accounts and metadata for a mint whose signer remains with the caller. */
export interface DbcBuildLaunchOptions {
  payer: PublicKey;
  mint: PublicKey;
  config: PublicKey;
  poolCreator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  tokenBadge?: PublicKey;
}

/** Both position NFT mints must sign the caller's migration transaction. */
export interface DbcBuildMigrationOptions {
  firstPositionNftMint: PublicKey;
  secondPositionNftMint: PublicKey;
}

/** Returns the protocol authority used by DBC for vault custody and migration rent. */
export function getDbcPoolAuthority(): PublicKey {
  return deriveDbcPoolAuthority();
}

/** Unsigned DBC launch, completion and DAMM v2 migration builders; callers own all signing and submission. */
export class DbcLaunchpadClient {
  private readonly dbc: DynamicBondingCurveClient;
  private readonly damm: CpAmm;

  constructor(private readonly connection: Connection) {
    this.dbc = new DynamicBondingCurveClient(connection, "confirmed");
    this.damm = new CpAmm(connection);
  }

  private async configuration(address: PublicKey): Promise<PoolConfig> {
    const config = await this.dbc.state.getPoolConfig(address);
    if (!config) throw new Error("DBC configuration is missing");
    return config;
  }

  private async marketState(market: LaunchpadMarket) {
    if (!market.config) throw new Error("DBC market configuration is missing");
    const configKey = new PublicKey(market.config);
    const config = await this.configuration(configKey);
    const pool = deriveDbcPoolAddress(
      config.quoteMint,
      new PublicKey(market.mint),
      configKey,
    );
    const virtualPool = await this.dbc.state.getPool(pool);
    if (!virtualPool) throw new Error("DBC pool is missing");
    return { pool, config, virtualPool };
  }

  private migrationConfig(config: PoolConfig): PublicKey {
    if (config.migrationOption !== MigrationOption.MET_DAMM_V2)
      throw new Error("DBC configuration does not migrate to DAMM v2");
    const migrationConfig =
      DAMM_V2_MIGRATION_FEE_ADDRESS[config.migrationFeeOption];
    if (!migrationConfig)
      throw new Error("Unsupported DBC migration fee option");
    return migrationConfig;
  }

  /** Builds configuration creation; payer and config must sign when the caller submits. */
  async buildConfig(
    options: DbcBuildConfigOptions,
  ): Promise<TransactionInstruction[]> {
    const { curve, ...accounts } = options;
    return (
      await this.dbc.partner.createConfig({ ...buildCurve(curve), ...accounts })
    ).instructions;
  }

  /** Builds mint and pool creation; payer, mint and poolCreator must sign when required by the program. */
  async buildLaunch(options: DbcBuildLaunchOptions): Promise<{
    market: LaunchpadMarket;
    instructions: TransactionInstruction[];
  }> {
    const { mint, ...params } = options;
    const config = await this.configuration(options.config);
    const transaction = await this.dbc.creator.createPool({
      ...params,
      baseMint: mint,
    });
    return {
      market: {
        mint: mint.toBase58(),
        pool: deriveDbcPoolAddress(
          config.quoteMint,
          mint,
          options.config,
        ).toBase58(),
        config: options.config.toBase58(),
        launchpad: "Meteora DBC",
      },
      instructions: transaction.instructions,
    };
  }

  /**
   * Builds a partial-fill buy sized to the terminal curve price from current confirmed state.
   * @param slippageBps - Caller-selected maximum input headroom and minimum-output tolerance, 0 through 9999 basis points.
   * @remarks Returns no instructions for a completed or migrated curve. Quotes may become stale;
   * the caller must confirm completion before building migration. No purchase is submitted here.
   */
  async buildCompletion(
    market: LaunchpadMarket,
    owner: PublicKey,
    slippageBps: number,
  ): Promise<TransactionInstruction[]> {
    if (
      !Number.isInteger(slippageBps) ||
      slippageBps < 0 ||
      slippageBps >= 10_000
    )
      throw new Error("Invalid DBC completion slippage");
    const { pool, config, virtualPool } = await this.marketState(market);
    if (
      virtualPool.poolState.isMigrated ||
      virtualPool.poolState.quoteReserve.gte(config.migrationQuoteThreshold)
    )
      return [];
    const quote = this.dbc.pool.swapQuote2({
      virtualPool,
      config,
      swapBaseForQuote: false,
      swapMode: SwapMode.PartialFill,
      amountIn: U64_MAX,
      slippageBps,
      hasReferral: false,
      eligibleForFirstSwapWithMinFee: false,
      currentPoint: await getCurrentPoint(
        this.connection,
        config.activationType,
      ),
    });
    if (
      !quote.nextSqrtPrice.eq(config.migrationSqrtPrice) ||
      !quote.minimumAmountOut ||
      quote.minimumAmountOut.isZero()
    )
      throw new Error(
        "DBC completion quote does not reach the migration boundary",
      );
    const amountIn = quote.includedFeeInputAmount
      .muln(10_000 + slippageBps)
      .addn(9_999)
      .divn(10_000);
    if (amountIn.gt(U64_MAX))
      throw new Error("DBC completion input exceeds u64");
    return (
      await this.dbc.pool.swap2({
        owner,
        pool,
        amountIn,
        minimumAmountOut: quote.minimumAmountOut,
        swapBaseForQuote: false,
        referralTokenAccount: null,
        swapMode: SwapMode.PartialFill,
      })
    ).instructions;
  }

  /**
   * Builds only the migration of a completed curve. Payer and both caller-owned position mints must sign.
   * @remarks The program authority must already hold sufficient migration rent. This builder neither
   * funds that account nor buys curve tokens; incomplete curves reject before instruction construction.
   */
  async buildMigration(
    market: LaunchpadMarket,
    owner: PublicKey,
    options: DbcBuildMigrationOptions,
  ): Promise<{ pool: string; instructions: TransactionInstruction[] }> {
    const {
      pool: sourcePool,
      config,
      virtualPool,
    } = await this.marketState(market);
    const dammConfig = this.migrationConfig(config);
    const state = virtualPool.poolState;
    const pool = deriveDammV2PoolAddress(
      dammConfig,
      state.baseMint,
      config.quoteMint,
    );
    if (state.isMigrated) {
      await this.damm.fetchPoolState(pool);
      return { pool: pool.toBase58(), instructions: [] };
    }
    if (state.quoteReserve.lt(config.migrationQuoteThreshold))
      throw new Error("DBC curve must be completed before migration");
    const { firstPositionNftMint, secondPositionNftMint } = options;
    if (firstPositionNftMint.equals(secondPositionNftMint))
      throw new Error("DBC position NFT mints must be distinct");
    const { program } = createDbcProgram(this.connection, "confirmed");
    const instruction = await program.methods
      .migrationDammV2()
      .accountsStrict({
        virtualPool: sourcePool,
        migrationMetadata: deriveDammV2MigrationMetadataAddress(sourcePool),
        config: state.config,
        poolAuthority: deriveDbcPoolAuthority(),
        pool,
        firstPositionNftMint,
        firstPosition: derivePositionAddress(firstPositionNftMint),
        firstPositionNftAccount: derivePositionNftAccount(firstPositionNftMint),
        secondPositionNftMint,
        secondPosition: derivePositionAddress(secondPositionNftMint),
        secondPositionNftAccount: derivePositionNftAccount(
          secondPositionNftMint,
        ),
        dammPoolAuthority: deriveDammV2PoolAuthority(),
        ammProgram: DAMM_V2_PROGRAM_ID,
        baseMint: state.baseMint,
        quoteMint: config.quoteMint,
        tokenAVault: deriveDammV2TokenVaultAddress(pool, state.baseMint),
        tokenBVault: deriveDammV2TokenVaultAddress(pool, config.quoteMint),
        baseVault: state.baseVault,
        quoteVault: state.quoteVault,
        payer: owner,
        tokenBaseProgram:
          config.tokenType === 0 ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID,
        tokenQuoteProgram:
          config.quoteTokenFlag === 0
            ? TOKEN_PROGRAM_ID
            : TOKEN_2022_PROGRAM_ID,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        dammEventAuthority: deriveDammV2EventAuthority(),
      })
      .remainingAccounts([
        { pubkey: dammConfig, isSigner: false, isWritable: false },
      ])
      .instruction();
    return { pool: pool.toBase58(), instructions: [instruction] };
  }

  /** Reads SOL-denominated price, quote reserves and 0–100 curve progress; rejects non-SOL quote markets. */
  async inspect(market: LaunchpadMarket): Promise<LaunchpadObservation> {
    const {
      pool: sourcePool,
      config,
      virtualPool,
    } = await this.marketState(market);
    if (!config.quoteMint.equals(NATIVE_MINT))
      throw new Error(
        "SOL-denominated DBC observation requires a wrapped SOL quote mint",
      );
    const excludedOwners = [
      deriveDbcPoolAuthority().toBase58(),
      deriveDammV2PoolAuthority().toBase58(),
    ];
    const source = virtualPool.poolState;
    if (source.isMigrated) {
      const pool = deriveDammV2PoolAddress(
        this.migrationConfig(config),
        source.baseMint,
        config.quoteMint,
      );
      const state = await this.damm.fetchPoolState(pool);
      const reserve = await this.connection.getTokenAccountBalance(
        state.tokenBVault,
      );
      return {
        pool: pool.toBase58(),
        venue: "Meteora DAMM v2",
        progress: 100,
        priceSol: getPriceFromSqrtPrice(
          state.sqrtPrice,
          config.tokenDecimal,
          9,
        ).toNumber(),
        liquiditySol: Number(reserve.value.amount) / 1e9,
        excludedOwners,
      };
    }
    return {
      pool: sourcePool.toBase58(),
      venue: "Meteora DBC",
      progress:
        100 *
        Math.min(
          1,
          Number(source.quoteReserve.toString()) /
            Number(config.migrationQuoteThreshold.toString()),
        ),
      priceSol: getPriceFromSqrtPrice(
        source.sqrtPrice,
        config.tokenDecimal,
        9,
      ).toNumber(),
      liquiditySol: Number(source.quoteReserve.toString()) / 1e9,
      excludedOwners,
    };
  }
}
