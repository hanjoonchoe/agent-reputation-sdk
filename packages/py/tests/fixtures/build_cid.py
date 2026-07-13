"""Builds a CIDv1 (raw codec 0x55, sha2-256 multihash) string for the given bytes, for
tests. Ported from ``packages/ts/test/fixtures/buildCid.ts``."""

from __future__ import annotations

import hashlib

_BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"


def _encode_varint(n: int) -> bytes:
    out = bytearray()
    value = n
    while True:
        if value < 0x80:
            out.append(value)
            break
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    return bytes(out)


def _base32_encode(data: bytes) -> str:
    bits = 0
    value = 0
    out = []
    for byte in data:
        value = (value << 8) | byte
        bits += 8
        while bits >= 5:
            out.append(_BASE32_ALPHABET[(value >> (bits - 5)) & 0x1F])
            bits -= 5
    if bits > 0:
        out.append(_BASE32_ALPHABET[(value << (5 - bits)) & 0x1F])
    return "".join(out)


def build_cid_v1_raw(data: bytes) -> str:
    digest = hashlib.sha256(data).digest()
    body = (
        _encode_varint(1)  # CID version 1
        + _encode_varint(0x55)  # raw codec
        + _encode_varint(0x12)  # sha2-256
        + _encode_varint(len(digest))
        + digest
    )
    return f"b{_base32_encode(body)}"
