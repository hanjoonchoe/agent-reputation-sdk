import { createHash } from "node:crypto";

/**
 * Verifies fetched bytes against an IPFS CID.
 *
 * Adapted from `web3-agents-mcp` commit `243257ffddcbf82b16a73b22d061910281f4be4c`
 * (`src/fetcher/cid.ts`), which used the `multiformats` package. R-1 forbids any runtime
 * dependency beyond the `viem` peer, so this module re-implements the minimal slice of
 * multibase/multihash decoding needed for CID verification (base58btc + base32
 * multibase, sha2-256 multihash) by hand, using only `node:crypto` for hashing.
 *
 * Coverage (same "disproportionate effort" carve-out documented in the source project):
 * - CIDv0 (`Qm...`, always base58btc + dag-pb + sha2-256) and CIDv1 in base32 (`b...`)
 *   or base58btc (`z...`) multibase, with a sha2-256 multihash, are checked by hashing
 *   the raw fetched bytes and comparing against the multihash digest. This is exact for
 *   CIDv1 raw-codec content; for dag-pb-codec content it is only exact for single-block
 *   UnixFS files whose node bytes equal the raw content bytes (see source project notes
 *   — full UnixFS/dag-pb decoding is out of scope here too).
 * - Any other multibase prefix, or a non-sha2-256 multihash, is treated as unverifiable
 *   (`null`) rather than guessed at.
 * - A CID string that fails to decode is likewise treated as unverifiable.
 */

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const SHA2_256_CODE = 0x12;

function base58Decode(input: string): Uint8Array {
  const bytes: number[] = [0];
  for (const char of input) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value < 0) {
      throw new Error(`invalid base58 character: ${char}`);
    }
    let carry = value;
    for (let j = 0; j < bytes.length; j += 1) {
      carry += (bytes[j] ?? 0) * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeros = 0;
  for (const char of input) {
    if (char !== "1") {
      break;
    }
    leadingZeros += 1;
  }
  const out = new Uint8Array(leadingZeros + bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    out[leadingZeros + i] = bytes[bytes.length - 1 - i] ?? 0;
  }
  return out;
}

function base32Decode(input: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx < 0) {
      throw new Error(`invalid base32 character: ${char}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Reads an unsigned LEB128 varint at `offset`. Returns `[value, bytesConsumed]`. */
function readVarint(buf: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let pos = offset;
  for (;;) {
    const byte = buf[pos];
    if (byte === undefined) {
      throw new Error("truncated varint");
    }
    result |= (byte & 0x7f) << shift;
    pos += 1;
    if ((byte & 0x80) === 0) {
      break;
    }
    shift += 7;
  }
  return [result >>> 0, pos - offset];
}

/** Extracts the raw multihash bytes (code + length + digest) from a CID string. */
function decodeMultihash(cidStr: string): Uint8Array | null {
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cidStr)) {
    // CIDv0: bare base58btc-encoded multihash, no version/codec prefix.
    return base58Decode(cidStr);
  }
  let raw: Uint8Array;
  if (cidStr.startsWith("b")) {
    raw = base32Decode(cidStr.slice(1));
  } else if (cidStr.startsWith("z")) {
    raw = base58Decode(cidStr.slice(1));
  } else {
    return null; // unsupported multibase prefix
  }
  // CIDv1: <version varint><codec varint><multihash>
  const [, versionLen] = readVarint(raw, 0);
  const [, codecLen] = readVarint(raw, versionLen);
  return raw.slice(versionLen + codecLen);
}

export async function verifyCid(cidStr: string, bytes: Uint8Array): Promise<boolean | null> {
  let multihash: Uint8Array | null;
  try {
    multihash = decodeMultihash(cidStr);
  } catch {
    return null;
  }
  if (!multihash) {
    return null;
  }

  let code: number;
  let codeLen: number;
  let length: number;
  let lengthLen: number;
  try {
    [code, codeLen] = readVarint(multihash, 0);
    [length, lengthLen] = readVarint(multihash, codeLen);
  } catch {
    return null;
  }
  if (code !== SHA2_256_CODE) {
    return null;
  }

  const digestOffset = codeLen + lengthLen;
  const expected = multihash.slice(digestOffset, digestOffset + length);
  const actual = new Uint8Array(createHash("sha256").update(bytes).digest());
  if (actual.length !== expected.length) {
    return false;
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i] !== expected[i]) {
      return false;
    }
  }
  return true;
}
