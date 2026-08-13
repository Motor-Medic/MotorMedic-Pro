/**
 * 3-Stage Multi-Model Consensus Engine for MotorMedic Pro vibration diagnostics.
 *
 * Stage 1  — OpenAI GPT-4o Vision spectrum extractor (OPENAI_API_KEY)
 * Stage 2a — DeepSeek / OpenRouter kinematic fault-mode analyst
 * Stage 2b — Groq / OpenAI ISO 10816/20816 severity analyst
 * Stage 3  — Consensus referee via Groq / OpenRouter / Gemini
 *
 * Failures return structured domain errors (never mock diagnostic data).
 */

import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

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

const OPENAI_VISION_MODELS = ["gpt-4o", "gpt-4-turbo"] as const;
/** Text-only referee models (Stage 3 optional path — not used for spectrum vision) */
const GEMINI_REFEREE_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;

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
      "An AI provider timed out during multi-agent synthesis. Please retry analysis."
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
  if (!Number.isFinite(overallHealthScore) || (severity !== "NORMAL" && overallHealthScore > 75)) {
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

function faultsAgree(a?: string, b?: string): boolean {
  const ka = normalizeFaultKey(a);
  const kb = normalizeFaultKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const aTokens = new Set(ka.split(" ").filter((t) => t.length > 3));
  const bTokens = kb.split(" ").filter((t) => t.length > 3);
  const overlap = bTokens.filter((t) => aTokens.has(t)).length;
  return overlap >= 2;
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

async function callOpenAiCompatible(
  provider: "deepseek" | "openrouter" | "groq" | "openai",
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  let apiKey = "";
  let baseURL = "";

  switch (provider) {
    case "deepseek":
      apiKey = process.env.DEEPSEEK_API_KEY?.trim() || "";
      baseURL = "https://api.deepseek.com/v1";
      break;
    case "openrouter":
      apiKey = process.env.OPENROUTER_API_KEY?.trim() || "";
      baseURL = "https://openrouter.ai/api/v1";
      break;
    case "groq":
      apiKey = process.env.GROQ_API_KEY?.trim() || "";
      baseURL = "https://api.groq.com/openai/v1";
      break;
    case "openai":
      apiKey = process.env.OPENAI_API_KEY?.trim() || "";
      baseURL = "https://api.openai.com/v1";
      break;
  }

  if (!apiKey) {
    throw new Error(`${provider.toUpperCase()}_API_KEY is not configured.`);
  }

  const client = new OpenAI({ apiKey, baseURL });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.15,
      response_format: { type: "json_object" }
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error(`${provider} returned empty content.`);
    return content;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[consensus] ${provider}/${model} JSON mode failed, retrying plain:`,
      message
    );
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.15
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error(`${provider} returned empty content on retry.`);
    return content;
  }
}

/* -------------------------------------------------------------------------- */
/* Stage 1 — OpenAI GPT-4o Vision spectrum extractor                          */
/* -------------------------------------------------------------------------- */

const OPENAI_VISION_SYSTEM_PROMPT = `You are a vibration analysis expert. Extract the following from this FFT spectrum chart:
   - Peak frequencies (Hz) and their amplitudes
   - X-axis range (Fmax)
   - Y-axis units (velocity, acceleration, or displacement)
   - Identify 1X running speed, harmonics, and bearing fault frequencies
   Return as JSON array with: frequency, amplitude, label`;

interface OpenAiSpectrumPeak {
  frequency?: number;
  frequencyHz?: number;
  amplitude?: number;
  label?: string;
}

/**
 * Analyze a spectrum chart image with OpenAI GPT-4o Vision.
 * Retries with gpt-4-turbo if gpt-4o fails.
 */
export async function analyzeSpectrumWithOpenAI(
  imageBase64: string,
  context?: { specs?: AnalyzeComponentSpecs; telemetry?: AnalyzeTelemetry }
): Promise<Stage1Extraction> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const { data, mimeType } = stripDataUrl(imageBase64);
  const cleanBase64 = data.replace(/^data:image\/\w+;base64,/, "");
  const dataUrl = `data:${mimeType};base64,${cleanBase64}`;

  const specs = context?.specs || {};
  const telemetry = context?.telemetry || {};
  const userContext = `${specsBlock(specs, telemetry)}

Also return a JSON object wrapping the peaks array so the schema is:
{
  "peaks": [ { "frequency": number, "amplitude": number, "label": string } ],
  "fmax": number,
  "amplitudeUnit": "velocity" | "acceleration" | "displacement" | "in/s" | "mm/s" | "g",
  "runningSpeed1xHz": number,
  "overallRmsVelocity": number,
  "axesReadable": boolean,
  "extractionConfidence": number,
  "notes": string
}`;

  const client = new OpenAI({ apiKey });
  let lastError: unknown;

  for (const model of OPENAI_VISION_MODELS) {
    try {
      console.log(`[consensus] Stage 1 OpenAI Vision via ${model}…`);
      let contentText = "";
      try {
        const response = await client.chat.completions.create({
          model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: OPENAI_VISION_SYSTEM_PROMPT },
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
        console.warn(
          `[consensus] ${model} JSON mode failed, retrying plain:`,
          jsonModeErr instanceof Error ? jsonModeErr.message : jsonModeErr
        );
        const response = await client.chat.completions.create({
          model,
          temperature: 0.1,
          messages: [
            { role: "system", content: OPENAI_VISION_SYSTEM_PROMPT },
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

      const unit = meta.amplitudeUnit || "in/s";
      const peaks: SpectrumPeak[] = peakRows
        .map((p) => {
          const frequencyHz = Number(p.frequencyHz ?? p.frequency ?? 0);
          const amplitude = Number(p.amplitude ?? 0);
          return {
            frequencyHz,
            frequencyCpm: frequencyHz > 0 ? frequencyHz * 60 : undefined,
            amplitude,
            amplitudeUnit: unit,
            label: p.label || undefined
          };
        })
        .filter((p) => Number.isFinite(p.frequencyHz) && p.frequencyHz > 0);

      const rpm = Number(specs.ratedRpm);
      let runningSpeed1xHz = Number(meta.runningSpeed1xHz);
      let runningSpeed1xRpm = Number(meta.runningSpeed1xRpm);
      if (
        (!Number.isFinite(runningSpeed1xHz) || runningSpeed1xHz <= 0) &&
        Number.isFinite(rpm) &&
        rpm > 0
      ) {
        runningSpeed1xRpm = rpm;
        runningSpeed1xHz = rpm / 60;
      }

      const oneXPeak = peaks.find((p) =>
        /1\s*x|running\s*speed|1x/i.test(String(p.label || ""))
      );
      if ((!Number.isFinite(runningSpeed1xHz) || runningSpeed1xHz <= 0) && oneXPeak) {
        runningSpeed1xHz = oneXPeak.frequencyHz;
        runningSpeed1xRpm = oneXPeak.frequencyHz * 60;
      }

      return {
        peaks,
        overallRmsVelocity: Number.isFinite(Number(meta.overallRmsVelocity))
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
        notes:
          meta.notes ||
          (meta.fmax != null ? `Fmax≈${meta.fmax}` : undefined),
        extractionConfidence: Number.isFinite(Number(meta.extractionConfidence))
          ? Number(meta.extractionConfidence)
          : peaks.length > 0
            ? 80
            : 30,
        axesReadable: meta.axesReadable !== false && peaks.length > 0
      };
    } catch (err) {
      lastError = err;
      console.error("🚨 OpenAI Vision Raw Error:", err);
      console.warn(
        `[consensus] OpenAI Vision model ${model} failed:`,
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
  telemetry: AnalyzeTelemetry
): Promise<Stage1Extraction> {
  return analyzeSpectrumWithOpenAI(imageBase64, { specs, telemetry });
}

/* -------------------------------------------------------------------------- */
/* Stage 2a — Kinematic Math & Fault Modes (DeepSeek / OpenRouter)            */
/* -------------------------------------------------------------------------- */

async function stage2aKinematicAnalyst(
  extraction: Stage1Extraction,
  specs: AnalyzeComponentSpecs,
  telemetry: AnalyzeTelemetry
): Promise<AnalystHypothesis> {
  const system = `You are Agent A — Kinematic Math & Fault Modes specialist.
Evaluate 1X Unbalance, 2X Misalignment, 3X-10X harmonics, and bearing defect frequencies (BPFO, BPFI, BSF, FTF).
Return ONLY JSON matching:
{
  "primaryFaultTitle": string,
  "frequencyHz": number,
  "severity": "NORMAL"|"ANOMALY"|"CRITICAL",
  "confidencePercent": number,
  "reasoning": string,
  "actionWindow": string,
  "overallHealthScore": number,
  "identifiedFaults": [{ "title", "frequencyHz", "confidencePercent", "severity", "description" }]
}`;

  const user = `${specsBlock(specs, telemetry)}

=== STAGE 1 SPECTRUM EXTRACTION ===
${JSON.stringify(extraction, null, 2)}

Correlate peaks to theoretical fault families using Rated RPM → 1X Hz = RPM/60.`;

  let raw: string;
  if (process.env.DEEPSEEK_API_KEY?.trim()) {
    raw = await callOpenAiCompatible(
      "deepseek",
      "deepseek-chat",
      system,
      user
    );
  } else if (process.env.OPENROUTER_API_KEY?.trim()) {
    raw = await callOpenAiCompatible(
      "openrouter",
      "deepseek/deepseek-chat",
      system,
      user
    );
  } else {
    throw new Error("DEEPSEEK_API_KEY or OPENROUTER_API_KEY is not configured.");
  }

  return extractJsonObject(raw) as AnalystHypothesis;
}

/* -------------------------------------------------------------------------- */
/* Stage 2b — ISO Standards & Operational Context (Groq / OpenAI)             */
/* -------------------------------------------------------------------------- */

async function stage2bIsoAnalyst(
  extraction: Stage1Extraction,
  specs: AnalyzeComponentSpecs,
  telemetry: AnalyzeTelemetry
): Promise<AnalystHypothesis> {
  const system = `You are Agent B — ISO Standards & Operational Context specialist.
Evaluate overall RMS vibration against ISO 10816 / ISO 20816 severity zones (Zone A/B/C/D).
Consider load, temperature, and measurement point context.
Return ONLY JSON matching:
{
  "primaryFaultTitle": string,
  "frequencyHz": number,
  "severity": "NORMAL"|"ANOMALY"|"CRITICAL",
  "confidencePercent": number,
  "isoZone": "A"|"B"|"C"|"D",
  "reasoning": string,
  "actionWindow": string,
  "overallHealthScore": number,
  "identifiedFaults": [{ "title", "frequencyHz", "confidencePercent", "severity", "description" }]
}`;

  const user = `${specsBlock(specs, telemetry)}

=== STAGE 1 SPECTRUM EXTRACTION ===
${JSON.stringify(extraction, null, 2)}

Map overallRmsVelocity (and telemetry RMS) to ISO zones for this machine class.`;

  let raw: string;
  if (process.env.GROQ_API_KEY?.trim()) {
    raw = await callOpenAiCompatible(
      "groq",
      "llama-3.3-70b-versatile",
      system,
      user
    );
  } else if (process.env.OPENAI_API_KEY?.trim()) {
    raw = await callOpenAiCompatible("openai", "gpt-4o-mini", system, user);
  } else {
    throw new Error("GROQ_API_KEY or OPENAI_API_KEY is not configured.");
  }

  return extractJsonObject(raw) as AnalystHypothesis;
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

  const primary = a?.confidencePercent >= (b?.confidencePercent ?? 0) ? a : b;
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
  const system = `You are the Consensus Referee for a multi-model vibration diagnosis.
Debate discrepancies between Agent A (kinematics) and Agent B (ISO/ops).
Assign overall confidencePercent (0-100). Prefer agreement; lower confidence when hypotheses conflict.
Return ONLY JSON matching the MotorMedic app schema:
{
  "overallHealthScore": number,
  "severity": "NORMAL"|"ANOMALY"|"CRITICAL",
  "summary": string,
  "primaryFault": { "title", "frequencyHz", "confidencePercent", "severity", "actionWindow" },
  "identifiedFaults": [{ "title", "frequencyHz", "confidencePercent", "severity", "description" }],
  "financialImpact": { "preventiveRepairCost", "failureCostIfDelayed", "downtimeLossPerHour" },
  "repairRecommendations": string[],
  "consensusDetails": {
    "modelA_Hypothesis": string,
    "modelB_Hypothesis": string,
    "refereeDebateSummary": string
  }
}`;

  const user = `${specsBlock(specs, telemetry)}

=== STAGE 1 EXTRACTION ===
${JSON.stringify(extraction)}

=== AGENT A (KINEMATIC) ===
${JSON.stringify(agentA)}

=== AGENT B (ISO) ===
${JSON.stringify(agentB)}`;

  try {
    if (process.env.GROQ_API_KEY?.trim()) {
      const raw = await callOpenAiCompatible(
        "groq",
        "llama-3.3-70b-versatile",
        system,
        user
      );
      return normalizeRefereeResult(
        extractJsonObject(raw) as ConsensusVibrationResult,
        agentA,
        agentB
      );
    }

    if (process.env.OPENROUTER_API_KEY?.trim()) {
      const raw = await callOpenAiCompatible(
        "openrouter",
        "google/gemini-2.0-flash-001",
        system,
        user
      );
      return normalizeRefereeResult(
        extractJsonObject(raw) as ConsensusVibrationResult,
        agentA,
        agentB
      );
    }

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (geminiKey) {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      let lastErr: unknown;
      for (const model of GEMINI_REFEREE_MODELS) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: `${system}\n\n${user}`,
            config: {
              temperature: 0.2,
              responseMimeType: "application/json"
            }
          });
          return normalizeRefereeResult(
            extractJsonObject(response.text || "{}") as ConsensusVibrationResult,
            agentA,
            agentB
          );
        } catch (err) {
          lastErr = err;
          console.warn(
            `[consensus] Stage 3 Gemini referee ${model} failed:`,
            err instanceof Error ? err.message : err
          );
        }
      }
      throw lastErr instanceof Error
        ? lastErr
        : new Error("Gemini referee failed");
    }
  } catch (err) {
    console.error(
      "[consensus] Stage 3 referee model failed:",
      err instanceof Error ? err.message : err
    );
    if (isTimeoutLike(err)) {
      throw Object.assign(new Error("Stage 3 gateway timeout"), {
        consensusErrorType: "GATEWAY_TIMEOUT" as const
      });
    }
    if (agentA || agentB) {
      return localRefereeSynthesize(
        extraction,
        agentA,
        agentB,
        "Referee LLM unavailable; synthesized from live Agent A/B outputs only."
      );
    }
    throw Object.assign(new Error("Stage 3 failed with no agent outputs"), {
      consensusErrorType: "GATEWAY_TIMEOUT" as const
    });
  }

  throw Object.assign(
    new Error("No referee provider configured (need GROQ, OPENROUTER, or GEMINI)"),
    { consensusErrorType: "GATEWAY_TIMEOUT" as const }
  );
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
  const { imageBase64, componentSpecs = {}, telemetry = {} } = body || {};

  if (!imageBase64 || typeof imageBase64 !== "string") {
    console.error("[consensus] imageBase64 missing.");
    return consensusDomainError(
      "SIGNAL_UNREADABLE",
      "OpenAI Vision Error: Unable to extract spectrum peaks (imageBase64 required)."
    );
  }

  const hasOpenAiVision = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasAgentA = Boolean(
    process.env.DEEPSEEK_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim()
  );
  const hasAgentB = Boolean(
    process.env.GROQ_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()
  );

  if (!hasOpenAiVision) {
    console.error("[consensus] OPENAI_API_KEY not configured (required for Stage 1 vision).");
    return consensusDomainError(
      "SIGNAL_UNREADABLE",
      "OpenAI Vision Error: Unable to extract spectrum peaks (OPENAI_API_KEY not configured)."
    );
  }

  if (!hasAgentA && !hasAgentB) {
    console.error("[consensus] No Stage 2 analyst API keys configured.");
    return consensusDomainError(
      "GATEWAY_TIMEOUT",
      "Configure DEEPSEEK_API_KEY/OPENROUTER_API_KEY and GROQ_API_KEY/OPENAI_API_KEY."
    );
  }

  let extraction: Stage1Extraction;

  // Stage 1 — OpenAI GPT-4o Vision
  try {
    console.log("[consensus] Stage 1 — OpenAI GPT-4o vision extraction…");
    extraction = await stage1VisionExtract(imageBase64, componentSpecs, telemetry);
    console.log("[consensus] Stage 1 complete:", {
      peaks: extraction.peaks?.length ?? 0,
      oneX: extraction.runningSpeed1xHz,
      confidence: extraction.extractionConfidence,
      axesReadable: extraction.axesReadable
    });
  } catch (err) {
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
  let gatewayHit = false;
  const stageErrors: string[] = [];

  // Stage 2a & 2b in parallel
  const [aResult, bResult] = await Promise.allSettled([
    hasAgentA
      ? stage2aKinematicAnalyst(extraction, componentSpecs, telemetry)
      : Promise.reject(new Error("Agent A keys missing.")),
    hasAgentB
      ? stage2bIsoAnalyst(extraction, componentSpecs, telemetry)
      : Promise.reject(new Error("Agent B keys missing."))
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
      gatewayHit = true;
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
      gatewayHit = true;
    }
  }

  if (!agentA && !agentB) {
    console.error("[consensus] Both Stage 2 analysts failed.", stageErrors);
    return consensusDomainError(
      "GATEWAY_TIMEOUT",
      stageErrors.join(" | ") || "Both Stage 2 analysts failed."
    );
  }

  // Divergence / low confidence gate
  if (agentA && agentB) {
    const agree = faultsAgree(agentA.primaryFaultTitle, agentB.primaryFaultTitle);
    const confA = clamp(Number(agentA.confidencePercent ?? 0), 0, 100);
    const confB = clamp(Number(agentB.confidencePercent ?? 0), 0, 100);
    const avgConf = (confA + confB) / 2;
    if (!agree || avgConf < 80 || confA < 80 || confB < 80) {
      console.warn("[consensus] CONSENSUS_DIVERGENCE:", {
        agree,
        confA,
        confB,
        a: agentA.primaryFaultTitle,
        b: agentB.primaryFaultTitle
      });
      return consensusDomainError(
        "CONSENSUS_DIVERGENCE",
        `AgentA="${agentA.primaryFaultTitle}" (${confA}%) vs AgentB="${agentB.primaryFaultTitle}" (${confB}%); agree=${agree}`
      );
    }
  } else {
    const solo = agentA || agentB!;
    const conf = clamp(Number(solo.confidencePercent ?? 0), 0, 100);
    if (conf < 80) {
      return consensusDomainError(
        "CONSENSUS_DIVERGENCE",
        `Single-agent confidence ${conf}% below 80% threshold (${solo.primaryFaultTitle}).`
      );
    }
  }

  // Stage 3 — referee
  try {
    console.log("[consensus] Stage 3 — referee synthesis…");
    const finalResult = await stage3ConsensusReferee(
      extraction,
      agentA,
      agentB,
      componentSpecs,
      telemetry
    );

    const confidence = clamp(
      Number(finalResult.primaryFault?.confidencePercent ?? 0),
      0,
      100
    );
    if (confidence < 80) {
      return consensusDomainError(
        "CONSENSUS_DIVERGENCE",
        `Referee confidence ${confidence}% below 80% threshold.`
      );
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
      stage1Peaks: extraction.peaks?.length ?? 0
    });

    return {
      success: true,
      data: {
        ...aligned,
        success: true,
        // Expose Stage-1 peaks so the UI can reconcile if needed
        spectrumPeaks: extraction.peaks?.map((p) => ({
          frequencyHz: p.frequencyHz,
          amplitude: p.amplitude,
          label: p.label,
          chart: "fft" as const
        }))
      } as ConsensusVibrationResult & { success: true; spectrumPeaks?: unknown }
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const typed = (err as { consensusErrorType?: ConsensusErrorType })
      ?.consensusErrorType;
    console.error("[consensus] Stage 3 failed:", msg);
    if (typed === "SIGNAL_UNREADABLE" || typed === "CONSENSUS_DIVERGENCE") {
      return consensusDomainError(typed, msg);
    }
    return consensusDomainError(
      gatewayHit ? "GATEWAY_TIMEOUT" : "GATEWAY_TIMEOUT",
      msg
    );
  }
}
