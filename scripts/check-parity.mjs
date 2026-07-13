#!/usr/bin/env node
/**
 * check:parity — a cheap, language-agnostic CI gate for `conformance/api-manifest.json`.
 *
 * Greps each package's source for the manifest's declared method names, error names,
 * and credibility strategy names, in each language's own casing. This is deliberately
 * NOT a substitute for the per-language conformance tests (`packages/ts/test/conformance`,
 * `packages/py/tests/conformance`, `packages/rs/tests/conformance_*.rs`) — those actually
 * exercise the runtime surface. This script exists so a name drifting out of sync is
 * caught fast in CI without building/importing all three toolchains, as a first line of
 * defense before those slower, more precise suites run.
 *
 * Usage: node scripts/check-parity.mjs   (wired as `pnpm run check:parity`)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function readManifest() {
  const raw = readFileSync(path.join(ROOT, "conformance", "api-manifest.json"), "utf8");
  return JSON.parse(raw);
}

function readAll(files) {
  return files.map((f) => {
    try {
      return readFileSync(path.join(ROOT, f), "utf8");
    } catch {
      return "";
    }
  });
}

let failures = 0;
function check(label, ok) {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    console.error(`  FAIL ${label}`);
    failures += 1;
  }
}

function main() {
  const manifest = readManifest();

  // --- methods -------------------------------------------------------------------
  const tsFactsSrc = readAll([
    "packages/ts/src/actions/getAgent.ts",
    "packages/ts/src/actions/getAgentFeedback.ts",
    "packages/ts/src/actions/getAgentValidations.ts",
    "packages/ts/src/actions/getRegistrationFile.ts",
    "packages/ts/src/calculator/index.ts",
  ]).join("\n");
  const pySrc = readAll([
    "packages/py/src/web3_agent_reputation/module.py",
    "packages/py/src/web3_agent_reputation/calculator.py",
  ]).join("\n");
  const rsSrc = readAll(["packages/rs/src/facts.rs", "packages/rs/src/calculator.rs"]).join("\n");

  console.log("Checking methods.*...");
  for (const [method, casings] of Object.entries(manifest.methods)) {
    check(`ts: ${casings.ts}`, new RegExp(`function\\s+${casings.ts}\\b`).test(tsFactsSrc));
    check(`py: ${casings.py}`, new RegExp(`def\\s+${casings.py}\\b`).test(pySrc));
    check(`rs: ${casings.rs}`, new RegExp(`fn\\s+${casings.rs}\\b`).test(rsSrc));
    void method;
  }

  // --- error names -----------------------------------------------------------------
  const tsErrorsSrc = readAll(["packages/ts/src/errors.ts"])[0];
  const pyErrorsSrc = readAll(["packages/py/src/web3_agent_reputation/errors.py"])[0];
  const rsErrorsSrc = readAll(["packages/rs/src/errors.rs"])[0];

  console.log("Checking errorNames...");
  for (const name of manifest.errorNames) {
    check(`ts: class ${name}Error`, new RegExp(`class\\s+${name}Error\\b`).test(tsErrorsSrc));
    check(`py: class ${name}Error`, new RegExp(`class\\s+${name}Error\\b`).test(pyErrorsSrc));
    check(`rs: variant ${name}`, new RegExp(`\\b${name}\\s*[({]`).test(rsErrorsSrc));
  }

  // --- credibility strategies -------------------------------------------------------
  const tsCalcSrc = readAll(["packages/ts/src/calculator/index.ts"])[0];
  const pyCalcSrc = readAll(["packages/py/src/web3_agent_reputation/calculator.py"])[0];
  const rsCalcSrc = readAll(["packages/rs/src/calculator.rs"])[0];

  console.log("Checking credibilityStrategies...");
  for (const strategy of manifest.credibilityStrategies) {
    check(`ts: "${strategy}"`, tsCalcSrc.includes(`"${strategy}"`));
    check(`py: "${strategy}"`, pyCalcSrc.includes(`"${strategy}"`));
    check(`rs: "${strategy}"`, rsCalcSrc.includes(`"${strategy}"`));
  }

  console.log("");
  if (failures > 0) {
    console.error(`check:parity FAILED — ${failures} mismatch(es) against conformance/api-manifest.json`);
    process.exit(1);
  }
  console.log("check:parity OK — all packages match conformance/api-manifest.json");
}

main();
