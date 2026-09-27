import { it, expect } from "vitest";
import {
  PublicKey,
  SystemProgram,
  AddressLookupTableAccount,
} from "@solana/web3.js";
import {
  MintLayout,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
} from "@solana/spl-token";
import live from "./fixtures/sol-usdc-build.json";
import * as router from "../index";
function sellFixture(amount: bigint, output: bigint, quoteMint?: PublicKey) {
  const b = structuredClone(live);
  const a = b.swapInstruction.accounts;
  const pairs = [
    [a[1]!.pubkey, a[2]!.pubkey],
    [a[3]!.pubkey, a[4]!.pubkey],
  ];
  for (const ix of [b.swapInstruction, ...b.setupInstructions])
    for (const account of ix.accounts) {
      for (const [left, right] of pairs) {
        if (account.pubkey === left) {
          account.pubkey = right!;
          break;
        }
        if (account.pubkey === right) {
          account.pubkey = left!;
          break;
        }
      }
    }
  [b.inputMint, b.outputMint] = [b.outputMint, b.inputMint];
  b.inAmount = amount.toString();
  b.outAmount = output.toString();
  b.otherAmountThreshold = ((output * 9900n + 9999n) / 10000n).toString();
  const d = Buffer.from(b.swapInstruction.data, "base64");
  d.writeBigUInt64LE(amount, 8);
  d.writeBigUInt64LE(output, 16);
  b.swapInstruction.data = d.toString("base64");
  b.routePlan[0]!.swapInfo = {
    ...b.routePlan[0]!.swapInfo,
    inputMint: b.inputMint,
    outputMint: b.outputMint,
    inAmount: b.inAmount,
    outAmount: b.outAmount,
  };
  b.setupInstructions = b.setupInstructions.filter((i) =>
    i.programId.startsWith("AToken"),
  );
  b.cleanupInstruction = null;
  if (quoteMint) {
    const oldAta = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      SystemProgram.programId,
      true,
    ).toBase58();
    const newAta = getAssociatedTokenAddressSync(
      quoteMint,
      SystemProgram.programId,
      true,
    ).toBase58();
    return JSON.parse(JSON.stringify(b), (_, value) =>
      value === NATIVE_MINT.toBase58()
        ? quoteMint.toBase58()
        : value === oldAta
          ? newAta
          : value,
    );
  }
  return b;
}
function options(
  quote: (x: bigint) => bigint = (x) => x * 2n,
  quoteMint?: PublicKey,
) {
  const amounts: bigint[] = [];
  const sample = sellFixture(1000n, 2000n, quoteMint);
  const owner = SystemProgram.programId;
  const connection: any = {
    getAccountInfo: async () => {
      const data = Buffer.alloc(82);
      MintLayout.encode(
        {
          mintAuthorityOption: 0,
          mintAuthority: owner,
          supply: 999999n,
          decimals: 6,
          isInitialized: true,
          freezeAuthorityOption: 0,
          freezeAuthority: owner,
        },
        data,
      );
      return {
        owner: TOKEN_PROGRAM_ID,
        data,
        lamports: 1,
        executable: false,
        rentEpoch: 0,
      };
    },
    getAddressLookupTable: async (key: PublicKey) => ({
      value: new AddressLookupTableAccount({
        key,
        state: {
          deactivationSlot: 18446744073709551615n,
          lastExtendedSlot: 0,
          lastExtendedSlotStartIndex: 0,
          addresses: (sample.addressesByLookupTableAddress as any)[
            key.toBase58()
          ].map((x: string) => new PublicKey(x)),
        },
      }),
    }),
  };
  return {
    amounts,
    args: {
      connection,
      owner,
      inputMint: new PublicKey(sample.inputMint),
      outputMint: new PublicKey(sample.outputMint),
      slippageBps: 100,
      maximumInputAmount: 1000n,
      targetLamports: 123n,
      unwrapNativeOutput: !quoteMint,
      now: () => 1000,
      transport: (async (url: string) => {
        const a = BigInt(new URL(url).searchParams.get("amount")!);
        amounts.push(a);
        return new Response(
          JSON.stringify(sellFixture(a, quote(a), quoteMint)),
        );
      }) as typeof fetch,
    },
  };
}
it("sizes a funded token sale in arbitrary quote-token units with no conversion", async () => {
  const quote = new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
  const { args, amounts } = options(undefined, quote);
  const trade = await router.prepareJupiterSellForQuoteValue({
    ...args,
    targetAmount: 123n,
    directPairOnly: true,
  });
  expect(trade.amountIn).toBe(61n);
  expect(trade.quotedAmountOut).toBe(122n);
  expect(trade.outputMint.equals(quote)).toBe(true);
  expect(trade.directPairOnly).toBe(true);
  expect(trade.wrapNativeInput || trade.unwrapNativeOutput).toBe(false);
  expect(amounts.every((n) => n <= args.maximumInputAmount)).toBe(true);
  expect(trade.instructions.at(-1)!.programId.toBase58()).toBe(
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  );
  await expect(router.prepareJupiterSellForSolValue(args)).rejects.toThrow(
    /must be SOL/,
  );
});
it("sizes an exact-in sell under the requested SOL value and holding limit", async () => {
  const { args, amounts } = options();
  const t = await router.prepareJupiterSellForSolValue(args);
  expect(t.amountIn).toBe(61n);
  expect(t.quotedAmountOut).toBe(122n);
  expect(amounts.every((n) => n <= 1000n)).toBe(true);
  expect(amounts.length).toBeLessThanOrEqual(8);
  const close = t.instructions.at(-1)!;
  expect(close.data[0]).toBe(9);
  expect(close.keys[1]!.pubkey.equals(args.owner)).toBe(true);
});
it("rejects a target beyond available holdings without inflating the amount", async () => {
  const { args, amounts } = options();
  await expect(
    router.prepareJupiterSellForSolValue({ ...args, targetLamports: 5000n }),
  ).rejects.toThrow(/holdings|target/i);
  expect(amounts).toEqual([1000n]);
});
it("refines a nonlinear quote with bounded requests", async () => {
  const { args, amounts } = options((x) => (x * 10000n) / (1000n + x));
  const t = await router.prepareJupiterSellForSolValue({
    ...args,
    targetLamports: 3000n,
  });
  expect(t.quotedAmountOut).toBeGreaterThanOrEqual(2997n);
  expect(t.quotedAmountOut).toBeLessThanOrEqual(3000n);
  expect(amounts.length).toBeLessThanOrEqual(8);
});
it("fails closed when token granularity cannot meet the SOL target", async () => {
  const { args, amounts } = options((x) => x * 1000n);
  await expect(
    router.prepareJupiterSellForSolValue({ ...args, targetLamports: 1500n }),
  ).rejects.toThrow(/converge|granularity/i);
  expect(amounts.length).toBeLessThanOrEqual(8);
});
