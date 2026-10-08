import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  fileURLToPath(new URL("./Diagnose.tsx", import.meta.url)),
  "utf8",
);

const REQUIRED: string[] = [
  "function finiteOrNull(",
  "Number.NaN",
  "Number.isFinite(gaugeScore)",
  "DIAGNOSE_SEVERITY_NOT_COMPUTED",
  "analysisResult?.severity ?? null",
  "DIAGNOSE_SAMPLE_DATASET",
  "roiPercent != null",
  "vibrationThresholdIso20816Proxy",
  "woConfidence != null ?",
  "health_score: finiteOrNull(",
  'from "../lib/maintenance/prescriptiveDictionary"',
];

const FORBIDDEN: string[] = [
  "healthScoreForSeverity",
  "HEALTH_SCORE_TARGET",
  "?? 38",
  "?? 94",
  "?? 152",
  "|| 80",
  '"14-21 days"',
  "Master Vibration AI correlated spectrum imagery",
  "2x SKF 6320 C3 verified",
  "Auto-PO generated for Alignment Shims",
  '"152 Hz";',
  "ROI: {roiPercent.toLocaleString()}",
  "confidencePercent ?? 0",
  '(analysisResult ? "NORMAL" : "CRITICAL")',
  "sample dataset - not this asset's measured values",
  "default-derived - not measured",
];

describe("P5 Diagnose point of use", () => {
  it("required finite/null guards and confessions are present", () => {
    for (const needle of REQUIRED) {
      expect(src.includes(needle), `missing: ${needle}`).toBe(true);
    }
  });

  it("no default/coercion or fabricated-value needles survive", () => {
    for (const needle of FORBIDDEN) {
      expect(src.includes(needle), `forbidden needle present: ${needle}`).toBe(false);
    }
  });
});
