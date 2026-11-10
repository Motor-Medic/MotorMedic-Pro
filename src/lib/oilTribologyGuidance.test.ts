import { describe, expect, it } from "vitest";
import type { OilSample } from "../types/oilAnalysis";
import {
  OIL_ISO4406_RANGE_CITATION,
  OIL_VISCOSITY_CITATION,
  OIL_VISCOSITY_GRADE_CITATION
} from "./maintenance/prescriptiveDictionary";
import {
  decodeIso4406,
  filterOilSamplesToWindow,
  iso4406Range,
  isoVgBand,
  latestOilSample,
  metallurgyOriginGuidance,
  parseIsoVgGrade,
  resolveViscosityGradeGuard,
  wearMetalRatios
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

describe("ISO VG tolerance guard (ISO 3448 band, ASTM D445 measurement)", () => {
  it("parses only ISO 3448 nominal grades", () => {
    expect(parseIsoVgGrade("ISO VG 46")).toBe(46);
    expect(parseIsoVgGrade("iso vg 220")).toBe(220);
    expect(parseIsoVgGrade("VG 68")).toBe(68);
    expect(parseIsoVgGrade("ISO VG 50")).toBeNull();
    expect(parseIsoVgGrade("")).toBeNull();
  });

  it("builds the published +/-10% band around the nominal grade", () => {
    expect(isoVgBand(46)).toEqual({ grade: 46, nominal: 46, min: 41.4, max: 50.6 });
    expect(isoVgBand(220)).toEqual({ grade: 220, nominal: 220, min: 198, max: 242 });
    expect(isoVgBand(50)).toBeNull();
  });

  it("stays raw-cSt only when no grade is stored", () => {
    expect(resolveViscosityGradeGuard(sample({ viscosity40C: 44 }))).toBeNull();
    expect(
      resolveViscosityGradeGuard(
        sample({ lubricantGrade: "ISO VG 50", oilGrade: null, viscosity40C: 44 })
      )
    ).toBeNull();
  });

  it("shows the band and measured deviation only when a grade is stored", () => {
    const guard = resolveViscosityGradeGuard(
      sample({ lubricantGrade: "ISO VG 46", viscosity40C: 55 })
    );
    expect(guard).not.toBeNull();
    expect(guard?.band.min).toBe(41.4);
    expect(guard?.band.max).toBe(50.6);
    expect(guard?.deviationPercent).toBe(19.6);
    expect(guard?.withinBand).toBe(false);
  });

  it("keeps the band without a deviation when measured viscosity is absent", () => {
    const guard = resolveViscosityGradeGuard(
      sample({ oilGrade: "ISO VG 68", viscosity40C: undefined })
    );
    expect(guard?.band.min).toBe(61.2);
    expect(guard?.band.max).toBe(74.8);
    expect(guard?.measured).toBeNull();
    expect(guard?.deviationPercent).toBeNull();
    expect(guard?.withinBand).toBeNull();
  });
});

describe("ISO 4406 published range dissector", () => {
  it("decodes the known code 18 range from the published table", () => {
    expect(iso4406Range(18)).toEqual({ code: 18, minPerMl: 1300, maxPerMl: 2500 });
  });

  it("decodes each stored channel without interpolation", () => {
    const decoded = decodeIso4406({
      iso4um: 18,
      iso6um: 16,
      iso14um: 13
    });
    expect(decoded).toEqual([
      { channel: ">4 µm", code: 18, minPerMl: 1300, maxPerMl: 2500 },
      { channel: ">6 µm", code: 16, minPerMl: 320, maxPerMl: 640 },
      { channel: ">14 µm", code: 13, minPerMl: 40, maxPerMl: 80 }
    ]);
  });

  it("omits absent and out-of-table codes instead of inventing ranges", () => {
    const decoded = decodeIso4406({
      iso4um: 18,
      iso6um: undefined,
      iso14um: 42
    });
    expect(decoded).toEqual([
      { channel: ">4 µm", code: 18, minPerMl: 1300, maxPerMl: 2500 }
    ]);
    expect(decodeIso4406({})).toEqual([]);
  });
});

describe("metallurgy profiling is descriptive-only and gated", () => {
  it("renders ratios only from stored element pairs", () => {
    const ratios = wearMetalRatios(
      sample({ iron: 100, copper: 10, lead: 5, tin: 2, aluminum: 4, silicon: 8 })
    );
    expect(ratios.map((r) => [r.label, r.value])).toEqual([
      ["Cu/Fe", 0.1],
      ["Pb/Fe", 0.05],
      ["Sn/Cu", 0.2],
      ["Al/Si", 0.5]
    ]);
    expect(
      wearMetalRatios(sample({ copper: 10, iron: undefined }))
    ).toEqual([]);
  });

  it("returns no origin guidance without stored metallurgy", () => {
    const ratios = wearMetalRatios(sample({ iron: 100, copper: 90 }));
    expect(
      metallurgyOriginGuidance({ metallurgy: null, samples: [sample(), sample()], ratios })
    ).toBeNull();
  });

  it("requires 2+ samples before any temporal origin guidance", () => {
    const one = sample({ iron: 100, copper: 90 });
    const ratios = wearMetalRatios(one);
    expect(
      metallurgyOriginGuidance({
        metallurgy: { bushing: "bronze" },
        samples: [one],
        ratios
      })
    ).toBeNull();
  });

  it("phrases the stored-metallurgy origin as guidance, never a verdict", () => {
    const first = sample({ sampleDate: "2026-01-01", iron: 100, copper: 90 });
    const second = sample({ sampleDate: "2026-02-01", iron: 110, copper: 95 });
    const guidance = metallurgyOriginGuidance({
      metallurgy: { bushing: "bronze" },
      samples: [first, second],
      ratios: wearMetalRatios(second)
    });
    expect(guidance?.text).toBe("consistent with bushing sliding wear");
    expect(guidance?.text).not.toMatch(/diagnosis|confirmed|failure/i);
    expect(guidance?.text).not.toMatch(/stable|rising|falling/i);
  });

  it("cites ISO 3448 for the band and ASTM D445 only for the measurement", () => {
    expect(OIL_VISCOSITY_GRADE_CITATION).toContain("ISO 3448");
    expect(OIL_VISCOSITY_GRADE_CITATION).not.toContain("D445");
    expect(OIL_VISCOSITY_CITATION).toContain("ASTM D445");
    expect(OIL_ISO4406_RANGE_CITATION).toContain("ISO 4406");
  });
});

describe("point-in-time windowing is lockstep for history and KPIs", () => {
  const january = sample({ id: "a", sampleDate: "2026-01-15", iron: 10 });
  const february = sample({ id: "b", sampleDate: "2026-02-15", iron: 20 });
  const march = sample({ id: "c", sampleDate: "2026-03-15", iron: 30 });

  it("filters samples to the inclusive From/To window", () => {
    const windowed = filterOilSamplesToWindow(
      [january, february, march],
      "2026-02-01",
      "2026-02-28"
    );
    expect(windowed.map((s) => s.id)).toEqual(["b"]);
    expect(latestOilSample(windowed)?.iron).toBe(20);
  });

  it("treats an empty bound as open-ended", () => {
    expect(
      filterOilSamplesToWindow([january, february, march], "2026-02-01", null).map(
        (s) => s.id
      )
    ).toEqual(["b", "c"]);
    expect(
      filterOilSamplesToWindow([january, february, march], null, "2026-02-28").map(
        (s) => s.id
      )
    ).toEqual(["a", "b"]);
  });

  it("returns no latest sample when the window is empty", () => {
    const windowed = filterOilSamplesToWindow(
      [january, february, march],
      "2026-04-01",
      "2026-04-30"
    );
    expect(windowed).toEqual([]);
    expect(latestOilSample(windowed)).toBeNull();
  });
});
