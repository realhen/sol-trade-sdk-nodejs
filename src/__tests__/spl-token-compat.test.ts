import { Keypair, PublicKey, SystemProgram, type TransactionInstruction } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from '../common/spl-token';

const payer = Keypair.fromSeed(
  Uint8Array.from({ length: 32 }, (_, index) => index + 1),
).publicKey;
const owner = Keypair.fromSeed(
  Uint8Array.from({ length: 32 }, (_, index) => 255 - index),
).publicKey;

function renderKeys(instruction: TransactionInstruction): Array<[string, boolean, boolean]> {
  return instruction.keys.map(({ pubkey, isSigner, isWritable }) => [
    pubkey.toBase58(),
    isSigner,
    isWritable,
  ]);
}

describe('local SPL Token compatibility layer', () => {
  it('matches official SPL Token 0.4.15 ATA derivation vectors', () => {
    expect(NATIVE_MINT.toBase58()).toBe('So11111111111111111111111111111111111111112');
    expect(getAssociatedTokenAddressSync(NATIVE_MINT, owner).toBase58()).toBe(
      '476h6mAzfujUVXrc6jyTu3gDRjbDgZ3HfChUQmMDXszF',
    );
    expect(
      getAssociatedTokenAddressSync(
        NATIVE_MINT,
        owner,
        false,
        TOKEN_2022_PROGRAM_ID,
      ).toBase58(),
    ).toBe('BJaoXszxeba45KwjdavaZf8dF8WC3oTCn2EiG3cUndxJ');
  });

  it('matches official ATA create and idempotent instruction bytes', () => {
    const ata = getAssociatedTokenAddressSync(NATIVE_MINT, owner);
    const expectedKeys: Array<[string, boolean, boolean]> = [
      [payer.toBase58(), true, true],
      [ata.toBase58(), false, true],
      [owner.toBase58(), false, false],
      [NATIVE_MINT.toBase58(), false, false],
      [SystemProgram.programId.toBase58(), false, false],
      [TOKEN_PROGRAM_ID.toBase58(), false, false],
    ];

    const create = createAssociatedTokenAccountInstruction(
      payer,
      ata,
      owner,
      NATIVE_MINT,
    );
    expect(create.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect(create.data.toString('hex')).toBe('');
    expect(renderKeys(create)).toEqual(expectedKeys);

    const idempotent = createAssociatedTokenAccountIdempotentInstruction(
      payer,
      ata,
      owner,
      NATIVE_MINT,
    );
    expect(idempotent.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect(idempotent.data.toString('hex')).toBe('01');
    expect(renderKeys(idempotent)).toEqual(expectedKeys);
  });

  it('matches official CloseAccount and SyncNative instruction bytes', () => {
    const ata = getAssociatedTokenAddressSync(NATIVE_MINT, owner);
    const close = createCloseAccountInstruction(ata, payer, owner);
    expect(close.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(close.data.toString('hex')).toBe('09');
    expect(renderKeys(close)).toEqual([
      [ata.toBase58(), false, true],
      [payer.toBase58(), false, true],
      [owner.toBase58(), true, false],
    ]);

    const sync = createSyncNativeInstruction(ata);
    expect(sync.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(sync.data.toString('hex')).toBe('11');
    expect(renderKeys(sync)).toEqual([[ata.toBase58(), false, true]]);
  });

  it('rejects off-curve owners unless explicitly allowed', () => {
    const [offCurveOwner] = PublicKey.findProgramAddressSync(
      [Buffer.from('owner')],
      TOKEN_PROGRAM_ID,
    );
    expect(() => getAssociatedTokenAddressSync(NATIVE_MINT, offCurveOwner)).toThrow(
      'Token owner is off curve',
    );
    expect(() =>
      getAssociatedTokenAddressSync(NATIVE_MINT, offCurveOwner, true),
    ).not.toThrow();
  });
});
