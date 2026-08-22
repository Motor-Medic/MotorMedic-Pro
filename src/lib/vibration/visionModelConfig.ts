/**
 * Production vision extraction config — OpenRouter GPT-4o via same-origin proxy.
 * POST /api/extract-vibration-image → OpenRouter (server-side, no CORS).
 */

import {
  OPENROUTER_VISION_FALLBACK_MODEL,
  OPENROUTER_VISION_MODEL
} from "../openRouterModels";

export const VISION_MODEL_CONFIG = {
  /** Same-origin proxy; server forwards to OpenRouter with OPENROUTER_API_KEY. */
  endpoint: "/api/extract-vibration-image",
  /** OpenRouter slug — GPT-4o for FFT spectrum vision extraction. */
  model: OPENROUTER_VISION_MODEL,
  fallbackModel: OPENROUTER_VISION_FALLBACK_MODEL,
  /** Higher budget so vision models can return 10–20+ spectral peaks. */
  maxTokens: 4000,
  /** Lighter budget for timeout-retry "simple" extraction (top 3 peaks). */
  maxTokensSimple: 1200
} as const;

export type VibrationExtractionMode = "full" | "simple";

export const EXPERT_VISION_PROMPT = `
You are a Level III Vibration Analyst with 20+ years of experience. Analyze this vibration spectrum image with extreme precision.

CRITICAL EXTRACTION RULES:
1. READ THE RPM FIRST: Look for "RPM" or "Running Speed" on the chart. This is CRITICAL for all calculations.
2. IDENTIFY CHART TYPE: Is this FFT (frequency domain), Envelope/Demod (bearing faults), or Time Waveform?
3. READ AXIS UNITS: X-axis is Hz or CPM? Y-axis is mm/s, in/s, g, or mils?
4. EXTRACT PEAKS: For each visible peak, note:
   - Exact frequency (Hz)
   - Exact amplitude (in the units shown)
   - Is it at 1X, 2X, 3X, or a bearing frequency?

REQUIRED JSON OUTPUT:
{
  "chartType": "FFT" | "Envelope" | "TimeWaveform",
  "rpm": <number - read from image, NOT from database>,
  "xAxisUnit": "Hz" | "CPM",
  "yAxisUnit": "mm/s" | "in/s" | "g" | "mils",
  "overallVelocity": <number in mm/s if visible>,
  "peaks": [
    {
      "frequency": <Hz>,
      "amplitude": <value>,
      "harmonicOrder": <1X, 2X, 3X, or "bearing">,
      "description": "1X running speed" | "2X misalignment" | "BPFO" | etc.
    }
  ]
}

PEAK IDENTIFICATION LOGIC:
- 1X peak = RPM/60 Hz (e.g., 1780 RPM = 29.67 Hz)
- If RPM is 1180, then 1X = 19.67 Hz, NOT 1180 Hz!
- High-frequency peaks (>1000 Hz) = bearing defects
- If X-axis is CPM, convert peak frequencies to Hz (divide by 60) before returning

Return ONLY valid JSON. No markdown. No explanations.
`.trim();

/** Alias used by vibrationImageExtractor and consensus Stage 1. */
export const VIBRATION_VISION_PROMPT = EXPERT_VISION_PROMPT;

/** Faster timeout-retry prompt — top 3 peaks only, same expert rules. */
export const VIBRATION_VISION_PROMPT_SIMPLE = `
You are a Level III Vibration Analyst with 20+ years of experience. Analyze this vibration spectrum image with extreme precision.

CRITICAL EXTRACTION RULES:
1. READ THE RPM FIRST from the chart image (NOT from any database or user context).
2. IDENTIFY CHART TYPE: FFT, Envelope/Demod, or Time Waveform.
3. READ AXIS UNITS: X-axis Hz or CPM; Y-axis mm/s, in/s, g, or mils.
4. Extract ONLY the top 3 highest-amplitude peaks.

REQUIRED JSON OUTPUT:
{
  "chartType": "FFT" | "Envelope" | "TimeWaveform",
  "rpm": <number from image>,
  "xAxisUnit": "Hz" | "CPM",
  "yAxisUnit": "mm/s" | "in/s" | "g" | "mils",
  "overallVelocity": <number in mm/s if visible>,
  "peaks": [
    {
      "frequency": <Hz>,
      "amplitude": <value>,
      "harmonicOrder": <1X, 2X, 3X, or "bearing">,
      "description": string
    }
  ]
}

PEAK IDENTIFICATION LOGIC:
- 1X = RPM/60 Hz (1180 RPM → 19.67 Hz, NOT 1180 Hz)
- Convert CPM to Hz before returning frequencies

Return ONLY valid JSON. No markdown. No explanations.
`.trim();

export const SPECTRAL_EXTRACTION_FAILED_MSG =
  "Could not extract FFT peaks from this image. Please ensure the image contains a clear FFT spectrum with visible peaks.";

export const SPECTRAL_EXTRACTION_TIMEOUT_MSG =
  "AI analysis timed out. The spectrum image may be too complex. Please try a clearer image.";

