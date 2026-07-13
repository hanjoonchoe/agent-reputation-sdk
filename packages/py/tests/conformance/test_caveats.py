"""Asserts the caveat strings embedded in this package's calculator byte-match
``conformance/caveats.json`` -- the canonical extraction from
``packages/ts/src/calculator/index.ts``. Ported from
``packages/ts/test/conformance/caveats.test.ts``."""

from __future__ import annotations

import json
from pathlib import Path

from web3_agent_reputation import FeedbackEntry, calculate_reputation

_FIXTURE_PATH = Path(__file__).resolve().parents[4] / "conformance" / "caveats.json"
_FIXTURE = json.loads(_FIXTURE_PATH.read_text())


def _low_volume(n: int) -> str:
    return _FIXTURE["lowVolume"].replace("{n}", str(n))


def test_no_feedback_sybil_and_no_feedback_caveat():
    rep = calculate_reputation([])
    assert rep.caveats == [_FIXTURE["sybil"], _FIXTURE["noFeedback"]]


def test_low_volume_sybil_scale_and_low_volume_caveat():
    entries = [
        FeedbackEntry(client="0xabc", score=80),
        FeedbackEntry(client="0xdef", score=60),
        FeedbackEntry(client="0x111", score=40),
    ]
    rep = calculate_reputation(entries)
    assert rep.caveats == [_FIXTURE["sybil"], _FIXTURE["scale"], _low_volume(3)]


def test_five_or_more_entries_no_low_volume_caveat():
    entries = [FeedbackEntry(client=f"0x{i}", score=50) for i in range(5)]
    rep = calculate_reputation(entries)
    assert rep.caveats == [_FIXTURE["sybil"], _FIXTURE["scale"]]
