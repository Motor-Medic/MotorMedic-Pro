/**
 * GET/POST /api/oil-analysis
 * App Router handler — also mounted on Express in server.ts for `npm run dev`.
 */

import {
  OIL_ANALYSIS_API_PATH,
  coerceSaveOilSampleInput,
  fetchOilSamplesForAsset,
  saveOilSample
} from "../../../lib/oilAnalysisPersistence";
import { isDbConfigured } from "../../../lib/db";
import { tenantIdFromNextRequest } from "../../../lib/auth/tenantFromRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { OIL_ANALYSIS_API_PATH };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/** Resolve the tenant id from the verified session cookie. Returns 401 when absent. */
async function resolveTenantOr401(request: Request): Promise<{ tenantId: number | null; response?: Response }> {
  const tenantId = await tenantIdFromNextRequest(request);
  if (tenantId == null) {
    return {
      tenantId: null,
      response: jsonResponse({ error: "Authentication required", code: "NO_SESSION" }, 401)
    };
  }
  return { tenantId };
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return jsonResponse(
      { error: "Database is not configured (DATABASE_URL)." },
      503
    );
  }

  const tenantResult = await resolveTenantOr401(request);
  if (tenantResult.response) return tenantResult.response;
  const tenantId = tenantResult.tenantId!;

  try {
    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get("assetId");

    if (!assetId) {
      return jsonResponse({ error: "assetId is required" }, 400);
    }

    // SLICE-SEC-BASELINE-1: tenant scoping enforced at the query layer.
    const { samples } = await fetchOilSamplesForAsset(assetId, tenantId);

    return jsonResponse({
      success: true,
      samples
    });
  } catch (error) {
    console.error("Error fetching oil analysis:", error);
    return jsonResponse({ error: "Failed to fetch data" }, 500);
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return jsonResponse(
      { error: "Database is not configured (DATABASE_URL)." },
      503
    );
  }

  const tenantResult = await resolveTenantOr401(request);
  if (tenantResult.response) return tenantResult.response;
  const tenantId = tenantResult.tenantId!;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const input = coerceSaveOilSampleInput(body);

    if ("error" in input) {
      return jsonResponse({ error: input.error }, 400);
    }

    // SLICE-SEC-BASELINE-1: tenant id stamped server-side from session, never from client.
    const result = await saveOilSample(input, tenantId);

    return jsonResponse({
      success: true,
      sample: result.sample,
      warnings: result.warnings
    });
  } catch (error) {
    console.error("Error saving oil sample:", error);
    return jsonResponse({ error: "Failed to save data" }, 500);
  }
}
