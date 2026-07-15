# alloy-agent-reputation

[![Crates.io](https://img.shields.io/badge/crates.io-not--yet--published-lightgrey)](https://crates.io/crates/alloy-agent-reputation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

**[alloy](https://alloy.rs) extension for [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004)** —
typed, read-only registry reads, plus a policy-driven reputation calculator. The Rust
sibling of [`agent-reputation`](../ts) (viem) and [`web3-agent-reputation`](../py)
(web3.py) — see the [root README](../../README.md) for the product and the two-layer
contract shared across all three.

> Pre-publish: not on crates.io yet. Depend on it from a checkout / git dependency
> until then.

## Install (pre-publish)

```toml
[dependencies]
alloy-agent-reputation = { path = "../agent-reputation-sdk/packages/rs" }
# or, once published:
# alloy-agent-reputation = "0.1"
```

## The two-layer contract

**Facts layer** — `Erc8004ProviderExt`, a blanket-impl extension trait for any alloy
`Provider`; thin typed reads, no opinions:

```rust
use alloy::primitives::U256;
use alloy::providers::ProviderBuilder;
use alloy_agent_reputation::Erc8004ProviderExt;

# async fn example() -> Result<(), Box<dyn std::error::Error>> {
let provider = ProviderBuilder::new().connect_http("https://mainnet.base.org".parse()?);

let agent = provider.get_agent(U256::from(1)).await?;
let feedback = provider.get_agent_feedback(U256::from(1), 200, 0).await?;
let validations = provider.get_agent_validations(U256::from(1), 200, 0).await?;
let file = provider.get_registration_file(U256::from(1)).await?;
# Ok(())
# }
```

The chain comes from the provider itself (`provider.get_chain_id()`), validated
against the 7 chains this crate knows the ERC-8004 registry addresses for — an
unconfigured or unsupported chain returns `Erc8004Error::ChainUnsupported`.
Read-only, forever: nothing in this crate signs or sends a transaction.

**Calculator layer** — a pure function; your policy in, evidence-rich result out:

```rust
use alloy_agent_reputation::calculator::{calculate_reputation, Credibility, FeedbackEntry, Policy};

let entries = vec![
    FeedbackEntry { client: "0xabc...".into(), score: 90.0 },
    FeedbackEntry { client: "0xdef...".into(), score: 60.0 },
];
let rep = calculate_reputation(
    &entries,
    Policy { witness_cap: Some(1.0), credibility: Credibility::Uniform, base_rate: None },
).unwrap();
// rep.expectation, rep.uncertainty, rep.witnesses, rep.top_witness_share, rep.caveats, rep.policy
```

Neither layer ever returns a bare pass/fail or a single "trust this agent" boolean —
see the root README's Design principles (no bare scalar, cross-language determinism,
judgment stays with the consumer).

## Golden-vector conformance

`tests/vectors.rs` parses `../../vectors/base-2026-07-13.json` and asserts this crate's
calculator reproduces all 20 expected rows (two policy variants x ten agents) to
3-decimal tolerance — the same fixture the TypeScript and Python implementations must
also reproduce exactly. Run with `cargo test`.

## Live smoke tests

`tests/live.rs` hits Base mainnet's public RPC and is `#[ignore]`d by default (network
access, no fixture determinism):

```sh
cargo test -- --ignored
```

## Example: pre-delegation guard

`examples/vet_agent.rs` mirrors `examples/ts/vet-agent.ts` / `packages/py/examples/vet_agent.py`
— read the facts, compute reputation under two policy variants, and refuse to proceed
unless the registration file is verified and confident enough:

```sh
cargo run --example vet_agent -- 1 0.3
```

## Verification

```sh
cargo fmt --check
cargo clippy -- -D warnings
cargo test
cargo test -- --ignored   # live, network-dependent
```
