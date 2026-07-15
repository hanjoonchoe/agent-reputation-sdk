//! Golden-vector conformance: parses `../../vectors/base-2026-07-13.json` and checks
//! this crate's calculator reproduces every expected row (variant A = witness_cap
//! `None`, variant B = witness_cap `Some(1.0)`, both under `Credibility::ActivitySqrt`
//! built from the fixture's `distinctCounts`), to 3-decimal tolerance
//! (round-half-away-from-zero, matching `f64::round`'s native behavior).

use std::collections::{BTreeMap, HashMap};

use alloy_agent_reputation::calculator::{
    calculate_reputation, Credibility, FeedbackEntry, Policy,
};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct VectorsFile {
    feedback: HashMap<String, Vec<FeedbackJson>>,
    #[serde(rename = "distinctCounts")]
    distinct_counts: BTreeMap<String, u32>,
    expected: Vec<ExpectedRow>,
}

#[derive(Debug, Deserialize)]
struct FeedbackJson {
    client: String,
    score: f64,
}

#[derive(Debug, Deserialize)]
struct ExpectedRow {
    #[serde(rename = "agentId")]
    agent_id: u32,
    variant: String,
    #[serde(rename = "witnessCap")]
    witness_cap: Option<f64>,
    expectation: f64,
    uncertainty: f64,
    witnesses: usize,
    #[serde(rename = "topWitnessShare")]
    top_witness_share: f64,
}

fn round3(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}

fn load_vectors() -> VectorsFile {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../vectors/base-2026-07-13.json"
    );
    let raw = std::fs::read_to_string(path).expect("read golden vectors fixture");
    serde_json::from_str(&raw).expect("parse golden vectors fixture")
}

#[test]
fn golden_vectors_conform() {
    let fixture = load_vectors();
    assert_eq!(
        fixture.expected.len(),
        20,
        "expected exactly 20 golden-vector rows"
    );

    let mut checked = 0usize;
    for row in &fixture.expected {
        let entries: Vec<FeedbackEntry> = fixture
            .feedback
            .get(&row.agent_id.to_string())
            .unwrap_or_else(|| panic!("no feedback fixture for agent {}", row.agent_id))
            .iter()
            .map(|e| FeedbackEntry {
                client: e.client.clone(),
                score: e.score,
            })
            .collect();

        assert_eq!(
            row.variant == "B",
            row.witness_cap.is_some(),
            "variant/witnessCap mismatch in fixture row for agent {} variant {}",
            row.agent_id,
            row.variant
        );

        let policy = Policy {
            witness_cap: row.witness_cap,
            credibility: Credibility::ActivitySqrt(fixture.distinct_counts.clone()),
            base_rate: None,
        };

        let rep = calculate_reputation(&entries, policy)
            .unwrap_or_else(|e| panic!("agent {} variant {}: {e}", row.agent_id, row.variant));

        assert_eq!(
            round3(rep.expectation),
            row.expectation,
            "agent {} variant {}: expectation",
            row.agent_id,
            row.variant
        );
        assert_eq!(
            round3(rep.uncertainty),
            row.uncertainty,
            "agent {} variant {}: uncertainty",
            row.agent_id,
            row.variant
        );
        assert_eq!(
            rep.witnesses, row.witnesses,
            "agent {} variant {}: witnesses",
            row.agent_id, row.variant
        );
        assert_eq!(
            round3(rep.top_witness_share),
            row.top_witness_share,
            "agent {} variant {}: topWitnessShare",
            row.agent_id,
            row.variant
        );

        checked += 1;
    }

    assert_eq!(checked, 20, "golden-vector conformance: 20/20 rows checked");
}
