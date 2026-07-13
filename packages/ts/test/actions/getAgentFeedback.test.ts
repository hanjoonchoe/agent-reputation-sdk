import { type Address, decodeFunctionData, encodeErrorResult, encodeFunctionResult } from "viem";
import { beforeEach, describe, expect, it } from "vitest";
import { getAgentFeedback } from "../../src/actions/getAgentFeedback.js";
import { AgentNotFoundError, RpcError } from "../../src/errors.js";
import { loadAbi } from "../../src/registry/loadAbi.js";
import { getChainConfig } from "../../src/chains/config.js";
import { loadAbi as loadIdentityAbi } from "../../src/registry/loadAbi.js";
import { type CallLogEntry, buildMockClient } from "../fixtures/mockClient.js";

const reputationAbi = loadAbi("reputation");
const identityAbi = loadIdentityAbi("identity");
const config = getChainConfig(8453);
if (!config) {
  throw new Error("test setup: base chain config missing");
}
const IDENTITY_ADDRESS = config.registries.identity;
const OWNER: Address = "0x00000000000000000000000000000000000000AA";
const AGENT_ID = 1n;
const NOT_FOUND_ID = 999_999_999n;
const RPC_FAILURE_ID = 888_888_888n;

const CLIENTS: Address[] = [
  "0x0000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000002",
  "0x0000000000000000000000000000000000000003",
];

function handleIdentityCall(agentId: bigint, functionName: string) {
  if (agentId === NOT_FOUND_ID) {
    throw new Error("agent not found path handled elsewhere");
  }
  if (functionName === "ownerOf") {
    return encodeFunctionResult({ abi: identityAbi, functionName: "ownerOf", result: OWNER });
  }
  return encodeFunctionResult({
    abi: identityAbi,
    functionName: "tokenURI",
    result: `ipfs://agent-${agentId}`,
  });
}

function makeHandler(agentId: bigint) {
  return (to: Address, data: `0x${string}`) => {
    if (to.toLowerCase() === IDENTITY_ADDRESS.toLowerCase()) {
      const decoded = decodeFunctionData({ abi: identityAbi, data });
      const id = decoded.args?.[0] as bigint;
      if (id === NOT_FOUND_ID) {
        return {
          success: false,
          data: encodeErrorResult({
            abi: identityAbi,
            errorName: "ERC721NonexistentToken",
            args: [id],
          }),
        };
      }
      return { success: true, data: handleIdentityCall(id, decoded.functionName) };
    }

    // reputation registry
    const decoded = decodeFunctionData({ abi: reputationAbi, data });
    if (decoded.functionName !== "readAllFeedback") {
      throw new Error(`unexpected reputation call: ${decoded.functionName}`);
    }
    if (agentId === RPC_FAILURE_ID) {
      throw new Error("simulated network failure");
    }
    return {
      success: true,
      data: encodeFunctionResult({
        abi: reputationAbi,
        functionName: "readAllFeedback",
        result: [
          CLIENTS,
          [0n, 1n, 2n],
          [85n, 200n, 0n], // values
          [0, 1, 0], // valueDecimals -> 85, 20.0 -> clamp not needed, 0
          ["good", "", "meh"], // tag1s
          ["", "", ""], // tag2s
          [false, false, false], // revokedStatuses
        ],
      }),
    };
  };
}

let callLog: CallLogEntry[];

describe("getAgentFeedback (mocked transport)", () => {
  beforeEach(() => {
    callLog = [];
  });

  it("happy path decodes and normalizes feedback entries", async () => {
    const client = buildMockClient(makeHandler(AGENT_ID), { callLog });
    const entries = await getAgentFeedback(client, { agentId: AGENT_ID });
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({
      client: CLIENTS[0],
      score: 85,
      tag: "good",
      uri: null,
      timestamp: null,
    });
    expect(entries[1]?.score).toBe(20); // 200 / 10^1
    expect(entries[1]?.tag).toBeNull(); // empty tag1 -> null
    expect(entries[2]?.tag).toBe("meh");
  });

  it("applies limit/offset client-side", async () => {
    const client = buildMockClient(makeHandler(AGENT_ID), { callLog });
    const entries = await getAgentFeedback(client, { agentId: AGENT_ID, limit: 1, offset: 1 });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.client).toBe(CLIENTS[1]);
  });

  it("throws AgentNotFoundError for an unregistered agent before reading feedback", async () => {
    const client = buildMockClient(makeHandler(NOT_FOUND_ID), { callLog });
    await expect(getAgentFeedback(client, { agentId: NOT_FOUND_ID })).rejects.toBeInstanceOf(
      AgentNotFoundError,
    );
  });

  it("throws RpcError when readAllFeedback fails", async () => {
    const client = buildMockClient(makeHandler(RPC_FAILURE_ID), { callLog });
    await expect(getAgentFeedback(client, { agentId: RPC_FAILURE_ID })).rejects.toBeInstanceOf(
      RpcError,
    );
  });
});
