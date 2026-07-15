/**
 * Pure reputation calculator for ERC-8004 on-chain feedback.
 *
 * Zero dependencies. No viem, no I/O, no clock, no randomness — a plain function of
 * its inputs. Consumes raw `FeedbackEntry[]` (as read by the facts layer) and a
 * declared `Policy`, and returns an evidence-rich `Reputation` result: never a bare
 * scalar.
 *
 * ## Algorithm (normative)
 *
 * For each feedback entry, `v = clamp(score, 0, 100) / 100`. Entries are grouped by
 * client address, compared case-insensitively (addresses are lowercased before
 * grouping). For each client `k` with entries `v_1..v_n`:
 *
 *   r_k = Σ v_i
 *   s_k = Σ (1 - v_i)
 *
 * If the policy declares a `witnessCap` `W` (variant B — one evidence unit per
 * witness), `(r_k, s_k)` are scaled by `min(1, W / (r_k + s_k))` before anything
 * else. `witnessCap` of `null`/`undefined` (variant A) pools all evidence
 * unscaled.
 *
 * Each client's (possibly capped) `(r_k, s_k)` is then discounted by that client's
 * credibility weight `c_k` (in `[0, 1]`, from `Policy.credibility`, default
 * `uniform()` i.e. `c_k = 1` for everyone):
 *
 *   r_k *= c_k
 *   s_k *= c_k
 *
 * All per-client pairs are summed into totals `r = Σ r_k`, `s = Σ s_k`, and the
 * result is read off a Beta(1,1)-prior posterior:
 *
 *   expectation  = (r + 1) / (r + s + 2)
 *   uncertainty  = 2 / (r + s + 2)
 *
 * `topWitnessShare` is the largest per-client *entry count* divided by the total
 * entry count (unweighted — a simple concentration signal, independent of
 * `witnessCap`/credibility).
 *
 * Decay (time-weighting recent feedback more heavily) is reserved in the `Policy`
 * shape but not implemented in v1: on-chain reads currently expose no per-entry
 * timestamp (see the facts layer's `readFeedback` — `timestamp` is always `null`),
 * so there is nothing to decay against yet.
 *
 * ## Determinism
 *
 * Client accumulation happens in ascending lowercase-address sort order, and all
 * arithmetic is plain IEEE-754 double precision (`number`). Every conformant
 * implementation (this one, and any other language's) MUST accumulate in this same
 * order so that floating-point summation is bit-for-bit reproducible across runs
 * and across languages, not merely "close" — this is what makes the golden test
 * vectors in `vectors/` a meaningful cross-language contract.
 *
 * Primary source: Jøsang & Ismail (2002), "The Beta Reputation System",
 * 15th Bled eConference — https://www.mn.uio.no/ifi/english/people/aca/josang/publications/ji2002-bled.pdf
 * (expectation = Laplace rule of succession; witness fusion = subjective-logic consensus;
 * credibility weighting = the discount operator.)
 */

export type FeedbackEntry = {
  client: string;
  /** 0-100. Values above 100 are clamped; negative or non-finite values are invalid input. */
  score: number;
};

export type Policy = {
  /** null/undefined = variant A (pool all evidence). W > 0 = variant B (cap each witness's evidence to W units). */
  witnessCap?: number | null;
  /** c_k in [0, 1] per client address (case-insensitive). Default: uniform() = () => 1. */
  credibility?: (client: string) => number;
  /**
   * Base rate `a` in [0, 1] — the fourth term of Jøsang's (b, d, u, a) opinion, i.e.
   * the prior the expectation reverts to when evidence is absent. `E = b + a*u =
   * (r + 2a) / (r + s + 2)`. Default 0.5 reproduces the Beta(1,1) / Laplace prior
   * (and every existing golden vector). A conservative caller lowers it so that a
   * high-uncertainty result leans pessimistic; an optimistic caller raises it.
   */
  baseRate?: number;
  // decay reserved for a future version; not implemented in v1 (no timestamps in current reads).
};

export type Reputation = {
  expectation: number;
  uncertainty: number;
  witnesses: number;
  entries: number;
  topWitnessShare: number;
  caveats: string[];
  policy: { witnessCap: number | null; credibility: string; baseRate: number };
};

/**
 * Caveats — verbatim strings, copied from web3-agents-mcp's
 * `src/trust/caveats.ts` (SYBIL_CAVEAT, SCALE_CAVEAT) and
 * `src/tools/get-reputation.ts` (the no-feedback / low-volume wording), so that a
 * consumer of both packages sees consistent language.
 */
const SYBIL_CAVEAT =
  "Feedback is self-reported by clients and may include Sybil or spam entries; treat scores as a weak signal.";
const SCALE_CAVEAT =
  "On-chain feedback uses inconsistent score scales; averages are clamped to 0-100 and may overstate quality.";
const NO_FEEDBACK_CAVEAT = "No feedback recorded.";

function lowVolumeCaveat(count: number): string {
  return `Only ${count} feedback entries exist; statistics are not meaningful.`;
}

/** Default credibility policy: every client weighted equally (c_k = 1). */
export function uniform(): (client: string) => number {
  const fn = (_client: string): number => 1;
  Object.defineProperty(fn, "name", { value: "uniform" });
  return fn;
}

/**
 * Activity-weighted credibility: c_k = sqrt(d_k) / sqrt(d_max), where `d_k` is the
 * number of distinct agents client `k` has rated (from `distinctCounts`, keyed by
 * client address, case-insensitive) and `d_max` is the largest distinct count in
 * the map. Clients absent from `distinctCounts` are treated as `d_k = 0`.
 */
export function activitySqrt(distinctCounts: Record<string, number>): (client: string) => number {
  const normalized = new Map<string, number>();
  let maxD = 0;
  for (const [client, count] of Object.entries(distinctCounts)) {
    const key = client.toLowerCase();
    normalized.set(key, count);
    if (count > maxD) {
      maxD = count;
    }
  }

  const fn = (client: string): number => {
    if (maxD <= 0) {
      return 0;
    }
    const d = normalized.get(client.toLowerCase()) ?? 0;
    return Math.sqrt(d) / Math.sqrt(maxD);
  };
  Object.defineProperty(fn, "name", { value: "activity-sqrt" });
  return fn;
}

/** Validates and normalizes a raw 0-100 (or beyond) score into v = clamp(score, 0, 100) / 100. */
function toUnitScore(score: number): number {
  if (typeof score !== "number" || Number.isNaN(score)) {
    throw new TypeError(`FeedbackEntry.score must be a number, got ${String(score)}`);
  }
  if (score < 0) {
    throw new TypeError(`FeedbackEntry.score must be >= 0, got ${score}`);
  }
  const clamped = Math.min(score, 100);
  return clamped / 100;
}

export function calculateReputation(
  entries: FeedbackEntry[],
  policy: Policy & { credibilityName?: string } = {},
): Reputation {
  const witnessCap =
    policy.witnessCap === undefined || policy.witnessCap === null ? null : policy.witnessCap;
  const credibilityFn = policy.credibility ?? uniform();
  const credibilityName =
    policy.credibilityName ?? (credibilityFn.name.length > 0 ? credibilityFn.name : "custom");
  const baseRate = policy.baseRate ?? 0.5;
  if (baseRate < 0 || baseRate > 1 || Number.isNaN(baseRate)) {
    throw new RangeError(`Policy.baseRate must be in [0, 1], got ${baseRate}`);
  }
  const echoedPolicy = { witnessCap, credibility: credibilityName, baseRate };

  const totalEntries = entries.length;

  if (totalEntries === 0) {
    // No evidence: expectation reverts to the base rate, uncertainty is maximal.
    return {
      expectation: baseRate,
      uncertainty: 1,
      witnesses: 0,
      entries: 0,
      topWitnessShare: 0,
      caveats: [SYBIL_CAVEAT, NO_FEEDBACK_CAVEAT],
      policy: echoedPolicy,
    };
  }

  // Group by lowercase client address (case-insensitive grouping), preserving each
  // entry's normalized value for later per-client accumulation.
  const groups = new Map<string, number[]>();
  for (const entry of entries) {
    const v = toUnitScore(entry.score);
    const key = entry.client.toLowerCase();
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(v);
    } else {
      groups.set(key, [v]);
    }
  }

  // Determinism: accumulate in ascending lowercase-address sort order.
  const sortedClients = Array.from(groups.keys()).sort();

  let r = 0;
  let s = 0;
  let maxCount = 0;

  for (const client of sortedClients) {
    const values = groups.get(client) as number[];
    maxCount = Math.max(maxCount, values.length);

    let rk = 0;
    let sk = 0;
    for (const v of values) {
      rk += v;
      sk += 1 - v;
    }

    if (witnessCap !== null) {
      const total = rk + sk;
      const scale = total > 0 ? Math.min(1, witnessCap / total) : 1;
      rk *= scale;
      sk *= scale;
    }

    const ck = credibilityFn(client);
    rk *= ck;
    sk *= ck;

    r += rk;
    s += sk;
  }

  // E = b + a*u = (r + 2a)/(r+s+2); a = 0.5 recovers Laplace's (r+1)/(r+s+2).
  const expectation = (r + 2 * baseRate) / (r + s + 2);
  const uncertainty = 2 / (r + s + 2);
  const topWitnessShare = maxCount / totalEntries;

  const caveats = [SYBIL_CAVEAT, SCALE_CAVEAT];
  if (totalEntries < 5) {
    caveats.push(lowVolumeCaveat(totalEntries));
  }

  return {
    expectation,
    uncertainty,
    witnesses: sortedClients.length,
    entries: totalEntries,
    topWitnessShare,
    caveats,
    policy: echoedPolicy,
  };
}
