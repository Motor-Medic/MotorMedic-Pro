import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SavedAnalysisResult } from "./analysisPersistence";
import {
  NETA_STORED_CLASS_REPAIR_WINDOW,
  buildThermoChartSeries,
  netaRepairWindowForStoredClass,
  thermoEmissivityAmbientPill,
  type ThermoChartPoint
} from "./thermographyTrendSeries";
import {
  convertTemperatureDelta,
  resolveTemperatureDisplayUnit
} from "./vibration/units";

const seriesSrc = readFileSync(
  fileURLToPath(new URL("./thermographyTrendSeries.ts", import.meta.url)),
  "utf8"
);

const trendSrc = readFileSync(
  fileURLToPath(new URL("../components/TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
);

const unitsSrc = readFileSync(
  fileURLToPath(new URL("./vibration/units.ts", import.meta.url)),
  "utf8"
);

function point(overrides: Partial<ThermoChartPoint> = {}): ThermoChartPoint {
  return {
    date: "Oct 30",
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
    frictionalAnomaly: false,
    tempUnit: null,
    ...overrides
  };
}

function row(
  options: {
    deltaT?: number | null;
    severityClass?: string | null;
    tempUnit?: "°C" | "°F";
    environmental?: Record<string, unknown>;
    peakExtras?: Record<string, unknown>;
  } = {}
): SavedAnalysisResult {
  return {
    id: "row-1",
    asset_id: "asset-1",
    component: null,
    timestamp: "2026-10-30T12:00:00.000Z",
    health_score: 80,
    primary_fault: null,
    fault_list: [],
    peaks: [
      {
        type: "thermography",
        hotspot_temp: null,
        reference_temp: null,
        delta_t: options.deltaT ?? null,
        severity_class: options.severityClass ?? null,
        ...(options.peakExtras ?? {})
      }
    ],
    spectrum_image_url: null,
    recommendations: [],
    financial_impact: {},
    severity: null,
    analysis_type: "thermography",
    telemetry_data: {
      ...(options.tempUnit ? { temp_unit: options.tempUnit } : {}),
      ...(options.environmental ?? {})
    }
  };
}

describe("SLICE-V emissivity + ambient pill", () => {
  it("renders stored emissivity and converts absolute ambient affinely", () => {
    const pt = point({
      emissivity: 0.92,
      ambientReferenceTemp: 20,
      reference: 72,
      tempUnit: "°C"
    });

    expect(thermoEmissivityAmbientPill(pt, "°C", "°C")).toBe(
      "Emissivity: 0.92 | Ambient/Ref: 20°C"
    );
    // 20°C absolute is 68°F — scale + offset, never the 36°F scale-only value.
    const fahrenheit = thermoEmissivityAmbientPill(pt, "°F", "°C");
    expect(fahrenheit).toBe("Emissivity: 0.92 | Ambient/Ref: 68°F");
    expect(fahrenheit).not.toContain("36");
  });

  it("omits the pill cleanly when emissivity was never stored", () => {
    expect(thermoEmissivityAmbientPill(point(), "°F", "°F")).toBeNull();
    expect(thermoEmissivityAmbientPill(null, "°F", "°F")).toBeNull();
    expect(
      thermoEmissivityAmbientPill(
        point({ emissivity: null, ambientReferenceTemp: 72, tempUnit: "°F" }),
        "°F",
        "°F"
      )
    ).toBeNull();
  });

  it("never defaults emissivity to 0.95 or guesses a target material", () => {
    const kpiStart = trendSrc.indexOf("Thermography KPI");
    const kpiBlock = trendSrc.slice(
      kpiStart,
      trendSrc.indexOf("ThermoChartFrame", kpiStart)
    );
    expect(kpiStart).toBeGreaterThan(-1);
    expect(seriesSrc).not.toContain("0.95");
    expect(kpiBlock).not.toContain("0.95");
    expect(seriesSrc).not.toMatch(/guessed|default material|assume material/i);
  });

  it("falls back to the stored reference temperature, still converted absolutely", () => {
    const pt = point({
      emissivity: 0.88,
      ambientReferenceTemp: null,
      reference: 72,
      tempUnit: "°F"
    });
    expect(thermoEmissivityAmbientPill(pt, "°F", "°F")).toBe(
      "Emissivity: 0.88 | Ambient/Ref: 72°F"
    );
    expect(thermoEmissivityAmbientPill(pt, "°C", "°F")).toBe(
      "Emissivity: 0.88 | Ambient/Ref: 22.2°C"
    );
  });
});

describe("SLICE-V NETA repair-priority matrix", () => {
  it("maps every stored class 1–4 to the canonical reference window", () => {
    expect(NETA_STORED_CLASS_REPAIR_WINDOW[1].repairWindow).toBe(
      "Monitor — routine re-inspection"
    );
    expect(NETA_STORED_CLASS_REPAIR_WINDOW[2].repairWindow).toBe(
      "Schedule repair within 30 days"
    );
    expect(NETA_STORED_CLASS_REPAIR_WINDOW[3].repairWindow).toBe(
      "Priority repair within 7 days"
    );
    expect(NETA_STORED_CLASS_REPAIR_WINDOW[4].repairWindow).toBe(
      "Immediate action required (24–48 hrs)"
    );
    for (const level of [1, 2, 3, 4] as const) {
      expect(netaRepairWindowForStoredClass(level)).toBe(
        NETA_STORED_CLASS_REPAIR_WINDOW[level]
      );
    }
  });

  it("omits the matrix row when the stored class is null or absent", () => {
    expect(netaRepairWindowForStoredClass(null)).toBeNull();
    expect(netaRepairWindowForStoredClass(undefined)).toBeNull();
    expect(netaRepairWindowForStoredClass(0)).toBeNull();
    expect(netaRepairWindowForStoredClass(5)).toBeNull();
    expect(netaRepairWindowForStoredClass(Number.NaN)).toBeNull();
  });

  it("keys off the stored class only — a ΔT-only asset yields no matrix row", () => {
    const [stored] = buildThermoChartSeries([
      row({ deltaT: 1, severityClass: "Class 3" })
    ]);
    expect(stored.severityClass).toBe(3);
    expect(netaRepairWindowForStoredClass(stored.severityClass)).toEqual(
      NETA_STORED_CLASS_REPAIR_WINDOW[3]
    );

    const [deltaOnly] = buildThermoChartSeries([
      row({ deltaT: 55, severityClass: null })
    ]);
    expect(deltaOnly.severityClass).toBeNull();
    expect(netaRepairWindowForStoredClass(deltaOnly.severityClass)).toBeNull();
  });

  it("renders from the stored severity class, never a ΔT re-derivation", () => {
    expect(trendSrc).toContain("netaRepairWindowForStoredClass(");
    expect(trendSrc).toContain("latestThermoChart?.severityClass");
    expect(trendSrc).not.toContain("evaluateIrSeverity");
    const matrixBlock = seriesSrc.slice(
      seriesSrc.indexOf("export const NETA_STORED_CLASS_REPAIR_WINDOW"),
      seriesSrc.indexOf("export type ThermoEmissivityAmbientSource")
    );
    expect(matrixBlock).not.toMatch(/deltaT/i);
  });
});

describe("SLICE-V deepest temperature fallback", () => {
  it("resolveTemperatureDisplayUnit defers to the stored unit, never hardcodes", () => {
    expect(resolveTemperatureDisplayUnit(undefined, "°F")).toBe("°F");
    expect(resolveTemperatureDisplayUnit(null, "°C")).toBe("°C");
    expect(resolveTemperatureDisplayUnit("°C", "°F")).toBe("°C");
    expect(unitsSrc).toMatch(
      /resolveTemperatureDisplayUnit\([\s\S]*?return preference \?\? storedUnit;/
    );
  });

  it("a run with neither environmental nor peak temp_unit stores null", () => {
    const [stored] = buildThermoChartSeries([row({ deltaT: 12 })]);
    expect(stored.tempUnit).toBeNull();
    // No unit is invented at the reader. The display preference resolver is
    // still fed an explicit stored unit by the caller, so it never guesses.
    expect(resolveTemperatureDisplayUnit(undefined, "°F")).toBe("°F");
  });

  it("card ΔT converts by ratio only, while absolute ambient takes the offset", () => {
    // The card's difference projection calls convertTemperatureDelta.
    expect(trendSrc).toContain("deltaT: difference(point.deltaT, from)");
    expect(trendSrc).toMatch(
      /convertTemperatureDelta\(value, from, thermoDisplayUnit\)/
    );
    expect(convertTemperatureDelta(30, "°C", "°F")).toBeCloseTo(54, 10);
    expect(convertTemperatureDelta(30, "°C", "°F")).not.toBe(86);
  });
});
