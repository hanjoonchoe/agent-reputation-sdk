import { createPublicClient, fallback, http } from "viem";
import { base } from "viem/chains";
import { describe, expect, it } from "vitest";
import { erc8004Actions } from "../../src/actions/erc8004Actions.js";

/**
 * Live smoke test against real Base mainnet — excluded from `pnpm test` (filename
 * matches `*.live.test.ts`), run explicitly via `pnpm test:live`. Requires network
 * access to a public Base RPC. Uses a `fallback([...])` transport over several public
 * endpoints since any single free-tier RPC can intermittently rate-limit.
 */
describe("live smoke: Base mainnet", () => {
  const client = createPublicClient({
    chain: base,
    transport: fallback([
      http("https://base-rpc.publicnode.com"),
      http("https://base.llamarpc.com"),
      http("https://mainnet.base.org"),
    ]),
  }).extend(erc8004Actions());

  it("agent #0: data: URI registration file, verified true", async () => {
    const agent = await client.getAgent({ agentId: 0n });
    expect(agent.agentId).toBe(0n);
    expect(agent.tokenUri.startsWith("data:")).toBe(true);

    const file = await client.getRegistrationFile({ agentId: 0n });
    expect(file.verified).toBe(true);
    expect(file.source).toBe("data");
  }, 30_000);

  it("agent #1: feedback list is non-empty (~39 entries as of 2026-07-13)", async () => {
    const feedback = await client.getAgentFeedback({ agentId: 1n });
    // Loose lower bound rather than an exact count: feedback only ever grows on-chain,
    // so a strict equality check would break this test the next time someone submits
    // feedback for agent #1 between now and a future CI run.
    expect(feedback.length).toBeGreaterThanOrEqual(30);
    for (const entry of feedback) {
      expect(entry.score).toBeGreaterThanOrEqual(0);
      expect(entry.score).toBeLessThanOrEqual(100);
    }
  }, 30_000);
});
