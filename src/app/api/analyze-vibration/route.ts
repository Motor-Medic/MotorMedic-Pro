/**
 * POST /api/analyze-vibration
 * Next.js App Router handler — AR-25 multi-agent consensus dispatch via the
 * free-tier-first provider cascade (mirrors Express in server.ts; both entry
 * points call runConsensusVibrationAnalysis so behavior stays aligned).
 */

import {
  ANALYZE_VIBRATION_API_PATH,
  runConsensusVibrationAnalysis,
  type AnalyzeVibrationRequest
} from "../../../lib/consensusEngine";
import {
  logPayloadSize,
  logPipelineFail,
  logPipelineSend,
  logPipelineStart,
  logPipelineSuccess
} from "../../../lib/pipelineTrace";
import {
  buildAnalyzeVibrationSuccessBody,
  jsonResponseBody
} from "../../../lib/safeApiJson";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;
export { ANALYZE_VIBRATION_API_PATH };

export async function POST(req: Request) {
  const startTime = logPipelineStart("analyze-vibration-next");
  let body: AnalyzeVibrationRequest;
  try {
    body = (await req.json()) as AnalyzeVibrationRequest;
  } catch (error) {
    logPipelineFail("analyze-vibration-next:json", startTime, error);
    console.error("API Route Error:", error);
    const message =
      error instanceof Error ? error.message : "Invalid JSON request body.";
    return jsonResponseBody(
      {
        success: false,
        errorType: "INVALID_REQUEST",
        message,
        error: message,
        detail: String(error)
      },
      400
    );
  }

  logPayloadSize("analyze-vibration-next", body.imageBase64);
  logPipelineSend("analyze-vibration-next");

  try {
    const result = await runConsensusVibrationAnalysis(body);

    if (result.success === false) {
      logPipelineFail(
        "analyze-vibration-next",
        startTime,
        new Error(result.detail || result.message),
        { status: result.httpStatus }
      );
      console.error(
        `[${ANALYZE_VIBRATION_API_PATH}]`,
        result.errorType,
        result.title,
        result.detail || ""
      );
      return jsonResponseBody(
        {
          success: false,
          errorType: result.errorType,
          title: result.title,
          message: result.message,
          error: result.message,
          broadband: { velocity: 0 },
          spectral: [],
          metadata: { processedAt: new Date().toISOString() },
          ...(result.detail ? { detail: result.detail } : {})
        },
        result.httpStatus
      );
    }

    logPipelineSuccess("analyze-vibration-next", startTime);
    return jsonResponseBody(
      buildAnalyzeVibrationSuccessBody(
        (result.data || {}) as unknown as Record<string, unknown>
      ),
      200
    );
  } catch (error: unknown) {
    logPipelineFail("analyze-vibration-next", startTime, error);
    console.error("Single-Model Analysis Failed:", error);
    const err = error as {
      status?: number;
      message?: string;
      detail?: string;
    };
    const status =
      typeof err.status === "number" && err.status >= 400 ? err.status : 500;
    const message =
      err.message ||
      (error instanceof Error ? error.message : "Analysis failed");
    const detail =
      err.detail ||
      (error instanceof Error ? error.stack || error.message : String(error));
    return jsonResponseBody(
      {
        success: false,
        errorType: err.status || "UNKNOWN_ERROR",
        message,
        error: message,
        detail,
        broadband: { velocity: 0 },
        spectral: [],
        metadata: { processedAt: new Date().toISOString() }
      },
      status
    );
  }
}
