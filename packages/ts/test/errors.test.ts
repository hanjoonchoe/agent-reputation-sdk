import { describe, expect, it } from "vitest";
import {
  AgentNotFoundError,
  ChainUnsupportedError,
  Erc8004Error,
  RpcError,
  sanitizeMessage,
} from "../src/errors.js";

describe("errors", () => {
  it("sanitizeMessage keeps only the first line, capped at 300 chars", () => {
    const long = "a".repeat(400);
    expect(sanitizeMessage(new Error(`${long}\nsecond line`))).toBe(`${"a".repeat(300)}…`);
  });

  it("sanitizeMessage passes short single-line messages through unchanged", () => {
    expect(sanitizeMessage(new Error("short message"))).toBe("short message");
  });

  it("every typed error is an instance of the Erc8004Error base class", () => {
    expect(new AgentNotFoundError(1n)).toBeInstanceOf(Erc8004Error);
    expect(new ChainUnsupportedError(1)).toBeInstanceOf(Erc8004Error);
    expect(new RpcError(new Error("boom"))).toBeInstanceOf(Erc8004Error);
  });

  it("RpcError sanitizes the cause's message and preserves the original as .cause", () => {
    const cause = new Error("underlying rpc failure\nwith extra detail");
    const error = new RpcError(cause);
    expect(error.message).toBe("underlying rpc failure");
    expect(error.cause).toBe(cause);
  });

  it("ChainUnsupportedError distinguishes missing vs. unsupported chain", () => {
    expect(new ChainUnsupportedError(undefined).message).toMatch(/no chain configured/);
    expect(new ChainUnsupportedError(1234).message).toMatch(/1234/);
  });
});
