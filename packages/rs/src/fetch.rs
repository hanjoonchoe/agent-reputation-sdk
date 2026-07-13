//! Fetches and (where possible) verifies an agent's registration file, given its
//! `tokenUri`. STATELESS: no cache — every call re-fetches and re-verifies from
//! scratch. Ported from `packages/ts/src/fetcher/fetch.ts` /
//! `packages/py/src/web3_agent_reputation/fetch.py`.
//!
//! Verification depends on the URI scheme:
//! - `data:` — content is inline in the on-chain `tokenUri` itself, decoded directly,
//!   no network round trip. `verified: Some(true)` (nothing external to check against).
//! - `ipfs://` — fetched via a public gateway list (first success wins), then the
//!   fetched bytes are hashed and compared against the CID's embedded multihash
//!   digest. `verified: Some(true) | Some(false)`.
//! - `https://` — fetched directly. There is no on-chain hash commitment for `https://`
//!   registration files in the audited v1 contracts, so this is never verifiable one
//!   way or the other. `verified: None`.

use std::time::Duration;

use crate::cid::verify_cid;
use crate::errors::Erc8004Error;

pub const MAX_BYTES: usize = 2 * 1024 * 1024; // 2 MiB
pub const TIMEOUT: Duration = Duration::from_secs(10);

/// Default public IPFS HTTP gateways, tried in order. Ported from
/// `packages/ts/src/fetcher/gateways.ts`.
pub const DEFAULT_GATEWAYS: &[&str] = &[
    "https://ipfs.io",
    "https://cloudflare-ipfs.com",
    "https://gateway.pinata.cloud",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegistrationFileSource {
    Data,
    Ipfs,
    Https,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ContentError {
    NotJson,
}

#[derive(Debug, Clone)]
pub struct RegistrationFile {
    pub verified: Option<bool>,
    pub content: Option<serde_json::Value>,
    pub content_error: Option<ContentError>,
    pub source: RegistrationFileSource,
    /// keccak256 hash of the raw fetched bytes, hex-encoded with `0x` prefix (matches
    /// the TS/py facts layer's `hash` field).
    pub hash: String,
}

fn keccak256_hex(bytes: &[u8]) -> String {
    use alloy::primitives::keccak256;
    format!("0x{}", hex::encode(keccak256(bytes)))
}

fn parse_json_content(raw: &[u8]) -> (Option<serde_json::Value>, Option<ContentError>) {
    match std::str::from_utf8(raw)
        .ok()
        .and_then(|s| serde_json::from_str(s).ok())
    {
        Some(value) => (Some(value), None),
        None => (None, Some(ContentError::NotJson)),
    }
}

/// Parses `data:[<mediatype>][;base64],<data>`.
fn parse_data_uri(uri: &str) -> Result<Vec<u8>, Erc8004Error> {
    let rest = uri
        .strip_prefix("data:")
        .ok_or_else(|| Erc8004Error::file_unreachable("malformed data: URI"))?;
    let comma = rest
        .find(',')
        .ok_or_else(|| Erc8004Error::file_unreachable("malformed data: URI"))?;
    let meta = &rest[..comma];
    let payload = &rest[comma + 1..];
    let is_base64 = meta.to_ascii_lowercase().ends_with(";base64");
    if is_base64 {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD
            .decode(payload)
            .map_err(|e| Erc8004Error::file_unreachable(format!("failed to decode data: URI: {e}")))
    } else {
        percent_decode(payload)
    }
}

fn percent_decode(input: &str) -> Result<Vec<u8>, Erc8004Error> {
    let mut out = Vec::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex_str = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(h) = hex_str {
                if let Ok(byte) = u8::from_str_radix(h, 16) {
                    out.push(byte);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    Ok(out)
}

fn handle_data(uri: &str) -> Result<RegistrationFile, Erc8004Error> {
    let raw = parse_data_uri(uri)?;
    let hash = keccak256_hex(&raw);
    let (content, content_error) = parse_json_content(&raw);
    Ok(RegistrationFile {
        content,
        verified: Some(true),
        source: RegistrationFileSource::Data,
        hash,
        content_error,
    })
}

/// Fetches raw bytes from a single URL with a 10s timeout and a 2 MiB size cap.
async fn fetch_bytes(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, Erc8004Error> {
    let response = client
        .get(url)
        .timeout(TIMEOUT)
        .send()
        .await
        .map_err(|e| Erc8004Error::file_unreachable(format!("{url}: {e}")))?;

    if !response.status().is_success() {
        return Err(Erc8004Error::file_unreachable(format!(
            "{url} responded with HTTP {}",
            response.status()
        )));
    }

    if let Some(len) = response.content_length() {
        if len as usize > MAX_BYTES {
            return Err(Erc8004Error::file_unreachable(format!(
                "{url} exceeded the 2 MiB size cap"
            )));
        }
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| Erc8004Error::file_unreachable(format!("{url}: {e}")))?;
    if bytes.len() > MAX_BYTES {
        return Err(Erc8004Error::file_unreachable(format!(
            "{url} exceeded the 2 MiB size cap"
        )));
    }
    Ok(bytes.to_vec())
}

fn parse_ipfs_uri(uri: &str) -> Option<(String, String)> {
    let rest = uri.strip_prefix("ipfs://")?;
    let (cid, path) = match rest.find('/') {
        Some(idx) => (&rest[..idx], &rest[idx..]),
        None => (rest, ""),
    };
    if cid.is_empty() {
        return None;
    }
    Some((cid.to_string(), path.to_string()))
}

fn gateway_url(gateway: &str, cid: &str, path: &str) -> String {
    format!("{}/ipfs/{cid}{path}", gateway.trim_end_matches('/'))
}

async fn handle_ipfs(
    client: &reqwest::Client,
    uri: &str,
    gateways: &[&str],
) -> Result<RegistrationFile, Erc8004Error> {
    let (cid, path) = parse_ipfs_uri(uri)
        .ok_or_else(|| Erc8004Error::file_unreachable(format!("malformed ipfs URI: {uri}")))?;

    let mut attempted = Vec::new();
    let mut raw: Option<Vec<u8>> = None;
    for gateway in gateways {
        let url = gateway_url(gateway, &cid, &path);
        attempted.push(url.clone());
        match fetch_bytes(client, &url).await {
            Ok(bytes) => {
                raw = Some(bytes);
                break;
            }
            Err(_) => continue,
        }
    }
    let raw = raw.ok_or_else(|| {
        Erc8004Error::file_unreachable(format!(
            "all IPFS gateways failed for {uri}; tried: {}",
            attempted.join(", ")
        ))
    })?;

    let hash = keccak256_hex(&raw);
    let verified = verify_cid(&cid, &raw);
    let (content, content_error) = parse_json_content(&raw);
    Ok(RegistrationFile {
        content,
        verified,
        source: RegistrationFileSource::Ipfs,
        hash,
        content_error,
    })
}

async fn handle_https(
    client: &reqwest::Client,
    uri: &str,
) -> Result<RegistrationFile, Erc8004Error> {
    let raw = fetch_bytes(client, uri).await?;
    let hash = keccak256_hex(&raw);
    let (content, content_error) = parse_json_content(&raw);
    // No on-chain hash commitment exists for https:// registration files in v1 —
    // always unverifiable (None), never true/false.
    Ok(RegistrationFile {
        content,
        verified: None,
        source: RegistrationFileSource::Https,
        hash,
        content_error,
    })
}

pub async fn fetch_registration_file(uri: &str) -> Result<RegistrationFile, Erc8004Error> {
    fetch_registration_file_with(uri, &reqwest::Client::new(), DEFAULT_GATEWAYS).await
}

pub async fn fetch_registration_file_with(
    uri: &str,
    client: &reqwest::Client,
    gateways: &[&str],
) -> Result<RegistrationFile, Erc8004Error> {
    if uri.starts_with("data:") {
        return handle_data(uri);
    }
    if uri.starts_with("ipfs://") {
        return handle_ipfs(client, uri, gateways).await;
    }
    if uri.starts_with("https://") {
        return handle_https(client, uri).await;
    }
    let scheme = uri.split(':').next().unwrap_or(uri);
    Err(Erc8004Error::file_unreachable(format!(
        "unsupported URI scheme: {scheme}"
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_uri_plain_json() {
        let uri = "data:application/json,%7B%22a%22%3A1%7D"; // {"a":1}
        let rf = handle_data(uri).unwrap();
        assert_eq!(rf.verified, Some(true));
        assert!(rf.content.is_some());
    }

    #[test]
    fn data_uri_base64_json() {
        use base64::Engine;
        let payload = base64::engine::general_purpose::STANDARD.encode(b"{\"a\":1}");
        let uri = format!("data:application/json;base64,{payload}");
        let rf = handle_data(&uri).unwrap();
        assert_eq!(rf.verified, Some(true));
        assert!(rf.content.is_some());
    }

    #[test]
    fn parses_ipfs_uri() {
        let (cid, path) = parse_ipfs_uri("ipfs://QmABC/sub/path.json").unwrap();
        assert_eq!(cid, "QmABC");
        assert_eq!(path, "/sub/path.json");
    }
}
