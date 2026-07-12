# Low-latency bot guide / 低延迟机器人指南

`low_latency_bot.ts` is an integration boundary, not a mainnet-ready strategy. Adapt decoded `sol-parser-sdk` output to `ParsedPoolEvent`, call `handleParsedEvent` from the `solana-streamer` callback, and implement the balance and state callbacks with your RPC/parser version.

`low_latency_bot.ts` 是集成模板，不是可直接上主网的策略。将 `sol-parser-sdk` 的解码结果转换为 `ParsedPoolEvent`，在 `solana-streamer` 回调中调用 `handleParsedEvent`，并用实际 RPC/解析器实现余额和状态刷新回调。

## Required order / 必须遵守的顺序

1. Reject stale events and events whose mint/pool does not match the configured target.
2. Read the token balance using the mint's actual Token Program (SPL Token or Token-2022).
3. Fetch a current blockhash, build the buy from decoded current pool state, and request confirmation.
4. Do not auto-sell unless the buy is confirmed. Sell only `postBalance - preBalance`; never assume the quote equals the acquired amount.
5. Decode/fetch pool state again and fetch a new blockhash before selling.

对应中文：先过滤过期事件和错误目标；按实际 Token Program 查询余额；买入前取新 blockhash 并使用最新池状态；只有买入确认后才自动卖出；卖出数量必须取余额增量；卖出前再次刷新池状态和 blockhash。

## `min_base_amount_out` and Custom(6040)

`BuySlippageBelowMinBaseAmountOut` means execution produced less base token than the explicit minimum encoded in the transaction. The minimum may have been valid when quoted but stale by the time the transaction landed. Higher bot speed cannot prevent competing swaps from moving reserves.

`BuySlippageBelowMinBaseAmountOut` 表示实际输出少于交易中写入的最低 base token 数量。报价时有效的最低值，在交易落链时可能已经过期；即使机器人延迟很低，其他交易仍可能先改变池储备。

- For ordinary exact-input buys, prefer `BuyAmount.WithMaxInput(...)` or the SDK's slippage-derived output protection when the protocol supports it.
- Set `fixedOutputTokenAmount` only from a fresh protocol-specific quote. Never copy a hardcoded number from an example.
- Keep protection enabled for meaningful-size trades. Removing the minimum avoids 6040 by accepting potentially much worse execution; it does not remove price impact.
- On 6040, refresh state and blockhash, requote, and retry at most a small configured number of times. Stop when the event is stale or the price exceeds the strategy limit.
- `slippageBasisPoints` must be below `10000`; 100% slippage makes the minimum meaningless and is rejected by the SDK.

普通 exact-input 买入优先使用 `BuyAmount.WithMaxInput(...)` 或 SDK 基于滑点计算的保护。只有拿到协议对应的实时 quote 时才设置 `fixedOutputTokenAmount`。遇到 6040 应刷新状态、blockhash 并有限次重新报价，而不是无限重试或直接取消最低输出保护。

## Latency settings / 延迟设置

Keep parsing and target checks in memory, pre-create token accounts for the hot path, bound SWQoS concurrency, and use `waitTxConfirmed: true` when a sell depends on the buy. `waitForAllSubmits` improves diagnostics but adds tail latency. Durable nonce and multi-provider submission must follow the SDK's provider rules; do not reuse a normal blockhash for a later sell.
