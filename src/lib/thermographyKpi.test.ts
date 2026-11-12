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
  netaRepairWindowForStoredClass,
  nfpaClassBadge,
  radiometricKpis,
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

const serverSrc = readFileSync(
  fileURLToPath(new URL("../../server.ts", import.meta.url)),
  "utf8"
);

const diagnoseSrc = readFileSync(
  fileURLToPath(new URL("../components/Diagnose.tsx", import.meta.url)),
  "utf8"
);

const thermoReportSrc = readFileSync(
  fileURLToPath(
    new URL("../components/reports/ThermographyResultsTab.tsx", import.meta.url)
  ),
  "utf8"
);

const prognosticsSrc = readFileSync(
  fileURLToPath(
    new URL("../components/reports/prognosticsResolvers.ts", import.meta.url)
  ),
  "utf8"
);

const fusionSrc = readFileSync(
  fileURLToPath(new URL("./diagnostics/sensorFusion.ts", import.meta.url)),
  "utf8"
);

const summarySrc = readFileSync(
  fileURLToPath(new URL("./reports/technologySummary.ts", import.meta.url)),
  "utf8"
);

const exportSrc = readFileSync(
  fileURLToPath(new URL("./reportExport.ts", import.meta.url)),
  "utf8"
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

describe("SLICE-VS7 emissivity + ambient pill (stored units)", () => {
  it("renders stored emissivity and reference temperature without conversion", () => {
    const pt = point({
      emissivity: 0.92,
      ambientReferenceTemp: 20,
      reference: 72,
      tempUnit: "°C"
    });

    expect(thermoEmissivityAmbientPill(pt, "°C")).toBe(
      "Emissivity: 0.92 | Ambient/Ref: 20°C"
    );
    // The display preference never touches a reference temperature.
    expect(thermoEmissivityAmbientPill(pt, "°F")).toBe(
      "Emissivity: 0.92 | Ambient/Ref: 20°C"
    );
  });

  it("keeps a stored ambient even when emissivity is absent", () => {
    const pt = point({
      emissivity: null,
      ambientReferenceTemp: 72,
      tempUnit: "°F"
    });
    expect(thermoEmissivityAmbientPill(pt, "°F")).toBe(
      "Emissivity: Not measured | Ambient/Ref: 72°F"
    );
    expect(thermoEmissivityAmbientPill(pt, "°F")).not.toContain("0.95");
  });

  it("omits the pill only when both emissivity and ambient are absent", () => {
    expect(thermoEmissivityAmbientPill(point(), "°F")).toBeNull();
    expect(thermoEmissivityAmbientPill(null, "°F")).toBeNull();
    expect(
      thermoEmissivityAmbientPill(
        point({ emissivity: null, ambientReferenceTemp: null, reference: null }),
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

  it("falls back to the stored reference temperature in its stored unit", () => {
    const pt = point({
      emissivity: 0.88,
      ambientReferenceTemp: null,
      reference: 72,
      tempUnit: "°F"
    });
    expect(thermoEmissivityAmbientPill(pt, "°F")).toBe(
      "Emissivity: 0.88 | Ambient/Ref: 72°F"
    );
    // Even with a °C fallback, the run was saved in °F and is shown as such.
    expect(thermoEmissivityAmbientPill(pt, "°C")).toBe(
      "Emissivity: 0.88 | Ambient/Ref: 72°F"
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

describe("SLICE-VS7 parked I²R projection formatter", () => {
  it("keeps real magnitude: no false 2-dp precision and no fake zero", () => {
    // (15/180)² × 2.3 = 0.015972… — a real computed projection.
    expect(formatTemperatureProjection(0.015972222222222222, "°C")).toBe(
      "0.016°C"
    );
    expect(formatTemperatureProjection(0.015972222222222222, "°C")).not.toBe(
      "0.02°C"
    );
    const tiny = formatTemperatureProjection(0.0098765, "°C");
    expect(tiny).toBe("0.00988°C");
    expect(tiny).not.toBe("0.01°C");
    expect(tiny).not.toBe("0°C");
    expect(tiny).not.toBe("0.00°C");
    expect(formatTemperatureProjection(0.00004, "°C")).toBe(
      `<${PROJECTION_DISPLAY_FLOOR}°C`
    );
    expect(formatTemperatureProjection(0, "°C")).toBe("0°C");
    expect(formatTemperatureProjection(null, "°C")).toBeNull();
  });

  it("is exported for verify scripts only — every UI/report consumer is parked", () => {
    // The formatter and projection field still exist in the library…
    expect(seriesSrc).toContain("formatTemperatureProjection");
    expect(seriesSrc).toContain("PARKED (SLICE-VS7)");
    // …but no rendered surface imports or renders the extrapolated figure.
    expect(trendSrc).not.toContain("formatTemperatureProjection");
    expect(trendSrc).not.toContain("i2rNormalizedDelta");
    expect(thermoReportSrc).not.toContain("loadNorm");
    expect(thermoReportSrc).not.toContain("i2r_normalized_delta_t");
    expect(prognosticsSrc).not.toContain("ir-i2r");
    expect(prognosticsSrc).not.toContain("i2r_normalized_delta_t");
    expect(fusionSrc).not.toContain("i2r_normalized_delta_t");
    expect(summarySrc).not.toContain("i2r_normalized_delta_t");
    expect(exportSrc).not.toContain("i2r_normalized_delta_t");
  });

  it("describes only the current measured ΔT, never a 100%-load forecast", () => {
    expect(trendSrc).toContain("Current I²R ΔT");
    expect(trendSrc).toContain("Current operating point, not a projection");
    expect(trendSrc).not.toContain("I²R-corrected rise @ 100% load");
    expect(trendSrc).not.toContain("Normalized ΔT Projection");
  });
});

describe("SLICE-W dual-axis unit compliance", () => {
  it("resolves the temperature axis while Load % and the load KPI stay raw", () => {
    expect(trendSrc).toContain("value: thermoTempAxisLabel");
    expect(trendSrc).toContain('value: "Load (%)"');
    expect(trendSrc).toContain("`${latestThermoChart.loadPercent}%`");
    expect(trendSrc).not.toContain('value: "Temperature (°C)"');
    // The load series is bound to the load axis, never the temperature axis.
    expect(trendSrc).toMatch(
      /yAxisId="load"[\s\S]{0,160}?dataKey="loadPercent"/
    );
  });
});

describe("SLICE-W same-date + windowing reuse", () => {
  it("Phase Delta shares the one axis plan and the one window predicate", () => {
    expect(trendSrc).toContain("planThermoTrendAxis(thermoChartSeries)");
    expect(trendSrc).toContain("dataKey={thermoAxisDataKey}");
    expect(trendSrc).toContain(
      "windowTrendByTimeRange(thermoAnalyses, timeRange)"
    );
    // Two call sites, one planner: the UE Bearings chart reuses the same J2
    // snapshot plan instead of forking a sparse-date check.
    expect((trendSrc.match(/planThermoTrendAxis\(/g) ?? []).length).toBe(2);
    expect((trendSrc.match(/filterTrendByTimeRange\(/g) ?? []).length).toBe(1);
  });
});

describe("SLICE-W single NETA source", () => {
  it("badge and repair matrix read the same stored class and omit together", () => {
    const badge = nfpaClassBadge(
      point({ severityClass: 3, severityLabel: "HIGH" })
    );
    expect(badge?.label).toBe(NETA_STORED_CLASS_REPAIR_WINDOW[3].classLabel);
    expect(netaRepairWindowForStoredClass(3)?.repairWindow).toBe(
      NETA_STORED_CLASS_REPAIR_WINDOW[3].repairWindow
    );

    // No stored class -> the badge returns null (omitted) just like the matrix.
    expect(
      nfpaClassBadge(point({ severityClass: null, severityLabel: "ANOMALY" }))
    ).toBeNull();
    expect(netaRepairWindowForStoredClass(null)).toBeNull();

    expect(trendSrc).toContain("nfpaClassBadge(latestThermoChart)");
    expect(trendSrc).toContain("netaRepairWindowForStoredClass(");
    expect(trendSrc).toContain("latestThermoChart?.severityClass");
    expect(trendSrc).not.toContain("evaluateIrSeverity");
  });
});

describe("SLICE-VS7 sub-40% adaptive projection is parked", () => {
  it("keeps only the descriptive load band, never a projected figure", () => {
    expect(PROJECTION_MIN_VALID_LOAD_PERCENT).toBe(40);
    expect(trendSrc).toContain("PROJECTION_MIN_VALID_LOAD_PERCENT");
    expect(trendSrc).toContain("y1: PROJECTION_MIN_VALID_LOAD_PERCENT");
    expect(trendSrc).not.toContain("projectionBelowValidity");
    expect(trendSrc).not.toContain("PROJECTION_LOW_LOAD_CAVEAT");
    expect(PROJECTION_LOW_LOAD_CAVEAT).toMatch(/below 40%/i);
  });
});

describe("SLICE-W phase-current schema verdict", () => {
  it("stores one measured amp figure, so no imbalance banner is fabricated", () => {
    const migrationSrc = readFileSync(
      fileURLToPath(
        new URL(
          "../../migrations/001_analysis_results_polymorphic_thermography.sql",
          import.meta.url
        )
      ),
      "utf8"
    );
    expect(migrationSrc).toContain("measured_amps");
    expect(migrationSrc).toContain("rated_amps");
    // Three per-phase CURRENTS were never stored — only phase TEMPERATURES.
    expect(migrationSrc).not.toMatch(/phase_[abc]_amp/i);

    const phaseBlock = trendSrc.slice(
      trendSrc.indexOf("TAB 2"),
      trendSrc.indexOf("TAB 3")
    );
    expect(phaseBlock.length).toBeGreaterThan(0);
    expect(phaseBlock).not.toMatch(/phase[-_ ]imbalance/i);
    // Cross-technology thermal <-> vibration fusion stays killed.
    expect(phaseBlock).not.toMatch(
      /BPFO|BPFI|loose connection correlates|impacts\/sec|MCSA|vibration/i
    );
  });
});

describe("SLICE-X radiometric baseline provenance", () => {
  it("uses the first stored run's emissivity, never a hardcoded value", () => {
    const series = [
      point({
        timestamp: "2026-10-01T12:00:00.000Z",
        emissivity: 0.91
      }),
      point({
        timestamp: "2026-10-02T12:00:00.000Z",
        emissivity: 0.74
      })
    ];
    const kpis = radiometricKpis(series);
    expect(kpis.baselineEmissivity).toBe(0.91);
    expect(kpis.latest?.emissivity).toBe(0.74);
    expect(kpis.emissivityDrift).toBe(true);

    expect(seriesSrc).toMatch(
      /series\.find\(\(p\) => p\.emissivity != null\)\?\.emissivity \?\? null/
    );
    expect(seriesSrc).not.toMatch(/baselineEmissivity\s*=\s*0\./);
    expect(seriesSrc).not.toMatch(/\?\?\s*0\.95/);
  });

  it("skips runs with no stored ε and takes the first that was saved", () => {
    const kpis = radiometricKpis([
      point({ emissivity: null }),
      point({ emissivity: 0.83 }),
      point({ emissivity: 0.83 })
    ]);
    expect(kpis.baselineEmissivity).toBe(0.83);
    expect(kpis.emissivityDrift).toBe(false);
  });
});

describe("SLICE-VS7 ROI + camera-setting null honesty", () => {
  it("keeps the ROI write path and shows Not measured without inventing a mean", () => {
    // Server mirrors the extracted ROI mean into ai_vision.
    expect(serverSrc).toMatch(/ai_vision:\s*\{/);
    expect(serverSrc).toMatch(
      /roiStatisticalMean:\s*pick\([\s\S]{0,220}?peak0\.roiStatisticalMean/
    );
    // Client save sends the same per-run ROI mean.
    expect(diagnoseSrc).toContain(
      "roi_statistical_mean: radiometric.roiStatisticalMean"
    );
    expect(diagnoseSrc).toContain(
      "roiStatisticalMean: radiometric.roiStatisticalMean"
    );
    expect(trendSrc).toContain("NOT_MEASURED");
    expect(trendSrc).not.toContain("Awaiting AI Extraction");
  });

  it("renders the null trio for absent camera state with no fallback default", () => {
    const kpis = radiometricKpis([point()]);
    expect(kpis.latest?.emissivity).toBeNull();
    expect(kpis.baselineEmissivity).toBeNull();
    expect(kpis.paletteConfigured).toBe(false);
    expect(kpis.isothermConfigured).toBe(false);
    expect(kpis.boxAverageConfigured).toBe(false);

    expect(trendSrc).toContain("radioKpis.latest?.emissivity != null");
    expect(trendSrc).toContain("radioKpis.paletteConfigured");
    expect(trendSrc).toContain("radioKpis.isothermConfigured");
    expect(trendSrc).toContain("radioKpis.boxAverageConfigured");
    expect(trendSrc).not.toMatch(/radioKpis\.latest\?\.emissivity \?\? 0\./);
    expect(trendSrc).not.toMatch(/baselineEmissivity \?\? 0\.95/);
    expect(new Set([NOT_MEASURED, NOT_REPORTED, NOT_DETECTED]).size).toBe(3);
    expect(THERMO_REF_TEMP_MISSING).toBe(
      "Reference temperature not recorded - radiometric analysis not available"
    );
  });
});

describe("SLICE-X radiometric axis clarity", () => {
  it("labels the left axis as temperature + active unit, never a mixed hedge", () => {
    expect(trendSrc).toMatch(
      /\{hasRadiometricTempSeries && \(\s*<YAxis[\s\S]{0,200}?yAxisId="temp"/
    );
    expect(trendSrc).toContain("value: thermoTempAxisLabel");
    expect(trendSrc).not.toContain("Calibration Parameters");
    expect(trendSrc).not.toContain("Calibration Parameter");
  });

  it("keeps ε dimensionless (0–1) on the right and never temp-converts it", () => {
    expect(trendSrc).toContain('value: "Emissivity (ε)"');
    expect(trendSrc).toMatch(
      /yAxisId="eps"[\s\S]{0,160}?domain=\{\[0, 1\]\}/
    );
    expect(trendSrc).toContain("hasEmissivitySeries &&");
    expect(trendSrc).not.toMatch(/emissivity:\s*(absolute|difference)\(/);
  });
});

describe("SLICE-VS7 reflected temperature stays in stored units", () => {
  it("stores T_ref per run and never routes it through the display conversion", () => {
    const series = buildThermoChartSeries([
      row({
        environmental: {
          environmental: { reflected_temp: 70, temp_unit: "°F" }
        }
      }),
      row({
        environmental: {
          environmental: { reflected_temp: 75, temp_unit: "°F" }
        }
      })
    ]);
    expect(
      series
        .map((p) => p.reflectedApparentTemp)
        .sort((a, b) => (a ?? 0) - (b ?? 0))
    ).toEqual([70, 75]);

    // T_ref is shown in KPI/notes in its stored unit, never on the temp axis.
    expect(trendSrc).toContain("Reflected: ${");
    expect(trendSrc).toContain("radioKpis.latest.reflectedApparentTemp");
    expect(trendSrc).toContain("(stored units)");
    expect(trendSrc).not.toContain('dataKey="reflectedApparentTemp"');
    expect(trendSrc).not.toContain(
      "reflectedApparentTemp: absolute(point.reflectedApparentTemp, from)"
    );

    const [absent] = buildThermoChartSeries([row()]);
    expect(absent.reflectedApparentTemp).toBeNull();
  });

  it("gates radiometric analysis when no reference temperature was recorded", () => {
    expect(trendSrc).toContain("THERMO_REF_TEMP_MISSING");
    expect(trendSrc).toContain("thermo-tref-gate");
    expect(THERMO_REF_TEMP_MISSING).toBe(
      "Reference temperature not recorded - radiometric analysis not available"
    );
    expect(thermoReportSrc).toContain("THERMO_REF_TEMP_MISSING");
  });
});

describe("SLICE-VS7 radiometric temperature routing", () => {
  it("routes measured ROI temps through the preference projection, refs stay raw", () => {
    expect(trendSrc).toContain(
      "boxAverage: absolute(point.boxAverage, from)"
    );
    expect(trendSrc).toContain(
      "isothermThreshold: absolute(point.isothermThreshold, from)"
    );
    expect(trendSrc).toContain("Box Avg: ${radioKpis.latest!.boxAverage}");
    // Reference temps never take an absolute/difference projection route.
    expect(trendSrc).not.toContain(
      "reflectedApparentTemp: absolute(point.reflectedApparentTemp, from)"
    );
    expect(trendSrc).not.toContain(
      "ambientReferenceTemp: absolute(point.ambientReferenceTemp, from)"
    );
    // ε and all ratio fields stay raw (no absolute/difference projection).
    expect(trendSrc).not.toMatch(/emissivity:\s*(absolute|difference)\(/);
    expect(trendSrc).toContain("thermo-unit-isolation-note");
    expect(trendSrc).toContain("concentration fields (ppm) never convert");
  });
});
