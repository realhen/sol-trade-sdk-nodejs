# Sol Trade SDK: browser instruction builders

Browser adaptation of [0xfnzero/sol-trade-sdk-nodejs](https://github.com/0xfnzero/sol-trade-sdk-nodejs), maintained in [realhen/sol-trade-sdk-nodejs](https://github.com/realhen/sol-trade-sdk-nodejs/tree/feat/browser). Version `0.1.5-browser.1` exposes ESM and TypeScript declarations for browser extensions.

The root entry exports the `pumpfun`, `pumpswap`, `bonk`, `raydiumCpmm`, `raydiumAmmV4`, and `meteoraDammV2` namespaces, plus `calc`, `constants`, and `splToken`. Namespaces avoid collisions between upstream helper names. Unrelated upstream source is retained for future merges, but the package does not export or build `TradingClient`, Node performance helpers, gRPC, native QUIC, relay clients, or signing orchestration. There are no install lifecycle scripts; committed `dist` supports GitHub commit dependencies.

## Cached-account exact-input swap

```ts
import { pumpswap } from "sol-trade-sdk";

const instructions = pumpswap.buildBuyInstructions({
  payer: walletPublicKey,
  inputAmount: 10_000_000n,
  minimumOutputAmount: validatedMinimumOutput,
  slippageBasisPoints: 0n,
  useExactQuoteAmount: true,
  createInputMintAta: false,
  createOutputMintAta: false,
  closeInputMintAta: false,
  protocolParams: {
    ...validatedCachedPool,
    feeRecipient: validatedProtocolFeeRecipient,
    buybackFeeRecipient: validatedBuybackFeeRecipient,
  },
});
```

All amounts are integer atomic token units (`bigint`). `minimumOutputAmount` on Pump and PumpSwap buy/sell builders bypasses the upstream reserve/fee quote calculation and writes the caller's minimum directly to the instruction. Buy overrides require exact-input mode without `fixedOutputAmount`; PumpSwap overrides support pools whose quote mint is WSOL or USDC. `trackVolume` defaults to true on buys. Sell always takes an exact input amount. An invalid unsigned 64-bit wire value throws synchronously.

For Pump use `pumpfun.buildPumpFunBuyInstructions` or `buildPumpFunSellInstructions`. Leave `protocolParams.quoteMint` undefined/default, or use the SOL sentinel, for the legacy native SOL ABI; use WSOL/USDC for the V2 quote-token ABI. Set `inputMint`/`outputMint` to the quote token for V2. Supply the actual cached mint owner as `tokenProgram`. Explicit `feeRecipient` and `buybackFeeRecipient` override upstream random/default selections; callers must validate these against fresh protocol configuration. Omitted recipients retain the upstream fallback behavior.

Builders are synchronous and perform no RPC, signing, or submission. Existing upstream fetch helpers remain available in venue namespaces and only call the caller-supplied connection when explicitly invoked. The caller owns cache freshness, account ownership, balances, current protocol fees, minimum-output calculation, account extensions, ATA creation, WSOL wrapping/unwrapping, compute budgets, blockhashes, lookup tables, simulation, signing, and submission. For deterministic cached-account workflows, disable builder account creation/closure and compose lifecycle instructions explicitly from validated account existence. No network fetch occurs on the swap construction path.

The Pump/PumpSwap browser changes include explicit Buffer imports, supplied fee recipients, minimum-output overrides, official IDL account flags, quote-mint cashback ATAs, honoring supplied Pump token programs, and SPL close-account encoding. Other four venue builders preserve upstream behavior and have not been verified against current live programs. Export availability is not proof of live venue support. Upstream fallback quote arithmetic and fee defaults are retained for compatibility; applications needing current pricing should supply a minimum derived from validated protocol state.

## Build and verify

```sh
npm ci --ignore-scripts
npm run format
npm run format:check
npm run lint
npm run build
npm run verify:browser
```

`verify:browser` bundles the full public entry for a browser target, rejecting Node-only modules in the dependency graph. Build dependencies are locked in `package-lock.json`; `dist/browser.js` and `dist/browser.d.ts` are checked in. Consumer bundlers must support standard `buffer`, `bn.js`, and `@solana/web3.js` browser dependencies. Source modules import Buffer explicitly; no global Buffer shim is required for this package's own code.
