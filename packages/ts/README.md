# agent-reputation

Typed [viem](https://viem.sh) actions for [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004), plus a pure, policy-driven reputation calculator. Read-only, forever: no signing, no writes, no `WalletClient` anywhere. The facts layer decodes registry state and hands you facts and caveats, never an opinion; the calculator layer is a separate pure function — your policy in, an evidence-rich result out — that never returns a bare scalar.

## Install

```sh
npm install agent-reputation viem
```

`viem` is a peer dependency — bring your own version (`^2.0.0`).

## Usage

```ts
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { erc8004Actions } from "agent-reputation";

const client = createPublicClient({ chain: base, transport: http() }).extend(erc8004Actions());

await client.getAgent({ agentId: 1n });
// { agentId, owner, tokenUri, registeredAt }

await client.getAgentFeedback({ agentId: 1n });
// Array<{ client, score /* 0-100 */, tag, uri, timestamp }>

await client.getAgentValidations({ agentId: 1n });
// Array<{ validator, method /* 'tee' | 'zk' | 'reexec' | 'other' */, requestHash, response, timestamp }>

await client.getRegistrationFile({ agentId: 1n });
// { verified /* true | false | null */, content, contentError, source, hash }
```

The chain is read from the client itself (`client.chain.id`), validated against the 7
chains this package knows the ERC-8004 registry addresses for (ethereum, base, polygon,
arbitrum, optimism, bnb, gnosis — all CREATE2-identical addresses). An unconfigured or
unsupported chain throws `ChainUnsupportedError`.

## The four actions

| Action                | Reads                                                               | Notes                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getAgent`            | Identity Registry (`ownerOf`, `tokenURI`)                           | `registeredAt` is best-effort (a `Registered`-event log-scan); `null` if unresolvable                                                                |
| `getAgentFeedback`    | Reputation Registry (`readAllFeedback`)                             | score is a best-effort 0-100 normalization of the contract's free-form `(value, valueDecimals)`; no on-chain "score" convention is enforced          |
| `getAgentValidations` | Validation Registry (`getAgentValidations` + `getValidationStatus`) | `response` is contract-enforced 0-100; `method` is a best-effort classification of the validator's free-text `tag`                                   |
| `getRegistrationFile` | `tokenUri` fetch + verification                                     | `data:` → always `verified: true`; `ipfs://` → CID-checked, `true`/`false`; `https://` → always `verified: null` (no on-chain hash commitment in v1) |

`getAgentFeedback`/`getAgentValidations`/`getRegistrationFile` all resolve the agent via
`getAgent` first, so an unregistered `agentId` throws `AgentNotFoundError` consistently
across every action rather than surfacing a confusing empty result.

`getRegistrationFile` is stateless — no cache of any kind, every call re-fetches and
re-verifies from scratch. It's fully offline-testable via an injectable `fetchImpl`.

## Errors

Every thrown error extends `Erc8004Error` (never a bare `Result` envelope, matching
viem's own idiom):

- `AgentNotFoundError` — `agentId` has no registered owner
- `ChainUnsupportedError` — `client.chain` missing or not one of the 7 configured chains
- `RpcError` — any other RPC/decode failure (network, timeout, unrecognized revert)
- `FileUnreachableError` — registration file fetch failed (network, timeout, size cap, malformed URI)
- `FileHashMismatchError` — reserved for strict-verification callers; the built-in
  `getRegistrationFile` flow reports a CID mismatch as `verified: false` rather than
  throwing
- `InvalidInputError` — caller-supplied argument validation failure

Upstream error messages are sanitized to their first line (≤300 chars); full detail is
preserved on `.cause`.

## The calculator layer

`calculateReputation` is a pure function — zero dependencies, no viem, no I/O, no
clock, no randomness — that turns raw `FeedbackEntry[]` (as read by `getAgentFeedback`)
plus your declared `Policy` into an evidence-rich `Reputation` result:

```ts
import { activitySqrt, calculateReputation, uniform } from "agent-reputation";

const feedback = await client.getAgentFeedback({ agentId: 1n });

// Variant A: pool all evidence, every client weighted equally.
calculateReputation(feedback, { witnessCap: null, credibility: uniform() });

// Variant B: cap each witness's evidence to 1 unit, weight by activity.
calculateReputation(feedback, { witnessCap: 1, credibility: activitySqrt(distinctCounts) });
// → { expectation, uncertainty, witnesses, entries, topWitnessShare, caveats, policy }
```

- `witnessCap` — `null`/omitted pools all evidence per client unscaled (variant A); a
  number `W` caps each client's total evidence to `W` units before credibility
  weighting (variant B), so one heavy submitter can't dominate the result.
- `credibility` — a `(client: string) => number` in `[0, 1]`; defaults to `uniform()`
  (every client weighted equally). `activitySqrt(distinctCounts)` weights by
  `sqrt(d_k) / sqrt(d_max)`, where `d_k` is how many distinct agents client `k` has
  rated in the caller-supplied `distinctCounts` map.
- The result is read off a Beta(1,1)-prior posterior over pooled/discounted evidence —
  `expectation` and `uncertainty` always sum information, never collapse it to a single
  pass/fail.
- `caveats` are deterministic and unremovable (a Sybil-risk caveat and a score-scale
  caveat are always present; low-volume feedback adds a third).

See [`packages/ts/src/calculator/index.ts`](src/calculator/index.ts) for the full
normative algorithm description, and [`vectors/`](../../vectors) for the cross-language
golden test vectors this implementation must reproduce exactly.

## Read-only, forever

This package never imports or accepts a `WalletClient`. If a future version needs write
support, it will live in a different package — this one's contract with consumers is
that it can never sign or send a transaction.
