import { describe, expect, it } from "vitest";
import { activitySqrt, calculateReputation, uniform } from "../../src/calculator/index.js";
import type { FeedbackEntry } from "../../src/calculator/index.js";

const SYBIL_CAVEAT =
  "Feedback is self-reported by clients and may include Sybil or spam entries; treat scores as a weak signal.";
const SCALE_CAVEAT =
  "On-chain feedback uses inconsistent score scales; averages are clamped to 0-100 and may overstate quality.";

describe("calculateReputation", () => {
  it("empty input: r=s=0, E=0.5, u=1, no witnesses, single Sybil + no-feedback caveat", () => {
    const result = calculateReputation([]);
    expect(result.expectation).toBe(0.5);
    expect(result.uncertainty).toBe(1);
    expect(result.witnesses).toBe(0);
    expect(result.entries).toBe(0);
    expect(result.topWitnessShare).toBe(0);
    expect(result.caveats).toEqual([SYBIL_CAVEAT, "No feedback recorded."]);
    expect(result.policy).toEqual({ witnessCap: null, credibility: "uniform" });
  });

  it("single witness repeated 3x100: r=3, s=0 -> E=0.8, u=0.4", () => {
    const entries: FeedbackEntry[] = [
      { client: "0xAAA", score: 100 },
      { client: "0xAAA", score: 100 },
      { client: "0xAAA", score: 100 },
    ];
    const result = calculateReputation(entries);
    expect(result.expectation).toBeCloseTo(0.8, 12);
    expect(result.uncertainty).toBeCloseTo(0.4, 12);
    expect(result.witnesses).toBe(1);
    expect(result.entries).toBe(3);
    expect(result.topWitnessShare).toBe(1);
  });

  it("witnessCap W=1 scales a single dominant witness down toward one evidence unit", () => {
    // One witness giving 3x100 (uncapped r=3,s=0) vs. capped at W=1: r_k+s_k=3,
    // scale=min(1,1/3)=1/3 -> r_k=1, s_k=0 -> r=1,s=0 -> E=(1+1)/(1+0+2)=2/3, u=2/3.
    const entries: FeedbackEntry[] = [
      { client: "0xAAA", score: 100 },
      { client: "0xAAA", score: 100 },
      { client: "0xAAA", score: 100 },
    ];
    const uncapped = calculateReputation(entries);
    const capped = calculateReputation(entries, { witnessCap: 1 });
    expect(capped.expectation).toBeCloseTo(2 / 3, 12);
    expect(capped.uncertainty).toBeCloseTo(2 / 3, 12);
    expect(capped.policy.witnessCap).toBe(1);
    expect(capped.expectation).not.toBeCloseTo(uncapped.expectation, 6);
  });

  it("credibility discount scales a client's (r_k, s_k) by c_k", () => {
    const entries: FeedbackEntry[] = [{ client: "0xAAA", score: 100 }];
    const halfCredible = calculateReputation(entries, {
      credibility: () => 0.5,
      credibilityName: "half",
    });
    // r_k=1,s_k=0 discounted by 0.5 -> r=0.5,s=0 -> E=(0.5+1)/(0.5+0+2)=1.5/2.5=0.6
    expect(halfCredible.expectation).toBeCloseTo(0.6, 12);
    expect(halfCredible.policy.credibility).toBe("half");
  });

  it("activitySqrt names itself and computes sqrt(d_k)/sqrt(d_max)", () => {
    const cred = activitySqrt({ "0xaaa": 1, "0xbbb": 4 });
    expect(cred.name).toBe("activity-sqrt");
    expect(cred("0xAAA")).toBeCloseTo(Math.sqrt(1) / Math.sqrt(4), 12);
    expect(cred("0xBBB")).toBeCloseTo(1, 12);
    expect(cred("0xUNKNOWN")).toBe(0);
  });

  it("uniform() names itself and always returns 1", () => {
    const cred = uniform();
    expect(cred.name).toBe("uniform");
    expect(cred("anything")).toBe(1);
  });

  it("clamp bounds: score > 100 is clamped to 100", () => {
    const clampedHigh = calculateReputation([{ client: "0xAAA", score: 150 }]);
    const atCap = calculateReputation([{ client: "0xAAA", score: 100 }]);
    expect(clampedHigh.expectation).toBe(atCap.expectation);
  });

  it("invalid input: negative score throws TypeError", () => {
    expect(() => calculateReputation([{ client: "0xAAA", score: -1 }])).toThrow(TypeError);
  });

  it("invalid input: NaN score throws TypeError", () => {
    expect(() => calculateReputation([{ client: "0xAAA", score: NaN }])).toThrow(TypeError);
  });

  it("case-insensitive client grouping: 0xAAA and 0xaaa are the same witness", () => {
    const entries: FeedbackEntry[] = [
      { client: "0xAAA", score: 100 },
      { client: "0xaaa", score: 100 },
    ];
    const result = calculateReputation(entries);
    expect(result.witnesses).toBe(1);
    expect(result.entries).toBe(2);
    expect(result.topWitnessShare).toBe(1);
  });

  it("determinism: shuffled input produces identical output", () => {
    const base: FeedbackEntry[] = [
      { client: "0xCCC", score: 90 },
      { client: "0xAAA", score: 10 },
      { client: "0xBBB", score: 55 },
      { client: "0xAAA", score: 70 },
      { client: "0xDDD", score: 33.3 },
    ];
    const shuffled = [base[3], base[1], base[4], base[0], base[2]] as FeedbackEntry[];

    const resultA = calculateReputation(base, {
      witnessCap: 1,
      credibility: activitySqrt({ "0xaaa": 2, "0xbbb": 4 }),
    });
    const resultB = calculateReputation(shuffled, {
      witnessCap: 1,
      credibility: activitySqrt({ "0xaaa": 2, "0xbbb": 4 }),
    });

    expect(resultB).toEqual(resultA);
  });

  it("low-volume caveat appears for 0 < entries < 5", () => {
    const result = calculateReputation([
      { client: "0xAAA", score: 80 },
      { client: "0xBBB", score: 60 },
    ]);
    expect(result.caveats).toEqual([
      SYBIL_CAVEAT,
      SCALE_CAVEAT,
      "Only 2 feedback entries exist; statistics are not meaningful.",
    ]);
  });

  it("no low-volume caveat once entries >= 5", () => {
    const entries: FeedbackEntry[] = Array.from({ length: 5 }, (_, i) => ({
      client: `0x${i}`,
      score: 50,
    }));
    const result = calculateReputation(entries);
    expect(result.caveats).toEqual([SYBIL_CAVEAT, SCALE_CAVEAT]);
  });
});
