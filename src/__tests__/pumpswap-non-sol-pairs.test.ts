import { describe, expect, it } from 'vitest';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM, TOKEN_PROGRAM_2022, WSOL_TOKEN_ACCOUNT, USDC_TOKEN_ACCOUNT } from '../constants';
import * as pump from '../instruction/pumpswap';

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
const payer = key(1), base = key(2), quote = key(3);
function pool(baseMint = base, quoteMint = quote): pump.PumpSwapParams {
  return { pool: key(4), baseMint, quoteMint, poolBaseTokenAccount: key(5), poolQuoteTokenAccount: key(6),
    poolBaseTokenReserves: 1_000_000n, poolQuoteTokenReserves: 2_000_000n, virtualQuoteReserves: 0n,
    coinCreatorVaultAta: key(7), coinCreatorVaultAuthority: key(8), coinCreator: key(9),
    baseTokenProgram: TOKEN_PROGRAM, quoteTokenProgram: TOKEN_PROGRAM, isMayhemMode: false, isCashbackCoin: false,
    feeRecipient: key(10), buybackFeeRecipient: key(11) };
}
const common = { payer, inputAmount: 123n, minimumOutputAmount: 45n, slippageBasisPoints: 100n };
const swap = (instructions: ReturnType<typeof pump.buildBuyInstructions>) => instructions.find(ix => ix.programId.equals(pump.PUMPSWAP_PROGRAM))!;

describe('PumpSwap arbitrary direct pairs', () => {
  for (const [name, build] of [['buy', pump.buildBuyInstructions], ['sell', pump.buildSellInstructions]] as const) {
    for (const quoteInput of [true, false]) {
      it(`${name} selects the actual ${quoteInput ? 'quote-to-base' : 'base-to-quote'} instruction for token/token`, () => {
        const protocolParams = { ...pool(), isCashbackCoin: true };
        const ix = swap(build({ ...common, protocolParams, inputMint: quoteInput ? quote : base }));
        expect(ix.data.subarray(0, 8)).toEqual(quoteInput ? pump.PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR : pump.PUMPSWAP_SELL_DISCRIMINATOR);
        expect(ix.data.readBigUInt64LE(8)).toBe(123n);
        expect(ix.data.readBigUInt64LE(16)).toBe(45n);
        expect(ix.data.length).toBe(quoteInput ? 25 : 24);
        expect(ix.keys.slice(3, 9).map(k => k.pubkey.toBase58())).toEqual([
          base, quote, pump.getAssociatedTokenAddress(payer, base), pump.getAssociatedTokenAddress(payer, quote), key(5), key(6),
        ].map(k => k.toBase58()));
        const tail = ix.keys.slice(19).map(k => k.pubkey.toBase58());
        expect(tail).toEqual((quoteInput ? [pump.PUMPSWAP_GLOBAL_VOLUME_ACCUMULATOR, pump.getUserVolumeAccumulatorPDA(payer), pump.PUMPSWAP_FEE_CONFIG, pump.PUMPSWAP_FEE_PROGRAM, pump.getUserVolumeAccumulatorQuoteAta(payer, quote, TOKEN_PROGRAM), pump.getPoolV2PDA(base), key(11), pump.getFeeRecipientAta(key(11), quote)] : [pump.PUMPSWAP_FEE_CONFIG, pump.PUMPSWAP_FEE_PROGRAM, pump.getUserVolumeAccumulatorQuoteAta(payer, quote, TOKEN_PROGRAM), pump.getUserVolumeAccumulatorPDA(payer), pump.getPoolV2PDA(base), key(11), pump.getFeeRecipientAta(key(11), quote)]).map(k => k.toBase58()));
      });
    }
    it(`${name} infers input from output and rejects mismatched requests`, () => {
      expect(swap(build({ ...common, protocolParams: pool(), outputMint: base })).data.subarray(0, 8)).toEqual(pump.PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR);
      for (const pair of [{ inputMint: base, outputMint: base }, { inputMint: key(20) }, { outputMint: key(20) }]) {
        expect(() => build({ ...common, protocolParams: pool(), ...pair })).toThrow(/pair|mint/i);
      }
      expect(() => build({ ...common, protocolParams: pool() })).toThrow(/mint|ambiguous/i);
    });
    for (const inputMint of [WSOL_TOKEN_ACCOUNT, USDC_TOKEN_ACCOUNT]) {
      it(`${name} handles explicit WSOL/USDC direction without unsolicited wrapping or closing`, () => {
        const ixs = build({ ...common, protocolParams: pool(WSOL_TOKEN_ACCOUNT, USDC_TOKEN_ACCOUNT), inputMint });
        const ix = swap(ixs);
        expect(ix.data.subarray(0, 8)).toEqual(inputMint.equals(USDC_TOKEN_ACCOUNT) ? pump.PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR : pump.PUMPSWAP_SELL_DISCRIMINATOR);
        expect(ixs.some(i => i.programId.equals(SystemProgram.programId))).toBe(false);
        expect(ixs.some(i => i.programId.equals(TOKEN_PROGRAM) && [9, 17].includes(i.data[0]!))).toBe(false);
      });
    }
    it(`${name} validates amounts, slippage, programs and ambiguous legacy pairs`, () => {
      const valid = { ...common, protocolParams: pool(), inputMint: base };
      for (const inputAmount of [-1n, 0n, 1n << 64n]) expect(() => build({ ...valid, inputAmount })).toThrow(/u64|zero/i);
      for (const minimumOutputAmount of [-1n, 1n << 64n]) expect(() => build({ ...valid, minimumOutputAmount })).toThrow(/u64|unsigned/i);
      for (const slippageBasisPoints of [-1n, 10001n]) expect(() => build({ ...valid, slippageBasisPoints })).toThrow(/slippage/i);
      expect(() => build({ ...valid, fixedOutputAmount: 1n })).toThrow(/combined/i);
      expect(() => build({ ...valid, protocolParams: { ...pool(), baseTokenProgram: key(30) } })).toThrow(/program/i);
      expect(() => build({ ...common, protocolParams: pool(WSOL_TOKEN_ACCOUNT, USDC_TOKEN_ACCOUNT) })).toThrow(/mint|ambiguous/i);
      expect(() => build({ ...common, protocolParams: pool(base, base), inputMint: base })).toThrow(/distinct|pair/i);
    });
  }
  it('preserves the legacy single-stable-side direction in either orientation', () => {
    for (const p of [pool(base, WSOL_TOKEN_ACCOUNT), pool(WSOL_TOKEN_ACCOUNT, base)]) {
      expect(swap(pump.buildBuyInstructions({ ...common, protocolParams: p })).data.subarray(0, 8)).toEqual(p.baseMint.equals(base) ? pump.PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR : pump.PUMPSWAP_SELL_DISCRIMINATOR);
      expect(swap(pump.buildSellInstructions({ ...common, protocolParams: p })).data.subarray(0, 8)).toEqual(p.baseMint.equals(base) ? pump.PUMPSWAP_SELL_DISCRIMINATOR : pump.PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR);
    }
  });
  it('creates token accounts with their actual programs without wrapping non-native input', () => {
    const p = { ...pool(), quoteTokenProgram: TOKEN_PROGRAM_2022 };
    const ixs = pump.buildBuyInstructions({ ...common, protocolParams: p, inputMint: quote, createInputMintAta: true, closeInputMintAta: true });
    expect(ixs).toHaveLength(3);
    expect(ixs[0]!.keys[3]!.pubkey.equals(quote)).toBe(true);
    expect(ixs[0]!.keys[5]!.pubkey.equals(TOKEN_PROGRAM_2022)).toBe(true);
    expect(swap(ixs).keys[6]!.pubkey.equals(pump.getAssociatedTokenAddress(payer, quote, TOKEN_PROGRAM_2022))).toBe(true);
  });
  it('does not mix an explicit floor with exact-output buy mode', () => {
    expect(() => pump.buildBuyInstructions({ ...common, protocolParams: pool(), inputMint: quote, useExactQuoteAmount: false })).toThrow(/exact/i);
  });
  it('keeps requested fixed-output quote-to-base swaps in buy mode with the full wrap budget', () => {
    const p = pool(base, WSOL_TOKEN_ACCOUNT);
    const ixs = pump.buildBuyInstructions({ payer, protocolParams: p, inputMint: WSOL_TOKEN_ACCOUNT,
      inputAmount: 1000n, fixedOutputAmount: 123n, slippageBasisPoints: 100n, createInputMintAta: true });
    const ix = swap(ixs);
    expect(ix.data.subarray(0, 8)).toEqual(pump.PUMPSWAP_BUY_DISCRIMINATOR);
    expect(ix.data.readBigUInt64LE(8)).toBe(123n);
    expect(ixs.find(i => i.programId.equals(SystemProgram.programId))!.data.readBigUInt64LE(4)).toBe(ix.data.readBigUInt64LE(16));
    const reverse = swap(pump.buildSellInstructions({ payer, protocolParams: pool(WSOL_TOKEN_ACCOUNT, quote),
      inputMint: quote, inputAmount: 1000n, fixedOutputAmount: 123n, slippageBasisPoints: 100n }));
    expect(reverse.data.subarray(0, 8)).toEqual(pump.PUMPSWAP_BUY_DISCRIMINATOR);
    expect(reverse.data.readBigUInt64LE(8)).toBe(123n);
    expect(reverse.data.length).toBe(25);
  });
  it('requires classic Token for the WSOL mint', () => {
    expect(() => pump.buildBuyInstructions({ ...common, inputMint: WSOL_TOKEN_ACCOUNT,
      protocolParams: { ...pool(base, WSOL_TOKEN_ACCOUNT), quoteTokenProgram: TOKEN_PROGRAM_2022 },
    })).toThrow(/classic token program/);
  });

});
