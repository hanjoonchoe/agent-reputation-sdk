//! Pre-delegation guard: before an agent hands off work (or funds) to another
//! ERC-8004 agent, read the on-chain facts and compute reputation under your own
//! declared policy — then refuse to proceed unless the registration file is
//! verified and the result is confident enough.
//!
//! Mirrors `examples/ts/vet-agent.ts` / `packages/py/examples/vet_agent.py`.
//!
//! Usage:
//!   cargo run --example vet_agent -- [agentId] [uncertaintyThreshold]
//!
//! Exits nonzero — and refuses to proceed — if the registration file isn't verified
//! or the capped-variant uncertainty exceeds the threshold (default 0.3).

use std::process::ExitCode;

use alloy::primitives::U256;
use alloy::providers::ProviderBuilder;
use alloy_agent_reputation::calculator::{
    calculate_reputation, Credibility, FeedbackEntry, Policy,
};
use alloy_agent_reputation::Erc8004ProviderExt;

const BASE_RPC_URL: &str = "https://mainnet.base.org";

#[tokio::main]
async fn main() -> ExitCode {
    let mut args = std::env::args().skip(1);
    let agent_id: u64 = args.next().and_then(|s| s.parse().ok()).unwrap_or(1);
    let uncertainty_threshold: f64 = args.next().and_then(|s| s.parse().ok()).unwrap_or(0.3);
    let agent_id = U256::from(agent_id);

    let provider = ProviderBuilder::new().connect_http(BASE_RPC_URL.parse().expect("valid URL"));

    // Facts layer: no opinions, just typed reads.
    let agent = match provider.get_agent(agent_id).await {
        Ok(a) => a,
        Err(e) => {
            eprintln!("failed to read agent #{agent_id}: {e}");
            return ExitCode::FAILURE;
        }
    };
    // Reuse the already-fetched `agent.token_uri` (rather than calling
    // `provider.get_registration_file`, which would re-resolve the agent) to keep RPC
    // call volume low against a rate-limited public endpoint.
    let file = match alloy_agent_reputation::fetch::fetch_registration_file(&agent.token_uri).await
    {
        Ok(f) => f,
        Err(e) => {
            eprintln!("failed to fetch registration file: {e}");
            return ExitCode::FAILURE;
        }
    };
    let feedback = match provider.get_agent_feedback(agent_id, 200, 0).await {
        Ok(f) => f,
        Err(e) => {
            eprintln!("failed to read feedback: {e}");
            return ExitCode::FAILURE;
        }
    };

    let entries: Vec<FeedbackEntry> = feedback
        .iter()
        .map(|f| FeedbackEntry {
            client: format!("{:?}", f.client),
            score: f.score,
        })
        .collect();

    // Calculator layer: your policy in, evidence-rich result out. Two variants of the
    // same policy family — pooled evidence (A) vs. one evidence unit per witness (B) —
    // so a single Sybil-heavy witness can't dominate the capped view.
    let pooled = calculate_reputation(
        &entries,
        Policy {
            witness_cap: None,
            credibility: Credibility::Uniform,
            base_rate: None,
        },
    )
    .expect("valid feedback scores");
    let capped = calculate_reputation(
        &entries,
        Policy {
            witness_cap: Some(1.0),
            credibility: Credibility::Uniform,
            base_rate: None,
        },
    )
    .expect("valid feedback scores");

    println!("Agent #{agent_id} — owner {:?}", agent.owner);
    println!(
        "registration file: verified={:?} (source={:?})",
        file.verified, file.source
    );
    println!(
        "variant A (pooled): expectation={:.3} uncertainty={:.3} witnesses={}",
        pooled.expectation, pooled.uncertainty, pooled.witnesses
    );
    println!(
        "variant B (capped): expectation={:.3} uncertainty={:.3} witnesses={}",
        capped.expectation, capped.uncertainty, capped.witnesses
    );
    println!("caveats: {}", capped.caveats.join(" "));

    let verified = file.verified == Some(true);
    let confident = capped.uncertainty <= uncertainty_threshold;

    if !verified || !confident {
        eprintln!(
            "\nREFUSE to delegate: verified={:?}, uncertainty={:.3} (threshold {uncertainty_threshold}).",
            file.verified, capped.uncertainty
        );
        return ExitCode::FAILURE;
    }

    println!("\nOK to proceed — subject to your own further judgment; this is not a score.");
    ExitCode::SUCCESS
}
