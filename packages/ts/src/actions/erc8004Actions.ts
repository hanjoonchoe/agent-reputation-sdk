import type { Account, Chain, Client, Transport } from "viem";
import { type Agent, type GetAgentParameters, getAgent } from "./getAgent.js";
import {
  type FeedbackEntry,
  type GetAgentFeedbackParameters,
  getAgentFeedback,
} from "./getAgentFeedback.js";
import {
  type GetAgentValidationsParameters,
  getAgentValidations,
  type ValidationEntry,
} from "./getAgentValidations.js";
import {
  type GetRegistrationFileParameters,
  getRegistrationFile,
  type RegistrationFileResult,
} from "./getRegistrationFile.js";

export type Erc8004Actions = {
  getAgent: (args: GetAgentParameters) => Promise<Agent>;
  getAgentFeedback: (args: GetAgentFeedbackParameters) => Promise<FeedbackEntry[]>;
  getAgentValidations: (args: GetAgentValidationsParameters) => Promise<ValidationEntry[]>;
  getRegistrationFile: (args: GetRegistrationFileParameters) => Promise<RegistrationFileResult>;
};

/**
 * viem client extension exposing typed, read-only ERC-8004 registry reads:
 *
 * ```ts
 * const client = createPublicClient({ chain: base, transport: http() }).extend(erc8004Actions());
 * await client.getAgent({ agentId: 1n });
 * await client.getAgentFeedback({ agentId: 1n });
 * await client.getAgentValidations({ agentId: 1n });
 * await client.getRegistrationFile({ agentId: 1n });
 * ```
 *
 * The chain comes from the client itself (`client.chain.id`) — validated against the
 * 7 chains this package knows the ERC-8004 registry addresses for; an unconfigured or
 * unsupported chain throws `ChainUnsupportedError`. Read-only, forever: this factory
 * never touches a `WalletClient` and none of these actions sign or send transactions.
 */
export function erc8004Actions() {
  return <
    transport extends Transport,
    chain extends Chain | undefined,
    account extends Account | undefined,
  >(
    client: Client<transport, chain, account>,
  ): Erc8004Actions => ({
    getAgent: (args) => getAgent(client, args),
    getAgentFeedback: (args) => getAgentFeedback(client, args),
    getAgentValidations: (args) => getAgentValidations(client, args),
    getRegistrationFile: (args) => getRegistrationFile(client, args),
  });
}
