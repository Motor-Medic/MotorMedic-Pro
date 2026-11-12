/**
 * SLICE-VS1 — Broadband & ISO 20816 single source of truth.
 *
 * The Trend Analyzer used to read the broadband tab from several places:
 * the latest saved row (PostgreSQL, unwindowed), a "record with spectral
 * peaks" search, the chart's windowed peak series, and the raw latest peaks
 * array. This module is the one selector layer every surface now shares:
 *
 *   raw saved rows
 *     -> shared time window (trendSeries.filterTrendByTimeRange)
 *     -> running-state scope (load telemetry, ON = >80% load)
 *     -> deterministic newest-first ordering (timestamp, created_at, id)
 *     -> latest-in-window row + full windowed series
 *
 * Different metrics (peak vs overall RMS vs per-axis) stay different values;
 * only their SOURCE / WINDOW / SELECTION are unified.
 */

import type { SavedAnalysisResult } from "../analysisPersistence";
import { healthScoreFromVelocityMmS } from "./isoZone";
import {
  extractVibrationRecordFromAnalysis,
  type VibrationDiagnosticRecord
} from "./vibrationDiagnosticRecord";

/** The running-state toggle copy says ">80% Load" — keep the rule in sync. */
export const RUNNING_STATE_LOAD_THRESHOLD_PERCENT = 80;

/** Distinct null vocabulary: absence is not a measured zero. */
export const VIBRATION_NOT_MEASURED = "Not measured";
export const VIBRATION_NOT_REPORTED = "Not reported";
export const VIBRATION_NOT_DETECTED = "Not detected";
export const VIBRATION_INDETERMINATE_VERDICT = "Indeterminate \u2014 review";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numeric =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Load telemetry for the vibration row. Vibration has a real load field (oil
 * does not), so the running-state toggle is wireable here only.
 */
export function readVibrationLoadPercent(
  row: SavedAnalysisResult | null | undefined
): number | null {
  if (!row) return null;
  const td = asRecord(row.telemetry_data);
  const trend = asRecord(td.vibration_trend_record);
  const trendContext = asRecord(trend.context);
  const rowContext = asRecord(td.context);

  const candidates: unknown[] = [
    trendContext.loadFactorPercent,
    trendContext.loadFactor,
    trendContext.load_percentage,
    trendContext.loadPercent,
    trend.loadFactorPercent,
    td.loadFactorPercent,
    td.load_factor_percent,
    td.load_percentage,
    td.loadPercentage,
    td.load_percent,
    rowContext.loadFactorPercent,
    rowContext.loadPercentage,
    rowContext.load_percent
  ];

  for (const candidate of candidates) {
    const value = finiteNumber(candidate);
    if (value != null) return value;
  }
  return null;
}

/**
 * SLICE-VS4 — running speed STORED on this sample.
 *
 * This is deliberately NOT `machineSpecs.rpm`: an Equipment-DB rating says how
 * fast the machine may run, not how fast this capture ran. Re-extracting 1X/2X
 * from raw FFT bins therefore requires this stored value; without it the
 * spectral tab may only show order amplitudes that were stored at collection.
 */
export function readStoredVibrationRpm(
  row: SavedAnalysisResult | null | undefined
): number | null {
  if (!row) return null;
  const td = asRecord(row.telemetry_data);
  const trend = asRecord(td.vibration_trend_record);
  const trendContext = asRecord(trend.context);

  const candidates: unknown[] = [
    trend.rpm,
    trendContext.motorSpeedRPM,
    td.rpm
  ];

  for (const candidate of candidates) {
    const value = finiteNumber(candidate);
    if (value != null && value > 0) return value;
  }
  return null;
}

export interface VibrationSampleState {
  loadPercent: number | null;
  hasLoadTelemetry: boolean;
  /** Load telemetry says the machine was not running (>80% required). */
  stopped: boolean;
  /** Null-load samples cannot be proven stopped, so they remain in scope. */
  running: boolean;
  overallVelocity: number | null;
  zeroVelocity: boolean;
}

/**
 * One sample's running-state truth. `stopped` is only claimed when load
 * telemetry exists — a missing load field is never inferred as idle.
 */
export function vibrationSampleState(
  row: SavedAnalysisResult | null | undefined
): VibrationSampleState {
  const loadPercent = readVibrationLoadPercent(row);
  const hasLoadTelemetry = loadPercent != null;
  const stopped =
    hasLoadTelemetry && loadPercent <= RUNNING_STATE_LOAD_THRESHOLD_PERCENT;
  const overallVelocity = readVibrationOverallVelocity(row);
  return {
    loadPercent,
    hasLoadTelemetry,
    stopped,
    running: !stopped,
    overallVelocity,
    zeroVelocity: overallVelocity != null && overallVelocity <= 0
  };
}

/** Visible label for a point that is not a running-state measurement. */
export function vibrationStoppedSampleLabel(
  row: SavedAnalysisResult | null | undefined
): string | null {
  const state = vibrationSampleState(row);
  if (state.stopped) return "stopped sample";
  if (state.zeroVelocity) return "no velocity recorded";
  return null;
}

/** ON keeps running/unknown-load rows; OFF keeps every in-window row. */
export function applyVibrationRunningStateFilter<T extends SavedAnalysisResult>(
  rows: readonly T[],
  runningOnly: boolean
): T[] {
  if (!runningOnly) return rows.slice();
  return rows.filter((row) => !vibrationSampleState(row).stopped);
}

function timestampMs(raw: string | null | undefined): number | null {
  if (!raw || !String(raw).trim()) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Deterministic newest-first ordering. The API orders by timestamp DESC, but
 * same-date rows need a stable tie-break (created_at, then id) so the
 * latest-in-window selection cannot flap between renders.
 */
export function sortVibrationRowsNewestFirst<T extends SavedAnalysisResult>(
  rows: readonly T[]
): T[] {
  return [...rows].sort((a, b) => {
    const at = timestampMs(a.timestamp);
    const bt = timestampMs(b.timestamp);
    const aTime = at ?? Number.NEGATIVE_INFINITY;
    const bTime = bt ?? Number.NEGATIVE_INFINITY;
    if (bTime !== aTime) return bTime - aTime;

    const ac = timestampMs(a.created_at);
    const bc = timestampMs(b.created_at);
    const aCreated = ac ?? Number.NEGATIVE_INFINITY;
    const bCreated = bc ?? Number.NEGATIVE_INFINITY;
    if (bCreated !== aCreated) return bCreated - aCreated;

    return String(b.id ?? "").localeCompare(String(a.id ?? ""), undefined, {
      numeric: true,
      sensitivity: "base"
    });
  });
}

/** Exactly the rows every broadband surface must read for this range/toggle. */
export function vibrationRowsInScope<T extends SavedAnalysisResult>(
  rows: readonly T[],
  runningOnly: boolean
): T[] {
  return applyVibrationRunningStateFilter(
    sortVibrationRowsNewestFirst(rows),
    runningOnly
  );
}

/** Latest-in-window row — the single selection shared by KPI/matrix/axes. */
export function selectLatestVibrationRow<T extends SavedAnalysisResult>(
  rows: readonly T[],
  runningOnly: boolean
): T | null {
  return vibrationRowsInScope(rows, runningOnly)[0] ?? null;
}

export function readVibrationOverallVelocity(
  row: SavedAnalysisResult | null | undefined
): number | null {
  if (!row) return null;
  const td = asRecord(row.telemetry_data);
  const trend = asRecord(td.vibration_trend_record);
  const trendBroadband = asRecord(trend.broadband);
  const record = extractVibrationRecordFromAnalysis(row);
  const candidates: unknown[] = [
    td.overall_velocity,
    td.overallVelocity,
    trendBroadband.overallVelocity,
    record?.broadband.overallVelocity
  ];
  for (const candidate of candidates) {
    const value = finiteNumber(candidate);
    if (value != null && value >= 0) return value;
  }
  return null;
}

export function readVibrationOverallAcceleration(
  row: SavedAnalysisResult | null | undefined
): number | null {
  if (!row) return null;
  const td = asRecord(row.telemetry_data);
  const trend = asRecord(td.vibration_trend_record);
  const trendBroadband = asRecord(trend.broadband);
  const record = extractVibrationRecordFromAnalysis(row);
  const candidates: unknown[] = [
    td.overall_acceleration,
    td.overallAcceleration,
    trendBroadband.overallAcceleration,
    record?.broadband.overallAcceleration
  ];
  for (const candidate of candidates) {
    const value = finiteNumber(candidate);
    if (value != null && value >= 0) return value;
  }
  return null;
}

export interface VibrationAxisValues {
  horizontal: number | null;
  vertical: number | null;
  axial: number | null;
}

function amplitudeForAxis(
  peaks: unknown[],
  axisPattern: RegExp
): number | null {
  for (const raw of peaks) {
    if (!raw || typeof raw !== "object") continue;
    const peak = raw as Record<string, unknown>;
    const label = String(peak.label ?? peak.axis ?? peak.name ?? "");
    if (!axisPattern.test(label)) continue;
    const amplitude = finiteNumber(
      peak.amplitude ?? peak.amp ?? peak.value ?? peak.mm_s
    );
    if (amplitude != null) return amplitude;
  }
  return null;
}

/**
 * Latest-in-window per-axis values. No overall-peak fallback: using the
 * overall value for the H card would put a different metric under an axis
 * label. Missing axis-tagged peaks are honestly null.
 */
export function readVibrationPerAxis(
  row: SavedAnalysisResult | null | undefined
): VibrationAxisValues {
  if (!row) return { horizontal: null, vertical: null, axial: null };
  const peaks = Array.isArray(row.peaks) ? row.peaks : [];
  return {
    horizontal: amplitudeForAxis(peaks, /\bH\b|horiz/i),
    vertical: amplitudeForAxis(peaks, /\bV\b|vert/i),
    axial: amplitudeForAxis(peaks, /\bA\b|axial/i)
  };
}

/**
 * Detect an unresolved multi-agent split from the persisted consensus detail
 * block. The consensus engine records its disagreement note in
 * `refereeDebateSummary`; a normal-vs-C/D split is also a contradiction even
 * when the note is absent.
 */
export function consensusContradicts(details: unknown): boolean {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return false;
  }
  const record = details as Record<string, unknown>;
  const debate = String(record.refereeDebateSummary || "");
  if (/agents?\s+disagree|disagreement|contradict|conflict/i.test(debate)) {
    return true;
  }
  const a = String(record.modelA_Hypothesis || "");
  const b = String(record.modelB_Hypothesis || "");
  const aHealthy = /\bnormal\b|healthy/i.test(a);
  const bHealthy = /\bnormal\b|healthy/i.test(b);
  const aElevated = /zone\s*[cd]\b/i.test(a);
  const bElevated = /zone\s*[cd]\b/i.test(b);
  return (aHealthy && bElevated) || (bHealthy && aElevated);
}

/**
 * The referee stage may already flag an unresolved/low-confidence verdict
 * without using the word "disagree". Those rows are still not silently
 * resolvable to one agent.
 */
export function consensusNeedsReview(details: unknown): boolean {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return false;
  }
  const debate = String(
    (details as Record<string, unknown>).refereeDebateSummary || ""
  );
  return /inconclusive|manual review|review recommended|needs? review|below (the )?threshold|low (agent )?confidence|single-agent/i.test(
    debate
  );
}

export type VibrationVerdictStatus =
  | "reconciled"
  | "indeterminate"
  | "no-sample";

export interface ReconciledVibrationVerdict {
  status: VibrationVerdictStatus;
  primaryFault: string;
  primaryFaultRaw: string | null;
  healthScore: number | null;
  healthSource: "iso-velocity" | "none";
  healthProvenance: string | null;
  /** Agents/referee could not settle on one verdict. */
  conflict: boolean;
  /** Overall velocity actually used for the health derivation. */
  overallVelocityMmS: number | null;
  note: string | null;
}

const NO_FAULT_PATTERN =
  /none detected|no significant fault|no actionable|normal operation|^normal$|healthy|no fault/i;

/** Stored placeholder dashes are not a reported fault. */
function isBlankFault(value: string | null | undefined): boolean {
  return !value || /^[\s\u2014-]+$/.test(value);
}

function reportedFault(
  row: SavedAnalysisResult,
  record: VibrationDiagnosticRecord | null
): string | null {
  if (!isBlankFault(row.primary_fault)) return row.primary_fault;
  const fromRecord = record?.broadband.primaryFault;
  return isBlankFault(fromRecord) ? null : fromRecord ?? null;
}

/**
 * Reconcile the persisted multi-agent verdict for the KPI surfaces.
 *
 * - agents agree -> the stored/referee verdict is the KPI verdict
 * - agents disagree (or referee asks for review) -> "Indeterminate — review"
 * - health is DERIVED from the latest running-state overall velocity, so a
 *   blank/stopped velocity can never leave a bare green confidence number
 *   presented as measured machine health.
 *
 * The narrative panel keeps both agent readings; this function never erases
 * or rewrites `consensus_details`.
 */
export function reconcileVibrationVerdict(
  row: SavedAnalysisResult | null | undefined,
  machineClass?: string | null
): ReconciledVibrationVerdict {
  if (!row) {
    return {
      status: "no-sample",
      primaryFault: VIBRATION_NOT_MEASURED,
      primaryFaultRaw: null,
      healthScore: null,
      healthSource: "none",
      healthProvenance: VIBRATION_NOT_MEASURED,
      conflict: false,
      overallVelocityMmS: null,
      note: "No vibration sample is in the selected window."
    };
  }

  const record = extractVibrationRecordFromAnalysis(row);
  const rawFault = reportedFault(row, record);
  const conflict =
    consensusContradicts(row.consensus_details) ||
    consensusNeedsReview(row.consensus_details);
  const sample = vibrationSampleState(row);
  const velocity =
    sample.stopped || (sample.overallVelocity != null && sample.overallVelocity <= 0)
      ? null
      : sample.overallVelocity;

  if (conflict) {
    return {
      status: "indeterminate",
      primaryFault: VIBRATION_INDETERMINATE_VERDICT,
      primaryFaultRaw: rawFault,
      healthScore: null,
      healthSource: "none",
      healthProvenance:
        "Health blank \u2014 agents disagree. Both readings remain in the narrative panel; manual review required.",
      conflict: true,
      overallVelocityMmS: velocity,
      note: "Agents disagree beyond threshold; neither agent is silently selected."
    };
  }

  let primaryFault = rawFault?.trim() || "";
  if (!primaryFault) {
    primaryFault = VIBRATION_NOT_REPORTED;
  } else if (NO_FAULT_PATTERN.test(primaryFault)) {
    primaryFault = VIBRATION_NOT_DETECTED;
  }

  if (sample.stopped) {
    return {
      status: "reconciled",
      primaryFault,
      primaryFaultRaw: rawFault,
      healthScore: null,
      healthSource: "none",
      healthProvenance:
        "Health blank \u2014 latest in-window sample is stopped (load telemetry below the running threshold).",
      conflict: false,
      overallVelocityMmS: null,
      note: "Latest in-window sample is stopped."
    };
  }

  const healthScore = healthScoreFromVelocityMmS(velocity, machineClass);
  return {
    status: "reconciled",
    primaryFault,
    primaryFaultRaw: rawFault,
    healthScore,
    healthSource: healthScore != null ? "iso-velocity" : "none",
    healthProvenance:
      healthScore != null && velocity != null
        ? `Derived from ISO 20816 overall velocity (${velocity.toFixed(2)} mm/s RMS)`
        : "Health blank \u2014 no overall velocity measured for this window.",
    conflict: false,
    overallVelocityMmS: velocity,
    note: null
  };
}

export function latestVibrationRecordFromRows(
  rows: readonly SavedAnalysisResult[]
): VibrationDiagnosticRecord | null {
  for (const row of sortVibrationRowsNewestFirst(rows)) {
    const record = extractVibrationRecordFromAnalysis(row);
    if (record) {
      return {
        ...record,
        timestamp: record.timestamp || row.timestamp
      };
    }
  }
  return null;
}
