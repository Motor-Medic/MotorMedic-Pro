import { describe, expect, it } from "vitest";
import {
  buildOilSampleSavePayload,
  hasMorphologyObservation,
  hasOilLabData
} from "./oilDiagnosticSave";
import { mapOilSampleRow } from "./oilSampleRow";

describe("SLICE-AO ferrography & varnish save contract", () => {
  it("carries MPC, RULER, DR DL/DS and operator morphology into the wire body", () => {
    const payload = buildOilSampleSavePayload(
      {
        mpcDeltaE: 28.4,
        rulerPercent: 42,
        drLarge: 12.5,
        drSmall: 4.2,
        morphology: { cutting: "moderate", rubbing: "trace" }
      },
      "PUMP-1",
      "2026-03-01"
    );

    expect(payload).not.toBeNull();
    expect(payload).toMatchObject({
      assetId: "PUMP-1",
      sampleDate: "2026-03-01",
      mpcDeltaE: 28.4,
      rulerPercent: 42,
      drLarge: 12.5,
      drSmall: 4.2
    });
    expect(payload?.morphology).toEqual({
      cutting: "moderate",
      rubbing: "trace"
    });
  });

  it("leaves unreported ferrography undefined — no zero coercion", () => {
    const payload = buildOilSampleSavePayload(
      { iron: 12, operatingHours: 4500 },
      "PUMP-1",
      "2026-03-01"
    );

    expect(payload).not.toBeNull();
    expect(payload?.mpcDeltaE).toBeUndefined();
    expect(payload?.rulerPercent).toBeUndefined();
    expect(payload?.drLarge).toBeUndefined();
    expect(payload?.drSmall).toBeUndefined();
    expect(payload?.ucRating).toBeUndefined();
    expect(payload?.morphology).toBeUndefined();
  });

  it("preserves a measured zero (0 ΔE / 0% / 0 density) instead of dropping it", () => {
    const payload = buildOilSampleSavePayload(
      { mpcDeltaE: 0, rulerPercent: 0, drLarge: 0, drSmall: 0 },
      "PUMP-1",
      "2026-03-01"
    );

    expect(payload).toMatchObject({
      mpcDeltaE: 0,
      rulerPercent: 0,
      drLarge: 0,
      drSmall: 0
    });
    expect(hasOilLabData({ mpcDeltaE: 0 })).toBe(true);
  });

  it("counts morphology-only observations as real lab data and ignores blank maps", () => {
    expect(hasOilLabData({ morphology: { cutting: "mild" } })).toBe(true);
    expect(hasOilLabData({ morphology: {} })).toBe(false);
    expect(hasMorphologyObservation({ cutting: "mild" })).toBe(true);
    expect(
      hasMorphologyObservation({
        cutting: "not_a_severity" as never
      })
    ).toBe(false);
  });

  it("the row reader preserves measured zero and leaves unreported fields absent", () => {
    const sample = mapOilSampleRow(
      {
        asset_id: "PUMP-1",
        sample_date: "2026-03-01",
        operating_hours: 4500,
        mpc_delta_e: "0",
        ruler_percent: null,
        dr_large: null,
        dr_small: null,
        morph_cutting: "moderate",
        morph_rubbing: "not_detected"
      },
      "PUMP-1"
    );

    expect(sample.mpcDeltaE).toBe(0);
    expect(sample.rulerPercent).toBeUndefined();
    expect(sample.drLarge).toBeUndefined();
    expect(sample.drSmall).toBeUndefined();
    expect(sample.morphology).toEqual({
      cutting: "moderate",
      rubbing: "not_detected"
    });
  });
});
