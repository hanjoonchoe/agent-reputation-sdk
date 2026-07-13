//! Facts layer — `Erc8004ProviderExt`, an extension trait with a blanket impl for any
//! alloy `Provider`. Thin typed reads through the provider you already have; no
//! opinions, no aggregation (that's `crate::calculator`).
//!
//! Read-only, forever: nothing in this module ever signs or sends a transaction.

use alloy::primitives::{Address, B256, U256};
use alloy::providers::Provider;

use crate::abi::{IIdentityRegistry, IReputationRegistry, IValidationRegistry};
use crate::chains::get_chain_config;
use crate::errors::Erc8004Error;
use crate::fetch::{self, RegistrationFile};

pub const MAX_LIMIT: usize = 200;
pub const DEFAULT_LIMIT: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Agent {
    pub agent_id: U256,
    pub owner: Address,
    pub token_uri: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FeedbackEntry {
    pub client: Address,
    pub score: f64,
    pub tag: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValidationMethod {
    Tee,
    Zk,
    Reexec,
    Other,
}

fn classify_method(tag: &str) -> ValidationMethod {
    match tag.trim().to_lowercase().as_str() {
        "tee" => ValidationMethod::Tee,
        "zk" => ValidationMethod::Zk,
        "reexec" => ValidationMethod::Reexec,
        _ => ValidationMethod::Other,
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidationEntry {
    pub validator: Address,
    pub method: ValidationMethod,
    pub request_hash: B256,
    pub response: u8,
    pub timestamp: u64,
}

fn clamp_limit(limit: usize) -> usize {
    limit.min(MAX_LIMIT)
}

/// Decodes an on-chain (value, valueDecimals) pair to a best-effort 0-100 score.
/// Mirrors `packages/ts/src/actions/getAgentFeedback.ts::normalizeScore` — assumes the
/// common ERC-8004 convention that feedback values are a 0-100 rating; the contract
/// itself enforces no canonical range (Deviation, carried over from the TS/py facts
/// layers' own documented assumption).
fn normalize_score(value: i128, decimals: u8) -> f64 {
    let raw = value as f64 / 10f64.powi(decimals as i32);
    raw.clamp(0.0, 100.0)
}

async fn resolve_registries(
    provider: &impl Provider,
) -> Result<crate::chains::Registries, Erc8004Error> {
    let chain_id = provider.get_chain_id().await.map_err(Erc8004Error::rpc)?;
    get_chain_config(chain_id)
        .map(|c| c.registries)
        .ok_or(Erc8004Error::ChainUnsupported {
            chain_id: Some(chain_id),
        })
}

/// Classifies an `ownerOf`/`tokenURI` call failure: `ERC721NonexistentToken` reverts
/// become `AgentNotFound`; anything else becomes `Rpc`.
fn classify_identity_error(agent_id: U256, err: alloy::contract::Error) -> Erc8004Error {
    if err
        .as_decoded_error::<IIdentityRegistry::ERC721NonexistentToken>()
        .is_some()
    {
        return Erc8004Error::AgentNotFound { agent_id };
    }
    Erc8004Error::rpc(err)
}

/// `Erc8004ProviderExt` — read-only ERC-8004 registry reads through any alloy
/// `Provider`. The chain comes from `provider.get_chain_id()`, validated against the
/// 7 chains this crate knows the registry addresses for; an unsupported chain returns
/// `Erc8004Error::ChainUnsupported`.
pub trait Erc8004ProviderExt: Provider + Clone {
    fn get_agent(
        &self,
        agent_id: U256,
    ) -> impl std::future::Future<Output = Result<Agent, Erc8004Error>> + Send;

    fn get_agent_feedback(
        &self,
        agent_id: U256,
        limit: usize,
        offset: usize,
    ) -> impl std::future::Future<Output = Result<Vec<FeedbackEntry>, Erc8004Error>> + Send;

    fn get_agent_validations(
        &self,
        agent_id: U256,
        limit: usize,
        offset: usize,
    ) -> impl std::future::Future<Output = Result<Vec<ValidationEntry>, Erc8004Error>> + Send;

    fn get_registration_file(
        &self,
        agent_id: U256,
    ) -> impl std::future::Future<Output = Result<RegistrationFile, Erc8004Error>> + Send;
}

impl<P: Provider + Clone + Sync> Erc8004ProviderExt for P {
    async fn get_agent(&self, agent_id: U256) -> Result<Agent, Erc8004Error> {
        let registries = resolve_registries(self).await?;
        let identity = IIdentityRegistry::new(registries.identity, self.clone());

        let owner = identity
            .ownerOf(agent_id)
            .call()
            .await
            .map_err(|e| classify_identity_error(agent_id, e))?;
        let token_uri = identity
            .tokenURI(agent_id)
            .call()
            .await
            .map_err(|e| classify_identity_error(agent_id, e))?;

        Ok(Agent {
            agent_id,
            owner,
            token_uri,
        })
    }

    async fn get_agent_feedback(
        &self,
        agent_id: U256,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<FeedbackEntry>, Erc8004Error> {
        // Throws AgentNotFound for an unregistered agent before hitting the Reputation
        // Registry (mirrors packages/ts/src/actions/getAgentFeedback.ts).
        self.get_agent(agent_id).await?;

        let registries = resolve_registries(self).await?;
        let reputation = IReputationRegistry::new(registries.reputation, self.clone());

        let result = reputation
            .readAllFeedback(agent_id, vec![], String::new(), String::new(), false)
            .call()
            .await
            .map_err(Erc8004Error::rpc)?;

        let entries: Vec<FeedbackEntry> = result
            .clients
            .iter()
            .enumerate()
            .map(|(i, client)| FeedbackEntry {
                client: *client,
                score: normalize_score(
                    result.values.get(i).copied().unwrap_or_default(),
                    result.valueDecimals.get(i).copied().unwrap_or_default(),
                ),
                tag: result.tag1s.get(i).filter(|t| !t.is_empty()).cloned(),
            })
            .collect();

        let clamped_limit = clamp_limit(limit);
        let start = offset.min(entries.len());
        let end = (start + clamped_limit).min(entries.len());
        Ok(entries[start..end].to_vec())
    }

    async fn get_agent_validations(
        &self,
        agent_id: U256,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<ValidationEntry>, Erc8004Error> {
        self.get_agent(agent_id).await?;

        let registries = resolve_registries(self).await?;
        let validation = IValidationRegistry::new(registries.validation, self.clone());

        let hashes = validation
            .getAgentValidations(agent_id)
            .call()
            .await
            .map_err(Erc8004Error::rpc)?;

        if hashes.is_empty() {
            return Ok(vec![]);
        }

        let clamped_limit = clamp_limit(limit);
        let start = offset.min(hashes.len());
        let end = (start + clamped_limit).min(hashes.len());
        let page = &hashes[start..end];

        // Sequential per-hash reads (documented, R-2): a page is at most MAX_LIMIT
        // (200) entries; alloy's multicall builder adds a dependency surface this
        // crate's minimal-deps goal (R-1) doesn't warrant for a bounded, already-paged
        // read. A future version may batch these via `IMulticall3` if profiling shows
        // it matters.
        let mut entries = Vec::with_capacity(page.len());
        for hash in page {
            let status = validation
                .getValidationStatus(*hash)
                .call()
                .await
                .map_err(Erc8004Error::rpc)?;
            entries.push(ValidationEntry {
                validator: status.validatorAddress,
                method: classify_method(&status.tag),
                request_hash: *hash,
                response: status.response,
                timestamp: status.lastUpdate.try_into().unwrap_or(u64::MAX),
            });
        }
        Ok(entries)
    }

    async fn get_registration_file(
        &self,
        agent_id: U256,
    ) -> Result<RegistrationFile, Erc8004Error> {
        let agent = self.get_agent(agent_id).await?;
        fetch::fetch_registration_file(&agent.token_uri).await
    }
}
