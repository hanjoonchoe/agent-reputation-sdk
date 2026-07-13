import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Abi } from "viem";

// Loaded via readFileSync (not a JSON module import) so the compiled dist/ output
// doesn't depend on Node's ESM JSON import-attribute support. `pnpm build` copies this
// directory into dist/ alongside the compiled JS (see package.json's build script) —
// same pattern mined from web3-agents-mcp's src/registry/*.ts.
export function loadAbi(name: "identity" | "reputation" | "validation"): Abi {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(path.join(here, "abi", `${name}.json`), "utf8");
  return JSON.parse(raw) as Abi;
}
