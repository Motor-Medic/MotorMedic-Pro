// @vitest-environment jsdom
/**
 * SLICE-MCA-VISION v2 — six fault-zone surface render contract.
 *
 * The matrix reads ONLY the stored grouped-bar record. These DOM contracts
 * prove the rendered text carries the fixture values, the provenance, and the
 * axis-read disclosure — and that unreadable cells render "not extracted"
 * instead of a fabricated number.
 */
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import McaSixFaultZoneMatrix from "./McaSixFaultZoneMatrix";
import {
  parseMcaBarChart,
  type McaBarChartAxis,
  type McaBarChartRecord
} from "../../lib/mca/mcaBarChart";
import {
  MCA_BAR_CHART_AXES,
  MCA_BAR_CHART_TRUTH,
  MCA_GROUPED_BAR_VISION_FIXTURE
} from "../../test/harness/fixtures/mcaGroupedBarFixture";

afterEach(cleanup);

function goodRecord(): McaBarChartRecord {
  const rec = parseMcaBarChart(MCA_GROUPED_BAR_VISION_FIXTURE.mca_bar_chart);
  if (!rec) throw new Error("fixture did not produce a bar-chart record");
  return rec;
}

describe("McaSixFaultZoneMatrix — stored values only", () => {
  it("renders all six fault-zone surfaces from the stored record", () => {
    render(<McaSixFaultZoneMatrix barChart={goodRecord()} />);

    expect(screen.getByText(/Fault Zone 1 — Impedance \(Z\) balance/)).toBeTruthy();
    expect(screen.getByText(/Fault Zone 2 — Inductance \(L\) balance/)).toBeTruthy();
    expect(screen.getByText(/Fault Zone 3 — Phase-angle signature/)).toBeTruthy();
    expect(screen.getByText(/Fault Zone 4 — Relative-capacitance signature/)).toBeTruthy();
    expect(screen.getByText(/Fault Zone 5 — Rotor 0° column/)).toBeTruthy();
    expect(screen.getByText(/Fault Zone 6 — Rotor 90° column/)).toBeTruthy();

    // Per-metric rotor-0 columns (exact fixture values, units included).
    expect(screen.getByText(`${MCA_BAR_CHART_TRUTH.z0[0]} Ω`)).toBeTruthy();
    expect(screen.getByText(`${MCA_BAR_CHART_TRUTH.l0[0]} mH`)).toBeTruthy();
    expect(screen.getByText(`${MCA_BAR_CHART_TRUTH.angle0[0]} °`)).toBeTruthy();
    expect(screen.getByText(`${MCA_BAR_CHART_TRUTH.c0[0]} rel`)).toBeTruthy();

    // Full rotor-0 and rotor-90 columns (scoped to their own rows).
    const rotor0Row = screen.getByText(/Fault Zone 5 — Rotor 0° column/).closest("tr");
    const rotor90Row = screen.getByText(/Fault Zone 6 — Rotor 90° column/).closest("tr");
    expect(rotor0Row).toBeTruthy();
    expect(rotor90Row).toBeTruthy();
    const rotor0A = within(rotor0Row as HTMLElement).getByText(
      `${MCA_BAR_CHART_TRUTH.z0[0]} Ω · ${MCA_BAR_CHART_TRUTH.l0[0]} mH · ${MCA_BAR_CHART_TRUTH.angle0[0]} ° · ${MCA_BAR_CHART_TRUTH.c0[0]} rel`
    );
    const rotor90B = within(rotor90Row as HTMLElement).getByText(
      `${MCA_BAR_CHART_TRUTH.z90[1]} Ω · ${MCA_BAR_CHART_TRUTH.l90[1]} mH · ${MCA_BAR_CHART_TRUTH.angle90[1]} ° · ${MCA_BAR_CHART_TRUTH.c90[1]} rel`
    );
    expect(rotor0A).toBeTruthy();
    expect(rotor90B).toBeTruthy();

    // Descriptive zones carry no invented severity class.
    expect(screen.getByText(/2\.79% · Class 3 — Minor/)).toBeTruthy();
    expect(screen.getByText(/3\.3% · Class 3 — Minor/)).toBeTruthy();
    expect(screen.getAllByText(/descriptive only/).length).toBe(2);
  });

  it("renders the provenance and the axis-read tolerance disclosure", () => {
    render(<McaSixFaultZoneMatrix barChart={goodRecord()} />);

    expect(
      screen.getByText(/vision-extracted from uploaded report \(bar chart\)/)
    ).toBeTruthy();
    expect(screen.getByText(/Axis-read tolerance: half the printed minor division/)).toBeTruthy();
    expect(screen.getByText(/±0\.25 Ω/)).toBeTruthy();
    expect(screen.getByText(/±0\.05 mH/)).toBeTruthy();
    expect(screen.getByText(/±1 °/)).toBeTruthy();
    expect(screen.getByText(/±0\.025 rel/)).toBeTruthy();
    expect(screen.getByText(/never interpolated between bars/)).toBeTruthy();
    expect(screen.getByText(/Only stored, axis-read values are shown/)).toBeTruthy();
  });

  it("renders an honest empty state when no bar chart is stored", () => {
    render(<McaSixFaultZoneMatrix barChart={null} />);

    expect(
      screen.getByText(/No grouped-bar MCA data stored for this run — not extracted/)
    ).toBeTruthy();
    expect(screen.queryByText(/Fault Zone 1/)).toBeNull();
    // No fixture number leaks into the empty state.
    expect(screen.queryByText(/4\.17 Ω/)).toBeNull();
  });

  it("renders 'not extracted' for an unreadable cell instead of a number", () => {
    const raw = MCA_GROUPED_BAR_VISION_FIXTURE.mca_bar_chart as unknown as Record<string, unknown>;
    const axes = raw.axes as Record<string, McaBarChartAxis>;
    const series = (raw.series as Record<string, unknown>[]).map((s) =>
      s.phase === "A" && s.rotor_deg === 0
        ? { ...s, z_ohm: { value: null, status: "absent", confidence: null } }
        : s
    );
    const partial = parseMcaBarChart({ axes, series });
    if (!partial) throw new Error("partial fixture did not produce a record");

    render(<McaSixFaultZoneMatrix barChart={partial} />);

    // Zone 1 phase A had no readable Z -> "not extracted"; B and C keep values.
    const notExtracted = screen.getAllByText("not extracted");
    expect(notExtracted.length).toBeGreaterThan(0);
    // B and C keep their stored Z at rotor 0°.
    expect(screen.getAllByText(`${MCA_BAR_CHART_TRUTH.z0[1]} Ω`)).toHaveLength(2);
    // The rotor-0 column still shows the other three metrics for phase A.
    expect(
      screen.getByText(
        `${MCA_BAR_CHART_TRUTH.l0[0]} mH · ${MCA_BAR_CHART_TRUTH.angle0[0]} ° · ${MCA_BAR_CHART_TRUTH.c0[0]} rel`
      )
    ).toBeTruthy();
    expect(MCA_BAR_CHART_AXES.z_ohm.max).toBe(5);
  });
});
