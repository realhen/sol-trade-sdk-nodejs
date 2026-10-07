import BN from "bn.js";
import {
  Keypair,
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
  CpmmConfigInfoLayout,
  CurveCalculator,
  Curve,
  CpmmCreatorFeeOn,
  initializeV2,
  buyExactInInstruction,
  sellExactInInstruction,
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
  makeSwapCpmmBaseInInstruction,
} from "@raydium-io/raydium-sdk-v2";
import type {
  SandboxAdapter,
  SandboxContext,
  SandboxMarket,
  SandboxObservation,
} from "./types";

const ZERO = new BN(0);
/** Applies the sandbox's one-percent slippage tolerance to official SDK output. */
function minimumOutput(quotedOutput: BN): BN {
  const minimum = quotedOutput.muln(99).divn(100);
  if (minimum.isZero())
    throw new Error(
      "Sandbox amount is too small for a positive protected output",
    );
  return minimum;
}

/** Runs genuine LaunchLab and CPMM instructions against a signature-verifying Surfpool bank. */
export class LaunchLabSandbox implements SandboxAdapter {
  private migrationSigner?: Keypair;

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
        "Sandbox LaunchLab requires a loopback or explicitly configured private RPC host",
      );
    }
  }

  /**
   * Authorizes a disposable local signer for the cloned config's permissioned migration.
   * @remarks Only the migration authority changes; original bytes are returned for provenance.
   * This requires Surfpool and never writes through an ordinary Solana RPC.
   */
  async initialize(payer: Keypair): Promise<Record<string, string>> {
    const version = await this.context.connection.getVersion();
    if (!("surfnet-version" in version)) {
      throw new Error(
        "LaunchLab sandbox configuration requires an identified Surfpool RPC",
      );
    }
    const account = await this.requiredAccount(LAUNCHPAD_CONFIG);
    const config = LaunchpadConfig.decode(account.data);
    const originalAuthority = config.migrateToCpmmWallet.toBase58();
    const offset = LaunchpadConfig.offsetOf("migrateToCpmmWallet");
    if (offset < 0)
      throw new Error(
        "LaunchLab SDK migration authority layout is unavailable",
      );
    const data = Buffer.from(account.data);
    payer.publicKey.toBuffer().copy(data, offset);
    const response = await fetch(this.context.connection.rpcEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "surfnet_setAccount",
        params: [LAUNCHPAD_CONFIG.toBase58(), { data: data.toString("hex") }],
      }),
    });
    const result = (await response.json()) as { error?: unknown };
    if (result.error)
      throw new Error(
        `Surfpool migration authority setup failed: ${JSON.stringify(result.error)}`,
      );
    const updated = LaunchpadConfig.decode(
      (await this.requiredAccount(LAUNCHPAD_CONFIG)).data,
    );
    if (!updated.migrateToCpmmWallet.equals(payer.publicKey))
      throw new Error("Sandbox migration authority readback failed");
    this.migrationSigner = payer;
    return {
      config: LAUNCHPAD_CONFIG.toBase58(),
      field: "migrateToCpmmWallet",
      originalAuthority,
      sandboxAuthority: payer.publicKey.toBase58(),
      originalDataBase64: account.data.toString("base64"),
    };
  }

  /** Creates a new fixed-supply mint and real LaunchLab curve using the public Raydium platform. */
  async launch(
    payer: Keypair,
    name: string,
    symbol: string,
  ): Promise<SandboxMarket> {
    if (!this.migrationSigner)
      throw new Error(
        "Initialize the verified Surfpool sandbox before launching",
      );
    const config = LaunchpadConfig.decode(
      (await this.requiredAccount(LAUNCHPAD_CONFIG)).data,
    );
    const platform = PlatformConfig.decode(
      (await this.requiredAccount(LAUNCHPAD_PLATFORM)).data,
    );
    if (
      config.curveType !== 0 ||
      !config.mintB.equals(NATIVE_MINT) ||
      platform.restrictCurveParam ||
      platform.restrictGlobalConfig
    ) {
      throw new Error(
        "Sandbox launch requires the unrestricted SOL constant-product config",
      );
    }
    const mint = Keypair.generate();
    const pool = getPdaLaunchpadPoolId(
      LAUNCHPAD_PROGRAM,
      mint.publicKey,
      NATIVE_MINT,
    ).publicKey;
    const supply = new BN("1000000000000000");
    const totalSellA = new BN("800000000000000");
    const totalFundRaisingB = config.minFundRaisingB;
    Curve.checkParam({
      supply,
      totalSell: totalSellA,
      totalFundRaising: totalFundRaisingB,
      totalLockedAmount: ZERO,
      decimals: 6,
      config,
      migrateType: "cpmm",
    });
    const ix = initializeV2(
      LAUNCHPAD_PROGRAM,
      payer.publicKey,
      payer.publicKey,
      LAUNCHPAD_CONFIG,
      LAUNCHPAD_PLATFORM,
      LAUNCHPAD_AUTH,
      pool,
      mint.publicKey,
      NATIVE_MINT,
      getPdaLaunchpadVaultId(LAUNCHPAD_PROGRAM, pool, mint.publicKey).publicKey,
      getPdaLaunchpadVaultId(LAUNCHPAD_PROGRAM, pool, NATIVE_MINT).publicKey,
      getPdaMetadataKey(mint.publicKey).publicKey,
      TOKEN_PROGRAM_ID,
      6,
      name,
      symbol.slice(0, 10),
      "https://example.com/moixa-sandbox-token.json",
      {
        type: "ConstantCurve",
        supply,
        totalSellA,
        totalFundRaisingB,
        migrateType: "cpmm",
      },
      ZERO,
      ZERO,
      ZERO,
      CpmmCreatorFeeOn.OnlyTokenB,
    );
    const creationSignature = await this.context.send([ix], payer, [mint]);
    await this.requiredAccount(pool);
    return {
      mint: mint.publicKey.toBase58(),
      pool: pool.toBase58(),
      launchpad: "LaunchLab",
      creationSignature,
      config: LAUNCHPAD_CONFIG.toBase58(),
    };
  }

  /** Trades raw quote lamports on buys or raw base units on sells; transactions require a positive output. */
  async trade(
    market: SandboxMarket,
    signer: Keypair,
    side: "buy" | "sell",
    rawAmount: bigint,
  ): Promise<string> {
    if (!this.migrationSigner)
      throw new Error(
        "Initialize the verified Surfpool sandbox before trading",
      );
    if (rawAmount <= 0n)
      throw new Error("Sandbox swap amount must be positive");
    const poolId = this.curveAddress(market);
    const pool = LaunchpadPool.decode(
      (await this.requiredAccount(poolId)).data,
    );
    const mint = pool.mintA;
    const baseAta = getAssociatedTokenAddressSync(mint, signer.publicKey);
    const quoteAta = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      signer.publicKey,
    );
    const instructions = [
      createAssociatedTokenAccountIdempotentInstruction(
        signer.publicKey,
        baseAta,
        signer.publicKey,
        mint,
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        signer.publicKey,
        quoteAta,
        signer.publicKey,
        NATIVE_MINT,
      ),
    ];
    if (side === "buy")
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: signer.publicKey,
          toPubkey: quoteAta,
          lamports: rawAmount,
        }),
        createSyncNativeInstruction(quoteAta),
      );
    const amount = new BN(rawAmount.toString());
    if (pool.status === 2) {
      const cp = await this.cpmmKeys(pool);
      const state = await this.waitForCpmmActivation(cp.poolId);
      const buy = side === "buy";
      const inputIsA = (buy ? NATIVE_MINT : mint).equals(state.mintA);
      const reserves = await this.cpmmReserves(state);
      const config = CpmmConfigInfoLayout.decode(
        (await this.requiredAccount(state.configId)).data,
      );
      const quoted = CurveCalculator.swapBaseInput(
        amount,
        inputIsA ? reserves.a : reserves.b,
        inputIsA ? reserves.b : reserves.a,
        config.tradeFeeRate,
        state.enableCreatorFee ? config.creatorFeeRate : ZERO,
        config.protocolFeeRate,
        config.fundFeeRate,
        state.feeOn === 0 || state.feeOn === (inputIsA ? 1 : 2),
      );
      instructions.push(
        makeSwapCpmmBaseInInstruction(
          CREATE_CPMM_POOL_PROGRAM,
          signer.publicKey,
          CREATE_CPMM_POOL_AUTH,
          state.configId,
          cp.poolId,
          buy ? quoteAta : baseAta,
          buy ? baseAta : quoteAta,
          inputIsA ? state.vaultA : state.vaultB,
          inputIsA ? state.vaultB : state.vaultA,
          TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          buy ? NATIVE_MINT : mint,
          buy ? mint : NATIVE_MINT,
          state.observationId,
          amount,
          minimumOutput(quoted.outputAmount),
        ),
      );
    } else {
      if (pool.status !== 0)
        throw new Error("LaunchLab curve is complete and awaiting migration");
      const config = LaunchpadConfig.decode(
        (await this.requiredAccount(pool.configId)).data,
      );
      const platform = PlatformConfig.decode(
        (await this.requiredAccount(pool.platformId)).data,
      );
      const quoteParams = {
        poolInfo: pool,
        protocolFeeRate: config.tradeFeeRate,
        platformFeeRate: platform.feeRate,
        creatorFeeRate: platform.creatorFeeRate,
        shareFeeRate: ZERO,
        curveType: config.curveType,
        transferFeeConfigA: undefined,
        slot: await this.context.connection.getSlot("confirmed"),
      };
      const expectedOutput =
        side === "buy"
          ? Curve.buyExactIn({ ...quoteParams, amountB: amount }).amountA.amount
          : Curve.sellExactIn({ ...quoteParams, amountA: amount }).amountB;
      const builder =
        side === "buy" ? buyExactInInstruction : sellExactInInstruction;
      instructions.push(
        builder(
          LAUNCHPAD_PROGRAM,
          signer.publicKey,
          LAUNCHPAD_AUTH,
          pool.configId,
          pool.platformId,
          poolId,
          baseAta,
          quoteAta,
          pool.vaultA,
          pool.vaultB,
          mint,
          NATIVE_MINT,
          TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          getPdaPlatformVault(LAUNCHPAD_PROGRAM, pool.platformId, NATIVE_MINT)
            .publicKey,
          getPdaCreatorVault(LAUNCHPAD_PROGRAM, pool.creator, NATIVE_MINT)
            .publicKey,
          amount,
          minimumOutput(expectedOutput),
        ),
      );
    }
    instructions.push(
      createCloseAccountInstruction(
        quoteAta,
        signer.publicKey,
        signer.publicKey,
      ),
    );
    return this.context.send(instructions, signer);
  }

  /** Completes funding with an actual buy, then executes the protocol's permissioned CPMM migration. */
  async migrate(
    market: SandboxMarket,
    signer: Keypair,
  ): Promise<{ pool: string; signature: string }> {
    const authority = this.migrationSigner;
    if (!authority)
      throw new Error("Initialize LaunchLab sandbox migration authority first");
    const poolId = this.curveAddress(market);
    let pool = LaunchpadPool.decode((await this.requiredAccount(poolId)).data);
    if (pool.status === 2) {
      const destination = await this.cpmmKeys(pool);
      await this.waitForCpmmActivation(destination.poolId);
      return {
        pool: destination.poolId.toBase58(),
        signature: "already-migrated",
      };
    }
    if (pool.status === 0) {
      const remaining = BigInt(
        pool.totalFundRaisingB.sub(pool.realB).toString(),
      );
      await this.trade(market, signer, "buy", remaining * 2n + 1_000_000_000n);
      pool = LaunchpadPool.decode((await this.requiredAccount(poolId)).data);
    }
    if (pool.status !== 1)
      throw new Error(
        `LaunchLab migration requires completed curve, received status ${pool.status}`,
      );
    const platform = PlatformConfig.decode(
      (await this.requiredAccount(pool.platformId)).data,
    );
    const cp = await this.cpmmKeys(pool);
    const feeKey = Keypair.generate();
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
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
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
      { pubkey: feeKey.publicKey, isSigner: true, isWritable: true },
      writable(
        getAssociatedTokenAddressSync(
          feeKey.publicKey,
          platform.platformLockNftWallet,
          true,
        ),
      ),
      writable(getCpLockPda(LOCK_CPMM_PROGRAM, feeKey.publicKey).publicKey),
      writable(getPdaMetadataKey(feeKey.publicKey).publicKey),
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
    const signature = await this.context.send(
      [
        new TransactionInstruction({
          programId: LAUNCHPAD_PROGRAM,
          keys,
          data: Buffer.from([136, 92, 200, 103, 28, 218, 144, 140]),
        }),
      ],
      authority,
      [feeKey],
    );
    const migrated = LaunchpadPool.decode(
      (await this.requiredAccount(poolId)).data,
    );
    if (migrated.status !== 2)
      throw new Error("LaunchLab migration did not reach migrated status");
    await this.waitForCpmmActivation(cp.poolId);
    return { pool: cp.poolId.toBase58(), signature };
  }

  /** Reads curve progress or migrated CPMM vault reserves directly from confirmed local chain accounts. */
  async inspect(market: SandboxMarket): Promise<SandboxObservation> {
    const pool = LaunchpadPool.decode(
      (await this.requiredAccount(this.curveAddress(market))).data,
    );
    const excludedOwners = [
      LAUNCHPAD_AUTH.toBase58(),
      CREATE_CPMM_POOL_AUTH.toBase58(),
      LOCK_CPMM_AUTH.toBase58(),
    ];
    if (pool.status === 2) {
      const cp = await this.cpmmKeys(pool);
      const state = CpmmPoolInfoLayout.decode(
        (await this.requiredAccount(cp.poolId)).data,
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
      (await this.requiredAccount(pool.configId)).data,
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

  /** Waits at most six seconds for the real bank Clock to reach CPMM's migration activation time. */
  private async waitForCpmmActivation(
    poolId: PublicKey,
  ): Promise<ReturnType<typeof CpmmPoolInfoLayout.decode>> {
    const deadline = Date.now() + 6000;
    for (;;) {
      const accounts = await this.context.connection.getMultipleAccountsInfo(
        [poolId, SYSVAR_CLOCK_PUBKEY],
        "confirmed",
      );
      if (!accounts[0] || !accounts[1] || accounts[1].data.length < 40)
        throw new Error("CPMM activation state or bank Clock is unavailable");
      const state = CpmmPoolInfoLayout.decode(accounts[0].data);
      if ((state.status & 4) !== 0)
        throw new Error("CPMM swaps are disabled by the pool status");
      const now = accounts[1].data.readBigInt64LE(32);
      const opensAt = BigInt(state.openTime.toString());
      if (now > opensAt) return state;
      if (Date.now() >= deadline)
        throw new Error(
          `CPMM is not active: bank time ${now} has not reached opening time ${opensAt}`,
        );
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
  }

  private async cpmmReserves(
    state: ReturnType<typeof CpmmPoolInfoLayout.decode>,
  ) {
    const infos = await this.context.connection.getMultipleAccountsInfo(
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

  private curveAddress(market: SandboxMarket): PublicKey {
    return getPdaLaunchpadPoolId(
      LAUNCHPAD_PROGRAM,
      new PublicKey(market.mint),
      NATIVE_MINT,
    ).publicKey;
  }

  private async cpmmKeys(pool: ReturnType<typeof LaunchpadPool.decode>) {
    const platform = PlatformConfig.decode(
      (await this.requiredAccount(pool.platformId)).data,
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

  private async requiredAccount(address: PublicKey) {
    const account = await this.context.connection.getAccountInfo(
      address,
      "confirmed",
    );
    if (!account)
      throw new Error(
        `Missing sandbox fixture or protocol account ${address.toBase58()}`,
      );
    return account;
  }
}
