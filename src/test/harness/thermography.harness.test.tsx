// @vitest-environment jsdom
/**
 * SLICE-HARNESS — THERMOGRAPHY tab honesty harness.
 *
 * Contracts encoded here (DOM-read, throwing):
 *  - present-if-stored: Hotspot/Reference/ΔT/NETA render iff stored
 *  - no fabricated defaults: missing ε must NOT render the 0.95 preset
 *  - radiometric-vs-badge provenance: T_refl shown in stored units; T_ref
 *    gate renders the verbatim "not recorded" banner
 *  - null-trio vocabulary: Not measured / Not reported
 *  - no-extrapolation: no normalized ΔT projection may surface
 *  - citation-is-real-source: NETA repair-window string from the SSOT
 *  - Google-truth: NETA Class 2 (MEDIUM) + 30-day repair window
 *
 * MUTATION TESTS prove every contract can FAIL (a planted lie must go RED).
 */
import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";

import {
  ContractViolation,
  expectCitationIsRealSource,
  expectGoogleTruth,
  expectHonestEmptyState,
  expectNoExtrapolation,
  expectNoFabricatedValue,
  expectNullTrio,
  expectTestIdAbsent,
  expectTestIdContent,
  expectTextAbsent,
  expectTextRendered,
  loadFixture,
  openTech,
  plantDomLie,
  printGoogleChecklist,
  setupHarness
} from "./contract";
import { thermographyFixtures, thermographySmallDeltaFixture } from "./fixtures";

const harness = setupHarness();

afterAll(() => printGoogleChecklist("thermography"));

describe("SLICE-HARNESS thermography — known-good", () => {
  it("renders the stored hotspot/NETA fields and no projection", async () => {
    loadFixture(harness, thermographyFixtures.good);
    await openTech("thermography");

    expectTextRendered(/Hotspot:\s*120°F/);
    expectTextRendered(/Reference:\s*70°F/);
    expectTextRendered("NETA Repair-Priority Reference");
    expectTextRendered("Class 2 (MEDIUM)");
    // truth[0..2]: NETA class, repair window, ε pill (all on the hotspot tab)
    expectGoogleTruth(thermographyFixtures.good.truth.slice(0, 3));
    expectNoExtrapolation(["Normalized ΔT Projection"]);
  });

  it("keeps radiometric provenance: T_refl in stored units, gate absent", async () => {
    loadFixture(harness, thermographyFixtures.good);
    await openTech("thermography", "🖼️ Radiometric & Isotherm");

    expectTestIdAbsent("thermo-tref-gate");
    expectTextRendered(/Reflected:\s*75°F \(stored units\)/);
    expectGoogleTruth(thermographyFixtures.good.truth.slice(3));
  });
});

describe("SLICE-HARNESS thermography — known-empty", () => {
  it("renders the honest empty state with NO hotspot values", async () => {
    loadFixture(harness, thermographyFixtures.empty);
    await openTech("thermography");

    expectHonestEmptyState("No thermography scans for this asset");
    expectTextAbsent(/Hotspot:\s*\d/);
    expectNoFabricatedValue(/Emissivity:\s*0\.95/);
    expectTestIdContent("thermo-unit-isolation-note", [
      "Reference temps (ambient / T_ref)",
      "concentration fields (ppm) never convert"
    ]);
  });
});

describe("SLICE-HARNESS thermography — known-edge (hotspot-only)", () => {
  it("gates radiometric analysis on the missing T_ref and keeps the null trio", async () => {
    loadFixture(harness, thermographyFixtures.edge);
    await openTech("thermography");

    // Present-if-stored: the hotspot renders, everything absent says so.
    expectTextRendered(/Hotspot:\s*80°F/);
    expectTextRendered(/Reference:\s*Not measured/);
    expectTextAbsent(/Emissivity:/); // no fabricated 0.95 default
    expectNullTrio({ measured: true, reported: true });

    // Radiometric tab: the verbatim T_ref gate, not a fabricated analysis.
    await openRadiometricTab();
    const gate = expectTestIdContent("thermo-tref-gate", [
      "Reference temperature not recorded - radiometric analysis not available"
    ]);
    expect(gate.textContent).not.toMatch(/0\.95/);
    expectNoExtrapolation(["Normalized ΔT Projection"]);
  });
});

describe("SLICE-THERMO-FAULT — small-ΔT stored-verdict honesty", () => {
  it("small-ΔT row (~2°F rise) renders the stored honest-low pairing, never an inflated ANOMALY/Loose Connection", async () => {
    loadFixture(harness, thermographySmallDeltaFixture);
    await openTech("thermography");

    // Exact DOM: the stored honest-low pairing renders verbatim.
    expectTextRendered(/Hotspot:\s*22\.9°F/);
    expectTextRendered(/Reference:\s*20\.6°F/);
    expectTextRendered(/ΔT:\s*2\.3°F/);
    expectTextRendered(/Fault:\s*None Detected/);
    expectTextRendered(/NETA:\s*Class 1/);
    // Stored Class 1 -> the LOW repair row, never a recomputed higher class.
    expectTextRendered("Class 1 (LOW)");
    expectTextRendered("Monitor — routine re-inspection");
    // Provenance disclosure: the verdict is stored from the scan.
    expectTestIdContent("thermo-kpi-provenance", [
      "Fault / NETA verdict stored from the saved scan — not ΔT-derived."
    ]);
    expectGoogleTruth(thermographySmallDeltaFixture.truth);
    // The inflation lie must NOT be present anywhere in the rendered tab.
    expectTextAbsent(/ANOMALY/);
    expectTextAbsent(/Loose Connection/i);
    expectTextAbsent(/Class 2|Class 3|Class 4/);
    expectNoExtrapolation(["Normalized ΔT Projection"]);
  });

  it("small-ΔT row with NO stored verdict stays Not reported — no ΔT-derived class is fabricated", async () => {
    loadFixture(harness, thermographySmallDeltaFixture);
    harness.rows = [
      {
        id: "thermo-small-delta-unclassified",
        asset_id: "M-101",
        analysis_type: "thermography",
        timestamp: "2026-11-13T09:00:00.000Z",
        health_score: 90,
        primary_fault: null,
        recommendations: [],
        peaks: [
          {
            type: "thermography",
            hotspot_temp: 22.9,
            reference_temp: 20.6,
            delta_t: 2.3,
            severity_class: null
          }
        ],
        telemetry_data: { environmental: { temp_unit: "°F" } }
      }
    ];
    await openTech("thermography");

    // Present-if-stored: ΔT renders, verdict stays honestly absent.
    expectTextRendered(/ΔT:\s*2\.3°F/);
    expectTextRendered(/Fault:\s*Not reported/);
    expectTextRendered(/NETA:\s*Not reported/);
    // No-fabricated-derivation: a 2.3°F ΔT must never mint a verdict.
    expectTextAbsent(/ANOMALY/);
    expectTextAbsent(/Loose Connection/i);
    expectTextAbsent(/Class 1 \(LOW\)|Class 2|Class 3|Class 4/);
    // No stored class -> the repair matrix row is omitted entirely
    // (mirrors thermographyKpi.test.ts:262-276).
    expectTextAbsent("NETA Repair-Priority Reference");
  });

  it("M5 inflation lie: a planted 'ANOMALY' verdict on a small-ΔT row trips no-fabricated-value", async () => {
    loadFixture(harness, thermographySmallDeltaFixture);
    await openTech("thermography");
    expectTextAbsent(/ANOMALY/); // GREEN before the lie

    plantDomLie("Fault: Loose Connection · NETA: ANOMALY");
    expect(() => expectTextAbsent(/ANOMALY/)).toThrow(ContractViolation);
  });
});

describe("SLICE-HARNESS thermography — MUTATION (planted lies must go RED)", () => {
  it("M1 fixture lie: a fabricated row in the empty fixture trips gate-absent-when-empty", async () => {
    loadFixture(harness, thermographyFixtures.empty);
    await openTech("thermography");
    expectTextAbsent(/Hotspot:\s*\d/); // GREEN before the lie

    harness.rows = [
      {
        id: "fabricated-thermo",
        asset_id: "M-101",
        analysis_type: "thermography",
        timestamp: new Date().toISOString(),
        health_score: 60,
        primary_fault: "Loose connection",
        recommendations: [],
        peaks: [
          {
            type: "thermography",
            hotspot_temp: 999,
            reference_temp: null,
            delta_t: 999,
            severity_class: null
          }
        ],
        telemetry_data: { environmental: { temp_unit: "°F" } }
      }
    ];
    cleanup();
    await openTech("thermography");

    expect(() => expectTextAbsent(/Hotspot:\s*999°F/)).toThrow(ContractViolation);
    harness.rows = [];
  });

  it("M2 render lie: a fabricated 999°F hotspot trips no-fabricated-value", async () => {
    loadFixture(harness, thermographyFixtures.empty);
    await openTech("thermography");
    expectNoFabricatedValue(/Hotspot:\s*999°F/); // GREEN before the lie

    plantDomLie("Hotspot: 999°F");
    expect(() => expectNoFabricatedValue(/Hotspot:\s*999°F/)).toThrow(
      ContractViolation
    );
  });

  it("M3 projection lie: a normalized ΔT projection trips no-extrapolation-in-DOM", async () => {
    loadFixture(harness, thermographyFixtures.edge);
    await openTech("thermography");
    expectNoExtrapolation(["Normalized ΔT Projection"]); // GREEN before the lie

    plantDomLie("Normalized ΔT Projection: 105°F @ 100% load");
    expect(() => expectNoExtrapolation(["Normalized ΔT Projection"])).toThrow(
      ContractViolation
    );
  });

  it("M4 fake standard: an invented certified verdict trips citation-is-real-source", async () => {
    loadFixture(harness, thermographyFixtures.good);
    await openTech("thermography");

    expectCitationIsRealSource("Schedule repair within 30 days"); // GREEN (real NETA window)

    plantDomLie("Thermal verdict per IEEE 43 certified pass/fail");
    expect(() => expectCitationIsRealSource("Schedule repair within 30 days")).toThrow(
      ContractViolation
    );
  });
});

async function openRadiometricTab(): Promise<void> {
  const { fireEvent, screen } = await import("@testing-library/react");
  fireEvent.click(screen.getByRole("button", { name: /Radiometric & Isotherm/ }));
  await screen.findByTestId("thermo-tref-gate");
}
