/**
 * NOTIFICATIONS-1 - email + in-app notification core.
 *
 * The API half mounts the REAL Express handlers from server.ts through a fake
 * Express app in DATABASE_URL-less memory mode (same harness as
 * multiTenantIsolation.test.ts / routeCheckout.test.ts), registers independent
 * tenants through the real POST /api/auth/register handler and drives the real
 * AR-29 session guard.
 *
 * Email is fully offline: setEmailTransport() injects a mock transport and the
 * default HTTPS transport is never reached.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetEmailTransportForTests,
  assertProductionEmailEnv,
  sendEmail,
  setEmailTransport,
  type EmailTransportInput
} from "./email";
import {
  buildAlertEmailRows,
  buildAlertInAppRows,
  isValidEmail
} from "./notifications";

const serverSource = readFileSync(
  fileURLToPath(new URL("../../server.ts", import.meta.url)),
  "utf8"
);
const migrationSource = readFileSync(
  fileURLToPath(new URL("../../migrations/026_notifications.sql", import.meta.url)),
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
  plantId: number | null;
  username: string;
  cookie: string;
}

const run = Date.now().toString(36);

async function registerTenant(label: string): Promise<Tenant> {
  const companyName = `Notifications ${label} ${run}`;
  const username = `ntf_${label}_${run}`;
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
    plantId: res.body.plant_id,
    username,
    cookie: cookieFrom(res)
  };
}

async function login(username: string, password = "password123"): Promise<string> {
  const res = await callApi("POST", "/api/auth/login", {
    body: { username, password }
  });
  expect(res.statusCode).toBe(200);
  return cookieFrom(res);
}

/**
 * Self-registration creates a plant-engineer. Recipient management/audit use
 * the EXISTING tenant-admin bar (reliability-manager or system-admin), so each
 * test tenant gets an invited reliability-manager owner.
 */
async function addTenantAdmin(tenant: Tenant, label: string): Promise<Tenant> {
  const username = `ntf_admin_${label}_${run}`;
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
  tenant.cookie = await login(username);
  return tenant;
}

async function waitFor<T>(
  assertion: () => Promise<T> | T,
  timeoutMs = 2000
): Promise<T> {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      return await assertion();
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw lastError;
}

const sentEmails: EmailTransportInput[] = [];

beforeEach(() => {
  sentEmails.length = 0;
  process.env.RESEND_API_KEY = "test-resend-key";
  setEmailTransport(async (input) => {
    sentEmails.push(input);
    return { id: `mock-${sentEmails.length}` };
  });
});

afterEach(() => {
  __resetEmailTransportForTests();
  delete process.env.RESEND_API_KEY;
});

let tenantA: Tenant;
let tenantB: Tenant;
let aRecipientId: number;
let bRecipientId: number;
let nonAdminCookie: string;
const aRecipientEmail = `alerts-a-${run}@example.com`;
const bRecipientEmail = `alerts-b-${run}@example.com`;

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

describe("NOTIFICATIONS-1 - email transport and boot guard", () => {
  it("development without RESEND_API_KEY records skipped and warns", async () => {
    const warn = vi.fn();
    const result = await sendEmail(
      { to: "dev@example.com", subject: "Dev", body: "No key" },
      { env: {}, warn }
    );
    expect(result.status).toBe("skipped");
    expect(result.error).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("RESEND_API_KEY");
  });

  it("production boot refuses without RESEND_API_KEY (DATABASE_URL-guard family)", () => {
    expect(() =>
      assertProductionEmailEnv({ NODE_ENV: "production" })
    ).toThrow(/email guard|RESEND_API_KEY/i);
    expect(() =>
      assertProductionEmailEnv({
        NODE_ENV: "production",
        RESEND_API_KEY: "re_live_key"
      })
    ).not.toThrow();
    expect(serverSource).toContain("assertProductionEmailEnv(process.env)");
    expect(serverSource).toContain("assertProductionAuthEnv(process.env)");
  });

  it("migration 026 is mirrored idempotently in both boot paths", () => {
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS notifications");
    expect(migrationSource).toContain(
      "CREATE TABLE IF NOT EXISTS tenant_alert_recipients"
    );
    expect(serverSource).toContain("CREATE TABLE IF NOT EXISTS notifications");
    expect(serverSource).toContain(
      "CREATE TABLE IF NOT EXISTS tenant_alert_recipients"
    );
  });

  it("pure builders filter recipient/user lists by tenant", () => {
    const alert = {
      id: "alert-1",
      title: "Bearing fault",
      description: "High vibration",
      severity: "HIGH"
    };
    const inApp = buildAlertInAppRows({
      tenantId: 7,
      alert,
      users: [
        { id: 1, tenant_id: 7 },
        { id: 2, tenant_id: 8 }
      ]
    });
    expect(inApp).toHaveLength(1);
    expect(inApp[0].user_id).toBe(1);

    const emails = buildAlertEmailRows({
      tenantId: 7,
      alert,
      recipients: [
        { id: 1, tenant_id: 7, email: "a@example.com" },
        { id: 2, tenant_id: 8, email: "b@example.com" },
        { id: 3, tenant_id: 7, email: "a@example.com" }
      ]
    });
    expect(emails).toHaveLength(1);
    expect(emails[0].recipient_email).toBe("a@example.com");
    expect(isValidEmail("not-an-email")).toBe(false);
  });
});

describe("NOTIFICATIONS-1 - recipient management and role gate", () => {
  it("owner/admin can list/add/remove recipients, tenant scoped", async () => {
    const empty = await callApi("GET", "/api/alert-recipients", {
      cookie: tenantA.cookie
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.body.recipients).toEqual([]);

    const invalid = await callApi("POST", "/api/alert-recipients", {
      cookie: tenantA.cookie,
      body: { email: "not-an-email" }
    });
    expect(invalid.statusCode).toBe(400);

    const addedA = await callApi("POST", "/api/alert-recipients", {
      cookie: tenantA.cookie,
      body: { email: aRecipientEmail }
    });
    expect(addedA.statusCode).toBe(201);
    aRecipientId = addedA.body.recipient.id;

    const duplicate = await callApi("POST", "/api/alert-recipients", {
      cookie: tenantA.cookie,
      body: { email: aRecipientEmail.toUpperCase() }
    });
    expect(duplicate.statusCode).toBe(409);

    const addedB = await callApi("POST", "/api/alert-recipients", {
      cookie: tenantB.cookie,
      body: { email: bRecipientEmail }
    });
    expect(addedB.statusCode).toBe(201);
    bRecipientId = addedB.body.recipient.id;

    // Cross-tenant add: B claims A's company_id. Existing convention for a
    // foreign tenant/resource id on a session-scoped route is 404.
    const crossTenantAdd = await callApi("POST", "/api/alert-recipients", {
      cookie: tenantB.cookie,
      body: { email: "foreign@example.com", company_id: tenantA.companyId }
    });
    expect(crossTenantAdd.statusCode).toBe(404);

    const crossTenantDelete = await callApi(
      "DELETE",
      `/api/alert-recipients/${bRecipientId}`,
      { cookie: tenantA.cookie }
    );
    expect(crossTenantDelete.statusCode).toBe(404);

    const aList = await callApi("GET", "/api/alert-recipients", {
      cookie: tenantA.cookie
    });
    expect(aList.body.recipients.map((r: any) => r.email)).toEqual([
      aRecipientEmail
    ]);
  });

  it("a non-admin tenant user gets 403 on recipient management and audit", async () => {
    const invited = await callApi("POST", "/api/company/users/invite", {
      cookie: tenantA.cookie,
      body: {
        company_id: tenantA.companyId,
        email: `nonadmin_${run}@example.com`,
        role: "plant-engineer",
        username: `ntf_nonadmin_${run}`
      }
    });
    expect(invited.statusCode).toBe(200);
    nonAdminCookie = await login(`ntf_nonadmin_${run}`);

    const list = await callApi("GET", "/api/alert-recipients", {
      cookie: nonAdminCookie
    });
    expect(list.statusCode).toBe(403);

    const add = await callApi("POST", "/api/alert-recipients", {
      cookie: nonAdminCookie,
      body: { email: "blocked@example.com" }
    });
    expect(add.statusCode).toBe(403);

    const audit = await callApi("GET", "/api/admin/notifications", {
      cookie: nonAdminCookie
    });
    expect(audit.statusCode).toBe(403);
  });
});

describe("NOTIFICATIONS-1 - alert fan-out", () => {
  it("creates in_app rows per same-tenant user + email rows per same-tenant recipient only", async () => {
    const subjectMarker = `A bearing alert ${run}`;
    const created = await callApi("POST", "/api/alerts", {
      cookie: tenantA.cookie,
      body: {
        title: subjectMarker,
        description: "Outboard bearing BPFO energy rising.",
        severity: "HIGH"
      }
    });
    expect(created.statusCode).toBe(201);
    expect(created.body.success).toBe(true);

    const aAudit = await waitFor(async () => {
      const res = await callApi("GET", "/api/admin/notifications", {
        cookie: tenantA.cookie
      });
      expect(res.statusCode).toBe(200);
      const matching = (res.body.notifications ?? []).filter((row: any) =>
        String(row.subject || "").includes(subjectMarker)
      );
      expect(matching.some((row: any) => row.channel === "in_app")).toBe(true);
      expect(
        matching.some(
          (row: any) =>
            row.channel === "email" &&
            row.recipient_email === aRecipientEmail &&
            row.status === "sent"
        )
      ).toBe(true);
      return res;
    });

    const aRows = (aAudit.body.notifications ?? []).filter((row: any) =>
      String(row.subject || "").includes(subjectMarker)
    );
    expect(
      aRows.some((row: any) => row.recipient_email === bRecipientEmail)
    ).toBe(false);

    const inApp = aRows.filter((row: any) => row.channel === "in_app");
    const usersRes = await callApi("GET", "/api/company/users", {
      cookie: tenantA.cookie,
      query: { company_id: String(tenantA.companyId) }
    });
    const expectedUsers = new Set(
      (usersRes.body as any[]).map((u: any) => Number(u.id))
    );
    expect(inApp).toHaveLength(expectedUsers.size);
    expect(inApp.every((row: any) => expectedUsers.has(Number(row.user_id)))).toBe(
      true
    );

    const bell = await callApi("GET", "/api/notifications", {
      cookie: tenantA.cookie
    });
    expect(bell.statusCode).toBe(200);
    expect(bell.body.unread_count).toBeGreaterThan(0);
    expect(
      (bell.body.notifications ?? []).every((row: any) => row.channel === "in_app")
    ).toBe(true);
    expect(
      (bell.body.notifications ?? []).some((row: any) =>
        String(row.subject || "").includes(subjectMarker)
      )
    ).toBe(true);

    const firstUnread = (bell.body.notifications ?? []).find(
      (row: any) => row.read_at == null
    );
    const read = await callApi(
      "POST",
      `/api/notifications/${firstUnread.id}/read`,
      { cookie: tenantA.cookie }
    );
    expect(read.statusCode).toBe(200);
    expect(read.body.notification.read_at).toBeTruthy();
  });

  it("provider throw stores a failed row, keeps the alert request successful, and fires no unhandledRejection", async () => {
    setEmailTransport(async () => {
      throw new Error("resend transport exploded");
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    try {
      const subjectMarker = `Provider failure ${run}`;
      const created = await callApi("POST", "/api/alerts", {
        cookie: tenantA.cookie,
        body: {
          title: subjectMarker,
          description: "Provider must fail without failing the request.",
          severity: "HIGH"
        }
      });
      expect(created.statusCode).toBe(201);
      expect(created.body.success).toBe(true);

      await waitFor(async () => {
        const audit = await callApi("GET", "/api/admin/notifications", {
          cookie: tenantA.cookie
        });
        const failed = (audit.body.notifications ?? []).find(
          (row: any) =>
            String(row.subject || "").includes(subjectMarker) &&
            row.channel === "email"
        );
        expect(failed).toBeTruthy();
        expect(failed.status).toBe("failed");
        expect(String(failed.error)).toContain("resend transport exploded");
      });

      // Observe a short window after the response for late rejections.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("dev/memory no-key alert email is recorded as skipped", async () => {
    delete process.env.RESEND_API_KEY;
    const subjectMarker = `Skipped alert ${run}`;
    const created = await callApi("POST", "/api/alerts", {
      cookie: tenantA.cookie,
      body: {
        title: subjectMarker,
        description: "No provider configured.",
        severity: "HIGH"
      }
    });
    expect(created.statusCode).toBe(201);

    await waitFor(async () => {
      const audit = await callApi("GET", "/api/admin/notifications", {
        cookie: tenantA.cookie
      });
      const emailRow = (audit.body.notifications ?? []).find(
        (row: any) =>
          String(row.subject || "").includes(subjectMarker) &&
          row.channel === "email"
      );
      expect(emailRow).toBeTruthy();
      expect(emailRow.status).toBe("skipped");
    });
  });

  it("bell + audit lists stay inside the session tenant", async () => {
    const aMarker = `A tenant only ${run}`;
    const bMarker = `B tenant only ${run}`;
    const aAlert = await callApi("POST", "/api/alerts", {
      cookie: tenantA.cookie,
      body: { title: aMarker, description: "A only", severity: "HIGH" }
    });
    const bAlert = await callApi("POST", "/api/alerts", {
      cookie: tenantB.cookie,
      body: { title: bMarker, description: "B only", severity: "HIGH" }
    });
    expect(aAlert.statusCode).toBe(201);
    expect(bAlert.statusCode).toBe(201);

    await waitFor(async () => {
      const bellA = await callApi("GET", "/api/notifications", {
        cookie: tenantA.cookie
      });
      const bellB = await callApi("GET", "/api/notifications", {
        cookie: tenantB.cookie
      });
      const subjectsA = (bellA.body.notifications ?? []).map((r: any) => r.subject);
      const subjectsB = (bellB.body.notifications ?? []).map((r: any) => r.subject);
      expect(subjectsA.some((s: string) => String(s).includes(aMarker))).toBe(true);
      expect(subjectsA.some((s: string) => String(s).includes(bMarker))).toBe(false);
      expect(subjectsB.some((s: string) => String(s).includes(bMarker))).toBe(true);
      expect(subjectsB.some((s: string) => String(s).includes(aMarker))).toBe(false);
    });

    const auditA = await callApi("GET", "/api/admin/notifications", {
      cookie: tenantA.cookie
    });
    const auditSubjects = (auditA.body.notifications ?? []).map(
      (row: any) => String(row.subject || "")
    );
    expect(auditSubjects.some((s) => s.includes(aMarker))).toBe(true);
    expect(auditSubjects.some((s) => s.includes(bMarker))).toBe(false);
  });
});

describe("NOTIFICATIONS-1 - provisioning welcome + checkout receipt", () => {
  it("welcome and receipt rows are created via the injected mock transport", async () => {
    const username = `ntf_buyer_${run}`;
    const companyName = `Notifications Buyer ${run}`;
    const buyerEmail = `buyer_${run}@example.com`;

    const checkout = await callApi("POST", "/api/checkout/create", {
      body: {
        moduleKeys: ["vibration"],
        termsAccepted: true,
        companyName,
        username,
        password: "audit-password-123",
        email: buyerEmail
      }
    });
    expect(checkout.statusCode).toBe(201);
    const checkoutRef = checkout.body.checkout_ref;

    const webhook = await callApi("POST", "/api/square/webhook", {
      body: {
        type: "payment.created",
        event_id: `evt_notifications_${run}`,
        data: {
          object: {
            payment: {
              id: `pay_notifications_${run}`,
              referenceId: checkoutRef,
              status: "COMPLETED",
              totalMoney: { amount: 12900 }
            }
          }
        }
      }
    });
    expect(webhook.statusCode).toBe(200);
    const companyId = webhook.body.provisioned.company_id;
    expect(companyId).toBeTruthy();

    const buyerCookie = await login(username, "audit-password-123");
    const audit = await waitFor(async () => {
      const res = await callApi("GET", "/api/admin/notifications", {
        cookie: buyerCookie
      });
      expect(res.statusCode).toBe(200);
      const rows = res.body.notifications ?? [];
      expect(rows.some((row: any) => row.kind === "welcome")).toBe(true);
      expect(rows.some((row: any) => row.kind === "receipt")).toBe(true);
      return rows;
    });

    const welcome = audit.find((row: any) => row.kind === "welcome");
    const receipt = audit.find((row: any) => row.kind === "receipt");
    expect(welcome.tenant_id).toBe(companyId);
    expect(welcome.channel).toBe("email");
    expect(welcome.recipient_email).toBe(buyerEmail);
    expect(welcome.status).toBe("sent");
    expect(receipt.tenant_id).toBe(companyId);
    expect(receipt.channel).toBe("email");
    expect(receipt.recipient_email).toBe(buyerEmail);
    expect(receipt.status).toBe("sent");
    expect(sentEmails.some((mail) => mail.to === buyerEmail)).toBe(true);
  });
});
