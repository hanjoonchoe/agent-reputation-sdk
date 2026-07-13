//! Error style (mirrors `packages/ts/src/errors.ts` and
//! `packages/py/src/web3_agent_reputation/errors.py`, ported to Rust idiom via
//! `thiserror`).
//!
//! Every fallible function in this crate returns `Result<_, Erc8004Error>` — no raw
//! `alloy`/`reqwest` error is ever allowed to cross a public function boundary
//! unwrapped. Upstream error messages (RPC errors, fetch failures) are sanitized to
//! their first line, capped at 300 chars, before being folded into the error's
//! `Display` message; the full original error is preserved via `#[source]` /
//! `#[from]` for anyone who wants it with `std::error::Error::source()`.

use thiserror::Error;

pub const MAX_MESSAGE_LENGTH: usize = 300;

/// Sanitizes an upstream error into a short, single-line, boundedly-sized message.
pub fn sanitize_message(input: impl std::fmt::Display) -> String {
    let raw = input.to_string();
    let first_line = raw.lines().next().unwrap_or(&raw);
    if first_line.chars().count() > MAX_MESSAGE_LENGTH {
        let truncated: String = first_line.chars().take(MAX_MESSAGE_LENGTH).collect();
        format!("{truncated}…")
    } else {
        first_line.to_string()
    }
}

#[derive(Debug, Error)]
pub enum Erc8004Error {
    /// `agent_id` has no registered owner (ERC-721 `ownerOf`/`tokenURI` revert).
    #[error("agent {agent_id} is not registered")]
    AgentNotFound { agent_id: alloy::primitives::U256 },

    /// The provider's chain id is not one of the 7 configured ERC-8004 chains.
    #[error("{}", .chain_id.map_or_else(
        || "provider has no resolvable chain id; Erc8004ProviderExt requires a supported chain".to_string(),
        |id| format!("chainId {id} is not a supported ERC-8004 chain"),
    ))]
    ChainUnsupported { chain_id: Option<u64> },

    /// Any non-revert RPC failure (network, timeout, decoding, multicall shortfall).
    #[error("{0}")]
    Rpc(String),

    /// A registration file could not be fetched (network, timeout, size cap, malformed URI).
    #[error("{0}")]
    FileUnreachable(String),

    /// Fetched bytes fail to hash-match their on-chain commitment (e.g. IPFS CID mismatch).
    #[error("{0}")]
    FileHashMismatch(String),

    /// Caller-supplied argument validation failure (bad limit/offset, malformed input, or
    /// — mirroring the TS/py ports' documented deviation — a negative/NaN feedback score).
    #[error("{0}")]
    InvalidInput(String),
}

impl Erc8004Error {
    pub fn rpc(cause: impl std::fmt::Display) -> Self {
        Erc8004Error::Rpc(sanitize_message(cause))
    }

    pub fn file_unreachable(message: impl Into<String>) -> Self {
        Erc8004Error::FileUnreachable(message.into())
    }

    pub fn file_hash_mismatch(message: impl Into<String>) -> Self {
        Erc8004Error::FileHashMismatch(message.into())
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Erc8004Error::InvalidInput(message.into())
    }
}
