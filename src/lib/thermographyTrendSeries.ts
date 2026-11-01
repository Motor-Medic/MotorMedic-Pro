/**
 * Thermography Trend Analyzer — extract chart series from saved analysis_results.
 * No mock points: missing fields stay null; empty arrays when no thermography rows.
 */

import type { SavedAnalysisResult } from "./analysisPersistence";
import { convertAbsoluteTemperature } from "./vibration/units";

export type ThermoChartPoint = {
  date: string;
  /** HH:mm in the viewer's local timezone — used when runs share a date. */
  time: string;
  /** "Oct 30 16:33" — used when a series has both multiple dates and same-day runs. */
  dateTime: string;
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
  /** Operator / EXIF unit from telemetry_data.environmental.temp_unit when saved. */
  tempUnit: "°C" | "°F" | null;
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

/** Normalize stored unit strings to °C / °F. */
export function normalizeThermoTempUnit(raw: unknown): "°C" | "°F" | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, "");
  if (s === "°C" || s === "C" || s === "CELSIUS" || s === "DEGC" || s === "℃")
    return "°C";
  if (s === "°F" || s === "F" || s === "FAHRENHEIT" || s === "DEGF" || s === "℉")
    return "°F";
  return null;
}

/**
 * Active chart temperature unit: latest scan with an explicit unit, else heuristic
 * from displayed temps, else °F (Diagnose form default).
 */
export function resolveThermoTempUnit(
  series: ThermoChartPoint[]
): "°C" | "°F" {
  for (let i = series.length - 1; i >= 0; i--) {
    const u = series[i]?.tempUnit;
    if (u === "°C" || u === "°F") return u;
  }
  // Heuristic when older rows lack temp_unit (same idea as ThermographyResultsDashboard)
  for (let i = series.length - 1; i >= 0; i--) {
    const p = series[i];
    if (!p) continue;
    const sample =
      p.deBearing ??
      p.odeBearing ??
      p.refractorySkinTemp ??
      p.skinTemp ??
      p.ambientReferenceTemp ??
      p.hotspot ??
      p.reference;
    if (sample != null && Number.isFinite(sample)) {
      return sample > 0 && sample < 80 ? "°C" : "°F";
    }
  }
  return "°F";
}

function formatDate(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDate(ts)} ${formatTime(ts)}`;
}

function localDateKey(ts: string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
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

/** Hybrid JSONB blob from analysis_results.telemetry_data (object or JSON string). */
function telemetryDataBlob(row: SavedAnalysisResult): {
  root: Record<string, unknown>;
  environmental: Record<string, unknown>;
  aiVision: Record<string, unknown>;
  polymorphic: Record<string, unknown>;
} {
  let root: Record<string, unknown> = {};
  // Widened deliberately: the column is JSONB, but drivers and older rows can
  // hand this back as a JSON string, which the declared type does not admit.
  const raw: unknown = row.telemetry_data;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    root = raw as Record<string, unknown>;
  } else if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      root = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      root = {};
    }
  }
  const environmental =
    root.environmental && typeof root.environmental === "object"
      ? (root.environmental as Record<string, unknown>)
      : {};
  const aiVision =
    root.ai_vision && typeof root.ai_vision === "object"
      ? (root.ai_vision as Record<string, unknown>)
      : {};
  const polymorphic =
    root.polymorphic && typeof root.polymorphic === "object"
      ? (root.polymorphic as Record<string, unknown>)
      : {};
  return { root, environmental, aiVision, polymorphic };
}

/**
 * NFPA operational validity floor for I²R normalization. Below this load the
 * (rated/measured)² extrapolation to 100% load amplifies measurement error by
 * more than ~6×, so the projected figure is not a confident risk metric.
 */
export const PROJECTION_MIN_VALID_LOAD_PERCENT = 40;

/**
 * Honest caveat shown whenever a projection exists but the stored load is below
 * the validity floor. The normalised figure is suppressed rather than dressed
 * up as a confident number.
 */
export const PROJECTION_LOW_LOAD_CAVEAT =
  "Load below 40% — I²R projection suppressed; extrapolating to 100% load is unreliable.";

/** Values below this are shown as a bound, never rounded to a fake zero. */
export const PROJECTION_DISPLAY_FLOOR = 0.0001;

/**
 * Scale-aware formatter for the I²R-normalised ΔT projection.
 *
 * A real projection from a small measured phase delta (e.g. (15/180)² × 2.3 =
 * 0.01597 °C) carries genuine magnitude. Blind `toFixed(2)` would round it to
 * "0.02" (false precision) and a 1-decimal display would collapse it to "0.0"
 * (fake zero). This keeps THREE significant figures — 0.01597 → "0.016",
 * 0.00987 → "0.00988" — strips trailing zeros, and reports anything under the
 * display floor as "0.0001" bound rather than zero. `null` stays `null` so the
 * caller can omit the readout entirely when nothing was stored.
 */
export function formatTemperatureProjection(
  value: number | null | undefined,
  unit: string
): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value === 0) return `0${unit}`;
  const abs = Math.abs(value);
  if (abs < PROJECTION_DISPLAY_FLOOR) {
    return `<${PROJECTION_DISPLAY_FLOOR}${unit}`;
  }
  return `${Number(value.toPrecision(3))}${unit}`;
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

export interface NetaRepairReference {
  readonly classLabel: string;
  readonly repairWindow: string;
}

/**
 * Static NETA / NFPA 70B reference repair windows keyed to the STORED severity
 * class level (1 = LOW … 4 = CRITICAL). The wording mirrors the class rubric
 * that produced the stored severity_class (thermographyAnalysis.ts severity
 * assessment), so the matrix never re-derives a class from ΔT at render time.
 * Reference guidance only — not a live per-asset diagnosis.
 */
export const NETA_STORED_CLASS_REPAIR_WINDOW: Readonly<
  Record<1 | 2 | 3 | 4, NetaRepairReference>
> = {
  1: {
    classLabel: "Class 1 (LOW)",
    repairWindow: "Monitor — routine re-inspection"
  },
  2: {
    classLabel: "Class 2 (MEDIUM)",
    repairWindow: "Schedule repair within 30 days"
  },
  3: {
    classLabel: "Class 3 (HIGH)",
    repairWindow: "Priority repair within 7 days"
  },
  4: {
    classLabel: "Class 4 (CRITICAL)",
    repairWindow: "Immediate action required (24–48 hrs)"
  }
};

/** Look up the canonical repair window for a STORED class level, else null. */
export function netaRepairWindowForStoredClass(
  level: number | null | undefined
): NetaRepairReference | null {
  if (level == null || !Number.isFinite(level)) return null;
  const key = Math.round(level);
  if (key < 1 || key > 4) return null;
  return NETA_STORED_CLASS_REPAIR_WINDOW[key as 1 | 2 | 3 | 4];
}

export type ThermoEmissivityAmbientSource = Pick<
  ThermoChartPoint,
  "emissivity" | "reference" | "ambientReferenceTemp" | "tempUnit"
>;

/**
 * Emissivity + ambient/reference pill text. Returns null when emissivity was
 * never stored — callers omit the pill rather than invent a default. Ambient is
 * an ABSOLUTE temperature, so it converts affinely (scale + offset) via the
 * shared temperature unit resolver, never with a ΔT scale-only conversion.
 */
export function thermoEmissivityAmbientPill(
  point: ThermoEmissivityAmbientSource | null,
  displayUnit: "°C" | "°F",
  fallbackStoredUnit: "°C" | "°F"
): string | null {
  if (!point || point.emissivity == null || !Number.isFinite(point.emissivity)) {
    return null;
  }
  const ambient = point.ambientReferenceTemp ?? point.reference;
  const storedUnit = point.tempUnit ?? fallbackStoredUnit;
  const ambientDisplay =
    ambient == null
      ? null
      : Math.round(
          convertAbsoluteTemperature(ambient, storedUnit, displayUnit) * 10
        ) / 10;
  const emissivity = point.emissivity;
  return ambientDisplay == null
    ? `Emissivity: ${emissivity}`
    : `Emissivity: ${emissivity} | Ambient/Ref: ${ambientDisplay}${displayUnit}`;
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
  const { environmental: env, aiVision, polymorphic: poly } =
    telemetryDataBlob(row);
  const aiRadiometric =
    aiVision.radiometric && typeof aiVision.radiometric === "object"
      ? (aiVision.radiometric as Record<string, unknown>)
      : null;
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
    deepText(aiVision, ["severity_class", "neta_class"]) ||
    deepText(analysis, ["severity_class", "severity_level"]) ||
    asText(row.severity) ||
    null;
  const severityClass =
    severityClassToLevel(peak.severity_class) ??
    severityClassToLevel(aiVision.severity_class ?? aiVision.neta_class) ??
    severityClassToLevel(deepText(analysis, ["severity_class", "severity_level"])) ??
    severityClassToLevel(row.severity);

  const hotspot =
    num(peak.hotspot_temp) ??
    num(aiVision.hotspot_temp) ??
    deepNum(extracted, ["hotspot_temperature", "hotspot_temp", "max_temp"]);
  const reference =
    num(peak.reference_temp) ??
    num(aiVision.reference_temp) ??
    deepNum(extracted, ["reference_temperature", "reference_temp", "ambient_temp"]);
  const deltaT =
    num(peak.delta_t) ??
    num(aiVision.delta_t) ??
    deepNum(analysis, ["delta_t.value", "delta_t"]) ??
    (hotspot != null && reference != null
      ? Math.round((hotspot - reference) * 10) / 10
      : null);

  return {
    date: formatDate(row.timestamp || row.created_at),
    time: formatTime(row.timestamp || row.created_at),
    dateTime: formatDateTime(row.timestamp || row.created_at),
    timestamp: row.timestamp || row.created_at || "",
    hotspot,
    reference,
    deltaT,
    severityClass,
    severityLabel,
    phaseA:
      num(row.phase_a_temp) ??
      num(poly.phase_a_temp) ??
      num(peak.phase_a_temp) ??
      deepNum(extracted, ["phase_a_temp", "phase_a", "phaseA"]),
    phaseB:
      num(row.phase_b_temp) ??
      num(poly.phase_b_temp) ??
      num(peak.phase_b_temp) ??
      deepNum(extracted, ["phase_b_temp", "phase_b", "phaseB"]),
    phaseC:
      num(row.phase_c_temp) ??
      num(poly.phase_c_temp) ??
      num(peak.phase_c_temp) ??
      deepNum(extracted, ["phase_c_temp", "phase_c", "phaseC"]),
    loadPercent:
      num(peak.load_percentage) ??
      num(env.load_percent) ??
      deepNum(extracted, ["load_percentage", "load_percent", "load"]) ??
      deepNum(analysis, ["load_percentage", "load_percent"]),
    i2rDelta:
      num(peak.calculated_i2r_delta) ??
      deepNum(analysis, ["i2r_delta", "calculated_i2r_delta"]),
    i2rNormalizedDelta:
      num(row.i2r_normalized_delta_t) ??
      num(poly.i2r_normalized_delta_t) ??
      num(peak.i2r_normalized_delta_t) ??
      num(peak.normalized_delta_t) ??
      deepNum(analysis, [
        "i2r_normalized_delta_t",
        "normalized_delta_t",
        "delta_t_at_full_load"
      ]),
    currentAmps:
      num(row.measured_amps) ??
      num(poly.measured_amps) ??
      num(peak.current_amps) ??
      num(peak.measured_amps) ??
      deepNum(extracted, ["current_amps", "amperage", "amps"]),
    ratedAmps:
      num(row.rated_amps) ??
      num(poly.rated_amps) ??
      num(peak.rated_amps) ??
      deepNum(extracted, ["rated_amps", "fla", "full_load_amps"]),
    loadThreshold: PROJECTION_MIN_VALID_LOAD_PERCENT,
    // Tab 3 — hybrid JSONB environmental (form physics) + AI vision radiometric
    emissivity:
      num(env.emissivity) ??
      num(aiRadiometric?.emissivitySetting) ??
      num(peak.emissivitySetting) ??
      num(peak.emissivity_setting) ??
      num(peak.emissivity) ??
      num(aiVision.emissivitySetting) ??
      num(aiVision.emissivity_setting) ??
      num(aiVision.emissivity) ??
      deepNum(extracted, [
        "radiometric.emissivitySetting",
        "emissivitySetting",
        "emissivity",
        "emissivity_setting",
        "epsilon"
      ]),
    scaleMin:
      num(aiRadiometric?.scaleMinBoundary) ??
      num(aiVision.scaleMinBoundary) ??
      num(aiVision.scale_min) ??
      num(peak.scaleMinBoundary) ??
      num(peak.scale_min_boundary) ??
      num(peak.scale_min) ??
      deepNum(extracted, [
        "radiometric.scaleMinBoundary",
        "scaleMinBoundary",
        "scale_min_boundary",
        "scale_min",
        "palette_min",
        "temperature_scale.min",
        "temp_scale_min"
      ]),
    scaleMax:
      num(aiRadiometric?.scaleMaxBoundary) ??
      num(aiVision.scaleMaxBoundary) ??
      num(aiVision.scale_max) ??
      num(peak.scaleMaxBoundary) ??
      num(peak.scale_max_boundary) ??
      num(peak.scale_max) ??
      deepNum(extracted, [
        "radiometric.scaleMaxBoundary",
        "scaleMaxBoundary",
        "scale_max_boundary",
        "scale_max",
        "palette_max",
        "temperature_scale.max",
        "temp_scale_max"
      ]),
    isothermThreshold:
      num(aiRadiometric?.isothermThreshold) ??
      num(aiVision.isothermThreshold) ??
      num(aiVision.isotherm_threshold) ??
      num(peak.isothermThreshold) ??
      num(peak.isotherm_threshold) ??
      deepNum(extracted, [
        "radiometric.isothermThreshold",
        "isothermThreshold",
        "isotherm_threshold",
        "isotherm"
      ]) ??
      deepNum(analysis, ["isotherm_threshold", "isothermThreshold"]),
    boxAverage:
      num(aiRadiometric?.boxAverageTemperature) ??
      num(aiRadiometric?.roiStatisticalMean) ??
      num(aiVision.boxAverageTemperature) ??
      num(aiVision.box_average_temperature) ??
      num(aiVision.box_average_temp) ??
      num(aiVision.roiStatisticalMean) ??
      num(aiVision.roi_statistical_mean) ??
      num(peak.boxAverageTemperature) ??
      num(peak.box_average_temperature) ??
      num(peak.box_average_temp) ??
      num(peak.box_avg_temp) ??
      num(peak.roiStatisticalMean) ??
      num(peak.roi_statistical_mean) ??
      deepNum(extracted, [
        "radiometric.boxAverageTemperature",
        "radiometric.roiStatisticalMean",
        "boxAverageTemperature",
        "roiStatisticalMean",
        "box_average_temperature",
        "box_average_temp",
        "box_avg_temp",
        "box_avg",
        "area_avg",
        "roi_statistical_mean"
      ]),
    reflectedApparentTemp:
      num(env.reflected_temp) ??
      num(env.reflectedTemp) ??
      num(peak.reflected_apparent_temp) ??
      deepNum(extracted, [
        "reflected_apparent_temp",
        "reflected_temp",
        "reflectedApparentTemp"
      ]),
    deBearing:
      num(row.de_bearing_temp) ??
      num(poly.de_bearing_temp) ??
      num(peak.de_bearing_temp) ??
      deepNum(extracted, ["de_bearing_temp", "bearing_de", "de_temp"]),
    odeBearing:
      num(row.ode_bearing_temp) ??
      num(poly.ode_bearing_temp) ??
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
      num(row.refractory_skin_temp) ??
      num(poly.refractory_skin_temp) ??
      num(peak.refractory_skin_temp) ??
      deepNum(extracted, ["refractory_skin_temp", "lagging_temp", "shell_temp"]) ??
      num(peak.skin_temp) ??
      deepNum(extracted, ["skin_temp", "housing_temp"]),
    ambientReferenceTemp:
      num(env.ambient_temp) ??
      num(env.ambientTemp) ??
      num(peak.ambient_reference_temp) ??
      deepNum(extracted, [
        "ambient_reference_temp",
        "ambient_temp",
        "reference_temperature"
      ]) ??
      num(peak.reference_temp),
    maxAllowable:
      num(row.max_allowable_limit) ??
      num(poly.max_allowable_limit) ??
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
    ),
    tempUnit:
      normalizeThermoTempUnit(env.temp_unit) ??
      normalizeThermoTempUnit(env.tempUnit) ??
      normalizeThermoTempUnit(peak.temp_unit) ??
      normalizeThermoTempUnit(peak.tempUnit) ??
      normalizeThermoTempUnit(
        deepText(extracted, ["temp_unit", "tempUnit", "temperature_unit"])
      ) ??
      normalizeThermoTempUnit(
        deepText(analysis, ["temp_unit", "tempUnit", "temperature_unit"])
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

export type ThermoAxisGranularity = "date" | "time" | "dateTime";

export interface ThermoAxisPlan {
  /** Field on ThermoChartPoint the X axis should read. */
  dataKey: ThermoAxisGranularity;
  /** True when at least one calendar date has two or more runs. */
  sameDate: boolean;
  /**
   * True only when the whole series sits on one calendar date and the runs
   * span less than SAME_DATE_SNAPSHOT_SPAN_MS — a snapshot, not a trend.
   */
  snapshot: boolean;
  /** Widest same-date span in ms, or null when no date has duplicates. */
  spanMs: number | null;
}

/**
 * Below one hour, same-date runs are a snapshot of one inspection window, not
 * a trend. Drawing a connecting slope across them would imply a rate of change
 * that was never measured.
 */
export const SAME_DATE_SNAPSHOT_SPAN_MS = 60 * 60 * 1000;

/**
 * Decide how to label the IR X axis honestly:
 * - no same-date duplicates → calendar DATE (unchanged behaviour)
 * - same-date duplicates on a single date → HH:mm (points separate)
 * - same-date duplicates across multiple dates → "MMM d HH:mm" (no collisions)
 */
export function planThermoTrendAxis(
  points: readonly ThermoChartPoint[]
): ThermoAxisPlan {
  const groups = new Map<string, number[]>();
  for (const point of points) {
    const ms = Date.parse(point.timestamp || "");
    if (!Number.isFinite(ms)) continue;
    const key = localDateKey(point.timestamp);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(ms);
    else groups.set(key, [ms]);
  }

  let sameDate = false;
  let spanMs: number | null = null;
  for (const bucket of groups.values()) {
    if (new Set(bucket).size < 2) continue;
    sameDate = true;
    const span = Math.max(...bucket) - Math.min(...bucket);
    spanMs = spanMs == null ? span : Math.max(spanMs, span);
  }

  const singleDate = groups.size === 1;
  const dataKey: ThermoAxisGranularity = sameDate
    ? singleDate
      ? "time"
      : "dateTime"
    : "date";
  const snapshot =
    sameDate &&
    singleDate &&
    spanMs != null &&
    spanMs < SAME_DATE_SNAPSHOT_SPAN_MS;

  return { dataKey, sameDate, snapshot, spanMs };
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

/**
 * NFPA 70B badge for the Phase Delta tab. It reads the SAME stored
 * `severityClass` level as `netaRepairWindowForStoredClass`, and labels it from
 * the same canonical table so the badge and the repair matrix can never
 * disagree. No stored level → both omit (returns null, never "N/A" or an
 * independently re-derived class).
 */
export function nfpaClassBadge(pt: ThermoChartPoint | null): {
  label: string;
  className: string;
} | null {
  const level = pt?.severityClass;
  const reference = netaRepairWindowForStoredClass(level);
  if (reference == null) return null;
  if (level === 4) {
    return {
      label: reference.classLabel,
      className: "bg-red-500/20 border-red-500/40 text-red-400"
    };
  }
  if (level === 3) {
    return {
      label: reference.classLabel,
      className: "bg-orange-500/20 border-orange-500/40 text-orange-400"
    };
  }
  if (level === 2) {
    return {
      label: reference.classLabel,
      className: "bg-yellow-500/20 border-yellow-500/40 text-yellow-400"
    };
  }
  return {
    label: reference.classLabel,
    className: "bg-green-500/20 border-green-500/40 text-green-400"
  };
}

/** Radiometric KPI helpers — first scan with ε is asset baseline; no invented values. */
export function radiometricKpis(series: ThermoChartPoint[]): {
  latest: ThermoChartPoint | null;
  baselineEmissivity: number | null;
  emissivityDrift: boolean;
  paletteSpan: number | null;
  /** Camera scale span when min/max boundaries are stored. */
  paletteConfigured: boolean;
  isothermConfigured: boolean;
  boxAverageConfigured: boolean;
} {
  const latest = series.length ? series[series.length - 1] : null;
  const baseline =
    series.find((p) => p.emissivity != null)?.emissivity ?? null;
  const current = latest?.emissivity ?? null;
  const emissivityDrift =
    baseline != null &&
    current != null &&
    Math.abs(current - baseline) > 0.02;
  const paletteConfigured =
    latest?.scaleMax != null && latest?.scaleMin != null;
  const paletteSpan = paletteConfigured
    ? Math.round((latest!.scaleMax! - latest!.scaleMin!) * 10) / 10
    : null;
  return {
    latest,
    baselineEmissivity: baseline,
    emissivityDrift,
    paletteSpan,
    paletteConfigured,
    isothermConfigured: latest?.isothermThreshold != null,
    boxAverageConfigured: latest?.boxAverage != null
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
