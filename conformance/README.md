# `conformance/`

Cross-language sameness, enforced by construction instead of discipline. Alongside
`vectors/` (calculator golden vectors), this directory is the second half of the
cross-language contract every package in this repo must satisfy.

## The three files

- **`caveats.json`** — the canonical caveat strings, extracted verbatim from
  `packages/ts/src/calculator/index.ts`. Every language's calculator embeds these as
  constants; each package has a test that asserts its embedded strings byte-match this
  file (`lowVolume` is a `{n}`-templated string — substitute the feedback count before
  comparing). This file is generated *from* the TS source, not hand-maintained
  separately: if the TS constants ever change, update this file in the same commit.

- **`verification-cases.json`** — language-agnostic test cases for
  `fetchRegistrationFile` / `fetch_registration_file` / `fetch_registration_file_with`,
  covering `data:` (JSON and non-JSON), `https://` (always `verified: null`), `ipfs://`
  (CID match and mismatch, content embedded as base64 so all three languages fetch the
  identical bytes through an injected fetcher), an unsupported scheme, and an oversize
  response. Each language has one table-driven test that iterates this file through its
  fetch/verify path with an injected fetcher and asserts the expected outcome (or, for
  the error cases, the expected canonical error name — see `api-manifest.json`'s
  `errorNamingRule` for how each language spells it).

- **`api-manifest.json`** — the canonical surface for the 4 facts-layer methods
  (`getAgent`, `getAgentFeedback`, `getAgentValidations`, `getRegistrationFile`) plus the
  calculator (`calculateReputation`): method names (declared in camelCase, mapped to
  snake_case for py/rs), result field names, the 6 error names, and the 2 credibility
  strategy names (`uniform`, `activity-sqrt`). Each package has a test asserting its
  actual exported surface matches this file. `scripts/check-parity.mjs` (root
  `pnpm run check:parity`) does a cheap, language-agnostic version of the same check by
  grepping each package's source for the manifest's declared names, as a fast CI gate
  that doesn't require building/importing all three toolchains.

## The porting rule

**A new language passes `vectors/` + `conformance/` or it doesn't ship.** Bit-for-bit
golden-vector reproduction and byte-matching caveats/verification-cases/API-surface are
not aspirational — they're the acceptance bar. A fourth-language port that reproduces the
algorithm "close enough" but drifts on caveat wording, error names, or verification
semantics has not actually ported this SDK; it has built something else with the same
name.
