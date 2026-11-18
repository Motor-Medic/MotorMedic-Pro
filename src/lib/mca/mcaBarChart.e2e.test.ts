/**
 * SLICE-MCA-VISION v2 — end-to-end grouped-bar contract.
 *
 * Chain under test (exactly what the app runs):
 *   finalizeMcaFromParses(parses)            // vision JSON -> MCA report data
 *   -> mcaPayloadForSave(data)               // peaks + telemetry_data
 *   -> extractMcaBarChartFromSaved(row)      // stored record re-hydration
 *   -> deriveMcaSixFaultZones(record)        // six stored-value surfaces
 *
 * Contracts:
 *  1. every fixture value survives the chain inside its disclosed axis-read
 *     tolerance (± half the printed minor division)
 *  2. provenance + tolerance disclosure are stored with the values
 *  3. a planted fabricated value (4.17 -> 4.90 Ω) must FAIL the value contract
 *  4. illegible / absent / out-of-axis / low-confidence cells stay null — no
 *     interpolation, no cross-rotor borrowing, no invented severity
 *  5. non-MCA prompts stay byte-identical to the locked MASTER_VISION_PROMPT
 */
import { describe, expect, it } from "vitest";

import { finalizeMcaFromParses, type McaReportData } from "../mcaVisionExtractor";
import {
  MCA_BAR_CHART_PROVENANCE,
  barChartReading,
  barChartTriplet,
  deriveMcaSixFaultZones,
  parseMcaBarChart,
  type McaBarChartRecord,
  type McaBarMetric
} from "./mcaBarChart";
import {
  extractMcaBarChartFromSaved,
  mcaPayloadForSave
} from "./mcaPersistence";
import type { SavedAnalysisResult } from "../analysisPersistence";
import { MASTER_VISION_PROMPT } from "../vision/masterVisionPrompt";
import {
  MCA_GROUPED_BAR_PROMPT,
  MCA_GROUPED_BAR_SECTION,
  buildVisionPromptForPurpose,
  type VisionPurpose
} from "../vision/mcaGroupedBarPrompt";
import {
  MCA_BAR_CHART_AXES,
  MCA_BAR_CHART_TRUTH,
  MCA_BAR_METRIC_TOLERANCE,
  MCA_GROUPED_BAR_VISION_FIXTURE
} from "../../test/harness/fixtures/mcaGroupedBarFixture";

/* ------------------------------------------------------------------ */
/* Chain helper                                                       */
/* ------------------------------------------------------------------ */

function runVisionChain(parsed: Record<string, unknown>) {
  const result = finalizeMcaFromParses(
    [{ model: "contract-model", parsed }],
    null,
    { imageBase64: "data:image/png;base64,AAAA", fileName: "mca-bars.png" }
  );
  expect(result.success, result.detail ?? result.message).toBe(true);
  const data = result.data as McaReportData;
  expect(data.barChart).toBeTruthy();
  return data;
}

function persistAndReload(data: McaReportData): McaBarChartRecord {
  const payload = mcaPayloadForSave(data);
  const row = {
    id: "contract-run",
    peaks: payload.peaks,
    telemetry_data: payload.telemetry_data
  } as unknown as SavedAnalysisResult;
  const record = extractMcaBarChartFromSaved(row);
  expect(record).toBeTruthy();
  return record as McaBarChartRecord;
}

/** Assertion contract for one phase triplet — the mutation test reuses it. */
function expectTripletWithin(
  actual: [number | null, number | null, number | null],
  truth: readonly [number, number, number],
  tolerance: number
): void {
  actual.forEach((value, i) => {
    expect(value, `phase index ${i}: ${String(value)} vs ${truth[i]}`).not.toBeNull();
    expect(Math.abs((value as number) - truth[i])).toBeLessThanOrEqual(tolerance);
  });
}

const METRIC_TRUTH: Record<McaBarMetric, { truth: readonly [number, number, number]; tol: number }> = {
  z_ohm: { truth: MCA_BAR_CHART_TRUTH.z0, tol: MCA_BAR_METRIC_TOLERANCE.z_ohm },
  l_mh: { truth: MCA_BAR_CHART_TRUTH.l0, tol: MCA_BAR_METRIC_TOLERANCE.l_mh },
  angle_deg: { truth: MCA_BAR_CHART_TRUTH.angle0, tol: MCA_BAR_METRIC_TOLERANCE.angle_deg },
  c_rel: { truth: MCA_BAR_CHART_TRUTH.c0, tol: MCA_BAR_METRIC_TOLERANCE.c_rel }
};

/* ------------------------------------------------------------------ */
/* 1 + 2 + 3: extraction -> storage -> six zones                      */
/* ------------------------------------------------------------------ */

describe("grouped-bar MCA e2e — extraction, storage, surfaces", () => {
  it("populates the six fault zones from stored values only", () => {
    const data = runVisionChain(MCA_GROUPED_BAR_VISION_FIXTURE);
    const record = persistAndReload(data);
    const zones = deriveMcaSixFaultZones(record);

    expect(zones.map((z) => z.id)).toEqual([
      "zone-z-0",
      "zone-l-0",
      "zone-angle-0",
      "zone-c-0",
      "zone-rotor-0",
      "zone-rotor-90"
    ]);
    expect(zones).toHaveLength(6);

    // Zone 1-4: rotor-0 per-metric balance columns.
    for (const zone of zones.slice(0, 4)) {
      const metric = (
        {
          "zone-z-0": "z_ohm",
          "zone-l-0": "l_mh",
          "zone-angle-0": "angle_deg",
          "zone-c-0": "c_rel"
        } as const
      )[zone.id as "zone-z-0" | "zone-l-0" | "zone-angle-0" | "zone-c-0"];
      const { truth, tol } = METRIC_TRUTH[metric];
      zone.cells.forEach((cell, i) => {
        expect(cell.phase).toBe(["A", "B", "C"][i]);
        expect(cell.values[metric]).not.toBeNull();
        expect(Math.abs((cell.values[metric] as number) - truth[i])).toBeLessThanOrEqual(tol);
      });
    }

    // Zone 5/6: full rotor columns from the stored record.
    const rotor0 = zones[4];
    const rotor90 = zones[5];
    expect(rotor0.rotor_deg).toBe(0);
    expect(rotor90.rotor_deg).toBe(90);
    expect(rotor0.cells.map((c) => c.values.z_ohm)).toEqual(MCA_BAR_CHART_TRUTH.z0);
    expect(rotor0.cells.map((c) => c.values.c_rel)).toEqual(MCA_BAR_CHART_TRUTH.c0);
    expect(rotor90.cells.map((c) => c.values.z_ohm)).toEqual(MCA_BAR_CHART_TRUTH.z90);
    expect(rotor90.cells.map((c) => c.values.angle_deg)).toEqual(MCA_BAR_CHART_TRUTH.angle90);

    // Only Z and L carry the in-repo rubric; angle/C stay descriptive.
    expect(zones[0].unbalance_pct).toBe(2.79);
    expect(zones[0].severity?.clazz).toBe("Class 3 — Minor");
    expect(zones[1].unbalance_pct).toBe(3.3);
    expect(zones[1].severity?.clazz).toBe("Class 3 — Minor");
    expect(zones[2].unbalance_pct).toBe(0.8);
    expect(zones[2].severity).toBeNull();
    expect(zones[3].unbalance_pct).toBe(1.32);
    expect(zones[3].severity).toBeNull();
  });

  it("stores provenance and the axis-read tolerance disclosure with the values", () => {
    const data = runVisionChain(MCA_GROUPED_BAR_VISION_FIXTURE);
    const payload = mcaPayloadForSave(data);
    const peak = (payload.peaks as Record<string, unknown>[])[0];

    for (const stored of [peak.bar_chart, payload.telemetry_data.bar_chart]) {
      expect(stored).toBeTruthy();
      const rec = stored as McaBarChartRecord;
      expect(rec.provenance).toBe(MCA_BAR_CHART_PROVENANCE);
      expect(rec.provenance).toBe("vision-extracted from uploaded report (bar chart)");
      expect(rec.tolerance_disclosure).toContain("Axis-read tolerance");
      expect(rec.tolerance_disclosure).toContain("±0.25 Ω");
      expect(rec.tolerance_disclosure).toContain("±0.05 mH");
      expect(rec.tolerance_disclosure).toContain("±1 °");
      expect(rec.tolerance_disclosure).toContain("±0.025 rel");
      expect(rec.tolerance_disclosure).toContain("never interpolated between bars");
      expect(rec.axes.z_ohm.tolerance).toBe(0.25);
      expect(rec.axes.l_mh.tolerance).toBe(0.05);
      expect(rec.axes.angle_deg.tolerance).toBe(1);
      expect(rec.axes.c_rel.tolerance).toBe(0.025);
    }

    // Every stored sample is backed by a printed axis.
    const rec = extractMcaBarChartFromSaved({
      peaks: payload.peaks,
      telemetry_data: payload.telemetry_data
    } as unknown as SavedAnalysisResult) as McaBarChartRecord;
    expect(rec.samples).toHaveLength(6);
    for (const sample of rec.samples) {
      for (const metric of ["z_ohm", "l_mh", "angle_deg", "c_rel"] as const) {
        expect(sample[metric].status).toBe("extracted");
        expect(sample[metric].value).not.toBeNull();
      }
    }
  });

  it("keeps the legacy rotor-0 bridge complete, no borrowing from 90°", () => {
    const data = runVisionChain(MCA_GROUPED_BAR_VISION_FIXTURE);

    expect([data.impedanceAb, data.impedanceBc, data.impedanceCa]).toEqual(
      MCA_BAR_CHART_TRUTH.z0
    );
    expect([data.inductanceAb, data.inductanceBc, data.inductanceCa]).toEqual(
      MCA_BAR_CHART_TRUTH.l0
    );
    expect([data.phaseAngleAb, data.phaseAngleBc, data.phaseAngleCa]).toEqual(
      MCA_BAR_CHART_TRUTH.angle0
    );
    // Nothing is invented from the 90° column (z90 phase A is 4.00, not 4.17).
    expect(data.impedanceAb).toBe(MCA_BAR_CHART_TRUTH.z0[0]);
    expect(data.impedanceAb).not.toBe(MCA_BAR_CHART_TRUTH.z90[0]);
  });

  it("goes RED on a planted fabricated value (4.17 Ω -> 4.90 Ω)", () => {
    const data = runVisionChain(MCA_GROUPED_BAR_VISION_FIXTURE);
    const record = persistAndReload(data);
    const stored = barChartTriplet(record, "z_ohm", 0);

    // Baseline passes.
    expect(() => expectTripletWithin(stored, MCA_BAR_CHART_TRUTH.z0, 0.25)).not.toThrow();

    // Plant the lie in the stored record and prove the value contract rejects it.
    const fabricated: McaBarChartRecord = {
      ...record,
      samples: record.samples.map((s) =>
        s.phase === "A" && s.rotor_deg === 0
          ? { ...s, z_ohm: { value: 4.9, status: "extracted", confidence: 0.9 } }
          : s
      )
    };
    const fabricatedTriplet = barChartTriplet(fabricated, "z_ohm", 0);
    expect(fabricatedTriplet[0]).toBe(4.9);
    expect(() =>
      expectTripletWithin(fabricatedTriplet, MCA_BAR_CHART_TRUTH.z0, 0.25)
    ).toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* 4: honest unreadable cells                                         */
/* ------------------------------------------------------------------ */

describe("grouped-bar MCA e2e — unreadable stays not-extracted", () => {
  function dishonestFixture(): Record<string, unknown> {
    return {
      ...MCA_GROUPED_BAR_VISION_FIXTURE,
      mca_bar_chart: {
        axes: MCA_BAR_CHART_AXES,
        series: [
          { phase: "A", rotor_deg: 0, z_ohm: 4.17, l_mh: 1.67, angle_deg: 84, c_rel: 0.51, status: "illegible", confidence: 0.9 },
          { phase: "B", rotor_deg: 0, z_ohm: 4.0, l_mh: 3.0, angle_deg: 83, c_rel: 0.5, status: "extracted", confidence: 0.9 },
          { phase: "C", rotor_deg: 0, z_ohm: 4.0, l_mh: 1.59, angle_deg: 83, c_rel: 0.5, status: "extracted", confidence: 0.4 },
          { phase: "A", rotor_deg: 90, z_ohm: 4.0, l_mh: 1.59, angle_deg: 83, c_rel: 0.5, status: "extracted", confidence: 0.9 }
        ]
      }
    };
  }

  it("nulls illegible, out-of-axis, low-confidence, and unprinted cells", () => {
    const record = parseMcaBarChart(dishonestFixture().mca_bar_chart);
    expect(record).toBeTruthy();
    const rec = record as McaBarChartRecord;

    expect(barChartReading(rec, "z_ohm", 0, "A").value).toBeNull();
    expect(barChartReading(rec, "z_ohm", 0, "A").status).toBe("illegible");

    // L = 3.0 mH is outside the printed 0-2 mH axis (+0.05 tolerance).
    expect(barChartReading(rec, "l_mh", 0, "B").value).toBeNull();
    expect(barChartReading(rec, "l_mh", 0, "B").status).toBe("illegible");

    // Confidence 0.4 < 0.8 threshold.
    expect(barChartReading(rec, "angle_deg", 0, "C").value).toBeNull();
    expect(barChartReading(rec, "angle_deg", 0, "C").status).toBe("illegible");

    // Phase B/C at 90° were never printed.
    expect(barChartReading(rec, "z_ohm", 90, "B").status).toBe("absent");
    expect(barChartReading(rec, "c_rel", 90, "C").value).toBeNull();

    // Incomplete rotor-0 triplets never bridge into the legacy columns.
    const data = runVisionChain(dishonestFixture());
    expect(data.impedanceAb).toBeNull();
    expect(data.inductanceAb).toBeNull();
    // A complete metric (none here for rotor 0 Z/L/Fi) stays null, not zero.
    expect(data.impedanceBc).toBeNull();

    // Unreadable cells are surfaced for operator review.
    expect(data.flaggedFields?.some((f) => f.includes("z_ohm: illegible"))).toBe(true);
    expect(data.flaggedFields?.some((f) => f.includes("l_mh: illegible"))).toBe(true);
  });

  it("renders nothing (null record) when no bar chart is stored", () => {
    expect(parseMcaBarChart({ axes: MCA_BAR_CHART_AXES })).toBeNull();
    expect(parseMcaBarChart({ axes: MCA_BAR_CHART_AXES, series: [] })).toBeNull();
    // No readable value at all -> not a record, never a zero-filled matrix.
    expect(
      parseMcaBarChart({
        axes: MCA_BAR_CHART_AXES,
        series: [
          { phase: "A", rotor_deg: 0, z_ohm: null, l_mh: null, angle_deg: null, c_rel: null, status: "absent" }
        ]
      })
    ).toBeNull();

    expect(
      extractMcaBarChartFromSaved({
        peaks: [{ type: "mca" }],
        telemetry_data: {}
      } as unknown as SavedAnalysisResult)
    ).toBeNull();
    expect(deriveMcaSixFaultZones(null)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 5: cross-technology prompt byte-identity                           */
/* ------------------------------------------------------------------ */

describe("grouped-bar MCA e2e — other technologies unchanged", () => {
  const NON_MCA: VisionPurpose[] = [
    "oil",
    "vibration",
    "thermography",
    "ultrasound",
    null
  ];

  it("returns the locked base prompt byte-for-byte for every non-MCA purpose", () => {
    for (const purpose of NON_MCA) {
      const prompt = buildVisionPromptForPurpose(purpose);
      expect(prompt, String(purpose)).toBe(MASTER_VISION_PROMPT);
      expect(prompt.includes(MCA_GROUPED_BAR_SECTION)).toBe(false);
    }
  });

  it("appends the MCA addendum additively (base prompt untouched)", () => {
    expect(buildVisionPromptForPurpose("mca")).toBe(MCA_GROUPED_BAR_PROMPT);
    expect(MCA_GROUPED_BAR_PROMPT.startsWith(MASTER_VISION_PROMPT)).toBe(true);
    expect(MCA_GROUPED_BAR_PROMPT).toBe(
      `${MASTER_VISION_PROMPT}\n\n${MCA_GROUPED_BAR_SECTION}`
    );
    // §3 of the base prompt is still present verbatim; the exception is scoped.
    expect(MCA_GROUPED_BAR_SECTION).toContain("APPLIES ONLY TO THIS MCA REQUEST");
    expect(MCA_GROUPED_BAR_SECTION).toContain("never borrow a value from the other rotor position");
  });
});
