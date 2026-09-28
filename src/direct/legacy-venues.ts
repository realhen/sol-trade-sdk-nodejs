import { BorshAccountsCoder, utils, type Idl } from "@coral-xyz/anchor";
import { convertIdlToCamelCase } from "@coral-xyz/anchor/dist/esm/idl";
import {
  buyExactInInstruction,
  sellExactInInstruction,
} from "@raydium-io/raydium-sdk-v2";
import {
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import BN from "bn.js";
import {
  getAssociatedTokenAddressSync,
  unpackAccount,
  unpackMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  CpmmPoolInfoLayout,
  CpmmConfigInfoLayout,
} from "@raydium-io/raydium-sdk-v2";
import { CurveCalculator } from "@raydium-io/raydium-sdk-v2";
import { liquidityStateV4Layout } from "@raydium-io/raydium-sdk-v2";
import { MARKET_STATE_LAYOUT_V3 } from "@raydium-io/raydium-sdk-v2";
import {
  LaunchpadPool,
  LaunchpadConfig,
  PlatformConfig,
} from "@raydium-io/raydium-sdk-v2";
import { Curve } from "@raydium-io/raydium-sdk-v2";
import {
  getPdaLaunchpadAuth,
  getPdaPlatformVault,
  getPdaCreatorVault,
} from "@raydium-io/raydium-sdk-v2";
import {
  CpAmmIdl,
  BaseFeeMode,
  getBaseFeeModeFromPodAlignedData,
  swapQuoteExactInput,
  isSwapEnabled,
  SwapMode,
  type PoolState,
} from "@meteora-ag/cp-amm-sdk";
import * as raydiumCpmm from "../instruction/raydium_cpmm_builder";
import * as raydiumAmmV4 from "../instruction/raydium_amm_v4_builder";
import * as bonk from "../instruction/bonk_builder";
import * as meteoraDammV2 from "../instruction/meteora_damm_v2_builder";
import {
  assert,
  account,
  type MarketSnapshot,
  type ChainAccount,
  type AccountReader,
} from "./snapshot";
function decodePoolFields(name: string, info: ChainAccount): void {
  const expected =
    name === "raydium_cpmm_PoolState"
      ? raydiumCpmm.RAYDIUM_CPMM_POOL_STATE_DISCRIMINATOR
      : Buffer.from([247, 237, 227, 245, 215, 195, 222, 70]);
  assert(
    info.data.subarray(0, 8).equals(expected),
    "Invalid pool discriminator",
  );
}

const dammPoolCoder = new BorshAccountsCoder(
  convertIdlToCamelCase(CpAmmIdl as Idl),
);

export const ADDITIONAL_VENUES = {
  "Raydium CPMM": raydiumCpmm.RAYDIUM_CPMM_PROGRAM_ID.toBase58(),
  "Raydium AMM v4": raydiumAmmV4.RAYDIUM_AMM_V4_PROGRAM_ID.toBase58(),
  "Raydium LaunchLab": bonk.BONK_PROGRAM_ID.toBase58(),
  "Meteora DAMM v2": meteoraDammV2.METEORA_DAMM_V2_PROGRAM_ID.toBase58(),
} as const;
export type AdditionalVenue = keyof typeof ADDITIONAL_VENUES;

/** Recognizes only venues with a local quote and instruction adapter. */
export function additionalVenue(
  program: PublicKey,
): AdditionalVenue | undefined {
  return (Object.keys(ADDITIONAL_VENUES) as AdditionalVenue[]).find(
    (name) => ADDITIONAL_VENUES[name] === program.toBase58(),
  );
}

/** Authenticates pool layouts before selecting any dependency addresses. */
function poolState(info: ChainAccount) {
  assert(!info.executable, "Executable account is not a pool.");
  const venue = additionalVenue(info.owner);
  if (venue === "Raydium CPMM") {
    decodePoolFields("raydium_cpmm_PoolState", info);
    return { venue, state: CpmmPoolInfoLayout.decode(info.data) } as const;
  }
  if (venue === "Raydium AMM v4") {
    assert(
      info.data.length === liquidityStateV4Layout.span,
      "Unsupported AMM v4 layout.",
    );
    return { venue, state: liquidityStateV4Layout.decode(info.data) } as const;
  }
  if (venue === "Raydium LaunchLab") {
    decodePoolFields("raydium_launchpad_PoolState", info);
    return { venue, state: LaunchpadPool.decode(info.data) } as const;
  }
  assert(venue === "Meteora DAMM v2", "Unsupported execution venue.");
  return {
    venue,
    state: dammPoolCoder.decode<PoolState>("pool", info.data),
  } as const;
}

/** Discovers pair identity and dependencies, including AMM v4's second-stage market accounts. No RPC. */
export function venueAccounts(info: ChainAccount, read: AccountReader) {
  const pool = poolState(info);
  const addresses: PublicKey[] = [SYSVAR_CLOCK_PUBKEY];
  let mintA: PublicKey, mintB: PublicKey;
  if (pool.venue === "Raydium AMM v4") {
    const s = pool.state;
    mintA = s.baseMint;
    mintB = s.quoteMint;
    addresses.push(
      s.baseVault,
      s.quoteVault,
      s.openOrders,
      s.targetOrders,
      s.marketId,
    );
    const marketInfo = read(s.marketId.toBase58());
    if (marketInfo) {
      assert(
        marketInfo.owner.equals(s.marketProgramId) &&
          !marketInfo.executable &&
          marketInfo.data.length === MARKET_STATE_LAYOUT_V3.span,
        "Invalid orderbook market.",
      );
      const m = MARKET_STATE_LAYOUT_V3.decode(marketInfo.data);
      assert(
        m.ownAddress.equals(s.marketId) &&
          m.baseMint.equals(mintA) &&
          m.quoteMint.equals(mintB),
        "Orderbook pair mismatch.",
      );
      addresses.push(m.bids, m.asks, m.eventQueue, m.baseVault, m.quoteVault);
    }
  } else if (pool.venue === "Meteora DAMM v2") {
    const s = pool.state;
    mintA = s.tokenAMint;
    mintB = s.tokenBMint;
    addresses.push(s.tokenAVault, s.tokenBVault);
  } else {
    const s = pool.state;
    mintA = s.mintA;
    mintB = s.mintB;
    addresses.push(s.vaultA, s.vaultB, s.configId);
    if (pool.venue === "Raydium CPMM") {
      addresses.push(pool.state.observationId);
    } else {
      addresses.push(pool.state.platformId);
    }
  }
  return {
    venue: pool.venue,
    mintA,
    mintB,
    addresses: [...addresses, mintA, mintB],
  };
}

function integer(value: BN): bigint {
  return BigInt(value.toString());
}
function bn(value: bigint): BN {
  return new BN(value.toString());
}

/** Validates vault authority, mint, token program, initialization and frozen state. */
function vault(
  snapshot: MarketSnapshot,
  key: PublicKey,
  mint: PublicKey,
  authority: PublicKey,
): bigint {
  const info = account(snapshot, key),
    mintInfo = account(snapshot, mint);
  assert(info && mintInfo, "Pool vault or mint unavailable.");
  const token = unpackAccount(key, info, mintInfo.owner);
  assert(
    token.mint.equals(mint) &&
      token.owner.equals(authority) &&
      token.isInitialized &&
      !token.isFrozen,
    "Invalid pool vault.",
  );
  return token.amount;
}

function required(
  snapshot: MarketSnapshot,
  key: PublicKey,
  owner: PublicKey,
): ChainAccount {
  const info = account(snapshot, key);
  assert(
    info && info.owner.equals(owner) && !info.executable,
    "Invalid venue account owner.",
  );
  return info;
}

/** A validated cached quote and instruction factory; amounts are atomic units, with no signing or RPC. */
export interface VenueAdapter {
  quote(amount: bigint): bigint;
  instructions(amount: bigint, minimum: bigint): TransactionInstruction[];
}

function exactInput(
  instructions: TransactionInstruction[],
  venue: AdditionalVenue,
) {
  if (venue === "Meteora DAMM v2") instructions[0]!.data[24] = SwapMode.ExactIn;
  return instructions;
}
/**
 * Validates a pool and builds lossless, fee-aware exact-input quotes from cached accounts.
 * Clock state is hydrated with the pool; the facade validates supported mint extensions.
 * Unopened, paused, migrated, empty or unsupported pool configurations fail before signing.
 */
export function venueAdapter(
  snapshot: MarketSnapshot,
  side: "buy" | "sell",
): VenueAdapter {
  const poolKey = new PublicKey(snapshot.pool),
    mint = new PublicKey(snapshot.mint),
    sol = new PublicKey(snapshot.quoteMint),
    user = new PublicKey(snapshot.wallet);
  const poolInfo = account(snapshot, poolKey);
  assert(poolInfo, "Pool unavailable.");
  const pool = poolState(poolInfo);
  assert(pool.venue === snapshot.venue, "Execution venue changed.");
  const discovered = venueAccounts(poolInfo, (key) =>
    account(snapshot, new PublicKey(key)),
  );
  assert(
    (discovered.mintA.equals(mint) && discovered.mintB.equals(sol)) ||
      (discovered.mintB.equals(mint) && discovered.mintA.equals(sol)),
    "Pool pair mismatch.",
  );
  const inputMint = side === "buy" ? sol : mint,
    outputMint = side === "buy" ? mint : sol;
  const aIn = discovered.mintA.equals(inputMint);
  const clock = required(
    snapshot,
    SYSVAR_CLOCK_PUBKEY,
    new PublicKey("Sysvar1111111111111111111111111111111111111"),
  );
  assert(clock.data.length === 40, "Invalid chain clock.");
  const now = clock.data.readBigInt64LE(32),
    slot = clock.data.readBigUInt64LE(0);
  const mintProgram = account(snapshot, mint)!.owner;
  const options = (amount: bigint, minimum: bigint) => ({
    payer: user,
    inputMint,
    outputMint,
    inputAmount: amount,
    minimumOutputAmount: minimum,
    slippageBasisPoints: 0n,
    createInputMintAta: false,
    createOutputMintAta: false,
    closeInputMintAta: false,
    closeOutputMintAta: false,
  });
  if (pool.venue === "Raydium CPMM") {
    const s = pool.state,
      program = raydiumCpmm.RAYDIUM_CPMM_PROGRAM_ID;
    assert(
      (s.status & 4) === 0 && now >= integer(s.openTime),
      "CPMM swaps are paused or not open.",
    );
    assert(s.feeOn >= 0 && s.feeOn <= 2, "Unknown CPMM fee mode.");
    assert(
      account(snapshot, s.mintA)!.owner.equals(s.mintProgramA) &&
        account(snapshot, s.mintB)!.owner.equals(s.mintProgramB),
      "Pool mint program mismatch.",
    );
    const configInfo = required(snapshot, s.configId, program);
    assert(
      configInfo.data.length >= CpmmConfigInfoLayout.span,
      "Invalid CPMM config.",
    );
    const config = CpmmConfigInfoLayout.decode(configInfo.data);
    const reserveA =
      vault(snapshot, s.vaultA, s.mintA, raydiumCpmm.RAYDIUM_CPMM_AUTHORITY) -
      integer(s.protocolFeesMintA.add(s.fundFeesMintA).add(s.creatorFeesMintA));
    const reserveB =
      vault(snapshot, s.vaultB, s.mintB, raydiumCpmm.RAYDIUM_CPMM_AUTHORITY) -
      integer(s.protocolFeesMintB.add(s.fundFeesMintB).add(s.creatorFeesMintB));
    assert(reserveA > 0n && reserveB > 0n, "Empty CPMM reserves.");
    required(snapshot, s.observationId, program);
    const protocolParams: raydiumCpmm.RaydiumCpmmParams = {
      poolState: poolKey,
      ammConfig: s.configId,
      baseMint: s.mintA,
      quoteMint: s.mintB,
      baseTokenProgram: s.mintProgramA,
      quoteTokenProgram: s.mintProgramB,
      baseVault: s.vaultA,
      quoteVault: s.vaultB,
      baseReserve: reserveA,
      quoteReserve: reserveB,
      observationState: s.observationId,
    };
    return {
      quote: (amount) =>
        integer(
          CurveCalculator.swapBaseInput(
            bn(amount),
            bn(aIn ? reserveA : reserveB),
            bn(aIn ? reserveB : reserveA),
            config.tradeFeeRate,
            s.enableCreatorFee ? config.creatorFeeRate : new BN(0),
            config.protocolFeeRate,
            config.fundFeeRate,
            s.feeOn === 0 || s.feeOn === (aIn ? 1 : 2),
          ).outputAmount,
        ),
      instructions: (amount, minimum) =>
        exactInput(
          (side === "buy"
            ? raydiumCpmm.buildRaydiumCpmmBuyInstructions
            : raydiumCpmm.buildRaydiumCpmmSellInstructions)({
            ...options(amount, minimum),
            protocolParams,
          }),
          pool.venue,
        ),
    };
  }
  if (pool.venue === "Raydium AMM v4") {
    const s = pool.state;
    assert(
      s.status.eqn(6),
      "This AMM v4 pool still uses orderbook execution; only swap-only pools are enabled.",
    );
    assert(
      account(snapshot, s.baseMint)!.owner.equals(TOKEN_PROGRAM_ID) &&
        account(snapshot, s.quoteMint)!.owner.equals(TOKEN_PROGRAM_ID),
      "AMM v4 requires the original SPL Token program.",
    );
    const marketInfo = required(snapshot, s.marketId, s.marketProgramId);
    const m = MARKET_STATE_LAYOUT_V3.decode(marketInfo.data);
    const orders = required(snapshot, s.openOrders, s.marketProgramId);
    assert(
      orders.data.length >= 3228 &&
        new PublicKey(orders.data.subarray(13, 45)).equals(s.marketId) &&
        new PublicKey(orders.data.subarray(45, 77)).equals(
          raydiumAmmV4.RAYDIUM_AMM_V4_AUTHORITY,
        ),
      "Invalid AMM open orders.",
    );
    const reserveA =
      vault(
        snapshot,
        s.baseVault,
        s.baseMint,
        raydiumAmmV4.RAYDIUM_AMM_V4_AUTHORITY,
      ) - integer(s.baseNeedTakePnl);
    const reserveB =
      vault(
        snapshot,
        s.quoteVault,
        s.quoteMint,
        raydiumAmmV4.RAYDIUM_AMM_V4_AUTHORITY,
      ) - integer(s.quoteNeedTakePnl);
    assert(reserveA > 0n && reserveB > 0n, "Empty AMM reserves.");
    const numerator = integer(s.swapFeeNumerator),
      denominator = integer(s.swapFeeDenominator);
    assert(
      denominator > 0n && numerator >= 0n && numerator < denominator,
      "Invalid AMM swap fee.",
    );
    const protocolParams: raydiumAmmV4.RaydiumAmmV4Params = {
      amm: poolKey,
      coinMint: s.baseMint,
      pcMint: s.quoteMint,
      tokenCoin: s.baseVault,
      tokenPc: s.quoteVault,
      ammOpenOrders: s.openOrders,
      ammTargetOrders: s.targetOrders,
      serumProgram: s.marketProgramId,
      serumMarket: s.marketId,
      serumBids: m.bids,
      serumAsks: m.asks,
      serumEventQueue: m.eventQueue,
      serumCoinVaultAccount: m.baseVault,
      serumPcVaultAccount: m.quoteVault,
      serumVaultSigner: PublicKey.createProgramAddressSync(
        [
          s.marketId.toBuffer(),
          m.vaultSignerNonce.toArrayLike(Buffer, "le", 8),
        ],
        s.marketProgramId,
      ),
      coinReserve: reserveA,
      pcReserve: reserveB,
    };
    return {
      quote: (amount) => {
        const net =
          amount - (amount * numerator + denominator - 1n) / denominator;
        return net > 0n
          ? (net * (aIn ? reserveB : reserveA)) /
              ((aIn ? reserveA : reserveB) + net)
          : 0n;
      },
      instructions: (amount, minimum) =>
        exactInput(
          (side === "buy"
            ? raydiumAmmV4.buildRaydiumAmmV4BuyInstructions
            : raydiumAmmV4.buildRaydiumAmmV4SellInstructions)({
            ...options(amount, minimum),
            protocolParams,
          }),
          pool.venue,
        ),
    };
  }
  if (pool.venue === "Raydium LaunchLab") {
    const s = pool.state,
      program = bonk.BONK_PROGRAM_ID;
    assert(
      s.status === 0,
      "LaunchLab curve has migrated or does not match the pair.",
    );
    assert(
      account(snapshot, s.mintB)!.owner.equals(TOKEN_PROGRAM_ID),
      "LaunchLab quote requires classic Token",
    );
    const config = LaunchpadConfig.decode(
      required(snapshot, s.configId, program).data,
    );
    const platform = PlatformConfig.decode(
      required(snapshot, s.platformId, program).data,
    );
    assert(config.mintB.equals(s.mintB), "LaunchLab config quote mismatch.");
    const authority = getPdaLaunchpadAuth(program).publicKey;
    vault(snapshot, s.vaultA, s.mintA, authority);
    vault(snapshot, s.vaultB, s.mintB, authority);
    const params = {
      poolInfo: s,
      protocolFeeRate: config.tradeFeeRate,
      platformFeeRate: platform.feeRate,
      creatorFeeRate: platform.creatorFeeRate,
      shareFeeRate: new BN(0),
      curveType: config.curveType,
      transferFeeConfigA: undefined,
      slot: Number(slot),
    };
    return {
      quote: (amount) => {
        if (aIn) {
          return integer(
            Curve.sellExactIn({ ...params, amountA: bn(amount) }).amountB,
          );
        }
        const result = Curve.buyExactIn({ ...params, amountB: bn(amount) });
        assert(
          result.amountB.eq(bn(amount)),
          "Buy exceeds remaining curve capacity.",
        );
        return integer(result.amountA.amount);
      },
      instructions: (amount, minimum) => {
        const build = aIn ? sellExactInInstruction : buyExactInInstruction;
        return [
          build(
            program,
            user,
            authority,
            s.configId,
            s.platformId,
            poolKey,
            getAssociatedTokenAddressSync(
              s.mintA,
              user,
              false,
              account(snapshot, s.mintA)!.owner,
            ),
            getAssociatedTokenAddressSync(s.mintB, user),
            s.vaultA,
            s.vaultB,
            s.mintA,
            s.mintB,
            account(snapshot, s.mintA)!.owner,
            TOKEN_PROGRAM_ID,
            getPdaPlatformVault(program, s.platformId, s.mintB).publicKey,
            getPdaCreatorVault(program, s.creator, s.mintB).publicKey,
            bn(amount),
            bn(minimum),
            new BN(0),
          ),
        ];
      },
    };
  }
  const s = pool.state;
  const point = bn(s.activationType === 0 ? slot : now);
  assert(
    (s.activationType === 0 || s.activationType === 1) &&
      isSwapEnabled(s, point),
    "DAMM v2 swaps are paused or not open.",
  );
  const programA = account(snapshot, s.tokenAMint)!.owner,
    programB = account(snapshot, s.tokenBMint)!.owner;
  vault(
    snapshot,
    s.tokenAVault,
    s.tokenAMint,
    meteoraDammV2.METEORA_DAMM_V2_AUTHORITY,
  );
  vault(
    snapshot,
    s.tokenBVault,
    s.tokenBMint,
    meteoraDammV2.METEORA_DAMM_V2_AUTHORITY,
  );
  const decimalsA = unpackMint(
    s.tokenAMint,
    account(snapshot, s.tokenAMint)!,
    programA,
  ).decimals;
  const decimalsB = unpackMint(
    s.tokenBMint,
    account(snapshot, s.tokenBMint)!,
    programB,
  ).decimals;
  const protocolParams: meteoraDammV2.MeteoraDammV2Params = {
    pool: poolKey,
    tokenAMint: s.tokenAMint,
    tokenBMint: s.tokenBMint,
    tokenAVault: s.tokenAVault,
    tokenBVault: s.tokenBVault,
    tokenAProgram: programA,
    tokenBProgram: programB,
  };
  return {
    quote: (amount) =>
      integer(
        swapQuoteExactInput(
          s,
          point,
          bn(amount),
          0,
          aIn,
          false,
          decimalsA,
          decimalsB,
        ).outputAmount,
      ),
    instructions: (amount, minimum) => {
      const instructions = exactInput(
        (side === "buy"
          ? meteoraDammV2.buildMeteoraDammV2BuyInstructions
          : meteoraDammV2.buildMeteoraDammV2SellInstructions)({
          ...options(amount, minimum),
          protocolParams,
        }),
        pool.venue,
      );
      if (
        getBaseFeeModeFromPodAlignedData(
          s.poolFees.baseFee.baseFeeInfo.data,
        ) === BaseFeeMode.RateLimiter
      ) {
        instructions[0]!.keys.push({
          pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
          isSigner: false,
          isWritable: false,
        });
      }
      return instructions;
    },
  };
}
