/**
 * DEX parameters — RPC loaders aligned with Rust `src/trading/core/params.rs`
 */

import { PublicKey, Connection } from '@solana/web3.js';
import { unpackMint } from '@solana/spl-token';
import {
  TOKEN_PROGRAM,
  TOKEN_PROGRAM_2022,
  WSOL_TOKEN_ACCOUNT,
  USD1_TOKEN_ACCOUNT,
  BONK_PROGRAM,
} from '../constants';
import {
  getBondingCurvePda,
  getCreatorVaultPda,
  PUMPFUN_PROGRAM_ID,
} from '../instruction/pumpfun_builder';
import {
  findByMint as findPumpSwapPoolByMint,
  fetchPool as fetchPumpSwapPool,
  getTokenBalances as getPumpSwapTokenBalances,
  getAssociatedTokenAddress as getPumpSwapAta,
  getCoinCreatorVaultAta,
  getCoinCreatorVaultAuthority,
  fetchFeeConfig as fetchPumpSwapFeeConfig,
  computePumpSwapFeeBasisPoints,
  type PumpSwapPool,
} from '../instruction/pumpswap';
import { normalizeNativeMint, validatePoolTokenProgram } from '../instruction/mint-pair';
import { effectiveQuoteReserves, type PumpSwapFeeBasisPoints } from '../calc';
import {
  fetchBonkPoolState,
  getBonkPoolPDA,
  BONK_GLOBAL_CONFIG,
  BONK_USD1_GLOBAL_CONFIG,
} from '../instruction/bonk_builder';
import {
  fetchRaydiumCPMMpoolState,
  getRaydiumCPMMpoolTokenBalances,
} from '../instruction/raydium_cpmm_builder';
import {
  deriveSerumVaultSigner,
  fetchAmmInfo,
  fetchMarketState,
} from '../instruction/raydium_amm_v4_builder';
import { fetchMeteoraPool } from '../instruction/meteora_damm_v2_builder';

/** Maps `Connection` to the minimal RPC shape used by Rust-parity instruction fetch helpers. */
function wrapConnection(connection: Connection) {
  return {
    getAccountInfo: async (pubkey: PublicKey) => {
      const a = await connection.getAccountInfo(pubkey);
      return { value: a ? { data: Buffer.from(a.data), owner: a.owner } : undefined };
    },
    getTokenAccountBalance: (pubkey: PublicKey) =>
      connection.getTokenAccountBalance(pubkey),
    getProgramAccounts: (
      programId: PublicKey,
      config?: Parameters<Connection['getProgramAccounts']>[1]
    ) => connection.getProgramAccounts(programId, config),
  };
}

function decodeMintSupply(data: Buffer): bigint | null {
  if (data.length < 44) return null;
  return data.readBigUInt64LE(36);
}

// ============== Bonding Curve ==============

export interface BondingCurveAccount {
  discriminator: number;
  account: PublicKey;
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  creator: PublicKey;
  isMayhemMode: boolean;
  isCashbackCoin: boolean;
  /** Effective SPL quote mint; legacy native-SOL curves normalize to WSOL. */
  quoteMint?: PublicKey;
}

const PUMP_CURVE_DISCRIMINATOR = Buffer.from([23, 183, 248, 55, 96, 216, 172, 96]);

function effectivePumpQuoteMint(mint: PublicKey = PublicKey.default): PublicKey {
  return mint.equals(PublicKey.default) ? WSOL_TOKEN_ACCOUNT : normalizeNativeMint(mint);
}

function pumpQuoteMintForLayout(mint: PublicKey): PublicKey {
  const effective = effectivePumpQuoteMint(mint);
  return effective.equals(WSOL_TOKEN_ACCOUNT) ? PublicKey.default : effective;
}

function decodePumpFunBondingCurveData(
  data: Buffer,
  bondingCurveAddr: PublicKey
): BondingCurveAccount {
  // Complete legacy prefixes: original (49), creator (81), mayhem (82), cashback (83).
  // Current IDL appends quote_mint at 83; account allocation can include later fields/padding.
  // Source: https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump.json
  if (data.length < 115 && ![49, 81, 82, 83].includes(data.length)) {
    throw new Error('Truncated Pump bonding curve account');
  }
  if (!data.subarray(0, 8).equals(PUMP_CURVE_DISCRIMINATOR)) {
    throw new Error('Invalid Pump bonding curve discriminator');
  }
  const boolAt = (offset: number): boolean => {
    const value = data[offset];
    if (value !== 0 && value !== 1) throw new Error('Invalid Pump bonding curve boolean');
    return value === 1;
  };
  return {
    discriminator: 0,
    account: bondingCurveAddr,
    virtualTokenReserves: data.readBigUInt64LE(8),
    virtualSolReserves: data.readBigUInt64LE(16),
    realTokenReserves: data.readBigUInt64LE(24),
    realSolReserves: data.readBigUInt64LE(32),
    tokenTotalSupply: data.readBigUInt64LE(40),
    complete: boolAt(48),
    creator: data.length >= 81 ? new PublicKey(data.subarray(49, 81)) : PublicKey.default,
    isMayhemMode: data.length >= 82 ? boolAt(81) : false,
    isCashbackCoin: data.length >= 83 ? boolAt(82) : false,
    quoteMint: effectivePumpQuoteMint(data.length >= 115 ? new PublicKey(data.subarray(83, 115)) : undefined),
  };
}

function validatePumpMintAccount(
  mint: PublicKey,
  account: Awaited<ReturnType<Connection['getAccountInfo']>>,
  quote = false,
): PublicKey {
  if (!account || account.executable) throw new Error('Pump mint account not found or invalid');
  validatePoolTokenProgram(mint, account.owner);
  if (quote && !account.owner.equals(TOKEN_PROGRAM)) {
    throw new Error('Pump quote mint requires the classic token program; Token-2022 quotes are unsupported');
  }
  // Validate mint account structure, not merely the program owner. Token-2022
  // extension support still requires separate caller qualification before trading.
  const decoded = unpackMint(mint, account, account.owner);
  if (!decoded.isInitialized) throw new Error('Pump mint account is not initialized');
  return account.owner;
}

export class PumpFunParams {
  constructor(
    public bondingCurve: BondingCurveAccount,
    public associatedBondingCurve: PublicKey,
    public creatorVault: PublicKey,
    public tokenProgram: PublicKey,
    public closeTokenAccountWhenSell?: boolean,
    /** Non-native quotes select V2; native aliases preserve the legacy layout. */
    public quoteMint: PublicKey = bondingCurve.quoteMint ?? PublicKey.default
  ) {
    this.quoteMint = pumpQuoteMintForLayout(quoteMint);
  }

  static immediateSell(
    creatorVault: PublicKey,
    tokenProgram: PublicKey,
    closeTokenAccountWhenSell: boolean = false
  ): PumpFunParams {
    return new PumpFunParams(
      {
        discriminator: 0,
        account: PublicKey.default,
        virtualTokenReserves: BigInt(0),
        virtualSolReserves: BigInt(0),
        realTokenReserves: BigInt(0),
        realSolReserves: BigInt(0),
        tokenTotalSupply: BigInt(0),
        complete: false,
        creator: PublicKey.default,
        isMayhemMode: false,
        isCashbackCoin: false,
      },
      PublicKey.default,
      creatorVault,
      tokenProgram,
      closeTokenAccountWhenSell
    );
  }

  static fromTrade(params: {
    bondingCurve: PublicKey;
    associatedBondingCurve: PublicKey;
    mint: PublicKey;
    creator: PublicKey;
    creatorVault: PublicKey;
    virtualTokenReserves: bigint;
    virtualSolReserves: bigint;
    realTokenReserves: bigint;
    realSolReserves: bigint;
    closeTokenAccountWhenSell?: boolean;
    feeRecipient: PublicKey;
    tokenProgram: PublicKey;
    isCashbackCoin: boolean;
    quoteMint?: PublicKey;
  }): PumpFunParams {
    const isMayhemMode = false;
    return new PumpFunParams(
      {
        discriminator: 0,
        account: params.bondingCurve,
        virtualTokenReserves: params.virtualTokenReserves,
        virtualSolReserves: params.virtualSolReserves,
        realTokenReserves: params.realTokenReserves,
        realSolReserves: params.realSolReserves,
        tokenTotalSupply: BigInt(0),
        complete: false,
        creator: params.creator,
        isMayhemMode,
        isCashbackCoin: params.isCashbackCoin,
        quoteMint: effectivePumpQuoteMint(params.quoteMint),
      },
      params.associatedBondingCurve,
      params.creatorVault,
      params.tokenProgram,
      params.closeTokenAccountWhenSell,
      params.quoteMint
    );
  }

  static async fromMintByRpc(
    connection: Connection,
    mint: PublicKey
  ): Promise<PumpFunParams> {
    const bondingCurveAddr = getBondingCurvePda(mint);
    const accountInfo = await connection.getAccountInfo(bondingCurveAddr);
    if (!accountInfo?.data?.length) {
      throw new Error('Bonding curve account not found');
    }
    if (!accountInfo.owner.equals(PUMPFUN_PROGRAM_ID) || accountInfo.executable) {
      throw new Error('Invalid Pump bonding curve owner');
    }
    const bondingCurve = decodePumpFunBondingCurveData(
      accountInfo.data,
      bondingCurveAddr
    );
    const mintAccount = await connection.getAccountInfo(mint);
    const tokenProgram = validatePumpMintAccount(mint, mintAccount);
    const quoteMint = effectivePumpQuoteMint(bondingCurve.quoteMint);
    if (quoteMint.equals(mint)) throw new Error('Pump base and quote mints must be distinct');
    if (!quoteMint.equals(WSOL_TOKEN_ACCOUNT)) {
      validatePumpMintAccount(quoteMint, await connection.getAccountInfo(quoteMint), true);
    }
    const associatedBondingCurve = getPumpSwapAta(
      bondingCurveAddr,
      mint,
      tokenProgram
    );
    const creatorVault = getCreatorVaultPda(bondingCurve.creator);
    return new PumpFunParams(
      bondingCurve,
      associatedBondingCurve,
      creatorVault,
      tokenProgram,
      undefined,
      quoteMint
    );
  }

  withCreatorVault(vault: PublicKey): PumpFunParams {
    this.creatorVault = vault;
    return this;
  }
}

// ============== PumpSwap Params ==============

export class PumpSwapParams {
  constructor(
    public pool: PublicKey,
    public baseMint: PublicKey,
    public quoteMint: PublicKey,
    public poolBaseTokenAccount: PublicKey,
    public poolQuoteTokenAccount: PublicKey,
    public poolBaseTokenReserves: bigint,
    public poolQuoteTokenReserves: bigint,
    public virtualQuoteReserves: bigint,
    public coinCreatorVaultAta: PublicKey,
    public coinCreatorVaultAuthority: PublicKey,
    public baseTokenProgram: PublicKey,
    public quoteTokenProgram: PublicKey,
    public isMayhemMode: boolean,
    public isCashbackCoin: boolean,
    public coinCreator: PublicKey = PublicKey.default,
    public cashbackFeeBasisPoints: bigint = BigInt(0),
    public feeBasisPoints: PumpSwapFeeBasisPoints = {
      lpFeeBasisPoints: BigInt(25),
      protocolFeeBasisPoints: BigInt(5),
      coinCreatorFeeBasisPoints: coinCreator.equals(PublicKey.default) ? BigInt(0) : BigInt(5),
    },
    public poolCreator: PublicKey = PublicKey.default,
    public baseMintSupply: bigint | null = null
  ) {}

  effectiveQuoteReserves(): bigint {
    return effectiveQuoteReserves(this.poolQuoteTokenReserves, this.virtualQuoteReserves);
  }

  static async fromPoolAddressByRpc(
    connection: Connection,
    poolAddress: PublicKey,
    feeBasisPoints?: PumpSwapFeeBasisPoints
  ): Promise<PumpSwapParams> {
    const pool = await fetchPumpSwapPool(wrapConnection(connection), poolAddress);
    if (!pool) {
      throw new Error('PumpSwap pool account not found or invalid');
    }
    return PumpSwapParams.fromPoolData(connection, poolAddress, pool, feeBasisPoints);
  }

  static async fromMintByRpc(
    connection: Connection,
    mint: PublicKey,
    feeBasisPoints?: PumpSwapFeeBasisPoints
  ): Promise<PumpSwapParams> {
    const rpc = wrapConnection(connection);
    const found = await findPumpSwapPoolByMint(
      { getAccountInfo: rpc.getAccountInfo },
      mint
    );
    if (!found) {
      throw new Error('No pool found for mint');
    }
    return PumpSwapParams.fromPoolData(
      connection,
      found.poolAddress,
      found.pool,
      feeBasisPoints
    );
  }

  private static async fromPoolData(
    connection: Connection,
    poolAddress: PublicKey,
    pool: PumpSwapPool,
    feeBasisPointsOverride?: PumpSwapFeeBasisPoints
  ): Promise<PumpSwapParams> {
    const balances = await getPumpSwapTokenBalances(wrapConnection(connection), pool);
    if (!balances) {
      throw new Error('Failed to read pool token balances');
    }
    const baseAtaTp = getPumpSwapAta(
      poolAddress,
      pool.baseMint,
      TOKEN_PROGRAM
    );
    const quoteAtaTp = getPumpSwapAta(
      poolAddress,
      pool.quoteMint,
      TOKEN_PROGRAM
    );
    const baseTokenProgram = pool.poolBaseTokenAccount.equals(baseAtaTp)
      ? TOKEN_PROGRAM
      : TOKEN_PROGRAM_2022;
    const quoteTokenProgram = pool.poolQuoteTokenAccount.equals(quoteAtaTp)
      ? TOKEN_PROGRAM
      : TOKEN_PROGRAM_2022;
    const rpc = wrapConnection(connection);
    const mintAccount = await rpc.getAccountInfo(pool.baseMint).catch(() => undefined);
    const baseMintSupply = mintAccount?.value?.data
      ? decodeMintSupply(Buffer.from(mintAccount.value.data))
      : null;
    const effectiveQuoteBalance = effectiveQuoteReserves(
      balances.quoteBalance,
      pool.virtualQuoteReserves
    );
    const rawFeeBasisPoints = feeBasisPointsOverride ?? computePumpSwapFeeBasisPoints(
      await fetchPumpSwapFeeConfig(rpc).catch(() => null),
      pool.creator,
      pool.baseMint,
      baseMintSupply,
      balances.baseBalance,
      effectiveQuoteBalance
    );
    const feeBasisPoints = {
      ...rawFeeBasisPoints,
      coinCreatorFeeBasisPoints: pool.coinCreator.equals(PublicKey.default)
        ? BigInt(0)
        : rawFeeBasisPoints.coinCreatorFeeBasisPoints,
    };
    return new PumpSwapParams(
      poolAddress,
      pool.baseMint,
      pool.quoteMint,
      pool.poolBaseTokenAccount,
      pool.poolQuoteTokenAccount,
      balances.baseBalance,
      balances.quoteBalance,
      pool.virtualQuoteReserves,
      getCoinCreatorVaultAta(pool.coinCreator, pool.quoteMint, quoteTokenProgram),
      getCoinCreatorVaultAuthority(pool.coinCreator),
      baseTokenProgram,
      quoteTokenProgram,
      pool.isMayhemMode,
      pool.isCashbackCoin,
      pool.coinCreator,
      BigInt(0),
      feeBasisPoints,
      pool.creator,
      baseMintSupply
    );
  }
}

// ============== Bonk Params ==============

function bonkPlatformAssociatedAccount(platformConfig: PublicKey, quoteMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [platformConfig.toBuffer(), quoteMint.toBuffer()],
    BONK_PROGRAM
  );
  return pda;
}

function bonkCreatorAssociatedAccount(creator: PublicKey, quoteMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [creator.toBuffer(), quoteMint.toBuffer()],
    BONK_PROGRAM
  );
  return pda;
}

export class BonkParams {
  constructor(
    public virtualBase: bigint,
    public virtualQuote: bigint,
    public realBase: bigint,
    public realQuote: bigint,
    public poolState: PublicKey,
    public baseVault: PublicKey,
    public quoteVault: PublicKey,
    public mintTokenProgram: PublicKey,
    public platformConfig: PublicKey,
    public platformAssociatedAccount: PublicKey,
    public creatorAssociatedAccount: PublicKey,
    public globalConfig: PublicKey,
    public baseMint?: PublicKey,
    public quoteMint?: PublicKey,
    public quoteTokenProgram?: PublicKey
  ) {}

  static async fromMintByRpc(
    connection: Connection,
    mint: PublicKey,
    quote: boolean | PublicKey = false
  ): Promise<BonkParams> {
    const quoteMint = typeof quote === 'boolean'
      ? (quote ? USD1_TOKEN_ACCOUNT : WSOL_TOKEN_ACCOUNT)
      : normalizeNativeMint(quote);
    const poolAddress = getBonkPoolPDA(mint, quoteMint);
    const params = await BonkParams.fromPoolByRpc(connection, poolAddress);
    if (!params.baseMint?.equals(mint) || !params.quoteMint?.equals(quoteMint)) {
      throw new Error('Bonk pool does not match the requested mint pair');
    }
    return params;
  }

  /** Load the exact selected pool, including its quote mint and token program. */
  static async fromPoolByRpc(connection: Connection, poolAddress: PublicKey): Promise<BonkParams> {
    const poolAccount = await connection.getAccountInfo(poolAddress);
    if (!poolAccount?.owner.equals(BONK_PROGRAM)) throw new Error('Invalid Bonk pool owner');
    const poolData = await fetchBonkPoolState({ getAccountInfo: async () => ({ value: { data: Buffer.from(poolAccount.data) } }) }, poolAddress);
    if (!poolData || poolData.baseMint.equals(poolData.quoteMint) ||
        !getBonkPoolPDA(poolData.baseMint, poolData.quoteMint).equals(poolAddress)) {
      throw new Error('Invalid Bonk pool mint pair or address');
    }
    if (poolData.globalConfig.equals(PublicKey.default) ||
        (poolData.globalConfig.equals(BONK_GLOBAL_CONFIG) && !poolData.quoteMint.equals(WSOL_TOKEN_ACCOUNT)) ||
        (poolData.globalConfig.equals(BONK_USD1_GLOBAL_CONFIG) && !poolData.quoteMint.equals(USD1_TOKEN_ACCOUNT))) {
      throw new Error('Invalid Bonk global config for pool quote mint');
    }
    const [baseAccount, quoteAccount] = await Promise.all([
      connection.getAccountInfo(poolData.baseMint), connection.getAccountInfo(poolData.quoteMint),
    ]);
    if (!baseAccount || !quoteAccount) throw new Error('Bonk pool mint account missing');
    const mintTokenProgram = baseAccount.owner;
    validatePoolTokenProgram(poolData.baseMint, mintTokenProgram);
    validatePoolTokenProgram(poolData.quoteMint, quoteAccount.owner);
    return new BonkParams(
      poolData.virtualBase,
      poolData.virtualQuote,
      poolData.realBase,
      poolData.realQuote,
      poolAddress,
      poolData.baseVault,
      poolData.quoteVault,
      mintTokenProgram,
      poolData.platformConfig,
      bonkPlatformAssociatedAccount(poolData.platformConfig, poolData.quoteMint),
      bonkCreatorAssociatedAccount(poolData.creator, poolData.quoteMint),
      poolData.globalConfig,
      poolData.baseMint,
      poolData.quoteMint,
      quoteAccount.owner
    );
  }
}

// ============== Raydium Params ==============

export class RaydiumCpmmParams {
  constructor(
    public poolState: PublicKey,
    public ammConfig: PublicKey,
    public baseMint: PublicKey,
    public quoteMint: PublicKey,
    public baseReserve: bigint,
    public quoteReserve: bigint,
    public baseVault: PublicKey,
    public quoteVault: PublicKey,
    public baseTokenProgram: PublicKey,
    public quoteTokenProgram: PublicKey,
    public observationState: PublicKey
  ) {}

  static async fromPoolAddressByRpc(
    connection: Connection,
    poolAddress: PublicKey
  ): Promise<RaydiumCpmmParams> {
    const pool = await fetchRaydiumCPMMpoolState(wrapConnection(connection), poolAddress);
    if (!pool) {
      throw new Error('Raydium CPMM pool not found');
    }
    const bal = await getRaydiumCPMMpoolTokenBalances(
      wrapConnection(connection),
      poolAddress,
      pool.token0Mint,
      pool.token1Mint
    );
    if (!bal) {
      throw new Error('Failed to read Raydium CPMM vault balances');
    }
    return new RaydiumCpmmParams(
      poolAddress,
      pool.ammConfig,
      pool.token0Mint,
      pool.token1Mint,
      bal.token0Balance,
      bal.token1Balance,
      pool.token0Vault,
      pool.token1Vault,
      pool.token0Program,
      pool.token1Program,
      pool.observationKey
    );
  }
}

export class RaydiumAmmV4Params {
  constructor(
    public amm: PublicKey,
    public coinMint: PublicKey,
    public pcMint: PublicKey,
    public tokenCoin: PublicKey,
    public tokenPc: PublicKey,
    public ammOpenOrders: PublicKey,
    public ammTargetOrders: PublicKey,
    public serumProgram: PublicKey,
    public serumMarket: PublicKey,
    public serumBids: PublicKey,
    public serumAsks: PublicKey,
    public serumEventQueue: PublicKey,
    public serumCoinVaultAccount: PublicKey,
    public serumPcVaultAccount: PublicKey,
    public serumVaultSigner: PublicKey,
    public coinReserve: bigint,
    public pcReserve: bigint
  ) {}

  static async fromAmmAddressByRpc(
    connection: Connection,
    amm: PublicKey
  ): Promise<RaydiumAmmV4Params> {
    const ammInfo = await fetchAmmInfo(wrapConnection(connection), amm);
    if (!ammInfo) {
      throw new Error('Raydium AMM account not found');
    }
    const marketState = await fetchMarketState(wrapConnection(connection), ammInfo.market);
    if (!marketState) {
      throw new Error('Raydium AMM market account not found');
    }
    const serumVaultSigner = deriveSerumVaultSigner(
      ammInfo.serumDex,
      ammInfo.market,
      marketState.vaultSignerNonce
    );
    const coinBal = await connection.getTokenAccountBalance(ammInfo.tokenCoin);
    const pcBal = await connection.getTokenAccountBalance(ammInfo.tokenPc);
    const coinReserve = BigInt(coinBal.value.amount);
    const pcReserve = BigInt(pcBal.value.amount);
    return new RaydiumAmmV4Params(
      amm,
      ammInfo.coinMint,
      ammInfo.pcMint,
      ammInfo.tokenCoin,
      ammInfo.tokenPc,
      ammInfo.openOrders,
      ammInfo.targetOrders,
      ammInfo.serumDex,
      ammInfo.market,
      marketState.serumBids,
      marketState.serumAsks,
      marketState.serumEventQueue,
      marketState.serumCoinVaultAccount,
      marketState.serumPcVaultAccount,
      serumVaultSigner,
      coinReserve,
      pcReserve
    );
  }
}

export class MeteoraDammV2Params {
  constructor(
    public pool: PublicKey,
    public tokenAVault: PublicKey,
    public tokenBVault: PublicKey,
    public tokenAMint: PublicKey,
    public tokenBMint: PublicKey,
    public tokenAProgram: PublicKey,
    public tokenBProgram: PublicKey
  ) {}

  static async fromPoolAddressByRpc(
    connection: Connection,
    poolAddress: PublicKey
  ): Promise<MeteoraDammV2Params> {
    const poolData = await fetchMeteoraPool(wrapConnection(connection), poolAddress);
    if (!poolData) {
      throw new Error('Meteora DAMM V2 pool not found');
    }
    const [mintA, mintB] = await Promise.all([
      connection.getAccountInfo(poolData.tokenAMint),
      connection.getAccountInfo(poolData.tokenBMint),
    ]);
    if (!mintA || !mintB) throw new Error('Meteora DAMM V2 mint account missing');
    validatePoolTokenProgram(poolData.tokenAMint, mintA.owner);
    validatePoolTokenProgram(poolData.tokenBMint, mintB.owner);
    return new MeteoraDammV2Params(
      poolAddress,
      poolData.tokenAVault,
      poolData.tokenBVault,
      poolData.tokenAMint,
      poolData.tokenBMint,
      mintA.owner,
      mintB.owner
    );
  }
}
