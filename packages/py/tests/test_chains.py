"""Tests for the 7-chain registry table, mirroring
``packages/ts/test/chains/config.test.ts``."""

from __future__ import annotations

from web3_agent_reputation.chains import get_chain_config, supported_chain_ids


def test_exposes_exactly_the_7_documented_chains():
    ids = sorted(supported_chain_ids())
    assert ids == [1, 10, 56, 100, 137, 8453, 42161]


def test_same_create2_registry_addresses_on_every_chain():
    addresses = {
        (
            get_chain_config(chain_id).identity,
            get_chain_config(chain_id).reputation,
            get_chain_config(chain_id).validation,
        )
        for chain_id in supported_chain_ids()
    }
    assert len(addresses) == 1


def test_returns_none_for_unconfigured_chain_id():
    assert get_chain_config(999_999) is None
