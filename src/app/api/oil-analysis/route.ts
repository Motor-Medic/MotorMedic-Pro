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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { OIL_ANALYSIS_API_PATH };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return jsonResponse(
      { error: "Database is not configured (DATABASE_URL)." },
      503
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get("assetId");

    if (!assetId) {
      return jsonResponse({ error: "assetId is required" }, 400);
    }

    const { samples } = await fetchOilSamplesForAsset(assetId);

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

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const input = coerceSaveOilSampleInput(body);

    if ("error" in input) {
      return jsonResponse({ error: input.error }, 400);
    }

    const result = await saveOilSample(input);

    return jsonResponse({
      success: true,
      sample: result.sample
    });
  } catch (error) {
    console.error("Error saving oil sample:", error);
    return jsonResponse({ error: "Failed to save data" }, 500);
  }
}
