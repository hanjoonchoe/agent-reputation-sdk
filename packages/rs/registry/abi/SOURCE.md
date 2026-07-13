# ABI / address provenance

> **WP-E note (2026-07-13):** these three ABI JSON files (`identity.json`,
> `reputation.json`, `validation.json`) and the chain/deployment-block table reproduced
> in `../../src/chains.rs` are copied byte-for-byte from
> `packages/ts/src/registry/abi/` in this same repository (which is itself the
> upstream source described below — nothing was re-derived for the Rust port). The
> `sol!` interfaces in `../../src/abi.rs` were hand-transcribed from the function
> fragments in these JSON files; see that module's doc comment for the fragment-level
> mapping.

> **Provenance note (WP-A, 2026-07-14):** the ABI JSON files in this directory, and the
> 7-chain table in `../../chains/config.ts`, were copied verbatim from
> `web3-agents-mcp` commit `243257ffddcbf82b16a73b22d061910281f4be4c`
> (`src/registry/abi/*.json`, `src/chains/config.ts`), which in turn derived them from
> `erc-8004/erc-8004-contracts` commit `68fc6765761a10fb26f0692df21c8a6f9d12b1be` as
> documented below. No ABI fragments or addresses were re-derived or re-verified by this
> project — see that project's own commit history for the original extraction and
> `eth_getCode` verification work. Everything below this line is carried over unmodified
> from the source commit.

## Source repository

- Repo: https://github.com/erc-8004/erc-8004-contracts
- Release tag used: **none exists** — as of the retrieval date below the repository has
  no Git tags and no GitHub Releases (`gh api repos/erc-8004/erc-8004-contracts/releases`
  and `.../tags` both return empty lists). The audited v1 contracts are therefore pinned
  to the `master` branch HEAD commit below.
- Commit hash: `68fc6765761a10fb26f0692df21c8a6f9d12b1be`
  (`Merge pull request #83 from Wilbert957/feat/add-0g-mainnet`)
- Retrieval date: 2026-07-13
- Retrieval method: `git clone https://github.com/erc-8004/erc-8004-contracts.git`
  (shallow clone, `--depth 50`, HEAD = commit above)

## ABI extraction

The repo ships pre-built ABIs at `abis/IdentityRegistry.json`, `abis/ReputationRegistry.json`,
`abis/ValidationRegistry.json` (full contract ABIs, including OZ upgradeability/ownable
boilerplate). `src/registry/abi/*.json` in this project are **minimal read-surface
subsets** extracted from those files — only the ABI fragments this work package (or
documented future read-only work) actually needs:

- `identity.json`: `ownerOf`, `tokenURI` (functions used by `src/registry/identity.ts`);
  `Transfer`, `Registered` events (used for owner-enumeration and registration-time
  log-scans, see below); `ERC721NonexistentToken` error (required so viem can decode
  the revert reason for a nonexistent `agentId` into a named error — without this ABI
  entry the revert cannot be classified and would fall through to a generic RPC error).
- `reputation.json`: read-only (`view`/`pure`) functions only —
  `getIdentityRegistry`, `getClients`, `getLastIndex`, `getResponseCount`, `getSummary`,
  `getVersion`, `readAllFeedback`, `readFeedback`. Write functions (`giveFeedback`,
  `revokeFeedback`, `appendResponse`) and upgradeability/ownership boilerplate are
  excluded — out of scope per R-8 (no reputation.ts read module in this WP; ABI only,
  for WP-4 to consume).
- `validation.json`: read-only functions only — `getAgentValidations`,
  `getIdentityRegistry`, `getSummary`, `getValidationStatus`, `getValidatorRequests`,
  `getVersion`. Write functions (`validationRequest`, `validationResponse`) excluded,
  same rationale as above.

## Deployed addresses

All three registries are deployed via CREATE2 through a vanity-salt factory, so **the
same address is used across every mainnet chain** (and a different, but likewise
shared, address across every testnet). Source: `scripts/addresses.ts` (`MAINNET_ADDRESSES`)
and `README.md` in the contracts repo, cross-checked against on-chain `eth_getCode` on
both chains below.

| Registry           | Address                                      |
| ------------------ | -------------------------------------------- |
| IdentityRegistry   | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| ValidationRegistry | `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58` |

### Per-chain table (chains implemented in `src/chains/config.ts`)

| Chain            | chainId | IdentityRegistry (verify)                                                                                  | deploymentBlock | How `deploymentBlock` was derived                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ------- | ---------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ethereum Mainnet | 1       | [etherscan](https://etherscan.io/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)                       | `24339871`      | Binary search over `eth_getCode` at increasing block numbers against a public archive RPC (`https://eth.drpc.org`) until code first appears. Verified: block `24339870` → `0x` (no code), block `24339871` → deployed bytecode present.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Base Mainnet     | 8453    | [basescan](https://basescan.org/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)                        | `41663783`      | Same binary-search method against `https://mainnet.base.org`. Verified: block `41663782` → `0x`, block `41663783` → deployed bytecode present.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Polygon PoS      | 137     | [polygonscan](https://polygonscan.com/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)                  | `82458484`      | `eth_getCode(latest)` first confirmed bytecode present at address via `https://polygon-bor-rpc.publicnode.com`. `deploymentBlock` derived by binary search over `eth_getCode` against the archive RPC `https://polygon.drpc.org` (public full/pruned nodes rejected historical-state queries with "historical state ... is not available"). Verified: block `82458483` → `0x`, block `82458484` → deployed bytecode present. Retrieved 2026-07-13.                                                                                                                                                                                                           |
| Arbitrum One     | 42161   | [arbiscan](https://arbiscan.io/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)                         | `428895443`     | `eth_getCode(latest)` first confirmed bytecode present via `https://arb1.arbitrum.io/rpc`. `deploymentBlock` derived by binary search over `eth_getCode` against the archive RPC `https://arbitrum.drpc.org` (public full nodes rejected historical-state queries with "missing trie node"; the search range was narrowed first via a cheap `eth_getBlockByNumber` timestamp binary search against block timestamps in the same window as the Ethereum/Base deployments, to keep the archive-RPC query count low against a rate-limited free tier). Verified: block `428895442` → `0x`, block `428895443` → deployed bytecode present. Retrieved 2026-07-13. |
| OP Mainnet       | 10      | [optimistic.etherscan](https://optimistic.etherscan.io/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) | `147514947`     | Binary search over `eth_getCode` against `https://mainnet.optimism.io` (this public RPC served historical state directly, no separate archive endpoint needed). Verified: block `147514946` → `0x`, block `147514947` → deployed bytecode present. Retrieved 2026-07-13.                                                                                                                                                                                                                                                                                                                                                                                     |
| BNB Smart Chain  | 56      | [bscscan](https://bscscan.com/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)                          | `79027268`      | `eth_getCode(latest)` first confirmed bytecode present via `https://bsc-dataseed.binance.org`. `deploymentBlock` derived by binary search over `eth_getCode` against the archive-capable public RPC `https://bsc-mainnet.public.blastapi.io` (several other public BSC RPCs — meowrpc, publicnode, ankr, nodereal, blxrbdn, nodies, blockpi — rejected historical-state `eth_getCode` with "header not found"/"missing trie node"/API-key-required errors). Verified: block `79027267` → `0x`, block `79027268` → deployed bytecode present. Retrieved 2026-07-13.                                                                                           |
| Gnosis Chain     | 100     | [gnosisscan](https://gnosisscan.io/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)                     | `44505010`      | Binary search over `eth_getCode` against `https://rpc.gnosischain.com` (this public RPC served historical state directly). Verified: block `44505009` → `0x`, block `44505010` → deployed bytecode present. Retrieved 2026-07-13.                                                                                                                                                                                                                                                                                                                                                                                                                            |

Sanity cross-check: the block timestamp at each derived `deploymentBlock` above (fetched
via `eth_getBlockByNumber`) falls in a single ~2-week window (2026-01-29 through
2026-02-09), consistent across all 7 chains and consistent with the Ethereum/Base
deployment timestamps already recorded above — i.e. the same CREATE2 deployment
transaction(s) were broadcast to every chain within a short rollout window, not derived
from a stale/incorrect binary search.

No official "deployments" manifest with block numbers is published in the contracts
repo (only addresses), so `deploymentBlock` was derived empirically as documented above
rather than invented. This is the value `getAgentsByOwner`'s log-scan uses as
`fromBlock`, so an off-by-one in the conservative direction (as low as possible) is
safe; both directions were explicitly verified with `eth_getCode` at the boundary.

## Domain resolution (`resolveByDomain`)

The audited v1 `IdentityRegistryUpgradeable` contract has **no on-chain domain
registry or resolution function**. `ownerOf`/`tokenURI` are the only identity reads;
domain names only appear as an **optional off-chain field** (`domains: []`) inside the
agent's registration file JSON referenced by `agentURI`/`tokenURI` (see
`ERC8004SPEC.md`, agent registration file schema, and the "Endpoint Domain
Verification" section — an off-chain `.well-known` HTTPS proof, not an on-chain
lookup). There is no ENS-style reverse mapping and no `resolveByDomain`-shaped
function anywhere in the ABI.

Consequently `src/registry/identity.ts`'s `resolveByDomain` always returns `null` — it
does not invent a mechanism. If a future contract version adds on-chain domain
resolution, this function and this note must be updated together.

## Enumeration (`getAgentsByOwner`)

The Identity Registry is a plain `ERC721URIStorage` — it does **not** implement
`ERC721Enumerable` (no `tokenOfOwnerByIndex`, no `totalSupply` in the ABI).
`getAgentsByOwner` therefore reconstructs current ownership via a `Transfer` event
log-scan constrained to `[deploymentBlock, latest]`, rather than a contract
enumeration call. See the code comment in `src/registry/identity.ts` for the exact
algorithm (net current holder is derived by comparing the latest `to`-matching vs.
`from`-matching `Transfer` log per `tokenId`).

## Registration timestamp (`getAgent().registeredAt`)

There is no `registeredAt`/`registeredAtBlock` getter on the contract. `Registered` is
emitted once per agent with `agentId` indexed, so `registeredAt` is resolved via a
best-effort `Registered`-event log-scan (constrained to `[deploymentBlock, latest]`)
followed by an `eth_getBlockByNumber` for the block timestamp. If the log-scan or block
fetch fails for any reason (pruned logs, RPC limitation, etc.) `registeredAt` is `null`
rather than failing the whole `getAgent` read — see Deviations in the WP-2 completion
report.
