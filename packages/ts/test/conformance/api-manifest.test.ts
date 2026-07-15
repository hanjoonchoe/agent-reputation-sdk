import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { erc8004Actions } from "../../src/actions/erc8004Actions.js";
import * as sdk from "../../src/index.js";

const manifest = JSON.parse(
  readFileSync(new URL("../../../../conformance/api-manifest.json", import.meta.url), "utf8"),
) as {
  methods: Record<string, { ts: string }>;
  resultFields: { Reputation: string[]; EscalationVerdict: string[] };
  errorNames: string[];
  credibilityStrategies: string[];
};

// Free functions on the calculator/gate surface — asserted individually below, not as
// keys on the viem actions object.
const FREE_FUNCTIONS = new Set(["calculateReputation", "shouldEscalate"]);

describe("conformance/api-manifest.json", () => {
  it("erc8004Actions() exposes the canonical facts-layer method names", () => {
    // `{}` stands in for a viem Client — none of these methods are invoked, only their
    // presence as keys on the returned actions object is checked.
    const actions = erc8004Actions()({} as never);
    const expected = Object.entries(manifest.methods)
      .filter(([, names]) => !FREE_FUNCTIONS.has(names.ts))
      .map(([, names]) => names.ts)
      .sort();
    expect(Object.keys(actions).sort()).toEqual(expected);
  });

  it("shouldEscalate is exported and returns the canonical EscalationVerdict fields", () => {
    expect(typeof sdk.shouldEscalate).toBe("function");
    const rep = sdk.calculateReputation([{ client: "0xabc", score: 50 }]);
    const verdict = sdk.shouldEscalate(rep, {});
    expect(Object.keys(verdict).sort()).toEqual([...manifest.resultFields.EscalationVerdict].sort());
  });

  it("exports the canonical error classes", () => {
    for (const name of manifest.errorNames) {
      const className = `${name}Error`;
      expect(sdk).toHaveProperty(className);
      expect(typeof (sdk as unknown as Record<string, unknown>)[className]).toBe("function");
    }
  });

  it("credibility strategies are exported under their canonical names", () => {
    expect(sdk.uniform().name).toBe("uniform");
    expect(sdk.activitySqrt({}).name).toBe(manifest.credibilityStrategies[1]);
    expect(manifest.credibilityStrategies).toEqual(["uniform", "activity-sqrt"]);
  });

  it("a sample Reputation object has exactly the canonical field names", () => {
    const rep = sdk.calculateReputation([{ client: "0xabc", score: 50 }]);
    expect(Object.keys(rep).sort()).toEqual([...manifest.resultFields.Reputation].sort());
  });
});
