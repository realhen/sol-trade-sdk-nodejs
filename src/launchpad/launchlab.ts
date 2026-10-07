import BN from "bn.js";
import {
  type Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_CLOCK_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  unpackAccount,
} from "@solana/spl-token";
import {
  LAUNCHPAD_PROGRAM,
  LAUNCHPAD_AUTH,
  LAUNCHPAD_CONFIG,
  LAUNCHPAD_PLATFORM,
  CREATE_CPMM_POOL_PROGRAM,
  CREATE_CPMM_POOL_AUTH,
  CREATE_CPMM_POOL_FEE_ACC,
  LOCK_CPMM_PROGRAM,
  LOCK_CPMM_AUTH,
  METADATA_PROGRAM_ID,
  LaunchpadConfig,
  LaunchpadPool,
  PlatformConfig,
  CpmmPoolInfoLayout,
  Curve,
  CpmmCreatorFeeOn,
  initializeV2,
  buyExactOutInstruction,
  getPdaLaunchpadPoolId,
  getPdaLaunchpadVaultId,
  getPdaMetadataKey,
  getPdaPlatformVault,
  getPdaCreatorVault,
  getCreatePoolKeys,
  getPdaPermissionId,
  getCpLockPda,
  getPdaMintExAccountCp,
  getPdaVault,
  getPdaPlatformAllowConfig,
  getPdaPlatformCurveRule,
} from "@raydium-io/raydium-sdk-v2";
import type { LaunchpadMarket, LaunchpadObservation } from "./types";

const ZERO = new BN(0);
/** Canonical Raydium SOL constant-product global configuration. */
export const DEFAULT_LAUNCHLAB_CONFIG = LAUNCHPAD_CONFIG;
/** Canonical Raydium LaunchLab platform configuration. */
export const DEFAULT_LAUNCHLAB_PLATFORM = LAUNCHPAD_PLATFORM;
/** Decoded protocol configuration; integer amounts use the official SDK's BN representation. */
export type LaunchLabConfigState = ReturnType<typeof LaunchpadConfig.decode>;

/** Binary GlobalConfig codec. Encoding preserves discriminator and reserved bytes from the supplied account. */
export const LaunchLabConfigCodec = {
  decode(data: Uint8Array): LaunchLabConfigState {
    if (data.length < LaunchpadConfig.span)
      throw new Error("LaunchLab config data is truncated");
    return LaunchpadConfig.decode(Buffer.from(data));
  },
  encode(config: LaunchLabConfigState, originalData: Uint8Array): Buffer {
    if (originalData.length < LaunchpadConfig.span)
      throw new Error("LaunchLab config data is truncated");
    const data = Buffer.from(originalData);
    LaunchpadConfig.encode(config, data);
    return data;
  },
};

/** Explicit launch parameters. Amounts are raw base units or quote lamports; payer and mint must sign. */
export interface LaunchLabLaunchOptions {
  payer: PublicKey;
  mint: PublicKey;
  creator?: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  config: PublicKey;
  platform: PublicKey;
  supply: bigint;
  totalSell: bigint;
  totalFundRaising: bigint;
  decimals: number;
  totalLockedAmount?: bigint;
  cliffPeriod?: bigint;
  unlockPeriod?: bigint;
  creatorFeeOn?: "quote" | "both";
}

/** Fee-key mint must be a fresh key signed by the caller; migration authority defaults to owner. */
export interface LaunchLabMigrationOptions {
  feeKey: PublicKey;
  migrationAuthority?: PublicKey;
}

/** Confirmed migration and trading readiness; Unix times are seconds from the bank's Clock account. */
export interface LaunchLabState {
  curveStatus: number;
  migrationReady: boolean;
  migrationAuthority: string;
  config: string;
  platform: string;
  destinationPool: string;
  cpmmStatus: number | null;
  openTime: bigint | null;
  bankTime: bigint;
  tradeReady: boolean;
}

/** Unsigned lifecycle builders for legacy SPL-token LaunchLab launches quoted in SOL. Signing and submission belong to the caller. */
export class LaunchLabClient {
  constructor(private readonly connection: Connection) {}

  /** Builds mint and curve creation; the caller must sign with payer and the fresh mint key. */
  async buildLaunch(options: LaunchLabLaunchOptions): Promise<{
    market: LaunchpadMarket;
    instructions: TransactionInstruction[];
  }> {
    const config = LaunchpadConfig.decode(
      (await this.requiredAccount(options.config, LAUNCHPAD_PROGRAM)).data,
    );
    const platform = PlatformConfig.decode(
      (await this.requiredAccount(options.platform, LAUNCHPAD_PROGRAM)).data,
    );
    if (!config.mintB.equals(NATIVE_MINT))
      throw new Error(
        "LaunchLabClient currently supports SOL-quoted launches only",
      );
    if (config.curveType !== 0)
      throw new Error(
        "LaunchLabClient currently builds constant-product launches only",
      );
    if (!options.uri || options.symbol.length > 10)
      throw new Error(
        "LaunchLab requires a URI and a symbol of at most ten characters",
      );
    const supply = unsignedAmount(options.supply, "supply");
    const totalSellA = unsignedAmount(options.totalSell, "totalSell");
    const totalFundRaisingB = unsignedAmount(
      options.totalFundRaising,
      "totalFundRaising",
    );
    const totalLockedAmount = unsignedAmount(
      options.totalLockedAmount ?? 0n,
      "totalLockedAmount",
    );
    const cliffPeriod = unsignedAmount(
      options.cliffPeriod ?? 0n,
      "cliffPeriod",
    );
    const unlockPeriod = unsignedAmount(
      options.unlockPeriod ?? 0n,
      "unlockPeriod",
    );
    Curve.checkParam({
      supply,
      totalSell: totalSellA,
      totalFundRaising: totalFundRaisingB,
      totalLockedAmount,
      decimals: options.decimals,
      config,
      migrateType: "cpmm",
    });
    const pool = getPdaLaunchpadPoolId(
      LAUNCHPAD_PROGRAM,
      options.mint,
      NATIVE_MINT,
    ).publicKey;
    const instruction = initializeV2(
      LAUNCHPAD_PROGRAM,
      options.payer,
      options.creator ?? options.payer,
      options.config,
      options.platform,
      LAUNCHPAD_AUTH,
      pool,
      options.mint,
      NATIVE_MINT,
      getPdaLaunchpadVaultId(LAUNCHPAD_PROGRAM, pool, options.mint).publicKey,
      getPdaLaunchpadVaultId(LAUNCHPAD_PROGRAM, pool, NATIVE_MINT).publicKey,
      getPdaMetadataKey(options.mint).publicKey,
      TOKEN_PROGRAM_ID,
      options.decimals,
      options.name,
      options.symbol,
      options.uri,
      {
        type: "ConstantCurve",
        supply,
        totalSellA,
        totalFundRaisingB,
        migrateType: "cpmm",
      },
      totalLockedAmount,
      cliffPeriod,
      unlockPeriod,
      options.creatorFeeOn === "both"
        ? CpmmCreatorFeeOn.BothToken
        : CpmmCreatorFeeOn.OnlyTokenB,
      platform.restrictGlobalConfig
        ? getPdaPlatformAllowConfig(
            LAUNCHPAD_PROGRAM,
            options.platform,
            options.config,
          ).publicKey
        : undefined,
      platform.restrictCurveParam
        ? getPdaPlatformCurveRule(
            LAUNCHPAD_PROGRAM,
            options.platform,
            options.config,
          ).publicKey
        : undefined,
    );
    return {
      market: {
        mint: options.mint.toBase58(),
        pool: pool.toBase58(),
        launchpad: "LaunchLab",
        config: options.config.toBase58(),
      },
      instructions: [instruction],
    };
  }

  /**
   * Buys exactly the remaining curve supply using the official fee-inclusive exact-output quote.
   * @param slippageBps - Maximum input tolerance, integer basis points from zero through 10,000.
   * @returns Unsigned instructions, or an empty array when funding is already complete.
   * @remarks Creates and closes a new WSOL ATA; an existing WSOL account is preserved and funded only for a shortfall.
   * A later curve change may make the quote stale; callers own refresh/retry policy.
   */
  async buildCompletion(
    market: LaunchpadMarket,
    owner: PublicKey,
    slippageBps: number,
  ): Promise<TransactionInstruction[]> {
    if (
      !Number.isInteger(slippageBps) ||
      slippageBps < 0 ||
      slippageBps > 10000
    )
      throw new Error("slippageBps must be an integer from zero through 10000");
    const poolId = this.curveAddress(market);
    const pool = await this.readCurve(poolId);
    if (pool.status === 1 || pool.status === 2) return [];
    if (pool.status !== 0) throw new Error("Unsupported LaunchLab pool status");
    const remaining = pool.totalSellA.sub(pool.realA);
    if (remaining.lten(0))
      throw new Error("Funding pool has no remaining curve supply");
    const config = LaunchpadConfig.decode(
      (await this.requiredAccount(pool.configId, LAUNCHPAD_PROGRAM)).data,
    );
    const platform = PlatformConfig.decode(
      (await this.requiredAccount(pool.platformId, LAUNCHPAD_PROGRAM)).data,
    );
    const quote = Curve.buyExactOut({
      poolInfo: pool,
      amountA: remaining,
      protocolFeeRate: config.tradeFeeRate,
      platformFeeRate: platform.feeRate,
      creatorFeeRate: platform.creatorFeeRate,
      shareFeeRate: ZERO,
      curveType: config.curveType,
      transferFeeConfigA: undefined,
      slot: await this.connection.getSlot("confirmed"),
    });
    const maxInput = quote.amountB
      .muln(10000 + slippageBps)
      .addn(9999)
      .divn(10000);
    unsignedAmount(BigInt(maxInput.toString()), "completion maximum input");
    const baseAta = getAssociatedTokenAddressSync(pool.mintA, owner);
    const quoteAta = getAssociatedTokenAddressSync(NATIVE_MINT, owner);
    const existingQuote = await this.connection.getAccountInfo(
      quoteAta,
      "confirmed",
    );
    let balance = 0n;
    if (existingQuote) {
      const token = unpackAccount(quoteAta, existingQuote, TOKEN_PROGRAM_ID);
      if (
        !token.owner.equals(owner) ||
        !token.mint.equals(NATIVE_MINT) ||
        !token.isNative ||
        token.isFrozen
      )
        throw new Error("Existing WSOL account cannot fund completion");
      balance = token.amount;
    }
    const instructions = [
      createAssociatedTokenAccountIdempotentInstruction(
        owner,
        baseAta,
        owner,
        pool.mintA,
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        owner,
        quoteAta,
        owner,
        NATIVE_MINT,
      ),
    ];
    const shortfall = BigInt(maxInput.toString()) - balance;
    if (shortfall > 0n)
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: owner,
          toPubkey: quoteAta,
          lamports: shortfall,
        }),
        createSyncNativeInstruction(quoteAta),
      );
    instructions.push(
      buyExactOutInstruction(
        LAUNCHPAD_PROGRAM,
        owner,
        LAUNCHPAD_AUTH,
        pool.configId,
        pool.platformId,
        poolId,
        baseAta,
        quoteAta,
        pool.vaultA,
        pool.vaultB,
        pool.mintA,
        NATIVE_MINT,
        TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        getPdaPlatformVault(LAUNCHPAD_PROGRAM, pool.platformId, NATIVE_MINT)
          .publicKey,
        getPdaCreatorVault(LAUNCHPAD_PROGRAM, pool.creator, NATIVE_MINT)
          .publicKey,
        remaining,
        maxInput,
      ),
    );
    if (!existingQuote)
      instructions.push(createCloseAccountInstruction(quoteAta, owner, owner));
    return instructions;
  }

  /** Builds only the permissioned migration; the configured migration authority and fee-key mint must sign. */
  async buildMigration(
    market: LaunchpadMarket,
    owner: PublicKey,
    options: LaunchLabMigrationOptions,
  ): Promise<{ pool: string; instructions: TransactionInstruction[] }> {
    const poolId = this.curveAddress(market);
    const pool = await this.readCurve(poolId);
    const cp = await this.cpmmKeys(pool);
    if (pool.status === 2) {
      await this.requiredAccount(cp.poolId, CREATE_CPMM_POOL_PROGRAM);
      return { pool: cp.poolId.toBase58(), instructions: [] };
    }
    if (pool.status !== 1)
      throw new Error("LaunchLab migration requires completed curve funding");
    const config = LaunchpadConfig.decode(
      (await this.requiredAccount(pool.configId, LAUNCHPAD_PROGRAM)).data,
    );
    const authority = options.migrationAuthority ?? owner;
    if (!config.migrateToCpmmWallet.equals(authority))
      throw new Error(
        `LaunchLab migration requires authority ${config.migrateToCpmmWallet.toBase58()}`,
      );
    const platform = PlatformConfig.decode(
      (await this.requiredAccount(pool.platformId, LAUNCHPAD_PROGRAM)).data,
    );
    const permission = getPdaPermissionId(
      CREATE_CPMM_POOL_PROGRAM,
      LAUNCHPAD_AUTH,
    ).publicKey;
    const readonly = (pubkey: PublicKey) => ({
      pubkey,
      isSigner: false,
      isWritable: false,
    });
    const writable = (pubkey: PublicKey) => ({
      pubkey,
      isSigner: false,
      isWritable: true,
    });
    // The deployed 2026-09 contract makes the base mint writable and moves permission to remaining accounts.
    const keys = [
      { pubkey: authority, isSigner: true, isWritable: true },
      writable(pool.mintA),
      readonly(NATIVE_MINT),
      readonly(pool.platformId),
      readonly(CREATE_CPMM_POOL_PROGRAM),
      writable(cp.poolId),
      readonly(cp.authority),
      writable(cp.lpMint),
      writable(
        getPdaVault(CREATE_CPMM_POOL_PROGRAM, cp.poolId, pool.mintA).publicKey,
      ),
      writable(
        getPdaVault(CREATE_CPMM_POOL_PROGRAM, cp.poolId, NATIVE_MINT).publicKey,
      ),
      readonly(platform.cpConfigId),
      writable(CREATE_CPMM_POOL_FEE_ACC),
      writable(cp.observationId),
      readonly(LOCK_CPMM_PROGRAM),
      readonly(LOCK_CPMM_AUTH),
      writable(getAssociatedTokenAddressSync(cp.lpMint, LOCK_CPMM_AUTH, true)),
      writable(LAUNCHPAD_AUTH),
      writable(poolId),
      readonly(pool.configId),
      writable(pool.vaultA),
      writable(pool.vaultB),
      writable(getAssociatedTokenAddressSync(cp.lpMint, LAUNCHPAD_AUTH, true)),
      readonly(TOKEN_PROGRAM_ID),
      readonly(TOKEN_2022_PROGRAM_ID),
      readonly(ASSOCIATED_TOKEN_PROGRAM_ID),
      readonly(SystemProgram.programId),
      readonly(SYSVAR_RENT_PUBKEY),
      readonly(METADATA_PROGRAM_ID),
      readonly(platform.platformLockNftWallet),
      { pubkey: options.feeKey, isSigner: true, isWritable: true },
      writable(
        getAssociatedTokenAddressSync(
          options.feeKey,
          platform.platformLockNftWallet,
          true,
        ),
      ),
      writable(getCpLockPda(LOCK_CPMM_PROGRAM, options.feeKey).publicKey),
      writable(getPdaMetadataKey(options.feeKey).publicKey),
      readonly(pool.creator),
      readonly(permission),
      readonly(platform.platformCpCreator),
      readonly(
        getPdaMintExAccountCp(CREATE_CPMM_POOL_PROGRAM, cp.mint0).publicKey,
      ),
      readonly(
        getPdaMintExAccountCp(CREATE_CPMM_POOL_PROGRAM, cp.mint1).publicKey,
      ),
    ];
    return {
      pool: cp.poolId.toBase58(),
      instructions: [
        new TransactionInstruction({
          programId: LAUNCHPAD_PROGRAM,
          keys,
          data: Buffer.from([136, 92, 200, 103, 28, 218, 144, 140]),
        }),
      ],
    };
  }

  /** Reads protocol readiness once; activation polling and deadlines remain the caller's responsibility. */
  async readState(market: LaunchpadMarket): Promise<LaunchLabState> {
    const pool = await this.readCurve(this.curveAddress(market));
    const config = LaunchpadConfig.decode(
      (await this.requiredAccount(pool.configId, LAUNCHPAD_PROGRAM)).data,
    );
    const cp = await this.cpmmKeys(pool);
    const accounts = await this.connection.getMultipleAccountsInfo(
      [cp.poolId, SYSVAR_CLOCK_PUBKEY],
      "confirmed",
    );
    if (!accounts[1] || accounts[1].data.length < 40)
      throw new Error("Bank Clock is unavailable");
    const bankTime = accounts[1].data.readBigInt64LE(32);
    let cpmmStatus: number | null = null;
    let openTime: bigint | null = null;
    if (accounts[0]) {
      if (!accounts[0].owner.equals(CREATE_CPMM_POOL_PROGRAM))
        throw new Error("Destination CPMM account has an invalid owner");
      const state = CpmmPoolInfoLayout.decode(accounts[0].data);
      cpmmStatus = state.status;
      openTime = BigInt(state.openTime.toString());
    }
    return {
      curveStatus: pool.status,
      migrationReady: pool.status === 1,
      migrationAuthority: config.migrateToCpmmWallet.toBase58(),
      config: pool.configId.toBase58(),
      platform: pool.platformId.toBase58(),
      destinationPool: cp.poolId.toBase58(),
      cpmmStatus,
      openTime,
      bankTime,
      tradeReady:
        pool.status === 0 ||
        (pool.status === 2 &&
          cpmmStatus !== null &&
          (cpmmStatus & 4) === 0 &&
          openTime !== null &&
          bankTime >= openTime),
    };
  }

  /** Reads curve progress or migrated CPMM vault reserves directly from confirmed local chain accounts. */
  async inspect(market: LaunchpadMarket): Promise<LaunchpadObservation> {
    const pool = LaunchpadPool.decode(
      (await this.requiredAccount(this.curveAddress(market), LAUNCHPAD_PROGRAM))
        .data,
    );
    const excludedOwners = [
      LAUNCHPAD_AUTH.toBase58(),
      CREATE_CPMM_POOL_AUTH.toBase58(),
      LOCK_CPMM_AUTH.toBase58(),
    ];
    if (pool.status === 2) {
      const cp = await this.cpmmKeys(pool);
      const state = CpmmPoolInfoLayout.decode(
        (await this.requiredAccount(cp.poolId, CREATE_CPMM_POOL_PROGRAM)).data,
      );
      const reserves = await this.cpmmReserves(state);
      const reserveA = BigInt(reserves.a.toString());
      const reserveB = BigInt(reserves.b.toString());
      const base = state.mintA.equals(pool.mintA) ? reserveA : reserveB;
      const quote = state.mintA.equals(NATIVE_MINT) ? reserveA : reserveB;
      return {
        pool: cp.poolId.toBase58(),
        venue: "Raydium CPMM",
        progress: 100,
        priceSol: Number(quote) / Number(base) / 1000,
        liquiditySol: Number(quote) / 1e9,
        excludedOwners,
      };
    }
    const config = LaunchpadConfig.decode(
      (await this.requiredAccount(pool.configId, LAUNCHPAD_PROGRAM)).data,
    );
    return {
      pool: this.curveAddress(market).toBase58(),
      venue: "LaunchLab",
      progress: Math.min(
        100,
        (Number(pool.realB.toString()) /
          Number(pool.totalFundRaisingB.toString())) *
          100,
      ),
      priceSol: Curve.getPrice({
        poolInfo: pool,
        curveType: config.curveType,
        decimalA: pool.mintDecimalsA,
        decimalB: pool.mintDecimalsB,
      }).toNumber(),
      liquiditySol: Number(pool.realB.toString()) / 1e9,
      excludedOwners,
    };
  }

  private async cpmmReserves(
    state: ReturnType<typeof CpmmPoolInfoLayout.decode>,
  ) {
    const infos = await this.connection.getMultipleAccountsInfo(
      [state.vaultA, state.vaultB],
      "confirmed",
    );
    if (!infos[0] || !infos[1])
      throw new Error("CPMM vault accounts are unavailable");
    const a = new BN(infos[0].data.readBigUInt64LE(64).toString())
      .sub(state.protocolFeesMintA)
      .sub(state.fundFeesMintA)
      .sub(state.creatorFeesMintA);
    const b = new BN(infos[1].data.readBigUInt64LE(64).toString())
      .sub(state.protocolFeesMintB)
      .sub(state.fundFeesMintB)
      .sub(state.creatorFeesMintB);
    if (a.lten(0) || b.lten(0))
      throw new Error("CPMM pool has no spendable liquidity");
    return { a, b };
  }

  private curveAddress(market: LaunchpadMarket): PublicKey {
    return getPdaLaunchpadPoolId(
      LAUNCHPAD_PROGRAM,
      new PublicKey(market.mint),
      NATIVE_MINT,
    ).publicKey;
  }

  private async cpmmKeys(pool: ReturnType<typeof LaunchpadPool.decode>) {
    const platform = PlatformConfig.decode(
      (await this.requiredAccount(pool.platformId, LAUNCHPAD_PROGRAM)).data,
    );
    const [mint0, mint1] = [pool.mintA, pool.mintB].sort((a, b) =>
      Buffer.compare(a.toBuffer(), b.toBuffer()),
    );
    return {
      ...getCreatePoolKeys({
        programId: CREATE_CPMM_POOL_PROGRAM,
        configId: platform.cpConfigId,
        mintA: mint0!,
        mintB: mint1!,
      }),
      mint0: mint0!,
      mint1: mint1!,
    };
  }

  private async readCurve(address: PublicKey) {
    const pool = LaunchpadPool.decode(
      (await this.requiredAccount(address, LAUNCHPAD_PROGRAM)).data,
    );
    if (
      !pool.mintB.equals(NATIVE_MINT) ||
      pool.mintProgramFlag !== 0 ||
      pool.migrateType !== 1
    )
      throw new Error(
        "LaunchLabClient requires a legacy SPL-token SOL curve migrating to CPMM",
      );
    return pool;
  }

  private async requiredAccount(address: PublicKey, owner?: PublicKey) {
    const account = await this.connection.getAccountInfo(address, "confirmed");
    if (!account)
      throw new Error(`Missing protocol account ${address.toBase58()}`);
    if (owner && !account.owner.equals(owner))
      throw new Error(
        `Invalid protocol account owner for ${address.toBase58()}`,
      );
    return account;
  }
}

function unsignedAmount(amount: bigint, name: string): BN {
  if (amount < 0n || amount > 0xffffffffffffffffn)
    throw new Error(`${name} must be a u64 amount`);
  return new BN(amount.toString());
}
