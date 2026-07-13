import { BaseError, ContractFunctionRevertedError, type Address, parseAbiItem } from "viem";
import { getBlock, getLogs, readContract } from "viem/actions";
import type { Erc8004Client } from "../chains/resolve.js";
import { requireChainConfig } from "../chains/resolve.js";
import { AgentNotFoundError, RpcError } from "../errors.js";
import { loadAbi } from "../registry/loadAbi.js";

/**
 * `getAgent` — typed ERC-721 reads against the Identity Registry.
 *
 * Contract-function mapping (mined from `web3-agents-mcp` commit
 * `243257ffddcbf82b16a73b22d061910281f4be4c`, `src/registry/identity.ts`):
 *
 * | This module               | Contract function(s)                                          |
 * | -------------------------- | -------------------------------------------------------------- |
 * | `owner`, `tokenUri`         | `ownerOf(agentId)`, `tokenURI(agentId)` (parallel reads)        |
 * | `registeredAt`              | best-effort `Registered` event log-scan (`fromBlock` = the      |
 * |                             | chain's `deploymentBlock`) + `eth_getBlockByNumber` for the      |
 * |                             | matching log's timestamp; `null` if the scan or block fetch      |
 * |                             | fails for any reason (no `registeredAt` getter exists on-chain)  |
 *
 * A nonexistent `agentId` reverts `ownerOf`/`tokenURI` with `ERC721NonexistentToken`
 * (identity.json's minimal ABI includes this error fragment so viem can decode it) —
 * mapped here to `AgentNotFoundError`. Any other failure (network, timeout,
 * unrecognized revert) becomes `RpcError`.
 */

const identityAbi = loadAbi("identity");

const registeredEvent = parseAbiItem(
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
);

const NOT_FOUND_ERROR_NAMES = new Set(["ERC721NonexistentToken"]);

export type Agent = {
  agentId: bigint;
  owner: Address;
  tokenUri: string;
  registeredAt: bigint | null;
};

export type GetAgentParameters = { agentId: bigint };

function classifyContractError(agentId: bigint, cause: unknown): Error {
  if (cause instanceof BaseError) {
    const revertError = cause.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revertError instanceof ContractFunctionRevertedError) {
      const errorName = revertError.data?.errorName;
      if (errorName !== undefined && NOT_FOUND_ERROR_NAMES.has(errorName)) {
        return new AgentNotFoundError(agentId, { cause });
      }
    }
  }
  return new RpcError(cause);
}

async function findRegisteredAt(
  client: Erc8004Client,
  identity: Address,
  deploymentBlock: bigint,
  agentId: bigint,
): Promise<bigint | null> {
  try {
    const logs = await getLogs(client, {
      address: identity,
      event: registeredEvent,
      args: { agentId },
      fromBlock: deploymentBlock,
      toBlock: "latest",
    });
    const first = logs[0];
    if (!first || first.blockNumber === null) {
      return null;
    }
    const block = await getBlock(client, { blockNumber: first.blockNumber });
    return block.timestamp;
  } catch {
    return null;
  }
}

export async function getAgent(
  client: Erc8004Client,
  { agentId }: GetAgentParameters,
): Promise<Agent> {
  const config = requireChainConfig(client);

  let owner: Address;
  let tokenUri: string;
  try {
    [owner, tokenUri] = await Promise.all([
      readContract(client, {
        address: config.registries.identity,
        abi: identityAbi,
        functionName: "ownerOf",
        args: [agentId],
      }) as Promise<Address>,
      readContract(client, {
        address: config.registries.identity,
        abi: identityAbi,
        functionName: "tokenURI",
        args: [agentId],
      }) as Promise<string>,
    ]);
  } catch (cause) {
    throw classifyContractError(agentId, cause);
  }

  const registeredAt = await findRegisteredAt(
    client,
    config.registries.identity,
    config.deploymentBlock,
    agentId,
  );

  return { agentId, owner, tokenUri, registeredAt };
}
