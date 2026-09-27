import { describe, expect, it } from "vitest";
import { PublicKey, type AccountInfo } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { discoverPoolQuoteMint } from "../pool-identity";
import {
  getBondingCurvePda,
  PUMPFUN_PROGRAM_ID,
} from "../../instruction/pumpfun_builder";
import { getBonkPoolPDA } from "../../instruction/bonk_builder";
import realAmms from "../../__tests__/fixtures/non-sol-amm-pool-accounts.json";

const base = new PublicKey("3fM6NAMZuarJ9tmqaee5qNEesS9gePJGWzGkNDaYpump");
const quote = new PublicKey("METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL");
const pool = new PublicKey("82RLfDeEAoYtx3rwZF7igAQC1nGsBBvAMkygB5mcJojZ");
const config = new PublicKey("GYqytuXSiX3GaPuCkLMY4jeRR3mAtyAuQqhD32d45g5y");
const stateDisc = [247, 237, 227, 245, 215, 195, 222, 70],
  poolDisc = [241, 154, 109, 4, 17, 177, 109, 188];
function info(
  owner: string,
  length: number,
  disc: number[] = [],
): AccountInfo<Buffer> {
  const data = Buffer.alloc(length);
  data.set(disc);
  return {
    owner: new PublicKey(owner),
    data,
    executable: false,
    lamports: 1,
    rentEpoch: 0,
  };
}
function connection(accounts: Map<string, AccountInfo<Buffer>>) {
  return {
    getAccountInfo: async (address: PublicKey) =>
      accounts.get(address.toBase58()) ?? null,
  };
}
const cases = [
  [
    "PumpSwap",
    "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    261,
    poolDisc,
    43,
    75,
  ],
  [
    "LaunchLab",
    "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
    429,
    stateDisc,
    205,
    237,
  ],
  [
    "CPMM",
    "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
    637,
    stateDisc,
    168,
    200,
  ],
  ["AMM v4", "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", 752, [], 400, 432],
  [
    "DAMM v2",
    "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
    1112,
    poolDisc,
    168,
    200,
  ],
  [
    "CLMM",
    "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
    1544,
    stateDisc,
    73,
    105,
  ],
  [
    "Whirlpool",
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    653,
    [63, 149, 209, 12, 225, 128, 99, 9],
    101,
    181,
  ],
  [
    "DLMM",
    "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    904,
    [33, 11, 49, 98, 181, 101, 177, 13],
    88,
    120,
  ],
  [
    "DAMM v1",
    "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
    952,
    poolDisc,
    40,
    72,
  ],
] as const;
describe("authenticated pool quote identity", () => {
  it.each(cases)(
    "discovers either selected side of %s without a stablecoin whitelist",
    async (name, owner, length, disc, a, b) => {
      const state = info(owner, length, [...disc]);
      state.data.set(base.toBytes(), a);
      state.data.set(quote.toBytes(), b);
      const address = name === "LaunchLab" ? getBonkPoolPDA(base, quote) : pool;
      const rpc = connection(new Map([[address.toBase58(), state]]));
      expect(
        (await discoverPoolQuoteMint(rpc, address, base)).equals(quote),
      ).toBe(true);
      expect(
        (await discoverPoolQuoteMint(rpc, address, quote)).equals(base),
      ).toBe(true);
      await expect(
        discoverPoolQuoteMint(rpc, address, NATIVE_MINT),
      ).rejects.toThrow(/target mint/);
      if (disc.length) {
        state.data[0] ^= 255;
        await expect(
          discoverPoolQuoteMint(rpc, address, base),
        ).rejects.toThrow();
      }
    },
  );
  it("binds legacy and extended Pump curves to their target mint PDA", async () => {
    const address = getBondingCurvePda(base);
    const state = info(
      PUMPFUN_PROGRAM_ID.toBase58(),
      115,
      [23, 183, 248, 55, 96, 216, 172, 96],
    );
    state.data.set(quote.toBytes(), 83);
    const map = new Map([[address.toBase58(), state]]),
      rpc = connection(map);
    expect(
      (await discoverPoolQuoteMint(rpc, address, base)).equals(quote),
    ).toBe(true);
    await expect(discoverPoolQuoteMint(rpc, address, quote)).rejects.toThrow(
      /does not belong/,
    );
    state.data = state.data.subarray(0, 83);
    expect(
      (await discoverPoolQuoteMint(rpc, address, base)).equals(NATIVE_MINT),
    ).toBe(true);
    state.data = Buffer.alloc(90);
    await expect(discoverPoolQuoteMint(rpc, address, base)).rejects.toThrow(
      /truncated/,
    );
  });
  it("loads DBC's authenticated referenced config and rejects a missing or substituted config", async () => {
    const owner = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
    const state = info(owner, 424, [213, 224, 5, 209, 98, 69, 119, 92]);
    state.data.set(config.toBytes(), 72);
    state.data.set(base.toBytes(), 136);
    const cfg = info(owner, 1024, [26, 108, 14, 123, 116, 230, 129, 43]);
    cfg.data.set(quote.toBytes(), 8);
    const map = new Map([
        [pool.toBase58(), state],
        [config.toBase58(), cfg],
      ]),
      rpc = connection(map);
    expect((await discoverPoolQuoteMint(rpc, pool, base)).equals(quote)).toBe(
      true,
    );
    cfg.data[0] = 0;
    await expect(discoverPoolQuoteMint(rpc, pool, base)).rejects.toThrow(
      /discriminator/,
    );
    cfg.owner = PUMPFUN_PROGRAM_ID;
    await expect(discoverPoolQuoteMint(rpc, pool, base)).rejects.toThrow(
      /owner/,
    );
    map.delete(config.toBase58());
    await expect(discoverPoolQuoteMint(rpc, pool, base)).rejects.toThrow(
      /missing/,
    );
  });
  it("rejects executable, unknown-owner, truncated and identical-mint pool identities", async () => {
    const state = info(cases[5][1], 1544, stateDisc);
    state.data.set(base.toBytes(), 73);
    state.data.set(base.toBytes(), 105);
    const rpc = connection(new Map([[pool.toBase58(), state]]));
    await expect(discoverPoolQuoteMint(rpc, pool, base)).rejects.toThrow(
      /mint pair/,
    );
    state.data = state.data.subarray(0, 100);
    await expect(discoverPoolQuoteMint(rpc, pool, base)).rejects.toThrow(
      /truncated/,
    );
    state.owner = base;
    await expect(discoverPoolQuoteMint(rpc, pool, base)).rejects.toThrow(
      /unsupported/,
    );
    state.executable = true;
    await expect(discoverPoolQuoteMint(rpc, pool, base)).rejects.toThrow(
      /executable/,
    );
  });
  it.each(Object.entries(realAmms))(
    "discovers existing captured non-SOL %s pool mints",
    async (_, captured) => {
      const state = {
        ...info(captured.owner, 0),
        data: Buffer.from(captured.dataBase64, "base64"),
      };
      const address = new PublicKey(captured.address);
      const a = new PublicKey(state.data.subarray(168, 200)),
        b = new PublicKey(state.data.subarray(200, 232));
      const rpc = connection(new Map([[address.toBase58(), state]]));
      expect((await discoverPoolQuoteMint(rpc, address, a)).equals(b)).toBe(
        true,
      );
    },
  );
});
