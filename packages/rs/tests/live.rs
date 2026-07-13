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

#[tokio::test]
#[ignore]
async fn agent_zero_registered_at_best_effort() {
    let provider = ProviderBuilder::new().connect_http(BASE_RPC_URL.parse().unwrap());
    let agent = provider.get_agent(U256::from(0)).await.unwrap();
    // Best-effort: a public RPC's log-range/response-size limits can legitimately
    // return None (see facts::find_registered_at doc comment) -- either outcome is
    // acceptable here, this just confirms the read never *errors*.
    eprintln!("agent #0 registered_at = {:?}", agent.registered_at);
}
