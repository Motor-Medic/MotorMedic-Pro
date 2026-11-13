// @vitest-environment jsdom
/**
 * SLICE-HARNESS — VIBRATION tab honesty harness.
 *
 * Contracts encoded here (DOM-read, throwing):
 *  - present-if-stored: overall velocity / spectral orders render iff stored
 *  - no fabricated defaults: empty fixture renders NO value
 *  - unit/dimensionless isolation: the 2X:1X ratio never carries a velocity
 *    unit and always carries its descriptive rubric basis
 *  - citation-is-real-source: the ratio's source is the in-repo rubric,
 *    explicitly NOT an ISO 20816 severity limit
 *  - Google-truth: ISO 20816 Class II zone edges classify 2.50 mm/s → Zone B
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
  expectNoFabricatedValue,
  expectTestIdAbsent,
  expectTestIdContent,
  expectTextAbsent,
  expectTextRendered,
  expectUnitIsolation,
  loadFixture,
  openTech,
  plantDomLie,
  printGoogleChecklist,
  setupHarness
} from "./contract";
import { vibrationFixtures } from "./fixtures";

const harness = setupHarness();

afterAll(() => printGoogleChecklist("vibration"));

describe("SLICE-HARNESS vibration — known-good", () => {
  it("renders the stored overall velocity and the ISO 20816 zone it implies", async () => {
    loadFixture(harness, vibrationFixtures.good);
    await openTech("vibration");

    expectTestIdContent("overall-velocity-kpi", ["2.50 mm/s"]);
    expectGoogleTruth(vibrationFixtures.good.truth);
  });

  it("renders stored 1X/2X orders, the RPM gate, and the dimensionless ratio", async () => {
    loadFixture(harness, vibrationFixtures.good);
    await openTech("vibration", "Spectral & Harmonics");

    // Stored orders render with their as-extracted provenance.
    expectTestIdContent("spectral-1x-readout", ["1.200", "as extracted at collection"]);
    expectTestIdContent("spectral-2x-readout", ["0.600", "as extracted at collection"]);

    // No stored RPM -> the honest gate, never an inferred speed.
    expectTestIdContent("spectral-orders-rpm-gate", [
      "1X/2X order extraction requires configured RPM in Equipment DB",
      "Showing stored order amplitudes as extracted at collection"
    ]);
    expectTestIdAbsent("spectral-ratio-interpretation");

    // Pure math on stored amplitudes: 0.6 / 1.2 = 0.50.
    expectTestIdContent("spectral-2x1x-ratio", ["0.50", "basis: stored 1X/2X amplitudes"]);

    // Unit physics is stated, not silently applied.
    expectTestIdContent("spectral-unit-physics-note", ["frequency-dependent"]);
  });
});

describe("SLICE-HARNESS vibration — known-empty", () => {
  it("renders the honest empty state and NO fabricated velocity", async () => {
    loadFixture(harness, vibrationFixtures.empty);
    await openTech("vibration");

    expectHonestEmptyState("Awaiting Diagnostic Record");
    expectTestIdAbsent("overall-velocity-kpi");
    expectTextAbsent(/2\.50 mm\/s/);
    expectNoFabricatedValue(/Overall Velocity/);
  });
});

describe("SLICE-HARNESS vibration — known-edge", () => {
  it("clears the RPM gate with a source-qualified RPM and keeps the ratio descriptive", async () => {
    loadFixture(harness, vibrationFixtures.edge);
    await openTech("vibration", "Spectral & Harmonics");

    // Source-qualified RPM clears the gate; the descriptive interpretation
    // may render but must never claim a diagnosis.
    expectTestIdAbsent("spectral-orders-rpm-gate");
    expectTestIdContent("spectral-ratio-interpretation", ["consistent with"]);
    const interpretation = expectTestIdContent("spectral-ratio-interpretation", [
      /consistent with/
    ]);
    expect(interpretation.textContent).not.toMatch(/confirmed|diagnosis/i);

    // Unit/dimensionless isolation: ratio value only — no unit attached.
    expectUnitIsolation("spectral-2x1x-ratio", {
      bannedUnits: [/mm\/s/, /in\/s/]
    });

    // Real-source citation: the in-repo rubric, never an ISO severity badge.
    expectCitationIsRealSource(
      "in-repo descriptive 2X:1X harmonic-balance rubric — not an ISO 20816 severity limit; descriptive only, no fault verdict"
    );
  });
});

describe("SLICE-HARNESS vibration — MUTATION (planted lies must go RED)", () => {
  it("M1 fixture lie: a fabricated row in the empty fixture trips gate-absent-when-empty", async () => {
    loadFixture(harness, vibrationFixtures.empty);
    await openTech("vibration");
    expectTestIdAbsent("overall-velocity-kpi"); // GREEN before the lie

    // Plant the lie into the fixture/render path, then re-render.
    harness.rows = [
      {
        id: "fabricated-1",
        asset_id: "M-101",
        analysis_type: "vibration",
        timestamp: new Date().toISOString(),
        health_score: 82,
        primary_fault: "Imbalance",
        recommendations: [],
        peaks: [],
        telemetry_data: {
          vibration_trend_record: {
            assetId: "M-101",
            timestamp: new Date().toISOString(),
            broadband: { overallVelocity: 9.99, primaryFault: "Imbalance" },
            context: { analysisType: "vibration" },
            spectral: [],
            enveloping: [],
            waveform: []
          }
        }
      }
    ];
    cleanup();
    await openTech("vibration");

    expect(() => expectTestIdAbsent("overall-velocity-kpi")).toThrow(
      ContractViolation
    );
    expect(() => expectNoFabricatedValue(/9\.99 mm\/s/)).toThrow(ContractViolation);
    harness.rows = [];
  });

  it("M2 render lie: a fabricated velocity the app never measured trips no-fabricated-value", async () => {
    loadFixture(harness, vibrationFixtures.empty);
    await openTech("vibration");
    expectNoFabricatedValue(/9\.99 mm\/s/); // GREEN before the lie

    plantDomLie("Overall Velocity 9.99 mm/s");
    expect(() => expectNoFabricatedValue(/9\.99 mm\/s/)).toThrow(ContractViolation);
  });

  it("M3 ratio converted: a velocity unit on the 2X:1X ratio trips unit-isolation", async () => {
    loadFixture(harness, vibrationFixtures.edge);
    await openTech("vibration", "Spectral & Harmonics");

    // GREEN before the lie: the ratio readout is dimensionless.
    expectUnitIsolation("spectral-2x1x-ratio", { bannedUnits: [/mm\/s/, /in\/s/] });

    // Plant the lie exactly where a buggy render path would put it.
    const ratio = screen_getRatio();
    ratio.textContent += " (converted: 0.0197 in/s)";
    expect(() =>
      expectUnitIsolation("spectral-2x1x-ratio", { bannedUnits: [/in\/s/] })
    ).toThrow(ContractViolation);
  });

  it("M4 fake standard: an invented ISO severity claim trips citation-is-real-source", async () => {
    loadFixture(harness, vibrationFixtures.edge);
    await openTech("vibration", "Spectral & Harmonics");

    expectCitationIsRealSource(
      "in-repo descriptive 2X:1X harmonic-balance rubric — not an ISO 20816 severity limit; descriptive only, no fault verdict"
    ); // GREEN before the lie

    plantDomLie("Classified per ISO 20816 severity class for MCA — certified verdict");
    expect(() =>
      expectCitationIsRealSource(
        "in-repo descriptive 2X:1X harmonic-balance rubric — not an ISO 20816 severity limit; descriptive only, no fault verdict"
      )
    ).toThrow(ContractViolation);
  });
});

/** Local DOM accessor for the ratio readout (reads the RENDERED DOM). */
function screen_getRatio(): HTMLElement {
  const el = document.querySelector('[data-testid="spectral-2x1x-ratio"]');
  if (!el) throw new Error("spectral-2x1x-ratio not rendered");
  return el as HTMLElement;
}
