import { PublicKey } from '@solana/web3.js';
import { NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '../common/spl-token';

const SOL_SENTINEL = new PublicKey('So11111111111111111111111111111111111111111');

/** Normalize only the native SOL request alias; pool accounts always contain SPL mints. */
export function normalizeNativeMint(mint: PublicKey): PublicKey {
  return mint.equals(SOL_SENTINEL) ? NATIVE_MINT : mint;
}

/** Resolve direction from requested mints, never from a stablecoin/SOL whitelist. */
export function resolveMintPair(poolA: PublicKey, poolB: PublicKey, requestedInput?: PublicKey, requestedOutput?: PublicKey) {
  if (poolA.equals(PublicKey.default) || poolB.equals(PublicKey.default) || poolA.equals(SOL_SENTINEL) || poolB.equals(SOL_SENTINEL) || poolA.equals(poolB)) {
    throw new Error('Pool mint pair must contain two distinct SPL mints');
  }
  const input = requestedInput === undefined ? undefined : normalizeNativeMint(requestedInput);
  const output = requestedOutput === undefined ? undefined : normalizeNativeMint(requestedOutput);
  if (input === undefined && output === undefined) throw new Error('At least one requested mint is required');
  const aToB = input === undefined ? output!.equals(poolB) : input.equals(poolA);
  const inputMint = aToB ? poolA : poolB;
  const outputMint = aToB ? poolB : poolA;
  if ((input !== undefined && !input.equals(inputMint)) || (output !== undefined && !output.equals(outputMint))) {
    throw new Error('Requested inputMint/outputMint pair must match the supplied pool mints');
  }
  return { inputMint, outputMint, aToB };
}

export function assertU64Amount(value: bigint, name: string, positive = false): void {
  if (typeof value !== 'bigint' || value < (positive ? 1n : 0n) || value > (1n << 64n) - 1n) {
    throw new Error(`${name} must be a ${positive ? 'positive ' : ''}u64 bigint`);
  }
}

/** Shared validation for direct builders; an explicit floor never selects exact-output mode. */
export function validateSwapAmounts(params: { inputAmount: bigint; minimumOutputAmount?: bigint; fixedOutputAmount?: bigint; slippageBasisPoints?: bigint }): void {
  assertU64Amount(params.inputAmount, 'inputAmount', true);
  if (params.minimumOutputAmount !== undefined) assertU64Amount(params.minimumOutputAmount, 'minimumOutputAmount');
  if (params.fixedOutputAmount !== undefined) assertU64Amount(params.fixedOutputAmount, 'fixedOutputAmount', true);
  if (params.minimumOutputAmount !== undefined && params.fixedOutputAmount !== undefined) throw new Error('minimumOutputAmount cannot be combined with fixedOutputAmount');
  const slippage = params.slippageBasisPoints;
  if (slippage !== undefined && (typeof slippage !== 'bigint' || slippage < 0n || slippage > 10000n)) throw new Error('slippageBasisPoints must be a bigint between 0 and 10000');
}

export function validatePoolTokenProgram(mint: PublicKey, program: PublicKey): void {
  if (!program.equals(TOKEN_PROGRAM_ID) && !program.equals(TOKEN_2022_PROGRAM_ID)) throw new Error('Unsupported token program');
  if (mint.equals(NATIVE_MINT) && !program.equals(TOKEN_PROGRAM_ID)) throw new Error('Native mint requires the classic token program');
}
