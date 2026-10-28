/**
 * USERS-1 - tenant owner/admin invites, accept, resend/revoke, and disable.
 *
 * Same audit harness as notifications.test.ts: the REAL Express handlers from
 * server.ts are mounted through a fake app in DATABASE_URL-less memory mode,
 * two independent tenant owners are created through the REAL auth handlers,
 * and the REAL AR-29 session guard is exercised.
 *
 * Email is fully offline via setEmailTransport(); the raw invite token is
 * read from the mocked email exactly as the worker would receive it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import {
  __resetEmailTransportForTests,
  setEmailTransport,
  type EmailTransportInput
} from "./email";
import {
  evaluateDisableUser,
  generateInviteToken,
  hashInviteToken
} from "./tenantInvites";

const serverSource = readFileSync(
  fileURLToPath(new URL("../../server.ts", import.meta.url)),
  "utf8"
);
const migrationSource = readFileSync(
  fileURLToPath(
    new URL("../../migrations/027_tenant_invites.sql", import.meta.url)
  ),
  "utf8"
);

type Handler = (req: any, res: any, next?: any) => unknown;

interface Route {
  method: string;
  regex: RegExp;
  keys: string[];
  handler: Handler;
}

const harness = vi.hoisted(() => {
  const routes: Route[] = [];
  let apiGuard: Handler | null = null;

  const makeRegex = (pattern: string) => {
    const keys: string[] = [];
    const source = pattern.replace(/:[^/]+/g, (token) => {
      keys.push(token.slice(1));
      return "([^/]+)";
    });
    return { regex: new RegExp(`^${source}$`), keys };
  };

  const compose = (middleware: Handler[], terminal: Handler): Handler => {
    return (req: any, res: any, next?: any) => {
      let index = -1;
      const dispatch = (position: number): unknown => {
        if (position <= index) throw new Error("next() called multiple times");
        index = position;
        const fn = middleware[position];
        if (!fn) return terminal(req, res, next);
        return fn(req, res, () => dispatch(position + 1));
      };
      return dispatch(0);
    };
  };

  const register = (method: string, args: unknown[]) => {
    const terminal = args[args.length - 1] as Handler;
    const leading = args.slice(0, -1);
    const paths = leading
      .filter(
        (item): item is string | string[] =>
          typeof item === "string" || Array.isArray(item)
      )
      .flat();
    const middleware = leading.filter(
      (item): item is Handler => typeof item === "function"
    );
    const handler = compose(middleware, terminal);
    for (const pattern of paths) {
      if (typeof pattern !== "string") continue;
      const { regex, keys } = makeRegex(pattern);
      routes.push({ method, regex, keys, handler });
    }
    return app;
  };

  const app: any = {
    use(...args: any[]) {
      const first = args[0];
      const fn = args[args.length - 1];
      if (first === "/api" && typeof fn === "function" && fn.length >= 3) {
        apiGuard = fn as Handler;
      }
      return app;
    },
    get(...args: any[]) {
      return register("GET", args);
    },
    post(...args: any[]) {
      return register("POST", args);
    },
    put(...args: any[]) {
      return register("PUT", args);
    },
    patch(...args: any[]) {
      return register("PATCH", args);
    },
    delete(...args: any[]) {
      return register("DELETE", args);
    },
    listen(_port: unknown, _host: unknown, cb?: () => void) {
      cb?.();
      return { timeout: 0, headersTimeout: 0 };
    }
  };

  const express: any = () => app;
  express.json = () => (_req: any, _res: any, next: any) => next?.();
  express.urlencoded = () => (_req: any, _res: any, next: any) => next?.();
  express.static = () => (_req: any, _res: any, next: any) => next?.();

  return { routes, express, getGuard: () => apiGuard, noop: () => undefined };
});

vi.mock("express", () => ({ default: harness.express }));
vi.mock("vite", () => ({
  createServer: async () => ({ middlewares: harness.noop })
}));
vi.mock("dotenv", () => ({ default: { config: () => ({ parsed: {} }) } }));

function makeRes() {
  const headers: Record<string, string> = {};
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    header(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    setTimeout() {
      return this;
    }
  };
  return res;
}

function findRoute(method: string, path: string) {
  for (const route of harness.routes) {
    if (route.method !== method) continue;
    const match = route.regex.exec(path);
    if (!match) continue;
    const params: Record<string, string> = {};
    route.keys.forEach((key, i) => {
      params[key] = decodeURIComponent(match[i + 1]);
    });
    return { route, params };
  }
  throw new Error(`No route registered for ${method} ${path}`);
}

async function callApi(
  method: string,
  path: string,
  options: {
    body?: Record<string, unknown>;
    cookie?: string;
    query?: Record<string, string>;
  } = {}
) {
  const { route, params } = findRoute(method, path);
  const req: any = {
    method,
    path: path.replace(/^\/api/, "") || "/",
    originalUrl: path,
    url: path,
    params,
    query: options.query ?? {},
    body: options.body ?? {},
    headers: options.cookie ? { cookie: options.cookie } : {}
  };
  const res = makeRes();
  const guard = harness.getGuard();
  const next = () => Promise.resolve(route.handler(req, res, next));
  if (guard) {
    await guard(req, res, next);
  } else {
    await next();
  }
  return res;
}

function cookieFrom(res: any): string {
  const raw = res.headers["set-cookie"] as string | undefined;
  if (!raw) throw new Error("request did not set a session cookie");
  const token = /motormedic_session=([^;]+)/.exec(raw)?.[1];
  if (!token) throw new Error("session cookie missing motormedic_session");
  return `motormedic_session=${token}`;
}

interface Tenant {
  companyId: number;
  userId: number;
  username: string;
  cookie: string;
}

const run = Date.now().toString(36);

async function registerTenant(label: string): Promise<Tenant> {
  const companyName = `Invites ${label} ${run}`;
  const username = `inv_${label}_${run}`;
  const res = await callApi("POST", "/api/auth/register", {
    body: {
      username,
      password: "audit-password-123",
      plantCompanyName: companyName,
      termsAccepted: true
    }
  });
  expect(res.statusCode).toBe(201);
  return {
    companyId: res.body.company_id,
    userId: res.body.id,
    username,
    cookie: cookieFrom(res)
  };
}

async function login(
  username: string,
  password = "password123"
): Promise<string> {
  const res = await callApi("POST", "/api/auth/login", {
    body: { username, password }
  });
  expect(res.statusCode).toBe(200);
  return cookieFrom(res);
}

/** Uses the EXISTING AR-29 invite path to make a tenant owner/admin. */
async function addTenantAdmin(tenant: Tenant, label: string): Promise<Tenant> {
  const username = `inv_admin_${label}_${run}`;
  const invited = await callApi("POST", "/api/company/users/invite", {
    cookie: tenant.cookie,
    body: {
      company_id: tenant.companyId,
      email: `${username}@example.com`,
      role: "reliability-manager",
      username
    }
  });
  expect(invited.statusCode).toBe(200);
  tenant.username = username;
  tenant.userId = invited.body.id;
  tenant.cookie = await login(username);
  return tenant;
}

const sentEmails: EmailTransportInput[] = [];

function rawTokenFromEmail(email: string): string {
  const mail = [...sentEmails].reverse().find((row) => row.to === email);
  if (!mail) throw new Error(`No invite email was sent to ${email}`);
  const match = /\/invite\/([A-Za-z0-9]+)/.exec(mail.body);
  if (!match) throw new Error("Invite email did not contain an accept URL");
  return match[1];
}

async function createInvite(cookie: string, email: string) {
  const res = await callApi("POST", "/api/tenant-invites", {
    cookie,
    body: { email }
  });
  expect(res.statusCode).toBe(201);
  return res.body.invite;
}

beforeEach(() => {
  sentEmails.length = 0;
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.APP_BASE_URL = "https://app.example.test";
  setEmailTransport(async (input) => {
    sentEmails.push(input);
    return { id: `mock-${sentEmails.length}` };
  });
});

afterEach(() => {
  __resetEmailTransportForTests();
  delete process.env.RESEND_API_KEY;
  delete process.env.APP_BASE_URL;
  vi.useRealTimers();
});

let tenantA: Tenant;
let tenantB: Tenant;

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.ENABLE_DEV_AUTH_SEED;
  process.env.NODE_ENV = "test";

  await import("../../server.ts");

  tenantA = await registerTenant("a");
  tenantB = await registerTenant("b");
  tenantA = await addTenantAdmin(tenantA, "a");
  tenantB = await addTenantAdmin(tenantB, "b");
});

describe("USERS-1 - schema and token rules", () => {
  it("cites the existing schema and adds only the missing pieces idempotently", () => {
    // Existing auth_invites already had tenant binding/token/expiry/use fields.
    expect(migrationSource).toContain("auth_invites");
    expect(migrationSource).toContain("token_hash");
    expect(migrationSource).toContain("company_id");
    expect(migrationSource).toContain("created_by");
    expect(migrationSource).toContain("expires_at");
    expect(migrationSource).toContain("used_at");
    // Only the missing additions.
    expect(migrationSource).toContain(
      "ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE"
    );
    expect(migrationSource).toContain(
      "ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'"
    );
    expect(migrationSource).toContain(
      "ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ"
    );
    expect(serverSource).toContain(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disabled"
    );
    expect(serverSource).toContain(
      "ALTER TABLE auth_invites ADD COLUMN IF NOT EXISTS status"
    );
  });

  it("raw token is 32-byte hex and the stored lookup key is its sha256", () => {
    const raw = generateInviteToken();
    expect(raw).toMatch(/^[a-f0-9]{64}$/);
    const hash = hashInviteToken(raw);
    expect(hash).not.toBe(raw);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("USERS-1 - invite creation and email", () => {
  it("queues an 'invite' email for the session tenant only", async () => {
    const email = `invite_a_${run}@example.com`;
    const invite = await createInvite(tenantA.cookie, email);
    expect(invite.email).toBe(email);
    expect(invite.status).toBe("sent");

    const mail = sentEmails.find((row) => row.to === email);
    expect(mail).toBeTruthy();
    expect(mail!.subject.toLowerCase()).toContain("invited");
    expect(mail!.body).toContain(
      `https://app.example.test/invite/${rawTokenFromEmail(email)}`
    );

    const auditA = await callApi("GET", "/api/admin/notifications", {
      cookie: tenantA.cookie
    });
    const aRow = (auditA.body.notifications ?? []).find(
      (row: any) => row.kind === "invite" && row.recipient_email === email
    );
    expect(aRow).toBeTruthy();
    expect(aRow.tenant_id).toBe(tenantA.companyId);
    expect(aRow.channel).toBe("email");

    const auditB = await callApi("GET", "/api/admin/notifications", {
      cookie: tenantB.cookie
    });
    expect(
      (auditB.body.notifications ?? []).some(
        (row: any) => row.recipient_email === email
      )
    ).toBe(false);
  });

  it("stores a hash, not the raw token (raw value never appears in the row)", async () => {
    const email = `hash_row_${run}@example.com`;
    const invite = await createInvite(tenantA.cookie, email);
    const raw = rawTokenFromEmail(email);
    const hash = hashInviteToken(raw);

    const list = await callApi("GET", "/api/tenant-invites", {
      cookie: tenantA.cookie
    });
    const row = (list.body.invites ?? []).find(
      (entry: any) => entry.id === invite.id
    );
    expect(row).toBeTruthy();
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(raw);
    expect(serialized).not.toContain(hash);
    expect(row.token_hash).toBeUndefined();

    // Lookup hashes the received value: the raw token resolves, its digest
    // (what the DB actually stores) does not.
    const publicRaw = await callApi("GET", `/api/invite/${raw}`);
    expect(publicRaw.statusCode).toBe(200);
    const publicHash = await callApi("GET", `/api/invite/${hash}`);
    expect(publicHash.statusCode).toBe(404);
  });

  it("rejects a duplicate active invite with 409 and validates email format", async () => {
    const email = `dup_${run}@example.com`;
    await createInvite(tenantA.cookie, email);
    const duplicate = await callApi("POST", "/api/tenant-invites", {
      cookie: tenantA.cookie,
      body: { email: email.toUpperCase() }
    });
    expect(duplicate.statusCode).toBe(409);

    const invalid = await callApi("POST", "/api/tenant-invites", {
      cookie: tenantA.cookie,
      body: { email: "not-an-email" }
    });
    expect(invalid.statusCode).toBe(400);
  });

  it("send failure keeps the invite row and marks it failed/resendable", async () => {
    setEmailTransport(async () => {
      throw new Error("smtp unavailable");
    });
    const email = `failed_${run}@example.com`;
    const res = await callApi("POST", "/api/tenant-invites", {
      cookie: tenantA.cookie,
      body: { email }
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.invite.status).toBe("failed");

    const list = await callApi("GET", "/api/tenant-invites", {
      cookie: tenantA.cookie
    });
    const row = (list.body.invites ?? []).find(
      (entry: any) => entry.email === email
    );
    expect(row).toBeTruthy();
    expect(row.status).toBe("failed");

    const audit = await callApi("GET", "/api/admin/notifications", {
      cookie: tenantA.cookie
    });
    const failed = (audit.body.notifications ?? []).find(
      (entry: any) =>
        entry.kind === "invite" &&
        entry.recipient_email === email &&
        entry.status === "failed"
    );
    expect(failed).toBeTruthy();
    expect(String(failed.error)).toContain("smtp unavailable");

    // Resendable: a working transport produces a fresh live token.
    setEmailTransport(async (input) => {
      sentEmails.push(input);
      return { id: `mock-${sentEmails.length}` };
    });
    const resent = await callApi(
      "POST",
      `/api/tenant-invites/${res.body.invite.id}/resend`,
      { cookie: tenantA.cookie }
    );
    expect(resent.statusCode).toBe(200);
    expect(resent.body.invite.status).toBe("sent");
    expect(rawTokenFromEmail(email)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("USERS-1 - accept", () => {
  it("binds the new user to the INVITE tenant, ignoring forged client tenancy", async () => {
    const email = `accept_${run}@example.com`;
    const username = `worker_accept_${run}`;
    await createInvite(tenantA.cookie, email);
    const raw = rawTokenFromEmail(email);

    const accepted = await callApi("POST", `/api/invite/${raw}/accept`, {
      body: {
        username,
        password: "worker-password-123",
        company_id: tenantB.companyId,
        tenant_id: tenantB.companyId,
        companyId: tenantB.companyId
      }
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.body.user.company_id).toBe(tenantA.companyId);
    expect(accepted.body.user.company_id).not.toBe(tenantB.companyId);

    const session = await callApi("POST", "/api/auth/login", {
      body: { username, password: "worker-password-123" }
    });
    expect(session.statusCode).toBe(200);
    expect(session.body.company_id).toBe(tenantA.companyId);
  });

  it("is single-use and rejects an expired invite with clear copy", async () => {
    const email = `once_${run}@example.com`;
    await createInvite(tenantA.cookie, email);
    const raw = rawTokenFromEmail(email);
    const first = await callApi("POST", `/api/invite/${raw}/accept`, {
      body: { username: `worker_once_${run}`, password: "worker-password-123" }
    });
    expect(first.statusCode).toBe(201);
    const second = await callApi("POST", `/api/invite/${raw}/accept`, {
      body: { username: `worker_once_2_${run}`, password: "worker-password-123" }
    });
    expect(second.statusCode).toBe(409);
    expect(String(second.body.error)).toMatch(/already been used/i);

    const expiredEmail = `expired_${run}@example.com`;
    await createInvite(tenantA.cookie, expiredEmail);
    const expiredRaw = rawTokenFromEmail(expiredEmail);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000));
    const expired = await callApi(
      "POST",
      `/api/invite/${expiredRaw}/accept`,
      {
        body: {
          username: `worker_expired_${run}`,
          password: "worker-password-123"
        }
      }
    );
    expect(expired.statusCode).toBe(410);
    expect(String(expired.body.error)).toMatch(/expired/i);
  });

  it("resend rotates the token: old link dead, new link live", async () => {
    const email = `rotate_${run}@example.com`;
    const invite = await createInvite(tenantA.cookie, email);
    const oldRaw = rawTokenFromEmail(email);
    expect((await callApi("GET", `/api/invite/${oldRaw}`)).statusCode).toBe(
      200
    );

    const resent = await callApi(
      "POST",
      `/api/tenant-invites/${invite.id}/resend`,
      { cookie: tenantA.cookie }
    );
    expect(resent.statusCode).toBe(200);
    const newRaw = rawTokenFromEmail(email);
    expect(newRaw).not.toBe(oldRaw);

    expect((await callApi("GET", `/api/invite/${oldRaw}`)).statusCode).toBe(
      404
    );
    expect((await callApi("GET", `/api/invite/${newRaw}`)).statusCode).toBe(
      200
    );
    expect(
      (
        await callApi("POST", `/api/invite/${oldRaw}/accept`, {
          body: {
            username: `worker_old_${run}`,
            password: "worker-password-123"
          }
        })
      ).statusCode
    ).toBe(404);
  });
});

describe("USERS-1 - authorization and tenant isolation", () => {
  it("non-admin invite/list/resend/revoke are 403", async () => {
    const email = `nonadmin_source_${run}@example.com`;
    const invite = await createInvite(tenantA.cookie, email);
    const raw = rawTokenFromEmail(email);
    const accepted = await callApi("POST", `/api/invite/${raw}/accept`, {
      body: {
        username: `worker_nonadmin_${run}`,
        password: "worker-password-123"
      }
    });
    expect(accepted.statusCode).toBe(201);
    const workerCookie = cookieFrom(accepted);

    expect(
      (
        await callApi("POST", "/api/tenant-invites", {
          cookie: workerCookie,
          body: { email: `blocked_${run}@example.com` }
        })
      ).statusCode
    ).toBe(403);
    expect(
      (await callApi("GET", "/api/tenant-invites", { cookie: workerCookie }))
        .statusCode
    ).toBe(403);
    expect(
      (
        await callApi(
          "POST",
          `/api/tenant-invites/${invite.id}/resend`,
          { cookie: workerCookie }
        )
      ).statusCode
    ).toBe(403);
    expect(
      (
        await callApi(
          "POST",
          `/api/tenant-invites/${invite.id}/revoke`,
          { cookie: workerCookie }
        )
      ).statusCode
    ).toBe(403);
  });

  it("cross-tenant list is scoped and cross-tenant resend/revoke are 404", async () => {
    const email = `cross_${run}@example.com`;
    const invite = await createInvite(tenantA.cookie, email);

    const listB = await callApi("GET", "/api/tenant-invites", {
      cookie: tenantB.cookie
    });
    expect(listB.statusCode).toBe(200);
    expect(
      (listB.body.invites ?? []).some((row: any) => row.email === email)
    ).toBe(false);

    const resendB = await callApi(
      "POST",
      `/api/tenant-invites/${invite.id}/resend`,
      { cookie: tenantB.cookie }
    );
    expect(resendB.statusCode).toBe(404);

    const revokeB = await callApi(
      "POST",
      `/api/tenant-invites/${invite.id}/revoke`,
      { cookie: tenantB.cookie }
    );
    expect(revokeB.statusCode).toBe(404);

    // The owner's own revoke still works and kills the public link.
    const revokeA = await callApi(
      "POST",
      `/api/tenant-invites/${invite.id}/revoke`,
      { cookie: tenantA.cookie }
    );
    expect(revokeA.statusCode).toBe(200);
    const raw = rawTokenFromEmail(email);
    expect((await callApi("GET", `/api/invite/${raw}`)).statusCode).toBe(404);
  });
});

describe("USERS-1 - disable / enable", () => {
  it("disable refuses login and invalidates existing sessions", async () => {
    const email = `disable_${run}@example.com`;
    const username = `worker_disable_${run}`;
    await createInvite(tenantA.cookie, email);
    const raw = rawTokenFromEmail(email);
    const accepted = await callApi("POST", `/api/invite/${raw}/accept`, {
      body: { username, password: "worker-password-123" }
    });
    expect(accepted.statusCode).toBe(201);
    const workerId = accepted.body.user.id;
    const workerCookie = cookieFrom(accepted);

    expect(
      (await callApi("GET", "/api/auth/session", { cookie: workerCookie }))
        .statusCode
    ).toBe(200);

    const users = await callApi("GET", "/api/tenant-users", {
      cookie: tenantA.cookie
    });
    expect(users.statusCode).toBe(200);
    const workerRow = (users.body.users ?? []).find(
      (row: any) => row.id === workerId
    );
    expect(workerRow?.status).toBe("Active");

    const disabled = await callApi(
      "POST",
      `/api/tenant-users/${workerId}/disable`,
      { cookie: tenantA.cookie }
    );
    expect(disabled.statusCode).toBe(200);
    expect(disabled.body.user.is_disabled).toBe(true);
    expect(disabled.body.user.status).toBe("Disabled");

    // Existing session is dead.
    expect(
      (await callApi("GET", "/api/auth/session", { cookie: workerCookie }))
        .statusCode
    ).toBe(401);

    // Login is refused with clear copy.
    const refused = await callApi("POST", "/api/auth/login", {
      body: { username, password: "worker-password-123" }
    });
    expect(refused.statusCode).toBe(403);
    expect(refused.body.code).toBe("ACCOUNT_DISABLED");
    expect(String(refused.body.error)).toMatch(/disabled/i);

    const enabled = await callApi(
      "POST",
      `/api/tenant-users/${workerId}/enable`,
      { cookie: tenantA.cookie }
    );
    expect(enabled.statusCode).toBe(200);
    const allowed = await callApi("POST", "/api/auth/login", {
      body: { username, password: "worker-password-123" }
    });
    expect(allowed.statusCode).toBe(200);
  });

  it("self-disable and last-active-admin disable are 409", async () => {
    const self = await callApi(
      "POST",
      `/api/tenant-users/${tenantA.userId}/disable`,
      { cookie: tenantA.cookie }
    );
    expect(self.statusCode).toBe(409);
    expect(self.body.code).toBe("SELF");

    const lastAdmin = evaluateDisableUser({
      targetId: 42,
      currentUserId: 7,
      targetRole: "reliability-manager",
      tenantUsers: [
        { id: 42, role: "reliability-manager", is_disabled: false }
      ]
    });
    expect(lastAdmin.ok).toBe(false);
    expect(lastAdmin.reason).toBe("LAST_ADMIN");
    expect(String(lastAdmin.message)).toMatch(/active admin/i);
  });
});
