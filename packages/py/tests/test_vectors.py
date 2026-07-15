"""Golden vector conformance -- the cross-language contract.

Loads ``vectors/base-2026-07-13.json`` (path-relative, no network) and re-derives every
`expected` row with the Python calculator, asserting 3-decimal equality (round half away
from zero, same as the fixture and ``packages/ts/test/calculator/vectors.test.ts``).
THIS IS THE CONTRACT -- if any row mismatches, the bug is in this port, never the
fixture.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from web3_agent_reputation.calculator import FeedbackEntry, activity_sqrt, calculate_reputation

FIXTURE_PATH = Path(__file__).resolve().parents[3] / "vectors" / "base-2026-07-13.json"

with FIXTURE_PATH.open() as f:
    FIXTURE = json.load(f)


def round3(n: float) -> float:
    sign = -1 if n < 0 else 1
    return sign * round(abs(n) * 1000) / 1000


def test_fixture_has_23_expected_rows():
    assert len(FIXTURE["expected"]) == 23


def _row_id(r: dict) -> str:
    suffix = f"-br{r['baseRate']}" if "baseRate" in r else ""
    return f"agent{r['agentId']}-variant{r['variant']}{suffix}"


@pytest.mark.parametrize(
    "row",
    FIXTURE["expected"],
    ids=[_row_id(r) for r in FIXTURE["expected"]],
)
def test_conformance_row(row):
    entries = [
        FeedbackEntry(client=e["client"], score=e["score"]) for e in FIXTURE["feedback"][str(row["agentId"])]
    ]
    credibility = activity_sqrt(FIXTURE["distinctCounts"])

    rep = calculate_reputation(
        entries,
        witness_cap=row["witnessCap"],
        credibility=credibility,
        credibility_name="activity-sqrt",
        base_rate=row.get("baseRate", 0.5),
    )

    assert round3(rep.expectation) == row["expectation"]
    assert round3(rep.uncertainty) == row["uncertainty"]
    assert rep.witnesses == row["witnesses"]
    assert round3(rep.top_witness_share) == row["topWitnessShare"]


KNOWN_TABLE = [
    {
        "agentId": 0,
        "variant": "A",
        "witnessCap": None,
        "expectation": 0.847,
        "uncertainty": 0.075,
        "witnesses": 8,
        "topWitnessShare": 0.32,
    },
    {
        "agentId": 0,
        "variant": "B",
        "witnessCap": 1,
        "expectation": 0.66,
        "uncertainty": 0.338,
        "witnesses": 8,
        "topWitnessShare": 0.32,
    },
    {
        "agentId": 1,
        "variant": "A",
        "witnessCap": None,
        "expectation": 0.7,
        "uncertainty": 0.096,
        "witnesses": 20,
        "topWitnessShare": 0.15,
    },
    {
        "agentId": 1,
        "variant": "B",
        "witnessCap": 1,
        "expectation": 0.665,
        "uncertainty": 0.179,
        "witnesses": 20,
        "topWitnessShare": 0.15,
    },
    {
        "agentId": 6,
        "variant": "A",
        "witnessCap": None,
        "expectation": 0.6,
        "uncertainty": 0.2,
        "witnesses": 3,
        "topWitnessShare": 0.75,
    },
    {
        "agentId": 6,
        "variant": "B",
        "witnessCap": 1,
        "expectation": 0.7,
        "uncertainty": 0.4,
        "witnesses": 3,
        "topWitnessShare": 0.75,
    },
]


@pytest.mark.parametrize(
    "known", KNOWN_TABLE, ids=[f"agent{k['agentId']}-{k['variant']}" for k in KNOWN_TABLE]
)
def test_known_table_matches_readme(known):
    row = next(
        r
        for r in FIXTURE["expected"]
        if r["agentId"] == known["agentId"] and r["variant"] == known["variant"]
    )
    assert row["expectation"] == known["expectation"]
    assert row["uncertainty"] == known["uncertainty"]
    assert row["witnesses"] == known["witnesses"]
    # README table displays topWitnessShare to 2 decimals; the fixture stores 3.
    assert round(row["topWitnessShare"] * 100) / 100 == known["topWitnessShare"]
