/**
 * Verifies the report exporters emit real, well-formed files carrying the saved
 * record's values. Runs headless by stubbing only the browser download hooks.
 */
import assert from "node:assert/strict";
import type { SavedAnalysisResult } from "../src/lib/analysisPersistence";
import {
  buildReportPdf,
  exportReportCsv,
  exportReportXlsx,
  reportPdfFilename
} from "../src/lib/reportExport";

// Capture downloads rather than touching a DOM. Only the two object-URL helpers
// are patched; replacing the URL constructor breaks the TypeScript loader.
let pendingBlob: Blob | null = null;
const blobs: { name: string; blob: Blob }[] = [];

(URL as unknown as Record<string, unknown>).createObjectURL = (blob: Blob) => {
  pendingBlob = blob;
  return "blob:stub";
};
(URL as unknown as Record<string, unknown>).revokeObjectURL = () => {};
(globalThis as Record<string, unknown>).document = {
  createElement: () => ({
    href: "",
    download: "",
    click() {
      blobs.push({ name: this.download, blob: pendingBlob! });
    },
    remove() {}
  }),
  body: { appendChild() {} }
};

const record: SavedAnalysisResult = {
  id: "a1b2c3",
  asset_id: "PMP-030",
  component: "Motor DE",
  timestamp: "2026-08-20T09:30:00.000Z",
  health_score: 62,
  primary_fault: "Outer Race Bearing Defect (BPFO)",
  fault_list: [
    { title: "Outer Race Bearing Defect (BPFO)", confidencePercent: 87, severity: "HIGH" },
    { title: "Lubrication Starvation", confidence: 54, detail: "Envelope energy rising" }
  ],
  peaks: [],
  spectrum_image_url: null,
  recommendations: ["Replace DE bearing within 30 days", "Re-grease per OEM interval"],
  financial_impact: { preventiveRepairCost: 1200, failureCostIfDelayed: 18000 },
  severity: "HIGH",
  summary: "Bearing outer race defect confirmed by envelope and oil wear metals.",
  measured_amps: 41.2,
  de_bearing_temp: 78.4,
  envelope_peak_amplitude: 3.15
};

const ctx = {
  assetLabel: "Boiler Feed Pump PMP-030",
  component: "Motor DE",
  technology: "vibration",
  analysis: record,
  records: [record],
  generatedAt: new Date("2026-08-26T12:00:00Z")
};

const results: string[] = [];

// --- PDF ---
const doc = buildReportPdf(ctx);
const pdfName = reportPdfFilename(ctx);
assert.match(pdfName, /^boiler-feed-pump-pmp-030-vibration-.+\.pdf$/, "pdf filename");
const pdfRaw = doc.output();
assert.ok(pdfRaw.startsWith("%PDF-"), "pdf lacks the %PDF signature");
assert.ok(doc.getNumberOfPages() >= 1, "pdf has no pages");
// Parentheses delimit PDF strings, so match on paren-free fragments.
for (const needle of [
  "Boiler Feed Pump PMP-030",
  "Outer Race Bearing Defect",
  "Lubrication Starvation",
  "Envelope energy rising",
  "Replace DE bearing within 30 days",
  "Re-grease per OEM interval",
  "HIGH"
]) {
  assert.ok(pdfRaw.includes(needle), `pdf missing "${needle}"`);
}
results.push(`${pdfName} (${pdfRaw.length} bytes, ${doc.getNumberOfPages()} page(s))`);

// --- CSV ---
const csvName = exportReportCsv(ctx);
const csvEntry = blobs.find((b) => b.name === csvName);
assert.ok(csvEntry, "csv blob was not produced");
const csvText = await csvEntry.blob.text();
for (const needle of [
  "Primary Fault",
  "Outer Race Bearing Defect (BPFO)",
  "PMP-030",
  "41.2",
  "3.15"
]) {
  assert.ok(csvText.includes(needle), `csv missing "${needle}"`);
}
results.push(`${csvName} (${csvText.length} bytes)`);

// --- XLSX ---
const xlsxName = exportReportXlsx(ctx);
const xlsxEntry = blobs.find((b) => b.name === xlsxName);
assert.ok(xlsxEntry, "xlsx blob was not produced");
const xlsxBytes = new Uint8Array(await xlsxEntry.blob.arrayBuffer());
// A real .xlsx is a zip container, so it must open with the PK signature.
assert.equal(xlsxBytes[0], 0x50, "xlsx is not a zip container");
assert.equal(xlsxBytes[1], 0x4b, "xlsx is not a zip container");
results.push(`${xlsxName} (${xlsxBytes.length} bytes)`);

// Exporting with nothing loaded must fail loudly rather than emit an empty file.
for (const [label, fn] of [
  ["pdf", () => buildReportPdf({ ...ctx, analysis: null, records: [] })],
  ["csv", () => exportReportCsv({ ...ctx, analysis: null, records: [] })],
  ["xlsx", () => exportReportXlsx({ ...ctx, analysis: null, records: [] })]
] as const) {
  assert.throws(fn, /No saved analysis/, `${label} should refuse an empty export`);
}

console.log("Report exporters verified:");
for (const line of results) console.log(`  ${line}`);
console.log("  empty-state exports correctly refused for pdf, csv, xlsx");
