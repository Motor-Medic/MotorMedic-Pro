/**
 * POST /api/analyze-ultrasound
 * Next.js App Router handler — mirrors Express mount in server.ts.
 * Both call runUltrasoundAnalysis so behavior stays aligned.
 */

import { ANALYZE_ULTRASOUND_API_PATH } from "../../../lib/ultrasoundAnalysis";
import { runUltrasoundAnalysis } from "../../../lib/ultrasoundAnalysisEngine";
import type { AnalyzeUltrasoundRequest } from "../../../lib/ultrasoundAnalysis";

export const runtime = "nodejs";
export { ANALYZE_ULTRASOUND_API_PATH };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function POST(req: Request) {
  let body: AnalyzeUltrasoundRequest;
  try {
    body = (await req.json()) as AnalyzeUltrasoundRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const outcome = await runUltrasoundAnalysis(body);

  if (outcome.success === false) {
    return jsonResponse(
      {
        success: false,
        errorType: outcome.errorType,
        title: outcome.title,
        message: outcome.message,
        error: outcome.message,
        ...(outcome.detail ? { detail: outcome.detail } : {})
      },
      outcome.httpStatus
    );
  }

  return jsonResponse({
    success: true,
    data: outcome.data,
    ...outcome.data,
    analysisSource: "ultrasound-ai-placeholder"
  });
}

export async function GET() {
  return jsonResponse({
    ok: true,
    method: "POST",
    path: ANALYZE_ULTRASOUND_API_PATH,
    service: "Ultrasound Analysis Engine (placeholder — Master AI prompt pending)"
  });
}
