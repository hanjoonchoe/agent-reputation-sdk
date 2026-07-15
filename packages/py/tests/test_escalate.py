"""Unit tests for should_escalate, mirroring
``packages/ts/test/gate/escalate.test.ts``."""

from __future__ import annotations

from web3_agent_reputation.calculator import FeedbackEntry, calculate_reputation
from web3_agent_reputation.escalate import should_escalate


def test_no_thresholds_never_escalates():
    rep = calculate_reputation([FeedbackEntry("0xabc", 90)])
    verdict = should_escalate(rep)
    assert verdict.escalate is False
    assert verdict.reasons == []


def test_thin_evidence_escalates_on_sufficiency():
    rep = calculate_reputation([FeedbackEntry("0xa", 100) for _ in range(3)])
    verdict = should_escalate(rep, min_witnesses=5, max_uncertainty=0.2)
    assert verdict.escalate is True
    assert any("witnesses" in r for r in verdict.reasons)
    assert any("uncertainty" in r for r in verdict.reasons)


def test_concentrated_evidence_escalates_on_concentration():
    entries = [FeedbackEntry("0xa", 80) for _ in range(3)] + [FeedbackEntry("0xb", 80)]
    rep = calculate_reputation(entries)
    verdict = should_escalate(rep, max_top_witness_share=0.5)
    assert verdict.escalate is True
    assert len(verdict.reasons) == 1
    assert "concentrated" in verdict.reasons[0]


def test_empty_feedback_always_trips_sufficiency():
    rep = calculate_reputation([])
    assert rep.uncertainty == 1
    assert should_escalate(rep, max_uncertainty=0.9).escalate is True
