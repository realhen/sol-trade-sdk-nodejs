/** Execute current public Jupiter builds exclusively on an identified LOCAL Surfpool.
 * Never accepts a user keypair or remote execution URL. Jupiter is read-only quote/build;
 * the local validator's configured datasource supplies cloned mainnet accounts.
 * Build the SDK first. All setup and swap transactions use the app's version-1 compiler.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  unpackAccount,
} from "@solana/spl-token";
import { buildSwapTransaction } from "../dist/browser.mjs";
import {
  prepareJupiterRoute,
  assertRouterTradeFresh,
  normalizeJupiterFill,
  decodeJupiterRouteInstruction,
} from "../dist/router/index.mjs";

const endpoint = process.env.SURFPOOL_RPC_URL ?? "http://127.0.0.1:8999";
const url = new URL(endpoint);
assert.equal(url.protocol, "http:", "Only HTTP loopback Surfpool is permitted");
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
  "Only loopback execution is permitted",
);
assert(
  !url.username && !url.password && !url.search && !url.hash,
  "Local RPC URL must not contain credentials",
);
const localFetch = (input, options) => {
  assert.equal(
    new URL(typeof input === "string" ? input : (input.url ?? input.toString()))
      .origin,
    url.origin,
    "Unexpected RPC destination",
  );
  return fetch(input, { ...options, redirect: "error" });
};
const connection = new Connection(endpoint, {
  commitment: "confirmed",
  fetch: localFetch,
});
async function rpc(method, params = []) {
  const response = await localFetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  assert(response.ok, `Local ${method} HTTP ${response.status}`);
  const body = await response.json();
  assert(
    !body.error,
    `Local ${method} failed (code ${body.error?.code}, transaction error ${JSON.stringify(body.error?.data?.err)})`,
  );
  return body.result;
}
assert(
  (await rpc("getVersion"))["surfnet-version"],
  "RPC must identify as Surfpool before mutation",
);
let lastQuoteStatus,
  lastQuoteAt = 0;
const quoteTransport = async (input, options) => {
  const response = await fetch(input, options);
  lastQuoteStatus = response.status;
  if (response.ok) {
    const request = new URL(
      typeof input === "string" ? input : input.toString(),
    );
    const name = `${request.searchParams.get("inputMint")?.slice(0, 6)}-${request.searchParams.get("outputMint")?.slice(0, 6)}`;
    await writeFile(
      `${outputDir}/quote-${name}.json`,
      JSON.stringify(await response.clone().json()),
    );
  }
  if (!response.ok) {
    const body = await response
      .clone()
      .json()
      .catch(() => ({}));
    console.error(
      JSON.stringify({
        quoteHttpStatus: response.status,
        errorCode: body.errorCode,
        message:
          typeof body.error === "string" ? body.error.slice(0, 300) : undefined,
      }),
    );
  }
  return response;
};
async function prepare(options) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const delay = Math.max(0, 4000 - (Date.now() - lastQuoteAt));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastQuoteAt = Date.now();
    lastQuoteStatus = undefined;
    try {
      return await prepareJupiterRoute(options);
    } catch (error) {
      if (lastQuoteStatus !== 429 || attempt === 2) throw error;
      console.error(
        JSON.stringify({ readOnlyQuoteRetry: attempt + 1, delayMs: 20000 }),
      );
      await new Promise((resolve) => setTimeout(resolve, 20000));
    }
  }
  throw new Error("Exhausted read-only quote attempts");
}
const outputDir =
  process.env.ROUTER_AUDIT_DIR ?? "/private/tmp/jupiter-router-surfpool";
await mkdir(outputDir, { recursive: true });
const JUP = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
const WSOL = NATIVE_MINT.toBase58();
const fixtures = [
  {
    name: "pump-met",
    mint: "3fM6NAMZuarJ9tmqaee5qNEesS9gePJGWzGkNDaYpump",
    requireMultiHop: true,
  },
  {
    name: "mask-route",
    mint: "BwgWHpEAyPnHxmRfYN1tNPS5ADLSiZG3io7uHLJQiT4A",
    requireMultiHop: true,
  },
  {
    name: "mask-split",
    mint: "HuAXPyDWDaMYFKuwQHpqL1oPnj93zdzWmtvFGzCeCUa7",
    requireMultiHop: false,
  },
];
async function compile(wallet, instructions) {
  const { value: latest } = await rpc("getLatestBlockhash", [
    { commitment: "confirmed" },
  ]);
  const tx = buildSwapTransaction({
    version: 1,
    payer: wallet.publicKey,
    instructions,
    recentBlockhash: latest.blockhash,
    computeUnitLimit: 1_400_000,
    computeUnitPriceMicroLamports: 0n,
  });
  assert.equal(tx.version, 1);
  tx.sign([wallet]);
  const wire = Buffer.from(tx.serialize());
  assert.equal(wire[0], 0x81, "Must use version-1 wire format");
  return wire.toString("base64");
}
async function alignLocalClock() {
  // Freshly cloned pools may have timestamps newer than the simulator clock.
  // Official cheatcode uses milliseconds; Clock's unix_timestamp is seconds.
  const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  assert(clock && clock.data.length >= 40, "Missing local Clock sysvar");
  const targetMs = Math.max(
    Date.now() + 5000,
    (Number(clock.data.readBigInt64LE(32)) + 1) * 1000,
  );
  await rpc("surfnet_timeTravel", [{ absoluteTimestamp: targetMs }]);
}
async function simulate(wallet, instructions) {
  if (process.env.SURFPOOL_ADVANCE_CLOCK === "1") await alignLocalClock();
  const encoded = await compile(wallet, instructions);
  return {
    encoded,
    simulation: (
      await rpc("simulateTransaction", [
        encoded,
        { encoding: "base64", sigVerify: true, commitment: "confirmed" },
      ])
    ).value,
  };
}
async function execute(wallet, instructions, prepared) {
  if (prepared) assertRouterTradeFresh(prepared);
  const { encoded, simulation } = await simulate(wallet, instructions);
  assert.equal(
    simulation.err,
    null,
    `Local simulation failed: ${JSON.stringify(simulation.err)}\n${simulation.logs?.join("\n")}`,
  );
  if (prepared) assertRouterTradeFresh(prepared);
  const signature = await rpc("sendTransaction", [
    encoded,
    { encoding: "base64", skipPreflight: false, maxRetries: 0 },
  ]);
  let receipt;
  for (let i = 0; i < 30; i++) {
    receipt = await rpc("getTransaction", [
      signature,
      {
        encoding: "jsonParsed",
        commitment: "confirmed",
        maxSupportedTransactionVersion: 1,
      },
    ]);
    if (receipt) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(receipt, "Missing local confirmed receipt");
  assert.equal(receipt.meta.err, null);
  return { signature, receipt, computeUnits: simulation.unitsConsumed };
}
async function mintInfo(mint) {
  const address = new PublicKey(mint),
    account = await connection.getAccountInfo(address);
  assert(
    account &&
      (account.owner.equals(TOKEN_PROGRAM_ID) ||
        account.owner.equals(TOKEN_2022_PROGRAM_ID)),
    "Unsupported mint program",
  );
  return { mint: address, program: account.owner };
}
async function tokenBalance(address) {
  const info = await connection.getAccountInfo(address);
  return info ? unpackAccount(address, info, info.owner).amount : null;
}
async function seedTokens(address, value) {
  const info = await connection.getAccountInfo(address);
  assert(info, "Missing local token account");
  const data = Buffer.from(info.data);
  data.writeBigUInt64LE(value, 64);
  await rpc("surfnet_setAccount", [
    address.toBase58(),
    {
      lamports: info.lamports,
      owner: info.owner.toBase58(),
      executable: false,
      data: data.toString("hex"),
    },
  ]);
}
const results = [];
for (const fixture of fixtures) {
  if (process.env.ROUTER_CASE && process.env.ROUTER_CASE !== fixture.name)
    continue;
  const wallet = Keypair.generate(); // Disposable local signer only; never persisted.
  await rpc("surfnet_setAccount", [
    wallet.publicKey.toBase58(),
    { lamports: 10_000_000_000 },
  ]);
  const nativeAta = getAssociatedTokenAddressSync(
    NATIVE_MINT,
    wallet.publicKey,
  );
  await execute(wallet, [
    createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey,
      nativeAta,
      wallet.publicKey,
      NATIVE_MINT,
    ),
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: nativeAta,
      lamports: 5_000_000n,
    }),
    createSyncNativeInstruction(nativeAta),
  ]);
  let bought = 0n;
  for (const reverse of [false, true]) {
    const label = `${fixture.name}-${reverse ? "sell" : "buy"}`;
    try {
      const options = {
        connection,
        transport: quoteTransport,
        owner: wallet.publicKey,
        inputMint: new PublicKey(reverse ? fixture.mint : WSOL),
        outputMint: new PublicKey(reverse ? WSOL : fixture.mint),
        amountIn: reverse ? bought / 2n : 100_000_000n,
        slippageBps: 500,
        maxAgeMs: 30_000,
        wrapNativeInput: !reverse,
        unwrapNativeOutput: reverse,
      };
      assert(
        options.amountIn > 0n,
        "No actual purchased tokens for reverse test",
      );
      // First discovery prepares all accounts; a fresh build below binds the final execution.
      const discovery = await prepare(options);
      const mints = [
        ...new Set(
          discovery.routeLegs.flatMap((leg) => [leg.inputMint, leg.outputMint]),
        ),
      ];
      const seeded = new Map();
      for (const mint of mints) {
        if (mint === WSOL) continue;
        const info = await mintInfo(mint),
          ata = getAssociatedTokenAddressSync(
            info.mint,
            wallet.publicKey,
            false,
            info.program,
          );
        await execute(wallet, [
          createAssociatedTokenAccountIdempotentInstruction(
            wallet.publicKey,
            ata,
            wallet.publicKey,
            info.mint,
            info.program,
          ),
        ]);
        if (mint !== options.inputMint.toBase58())
          await seedTokens(
            ata,
            mint === options.outputMint.toBase58() ? 111n : 12345n,
          );
        seeded.set(mint, { ata, before: await tokenBalance(ata) });
      }
      // Load program/pool accounts through the LOCAL datasource before timing the final build.
      for (let i = 0; i < discovery.instructions.length; i++) {
        const ix = discovery.instructions[i];
        await connection.getMultipleAccountsInfo([
          ix.programId,
          ...ix.keys.map((k) => k.pubkey),
        ]);
      }
      const trade = await prepare(options);
      if (fixture.requireMultiHop)
        assert(
          trade.routeLegs.length >= 2,
          "Current route no longer has required multi-hop coverage",
        );
      // Warm Surfpool's RPC token metadata after local account seeding.
      for (const entry of seeded.values())
        await connection.getTokenAccountBalance(entry.ata);
      await connection.getTokenAccountBalance(nativeAta);
      const nativeBefore = await tokenBalance(nativeAta);
      assert(
        nativeBefore !== null && nativeBefore >= 5_000_000n,
        "Pre-existing WSOL fixture missing",
      );
      const swap = trade.instructions.find((ix) => ix.programId.equals(JUP));
      assert(swap, "Missing Jupiter swap");
      const decoded = decodeJupiterRouteInstruction(swap.data);
      const protectedInstructions = trade.instructions.map(
        (ix) =>
          new TransactionInstruction({
            programId: ix.programId,
            keys: ix.keys,
            data: Buffer.from(ix.data),
          }),
      );
      const protectedSwap = protectedInstructions.find((ix) =>
        ix.programId.equals(JUP),
      );
      const offset = decoded.sharedAccountsId === undefined ? 0 : 1;
      protectedSwap.data.writeBigUInt64LE((1n << 64n) - 1n, 16 + offset);
      protectedSwap.data.writeUInt16LE(0, 24 + offset);
      const protection = await simulate(wallet, protectedInstructions);
      assert(
        protection.simulation.err,
        "Impossible output floor unexpectedly succeeded locally",
      );
      // Jupiter official swap-program errors: https://developers.jup.ag/docs/swap/v1/common-errors
      // Optimized program builds can omit the human-readable Anchor error name.
      assert.deepEqual(
        protection.simulation.err,
        {
          InstructionError: [
            protectedInstructions.findIndex((ix) => ix.programId.equals(JUP)),
            { Custom: 6001 },
          ],
        },
        "Impossible floor must fail at Jupiter with SlippageToleranceExceeded",
      );
      assert(
        protection.simulation.logs?.some(
          (line) =>
            line ===
            `Program ${JUP.toBase58()} failed: custom program error: 0x1771`,
        ),
        "Missing Jupiter slippage failure evidence",
      );
      // Preparation is intentionally refreshed after the protected simulation can load cold programs.
      const fresh = await prepare(options);
      const execution = await execute(wallet, fresh.instructions, fresh);
      const expected = {
        owner: wallet.publicKey.toBase58(),
        inputMint: fresh.inputMint.toBase58(),
        outputMint: fresh.outputMint.toBase58(),
        inputTokenProgram: fresh.inputTokenProgram.toBase58(),
        outputTokenProgram: fresh.outputTokenProgram.toBase58(),
        amountIn: fresh.amountIn.toString(),
        minimumAmountOut: fresh.minimumAmountOut.toString(),
        swapInstructionData: fresh.swapInstructionData,
      };
      await writeFile(
        `${outputDir}/${label}-receipt.json`,
        JSON.stringify(execution.receipt),
      );
      await writeFile(
        `${outputDir}/${label}-expectation.json`,
        JSON.stringify(expected),
      );
      let fill, rawNormalizationError;
      const receiptMetadataRepairs = [];
      try {
        fill = normalizeJupiterFill(execution.receipt, expected);
      } catch (error) {
        rawNormalizationError =
          error instanceof Error
            ? error.message
            : "Unknown normalization failure";
        if (
          process.env.SURFPOOL_REPAIR_DECIMALS !== "1" ||
          !/decimals/.test(rawNormalizationError)
        )
          throw error;
        // Explicit LOCAL TEST ONLY workaround for Surfpool 1.6.0's inconsistent
        // preTokenBalances decimal metadata. Never changes raw amount, mint,
        // owner/program identity, instructions, or production normalizer checks.
        const repaired = structuredClone(execution.receipt);
        for (const phase of ["preTokenBalances", "postTokenBalances"])
          for (const row of repaired.meta[phase]) {
            const info = await connection.getAccountInfo(
              new PublicKey(row.mint),
            );
            assert(
              info &&
                info.owner.toBase58() === row.programId &&
                info.data.length >= 82,
              "Cannot verify local mint decimals",
            );
            const authoritative = info.data[44];
            if (row.uiTokenAmount.decimals !== authoritative) {
              receiptMetadataRepairs.push({
                phase,
                accountIndex: row.accountIndex,
                mint: row.mint,
                observed: row.uiTokenAmount.decimals,
                authoritative,
              });
              row.uiTokenAmount.decimals = authoritative;
            }
          }
        fill = normalizeJupiterFill(repaired, expected);
        await writeFile(
          `${outputDir}/${label}-repaired-receipt.json`,
          JSON.stringify(repaired),
        );
      }
      assert(
        fill.inputAmount > 0n &&
          fill.inputAmount <= fresh.amountIn &&
          fill.outputAmount >= fresh.minimumAmountOut,
      );
      const nativeAfter = await tokenBalance(nativeAta);
      if (!reverse) {
        assert.equal(
          nativeAfter,
          nativeBefore + fresh.amountIn - fill.inputAmount,
          "Swap consumed pre-existing WSOL or missed a refund",
        );
        const out = seeded.get(fixture.mint);
        assert(out);
        assert.equal(
          (await tokenBalance(out.ata)) - out.before,
          fill.outputAmount,
          "Net output differs from account delta",
        );
        bought = fill.outputAmount;
      } else {
        assert.equal(nativeAfter, null, "Explicit unwrap must close WSOL ATA");
        const source = seeded.get(fixture.mint);
        assert(source);
        assert.equal(
          source.before - (await tokenBalance(source.ata)),
          fill.inputAmount,
          "Actual input differs from account debit",
        );
      }
      const preserved = [];
      for (const [mint, entry] of seeded) {
        if (mint === expected.inputMint || mint === expected.outputMint)
          continue;
        assert.equal(
          await tokenBalance(entry.ata),
          entry.before,
          "Route consumed pre-existing intermediate holdings",
        );
        preserved.push(mint);
      }
      const result = {
        name: label,
        localOnly: true,
        version: 1,
        owner: wallet.publicKey.toBase58(),
        ...expected,
        signature: execution.signature,
        inputActual: fill.inputAmount.toString(),
        outputActual: fill.outputAmount.toString(),
        inputDecimals: fill.inputDecimals,
        outputDecimals: fill.outputDecimals,
        routeLegs: fresh.routeLegs,
        allowsPartialFill: fresh.allowsPartialFill,
        preservedIntermediateMints: preserved,
        preexistingWsol: nativeBefore.toString(),
        nativeAfter: nativeAfter?.toString() ?? null,
        rawNormalizationError,
        receiptMetadataRepairs,
        impossibleFloorRejected: true,
        computeUnits: execution.computeUnits,
      };
      results.push(result);
      await writeFile(
        `${outputDir}/${label}-receipt.json`,
        JSON.stringify(execution.receipt),
      );
      console.log(JSON.stringify(result));
    } catch (error) {
      const result = {
        name: label,
        localOnly: true,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      results.push(result);
      console.error(JSON.stringify(result));
      if (!reverse) break;
    }
    await writeFile(
      `${outputDir}/results.json`,
      JSON.stringify(results, null, 2),
    );
  }
}
await writeFile(`${outputDir}/results.json`, JSON.stringify(results, null, 2));
assert(results.length > 0, "No fixture selected");
assert(
  !results.some((result) => result.error),
  "One or more LOCAL routed execution checks failed; inspect results",
);
console.log(
  `Passed ${results.length} real Jupiter route executions LOCALLY. No funded-mainnet execution claim.`,
);
