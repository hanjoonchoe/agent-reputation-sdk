import { keccak256 } from "viem";
import type { Hex } from "viem";
import { FileUnreachableError } from "../errors.js";
import { verifyCid } from "./cid.js";
import { DEFAULT_GATEWAYS, gatewayUrl, parseIpfsUri } from "./gateways.js";

/**
 * Fetches and (where possible) verifies an agent's registration file, given its
 * `tokenUri`. STATELESS: no cache, no sqlite — every call re-fetches. Adapted from
 * `web3-agents-mcp` commit `243257ffddcbf82b16a73b22d061910281f4be4c`
 * (`src/fetcher/fetch.ts`), stripped of its sqlite cache layer (out of scope per R-2:
 * "STATELESS: no sqlite/cache").
 */

export type RegistrationFileSource = "data" | "ipfs" | "https";

export type RegistrationFile = {
  verified: boolean | null;
  content: unknown;
  contentError: "not-json" | null;
  source: RegistrationFileSource;
  hash: Hex;
};

export type FetchRegistrationFileOptions = {
  /** Injectable fetch implementation, for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable IPFS gateway list, for tests. Defaults to a built-in public gateway list. */
  gateways?: readonly string[];
};

const MAX_BYTES = 2 * 1024 * 1024; // 2 MiB
const TIMEOUT_MS = 10_000;

function parseJsonContent(raw: Uint8Array): { content: unknown; contentError: "not-json" | null } {
  try {
    const text = Buffer.from(raw).toString("utf8");
    const content = JSON.parse(text) as unknown;
    return { content, contentError: null };
  } catch {
    return { content: null, contentError: "not-json" };
  }
}

function parseDataUri(uri: string): Uint8Array {
  // data:[<mediatype>][;base64],<data>
  const match = /^data:([^,]*),([\s\S]*)$/.exec(uri);
  if (!match) {
    throw new FileUnreachableError("malformed data: URI");
  }
  const meta = match[1] ?? "";
  const payload = match[2] ?? "";
  const isBase64 = /;base64$/i.test(meta);
  try {
    if (isBase64) {
      return new Uint8Array(Buffer.from(payload, "base64"));
    }
    return new Uint8Array(Buffer.from(decodeURIComponent(payload), "utf8"));
  } catch (cause) {
    throw new FileUnreachableError("failed to decode data: URI", { cause });
  }
}

/**
 * Fetches raw bytes from a single URL with a 10s timeout and a 2 MiB size cap enforced
 * while streaming (aborts as soon as the cap is exceeded, rather than buffering the
 * whole response first).
 */
async function fetchBytes(url: string, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      throw new FileUnreachableError(`${url} responded with HTTP ${response.status}`);
    }

    const body = response.body;
    if (!body) {
      const buf = new Uint8Array(await response.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) {
        throw new FileUnreachableError(`${url} exceeded the 2 MiB size cap`);
      }
      return buf;
    }

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          controller.abort();
          throw new FileUnreachableError(`${url} exceeded the 2 MiB size cap while streaming`);
        }
        chunks.push(value);
      }
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  } catch (cause) {
    if (cause instanceof FileUnreachableError) {
      throw cause;
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new FileUnreachableError(`${url}: ${message}`, { cause });
  } finally {
    clearTimeout(timer);
  }
}

function handleData(uri: string): RegistrationFile {
  const raw = parseDataUri(uri);
  const hash = keccak256(raw);
  const { content, contentError } = parseJsonContent(raw);
  // data: URIs carry their own content on-chain (inline in the tokenUri) — there is
  // nothing external to verify against, so verification is trivially true.
  return { content, verified: true, source: "data", hash, contentError };
}

async function handleIpfs(
  uri: string,
  opts: FetchRegistrationFileOptions,
): Promise<RegistrationFile> {
  const parsed = parseIpfsUri(uri);
  if (!parsed) {
    throw new FileUnreachableError(`malformed ipfs URI: ${uri}`);
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const gateways = opts.gateways && opts.gateways.length > 0 ? opts.gateways : DEFAULT_GATEWAYS;

  const attempted: string[] = [];
  let raw: Uint8Array | undefined;
  let lastCause: unknown;
  for (const gateway of gateways) {
    const url = gatewayUrl(gateway, parsed);
    attempted.push(url);
    try {
      raw = await fetchBytes(url, fetchImpl);
      break;
    } catch (cause) {
      lastCause = cause;
    }
  }
  if (!raw) {
    throw new FileUnreachableError(
      `all IPFS gateways failed for ${uri}; tried: ${attempted.join(", ")}`,
      { cause: lastCause },
    );
  }

  const hash = keccak256(raw);
  const verified = await verifyCid(parsed.cid, raw);
  const { content, contentError } = parseJsonContent(raw);
  return { content, verified, source: "ipfs", hash, contentError };
}

async function handleHttps(
  uri: string,
  opts: FetchRegistrationFileOptions,
): Promise<RegistrationFile> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const raw = await fetchBytes(uri, fetchImpl);
  const hash = keccak256(raw);
  const { content, contentError } = parseJsonContent(raw);
  // No on-chain hash commitment exists for https:// registration files in v1 — always
  // unverifiable (null), never true/false.
  return { content, verified: null, source: "https", hash, contentError };
}

export async function fetchRegistrationFile(
  uri: string,
  opts: FetchRegistrationFileOptions = {},
): Promise<RegistrationFile> {
  if (uri.startsWith("data:")) {
    return handleData(uri);
  }
  if (uri.startsWith("ipfs://")) {
    return handleIpfs(uri, opts);
  }
  if (uri.startsWith("https://")) {
    return handleHttps(uri, opts);
  }
  const scheme = uri.split(":")[0] ?? uri;
  throw new FileUnreachableError(`unsupported URI scheme: ${scheme}`);
}
