import { describe, expect, it } from 'vitest';
import { reconcileSwapBalances } from '../swap-settlement';

const balances = {
  requestedAmountIn: 100n, minimumAmountOut: 40n,
  inputBalanceBefore: 1000n, inputBalanceAfter: 900n,
  outputBalanceBefore: 30n, outputBalanceAfter: 80n,
};
describe('swap-scoped balance reconciliation', () => {
  it('records actual debit and net credit instead of quoted output', () => {
    expect(reconcileSwapBalances(balances)).toEqual({ amountSpent: 100n, amountReceived: 50n, unspentAmountIn: 0n, fullyFilled: true });
  });
  it('accepts a successful partial input fill that satisfies the output floor', () => {
    expect(reconcileSwapBalances({ ...balances, inputBalanceAfter: 920n })).toEqual({ amountSpent: 80n, amountReceived: 50n, unspentAmountIn: 20n, fullyFilled: false });
  });
  it('rejects balance changes inconsistent with one successful swap', () => {
    expect(() => reconcileSwapBalances({ ...balances, inputBalanceAfter: 1001n })).toThrow(/input balance/);
    expect(() => reconcileSwapBalances({ ...balances, inputBalanceAfter: 899n })).toThrow(/requested/);
    expect(() => reconcileSwapBalances({ ...balances, outputBalanceAfter: 29n })).toThrow(/output balance/);
    expect(() => reconcileSwapBalances({ ...balances, outputBalanceAfter: 69n })).toThrow(/minimum/);
  });
  it('preserves raw precision above Number.MAX_SAFE_INTEGER', () => {
    const large = 1n << 63n;
    expect(reconcileSwapBalances({ ...balances, inputBalanceBefore: large + 100n, inputBalanceAfter: large }).amountSpent).toBe(100n);
  });
  it('rejects malformed raw amounts', () => {
    expect(() => reconcileSwapBalances({ ...balances, requestedAmountIn: 0n })).toThrow(/positive u64/);
    expect(() => reconcileSwapBalances({ ...balances, outputBalanceBefore: -1n })).toThrow(/u64/);
    expect(() => reconcileSwapBalances({ ...balances, inputBalanceBefore: 1n << 64n })).toThrow(/u64/);
  });
});
