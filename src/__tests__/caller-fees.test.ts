import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import * as pumpfun from '../instruction/pumpfun_builder';
import * as pumpswap from '../instruction/pumpswap';
import { TOKEN_PROGRAM_ID, NATIVE_MINT, USDC_MINT } from '../common/spl-token';

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

describe('caller fee recipients', () => {
  const feeRecipient = pk(41);
  const buybackFeeRecipient = pk(42);

  it('uses explicit recipients in Pump legacy and V2 buys and sells', () => {
    for (const quoteMint of [PublicKey.default, NATIVE_MINT]) {
      const protocolParams = { ...curve(quoteMint), feeRecipient, buybackFeeRecipient };
      const buy = trade(
        pumpfun.buildPumpFunBuyInstructions({
          payer,
          outputMint: mint,
          inputAmount: 100_000n,
          protocolParams,
        }),
        pumpfun.PUMPFUN_PROGRAM_ID
      );
      const sell = trade(
        pumpfun.buildPumpFunSellInstructions({
          payer,
          inputMint: mint,
          inputAmount: 100_000n,
          protocolParams,
        }),
        pumpfun.PUMPFUN_PROGRAM_ID
      );
      for (const ix of [buy, sell]) {
        const v2 = !quoteMint.equals(PublicKey.default);
        expect(ix.keys[v2 ? 6 : 1]?.pubkey.equals(feeRecipient)).toBe(true);
        expect(ix.keys[v2 ? 8 : ix.keys.length - 1]?.pubkey.equals(buybackFeeRecipient)).toBe(true);
        if (v2) {
          expect(
            ix.keys[7]?.pubkey.equals(
              pumpswap.getAssociatedTokenAddress(feeRecipient, quoteMint, TOKEN_PROGRAM_ID)
            )
          ).toBe(true);
          expect(
            ix.keys[9]?.pubkey.equals(
              pumpswap.getAssociatedTokenAddress(buybackFeeRecipient, quoteMint, TOKEN_PROGRAM_ID)
            )
          ).toBe(true);
        }
      }
    }
  });

  it.each([NATIVE_MINT, USDC_MINT])('derives PumpSwap fee ATAs for quote %s', (quoteMint) => {
    for (const build of [pumpswap.buildBuyInstructions, pumpswap.buildSellInstructions]) {
      const ix = trade(
        build({
          payer,
          inputAmount: 100_000n,
          slippageBasisPoints: 100n,
          protocolParams: pool({
            quoteMint,
            isMayhemMode: true,
            feeRecipient,
            buybackFeeRecipient,
          }),
        }),
        pumpswap.PUMPSWAP_PROGRAM
      );
      expect(ix.keys[9]?.pubkey.equals(feeRecipient)).toBe(true);
      expect(
        ix.keys[10]?.pubkey.equals(
          pumpswap.getFeeRecipientAta(feeRecipient, quoteMint, TOKEN_PROGRAM_ID)
        )
      ).toBe(true);
      expect(ix.keys.at(-2)?.pubkey.equals(buybackFeeRecipient)).toBe(true);
      expect(
        ix.keys
          .at(-1)
          ?.pubkey.equals(
            pumpswap.getFeeRecipientAta(buybackFeeRecipient, quoteMint, TOKEN_PROGRAM_ID)
          )
      ).toBe(true);
    }
  });

  it('keeps existing recipient selection when overrides are omitted', () => {
    for (const build of [pumpswap.buildBuyInstructions, pumpswap.buildSellInstructions]) {
      const ix = trade(
        build({
          payer,
          inputAmount: 100_000n,
          slippageBasisPoints: 100n,
          protocolParams: pool({ isMayhemMode: true }),
        }),
        pumpswap.PUMPSWAP_PROGRAM
      );
      expect(
        pumpswap.PUMPSWAP_MAYHEM_FEE_RECIPIENTS.some((key) => key.equals(ix.keys[9]!.pubkey))
      ).toBe(true);
      expect(
        pumpswap.PUMPSWAP_PROTOCOL_EXTRA_FEE_RECIPIENTS.some((key) =>
          key.equals(ix.keys.at(-2)!.pubkey)
        )
      ).toBe(true);
    }
    const ix = trade(
      pumpfun.buildPumpFunBuyInstructions({
        payer,
        outputMint: mint,
        inputAmount: 100_000n,
        protocolParams: curve(),
      }),
      pumpfun.PUMPFUN_PROGRAM_ID
    );
    expect(
      pumpfun.PUMPFUN_PROTOCOL_EXTRA_FEE_RECIPIENTS.some((key) =>
        key.equals(ix.keys.at(-1)!.pubkey)
      )
    ).toBe(true);
  });
});
