import { describe, expect, it } from "vitest";
import { verifyCid } from "../../src/fetcher/cid.js";
import { buildCidV1Raw } from "../fixtures/buildCid.js";

describe("verifyCid", () => {
  it("returns true when the CIDv1 (base32, raw codec) matches the bytes' sha2-256 digest", async () => {
    const bytes = new TextEncoder().encode("hello erc-8004");
    const cid = buildCidV1Raw(bytes);
    await expect(verifyCid(cid, bytes)).resolves.toBe(true);
  });

  it("returns false when the bytes don't match the CID's digest", async () => {
    const bytes = new TextEncoder().encode("hello erc-8004");
    const cid = buildCidV1Raw(bytes);
    const tampered = new TextEncoder().encode("hello erc-8005");
    await expect(verifyCid(cid, tampered)).resolves.toBe(false);
  });

  it("returns null for an unparseable CID string", async () => {
    await expect(verifyCid("not-a-cid", new Uint8Array())).resolves.toBeNull();
  });

  it("returns null for an unsupported multibase prefix", async () => {
    await expect(verifyCid("xUnsupportedPrefix", new Uint8Array())).resolves.toBeNull();
  });
});
