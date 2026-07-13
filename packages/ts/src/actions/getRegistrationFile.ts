import type { Hex } from "viem";
import type { Erc8004Client } from "../chains/resolve.js";
import { fetchRegistrationFile, type RegistrationFileSource } from "../fetcher/fetch.js";
import { getAgent } from "./getAgent.js";

/**
 * `getRegistrationFile` — fetches (and verifies where possible) the agent registration
 * file referenced by the Identity Registry's `tokenURI(agentId)`.
 *
 * Verification depends on the URI scheme:
 * - `data:` — content is inline in the on-chain `tokenUri` itself, decoded directly, no
 *   network round trip. `verified: true` (nothing external to check against).
 * - `ipfs://` — fetched via a public gateway list (first success wins), then the fetched
 *   bytes are hashed and compared against the CID's embedded multihash digest.
 *   `verified: true | false`.
 * - `https://` — fetched directly. There is no on-chain hash commitment for `https://`
 *   registration files in the audited v1 contracts, so this is never verifiable one way
 *   or the other. `verified: null`.
 *
 * STATELESS: no cache of any kind — every call re-fetches and re-verifies from scratch.
 */

export type GetRegistrationFileParameters = {
  agentId: bigint;
  /** Injectable fetch implementation, for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
};

export type RegistrationFileResult = {
  verified: boolean | null;
  content: unknown;
  contentError: "not-json" | null;
  source: RegistrationFileSource;
  hash: Hex;
};

export async function getRegistrationFile(
  client: Erc8004Client,
  { agentId, fetchImpl }: GetRegistrationFileParameters,
): Promise<RegistrationFileResult> {
  const agent = await getAgent(client, { agentId }); // throws AgentNotFoundError, ChainUnsupportedError
  return fetchRegistrationFile(agent.tokenUri, { fetchImpl });
}
