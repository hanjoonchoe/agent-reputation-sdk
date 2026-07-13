//! Asserts the caveat strings embedded in this crate's calculator byte-match
//! `../../conformance/caveats.json` -- the canonical extraction from
//! `packages/ts/src/calculator/index.ts`. This crate keeps its caveat constants
//! private (`calculator.rs`), so this test drives `calculate_reputation` into each
//! caveat-producing branch and compares the caveats it emits against the fixture --
//! the observable contract every language's port must reproduce. See also
//! `packages/ts/test/conformance/caveats.test.ts` / `packages/py/tests/conformance/test_caveats.py`.

use alloy_agent_reputation::calculator::{calculate_reputation, FeedbackEntry, Policy};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct CaveatsFixture {
    sybil: String,
    scale: String,
    #[serde(rename = "lowVolume")]
    low_volume: String,
    #[serde(rename = "noFeedback")]
    no_feedback: String,
}

fn load_fixture() -> CaveatsFixture {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../conformance/caveats.json"
    );
    let raw = std::fs::read_to_string(path).expect("read conformance/caveats.json");
    serde_json::from_str(&raw).expect("parse conformance/caveats.json")
}

fn low_volume(fixture: &CaveatsFixture, n: usize) -> String {
    fixture.low_volume.replace("{n}", &n.to_string())
}

#[test]
fn no_feedback_sybil_and_no_feedback_caveat() {
    let fixture = load_fixture();
    let rep = calculate_reputation(&[], Policy::default()).unwrap();
    assert_eq!(
        rep.caveats,
        vec![fixture.sybil.clone(), fixture.no_feedback.clone()]
    );
}

#[test]
fn low_volume_sybil_scale_and_low_volume_caveat() {
    let fixture = load_fixture();
    let entries = vec![
        FeedbackEntry {
            client: "0xabc".into(),
            score: 80.0,
        },
        FeedbackEntry {
            client: "0xdef".into(),
            score: 60.0,
        },
        FeedbackEntry {
            client: "0x111".into(),
            score: 40.0,
        },
    ];
    let rep = calculate_reputation(&entries, Policy::default()).unwrap();
    assert_eq!(
        rep.caveats,
        vec![
            fixture.sybil.clone(),
            fixture.scale.clone(),
            low_volume(&fixture, 3)
        ]
    );
}

#[test]
fn five_or_more_entries_no_low_volume_caveat() {
    let fixture = load_fixture();
    let entries: Vec<FeedbackEntry> = (0..5)
        .map(|i| FeedbackEntry {
            client: format!("0x{i}"),
            score: 50.0,
        })
        .collect();
    let rep = calculate_reputation(&entries, Policy::default()).unwrap();
    assert_eq!(rep.caveats, vec![fixture.sybil, fixture.scale]);
}
