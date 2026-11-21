/**
 * SLICE-SEC-3 — entry-point gate tests (App Router + Express).
 *
 * Behavior:
 *   - pre-auth flood is throttled before tenantIdFromNextRequest (no session/DB
 *     lookup for the throttled request)
 *   - rotating a spoofed X-Forwarded-For does not mint a fresh bucket
 *   - TenantRequiredError maps to its declared 401/NO_TENANT in the App Router
 *
 * Source audit (server.ts cannot be imported in tests):
 *   - Express peer IP comes from req.socket.remoteAddress and the trusted-proxy
 *     resolver
 *   - Express pre-auth throttle runs before requireModule/requirePermission
 *   - both Express oil-analysis handlers map TenantRequiredError
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  tenantMock,
  extractMock,
  saveMock,
  fetchMock,
  TenantRequiredErrorMock
} = vi.hoisted(() => {
  class TenantRequiredErrorMock extends Error {
    readonly statusCode = 401;
    readonly code = "NO_TENANT";
    constructor() {
      super("Tenant id is required for oil analysis write");
      this.name = "TenantRequiredError";
    }
  }
  return {
    tenantMock: vi.fn(async (): Promise<number | null> => 1),
    extractMock: vi.fn(async () => ({
      success: true as const,
      data: { detectedTechnology: "OIL" },
      model: "test-model"
    })),
    saveMock: vi.fn(async () => {
      throw new TenantRequiredErrorMock();
    }),
    fetchMock: vi.fn(async () => {
      throw new TenantRequiredErrorMock();
    }),
    TenantRequiredErrorMock
  };
});

vi.mock("../../../lib/auth/tenantFromRequest", () => ({
  tenantIdFromNextRequest: tenantMock
}));

vi.mock("../../../lib/oilVisionExtractor", () => ({
  OIL_VISION_API_PATH: "/api/oil-analysis/vision-extract",
  extractOilReportFromImageBase64: extractMock
}));

vi.mock("../../../lib/db", () => ({
  isDbConfigured: () => true
}));

vi.mock("../../../lib/oilAnalysisPersistence", () => ({
  OIL_ANALYSIS_API_PATH: "/api/oil-analysis",
  TenantRequiredError: TenantRequiredErrorMock,
  coerceSaveOilSampleInput: () => ({
    assetId: "asset-1",
    sampleDate: "2026-01-01",
    operatingHours: 1
  }),
  saveOilSample: saveMock,
  fetchOilSamplesForAsset: fetchMock
}));

import { resetVisionRateLimiters } from "../../../lib/visionRateLimit";
import { GET as oilGet, POST as oilPost } from "./route";
import { POST as visionPost } from "./vision-extract/route";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const visionRouteSrc = readFileSync(here("./vision-extract/route.ts"), "utf8");
const oilRouteSrc = readFileSync(here("./route.ts"), "utf8");
const serverSrc = readFileSync(here("../../../../server.ts"), "utf8");

beforeEach(() => {
  resetVisionRateLimiters();
  tenantMock.mockReset();
  tenantMock.mockResolvedValue(1);
  extractMock.mockClear();
  saveMock.mockClear();
  fetchMock.mockClear();
});

const visionRequest = (spoofedIp: string) =>
  new Request("http://localhost/api/oil-analysis/vision-extract", {
    method: "POST",
    headers: {
      cookie: "session=bogus",
      "x-forwarded-for": spoofedIp,
      "x-real-ip": spoofedIp
    },
    body: JSON.stringify({ imageBase64: "AAAA" })
  });

describe("vision-extract App Router — pre-auth gate", () => {
  it("throttles an unauthenticated flood before any session lookup", async () => {
    tenantMock.mockResolvedValue(null);

    // Rotate a spoofed XFF every request: it must not create fresh buckets.
    for (let i = 0; i < 120; i++) {
      const response = await visionPost(visionRequest(`10.9.0.${i}`));
      expect(response.status).toBe(401);
    }
    expect(tenantMock).toHaveBeenCalledTimes(120);

    const throttled = await visionPost(visionRequest("10.9.1.1"));
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("Retry-After")).toBeTruthy();
    // The 121st request never reached the session lookup.
    expect(tenantMock).toHaveBeenCalledTimes(120);
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("keeps the per-tenant limit after a successful session lookup", async () => {
    for (let i = 0; i < 30; i++) {
      const response = await visionPost(visionRequest(`10.9.2.${i}`));
      expect(response.status).toBe(200);
    }
    const throttled = await visionPost(visionRequest("10.9.3.1"));
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("oil-analysis App Router — TenantRequiredError mapping", () => {
  it("maps TenantRequiredError to 401 NO_TENANT on POST and GET", async () => {
    const post = await oilPost(
      new Request("http://localhost/api/oil-analysis", {
        method: "POST",
        body: JSON.stringify({})
      })
    );
    expect(post.status).toBe(401);
    expect(await post.json()).toMatchObject({ code: "NO_TENANT" });

    const get = await oilGet(
      new Request("http://localhost/api/oil-analysis?assetId=asset-1")
    );
    expect(get.status).toBe(401);
    expect(await get.json()).toMatchObject({ code: "NO_TENANT" });
  });
});

describe("entry-point source audit", () => {
  it("App Router checks the pre-auth throttle before the session lookup", () => {
    const start = visionRouteSrc.indexOf("async function authorizeAndRateLimit");
    const end = visionRouteSrc.indexOf("export async function POST");
    const block = visionRouteSrc.slice(start, end);
    const preAuthAt = block.indexOf("checkPreAuthRateLimit(ip)");
    const sessionAt = block.indexOf("tenantIdFromNextRequest(request)");
    expect(preAuthAt).toBeGreaterThanOrEqual(0);
    expect(sessionAt).toBeGreaterThan(preAuthAt);
  });

  it("App Router route module no longer exports resetVisionRateLimiters", () => {
    expect(visionRouteSrc).not.toContain("resetVisionRateLimiters");
    expect(oilRouteSrc.match(/instanceof TenantRequiredError/g) ?? []).toHaveLength(2);
  });

  it("Express resolves the peer socket and throttles before auth middleware", () => {
    expect(serverSrc).toContain("req?.socket?.remoteAddress");
    expect(serverSrc).toContain("resolveClientIp({");
    expect(serverSrc).toContain(
      "app.post(OIL_VISION_API_PATH, visionPreAuthThrottle, requireModule"
    );
    const preAuthAt = serverSrc.indexOf("function visionPreAuthThrottle");
    const visionRouteAt = serverSrc.indexOf("app.post(OIL_VISION_API_PATH");
    expect(preAuthAt).toBeGreaterThanOrEqual(0);
    expect(visionRouteAt).toBeGreaterThan(preAuthAt);
  });

  it("Express maps TenantRequiredError in both oil-analysis handlers", () => {
    const matches = serverSrc.match(/instanceof TenantRequiredError/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(serverSrc).toContain("error.statusCode");
    expect(serverSrc).toContain("error.code");
  });
});
