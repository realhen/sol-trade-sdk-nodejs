/** Keyless exact-input instruction example; never signs or submits. */
import { Connection, PublicKey } from '@solana/web3.js';
import { raydiumClmm, prepareTokenAccounts } from '../src/venues';

export async function prepareClmmTrade(
  connection: Connection, pool: PublicKey, owner: PublicKey,
  inputMint: PublicKey, amountIn: bigint,
) {
  const state = await raydiumClmm.prepare(connection, pool);
  const quoted = raydiumClmm.quote(state, inputMint, amountIn, 100);
  const aToB = inputMint.toBase58() === state.poolInfo.mintA.address;
  const input = aToB ? state.poolInfo.mintA : state.poolInfo.mintB;
  const output = aToB ? state.poolInfo.mintB : state.poolInfo.mintA;
  const accounts = prepareTokenAccounts({
    owner, inputMint, outputMint: quoted.outputMint, amountIn,
    inputTokenProgram: new PublicKey(input.programId),
    outputTokenProgram: new PublicKey(output.programId),
  });
  const swap = raydiumClmm.buildSwapInstruction(state, quoted, { payer: owner, ...accounts });
  return { quoted, instructions: [...accounts.setupInstructions, swap, ...accounts.cleanupInstructions] };
}
