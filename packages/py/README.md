# web3-agent-reputation

**ERC-8004 Trustless Agents** — a [web3.py](https://web3py.readthedocs.io) external
module (facts layer) plus a pure reputation calculator. The Python member of the
[`agent-reputation-sdk`](../../README.md) family; numerically identical to the
TypeScript `agent-reputation` package against the shared golden vectors in
[`vectors/`](../../vectors/).

## Install

```bash
pip install web3-agent-reputation
# or, in this repo, from the packages/py directory:
uv sync
```

Requires Python >=3.10 and `web3>=6`.

## The two-layer contract

**Facts layer** — thin typed reads through your existing `Web3` client; no opinions:

```python
from web3 import Web3
from web3_agent_reputation import ERC8004Module

w3 = Web3(Web3.HTTPProvider("https://mainnet.base.org"),
          external_modules={"erc8004": ERC8004Module})
# or, post-construction: w3.attach_modules({"erc8004": ERC8004Module})

agent = w3.erc8004.get_agent(1)                  # Agent(agent_id, owner, token_uri, registered_at)
feedback = w3.erc8004.get_agent_feedback(1)       # list[FeedbackEntry]
validations = w3.erc8004.get_agent_validations(1) # list[ValidationEntry]
reg_file = w3.erc8004.get_registration_file(1)    # verified: True | False | None
```

Chain detection is automatic (`w3.eth.chain_id` at call time) against a 7-chain
ERC-8004 registry table (Ethereum, Base, Polygon, Arbitrum, Optimism, BNB, Gnosis) —
an unsupported chain raises `ChainUnsupportedError`.

## Calculator layer

A pure function; your policy in, evidence-rich result out — **never a bare scalar**.
Every result carries `expectation`, `uncertainty`, witness statistics, honesty
`caveats`, and the echoed `policy` (the reproducibility manifest):

```python
from web3_agent_reputation import calculate_reputation, activity_sqrt

rep = calculate_reputation(feedback, witness_cap=1, credibility=activity_sqrt(distinct_counts))
# Reputation(expectation=0.665, uncertainty=0.179, witnesses=20, entries=..., 
#            top_witness_share=0.15, caveats=[...], policy={...})
```

`calculate_reputation` accepts anything with `.client`/`.score` attributes (including
the `FeedbackEntry` returned by `get_agent_feedback` directly) — see
`src/web3_agent_reputation/calculator.py` for the full normative algorithm
description, copied verbatim from the TypeScript reference.

### The no-bare-scalar principle

A single reputation number invites false confidence: it hides how many witnesses
backed it, whether one dominant client inflated it, and what policy produced it. Every
`Reputation` this package returns is a small evidence bundle instead — `witnesses`,
`entries`, `top_witness_share`, and `caveats` travel with `expectation`/`uncertainty`
so a caller can judge *how much to trust the number*, not just read the number. The
calculator computes what you asked for under a policy you declared; it does not define
"the" score for any agent — judgment stays with the consumer.

## Errors

`Erc8004Error` is the base class; subclasses are `AgentNotFoundError`,
`ChainUnsupportedError`, `RpcError`, `FileUnreachableError`, `FileHashMismatchError`,
`InvalidInputError`. See `src/web3_agent_reputation/errors.py`.

## Tests

```bash
uv run pytest              # unit + golden-vector conformance, no network
uv run pytest -m live       # live smoke test against Base public RPC (deselected by default)
```

## Example

`examples/vet_agent.py` — given an agent id and a chain RPC URL, prints the facts and
calculated reputation (both variants) for that agent: a pre-delegation guard in ~40
lines.

```bash
uv run python examples/vet_agent.py --agent-id 1 --rpc-url https://mainnet.base.org
```
