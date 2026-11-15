import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * SLICE-VIB-ENV source contract — Enveloping & Bearing sub-tab.
 *
 * Pins the honesty rules added by this slice and locks the disclosures that
 * already existed so they cannot drift:
 *  - BPFO/BPFI/BSF/FTF stay gated on stored geometry AND gating-quality RPM
 *    and are labeled theoretical kinematic frequencies, never a fault.
 *  - The crest-factor audit reads stored waveform metrics only; CF is
 *    dimensionless and is never unit-converted; the CF > 5 impulsiveness flag
 *    is labeled an in-repo heuristic, not a standard; no shock index is
 *    fabricated.
 *  - The existing unit-physics disclosures stay verbatim (gE/g/Hz unscaled;
 *    velocity <-> acceleration frequency-dependent; only mm/s <-> in/s).
 */

const src = readFileSync(
  fileURLToPath(new URL("./TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
).replace(/\r\n/g, "\n");

const spectralTrendSrc = readFileSync(
  fileURLToPath(
    new URL("../lib/vibration/spectralTrend.ts", import.meta.url)
  ),
  "utf8"
).replace(/\r\n/g, "\n");

function block(start: string, end: string): string {
  const from = src.indexOf(start);
  const to = src.indexOf(end, from + start.length);
  expect(from, `missing block start: ${start}`).toBeGreaterThanOrEqual(0);
  expect(to, `missing block end: ${end}`).toBeGreaterThan(from);
  return src.slice(from, to);
}

const bearingCalculation = block(
  "const calculatedBearingFaults = useMemo",
  "const latestEnvelopingPoint"
);

const crestAuditMemo = block(
  "SLICE-VIB-ENV — crest-factor audit source",
  "const latestWaveformAnalysisMetrics"
);

const crestAuditCard = block(
  "SLICE-VIB-ENV — crest-factor audit: CF = peak / RMS from",
  "{ENVELOPING_CREST_ABSENT_NOTE}"
);

const kinematicLabelBlock = block(
  'data-testid="enveloping-kinematic-theoretical-note"',
  "</p>"
);

describe("SLICE-VIB-ENV bearing kinematic gating (existing, regression-locked)", () => {
  it("keeps the stored geometry AND gating-quality RPM gate", () => {
    expect(bearingCalculation).toContain("if (!bearingGeometryConfigured) return null;");
    expect(bearingCalculation).toContain("if (!bearingRpmReading.gatingQuality");
    expect(bearingCalculation).toContain("resolveBearingFaultFrequencies(");
    expect(bearingCalculation).not.toContain("1780");
  });

  it("adds the theoretical-kinematic label only when the gate passes", () => {
    expect(src).toContain(
      'const ENVELOPING_KINEMATIC_THEORETICAL_NOTE =\n  "Theoretical kinematic frequencies (from stored geometry + RPM) \\u2014 reference lines for envelope pattern matching, never a confirmed fault.";'
    );
    expect(src).toContain(
      'data-testid="enveloping-kinematic-theoretical-note"'
    );
    // Label must render inside the gate, not unconditionally.
    const labelIdx = src.indexOf('data-testid="enveloping-kinematic-theoretical-note"');
    expect(src.slice(labelIdx - 140, labelIdx)).toContain(
      "{calculatedBearingFaults && ("
    );
    expect(kinematicLabelBlock).toContain(
      "ENVELOPING_KINEMATIC_THEORETICAL_NOTE"
    );
  });

  it("computes kinematics from the stored helper only — no fabricated dims", () => {
    expect(src).toContain('import { resolveBearingFaultFrequencies } from "../lib/vibration/bearingFaultFrequencies";');
    expect(src).not.toMatch(/\bbd\s*=/);
    expect(src).not.toMatch(/\bpd\s*=/);
    expect(src).not.toMatch(/contactAngle\s*=/);
    expect(src).not.toMatch(/1 - \(.*cos/);
  });

  it("keeps the dormant note verbatim for the unconfigured fallback", () => {
    expect(src).toContain(
      'export const ENVELOPING_BEARING_DORMANT_NOTE =\n  "Bearing geometry/RPM not configured \\u2014 envelope trends shown without defect-frequency overlay.";'
    );
    expect(src).toContain('data-testid="enveloping-bearing-dormant-note"');
  });
});

describe("SLICE-VIB-ENV crest-factor audit", () => {
  it("derives the audit from the shared windowed SSOT series", () => {
    expect(crestAuditMemo).toContain("waveformTrendSeries[i]");
    expect(crestAuditMemo).toContain("windowedVibAnalyses.find(");
    expect(crestAuditMemo).toContain("extractVibrationRecordFromAnalysis(row)");
    // No second date predicate, no raw-array pick.
    expect(crestAuditMemo).not.toContain("vibAnalyses");
    expect(crestAuditMemo).not.toContain("filterTrendByTimeRange(");
  });

  it("never recomputes CF — stored waveform metrics only", () => {
    expect(crestAuditMemo).not.toContain("Math.sqrt");
    expect(crestAuditMemo).not.toContain("/ 2 /");
    expect(crestAuditMemo).not.toContain("peak / rms");
  });

  it("renders an honest absence fallback when no window row has a stored CF", () => {
    expect(crestAuditCard).toContain("envelopingCrestAudit ? (");
    expect(crestAuditCard).toContain('data-testid="enveloping-crest-absent-note"');
    expect(src).toContain(
      'export const ENVELOPING_CREST_ABSENT_NOTE =\n  "No stored waveform crest factor in this window \\u2014 no shock index is fabricated.";'
    );
  });

  it("keeps CF dimensionless — no unit conversion inside the audit card", () => {
    expect(crestAuditCard).toContain("dimensionless");
    expect(crestAuditCard).toContain("never convert it");
    expect(crestAuditCard).toContain("no unit conversion");
    for (const forbidden of [
      "velocityValueForDisplay",
      "formatVelocityValue",
      "formatVelocityMmS",
      "formatAccelerationDisplay",
      "frequencyValueForDisplay"
    ]) {
      expect(crestAuditCard).not.toContain(forbidden);
    }
    expect(crestAuditCard).not.toContain("mm/s");
    expect(crestAuditCard).not.toContain("in/s");
  });

  it("labels the CF > 5 flag as an in-repo heuristic, not a standard", () => {
    expect(src).toContain("ENVELOPING_CREST_HEURISTIC_THRESHOLD = 5;");
    // The comparison uses the named constant, never a bare literal.
    expect(crestAuditCard).toContain("ENVELOPING_CREST_HEURISTIC_THRESHOLD");
    expect(crestAuditCard).not.toMatch(/crestFactor\s*>\s*5\b/);
    expect(src).toContain(
      'export const ENVELOPING_CREST_HEURISTIC_NOTE =\n  "Impulsiveness flag CF > 5 is an in-repo heuristic \\u2014 not a published standard. Crest factor is dimensionless (peak / RMS) and is never unit-converted.";'
    );
    expect(src).toContain('data-testid="enveloping-crest-threshold-note"');
  });

  it("fabricates no shock indices", () => {
    // Every "shock" occurrence in the file must be the honest disclosure
    // "no shock index is fabricated" — never a computed or named metric.
    const shockHits = src.match(/shock/gi) ?? [];
    expect(shockHits.length).toBeGreaterThan(0);
    const flat = src.replace(/[\s*]+/g, " ");
    let cursor = 0;
    for (let i = 0; i < shockHits.length; i++) {
      const idx = flat.toLowerCase().indexOf("shock", cursor);
      const context = flat.slice(Math.max(0, idx - 60), idx + 60).toLowerCase();
      expect(context).toContain(
        "no shock index is fabricated"
      );
      cursor = idx + 1;
    }
    expect(src).not.toMatch(/shock\s*pulse/i);
    expect(src).not.toMatch(/spike\s*energy/i);
    expect(src).not.toMatch(/\bgSE\s*metric\b/);
  });
});

describe("SLICE-VIB-ENV unit isolation regression lock", () => {
  it("keeps the envelope unit-physics note verbatim", () => {
    expect(src).toContain(
      'const ENVELOPING_UNIT_PHYSICS_NOTE =\n  "Envelope amplitudes stay in stored gE / gSE (and acceleration in g). The g and Hz display selectors never convert them: gE to velocity/acceleration is frequency-dependent and would need the demodulation band, not just stored RPM.";'
    );
    expect(src).toContain('data-testid="enveloping-unit-physics-note"');
  });

  it("keeps the spectral a=ωv disclosure and mm/s <-> in/s scoping untouched", () => {
    expect(spectralTrendSrc).toContain(
      "velocity \\u2192 acceleration is frequency-dependent (a = \\u03c9v) and needs an order frequency, which requires stored RPM. Only the frequency-independent mm/s \\u2194 in/s conversion is applied"
    );
  });
});
