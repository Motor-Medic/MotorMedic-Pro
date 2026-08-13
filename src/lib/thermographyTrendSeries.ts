/**
 * Thermography Trend Analyzer — extract chart series from saved analysis_results.
 * No mock points: missing fields stay null; empty arrays when no thermography rows.
 */

import type { SavedAnalysisResult } from "./analysisPersistence";

export type ThermoChartPoint = {
  date: string;
  timestamp: string;
  // Tab 1 — Hotspot & NETA
  hotspot: number | null;
  reference: number | null;
  deltaT: number | null;
  severityClass: number | null; // 1–4 step
  severityLabel: string | null;
  // Tab 2 — Phase / I²R
  phaseA: number | null;
  phaseB: number | null;
  phaseC: number | null;
  loadPercent: number | null;
  i2rDelta: number | null;
  /** I²R-normalized ΔT projected to 100% load (when stored). */
  i2rNormalizedDelta: number | null;
  currentAmps: number | null;
  ratedAmps: number | null;
  loadThreshold: 40; // NFPA reference line (constant, not mock data)
  // Tab 3 — Radiometric
  emissivity: number | null;
  scaleMin: number | null;
  scaleMax: number | null;
  isothermThreshold: number | null;
  boxAverage: number | null;
  reflectedApparentTemp: number | null;
  // Tab 4 — Mechanical
  deBearing: number | null;
  odeBearing: number | null;
  skinTemp: number | null;
  refractorySkinTemp: number | null;
  ambientReferenceTemp: number | null;
  maxAllowable: number | null;
  thermalGradient: number | null;
  thermalDissipationRate: number | null;
  frictionalSeverity: string | null;
  frictionalAnomaly: boolean;
};

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function asText(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function formatDate(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function parseConsensusBlob(
  row: SavedAnalysisResult
): Record<string, unknown> {
  const cd = row.consensus_details;
  if (!cd || typeof cd !== "object") return {};
  const rec = cd as Record<string, unknown>;
  // Prefer nested rich payload if already objects
  if (rec.extracted_data || rec.analysis) return rec;
  const raw = rec.refereeDebateSummary;
  if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return rec;
    }
  }
  return rec;
}

function thermoPeakObj(row: SavedAnalysisResult): Record<string, unknown> {
  const peaks = Array.isArray(row.peaks) ? row.peaks : [];
  for (const raw of peaks) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (String(p.type || "").toLowerCase() === "thermography") return p;
  }
  // Fallback: first object peak
  for (const raw of peaks) {
    if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  }
  return {};
}

/** Map NETA / NFPA class labels + API severity → 1–4 for step chart. */
export function severityClassToLevel(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.round(raw);
    return n >= 1 && n <= 4 ? n : null;
  }
  const s = String(raw).toUpperCase();
  if (s.includes("CLASS 4") || s === "CRITICAL") return 4;
  if (s.includes("CLASS 3") || s === "HIGH") return 3;
  if (s.includes("CLASS 2") || s === "MEDIUM" || s === "ANOMALY" || s === "WARNING")
    return 2;
  if (s.includes("CLASS 1") || s === "LOW" || s === "NORMAL") return 1;
  const m = s.match(/CLASS\s*([1-4])/);
  if (m) return Number(m[1]);
  return null;
}

function deepNum(
  obj: Record<string, unknown> | null | undefined,
  paths: string[]
): number | null {
  if (!obj) return null;
  for (const path of paths) {
    const parts = path.split(".");
    let cur: unknown = obj;
    for (const part of parts) {
      if (!cur || typeof cur !== "object") {
        cur = undefined;
        break;
      }
      cur = (cur as Record<string, unknown>)[part];
    }
    const n = num(cur);
    if (n != null) return n;
  }
  return null;
}

function deepText(
  obj: Record<string, unknown> | null | undefined,
  paths: string[]
): string | null {
  if (!obj) return null;
  for (const path of paths) {
    const parts = path.split(".");
    let cur: unknown = obj;
    for (const part of parts) {
      if (!cur || typeof cur !== "object") {
        cur = undefined;
        break;
      }
      cur = (cur as Record<string, unknown>)[part];
    }
    const t = asText(cur);
    if (t) return t;
  }
  return null;
}

/** Expand one analysis_results row into chart fields (null when absent). */
export function extractThermoChartFields(
  row: SavedAnalysisResult
): ThermoChartPoint {
  const peak = thermoPeakObj(row);
  const blob = parseConsensusBlob(row);
  const extracted =
    blob.extracted_data && typeof blob.extracted_data === "object"
      ? (blob.extracted_data as Record<string, unknown>)
      : null;
  const analysis =
    blob.analysis && typeof blob.analysis === "object"
      ? (blob.analysis as Record<string, unknown>)
      : null;

  const severityLabel =
    asText(peak.severity_class) ||
    deepText(analysis, ["severity_class", "severity_level"]) ||
    asText(row.severity) ||
    null;
  const severityClass =
    severityClassToLevel(peak.severity_class) ??
    severityClassToLevel(deepText(analysis, ["severity_class", "severity_level"])) ??
    severityClassToLevel(row.severity);

  const hotspot =
    num(peak.hotspot_temp) ??
    deepNum(extracted, ["hotspot_temperature", "hotspot_temp", "max_temp"]);
  const reference =
    num(peak.reference_temp) ??
    deepNum(extracted, ["reference_temperature", "reference_temp", "ambient_temp"]);
  const deltaT =
    num(peak.delta_t) ??
    deepNum(analysis, ["delta_t.value", "delta_t"]) ??
    (hotspot != null && reference != null
      ? Math.round((hotspot - reference) * 10) / 10
      : null);

  return {
    date: formatDate(row.timestamp || row.created_at),
    timestamp: row.timestamp || row.created_at || "",
    hotspot,
    reference,
    deltaT,
    severityClass,
    severityLabel,
    phaseA:
      num(peak.phase_a_temp) ??
      deepNum(extracted, ["phase_a_temp", "phase_a", "phaseA"]),
    phaseB:
      num(peak.phase_b_temp) ??
      deepNum(extracted, ["phase_b_temp", "phase_b", "phaseB"]),
    phaseC:
      num(peak.phase_c_temp) ??
      deepNum(extracted, ["phase_c_temp", "phase_c", "phaseC"]),
    loadPercent:
      num(peak.load_percentage) ??
      deepNum(extracted, ["load_percentage", "load_percent", "load"]) ??
      deepNum(analysis, ["load_percentage", "load_percent"]),
    i2rDelta:
      num(peak.calculated_i2r_delta) ??
      deepNum(analysis, ["i2r_delta", "calculated_i2r_delta"]),
    i2rNormalizedDelta:
      num(peak.i2r_normalized_delta_t) ??
      num(peak.normalized_delta_t) ??
      deepNum(analysis, [
        "i2r_normalized_delta_t",
        "normalized_delta_t",
        "delta_t_at_full_load"
      ]),
    currentAmps:
      num(peak.current_amps) ??
      deepNum(extracted, ["current_amps", "amperage", "amps"]),
    ratedAmps:
      num(peak.rated_amps) ??
      deepNum(extracted, ["rated_amps", "fla", "full_load_amps"]),
    loadThreshold: 40,
    emissivity:
      num(peak.emissivity) ??
      num(peak.emissivity_setting) ??
      deepNum(extracted, ["emissivity", "emissivity_setting", "epsilon"]),
    scaleMin:
      num(peak.scale_min) ??
      deepNum(extracted, ["scale_min", "palette_min", "temp_scale_min"]),
    scaleMax:
      num(peak.scale_max) ??
      deepNum(extracted, ["scale_max", "palette_max", "temp_scale_max"]),
    isothermThreshold:
      num(peak.isotherm_threshold) ??
      deepNum(extracted, ["isotherm_threshold", "isotherm"]) ??
      deepNum(analysis, ["isotherm_threshold"]),
    boxAverage:
      num(peak.box_average_temp) ??
      num(peak.box_avg_temp) ??
      deepNum(extracted, [
        "box_average_temp",
        "box_avg_temp",
        "box_avg",
        "area_avg"
      ]),
    reflectedApparentTemp:
      num(peak.reflected_apparent_temp) ??
      deepNum(extracted, [
        "reflected_apparent_temp",
        "reflected_temp",
        "reflectedApparentTemp"
      ]),
    deBearing:
      num(peak.de_bearing_temp) ??
      deepNum(extracted, ["de_bearing_temp", "bearing_de", "de_temp"]),
    odeBearing:
      num(peak.ode_bearing_temp) ??
      deepNum(extracted, [
        "ode_bearing_temp",
        "nde_bearing_temp",
        "bearing_nde",
        "ode_temp"
      ]),
    skinTemp:
      num(peak.skin_temp) ??
      deepNum(extracted, ["skin_temp", "housing_temp", "case_temp"]),
    refractorySkinTemp:
      num(peak.refractory_skin_temp) ??
      deepNum(extracted, ["refractory_skin_temp", "lagging_temp", "shell_temp"]) ??
      num(peak.skin_temp) ??
      deepNum(extracted, ["skin_temp", "housing_temp"]),
    ambientReferenceTemp:
      num(peak.ambient_reference_temp) ??
      deepNum(extracted, [
        "ambient_reference_temp",
        "ambient_temp",
        "reference_temperature"
      ]) ??
      num(peak.reference_temp),
    maxAllowable:
      num(peak.max_allowable_limit) ??
      deepNum(analysis, ["max_allowable_limit", "alarm_limit", "limit_temp"]),
    thermalGradient:
      num(peak.thermal_gradient) ??
      deepNum(analysis, ["thermal_gradient", "gradient"]),
    thermalDissipationRate:
      num(peak.thermal_dissipation_rate) ??
      deepNum(analysis, [
        "thermal_dissipation_rate",
        "creep_rate",
        "temp_rise_rate"
      ]),
    frictionalSeverity:
      asText(peak.frictional_severity) ??
      deepText(analysis, [
        "frictional_severity",
        "iso_18434_severity",
        "mechanical_severity"
      ]) ??
      (String(row.primary_fault || "")
        .toLowerCase()
        .match(/friction|bearing|misalignment|lubrication|binding/)
        ? asText(row.severity) || asText(row.primary_fault)
        : null),
    frictionalAnomaly: Boolean(
      peak.frictional_anomaly === true ||
        analysis?.frictional_anomaly === true ||
        /friction|bearing defect|lubrication|binding|misalignment/i.test(
          String(row.primary_fault || "")
        )
    )
  };
}

/** Chronological series for charts (oldest → newest). */
export function buildThermoChartSeries(
  rows: SavedAnalysisResult[]
): ThermoChartPoint[] {
  return [...rows]
    .slice()
    .reverse()
    .map(extractThermoChartFields);
}

export function seriesHasAny(
  series: ThermoChartPoint[],
  keys: (keyof ThermoChartPoint)[]
): boolean {
  return series.some((pt) =>
    keys.some((k) => {
      const v = pt[k];
      return typeof v === "number" && Number.isFinite(v);
    })
  );
}

/** Hottest phase among A/B/C for KPI card — nulls when no phase temps. */
export function hottestPhaseFromPoint(
  pt: ThermoChartPoint | null
): { phase: "A" | "B" | "C"; temp: number } | null {
  if (!pt) return null;
  const candidates: { phase: "A" | "B" | "C"; temp: number }[] = [];
  if (pt.phaseA != null) candidates.push({ phase: "A", temp: pt.phaseA });
  if (pt.phaseB != null) candidates.push({ phase: "B", temp: pt.phaseB });
  if (pt.phaseC != null) candidates.push({ phase: "C", temp: pt.phaseC });
  if (!candidates.length) return null;
  return candidates.reduce((best, cur) => (cur.temp > best.temp ? cur : best));
}

export function nfpaClassBadge(pt: ThermoChartPoint | null): {
  label: string;
  className: string;
} {
  const level = pt?.severityClass;
  if (level === 4) {
    return {
      label: pt?.severityLabel || "Class 4",
      className: "bg-red-500/20 border-red-500/40 text-red-400"
    };
  }
  if (level === 3) {
    return {
      label: pt?.severityLabel || "Class 3",
      className: "bg-orange-500/20 border-orange-500/40 text-orange-400"
    };
  }
  if (level === 2) {
    return {
      label: pt?.severityLabel || "Class 2",
      className: "bg-yellow-500/20 border-yellow-500/40 text-yellow-400"
    };
  }
  if (level === 1) {
    return {
      label: pt?.severityLabel || "Class 1",
      className: "bg-green-500/20 border-green-500/40 text-green-400"
    };
  }
  if (pt?.severityLabel) {
    return {
      label: pt.severityLabel,
      className: "bg-slate-800 border-slate-600 text-slate-300"
    };
  }
  return {
    label: "N/A",
    className: "bg-slate-800 border-slate-700 text-slate-500"
  };
}

/** Radiometric KPI helpers — first scan with ε is asset baseline; no invented values. */
export function radiometricKpis(series: ThermoChartPoint[]): {
  latest: ThermoChartPoint | null;
  baselineEmissivity: number | null;
  emissivityDrift: boolean;
  paletteSpan: number | null;
} {
  const latest = series.length ? series[series.length - 1] : null;
  const baseline =
    series.find((p) => p.emissivity != null)?.emissivity ?? null;
  const current = latest?.emissivity ?? null;
  const emissivityDrift =
    baseline != null &&
    current != null &&
    Math.abs(current - baseline) > 0.02;
  const paletteSpan =
    latest?.scaleMax != null && latest?.scaleMin != null
      ? Math.round((latest.scaleMax - latest.scaleMin) * 10) / 10
      : null;
  return {
    latest,
    baselineEmissivity: baseline,
    emissivityDrift,
    paletteSpan
  };
}

/** Mechanical / refractory KPI helpers — only from real series points. */
export function mechanicalKpis(series: ThermoChartPoint[]): {
  latest: ThermoChartPoint | null;
  deDeltaAmbient: number | null;
  odeDeltaAmbient: number | null;
  creepRatePerDay: number | null;
  creepAccelerating: boolean | null;
} {
  const latest = series.length ? series[series.length - 1] : null;
  const ambient = latest?.ambientReferenceTemp ?? null;
  const deDeltaAmbient =
    latest?.deBearing != null && ambient != null
      ? Math.round((latest.deBearing - ambient) * 10) / 10
      : null;
  const odeDeltaAmbient =
    latest?.odeBearing != null && ambient != null
      ? Math.round((latest.odeBearing - ambient) * 10) / 10
      : null;

  // Creep from last two points that have a mechanical temp + timestamp
  const withTemp = series.filter(
    (p) =>
      p.timestamp &&
      (p.deBearing != null ||
        p.odeBearing != null ||
        p.refractorySkinTemp != null ||
        p.skinTemp != null)
  );
  let creepRatePerDay: number | null = null;
  let creepAccelerating: boolean | null = null;
  if (withTemp.length >= 2) {
    const a = withTemp[withTemp.length - 2];
    const b = withTemp[withTemp.length - 1];
    const pick = (p: ThermoChartPoint) =>
      p.deBearing ?? p.refractorySkinTemp ?? p.skinTemp ?? p.odeBearing;
    const ta = pick(a);
    const tb = pick(b);
    const t0 = new Date(a.timestamp).getTime();
    const t1 = new Date(b.timestamp).getTime();
    if (
      ta != null &&
      tb != null &&
      Number.isFinite(t0) &&
      Number.isFinite(t1) &&
      t1 > t0
    ) {
      const days = (t1 - t0) / (1000 * 60 * 60 * 24);
      if (days > 0) {
        creepRatePerDay = Math.round(((tb - ta) / days) * 100) / 100;
        // Acceleration only if ≥3 points with prior segment
        if (withTemp.length >= 3) {
          const z = withTemp[withTemp.length - 3];
          const tz = pick(z);
          const tZ = new Date(z.timestamp).getTime();
          if (tz != null && Number.isFinite(tZ) && t0 > tZ) {
            const days0 = (t0 - tZ) / (1000 * 60 * 60 * 24);
            if (days0 > 0) {
              const prevRate = (ta - tz) / days0;
              creepAccelerating = creepRatePerDay > prevRate + 0.05;
            }
          }
        }
      }
    }
  } else if (latest?.thermalDissipationRate != null) {
    creepRatePerDay = latest.thermalDissipationRate;
  }

  return {
    latest,
    deDeltaAmbient,
    odeDeltaAmbient,
    creepRatePerDay,
    creepAccelerating
  };
}
