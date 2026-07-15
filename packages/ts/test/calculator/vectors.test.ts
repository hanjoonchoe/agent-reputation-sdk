import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { activitySqrt, calculateReputation } from "../../src/calculator/index.js";
import type { FeedbackEntry } from "../../src/calculator/index.js";

/**
 * Conformance test — the cross-language contract. Loads the golden vector fixture
 * (generated from LIVE Base mainnet data by scripts/generate-vectors.mjs) and
 * re-derives every expected row with NO network access, asserting 3-decimal
 * equality. Every language implementation of this calculator must pass an
 * equivalent test against the same fixture file.
 */

type FixtureExpectedRow = {
  agentId: number;
  variant: "A" | "B";
  witnessCap: number | null;
  baseRate?: number;
  expectation: number;
  uncertainty: number;
  witnesses: number;
  topWitnessShare: number;
};

type Fixture = {
  meta: {
    chain: string;
    chainId: number;
    retrieved: string;
    agents: number[];
    credibility: string;
  };
  feedback: Record<string, FeedbackEntry[]>;
  distinctCounts: Record<string, number>;
  expected: FixtureExpectedRow[];
};

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, "..", "..", "..", "..", "vectors", "base-2026-07-13.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture;

function round3(n: number): number {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * 1000)) / 1000;
}

describe("golden vector conformance (base-2026-07-13.json)", () => {
  it("fixture has 23 expected rows (A + B for agents 0-9, plus 3 base-rate cases)", () => {
    expect(fixture.expected).toHaveLength(23);
  });

  for (const row of fixture.expected) {
    const label = row.baseRate === undefined ? "" : ` baseRate=${row.baseRate}`;
    it(`agent ${row.agentId} variant ${row.variant} (witnessCap=${row.witnessCap})${label}`, () => {
      const entries = fixture.feedback[String(row.agentId)] as FeedbackEntry[];
      const credibility = activitySqrt(fixture.distinctCounts);

      const rep = calculateReputation(entries, {
        witnessCap: row.witnessCap,
        credibility,
        credibilityName: "activity-sqrt",
        baseRate: row.baseRate,
      });

      expect(round3(rep.expectation)).toBe(row.expectation);
      expect(round3(rep.uncertainty)).toBe(row.uncertainty);
      expect(rep.witnesses).toBe(row.witnesses);
      expect(round3(rep.topWitnessShare)).toBe(row.topWitnessShare);
    });
  }
});

describe("known-table cross-check (vectors/README.md)", () => {
  const knownTable: FixtureExpectedRow[] = [
    {
      agentId: 0,
      variant: "A",
      witnessCap: null,
      expectation: 0.847,
      uncertainty: 0.075,
      witnesses: 8,
      topWitnessShare: 0.32,
    },
    {
      agentId: 0,
      variant: "B",
      witnessCap: 1,
      expectation: 0.66,
      uncertainty: 0.338,
      witnesses: 8,
      topWitnessShare: 0.32,
    },
    {
      agentId: 1,
      variant: "A",
      witnessCap: null,
      expectation: 0.7,
      uncertainty: 0.096,
      witnesses: 20,
      topWitnessShare: 0.15,
    },
    {
      agentId: 1,
      variant: "B",
      witnessCap: 1,
      expectation: 0.665,
      uncertainty: 0.179,
      witnesses: 20,
      topWitnessShare: 0.15,
    },
    {
      agentId: 6,
      variant: "A",
      witnessCap: null,
      expectation: 0.6,
      uncertainty: 0.2,
      witnesses: 3,
      topWitnessShare: 0.75,
    },
    {
      agentId: 6,
      variant: "B",
      witnessCap: 1,
      expectation: 0.7,
      uncertainty: 0.4,
      witnesses: 3,
      topWitnessShare: 0.75,
    },
  ];

  for (const known of knownTable) {
    it(`agent ${known.agentId} variant ${known.variant} matches vectors/README.md (2-decimal topWitnessShare)`, () => {
      const row = fixture.expected.find(
        (r) => r.agentId === known.agentId && r.variant === known.variant,
      );
      expect(row).toBeDefined();
      expect(row?.expectation).toBe(known.expectation);
      expect(row?.uncertainty).toBe(known.uncertainty);
      expect(row?.witnesses).toBe(known.witnesses);
      // README table displays topWitnessShare to 2 decimals; the fixture stores 3.
      expect(Math.round((row?.topWitnessShare ?? 0) * 100) / 100).toBe(known.topWitnessShare);
    });
  }
});
