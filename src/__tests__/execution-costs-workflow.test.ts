import { Buffer } from "buffer";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import {
  Keypair,
  PublicKey,
  SystemInstruction,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
} from "@solana/spl-token";
import {
  buildSwapTransaction,
  compileV1Transaction,
  normalizeExecutionCosts,
  prepareTransactionVariants,
  type ExecutionCostExpectation,
} from "../browser";
import { normalizeDirectFill } from "../direct";
import { SwqosType } from "../enums";
import { decompileV1Transaction } from "../common/transaction-v1";
import dammBuy from "../direct/__tests__/fixtures/damm-v2-surfpool-buy.json";

const owner = Keypair.fromSeed(new Uint8Array(32).fill(31));
const recipient = Keypair.fromSeed(new Uint8Array(32).fill(32)).publicKey;
const rentAccount = Keypair.fromSeed(new Uint8Array(32).fill(33));
const sponsor = Keypair.fromSeed(new Uint8Array(32).fill(34));
const hash = Keypair.fromSeed(new Uint8Array(32).fill(35)).publicKey.toBase58();
const tip = { account: recipient.toBase58(), lamports: "10000" };

function parsedInstruction(ix: TransactionInstruction) {
  if (
    ix.programId.equals(SystemProgram.programId) &&
    SystemInstruction.decodeInstructionType(ix) === "Transfer"
  ) {
    const transfer = SystemInstruction.decodeTransfer(ix);
    return {
      programId: ix.programId.toBase58(),
      parsed: {
        type: "transfer",
        info: {
          source: transfer.fromPubkey.toBase58(),
          destination: transfer.toPubkey.toBase58(),
          lamports: Number(transfer.lamports),
        },
      },
    };
  }
  return {
    programId: ix.programId.toBase58(),
    accounts: ix.keys.map((key) => key.pubkey.toBase58()),
    data: bs58.encode(ix.data),
  };
}

function submittedReceipt(version: 0 | 1, parsed: boolean) {
  const base = buildSwapTransaction({
    version,
    payer: owner.publicKey,
    recentBlockhash: hash,
    instructions: [
      createAssociatedTokenAccountIdempotentInstruction(
        owner.publicKey,
        getAssociatedTokenAddressSync(NATIVE_MINT, owner.publicKey),
        owner.publicKey,
        NATIVE_MINT,
      ),
    ],
    computeUnitLimit: 200000,
    priorityFeeLamports: version === 1 ? 100000n : undefined,
    computeUnitPriceMicroLamports: 500000n,
    durableNonce: {
      nonceAccount: rentAccount.publicKey,
      authority: owner.publicKey,
      nonceHash: hash,
    },
  });
  const [, variant] = prepareTransactionVariants(
    base,
    [],
    [
      { id: "rpc", name: "RPC", url: "http://localhost:1", tipLamports: 0 },
      {
        id: "jito",
        name: "Jito",
        type: SwqosType.Jito,
        url: "http://localhost:1",
        tipAccount: tip.account,
        tipLamports: Number(tip.lamports),
      },
    ],
  );
  const transaction = variant!.transaction;
  transaction.sign([owner]);
  const signature = bs58.encode(transaction.signatures[0]!);
  const message = transaction.message;
  const instructions =
    transaction.version === 1
      ? decompileV1Transaction(transaction).instructions
      : TransactionMessage.decompile(transaction.message).instructions;
  const keys = message.staticAccountKeys;
  const receipt: any = {
    version,
    slot: 12345,
    blockTime: 1790000000,
    transaction: {
      signatures: [signature],
      message: parsed
        ? {
            accountKeys: keys.map((key, index) => ({
              pubkey: key.toBase58(),
              signer: message.isAccountSigner(index),
              writable: message.isAccountWritable(index),
              source: "transaction",
            })),
            instructions: instructions.map(parsedInstruction),
          }
        : {
            header: message.header,
            accountKeys: keys.map((key) => key.toBase58()),
            instructions: message.compiledInstructions.map((instruction) => ({
              programIdIndex: instruction.programIdIndex,
              accounts: instruction.accountKeyIndexes,
              data: bs58.encode(instruction.data),
            })),
          },
    },
    meta: {
      err: null,
      fee: 105000,
      preBalances: keys.map(() => 10000000),
      postBalances: keys.map((_key, index) =>
        index ? 10000000 : 10000000 - 105000 - 10000 - 2039280,
      ),
    },
  };
  const expected: ExecutionCostExpectation = {
    signature,
    owner: owner.publicKey.toBase58(),
    tip,
  };
  return {
    receipt,
    expected,
    signedBase64: Buffer.from(transaction.serialize()).toString("base64"),
  };
}

describe("submitted transaction expense accounting", () => {
  it.each([0, 1] as const)(
    "accounts the exact signed v%s base64 RPC bytes without another receipt lookup",
    (version) => {
      const { receipt, expected, signedBase64 } = submittedReceipt(
        version,
        false,
      );
      const jsonCosts = normalizeExecutionCosts(receipt, expected);
      receipt.transaction = [signedBase64, "base64"];
      expect(normalizeExecutionCosts(receipt, expected)).toEqual(jsonCosts);
      receipt.transaction[0] += "!";
      expect(() => normalizeExecutionCosts(receipt, expected)).toThrow(
        /Invalid execution costs/,
      );
    },
  );

  it("accounts a signed native-v1 migration-shaped bundle member with its shared tip", () => {
    const transaction = compileV1Transaction({
      payer: owner.publicKey,
      recentBlockhash: hash,
      config: { priorityFeeLamports: 100000n, computeUnitLimit: 350000 },
      instructions: [
        new TransactionInstruction({
          programId: new PublicKey(
            "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
          ),
          keys: [{ pubkey: owner.publicKey, isSigner: true, isWritable: true }],
          data: Buffer.from([155, 234, 231, 146, 236, 158, 162, 30]),
        }),
        SystemProgram.transfer({
          fromPubkey: owner.publicKey,
          toPubkey: recipient,
          lamports: 10000,
        }),
      ],
    });
    transaction.sign([owner]);
    const { receipt, expected } = submittedReceipt(1, true);
    expected.signature = bs58.encode(transaction.signatures[0]!);
    receipt.transaction = [
      Buffer.from(transaction.serialize()).toString("base64"),
      "base64",
    ];
    expect(normalizeExecutionCosts(receipt, expected)).toMatchObject({
      networkFeeLamports: 105000n,
      tipLamports: 10000n,
      succeeded: true,
    });
    receipt.meta.err = { InstructionError: [0, "InvalidArgument"] };
    expect(normalizeExecutionCosts(receipt, expected)).toMatchObject({
      networkFeeLamports: 105000n,
      tipLamports: 0n,
      succeeded: false,
    });
    expected.signature = bs58.encode(new Uint8Array(64).fill(1));
    expect(() => normalizeExecutionCosts(receipt, expected)).toThrow(
      /signature mismatch/,
    );
  });

  it.each([
    [0, true],
    [0, false],
    [1, true],
    [1, false],
  ] as const)(
    "accounts sender-prepared v%s parsed=%s once without adding rent or priority twice",
    (version, parsed) => {
      const { receipt, expected } = submittedReceipt(version, parsed);
      expect(normalizeExecutionCosts(receipt, expected)).toEqual({
        networkFeeLamports: 105000n,
        tipLamports: 10000n,
        tipComplete: true,
        slot: receipt.slot,
        blockTime: receipt.blockTime,
        succeeded: true,
      });
    },
  );

  it("preserves the executed swap amounts alongside costs from a landed native-v1 venue workflow", () => {
    const expected = {
      signature: dammBuy.receipt.transaction.signatures[0]!,
      owner: dammBuy.expectation.owner,
      tip: null,
    };
    expect(normalizeExecutionCosts(dammBuy.receipt, expected)).toMatchObject({
      networkFeeLamports: 5000n,
      tipLamports: 0n,
      tipComplete: true,
    });
    expect(
      normalizeDirectFill(dammBuy.receipt, dammBuy.expectation as any),
    ).toMatchObject({ inputAmount: 100000n, outputAmount: 277115n });
  });

  it("counts charged failure fees but never the rolled-back intended tip or rent", () => {
    const { receipt, expected } = submittedReceipt(1, true);
    receipt.meta.err = { InstructionError: [1, "InsufficientFunds"] };
    expect(normalizeExecutionCosts(receipt, expected)).toMatchObject({
      networkFeeLamports: 105000n,
      tipLamports: 0n,
      tipComplete: true,
      succeeded: false,
    });
    delete expected.tip;
    expect(normalizeExecutionCosts(receipt, expected).tipComplete).toBe(true);
  });

  it("keeps unknown legacy tips distinguishable from explicit zero-tip submissions", () => {
    const { receipt, expected } = submittedReceipt(1, true);
    delete expected.tip;
    expect(normalizeExecutionCosts(receipt, expected)).toMatchObject({
      networkFeeLamports: 105000n,
      tipLamports: 0n,
      tipComplete: false,
    });
    expected.tip = null;
    expect(normalizeExecutionCosts(receipt, expected).tipComplete).toBe(true);
  });

  it("charges a sponsored transaction's tip to its owner without charging the sponsor's fee", () => {
    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: sponsor.publicKey,
        recentBlockhash: hash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: owner.publicKey,
            toPubkey: recipient,
            lamports: BigInt(tip.lamports),
          }),
        ],
      }).compileToV0Message(),
    );
    tx.sign([sponsor, owner]);
    const { receipt } = submittedReceipt(0, true);
    receipt.transaction.signatures = tx.signatures.map((value) =>
      bs58.encode(value),
    );
    receipt.transaction.message.accountKeys = tx.message.staticAccountKeys.map(
      (key, index) => ({
        pubkey: key.toBase58(),
        signer: tx.message.isAccountSigner(index),
        writable: tx.message.isAccountWritable(index),
      }),
    );
    receipt.transaction.message.instructions = TransactionMessage.decompile(
      tx.message,
    ).instructions.map(parsedInstruction);
    expect(
      normalizeExecutionCosts(receipt, {
        signature: receipt.transaction.signatures[0],
        owner: owner.publicKey.toBase58(),
        tip,
      }),
    ).toMatchObject({ networkFeeLamports: 0n, tipLamports: 10000n });
  });

  it.each([
    [
      "wrong signature",
      (r: any, e: ExecutionCostExpectation) => {
        e.signature = bs58.encode(new Uint8Array(64).fill(1));
      },
    ],
    [
      "missing metadata",
      (r: any) => {
        r.meta = null;
      },
    ],
    [
      "missing status",
      (r: any) => {
        delete r.meta.err;
      },
    ],
    [
      "unsafe fee",
      (r: any) => {
        r.meta.fee = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      "non-signer owner",
      (r: any) => {
        r.transaction.message.accountKeys[0].signer = false;
      },
    ],
    [
      "missing owner",
      (_r: any, e: ExecutionCostExpectation) => {
        e.owner = rentAccount.publicKey.toBase58();
      },
    ],
    [
      "duplicate tip",
      (r: any) => {
        r.transaction.message.instructions.push(
          structuredClone(r.transaction.message.instructions.at(-1)),
        );
      },
    ],
    [
      "wrong tip amount",
      (r: any) => {
        r.transaction.message.instructions.at(-1).parsed.info.lamports++;
      },
    ],
    [
      "wrong tip destination",
      (_r: any, e: ExecutionCostExpectation) => {
        e.tip = { ...tip, account: rentAccount.publicKey.toBase58() };
      },
    ],
    [
      "foreign tip source",
      (r: any) => {
        r.transaction.message.instructions.at(-1).parsed.info.source =
          recipient.toBase58();
      },
    ],
    [
      "inner-only tip",
      (r: any) => {
        r.meta.innerInstructions = [
          {
            index: 0,
            instructions: [r.transaction.message.instructions.pop()],
          },
        ];
      },
    ],
    [
      "non-system tip",
      (r: any) => {
        r.transaction.message.instructions.at(-1).programId =
          recipient.toBase58();
      },
    ],
  ] as const)(
    "rejects %s evidence instead of silently treating it as complete",
    (_name, mutate) => {
      const { receipt, expected } = submittedReceipt(1, true);
      mutate(receipt, expected);
      expect(() => normalizeExecutionCosts(receipt, expected)).toThrow(
        /Invalid execution costs/,
      );
    },
  );

  it("resolves a raw RPC address-table tip recipient without misidentifying the fee payer", () => {
    const { receipt, expected } = submittedReceipt(0, false);
    const keys = receipt.transaction.message.accountKeys as string[];
    const index = keys.indexOf(recipient.toBase58());
    keys.splice(index, 1);
    keys.push(recipient.toBase58());
    const instruction = SystemProgram.transfer({
      fromPubkey: owner.publicKey,
      toPubkey: recipient,
      lamports: 10000,
    });
    receipt.transaction.message.instructions = [
      {
        programIdIndex: keys.indexOf(SystemProgram.programId.toBase58()),
        accounts: [keys.indexOf(owner.publicKey.toBase58()), keys.length - 1],
        data: bs58.encode(instruction.data),
      },
    ];
    keys.pop();
    receipt.meta.loadedAddresses = {
      writable: [recipient.toBase58()],
      readonly: [],
    };
    expect(normalizeExecutionCosts(receipt, expected).tipLamports).toBe(10000n);
  });
});
