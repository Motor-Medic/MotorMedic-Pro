/**
 * SLICE-THERMO-RAD — radiometric merge + badge-OCR fallback + model repoint.
 *
 * Layer contract (honesty doctrine):
 *   1. Deterministic FLIR decode fills ONLY what the file carries.
 *   2. Badge-OCR (vision transcription of burned overlays) fills what it
 *      actually reads — labeled synonyms + overlay heuristics, flagged.
 *   3. If NEITHER channel yields a value, every field stays null and the
 *      UI keeps its "No readable report fields found" gate. Nothing is
 *      ever guessed.
 *   4. The numeric-extraction model chain (oilVisionExtractor) is UNCHANGED;
 *      only the visual-reference-match analysis engine chain is repointed
 *      fast-first (Gemini → Mistral → gpt-4o-mini → gpt-4o legacy).
 */

import { describe, expect, it } from "vitest";
import {
  mapThermographyTranscription,
  mergeRadiometricIntoThermographyReport,
  type ThermographyReportData
} from "./thermographyVisionExtractor";
import {
  THERMOGRAPHY_ANALYSIS_VISION_CHAIN
} from "./thermographyAnalysisEngine";
import {
  OIL_VISION_MODELS,
  VISION_PROVIDER_CHAIN
} from "./oilVisionExtractor";
import type { RadiometricDecodeResult } from "./radiometricDecoder";

function radiometricFixture(partial: Partial<RadiometricDecodeResult> = {}): RadiometricDecodeResult {
  return {
    found: true,
    container: "jpeg-app1-flir",
    tMaxC: 22.9,
    tMinC: 20.38,
    reflectedTempC: 20.6,
    atmosphericTempC: 22.0,
    relativeHumidityPct: 61.4,
    emissivity: 0.95,
    objectDistanceM: 4.2,
    irWindowTransmission: 0.96,
    cameraModel: "FLIR E5",
    hotspot: { x: 12, y: 4, tempC: 22.9, raw: 17976 },
    planck: { r1: 21106.77, r2: 0.012545258, b: 1501, f: 1, o: -7340 },
    rawRange: { min: 17520, max: 17976, median: 17620 },
    sourceTags: ["FLIR CameraInfo", "FLIR RawData → Planck T_max/T_min"],
    ...partial
  };
}

function emptyReport(): ThermographyReportData {
  return {
    maxTempC: null,
    referenceTempC: null,
    deltaTK: null,
    avgTempC: null,
    emissivity: null,
    ambientTempC: null,
    relativeHumidityPct: null,
    severityClass: null,
    confidenceScore: 0
  };
}

describe("SLICE-THERMO-RAD — mergeRadiometricIntoThermographyReport", () => {
  it("fills T_max / T_ref / RH / emissivity from the decoded file data", () => {
    const { report, radiometricFilled } = mergeRadiometricIntoThermographyReport(
      emptyReport(),
      radiometricFixture(),
      "IR_0001.ir.webp"
    );
    expect(report).not.toBeNull();
    expect(report?.maxTempC).toBeCloseTo(22.9, 1);
    expect(report?.referenceTempC).toBeCloseTo(20.6, 1);
    expect(report?.relativeHumidityPct).toBeCloseTo(61.4, 1);
    expect(report?.emissivity).toBeCloseTo(0.95, 2);
    expect(report?.ambientTempC).toBeCloseTo(22.0, 1);
    // ΔT derived strictly from the two decoded values
    expect(report?.deltaTK).toBeCloseTo(2.3, 1);
    expect(report?.radiometricProvenance).toBe("flir-metadata");
    expect(radiometricFilled).toContain("Max Temp (°C)");
    expect(radiometricFilled).toContain("Reference (°C)");
    expect(radiometricFilled).toContain("Humidity (%)");
  });

  it("OCR-read badge values win — decoder only backfills null fields", () => {
    const ocr = emptyReport();
    ocr.maxTempC = 150.5; // badge said something different — never overwritten
    ocr.relativeHumidityPct = 40;
    const { report, radiometricFilled } = mergeRadiometricIntoThermographyReport(
      ocr,
      radiometricFixture(),
      "IR_0001.jpg"
    );
    expect(report?.maxTempC).toBe(150.5);
    expect(report?.relativeHumidityPct).toBe(40);
    // But the file-carried channels the OCR missed are still filled
    expect(report?.referenceTempC).toBeCloseTo(20.6, 1);
    expect(radiometricFilled).not.toContain("Max Temp (°C)");
  });

  it("radiometric not found → report returned untouched, zero fills (no fabrication)", () => {
    const ocr = emptyReport();
    ocr.maxTempC = 31.4;
    const missing = mergeRadiometricIntoThermographyReport(ocr, null, "shot.jpg");
    expect(missing.radiometricFilled).toEqual([]);
    expect(missing.report).toBe(ocr);
    const notFound = mergeRadiometricIntoThermographyReport(
      ocr,
      radiometricFixture({ found: false }),
      "shot.jpg"
    );
    expect(notFound.radiometricFilled).toEqual([]);
    expect(notFound.report).toBe(ocr);
  });

  it("vision failed but file has data → report synthesized from decode alone", () => {
    const { report, radiometricFilled } = mergeRadiometricIntoThermographyReport(
      null,
      radiometricFixture(),
      "IR_0001.ir.webp"
    );
    expect(report).not.toBeNull();
    expect(report?.maxTempC).toBeCloseTo(22.9, 1);
    expect(report?.radiometricProvenance).toBe("flir-metadata");
    expect(radiometricFilled.length).toBeGreaterThan(0);
  });

  it("partial decode (no Planck): only carried channels filled, temps stay null", () => {
    const decode = radiometricFixture({
      tMaxC: null,
      tMinC: null,
      hotspot: null,
      sourceTags: ["FLIR CameraInfo"]
    });
    const { report } = mergeRadiometricIntoThermographyReport(null, decode, "IR_0001.jpg");
    expect(report?.maxTempC).toBeNull(); // honesty: no temperature guessed
    expect(report?.relativeHumidityPct).toBeCloseTo(61.4, 1);
    expect(report?.deltaTK).toBeNull();
  });
});

describe("SLICE-THERMO-RAD — badge-OCR fallback (burned-in overlay transcription)", () => {
  it("labeled badge rows map to exact values: 22.9 / 20.6 / 61.4", () => {
    const tx = mapThermographyTranscription([
      { header: "Max", value: "22.9", unit_as_read: "°C" },
      { header: "Ref", value: "20.6", unit_as_read: "°C" },
      { header: "RH", value: "61.4", unit_as_read: "%" }
    ]);
    expect(tx.maxTempC).toBeCloseTo(22.9, 1);
    expect(tx.referenceTempC).toBeCloseTo(20.6, 1);
    expect(tx.relativeHumidityPct).toBeCloseTo(61.4, 1);
  });

  it("new badge synonyms: T-max / T-ref / Relative Humidity / Ambient Temp", () => {
    const tx = mapThermographyTranscription([
      { header: "T-max", value: "22.9", unit_as_read: "°C" },
      { header: "T-ref", value: "20.6", unit_as_read: "°C" },
      { header: "Relative Humidity", value: "61.4", unit_as_read: "%" },
      { header: "Ambient Temp", value: "22", unit_as_read: "°C" }
    ]);
    expect(tx.maxTempC).toBeCloseTo(22.9, 1);
    expect(tx.referenceTempC).toBeCloseTo(20.6, 1);
    expect(tx.relativeHumidityPct).toBeCloseTo(61.4, 1);
    expect(tx.ambientTempC).toBeCloseTo(22, 1);
  });

  it("badge row without explicit unit anywhere is flagged for verify (°C assumption risk)", () => {
    const tx = mapThermographyTranscription([
      { header: "Max", value: "22.9", unit_as_read: null }
    ]);
    expect(tx.maxTempC).toBeCloseTo(22.9, 1);
    expect(tx.flagged).toContain("Max Temp (°C)");
  });

  it("no readable rows → all fields null (gate stays honest)", () => {
    const tx = mapThermographyTranscription([]);
    expect(tx.maxTempC).toBeNull();
    expect(tx.referenceTempC).toBeNull();
    expect(tx.deltaTK).toBeNull();
    expect(tx.relativeHumidityPct).toBeNull();
    expect(tx.emissivity).toBeNull();
    const merged = mergeRadiometricIntoThermographyReport(null, null, "blank.png");
    expect(merged.report).toBeNull();
    expect(merged.radiometricFilled).toEqual([]);
  });

  it("impossible humidity from badges is dropped, never injected", () => {
    const tx = mapThermographyTranscription([
      { header: null, value: "250", unit_as_read: "%" }
    ]);
    expect(tx.relativeHumidityPct).toBeNull();
  });
});

describe("SLICE-THERMO-RAD — visual-reference-match model repoint (chain lock)", () => {
  it("analysis engine leads with the FAST valid vision model (gemini-3.5-flash)", () => {
    const first = THERMOGRAPHY_ANALYSIS_VISION_CHAIN[0];
    expect(first.id).toBe("gemini");
    expect(first.model).toBe("gemini-3.5-flash");
    expect(first.envKey).toBe("GEMINI_API_KEY");
  });

  it("slow gpt-4o primary demoted to LAST-resort legacy entry", () => {
    const models = THERMOGRAPHY_ANALYSIS_VISION_CHAIN.map((e) => e.model);
    expect(models).not.toContain("gpt-4-turbo");
    const last = THERMOGRAPHY_ANALYSIS_VISION_CHAIN[THERMOGRAPHY_ANALYSIS_VISION_CHAIN.length - 1];
    expect(last.model).toBe("gpt-4o");
    expect(last.id).toBe("openai-legacy");
    // gpt-4o-mini covers the fast OpenAI tier before the legacy entry
    expect(models).toContain("gpt-4o-mini");
    expect(models.indexOf("gpt-4o-mini")).toBeLessThan(models.indexOf("gpt-4o"));
  });

  it("REGRESSION: numeric-extraction path (master vision chain) is UNCHANGED", () => {
    expect([...OIL_VISION_MODELS]).toEqual([
      "openai/gpt-4o",
      "google/gemini-3.1-pro-preview",
      "openai/gpt-4-turbo",
      "qwen/qwen-2.5-vl-72b-instruct"
    ]);
    expect(VISION_PROVIDER_CHAIN.map((p) => p.id)).toEqual([
      "gemini",
      "groq",
      "mistral",
      "openai",
      "openrouter"
    ]);
    expect(VISION_PROVIDER_CHAIN[0].models).toEqual(["gemini-3.5-flash"]);
    expect(VISION_PROVIDER_CHAIN[3].models).toEqual(["gpt-4o"]);
  });

  it("every analysis chain entry is a boot-health VALID provider/key pair", () => {
    const validKeys = new Set(["GEMINI_API_KEY", "MISTRAL_API_KEY", "OPENAI_API_KEY"]);
    for (const entry of THERMOGRAPHY_ANALYSIS_VISION_CHAIN) {
      expect(validKeys.has(entry.envKey)).toBe(true);
    }
  });
});
