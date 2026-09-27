/** Local execution only: clone mainnet programs/accounts through a running Surfpool. */
import assert from 'node:assert/strict';
import { Connection, PublicKey, Keypair, TransactionMessage, TransactionInstruction, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
const venues = await import(process.env.VENUES_BROWSER ? '../dist/venues/browser.mjs' : '../dist/venues/index.mjs');
const endpoint = process.env.SURFPOOL_RPC_URL ?? 'http://127.0.0.1:8999';
const url = new URL(endpoint);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Execution tests require loopback RPC');
const connection = new Connection(endpoint, 'confirmed');
async function rpc(method, params = []) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}
assert((await rpc('getVersion'))['surfnet-version'], 'RPC is not Surfpool');
const markets = [
  ['raydiumClmm', '3L7KbPVaAQA4UTecaGQYsm6UCq5F3sZM9zAYkxqYt63j'],
  ['orcaWhirlpool', 'hSQxf9L7Tpwf1PKjWWSbnew2vyTPpGrfWwNa4gq2n2x'],
  ['meteoraDlmm', 'GkPsJaMgqqEg1g7c3yzzubWy488eCfvZoPEUAz96zJeH'],
  ['meteoraDbc', process.env.DBC_TEST_POOL ?? '9D1ByLbUU8S5JSik4oDDdCHntt7PEaootedWDN94kjGh'],
  ['meteoraDammV1', 'B1AdQ85N2mJ2xtMg9bgThhsPoA6T3M26rt4TChWSiPpr'],
];
function tokens(name, p) {
  if (name === 'raydiumClmm') return [p.poolInfo.mintA, p.poolInfo.mintB].map(m => [new PublicKey(m.address), new PublicKey(m.programId)]);
  if (name === 'orcaWhirlpool') return [p.tokenExtensionCtx.tokenMintWithProgramA, p.tokenExtensionCtx.tokenMintWithProgramB].map(m => [m.address, m.tokenProgram]);
  if (name === 'meteoraDlmm') return [[p.tokenXMint, p.tokenXProgram], [p.tokenYMint, p.tokenYProgram]];
  return [[p.baseMint, p.baseTokenProgram ?? TOKEN_PROGRAM_ID], [p.quoteMint, p.quoteTokenProgram ?? TOKEN_PROGRAM_ID]];
}
const results = [];
for (const [name, address] of markets) {
  if (process.env.VENUE && process.env.VENUE !== name) continue;
  const adapter = venues[name];
  for (const reverse of [false, true]) {
    const prepared = await adapter.prepare(connection, new PublicKey(address));
    const pair = tokens(name, prepared);
    if (reverse) pair.reverse();
    const [[inputMint, inputTokenProgram], [outputMint, outputTokenProgram]] = pair;
    const wallet = Keypair.generate(); // Synthetic, funded only through local cheatcodes.
    const amountIn = name === 'meteoraDbc' ? (reverse ? 1_000_000n : 1_000_000_000_000n) : 100_000n;
    const qparams = { inputMint, outputMint, amountIn, slippageBps: 100, owner: wallet.publicKey };
    const q = name === 'meteoraDbc' || name === 'meteoraDammV1' ? adapter.quote(prepared, qparams) : adapter.quote(prepared, inputMint, amountIn, 100);
    assert(q.minimumAmountOut > 0n);
    const accounts = venues.prepareTokenAccounts({ owner: wallet.publicKey, inputMint, outputMint, inputTokenProgram, outputTokenProgram, amountIn });
    await rpc('surfnet_setAccount', [wallet.publicKey.toBase58(), { lamports: 1_000_000_000 }]);
    await rpc('surfnet_setTokenAccount', [wallet.publicKey.toBase58(), inputMint.toBase58(), { amount: Number(amountIn) }, inputTokenProgram.toBase58()]);
    const params = { ...qparams, owner: wallet.publicKey, payer: wallet.publicKey, inputTokenAccount: accounts.inputTokenAccount, outputTokenAccount: accounts.outputTokenAccount, minimumAmountOut: q.minimumAmountOut, quote: q };
    const swaps = adapter.buildSwapInstruction ? [adapter.buildSwapInstruction(prepared, q, params)] : await adapter.buildSwapInstructions(prepared, params);
    const latest = await connection.getLatestBlockhash();
    const message = new TransactionMessage({ payerKey: wallet.publicKey, recentBlockhash: latest.blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...accounts.setupInstructions, ...swaps] }).compileToV0Message();
    const tx = new VersionedTransaction(message); tx.sign([wallet]);
    const simulation = await connection.simulateTransaction(tx);
    if (simulation.value.err) throw new Error(`${name}/${reverse}: ${JSON.stringify(simulation.value.err)}\n${simulation.value.logs?.join('\n')}`);
    // The same prepared accounts must reject an output floor above available output.
    // Override only the encoded floor in a test copy (DLMM also rejects this at build time).
    const protectedSwaps = swaps.map(ix => {
      const data = Buffer.from(ix.data);
      data.writeBigUInt64LE((q.expectedAmountOut ?? q.amountOut) * 2n + 1n, 16);
      return new TransactionInstruction({ programId: ix.programId, keys: ix.keys, data });
    });
    const protectedTx = new VersionedTransaction(new TransactionMessage({ payerKey: wallet.publicKey, recentBlockhash: latest.blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...accounts.setupInstructions, ...protectedSwaps] }).compileToV0Message());
    protectedTx.sign([wallet]);
    assert((await connection.simulateTransaction(protectedTx)).value.err, `${name} must enforce the on-chain output floor`);
    const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 0 });
    const confirmation = await connection.confirmTransaction({ ...latest, signature }, 'confirmed');
    assert.equal(confirmation.value.err, null);
    const spent = amountIn - BigInt((await connection.getTokenAccountBalance(accounts.inputTokenAccount)).value.amount);
    const received = BigInt((await connection.getTokenAccountBalance(accounts.outputTokenAccount)).value.amount);
    assert.equal(spent, amountIn, `${name} must consume exact input`);
    assert(received >= q.minimumAmountOut, `${name} output must satisfy minimum`);
    const result = { venue: name, direction: reverse ? 'BtoA' : 'AtoB', input: amountIn.toString(), quotedOutput: (q.expectedAmountOut ?? q.amountOut).toString(), actualOutput: received.toString(), minimumOutput: q.minimumAmountOut.toString(), computeUnits: simulation.value.unitsConsumed, signature };
    results.push(result); console.log(JSON.stringify(result));
  }
}
assert.equal(results.length, process.env.VENUE ? 2 : 10);
console.log(`Passed ${results.length} local swaps across ${process.env.VENUE ? 1 : 5} markets.`);
