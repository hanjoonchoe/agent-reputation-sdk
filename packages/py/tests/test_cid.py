"""Tests for `verify_cid`, mirroring ``packages/ts/test/fetcher/cid.test.ts``."""

from __future__ import annotations

from web3_agent_reputation.cid import verify_cid

from .fixtures.build_cid import build_cid_v1_raw


def test_matching_cidv1_raw_verifies_true():
    data = b"hello erc-8004"
    cid = build_cid_v1_raw(data)
    assert verify_cid(cid, data) is True


def test_mismatching_bytes_verify_false():
    data = b"hello erc-8004"
    cid = build_cid_v1_raw(data)
    tampered = b"hello erc-8005"
    assert verify_cid(cid, tampered) is False


def test_unparseable_cid_returns_none():
    assert verify_cid("not-a-cid", b"") is None


def test_unsupported_multibase_prefix_returns_none():
    assert verify_cid("xUnsupportedPrefix", b"") is None
