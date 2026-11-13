// @vitest-environment jsdom
/**
 * SLICE-HARNESS — ULTRASOUND tab honesty harness (bearings + leaks).
 *
 * Contracts encoded here (DOM-read, throwing):
 *  - present-if-stored: bearings RMS/peak KPIs and the leak inventory render
 *    only stored dBµV values
 *  - probe-typing: airborne vs contact are separate quantities; legacy rows
 *    render "Probe unclassified", never a silent "contact"
 *  - log-domain isolation: dB is never linearized; the power-domain mean
 *    note renders verbatim
 *  - modeled-vs-measured provenance: baseline fallback is labeled
 *    "modeled, not measured"
 *  - parked economics: the leak-rate model renders "Parked", never a CFM
 *  - same-date labels: two runs on one date render "date · n"
 *  - citation-is-real-source: US_BEARING_LADDER_GATE_NOTE + DB_POWER_MEAN_NOTE
 *  - Google-truth: contact-only UE ladder gate, power-domain dB math
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
  expectProvenanceCaption,
  expectSameDateLabel,
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
import { ultrasoundFixtures } from "./fixtures";

const harness = setupHarness();

afterAll(() => printGoogleChecklist("ultrasound"));

describe("SLICE-HARNESS ultrasound — known-good (contact + airborne)", () => {
  it("renders the stored bearings KPIs and the contact-only ladder gate", async () => {
    loadFixture(harness, ultrasoundFixtures.good);
    await openTech("ultrasound", "Bearings & Mechanical");

    expectTextRendered(/39 dBµV/);
    expectTextRendered(/55 dBµV/);
    // Crest factor: 10^((55−39)/20) = 6.31 — a labeled peak/RMS ratio.
    expectTextRendered(/6\.31/);
    // truth[0..2]: ladder source + bearing KPIs (bearings tab)
    expectGoogleTruth(ultrasoundFixtures.good.truth.slice(0, 3));
  });

  it("renders measured leak rows, the parked economics, and the dB math note", async () => {
    loadFixture(harness, ultrasoundFixtures.good);
    await openTech("ultrasound", "Compressed Air Leaks");

    expectTestIdContent("ue-leak-basis-pill", [
      "Measured dBµV readings only",
      "parked (SLICE-VS8)"
    ]);
    // truth[3..4]: dB power-mean note + parked economics (leaks tab)
    expectGoogleTruth(ultrasoundFixtures.good.truth.slice(3));

    // Measured values only, newest first.
    expectTextRendered(/52\.0 dBµV/);
    expectTextRendered(/20\.0 dBµV/);
    expectTextRendered(/32\.0 dB/);
    expectTextRendered(/Airborne/);

    // Parked economics: never a derived CFM figure.
    expectTextRendered("Parked");
    expectNoFabricatedValue(/\d+(\.\d+)?\s*CFM/);
  });
});

describe("SLICE-HARNESS ultrasound — known-empty", () => {
  it("renders the honest tech empty state with NO dB values", async () => {
    loadFixture(harness, ultrasoundFixtures.empty);
    await openTech("ultrasound", "Compressed Air Leaks");

    // The whole technology is gated: nothing stored -> TechEmptyState.
    expectHonestEmptyState("No Ultrasound data available for this asset.");
    expectTestIdAbsent("ue-leak-basis-pill");
    expectNoFabricatedValue(/dBµV/);
  });
});

describe("SLICE-HARNESS ultrasound — known-edge", () => {
  it("labels the modeled 28 dBµV baseline fallback as not-measured", async () => {
    loadFixture(harness, ultrasoundFixtures.edge);
    await openTech("ultrasound", "Compressed Air Leaks");

    expectProvenanceCaption("ue-leak-baseline-fallback-note", [
      "Baseline fallback",
      "28 dBµV applied. Delta is modeled, not measured."
    ]);

    // Probe typing: the legacy row without a stored probe type is
    // unclassified — never silently treated as contact.
    expectTextRendered("Probe unclassified");
    expectTextRendered(/Airborne/);

    // Same-date sequence labels: two runs on 2026-11-13 never collapse.
    expectSameDateLabel("Nov 13, 2026", 2);
    expectSameDateLabel("Nov 13, 2026", 1);
  });

  it("keeps bearings KPIs honest for the contact scan in the same fixture", async () => {
    loadFixture(harness, ultrasoundFixtures.edge);
    await openTech("ultrasound", "Bearings & Mechanical");

    expectTextRendered(/39 dBµV/);
    expectTextRendered(/55 dBµV/);
  });
});

describe("SLICE-HARNESS ultrasound — MUTATION (planted lies must go RED)", () => {
  it("M1 fixture lie: a fabricated leak row in the empty fixture trips gate-absent-when-empty", async () => {
    loadFixture(harness, ultrasoundFixtures.empty);
    await openTech("ultrasound", "Compressed Air Leaks");
    expectNoFabricatedValue(/99\.9 dBµV/); // GREEN before the lie

    harness.rows = [
      {
        id: "fabricated-leak",
        asset_id: "M-101",
        analysis_type: "ultrasound",
        timestamp: new Date().toISOString(),
        health_score: 40,
        primary_fault: "Air Leak",
        recommendations: [],
        peaks: [
          {
            type: "ultrasound",
            mode: "leak",
            probe_type: "airborne",
            peak_dbmv: 99.9,
            baseline_dbmv: 3.3,
            delta_db: 96.6,
            baseline_source: "stored"
          }
        ]
      }
    ];
    cleanup();
    await openTech("ultrasound", "Compressed Air Leaks");

    expect(() => expectNoFabricatedValue(/99\.9 dBµV/)).toThrow(ContractViolation);
    harness.rows = [];
  });

  it("M2 economics lie: a derived CFM trips no-fabricated-value and the fake NETA citation", async () => {
    loadFixture(harness, ultrasoundFixtures.good);
    await openTech("ultrasound", "Compressed Air Leaks");

    expectNoFabricatedValue(/3\.42 CFM/); // GREEN before the lie (parked model)
    expectCitationIsRealSource(
      "Measured dBµV readings only — the derived leak-rate model is parked (SLICE-VS8) and does not run on this tab."
    );

    plantDomLie("Leak-Rate Estimate: 3.42 CFM — NETA certified leak-rate verdict");
    expect(() => expectNoFabricatedValue(/3\.42 CFM/)).toThrow(ContractViolation);
    expect(() =>
      expectCitationIsRealSource(
        "Measured dBµV readings only — the derived leak-rate model is parked (SLICE-VS8) and does not run on this tab."
      )
    ).toThrow(ContractViolation);
  });

  it("M3 dB linearized: a µV-linear conversion in the basis pill trips unit-isolation", async () => {
    loadFixture(harness, ultrasoundFixtures.good);
    await openTech("ultrasound", "Compressed Air Leaks");

    // GREEN before the lie: the pill states the log-domain math only.
    expectUnitIsolation("ue-leak-basis-pill", { bannedUnits: [/µV linear/] });

    // Plant the lie exactly where a buggy render path would put it.
    const pill = document.querySelector(
      '[data-testid="ue-leak-basis-pill"]'
    ) as HTMLElement;
    pill.textContent += " Power-domain mean converted to 12.5 µV linear average.";
    expect(() =>
      expectUnitIsolation("ue-leak-basis-pill", { bannedUnits: [/µV linear/] })
    ).toThrow(ContractViolation);
  });
});
