"""Pure reputation calculator for ERC-8004 on-chain feedback.

Zero I/O, no network, no clock, no randomness — a plain function of its inputs. This is
a line-for-line port of ``packages/ts/src/calculator/index.ts``; see that module's
docstring for the normative algorithm description (reproduced below) and
``vectors/base-2026-07-13.json`` for the cross-language golden-vector conformance
contract this module must reproduce to 3 decimals.

## Algorithm (normative, copied from the TS reference)

For each feedback entry, ``v = clamp(score, 0, 100) / 100``. Entries are grouped by
client address, compared case-insensitively (addresses are lowercased before grouping).
For each client ``k`` with entries ``v_1..v_n``:

    r_k = sum(v_i)
    s_k = sum(1 - v_i)

If the policy declares a ``witness_cap`` ``W`` (variant B — one evidence unit per
witness), ``(r_k, s_k)`` are scaled by ``min(1, W / (r_k + s_k))`` before anything else.
``witness_cap`` of ``None`` (variant A) pools all evidence unscaled.

Each client's (possibly capped) ``(r_k, s_k)`` is then discounted by that client's
credibility weight ``c_k`` (in ``[0, 1]``, from ``credibility``, default ``uniform()``
i.e. ``c_k = 1`` for everyone):

    r_k *= c_k
    s_k *= c_k

All per-client pairs are summed into totals ``r = sum(r_k)``, ``s = sum(s_k)``, and the
result is read off a Beta(1,1)-prior posterior:

    expectation = (r + 1) / (r + s + 2)
    uncertainty = 2 / (r + s + 2)

``top_witness_share`` is the largest per-client *entry count* divided by the total entry
count (unweighted — a simple concentration signal, independent of witness_cap/credibility).

Decay (time-weighting recent feedback more heavily) is reserved in the policy shape but
not implemented in v1: on-chain reads currently expose no per-entry timestamp (see the
facts layer's ``get_agent_feedback`` — ``timestamp`` is always ``None``), so there is
nothing to decay against yet.

## Determinism

Client accumulation happens in ascending lowercase-address sort order, and all
arithmetic is plain IEEE-754 double precision (Python ``float``, same representation as
JS ``number``). Every conformant implementation MUST accumulate in this same order so
that floating-point summation is bit-for-bit reproducible across runs and across
languages — this is what makes the golden test vectors in ``vectors/`` a meaningful
cross-language contract.

## Deviation (R-3, documented): TypeError -> InvalidInputError

The TS reference raises a plain ``TypeError`` for a negative/NaN/non-numeric score. This
port raises ``web3_agent_reputation.errors.InvalidInputError`` instead, matching this
package's own error-class idiom (``Erc8004Error`` and subclasses) rather than mixing in a
bare built-in exception type.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field

from .errors import InvalidInputError

CredibilityFn = Callable[[str], float]

# Caveats — verbatim strings, copied from the TS reference
# (packages/ts/src/calculator/index.ts), which in turn copied them from
# web3-agents-mcp's src/trust/caveats.ts (SYBIL_CAVEAT, SCALE_CAVEAT) and
# src/tools/get-reputation.ts (the no-feedback / low-volume wording), so that a consumer
# of either package sees consistent language.
SYBIL_CAVEAT = (
    "Feedback is self-reported by clients and may include Sybil or spam entries; "
    "treat scores as a weak signal."
)
SCALE_CAVEAT = (
    "On-chain feedback uses inconsistent score scales; averages are clamped to 0-100 "
    "and may overstate quality."
)
NO_FEEDBACK_CAVEAT = "No feedback recorded."


def _low_volume_caveat(count: int) -> str:
    return f"Only {count} feedback entries exist; statistics are not meaningful."


@dataclass(frozen=True)
class FeedbackEntry:
    client: str
    # 0-100. Values above 100 are clamped; negative or non-finite values are invalid input.
    score: float


@dataclass(frozen=True)
class Reputation:
    expectation: float
    uncertainty: float
    witnesses: int
    entries: int
    top_witness_share: float
    caveats: list[str] = field(default_factory=list)
    policy: dict[str, object] = field(default_factory=dict)


def uniform() -> CredibilityFn:
    """Default credibility policy: every client weighted equally (c_k = 1)."""

    def fn(_client: str) -> float:
        return 1.0

    fn.__name__ = "uniform"
    return fn


def activity_sqrt(distinct_counts: Mapping[str, int]) -> CredibilityFn:
    """Activity-weighted credibility: c_k = sqrt(d_k) / sqrt(d_max), where d_k is the
    number of distinct agents client k has rated (from distinct_counts, keyed by client
    address, case-insensitive) and d_max is the largest distinct count in the map.
    Clients absent from distinct_counts are treated as d_k = 0.
    """
    normalized: dict[str, int] = {}
    max_d = 0
    for client, count in distinct_counts.items():
        key = client.lower()
        normalized[key] = count
        if count > max_d:
            max_d = count

    def fn(client: str) -> float:
        if max_d <= 0:
            return 0.0
        d = normalized.get(client.lower(), 0)
        return math.sqrt(d) / math.sqrt(max_d)

    fn.__name__ = "activity-sqrt"
    return fn


def _to_unit_score(score: float) -> float:
    """Validates and normalizes a raw 0-100 (or beyond) score into v = clamp(score, 0, 100) / 100."""
    if not isinstance(score, (int, float)) or isinstance(score, bool):
        raise InvalidInputError(f"FeedbackEntry.score must be a number, got {score!r}")
    if isinstance(score, float) and math.isnan(score):
        raise InvalidInputError(f"FeedbackEntry.score must be a number, got {score!r}")
    if score < 0:
        raise InvalidInputError(f"FeedbackEntry.score must be >= 0, got {score}")
    clamped = min(score, 100)
    return clamped / 100


def calculate_reputation(
    entries: list[FeedbackEntry],
    *,
    witness_cap: float | None = None,
    credibility: CredibilityFn | None = None,
    credibility_name: str | None = None,
    base_rate: float = 0.5,
) -> Reputation:
    # Base rate a in [0,1] — the fourth term of Jøsang's (b,d,u,a) opinion, the prior
    # the expectation reverts to with no evidence. E = (r + 2a)/(r+s+2); a=0.5 gives
    # Laplace's (r+1)/(r+s+2). See the TS reference and docs/THEORY.md.
    if math.isnan(base_rate) or base_rate < 0 or base_rate > 1:
        raise InvalidInputError(f"base_rate must be in [0, 1], got {base_rate}")

    credibility_fn = credibility if credibility is not None else uniform()
    resolved_name = credibility_name or getattr(credibility_fn, "__name__", "") or "custom"
    echoed_policy: dict[str, object] = {
        "witnessCap": witness_cap,
        "credibility": resolved_name,
        "baseRate": base_rate,
    }

    total_entries = len(entries)

    if total_entries == 0:
        return Reputation(
            expectation=base_rate,
            uncertainty=1.0,
            witnesses=0,
            entries=0,
            top_witness_share=0.0,
            caveats=[SYBIL_CAVEAT, NO_FEEDBACK_CAVEAT],
            policy=echoed_policy,
        )

    # Group by lowercase client address (case-insensitive grouping), preserving each
    # entry's normalized value for later per-client accumulation.
    groups: dict[str, list[float]] = {}
    for entry in entries:
        v = _to_unit_score(entry.score)
        key = entry.client.lower()
        groups.setdefault(key, []).append(v)

    # Determinism: accumulate in ascending lowercase-address sort order.
    sorted_clients = sorted(groups.keys())

    r = 0.0
    s = 0.0
    max_count = 0

    for client in sorted_clients:
        values = groups[client]
        max_count = max(max_count, len(values))

        rk = 0.0
        sk = 0.0
        for v in values:
            rk += v
            sk += 1 - v

        if witness_cap is not None:
            total = rk + sk
            scale = min(1.0, witness_cap / total) if total > 0 else 1.0
            rk *= scale
            sk *= scale

        ck = credibility_fn(client)
        rk *= ck
        sk *= ck

        r += rk
        s += sk

    # E = b + a*u = (r + 2a)/(r+s+2); a = 0.5 recovers Laplace's (r+1)/(r+s+2).
    expectation = (r + 2 * base_rate) / (r + s + 2)
    uncertainty = 2 / (r + s + 2)
    top_witness_share = max_count / total_entries

    caveats = [SYBIL_CAVEAT, SCALE_CAVEAT]
    if total_entries < 5:
        caveats.append(_low_volume_caveat(total_entries))

    return Reputation(
        expectation=expectation,
        uncertainty=uncertainty,
        witnesses=len(sorted_clients),
        entries=total_entries,
        top_witness_share=top_witness_share,
        caveats=caveats,
        policy=echoed_policy,
    )
