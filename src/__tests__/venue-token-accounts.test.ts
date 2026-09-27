import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey, SystemInstruction } from '@solana/web3.js';
import * as venue from '../venues/token-accounts';
import { NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '../common/spl-token';
const owner = Keypair.fromSeed(new Uint8Array(32).fill(91)).publicKey;
const mint = new PublicKey(new Uint8Array(32).fill(13));
const base = { owner, inputMint: NATIVE_MINT, outputMint: mint, inputTokenProgram: TOKEN_PROGRAM_ID, outputTokenProgram: TOKEN_2022_PROGRAM_ID, amountIn: 9007199254740993n };
describe('venue token account preparation', () => {
  it('preserves bigint lamports and creates the correct Token-2022 output ATA', () => {
    const result = venue.prepareTokenAccounts({ ...base, wrapNativeInput: true });
    expect(result.setupInstructions.map(ix => ix.data[0])).toEqual([1, 1, 2, 17]);
    expect(SystemInstruction.decodeTransfer(result.setupInstructions[2]!).lamports).toBe(base.amountIn);
    expect(result.setupInstructions[1]!.keys[5]!.pubkey.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(result.cleanupInstructions).toHaveLength(0);
  });
  it('unwraps only with explicit permission and does not close the input token account', () => {
    const result = venue.prepareTokenAccounts({ ...base, inputMint: mint, outputMint: NATIVE_MINT, inputTokenProgram: TOKEN_2022_PROGRAM_ID, outputTokenProgram: TOKEN_PROGRAM_ID, unwrapNativeOutput: true });
    expect(result.cleanupInstructions).toHaveLength(1);
    expect(result.cleanupInstructions[0]!.keys[0]!.pubkey.equals(result.outputTokenAccount)).toBe(true);
    expect(result.cleanupInstructions[0]!.data[0]).toBe(9);
  });
  it('rejects invalid native flags and invalid raw amounts before building instructions', () => {
    expect(() => venue.prepareTokenAccounts({ ...base, unwrapNativeOutput: true })).toThrow(/native output/i);
    expect(() => venue.prepareTokenAccounts({ ...base, inputTokenProgram: TOKEN_2022_PROGRAM_ID, wrapNativeInput: true })).toThrow(/native.*program/i);
    for (const amountIn of [0n, -1n, 1n << 64n]) expect(() => venue.prepareTokenAccounts({ ...base, amountIn })).toThrow(/amount/i);
    expect(() => venue.prepareTokenAccounts({ ...base, outputMint: NATIVE_MINT })).toThrow(/different/i);
  });
});
