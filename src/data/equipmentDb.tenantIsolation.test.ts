import { afterEach, describe, expect, it } from "vitest";
import {
  clearCurrentTenantCache,
  getEquipmentData,
  getEquipmentStore,
  getEquipmentTenantId,
  purgeLegacyBareEquipmentKeys,
  saveEquipmentStore,
  setEquipmentTenantId,
  type EquipmentStore
} from "./equipmentDb";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

afterEach(() => {
  setEquipmentTenantId(null);
  if (originalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalStorage);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});

function installStorage(): Map<string, string> {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }
  });
  return storage;
}

const tenantAStore: EquipmentStore = {
  plants: [],
  units: [],
  routes: [
    {
      id: "route-a",
      name: "Tenant A Route",
      location: "Site A",
      assets: [
        {
          id: "asset-a",
          tag: "A-1",
          name: "Tenant A Asset",
          location: "Site A",
          components: []
        }
      ]
    }
  ]
};

const tenantBStore: EquipmentStore = {
  plants: [],
  units: [],
  routes: [
    {
      id: "route-b",
      name: "Tenant B Route",
      location: "Site B",
      assets: [
        {
          id: "asset-b",
          tag: "B-1",
          name: "Tenant B Asset",
          location: "Site B",
          components: []
        }
      ]
    }
  ]
};

describe("SLICE-SEC-11 equipment cache tenant isolation", () => {
  it("namespaces cache keys by authenticated tenant id", () => {
    installStorage();
    setEquipmentTenantId(1);
    saveEquipmentStore(tenantAStore);
    expect(getEquipmentTenantId()).toBe(1);
    // Key is namespaced, never bare.
    expect(
      (globalThis.localStorage as Storage).getItem("motormedic_equipment")
    ).toBeNull();
    expect(
      (globalThis.localStorage as Storage).getItem("mm:1:motormedic_equipment")
    ).not.toBeNull();
  });

  it("tenant A's cached assets are unreadable under tenant B's session", () => {
    installStorage();
    setEquipmentTenantId(1);
    saveEquipmentStore(tenantAStore);

    setEquipmentTenantId(2);
    expect(getEquipmentData().length).toBe(0);
    expect(getEquipmentStore().routes.length).toBe(0);
  });

  it("same-tenant cache still hits (no performance regression)", () => {
    installStorage();
    setEquipmentTenantId(1);
    saveEquipmentStore(tenantAStore);

    setEquipmentTenantId(1);
    const routes = getEquipmentData();
    expect(routes.length).toBe(1);
    expect(routes[0]?.assets[0]?.tag).toBe("A-1");
  });

  it("logout clears only the current tenant's keys, never other tenants'", () => {
    installStorage();
    setEquipmentTenantId(1);
    saveEquipmentStore(tenantAStore);
    setEquipmentTenantId(2);
    saveEquipmentStore(tenantBStore);

    // Simulate logout of tenant A: clear only A's namespaced keys.
    setEquipmentTenantId(1);
    clearCurrentTenantCache();

    // A's key is gone.
    expect(
      (globalThis.localStorage as Storage).getItem("mm:1:motormedic_equipment")
    ).toBeNull();
    // B's keys are untouched (never destroy data you don't own).
    expect(
      (globalThis.localStorage as Storage).getItem("mm:2:motormedic_equipment")
    ).not.toBeNull();
    expect(getEquipmentData().length).toBe(0);
  });

  it("logout then login as B shows no A data", () => {
    installStorage();
    setEquipmentTenantId(1);
    saveEquipmentStore(tenantAStore);

    // Logout A: clear A's tenant cache.
    setEquipmentTenantId(1);
    clearCurrentTenantCache();

    // Login as B.
    setEquipmentTenantId(2);
    expect(getEquipmentData().length).toBe(0);
    expect(getEquipmentStore().routes.length).toBe(0);
  });
});

describe("SLICE-SEC-13 legacy bare-key cleanup", () => {
  it("deletes the two legacy bare keys on first run without copying contents into a tenant namespace", () => {
    installStorage();
    (globalThis.localStorage as Storage).setItem(
      "motormedic_equipment",
      JSON.stringify({ routes: [{ id: "r", name: "legacy" }] })
    );
    (globalThis.localStorage as Storage).setItem(
      "motormedic_active_db_selection",
      JSON.stringify({ nodeId: "legacy-node" })
    );

    purgeLegacyBareEquipmentKeys();

    expect(
      (globalThis.localStorage as Storage).getItem("motormedic_equipment")
    ).toBeNull();
    expect(
      (globalThis.localStorage as Storage).getItem("motormedic_active_db_selection")
    ).toBeNull();
    // Purge recorded so it does not repeat on subsequent runs.
    expect(
      (globalThis.localStorage as Storage).getItem("motormedic_legacy_cache_purge_v1")
    ).toBe("1");
  });

  it("leaves namespaced tenant keys untouched by cleanup", () => {
    installStorage();
    (globalThis.localStorage as Storage).setItem(
      "mm:1:motormedic_equipment",
      JSON.stringify(tenantAStore)
    );
    (globalThis.localStorage as Storage).setItem(
      "mm:2:motormedic_equipment",
      JSON.stringify(tenantBStore)
    );
    (globalThis.localStorage as Storage).setItem("motormedic_equipment", "stale-bare");

    purgeLegacyBareEquipmentKeys();

    expect(
      (globalThis.localStorage as Storage).getItem("mm:1:motormedic_equipment")
    ).not.toBeNull();
    expect(
      (globalThis.localStorage as Storage).getItem("mm:2:motormedic_equipment")
    ).not.toBeNull();
    expect((globalThis.localStorage as Storage).getItem("motormedic_equipment")).toBeNull();
  });

  it("purges at most once; a bare key reintroduced after the flag is set is left alone", () => {
    installStorage();
    (globalThis.localStorage as Storage).setItem("motormedic_equipment", "stale");
    purgeLegacyBareEquipmentKeys();
    expect(
      (globalThis.localStorage as Storage).getItem("motormedic_equipment")
    ).toBeNull();

    (globalThis.localStorage as Storage).setItem("motormedic_equipment", "stale-again");
    purgeLegacyBareEquipmentKeys();
    expect(
      (globalThis.localStorage as Storage).getItem("motormedic_equipment")
    ).toBe("stale-again");
  });
});
