/**
 * Unified vibration diagnostic record — produced by Run Diagnostics extraction
 * and consumed by Trend Analyzer tabs (no mock data).
 */

import type { ExtractedVibrationData } from "./vibrationImageExtractor";
import type { SavedAnalysisResult } from "../analysisPersistence";
import {
  metricsFromWaveformSamples,
  normalizeWaveformMetrics
} from "../waveformMetrics";

export const VIBRATION_TREND_RECORD_TYPE = "vibration_trend_record" as const;
export const VIBRATION_LOCAL_CACHE_KEY = "spectra_cm_vibration_trend_records_v1";

export interface VibrationTrendBroadband {
  overallVelocity: number;
  overallAcceleration: number;
  healthScore: number;
  primaryFault: string;
  /** Peak enveloping / demodulation acceleration (gE / gSE) when recorded. */
  peakGe?: number;
  /** Crest factor / kurtosis proxy when recorded from waveform or telemetry. */
  kurtosis?: number;
}

export interface VibrationTrendPoint {
  frequency: number;
  amplitude: number;
  /** Present for enveloping / bearing-band points (BPFO, BPFI, …). */
  label?: string;
}

export interface VibrationWaveformPoint {
  time: number;
  amplitude: number;
}

export interface VibrationDiagnosticRecord {
  assetId: string;
  timestamp: string;
  broadband: VibrationTrendBroadband;
  spectral: VibrationTrendPoint[];
  enveloping: VibrationTrendPoint[];
  waveform: VibrationWaveformPoint[];
  /** Optional provenance */
  sourceImage?: string;
  extractionConfidence?: number;
  rpm?: number;
  component?: string | null;
  waveformMetrics?: {
    peakAmplitude: number;
    crestFactor: number;
    rmsValue: number;
  };
  /** Extended Phase-1 waveform KPIs from vision / sample analysis. */
  waveformAnalysis?: {
    peakToPeak: number;
    crestFactor: number;
    impactCount: number;
    symmetry: "Symmetric" | "Clipped" | "Asymmetric";
    timePerRevolutionMs?: number | null;
    modulation?: "None" | "Amplitude" | "Frequency";
  };
  context?: {
    motorSpeedRPM: number;
    loadFactorPercent: number | null;
    analysisType: "vibration";
  };
  metadata?: {
    sourceImage?: string;
    extractionConfidence?: number;
    processedAt: string;
    extractionMethod?: "vision" | "fallback";
    error?: string;
  };
}

function finite(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function healthFromVelocity(velocityMmS: number): number {
  // Rough ISO-style mapping: lower velocity → higher health
  if (!(velocityMmS > 0)) return 70;
  if (velocityMmS < 1.4) return 92;
  if (velocityMmS < 2.8) return 78;
  if (velocityMmS < 4.5) return 58;
  if (velocityMmS < 7.1) return 38;
  return 22;
}

function envelopingFromExtracted(
  data: ExtractedVibrationData
): VibrationTrendPoint[] {
  const bf = data.bearingFrequencies;
  if (!bf) return [];
  const rows: VibrationTrendPoint[] = [];
  const push = (label: string, hz?: number) => {
    if (hz == null || !Number.isFinite(hz) || hz <= 0) return;
    const near = data.spectralPeaks.find(
      (p) => Math.abs(p.frequency - hz) < Math.max(2, hz * 0.03)
    );
    rows.push({
      frequency: hz,
      amplitude: near?.amplitude ?? 0.05,
      label
    });
  };
  push("BPFO", bf.bpfo);
  push("BPFI", bf.bpfi);
  push("BSF", bf.bsf);
  push("FTF", bf.ftf);
  return rows;
}

/**
 * Build the unified Trend Analyzer record from vision extraction (+ optional AI result).
 */
export function buildVibrationDiagnosticRecord(params: {
  assetId: string;
  extracted: ExtractedVibrationData;
  component?: string | null;
  healthScore?: number | null;
  primaryFault?: string | null;
  timestamp?: string;
}): VibrationDiagnosticRecord {
  const { extracted, assetId } = params;
  const velocity = finite(extracted.overallVelocity, 0);
  const acceleration = finite(extracted.overallAcceleration, 0);
  const peakGeFromEnvelope =
    extracted.envelopingPeaks && extracted.envelopingPeaks.length > 0
      ? Math.max(
          ...extracted.envelopingPeaks.map((p) => finite(p.amplitude, 0)),
          0
        )
      : undefined;
  const peakGe =
    peakGeFromEnvelope != null && peakGeFromEnvelope > 0
      ? peakGeFromEnvelope
      : acceleration > 0
        ? acceleration
        : undefined;
  const kurtosis =
    extracted.waveformMetrics?.crestFactor != null &&
    Number.isFinite(extracted.waveformMetrics.crestFactor)
      ? extracted.waveformMetrics.crestFactor
      : undefined;
  const healthScore =
    params.healthScore != null && Number.isFinite(params.healthScore)
      ? Number(params.healthScore)
      : healthFromVelocity(velocity);

  const waveform: VibrationWaveformPoint[] =
    extracted.waveformSamples?.map((p) => ({
      time: p.time,
      amplitude: p.amplitude
    })) || [];

  const spectral = (extracted.spectralPeaks || []).map((p) => ({
    frequency: p.frequency,
    amplitude: p.amplitude
  }));

  const enveloping =
    extracted.envelopingPeaks && extracted.envelopingPeaks.length > 0
      ? extracted.envelopingPeaks.map((p) => ({
          frequency: p.frequency,
          amplitude: p.amplitude,
          ...(p.label ? { label: p.label } : {})
        }))
      : envelopingFromExtracted(extracted);

  const motorSpeedRPM =
    extracted.rpm != null && Number.isFinite(extracted.rpm) && extracted.rpm > 0
      ? extracted.rpm
      : 1780;

  const timestamp = params.timestamp || new Date().toISOString();

  const derivedWaveform =
    waveform.length > 0
      ? metricsFromWaveformSamples(waveform, motorSpeedRPM)
      : null;
  const fromExtractedMetrics = extracted.waveformMetrics
    ? normalizeWaveformMetrics(
        {
          peakToPeak:
            extracted.waveformMetrics.peakAmplitude * 2 || undefined,
          crestFactor: extracted.waveformMetrics.crestFactor,
          impactCount: derivedWaveform?.impactCount,
          symmetry: derivedWaveform?.symmetry,
          rmsValue: extracted.waveformMetrics.rmsValue,
          peakAmplitude: extracted.waveformMetrics.peakAmplitude
        },
        motorSpeedRPM
      )
    : null;
  const waveformAnalysis = derivedWaveform || fromExtractedMetrics || undefined;

  const record: VibrationDiagnosticRecord = {
    assetId,
    timestamp,
    broadband: {
      overallVelocity: velocity,
      overallAcceleration: acceleration,
      healthScore,
      primaryFault:
        params.primaryFault ||
        (velocity > 4.5
          ? "Elevated overall vibration"
          : velocity > 0
            ? "Acceptable broadband levels"
            : "Spectrum extracted — overall level pending"),
      ...(peakGe != null && peakGe > 0 ? { peakGe } : {}),
      ...(kurtosis != null && kurtosis > 0
        ? { kurtosis }
        : waveformAnalysis?.crestFactor
          ? { kurtosis: waveformAnalysis.crestFactor }
          : {})
    },
    spectral,
    enveloping,
    waveform,
    sourceImage: extracted.sourceImage,
    extractionConfidence: extracted.extractionConfidence,
    rpm: extracted.rpm ?? motorSpeedRPM,
    component: params.component ?? null,
    ...(extracted.waveformMetrics
      ? { waveformMetrics: extracted.waveformMetrics }
      : waveformAnalysis
        ? {
            waveformMetrics: {
              peakAmplitude:
                waveformAnalysis.peakAmplitude ??
                waveformAnalysis.peakToPeak / 2,
              crestFactor: waveformAnalysis.crestFactor,
              rmsValue:
                waveformAnalysis.rmsValue ??
                (waveformAnalysis.crestFactor > 0
                  ? waveformAnalysis.peakToPeak /
                    2 /
                    waveformAnalysis.crestFactor
                  : 0)
            }
          }
        : {}),
    ...(waveformAnalysis
      ? {
          waveformAnalysis: {
            peakToPeak: waveformAnalysis.peakToPeak,
            crestFactor: waveformAnalysis.crestFactor,
            impactCount: waveformAnalysis.impactCount,
            symmetry: waveformAnalysis.symmetry,
            timePerRevolutionMs: waveformAnalysis.timePerRevolutionMs,
            modulation: waveformAnalysis.modulation
          }
        }
      : {}),
    context: {
      motorSpeedRPM,
      loadFactorPercent: null,
      analysisType: "vibration"
    },
    metadata: {
      sourceImage: extracted.sourceImage,
      extractionConfidence: extracted.extractionConfidence,
      processedAt: timestamp,
      extractionMethod: "vision"
    }
  };

  console.log("💾 Final diagnostic record to save:", {
    assetId: record.assetId,
    timestamp: record.timestamp,
    broadband: record.broadband,
    spectral: `${record.spectral.length} peaks`,
    enveloping: `${record.enveloping.length} bands`,
    waveform: `${record.waveform.length} samples`,
    firstFewPeaks: record.spectral.slice(0, 3)
  });

  return record;
}

/** Empty-spectral fallback when vision extraction times out — do not crash the diagnostic run. */
export function buildFallbackVibrationDiagnosticRecord(params: {
  assetId: string;
  sourceImage?: string;
  component?: string | null;
  overallVelocity?: number | null;
  overallAcceleration?: number | null;
  error?: string;
}): VibrationDiagnosticRecord {
  const timestamp = new Date().toISOString();
  const velocity =
    params.overallVelocity != null && Number.isFinite(params.overallVelocity)
      ? params.overallVelocity
      : 0;
  const acceleration =
    params.overallAcceleration != null &&
    Number.isFinite(params.overallAcceleration)
      ? params.overallAcceleration
      : 0;
  return {
    assetId: params.assetId,
    timestamp,
    broadband: {
      overallVelocity: velocity,
      overallAcceleration: acceleration,
      healthScore: 0,
      primaryFault: "Spectral extraction timed out"
    },
    spectral: [],
    enveloping: [],
    waveform: [],
    sourceImage: params.sourceImage,
    extractionConfidence: 0,
    component: params.component ?? null,
    metadata: {
      sourceImage: params.sourceImage,
      extractionConfidence: 0,
      processedAt: timestamp,
      extractionMethod: "fallback",
      error: params.error || "Spectral extraction timed out"
    }
  };
}

/** Persist latest record per asset in localStorage (offline / DB fallback). */
export function cacheVibrationRecordLocally(
  record: VibrationDiagnosticRecord
): void {
  const isFallback = record?.metadata?.extractionMethod === "fallback";
  if (!record?.spectral?.length && !isFallback) {
    console.warn("⚠️ [VIBRATION] Skipping local cache — no spectral peaks");
    return;
  }
  try {
    const raw = localStorage.getItem(VIBRATION_LOCAL_CACHE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, VibrationDiagnosticRecord>) : {};
    if (!map || typeof map !== "object") {
      localStorage.setItem(
        VIBRATION_LOCAL_CACHE_KEY,
        JSON.stringify({ [record.assetId]: record })
      );
      return;
    }
    map[record.assetId] = record;
    localStorage.setItem(VIBRATION_LOCAL_CACHE_KEY, JSON.stringify(map));
    console.log("💾 [VIBRATION] Cached vibration record locally:", {
      assetId: record.assetId,
      spectralLength: record.spectral.length
    });
  } catch (err) {
    console.warn("[vibrationDiagnosticRecord] local cache write failed:", err);
  }
}

/** Save extracted or fallback diagnostic record to the local cache. */
export function saveDiagnosticRecord(record: VibrationDiagnosticRecord): void {
  cacheVibrationRecordLocally(record);
}

export function readCachedVibrationRecord(
  assetId: string
): VibrationDiagnosticRecord | null {
  if (!assetId) return null;
  try {
    const raw = localStorage.getItem(VIBRATION_LOCAL_CACHE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, VibrationDiagnosticRecord>;
    const rec = map?.[assetId];
    return rec && typeof rec === "object" ? rec : null;
  } catch {
    return null;
  }
}

function recordFromUnknown(raw: unknown): VibrationDiagnosticRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const broadband = o.broadband;
  if (!broadband || typeof broadband !== "object") return null;
  const bb = broadband as Record<string, unknown>;
  const spectral = Array.isArray(o.spectral) ? o.spectral : [];
  const enveloping = Array.isArray(o.enveloping) ? o.enveloping : [];
  const waveform = Array.isArray(o.waveform) ? o.waveform : [];
  return {
    assetId: String(o.assetId || ""),
    timestamp: String(o.timestamp || new Date().toISOString()),
    broadband: {
      overallVelocity: finite(bb.overallVelocity),
      overallAcceleration: finite(bb.overallAcceleration),
      healthScore: finite(bb.healthScore, 0),
      primaryFault: String(bb.primaryFault || "—"),
      ...(Number.isFinite(Number(bb.peakGe ?? bb.gE ?? bb.gSE)) &&
      Number(bb.peakGe ?? bb.gE ?? bb.gSE) > 0
        ? { peakGe: Number(bb.peakGe ?? bb.gE ?? bb.gSE) }
        : {}),
      ...(Number.isFinite(Number(bb.kurtosis ?? bb.crestFactor)) &&
      Number(bb.kurtosis ?? bb.crestFactor) > 0
        ? { kurtosis: Number(bb.kurtosis ?? bb.crestFactor) }
        : {})
    },
    spectral: spectral
      .filter((p) => p && typeof p === "object")
      .map((p) => {
        const row = p as Record<string, unknown>;
        return {
          frequency: finite(row.frequency),
          amplitude: finite(row.amplitude),
          ...(typeof row.label === "string" ? { label: row.label } : {})
        };
      }),
    enveloping: enveloping
      .filter((p) => p && typeof p === "object")
      .map((p) => {
        const row = p as Record<string, unknown>;
        return {
          frequency: finite(row.frequency),
          amplitude: finite(row.amplitude),
          ...(typeof row.label === "string" ? { label: row.label } : {})
        };
      }),
    waveform: waveform
      .filter((p) => p && typeof p === "object")
      .map((p) => {
        const row = p as Record<string, unknown>;
        return {
          time: finite(row.time),
          amplitude: finite(row.amplitude)
        };
      }),
    sourceImage:
      typeof o.sourceImage === "string" ? o.sourceImage : undefined,
    ...(Number.isFinite(Number(o.extractionConfidence))
      ? { extractionConfidence: Number(o.extractionConfidence) }
      : {}),
    ...(Number.isFinite(Number(o.rpm)) ? { rpm: Number(o.rpm) } : {}),
    component: (o.component as string | null) ?? null,
    ...(o.waveformMetrics && typeof o.waveformMetrics === "object"
      ? {
          waveformMetrics: {
            peakAmplitude: finite(
              (o.waveformMetrics as Record<string, unknown>).peakAmplitude
            ),
            crestFactor: finite(
              (o.waveformMetrics as Record<string, unknown>).crestFactor
            ),
            rmsValue: finite(
              (o.waveformMetrics as Record<string, unknown>).rmsValue
            )
          }
        }
      : {}),
    ...(normalizeWaveformMetrics(o.waveformAnalysis ?? o.waveform, Number(o.rpm))
      ? {
          waveformAnalysis: (() => {
            const n = normalizeWaveformMetrics(
              o.waveformAnalysis ?? o.waveform,
              Number(o.rpm)
            )!;
            return {
              peakToPeak: n.peakToPeak,
              crestFactor: n.crestFactor,
              impactCount: n.impactCount,
              symmetry: n.symmetry,
              timePerRevolutionMs: n.timePerRevolutionMs,
              modulation: n.modulation
            };
          })()
        }
      : {})
  };
}

/**
 * Pull the unified vibration trend record from a saved analysis_results row.
 */
export function extractVibrationRecordFromAnalysis(
  r: SavedAnalysisResult | null | undefined
): VibrationDiagnosticRecord | null {
  if (!r) return null;

  const td =
    r.telemetry_data && typeof r.telemetry_data === "object"
      ? r.telemetry_data
      : null;
  if (td?.vibration_trend_record) {
    const rec = recordFromUnknown(td.vibration_trend_record);
    if (rec) {
      const merged = {
        ...rec,
        assetId: rec.assetId || String(r.asset_id || "")
      };
      if (!merged.spectral.length && Array.isArray(td.spectral)) {
        merged.spectral = (td.spectral as unknown[])
          .filter((p) => p && typeof p === "object")
          .map((p) => {
            const row = p as Record<string, unknown>;
            return {
              frequency: finite(row.frequency),
              amplitude: finite(row.amplitude)
            };
          })
          .filter((p) => p.frequency > 0 || p.amplitude > 0);
      }
      return merged;
    }
  }

  // peaks[] entry stamped by Diagnose on save
  const peaks = Array.isArray(r.peaks) ? r.peaks : [];
  for (const raw of peaks) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (
      p.type === VIBRATION_TREND_RECORD_TYPE ||
      p.type === "vibration_trend_record"
    ) {
      const rec = recordFromUnknown(p.record ?? p);
      if (rec) return { ...rec, assetId: rec.assetId || String(r.asset_id || "") };
    }
  }

  return null;
}

export function hasSpectralPeaks(
  record: VibrationDiagnosticRecord | null | undefined
): boolean {
  return Boolean(record?.spectral && record.spectral.length > 0);
}

export function hasVibrationTrendCharts(
  record: VibrationDiagnosticRecord | null | undefined
): boolean {
  if (!record) return false;
  return (
    hasSpectralPeaks(record) ||
    record.enveloping.length > 0 ||
    record.waveform.length > 0 ||
    record.broadband.overallVelocity > 0 ||
    (record.broadband.overallAcceleration > 0) ||
    (Number(record.broadband.peakGe) > 0)
  );
}

/** Real enveloping metrics from a saved analysis row — nulls when unrecorded (no mock fill). */
export interface EnvelopingTrendPoint {
  analysisId: string;
  date: string;
  timestamp: string;
  peakGe: number | null;
  kurtosis: number | null;
  overallAcceleration: number | null;
  healthScore: number | null;
  primaryFault: string;
  isBaseline: boolean;
  bpfoAmp: number | null;
  bpfiAmp: number | null;
  bsfAmp: number | null;
  ftfAmp: number | null;
}

function amplitudeForLabel(
  points: Array<{ frequency: number; amplitude: number; label?: string }>,
  label: string
): number | null {
  const hit = points.find((p) =>
    String(p.label || "").toUpperCase().includes(label.toUpperCase())
  );
  if (!hit || !(hit.amplitude > 0)) return null;
  return hit.amplitude;
}

export function extractEnvelopingTrendPoint(
  r: SavedAnalysisResult
): EnvelopingTrendPoint | null {
  const rec = extractVibrationRecordFromAnalysis(r);
  const td =
    r.telemetry_data && typeof r.telemetry_data === "object"
      ? (r.telemetry_data as Record<string, unknown>)
      : null;
  const poly =
    td?.polymorphic && typeof td.polymorphic === "object"
      ? (td.polymorphic as Record<string, unknown>)
      : null;

  const peakGeCandidates = [
    rec?.broadband.peakGe,
    rec?.broadband.overallAcceleration,
    r.envelope_peak_amplitude,
    poly?.peakGe,
    poly?.gE,
    poly?.gSE,
    td?.peakGe,
    td?.gE,
    td?.gSE,
    (td?.envelope as Record<string, unknown> | undefined)?.peakAmplitude,
    (td?.envelope as Record<string, unknown> | undefined)?.peak_amplitude
  ]
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  const kurtosisCandidates = [
    rec?.broadband.kurtosis,
    rec?.waveformMetrics?.crestFactor,
    poly?.kurtosis,
    poly?.crestFactor,
    td?.kurtosis,
    td?.crest_factor
  ]
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  const peakGe = peakGeCandidates.length > 0 ? peakGeCandidates[0] : null;
  const kurtosis = kurtosisCandidates.length > 0 ? kurtosisCandidates[0] : null;
  const overallAcceleration =
    rec?.broadband.overallAcceleration != null &&
    rec.broadband.overallAcceleration > 0
      ? rec.broadband.overallAcceleration
      : peakGe;
  const enveloping = rec?.enveloping || [];

  // Skip rows with no enveloping-relevant measurement at all
  if (
    peakGe == null &&
    kurtosis == null &&
    enveloping.length === 0 &&
    !(overallAcceleration != null && overallAcceleration > 0)
  ) {
    return null;
  }

  const ts = r.timestamp || rec?.timestamp || "";
  return {
    analysisId: String(r.id),
    date: ts
      ? new Date(ts).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric"
        })
      : "—",
    timestamp: ts,
    peakGe,
    kurtosis,
    overallAcceleration,
    healthScore:
      r.health_score != null && Number.isFinite(Number(r.health_score))
        ? Number(r.health_score)
        : rec?.broadband.healthScore ?? null,
    primaryFault: String(
      r.primary_fault || rec?.broadband.primaryFault || "—"
    ),
    isBaseline: Boolean(r.is_baseline),
    bpfoAmp: amplitudeForLabel(enveloping, "BPFO"),
    bpfiAmp: amplitudeForLabel(enveloping, "BPFI"),
    bsfAmp: amplitudeForLabel(enveloping, "BSF"),
    ftfAmp: amplitudeForLabel(enveloping, "FTF")
  };
}

/** Real waveform KPIs from a saved analysis row — null when unrecorded. */
export interface WaveformTrendPoint {
  analysisId: string;
  date: string;
  timestamp: string;
  peakToPeak: number | null;
  crestFactor: number | null;
  impactCount: number | null;
  symmetry: string | null;
  modulation: string | null;
  healthScore: number | null;
  primaryFault: string;
  rpm: number | null;
}

export function extractWaveformTrendPoint(
  r: SavedAnalysisResult
): WaveformTrendPoint | null {
  const rec = extractVibrationRecordFromAnalysis(r);
  const td =
    r.telemetry_data && typeof r.telemetry_data === "object"
      ? (r.telemetry_data as Record<string, unknown>)
      : null;
  const wa = rec?.waveformAnalysis;
  const wm = rec?.waveformMetrics;

  const peakToPeakCandidates = [
    r.waveform_peak_to_peak,
    wa?.peakToPeak,
    td?.waveform_peak_to_peak,
    (td?.waveform as Record<string, unknown> | undefined)?.peakToPeak
  ]
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  const crestCandidates = [
    r.waveform_crest_factor,
    wa?.crestFactor,
    wm?.crestFactor,
    td?.waveform_crest_factor,
    (td?.waveform as Record<string, unknown> | undefined)?.crestFactor
  ]
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  const impactCandidates = [
    r.waveform_impact_count,
    wa?.impactCount,
    td?.waveform_impact_count,
    (td?.waveform as Record<string, unknown> | undefined)?.impactCount
  ]
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n >= 0);

  const peakToPeak =
    peakToPeakCandidates.length > 0 ? peakToPeakCandidates[0] : null;
  const crestFactor =
    crestCandidates.length > 0 ? crestCandidates[0] : null;
  const impactCount =
    r.waveform_impact_count != null ||
    wa?.impactCount != null ||
    (td && "waveform_impact_count" in td)
      ? impactCandidates.length > 0
        ? impactCandidates[0]
        : null
      : impactCandidates.length > 0
        ? impactCandidates[0]
        : null;

  const symmetry =
    r.waveform_symmetry ||
    wa?.symmetry ||
    (typeof (td?.waveform as Record<string, unknown> | undefined)?.symmetry ===
    "string"
      ? String((td?.waveform as Record<string, unknown>).symmetry)
      : null) ||
    null;

  const modulation =
    r.waveform_modulation ||
    wa?.modulation ||
    (typeof (td?.waveform as Record<string, unknown> | undefined)?.modulation ===
    "string"
      ? String((td?.waveform as Record<string, unknown>).modulation)
      : null) ||
    null;

  const hasSamples = Boolean(rec?.waveform?.length);
  const hasMetrics =
    peakToPeak != null ||
    crestFactor != null ||
    impactCount != null ||
    Boolean(symmetry) ||
    hasSamples;

  if (!hasMetrics) return null;

  const ts = r.timestamp || rec?.timestamp || "";
  return {
    analysisId: String(r.id),
    date: ts
      ? new Date(ts).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric"
        })
      : "—",
    timestamp: ts,
    peakToPeak,
    crestFactor,
    impactCount,
    symmetry,
    modulation,
    healthScore:
      r.health_score != null && Number.isFinite(Number(r.health_score))
        ? Number(r.health_score)
        : rec?.broadband.healthScore ?? null,
    primaryFault: String(
      r.primary_fault || rec?.broadband.primaryFault || "—"
    ),
    rpm:
      rec?.rpm != null && rec.rpm > 0
        ? rec.rpm
        : rec?.context?.motorSpeedRPM ?? null
  };
}
