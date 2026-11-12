import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SavedAnalysisResult } from "./analysisPersistence";
import {
  NETA_STORED_CLASS_REPAIR_WINDOW,
  NOT_DETECTED,
  NOT_MEASURED,
  NOT_REPORTED,
  PROJECTION_DISPLAY_FLOOR,
  PROJECTION_LOW_LOAD_CAVEAT,
  PROJECTION_MIN_VALID_LOAD_PERCENT,
  THERMO_REF_TEMP_MISSING,
  buildThermoChartSeries,
  formatTemperatureProjection,
  mechanicalKpis,
  netaRepairWindowForStoredClass,
  planThermoTrendAxis,
  thermoEmissivityAmbientPill,
  type ThermoChartPoint
} from "./thermographyTrendSeries";
import {
  filterTrendByTimeRange,
  windowTrendByTimeRange
} from "./vibration/trendSeries";

const seriesSrc = readFileSync(
  fileURLToPath(new URL("./thermographyTrendSeries.ts", import.meta.url)),
  "utf8"
);
const trendSrc = readFileSync(
  fileURLToPath(new URL("../components/TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
);
const reportSrc = readFileSync(
  fileURLToPath(
    new URL("../components/reports/ThermographyResultsTab.tsx", import.meta.url)
  ),
  "utf8"
);

const displayProjectionBlock = trendSrc.slice(
  trendSrc.indexOf("Display-only projection. SLICE-VS7"),
  trendSrc.indexOf("const latestThermoChart")
);

function localIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): string {
  return new Date(year, month, day, hour, minute).toISOString();
}

function row(options: {
  id?: string;
  timestamp?: string;
  created_at?: string;
  tempUnit?: "°C" | "°F";
  peak?: Record<string, unknown>;
  environmental?: Record<string, unknown>;
  poly?: Record<string, unknown>;
} = {}): SavedAnalysisResult {
  return {
    id: options.id ?? "row-1",
    asset_id: "asset-1",
    component: null,
    timestamp: options.timestamp ?? "2026-10-30T12:00:00.000Z",
    ...(options.created_at ? { created_at: options.created_at } : {}),
    health_score: 80,
    primary_fault: null,
    fault_list: [],
    peaks: [
      {
        type: "thermography",
        hotspot_temp: null,
        reference_temp: null,
        delta_t: null,
        ...(options.peak ?? {})
      }
    ],
    spectrum_image_url: null,
    recommendations: [],
    financial_impact: {},
    severity: null,
    analysis_type: "thermography",
    telemetry_data: {
      ...(options.tempUnit ? { temp_unit: options.tempUnit } : {}),
      ...(options.environmental ?? {}),
      ...(options.poly ? { polymorphic: options.poly } : {})
    }
  };
}

describe("SLICE-VS7 I²R verdict", () => {
  it("parks the 100%-load projection and keeps only its audit formatter", () => {
    expect(PROJECTION_MIN_VALID_LOAD_PERCENT).toBe(40);
    expect(PROJECTION_LOW_LOAD_CAVEAT).toMatch(/below 40%/i);
    expect(PROJECTION_DISPLAY_FLOOR).toBe(0.0001);
    expect(formatTemperatureProjection(0.015972222222222222, "°C")).toBe(
      "0.016°C"
    );

    expect(seriesSrc).toContain("PARKED (SLICE-VS7)");
    expect(trendSrc).not.toContain("formatTemperatureProjection");
    expect(trendSrc).not.toContain("i2rNormalizedDelta");
    expect(trendSrc).toContain("Current I²R ΔT");
    expect(trendSrc).toContain("Current operating point, not a projection");
    expect(reportSrc).not.toContain("loadNorm");
  });
});

describe("SLICE-VS7 emissivity / ambient / NETA present-if-stored", () => {
  it("renders each stored reference field and marks only absent parts", () => {
    expect(
      thermoEmissivityAmbientPill(
        {
          emissivity: 0.92,
          reference: null,
          ambientReferenceTemp: 20,
          tempUnit: "°C"
        },
        "°F"
      )
    ).toBe("Emissivity: 0.92 | Ambient/Ref: 20°C");

    expect(
      thermoEmissivityAmbientPill(
        {
          emissivity: null,
          reference: 72,
          ambientReferenceTemp: null,
          tempUnit: "°F"
        },
        "°F"
      )
    ).toBe("Emissivity: Not measured | Ambient/Ref: 72°F");

    expect(
      thermoEmissivityAmbientPill(
        {
          emissivity: 0.8,
          reference: null,
          ambientReferenceTemp: null,
          tempUnit: "°C"
        },
        "°C"
      )
    ).toBe("Emissivity: 0.8 | Ambient/Ref: Not measured");
  });

  it("omits the pill only when both stored fields are absent", () => {
    expect(
      thermoEmissivityAmbientPill(
        {
          emissivity: null,
          reference: null,
          ambientReferenceTemp: null,
          tempUnit: null
        },
        "°F"
      )
    ).toBeNull();
  });

  it("renders the NETA matrix only from a stored class", () => {
    expect(netaRepairWindowForStoredClass(null)).toBeNull();
    expect(netaRepairWindowForStoredClass(2)).toEqual(
      NETA_STORED_CLASS_REPAIR_WINDOW[2]
    );
    expect(trendSrc).toContain("{netaRepairReference && (");
  });
});

describe("SLICE-VS7 T_ref gate", () => {
  it("uses the exact required copy when reference temperature is absent", () => {
    expect(THERMO_REF_TEMP_MISSING).toBe(
      "Reference temperature not recorded - radiometric analysis not available"
    );
    expect(trendSrc).toContain("THERMO_REF_TEMP_MISSING");
    expect(trendSrc).toContain("{!hasReflectedTempSeries && (");
    expect(reportSrc).toContain("THERMO_REF_TEMP_MISSING");
    expect(trendSrc).not.toMatch(/default reference|assume.*ambient/i);
  });
});

describe("SLICE-VS7 same-date determinism", () => {
  it("orders equal timestamps deterministically and labels runs per date", () => {
    const series = buildThermoChartSeries([
      row({ id: "b", timestamp: localIso(2026, 9, 30, 16, 34), peak: { hotspot_temp: 2 } }),
      row({ id: "a", timestamp: localIso(2026, 9, 30, 16, 33), peak: { hotspot_temp: 1 } }),
      row({ id: "c", timestamp: localIso(2026, 8, 15, 8, 0), peak: { hotspot_temp: 3 } })
    ]);
    expect(series.map((p) => p.hotspot)).toEqual([3, 1, 2]);
    expect(series.map((p) => p.dateLabel)).toEqual([
      "Sep 15",
      "Oct 30 · 1",
      "Oct 30 · 2"
    ]);
    expect(series.map((p) => p.sequence)).toEqual([1, 2, 3]);
    expect(planThermoTrendAxis(series).dataKey).toBe("dateLabel");
  });
});

describe("SLICE-VS7 unit isolation", () => {
  it("never converts ambient, T_ref or dimensionless emissivity", () => {
    expect(displayProjectionBlock).not.toContain(
      "ambientReferenceTemp: absolute(point.ambientReferenceTemp, from)"
    );
    expect(displayProjectionBlock).not.toContain(
      "reflectedApparentTemp: absolute(point.reflectedApparentTemp, from)"
    );
    expect(displayProjectionBlock).not.toMatch(
      /emissivity:\s*(absolute|difference)\(/
    );
    expect(trendSrc).not.toContain('dataKey="ambientReferenceTemp"');
    expect(trendSrc).not.toContain('dataKey="reflectedApparentTemp"');
    expect(trendSrc).toContain("thermo-unit-isolation-note");
  });

  it("isolates concentration fields (H2 ppm) from temperature conversion", () => {
    // No hydrogen field exists in the thermography model — only measured temps.
    expect(seriesSrc).not.toMatch(/\bhydrogen\b|\bH2\b|\bppm\b/i);
    // The only mention is the explicit "never convert" comment; no code path
    // reads a concentration field.
    expect(displayProjectionBlock).not.toMatch(
      /point\.(ppm|hydrogen|h2)\b|absolute\(point\.(ppm|hydrogen|h2)/i
    );
    expect(trendSrc).toContain("concentration fields (ppm) never convert");
  });

  it("computes mechanical deltas and creep from raw stored values", () => {
    const raw: ThermoChartPoint = {
      ...buildThermoChartSeries([
        row({
          tempUnit: "°C",
          peak: { de_bearing_temp: 70, ambient_reference_temp: 20 }
        })
      ])[0]
    };
    const kpis = mechanicalKpis([raw]);
    expect(kpis.deDeltaAmbient).toBe(50);
    expect(trendSrc).toContain("mechanicalKpis(thermoChartSeries)");
  });
});

describe("SLICE-VS7 null trio + windowing lockstep", () => {
  it("keeps three distinct absence labels and uses them in the UI", () => {
    expect(new Set([NOT_MEASURED, NOT_REPORTED, NOT_DETECTED]).size).toBe(3);
    expect(trendSrc).toContain("NOT_MEASURED");
    expect(trendSrc).toContain("NOT_REPORTED");
    expect(trendSrc).toContain("NOT_DETECTED");
  });

  it("shares one window predicate and one chart builder", () => {
    const now = Date.parse("2026-10-30T12:00:00.000Z");
    const rows = [
      row({ id: "recent", timestamp: "2026-10-29T00:00:00.000Z" }),
      row({ id: "old", timestamp: "2026-01-01T00:00:00.000Z" })
    ];
    for (const range of ["7D", "30D", "90D", "1Y"] as const) {
      expect(windowTrendByTimeRange(rows, range, now)).toEqual(
        filterTrendByTimeRange(rows, range, now)
      );
    }
    expect(trendSrc).toContain("windowTrendByTimeRange(thermoAnalyses, timeRange)");
    expect(trendSrc).toContain("buildThermoChartSeries(windowedThermoAnalyses)");
    expect((trendSrc.match(/data=\{thermoDisplaySeries\}/g) ?? []).length).toBe(4);
  });
});