/**
 * Escalation predicate — the "should a caller trust this aggregate, or route to a
 * live check?" decision, kept deliberately *outside* the calculator so that
 * aggregation stays a pure function and the policy for consuming its output is a
 * separate, independently-declared concern.
 *
 * Two axes, and it is important not to conflate them:
 *
 *  - **Sufficiency** (`minWitnesses`, `maxUncertainty`) — is there enough
 *    independent evidence for the point estimate to mean anything? `uncertainty`
 *    is Jøsang & Ismail's uncertainty mass `u = 2/(r+s+2)`, a monotone function of
 *    accumulated evidence; gating on it is a statistical-sufficiency test.
 *
 *  - **Concentration** (`maxTopWitnessShare`) — is the evidence dominated by a
 *    single witness?
 *
 * Neither axis is a Sybil defense. Cheng & Friedman (2005) prove no *symmetric*
 * reputation function is Sybilproof, and this aggregate is symmetric — a Sybil
 * that spreads across many addresses inflates the sample and *lowers* uncertainty,
 * passing a sufficiency gate rather than tripping it. Adversarial resistance lives
 * in the identity layer (staking / proof-of-personhood) and, optionally, in a
 * caller-supplied trust anchor set fed through the credibility function. These
 * gates filter *weak* signals, not adversarial ones — see docs/THEORY.md §3, §6.
 */

import type { Reputation } from "../calculator/index.js";

export type EscalationThresholds = {
  /** Escalate if fewer than this many distinct witnesses contributed. */
  minWitnesses?: number;
  /** Escalate if the uncertainty mass exceeds this (too little evidence). */
  maxUncertainty?: number;
  /** Escalate if a single witness supplied more than this fraction of entries. */
  maxTopWitnessShare?: number;
};

export type EscalationVerdict = {
  /** True if any declared threshold was tripped — don't trust the point estimate. */
  escalate: boolean;
  /** One human-readable reason per tripped threshold; empty when not escalating. */
  reasons: string[];
};

/**
 * Pure: evaluates a `Reputation` against a caller-declared threshold set. A missing
 * threshold is simply not checked, so `shouldEscalate(rep, {})` never escalates.
 */
export function shouldEscalate(rep: Reputation, thresholds: EscalationThresholds): EscalationVerdict {
  const reasons: string[] = [];

  if (thresholds.minWitnesses !== undefined && rep.witnesses < thresholds.minWitnesses) {
    reasons.push(
      `insufficient witnesses: ${rep.witnesses} < ${thresholds.minWitnesses} (sufficiency)`,
    );
  }
  if (thresholds.maxUncertainty !== undefined && rep.uncertainty > thresholds.maxUncertainty) {
    reasons.push(
      `uncertainty too high: ${rep.uncertainty.toFixed(3)} > ${thresholds.maxUncertainty} (sufficiency)`,
    );
  }
  if (
    thresholds.maxTopWitnessShare !== undefined &&
    rep.topWitnessShare > thresholds.maxTopWitnessShare
  ) {
    reasons.push(
      `evidence too concentrated: ${rep.topWitnessShare.toFixed(3)} > ${thresholds.maxTopWitnessShare} (concentration)`,
    );
  }

  return { escalate: reasons.length > 0, reasons };
}
