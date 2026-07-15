//! Escalation predicate — "trust this aggregate, or route to a live check?"
//!
//! A line-for-line port of `packages/ts/src/gate/escalate.ts`; see that module for the
//! full rationale. Kept deliberately *outside* the calculator so aggregation stays a
//! pure function and the consume-the-output policy is a separate, caller-declared
//! concern.
//!
//! Two axes, not to be conflated:
//! - **Sufficiency** (`min_witnesses`, `max_uncertainty`) — is there enough independent
//!   evidence for the point estimate to mean anything? `uncertainty` is Jøsang &
//!   Ismail's uncertainty mass `u = 2/(r+s+2)`.
//! - **Concentration** (`max_top_witness_share`) — is the evidence dominated by one witness?
//!
//! Neither axis is a Sybil defense. Cheng & Friedman (2005) prove no *symmetric*
//! reputation function is Sybilproof, and this aggregate is symmetric — a Sybil
//! spreading across many addresses inflates the sample and *lowers* uncertainty,
//! passing a sufficiency gate. Adversarial resistance lives in the identity layer.
//! See `docs/THEORY.md` §3.1, §6.

use crate::calculator::Reputation;

/// Caller-declared thresholds. A `None` field is simply not checked.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct EscalationThresholds {
    /// Escalate if fewer than this many distinct witnesses contributed.
    pub min_witnesses: Option<usize>,
    /// Escalate if the uncertainty mass exceeds this (too little evidence).
    pub max_uncertainty: Option<f64>,
    /// Escalate if a single witness supplied more than this fraction of entries.
    pub max_top_witness_share: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EscalationVerdict {
    /// True if any declared threshold was tripped — don't trust the point estimate.
    pub escalate: bool,
    /// One human-readable reason per tripped threshold; empty when not escalating.
    pub reasons: Vec<String>,
}

/// Pure: evaluates a [`Reputation`] against a caller-declared threshold set.
/// `should_escalate(rep, &Default::default())` never escalates.
pub fn should_escalate(rep: &Reputation, thresholds: &EscalationThresholds) -> EscalationVerdict {
    let mut reasons = Vec::new();

    if let Some(min) = thresholds.min_witnesses {
        if rep.witnesses < min {
            reasons.push(format!(
                "insufficient witnesses: {} < {min} (sufficiency)",
                rep.witnesses
            ));
        }
    }
    if let Some(max) = thresholds.max_uncertainty {
        if rep.uncertainty > max {
            reasons.push(format!(
                "uncertainty too high: {:.3} > {max} (sufficiency)",
                rep.uncertainty
            ));
        }
    }
    if let Some(max) = thresholds.max_top_witness_share {
        if rep.top_witness_share > max {
            reasons.push(format!(
                "evidence too concentrated: {:.3} > {max} (concentration)",
                rep.top_witness_share
            ));
        }
    }

    EscalationVerdict {
        escalate: !reasons.is_empty(),
        reasons,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::calculator::{calculate_reputation, FeedbackEntry, Policy};

    fn rep_of(entries: &[FeedbackEntry]) -> Reputation {
        calculate_reputation(entries, Policy::default()).unwrap()
    }

    #[test]
    fn no_thresholds_never_escalates() {
        let rep = rep_of(&[FeedbackEntry {
            client: "0xabc".into(),
            score: 90.0,
        }]);
        let verdict = should_escalate(&rep, &EscalationThresholds::default());
        assert!(!verdict.escalate);
        assert!(verdict.reasons.is_empty());
    }

    #[test]
    fn thin_evidence_escalates_on_sufficiency() {
        let entries: Vec<FeedbackEntry> = (0..3)
            .map(|_| FeedbackEntry {
                client: "0xa".into(),
                score: 100.0,
            })
            .collect();
        let rep = rep_of(&entries);
        let verdict = should_escalate(
            &rep,
            &EscalationThresholds {
                min_witnesses: Some(5),
                max_uncertainty: Some(0.2),
                max_top_witness_share: None,
            },
        );
        assert!(verdict.escalate);
        assert!(verdict.reasons.iter().any(|r| r.contains("witnesses")));
        assert!(verdict.reasons.iter().any(|r| r.contains("uncertainty")));
    }

    #[test]
    fn concentrated_evidence_escalates_on_concentration() {
        let mut entries: Vec<FeedbackEntry> = (0..3)
            .map(|_| FeedbackEntry {
                client: "0xa".into(),
                score: 80.0,
            })
            .collect();
        entries.push(FeedbackEntry {
            client: "0xb".into(),
            score: 80.0,
        });
        let rep = rep_of(&entries);
        let verdict = should_escalate(
            &rep,
            &EscalationThresholds {
                max_top_witness_share: Some(0.5),
                ..Default::default()
            },
        );
        assert!(verdict.escalate);
        assert_eq!(verdict.reasons.len(), 1);
        assert!(verdict.reasons[0].contains("concentrated"));
    }

    #[test]
    fn empty_feedback_trips_sufficiency() {
        let rep = calculate_reputation(&[], Policy::default()).unwrap();
        assert_eq!(rep.uncertainty, 1.0);
        let verdict = should_escalate(
            &rep,
            &EscalationThresholds {
                max_uncertainty: Some(0.9),
                ..Default::default()
            },
        );
        assert!(verdict.escalate);
    }
}
