# Sol Trade SDK Node.js Examples

Examples are updated for the current TypeScript SDK API. Protocol examples contain synthetic accounts and are intentionally dry-run only; setting `RUN_LIVE_EXAMPLES=1` makes them fail closed.

## Run

~~~bash
npm install
npx tsx examples/trading_client.ts
~~~

For a live bot, start from [low_latency_bot.ts](low_latency_bot.ts), read [LOW_LATENCY_BOT.md](LOW_LATENCY_BOT.md), and provide real parser, balance, quote, and state-refresh adapters. `PRIVATE_KEY` accepts a base58 64-byte secret key or a JSON array containing 64 bytes.

## Coverage

| Area | Example |
| --- | --- |
| Trading client and low-latency config | [trading_client.ts](trading_client.ts) |
| Parser + streamer guarded bot workflow | [low_latency_bot.ts](low_latency_bot.ts) |
| Shared config across wallets | [shared_infrastructure.ts](shared_infrastructure.ts) |
| PumpFun v2 fee recipient and cashback | [pumpfun_sniper_trading.ts](pumpfun_sniper_trading.ts), [pumpfun_copy_trading.ts](pumpfun_copy_trading.ts) |
| PumpSwap cashback-aware params | [pumpswap_trading.ts](pumpswap_trading.ts), [pumpswap_direct_trading.ts](pumpswap_direct_trading.ts) |
| Bonk / USD1 routing | [bonk_sniper_trading.ts](bonk_sniper_trading.ts), [bonk_copy_trading.ts](bonk_copy_trading.ts) |
| Raydium CPMM / AMM v4 | [raydium_cpmm_trading.ts](raydium_cpmm_trading.ts), [raydium_amm_v4_trading.ts](raydium_amm_v4_trading.ts) |
| Meteora DAMM v2 | [meteora_damm_v2_trading.ts](meteora_damm_v2_trading.ts) |
| Durable nonce | [nonce_cache.ts](nonce_cache.ts) |
| Hot path / zero-RPC preparation | [hot_path_trading.ts](hot_path_trading.ts) |
| Address lookup tables | [address_lookup.ts](address_lookup.ts) |
| Middleware | [middleware_system.ts](middleware_system.ts) |
| WSOL helpers | [wsol_wrapper.ts](wsol_wrapper.ts) |
