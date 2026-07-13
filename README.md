<div align="center">

# agent-reputation-sdk

### Don't ship a score. Compute your own — and let anyone verify it.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Python >= 3.10](https://img.shields.io/badge/python-%3E%3D3.10-blue)](https://www.python.org)
[![Tests](https://img.shields.io/badge/tests-76%20passing-success)](packages/ts/test)
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
- [Development](#-development)
- [Status](#-status)
- [License](#-license)

## 🤔 Why

AI agents are starting to hire, pay, and delegate to other agents. ERC-8004 gives them
an on-chain trust layer — identity, reputation, and validation registries — but reading
that data is only half the problem. The other half is turning raw, Sybil-able,
inconsistently-scaled feedback into a number you can actually act on, *without* handing
that judgment call to a third-party black box.

Most "reputation" tooling collapses this into a single opaque score. This SDK refuses
to: it hands you the facts, lets you declare your own aggregation policy, and returns a
result that always carries its own uncertainty and caveats — computed the same way in
every language it ships in.

## 🚀 Quickstart

```ts
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { erc8004Actions, calculateReputation } from "agent-reputation";

const client = createPublicClient({ chain: base, transport: http() }).extend(erc8004Actions());
const feedback = await client.getAgentFeedback({ agentId: 1n });
const rep = calculateReputation(feedback, { witnessCap: 1 });
```

> Pre-publish: `agent-reputation` isn't on npm yet (name reserved). Run from a checkout
> instead — `pnpm install && pnpm --filter agent-reputation build`, then import from
> `packages/ts/dist`. See [`examples/`](examples/) for a full runnable script.

## 🧱 The two-layer contract (identical in every language)

**Facts layer** — thin typed reads through your existing client; no opinions:

```ts
const client = createPublicClient({ chain: base, transport: http() }).extend(erc8004Actions());
await client.getAgent({ agentId: 1n });
await client.getAgentFeedback({ agentId: 1n });
await client.getRegistrationFile({ agentId: 1n }); // verified: true | false | null
```

**Calculator layer** — a pure function; your policy in, evidence-rich result out:

```ts
const rep = calculateReputation(feedback, { witnessCap: 1, credibility: activitySqrt(distinctCounts) });
// → { expectation: 0.665, uncertainty: 0.179, witnesses: 20,
//     topWitnessShare: 0.15, caveats: [...], policy: { ...echoed } }
```

Neither layer ever returns a bare pass/fail or a single "trust this agent" boolean —
see [Design principles](#-design-principles).

## 📦 Packages

| Language | Host SDK | Package | Status |
| -------- | -------------------------------- | --------------- | ------- |
| TypeScript | [viem](https://viem.sh) actions | [`agent-reputation`](packages/ts) (npm) | live-reserved |
| Python | [web3.py](https://web3py.readthedocs.io) external module | `web3-agent-reputation` (PyPI) | planned |
| Rust | [alloy](https://alloy.rs) extension trait | `alloy-agent-reputation` (crates) | planned |

"live-reserved" means the npm package name is claimed (an empty placeholder is
published) but the SDK itself isn't published under it yet — see
[CHANGELOG.md](CHANGELOG.md).

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
> This library computes what *you* asked for, under a policy *you* declared. It does not
> define "the" score for any agent, and it never will.

## 🧪 The golden vectors — a conformance challenge

[`vectors/`](vectors/) is a frozen snapshot of real ERC-8004 feedback (Base mainnet,
agents 0–9) plus the exact expected output of the reference calculator, for two policy
variants, to three decimal places. It's the cross-language contract that makes
"agent-reputation for viem," "web3-agent-reputation for web3.py," and
"alloy-agent-reputation for alloy" the *same* calculator wearing three different host
SDKs, rather than three independent reimplementations that happen to agree most of the
time.

**Port it to your language, pass the vectors.** If you implement this calculator
against another chain-SDK or in another ecosystem and reproduce every row in
[`vectors/base-2026-07-13.json`](vectors/base-2026-07-13.json), open an issue — that's
the bar for a fourth entry in the package table above.

## 🛠️ Development

```sh
pnpm install
pnpm -r lint         # eslint + prettier --check, every package
pnpm -r typecheck    # tsc --noEmit, every package
pnpm -r test         # vitest, excludes live-chain smoke tests
pnpm -r test:live    # live smoke tests against public Base RPCs (not run in CI)
pnpm -r build        # compile TypeScript to dist/, every package
```

Project layout:

- `packages/ts` — the TypeScript package (`agent-reputation`): facts layer (viem
  actions) + calculator layer + golden-vector conformance tests.
- `packages/py` — the Python package (`web3-agent-reputation`, planned).
- `vectors/` — the cross-language golden-vector conformance fixtures.
- `examples/` — runnable, documented example scripts (see
  [`examples/README.md`](examples/README.md)).
- `.github/workflows/` — CI (`ci.yml`) and a dry-run-only manual release workflow
  (`release.yml`); see [CHANGELOG.md](CHANGELOG.md) for the "flip at release" note.

## 📊 Status

Wave 1 shipped: TypeScript facts + calculator layers, golden vectors, examples, CI, and
dry-run release plumbing. Package names follow each host ecosystem's convention
(unprefixed for viem culture, host-prefixed for web3.py/alloy). Nothing is published
yet — see the [Packages](#-packages) table.

## 📄 License

MIT — see [LICENSE](LICENSE).
