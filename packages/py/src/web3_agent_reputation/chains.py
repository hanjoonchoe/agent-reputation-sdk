"""7-chain ERC-8004 registry table.

Provenance: copied from ``packages/ts/src/chains/config.ts`` at the `wp-c` branch point
off `develop` — see ``abi/SOURCE.md`` for the full derivation chain (CREATE2 vanity-salt
deployment, ``eth_getCode`` binary search per chain). Not re-derived or re-verified here.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ChainConfig:
    chain_id: int
    name: str
    identity: str
    reputation: str
    validation: str
    # First block at which the registries' bytecode is present on this chain.
    deployment_block: int


# Same CREATE2 vanity-salt deployment across every mainnet chain.
_IDENTITY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
_REPUTATION = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63"
_VALIDATION = "0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58"

_CHAIN_CONFIGS: dict[int, ChainConfig] = {
    1: ChainConfig(1, "ethereum", _IDENTITY, _REPUTATION, _VALIDATION, 24339871),
    8453: ChainConfig(8453, "base", _IDENTITY, _REPUTATION, _VALIDATION, 41663783),
    137: ChainConfig(137, "polygon", _IDENTITY, _REPUTATION, _VALIDATION, 82458484),
    42161: ChainConfig(42161, "arbitrum", _IDENTITY, _REPUTATION, _VALIDATION, 428895443),
    10: ChainConfig(10, "optimism", _IDENTITY, _REPUTATION, _VALIDATION, 147514947),
    56: ChainConfig(56, "bnb", _IDENTITY, _REPUTATION, _VALIDATION, 79027268),
    100: ChainConfig(100, "gnosis", _IDENTITY, _REPUTATION, _VALIDATION, 44505010),
}


def get_chain_config(chain_id: int) -> ChainConfig | None:
    return _CHAIN_CONFIGS.get(chain_id)


def supported_chain_ids() -> list[int]:
    return list(_CHAIN_CONFIGS.keys())
