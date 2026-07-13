# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project intends to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it ships v0.1.0.

## [Unreleased]

Wave 1: the TypeScript package's facts + calculator layers, cross-language golden
vectors, examples, CI, and dry-run release plumbing.

### Added

- `packages/ts` (`agent-reputation`, npm — name reserved, not yet published):
  `erc8004Actions()` viem client extension providing the read-only facts layer —
  `getAgent`, `getAgentFeedback`, `getAgentValidations`, `getRegistrationFile` — across
  the 7 chains with CREATE2-identical ERC-8004 registry addresses.
  - Typed error hierarchy rooted at `Erc8004Error` (`AgentNotFoundError`,
    `ChainUnsupportedError`, `RpcError`, `FileUnreachableError`,
    `FileHashMismatchError`, `InvalidInputError`).
  - Registration-file fetch + verification for `data:`, `ipfs://` (CID-checked), and
    `https://` (unverifiable, `verified: null` by design) `tokenUri` schemes.
- Pure reputation calculator (`calculateReputation`, `uniform`, `activitySqrt`):
  zero-dependency, deterministic, Beta(1,1)-posterior aggregation over feedback
  entries with witness-capping (variant B) and pluggable credibility weighting.
  Never returns a bare scalar — every result carries `uncertainty`, `witnesses`,
  `topWitnessShare`, mandatory caveats, and the echoed policy.
- [`vectors/`](vectors/) — golden cross-language conformance fixtures
  (`base-2026-07-13.json`, live Base mainnet agents 0–9), the contract every language
  implementation must reproduce exactly (3-decimal tolerance) before it ships.
- `examples/ts/vet-agent.ts` — a runnable pre-delegation guard example (facts + both
  calculator variants, exits nonzero on an unverified file or high uncertainty), plus
  `examples/README.md`.
- CI (`.github/workflows/ci.yml`): TypeScript lint/typecheck/test/build on Node 20 + 22,
  on every PR and push to `main`/`develop`. A `py` job is wired in ahead of time for
  `packages/py` (WP-C) — guarded to skip gracefully until that package lands. Live
  on-chain smoke tests are intentionally excluded from CI (`pnpm test:live` only, run
  manually).
- Release workflow (`.github/workflows/release.yml`): manual `v*`-tag trigger, builds
  and tests, then simulates an npm publish (`--provenance --dry-run`) for
  `packages/ts`. The PyPI publish step (Trusted Publishing via
  `pypa/gh-action-pypi-publish`) is present but commented out. **Nothing in this
  workflow publishes anything.**
- Root README rewrite: two-layer contract, package status table, design principles,
  and the golden-vectors conformance challenge.

### Notes

- `packages/ts/package.json` still has `"private": true`. Flipping it to `false` (and
  dropping `--dry-run` from the release workflow's npm publish step) is a deliberate,
  separate change for whoever ships the first real `v0.1.0` release — not done here.
- The npm package name `agent-reputation` is reserved (an empty placeholder has been
  published) but not yet in active use.
