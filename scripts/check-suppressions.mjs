#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const BASELINE = {
  "as any": 14,
  "as unknown": 62,
  "@ts-ignore": 3,
  "@ts-expect-error": 1,
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
  console.log("check:suppressions - type-suppression guard (AR-27)");
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
    const status = delta > 0 ? "FAIL (increase)" : "ok";
    if (delta > 0) violations.push(name);
    const paddedName = name.padEnd(18, " ");
    const deltaLabel = `${delta > 0 ? "+" : ""}${delta}`;
    console.log(
      `${paddedName} ${String(baseline).padEnd(10)} ${String(actual).padEnd(8)} ${deltaLabel.padEnd(7)} ${status}`
    );
  }

  if (violations.length > 0) {
    console.log("");
    for (const name of violations) {
      const baseline = BASELINE[name];
      const actual = totals[name];
      console.log(
        `"${name}" rose from baseline ${baseline} to ${actual} (+${actual - baseline}). Offenders:`
      );
      for (const entry of perFile[name]) {
        console.log(`  ${entry.file}: ${entry.count}`);
      }
    }
    console.log("");
    console.error(
      "check:suppressions FAILED: suppression count increased above the frozen AR-27 baseline (14/62/3/1)."
    );
    return EXIT_BASELINE_EXCEEDED;
  }

  console.log("");
  console.log(
    "check:suppressions PASSED: no pattern rose above the frozen AR-27 baseline (14/62/3/1)."
  );
  return EXIT_OK;
}

process.exitCode = main();
