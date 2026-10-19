import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_SESSION_TTL_HOURS,
  buildClearSessionCookie,
  buildSessionCookie,
  createSession,
  deleteSession,
  findSessionByToken,
  generateSessionToken,
  hashSessionToken,
  parseCookies,
  readSessionTokenFromRequest,
  sessionTtlHours,
  authCookieName,
} from "./session";

describe("AR-29 session token generation", () => {
  it("generates a 32-byte (256-bit) base64url token", () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes -> 43 base64url chars without padding
    expect(token.length).toBe(43);
  });

  it("tokens are unique per call", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generateSessionToken());
    expect(seen.size).toBe(50);
  });

  it("hashSessionToken stores only the sha256 digest, never the raw token", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashSessionToken(token)).toBe(hash);
    expect(hashSessionToken(generateSessionToken())).not.toBe(hash);
  });
});

describe("AR-29 cookie construction", () => {
  it("SESSION_TTL_HOURS drives Max-Age", () => {
    expect(sessionTtlHours({})).toBe(DEFAULT_SESSION_TTL_HOURS);
    expect(sessionTtlHours({ SESSION_TTL_HOURS: "24" })).toBe(24);
    expect(sessionTtlHours({ SESSION_TTL_HOURS: "nonsense" })).toBe(
      DEFAULT_SESSION_TTL_HOURS
    );
    expect(sessionTtlHours({ SESSION_TTL_HOURS: "-5" })).toBe(
      DEFAULT_SESSION_TTL_HOURS
    );
    const cookie = buildSessionCookie("tok", { SESSION_TTL_HOURS: "48" });
    expect(cookie).toContain(`Max-Age=${48 * 3600}`);
  });

  it("builds an httpOnly SameSite=Lax cookie in development", () => {
    const cookie = buildSessionCookie("tok-value", { NODE_ENV: "development" });
    expect(cookie).toContain("motormedic_session=tok-value");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Secure");
  });

  it("marks the cookie Secure in production", () => {
    const cookie = buildSessionCookie("tok-value", { NODE_ENV: "production" });
    expect(cookie).toContain("Secure");
  });

  it("honors AUTH_COOKIE_NAME and AUTH_COOKIE_SAMESITE", () => {
    const cookie = buildSessionCookie("tok", {
      AUTH_COOKIE_NAME: "custom_session",
      AUTH_COOKIE_SAMESITE: "Strict",
    });
    expect(cookie).toContain("custom_session=tok");
    expect(cookie).toContain("SameSite=Strict");
    expect(authCookieName({ AUTH_COOKIE_NAME: "  custom_session  " })).toBe(
      "custom_session"
    );
    expect(authCookieName({})).toBe("motormedic_session");
  });

  it("buildClearSessionCookie expires the cookie immediately", () => {
    const cookie = buildClearSessionCookie({});
    expect(cookie).toContain("motormedic_session=");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
  });
});

describe("AR-29 cookie parsing", () => {
  it("parses the session token from a cookie header", () => {
    const token = generateSessionToken();
    const header = `other=1; motormedic_session=${token}; more=2`;
    expect(readSessionTokenFromRequest(header)).toBe(token);
  });

  it("rejects missing or too-short tokens", () => {
    expect(readSessionTokenFromRequest(undefined)).toBeNull();
    expect(readSessionTokenFromRequest("motormedic_session=short")).toBeNull();
    expect(readSessionTokenFromRequest("other=abc")).toBeNull();
  });

  it("parseCookies decodes URI-encoded values", () => {
    expect(parseCookies("a=hello%20world")).toEqual({ a: "hello world" });
  });
});

function fakePool(handlers: {
  insert?: unknown[];
  select?: unknown[];
  delete?: unknown[];
}) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO auth_sessions"))
        return { rows: handlers.insert ?? [{ id: "sess-1" }] };
      if (sql.startsWith("DELETE FROM auth_sessions") && sql.includes("RETURNING"))
        return { rows: handlers.delete ?? [] };
      if (sql.startsWith("DELETE FROM auth_sessions"))
        return { rows: [], deleteCalled: true };
      if (sql.startsWith("SELECT"))
        return { rows: handlers.select ?? [] };
      return { rows: [] };
    }),
  };
}

describe("AR-29 session persistence", () => {
  it("createSession writes only the sha256 hash to the database", async () => {
    const pool = fakePool({ insert: [{ id: "sess-1" }] });
    const { token, sessionId } = await createSession(pool as never, 42, {
      SESSION_TTL_HOURS: "12",
    });
    expect(sessionId).toBe("sess-1");
    const [sql, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("INSERT INTO auth_sessions");
    expect(params[1]).toBe(hashSessionToken(token));
    expect(params[1]).not.toBe(token);
    expect(params[2]).toBe("12");
  });

  it("findSessionByToken returns null when no live session matches", async () => {
    const pool = fakePool({ delete: [], select: [] });
    expect(await findSessionByToken(pool as never, "anything")).toBeNull();
  });

  it("findSessionByToken returns the session row when present", async () => {
    const pool = fakePool({
      select: [{ id: "sess-9", user_id: 7, expires_at: new Date() }],
    });
    const s = await findSessionByToken(pool as never, "anything");
    expect(s?.user_id).toBe(7);
  });

  it("findSessionByToken purges expired sessions and returns null", async () => {
    const pool = fakePool({ delete: [{ id: "old" }] });
    expect(await findSessionByToken(pool as never, "expired")).toBeNull();
  });

  it("deleteSession issues a server-side row delete (logout)", async () => {
    const pool = fakePool({});
    await deleteSession(pool as never, "sess-1");
    const [sql, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("DELETE FROM auth_sessions");
    expect(params).toEqual(["sess-1"]);
  });
});
