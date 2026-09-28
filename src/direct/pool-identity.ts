/** Pool pair identity only. This is not a liquidity, activation or swap-capability
 * check; direct preparation independently validates executable market state.
 */
import { Buffer } from "buffer";
import { type AccountInfo, type Connection, PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  PUMPFUN_PROGRAM_ID,
  getBondingCurvePda,
} from "../instruction/pumpfun_builder";
import {
  PUMPSWAP_PROGRAM,
  PUMPSWAP_POOL_DISCRIMINATOR,
  decodePool,
} from "../instruction/pumpswap";
import {
  BONK_PROGRAM_ID,
  decodeBonkPoolState,
  getBonkPoolPDA,
} from "../instruction/bonk_builder";
import {
  RAYDIUM_CPMM_PROGRAM_ID,
  RAYDIUM_CPMM_POOL_STATE_DISCRIMINATOR,
  decodeRaydiumCPMMpoolState,
} from "../instruction/raydium_cpmm_builder";
import {
  RAYDIUM_AMM_V4_PROGRAM_ID,
  AMM_INFO_SIZE,
} from "../instruction/raydium_amm_v4_builder";
import {
  METEORA_DAMM_V2_PROGRAM_ID,
  METEORA_POOL_DISCRIMINATOR,
  decodeMeteoraPool,
} from "../instruction/meteora_damm_v2_builder";

function check(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(`Pool quote identity: ${reason}`);
}
function discriminator(
  data: Buffer,
  expected: readonly number[] | Buffer,
): void {
  check(
    data.subarray(0, 8).equals(Buffer.from(expected)),
    "invalid account discriminator",
  );
}
function pubkey(data: Buffer, offset: number): PublicKey {
  check(data.length >= offset + 32, "truncated mint identity");
  return new PublicKey(data.subarray(offset, offset + 32));
}
async function account(
  connection: Pick<Connection, "getAccountInfo">,
  address: PublicKey,
): Promise<AccountInfo<Buffer>> {
  const info = await connection.getAccountInfo(address, "confirmed");
  check(info && !info.executable, "missing or executable pool account");
  return { ...info, data: Buffer.from(info.data) };
}

// Fixed identity prefixes migrated from Trade Lab's protocol-IDL-generated
// pool-layouts.ts. These contain no quote math or executable protocol code.
// CLMM: raydium-io/raydium-idl/raydium_clmm/raydium_clmm.json
// SHA256 040a8c4866317fa028be8a81db54325ce6d9b92aeb10582d89992855bbbce5c1
// Orca: @orca-so/whirlpools-sdk@0.22.0/dist/artifacts/whirlpool.json
// SHA256 f3e95ddf321d24b71ce56f5ba842055899f32a1feee3be9f0d3ccf2bd6a55bb8
// DLMM: MeteoraAg/dlmm-sdk/idls/dlmm.json
// SHA256 045c0f4af044be046b6a14b350077e4242e8ac026b64a855803dab30fcdd8b35
// DAMM v1: MeteoraAg/dynamic-bonding-curve/idls/dynamic_amm.json
// SHA256 f9bd1dcd09d22ccc4a890c0f652a59b2081f1e2b512c9ae37d3580d0eed5ad56
const PAIRS = [
  {
    program: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
    discriminator: [247, 237, 227, 245, 215, 195, 222, 70],
    a: 73,
    b: 105,
  },
  {
    program: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    discriminator: [63, 149, 209, 12, 225, 128, 99, 9],
    a: 101,
    b: 181,
  },
  {
    program: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    discriminator: [33, 11, 49, 98, 181, 101, 177, 13],
    a: 88,
    b: 120,
  },
  {
    program: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
    discriminator: [241, 154, 109, 4, 17, 177, 109, 188],
    a: 40,
    b: 72,
  },
] as const;
const DBC = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";

/** Discover the opposite mint of the selected token from authenticated pool
 * state across the eleven supported venue families. Pump curves bind the target
 * through their PDA, since the base mint is absent from curve data. DBC needs
 * one additional config read. A cached Connection can serve these reads without
 * RPC; missing cached dependencies must fail rather than inventing a quote mint.
 * Returns SPL mint identity (native SOL is represented by WSOL).
 */
export async function discoverPoolQuoteMint(
  connection: Pick<Connection, "getAccountInfo">,
  pool: PublicKey,
  targetMint: PublicKey,
): Promise<PublicKey> {
  check(!targetMint.equals(PublicKey.default), "invalid target mint");
  const info = await account(connection, pool),
    data = info.data;
  let a: PublicKey, b: PublicKey;
  if (info.owner.equals(PUMPFUN_PROGRAM_ID)) {
    check(
      getBondingCurvePda(targetMint).equals(pool),
      "Pump curve does not belong to target mint",
    );
    // Same complete legacy prefixes and quote_mint field as params/index.ts.
    // Source: pump-fun/pump-public-docs/idl/pump.json.
    check(
      data.length >= 115 || [49, 81, 82, 83].includes(data.length),
      "truncated Pump curve",
    );
    discriminator(data, [23, 183, 248, 55, 96, 216, 172, 96]);
    for (const offset of [
      48,
      ...(data.length >= 82 ? [81] : []),
      ...(data.length >= 83 ? [82] : []),
    ]) {
      check(
        data[offset] === 0 || data[offset] === 1,
        "invalid Pump curve boolean",
      );
    }
    a = targetMint;
    const encodedQuote =
      data.length >= 115 ? pubkey(data, 83) : PublicKey.default;
    b = encodedQuote.equals(PublicKey.default) ? NATIVE_MINT : encodedQuote;
  } else if (info.owner.equals(PUMPSWAP_PROGRAM)) {
    discriminator(data, PUMPSWAP_POOL_DISCRIMINATOR);
    check(
      [252, 261, 270, 300, 301, 643].includes(data.length),
      "unsupported PumpSwap account length",
    );
    const state = decodePool(data.subarray(8));
    check(state, "invalid PumpSwap pool");
    a = state.baseMint;
    b = state.quoteMint;
  } else if (info.owner.equals(BONK_PROGRAM_ID)) {
    const state = decodeBonkPoolState(data);
    check(state, "invalid LaunchLab pool");
    a = state.baseMint;
    b = state.quoteMint;
    check(getBonkPoolPDA(a, b).equals(pool), "LaunchLab pool address mismatch");
  } else if (info.owner.equals(RAYDIUM_CPMM_PROGRAM_ID)) {
    discriminator(data, RAYDIUM_CPMM_POOL_STATE_DISCRIMINATOR);
    const state = decodeRaydiumCPMMpoolState(data.subarray(8));
    check(state, "invalid CPMM pool");
    a = state.token0Mint;
    b = state.token1Mint;
  } else if (info.owner.equals(RAYDIUM_AMM_V4_PROGRAM_ID)) {
    check(data.length === AMM_INFO_SIZE, "invalid AMM v4 account length");
    // AmmInfo has no discriminator. Its four cumulative swap amounts are u128;
    // use the official fixed identity offsets rather than the legacy decoder's
    // u64 counters. Source: raydium-io/raydium-amm/program/src/state.rs AmmInfo.
    a = pubkey(data, 400);
    b = pubkey(data, 432);
  } else if (info.owner.equals(METEORA_DAMM_V2_PROGRAM_ID)) {
    discriminator(data, METEORA_POOL_DISCRIMINATOR);
    const state = decodeMeteoraPool(data.subarray(8));
    check(state, "invalid DAMM v2 pool");
    a = state.tokenAMint;
    b = state.tokenBMint;
  } else if (info.owner.toBase58() === DBC) {
    // Meteora DBC IDL SHA256 beedc8c869bc04865c26349a72a3ba9c773e61f48be2d33093c591a015fe82fd.
    discriminator(data, [213, 224, 5, 209, 98, 69, 119, 92]);
    a = pubkey(data, 136);
    const config = await account(connection, pubkey(data, 72));
    check(config.owner.equals(info.owner), "DBC config owner mismatch");
    discriminator(config.data, [26, 108, 14, 123, 116, 230, 129, 43]);
    b = pubkey(config.data, 8);
  } else {
    const layout = PAIRS.find(
      (entry) => entry.program === info.owner.toBase58(),
    );
    check(layout, "unsupported pool program");
    discriminator(data, layout.discriminator);
    a = pubkey(data, layout.a);
    b = pubkey(data, layout.b);
  }
  check(
    !a.equals(PublicKey.default) &&
      !b.equals(PublicKey.default) &&
      !a.equals(b),
    "invalid pool mint pair",
  );
  check(
    a.equals(targetMint) || b.equals(targetMint),
    "pool does not contain target mint",
  );
  return a.equals(targetMint) ? b : a;
}
