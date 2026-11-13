// @vitest-environment jsdom
/**
 * SLICE-HARNESS — OIL ANALYSIS tab honesty harness (Wear Metals sub-tab).
 *
 * Contracts encoded here (DOM-read, throwing):
 *  - present-if-stored: wear-metal cards render the stored ppm and the alarm
 *    limit they are judged against; nothing is back-filled
 *  - honest empty state: no samples → "No Oil Analysis Data", no invented
 *    baseline ("No baseline is invented.")
 *  - known-edge: aluminum reported 0 ppm → the division-by-zero is confessed
 *    verbatim, never silently computed
 *  - citation-is-real-source: OIL_ALARM_LIMIT_CITATION +
 *    OIL_SPECTROSCOPY_CITATION render verbatim; D5185 stays method-only
 *  - no-extrapolation: generation rates never project hours-to-limit
 *  - Google-truth: DEFAULT_ALARM_LIMITS.iron = 100 PPM renders as the limit
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
  expectTextAbsent,
  expectTextRendered,
  loadFixture,
  openTech,
  plantDomLie,
  printGoogleChecklist,
  setupHarness
} from "./contract";
import { oilFixtures } from "./fixtures";

const harness = setupHarness();

afterAll(() => printGoogleChecklist("oil_analysis"));

describe("SLICE-HARNESS oil — known-good", () => {
  it("renders the stored wear metals against the real alarm limits", async () => {
    loadFixture(harness, oilFixtures.good);
    await openTech("oil_analysis");

    expectTextRendered("Wear Metals & Debris");
    // Fe 10 ppm judged against DEFAULT_ALARM_LIMITS.iron = 100 PPM.
    expectTextRendered(/10 PPM/);
    expectTextRendered("Limit: 100 PPM");
    expectTextRendered("No baseline is invented.");
    expectGoogleTruth(oilFixtures.good.truth);
  });

  it("cites the real sources and never an ASTM threshold claim", async () => {
    loadFixture(harness, oilFixtures.good);
    await openTech("oil_analysis");

    expectCitationIsRealSource(oilFixtures.good.truth[2].expected);
    expectCitationIsRealSource(oilFixtures.good.truth[3].expected);
    expectNoExtrapolation([/hours-to-limit projection/i]);
  });
});

describe("SLICE-HARNESS oil — known-empty", () => {
  it("renders the honest empty state with NO invented sample", async () => {
    loadFixture(harness, oilFixtures.empty);
    await openTech("oil_analysis");

    expectHonestEmptyState("No Oil Analysis Data");
    expectTextAbsent(/Limit:/);
    expectNoFabricatedValue(/10 PPM/);
  });
});

describe("SLICE-HARNESS oil — known-edge (Al = 0)", () => {
  it("confesses the Si:Al division by zero instead of computing it", async () => {
    loadFixture(harness, oilFixtures.edge);
    await openTech("oil_analysis");

    expectTextRendered(
      "Aluminum reported 0 ppm — Si:Al not computable (division by zero)."
    );
    expectGoogleTruth(oilFixtures.edge.truth);
  });
});

describe("SLICE-HARNESS oil — MUTATION (planted lies must go RED)", () => {
  it("M1 fixture lie: a fabricated sample in the empty fixture trips honest-empty-state", async () => {
    loadFixture(harness, oilFixtures.empty);
    await openTech("oil_analysis");
    expectHonestEmptyState("No Oil Analysis Data"); // GREEN before the lie

    harness.oilSamples = [
      {
        id: "fabricated-oil",
        asset_id: "M-101",
        sample_date: "2026-02-01",
        operating_hours: 240,
        iron: "9999",
        copper: "5",
        chromium: "1",
        lead: "2",
        aluminum: "3",
        silicon: "8",
        tin: "1",
        viscosity_40c: "46",
        acid_number: "1.20"
      }
    ];
    cleanup();
    await openTech("oil_analysis");

    expect(() => expectHonestEmptyState("No Oil Analysis Data")).toThrow(
      ContractViolation
    );
    expect(() => expectNoFabricatedValue(/9999/)).toThrow(ContractViolation);
    harness.oilSamples = [];
  });

  it("M2 fake standard: an ASTM-derived threshold claim trips citation-is-real-source", async () => {
    loadFixture(harness, oilFixtures.good);
    await openTech("oil_analysis");

    // GREEN before the lie: D5185 is cited as method-only.
    expectCitationIsRealSource(oilFixtures.good.truth[3].expected);

    plantDomLie("Alarm limits derived per ASTM D5185 alarm limits table");
    expect(() =>
      expectCitationIsRealSource(oilFixtures.good.truth[3].expected)
    ).toThrow(ContractViolation);
  });

  it("M3 projection lie: an hours-to-limit projection trips no-extrapolation-in-DOM", async () => {
    loadFixture(harness, oilFixtures.good);
    await openTech("oil_analysis");

    expectNoExtrapolation([/hours-to-limit projection/i]); // GREEN before the lie

    plantDomLie("Projection: 820 hours-to-limit projection at current rate");
    expect(() =>
      expectNoExtrapolation([/hours-to-limit projection/i])
    ).toThrow(ContractViolation);
  });
});
