import { createHash } from "node:crypto";

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function encodeVarint(n: number): number[] {
  const out: number[] = [];
  let value = n;
  for (;;) {
    if (value < 0x80) {
      out.push(value);
      break;
    }
    out.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  return out;
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

/** Builds a CIDv1 (raw codec 0x55, sha2-256 multihash) string for the given bytes, for tests. */
export function buildCidV1Raw(bytes: Uint8Array): string {
  const digest = createHash("sha256").update(bytes).digest();
  const body = [
    ...encodeVarint(1), // CID version 1
    ...encodeVarint(0x55), // raw codec
    ...encodeVarint(0x12), // sha2-256
    ...encodeVarint(digest.length),
    ...digest,
  ];
  return `b${base32Encode(new Uint8Array(body))}`;
}
