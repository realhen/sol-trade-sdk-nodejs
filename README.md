## Inverse sell sizing in this fork (0.14.0)

`sizeDirectSellForExpectedOutput(market, target, maxInput)` now uses venue inverse
quotes before verifying exact-input output and predecessor amounts. Integer fee
rounding is corrected locally; final transactions remain sealed exact-input swaps.
Sizing, quoting and correction use the prepared snapshot without RPC. Refresh the
snapshot from authoritative streamed dependencies before reusing it.

Pump.fun/PumpSwap, Raydium CPMM/AMM v4/LaunchLab/CLMM, Orca Whirlpool, Meteora
DLMM/DBC and supported DAMM v2 fee modes have inverse paths. DAMM v1 retains forward
search because its vault-share accounting is not covered by its exposed curve
inverse. DAMM v2 rate-limiter configurations also retain forward search. Inverse
failures or unusual rounding fall back to the forward quote, which remains the
source of executable amounts and validation errors.

`npm run benchmark:sell-sizing -- BEFORE_MODULE AFTER_MODULE [VENUE]` compares two
independently bundled direct modules against captured accounts (100 samples after
20 warmups, alternating order). Optional `planSellBatch` exports also measure a
three-wallet preset at 50% slippage, including a fresh-snapshot scenario. Preparation
is outside the timing, warmed RPC is forbidden, and output/amount parity is checked.
Results describe local CPU work, not signing, submission or mainnet landing.

## Direct non-SOL pairs in this fork (0.5.0)

The legacy CPMM, AMM v4, DAMM v2, PumpSwap and LaunchLab builders now accept explicit pool mint pairs. A requested input or output identifies the direction; the omitted side is inferred from the supplied pool. Mismatched pairs fail before instruction construction. PumpSwap chooses its on-chain buy/sell instruction from the pool's base/quote orientation, independently of the application's buy/sell label. The five prepared venue adapters below already accept arbitrary pool pairs.

For the root `TradingClient` API, `payWith`, `receiveAs`, `inputTokenType` and `outputTokenType` accept either the existing `TradeTokenType` enum or an explicit `PublicKey`. The client forwards both requested mints to each builder. Existing high-level amount fields use numbers; use the keyless builders for bigint input amounts outside JavaScript's exact integer range.

```ts
import { raydiumCpmm } from 'sol-trade-sdk/browser';

const instructions = raydiumCpmm.buildRaydiumCpmmBuyInstructions({
  payer: walletPublicKey,
  inputMint: quoteMint,
  outputMint: tokenMint,
  inputAmount: 1_000_000n,
  minimumOutputAmount: validatedQuote.minimumOutputAmount,
  protocolParams: preparedPool,
  createInputMintAta: false,
  createOutputMintAta: true,
});
```

`minimumOutputAmount` is an exact-input floor in output atomic units, already adjusted for slippage. It is mutually exclusive with `fixedOutputAmount`. The latter retains its existing protocol-specific meaning: CPMM/AMM v4 exact-output mode, PumpSwap buy mode, or the legacy LaunchLab/DAMM v2 output floor. DAMM v2 still permits partial fills, so consumers must reconcile actual debits and credits. Caller-supplied floors require current quotes and applicable transfer fees.

LaunchLab parameters carry `baseMint`, `quoteMint`, `quoteTokenProgram` and the quote-specific global configuration. Custom configurations require explicit account identities and an output floor; the SDK does not reuse SOL fee assumptions for them. `BonkParams.fromMintByRpc(connection, mint, quoteMint)` and `fromPoolByRpc(connection, pool)` load the exact pair and derive creator/platform accounts with its quote mint. The older boolean USD1 selector remains available. Pump curve RPC loading preserves the on-chain quote mint as well.

Compatibility boundaries:

- AMM v4 accepts classic SPL tokens only. LaunchLab and Pump quote assets currently require the classic token program. Token-2022 program selection alone does not establish support for every mint extension.
- PumpSwap calls without either requested mint retain the old single-SOL/USDC-side inference; token/token and SOL/USDC pairs require explicit direction. Reverse application sells that spend the pool quote now default to exact-input buys, including the protocol volume flag.
- These are direct swaps. The wallet must hold the selected input asset. This release does not discover funding routes, convert SOL automatically, forward intermediate balance deltas, or integrate the extension's token-page execution and settlement. It does not claim complete Axiom coverage.

Run `npm run test:non-sol:surfpool` against a dedicated loopback Surfpool after building. It checks both directions of a real token/token CPMM pool (including transfer-fee tokens) and a real MET/USDC DAMM v2 pool, actual net balances, existing ATA setup, and venue-specific excessive-slippage rejection. It uses synthetic local wallets and never submits to mainnet. These two pools are execution evidence, not an exhaustive market or mint-extension matrix.

## Additional venue adapters in this fork (0.4.0)

Raydium CLMM, Orca Whirlpool, Meteora DLMM, Meteora Dynamic Bonding Curve (DBC), and Meteora DAMM v1 now have keyless exact-input adapters. Both swap directions use official venue math; DLMM wraps the pinned SDK's exported bin and fee functions to accept chain time explicitly. DAMM v1 includes constant-product and stable/depeg math. These APIs are separate from the legacy `TradingClient.buy/sell` facade.

```ts
// Node (ESM or require); also available as `venues` from the root entrypoint:
import { raydiumClmm, prepareTokenAccounts } from 'sol-trade-sdk/venues';
// Browser/extension: import the same names from 'sol-trade-sdk/venues/browser'.

const state = await raydiumClmm.prepare(connection, poolAddress); // explicit RPC phase
const quote = raydiumClmm.quote(state, inputMint, 100_000n, 100); // 1% slippage
const accounts = prepareTokenAccounts({
  owner: walletPublicKey, inputMint, outputMint: quote.outputMint,
  inputTokenProgram, outputTokenProgram, amountIn: quote.amountIn,
  // Optional and explicit for native SOL pairs:
  // wrapNativeInput: true, unwrapNativeOutput: true,
});
const swap = raydiumClmm.buildSwapInstruction(state, quote, {
  payer: walletPublicKey,
  inputTokenAccount: accounts.inputTokenAccount,
  outputTokenAccount: accounts.outputTokenAccount,
});
const instructions = [...accounts.setupInstructions, swap, ...accounts.cleanupInstructions];
// Feed instructions into buildSwapTransaction / compileTransaction from sol-trade-sdk/browser.
// The application owns blockhash/nonce, optional lookup tables, signing and submission.
```

All raw amounts are `bigint`; slippage is an integer number of basis points from 0 through 10,000. Setting 10,000 explicitly removes the minimum-output protection. ATA preparation handles each mint's token program and wraps SOL without converting through floating-point numbers. `unwrapNativeOutput` closes the output WSOL ATA and returns its **entire existing balance** to the owner; it is off by default. The swap builders themselves never create, fund, or close token accounts.

| Namespace | Quote API | Instruction API |
| --- | --- | --- |
| `raydiumClmm`, `orcaWhirlpool` | `quote(state, inputMint, amountIn, slippageBps)` | `buildSwapInstruction(state, quote, { payer, inputTokenAccount, outputTokenAccount })` |
| `meteoraDlmm` | `quote(state, inputMint, amountIn, slippageBps)` | `await buildSwapInstructions(state, { quote, owner, inputTokenAccount, outputTokenAccount, minimumAmountOut: quote.minimumAmountOut })` |
| `meteoraDbc`, `meteoraDammV1` | `quote(state, { inputMint, outputMint, amountIn, slippageBps })` | `buildSwapInstructions(state, { owner, inputMint, outputMint, inputTokenAccount, outputTokenAccount, amountIn, minimumAmountOut })` |

Each namespace exposes `prepare(connection, poolAddress)`. Preparation reads pool, mint, fee, clock and liquidity accounts. Quote and instruction construction make no RPC calls; DLMM's async instruction builder uses its local Anchor coder only. No adapter signs, broadcasts, or silently refreshes state. Refresh preparation before reusing stale data, or replace the exposed official parsed state from authoritative account subscriptions. `meteoraDlmm.prepareFromSnapshot` accepts cached SDK pool/bin-array state. Caller-supplied snapshots must be trusted and internally consistent; preparation is not an atomic multi-account snapshot.

Quotes fail when prepared liquidity cannot consume the complete input. This is a quote-time check: Orca exact-input execution can still partially fill if it reaches its price limit, provided the actual output satisfies the minimum. Its quote metadata explicitly distinguishes a full quoted fill from that execution possibility. CLMM keeps a zero sqrt-price limit, which makes its program enforce full input consumption. Raydium and Orca expose `expectedAmountOut`; Meteora adapters expose `amountOut`. These are raw user-received token amounts, including supported transfer fees. Fee denominations are documented on each quote type. Limited tick/bin coverage can require a fresh/wider snapshot; DLMM preparation accepts `binArraysPerDirection` (default four). No aggregator or SOL-to-USDC intermediary route is inserted.

`meteoraDlmm.quote` defaults to `state.chainTime` (timestamp and epoch from the chain Clock), independent of the computer clock. Its optional fifth argument, `{ chainTime: { unixTimestampSeconds, epoch } }`, projects fees on cached state; it does not refresh liquidity or mint configuration. Use `meteoraDlmm.validateSnapshotFreshness(state, { currentUnixTimestampSeconds, maxAgeSeconds, maxFutureSkewSeconds })` with a trusted reference before execution. Quotes reject clocks preceding their snapshot or volatility update; later clocks require an explicit epoch. Offline quotes do not expire implicitly.

`reconcileSwapBalances` derives actual gross input spent, net output received, unspent input and `fullyFilled` from caller-supplied raw before/after balances. The caller must establish successful execution and isolate the swap from other balance changes. Account creation, wrapping, closing WSOL and unrelated transfers cannot be mistaken for swap debits/credits. Settlement must use observed amounts, never the quoted output or requested input.

Token features have explicit boundaries: DBC accepts classic SPL and metadata-only Token-2022 mints; DLMM also accepts transfer-fee mints but rejects transfer hooks and permissioned/disabled pools. Orca accepts caller-prepared transfer-hook account metas and uses official transfer-fee/adaptive-fee calculations. Raydium uses official Token-2022 transfer-fee math. CLMM and Orca validate full mint TLV data at prepare, quote and build: unknown or incompatible extensions fail closed. Passive authority, metadata and UI extensions remain compatible with ordinary public transfers in raw units; paused mints and default-frozen accounts are rejected. A disabled hook is distinct from an enabled hook requiring extra accounts. Unsupported mints/pool modes can still be rejected by the deployed program; successful fixtures do not imply every token extension combination is supported.

`sol-trade-sdk/venues/browser` is a separate, fully bundled entrypoint (minified, with a source map) with lexical Buffer/process shims. It does not install globals or add the venue dependencies to the existing `sol-trade-sdk/browser` entrypoint. The package smoke test loads it with string code generation disabled and no Node globals. Node uses the official dependencies, with DLMM/Anchor bundled where needed to repair upstream ESM resolution.

Validation commands:

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm run test:venues:package
# Requires Rust/Cargo; see scripts/rust-parity/README.md for first-time dependency setup.
npm run test:rust-parity
# Start a separate Surfpool backed by your mainnet RPC on 127.0.0.1:8999, then:
npm run test:venues:surfpool
VENUES_BROWSER=1 npm run test:venues:surfpool
npm run test:venues:stale
VENUES_BROWSER=1 npm run test:venues:stale
# Run local mutation scenarios serially on a dedicated instance:
npm run test:venues:transfer-fees
VENUES_BROWSER=1 npm run test:venues:transfer-fees
npm run test:venues:partial
VENUES_BROWSER=1 npm run test:venues:partial
```

The local execution test verifies the server identifies as Surfpool and requires a loopback address. It uses generated test wallets and local balance cheatcodes, executes both directions on seven public pools (five venues, including DAMM v1 stable and Marinade depeg curves), verifies observed input and minimum output, and simulates deliberately excessive output floors. The stale-quote test executes a competing Orca swap, verifies the old quote fails specifically at its output floor, then verifies a refreshed quote succeeds. The transfer-fee scenario temporarily adds a synthetic fee configuration to local mint/vault clones, executes both fee-input and fee-output directions, checks withheld fees and net credits, then restores public account bytes. That scenario does not claim the real public mint charges a fee. The partial-fill scenario uses an explicit test price limit on a locally cloned Orca pool to verify actual spent/received accounting. Run mutation scenarios serially on a dedicated Surfpool instance. These tests never use a real wallet. Public-state fixtures make ordinary tests independent of RPC availability. Local fork execution is not a funded-mainnet test.

The executable Rust differential compiles attributed upstream builder excerpts from commit `0ba9ec5a652bdb351323252771fec33ea1fb2f80` and compares program IDs, every account/flag and encoded bytes against the built Node adapters. It covers CLMM, Whirlpool and DLMM instruction construction; that upstream revision has no DBC or DAMM v1 builder and these Rust builders do not provide comparable quote engines. CLMM's deliberate zero-limit execution policy is checked separately from Rust's high-level nonzero default.

The pinned official SDK dependency graph retains upstream security advisories (including `bigint-buffer` and Anchor's TOML loader). Compatible dependency patches are recorded in this repository's overrides; npm does not apply dependency-package overrides in a consuming application, so consumers should review/mirror them in their own lockfile. No incompatible `npm audit fix --force` downgrades are applied.
## Version 1 browser transactions (0.4.0)

Pass `version: 1` to `buildSwapTransaction` or use `compileV1Transaction` for v1 transactions with explicit compute and loaded-account-data limits. `TransactionV1` encodes, signs and validates canonical wire bytes through Solana Kit 8.3.0. It enforces the 4,096-byte envelope, 12-signature, 64-account and 64-instruction limits. V1 expands account addresses rather than using lookup tables. Prepared sender variants preserve the transaction version and resource configuration, changing only the configured tip.

`upgradeTransactionToV1` converts unsigned legacy/v0 transactions using caller-supplied lookup tables. Existing signatures are rejected. Compute-budget instructions become v1 configuration; a positive legacy compute-unit price requires an explicit compute-unit limit to preserve the total priority fee. Existing SDK callers retain the v0 default for compatibility; applications can require v1 at their signing and submission boundaries. Use Surfpool 1.5 or newer for local v1 validation.

## Browser HTTP support in this fork (0.2.0)

Import `sol-trade-sdk/browser` for instruction builders, shared transaction assembly, provider HTTP clients, and prepared multi-sender submission. Native gRPC/QUIC implementations and their dependencies have been removed. Temporal, BlockRazor, and Astralane default to HTTP; native transport requests and native-only providers fail explicitly.

The browser flow is `buildSwapTransaction` → `prepareTransactionVariants` → caller signing and durable signature journaling → `sendPreparedTransactions`. Configure an untipped RPC route first. Multiple routes require a durable nonce with the payer as authority; route variants may add only their configured tip. Use `assertSenderVariants` at the trusted submission boundary. Callers own wallet access, account freshness, nonce reservation, persistence, and WebSocket confirmation. The prepared send API submits exact signed bytes once per route, without retrying, rebuilding, or polling for confirmation. HTTP acceptance does not establish on-chain success.

The root entrypoint retains legacy Node-oriented orchestration/performance APIs. Browser callers should use the dedicated browser export. Legacy callers that request polling confirmation must migrate to caller-owned streams if they require streaming-only behavior.

<div align="center">
    <h1>🚀 Sol Trade SDK for Node.js</h1>
    <h3><em>A comprehensive TypeScript SDK for seamless Solana DEX trading</em></h3>
</div>

<p align="center">
    <strong>A high-performance TypeScript SDK for low-latency Solana DEX trading bots. Built for speed and efficiency, it enables seamless, high-throughput interaction with PumpFun, Pump AMM (PumpSwap), Bonk, Meteora DAMM v2, Raydium AMM v4, and Raydium CPMM for latency-critical trading strategies.</strong>
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/sol-trade-sdk">
        <img src="https://img.shields.io/npm/v/sol-trade-sdk.svg" alt="npm">
    </a>
    <a href="https://www.npmjs.com/package/sol-trade-sdk">
        <img src="https://img.shields.io/node/v/sol-trade-sdk.svg" alt="Node Version">
    </a>
    <a href="LICENSE">
        <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
    </a>
</p>

<p align="center">
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white" alt="Solana">
    <img src="https://img.shields.io/badge/DEX-4B8BBE?style=for-the-badge&logo=bitcoin&logoColor=white" alt="DEX Trading">
</p>

<p align="center">
    <a href="https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/README_CN.md">中文</a> |
    <a href="https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/README.md">English</a> |
    <a href="https://fnzero.dev/">Website</a> |
    <a href="https://t.me/fnzero_group">Telegram</a> |
    <a href="https://discord.gg/vuazbGkqQE">Discord</a>
</p>

## 📋 Table of Contents

- [✨ Features](#-features)
- [📦 Installation](#-installation)
- [🛠️ Usage Examples](#️-usage-examples)
  - [📋 Example Usage](#-example-usage)
  - [⚡ Trading Parameters](#-trading-parameters)
  - [📊 Usage Examples Summary Table](#-usage-examples-summary-table)
  - [⚙️ SWQoS Service Configuration](#️-swqos-service-configuration)
  - [🔧 Middleware System](#-middleware-system)
  - [🔍 Address Lookup Tables](#-address-lookup-tables)
  - [🔍 Nonce Cache](#-nonce-cache)
- [💰 Cashback Support (PumpFun / PumpSwap)](#-cashback-support-pumpfun--pumpswap)
- [🛡️ MEV Protection Services](#️-mev-protection-services)
- [📁 Project Structure](#-project-structure)
- [📄 License](#-license)
- [💬 Contact](#-contact)
- [⚠️ Important Notes](#️-important-notes)

---

## 📦 SDK Versions

This SDK is available in multiple languages:

| Language | Repository | Description |
|----------|------------|-------------|
| **Rust** | [sol-trade-sdk](https://github.com/0xfnzero/sol-trade-sdk) | Ultra-low latency with zero-copy optimization |
| **Node.js** | [sol-trade-sdk-nodejs](https://github.com/0xfnzero/sol-trade-sdk-nodejs) | TypeScript/JavaScript for Node.js |
| **Python** | [sol-trade-sdk-python](https://github.com/0xfnzero/sol-trade-sdk-python) | Async/await native support |
| **Go** | [sol-trade-sdk-golang](https://github.com/0xfnzero/sol-trade-sdk-golang) | Concurrent-safe with goroutine support |

## What This SDK Is For

`sol-trade-sdk-nodejs` brings the FnZero Solana trading SDK to TypeScript and Node.js. It is built for JavaScript/TypeScript trading bots, copy-trading services, sniper bots, backend automation, and DEX integrations that need low-latency transaction construction with Rust SDK behavior parity.

| Area | Coverage |
|------|----------|
| DEX protocols | PumpFun, PumpSwap, Bonk, Meteora DAMM v2, Raydium AMM v4, Raydium CPMM |
| Submit lanes | Default Solana RPC plus Jito, ZeroSlot, Temporal, Bloxroute, FlashBlock, BlockRazor, Node1, Astralane, Stellium, Lightspeed, Soyas, Speedlanding, Helius, and Solami; NextBlock remains Rust-blacklisted by default |
| Trading workflows | `buySimple` / `sellSimple`, legacy buy/sell params, copy trading, sniper trading, address lookup tables, durable nonce, middleware, shared infrastructure |
| Runtime | Node.js 18+, TypeScript, npm/yarn/pnpm projects |

## 🔖 Current Release

**npm package:** `sol-trade-sdk@0.1.5`

This release refreshes PumpFun V2 and USDC quote-pool handling, keeps the default RPC submit lane active alongside SWQoS lanes, and aligns Raydium CPMM fixed-output swaps with the on-chain `swap_base_out` instruction. Trade execution requires a caller-supplied `recentBlockhash` or durable nonce; hot-path execution does not query RPC for blockhash, account, or balance data.

## Rust v4.0.21 Parity

This SDK now tracks the Rust SDK `v4.0.21` public behavior for high-level trade intent APIs and SWQoS provider coverage. New code can use `buySimple` / `sellSimple` with `AccountPolicy`, `BuyAmount`, and `SellAmount`; these convert to the existing `buy` / `sell` params without removing the legacy API. SWQoS coverage includes the Rust `Solami` type and defaults (`beam.solami.dev:11000`, min tip `0.0001 SOL`); live Solami submit uses the main QUIC client path and requires the same base58 Solana keypair api token model as Rust. Explicit SWQoS routes still keep the default RPC lane appended. NextBlock is still filtered by the Rust parity blacklist unless Rust changes that behavior. Legacy extended provider classes such as `Triton`, `QuickNode`, `Syndica`, `Figment`, and `Alchemy` are kept only for source compatibility and are not part of Rust `v4.0.21` trading provider parity.

## ✨ Features

1. **PumpFun Trading**: Unified `buy`, `sell`, and `buy_exact_quote_in` flow with automatic legacy or V2 instruction selection for SOL and USDC quote pools
2. **PumpSwap Trading**: Support for PumpSwap pool trading operations
3. **Bonk Trading**: Support for Bonk trading operations
4. **Raydium CPMM Trading**: Support for Raydium CPMM (Concentrated Pool Market Maker) trading operations
5. **Raydium AMM V4 Trading**: Support for Raydium AMM V4 (Automated Market Maker) trading operations
6. **Meteora DAMM V2 Trading**: Support for Meteora DAMM V2 (Dynamic AMM) trading operations
7. **Multiple MEV Protection**: Support for the Rust v4.0.21 SWQoS set, including Jito, ZeroSlot, Temporal, Bloxroute, FlashBlock, BlockRazor, Node1, Astralane, Stellium, Lightspeed, Soyas, Speedlanding, Helius, Solami, and Default RPC
8. **Concurrent Trading**: Submit through every configured SWQoS provider plus the default RPC lane; the first accepted result can return early while slower routes continue submitting
9. **Unified Trading Interface**: Use unified trading protocol types for trading operations, including Rust-parity `buySimple` / `sellSimple` intent params
10. **Middleware System**: Support for custom instruction middleware to modify, add, or remove instructions before transaction execution
11. **Shared Infrastructure**: Share expensive RPC and SWQoS clients across multiple wallets for reduced resource usage
12. **Hot-Path RPC Boundary**: Trade execution uses caller-supplied blockhash or durable nonce and never queries RPC for blockhash, account, or balance data

## 📦 Installation

### Direct Clone (Recommended)

Clone this project to your project directory:

```bash
cd your_project_root_directory
git clone https://github.com/0xfnzero/sol-trade-sdk-nodejs
```

Install dependencies and build:

```bash
cd sol-trade-sdk-nodejs
npm install
npm run build
```

Add to your `package.json`:

```json
{
  "dependencies": {
    "sol-trade-sdk": "./sol-trade-sdk-nodejs"
  }
}
```

### Use NPM

```bash
npm install sol-trade-sdk@0.1.5
# or
yarn add sol-trade-sdk@0.1.5
# or
pnpm add sol-trade-sdk@0.1.5
```

## 🛠️ Usage Examples

### 📋 Example Usage

For the high-level intent API, see [Simple Trading](examples/simple_trading.ts). It shows `createSimpleBuyParams`, `BuyAmount.WithMaxInput`, `AccountPolicy.Auto`, and the conversion to legacy `TradeBuyParams`.

#### 1. Create TradingClient Instance

You can refer to [Example: Create TradingClient Instance](examples/trading_client.ts).

**Method 1: Simple (single wallet)**
```typescript
import { TradingClient, TradeConfig, SwqosConfig, SwqosRegion } from 'sol-trade-sdk';

// Wallet
const payer = Keypair.fromSecretKey(/* your keypair */);

// RPC URL
const rpcUrl = "https://mainnet.helius-rpc.com/?api-key=xxxxxx";

// Multiple SWQoS services can be configured
const swqosConfigs: SwqosConfig[] = [
  { type: 'Default', rpcUrl },
  { type: 'Jito', uuid: "your_uuid", region: SwqosRegion.Frankfurt },
  { type: 'Bloxroute', apiToken: "your_api_token", region: SwqosRegion.Frankfurt },
  { type: 'Astralane', apiKey: "your_api_key", region: SwqosRegion.Frankfurt },
];

// Create TradeConfig instance
const tradeConfig = new TradeConfig(rpcUrl, swqosConfigs);

// Create TradingClient
const client = new TradingClient(payer, tradeConfig);
```

Temporal uses HTTP/3 QUIC first and Binary Batch HTTP as its default fallback. BlockRazor uses gRPC `SendBinaryTransaction` first and JSON HTTP as fallback. Astralane uses persistent QUIC first and Binary HTTP as fallback. Explicit transport settings force one protocol; a custom URL without a transport remains an explicit HTTP route.

**Method 2: Shared infrastructure (multiple wallets)**

For multi-wallet scenarios, create the infrastructure once and share it across wallets.
See [Example: Shared Infrastructure](examples/shared_infrastructure.ts).

```typescript
import { TradingInfrastructure, InfrastructureConfig } from 'sol-trade-sdk';

// Create infrastructure once (expensive)
const infraConfig = new InfrastructureConfig(rpcUrl, swqosConfigs);
const infrastructure = new TradingInfrastructure(infraConfig);

// Create multiple clients sharing the same infrastructure (fast)
const client1 = TradingClient.fromInfrastructure(payer1, infrastructure);
const client2 = TradingClient.fromInfrastructure(payer2, infrastructure);
```

#### 2. Configure Gas Fee Strategy

```typescript
import { GasFeeStrategy } from 'sol-trade-sdk';

// Create GasFeeStrategy instance
const gasFeeStrategy = new GasFeeStrategy();
// Set global strategy
gasFeeStrategy.setGlobalFeeStrategy(150000, 150000, 500000, 500000, 0.001, 0.001);
```

#### 3. Build Trading Parameters

```typescript
import {
  AccountPolicy,
  BuyAmount,
  DexType,
  TradeTokenType,
  createSimpleBuyParams,
  simpleBuyParamsToTradeBuyParams,
  withSimpleBuyAccountPolicy,
  withSimpleBuySlippage,
} from 'sol-trade-sdk';

const simple = withSimpleBuyAccountPolicy(
  withSimpleBuySlippage(
    createSimpleBuyParams(
      DexType.PumpSwap,
      TradeTokenType.WSOL,
      mintPubkey,
      BuyAmount.WithMaxInput(buySolAmount),
      { type: 'PumpSwap', params: pumpSwapParams },
      recentBlockhash,
      gasFeeStrategy
    ),
    500
  ),
  AccountPolicy.Auto
);

const buyParams = simpleBuyParamsToTradeBuyParams(simple);
```

#### 4. Execute Trading

```typescript
const result = await client.buy(buyParams);
console.log(`Transaction signature: ${result.signature}`);
```

### ⚡ Trading Parameters

For comprehensive information about all trading parameters including `TradeBuyParams` and `TradeSellParams`, see the Trading Parameters documentation.

#### About ShredStream

When using shred to subscribe to events, due to the nature of shreds, you cannot get complete information about transaction events.
Please ensure that the parameters your trading logic depends on are available in shreds when using them.

### 📊 Usage Examples Summary Table

| Description | Run Command | Source Code |
|-------------|-------------|-------------|
| Create and configure TradingClient instance | `npx ts-node examples/trading_client.ts` | [examples/trading_client.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/trading_client.ts) |
| Share infrastructure across multiple wallets | `npx ts-node examples/shared_infrastructure.ts` | [examples/shared_infrastructure.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/shared_infrastructure.ts) |
| PumpFun token sniping trading | `npx ts-node examples/pumpfun_sniper_trading.ts` | [examples/pumpfun_sniper_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/pumpfun_sniper_trading.ts) |
| PumpFun token copy trading | `npx ts-node examples/pumpfun_copy_trading.ts` | [examples/pumpfun_copy_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/pumpfun_copy_trading.ts) |
| PumpSwap trading operations | `npx ts-node examples/pumpswap_trading.ts` | [examples/pumpswap_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/pumpswap_trading.ts) |
| PumpSwap direct trading (via RPC) | `npx ts-node examples/pumpswap_direct_trading.ts` | [examples/pumpswap_direct_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/pumpswap_direct_trading.ts) |
| Raydium CPMM trading operations | `npx ts-node examples/raydium_cpmm_trading.ts` | [examples/raydium_cpmm_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/raydium_cpmm_trading.ts) |
| Raydium AMM V4 trading operations | `npx ts-node examples/raydium_amm_v4_trading.ts` | [examples/raydium_amm_v4_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/raydium_amm_v4_trading.ts) |
| Meteora DAMM V2 trading operations | `npx ts-node examples/meteora_damm_v2_trading.ts` | [examples/meteora_damm_v2_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/meteora_damm_v2_trading.ts) |
| Bonk token sniping trading | `npx ts-node examples/bonk_sniper_trading.ts` | [examples/bonk_sniper_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/bonk_sniper_trading.ts) |
| Bonk token copy trading | `npx ts-node examples/bonk_copy_trading.ts` | [examples/bonk_copy_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/bonk_copy_trading.ts) |
| Custom instruction middleware example | `npx ts-node examples/middleware_system.ts` | [examples/middleware_system.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/middleware_system.ts) |
| Address lookup table example | `npx ts-node examples/address_lookup.ts` | [examples/address_lookup.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/address_lookup.ts) |
| Nonce cache (durable nonce) example | `npx ts-node examples/nonce_cache.ts` | [examples/nonce_cache.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/nonce_cache.ts) |
| Wrap/unwrap SOL to/from WSOL example | `npx ts-node examples/wsol_wrapper.ts` | [examples/wsol_wrapper.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/wsol_wrapper.ts) |
| Seed trading example | `npx ts-node examples/seed_trading.ts` | [examples/seed_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/seed_trading.ts) |
| Gas fee strategy example | `npx ts-node examples/gas_fee_strategy.ts` | [examples/gas_fee_strategy.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/gas_fee_strategy.ts) |
| Hot path trading (zero-RPC) | `npx ts-node examples/hot_path_trading.ts` | [examples/hot_path_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/hot_path_trading.ts) |

### ⚙️ SWQoS Service Configuration

When configuring SWQoS services, note the different parameter requirements for each service:

- **Jito**: The first parameter is UUID (if no UUID, pass an empty string `""`)
- **Other MEV services**: The first parameter is the API Token

#### Custom URL Support

Each SWQoS service supports an optional custom URL parameter:

```typescript
// Using custom URL
const jitoConfig: SwqosConfig = {
  type: 'Jito',
  uuid: "your_uuid",
  region: SwqosRegion.Frankfurt,
  customUrl: "https://custom-jito-endpoint.com"
};

// Using default regional endpoint
const bloxrouteConfig: SwqosConfig = {
  type: 'Bloxroute',
  apiToken: "your_api_token",
  region: SwqosRegion.NewYork
};
```

**URL Priority Logic**:
- If a custom URL is provided, it will be used instead of the regional endpoint
- If no custom URL is provided, the system will use the default endpoint for the specified region
- This allows for maximum flexibility while maintaining backward compatibility

When using multiple MEV services, you need to use `Durable Nonce`. You need to use the `fetchNonceInfo` function to get the latest `nonce` value, and use it as the `durableNonce` when trading.

---

### 🔧 Middleware System

The SDK provides a powerful middleware system that allows you to modify, add, or remove instructions before transaction execution. Middleware executes in the order they are added:

```typescript
import { MiddlewareManager, ValidationMiddleware, TimerMiddleware } from 'sol-trade-sdk';

const manager = new MiddlewareManager()
  .addMiddleware(new FirstMiddleware())   // Executes first
  .addMiddleware(new SecondMiddleware())  // Executes second
  .addMiddleware(new ThirdMiddleware());  // Executes last
```

### 🔍 Address Lookup Tables

Address Lookup Tables (ALT) allow you to optimize transaction size and reduce fees by storing frequently used addresses in a compact table format.

```typescript
import { fetchAddressLookupTableAccount, AddressLookupTableCache } from 'sol-trade-sdk';

// Fetch ALT from chain
const alt = await fetchAddressLookupTableAccount(rpc, altAddress);
console.log(`ALT contains ${alt.addresses.length} addresses`);

// Use cache for performance
const cache = new AddressLookupTableCache(rpc);
await cache.prefetch([altAddress1, altAddress2, altAddress3]);
const cached = cache.get(altAddress1);
```

### 🔍 Durable Nonce

Use Durable Nonce to implement transaction replay protection and optimize transaction processing.

```typescript
import { fetchNonceInfo, NonceCache } from 'sol-trade-sdk';

// Fetch nonce info
const nonceInfo = await fetchNonceInfo(rpc, nonceAccount);
```

## 💰 Cashback Support (PumpFun / PumpSwap)

PumpFun and PumpSwap support **cashback** for eligible tokens: part of the trading fee can be returned to the user. The SDK **must know** whether the token has cashback enabled so that buy/sell instructions include the correct accounts.

- **When params come from RPC**: If you use `PumpFunParams.fromMintByRpc` or `PumpSwapParams.fromPoolAddressByRpc`, the SDK reads `isCashbackCoin` from chain—no extra step.
- **When params come from decoded events**: If you build params from already-decoded trade events (for example from a parser service), you **must** pass the cashback flag into the SDK:
  - **PumpFun**: Set `isCashbackCoin` when building params from decoded events.
  - **PumpSwap**: Set `isCashbackCoin` field when constructing params manually.

## 🛡️ MEV Protection Services

You can apply for a key through the official website: [Community Website](https://fnzero.dev/swqos)

- **Jito**: High-performance block space
- **ZeroSlot**: Zero-latency transactions
- **Temporal**: Time-sensitive transactions
- **Bloxroute**: Blockchain network acceleration
- **FlashBlock**: High-speed transaction execution with API key authentication
- **BlockRazor**: High-speed transaction execution with API key authentication
- **Node1**: High-speed transaction execution with API key authentication
- **Astralane**: Blockchain network acceleration

## 📁 Project Structure

```
src/
├── common/           # Common functionality and tools
├── constants/        # Constant definitions
├── instruction/      # Instruction building
│   └── utils/        # Instruction utilities
├── swqos/            # MEV service clients
├── trading/          # Unified trading engine
│   ├── common/       # Common trading tools
│   ├── core/         # Core trading engine
│   ├── middleware/   # Middleware system
│   └── factory.ts    # Trading factory
├── utils/            # Utility functions
│   ├── calc/         # Amount calculation utilities
│   └── price/        # Price calculation utilities
└── index.ts          # Main library file
```

## 📄 License

MIT License

## 💬 Contact

- Official Website: https://fnzero.dev/
- Project Repository: https://github.com/0xfnzero/sol-trade-sdk-nodejs
- Telegram Group: https://t.me/fnzero_group
- Discord: https://discord.gg/vuazbGkqQE

## ⚠️ Important Notes

1. Test thoroughly before using on mainnet
2. Properly configure private keys and API tokens
3. Pay attention to slippage settings to avoid transaction failures
4. Monitor balances and transaction fees
5. Comply with relevant laws and regulations

## Browser instruction builders

Bundler-based browser applications can import `sol-trade-sdk/browser` to construct
instructions without loading the SDK's Node RPC, signing, or transport workflows.
The existing package root and Node subpaths remain available. The browser entry
includes explicit `buffer` imports; applications do not need to set a global Buffer.

```ts
import { PublicKey } from '@solana/web3.js';
import { pumpfun } from 'sol-trade-sdk/browser';

// Obtain and validate these account snapshots in your application.
function buildBuy(
  payer: PublicKey,
  mint: PublicKey,
  protocolParams: pumpfun.PumpFunParams,
) {
  return pumpfun.buildPumpFunBuyInstructions({
    payer,
    outputMint: mint,
    inputAmount: 10_000_000n, // lamports
    slippageBasisPoints: 100n,
    protocolParams,
  });
}
```

Callers own snapshot freshness, account validation, transaction assembly, signing,
and submission. Build both entrypoints with `npm run build`, or only the browser
entrypoint with `npm run build:browser`. The browser output is ESM for a bundler;
it is not a standalone script for direct inclusion in a page.

Strict TypeScript consumers need the Node type declarations used by
`@solana/web3.js` (for example, `@types/node`). These are compile-time types;
the browser runtime does not require a global `process` or `Buffer`.


### Browser provider settings

`sol-trade-sdk/swqos-settings` exposes transport-free HTTP provider metadata and tip-address validation for settings pages. `HttpSenderRoute.apiKey` is forwarded to each provider's own HTTP client; keys must stay in trusted caller storage. Prepared submission supports up to 64 routes including the untipped default RPC. Every multi-route submission still requires matching same-nonce transaction variants and caller-owned signatures. Native-only and blacklisted providers are excluded from the settings catalog.

The browser submission workflow tests all 11 supported HTTP providers concurrently against loopback fixtures, including v1 signatures, provider-specific authentication, query preservation and normalized endpoint paths. These fixtures do not establish production provider availability or transaction landing rates. The 0slot HTTPS default follows its [official endpoint documentation](https://0slot.trade/docs.php); providers whose bundled defaults are HTTP-only require callers to supply an HTTPS endpoint in browser settings.

### Jupiter multi-hop routes

`sol-trade-sdk/router` (Node) and `sol-trade-sdk/router/browser` (bundled browser ESM)
prepare unsigned exact-input routes using Jupiter Swap API v2 `/build`. This supports
SOL-funded trading through intermediate pairs such as USDC and MET without making
each venue builder implement conversion. The caller retains signing, transaction
version, compute budget, durable nonce, sender selection and submission ownership.

```ts
import { prepareJupiterRoute, assertRouterTradeFresh } from 'sol-trade-sdk/router';
const route = await prepareJupiterRoute({
  connection, owner, inputMint, outputMint,
  amountIn: 10_000_000n,
  slippageBps: 100,
  apiKey: process.env.JUPITER_API_KEY,
  wrapNativeInput: true, // only when inputMint is WSOL; both native flags default false
});
assertRouterTradeFresh(route); // repeat immediately before signing
// Compile route.instructions with route.lookupTables and your transaction policy.
```

Provider JSON is untrusted: the adapter checks the pinned on-chain route-v2 binary
layout, owner and endpoint ATAs, raw input/floor, allocation graph, setup instructions,
shared account PDAs and actual on-chain lookup tables. Quotes expire from preparation
start (10 seconds by default) and mutation invalidates their identity. Unknown route
layouts, opaque dynamic/RFQ variants, extra transfers and router referral fees fail
closed. Provider compute-budget instructions are excluded; the caller supplies its own.

Native SOL input wraps exactly the requested budget and leaves the WSOL ATA open,
preserving an existing balance. Explicit `unwrapNativeOutput` closes the owner's output
WSOL ATA to the same owner, including any preexisting WSOL. `normalizeJupiterFill` uses
Jupiter-scoped WSOL transfers and actual token-account deltas, so previous balances,
rent and sender tips are not counted as trade proceeds. Fetch its jsonParsed receipt
at confirmed or finalized commitment and persist the prepared endpoint, amount, floor
and `swapInstructionData` expectations before broadcast. Incomplete or ambiguous
receipts are rejected rather than converted into estimated fills.

For an already-funded pool quote token, call
`discoverPoolQuoteMint(connection, poolAddress, targetMint)` to authenticate the
opposite pool mint, then request `quoteMint → targetMint` for buys and
`targetMint → quoteMint` for sells. Identity discovery supports all eleven venue
families and may use a cache-backed connection; it does not establish executable
liquidity or token-extension support. Set `directPairOnly: true` and keep both
native flags false to prohibit extra conversions and split routes. This checks
the decoded instruction's single 10000-bps step and the exact endpoint graph.
Jupiter V2 `/build` has no documented direct-only request parameter, so a returned
multihop route is rejected even when a direct pool might exist. This policy does
not pin Jupiter to the pool used for identity discovery. Persist `directPairOnly`
with the fill expectation so receipt validation retains the same restriction.

`prepareJupiterSellForQuoteValue({ ...options, targetAmount })` sizes a sale in
any output mint's atomic units; it uses the same bounded search and trade
validation as the SOL helper below. Neither helper obtains missing input tokens
or converts SOL to fund the requested input. The caller checks its wallet's
existing spendable input balance before signing.

`prepareJupiterSellForSolValue` sizes a token sale for an expected SOL value within a
bounded eight-quote search, never exceeding supplied holdings or the expected target.
Its default target tolerance is 10 bps below the target; execution still varies within
swap slippage. Some Pump legs permit partial input consumption, exposed as
`allowsPartialFill`; always account for actual executed amounts.

Axiom FLASH transaction research showed direct DEX calls and intermediate-balance
forwarding, without a documented public integration API. Jupiter's custom-build API
provides a supported integration while retaining our transaction controls. This does
not establish identical pool selection or universal Axiom coverage: route availability,
liquidity, supported instruction layouts and transaction limits still apply. API keys
are optional on the tested endpoint, but production wallet groups should use configured
request limits. No fallback signs an unchecked provider transaction.

Validation commands: `npm test`, `npm run test:router:package` (after `npm run build`)
and `npm run test:router:surfpool`. The latter only signs generated wallets against a
verified loopback Surfpool runtime; it fetches unsigned Jupiter builds over HTTPS.
`npm run test:router:funded` additionally checks a locally funded MET/Pump pair in
both directions, single-leg routing, and strict raw receipt balance deltas.
Use Surfpool 1.6.0 for v1 transaction support. Read its evidence report for individual
cases: unavailable upstream quotes and malformed local receipt metadata are reported
separately from successful execution. Optional harness-only receipt metadata correction
never changes the SDK's strict receipt validator or the extension's accounting behavior.

### Pool-specific direct swaps (no routing service)

`sol-trade-sdk/direct` and `sol-trade-sdk/direct/browser` expose a single API for
Pump.fun, PumpSwap, Raydium CPMM/AMM v4/LaunchLab/CLMM, Orca Whirlpool, and
Meteora DAMM v1/v2, DLMM, and DBC. No Jupiter account or API key is required.

```ts
import { prepareDirectMarket, quoteDirectSwap, buildDirectSwap,
  normalizeDirectFill } from 'sol-trade-sdk/direct';
const market = await prepareDirectMarket(connection, pool, targetMint);
const quote = quoteDirectSwap(market, market.quoteMint, amountIn, 100);
const { instructions, expectation } = await buildDirectSwap(market, quote, owner);
// Caller composes, signs, submits, and retrieves a confirmed jsonParsed receipt.
const fill = normalizeDirectFill(confirmedReceipt, expectation);
```

Preparation reads only through the supplied Connection and can run against a
recording or cache-only connection. Rebuild the market when its streamed account
dependencies change. Quotes and builds perform no RPC; quote objects are bound
to the exact prepared market. `sizeDirectSellForQuoteValue(market, targetAmount,
maximumInputAmount, slippageBps)` finds a token-input quote whose protected output
reaches the requested quote-token value using bounded local integer search.

For expected-proceeds sizing, use `sizeDirectSellForExpectedOutput(market,
target, maxInput)`, then quote and build the returned token amount. This helper
uses the pool curve and a caller-provided input bound; slippage is applied to the
subsequent quote. `tryQuoteDirectSell(market, inputAmount, slippageBps)` returns a
sealed explicit-input quote, or null for unexecutable dust.

Version 0.12.0 removes `planDirectSellBatch`, `DirectSellBatch` and
`SellBatchWallet`. Wallet selection, weights, balance caps, redistribution,
sell-all policy and dust consolidation belong in the calling application.
The SDK does not accept a wallet batch or produce per-wallet allocations.

Non-native swaps spend an already funded input-token ATA and return the pool's
other token. The SDK does not convert SOL to fund a non-SOL quote. Native SOL
endpoints use wrapping/cleanup where the venue requires WSOL; Pump native curves
use their native-SOL instructions. Token-2022 transfer fees are supported by
CPMM, DAMM v2, CLMM, Orca and DLMM; unsupported extensions/configurations fail
closed. Persist the complete returned expectation for receipt verification;
settled amounts come from confirmed balance changes and verified swap scope,
including partial actual input on Orca. The older `router` API remains available
for compatibility, separately from this direct API.

## Local multi-venue sandboxes

The `sol-trade-sdk/sandbox` entry point provides `PumpSandbox`, `LaunchLabSandbox`,
`DbcSandbox`, and `decodeSandboxTransaction`. These adapters own real token creation,
curve swaps, completion, destination-pool migration, quotes, and observed market
values for Pump.fun/PumpSwap, LaunchLab/CPMM, and DBC/DAMM v2.

Applications supply a verified private Surfpool connection and a `send(instructions,
signer, extraSigners)` callback. The callback must support v0 transactions with real
address lookup tables for LaunchLab migration. Applications retain wallet custody,
scheduling, persistence, and submission; observations use SOL units and progress
percentages from 0 to 100.

Call `initialize(payer)` on Pump and LaunchLab before use. LaunchLab's local setup
changes only the cloned configuration's migration authority to the sandbox payer;
the returned original account bytes must be retained as fixture provenance. It
requires a loopback endpoint or explicitly configured `SURFPOOL_PRIVATE_HOST` and
an identified Surfpool bank. Signature verification remains enabled. DBC creates
its configuration through real instructions and contributes 0.1 SOL toward migration
account rent. Migrated CPMM trading waits for its chain opening time, with a bounded
six-second timeout.

Receipt normalization excludes launches, liquidity migrations, rent, and network
fees. Pump uses official event principal; the other venues use actual swap
user/vault transfers, including vault-retained swap fees and excluding separately
transferred fees. Partial fills report settled quantities. Non-Pump receipt times
come from the canonical slot's block time. Missing evidence never creates a fill.

The `scripts/sandbox-launchlab-e2e.mjs` and `scripts/sandbox-dbc-e2e.mjs` workflows
require isolated offline Surfpool banks loaded with Moixa's public fixture. Set
`SANDBOX_FIXTURE_PATH` for LaunchLab and `SANDBOX_RPC_URL` (LaunchLab) or
`SANDBOX_RPC` (DBC) to the corresponding private endpoint. They create disposable
funded wallets and execute real signed launches, swaps, migrations, and destination
swaps. The Moixa application suite additionally covers Pump and an unattended market.
