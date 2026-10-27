/**
 * STOREFRONT — entitlement enforcement, provisioning scope, and the Stripe
 * mock guard. These tests run fully offline (no DATABASE_URL, no live keys).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MODULE_KEYS,
  getEntitlements,
  getModuleCatalog,
  isModuleActive,
  normalizeModuleKeys,
  registerModuleAccessResolver,
  requireModule
} from "./entitlements";
import {
  assertProductionStripeMode,
  isStripeTestMode,
  resolveStripeWebhookEvent
} from "./stripeMode";
import { isTabEntitled, visibleTabs } from "./moduleNav";
import {
  provisionTenantFromCheckout,
  type PendingCheckoutRecord
} from "./tenantProvisioning";

const serverSource = readFileSync(
  fileURLToPath(new URL("../../server.ts", import.meta.url)),
  "utf8"
);
const entitlementsSource = readFileSync(
  fileURLToPath(new URL("./entitlements.ts", import.meta.url)),
  "utf8"
);

afterEach(() => {
  registerModuleAccessResolver(null);
});

function entitlementDb(rows: Record<string, unknown>[]) {
  const calls: { text: string; params?: unknown[] }[] = [];
  const db = {
    calls,
    query: async (text: string, params?: unknown[]) => {
      calls.push({ text, params });
      const sql = text.replace(/\s+/g, " ").trim();
      let filtered = rows;
      if (params && params.length >= 1) {
        filtered = filtered.filter(
          (row) => Number(row.company_id) === Number(params[0])
        );
      }
      if (sql.includes("module_key = $2") && params && params.length >= 2) {
        filtered = filtered.filter((row) => row.module_key === params[1]);
      }
      if (sql.includes("status = 'active'")) {
        filtered = filtered.filter((row) => row.status === "active");
      }
      return { rows: filtered };
    }
  };
  return db;
}

describe("E2 — entitlement reads are tenant-scoped and module-only", () => {
  const rows = [
    { company_id: 7, module_key: "vibration", status: "active", stripe_subscription_id: null },
    { company_id: 7, module_key: "oil", status: "expired", stripe_subscription_id: null },
    { company_id: 8, module_key: "thermography", status: "active", stripe_subscription_id: null }
  ];

  it("isModuleActive only matches THIS company's ACTIVE row", async () => {
    const db = entitlementDb(rows);
    await expect(isModuleActive(7, "vibration", db)).resolves.toBe(true);
    await expect(isModuleActive(7, "oil", db)).resolves.toBe(false);
    await expect(isModuleActive(7, "thermography", db)).resolves.toBe(false);
    await expect(isModuleActive(8, "thermography", db)).resolves.toBe(true);
    expect(db.calls[0].params).toEqual([7, "vibration"]);
  });

  it("getEntitlements returns only active modules for the requested company", async () => {
    const db = entitlementDb(rows);
    const result = await getEntitlements(7, db);
    expect(result.map((row) => row.module_key)).toEqual(["vibration"]);
    expect(db.calls[0].params).toEqual([7]);
  });

  it("rejects unknown catalog keys instead of silently dropping them", () => {
    expect(normalizeModuleKeys(["vibration", "oil"])).toEqual(["vibration", "oil"]);
    expect(normalizeModuleKeys(["vibration", "platinum"])).toBeNull();
    expect(normalizeModuleKeys([])).toBeNull();
  });

  it("requireModule reads the tenant from the session, never query/body company_id", async () => {
    const seen: number[] = [];
    registerModuleAccessResolver(async (companyId) => {
      seen.push(companyId);
      return companyId === 7;
    });

    const makeReq = (tenantId: number) => {
      const req: any = {
        auth: { tenantId },
        tenantId,
        query: { company_id: "999" },
        body: { company_id: 999 }
      };
      return req;
    };
    const makeRes = () => {
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        }
      };
      return res;
    };

    const next = vi.fn();
    const allowed = makeRes();
    await requireModule("vibration")(makeReq(7), allowed, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(allowed.statusCode).toBe(200);
    expect(seen).toEqual([7]);

    const denied = makeRes();
    const deniedNext = vi.fn();
    await requireModule("vibration")(makeReq(8), denied, deniedNext);
    expect(deniedNext).not.toHaveBeenCalled();
    expect(denied.statusCode).toBe(403);
    expect(denied.body.code).toBe("MODULE_NOT_ENTITLED");
    expect(seen).toEqual([7, 8]);
  });

  it("nav omits unpaid modules and keeps core entries", () => {
    expect(isTabEntitled("dashboard", [])).toBe(true);
    expect(isTabEntitled("assets", [])).toBe(true);
    expect(isTabEntitled("trends", [])).toBe(false);
    expect(isTabEntitled("trends", ["oil"])).toBe(false);
    expect(isTabEntitled("trends", ["vibration"])).toBe(true);
    expect(isTabEntitled("analysis", ["oil"])).toBe(true);
    expect(visibleTabs(["dashboard", "trends", "analysis"], ["oil"])).toEqual([
      "dashboard",
      "analysis"
    ]);
  });

  it("catalog exposes exactly the engine module keys", () => {
    expect(MODULE_KEYS).toEqual(["vibration", "thermography", "ultrasound", "oil"]);
    const catalog = getModuleCatalog({});
    expect(catalog.map((entry) => entry.key)).toEqual([...MODULE_KEYS]);
    expect(catalog.every((entry) => entry.price_cents > 0)).toBe(true);
    expect(catalog.every((entry) => entry.configured === false)).toBe(true);
  });

  it("entitlement source never consults a client-supplied company id", () => {
    expect(entitlementsSource).not.toMatch(/req\.query\.company_id/);
    expect(entitlementsSource).not.toMatch(/req\.body\.company_id/);
    expect(entitlementsSource).toContain("WHERE company_id = $1");
  });
});

describe("E4 — provisioning is scoped to the NEW company via the shared helpers", () => {
  function provisioningDb() {
    const calls: { text: string; params?: unknown[] }[] = [];
    const db = {
      calls,
      query: async (text: string, params?: unknown[]) => {
        const sql = text.replace(/\s+/g, " ").trim();
        calls.push({ text: sql, params });
        if (sql.startsWith("INSERT INTO companies")) {
          return { rows: [{ id: 501 }] };
        }
        if (sql.startsWith("SELECT * FROM plants WHERE company_id")) {
          return { rows: [] };
        }
        if (sql.startsWith("INSERT INTO plants")) {
          return {
            rows: [
              {
                id: 601,
                name: params?.[0],
                company_id: params?.[1]
              }
            ]
          };
        }
        if (sql.startsWith("SELECT * FROM routes WHERE plant_id")) {
          return { rows: [] };
        }
        if (sql.startsWith("INSERT INTO routes")) {
          return {
            rows: [
              {
                id: 701,
                plant_id: params?.[0],
                name: params?.[1],
                is_system: true
              }
            ]
          };
        }
        if (sql.startsWith("SELECT id, company_id FROM users")) {
          return { rows: [] };
        }
        if (sql.startsWith("INSERT INTO users")) {
          return { rows: [{ id: 801 }] };
        }
        if (sql.startsWith("SELECT id FROM plants WHERE company_id")) {
          return { rows: [{ id: 601 }] };
        }
        if (sql.startsWith("INSERT INTO tenant_entitlements")) {
          return { rows: [] };
        }
        return { rows: [] };
      }
    };
    return db;
  }

  const pending: PendingCheckoutRecord = {
    checkout_session_id: "cs_test_scope",
    checkout_ref: "ref_scope",
    company_name: "Storefront Scope Co",
    admin_username: "store_scope_admin",
    admin_email: "scope@example.com",
    password_hash: "hashed-at-checkout",
    terms_accepted: true,
    module_keys: ["vibration", "oil"],
    stripe_subscription_id: null,
    stripe_customer_id: null,
    company_id: null,
    admin_user_id: null,
    plant_id: null,
    status: "pending"
  };

  it("creates company/user/plant/entitlements against the NEW id, not a borrowed first company", async () => {
    const db = provisioningDb();
    const result = await provisionTenantFromCheckout(db, { ...pending }, {
      subscriptionId: "sub_scope_1",
      customerId: "cus_scope_1",
      now: () => new Date("2026-01-02T03:04:05Z")
    });

    expect(result).toMatchObject({
      companyId: 501,
      adminUserId: 801,
      plantId: 601,
      routeId: 701,
      moduleKeys: ["vibration", "oil"]
    });

    const plantSelect = db.calls.find((call) =>
      call.text.startsWith("SELECT * FROM plants WHERE company_id")
    );
    expect(plantSelect?.params).toEqual([501]);

    const routeSelect = db.calls.find((call) =>
      call.text.startsWith("SELECT * FROM routes WHERE plant_id")
    );
    expect(routeSelect?.params).toEqual([601]);

    const userInsert = db.calls.find((call) =>
      call.text.startsWith("INSERT INTO users")
    );
    expect(userInsert?.params?.[0]).toBe(501);
    expect(userInsert?.params?.[4]).toBeInstanceOf(Date);

    const entitlements = db.calls.filter((call) =>
      call.text.startsWith("INSERT INTO tenant_entitlements")
    );
    expect(entitlements).toHaveLength(2);
    expect(entitlements.map((call) => call.params?.[0])).toEqual([501, 501]);
    expect(entitlements.map((call) => call.params?.[1])).toEqual([
      "vibration",
      "oil"
    ]);

    // No global "first plant/route/company" borrow anywhere in the path.
    expect(
      db.calls.some((call) =>
        /FROM plants\s+ORDER BY id ASC LIMIT 1/i.test(call.text)
      )
    ).toBe(false);
    expect(
      db.calls.some((call) => call.text.startsWith("UPDATE users"))
    ).toBe(false);
  });

  it("webhook replay is idempotent once the pending row carries ids", async () => {
    const db = provisioningDb();
    const replay: PendingCheckoutRecord = {
      ...pending,
      company_id: 501,
      admin_user_id: 801,
      plant_id: 601,
      status: "provisioned"
    };
    const before = db.calls.length;
    const result = await provisionTenantFromCheckout(db, replay, {
      subscriptionId: "sub_scope_1",
      customerId: "cus_scope_1"
    });
    expect(result.alreadyProvisioned).toBe(true);
    const newCalls = db.calls.slice(before);
    expect(newCalls.some((call) => call.text.startsWith("INSERT INTO companies"))).toBe(
      false
    );
    expect(
      newCalls.some((call) => call.text.startsWith("INSERT INTO tenant_entitlements"))
    ).toBe(false);
  });
});

describe("Stripe mock guard — impossible to activate in production", () => {
  it("test mode is strict: NODE_ENV=test, or the explicit flag in a non-prod boot", () => {
    expect(isStripeTestMode({ NODE_ENV: "test" })).toBe(true);
    expect(isStripeTestMode({ NODE_ENV: "development" })).toBe(false);
    expect(
      isStripeTestMode({ NODE_ENV: "development", STRIPE_TEST_MODE: "true" })
    ).toBe(true);
    expect(
      isStripeTestMode({ NODE_ENV: "production", STRIPE_TEST_MODE: "true" })
    ).toBe(false);
  });

  it("production boot refuses STRIPE_TEST_MODE (fail-loud, DATABASE_URL-guard family)", () => {
    expect(() =>
      assertProductionStripeMode({
        NODE_ENV: "production",
        STRIPE_TEST_MODE: "true"
      })
    ).toThrow(/refusing to start in production/i);
    expect(() =>
      assertProductionStripeMode({ NODE_ENV: "production" })
    ).not.toThrow();
    expect(serverSource).toContain("assertProductionStripeMode(process.env)");
  });

  it("a forged unsigned webhook is rejected when the bypass is not in test mode", () => {
    const forged = {
      id: "evt_forged",
      type: "checkout.session.completed",
      data: { object: { id: "cs_forged", subscription: "sub_forged" } }
    };
    expect(() =>
      resolveStripeWebhookEvent({
        isTestMode: false,
        rawBody: Buffer.from("{}"),
        signature: undefined,
        secret: "whsec_real",
        parsedBody: forged,
        constructEvent: () => forged
      })
    ).toThrow(/signature/i);

    expect(() =>
      resolveStripeWebhookEvent({
        isTestMode: false,
        rawBody: Buffer.from("{}"),
        signature: "t=1,v1=deadbeef",
        secret: undefined,
        parsedBody: forged,
        constructEvent: () => forged
      })
    ).toThrow(/STRIPE_WEBHOOK_SECRET/);

    // The only path that accepts the raw body is the guarded test mode.
    expect(
      resolveStripeWebhookEvent({
        isTestMode: true,
        rawBody: undefined,
        signature: undefined,
        secret: undefined,
        parsedBody: forged,
        constructEvent: () => {
          throw new Error("constructEvent must not run");
        }
      })
    ).toBe(forged);
  });

  it("server webhook goes through the guarded resolver (no ad-hoc bypass)", () => {
    expect(serverSource).toContain("resolveStripeWebhookEvent({");
    expect(serverSource).toContain("isStripeTestMode(process.env)");
  });
});

describe("E3 — checkout/webhook do not read a client company id", () => {
  const start = serverSource.indexOf("/* STOREFRONT (E3/E4)");
  const end = serverSource.indexOf("// STRIPE PAYMENT INTEGRATION ENDPOINTS");
  const storefrontSlice = serverSource.slice(start, end);

  it("the public storefront slice is present", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("checkout/webhook/entitlement code never reads company_id from req/body/query", () => {
    expect(storefrontSlice).not.toMatch(/req\.query\.company_id/);
    expect(storefrontSlice).not.toMatch(/req\.body\.company_id/);
    expect(storefrontSlice).not.toMatch(/body\.company_id/);
  });
});
