import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { crestFactorFromPeakRmsDb } from "../lib/ultrasoundAnalysis";
import { evaluateUsSeverity } from "../lib/maintenance/prescriptiveDictionary";

const src = readFileSync(
  fileURLToPath(new URL("./TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
);

const trendSeriesSrc = readFileSync(
  fileURLToPath(new URL("../lib/vibration/trendSeries.ts", import.meta.url)),
  "utf8"
);

const prescriptiveSrc = readFileSync(
  fileURLToPath(
    new URL("../lib/maintenance/prescriptiveDictionary.ts", import.meta.url)
  ),
  "utf8"
);

function block(start: string, end: string): string {
  const from = src.indexOf(start);
  const to = src.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return src.slice(from, to);
}

function count(haystack: string, needle: string): number {
  return (haystack.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
}

describe("SLICE-Z Trend Analyzer shell layout", () => {
  it("renders exactly one equipment selector, directly beneath the technology cards", () => {
    expect(count(src, 'data-testid="trend-tech-cards"')).toBe(1);
    expect(count(src, 'data-testid="trend-equipment-selector"')).toBe(1);
    expect(src.indexOf('data-testid="trend-tech-cards"')).toBeLessThan(
      src.indexOf('data-testid="trend-equipment-selector"')
    );
    expect(src.indexOf('data-testid="trend-equipment-selector"')).toBeLessThan(
      src.indexOf("{trendTech === \"vibration\" && (")
    );
  });

  it("keeps the selector shell-owned so every technology view shares it", () => {
    const techThenSelector = block(
      '{/* Technology switcher — match Run Diagnostics card layout */}',
      'Time Range'
    );
    expect(techThenSelector).toContain('data-testid="trend-equipment-selector"');
    // All five technology bodies are rendered from the same shell closure.
    expect(count(src, 'data-testid="trend-equipment-selector"')).toBe(1);
    for (const tech of ["vibration", "thermography", "ultrasound", "mca", "oil_analysis"]) {
      expect(src).toContain(`{trendTech === "${tech}" && (`);
    }
  });
});

describe("SLICE-Z ultrasound Bearings & Mechanical honesty", () => {
  it("describes the crest value as a linear Peak/RMS ratio, never a dB difference", () => {
    expect(src).toContain("Linear peak/RMS ratio");
    expect(src).toContain("stored crest, else");
    expect(src).toMatch(/10\^\(\(Peak.RMS\)\/20\)/);
    expect(src).not.toContain("Peak dB - RMS dB");
    // Demo value: peak 55 dBµV, RMS 39 dBµV -> 10^(16/20) = 6.31 (a ratio).
    expect(crestFactorFromPeakRmsDb(55, 39)).toBe(6.31);
    expect(crestFactorFromPeakRmsDb(55, 39)).not.toBe(16);
  });

  it("windows the UE series through the shared predicate and the J2 sparse-date guard", () => {
    expect(src).toContain(
      "windowTrendByTimeRange(ueBearingAnalyses, timeRange)"
    );
    expect(
      block(
        "const ueBearingChartSeries = useMemo",
        "const latestUeBearing ="
      )
    ).toContain("[...windowedUeBearingAnalyses]");
    expect(src).toContain("planThermoTrendAxis(ueBearingChartSeries)");
    expect(src).toContain("isSparseTrendSeries(ueBearingChartSeries)");
    expect(src).toContain("ueBearingWindowEmpty");
    expect(src).toContain("ueBearingChartSparse");
    expect(src).toContain("SPARSE_TREND_HELPER_TEXT");
    // Reuse, not a fork: the literal shared predicate still appears once.
    expect(count(src, "filterTrendByTimeRange(")).toBe(1);
    expect(trendSeriesSrc).toContain(
      "return filterTrendByTimeRange(points, range, nowMs);"
    );
  });

  it("keeps dBµV out of the H2 unit prefs and never converts dB deltas", () => {
    const ue = block(
      '{trendTech === "ultrasound" && (',
      '{trendTech === "mca" && ('
    );
    expect(ue).toContain("dBµV");
    expect(ue).toContain("Level (dBµV)");
    for (const forbidden of [
      "displayUnits",
      "formatVelocityDisplay",
      "formatAccelerationDisplay",
      "velocityValueForDisplay",
      "frequencyValueForDisplay",
      "convertTemperature"
    ]) {
      expect(ue).not.toContain(forbidden);
    }

    const extract = block(
      "function uePeaksFromRow",
      "/** Bearings & Mechanical tab"
    );
    expect(extract).toContain("const delta = Number(p.delta_db);");
    expect(extract).not.toContain("displayUnits");
    expect(extract).not.toContain("ForDisplay");
    expect(extract).not.toContain("convert");
  });

  it("drops the unverified vs-baseline claim from the peak KPI", () => {
    const ue = block(
      '{trendTech === "ultrasound" && (',
      '{trendTech === "mca" && ('
    );
    expect(ue).not.toContain("vs baseline");
    expect(ue).not.toContain("Peak acoustic amplitude vs baseline");
    expect(ue).toContain(
      "Latest mechanical / bearing scan peak acoustic amplitude"
    );
  });

  it("mirrors the in-repo UE Systems bearing-condition ladder instead of recalled brackets", () => {
    expect(prescriptiveSrc).toContain("export const US_DDB_BRACKETS");
    expect(prescriptiveSrc).toContain("UE Systems bearing-condition ladder");
    expect(prescriptiveSrc).toContain("export function evaluateUsSeverity");
    expect(src).toContain("US_DDB_BRACKETS");
    expect(src).toContain("US_DDB_SOURCE");
    expect(src).toContain('data-testid="ue-ddb-rubric"');
    expect(src).toContain("Static in-repo reference");
    // The ladder is a real rubric, so a delta can be classified honestly.
    expect(evaluateUsSeverity(20).clazz).toBe("Class 1 — Critical");
    expect(evaluateUsSeverity(16).clazz).toBe("Class 2 — Moderate");
    expect(evaluateUsSeverity(10).clazz).toBe("Class 3 — Minor");
  });

  it("keeps the three KPI cards null-honest with no substitution or regex inference", () => {
    const kpis = block(
      "Acoustic Friction (RMS dB)",
      "Bearings & Mechanical — RMS / Peak acoustic trend"
    );
    expect(kpis).toContain("latestUeBearingPeaks?.rms != null");
    expect(kpis).toContain("latestUeBearingPeaks?.peak != null");
    expect(kpis).toContain("latestUeBearingPeaks?.crest != null");
    expect(kpis).toContain('"—"');
    expect(kpis).not.toContain("safeFinite");
    expect(kpis).not.toContain("|| 0");
  });
});
