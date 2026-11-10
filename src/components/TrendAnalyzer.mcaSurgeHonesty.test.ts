import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  calculateSurgeDamping,
  calculateSurgeHealth,
  evaluateSurgeTestVoltage,
  ieee522SurgeTestVoltageCeilingV,
  parseSurgeClipboardText,
  SURGE_DAMPING_MIN_PEAKS,
  SURGE_DAMPING_MIN_SAMPLES,
  SURGE_EAR_SOURCE,
  surgeHealthFromManualEar,
  type SurgeDataPoint
} from "../lib/mca/surgeCalculator";
import { EMPTY_MCA_SSOT } from "../lib/mca/mcaSsot";
import { extractMcaSurgeFromSaved } from "../lib/mca/mcaSsot";

const trendSrc = readFileSync(
  fileURLToPath(new URL("./TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
);
const calcSrc = readFileSync(
  fileURLToPath(new URL("../lib/mca/surgeCalculator.ts", import.meta.url)),
  "utf8"
);

function block(start: string, end: string): string {
  const from = trendSrc.indexOf(start);
  const to = trendSrc.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return trendSrc.slice(from, to);
}

/** Alternating peaks with troughs: a genuine stored decaying envelope. */
function decayingWaveform(): SurgeDataPoint[] {
  const peaks = [1000, 700, 490, 343, 240, 168, 118, 82];
  const out: SurgeDataPoint[] = [];
  let t = 0;
  for (const peak of peaks) {
    out.push({ time: t, v12: peak, v23: peak * 0.99, v31: peak * 0.98 });
    t += 1;
    out.push({ time: t, v12: 0, v23: 0, v31: 0 });
    t += 1;
  }
  return out;
}

function flatWaveform(): SurgeDataPoint[] {
  return Array.from({ length: 12 }, (_, i) => ({
    time: i,
    v12: 100,
    v23: 100,
    v31: 100
  }));
}

/** Growing envelope — not a decay, so alpha must be omitted. */
function risingWaveform(): SurgeDataPoint[] {
  const peaks = [82, 118, 168, 240, 343, 490, 700, 1000];
  const out: SurgeDataPoint[] = [];
  let t = 0;
  for (const peak of peaks) {
    out.push({ time: t, v12: peak, v23: peak * 0.99, v31: peak * 0.98 });
    t += 1;
    out.push({ time: t, v12: 0, v23: 0, v31: 0 });
    t += 1;
  }
  return out;
}

describe("SLICE-AI IEEE 522 surge voltage ceiling guard", () => {
  it("uses the IEEE 522 form-wound used-machine factor (2.86 × VL × 75%)", () => {
    expect(ieee522SurgeTestVoltageCeilingV(460)).toBe(986);
    expect(ieee522SurgeTestVoltageCeilingV(2300)).toBe(4930);
    expect(ieee522SurgeTestVoltageCeilingV(4160)).toBe(8916);
    expect(ieee522SurgeTestVoltageCeilingV(13800)).toBe(29578);
    expect(ieee522SurgeTestVoltageCeilingV(undefined)).toBeNull();
    expect(ieee522SurgeTestVoltageCeilingV(0)).toBeNull();
    expect(ieee522SurgeTestVoltageCeilingV(-5)).toBeNull();
    expect(calcSrc).not.toContain("2 * ratedVoltageV + 1000");
  });

  it("flags over-ceiling only when a stored nameplate voltage exists", () => {
    const over = evaluateSurgeTestVoltage({
      testVoltageV: 2500,
      ratedVoltageV: 460
    });
    expect(over.applicable).toBe(true);
    expect(over.overVoltage).toBe(true);
    expect(over.maxSurgeTestVoltageV).toBe(986);
    expect(over.message).toContain("IEEE 522");
    expect(over.provenance).toContain("IEEE 522-2023");
    expect(over.provenance).toContain("ANSI/EASA AR100");

    const within = evaluateSurgeTestVoltage({
      testVoltageV: 900,
      ratedVoltageV: 460
    });
    expect(within.applicable).toBe(true);
    expect(within.overVoltage).toBe(false);

    const absent = evaluateSurgeTestVoltage({
      testVoltageV: 2500,
      ratedVoltageV: null
    });
    expect(absent.applicable).toBe(false);
    expect(absent.message).toBe("");

    const noTest = evaluateSurgeTestVoltage({
      testVoltageV: null,
      ratedVoltageV: 460
    });
    expect(noTest.applicable).toBe(false);
  });

  it("omits the guard UI when the stored rating is absent", () => {
    expect(trendSrc).toContain("surgeVoltageGuard.applicable");
    expect(trendSrc).toContain('data-testid="mca-surge-voltage-guard"');
    expect(trendSrc).toContain("mcaRatedVoltageV");
    expect(trendSrc).not.toContain("guessedSurgeRating");
  });
});

describe("SLICE-AI EAR severity cites a TRUE source (vendor heuristic)", () => {
  it("labels the in-repo EAR brackets as a vendor heuristic, not IEEE/NEMA", () => {
    expect(SURGE_EAR_SOURCE).toContain("Vendor heuristic");
    expect(SURGE_EAR_SOURCE).toMatch(/not an IEEE 522 or NEMA pass\/fail limit/i);
    expect(SURGE_EAR_SOURCE).toContain("governs the surge test method only");
    expect(SURGE_EAR_SOURCE).not.toMatch(/IEEE 522 (limit|pass|fail)/i);
    expect(SURGE_EAR_SOURCE).not.toMatch(/NEMA MG-1/i);
    expect(calcSrc).not.toMatch(/NEMA MG/i);
    expect(calcSrc).not.toMatch(/IEEE 522 (PASS|FAIL)/);
  });

  it("carries the true-source label through both waveform and manual EAR results", () => {
    const fromWave = calculateSurgeHealth(decayingWaveform());
    expect(fromWave?.severitySource).toBe(SURGE_EAR_SOURCE);
    const fromManual = surgeHealthFromManualEar(3.2);
    expect(fromManual?.severitySource).toBe(SURGE_EAR_SOURCE);
    expect(fromManual?.severity).toBe("WARNING");
  });

  it("renders the true-source label next to the EAR, never a standard badge", () => {
    expect(trendSrc).toContain('data-testid="mca-surge-ear-source"');
    expect(trendSrc).toContain("surgeResult!.severitySource");
  });
});

describe("SLICE-AI damping alpha is gated on stored multi-point decay", () => {
  it("computes log decrement only from a stored decaying multi-point trace", () => {
    const damping = calculateSurgeDamping(decayingWaveform());
    expect(damping).not.toBeNull();
    expect(damping!.perPhase).toHaveLength(3);
    expect(damping!.perPhase.every((p) => p.peakCount >= SURGE_DAMPING_MIN_PEAKS)).toBe(
      true
    );
    expect(damping!.meanLogDecrement).toBeGreaterThan(0);
    expect(damping!.provenance).toContain("stored multi-point decay");
    expect(damping!.provenance).toContain("never curve-fit");
  });

  it("omits alpha when samples are absent, too short, flat, or non-decaying", () => {
    expect(calculateSurgeDamping([])).toBeNull();
    expect(calculateSurgeDamping(null)).toBeNull();
    expect(
      calculateSurgeDamping(decayingWaveform().slice(0, SURGE_DAMPING_MIN_SAMPLES - 1))
    ).toBeNull();
    expect(calculateSurgeDamping(flatWaveform())).toBeNull();
    expect(calculateSurgeDamping(risingWaveform())).toBeNull();
  });

  it("omits alpha entirely when any phase lacks a decaying envelope", () => {
    const onlyV12 = decayingWaveform().map((p) => ({
      ...p,
      v23: p.time % 2 === 0 ? 1000 : 0,
      v31: p.time % 2 === 0 ? 1000 : 0
    }));
    expect(calculateSurgeDamping(onlyV12)).toBeNull();
  });

  it("never synthesizes a decay curve in the calculator", () => {
    for (const forbidden of [
      "Math.sin",
      "Math.cos",
      "curveFit",
      "fitDecay",
      "generateSurge",
      "buildWaveform",
      "synthesizeWaveform",
      "synthesizeSurge",
      "buildSynthetic"
    ]) {
      expect(calcSrc).not.toContain(forbidden);
    }
    expect(trendSrc).toContain("surgeDamping && (");
    expect(trendSrc).toContain('data-testid="mca-surge-damping"');
  });
});

describe("SLICE-AI ingestion, nulls, windowing, and unit isolation", () => {
  it("wires CSV/paste ingestion into real stored waveform arrays", () => {
    expect(trendSrc).toContain("handleSurgeCsvFile");
    expect(trendSrc).toContain("handleSurgePasteFromClipboard");
    expect(trendSrc).toContain("parseSurgeClipboardText(text)");
    expect(trendSrc).toContain("surge: { waveform: parsed }");
    expect(trendSrc).toContain("mergeMcaRecord({");
    // The rendered chart binds to the stored samples, not a synthesized series.
    expect(trendSrc).toContain("data={surgeChartData}");
    expect(trendSrc).toContain("surgeData.map((p) => ({");
  });

  it("parses a real CSV table into numeric waveform samples", () => {
    const parsed = parseSurgeClipboardText(
      "Time,V12,V23,V31\n0,100,98,96\n1,-50,-49,-48\n2,25,24,23"
    );
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual({ time: 0, v12: 100, v23: 98, v31: 96 });
  });

  it("renders honest nulls with no synthetic curves or fabricated EAR", () => {
    expect(EMPTY_MCA_SSOT.surge.waveform).toHaveLength(0);
    expect(calculateSurgeHealth([])).toBeNull();
    expect(calculateSurgeHealth([{ time: 0, v12: 1, v23: 1, v31: 1 }])).toBeNull();
    expect(extractMcaSurgeFromSaved(null).waveform).toHaveLength(0);
    expect(trendSrc).toContain("Awaiting Data");
    expect(trendSrc).toContain("Upload Surge CSV or paste Time / V12 / V23 / V31 to");
  });

  it("windows the point-in-time MCA tests through the shared predicate", () => {
    expect(trendSrc).toContain("windowTrendByTimeRange(mcaAnalyses, timeRange)");
    expect(trendSrc).toContain("const latestMca = windowedMcaAnalyses[0] ?? null");
    expect(trendSrc).toContain("mcaSsotFromSaved(latest, gwRow)");
  });

  it("keeps V and % raw — no vibration/H2 display conversion", () => {
    const surge = block(
      'mcaMode === "surge" ? (',
      ") : !hasMcaData ? ("
    );
    for (const forbidden of [
      "formatVelocityDisplay",
      "formatAccelerationDisplay",
      "velocityValueForDisplay",
      "frequencyValueForDisplay",
      "hzToCpm"
    ]) {
      expect(surge).not.toContain(forbidden);
    }
    expect(surge).toContain('unit=" V"');
    expect(surge).toContain('unit=" µs"');
    expect(calcSrc).not.toContain("hzToCpm");
    expect(calcSrc).not.toContain("convertAbsoluteTemperature");
  });
});
