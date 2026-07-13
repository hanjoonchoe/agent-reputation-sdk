import type { Address } from "viem";
import { readContract } from "viem/actions";
import type { Erc8004Client } from "../chains/resolve.js";
import { requireChainConfig } from "../chains/resolve.js";
import { RpcError } from "../errors.js";
import { loadAbi } from "../registry/loadAbi.js";
import { getAgent } from "./getAgent.js";

/**
 * `getAgentFeedback` — typed reads against the Reputation Registry.
 *
 * Contract-function mapping (mined from `web3-agents-mcp` commit
 * `243257ffddcbf82b16a73b22d061910281f4be4c`, `src/registry/reputation.ts`):
 *
 * | Reputation Registry surface (full)        | Used by this module?                                             |
 * | ------------------------------------------ | ------------------------------------------------------------------ |
 * | `getClients(agentId)`                       | no — only needed to build the `clientAddresses` argument that the  |
 * |                                              | deployed `getSummary` requires (it reverts on an empty array); a   |
 * |                                              | per-entry listing has no such requirement                          |
 * | `getSummary(agentId, clients, "", "")`       | no — an aggregate (count/average), not a per-entry listing; not     |
 * |                                              | part of this action's return shape                                 |
 * | `readAllFeedback(agentId, [], "", "", false)`| **yes** — this is the function actually called. Its empty          |
 * |                                              | `clientAddresses` array means "all clients" (unlike `getSummary`'s  |
 * |                                              | revert-on-empty behavior), and it returns the full per-entry array  |
 * |                                              | this action needs. The contract exposes no native offset/limit, so  |
 * |                                              | `limit`/`offset` are applied client-side after decoding             |
 *
 * ## Score scale
 *
 * `giveFeedback(agentId, value, valueDecimals, ...)` accepts any signed `int128 value`
 * with `valueDecimals` in `[0, 18]` — the contract enforces no canonical "score" range.
 * This module assumes the common ERC-8004 convention that feedback values are a 0-100
 * rating: `score = clamp(Number(value) / 10 ** valueDecimals, 0, 100)`. A submitter using
 * a different scale (e.g. raw -1..1 sentiment) would be silently misrepresented as a
 * clamped boundary value — best-effort, not a verified on-chain guarantee (Deviation,
 * carried over from the mined project's own documented assumption).
 *
 * ## `tag`, `uri`, `timestamp`
 *
 * The contract stores two free-text tags (`tag1`, `tag2`) per feedback item; this module
 * surfaces `tag1` as `tag` (empty string -> `null`), `tag2` is not exposed. No read
 * function returns a per-feedback URI or timestamp (`feedbackURI`/`NewFeedback`'s block
 * time are only available via the event log, out of scope here) — `uri` and `timestamp`
 * are therefore always `null`.
 *
 * ## Error mapping
 *
 * Agent existence is checked via `getAgent` first, so an unregistered `agentId` surfaces
 * `AgentNotFoundError` from there rather than a confusing empty feedback array. The
 * Reputation Registry itself has no existence-revert semantics for `readAllFeedback`
 * (a plain mapping, empty result for an unknown id) — any other failure is `RpcError`.
 */

const reputationAbi = loadAbi("reputation");

export type FeedbackEntry = {
  client: Address;
  score: number;
  tag: string | null;
  uri: string | null;
  timestamp: bigint | null;
};

export type GetAgentFeedbackParameters = { agentId: bigint; limit?: number; offset?: number };

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 200;

function clampLimit(limit: number): number {
  return Math.max(0, Math.min(limit, MAX_LIMIT));
}

function clampOffset(offset: number): number {
  return Math.max(0, offset);
}

/** Decodes an on-chain (value, valueDecimals) pair to a best-effort 0-100 score. */
function normalizeScore(value: bigint, decimals: number): number {
  const raw = Number(value) / 10 ** decimals;
  return Math.max(0, Math.min(100, raw));
}

export async function getAgentFeedback(
  client: Erc8004Client,
  { agentId, limit = DEFAULT_LIMIT, offset = 0 }: GetAgentFeedbackParameters,
): Promise<FeedbackEntry[]> {
  await getAgent(client, { agentId }); // throws AgentNotFoundError for unregistered agents

  const config = requireChainConfig(client);
  const clampedLimit = clampLimit(limit);
  const clampedOffset = clampOffset(offset);

  try {
    const [clients, , values, valueDecimals, tag1s] = (await readContract(client, {
      address: config.registries.reputation,
      abi: reputationAbi,
      functionName: "readAllFeedback",
      args: [agentId, [], "", "", false],
    })) as [
      readonly Address[],
      readonly bigint[],
      readonly bigint[],
      readonly number[],
      readonly string[],
      readonly string[],
      readonly boolean[],
    ];

    const entries: FeedbackEntry[] = clients.map((clientAddress, index) => ({
      client: clientAddress,
      score: normalizeScore(values[index] ?? 0n, valueDecimals[index] ?? 0),
      tag: tag1s[index] && tag1s[index].length > 0 ? tag1s[index] : null,
      uri: null,
      timestamp: null,
    }));

    return entries.slice(clampedOffset, clampedOffset + clampedLimit);
  } catch (cause) {
    throw new RpcError(cause);
  }
}
