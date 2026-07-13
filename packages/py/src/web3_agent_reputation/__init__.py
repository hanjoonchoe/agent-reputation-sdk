"""web3-agent-reputation -- ERC-8004 Trustless Agents facts layer + reputation calculator.

The two-layer contract (identical to the TS `agent-reputation` package):

Facts layer -- thin typed reads through web3.py, no opinions::

    from web3 import Web3
    from web3_agent_reputation import ERC8004Module

    w3 = Web3(Web3.HTTPProvider("https://mainnet.base.org"),
              external_modules={"erc8004": ERC8004Module})
    agent = w3.erc8004.get_agent(1)
    feedback = w3.erc8004.get_agent_feedback(1)
    reg_file = w3.erc8004.get_registration_file(1)  # verified: True | False | None

Calculator layer -- a pure function; your policy in, evidence-rich result out::

    from web3_agent_reputation import calculate_reputation, activity_sqrt

    rep = calculate_reputation(feedback, witness_cap=1, credibility=activity_sqrt(counts))
    # -> Reputation(expectation=..., uncertainty=..., witnesses=..., top_witness_share=...,
    #               caveats=[...], policy={...})

Design principles (same as every language in this SDK): read-only forever; never a bare
scalar (every result carries uncertainty, witness statistics, honesty caveats, and the
echoed policy); cross-language determinism against the golden vectors in `vectors/`;
judgment stays with the consumer.
"""

from .calculator import (
    NO_FEEDBACK_CAVEAT,
    SCALE_CAVEAT,
    SYBIL_CAVEAT,
    FeedbackEntry,
    Reputation,
    activity_sqrt,
    calculate_reputation,
    uniform,
)
from .chains import ChainConfig, get_chain_config, supported_chain_ids
from .errors import (
    AgentNotFoundError,
    ChainUnsupportedError,
    Erc8004Error,
    FileHashMismatchError,
    FileUnreachableError,
    InvalidInputError,
    RpcError,
)
from .fetch import RegistrationFile, fetch_registration_file
from .module import Agent, ERC8004Module, ValidationEntry
from .module import FeedbackEntry as FactsFeedbackEntry

__all__ = [
    # module
    "ERC8004Module",
    "Agent",
    "FactsFeedbackEntry",
    "ValidationEntry",
    # calculator
    "calculate_reputation",
    "uniform",
    "activity_sqrt",
    "FeedbackEntry",
    "Reputation",
    "SYBIL_CAVEAT",
    "SCALE_CAVEAT",
    "NO_FEEDBACK_CAVEAT",
    # chains
    "ChainConfig",
    "get_chain_config",
    "supported_chain_ids",
    # fetch
    "fetch_registration_file",
    "RegistrationFile",
    # errors
    "Erc8004Error",
    "AgentNotFoundError",
    "ChainUnsupportedError",
    "RpcError",
    "FileUnreachableError",
    "FileHashMismatchError",
    "InvalidInputError",
]
