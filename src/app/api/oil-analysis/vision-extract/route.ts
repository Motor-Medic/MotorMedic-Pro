/**
 * POST /api/oil-analysis/vision-extract
 * Accepts base64 oil lab report image → structured OilReportData via OpenRouter.
 * Also mounted on Express in server.ts for `npm run dev`.
 *
 * SLICE-SEC-BASELINE-1:
 *   - Auth required: tenant id derived from the verified session cookie only.
 *   - Rate limited: per-tenant AND per-IP buckets; 429 + Retry-After; fail closed.
 *   - No secret values in logs or response: provider keys are never logged.
 */

import {
  OIL_VISION_API_PATH,
  extractOilReportFromImageBase64
} from "../../../../lib/oilVisionExtractor";
import { tenantIdFromNextRequest } from "../../../../lib/auth/tenantFromRequest";
import {
  checkPreAuthRateLimit,
  checkVisionRateLimit,
  resolveClientIp
} from "../../../../lib/visionRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
export { OIL_VISION_API_PATH };

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

/**
 * SLICE-SEC-3 — resolve the client IP for an App Router request.
 *
 * `Request` exposes no socket, so the immediate peer is unknown here. We
 * therefore never trust X-Forwarded-For / X-Real-IP from this entry point:
 * resolveClientIp({ peerIp: null }) returns null, and every request shares one
 * fail-closed "unverified" bucket (UNVERIFIED_CLIENT_KEY in visionRateLimit).
 * Tradeoff: per-IP isolation is coarser on App Router than on Express, but a
 * client can no longer mint a fresh bucket by rotating a spoofed header.
 */
function ipFromRequest(request: Request): string | null {
  return resolveClientIp({
    peerIp: null,
    forwardedFor: request.headers.get("x-forwarded-for"),
    realIp: request.headers.get("x-real-ip")
  });
}

function rateLimitedResponse(decision: {
  retryAfterMs: number;
}): Response {
  const retryAfterSec = Math.ceil(decision.retryAfterMs / 1000);
  return jsonResponse(
    { error: "Rate limit exceeded", code: "RATE_LIMITED", retryAfterSec },
    429,
    { "Retry-After": String(retryAfterSec) }
  );
}

/** Resolve tenant id and rate-limit decision before any provider work. */
async function authorizeAndRateLimit(request: Request): Promise<{
  tenantId: number | null;
  response?: Response;
}> {
  const ip = ipFromRequest(request);

  // SLICE-SEC-3: cheap pre-auth throttle BEFORE any session lookup, so a flood
  // of bogus cookies cannot amplify into findSessionByToken / DB load.
  const preAuth = checkPreAuthRateLimit(ip);
  if (!preAuth.allowed) {
    return { tenantId: null, response: rateLimitedResponse(preAuth) };
  }

  const tenantId = await tenantIdFromNextRequest(request);
  if (tenantId == null) {
    return { tenantId: null, response: jsonResponse({ error: "Authentication required", code: "NO_SESSION" }, 401) };
  }

  const decision = checkVisionRateLimit(tenantId, ip);
  if (!decision.allowed) {
    return { tenantId, response: rateLimitedResponse(decision) };
  }

  return { tenantId };
}

export async function POST(request: Request) {
  const auth = await authorizeAndRateLimit(request);
  if (auth.response) return auth.response;

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