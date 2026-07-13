//! Live smoke tests against Base mainnet's public RPC. Not run by default (network
//! access, no fixture determinism) — `cargo test -- --ignored` to run them.

use alloy::primitives::U256;
use alloy::providers::ProviderBuilder;
use alloy_agent_reputation::Erc8004ProviderExt;

const BASE_RPC_URL: &str = "https://mainnet.base.org";

#[tokio::test]
#[ignore]
async fn agent_zero_registration_file_is_verified() {
    let provider = ProviderBuilder::new().connect_http(BASE_RPC_URL.parse().unwrap());
    let file = provider.get_registration_file(U256::from(0)).await.unwrap();
    assert_eq!(file.verified, Some(true));
}

#[tokio::test]
#[ignore]
async fn agent_one_has_at_least_thirty_feedback_entries() {
    let provider = ProviderBuilder::new().connect_http(BASE_RPC_URL.parse().unwrap());
    let feedback = provider
        .get_agent_feedback(U256::from(1), 200, 0)
        .await
        .unwrap();
    assert!(
        feedback.len() >= 30,
        "expected agent #1 to have >= 30 feedback entries, got {}",
        feedback.len()
    );
}
