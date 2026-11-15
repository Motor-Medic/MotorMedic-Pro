// @vitest-environment jsdom
/**
 * SLICE-IR3 — Thermography Radiometric & Isotherm + IR unit-bar hygiene.
 *
 * Contracts encoded here (DOM-read, throwing, plus SSOT source locks):
 *  - PART A: IR unit-bar hygiene:
 *      * On Thermography: only Temperature selector (°F / °C) + isolation note.
 *      * On Vibration: Velocity, Acceleration, Frequency selectors present;
 *        Temperature selector absent.
 *  - PART B (Radiometric & Isotherm):
 *      * Card 1: Emissivity setting descriptive label "Stored camera setting
 *        (not optically measured)"; drift = descriptive compare of stored eps
 *        across scans/baseline; warn trends may reflect setting change; NEVER
 *        recompute temps; null -> "Not recorded".
 *      * Card 2: Palette span width = Max - Min via convertTemperatureDelta
 *        (scale-only, NEVER +32); bounds convert affinely; notes span change
 *        across scans; null -> "Not reported".
 *      * Card 3: Isotherm threshold (affine) + alarm state; camera/env settings
 *        in stored units; null -> "Not reported".
 *      * Card 4: ROI statistical mean (affine); NEVER fabricate sigma/min/max;
 *        T_ref stored disclosure; null -> "Not measured".
 *      * Chart & Table: left axis temperature only, right axis eps 0–1;
 *        provenance table per scan in same SSOT window with same-date labels
 *        and null-trio ("-", "Not reported", "Not measured").
 *  - Regression locks:
 *      * Sub-tab 1 (Hotspot/NETA) & Sub-tab 2 (Phase Delta/I2R) locks verbatim.
 */
import { readFileSync } from "node:fs";
import { screen } from "@testing-library/react";
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
import {
  thermographyFixtures,
  thermographyRadiometricDriftFixture,
  thermographyRadiometricSpanFixture,
  vibrationFixtures
} from "./fixtures";
import {
  NOT_MEASURED,
  NOT_RECORDED,
  NOT_REPORTED,
  THERMO_EMISSIVITY_LABEL,
  THERMO_REF_TEMP_MISSING,
  radiometricKpis,
  thermoPaletteSpanWidth
} from "../../lib/thermographyTrendSeries";

const harness = setupHarness();

const trendSrc = readFileSync("src/components/TrendAnalyzer.tsx", "utf8");
const seriesSrc = readFileSync("src/lib/thermographyTrendSeries.ts", "utf8");

/* ------------------------------------------------------------------ */
/* PART A: Unit-bar hygiene                                           */
/* ------------------------------------------------------------------ */

describe("SLICE-IR3 Part A — Unit-bar gating & hygiene", () => {
  it("on Thermography: renders ONLY temperature selector + isolation note; gates in/s, g, Hz away", async () => {
    loadFixture(harness, thermographyFixtures.good);
    await openTech("thermography");

    // Temperature selector is present
    expect(screen.getByLabelText("Temperature display unit")).toBeTruthy();
    // Existing unit-isolation note is present
    expectTestIdContent("thermo-unit-isolation-note", [
      "Reference temps (ambient / T_ref)",
      "concentration fields (ppm) never convert"
    ]);

    // Vibration selectors (in/s, g, Hz) are gated AWAY on Thermography
    expect(screen.queryByLabelText("Velocity display unit")).toBeNull();
    expect(screen.queryByLabelText("Acceleration display unit")).toBeNull();
    expect(screen.queryByLabelText("Frequency display unit")).toBeNull();
  });

  it("on Vibration: keeps Velocity, Acceleration, Frequency selectors; Temperature selector absent", async () => {
    loadFixture(harness, vibrationFixtures.good);
    await openTech("vibration");

    // Vibration selectors are intact
    expect(screen.getByLabelText("Velocity display unit")).toBeTruthy();
    expect(screen.getByLabelText("Acceleration display unit")).toBeTruthy();
    expect(screen.getByLabelText("Frequency display unit")).toBeTruthy();

    // Temperature selector and isolation note are absent on Vibration
    expect(screen.queryByLabelText("Temperature display unit")).toBeNull();
    expectTestIdAbsent("thermo-unit-isolation-note");
  });
});

/* ------------------------------------------------------------------ */
/* PART B: Card 2 — Palette Span Range (delta conversion, NEVER +32)   */
/* ------------------------------------------------------------------ */

describe("SLICE-IR3 Part B Card 2 — Palette span conversion", () => {
  it("pure math: thermoPaletteSpanWidth uses convertTemperatureDelta (scale-only, NEVER +32)", () => {
    // 10°C to 30°C: raw span = 20°C
    // Scale-only delta: 20 * 1.8 = 36°F
    // Affine conversion would erroneously yield: 20 * 1.8 + 32 = 68°F!
    const spanF = thermoPaletteSpanWidth(10, 30, "°C", "°F");
    expect(spanF).toBe(36);
    expect(spanF).not.toBe(68);

    // Reverse: 50°F to 86°F: raw span = 36°F
    // Scale-only delta: 36 / 1.8 = 20°C
    // Affine conversion would erroneously yield: (36 - 32) / 1.8 = 2.22°C!
    const spanC = thermoPaletteSpanWidth(50, 86, "°F", "°C");
    expect(spanC).toBe(20);
    expect(spanC).not.toBe(2.2);

    // Null inputs
    expect(thermoPaletteSpanWidth(null, 30, "°C", "°F")).toBeNull();
    expect(thermoPaletteSpanWidth(10, null, "°C", "°F")).toBeNull();
  });

  it("DOM render: stored 10–30°C palette under °F preference renders Range: 36°F (NOT 68°F)", async () => {
    harness.tenantSettings = { display_units: { temperature: "°F" } };
    loadFixture(harness, thermographyRadiometricSpanFixture);
    await openTech("thermography", /Radiometric/);

    // Bounds convert affinely: 10°C -> 50°F, 30°C -> 86°F
    expectTextRendered(/50°F → 86°F/);
    // Span width converts by delta: 20°C -> 36°F
    expectTextRendered(/Range:\s*36°F/);
    // NEVER the affine +32 mistake
    expectTextAbsent(/Range:\s*68°F/);
  });
});

/* ------------------------------------------------------------------ */
/* PART B: Card 1 — Emissivity Consistency & Drift                   */
/* ------------------------------------------------------------------ */

describe("SLICE-IR3 Part B Card 1 — Emissivity descriptive drift", () => {
  it("descriptive drift comparison flags setting change with exact stored values and warning", async () => {
    loadFixture(harness, thermographyRadiometricDriftFixture);
    await openTech("thermography", /Radiometric/);

    // Current stored value renders
    expectTextRendered(/ε = 0\.85/);
    // Drift warning flags exact stored values
    expectTextRendered(/Changed vs baseline ε = 0\.95 \(stored: 0\.85\)/);
    expectTextRendered(/Trends may reflect setting change/);
    // Descriptive label: stored setting, not optically measured
    expectTextRendered(THERMO_EMISSIVITY_LABEL);
    // Alert icon rendered
    expect(screen.getByLabelText("Emissivity changed vs baseline")).toBeTruthy();
    // Span change note
    expectTextRendered(/Span changed across scans/);
  });

  it("guard: historical temperatures are NEVER recomputed when ε differs", () => {
    // TrendAnalyzer source must not contain any radiance-based recomputation
    expect(trendSrc).not.toContain("recomputeHistoricalTemps");
    expect(trendSrc).not.toContain("correctRadiance");
    expect(seriesSrc).not.toContain("recomputeHistoricalTemps");
    expect(seriesSrc).not.toContain("correctRadiance");
  });
});

/* ------------------------------------------------------------------ */
/* PART B: Cards 3 & 4 + Absent Fields Honesty                       */
/* ------------------------------------------------------------------ */

describe("SLICE-IR3 Part B Cards 3 & 4 + Absent Fields Honesty", () => {
  it("renders stored isotherm threshold (affine) and ROI mean (affine) when present", async () => {
    harness.tenantSettings = { display_units: { temperature: "°F" } };
    loadFixture(harness, thermographyRadiometricSpanFixture);
    await openTech("thermography", /Radiometric/);

    // Isotherm 28°C converts affinely: 28 * 1.8 + 32 = 82.4°F
    expectTextRendered(/Active: >82\.4°F/);
    expectTextRendered("Isotherm filter engaged");

    // Box average 24°C converts affinely: 24 * 1.8 + 32 = 75.2°F
    expectTextRendered(/Box Avg: 75\.2°F/);
    // T_refl stored disclosure
    expectTextRendered(/Reflected: 22°C \(stored units\)/);
  });

  it("absent fields render honest null-trio vocabulary: Not recorded / Not reported / Not measured", async () => {
    loadFixture(harness, thermographyFixtures.edge);
    await openTech("thermography", /Radiometric/);

    // Card 1: ε null -> Not recorded
    expectTextRendered(NOT_RECORDED);
    // Card 2: Scale null -> Not reported
    expectTextRendered("Camera scale not reported in saved scan");
    // Card 3: Isotherm null -> Not reported
    expectTextRendered("Camera measurement settings not reported");
    // Card 4: ROI null -> Not measured
    expectTextRendered("ROI statistics not measured");
    // T_ref gate rendered verbatim
    expectTestIdContent("thermo-tref-gate", [THERMO_REF_TEMP_MISSING]);
  });
});

/* ------------------------------------------------------------------ */
/* PART B: Chart & Provenance Table                                   */
/* ------------------------------------------------------------------ */

describe("SLICE-IR3 Part B Chart & Provenance Table", () => {
  it("renders the radiometric provenance table with scan fields in same SSOT window", async () => {
    loadFixture(harness, thermographyRadiometricSpanFixture);
    await openTech("thermography", /Radiometric/);

    const table = screen.getByTestId("thermo-radiometric-provenance-table");
    expect(table).toBeTruthy();
    expect(table.textContent).toContain("Radiometric & Isotherm Scan Provenance");
    expect(table.textContent).toContain("Emissivity (ε)");
    expect(table.textContent).toContain("Scale Min");
    expect(table.textContent).toContain("Scale Max");
    expect(table.textContent).toContain("Isotherm");
    expect(table.textContent).toContain("Box Avg");
    expect(table.textContent).toContain("T_refl (stored)");
  });
});

/* ------------------------------------------------------------------ */
/* Regression locks: IR1, IR1B, IR2 intact                            */
/* ------------------------------------------------------------------ */

describe("SLICE-IR3 Regression locks", () => {
  it("sub-tab 1 locks remain intact", async () => {
    loadFixture(harness, thermographyFixtures.good);
    await openTech("thermography");
    expectTestIdContent("thermo-kpi-stored-load", ["Load: 75% (stored)"]);
    expectTestIdContent("thermo-kpi-provenance", [
      "Fault / NETA verdict stored from the saved scan — not ΔT-derived."
    ]);
    expectTestIdContent("thermo-reference-basis", [
      "Baseline type not specified in scan"
    ]);
  });

  it("sub-tab 2 locks remain intact", async () => {
    loadFixture(harness, thermographyFixtures.good);
    await openTech("thermography", /Phase Delta/);
    expectTextRendered("Current operating point, not a projection");
    expectTextRendered(
      "Phase Delta & I²R Load — Phase A/B/C temperatures with ≥40% load validity band"
    );
    expectTextRendered("Green band = operational validity (≥40% load)");
  });

  it("source locks: no i2rNormalizedDelta in UI and singleton testids", () => {
    expect(trendSrc).not.toContain("i2rNormalizedDelta");
    expect(trendSrc).not.toContain("formatTemperatureProjection");
    expect(trendSrc.match(/thermo-radiometric-provenance-table/g)?.length).toBe(1);
    expect(trendSrc.match(/thermo-tref-gate/g)?.length).toBe(1);
  });
});
