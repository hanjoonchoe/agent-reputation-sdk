import {
  type Address,
  type Transport,
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
} from "viem";
import { base } from "viem/chains";

type MockClient = ReturnType<typeof createPublicClient<Transport, typeof base>>;

export const MULTICALL_ADDRESS: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";

export const multicall3Abi = [
  {
    type: "function",
    name: "aggregate3",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
] as const;

export type CallLogEntry = { to: string; data: string };
export type CallHandler = (
  to: Address,
  data: `0x${string}`,
) => { success: boolean; data: `0x${string}` };

export type MockClientOptions = {
  callLog?: CallLogEntry[];
  logs?: unknown[];
  blockTimestamp?: bigint;
};

/**
 * Builds a viem `PublicClient` over a `custom` transport that simulates `eth_call`
 * (including multicall3 batching), `eth_getLogs`, and `eth_getBlockByNumber`, so actions
 * can be exercised without any network access. Mined pattern from `web3-agents-mcp`
 * commit `243257ffddcbf82b16a73b22d061910281f4be4c` (`test/registry/identity.test.ts`).
 */
export function buildMockClient(handleCall: CallHandler, opts: MockClientOptions = {}): MockClient {
  const callLog = opts.callLog ?? [];

  const transport = custom({
    request: async ({ method, params }: { method: string; params: unknown }) => {
      if (method === "eth_chainId") {
        return "0x2105"; // 8453 (base)
      }
      if (method === "eth_blockNumber") {
        return "0x1";
      }
      if (method === "eth_getBlockByNumber") {
        return {
          number: "0x1",
          timestamp: `0x${(opts.blockTimestamp ?? 1_700_000_000n).toString(16)}`,
          hash: `0x${"11".repeat(32)}`,
          parentHash: `0x${"00".repeat(32)}`,
          nonce: "0x0000000000000000",
          transactionsRoot: `0x${"00".repeat(32)}`,
          stateRoot: `0x${"00".repeat(32)}`,
          receiptsRoot: `0x${"00".repeat(32)}`,
          logsBloom: `0x${"00".repeat(256)}`,
          gasLimit: "0x0",
          gasUsed: "0x0",
          miner: "0x0000000000000000000000000000000000000000",
          difficulty: "0x0",
          totalDifficulty: "0x0",
          extraData: "0x",
          size: "0x0",
          transactions: [],
          uncles: [],
          sha3Uncles: `0x${"00".repeat(32)}`,
        };
      }
      if (method === "eth_getLogs") {
        return opts.logs ?? [];
      }
      if (method === "eth_call") {
        const [{ to, data }] = params as [{ to: Address; data: `0x${string}` }];
        callLog.push({ to, data });

        if (to.toLowerCase() === MULTICALL_ADDRESS.toLowerCase()) {
          const decoded = decodeFunctionData({ abi: multicall3Abi, data });
          const calls = decoded.args[0];
          const returnData = calls.map((call) => {
            try {
              const { success, data: resultData } = handleCall(
                call.target as Address,
                call.callData as `0x${string}`,
              );
              return { success, returnData: resultData };
            } catch {
              return { success: false, returnData: "0x" as const };
            }
          });
          return encodeFunctionResult({
            abi: multicall3Abi,
            functionName: "aggregate3",
            result: returnData,
          });
        }

        const { success, data: resultData } = handleCall(to, data);
        if (!success) {
          throw Object.assign(new Error("execution reverted"), { code: 3, data: resultData });
        }
        return resultData;
      }
      throw new Error(`unexpected RPC method in mock transport: ${method}`);
    },
    retryCount: 0,
  });

  return createPublicClient({ chain: base, transport, pollingInterval: 1 });
}
