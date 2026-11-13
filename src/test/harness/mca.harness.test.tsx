// @vitest-environment jsdom
/**
 * SLICE-HARNESS — MCA tab honesty harness (winding + groundwall).
 *
 * Contracts encoded here (DOM-read, throwing):
 *  - present-if-stored: winding unbalance and the IEEE 43 verdict render iff
 *    stored; no nameplate voltage → no verdict, never a fabricated one
 *  - four-mode separation: winding values never leak into groundwall cells
 *    ("---" / "Awaiting Data" when a mode has nothing stored)
 *  - data-quality suppression: non-monotonic IR suppresses the verdict
 *    entirely ("withheld", no energize call, leakage "---")
 *  - unit/°C isolation: the kt correction stays °C-locked; no °F in the math
 *  - citation-is-real-source: MCA_IMBALANCE_SOURCE (rule-of-thumb, NOT a
 *    NEMA MG-1 severity matrix) renders verbatim
 *  - Google-truth: IEEE 43-2013 kV + 1 MΩ → "IEEE 43 PASS (≥ 1.46 MΩ)" for a
 *    stored 460 V nameplate
 *
 * MUTATION TESTS prove every contract can FAIL (a planted lie must go RED).
 */
import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";

import {
  ContractViolation,
  equipmentStoreWithVoltage,
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
import { saveEquipmentStore } from "../../data/equipmentDb";
import { mcaFixtures } from "./fixtures";

const harness = setupHarness();

afterAll(() => printGoogleChecklist("mca"));

describe("SLICE-HARNESS mca — known-good", () => {
  it("renders the stored phase unbalance with its formula and rule-of-thumb source", async () => {
    loadFixture(harness, mcaFixtures.good);
    saveEquipmentStore(equipmentStoreWithVoltage("460 V"));
    await openTech("mca"); // winding mode is the default

    expectTextRendered(/1\.32%/); // unbalance of [1, 1, 1.02] (mean denominator)
    expectTextRendered("Max Phase Unbalance");
    expectTextRendered("Descriptive only — not a fault verdict or severity score.");
    expectGoogleTruth(mcaFixtures.good.truth.slice(1));
  });

  it("renders the IEEE 43 PASS verdict derived from the stored 460 V nameplate", async () => {
    loadFixture(harness, mcaFixtures.good);
    saveEquipmentStore(equipmentStoreWithVoltage("460 V"));
    await openTech("mca", "Groundwall Insulation");

    // Google truth: IEEE 43-2013 kV + 1 MΩ → 0.46 kV → ≥ 1.46 MΩ; IR 8 MΩ.
    expectTestIdContent("mca-gw-threshold-badge", ["IEEE 43 PASS (≥ 1.46 MΩ)"]);
    expectGoogleTruth(mcaFixtures.good.truth.slice(0, 1));
    // No winding temp stored → kt=1 passthrough, °C-locked.
    expectTestIdContent("mca-gw-temp-basis", [
      "IR shown uncorrected (no winding temp recorded, kt=1)"
    ]);
  });
});

describe("SLICE-HARNESS mca — known-empty", () => {
  it("renders --- / Awaiting Data with NO invented verdicts", async () => {
    loadFixture(harness, mcaFixtures.empty);
    await openTech("mca");

    expectHonestEmptyState("Awaiting Data");
    expectTextAbsent(/IEEE 43/);
    expectNoFabricatedValue(/IEEE 43 (PASS|FAIL)/);
    expectTextRendered("---");
  });
});

describe("SLICE-HARNESS mca — known-edge (invalid IR)", () => {
  it("suppresses the verdict on non-monotonic IR and never condemns the motor", async () => {
    loadFixture(harness, mcaFixtures.edge);
    saveEquipmentStore(equipmentStoreWithVoltage("460 V"));
    await openTech("mca", "Groundwall Insulation");

    expectTestIdContent("mca-gw-data-quality-warning", [
      "non-monotonic",
      "564",
      "343"
    ]);
    expectTestIdContent("mca-gw-threshold-badge", [
      "IEEE 43 verdict withheld — IR data quality"
    ]);
    expectTextAbsent(/Do not energize/i);
    expectTestIdContent("mca-gw-leakage-value", ["---"]);
    expectTestIdContent("mca-gw-kt-drawer", [
      "R40 = kt",
      "passthrough",
      "°C-locked"
    ]);
    // Unit isolation: the °C-locked math must show no °F recomputation.
    expectUnitIsolation("mca-gw-kt-drawer", { bannedUnits: [/°F/] });
  });
});

describe("SLICE-HARNESS mca — MUTATION (planted lies must go RED)", () => {
  it("M1 fixture lie: a fabricated groundwall row in the empty fixture trips gate-absent-when-empty", async () => {
    loadFixture(harness, mcaFixtures.empty);
    saveEquipmentStore(equipmentStoreWithVoltage("460 V"));
    await openTech("mca", "Groundwall Insulation");
    expectTextAbsent(/IEEE 43 (PASS|FAIL)/); // GREEN before the lie

    harness.rows = [
      {
        id: "fabricated-mca",
        asset_id: "M-101",
        analysis_type: "mca",
        timestamp: new Date().toISOString(),
        health_score: 40,
        primary_fault: "Groundwall Insulation",
        recommendations: [],
        peaks: [
          {
            type: "mca",
            groundwall: {
              ir30sMOmega: 9000,
              ir1mMOmega: 9000,
              ir10mMOmega: 9000,
              testVoltageV: 250,
              insulationClass: "F"
            }
          }
        ]
      }
    ];
    cleanup();
    await openTech("mca", "Groundwall Insulation");

    expect(() => expectTextAbsent(/IEEE 43 (PASS|FAIL)/)).toThrow(
      ContractViolation
    );
    harness.rows = [];
  });

  it("M2 fake standard: a NEMA/IEEE certified severity claim trips citation-is-real-source", async () => {
    loadFixture(harness, mcaFixtures.good);
    saveEquipmentStore(equipmentStoreWithVoltage("460 V"));
    await openTech("mca");

    // GREEN before the lie: the real source renders verbatim.
    expectCitationIsRealSource(mcaFixtures.good.truth[1].expected);

    plantDomLie("Phase unbalance classified per NEMA MG-1 resistance severity matrix");
    expect(() =>
      expectCitationIsRealSource(mcaFixtures.good.truth[1].expected)
    ).toThrow(ContractViolation);
  });

  it("M3 kt recomputed in °F: a °F recomputation in the drawer trips unit-isolation", async () => {
    loadFixture(harness, mcaFixtures.edge);
    saveEquipmentStore(equipmentStoreWithVoltage("460 V"));
    await openTech("mca", "Groundwall Insulation");

    // GREEN before the lie: drawer is °C-locked with no °F anywhere.
    expectUnitIsolation("mca-gw-kt-drawer", { bannedUnits: [/°F/] });

    // Plant the lie exactly where a buggy render path would put it.
    const drawer = document.querySelector(
      '[data-testid="mca-gw-kt-drawer"]'
    ) as HTMLElement;
    drawer.textContent += " kt recomputed from 75 °F";
    expect(() =>
      expectUnitIsolation("mca-gw-kt-drawer", { bannedUnits: [/°F/] })
    ).toThrow(ContractViolation);
  });

  it("M4 suppressed verdict un-suppressed: the withheld badge cannot be faked into a PASS", async () => {
    loadFixture(harness, mcaFixtures.edge);
    saveEquipmentStore(equipmentStoreWithVoltage("460 V"));
    await openTech("mca", "Groundwall Insulation");

    // GREEN before the lie: no PASS badge exists on invalid IR.
    expectTestIdContent("mca-gw-threshold-badge", [
      "IEEE 43 verdict withheld — IR data quality"
    ]);

    plantDomLie("IEEE 43 PASS (≥ 1.46 MΩ)");
    expect(() => expectTestIdContent("mca-gw-threshold-badge", ["IEEE 43 PASS (≥ 1.46 MΩ)"])).toThrow(
      ContractViolation
    );
  });
});
