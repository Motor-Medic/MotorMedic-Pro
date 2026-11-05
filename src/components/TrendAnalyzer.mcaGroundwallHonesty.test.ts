import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  calculateGroundwallInsulation,
  evaluateGroundwallTestVoltage,
  ieee43MaxDcTestVoltageV,
  ieee43MinIrMOmega,
  parseRatedVoltageVolts
} from "../lib/mca/groundwallCalculator";

const trendSrc = readFileSync(
  fileURLToPath(new URL("./TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
);
const calcSrc = readFileSync(
  fileURLToPath(new URL("../lib/mca/groundwallCalculator.ts", import.meta.url)),
  "utf8"
);

function block(start: string, end: string): string {
  const from = trendSrc.indexOf(start);
  const to = trendSrc.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return trendSrc.slice(from, to);
}

const DEMO_IR = {
  ir30sMOmega: 564,
  ir1mMOmega: 4,
  ir10mMOmega: 343,
  testVoltageV: 250
};

describe("SLICE-AG non-monotonic IR data-quality gate", () => {
  it("flags the demo 564/4/343 sequence as invalid before PI/DAR/fault", () => {
    const r = calculateGroundwallInsulation(DEMO_IR);
    expect(r.dataQuality.valid).toBe(false);
    expect(r.dataQuality.nonMonotonic).toBe(true);
    expect(r.dataQuality.darArtifact).toBe(true);
    expect(r.dataQuality.piArtifact).toBe(true);
    expect(r.dataQuality.rawDar).toBeCloseTo(4 / 564, 3);
    expect(r.dataQuality.rawPi).toBeCloseTo(343 / 4, 2);
    expect(r.dataQuality.reasons.join(" ")).toContain("non-monotonic");
  });

  it("suppresses PI, DAR, leakage, and the CRITICAL energize verdict", () => {
    const r = calculateGroundwallInsulation(DEMO_IR);
    expect(r.pi).toBeNull();
    expect(r.dar).toBeNull();
    expect(r.piStatus).toBe("N/A");
    expect(r.darStatus).toBe("N/A");
    expect(r.leakageCurrentUA).toBe(0);
    expect(r.severity).not.toBe("CRITICAL");
    expect(r.recommendation).not.toMatch(/Do not energize/i);
    expect(r.fault).toContain("Data Quality");
  });

  it("never condemns a motor from a physically invalid test even with a threshold", () => {
    const r = calculateGroundwallInsulation({
      ...DEMO_IR,
      ratedVoltageV: 480
    });
    expect(r.dataQuality.valid).toBe(false);
    expect(r.severity).not.toBe("CRITICAL");
    expect(r.recommendation).not.toMatch(/Do not energize/i);
  });

  it("treats a valid absorption sequence as data-quality clean", () => {
    const r = calculateGroundwallInsulation({
      ir30sMOmega: 2,
      ir1mMOmega: 4,
      ir10mMOmega: 8,
      testVoltageV: 250,
      ratedVoltageV: 480
    });
    expect(r.dataQuality.valid).toBe(true);
    expect(r.dar).toBe(2);
    expect(r.pi).toBe(2);
    expect(r.severity).toBe("NORMAL");
  });
});

describe("SLICE-AG missing winding temperature is disclosed, never coerced", () => {
  it("passes IR through with kt=1 and marks it uncorrected", () => {
    const r = calculateGroundwallInsulation({
      ir30sMOmega: 2,
      ir1mMOmega: 4,
      ir10mMOmega: 8,
      testVoltageV: 250
    });
    expect(r.windingTempC).toBeNull();
    expect(r.tempCorrected).toBe(false);
    expect(r.kT).toBe(1);
    expect(r.ir40MOmega).toBe(4);
  });

  it("does not derive kt from a fabricated 0°C temperature", () => {
    const r = calculateGroundwallInsulation({
      ir1mMOmega: 4,
      testVoltageV: 250
    });
    // kt from T=0 would be 0.5^4 = 0.0625; passthrough must be exactly 1.
    expect(r.kT).toBe(1);
    expect(r.ir40MOmega).toBe(4);
  });

  it("applies kt only when a real temperature is recorded", () => {
    const r = calculateGroundwallInsulation({
      ir1mMOmega: 4,
      testVoltageV: 250,
      windingTempC: 50
    });
    expect(r.tempCorrected).toBe(true);
    expect(r.kT).toBe(2);
    expect(r.ir40MOmega).toBe(8);
  });

  it("renders the uncorrected baseline disclosure and the kt audit drawer", () => {
    expect(trendSrc).toContain(
      "IR shown uncorrected (no winding temp recorded, kt=1)"
    );
    expect(trendSrc).toContain("mcaGwResult.tempCorrected");
    expect(trendSrc).toContain('data-testid="mca-gw-kt-drawer"');
    expect(trendSrc).toContain("R40 = kt × R_T");
    expect(trendSrc).toContain("°C-locked");
    expect(trendSrc).toContain("null temp is NOT coerced to 0°C");
  });
});

describe("SLICE-AG threshold provenance is voltage-rated or omitted", () => {
  it("derives the IEEE 43 minimum from nameplate kV, not a flat 100 MΩ", () => {
    expect(ieee43MinIrMOmega(480)).toBeCloseTo(1.48, 2);
    expect(ieee43MinIrMOmega(1000)).toBeCloseTo(2, 2);
    expect(ieee43MinIrMOmega(13800)).toBe(100);
    expect(ieee43MinIrMOmega(undefined)).toBeNull();
    expect(calcSrc).not.toContain("const irIeeeMinMOmega = 100");
  });

  it("omits the pass/fail verdict when nameplate voltage is absent", () => {
    const r = calculateGroundwallInsulation({
      ir30sMOmega: 2,
      ir1mMOmega: 4,
      ir10mMOmega: 8,
      testVoltageV: 250
    });
    expect(r.irIeeeMinMOmega).toBeNull();
    expect(r.irIeeePass).toBeNull();
    expect(r.irIeeeMinProvenance).toContain("No nameplate voltage stored");
    expect(r.fault).toContain("Verdict Unavailable");
  });

  it("applies the voltage-rated verdict when nameplate voltage is stored", () => {
    const r = calculateGroundwallInsulation({
      ir30sMOmega: 2,
      ir1mMOmega: 4,
      ir10mMOmega: 8,
      testVoltageV: 250,
      ratedVoltageV: 480
    });
    expect(r.irIeeeMinMOmega).toBeCloseTo(1.48, 2);
    expect(r.irIeeePass).toBe(true);
    expect(r.irIeeeMinProvenance).toContain("voltage-rated minimum");
  });

  it("parses stored nameplate strings", () => {
    expect(parseRatedVoltageVolts("480V")).toBe(480);
    expect(parseRatedVoltageVolts("4.16 kV")).toBe(4160);
    expect(parseRatedVoltageVolts("230/460V")).toBe(460);
    expect(parseRatedVoltageVolts("")).toBeNull();
    expect(parseRatedVoltageVolts(undefined)).toBeNull();
  });
});

describe("SLICE-AG leakage is derived from 1m IR (V/R), not measured", () => {
  it("computes 62.5 µA from 250 V / 4 MΩ", () => {
    const r = calculateGroundwallInsulation({
      ir30sMOmega: 2,
      ir1mMOmega: 4,
      ir10mMOmega: 8,
      testVoltageV: 250
    });
    expect(r.leakageCurrentUA).toBe(62.5);
  });

  it("labels the leakage card as derived and inherits the gate", () => {
    expect(trendSrc).toContain(
      "Derived from 1m IR (V/R) @ ${mcaGwSnapshot.testVoltageV} V DC — not an independent leakage measurement"
    );
    expect(trendSrc).toContain(
      "Suppressed by data-quality gate — derived from the same suspect 1m IR (V/R)"
    );
    expect(trendSrc).toContain('data-testid="mca-gw-leakage-caveat"');
  });
});

describe("SLICE-AG IEEE 43 DC test-voltage ceiling guard", () => {
  it("uses the static rating-band table", () => {
    expect(ieee43MaxDcTestVoltageV(480)).toBe(500);
    expect(ieee43MaxDcTestVoltageV(4160)).toBe(2500);
    expect(ieee43MaxDcTestVoltageV(13800)).toBe(10000);
    expect(ieee43MaxDcTestVoltageV(undefined)).toBeNull();
  });

  it("flags over-voltage only when a stored nameplate voltage exists", () => {
    const over = evaluateGroundwallTestVoltage({
      testVoltageV: 1000,
      ratedVoltageV: 480
    });
    expect(over.applicable).toBe(true);
    expect(over.overVoltage).toBe(true);
    expect(over.maxDcTestVoltageV).toBe(500);
    expect(over.message).toContain("IEEE 43");

    const within = evaluateGroundwallTestVoltage({
      testVoltageV: 500,
      ratedVoltageV: 480
    });
    expect(within.overVoltage).toBe(false);

    const absent = evaluateGroundwallTestVoltage({
      testVoltageV: 1000,
      ratedVoltageV: null
    });
    expect(absent.applicable).toBe(false);
  });

  it("omits the guard UI when nameplate voltage is absent", () => {
    expect(trendSrc).toContain("mcaGwVoltageGuard.applicable");
    expect(trendSrc).toContain('data-testid="mca-gw-voltage-guard"');
    expect(trendSrc).not.toContain("guessedClass");
  });
});

describe("SLICE-AG ingestion, windowing, null, and unit isolation", () => {
  it("loads real saved MCA telemetry and windows point-in-time tests", () => {
    expect(trendSrc).toContain("fetchAnalysisResults({");
    expect(trendSrc).toContain(
      "windowTrendByTimeRange(mcaAnalyses, timeRange)"
    );
    expect(trendSrc).toContain(
      "const latestMca = windowedMcaAnalyses[0] ?? null"
    );
    expect(trendSrc).toContain(
      "findLatestMcaWithGroundwall(windowedMcaAnalyses)"
    );
    expect(trendSrc).toContain("Groundwall loaded from saved MCA telemetry");
  });

  it("never converts MΩ/µA/V through vibration display units", () => {
    const groundwall = block(
      'mcaMode === "insulation" ? (',
      ') : mcaMode === "rotor" ? ('
    );
    for (const forbidden of [
      "formatVelocityDisplay",
      "formatAccelerationDisplay",
      "velocityValueForDisplay",
      "frequencyValueForDisplay",
      "hzToCpm"
    ]) {
      expect(groundwall).not.toContain(forbidden);
    }
    expect(groundwall).toContain("convertAbsoluteTemperature");
    expect(groundwall).toContain("°C-locked");
    expect(calcSrc).not.toContain("convertAbsoluteTemperature");
    expect(calcSrc).not.toContain("°F");
  });

  it("treats missing/zero IR as absent rather than a fabricated value", () => {
    expect(trendSrc).toContain(
      "mcaGwSnapshot[key] == null || mcaGwSnapshot[key] === 0"
    );
    expect(calcSrc).toContain("const hasData =");
    expect(calcSrc).toContain("windingTempC == null ? 1 :");
  });
});

describe("SLICE-AG dry-out estimator is parked, not built", () => {
  it("does not project hours/days to compliance", () => {
    for (const forbidden of [
      "hours to compliance",
      "days to compliance",
      "~14.2",
      "dry-out estimator",
      "dryoutEstimate",
      "hoursToCompliance"
    ]) {
      expect(trendSrc.toLowerCase()).not.toContain(forbidden.toLowerCase());
      expect(calcSrc.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
