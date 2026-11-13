import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  calculateLeakImpact,
  formatLeakRunBasis,
  LEAK_BASIS_NOTE,
  LEAK_BASIS_TEXT,
  LEAK_COST_SEVERITY_SOURCE,
  LEAK_IMPACT_DEFAULTS,
  leakRunBasisIsDefault,
  summarizeLeakRunBases
} from "./leakCalculator";
import { analyzeUltrasoundData } from "../ultrasoundAnalysisEngine";
import {
  normalizeUltrasoundResult,
  ultrasoundPeaksForSave
} from "../ultrasoundAnalysis";

const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8").replace(
    /\r\n/g,
    "\n"
  );

const accordionsSrc = read("../../components/UltrasoundInputAccordions.tsx");
const dashboardSrc = read("../../components/UltrasoundResultsDashboard.tsx");
const trendAnalyzerSrc = read("../../components/TrendAnalyzer.tsx");
const diagnoseSrc = read("../../components/Diagnose.tsx");
const resultsTabSrc = read("../../components/reports/UltrasoundResultsTab.tsx");
const dossierTabSrc = read(
  "../../components/reports/UltrasoundPatternDossierTab.tsx"
);
const trendLibrarySrc = read(
  "../../components/reports/UltrasoundTrendLibraryTab.tsx"
);
const prognosticsTabSrc = read(
  "../../components/reports/UltrasoundPrognosticsTab.tsx"
);

/** Every surface that renders ultrasound data to a user. */
const uiSurfaces: Array<[string, string]> = [
  ["TrendAnalyzer.tsx", trendAnalyzerSrc],
  ["UltrasoundResultsDashboard.tsx", dashboardSrc],
  ["UltrasoundInputAccordions.tsx", accordionsSrc],
  ["Diagnose.tsx", diagnoseSrc],
  ["reports/UltrasoundResultsTab.tsx", resultsTabSrc],
  ["reports/UltrasoundPatternDossierTab.tsx", dossierTabSrc],
  ["reports/UltrasoundTrendLibraryTab.tsx", trendLibrarySrc],
  ["reports/UltrasoundPrognosticsTab.tsx", prognosticsTabSrc]
];

type PeaksRecord = Record<string, unknown>;

describe("SLICE-VS8 the dB→CFM calculator is parked, verify-script only", () => {
  it("carries the PARKED contract in its own doc comment", () => {
    const calculatorSrc = read("./leakCalculator.ts");
    expect(calculatorSrc).toContain("PARKED (SLICE-VS8)");
    expect(calculatorSrc).toMatch(
      /do not import from UI, reports, exports, or the\s+\*\s+analysis engine/
    );
  });

  it("is imported by no UI surface — no code path computes CFM from dB", () => {
    for (const [name, source] of uiSurfaces) {
      expect(source, name).not.toContain("calculateLeakImpact");
      expect(source, name).not.toMatch(/leakCalculator['"]/);
    }
  });

  it("keeps the documented default math intact for verify scripts", () => {
    const result = calculateLeakImpact({ peakDb: 55, baselineDb: 28 });
    expect(result.annualCost).toBe(48.95);
    expect(result.flowRateCfm).toBe(0.26);
  });

  it("basis inputs still move the parked math (hours, pressure, Cd)", () => {
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
      base.annualCost *
        (150 + LEAK_IMPACT_DEFAULTS.atmospherePsi) /
        (LEAK_IMPACT_DEFAULTS.systemPressurePsi +
          LEAK_IMPACT_DEFAULTS.atmospherePsi),
      1
    );
    expect(roughHole.annualCost).toBeCloseTo(
      base.annualCost * (0.65 / LEAK_IMPACT_DEFAULTS.dischargeCoefficient),
      1
    );
  });

  it("labels every basis constant as in-repo guidance, never a standard", () => {
    expect(LEAK_BASIS_TEXT).toContain("100 psi");
    expect(LEAK_BASIS_TEXT).toContain("$0.12/kWh");
    expect(LEAK_BASIS_TEXT).toContain("8760 h/yr");
    expect(LEAK_BASIS_TEXT).toContain("18 kW/100 CFM");
    expect(LEAK_BASIS_TEXT).toContain("eGRID US avg");
    expect(LEAK_BASIS_NOTE).toContain("not measured");
    expect(LEAK_COST_SEVERITY_SOURCE).toContain("Static in-repo");
    expect(LEAK_COST_SEVERITY_SOURCE).toContain(
      "guidance, not an ISO/DOE standard"
    );
  });

  it("keeps the basis summary helpers usable for verify scripts", () => {
    const summary = summarizeLeakRunBases([
      { systemPressure: 100, operatingHours: 8760, dischargeCoefficient: 0.79 },
      {}
    ]);
    expect(summary.isDefault).toBe(true);
    expect(summary.text).toBe(LEAK_BASIS_TEXT);

    const mixed = summarizeLeakRunBases([
      { baselineSource: "fallback", baselineFallbackDb: 28 },
      { systemPressure: 150, operatingHours: 4000, dischargeCoefficient: 0.65 }
    ]);
    expect(mixed.isDefault).toBe(false);
    expect(mixed.text).toContain("Per-run basis");
    expect(mixed.text).toContain("150 psi");
    expect(mixed.text).toContain("4,000 h/yr");
    expect(mixed.text).toContain("Cd 0.65");
    expect(mixed.fallbackCount).toBe(1);
    expect(mixed.fallbackDb).toBe(28);
    expect(leakRunBasisIsDefault({})).toBe(true);
    expect(formatLeakRunBasis({ operatingHours: 2000 })).toContain("2,000 h/yr");
  });
});

describe("SLICE-VS8 the engine persists measured readings only", () => {
  it("tags a missing baseline as fallback and a stored baseline as stored", async () => {
    const fallback = await analyzeUltrasoundData({
      mode: "leak",
      peakDbuV: 55
    });
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

  it("resolves probe_type from metadata and drops the parked economic/basis fields", async () => {
    const defaults = await analyzeUltrasoundData({
      mode: "leak",
      peakDbuV: 55,
      baselineDb: 28
    });
    const perRun = await analyzeUltrasoundData({
      mode: "leak",
      peakDbuV: 55,
      baselineDb: 28,
      probeType: "airborne",
      // Basis inputs are collected for the audit trail but the model that
      // consumed them is parked — they must not re-enter the peaks payload
      // as if the economics still ran (SLICE-VS8).
      systemPressure: 150,
      operatingHours: 4000,
      dischargeCoefficient: 0.65
    });

    expect(perRun.peaks.probe_type).toBe("airborne");
    expect(defaults.peaks.probe_type).toBe("unknown");
    expect(perRun.peaks.delta_db).toBe(27);

    for (const parkedField of [
      "annual_cost",
      "estimated_cfm",
      "orifice_size",
      "co2_emissions",
      "annual_kwh",
      "system_pressure",
      "operating_hours",
      "discharge_coefficient"
    ]) {
      expect(perRun.peaks, parkedField).not.toHaveProperty(parkedField);
      expect(defaults.peaks, parkedField).not.toHaveProperty(parkedField);
    }
    // The parked model must not change any measured number.
    expect(perRun.peaks.peak_dbmv).toBe(defaults.peaks.peak_dbmv);
    expect(perRun.peaks.delta_db).toBe(defaults.peaks.delta_db);
  });

  it("persists probe_type through normalize + save; parked fields stay out of the payload", async () => {
    const result = await analyzeUltrasoundData({
      mode: "leak",
      peakDbuV: 55,
      baselineDb: 30,
      probeType: "contact"
    });
    const normalized = normalizeUltrasoundResult(result);
    const saved = ultrasoundPeaksForSave(normalized)[0] as PeaksRecord;

    expect(saved.probe_type).toBe("contact");
    expect(saved.baseline_source).toBe("stored");
    expect(saved.baseline_fallback).toBe(false);
    expect(saved.peak_dbmv).toBe(55);
    // 55 − 30 = 25 dB.
    expect(saved.delta_db).toBe(25);

    for (const parkedField of [
      "annual_cost",
      "estimated_cfm",
      "orifice_size",
      "system_pressure",
      "operating_hours",
      "discharge_coefficient"
    ]) {
      expect(saved, parkedField).not.toHaveProperty(parkedField);
    }
  });
});

describe("SLICE-VS8 leak_cfm ruling — analyst-measured rate only", () => {
  it("renders the entered rate with the provenance label, never as a model estimate", () => {
    expect(dashboardSrc).toContain('data-testid="leak-cfm-provenance"');
    expect(dashboardSrc).toContain("Analyst-measured / entered");
    expect(dashboardSrc).toContain("not model-derived");
    // The rate is read straight from the stored field — never derived.
    expect(dashboardSrc).toContain("ultrasoundPeaks?.leak_cfm != null");
    expect(dashboardSrc).not.toContain("Math.pow(10");
    expect(dashboardSrc).not.toContain("10 **");
  });

  it("shows an honest unrecorded state instead of estimating the rate from dB", () => {
    expect(dashboardSrc).toContain(
      "No leak rate is estimated from dBµV"
    );
    expect(dashboardSrc).toContain("no cost can be derived");
  });

  it("the trend surface parks the model in prose, not silently", () => {
    expect(trendAnalyzerSrc).toContain("Parked");
    expect(trendAnalyzerSrc).toContain(
      "CFM / orifice / $ / CO₂ outputs are not derived here"
    );
    expect(trendAnalyzerSrc).toMatch(
      /No CFM,\s+orifice, dollar, or CO₂ estimate is derived on this tab/
    );
  });
});

describe("SLICE-VS8 the capture form still collects the leak basis for the audit trail", () => {
  it("emits operational hours, line pressure and discharge coefficient in the snapshot", () => {
    expect(accordionsSrc).toContain("operatingHours: operatingHoursPerYear");
    expect(accordionsSrc).toContain("systemPressure: systemPressurePsi");
    expect(accordionsSrc).toContain("dischargeCoefficient,");
    expect(accordionsSrc).toContain("pressureUnit,");
  });
});
