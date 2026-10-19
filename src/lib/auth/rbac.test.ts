import { describe, it, expect } from "vitest";
import { normalizeRole, roleAtLeast, roleHasPermission } from "./rbac";

describe("AR-29 role normalization (legacy → structured)", () => {
  it("maps legacy role strings onto the structured set", () => {
    expect(normalizeRole("engineer")).toBe("plant-engineer");
    expect(normalizeRole("manager")).toBe("reliability-manager");
    expect(normalizeRole("admin")).toBe("system-admin");
    expect(normalizeRole("sysadmin")).toBe("system-admin");
    expect(normalizeRole("reliability")).toBe("reliability-manager");
  });

  it("passes structured roles through unchanged", () => {
    expect(normalizeRole("plant-engineer")).toBe("plant-engineer");
    expect(normalizeRole("reliability-manager")).toBe("reliability-manager");
    expect(normalizeRole("system-admin")).toBe("system-admin");
  });

  it("is case/whitespace tolerant", () => {
    expect(normalizeRole("  ENGINEER ")).toBe("plant-engineer");
    expect(normalizeRole("Admin")).toBe("system-admin");
  });

  it("falls back to least privilege for unknown/missing roles", () => {
    expect(normalizeRole("hacker")).toBe("plant-engineer");
    expect(normalizeRole(undefined)).toBe("plant-engineer");
    expect(normalizeRole(null)).toBe("plant-engineer");
    expect(normalizeRole(42)).toBe("plant-engineer");
  });
});

describe("AR-29 RBAC permissions", () => {
  it("plant-engineers cannot invite users or manage tenants", () => {
    expect(roleHasPermission("plant-engineer", "users:invite")).toBe(false);
    expect(roleHasPermission("plant-engineer", "tenants:manage")).toBe(false);
    expect(roleHasPermission("plant-engineer", "diagnostics:run")).toBe(true);
    expect(roleHasPermission("plant-engineer", "assets:read")).toBe(true);
  });

  it("reliability-managers can write reports and invite users", () => {
    expect(roleHasPermission("reliability-manager", "reports:write")).toBe(true);
    expect(roleHasPermission("reliability-manager", "workorders:write")).toBe(true);
    expect(roleHasPermission("reliability-manager", "users:invite")).toBe(true);
    expect(roleHasPermission("reliability-manager", "tenants:manage")).toBe(false);
  });

  it("system-admins hold every management permission", () => {
    expect(roleHasPermission("system-admin", "users:manage")).toBe(true);
    expect(roleHasPermission("system-admin", "tenants:manage")).toBe(true);
    expect(roleHasPermission("system-admin", "system:admin")).toBe(true);
  });

  it("unknown permissions deny for every role", () => {
    expect(roleHasPermission("system-admin", "nope:never")).toBe(false);
    expect(roleHasPermission("plant-engineer", "nope:never")).toBe(false);
  });

  it("roleAtLeast compares by hierarchy", () => {
    expect(roleAtLeast("reliability-manager", "plant-engineer")).toBe(true);
    expect(roleAtLeast("plant-engineer", "reliability-manager")).toBe(false);
    expect(roleAtLeast("system-admin", "system-admin")).toBe(true);
    expect(roleAtLeast("plant-engineer", "system-admin")).toBe(false);
  });
});
