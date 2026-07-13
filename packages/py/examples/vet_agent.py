#!/usr/bin/env python3
"""vet_agent.py -- a pre-delegation guard in ~40 lines.

Given an agent id and a chain RPC URL, prints the facts (owner, registration file,
verification status) and the calculated reputation (both variants: pooled and
per-witness-capped) for that agent, with caveats -- everything a caller should look at
*before* delegating work to an on-chain agent. LangChain-free: plain web3.py +
web3-agent-reputation, no orchestration framework.

Usage:
    uv run python examples/vet_agent.py --agent-id 1 --rpc-url https://mainnet.base.org
"""

from __future__ import annotations

import argparse
import json

from web3 import Web3

from web3_agent_reputation import ERC8004Module, calculate_reputation, uniform


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent-id", type=int, required=True)
    parser.add_argument("--rpc-url", type=str, required=True)
    args = parser.parse_args()

    w3 = Web3(Web3.HTTPProvider(args.rpc_url), external_modules={"erc8004": ERC8004Module})

    agent = w3.erc8004.get_agent(args.agent_id)
    print(f"Agent #{agent.agent_id}")
    print(f"  owner:         {agent.owner}")
    print(f"  token_uri:     {agent.token_uri}")
    print(f"  registered_at: {agent.registered_at}")

    reg_file = w3.erc8004.get_registration_file(args.agent_id)
    print(f"  registration file source: {reg_file.source}, verified: {reg_file.verified}")
    if reg_file.content_error:
        print(f"  registration file content error: {reg_file.content_error}")

    feedback = w3.erc8004.get_agent_feedback(args.agent_id)
    print(f"\n{len(feedback)} feedback entries")

    for label, witness_cap in [
        ("Variant A (pooled, uniform credibility)", None),
        ("Variant B (witness-capped at 1, uniform credibility)", 1),
    ]:
        rep = calculate_reputation(feedback, witness_cap=witness_cap, credibility=uniform())
        print(f"\n{label}")
        print(f"  expectation:       {rep.expectation:.3f}")
        print(f"  uncertainty:       {rep.uncertainty:.3f}")
        print(f"  witnesses:         {rep.witnesses}")
        print(f"  top_witness_share: {rep.top_witness_share:.3f}")
        print(f"  policy:            {json.dumps(rep.policy)}")
        print("  caveats:")
        for caveat in rep.caveats:
            print(f"    - {caveat}")


if __name__ == "__main__":
    main()
