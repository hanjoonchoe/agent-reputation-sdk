import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as errors from "../../src/errors.js";
import { fetchRegistrationFile } from "../../src/fetcher/fetch.js";

type Case = {
  name: string;
  uri: string;
  contentBase64?: string;
  byteLength?: number;
  expected: {
    verified: boolean | null;
    source: string | null;
    contentError: string | null;
    errorName: string | null;
  };
};

const fixture = JSON.parse(
  readFileSync(new URL("../../../../conformance/verification-cases.json", import.meta.url), "utf8"),
) as { cases: Case[] };

/** Table-driven port of `conformance/verification-cases.json` through the injected-fetch seam. */
describe("conformance/verification-cases.json", () => {
  for (const testCase of fixture.cases) {
    it(testCase.name, async () => {
      let bytes: Uint8Array | undefined;
      if (testCase.contentBase64) {
        bytes = new Uint8Array(Buffer.from(testCase.contentBase64, "base64"));
      } else if (testCase.byteLength) {
        bytes = new Uint8Array(testCase.byteLength);
      }

      const fetchImpl = bytes
        ? ((async () => new Response(bytes, { status: 200 })) as unknown as typeof fetch)
        : undefined;

      if (testCase.expected.errorName) {
        const ErrorClass = (errors as unknown as Record<string, new (...args: never[]) => Error>)[
          `${testCase.expected.errorName}Error`
        ];
        expect(ErrorClass).toBeDefined();
        await expect(fetchRegistrationFile(testCase.uri, { fetchImpl })).rejects.toBeInstanceOf(
          ErrorClass,
        );
        return;
      }

      const result = await fetchRegistrationFile(testCase.uri, { fetchImpl });
      expect(result.verified).toBe(testCase.expected.verified);
      expect(result.source).toBe(testCase.expected.source);
      expect(result.contentError).toBe(testCase.expected.contentError);
    });
  }
});
