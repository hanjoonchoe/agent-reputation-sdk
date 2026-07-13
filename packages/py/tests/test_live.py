"""Live smoke test against real Base mainnet -- deselected by default (see
``pyproject.toml``'s ``addopts = "-m 'not live'"``), run explicitly via
``uv run pytest -m live``. Requires network access to a public Base RPC. Mirrors
``packages/ts/test/live/agent.live.test.ts``.
"""

from __future__ import annotations

import pytest
from web3 import Web3

from web3_agent_reputation import ERC8004Module

pytestmark = pytest.mark.live

BASE_RPC_URLS = [
    "https://base-rpc.publicnode.com",
    "https://base.llamarpc.com",
    "https://mainnet.base.org",
]


def _make_w3() -> Web3:
    last_error: Exception | None = None
    for url in BASE_RPC_URLS:
        w3 = Web3(Web3.HTTPProvider(url, request_kwargs={"timeout": 30}))
        try:
            if w3.is_connected():
                return Web3(
                    Web3.HTTPProvider(url, request_kwargs={"timeout": 30}),
                    external_modules={"erc8004": ERC8004Module},
                )
        except Exception as cause:  # noqa: BLE001
            last_error = cause
    raise RuntimeError(f"no Base RPC endpoint reachable: {last_error}")


@pytest.fixture(scope="module")
def w3() -> Web3:
    return _make_w3()


def test_agent_0_registration_file_data_uri_verified_true(w3: Web3):
    agent = w3.erc8004.get_agent(0)
    assert agent.agent_id == 0
    assert agent.token_uri.startswith("data:")

    file = w3.erc8004.get_registration_file(0)
    assert file.verified is True
    assert file.source == "data"


def test_agent_1_feedback_at_least_30_entries(w3: Web3):
    feedback = w3.erc8004.get_agent_feedback(1)
    # Loose lower bound rather than an exact count: feedback only ever grows on-chain,
    # so a strict equality check would break this test the next time someone submits
    # feedback for agent #1 between now and a future CI run.
    assert len(feedback) >= 30
    for entry in feedback:
        assert 0 <= entry.score <= 100
