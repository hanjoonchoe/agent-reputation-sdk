# erc8004

**Ethereum SDK extensions for [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004)** — typed registry reads plus a policy-driven reputation calculator, as extensions to each ecosystem's canonical Ethereum SDK:

| Language | Host SDK | Package | Status |
| -------- | -------------------------------- | --------------- | ------- |
| TypeScript | [viem](https://viem.sh) actions | `erc8004` (npm) | planned |
| Python | [web3.py](https://web3py.readthedocs.io) external module | `erc8004` (PyPI) | planned |
| Rust | [alloy](https://alloy.rs) extension trait | `alloy-erc8004` | planned |

## The two-layer contract (identical in every language)

**Facts layer** — thin typed reads through your existing client; no opinions:

```ts
const client = createPublicClient({ chain: base, transport: http() }).extend(erc8004Actions());
await client.getAgent({ agentId: 1n });
await client.getAgentFeedback({ agentId: 1n });
await client.getRegistrationFile({ agentId: 1n }); // verified: true | false | null
```

**Calculator layer** — a pure function; your policy in, evidence-rich result out:

```ts
const rep = calculateReputation(feedback, { witnessCap: 1, credibility: activityCredibility(map) });
// → { expectation: 0.665, uncertainty: 0.179, witnesses: 20,
//     topWitnessShare: 0.15, caveats: [...], policy: { ...echoed } }
```

## Design principles

1. **Read-only, forever.** No signing, no writes, in any language.
2. **Never a bare scalar.** Every reputation result carries uncertainty, witness statistics, honesty caveats, and the echoed policy — the reproducibility manifest.
3. **Cross-language determinism.** Every implementation must reproduce the golden test vectors in [`vectors/`](vectors/) exactly. A second language ships only after passing them in CI.
4. **Judgment stays with the consumer.** This library computes what *you* asked for under a policy *you* declared; it does not define "the" score for any agent.

## Status

Pre-alpha: design complete, implementation starting. The npm/PyPI names are reserved for this project.

## License

MIT — see [LICENSE](LICENSE).
