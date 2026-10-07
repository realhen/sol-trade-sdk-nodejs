import {
  PublicKey,
  type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  NATIVE_MINT,
} from "@solana/spl-token";
import * as pump from "@pump-fun/pump-sdk";
import * as amm from "@pump-fun/pump-swap-sdk";
import type { LaunchpadMarket, LaunchpadObservation } from "./types";

/** Unsigned parameters for creating a SOL-quoted Pump Token-2022 bonding curve. */
export interface PumpLaunchParameters {
  payer: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  creator?: PublicKey;
  mayhemMode?: boolean;
}

/** Reads Pump protocol state and builds unsigned launch, completion and migration instructions. */
export class PumpLaunchpadClient {
  private readonly online: pump.OnlinePumpSdk;
  private readonly onlineAmm: amm.OnlinePumpAmmSdk;

  constructor(private readonly connection: Connection) {
    this.online = new pump.OnlinePumpSdk(connection);
    this.onlineAmm = new amm.OnlinePumpAmmSdk(connection);
  }

  /** Read unique non-default fee recipients from the curve and AMM global accounts. */
  async readFeeRecipients(): Promise<PublicKey[]> {
    const configs = await Promise.all([
      this.online.fetchGlobal(),
      this.onlineAmm.fetchGlobalConfigAccount(),
    ]);
    const recipients = new Map<string, PublicKey>();
    for (const config of configs) {
      for (const [name, value] of Object.entries(config)) {
        if (!/recipient/i.test(name)) continue;
        for (const key of Array.isArray(value) ? value : [value]) {
          if (key instanceof PublicKey && !key.equals(PublicKey.default))
            recipients.set(key.toBase58(), key);
        }
      }
    }
    return [...recipients.values()];
  }

  /**
   * Build the official create_v2 instruction without signing or submitting it.
   * @remarks The caller supplies the new mint and must provide its signature when submitting.
   */
  async buildLaunch(parameters: PumpLaunchParameters): Promise<{
    market: LaunchpadMarket;
    instructions: TransactionInstruction[];
  }> {
    const {
      payer,
      mint,
      name,
      symbol,
      uri,
      creator = payer,
      mayhemMode = false,
    } = parameters;
    const instruction = await pump.PUMP_SDK.createV2Instruction({
      mint,
      name,
      symbol,
      uri,
      creator,
      user: payer,
      mayhemMode,
    });
    return {
      market: {
        mint: mint.toBase58(),
        pool: pump.bondingCurvePda(mint).toBase58(),
        launchpad: "Pump.fun",
      },
      instructions: [instruction],
    };
  }

  /**
   * Quote and build an exact-token buy of the remaining curve reserves from current chain state.
   * @param slippageBps - Maximum SOL input protection in basis points, between zero and 10,000.
   * @returns Unsigned buy instructions, or an empty array when completion or migration already occurred.
   * @remarks Quotes can become stale before execution; callers own freshness, signing and submission.
   */
  async buildCompletion(
    market: LaunchpadMarket,
    owner: PublicKey,
    slippageBps: number,
  ): Promise<TransactionInstruction[]> {
    if (
      !Number.isInteger(slippageBps) ||
      slippageBps < 0 ||
      slippageBps > 10_000
    )
      throw new Error("Invalid completion slippage basis points");
    const mint = new PublicKey(market.mint);
    const canonicalAccount = await this.connection.getAccountInfo(
      pump.canonicalPumpPoolPda(mint),
    );
    if (canonicalAccount?.owner.equals(pump.PUMP_AMM_PROGRAM_ID)) return [];
    const tokenProgram = await this.readTokenProgram(mint);
    const [global, feeConfig, state] = await Promise.all([
      this.online.fetchGlobal(),
      this.online.fetchFeeConfig(),
      this.online.fetchBuyState(mint, owner, tokenProgram),
    ]);
    if (state.bondingCurve.complete) return [];
    const amount = state.bondingCurve.realTokenReserves;
    const solAmount = pump.getBuySolAmountFromTokenAmount({
      global,
      feeConfig,
      mintSupply: state.bondingCurve.tokenTotalSupply,
      bondingCurve: state.bondingCurve,
      amount,
      quoteMint: NATIVE_MINT,
    });
    return pump.PUMP_SDK.buyInstructions({
      ...state,
      global,
      mint,
      user: owner,
      amount,
      solAmount: solAmount
        .muln(10_000 + slippageBps)
        .addn(9_999)
        .divn(10_000),
      slippage: 0,
      tokenProgram,
    });
  }

  /**
   * Build the permissionless canonical PumpSwap migration without completing the curve.
   * @returns The canonical pool and unsigned instructions; instructions are empty if that pool already exists.
   * @remarks The bonding curve must be complete when the migration executes. Callers sequence and submit transactions.
   */
  async buildMigration(
    market: LaunchpadMarket,
    owner: PublicKey,
  ): Promise<{ pool: string; instructions: TransactionInstruction[] }> {
    const mint = new PublicKey(market.mint);
    const canonical = pump.canonicalPumpPoolPda(mint);
    const canonicalAccount = await this.connection.getAccountInfo(canonical);
    if (canonicalAccount?.owner.equals(pump.PUMP_AMM_PROGRAM_ID))
      return { pool: canonical.toBase58(), instructions: [] };
    const [global, tokenProgram] = await Promise.all([
      this.online.fetchGlobal(),
      this.readTokenProgram(mint),
    ]);
    const instruction = await pump.PUMP_SDK.migrateInstruction({
      withdrawAuthority: global.withdrawAuthority,
      mint,
      user: owner,
      tokenProgram,
    });
    return { pool: canonical.toBase58(), instructions: [instruction] };
  }

  private async readTokenProgram(mint: PublicKey): Promise<PublicKey> {
    const account = await this.connection.getAccountInfo(mint);
    if (
      !account ||
      (!account.owner.equals(TOKEN_PROGRAM_ID) &&
        !account.owner.equals(TOKEN_2022_PROGRAM_ID))
    )
      throw new Error(
        "Pump mint is missing or has an unsupported token program",
      );
    return account.owner;
  }

  /** Observe on-chain reserves and canonical migration status; prices are SOL per whole token. */
  async inspect(market: LaunchpadMarket): Promise<LaunchpadObservation> {
    const mint = new PublicKey(market.mint);
    const canonical = pump.canonicalPumpPoolPda(mint);
    const curveAddress = pump.bondingCurvePda(mint);
    const [supply, poolInfo, global, curve] = await Promise.all([
      this.connection.getTokenSupply(mint),
      this.connection.getAccountInfo(canonical),
      this.online.fetchGlobal(),
      this.online.fetchBondingCurve(mint),
    ]);
    if (poolInfo?.owner.equals(pump.PUMP_AMM_PROGRAM_ID)) {
      const state = await this.onlineAmm.swapSolanaState(
        canonical,
        PublicKey.default,
      );
      return {
        pool: canonical.toBase58(),
        venue: "PumpSwap",
        progress: 100,
        priceSol:
          Number(state.poolQuoteAmount.add(state.pool.virtualQuoteReserves)) /
          1e9 /
          (Number(state.poolBaseAmount) / 10 ** supply.value.decimals),
        liquiditySol: Number(state.poolQuoteAmount) / 1e9,
        excludedOwners: [curveAddress.toBase58(), canonical.toBase58()],
      };
    }
    return {
      pool: curveAddress.toBase58(),
      venue: "Pump.fun",
      progress: Math.max(
        0,
        Math.min(
          100,
          (1 -
            Number(curve.realTokenReserves) /
              Number(global.initialRealTokenReserves)) *
            100,
        ),
      ),
      priceSol:
        Number(curve.virtualQuoteReserves) /
        1e9 /
        (Number(curve.virtualTokenReserves) / 10 ** supply.value.decimals),
      liquiditySol: Number(curve.realQuoteReserves) / 1e9,
      excludedOwners: [curveAddress.toBase58()],
    };
  }
}
