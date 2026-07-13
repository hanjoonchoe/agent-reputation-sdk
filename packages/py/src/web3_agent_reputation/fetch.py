"""Fetches and (where possible) verifies an agent's registration file, given its
`tokenUri`. STATELESS: no cache — every call re-fetches. Ported from
``packages/ts/src/fetcher/fetch.ts``.

Verification depends on the URI scheme:
- ``data:`` — content is inline in the on-chain tokenUri itself, decoded directly, no
  network round trip. ``verified: True`` (nothing external to check against).
- ``ipfs://`` — fetched via a public gateway list (first success wins), then the fetched
  bytes are hashed and compared against the CID's embedded multihash digest.
  ``verified: True | False``.
- ``https://`` — fetched directly. There is no on-chain hash commitment for ``https://``
  registration files in the audited v1 contracts, so this is never verifiable one way or
  the other. ``verified: None``.
"""

from __future__ import annotations

import base64
import json
import re
import urllib.error
import urllib.request
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol
from urllib.parse import unquote

from web3 import Web3

from .cid import verify_cid
from .errors import FileUnreachableError
from .gateways import DEFAULT_GATEWAYS, gateway_url, parse_ipfs_uri

RegistrationFileSource = Literal["data", "ipfs", "https"]

MAX_BYTES = 2 * 1024 * 1024  # 2 MiB
TIMEOUT_S = 10.0

_DATA_URI_RE = re.compile(r"^data:([^,]*),([\s\S]*)$")
_BASE64_META_RE = re.compile(r";base64$", re.IGNORECASE)


class FetchResponse(Protocol):
    """Minimal response shape a `fetch_impl` must return -- matches
    `http.client.HTTPResponse`/`urllib` response objects (`.status`, `.read(n)`)."""

    status: int

    def read(self, amt: int = ...) -> bytes: ...


FetchImpl = Callable[[str, float], FetchResponse]


@dataclass(frozen=True)
class RegistrationFile:
    verified: bool | None
    content: object
    content_error: Literal["not-json"] | None
    source: RegistrationFileSource
    hash: str


def _default_fetch(url: str, timeout: float) -> FetchResponse:
    request = urllib.request.Request(url, headers={"User-Agent": "web3-agent-reputation"})
    return urllib.request.urlopen(request, timeout=timeout)  # noqa: S310


def _parse_json_content(raw: bytes) -> tuple[object, Literal["not-json"] | None]:
    try:
        text = raw.decode("utf-8")
        return json.loads(text), None
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None, "not-json"


def _parse_data_uri(uri: str) -> bytes:
    # data:[<mediatype>][;base64],<data>
    match = _DATA_URI_RE.match(uri)
    if not match:
        raise FileUnreachableError("malformed data: URI")
    meta = match.group(1) or ""
    payload = match.group(2) or ""
    is_base64 = bool(_BASE64_META_RE.search(meta))
    try:
        if is_base64:
            return base64.b64decode(payload)
        return unquote(payload).encode("utf-8")
    except Exception as cause:
        raise FileUnreachableError("failed to decode data: URI") from cause


def _fetch_bytes(url: str, fetch_impl: FetchImpl) -> bytes:
    """Fetches raw bytes from a single URL with a 10s timeout and a 2 MiB size cap
    enforced while streaming (aborts as soon as the cap is exceeded, rather than
    buffering the whole response first)."""
    try:
        response = fetch_impl(url, TIMEOUT_S)
    except FileUnreachableError:
        raise
    except urllib.error.HTTPError as cause:
        raise FileUnreachableError(f"{url} responded with HTTP {cause.code}") from cause
    except Exception as cause:
        raise FileUnreachableError(f"{url}: {cause}") from cause

    status = getattr(response, "status", 200)
    if status and status >= 400:
        raise FileUnreachableError(f"{url} responded with HTTP {status}")

    chunks: list[bytes] = []
    total = 0
    try:
        while True:
            chunk = response.read(65536)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_BYTES:
                raise FileUnreachableError(f"{url} exceeded the 2 MiB size cap while streaming")
            chunks.append(chunk)
    except FileUnreachableError:
        raise
    except Exception as cause:
        raise FileUnreachableError(f"{url}: {cause}") from cause
    finally:
        close = getattr(response, "close", None)
        if callable(close):
            close()

    return b"".join(chunks)


def _handle_data(uri: str) -> RegistrationFile:
    raw = _parse_data_uri(uri)
    hash_hex = Web3.keccak(raw).hex()
    content, content_error = _parse_json_content(raw)
    # data: URIs carry their own content on-chain (inline in the tokenUri) -- there is
    # nothing external to verify against, so verification is trivially true.
    return RegistrationFile(
        verified=True, content=content, content_error=content_error, source="data", hash=hash_hex
    )


def _handle_ipfs(uri: str, fetch_impl: FetchImpl, gateways: Sequence[str]) -> RegistrationFile:
    parsed = parse_ipfs_uri(uri)
    if parsed is None:
        raise FileUnreachableError(f"malformed ipfs URI: {uri}")

    attempted: list[str] = []
    raw: bytes | None = None
    last_cause: Exception | None = None
    for gateway in gateways or DEFAULT_GATEWAYS:
        url = gateway_url(gateway, parsed)
        attempted.append(url)
        try:
            raw = _fetch_bytes(url, fetch_impl)
            break
        except Exception as cause:  # noqa: BLE001
            last_cause = cause

    if raw is None:
        raise FileUnreachableError(
            f"all IPFS gateways failed for {uri}; tried: {', '.join(attempted)}"
        ) from last_cause

    hash_hex = Web3.keccak(raw).hex()
    verified = verify_cid(parsed.cid, raw)
    content, content_error = _parse_json_content(raw)
    return RegistrationFile(
        verified=verified, content=content, content_error=content_error, source="ipfs", hash=hash_hex
    )


def _handle_https(uri: str, fetch_impl: FetchImpl) -> RegistrationFile:
    raw = _fetch_bytes(uri, fetch_impl)
    hash_hex = Web3.keccak(raw).hex()
    content, content_error = _parse_json_content(raw)
    # No on-chain hash commitment exists for https:// registration files in v1 -- always
    # unverifiable (None), never True/False.
    return RegistrationFile(
        verified=None, content=content, content_error=content_error, source="https", hash=hash_hex
    )


def fetch_registration_file(
    uri: str,
    *,
    fetch_impl: FetchImpl | None = None,
    gateways: Sequence[str] | None = None,
) -> RegistrationFile:
    resolved_fetch: FetchImpl = fetch_impl or _default_fetch
    if uri.startswith("data:"):
        return _handle_data(uri)
    if uri.startswith("ipfs://"):
        return _handle_ipfs(uri, resolved_fetch, gateways or DEFAULT_GATEWAYS)
    if uri.startswith("https://"):
        return _handle_https(uri, resolved_fetch)
    scheme = uri.split(":", 1)[0] if ":" in uri else uri
    raise FileUnreachableError(f"unsupported URI scheme: {scheme}")
