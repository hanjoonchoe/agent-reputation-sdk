# Examples

The same pre-delegation guard, in all three languages — pick your stack:

| Language   | Location                                                                       | Run                                                                  |
| ---------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| TypeScript | [`ts/vet-agent.ts`](ts/vet-agent.ts)                                           | `npx tsx examples/ts/vet-agent.ts 1`                                 |
| Python     | [`../packages/py/examples/vet_agent.py`](../packages/py/examples/vet_agent.py) | `cd packages/py && uv run python examples/vet_agent.py --agent-id 1` |
| Rust       | [`../packages/rs/examples/vet_agent.rs`](../packages/rs/examples/vet_agent.rs) | `cd packages/rs && cargo run --example vet_agent -- 1`               |

(Python/Rust examples live inside their packages per each ecosystem's convention —
`cargo run --example` requires it; this page is the index.)

## `ts/vet-agent.ts` — pre-delegation guard

A ~50-line runnable script showing the intended shape of a real pre-delegation check:
before one agent hands off work (or funds, or trust) to another ERC-8004 agent, read
the on-chain facts and compute reputation under your own declared policy — then refuse
to proceed unless the registration file is verified and the result is confident enough.

```sh
pnpm install
pnpm --filter agent-reputation build   # examples import the built package, like a real consumer
npx tsx examples/ts/vet-agent.ts [agentId] [uncertaintyThreshold]
```

- `agentId` — defaults to `1` (Base mainnet).
- `uncertaintyThreshold` — defaults to `0.3`; the script exits `1` if the
  capped-variant (`witnessCap: 1`) uncertainty exceeds it, or if the registration
  file isn't `verified === true`.

Run via [`tsx`](https://github.com/privatenumber/tsx) (`npx tsx`), which type-strips
and executes the `.ts` file directly — no separate build step for the example itself.
`node --experimental-strip-types` is a viable alternative on Node 22.6+ if you'd rather
avoid the extra dependency, though this repo pins `tsx` for consistency across Node
versions in the CI matrix (Node 20 + 22).

### What it does NOT do

It does not produce a single trust score. It prints both calculator variants
(pooled evidence vs. one-evidence-unit-per-witness) plus the mandatory caveats, and
gates on `verified` + `uncertainty` — the actual "should I delegate" judgment call
stays with whoever reads the output (or wires it into their own agent's control flow).

### Live transcripts (Base mainnet, captured 2026-07-13)

```
$ npx tsx examples/ts/vet-agent.ts 0
Agent #0 — owner 0xa1DaEe3EB47f05f857aCA817523F9ff11d95bD71
registration file: verified=true (source=data)
variant A (pooled): expectation=0.860 uncertainty=0.034 witnesses=8
variant B (capped): expectation=0.702 uncertainty=0.200 witnesses=8
caveats: Feedback is self-reported by clients and may include Sybil or spam entries; treat scores as a weak signal. On-chain feedback uses inconsistent score scales; averages are clamped to 0-100 and may overstate quality.

OK to proceed — subject to your own further judgment; this is not a score.
$ echo $?
0
```

```
$ npx tsx examples/ts/vet-agent.ts 1
Agent #1 — owner 0x89E9E1ab11dD1B138b1dcE6d6A4a0926aaFD5029
registration file: verified=true (source=data)
variant A (pooled): expectation=0.696 uncertainty=0.049 witnesses=20
variant B (capped): expectation=0.671 uncertainty=0.091 witnesses=20
caveats: Feedback is self-reported by clients and may include Sybil or spam entries; treat scores as a weak signal. On-chain feedback uses inconsistent score scales; averages are clamped to 0-100 and may overstate quality.

OK to proceed — subject to your own further judgment; this is not a score.
$ echo $?
0
```

Note: on-chain feedback for agent #1 only ever grows, so these numbers (and witness
counts) will drift upward over time — that's expected, not a bug. The frozen
[`vectors/base-2026-07-13.json`](../vectors/base-2026-07-13.json) snapshot (used by the
cross-language conformance tests) is what stays fixed.
