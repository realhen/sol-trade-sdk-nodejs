import { describe, expect, it } from 'vitest';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, NATIVE_MINT, getAssociatedTokenAddressSync } from '../common/spl-token';
import * as cpmm from '../instruction/raydium_cpmm_builder';
import * as amm from '../instruction/raydium_amm_v4_builder';
import * as damm from '../instruction/meteora_damm_v2_builder';

const pk = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
const owner = pk(99);
const usdc = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const sol = new PublicKey('So11111111111111111111111111111111111111111');
type Request = { inputMint?: PublicKey; outputMint?: PublicKey; inputAmount?: bigint; minimumOutputAmount?: bigint; fixedOutputAmount?: bigint; slippageBasisPoints?: bigint; createInputMintAta?: boolean; createOutputMintAta?: boolean };
function build(venue: string, side: string, a: PublicKey, b: PublicKey, request: Request = {}, tokenAProgram = TOKEN_PROGRAM_ID): TransactionInstruction[] {
  const common = { payer: owner, inputMint: a, outputMint: b, inputAmount: 1000n, minimumOutputAmount: 7n, createInputMintAta: false, createOutputMintAta: false, ...request };
  if (venue === 'cpmm') {
    const protocolParams = { poolState: pk(10), ammConfig: pk(11), baseMint: a, quoteMint: b, baseTokenProgram: tokenAProgram, quoteTokenProgram: TOKEN_PROGRAM_ID, baseVault: pk(12), quoteVault: pk(13), baseReserve: 100000n, quoteReserve: 200000n };
    return side === 'buy' ? cpmm.buildRaydiumCpmmBuyInstructions({ ...common, outputMint: common.outputMint!, protocolParams }) : cpmm.buildRaydiumCpmmSellInstructions({ ...common, inputMint: common.inputMint!, protocolParams });
  }
  if (venue === 'amm') {
    const protocolParams = { amm: pk(10), coinMint: a, pcMint: b, coinTokenProgram: tokenAProgram, pcTokenProgram: TOKEN_PROGRAM_ID, tokenCoin: pk(12), tokenPc: pk(13), ammOpenOrders: pk(14), ammTargetOrders: pk(15), serumProgram: pk(16), serumMarket: pk(17), serumBids: pk(18), serumAsks: pk(19), serumEventQueue: pk(20), serumCoinVaultAccount: pk(21), serumPcVaultAccount: pk(22), serumVaultSigner: pk(23), coinReserve: 100000n, pcReserve: 200000n };
    return side === 'buy' ? amm.buildRaydiumAmmV4BuyInstructions({ ...common, outputMint: common.outputMint!, protocolParams }) : amm.buildRaydiumAmmV4SellInstructions({ ...common, inputMint: common.inputMint!, protocolParams });
  }
  const protocolParams = { pool: pk(10), tokenAMint: a, tokenBMint: b, tokenAVault: pk(12), tokenBVault: pk(13), tokenAProgram, tokenBProgram: TOKEN_PROGRAM_ID };
  return side === 'buy' ? damm.buildMeteoraDammV2BuyInstructions({ ...common, outputMint: common.outputMint!, protocolParams }) : damm.buildMeteoraDammV2SellInstructions({ ...common, inputMint: common.inputMint!, protocolParams });
}
const accountIndices = { cpmm: [4, 5], amm: [15, 16], damm: [2, 3] } as const;
for (const venue of ['cpmm', 'amm', 'damm'] as const) {
  describe(venue, () => {
    for (const side of ['buy', 'sell']) {
      for (const [a, b] of [[pk(1), pk(2)], [NATIVE_MINT, usdc], [usdc, pk(2)]]) {
        for (const reverse of [false, true]) {
          it(`${side} uses the requested ${reverse ? 'reverse' : 'forward'} pair ${a}/${b}`, () => {
            const inputMint = reverse ? b : a;
            const outputMint = reverse ? a : b;
            const ix = build(venue, side, a, b, { inputMint, outputMint })[0]!;
            const [i, o] = accountIndices[venue];
            expect(ix.keys[i]!.pubkey.equals(getAssociatedTokenAddressSync(inputMint, owner, true))).toBe(true);
            expect(ix.keys[o]!.pubkey.equals(getAssociatedTokenAddressSync(outputMint, owner, true))).toBe(true);
            expect(ix.data.readBigUInt64LE(venue === 'amm' ? 1 : 8)).toBe(1000n);
            expect(ix.data.readBigUInt64LE(venue === 'amm' ? 9 : 16)).toBe(7n);
            if (venue === 'cpmm') expect(ix.keys[6]!.pubkey.equals(reverse ? pk(13) : pk(12))).toBe(true);
            expect(ix.data[venue === 'damm' ? 24 : 0]).toBe(venue === 'amm' ? 9 : venue === 'cpmm' ? 143 : 1);
          });
        }
      }
      it(`${side} infers the omitted opposite side`, () => {
        const ix = build(venue, side, pk(1), pk(2), side === 'buy' ? { inputMint: undefined } : { outputMint: undefined })[0]!;
        expect(ix.keys[accountIndices[venue][0]]!.pubkey.equals(getAssociatedTokenAddressSync(pk(1), owner, true))).toBe(true);
      });
      it(`${side} rejects unrelated, same, and invalid pool mint pairs`, () => {
        expect(() => build(venue, side, pk(1), pk(2), { inputMint: pk(3) })).toThrow(/mint|pair/i);
        expect(() => build(venue, side, pk(1), pk(2), { outputMint: pk(1) })).toThrow(/mint|pair/i);
        expect(() => build(venue, side, pk(1), pk(1))).toThrow(/mint|pair/i);
        expect(() => build(venue, side, PublicKey.default, pk(2))).toThrow(/mint|pair/i);
      });
      it(`${side} normalizes native SOL aliases`, () => {
        const ix = build(venue, side, NATIVE_MINT, pk(2), { inputMint: sol })[0]!;
        expect(ix.keys[accountIndices[venue][0]]!.pubkey.equals(getAssociatedTokenAddressSync(NATIVE_MINT, owner, true))).toBe(true);
      });
      it(`${side} validates exact-input floor, amount and slippage`, () => {
        for (const inputAmount of [0n, -1n, 1n << 64n, 1 as unknown as bigint]) expect(() => build(venue, side, NATIVE_MINT, pk(2), { inputAmount })).toThrow();
        for (const minimumOutputAmount of [-1n, 1n << 64n, 1 as unknown as bigint]) expect(() => build(venue, side, NATIVE_MINT, pk(2), { minimumOutputAmount })).toThrow();
        for (const slippageBasisPoints of [-1n, 10001n, 1 as unknown as bigint]) expect(() => build(venue, side, NATIVE_MINT, pk(2), { slippageBasisPoints })).toThrow();
        expect(() => build(venue, side, NATIVE_MINT, pk(2), { fixedOutputAmount: 10n })).toThrow(/minimumOutputAmount|combine|exclusive/i);
      });
      it(`${side} retains existing fixed-output instruction semantics`, () => {
        const ix = build(venue, side, pk(1), pk(2), { minimumOutputAmount: undefined, fixedOutputAmount: 19n })[0]!;
        expect(ix.data.readBigUInt64LE(venue === 'amm' ? 9 : 16)).toBe(19n);
        expect(ix.data[venue === 'damm' ? 24 : 0]).toBe(venue === 'amm' ? 11 : venue === 'cpmm' ? 55 : 1);
      });
    }
    it('accepts zero floors and u64 boundaries without precision loss', () => {
      const maximum = (1n << 64n) - 1n;
      const ixs = build(venue, 'buy', NATIVE_MINT, pk(2), { inputAmount: maximum, minimumOutputAmount: 0n, createInputMintAta: true });
      const ix = ixs.at(-1)!;
      expect(ix.data.readBigUInt64LE(venue === 'amm' ? 1 : 8)).toBe(maximum);
      expect(ix.data.readBigUInt64LE(venue === 'amm' ? 9 : 16)).toBe(0n);
      // System transfer: u32 discriminator followed by exact u64 lamports.
      expect(ixs[1]!.data.readBigUInt64LE(4)).toBe(maximum);
    });
    it('normalizes output aliases and rejects unsupported/native token programs', () => {
      const ix = build(venue, 'sell', NATIVE_MINT, pk(2), { inputMint: pk(2), outputMint: sol })[0]!;
      expect(ix.keys[accountIndices[venue][1]]!.pubkey.equals(getAssociatedTokenAddressSync(NATIVE_MINT, owner, true))).toBe(true);
      expect(() => build(venue, 'buy', NATIVE_MINT, pk(2), {}, TOKEN_2022_PROGRAM_ID)).toThrow(/classic|token program/i);
      expect(() => build(venue, 'buy', pk(1), pk(2), {}, pk(35))).toThrow(/token program/i);
    });
    it('uses supplied token programs or explicitly rejects unsupported Token-2022', () => {
      if (venue === 'amm') {
        expect(() => build(venue, 'buy', pk(1), pk(2), {}, TOKEN_2022_PROGRAM_ID)).toThrow(/classic|Token-2022|token program/i);
      } else {
        const ixs = build(venue, 'buy', pk(1), pk(2), { createInputMintAta: true, createOutputMintAta: true }, TOKEN_2022_PROGRAM_ID);
        expect(ixs[0]!.keys[5]!.pubkey.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
        expect(ixs.at(-1)!.keys[accountIndices[venue][0]]!.pubkey.equals(getAssociatedTokenAddressSync(pk(1), owner, true, TOKEN_2022_PROGRAM_ID))).toBe(true);
      }
    });
  });
}

describe('public non-SOL account loaders', () => {
  it('fetches Anchor CPMM pool accounts after validating owner/discriminator and stripping the header', async () => {
    const { readFileSync } = await import('node:fs');
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/non-sol-amm-pool-accounts.json', import.meta.url), 'utf8')).cpmm;
    const data = Buffer.from(fixture.dataBase64, 'base64');
    const pool = await cpmm.fetchRaydiumCPMMpoolState({ getAccountInfo: async () => ({ value: { data, owner: new PublicKey(fixture.owner) } }) }, new PublicKey(fixture.address));
    expect(pool?.token0Mint.toBase58()).toBe('Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu');
    expect(pool?.token1Mint.toBase58()).toBe('7nG5dJxuuUFXqxE4J8LecUZwP2m2HD6m83Xhae6jpzU1');
    expect(pool?.token0Vault.toBase58()).toBe('6BxWapCrPRLw86izhDy4y5Uzqu7V9BxYyS5eVce2bTs5');
    expect(pool?.token1Vault.toBase58()).toBe('5Lv28Qw3UkJqgr1e3DdFAsQzDhHhRQHM7ooB3kCzRN2G');
    expect(cpmm.decodeRaydiumCPMMpoolState(data.subarray(8))?.token0Mint.equals(pool!.token0Mint)).toBe(true);
    const wrongHeader = Buffer.from(data); wrongHeader[0] ^= 1;
    for (const value of [{ data, owner: pk(1) }, { data: wrongHeader, owner: new PublicKey(fixture.owner) }, { data: data.subarray(0, -1), owner: new PublicKey(fixture.owner) }]) {
      expect(await cpmm.fetchRaydiumCPMMpoolState({ getAccountInfo: async () => ({ value }) }, new PublicKey(fixture.address))).toBeNull();
    }
  });
  it('decodes the official 160-byte DAMM v2 fee layout from real MET/USDC state', async () => {
    const { readFileSync } = await import('node:fs');
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/non-sol-amm-pool-accounts.json', import.meta.url), 'utf8')).damm;
    const data = Buffer.from(fixture.dataBase64, 'base64');
    const pool = await damm.fetchMeteoraPool({ getAccountInfo: async () => ({ value: { data, owner: new PublicKey(fixture.owner) } }) }, new PublicKey(fixture.address));
    expect(pool?.tokenAMint.toBase58()).toBe('METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL');
    expect(pool?.tokenBMint.toBase58()).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(pool?.tokenAVault.toBase58()).toBe('5jhPbB45eN1Yyo7EVT1LKiiqzYqEBKds1JRJwE66rVX1');
    expect(pool?.tokenBVault.toBase58()).toBe('4cSB2rx17N8u1mvRqw8Pt3MK22oFr5zPdW2u9Y5P9yhi');
    expect(damm.decodeMeteoraPool(data.subarray(8))?.tokenAMint.equals(pool!.tokenAMint)).toBe(true);
    const wrongHeader = Buffer.from(data); wrongHeader[0] ^= 1;
    for (const value of [{ data, owner: pk(1) }, { data: wrongHeader, owner: new PublicKey(fixture.owner) }, { data: data.subarray(0, -1), owner: new PublicKey(fixture.owner) }]) {
      expect(await damm.fetchMeteoraPool({ getAccountInfo: async () => ({ value }) }, new PublicKey(fixture.address))).toBeNull();
    }
  });
});

it('keeps the required DAMM v2 optional-referral placeholder before event authority', () => {
  for (const side of ['buy', 'sell']) {
    const ix = build('damm', side, pk(1), pk(2))[0]!;
    expect(ix.keys).toHaveLength(14);
    expect(ix.keys[11]!.pubkey.equals(damm.METEORA_DAMM_V2_PROGRAM_ID)).toBe(true);
    expect(ix.keys[11]!.isWritable).toBe(false);
    expect(ix.keys[12]!.pubkey.equals(damm.getMeteoraDammV2EventAuthorityPda())).toBe(true);
    expect(ix.keys[13]!.pubkey.equals(damm.METEORA_DAMM_V2_PROGRAM_ID)).toBe(true);
  }
});

it('loads DAMM v2 mint programs from account owners and rejects missing or invalid owners', async () => {
  const { Connection } = await import('@solana/web3.js');
  const { MeteoraDammV2Params } = await import('../params');
  const { readFileSync } = await import('node:fs');
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/non-sol-amm-pool-accounts.json', import.meta.url), 'utf8')).damm;
  const data = Buffer.from(fixture.dataBase64, 'base64');
  // Synthetic pool/mint metadata built from the public layout: exercise both token-program paths.
  const poolKey = new PublicKey(fixture.address);
  const mintA = new PublicKey(data.subarray(168, 200));
  const connection = new Connection('http://127.0.0.1:8999');
  let mintOwner: PublicKey | null = TOKEN_2022_PROGRAM_ID;
  connection.getAccountInfo = async key => key.equals(poolKey)
    ? { data, owner: damm.METEORA_DAMM_V2_PROGRAM_ID, lamports: 1, executable: false }
    : mintOwner === null ? null : { data: Buffer.alloc(82), owner: key.equals(mintA) ? mintOwner : TOKEN_PROGRAM_ID, lamports: 1, executable: false };
  const params = await MeteoraDammV2Params.fromPoolAddressByRpc(connection, poolKey);
  expect(params.tokenAProgram.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
  expect(params.tokenBProgram.equals(TOKEN_PROGRAM_ID)).toBe(true);
  mintOwner = pk(55);
  await expect(MeteoraDammV2Params.fromPoolAddressByRpc(connection, poolKey)).rejects.toThrow(/token program/i);
  mintOwner = null;
  await expect(MeteoraDammV2Params.fromPoolAddressByRpc(connection, poolKey)).rejects.toThrow(/missing/i);
});

it('uses idempotent ATA setup for AMMv4 and DAMMv2 buys and sells with prepared accounts', () => {
  for (const venue of ['amm', 'damm']) {
    for (const side of ['buy', 'sell']) {
      const ixs = build(venue, side, pk(1), pk(2), { createInputMintAta: true, createOutputMintAta: true });
      const creates = ixs.slice(0, -1);
      expect(creates).toHaveLength(side === 'buy' ? 2 : 1);
      for (const ix of creates) expect([...ix.data]).toEqual([1]);
    }
  }
});
