// @vitest-environment jsdom
/**
 * SLICE-IR4 — Thermography Mechanical & Refractory (4th sub-tab), honesty only.
 *
 * Contracts encoded here (DOM-read plus SSOT source locks):
 *  - every card is present-if-stored and states the limit it judges against:
 *    bearing = no stored bearing limit (descriptive only), refractory = the
 *    scan's stored max allowable, friction = stored class/flag only, creep =
 *    no limit (descriptive slope);
 *  - creep velocity is the existing descriptive least-squares slope, labelled
 *    "not a failure forecast";
 *  - remaining-life / erosion / thickness-loss / extrapolated failure-date
 *    projections stay parked (AQ pattern) and are never rendered;
 *  - ambient reference temperatures stay in stored units and never enter the
 *    converted axis;
 *  - regression locks N-IR1 / N-IR1B / N-IR2 / N-IR3 / N-VS9 stay verbatim.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  expectTestIdContent,
  expectTextAbsent,
  expectTextRendered,
  loadFixture,
  openTech,
  setupHarness
} from "./contract";
import {
  thermographyFixtures,
  thermographyMechanicalFixture
} from "./fixtures";
import {
  NOT_MEASURED,
  THERMO_DT_TREND_DISCLOSURE,
  THERMO_EMISSIVITY_LABEL,
  THERMO_I2R_HEURISTIC_LABEL,
  THERMO_LOAD_DISCLOSURE,
  THERMO_MECH_CREEP_LABEL,
  THERMO_MECH_PARKED_NOTE,
  thermoMechLimitCitations
} from "../../lib/thermographyTrendSeries";

const harness = setupHarness();

const trendSrc = readFileSync("src/components/TrendAnalyzer.tsx", "utf8");
const seriesSrc = readFileSync(
  "src/lib/thermographyTrendSeries.ts",
  "utf8"
);

const mechanicalBlock = trendSrc.slice(
  trendSrc.indexOf("TAB 4 — Mechanical & Refractory"),
  trendSrc.indexOf("ULTRASOUND TECH CONTENT")
);

/* ------------------------------------------------------------------ */
/* Present-if-stored citations                                        */
/* ------------------------------------------------------------------ */

describe("SLICE-IR4 limit citations (present-if-stored)", () => {
  it("absent limit / flag confessions — no external standard, no fabricated threshold", () => {
    const citations = thermoMechLimitCitations(null);
    expect(citations.bearing).toContain("no bearing-housing limit stored");
    expect(citations.refractory).toContain("no stored max allowable");
    expect(citations.friction).toContain("no friction class or flag");
    expect(citations.creep).toContain("no thermal-creep limit stored");
    expect(citations.creep).toContain("not a forecast");

    for (const text of Object.values(citations)) {
      expect(text).not.toMatch(/§/);
      expect(text).not.toMatch(/ASTM\s+[A-Z]?\d/i);
      expect(text).not.toMatch(/ISO\s*\d/);
      expect(text).not.toMatch(/NFPA\s*\d/);
    }
  });

  it("stored limit / class are cited as the scan's own values", () => {
    const citations = thermoMechLimitCitations({
      maxAllowable: 260,
      frictionalSeverity: "Class 2 — Moderate",
      frictionalAnomaly: true
    });
    expect(citations.refractory).toContain("stored max allowable limit");
    expect(citations.friction).toContain("stored friction class / flag only");
    expect(citations.bearing).toContain("no bearing-housing limit stored");
  });

  it("DOM: stored readings + stored-limit citations render verbatim", async () => {
    loadFixture(harness, thermographyMechanicalFixture);
    await openTech("thermography", /Mechanical/);

    expectTextRendered("DE: 140°F");
    expectTextRendered("ODE: 135°F");
    expectTextRendered("Skin: 220°F");
    expectTextRendered("Max: 260°F");
    expectTextRendered("Class 2 — Moderate");

    expectTestIdContent("thermo-mech-bearing-limit-source", [
      "no bearing-housing limit stored"
    ]);
    expectTestIdContent("thermo-mech-refractory-limit-source", [
      "stored max allowable limit (analysis row / peaks)"
    ]);
    expectTestIdContent("thermo-mech-friction-limit-source", [
      "stored friction class / flag only"
    ]);
    expectTestIdContent("thermo-mech-creep-limit-source", [
      "no thermal-creep limit stored",
      "not a forecast"
    ]);
  });

  it("DOM: absent readings render the null vocabulary and absent-limit confessions", async () => {
    loadFixture(harness, thermographyFixtures.edge);
    await openTech("thermography", /Mechanical/);

    expectTextRendered(NOT_MEASURED);
    expectTestIdContent("thermo-mech-refractory-limit-source", [
      "no stored max allowable"
    ]);
    expectTestIdContent("thermo-mech-friction-limit-source", [
      "no friction class or flag"
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Creep velocity — descriptive slope, never a forecast               */
/* ------------------------------------------------------------------ */

describe("SLICE-IR4 creep velocity is descriptive", () => {
  it("labels the stored-skin least-squares slope as descriptive, not a forecast", () => {
    expect(THERMO_MECH_CREEP_LABEL).toBe(
      "Descriptive least-squares slope across stored skin temperatures — not a failure forecast."
    );
    expect(mechanicalBlock).toContain("THERMO_MECH_CREEP_LABEL");
    expect(mechanicalBlock).toContain("${mechCreepRate}${thermoDisplayUnit}/day");
    expect(mechanicalBlock).not.toMatch(
      /\b(daysToFailure|daysUntilFailure|failureDate|failure_date|projectedFailure)\b/i
    );
  });

  it("DOM: three distinct dates produce the hand-recomputed 2.5°F/day slope", async () => {
    loadFixture(harness, thermographyMechanicalFixture);
    await openTech("thermography", /Mechanical/);

    // 200 → 210 → 220 °F across three distinct dates = 2.5 °F/day.
    expectTextRendered("2.5°F/day");
  });
});

/* ------------------------------------------------------------------ */
/* Parked projection family (AQ pattern)                              */
/* ------------------------------------------------------------------ */

describe("SLICE-IR4 parked projections", () => {
  it("renders the parked disclosure and never a remaining-life / erosion / thickness number", async () => {
    loadFixture(harness, thermographyMechanicalFixture);
    await openTech("thermography", /Mechanical/);

    expectTestIdContent("thermo-mech-parked-note", [THERMO_MECH_PARKED_NOTE]);
    expectTextAbsent(/remaining[- ]life\s*[:=]\s*\d/i);
    expectTextAbsent(/thickness[- ]loss\s*[:=]\s*\d/i);
    expectTextAbsent(/erosion[- ]rate\s*[:=]\s*\d/i);
    expectTextAbsent(/\b\d+\s*(days|weeks|months)\s*(to|until)\b/i);
  });

  it("source: no projection identifier or extrapolation helper exists", () => {
    expect(mechanicalBlock).toContain('data-testid="thermo-mech-parked-note"');
    expect(mechanicalBlock).not.toMatch(
      /\b(projection|forecast|remaining|erosion|thickness)\b/i
    );
    expect(mechanicalBlock).not.toMatch(
      /remaining[- ]life\s*[:=]\s*\d|thickness[- ]loss\s*[:=]\s*\d|erosion[- ]rate\s*[:=]\s*\d/i
    );
    expect(seriesSrc).not.toMatch(
      /\b(daysToFailure|daysUntilFailure|failureDate|failure_date|projectedFailure|remainingLife|remaining_life|thicknessLoss|thickness_loss|erosionRate|erosion_rate)\b/i
    );
  });
});

/* ------------------------------------------------------------------ */
/* Unit isolation — ambient stays in stored units                     */
/* ------------------------------------------------------------------ */

describe("SLICE-IR4 ambient unit isolation", () => {
  it("DOM: °C preference converts absolutes but leaves the ambient note in stored °F", async () => {
    harness.tenantSettings = { display_units: { temperature: "°C" } };
    loadFixture(harness, thermographyMechanicalFixture);
    await openTech("thermography", /Mechanical/);

    // 140°F → 60°C, 220°F → 104.4°C (affine, stored absolutes).
    expectTextRendered(/DE:\s*60°C/);
    expectTextRendered(/Skin: 104\.4°C/);
    // Ambient reference stays verbatim in its stored unit.
    expectTextRendered(/Ambient reference: 70°F \(stored units\)/);
    expectTextAbsent(/Ambient reference: 21\.1°C/);
  });

  it("source: the mechanical tab consumes the stored-unit ambient note", () => {
    expect(mechanicalBlock).toContain("thermoAmbientStoredNote");
    expect(seriesSrc).not.toContain(
      "ambientReferenceTemp: absolute(point.ambientReferenceTemp, from)"
    );
    expect(trendSrc).not.toContain(
      "ambientReferenceTemp: absolute(point.ambientReferenceTemp, from)"
    );
  });
});

/* ------------------------------------------------------------------ */
/* Regression locks — N-IR1 / IR1B / IR2 / IR3 / N-VS9 verbatim       */
/* ------------------------------------------------------------------ */

describe("SLICE-IR4 regression locks", () => {
  it("N-IR1 / N-IR1B load + descriptive ΔT disclosures are unchanged", () => {
    expect(THERMO_LOAD_DISCLOSURE).toBe(
      "Definitive NETA classification assumes minimum load; load telemetry is not stored for this scan — the verdict is stored-only, not load-corrected."
    );
    expect(THERMO_DT_TREND_DISCLOSURE).toBe(
      "Descriptive trend, not a failure forecast"
    );
    expect(trendSrc).toContain("thermoDeltaTTrend(thermoChartSeries)");
  });

  it("N-IR2 / N-IR3 surfaces are unchanged", () => {
    expect(THERMO_I2R_HEURISTIC_LABEL).toContain(
      "P ∝ I²R is an in-repo heuristic, not a standard"
    );
    expect(THERMO_EMISSIVITY_LABEL).toBe(
      "Stored camera setting (not optically measured)"
    );
    expect(trendSrc).toContain("Current operating point, not a projection");
    expect(trendSrc).toContain("thermo-radiometric-provenance-table");
  });

  it("N-VS9 parked curve-fit projection stays out of the tab", () => {
    expect(trendSrc).not.toContain("Curve-Fit Failure Projection");
    expect(trendSrc).not.toContain("formatTemperatureProjection");
  });
});
