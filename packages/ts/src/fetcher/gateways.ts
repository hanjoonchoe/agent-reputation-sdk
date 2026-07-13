/**
 * Default public IPFS HTTP gateways, tried in order.
 *
 * Adapted from `web3-agents-mcp` commit `243257ffddcbf82b16a73b22d061910281f4be4c`
 * (`src/fetcher/gateways.ts`) — trimmed of its env-var override (this package is
 * stateless and has no notion of a process-wide config; callers who want a different
 * gateway list pass one via `getRegistrationFile`'s options in the future, or inject a
 * `fetchImpl` that redirects the URL).
 */
export const DEFAULT_GATEWAYS: readonly string[] = [
  "https://ipfs.io",
  "https://cloudflare-ipfs.com",
  "https://gateway.pinata.cloud",
];

export type ParsedIpfsUri = { cid: string; path: string };

/** Parses `ipfs://<cid>[/path...]`. The CID is the first path segment. */
export function parseIpfsUri(uri: string): ParsedIpfsUri | null {
  const match = /^ipfs:\/\/([^/]+)(\/.*)?$/.exec(uri);
  if (!match) {
    return null;
  }
  const cid = match[1];
  if (!cid) {
    return null;
  }
  return { cid, path: match[2] ?? "" };
}

export function gatewayUrl(gateway: string, parsed: ParsedIpfsUri): string {
  const base = gateway.replace(/\/+$/, "");
  return `${base}/ipfs/${parsed.cid}${parsed.path}`;
}
