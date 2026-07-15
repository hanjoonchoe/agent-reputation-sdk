"""Escalation predicate — "trust this aggregate, or route to a live check?"

A line-for-line port of ``packages/ts/src/gate/escalate.ts``; see that module for the
full rationale. Kept deliberately *outside* the calculator so aggregation stays a pure
function and the consume-the-output policy is a separate, caller-declared concern.

Two axes, not to be conflated:

- **Sufficiency** (``min_witnesses``, ``max_uncertainty``) — is there enough independent
  evidence for the point estimate to mean anything? ``uncertainty`` is Jøsang & Ismail's
  uncertainty mass ``u = 2/(r+s+2)``.
- **Concentration** (``max_top_witness_share``) — is the evidence dominated by one witness?

Neither axis is a Sybil defense. Cheng & Friedman (2005) prove no *symmetric* reputation
function is Sybilproof, and this aggregate is symmetric — a Sybil spreading across many
addresses inflates the sample and *lowers* uncertainty, passing a sufficiency gate.
Adversarial resistance lives in the identity layer. See docs/THEORY.md §3, §6.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .calculator import Reputation


@dataclass(frozen=True)
class EscalationVerdict:
    escalate: bool
    reasons: list[str] = field(default_factory=list)


def should_escalate(
    rep: Reputation,
    *,
    min_witnesses: int | None = None,
    max_uncertainty: float | None = None,
    max_top_witness_share: float | None = None,
) -> EscalationVerdict:
    """Evaluate a Reputation against caller-declared thresholds. A missing threshold is
    simply not checked, so ``should_escalate(rep)`` never escalates."""
    reasons: list[str] = []

    if min_witnesses is not None and rep.witnesses < min_witnesses:
        reasons.append(
            f"insufficient witnesses: {rep.witnesses} < {min_witnesses} (sufficiency)"
        )
    if max_uncertainty is not None and rep.uncertainty > max_uncertainty:
        reasons.append(
            f"uncertainty too high: {rep.uncertainty:.3f} > {max_uncertainty} (sufficiency)"
        )
    if max_top_witness_share is not None and rep.top_witness_share > max_top_witness_share:
        reasons.append(
            f"evidence too concentrated: {rep.top_witness_share:.3f} > "
            f"{max_top_witness_share} (concentration)"
        )

    return EscalationVerdict(escalate=len(reasons) > 0, reasons=reasons)
