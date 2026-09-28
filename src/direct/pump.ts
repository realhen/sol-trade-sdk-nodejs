/** Official Pump quotes over a caller-provided immutable account snapshot. */
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  unpackMint,
  unpackAccount,
  type RawMint,
} from "@solana/spl-token";
import BN from "bn.js";
import {
  PUMP_SDK,
  PUMP_PROGRAM_ID,
  PUMP_FEE_PROGRAM_ID,
  GLOBAL_PDA,
  PUMP_FEE_CONFIG_PDA,
  getBuyTokenAmountFromSolAmount,
  getSellSolAmountFromTokenAmount,
  creatorVaultPda,
} from "@pump-fun/pump-sdk";
import {
  PUMP_AMM_SDK,
  PUMP_AMM_PROGRAM_ID,
  GLOBAL_CONFIG_PDA,
  PUMP_AMM_FEE_CONFIG_PDA,
  buyQuoteInput,
  sellBaseInput,
  POOL_ACCOUNT_NEW_SIZE,
  coinCreatorVaultAuthorityPda,
  getFeeRecipient,
  getBuybackFeeRecipient,
} from "@pump-fun/pump-swap-sdk";
import * as pumpfun from "../instruction/pumpfun_builder";
import * as pumpswap from "../instruction/pumpswap";
import { assert, account, type MarketSnapshot } from "./snapshot";
const bn = (n: bigint) => new BN(n.toString());
function owned(s: MarketSnapshot, k: PublicKey, p: PublicKey) {
  const a = account(s, k);
  assert(a && a.owner.equals(p) && !a.executable, "Invalid Pump account owner");
  return a;
}
export const pumpDependencies = (
  info: Parameters<typeof PUMP_SDK.decodeBondingCurve>[0],
  amm: boolean,
): PublicKey[] => {
  if (!amm) return [GLOBAL_PDA, PUMP_FEE_CONFIG_PDA];
  const p = PUMP_AMM_SDK.decodePool(info);
  return [
    GLOBAL_CONFIG_PDA,
    PUMP_AMM_FEE_CONFIG_PDA,
    p.baseMint,
    p.quoteMint,
    p.poolBaseTokenAccount,
    p.poolQuoteTokenAccount,
  ];
};
export function pumpAdapter(
  s: MarketSnapshot,
  inputMint: PublicKey,
  owner: PublicKey,
) {
  const pool = new PublicKey(s.pool),
    target = new PublicKey(s.mint),
    quote = new PublicKey(s.quoteMint);
  if (s.venue === "Pump.fun") {
    const c = PUMP_SDK.decodeBondingCurve(owned(s, pool, PUMP_PROGRAM_ID));
    assert(!c.complete, "Pump curve has migrated");
    assert(
      (c.quoteMint.equals(PublicKey.default)
        ? NATIVE_MINT
        : c.quoteMint
      ).equals(quote),
      "Pump quote mint changed during preparation",
    );
    const g = PUMP_SDK.decodeGlobal(owned(s, GLOBAL_PDA, PUMP_PROGRAM_ID));
    const f = PUMP_SDK.decodeFeeConfig(
      owned(s, PUMP_FEE_CONFIG_PDA, PUMP_FEE_PROGRAM_ID),
    );
    const mi = account(s, target)!;
    const mint = unpackMint(target, mi, mi.owner);
    assert(
      account(s, quote)!.owner.equals(TOKEN_PROGRAM_ID),
      "Pump quote mint requires classic Token",
    );
    const buy = inputMint.equals(quote);
    const buybackFeeRecipient = g.buybackFeeRecipients.find(
      (key) => !key.equals(PublicKey.default),
    );
    assert(buybackFeeRecipient, "Pump buyback fee recipient unavailable");
    const protocolParams: pumpfun.PumpFunParams = {
      bondingCurve: {
        account: pool,
        virtualTokenReserves: BigInt(c.virtualTokenReserves.toString()),
        virtualSolReserves: BigInt(c.virtualQuoteReserves.toString()),
        realTokenReserves: BigInt(c.realTokenReserves.toString()),
        creator: c.creator,
        isMayhemMode: c.isMayhemMode,
        isCashbackCoin: c.isCashbackCoin,
      },
      creatorVault: creatorVaultPda(c.creator),
      tokenProgram: mi.owner,
      feeRecipient: c.isMayhemMode ? g.reservedFeeRecipient : g.feeRecipient,
      buybackFeeRecipient,
      quoteMint: quote.equals(NATIVE_MINT) ? undefined : quote,
    };
    return {
      quote: (amount: bigint) => {
        const result = BigInt(
          (buy
            ? getBuyTokenAmountFromSolAmount
            : getSellSolAmountFromTokenAmount)({
            global: g,
            feeConfig: f,
            mintSupply: bn(mint.supply),
            bondingCurve: c,
            amount: bn(amount),
            quoteMint: quote,
          }).toString(),
        );
        assert(
          !buy || result < BigInt(c.realTokenReserves.toString()),
          "Buy exceeds remaining curve capacity",
        );
        return result;
      },
      instructions: async (amount: bigint, minimum: bigint) =>
        (buy
          ? pumpfun.buildPumpFunBuyInstructions
          : pumpfun.buildPumpFunSellInstructions)({
          payer: owner,
          inputMint,
          outputMint: buy ? target : quote,
          inputAmount: amount,
          minimumOutputAmount: minimum,
          slippageBasisPoints: 0n,
          createInputMintAta: false,
          createOutputMintAta: false,
          closeInputMintAta: false,
          useExactSolAmount: true,
          trackVolume: true,
          protocolParams,
        }),
    };
  }
  const info = owned(s, pool, PUMP_AMM_PROGRAM_ID),
    p = PUMP_AMM_SDK.decodePool(info);
  assert(
    (p.baseMint.equals(target) && p.quoteMint.equals(quote)) ||
      (p.baseMint.equals(quote) && p.quoteMint.equals(target)),
    "PumpSwap pair changed during preparation",
  );
  const baseInfo = account(s, p.baseMint)!,
    quoteInfo = account(s, p.quoteMint)!;
  const mint = unpackMint(p.baseMint, baseInfo, baseInfo.owner);
  const raw: RawMint = {
    ...mint,
    mintAuthorityOption: mint.mintAuthority ? 1 : 0,
    mintAuthority: mint.mintAuthority ?? PublicKey.default,
    freezeAuthorityOption: mint.freezeAuthority ? 1 : 0,
    freezeAuthority: mint.freezeAuthority ?? PublicKey.default,
  };
  const vault = (key: PublicKey, m: PublicKey, program: PublicKey) => {
    const a = unpackAccount(key, account(s, key)!, program);
    assert(
      a.mint.equals(m) &&
        a.owner.equals(pool) &&
        a.isInitialized &&
        !a.isFrozen,
      "Invalid PumpSwap vault",
    );
    return a.amount;
  };
  const baseReserve = vault(p.poolBaseTokenAccount, p.baseMint, baseInfo.owner),
    quoteReserve = vault(p.poolQuoteTokenAccount, p.quoteMint, quoteInfo.owner);
  const globalConfig = PUMP_AMM_SDK.decodeGlobalConfig(
    owned(s, GLOBAL_CONFIG_PDA, PUMP_AMM_PROGRAM_ID),
  );
  const feeConfig = PUMP_AMM_SDK.decodeFeeConfig(
    owned(s, PUMP_AMM_FEE_CONFIG_PDA, PUMP_FEE_PROGRAM_ID),
  );
  const params = {
    globalConfig,
    feeConfig,
    baseReserve: bn(baseReserve),
    quoteReserve: bn(quoteReserve),
    virtualQuoteReserves: p.virtualQuoteReserves,
    baseMintAccount: raw,
    baseMint: p.baseMint,
    coinCreator: p.coinCreator,
    creator: p.creator,
    quoteMint: p.quoteMint,
    isMayhemMode: p.isMayhemMode,
    creatorFeeBps: p.creatorFeeBps,
    slippage: 0,
  };
  const buy = inputMint.equals(p.quoteMint),
    authority = coinCreatorVaultAuthorityPda(p.coinCreator);
  const protocolParams: pumpswap.PumpSwapParams = {
    pool,
    baseMint: p.baseMint,
    quoteMint: p.quoteMint,
    poolBaseTokenAccount: p.poolBaseTokenAccount,
    poolQuoteTokenAccount: p.poolQuoteTokenAccount,
    poolBaseTokenReserves: baseReserve,
    poolQuoteTokenReserves: quoteReserve,
    virtualQuoteReserves: BigInt(p.virtualQuoteReserves.toString()),
    coinCreatorVaultAuthority: authority,
    coinCreatorVaultAta: getAssociatedTokenAddressSync(
      p.quoteMint,
      authority,
      true,
      quoteInfo.owner,
    ),
    coinCreator: p.coinCreator,
    baseTokenProgram: baseInfo.owner,
    quoteTokenProgram: quoteInfo.owner,
    isMayhemMode: p.isMayhemMode,
    isCashbackCoin: p.isCashbackCoin,
    feeRecipient: getFeeRecipient(globalConfig, p.isMayhemMode),
    buybackFeeRecipient: getBuybackFeeRecipient(globalConfig),
  };
  return {
    quote: (amount: bigint) =>
      BigInt(
        (buy
          ? buyQuoteInput({ ...params, quote: bn(amount) }).base
          : sellBaseInput({ ...params, base: bn(amount) }).uiQuote
        ).toString(),
      ),
    instructions: async (
      amount: bigint,
      minimum: bigint,
    ): Promise<TransactionInstruction[]> => {
      const swap = (
        buy ? pumpswap.buildBuyInstructions : pumpswap.buildSellInstructions
      )({
        payer: owner,
        inputAmount: amount,
        minimumOutputAmount: minimum,
        slippageBasisPoints: 0n,
        useExactQuoteAmount: true,
        trackVolume: true,
        createOutputMintAta: false,
        protocolParams,
      });
      return info.data.length < POOL_ACCOUNT_NEW_SIZE
        ? [await PUMP_AMM_SDK.extendAccount(pool, owner), ...swap]
        : swap;
    },
  };
}
