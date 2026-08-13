/**
 * POST /api/analyze-thermography
 * Next.js App Router handler — mirrors Express mount in server.ts.
 * Both call runThermographyAnalysis so behavior stays aligned.
 */

import { ANALYZE_THERMOGRAPHY_API_PATH } from "../../../lib/thermographyAnalysis";
import { runThermographyAnalysis } from "../../../lib/thermographyAnalysisEngine";
import type { AnalyzeThermographyRequest } from "../../../lib/thermographyAnalysis";

export const runtime = "nodejs";
export { ANALYZE_THERMOGRAPHY_API_PATH };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function optionalNumeric(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function calcI2rNormalizedDeltaT(
  measuredAmps: number | null,
  ratedAmps: number | null,
  deltaT: number | null
): number | null {
  if (
    measuredAmps == null ||
    ratedAmps == null ||
    deltaT == null ||
    !Number.isFinite(measuredAmps) ||
    !Number.isFinite(ratedAmps) ||
    !Number.isFinite(deltaT) ||
    ratedAmps === 0
  ) {
    return null;
  }
  return Math.pow(measuredAmps / ratedAmps, 2) * deltaT;
}

export async function POST(req: Request) {
  let body: AnalyzeThermographyRequest;
  try {
    body = (await req.json()) as AnalyzeThermographyRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const outcome = await runThermographyAnalysis(body);

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

  const meta =
    body.metadata && typeof body.metadata === "object"
      ? (body.metadata as Record<string, unknown>)
      : {};
  const measuredAmps = optionalNumeric(meta.measured_amps);
  const ratedAmps = optionalNumeric(meta.rated_amps);
  const deltaT = optionalNumeric(
    (outcome.data as { peaks?: { delta_t?: unknown } })?.peaks?.delta_t
  );
  const polymorphic_fields = {
    asset_type:
      meta.asset_type != null && String(meta.asset_type).trim()
        ? String(meta.asset_type).trim().toLowerCase()
        : null,
    phase_a_temp: optionalNumeric(meta.phase_a_temp),
    phase_b_temp: optionalNumeric(meta.phase_b_temp),
    phase_c_temp: optionalNumeric(meta.phase_c_temp),
    measured_amps: measuredAmps,
    rated_amps: ratedAmps,
    de_bearing_temp: optionalNumeric(meta.de_bearing_temp),
    ode_bearing_temp: optionalNumeric(meta.ode_bearing_temp),
    refractory_skin_temp: optionalNumeric(meta.refractory_skin_temp),
    max_allowable_limit: optionalNumeric(meta.max_allowable_limit),
    i2r_normalized_delta_t: calcI2rNormalizedDeltaT(
      measuredAmps,
      ratedAmps,
      deltaT
    )
  };

  return jsonResponse({
    success: true,
    data: {
      ...outcome.data,
      polymorphic_fields
    },
    ...outcome.data,
    polymorphic_fields,
    analysisSource: "thermography-ai"
  });
}

export async function GET() {
  return jsonResponse({
    ok: true,
    method: "POST",
    path: ANALYZE_THERMOGRAPHY_API_PATH,
    service: "OpenAI GPT-4o Vision — Thermography Analysis Engine"
  });
}
