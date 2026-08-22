/**
 * 3-Stage Multi-Model Consensus Engine for Spectra CM vibration diagnostics.
 *
 * All stages use OpenRouter exclusively (OPENROUTER_API_KEY required):
 *   Stage 1  — openai/gpt-4o vision (OPENROUTER_VISION_MODEL)
 *   Stage 2a — qwen/qwen-2.5-vl-72b-instruct kinematic analyst
 *   Stage 2b — qwen/qwen-2.5-vl-72b-instruct ISO analyst
 *   Stage 3  — qwen/qwen-2.5-vl-72b-instruct consensus referee
 *
 * Failures return structured domain errors (never mock diagnostic data).
 */

import OpenAI from "openai";
import {
  logPayloadSize,
  logPipelineFail,
  logPipelineSend,
  logPipelineStart,
  logPipelineSuccess,
  pipelineElapsedSec
} from "./pipelineTrace";
import {
  OPENROUTER_API_BASE,
  OPENROUTER_CONSENSUS_MODEL,
  OPENROUTER_VISION_MODELS,
  hasOpenRouterKey,
  openRouterRefererHeaders
} from "./openRouterModels";
import { EXPERT_VISION_PROMPT, VIBRATION_VISION_PROMPT_SIMPLE } from "./vibration/visionModelConfig";

/** Canonical Express mount path — keep client fetch URLs in sync with server.ts */
export const ANALYZE_VIBRATION_API_PATH = "/api/analyze-vibration";

/** Optional alias mounted alongside the canonical path */
export const ANALYZE_VIBRATION_API_ALIAS = "/api/v1/diagnose";

export type ApiSeverity = "NORMAL" | "ANOMALY" | "CRITICAL";

export interface AnalyzeComponentSpecs {
  asset?: string;
  component?: string;
  motorHp?: string | number;
  motorHpKw?: string | number;
  ratedRpm?: string | number;
  lineFrequency?: string;
  bearingDe?: string;
  bearingNde?: string;
  rotorBars?: string | number;
  statorSlots?: string | number;
  [key: string]: unknown;
}

export interface AnalyzeTelemetry {
  rmsVelocity?: string | number;
  peakAcceleration?: string | number;
  operatingTemp?: string | number;
  loadCondition?: string;
  loadPercentage?: string | number;
  fmax?: string;
  lor?: string | number;
  measurementPoint?: string;
  measurementLocation?: string;
  [key: string]: unknown;
}

export interface AnalyzeVibrationRequest {
  imageBase64?: string;
  componentSpecs?: AnalyzeComponentSpecs;
  telemetry?: AnalyzeTelemetry;
  /** `simple` asks Stage 1 vision for fewer peaks (timeout retry). */
  mode?: "full" | "simple";
}

export interface VibrationAnalysisResult {
  overallHealthScore: number;
  severity: ApiSeverity;
  summary: string;
  primaryFault: {
    title: string;
    frequencyHz: number;
    confidencePercent: number;
    severity: ApiSeverity;
    actionWindow: string;
  };
  identifiedFaults: Array<{
    title: string;
    frequencyHz: number;
    confidencePercent: number;
    severity: ApiSeverity;
    description: string;
  }>;
  financialImpact: {
    preventiveRepairCost: number;
    failureCostIfDelayed: number;
    downtimeLossPerHour: number;
  };
  repairRecommendations: string[];
  consensusDetails?: {
    modelA_Hypothesis: string;
    modelB_Hypothesis: string;
    refereeDebateSummary: string;
  };
}

export type ConsensusErrorType =
  | "SIGNAL_UNREADABLE"
  | "CONSENSUS_DIVERGENCE"
  | "GATEWAY_TIMEOUT";

export interface ConsensusDomainError {
  success: false;
  errorType: ConsensusErrorType;
  title: string;
  message: string;
  /** Suggested HTTP status for Express (422 unprocessable / 503 unavailable) */
  httpStatus: 422 | 503;
  detail?: string;
}

export interface ConsensusDetails {
  modelA_Hypothesis: string;
  modelB_Hypothesis: string;
  refereeDebateSummary: string;
}

export interface ConsensusVibrationResult extends VibrationAnalysisResult {
  success?: true;
  consensusDetails: ConsensusDetails;
}

export type ConsensusOutcome =
  | { success: true; data: ConsensusVibrationResult }
  | ConsensusDomainError;

const DOMAIN_ERRORS: Record<
  ConsensusErrorType,
  Pick<ConsensusDomainError, "title" | "message" | "httpStatus">
> = {
  SIGNAL_UNREADABLE: {
    httpStatus: 422,
    title: "OpenAI Vision Error",
    message: "OpenAI Vision Error: Unable to extract spectrum peaks"
  },
  CONSENSUS_DIVERGENCE: {
    httpStatus: 422,
    title: "Consensus Diagnostic Error",
    message:
      "Multi-model reasoning agents reached conflicting fault conclusions. Check operating RPM specs and retry."
  },
  GATEWAY_TIMEOUT: {
    httpStatus: 503,
    title: "Consensus Diagnostic Error",
    message:
      "An AI provider timed out during multi-agent synthesis. Please retry analysis, or upload a clearer spectrum image."
  }
};

export function consensusDomainError(
  errorType: ConsensusErrorType,
  detail?: string
): ConsensusDomainError {
  const base = DOMAIN_ERRORS[errorType];
  return {
    success: false,
    errorType,
    title: base.title,
    message: base.message,
    httpStatus: base.httpStatus,
    ...(detail ? { detail } : {})
  };
}

function isTimeoutLike(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("fetch failed") ||
    msg.includes("socket hang up") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("429")
  );
}

const DOWNTIME_RATE_PER_HOUR = 5000;
const REACTIVE_MAINTENANCE_MULTIPLIER = 5;
/** Keep each provider call under the 60s per-attempt budget. */
const AI_PROVIDER_TIMEOUT_MS = 55_000;

/** Fault-based preventive cost, downtime hours, and step-by-step repair tasks */
function computeFinancialImpactFromFaultTitle(primaryFaultTitle: string | undefined | null): {
  financialImpact: {
    preventiveRepairCost: number;
    failureCostIfDelayed: number;
    downtimeLossPerHour: number;
  };
  repairRecommendations: string[];
} {
  const title = String(primaryFaultTitle || "").trim();
  let preventiveRepairCost = 1000;
  let repairHours = 4;
  let repairRecommendations = [
    `Investigate primary finding: ${title || "unknown fault"}.`,
    "Plan a controlled outage and verify machine isolation (LOTO) before corrective work.",
    "Correct the root cause identified in the consensus analysis, then remount sensors securely.",
    "Remeasure vibration post-repair and compare against this diagnostic baseline."
  ];

  if (!title || /none detected|normal|healthy|no fault/i.test(title)) {
    preventiveRepairCost = 0;
    repairHours = 0;
    repairRecommendations = [
      "Continue routine condition monitoring on the current route interval.",
      "Archive this spectrum as a baseline for future comparison.",
      "Re-run analysis if noise, temperature, or load conditions change."
    ];
  } else if (/misalign|angular|offset|soft\s*foot|coupling\s*align/i.test(title)) {
    preventiveRepairCost = 800;
    repairHours = 4;
    repairRecommendations = [
      "Lock out / tag out the machine and verify zero energy before mechanical work.",
      "Inspect soft foot, baseplate flatness, and coupling condition.",
      "Perform precision laser shaft alignment targeting angular misalignment correction.",
      "Install or adjust shims per the alignment report; re-check soft foot.",
      "Run the machine and confirm 1X/2X vibration reduction vs this baseline."
    ];
  } else if (/unbalance|imbalance|1x\b|rotor\s*balance|fan\s*balance/i.test(title)) {
    preventiveRepairCost = 600;
    repairHours = 3;
    repairRecommendations = [
      "Inspect the rotor/fan for missing balance weights, buildup, or damaged blades.",
      "Clean the rotating assembly and remove any process debris.",
      "Perform single- or two-plane field balancing at operating speed.",
      "Verify 1X amplitude is below alarm limits after balance correction.",
      "Document trial weights and final correction in the CMMS work order."
    ];
  } else if (/bearing|bpfo|bpfi|bsf|ftf|race|spall|outer\s*race|inner\s*race/i.test(title)) {
    preventiveRepairCost = 2500;
    repairHours = 8;
    repairRecommendations = [
      "Allocate the correct replacement bearing from inventory (match DE/NDE OEM spec).",
      "Schedule planned downtime and complete lock out / tag out before disassembly.",
      "Remove the defective bearing; inspect shaft/housing fits and lubrication condition.",
      "Install the new bearing per OEM procedure with correct clearance and grease fill.",
      "Verify soft foot and holding-down bolts, then remount and remeasure BPFO/BPFI."
    ];
  } else if (/loose|looseness|bolt|mount|structural\s*resonance|mechanical\s*looseness/i.test(title)) {
    preventiveRepairCost = 500;
    repairHours = 2;
    repairRecommendations = [
      "Inspect foundation bolts, bearing housings, and foot mounts for play or missing hardware.",
      "Torque all fasteners to OEM specification; replace stretched or damaged bolts.",
      "Check for cracked feet, worn fits, or damaged dowels that allow movement.",
      "Re-run vibration at 1X and harmonics to confirm looseness signatures are gone.",
      "Update the CMMS with torque values and any hardware replaced."
    ];
  }

  return {
    financialImpact: {
      preventiveRepairCost,
      failureCostIfDelayed: preventiveRepairCost * REACTIVE_MAINTENANCE_MULTIPLIER,
      // Total downtime loss ($5,000/hr × repair hours)
      downtimeLossPerHour: DOWNTIME_RATE_PER_HOUR * repairHours
    },
    repairRecommendations
  };
}

interface SpectrumPeak {
  frequencyHz: number;
  frequencyCpm?: number;
  amplitude: number;
  amplitudeUnit?: string;
  label?: string;
}

interface Stage1Extraction {
  peaks: SpectrumPeak[];
  overallRmsVelocity?: number;
  amplitudeUnit?: string;
  runningSpeed1xHz?: number;
  runningSpeed1xRpm?: number;
  defectMultipliers?: {
    unbalance1x?: number;
    misalignment2x?: number;
    harmonics3to10x?: number[];
    bpfo?: number;
    bpfi?: number;
    bsf?: number;
    ftf?: number;
  };
  notes?: string;
  extractionConfidence?: number;
  axesReadable?: boolean;
}

interface AnalystHypothesis {
  primaryFaultTitle: string;
  frequencyHz: number;
  severity: ApiSeverity;
  confidencePercent: number;
  isoZone?: "A" | "B" | "C" | "D" | string;
  reasoning: string;
  identifiedFaults?: Array<{
    title: string;
    frequencyHz: number;
    confidencePercent: number;
    severity: ApiSeverity;
    description: string;
  }>;
  actionWindow?: string;
  overallHealthScore?: number;
}

function isPlaceholderFaultTitle(title: string | undefined | null): boolean {
  const t = String(title || "").trim().toLowerCase();
  if (!t) return true;
  return /^(none|n\/?a|normal|no\s*faults?|none detected|no fault detected|healthy|ok|null|undefined|unresolved|continue monitoring)$/i.test(
    t
  );
}

function isHealthyFaultTitle(title: string | undefined | null): boolean {
  const t = String(title || "").trim().toLowerCase();
  return (
    isPlaceholderFaultTitle(title) ||
    /healthy|normal operation|iso zone a|good|acceptable|continue monitoring|no anomaly/i.test(t)
  );
}

function mapExpertSeverityToApi(severity: string | undefined): ApiSeverity {
  const s = String(severity || "").toUpperCase();
  if (s === "CRITICAL" || s === "D") return "CRITICAL";
  if (s === "HIGH" || s === "C" || s === "MEDIUM" || s === "B" || s === "ANOMALY") {
    return "ANOMALY";
  }
  return "NORMAL";
}

function extractionRpm(extraction: Stage1Extraction): number {
  if (Number.isFinite(extraction.runningSpeed1xRpm) && extraction.runningSpeed1xRpm! > 0) {
    return extraction.runningSpeed1xRpm!;
  }
  if (Number.isFinite(extraction.runningSpeed1xHz) && extraction.runningSpeed1xHz! > 0) {
    return extraction.runningSpeed1xHz! * 60;
  }
  return 0;
}

function machineTypeLabel(specs: AnalyzeComponentSpecs): string {
  const hp = Number(specs.motorHpKw ?? specs.motorHp);
  if (Number.isFinite(hp) && hp >= 75) return "large industrial machine";
  return "small/medium industrial machine";
}

function normalizeStage2aResponse(
  raw: unknown,
  extraction: Stage1Extraction
): AnalystHypothesis {
  const legacy = raw as AnalystHypothesis;
  if (legacy?.primaryFaultTitle && Number.isFinite(Number(legacy.confidencePercent))) {
    return legacy;
  }

  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rpm = extractionRpm(extraction);
  const oneXHz = rpm > 0 ? rpm / 60 : Number(extraction.runningSpeed1xHz) || 0;
  const primaryFault = String(o.primaryFault || o.primaryFaultTitle || "Normal");
  const confidence = clamp(Number(o.confidence ?? o.confidencePercent ?? 70), 0, 100);
  const severity = mapExpertSeverityToApi(String(o.severity || "LOW"));
  const evidence = String(o.evidence || o.reasoning || "");
  const recommendation = String(o.recommendation || o.actionWindow || "Continue monitoring");

  return {
    primaryFaultTitle: primaryFault,
    frequencyHz: oneXHz,
    severity,
    confidencePercent: confidence,
    reasoning: [evidence, recommendation].filter(Boolean).join(" — "),
    actionWindow: recommendation,
    overallHealthScore:
      severity === "CRITICAL" ? 35 : severity === "ANOMALY" ? 62 : 90,
    identifiedFaults:
      primaryFault.toLowerCase() === "normal"
        ? []
        : [
            {
              title: primaryFault,
              frequencyHz: oneXHz,
              confidencePercent: confidence,
              severity,
              description: evidence || recommendation
            }
          ]
  };
}

function normalizeStage2bResponse(
  raw: unknown,
  extraction: Stage1Extraction,
  specs: AnalyzeComponentSpecs
): AnalystHypothesis {
  const legacy = raw as AnalystHypothesis;
  if (legacy?.primaryFaultTitle && Number.isFinite(Number(legacy.confidencePercent))) {
    return legacy;
  }

  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const isoZone = String(o.isoZone || legacy.isoZone || "B").toUpperCase();
  const acceptability = String(o.acceptability || "Acceptable");
  const actionRequired = String(
    o.actionRequired || o.actionWindow || "Continue monitoring"
  );
  const velocity =
    Number(extraction.overallRmsVelocity) ||
    Number(extraction.peaks?.[0]?.amplitude) ||
    0;
  const rpm = extractionRpm(extraction);
  const severity =
    isoZone === "D"
      ? "CRITICAL"
      : isoZone === "C"
        ? "ANOMALY"
        : "NORMAL";
  const isHealthy = isoZone === "A" || isoZone === "B";
  const confidence = isoZone === "A" ? 92 : isoZone === "B" ? 85 : isoZone === "C" ? 78 : 88;

  return {
    primaryFaultTitle: isHealthy
      ? `ISO Zone ${isoZone} — ${acceptability}`
      : `ISO Zone ${isoZone} — Elevated Vibration`,
    frequencyHz: rpm > 0 ? rpm / 60 : Number(extraction.runningSpeed1xHz) || 0,
    severity,
    confidencePercent: confidence,
    isoZone,
    reasoning: `Overall ${velocity.toFixed(2)} mm/s on ${machineTypeLabel(specs)} at ${rpm || "unknown"} RPM maps to ISO 10816 Zone ${isoZone} (${acceptability}). ${actionRequired}`,
    actionWindow: actionRequired,
    overallHealthScore:
      isoZone === "A" ? 92 : isoZone === "B" ? 82 : isoZone === "C" ? 58 : 35,
    identifiedFaults: isHealthy
      ? []
      : [
          {
            title: `ISO 10816 Zone ${isoZone}`,
            frequencyHz: 0,
            confidencePercent: confidence,
            severity,
            description: actionRequired
          }
        ]
  };
}

function normalizeStage3ExpertResponse(
  parsed: Record<string, unknown>,
  extraction: Stage1Extraction,
  agentA: AnalystHypothesis | null,
  agentB: AnalystHypothesis | null
): ConsensusVibrationResult {
  if (parsed.primaryFault && parsed.overallHealthScore != null) {
    return parsed as unknown as ConsensusVibrationResult;
  }

  const finalDiagnosis = String(
    parsed.finalDiagnosis || parsed.summary || "Inconclusive - Manual Review Required"
  );
  const confidence = clamp(Number(parsed.confidence ?? parsed.confidencePercent ?? 75), 0, 100);
  const severity = mapExpertSeverityToApi(String(parsed.severity || "LOW"));
  const actionPlan = String(parsed.actionPlan || parsed.actionWindow || "Continue monitoring");
  const discrepancies = Array.isArray(parsed.discrepancies)
    ? parsed.discrepancies.map(String)
    : [];
  const oneXHz = Number(extraction.runningSpeed1xHz) || 0;
  const isHealthy = isHealthyFaultTitle(finalDiagnosis);
  const costed = computeFinancialImpactFromFaultTitle(finalDiagnosis);

  const debateSummary =
    discrepancies.length > 0
      ? discrepancies.join("; ")
      : actionPlan;

  return {
    overallHealthScore: isHealthy
      ? clamp(Number(parsed.overallHealthScore ?? 92), 0, 100)
      : severity === "CRITICAL"
        ? 35
        : severity === "ANOMALY"
          ? 58
          : 88,
    severity: isHealthy ? "NORMAL" : severity,
    summary:
      discrepancies.length > 0
        ? `${finalDiagnosis} (${discrepancies.join("; ")})`
        : finalDiagnosis,
    primaryFault: {
      title: finalDiagnosis,
      frequencyHz: oneXHz,
      confidencePercent: confidence,
      severity: isHealthy ? "NORMAL" : severity,
      actionWindow: actionPlan
    },
    identifiedFaults: isHealthy
      ? []
      : [
          {
            title: finalDiagnosis,
            frequencyHz: oneXHz,
            confidencePercent: confidence,
            severity: isHealthy ? "NORMAL" : severity,
            description: actionPlan
          }
        ],
    financialImpact: costed.financialImpact,
    repairRecommendations: costed.repairRecommendations,
    consensusDetails: {
      modelA_Hypothesis: agentA
        ? `${agentA.primaryFaultTitle} (${agentA.confidencePercent}%): ${agentA.reasoning}`
        : "Agent A unavailable.",
      modelB_Hypothesis: agentB
        ? `${agentB.primaryFaultTitle} (${agentB.confidencePercent}%)${
            agentB.isoZone ? ` ISO Zone ${agentB.isoZone}` : ""
          }: ${agentB.reasoning}`
        : "Agent B unavailable.",
      refereeDebateSummary: debateSummary
    }
  };
}

function nearHz(hz: number, target: number, tol: number): boolean {
  return Number.isFinite(hz) && Number.isFinite(target) && Math.abs(hz - target) <= tol;
}

/** Build fault findings from Stage-1 vision peaks when agents/referee omit them. */
function faultsFromExtractionPeaks(
  extraction: Stage1Extraction
): NonNullable<AnalystHypothesis["identifiedFaults"]> {
  const peaks = Array.isArray(extraction.peaks) ? extraction.peaks : [];
  if (!peaks.length) return [];

  const oneX =
    Number(extraction.runningSpeed1xHz) > 0
      ? Number(extraction.runningSpeed1xHz)
      : peaks.find((p) => /1\s*x|running/i.test(String(p.label || "")))
          ?.frequencyHz ||
        peaks.find((p) => p.frequencyHz >= 15 && p.frequencyHz <= 70)?.frequencyHz ||
        29.8;

  const faults: NonNullable<AnalystHypothesis["identifiedFaults"]> = [];
  const push = (f: NonNullable<AnalystHypothesis["identifiedFaults"]>[number]) => {
    if (faults.some((x) => x.title.toLowerCase() === f.title.toLowerCase())) return;
    faults.push(f);
  };

  const bpfoHz = Number(extraction.defectMultipliers?.bpfo);
  const bpfoPeak =
    peaks.find((p) => /bpfo|outer\s*race/i.test(String(p.label || ""))) ||
    (bpfoHz > 0
      ? peaks.find((p) => nearHz(p.frequencyHz, bpfoHz, Math.max(3, bpfoHz * 0.05)))
      : undefined) ||
    peaks.find(
      (p) =>
        p.frequencyHz >= Math.max(80, oneX * 3.5) &&
        p.frequencyHz <= oneX * 12 &&
        !nearHz(p.frequencyHz, oneX, 2) &&
        !nearHz(p.frequencyHz, oneX * 2, 3)
    );

  if (bpfoPeak) {
    push({
      title: "Outer Race Bearing Defect (BPFO)",
      frequencyHz: bpfoPeak.frequencyHz,
      confidencePercent: 90,
      severity: "CRITICAL",
      description: `Spectrum peak at ${bpfoPeak.frequencyHz} Hz matches BPFO / outer-race defect family.`
    });
  }

  const twoX =
    peaks.find((p) => /2\s*x|misalign/i.test(String(p.label || ""))) ||
    peaks.find((p) => nearHz(p.frequencyHz, oneX * 2, Math.max(1.5, oneX * 0.08)));
  const oneXPeak =
    peaks.find((p) => /1\s*x|running/i.test(String(p.label || ""))) ||
    peaks.find((p) => nearHz(p.frequencyHz, oneX, Math.max(1.2, oneX * 0.06)));

  if (twoX || oneXPeak) {
    push({
      title: "Angular Misalignment",
      frequencyHz: twoX?.frequencyHz || oneX * 2,
      confidencePercent: 85,
      severity: "ANOMALY",
      description: "Elevated 1X/2X running-speed content consistent with angular misalignment."
    });
  }
  if (oneXPeak) {
    push({
      title: "Unbalance",
      frequencyHz: oneXPeak.frequencyHz,
      confidencePercent: 80,
      severity: "ANOMALY",
      description: "Dominant 1X energy suggests residual unbalance."
    });
  }
  if (peaks.length >= 3) {
    push({
      title: "Elevated Noise Floor",
      frequencyHz: 0,
      confidencePercent: 70,
      severity: "NORMAL",
      description: "Broadband spectral energy elevated relative to a quiet baseline."
    });
  }
  return faults;
}

/**
 * Ensure identifiedFaults/primaryFault stay aligned with agent hypotheses and Stage-1 peaks.
 * Prevents referee NORMAL/"None" from wiping real fault evidence.
 */
function ensureFaultListOnResult(
  result: ConsensusVibrationResult,
  extraction: Stage1Extraction,
  agentA: AnalystHypothesis | null,
  agentB: AnalystHypothesis | null
): ConsensusVibrationResult {
  const healthyReferee =
    result.severity === "NORMAL" &&
    isHealthyFaultTitle(result.primaryFault?.title || result.summary);

  if (healthyReferee) {
    return {
      ...result,
      overallHealthScore: clamp(Number(result.overallHealthScore ?? 92), 0, 100),
      identifiedFaults: [],
      primaryFault: {
        ...result.primaryFault,
        severity: "NORMAL",
        title:
          result.primaryFault?.title ||
          "Machine Healthy / Normal Operation"
      },
      summary:
        result.summary ||
        "Machine Healthy / Normal Operation — ISO Zone A/B, 1X running speed within limits."
    };
  }

  let faults = (result.identifiedFaults || []).filter(
    (f) => f && !isPlaceholderFaultTitle(f.title)
  );

  for (const agent of [agentA, agentB]) {
    for (const f of agent?.identifiedFaults || []) {
      if (!f || isPlaceholderFaultTitle(f.title)) continue;
      if (faults.some((x) => x.title.toLowerCase() === f.title.toLowerCase())) continue;
      faults.push({
        title: f.title,
        frequencyHz: Number(f.frequencyHz) || 0,
        confidencePercent: clamp(Number(f.confidencePercent) || 75, 0, 100),
        severity: (f.severity as ApiSeverity) || "ANOMALY",
        description: f.description || agent?.reasoning || ""
      });
    }
  }

  if (
    faults.length === 0 &&
    result.primaryFault &&
    !isPlaceholderFaultTitle(result.primaryFault.title)
  ) {
    faults = [
      {
        title: result.primaryFault.title,
        frequencyHz: Number(result.primaryFault.frequencyHz) || 0,
        confidencePercent: clamp(
          Number(result.primaryFault.confidencePercent) || 80,
          0,
          100
        ),
        severity: result.primaryFault.severity || "ANOMALY",
        description: result.summary || "Primary consensus finding."
      }
    ];
  }

  if (faults.length === 0) {
    faults = faultsFromExtractionPeaks(extraction);
  }

  if (faults.length === 0) return result;

  const severityRank: Record<ApiSeverity, number> = {
    NORMAL: 1,
    ANOMALY: 2,
    CRITICAL: 3
  };
  const worst = faults.reduce<ApiSeverity>((acc, f) => {
    const s = (f.severity as ApiSeverity) || "ANOMALY";
    return severityRank[s] >= severityRank[acc] ? s : acc;
  }, "NORMAL");

  let severity = result.severity;
  if (
    severityRank[worst] > severityRank[severity] ||
    severity === "NORMAL" ||
    isPlaceholderFaultTitle(result.primaryFault?.title)
  ) {
    severity = worst === "NORMAL" ? "ANOMALY" : worst;
  }

  let primaryFault = result.primaryFault;
  if (isPlaceholderFaultTitle(primaryFault?.title)) {
    const top = [...faults].sort(
      (a, b) =>
        severityRank[(b.severity as ApiSeverity) || "ANOMALY"] -
          severityRank[(a.severity as ApiSeverity) || "ANOMALY"] ||
        (b.confidencePercent || 0) - (a.confidencePercent || 0)
    )[0];
    primaryFault = {
      title: top.title,
      frequencyHz: top.frequencyHz,
      confidencePercent: top.confidencePercent,
      severity: (top.severity as ApiSeverity) || severity,
      actionWindow:
        top.severity === "CRITICAL"
          ? "Action required within 7 days."
          : "Inspect within 30 days."
    };
  }

  let overallHealthScore = Number(result.overallHealthScore);
  if (!Number.isFinite(overallHealthScore) || (severityRank[severity] > severityRank.NORMAL && overallHealthScore > 75)) {
    overallHealthScore =
      severity === "CRITICAL" ? 32 : severity === "ANOMALY" ? 58 : 88;
  }

  let summary = result.summary || "";
  if (/normal operation|none detected|no fault|continue monitoring/i.test(summary)) {
    summary = `Consensus analysis: ${primaryFault.title} at ${primaryFault.frequencyHz} Hz (${severity}). ${faults.length} fault signature(s) identified.`;
  }

  return {
    ...result,
    severity,
    overallHealthScore: clamp(overallHealthScore, 0, 100),
    primaryFault,
    identifiedFaults: faults,
    summary
  };
}

function asText(value: unknown, fallback = "unknown"): string {
  if (value == null || value === "") return fallback;
  return String(value);
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function stripDataUrl(imageBase64: string): { data: string; mimeType: string } {
  const trimmed = imageBase64.trim();
  const mimeMatch = /^data:(image\/\w+);base64,/i.exec(trimmed);
  const mimeType = mimeMatch?.[1] || "image/png";
  const data = trimmed.replace(/^data:image\/\w+;base64,/, "");
  return { data, mimeType };
}

function parseVisionJsonResponse(text: string): unknown {
  const cleaned = String(text || "")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through to brace / array extraction */
  }
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    return JSON.parse(cleaned.slice(objStart, objEnd + 1));
  }
  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) {
    return JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
  }
  throw new Error("Model response did not contain valid JSON.");
}

function extractJsonObject(text: string): unknown {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error("Model response did not contain valid JSON.");
}

function specsBlock(specs: AnalyzeComponentSpecs, telemetry: AnalyzeTelemetry): string {
  return `=== COMPONENT SPECS ===
Asset: ${asText(specs.asset)}
Component: ${asText(specs.component)}
Motor HP / kW: ${asText(specs.motorHpKw ?? specs.motorHp)}
Rated RPM: ${asText(specs.ratedRpm)}
Line Frequency: ${asText(specs.lineFrequency, "60 Hz")}
DE Bearing: ${asText(specs.bearingDe)}
NDE Bearing: ${asText(specs.bearingNde)}
Rotor Bars: ${asText(specs.rotorBars)}
Stator Slots: ${asText(specs.statorSlots)}

=== TELEMETRY ===
Measurement Location: ${asText(telemetry.measurementLocation)}
Measurement Point: ${asText(telemetry.measurementPoint)}
RMS Velocity: ${asText(telemetry.rmsVelocity)}
Peak Acceleration: ${asText(telemetry.peakAcceleration)}
Operating Temp: ${asText(telemetry.operatingTemp)}
Load: ${asText(telemetry.loadCondition)} ${asText(telemetry.loadPercentage, "")}
Fmax: ${asText(telemetry.fmax)}
LoR: ${asText(telemetry.lor)}`;
}

function normalizeFaultKey(title: string | undefined): string {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isKinematicNormal(agent: AnalystHypothesis | null): boolean {
  if (!agent) return false;
  const title = String(agent.primaryFaultTitle || "").trim().toLowerCase();
  return (
    title === "normal" ||
    isPlaceholderFaultTitle(title) ||
    /^normal\b/.test(title)
  );
}

function isoZoneOf(agent: AnalystHypothesis | null): string {
  if (!agent) return "";
  const z = String(agent.isoZone || "").toUpperCase();
  if (/^[ABCD]$/.test(z)) return z;
  const m = /iso zone\s*([abcd])/i.exec(agent.primaryFaultTitle || "");
  return m ? m[1].toUpperCase() : "";
}

function fuzzyTitleAgree(a?: string, b?: string): boolean {
  if (isHealthyFaultTitle(a) && isHealthyFaultTitle(b)) return true;
  const ka = normalizeFaultKey(a);
  const kb = normalizeFaultKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const aTokens = new Set(ka.split(" ").filter((t) => t.length > 3));
  const bTokens = kb.split(" ").filter((t) => t.length > 3);
  const overlap = bTokens.filter((t) => aTokens.has(t)).length;
  return overlap >= 2;
}

function faultsAgree(agentA: AnalystHypothesis, agentB: AnalystHypothesis): boolean {
  const healthyA = isKinematicNormal(agentA);
  const zoneB = isoZoneOf(agentB);
  const healthyB =
    zoneB === "A" ||
    zoneB === "B" ||
    isHealthyFaultTitle(agentB.primaryFaultTitle);
  const faultA = !healthyA;
  const elevatedB = zoneB === "C" || zoneB === "D";

  // Both think the machine is healthy
  if (healthyA && healthyB) return true;

  // Both think there is a problem (fault + elevated ISO zone)
  if (faultA && elevatedB) return true;

  // Hard disagreement only: Normal vs Zone D, or fault vs Zone A
  if (healthyA && zoneB === "D") return false;
  if (faultA && zoneB === "A") return false;

  // Minor differences (e.g. Normal vs Zone B, fault vs Zone B) — reconcile in Stage 3
  if (healthyA && zoneB === "B") return true;
  if (faultA && zoneB === "B") return true;

  return fuzzyTitleAgree(agentA.primaryFaultTitle, agentB.primaryFaultTitle);
}

function applyManualReviewWarning(
  result: ConsensusVibrationResult,
  note: string,
  confidence?: number
): ConsensusVibrationResult {
  const conf = clamp(Number(confidence ?? result.primaryFault?.confidencePercent ?? 50), 50, 79);
  const title = String(result.primaryFault?.title || "");
  const keepDecisiveTitle =
    /machine healthy|anomaly detected|unbalance|misalignment|looseness|bearing|iso zone/i.test(
      title
    ) && !/inconclusive|manual review/i.test(title);
  const debateSummary = [note, result.consensusDetails?.refereeDebateSummary]
    .filter(Boolean)
    .join(" ");

  return {
    ...result,
    summary: keepDecisiveTitle
      ? `${title}. ${note}`
      : result.summary?.includes("Manual review")
        ? result.summary
        : `${result.summary || "Analysis complete"}. Manual review recommended.`,
    primaryFault: {
      ...result.primaryFault,
      confidencePercent: conf,
      title: keepDecisiveTitle
        ? title
        : "Inconclusive - Manual Review Recommended"
    },
    consensusDetails: {
      modelA_Hypothesis:
        result.consensusDetails?.modelA_Hypothesis || "n/a",
      modelB_Hypothesis:
        result.consensusDetails?.modelB_Hypothesis || "n/a",
      refereeDebateSummary: debateSummary || note
    }
  };
}

function buildConsensusSuccessPayload(
  aligned: ConsensusVibrationResult,
  extraction: Stage1Extraction
): ConsensusOutcome {
  return {
    success: true,
    data: {
      ...aligned,
      success: true,
      spectrumPeaks: extraction.peaks?.map((p) => ({
        frequencyHz: p.frequencyHz,
        amplitude: p.amplitude,
        label: p.label,
        chart: "fft" as const
      }))
    } as ConsensusVibrationResult & { success: true; spectrumPeaks?: unknown }
  };
}

function isExtractionReadable(extraction: Stage1Extraction): boolean {
  const conf = Number(extraction.extractionConfidence) * 100;
  const peaks = Array.isArray(extraction.peaks) ? extraction.peaks : [];
  const usablePeaks = peaks.filter(
    (p) =>
      Number.isFinite(Number(p.frequencyHz)) &&
      Number(p.frequencyHz) > 0 &&
      Number.isFinite(Number(p.amplitude))
  );
  if (extraction.axesReadable === false) return false;
  if (usablePeaks.length === 0) return false;
  if (Number.isFinite(conf) && conf < 45) return false;
  return true;
}

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const client = new OpenAI({
    apiKey,
    baseURL: OPENROUTER_API_BASE,
    timeout: AI_PROVIDER_TIMEOUT_MS,
    defaultHeaders: openRouterRefererHeaders()
  });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  const startTime = logPipelineStart("provider:openrouter", { model });
  logPipelineSend("provider:openrouter", { model, timeoutMs: AI_PROVIDER_TIMEOUT_MS });
  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.15,
      response_format: { type: "json_object" }
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error(`OpenRouter/${model} returned empty content.`);
    logPipelineSuccess("provider:openrouter", startTime, { model, mode: "json" });
    return content;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logPipelineFail("provider:openrouter:json", startTime, err);
    console.warn(
      `[consensus] openrouter/${model} JSON mode failed, retrying plain:`,
      message
    );
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.15
      });
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error(`OpenRouter/${model} returned empty content on retry.`);
      }
      logPipelineSuccess("provider:openrouter", startTime, { model, mode: "plain-retry" });
      return content;
    } catch (retryErr: unknown) {
      logPipelineFail("provider:openrouter:plain", startTime, retryErr);
      throw retryErr;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Stage 1 — OpenAI GPT-4o Vision spectrum extractor                          */
/* -------------------------------------------------------------------------- */

const OPENAI_VISION_SYSTEM_PROMPT = EXPERT_VISION_PROMPT;

const OPENAI_VISION_SYSTEM_PROMPT_SIMPLE = VIBRATION_VISION_PROMPT_SIMPLE;

interface OpenAiSpectrumPeak {
  frequency?: number;
  frequencyHz?: number;
  amplitude?: number;
  label?: string;
  harmonicOrder?: string | number;
  description?: string;
}

/**
 * Analyze a spectrum chart image with GPT-4o Vision via OpenRouter only.
 */
export async function analyzeSpectrumWithOpenAI(
  imageBase64: string,
  context?: {
    specs?: AnalyzeComponentSpecs;
    telemetry?: AnalyzeTelemetry;
    mode?: "full" | "simple";
  }
): Promise<Stage1Extraction> {
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!openRouterKey) {
    throw new Error("OPENROUTER_API_KEY is required for Stage 1 vision extraction.");
  }

  const { data, mimeType } = stripDataUrl(imageBase64);
  const cleanBase64 = data.replace(/^data:image\/\w+;base64,/, "");
  const dataUrl = `data:${mimeType};base64,${cleanBase64}`;
  logPayloadSize("stage1-openai-vision", dataUrl);
  const mode = context?.mode === "simple" ? "simple" : "full";
  const systemPrompt =
    mode === "simple"
      ? OPENAI_VISION_SYSTEM_PROMPT_SIMPLE
      : OPENAI_VISION_SYSTEM_PROMPT;

  const specs = context?.specs || {};
  const telemetry = context?.telemetry || {};
  const peakInstruction =
    mode === "simple"
      ? `Extract ONLY the top 3 highest-amplitude peaks. Use the REQUIRED JSON OUTPUT schema from the system prompt.`
      : `Extract ALL visible major peaks. Use the REQUIRED JSON OUTPUT schema from the system prompt.`;
  const userContext = `${peakInstruction}

IMPORTANT: Read RPM from the chart image only. Do NOT copy Rated RPM from specs unless the image shows no RPM.
Database specs (reference only — image wins): ${specsBlock(specs, telemetry)}`;

  const client = new OpenAI({
    apiKey: openRouterKey,
    baseURL: OPENROUTER_API_BASE,
    timeout: AI_PROVIDER_TIMEOUT_MS,
    defaultHeaders: openRouterRefererHeaders()
  });

  let lastError: unknown;

  for (const model of OPENROUTER_VISION_MODELS) {
    const stageStart = logPipelineStart("stage1-vision", {
      model,
      provider: "openrouter",
      timeoutMs: AI_PROVIDER_TIMEOUT_MS
    });
    try {
      console.log(`[consensus] Stage 1 vision via OpenRouter / ${model}…`);
      logPipelineSend("stage1-vision", { model, detail: "high" });
      let contentText = "";
      try {
        const response = await client.chat.completions.create({
          model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: userContext },
                { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
              ]
            }
          ]
        });
        contentText = response.choices[0]?.message?.content || "";
      } catch (jsonModeErr) {
        logPipelineFail("stage1-vision:json", stageStart, jsonModeErr);
        console.warn(
          `[consensus] ${model} JSON mode failed, retrying plain:`,
          jsonModeErr instanceof Error ? jsonModeErr.message : jsonModeErr
        );
        const response = await client.chat.completions.create({
          model,
          temperature: 0.1,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: userContext },
                { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
              ]
            }
          ]
        });
        contentText = response.choices[0]?.message?.content || "";
      }

      if (!contentText.trim()) {
        throw new Error(`Empty response from OpenAI Vision model (${model}).`);
      }

      const raw = parseVisionJsonResponse(contentText) as
        | OpenAiSpectrumPeak[]
        | {
            peaks?: OpenAiSpectrumPeak[];
            chartType?: string;
            rpm?: number;
            xAxisUnit?: string;
            yAxisUnit?: string;
            overallVelocity?: number;
            fmax?: number;
            amplitudeUnit?: string;
            runningSpeed1xHz?: number;
            runningSpeed1xRpm?: number;
            overallRmsVelocity?: number;
            axesReadable?: boolean;
            extractionConfidence?: number;
            notes?: string;
            defectMultipliers?: Stage1Extraction["defectMultipliers"];
          };

      let peakRows: OpenAiSpectrumPeak[] = [];
      let meta: {
        chartType?: string;
        rpm?: number;
        xAxisUnit?: string;
        yAxisUnit?: string;
        overallVelocity?: number;
        fmax?: number;
        amplitudeUnit?: string;
        runningSpeed1xHz?: number;
        runningSpeed1xRpm?: number;
        overallRmsVelocity?: number;
        axesReadable?: boolean;
        extractionConfidence?: number;
        notes?: string;
        defectMultipliers?: Stage1Extraction["defectMultipliers"];
      } = {};

      if (Array.isArray(raw)) {
        peakRows = raw;
      } else if (raw && typeof raw === "object") {
        peakRows = Array.isArray(raw.peaks) ? raw.peaks : [];
        meta = raw;
      }

      const xAxisUnit = String(meta.xAxisUnit || "Hz").toUpperCase();
      const unit = meta.yAxisUnit || meta.amplitudeUnit || "mm/s";
      const peaks: SpectrumPeak[] = peakRows
        .map((p) => {
          let frequencyHz = Number(p.frequencyHz ?? p.frequency ?? 0);
          if (xAxisUnit === "CPM" && frequencyHz > 0) {
            frequencyHz = frequencyHz / 60;
          }
          const amplitude = Number(p.amplitude ?? 0);
          const label =
            p.label ||
            p.description ||
            (p.harmonicOrder != null ? String(p.harmonicOrder) : undefined);
          return {
            frequencyHz,
            frequencyCpm: frequencyHz > 0 ? frequencyHz * 60 : undefined,
            amplitude,
            amplitudeUnit: unit,
            label
          };
        })
        .filter((p) => Number.isFinite(p.frequencyHz) && p.frequencyHz > 0);

      const imageRpm = Number(meta.rpm);
      let runningSpeed1xHz = Number(meta.runningSpeed1xHz);
      let runningSpeed1xRpm = Number(meta.runningSpeed1xRpm);

      if (Number.isFinite(imageRpm) && imageRpm > 0) {
        runningSpeed1xRpm = imageRpm;
        runningSpeed1xHz = imageRpm / 60;
      } else if (
        (!Number.isFinite(runningSpeed1xHz) || runningSpeed1xHz <= 0) &&
        Number.isFinite(runningSpeed1xRpm) &&
        runningSpeed1xRpm > 0
      ) {
        runningSpeed1xHz = runningSpeed1xRpm / 60;
      }

      const oneXPeak = peaks.find((p) =>
        /1\s*x|running\s*speed|1x/i.test(String(p.label || ""))
      );
      if ((!Number.isFinite(runningSpeed1xHz) || runningSpeed1xHz <= 0) && oneXPeak) {
        runningSpeed1xHz = oneXPeak.frequencyHz;
        runningSpeed1xRpm = oneXPeak.frequencyHz * 60;
      }

      const chartNote = meta.chartType ? `chartType=${meta.chartType}` : undefined;
      const rpmNote =
        Number.isFinite(runningSpeed1xRpm) && runningSpeed1xRpm! > 0
          ? `image RPM=${runningSpeed1xRpm}, 1X=${runningSpeed1xHz?.toFixed(2)} Hz`
          : undefined;

      logPipelineSuccess("stage1-vision", stageStart, {
        model,
        peakCount: peaks.length
      });
      return {
        peaks,
        overallRmsVelocity: Number.isFinite(Number(meta.overallVelocity))
          ? Number(meta.overallVelocity)
          : Number.isFinite(Number(meta.overallRmsVelocity))
            ? Number(meta.overallRmsVelocity)
            : Number(telemetry.rmsVelocity) || undefined,
        amplitudeUnit: unit,
        runningSpeed1xHz: Number.isFinite(runningSpeed1xHz)
          ? runningSpeed1xHz
          : undefined,
        runningSpeed1xRpm: Number.isFinite(runningSpeed1xRpm)
          ? runningSpeed1xRpm
          : undefined,
        defectMultipliers: meta.defectMultipliers,
        notes: [chartNote, rpmNote, meta.notes, meta.fmax != null ? `Fmax≈${meta.fmax}` : undefined]
          .filter(Boolean)
          .join("; ") || undefined,
        extractionConfidence: Number.isFinite(Number(meta.extractionConfidence))
          ? Number(meta.extractionConfidence)
          : peaks.length > 0
            ? 80
            : 30,
        axesReadable: meta.axesReadable !== false && peaks.length > 0
      };
    } catch (err) {
      lastError = err;
      logPipelineFail("stage1-vision", stageStart, err);
      console.error("🚨 Vision extraction error:", err);
      console.warn(
        `[consensus] Vision model ${model} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("OpenAI Vision Error: Unable to extract spectrum peaks");
}

async function stage1VisionExtract(
  imageBase64: string,
  specs: AnalyzeComponentSpecs,
  telemetry: AnalyzeTelemetry,
  mode: "full" | "simple" = "full"
): Promise<Stage1Extraction> {
  return analyzeSpectrumWithOpenAI(imageBase64, { specs, telemetry, mode });
}

/* -------------------------------------------------------------------------- */
/* Stage 2a — Kinematic Math & Fault Modes (OpenRouter / Qwen)            */
/* -------------------------------------------------------------------------- */

async function stage2aKinematicAnalyst(
  extraction: Stage1Extraction,
  specs: AnalyzeComponentSpecs,
  telemetry: AnalyzeTelemetry
): Promise<AnalystHypothesis> {
  const rpm = extractionRpm(extraction) || Number(specs.ratedRpm) || 0;
  const oneXHz = rpm > 0 ? rpm / 60 : Number(extraction.runningSpeed1xHz) || 0;

  const system = `You are a vibration analyst specializing in fault identification.

Given spectral data with RPM = ${rpm}, analyze the peaks:

FAULT DIAGNOSIS RULES:
1. UNBALANCE: High 1X peak (>50% of overall), low harmonics
2. MISALIGNMENT: High 2X peak (often >1X), possibly 3X
3. MECHANICAL LOOSENESS: Multiple harmonics (3X, 4X, 5X+) with decreasing amplitude
4. BEARING DEFECTS: Peaks at BPFO, BPFI, BSF, or FTF frequencies (usually >1000 Hz)

CRITICAL:
- 1X frequency = RPM/60 (e.g., 1780 RPM = 29.67 Hz, NOT 1780 Hz!)
- Always calculate 1X from RPM first, then compare peaks to harmonics
- Expected 1X for this machine ≈ ${oneXHz.toFixed(2)} Hz at ${rpm} RPM

Output JSON:
{
  "primaryFault": "Unbalance" | "Misalignment" | "Looseness" | "BearingDefect" | "Normal",
  "confidence": <0-100>,
  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "evidence": "1X at {freq} Hz is {amplitude} mm/s ({percent}% of overall)",
  "recommendation": "Balance rotor" | "Check alignment" | "Inspect bearings" | "Continue monitoring"
}`;

  const user = `${specsBlock(specs, telemetry)}

=== STAGE 1 SPECTRUM EXTRACTION (image-derived RPM preferred) ===
${JSON.stringify(extraction, null, 2)}

Correlate peaks to 1X=${oneXHz.toFixed(2)} Hz and harmonics. Never treat RPM as Hz.`;

  const raw = await callOpenRouter(OPENROUTER_CONSENSUS_MODEL, system, user);

  return normalizeStage2aResponse(extractJsonObject(raw), extraction);
}

/* -------------------------------------------------------------------------- */
/* Stage 2b — ISO Standards & Operational Context (OpenRouter / Qwen)       */
/* -------------------------------------------------------------------------- */

async function stage2bIsoAnalyst(
  extraction: Stage1Extraction,
  specs: AnalyzeComponentSpecs,
  telemetry: AnalyzeTelemetry
): Promise<AnalystHypothesis> {
  const rpm = extractionRpm(extraction) || Number(specs.ratedRpm) || 0;
  const velocity =
    Number(extraction.overallRmsVelocity) ||
    Number(telemetry.rmsVelocity) ||
    0;
  const machineType = machineTypeLabel(specs);

  const system = `You are an ISO 10816 vibration standards expert.

Given:
- Overall velocity: ${velocity} mm/s
- Machine type: ${machineType}
- RPM: ${rpm}

ISO 10816 ZONES for industrial machines:
- Zone A (Good): <2.3 mm/s for small machines, <4.5 mm/s for large machines
- Zone B (Acceptable): 2.3-4.5 mm/s (small), 4.5-7.1 mm/s (large)
- Zone C (Alert): 4.5-7.1 mm/s (small), 7.1-11 mm/s (large)
- Zone D (Danger): >7.1 mm/s (small), >11 mm/s (large)

Output JSON:
{
  "isoZone": "A" | "B" | "C" | "D",
  "acceptability": "Good" | "Acceptable" | "Alert" | "Danger",
  "actionRequired": "Continue monitoring" | "Plan maintenance" | "Schedule repair" | "Immediate shutdown"
}`;

  const user = `${specsBlock(specs, telemetry)}

=== STAGE 1 SPECTRUM EXTRACTION ===
${JSON.stringify(extraction, null, 2)}

Map overall velocity to ISO 10816 zones for this ${machineType}.`;

  const raw = await callOpenRouter(OPENROUTER_CONSENSUS_MODEL, system, user);

  return normalizeStage2bResponse(extractJsonObject(raw), extraction, specs);
}

/* -------------------------------------------------------------------------- */
/* Stage 3 — Consensus Referee                                                */
/* -------------------------------------------------------------------------- */

function localRefereeSynthesize(
  extraction: Stage1Extraction,
  agentA: AnalystHypothesis | null,
  agentB: AnalystHypothesis | null,
  debateNote: string
): ConsensusVibrationResult {
  const a = agentA;
  const b = agentB;

  const titlesAgree =
    a &&
    b &&
    a.primaryFaultTitle &&
    b.primaryFaultTitle &&
    a.primaryFaultTitle.toLowerCase().includes(
      b.primaryFaultTitle.toLowerCase().slice(0, 12)
    );

  const severityRank: Record<ApiSeverity, number> = {
    NORMAL: 0,
    ANOMALY: 1,
    CRITICAL: 2
  };

  const pickSeverity = (): ApiSeverity => {
    const sa = a?.severity || "ANOMALY";
    const sb = b?.severity || "ANOMALY";
    return severityRank[sa] >= severityRank[sb] ? sa : sb;
  };

  const severity = pickSeverity();
  const confA = clamp(Number(a?.confidencePercent ?? 70), 0, 100);
  const confB = clamp(Number(b?.confidencePercent ?? 70), 0, 100);
  let confidencePercent = Math.round((confA + confB) / 2);
  if (titlesAgree) confidencePercent = clamp(confidencePercent + 8, 0, 100);
  else confidencePercent = clamp(confidencePercent - 12, 0, 100);

  const primary = (a?.confidencePercent ?? 0) >= (b?.confidencePercent ?? 0) ? a : b;
  const primaryFault = {
    title: primary?.primaryFaultTitle || "Elevated Vibration — Review Required",
    frequencyHz: Number(primary?.frequencyHz ?? extraction.runningSpeed1xHz ?? 0),
    confidencePercent,
    severity,
    actionWindow:
      primary?.actionWindow ||
      (severity === "CRITICAL"
        ? "Action required within 7 days."
        : severity === "ANOMALY"
          ? "Inspect within 30 days."
          : "Continue routine monitoring.")
  };

  const mergedFaults = [
    ...(a?.identifiedFaults || []),
    ...(b?.identifiedFaults || [])
  ];
  const seen = new Set<string>();
  const identifiedFaults = mergedFaults.filter((f) => {
    const key = (f.title || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (identifiedFaults.length === 0) {
    identifiedFaults.push({
      title: primaryFault.title,
      frequencyHz: primaryFault.frequencyHz,
      confidencePercent,
      severity,
      description: a?.reasoning || b?.reasoning || "Consensus primary finding."
    });
  }

  const healthFromAgents = [a?.overallHealthScore, b?.overallHealthScore]
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));
  let overallHealthScore =
    healthFromAgents.length > 0
      ? Math.round(
          healthFromAgents.reduce((s, n) => s + n, 0) / healthFromAgents.length
        )
      : severity === "CRITICAL"
        ? 35
        : severity === "ANOMALY"
          ? 62
          : 88;
  overallHealthScore = clamp(overallHealthScore, 0, 100);

  const costed = computeFinancialImpactFromFaultTitle(primaryFault.title);

  return {
    overallHealthScore,
    severity,
    summary:
      debateNote ||
      `Consensus analysis: ${primaryFault.title} at ${primaryFault.frequencyHz} Hz (${severity}).`,
    primaryFault,
    identifiedFaults,
    financialImpact: costed.financialImpact,
    repairRecommendations: costed.repairRecommendations,
    consensusDetails: {
      modelA_Hypothesis: a
        ? `${a.primaryFaultTitle} (${a.confidencePercent}%): ${a.reasoning}`
        : "Agent A unavailable — kinematic stage skipped or failed.",
      modelB_Hypothesis: b
        ? `${b.primaryFaultTitle} (${b.confidencePercent}%)${
            b.isoZone ? ` ISO Zone ${b.isoZone}` : ""
          }: ${b.reasoning}`
        : "Agent B unavailable — ISO stage skipped or failed.",
      refereeDebateSummary: debateNote
    }
  };
}

async function stage3ConsensusReferee(
  extraction: Stage1Extraction,
  agentA: AnalystHypothesis | null,
  agentB: AnalystHypothesis | null,
  specs: AnalyzeComponentSpecs,
  telemetry: AnalyzeTelemetry
): Promise<ConsensusVibrationResult> {
  const velocity =
    Number(extraction.overallRmsVelocity) ||
    Number(telemetry.rmsVelocity) ||
    0;
  const isoZone = agentB?.isoZone || "unknown";

  const system = `You are the final authority on vibration analysis. Reconcile Stage 2a (fault diagnosis) and Stage 2b (ISO standards).

Rules:
1. HEALTHY MACHINE PATH: If overall velocity (${velocity} mm/s) falls within ISO Zone A (as evaluated by Stage 2b based on machine class) and no harmonic or non-synchronous peaks exceed alarm limits, output finalDiagnosis: "Machine Healthy / Normal Operation" with high confidence. Do not flag standard running speed peaks as faults unless they breach ISO severity thresholds.
2. If Stage 2a says "Normal" but ISO Zone is C or D, override to "Anomaly Detected".
3. If Stage 2a identifies a fault with >80% confidence, accept it unless ISO Zone A clearly contradicts it.
4. If Stage 2a and Stage 2b disagree, prioritize safety and make a decisive call — do not default to "Inconclusive" unless evidence is truly insufficient. If either agent detects a high-severity fault or ISO Zone D, treat the diagnosis as "Anomaly Detected". If the disagreement is minor (e.g. Normal vs Zone B), default to "Machine Healthy / Normal Operation".
5. Only use "Inconclusive - Manual Review Recommended" when RPM, peaks, or overall velocity cannot support a safe conclusion.

Output JSON:
{
  "finalDiagnosis": string,
  "confidence": number,
  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "actionPlan": string,
  "discrepancies": string[]
}`;

  const user = `${specsBlock(specs, telemetry)}

=== STAGE 1 EXTRACTION (image RPM / peaks) ===
${JSON.stringify(extraction)}

=== STAGE 2a KINEMATIC ANALYST ===
${JSON.stringify(agentA)}

=== STAGE 2b ISO ANALYST (Zone ${isoZone}) ===
${JSON.stringify(agentB)}

Remember: 1X Hz = RPM/60. Never confuse RPM with Hz.`;

  if (!hasOpenRouterKey()) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const raw = await callOpenRouter(OPENROUTER_CONSENSUS_MODEL, system, user);
  const parsed = extractJsonObject(raw) as Record<string, unknown>;
  const normalized = normalizeStage3ExpertResponse(
    parsed,
    extraction,
    agentA,
    agentB
  );
  return normalizeRefereeResult(normalized, agentA, agentB);
}

function normalizeRefereeResult(
  parsed: ConsensusVibrationResult,
  agentA: AnalystHypothesis | null,
  agentB: AnalystHypothesis | null
): ConsensusVibrationResult {
  if (!parsed.consensusDetails) {
    parsed.consensusDetails = {
      modelA_Hypothesis: agentA?.reasoning || "n/a",
      modelB_Hypothesis: agentB?.reasoning || "n/a",
      refereeDebateSummary: parsed.summary || "Referee synthesis complete."
    };
  }
  if (!parsed.primaryFault) {
    parsed.primaryFault = {
      title: agentA?.primaryFaultTitle || agentB?.primaryFaultTitle || "Unresolved",
      frequencyHz: Number(agentA?.frequencyHz ?? agentB?.frequencyHz ?? 0),
      confidencePercent: 75,
      severity: (agentA?.severity || agentB?.severity || "ANOMALY") as ApiSeverity,
      actionWindow: "Inspect and verify operating RPM."
    };
  }
  parsed.primaryFault.confidencePercent = clamp(
    Number(parsed.primaryFault?.confidencePercent ?? 75),
    0,
    100
  );
  return parsed;
}

/* -------------------------------------------------------------------------- */
/* Public entry                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Run the full 3-stage consensus pipeline (live AI — no mock data).
 */
export async function runConsensusVibrationAnalysis(
  body: AnalyzeVibrationRequest
): Promise<ConsensusOutcome> {
  const startTime = logPipelineStart("consensus-engine", {
    mode: body?.mode || "full"
  });
  const { imageBase64, componentSpecs = {}, telemetry = {}, mode } = body || {};

  if (!imageBase64 || typeof imageBase64 !== "string") {
    console.error("[consensus] imageBase64 missing.");
    return consensusDomainError(
      "SIGNAL_UNREADABLE",
      "OpenAI Vision Error: Unable to extract spectrum peaks (imageBase64 required)."
    );
  }
  logPayloadSize("consensus-engine", imageBase64);

  if (!hasOpenRouterKey()) {
    console.error("[consensus] OPENROUTER_API_KEY not configured.");
    return consensusDomainError(
      "GATEWAY_TIMEOUT",
      "OPENROUTER_API_KEY is required for all consensus stages."
    );
  }

  let extraction: Stage1Extraction;

  // Stage 1 — GPT-4o Vision via OpenRouter
  try {
    console.log("[consensus] Stage 1 — OpenRouter GPT-4o vision extraction…");
    logPipelineSend("consensus-stage1");
    extraction = await stage1VisionExtract(
      imageBase64,
      componentSpecs,
      telemetry,
      mode === "simple" ? "simple" : "full"
    );
    console.log("[consensus] Stage 1 complete:", {
      peaks: extraction.peaks?.length ?? 0,
      oneX: extraction.runningSpeed1xHz,
      confidence: extraction.extractionConfidence,
      axesReadable: extraction.axesReadable,
      elapsedSec: pipelineElapsedSec(startTime)
    });
  } catch (err) {
    logPipelineFail("consensus-stage1", startTime, err);
    console.error("🚨 OpenAI Vision Raw Error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[consensus] Stage 1 OpenAI Vision failed:", msg);
    return consensusDomainError(
      "SIGNAL_UNREADABLE",
      `OpenAI Vision Error: Unable to extract spectrum peaks (${msg})`
    );
  }

  console.log("[DEBUG] Extraction object:", JSON.stringify(extraction, null, 2));
console.log("[DEBUG] Is readable?", isExtractionReadable(extraction));
  if (!isExtractionReadable(extraction)) {
    console.error("[consensus] Stage 1 produced unreadable spectrum axes/peaks.");
    return consensusDomainError(
      "SIGNAL_UNREADABLE",
      `OpenAI Vision Error: Unable to extract spectrum peaks (peaks=${extraction.peaks?.length ?? 0}, confidence=${extraction.extractionConfidence ?? "n/a"}, axesReadable=${extraction.axesReadable})`
    );
  }

  let agentA: AnalystHypothesis | null = null;
  let agentB: AnalystHypothesis | null = null;
  const stageErrors: string[] = [];

  // Stage 2a & 2b in parallel
  const stage2Start = performance.now();
  logPipelineSend("consensus-stage2", {
    model: OPENROUTER_CONSENSUS_MODEL
  });
  const [aResult, bResult] = await Promise.allSettled([
    stage2aKinematicAnalyst(extraction, componentSpecs, telemetry),
    stage2bIsoAnalyst(extraction, componentSpecs, telemetry)
  ]);

  if (aResult.status === "fulfilled") {
    agentA = aResult.value;
    console.log("[consensus] Stage 2a complete:", agentA.primaryFaultTitle);
  } else {
    const msg =
      aResult.reason instanceof Error
        ? aResult.reason.message
        : String(aResult.reason);
    stageErrors.push(`Stage2a: ${msg}`);
    console.error("[consensus] Stage 2a failed:", msg);
    if (isTimeoutLike(aResult.reason) || /api key|not configured/i.test(msg)) {
      stageErrors.push("Stage2a: provider timeout or key issue");
    }
  }

  if (bResult.status === "fulfilled") {
    agentB = bResult.value;
    console.log("[consensus] Stage 2b complete:", agentB.primaryFaultTitle);
  } else {
    const msg =
      bResult.reason instanceof Error
        ? bResult.reason.message
        : String(bResult.reason);
    stageErrors.push(`Stage2b: ${msg}`);
    console.error("[consensus] Stage 2b failed:", msg);
    if (isTimeoutLike(bResult.reason) || /api key|not configured/i.test(msg)) {
      stageErrors.push("Stage2b: provider timeout or key issue");
    }
  }

  console.log("[consensus] Stage 2 elapsed:", pipelineElapsedSec(stage2Start) + "s");

  if (!agentA && !agentB) {
    console.error("[consensus] Both Stage 2 analysts failed.", stageErrors);
    return consensusDomainError(
      "GATEWAY_TIMEOUT",
      stageErrors.join(" | ") || "Both Stage 2 analysts failed."
    );
  }

  // Agent agreement check — log disagreements but always proceed to Stage 3 referee
  let agentDisagreementNote: string | undefined;

  if (agentA && agentB) {
    const agree = faultsAgree(agentA, agentB);
    const confA = clamp(Number(agentA.confidencePercent ?? 0), 0, 100);
    const confB = clamp(Number(agentB.confidencePercent ?? 0), 0, 100);
    if (!agree) {
      agentDisagreementNote = `Agents disagreed on fault classification: AgentA="${agentA.primaryFaultTitle}" (${confA}%) vs AgentB="${agentB.primaryFaultTitle}" ISO Zone ${isoZoneOf(agentB) || "?"} (${confB}%).`;
      console.warn(
        "[consensus] Agent disagreement — Stage 3 referee will reconcile:",
        { agree, confA, confB, a: agentA.primaryFaultTitle, b: agentB.primaryFaultTitle }
      );
    } else if (confA < 80 || confB < 80) {
      console.warn("[consensus] Low agent confidence — Stage 3 referee will reconcile:", {
        confA,
        confB
      });
    }
  } else {
    const solo = agentA || agentB!;
    const conf = clamp(Number(solo.confidencePercent ?? 0), 0, 100);
    if (conf < 80) {
      agentDisagreementNote = `Single-agent confidence ${conf}% below 80% (${solo.primaryFaultTitle}). Manual review recommended.`;
      console.warn("[consensus]", agentDisagreementNote);
    }
  }

  // Stage 3 — referee
  try {
    console.log("[consensus] Stage 3 — referee synthesis…");
    logPipelineSend("consensus-stage3");
    let finalResult = await stage3ConsensusReferee(
      extraction,
      agentA,
      agentB,
      componentSpecs,
      telemetry
    );

    if (agentDisagreementNote) {
      finalResult.consensusDetails = {
        modelA_Hypothesis:
          finalResult.consensusDetails?.modelA_Hypothesis ||
          agentA?.reasoning ||
          "n/a",
        modelB_Hypothesis:
          finalResult.consensusDetails?.modelB_Hypothesis ||
          agentB?.reasoning ||
          "n/a",
        refereeDebateSummary: [agentDisagreementNote, finalResult.consensusDetails?.refereeDebateSummary]
          .filter(Boolean)
          .join(" ")
      };
    }

    let confidence = clamp(
      Number(finalResult.primaryFault?.confidencePercent ?? 0),
      0,
      100
    );

    const inconclusiveTitle = /inconclusive|manual review/i.test(
      finalResult.primaryFault?.title || ""
    );
    const needsReview = confidence < 80 || inconclusiveTitle;

    if (needsReview) {
      finalResult = applyManualReviewWarning(
        finalResult,
        agentDisagreementNote ||
          "Confidence was below threshold or the referee could not reach a firm conclusion.",
        Math.max(confidence, 50)
      );
      confidence = finalResult.primaryFault.confidencePercent;
    } else if (agentDisagreementNote) {
      finalResult.summary = `${finalResult.summary || finalResult.primaryFault.title}. ${agentDisagreementNote}`;
    }

    if (stageErrors.length > 0) {
      finalResult.consensusDetails = {
        ...finalResult.consensusDetails,
        refereeDebateSummary: `${finalResult.consensusDetails?.refereeDebateSummary || ""}\n\nPartial pipeline notes: ${stageErrors.join(" | ")}`.trim()
      };
    }

    const sev = String(finalResult.severity || "ANOMALY").toUpperCase();
    if (sev === "CRITICAL" || sev === "ANOMALY" || sev === "NORMAL") {
      finalResult.severity = sev;
    } else {
      finalResult.severity = "ANOMALY";
    }

    finalResult.overallHealthScore = clamp(
      Number(finalResult.overallHealthScore ?? 50),
      0,
      100
    );
    finalResult.primaryFault.confidencePercent = confidence;

    if (!finalResult.consensusDetails) {
      finalResult.consensusDetails = {
        modelA_Hypothesis: agentA?.reasoning || "n/a",
        modelB_Hypothesis: agentB?.reasoning || "n/a",
        refereeDebateSummary: finalResult.summary || "Consensus complete."
      };
    }

    const aligned = ensureFaultListOnResult(
      finalResult,
      extraction,
      agentA,
      agentB
    );

    const costed = computeFinancialImpactFromFaultTitle(aligned.primaryFault?.title);
    aligned.financialImpact = costed.financialImpact;
    aligned.repairRecommendations = costed.repairRecommendations;

    console.log("[consensus] Pipeline complete:", {
      severity: aligned.severity,
      health: aligned.overallHealthScore,
      primary: aligned.primaryFault?.title,
      faults: aligned.identifiedFaults?.length ?? 0,
      confidence,
      stage1Peaks: extraction.peaks?.length ?? 0,
      elapsedSec: pipelineElapsedSec(startTime)
    });
    logPipelineSuccess("consensus-engine", startTime, {
      primary: aligned.primaryFault?.title
    });

    return buildConsensusSuccessPayload(aligned, extraction);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logPipelineFail("consensus-stage3", startTime, err);
    console.error("[consensus] Stage 3 failed:", msg);

    // Graceful fallback — synthesize a reviewable result instead of hard-stopping the UI
    const fallback = localRefereeSynthesize(
      extraction,
      agentA,
      agentB,
      agentDisagreementNote ||
        `Stage 3 referee unavailable (${msg}). Manual review recommended.`
    );
    const warned = applyManualReviewWarning(
      fallback,
      agentDisagreementNote ||
        "Stage 3 referee could not reconcile agents. Manual review recommended.",
      50
    );
    const aligned = ensureFaultListOnResult(
      warned,
      extraction,
      agentA,
      agentB
    );
    const costed = computeFinancialImpactFromFaultTitle(aligned.primaryFault?.title);
    aligned.financialImpact = costed.financialImpact;
    aligned.repairRecommendations = costed.repairRecommendations;

    console.warn("[consensus] Returning review warning result after Stage 3 failure.");
    return buildConsensusSuccessPayload(aligned, extraction);
  }
}
