import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";
import { normalizeDirectFill, type DirectSwapExpectation } from "../settlement";
import dammV2Buy from "./fixtures/damm-v2-surfpool-buy.json";

const key = (n: number) =>
  Keypair.fromSeed(new Uint8Array(32).fill(n)).publicKey.toBase58();
const OWNER = key(1),
  INPUT = key(2),
  OUTPUT = key(3),
  POOL = key(4),
  VENUE = key(5);
const TOKEN = TOKEN_PROGRAM_ID.toBase58(),
  TOKEN22 = TOKEN_2022_PROGRAM_ID.toBase58(),
  WSOL = NATIVE_MINT.toBase58();
const EVENT = "D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf";
const JUP = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const ata = (mint: string, program: string) =>
  getAssociatedTokenAddressSync(
    new PublicKey(mint),
    new PublicKey(OWNER),
    false,
    new PublicKey(program),
  ).toBase58();
// Official /swap/v2/build route_v2 Flux route; only the amount header is changed.
function routeData() {
  const b = Buffer.from(
    "u2T6zDHErxQA4fUFAAAAADQluQAAAAAAZAAAAAAAAQAAAJ12u7hqAAAAAAEQJwAB",
    "base64",
  );
  b.writeBigUInt64LE(1000n, 8);
  b.writeBigUInt64LE(1000n, 16);
  return b;
}
function transfer(
  programId: string,
  source: string,
  destination: string,
  amount: string,
  mint?: string,
  decimals = 9,
) {
  return {
    programId,
    stackHeight: 3,
    parsed: {
      type: mint ? "transferChecked" : "transfer",
      info: {
        source,
        destination,
        authority: source === POOL ? POOL : OWNER,
        ...(mint
          ? {
              mint,
              tokenAmount: {
                amount,
                decimals,
                uiAmount: null,
                uiAmountString: "0",
              },
            }
          : { amount }),
      },
    },
  };
}
function fixture(input = INPUT, output = OUTPUT) {
  const inputProgram = TOKEN,
    outputProgram = output === WSOL ? TOKEN : TOKEN22;
  const source = ata(input, inputProgram),
    destination = ata(output, outputProgram),
    data = routeData();
  const swapKeys = [OWNER, source, destination, POOL];
  const expected = {
    provider: "direct" as const,
    pool: POOL,
    venue: "PumpSwap",
    inputAccount: source,
    outputAccount: destination,
    owner: OWNER,
    inputMint: input,
    outputMint: output,
    inputTokenProgram: inputProgram,
    outputTokenProgram: outputProgram,
    inputAmount: "1000",
    minimumOutput: "990",
    swapInstructions: [
      {
        programId: VENUE,
        data: data.toString("base64"),
        keys: swapKeys.map((pubkey, i) => ({
          pubkey,
          isSigner: i === 0,
          isWritable: true,
        })),
      },
    ],
  };
  const row = (
    accountIndex: number,
    mint: string,
    programId: string,
    amount: string,
    decimals: number,
  ) => ({
    accountIndex,
    mint,
    programId,
    owner: OWNER,
    uiTokenAmount: { amount, decimals, uiAmount: null, uiAmountString: "0" },
  });
  const tx = {
    slot: 123,
    blockTime: 1_790_000_000,
    transaction: {
      message: {
        accountKeys: [OWNER, source, destination, POOL].map((pubkey, i) => ({
          pubkey,
          signer: i === 0,
          writable: true,
          source: "transaction",
        })),
        instructions: [
          {
            programId: VENUE,
            accounts: swapKeys,
            data: bs58.encode(data),
            stackHeight: 1,
          },
        ],
      },
    },
    meta: {
      err: null,
      fee: 5000,
      preBalances: [100000000, 2039280, 2039280, 100000000],
      postBalances: [99995000, 2039280, 2039280, 100000000],
      preTokenBalances: [
        row(1, input, inputProgram, "10000", input === WSOL ? 9 : 6),
        row(2, output, outputProgram, "5000", 9),
      ],
      postTokenBalances: [
        row(1, input, inputProgram, "9500", input === WSOL ? 9 : 6),
        row(2, output, outputProgram, "5990", 9),
      ],
      innerInstructions: [
        {
          index: 0,
          instructions: [
            {
              programId: VENUE,
              accounts: [source, destination],
              data: "",
              stackHeight: 2,
            },
            transfer(
              inputProgram,
              source,
              POOL,
              "500",
              input,
              input === WSOL ? 9 : 6,
            ),
            transfer(outputProgram, POOL, destination, "990", output),
          ],
        },
      ],
    },
  };
  return { tx, expected, source, destination, row };
}

describe("normalizeDirectFill", () => {
  it("normalizes the unmodified local DAMM v2 receipt with classic ATA immutable-owner setup", () => {
    const fill = normalizeDirectFill(
      dammV2Buy.receipt,
      dammV2Buy.expectation as DirectSwapExpectation,
    );
    expect(fill).toEqual({
      inputAmount: 100000n,
      outputAmount: 277115n,
      inputDecimals: 6,
      outputDecimals: 6,
      slot: dammV2Buy.receipt.slot,
      blockTime: dammV2Buy.receipt.blockTime,
    });
    expect(fill.outputAmount).toBeGreaterThanOrEqual(
      BigInt(dammV2Buy.expectation.minimumOutput),
    );
  });

  it("uses net token deltas and preserves prior balances", () => {
    const f = fixture();
    expect(normalizeDirectFill(f.tx, f.expected)).toMatchObject({
      inputAmount: 500n,
      outputAmount: 990n,
      inputDecimals: 6,
      outputDecimals: 9,
      slot: 123,
    });
    f.tx.meta.innerInstructions[0]!.instructions[2]!.parsed!.info.tokenAmount!.amount =
      "1000";
    expect(normalizeDirectFill(f.tx, f.expected).outputAmount).toBe(990n);
  });
  it.each(["input", "output"])("scopes WSOL %s to swap transfers", (side) => {
    const f = side === "input" ? fixture(WSOL, OUTPUT) : fixture(INPUT, WSOL);
    expect(normalizeDirectFill(f.tx, f.expected)).toMatchObject({
      inputAmount: 500n,
      outputAmount: 990n,
    });
  });
  it("accepts immutable-owner initialization only for a proven newly created endpoint", () => {
    const f = fixture();
    f.tx.meta.preTokenBalances.splice(1, 1);
    f.tx.meta.postTokenBalances[1]!.uiTokenAmount.amount = "990";
    const create = {
      programId: ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
      parsed: {
        type: "createIdempotent",
        info: {
          account: f.destination,
          wallet: OWNER,
          source: OWNER,
          mint: OUTPUT,
          tokenProgram: TOKEN22,
        },
      },
    };
    const immutable = {
      programId: TOKEN22,
      parsed: {
        type: "initializeImmutableOwner",
        info: { account: f.destination },
      },
    };
    f.tx.transaction.message.instructions.unshift(create as any);
    f.tx.meta.innerInstructions[0]!.index = 1;
    f.tx.meta.innerInstructions.unshift({
      index: 0,
      instructions: [immutable as any],
    });
    expect(normalizeDirectFill(f.tx, f.expected).outputAmount).toBe(990n);
    immutable.programId = TOKEN;
    expect(() => normalizeDirectFill(f.tx, f.expected)).toThrow(
      /endpoint mutation/,
    );
    immutable.programId = TOKEN22;
    f.tx.meta.preTokenBalances.push(f.row(2, OUTPUT, TOKEN22, "0", 9));
    expect(() => normalizeDirectFill(f.tx, f.expected)).toThrow(
      /endpoint mutation/,
    );
  });
  const mutations: [string, (f: ReturnType<typeof fixture>) => void][] = [
    [
      "failed",
      (f) => {
        f.tx.meta.err = {} as any;
      },
    ],
    [
      "unsafe slot",
      (f) => {
        f.tx.slot = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      "wrong signer",
      (f) => {
        f.tx.transaction.message.accountKeys[0]!.signer = false;
      },
    ],
    [
      "changed bytes",
      (f) => {
        f.tx.transaction.message.instructions[0]!.data = "11";
      },
    ],
    [
      "changed accounts",
      (f) => {
        f.tx.transaction.message.instructions[0]!.accounts = [
          POOL,
          f.source,
          f.destination,
          OWNER,
        ];
      },
    ],
    [
      "missing writable",
      (f) => {
        f.tx.transaction.message.accountKeys[1]!.writable = false;
      },
    ],
    [
      "duplicate swap",
      (f) => {
        f.tx.transaction.message.instructions.push(
          structuredClone(f.tx.transaction.message.instructions[0]!),
        );
      },
    ],
    [
      "wrong pool",
      (f) => {
        f.expected.pool = key(9);
      },
    ],
    [
      "wrong endpoint",
      (f) => {
        f.expected.inputAccount = key(9);
      },
    ],
    [
      "wrong row owner",
      (f) => {
        f.tx.meta.postTokenBalances[0]!.owner = key(9);
      },
    ],
    [
      "wrong row program",
      (f) => {
        f.tx.meta.postTokenBalances[0]!.programId = TOKEN22;
      },
    ],
    [
      "duplicate balance",
      (f) => {
        f.tx.meta.postTokenBalances.push(
          structuredClone(f.tx.meta.postTokenBalances[0]!),
        );
      },
    ],
    [
      "missing balance",
      (f) => {
        f.tx.meta.postTokenBalances = [];
      },
    ],
    [
      "insufficient output",
      (f) => {
        f.expected.minimumOutput = "991";
      },
    ],
    [
      "over budget",
      (f) => {
        f.expected.inputAmount = "499";
      },
    ],
    [
      "decimals changed",
      (f) => {
        f.tx.meta.postTokenBalances[0]!.uiTokenAmount.decimals = 7;
      },
    ],
    [
      "foreign debit authority",
      (f) => {
        f.tx.meta.innerInstructions[0]!.instructions[1]!.parsed!.info.authority =
          key(9);
      },
    ],
    [
      "no transfer evidence",
      (f) => {
        f.tx.meta.innerInstructions[0]!.instructions = [];
      },
    ],
    [
      "external endpoint transfer",
      (f) => {
        f.tx.transaction.message.instructions.push(
          transfer(TOKEN, f.source, POOL, "1", INPUT, 6) as any,
        );
      },
    ],
  ];
  it.each(mutations)("rejects %s", (_name, mutate) => {
    const f = fixture();
    mutate(f);
    expect(() => normalizeDirectFill(f.tx, f.expected)).toThrow();
  });
  function nativeFixture(sell: boolean) {
    const f = fixture(sell ? INPUT : WSOL, sell ? WSOL : OUTPUT);
    const endpoint = sell ? f.destination : f.source;
    const ix = f.tx.transaction.message.instructions[0]!;
    ix.programId = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
    ix.accounts = ix.accounts.filter((x) => x !== endpoint);
    f.tx.transaction.message.accountKeys =
      f.tx.transaction.message.accountKeys.filter((k) => k.pubkey !== endpoint);
    for (const rows of [
      f.tx.meta.preTokenBalances,
      f.tx.meta.postTokenBalances,
    ]) {
      const remove = rows.findIndex((r) => r.mint === WSOL);
      rows.splice(remove, 1);
      rows[0]!.accountIndex = 1;
    }
    f.tx.meta.preBalances = [100000000, 2039280, 100000000];
    f.tx.meta.postBalances = [
      100000000 - 5000 + (sell ? 990 : -500),
      2039280,
      100000000,
    ];
    f.tx.meta.innerInstructions[0]!.instructions =
      f.tx.meta.innerInstructions[0]!.instructions.filter(
        (ix) => ix.parsed && ix.parsed.info.mint !== WSOL,
      );
    if (sell) f.expected.outputAccount = OWNER;
    else f.expected.inputAccount = OWNER;
    f.expected.venue = "Pump.fun";
    f.expected.swapInstructions = [
      {
        programId: ix.programId,
        data: bs58.decode(ix.data).toString(),
        keys: ix.accounts.map((pubkey) => ({
          pubkey,
          isSigner: pubkey === OWNER,
          isWritable: true,
        })),
      },
    ];
    f.expected.swapInstructions[0]!.data = Buffer.from(
      bs58.decode(ix.data),
    ).toString("base64");
    return f;
  }
  it.each([true, false])(
    "normalizes native Pump sell=%s and excludes fee, tip and proven rent",
    (sell) => {
      const f = nativeFixture(sell);
      const outside = {
        programId: "11111111111111111111111111111111",
        parsed: {
          type: "transfer",
          info: { source: OWNER, destination: POOL, lamports: 50 },
        },
      };
      f.tx.transaction.message.instructions.push(outside as any);
      const rent = {
        programId: "11111111111111111111111111111111",
        parsed: {
          type: "createAccount",
          info: { source: OWNER, newAccount: POOL, lamports: 100 },
        },
      };
      f.tx.meta.innerInstructions[0]!.instructions.push(rent as any);
      f.tx.meta.postBalances[0]! -= 150;
      expect(normalizeDirectFill(f.tx, f.expected)).toMatchObject({
        inputAmount: 500n,
        outputAmount: 990n,
      });
      f.tx.transaction.message.instructions.push({
        programId: VENUE,
        accounts: [OWNER],
        data: "1",
      } as any);
      expect(() => normalizeDirectFill(f.tx, f.expected)).toThrow(
        /opaque native/,
      );
    },
  );
});
