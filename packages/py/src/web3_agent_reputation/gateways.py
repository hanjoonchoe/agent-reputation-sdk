"""Default public IPFS HTTP gateways, tried in order.

Ported from ``packages/ts/src/fetcher/gateways.ts``.
"""

from __future__ import annotations

import re

DEFAULT_GATEWAYS: tuple[str, ...] = (
    "https://ipfs.io",
    "https://cloudflare-ipfs.com",
    "https://gateway.pinata.cloud",
)

_IPFS_URI_RE = re.compile(r"^ipfs://([^/]+)(/.*)?$")


class ParsedIpfsUri:
    __slots__ = ("cid", "path")

    def __init__(self, cid: str, path: str):
        self.cid = cid
        self.path = path


def parse_ipfs_uri(uri: str) -> ParsedIpfsUri | None:
    """Parses `ipfs://<cid>[/path...]`. The CID is the first path segment."""
    match = _IPFS_URI_RE.match(uri)
    if not match:
        return None
    cid = match.group(1)
    if not cid:
        return None
    return ParsedIpfsUri(cid, match.group(2) or "")


def gateway_url(gateway: str, parsed: ParsedIpfsUri) -> str:
    base = gateway.rstrip("/")
    return f"{base}/ipfs/{parsed.cid}{parsed.path}"
