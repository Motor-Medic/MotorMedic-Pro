// @vitest-environment jsdom
/**
 * SLICE-IR1B — Hotspot & NETA Severity completion (DOM honesty contracts,
 * honesty only, no new arithmetic beyond the stored-derived descriptive slope).
 *
 * Contracts encoded here (DOM-read, throwing):
 *  - stored load % renders VERBATIM (present-if-stored) on the KPI card AND
 *    the NETA repair card; when no load is stored BOTH surfaces render the
 *    IR1 `THERMO_LOAD_DISCLOSURE` verbatim — one gate, one constant
 *  - the stored ΔT / NETA verdict is never adjusted by load presence
 *  - reference-basis sub-label under ΔT: no basis marker → "Baseline type not
 *    specified in scan"; never inferred from ambient vs phase
 *  - ΔT rate-of-change gate: >=2 distinct dates → deterministic descriptive
 *    slope labeled "Descriptive trend, not a failure forecast" (no
 *    extrapolated failure date); single date → honest disclosure + zero slope
 *  - multi-tech presence pill: read-only Vibration/MCSA counts for the same
 *    asset+window, honest "no concurrent runs" when absent, no cross-tech
 *    score/correlation
 *  - regression locks: IR1 surfaces (thermo-kpi-emissivity-provenance,
 *    thermo-kpi-load-disclosure, thermo-kpi-provenance, static repair card,
 *    windowed Fault) stay verbatim
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  expectTestIdAbsent,
  expectTestIdContent,
  expectTextAbsent,
  expectTextRendered,
  loadFixture,
  openTech,
  setupHarness
} from "./contract";
import type { TechFixtureState } from "./contract";
import {
  thermographyFixtures,
  thermographyMultiDateFixture,
  thermographyNoLoadClassifiedFixture
} from "./fixtures";

const harness = setupHarness();

const trendSrc = readFileSync("src/components/TrendAnalyzer.tsx", "utf8");

/**
 * Hand recompute of the IR1B descriptive slope straight from the fixture's
 * stored rows — deliberately NOT calling `thermoDeltaTTrend`. Same-date runs
 * collapse to the latest local calendar date (rows arrive oldest → newest,
 * so later runs overwrite), then (latest ΔT − earliest ΔT) / elapsed days.
 * This is the independent number the DOM must match; if the fixture drifts,
 * this recompute drifts with it and the assertion below fails loudly.
 */
function handRecomputeDeltaTTrend(fixture: TechFixtureState): {
  perDate: number[];
  gapDays: number;
  slopePerDay: number;
} {
  const perDate = new Map<string, { ms: number; deltaT: number }>();
  for (const row of fixture.rows) {
    const timestamp = row.timestamp;
    const peaks = Array.isArray(row.peaks) ? row.peaks : [];
    const peak = peaks.find(
      (p): p is Record<string, unknown> => !!p && typeof p === "object"
    );
    const deltaT = peak?.delta_t;
    if (typeof timestamp !== "string" || typeof deltaT !== "number") continue;
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) continue;
    // LOCAL calendar date — the same dedupe key the contract exercises.
    perDate.set(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, {
      ms: d.getTime(),
      deltaT
    });
  }
  const kept = [...perDate.values()].sort((a, b) => a.ms - b.ms);
  const first = kept[0];
  const last = kept[kept.length - 1];
  const gapDays = (last.ms - first.ms) / 86_400_000;
  return {
    perDate: kept.map((p) => p.deltaT),
    gapDays,
    slopePerDay: (last.deltaT - first.deltaT) / gapDays
  };
}

/* ------------------------------------------------------------------ */
/* Stored load % verbatim + repair-card placement (SAME gate/constant) */
/* ------------------------------------------------------------------ */

describe("SLICE-IR1B stored load % verbatim (KPI + repair card)", () => {
  it("no load stored (classified scan) → BOTH load surfaces render the IR1 disclosure verbatim, no load % anywhere", async () => {
    loadFixture(harness, thermographyNoLoadClassifiedFixture);
    await openTech("thermography");

    expectTestIdContent("thermo-kpi-load-disclosure", [
      "Definitive NETA classification assumes minimum load",
      "load telemetry is not stored for this scan",
      "the verdict is stored-only, not load-corrected"
    ]);
    // NEW repair-card placement: the SAME constant via the SAME gate.
    expectTestIdContent("thermo-repair-card-load", [
      "Definitive NETA classification assumes minimum load",
      "the verdict is stored-only, not load-corrected"
    ]);
    // No stored load % may appear when nothing is stored.
    expectTestIdAbsent("thermo-kpi-stored-load");
    expectTextAbsent(/Load:\s*\d+(\.\d+)?%\s*\(stored\)/);
  });

  it("load stored (75%) → % verbatim on KPI card and repair card; disclosure absent; verdict unchanged", async () => {
    loadFixture(harness, thermographyFixtures.good);
    await openTech("thermography");

    // Verbatim stored value, present-if-stored, both placements.
    expectTestIdContent("thermo-kpi-stored-load", ["Load: 75% (stored)"]);
    expectTestIdContent("thermo-repair-card-load", ["Load: 75% (stored)"]);
    expectTestIdAbsent("thermo-kpi-load-disclosure");

    // The stored NETA verdict is NEVER adjusted by load presence.
    expectTestIdContent("thermo-kpi-provenance", [
      "Fault / NETA verdict stored from the saved scan — not ΔT-derived."
    ]);
    expectTextRendered(/NETA:\s*Class 2/);
    expectTextRendered(/Schedule repair within 30 days/);
    // ΔT renders unchanged as stored.
    expectTextRendered(/ΔT:\s*50°F/);
  });
});

/* ------------------------------------------------------------------ */
/* Reference-basis sub-label under ΔT (stored-only)                    */
/* ------------------------------------------------------------------ */

describe("SLICE-IR1B reference-basis sub-label", () => {
  it("no basis field in schema → 'Baseline type not specified in scan' under ΔT", async () => {
    loadFixture(harness, thermographyFixtures.good);
    await openTech("thermography");

    expectTestIdContent("thermo-reference-basis", [
      "Baseline type not specified in scan"
    ]);
    // ΔT itself is untouched by the basis disclosure.
    expectTextRendered(/ΔT:\s*50°F/);
  });

  it("no thermography data → no basis surface at all", async () => {
    loadFixture(harness, thermographyFixtures.empty);
    await openTech("thermography");

    expectTestIdAbsent("thermo-reference-basis");
  });
});

/* ------------------------------------------------------------------ */
/* ΔT rate-of-change gate (descriptive only)                           */
/* ------------------------------------------------------------------ */

describe("SLICE-IR1B ΔT rate-of-change gate", () => {
  it("single date → zero slope + honest single-date disclosure, no forecast", async () => {
    loadFixture(harness, thermographyFixtures.edge);
    await openTech("thermography");

    const gate = expectTestIdContent("thermo-dt-trend-gate", [
      "ΔT trend: 0°F/day",
      "One inspection date stored in this window",
      "slope held at 0"
    ]);
    expect(gate.textContent).toContain("Descriptive trend, not a failure forecast");
    // No extrapolated failure date / prediction anywhere.
    expectTextAbsent(/predicted failure/i);
    expectTextAbsent(/failure in \d+ days/i);
    expectTextAbsent(/projected/i);
  });

  it("multi-date → deterministic descriptive slope (+2°F/day) with dedupe note; never a forecast", async () => {
    loadFixture(harness, thermographyMultiDateFixture);
    await openTech("thermography");

    // PROOF the expectation is descriptive, not fabricated: recompute from the
    // fixture's stored ΔT + timestamps. Same-date runs dedupe to the latest
    // (99 at 16:00 is dropped, 50 at 20:00 kept); the surviving pair is ΔT 40
    // exactly 5 days earlier → (50 − 40) / 5 = +2 °F/day.
    const hand = handRecomputeDeltaTTrend(thermographyMultiDateFixture);
    expect(hand.perDate).toEqual([40, 50]);
    expect(hand.gapDays).toBeCloseTo(5, 9);
    expect(hand.slopePerDay).toBeCloseTo(2, 9);

    const gate = expectTestIdContent("thermo-dt-trend-gate", [
      `ΔT trend: +${hand.slopePerDay}°F/day`,
      "2 distinct inspection dates in the active window",
      "same-date runs deduplicated (latest per date)"
    ]);
    // The displayed slope is the hand-recomputed descriptive fit, verbatim.
    expect(gate.textContent).toContain("ΔT trend: +2°F/day");
    expect(gate.textContent).toContain("Descriptive trend, not a failure forecast");
    expectTextAbsent(/predicted failure/i);
    expectTextAbsent(/failure in \d+ days/i);
  });

  it("no stored ΔT in window → honest no-data line, no slope invented", async () => {
    loadFixture(harness, thermographyFixtures.empty);
    await openTech("thermography");

    expectTestIdAbsent("thermo-dt-trend-gate");
  });
});

/* ------------------------------------------------------------------ */
/* Multi-tech presence pill (read-only, asset + window)                */
/* ------------------------------------------------------------------ */

describe("SLICE-IR1B multi-tech presence pill", () => {
  it("no concurrent Vibration/MCSA runs → honest disclosure, link still offered, no score", async () => {
    loadFixture(harness, thermographyFixtures.good);
    await openTech("thermography");

    const pill = expectTestIdContent("thermo-multi-tech-presence-pill", [
      "No concurrent Vibration / MCSA runs in this window",
      "Open Multi-Tech Fusion",
      "Read-only presence check for this asset and window",
      "no cross-technology scoring, correlation, or fusion arithmetic"
    ]);
    // No cross-tech score or correlation may leak into the pill.
    expect(pill.textContent).not.toMatch(/fusion score|correlation score|combined score/i);
  });

  it("Vibration + MCSA stored in-window → counts render; still no score", async () => {
    loadFixture(harness, thermographyMultiDateFixture);
    await openTech("thermography");

    const pill = expectTestIdContent("thermo-multi-tech-presence-pill", [
      "Concurrent runs in this window — Vibration: 1 · MCSA: 1",
      "Open Multi-Tech Fusion"
    ]);
    expect(pill.textContent).not.toMatch(/fusion score|correlation score|combined score/i);
    // The thermography verdict stays thermography-only (stored verdict).
    expectTestIdContent("thermo-kpi-provenance", [
      "Fault / NETA verdict stored from the saved scan — not ΔT-derived."
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Regression locks — IR1 + VERIFY-IR1 surfaces stay verbatim          */
/* ------------------------------------------------------------------ */

describe("SLICE-IR1B regression locks (IR1 / VERIFY-IR1 untouched)", () => {
  it("IR1 disclosure surfaces render verbatim and their testids are singletons", async () => {
    loadFixture(harness, thermographyNoLoadClassifiedFixture);
    await openTech("thermography");

    expectTestIdContent("thermo-kpi-provenance", [
      "Fault / NETA verdict stored from the saved scan — not ΔT-derived."
    ]);
    expectTestIdContent("thermo-unit-isolation-note", [
      "Reference temps (ambient / T_ref)",
      "concentration fields (ppm) never convert"
    ]);
    expectTestIdContent("thermo-kpi-load-disclosure", [
      "Definitive NETA classification assumes minimum load"
    ]);
    // The stored Fault is read from the WINDOWED row, not the unwindowed
    // latest (VERIFY-IR1 lock).
    expectTextRendered(/Fault:\s*Loose connection/);
  });

  it("source lock: IR1B added new surfaces without replacing any IR1 surface", () => {
    expect(trendSrc.match(/thermo-kpi-provenance/g)?.length).toBe(1);
    expect((trendSrc.match(/not ΔT-derived/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(trendSrc).toContain("not recomputed from ΔT");
    expect(trendSrc).toContain("Static NETA / NFPA 70B reference guidance keyed to the");
    expect(trendSrc.match(/thermo-kpi-load-disclosure/g)?.length).toBe(1);
    expect(trendSrc.match(/thermo-kpi-emissivity-provenance/g)?.length).toBe(1);
    // The windowed Fault surface is unchanged (VERIFY-IR1 lock).
    expect(
      (trendSrc.match(/windowedThermoAnalyses\[0\]\?\.primary_fault \|\| NOT_REPORTED/g) ?? [])
        .length
    ).toBe(1);
  });
});
