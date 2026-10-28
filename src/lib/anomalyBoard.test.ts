import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildAnomalyBoard,
  computeRiskIndex,
  daysOpen,
  type AnomalyBoardSourceRow
} from "./anomalyBoard";

const serverSource = readFileSync(
  fileURLToPath(new URL("../../server.ts", import.meta.url)),
  "utf8"
);
const migrationSource = readFileSync(
  fileURLToPath(new URL("../../migrations/021_anomaly_board_index.sql", import.meta.url)),
  "utf8"
);

const NOW = Date.parse("2026-01-31T00:00:00.000Z");

function fixture(overrides: Partial<AnomalyBoardSourceRow>): AnomalyBoardSourceRow {
  return {
    id: "fixture",
    tenant_id: 1,
    severity: "HIGH",
    title: "Fixture anomaly",
    created_at: "2026-01-01T00:00:00.000Z",
    first_detected_at: "2026-01-01T00:00:00.000Z",
    acknowledged: false,
    analysis_type: "vibration",
    ...overrides
  };
}

const rows: AnomalyBoardSourceRow[] = [
  fixture({
    id: "a-high-old",
    tenant_id: 1,
    severity: "HIGH",
    first_detected_at: "2026-01-01T00:00:00.000Z",
    analysis_type: "vibration",
    work_order_number: 101,
    work_order_tenant_id: 1,
    work_order_status: "scheduled"
  }),
  fixture({
    id: "a-high-new",
    tenant_id: 1,
    severity: "HIGH",
    first_detected_at: "2026-01-16T00:00:00.000Z",
    analysis_type: "ultrasound",
    // Cross-tenant work order: must never be attached to tenant A's item.
    work_order_number: 202,
    work_order_tenant_id: 2,
    work_order_status: "scheduled"
  }),
  fixture({
    id: "a-medium",
    tenant_id: 1,
    severity: "MEDIUM",
    first_detected_at: "2026-01-11T00:00:00.000Z",
    analysis_type: "oil_analysis"
  }),
  fixture({
    id: "a-low",
    tenant_id: 1,
    severity: "LOW",
    first_detected_at: "2026-01-21T00:00:00.000Z",
    analysis_type: "thermography"
  }),
  fixture({
    id: "b-high",
    tenant_id: 2,
    severity: "HIGH",
    first_detected_at: "2026-01-01T00:00:00.000Z",
    analysis_type: "vibration",
    work_order_number: 303,
    work_order_tenant_id: 2
  }),
  fixture({
    id: "b-medium",
    tenant_id: 2,
    severity: "MEDIUM",
    first_detected_at: "2026-01-11T00:00:00.000Z",
    analysis_type: "oil_analysis"
  })
];

describe("ANOMALY-BOARD - tenant isolation", () => {
  it("tenant A never sees tenant B's anomalies on the new endpoint", () => {
    const boardA = buildAnomalyBoard({ tenantId: 1, rows, now: NOW });
    const ids = boardA.items.map((item) => item.id);

    expect(ids).toEqual(
      expect.arrayContaining(["a-high-old", "a-high-new", "a-medium", "a-low"])
    );
    expect(ids).not.toContain("b-high");
    expect(ids).not.toContain("b-medium");
    expect(boardA.openCount).toBe(4);
    expect(boardA.items.every((item) => item.tenantId === 1)).toBe(true);

    // The endpoint SQL is session-scoped and never reads a tenant from query.
    const start = serverSource.indexOf('app.get("/api/anomaly-board"');
    expect(start).toBeGreaterThan(-1);
    const end = serverSource.indexOf('app.post("/api/acknowledge-alert/:id"', start);
    const handler = serverSource.slice(start, end);
    expect(handler).toContain("req.tenantId");
    expect(handler).toContain("al.tenant_id = $1");
    expect(handler).not.toMatch(/req\.query/);
  });

  it("tenant B only receives its own rows", () => {
    const boardB = buildAnomalyBoard({ tenantId: 2, rows, now: NOW });
    expect(boardB.items.map((item) => item.id).sort()).toEqual([
      "b-high",
      "b-medium"
    ]);
    expect(boardB.openCount).toBe(2);
  });
});

describe("ANOMALY-BOARD - severity buckets", () => {
  it("matches the hand-computed fixture", () => {
    const board = buildAnomalyBoard({ tenantId: 1, rows, now: NOW });
    expect(board.counts).toEqual({ HIGH: 2, MEDIUM: 1, LOW: 1 });

    // Real stored vocabulary is HIGH/MEDIUM/LOW; the labels are not invented.
    expect(new Set(board.items.map((item) => item.severity))).toEqual(
      new Set(["HIGH", "MEDIUM", "LOW"])
    );
  });
});

describe("ANOMALY-BOARD - days-open and risk-index formula", () => {
  it("uses floor((now - first_detected_at) / 86400000)", () => {
    expect(daysOpen("2026-01-01T00:00:00.000Z", NOW)).toBe(30);
    // A partial 31st day still floors to 30.
    expect(daysOpen("2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z")).toBe(30);
    // Future/clock-skew timestamps never produce negative age.
    expect(daysOpen("2026-02-01T00:00:00.000Z", NOW)).toBe(0);
  });

  it("prices every real severity with the documented weights", () => {
    expect(computeRiskIndex("CRITICAL", 30)).toBe(300);
    expect(computeRiskIndex("HIGH", 30)).toBe(150);
    expect(computeRiskIndex("MEDIUM", 30)).toBe(90);
    expect(computeRiskIndex("LOW", 30)).toBe(60);
    expect(computeRiskIndex("ANOMALY", 30)).toBe(30);
    expect(computeRiskIndex("WARNING", 30)).toBe(30);
  });

  it("aggregates the fixture risk exactly", () => {
    const board = buildAnomalyBoard({ tenantId: 1, rows, now: NOW });
    const byId = new Map(board.items.map((item) => [item.id, item]));

    expect(byId.get("a-high-old")?.daysOpen).toBe(30);
    expect(byId.get("a-high-old")?.riskIndex).toBe(150);
    expect(byId.get("a-high-new")?.daysOpen).toBe(15);
    expect(byId.get("a-high-new")?.riskIndex).toBe(75);
    expect(byId.get("a-medium")?.daysOpen).toBe(20);
    expect(byId.get("a-medium")?.riskIndex).toBe(60);
    expect(byId.get("a-low")?.daysOpen).toBe(10);
    expect(byId.get("a-low")?.riskIndex).toBe(20);
    expect(board.totalRiskIndex).toBe(305);
    expect(board.oldestOpen?.id).toBe("a-high-old");
  });
});

describe("ANOMALY-BOARD - honest empty state", () => {
  it("returns the empty board, not fabricated counts", () => {
    const board = buildAnomalyBoard({ tenantId: 1, rows: [], now: NOW });
    expect(board.empty).toBe(true);
    expect(board.openCount).toBe(0);
    expect(board.items).toEqual([]);
    expect(board.oldestOpen).toBeNull();
    expect(board.totalRiskIndex).toBe(0);
    expect(board.counts).toEqual({ HIGH: 0, MEDIUM: 0, LOW: 0 });
  });

  it("treats a missing session tenant as empty", () => {
    const board = buildAnomalyBoard({ tenantId: null, rows, now: NOW });
    expect(board.empty).toBe(true);
    expect(board.tenantId).toBe(-1);
    expect(board.items).toEqual([]);
  });
});

describe("ANOMALY-BOARD - same-tenant work orders", () => {
  it("links a work order only when the same tenant is proven", () => {
    const boardA = buildAnomalyBoard({ tenantId: 1, rows, now: NOW });
    const byId = new Map(boardA.items.map((item) => [item.id, item]));

    expect(byId.get("a-high-old")?.workOrderNumber).toBe(101);
    expect(byId.get("a-high-old")?.workOrderStatus).toBe("scheduled");
    // The 202 work order belongs to tenant 2; tenant A must not see it.
    expect(byId.get("a-high-new")?.workOrderNumber).toBeNull();
    expect(byId.get("a-medium")?.workOrderNumber).toBeNull();

    const boardB = buildAnomalyBoard({ tenantId: 2, rows, now: NOW });
    const bHigh = boardB.items.find((item) => item.id === "b-high");
    expect(bHigh?.workOrderNumber).toBe(303);
  });
});

describe("ANOMALY-BOARD - DEP-1 index mirror", () => {
  it("migration 021 and initializeDatabase share an idempotent index", () => {
    expect(migrationSource).toContain(
      "CREATE INDEX IF NOT EXISTS idx_alerts_tenant_ack_severity"
    );
    expect(serverSource).toContain(
      "CREATE INDEX IF NOT EXISTS idx_alerts_tenant_ack_severity"
    );
  });
});
