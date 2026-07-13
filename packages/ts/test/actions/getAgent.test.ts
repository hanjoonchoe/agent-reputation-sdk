import {
  type Address,
  decodeFunctionData,
  encodeErrorResult,
  encodeFunctionResult,
  encodeEventTopics,
} from "viem";
import { beforeEach, describe, expect, it } from "vitest";
import { getAgent } from "../../src/actions/getAgent.js";
import { AgentNotFoundError, ChainUnsupportedError, RpcError } from "../../src/errors.js";
import { loadAbi } from "../../src/registry/loadAbi.js";
import { type CallLogEntry, buildMockClient } from "../fixtures/mockClient.js";

const identityAbi = loadAbi("identity");
const IDENTITY_ADDRESS: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const OWNER: Address = "0x00000000000000000000000000000000000000AA";
const NOT_FOUND_ID = 999_999_999n;
const RPC_FAILURE_ID = 888_888_888n;

function tokenUriFor(agentId: bigint): string {
  return `ipfs://agent-${agentId.toString()}`;
}

function handleIdentityCall(_to: Address, data: `0x${string}`) {
  const decoded = decodeFunctionData({ abi: identityAbi, data });
  const agentId = decoded.args?.[0] as bigint;

  if (agentId === RPC_FAILURE_ID) {
    throw new Error("simulated network failure");
  }
  if (agentId === NOT_FOUND_ID) {
    return {
      success: false,
      data: encodeErrorResult({
        abi: identityAbi,
        errorName: "ERC721NonexistentToken",
        args: [agentId],
      }),
    };
  }
  if (decoded.functionName === "ownerOf") {
    return {
      success: true,
      data: encodeFunctionResult({ abi: identityAbi, functionName: "ownerOf", result: OWNER }),
    };
  }
  return {
    success: true,
    data: encodeFunctionResult({
      abi: identityAbi,
      functionName: "tokenURI",
      result: tokenUriFor(agentId),
    }),
  };
}

let callLog: CallLogEntry[];

describe("getAgent (mocked transport)", () => {
  beforeEach(() => {
    callLog = [];
  });

  it("happy path decodes owner/tokenUri and registeredAt from a Registered log", async () => {
    const topic = encodeEventTopics({
      abi: identityAbi,
      eventName: "Registered",
      args: { agentId: 1n },
    });
    const client = buildMockClient(handleIdentityCall, {
      callLog,
      logs: [
        {
          address: IDENTITY_ADDRESS,
          topics: topic,
          data: "0x",
          blockNumber: "0x1",
          transactionHash: `0x${"22".repeat(32)}`,
          transactionIndex: "0x0",
          blockHash: `0x${"33".repeat(32)}`,
          logIndex: "0x0",
          removed: false,
        },
      ],
      blockTimestamp: 1_700_000_000n,
    });

    const agent = await getAgent(client, { agentId: 1n });
    expect(agent.agentId).toBe(1n);
    expect(agent.owner.toLowerCase()).toBe(OWNER.toLowerCase());
    expect(agent.tokenUri).toBe(tokenUriFor(1n));
    expect(agent.registeredAt).toBe(1_700_000_000n);
  });

  it("registeredAt is null when no Registered log is found", async () => {
    const client = buildMockClient(handleIdentityCall, { callLog, logs: [] });
    const agent = await getAgent(client, { agentId: 2n });
    expect(agent.registeredAt).toBeNull();
  });

  it("throws AgentNotFoundError for a nonexistent agentId", async () => {
    const client = buildMockClient(handleIdentityCall, { callLog });
    await expect(getAgent(client, { agentId: NOT_FOUND_ID })).rejects.toBeInstanceOf(
      AgentNotFoundError,
    );
  });

  it("throws RpcError wrapping a transport failure", async () => {
    const client = buildMockClient(handleIdentityCall, { callLog });
    await expect(getAgent(client, { agentId: RPC_FAILURE_ID })).rejects.toBeInstanceOf(RpcError);
  });

  it("throws ChainUnsupportedError when the client's chain is not configured", async () => {
    const client = buildMockClient(handleIdentityCall, { callLog });
    // @ts-expect-error -- deliberately clobbering chain to simulate an unsupported chain
    client.chain = { ...client.chain, id: 999_999 };
    await expect(getAgent(client, { agentId: 1n })).rejects.toBeInstanceOf(ChainUnsupportedError);
  });
});
