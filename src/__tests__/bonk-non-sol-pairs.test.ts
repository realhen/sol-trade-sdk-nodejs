import { describe, expect, it } from "vitest";
import BN from "bn.js";
import { createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { LaunchpadPool } from "@raydium-io/raydium-sdk-v2";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "../common/spl-token";
import * as bonk from "../instruction/bonk_builder";
import { BonkParams } from "../params";

const pk = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
const payer = pk(99),
  base = pk(1),
  creator = pk(2),
  platform = pk(3),
  config = pk(4);
const solAlias = new PublicKey("So11111111111111111111111111111111111111111");
function context(quoteMint = bonk.USDC_MINT): bonk.BonkParams {
  return {
    baseMint: base,
    quoteMint,
    quoteTokenProgram: TOKEN_PROGRAM_ID,
    poolState: PublicKey.default,
    baseVault: PublicKey.default,
    quoteVault: PublicKey.default,
    virtualBase: 1_000_000n,
    virtualQuote: 2_000_000n,
    realBase: 100_000n,
    realQuote: 300_000n,
    mintTokenProgram: TOKEN_2022_PROGRAM_ID,
    platformConfig: platform,
    platformAssociatedAccount: bonk.getBonkPlatformAssociatedAccount(
      platform,
      quoteMint,
    ),
    creatorAssociatedAccount: bonk.getBonkCreatorAssociatedAccount(
      creator,
      quoteMint,
    ),
    globalConfig: config,
  };
}
function build(
  side: "buy" | "sell",
  protocolParams = context(),
  overrides: Record<string, unknown> = {},
) {
  const common = {
    payer,
    inputAmount: 1000n,
    minimumOutputAmount: 17n,
    createInputMintAta: false,
    createOutputMintAta: false,
    protocolParams,
    ...overrides,
  };
  return side === "buy"
    ? bonk.buildBonkBuyInstructions({
        inputMint: protocolParams.quoteMint,
        outputMint: base,
        ...common,
      })
    : bonk.buildBonkSellInstructions({
        inputMint: base,
        outputMint: protocolParams.quoteMint,
        ...common,
      });
}
function swap(ixs: ReturnType<typeof build>) {
  return ixs.find((ix) => ix.programId.equals(bonk.BONK_PROGRAM_ID))!;
}

describe("LaunchLab direct quote assets", () => {
  for (const side of ["buy", "sell"] as const) {
    for (const quote of [bonk.USDC_MINT, pk(9)]) {
      it(`${side} binds arbitrary quote ${quote} and exact-input minimum`, () => {
        const ix = swap(build(side, context(quote)));
        expect(ix.keys).toHaveLength(18);
        expect(ix.data.subarray(0, 8)).toEqual(
          side === "buy"
            ? bonk.BONK_BUY_EXACT_IN_DISCRIMINATOR
            : bonk.BONK_SELL_EXACT_IN_DISCRIMINATOR,
        );
        expect(ix.data.readBigUInt64LE(8)).toBe(1000n);
        expect(ix.data.readBigUInt64LE(16)).toBe(17n);
        expect(ix.keys[2]!.pubkey.equals(config)).toBe(true);
        expect(
          ix.keys[4]!.pubkey.equals(bonk.getBonkPoolPda(base, quote)),
        ).toBe(true);
        expect(
          ix.keys[6]!.pubkey.equals(
            getAssociatedTokenAddressSync(quote, payer, true, TOKEN_PROGRAM_ID),
          ),
        ).toBe(true);
        expect(
          ix.keys[8]!.pubkey.equals(
            bonk.getBonkVaultPda(bonk.getBonkPoolPda(base, quote), quote),
          ),
        ).toBe(true);
        expect(ix.keys[9]!.pubkey.equals(base)).toBe(true);
        expect(ix.keys[10]!.pubkey.equals(quote)).toBe(true);
        expect(ix.keys[11]!.pubkey.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
        expect(ix.keys[12]!.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
      });
    }
    it(`${side} creates quote ATA without wrapping or closing nonnative tokens`, () => {
      const ixs = build(side, context(), {
        createInputMintAta: true,
        createOutputMintAta: true,
        closeInputMintAta: side === "buy",
        closeOutputMintAta: side === "sell",
      });
      const quoteAta = ixs.find((ix) =>
        ix.keys[3]?.pubkey.equals(bonk.USDC_MINT),
      );
      expect(quoteAta?.keys[5]!.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
      expect(
        ixs.some((ix) => ix.programId.equals(SystemProgram.programId)),
      ).toBe(false);
      expect(
        ixs.filter((ix) => ix.programId.equals(TOKEN_PROGRAM_ID)),
      ).toHaveLength(0);
    });
    it(`${side} uses idempotent default ATA setup for already funded quote wallets`, () => {
      for (const quote of [bonk.USDC_MINT, bonk.USD1_MINT, pk(9)]) {
        const protocolParams = {
          ...context(quote),
          globalConfig: quote.equals(bonk.USD1_MINT)
            ? bonk.BONK_USD1_GLOBAL_CONFIG
            : config,
        };
        const ixs = build(side, protocolParams, {
          createInputMintAta: undefined,
          createOutputMintAta: undefined,
        });
        const assets =
          side === "buy"
            ? [
                [quote, TOKEN_PROGRAM_ID],
                [base, TOKEN_2022_PROGRAM_ID],
              ]
            : [[quote, TOKEN_PROGRAM_ID]];
        for (const [mint, program] of assets) {
          const actual = ixs.find((ix) => ix.keys[3]?.pubkey.equals(mint!))!;
          const expected = createAssociatedTokenAccountIdempotentInstruction(
            payer,
            getAssociatedTokenAddressSync(mint!, payer, true, program!),
            payer,
            mint!,
            program!,
          );
          expect(actual.data).toEqual(Buffer.from([1]));
          expect(actual).toEqual(expected);
        }
      }
    });
    it(`${side} rejects mismatched requested and protocol mints`, () => {
      for (const overrides of [
        { inputMint: pk(50) },
        { outputMint: pk(50) },
        { inputMint: base, outputMint: base },
      ])
        expect(() => build(side, context(), overrides)).toThrow(/mint|pair/i);
      expect(() => build(side, { ...context(), baseMint: pk(50) })).toThrow(
        /mint|pair/i,
      );
      expect(() => build(side, context(base))).toThrow(/mint|pair/i);
    });
    it(`${side} requires explicit arbitrary-quote context and a trusted floor`, () => {
      for (const field of [
        "baseMint",
        "quoteTokenProgram",
        "globalConfig",
      ] as const)
        expect(() =>
          build(side, { ...context(), [field]: undefined }),
        ).toThrow();
      for (const field of [
        "globalConfig",
        "platformConfig",
        "platformAssociatedAccount",
        "creatorAssociatedAccount",
      ] as const)
        expect(() =>
          build(side, { ...context(), [field]: PublicKey.default }),
        ).toThrow();
      expect(() =>
        build(side, context(), { minimumOutputAmount: undefined }),
      ).toThrow(/minimum|floor/i);
      expect(() => build(side, { ...context(), quoteMint: undefined })).toThrow(
        /quote|config/i,
      );
      expect(() =>
        build(side, { ...context(), quoteMint: PublicKey.default }),
      ).toThrow(/mint/i);
    });
    it(`${side} validates floors, slippage and input bounds before instruction construction`, () => {
      for (const inputAmount of [-1n, 0n, 1n << 64n, 1])
        expect(() => build(side, context(), { inputAmount })).toThrow();
      for (const minimumOutputAmount of [-1n, 1n << 64n, 1])
        expect(() => build(side, context(), { minimumOutputAmount })).toThrow();
      for (const slippageBasisPoints of [-1n, 10001n, 1])
        expect(() => build(side, context(), { slippageBasisPoints })).toThrow();
      expect(() => build(side, context(), { fixedOutputAmount: 10n })).toThrow(
        /combined|combine/i,
      );
      expect(
        swap(
          build(side, context(), { minimumOutputAmount: 0n }),
        ).data.readBigUInt64LE(16),
      ).toBe(0n);
      expect(
        swap(
          build(side, context(), {
            minimumOutputAmount: undefined,
            fixedOutputAmount: 19n,
          }),
        ).data.readBigUInt64LE(16),
      ).toBe(19n);
    });
    it(`${side} rejects unsupported quote token programs`, () => {
      for (const quoteTokenProgram of [TOKEN_2022_PROGRAM_ID, pk(55)])
        expect(() => build(side, { ...context(), quoteTokenProgram })).toThrow(
          /classic|token program|Token-2022/i,
        );
      expect(() =>
        build(side, { ...context(), mintTokenProgram: pk(55) }),
      ).toThrow(/token program/i);
    });
    it(`${side} retains SOL/USD1 defaults and normalizes native request aliases`, () => {
      for (const quote of [bonk.WSOL_MINT, bonk.USD1_MINT]) {
        const params = {
          ...context(quote),
          baseMint: undefined,
          quoteMint: undefined,
          quoteTokenProgram: undefined,
          globalConfig: quote.equals(bonk.USD1_MINT)
            ? bonk.BONK_USD1_GLOBAL_CONFIG
            : undefined,
        };
        const ix = swap(
          build(
            side,
            params,
            side === "buy"
              ? { inputMint: quote.equals(bonk.WSOL_MINT) ? solAlias : quote }
              : { outputMint: quote.equals(bonk.WSOL_MINT) ? solAlias : quote },
          ),
        );
        expect(ix.keys[10]!.pubkey.equals(quote)).toBe(true);
        expect(
          ix.keys[2]!.pubkey.equals(
            quote.equals(bonk.USD1_MINT)
              ? bonk.BONK_USD1_GLOBAL_CONFIG
              : bonk.BONK_GLOBAL_CONFIG,
          ),
        ).toBe(true);
      }
    });
  }
  it("derives quote-specific platform and creator PDAs with legacy WSOL defaults", () => {
    for (const quote of [bonk.USDC_MINT, pk(9), bonk.WSOL_MINT]) {
      expect(bonk.getBonkPlatformAssociatedAccount(platform, quote)).toEqual(
        PublicKey.findProgramAddressSync(
          [platform.toBuffer(), quote.toBuffer()],
          bonk.BONK_PROGRAM_ID,
        )[0],
      );
      expect(bonk.getBonkCreatorAssociatedAccount(creator, quote)).toEqual(
        PublicKey.findProgramAddressSync(
          [creator.toBuffer(), quote.toBuffer()],
          bonk.BONK_PROGRAM_ID,
        )[0],
      );
    }
    expect(bonk.getBonkCreatorAssociatedAccount(creator)).toEqual(
      bonk.getBonkCreatorAssociatedAccount(creator, bonk.WSOL_MINT),
    );
    expect(bonk.getBonkPlatformAssociatedAccount(platform)).toEqual(
      bonk.getBonkPlatformAssociatedAccount(platform, bonk.WSOL_MINT),
    );
  });
  it("rejects built-in global configuration mismatches", () => {
    expect(() =>
      build("buy", { ...context(), globalConfig: bonk.BONK_GLOBAL_CONFIG }),
    ).toThrow(/config|quote/i);
    expect(() =>
      build("buy", {
        ...context(bonk.WSOL_MINT),
        globalConfig: bonk.BONK_USD1_GLOBAL_CONFIG,
      }),
    ).toThrow(/config|quote/i);
  });
  it("uses token reserves as sell input and deducts legacy fees from quote output", () => {
    const params = {
      ...context(bonk.WSOL_MINT),
      globalConfig: bonk.BONK_GLOBAL_CONFIG,
    };
    expect(
      swap(
        build("sell", params, {
          inputAmount: 10000n,
          minimumOutputAmount: undefined,
        }),
      ).data.readBigUInt64LE(16),
    ).toBe(22464n);
  });
  it("wraps exact u64 SOL amounts without Number rounding", () => {
    const maximum = (1n << 64n) - 1n;
    const ixs = build(
      "buy",
      { ...context(bonk.WSOL_MINT), globalConfig: bonk.BONK_GLOBAL_CONFIG },
      { inputAmount: maximum, createInputMintAta: true },
    );
    expect(
      ixs
        .find((ix) => ix.programId.equals(SystemProgram.programId))!
        .data.readBigUInt64LE(4),
    ).toBe(maximum);
  });
});

describe("LaunchLab raw RPC pool layout", () => {
  function fixture(overrides: Record<string, unknown> = {}) {
    const data = Buffer.alloc(LaunchpadPool.span);
    LaunchpadPool.encode(
      {
        epoch: new BN(123),
        bump: 254,
        status: 0,
        mintDecimalsA: 9,
        mintDecimalsB: 6,
        migrateType: 1,
        supply: new BN(1_000_000),
        totalSellA: new BN(500_000),
        virtualA: new BN(800_000),
        virtualB: new BN(300_000),
        realA: new BN(40_000),
        realB: new BN(50_000),
        totalFundRaisingB: new BN(60_000),
        protocolFee: new BN(11),
        platformFee: new BN(12),
        migrateFee: new BN(13),
        vestingSchedule: {
          totalLockedAmount: new BN(1),
          cliffPeriod: new BN(2),
          unlockPeriod: new BN(3),
          startTime: new BN(4),
          totalAllocatedShare: new BN(5),
        },
        configId: config,
        platformId: platform,
        mintA: base,
        mintB: bonk.USDC_MINT,
        vaultA: pk(10),
        vaultB: pk(11),
        creator,
        mintProgramFlag: 1,
        cpmmCreatorFeeOn: 1,
        platformVestingShare: new BN(7),
        ...overrides,
      },
      data,
    );
    Buffer.from([247, 237, 227, 245, 215, 195, 222, 70]).copy(data);
    return data;
  }
  it("matches the official SDK Anchor account layout including discriminator and reserved tail", async () => {
    const data = fixture();
    const state = bonk.decodeBonkPoolState(data)!;
    expect(data.length).toBe(429);
    expect(bonk.BONK_POOL_STATE_SIZE).toBe(data.length);
    expect(state).toMatchObject({
      epoch: 123n,
      authBump: 254,
      status: 0,
      baseDecimals: 9,
      quoteDecimals: 6,
      migrateType: 1,
      supply: 1_000_000n,
      totalBaseSell: 500_000n,
      virtualBase: 800_000n,
      virtualQuote: 300_000n,
      realBase: 40_000n,
      realQuote: 50_000n,
    });
    expect(state.globalConfig).toEqual(config);
    expect(state.baseMint).toEqual(base);
    expect(state.quoteMint).toEqual(bonk.USDC_MINT);
    expect(state.creator).toEqual(creator);
    expect(state.vestingSchedule.allocatedShareAmount).toBe(5n);
    expect(
      bonk.decodeBonkPoolState(Buffer.concat([data, Buffer.alloc(8)])),
    ).toEqual(state);
    expect(
      await bonk.fetchBonkPoolState(
        { getAccountInfo: async () => ({ value: { data } }) },
        pk(8),
      ),
    ).toEqual(state);
  });
  function rpc(data = fixture(), owner = bonk.BONK_PROGRAM_ID) {
    const pool = bonk.getBonkPoolPda(base, bonk.USDC_MINT);
    return {
      getAccountInfo: async (key: PublicKey) =>
        key.equals(base)
          ? { owner: TOKEN_2022_PROGRAM_ID, data: Buffer.alloc(82) }
          : key.equals(bonk.USDC_MINT)
            ? { owner: TOKEN_PROGRAM_ID, data: Buffer.alloc(82) }
            : { owner, data },
    } as unknown as Connection;
  }
  it("loads an explicit quote pair by selected pool and mint with quote-specific fee PDAs", async () => {
    const pool = bonk.getBonkPoolPda(base, bonk.USDC_MINT);
    for (const params of [
      await BonkParams.fromPoolByRpc(rpc(), pool),
      await BonkParams.fromMintByRpc(rpc(), base, bonk.USDC_MINT),
    ]) {
      expect(params.baseMint).toEqual(base);
      expect(params.quoteMint).toEqual(bonk.USDC_MINT);
      expect(params.quoteTokenProgram).toEqual(TOKEN_PROGRAM_ID);
      expect(params.mintTokenProgram).toEqual(TOKEN_2022_PROGRAM_ID);
      expect(params.globalConfig).toEqual(config);
      expect(params.platformAssociatedAccount).toEqual(
        bonk.getBonkPlatformAssociatedAccount(platform, bonk.USDC_MINT),
      );
      expect(params.creatorAssociatedAccount).toEqual(
        bonk.getBonkCreatorAssociatedAccount(creator, bonk.USDC_MINT),
      );
      expect(swap(build("buy", params)).keys[10]!.pubkey).toEqual(
        bonk.USDC_MINT,
      );
    }
  });
  it("fails pool RPC loading for wrong owner, pair, address and known config mismatch", async () => {
    const pool = bonk.getBonkPoolPda(base, bonk.USDC_MINT);
    await expect(
      BonkParams.fromPoolByRpc(rpc(fixture(), TOKEN_PROGRAM_ID), pool),
    ).rejects.toThrow(/owner/i);
    await expect(BonkParams.fromPoolByRpc(rpc(), pk(70))).rejects.toThrow(
      /pair|address/i,
    );
    await expect(BonkParams.fromMintByRpc(rpc(), base, pk(71))).rejects.toThrow(
      /pair|address/i,
    );
    await expect(
      BonkParams.fromPoolByRpc(rpc(fixture({ mintB: base })), pool),
    ).rejects.toThrow(/pair/i);
    for (const configId of [
      bonk.BONK_GLOBAL_CONFIG,
      bonk.BONK_USD1_GLOBAL_CONFIG,
      PublicKey.default,
    ]) {
      await expect(
        BonkParams.fromPoolByRpc(rpc(fixture({ configId })), pool),
      ).rejects.toThrow(/config|quote/i);
    }
  });
  it("rejects discriminator-free, truncated and wrong-type accounts", () => {
    const data = fixture();
    for (const invalid of [
      data.subarray(8),
      data.subarray(0, 428),
      Buffer.alloc(429),
    ])
      expect(bonk.decodeBonkPoolState(invalid)).toBeNull();
  });
});
