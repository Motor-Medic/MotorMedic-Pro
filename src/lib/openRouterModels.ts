/**
 * Production AI model routing via OpenRouter.
 * Vision: GPT-4o · Consensus validation: Qwen 2.5 VL 72B
 *
 * LM Studio (localhost:1234) is dev-only — set USE_LM_STUDIO=true explicitly.
 */

export const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

function envStr(key: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const v = process.env[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** GPT-4o vision — FFT spectrum image extraction (Stage 1 / extract-vibration-image). */
export const OPENROUTER_VISION_MODEL =
  envStr("OPENROUTER_VISION_MODEL") || "openai/gpt-4o";

export const OPENROUTER_VISION_FALLBACK_MODEL =
  envStr("OPENROUTER_VISION_FALLBACK_MODEL") || "openai/gpt-4-turbo";

/** Qwen VL — multi-agent consensus validation (Stage 2b ISO + Stage 3 referee). */
export const OPENROUTER_CONSENSUS_MODEL =
  envStr("OPENROUTER_CONSENSUS_MODEL") || "qwen/qwen-2.5-vl-72b-instruct";

export const OPENROUTER_VISION_MODELS = [
  OPENROUTER_VISION_MODEL,
  OPENROUTER_VISION_FALLBACK_MODEL
] as const;

export function openRouterRefererHeaders(): Record<string, string> {
  return {
    "HTTP-Referer": envStr("APP_URL") || "http://localhost:3000",
    "X-Title": "Spectra CM"
  };
}

export function isLmStudioDevMode(): boolean {
  return envStr("USE_LM_STUDIO") === "true" && Boolean(envStr("LM_STUDIO_ENDPOINT"));
}

export function hasOpenRouterKey(): boolean {
  return Boolean(envStr("OPENROUTER_API_KEY"));
}
