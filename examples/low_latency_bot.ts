import { PublicKey } from '@solana/web3.js';
import {
  CONSTANTS,
  DexParamEnum,
  DexType,
  TradeBuyParams,
  TradeSellParams,
  TradeTokenType,
  TradingClient,
} from 'sol-trade-sdk';
import {
  checkedPositionDelta,
  createLiveClient,
  isEventFresh,
  matchesTarget,
  validateTradeIntent,
} from './_shared';

// Adapt sol-parser-sdk output to this small event contract in the
// solana-streamer callback. Do not perform JSON parsing in this hot path.
interface ParsedPoolEvent {
  receivedAtMs: number;
  dexType: DexType;
  mint: PublicKey;
  pool: PublicKey;
  tokenProgram: PublicKey;
  buyState: DexParamEnum;
}

interface LiveAdapters {
  readTokenBalance(owner: PublicKey, mint: PublicKey, tokenProgram: PublicKey): Promise<bigint>;
  refreshSellState(event: ParsedPoolEvent): Promise<DexParamEnum>;
}

const MAX_EVENT_AGE_MS = Number(process.env.MAX_EVENT_AGE_MS ?? 500);
const INPUT_AMOUNT = Number(process.env.INPUT_AMOUNT ?? 100_000);
const SLIPPAGE_BPS = Number(process.env.SLIPPAGE_BPS ?? 300);

export async function handleParsedEvent(
  client: TradingClient,
  adapters: LiveAdapters,
  event: ParsedPoolEvent,
  targetMint?: PublicKey,
  targetPool?: PublicKey
): Promise<void> {
  if (!isEventFresh(event.receivedAtMs, MAX_EVENT_AGE_MS)) return;
  if (!matchesTarget(event.mint, targetMint) || !matchesTarget(event.pool, targetPool)) return;
  validateTradeIntent(INPUT_AMOUNT, SLIPPAGE_BPS);

  const owner = client.getPayer();
  const before = await adapters.readTokenBalance(owner, event.mint, event.tokenProgram);
  const buyBlockhash = await client.getLatestBlockhash();
  const buy: TradeBuyParams = {
    dexType: event.dexType,
    inputTokenType: TradeTokenType.WSOL,
    mint: event.mint,
    inputTokenAmount: INPUT_AMOUNT,
    slippageBasisPoints: SLIPPAGE_BPS,
    recentBlockhash: buyBlockhash.blockhash,
    extensionParams: event.buyState,
    waitTxConfirmed: true,
  };
  const bought = await client.buy(buy);
  if (!bought.success) throw bought.error ?? new Error('buy was not confirmed');

  const after = await adapters.readTokenBalance(owner, event.mint, event.tokenProgram);
  const acquired = checkedPositionDelta(before, after);
  if (acquired > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('position delta exceeds JavaScript safe integer range');

  // Pool reserves and blockhash may have changed while the buy confirmed.
  const sellState = await adapters.refreshSellState(event);
  const sellBlockhash = await client.getLatestBlockhash();
  const sell: TradeSellParams = {
    dexType: event.dexType,
    outputTokenType: TradeTokenType.WSOL,
    mint: event.mint,
    inputTokenAmount: Number(acquired),
    slippageBasisPoints: SLIPPAGE_BPS,
    recentBlockhash: sellBlockhash.blockhash,
    extensionParams: sellState,
    waitTxConfirmed: true,
  };
  const sold = await client.sell(sell);
  if (!sold.success) throw sold.error ?? new Error('sell failed');
}

function main(): void {
  if (require.main !== module) return;
  const client = createLiveClient();
  console.log('Live client ready:', client.getPayer().toBase58());
  console.log('Register handleParsedEvent in your solana-streamer subscription and provide real parser/RPC adapters.');
  console.log('Default token program:', CONSTANTS.TOKEN_PROGRAM.toBase58());
}

main();
