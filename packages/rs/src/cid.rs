//! Verifies fetched bytes against an IPFS CID.
//!
//! Ported from `packages/ts/src/fetcher/cid.ts` (itself adapted from `web3-agents-mcp`
//! commit `243257ffddcbf82b16a73b22d061910281f4be4c`, `src/fetcher/cid.ts`, which used
//! the `multiformats` package). R-1 keeps dependencies minimal, so — matching the TS/py
//! ports — this module re-implements the minimal slice of multibase/multihash decoding
//! needed for CID verification (base58btc + base32 multibase, sha2-256 multihash) by
//! hand, using only the `sha2` crate for hashing.
//!
//! Coverage (same "disproportionate effort" carve-out documented in the TS/py source):
//! - CIDv0 (`Qm...`, always base58btc + dag-pb + sha2-256) and CIDv1 in base32 (`b...`)
//!   or base58btc (`z...`) multibase, with a sha2-256 multihash, are checked by hashing
//!   the raw fetched bytes and comparing against the multihash digest. Exact for CIDv1
//!   raw-codec content; for dag-pb-codec content only exact for single-block UnixFS
//!   files whose node bytes equal the raw content bytes.
//! - Any other multibase prefix, or a non-sha2-256 multihash, is treated as
//!   unverifiable (`None`) rather than guessed at.
//! - A CID string that fails to decode is likewise treated as unverifiable.

use sha2::{Digest, Sha256};

const BASE58_ALPHABET: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE32_ALPHABET: &[u8] = b"abcdefghijklmnopqrstuvwxyz234567";
const SHA2_256_CODE: u64 = 0x12;

fn base58_decode(input: &str) -> Result<Vec<u8>, ()> {
    let mut bytes: Vec<u8> = vec![0];
    for ch in input.chars() {
        let value = BASE58_ALPHABET
            .iter()
            .position(|&c| c as char == ch)
            .ok_or(())?;
        let mut carry = value as u32;
        for b in bytes.iter_mut() {
            carry += (*b as u32) * 58;
            *b = (carry & 0xff) as u8;
            carry >>= 8;
        }
        while carry > 0 {
            bytes.push((carry & 0xff) as u8);
            carry >>= 8;
        }
    }
    let leading_zeros = input.chars().take_while(|&c| c == '1').count();
    let mut out = vec![0u8; leading_zeros + bytes.len()];
    for (i, &b) in bytes.iter().rev().enumerate() {
        out[leading_zeros + i] = b;
    }
    Ok(out)
}

fn base32_decode(input: &str) -> Result<Vec<u8>, ()> {
    let mut bits = 0u32;
    let mut value = 0u32;
    let mut out = Vec::new();
    for ch in input.chars() {
        let idx = BASE32_ALPHABET
            .iter()
            .position(|&c| c as char == ch)
            .ok_or(())? as u32;
        value = (value << 5) | idx;
        bits += 5;
        if bits >= 8 {
            out.push(((value >> (bits - 8)) & 0xff) as u8);
            bits -= 8;
        }
    }
    Ok(out)
}

/// Reads an unsigned LEB128 varint at `offset`. Returns `(value, bytes_consumed)`.
fn read_varint(buf: &[u8], offset: usize) -> Result<(u64, usize), ()> {
    let mut result: u64 = 0;
    let mut shift = 0u32;
    let mut pos = offset;
    loop {
        let byte = *buf.get(pos).ok_or(())?;
        result |= ((byte & 0x7f) as u64) << shift;
        pos += 1;
        if byte & 0x80 == 0 {
            break;
        }
        shift += 7;
    }
    Ok((result, pos - offset))
}

/// Extracts the raw multihash bytes (code + length + digest) from a CID string.
fn decode_multihash(cid_str: &str) -> Option<Vec<u8>> {
    let is_cid_v0 = cid_str.len() == 46
        && cid_str.starts_with("Qm")
        && cid_str
            .chars()
            .all(|c| BASE58_ALPHABET.contains(&(c as u8)));
    if is_cid_v0 {
        // CIDv0: bare base58btc-encoded multihash, no version/codec prefix.
        return base58_decode(cid_str).ok();
    }

    let raw = if let Some(rest) = cid_str.strip_prefix('b') {
        base32_decode(rest).ok()?
    } else {
        // unsupported multibase prefix if not 'z' either
        let rest = cid_str.strip_prefix('z')?;
        base58_decode(rest).ok()?
    };

    // CIDv1: <version varint><codec varint><multihash>
    let (_, version_len) = read_varint(&raw, 0).ok()?;
    let (_, codec_len) = read_varint(&raw, version_len).ok()?;
    Some(raw[version_len + codec_len..].to_vec())
}

/// Verifies `bytes` against `cid_str`. `Some(true)`/`Some(false)` if a sha2-256
/// multihash was decoded and compared; `None` if the CID is unverifiable by this
/// crate's coverage (see module doc comment).
pub fn verify_cid(cid_str: &str, bytes: &[u8]) -> Option<bool> {
    let multihash = decode_multihash(cid_str)?;

    let (code, code_len) = read_varint(&multihash, 0).ok()?;
    let (length, length_len) = read_varint(&multihash, code_len).ok()?;
    if code != SHA2_256_CODE {
        return None;
    }

    let digest_offset = code_len + length_len;
    let expected = multihash.get(digest_offset..digest_offset + length as usize)?;
    let actual = Sha256::digest(bytes);
    Some(actual[..] == expected[..])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cidv0_roundtrip() {
        let bytes = b"hello world";
        let digest = Sha256::digest(bytes);
        // multihash = 0x12 (sha2-256) 0x20 (32 bytes) + digest, base58btc-encoded.
        let mut multihash = vec![0x12u8, 0x20u8];
        multihash.extend_from_slice(&digest);
        let cid = base58_encode(&multihash);
        assert_eq!(verify_cid(&cid, bytes), Some(true));
        assert_eq!(verify_cid(&cid, b"tampered"), Some(false));
    }

    #[test]
    fn unsupported_prefix_is_unverifiable() {
        assert_eq!(verify_cid("Xsomething", b"data"), None);
    }

    // Test-only encoder (mirrors the decoder above) so cidv0_roundtrip doesn't depend
    // on an external fixture.
    fn base58_encode(input: &[u8]) -> String {
        let mut digits: Vec<u8> = vec![0];
        for &byte in input {
            let mut carry = byte as u32;
            for d in digits.iter_mut() {
                carry += (*d as u32) << 8;
                *d = (carry % 58) as u8;
                carry /= 58;
            }
            while carry > 0 {
                digits.push((carry % 58) as u8);
                carry /= 58;
            }
        }
        let leading_zeros = input.iter().take_while(|&&b| b == 0).count();
        let mut out = String::new();
        for _ in 0..leading_zeros {
            out.push('1');
        }
        for &d in digits.iter().rev() {
            out.push(BASE58_ALPHABET[d as usize] as char);
        }
        out
    }
}
