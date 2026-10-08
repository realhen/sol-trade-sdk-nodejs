import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeDirectFill } from "../dist/direct/browser.mjs";

const cases = JSON.parse(
  await readFile(
    "src/direct/__tests__/fixtures/mainnet-pump-funding.json",
    "utf8",
  ),
);
for (const scenario of cases) {
  let held = 0n;
  for (const row of scenario.transactions) {
    const {
      transaction,
      receipt,
      expectedQuote,
      expectedFunding,
      expectedTokens,
    } = row;
    const fill = normalizeDirectFill(transaction, receipt.route);
    const buy = receipt.route.side === "buy";
    assert.equal(
      buy ? fill.inputAmount : fill.outputAmount,
      BigInt(expectedQuote),
    );
    assert.equal(
      buy ? fill.outputAmount : fill.inputAmount,
      BigInt(expectedTokens),
    );
    assert.equal(fill.accountFundingLamports ?? 0n, BigInt(expectedFunding));
    held += (buy ? 1n : -1n) * BigInt(expectedTokens);
    if (BigInt(expectedFunding) > 0n) {
      assert.throws(
        () =>
          normalizeDirectFill(transaction, {
            ...receipt.route,
            inputAmount: (BigInt(expectedQuote) - 1n).toString(),
          }),
        /budget/,
      );
      const generousBudget = normalizeDirectFill(transaction, {
        ...receipt.route,
        inputAmount: (
          BigInt(expectedQuote) +
          BigInt(expectedFunding) +
          1n
        ).toString(),
      });
      assert.equal(generousBudget.inputAmount, BigInt(expectedQuote));
      assert.equal(
        generousBudget.accountFundingLamports,
        BigInt(expectedFunding),
      );
      const unrelatedLogs = structuredClone(transaction);
      unrelatedLogs.meta.logMessages = cases.find(
        (c) => c.mint !== scenario.mint,
      ).transactions[0].transaction.meta.logMessages;
      assert.throws(() => normalizeDirectFill(unrelatedLogs, receipt.route));
      const missingLogs = structuredClone(transaction);
      missingLogs.meta.logMessages = [];
      assert.throws(() => normalizeDirectFill(missingLogs, receipt.route));
      const wrongPool = structuredClone(transaction);
      const transfers = wrongPool.meta.innerInstructions.flatMap(
        (g) => g.instructions,
      );
      transfers.find(
        (ix) => ix.parsed?.info?.lamports === Number(expectedFunding),
      ).parsed.info.destination = receipt.wallet;
      assert.throws(() => normalizeDirectFill(wrongPool, receipt.route));
    }
  }
  assert.equal(held, 0n, "Recorded wallet position closes completely");
}
console.log(
  "Both recorded Pump positions recover with exact swap, funding and token totals",
);
