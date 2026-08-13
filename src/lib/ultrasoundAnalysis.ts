/**
 * Ultrasound Analysis — shared types + client helpers.
 * TEMPLATE mirrored from thermographyAnalysis.ts (MCA / Oil next).
 *
 * Server AI execution lives in `ultrasoundAnalysisEngine.ts`
 * (imported only by Express / Node API routes — keeps model SDKs out of the browser bundle).
 *
 * WHERE TO INSERT THE MASTER ULTRASOUND AI PROMPT:
 *   → Replace the body of `ULTRASOUND_MASTER_PROMPT` below (same role as THERMOGRAPHY_MASTER_PROMPT).
 *   → The engine (`ultrasoundAnalysisEngine.ts`) already imports and will use it once AI is wired.
 */

import type { VibrationAnalysisResult } from "./consensusEngine";

/** Canonical Express + client path — keep in sync with server.ts */
export const ANALYZE_ULTRASOUND_API_PATH = "/api/analyze-ultrasound";

export type UltrasoundFaultSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface UltrasoundFaultItem {
  fault: string;
  severity: UltrasoundFaultSeverity;
  confidence: number;
  description: string;
}

/** Canonical pipeline result (UI + /api/save-analysis-result). */
export interface UltrasoundResult {
  health_score: number; // 0-100
  primary_fault: string; // e.g., "Air Leak", "Bearing Defect"
  fault_list: UltrasoundFaultItem[];
  peaks: {
    peak_dbmv: number;
    rms_dbmv: number;
    baseline_dbmv?: number;
    delta_db?: number;
    mode?: string;
  };
  financial_impact: {
    preventive_cost: number;
    failure_cost: number;
    roi_percentage: number;
    downtime_loss: number;
  };
  recommendations: string[];
  /** Optional rich payload (persisted in consensus_details). */
  detailed?: UltrasoundDetailedAnalysis | null;
}

export interface UltrasoundDetailedAnalysis {
  mode?: string;
  transducer?: string;
  heterodyne_khz?: number;
  gain_db?: number;
  analysis?: Record<string, unknown>;
  confidence_score?: number;
  iso_29821_note?: string | null;
}

export interface UltrasoundMetadata {
  asset?: string;
  component?: string;
  route?: string;
  assetTag?: string;
  location?: string;
  mode?: "leak" | "mechanical" | "electrical" | "valve" | string;
  transducer?: string;
  hardwareBrand?: string;
  heterodyneKhz?: number | string;
  gainDb?: number | string;
  distance?: number | string;
  distanceUnit?: string;
  peakDbuV?: number | string;
  rmsDbuV?: number | string;
  wavFileName?: string;
  photoFileName?: string;
  gasType?: string;
  systemPressure?: number | string;
  equipmentRpm?: number | string;
  voltageClass?: string;
  valveType?: string;
  [key: string]: unknown;
}

export interface AnalyzeUltrasoundRequest {
  /** Optional WAV / audio as data URL or raw base64 (future AI). */
  audioBase64?: string;
  /** Optional visual context image. */
  imageBase64?: string;
  metadata?: UltrasoundMetadata;
}

export type AnalyzeUltrasoundOutcome =
  | { success: true; data: UltrasoundResult }
  | {
      success: false;
      errorType:
        | "MISSING_INPUT"
        | "MISSING_API_KEY"
        | "ANALYSIS_ERROR"
        | "PARSE_ERROR";
      title: string;
      message: string;
      httpStatus: number;
      detail?: string;
    };

/**
 * Master AI prompt — PLACEHOLDER.
 *
 * ★ INSERT THE FULL MASTER ULTRASOUND AI PROMPT HERE ★
 * Paste the Level I/II UE / ISO 29821 / ASNT system prompt as the template string body.
 * Keep the "return JSON only" contract aligned with normalizeUltrasoundResult().
 */
export const ULTRASOUND_MASTER_PROMPT = `TODO: Insert Master Ultrasound AI Prompt here.

You are a Certified Ultrasound Analyst (ISO 29821 / ASNT).
Return ONLY valid JSON matching the UltrasoundResult schema:
{
  "health_score": 0-100,
  "primary_fault": string,
  "fault_list": [{ "fault", "severity", "confidence", "description" }],
  "peaks": { "peak_dbmv", "rms_dbmv", "baseline_dbmv?", "delta_db?", "mode?" },
  "financial_impact": { "preventive_cost", "failure_cost", "roi_percentage", "downtime_loss" },
  "recommendations": string[]
}
`;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asText(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  const s = String(value).trim();
  return s || fallback;
}

function normalizeSeverity(raw: unknown): UltrasoundFaultSeverity {
  const s = String(raw || "").toUpperCase();
  if (s === "CRITICAL") return "CRITICAL";
  if (s === "HIGH") return "HIGH";
  if (s === "MEDIUM" || s === "ANOMALY" || s === "WARNING") return "MEDIUM";
  return "LOW";
}

function confidenceToPercent(raw: unknown, fallback = 75): number {
  const n = num(raw, fallback);
  if (n >= 0 && n <= 1) return clamp(Math.round(n * 100), 0, 100);
  return clamp(Math.round(n), 0, 100);
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        return asText(o.text ?? o.recommendation ?? o.action, "");
      }
      return "";
    })
    .filter(Boolean);
}

/** Normalize raw API / model JSON → UltrasoundResult. */
export function normalizeUltrasoundResult(raw: unknown): UltrasoundResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const peaksRaw =
    obj.peaks && typeof obj.peaks === "object"
      ? (obj.peaks as Record<string, unknown>)
      : {};
  const finRaw =
    obj.financial_impact && typeof obj.financial_impact === "object"
      ? (obj.financial_impact as Record<string, unknown>)
      : {};

  const peak = num(peaksRaw.peak_dbmv ?? peaksRaw.peak_dbuv ?? obj.peak_dbmv, 44);
  const rms = num(peaksRaw.rms_dbmv ?? peaksRaw.rms_dbuv ?? obj.rms_dbmv, 38);
  const baseline = num(peaksRaw.baseline_dbmv ?? peaksRaw.baseline_dbuv, 28);
  const delta =
    peaksRaw.delta_db != null
      ? num(peaksRaw.delta_db, peak - baseline)
      : Math.round((peak - baseline) * 10) / 10;

  const preventive = num(
    finRaw.preventive_cost ?? finRaw.preventiveRepairCost,
    850
  );
  const failure = num(
    finRaw.failure_cost ?? finRaw.failureCostIfDelayed,
    12000
  );
  const downtime = num(
    finRaw.downtime_loss ?? finRaw.downtimeLossPerHour,
    2500
  );
  const roi =
    finRaw.roi_percentage != null
      ? num(finRaw.roi_percentage, 0)
      : preventive > 0
        ? Math.round(((failure - preventive) / preventive) * 100)
        : 0;

  const primary =
    asText(obj.primary_fault, "").trim() || "Air Leak";

  let fault_list: UltrasoundFaultItem[] = [];
  const faultListRaw = Array.isArray(obj.fault_list) ? obj.fault_list : [];
  if (faultListRaw.length > 0) {
    fault_list = faultListRaw
      .map((item) => {
        const f = (item && typeof item === "object" ? item : {}) as Record<
          string,
          unknown
        >;
        const fault = asText(f.fault ?? f.title, "").trim();
        if (!fault) return null;
        return {
          fault,
          severity: normalizeSeverity(f.severity),
          confidence: confidenceToPercent(f.confidence ?? f.confidencePercent, 70),
          description: asText(f.description ?? f.detail, "")
        };
      })
      .filter(Boolean) as UltrasoundFaultItem[];
  } else if (primary !== "None Detected") {
    fault_list = [
      {
        fault: primary,
        severity: normalizeSeverity(obj.severity),
        confidence: confidenceToPercent(obj.confidence, 78),
        description: asText(obj.summary, `${primary} detected via ultrasound.`)
      }
    ];
  }

  const recommendations = asStringList(obj.recommendations);
  const health = clamp(
    Math.round(num(obj.health_score ?? obj.overallHealthScore, 62)),
    0,
    100
  );

  const detailedRaw =
    obj.detailed && typeof obj.detailed === "object"
      ? (obj.detailed as UltrasoundDetailedAnalysis)
      : null;

  return {
    health_score: health,
    primary_fault: primary,
    fault_list,
    peaks: {
      peak_dbmv: Math.round(peak * 10) / 10,
      rms_dbmv: Math.round(rms * 10) / 10,
      baseline_dbmv: Math.round(baseline * 10) / 10,
      delta_db: delta,
      mode: asText(peaksRaw.mode ?? obj.mode, "") || undefined
    },
    financial_impact: {
      preventive_cost: Math.round(preventive),
      failure_cost: Math.round(failure),
      roi_percentage: Math.round(roi),
      downtime_loss: Math.round(downtime)
    },
    recommendations:
      recommendations.length > 0
        ? recommendations
        : [
            "Confirm acoustic source with contact / airborne probe as appropriate.",
            "Document dBµV peak vs baseline and trend on next route.",
            "Create CMMS work order for leak / friction remediation."
          ],
    detailed: detailedRaw
  };
}

/** Build user message context for future AI (metadata only for now). */
export function buildUltrasoundUserPrompt(metadata: UltrasoundMetadata): string {
  return `Perform ultrasound condition analysis and return ONLY JSON matching UltrasoundResult.

=== EQUIPMENT / ROUTE CONTEXT ===
Asset: ${asText(metadata.asset, "Unknown")}
Asset Tag: ${asText(metadata.assetTag, "—")}
Component: ${asText(metadata.component, "Unknown")}
Route: ${asText(metadata.route, "—")}
Location: ${asText(metadata.location, "—")}
Mode: ${asText(metadata.mode, "leak")}

=== HARDWARE / MEASUREMENT ===
Transducer: ${asText(metadata.transducer, "—")}
Hardware: ${asText(metadata.hardwareBrand, "—")}
Heterodyne kHz: ${asText(metadata.heterodyneKhz, "40")}
Gain dB: ${asText(metadata.gainDb, "30")}
Distance: ${asText(metadata.distance, "—")} ${asText(metadata.distanceUnit, "")}
Peak dBµV: ${asText(metadata.peakDbuV, "unknown")}
RMS dBµV: ${asText(metadata.rmsDbuV, "unknown")}
WAV: ${asText(metadata.wavFileName, "none")}
Photo: ${asText(metadata.photoFileName, "none")}

=== MODE-SPECIFIC ===
Gas: ${asText(metadata.gasType, "—")}
Pressure: ${asText(metadata.systemPressure, "—")}
RPM: ${asText(metadata.equipmentRpm, "—")}
Voltage class: ${asText(metadata.voltageClass, "—")}
Valve: ${asText(metadata.valveType, "—")}`;
}

/**
 * Client helper: metadata (+ optional files later) → API → UltrasoundResult.
 */
export async function analyzeUltrasoundClient(
  metadata: UltrasoundMetadata = {},
  options?: { audioBase64?: string; imageBase64?: string }
): Promise<UltrasoundResult> {
  const res = await fetch(ANALYZE_ULTRASOUND_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      metadata,
      audioBase64: options?.audioBase64,
      imageBase64: options?.imageBase64
    })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.success === false) {
    throw new Error(
      payload?.message ||
        payload?.error ||
        payload?.detail ||
        `Ultrasound analysis failed (HTTP ${res.status})`
    );
  }
  const data = payload?.data ?? payload;
  return normalizeUltrasoundResult(data);
}

function mapFaultSeverityToApi(
  sev: UltrasoundFaultSeverity
): "NORMAL" | "ANOMALY" | "CRITICAL" {
  if (sev === "CRITICAL" || sev === "HIGH") return "CRITICAL";
  if (sev === "MEDIUM") return "ANOMALY";
  return "NORMAL";
}

function overallSeverityFromResult(
  result: UltrasoundResult
): "NORMAL" | "ANOMALY" | "CRITICAL" {
  if (
    result.primary_fault === "None Detected" ||
    result.fault_list.length === 0
  ) {
    return result.health_score >= 80 ? "NORMAL" : "ANOMALY";
  }
  const ranks: Record<UltrasoundFaultSeverity, number> = {
    LOW: 0,
    MEDIUM: 1,
    HIGH: 2,
    CRITICAL: 3
  };
  let max: UltrasoundFaultSeverity = "LOW";
  for (const f of result.fault_list) {
    if (ranks[f.severity] > ranks[max]) max = f.severity;
  }
  return mapFaultSeverityToApi(max);
}

/**
 * Map canonical UltrasoundResult → Run Diagnostics UI shape
 * (UltrasoundResultsDashboard can consume VibrationAnalysisResult-compatible fields).
 */
export function mapUltrasoundToUiResult(
  result: UltrasoundResult
): VibrationAnalysisResult {
  const severity = overallSeverityFromResult(result);
  const primarySev =
    result.fault_list.find((f) => f.fault === result.primary_fault)?.severity ||
    (severity === "CRITICAL" ? "CRITICAL" : severity === "ANOMALY" ? "MEDIUM" : "LOW");

  const conf =
    result.fault_list.find((f) => f.fault === result.primary_fault)?.confidence ??
    (result.primary_fault === "None Detected" ? 85 : 78);

  const delta =
    result.peaks.delta_db != null
      ? result.peaks.delta_db
      : Math.round(
          (result.peaks.peak_dbmv - (result.peaks.baseline_dbmv ?? 28)) * 10
        ) / 10;

  return {
    overallHealthScore: result.health_score,
    severity,
    summary:
      result.primary_fault === "None Detected"
        ? `Ultrasound scan healthy. Peak ${result.peaks.peak_dbmv} dBµV (Δ ${delta} dB vs baseline).`
        : `${result.primary_fault}: peak ${result.peaks.peak_dbmv} dBµV / RMS ${result.peaks.rms_dbmv} dBµV (Δ ${delta} dB).`,
    primaryFault: {
      title: result.primary_fault,
      frequencyHz: 0,
      confidencePercent: clamp(conf, 0, 100),
      severity: mapFaultSeverityToApi(normalizeSeverity(primarySev)),
      actionWindow:
        severity === "CRITICAL"
          ? "Immediate investigation — isolate energy source and remediate."
          : severity === "ANOMALY"
            ? "Schedule remediation within 7–14 days; trend dBµV weekly."
            : "Continue UE route monitoring per ISO 29821."
    },
    identifiedFaults: result.fault_list.map((f) => ({
      title: f.fault,
      frequencyHz: 0,
      confidencePercent: f.confidence,
      severity: mapFaultSeverityToApi(f.severity),
      description: f.description
    })),
    financialImpact: {
      preventiveRepairCost: result.financial_impact.preventive_cost,
      failureCostIfDelayed: result.financial_impact.failure_cost,
      downtimeLossPerHour: result.financial_impact.downtime_loss
    },
    repairRecommendations: result.recommendations,
    consensusDetails: {
      modelA_Hypothesis: `UE · Peak ${result.peaks.peak_dbmv} dBµV`,
      modelB_Hypothesis: `RMS ${result.peaks.rms_dbmv} dBµV · Δ ${delta} dB${
        result.peaks.mode ? ` · ${result.peaks.mode}` : ""
      }`,
      refereeDebateSummary: JSON.stringify({
        roi_percentage: result.financial_impact.roi_percentage,
        pipeline: "ultrasoundAnalysis",
        peaks: result.peaks,
        detailed: result.detailed ?? null
      })
    }
  };
}

/** Peaks payload suitable for /api/save-analysis-result (jsonb array). */
export function ultrasoundPeaksForSave(result: UltrasoundResult): unknown[] {
  return [
    {
      type: "ultrasound",
      peak_dbmv: result.peaks.peak_dbmv,
      rms_dbmv: result.peaks.rms_dbmv,
      baseline_dbmv: result.peaks.baseline_dbmv ?? null,
      delta_db: result.peaks.delta_db ?? null,
      mode: result.peaks.mode ?? null
    }
  ];
}
