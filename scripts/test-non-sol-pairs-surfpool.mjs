/** Execute changed direct-pair builders against real public accounts cloned into LOCAL Surfpool.
 * No remote RPC URL, user keypair, airdrop service, or remote send method is accepted.
 * Run npm run build:browser first. Setup uses real ATA instructions, then local
 * balance edits preserve the allocated Token-2022 extensions and mint state.
 */
import assert from 'node:assert/strict';
import { Connection, PublicKey, Keypair, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, unpackAccount, unpackMint,
  TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, NATIVE_MINT, getTransferFeeConfig } from '@solana/spl-token';
import { raydiumCpmm, meteoraDammV2 } from '../dist/browser.mjs';

const endpoint = process.env.SURFPOOL_RPC_URL ?? 'http://127.0.0.1:8999';
const url = new URL(endpoint);
assert.equal(url.protocol, 'http:', 'Only HTTP loopback Surfpool is permitted');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Only loopback execution is permitted');
assert(!url.username && !url.password && !url.search && !url.hash, 'Local URL must not contain credentials or query parameters');
const localFetch = (input, options) => {
  assert.equal(new URL(typeof input === 'string' ? input : input.url ?? input.toString()).origin, url.origin, 'Unexpected RPC destination');
  return fetch(input, { ...options, redirect: 'error' });
};
const connection = new Connection(endpoint, { commitment: 'confirmed', fetch: localFetch });
async function rpc(method, params = []) {
  const response = await localFetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  assert(response.ok, `Local ${method} returned HTTP ${response.status}`);
  const body = await response.json();
  assert(!body.error, `Local ${method} failed (code ${body.error?.code})`);
  return body.result;
}
assert((await rpc('getVersion'))['surfnet-version'], 'RPC must identify itself as Surfpool before mutation');
const getAccountInfo = async pubkey => ({ value: (await connection.getAccountInfo(pubkey)) ?? undefined });
const markets = [
  { venue: 'cpmm', pool: '9yczkyRw4xxC8xntgeURtahoT3aad51fUPLxjenLbVbf', sourceSignature: '52hsCrddCD3dZxAwNo81kHnubdRc8B83AAhD8iaVzc1pRTya9tK1aDtAuRci38ooNBb5Qc3dymKD2Mttanm3Fvuv' },
  { venue: 'dammV2', pool: 'BnztueWcXv93mgW7yJe8WYpnCxpz34nujPhfjQT6SLu1', sourceSignature: '66T1Xt9tpN3xX6QxrQJovkD9QREm5C4XfkDnhyUktCMnA6XYrEGqxRYHZttCtzvY1XeQysYB8ikh6Hn2hz67W3Lg' },
];
async function prepare(market) {
  const poolAddress = new PublicKey(market.pool);
  const pool = market.venue === 'cpmm'
    ? await raydiumCpmm.fetchRaydiumCPMMpoolState({ getAccountInfo }, poolAddress)
    : await meteoraDammV2.fetchMeteoraPool({ getAccountInfo }, poolAddress);
  assert(pool, `${market.venue} owner/discriminator/layout validation failed`);
  const mintAddresses = market.venue === 'cpmm' ? [pool.token0Mint, pool.token1Mint] : [pool.tokenAMint, pool.tokenBMint];
  const vaultAddresses = market.venue === 'cpmm' ? [pool.token0Vault, pool.token1Vault] : [pool.tokenAVault, pool.tokenBVault];
  const pair = [];
  for (let i = 0; i < 2; i++) {
    const mintInfo = await connection.getAccountInfo(mintAddresses[i]);
    const vaultInfo = await connection.getAccountInfo(vaultAddresses[i]);
    assert(mintInfo && vaultInfo, 'Missing mint or vault account');
    assert(mintInfo.owner.equals(TOKEN_PROGRAM_ID) || mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID), 'Unsupported mint program');
    assert(vaultInfo.owner.equals(mintInfo.owner), 'Pool vault token program differs from mint');
    const mint = unpackMint(mintAddresses[i], mintInfo, mintInfo.owner);
    const vault = unpackAccount(vaultAddresses[i], vaultInfo, mintInfo.owner);
    assert(vault.mint.equals(mint.address), 'Decoded pool vault does not hold its declared mint');
    assert(vault.amount > 0n, 'Pool has no liquidity');
    assert(!mint.address.equals(NATIVE_MINT), 'Fixture must be a non-SOL pair on both sides');
    if (market.venue === 'cpmm') assert((i ? pool.token1Program : pool.token0Program).equals(mintInfo.owner), 'CPMM mint program mismatch');
    pair.push({ mint, program: mintInfo.owner, vault, hasTransferFee: getTransferFeeConfig(mint) !== null });
  }
  const params = market.venue === 'cpmm' ? {
    poolState: poolAddress, ammConfig: pool.ammConfig, baseMint: pair[0].mint.address, quoteMint: pair[1].mint.address,
    baseVault: pair[0].vault.address, quoteVault: pair[1].vault.address, baseTokenProgram: pair[0].program, quoteTokenProgram: pair[1].program,
    baseReserve: pair[0].vault.amount, quoteReserve: pair[1].vault.amount, observationState: pool.observationKey,
  } : {
    pool: poolAddress, tokenAMint: pair[0].mint.address, tokenBMint: pair[1].mint.address,
    tokenAVault: pair[0].vault.address, tokenBVault: pair[1].vault.address, tokenAProgram: pair[0].program, tokenBProgram: pair[1].program,
  };
  return { params, pair };
}
async function transaction(wallet, instructions) {
  const latest = await connection.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: wallet.publicKey, recentBlockhash: latest.blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...instructions] }).compileToV0Message());
  tx.sign([wallet]);
  return { tx, latest };
}
async function execute(wallet, instructions) {
  const { tx, latest } = await transaction(wallet, instructions);
  const simulation = await connection.simulateTransaction(tx);
  assert.equal(simulation.value.err, null, `Local simulation failed: ${JSON.stringify(simulation.value.err)}\n${simulation.value.logs?.join('\n')}`);
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 0 });
  assert.equal((await connection.confirmTransaction({ ...latest, signature }, 'confirmed')).value.err, null);
  return { signature, computeUnits: simulation.value.unitsConsumed };
}
const results = [];
for (const market of markets) {
  if (process.env.VENUE && process.env.VENUE !== market.venue) continue;
  for (const reverse of [false, true]) {
    const { params, pair } = await prepare(market);
    const [input, output] = reverse ? [...pair].reverse() : pair;
    const wallet = Keypair.generate();
    const amountIn = 10n ** BigInt(Math.min(input.mint.decimals, 6));
    await rpc('surfnet_setAccount', [wallet.publicKey.toBase58(), { lamports: 1_000_000_000 }]);
    const inputAccount = getAssociatedTokenAddressSync(input.mint.address, wallet.publicKey, false, input.program);
    const outputAccount = getAssociatedTokenAddressSync(output.mint.address, wallet.publicKey, false, output.program);
    await execute(wallet, [
      createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, inputAccount, wallet.publicKey, input.mint.address, input.program),
      createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, outputAccount, wallet.publicKey, output.mint.address, output.program),
    ]);
    const inputInfo = await connection.getAccountInfo(inputAccount);
    assert(inputInfo && inputInfo.owner.equals(input.program));
    const funded = Buffer.from(inputInfo.data); funded.writeBigUInt64LE(amountIn, 64);
    await rpc('surfnet_setAccount', [inputAccount.toBase58(), { lamports: inputInfo.lamports, owner: inputInfo.owner.toBase58(), executable: false, data: funded.toString('hex') }]);
    const builder = market.venue === 'cpmm'
      ? (reverse ? raydiumCpmm.buildRaydiumCpmmSellInstructions : raydiumCpmm.buildRaydiumCpmmBuyInstructions)
      : (reverse ? meteoraDammV2.buildMeteoraDammV2SellInstructions : meteoraDammV2.buildMeteoraDammV2BuyInstructions);
    const request = { payer: wallet.publicKey, inputMint: input.mint.address, outputMint: output.mint.address, inputAmount: amountIn,
      minimumOutputAmount: 1n, protocolParams: params };
    const swaps = builder(request);
    const { tx: valid } = await transaction(wallet, swaps);
    const probe = await connection.simulateTransaction(valid);
    assert.equal(probe.value.err, null, `${market.venue} ${reverse ? 'BtoA' : 'AtoB'}: ${JSON.stringify(probe.value.err)}\n${probe.value.logs?.join('\n')}`);
    const { tx: protectedTx } = await transaction(wallet, builder({ ...request, minimumOutputAmount: (1n << 64n) - 1n }));
    const protectedResult = await connection.simulateTransaction(protectedTx);
    // Official venue IDLs: CPMM ExceededSlippage=6005; cp_amm ExceededSlippage=6002.
    // Require the swap itself (after compute budget and default setup) to reject its minimum, not any error.
    const expectedSlippageCode = market.venue === 'cpmm' ? 6005 : 6002;
    assert.deepEqual(protectedResult.value.err, { InstructionError: [swaps.length, { Custom: expectedSlippageCode }] },
      'Impossible floor must fail specifically with the venue ExceededSlippage error');
    const execution = await execute(wallet, swaps);
    const spent = amountIn - BigInt((await connection.getTokenAccountBalance(inputAccount)).value.amount);
    const received = BigInt((await connection.getTokenAccountBalance(outputAccount)).value.amount);
    assert(spent > 0n && spent <= amountIn && received >= 1n, 'Actual debit/credit violates the explicit swap bounds');
    if (market.venue === 'cpmm') assert.equal(spent, amountIn, 'CPMM exact input must consume the whole input');
    const result = { localOnly: true, ...market, direction: reverse ? 'BtoA' : 'AtoB', inputMint: input.mint.address.toBase58(), outputMint: output.mint.address.toBase58(),
      inputProgram: input.program.toBase58(), outputProgram: output.program.toBase58(), transferFeePresent: { input: input.hasTransferFee, output: output.hasTransferFee },
      inputRequested: amountIn.toString(), inputSpent: spent.toString(), actualNetOutput: received.toString(), minimumOutput: '1', defaultSetupOnFundedAtas: true, impossibleFloorRejected: true, floorError: { name: 'ExceededSlippage', code: expectedSlippageCode }, ...execution };
    results.push(result); console.log(JSON.stringify(result));
  }
}
assert.equal(results.length, markets.filter(m => !process.env.VENUE || m.venue === process.env.VENUE).length * 2);
assert(results.length > 0, 'VENUE matched no markets');
console.log(`Passed ${results.length} real non-SOL pool swaps locally; explicit minimums only, no quote accuracy claim.`);
