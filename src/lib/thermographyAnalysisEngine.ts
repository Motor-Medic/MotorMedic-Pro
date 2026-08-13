/**
 * Server-only Thermography AI engine (OpenAI Vision).
 * Import from Express / Node API routes only — not from React client code.
 */

import OpenAI from "openai";
import {
  THERMOGRAPHY_MASTER_PROMPT,
  buildThermographyUserPrompt,
  normalizeThermographyResult,
  type AnalyzeThermographyOutcome,
  type AnalyzeThermographyRequest
} from "./thermographyAnalysis";

const OPENAI_VISION_MODELS = ["gpt-4o", "gpt-4-turbo"] as const;

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

/**
 * Server-side OpenAI Vision analysis.
 * Called from Express POST /api/analyze-thermography.
 */
export async function runThermographyAnalysis(
  body: AnalyzeThermographyRequest
): Promise<AnalyzeThermographyOutcome> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      "[analyze-thermography] OPENAI_API_KEY missing. Add the key to .env and restart the server."
    );
    return {
      success: false,
      errorType: "MISSING_API_KEY",
      title: "Thermography AI Unavailable",
      message: "OPENAI_API_KEY is not configured in .env",
      httpStatus: 400
    };
  }

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

  const metadata = body.metadata || {};
  const { data, mimeType } = stripDataUrl(imageBase64);
  const dataUrl = `data:${mimeType};base64,${data}`;
  const client = new OpenAI({ apiKey });
  const userText = buildThermographyUserPrompt(metadata);

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
            { role: "system", content: THERMOGRAPHY_MASTER_PROMPT },
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
            { role: "system", content: THERMOGRAPHY_MASTER_PROMPT },
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
        const parsed = extractJsonObject(contentText);
        const dataNormalized = normalizeThermographyResult(parsed);
        console.log("[analyze-thermography] Analysis complete:", {
          health: dataNormalized.health_score,
          primary: dataNormalized.primary_fault,
          faults: dataNormalized.fault_list.length,
          delta_t: dataNormalized.peaks.delta_t,
          severity_class: dataNormalized.detailed?.severity_class,
          confidence: dataNormalized.detailed?.confidence_score
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
        `[analyze-thermography] OpenAI Vision model ${model} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.error("[analyze-thermography] OpenAI Vision call failed:", lastError);
  return {
    success: false,
    errorType: "VISION_ERROR",
    title: "Thermography Vision Error",
    message: "Unable to analyze thermal image with OpenAI Vision.",
    httpStatus: 503,
    detail: lastError instanceof Error ? lastError.message : "Unknown error"
  };
}
