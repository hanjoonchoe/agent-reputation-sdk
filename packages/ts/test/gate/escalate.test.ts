import { describe, expect, it } from "vitest";
import { calculateReputation } from "../../src/calculator/index.js";
import { shouldEscalate } from "../../src/gate/escalate.js";

describe("shouldEscalate", () => {
  it("does not escalate when no thresholds are declared", () => {
    const rep = calculateReputation([{ client: "0xabc", score: 90 }]);
    expect(shouldEscalate(rep, {})).toEqual({ escalate: false, reasons: [] });
  });

  it("escalates thin evidence on the sufficiency axis", () => {
    // 3 entries from one witness -> few witnesses, high uncertainty.
    const rep = calculateReputation([
      { client: "0xa", score: 100 },
      { client: "0xa", score: 100 },
      { client: "0xa", score: 100 },
    ]);
    const verdict = shouldEscalate(rep, { minWitnesses: 5, maxUncertainty: 0.2 });
    expect(verdict.escalate).toBe(true);
    expect(verdict.reasons.some((r) => r.includes("witnesses"))).toBe(true);
    expect(verdict.reasons.some((r) => r.includes("uncertainty"))).toBe(true);
  });

  it("escalates concentrated evidence on the concentration axis", () => {
    // One witness supplies 3 of 4 entries -> topWitnessShare 0.75.
    const rep = calculateReputation([
      { client: "0xa", score: 80 },
      { client: "0xa", score: 80 },
      { client: "0xa", score: 80 },
      { client: "0xb", score: 80 },
    ]);
    const verdict = shouldEscalate(rep, { maxTopWitnessShare: 0.5 });
    expect(verdict.escalate).toBe(true);
    expect(verdict.reasons).toHaveLength(1);
    expect(verdict.reasons[0]).toContain("concentrated");
  });

  it("empty feedback (uncertainty 1.0) always escalates a sufficiency gate", () => {
    const rep = calculateReputation([]);
    expect(rep.uncertainty).toBe(1);
    expect(shouldEscalate(rep, { maxUncertainty: 0.9 }).escalate).toBe(true);
  });
});
