import {
  Keypair,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import * as pump from "@pump-fun/pump-sdk";
import * as amm from "@pump-fun/pump-swap-sdk";
import type {
  SandboxAdapter,
  SandboxContext,
  SandboxMarket,
  SandboxObservation,
} from "./types";

/** Official Pump SDK operations; callers own signing, persistence and transaction serialization. */
export class PumpSandbox implements SandboxAdapter {
  private readonly online: pump.OnlinePumpSdk;
  private readonly onlineAmm: amm.OnlinePumpAmmSdk;

  constructor(private readonly context: SandboxContext) {
    this.online = new pump.OnlinePumpSdk(context.connection);
    this.onlineAmm = new amm.OnlinePumpAmmSdk(context.connection);
  }

  /** Fund missing fee recipients on the verified Surfpool fixture using the caller's payer. */
  async initialize(payer: Keypair): Promise<void> {
    const version = await this.context.connection.getVersion();
    if (
      (version as unknown as Record<string, string>)["surfnet-version"] !==
      "1.6.0"
    ) {
      throw new Error(
        "Pump sandbox initialization requires the pinned Surfpool 1.6.0 fixture",
      );
    }
    const configs = await Promise.all([
      this.online.fetchGlobal(),
      this.onlineAmm.fetchGlobalConfigAccount(),
    ]);
    const recipients = new Set<string>();
    for (const config of configs) {
      for (const [name, value] of Object.entries(config)) {
        if (!/recipient/i.test(name)) continue;
        for (const key of Array.isArray(value) ? value : [value]) {
          if (key instanceof PublicKey && !key.equals(PublicKey.default))
            recipients.add(key.toBase58());
        }
      }
    }
    for (const address of recipients) {
      const pubkey = new PublicKey(address);
      if ((await this.context.connection.getBalance(pubkey)) < 1_000_000) {
        await this.context.send(
          [
            SystemProgram.transfer({
              fromPubkey: payer.publicKey,
              toPubkey: pubkey,
              lamports: 2_000_000,
            }),
          ],
          payer,
        );
      }
    }
  }

  /** Create a six-decimal Token-2022 curve with the official create_v2 instruction. */
  async launch(
    payer: Keypair,
    name: string,
    symbol: string,
  ): Promise<SandboxMarket> {
    const mint = Keypair.generate();
    const instruction = await pump.PUMP_SDK.createV2Instruction({
      mint: mint.publicKey,
      name,
      symbol,
      uri: "https://example.invalid/local-simulator.json",
      creator: payer.publicKey,
      user: payer.publicKey,
      mayhemMode: false,
    });
    const creationSignature = await this.context.send([instruction], payer, [
      mint,
    ]);
    return {
      mint: mint.publicKey.toBase58(),
      pool: pump.bondingCurvePda(mint.publicKey).toBase58(),
      launchpad: "Pump.fun",
      creationSignature,
    };
  }

  /** Buy with lamports or sell raw token units; SDK quotes use freshly fetched curve or AMM state. */
  async trade(
    market: SandboxMarket,
    signer: Keypair,
    side: "buy" | "sell",
    rawAmount: bigint,
  ): Promise<string> {
    if (rawAmount <= 0n) throw new Error("Trade amount must be positive");
    const mint = new PublicKey(market.mint);
    const canonical = pump.canonicalPumpPoolPda(mint);
    const amount = new BN(rawAmount.toString());
    let instructions: TransactionInstruction[];
    if (await this.context.connection.getAccountInfo(canonical)) {
      const state = await this.onlineAmm.swapSolanaState(
        canonical,
        signer.publicKey,
      );
      instructions =
        side === "buy"
          ? await amm.PUMP_AMM_SDK.buyQuoteInput(state, amount, 1)
          : await amm.PUMP_AMM_SDK.sellBaseInput(state, amount, 1);
    } else {
      const [global, feeConfig, state] = await Promise.all([
        this.online.fetchGlobal(),
        this.online.fetchFeeConfig(),
        this.online.fetchBuyState(
          mint,
          signer.publicKey,
          TOKEN_2022_PROGRAM_ID,
        ),
      ]);
      if (state.bondingCurve.complete) {
        await this.migrate(market, signer);
        return this.trade(market, signer, side, rawAmount);
      }
      const quoteContext = {
        global,
        feeConfig,
        mintSupply: state.bondingCurve.tokenTotalSupply,
        bondingCurve: state.bondingCurve,
      };
      if (side === "buy") {
        const tokenAmount = pump.getBuyTokenAmountFromSolAmount({
          ...quoteContext,
          amount,
          quoteMint: NATIVE_MINT,
        });
        instructions = await pump.PUMP_SDK.buyInstructions({
          ...state,
          global,
          mint,
          user: signer.publicKey,
          amount: tokenAmount,
          solAmount: amount,
          slippage: 1,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        });
      } else {
        const solAmount = pump.getSellSolAmountFromTokenAmount({
          ...quoteContext,
          amount,
        });
        instructions = await pump.PUMP_SDK.sellInstructions({
          ...state,
          global,
          mint,
          user: signer.publicKey,
          amount,
          solAmount,
          slippage: 1,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          mayhemMode: false,
        });
      }
    }
    return this.context.send(instructions, signer);
  }

  /** Buy any remaining curve reserves, then execute the permissionless canonical migration. */
  async migrate(
    market: SandboxMarket,
    signer: Keypair,
  ): Promise<{ pool: string; signature: string }> {
    const mint = new PublicKey(market.mint);
    const canonical = pump.canonicalPumpPoolPda(mint);
    if (await this.context.connection.getAccountInfo(canonical))
      return { pool: canonical.toBase58(), signature: "already-migrated" };
    const [global, feeConfig, state] = await Promise.all([
      this.online.fetchGlobal(),
      this.online.fetchFeeConfig(),
      this.online.fetchBuyState(mint, signer.publicKey, TOKEN_2022_PROGRAM_ID),
    ]);
    if (!state.bondingCurve.complete) {
      const amount = state.bondingCurve.realTokenReserves;
      const solAmount = pump.getBuySolAmountFromTokenAmount({
        global,
        feeConfig,
        mintSupply: state.bondingCurve.tokenTotalSupply,
        bondingCurve: state.bondingCurve,
        amount,
        quoteMint: NATIVE_MINT,
      });
      await this.context.send(
        await pump.PUMP_SDK.buyInstructions({
          ...state,
          global,
          mint,
          user: signer.publicKey,
          amount,
          solAmount,
          slippage: 1,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        }),
        signer,
      );
    }
    const signature = await this.context.send(
      [
        await pump.PUMP_SDK.migrateInstruction({
          withdrawAuthority: global.withdrawAuthority,
          mint,
          user: signer.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        }),
      ],
      signer,
    );
    return { pool: canonical.toBase58(), signature };
  }

  /** Observe on-chain reserves and canonical migration status; prices are SOL per whole token. */
  async inspect(market: SandboxMarket): Promise<SandboxObservation> {
    const mint = new PublicKey(market.mint);
    const canonical = pump.canonicalPumpPoolPda(mint);
    const curveAddress = pump.bondingCurvePda(mint);
    const [supply, poolInfo, global, curve] = await Promise.all([
      this.context.connection.getTokenSupply(mint),
      this.context.connection.getAccountInfo(canonical),
      this.online.fetchGlobal(),
      this.online.fetchBondingCurve(mint),
    ]);
    if (poolInfo) {
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
