//! Table-driven port of `../../conformance/verification-cases.json` through
//! `fetch_registration_file_with`'s injectable `ByteFetcher` seam. Mirrors
//! `packages/ts/test/conformance/verification.test.ts` /
//! `packages/py/tests/conformance/test_verification.py`.
//!
//! `MockFetcher` stands in for a real network fetch: it serves the fixture's
//! `contentBase64` bytes verbatim, or -- for the oversize case -- enforces the same
//! 2 MiB cap `fetch::fetch_bytes` enforces mid-stream against a real response (see
//! `fetch_bytes_true_streaming_cap` in `tests/fetch_stream_cap.rs` for a test against
//! an actual streamed HTTP response), since this seam replaces the whole
//! byte-fetching step rather than just the transport.

use alloy_agent_reputation::fetch::{
    fetch_registration_file_with, BoxFuture, ByteFetcher, MAX_BYTES,
};
use alloy_agent_reputation::Erc8004Error;
use base64::Engine;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct CasesFixture {
    cases: Vec<Case>,
}

#[derive(Debug, Deserialize)]
struct Case {
    name: String,
    uri: String,
    #[serde(rename = "contentBase64")]
    content_base64: Option<String>,
    #[serde(rename = "byteLength")]
    byte_length: Option<usize>,
    expected: Expected,
}

#[derive(Debug, Deserialize)]
struct Expected {
    verified: Option<bool>,
    source: Option<String>,
    #[serde(rename = "contentError")]
    content_error: Option<String>,
    #[serde(rename = "errorName")]
    error_name: Option<String>,
}

struct MockFetcher {
    bytes: Vec<u8>,
}

impl ByteFetcher for MockFetcher {
    fn fetch(&self, _url: &str) -> BoxFuture<'_, Result<Vec<u8>, Erc8004Error>> {
        let bytes = self.bytes.clone();
        Box::pin(async move {
            if bytes.len() > MAX_BYTES {
                return Err(Erc8004Error::file_unreachable(
                    "mock exceeded the 2 MiB size cap while streaming",
                ));
            }
            Ok(bytes)
        })
    }
}

fn load_fixture() -> CasesFixture {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../conformance/verification-cases.json"
    );
    let raw = std::fs::read_to_string(path).expect("read conformance/verification-cases.json");
    serde_json::from_str(&raw).expect("parse conformance/verification-cases.json")
}

#[tokio::test]
async fn verification_cases_conform() {
    let fixture = load_fixture();
    assert_eq!(
        fixture.cases.len(),
        7,
        "expected 7 verification-cases.json rows"
    );

    for case in &fixture.cases {
        let bytes = if let Some(b64) = &case.content_base64 {
            base64::engine::general_purpose::STANDARD
                .decode(b64)
                .unwrap()
        } else if let Some(len) = case.byte_length {
            vec![0u8; len]
        } else {
            Vec::new()
        };
        let fetcher = MockFetcher { bytes };

        // A single dummy gateway: MockFetcher ignores the URL entirely and serves
        // `bytes` regardless, so the gateway list only needs to be non-empty for the
        // ipfs:// cases to reach `fetcher.fetch` at all.
        let result =
            fetch_registration_file_with(&case.uri, &fetcher, &["https://dummy.invalid"]).await;

        if let Some(error_name) = &case.expected.error_name {
            let err = result.expect_err(&format!("case {}: expected an error", case.name));
            let actual_name = match err {
                Erc8004Error::AgentNotFound { .. } => "AgentNotFound",
                Erc8004Error::ChainUnsupported { .. } => "ChainUnsupported",
                Erc8004Error::Rpc(_) => "Rpc",
                Erc8004Error::FileUnreachable(_) => "FileUnreachable",
                Erc8004Error::FileHashMismatch(_) => "FileHashMismatch",
                Erc8004Error::InvalidInput(_) => "InvalidInput",
            };
            assert_eq!(
                actual_name, error_name,
                "case {}: error name mismatch",
                case.name
            );
            continue;
        }

        let file = result.unwrap_or_else(|e| panic!("case {}: unexpected error: {e}", case.name));
        assert_eq!(
            file.verified, case.expected.verified,
            "case {}: verified",
            case.name
        );
        let source = match file.source {
            alloy_agent_reputation::fetch::RegistrationFileSource::Data => "data",
            alloy_agent_reputation::fetch::RegistrationFileSource::Ipfs => "ipfs",
            alloy_agent_reputation::fetch::RegistrationFileSource::Https => "https",
        };
        assert_eq!(
            Some(source.to_string()),
            case.expected.source,
            "case {}: source",
            case.name
        );
        let content_error = file.content_error.map(|_| "not-json".to_string());
        assert_eq!(
            content_error, case.expected.content_error,
            "case {}: contentError",
            case.name
        );
    }
}
