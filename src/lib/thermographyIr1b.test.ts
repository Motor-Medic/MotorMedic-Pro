import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SavedAnalysisResult } from "./analysisPersistence";
import {
  THERMO_DT_TREND_DISCLOSURE,
  THERMO_DT_TREND_SINGLE_DATE,
  THERMO_LOAD_DISCLOSURE,
  THERMO_MULTI_TECH_LINK_LABEL,
  THERMO_MULTI_TECH_NO_CONCURRENT,
  THERMO_REFERENCE_BASIS_UNSPECIFIED,
  buildThermoChartSeries,
  netaRepairWindowForStoredClass,
  thermoCrossTechPillLabel,
  thermoDeltaTTrend,
  thermoLoadTelemetryStored,
  thermoReferenceBasisLabel,
  thermoStoredLoadLabel
} from "./thermographyTrendSeries";
import { convertTemperatureDelta } from "./vibration/units";

const seriesSrc = readFileSync(
  fileURLToPath(new URL("./thermographyTrendSeries.ts", import.meta.url)),
  "utf8"
);

const trendSrc = readFileSync(
  fileURLToPath(new URL("../components/TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
);

function row(options: {
  id?: string;
  timestamp: string;
  deltaT?: number | null;
  loadPercent?: number | null;
  referenceBasis?: string | null;
}): SavedAnalysisResult {
  const deltaT = options.deltaT ?? null;
  return {
    id: options.id ?? "row-1",
    asset_id: "asset-1",
    component: null,
    analysis_type: "thermography",
    timestamp: options.timestamp,
    health_score: 60,
    primary_fault: "Loose connection",
    fault_list: [],
    recommendations: [],
    financial_impact: {},
    severity: null,
    spectrum_image_url: null,
    peaks: [
      {
        type: "thermography",
        // When ΔT is absent, hotspot/reference are absent too — otherwise the
        // extraction's (hotspot − reference) fallback would fabricate a ΔT.
        hotspot_temp: deltaT != null ? 120 : null,
        reference_temp: deltaT != null ? 70 : null,
        delta_t: deltaT,
        severity_class: "Class 2",
        load_percentage: options.loadPercent ?? null,
        ...(options.referenceBasis != null
          ? { reference_temp_type: options.referenceBasis }
          : {})
      }
    ],
    telemetry_data: { environmental: { temp_unit: "°F" } }
  } as unknown as SavedAnalysisResult;
}

/* ------------------------------------------------------------------ */
/* GUARD 1 — load: same constant / gate, stored % verbatim             */
/* ------------------------------------------------------------------ */

describe("SLICE-IR1B load — one gate, one constant, stored % verbatim", () => {
  it("stored load label is null with no load telemetry (disclosure side stays on)", () => {
    expect(thermoStoredLoadLabel(null)).toBeNull();
    expect(
      thermoStoredLoadLabel({ loadPercent: null, currentAmps: 12, ratedAmps: null })
    ).toBeNull();
  });

  it("stored load % renders VERBATIM from the stored value, nothing recomputed", () => {
    expect(
      thermoStoredLoadLabel({ loadPercent: 75, currentAmps: null, ratedAmps: null })
    ).toBe("Load: 75% (stored)");
    expect(
      thermoStoredLoadLabel({ loadPercent: 41.5, currentAmps: 8, ratedAmps: 20 })
    ).toBe("Load: 41.5% (stored)");
    // Amp pair (no %) → stored amps verbatim, no derived percentage.
    expect(
      thermoStoredLoadLabel({ loadPercent: null, currentAmps: 12, ratedAmps: 40 })
    ).toBe("Load: 12 A / 40 A rated (stored)");
  });

  it("the same gate drives label and disclosure — never both, never neither", () => {
    // Same input, mutually exclusive surfaces:
    const stored = thermoLoadTelemetryStored({ loadPercent: 75, currentAmps: null, ratedAmps: null });
    expect(stored).toBe(true);
    expect(thermoStoredLoadLabel({ loadPercent: 75, currentAmps: null, ratedAmps: null })).not.toBeNull();
    const absent = thermoLoadTelemetryStored({ loadPercent: null, currentAmps: null, ratedAmps: null });
    expect(absent).toBe(false);
    expect(thermoStoredLoadLabel({ loadPercent: null, currentAmps: null, ratedAmps: null })).toBeNull();
  });

  it("the stored NETA verdict is untouched by load presence", () => {
    expect(netaRepairWindowForStoredClass(2)?.repairWindow).toBe(
      "Schedule repair within 30 days"
    );
    expect(netaRepairWindowForStoredClass(2)?.classLabel).toBe("Class 2 (MEDIUM)");
  });

  it("SSOT lock: IR1's load disclosure is byte-identical and reused (no second wording)", () => {
    expect(THERMO_LOAD_DISCLOSURE).toBe(
      "Definitive NETA classification assumes minimum load; load telemetry is not stored for this scan — the verdict is stored-only, not load-corrected."
    );
    // No divergent copy: the constant is referenced, never re-typed.
    expect(trendSrc.match(/thermo-kpi-load-disclosure/g)?.length).toBe(1);
    expect(trendSrc).toContain("thermoStoredLoadLabel(latestThermoRaw)");
    expect(trendSrc).toContain("thermoStoredLoad ?? THERMO_LOAD_DISCLOSURE");
    expect((trendSrc.match(/THERMO_LOAD_DISCLOSURE/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

/* ------------------------------------------------------------------ */
/* GUARD 2 — ΔT rate of change: >=2 distinct dates, descriptive only   */
/* ------------------------------------------------------------------ */

describe("SLICE-IR1B ΔT descriptive trend gate", () => {
  it("no ΔT stored → gate closed, slope null (nothing fabricated)", () => {
    const series = buildThermoChartSeries([row({ timestamp: "2026-11-13T09:00:00.000Z" })]);
    expect(thermoDeltaTTrend(series)).toEqual({
      distinctDates: 0,
      slopePerDay: null,
      gated: true
    });
  });

  it("single date → honest disclosure and an exactly-zero slope", () => {
    const series = buildThermoChartSeries([
      row({ timestamp: "2026-11-13T09:00:00.000Z", deltaT: 50 }),
      row({ id: "row-2", timestamp: "2026-11-13T15:00:00.000Z", deltaT: 99 })
    ]);
    const trend = thermoDeltaTTrend(series);
    expect(trend).toEqual({ distinctDates: 1, slopePerDay: 0, gated: true });
  });

  it("two distinct dates → deterministic descriptive slope (ΔT 40 → 50 over 5 days = 2/day)", () => {
    const series = buildThermoChartSeries([
      row({ id: "old", timestamp: "2026-11-08T09:00:00.000Z", deltaT: 40 }),
      row({ id: "new", timestamp: "2026-11-13T09:00:00.000Z", deltaT: 50 })
    ]);
    expect(thermoDeltaTTrend(series)).toEqual({
      distinctDates: 2,
      slopePerDay: 2,
      gated: false
    });
  });

  it("same-date runs are DEDUPLICATED (latest per date) before the fit", () => {
    const series = buildThermoChartSeries([
      row({ id: "old", timestamp: "2026-11-08T09:00:00.000Z", deltaT: 40 }),
      // Two runs on the recent date: the early 99 must not enter the fit;
      // the latest run lands exactly 5 days after the old one → slope 2.
      row({ id: "new-early", timestamp: "2026-11-13T06:00:00.000Z", deltaT: 99 }),
      row({ id: "new-latest", timestamp: "2026-11-13T09:00:00.000Z", deltaT: 50 })
    ]);
    const trend = thermoDeltaTTrend(series);
    expect(trend.distinctDates).toBe(2);
    expect(trend.gated).toBe(false);
    expect(trend.slopePerDay).toBe(2);
  });

  it("slope stays in the STORED unit (unit-isolated); display conversion is by scale only", () => {
    // °C rows: the raw slope must be reported in °C/day, never pre-converted.
    const celsiusRow = (id: string, timestamp: string, deltaT: number) =>
      ({
        ...row({ id, timestamp, deltaT }),
        telemetry_data: { environmental: { temp_unit: "°C" } }
      }) as unknown as SavedAnalysisResult;
    const series = buildThermoChartSeries([
      celsiusRow("old", "2026-11-08T09:00:00.000Z", 10),
      celsiusRow("new", "2026-11-13T09:00:00.000Z", 20)
    ]);
    expect(thermoDeltaTTrend(series).slopePerDay).toBe(2);
    // The only conversion that exists is the scale-only ratio helper.
    expect(convertTemperatureDelta(2, "°C", "°F")).toBeCloseTo(3.6, 10);
    expect(convertTemperatureDelta(2, "°F", "°C")).toBeCloseTo(1.11, 2);
  });

  it("the gate is descriptive: the label forbids forecasting and no failure-date code exists", () => {
    expect(THERMO_DT_TREND_DISCLOSURE).toBe(
      "Descriptive trend, not a failure forecast"
    );
    expect(THERMO_DT_TREND_SINGLE_DATE).toContain("slope held at 0");
    // No extrapolated failure-date identifier anywhere in the trend code path.
    expect(seriesSrc).not.toMatch(
      /\b(daysToFailure|daysUntilFailure|failureDate|failure_date|projectedFailure)\b/i
    );
    expect(trendSrc).not.toMatch(/predicted failure|failure in \d+ days/i);
    expect(trendSrc).toContain("thermoDeltaTTrend(thermoChartSeries)");
  });

  it("shared windowing: the slope consumes the same windowed SSOT the chart reads", () => {
    expect(trendSrc).toContain("windowTrendByTimeRange(thermoAnalyses, timeRange)");
    // No forked IR window predicate (irResilience lock: exactly one direct call).
    expect((trendSrc.match(/filterTrendByTimeRange\(/g) ?? []).length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* GUARD 3 — reference basis: stored-only, never inferred              */
/* ------------------------------------------------------------------ */

describe("SLICE-IR1B reference basis (stored-only)", () => {
  it("no basis marker stored → honest 'not specified' disclosure", () => {
    const series = buildThermoChartSeries([row({ timestamp: "2026-11-13T09:00:00.000Z", deltaT: 50 })]);
    expect(series[0].referenceBasis ?? null).toBeNull();
    expect(thermoReferenceBasisLabel(series[0])).toBe(
      "Baseline type not specified in scan"
    );
    expect(THERMO_REFERENCE_BASIS_UNSPECIFIED).toBe(
      "Baseline type not specified in scan"
    );
  });

  it("a stored basis marker renders verbatim — never paraphrased, never inferred", () => {
    const series = buildThermoChartSeries([
      row({
        timestamp: "2026-11-13T09:00:00.000Z",
        deltaT: 50,
        referenceBasis: "adjacent phase"
      })
    ]);
    expect(thermoReferenceBasisLabel(series[0])).toBe("adjacent phase");
  });

  it("ambient/reference data present does NOT fabricate a basis", () => {
    // Even with reference + ambient stored, without an explicit basis marker
    // the honest label stays "not specified" (no ambient-vs-phase inference).
    const r = row({ timestamp: "2026-11-13T09:00:00.000Z", deltaT: 50 });
    r.telemetry_data = {
      environmental: { ambient_temp: 70, temp_unit: "°F" }
    };
    r.peaks = [
      {
        type: "thermography",
        hotspot_temp: 120,
        reference_temp: 70,
        delta_t: 50,
        severity_class: "Class 2"
      }
    ];
    const series = buildThermoChartSeries([r]);
    expect(series[0].reference).toBe(70);
    expect(series[0].ambientReferenceTemp).toBe(70);
    expect(series[0].referenceBasis ?? null).toBeNull();
    expect(thermoReferenceBasisLabel(series[0])).toBe(
      "Baseline type not specified in scan"
    );
  });

  it("no scan at all → no surface (null)", () => {
    expect(thermoReferenceBasisLabel(null)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* GUARD 4 — multi-tech presence pill: read-only counts                */
/* ------------------------------------------------------------------ */

describe("SLICE-IR1B multi-tech presence pill (read-only)", () => {
  it("absent side renders the honest no-concurrent-runs disclosure verbatim", () => {
    expect(THERMO_MULTI_TECH_NO_CONCURRENT).toBe(
      "No concurrent Vibration / MCSA runs in this window"
    );
    expect(thermoCrossTechPillLabel({ vibration: 0, mca: 0 })).toBe(
      THERMO_MULTI_TECH_NO_CONCURRENT
    );
  });

  it("presence side reports stored counts only — no score, no correlation", () => {
    expect(thermoCrossTechPillLabel({ vibration: 3, mca: 0 })).toBe(
      "Concurrent runs in this window — Vibration: 3 · MCSA: 0"
    );
    expect(thermoCrossTechPillLabel({ vibration: 0, mca: 1 })).toBe(
      "Concurrent runs in this window — Vibration: 0 · MCSA: 1"
    );
  });

  it("SSOT lock: pill is counts-only and links to the fusion surface", () => {
    expect(trendSrc).toContain("thermoCrossTechPillLabel(thermoCrossTechCounts)");
    expect(trendSrc).toContain("thermo-multi-tech-presence-pill");
    expect(trendSrc).toContain('navigateToTab("multi-tech")');
    expect(THERMO_MULTI_TECH_LINK_LABEL).toBe("Open Multi-Tech Fusion");
    // The presence memos reuse the shared window predicate (never a fork).
    expect(trendSrc).toContain(
      "vibration: windowTrendByTimeRange(vibAnalyses, timeRange).length"
    );
    expect(trendSrc).toContain(
      "mca: windowTrendByTimeRange(mcaAnalyses, timeRange).length"
    );
  });
});

/* ------------------------------------------------------------------ */
/* GUARD 5 — generic wording: no standard-section citations            */
/* ------------------------------------------------------------------ */

describe("SLICE-IR1B wording stays generic", () => {
  const constants = [
    THERMO_LOAD_DISCLOSURE,
    THERMO_REFERENCE_BASIS_UNSPECIFIED,
    THERMO_DT_TREND_DISCLOSURE,
    THERMO_DT_TREND_SINGLE_DATE,
    THERMO_MULTI_TECH_NO_CONCURRENT,
    THERMO_MULTI_TECH_LINK_LABEL
  ];
  it("no NFPA section / NETA table / percent-band citations in any new constant", () => {
    for (const constant of constants) {
      expect(constant).not.toMatch(/§/);
      expect(constant).not.toMatch(/Table\s*\d/i);
      expect(constant).not.toMatch(/NFPA\s*\d/);
      expect(constant).not.toMatch(/NETA\s+(Table|MTS)/i);
      expect(constant).not.toMatch(/\d+\s*%/);
    }
  });
});
