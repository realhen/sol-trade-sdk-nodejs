import BN from "bn.js";
import { type PublicKey } from "@solana/web3.js";
import DLMM, {
  calculateTransferFeeExcludedAmount,
  calculateTransferFeeIncludedAmount,
  findNextBinArrayWithLiquidity,
  getBinFromBinArray,
  getBinMaxAmountOut,
  getFeeMode,
  isBinIdWithinBinArray,
  isSupportLimitOrder,
  swapExactInQuoteAtBin,
  swapExactOutQuoteAtBin,
  type BinArrayAccount,
} from "@meteora-ag/dlmm";

/** Minimal exact-input traversal following @meteora-ag/dlmm 1.9.14's swapQuote
 * (MeteoraAg/dlmm-sdk, ts-client/src/dlmm/index.ts, ISC). All protocol arithmetic,
 * bitmap lookup, fee decay and per-bin fills remain the pinned SDK's exports.
 * Unlike swapQuote this accepts chain time explicitly. Price-impact reporting,
 * partial fills and optional extra arrays are intentionally outside this API.
 */
export function quoteAtChainTime(
  client: DLMM,
  binArrays: readonly BinArrayAccount[],
  amountIn: BN,
  swapForY: boolean,
  slippageBps: number,
  unixTimestampSeconds: number,
  epoch: number,
) {
  const [inputMint, outputMint] = swapForY
    ? [client.tokenX.mint, client.tokenY.mint]
    : [client.tokenY.mint, client.tokenX.mint];
  const netInput = calculateTransferFeeExcludedAmount(
    amountIn,
    inputMint,
    epoch,
  ).amount;
  let remaining = netInput;
  let activeId = new BN(client.lbPair.activeId);
  const parameters = client.lbPair.parameters;
  const volatility = { ...client.lbPair.vParameters };
  const supportLimitOrder = isSupportLimitOrder(client.lbPair);
  const feeOnInput = getFeeMode(client.lbPair, swapForY).feeOnInput;
  const usedArrays = new Map<string, PublicKey>();
  const availableArrays = [...binArrays];
  let grossOutput = new BN(0),
    fee = new BN(0),
    protocolFee = new BN(0);
  let filled = false;
  DLMM.updateReference(
    activeId.toNumber(),
    volatility,
    parameters,
    unixTimestampSeconds,
  );
  while (!remaining.isZero()) {
    const array = findNextBinArrayWithLiquidity(
      swapForY,
      activeId,
      client.lbPair,
      client.binArrayBitmapExtension?.account ?? null,
      availableArrays,
    );
    if (!array)
      throw new Error(
        "Insufficient liquidity in cached DLMM bin arrays for full exact input",
      );
    usedArrays.set(array.publicKey.toBase58(), array.publicKey);
    if (isBinIdWithinBinArray(activeId, array.account.index)) {
      const bin = getBinFromBinArray(activeId.toNumber(), array.account);
      if (!getBinMaxAmountOut(bin, swapForY, supportLimitOrder).isZero()) {
        DLMM.updateVolatilityAccumulator(
          volatility,
          parameters,
          activeId.toNumber(),
        );
        const fill = swapExactInQuoteAtBin(
          bin,
          client.lbPair.binStep,
          parameters,
          volatility,
          remaining,
          swapForY,
          supportLimitOrder,
          feeOnInput,
        );
        if (!fill.amountIn.isZero()) {
          remaining = remaining.sub(fill.amountIn);
          grossOutput = grossOutput.add(fill.amountOut);
          fee = fee.add(fill.fee);
          protocolFee = protocolFee.add(fill.protocolFee);
          filled = true;
        }
      }
    }
    if (!remaining.isZero())
      activeId = swapForY ? activeId.subn(1) : activeId.addn(1);
  }
  if (!filled)
    throw new Error("Insufficient DLMM liquidity or input after transfer fee");
  const consumedWithTransferFee = calculateTransferFeeIncludedAmount(
    netInput,
    inputMint,
    epoch,
  ).amount;
  const consumedInAmount = BN.min(consumedWithTransferFee, amountIn);
  const outAmount = calculateTransferFeeExcludedAmount(
    grossOutput,
    outputMint,
    epoch,
  ).amount;
  return {
    consumedInAmount,
    outAmount,
    fee,
    protocolFee,
    minOutAmount: outAmount.muln(10000 - slippageBps).divn(10000),
    binArraysPubkey: [...usedArrays.values()],
  };
}

/**
 * Exact-output traversal following the pinned official SDK's swapQuoteExactOut,
 * using explicit chain time instead of its machine-clock fallback. Desired output
 * is net of mint transfer fees; the returned input includes mint and pool fees.
 * All per-bin arithmetic remains in official exports; snapshot state is not mutated.
 * @throws If cached bin arrays cannot provide the requested output.
 */
export function quoteInputAtChainTime(
  client: DLMM,
  binArrays: readonly BinArrayAccount[],
  amountOut: BN,
  swapForY: boolean,
  unixTimestampSeconds: number,
  epoch: number,
): BN {
  const [inputMint, outputMint] = swapForY
    ? [client.tokenX.mint, client.tokenY.mint]
    : [client.tokenY.mint, client.tokenX.mint];
  let remaining = calculateTransferFeeIncludedAmount(
    amountOut,
    outputMint,
    epoch,
  ).amount;
  let activeId = new BN(client.lbPair.activeId);
  const parameters = client.lbPair.parameters;
  const volatility = { ...client.lbPair.vParameters };
  const supportLimitOrder = isSupportLimitOrder(client.lbPair);
  const feeOnInput = getFeeMode(client.lbPair, swapForY).feeOnInput;
  const availableArrays = [...binArrays];
  let input = new BN(0);
  DLMM.updateReference(
    activeId.toNumber(),
    volatility,
    parameters,
    unixTimestampSeconds,
  );
  while (!remaining.isZero()) {
    const array = findNextBinArrayWithLiquidity(
      swapForY,
      activeId,
      client.lbPair,
      client.binArrayBitmapExtension?.account ?? null,
      availableArrays,
    );
    if (!array)
      throw new Error(
        "Insufficient liquidity in cached DLMM bin arrays for full exact output",
      );
    if (isBinIdWithinBinArray(activeId, array.account.index)) {
      const bin = getBinFromBinArray(activeId.toNumber(), array.account);
      if (!getBinMaxAmountOut(bin, swapForY, supportLimitOrder).isZero()) {
        DLMM.updateVolatilityAccumulator(
          volatility,
          parameters,
          activeId.toNumber(),
        );
        const fill = swapExactOutQuoteAtBin(
          bin,
          client.lbPair.binStep,
          parameters,
          volatility,
          remaining,
          swapForY,
          supportLimitOrder,
          feeOnInput,
        );
        if (!fill.amountOut.isZero()) {
          remaining = remaining.sub(fill.amountOut);
          input = input.add(fill.amountIn);
        }
      }
    }
    if (!remaining.isZero())
      activeId = swapForY ? activeId.subn(1) : activeId.addn(1);
  }
  return calculateTransferFeeIncludedAmount(input, inputMint, epoch).amount;
}
