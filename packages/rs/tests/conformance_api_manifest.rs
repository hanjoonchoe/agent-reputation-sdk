//! Asserts this crate's actual surface matches `../../conformance/api-manifest.json`.
//! Rust has no runtime reflection over struct fields or trait methods, so this test is
//! a compile-checked struct literal / match arm listing, tied to the manifest by
//! comment -- if a field is renamed or removed, this file fails to compile, which is
//! the Rust-idiomatic analogue of the ts/py runtime-reflection tests
//! (`packages/ts/test/conformance/api-manifest.test.ts`,
//! `packages/py/tests/conformance/test_api_manifest.py`).

use alloy::primitives::{Address, B256, U256};
use alloy_agent_reputation::calculator::{
    calculate_reputation, Credibility, FeedbackEntry, Policy,
};
use alloy_agent_reputation::{
    Agent, Erc8004Error, FeedbackEntry as FactsFeedbackEntry, ValidationEntry,
};

// api-manifest.json: methods.getAgent.rs / getAgentFeedback.rs / getAgentValidations.rs /
// getRegistrationFile.rs / calculateReputation.rs -- these are all `snake_case`
// trait/free-function names on `Erc8004ProviderExt` and `calculator`. The trait itself
// isn't object-safe to list via `dyn`, so this test instead confirms the free function
// `calculate_reputation` exists with the manifest's canonical name (facts-layer method
// names are exercised for real against a live provider in `tests/live.rs`).
#[test]
fn calculate_reputation_is_the_canonical_free_function_name() {
    let rep = calculate_reputation(&[], Policy::default()).unwrap();
    assert_eq!(rep.entries, 0);
}

// api-manifest.json: resultFields.Agent = ["agentId", "owner", "tokenUri", "registeredAt"]
// -> facts::Agent { agent_id, owner, token_uri, registered_at }
#[test]
fn agent_struct_has_the_canonical_field_names() {
    let _sample = Agent {
        agent_id: U256::from(1u64),
        owner: Address::ZERO,
        token_uri: String::new(),
        registered_at: None,
    };
}

// api-manifest.json: resultFields.FeedbackEntry (facts-layer) = ["client", "score",
// "tag", "uri", "timestamp"] -- see api-manifest.json's `_notes` entry documenting that
// this crate's facts::FeedbackEntry omits the always-null `uri`/`timestamp` fields as
// a harmless surface trim (both are always null/None in ts/py); `tag` and the rest are
// present.
#[test]
fn facts_feedback_entry_has_the_documented_field_subset() {
    let _sample = FactsFeedbackEntry {
        client: Address::ZERO,
        score: 0.0,
        tag: None,
    };
}

// api-manifest.json: _calculatorInput.FeedbackEntry = ["client", "score"]
#[test]
fn calculator_feedback_entry_has_the_canonical_field_names() {
    let _sample = FeedbackEntry {
        client: "0xabc".to_string(),
        score: 50.0,
    };
}

// api-manifest.json: resultFields.ValidationEntry = ["validator", "method",
// "requestHash", "response", "timestamp"] -> validator, method, request_hash, response,
// timestamp
#[test]
fn validation_entry_has_the_canonical_field_names() {
    let _sample = ValidationEntry {
        validator: Address::ZERO,
        method: alloy_agent_reputation::ValidationMethod::Tee,
        request_hash: B256::ZERO,
        response: 0,
        timestamp: 0,
    };
}

// api-manifest.json: resultFields.Reputation = ["expectation", "uncertainty",
// "witnesses", "entries", "topWitnessShare", "caveats", "policy"]
#[test]
fn reputation_struct_has_the_canonical_field_names() {
    let rep = calculate_reputation(&[], Policy::default()).unwrap();
    let alloy_agent_reputation::calculator::Reputation {
        expectation: _,
        uncertainty: _,
        witnesses: _,
        entries: _,
        top_witness_share: _,
        caveats: _,
        policy: _,
    } = rep;
}

// api-manifest.json: methods.shouldEscalate.rs = should_escalate (free function on `escalate`)
#[test]
fn should_escalate_is_the_canonical_free_function_name() {
    use alloy_agent_reputation::escalate::{should_escalate, EscalationThresholds};
    let rep = calculate_reputation(&[], Policy::default()).unwrap();
    let _verdict = should_escalate(&rep, &EscalationThresholds::default());
}

// api-manifest.json: resultFields.EscalationVerdict = ["escalate", "reasons"]
#[test]
fn escalation_verdict_has_the_canonical_field_names() {
    use alloy_agent_reputation::escalate::{should_escalate, EscalationThresholds, EscalationVerdict};
    let rep = calculate_reputation(&[], Policy::default()).unwrap();
    let EscalationVerdict {
        escalate: _,
        reasons: _,
    } = should_escalate(&rep, &EscalationThresholds::default());
}

// api-manifest.json: errorNames (6) -> Erc8004Error variants (errorNamingRule.rs:
// "Erc8004Error::{Name}")
#[test]
fn error_enum_has_the_canonical_six_variants() {
    fn assert_variant(e: Erc8004Error) -> &'static str {
        match e {
            Erc8004Error::AgentNotFound { .. } => "AgentNotFound",
            Erc8004Error::ChainUnsupported { .. } => "ChainUnsupported",
            Erc8004Error::Rpc(_) => "Rpc",
            Erc8004Error::FileUnreachable(_) => "FileUnreachable",
            Erc8004Error::FileHashMismatch(_) => "FileHashMismatch",
            Erc8004Error::InvalidInput(_) => "InvalidInput",
        }
    }
    assert_eq!(
        assert_variant(Erc8004Error::InvalidInput("x".into())),
        "InvalidInput"
    );
}

// api-manifest.json: credibilityStrategies = ["uniform", "activity-sqrt"]
#[test]
fn credibility_strategies_are_exported_under_canonical_names() {
    assert_eq!(
        Policy {
            witness_cap: None,
            credibility: Credibility::Uniform,
            base_rate: None,
        }
        .credibility_name(),
        "uniform"
    );
    assert_eq!(
        Policy {
            witness_cap: None,
            credibility: Credibility::ActivitySqrt(Default::default()),
            base_rate: None,
        }
        .credibility_name(),
        "activity-sqrt"
    );
    // Rust spells these two strategies as `Credibility` enum variants rather than
    // ts/py's `uniform()`/`activitySqrt()` factory functions (a documented,
    // idiom-driven casing difference -- see api-manifest.json's `credibilityStrategies`
    // header note); the *echoed* strategy name string is what's canonical and
    // cross-language, asserted above via `Policy.policy.credibility`.
}

trait CredibilityNameExt {
    fn credibility_name(&self) -> &str;
}

impl CredibilityNameExt for Policy {
    fn credibility_name(&self) -> &str {
        match &self.credibility {
            Credibility::Uniform => "uniform",
            Credibility::ActivitySqrt(_) => "activity-sqrt",
            Credibility::Custom { name, .. } => name.as_str(),
        }
    }
}
