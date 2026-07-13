import type { Account, Chain, Client, Transport } from "viem";
import { ChainUnsupportedError } from "../errors.js";
import { type ChainConfig, getChainConfig } from "./config.js";

/**
 * The minimal viem client shape every action in this package accepts. Read-only forever
 * — no `WalletClient` anywhere; actions only ever call `readContract`/`multicall`/
 * `getLogs`/`getBlock` against `client.chain`/`client.transport`.
 */
export type Erc8004Client = Client<Transport, Chain | undefined, Account | undefined>;

/**
 * Resolves the client's chain (`client.chain.id`) to its `ChainConfig`, or throws
 * `ChainUnsupportedError` if the client has no chain configured, or its chain isn't one
 * of the 7 chains this package knows the ERC-8004 registry addresses for.
 */
export function requireChainConfig(client: Erc8004Client): ChainConfig {
  const chainId = client.chain?.id;
  const config = chainId !== undefined ? getChainConfig(chainId) : undefined;
  if (!config) {
    throw new ChainUnsupportedError(chainId);
  }
  return config;
}
