/**
 * Caller-relative trust: the tier-2 answer to "how does a consumer filter the way
 * *it* wants?" A symmetric aggregate (plain feedback summation) can't be made
 * Sybil-proof — Cheng & Friedman (2005); see docs/THEORY.md §3.1. The escape is to
 * stop scoring symmetrically and score *relative to a trust anchor the caller
 * supplies*. This example does the 1-hop version by threading the caller's anchor
 * set through the credibility function; a full implementation would propagate trust
 * transitively (flow / random-walk, MeritRank-style).
 *
 * It also shows tier 3 (a conservative `baseRate`) and tier 1 (`shouldEscalate`),
 * so all three policy layers appear together. No chain access — pure calculator.
 *
 *   pnpm --filter agent-reputation build && npx tsx examples/ts/personalized-trust.ts
 */
import { calculateReputation, shouldEscalate, type CalculatorFeedbackEntry } from "agent-reputation";

// Two addresses the caller already trusts (its anchors), plus 50 sybil addresses
// the attacker spun up to flood the target with perfect scores.
const anchors = new Set(["0xa11ce", "0xb0b"].map((a) => a.toLowerCase()));

const feedback: CalculatorFeedbackEntry[] = [
  { client: "0xA11CE", score: 72 }, // honest anchor: "fine, not amazing"
  { client: "0xB0B", score: 68 }, // honest anchor
  ...Array.from({ length: 50 }, (_, i) => ({ client: `0x5b11${i}`, score: 100 })), // sybils
];

// tier 2: credibility = 1 for an anchor, 0 for everyone else. Non-anchor evidence
// contributes nothing, so the 50 sybils cannot move the score.
const anchorTrust = (client: string) => (anchors.has(client.toLowerCase()) ? 1 : 0);

const naive = calculateReputation(feedback, { witnessCap: 1, credibilityName: "uniform" });
const personalized = calculateReputation(feedback, {
  credibility: anchorTrust,
  credibilityName: "caller-anchors",
  baseRate: 0.3, // tier 3: conservative prior — thin evidence leans low
});

// The number of addresses whose evidence actually counts (credibility > 0).
const effectiveWitnesses = [...new Set(feedback.map((f) => f.client.toLowerCase()))].filter(
  (c) => anchorTrust(c) > 0,
).length;

console.log("naive (uniform, capped):", {
  E: naive.expectation.toFixed(3), // 0.970 — 50 sybils inflate the score
  u: naive.uncertainty.toFixed(3), // 0.037 — and deflate uncertainty (52 "witnesses")
  witnesses: naive.witnesses,
});
console.log("personalized (caller anchors):", {
  E: personalized.expectation.toFixed(3), // 0.500 — sybils contribute nothing
  u: personalized.uncertainty.toFixed(3), // 0.500 — only 2 anchors' evidence remains
  witnesses: personalized.witnesses, // 52 — RAW address count, not effective!
  effectiveWitnesses, // 2 — the honest signal (see note below)
});

// tier 1: gate on sufficiency. NOTE: `witnesses` is a raw address count, so under
// anchor credibility it overstates support (52, not 2) — gate on `uncertainty`
// instead, which already reflects the discounted evidence. (An `effectiveWitnesses`
// field on Reputation would let minWitnesses work here too — a candidate improvement.)
const verdict = shouldEscalate(personalized, { maxUncertainty: 0.4 });
console.log("escalate?", verdict.escalate, verdict.reasons);
