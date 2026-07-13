import { describe, expect, it, vi } from "vitest";
import { fetchRegistrationFile } from "../../src/fetcher/fetch.js";
import { FileUnreachableError } from "../../src/errors.js";
import { buildCidV1Raw } from "../fixtures/buildCid.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}

function bytesResponse(bytes: Uint8Array, init?: ResponseInit): Response {
  return new Response(bytes, { status: 200, ...init });
}

describe("fetchRegistrationFile", () => {
  it("data: URI decodes inline, verified true, no network call", async () => {
    const payload = { name: "agent-0" };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
    const fetchImpl = vi.fn();
    const result = await fetchRegistrationFile(`data:application/json;base64,${encoded}`, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.verified).toBe(true);
    expect(result.source).toBe("data");
    expect(result.content).toEqual(payload);
    expect(result.contentError).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("data: URI with non-JSON content sets contentError: not-json", async () => {
    const encoded = Buffer.from("not json", "utf8").toString("base64");
    const result = await fetchRegistrationFile(`data:text/plain;base64,${encoded}`, {});
    expect(result.verified).toBe(true);
    expect(result.contentError).toBe("not-json");
    expect(result.content).toBeNull();
  });

  it("ipfs:// with a matching CID verifies true", async () => {
    const payload = { name: "agent-1" };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const cid = buildCidV1Raw(bytes);
    const fetchImpl = vi.fn(async () => bytesResponse(bytes));

    const result = await fetchRegistrationFile(`ipfs://${cid}`, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.verified).toBe(true);
    expect(result.source).toBe("ipfs");
    expect(result.content).toEqual(payload);
  });

  it("ipfs:// with a mismatching CID verifies false", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ name: "agent-1" }));
    const cid = buildCidV1Raw(new TextEncoder().encode("something else entirely"));
    const fetchImpl = vi.fn(async () => bytesResponse(bytes));

    const result = await fetchRegistrationFile(`ipfs://${cid}`, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.verified).toBe(false);
  });

  it("ipfs:// falls through the gateway list on failure and succeeds on a later gateway", async () => {
    const payload = { name: "agent-2" };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const cid = buildCidV1Raw(bytes);
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(null, { status: 502 });
      }
      return bytesResponse(bytes);
    });

    const result = await fetchRegistrationFile(`ipfs://${cid}`, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      gateways: ["https://gw1.example", "https://gw2.example"],
    });
    expect(result.verified).toBe(true);
    expect(calls).toBe(2);
  });

  it("https:// is always verified: null (no on-chain hash commitment in v1)", async () => {
    const payload = { name: "agent-3" };
    const fetchImpl = vi.fn(async () => jsonResponse(payload));
    const result = await fetchRegistrationFile("https://example.com/agent.json", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.verified).toBeNull();
    expect(result.source).toBe("https");
    expect(result.content).toEqual(payload);
  });

  it("throws FileUnreachableError when the response exceeds the 2 MiB cap", async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    const fetchImpl = vi.fn(async () => bytesResponse(big));
    await expect(
      fetchRegistrationFile("https://example.com/big.json", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(FileUnreachableError);
  });

  it("throws FileUnreachableError when the fetch aborts (simulated timeout/AbortError)", async () => {
    // Simulates what happens once the internal 10s AbortController fires: fetchImpl
    // rejects with an AbortError. Asserted directly (rather than waiting out the real
    // 10s timeout) so this test stays fast.
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    });
    const promise = fetchRegistrationFile("https://example.com/slow.json", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(promise).rejects.toBeInstanceOf(FileUnreachableError);
  });

  it("throws FileUnreachableError for an unsupported URI scheme", async () => {
    await expect(fetchRegistrationFile("ftp://example.com/file", {})).rejects.toBeInstanceOf(
      FileUnreachableError,
    );
  });
});
