import { type Address, decodeFunctionData, encodeErrorResult, encodeFunctionResult } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRegistrationFile } from "../../src/actions/getRegistrationFile.js";
import { AgentNotFoundError } from "../../src/errors.js";
import { getChainConfig } from "../../src/chains/config.js";
import { loadAbi } from "../../src/registry/loadAbi.js";
import { type CallLogEntry, buildMockClient } from "../fixtures/mockClient.js";

const identityAbi = loadAbi("identity");
const config = getChainConfig(8453);
if (!config) {
  throw new Error("test setup: base chain config missing");
}
const OWNER: Address = "0x00000000000000000000000000000000000000AA";
const NOT_FOUND_ID = 999_999_999n;

function makeHandler(tokenUri: string, notFound = false) {
  return (_to: Address, data: `0x${string}`) => {
    const decoded = decodeFunctionData({ abi: identityAbi, data });
    const agentId = decoded.args?.[0] as bigint;
    if (notFound) {
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
      data: encodeFunctionResult({ abi: identityAbi, functionName: "tokenURI", result: tokenUri }),
    };
  };
}

let callLog: CallLogEntry[];

describe("getRegistrationFile", () => {
  beforeEach(() => {
    callLog = [];
  });

  it("resolves tokenUri via getAgent then fetches it (data: URI, no fetchImpl call)", async () => {
    const payload = { name: "agent-0" };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
    const client = buildMockClient(makeHandler(`data:application/json;base64,${encoded}`), {
      callLog,
    });
    const fetchImpl = vi.fn();

    const result = await getRegistrationFile(client, {
      agentId: 1n,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.verified).toBe(true);
    expect(result.source).toBe("data");
    expect(result.content).toEqual(payload);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("propagates AgentNotFoundError from getAgent for an unregistered agent", async () => {
    const client = buildMockClient(makeHandler("data:,x", true), { callLog });
    await expect(getRegistrationFile(client, { agentId: NOT_FOUND_ID })).rejects.toBeInstanceOf(
      AgentNotFoundError,
    );
  });
});
