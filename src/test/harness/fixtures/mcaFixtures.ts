/**
 * SLICE-HARNESS fixtures — MCA tab (winding + groundwall).
 *
 * Row shape mirrors the proven SLICE-AG factory
 * (src/components/TrendAnalyzer.mcaGroundwallHonesty.render.test.tsx:69-87):
 * peaks carry type "mca" with a groundwall blob and/or winding phase
 * triplets (extracted by src/lib/mca/mcaPersistence.ts:313+ from
 * blob.phase_r / phase_l / phase_z / phase_fi / phase_if).
 *
 * Google-truth baseline: IEEE 43-2013 IR minimum kV + 1 MΩ with a 100 MΩ
 * floor at ≥ 10 kV lives in src/lib/mca/groundwallCalculator.ts:180-193 —
 * a 460 V (0.46 kV) nameplate must render "IEEE 43 PASS (≥ 1.46 MΩ)".
 */
import type { TechFixtures } from "../contract";
import { MCA_IMBALANCE_SOURCE } from "../../../lib/maintenance/prescriptiveDictionary";

const TS_A = "2026-11-13T09:00:00.000Z";

type Row = Record<string, unknown>;

function mcaRow(peaks: Row[], overrides: Row = {}): Row {
  return {
    id: "mca-row-1",
    asset_id: "M-101",
    component: null,
    analysis_type: "mca",
    timestamp: TS_A,
    health_score: 40,
    primary_fault: "Groundwall Insulation",
    recommendations: [],
    peaks,
    ...overrides
  };
}

/** IEEE 43 verdict badge requires a STORED nameplate voltage (460 V here). */
const VALID_IR = {
  ir30sMOmega: 2,
  ir1mMOmega: 4,
  ir10mMOmega: 8,
  testVoltageV: 250,
  insulationClass: "F"
};

/** Non-monotonic IR — physically invalid, everything must be suppressed. */
const INVALID_IR = {
  ir30sMOmega: 564,
  ir1mMOmega: 4,
  ir10mMOmega: 343,
  testVoltageV: 250,
  insulationClass: "F"
};

const WINDING_PHASES = {
  phase_r: [1, 1, 1.02],
  phase_l: [10, 10, 10],
  phase_z: [2, 2, 2],
  phase_fi: [80, 80, 80],
  phase_if: [1, 1, 1]
};

export const mcaFixtures: TechFixtures = {
  tech: "mca",

  /** Data present -> gates activate, real values render. */
  good: {
    name: "mca-known-good",
    // One MCA blob per saved row (mcaPeakBlob returns the FIRST mca peak),
    // so winding and groundwall arrive as two rows exactly like the
    // app's own save pipeline writes them.
    rows: [
      mcaRow([{ type: "mca", ...WINDING_PHASES }], {
        id: "mca-row-winding",
        primary_fault: "Winding Balance"
      }),
      mcaRow([{ type: "mca", groundwall: VALID_IR }], {
        id: "mca-row-groundwall"
      })
    ],
    truth: [
      {
        field: "IEEE 43 IR minimum",
        standard:
          "IEEE 43-2013 kV + 1 MΩ (src/lib/mca/groundwallCalculator.ts:180-193) — 0.46 kV nameplate → ≥ 1.46 MΩ; stored IR 8 MΩ → PASS",
        expected: "IEEE 43 PASS (≥ 1.46 MΩ)"
      },
      {
        field: "phase unbalance source",
        standard:
          "MCA_IMBALANCE_SOURCE — industry rule-of-thumb, explicitly NOT a NEMA MG-1 resistance severity matrix (prescriptiveDictionary.ts:1662-1663)",
        expected: MCA_IMBALANCE_SOURCE
      },
      {
        field: "max phase unbalance",
        standard:
          "unbalanceR of stored phase R triplet [1, 1, 1.02] — mean 1.0067, max dev 0.0133 → 1.32% (raw, no temperature normalization without a stored winding temp)",
        expected: "1.32%"
      }
    ]
  },

  /** No data -> "---" / "Awaiting Data", NO fabricated default. */
  empty: {
    name: "mca-known-empty",
    rows: [],
    truth: []
  },

  /**
   * Partial data: non-monotonic IR trio -> data-quality suppression
   * (no IEEE 43 verdict, no energize call, leakage "---").
   */
  edge: {
    name: "mca-known-edge",
    rows: [mcaRow([{ type: "mca", groundwall: INVALID_IR }])],
    truth: []
  }
};
