/** Synthetic LOCAL transfer-fee execution on a cloned public Orca pool.
 * This deliberately changes only local account bytes; it is not evidence that the
 * public mint charges these fees. Run alone on the Surfpool instance. All existing
 * public writable accounts touched by the swaps are restored in finally.
 */
import assert from 'node:assert/strict';
import { Connection, PublicKey, Keypair, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { AccountType, ExtensionType, TOKEN_2022_PROGRAM_ID, TransferFeeConfigLayout, TransferFeeAmountLayout,
  calculateEpochFee, getTransferFeeConfig, getTransferFeeAmount, unpackMint, unpackAccount } from '@solana/spl-token';
const venues = await import(process.env.VENUES_BROWSER ? '../dist/venues/browser.mjs' : '../dist/venues/index.mjs');
const endpoint = process.env.SURFPOOL_RPC_URL ?? 'http://127.0.0.1:8999';
const localFetch = (input, options) => fetch(input, { ...options, redirect: 'error' });
assert.equal(new URL(endpoint).protocol, 'http:', 'Local execution requires HTTP loopback');
assert(!new URL(endpoint).username && !new URL(endpoint).password, 'Local test RPC must not contain credentials');
const url = new URL(endpoint);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Execution requires loopback RPC');
const connection = new Connection(endpoint, { commitment: 'confirmed', fetch: localFetch });
async function rpc(method, params = []) {
  const response = await localFetch(endpoint, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}
assert((await rpc('getVersion'))['surfnet-version'], 'RPC must identify as Surfpool before account mutation');
const adapter = venues.orcaWhirlpool;
const pool = new PublicKey('hSQxf9L7Tpwf1PKjWWSbnew2vyTPpGrfWwNa4gq2n2x');
const original = new Map();
async function remember(address) {
  const key = address.toBase58();
  if (!original.has(key)) {
    const info = await connection.getAccountInfo(address);
    if (info) original.set(key, info);
  }
}
async function writeAccount(address, info, data = info.data) {
  assert(Number.isSafeInteger(info.lamports));
  await rpc('surfnet_setAccount', [address.toBase58(), { lamports: info.lamports,
    owner: info.owner.toBase58(), executable: info.executable, data: data.toString('hex') }]);
}
function appendExtension(data, accountType, extension, payload) {
  assert(data.length >= 166, 'This fixture expects existing Token2022 TLV state');
  assert.equal(data[165], accountType, 'Unexpected Token2022 account type');
  let end = 166;
  while (end + 4 <= data.length) {
    const type = data.readUInt16LE(end), length = data.readUInt16LE(end + 2);
    if (type === ExtensionType.Uninitialized) break;
    assert.notEqual(type, extension, 'Fixture already has the extension; do not overwrite real fee config');
    assert(end + 4 + length <= data.length, 'Truncated fixture TLV');
    end += 4 + length;
  }
  const header = Buffer.alloc(4); header.writeUInt16LE(extension); header.writeUInt16LE(payload.length, 2);
  return Buffer.concat([data.subarray(0, end), header, payload]);
}
async function account(address) {
  const info = await connection.getAccountInfo(address);
  assert(info, 'Missing token account');
  return unpackAccount(address, info, info.owner);
}
async function execute(instructions, wallet) {
  const latest = await connection.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: wallet.publicKey, recentBlockhash: latest.blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...instructions] }).compileToV0Message());
  tx.sign([wallet]);
  const simulation = await connection.simulateTransaction(tx);
  assert.equal(simulation.value.err, null, `Local simulation failed:\n${simulation.value.logs?.join('\n')}`);
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 0 });
  assert.equal((await connection.confirmTransaction({ ...latest, signature }, 'confirmed')).value.err, null);
  return { signature, computeUnits: simulation.value.unitsConsumed };
}

const initial = await adapter.prepare(connection, pool);
const mint = initial.poolData.tokenMintA, vault = initial.poolData.tokenVaultA;
const mintInfo = await connection.getAccountInfo(mint), vaultInfo = await connection.getAccountInfo(vault);
assert(mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) && vaultInfo?.owner.equals(TOKEN_2022_PROGRAM_ID));
assert.equal(getTransferFeeConfig(unpackMint(mint, mintInfo, mintInfo.owner)), null);
await remember(mint); await remember(vault);
const feeBps = 125; // Synthetic 1.25%; identical schedules avoid an epoch boundary race.
const config = Buffer.alloc(TransferFeeConfigLayout.span);
TransferFeeConfigLayout.encode({ transferFeeConfigAuthority: PublicKey.default, withdrawWithheldAuthority: PublicKey.default,
  withheldAmount: 0n, olderTransferFee: { epoch: 0n, maximumFee: 1_000_000_000n, transferFeeBasisPoints: feeBps },
  newerTransferFee: { epoch: 0n, maximumFee: 1_000_000_000n, transferFeeBasisPoints: feeBps } }, config);
try {
  const patchedMint = appendExtension(mintInfo.data, AccountType.Mint, ExtensionType.TransferFeeConfig, config);
  const patchedVault = appendExtension(vaultInfo.data, AccountType.Account, ExtensionType.TransferFeeAmount, Buffer.alloc(TransferFeeAmountLayout.span));
  await writeAccount(mint, mintInfo, patchedMint);
  await writeAccount(vault, vaultInfo, patchedVault);
  const feeConfig = getTransferFeeConfig(unpackMint(mint, { ...mintInfo, data: patchedMint }, mintInfo.owner));
  assert(feeConfig);
  const results = [];
  for (const feeOnInput of [true, false]) {
    const prepared = await adapter.prepare(connection, pool);
    const pair = [prepared.tokenExtensionCtx.tokenMintWithProgramA, prepared.tokenExtensionCtx.tokenMintWithProgramB];
    if (!feeOnInput) pair.reverse();
    const [input, output] = pair;
    const wallet = Keypair.generate(); // Never loads a user key; local cheatcode funding only.
    const amountIn = 100_000n;
    await rpc('surfnet_setAccount', [wallet.publicKey.toBase58(), { lamports: 1_000_000_000 }]);
    const accounts = venues.prepareTokenAccounts({ owner: wallet.publicKey, inputMint: input.address, outputMint: output.address,
      inputTokenProgram: input.tokenProgram, outputTokenProgram: output.tokenProgram, amountIn });
    await execute(accounts.setupInstructions, wallet);
    // Real ATA creation allocated all required extensions. Fund locally without replacing them.
    const inputInfo = await connection.getAccountInfo(accounts.inputTokenAccount);
    assert(inputInfo);
    const fundedData = Buffer.from(inputInfo.data); fundedData.writeBigUInt64LE(amountIn, 64);
    await writeAccount(accounts.inputTokenAccount, inputInfo, fundedData);
    const q = adapter.quote(prepared, input.address, amountIn, 100);
    assert(q.minimumAmountOut > 0n);
    const swap = adapter.buildSwapInstruction(prepared, q, { payer: wallet.publicKey,
      inputTokenAccount: accounts.inputTokenAccount, outputTokenAccount: accounts.outputTokenAccount,
      minimumAmountOut: q.minimumAmountOut });
    // Restore program state and vault balances together, not just the mutated TLV accounts.
    for (const meta of swap.keys) if (meta.isWritable && ![accounts.inputTokenAccount, accounts.outputTokenAccount, wallet.publicKey].some(k => k.equals(meta.pubkey))) await remember(meta.pubkey);
    const before = { input: await account(accounts.inputTokenAccount), output: await account(accounts.outputTokenAccount), vault: await account(vault) };
    const execution = await execute([swap], wallet);
    const after = { input: await account(accounts.inputTokenAccount), output: await account(accounts.outputTokenAccount), vault: await account(vault) };
    const spent = before.input.amount - after.input.amount;
    const received = after.output.amount - before.output.amount;
    assert.equal(spent, amountIn, 'Gross user input debit must equal requested exact input');
    assert.equal(received, q.expectedAmountOut, 'Quote must report actual NET output after transfer fees');
    assert(received >= q.minimumAmountOut);
    const epoch = BigInt((await connection.getEpochInfo()).epoch);
    let transferGross, netCredit, withheldFee;
    if (feeOnInput) {
      transferGross = spent;
      netCredit = after.vault.amount - before.vault.amount;
      withheldFee = getTransferFeeAmount(after.vault).withheldAmount - getTransferFeeAmount(before.vault).withheldAmount;
    } else {
      transferGross = before.vault.amount - after.vault.amount;
      netCredit = received;
      withheldFee = getTransferFeeAmount(after.output).withheldAmount - getTransferFeeAmount(before.output).withheldAmount;
    }
    const expectedFee = calculateEpochFee(feeConfig, epoch, transferGross);
    assert(expectedFee > 0n, 'Test must exercise a nonzero transfer fee');
    assert.equal(withheldFee, expectedFee, 'Destination must withhold exactly the Token2022 transfer fee');
    assert.equal(netCredit + withheldFee, transferGross, 'Gross debit equals spendable credit plus withheld fee');
    const result = { syntheticLocalMutation: true, venue: 'orcaWhirlpool', pool: pool.toBase58(), feeMint: mint.toBase58(),
      feeSide: feeOnInput ? 'input' : 'output', feeBps, inputDebit: spent.toString(), netOutput: received.toString(),
      quotedNetOutput: q.expectedAmountOut.toString(), transferGross: transferGross.toString(), netCredit: netCredit.toString(),
      withheldFee: withheldFee.toString(), ...execution };
    results.push(result); console.log(JSON.stringify(result));
  }
  assert.equal(results.length, 2);
} finally {
  const failures = [];
  for (const [address, info] of original) {
    try { await writeAccount(new PublicKey(address), info); }
    catch (error) { failures.push(`${address}: ${error.message}`); }
  }
  for (const [address, info] of original) {
    try {
      const restored = await connection.getAccountInfo(new PublicKey(address));
      assert(restored?.data.equals(info.data) && restored.owner.equals(info.owner) && restored.lamports === info.lamports, `Restore mismatch: ${address}`);
    } catch (error) { failures.push(error.message); }
  }
  if (failures.length) throw new Error(`Local fixture restore failed: ${failures.join('; ')}`);
  console.log(`Restored ${original.size} public accounts; synthetic Token2022 fee execution finished.`);
}
