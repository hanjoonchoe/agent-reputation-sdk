import type { Address } from "viem";

/**
 * 7-chain ERC-8004 registry table.
 *
 * Provenance (WP-A, 2026-07-14): copied from `web3-agents-mcp` commit
 * `243257ffddcbf82b16a73b22d061910281f4be4c` (`src/chains/config.ts`), which derived the
 * addresses and per-chain `deploymentBlock`s from `erc-8004/erc-8004-contracts` commit
 * `68fc6765761a10fb26f0692df21c8a6f9d12b1be` — see
 * `../registry/abi/SOURCE.md` for the full derivation (CREATE2 vanity-salt deployment,
 * `eth_getCode` binary search per chain). Not re-derived or re-verified here.
 */
export type ChainConfig = {
  chainId: number;
  name: string;
  registries: { identity: Address; reputation: Address; validation: Address };
  /** First block at which the registries' bytecode is present on this chain. */
  deploymentBlock: bigint;
};

// Same CREATE2 vanity-salt deployment across every mainnet chain.
const IDENTITY: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const REPUTATION: Address = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";
const VALIDATION: Address = "0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58";

const REGISTRIES = { identity: IDENTITY, reputation: REPUTATION, validation: VALIDATION };

const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  1: {
    chainId: 1,
    name: "ethereum",
    registries: REGISTRIES,
    deploymentBlock: 24339871n,
  },
  8453: {
    chainId: 8453,
    name: "base",
    registries: REGISTRIES,
    deploymentBlock: 41663783n,
  },
  137: {
    chainId: 137,
    name: "polygon",
    registries: REGISTRIES,
    deploymentBlock: 82458484n,
  },
  42161: {
    chainId: 42161,
    name: "arbitrum",
    registries: REGISTRIES,
    deploymentBlock: 428895443n,
  },
  10: {
    chainId: 10,
    name: "optimism",
    registries: REGISTRIES,
    deploymentBlock: 147514947n,
  },
  56: {
    chainId: 56,
    name: "bnb",
    registries: REGISTRIES,
    deploymentBlock: 79027268n,
  },
  100: {
    chainId: 100,
    name: "gnosis",
    registries: REGISTRIES,
    deploymentBlock: 44505010n,
  },
};

export function getChainConfig(chainId: number): ChainConfig | undefined {
  return CHAIN_CONFIGS[chainId];
}

export function supportedChainIds(): number[] {
  return Object.keys(CHAIN_CONFIGS).map(Number);
}
