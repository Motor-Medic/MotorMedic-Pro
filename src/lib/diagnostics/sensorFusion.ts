/**
 * Multi-technology sensor fusion.
 *
 * Builds one evidence row per condition-monitoring technology from records
 * already saved in PostgreSQL, and scores how strongly each corroborates the
 * active diagnosis.
 *
 * Two rules govern everything here:
 *   1. A technology with no saved record scores `null`, never 0. "We did not
 *      look" and "we looked and found nothing" are different claims.
 *   2. Every score carries a `reason` built from the saved values that produced
 *      it, so a reviewer can audit the number without opening the database.
 */

import {
  fetchAnalysisResults,
  type SavedAnalysisResult
} from "../analysisPersistence";
import { fetchOilSamples } from "../oilSampleRow";
import { mpcBand } from "../oilAnalysisMetrics";
import {
  DEFAULT_ALARM_LIMITS,
  ISO_CLEANLINESS_TARGET,
  type OilSample,
  type WearMetalKey
} from "../../types/oilAnalysis";
import {
  classifyFaultFamily,
  familiesCorroborate,
  type FaultFamily
} from "./faultFamily";

export type TechnologyId = "vibration" | "oil" | "ultrasound" | "thermography";

export const TECHNOLOGY_LABEL: Record<TechnologyId, string> = {
  vibration: "Vibration",
  oil: "Oil Analysis",
  ultrasound: "Ultrasound",
  thermography: "Thermography"
};

/** Why a technology could not be scored, when it has no usable number. */
export type UnscoredReason = "no_record" | "no_usable_metric";

export interface TechnologyEvidence {
  technology: TechnologyId;
  label: string;
  /** A record exists in the database, regardless of whether it could be scored. */
  hasRecord: boolean;
  /** 0–100, or null when there is nothing measured to score. */
  score: number | null;
  unscoredReason: UnscoredReason | null;
  /** One-line justification built from saved values. */
  reason: string;
  /** Individual saved readings behind the score. */
  detail: string[];
  /** ISO timestamp of the record the score came from. */
  recordedAt: string | null;
  family: FaultFamily | null;
}

export interface FusionResult {
  rows: TechnologyEvidence[];
  /** Rows that produced a numeric score. */
  scored: TechnologyEvidence[];
  /** Rounded mean of scored rows, or null when fewer than two technologies. */
  aggregate: number | null;
  status: "cross_validated" | "single_domain" | "no_data";
  /** The family the other technologies were compared against. */
  diagnosisFamily: FaultFamily;
}

/** Minimum technologies with data before an aggregate is meaningful. */
const MIN_TECHNOLOGIES_FOR_AGGREGATE = 2;

// --- Documented scoring thresholds -----------------------------------------

/** Ultrasound dB over baseline. 12 dB ≈ 4× sound pressure — unambiguous. */
export const ULTRASOUND_DB_BANDS = [
  { min: 12, score: 100 },
  { min: 8, score: 75 },
  { min: 4, score: 50 },
  { min: 1, score: 25 }
] as const;

/** Thermography ΔT in °C, aligned to the NETA / Infraspection repair bands. */
export const THERMOGRAPHY_DELTA_T_BANDS_C = [
  { min: 40, score: 100 },
  { min: 15, score: 75 },
  { min: 4, score: 50 },
  { min: 1, score: 25 }
] as const;

/** Fallback when ΔT is absent but the analyst recorded a NETA class. */
const SEVERITY_CLASS_SCORE: Record<string, number> = {
  "class 1": 25,
  "class 2": 50,
  "class 3": 75,
  "class 4": 100
};

const WEAR_METAL_LABEL: Record<WearMetalKey, string> = {
  iron: "Fe",
  copper: "Cu",
  chromium: "Cr",
  lead: "Pb",
  aluminum: "Al",
  silicon: "Si"
};

/**
 * Which fault family each oil anomaly points at. Silicon is dirt ingress, the
 * ferrous/bearing metals are mechanical wear, varnish chemistry is lubrication.
 */
const WEAR_METAL_FAMILY: Record<WearMetalKey, FaultFamily> = {
  iron: "bearing",
  copper: "bearing",
  chromium: "bearing",
  lead: "bearing",
  aluminum: "bearing",
  silicon: "contamination"
};

function bandScore(
  value: number,
  bands: readonly { min: number; score: number }[]
): number {
  for (const band of bands) {
    if (value >= band.min) return band.score;
  }
  return 0;
}

function num(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Find the peaks entry a technology wrote, e.g. `{ type: "ultrasound", … }`. */
export function peakOfType(
  record: SavedAnalysisResult,
  type: string
): Record<string, unknown> | null {
  if (!Array.isArray(record.peaks)) return null;
  for (const entry of record.peaks) {
    if (
      entry &&
      typeof entry === "object" &&
      (entry as Record<string, unknown>).type === type
    ) {
      return entry as Record<string, unknown>;
    }
  }
  return null;
}

/** Newest record for a technology, by saved timestamp. */
export function latestOfType(
  records: SavedAnalysisResult[],
  analysisType: string
): SavedAnalysisResult | null {
  const matching = records
    .filter((r) => (r.analysis_type ?? "vibration") === analysisType)
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  return matching[0] ?? null;
}

/**
 * Resolve the temperature unit a thermography record was captured in, so a ΔT
 * can be compared against °C thresholds. Returns null when the record never
 * stored a unit — we convert nothing on a guess.
 */
export function resolveTempUnit(
  record: SavedAnalysisResult
): "°C" | "°F" | null {
  const telemetry = record.telemetry_data as
    | Record<string, unknown>
    | null
    | undefined;
  const env = (telemetry?.environmental ?? {}) as Record<string, unknown>;
  const peak = peakOfType(record, "thermography") ?? {};

  const raw =
    env.temp_unit ?? env.tempUnit ?? peak.temp_unit ?? peak.tempUnit ?? null;
  if (raw == null || raw === "") return null;

  const s = String(raw).trim().toUpperCase().replace(/\s+/g, "");
  if (["°C", "C", "CELSIUS", "DEGC", "℃"].includes(s)) return "°C";
  if (["°F", "F", "FAHRENHEIT", "DEGF", "℉"].includes(s)) return "°F";
  return null;
}

// --- Per-technology scoring -------------------------------------------------

export function scoreVibration(
  record: SavedAnalysisResult | null,
  diagnosisFamily: FaultFamily
): TechnologyEvidence {
  const base: TechnologyEvidence = {
    technology: "vibration",
    label: TECHNOLOGY_LABEL.vibration,
    hasRecord: false,
    score: null,
    unscoredReason: "no_record",
    reason: "No record - awaiting capture",
    detail: [],
    recordedAt: null,
    family: null
  };
  if (!record) return base;

  const family = classifyFaultFamily(record.primary_fault);
  const severity = (record.severity ?? "").toUpperCase();
  const detail: string[] = [];
  if (record.primary_fault) detail.push(`Primary fault: ${record.primary_fault}`);
  if (record.severity) detail.push(`Severity: ${record.severity}`);
  if (record.health_score != null) {
    detail.push(`Health score: ${record.health_score}/100`);
  }

  let score: number;
  let reason: string;

  if (severity === "NORMAL") {
    score = 0;
    reason =
      record.summary ||
      "Saved vibration analysis reports NORMAL - no corroborating evidence.";
  } else if (familiesCorroborate(family, diagnosisFamily)) {
    score = 100;
    reason =
      record.summary ||
      `Saved primary fault "${record.primary_fault}" matches the diagnosed fault family.`;
  } else if (severity === "ANOMALY" || severity === "CRITICAL") {
    score = 50;
    reason =
      record.summary ||
      `Saved analysis is ${severity} but its fault family differs from the diagnosis.`;
  } else {
    score = 0;
    reason =
      record.summary || "Saved vibration analysis shows no matching anomaly.";
  }

  return {
    ...base,
    hasRecord: true,
    score,
    unscoredReason: null,
    reason,
    detail,
    recordedAt: record.timestamp,
    family
  };
}

/**
 * Ultrasound and thermography grade a single scalar against severity bands,
 * which tells us a problem exists — not that it is *this* problem. Full
 * corroboration is therefore reserved for records whose own fault family
 * matches the diagnosis; anything else is held at the same partial-agreement
 * level vibration and oil use for an off-family exceedance.
 */
const UNMATCHED_FAMILY_CAP = 50;

function capToFamilyAgreement(
  raw: number,
  recordFamily: FaultFamily,
  diagnosisFamily: FaultFamily
): { score: number; capReason: string | null } {
  if (raw <= UNMATCHED_FAMILY_CAP) return { score: raw, capReason: null };
  if (familiesCorroborate(recordFamily, diagnosisFamily)) {
    return { score: raw, capReason: null };
  }
  return {
    score: UNMATCHED_FAMILY_CAP,
    capReason:
      diagnosisFamily === "unknown"
        ? ` Held at ${UNMATCHED_FAMILY_CAP} - severity only, with no diagnosed fault family to match against.`
        : ` Held at ${UNMATCHED_FAMILY_CAP} - severity confirms a problem, but this record's fault family differs from the diagnosis.`
  };
}

export function scoreUltrasound(
  record: SavedAnalysisResult | null,
  diagnosisFamily: FaultFamily
): TechnologyEvidence {
  const base: TechnologyEvidence = {
    technology: "ultrasound",
    label: TECHNOLOGY_LABEL.ultrasound,
    hasRecord: false,
    score: null,
    unscoredReason: "no_record",
    reason: "No record - awaiting capture",
    detail: [],
    recordedAt: null,
    family: null
  };
  if (!record) return base;

  const peak = peakOfType(record, "ultrasound");
  const peakDb = num(peak?.peak_dbmv);
  const baselineDb = num(peak?.baseline_dbmv);
  const storedDelta = num(peak?.delta_db);
  // Only derive a delta when both endpoints were actually recorded.
  const delta =
    storedDelta ?? (peakDb != null && baselineDb != null ? peakDb - baselineDb : null);

  const detail: string[] = [];
  if (peakDb != null) detail.push(`Peak ${peakDb} dBµV`);
  if (baselineDb != null) detail.push(`Baseline ${baselineDb} dBµV`);
  if (record.primary_fault) detail.push(`Fault: ${record.primary_fault}`);

  const family = classifyFaultFamily(record.primary_fault);

  if (delta == null) {
    return {
      ...base,
      hasRecord: true,
      unscoredReason: "no_usable_metric",
      reason:
        "Ultrasound record on file, but no dB-over-baseline was stored - cannot score.",
      detail,
      recordedAt: record.timestamp,
      family
    };
  }

  const rounded = Math.round(delta * 10) / 10;
  const { score, capReason } = capToFamilyAgreement(
    bandScore(delta, ULTRASOUND_DB_BANDS),
    family,
    diagnosisFamily
  );
  return {
    ...base,
    hasRecord: true,
    score,
    unscoredReason: null,
    reason:
      score === 0
        ? `${rounded} dB over baseline - below the +1 dB corroboration floor.`
        : `${rounded} dB over baseline${baselineDb != null && peakDb != null ? ` (${peakDb} vs ${baselineDb} dBµV)` : ""}.${capReason ?? ""}`,
    detail,
    recordedAt: record.timestamp,
    family
  };
}

export function scoreThermography(
  record: SavedAnalysisResult | null,
  diagnosisFamily: FaultFamily
): TechnologyEvidence {
  const base: TechnologyEvidence = {
    technology: "thermography",
    label: TECHNOLOGY_LABEL.thermography,
    hasRecord: false,
    score: null,
    unscoredReason: "no_record",
    reason: "No record - awaiting capture",
    detail: [],
    recordedAt: null,
    family: null
  };
  if (!record) return base;

  const peak = peakOfType(record, "thermography");
  const rawDelta = num(peak?.delta_t) ?? num(record.i2r_normalized_delta_t);
  const unit = resolveTempUnit(record);
  const severityClass = String(peak?.severity_class ?? "")
    .trim()
    .toLowerCase();

  const detail: string[] = [];
  if (rawDelta != null) detail.push(`ΔT ${rawDelta}${unit ?? ""}`);
  if (peak?.hotspot_temp != null) {
    detail.push(`Hotspot ${peak.hotspot_temp}${unit ?? ""}`);
  }
  if (severityClass) detail.push(`NETA ${peak?.severity_class}`);
  if (record.primary_fault) detail.push(`Fault: ${record.primary_fault}`);

  const family = classifyFaultFamily(record.primary_fault);

  if (rawDelta != null && unit != null) {
    // Bands are defined in °C; a Fahrenheit delta is a ratio conversion only.
    const deltaC = unit === "°F" ? rawDelta / 1.8 : rawDelta;
    const { score, capReason } = capToFamilyAgreement(
      bandScore(deltaC, THERMOGRAPHY_DELTA_T_BANDS_C),
      family,
      diagnosisFamily
    );
    return {
      ...base,
      hasRecord: true,
      score,
      unscoredReason: null,
      reason: `ΔT ${rawDelta}${unit}${unit === "°F" ? ` (${Math.round(deltaC * 10) / 10}°C)` : ""} against NETA repair bands.${capReason ?? ""}`,
      detail,
      recordedAt: record.timestamp,
      family
    };
  }

  if (severityClass && SEVERITY_CLASS_SCORE[severityClass] != null) {
    const { score, capReason } = capToFamilyAgreement(
      SEVERITY_CLASS_SCORE[severityClass],
      family,
      diagnosisFamily
    );
    return {
      ...base,
      hasRecord: true,
      score,
      unscoredReason: null,
      reason: `Analyst-recorded ${peak?.severity_class} severity (ΔT unit not stored, so ΔT could not be graded).${capReason ?? ""}`,
      detail,
      recordedAt: record.timestamp,
      family
    };
  }

  return {
    ...base,
    hasRecord: true,
    unscoredReason: "no_usable_metric",
    reason:
      rawDelta != null
        ? `ΔT ${rawDelta} recorded without a temperature unit - cannot grade against °C bands.`
        : "Thermography record on file, but no ΔT or severity class was stored - cannot score.",
    detail,
    recordedAt: record.timestamp,
    family
  };
}

/** One measured oil parameter that is outside its limit. */
export interface OilExceedance {
  text: string;
  family: FaultFamily;
}

/**
 * Every measured-vs-limit exceedance in a sample, as display strings.
 *
 * Exported so the root-cause hypothesis cards render the *same* strings the
 * fusion matrix does — the two views can never quote different ppm figures for
 * the same sample.
 */
export function oilExceedances(sample: OilSample): OilExceedance[] {
  const anomalies: OilExceedance[] = [];

  for (const key of Object.keys(WEAR_METAL_LABEL) as WearMetalKey[]) {
    const value = sample[key];
    const limit = DEFAULT_ALARM_LIMITS[key];
    if (value != null && limit != null && value > limit) {
      anomalies.push({
        text: `${WEAR_METAL_LABEL[key]} ${value} ppm > ${limit} ppm limit`,
        family: WEAR_METAL_FAMILY[key]
      });
    }
  }

  const iso: [number, number, number] | null =
    sample.iso4um != null && sample.iso6um != null && sample.iso14um != null
      ? [sample.iso4um, sample.iso6um, sample.iso14um]
      : null;
  if (iso && iso.some((code, i) => code > ISO_CLEANLINESS_TARGET[i])) {
    anomalies.push({
      text: `ISO ${iso.join("/")} above target ${ISO_CLEANLINESS_TARGET.join("/")}`,
      family: "contamination"
    });
  }

  if (sample.mpcDeltaE != null) {
    const band = mpcBand(sample.mpcDeltaE);
    if (band === "abnormal" || band === "critical") {
      anomalies.push({
        text: `MPC ${sample.mpcDeltaE} ΔE (${band})`,
        family: "lubrication"
      });
    }
  }

  if (sample.rulerPercent != null && sample.rulerPercent < 25) {
    anomalies.push({
      text: `RULER ${sample.rulerPercent}% antioxidant remaining`,
      family: "lubrication"
    });
  }

  if (sample.waterPpm != null && sample.waterPpm > 200) {
    anomalies.push({
      text: `Water ${sample.waterPpm} ppm above 200 ppm`,
      family: "contamination"
    });
  }

  return anomalies;
}

export function scoreOil(
  sample: OilSample | null,
  diagnosisFamily: FaultFamily
): TechnologyEvidence {
  const base: TechnologyEvidence = {
    technology: "oil",
    label: TECHNOLOGY_LABEL.oil,
    hasRecord: false,
    score: null,
    unscoredReason: "no_record",
    reason: "No record - awaiting capture",
    detail: [],
    recordedAt: null,
    family: null
  };
  if (!sample) return base;

  const anomalies = oilExceedances(sample);
  const detail = anomalies.map((a) => a.text);
  const matching = anomalies.filter((a) =>
    familiesCorroborate(a.family, diagnosisFamily)
  );

  let score: number;
  let reason: string;
  if (matching.length > 0) {
    score = 100;
    reason = matching.map((a) => a.text).join("; ");
  } else if (anomalies.length > 0) {
    score = 50;
    reason = `${anomalies.map((a) => a.text).join("; ")} - anomalous, but not the diagnosed fault family.`;
  } else {
    score = 0;
    reason = "All measured oil parameters within limits.";
  }

  return {
    ...base,
    hasRecord: true,
    score,
    unscoredReason: null,
    reason,
    detail,
    recordedAt: sample.sampleDate,
    family: matching[0]?.family ?? anomalies[0]?.family ?? null
  };
}

/** Assemble scored rows into a fusion verdict. */
export function assembleFusion(
  rows: TechnologyEvidence[],
  diagnosisFamily: FaultFamily
): FusionResult {
  const scored = rows.filter(
    (r): r is TechnologyEvidence & { score: number } => r.score != null
  );

  const aggregate =
    scored.length >= MIN_TECHNOLOGIES_FOR_AGGREGATE
      ? Math.round(scored.reduce((sum, r) => sum + r.score, 0) / scored.length)
      : null;

  const status: FusionResult["status"] =
    scored.length >= MIN_TECHNOLOGIES_FOR_AGGREGATE
      ? "cross_validated"
      : scored.length === 1 || rows.some((r) => r.hasRecord)
        ? "single_domain"
        : "no_data";

  return { rows, scored, aggregate, status, diagnosisFamily };
}

/**
 * Score every technology against the diagnosis using records already in hand.
 * Kept separate from the fetch so callers that already loaded the data (and
 * the prognosis panel, which needs the same rows) do not fetch twice.
 */
export function buildFusionFromRecords(input: {
  analysisRecords: SavedAnalysisResult[];
  oilSamples: OilSample[];
  primaryFault?: string | null;
}): FusionResult {
  const diagnosisFamily = classifyFaultFamily(input.primaryFault);
  const latestOil = input.oilSamples.length
    ? input.oilSamples[input.oilSamples.length - 1]
    : null;

  const rows: TechnologyEvidence[] = [
    scoreVibration(
      latestOfType(input.analysisRecords, "vibration"),
      diagnosisFamily
    ),
    scoreOil(latestOil, diagnosisFamily),
    scoreUltrasound(
      latestOfType(input.analysisRecords, "ultrasound"),
      diagnosisFamily
    ),
    scoreThermography(
      latestOfType(input.analysisRecords, "thermography"),
      diagnosisFamily
    )
  ];

  return assembleFusion(rows, diagnosisFamily);
}

export interface LoadFusionOptions {
  assetId: string;
  /** The active diagnosis text, e.g. "Outer Race Bearing Defect (BPFO)". */
  primaryFault?: string | null;
  /** Technology the active diagnosis came from; its own row is still shown. */
  activeTechnology?: TechnologyId;
}

/**
 * Load the latest saved record per technology and score each one.
 * Fetch failures degrade to "no record" rows rather than blanking the panel.
 */
export async function loadSensorFusion(
  options: LoadFusionOptions
): Promise<FusionResult> {
  const { assetId, primaryFault } = options;

  const [analysisRecords, oilSamples] = await Promise.all([
    fetchAnalysisResults({ asset_id: assetId }).catch(
      () => [] as SavedAnalysisResult[]
    ),
    fetchOilSamples(assetId).catch(() => [] as OilSample[])
  ]);

  return buildFusionFromRecords({ analysisRecords, oilSamples, primaryFault });
}
