/** Keyless Meteora DAMM v1 swaps, including constant-product and stable/depeg vault math. */
import { Buffer } from 'buffer';
import BN from 'bn.js';
import { type AccountMeta, type AccountInfo, Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { AmmImpl, PROGRAM_ID, StableSwap } from '@meteora-ag/dynamic-amm-sdk';

const VAULT_PROGRAM = new PublicKey('24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi');
export interface PreparedPool {
  readonly pool: PublicKey;
  readonly baseMint: PublicKey;
  readonly quoteMint: PublicKey;
  /** Official SDK state; call prepare again to refresh reserves, vault share prices, clock and depeg accounts. */
  readonly client: AmmImpl;
  readonly remainingAccounts: readonly AccountMeta[];
}
export interface QuoteParams {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amountIn: bigint;
  slippageBps: number;
  /** Optional initiator for pools that allow a whitelisted vault to swap before public activation. */
  owner?: PublicKey;
}
export interface SwapParams extends Omit<QuoteParams, 'slippageBps' | 'owner'> {
  owner: PublicKey;
  inputTokenAccount: PublicKey;
  outputTokenAccount: PublicKey;
  minimumAmountOut: bigint;
}
function u64(value: bigint, name: string, positive = false): void {
  if (typeof value !== 'bigint' || value < (positive ? 1n : 0n) || value > ((1n << 64n) - 1n)) throw new Error(`${name} must be a ${positive ? 'positive ' : ''}u64 bigint`);
}
function direction(p: PreparedPool, a: Pick<QuoteParams, 'inputMint' | 'outputMint' | 'amountIn'>): boolean {
  u64(a.amountIn, 'amountIn', true);
  const forward = a.inputMint.equals(p.baseMint) && a.outputMint.equals(p.quoteMint);
  if (!forward && !(a.inputMint.equals(p.quoteMint) && a.outputMint.equals(p.baseMint))) throw new Error('Mint pair does not match DAMM v1 pool');
  if (!p.client.poolState.enabled) throw new Error('DAMM v1 pool is disabled');
  return forward;
}
/**
 * Older vault/Anchor decoders use Buffer.isBuffer for enum dispatch. A caller can
 * supply a Connection backed by a different Buffer implementation (e.g. native
 * Node buffers versus this browser bundle's polyfill), so normalize RPC data at
 * this boundary. Keep the caller's transport, commitment and middleware intact.
 */
function compatibleAccountBuffers(connection: Connection): Connection {
  const normalize = (account: AccountInfo<Buffer> | null): AccountInfo<Buffer> | null =>
    account && !Buffer.isBuffer(account.data) ? { ...account, data: Buffer.from(account.data) } : account;
  return new Proxy(connection, {
    get(target, property) {
      if (property === 'getAccountInfo') return async (...args: Parameters<Connection['getAccountInfo']>) => normalize(await target.getAccountInfo(...args));
      if (property === 'getAccountInfoAndContext') return async (...args: Parameters<Connection['getAccountInfoAndContext']>) => {
        const response = await target.getAccountInfoAndContext(...args);
        return { ...response, value: normalize(response.value) };
      };
      if (property === 'getMultipleAccountsInfo') return async (...args: Parameters<Connection['getMultipleAccountsInfo']>) => (await target.getMultipleAccountsInfo(...args)).map(normalize);
      if (property === 'getMultipleAccountsInfoAndContext') return async (...args: Parameters<Connection['getMultipleAccountsInfoAndContext']>) => {
        const response = await target.getMultipleAccountsInfoAndContext(...args);
        return { ...response, value: response.value.map(normalize) };
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
/** Fetches pool, dynamic vault and depeg state through the official SDK. No wallet is required. */
export async function prepare(connection: Connection, pool: PublicKey): Promise<PreparedPool> {
  const account = await connection.getAccountInfo(pool, 'confirmed');
  if (!account || !account.owner.equals(new PublicKey(PROGRAM_ID))) throw new Error('Invalid DAMM v1 pool owner');
  // Upstream pins web3 1.98.0; its Connection is runtime compatible with our 1.98.x.
  const client = await AmmImpl.create(compatibleAccountBuffers(connection) as unknown as Parameters<typeof AmmImpl.create>[0], pool);
  const state = client.poolState;
  let remainingAccounts: AccountMeta[] = [];
  if ('stable' in state.curveType && state.curveType.stable) {
    const stable = state.curveType.stable;
    // This method only derives metas; quote math uses the SDK's fetched depeg/clock state.
    remainingAccounts = new StableSwap(stable.amp.toNumber(), stable.tokenMultiplier, stable.depeg, new Map(), new BN(0), state.stake).getRemainingAccounts();
  } else if (!('constantProduct' in state.curveType)) throw new Error('Unsupported DAMM v1 curve');
  return { pool, baseMint: state.tokenAMint, quoteMint: state.tokenBMint, client, remainingAccounts };
}
/**
 * Pure quote over prepared vault and pool state; slippage uses integer basis points.
 * feeAmount includes protocol and LP fees, denominated in the input mint.
 */
export function quote(prepared: PreparedPool, params: QuoteParams) {
  if (!Number.isInteger(params.slippageBps) || params.slippageBps < 0 || params.slippageBps > 10000) throw new Error('slippageBps must be an integer from 0 to 10000');
  direction(prepared, params);
  const result = prepared.client.getSwapQuote(params.inputMint, new BN(params.amountIn.toString()), 0, params.owner);
  const amountOut = BigInt(result.swapOutAmount.toString());
  if (amountOut <= 0n) throw new Error('DAMM v1 quote produces zero output');
  const { tradeFeeNumerator, tradeFeeDenominator } = prepared.client.poolState.fees;
  const feeAmount = params.amountIn * BigInt(tradeFeeNumerator.toString()) / BigInt(tradeFeeDenominator.toString());
  return { amountIn: params.amountIn, amountOut, minimumAmountOut: amountOut * BigInt(10000 - params.slippageBps) / 10000n, feeAmount, liquidityProviderFeeAmount: BigInt(result.fee.toString()) };
}
/** Pure swap instruction. Token-account setup and WSOL funding/cleanup belong to the caller. */
export function buildSwapInstructions(prepared: PreparedPool, params: SwapParams): TransactionInstruction[] {
  const forward = direction(prepared, params);
  u64(params.minimumAmountOut, 'minimumAmountOut');
  const { poolState: state, vaultA, vaultB } = prepared.client;
  const writable = [prepared.pool, params.inputTokenAccount, params.outputTokenAccount, state.aVault, state.bVault, vaultA.vaultState.tokenVault, vaultB.vaultState.tokenVault, vaultA.vaultState.lpMint, vaultB.vaultState.lpMint, state.aVaultLp, state.bVaultLp, forward ? state.protocolTokenAFee : state.protocolTokenBFee];
  const keys: AccountMeta[] = [...writable.map(pubkey => ({ pubkey, isWritable: true, isSigner: false })), { pubkey: params.owner, isWritable: false, isSigner: true }, { pubkey: VAULT_PROGRAM, isWritable: false, isSigner: false }, { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false }, ...prepared.remainingAccounts];
  const data = Buffer.alloc(24);
  data.set([248, 198, 158, 145, 225, 117, 135, 200]);
  data.writeBigUInt64LE(params.amountIn, 8);
  data.writeBigUInt64LE(params.minimumAmountOut, 16);
  return [new TransactionInstruction({ programId: new PublicKey(PROGRAM_ID), keys, data })];
}
