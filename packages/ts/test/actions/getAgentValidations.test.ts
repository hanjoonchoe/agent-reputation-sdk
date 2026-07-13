import { type Address, decodeFunctionData, encodeErrorResult, encodeFunctionResult } from "viem";
import { beforeEach, describe, expect, it } from "vitest";
import { getAgentValidations } from "../../src/actions/getAgentValidations.js";
import { AgentNotFoundError, RpcError } from "../../src/errors.js";
import { getChainConfig } from "../../src/chains/config.js";
import { loadAbi } from "../../src/registry/loadAbi.js";
import { type CallLogEntry, buildMockClient } from "../fixtures/mockClient.js";

const validationAbi = loadAbi("validation");
const identityAbi = loadAbi("identity");
const config = getChainConfig(8453);
if (!config) {
  throw new Error("test setup: base chain config missing");
}
const IDENTITY_ADDRESS = config.registries.identity;
const OWNER: Address = "0x00000000000000000000000000000000000000AA";
const NOT_FOUND_ID = 999_999_999n;
const RPC_FAILURE_ID = 888_888_888n;

const VALIDATOR: Address = "0x0000000000000000000000000000000000000009";
const HASHES = [`0x${"aa".repeat(32)}`, `0x${"bb".repeat(32)}`, `0x${"cc".repeat(32)}`] as const;

function statusFor(index: number, tag: string) {
  return encodeFunctionResult({
    abi: validationAbi,
    functionName: "getValidationStatus",
    result: [VALIDATOR, 1n, 90 - index, `0x${"00".repeat(32)}`, tag, BigInt(1_700_000_000 + index)],
  });
}

function makeHandler(mode: "happy" | "not-found" | "rpc-failure") {
  return (to: Address, data: `0x${string}`) => {
    if (to.toLowerCase() === IDENTITY_ADDRESS.toLowerCase()) {
      const decoded = decodeFunctionData({ abi: identityAbi, data });
      if (mode === "not-found") {
        return {
          success: false,
          data: encodeErrorResult({
            abi: identityAbi,
            errorName: "ERC721NonexistentToken",
            args: [decoded.args?.[0] as bigint],
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
          result: "ipfs://agent-1",
        }),
      };
    }

    const decoded = decodeFunctionData({ abi: validationAbi, data });
    if (decoded.functionName === "getAgentValidations") {
      if (mode === "rpc-failure") {
        throw new Error("simulated network failure");
      }
      return {
        success: true,
        data: encodeFunctionResult({
          abi: validationAbi,
          functionName: "getAgentValidations",
          result: HASHES as unknown as `0x${string}`[],
        }),
      };
    }
    if (decoded.functionName === "getValidationStatus") {
      const hash = decoded.args?.[0] as string;
      const index = HASHES.indexOf(hash as (typeof HASHES)[number]);
      const tag = index === 0 ? "tee" : index === 1 ? "ZK" : "custom-thing";
      return { success: true, data: statusFor(index, tag) };
    }
    throw new Error(`unexpected validation call: ${decoded.functionName}`);
  };
}

let callLog: CallLogEntry[];

describe("getAgentValidations (mocked transport)", () => {
  beforeEach(() => {
    callLog = [];
  });

  it("happy path decodes entries and classifies method (case-insensitive)", async () => {
    const client = buildMockClient(makeHandler("happy"), { callLog });
    const entries = await getAgentValidations(client, { agentId: 1n });
    expect(entries).toHaveLength(3);
    expect(entries[0]?.method).toBe("tee");
    expect(entries[1]?.method).toBe("zk");
    expect(entries[2]?.method).toBe("other");
    expect(entries[0]?.validator.toLowerCase()).toBe(VALIDATOR.toLowerCase());
    expect(entries[0]?.timestamp).toBe(1_700_000_000n);
    expect(entries[0]?.requestHash).toBe(HASHES[0]);
  });

  it("applies limit/offset to the hash list before fetching detail", async () => {
    const client = buildMockClient(makeHandler("happy"), { callLog });
    const entries = await getAgentValidations(client, { agentId: 1n, limit: 1, offset: 2 });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.requestHash).toBe(HASHES[2]);
  });

  it("throws AgentNotFoundError for an unregistered agent", async () => {
    const client = buildMockClient(makeHandler("not-found"), { callLog });
    await expect(getAgentValidations(client, { agentId: NOT_FOUND_ID })).rejects.toBeInstanceOf(
      AgentNotFoundError,
    );
  });

  it("throws RpcError when getAgentValidations fails", async () => {
    const client = buildMockClient(makeHandler("rpc-failure"), { callLog });
    await expect(getAgentValidations(client, { agentId: RPC_FAILURE_ID })).rejects.toBeInstanceOf(
      RpcError,
    );
  });
});
