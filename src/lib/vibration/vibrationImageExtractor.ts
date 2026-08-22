/**
 * Extract numerical vibration metrics from analyzer screenshot images via vision LLM.
 */

import {
  SPECTRAL_EXTRACTION_FAILED_MSG,
  SPECTRAL_EXTRACTION_TIMEOUT_MSG,
  VISION_MODEL_CONFIG,
  VIBRATION_VISION_PROMPT,
  VIBRATION_VISION_PROMPT_SIMPLE,
  type VibrationExtractionMode
} from "./visionModelConfig";
import {
  logPayloadSize,
  logPipelineFail,
  logPipelineSend,
  logPipelineStart,
  logPipelineSuccess
} from "../pipelineTrace";

export type { VibrationExtractionMode };

const EXTRACTION_TIMEOUT_MS = 60_000;

export interface ExtractedVibrationData {
  overallVelocity?: number;
  overallAcceleration?: number;
  rpm?: number;
  spectralPeaks: Array<{
    frequency: number;
    amplitude: number;
    order?: number;
  }>;
  envelopingPeaks?: Array<{
    frequency: number;
    amplitude: number;
    label?: string;
  }>;
  bearingFrequencies?: {
    bpfo?: number;
    bpfi?: number;
    bsf?: number;
    ftf?: number;
  };
  waveformMetrics?: {
    peakAmplitude: number;
    crestFactor: number;
    rmsValue: number;
  };
  /** Optional time-domain samples when the vision model can read them. */
  waveformSamples?: Array<{ time: number; amplitude: number }>;
  sourceImage: string;
  extractionConfidence: number;
}

const extractionCache = new Map<string, ExtractedVibrationData>();

function cacheKey(file: File, mode: VibrationExtractionMode = "full"): string {
  return `${file.name}::${file.size}::${file.lastModified}::${mode}`;
}

export function clearVibrationExtractionCache(): void {
  extractionCache.clear();
}

export function getCachedVibrationExtraction(
  file: File,
  mode: VibrationExtractionMode = "full"
): ExtractedVibrationData | null {
  return (
    extractionCache.get(cacheKey(file, mode)) ||
    (mode === "simple" ? extractionCache.get(cacheKey(file, "full")) : null) ||
    null
  );
}

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
    throw new Error("Missing spectral data");
  }
  return cleaned.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(new Error("Failed to read image file as base64."));
    reader.readAsDataURL(file);
  });
}

function finiteNum(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function calculateExtractionConfidence(data: {
  overallVelocity?: number;
  spectralPeaks?: unknown[];
  rpm?: number;
  bearingFrequencies?: unknown;
  waveformMetrics?: unknown;
  envelopingPeaks?: unknown[];
}): number {
  let score = 0;
  if (data.overallVelocity != null && Number.isFinite(data.overallVelocity)) {
    score += 25;
  }
  if (Array.isArray(data.spectralPeaks) && data.spectralPeaks.length > 0) {
    score += 40;
    if (data.spectralPeaks.length >= 10) score += 10;
  }
  if (data.rpm != null && Number.isFinite(data.rpm)) score += 10;
  if (data.bearingFrequencies && typeof data.bearingFrequencies === "object") {
    score += 10;
  }
  if (Array.isArray(data.envelopingPeaks) && data.envelopingPeaks.length > 0) {
    score += 5;
  }
  if (data.waveformMetrics) score += 5;
  return Math.max(0, Math.min(100, score));
}

/**
 * Normalize spectral peaks from varied vision-model / OCR shapes.
 */
export function normalizeSpectralData(
  rawData: unknown
): Array<{ frequency: number; amplitude: number; order?: number }> {
  if (!rawData) return [];

  if (typeof rawData === "string") {
    try {
      const parsed = JSON.parse(rawData);
      return normalizeSpectralData(parsed);
    } catch {
      console.error("📊 Failed to parse spectral data string");
      return [];
    }
  }

  // Nested { spectral: [...] } or { peaks: [...] }
  if (rawData && typeof rawData === "object" && !Array.isArray(rawData)) {
    const o = rawData as Record<string, unknown>;
    if (Array.isArray(o.spectral)) return normalizeSpectralData(o.spectral);
    if (Array.isArray(o.spectralPeaks))
      return normalizeSpectralData(o.spectralPeaks);
    if (Array.isArray(o.peaks)) return normalizeSpectralData(o.peaks);
    if (Array.isArray(o.spectral_peaks))
      return normalizeSpectralData(o.spectral_peaks);
    return [];
  }

  if (!Array.isArray(rawData)) return [];

  const out: Array<{ frequency: number; amplitude: number; order?: number }> =
    [];
  for (const peak of rawData) {
    if (!peak || typeof peak !== "object") continue;
    const row = peak as Record<string, unknown>;
    const frequency =
      finiteNum(row.frequency) ??
      finiteNum(row.freq) ??
      finiteNum(row.hz) ??
      finiteNum(row.Frequency) ??
      finiteNum(row.x);
    const amplitude =
      finiteNum(row.amplitude) ??
      finiteNum(row.amp) ??
      finiteNum(row.magnitude) ??
      finiteNum(row.Amplitude) ??
      finiteNum(row.y);
    if (frequency == null || amplitude == null) continue;
    if (frequency < 0 || amplitude < 0) continue;
    const harmonicRaw = row.harmonicOrder ?? row.harmonic_order ?? row.order ?? row.Order;
    let order = finiteNum(harmonicRaw);
    if (order == null && typeof harmonicRaw === "string") {
      const m = /(\d+)\s*x/i.exec(harmonicRaw);
      if (m) order = Number(m[1]);
    }
    out.push({
      frequency,
      amplitude,
      ...(order != null ? { order } : {})
    });
  }
  return out.sort((a, b) => a.frequency - b.frequency);
}

function normalizeEnvelopingData(
  rawData: unknown
): ExtractedVibrationData["envelopingPeaks"] {
  const peaks = normalizeSpectralData(rawData);
  if (!peaks.length) return undefined;
  return peaks.map((p) => ({
    frequency: p.frequency,
    amplitude: p.amplitude
  }));
}

/**
 * Parse vision-model text into ExtractedVibrationData.
 * Accepts both legacy flat keys and the nested broadband/spectral schema.
 */
export function parseVisionModelResponse(
  content: string,
  sourceImage = "unknown"
): ExtractedVibrationData {
  console.log("🤖 [VIBRATION] Vision model response received. Raw:", content);

  let parsed: Record<string, unknown>;
  try {
    const cleanJson = extractJsonObjectText(content);
    parsed = JSON.parse(cleanJson) as Record<string, unknown>;
  } catch (error) {
    console.error("❌ [VIBRATION] Extraction failed or missing peaks:", error);
    throw new Error(SPECTRAL_EXTRACTION_FAILED_MSG);
  }

  const broadband =
    parsed.broadband && typeof parsed.broadband === "object"
      ? (parsed.broadband as Record<string, unknown>)
      : null;

  const spectralPeaks = normalizeSpectralData(
    parsed.spectral ??
      parsed.spectralPeaks ??
      parsed.peaks ??
      parsed.spectral_peaks
  );

  const envelopingPeaks = normalizeEnvelopingData(
    parsed.enveloping ?? parsed.envelopingPeaks ?? parsed.envelope
  );

  const bfRaw =
    parsed.bearingFrequencies ??
    parsed.bearing_frequencies ??
    parsed.bearingFaults;
  let bearingFrequencies: ExtractedVibrationData["bearingFrequencies"];
  if (bfRaw && typeof bfRaw === "object" && !Array.isArray(bfRaw)) {
    const b = bfRaw as Record<string, unknown>;
    bearingFrequencies = {
      bpfo: finiteNum(b.bpfo ?? b.BPFO),
      bpfi: finiteNum(b.bpfi ?? b.BPFI),
      bsf: finiteNum(b.bsf ?? b.BSF),
      ftf: finiteNum(b.ftf ?? b.FTF)
    };
  }

  const wmRaw =
    parsed.waveformMetrics ??
    parsed.waveform_metrics ??
    (parsed.waveform &&
    typeof parsed.waveform === "object" &&
    !Array.isArray(parsed.waveform)
      ? parsed.waveform
      : null);
  let waveformMetrics: ExtractedVibrationData["waveformMetrics"];
  if (wmRaw && typeof wmRaw === "object" && !Array.isArray(wmRaw)) {
    const w = wmRaw as Record<string, unknown>;
    const peakAmplitude = finiteNum(
      w.peakAmplitude ?? w.peak ?? w.peak_amplitude
    );
    const crestFactor = finiteNum(w.crestFactor ?? w.crest_factor ?? w.crest);
    const rmsValue = finiteNum(w.rmsValue ?? w.rms ?? w.rms_value);
    if (peakAmplitude != null && crestFactor != null && rmsValue != null) {
      waveformMetrics = { peakAmplitude, crestFactor, rmsValue };
    }
  }

  let waveformSamples: ExtractedVibrationData["waveformSamples"];
  const samplesRaw =
    parsed.waveformSamples ??
    parsed.waveform_samples ??
    parsed.timeWaveform ??
    (Array.isArray(parsed.waveform) ? parsed.waveform : null);
  if (Array.isArray(samplesRaw)) {
    waveformSamples = [];
    for (const s of samplesRaw) {
      if (!s || typeof s !== "object") continue;
      const row = s as Record<string, unknown>;
      const time = finiteNum(row.time ?? row.t ?? row.ms);
      const amplitude = finiteNum(row.amplitude ?? row.amp ?? row.y);
      if (time != null && amplitude != null) {
        waveformSamples.push({ time, amplitude });
      }
    }
    if (waveformSamples.length === 0) waveformSamples = undefined;
  }

  const base = {
    overallVelocity: finiteNum(
      parsed.overallVelocity ??
        broadband?.velocity ??
        broadband?.overallVelocity ??
        parsed.overall_velocity ??
        parsed.velocityRms ??
        parsed.velocity
    ),
    overallAcceleration: finiteNum(
      broadband?.acceleration ??
        broadband?.overallAcceleration ??
        parsed.overallAcceleration ??
        parsed.overall_acceleration ??
        parsed.accelerationPeak ??
        parsed.acceleration
    ),
    rpm: finiteNum(
      broadband?.rpm ?? parsed.rpm ?? parsed.RPM ?? parsed.speedRpm
    ),
    spectralPeaks,
    ...(envelopingPeaks ? { envelopingPeaks } : {}),
    ...(bearingFrequencies ? { bearingFrequencies } : {}),
    ...(waveformMetrics ? { waveformMetrics } : {}),
    ...(waveformSamples ? { waveformSamples } : {})
  };

  const extracted: ExtractedVibrationData = {
    ...base,
    sourceImage,
    extractionConfidence: calculateExtractionConfidence(base)
  };

  if (!extracted.spectralPeaks.length) {
    console.error("❌ [VIBRATION] Extraction failed or missing peaks:", {
      hasSpectral: false,
      spectralCount: 0,
      hasBroadband: extracted.overallVelocity != null
    });
    throw new Error(SPECTRAL_EXTRACTION_FAILED_MSG);
  }

  console.log("✅ [VIBRATION] Extraction complete:", {
    hasSpectral: !!extracted.spectralPeaks,
    spectralCount: extracted.spectralPeaks.length,
    hasBroadband: extracted.overallVelocity != null,
    firstFewPeaks: extracted.spectralPeaks.slice(0, 3)
  });

  return extracted;
}

/**
 * Extract vibration numerics from an analyzer screenshot (FFT / waveform / envelope).
 * Uses an in-memory cache keyed by file identity + extraction mode.
 * `mode: "simple"` asks only for the top 3 peaks (faster timeout retry).
 */
export async function extractVibrationDataFromImage(
  imageFile: File,
  visionModelEndpoint: string = VISION_MODEL_CONFIG.endpoint,
  mode: VibrationExtractionMode = "full"
): Promise<ExtractedVibrationData> {
  if (!imageFile || !/^image\//i.test(imageFile.type)) {
    throw new Error("Please upload a PNG, JPG, or WebP vibration chart image.");
  }

  console.log("📸 [VIBRATION] Starting image extraction:", {
    filename: imageFile.name,
    size: `${(imageFile.size / 1024).toFixed(1)} KB`,
    type: imageFile.type,
    mode
  });

  const key = cacheKey(imageFile, mode);
  const cached = getCachedVibrationExtraction(imageFile, mode);
  if (cached?.spectralPeaks?.length) {
    console.log("📥 [VIBRATION] Extraction cache hit:", {
      filename: imageFile.name,
      spectralCount: cached.spectralPeaks.length,
      mode
    });
    return cached;
  }

  const base64Image = await fileToBase64(imageFile);
  const isSimple = mode === "simple";
  const extractionPrompt = isSimple
    ? VIBRATION_VISION_PROMPT_SIMPLE
    : VIBRATION_VISION_PROMPT;
  const maxTokens = isSimple
    ? VISION_MODEL_CONFIG.maxTokensSimple
    : VISION_MODEL_CONFIG.maxTokens;

  console.log("🤖 [VIBRATION] Sending to Vision Model with prompt:", {
    mode,
    promptChars: extractionPrompt.length
  });

  // Same-origin proxy expects a slim body; OpenRouter uses OpenAI chat format on server.
  const isProxy = visionModelEndpoint.includes("/api/extract-vibration-image");
  const startTime = logPipelineStart("vibrationImageExtractor", { mode, isProxy });
  logPayloadSize("vibrationImageExtractor", base64Image);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(
      `❌ [PIPELINE] vibrationImageExtractor AbortController firing after ${EXTRACTION_TIMEOUT_MS}ms`
    );
    controller.abort();
  }, EXTRACTION_TIMEOUT_MS);

  let response: Response;
  try {
    logPipelineSend("vibrationImageExtractor", { endpoint: visionModelEndpoint });
    response = await fetch(visionModelEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(
        isProxy
          ? {
              imageBase64: base64Image,
              fileName: imageFile.name,
              model: VISION_MODEL_CONFIG.model,
              maxTokens,
              prompt: extractionPrompt,
              mode
            }
          : {
              model: VISION_MODEL_CONFIG.model,
              max_tokens: maxTokens,
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "image_url", image_url: { url: base64Image } },
                    { type: "text", text: extractionPrompt }
                  ]
                }
              ]
            }
      )
    });
  } catch (err) {
    clearTimeout(timeoutId);
    logPipelineFail("vibrationImageExtractor", startTime, err);
    const aborted =
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError");
    if (aborted) {
      throw new Error(SPECTRAL_EXTRACTION_TIMEOUT_MSG);
    }
    throw err;
  }
  clearTimeout(timeoutId);

  let result: Record<string, unknown>;
  try {
    result = (await response.json()) as Record<string, unknown>;
  } catch (parseErr) {
    logPipelineFail("vibrationImageExtractor:json", startTime, parseErr, response);
    throw parseErr;
  }

  if (!response.ok) {
    const msg =
      (typeof result.error === "string" && result.error) ||
      (typeof result.message === "string" && result.message) ||
      `Vision extraction failed (${response.status}). Check OPENROUTER_API_KEY and server logs.`;
    logPipelineFail("vibrationImageExtractor", startTime, new Error(msg), response);
    console.error("❌ [VIBRATION] Vision model request failed:", msg);
    throw new Error(msg);
  }

  // Proxy may return already-normalized payload
  if (
    result &&
    typeof result === "object" &&
    (result.spectralPeaks != null ||
      result.spectral != null ||
      result.extractionConfidence != null) &&
    !result.choices
  ) {
    console.log("🤖 [VIBRATION] Vision model response received. Raw:", result);
    const normalized = {
      ...parseVisionModelResponse(JSON.stringify(result), imageFile.name),
      sourceImage: imageFile.name
    };
    extractionCache.set(key, normalized);
    logPipelineSuccess("vibrationImageExtractor", startTime, {
      peakCount: normalized.spectralPeaks.length
    });
    return normalized;
  }

  const choices = result.choices;
  const first =
    Array.isArray(choices) && choices[0] && typeof choices[0] === "object"
      ? (choices[0] as { message?: { content?: string } })
      : null;
  const content =
    first?.message?.content ||
    (typeof result.content === "string" ? result.content : null);

  if (!content || typeof content !== "string") {
    console.error("❌ [VIBRATION] Extraction failed or missing peaks:", {
      reason: "Vision model returned no text content"
    });
    logPipelineFail(
      "vibrationImageExtractor",
      startTime,
      new Error(SPECTRAL_EXTRACTION_FAILED_MSG),
      response
    );
    throw new Error(SPECTRAL_EXTRACTION_FAILED_MSG);
  }

  try {
    const extracted = parseVisionModelResponse(content, imageFile.name);
    extractionCache.set(key, extracted);
    logPipelineSuccess("vibrationImageExtractor", startTime, {
      peakCount: extracted.spectralPeaks.length
    });
    return extracted;
  } catch (parseErr) {
    logPipelineFail("vibrationImageExtractor:json", startTime, parseErr, response);
    throw parseErr;
  }
}

export { SPECTRAL_EXTRACTION_FAILED_MSG };
