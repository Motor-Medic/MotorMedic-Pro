/**
 * Multi-technology assessment summary, built from saved records only.
 *
 * One entry per condition-monitoring technology. A technology with nothing in
 * the database gets `hasData: false` and a sentence saying so — never a zero,
 * a dash-filled row, or a borrowed reading from another asset.
 *
 * The shape this produces is also the shape persisted to `reports.
 * technology_summary`, which is what makes reopening a saved report
 * value-identical: the viewer renders the stored object directly instead of
 * recomputing anything from records that may have moved on since.
 */

import type { SavedAnalysisResult } from "../analysisPersistence";
import { latestOfType, peakOfType, resolveTempUnit } from "../diagnostics/sensorFusion";
import { mpcBand } from "../oilAnalysisMetrics";
import {
  DEFAULT_ALARM_LIMITS,
  ISO_CLEANLINESS_TARGET,
  type OilSample,
  type WearMetalKey
} from "../../types/oilAnalysis";

export type ReportTechnologyId =
  | "vibration"
  | "oil"
  | "ultrasound"
  | "thermography"
  | "mca";

export const REPORT_TECHNOLOGIES: ReportTechnologyId[] = [
  "vibration",
  "oil",
  "ultrasound",
  "thermography",
  "mca"
];

export const REPORT_TECHNOLOGY_LABEL: Record<ReportTechnologyId, string> = {
  vibration: "Vibration",
  oil: "Oil Analysis",
  ultrasound: "Ultrasound",
  thermography: "Thermography",
  mca: "MCA"
};

/** Worst-first; `NO_DATA` means nothing was measured, not that all is well. */
export type ReportSeverity = "CRITICAL" | "ANOMALY" | "NORMAL" | "NO_DATA";

const SEVERITY_RANK: Record<ReportSeverity, number> = {
  CRITICAL: 3,
  ANOMALY: 2,
  NORMAL: 1,
  NO_DATA: 0
};

/** One measured value, already formatted for display. */
export interface ReportReading {
  label: string;
  value: string;
  /** The alarm limit or target this was compared against, when one exists. */
  limit?: string | null;
  status?: "over" | "ok" | null;
}

export interface TechnologyReport {
  technology: ReportTechnologyId;
  label: string;
  hasData: boolean;
  /** Rendered verbatim when `hasData` is false. */
  emptyMessage: string;
  recordedAt: string | null;
  severity: ReportSeverity;
  primaryFault: string | null;
  healthScore: number | null;
  readings: ReportReading[];
}

export interface ReportFault {
  technology: ReportTechnologyId;
  title: string;
  severity: ReportSeverity;
}

export interface MultiTechReport {
  assetId: string;
  technologies: TechnologyReport[];
  technologiesWithData: ReportTechnologyId[];
  overallSeverity: ReportSeverity;
  faultDiagnoses: ReportFault[];
  recommendations: string[];
}

/** The honest badge a technology shows when the assessment window is empty. */
export function noTelemetryMessage(technology: ReportTechnologyId): string {
  return `No ${REPORT_TECHNOLOGY_LABEL[technology]} telemetry recorded for this assessment.`;
}

function emptyTechnology(technology: ReportTechnologyId): TechnologyReport {
  return {
    technology,
    label: REPORT_TECHNOLOGY_LABEL[technology],
    hasData: false,
    emptyMessage: noTelemetryMessage(technology),
    recordedAt: null,
    severity: "NO_DATA",
    primaryFault: null,
    healthScore: null,
    readings: []
  };
}

function num(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeReportSeverity(raw?: string | null): ReportSeverity {
  const s = (raw ?? "").toUpperCase();
  if (s.includes("CRITICAL") || s === "HIGH") return "CRITICAL";
  if (s.includes("ANOMALY") || s === "MEDIUM" || s === "WARNING") return "ANOMALY";
  if (s.includes("NORMAL") || s === "LOW" || s === "OK") return "NORMAL";
  return "NORMAL";
}

/** Push a reading only when the underlying value was actually recorded. */
function pushReading(
  into: ReportReading[],
  label: string,
  value: number | string | null | undefined,
  opts: { unit?: string; limit?: number | string | null } = {}
): void {
  if (value == null || value === "") return;
  const limit =
    opts.limit == null || opts.limit === ""
      ? null
      : `${opts.limit}${opts.unit ?? ""}`;
  const numeric = typeof value === "number" ? value : num(value);
  const limitNumeric = typeof opts.limit === "number" ? opts.limit : num(opts.limit);
  into.push({
    label,
    value: `${value}${opts.unit ?? ""}`,
    limit,
    status:
      numeric != null && limitNumeric != null
        ? numeric > limitNumeric
          ? "over"
          : "ok"
        : null
  });
}

// --- Per-technology builders ------------------------------------------------

function buildFromAnalysisRecord(
  technology: ReportTechnologyId,
  record: SavedAnalysisResult | null,
  readingsFor: (record: SavedAnalysisResult) => ReportReading[]
): TechnologyReport {
  if (!record) return emptyTechnology(technology);
  return {
    technology,
    label: REPORT_TECHNOLOGY_LABEL[technology],
    hasData: true,
    emptyMessage: noTelemetryMessage(technology),
    recordedAt: record.timestamp ?? null,
    severity: normalizeReportSeverity(record.severity),
    primaryFault: record.primary_fault || null,
    healthScore: num(record.health_score),
    readings: readingsFor(record)
  };
}

function vibrationReadings(record: SavedAnalysisResult): ReportReading[] {
  const readings: ReportReading[] = [];
  pushReading(readings, "Health score", num(record.health_score), { unit: "/100" });
  pushReading(readings, "Envelope peak", num(record.envelope_peak_amplitude), {
    unit: " g"
  });
  pushReading(
    readings,
    "Envelope dominant frequency",
    num(record.envelope_dominant_frequency),
    { unit: " Hz" }
  );
  pushReading(readings, "Waveform crest factor", num(record.waveform_crest_factor));
  pushReading(readings, "Waveform peak-to-peak", num(record.waveform_peak_to_peak));
  pushReading(readings, "Impact count", num(record.waveform_impact_count));
  return readings;
}

function ultrasoundReadings(record: SavedAnalysisResult): ReportReading[] {
  const peak = peakOfType(record, "ultrasound");
  const peakDb = num(peak?.peak_dbmv);
  const baselineDb = num(peak?.baseline_dbmv);
  const delta =
    num(peak?.delta_db) ??
    (peakDb != null && baselineDb != null ? Math.round((peakDb - baselineDb) * 10) / 10 : null);

  const readings: ReportReading[] = [];
  pushReading(readings, "Peak", peakDb, { unit: " dBµV" });
  pushReading(readings, "Baseline", baselineDb, { unit: " dBµV" });
  pushReading(readings, "Over baseline", delta, { unit: " dB" });
  return readings;
}

function thermographyReadings(record: SavedAnalysisResult): ReportReading[] {
  const peak = peakOfType(record, "thermography");
  const unit = resolveTempUnit(record) ?? "";
  const readings: ReportReading[] = [];
  pushReading(
    readings,
    "ΔT",
    num(peak?.delta_t) ?? num(record.i2r_normalized_delta_t),
    { unit }
  );
  pushReading(readings, "Hotspot", num(peak?.hotspot_temp), { unit });
  if (peak?.severity_class) {
    readings.push({
      label: "NETA class",
      value: String(peak.severity_class),
      limit: null,
      status: null
    });
  }
  pushReading(readings, "Phase A", num(record.phase_a_temp), { unit });
  pushReading(readings, "Phase B", num(record.phase_b_temp), { unit });
  pushReading(readings, "Phase C", num(record.phase_c_temp), { unit });
  return readings;
}

function mcaReadings(record: SavedAnalysisResult): ReportReading[] {
  const peak = peakOfType(record, "mca") ?? {};
  const readings: ReportReading[] = [];
  pushReading(readings, "Health score", num(record.health_score), { unit: "/100" });
  pushReading(readings, "Insulation resistance", num(peak.insulation_resistance), {
    unit: " MΩ"
  });
  pushReading(readings, "Polarization index", num(peak.polarization_index));
  pushReading(readings, "Resistance imbalance", num(peak.resistance_imbalance), {
    unit: " %"
  });
  pushReading(readings, "Inductance imbalance", num(peak.inductance_imbalance), {
    unit: " %"
  });
  pushReading(readings, "Measured amps", num(record.measured_amps), { unit: " A" });
  pushReading(readings, "Rated amps", num(record.rated_amps), { unit: " A" });
  return readings;
}

/**
 * Oil severity policy. Documented here rather than inferred so the badge can
 * be audited: any measured exceedance is an anomaly, and it escalates to
 * critical only at double the alarm limit or a critical varnish band.
 */
const OIL_CRITICAL_MULTIPLE = 2;

const WEAR_METAL_LABEL: Record<WearMetalKey, string> = {
  iron: "Fe",
  copper: "Cu",
  chromium: "Cr",
  lead: "Pb",
  aluminum: "Al",
  silicon: "Si"
};

function buildOil(sample: OilSample | null): TechnologyReport {
  if (!sample) return emptyTechnology("oil");

  const readings: ReportReading[] = [];
  let anyOver = false;
  let anyCritical = false;

  for (const key of Object.keys(WEAR_METAL_LABEL) as WearMetalKey[]) {
    const value = sample[key];
    const limit = DEFAULT_ALARM_LIMITS[key];
    if (value == null) continue;
    pushReading(readings, WEAR_METAL_LABEL[key], value, {
      unit: " ppm",
      limit
    });
    if (limit != null && value > limit) {
      anyOver = true;
      if (value >= limit * OIL_CRITICAL_MULTIPLE) anyCritical = true;
    }
  }

  if (sample.iso4um != null && sample.iso6um != null && sample.iso14um != null) {
    const iso: [number, number, number] = [sample.iso4um, sample.iso6um, sample.iso14um];
    const over = iso.some((code, i) => code > ISO_CLEANLINESS_TARGET[i]);
    if (over) anyOver = true;
    readings.push({
      label: "ISO 4406",
      value: iso.join("/"),
      limit: ISO_CLEANLINESS_TARGET.join("/"),
      status: over ? "over" : "ok"
    });
  }

  if (sample.mpcDeltaE != null) {
    const band = mpcBand(sample.mpcDeltaE);
    if (band === "abnormal" || band === "critical") anyOver = true;
    if (band === "critical") anyCritical = true;
    readings.push({
      label: "MPC",
      value: `${sample.mpcDeltaE} ΔE (${band})`,
      limit: null,
      status: band === "abnormal" || band === "critical" ? "over" : "ok"
    });
  }

  if (sample.rulerPercent != null) {
    const over = sample.rulerPercent < 25;
    if (over) anyOver = true;
    readings.push({
      label: "RULER",
      value: `${sample.rulerPercent}%`,
      limit: "25% floor",
      status: over ? "over" : "ok"
    });
  }

  if (sample.waterPpm != null) {
    const over = sample.waterPpm > 200;
    if (over) anyOver = true;
    if (sample.waterPpm > 200 * OIL_CRITICAL_MULTIPLE) anyCritical = true;
    pushReading(readings, "Water", sample.waterPpm, { unit: " ppm", limit: 200 });
  }

  pushReading(readings, "Viscosity @40°C", sample.viscosity40C, { unit: " cSt" });
  pushReading(readings, "Acid number", sample.acidNumber, { unit: " mg KOH/g" });
  pushReading(readings, "Operating hours", sample.operatingHours, { unit: " h" });

  return {
    technology: "oil",
    label: REPORT_TECHNOLOGY_LABEL.oil,
    hasData: true,
    emptyMessage: noTelemetryMessage("oil"),
    recordedAt: sample.sampleDate ?? null,
    severity: anyCritical ? "CRITICAL" : anyOver ? "ANOMALY" : "NORMAL",
    primaryFault: null,
    healthScore: null,
    readings
  };
}

// --- Assembly ---------------------------------------------------------------

export function worstSeverity(severities: ReportSeverity[]): ReportSeverity {
  let worst: ReportSeverity = "NO_DATA";
  for (const s of severities) {
    if (SEVERITY_RANK[s] > SEVERITY_RANK[worst]) worst = s;
  }
  return worst;
}

/**
 * Consolidate every saved record for one asset into a report. Pure: the same
 * records always produce the same report, which is what lets the persisted
 * copy and a freshly built one be compared for equality in tests.
 */
export function buildMultiTechReport(input: {
  assetId: string;
  analysisRecords: SavedAnalysisResult[];
  oilSamples: OilSample[];
}): MultiTechReport {
  const { assetId, analysisRecords, oilSamples } = input;

  const latestOil = oilSamples.length
    ? oilSamples.reduce((newest, s) =>
        new Date(s.sampleDate).getTime() > new Date(newest.sampleDate).getTime()
          ? s
          : newest
      )
    : null;

  const technologies: TechnologyReport[] = [
    buildFromAnalysisRecord(
      "vibration",
      latestOfType(analysisRecords, "vibration"),
      vibrationReadings
    ),
    buildOil(latestOil),
    buildFromAnalysisRecord(
      "ultrasound",
      latestOfType(analysisRecords, "ultrasound"),
      ultrasoundReadings
    ),
    buildFromAnalysisRecord(
      "thermography",
      latestOfType(analysisRecords, "thermography"),
      thermographyReadings
    ),
    buildFromAnalysisRecord("mca", latestOfType(analysisRecords, "mca"), mcaReadings)
  ];

  const withData = technologies.filter((t) => t.hasData);

  const faultDiagnoses: ReportFault[] = withData
    .filter((t) => t.primaryFault)
    .map((t) => ({
      technology: t.technology,
      title: t.primaryFault as string,
      severity: t.severity
    }));

  // Deduplicate recommendations across technologies, preserving first-seen order.
  const seen = new Set<string>();
  const recommendations: string[] = [];
  for (const technology of REPORT_TECHNOLOGIES) {
    if (technology === "oil") continue;
    const record = latestOfType(analysisRecords, technology);
    if (!record || !Array.isArray(record.recommendations)) continue;
    for (const raw of record.recommendations) {
      const text =
        typeof raw === "string"
          ? raw
          : typeof (raw as { text?: unknown })?.text === "string"
            ? ((raw as { text: string }).text)
            : null;
      if (!text || seen.has(text)) continue;
      seen.add(text);
      recommendations.push(text);
    }
  }

  return {
    assetId,
    technologies,
    technologiesWithData: withData.map((t) => t.technology),
    overallSeverity: worstSeverity(technologies.map((t) => t.severity)),
    faultDiagnoses,
    recommendations
  };
}

// --- Persistence shape ------------------------------------------------------

/** Keyed by technology id, as stored in `reports.technology_summary`. */
export type TechnologySummaryMap = Partial<
  Record<ReportTechnologyId, TechnologyReport>
>;

export function toTechnologySummaryMap(
  report: MultiTechReport
): TechnologySummaryMap {
  const out: TechnologySummaryMap = {};
  for (const technology of report.technologies) {
    out[technology.technology] = technology;
  }
  return out;
}

/**
 * Rebuild the ordered technology list from a stored summary. Technologies
 * missing from an older stored report fall back to the honest empty state
 * rather than being silently dropped from the viewer.
 */
export function fromTechnologySummaryMap(
  map: TechnologySummaryMap | null | undefined
): TechnologyReport[] {
  return REPORT_TECHNOLOGIES.map(
    (technology) => map?.[technology] ?? emptyTechnology(technology)
  );
}
