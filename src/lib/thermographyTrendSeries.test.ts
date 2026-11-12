import { describe, expect, it } from "vitest";
import type { SavedAnalysisResult } from "./analysisPersistence";
import {
  SAME_DATE_SNAPSHOT_SPAN_MS,
  buildThermoChartSeries,
  planThermoTrendAxis
} from "./thermographyTrendSeries";
import {
  filterTrendByTimeRange,
  windowTrendByTimeRange
} from "./vibration/trendSeries";

function thermoRow(
  iso: string,
  hotspot: number | null = 84.2,
  tempUnit: "°C" | "°F" = "°F"
): SavedAnalysisResult {
  return {
    id: iso,
    asset_id: "asset-1",
    component: null,
    timestamp: iso,
    health_score: 80,
    primary_fault: "Loose connection",
    fault_list: [],
    peaks: [
      {
        type: "thermography",
        hotspot_temp: hotspot,
        reference_temp: 72,
        delta_t: 12.2,
        severity_class: "Class 2"
      }
    ],
    spectrum_image_url: null,
    recommendations: [],
    financial_impact: {},
    severity: "MEDIUM",
    analysis_type: "thermography",
    telemetry_data: { environmental: { temp_unit: tempUnit } }
  };
}

function localIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): string {
  return new Date(year, month, day, hour, minute).toISOString();
}

describe("SLICE-VS7 same-date IR axis determinism", () => {
  it("labels two runs on one date deterministically and refuses a fabricated slope", () => {
    const series = buildThermoChartSeries([
      thermoRow(localIso(2026, 9, 30, 16, 34)),
      thermoRow(localIso(2026, 9, 30, 16, 33))
    ]);
    expect(series.map((point) => point.time)).toEqual(["16:33", "16:34"]);
    expect(series.map((point) => point.dateLabel)).toEqual([
      "Oct 30 · 1",
      "Oct 30 · 2"
    ]);
    expect(series.map((point) => point.sequence)).toEqual([1, 2]);

    const plan = planThermoTrendAxis(series);
    expect(plan.sameDate).toBe(true);
    expect(plan.dataKey).toBe("dateLabel");
    expect(plan.snapshot).toBe(true);
    expect(plan.spanMs).toBe(60_000);
    expect(plan.spanMs).toBeLessThan(SAME_DATE_SNAPSHOT_SPAN_MS);
  });

  it("keeps a same-date trend when the runs are far enough apart", () => {
    const series = buildThermoChartSeries([
      thermoRow(localIso(2026, 9, 30, 21, 0)),
      thermoRow(localIso(2026, 9, 30, 8, 0))
    ]);
    const plan = planThermoTrendAxis(series);
    expect(plan.dataKey).toBe("dateLabel");
    expect(plan.snapshot).toBe(false);
    expect(plan.spanMs).toBe(13 * 60 * 60 * 1000);
  });

  it("keeps calendar DATE when every run is on a different date", () => {
    const series = buildThermoChartSeries([
      thermoRow(localIso(2026, 9, 30, 8, 0)),
      thermoRow(localIso(2026, 8, 15, 8, 0))
    ]);
    const plan = planThermoTrendAxis(series);
    expect(plan.sameDate).toBe(false);
    expect(plan.dataKey).toBe("date");
    expect(plan.snapshot).toBe(false);
    expect(series.map((point) => point.dateLabel)).toEqual(["Sep 15", "Oct 30"]);
  });

  it("uses per-date sequence labels when duplicates exist across dates", () => {
    const series = buildThermoChartSeries([
      thermoRow(localIso(2026, 9, 30, 16, 34)),
      thermoRow(localIso(2026, 9, 30, 16, 33)),
      thermoRow(localIso(2026, 8, 15, 8, 0))
    ]);
    const plan = planThermoTrendAxis(series);
    expect(plan.sameDate).toBe(true);
    expect(plan.dataKey).toBe("dateLabel");
    expect(plan.snapshot).toBe(false);
    expect(series.map((point) => point.dateLabel)).toEqual([
      "Sep 15",
      "Oct 30 · 1",
      "Oct 30 · 2"
    ]);
    expect(series[2].dateTime).toContain("16:34");
  });

  it("breaks equal timestamps deterministically by created_at then id", () => {
    const iso = localIso(2026, 9, 30, 16, 33);
    const first = { ...thermoRow(iso, 111), id: "b" };
    const second = { ...thermoRow(iso, 222), id: "a" };
    // Same timestamp, same (absent) created_at -> id "a" precedes "b".
    const byId = buildThermoChartSeries([first, second]);
    expect(byId.map((point) => point.hotspot)).toEqual([222, 111]);

    const earlyCreated = {
      ...thermoRow(iso, 333),
      id: "z",
      created_at: "2026-09-30T16:32:00.000Z"
    };
    const lateCreated = {
      ...thermoRow(iso, 444),
      id: "a",
      created_at: "2026-09-30T16:34:00.000Z"
    };
    // created_at wins before id when timestamps are equal.
    const byCreated = buildThermoChartSeries([lateCreated, earlyCreated]);
    expect(byCreated.map((point) => point.hotspot)).toEqual([333, 444]);
  });
});

describe("SLICE-U IR chart shares slice N's window predicate", () => {
  it("windowTrendByTimeRange is the same predicate, not a fork", () => {
    const now = Date.parse("2026-10-30T12:00:00.000Z");
    const rows = [
      thermoRow("2026-10-29T00:00:00.000Z"),
      thermoRow("2026-09-01T00:00:00.000Z"),
      thermoRow("2026-01-01T00:00:00.000Z")
    ];
    for (const range of ["7D", "30D", "90D", "1Y", "Custom"] as const) {
      expect(windowTrendByTimeRange(rows, range, now)).toEqual(
        filterTrendByTimeRange(rows, range, now)
      );
    }
    expect(windowTrendByTimeRange(rows, "30D", now).map((r) => r.id)).toEqual([
      "2026-10-29T00:00:00.000Z"
    ]);
  });
});
