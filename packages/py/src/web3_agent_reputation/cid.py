"""Verifies fetched bytes against an IPFS CID.

Hand-rolled port of ``packages/ts/src/fetcher/cid.ts`` (itself a hand-rolled
multibase/multihash decoder, since that TS module forbids any runtime dependency beyond
`viem`). This Python port re-implements the same minimal slice (base58btc + base32
multibase, sha2-256 multihash) using only ``hashlib`` for hashing — no third-party CID
library — so the two implementations can be read side by side.

Coverage (same "disproportionate effort" carve-out documented in the TS source):
- CIDv0 (``Qm...``, always base58btc + dag-pb + sha2-256) and CIDv1 in base32 (``b...``)
  or base58btc (``z...``) multibase, with a sha2-256 multihash, are checked by hashing
  the raw fetched bytes and comparing against the multihash digest. This is exact for
  CIDv1 raw-codec content; for dag-pb-codec content it is only exact for single-block
  UnixFS files whose node bytes equal the raw content bytes.
- Any other multibase prefix, or a non-sha2-256 multihash, is treated as unverifiable
  (``None``) rather than guessed at.
- A CID string that fails to decode is likewise treated as unverifiable.
"""

from __future__ import annotations

import hashlib
import re

_BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"
_SHA2_256_CODE = 0x12
_CIDV0_RE = re.compile(r"^Qm[1-9A-HJ-NP-Za-km-z]{44}$")


def _base58_decode(text: str) -> bytes:
    out = [0]
    for char in text:
        value = _BASE58_ALPHABET.find(char)
        if value < 0:
            raise ValueError(f"invalid base58 character: {char}")
        carry = value
        for j in range(len(out)):
            carry += out[j] * 58
            out[j] = carry & 0xFF
            carry >>= 8
        while carry > 0:
            out.append(carry & 0xFF)
            carry >>= 8

    leading_zeros = 0
    for char in text:
        if char != "1":
            break
        leading_zeros += 1

    body = bytes(reversed(out))
    return b"\x00" * leading_zeros + body


def _base32_decode(text: str) -> bytes:
    bits = 0
    value = 0
    out = bytearray()
    for char in text:
        idx = _BASE32_ALPHABET.find(char)
        if idx < 0:
            raise ValueError(f"invalid base32 character: {char}")
        value = (value << 5) | idx
        bits += 5
        if bits >= 8:
            out.append((value >> (bits - 8)) & 0xFF)
            bits -= 8
    return bytes(out)


def _read_varint(buf: bytes, offset: int) -> tuple[int, int]:
    """Reads an unsigned LEB128 varint at `offset`. Returns (value, bytes_consumed)."""
    result = 0
    shift = 0
    pos = offset
    while True:
        if pos >= len(buf):
            raise ValueError("truncated varint")
        byte = buf[pos]
        result |= (byte & 0x7F) << shift
        pos += 1
        if (byte & 0x80) == 0:
            break
        shift += 7
    return result, pos - offset


def _decode_multihash(cid_str: str) -> bytes | None:
    """Extracts the raw multihash bytes (code + length + digest) from a CID string."""
    if _CIDV0_RE.match(cid_str):
        # CIDv0: bare base58btc-encoded multihash, no version/codec prefix.
        return _base58_decode(cid_str)

    if cid_str.startswith("b"):
        raw = _base32_decode(cid_str[1:])
    elif cid_str.startswith("z"):
        raw = _base58_decode(cid_str[1:])
    else:
        return None  # unsupported multibase prefix

    # CIDv1: <version varint><codec varint><multihash>
    _, version_len = _read_varint(raw, 0)
    _, codec_len = _read_varint(raw, version_len)
    return raw[version_len + codec_len :]


def verify_cid(cid_str: str, data: bytes) -> bool | None:
    try:
        multihash = _decode_multihash(cid_str)
    except ValueError:
        return None
    if multihash is None:
        return None

    try:
        code, code_len = _read_varint(multihash, 0)
        length, length_len = _read_varint(multihash, code_len)
    except ValueError:
        return None
    if code != _SHA2_256_CODE:
        return None

    digest_offset = code_len + length_len
    expected = multihash[digest_offset : digest_offset + length]
    actual = hashlib.sha256(data).digest()
    return actual == expected
