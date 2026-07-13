//! Pure reputation calculator for ERC-8004 on-chain feedback.
//!
//! Zero I/O, no network, no clock, no randomness — a plain function of its inputs. This
//! is a line-for-line port of `packages/ts/src/calculator/index.ts` (see that module's
//! doc comment for the full normative algorithm description, reproduced below) and
//! `packages/py/src/web3_agent_reputation/calculator.py`; all three must reproduce
//! `vectors/base-2026-07-13.json` to 3 decimals.
//!
//! ## Algorithm (normative, copied from the TS reference)
//!
//! For each feedback entry, `v = clamp(score, 0, 100) / 100`. Entries are grouped by
//! client address, compared case-insensitively (addresses are lowercased before
//! grouping). For each client `k` with entries `v_1..v_n`:
//!
//! ```text
//! r_k = sum(v_i)
//! s_k = sum(1 - v_i)
//! ```
//!
//! If the policy declares a `witness_cap` `W` (variant B — one evidence unit per
//! witness), `(r_k, s_k)` are scaled by `min(1, W / (r_k + s_k))` before anything else.
//! `witness_cap` of `None` (variant A) pools all evidence unscaled.
//!
//! Each client's (possibly capped) `(r_k, s_k)` is then discounted by that client's
//! credibility weight `c_k` (in `[0, 1]`, from `Policy::credibility`, default `Uniform`
//! i.e. `c_k = 1` for everyone):
//!
//! ```text
//! r_k *= c_k
//! s_k *= c_k
//! ```
//!
//! All per-client pairs are summed into totals `r = sum(r_k)`, `s = sum(s_k)`, and the
//! result is read off a Beta(1,1)-prior posterior:
//!
//! ```text
//! expectation = (r + 1) / (r + s + 2)
//! uncertainty = 2 / (r + s + 2)
//! ```
//!
//! `top_witness_share` is the largest per-client *entry count* divided by the total
//! entry count (unweighted — a simple concentration signal, independent of
//! `witness_cap`/credibility).
//!
//! Decay (time-weighting recent feedback more heavily) is reserved in the `Policy` shape
//! but not implemented in v1: on-chain reads currently expose no per-entry timestamp
//! (see `get_agent_feedback` — `timestamp` is always `None`), so there is nothing to
//! decay against yet.
//!
//! ## Determinism
//!
//! Client accumulation happens in ascending lowercase-address sort order — this crate
//! uses a `BTreeMap<String, Vec<f64>>` for the grouping step, which gives that ordering
//! for free on iteration, rather than a `HashMap` (whose iteration order is unspecified
//! and would break cross-run/cross-language reproducibility). All arithmetic is plain
//! IEEE-754 `f64`, the same representation as JS `number` and Python `float`. Every
//! conformant implementation MUST accumulate in this same order so floating-point
//! summation is bit-for-bit reproducible across runs and across languages — this is
//! what makes the golden test vectors in `vectors/` a meaningful cross-language
//! contract.

use std::collections::BTreeMap;

use crate::errors::Erc8004Error;

/// One feedback entry as read by the facts layer (or constructed directly for testing /
/// non-chain use).
#[derive(Debug, Clone, PartialEq)]
pub struct FeedbackEntry {
    pub client: String,
    /// 0-100. Values above 100 are clamped; negative or non-finite values are invalid input.
    pub score: f64,
}

/// Witness-credibility weighting function, `c_k in [0, 1]` per client address
/// (case-insensitive — implementations receive the already-lowercased client key).
#[derive(Default)]
pub enum Credibility {
    /// `c_k = 1` for every client (the default).
    #[default]
    Uniform,
    /// Activity-weighted: `c_k = sqrt(d_k) / sqrt(d_max)`, where `d_k` is the number of
    /// distinct agents client `k` has rated (keyed by lowercase client address) and
    /// `d_max` is the largest distinct count in the map. Clients absent from the map
    /// are treated as `d_k = 0`.
    ActivitySqrt(BTreeMap<String, u32>),
    /// An arbitrary caller-supplied weighting function, echoed in `Reputation.policy`
    /// under the given name.
    Custom {
        name: String,
        f: Box<dyn Fn(&str) -> f64>,
    },
}

impl Credibility {
    fn name(&self) -> &str {
        match self {
            Credibility::Uniform => "uniform",
            Credibility::ActivitySqrt(_) => "activity-sqrt",
            Credibility::Custom { name, .. } => name.as_str(),
        }
    }

    fn weight(&self, client_lower: &str) -> f64 {
        match self {
            Credibility::Uniform => 1.0,
            Credibility::ActivitySqrt(distinct_counts) => {
                let max_d = distinct_counts.values().copied().max().unwrap_or(0);
                if max_d == 0 {
                    return 0.0;
                }
                let d = distinct_counts.get(client_lower).copied().unwrap_or(0);
                (d as f64).sqrt() / (max_d as f64).sqrt()
            }
            Credibility::Custom { f, .. } => f(client_lower),
        }
    }
}

impl std::fmt::Debug for Credibility {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Credibility::Uniform => write!(formatter, "Uniform"),
            Credibility::ActivitySqrt(m) => write!(formatter, "ActivitySqrt({m:?})"),
            Credibility::Custom { name, .. } => write!(formatter, "Custom({name:?})"),
        }
    }
}

/// The policy a caller declares for `calculate_reputation`; echoed back (by name, for
/// `credibility`) in `Reputation.policy` — the reproducibility manifest.
#[derive(Debug, Default)]
pub struct Policy {
    /// `None` = variant A (pool all evidence). `Some(w)`, `w > 0` = variant B (cap each
    /// witness's evidence to `w` units).
    pub witness_cap: Option<f64>,
    pub credibility: Credibility,
}

/// The echoed policy carried on `Reputation.policy` — a `witness_cap`/`credibility`-name
/// pair, not the full `Policy` (which may contain a non-`Debug`, non-`Clone` closure).
#[derive(Debug, Clone, PartialEq)]
pub struct EchoedPolicy {
    pub witness_cap: Option<f64>,
    pub credibility: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Reputation {
    pub expectation: f64,
    pub uncertainty: f64,
    pub witnesses: usize,
    pub entries: usize,
    pub top_witness_share: f64,
    pub caveats: Vec<String>,
    pub policy: EchoedPolicy,
}

// Caveats — verbatim strings, copied from `packages/ts/src/calculator/index.ts` (in
// turn copied from web3-agents-mcp's `src/trust/caveats.ts` (SYBIL_CAVEAT,
// SCALE_CAVEAT) and `src/tools/get-reputation.ts` (the no-feedback / low-volume
// wording)), so that a consumer of any of these packages sees consistent language.
const SYBIL_CAVEAT: &str = "Feedback is self-reported by clients and may include Sybil or spam entries; treat scores as a weak signal.";
const SCALE_CAVEAT: &str = "On-chain feedback uses inconsistent score scales; averages are clamped to 0-100 and may overstate quality.";
const NO_FEEDBACK_CAVEAT: &str = "No feedback recorded.";

fn low_volume_caveat(count: usize) -> String {
    format!("Only {count} feedback entries exist; statistics are not meaningful.")
}

/// Validates and normalizes a raw 0-100 (or beyond) score into `v = clamp(score, 0, 100) / 100`.
fn to_unit_score(score: f64) -> Result<f64, Erc8004Error> {
    if score.is_nan() {
        return Err(Erc8004Error::invalid_input(format!(
            "FeedbackEntry.score must be a number, got {score}"
        )));
    }
    if score < 0.0 {
        return Err(Erc8004Error::invalid_input(format!(
            "FeedbackEntry.score must be >= 0, got {score}"
        )));
    }
    let clamped = score.min(100.0);
    Ok(clamped / 100.0)
}

pub fn calculate_reputation(
    entries: &[FeedbackEntry],
    policy: Policy,
) -> Result<Reputation, Erc8004Error> {
    let witness_cap = policy.witness_cap;
    let credibility = policy.credibility;
    let echoed_policy = EchoedPolicy {
        witness_cap,
        credibility: credibility.name().to_string(),
    };

    let total_entries = entries.len();

    if total_entries == 0 {
        return Ok(Reputation {
            expectation: 0.5,
            uncertainty: 1.0,
            witnesses: 0,
            entries: 0,
            top_witness_share: 0.0,
            caveats: vec![SYBIL_CAVEAT.to_string(), NO_FEEDBACK_CAVEAT.to_string()],
            policy: echoed_policy,
        });
    }

    // Group by lowercase client address (case-insensitive grouping), preserving each
    // entry's normalized value for later per-client accumulation. BTreeMap gives
    // ascending lowercase-address iteration order for free (see module doc comment).
    let mut groups: BTreeMap<String, Vec<f64>> = BTreeMap::new();
    for entry in entries {
        let v = to_unit_score(entry.score)?;
        let key = entry.client.to_lowercase();
        groups.entry(key).or_default().push(v);
    }

    let mut r = 0.0_f64;
    let mut s = 0.0_f64;
    let mut max_count = 0usize;

    for (client, values) in &groups {
        max_count = max_count.max(values.len());

        let mut rk = 0.0_f64;
        let mut sk = 0.0_f64;
        for &v in values {
            rk += v;
            sk += 1.0 - v;
        }

        if let Some(cap) = witness_cap {
            let total = rk + sk;
            let scale = if total > 0.0 {
                (cap / total).min(1.0)
            } else {
                1.0
            };
            rk *= scale;
            sk *= scale;
        }

        let ck = credibility.weight(client);
        rk *= ck;
        sk *= ck;

        r += rk;
        s += sk;
    }

    let expectation = (r + 1.0) / (r + s + 2.0);
    let uncertainty = 2.0 / (r + s + 2.0);
    let top_witness_share = max_count as f64 / total_entries as f64;

    let mut caveats = vec![SYBIL_CAVEAT.to_string(), SCALE_CAVEAT.to_string()];
    if total_entries < 5 {
        caveats.push(low_volume_caveat(total_entries));
    }

    Ok(Reputation {
        expectation,
        uncertainty,
        witnesses: groups.len(),
        entries: total_entries,
        top_witness_share,
        caveats,
        policy: echoed_policy,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-9, "{a} != {b}");
    }

    #[test]
    fn empty_feedback() {
        let rep = calculate_reputation(&[], Policy::default()).unwrap();
        approx(rep.expectation, 0.5);
        approx(rep.uncertainty, 1.0);
        assert_eq!(rep.witnesses, 0);
        assert_eq!(rep.entries, 0);
        approx(rep.top_witness_share, 0.0);
        assert_eq!(
            rep.caveats,
            vec![SYBIL_CAVEAT.to_string(), NO_FEEDBACK_CAVEAT.to_string()]
        );
    }

    #[test]
    fn three_hundred_single_witness() {
        let entries = vec![
            FeedbackEntry {
                client: "0xabc".into(),
                score: 100.0,
            },
            FeedbackEntry {
                client: "0xabc".into(),
                score: 100.0,
            },
            FeedbackEntry {
                client: "0xabc".into(),
                score: 100.0,
            },
        ];
        let rep = calculate_reputation(&entries, Policy::default()).unwrap();
        approx(rep.expectation, 0.8);
        approx(rep.uncertainty, 0.4);
        assert_eq!(rep.witnesses, 1);
        assert_eq!(rep.entries, 3);
        approx(rep.top_witness_share, 1.0);
        // < 5 entries -> low-volume caveat present
        assert_eq!(rep.caveats.len(), 3);
    }

    #[test]
    fn witness_cap_scales_down_prolific_witness() {
        // One witness gives 10 perfect scores (r=10, s=0). Uncapped: expectation = 11/12.
        let uncapped_entries: Vec<FeedbackEntry> = (0..10)
            .map(|_| FeedbackEntry {
                client: "0xabc".into(),
                score: 100.0,
            })
            .collect();
        let uncapped = calculate_reputation(&uncapped_entries, Policy::default()).unwrap();
        approx(uncapped.expectation, 11.0 / 12.0);

        // Capped at 1 unit of evidence: r=1, s=0 -> expectation = 2/3.
        let capped = calculate_reputation(
            &uncapped_entries,
            Policy {
                witness_cap: Some(1.0),
                credibility: Credibility::Uniform,
            },
        )
        .unwrap();
        approx(capped.expectation, 2.0 / 3.0);
    }

    #[test]
    fn activity_sqrt_discount() {
        let entries = vec![
            FeedbackEntry {
                client: "0xAAA".into(),
                score: 100.0,
            },
            FeedbackEntry {
                client: "0xbbb".into(),
                score: 0.0,
            },
        ];
        let mut counts = BTreeMap::new();
        counts.insert("0xaaa".to_string(), 1u32);
        counts.insert("0xbbb".to_string(), 4u32);
        let rep = calculate_reputation(
            &entries,
            Policy {
                witness_cap: None,
                credibility: Credibility::ActivitySqrt(counts),
            },
        )
        .unwrap();
        // c_aaa = sqrt(1)/sqrt(4) = 0.5, c_bbb = sqrt(4)/sqrt(4) = 1.0
        // r = 1*0.5 = 0.5, s = 1*1.0 = 1.0 -> expectation = 1.5/3.5
        approx(rep.expectation, 1.5 / 3.5);
        assert_eq!(rep.policy.credibility, "activity-sqrt");
    }

    #[test]
    fn score_clamped_above_100() {
        let entries = vec![FeedbackEntry {
            client: "0xabc".into(),
            score: 150.0,
        }];
        let rep = calculate_reputation(&entries, Policy::default()).unwrap();
        // v = 1.0 exactly, same as a score of 100.
        let entries_100 = vec![FeedbackEntry {
            client: "0xabc".into(),
            score: 100.0,
        }];
        let rep_100 = calculate_reputation(&entries_100, Policy::default()).unwrap();
        approx(rep.expectation, rep_100.expectation);
    }

    #[test]
    fn negative_score_is_invalid_input() {
        let entries = vec![FeedbackEntry {
            client: "0xabc".into(),
            score: -1.0,
        }];
        let err = calculate_reputation(&entries, Policy::default()).unwrap_err();
        assert!(matches!(err, Erc8004Error::InvalidInput(_)));
    }

    #[test]
    fn nan_score_is_invalid_input() {
        let entries = vec![FeedbackEntry {
            client: "0xabc".into(),
            score: f64::NAN,
        }];
        let err = calculate_reputation(&entries, Policy::default()).unwrap_err();
        assert!(matches!(err, Erc8004Error::InvalidInput(_)));
    }

    #[test]
    fn case_insensitive_grouping() {
        let entries = vec![
            FeedbackEntry {
                client: "0xABC".into(),
                score: 100.0,
            },
            FeedbackEntry {
                client: "0xabc".into(),
                score: 0.0,
            },
        ];
        let rep = calculate_reputation(&entries, Policy::default()).unwrap();
        assert_eq!(rep.witnesses, 1);
        approx(rep.expectation, 0.5);
    }

    #[test]
    fn shuffled_input_is_deterministic() {
        let mut a = vec![
            FeedbackEntry {
                client: "0xccc".into(),
                score: 90.0,
            },
            FeedbackEntry {
                client: "0xaaa".into(),
                score: 10.0,
            },
            FeedbackEntry {
                client: "0xbbb".into(),
                score: 50.0,
            },
            FeedbackEntry {
                client: "0xaaa".into(),
                score: 70.0,
            },
        ];
        let rep_a = calculate_reputation(&a, Policy::default()).unwrap();

        // Different input order, same multiset of entries.
        a.reverse();
        let rep_b = calculate_reputation(&a, Policy::default()).unwrap();

        assert_eq!(rep_a, rep_b);
    }
}
