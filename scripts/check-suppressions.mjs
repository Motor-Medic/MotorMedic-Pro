#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * AR-30b final baseline (R1 residual closed by the consensus payload guard):
 *   as any 0 / as-unknown 0 / ts-ignore 0 / ts-expect-error 0.
 * The former single as-unknown (R1, src/lib/consensusEngine.ts Stage-3
 * referee early-exit) was replaced by a runtime shape guard, so the scan is
 * now TRUE FAIL-ON-ANY: any occurrence of any pattern under src/ fails.
 */
const BASELINE = {
  "as any": 0,
  "as unknown": 0,
  "@ts-ignore": 0,
  "@ts-expect-error": 0,
};

const PATTERNS = [
  { name: "as any", regex: /\bas any\b/i },
  { name: "as unknown", regex: /\bas unknown\b/i },
  { name: "@ts-ignore", regex: /@ts-ignore/i },
  { name: "@ts-expect-error", regex: /@ts-expect-error/i },
];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const EXIT_OK = 0;
const EXIT_BASELINE_EXCEEDED = 1;
const EXIT_SCAN_ERROR = 2;

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const srcRoot = join(repoRoot, "src");

function collectSourceFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    const dotIndex = entry.name.lastIndexOf(".");
    const extension = dotIndex === -1 ? "" : entry.name.slice(dotIndex);
    if (SOURCE_EXTENSIONS.has(extension)) files.push(fullPath);
  }
  return files;
}

function countInLine(line, regex) {
  return regex.test(line) ? 1 : 0;
}

function scan() {
  const totals = {};
  const perFile = {};
  for (const pattern of PATTERNS) {
    totals[pattern.name] = 0;
    perFile[pattern.name] = [];
  }

  const files = collectSourceFiles(srcRoot).sort();
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);
    const relPath = relative(repoRoot, file).split(sep).join("/");
    for (const pattern of PATTERNS) {
      let fileCount = 0;
      for (const line of lines) fileCount += countInLine(line, pattern.regex);
      if (fileCount > 0) {
        totals[pattern.name] += fileCount;
        perFile[pattern.name].push({ file: relPath, count: fileCount });
      }
    }
  }

  return { files, totals, perFile };
}

function main() {
  let result;
  try {
    result = scan();
  } catch (error) {
    console.error(`check:suppressions SCAN ERROR: ${error.message}`);
    return EXIT_SCAN_ERROR;
  }

  const { files, totals, perFile } = result;
  console.log("check:suppressions - type-suppression guard (AR-30b strict fail-on-any)");
  console.log(`scanned ${files.length} files under src/`);
  console.log("");
  console.log("pattern            baseline   actual   delta   status");
  console.log("-------------------------------------------------------");

  const violations = [];
  for (const pattern of PATTERNS) {
    const name = pattern.name;
    const baseline = BASELINE[name];
    const actual = totals[name];
    const delta = actual - baseline;
    const found = actual > 0;
    const status = found ? "FAIL (present)" : "ok";
    if (found) violations.push(name);
    const paddedName = name.padEnd(18, " ");
    const deltaLabel = `${delta > 0 ? "+" : ""}${delta}`;
    console.log(
      `${paddedName} ${String(baseline).padEnd(10)} ${String(actual).padEnd(8)} ${deltaLabel.padEnd(7)} ${status}`
    );
  }

  if (violations.length > 0) {
    console.log("");
    for (const name of violations) {
      const actual = totals[name];
      console.log(
        `"${name}" found ${actual} time(s) in src/ (strict fail-on-any, baseline 0). Offenders:`
      );
      for (const entry of perFile[name]) {
        console.log(`  ${entry.file}: ${entry.count}`);
      }
    }
    console.log("");
    console.error(
      `check:suppressions FAILED: forbidden token present - strict fail-on-any baseline 0/0/0/0.`
    );
    return EXIT_BASELINE_EXCEEDED;
  }

  console.log("");
  console.log(
    `check:suppressions PASSED: strict fail-on-any baseline 0/0/0/0 - no forbidden tokens anywhere under src/.`
  );
  return EXIT_OK;
}

process.exitCode = main();
