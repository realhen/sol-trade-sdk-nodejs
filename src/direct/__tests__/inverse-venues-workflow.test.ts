import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import BN from "bn.js";
import {
  Connection,
  PublicKey,
  type AccountInfo,
  type EpochInfo,
} from "@solana/web3.js";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TransferFeeConfigLayout,
  unpackMint,
  type Mint,
} from "@solana/spl-token";
import { BaseFeeMode } from "@meteora-ag/dynamic-bonding-curve-sdk";
import * as raydiumClmm from "../../venues/raydium-clmm";
import * as orcaWhirlpool from "../../venues/orca-whirlpool";
import * as meteoraDlmm from "../../venues/meteora-dlmm";
import * as meteoraDbc from "../../venues/meteora-dbc";
import * as meteoraDammV1 from "../../venues/meteora-damm-v1";

interface CapturedFixture {
  venue: string;
  pool: string;
  accounts: Record<
    string,
    | (Omit<AccountInfo<Buffer>, "owner" | "data"> & {
        owner: string;
        data: string;
      })
    | null
  >;
  meta: { getEpochInfo: EpochInfo; getSlot: number; getBlockTime: number };
  quotes: { input: string; amount: string; output: string }[];
}

type Scenario =
  | "recorded"
  | "older transfer fees"
  | "newer transfer fees"
  | "active rate limiter";

interface Workflow {
  forward(inputMint: PublicKey, amountIn: bigint): bigint;
  inverse(inputMint: PublicKey, amountOut: bigint): bigint | undefined;
  state(): string;
}

const fixtureDirectory = new URL("./fixtures/", import.meta.url);
const fixtures = readdirSync(fixtureDirectory)
  .filter((name) => name.endsWith(".json"))
  .map(
    (name) =>
      JSON.parse(
        readFileSync(new URL(name, fixtureDirectory), "utf8"),
      ) as CapturedFixture,
  )
  .filter((fixture) => fixture.accounts && fixture.quotes);

beforeAll(() =>
  vi.stubGlobal("fetch", () => {
    throw new Error(
      "External network is forbidden during captured inverse workflows",
    );
  }),
);
afterAll(() => vi.unstubAllGlobals());

function serialize(value: unknown): string {
  return JSON.stringify(value, (_, entry) =>
    typeof entry === "bigint" ? entry.toString() : entry,
  );
}

function capturedConnection(fixture: CapturedFixture) {
  let warmed = false;
  function assertPreparing(): void {
    if (warmed) throw new Error("Warmed inverse workflows must not access RPC");
  }
  function read(address: PublicKey): AccountInfo<Buffer> | null {
    assertPreparing();
    const account = fixture.accounts[address.toBase58()];
    if (account === undefined)
      throw new Error(`Missing captured account ${address.toBase58()}`);
    return (
      account && {
        ...account,
        owner: new PublicKey(account.owner),
        data: Buffer.from(account.data, "base64"),
      }
    );
  }
  const connection = Object.assign(new Connection("http://127.0.0.1:8899"), {
    getAccountInfo: async (address: PublicKey) => read(address),
    getMultipleAccountsInfo: async (addresses: PublicKey[]) =>
      addresses.map(read),
    getAccountInfoAndContext: async (address: PublicKey) => ({
      context: { slot: 0 },
      value: read(address),
    }),
    getMultipleAccountsInfoAndContext: async (addresses: PublicKey[]) => ({
      context: { slot: 0 },
      value: addresses.map(read),
    }),
    getTokenSupply: async (address: PublicKey) => {
      const account = read(address);
      if (!account) throw new Error("Captured mint is missing");
      const mint = unpackMint(address, account, account.owner);
      return {
        context: { slot: 0 },
        value: {
          amount: String(mint.supply),
          decimals: mint.decimals,
          uiAmount: null,
          uiAmountString: "0",
        },
      };
    },
    getEpochInfo: async () => {
      assertPreparing();
      return { ...fixture.meta.getEpochInfo };
    },
    getSlot: async () => {
      assertPreparing();
      return fixture.meta.getSlot;
    },
    getBlockTime: async () => {
      assertPreparing();
      return fixture.meta.getBlockTime;
    },
    _rpcRequest: async () => {
      throw new Error("Uncaptured RPC is forbidden");
    },
  });
  return {
    connection,
    warm() {
      warmed = true;
    },
  };
}

function withTransferFees<T extends Mint>(
  mint: T,
): T & { tokenProgram: PublicKey } {
  const tlvData = Buffer.alloc(4 + TransferFeeConfigLayout.span);
  tlvData.writeUInt16LE(ExtensionType.TransferFeeConfig, 0);
  tlvData.writeUInt16LE(TransferFeeConfigLayout.span, 2);
  TransferFeeConfigLayout.encode(
    {
      transferFeeConfigAuthority: PublicKey.default,
      withdrawWithheldAuthority: PublicKey.default,
      withheldAmount: 0n,
      olderTransferFee: {
        epoch: 0n,
        maximumFee: 50n,
        transferFeeBasisPoints: 100,
      },
      newerTransferFee: {
        epoch: 10n,
        maximumFee: 100n,
        transferFeeBasisPoints: 200,
      },
    },
    tlvData.subarray(4),
  );
  return { ...mint, tokenProgram: TOKEN_2022_PROGRAM_ID, tlvData };
}

async function prepareWorkflow(
  fixture: CapturedFixture,
  scenario: Scenario,
): Promise<Workflow> {
  const cache = capturedConnection(fixture);
  const pool = new PublicKey(fixture.pool);
  const feeEpoch =
    scenario === "older transfer fees"
      ? 5
      : scenario === "newer transfer fees"
        ? 10
        : undefined;
  let workflow: Workflow;
  switch (fixture.venue) {
    case "Raydium CLMM": {
      const snapshot = await raydiumClmm.prepare(cache.connection, pool);
      if (feeEpoch !== undefined) {
        snapshot.mintA = withTransferFees(snapshot.mintA);
        snapshot.mintB = withTransferFees(snapshot.mintB);
        snapshot.epochInfo.epoch = feeEpoch;
      }
      workflow = {
        forward: (mint, amount) =>
          raydiumClmm.quote(snapshot, mint, amount, 0).expectedAmountOut,
        inverse: (mint, amount) =>
          raydiumClmm.quoteInputForOutput(snapshot, mint, amount),
        state: () =>
          serialize([
            snapshot.poolInfo,
            snapshot.tickArrays,
            snapshot.epochInfo,
            snapshot.mintA,
            snapshot.mintB,
          ]),
      };
      break;
    }
    case "Orca Whirlpool": {
      const snapshot = await orcaWhirlpool.prepare(cache.connection, pool);
      if (feeEpoch !== undefined) {
        snapshot.tokenExtensionCtx.tokenMintWithProgramA = withTransferFees(
          snapshot.tokenExtensionCtx.tokenMintWithProgramA,
        );
        snapshot.tokenExtensionCtx.tokenMintWithProgramB = withTransferFees(
          snapshot.tokenExtensionCtx.tokenMintWithProgramB,
        );
        snapshot.tokenExtensionCtx.currentEpoch = feeEpoch;
      }
      workflow = {
        forward: (mint, amount) =>
          orcaWhirlpool.quote(snapshot, mint, amount, 0).expectedAmountOut,
        inverse: (mint, amount) =>
          orcaWhirlpool.quoteInputForOutput(snapshot, mint, amount),
        state: () =>
          serialize([
            snapshot.poolData,
            snapshot.tickArraysAtoB,
            snapshot.tickArraysBtoA,
            snapshot.oracleData,
            snapshot.tokenExtensionCtx,
          ]),
      };
      break;
    }
    case "Meteora DLMM": {
      let snapshot = await meteoraDlmm.prepare(cache.connection, pool);
      if (feeEpoch !== undefined) {
        for (const token of [snapshot.client.tokenX, snapshot.client.tokenY]) {
          token.mint = withTransferFees(token.mint);
          token.owner = TOKEN_2022_PROGRAM_ID;
        }
        snapshot.client.clock.epoch = new BN(feeEpoch);
        snapshot = meteoraDlmm.prepareFromSnapshot(
          snapshot.client,
          snapshot.binArrays,
        );
      }
      workflow = {
        forward: (mint, amount) =>
          meteoraDlmm.quote(snapshot, mint, amount, 0).amountOut,
        inverse: (mint, amount) =>
          meteoraDlmm.quoteInputForOutput(snapshot, mint, amount),
        state: () =>
          serialize([
            snapshot.client.lbPair,
            snapshot.client.tokenX,
            snapshot.client.tokenY,
            snapshot.client.clock,
            snapshot.chainTime,
            snapshot.binArrays,
          ]),
      };
      break;
    }
    case "Meteora DBC": {
      let snapshot = await meteoraDbc.prepare(cache.connection, pool);
      if (scenario === "active rate limiter") {
        snapshot = {
          ...snapshot,
          currentPoint: snapshot.virtualPool.poolState.activationPoint.addn(1),
          config: {
            ...snapshot.config,
            poolFees: {
              ...snapshot.config.poolFees,
              baseFee: {
                ...snapshot.config.poolFees.baseFee,
                baseFeeMode: BaseFeeMode.RateLimiter,
                cliffFeeNumerator: new BN(1_000_000),
                firstFactor: 10,
                secondFactor: new BN(1_000),
                thirdFactor: new BN(100_000),
              },
            },
          },
        };
      }
      workflow = {
        forward: (mint, amount) =>
          meteoraDbc.quote(snapshot, {
            inputMint: mint,
            outputMint: mint.equals(snapshot.baseMint)
              ? snapshot.quoteMint
              : snapshot.baseMint,
            amountIn: amount,
            slippageBps: 0,
          }).amountOut,
        inverse: (mint, amount) =>
          meteoraDbc.quoteInputForOutput(snapshot, mint, amount),
        state: () =>
          serialize([
            snapshot.virtualPool,
            snapshot.config,
            snapshot.currentPoint,
          ]),
      };
      break;
    }
    default:
      throw new Error(`Unsupported inverse workflow venue ${fixture.venue}`);
  }
  cache.warm();
  return workflow;
}

describe("captured venue preparation and inverse sizing workflows", () => {
  for (const venue of [
    "Raydium CLMM",
    "Orca Whirlpool",
    "Meteora DLMM",
    "Meteora DBC",
  ]) {
    const fixture = fixtures.find((entry) => entry.venue === venue)!;
    const scenarios: Scenario[] =
      venue === "Meteora DBC"
        ? ["recorded", "active rate limiter"]
        : ["recorded", "older transfer fees", "newer transfer fees"];
    for (const scenario of scenarios) {
      for (const saved of fixture.quotes) {
        it(`${venue}: ${scenario}, input ${saved.input}`, async () => {
          const workflow = await prepareWorkflow(fixture, scenario);
          const mint = new PublicKey(saved.input);
          const before = workflow.state();
          const machineClock = vi.spyOn(Date, "now").mockImplementation(() => {
            throw new Error("Warmed quotes must use the prepared chain clock");
          });
          try {
            const target = workflow.forward(mint, BigInt(saved.amount));
            if (scenario === "recorded")
              expect(target).toBe(BigInt(saved.output));
            const candidate = workflow.inverse(mint, target);
            expect(candidate).toBeDefined();
            if (candidate === undefined)
              throw new Error("Expected supported inverse quote");
            expect(workflow.state()).toBe(before);
            expect(workflow.inverse(mint, target)).toBe(candidate);
            expect(workflow.forward(mint, candidate)).toBeGreaterThanOrEqual(
              target,
            );
            expect(workflow.forward(mint, candidate - 1n)).toBeLessThan(target);
            expect(workflow.state()).toBe(before);
          } finally {
            machineClock.mockRestore();
          }
        });
      }
    }
  }

  it("DAMM v1 retains its explicit vault-aware forward fallback in both directions", async () => {
    const fixture = fixtures.find(
      (entry) => entry.venue === "Meteora DAMM v1",
    )!;
    const cache = capturedConnection(fixture);
    const snapshot = await meteoraDammV1.prepare(
      cache.connection,
      new PublicKey(fixture.pool),
    );
    cache.warm();
    for (const saved of fixture.quotes) {
      const inputMint = new PublicKey(saved.input);
      expect(
        meteoraDammV1.quoteInputForOutput(
          snapshot,
          inputMint,
          BigInt(saved.output),
        ),
      ).toBeUndefined();
      const quote = meteoraDammV1.quote(snapshot, {
        inputMint,
        outputMint: inputMint.equals(snapshot.baseMint)
          ? snapshot.quoteMint
          : snapshot.baseMint,
        amountIn: BigInt(saved.amount),
        slippageBps: 0,
      });
      expect(quote.amountOut).toBe(BigInt(saved.output));
    }
  });
});
