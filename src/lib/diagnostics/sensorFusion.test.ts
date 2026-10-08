import { describe, expect, it } from "vitest";
import type { SavedAnalysisResult } from "../analysisPersistence";
import {
  assembleFusion,
  buildFusionFromRecords,
  scoreOil,
  scoreVibration,
  type TechnologyEvidence,
} from "./sensorFusion";

const record = (over: Partial<SavedAnalysisResult> = {}): SavedAnalysisResult => ({
  id: "r1",
  asset_id: "a1",
  component: null,
  timestamp: "2026-01-01T00:00:00.000Z",
  health_score: 42,
  primary_fault: "Outer Race Bearing Defect (BPFO)",
  fault_list: [],
  peaks: [],
  spectrum_image_url: null,
  recommendations: [],
  financial_impact: {},
  ...over,
});

const scoredRow = (score: number): TechnologyEvidence => ({
  ...scoreVibration(null, "bearing"),
  hasRecord: true,
  score,
  unscoredReason: null,
});

describe("P2 sensor fusion never fabricates a number", () => {
  it("a missing record scores null with no_record — no default score appears", () => {
    const ev = scoreVibration(null, "unbalance");
    expect(ev.hasRecord).toBe(false);
    expect(ev.score).toBeNull();
    expect(ev.unscoredReason).toBe("no_record");
  });

  it("a record without severity is confessed as no_usable_metric, not guessed", () => {
    const ev = scoreVibration(record(), "bearing");
    expect(ev.hasRecord).toBe(true);
    expect(ev.score).toBeNull();
    expect(ev.unscoredReason).toBe("no_usable_metric");
    expect(ev.reason).toBe("Severity not recorded - not scored.");
  });

  it("a missing oil sample is no_record — no oil score is invented", () => {
    const ev = scoreOil(null, "bearing");
    expect(ev.hasRecord).toBe(false);
    expect(ev.score).toBeNull();
    expect(ev.unscoredReason).toBe("no_record");
  });

  it("aggregate stays null below two scored technologies", () => {
    const fusion = assembleFusion([scoredRow(80), scoreOil(null, "bearing")], "bearing");
    expect(fusion.aggregate).toBeNull();
    expect(fusion.status).toBe("single_domain");
  });

  it("null-score rows are excluded from the mean, not averaged as zero", () => {
    const fusion = assembleFusion(
      [scoredRow(100), scoredRow(50), scoreOil(null, "bearing")],
      "bearing",
    );
    expect(fusion.scored).toHaveLength(2);
    expect(fusion.aggregate).toBe(75);
    expect(fusion.status).toBe("cross_validated");
  });

  it("an empty record set reports no_data with all four rows unscored", () => {
    const fusion = buildFusionFromRecords({
      analysisRecords: [],
      oilSamples: [],
      primaryFault: "Outer Race Bearing Defect (BPFO)",
    });
    expect(fusion.status).toBe("no_data");
    expect(fusion.aggregate).toBeNull();
    expect(fusion.rows).toHaveLength(4);
    expect(fusion.rows.every((r) => r.unscoredReason === "no_record")).toBe(true);
    expect(fusion.rows.every((r) => r.score === null)).toBe(true);
  });
});
