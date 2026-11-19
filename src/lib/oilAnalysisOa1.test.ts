import { describe, expect, it } from "vitest";
import type { OilSample } from "../types/oilAnalysis";
import {
  formatPercentOfLimit,
  latestWearMetalPresence,
  percentOfLimit,
  wearMetalCoMovementStatus,
  wearMetalLimitDisplay,
  WEAR_METAL_ENDPOINT_RATE_NOTE
} from "./oilAnalysisMetrics";
import {
  alloyCoElevationRatios,
  ICP_OES_PARTICLE_SIZE_DISCLOSURE,
  viscosityTanPairCompleteness
} from "./oilTribologyGuidance";

function sample(overrides: Partial<OilSample> = {}): OilSample {
  return {
    assetId: "asset-1",
    sampleDate: "2026-01-01",
    operatingHours: 100,
    ironAlarmLimit: 100,
    copperAlarmLimit: 50,
    chromiumAlarmLimit: 25,
    leadAlarmLimit: 30,
    aluminumAlarmLimit: 40,
    siliconAlarmLimit: 30,
    ...overrides
  };
}

describe("SLICE-OA1 percent-of-limit", () => {
  it("rounds ppm/limit to 0.1", () => {
    expect(percentOfLimit(10, 100)).toBe(10);
    expect(percentOfLimit(1, 3)).toBe(33.3);
    expect(percentOfLimit(2, 3)).toBe(66.7);
  });

  it("returns null and renders — for an unreported value", () => {
    expect(percentOfLimit(null, 100)).toBeNull();
    expect(percentOfLimit(undefined, 100)).toBeNull();
    expect(formatPercentOfLimit(null)).toBe("—");

    const display = wearMetalLimitDisplay(
      [sample({ iron: undefined })],
      "iron"
    );
    expect(display.latestPpm).toBeNull();
    expect(display.percentOfLimit).toBeNull();
  });

  it("returns null for a non-positive limit instead of a divide-by-zero", () => {
    expect(percentOfLimit(10, 0)).toBeNull();
    expect(percentOfLimit(10, -5)).toBeNull();

    const display = wearMetalLimitDisplay(
      [sample({ iron: 40, ironAlarmLimit: 0 })],
      "iron"
    );
    expect(display.limitPpm).toBe(0);
    expect(display.percentOfLimit).toBeNull();
  });

  it("keeps the ppm delta null when no baseline is stored", () => {
    const display = wearMetalLimitDisplay([sample({ iron: 40 })], "iron");
    expect(display.deltaFromBaselinePpm).toBeNull();
  });
});

describe("SLICE-OA1 chronological latest selection", () => {
  it("orders unsorted input before picking the latest sample", () => {
    const february = sample({ sampleDate: "2026-02-01", iron: 20 });
    const january = sample({ sampleDate: "2026-01-01", iron: 10 });

    const display = wearMetalLimitDisplay([february, january], "iron");
    expect(display.latestPpm).toBe(20);

    const presence = latestWearMetalPresence([february, january]);
    expect(presence.find((entry) => entry.element === "iron")?.ppm).toBe(20);
  });
});

describe("SLICE-OA1 endpoint rate gate", () => {
  it("reports insufficient for an all-zero-hour demo and withholds co-movement", () => {
    const samples = [
      sample({ sampleDate: "2026-01-01", operatingHours: 0, iron: 10 }),
      sample({ sampleDate: "2026-02-01", operatingHours: 0, iron: 20 })
    ];

    const display = wearMetalLimitDisplay(samples, "iron");
    expect(display.rateStatus).toBe("insufficient");
    expect(display.ratePer100Hours).toBeNull();

    const coMovement = wearMetalCoMovementStatus(samples);
    expect(coMovement.status).toBe("insufficient-hours");
    expect(coMovement.flags).toEqual([]);
  });

  it("withholds co-movement with fewer than two distinct hour stamps", () => {
    const coMovement = wearMetalCoMovementStatus([
      sample({ sampleDate: "2026-01-01", operatingHours: 0, silicon: 5, iron: 10 }),
      sample({ sampleDate: "2026-02-01", operatingHours: 0, silicon: 9, iron: 30 })
    ]);
    expect(coMovement.status).toBe("insufficient-hours");
    expect(coMovement.distinctNonZeroHourCount).toBe(0);
    expect(coMovement.flags).toEqual([]);
  });

  it("uses the two-point endpoint slope once the hour gate passes", () => {
    const display = wearMetalLimitDisplay(
      [
        sample({ sampleDate: "2026-01-01", operatingHours: 100, iron: 10 }),
        sample({ sampleDate: "2026-02-01", operatingHours: 200, iron: 20 })
      ],
      "iron"
    );

    expect(display.rateStatus).toBe("available");
    expect(display.ratePer100Hours).toBe(10);
  });

  it("labels the slope as a descriptive endpoint delta with no projection", () => {
    expect(WEAR_METAL_ENDPOINT_RATE_NOTE).toBe(
      "descriptive endpoint Δ, no projection"
    );
    expect(WEAR_METAL_ENDPOINT_RATE_NOTE).not.toMatch(/hours to .*limit|projected/i);
  });

  it("flags rising Si with rising Fe only when the hour gate passes", () => {
    const coMovement = wearMetalCoMovementStatus([
      sample({ sampleDate: "2026-01-01", operatingHours: 100, silicon: 5, iron: 10 }),
      sample({ sampleDate: "2026-02-01", operatingHours: 200, silicon: 8, iron: 15 })
    ]);

    expect(coMovement.status).toBe("available");
    expect(coMovement.flags.length).toBe(1);
    expect(coMovement.flags[0]).toContain("Silicon");
    expect(coMovement.flags[0]).toContain("descriptive endpoint Δ");
  });

  it("emits no flag when silicon is falling", () => {
    const coMovement = wearMetalCoMovementStatus([
      sample({ sampleDate: "2026-01-01", operatingHours: 100, silicon: 8, iron: 10 }),
      sample({ sampleDate: "2026-02-01", operatingHours: 200, silicon: 5, iron: 15 })
    ]);

    expect(coMovement.status).toBe("available");
    expect(coMovement.flags).toEqual([]);
  });
});

describe("SLICE-OA1 latest-sample presence", () => {
  it("distinguishes measured, reported 0 and not measured", () => {
    const presence = latestWearMetalPresence([
      sample({ iron: 10, copper: 0, chromium: undefined })
    ]);

    expect(presence.find((entry) => entry.element === "iron")?.state).toBe(
      "measured"
    );
    expect(presence.find((entry) => entry.element === "copper")?.state).toBe(
      "zero"
    );
    expect(presence.find((entry) => entry.element === "chromium")?.state).toBe(
      "unmeasured"
    );
    expect(
      presence.find((entry) => entry.element === "chromium")?.ppm
    ).toBeNull();
  });
});

describe("SLICE-OA1 viscosity/TAN pair completeness", () => {
  it("marks TAN without Visc@40 as an incomplete pair (gap)", () => {
    const [point] = viscosityTanPairCompleteness([
      { sampleDate: "2026-02-01", acidNumber: 1.2, operatingHours: 100 }
    ]);

    expect(point.hasTan).toBe(true);
    expect(point.hasViscosity).toBe(false);
    expect(point.hasOperatingHours).toBe(true);
    expect(point.isCompletePair).toBe(false);
    // The UI's gap rule: TAN exists but the row is not a complete pair.
    expect(point.hasTan && !point.isCompletePair).toBe(true);
  });

  it("marks TAN + Visc@40 without operating hours as an incomplete pair", () => {
    const [point] = viscosityTanPairCompleteness([
      {
        sampleDate: "2026-02-01",
        acidNumber: 1.2,
        viscosity40C: 46,
        operatingHours: 0
      }
    ]);

    expect(point.hasViscosity).toBe(true);
    expect(point.hasOperatingHours).toBe(false);
    expect(point.isCompletePair).toBe(false);
  });

  it("marks a fully populated row as a complete pair", () => {
    const [point] = viscosityTanPairCompleteness([
      {
        sampleDate: "2026-02-01",
        acidNumber: 1.2,
        viscosity40C: 46,
        operatingHours: 100
      }
    ]);

    expect(point).toEqual({
      date: "2026-02-01",
      hasViscosity: true,
      hasTan: true,
      hasOperatingHours: true,
      isCompletePair: true
    });
  });
});

describe("SLICE-OA1 omitted ratios and static ICP disclosure", () => {
  it("omits elemental ratios when either side is unpaired", () => {
    expect(alloyCoElevationRatios(sample({ copper: 10 }))).toEqual([]);
    expect(
      alloyCoElevationRatios(sample({ copper: 10, lead: 0 }))
    ).toEqual([]);
  });

  it("states the ICP particle-size limitation as static method text", () => {
    expect(ICP_OES_PARTICLE_SIZE_DISCLOSURE).toContain("ASTM D5185");
    expect(ICP_OES_PARTICLE_SIZE_DISCLOSURE).toContain("< 10 µm");
    expect(ICP_OES_PARTICLE_SIZE_DISCLOSURE).toContain("large spalling debris");
    expect(ICP_OES_PARTICLE_SIZE_DISCLOSURE).toContain(
      "does not rule out macroscopic wear"
    );
  });
});
