/**
 * VS-3 — provider dispatch for the legacy vision route
 * (POST /api/extract-vibration-image).
 *
 * The route used to forward every request to OpenRouter GPT-4o. This module
 * executes the probe-verified chain from visionModelConfig.ts instead:
 * Gemini -> Mistral -> OpenAI -> OpenRouter (LAST). No new keys are required;
 * a provider without its env key is simply skipped by the caller.
 */

import { openRouterRefererHeaders } from "../openRouterModels";
import type { VisionProviderSpec } from "./visionModelConfig";

export interface LegacyVisionDispatchInput {
  imageBase64: string;
  prompt: string;
  maxTokens: number;
  timeoutMs?: number;
  /** Test seam — production uses global fetch. */
  fetchImpl?: typeof fetch;
}

export interface LegacyVisionDispatchResult {
  ok: boolean;
  providerId: string;
  providerLabel: string;
  model: string;
  httpStatus: number | null;
  content: string | null;
  upstreamJson: Record<string, unknown>;
  error: string | null;
}

interface SplitImage {
  base64: string;
  mimeType: string;
  dataUrl: string;
}

function splitImage(imageBase64: string): SplitImage {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(imageBase64);
  if (match) {
    return {
      mimeType: match[1],
      base64: match[2],
      dataUrl: imageBase64
    };
  }
  return {
    mimeType: "image/png",
    base64: imageBase64,
    dataUrl: `data:image/png;base64,${imageBase64}`
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function apiErrorMessage(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "empty error body";
  const parsed = parseJson(trimmed);
  const error = parsed.error;
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }
  if (typeof error === "string") return error;
  if (typeof parsed.message === "string") return parsed.message;
  return trimmed.slice(0, 200);
}

function extractGeminiText(json: Record<string, unknown>): string | null {
  const candidates = json.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const first = candidates[0];
  if (!isRecord(first)) return null;
  const content = first.content;
  if (!isRecord(content)) return null;
  const parts = content.parts;
  if (!Array.isArray(parts)) return null;
  const texts = parts
    .map((part) =>
      isRecord(part) && typeof part.text === "string" ? part.text : ""
    )
    .filter((text) => text.length > 0);
  return texts.length > 0 ? texts.join("\n") : null;
}

function extractOpenAiText(json: Record<string, unknown>): string | null {
  const choices = json.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (!isRecord(first)) return null;
  const message = first.message;
  if (!isRecord(message)) return null;
  const content = message.content;
  return typeof content === "string" && content.trim() ? content : null;
}

function buildRequest(
  spec: VisionProviderSpec,
  input: LegacyVisionDispatchInput,
  apiKey: string
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  const image = splitImage(input.imageBase64);

  if (spec.transport === "gemini") {
    return {
      url: `${spec.url}/${spec.model}:generateContent`,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: {
        contents: [
          {
            role: "user",
            parts: [
              {
                inline_data: {
                  mime_type: image.mimeType,
                  data: image.base64
                }
              },
              { text: input.prompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: input.maxTokens
        }
      }
    };
  }

  return {
    url: spec.url,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(spec.id === "openrouter" ? openRouterRefererHeaders() : {})
    },
    body: {
      model: spec.model,
      max_tokens: input.maxTokens,
      temperature: 0.15,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: image.dataUrl, detail: "high" }
            },
            { type: "text", text: input.prompt }
          ]
        }
      ]
    }
  };
}

export async function callLegacyVisionProvider(
  spec: VisionProviderSpec,
  input: LegacyVisionDispatchInput
): Promise<LegacyVisionDispatchResult> {
  const apiKey = process.env[spec.envKey]?.trim() || "";
  const base = {
    providerId: spec.id,
    providerLabel: spec.label,
    model: spec.model
  };

  if (!apiKey) {
    return {
      ...base,
      ok: false,
      httpStatus: null,
      content: null,
      upstreamJson: {},
      error: `${spec.envKey} missing`
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const request = buildRequest(spec, input, apiKey);

  try {
    const response = await fetchImpl(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal
    });
    const bodyText = await response.text();
    const upstreamJson = parseJson(bodyText);

    if (!response.ok) {
      return {
        ...base,
        ok: false,
        httpStatus: response.status,
        content: null,
        upstreamJson,
        error: apiErrorMessage(bodyText)
      };
    }

    const content =
      spec.transport === "gemini"
        ? extractGeminiText(upstreamJson)
        : extractOpenAiText(upstreamJson);

    if (!content) {
      return {
        ...base,
        ok: false,
        httpStatus: response.status,
        content: null,
        upstreamJson,
        error: "empty content"
      };
    }

    return {
      ...base,
      ok: true,
      httpStatus: response.status,
      content,
      upstreamJson,
      error: null
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut =
      err instanceof Error &&
      (err.name === "AbortError" || /abort/i.test(err.message));
    return {
      ...base,
      ok: false,
      httpStatus: null,
      content: null,
      upstreamJson: {},
      error: timedOut ? `timed out after ${timeoutMs}ms` : message
    };
  } finally {
    clearTimeout(timer);
  }
}
