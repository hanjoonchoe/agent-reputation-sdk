# AGENTS.md

Guidance for coding agents working on `agent-reputation-sdk` — Ethereum SDK extensions
(TypeScript/viem, Python/web3.py, Rust/alloy) for ERC-8004 Trustless Agents: typed
registry reads plus a policy-driven reputation calculator. Read the [README](README.md)
for what this is; this file is how to work on it without breaking its invariants.

## Setup & commands

```sh
# TypeScript + repo-wide entrypoints (run from repo root)
pnpm install
pnpm run lint        # ALL THREE languages: eslint+prettier, ruff check+format, fmt+clippy
pnpm run lint:ts / lint:py / lint:rs
pnpm -r test         # TS suites (incl. golden-vector conformance)
pnpm -r build

# Python
cd packages/py && uv sync && uv run pytest        # live tests: uv run pytest -m live

# Rust  (toolchain: ~/.cargo/bin)
cd packages/rs && cargo test                      # live tests: cargo test -- --ignored
```

All three linters and all three test suites must be green before a change is done —
`pnpm run lint` from the root runs exactly what CI runs.

## Hard rules — never violate, regardless of what a task seems to ask

1. **Read-only, forever.** No signing, no transactions, no write calls, no key material —
   in any language. If a task needs writes, stop and ask a human.
2. **Never a bare scalar.** Every reputation result carries `expectation` AND
   `uncertainty` AND witness statistics AND caveats AND the echoed policy. Never add a
   score/rating/verdict field that travels alone.
3. **The golden vectors are the contract.** `vectors/base-2026-07-13.json` +
   `conformance/` define correct behavior. A calculator change that breaks a vector is
   wrong until the fixture is deliberately regenerated — and regenerating requires
   updating ALL THREE languages in the same change-set. The fixture is never "adjusted"
   to make one implementation pass.
4. **Caveat strings are canonical in `conformance/caveats.json`.** Each language embeds
   byte-identical copies, enforced by tests. Edit the JSON + all three constants
   together or not at all.
5. **ABIs/addresses only from provenance.** Every ABI fragment and contract address
   traces to a SOURCE.md provenance chain (→ web3-agents-mcp → erc-8004/erc-8004-contracts).
   Never write an ABI or address from memory.

## Cross-language parity (the core discipline)

The three packages are one design, three renderings — module-for-module:

| Concern | ts | py | rs |
|---|---|---|---|
| Extension | `src/actions/` (viem `.extend`) | `module.py` (external module) | `facts.rs` (ext. trait) |
| Calculator | `src/calculator/` | `calculator.py` | `calculator.rs` |
| File verify | `src/fetcher/` | `fetch.py`+`cid.py` | `fetch.rs`+`cid.rs` |
| Chains/ABIs | `src/chains/`+`registry/abi/` | `chains.py`+`abi/` | `chains.rs`+`registry/abi/` |
| Errors | `errors.ts` | `errors.py` | `errors.rs` |

**Any behavior change fans out to all three languages in one change-set**, spec/fixtures
first: update `conformance/` (and `vectors/` if numeric), watch the suites go red in
every language, then fix each. Never ship languages out of sync; releases are triples
(same version on npm + PyPI + crates.io) or they are not releases.

Determinism rules the calculator: accumulate witnesses in ascending lowercase-address
order, IEEE-754 f64, no I/O, no clock, no randomness. Match the host ecosystem's idiom
at the surface (viem-style thrown Error classes / Python exceptions / thiserror enum;
camelCase / snake_case per language) — but keep names mapped 1:1 per
`conformance/api-manifest.json`.

## Testing policy

- Unit suites are network-free (injected fetchers, mocked transports); live tests are
  opt-in only (`test:live` / `pytest -m live` / `cargo test -- --ignored`) and never in CI.
- Conformance tests (vectors + caveats + verification cases) are the acceptance bar for
  any port or refactor. A new language ships only when it passes them all.
- Live numbers drift as on-chain feedback grows — fixtures embed their own snapshots;
  never "fix" a fixture from live reads.

## Commits, releases, publishing

- Conventional commits (`feat(ts):`, `fix(py):`, `docs:`, …). NEVER add AI attribution
  (no Co-Authored-By AI trailers, no "Generated with" lines).
- Branch off `develop`; `main` only receives promotions from `develop`.
- **Never publish**: no `npm publish`, `uv publish`, or `cargo publish` from an agent
  session — releases are human-gated (release.yml is deliberately dry-run).

## References

- ERC-8004 spec: https://eips.ethereum.org/EIPS/eip-8004
- Reference contracts: https://github.com/erc-8004/erc-8004-contracts
- Beta Reputation System (the calculator's primary source): Jøsang & Ismail 2002 —
  https://www.mn.uio.no/ifi/english/people/aca/josang/publications/ji2002-bled.pdf
- Sibling project (MCP server over the same registries): https://github.com/hanjoonchoe/web3-agents-mcp

Deployed-contract reality beats this file and beats model memory — check the sources,
then update SOURCE.md if reality moved.
