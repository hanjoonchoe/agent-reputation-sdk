import type { Address, Hex } from "viem";
import { multicall, readContract } from "viem/actions";
import type { Erc8004Client } from "../chains/resolve.js";
import { requireChainConfig } from "../chains/resolve.js";
import { RpcError } from "../errors.js";
import { loadAbi } from "../registry/loadAbi.js";
import { getAgent } from "./getAgent.js";

/**
 * `getAgentValidations` — typed reads against the Validation Registry.
 *
 * Contract-function mapping (mined from `web3-agents-mcp` commit
 * `243257ffddcbf82b16a73b22d061910281f4be4c`, `src/registry/validation.ts`):
 *
 * | This module                              | Contract function(s)                                              |
 * | ------------------------------------------ | ------------------------------------------------------------------- |
 * | request-hash list                          | `getAgentValidations(agentId)` — full `bytes32[]`, no native         |
 * |                                             | offset/limit; `limit`/`offset` are applied to the hash list          |
 * |                                             | *before* fetching per-hash detail (unlike `getAgentFeedback`, which  |
 * |                                             | must decode the full array first — this avoids that extra work)     |
 * | per-hash detail (requested page only)      | `multicall` of `getValidationStatus(requestHash)` per hash            |
 *
 * ## `response` scale
 *
 * Unlike the Reputation Registry's free-form `value`, `ValidationRegistryUpgradeable`
 * contract-enforces `response` to `[0, 100]` (`require(response <= 100, "resp>100")`) —
 * already the canonical 0-100 scale, decoded here as a plain JS `number`, no rescaling.
 *
 * ## Known gap: pending vs. zero-scored validations are indistinguishable
 *
 * The full contract's `ValidationStatus` struct has a `hasResponse: bool` field, but the
 * minimal `validation.json` ABI mined from `web3-agents-mcp` intentionally excludes it
 * (only `validatorAddress, agentId, response, responseHash, tag, lastUpdate` are
 * decoded). A request made but never responded to is therefore indistinguishable from
 * one responded to with `response = 0`. `response` is surfaced as-is (raw decoded
 * `uint8`) without inventing a "pending" sentinel.
 *
 * ## Method classification
 *
 * `getValidationStatus` returns a free-text `tag` set entirely by the responding
 * validator — there is no on-chain enum. Classification is a best-effort,
 * case-insensitive **exact match** against `"tee"`, `"zk"`, `"reexec"`; anything else
 * (including empty, or a tag merely containing one of those words) maps to `"other"`.
 *
 * ## Timestamp availability
 *
 * `lastUpdate` (`uint256`, `block.timestamp`) is stored on-chain and updated at both
 * `validationRequest` and `validationResponse` time — every entry's `timestamp` is this
 * value directly (never `null`, unlike `getAgentFeedback`).
 *
 * ## Error mapping
 *
 * Agent existence is checked via `getAgent` first (`AgentNotFoundError` for unregistered
 * agents). The Validation Registry itself has no existence-revert semantics for an
 * unknown `agentId` (plain mapping, empty hash list) — any other failure is `RpcError`.
 */

const validationAbi = loadAbi("validation");

export type ValidationMethod = "tee" | "zk" | "reexec" | "other";

export type ValidationEntry = {
  validator: Address;
  method: ValidationMethod;
  requestHash: Hex;
  response: unknown;
  timestamp: bigint | null;
};

export type GetAgentValidationsParameters = { agentId: bigint; limit?: number; offset?: number };

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 200;
const KNOWN_METHODS: readonly ValidationMethod[] = ["tee", "zk", "reexec"];

function clampLimit(limit: number): number {
  return Math.max(0, Math.min(limit, MAX_LIMIT));
}

function clampOffset(offset: number): number {
  return Math.max(0, offset);
}

function classifyMethod(tag: string): ValidationMethod {
  const normalized = tag.trim().toLowerCase();
  const match = KNOWN_METHODS.find((method) => method === normalized);
  return match ?? "other";
}

export async function getAgentValidations(
  client: Erc8004Client,
  { agentId, limit = DEFAULT_LIMIT, offset = 0 }: GetAgentValidationsParameters,
): Promise<ValidationEntry[]> {
  await getAgent(client, { agentId }); // throws AgentNotFoundError for unregistered agents

  const config = requireChainConfig(client);

  let hashes: readonly Hex[];
  try {
    hashes = (await readContract(client, {
      address: config.registries.validation,
      abi: validationAbi,
      functionName: "getAgentValidations",
      args: [agentId],
    })) as readonly Hex[];
  } catch (cause) {
    throw new RpcError(cause);
  }

  if (hashes.length === 0) {
    return [];
  }

  const clampedLimit = clampLimit(limit);
  const clampedOffset = clampOffset(offset);
  const page = hashes.slice(clampedOffset, clampedOffset + clampedLimit);
  if (page.length === 0) {
    return [];
  }

  try {
    const contracts = page.map(
      (hash) =>
        ({
          address: config.registries.validation,
          abi: validationAbi,
          functionName: "getValidationStatus",
          args: [hash],
        }) as const,
    );
    const results = await multicall(client, { contracts, allowFailure: true });

    const entries: ValidationEntry[] = [];
    for (const [index, hash] of page.entries()) {
      const result = results[index];
      if (!result) {
        throw new RpcError(new Error("multicall returned fewer results than requested"));
      }
      if (result.status === "failure") {
        throw new RpcError(result.error);
      }
      const [validatorAddress, , response, , tag, lastUpdate] = result.result as [
        Address,
        bigint,
        number,
        Hex,
        string,
        bigint,
      ];
      entries.push({
        validator: validatorAddress,
        method: classifyMethod(tag),
        requestHash: hash,
        response,
        timestamp: lastUpdate,
      });
    }
    return entries;
  } catch (cause) {
    if (cause instanceof RpcError) {
      throw cause;
    }
    throw new RpcError(cause);
  }
}
