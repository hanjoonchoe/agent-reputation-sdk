"""Tests for `fetch_registration_file`, mirroring
``packages/ts/test/fetcher/fetch.test.ts``."""

from __future__ import annotations

import base64
import io
import json

import pytest

from web3_agent_reputation.errors import FileUnreachableError
from web3_agent_reputation.fetch import fetch_registration_file

from .fixtures.build_cid import build_cid_v1_raw


class FakeResponse:
    """Minimal stand-in for `http.client.HTTPResponse` (`.status`, `.read(n)`)."""

    def __init__(self, body: bytes, status: int = 200):
        self.status = status
        self._buf = io.BytesIO(body)

    def read(self, amt: int = -1) -> bytes:
        return self._buf.read(amt)

    def close(self) -> None:
        pass


def test_data_uri_decodes_inline_verified_true_no_network_call():
    payload = {"name": "agent-0"}
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()
    calls = []

    def fetch_impl(url, timeout):
        calls.append(url)
        raise AssertionError("should not be called")

    result = fetch_registration_file(f"data:application/json;base64,{encoded}", fetch_impl=fetch_impl)
    assert result.verified is True
    assert result.source == "data"
    assert result.content == payload
    assert result.content_error is None
    assert calls == []


def test_data_uri_non_json_sets_content_error():
    encoded = base64.b64encode(b"not json").decode()
    result = fetch_registration_file(f"data:text/plain;base64,{encoded}")
    assert result.verified is True
    assert result.content_error == "not-json"
    assert result.content is None


def test_ipfs_matching_cid_verifies_true():
    payload = {"name": "agent-1"}
    data = json.dumps(payload).encode()
    cid = build_cid_v1_raw(data)

    def fetch_impl(url, timeout):
        return FakeResponse(data)

    result = fetch_registration_file(f"ipfs://{cid}", fetch_impl=fetch_impl)
    assert result.verified is True
    assert result.source == "ipfs"
    assert result.content == payload


def test_ipfs_mismatching_cid_verifies_false():
    data = json.dumps({"name": "agent-1"}).encode()
    cid = build_cid_v1_raw(b"something else entirely")

    def fetch_impl(url, timeout):
        return FakeResponse(data)

    result = fetch_registration_file(f"ipfs://{cid}", fetch_impl=fetch_impl)
    assert result.verified is False


def test_ipfs_falls_through_gateway_list_on_failure():
    payload = {"name": "agent-2"}
    data = json.dumps(payload).encode()
    cid = build_cid_v1_raw(data)
    calls = {"n": 0}

    def fetch_impl(url, timeout):
        calls["n"] += 1
        if calls["n"] == 1:
            return FakeResponse(b"", status=502)
        return FakeResponse(data)

    result = fetch_registration_file(
        f"ipfs://{cid}",
        fetch_impl=fetch_impl,
        gateways=["https://gw1.example", "https://gw2.example"],
    )
    assert result.verified is True
    assert calls["n"] == 2


def test_https_always_verified_none():
    payload = {"name": "agent-3"}

    def fetch_impl(url, timeout):
        return FakeResponse(json.dumps(payload).encode())

    result = fetch_registration_file("https://example.com/agent.json", fetch_impl=fetch_impl)
    assert result.verified is None
    assert result.source == "https"
    assert result.content == payload


def test_raises_file_unreachable_when_exceeding_2mib_cap():
    big = b"\x00" * (2 * 1024 * 1024 + 1)

    def fetch_impl(url, timeout):
        return FakeResponse(big)

    with pytest.raises(FileUnreachableError):
        fetch_registration_file("https://example.com/big.json", fetch_impl=fetch_impl)


def test_raises_file_unreachable_on_simulated_timeout():
    def fetch_impl(url, timeout):
        raise TimeoutError("The operation timed out")

    with pytest.raises(FileUnreachableError):
        fetch_registration_file("https://example.com/slow.json", fetch_impl=fetch_impl)


def test_raises_file_unreachable_for_unsupported_scheme():
    with pytest.raises(FileUnreachableError):
        fetch_registration_file("ftp://example.com/file")
