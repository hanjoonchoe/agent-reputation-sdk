import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateReputation } from "../../src/calculator/index.js";

/**
 * Asserts the caveat strings embedded in this package's calculator byte-match
 * `conformance/caveats.json` — the canonical extraction from this very module. This
 * doesn't (and can't) inspect the private constants directly; instead it drives
 * `calculateReputation` into each caveat-producing branch and compares the caveats it
 * emits against the fixture, which is the observable contract every language's port
 * must reproduce.
 */
const fixture = JSON.parse(
  readFileSync(new URL("../../../../conformance/caveats.json", import.meta.url), "utf8"),
) as { sybil: string; scale: string; lowVolume: string; noFeedback: string };

function lowVolume(n: number): string {
  return fixture.lowVolume.replace("{n}", String(n));
}

describe("conformance/caveats.json", () => {
  it("no-feedback: sybil + noFeedback, no scale caveat", () => {
    const rep = calculateReputation([]);
    expect(rep.caveats).toEqual([fixture.sybil, fixture.noFeedback]);
  });

  it("low-volume (< 5 entries): sybil + scale + lowVolume(n)", () => {
    const entries = [
      { client: "0xabc", score: 80 },
      { client: "0xdef", score: 60 },
      { client: "0x111", score: 40 },
    ];
    const rep = calculateReputation(entries);
    expect(rep.caveats).toEqual([fixture.sybil, fixture.scale, lowVolume(3)]);
  });

  it(">= 5 entries: sybil + scale only, no low-volume caveat", () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({ client: `0x${i}`, score: 50 }));
    const rep = calculateReputation(entries);
    expect(rep.caveats).toEqual([fixture.sybil, fixture.scale]);
  });
});
