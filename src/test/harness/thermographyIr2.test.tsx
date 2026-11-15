// @vitest-environment jsdom
/**
 * SLICE-IR2 — Thermography Phase Delta & I²R Load (DOM honesty contracts,
 * honesty only; the only new arithmetic is the stored-value ratio itself).
 *
 * Contracts encoded here (DOM-read, throwing, plus SSOT source locks):
 *  - I²R badge is DESCRIPTIVE ONLY: with stored PER-PHASE currents AND
 *    per-phase temps it renders the stored current ratio + the stored ΔT,
 *    labeled "P ∝ I²R is an in-repo heuristic, not a standard"; with them
 *    absent it renders the exact "phase currents not stored - proportionality
 *    not computed" disclosure. Per-phase current is NEVER inferred from the
 *    run's total measured amps, and NO causal diagnosis ("consistent with
 *    resistive heating" et al.) is ever rendered unless stored.
 *  - ambient-provenance badge is present-if-stored: a stored ambient renders
 *    "Ambient reference stored (X); no drift compensation applied." verbatim
 *    in its STORED unit; no ambient → no badge; "Normalized" is never claimed
 *    and no synthetic weather/drift model backs it.
 *  - unit lockstep: phase temps/ΔT follow the °C/°F display preference while
 *    load %, amps, and the stored severity class stay unscaled; the ambient
 *    reference stays in stored units.
 *  - regression locks: sub-tab 1 IR1/IR1B surfaces, the sub-tab 2 "Current
 *    operating point, not a projection" line, the ≥40% validity-band labels,
 *    and the stored severity class (verbatim, never recomputed) all render
 *    byte-identical.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import {
  ContractViolation,
  expectTestIdAbsent,
  expectTestIdContent,
  expectTextAbsent,
  expectTextRendered,
  loadFixture,
  openTech,
  plantDomLie,
  setupHarness
} from "./contract";
import {
  thermographyCurrentsWithoutTempsFixture,
  thermographyFixtures,
  thermographyPhaseCurrentsFixture
} from "./fixtures";
import {
  NOT_MEASURED,
  THERMO_I2R_CURRENTS_WITHOUT_TEMPS,
  THERMO_I2R_HEURISTIC_LABEL,
  THERMO_I2R_PHASE_CURRENTS_NOT_STORED,
  buildThermoChartSeries,
  thermoAmbientProvenanceLabel,
  thermoI2rProportionality
} from "../../lib/thermographyTrendSeries";

const harness = setupHarness();

const trendSrc = readFileSync("src/components/TrendAnalyzer.tsx", "utf8");
const seriesSrc = readFileSync(
  "src/lib/thermographyTrendSeries.ts",
  "utf8"
);
const migrationSrc = readFileSync(
  "migrations/001_analysis_results_polymorphic_thermography.sql",
  "utf8"
);

/* ------------------------------------------------------------------ */
/* I²R badge — per-phase currents ABSENT (the schema-verdict path)      */
/* ------------------------------------------------------------------ */

describe("SLICE-IR2 I²R badge — per-phase currents absent", () => {
  it("phase temps stored but no per-phase currents → exact not-stored disclosure, no ratio, no causal claim", async () => {
    loadFixture(harness, thermographyFixtures.good);
    await openTech("thermography", /Phase Delta/);

    const badge = expectTestIdContent("thermo-i2r-descriptive-badge", [
      THERMO_I2R_PHASE_CURRENTS_NOT_STORED,
      THERMO_I2R_HEURISTIC_LABEL,
      "per-phase current is never inferred from the run's total measured amps"
    ]);
    // Descriptive only — no proportionality, no causal diagnosis.
    expect(badge.textContent).not.toMatch(/Stored ratio I_A/);
    expect(badge.textContent).not.toMatch(/resistive|consistent with/i);
    expect(badge.textContent).not.toMatch(/Normalized/i);
  });

  it("no thermography data → no badge surface at all", async () => {
    loadFixture(harness, thermographyFixtures.empty);
    await openTech("thermography", /Phase Delta/);

    expectTestIdAbsent("thermo-i2r-descriptive-badge");
  });

  it("per-phase currents stored WITHOUT per-phase temps → honest middle disclosure, still no ratio", async () => {
    loadFixture(harness, thermographyCurrentsWithoutTempsFixture);
    await openTech("thermography", /Phase Delta/);

    const badge = expectTestIdContent("thermo-i2r-descriptive-badge", [
      THERMO_I2R_CURRENTS_WITHOUT_TEMPS,
      THERMO_I2R_HEURISTIC_LABEL
    ]);
    expect(badge.textContent).not.toMatch(/Stored ratio I_A/);
    expect(badge.textContent).not.toMatch(/resistive|consistent with/i);
  });

  it("mutation red: a planted causal lie trips the no-diagnosis contract", async () => {
    loadFixture(harness, thermographyFixtures.good);
    await openTech("thermography", /Phase Delta/);

    // GREEN before the lie: nothing causal renders.
    expectTextAbsent(/consistent with resistive heating/i);

    plantDomLie("Phase delta consistent with resistive heating under load");
    expect(() =>
      expectTextAbsent(/consistent with resistive heating/i)
    ).toThrow(ContractViolation);
  });
});

/* ------------------------------------------------------------------ */
/* I²R badge — per-phase currents PRESENT (descriptive stored ratio)    */
/* ------------------------------------------------------------------ */

describe("SLICE-IR2 I²R badge — per-phase currents present", () => {
  it("stored 100/98/95 A markers + phase temps → descriptive stored ratio + stored ΔT, in-repo heuristic label", async () => {
    loadFixture(harness, thermographyPhaseCurrentsFixture);
    await openTech("thermography", /Phase Delta/);

    const badge = expectTestIdContent("thermo-i2r-descriptive-badge", [
      "I_A: 100 A · I_B: 98 A · I_C: 95 A (stored)",
      "Stored ratio I_A : I_B : I_C = 1 : 0.98 : 0.95 (relative to Phase A)",
      `stored ΔT 50°F`,
      THERMO_I2R_HEURISTIC_LABEL
    ]);
    // Descriptive only — no causal diagnosis unless stored.
    expect(badge.textContent).not.toMatch(/resistive|consistent with/i);
    expect(badge.textContent).not.toMatch(/Normalized/i);
  });

  it("the stored TOTAL (300 A measured_amps) never becomes the ratio source", async () => {
    loadFixture(harness, thermographyPhaseCurrentsFixture);
    await openTech("thermography", /Phase Delta/);

    // The total renders raw on the load KPI card…
    expectTextRendered(/300 A \/ 400 A rated/);
    // …but the ratio keeps the stored per-phase figures — never a 1:1:1
    // three-way split of the total.
    expectTextAbsent(/1 : 1 : 1/);
    expectTextAbsent(/I_A: 100 A · I_B: 100 A · I_C: 100 A/);
  });
});

/* ------------------------------------------------------------------ */
/* Ambient-provenance badge — present-if-stored, never "Normalized"     */
/* ------------------------------------------------------------------ */

describe("SLICE-IR2 ambient-provenance badge", () => {
  it("ambient stored (70°F) → exact provenance phrase, stored unit, no compensation claim", async () => {
    loadFixture(harness, thermographyFixtures.good);
    await openTech("thermography", /Phase Delta/);

    const badge = expectTestIdContent("thermo-ambient-provenance-badge", [
      "Ambient reference stored (70°F); no drift compensation applied."
    ]);
    // "Normalized" is never claimed, and no compensation/correction is ever
    // claimed to have been APPLIED (the honest note only denies one).
    expect(badge.textContent).not.toMatch(/Normalized/i);
    expect(badge.textContent).not.toMatch(
      /weather-corrected|drift-compensated|ambient-compensated|compensated for (weather|ambient)/i
    );
  });

  it("no ambient stored → no badge at all (honest absence, no fabricated reference)", async () => {
    loadFixture(harness, thermographyFixtures.edge);
    await openTech("thermography", /Phase Delta/);

    expectTestIdAbsent("thermo-ambient-provenance-badge");
    expectTextAbsent(/Ambient reference stored/);
  });

  it("no thermography data → no badge surface at all", async () => {
    loadFixture(harness, thermographyFixtures.empty);
    await openTech("thermography", /Phase Delta/);

    expectTestIdAbsent("thermo-ambient-provenance-badge");
  });
});

/* ------------------------------------------------------------------ */
/* Unit lockstep — °C preference converts temps only                    */
/* ------------------------------------------------------------------ */

describe("SLICE-IR2 unit lockstep (Phase Delta tab)", () => {
  it("°C display preference converts phase temps/ΔT; load %, amps, ratio, severity class, ambient reference stay unscaled", async () => {
    harness.tenantSettings = { display_units: { temperature: "°C" } };
    loadFixture(harness, thermographyPhaseCurrentsFixture);
    await openTech("thermography", /Phase Delta/);

    // Measured phase temps convert affinely: 118°F → 47.8°C.
    expectTextRendered(/47\.8°C/);
    // The stored ΔT converts by scale only: 50°F → 27.8°C.
    expectTextRendered(/stored ΔT 27\.8°C/);
    // Load % stays a raw percent — never temperature-scaled or re-unit-ed.
    expectTextRendered(/75%/);
    expectTextAbsent(/75°C/);
    // Amps stay amps, raw — including the stored total on the load KPI card.
    expectTextRendered(/300 A \/ 400 A rated/);
    // The stored per-phase current ratio is dimensionless — unconverted.
    expectTextRendered(/1 : 0\.98 : 0\.95/);
    // The stored severity class stays a class, never a temperature.
    expectTextRendered(/Class 2 \(MEDIUM\)/);
    expectTextAbsent(/Class 2 \(MEDIUM\)\s*°/);
    // The ambient reference is a REFERENCE value: it keeps its stored unit
    // even under a °C display preference.
    expectTestIdContent("thermo-ambient-provenance-badge", [
      "Ambient reference stored (70°F); no drift compensation applied."
    ]);
    expectTextAbsent(/Ambient reference stored \(70°C\)/);
  });

  it("source lock: only measured temps/deltas route through the projection", () => {
    expect(trendSrc).toContain("phaseA: absolute(point.phaseA, from)");
    expect(trendSrc).toContain("phaseB: absolute(point.phaseB, from)");
    expect(trendSrc).toContain("phaseC: absolute(point.phaseC, from)");
    expect(trendSrc).toContain("deltaT: difference(point.deltaT, from)");
    // Load %, amps, and the severity class have NO conversion route.
    expect(trendSrc).not.toContain("loadPercent: absolute");
    expect(trendSrc).not.toContain("loadPercent: difference");
    expect(trendSrc).not.toContain("currentAmps: absolute");
    expect(trendSrc).not.toContain("ratedAmps: absolute");
    expect(trendSrc).not.toContain("severityClass: absolute");
    // The phase series/KPIs stay bound to the shared window predicate.
    expect(trendSrc).toContain(
      "buildThermoChartSeries(windowedThermoAnalyses)"
    );
    expect(trendSrc).toContain(
      "windowTrendByTimeRange(thermoAnalyses, timeRange)"
    );
  });
});

/* ------------------------------------------------------------------ */
/* Regression locks — IR1/IR1B/VS7 surfaces render byte-identical       */
/* ------------------------------------------------------------------ */

describe("SLICE-IR2 regression locks (IR1 / IR1B / VS7 verbatim)", () => {
  it("sub-tab 2 locks: operating-point line + ≥40% validity-band labels unchanged", async () => {
    loadFixture(harness, thermographyFixtures.good);
    await openTech("thermography", /Phase Delta/);

    expectTextRendered("Current operating point, not a projection");
    expectTextRendered(
      "Phase Delta & I²R Load — Phase A/B/C temperatures with ≥40% load validity band"
    );
    expectTextRendered(
      "Green band = operational validity (≥40% load)"
    );
    // The parked projection never returns.
    expectTextAbsent(/I²R-corrected rise @ 100% load/);
    expectTextAbsent(/Normalized ΔT Projection/);
    expectTextAbsent(/@ 100% load/);
  });

  it("sub-tab 1 locks: stored load, provenance, basis, isolation note, stored severity class verbatim", async () => {
    loadFixture(harness, thermographyFixtures.good);
    await openTech("thermography");

    expectTestIdContent("thermo-kpi-stored-load", ["Load: 75% (stored)"]);
    expectTestIdContent("thermo-kpi-provenance", [
      "Fault / NETA verdict stored from the saved scan — not ΔT-derived."
    ]);
    expectTestIdContent("thermo-reference-basis", [
      "Baseline type not specified in scan"
    ]);
    expectTestIdContent("thermo-unit-isolation-note", [
      "Reference temps (ambient / T_ref)",
      "concentration fields (ppm) never convert"
    ]);
    expectTestIdContent("thermo-repair-card-load", ["Load: 75% (stored)"]);
    // Stored severity class renders verbatim and is NEVER recomputed from
    // ΔT (ΔT 50°F is Class 3 territory; the stored Class 2 wins).
    expectTextRendered(/NETA:\s*Class 2/);
    expectTextRendered(/Schedule repair within 30 days/);
    expectTextRendered(/ΔT:\s*50°F/);
  });

  it("source lock: IR2 added surfaces without replacing any IR1/IR1B surface", () => {
    // New surfaces are singletons…
    expect(trendSrc.match(/thermo-i2r-descriptive-badge/g)?.length).toBe(1);
    expect(trendSrc.match(/thermo-ambient-provenance-badge/g)?.length).toBe(1);
    // …and every IR1/IR1B surface is still present, still a singleton.
    expect(trendSrc.match(/thermo-kpi-provenance/g)?.length).toBe(1);
    expect(trendSrc.match(/thermo-kpi-load-disclosure/g)?.length).toBe(1);
    expect(trendSrc.match(/thermo-kpi-emissivity-provenance/g)?.length).toBe(1);
    expect(trendSrc.match(/thermo-reference-basis/g)?.length).toBe(1);
    expect(trendSrc.match(/thermo-dt-trend-gate/g)?.length).toBe(1);
    expect(
      trendSrc.match(/thermo-multi-tech-presence-pill/g)?.length
    ).toBe(1);
    expect(trendSrc).toContain("not ΔT-derived");
    expect(trendSrc).toContain("not recomputed from ΔT");
    expect(trendSrc).toContain("Current operating point, not a projection");
    // The parked I²R projection stays parked: no surface renders it.
    expect(trendSrc).not.toContain("i2rNormalizedDelta");
    expect(trendSrc).not.toContain("formatTemperatureProjection");
  });

  it("source lock: the phase block stays free of imbalance / cross-tech fusion wording", () => {
    const phaseBlock = trendSrc.slice(
      trendSrc.indexOf("TAB 2"),
      trendSrc.indexOf("TAB 3")
    );
    expect(phaseBlock.length).toBeGreaterThan(0);
    expect(phaseBlock).not.toMatch(/phase[-_ ]imbalance/i);
    expect(phaseBlock).not.toMatch(
      /BPFO|BPFI|loose connection correlates|impacts\/sec|MCSA|vibration/i
    );
    // The migration still stores NO per-phase current columns (IR2 added
    // none — extraction is JSONB-marker-only, present-if-stored).
    expect(migrationSrc).not.toMatch(/phase_[abc]_amp/i);
  });

  it("SSOT lock: the new IR2 disclosure constants are generic (no §/Table/percent band)", () => {
    for (const constant of [
      THERMO_I2R_HEURISTIC_LABEL,
      THERMO_I2R_PHASE_CURRENTS_NOT_STORED,
      THERMO_I2R_CURRENTS_WITHOUT_TEMPS
    ]) {
      expect(constant).not.toMatch(/§/);
      expect(constant).not.toMatch(/Table\s*\d/i);
      expect(constant).not.toMatch(/≥\s*\d+%?/);
      expect(constant).not.toMatch(/\d+\s*%/);
      expect(constant).not.toMatch(/NFPA|NETA|ISO|ASTM/i);
    }
    expect(seriesSrc).toContain("thermoI2rProportionality");
    expect(seriesSrc).toContain("thermoAmbientProvenanceLabel");
  });
});

/* ------------------------------------------------------------------ */
/* Pure extraction + badge state (no DOM)                               */
/* ------------------------------------------------------------------ */

/** Row factory mirroring thermographyDisclosure.test.tsx's shape. */
function row(
  options: {
    peakExtras?: Record<string, unknown>;
    polymorphic?: Record<string, unknown>;
    rowExtras?: Record<string, unknown>;
    environmental?: Record<string, unknown>;
  } = {}
): SavedAnalysisResult {
  return {
    id: "row-1",
    asset_id: "asset-1",
    component: null,
    analysis_type: "thermography",
    timestamp: "2026-11-13T09:00:00.000Z",
    health_score: 60,
    primary_fault: "Loose connection",
    fault_list: [],
    recommendations: [],
    financial_impact: {},
    severity: null,
    spectrum_image_url: null,
    peaks: [
      {
        type: "thermography",
        hotspot_temp: 120,
        reference_temp: 70,
        delta_t: 50,
        severity_class: "Class 2",
        phase_a_temp: 118,
        phase_b_temp: 108,
        phase_c_temp: 104,
        ...(options.peakExtras ?? {})
      }
    ],
    telemetry_data: {
      environmental: { temp_unit: "°F", ...(options.environmental ?? {}) },
      ...(options.polymorphic
        ? { polymorphic: options.polymorphic }
        : {})
    },
    ...(options.rowExtras ?? {})
  } as unknown as SavedAnalysisResult;
}

describe("SLICE-IR2 pure extraction + badge state", () => {
  it("a stored TOTAL measured_amps is never split into per-phase currents", () => {
    const [point] = buildThermoChartSeries([
      row({ rowExtras: { measured_amps: 300, rated_amps: 400 } })
    ]);
    expect(point.currentAmps).toBe(300);
    expect(point.phaseCurrentA ?? null).toBeNull();
    expect(point.phaseCurrentB ?? null).toBeNull();
    expect(point.phaseCurrentC ?? null).toBeNull();
  });

  it("explicit per-phase markers extract (peak, polymorphic, extracted)", () => {
    const [peakSide] = buildThermoChartSeries([
      row({
        peakExtras: { phase_a_amps: 100, phase_b_amps: 98, phase_c_amps: 95 }
      })
    ]);
    expect(peakSide.phaseCurrentA).toBe(100);
    expect(peakSide.phaseCurrentB).toBe(98);
    expect(peakSide.phaseCurrentC).toBe(95);

    const [polySide] = buildThermoChartSeries([
      row({
        polymorphic: {
          phase_a_amps: 100,
          phase_b_current: 98,
          phase_c_amps: 95
        }
      })
    ]);
    expect(polySide.phaseCurrentA).toBe(100);
    expect(polySide.phaseCurrentB).toBe(98);
    expect(polySide.phaseCurrentC).toBe(95);
  });

  it("thermoI2rProportionality: null point, not-stored, middle, and stored-ratio states", () => {
    expect(thermoI2rProportionality(null, "°F")).toBeNull();

    // Temps stored, currents not → not-stored.
    expect(
      thermoI2rProportionality(
        { phaseA: 118, phaseB: 108, phaseC: 104, deltaT: 50 },
        "°F"
      )
    ).toEqual({ status: "not-stored" });

    // Currents stored, temps not → currents-without-temps.
    expect(
      thermoI2rProportionality(
        {
          phaseA: null,
          phaseB: null,
          phaseC: null,
          phaseCurrentA: 100,
          phaseCurrentB: 98,
          phaseCurrentC: 95,
          deltaT: 50
        },
        "°F"
      )
    ).toEqual({ status: "currents-without-temps" });

    // Both stored → descriptive stored ratio; the ONLY arithmetic is the
    // stored-value ratio (each current / Phase A, 2 decimals).
    expect(
      thermoI2rProportionality(
        {
          phaseCurrentA: 100,
          phaseCurrentB: 98,
          phaseCurrentC: 95,
          phaseA: 118,
          phaseB: 108,
          phaseC: 104,
          deltaT: 50
        },
        "°F"
      )
    ).toEqual({
      status: "stored-ratio",
      currentsText: "I_A: 100 A · I_B: 98 A · I_C: 95 A (stored)",
      ratioText:
        "Stored ratio I_A : I_B : I_C = 1 : 0.98 : 0.95 (relative to Phase A)",
      deltaTText: "50°F"
    });

    // ΔT missing → NOT_MEASURED, never a fabricated figure.
    expect(
      thermoI2rProportionality(
        {
          phaseCurrentA: 100,
          phaseCurrentB: 100,
          phaseCurrentC: 100,
          phaseA: 118,
          phaseB: 118,
          phaseC: 118,
          deltaT: null
        },
        "°F"
      )
    ).toEqual({
      status: "stored-ratio",
      currentsText: "I_A: 100 A · I_B: 100 A · I_C: 100 A (stored)",
      ratioText:
        "Stored ratio I_A : I_B : I_C = 1 : 1 : 1 (relative to Phase A)",
      deltaTText: NOT_MEASURED
    });
  });

  it("thermoAmbientProvenanceLabel: present-if-stored, stored unit, fallback unit", () => {
    expect(thermoAmbientProvenanceLabel(null, "°F")).toBeNull();
    expect(
      thermoAmbientProvenanceLabel({ ambientReferenceTemp: null, tempUnit: "°F" }, "°F")
    ).toBeNull();
    expect(
      thermoAmbientProvenanceLabel(
        { ambientReferenceTemp: 70, tempUnit: "°F" },
        "°C"
      )
    ).toBe("Ambient reference stored (70°F); no drift compensation applied.");
    // No per-run unit → the fallback stored unit labels the value.
    expect(
      thermoAmbientProvenanceLabel(
        { ambientReferenceTemp: 21.25, tempUnit: null },
        "°C"
      )
    ).toBe("Ambient reference stored (21.3°C); no drift compensation applied.");
  });
});
