#!/usr/bin/env node
/**
 * Generates vectors/base-2026-07-13.json — the cross-language golden test vector
 * fixture — from LIVE Base mainnet feedback (agents 0-9), read through
 * web3-agents-mcp's compiled facts layer (`dist/registry/reputation.js`).
 *
 * Usage:
 *   node scripts/generate-vectors.mjs
 *
 * Requires `pnpm build` to have been run in the web3-agents-mcp checkout first (this
 * script imports its dist/ output directly, never its TS source).
 *
 * The `expected[]` table in the fixture is computed by THIS repo's own calculator
 * (packages/ts/src/calculator/index.ts) over the snapshot below, so the fixture is
 * self-consistent: `packages/ts/test/calculator/vectors.test.ts` re-derives the same
 * numbers with no network access and asserts 3-decimal equality against this file.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateReputation, activitySqrt } from "../packages/ts/dist/calculator/index.js";

const WEB3_AGENTS_MCP_DIST =
  "/Users/hanjoonchoe/projects/web3-agents-mcp/dist/registry/reputation.js";

const CHAIN_ID = 8453;
const CHAIN_SLUG = "base";
const AGENT_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const RETRIEVED = "2026-07-13";

function round3(n) {
  // Round half away from zero, to 3 decimals.
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * 1000)) / 1000;
}

async function main() {
  const { readFeedback } = await import(WEB3_AGENTS_MCP_DIST);

  const feedback = {};
  const distinctSets = new Map(); // client (lowercase) -> Set(agentId)

  for (const agentId of AGENT_IDS) {
    const result = await readFeedback(CHAIN_ID, BigInt(agentId), { limit: 200, offset: 0 });
    if (!result.ok) {
      console.error(`BLOCKED: readFeedback(${CHAIN_ID}, ${agentId}) failed:`, result.error);
      process.exit(1);
    }
    const entries = result.value.map((e) => ({ client: e.client, score: e.score }));
    feedback[String(agentId)] = entries;

    for (const entry of entries) {
      const key = entry.client.toLowerCase();
      let set = distinctSets.get(key);
      if (!set) {
        set = new Set();
        distinctSets.set(key, set);
      }
      set.add(agentId);
    }
  }

  const distinctCounts = {};
  for (const [client, set] of distinctSets) {
    distinctCounts[client] = set.size;
  }

  const expected = [];
  for (const agentId of AGENT_IDS) {
    const entries = feedback[String(agentId)];
    const credibility = activitySqrt(distinctCounts);

    for (const [variant, witnessCap] of [
      ["A", null],
      ["B", 1],
    ]) {
      const rep = calculateReputation(entries, {
        witnessCap,
        credibility,
        credibilityName: "activity-sqrt",
      });
      expected.push({
        agentId,
        variant,
        witnessCap,
        expectation: round3(rep.expectation),
        uncertainty: round3(rep.uncertainty),
        witnesses: rep.witnesses,
        topWitnessShare: round3(rep.topWitnessShare),
      });
    }
  }

  const fixture = {
    meta: {
      chain: CHAIN_SLUG,
      chainId: CHAIN_ID,
      retrieved: RETRIEVED,
      agents: AGENT_IDS,
      credibility: "activity-sqrt over agents 0-9",
    },
    feedback,
    distinctCounts,
    expected,
  };

  const here = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.join(here, "..", "vectors", "base-2026-07-13.json");
  writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");

  console.log(`Wrote ${outPath}`);
  console.table(expected);
}

main().catch((err) => {
  console.error("BLOCKED:", err);
  process.exit(1);
});
