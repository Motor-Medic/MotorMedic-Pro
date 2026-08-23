/**
 * MCA analyzer screenshot → structured fields via multimodal vision
 * (OpenRouter GPT-4o / GPT-4-turbo / Qwen VL through same-origin proxy).
 */

import {
  VISION_MODEL_CONFIG
} from "../vibration/visionModelConfig";
import {
  OPENROUTER_CONSENSUS_MODEL,
  OPENROUTER_VISION_FALLBACK_MODEL,
  OPENROUTER_VISION_MODEL
} from "../openRouterModels";
import {
  logPayloadSize,
  logPipelineFail,
  logPipelineSend,
  logPipelineStart,
  logPipelineSuccess
} from "../pipelineTrace";
import { sanitizeRicSeries, type RicDataPoint } from "./rotorInfluenceCalculator";
import {
  deepMergeMcaSsot,
  EMPTY_MCA_SSOT,
  mcaSsotFromVisionJson,
  type McaSsotRecord
} from "./mcaSsot";
import type {
  McaExtractedData,
  McaInsulationClass,
  McaPdfFormat
} from "./mcaPdfExtractor";

export const MCA_VISION_API_PATH = "/api/extract-vibration-image";

export const MCA_VISION_MODELS = [
  OPENROUTER_VISION_MODEL,
  OPENROUTER_VISION_FALLBACK_MODEL,
  OPENROUTER_CONSENSUS_MODEL,
  /** Gemini vision via OpenRouter (when available on the account). */
  "google/gemini-2.0-flash-001"
] as const;

const EXTRACTION_TIMEOUT_MS = 90_000;

const ZERO: [number, number, number] = [0, 0, 0];

/** Unified vision prompt — single pass returns all four MCA domains. */
export const MCA_VISION_PROMPT = `
You are a Level III Motor Circuit Analysis (MCA) technician reading an analyzer screenshot or report (ALL-TEST Pro, Megger, Baker, or similar).

CRITICAL: Return ONE JSON object with ALL FOUR domains below. Use null / [] for sections not visible. Never invent numbers.

REQUIRED JSON (no markdown, no commentary):
{
  "formatDetected": "ALL_TEST_PRO" | "MEGGER_BAKER" | "GENERIC_TABULAR" | "UNKNOWN",
  "confidenceScore": <0-100>,
  "ratedHp": <number or null>,
  "windingTempC": <number or null>,
  "phase_balance": {
    "resistance": [<T12 Ω>, <T23 Ω>, <T31 Ω>],
    "inductance": [<T12 mH>, <T23 mH>, <T31 mH>],
    "impedance": [<T12 Ω>, <T23 Ω>, <T31 Ω>],
    "phase_angle": [<T12 °>, <T23 °>, <T31 °>],
    "if_ratio": [<T12>, <T23>, <T31>],
    "winding_temp_c": <number or null>,
    "rated_hp": <number or null>
  },
  "groundwall": {
    "ir_15s": <MΩ or null>,
    "ir_30s": <MΩ or null>,
    "ir_1m": <MΩ or null>,
    "ir_10m": <MΩ or null>,
    "test_voltage": <V DC or null>,
    "insulation_class": "A" | "B" | "F" | "H" | null,
    "pi": <PI 10m/1m or null>,
    "dar": <DAR 60s/30s or null>
  },
  "rotor_influence": {
    "series": [
      { "angle": <0-360>, "l12": <mH>, "l23": <mH>, "l31": <mH> }
    ],
    "peak_variance": <number or null>,
    "eccentricity_index": <number or null>
  },
  "surge": {
    "waveform": [
      { "time": <µs or index>, "v12": <V>, "v23": <V>, "v31": <V> }
    ],
    "test_voltage_v": <number or null>,
    "ear": <max EAR % or null>,
    "peak_error_ratio": <number or null>
  }
}

Units: IR in MΩ; resistance Ω; inductance mH; surge time as printed.
Read Phase Balance, Groundwall IR, RIC, and Surge tables when visible on the same image.
`.trim();

function stripMarkdownJsonFences(raw: string): string {
  return String(raw || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function extractJsonObjectText(raw: string): string {
  const cleaned = stripMarkdownJsonFences(raw);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Vision model did not return MCA JSON.");
  }
  return cleaned.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(new Error("Failed to read MCA screenshot as base64."));
    reader.readAsDataURL(file);
  });
}

function finiteNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed || /not visible|n\/a|unknown|null/i.test(trimmed)) return null;
    const m = trimmed.replace(/,/g, "").match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
  }
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toTriplet(raw: unknown): [number, number, number] {
  if (!Array.isArray(raw) || raw.length < 3) return [...ZERO];
  const a = finiteNum(raw[0]) ?? 0;
  const b = finiteNum(raw[1]) ?? 0;
  const c = finiteNum(raw[2]) ?? 0;
  return [a, b, c];
}

function parseInsulationClass(raw: unknown): McaInsulationClass | undefined {
  if (raw == null || raw === "") return undefined;
  const s = String(raw).toUpperCase();
  if (/\bH\b|CLASS\s*H/.test(s)) return "H";
  if (/\bF\b|CLASS\s*F/.test(s)) return "F";
  if (/\bB\b|CLASS\s*B/.test(s)) return "B";
  if (/\bA\b|CLASS\s*A/.test(s)) return "A";
  return undefined;
}

function parseFormat(raw: unknown): McaPdfFormat {
  const s = String(raw || "").toUpperCase();
  if (s.includes("ALL") && s.includes("TEST")) return "ALL_TEST_PRO";
  if (s.includes("MEGGER") || s.includes("BAKER")) return "MEGGER_BAKER";
  if (s.includes("GENERIC") || s.includes("TABULAR")) return "GENERIC_TABULAR";
  if (s.includes("VISION")) return "VISION_SCREENSHOT";
  return "VISION_SCREENSHOT";
}

function scoreConfidence(data: {
  phaseR: [number, number, number];
  phaseL: [number, number, number];
  ir30s?: number | null;
  ir1m?: number | null;
  ir10m?: number | null;
  reportPi?: number | null;
  reportDar?: number | null;
  ricCount: number;
  modelScore?: number | null;
}): number {
  if (data.modelScore != null && data.modelScore > 0) {
    return Math.max(1, Math.min(100, Math.round(data.modelScore)));
  }
  let score = 15;
  if (data.phaseR.some((n) => n > 0)) score += 20;
  if (data.phaseL.some((n) => n > 0)) score += 15;
  if (data.ir1m != null && data.ir1m > 0) score += 15;
  if (data.ir30s != null && data.ir30s > 0) score += 10;
  if (data.ir10m != null && data.ir10m > 0) score += 10;
  if (data.reportPi != null && data.reportPi > 0) score += 5;
  if (data.reportDar != null && data.reportDar > 0) score += 5;
  if (data.ricCount > 0) score += Math.min(20, 5 + data.ricCount);
  return Math.max(1, Math.min(100, score));
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

/** Case-insensitive key lookup on a single object. */
function getKeyCI(obj: Record<string, unknown>, key: string): unknown {
  if (key in obj) return obj[key];
  const lower = key.toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lower) return obj[k];
  }
  return undefined;
}

/**
 * Pick first finite IR / PI / DAR value from root + nested groundwall/insulation,
 * accepting camelCase and snake_case aliases (ir_30s, ir_1m, pi, dar, …).
 */
function pickGwNumber(
  parsed: Record<string, unknown>,
  aliases: string[]
): number | undefined {
  const nests = [
    parsed,
    asRecord(parsed.groundwall),
    asRecord(parsed.insulation),
    asRecord(parsed.megger),
    asRecord(parsed.groundWall),
    asRecord(parsed.insulationToGround),
    asRecord(parsed.insulation_to_ground)
  ].filter(Boolean) as Record<string, unknown>[];

  for (const obj of nests) {
    for (const alias of aliases) {
      const n = finiteNum(getKeyCI(obj, alias));
      if (n != null && n > 0) return n;
    }
  }
  return undefined;
}

function derivePiDar(opts: {
  ir30s?: number;
  ir1m?: number;
  ir10m?: number;
  reportPi?: number;
  reportDar?: number;
}): { reportPi?: number; reportDar?: number } {
  let reportPi = opts.reportPi;
  let reportDar = opts.reportDar;
  if (
    reportPi == null &&
    opts.ir10m != null &&
    opts.ir1m != null &&
    opts.ir1m > 0
  ) {
    const derived = opts.ir10m / opts.ir1m;
    if (derived > 0 && derived < 50) {
      reportPi = Math.round(derived * 1000) / 1000;
    }
  }
  if (
    reportDar == null &&
    opts.ir1m != null &&
    opts.ir30s != null &&
    opts.ir30s > 0
  ) {
    const derived = opts.ir1m / opts.ir30s;
    if (derived > 0 && derived < 50) {
      reportDar = Math.round(derived * 1000) / 1000;
    }
  }
  return {
    ...(reportPi != null ? { reportPi } : {}),
    ...(reportDar != null ? { reportDar } : {})
  };
}

/** SSOT record → legacy flat extract (backward compatible). */
export function mcaSsotToExtractedData(record: McaSsotRecord): McaExtractedData {
  const pb = record.phase_balance;
  const gw = record.groundwall;
  const score = record.meta.confidenceScore ?? 0;
  return {
    phaseR: [...pb.resistance],
    phaseL: [...pb.inductance],
    phaseZ: [...pb.impedance],
    phaseFi: [...pb.phase_angle],
    phaseIF: [...pb.if_ratio],
    ...(pb.winding_temp_c != null ? { windingTempC: pb.winding_temp_c } : {}),
    ...(pb.rated_hp != null ? { ratedHp: pb.rated_hp } : {}),
    ...(gw.ir_15s != null ? { ir15sMOmega: gw.ir_15s, ir_15s: gw.ir_15s } : {}),
    ...(gw.ir_30s != null ? { ir30sMOmega: gw.ir_30s, ir_30s: gw.ir_30s } : {}),
    ...(gw.ir_1m != null ? { ir1mMOmega: gw.ir_1m, ir_1m: gw.ir_1m } : {}),
    ...(gw.ir_10m != null ? { ir10mMOmega: gw.ir_10m, ir_10m: gw.ir_10m } : {}),
    ...(gw.test_voltage != null ? { testVoltageV: gw.test_voltage } : {}),
    ...(gw.insulation_class ? { insulationClass: gw.insulation_class } : {}),
    ...(gw.pi != null ? { reportPi: gw.pi, pi: gw.pi } : {}),
    ...(gw.dar != null ? { reportDar: gw.dar, dar: gw.dar } : {}),
    ...(record.rotor_influence.series.length > 0
      ? { ricData: record.rotor_influence.series }
      : {}),
    rawText: `[ssot:${record.meta.fileName || "extract"}]`,
    formatDetected:
      (record.meta.formatDetected as McaExtractedData["formatDetected"]) ||
      "VISION_SCREENSHOT",
    confidenceScore: score
  };
}

/** Map vision JSON → SSOT patch → legacy McaExtractedData. */
export function mapVisionJsonToMcaExtracted(
  parsed: Record<string, unknown>,
  fileName: string
): McaExtractedData {
  const ssotPatch = mcaSsotFromVisionJson(parsed, fileName);
  const record = deepMergeMcaSsot(EMPTY_MCA_SSOT, ssotPatch);
  return mcaSsotToExtractedData(record);
}

/**
 * Send PNG/JPEG/WebP analyzer screenshot to the vision proxy and map JSON → MCA fields.
 */
export async function extractMcaDataFromImage(
  imageFile: File
): Promise<McaExtractedData> {
  if (
    !imageFile ||
    !(
      /^image\//i.test(imageFile.type) ||
      /\.(png|jpe?g|webp|gif|bmp)$/i.test(imageFile.name)
    )
  ) {
    throw new Error("Upload a PNG, JPEG, or WebP MCA analyzer screenshot.");
  }

  const base64Image = await fileToBase64(imageFile);
  const startTime = logPipelineStart("mcaVisionExtractor", {
    fileName: imageFile.name,
    size: imageFile.size
  });
  logPayloadSize("mcaVisionExtractor", base64Image);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);

  let response: Response;
  try {
    logPipelineSend("mcaVisionExtractor", {
      endpoint: MCA_VISION_API_PATH,
      models: MCA_VISION_MODELS
    });
    response = await fetch(MCA_VISION_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        purpose: "mca",
        imageBase64: base64Image,
        fileName: imageFile.name,
        model: MCA_VISION_MODELS[0],
        models: [...MCA_VISION_MODELS],
        maxTokens: Math.max(VISION_MODEL_CONFIG.maxTokens, 4500),
        prompt: MCA_VISION_PROMPT
      })
    });
  } catch (err) {
    clearTimeout(timeoutId);
    logPipelineFail("mcaVisionExtractor", startTime, err);
    const aborted =
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError");
    if (aborted) {
      throw new Error(
        "MCA vision extraction timed out. Try a clearer screenshot or a text PDF export."
      );
    }
    throw err;
  }
  clearTimeout(timeoutId);

  let result: Record<string, unknown>;
  try {
    result = (await response.json()) as Record<string, unknown>;
  } catch (parseErr) {
    logPipelineFail("mcaVisionExtractor:json", startTime, parseErr, response);
    throw new Error("MCA vision proxy returned invalid JSON.");
  }

  if (!response.ok) {
    const msg =
      (typeof result.error === "string" && result.error) ||
      (typeof result.message === "string" && result.message) ||
      `MCA vision extraction failed (${response.status}). Check OPENROUTER_API_KEY.`;
    logPipelineFail("mcaVisionExtractor", startTime, new Error(msg), response);
    throw new Error(msg);
  }

  const choices = result.choices;
  const first =
    Array.isArray(choices) && choices[0] && typeof choices[0] === "object"
      ? (choices[0] as { message?: { content?: string } })
      : null;
  const content =
    first?.message?.content ||
    (typeof result.content === "string" ? result.content : null);

  // Already-normalized object from proxy (no chat wrapper)
  if (
    !content &&
    result &&
    typeof result === "object" &&
    (result.phaseR != null ||
      result.phase_r != null ||
      result.ir1mMOmega != null ||
      result.ir_1m != null ||
      result.ir30sMOmega != null ||
      result.ir_30s != null ||
      result.ir10mMOmega != null ||
      result.ir_10m != null ||
      result.pi != null ||
      result.dar != null ||
      result.reportPi != null ||
      result.ricData != null)
  ) {
    const mapped = mapVisionJsonToMcaExtracted(result, imageFile.name);
    logPipelineSuccess("mcaVisionExtractor", startTime, {
      confidence: mapped.confidenceScore
    });
    return mapped;
  }

  if (!content || typeof content !== "string") {
    logPipelineFail(
      "mcaVisionExtractor",
      startTime,
      new Error("Vision model returned no text content.")
    );
    throw new Error(
      "Vision model returned no MCA content. Try a sharper PNG/JPEG of the full report screen."
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJsonObjectText(content)) as Record<
      string,
      unknown
    >;
  } catch (err) {
    logPipelineFail("mcaVisionExtractor:parse", startTime, err);
    throw new Error(
      "Could not parse MCA JSON from the vision model. Try another screenshot angle."
    );
  }

  const mapped = mapVisionJsonToMcaExtracted(parsed, imageFile.name);
  logPipelineSuccess("mcaVisionExtractor", startTime, {
    confidence: mapped.confidenceScore,
    ricPoints: mapped.ricData?.length ?? 0
  });
  return mapped;
}
