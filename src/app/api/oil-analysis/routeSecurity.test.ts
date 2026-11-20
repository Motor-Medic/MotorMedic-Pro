/**
 * SLICE-SEC-BASELINE-1 — route-layer source audit tests.
 *
 * Verifies (without a live DB) that:
 *   - The oil-analysis GET/POST routes pass the session-derived tenantId
 *     to the persistence layer (tenant scoping at the query layer).
 *   - The vision-extract route enforces auth + rate limiting before any
 *     provider call.
 * These are source-text audits; they run in the node test project.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const stripComments = (text: string): string =>
  text
    .replace(/\/\*[\sS]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const here = (p: string) =>
  fileURLToPath(new URL(p, import.meta.url));

const oilRoute = stripComments(readFileSync(here("./route.ts"), "utf8"));

const visionRoute = stripComments(
  readFileSync(here("./vision-extract/route.ts"), "utf8")
);

describe("oil-analysis route — tenant scoping at the query layer", () => {
  it("GET resolves tenantId from the session before fetching samples", () => {
    expect(oilRoute).toContain("tenantIdFromNextRequest");
    expect(oilRoute).toContain("resolveTenantOr401");
    expect(oilRoute).toContain("fetchOilSamplesForAsset(assetId, tenantId)");
  });

  it("POST resolves tenantId from the session before saving a sample", () => {
    expect(oilRoute).toContain("saveOilSample(input, tenantId)");
    // The client-supplied tenant_id must not reach the persistence layer.
    expect(oilRoute).not.toContain("saveOilSample(input)");
  });

  it("401s when no session is present", () => {
    expect(oilRoute).toContain("401");
    expect(oilRoute).toContain("NO_SESSION");
  });
});

describe("vision-extract route — auth + rate limiting before provider", () => {
  it("requires a session (tenantId) before extraction", () => {
    expect(visionRoute).toContain("tenantIdFromNextRequest");
    expect(visionRoute).toContain("authorizeAndRateLimit");
  });

  it("enforces per-tenant and per-IP rate limits before the provider call", () => {
    expect(visionRoute).toContain("checkVisionRateLimit");
    expect(visionRoute).toContain("429");
    expect(visionRoute).toContain("RATE_LIMITED");
    expect(visionRoute).toContain("Retry-After");
  });

  it("fail closed: rate-limited requests never reach extractOilReportFromImageBase64", () => {
    // authorizeAndRateLimit is called before any body parsing / provider call.
    const authorizeIndex = visionRoute.indexOf("authorizeAndRateLimit(request)");
    const extractCallIndex = visionRoute.indexOf("extractOilReportFromImageBase64({");
    expect(authorizeIndex).toBeGreaterThanOrEqual(0);
    expect(extractCallIndex).toBeGreaterThan(authorizeIndex);
  });

  it("does not log provider key values", () => {
    // The route logs only the detected technology, never keys or secrets.
    expect(visionRoute).not.toMatch(/process\.env/);
    expect(visionRoute).not.toMatch(/API_KEY/);
    expect(visionRoute).not.toMatch(/SESSION_SECRET/);
  });
});
