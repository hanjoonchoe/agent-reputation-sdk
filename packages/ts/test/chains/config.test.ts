import { describe, expect, it } from "vitest";
import { getChainConfig, supportedChainIds } from "../../src/chains/config.js";

describe("chains/config", () => {
  it("exposes exactly the 7 documented chains", () => {
    const ids = supportedChainIds().sort((a, b) => a - b);
    expect(ids).toEqual([1, 10, 56, 100, 137, 8453, 42161]);
  });

  it("returns the same CREATE2 registry addresses on every chain", () => {
    const addresses = new Set(
      supportedChainIds().map((id) => JSON.stringify(getChainConfig(id)?.registries)),
    );
    expect(addresses.size).toBe(1);
  });

  it("returns undefined for an unconfigured chainId", () => {
    expect(getChainConfig(999_999)).toBeUndefined();
  });
});
