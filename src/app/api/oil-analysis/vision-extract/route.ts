/**
 * POST /api/oil-analysis/vision-extract
 * Accepts base64 oil lab report image → structured OilReportData via OpenRouter.
 * Also mounted on Express in server.ts for `npm run dev`.
 */

import {
  OIL_VISION_API_PATH,
  extractOilReportFromImageBase64
} from "../../../../lib/oilVisionExtractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
export { OIL_VISION_API_PATH };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function POST(request: Request) {
  let body: {
    imageBase64?: string;
    fileData?: string;
    fileName?: string;
    models?: string[];
    maxTokens?: number;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    console.info("[vision] responding to client:", "n/a");
    return jsonResponse(
      {
        success: false,
        error: "INVALID_REQUEST",
        message: "Invalid JSON request body."
      },
      400
    );
  }

  const imageBase64 = body.imageBase64 || body.fileData;
  if (!imageBase64 || typeof imageBase64 !== "string") {
    console.info("[vision] responding to client:", "n/a");
    return jsonResponse(
      {
        success: false,
        error: "INVALID_REQUEST",
        message: "imageBase64 is required (data URL or raw base64)."
      },
      400
    );
  }

  const outcome = await extractOilReportFromImageBase64({
    imageBase64,
    fileName: body.fileName ?? null,
    models: body.models,
    maxTokens: body.maxTokens
  });

  if (outcome.success === false) {
    console.info("[vision] responding to client:", "n/a");
    return jsonResponse(
      {
        success: false,
        error: outcome.error,
        message: outcome.message,
        ...(outcome.detail ? { detail: outcome.detail } : {})
      },
      outcome.httpStatus
    );
  }

  const technology =
    (outcome.data as { detectedTechnology?: string | null } | undefined)
      ?.detectedTechnology ?? "OIL";
  console.info("[vision] responding to client:", technology);
  return jsonResponse({
    success: true,
    data: outcome.data,
    model: outcome.model,
    path: OIL_VISION_API_PATH
  });
}

export async function GET() {
  return jsonResponse({
    ok: true,
    method: "POST",
    path: OIL_VISION_API_PATH,
    service: "Oil Analysis Vision Extractor"
  });
}
