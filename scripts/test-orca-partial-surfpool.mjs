/** Explicit price-limit protocol test on a local fork; not the adapter's default quote limit. */
import assert from 'node:assert/strict';
import BN from 'bn.js';
import { Connection, PublicKey, Keypair, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js';
const { orcaWhirlpool, prepareTokenAccounts, reconcileSwapBalances } = await import(process.env.VENUES_BROWSER ? '../dist/venues/browser.mjs' : '../dist/venues/index.mjs');
const endpoint = process.env.SURFPOOL_RPC_URL ?? 'http://127.0.0.1:8999';
const localFetch = (input, options) => fetch(input, { ...options, redirect: 'error' });
assert.equal(new URL(endpoint).protocol, 'http:', 'Local execution requires HTTP loopback');
assert(!new URL(endpoint).username && !new URL(endpoint).password, 'Local test RPC must not contain credentials');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(endpoint).hostname), 'Execution requires loopback RPC');
const connection = new Connection(endpoint, { commitment: 'confirmed', fetch: localFetch });
async function rpc(method, params = []) {
  const response = await localFetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}
assert((await rpc('getVersion'))['surfnet-version'], 'RPC is not Surfpool');
const pool = new PublicKey('hSQxf9L7Tpwf1PKjWWSbnew2vyTPpGrfWwNa4gq2n2x');
const snapshot = await orcaWhirlpool.prepare(connection, pool);
const input = snapshot.tokenExtensionCtx.tokenMintWithProgramB;
const output = snapshot.tokenExtensionCtx.tokenMintWithProgramA;
const amountIn = 1000000n;
// Zero floor isolates partial-fill protocol behavior; only local synthetic funds are used.
const quote = orcaWhirlpool.quote(snapshot, input.address, amountIn, 10000);
assert.equal(quote.estimatedAmountIn, amountIn);
assert.equal(quote.executionMayPartiallyFill, true);
const limit = snapshot.poolData.sqrtPrice.add(quote.swap.estimatedEndSqrtPrice).div(new BN(2));
assert(limit.gt(snapshot.poolData.sqrtPrice) && limit.lt(quote.swap.estimatedEndSqrtPrice));
const priceLimitedTestQuote = { ...quote, swap: { ...quote.swap, sqrtPriceLimit: limit } };
const wallet = Keypair.generate();
const accounts = prepareTokenAccounts({ owner: wallet.publicKey, inputMint: input.address, outputMint: output.address, inputTokenProgram: input.tokenProgram, outputTokenProgram: output.tokenProgram, amountIn });
await rpc('surfnet_setAccount', [wallet.publicKey.toBase58(), { lamports: 1000000000 }]);
await rpc('surfnet_setTokenAccount', [wallet.publicKey.toBase58(), input.address.toBase58(), { amount: Number(amountIn) }, input.tokenProgram.toBase58()]);
const swap = orcaWhirlpool.buildSwapInstruction(snapshot, priceLimitedTestQuote, { payer: wallet.publicKey, inputTokenAccount: accounts.inputTokenAccount, outputTokenAccount: accounts.outputTokenAccount });
const latest = await connection.getLatestBlockhash();
const transaction = new VersionedTransaction(new TransactionMessage({ payerKey: wallet.publicKey, recentBlockhash: latest.blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }), ...accounts.setupInstructions, swap] }).compileToV0Message());
transaction.sign([wallet]);
const simulation = await connection.simulateTransaction(transaction);
assert.equal(simulation.value.err, null, simulation.value.logs?.join('\n'));
const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 0 });
assert.equal((await connection.confirmTransaction({ ...latest, signature }, 'confirmed')).value.err, null);
const inputAfter = BigInt((await connection.getTokenAccountBalance(accounts.inputTokenAccount)).value.amount);
const outputAfter = BigInt((await connection.getTokenAccountBalance(accounts.outputTokenAccount)).value.amount);
const settled = reconcileSwapBalances({ requestedAmountIn: amountIn, minimumAmountOut: 0n, inputBalanceBefore: amountIn, inputBalanceAfter: inputAfter, outputBalanceBefore: 0n, outputBalanceAfter: outputAfter });
assert(inputAfter > 0n && inputAfter < amountIn, 'Explicit price limit must leave part of the input unspent');
assert(outputAfter > 0n);
assert.equal(settled.fullyFilled, false);
console.log(JSON.stringify({ scenario: 'Orca explicit price limit permits partial exact-input settlement', pool: pool.toBase58(), requestedInput: amountIn.toString(), actualInput: (amountIn - inputAfter).toString(), remainingInput: inputAfter.toString(), actualOutput: outputAfter.toString(), fullyFilled: settled.fullyFilled, signature, limitation: 'Explicit test-only price limit; default quote uses protocol-wide limit. Full snapshot quote is not a settlement promise.' }));
// All confirmations and balance assertions completed; do not wait on SDK cache timers.
process.exit(0);
