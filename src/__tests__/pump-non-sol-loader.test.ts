import { Connection, PublicKey, type AccountInfo } from '@solana/web3.js';
import { describe, expect, it, vi } from 'vitest';
import { PumpFunParams } from '../params';
import { TOKEN_PROGRAM, TOKEN_PROGRAM_2022, WSOL_TOKEN_ACCOUNT, SOL_TOKEN_ACCOUNT } from '../constants';
import { PUMPFUN_PROGRAM_ID, getBondingCurvePda, buildPumpFunSellInstructions } from '../instruction/pumpfun_builder';

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
const mint = key(3), quote = key(4), creator = key(5);
const discriminator = Buffer.from([23, 183, 248, 55, 96, 216, 172, 96]);
function curve(size = 115, quoteMint = quote) {
  const data = Buffer.alloc(size);
  discriminator.copy(data);
  for (let i = 0; i < 5 && 16 + i * 8 <= size; i++) data.writeBigUInt64LE(BigInt(100 + i), 8 + i * 8);
  if (size >= 81) creator.toBuffer().copy(data, 49);
  if (size >= 115) quoteMint.toBuffer().copy(data, 83);
  return data;
}
function mintData(size = 82) { const data = Buffer.alloc(size); data[45] = 1; if (size >= 166) data[165] = 1; return data; }
function account(data: Buffer, owner = TOKEN_PROGRAM): AccountInfo<Buffer> {
  return { data, owner, executable: false, lamports: 1, rentEpoch: 1 };
}
function rpc(curveData = curve(), options: { curveOwner?: PublicKey; base?: AccountInfo<Buffer> | null; quote?: AccountInfo<Buffer> | null; baseMint?: PublicKey; quoteMint?: PublicKey } = {}) {
  const baseMint = options.baseMint ?? mint;
  const accounts = new Map<string, AccountInfo<Buffer> | null>([
    [getBondingCurvePda(baseMint).toBase58(), account(curveData, options.curveOwner ?? PUMPFUN_PROGRAM_ID)],
    [baseMint.toBase58(), options.base === undefined ? account(mintData(), TOKEN_PROGRAM_2022) : options.base],
    [(options.quoteMint ?? quote).toBase58(), options.quote === undefined ? account(mintData()) : options.quote],
  ]);
  const getAccountInfo = vi.fn(async (address: PublicKey) => accounts.get(address.toBase58()) ?? null);
  return { connection: { getAccountInfo } as unknown as Connection, getAccountInfo };
}

describe('Pump non-SOL RPC parameter loader', () => {
  it('carries the appended quote mint into the existing V2 instruction builder', async () => {
    const { connection } = rpc();
    const params = await PumpFunParams.fromMintByRpc(connection, mint);
    expect(params.quoteMint.equals(quote)).toBe(true);
    expect(params.bondingCurve.quoteMint?.equals(quote)).toBe(true);
    expect(params.tokenProgram.equals(TOKEN_PROGRAM_2022)).toBe(true);
    expect(params.bondingCurve.virtualSolReserves).toBe(101n);
    const ix = buildPumpFunSellInstructions({ payer: key(9), inputMint: mint, outputMint: quote, inputAmount: 1n, minimumOutputAmount: 1n, protocolParams: params }).at(-1)!;
    expect(ix.keys[2]!.pubkey.equals(quote)).toBe(true);
    expect(ix.keys[4]!.pubkey.equals(TOKEN_PROGRAM)).toBe(true);
  });
  for (const size of [49, 81, 82, 83]) {
    it(`preserves native SOL defaults for complete legacy ${size}-byte layouts`, async () => {
      const { connection, getAccountInfo } = rpc(curve(size));
      const params = await PumpFunParams.fromMintByRpc(connection, mint);
      expect(params.quoteMint.equals(PublicKey.default)).toBe(true);
      expect(params.bondingCurve.quoteMint?.equals(WSOL_TOKEN_ACCOUNT)).toBe(true);
      expect(params.bondingCurve.creator.equals(size < 81 ? PublicKey.default : creator)).toBe(true);
      expect(getAccountInfo).toHaveBeenCalledTimes(2);
    });
  }
  for (const native of [PublicKey.default, SOL_TOKEN_ACCOUNT, WSOL_TOKEN_ACCOUNT]) {
    it(`normalizes the native quote alias ${native.toBase58()} without selecting V2`, async () => {
      const { connection } = rpc(curve(151, native));
      expect((await PumpFunParams.fromMintByRpc(connection, mint)).quoteMint.equals(PublicKey.default)).toBe(true);
    });
  }
  it('decodes a finalized mainnet MET quote fixture at byte 83, including trailing fields', async () => {
    // Curve 3hcAKo… for token 3fM6…pump; read-only finalized snapshot 2026-09-27.
    // Official pump-public-docs/idl/pump.json BondingCurve field ordering, quote_mint at 83.
    const liveMint = new PublicKey('3fM6NAMZuarJ9tmqaee5qNEesS9gePJGWzGkNDaYpump');
    const met = new PublicKey('METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL');
    const data = Buffer.from('F7f4N2DYrGChTDGYoLYDADEMwOMCAAAAobQeTA+4AgDv7SUTAAAAAACAxqR+jQMAAGS3I+w8INx4/kjvxPklwjp+tzj30Mdtbte8LGApNG0cAAAFLtceOLRjyhYqWAkXveca6+BYMTpdy66GkgXL6qn7rcgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==', 'base64');
    const { connection } = rpc(data, { baseMint: liveMint, quoteMint: met });
    const params = await PumpFunParams.fromMintByRpc(connection, liveMint);
    expect(params.bondingCurve.account.toBase58()).toBe('3hcAKoHkBRW1HtamyvdZPyr5oHV8pGkoV2yUAnUuLVko');
    expect(params.quoteMint.equals(met)).toBe(true);
    expect(params.bondingCurve.creator.toBuffer()).toEqual(data.subarray(49, 81));
  });
  for (const size of [0, 48, 50, 80, 84, 100, 114]) {
    it(`rejects truncated curve length ${size}`, async () => {
      await expect(PumpFunParams.fromMintByRpc(rpc(curve(size)).connection, mint)).rejects.toThrow(/curve|truncated/i);
    });
  }
  it('rejects wrong curve owner, discriminator and malformed bools', async () => {
    await expect(PumpFunParams.fromMintByRpc(rpc(curve(), { curveOwner: TOKEN_PROGRAM }).connection, mint)).rejects.toThrow(/owner/i);
    const bad = curve(); bad[0] = 0;
    await expect(PumpFunParams.fromMintByRpc(rpc(bad).connection, mint)).rejects.toThrow(/discriminator/i);
    for (const offset of [48, 81, 82]) {
      const invalid = curve(); invalid[offset] = 2;
      await expect(PumpFunParams.fromMintByRpc(rpc(invalid).connection, mint)).rejects.toThrow(/bool/i);
    }
  });
  it('rejects missing, malformed or invalid-owner mint accounts without defaulting programs', async () => {
    for (const base of [null, account(mintData(), key(22)), account(Buffer.alloc(81)), account(Buffer.alloc(165))]) {
      await expect(PumpFunParams.fromMintByRpc(rpc(curve(), { base }).connection, mint)).rejects.toThrow();
    }
    for (const quoteAccount of [null, account(mintData(), key(22)), account(mintData(), TOKEN_PROGRAM_2022), account(Buffer.alloc(81)), account(Buffer.alloc(165))]) {
      await expect(PumpFunParams.fromMintByRpc(rpc(curve(), { quote: quoteAccount }).connection, mint)).rejects.toThrow();
    }
    await expect(PumpFunParams.fromMintByRpc(rpc(curve(115, mint)).connection, mint)).rejects.toThrow(/distinct|same/i);
  });
  it('propagates a decoded trade quote while keeping omitted quote compatible', () => {
    const trade = { bondingCurve: key(10), associatedBondingCurve: key(11), mint, creator, creatorVault: key(12), virtualTokenReserves: 100n, virtualSolReserves: 200n, realTokenReserves: 50n, realSolReserves: 60n, feeRecipient: key(13), tokenProgram: TOKEN_PROGRAM_2022, isCashbackCoin: false };
    expect(PumpFunParams.fromTrade({ ...trade, quoteMint: quote }).quoteMint.equals(quote)).toBe(true);
    expect(PumpFunParams.fromTrade(trade).quoteMint.equals(PublicKey.default)).toBe(true);
    expect(PumpFunParams.immediateSell(key(12), TOKEN_PROGRAM).quoteMint.equals(PublicKey.default)).toBe(true);
  });
});
