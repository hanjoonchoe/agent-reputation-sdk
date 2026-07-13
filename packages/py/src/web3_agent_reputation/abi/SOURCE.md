# ABI / address provenance

> **Provenance note (WP-C, 2026-07-13):** `identity.json`, `reputation.json`,
> `validation.json` in this directory, and the 7-chain table in `../chains.py`, were
> copied verbatim from `packages/ts/src/registry/abi/*.json` and
> `packages/ts/src/chains/config.ts` in this same repository, at the `wp-c` branch point
> off `develop` (commit `1bf1399`, "feat(calculator): add pure reputation calculator +
> golden base vectors"). No ABI fragments or addresses were re-derived or re-verified by
> this Python port. That TS module's own header documents the full further chain of
> provenance back to `web3-agents-mcp` commit `243257ffddcbf82b16a73b22d061910281f4be4c`
> and `erc-8004/erc-8004-contracts` commit `68fc6765761a10fb26f0692df21c8a6f9d12b1be` —
> see `packages/ts/src/registry/abi/SOURCE.md` for that full derivation (CREATE2
> vanity-salt deployment, `eth_getCode` binary search per chain, per-chain
> `deploymentBlock`s). Everything in that upstream document applies unchanged here; this
> file only records the intra-repo copy step.
