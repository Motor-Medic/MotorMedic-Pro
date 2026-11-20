/**
 * SLICE-SEC-BASELINE-1 — tenant isolation negative tests for the oil
 * analysis persistence query layer.
 *
 * Every query reading or writing tenant-owned rows must be scoped by tenant
 * id at the QUERY layer, not the caller. These tests verify that tenant A
 * cannot read tenant B's samples, and that a missing or mismatched tenant
 * returns empty, never another tenant's row.
 *
 * The `query` function from db.ts is mocked so no real database is needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { QueryResult } from "pg";

vi.mock("./db", () => ({
  query: vi.fn(),
  isDbConfigured: vi.fn(() => true)
}));

import { query } from "./db";
import {
  fetchOilSamplesForAsset,
  saveOilSample,
  getOrCreateOilAnalysisId,
  TenantRequiredError,
  type SaveOilSampleInput
} from "./oilAnalysisPersistence";

const mockedQuery = vi.mocked(query);

const baseInput: SaveOilSampleInput = {
  assetId: "asset-z",
  sampleDate: "2026-01-01",
  operatingHours: 100,
  iron: 10,
  copper: 5
};

function mockRows(rows: unknown[]): QueryResult {
  return {
    rows,
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: []
  } as QueryResult;
}

beforeEach(() => {
  mockedQuery.mockClear();
  mockedQuery.mockResolvedValue(mockRows([]));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function lastCallSql(): string {
  return mockedQuery.mock.calls[mockedQuery.mock.calls.length - 1]?.[0] as string;
}

function lastCallParams(): unknown[] {
  return mockedQuery.mock.calls[mockedQuery.mock.calls.length - 1]?.[1] as unknown[];
}

describe("getOrCreateOilAnalysisId — SELECT is always tenant-scoped", () => {
  it("issues a tenant-scoped SELECT (no null-tenant bypass)", async () => {
    mockedQuery.mockResolvedValueOnce(mockRows([{ id: "oa-2" }]));
    const id = await getOrCreateOilAnalysisId("asset-y", 7);
    expect(id).toBe("oa-2");
    const sql = mockedQuery.mock.calls[0]?.[0] as string;
    const params = mockedQuery.mock.calls[0]?.[1] as unknown[];
    expect(sql).toContain("AND tenant_id = $2");
    expect(params[1]).toBe(7);
  });

  it("rejects a null tenant and performs no INSERT (no orphan write)", async () => {
    // null tenant is rejected at the write gate; findOilAnalysisId is never
    // called and no INSERT is issued.
    await expect(
      getOrCreateOilAnalysisId("asset-x", null as unknown as number)
    ).rejects.toBeInstanceOf(TenantRequiredError);
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});

describe("fetchOilSamplesForAsset — tenant-scoped read", () => {
  it("returns empty for a tenant that owns no samples (never another tenant's rows)", async () => {
    mockedQuery.mockResolvedValueOnce(mockRows([{ id: "oa-3" }])); // find: found
    mockedQuery.mockResolvedValue(mockRows([])); // fetch samples: empty
    const result = await fetchOilSamplesForAsset("asset-b", 1);
    expect(result.samples).toEqual([]);
    const fetchSql = mockedQuery.mock.calls[1]?.[0] as string;
    const fetchParams = mockedQuery.mock.calls[1]?.[1] as unknown[];
    expect(fetchSql).toContain("AND tenant_id = $2");
    expect(fetchParams[1]).toBe(1); // tenant A's id, not B's
  });

  it("missing tenant yields empty result without any query (no orphan write)", async () => {
    // Fail-closed read: null tenant returns empty and never touches the DB.
    const result = await fetchOilSamplesForAsset("asset-any", null);
    expect(result.samples).toEqual([]);
    expect(result.analysisId).toBeNull();
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});

describe("saveOilSample — tenant-scoped write", () => {
  it("inserts the sample with the caller's tenant_id", async () => {
    // find (not found) → insert analysis → check existing → insert sample
    mockedQuery.mockResolvedValueOnce(mockRows([])); // find: not found
    mockedQuery.mockResolvedValueOnce(mockRows([{ id: "oa-4" }])); // insert analysis
    mockedQuery.mockResolvedValueOnce(mockRows([])); // existing samples check
    mockedQuery.mockResolvedValueOnce(mockRows([{ id: "sample-1" }])); // insert sample

    const result = await saveOilSample(baseInput, 3);
    expect(result.sample.id).toBe("sample-1");

    const insertSql = lastCallSql();
    const insertParams = lastCallParams();
    expect(insertSql).toContain("tenant_id");
    expect(insertParams[insertParams.length - 1]).toBe(3);
  });

  it("every tenant-facing INSERT/SELECT carries tenant_id", async () => {
    mockedQuery.mockResolvedValueOnce(mockRows([])); // find
    mockedQuery.mockResolvedValueOnce(mockRows([{ id: "oa-5" }])); // insert analysis
    mockedQuery.mockResolvedValueOnce(mockRows([])); // existing samples check
    mockedQuery.mockResolvedValueOnce(mockRows([{ id: "sample-2" }])); // insert sample

    await saveOilSample(baseInput, 9);
    // Calls 0 (find SELECT), 1 (analysis INSERT), 3 (sample INSERT) must
    // all reference tenant_id. Call 2 (existing-samples check) is scoped by
    // the already-tenant-scoped analysisId, so it's indirectly protected.
    const findSql = mockedQuery.mock.calls[0]?.[0] as string;
    const analysisInsertSql = mockedQuery.mock.calls[1]?.[0] as string;
    const sampleInsertSql = mockedQuery.mock.calls[3]?.[0] as string;
    expect(findSql).toContain("tenant_id");
    expect(analysisInsertSql).toContain("tenant_id");
    expect(sampleInsertSql).toContain("tenant_id");
  });

  it("rejects a null tenant and performs no write", async () => {
    // null tenant is rejected before any query is issued; nothing is written.
    await expect(
      saveOilSample(baseInput, null as unknown as number)
    ).rejects.toBeInstanceOf(TenantRequiredError);
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});

describe("cross-tenant read/write negative contract", () => {
  it("tenant A's query params never contain tenant B's id", async () => {
    mockedQuery.mockResolvedValueOnce(mockRows([{ id: "oa-6" }])); // find: found for tenant A
    mockedQuery.mockResolvedValue(mockRows([])); // fetch: empty
    await fetchOilSamplesForAsset("asset-b", 1);
    const allParams = mockedQuery.mock.calls.flatMap((c) => c[1] as unknown[]);
    expect(allParams).not.toContain(2); // tenant B's id must not appear
    const allSql = mockedQuery.mock.calls.map((c) => c[0] as string).join(" ");
    expect(allSql).toMatch(/tenant_id/);
  });
});
