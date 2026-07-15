"""Unit tests for the pure calculator, mirroring
``packages/ts/test/calculator/index.test.ts``."""

from __future__ import annotations

import math

import pytest

from web3_agent_reputation.calculator import (
    SCALE_CAVEAT,
    SYBIL_CAVEAT,
    FeedbackEntry,
    activity_sqrt,
    calculate_reputation,
    uniform,
)
from web3_agent_reputation.errors import InvalidInputError


def test_empty_input():
    result = calculate_reputation([])
    assert result.expectation == 0.5
    assert result.uncertainty == 1
    assert result.witnesses == 0
    assert result.entries == 0
    assert result.top_witness_share == 0
    assert result.caveats == [SYBIL_CAVEAT, "No feedback recorded."]
    assert result.policy == {"witnessCap": None, "credibility": "uniform", "baseRate": 0.5}


def test_base_rate_defaults_and_shifts():
    entries = [FeedbackEntry("0xa", 100)]
    # default a=0.5 -> Laplace: (1 + 1)/(1+0+2) = 2/3
    assert calculate_reputation(entries).policy["baseRate"] == 0.5
    assert calculate_reputation(entries).expectation == pytest.approx(2 / 3, abs=1e-12)
    # E = (r + 2a)/(r+s+2); r=1,s=0: a=0 -> 1/3, a=1 -> 1
    assert calculate_reputation(entries, base_rate=0).expectation == pytest.approx(1 / 3, abs=1e-12)
    assert calculate_reputation(entries, base_rate=1).expectation == pytest.approx(1, abs=1e-12)
    # empty feedback reverts entirely to the base rate
    assert calculate_reputation([], base_rate=0.2).expectation == 0.2


def test_base_rate_out_of_range_rejected():
    with pytest.raises(InvalidInputError):
        calculate_reputation([], base_rate=1.5)
    with pytest.raises(InvalidInputError):
        calculate_reputation([], base_rate=-0.1)


def test_single_witness_3x100():
    entries = [FeedbackEntry("0xAAA", 100) for _ in range(3)]
    result = calculate_reputation(entries)
    assert result.expectation == pytest.approx(0.8, abs=1e-12)
    assert result.uncertainty == pytest.approx(0.4, abs=1e-12)
    assert result.witnesses == 1
    assert result.entries == 3
    assert result.top_witness_share == 1


def test_witness_cap_scales_dominant_witness():
    entries = [FeedbackEntry("0xAAA", 100) for _ in range(3)]
    uncapped = calculate_reputation(entries)
    capped = calculate_reputation(entries, witness_cap=1)
    assert capped.expectation == pytest.approx(2 / 3, abs=1e-12)
    assert capped.uncertainty == pytest.approx(2 / 3, abs=1e-12)
    assert capped.policy["witnessCap"] == 1
    assert capped.expectation != pytest.approx(uncapped.expectation, abs=1e-6)


def test_credibility_discount():
    entries = [FeedbackEntry("0xAAA", 100)]
    result = calculate_reputation(entries, credibility=lambda _c: 0.5, credibility_name="half")
    assert result.expectation == pytest.approx(0.6, abs=1e-12)
    assert result.policy["credibility"] == "half"


def test_activity_sqrt_names_and_computes():
    cred = activity_sqrt({"0xaaa": 1, "0xbbb": 4})
    assert cred.__name__ == "activity-sqrt"
    assert cred("0xAAA") == pytest.approx(math.sqrt(1) / math.sqrt(4), abs=1e-12)
    assert cred("0xBBB") == pytest.approx(1, abs=1e-12)
    assert cred("0xUNKNOWN") == 0


def test_uniform_names_and_returns_1():
    cred = uniform()
    assert cred.__name__ == "uniform"
    assert cred("anything") == 1


def test_clamp_bounds():
    clamped_high = calculate_reputation([FeedbackEntry("0xAAA", 150)])
    at_cap = calculate_reputation([FeedbackEntry("0xAAA", 100)])
    assert clamped_high.expectation == at_cap.expectation


def test_negative_score_raises_invalid_input():
    with pytest.raises(InvalidInputError):
        calculate_reputation([FeedbackEntry("0xAAA", -1)])


def test_nan_score_raises_invalid_input():
    with pytest.raises(InvalidInputError):
        calculate_reputation([FeedbackEntry("0xAAA", float("nan"))])


def test_case_insensitive_client_grouping():
    entries = [FeedbackEntry("0xAAA", 100), FeedbackEntry("0xaaa", 100)]
    result = calculate_reputation(entries)
    assert result.witnesses == 1
    assert result.entries == 2
    assert result.top_witness_share == 1


def test_determinism_shuffled_input():
    base = [
        FeedbackEntry("0xCCC", 90),
        FeedbackEntry("0xAAA", 10),
        FeedbackEntry("0xBBB", 55),
        FeedbackEntry("0xAAA", 70),
        FeedbackEntry("0xDDD", 33.3),
    ]
    shuffled = [base[3], base[1], base[4], base[0], base[2]]

    result_a = calculate_reputation(base, witness_cap=1, credibility=activity_sqrt({"0xaaa": 2, "0xbbb": 4}))
    result_b = calculate_reputation(
        shuffled, witness_cap=1, credibility=activity_sqrt({"0xaaa": 2, "0xbbb": 4})
    )
    assert result_b == result_a


def test_low_volume_caveat_below_5():
    result = calculate_reputation([FeedbackEntry("0xAAA", 80), FeedbackEntry("0xBBB", 60)])
    assert result.caveats == [
        SYBIL_CAVEAT,
        SCALE_CAVEAT,
        "Only 2 feedback entries exist; statistics are not meaningful.",
    ]


def test_no_low_volume_caveat_at_5_or_more():
    entries = [FeedbackEntry(f"0x{i}", 50) for i in range(5)]
    result = calculate_reputation(entries)
    assert result.caveats == [SYBIL_CAVEAT, SCALE_CAVEAT]
