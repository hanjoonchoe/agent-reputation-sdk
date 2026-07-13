"""Error style (mirrors ``packages/ts/src/errors.ts``, ported to Python idiom).

Every error this package raises is one of the subclasses below — no raw web3.py/Python
exception is ever allowed to cross a facts-layer function's boundary uncaught. Upstream
error messages (RPC errors, fetch failures) are sanitized to their first line, capped at
300 chars, before being carried as the exception's message — full detail is preserved via
``raise ... from cause`` (Python's native chained-exception mechanism, the idiomatic
analogue of the TS version's ``.cause``).
"""

from __future__ import annotations

MAX_MESSAGE_LENGTH = 300


def sanitize_message(exc: BaseException | str) -> str:
    """Sanitizes an upstream error into a short, single-line, boundedly-sized message."""
    raw = str(exc)
    first_line = raw.splitlines()[0] if raw else raw
    if len(first_line) > MAX_MESSAGE_LENGTH:
        return f"{first_line[:MAX_MESSAGE_LENGTH]}…"
    return first_line


class Erc8004Error(Exception):
    """Base class for every error this package raises."""


class AgentNotFoundError(Erc8004Error):
    """Raised when ``agent_id`` has no registered owner (ERC-721 ``ownerOf``/``tokenURI`` revert)."""

    def __init__(self, agent_id: int, *, cause: BaseException | None = None):
        self.agent_id = agent_id
        super().__init__(f"agent {agent_id} is not registered")
        if cause is not None:
            raise self from cause


class ChainUnsupportedError(Erc8004Error):
    """Raised when ``w3.eth.chain_id`` is not one of the 7 configured ERC-8004 chains."""

    def __init__(self, chain_id: int | None, *, cause: BaseException | None = None):
        self.chain_id = chain_id
        message = (
            "client has no chain configured; erc8004 module requires a resolvable chain_id"
            if chain_id is None
            else f"chainId {chain_id} is not a supported ERC-8004 chain"
        )
        super().__init__(message)
        if cause is not None:
            raise self from cause


class RpcError(Erc8004Error):
    """Wraps any non-revert RPC failure (network, timeout, decoding, multicall shortfall)."""

    def __init__(self, cause: BaseException | str):
        super().__init__(sanitize_message(cause))
        self.__cause__ = cause if isinstance(cause, BaseException) else None


class FileUnreachableError(Erc8004Error):
    """Raised when a registration file could not be fetched (network, timeout, size cap, malformed URI)."""


class FileHashMismatchError(Erc8004Error):
    """Raised when fetched bytes fail to hash-match their on-chain commitment (e.g. IPFS CID mismatch)."""


class InvalidInputError(Erc8004Error):
    """Raised for caller-supplied argument validation failures (bad limit/offset, malformed input,
    or — per the calculator's port of the TS ``TypeError`` behavior — a negative/NaN/non-numeric
    feedback score; see ``calculator.py`` module docstring, Deviation R-3)."""
