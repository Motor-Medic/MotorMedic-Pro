/**
 * SLICE-SEC-BASELINE-1 — tenantIdFromNextRequest unit tests.
 *
 * Verifies the tenant id is derived ONLY from the verified server session
 * cookie, never from client-supplied headers/query/body. Missing session
 * → null (caller must 401).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PersistedSession } from "./session";

// Mock the db pool and session modules so no real DB is required.
vi.mock("../db", () => ({
  getPool: vi.fn()
}));

vi.mock("./session", () => ({
  readSessionTokenFromRequest: vi.fn(),
  findSessionByToken: vi.fn()
}));

import { getPool } from "../db";
import { readSessionTokenFromRequest, findSessionByToken } from "./session";
import { tenantIdFromNextRequest } from "./tenantFromRequest";

const mockedGetPool = vi.mocked(getPool);
const mockedReadToken = vi.mocked(readSessionTokenFromRequest);
const mockedFindSession = vi.mocked(findSessionByToken);

function makeRequest(cookieHeader: string | null): Request {
  const headers: HeadersInit = {};
  if (cookieHeader) headers.cookie = cookieHeader;
  return new Request("http://localhost/api/oil-analysis", { headers });
}

const SESSION_TOKEN = "valid-token-1234567890abcdef1234567890abcdef";

function mockSession(userId: number, companyId: number, disabled = false): void {
  mockedFindSession.mockResolvedValue({
    id: "sess-1",
    user_id: userId,
    expires_at: new Date()
  } as PersistedSession);
  mockedGetPool.mockReturnValue(
    {
      query: vi.fn().mockResolvedValue({
        rows: [{ company_id: companyId, is_disabled: disabled }]
      })
    } as any
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tenantIdFromNextRequest — session-derived tenancy", () => {
  it("returns null when no cookie is present", async () => {
    mockedReadToken.mockReturnValue(null);
    const tenantId = await tenantIdFromNextRequest(makeRequest(null));
    expect(tenantId).toBeNull();
    expect(mockedFindSession).not.toHaveBeenCalled();
  });

  it("returns null when the cookie token is too short / invalid", async () => {
    mockedReadToken.mockReturnValue(null);
    const tenantId = await tenantIdFromNextRequest(
      makeRequest("motormedic_session=short")
    );
    expect(tenantId).toBeNull();
  });

  it("returns null when the session is not found in the DB", async () => {
    mockedReadToken.mockReturnValue(SESSION_TOKEN);
    mockedFindSession.mockResolvedValue(null);
    const tenantId = await tenantIdFromNextRequest(
      makeRequest(`motormedic_session=${SESSION_TOKEN}`)
    );
    expect(tenantId).toBeNull();
  });

  it("returns null when the user row is missing or disabled", async () => {
    mockedReadToken.mockReturnValue(SESSION_TOKEN);
    mockedFindSession.mockResolvedValue({
      id: "sess-1",
      user_id: 99,
      expires_at: new Date()
    } as PersistedSession);
    mockedGetPool.mockReturnValue(
      {
        query: vi.fn().mockResolvedValue({ rows: [] })
      } as any
    );
    const tenantId = await tenantIdFromNextRequest(
      makeRequest(`motormedic_session=${SESSION_TOKEN}`)
    );
    expect(tenantId).toBeNull();
  });

  it("returns the session user's company_id as the tenant id", async () => {
    mockSession(7, 42, false);
    mockedReadToken.mockReturnValue(SESSION_TOKEN);
    const tenantId = await tenantIdFromNextRequest(
      makeRequest(`motormedic_session=${SESSION_TOKEN}`)
    );
    expect(tenantId).toBe(42);
  });

  it("returns null when the user is disabled", async () => {
    mockSession(7, 42, true);
    mockedReadToken.mockReturnValue(SESSION_TOKEN);
    const tenantId = await tenantIdFromNextRequest(
      makeRequest(`motormedic_session=${SESSION_TOKEN}`)
    );
    expect(tenantId).toBeNull();
  });

  it("does not consult client-supplied headers for tenancy", async () => {
    mockedReadToken.mockReturnValue(null);
    const req = new Request("http://localhost/api/oil-analysis", {
      headers: {
        "x-forwarded-for": "1.2.3.4",
        "x-tenant-id": "999"
      }
    });
    const tenantId = await tenantIdFromNextRequest(req);
    expect(tenantId).toBeNull();
  });
});
