"""Tests for the error hierarchy, mirroring ``packages/ts/test/errors.test.ts``."""

from __future__ import annotations

from web3_agent_reputation.errors import (
    AgentNotFoundError,
    ChainUnsupportedError,
    Erc8004Error,
    RpcError,
    sanitize_message,
)


def test_sanitize_message_keeps_first_line_capped_at_300():
    long = "a" * 400
    assert sanitize_message(Exception(f"{long}\nsecond line")) == f"{'a' * 300}…"


def test_sanitize_message_passes_short_messages_unchanged():
    assert sanitize_message(Exception("short message")) == "short message"


def test_every_typed_error_is_erc8004error():
    assert isinstance(AgentNotFoundError(1), Erc8004Error)
    assert isinstance(ChainUnsupportedError(1), Erc8004Error)
    assert isinstance(RpcError(Exception("boom")), Erc8004Error)


def test_rpc_error_sanitizes_message_and_preserves_cause():
    cause = Exception("underlying rpc failure\nwith extra detail")
    error = RpcError(cause)
    assert str(error) == "underlying rpc failure"
    assert error.__cause__ is cause


def test_chain_unsupported_distinguishes_missing_vs_unsupported():
    assert "no chain configured" in str(ChainUnsupportedError(None))
    assert "1234" in str(ChainUnsupportedError(1234))
