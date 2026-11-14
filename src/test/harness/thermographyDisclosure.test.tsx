// @vitest-environment jsdom
/**
 * SLICE-IR1 — thermography load / emissivity DISCLOSURE gates (honesty only,
 * no new computation).
 *
 * Contracts encoded here (DOM-read, throwing, plus SSOT source locks):
 *  - load gate = disclosure ONLY: a no-load row renders the third disclosure
 *    verbatim and NO load-corrected ΔT / normalized projection may appear
 *  - the load disclosure is ABSENT when load telemetry is stored
 *  - ε badge: app-default ε → warn badge; file-extracted (THERMO-RAD) ε →
 *    cyan provenance note, warning silent; no ε stored → badge absent and
 *    NO substrate ε ever fabricated
 *  - regression lock: the two EXISTING disclosures (repair-card "not
 *    recomputed from ΔT", KPI thermo-kpi-provenance "not ΔT-derived") render
 *    verbatim and their source strings are unchanged
 *  - generic wording: no section/table numbers or percent bands in any IR1
 *    disclosure string (de-genericize only after web confirmation)
 *  - unit isolation note unchanged
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import {
  expectNoFabricatedValue,
  expectTestIdAbsent,
  expectTestIdContent,
  expectTextAbsent,
  expectTextRendered,
  loadFixture,
  openTech,
  setupHarness
} from "./contract";
import {
  thermographyEmissivityExtractedFixture,
  thermographyFixtures
} from "./fixtures";
import {
  THERMO_EMISSIVITY_APP_DEFAULT_BADGE,
  THERMO_EMISSIVITY_EXTRACTED_NOTE,
  THERMO_LOAD_DISCLOSURE,
  buildThermoChartSeries,
  thermoLoadTelemetryStored
} from "../../lib/thermographyTrendSeries";

const harness = setupHarness();

// jsdom env: import.meta.url is not file-scheme here, so read via cwd-relative
// paths (vitest runs from the repo root).
const seriesSrc = readFileSync("src/lib/thermographyTrendSeries.ts", "utf8");

const trendSrc = readFileSync("src/components/TrendAnalyzer.tsx", "utf8");

/** Row factory mirroring thermographyKpi.test.ts's SavedAnalysisResult shape. */
function row(
  options: {
    deltaT?: number | null;
    severityClass?: string | null;
    environmental?: Record<string, unknown>;
    aiVision?: Record<string, unknown>;
    peakExtras?: Record<string, unknown>;
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
        delta_t: options.deltaT ?? 50,
        severity_class: options.severityClass ?? "Class 2",
        ...(options.peakExtras ?? {})
      }
    ],
    telemetry_data: {
      environmental: { temp_unit: "°F", ...(options.environmental ?? {}) },
      ...(options.aiVision ? { ai_vision: options.aiVision } : {})
    }
  } as unknown as SavedAnalysisResult;
}

/* ------------------------------------------------------------------ */
/* Load gate — disclosure ONLY, never load-corrected ΔT                */
/* ------------------------------------------------------------------ */

describe("SLICE-IR1 load disclosure gate (disclosure only)", () => {
  it("no-load fixture → third disclosure renders verbatim, NO load-corrected value computed", async () => {
    // Edge fixture: hotspot-only row, load_percentage null, no amps.
    loadFixture(harness, thermographyFixtures.edge);
    await openTech("thermography");

    expectTestIdContent("thermo-kpi-load-disclosure", [
      "Definitive NETA classification assumes minimum load",
      "load telemetry is not stored for this scan",
      "the verdict is stored-only, not load-corrected"
    ]);
    // Guard 1: no load-corrected / normalized ΔT may be computed or shown.
    expectTextAbsent(/load-corrected ΔT/i);
    expectTextAbsent("Normalized ΔT Projection");
    expectTextAbsent(/@ 100% load/);
    // The stored ΔT still renders as-is; nothing recomputes it.
    expectTextRendered(/ΔT:\s*20°F/);
  });

  it("load-stored fixture (load_percentage 75) → disclosure ABSENT", async () => {
    loadFixture(harness, thermographyFixtures.good);
    await openTech("thermography");

    expectTestIdAbsent("thermo-kpi-load-disclosure");
  });

  it("presence helper is a pure gate: load % or the full amp pair, nothing else", () => {
    expect(thermoLoadTelemetryStored(null)).toBe(false);
    expect(thermoLoadTelemetryStored({ loadPercent: 75, currentAmps: null, ratedAmps: null })).toBe(true);
    expect(thermoLoadTelemetryStored({ loadPercent: null, currentAmps: 12, ratedAmps: 40 })).toBe(true);
    // Half an amp pair is NOT load telemetry — disclosure stays on.
    expect(thermoLoadTelemetryStored({ loadPercent: null, currentAmps: 12, ratedAmps: null })).toBe(false);
    expect(thermoLoadTelemetryStored({ loadPercent: null, currentAmps: null, ratedAmps: 40 })).toBe(false);
  });

  it("SSOT lock: the load disclosure is generic (no section/table numbers, no percent band)", () => {
    for (const constant of [THERMO_LOAD_DISCLOSURE, THERMO_EMISSIVITY_APP_DEFAULT_BADGE, THERMO_EMISSIVITY_EXTRACTED_NOTE]) {
      expect(constant).not.toMatch(/§/);
      expect(constant).not.toMatch(/Table\s*\d/i);
      expect(constant).not.toMatch(/≥\s*\d+%?/);
      expect(constant).not.toMatch(/\d+\s*%/);
      // No fabricated ε or substrate claim in any disclosure string.
      expect(constant).not.toMatch(/0\.95/);
      expect(constant).not.toMatch(/assume material|guessed/i);
    }
    // The KPI card consumes the SSOT constants verbatim (no re-typed copy).
    expect(trendSrc).toContain("thermo-kpi-load-disclosure");
    expect(trendSrc).toContain("THERMO_LOAD_DISCLOSURE");
    expect(trendSrc).toContain("thermo-kpi-emissivity-provenance");
  });
});

/* ------------------------------------------------------------------ */
/* ε badge — default warns, extracted silent-warning, none fabricated   */
/* ------------------------------------------------------------------ */

describe("SLICE-IR1 ε default-vs-extracted provenance badge", () => {
  it("ε-default fixture (preset/manual entry, no file marker) → badge WARNS", async () => {
    loadFixture(harness, thermographyFixtures.good);
    await openTech("thermography");

    const el = expectTestIdContent("thermo-kpi-emissivity-provenance", [
      "Emissivity (ε) is an app default/preset entry",
      "not extracted from the scan file"
    ]);
    expect(el.textContent).not.toMatch(/decoded from the file/i);
  });

  it("ε-extracted fixture (THERMO-RAD file marker) → warning badge SILENT, cyan provenance note", async () => {
    loadFixture(harness, thermographyEmissivityExtractedFixture);
    await openTech("thermography");

    const el = expectTestIdContent("thermo-kpi-emissivity-provenance", [
      THERMO_EMISSIVITY_EXTRACTED_NOTE
    ]);
    // The warning is silent: no app-default claim anywhere in the badge.
    expect(el.textContent).not.toMatch(/app default/i);
    expect(el.textContent).not.toMatch(/not extracted/i);
    // The stored ε pill still renders the stored value verbatim.
    expectTextRendered(/Emissivity:\s*0\.92/);
  });

  it("no ε stored → badge ABSENT and no substrate ε fabricated", async () => {
    loadFixture(harness, thermographyFixtures.edge);
    await openTech("thermography");

    expectTestIdAbsent("thermo-kpi-emissivity-provenance");
    expectTextAbsent(/Emissivity:/);
    expectNoFabricatedValue(/Emissivity:\s*0\.95/);
    expectNoFabricatedValue(/substrate/i);
  });

  it("SSOT classification: env-only → app-default; file marker (env absent) → file-extracted; preset ≠ file marker → stays app-default", () => {
    const envOnly = buildThermoChartSeries([row({ environmental: { emissivity: 0.92 } })]);
    expect(envOnly[0]?.emissivity).toBe(0.92);
    expect(envOnly[0]?.emissivitySource).toBe("app-default");

    const fileOnly = buildThermoChartSeries([
      row({
        aiVision: { emissivitySetting: 0.92, radiometric: { emissivitySetting: 0.92 } }
      })
    ]);
    expect(fileOnly[0]?.emissivity).toBe(0.92);
    expect(fileOnly[0]?.emissivitySource).toBe("file-extracted");

    // The displayed ε (env entry) disagrees with the file marker → the
    // honest label is app-default, never a fabricated "extracted" claim.
    const mismatch = buildThermoChartSeries([
      row({
        environmental: { emissivity: 0.95 },
        aiVision: { emissivitySetting: 0.87, radiometric: { emissivitySetting: 0.87 } }
      })
    ]);
    expect(mismatch[0]?.emissivity).toBe(0.95);
    expect(mismatch[0]?.emissivitySource).toBe("app-default");

    // Exact corroboration (env entry equals the file marker) is file-extracted.
    const corroborated = buildThermoChartSeries([
      row({
        environmental: { emissivity: 0.92 },
        aiVision: { emissivitySetting: 0.92, radiometric: { emissivitySetting: 0.92 } }
      })
    ]);
    expect(corroborated[0]?.emissivitySource).toBe("file-extracted");

    // No ε anywhere → no source, no badge surface.
    const none = buildThermoChartSeries([row({})]);
    expect(none[0]?.emissivity).toBeNull();
    expect(none[0]?.emissivitySource ?? null).toBeNull();
  });

  it("ε source is never inferred from a substrate/material string", () => {
    const substrate = buildThermoChartSeries([
      row({
        environmental: { material: "copper", substrate: "oxidized steel" },
        aiVision: { material: "copper busbar" }
      })
    ]);
    expect(substrate[0]?.emissivity).toBeNull();
    expect(substrate[0]?.emissivitySource ?? null).toBeNull();
    expect(seriesSrc).not.toMatch(/EMISSIVITY_PRESETS?\s*[:=]/);
  });
});

/* ------------------------------------------------------------------ */
/* REGRESSION LOCK — the two existing disclosures are untouched         */
/* ------------------------------------------------------------------ */

describe("SLICE-IR1 regression lock — existing disclosures verbatim", () => {
  it("KPI provenance disclosure renders byte-identical (THERMO-FAULT contract)", async () => {
    loadFixture(harness, thermographyFixtures.good);
    await openTech("thermography");

    expectTestIdContent("thermo-kpi-provenance", [
      "Fault / NETA verdict stored from the saved scan — not ΔT-derived."
    ]);
    expectTestIdContent("thermo-unit-isolation-note", [
      "Reference temps (ambient / T_ref)",
      "concentration fields (ppm) never convert"
    ]);
  });

  it("source lock: both existing disclosure strings and their testids unchanged", () => {
    // KPI disclosure (proven by SLICE-THERMO-FAULT + harness mutations).
    expect(trendSrc).toContain("thermo-kpi-provenance");
    expect(trendSrc).toContain("not ΔT-derived");
    // Repair-card disclosure (verbatim fragment of its single JSX line).
    expect(trendSrc).toContain("not recomputed from ΔT");
    expect(trendSrc).toContain("Static NETA / NFPA 70B reference guidance keyed to the");
    expect(trendSrc).toContain("not a live per-asset diagnosis");
    // IR1 ADDS a third surface; it must not have replaced either surface.
    expect(trendSrc.match(/thermo-kpi-provenance/g)?.length).toBe(1);
    expect(
      (trendSrc.match(/not ΔT-derived/g) ?? []).length
    ).toBeGreaterThanOrEqual(1);
  });
});
