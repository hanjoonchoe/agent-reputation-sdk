"""ERC8004Module -- a web3.py external module (facts layer): thin typed reads through
an existing `Web3` client, no opinions. Ported from `packages/ts/src/actions/*.ts`
(mapping tables reproduced in each method's docstring below) and
`packages/ts/src/chains/resolve.ts` (chain-detection).

Usage::

    from web3 import Web3
    from web3_agent_reputation import ERC8004Module

    w3 = Web3(Web3.HTTPProvider("https://mainnet.base.org"), external_modules={"erc8004": ERC8004Module})
    agent = w3.erc8004.get_agent(1)

or, post-construction::

    w3.attach_modules({"erc8004": ERC8004Module})
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from importlib import resources
from typing import Literal

from web3.exceptions import ContractLogicError
from web3.module import Module

from .chains import ChainConfig, get_chain_config
from .errors import AgentNotFoundError, ChainUnsupportedError, RpcError
from .fetch import FetchImpl, RegistrationFile, fetch_registration_file

MAX_LIMIT = 200
DEFAULT_LIMIT = 200

ValidationMethod = Literal["tee", "zk", "reexec", "other"]
_KNOWN_METHODS: tuple[str, ...] = ("tee", "zk", "reexec")


def _load_abi(name: str) -> list[dict]:
    raw = resources.files("web3_agent_reputation.abi").joinpath(f"{name}.json").read_text()
    return json.loads(raw)


_IDENTITY_ABI = _load_abi("identity")
_REPUTATION_ABI = _load_abi("reputation")
_VALIDATION_ABI = _load_abi("validation")


@dataclass(frozen=True)
class Agent:
    agent_id: int
    owner: str
    token_uri: str
    registered_at: int | None


@dataclass(frozen=True)
class FeedbackEntry:
    client: str
    score: float
    tag: str | None
    uri: str | None
    timestamp: int | None


@dataclass(frozen=True)
class ValidationEntry:
    validator: str
    method: ValidationMethod
    request_hash: bytes
    response: object
    timestamp: int | None


def _clamp_limit(limit: int) -> int:
    return max(0, min(limit, MAX_LIMIT))


def _clamp_offset(offset: int) -> int:
    return max(0, offset)


def _normalize_score(value: int, decimals: int) -> float:
    """Decodes an on-chain (value, valueDecimals) pair to a best-effort 0-100 score."""
    raw = value / (10**decimals)
    return max(0.0, min(100.0, raw))


def _classify_method(tag: str) -> ValidationMethod:
    normalized = tag.strip().lower()
    if normalized in _KNOWN_METHODS:
        return normalized  # type: ignore[return-value]
    return "other"


class ERC8004Module(Module):
    """Read-only, forever. No signing, no writes."""

    def _require_chain_config(self) -> ChainConfig:
        try:
            chain_id = self.w3.eth.chain_id
        except Exception as cause:  # noqa: BLE001
            raise ChainUnsupportedError(None, cause=cause) from cause
        config = get_chain_config(chain_id)
        if config is None:
            raise ChainUnsupportedError(chain_id)
        return config

    # -- getAgent ------------------------------------------------------------------
    #
    # Contract-function mapping (ported from `packages/ts/src/actions/getAgent.ts`):
    #
    # | This method                | Contract function(s)                                    |
    # | --------------------------- | --------------------------------------------------------- |
    # | owner, token_uri            | ownerOf(agentId), tokenURI(agentId)                        |
    # | registered_at               | best-effort Registered event log-scan (fromBlock = the    |
    # |                              | chain's deployment_block) + block timestamp lookup; None   |
    # |                              | if the scan or block fetch fails for any reason            |
    #
    # A nonexistent agent_id reverts ownerOf/tokenURI (ERC721NonexistentToken) --
    # mapped here to AgentNotFoundError. Any other failure (network, timeout,
    # unrecognized revert) becomes RpcError.

    def get_agent(self, agent_id: int) -> Agent:
        config = self._require_chain_config()
        identity = self.w3.eth.contract(address=config.identity, abi=_IDENTITY_ABI)

        try:
            owner = identity.functions.ownerOf(agent_id).call()
            token_uri = identity.functions.tokenURI(agent_id).call()
        except ContractLogicError as cause:
            raise AgentNotFoundError(agent_id, cause=cause) from cause
        except Exception as cause:  # noqa: BLE001
            raise RpcError(cause) from cause

        registered_at = self._find_registered_at(identity, config.deployment_block, agent_id)
        return Agent(agent_id=agent_id, owner=owner, token_uri=token_uri, registered_at=registered_at)

    def _find_registered_at(self, identity_contract, deployment_block: int, agent_id: int) -> int | None:
        try:
            logs = identity_contract.events.Registered.get_logs(
                fromBlock=deployment_block,
                toBlock="latest",
                argument_filters={"agentId": agent_id},
            )
            if not logs:
                return None
            first = logs[0]
            block_number = first["blockNumber"]
            if block_number is None:
                return None
            block = self.w3.eth.get_block(block_number)
            return int(block["timestamp"])
        except Exception:  # noqa: BLE001
            return None

    # -- getAgentFeedback ------------------------------------------------------------
    #
    # Contract-function mapping (ported from `packages/ts/src/actions/getAgentFeedback.ts`):
    #
    # readAllFeedback(agentId, [], "", "", false) is the function actually called --
    # its empty clientAddresses array means "all clients" (unlike getSummary's
    # revert-on-empty behavior). The contract exposes no native offset/limit, so
    # limit/offset are applied client-side after decoding.
    #
    # Score scale: giveFeedback(agentId, value, valueDecimals, ...) accepts any signed
    # int128 value with valueDecimals in [0, 18] -- the contract enforces no canonical
    # "score" range. This module assumes the common ERC-8004 convention that feedback
    # values are a 0-100 rating: score = clamp(value / 10**valueDecimals, 0, 100).
    #
    # tag/uri/timestamp: the contract stores two free-text tags (tag1, tag2); this
    # module surfaces tag1 as `tag` (empty string -> None), tag2 is not exposed. No read
    # function returns a per-feedback URI or timestamp, so `uri` and `timestamp` are
    # always None.
    #
    # Agent existence is checked via get_agent first, so an unregistered agent_id
    # surfaces AgentNotFoundError from there rather than a confusing empty list.

    def get_agent_feedback(
        self, agent_id: int, *, limit: int = DEFAULT_LIMIT, offset: int = 0
    ) -> list[FeedbackEntry]:
        self.get_agent(agent_id)  # raises AgentNotFoundError for unregistered agents

        config = self._require_chain_config()
        reputation = self.w3.eth.contract(address=config.reputation, abi=_REPUTATION_ABI)
        clamped_limit = _clamp_limit(limit)
        clamped_offset = _clamp_offset(offset)

        try:
            clients, _feedback_indexes, values, value_decimals, tag1s, _tag2s, _revoked = (
                reputation.functions.readAllFeedback(agent_id, [], "", "", False).call()
            )
        except Exception as cause:  # noqa: BLE001
            raise RpcError(cause) from cause

        entries = [
            FeedbackEntry(
                client=client,
                score=_normalize_score(values[i], value_decimals[i]),
                tag=tag1s[i] if tag1s[i] else None,
                uri=None,
                timestamp=None,
            )
            for i, client in enumerate(clients)
        ]
        return entries[clamped_offset : clamped_offset + clamped_limit]

    # -- getAgentValidations -----------------------------------------------------------
    #
    # Contract-function mapping (ported from `packages/ts/src/actions/getAgentValidations.ts`):
    #
    # | This method                 | Contract function(s)                                     |
    # | ----------------------------- | ----------------------------------------------------------- |
    # | request-hash list             | getAgentValidations(agentId) -- full bytes32[], no native    |
    # |                                | offset/limit; limit/offset applied to the hash list BEFORE   |
    # |                                | fetching per-hash detail                                     |
    # | per-hash detail (page only)   | getValidationStatus(requestHash) per hash, sequential (this  |
    # |                                | port does not batch via multicall -- see module docstring    |
    # |                                | Deviation note below)                                        |
    #
    # Deviation from TS reference: the TS action batches per-hash detail reads via
    # viem's `multicall`. This Python port issues sequential `eth_call`s instead
    # (documented per R-2: "batch via multicall if convenient, else sequential --
    # document"). web3.py has no first-class multicall helper in the base install;
    # wiring one in is left to a future iteration if RPC round-trip count becomes a
    # measured problem.
    #
    # response scale: ValidationRegistryUpgradeable contract-enforces response in
    # [0, 100] -- already the canonical 0-100 scale, decoded as-is, no rescaling.
    #
    # Known gap: pending vs. zero-scored validations are indistinguishable (same as the
    # TS reference -- the minimal ABI excludes `hasResponse`).
    #
    # Method classification: getValidationStatus's `tag` is free text set by the
    # validator; classified via a case-insensitive EXACT match against "tee", "zk",
    # "reexec"; anything else maps to "other".

    def get_agent_validations(
        self, agent_id: int, *, limit: int = DEFAULT_LIMIT, offset: int = 0
    ) -> list[ValidationEntry]:
        self.get_agent(agent_id)  # raises AgentNotFoundError for unregistered agents

        config = self._require_chain_config()
        validation = self.w3.eth.contract(address=config.validation, abi=_VALIDATION_ABI)

        try:
            hashes = validation.functions.getAgentValidations(agent_id).call()
        except Exception as cause:  # noqa: BLE001
            raise RpcError(cause) from cause

        if not hashes:
            return []

        clamped_limit = _clamp_limit(limit)
        clamped_offset = _clamp_offset(offset)
        page = hashes[clamped_offset : clamped_offset + clamped_limit]
        if not page:
            return []

        entries: list[ValidationEntry] = []
        try:
            for request_hash in page:
                validator_address, _agent_id, response, _response_hash, tag, last_update = (
                    validation.functions.getValidationStatus(request_hash).call()
                )
                entries.append(
                    ValidationEntry(
                        validator=validator_address,
                        method=_classify_method(tag),
                        request_hash=request_hash,
                        response=response,
                        timestamp=int(last_update),
                    )
                )
        except Exception as cause:  # noqa: BLE001
            raise RpcError(cause) from cause

        return entries

    # -- getRegistrationFile -----------------------------------------------------------
    #
    # Fetches (and verifies where possible) the agent registration file referenced by
    # the Identity Registry's tokenURI(agentId). See `fetch.py` for scheme-specific
    # verification semantics (data:/ipfs://Ihttps://). STATELESS: no cache -- every call
    # re-fetches and re-verifies from scratch.

    def get_registration_file(self, agent_id: int, *, fetch: FetchImpl | None = None) -> RegistrationFile:
        agent = self.get_agent(agent_id)  # raises AgentNotFoundError, ChainUnsupportedError
        return fetch_registration_file(agent.token_uri, fetch_impl=fetch)
