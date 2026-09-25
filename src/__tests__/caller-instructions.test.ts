import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import * as pumpfun from '../instruction/pumpfun_builder';
import * as pumpswap from '../instruction/pumpswap';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  NATIVE_MINT,
  USDC_MINT,
} from '../common/spl-token';

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

describe('Pump instruction compatibility', () => {
  it('marks the shared volume accumulators read-only', () => {
    const fun = trade(
      pumpfun.buildPumpFunBuyInstructions({
        payer,
        outputMint: mint,
        inputAmount: 100_000n,
        protocolParams: curve(),
      }),
      pumpfun.PUMPFUN_PROGRAM_ID
    );
    const swap = trade(
      pumpswap.buildBuyInstructions({
        payer,
        inputAmount: 100_000n,
        slippageBasisPoints: 100n,
        protocolParams: pool(),
      }),
      pumpswap.PUMPSWAP_PROGRAM
    );
    expect(
      fun.keys.find((key) => key.pubkey.equals(pumpfun.PUMPFUN_GLOBAL_VOLUME_ACCUMULATOR))
        ?.isWritable
    ).toBe(false);
    expect(
      swap.keys.find((key) => key.pubkey.equals(pumpswap.PUMPSWAP_GLOBAL_VOLUME_ACCUMULATOR))
        ?.isWritable
    ).toBe(false);
  });

  it('honors the explicit token program even for a mint ending in pump', () => {
    const pumpMint = new PublicKey('7GCihgDBCHjEt6rA7ZQf2bcD2uVVQySGJWR5PAqWpump');
    for (const tokenProgram of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
      const ix = trade(
        pumpfun.buildPumpFunBuyInstructions({
          payer,
          outputMint: pumpMint,
          inputAmount: 100_000n,
          protocolParams: { ...curve(), tokenProgram },
        }),
        pumpfun.PUMPFUN_PROGRAM_ID
      );
      expect(ix.keys[8]?.pubkey.equals(tokenProgram)).toBe(true);
    }
  });

  it('marks V2 buyback recipients writable on buy and sell', () => {
    const protocolParams = curve(NATIVE_MINT);
    const buy = trade(
      pumpfun.buildPumpFunBuyV2Instructions({
        payer,
        outputMint: mint,
        inputAmount: 100_000n,
        protocolParams,
      }),
      pumpfun.PUMPFUN_PROGRAM_ID
    );
    const sell = trade(
      pumpfun.buildPumpFunSellV2Instructions({
        payer,
        inputMint: mint,
        inputAmount: 100_000n,
        protocolParams,
      }),
      pumpfun.PUMPFUN_PROGRAM_ID
    );
    expect(buy.data.length).toBe(24);
    expect(buy.keys[8]?.isWritable).toBe(true);
    expect(sell.keys[8]?.isWritable).toBe(true);
    expect(buy.keys[19]?.isWritable).toBe(false);
  });

  it('uses the actual quote mint for cashback and does not close WSOL for USDC buys', () => {
    const protocolParams = pool({ quoteMint: USDC_MINT, isCashbackCoin: true });
    const instructions = pumpswap.buildBuyInstructions({
      payer,
      inputAmount: 100_000n,
      slippageBasisPoints: 100n,
      protocolParams,
      createOutputMintAta: false,
      closeInputMintAta: true,
    });
    const ix = trade(instructions, pumpswap.PUMPSWAP_PROGRAM);
    expect(
      ix.keys[23]?.pubkey.equals(
        pumpswap.getUserVolumeAccumulatorQuoteAta(payer, USDC_MINT, TOKEN_PROGRAM_ID)
      )
    ).toBe(true);
    expect(instructions).toHaveLength(1);
  });

  it('encodes close-account instructions as the single opcode for WSOL and token accounts', () => {
    const instructions = pumpswap.buildSellInstructions({
      payer,
      inputAmount: 100_000n,
      slippageBasisPoints: 100n,
      protocolParams: pool(),
      closeInputMintAta: true,
      closeOutputMintAta: true,
    });
    expect(instructions.slice(-2).map((ix) => [...ix.data])).toEqual([[9], [9]]);
    expect([...pumpswap.closeWsol(payer).data]).toEqual([9]);
  });
});
