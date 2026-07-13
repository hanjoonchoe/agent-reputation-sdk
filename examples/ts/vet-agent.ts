/**
 * Pre-delegation guard: before an agent hands off work (or funds) to another
 * ERC-8004 agent, read the on-chain facts and compute reputation under your own
 * declared policy — then refuse to proceed unless the registration file is
 * verified and the result is confident enough.
 *
 * Usage:
 *   npx tsx examples/ts/vet-agent.ts [agentId] [uncertaintyThreshold]
 *
 * Requires `pnpm build` to have run first (this imports the built `agent-reputation`
 * package, exactly as a real consumer would via `npm install agent-reputation`).
 * Exits nonzero — and refuses to proceed — if the registration file isn't verified
 * or the capped-variant uncertainty exceeds the threshold (default 0.3).
 */
import { createPublicClient, fallback, http } from "viem";
import { base } from "viem/chains";
import { calculateReputation, erc8004Actions } from "agent-reputation";

const agentId = BigInt(process.argv[2] ?? "1");
const uncertaintyThreshold = Number(process.argv[3] ?? "0.3");

const client = createPublicClient({
  chain: base,
  transport: fallback([
    http("https://base-rpc.publicnode.com"),
    http("https://base.llamarpc.com"),
    http("https://mainnet.base.org"),
  ]),
}).extend(erc8004Actions());

// Facts layer: no opinions, just typed reads.
const agent = await client.getAgent({ agentId });
const file = await client.getRegistrationFile({ agentId });
const feedback = await client.getAgentFeedback({ agentId });

// Calculator layer: your policy in, evidence-rich result out. Two variants of the
// same policy family — pooled evidence (A) vs. one evidence unit per witness (B) —
// so a single Sybil-heavy witness can't dominate the capped view.
const pooled = calculateReputation(feedback, { witnessCap: null, credibilityName: "uniform" });
const capped = calculateReputation(feedback, { witnessCap: 1, credibilityName: "uniform" });

console.log(`Agent #${agentId} — owner ${agent.owner}`);
console.log(`registration file: verified=${file.verified} (source=${file.source})`);
console.log(
  `variant A (pooled): expectation=${pooled.expectation.toFixed(3)} uncertainty=${pooled.uncertainty.toFixed(3)} witnesses=${pooled.witnesses}`,
);
console.log(
  `variant B (capped): expectation=${capped.expectation.toFixed(3)} uncertainty=${capped.uncertainty.toFixed(3)} witnesses=${capped.witnesses}`,
);
console.log(`caveats: ${capped.caveats.join(" ")}`);

const verified = file.verified === true;
const confident = capped.uncertainty <= uncertaintyThreshold;

if (!verified || !confident) {
  console.error(
    `\nREFUSE to delegate: verified=${file.verified}, uncertainty=${capped.uncertainty.toFixed(3)} (threshold ${uncertaintyThreshold}).`,
  );
  process.exit(1);
}

console.log("\nOK to proceed — subject to your own further judgment; this is not a score.");
