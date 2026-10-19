import { describe, it, expect, vi, afterEach } from "vitest";
import type { NextFunction, Request, Response } from "express";
import {
  createApiAuthGuard,
  createMemorySession,
  destroyMemorySession,
  registerMemoryUserLoader,
  requireAuth,
  requireRole,
  stripClientTenancyFields,
} from "./middleware";
import { DEFAULT_AUTH_COOKIE_NAME } from "./session";

function makeReq(overrides: Partial<Record<string, unknown>> = {}): Request {
  const raw: unknown = {
    path: "/analysis-results",
    method: "GET",
    headers: {},
    body: {},
    ...overrides,
  };
  return raw as Request;
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  const raw: unknown = res;
  return raw as Response & { statusCode: number; body: unknown };
}

afterEach(() => {
  registerMemoryUserLoader(null);
});

describe("AR-29 global API guard — whitelist", () => {
  const guard = createApiAuthGuard(() => null);

  it("lets whitelisted public paths through without a session", async () => {
    for (const path of ["/auth/login", "/auth/register", "/auth/session", "/health"]) {
      const req = makeReq({ path });
      const res = makeRes();
      const next = vi.fn() as NextFunction;
      await guard(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.auth).toBeUndefined();
      expect(res.statusCode).toBe(200);
    }
  });

  it("allows the public demo-login path through (handler 404-gates it)", async () => {
    const req = makeReq({ path: "/auth/demo-login", method: "POST" });
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    await guard(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("AR-29 global API guard — enforcement", () => {
  it("returns 401 NO_SESSION on protected routes without a cookie", async () => {
    const guard = createApiAuthGuard(() => null);
    const req = makeReq({ path: "/analysis-results" });
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    await guard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ code: "NO_SESSION" });
  });

  it("rejects garbage/too-short session cookies", async () => {
    const guard = createApiAuthGuard(() => null);
    const req = makeReq({
      path: "/run-diagnostics",
      method: "POST",
      headers: { cookie: `${DEFAULT_AUTH_COOKIE_NAME}=short` },
    });
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    await guard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("attaches auth from a live memory session (approved memory-mode fix)", async () => {
    registerMemoryUserLoader((userId) =>
      userId === 7
        ? {
            id: 7,
            username: "engineer",
            company_id: 55,
            role: "plant-engineer",
            is_temp_password: false,
            plant_id: null,
            plant_name: null,
          }
        : null
    );
    const { token } = createMemorySession(7, 1);
    const guard = createApiAuthGuard(() => null);

    const req = makeReq({
      path: "/analysis-results",
      headers: { cookie: `${DEFAULT_AUTH_COOKIE_NAME}=${token}` },
    });
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    await guard(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.auth?.user.username).toBe("engineer");
    expect(req.auth?.tenantId).toBe(55);
    expect(req.tenantId).toBe(55);
  });

  it("invalidates destroyed memory sessions", async () => {
    registerMemoryUserLoader(() => ({
      id: 7,
      username: "engineer",
      company_id: 55,
      role: "plant-engineer",
      is_temp_password: false,
      plant_id: null,
      plant_name: null,
    }));
    const { token } = createMemorySession(7, 1);
    destroyMemorySession(token);

    const guard = createApiAuthGuard(() => null);
    const req = makeReq({
      path: "/analysis-results",
      headers: { cookie: `${DEFAULT_AUTH_COOKIE_NAME}=${token}` },
    });
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    await guard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("401s when the memory user loader cannot resolve the session's user", async () => {
    registerMemoryUserLoader(() => null);
    const { token } = createMemorySession(99, 1);
    const guard = createApiAuthGuard(() => null);
    const req = makeReq({
      path: "/analysis-results",
      headers: { cookie: `${DEFAULT_AUTH_COOKIE_NAME}=${token}` },
    });
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    await guard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe("AR-29 client tenancy stripping", () => {
  it("removes tenant_id and tenantId from write bodies", () => {
    const req = makeReq({
      method: "POST",
      body: { tenant_id: 1, tenantId: 2, asset_id: 9, note: "keep" },
    });
    stripClientTenancyFields(req);
    expect(req.body).toEqual({ asset_id: 9, note: "keep" });
  });

  it("leaves non-object bodies alone", () => {
    const req = makeReq({ method: "POST", body: "raw-string" });
    expect(() => stripClientTenancyFields(req)).not.toThrow();
    expect(req.body).toBe("raw-string");
  });
});

describe("AR-29 requireAuth / requireRole", () => {
  it("requireAuth 401s without a session", () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    requireAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("requireAuth passes with a session", () => {
    const req = makeReq({
      auth: {
        user: {
          id: 1,
          username: "u",
          company_id: 1,
          role: "system-admin",
          is_temp_password: false,
          plant_id: null,
        },
        tenantId: 1,
        sessionId: "s",
      },
    });
    const next = vi.fn() as NextFunction;
    requireAuth(req, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it("requireRole 401s unauthenticated, 403s wrong role, passes right role", () => {
    const guard = requireRole("system-admin");

    const anonRes = makeRes();
    const anonNext = vi.fn() as NextFunction;
    guard(makeReq(), anonRes, anonNext);
    expect(anonRes.statusCode).toBe(401);
    expect(anonNext).not.toHaveBeenCalled();

    const authFor = (role: string) =>
      makeReq({
        auth: {
          user: {
            id: 1,
            username: "u",
            company_id: 1,
            role,
            is_temp_password: false,
            plant_id: null,
          } as never,
          tenantId: 1,
          sessionId: "s",
        },
      });

    const wrongRes = makeRes();
    const wrongNext = vi.fn() as NextFunction;
    guard(authFor("plant-engineer"), wrongRes, wrongNext);
    expect(wrongRes.statusCode).toBe(403);
    expect(wrongRes.body).toMatchObject({ code: "FORBIDDEN" });
    expect(wrongNext).not.toHaveBeenCalled();

    const okNext = vi.fn() as NextFunction;
    guard(authFor("system-admin"), makeRes(), okNext);
    expect(okNext).toHaveBeenCalled();
  });
});
