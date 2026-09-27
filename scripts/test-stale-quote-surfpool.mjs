/** Execute a competing local swap, then verify a stale Orca quote's floor protects the user. */
import assert from 'node:assert/strict';
import { Connection, PublicKey, Keypair, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js';
const venues = await import(process.env.VENUES_BROWSER ? '../dist/venues/browser.mjs' : '../dist/venues/index.mjs');
const endpoint = process.env.SURFPOOL_RPC_URL ?? 'http://127.0.0.1:8999';
const localFetch = (input, options) => fetch(input, { ...options, redirect: 'error' });
assert.equal(new URL(endpoint).protocol, 'http:', 'Local execution requires HTTP loopback');
assert(!new URL(endpoint).username && !new URL(endpoint).password, 'Local test RPC must not contain credentials');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(endpoint).hostname), 'Local execution requires loopback RPC');
async function rpc(method, params = []) {
  const body = await (await localFetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}
assert((await rpc('getVersion'))['surfnet-version'], 'RPC must identify as Surfpool');
const connection = new Connection(endpoint, { commitment: 'confirmed', fetch: localFetch });
const pool = new PublicKey('hSQxf9L7Tpwf1PKjWWSbnew2vyTPpGrfWwNa4gq2n2x');
const adapter = venues.orcaWhirlpool;
const state = await adapter.prepare(connection, pool);
const amountIn = 1_000_000_000n;
const quote = adapter.quote(state, state.poolData.tokenMintA, amountIn, 0);
const mintA = state.tokenExtensionCtx.tokenMintWithProgramA;
const mintB = state.tokenExtensionCtx.tokenMintWithProgramB;
async function makeSwap(snapshot, q) {
  const wallet = Keypair.generate();
  await rpc('surfnet_setAccount', [wallet.publicKey.toBase58(), { lamports: 1_000_000_000 }]);
  await rpc('surfnet_setTokenAccount', [wallet.publicKey.toBase58(), mintA.address.toBase58(), { amount: Number(amountIn) }, mintA.tokenProgram.toBase58()]);
  const accounts = venues.prepareTokenAccounts({ owner: wallet.publicKey, inputMint: mintA.address, outputMint: mintB.address, inputTokenProgram: mintA.tokenProgram, outputTokenProgram: mintB.tokenProgram, amountIn });
  const swap = adapter.buildSwapInstruction(snapshot, q, { payer: wallet.publicKey, inputTokenAccount: accounts.inputTokenAccount, outputTokenAccount: accounts.outputTokenAccount });
  const latest = await connection.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: wallet.publicKey, recentBlockhash: latest.blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...accounts.setupInstructions, swap] }).compileToV0Message());
  tx.sign([wallet]);
  return { tx, latest };
}
const stale = await makeSwap(state, quote);
assert.equal((await connection.simulateTransaction(stale.tx)).value.err, null, 'The original quote must execute against its initial state');
const competing = await makeSwap(state, quote);
const signature = await connection.sendRawTransaction(competing.tx.serialize(), { skipPreflight: false, maxRetries: 0 });
assert.equal((await connection.confirmTransaction({ ...competing.latest, signature }, 'confirmed')).value.err, null);
const failure = (await connection.simulateTransaction(stale.tx)).value;
assert(failure.err, 'Changed state must invalidate this zero-slippage quote');
assert(failure.logs?.some(line => line.includes('AmountOutBelowMinimum')), 'Failure must be the output floor, not account or balance setup');
const refreshed = await adapter.prepare(connection, pool);
const newQuote = adapter.quote(refreshed, refreshed.poolData.tokenMintA, amountIn, 0);
assert(newQuote.expectedAmountOut < quote.expectedAmountOut, 'Competing trade must reduce the same-direction output');
const fresh = await makeSwap(refreshed, newQuote);
assert.equal((await connection.simulateTransaction(fresh.tx)).value.err, null, 'Refreshing state must restore a valid quote');
console.log(JSON.stringify({ scenario: 'stale-orca-quote', previousOutput: quote.expectedAmountOut.toString(), refreshedOutput: newQuote.expectedAmountOut.toString(), staleRejected: true, refreshedSimulationPassed: true }));
