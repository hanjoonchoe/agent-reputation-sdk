"""Table-driven port of ``conformance/verification-cases.json`` through
``fetch_registration_file``'s injected-fetch seam. Mirrors
``packages/ts/test/conformance/verification.test.ts``."""

from __future__ import annotations

import base64
import io
import json
from pathlib import Path

import pytest

from web3_agent_reputation import errors as errors_module
from web3_agent_reputation.fetch import fetch_registration_file

_FIXTURE_PATH = Path(__file__).resolve().parents[4] / "conformance" / "verification-cases.json"
_FIXTURE = json.loads(_FIXTURE_PATH.read_text())


class _FakeResponse:
    """Minimal stand-in for ``http.client.HTTPResponse`` (``.status``, ``.read(n)``)."""

    def __init__(self, body: bytes, status: int = 200):
        self.status = status
        self._buf = io.BytesIO(body)

    def read(self, amt: int = -1) -> bytes:
        return self._buf.read(amt)

    def close(self) -> None:
        pass


@pytest.mark.parametrize("case", _FIXTURE["cases"], ids=[c["name"] for c in _FIXTURE["cases"]])
def test_verification_case(case):
    expected = case["expected"]

    fetch_impl = None
    if case.get("contentBase64") is not None:
        body = base64.b64decode(case["contentBase64"])
        fetch_impl = lambda url, timeout, _body=body: _FakeResponse(_body)  # noqa: E731
    elif case.get("byteLength") is not None:
        body = b"\x00" * case["byteLength"]
        fetch_impl = lambda url, timeout, _body=body: _FakeResponse(_body)  # noqa: E731

    if expected["errorName"] is not None:
        error_class = getattr(errors_module, f"{expected['errorName']}Error")
        with pytest.raises(error_class):
            fetch_registration_file(case["uri"], fetch_impl=fetch_impl)
        return

    result = fetch_registration_file(case["uri"], fetch_impl=fetch_impl)
    assert result.verified == expected["verified"]
    assert result.source == expected["source"]
    assert result.content_error == expected["contentError"]
