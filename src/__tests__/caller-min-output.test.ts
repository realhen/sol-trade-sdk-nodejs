import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import * as pumpfun from '../instruction/pumpfun_builder';
import * as pumpswap from '../instruction/pumpswap';
import { TOKEN_PROGRAM_ID, NATIVE_MINT } from '../common/spl-token';

function pk(seed: number): PublicKey {
  return new PublicKey(new Uint8Array(32).fill(seed));
}

const payer = Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey;
const mint = pk(22);

function curve(quoteMint = PublicKey.default): pumpfun.PumpFunParams {
  return {
    bondingCurve: {
      account: PublicKey.default,
      virtualTokenReserves: 1_073_000_000_000_000n,
      virtualSolReserves: 30_000_000_000n,
      realTokenReserves: 793_100_000_000_000n,
      creator: pk(7),
      isMayhemMode: false,
      isCashbackCoin: false,
    },
    creatorVault: pk(8),
    tokenProgram: TOKEN_PROGRAM_ID,
    quoteMint,
  };
}

function pool(overrides: Partial<pumpswap.PumpSwapParams> = {}): pumpswap.PumpSwapParams {
  return {
    pool: pk(21),
    baseMint: mint,
    quoteMint: NATIVE_MINT,
    poolBaseTokenAccount: pk(23),
    poolQuoteTokenAccount: pk(24),
    poolBaseTokenReserves: 1_000_000_000_000n,
    poolQuoteTokenReserves: 4_500_000_000n,
    virtualQuoteReserves: 0n,
    coinCreatorVaultAta: pk(25),
    coinCreatorVaultAuthority: pk(26),
    baseTokenProgram: TOKEN_PROGRAM_ID,
    quoteTokenProgram: TOKEN_PROGRAM_ID,
    isMayhemMode: false,
    isCashbackCoin: false,
    coinCreator: pk(27),
    ...overrides,
  };
}

function trade(instructions: TransactionInstruction[], program: PublicKey): TransactionInstruction {
  return instructions.find((instruction) => instruction.programId.equals(program))!;
}

const inputAmount = 100_000n;

describe('caller minimum output', () => {
  it.each([0n, 12345n, 18446744073709551615n])(
    'encodes %s verbatim across Pump layouts and directions',
    (minimumOutputAmount) => {
      for (const quoteMint of [PublicKey.default, NATIVE_MINT]) {
        const protocolParams = curve(quoteMint);
        const buy = trade(
          pumpfun.buildPumpFunBuyInstructions({
            payer,
            outputMint: mint,
            inputAmount,
            protocolParams,
            minimumOutputAmount,
            slippageBasisPoints: 9999n,
          }),
          pumpfun.PUMPFUN_PROGRAM_ID
        );
        const sell = trade(
          pumpfun.buildPumpFunSellInstructions({
            payer,
            inputMint: mint,
            inputAmount,
            protocolParams,
            minimumOutputAmount,
            slippageBasisPoints: 9999n,
          }),
          pumpfun.PUMPFUN_PROGRAM_ID
        );
        for (const ix of [buy, sell]) {
          expect(ix.data.readBigUInt64LE(8)).toBe(inputAmount);
          expect(ix.data.readBigUInt64LE(16)).toBe(minimumOutputAmount);
        }
      }
    }
  );

  it.each([0n, 12345n, 18446744073709551615n])(
    'bypasses PumpSwap reserve quote math for %s',
    (minimumOutputAmount) => {
      const protocolParams = pool({
        poolBaseTokenReserves: 0n,
        poolQuoteTokenReserves: 0n,
        virtualQuoteReserves: -1n,
      });
      for (const build of [pumpswap.buildBuyInstructions, pumpswap.buildSellInstructions]) {
        const ix = trade(
          build({
            payer,
            inputAmount,
            slippageBasisPoints: 9999n,
            protocolParams,
            minimumOutputAmount,
          }),
          pumpswap.PUMPSWAP_PROGRAM
        );
        expect(ix.data.readBigUInt64LE(8)).toBe(inputAmount);
        expect(ix.data.readBigUInt64LE(16)).toBe(minimumOutputAmount);
      }
    }
  );

  it.each([-1n, 18446744073709551616n])(
    'rejects invalid u64 %s in every builder',
    (minimumOutputAmount) => {
      for (const build of [
        pumpfun.buildPumpFunBuyInstructions,
        pumpfun.buildPumpFunBuyV2Instructions,
      ]) {
        expect(() =>
          build({
            payer,
            outputMint: mint,
            inputAmount,
            protocolParams: curve(NATIVE_MINT),
            minimumOutputAmount,
          })
        ).toThrow(/unsigned 64-bit/);
      }
      for (const build of [
        pumpfun.buildPumpFunSellInstructions,
        pumpfun.buildPumpFunSellV2Instructions,
      ]) {
        expect(() =>
          build({
            payer,
            inputMint: mint,
            inputAmount,
            protocolParams: curve(NATIVE_MINT),
            minimumOutputAmount,
          })
        ).toThrow(/unsigned 64-bit/);
      }
      for (const build of [pumpswap.buildBuyInstructions, pumpswap.buildSellInstructions]) {
        expect(() =>
          build({
            payer,
            inputAmount,
            slippageBasisPoints: 100n,
            protocolParams: pool(),
            minimumOutputAmount,
          })
        ).toThrow(/unsigned 64-bit/);
      }
    }
  );

  it('rejects ambiguous fixed-output and exact-output modes', () => {
    for (const build of [
      pumpfun.buildPumpFunBuyInstructions,
      pumpfun.buildPumpFunBuyV2Instructions,
    ]) {
      expect(() =>
        build({
          payer,
          outputMint: mint,
          inputAmount,
          protocolParams: curve(NATIVE_MINT),
          minimumOutputAmount: 1n,
          useExactSolAmount: false,
        })
      ).toThrow(/exact-input/);
      expect(() =>
        build({
          payer,
          outputMint: mint,
          inputAmount,
          protocolParams: curve(NATIVE_MINT),
          minimumOutputAmount: 1n,
          fixedOutputAmount: 0n,
        })
      ).toThrow(/fixedOutputAmount/);
    }
    for (const build of [
      pumpfun.buildPumpFunSellInstructions,
      pumpfun.buildPumpFunSellV2Instructions,
    ]) {
      expect(() =>
        build({
          payer,
          inputMint: mint,
          inputAmount,
          protocolParams: curve(NATIVE_MINT),
          minimumOutputAmount: 1n,
          fixedOutputAmount: 0n,
        })
      ).toThrow(/fixedOutputAmount/);
    }
    expect(() =>
      pumpswap.buildBuyInstructions({
        payer,
        inputAmount,
        slippageBasisPoints: 100n,
        protocolParams: pool(),
        minimumOutputAmount: 1n,
        useExactQuoteAmount: false,
      })
    ).toThrow(/exact quote-input/);
    for (const build of [pumpswap.buildBuyInstructions, pumpswap.buildSellInstructions]) {
      expect(() =>
        build({
          payer,
          inputAmount,
          slippageBasisPoints: 100n,
          protocolParams: pool(),
          minimumOutputAmount: 1n,
          fixedOutputAmount: 0n,
        })
      ).toThrow(/fixedOutputAmount/);
      expect(() =>
        build({
          payer,
          inputAmount,
          slippageBasisPoints: 100n,
          protocolParams: pool({ baseMint: NATIVE_MINT, quoteMint: mint }),
          minimumOutputAmount: 1n,
        })
      ).toThrow(/exact .*input/);
    }
  });
});
