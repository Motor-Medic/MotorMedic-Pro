/**
 * End-to-end check of multi-technology report persistence.
 *
 * Builds a live assessment from whatever PMP030 actually has in PostgreSQL,
 * saves it through the real API, reads it back, and asserts the rehydrated
 * report is value-identical to the one that was saved. Also checks that an
 * asset with no telemetry produces honest empty badges rather than zeros.
 *
 * Requires the dev server on localhost:3000.
 */

import assert from "node:assert/strict";
import {
  fetchAnalysisResults,
  type SavedAnalysisResult
} from "../src/lib/analysisPersistence";
import { fetchOilSamples } from "../src/lib/oilSampleRow";
import type { OilSample } from "../src/types/oilAnalysis";
import {
  buildMultiTechReport,
  noTelemetryMessage,
  REPORT_TECHNOLOGIES
} from "../src/lib/reports/technologySummary";
import {
  deleteReport,
  fetchReport,
  fetchReports,
  rehydrateReport,
  saveReport
} from "../src/lib/reports/reportPersistence";

const BASE = "http://localhost:3000";
const asset = process.argv[2] || "PMP030";

const nativeFetch = globalThis.fetch;
globalThis.fetch = ((input: any, init?: any) =>
  nativeFetch(
    typeof input === "string" && input.startsWith("/") ? `${BASE}${input}` : input,
    init
  )) as typeof fetch;

/**
 * Order-insensitive serialisation. PostgreSQL stores JSONB with its own key
 * ordering, so a round-tripped object comes back with the same values under a
 * different key order. The claim under test is value identity, not byte
 * identity, so keys are sorted before comparing.
 */
function canon(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])])
      );
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = canon(actual);
  const e = canon(expected);
  if (a === e) {
    console.log(`PASS: ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL: ${name}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

// --- Build a live assessment -------------------------------------------------
const [records, samples] = await Promise.all([
  fetchAnalysisResults({ asset_id: asset }).catch(() => [] as SavedAnalysisResult[]),
  fetchOilSamples(asset).catch(() => [] as OilSample[])
]);

console.log(`Asset: ${asset}`);
console.log(
  `Saved records: ${records.length} analysis_results, ${samples.length} oil samples\n`
);

const live = buildMultiTechReport({
  assetId: asset,
  analysisRecords: records,
  oilSamples: samples
});

console.log("--- LIVE MULTI-TECH ASSESSMENT ---");
console.table(
  live.technologies.map((t) => ({
    Technology: t.label,
    Data: t.hasData ? "yes" : "no",
    Severity: t.severity,
    Readings: t.hasData ? t.readings.length : "—",
    Captured: t.recordedAt ? String(t.recordedAt).slice(0, 10) : "—"
  }))
);
console.log(`Overall severity: ${live.overallSeverity}`);
console.log(`Technologies with data: ${live.technologiesWithData.join(", ") || "none"}\n`);

check(
  "every technology is represented, present or not",
  live.technologies.map((t) => t.technology),
  REPORT_TECHNOLOGIES
);
check(
  "technologies without data carry the honest badge",
  live.technologies
    .filter((t) => !t.hasData)
    .every((t) => t.emptyMessage === noTelemetryMessage(t.technology)),
  true
);
check(
  "technologies without data expose no readings and no severity claim",
  live.technologies
    .filter((t) => !t.hasData)
    .every((t) => t.readings.length === 0 && t.severity === "NO_DATA"),
  true
);
check(
  "technologies with data all carry at least one measured reading",
  live.technologies.filter((t) => t.hasData).every((t) => t.readings.length > 0),
  true
);

// --- Persist and rehydrate ---------------------------------------------------
console.log("\n--- PERSISTENCE ROUND TRIP ---");
const saved = await saveReport({
  assetId: asset,
  companyId: null,
  title: `${asset} — verification run`,
  generatedBy: "verify-report-persistence",
  report: live
});
console.log(`Saved report id: ${saved.id}`);

check("row persisted with the computed severity", saved.overall_severity, live.overallSeverity);
check(
  "row persisted the technologies that had data",
  saved.technologies_with_data,
  live.technologiesWithData
);

const listed = await fetchReports({ assetId: asset, limit: 25 });
check(
  "saved report appears in the asset's history",
  listed.some((r) => r.id === saved.id),
  true
);

const reread = await fetchReport(saved.id);
const rehydrated = rehydrateReport(reread);

// The whole promise of the feature: reopening shows what was saved.
check("rehydrated asset id matches", rehydrated.assetId, live.assetId);
check("rehydrated overall severity matches", rehydrated.overallSeverity, live.overallSeverity);
check("rehydrated fault diagnoses match", rehydrated.faultDiagnoses, live.faultDiagnoses);
check("rehydrated recommendations match", rehydrated.recommendations, live.recommendations);
check(
  "rehydrated technologies match value-for-value",
  rehydrated.technologies,
  live.technologies
);
check("whole report is value-identical after a round trip", rehydrated, live);

// --- An asset with nothing on file -------------------------------------------
console.log("\n--- ASSET WITH NO TELEMETRY ---");
const empty = buildMultiTechReport({
  assetId: "asset-with-no-telemetry",
  analysisRecords: [],
  oilSamples: []
});
console.log(empty.technologies.map((t) => `${t.label}: ${t.emptyMessage}`).join("\n"));
check("no data anywhere -> NO_DATA overall", empty.overallSeverity, "NO_DATA");
check("no data anywhere -> no technologies listed", empty.technologiesWithData, []);
check("no data anywhere -> no fault diagnoses invented", empty.faultDiagnoses, []);
check(
  "every technology states the honest badge",
  empty.technologies.map((t) => t.emptyMessage),
  REPORT_TECHNOLOGIES.map(noTelemetryMessage)
);

// --- Clean up ----------------------------------------------------------------
await deleteReport(saved.id);
const afterDelete = await fetchReports({ assetId: asset, limit: 25 });
check(
  "verification report removed again",
  afterDelete.some((r) => r.id === saved.id),
  false
);

console.log(
  failures === 0
    ? "\nAll report persistence checks passed."
    : `\n${failures} check(s) failed.`
);
process.exit(failures === 0 ? 0 : 1);
