import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  calculateLeakImpact,
  formatLeakRunBasis,
  LEAK_BASIS_TEXT,
  LEAK_IMPACT_DEFAULTS,
  leakRunBasisIsDefault,
  summarizeLeakRunBases
} from "./leakCalculator";
import { analyzeUltrasoundData } from "../ultrasoundAnalysisEngine";
import {
  normalizeUltrasoundResult,
  ultrasoundPeaksForSave
} from "../ultrasoundAnalysis";

const accordionsSrc = readFileSync(
  fileURLToPath(new URL("../../components/UltrasoundInputAccordions.tsx", import.meta.url)),
  "utf8"
);

describe("SLICE-AB per-run leak basis inputs change economics", () => {
  it("keeps the documented default result unchanged", () => {
    const result = calculateLeakImpact({ peakDb: 55, baselineDb: 28 });
    expect(result.annualCost).toBe(48.95);
    expect(result.flowRateCfm).toBe(0.26);
  });

  it("operating hours, line pressure and discharge coefficient all move annual cost", () => {
    const base = calculateLeakImpact({ peakDb: 55, baselineDb: 28 });
    const fewerHours = calculateLeakImpact({
      peakDb: 55,
      baselineDb: 28,
      operatingHours: 4000
    });
    const higherPressure = calculateLeakImpact({
      peakDb: 55,
      baselineDb: 28,
      systemPressure: 150
    });
    const roughHole = calculateLeakImpact({
      peakDb: 55,
      baselineDb: 28,
      dischargeCoefficient: 0.65
    });

    expect(fewerHours.annualCost).toBeLessThan(base.annualCost);
    expect(higherPressure.annualCost).toBeGreaterThan(base.annualCost);
    expect(roughHole.annualCost).toBeLessThan(base.annualCost);
    expect(fewerHours.annualCost).toBeCloseTo(base.annualCost * (4000 / 8760), 1);
    expect(higherPressure.annualCost).toBeCloseTo(
      base.annualCost * (150 + LEAK_IMPACT_DEFAULTS.atmospherePsi) /
        (LEAK_IMPACT_DEFAULTS.systemPressurePsi + LEAK_IMPACT_DEFAULTS.atmospherePsi),
      1
    );
    expect(roughHole.annualCost).toBeCloseTo(
      base.annualCost * (0.65 / LEAK_IMPACT_DEFAULTS.dischargeCoefficient),
      1
    );
  });

  it("the engine consumes pressure/hours/coefficient from metadata", async () => {
    const defaults = await analyzeUltrasoundData({
      mode: "leak",
      peakDbuV: 55,
      baselineDb: 28
    });
    const perRun = await analyzeUltrasoundData({
      mode: "leak",
      peakDbuV: 55,
      baselineDb: 28,
      systemPressure: 150,
      operatingHours: 4000,
      dischargeCoefficient: 0.65
    });

    expect(perRun.peaks.system_pressure).toBe(150);
    expect(perRun.peaks.operating_hours).toBe(4000);
    expect(perRun.peaks.discharge_coefficient).toBe(0.65);
    expect(perRun.peaks.annual_cost).not.toBe(defaults.peaks.annual_cost);
  });
});

describe("SLICE-AB baseline fallback is tagged, never silent", () => {
  it("tags a missing baseline as fallback and a stored baseline as stored", async () => {
    const fallback = await analyzeUltrasoundData({ mode: "leak", peakDbuV: 55 });
    expect(fallback.peaks.baseline_source).toBe("fallback");
    expect(fallback.peaks.baseline_fallback).toBe(true);
    expect(fallback.peaks.baseline_fallback_db).toBe(28);

    const stored = await analyzeUltrasoundData({
      mode: "leak",
      peakDbuV: 55,
      baselineDb: 30
    });
    expect(stored.peaks.baseline_source).toBe("stored");
    expect(stored.peaks.baseline_fallback).toBeUndefined();
  });

  it("persists and re-surfaces the per-run basis through normalize + save payload", async () => {
    const result = await analyzeUltrasoundData({
      mode: "leak",
      peakDbuV: 55,
      systemPressure: 150,
      operatingHours: 4000,
      dischargeCoefficient: 0.65
    });
    const normalized = normalizeUltrasoundResult(result);
    const saved = ultrasoundPeaksForSave(normalized)[0] as Record<string, unknown>;

    expect(saved.system_pressure).toBe(150);
    expect(saved.operating_hours).toBe(4000);
    expect(saved.discharge_coefficient).toBe(0.65);
    expect(saved.baseline_source).toBe("fallback");
    expect(saved.baseline_fallback_db).toBe(28);
  });
});

describe("SLICE-AB basis summary is per-run", () => {
  it("shows the documented defaults when every run matches", () => {
    const summary = summarizeLeakRunBases([
      { systemPressure: 100, operatingHours: 8760, dischargeCoefficient: 0.79 },
      {}
    ]);
    expect(summary.isDefault).toBe(true);
    expect(summary.text).toBe(LEAK_BASIS_TEXT);
  });

  it("shows the per-run basis when any run differs from the defaults", () => {
    const summary = summarizeLeakRunBases([
      { systemPressure: 100, operatingHours: 8760, dischargeCoefficient: 0.79 },
      { systemPressure: 150, operatingHours: 4000, dischargeCoefficient: 0.65 }
    ]);
    expect(summary.isDefault).toBe(false);
    expect(summary.text).toContain("Per-run basis");
    expect(summary.text).toContain("150 psi");
    expect(summary.text).toContain("4,000 h/yr");
    expect(summary.text).toContain("Cd 0.65");
    expect(summary.text).not.toContain("8760 h/yr");
  });

  it("counts runs that use the 28 dBµV fallback baseline", () => {
    const summary = summarizeLeakRunBases([
      { baselineSource: "fallback", baselineFallbackDb: 28 },
      { baselineSource: "stored" }
    ]);
    expect(summary.fallbackCount).toBe(1);
    expect(summary.fallbackDb).toBe(28);
    expect(leakRunBasisIsDefault({})).toBe(true);
    expect(formatLeakRunBasis({ operatingHours: 2000 })).toContain("2,000 h/yr");
  });
});

describe("SLICE-AB the UI no longer drops the collected inputs", () => {
  it("emits operational hours, line pressure and discharge coefficient in the snapshot", () => {
    expect(accordionsSrc).toContain("operatingHours: operatingHoursPerYear");
    expect(accordionsSrc).toContain("systemPressure: systemPressurePsi");
    expect(accordionsSrc).toContain("dischargeCoefficient,");
    expect(accordionsSrc).toContain("pressureUnit,");
  });
});
