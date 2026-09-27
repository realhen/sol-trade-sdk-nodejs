# Executable upstream Rust instruction differential

From the package root, after building the Node package:

```sh
# One-time dependency population on a machine without these crates cached:
cargo fetch --locked --manifest-path scripts/rust-parity/Cargo.toml
# Thereafter this test runs Cargo offline and does not contact RPC:
node scripts/test-rust-parity.mjs
```

This compiles and executes Rust, then compares the actual built Node CJS and ESM
adapters against its output. Each comparison includes program ID, every ordered
account public key, signer/writable flags, and every instruction byte. The Rust
output is generated on every test run; it is not a JavaScript translation or a
static expected-instruction fixture.

The harness uses the low-level `swap_v2` / `swap2` builders from
[0xfnzero/sol-trade-sdk commit 0ba9ec5a652bdb351323252771fec33ea1fb2f80](https://github.com/0xfnzero/sol-trade-sdk/tree/0ba9ec5a652bdb351323252771fec33ea1fb2f80).
`upstream/` contains the six complete original source files and original MIT
license. `provenance.json` records each original file's SHA-256 and the compiled
excerpt hashes. Before invoking Cargo, `verify-source.mjs` verifies those hashes
and reconstructs each excerpt from the original source to assert exact equality.
Apart from normalizing the final newline, only imports are replaced to remove the full SDK's unrelated RPC/trading stack;
`clmm_sqrt_limit` additionally gains public visibility for the explicit default
comparison. All builder function bodies, account structs, constants and PDA
helpers are copied unchanged. `Cargo.lock` pins the harness dependency graph,
including the same `solana-sdk` 4.0.1 used by upstream.

The 60 vectors cover both directions, optional CLMM/DLMM bitmap accounts present
and absent, one and three CLMM tick / DLMM bin accounts (the 1-unit DLMM cases fill
one bin; larger inputs traverse all three prepared arrays), three Whirlpool tick
accounts, Whirlpool default and explicit sqrt-price limits, and input/minimum
values at 1/0, above JavaScript's safe integer range, and u64::MAX. Mixed Token
and Token-2022 programs exercise account program selection.

There is an intentional CLMM default difference: upstream's high-level builder
replaces a zero limit with MIN+1/MAX-1, while the Node adapter emits zero for the
on-chain full-input behavior. Every CLMM vector separately executes the original
Rust high-level default helper, checks that only the 16 sqrt-limit bytes differ,
and compares Node against the low-level Rust builder with the equivalent zero
configuration. Whirlpool's Rust low-level zero default is normalized to MIN/MAX;
Node is passed that same explicit value for byte-equivalent configuration.

These are **instruction builder tests**, not quote-math parity. Upstream's three
Rust high-level builders require a caller-supplied minimum output rather than
computing a quote. The DLMM test runs the actual chain-time quote over synthetic bins with valid
derived addresses and prices, zero fees, and explicit chain time. It passes only
amount, selected bin addresses, direction, bitmap presence and a minimum output
to a second Rust process; no Node-encoded instruction bytes or account metas are
passed as expected results. Multi-array outputs constrain the minimum to the
quoted output, while single-array price-one cases also cover u64::MAX minimum.
The actual Rust builder and Node adapter's Anchor encoder execute unchanged. The synthetic remaining accounts prove their
ordering/flags, not initialized on-chain liquidity. Supplemental Whirlpool
accounts beyond upstream's three tick slots, transfer hooks, RPC preparation,
account creation, signing, submission and funded execution are outside this
comparison. Other adapter tests cover quotes independently.
