/**
 * Legacy single-model vibration analysis via OpenAI GPT-4o Vision.
 * Prefer `runConsensusVibrationAnalysis` from `./consensusEngine` for production diagnostics.
 */

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
  /** Present when produced by the 3-stage consensus engine */
  consensusDetails?: {
    modelA_Hypothesis: string;
    modelB_Hypothesis: string;
    refereeDebateSummary: string;
  };
}

const OPENAI_VISION_MODELS = ["gpt-4o", "gpt-4-turbo"] as const;

function asText(value: unknown, fallback = "—"): string {
  if (value == null || value === "") return fallback;
  return String(value);
}

function stripDataUrl(imageBase64: string): { data: string; mimeType: string } {
  const trimmed = imageBase64.trim();
  const mimeMatch = /^data:(image\/\w+);base64,/i.exec(trimmed);
  const mimeType = mimeMatch?.[1] || "image/png";
  const data = trimmed.replace(/^data:image\/\w+;base64,/, "");
  return { data, mimeType };
}

function buildSystemPrompt(
  specs: AnalyzeComponentSpecs,
  telemetry: AnalyzeTelemetry
): string {
  const motorHp = asText(specs.motorHpKw ?? specs.motorHp, "unknown");
  const ratedRpm = asText(specs.ratedRpm, "unknown");
  const lineFrequency = asText(specs.lineFrequency, "60 Hz");
  const bearingDe = asText(specs.bearingDe, "unknown");
  const bearingNde = asText(specs.bearingNde, "unknown");
  const rotorBars = asText(specs.rotorBars, "unknown");
  const statorSlots = asText(specs.statorSlots, "unknown");

  return `You are an ISO 18436-2 Category IV (Level IV) Vibration Analyst and Reliability Engineer performing Master Vibration AI diagnostics.

Analyze the attached FFT / spectrum chart image together with the verified equipment kinematics below.

=== COMPONENT CONTEXT (VERIFIED) ===
Asset: ${asText(specs.asset, "Unknown Asset")}
Component: ${asText(specs.component, "Unknown Component")}
Motor HP / kW: ${motorHp}
Rated RPM: ${ratedRpm}
Line Frequency: ${lineFrequency}
Drive End (DE) Bearing: ${bearingDe}
Non-Drive End (NDE) Bearing: ${bearingNde}
Rotor Bars: ${rotorBars}
Stator Slots: ${statorSlots}

=== TELEMETRY (IF PROVIDED) ===
Measurement Location: ${asText(telemetry.measurementLocation)}
Measurement Point: ${asText(telemetry.measurementPoint)}
RMS Velocity: ${asText(telemetry.rmsVelocity)}
Peak Acceleration: ${asText(telemetry.peakAcceleration)}
Operating Temperature: ${asText(telemetry.operatingTemp)}
Load: ${asText(telemetry.loadCondition)} ${asText(telemetry.loadPercentage, "")}
Fmax: ${asText(telemetry.fmax)}
Lines of Resolution: ${asText(telemetry.lor)}

=== ANALYSIS REQUIREMENTS ===
1. Identify dominant spectral peaks and estimate amplitude scale from the chart axes.
2. Calculate 1X running speed (Hz) from Rated RPM: 1X_Hz = RPM / 60.
3. Evaluate 1X / 2X for unbalance and misalignment signatures.
4. Estimate bearing defect frequencies (BPFO, BPFI, BSF, FTF) for the DE/NDE catalog bearings and check for matching peak families / harmonics.
5. Correlate findings with ISO severity (NORMAL / ANOMALY / CRITICAL).
6. Provide actionable repair recommendations and rough financial impact.

=== OUTPUT FORMAT (STRICT) ===
Return ONLY valid JSON matching the MotorMedic VibrationAnalysisResult schema.`;
}

function extractJsonObject(text: string): unknown {
  const cleaned = String(text || "")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* continue */
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1));
  }
  throw new Error("Model response did not contain valid JSON.");
}

export type AnalyzeVibrationOutcome =
  | { ok: true; data: VibrationAnalysisResult }
  | { ok: false; status: number; error: string; detail?: string; raw?: string };

/**
 * Single-model OpenAI GPT-4o vision analysis.
 * Production path: use `runConsensusVibrationAnalysis` from `./consensusEngine`.
 */
export async function runOpenAiVibrationAnalysis(
  body: AnalyzeVibrationRequest
): Promise<AnalyzeVibrationOutcome> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    console.error(
      "[analyze-vibration] OPENAI_API_KEY missing. Add the key to .env and restart the MotorMedic Pro server (npm run dev)."
    );
    return {
      ok: false,
      status: 400,
      error: "OPENAI_API_KEY is not configured in .env"
    };
  }

  const { imageBase64, componentSpecs = {}, telemetry = {} } = body;

  if (!imageBase64 || typeof imageBase64 !== "string") {
    console.error(
      "[analyze-vibration] Rejected request: imageBase64 missing or invalid."
    );
    return {
      ok: false,
      status: 400,
      error: "imageBase64 is required in the request payload."
    };
  }

  const systemPrompt = buildSystemPrompt(componentSpecs, telemetry);
  const { data, mimeType } = stripDataUrl(imageBase64);
  const cleanBase64 = data.replace(/^data:image\/\w+;base64,/, "");
  const dataUrl = `data:${mimeType};base64,${cleanBase64}`;
  const client = new OpenAI({ apiKey });
  const userText =
    "Analyze this FFT / vibration spectrum chart and return the strict JSON diagnostic result.";

  try {
    let lastError: unknown;
    for (const model of OPENAI_VISION_MODELS) {
      try {
        let contentText = "";
        try {
          const response = await client.chat.completions.create({
            model,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: [
                  { type: "text", text: userText },
                  { type: "image_url", image_url: { url: dataUrl } }
                ]
              }
            ]
          });
          contentText = response.choices[0]?.message?.content || "";
        } catch {
          const response = await client.chat.completions.create({
            model,
            temperature: 0.2,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: [
                  { type: "text", text: userText },
                  { type: "image_url", image_url: { url: dataUrl } }
                ]
              }
            ]
          });
          contentText = response.choices[0]?.message?.content || "";
        }

        if (!contentText.trim()) {
          lastError = new Error(`Empty response from OpenAI Vision (${model}).`);
          continue;
        }

        try {
          const parsed = extractJsonObject(contentText) as VibrationAnalysisResult;
          return { ok: true, data: parsed };
        } catch (parseErr) {
          return {
            ok: false,
            status: 502,
            error: "Failed to parse model JSON response.",
            detail:
              parseErr instanceof Error ? parseErr.message : "Unknown parse error",
            raw: contentText
          };
        }
      } catch (err) {
        lastError = err;
        console.warn(
          `[analyze-vibration] OpenAI Vision model ${model} failed:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    console.error("[analyze-vibration] OpenAI Vision call failed:", lastError);
    return {
      ok: false,
      status: 500,
      error: "OpenAI Vision Error: Unable to extract spectrum peaks",
      detail: lastError instanceof Error ? lastError.message : "Unknown error"
    };
  } catch (err) {
    console.error("🚨 OpenAI Vision Raw Error:", err);
    return {
      ok: false,
      status: 500,
      error: "OpenAI Vision Error: Unable to extract spectrum peaks",
      detail: err instanceof Error ? err.message : "Unknown error"
    };
  }
}

/** @deprecated Use runOpenAiVibrationAnalysis or runConsensusVibrationAnalysis */
export async function runGeminiVibrationAnalysis(
  body: AnalyzeVibrationRequest
): Promise<AnalyzeVibrationOutcome> {
  return runOpenAiVibrationAnalysis(body);
}

/** @deprecated Use runOpenAiVibrationAnalysis or runConsensusVibrationAnalysis */
export async function runQwenVibrationAnalysis(
  body: AnalyzeVibrationRequest
): Promise<AnalyzeVibrationOutcome> {
  return runOpenAiVibrationAnalysis(body);
}
