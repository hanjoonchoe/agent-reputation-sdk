"""Tests for `ERC8004Module` against a mocked `Web3` (no network), mirroring the
coverage of ``packages/ts/test/actions/*.test.ts`` (which uses a custom-transport mock
client; this port uses `unittest.mock.MagicMock` in place of viem's mock transport,
since web3.py's `Module` only requires a `.w3` attribute exposing `.eth.chain_id` /
`.eth.contract(...)`)."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from web3.exceptions import ContractLogicError

from web3_agent_reputation.errors import AgentNotFoundError, ChainUnsupportedError, RpcError
from web3_agent_reputation.module import ERC8004Module


def make_module(chain_id: int = 8453) -> tuple[ERC8004Module, MagicMock]:
    w3 = MagicMock()
    w3.eth.chain_id = chain_id
    module = ERC8004Module(w3)
    return module, w3


def test_unsupported_chain_raises_chain_unsupported_error():
    module, _w3 = make_module(chain_id=999_999)
    with pytest.raises(ChainUnsupportedError):
        module.get_agent(1)


def test_get_agent_reads_owner_and_token_uri():
    module, w3 = make_module()
    contract = MagicMock()
    w3.eth.contract.return_value = contract
    contract.functions.ownerOf.return_value.call.return_value = "0xOwner"
    contract.functions.tokenURI.return_value.call.return_value = "data:application/json,{}"
    contract.events.Registered.get_logs.return_value = []

    agent = module.get_agent(1)
    assert agent.agent_id == 1
    assert agent.owner == "0xOwner"
    assert agent.token_uri == "data:application/json,{}"
    assert agent.registered_at is None


def test_get_agent_resolves_registered_at_from_event_log():
    module, w3 = make_module()
    contract = MagicMock()
    w3.eth.contract.return_value = contract
    contract.functions.ownerOf.return_value.call.return_value = "0xOwner"
    contract.functions.tokenURI.return_value.call.return_value = "data:application/json,{}"
    contract.events.Registered.get_logs.return_value = [{"blockNumber": 41663900}]
    w3.eth.get_block.return_value = {"timestamp": 1_700_000_000}

    agent = module.get_agent(1)
    assert agent.registered_at == 1_700_000_000


def test_get_agent_nonexistent_raises_agent_not_found():
    module, w3 = make_module()
    contract = MagicMock()
    w3.eth.contract.return_value = contract
    contract.functions.ownerOf.return_value.call.side_effect = ContractLogicError(
        "execution reverted: ERC721NonexistentToken"
    )

    with pytest.raises(AgentNotFoundError):
        module.get_agent(999)


def test_get_agent_other_failure_raises_rpc_error():
    module, w3 = make_module()
    contract = MagicMock()
    w3.eth.contract.return_value = contract
    contract.functions.ownerOf.return_value.call.side_effect = ConnectionError("network down")

    with pytest.raises(RpcError):
        module.get_agent(1)


def _stub_get_agent_ok(w3: MagicMock, contract: MagicMock) -> None:
    w3.eth.contract.return_value = contract
    contract.functions.ownerOf.return_value.call.return_value = "0xOwner"
    contract.functions.tokenURI.return_value.call.return_value = "data:application/json,{}"
    contract.events.Registered.get_logs.return_value = []


def test_get_agent_feedback_maps_readallfeedback_output():
    module, w3 = make_module()
    contract = MagicMock()
    _stub_get_agent_ok(w3, contract)
    contract.functions.readAllFeedback.return_value.call.return_value = (
        ["0xClientA", "0xClientB"],
        [0, 1],
        [100, 5000],
        [0, 2],
        ["tag1", ""],
        ["", ""],
        [False, False],
    )

    feedback = module.get_agent_feedback(1)
    assert len(feedback) == 2
    assert feedback[0].client == "0xClientA"
    assert feedback[0].score == 100.0
    assert feedback[0].tag == "tag1"
    assert feedback[0].uri is None
    assert feedback[0].timestamp is None
    assert feedback[1].client == "0xClientB"
    assert feedback[1].score == 50.0  # 5000 / 10**2
    assert feedback[1].tag is None


def test_get_agent_feedback_applies_limit_and_offset():
    module, w3 = make_module()
    contract = MagicMock()
    _stub_get_agent_ok(w3, contract)
    n = 10
    contract.functions.readAllFeedback.return_value.call.return_value = (
        [f"0xClient{i}" for i in range(n)],
        list(range(n)),
        [100] * n,
        [0] * n,
        [""] * n,
        [""] * n,
        [False] * n,
    )

    feedback = module.get_agent_feedback(1, limit=3, offset=2)
    assert [f.client for f in feedback] == ["0xClient2", "0xClient3", "0xClient4"]


def test_get_agent_feedback_propagates_agent_not_found():
    module, w3 = make_module()
    contract = MagicMock()
    w3.eth.contract.return_value = contract
    contract.functions.ownerOf.return_value.call.side_effect = ContractLogicError(
        "execution reverted: ERC721NonexistentToken"
    )
    with pytest.raises(AgentNotFoundError):
        module.get_agent_feedback(999)


def test_get_agent_validations_maps_status_per_hash():
    module, w3 = make_module()
    contract = MagicMock()
    _stub_get_agent_ok(w3, contract)
    contract.functions.getAgentValidations.return_value.call.return_value = [b"\x01" * 32, b"\x02" * 32]
    contract.functions.getValidationStatus.return_value.call.side_effect = [
        ("0xValidatorA", 1, 90, b"\x00" * 32, "TEE", 1_700_000_001),
        ("0xValidatorB", 1, 42, b"\x00" * 32, "custom-tag", 1_700_000_002),
    ]

    validations = module.get_agent_validations(1)
    assert len(validations) == 2
    assert validations[0].validator == "0xValidatorA"
    assert validations[0].method == "tee"
    assert validations[0].response == 90
    assert validations[0].timestamp == 1_700_000_001
    assert validations[1].method == "other"


def test_get_agent_validations_empty_hash_list_returns_empty():
    module, w3 = make_module()
    contract = MagicMock()
    _stub_get_agent_ok(w3, contract)
    contract.functions.getAgentValidations.return_value.call.return_value = []

    assert module.get_agent_validations(1) == []


def test_get_registration_file_delegates_to_fetcher_for_data_uri():
    module, w3 = make_module()
    contract = MagicMock()
    _stub_get_agent_ok(w3, contract)
    contract.functions.tokenURI.return_value.call.return_value = (
        'data:application/json,{"name":"agent-0"}'
    )

    result = module.get_registration_file(1)
    assert result.verified is True
    assert result.content == {"name": "agent-0"}
