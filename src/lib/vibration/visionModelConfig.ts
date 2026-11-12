/**
 * Production vision extraction config — same-origin proxy
 * (POST /api/extract-vibration-image).
 *
 * VS-3 repoint: the legacy vision pipeline no longer depends on OpenRouter
 * credit availability. The primary is Gemini gemini-3.5-flash (probe: 3 peaks
 * extracted in 8.4s inside the cascade); OpenAI gpt-4o-mini is the fast
 * fallback (probe: 1.35s, HTTP 200). Mistral pixtral-12b-2409 stays in the
 * chain because its probe 429/rate-limit is transient capacity, not an auth
 * failure. OpenRouter remains LAST and is never promoted; its production
 * payloads hit HTTP 402 (credits exhausted) even though a minimal probe can
 * return 200.
 */

import { OPENROUTER_VISION_MODEL } from "../openRouterModels";

export type VisionProviderTransport = "gemini" | "openai-compatible";

export interface VisionProviderSpec {
  id: string;
  label: string;
  envKey: string;
  transport: VisionProviderTransport;
  url: string;
  model: string;
}

export const GEMINI_VISION_MODEL = "gemini-3.5-flash";
export const OPENAI_VISION_FALLBACK_MODEL = "gpt-4o-mini";

/**
 * Legacy vision provider chain. Order is probe-verified and strict:
 * Gemini -> Mistral -> OpenAI -> OpenRouter (LAST, never promoted).
 */
export const LEGACY_VISION_CHAIN: readonly VisionProviderSpec[] = [
  {
    id: "gemini",
    label: "Gemini",
    envKey: "GEMINI_API_KEY",
    transport: "gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    model: GEMINI_VISION_MODEL
  },
  {
    id: "mistral",
    label: "Mistral",
    envKey: "MISTRAL_API_KEY",
    transport: "openai-compatible",
    url: "https://api.mistral.ai/v1/chat/completions",
    model: "pixtral-12b-2409"
  },
  {
    id: "openai",
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    transport: "openai-compatible",
    url: "https://api.openai.com/v1/chat/completions",
    model: OPENAI_VISION_FALLBACK_MODEL
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    transport: "openai-compatible",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: OPENROUTER_VISION_MODEL
  }
];

/**
 * Resolve the serving order for the legacy vision route. A caller may name a
 * subset of models, but OpenRouter can never move ahead of the free-tier
 * providers; an all-OpenRouter request falls back to the canonical chain.
 */
export function resolveLegacyVisionChain(
  requestedModels: readonly string[] = []
): VisionProviderSpec[] {
  const requested = new Set(
    requestedModels
      .map((model) => model.trim().toLowerCase())
      .filter((model) => model.length > 0)
  );
  if (requested.size === 0) return [...LEGACY_VISION_CHAIN];

  const selected = LEGACY_VISION_CHAIN.filter(
    (spec) =>
      spec.id !== "openrouter" && requested.has(spec.model.toLowerCase())
  );
  const openRouterLast = LEGACY_VISION_CHAIN.filter(
    (spec) => spec.id === "openrouter"
  );
  return selected.length > 0
    ? [...selected, ...openRouterLast]
    : [...LEGACY_VISION_CHAIN];
}

export const VISION_MODEL_CONFIG = {
  /** Same-origin proxy; server dispatches the provider chain below. */
  endpoint: "/api/extract-vibration-image",
  /** Primary model — Gemini gemini-3.5-flash (probe-verified vision). */
  model: GEMINI_VISION_MODEL,
  /** Fast fallback — OpenAI gpt-4o-mini (probe: 1.35s, HTTP 200). */
  fallbackModel: OPENAI_VISION_FALLBACK_MODEL,
  /** Higher budget so vision models can return 10–20+ spectral peaks. */
  maxTokens: 4000,
  /** Lighter budget for timeout-retry "simple" extraction (top 3 peaks). */
  maxTokensSimple: 1200,
  /** Canonical provider order (OpenRouter LAST). */
  chain: LEGACY_VISION_CHAIN
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

/**
 * SLICE-VS2 — factual timeout copy. A deadline expiry says nothing about the
 * image; it says the upstream did not answer in time. Dynamic callers append
 * the observed seconds via buildClientDeadlineMessage().
 */
export const SPECTRAL_EXTRACTION_TIMEOUT_MSG =
  "Upstream did not respond within the client deadline. No extraction result was received — retry, or check the server logs for the provider that stalled.";

