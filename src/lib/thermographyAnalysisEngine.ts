/**
 * Server-only Thermography AI engine — SLICE-THERMO-RAD visual-reference-match
 * model repoint.
 *
 * Import from Express / Node API routes only — not from React client code.
 *
 * Chain (boot-health VALID providers, probe-verified ids reused from the
 * consensus cascade / master-vision chains):
 *   1. Gemini  gemini-3.5-flash   (fast primary — gpt-4o was the slow one)
 *   2. Mistral pixtral-12b-2409
 *   3. OpenAI  gpt-4o-mini
 *   4. OpenAI  gpt-4o             (legacy fallback, LAST — slow)
 *
 * The numeric-extraction path (master-vision OCR chain in
 * oilVisionExtractor.ts / VISION_PROVIDER_CHAIN) is deliberately UNCHANGED.
 */

import {
  THERMOGRAPHY_MASTER_PROMPT,
  buildThermographyUserPrompt,
  normalizeThermographyResult,
  type AnalyzeThermographyOutcome,
  type AnalyzeThermographyRequest
} from "./thermographyAnalysis";

export interface ThermographyVisionChainEntry {
  id: string;
  label: string;
  envKey: string;
  transport: "gemini" | "openai-compatible";
  url: string;
  model: string;
}

/** Fast-first vision chain for /api/analyze-thermography. */
export const THERMOGRAPHY_ANALYSIS_VISION_CHAIN: readonly ThermographyVisionChainEntry[] = [
  {
    id: "gemini",
    label: "Gemini",
    envKey: "GEMINI_API_KEY",
    transport: "gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    model: "gemini-3.5-flash"
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
    model: "gpt-4o-mini"
  },
  {
    id: "openai-legacy",
    label: "OpenAI (legacy)",
    envKey: "OPENAI_API_KEY",
    transport: "openai-compatible",
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o"
  }
];

const ANALYSIS_TIMEOUT_MS = 120_000;

function stripDataUrl(imageBase64: string): { data: string; mimeType: string } {
  const trimmed = imageBase64.trim();
  const mimeMatch = /^data:(image\/[\w+.-]+);base64,/i.exec(trimmed);
  const mimeType = mimeMatch?.[1] || "image/png";
  const data = trimmed.replace(/^data:image\/[\w+.-]+;base64,/i, "");
  return { data, mimeType };
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
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

interface ChainCallResult {
  contentText: string;
  httpStatus: number;
}

async function callChainEntry(
  entry: ThermographyVisionChainEntry,
  dataUrl: string,
  userText: string
): Promise<ChainCallResult> {
  const { data, mimeType } = stripDataUrl(dataUrl);
  const apiKey = (process.env[entry.envKey] || "").trim();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);
  try {
    if (entry.transport === "gemini") {
      const res = await fetch(`${entry.url}/${entry.model}:generateContent`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: THERMOGRAPHY_MASTER_PROMPT }] },
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mimeType, data } },
                { text: userText }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        })
      });
      const body = (await res.json().catch(() => ({}))) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text =
        body.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      if (!res.ok) {
        throw new Error(`${entry.label} ${entry.model} HTTP ${res.status}`);
      }
      return { contentText: text, httpStatus: res.status };
    }

    const res = await fetch(entry.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: entry.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: THERMOGRAPHY_MASTER_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: dataUrl } }
            ]
          }
        ]
      })
    });
    const body = (await res.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    if (!res.ok) {
      throw new Error(`${entry.label} ${entry.model} HTTP ${res.status}`);
    }
    return {
      contentText: body.choices?.[0]?.message?.content || "",
      httpStatus: res.status
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Server-side vision analysis across the fast-first provider chain.
 * Called from Express POST /api/analyze-thermography.
 */
export async function runThermographyAnalysis(
  body: AnalyzeThermographyRequest
): Promise<AnalyzeThermographyOutcome> {
  const imageBase64 = body.imageBase64;
  if (!imageBase64 || typeof imageBase64 !== "string") {
    return {
      success: false,
      errorType: "MISSING_IMAGE",
      title: "Thermal Image Required",
      message: "imageBase64 is required in the request payload.",
      httpStatus: 400
    };
  }

  // Key gating: entries whose env key is absent are skipped cleanly.
  const candidates = THERMOGRAPHY_ANALYSIS_VISION_CHAIN.filter(
    (entry) => (process.env[entry.envKey] || "").trim().length > 0
  );
  if (candidates.length === 0) {
    console.error(
      "[analyze-thermography] No vision provider key (GEMINI_API_KEY / MISTRAL_API_KEY / OPENAI_API_KEY) configured in .env"
    );
    return {
      success: false,
      errorType: "MISSING_API_KEY",
      title: "Thermography AI Unavailable",
      message: "No vision provider key is configured in .env (Gemini / Mistral / OpenAI).",
      httpStatus: 400
    };
  }

  const dataUrl = body.imageBase64;
  const userText = buildThermographyUserPrompt(body.metadata || {});

  let lastError: unknown;
  for (const entry of candidates) {
    try {
      const { contentText } = await callChainEntry(entry, dataUrl, userText);

      if (!contentText.trim()) {
        lastError = new Error(`Empty response from ${entry.label} (${entry.model}).`);
        console.warn(`[analyze-thermography] ${entry.label} ${entry.model} returned empty content.`);
        continue;
      }

      try {
        const parsed = extractJsonObject(contentText);
        const dataNormalized = normalizeThermographyResult(parsed);
        console.log("[analyze-thermography] Analysis complete:", {
          model: `${entry.label} ${entry.model}`,
          health: dataNormalized.health_score,
          primary: dataNormalized.primary_fault,
          faults: dataNormalized.fault_list.length,
          delta_t: dataNormalized.peaks.delta_t,
          severity_class: dataNormalized.detailed?.severity_class,
          confidence: dataNormalized.detailed?.confidence_score,
          radiometric: dataNormalized.detailed?.radiometric ?? null
        });
        return { success: true, data: dataNormalized };
      } catch (parseErr) {
        return {
          success: false,
          errorType: "PARSE_ERROR",
          title: "Thermography Parse Error",
          message: "Failed to parse AI JSON response.",
          httpStatus: 502,
          detail:
            parseErr instanceof Error ? parseErr.message : "Unknown parse error"
        };
      }
    } catch (err) {
      lastError = err;
      console.warn(
        `[analyze-thermography] ${entry.label} ${entry.model} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.error("[analyze-thermography] All vision chain entries failed:", lastError);
  return {
    success: false,
    errorType: "VISION_ERROR",
    title: "Thermography Vision Error",
    message: "Unable to analyze thermal image with the configured vision providers.",
    httpStatus: 503,
    detail: lastError instanceof Error ? lastError.message : "Unknown error"
  };
}
