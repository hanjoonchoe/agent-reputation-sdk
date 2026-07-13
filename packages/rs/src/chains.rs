//! 7-chain ERC-8004 registry table.
//!
//! Copied byte-for-byte from `packages/ts/src/chains/config.ts` in this same repository
//! — see `../registry/abi/SOURCE.md` for the full derivation provenance
//! (CREATE2 vanity-salt deployment, `eth_getCode` binary search per chain). Not
//! re-derived or re-verified here.

use alloy::primitives::{address, Address};

#[derive(Debug, Clone, Copy)]
pub struct Registries {
    pub identity: Address,
    pub reputation: Address,
    pub validation: Address,
}

#[derive(Debug, Clone, Copy)]
pub struct ChainConfig {
    pub chain_id: u64,
    pub name: &'static str,
    pub registries: Registries,
    /// First block at which the registries' bytecode is present on this chain.
    pub deployment_block: u64,
}

// Same CREATE2 vanity-salt deployment across every mainnet chain.
const IDENTITY: Address = address!("8004A169FB4a3325136EB29fA0ceB6D2e539a432");
const REPUTATION: Address = address!("8004BAa17C55a88189AE136b182e5fdA19dE9b63");
const VALIDATION: Address = address!("8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58");

const REGISTRIES: Registries = Registries {
    identity: IDENTITY,
    reputation: REPUTATION,
    validation: VALIDATION,
};

const CHAIN_CONFIGS: &[ChainConfig] = &[
    ChainConfig {
        chain_id: 1,
        name: "ethereum",
        registries: REGISTRIES,
        deployment_block: 24339871,
    },
    ChainConfig {
        chain_id: 8453,
        name: "base",
        registries: REGISTRIES,
        deployment_block: 41663783,
    },
    ChainConfig {
        chain_id: 137,
        name: "polygon",
        registries: REGISTRIES,
        deployment_block: 82458484,
    },
    ChainConfig {
        chain_id: 42161,
        name: "arbitrum",
        registries: REGISTRIES,
        deployment_block: 428895443,
    },
    ChainConfig {
        chain_id: 10,
        name: "optimism",
        registries: REGISTRIES,
        deployment_block: 147514947,
    },
    ChainConfig {
        chain_id: 56,
        name: "bnb",
        registries: REGISTRIES,
        deployment_block: 79027268,
    },
    ChainConfig {
        chain_id: 100,
        name: "gnosis",
        registries: REGISTRIES,
        deployment_block: 44505010,
    },
];

pub fn get_chain_config(chain_id: u64) -> Option<ChainConfig> {
    CHAIN_CONFIGS
        .iter()
        .copied()
        .find(|c| c.chain_id == chain_id)
}

pub fn supported_chain_ids() -> Vec<u64> {
    CHAIN_CONFIGS.iter().map(|c| c.chain_id).collect()
}
