/**
 * SLICE-HARNESS fixtures — OIL ANALYSIS tab (Wear Metals sub-tab).
 *
 * Row shape is the /api/oil-analysis DB row (snake_case) consumed by
 * mapOilSampleRow (src/lib/oilSampleRow.ts:191-203); the oil sub-tab
 * fetches its own endpoint with assetId = asset tag "M-101".
 *
 * Google-truth baseline: DEFAULT_ALARM_LIMITS.iron = 100 PPM and
 * ISO_CLEANLINESS_TARGET [15, 13, 10] live in src/types/oilAnalysis.ts:237-252;
 * ASTM D5185 is the ICP METHOD ONLY, never a threshold source.
 */
import type { TechFixtures } from "../contract";
import {
  OIL_ALARM_LIMIT_CITATION,
  OIL_SPECTROSCOPY_CITATION
} from "../../../lib/maintenance/prescriptiveDictionary";

type Row = Record<string, unknown>;

function oilSample(overrides: Row = {}): Row {
  return {
    id: "sample-1",
    asset_id: "M-101",
    sample_date: "2026-01-15",
    operating_hours: 120,
    iron: "10",
    copper: "5",
    chromium: "1",
    lead: "2",
    aluminum: "3",
    silicon: "8",
    tin: "1",
    viscosity_40c: "46",
    acid_number: "1.20",
    ...overrides
  };
}

export const oilFixtures: TechFixtures = {
  tech: "oil_analysis",

  /** Data present -> gates activate, real values render. */
  good: {
    name: "oil-known-good",
    oilSamples: [oilSample()],
    rows: [],
    truth: [
      {
        field: "iron alarm limit",
        standard:
          "DEFAULT_ALARM_LIMITS.iron = 100 PPM (src/types/oilAnalysis.ts:245-252, in-repo DEFAULT_ALARM_LIMITS / lab-OEM guidance)",
        expected: "Limit: 100 PPM"
      },
      {
        field: "stored iron value",
        standard:
          "stored lab value 10 PPM rendered as-is (ppm concentration fields never convert)",
        expected: "10 PPM"
      },
      {
        field: "alarm-limit citation",
        standard:
          "OIL_ALARM_LIMIT_CITATION — in-repo/lab-OEM guidance; D5185 is method only (prescriptiveDictionary.ts:1898-1899)",
        expected: OIL_ALARM_LIMIT_CITATION
      },
      {
        field: "ICP method citation",
        standard: "OIL_SPECTROSCOPY_CITATION (prescriptiveDictionary.ts:1918-1919)",
        expected: OIL_SPECTROSCOPY_CITATION
      }
    ]
  },

  /** No data -> honest empty, NO fabricated default. */
  empty: {
    name: "oil-known-empty",
    rows: [],
    oilSamples: [],
    truth: []
  },

  /**
   * Partial data: aluminum reported as 0 -> Si:Al division-by-zero must be
   * confessed, not silently computed; missing baseline hours -> no rate.
   */
  edge: {
    name: "oil-known-edge",
    rows: [],
    oilSamples: [oilSample({ aluminum: "0", operating_hours: 0 })],
    truth: [
      {
        field: "Si:Al division by zero",
        standard:
          "Si:Al is present-if-stored and descriptive; Al = 0 ppm is a division by zero, confessed verbatim (OilWearMetalsTab.tsx:450-452)",
        expected: "Aluminum reported 0 ppm — Si:Al not computable (division by zero)."
      }
    ]
  }
};
