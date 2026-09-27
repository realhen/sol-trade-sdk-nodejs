import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { BuyAmount, DexType, SellAmount, TradingClient, TradeTokenType, simpleBuyParamsToTradeBuyParams, simpleSellParamsToTradeSellParams, validateAmount, type TradeBuyParams, type TradeSellParams } from '../index';
import { TOKEN_PROGRAM_ID } from '../common/spl-token';
import { RAYDIUM_CPMM_PROGRAM_ID } from '../instruction/raydium_cpmm_builder';

const pk = (seed: number) => new PublicKey(new Uint8Array(32).fill(seed));
const mint = pk(2);
const quote = pk(3);
const pool = { poolState: pk(4), ammConfig: pk(5), baseMint: mint, quoteMint: quote, baseReserve: 1_000_000, quoteReserve: 2_000_000, baseVault: pk(6), quoteVault: pk(7), baseTokenProgram: TOKEN_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID, observationState: pk(8) };
const client = new TradingClient(Keypair.fromSeed(new Uint8Array(32).fill(1)), { rpcUrl: 'http://127.0.0.1:8899', swqosConfigs: [] }) as unknown as {
  buildBuyInstructions(params: TradeBuyParams): TransactionInstruction[];
  buildSellInstructions(params: TradeSellParams): TransactionInstruction[];
};

describe('arbitrary quote public request propagation', () => {
  it('rejects rounded numeric token amounts and accepts exact bigint amounts', () => {
    expect(() => validateAmount(Number.MAX_SAFE_INTEGER + 1)).toThrow(/safe integer/);
    expect(validateAmount(9007199254740993n)).toBe(9007199254740993n);
  });
  it('preserves mint and bigint minimum through simple buy/sell conversion', () => {
    const buy = simpleBuyParamsToTradeBuyParams({ dexType: DexType.RaydiumCpmm, payWith: quote, mint, amount: BuyAmount.ExactInput(1000), minimumOutputAmount: 123n, extensionParams: { type: 'RaydiumCpmm', params: pool } });
    const sell = simpleSellParamsToTradeSellParams({ dexType: DexType.RaydiumCpmm, receiveAs: quote, mint, amount: SellAmount.ExactInput(1000), minimumOutputAmount: 321n, extensionParams: { type: 'RaydiumCpmm', params: pool } });
    expect(buy.inputTokenType).toEqual(quote);
    expect(sell.outputTokenType).toEqual(quote);
    for (const [instructions, floor] of [[client.buildBuyInstructions(buy), 123n], [client.buildSellInstructions(sell), 321n]] as const) {
      const swap = instructions.find(ix => ix.programId.equals(RAYDIUM_CPMM_PROGRAM_ID))!;
      expect(swap.data.readBigUInt64LE(8)).toBe(1000n);
      expect(swap.data.readBigUInt64LE(16)).toBe(floor);
    }
  });

  it('rejects the requested payment/receive asset when it is not in the pool', () => {
    const common = { dexType: DexType.RaydiumCpmm, mint, inputTokenAmount: 1000, extensionParams: { type: 'RaydiumCpmm' as const, params: pool } };
    expect(() => client.buildBuyInstructions({ ...common, inputTokenType: TradeTokenType.USDC })).toThrow(/pair/);
    expect(() => client.buildSellInstructions({ ...common, outputTokenType: TradeTokenType.USDC })).toThrow(/pair/);
  });

  it('never interprets an explicit floor as exact output', () => {
    const params = { dexType: DexType.RaydiumCpmm, inputTokenType: quote, mint, inputTokenAmount: 1000, minimumOutputAmount: 100n, fixedOutputTokenAmount: 200, extensionParams: { type: 'RaydiumCpmm' as const, params: pool } };
    expect(() => client.buildBuyInstructions(params)).toThrow(/cannot be combined/);
  });
});
