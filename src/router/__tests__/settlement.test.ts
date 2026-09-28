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
import { normalizeJupiterFill } from "../settlement";

import maskBuyReceipt from "./fixtures/mask-route-buy-receipt.json";
import maskBuyExpectation from "./fixtures/mask-route-buy-expectation.json";
import maskSellReceipt from "./fixtures/mask-route-sell-receipt.json";
import maskSellExpectation from "./fixtures/mask-route-sell-expectation.json";

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
  const expected = {
    owner: OWNER,
    inputMint: input,
    outputMint: output,
    inputTokenProgram: inputProgram,
    outputTokenProgram: outputProgram,
    amountIn: "1000",
    minimumAmountOut: "990",
    swapInstructionData: data.toString("base64"),
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
            programId: JUP,
            accounts: [
              OWNER,
              source,
              destination,
              input,
              output,
              inputProgram,
              outputProgram,
              JUP,
              EVENT,
              JUP,
            ],
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

describe("normalizeJupiterFill", () => {
  it("retains direct-pair policy during funded SPL settlement", () => {
    const { tx, expected } = fixture();
    expect(
      normalizeJupiterFill(tx, { ...expected, directPairOnly: true })
        .outputAmount,
    ).toBe(990n);
    expect(() =>
      normalizeJupiterFill(structuredClone(maskBuyReceipt), {
        ...maskBuyExpectation,
        directPairOnly: true,
      }),
    ).toThrow(/direct pair/);
  });
  // Actual local Surfpool 1.6.0 v1 execution receipts (2026-09-27), with fresh
  // disposable wallet public keys. No decimal or other RPC metadata repairs.
  it("normalizes the actual split MASK buy receipt to net Token2022 output", () => {
    const receipt = structuredClone(maskBuyReceipt);
    expect(normalizeJupiterFill(receipt, maskBuyExpectation)).toEqual({
      inputAmount: 100000000n,
      outputAmount: 429073872526n,
      inputDecimals: 9,
      outputDecimals: 6,
      slot: maskBuyReceipt.slot,
      blockTime: maskBuyReceipt.blockTime,
    });
    expect(receipt).toEqual(maskBuyReceipt);
  });
  it("normalizes the actual reverse MASK receipt without counting existing unwrapped WSOL", () => {
    const receipt = structuredClone(maskSellReceipt);
    expect(normalizeJupiterFill(receipt, maskSellExpectation)).toEqual({
      inputAmount: 214536936263n,
      outputAmount: 39969407n,
      inputDecimals: 6,
      outputDecimals: 9,
      slot: maskSellReceipt.slot,
      blockTime: maskSellReceipt.blockTime,
    });
    expect(receipt).toEqual(maskSellReceipt);
  });

  it("uses net token balance deltas, existing holdings and partial actual input", () => {
    const { tx, expected } = fixture();
    tx.meta.innerInstructions[0]!.instructions[2] = transfer(
      TOKEN22,
      POOL,
      ata(OUTPUT, TOKEN22),
      "1000",
      OUTPUT,
    );
    expect(normalizeJupiterFill(tx, expected)).toEqual({
      inputAmount: 500n,
      outputAmount: 990n,
      inputDecimals: 6,
      outputDecimals: 9,
      slot: 123,
      blockTime: 1_790_000_000,
    });
  });
  it("preserves raw integers above JS safe integer range", () => {
    const { tx, expected } = fixture();
    tx.meta.preTokenBalances[1]!.uiTokenAmount.amount = "9007199254740993000";
    tx.meta.postTokenBalances[1]!.uiTokenAmount.amount = "9007199254740993990";
    expect(normalizeJupiterFill(tx, expected).outputAmount).toBe(990n);
  });
  it.each(["input", "output"])(
    "uses only nested Jupiter transfers for WSOL %s, excluding wrapping, rent and fees",
    (side) => {
      const { tx, expected, source, destination } = fixture(
        side === "input" ? WSOL : INPUT,
        side === "output" ? WSOL : OUTPUT,
      );
      const endpoint = side === "input" ? source : destination;
      // Account is closed after swapping, so post token balances cannot measure this endpoint.
      tx.meta.postTokenBalances = tx.meta.postTokenBalances.filter(
        (r) => r.mint !== WSOL,
      );
      tx.transaction.message.instructions.push({
        programId: TOKEN,
        parsed: {
          type: "closeAccount",
          info: { account: endpoint, owner: OWNER, destination: OWNER },
        },
      } as any);
      tx.transaction.message.instructions.push(
        transfer(TOKEN, POOL, endpoint, "100000", WSOL) as any,
      );
      tx.meta.innerInstructions[0]!.instructions.push(
        transfer(
          TOKEN,
          side === "input" ? POOL : endpoint,
          side === "input" ? endpoint : POOL,
          "10",
          WSOL,
        ),
      );
      if (side === "output")
        tx.meta.innerInstructions[0]!.instructions[2] = transfer(
          TOKEN,
          POOL,
          endpoint,
          "1000",
          WSOL,
        );
      const fill = normalizeJupiterFill(tx, expected);
      expect(fill.inputAmount).toBe(side === "input" ? 490n : 500n);
      expect(fill.outputAmount).toBe(990n);
    },
  );
  it("accepts a newly created exact output ATA only with matching initialization evidence", () => {
    const { tx, expected, destination } = fixture();
    tx.meta.preTokenBalances.pop();
    tx.meta.postTokenBalances[1]!.uiTokenAmount.amount = "990";
    tx.transaction.message.instructions.push({
      programId: ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
      parsed: {
        type: "createIdempotent",
        info: {
          account: destination,
          wallet: OWNER,
          mint: OUTPUT,
          tokenProgram: TOKEN22,
        },
      },
    } as any);
    expect(normalizeJupiterFill(tx, expected).outputAmount).toBe(990n);
  });
  it.each([
    [
      "failed transaction",
      (f: ReturnType<typeof fixture>) => {
        f.tx.meta.err = { InstructionError: [0, "Custom"] } as any;
      },
    ],
    [
      "missing err",
      (f: ReturnType<typeof fixture>) => {
        delete (f.tx.meta as any).err;
      },
    ],
    [
      "invalid slot",
      (f: ReturnType<typeof fixture>) => {
        f.tx.slot = 0;
      },
    ],
    [
      "unsafe slot",
      (f: ReturnType<typeof fixture>) => {
        f.tx.slot = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      "not signer",
      (f: ReturnType<typeof fixture>) => {
        f.tx.transaction.message.accountKeys[0]!.signer = false;
      },
    ],
    [
      "other authority",
      (f: ReturnType<typeof fixture>) => {
        f.tx.transaction.message.instructions[0]!.accounts[0] = key(8);
      },
    ],
    [
      "other endpoint",
      (f: ReturnType<typeof fixture>) => {
        f.tx.transaction.message.instructions[0]!.accounts[2] = key(8);
      },
    ],
    [
      "other mint",
      (f: ReturnType<typeof fixture>) => {
        f.tx.transaction.message.instructions[0]!.accounts[4] = key(8);
      },
    ],
    [
      "other token program",
      (f: ReturnType<typeof fixture>) => {
        f.tx.transaction.message.instructions[0]!.accounts[6] = TOKEN;
      },
    ],
    [
      "second Jupiter instruction",
      (f: ReturnType<typeof fixture>) => {
        f.tx.transaction.message.instructions.push(
          f.tx.transaction.message.instructions[0]!,
        );
      },
    ],
    [
      "route amount mismatch",
      (f: ReturnType<typeof fixture>) => {
        f.expected.amountIn = "999";
      },
    ],
    [
      "route floor mismatch",
      (f: ReturnType<typeof fixture>) => {
        f.expected.minimumAmountOut = "989";
      },
    ],
    [
      "route data mismatch",
      (f: ReturnType<typeof fixture>) => {
        f.expected.swapInstructionData = Buffer.alloc(46).toString("base64");
      },
    ],
    [
      "unknown route",
      (f: ReturnType<typeof fixture>) => {
        const b = routeData();
        b[0] = 1;
        f.tx.transaction.message.instructions[0]!.data = bs58.encode(b);
        delete (f.expected as any).swapInstructionData;
      },
    ],
    [
      "duplicate balance",
      (f: ReturnType<typeof fixture>) => {
        f.tx.meta.postTokenBalances.push(f.tx.meta.postTokenBalances[1]!);
      },
    ],
    [
      "balance wrong owner",
      (f: ReturnType<typeof fixture>) => {
        f.tx.meta.postTokenBalances[1]!.owner = key(8);
      },
    ],
    [
      "balance wrong program",
      (f: ReturnType<typeof fixture>) => {
        f.tx.meta.postTokenBalances[1]!.programId = TOKEN;
      },
    ],
    [
      "balance wrong mint",
      (f: ReturnType<typeof fixture>) => {
        f.tx.meta.postTokenBalances[1]!.mint = INPUT;
      },
    ],
    [
      "unsafe numeric amount",
      (f: ReturnType<typeof fixture>) => {
        (f.tx.meta.postTokenBalances[1]!.uiTokenAmount as any).amount = 990;
      },
    ],
    [
      "inconsistent decimals",
      (f: ReturnType<typeof fixture>) => {
        f.tx.meta.postTokenBalances[1]!.uiTokenAmount.decimals = 6;
      },
    ],
    [
      "missing unexplained pre row",
      (f: ReturnType<typeof fixture>) => {
        f.tx.meta.preTokenBalances.pop();
      },
    ],
    [
      "missing unexplained post row",
      (f: ReturnType<typeof fixture>) => {
        f.tx.meta.postTokenBalances.pop();
      },
    ],
    [
      "below output floor",
      (f: ReturnType<typeof fixture>) => {
        f.tx.meta.postTokenBalances[1]!.uiTokenAmount.amount = "5989";
      },
    ],
    [
      "zero input",
      (f: ReturnType<typeof fixture>) => {
        f.tx.meta.postTokenBalances[0]!.uiTokenAmount.amount = "10000";
      },
    ],
    [
      "input over budget",
      (f: ReturnType<typeof fixture>) => {
        f.tx.meta.postTokenBalances[0]!.uiTokenAmount.amount = "8999";
      },
    ],
    [
      "missing inner receipt",
      (f: ReturnType<typeof fixture>) => {
        f.tx.meta.innerInstructions = [];
      },
    ],
    [
      "unrelated output payment",
      (f: ReturnType<typeof fixture>) => {
        f.tx.transaction.message.instructions.push(
          transfer(TOKEN22, POOL, f.destination, "1000", OUTPUT) as any,
        );
      },
    ],
    [
      "spoofed token program label",
      (f: ReturnType<typeof fixture>) => {
        (f.tx.meta.innerInstructions[0]!.instructions[1] as any).programId =
          VENUE;
      },
    ],
  ])("rejects %s", (_name, mutate) => {
    const f = fixture();
    mutate(f);
    expect(() => normalizeJupiterFill(f.tx, f.expected)).toThrow();
  });
  it("rejects ambiguous or wrong-mint WSOL transfer evidence", () => {
    for (const kind of [
      "unparsed",
      "wrongMint",
      "wrongProgram",
      "wrongAuthority",
    ]) {
      const f = fixture(WSOL);
      const ix = f.tx.meta.innerInstructions[0]!.instructions[1] as any;
      if (kind === "unparsed") {
        ix.accounts = [f.source, POOL];
        delete ix.parsed;
        ix.data = "123";
      }
      if (kind === "wrongMint") ix.parsed.info.mint = INPUT;
      if (kind === "wrongProgram") ix.programId = TOKEN22;
      if (kind === "wrongAuthority") ix.parsed.info.authority = key(8);
      expect(() => normalizeJupiterFill(f.tx, f.expected)).toThrow();
    }
  });
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    "normalizes shared route direct output=%s/input=%s and rejects redirected accounts",
    (directOutput, directInput) => {
      const f = fixture();
      const sharedId = 1;
      const authority = PublicKey.findProgramAddressSync(
        [Buffer.from("authority"), Buffer.of(sharedId)],
        new PublicKey(JUP),
      )[0];
      const sharedInput = getAssociatedTokenAddressSync(
        new PublicKey(INPUT),
        authority,
        true,
        TOKEN_PROGRAM_ID,
      ).toBase58();
      const sharedOutput = getAssociatedTokenAddressSync(
        new PublicKey(OUTPUT),
        authority,
        true,
        TOKEN_2022_PROGRAM_ID,
      ).toBase58();
      const data = Buffer.concat([
        Buffer.from("d19853937cfed8e9", "hex"),
        Buffer.of(sharedId),
        routeData().subarray(8),
      ]);
      f.tx.transaction.message.instructions[0] = {
        programId: JUP,
        accounts: [
          authority.toBase58(),
          OWNER,
          f.source,
          directInput ? f.source : sharedInput,
          directOutput ? f.destination : sharedOutput,
          f.destination,
          INPUT,
          OUTPUT,
          TOKEN,
          TOKEN22,
          EVENT,
          JUP,
        ],
        data: bs58.encode(data),
        stackHeight: 1,
      };
      f.expected.swapInstructionData = data.toString("base64");
      expect(normalizeJupiterFill(f.tx, f.expected).outputAmount).toBe(990n);
      for (const index of [0, 1, 3, 4, 5, 6, 8, 10, 11]) {
        const copy = structuredClone({ tx: f.tx, expected: f.expected });
        copy.tx.transaction.message.instructions[0]!.accounts[index] = key(9);
        expect(() => normalizeJupiterFill(copy.tx, copy.expected)).toThrow();
      }
    },
  );
  it("binds an explicit destination account to the same owner output ATA", () => {
    const f = fixture();
    f.tx.transaction.message.instructions[0]!.accounts[7] = f.destination;
    expect(normalizeJupiterFill(f.tx, f.expected).outputAmount).toBe(990n);
    f.tx.transaction.message.instructions[0]!.accounts[7] = key(9);
    expect(() => normalizeJupiterFill(f.tx, f.expected)).toThrow();
  });
  it("accepts an ephemeral WSOL ATA only with matching initialization and closure", () => {
    const f = fixture(WSOL);
    f.tx.meta.preTokenBalances.shift();
    f.tx.meta.postTokenBalances.shift();
    f.tx.transaction.message.instructions.push({
      programId: TOKEN,
      parsed: {
        type: "initializeAccount3",
        info: { account: f.source, owner: OWNER, mint: WSOL },
      },
    } as any);
    f.tx.transaction.message.instructions.push({
      programId: TOKEN,
      parsed: {
        type: "closeAccount",
        info: { account: f.source, owner: OWNER, destination: OWNER },
      },
    } as any);
    expect(normalizeJupiterFill(f.tx, f.expected).inputAmount).toBe(500n);
    (f.tx.transaction.message.instructions.at(-1) as any).parsed.info.owner =
      key(9);
    expect(() => normalizeJupiterFill(f.tx, f.expected)).toThrow();
  });
  it("accepts a fully spent and closed non-native input account", () => {
    const f = fixture();
    f.tx.meta.preTokenBalances[0]!.uiTokenAmount.amount = "500";
    f.tx.meta.postTokenBalances.shift();
    f.tx.transaction.message.instructions.push({
      programId: TOKEN,
      parsed: {
        type: "closeAccount",
        info: { account: f.source, owner: OWNER, destination: OWNER },
      },
    } as any);
    expect(normalizeJupiterFill(f.tx, f.expected).inputAmount).toBe(500n);
  });
  it("does not attribute mint/burn mutations to a routed transfer fill", () => {
    for (const inside of [true, false]) {
      const f = fixture();
      const mutation = {
        programId: TOKEN22,
        parsed: {
          type: "mintTo",
          info: {
            account: f.destination,
            mint: OUTPUT,
            amount: "990",
            mintAuthority: OWNER,
          },
        },
      };
      (inside
        ? f.tx.meta.innerInstructions[0]!.instructions
        : f.tx.transaction.message.instructions
      ).push(mutation as any);
      expect(() => normalizeJupiterFill(f.tx, f.expected)).toThrow();
    }
  });
  it("rejects native transfer-fee instructions and duplicate inner groups", () => {
    const f = fixture(WSOL);
    (f.tx.meta.innerInstructions[0]!.instructions[1] as any).parsed.type =
      "transferCheckedWithFee";
    expect(() => normalizeJupiterFill(f.tx, f.expected)).toThrow();
    const g = fixture();
    g.tx.meta.innerInstructions.push(g.tx.meta.innerInstructions[0]!);
    expect(() => normalizeJupiterFill(g.tx, g.expected)).toThrow();
  });
  it("rejects identical endpoints and non-classic WSOL identity", () => {
    const f = fixture();
    expect(() =>
      normalizeJupiterFill(f.tx, { ...f.expected, outputMint: INPUT }),
    ).toThrow();
    const native = fixture(WSOL);
    expect(() =>
      normalizeJupiterFill(native.tx, {
        ...native.expected,
        inputTokenProgram: TOKEN22,
      }),
    ).toThrow();
  });
});
