import { Buffer } from 'buffer';
import { PublicKey, Keypair, TransactionInstruction } from '@solana/web3.js';

/** PumpFun program ID */
declare const PUMPFUN_PROGRAM_ID: PublicKey;
/** Event Authority for PumpFun */
declare const PUMPFUN_EVENT_AUTHORITY: PublicKey;
/** Fee Program */
declare const PUMPFUN_FEE_PROGRAM: PublicKey;
/** Global Volume Accumulator */
declare const PUMPFUN_GLOBAL_VOLUME_ACCUMULATOR: PublicKey;
/** Fee Config */
declare const PUMPFUN_FEE_CONFIG: PublicKey;
/** Global Account */
declare const PUMPFUN_GLOBAL_ACCOUNT: PublicKey;
/** Fee Recipient */
declare const PUMPFUN_FEE_RECIPIENT: PublicKey;
/** Non-mayhem: random among primary + Pump.fun AMM protocol fee recipients (Rust `get_standard_fee_recipient_meta_random`). */
declare const PUMPFUN_STANDARD_FEE_RECIPIENTS: PublicKey[];
/**
 * Protocol extra fee recipients (Apr 2026 breaking upgrade).
 * One pubkey is appended after bonding-curve-v2 on buy/sell; account must be writable.
 * @see https://github.com/pump-fun/pump-public-docs/blob/main/docs/BREAKING_FEE_RECIPIENT.md
 */
declare const PUMPFUN_PROTOCOL_EXTRA_FEE_RECIPIENTS: PublicKey[];
/** V2 buyback fee recipients (same static pool as Rust `get_buyback_fee_recipient_random`). */
declare const PUMPFUN_BUYBACK_FEE_RECIPIENTS: PublicKey[];
/** Mayhem Fee Recipients */
declare const PUMPFUN_MAYHEM_FEE_RECIPIENTS: PublicKey[];
/** Buy instruction discriminator */
declare const PUMPFUN_BUY_DISCRIMINATOR: Buffer;
/** Buy exact SOL in discriminator */
declare const PUMPFUN_BUY_EXACT_SOL_IN_DISCRIMINATOR: Buffer;
/** Sell instruction discriminator */
declare const PUMPFUN_SELL_DISCRIMINATOR: Buffer;
/** PumpFun V2 buy instruction discriminator */
declare const PUMPFUN_BUY_V2_DISCRIMINATOR: Buffer;
/** PumpFun V2 sell instruction discriminator */
declare const PUMPFUN_SELL_V2_DISCRIMINATOR: Buffer;
/** PumpFun V2 exact quote-in buy discriminator */
declare const PUMPFUN_BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR: Buffer;
/** Claim cashback discriminator */
declare const PUMPFUN_CLAIM_CASHBACK_DISCRIMINATOR: Buffer;
declare const PUMPFUN_BONDING_CURVE_SEED: Buffer<ArrayBuffer>;
declare const PUMPFUN_BONDING_CURVE_V2_SEED: Buffer<ArrayBuffer>;
declare const PUMPFUN_CREATOR_VAULT_SEED: Buffer<ArrayBuffer>;
declare const PUMPFUN_USER_VOLUME_ACCUMULATOR_SEED: Buffer<ArrayBuffer>;
declare const PUMPFUN_SHARING_CONFIG_SEED: Buffer<ArrayBuffer>;
/**
 * Derive the bonding curve PDA for a given mint
 */
declare function getBondingCurvePda(mint: PublicKey): PublicKey;
/**
 * Derive the bonding curve v2 PDA for a given mint
 */
declare function getBondingCurveV2Pda(mint: PublicKey): PublicKey;
/**
 * Derive the creator vault PDA for a given creator
 */
declare function getCreatorVaultPda(creator: PublicKey): PublicKey;
/**
 * Derive the user volume accumulator PDA for a given user
 */
declare function getPumpFunUserVolumeAccumulatorPda(user: PublicKey): PublicKey;
/**
 * Derive the fee sharing config PDA for a PumpFun mint.
 */
declare function getPumpFunFeeSharingConfigPda(mint: PublicKey): PublicKey;
/**
 * Get a random Mayhem fee recipient
 */
declare function getRandomMayhemFeeRecipient(): PublicKey;
declare function getStandardFeeRecipientRandom(): PublicKey;
/** Random protocol extra fee recipient (after bonding-curve-v2, mutable). */
declare function getPumpFunProtocolExtraFeeRecipientRandom(): PublicKey;
/** Random PumpFun V2 buyback fee recipient. */
declare function getPumpFunBuybackFeeRecipientRandom(): PublicKey;
/**
 * Account #2 fee recipient: prefer gRPC/event `feeRecipient`; if `default` pubkey, random from mayhem or standard pool (Rust `pump_fun_fee_recipient_meta`).
 */
declare function pumpFunFeeRecipientMeta(fromStream: PublicKey | undefined, isMayhemMode: boolean): PublicKey;
interface PumpFunBondingCurve {
    account: PublicKey;
    virtualTokenReserves: bigint;
    virtualSolReserves: bigint;
    realTokenReserves: bigint;
    creator?: PublicKey;
    isMayhemMode: boolean;
    isCashbackCoin: boolean;
}
interface PumpFunParams {
    bondingCurve: PumpFunBondingCurve;
    creatorVault: PublicKey;
    tokenProgram: PublicKey;
    associatedBondingCurve?: PublicKey;
    observedTradeCreator?: PublicKey;
    feeSharingCreatorVaultIfActive?: PublicKey;
    closeTokenAccountWhenSell?: boolean;
    /** From an already-decoded event (`tradeEvent.feeRecipient`); default pubkey -> random pool */
    feeRecipient?: PublicKey;
    /** Explicit buyback recipient from validated protocol configuration; otherwise uses the upstream random pool. */
    buybackFeeRecipient?: PublicKey;
    /** Layout selector: default/Solscan SOL sentinel keeps legacy SOL; WSOL/USDC selects V2. */
    quoteMint?: PublicKey;
}
interface PumpFunBuildBuyParams {
    payer: Keypair | PublicKey;
    inputMint?: PublicKey;
    outputMint: PublicKey;
    inputAmount: bigint;
    slippageBasisPoints?: bigint;
    fixedOutputAmount?: bigint;
    /** Caller-validated minimum output in atomic units; skips SDK quote math. Buy requires exact-input mode. */
    minimumOutputAmount?: bigint;
    createOutputMintAta?: boolean;
    createInputMintAta?: boolean;
    closeInputMintAta?: boolean;
    protocolParams: PumpFunParams;
    useExactSolAmount?: boolean;
    /** Whether the legacy buy tracks volume; defaults to true. V2 has no volume argument. */
    trackVolume?: boolean;
}
interface PumpFunBuildSellParams {
    payer: Keypair | PublicKey;
    inputMint: PublicKey;
    outputMint?: PublicKey;
    inputAmount: bigint;
    slippageBasisPoints?: bigint;
    fixedOutputAmount?: bigint;
    /** Caller-validated minimum output in atomic units; skips SDK quote math. Buy requires exact-input mode. */
    minimumOutputAmount?: bigint;
    createOutputMintAta?: boolean;
    closeInputMintAta?: boolean;
    protocolParams: PumpFunParams;
}
/**
 * Build buy instructions for PumpFun protocol
 * 100% port from Rust: src/instruction/pumpfun.rs build_buy_instructions
 */
declare function buildPumpFunBuyInstructions(params: PumpFunBuildBuyParams): TransactionInstruction[];
/**
 * Build sell instructions for PumpFun protocol
 * 100% port from Rust: src/instruction/pumpfun.rs build_sell_instructions
 */
declare function buildPumpFunSellInstructions(params: PumpFunBuildSellParams): TransactionInstruction[];
/**
 * Build PumpFun V2 buy instructions (`buy_v2` / `buy_exact_quote_in_v2`).
 */
declare function buildPumpFunBuyV2Instructions(params: PumpFunBuildBuyParams): TransactionInstruction[];
/**
 * Build PumpFun V2 sell instructions (`sell_v2`).
 */
declare function buildPumpFunSellV2Instructions(params: PumpFunBuildSellParams): TransactionInstruction[];
/**
 * Build claim cashback instruction for PumpFun
 */
declare function buildPumpFunClaimCashbackInstruction(payer: PublicKey): TransactionInstruction;
/**
 * Fetch bonding curve account from RPC.
 * 100% from Rust: src/instruction/utils/pumpfun.rs fetch_bonding_curve_account
 */
declare function fetchBondingCurveAccount(connection: {
    getAccountInfo: (pubkey: PublicKey) => Promise<{
        value?: {
            data: Buffer;
        };
    }>;
}, mint: PublicKey): Promise<{
    bondingCurve: PumpFunBondingCurve;
    bondingCurvePda: PublicKey;
} | null>;
/**
 * Get creator from creator vault PDA.
 * 100% from Rust: src/instruction/utils/pumpfun.rs get_creator
 */
declare function getCreator(creatorVaultPda: PublicKey): PublicKey;
/**
 * Get buy price (tokens received for SOL).
 * 100% from Rust: src/instruction/utils/pumpfun.rs get_buy_price
 */
declare function getBuyPrice(amount: bigint, virtualSolReserves: bigint, virtualTokenReserves: bigint, realTokenReserves: bigint): bigint;

declare const pumpfun_builder_PUMPFUN_BONDING_CURVE_SEED: typeof PUMPFUN_BONDING_CURVE_SEED;
declare const pumpfun_builder_PUMPFUN_BONDING_CURVE_V2_SEED: typeof PUMPFUN_BONDING_CURVE_V2_SEED;
declare const pumpfun_builder_PUMPFUN_BUYBACK_FEE_RECIPIENTS: typeof PUMPFUN_BUYBACK_FEE_RECIPIENTS;
declare const pumpfun_builder_PUMPFUN_BUY_DISCRIMINATOR: typeof PUMPFUN_BUY_DISCRIMINATOR;
declare const pumpfun_builder_PUMPFUN_BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR: typeof PUMPFUN_BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR;
declare const pumpfun_builder_PUMPFUN_BUY_EXACT_SOL_IN_DISCRIMINATOR: typeof PUMPFUN_BUY_EXACT_SOL_IN_DISCRIMINATOR;
declare const pumpfun_builder_PUMPFUN_BUY_V2_DISCRIMINATOR: typeof PUMPFUN_BUY_V2_DISCRIMINATOR;
declare const pumpfun_builder_PUMPFUN_CLAIM_CASHBACK_DISCRIMINATOR: typeof PUMPFUN_CLAIM_CASHBACK_DISCRIMINATOR;
declare const pumpfun_builder_PUMPFUN_CREATOR_VAULT_SEED: typeof PUMPFUN_CREATOR_VAULT_SEED;
declare const pumpfun_builder_PUMPFUN_EVENT_AUTHORITY: typeof PUMPFUN_EVENT_AUTHORITY;
declare const pumpfun_builder_PUMPFUN_FEE_CONFIG: typeof PUMPFUN_FEE_CONFIG;
declare const pumpfun_builder_PUMPFUN_FEE_PROGRAM: typeof PUMPFUN_FEE_PROGRAM;
declare const pumpfun_builder_PUMPFUN_FEE_RECIPIENT: typeof PUMPFUN_FEE_RECIPIENT;
declare const pumpfun_builder_PUMPFUN_GLOBAL_ACCOUNT: typeof PUMPFUN_GLOBAL_ACCOUNT;
declare const pumpfun_builder_PUMPFUN_GLOBAL_VOLUME_ACCUMULATOR: typeof PUMPFUN_GLOBAL_VOLUME_ACCUMULATOR;
declare const pumpfun_builder_PUMPFUN_MAYHEM_FEE_RECIPIENTS: typeof PUMPFUN_MAYHEM_FEE_RECIPIENTS;
declare const pumpfun_builder_PUMPFUN_PROGRAM_ID: typeof PUMPFUN_PROGRAM_ID;
declare const pumpfun_builder_PUMPFUN_PROTOCOL_EXTRA_FEE_RECIPIENTS: typeof PUMPFUN_PROTOCOL_EXTRA_FEE_RECIPIENTS;
declare const pumpfun_builder_PUMPFUN_SELL_DISCRIMINATOR: typeof PUMPFUN_SELL_DISCRIMINATOR;
declare const pumpfun_builder_PUMPFUN_SELL_V2_DISCRIMINATOR: typeof PUMPFUN_SELL_V2_DISCRIMINATOR;
declare const pumpfun_builder_PUMPFUN_SHARING_CONFIG_SEED: typeof PUMPFUN_SHARING_CONFIG_SEED;
declare const pumpfun_builder_PUMPFUN_STANDARD_FEE_RECIPIENTS: typeof PUMPFUN_STANDARD_FEE_RECIPIENTS;
declare const pumpfun_builder_PUMPFUN_USER_VOLUME_ACCUMULATOR_SEED: typeof PUMPFUN_USER_VOLUME_ACCUMULATOR_SEED;
type pumpfun_builder_PumpFunBondingCurve = PumpFunBondingCurve;
type pumpfun_builder_PumpFunBuildBuyParams = PumpFunBuildBuyParams;
type pumpfun_builder_PumpFunBuildSellParams = PumpFunBuildSellParams;
type pumpfun_builder_PumpFunParams = PumpFunParams;
declare const pumpfun_builder_buildPumpFunBuyInstructions: typeof buildPumpFunBuyInstructions;
declare const pumpfun_builder_buildPumpFunBuyV2Instructions: typeof buildPumpFunBuyV2Instructions;
declare const pumpfun_builder_buildPumpFunClaimCashbackInstruction: typeof buildPumpFunClaimCashbackInstruction;
declare const pumpfun_builder_buildPumpFunSellInstructions: typeof buildPumpFunSellInstructions;
declare const pumpfun_builder_buildPumpFunSellV2Instructions: typeof buildPumpFunSellV2Instructions;
declare const pumpfun_builder_fetchBondingCurveAccount: typeof fetchBondingCurveAccount;
declare const pumpfun_builder_getBondingCurvePda: typeof getBondingCurvePda;
declare const pumpfun_builder_getBondingCurveV2Pda: typeof getBondingCurveV2Pda;
declare const pumpfun_builder_getBuyPrice: typeof getBuyPrice;
declare const pumpfun_builder_getCreator: typeof getCreator;
declare const pumpfun_builder_getCreatorVaultPda: typeof getCreatorVaultPda;
declare const pumpfun_builder_getPumpFunBuybackFeeRecipientRandom: typeof getPumpFunBuybackFeeRecipientRandom;
declare const pumpfun_builder_getPumpFunFeeSharingConfigPda: typeof getPumpFunFeeSharingConfigPda;
declare const pumpfun_builder_getPumpFunProtocolExtraFeeRecipientRandom: typeof getPumpFunProtocolExtraFeeRecipientRandom;
declare const pumpfun_builder_getPumpFunUserVolumeAccumulatorPda: typeof getPumpFunUserVolumeAccumulatorPda;
declare const pumpfun_builder_getRandomMayhemFeeRecipient: typeof getRandomMayhemFeeRecipient;
declare const pumpfun_builder_getStandardFeeRecipientRandom: typeof getStandardFeeRecipientRandom;
declare const pumpfun_builder_pumpFunFeeRecipientMeta: typeof pumpFunFeeRecipientMeta;
declare namespace pumpfun_builder {
  export { pumpfun_builder_PUMPFUN_BONDING_CURVE_SEED as PUMPFUN_BONDING_CURVE_SEED, pumpfun_builder_PUMPFUN_BONDING_CURVE_V2_SEED as PUMPFUN_BONDING_CURVE_V2_SEED, pumpfun_builder_PUMPFUN_BUYBACK_FEE_RECIPIENTS as PUMPFUN_BUYBACK_FEE_RECIPIENTS, pumpfun_builder_PUMPFUN_BUY_DISCRIMINATOR as PUMPFUN_BUY_DISCRIMINATOR, pumpfun_builder_PUMPFUN_BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR as PUMPFUN_BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR, pumpfun_builder_PUMPFUN_BUY_EXACT_SOL_IN_DISCRIMINATOR as PUMPFUN_BUY_EXACT_SOL_IN_DISCRIMINATOR, pumpfun_builder_PUMPFUN_BUY_V2_DISCRIMINATOR as PUMPFUN_BUY_V2_DISCRIMINATOR, pumpfun_builder_PUMPFUN_CLAIM_CASHBACK_DISCRIMINATOR as PUMPFUN_CLAIM_CASHBACK_DISCRIMINATOR, pumpfun_builder_PUMPFUN_CREATOR_VAULT_SEED as PUMPFUN_CREATOR_VAULT_SEED, pumpfun_builder_PUMPFUN_EVENT_AUTHORITY as PUMPFUN_EVENT_AUTHORITY, pumpfun_builder_PUMPFUN_FEE_CONFIG as PUMPFUN_FEE_CONFIG, pumpfun_builder_PUMPFUN_FEE_PROGRAM as PUMPFUN_FEE_PROGRAM, pumpfun_builder_PUMPFUN_FEE_RECIPIENT as PUMPFUN_FEE_RECIPIENT, pumpfun_builder_PUMPFUN_GLOBAL_ACCOUNT as PUMPFUN_GLOBAL_ACCOUNT, pumpfun_builder_PUMPFUN_GLOBAL_VOLUME_ACCUMULATOR as PUMPFUN_GLOBAL_VOLUME_ACCUMULATOR, pumpfun_builder_PUMPFUN_MAYHEM_FEE_RECIPIENTS as PUMPFUN_MAYHEM_FEE_RECIPIENTS, pumpfun_builder_PUMPFUN_PROGRAM_ID as PUMPFUN_PROGRAM_ID, pumpfun_builder_PUMPFUN_PROTOCOL_EXTRA_FEE_RECIPIENTS as PUMPFUN_PROTOCOL_EXTRA_FEE_RECIPIENTS, pumpfun_builder_PUMPFUN_SELL_DISCRIMINATOR as PUMPFUN_SELL_DISCRIMINATOR, pumpfun_builder_PUMPFUN_SELL_V2_DISCRIMINATOR as PUMPFUN_SELL_V2_DISCRIMINATOR, pumpfun_builder_PUMPFUN_SHARING_CONFIG_SEED as PUMPFUN_SHARING_CONFIG_SEED, pumpfun_builder_PUMPFUN_STANDARD_FEE_RECIPIENTS as PUMPFUN_STANDARD_FEE_RECIPIENTS, pumpfun_builder_PUMPFUN_USER_VOLUME_ACCUMULATOR_SEED as PUMPFUN_USER_VOLUME_ACCUMULATOR_SEED, type pumpfun_builder_PumpFunBondingCurve as PumpFunBondingCurve, type pumpfun_builder_PumpFunBuildBuyParams as PumpFunBuildBuyParams, type pumpfun_builder_PumpFunBuildSellParams as PumpFunBuildSellParams, type pumpfun_builder_PumpFunParams as PumpFunParams, pumpfun_builder_buildPumpFunBuyInstructions as buildPumpFunBuyInstructions, pumpfun_builder_buildPumpFunBuyV2Instructions as buildPumpFunBuyV2Instructions, pumpfun_builder_buildPumpFunClaimCashbackInstruction as buildPumpFunClaimCashbackInstruction, pumpfun_builder_buildPumpFunSellInstructions as buildPumpFunSellInstructions, pumpfun_builder_buildPumpFunSellV2Instructions as buildPumpFunSellV2Instructions, pumpfun_builder_fetchBondingCurveAccount as fetchBondingCurveAccount, pumpfun_builder_getBondingCurvePda as getBondingCurvePda, pumpfun_builder_getBondingCurveV2Pda as getBondingCurveV2Pda, pumpfun_builder_getBuyPrice as getBuyPrice, pumpfun_builder_getCreator as getCreator, pumpfun_builder_getCreatorVaultPda as getCreatorVaultPda, pumpfun_builder_getPumpFunBuybackFeeRecipientRandom as getPumpFunBuybackFeeRecipientRandom, pumpfun_builder_getPumpFunFeeSharingConfigPda as getPumpFunFeeSharingConfigPda, pumpfun_builder_getPumpFunProtocolExtraFeeRecipientRandom as getPumpFunProtocolExtraFeeRecipientRandom, pumpfun_builder_getPumpFunUserVolumeAccumulatorPda as getPumpFunUserVolumeAccumulatorPda, pumpfun_builder_getRandomMayhemFeeRecipient as getRandomMayhemFeeRecipient, pumpfun_builder_getStandardFeeRecipientRandom as getStandardFeeRecipientRandom, pumpfun_builder_pumpFunFeeRecipientMeta as pumpFunFeeRecipientMeta };
}

/**
 * Calculation utilities for Sol Trade SDK
 *
 * Security features:
 * - Overflow/underflow protection
 * - Input validation
 * - Bounds checking
 */
declare class CalculationError extends Error {
    constructor(message: string);
}
/**
 * Compute fee based on amount and fee basis points
 * Includes overflow protection
 */
declare function computeFee(amount: bigint, feeBasisPoints: bigint): bigint;
/**
 * Ceiling division with zero check
 */
declare function ceilDiv(a: bigint, b: bigint): bigint;
/**
 * Calculate buy amount with slippage protection
 * Includes overflow protection and validation
 *
 * Note: Basis points are clamped to MAX_SLIPPAGE_BASIS_POINTS (9999 = 99.99%)
 * to prevent the amount from doubling when basisPoints = 10000.
 */
declare function calculateWithSlippageBuy(amount: bigint, basisPoints: bigint): bigint;
/**
 * Calculate sell amount with slippage protection
 * Includes underflow protection
 *
 * 100% from Rust: src/utils/calc/common.rs calculate_with_slippage_sell
 *
 * Note: Returns 1n if amount <= basisPoints / 10000n to ensure minimum output.
 */
declare function calculateWithSlippageSell(amount: bigint, basisPoints: bigint): bigint;
declare const PUMPFUN_CONSTANTS: {
    FEE_BASIS_POINTS: bigint;
    CREATOR_FEE: bigint;
    INITIAL_VIRTUAL_TOKEN_RESERVES: bigint;
    INITIAL_VIRTUAL_SOL_RESERVES: bigint;
    INITIAL_REAL_TOKEN_RESERVES: bigint;
    TOKEN_TOTAL_SUPPLY: bigint;
};
/**
 * Calculate buy token amount from SOL amount for PumpFun
 */
declare function getBuyTokenAmountFromSolAmount(virtualTokenReserves: bigint, virtualSolReserves: bigint, realTokenReserves: bigint, hasCreator: boolean, amount: bigint): bigint;
/**
 * Calculate sell SOL amount from token amount for PumpFun
 */
declare function getSellSolAmountFromTokenAmount(virtualTokenReserves: bigint, virtualSolReserves: bigint, hasCreator: boolean, amount: bigint): bigint;
declare const PUMPSWAP_CONSTANTS: {
    LP_FEE_BASIS_POINTS: bigint;
    PROTOCOL_FEE_BASIS_POINTS: bigint;
    COIN_CREATOR_FEE_BASIS_POINTS: bigint;
};
interface PumpSwapFeeBasisPoints {
    lpFeeBasisPoints: bigint;
    protocolFeeBasisPoints: bigint;
    coinCreatorFeeBasisPoints: bigint;
}
declare function pumpSwapFeeBasisPoints(lpFeeBasisPoints: bigint, protocolFeeBasisPoints: bigint, coinCreatorFeeBasisPoints: bigint): PumpSwapFeeBasisPoints;
declare function legacyPumpSwapFeeBasisPoints(hasCoinCreator: boolean): PumpSwapFeeBasisPoints;
interface BuyBaseInputResult {
    internalQuoteAmount: bigint;
    uiQuote: bigint;
    maxQuote: bigint;
}
interface BuyQuoteInputResult {
    base: bigint;
    internalQuoteWithoutFees: bigint;
    maxQuote: bigint;
}
interface SellBaseInputResult {
    uiQuote: bigint;
    minQuote: bigint;
    internalQuoteAmountOut: bigint;
}
interface SellQuoteInputResult {
    internalRawQuote: bigint;
    base: bigint;
    minQuote: bigint;
}
/** Compute the signed PumpSwap quote reserve used for pricing. */
declare function effectiveQuoteReserves(quoteVaultBalance: bigint, virtualQuoteReserves: bigint): bigint;
/**
 * Calculate quote needed to buy base tokens on PumpSwap
 */
declare function buyBaseInputInternal(base: bigint, slippageBasisPoints: bigint, baseReserve: bigint, quoteReserve: bigint, virtualQuoteReserves: bigint, hasCoinCreator: boolean): BuyBaseInputResult;
declare function buyBaseInputInternalWithFees(base: bigint, slippageBasisPoints: bigint, baseReserve: bigint, quoteReserve: bigint, virtualQuoteReserves: bigint, feeBasisPoints: PumpSwapFeeBasisPoints): BuyBaseInputResult;
/**
 * Calculate base tokens received for quote input on PumpSwap
 */
declare function buyQuoteInputInternal(quote: bigint, slippageBasisPoints: bigint, baseReserve: bigint, quoteReserve: bigint, virtualQuoteReserves: bigint, hasCoinCreator: boolean): BuyQuoteInputResult;
declare function buyQuoteInputInternalWithFees(quote: bigint, slippageBasisPoints: bigint, baseReserve: bigint, quoteReserve: bigint, virtualQuoteReserves: bigint, feeBasisPoints: PumpSwapFeeBasisPoints): BuyQuoteInputResult;
/**
 * Calculate quote received for selling base tokens on PumpSwap
 */
declare function sellBaseInputInternal(base: bigint, slippageBasisPoints: bigint, baseReserve: bigint, quoteReserve: bigint, virtualQuoteReserves: bigint, hasCoinCreator: boolean): SellBaseInputResult;
declare function sellBaseInputInternalWithFees(base: bigint, slippageBasisPoints: bigint, baseReserve: bigint, quoteReserve: bigint, virtualQuoteReserves: bigint, feeBasisPoints: PumpSwapFeeBasisPoints): SellBaseInputResult;
/**
 * Calculate base needed to receive quote amount on PumpSwap
 */
declare function sellQuoteInputInternal(quote: bigint, slippageBasisPoints: bigint, baseReserve: bigint, quoteReserve: bigint, virtualQuoteReserves: bigint, hasCoinCreator: boolean): SellQuoteInputResult;
declare function sellQuoteInputInternalWithFees(quote: bigint, slippageBasisPoints: bigint, baseReserve: bigint, quoteReserve: bigint, virtualQuoteReserves: bigint, feeBasisPoints: PumpSwapFeeBasisPoints): SellQuoteInputResult;
declare const BONK_CONSTANTS: {
    PROTOCOL_FEE_RATE: bigint;
    PLATFORM_FEE_RATE: bigint;
    SHARE_FEE_RATE: bigint;
    DEFAULT_VIRTUAL_BASE: bigint;
    DEFAULT_VIRTUAL_QUOTE: bigint;
};
/**
 * Calculate output amount for Bonk
 */
declare function getBonkAmountOut(amountIn: bigint, virtualBase: bigint, virtualQuote: bigint): bigint;
/**
 * Calculate input amount needed for Bonk
 */
declare function getBonkAmountIn(amountOut: bigint, virtualBase: bigint, virtualQuote: bigint): bigint;
/**
 * Calculate output amount for Raydium AMM V4
 */
declare function raydiumAmmV4GetAmountOut(amountIn: bigint, inputReserve: bigint, outputReserve: bigint): bigint;
/**
 * Calculate input amount needed for Raydium AMM V4
 */
declare function raydiumAmmV4GetAmountIn(amountOut: bigint, inputReserve: bigint, outputReserve: bigint): bigint;
/**
 * Calculate output amount for Raydium CPMM
 */
declare function raydiumCpmmGetAmountOut(amountIn: bigint, inputReserve: bigint, outputReserve: bigint): bigint;
interface MeteoraSwapResult {
    amountOut: bigint;
    minAmountOut: bigint;
}
/**
 * Compute swap amount for Meteora DAMM V2
 */
declare function meteoraDammV2ComputeSwapAmount(tokenAReserve: bigint, tokenBReserve: bigint, isAToB: boolean, amountIn: bigint, slippageBasisPoints: bigint): MeteoraSwapResult;
/**
 * Calculate current price (token B per token A) for Meteora DAMM V2
 */
declare function meteoraDammV2CalculatePrice(tokenAReserve: bigint, tokenBReserve: bigint): number;
/**
 * Calculate liquidity (geometric mean of reserves) for Meteora DAMM V2
 */
declare function meteoraDammV2CalculateLiquidity(tokenAReserve: bigint, tokenBReserve: bigint): bigint;
/**
 * Calculate output amount with fee consideration for Meteora DAMM V2
 */
declare function meteoraDammV2GetAmountOut(amountIn: bigint, inputReserve: bigint, outputReserve: bigint, feeBasisPoints: bigint): bigint;
/**
 * Calculate input amount needed for desired output for Meteora DAMM V2
 */
declare function meteoraDammV2GetAmountIn(amountOut: bigint, inputReserve: bigint, outputReserve: bigint, feeBasisPoints: bigint): bigint;
/**
 * Calculate price impact percentage
 */
declare function calculatePriceImpact(reserveIn: bigint, amountIn: bigint): number;
/**
 * Calculate price from reserves
 */
declare function calculatePrice(quoteReserve: bigint, baseReserve: bigint, quoteDecimals: number, baseDecimals: number): number;
/**
 * Convert lamports to SOL
 */
declare function lamportsToSol(lamports: bigint | number): number;
/**
 * Calculate the price of token in WSOL
 * 100% from Rust: src/utils/price/bonk.rs price_token_in_wsol
 */
declare function priceTokenInWsol(virtualBase: bigint, virtualQuote: bigint, realBase: bigint, realQuote: bigint): number;
/**
 * Calculate the price of base in quote with virtual reserves
 * 100% from Rust: src/utils/price/bonk.rs price_base_in_quote
 */
declare function priceBaseInQuoteWithVirtual(virtualBase: bigint, virtualQuote: bigint, realBase: bigint, realQuote: bigint, baseDecimals: number, quoteDecimals: number): number;
/**
 * Calculate the token price in quote based on base and quote reserves
 * 100% from Rust: src/utils/price/common.rs price_base_in_quote
 */
declare function priceBaseInQuoteFromReserves(baseReserve: bigint, quoteReserve: bigint, baseDecimals: number, quoteDecimals: number): number;
/**
 * Calculate the token price in base based on base and quote reserves
 * 100% from Rust: src/utils/price/common.rs price_quote_in_base
 */
declare function priceQuoteInBase(baseReserve: bigint, quoteReserve: bigint, baseDecimals: number, quoteDecimals: number): number;
/**
 * Calculate the token price in SOL based on virtual reserves
 * 100% from Rust: src/utils/price/pumpfun.rs price_token_in_sol
 */
declare function priceTokenInSol(virtualSolReserves: bigint, virtualTokenReserves: bigint): number;
/**
 * Calculates the amount of tokens to receive when buying with SOL
 * 100% from Rust: src/utils/calc/bonk.rs get_buy_token_amount_from_sol_amount
 */
declare function getBonkBuyTokenAmountFromSolAmount(amountIn: bigint, virtualBase: bigint, virtualQuote: bigint, realBase: bigint, realQuote: bigint, slippageBasisPoints: bigint): bigint;
/**
 * Calculates the amount of SOL to receive when selling tokens
 * 100% from Rust: src/utils/calc/bonk.rs get_sell_sol_amount_from_token_amount
 */
declare function getBonkSellSolAmountFromTokenAmount(amountIn: bigint, virtualBase: bigint, virtualQuote: bigint, realBase: bigint, realQuote: bigint, slippageBasisPoints: bigint): bigint;
interface RaydiumCpmmComputeSwapParams {
    allTrade: boolean;
    amountIn: bigint;
    amountOut: bigint;
    minAmountOut: bigint;
    fee: bigint;
}
interface RaydiumCpmmSwapResult {
    newInputVaultAmount: bigint;
    newOutputVaultAmount: bigint;
    inputAmount: bigint;
    outputAmount: bigint;
    tradeFee: bigint;
    protocolFee: bigint;
    fundFee: bigint;
    creatorFee: bigint;
}
/**
 * Computes swap parameters for Raydium CPMM
 * 100% from Rust: src/utils/calc/raydium_cpmm.rs compute_swap_amount
 */
declare function computeRaydiumCpmmSwapAmount$1(baseReserve: bigint, quoteReserve: bigint, isBaseIn: boolean, amountIn: bigint, slippageBasisPoints: bigint): RaydiumCpmmComputeSwapParams;
/**
 * Computes swap parameters for Raydium AMM V4
 * 100% from Rust: src/utils/calc/raydium_amm_v4.rs compute_swap_amount
 */
declare function computeRaydiumAmmV4SwapAmount$1(baseReserve: bigint, quoteReserve: bigint, isBaseIn: boolean, amountIn: bigint, slippageBasisPoints: bigint): RaydiumCpmmComputeSwapParams;
/**
 * Calculate the price of token0 in token1 from sqrt price
 * 100% from Rust: src/utils/price/raydium_clmm.rs price_token0_in_token1
 */
declare function priceToken0InToken1(sqrtPriceX64: bigint, decimalsToken0: number, decimalsToken1: number): number;
/**
 * Calculate the price of token1 in token0 from sqrt price
 * 100% from Rust: src/utils/price/raydium_clmm.rs price_token1_in_token0
 */
declare function priceToken1InToken0(sqrtPriceX64: bigint, decimalsToken0: number, decimalsToken1: number): number;

declare const index$1_BONK_CONSTANTS: typeof BONK_CONSTANTS;
type index$1_BuyBaseInputResult = BuyBaseInputResult;
type index$1_BuyQuoteInputResult = BuyQuoteInputResult;
type index$1_CalculationError = CalculationError;
declare const index$1_CalculationError: typeof CalculationError;
type index$1_MeteoraSwapResult = MeteoraSwapResult;
declare const index$1_PUMPFUN_CONSTANTS: typeof PUMPFUN_CONSTANTS;
declare const index$1_PUMPSWAP_CONSTANTS: typeof PUMPSWAP_CONSTANTS;
type index$1_PumpSwapFeeBasisPoints = PumpSwapFeeBasisPoints;
type index$1_RaydiumCpmmComputeSwapParams = RaydiumCpmmComputeSwapParams;
type index$1_RaydiumCpmmSwapResult = RaydiumCpmmSwapResult;
type index$1_SellBaseInputResult = SellBaseInputResult;
type index$1_SellQuoteInputResult = SellQuoteInputResult;
declare const index$1_buyBaseInputInternal: typeof buyBaseInputInternal;
declare const index$1_buyBaseInputInternalWithFees: typeof buyBaseInputInternalWithFees;
declare const index$1_buyQuoteInputInternal: typeof buyQuoteInputInternal;
declare const index$1_buyQuoteInputInternalWithFees: typeof buyQuoteInputInternalWithFees;
declare const index$1_calculatePrice: typeof calculatePrice;
declare const index$1_calculatePriceImpact: typeof calculatePriceImpact;
declare const index$1_calculateWithSlippageBuy: typeof calculateWithSlippageBuy;
declare const index$1_calculateWithSlippageSell: typeof calculateWithSlippageSell;
declare const index$1_ceilDiv: typeof ceilDiv;
declare const index$1_computeFee: typeof computeFee;
declare const index$1_effectiveQuoteReserves: typeof effectiveQuoteReserves;
declare const index$1_getBonkAmountIn: typeof getBonkAmountIn;
declare const index$1_getBonkAmountOut: typeof getBonkAmountOut;
declare const index$1_getBonkBuyTokenAmountFromSolAmount: typeof getBonkBuyTokenAmountFromSolAmount;
declare const index$1_getBonkSellSolAmountFromTokenAmount: typeof getBonkSellSolAmountFromTokenAmount;
declare const index$1_getBuyTokenAmountFromSolAmount: typeof getBuyTokenAmountFromSolAmount;
declare const index$1_getSellSolAmountFromTokenAmount: typeof getSellSolAmountFromTokenAmount;
declare const index$1_lamportsToSol: typeof lamportsToSol;
declare const index$1_legacyPumpSwapFeeBasisPoints: typeof legacyPumpSwapFeeBasisPoints;
declare const index$1_meteoraDammV2CalculateLiquidity: typeof meteoraDammV2CalculateLiquidity;
declare const index$1_meteoraDammV2CalculatePrice: typeof meteoraDammV2CalculatePrice;
declare const index$1_meteoraDammV2ComputeSwapAmount: typeof meteoraDammV2ComputeSwapAmount;
declare const index$1_meteoraDammV2GetAmountIn: typeof meteoraDammV2GetAmountIn;
declare const index$1_meteoraDammV2GetAmountOut: typeof meteoraDammV2GetAmountOut;
declare const index$1_priceBaseInQuoteFromReserves: typeof priceBaseInQuoteFromReserves;
declare const index$1_priceBaseInQuoteWithVirtual: typeof priceBaseInQuoteWithVirtual;
declare const index$1_priceQuoteInBase: typeof priceQuoteInBase;
declare const index$1_priceToken0InToken1: typeof priceToken0InToken1;
declare const index$1_priceToken1InToken0: typeof priceToken1InToken0;
declare const index$1_priceTokenInSol: typeof priceTokenInSol;
declare const index$1_priceTokenInWsol: typeof priceTokenInWsol;
declare const index$1_pumpSwapFeeBasisPoints: typeof pumpSwapFeeBasisPoints;
declare const index$1_raydiumAmmV4GetAmountIn: typeof raydiumAmmV4GetAmountIn;
declare const index$1_raydiumAmmV4GetAmountOut: typeof raydiumAmmV4GetAmountOut;
declare const index$1_raydiumCpmmGetAmountOut: typeof raydiumCpmmGetAmountOut;
declare const index$1_sellBaseInputInternal: typeof sellBaseInputInternal;
declare const index$1_sellBaseInputInternalWithFees: typeof sellBaseInputInternalWithFees;
declare const index$1_sellQuoteInputInternal: typeof sellQuoteInputInternal;
declare const index$1_sellQuoteInputInternalWithFees: typeof sellQuoteInputInternalWithFees;
declare namespace index$1 {
  export { index$1_BONK_CONSTANTS as BONK_CONSTANTS, type index$1_BuyBaseInputResult as BuyBaseInputResult, type index$1_BuyQuoteInputResult as BuyQuoteInputResult, index$1_CalculationError as CalculationError, type index$1_MeteoraSwapResult as MeteoraSwapResult, index$1_PUMPFUN_CONSTANTS as PUMPFUN_CONSTANTS, index$1_PUMPSWAP_CONSTANTS as PUMPSWAP_CONSTANTS, type index$1_PumpSwapFeeBasisPoints as PumpSwapFeeBasisPoints, type index$1_RaydiumCpmmComputeSwapParams as RaydiumCpmmComputeSwapParams, type index$1_RaydiumCpmmSwapResult as RaydiumCpmmSwapResult, type index$1_SellBaseInputResult as SellBaseInputResult, type index$1_SellQuoteInputResult as SellQuoteInputResult, index$1_buyBaseInputInternal as buyBaseInputInternal, index$1_buyBaseInputInternalWithFees as buyBaseInputInternalWithFees, index$1_buyQuoteInputInternal as buyQuoteInputInternal, index$1_buyQuoteInputInternalWithFees as buyQuoteInputInternalWithFees, index$1_calculatePrice as calculatePrice, index$1_calculatePriceImpact as calculatePriceImpact, index$1_calculateWithSlippageBuy as calculateWithSlippageBuy, index$1_calculateWithSlippageSell as calculateWithSlippageSell, index$1_ceilDiv as ceilDiv, index$1_computeFee as computeFee, computeRaydiumAmmV4SwapAmount$1 as computeRaydiumAmmV4SwapAmount, computeRaydiumCpmmSwapAmount$1 as computeRaydiumCpmmSwapAmount, index$1_effectiveQuoteReserves as effectiveQuoteReserves, index$1_getBonkAmountIn as getBonkAmountIn, index$1_getBonkAmountOut as getBonkAmountOut, index$1_getBonkBuyTokenAmountFromSolAmount as getBonkBuyTokenAmountFromSolAmount, index$1_getBonkSellSolAmountFromTokenAmount as getBonkSellSolAmountFromTokenAmount, index$1_getBuyTokenAmountFromSolAmount as getBuyTokenAmountFromSolAmount, index$1_getSellSolAmountFromTokenAmount as getSellSolAmountFromTokenAmount, index$1_lamportsToSol as lamportsToSol, index$1_legacyPumpSwapFeeBasisPoints as legacyPumpSwapFeeBasisPoints, index$1_meteoraDammV2CalculateLiquidity as meteoraDammV2CalculateLiquidity, index$1_meteoraDammV2CalculatePrice as meteoraDammV2CalculatePrice, index$1_meteoraDammV2ComputeSwapAmount as meteoraDammV2ComputeSwapAmount, index$1_meteoraDammV2GetAmountIn as meteoraDammV2GetAmountIn, index$1_meteoraDammV2GetAmountOut as meteoraDammV2GetAmountOut, index$1_priceBaseInQuoteFromReserves as priceBaseInQuoteFromReserves, index$1_priceBaseInQuoteWithVirtual as priceBaseInQuoteWithVirtual, index$1_priceQuoteInBase as priceQuoteInBase, index$1_priceToken0InToken1 as priceToken0InToken1, index$1_priceToken1InToken0 as priceToken1InToken0, index$1_priceTokenInSol as priceTokenInSol, index$1_priceTokenInWsol as priceTokenInWsol, index$1_pumpSwapFeeBasisPoints as pumpSwapFeeBasisPoints, index$1_raydiumAmmV4GetAmountIn as raydiumAmmV4GetAmountIn, index$1_raydiumAmmV4GetAmountOut as raydiumAmmV4GetAmountOut, index$1_raydiumCpmmGetAmountOut as raydiumCpmmGetAmountOut, index$1_sellBaseInputInternal as sellBaseInputInternal, index$1_sellBaseInputInternalWithFees as sellBaseInputInternalWithFees, index$1_sellQuoteInputInternal as sellQuoteInputInternal, index$1_sellQuoteInputInternalWithFees as sellQuoteInputInternalWithFees };
}

declare const PUMPSWAP_PROGRAM: PublicKey;
declare const PUMPSWAP_PUMP_PROGRAM_ID: PublicKey;
declare const PUMPSWAP_FEE_PROGRAM: PublicKey;
declare const PUMPSWAP_FEE_RECIPIENT: PublicKey;
declare const PUMPSWAP_GLOBAL_ACCOUNT: PublicKey;
declare const PUMPSWAP_EVENT_AUTHORITY: PublicKey;
declare const PUMPSWAP_GLOBAL_VOLUME_ACCUMULATOR: PublicKey;
declare const PUMPSWAP_FEE_CONFIG: PublicKey;
declare const PUMPSWAP_DEFAULT_COIN_CREATOR_VAULT_AUTHORITY: PublicKey;
declare const PUMPSWAP_MAYHEM_FEE_RECIPIENTS: PublicKey[];
/** Protocol extra fee recipients (Apr 2026); after pool-v2: readonly, then quote ATA (mutable). */
declare const PUMPSWAP_PROTOCOL_EXTRA_FEE_RECIPIENTS: PublicKey[];
declare const PUMPSWAP_BUY_DISCRIMINATOR: Buffer<ArrayBuffer>;
declare const PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR: Buffer<ArrayBuffer>;
declare const PUMPSWAP_SELL_DISCRIMINATOR: Buffer<ArrayBuffer>;
declare const PUMPSWAP_CLAIM_CASHBACK_DISCRIMINATOR: Buffer<ArrayBuffer>;
declare const PUMPSWAP_POOL_DISCRIMINATOR: Buffer<ArrayBuffer>;
/**
 * Get a random Mayhem fee recipient
 */
declare function getMayhemFeeRecipientRandom(): PublicKey;
declare function getPumpSwapProtocolFeeRecipientRandom(): PublicKey;
declare function getPumpSwapProtocolExtraFeeRecipientRandom(): PublicKey;
/**
 * Pool v2 PDA (seeds: ["pool-v2", base_mint])
 */
declare function getPoolV2PDA(baseMint: PublicKey): PublicKey;
/**
 * Pump program pool-authority PDA (for canonical pool)
 */
declare function getPumpPoolAuthorityPDA(mint: PublicKey): PublicKey;
/**
 * Canonical Pump pool PDA
 */
declare function getCanonicalPoolPDA(mint: PublicKey): PublicKey;
/**
 * Coin creator vault authority PDA
 */
declare function getCoinCreatorVaultAuthority(coinCreator: PublicKey): PublicKey;
/**
 * Coin creator vault ATA
 */
declare function getCoinCreatorVaultAta(coinCreator: PublicKey, quoteMint: PublicKey, quoteTokenProgram?: PublicKey): PublicKey;
/**
 * Fee recipient ATA
 */
declare function getFeeRecipientAta(feeRecipient: PublicKey, quoteMint: PublicKey, quoteTokenProgram?: PublicKey): PublicKey;
/**
 * User volume accumulator PDA
 */
declare function getUserVolumeAccumulatorPDA(user: PublicKey): PublicKey;
/**
 * WSOL ATA of UserVolumeAccumulator (for buy cashback)
 */
declare function getUserVolumeAccumulatorWsolAta(user: PublicKey): PublicKey;
/**
 * Quote-mint ATA of UserVolumeAccumulator (for sell cashback)
 */
declare function getUserVolumeAccumulatorQuoteAta(user: PublicKey, quoteMint: PublicKey, quoteTokenProgram: PublicKey): PublicKey;
/**
 * Global volume accumulator PDA
 * Seeds: ["global_volume_accumulator"], owner: PUMPSWAP_PROGRAM
 */
declare function getGlobalVolumeAccumulatorPDA(): PublicKey;
/**
 * Get associated token address
 */
declare function getAssociatedTokenAddress(owner: PublicKey, mint: PublicKey, tokenProgram?: PublicKey): PublicKey;
/**
 * Create WSOL ATA and wrap SOL
 * Returns instructions for: create ATA (idempotent), transfer SOL, sync_native
 */
declare function handleWsol(owner: PublicKey, amount: bigint): TransactionInstruction[];
/**
 * Close WSOL ATA and reclaim rent
 */
declare function closeWsol(owner: PublicKey): TransactionInstruction;
/**
 * Create associated token account idempotent
 */
declare function createAssociatedTokenAccountIdempotent(payer: PublicKey, owner: PublicKey, mint: PublicKey, tokenProgram?: PublicKey): TransactionInstruction;
interface PumpSwapParams {
    /** Validated protocol fee recipient; otherwise uses the upstream protocol default. */
    feeRecipient?: PublicKey;
    /** Validated buyback fee recipient; otherwise uses the upstream random pool. */
    buybackFeeRecipient?: PublicKey;
    pool: PublicKey;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    poolBaseTokenAccount: PublicKey;
    poolQuoteTokenAccount: PublicKey;
    poolBaseTokenReserves: bigint;
    poolQuoteTokenReserves: bigint;
    /** Signed i128 from the Pool account or appended BuyEvent/SellEvent field. */
    virtualQuoteReserves: bigint;
    coinCreatorVaultAta: PublicKey;
    coinCreatorVaultAuthority: PublicKey;
    baseTokenProgram: PublicKey;
    quoteTokenProgram: PublicKey;
    isMayhemMode: boolean;
    isCashbackCoin: boolean;
    coinCreator?: PublicKey;
    cashbackFeeBasisPoints?: bigint;
    feeBasisPoints?: PumpSwapFeeBasisPoints;
}
interface BuildBuyParams {
    payer: PublicKey;
    inputAmount: bigint;
    slippageBasisPoints: bigint;
    protocolParams: PumpSwapParams;
    createInputMintAta?: boolean;
    closeInputMintAta?: boolean;
    createOutputMintAta?: boolean;
    useExactQuoteAmount?: boolean;
    /** Whether buy tracks volume; defaults to true. */
    trackVolume?: boolean;
    fixedOutputAmount?: bigint;
    /** Caller-validated minimum output in atomic units; skips SDK quote math. Buy requires exact-input mode. */
    minimumOutputAmount?: bigint;
}
interface BuildSellParams {
    payer: PublicKey;
    inputAmount: bigint;
    slippageBasisPoints: bigint;
    protocolParams: PumpSwapParams;
    createOutputMintAta?: boolean;
    closeOutputMintAta?: boolean;
    closeInputMintAta?: boolean;
    fixedOutputAmount?: bigint;
    /** Caller-validated minimum output in atomic units; skips SDK quote math. Buy requires exact-input mode. */
    minimumOutputAmount?: bigint;
}
/**
 * Build buy instructions for PumpSwap
 * 100% port from Rust: src/instruction/pumpswap.rs build_buy_instructions
 */
declare function buildBuyInstructions(params: BuildBuyParams): TransactionInstruction[];
/**
 * Build sell instructions for PumpSwap
 * 100% port from Rust: src/instruction/pumpswap.rs build_sell_instructions
 */
declare function buildSellInstructions(params: BuildSellParams): TransactionInstruction[];
/**
 * Build claim cashback instruction for PumpSwap
 */
declare function buildClaimCashbackInstruction(payer: PublicKey, quoteMint: PublicKey, quoteTokenProgram: PublicKey): TransactionInstruction;
/**
 * Current Pool payload size, excluding the 8-byte Anchor discriminator.
 */
declare const POOL_SIZE = 253;
declare const LEGACY_POOL_SIZE = 244;
/**
 * PumpSwap Pool structure
 * Matches Rust: src/instruction/utils/pumpswap_types.rs Pool struct
 */
interface PumpSwapPool {
    poolBump: number;
    index: number;
    creator: PublicKey;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    lpMint: PublicKey;
    poolBaseTokenAccount: PublicKey;
    poolQuoteTokenAccount: PublicKey;
    lpSupply: bigint;
    coinCreator: PublicKey;
    isMayhemMode: boolean;
    isCashbackCoin: boolean;
    virtualQuoteReserves: bigint;
}
interface PumpSwapFeeTier {
    marketCapLamportsThreshold: bigint;
    fees: PumpSwapFeeBasisPoints;
}
interface PumpSwapFeeConfig {
    flatFees: PumpSwapFeeBasisPoints;
    feeTiers: PumpSwapFeeTier[];
    stableFeeTiers: PumpSwapFeeTier[];
}
/**
 * Decode a PumpSwap pool from account data
 * Uses Borsh deserialization
 */
declare function decodePool(data: Buffer): PumpSwapPool | null;
/**
 * Find a PumpSwap pool by mint
 *
 * Search order (matches @pump-fun/pump-swap-sdk):
 * 1. Pool v2 PDA ["pool-v2", base_mint]
 * 2. Canonical pool PDA ["pool", 0, pumpPoolAuthority(mint), mint, WSOL]
 * 3. getProgramAccounts by base_mint / quote_mint
 */
declare function findPoolByMint(connection: {
    getAccountInfo: (pubkey: PublicKey) => Promise<{
        value: {
            data: Buffer;
        } | null;
    }>;
}, mint: PublicKey): Promise<{
    poolAddress: PublicKey;
    pool: PumpSwapPool;
} | null>;
/**
 * Get fee config PDA
 */
declare function getFeeConfigPDA(): PublicKey;
declare function decodeFeeConfig(data: Buffer): PumpSwapFeeConfig | null;
declare function fetchFeeConfig(connection: {
    getAccountInfo: (pubkey: PublicKey) => Promise<{
        value?: {
            data: Buffer;
        } | null;
    }>;
}): Promise<PumpSwapFeeConfig | null>;
declare function calculateFeeTier(feeTiers: PumpSwapFeeTier[], marketCapLamports: bigint): PumpSwapFeeBasisPoints | null;
declare function poolMarketCapLamports(baseMintSupply: bigint, baseReserve: bigint, quoteReserve: bigint): bigint | null;
declare function isCanonicalPumpPool(baseMint: PublicKey, poolCreator: PublicKey): boolean;
declare function computePumpSwapFeeBasisPoints(feeConfig: PumpSwapFeeConfig | null, poolCreator: PublicKey, baseMint: PublicKey, baseMintSupply: bigint | null, baseReserve: bigint, quoteReserve: bigint): PumpSwapFeeBasisPoints;
/**
 * Fetch a PumpSwap pool from RPC.
 * 100% from Rust: src/instruction/utils/pumpswap.rs fetch_pool
 */
declare function fetchPool(connection: {
    getAccountInfo: (pubkey: PublicKey) => Promise<{
        value?: {
            data: Buffer;
        };
    }>;
}, poolAddress: PublicKey): Promise<PumpSwapPool | null>;
/**
 * Get token balances for a pool's token accounts.
 * 100% from Rust: src/instruction/utils/pumpswap.rs get_token_balances
 */
declare function getTokenBalances(connection: {
    getTokenAccountBalance: (pubkey: PublicKey) => Promise<{
        value?: {
            amount: string;
        };
    }>;
}, pool: PumpSwapPool): Promise<{
    baseBalance: bigint;
    quoteBalance: bigint;
} | null>;
/**
 * Find a PumpSwap pool by mint with full RPC lookup.
 * 100% from Rust: src/instruction/utils/pumpswap.rs find_by_mint
 * Search order:
 * 1. Pool v2 PDA ["pool-v2", base_mint]
 * 2. Canonical pool PDA
 * 3. getProgramAccounts by base_mint / quote_mint (optional fallback)
 */
declare function findByMint(connection: {
    getAccountInfo: (pubkey: PublicKey) => Promise<{
        value?: {
            data: Buffer;
        };
    }>;
    getProgramAccounts?: (programId: PublicKey, config?: unknown) => Promise<Array<{
        pubkey: PublicKey;
        account: {
            data: Buffer;
        };
    }>>;
}, mint: PublicKey): Promise<{
    poolAddress: PublicKey;
    pool: PumpSwapPool;
} | null>;
/**
 * Find a PumpSwap pool by base mint using getProgramAccounts.
 * 100% from Rust: src/instruction/utils/pumpswap.rs find_by_base_mint
 * base_mint offset: 8(discriminator) + 1(bump) + 2(index) + 32(creator) = 43
 */
declare function findByBaseMint(connection: {
    getProgramAccounts: (programId: PublicKey, config?: {
        filters?: Array<{
            dataSize?: number;
            memcmp?: {
                offset: number;
                bytes: string;
            };
        }>;
        encoding?: string;
    }) => Promise<Array<{
        pubkey: PublicKey;
        account: {
            data: Buffer;
        };
    }>>;
}, baseMint: PublicKey): Promise<{
    poolAddress: PublicKey;
    pool: PumpSwapPool;
} | null>;
/**
 * Find a PumpSwap pool by quote mint using getProgramAccounts.
 * 100% from Rust: src/instruction/utils/pumpswap.rs find_by_quote_mint
 * quote_mint offset: 8 + 1 + 2 + 32 + 32 = 75
 */
declare function findByQuoteMint(connection: {
    getProgramAccounts: (programId: PublicKey, config?: {
        filters?: Array<{
            dataSize?: number;
            memcmp?: {
                offset: number;
                bytes: string;
            };
        }>;
        encoding?: string;
    }) => Promise<Array<{
        pubkey: PublicKey;
        account: {
            data: Buffer;
        };
    }>>;
}, quoteMint: PublicKey): Promise<{
    poolAddress: PublicKey;
    pool: PumpSwapPool;
} | null>;

type pumpswap_BuildBuyParams = BuildBuyParams;
type pumpswap_BuildSellParams = BuildSellParams;
declare const pumpswap_LEGACY_POOL_SIZE: typeof LEGACY_POOL_SIZE;
declare const pumpswap_POOL_SIZE: typeof POOL_SIZE;
declare const pumpswap_PUMPSWAP_BUY_DISCRIMINATOR: typeof PUMPSWAP_BUY_DISCRIMINATOR;
declare const pumpswap_PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR: typeof PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR;
declare const pumpswap_PUMPSWAP_CLAIM_CASHBACK_DISCRIMINATOR: typeof PUMPSWAP_CLAIM_CASHBACK_DISCRIMINATOR;
declare const pumpswap_PUMPSWAP_DEFAULT_COIN_CREATOR_VAULT_AUTHORITY: typeof PUMPSWAP_DEFAULT_COIN_CREATOR_VAULT_AUTHORITY;
declare const pumpswap_PUMPSWAP_EVENT_AUTHORITY: typeof PUMPSWAP_EVENT_AUTHORITY;
declare const pumpswap_PUMPSWAP_FEE_CONFIG: typeof PUMPSWAP_FEE_CONFIG;
declare const pumpswap_PUMPSWAP_FEE_PROGRAM: typeof PUMPSWAP_FEE_PROGRAM;
declare const pumpswap_PUMPSWAP_FEE_RECIPIENT: typeof PUMPSWAP_FEE_RECIPIENT;
declare const pumpswap_PUMPSWAP_GLOBAL_ACCOUNT: typeof PUMPSWAP_GLOBAL_ACCOUNT;
declare const pumpswap_PUMPSWAP_GLOBAL_VOLUME_ACCUMULATOR: typeof PUMPSWAP_GLOBAL_VOLUME_ACCUMULATOR;
declare const pumpswap_PUMPSWAP_MAYHEM_FEE_RECIPIENTS: typeof PUMPSWAP_MAYHEM_FEE_RECIPIENTS;
declare const pumpswap_PUMPSWAP_POOL_DISCRIMINATOR: typeof PUMPSWAP_POOL_DISCRIMINATOR;
declare const pumpswap_PUMPSWAP_PROGRAM: typeof PUMPSWAP_PROGRAM;
declare const pumpswap_PUMPSWAP_PROTOCOL_EXTRA_FEE_RECIPIENTS: typeof PUMPSWAP_PROTOCOL_EXTRA_FEE_RECIPIENTS;
declare const pumpswap_PUMPSWAP_PUMP_PROGRAM_ID: typeof PUMPSWAP_PUMP_PROGRAM_ID;
declare const pumpswap_PUMPSWAP_SELL_DISCRIMINATOR: typeof PUMPSWAP_SELL_DISCRIMINATOR;
type pumpswap_PumpSwapFeeConfig = PumpSwapFeeConfig;
type pumpswap_PumpSwapFeeTier = PumpSwapFeeTier;
type pumpswap_PumpSwapParams = PumpSwapParams;
type pumpswap_PumpSwapPool = PumpSwapPool;
declare const pumpswap_buildBuyInstructions: typeof buildBuyInstructions;
declare const pumpswap_buildClaimCashbackInstruction: typeof buildClaimCashbackInstruction;
declare const pumpswap_buildSellInstructions: typeof buildSellInstructions;
declare const pumpswap_calculateFeeTier: typeof calculateFeeTier;
declare const pumpswap_closeWsol: typeof closeWsol;
declare const pumpswap_computePumpSwapFeeBasisPoints: typeof computePumpSwapFeeBasisPoints;
declare const pumpswap_createAssociatedTokenAccountIdempotent: typeof createAssociatedTokenAccountIdempotent;
declare const pumpswap_decodeFeeConfig: typeof decodeFeeConfig;
declare const pumpswap_decodePool: typeof decodePool;
declare const pumpswap_fetchFeeConfig: typeof fetchFeeConfig;
declare const pumpswap_fetchPool: typeof fetchPool;
declare const pumpswap_findByBaseMint: typeof findByBaseMint;
declare const pumpswap_findByMint: typeof findByMint;
declare const pumpswap_findByQuoteMint: typeof findByQuoteMint;
declare const pumpswap_findPoolByMint: typeof findPoolByMint;
declare const pumpswap_getAssociatedTokenAddress: typeof getAssociatedTokenAddress;
declare const pumpswap_getCanonicalPoolPDA: typeof getCanonicalPoolPDA;
declare const pumpswap_getCoinCreatorVaultAta: typeof getCoinCreatorVaultAta;
declare const pumpswap_getCoinCreatorVaultAuthority: typeof getCoinCreatorVaultAuthority;
declare const pumpswap_getFeeConfigPDA: typeof getFeeConfigPDA;
declare const pumpswap_getFeeRecipientAta: typeof getFeeRecipientAta;
declare const pumpswap_getGlobalVolumeAccumulatorPDA: typeof getGlobalVolumeAccumulatorPDA;
declare const pumpswap_getMayhemFeeRecipientRandom: typeof getMayhemFeeRecipientRandom;
declare const pumpswap_getPoolV2PDA: typeof getPoolV2PDA;
declare const pumpswap_getPumpPoolAuthorityPDA: typeof getPumpPoolAuthorityPDA;
declare const pumpswap_getPumpSwapProtocolExtraFeeRecipientRandom: typeof getPumpSwapProtocolExtraFeeRecipientRandom;
declare const pumpswap_getPumpSwapProtocolFeeRecipientRandom: typeof getPumpSwapProtocolFeeRecipientRandom;
declare const pumpswap_getTokenBalances: typeof getTokenBalances;
declare const pumpswap_getUserVolumeAccumulatorPDA: typeof getUserVolumeAccumulatorPDA;
declare const pumpswap_getUserVolumeAccumulatorQuoteAta: typeof getUserVolumeAccumulatorQuoteAta;
declare const pumpswap_getUserVolumeAccumulatorWsolAta: typeof getUserVolumeAccumulatorWsolAta;
declare const pumpswap_handleWsol: typeof handleWsol;
declare const pumpswap_isCanonicalPumpPool: typeof isCanonicalPumpPool;
declare const pumpswap_poolMarketCapLamports: typeof poolMarketCapLamports;
declare namespace pumpswap {
  export { type pumpswap_BuildBuyParams as BuildBuyParams, type pumpswap_BuildSellParams as BuildSellParams, pumpswap_LEGACY_POOL_SIZE as LEGACY_POOL_SIZE, pumpswap_POOL_SIZE as POOL_SIZE, pumpswap_PUMPSWAP_BUY_DISCRIMINATOR as PUMPSWAP_BUY_DISCRIMINATOR, pumpswap_PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR as PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR, pumpswap_PUMPSWAP_CLAIM_CASHBACK_DISCRIMINATOR as PUMPSWAP_CLAIM_CASHBACK_DISCRIMINATOR, pumpswap_PUMPSWAP_DEFAULT_COIN_CREATOR_VAULT_AUTHORITY as PUMPSWAP_DEFAULT_COIN_CREATOR_VAULT_AUTHORITY, pumpswap_PUMPSWAP_EVENT_AUTHORITY as PUMPSWAP_EVENT_AUTHORITY, pumpswap_PUMPSWAP_FEE_CONFIG as PUMPSWAP_FEE_CONFIG, pumpswap_PUMPSWAP_FEE_PROGRAM as PUMPSWAP_FEE_PROGRAM, pumpswap_PUMPSWAP_FEE_RECIPIENT as PUMPSWAP_FEE_RECIPIENT, pumpswap_PUMPSWAP_GLOBAL_ACCOUNT as PUMPSWAP_GLOBAL_ACCOUNT, pumpswap_PUMPSWAP_GLOBAL_VOLUME_ACCUMULATOR as PUMPSWAP_GLOBAL_VOLUME_ACCUMULATOR, pumpswap_PUMPSWAP_MAYHEM_FEE_RECIPIENTS as PUMPSWAP_MAYHEM_FEE_RECIPIENTS, pumpswap_PUMPSWAP_POOL_DISCRIMINATOR as PUMPSWAP_POOL_DISCRIMINATOR, pumpswap_PUMPSWAP_PROGRAM as PUMPSWAP_PROGRAM, pumpswap_PUMPSWAP_PROTOCOL_EXTRA_FEE_RECIPIENTS as PUMPSWAP_PROTOCOL_EXTRA_FEE_RECIPIENTS, pumpswap_PUMPSWAP_PUMP_PROGRAM_ID as PUMPSWAP_PUMP_PROGRAM_ID, pumpswap_PUMPSWAP_SELL_DISCRIMINATOR as PUMPSWAP_SELL_DISCRIMINATOR, type pumpswap_PumpSwapFeeConfig as PumpSwapFeeConfig, type pumpswap_PumpSwapFeeTier as PumpSwapFeeTier, type pumpswap_PumpSwapParams as PumpSwapParams, type pumpswap_PumpSwapPool as PumpSwapPool, pumpswap_buildBuyInstructions as buildBuyInstructions, pumpswap_buildClaimCashbackInstruction as buildClaimCashbackInstruction, pumpswap_buildSellInstructions as buildSellInstructions, pumpswap_calculateFeeTier as calculateFeeTier, pumpswap_closeWsol as closeWsol, pumpswap_computePumpSwapFeeBasisPoints as computePumpSwapFeeBasisPoints, pumpswap_createAssociatedTokenAccountIdempotent as createAssociatedTokenAccountIdempotent, pumpswap_decodeFeeConfig as decodeFeeConfig, pumpswap_decodePool as decodePool, pumpswap_fetchFeeConfig as fetchFeeConfig, pumpswap_fetchPool as fetchPool, pumpswap_findByBaseMint as findByBaseMint, pumpswap_findByMint as findByMint, pumpswap_findByQuoteMint as findByQuoteMint, pumpswap_findPoolByMint as findPoolByMint, pumpswap_getAssociatedTokenAddress as getAssociatedTokenAddress, pumpswap_getCanonicalPoolPDA as getCanonicalPoolPDA, pumpswap_getCoinCreatorVaultAta as getCoinCreatorVaultAta, pumpswap_getCoinCreatorVaultAuthority as getCoinCreatorVaultAuthority, pumpswap_getFeeConfigPDA as getFeeConfigPDA, pumpswap_getFeeRecipientAta as getFeeRecipientAta, pumpswap_getGlobalVolumeAccumulatorPDA as getGlobalVolumeAccumulatorPDA, pumpswap_getMayhemFeeRecipientRandom as getMayhemFeeRecipientRandom, pumpswap_getPoolV2PDA as getPoolV2PDA, pumpswap_getPumpPoolAuthorityPDA as getPumpPoolAuthorityPDA, pumpswap_getPumpSwapProtocolExtraFeeRecipientRandom as getPumpSwapProtocolExtraFeeRecipientRandom, pumpswap_getPumpSwapProtocolFeeRecipientRandom as getPumpSwapProtocolFeeRecipientRandom, pumpswap_getTokenBalances as getTokenBalances, pumpswap_getUserVolumeAccumulatorPDA as getUserVolumeAccumulatorPDA, pumpswap_getUserVolumeAccumulatorQuoteAta as getUserVolumeAccumulatorQuoteAta, pumpswap_getUserVolumeAccumulatorWsolAta as getUserVolumeAccumulatorWsolAta, pumpswap_handleWsol as handleWsol, pumpswap_isCanonicalPumpPool as isCanonicalPumpPool, pumpswap_poolMarketCapLamports as poolMarketCapLamports };
}

/** Bonk program ID */
declare const BONK_PROGRAM_ID: PublicKey;
/** Bonk Authority */
declare const BONK_AUTHORITY: PublicKey;
/** Bonk Global Config */
declare const BONK_GLOBAL_CONFIG: PublicKey;
/** Bonk USD1 Global Config */
declare const BONK_USD1_GLOBAL_CONFIG: PublicKey;
/** Bonk Event Authority */
declare const BONK_EVENT_AUTHORITY: PublicKey;
/** WSOL Token Account (mint) */
declare const WSOL_MINT$1: PublicKey;
/** USD1 Token Account (mint) */
declare const USD1_MINT: PublicKey;
/** USDC Token Account (mint) */
declare const USDC_MINT$1: PublicKey;
/** Fee rates - from Rust */
declare const BONK_PLATFORM_FEE_RATE: bigint;
declare const BONK_PROTOCOL_FEE_RATE: bigint;
declare const BONK_SHARE_FEE_RATE: bigint;
/** Buy exact in instruction discriminator */
declare const BONK_BUY_EXACT_IN_DISCRIMINATOR: Buffer;
/** Sell exact in instruction discriminator */
declare const BONK_SELL_EXACT_IN_DISCRIMINATOR: Buffer;
declare const BONK_POOL_SEED: Buffer<ArrayBuffer>;
declare const BONK_POOL_VAULT_SEED: Buffer<ArrayBuffer>;
/**
 * Derive the pool PDA for given base and quote mints
 */
declare function getBonkPoolPda(baseMint: PublicKey, quoteMint: PublicKey): PublicKey;
/**
 * Derive the vault PDA for given pool and mint
 */
declare function getBonkVaultPda(poolState: PublicKey, mint: PublicKey): PublicKey;
/**
 * Get platform associated account PDA
 */
declare function getBonkPlatformAssociatedAccount(platformConfig: PublicKey): PublicKey;
/**
 * Get creator associated account PDA
 */
declare function getBonkCreatorAssociatedAccount(creator: PublicKey): PublicKey;
interface BonkParams {
    poolState: PublicKey;
    baseVault: PublicKey;
    quoteVault: PublicKey;
    virtualBase: bigint;
    virtualQuote: bigint;
    realBase: bigint;
    realQuote: bigint;
    mintTokenProgram: PublicKey;
    platformConfig: PublicKey;
    platformAssociatedAccount: PublicKey;
    creatorAssociatedAccount: PublicKey;
    globalConfig?: PublicKey;
}
interface BonkBuildBuyParams {
    payer: Keypair | PublicKey;
    outputMint: PublicKey;
    inputAmount: bigint;
    slippageBasisPoints?: bigint;
    fixedOutputAmount?: bigint;
    createInputMintAta?: boolean;
    createOutputMintAta?: boolean;
    closeInputMintAta?: boolean;
    protocolParams: BonkParams;
}
interface BonkBuildSellParams {
    payer: Keypair | PublicKey;
    inputMint: PublicKey;
    inputAmount: bigint;
    slippageBasisPoints?: bigint;
    fixedOutputAmount?: bigint;
    createOutputMintAta?: boolean;
    closeOutputMintAta?: boolean;
    closeInputMintAta?: boolean;
    protocolParams: BonkParams;
}
/**
 * Build buy instructions for Bonk protocol
 * 100% port from Rust: src/instruction/bonk.rs build_buy_instructions
 */
declare function buildBonkBuyInstructions(params: BonkBuildBuyParams): TransactionInstruction[];
/**
 * Build sell instructions for Bonk protocol
 * 100% port from Rust: src/instruction/bonk.rs build_sell_instructions
 */
declare function buildBonkSellInstructions(params: BonkBuildSellParams): TransactionInstruction[];
declare const BONK_POOL_STATE_SIZE = 421;
interface BonkVestingSchedule {
    totalLockedAmount: bigint;
    cliffPeriod: bigint;
    unlockPeriod: bigint;
    startTime: bigint;
    allocatedShareAmount: bigint;
}
interface BonkPoolState {
    epoch: bigint;
    authBump: number;
    status: number;
    baseDecimals: number;
    quoteDecimals: number;
    migrateType: number;
    supply: bigint;
    totalBaseSell: bigint;
    virtualBase: bigint;
    virtualQuote: bigint;
    realBase: bigint;
    realQuote: bigint;
    totalQuoteFundRaising: bigint;
    quoteProtocolFee: bigint;
    platformFee: bigint;
    migrateFee: bigint;
    vestingSchedule: BonkVestingSchedule;
    globalConfig: PublicKey;
    platformConfig: PublicKey;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    baseVault: PublicKey;
    quoteVault: PublicKey;
    creator: PublicKey;
}
/**
 * Decode a Bonk pool state from account data
 * 100% from Rust: src/instruction/utils/bonk_types.rs pool_state_decode
 */
declare function decodeBonkPoolState(data: Buffer): BonkPoolState | null;
/**
 * Fetch a Bonk pool state from RPC.
 * 100% from Rust: src/instruction/utils/bonk.rs fetch_pool_state
 */
declare function fetchBonkPoolState(connection: {
    getAccountInfo: (pubkey: PublicKey) => Promise<{
        value?: {
            data: Buffer;
        };
    }>;
}, poolAddress: PublicKey): Promise<BonkPoolState | null>;
/**
 * Get pool PDA for Bonk.
 * Seeds: ["pool", base_mint, quote_mint]
 */
declare function getBonkPoolPDA(baseMint: PublicKey, quoteMint: PublicKey): PublicKey;
/**
 * Get vault PDA for Bonk.
 * Seeds: ["pool_vault", pool_state, mint]
 */
declare function getBonkVaultPDA(poolState: PublicKey, mint: PublicKey): PublicKey;

declare const bonk_builder_BONK_AUTHORITY: typeof BONK_AUTHORITY;
declare const bonk_builder_BONK_BUY_EXACT_IN_DISCRIMINATOR: typeof BONK_BUY_EXACT_IN_DISCRIMINATOR;
declare const bonk_builder_BONK_EVENT_AUTHORITY: typeof BONK_EVENT_AUTHORITY;
declare const bonk_builder_BONK_GLOBAL_CONFIG: typeof BONK_GLOBAL_CONFIG;
declare const bonk_builder_BONK_PLATFORM_FEE_RATE: typeof BONK_PLATFORM_FEE_RATE;
declare const bonk_builder_BONK_POOL_SEED: typeof BONK_POOL_SEED;
declare const bonk_builder_BONK_POOL_STATE_SIZE: typeof BONK_POOL_STATE_SIZE;
declare const bonk_builder_BONK_POOL_VAULT_SEED: typeof BONK_POOL_VAULT_SEED;
declare const bonk_builder_BONK_PROGRAM_ID: typeof BONK_PROGRAM_ID;
declare const bonk_builder_BONK_PROTOCOL_FEE_RATE: typeof BONK_PROTOCOL_FEE_RATE;
declare const bonk_builder_BONK_SELL_EXACT_IN_DISCRIMINATOR: typeof BONK_SELL_EXACT_IN_DISCRIMINATOR;
declare const bonk_builder_BONK_SHARE_FEE_RATE: typeof BONK_SHARE_FEE_RATE;
declare const bonk_builder_BONK_USD1_GLOBAL_CONFIG: typeof BONK_USD1_GLOBAL_CONFIG;
type bonk_builder_BonkBuildBuyParams = BonkBuildBuyParams;
type bonk_builder_BonkBuildSellParams = BonkBuildSellParams;
type bonk_builder_BonkParams = BonkParams;
type bonk_builder_BonkPoolState = BonkPoolState;
type bonk_builder_BonkVestingSchedule = BonkVestingSchedule;
declare const bonk_builder_USD1_MINT: typeof USD1_MINT;
declare const bonk_builder_buildBonkBuyInstructions: typeof buildBonkBuyInstructions;
declare const bonk_builder_buildBonkSellInstructions: typeof buildBonkSellInstructions;
declare const bonk_builder_decodeBonkPoolState: typeof decodeBonkPoolState;
declare const bonk_builder_fetchBonkPoolState: typeof fetchBonkPoolState;
declare const bonk_builder_getBonkCreatorAssociatedAccount: typeof getBonkCreatorAssociatedAccount;
declare const bonk_builder_getBonkPlatformAssociatedAccount: typeof getBonkPlatformAssociatedAccount;
declare const bonk_builder_getBonkPoolPDA: typeof getBonkPoolPDA;
declare const bonk_builder_getBonkPoolPda: typeof getBonkPoolPda;
declare const bonk_builder_getBonkVaultPDA: typeof getBonkVaultPDA;
declare const bonk_builder_getBonkVaultPda: typeof getBonkVaultPda;
declare namespace bonk_builder {
  export { bonk_builder_BONK_AUTHORITY as BONK_AUTHORITY, bonk_builder_BONK_BUY_EXACT_IN_DISCRIMINATOR as BONK_BUY_EXACT_IN_DISCRIMINATOR, bonk_builder_BONK_EVENT_AUTHORITY as BONK_EVENT_AUTHORITY, bonk_builder_BONK_GLOBAL_CONFIG as BONK_GLOBAL_CONFIG, bonk_builder_BONK_PLATFORM_FEE_RATE as BONK_PLATFORM_FEE_RATE, bonk_builder_BONK_POOL_SEED as BONK_POOL_SEED, bonk_builder_BONK_POOL_STATE_SIZE as BONK_POOL_STATE_SIZE, bonk_builder_BONK_POOL_VAULT_SEED as BONK_POOL_VAULT_SEED, bonk_builder_BONK_PROGRAM_ID as BONK_PROGRAM_ID, bonk_builder_BONK_PROTOCOL_FEE_RATE as BONK_PROTOCOL_FEE_RATE, bonk_builder_BONK_SELL_EXACT_IN_DISCRIMINATOR as BONK_SELL_EXACT_IN_DISCRIMINATOR, bonk_builder_BONK_SHARE_FEE_RATE as BONK_SHARE_FEE_RATE, bonk_builder_BONK_USD1_GLOBAL_CONFIG as BONK_USD1_GLOBAL_CONFIG, type bonk_builder_BonkBuildBuyParams as BonkBuildBuyParams, type bonk_builder_BonkBuildSellParams as BonkBuildSellParams, type bonk_builder_BonkParams as BonkParams, type bonk_builder_BonkPoolState as BonkPoolState, type bonk_builder_BonkVestingSchedule as BonkVestingSchedule, bonk_builder_USD1_MINT as USD1_MINT, USDC_MINT$1 as USDC_MINT, WSOL_MINT$1 as WSOL_MINT, bonk_builder_buildBonkBuyInstructions as buildBonkBuyInstructions, bonk_builder_buildBonkSellInstructions as buildBonkSellInstructions, bonk_builder_decodeBonkPoolState as decodeBonkPoolState, bonk_builder_fetchBonkPoolState as fetchBonkPoolState, bonk_builder_getBonkCreatorAssociatedAccount as getBonkCreatorAssociatedAccount, bonk_builder_getBonkPlatformAssociatedAccount as getBonkPlatformAssociatedAccount, bonk_builder_getBonkPoolPDA as getBonkPoolPDA, bonk_builder_getBonkPoolPda as getBonkPoolPda, bonk_builder_getBonkVaultPDA as getBonkVaultPDA, bonk_builder_getBonkVaultPda as getBonkVaultPda };
}

/** Raydium CPMM program ID */
declare const RAYDIUM_CPMM_PROGRAM_ID: PublicKey;
/** Authority */
declare const RAYDIUM_CPMM_AUTHORITY: PublicKey;
/** Fee rates */
declare const RAYDIUM_CPMM_FEE_RATE_DENOMINATOR_VALUE: bigint;
declare const RAYDIUM_CPMM_TRADE_FEE_RATE: bigint;
declare const RAYDIUM_CPMM_CREATOR_FEE_RATE: bigint;
declare const RAYDIUM_CPMM_PROTOCOL_FEE_RATE: bigint;
declare const RAYDIUM_CPMM_FUND_FEE_RATE: bigint;
/** Swap base in instruction discriminator */
declare const RAYDIUM_CPMM_SWAP_BASE_IN_DISCRIMINATOR: Buffer;
/** Swap base out instruction discriminator */
declare const RAYDIUM_CPMM_SWAP_BASE_OUT_DISCRIMINATOR: Buffer;
declare const RAYDIUM_CPMM_POOL_SEED: Buffer<ArrayBuffer>;
declare const RAYDIUM_CPMM_POOL_VAULT_SEED: Buffer<ArrayBuffer>;
declare const RAYDIUM_CPMM_OBSERVATION_STATE_SEED: Buffer<ArrayBuffer>;
/**
 * Derive the pool PDA for given config and mints
 */
declare function getRaydiumCpmmPoolPda(ammConfig: PublicKey, mint1: PublicKey, mint2: PublicKey): PublicKey;
/**
 * Derive the vault PDA for a pool and mint
 */
declare function getRaydiumCpmmVaultPda(poolState: PublicKey, mint: PublicKey): PublicKey;
/**
 * Derive the observation state PDA for a pool
 */
declare function getRaydiumCpmmObservationStatePda(poolState: PublicKey): PublicKey;
/**
 * Compute swap amount for CPMM
 */
declare function computeRaydiumCpmmSwapAmount(baseReserve: bigint, quoteReserve: bigint, isBaseIn: boolean, amountIn: bigint, slippageBasisPoints: bigint): {
    amountOut: bigint;
    minAmountOut: bigint;
};
interface RaydiumCpmmParams {
    poolState?: PublicKey;
    ammConfig: PublicKey;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    baseTokenProgram: PublicKey;
    quoteTokenProgram: PublicKey;
    baseVault?: PublicKey;
    quoteVault?: PublicKey;
    baseReserve: bigint;
    quoteReserve: bigint;
    observationState?: PublicKey;
}
interface BuildRaydiumCpmmBuyInstructionsParams {
    payer: Keypair | PublicKey;
    outputMint: PublicKey;
    inputAmount: bigint;
    slippageBasisPoints?: bigint;
    fixedOutputAmount?: bigint;
    createInputMintAta?: boolean;
    createOutputMintAta?: boolean;
    closeInputMintAta?: boolean;
    protocolParams: RaydiumCpmmParams;
}
interface BuildRaydiumCpmmSellInstructionsParams {
    payer: Keypair | PublicKey;
    inputMint: PublicKey;
    inputAmount: bigint;
    slippageBasisPoints?: bigint;
    fixedOutputAmount?: bigint;
    createOutputMintAta?: boolean;
    closeOutputMintAta?: boolean;
    closeInputMintAta?: boolean;
    protocolParams: RaydiumCpmmParams;
}
/**
 * Build buy instructions for Raydium CPMM protocol
 */
declare function buildRaydiumCpmmBuyInstructions(params: BuildRaydiumCpmmBuyInstructionsParams): TransactionInstruction[];
/**
 * Build sell instructions for Raydium CPMM protocol
 */
declare function buildRaydiumCpmmSellInstructions(params: BuildRaydiumCpmmSellInstructionsParams): TransactionInstruction[];
declare const RAYDIUM_CPMM_POOL_STATE_SIZE = 629;
interface RaydiumCPMMpoolState {
    ammConfig: PublicKey;
    poolCreator: PublicKey;
    token0Vault: PublicKey;
    token1Vault: PublicKey;
    lpMint: PublicKey;
    token0Mint: PublicKey;
    token1Mint: PublicKey;
    token0Program: PublicKey;
    token1Program: PublicKey;
    observationKey: PublicKey;
    authBump: number;
    status: number;
    lpMintDecimals: number;
    mint0Decimals: number;
    mint1Decimals: number;
    lpSupply: bigint;
    protocolFeesToken0: bigint;
    protocolFeesToken1: bigint;
    fundFeesToken0: bigint;
    fundFeesToken1: bigint;
    openTime: bigint;
    recentEpoch: bigint;
}
/**
 * Decode a Raydium CPMM pool state from account data
 * 100% from Rust: src/instruction/utils/raydium_cpmm_types.rs pool_state_decode
 */
declare function decodeRaydiumCPMMpoolState(data: Buffer): RaydiumCPMMpoolState | null;
/**
 * Fetch a Raydium CPMM pool state from RPC.
 * 100% from Rust: src/instruction/utils/raydium_cpmm.rs fetch_pool_state
 */
declare function fetchRaydiumCPMMpoolState(connection: {
    getAccountInfo: (pubkey: PublicKey) => Promise<{
        value?: {
            data: Buffer;
        };
    }>;
}, poolAddress: PublicKey): Promise<RaydiumCPMMpoolState | null>;
/**
 * Get pool PDA for Raydium CPMM.
 * Seeds: ["pool", amm_config, mint1, mint2]
 */
declare function getRaydiumCPMMpoolPDA(ammConfig: PublicKey, mint1: PublicKey, mint2: PublicKey): PublicKey;
/**
 * Get vault PDA for Raydium CPMM.
 * Seeds: ["pool_vault", pool_state, mint]
 */
declare function getRaydiumCPMMvaultPDA(poolState: PublicKey, mint: PublicKey): PublicKey;
/**
 * Get observation state PDA for Raydium CPMM.
 * Seeds: ["observation", pool_state]
 */
declare function getRaydiumCPMMobservationStatePDA(poolState: PublicKey): PublicKey;
/**
 * Get token balances for a Raydium CPMM pool.
 * 100% from Rust: src/instruction/utils/raydium_cpmm.rs get_pool_token_balances
 */
declare function getRaydiumCPMMpoolTokenBalances(connection: {
    getTokenAccountBalance: (pubkey: PublicKey) => Promise<{
        value?: {
            amount: string;
        };
    }>;
}, poolState: PublicKey, token0Mint: PublicKey, token1Mint: PublicKey): Promise<{
    token0Balance: bigint;
    token1Balance: bigint;
} | null>;

type raydium_cpmm_builder_BuildRaydiumCpmmBuyInstructionsParams = BuildRaydiumCpmmBuyInstructionsParams;
type raydium_cpmm_builder_BuildRaydiumCpmmSellInstructionsParams = BuildRaydiumCpmmSellInstructionsParams;
declare const raydium_cpmm_builder_RAYDIUM_CPMM_AUTHORITY: typeof RAYDIUM_CPMM_AUTHORITY;
declare const raydium_cpmm_builder_RAYDIUM_CPMM_CREATOR_FEE_RATE: typeof RAYDIUM_CPMM_CREATOR_FEE_RATE;
declare const raydium_cpmm_builder_RAYDIUM_CPMM_FEE_RATE_DENOMINATOR_VALUE: typeof RAYDIUM_CPMM_FEE_RATE_DENOMINATOR_VALUE;
declare const raydium_cpmm_builder_RAYDIUM_CPMM_FUND_FEE_RATE: typeof RAYDIUM_CPMM_FUND_FEE_RATE;
declare const raydium_cpmm_builder_RAYDIUM_CPMM_OBSERVATION_STATE_SEED: typeof RAYDIUM_CPMM_OBSERVATION_STATE_SEED;
declare const raydium_cpmm_builder_RAYDIUM_CPMM_POOL_SEED: typeof RAYDIUM_CPMM_POOL_SEED;
declare const raydium_cpmm_builder_RAYDIUM_CPMM_POOL_STATE_SIZE: typeof RAYDIUM_CPMM_POOL_STATE_SIZE;
declare const raydium_cpmm_builder_RAYDIUM_CPMM_POOL_VAULT_SEED: typeof RAYDIUM_CPMM_POOL_VAULT_SEED;
declare const raydium_cpmm_builder_RAYDIUM_CPMM_PROGRAM_ID: typeof RAYDIUM_CPMM_PROGRAM_ID;
declare const raydium_cpmm_builder_RAYDIUM_CPMM_PROTOCOL_FEE_RATE: typeof RAYDIUM_CPMM_PROTOCOL_FEE_RATE;
declare const raydium_cpmm_builder_RAYDIUM_CPMM_SWAP_BASE_IN_DISCRIMINATOR: typeof RAYDIUM_CPMM_SWAP_BASE_IN_DISCRIMINATOR;
declare const raydium_cpmm_builder_RAYDIUM_CPMM_SWAP_BASE_OUT_DISCRIMINATOR: typeof RAYDIUM_CPMM_SWAP_BASE_OUT_DISCRIMINATOR;
declare const raydium_cpmm_builder_RAYDIUM_CPMM_TRADE_FEE_RATE: typeof RAYDIUM_CPMM_TRADE_FEE_RATE;
type raydium_cpmm_builder_RaydiumCPMMpoolState = RaydiumCPMMpoolState;
type raydium_cpmm_builder_RaydiumCpmmParams = RaydiumCpmmParams;
declare const raydium_cpmm_builder_buildRaydiumCpmmBuyInstructions: typeof buildRaydiumCpmmBuyInstructions;
declare const raydium_cpmm_builder_buildRaydiumCpmmSellInstructions: typeof buildRaydiumCpmmSellInstructions;
declare const raydium_cpmm_builder_computeRaydiumCpmmSwapAmount: typeof computeRaydiumCpmmSwapAmount;
declare const raydium_cpmm_builder_decodeRaydiumCPMMpoolState: typeof decodeRaydiumCPMMpoolState;
declare const raydium_cpmm_builder_fetchRaydiumCPMMpoolState: typeof fetchRaydiumCPMMpoolState;
declare const raydium_cpmm_builder_getRaydiumCPMMobservationStatePDA: typeof getRaydiumCPMMobservationStatePDA;
declare const raydium_cpmm_builder_getRaydiumCPMMpoolPDA: typeof getRaydiumCPMMpoolPDA;
declare const raydium_cpmm_builder_getRaydiumCPMMpoolTokenBalances: typeof getRaydiumCPMMpoolTokenBalances;
declare const raydium_cpmm_builder_getRaydiumCPMMvaultPDA: typeof getRaydiumCPMMvaultPDA;
declare const raydium_cpmm_builder_getRaydiumCpmmObservationStatePda: typeof getRaydiumCpmmObservationStatePda;
declare const raydium_cpmm_builder_getRaydiumCpmmPoolPda: typeof getRaydiumCpmmPoolPda;
declare const raydium_cpmm_builder_getRaydiumCpmmVaultPda: typeof getRaydiumCpmmVaultPda;
declare namespace raydium_cpmm_builder {
  export { type raydium_cpmm_builder_BuildRaydiumCpmmBuyInstructionsParams as BuildRaydiumCpmmBuyInstructionsParams, type raydium_cpmm_builder_BuildRaydiumCpmmSellInstructionsParams as BuildRaydiumCpmmSellInstructionsParams, raydium_cpmm_builder_RAYDIUM_CPMM_AUTHORITY as RAYDIUM_CPMM_AUTHORITY, raydium_cpmm_builder_RAYDIUM_CPMM_CREATOR_FEE_RATE as RAYDIUM_CPMM_CREATOR_FEE_RATE, raydium_cpmm_builder_RAYDIUM_CPMM_FEE_RATE_DENOMINATOR_VALUE as RAYDIUM_CPMM_FEE_RATE_DENOMINATOR_VALUE, raydium_cpmm_builder_RAYDIUM_CPMM_FUND_FEE_RATE as RAYDIUM_CPMM_FUND_FEE_RATE, raydium_cpmm_builder_RAYDIUM_CPMM_OBSERVATION_STATE_SEED as RAYDIUM_CPMM_OBSERVATION_STATE_SEED, raydium_cpmm_builder_RAYDIUM_CPMM_POOL_SEED as RAYDIUM_CPMM_POOL_SEED, raydium_cpmm_builder_RAYDIUM_CPMM_POOL_STATE_SIZE as RAYDIUM_CPMM_POOL_STATE_SIZE, raydium_cpmm_builder_RAYDIUM_CPMM_POOL_VAULT_SEED as RAYDIUM_CPMM_POOL_VAULT_SEED, raydium_cpmm_builder_RAYDIUM_CPMM_PROGRAM_ID as RAYDIUM_CPMM_PROGRAM_ID, raydium_cpmm_builder_RAYDIUM_CPMM_PROTOCOL_FEE_RATE as RAYDIUM_CPMM_PROTOCOL_FEE_RATE, raydium_cpmm_builder_RAYDIUM_CPMM_SWAP_BASE_IN_DISCRIMINATOR as RAYDIUM_CPMM_SWAP_BASE_IN_DISCRIMINATOR, raydium_cpmm_builder_RAYDIUM_CPMM_SWAP_BASE_OUT_DISCRIMINATOR as RAYDIUM_CPMM_SWAP_BASE_OUT_DISCRIMINATOR, raydium_cpmm_builder_RAYDIUM_CPMM_TRADE_FEE_RATE as RAYDIUM_CPMM_TRADE_FEE_RATE, type raydium_cpmm_builder_RaydiumCPMMpoolState as RaydiumCPMMpoolState, type raydium_cpmm_builder_RaydiumCpmmParams as RaydiumCpmmParams, raydium_cpmm_builder_buildRaydiumCpmmBuyInstructions as buildRaydiumCpmmBuyInstructions, raydium_cpmm_builder_buildRaydiumCpmmSellInstructions as buildRaydiumCpmmSellInstructions, raydium_cpmm_builder_computeRaydiumCpmmSwapAmount as computeRaydiumCpmmSwapAmount, raydium_cpmm_builder_decodeRaydiumCPMMpoolState as decodeRaydiumCPMMpoolState, raydium_cpmm_builder_fetchRaydiumCPMMpoolState as fetchRaydiumCPMMpoolState, raydium_cpmm_builder_getRaydiumCPMMobservationStatePDA as getRaydiumCPMMobservationStatePDA, raydium_cpmm_builder_getRaydiumCPMMpoolPDA as getRaydiumCPMMpoolPDA, raydium_cpmm_builder_getRaydiumCPMMpoolTokenBalances as getRaydiumCPMMpoolTokenBalances, raydium_cpmm_builder_getRaydiumCPMMvaultPDA as getRaydiumCPMMvaultPDA, raydium_cpmm_builder_getRaydiumCpmmObservationStatePda as getRaydiumCpmmObservationStatePda, raydium_cpmm_builder_getRaydiumCpmmPoolPda as getRaydiumCpmmPoolPda, raydium_cpmm_builder_getRaydiumCpmmVaultPda as getRaydiumCpmmVaultPda };
}

/** Raydium AMM V4 program ID */
declare const RAYDIUM_AMM_V4_PROGRAM_ID: PublicKey;
/** Authority */
declare const RAYDIUM_AMM_V4_AUTHORITY: PublicKey;
/** Fee rates */
declare const RAYDIUM_AMM_V4_TRADE_FEE_NUMERATOR: bigint;
declare const RAYDIUM_AMM_V4_TRADE_FEE_DENOMINATOR: bigint;
declare const RAYDIUM_AMM_V4_SWAP_FEE_NUMERATOR: bigint;
declare const RAYDIUM_AMM_V4_SWAP_FEE_DENOMINATOR: bigint;
/** Swap base in instruction discriminator (single byte) */
declare const RAYDIUM_AMM_V4_SWAP_BASE_IN_DISCRIMINATOR: Buffer;
/** Swap base out instruction discriminator (single byte) */
declare const RAYDIUM_AMM_V4_SWAP_BASE_OUT_DISCRIMINATOR: Buffer;
declare const RAYDIUM_AMM_V4_POOL_SEED: Buffer<ArrayBuffer>;
/**
 * Compute swap amount for AMM V4
 */
declare function computeRaydiumAmmV4SwapAmount(coinReserve: bigint, pcReserve: bigint, isCoinIn: boolean, amountIn: bigint, slippageBasisPoints: bigint): {
    amountOut: bigint;
    minAmountOut: bigint;
};
interface RaydiumAmmV4Params {
    amm: PublicKey;
    coinMint: PublicKey;
    pcMint: PublicKey;
    tokenCoin: PublicKey;
    tokenPc: PublicKey;
    ammOpenOrders: PublicKey;
    ammTargetOrders: PublicKey;
    serumProgram: PublicKey;
    serumMarket: PublicKey;
    serumBids: PublicKey;
    serumAsks: PublicKey;
    serumEventQueue: PublicKey;
    serumCoinVaultAccount: PublicKey;
    serumPcVaultAccount: PublicKey;
    serumVaultSigner: PublicKey;
    coinReserve: bigint;
    pcReserve: bigint;
}
interface BuildRaydiumAmmV4BuyInstructionsParams {
    payer: Keypair | PublicKey;
    outputMint: PublicKey;
    inputAmount: bigint;
    slippageBasisPoints?: bigint;
    fixedOutputAmount?: bigint;
    createInputMintAta?: boolean;
    createOutputMintAta?: boolean;
    closeInputMintAta?: boolean;
    protocolParams: RaydiumAmmV4Params;
}
interface BuildRaydiumAmmV4SellInstructionsParams {
    payer: Keypair | PublicKey;
    inputMint: PublicKey;
    outputMint?: PublicKey;
    inputAmount: bigint;
    slippageBasisPoints?: bigint;
    fixedOutputAmount?: bigint;
    createOutputMintAta?: boolean;
    closeOutputMintAta?: boolean;
    closeInputMintAta?: boolean;
    protocolParams: RaydiumAmmV4Params;
}
/**
 * Build buy instructions for Raydium AMM V4 protocol
 */
declare function buildRaydiumAmmV4BuyInstructions(params: BuildRaydiumAmmV4BuyInstructionsParams): TransactionInstruction[];
/**
 * Build sell instructions for Raydium AMM V4 protocol
 */
declare function buildRaydiumAmmV4SellInstructions(params: BuildRaydiumAmmV4SellInstructionsParams): TransactionInstruction[];
declare const AMM_INFO_SIZE = 752;
interface RaydiumAmmFees {
    minSeparateNumerator: bigint;
    minSeparateDenominator: bigint;
    tradeFeeNumerator: bigint;
    tradeFeeDenominator: bigint;
    pnlNumerator: bigint;
    pnlDenominator: bigint;
    swapFeeNumerator: bigint;
    swapFeeDenominator: bigint;
}
interface RaydiumAmmOutputData {
    needTakePnlCoin: bigint;
    needTakePnlPc: bigint;
    totalPnlPc: bigint;
    totalPnlCoin: bigint;
    poolOpenTime: bigint;
    punishPcAmount: bigint;
    punishCoinAmount: bigint;
    orderbookToInitTime: bigint;
    swapCoinInAmount: bigint;
    swapPcOutAmount: bigint;
    swapTakePcFee: bigint;
    swapPcInAmount: bigint;
    swapCoinOutAmount: bigint;
    swapTakeCoinFee: bigint;
}
interface RaydiumAmmInfo {
    status: bigint;
    nonce: bigint;
    orderNum: bigint;
    depth: bigint;
    coinDecimals: bigint;
    pcDecimals: bigint;
    state: bigint;
    resetFlag: bigint;
    minSize: bigint;
    volMaxCutRatio: bigint;
    amountWave: bigint;
    coinLotSize: bigint;
    pcLotSize: bigint;
    minPriceMultiplier: bigint;
    maxPriceMultiplier: bigint;
    sysDecimalValue: bigint;
    fees: RaydiumAmmFees;
    output: RaydiumAmmOutputData;
    tokenCoin: PublicKey;
    tokenPc: PublicKey;
    coinMint: PublicKey;
    pcMint: PublicKey;
    lpMint: PublicKey;
    openOrders: PublicKey;
    market: PublicKey;
    serumDex: PublicKey;
    targetOrders: PublicKey;
    withdrawQueue: PublicKey;
    tokenTempLp: PublicKey;
    ammOwner: PublicKey;
    lpAmount: bigint;
    clientOrderId: bigint;
}
interface RaydiumMarketState {
    vaultSignerNonce: bigint;
    serumCoinVaultAccount: PublicKey;
    serumPcVaultAccount: PublicKey;
    serumEventQueue: PublicKey;
    serumBids: PublicKey;
    serumAsks: PublicKey;
}
declare const MARKET_STATE_SIZE = 388;
/**
 * Decode Raydium AMM v4 info from account data.
 * 100% from Rust: src/instruction/utils/raydium_amm_v4_types.rs amm_info_decode
 */
declare function decodeAmmInfo(data: Buffer): RaydiumAmmInfo | null;
declare function decodeMarketState(data: Buffer): RaydiumMarketState | null;
declare function deriveSerumVaultSigner(serumProgram: PublicKey, serumMarket: PublicKey, vaultSignerNonce: bigint): PublicKey;
/**
 * Fetch AMM info from RPC.
 * 100% from Rust: src/instruction/utils/raydium_amm_v4.rs fetch_amm_info
 */
declare function fetchAmmInfo(connection: {
    getAccountInfo: (pubkey: PublicKey) => Promise<{
        value?: {
            data: Buffer;
        };
    }>;
}, amm: PublicKey): Promise<RaydiumAmmInfo | null>;
declare function fetchMarketState(connection: {
    getAccountInfo: (pubkey: PublicKey) => Promise<{
        value?: {
            data: Buffer;
        };
    }>;
}, market: PublicKey): Promise<RaydiumMarketState | null>;

declare const raydium_amm_v4_builder_AMM_INFO_SIZE: typeof AMM_INFO_SIZE;
type raydium_amm_v4_builder_BuildRaydiumAmmV4BuyInstructionsParams = BuildRaydiumAmmV4BuyInstructionsParams;
type raydium_amm_v4_builder_BuildRaydiumAmmV4SellInstructionsParams = BuildRaydiumAmmV4SellInstructionsParams;
declare const raydium_amm_v4_builder_MARKET_STATE_SIZE: typeof MARKET_STATE_SIZE;
declare const raydium_amm_v4_builder_RAYDIUM_AMM_V4_AUTHORITY: typeof RAYDIUM_AMM_V4_AUTHORITY;
declare const raydium_amm_v4_builder_RAYDIUM_AMM_V4_POOL_SEED: typeof RAYDIUM_AMM_V4_POOL_SEED;
declare const raydium_amm_v4_builder_RAYDIUM_AMM_V4_PROGRAM_ID: typeof RAYDIUM_AMM_V4_PROGRAM_ID;
declare const raydium_amm_v4_builder_RAYDIUM_AMM_V4_SWAP_BASE_IN_DISCRIMINATOR: typeof RAYDIUM_AMM_V4_SWAP_BASE_IN_DISCRIMINATOR;
declare const raydium_amm_v4_builder_RAYDIUM_AMM_V4_SWAP_BASE_OUT_DISCRIMINATOR: typeof RAYDIUM_AMM_V4_SWAP_BASE_OUT_DISCRIMINATOR;
declare const raydium_amm_v4_builder_RAYDIUM_AMM_V4_SWAP_FEE_DENOMINATOR: typeof RAYDIUM_AMM_V4_SWAP_FEE_DENOMINATOR;
declare const raydium_amm_v4_builder_RAYDIUM_AMM_V4_SWAP_FEE_NUMERATOR: typeof RAYDIUM_AMM_V4_SWAP_FEE_NUMERATOR;
declare const raydium_amm_v4_builder_RAYDIUM_AMM_V4_TRADE_FEE_DENOMINATOR: typeof RAYDIUM_AMM_V4_TRADE_FEE_DENOMINATOR;
declare const raydium_amm_v4_builder_RAYDIUM_AMM_V4_TRADE_FEE_NUMERATOR: typeof RAYDIUM_AMM_V4_TRADE_FEE_NUMERATOR;
type raydium_amm_v4_builder_RaydiumAmmFees = RaydiumAmmFees;
type raydium_amm_v4_builder_RaydiumAmmInfo = RaydiumAmmInfo;
type raydium_amm_v4_builder_RaydiumAmmOutputData = RaydiumAmmOutputData;
type raydium_amm_v4_builder_RaydiumAmmV4Params = RaydiumAmmV4Params;
type raydium_amm_v4_builder_RaydiumMarketState = RaydiumMarketState;
declare const raydium_amm_v4_builder_buildRaydiumAmmV4BuyInstructions: typeof buildRaydiumAmmV4BuyInstructions;
declare const raydium_amm_v4_builder_buildRaydiumAmmV4SellInstructions: typeof buildRaydiumAmmV4SellInstructions;
declare const raydium_amm_v4_builder_computeRaydiumAmmV4SwapAmount: typeof computeRaydiumAmmV4SwapAmount;
declare const raydium_amm_v4_builder_decodeAmmInfo: typeof decodeAmmInfo;
declare const raydium_amm_v4_builder_decodeMarketState: typeof decodeMarketState;
declare const raydium_amm_v4_builder_deriveSerumVaultSigner: typeof deriveSerumVaultSigner;
declare const raydium_amm_v4_builder_fetchAmmInfo: typeof fetchAmmInfo;
declare const raydium_amm_v4_builder_fetchMarketState: typeof fetchMarketState;
declare namespace raydium_amm_v4_builder {
  export { raydium_amm_v4_builder_AMM_INFO_SIZE as AMM_INFO_SIZE, type raydium_amm_v4_builder_BuildRaydiumAmmV4BuyInstructionsParams as BuildRaydiumAmmV4BuyInstructionsParams, type raydium_amm_v4_builder_BuildRaydiumAmmV4SellInstructionsParams as BuildRaydiumAmmV4SellInstructionsParams, raydium_amm_v4_builder_MARKET_STATE_SIZE as MARKET_STATE_SIZE, raydium_amm_v4_builder_RAYDIUM_AMM_V4_AUTHORITY as RAYDIUM_AMM_V4_AUTHORITY, raydium_amm_v4_builder_RAYDIUM_AMM_V4_POOL_SEED as RAYDIUM_AMM_V4_POOL_SEED, raydium_amm_v4_builder_RAYDIUM_AMM_V4_PROGRAM_ID as RAYDIUM_AMM_V4_PROGRAM_ID, raydium_amm_v4_builder_RAYDIUM_AMM_V4_SWAP_BASE_IN_DISCRIMINATOR as RAYDIUM_AMM_V4_SWAP_BASE_IN_DISCRIMINATOR, raydium_amm_v4_builder_RAYDIUM_AMM_V4_SWAP_BASE_OUT_DISCRIMINATOR as RAYDIUM_AMM_V4_SWAP_BASE_OUT_DISCRIMINATOR, raydium_amm_v4_builder_RAYDIUM_AMM_V4_SWAP_FEE_DENOMINATOR as RAYDIUM_AMM_V4_SWAP_FEE_DENOMINATOR, raydium_amm_v4_builder_RAYDIUM_AMM_V4_SWAP_FEE_NUMERATOR as RAYDIUM_AMM_V4_SWAP_FEE_NUMERATOR, raydium_amm_v4_builder_RAYDIUM_AMM_V4_TRADE_FEE_DENOMINATOR as RAYDIUM_AMM_V4_TRADE_FEE_DENOMINATOR, raydium_amm_v4_builder_RAYDIUM_AMM_V4_TRADE_FEE_NUMERATOR as RAYDIUM_AMM_V4_TRADE_FEE_NUMERATOR, type raydium_amm_v4_builder_RaydiumAmmFees as RaydiumAmmFees, type raydium_amm_v4_builder_RaydiumAmmInfo as RaydiumAmmInfo, type raydium_amm_v4_builder_RaydiumAmmOutputData as RaydiumAmmOutputData, type raydium_amm_v4_builder_RaydiumAmmV4Params as RaydiumAmmV4Params, type raydium_amm_v4_builder_RaydiumMarketState as RaydiumMarketState, raydium_amm_v4_builder_buildRaydiumAmmV4BuyInstructions as buildRaydiumAmmV4BuyInstructions, raydium_amm_v4_builder_buildRaydiumAmmV4SellInstructions as buildRaydiumAmmV4SellInstructions, raydium_amm_v4_builder_computeRaydiumAmmV4SwapAmount as computeRaydiumAmmV4SwapAmount, raydium_amm_v4_builder_decodeAmmInfo as decodeAmmInfo, raydium_amm_v4_builder_decodeMarketState as decodeMarketState, raydium_amm_v4_builder_deriveSerumVaultSigner as deriveSerumVaultSigner, raydium_amm_v4_builder_fetchAmmInfo as fetchAmmInfo, raydium_amm_v4_builder_fetchMarketState as fetchMarketState };
}

/** Meteora DAMM V2 program ID */
declare const METEORA_DAMM_V2_PROGRAM_ID: PublicKey;
/** Authority */
declare const METEORA_DAMM_V2_AUTHORITY: PublicKey;
/** Swap instruction discriminator */
declare const METEORA_DAMM_V2_SWAP_DISCRIMINATOR: Buffer;
declare const METEORA_DAMM_V2_SWAP2_DISCRIMINATOR: Buffer;
declare const METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL = 1;
declare const METEORA_DAMM_V2_EVENT_AUTHORITY_SEED: Buffer<ArrayBuffer>;
/**
 * Derive the event authority PDA
 */
declare function getMeteoraDammV2EventAuthorityPda(): PublicKey;
interface MeteoraDammV2Params {
    pool: PublicKey;
    tokenAMint: PublicKey;
    tokenBMint: PublicKey;
    tokenAVault: PublicKey;
    tokenBVault: PublicKey;
    tokenAProgram: PublicKey;
    tokenBProgram: PublicKey;
}
interface BuildMeteoraDammV2BuyInstructionsParams {
    payer: Keypair | PublicKey;
    inputMint: PublicKey;
    outputMint: PublicKey;
    inputAmount: bigint;
    slippageBasisPoints?: bigint;
    fixedOutputAmount?: bigint;
    createInputMintAta?: boolean;
    createOutputMintAta?: boolean;
    closeInputMintAta?: boolean;
    protocolParams: MeteoraDammV2Params;
}
interface BuildMeteoraDammV2SellInstructionsParams {
    payer: Keypair | PublicKey;
    inputMint: PublicKey;
    outputMint: PublicKey;
    inputAmount: bigint;
    slippageBasisPoints?: bigint;
    fixedOutputAmount?: bigint;
    createOutputMintAta?: boolean;
    closeOutputMintAta?: boolean;
    closeInputMintAta?: boolean;
    protocolParams: MeteoraDammV2Params;
}
/**
 * Build buy instructions for Meteora DAMM V2 protocol
 */
declare function buildMeteoraDammV2BuyInstructions(params: BuildMeteoraDammV2BuyInstructionsParams): TransactionInstruction[];
/**
 * Build sell instructions for Meteora DAMM V2 protocol
 */
declare function buildMeteoraDammV2SellInstructions(params: BuildMeteoraDammV2SellInstructionsParams): TransactionInstruction[];
/** Pool size in bytes */
declare const METEORA_POOL_SIZE = 1104;
/**
 * Meteora DAMM V2 Pool structure (simplified for essential fields)
 * 100% from Rust: src/instruction/utils/meteora_damm_v2_types.rs Pool
 */
interface MeteoraDammV2Pool {
    tokenAMint: PublicKey;
    tokenBMint: PublicKey;
    tokenAVault: PublicKey;
    tokenBVault: PublicKey;
    liquidity: bigint;
    sqrtPrice: bigint;
    poolStatus: number;
    tokenAFlag: number;
    tokenBFlag: number;
}
/**
 * Decode a Meteora DAMM V2 pool from account data.
 * 100% from Rust: src/instruction/utils/meteora_damm_v2_types.rs pool_decode
 */
declare function decodeMeteoraPool(data: Buffer): MeteoraDammV2Pool | null;
/**
 * Fetch a Meteora DAMM V2 pool from RPC.
 * 100% from Rust: src/instruction/utils/meteora_damm_v2.rs fetch_pool
 */
declare function fetchMeteoraPool(connection: {
    getAccountInfo: (pubkey: PublicKey) => Promise<{
        value?: {
            data: Buffer;
            owner?: PublicKey;
        };
    }>;
}, poolAddress: PublicKey): Promise<MeteoraDammV2Pool | null>;

type meteora_damm_v2_builder_BuildMeteoraDammV2BuyInstructionsParams = BuildMeteoraDammV2BuyInstructionsParams;
type meteora_damm_v2_builder_BuildMeteoraDammV2SellInstructionsParams = BuildMeteoraDammV2SellInstructionsParams;
declare const meteora_damm_v2_builder_METEORA_DAMM_V2_AUTHORITY: typeof METEORA_DAMM_V2_AUTHORITY;
declare const meteora_damm_v2_builder_METEORA_DAMM_V2_EVENT_AUTHORITY_SEED: typeof METEORA_DAMM_V2_EVENT_AUTHORITY_SEED;
declare const meteora_damm_v2_builder_METEORA_DAMM_V2_PROGRAM_ID: typeof METEORA_DAMM_V2_PROGRAM_ID;
declare const meteora_damm_v2_builder_METEORA_DAMM_V2_SWAP2_DISCRIMINATOR: typeof METEORA_DAMM_V2_SWAP2_DISCRIMINATOR;
declare const meteora_damm_v2_builder_METEORA_DAMM_V2_SWAP_DISCRIMINATOR: typeof METEORA_DAMM_V2_SWAP_DISCRIMINATOR;
declare const meteora_damm_v2_builder_METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL: typeof METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL;
declare const meteora_damm_v2_builder_METEORA_POOL_SIZE: typeof METEORA_POOL_SIZE;
type meteora_damm_v2_builder_MeteoraDammV2Params = MeteoraDammV2Params;
type meteora_damm_v2_builder_MeteoraDammV2Pool = MeteoraDammV2Pool;
declare const meteora_damm_v2_builder_buildMeteoraDammV2BuyInstructions: typeof buildMeteoraDammV2BuyInstructions;
declare const meteora_damm_v2_builder_buildMeteoraDammV2SellInstructions: typeof buildMeteoraDammV2SellInstructions;
declare const meteora_damm_v2_builder_decodeMeteoraPool: typeof decodeMeteoraPool;
declare const meteora_damm_v2_builder_fetchMeteoraPool: typeof fetchMeteoraPool;
declare const meteora_damm_v2_builder_getMeteoraDammV2EventAuthorityPda: typeof getMeteoraDammV2EventAuthorityPda;
declare namespace meteora_damm_v2_builder {
  export { type meteora_damm_v2_builder_BuildMeteoraDammV2BuyInstructionsParams as BuildMeteoraDammV2BuyInstructionsParams, type meteora_damm_v2_builder_BuildMeteoraDammV2SellInstructionsParams as BuildMeteoraDammV2SellInstructionsParams, meteora_damm_v2_builder_METEORA_DAMM_V2_AUTHORITY as METEORA_DAMM_V2_AUTHORITY, meteora_damm_v2_builder_METEORA_DAMM_V2_EVENT_AUTHORITY_SEED as METEORA_DAMM_V2_EVENT_AUTHORITY_SEED, meteora_damm_v2_builder_METEORA_DAMM_V2_PROGRAM_ID as METEORA_DAMM_V2_PROGRAM_ID, meteora_damm_v2_builder_METEORA_DAMM_V2_SWAP2_DISCRIMINATOR as METEORA_DAMM_V2_SWAP2_DISCRIMINATOR, meteora_damm_v2_builder_METEORA_DAMM_V2_SWAP_DISCRIMINATOR as METEORA_DAMM_V2_SWAP_DISCRIMINATOR, meteora_damm_v2_builder_METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL as METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL, meteora_damm_v2_builder_METEORA_POOL_SIZE as METEORA_POOL_SIZE, type meteora_damm_v2_builder_MeteoraDammV2Params as MeteoraDammV2Params, type meteora_damm_v2_builder_MeteoraDammV2Pool as MeteoraDammV2Pool, meteora_damm_v2_builder_buildMeteoraDammV2BuyInstructions as buildMeteoraDammV2BuyInstructions, meteora_damm_v2_builder_buildMeteoraDammV2SellInstructions as buildMeteoraDammV2SellInstructions, meteora_damm_v2_builder_decodeMeteoraPool as decodeMeteoraPool, meteora_damm_v2_builder_fetchMeteoraPool as fetchMeteoraPool, meteora_damm_v2_builder_getMeteoraDammV2EventAuthorityPda as getMeteoraDammV2EventAuthorityPda };
}

declare const SYSTEM_PROGRAM: PublicKey;
declare const TOKEN_PROGRAM: PublicKey;
declare const TOKEN_PROGRAM_2022: PublicKey;
declare const SOL_TOKEN_ACCOUNT: PublicKey;
declare const WSOL_TOKEN_ACCOUNT: PublicKey;
declare const USD1_TOKEN_ACCOUNT: PublicKey;
declare const USDC_TOKEN_ACCOUNT: PublicKey;
declare const ASSOCIATED_TOKEN_PROGRAM: PublicKey;
declare const RENT: PublicKey;
declare const PUMPFUN_PROGRAM: PublicKey;
/** PumpSwap AMM program (same as `instruction/pumpswap` PUMPSWAP_PROGRAM) */
declare const PUMPSWAP_PROGRAM_ID: PublicKey;
declare const BONK_PROGRAM: PublicKey;
declare const RAYDIUM_CPMM_PROGRAM: PublicKey;
declare const RAYDIUM_AMM_V4_PROGRAM: PublicKey;
declare const METEORA_DAMM_V2_PROGRAM: PublicKey;
declare const SDK_FEE_RECIPIENT: PublicKey;
declare const SDK_MAYHEM_FEE_RECIPIENTS: PublicKey[];
declare const PUMPFUN_DISCRIMINATORS: {
    BUY: Buffer<ArrayBuffer>;
    SELL: Buffer<ArrayBuffer>;
    BUY_EXACT_SOL_IN: Buffer<ArrayBuffer>;
    CLAIM_CASHBACK: Buffer<ArrayBuffer>;
};
declare const PUMPSWAP_DISCRIMINATORS: {
    SWAP: Buffer<ArrayBuffer>;
    DEPOSIT: Buffer<ArrayBuffer>;
    WITHDRAW: Buffer<ArrayBuffer>;
};
declare const DEFAULT_SLIPPAGE = 500;
declare const DEFAULT_COMPUTE_UNITS = 200000;
declare const DEFAULT_PRIORITY_FEE = 100000;
declare const DEFAULT_TIP_LAMPORTS = 100000;
/** Aggregate for consumers expecting a single `CONSTANTS` object (matches historical `index` export). */
declare const CONSTANTS: {
    readonly SYSTEM_PROGRAM: PublicKey;
    readonly TOKEN_PROGRAM: PublicKey;
    readonly TOKEN_PROGRAM_2022: PublicKey;
    readonly SOL_TOKEN_ACCOUNT: PublicKey;
    readonly WSOL_TOKEN_ACCOUNT: PublicKey;
    readonly USD1_TOKEN_ACCOUNT: PublicKey;
    readonly USDC_TOKEN_ACCOUNT: PublicKey;
    readonly ASSOCIATED_TOKEN_PROGRAM: PublicKey;
    readonly RENT: PublicKey;
    readonly PUMPFUN_PROGRAM: PublicKey;
    readonly PUMPSWAP_PROGRAM: PublicKey;
    readonly BONK_PROGRAM: PublicKey;
    readonly RAYDIUM_CPMM_PROGRAM: PublicKey;
    readonly RAYDIUM_AMM_V4_PROGRAM: PublicKey;
    readonly METEORA_DAMM_V2_PROGRAM: PublicKey;
    readonly DEFAULT_SLIPPAGE: 500;
    readonly DEFAULT_COMPUTE_UNITS: 200000;
    readonly DEFAULT_PRIORITY_FEE: 100000;
    readonly DEFAULT_TIP_LAMPORTS: 100000;
};
declare const SWQOS_ENDPOINTS: Record<string, Record<string, string>>;

declare const index_ASSOCIATED_TOKEN_PROGRAM: typeof ASSOCIATED_TOKEN_PROGRAM;
declare const index_BONK_PROGRAM: typeof BONK_PROGRAM;
declare const index_CONSTANTS: typeof CONSTANTS;
declare const index_DEFAULT_COMPUTE_UNITS: typeof DEFAULT_COMPUTE_UNITS;
declare const index_DEFAULT_PRIORITY_FEE: typeof DEFAULT_PRIORITY_FEE;
declare const index_DEFAULT_SLIPPAGE: typeof DEFAULT_SLIPPAGE;
declare const index_DEFAULT_TIP_LAMPORTS: typeof DEFAULT_TIP_LAMPORTS;
declare const index_METEORA_DAMM_V2_PROGRAM: typeof METEORA_DAMM_V2_PROGRAM;
declare const index_PUMPFUN_DISCRIMINATORS: typeof PUMPFUN_DISCRIMINATORS;
declare const index_PUMPFUN_PROGRAM: typeof PUMPFUN_PROGRAM;
declare const index_PUMPSWAP_DISCRIMINATORS: typeof PUMPSWAP_DISCRIMINATORS;
declare const index_PUMPSWAP_PROGRAM_ID: typeof PUMPSWAP_PROGRAM_ID;
declare const index_RAYDIUM_AMM_V4_PROGRAM: typeof RAYDIUM_AMM_V4_PROGRAM;
declare const index_RAYDIUM_CPMM_PROGRAM: typeof RAYDIUM_CPMM_PROGRAM;
declare const index_RENT: typeof RENT;
declare const index_SDK_FEE_RECIPIENT: typeof SDK_FEE_RECIPIENT;
declare const index_SDK_MAYHEM_FEE_RECIPIENTS: typeof SDK_MAYHEM_FEE_RECIPIENTS;
declare const index_SOL_TOKEN_ACCOUNT: typeof SOL_TOKEN_ACCOUNT;
declare const index_SWQOS_ENDPOINTS: typeof SWQOS_ENDPOINTS;
declare const index_SYSTEM_PROGRAM: typeof SYSTEM_PROGRAM;
declare const index_TOKEN_PROGRAM: typeof TOKEN_PROGRAM;
declare const index_TOKEN_PROGRAM_2022: typeof TOKEN_PROGRAM_2022;
declare const index_USD1_TOKEN_ACCOUNT: typeof USD1_TOKEN_ACCOUNT;
declare const index_USDC_TOKEN_ACCOUNT: typeof USDC_TOKEN_ACCOUNT;
declare const index_WSOL_TOKEN_ACCOUNT: typeof WSOL_TOKEN_ACCOUNT;
declare namespace index {
  export { index_ASSOCIATED_TOKEN_PROGRAM as ASSOCIATED_TOKEN_PROGRAM, index_BONK_PROGRAM as BONK_PROGRAM, index_CONSTANTS as CONSTANTS, index_DEFAULT_COMPUTE_UNITS as DEFAULT_COMPUTE_UNITS, index_DEFAULT_PRIORITY_FEE as DEFAULT_PRIORITY_FEE, index_DEFAULT_SLIPPAGE as DEFAULT_SLIPPAGE, index_DEFAULT_TIP_LAMPORTS as DEFAULT_TIP_LAMPORTS, index_METEORA_DAMM_V2_PROGRAM as METEORA_DAMM_V2_PROGRAM, index_PUMPFUN_DISCRIMINATORS as PUMPFUN_DISCRIMINATORS, index_PUMPFUN_PROGRAM as PUMPFUN_PROGRAM, index_PUMPSWAP_DISCRIMINATORS as PUMPSWAP_DISCRIMINATORS, index_PUMPSWAP_PROGRAM_ID as PUMPSWAP_PROGRAM_ID, index_RAYDIUM_AMM_V4_PROGRAM as RAYDIUM_AMM_V4_PROGRAM, index_RAYDIUM_CPMM_PROGRAM as RAYDIUM_CPMM_PROGRAM, index_RENT as RENT, index_SDK_FEE_RECIPIENT as SDK_FEE_RECIPIENT, index_SDK_MAYHEM_FEE_RECIPIENTS as SDK_MAYHEM_FEE_RECIPIENTS, index_SOL_TOKEN_ACCOUNT as SOL_TOKEN_ACCOUNT, index_SWQOS_ENDPOINTS as SWQOS_ENDPOINTS, index_SYSTEM_PROGRAM as SYSTEM_PROGRAM, index_TOKEN_PROGRAM as TOKEN_PROGRAM, index_TOKEN_PROGRAM_2022 as TOKEN_PROGRAM_2022, index_USD1_TOKEN_ACCOUNT as USD1_TOKEN_ACCOUNT, index_USDC_TOKEN_ACCOUNT as USDC_TOKEN_ACCOUNT, index_WSOL_TOKEN_ACCOUNT as WSOL_TOKEN_ACCOUNT };
}

/**
 * SPL Token utilities for Sol Trade SDK
 * Provides token account management, mint operations, and instruction building.
 */

/**
 * SPL Token Program ID
 */
declare const TOKEN_PROGRAM_ID: PublicKey;
/**
 * SPL Token 2022 Program ID
 */
declare const TOKEN_2022_PROGRAM_ID: PublicKey;
/**
 * Associated Token Account Program ID
 */
declare const ASSOCIATED_TOKEN_PROGRAM_ID: PublicKey;
/**
 * Token account state
 */
declare enum AccountState {
    Uninitialized = 0,
    Initialized = 1,
    Frozen = 2
}
/**
 * Token account information
 */
interface TokenAccount {
    address: PublicKey;
    mint: PublicKey;
    owner: PublicKey;
    amount: bigint;
    delegate?: PublicKey;
    state: AccountState;
    isNative?: bigint;
    delegatedAmount: bigint;
    closeAuthority?: PublicKey;
    tokenProgram: PublicKey;
}
/**
 * Mint account information
 */
interface Mint {
    address: PublicKey;
    mintAuthority?: PublicKey;
    supply: bigint;
    decimals: number;
    isInitialized: boolean;
    freezeAuthority?: PublicKey;
    tokenProgram: PublicKey;
}
/**
 * Token account layout sizes
 */
declare const TOKEN_ACCOUNT_SIZE = 165;
declare const MINT_SIZE = 82;
declare const MULTISIG_SIZE = 355;
/**
 * Instruction types for SPL Token program
 */
declare enum TokenInstruction {
    InitializeMint = 0,
    InitializeAccount = 1,
    InitializeMultisig = 2,
    Transfer = 3,
    Approve = 4,
    Revoke = 5,
    SetAuthority = 6,
    MintTo = 7,
    Burn = 8,
    CloseAccount = 9,
    FreezeAccount = 10,
    ThawAccount = 11,
    TransferChecked = 12,
    ApproveChecked = 13,
    MintToChecked = 14,
    BurnChecked = 15,
    InitializeAccount2 = 16,
    SyncNative = 17,
    InitializeAccount3 = 18,
    InitializeMultisig2 = 19,
    InitializeMint2 = 20,
    GetAccountDataSize = 21,
    InitializeImmutableOwner = 22,
    AmountToUiAmount = 23,
    UiAmountToAmount = 24,
    InitializeMintCloseAuthority = 25,
    CreateNativeMint = 29,
    InitializeNonTransferableMint = 27,
    InitializePermanentDelegate = 35
}
/**
 * Authority types for SetAuthority instruction
 */
declare enum AuthorityType {
    MintTokens = 0,
    FreezeAccount = 1,
    AccountOwner = 2,
    CloseAccount = 3
}
/**
 * Builder for SPL Token instructions
 */
declare class TokenInstructionBuilder {
    /**
     * Create InitializeMint instruction
     */
    static initializeMint(mint: PublicKey, decimals: number, mintAuthority: PublicKey, freezeAuthority: PublicKey | null, tokenProgram?: PublicKey): TransactionInstruction;
    /**
     * Create InitializeAccount instruction
     */
    static initializeAccount(account: PublicKey, mint: PublicKey, owner: PublicKey, tokenProgram?: PublicKey): TransactionInstruction;
    /**
     * Create Transfer instruction
     */
    static transfer(source: PublicKey, destination: PublicKey, owner: PublicKey, amount: bigint, multiSigners?: PublicKey[], tokenProgram?: PublicKey): TransactionInstruction;
    /**
     * Create TransferChecked instruction
     */
    static transferChecked(source: PublicKey, mint: PublicKey, destination: PublicKey, owner: PublicKey, amount: bigint, decimals: number, multiSigners?: PublicKey[], tokenProgram?: PublicKey): TransactionInstruction;
    /**
     * Create MintTo instruction
     */
    static mintTo(mint: PublicKey, destination: PublicKey, authority: PublicKey, amount: bigint, multiSigners?: PublicKey[], tokenProgram?: PublicKey): TransactionInstruction;
    /**
     * Create Burn instruction
     */
    static burn(account: PublicKey, mint: PublicKey, owner: PublicKey, amount: bigint, multiSigners?: PublicKey[], tokenProgram?: PublicKey): TransactionInstruction;
    /**
     * Create Approve instruction
     */
    static approve(account: PublicKey, delegate: PublicKey, owner: PublicKey, amount: bigint, multiSigners?: PublicKey[], tokenProgram?: PublicKey): TransactionInstruction;
    /**
     * Create Revoke instruction
     */
    static revoke(account: PublicKey, owner: PublicKey, multiSigners?: PublicKey[], tokenProgram?: PublicKey): TransactionInstruction;
    /**
     * Create CloseAccount instruction
     */
    static closeAccount(account: PublicKey, destination: PublicKey, owner: PublicKey, multiSigners?: PublicKey[], tokenProgram?: PublicKey): TransactionInstruction;
    /**
     * Create SyncNative instruction (for WSOL accounts)
     */
    static syncNative(nativeAccount: PublicKey, tokenProgram?: PublicKey): TransactionInstruction;
}
/**
 * Token utility functions
 */
declare class TokenUtil {
    /**
     * Calculate associated token account address
     */
    static getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey, allowOwnerOffCurve?: boolean, tokenProgram?: PublicKey, associatedTokenProgram?: PublicKey): Promise<PublicKey>;
    /**
     * Create associated token account idempotent instruction
     */
    static createAssociatedTokenAccountIdempotentInstruction(payer: PublicKey, associatedToken: PublicKey, owner: PublicKey, mint: PublicKey, tokenProgram?: PublicKey, associatedTokenProgram?: PublicKey): TransactionInstruction;
    /**
     * Create associated token account instruction
     */
    static createAssociatedTokenAccountInstruction(payer: PublicKey, associatedToken: PublicKey, owner: PublicKey, mint: PublicKey, tokenProgram?: PublicKey, associatedTokenProgram?: PublicKey): TransactionInstruction;
    /**
     * Check if a token is a wrapped SOL (WSOL) token
     */
    static isWrappedSol(mint: PublicKey): boolean;
    /**
     * Convert token amount to UI amount (with decimals)
     */
    static toUiAmount(amount: bigint, decimals: number): number;
    /**
     * Convert UI amount to token amount (with decimals)
     */
    static fromUiAmount(uiAmount: number, decimals: number): bigint;
    /**
     * Format token amount for display
     */
    static formatAmount(amount: bigint, decimals: number, maxDecimals?: number): string;
}
/**
 * Wrapped SOL mint
 */
declare const WSOL_MINT: PublicKey;
/**
 * Native SOL mint (for Token-2022)
 */
declare const NATIVE_MINT: PublicKey;
/** Synchronous ATA derivation compatible with @solana/spl-token. */
declare function getAssociatedTokenAddressSync(mint: PublicKey, owner: PublicKey, allowOwnerOffCurve?: boolean, tokenProgram?: PublicKey, associatedTokenProgram?: PublicKey): PublicKey;
/** Build a standard ATA creation instruction. */
declare function createAssociatedTokenAccountInstruction(payer: PublicKey, associatedToken: PublicKey, owner: PublicKey, mint: PublicKey, tokenProgram?: PublicKey, associatedTokenProgram?: PublicKey): TransactionInstruction;
/** Build an idempotent ATA creation instruction. */
declare function createAssociatedTokenAccountIdempotentInstruction(payer: PublicKey, associatedToken: PublicKey, owner: PublicKey, mint: PublicKey, tokenProgram?: PublicKey, associatedTokenProgram?: PublicKey): TransactionInstruction;
type TokenMultisigner = PublicKey | {
    publicKey: PublicKey;
};
/** Build a token-account close instruction. */
declare function createCloseAccountInstruction(account: PublicKey, destination: PublicKey, authority: PublicKey, multiSigners?: TokenMultisigner[], tokenProgram?: PublicKey): TransactionInstruction;
/** Build a SyncNative instruction for a wrapped SOL account. */
declare function createSyncNativeInstruction(account: PublicKey, tokenProgram?: PublicKey): TransactionInstruction;
/**
 * USDC mint
 */
declare const USDC_MINT: PublicKey;
/**
 * USDT mint
 */
declare const USDT_MINT: PublicKey;
/**
 * Common token decimals
 */
declare const TOKEN_DECIMALS: {
    readonly SOL: 9;
    readonly WSOL: 9;
    readonly USDC: 6;
    readonly USDT: 6;
};

declare const splToken_ASSOCIATED_TOKEN_PROGRAM_ID: typeof ASSOCIATED_TOKEN_PROGRAM_ID;
type splToken_AccountState = AccountState;
declare const splToken_AccountState: typeof AccountState;
type splToken_AuthorityType = AuthorityType;
declare const splToken_AuthorityType: typeof AuthorityType;
declare const splToken_MINT_SIZE: typeof MINT_SIZE;
declare const splToken_MULTISIG_SIZE: typeof MULTISIG_SIZE;
type splToken_Mint = Mint;
declare const splToken_NATIVE_MINT: typeof NATIVE_MINT;
declare const splToken_TOKEN_2022_PROGRAM_ID: typeof TOKEN_2022_PROGRAM_ID;
declare const splToken_TOKEN_ACCOUNT_SIZE: typeof TOKEN_ACCOUNT_SIZE;
declare const splToken_TOKEN_DECIMALS: typeof TOKEN_DECIMALS;
declare const splToken_TOKEN_PROGRAM_ID: typeof TOKEN_PROGRAM_ID;
type splToken_TokenAccount = TokenAccount;
type splToken_TokenInstruction = TokenInstruction;
declare const splToken_TokenInstruction: typeof TokenInstruction;
type splToken_TokenInstructionBuilder = TokenInstructionBuilder;
declare const splToken_TokenInstructionBuilder: typeof TokenInstructionBuilder;
type splToken_TokenUtil = TokenUtil;
declare const splToken_TokenUtil: typeof TokenUtil;
declare const splToken_USDC_MINT: typeof USDC_MINT;
declare const splToken_USDT_MINT: typeof USDT_MINT;
declare const splToken_WSOL_MINT: typeof WSOL_MINT;
declare const splToken_createAssociatedTokenAccountIdempotentInstruction: typeof createAssociatedTokenAccountIdempotentInstruction;
declare const splToken_createAssociatedTokenAccountInstruction: typeof createAssociatedTokenAccountInstruction;
declare const splToken_createCloseAccountInstruction: typeof createCloseAccountInstruction;
declare const splToken_createSyncNativeInstruction: typeof createSyncNativeInstruction;
declare const splToken_getAssociatedTokenAddressSync: typeof getAssociatedTokenAddressSync;
declare namespace splToken {
  export { splToken_ASSOCIATED_TOKEN_PROGRAM_ID as ASSOCIATED_TOKEN_PROGRAM_ID, splToken_AccountState as AccountState, splToken_AuthorityType as AuthorityType, splToken_MINT_SIZE as MINT_SIZE, splToken_MULTISIG_SIZE as MULTISIG_SIZE, type splToken_Mint as Mint, splToken_NATIVE_MINT as NATIVE_MINT, splToken_TOKEN_2022_PROGRAM_ID as TOKEN_2022_PROGRAM_ID, splToken_TOKEN_ACCOUNT_SIZE as TOKEN_ACCOUNT_SIZE, splToken_TOKEN_DECIMALS as TOKEN_DECIMALS, splToken_TOKEN_PROGRAM_ID as TOKEN_PROGRAM_ID, type splToken_TokenAccount as TokenAccount, splToken_TokenInstruction as TokenInstruction, splToken_TokenInstructionBuilder as TokenInstructionBuilder, splToken_TokenUtil as TokenUtil, splToken_USDC_MINT as USDC_MINT, splToken_USDT_MINT as USDT_MINT, splToken_WSOL_MINT as WSOL_MINT, splToken_createAssociatedTokenAccountIdempotentInstruction as createAssociatedTokenAccountIdempotentInstruction, splToken_createAssociatedTokenAccountInstruction as createAssociatedTokenAccountInstruction, splToken_createCloseAccountInstruction as createCloseAccountInstruction, splToken_createSyncNativeInstruction as createSyncNativeInstruction, splToken_getAssociatedTokenAddressSync as getAssociatedTokenAddressSync };
}

export { bonk_builder as bonk, index$1 as calc, index as constants, meteora_damm_v2_builder as meteoraDammV2, pumpfun_builder as pumpfun, pumpswap, raydium_amm_v4_builder as raydiumAmmV4, raydium_cpmm_builder as raydiumCpmm, splToken };
