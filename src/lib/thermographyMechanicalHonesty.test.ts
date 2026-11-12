import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SavedAnalysisResult } from "./analysisPersistence";
import {
  SAME_DATE_SNAPSHOT_SPAN_MS,
  buildThermoChartSeries,
  linearSlopePerDay,
  mechanicalKpis,
  planThermoTrendAxis,
  skinAmbientDelta,
  type ThermoChartPoint
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

const dictSrc = readFileSync(
  fileURLToPath(
    new URL("./maintenance/prescriptiveDictionary.ts", import.meta.url)
  ),
  "utf8"
);

const mechanicalBlock = trendSrc.slice(
  trendSrc.indexOf("TAB 4 — Mechanical & Refractory"),
  trendSrc.indexOf("ULTRASOUND TECH CONTENT")
);

function point(overrides: Partial<ThermoChartPoint> = {}): ThermoChartPoint {
  return {
    date: "Oct 30",
    sequence: 1,
    dateLabel: "Oct 30",
    time: "12:00",
    dateTime: "Oct 30 12:00",
    timestamp: "2026-10-30T12:00:00.000Z",
    hotspot: null,
    reference: null,
    deltaT: null,
    severityClass: null,
    severityLabel: null,
    phaseA: null,
    phaseB: null,
    phaseC: null,
    loadPercent: null,
    i2rDelta: null,
    i2rNormalizedDelta: null,
    currentAmps: null,
    ratedAmps: null,
    loadThreshold: 40,
    emissivity: null,
    scaleMin: null,
    scaleMax: null,
    isothermThreshold: null,
    boxAverage: null,
    reflectedApparentTemp: null,
    deBearing: null,
    odeBearing: null,
    skinTemp: null,
    refractorySkinTemp: null,
    ambientReferenceTemp: null,
    maxAllowable: null,
    thermalGradient: null,
    thermalDissipationRate: null,
    frictionalSeverity: null,
    frictionalAnomaly: null,
    tempUnit: null,
    ...overrides
  };
}

function row(
  options: {
    peakExtras?: Record<string, unknown>;
    primaryFault?: string | null;
  } = {}
): SavedAnalysisResult {
  return {
    id: "row-1",
    asset_id: "asset-1",
    component: null,
    timestamp: "2026-10-30T12:00:00.000Z",
    health_score: 80,
    primary_fault: options.primaryFault ?? null,
    fault_list: [],
    peaks: [
      {
        type: "thermography",
        hotspot_temp: null,
        reference_temp: null,
        delta_t: null,
        ...(options.peakExtras ?? {})
      }
    ],
    spectrum_image_url: null,
    recommendations: [],
    financial_impact: {},
    severity: null,
    analysis_type: "thermography",
    telemetry_data: {}
  };
}

function localIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): string {
  return new Date(year, month, day, hour, minute).toISOString();
}

describe("SLICE-Y refractory threshold provenance", () => {
  it("reads a stored design limit and never invents a hardcoded safety number", () => {
    expect(mechanicalKpis([point({ maxAllowable: null })]).latest?.maxAllowable).toBeNull();
    expect(mechanicalKpis([point({ maxAllowable: 180 })]).latest?.maxAllowable).toBe(
      180
    );

    // Reader keeps stored-or-null only: no `?? 80` / `?? 180` fabrication.
    expect(seriesSrc).not.toMatch(/maxAllowable[\s\S]{0,80}\?\?\s*\d/);
    expect(seriesSrc).not.toMatch(/max_allowable_limit[\s\S]{0,60}\?\?\s*\d/);
    expect(trendSrc).toContain(
      "const hasStoredMaxAllowable = latestThermoChart?.maxAllowable != null;"
    );
  });

  it("renders the threshold line and subtitle claim only when a limit is stored", () => {
    expect(trendSrc).toContain("{hasStoredMaxAllowable && latestThermoChart?.maxAllowable != null && (");
    expect(trendSrc).toContain(
      'hasStoredMaxAllowable ? " · max allowable threshold" : ""'
    );
    // The old unconditional subtitle promise is gone.
    expect(trendSrc).not.toContain(
      "ambient reference · max allowable threshold (${thermoDisplayUnit})"
    );
  });
});

describe("SLICE-Y unit routing on the mechanical tab", () => {
  it("derives the subtitle unit from the shared preference, never a literal °F", () => {
    expect(mechanicalBlock.length).toBeGreaterThan(0);
    expect(mechanicalBlock).not.toContain("(°F)");
    expect(mechanicalBlock).not.toContain("(°C)");
    expect(mechanicalBlock).toContain("(${thermoDisplayUnit})");
    expect(mechanicalBlock).toContain(
      "${mechCreepRate}${thermoDisplayUnit}/day"
    );
  });

  it("projects measured absolutes affinely and ΔT/rates by scale only", () => {
    expect(trendSrc).toContain("maxAllowable: absolute(point.maxAllowable, from)");
    expect(trendSrc).toContain(
      "refractorySkinTemp: absolute(point.refractorySkinTemp, from)"
    );
    // Reference temps are intentionally raw: they never enter this path.
    expect(trendSrc).not.toContain(
      "ambientReferenceTemp: absolute(point.ambientReferenceTemp, from)"
    );
    expect(trendSrc).toContain(
      "thermalGradient: difference(point.thermalGradient, from)"
    );
    expect(trendSrc).toContain(
      "thermalDissipationRate: difference(point.thermalDissipationRate, from)"
    );
    expect(trendSrc).toContain(
      "convertTemperatureDelta(value, from, thermoDisplayUnit)"
    );
    // Mechanical deltas are fitted on raw stored values, then scaled.
    expect(trendSrc).toContain("mechKpis.deDeltaAmbient");
    expect(trendSrc).toContain("thermoReferenceUnit");
    expect(trendSrc).toContain("const mechKpis = mechanicalKpis(thermoChartSeries);");
  });
});

describe("SLICE-Y thermal creep slope", () => {
  it("fits a true least-squares dT/day on three distinct-date skin points", () => {
    const series = [
      point({
        timestamp: localIso(2026, 9, 1, 8, 0),
        refractorySkinTemp: 100
      }),
      point({
        timestamp: localIso(2026, 9, 2, 8, 0),
        refractorySkinTemp: 110
      }),
      point({
        timestamp: localIso(2026, 9, 3, 8, 0),
        refractorySkinTemp: 120
      })
    ];
    const kpis = mechanicalKpis(series);
    expect(kpis.creepDistinctDates).toBe(3);
    expect(kpis.creepRatePerDay).toBeCloseTo(10, 10);
  });

  it("keeps N/A on the demo's two-point one-minute snapshot", () => {
    const series = [
      point({
        timestamp: localIso(2026, 9, 30, 16, 33),
        refractorySkinTemp: 150
      }),
      point({
        timestamp: localIso(2026, 9, 30, 16, 34),
        refractorySkinTemp: 190
      })
    ];
    const plan = planThermoTrendAxis(series);
    expect(plan.snapshot).toBe(true);
    expect(plan.spanMs).toBe(60_000);
    expect(plan.spanMs).toBeLessThan(SAME_DATE_SNAPSHOT_SPAN_MS);

    const kpis = mechanicalKpis(series);
    expect(kpis.creepDistinctDates).toBe(1);
    expect(kpis.creepRatePerDay).toBeNull();
  });

  it("requires distinct dates, not merely three rows on one day", () => {
    const series = [
      point({
        timestamp: localIso(2026, 9, 30, 8, 0),
        refractorySkinTemp: 100
      }),
      point({
        timestamp: localIso(2026, 9, 30, 12, 0),
        refractorySkinTemp: 120
      }),
      point({
        timestamp: localIso(2026, 9, 30, 16, 0),
        refractorySkinTemp: 140
      })
    ];
    expect(mechanicalKpis(series).creepDistinctDates).toBe(1);
    expect(mechanicalKpis(series).creepRatePerDay).toBeNull();
  });

  it("scales the slope by the temperature unit ratio, never by an offset", () => {
    const celsius = linearSlopePerDay([
      { ms: 0, value: 100 },
      { ms: 86_400_000, value: 110 },
      { ms: 2 * 86_400_000, value: 120 }
    ]);
    const fahrenheit = linearSlopePerDay([
      { ms: 0, value: 212 },
      { ms: 86_400_000, value: 230 },
      { ms: 2 * 86_400_000, value: 248 }
    ]);
    expect(celsius).toBeCloseTo(10, 10);
    expect(fahrenheit).toBeCloseTo(18, 10);
    expect(fahrenheit).not.toBeCloseTo(10 + 32, 10);
  });

  it("gates the regression and reuses J2's sparse helper text", () => {
    expect(seriesSrc).toContain(
      "creepDistinctDates >= 3 ? linearSlopePerDay(skinPoints) : null"
    );
    expect(mechanicalBlock).toContain("SPARSE_TREND_HELPER_TEXT");
    expect(seriesSrc).not.toContain(
      "Additional historical readings required to plot trend slope"
    );
  });
});

describe("SLICE-Y friction class provenance", () => {
  it("displays a stored class and never derives one from a fault name", () => {
    const [stored] = buildThermoChartSeries([
      row({ peakExtras: { frictional_severity: "Class 2 — Moderate" } })
    ]);
    expect(stored.frictionalSeverity).toBe("Class 2 — Moderate");

    const [faultOnly] = buildThermoChartSeries([
      row({ primaryFault: "Bearing defect", peakExtras: {} })
    ]);
    expect(faultOnly.frictionalSeverity).toBeNull();
    expect(faultOnly.frictionalAnomaly).toBeNull();
  });

  it("keeps the null trio absent a stored class and never reuses the inverted IR brackets", () => {
    expect(mechanicalBlock).toContain("NOT_REPORTED");
    expect(mechanicalBlock).toContain("NOT_DETECTED");
    expect(mechanicalBlock).toContain("No stored friction flag reported");
    expect(mechanicalBlock).not.toContain("IR_PP_BRACKETS");
    expect(mechanicalBlock).not.toContain("IR_PA_BRACKETS");
    expect(mechanicalBlock).not.toContain("evaluateIrSeverity");
    expect(mechanicalBlock).not.toContain("Class 1 — Critical");
    expect(seriesSrc).not.toContain("IR_PP_BRACKETS");
    expect(seriesSrc).not.toContain("IR_PA_BRACKETS");

    // Guard the trap itself: the dictionary's ΔT brackets do invert severity.
    const bracketBlock = dictSrc.slice(
      dictSrc.indexOf("export const IR_PP_BRACKETS"),
      dictSrc.indexOf("export function evaluateIrSeverity")
    );
    expect(bracketBlock).toContain("Class 1 — Critical");
    expect(bracketBlock).toMatch(/minDegC: 15, maxDegC: Infinity/);
  });
});

describe("SLICE-Y ambient delta series", () => {
  it("computes skin − ambient only when both are stored", () => {
    expect(
      skinAmbientDelta({
        refractorySkinTemp: 150,
        skinTemp: null,
        ambientReferenceTemp: 70
      })
    ).toBe(80);
    expect(
      skinAmbientDelta({
        refractorySkinTemp: null,
        skinTemp: 120,
        ambientReferenceTemp: 60
      })
    ).toBe(60);
    expect(
      skinAmbientDelta({
        refractorySkinTemp: 150,
        skinTemp: null,
        ambientReferenceTemp: null
      })
    ).toBeNull();
  });

  it("plots the derived series and converts the difference by scale only", () => {
    expect(trendSrc).toContain('dataKey="skinAmbientDelta"');
    expect(trendSrc).toContain("Skin - Ambient ΔT (derived)");
    expect(trendSrc).toContain("hasSkinAmbientDeltaSeries");

    // 150°C vs 70°C is an 80°C difference = 144°F. The absolute offset must
    // not appear in a difference.
    expect(convertTemperatureDelta(80, "°C", "°F")).toBeCloseTo(144, 10);
    expect(convertTemperatureDelta(80, "°C", "°F")).not.toBe(176);
  });
});

describe("SLICE-Y KPI null honesty", () => {
  it("returns null for every absent KPI without a default", () => {
    const kpis = mechanicalKpis([point()]);
    expect(kpis.latest?.deBearing).toBeNull();
    expect(kpis.deDeltaAmbient).toBeNull();
    expect(kpis.odeDeltaAmbient).toBeNull();
    expect(kpis.creepRatePerDay).toBeNull();
    expect(kpis.latest?.maxAllowable).toBeNull();
    expect(kpis.latest?.frictionalSeverity).toBeNull();
    expect(kpis.latest?.frictionalAnomaly).toBeNull();
  });

  it("renders the explicit null trio rather than a numeric or text fallback", () => {
    expect(mechanicalBlock).toContain("NOT_MEASURED");
    expect(mechanicalBlock).toContain("NOT_REPORTED");
    expect(mechanicalBlock).not.toMatch(/mechKpis\.[A-Za-z]+\s*\?\?\s*0/);
    expect(seriesSrc).not.toMatch(/frictionalSeverity[\s\S]{0,80}\|\|\s*"/);
    expect(seriesSrc).not.toContain("bearing defect|lubrication|binding|misalignment");
  });
});

describe("SLICE-Y regression guardrails", () => {
  it("keeps the shared window predicate and same-date snapshot behavior", () => {
    expect(trendSrc).toContain("windowTrendByTimeRange(thermoAnalyses, timeRange)");
    expect(trendSrc).toContain("buildThermoChartSeries(windowedThermoAnalyses)");
    expect(seriesSrc).toContain("SAME_DATE_SNAPSHOT_SPAN_MS");

    const series = [
      point({ timestamp: localIso(2026, 9, 30, 16, 33) }),
      point({ timestamp: localIso(2026, 9, 30, 16, 34) })
    ];
    const plan = planThermoTrendAxis(series);
    expect(plan.sameDate).toBe(true);
    expect(plan.dataKey).toBe("dateLabel");
    expect(plan.snapshot).toBe(true);
  });
});
