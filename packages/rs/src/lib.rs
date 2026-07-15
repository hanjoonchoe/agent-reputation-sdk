//! `alloy-agent-reputation` — ERC-8004 read-only facts layer (an alloy `Provider`
//! extension trait, see [`facts::Erc8004ProviderExt`]) plus a pure, policy-driven
//! reputation calculator (see [`calculator::calculate_reputation`]). The Rust sibling
//! of `agent-reputation` (viem) and `web3-agent-reputation` (web3.py) — see the
//! repository root README for the product and the two-layer contract shared across
//! all three languages, and `vectors/base-2026-07-13.json` for the cross-language
//! golden-vector conformance contract this crate's calculator reproduces exactly
//! (`tests/vectors.rs`).

pub mod abi;
pub mod calculator;
pub mod chains;
pub mod cid;
pub mod errors;
pub mod escalate;
pub mod facts;
pub mod fetch;

pub use errors::Erc8004Error;
pub use facts::{Agent, Erc8004ProviderExt, FeedbackEntry, ValidationEntry, ValidationMethod};
pub use fetch::{ByteFetcher, RegistrationFile, ReqwestFetcher};
