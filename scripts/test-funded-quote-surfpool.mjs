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
  discoverPoolQuoteMint,
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
  process.env.ROUTER_AUDIT_DIR ?? "/private/tmp/funded-quote-router-surfpool";
await mkdir(outputDir, { recursive: true });
const JUP = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
const WSOL = NATIVE_MINT.toBase58();
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

// Read-only public quotes; every write remains confined to this identified local validator.
const wallet = Keypair.generate();
const pool = new PublicKey("3hcAKoHkBRW1HtamyvdZPyr5oHV8pGkoV2yUAnUuLVko");
const target = new PublicKey("3fM6NAMZuarJ9tmqaee5qNEesS9gePJGWzGkNDaYpump");
const quote = await discoverPoolQuoteMint(connection, pool, target);
assert(
  !quote.equals(NATIVE_MINT),
  "Fixture must be funded with a non-SOL quote mint",
);
await rpc("surfnet_setAccount", [
  wallet.publicKey.toBase58(),
  { lamports: 10_000_000_000 },
]);
const quoteInfo = await mintInfo(quote.toBase58());
const quoteAta = getAssociatedTokenAddressSync(
  quote,
  wallet.publicKey,
  false,
  quoteInfo.program,
);
await execute(wallet, [
  createAssociatedTokenAccountIdempotentInstruction(
    wallet.publicKey,
    quoteAta,
    wallet.publicKey,
    quote,
    quoteInfo.program,
  ),
]);
await seedTokens(quoteAta, 100_000_000n);
await connection.getTokenAccountBalance(quoteAta);
const results = [];
let bought = 0n;
for (const reverse of [false, true]) {
  const options = {
    connection,
    transport: quoteTransport,
    owner: wallet.publicKey,
    inputMint: reverse ? target : quote,
    outputMint: reverse ? quote : target,
    amountIn: reverse ? bought / 2n : 1_000_000n,
    slippageBps: 500,
    maxAgeMs: 30_000,
    directPairOnly: true,
    wrapNativeInput: false,
    unwrapNativeOutput: false,
  };
  const discovery = await prepare(options);
  for (const ix of discovery.instructions)
    await connection.getMultipleAccountsInfo([
      ix.programId,
      ...ix.keys.map((k) => k.pubkey),
    ]);
  const source = getAssociatedTokenAddressSync(
    options.inputMint,
    wallet.publicKey,
    false,
    discovery.inputTokenProgram,
  );
  const destination = getAssociatedTokenAddressSync(
    options.outputMint,
    wallet.publicKey,
    false,
    discovery.outputTokenProgram,
  );
  const beforeIn = await tokenBalance(source),
    beforeOut = (await tokenBalance(destination)) ?? 0n;
  assert(
    beforeIn !== null && beforeIn >= options.amountIn,
    "Input must already be funded",
  );
  const trade = await prepare(options);
  assert.equal(trade.routeLegs.length, 1);
  assert.equal(trade.routeLegs[0].inputMint, options.inputMint.toBase58());
  assert.equal(trade.routeLegs[0].outputMint, options.outputMint.toBase58());
  assert(
    trade.instructions.every(
      (ix) =>
        ix.programId.equals(JUP) ||
        ix.programId.toBase58().startsWith("AToken"),
    ),
    "No SOL funding/conversion instructions permitted",
  );
  const execution = await execute(wallet, trade.instructions, trade);
  const expected = {
    owner: wallet.publicKey.toBase58(),
    inputMint: trade.inputMint.toBase58(),
    outputMint: trade.outputMint.toBase58(),
    inputTokenProgram: trade.inputTokenProgram.toBase58(),
    outputTokenProgram: trade.outputTokenProgram.toBase58(),
    amountIn: trade.amountIn.toString(),
    minimumAmountOut: trade.minimumAmountOut.toString(),
    swapInstructionData: trade.swapInstructionData,
    directPairOnly: true,
  };
  const label = reverse ? "sell" : "buy";
  await writeFile(
    `${outputDir}/${label}-receipt.json`,
    JSON.stringify(execution.receipt),
  );
  await writeFile(
    `${outputDir}/${label}-expectation.json`,
    JSON.stringify(expected),
  );
  const fill = normalizeJupiterFill(execution.receipt, expected);
  assert.equal(fill.inputAmount, beforeIn - (await tokenBalance(source)));
  assert.equal(
    fill.outputAmount,
    (await tokenBalance(destination)) - beforeOut,
  );
  if (!reverse) bought = fill.outputAmount;
  results.push({
    side: label,
    signature: execution.signature,
    pool: trade.routeLegs[0].pool,
    quoteMint: quote.toBase58(),
    inputAmount: fill.inputAmount.toString(),
    outputAmount: fill.outputAmount.toString(),
    oneHop: true,
    noSolConversion: true,
    rawReceiptNormalized: true,
  });
}
await writeFile(`${outputDir}/summary.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
