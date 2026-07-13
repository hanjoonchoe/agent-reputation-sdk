"""Asserts this package's actual exported surface matches
``conformance/api-manifest.json`` -- dataclass fields for `Reputation`, `dir()` of
`ERC8004Module` for method names, and the errors module's `dir()` for the 6 canonical
error names. Mirrors ``packages/ts/test/conformance/api-manifest.test.ts``."""

from __future__ import annotations

import json
from dataclasses import fields
from pathlib import Path

from web3_agent_reputation import FeedbackEntry, activity_sqrt, calculate_reputation, uniform
from web3_agent_reputation import errors as errors_module
from web3_agent_reputation.module import ERC8004Module

_FIXTURE_PATH = Path(__file__).resolve().parents[4] / "conformance" / "api-manifest.json"
_FIXTURE = json.loads(_FIXTURE_PATH.read_text())


def test_erc8004_module_exposes_canonical_facts_layer_methods():
    for method_name, casings in _FIXTURE["methods"].items():
        if method_name == "calculateReputation":
            continue
        assert hasattr(ERC8004Module, casings["py"]), f"missing method {casings['py']}"


def test_errors_module_exposes_canonical_error_classes():
    for name in _FIXTURE["errorNames"]:
        class_name = f"{name}Error"
        assert hasattr(errors_module, class_name), f"missing error class {class_name}"
        assert isinstance(getattr(errors_module, class_name), type)


def test_credibility_strategies_are_exported_under_canonical_names():
    assert uniform().__name__ == "uniform"
    assert activity_sqrt({}).__name__ == "activity-sqrt"
    assert _FIXTURE["credibilityStrategies"] == ["uniform", "activity-sqrt"]


def test_reputation_dataclass_has_exactly_the_canonical_field_names():
    rep = calculate_reputation([FeedbackEntry(client="0xabc", score=50)])
    actual_fields = {f.name for f in fields(rep)}
    # canonical camelCase -> snake_case for this py port's field names.
    expected = {_camel_to_snake(name) for name in _FIXTURE["resultFields"]["Reputation"]}
    assert actual_fields == expected


def _camel_to_snake(name: str) -> str:
    out = []
    for ch in name:
        if ch.isupper():
            out.append("_")
            out.append(ch.lower())
        else:
            out.append(ch)
    return "".join(out)
