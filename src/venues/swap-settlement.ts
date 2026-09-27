/** Authoritative raw token balances immediately before and after one successful swap. */
export interface SwapBalanceObservations {
  requestedAmountIn: bigint;
  minimumAmountOut: bigint;
  inputBalanceBefore: bigint;
  inputBalanceAfter: bigint;
  outputBalanceBefore: bigint;
  outputBalanceAfter: bigint;
}

/**
 * Reconcile actual gross input debit and net output credit, including partial fills
 * and transfer fees. This is a pure accounting check, not confirmation or receipt
 * parsing. The caller must establish successful execution and provide observations
 * scoped to that swap, excluding other transfers and token-account setup/cleanup.
 * In particular, a closed WSOL account is not a zero post-swap token balance.
 * Whole-transaction pre/post balances are usable only when no other instructions
 * change these balances. Never substitute quoted amounts for observations.
 */
export function reconcileSwapBalances(observations: SwapBalanceObservations) {
  for (const [name, value] of Object.entries(observations)) {
    if (typeof value !== 'bigint' || value < 0n || value > (1n << 64n) - 1n) throw new Error(`${name} must be a u64 bigint`);
  }
  if (observations.requestedAmountIn === 0n) throw new Error('requestedAmountIn must be a positive u64 bigint');
  const amountSpent = observations.inputBalanceBefore - observations.inputBalanceAfter;
  const amountReceived = observations.outputBalanceAfter - observations.outputBalanceBefore;
  if (amountSpent < 0n) throw new Error('Swap input balance increased; observations are not scoped to one swap');
  if (amountSpent > observations.requestedAmountIn) throw new Error('Swap spent more than the requested input');
  if (amountReceived < 0n) throw new Error('Swap output balance decreased; observations are not scoped to one swap');
  if (amountReceived < observations.minimumAmountOut) throw new Error('Observed output is below the swap minimum');
  return { amountSpent, amountReceived, unspentAmountIn: observations.requestedAmountIn - amountSpent, fullyFilled: amountSpent === observations.requestedAmountIn };
}
