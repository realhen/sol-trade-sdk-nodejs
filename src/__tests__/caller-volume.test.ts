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

describe('Caller volume tracking', () => {
  it.each([false, true])('supports an explicit legacy volume flag: %s', (trackVolume) => {
    const fun = trade(
      pumpfun.buildPumpFunBuyInstructions({
        payer,
        outputMint: mint,
        inputAmount: 100_000n,
        protocolParams: curve(),
        trackVolume,
      }),
      pumpfun.PUMPFUN_PROGRAM_ID
    );
    const swap = trade(
      pumpswap.buildBuyInstructions({
        payer,
        inputAmount: 100_000n,
        slippageBasisPoints: 100n,
        protocolParams: pool(),
        trackVolume,
      }),
      pumpswap.PUMPSWAP_PROGRAM
    );
    expect(fun.data.length).toBe(25);
    expect(swap.data.length).toBe(25);
    expect(fun.data[24]).toBe(Number(trackVolume));
    expect(swap.data[24]).toBe(Number(trackVolume));
  });

  it.each([false, true])('preserves omitted volume flag for cashback=%s', (isCashbackCoin) => {
    const protocolParams = curve();
    protocolParams.bondingCurve.isCashbackCoin = isCashbackCoin;
    const fun = trade(
      pumpfun.buildPumpFunBuyInstructions({
        payer,
        outputMint: mint,
        inputAmount: 100_000n,
        protocolParams,
      }),
      pumpfun.PUMPFUN_PROGRAM_ID
    );
    const swap = trade(
      pumpswap.buildBuyInstructions({
        payer,
        inputAmount: 100_000n,
        slippageBasisPoints: 100n,
        protocolParams: pool({ isCashbackCoin }),
      }),
      pumpswap.PUMPSWAP_PROGRAM
    );
    expect(fun.data[24]).toBe(Number(isCashbackCoin));
    expect(swap.data[24]).toBe(Number(isCashbackCoin));
  });
});
