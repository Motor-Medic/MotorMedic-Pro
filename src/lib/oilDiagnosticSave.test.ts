import { describe, expect, it } from "vitest";
import {
  buildOilSampleSavePayload,
  hasOilLabData
} from "./oilDiagnosticSave";
import { mapOilSampleRow } from "./oilSampleRow";

describe("Run Diagnostics oil save gate (hasOil)", () => {
  it("drops an empty snapshot and null/undefined", () => {
    expect(hasOilLabData(null)).toBe(false);
    expect(hasOilLabData(undefined)).toBe(false);
    expect(hasOilLabData({})).toBe(false);
    expect(hasOilLabData({ operatingHours: 42000 })).toBe(false);
  });

  it("passes when any real lab measurement exists, including a measured 0", () => {
    expect(hasOilLabData({ iron: 12 })).toBe(true);
    expect(hasOilLabData({ iron: 0 })).toBe(true);
    expect(hasOilLabData({ waterPpm: 150 })).toBe(true);
    expect(hasOilLabData({ iso4um: 18, iso6um: 16, iso14um: 13 })).toBe(true);
  });

  it("treats NaN / Infinity as absent, never as a measurement", () => {
    expect(hasOilLabData({ iron: Number.NaN })).toBe(false);
    expect(hasOilLabData({ iron: Number.POSITIVE_INFINITY })).toBe(false);
    expect(
      hasOilLabData({ iron: Number.NaN, copper: Number.NEGATIVE_INFINITY })
    ).toBe(false);
  });

  it("buildOilSampleSavePayload returns null without an asset key or data", () => {
    expect(buildOilSampleSavePayload({ iron: 5 }, "", "2026-11-10")).toBeNull();
    expect(
      buildOilSampleSavePayload({ iron: 5 }, "   ", "2026-11-10")
    ).toBeNull();
    expect(
      buildOilSampleSavePayload({ operatingHours: 100 }, "PUMP-1", "2026-11-10")
    ).toBeNull();
  });
});

describe("Run Diagnostics oil payload → oil SSOT reader contract", () => {
  it("maps form snapshot to the /api/oil-analysis wire body", () => {
    const payload = buildOilSampleSavePayload(
      {
        iron: 12,
        copper: 3,
        chromium: 1,
        lead: 2,
        aluminum: 4,
        silicon: 7,
        tin: 0,
        nickel: 0,
        viscosity40C: 46.2,
        acidNumber: 1.1,
        tbn: 8.4,
        waterPpm: 120,
        iso4um: 18,
        iso6um: 16,
        iso14um: 13,
        operatingHours: 4500
      },
      "PUMP-1",
      "2026-11-10"
    );

    expect(payload).not.toBeNull();
    expect(payload).toMatchObject({
      assetId: "PUMP-1",
      sampleDate: "2026-11-10",
      operatingHours: 4500,
      iron: 12,
      copper: 3,
      chromium: 1,
      lead: 2,
      aluminum: 4,
      silicon: 7,
      tin: 0,
      nickel: 0,
      viscosity40C: 46.2,
      acidNumber: 1.1,
      tbn: 8.4,
      waterPpm: 120,
      iso4um: 18,
      iso6um: 16,
      iso14um: 13
    });
  });

  it("the row the Oil tab reads (mapOilSampleRow) exposes the saved wear metals", () => {
    const payload = buildOilSampleSavePayload(
      { iron: 12, copper: 3, chromium: 1, silicon: 7, waterPpm: 120 },
      "PUMP-1",
      "2026-11-10"
    );
    expect(payload).not.toBeNull();
    if (!payload) return;

    // Mirror the `oil_samples` → domain mapping the Trend Analyzer uses.
    const sample = mapOilSampleRow(
      {
        asset_id: payload.assetId,
        sample_date: payload.sampleDate,
        operating_hours: payload.operatingHours,
        iron: payload.iron,
        copper: payload.copper,
        chromium: payload.chromium,
        silicon: payload.silicon,
        water_ppm: payload.waterPpm
      },
      payload.assetId
    );

    expect(sample.assetId).toBe("PUMP-1");
    expect(sample.sampleDate).toBe("2026-11-10");
    expect(sample.iron).toBe(12);
    expect(sample.copper).toBe(3);
    expect(sample.chromium).toBe(1);
    expect(sample.silicon).toBe(7);
    expect(sample.waterPpm).toBe(120);
    expect(sample.operatingHours).toBe(0); // no hours supplied → 0, never invented
  });
});
