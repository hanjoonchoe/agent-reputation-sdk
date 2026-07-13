<div align="center">

# agent-reputation-sdk

### Don't ship a score. Compute your own — and let anyone verify it.

**English** | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Python >= 3.10](https://img.shields.io/badge/python-%3E%3D3.10-blue)](https://www.python.org)
[![Tests](https://img.shields.io/badge/tests-205%20passing%20%C2%B7%203%20languages%20%C2%B7%201%20contract-success)](conformance/)
[![Golden vectors](https://img.shields.io/badge/golden--vectors-cross--language-orange)](vectors/)
[![ERC-8004](https://img.shields.io/badge/standard-ERC--8004-627EEA)](https://eips.ethereum.org/EIPS/eip-8004)
[![web3-agents-mcp](https://img.shields.io/badge/sibling-web3--agents--mcp-8A2BE2)](https://github.com/hanjoonchoe/web3-agents-mcp)

**Ethereum SDK extensions for [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004)** —
typed registry reads, plus a policy-driven reputation calculator, as extensions to each
ecosystem's canonical Ethereum SDK.

</div>

---

## 📋 Table of contents

- [Why](#-why)
- [Quickstart](#-quickstart)
- [The two-layer contract](#-the-two-layer-contract-identical-in-every-language)
- [Packages](#-packages)
- [Design principles](#-design-principles)
- [The golden vectors — a conformance challenge](#-the-golden-vectors--a-conformance-challenge)
- [Porting to a new language](#-porting-to-a-new-language)
- [A note on live numbers](#-a-note-on-live-numbers)
- [Why no score? Read the theory](#-why-no-score-read-the-theory)
- [Development](#-development)
- [Status](#-status)
- [Sibling project](#-sibling-project)
- [License](#-license)

## 🤔 Why

AI agents are starting to hire, pay, and delegate to other agents. ERC-8004 gives them
an on-chain trust layer — identity, reputation, and validation registries — but reading
that data is only half the problem. The other half is turning raw, Sybil-able,
inconsistently-scaled feedback into a number you can actually act on, _without_ handing
that judgment call to a third-party black box.

Most "reputation" tooling collapses this into a single opaque score. This SDK refuses
to: it hands you the facts, lets you declare your own aggregation policy, and returns a
result that always carries its own uncertainty and caveats — computed the same way in
every language it ships in.

## 🚀 Quickstart

Pick your stack — all three compute the identical calculator against the identical
golden vectors (see [below](#-the-golden-vectors--a-conformance-challenge)).

### TypeScript

```sh
npm install agent-reputation viem
```

```ts
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { erc8004Actions, calculateReputation } from "agent-reputation";

const client = createPublicClient({ chain: base, transport: http() }).extend(
  erc8004Actions(),
);
const feedback = await client.getAgentFeedback({ agentId: 1n });
const rep = calculateReputation(feedback, { witnessCap: 1 });
```

### Python

```bash
pip install web3-agent-reputation
```

```python
from web3 import Web3
from web3_agent_reputation import ERC8004Module, calculate_reputation

w3 = Web3(Web3.HTTPProvider("https://mainnet.base.org"), external_modules={"erc8004": ERC8004Module})
feedback = w3.erc8004.get_agent_feedback(1)
rep = calculate_reputation(feedback, witness_cap=1)
```

### Rust

```toml
[dependencies]
alloy-agent-reputation = "0.1"
```

```rust
use alloy_agent_reputation::Erc8004ProviderExt;
use alloy_agent_reputation::calculator::{calculate_reputation, Policy};

let feedback = provider.get_agent_feedback(agent_id, 200, 0).await?;
let rep = calculate_reputation(&feedback, Policy { witness_cap: Some(1.0), ..Default::default() })?;
```

See [`examples/`](examples/) (TypeScript), [`packages/py/examples/`](packages/py/examples/),
and [`packages/rs/examples/`](packages/rs/examples/) for full runnable pre-delegation-guard
scripts in each language.

## 🧱 The two-layer contract (identical in every language)

**Facts layer** — thin typed reads through your existing client; no opinions:

```ts
const client = createPublicClient({ chain: base, transport: http() }).extend(
  erc8004Actions(),
);
await client.getAgent({ agentId: 1n });
await client.getAgentFeedback({ agentId: 1n });
await client.getRegistrationFile({ agentId: 1n }); // verified: true | false | null
```

**Calculator layer** — a pure function; your policy in, evidence-rich result out:

```ts
const rep = calculateReputation(feedback, {
  witnessCap: 1,
  credibility: activitySqrt(distinctCounts),
});
// → { expectation: 0.665, uncertainty: 0.179, witnesses: 20,
//     topWitnessShare: 0.15, caveats: [...], policy: { ...echoed } }
```

Neither layer ever returns a bare pass/fail or a single "trust this agent" boolean —
see [Design principles](#-design-principles).

## 📦 Packages

| Language   | Host SDK                                                 | Package                                             | Status                                     |
| ---------- | -------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------ |
| TypeScript | [viem](https://viem.sh) actions                          | [`agent-reputation`](packages/ts) (npm)             | **implemented** — claimed, releasing 0.1.0 |
| Python     | [web3.py](https://web3py.readthedocs.io) external module | [`web3-agent-reputation`](packages/py) (PyPI)       | **implemented** — claimed, releasing 0.1.0 |
| Rust       | [alloy](https://alloy.rs) extension trait                | [`alloy-agent-reputation`](packages/rs) (crates.io) | **implemented** — releasing 0.1.0          |

All three pass the same [golden vectors](vectors/) and the same
[conformance suite](conformance/) — see [CHANGELOG.md](CHANGELOG.md) for the
release-by-release detail.

## 🛡️ Design principles

> ### 🔒 Read-only, forever
>
> No signing, no writes, in any language, ever. No `WalletClient` (or its Python/Rust
> equivalent) is ever imported or accepted anywhere in this SDK. A write-capable
> extension — if one ever exists — would live in a different package, with a different,
> explicit opt-in.

> ### ⚖️ Never a bare scalar
>
> Every reputation result carries `uncertainty`, witness statistics, mandatory honesty
> caveats, and the echoed policy that produced it — the reproducibility manifest. A
> library that quietly compresses "20 witnesses, one of whom submitted 15% of all
> entries" into a single number is making a judgment call it has no business making on
> the consumer's behalf.

> ### 🔁 Cross-language determinism
>
> Every implementation accumulates in the same deterministic order and must reproduce
> the golden test vectors in [`vectors/`](vectors/) exactly (3-decimal tolerance). A
> second language ships only after passing them in CI — see below.

> ### 🧭 Judgment stays with the consumer
>
> This library computes what _you_ asked for, under a policy _you_ declared. It does not
> define "the" score for any agent, and it never will.

## 🧪 The golden vectors — a conformance challenge

[`vectors/`](vectors/) is a frozen snapshot of real ERC-8004 feedback (Base mainnet,
agents 0–9) plus the exact expected output of the reference calculator, for two policy
variants, to three decimal places. It's the cross-language contract that makes
"agent-reputation for viem," "web3-agent-reputation for web3.py," and
"alloy-agent-reputation for alloy" the _same_ calculator wearing three different host
SDKs, rather than three independent reimplementations that happen to agree most of the
time.

## 🌐 Porting to a new language

**A new language passes [`vectors/`](vectors/) + [`conformance/`](conformance/README.md)
or it doesn't ship.** Bit-for-bit golden-vector reproduction, plus byte-matching caveat
strings, verification cases, and API surface (see
[`conformance/README.md`](conformance/README.md)), are not aspirational — they're the
acceptance bar. If you implement this calculator against another chain-SDK or in
another ecosystem and reproduce every row in
[`vectors/base-2026-07-13.json`](vectors/base-2026-07-13.json), open an issue — that's
the bar for a fourth entry in the [package table](#-packages) above.

## 📈 A note on live numbers

Numbers from a live `getAgentFeedback` call will drift over time — on-chain feedback
only ever grows, so an agent's `witnesses`, `expectation`, and `uncertainty` today will
not match this README, the examples' captured transcripts, or even themselves an hour
from now. That's expected, not a bug. The one thing that does **not** drift is
[`vectors/base-2026-07-13.json`](vectors/base-2026-07-13.json): a frozen snapshot,
timestamped in its own filename, that every language's conformance suite checks
against instead of the live chain.

## 📖 Why no score? Read the theory

If you're wondering why this SDK insists on `expectation` + `uncertainty` + caveats
instead of just handing you a single "trust score," the reasoning — with no assumed
statistics background — is in [`docs/THEORY.md`](docs/THEORY.md).

## 🛠️ Development

```sh
pnpm install
pnpm run lint         # ALL THREE languages: eslint+prettier, ruff check+format, fmt+clippy
pnpm -r typecheck     # tsc --noEmit, TypeScript package
pnpm -r test          # vitest + pytest + cargo test, golden-vector conformance included
pnpm -r test:live     # live smoke tests against public Base RPCs (not run in CI)
pnpm -r build         # compile TypeScript to dist/
```

Project layout:

- `packages/ts` — the TypeScript package (`agent-reputation`): facts layer (viem
  actions) + calculator layer + golden-vector conformance tests.
- `packages/py` — the Python package (`web3-agent-reputation`): facts layer (web3.py
  external module) + calculator layer, numerically identical to `packages/ts`.
- `packages/rs` — the Rust package (`alloy-agent-reputation`): facts layer (alloy
  provider extension trait) + calculator layer, same golden vectors.
- `vectors/` — the cross-language golden-vector conformance fixtures.
- `conformance/` — the second half of the cross-language contract: canonical caveat
  strings, verification test cases, and the API-surface manifest — see
  [`conformance/README.md`](conformance/README.md).
- `docs/THEORY.md` — the background theory behind the calculator, written for readers
  with no statistics background.
- `examples/` — runnable, documented example scripts in every language (see
  [`examples/README.md`](examples/README.md)).
- `.github/workflows/` — CI (`ci.yml`) and a dry-run-only manual release workflow
  (`release.yml`); see [CHANGELOG.md](CHANGELOG.md) for the "flip at release" note.

## 📊 Status

**v0.1.0 — three languages, one contract.** All three packages — `agent-reputation`
(npm), `web3-agent-reputation` (PyPI), `alloy-agent-reputation` (crates.io) — implement
the same facts + calculator layers and pass the same golden vectors and conformance
suite (205 tests across the three languages, one shared contract). See the
[Packages](#-packages) table for per-registry release status and
[CHANGELOG.md](CHANGELOG.md) for the full history.

## 🔗 Sibling project

[web3-agents-mcp](https://github.com/hanjoonchoe/web3-agents-mcp) is an MCP server over
the same ERC-8004 registries — the same facts, exposed as tools for an MCP-speaking
agent instead of as an SDK extension. It emits facts and caveats the same way this SDK
does; it does not score agents either.

## 📄 License

MIT — see [LICENSE](LICENSE).
