/**
 * POST /api/analyze-vibration
 * Next.js App Router handler — 3-stage multi-model consensus engine
 * (Gemini vision + DeepSeek/OpenRouter + Groq/OpenAI).
 *
 * Production MotorMedic Pro also serves this via Express in server.ts
 * (ANALYZE_VIBRATION_API_PATH). Both entry points call
 * runConsensusVibrationAnalysis so behavior stays aligned.
 */

import {
  ANALYZE_VIBRATION_API_PATH,
  runConsensusVibrationAnalysis,
  type AnalyzeVibrationRequest
} from "../../../lib/consensusEngine";

export const runtime = "nodejs";
export { ANALYZE_VIBRATION_API_PATH };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function POST(req: Request) {
  let body: AnalyzeVibrationRequest;
  try {
    body = (await req.json()) as AnalyzeVibrationRequest;
  } catch {
    console.error(
      `[${ANALYZE_VIBRATION_API_PATH}] Invalid JSON body. Restart server after .env/route changes if requests keep failing.`
    );
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const result = await runConsensusVibrationAnalysis(body);

  if (result.success === false) {
    console.error(
      `[${ANALYZE_VIBRATION_API_PATH}]`,
      result.errorType,
      result.title,
      result.detail || ""
    );
    return jsonResponse(result, result.httpStatus);
  }

  return jsonResponse(result);
}
