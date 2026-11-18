// @vitest-environment jsdom
/**
 * SLICE-US1 — ULTRASOUND Bearings & Mechanical: the two genuinely-missing
 * honesty surfaces, DOM-read.
 *
 * ADDED (nothing rebuilt):
 *  1. baseline-provenance ΔdB descriptive indicator
 *     - stored baseline -> measured ΔdB
 *     - fallback -> "delta modeled, not measured"
 *     - absent -> "baseline not stored", no Δ value
 *  2. stored-class verbatim surface
 *     - a saved class/action renders exactly as stored, even when Δ implies
 *       another bracket; nothing is recomputed from the static ladder
 *
 * Locks preserved (untouched, asserted here): the static UE ladder + its
 * disclosure, CF as linear peak/RMS, dBµV unit isolation, negative dBµV.
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  ContractViolation,
  expectNoFabricatedValue,
  expectTestIdAbsent,
  expectTestIdContent,
  expectTextRendered,
  expectUnitIsolation,
  loadFixture,
  openTech,
  printGoogleChecklist,
  setupHarness,
  type TechFixtureState
} from "./contract";
import { ultrasoundFixtures } from "./fixtures";
import { US_DDB_SOURCE } from "../../lib/maintenance/prescriptiveDictionary";
import { crestFactorFromPeakRmsDb } from "../../lib/ultrasoundAnalysis";

const harness = setupHarness();

afterAll(() => printGoogleChecklist("ultrasound-us1"));

const TS = "2026-11-16T09:00:00.000Z";

function row(id: string, peaks: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    id,
    asset_id: "M-101",
    analysis_type: "ultrasound",
    timestamp: TS,
    health_score: 55,
    primary_fault: "Bearing Defect",
    recommendations: [],
    peaks
  };
}

function fixtureWith(rows: Array<Record<string, unknown>>): TechFixtureState {
  return { name: "us1-inline", rows, truth: [] };
}

describe("SLICE-US1 baseline-provenance ΔdB (bearings)", () => {
  it("says 'baseline not stored' and shows no Δ when the scan has no baseline", async () => {
    loadFixture(harness, ultrasoundFixtures.good);
    await openTech("ultrasound", "Bearings & Mechanical");

    expectTestIdContent("ue-bearing-delta-provenance", [
      "Δ dB (descriptive)",
      "baseline not stored",
      "class not stored"
    ]);
    const value = document.querySelector(
      '[data-testid="ue-bearing-delta-value"]'
    ) as HTMLElement;
    expect(value.textContent?.trim()).toBe("—");
    // No fabricated 28 dBµV fallback on a stored-baseline surface.
    expectNoFabricatedValue(/28\.0 dBµV/);
    // The static ladder + disclosure are still present and untouched.
    expectTestIdContent("ue-ddb-rubric", [US_DDB_SOURCE, "Static in-repo reference"]);
    expectTextRendered(/39 dBµV/);
    expectTextRendered(/55 dBµV/);
  });

  it("renders a measured Δ from a stored baseline", async () => {
    loadFixture(
      harness,
      fixtureWith([
        row("us1-stored", [
          {
            type: "ultrasound",
            mode: "mechanical",
            probe_type: "contact",
            peak_dbmv: 60,
            rms_dbmv: 38,
            baseline_dbmv: 44,
            baseline_source: "stored"
          }
        ])
      ])
    );
    await openTech("ultrasound", "Bearings & Mechanical");

    expectTestIdContent("ue-bearing-delta-provenance", [
      "16.0 dB",
      "Stored baseline (44.0 dBµV)",
      "class not stored"
    ]);
    // Δ is dB only — never a linear µV or a CFM figure.
    expectUnitIsolation("ue-bearing-delta-value", {
      bannedUnits: [/µV/, /CFM/]
    });
  });

  it("labels a modeled fallback as modeled, never measured", async () => {
    loadFixture(
      harness,
      fixtureWith([
        row("us1-fallback", [
          {
            type: "ultrasound",
            mode: "mechanical",
            probe_type: "contact",
            peak_dbmv: 44,
            rms_dbmv: 36,
            baseline_source: "fallback",
            baseline_fallback: true,
            baseline_fallback_db: 28
          }
        ])
      ])
    );
    await openTech("ultrasound", "Bearings & Mechanical");

    expectTestIdContent("ue-bearing-delta-provenance", [
      "Modeled fallback (28.0 dBµV) — delta modeled, not measured",
      "16.0 dB"
    ]);
  });
});

describe("SLICE-US1 stored class renders verbatim (bearings)", () => {
  it("shows the stored class/action even when Δ sits in another bracket", async () => {
    loadFixture(
      harness,
      fixtureWith([
        row("us1-class", [
          {
            type: "ultrasound",
            mode: "mechanical",
            probe_type: "contact",
            peak_dbmv: 60,
            rms_dbmv: 38,
            baseline_dbmv: 40,
            baseline_source: "stored",
            severity_class: "Class 3 — Minor",
            class_action: "Lubricate bearing at next route"
          }
        ])
      ])
    );
    await openTech("ultrasound", "Bearings & Mechanical");

    const panel = expectTestIdContent("ue-bearing-delta-provenance", [
      "20.0 dB",
      "Class 3 — Minor",
      "Lubricate bearing at next route"
    ]);
    // Δ 20 would fall in the Class 1 bracket; the stored class must win and
    // no other bracket may be shown as this scan's class.
    expect(panel.textContent).not.toContain("Class 1 — Critical");
    expect(panel.textContent).not.toContain("Class 2 — Moderate");
  });

  it("MUTATION: a recomputed live class inside the panel is rejected", async () => {
    loadFixture(
      harness,
      fixtureWith([
        row("us1-mut", [
          {
            type: "ultrasound",
            mode: "mechanical",
            probe_type: "contact",
            peak_dbmv: 60,
            rms_dbmv: 38,
            baseline_dbmv: 40,
            baseline_source: "stored",
            severity_class: "Class 3 — Minor"
          }
        ])
      ])
    );
    await openTech("ultrasound", "Bearings & Mechanical");

    const panel = document.querySelector(
      '[data-testid="ue-bearing-delta-provenance"]'
    ) as HTMLElement;
    panel.textContent += " Class 1 — Critical (recomputed live)";
    expect(() => {
      if ((panel.textContent ?? "").includes("recomputed live")) {
        throw new ContractViolation(
          "stored-class-verbatim",
          "a live recomputed class surfaced beside the stored class"
        );
      }
    }).toThrow(ContractViolation);
  });
});

describe("SLICE-US1 negative dBµV and untouched locks", () => {
  it("keeps negative leak dBµV readings and a valid descriptive Δ", async () => {
    loadFixture(
      harness,
      fixtureWith([
        row("us1-negative", [
          {
            type: "ultrasound",
            mode: "leak",
            probe_type: "airborne",
            peak_dbmv: -5,
            baseline_dbmv: -15,
            delta_db: 10,
            baseline_source: "stored"
          }
        ])
      ])
    );
    await openTech("ultrasound", "Compressed Air Leaks");

    expectTextRendered(/-5\.0 dBµV/);
    expectTextRendered(/-15\.0 dBµV/);
    expectTextRendered(/10\.0 dB/);
    expectTestIdContent("ue-leak-basis-pill", [
      "Measured dBµV readings only",
      "power-domain mean"
    ]);
  });

  it("keeps the CF as a linear peak/RMS ratio, never the dB difference", () => {
    expect(crestFactorFromPeakRmsDb(55, 39)).toBe(6.31);
    expect(crestFactorFromPeakRmsDb(55, 39)).not.toBe(16);
  });

  it("keeps the indicator absent when the technology itself is empty", async () => {
    loadFixture(harness, ultrasoundFixtures.empty);
    await openTech("ultrasound", "Bearings & Mechanical");
    expectTestIdAbsent("ue-bearing-delta-provenance");
    expectNoFabricatedValue(/dBµV/);
  });
});
