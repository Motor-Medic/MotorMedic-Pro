/**
 * SLICE-HARNESS fixtures — ULTRASOUND tab (bearings/contact + leaks/airborne).
 *
 * Row shape mirrors the proven SLICE-VS8 factories
 * (src/components/TrendAnalyzer.leaksManual.test.tsx:49-76,
 *  TrendAnalyzer.electricalPdHonesty.test.tsx:101-120): peaks carry
 * type "ultrasound" with peak_dbmv / rms_dbuv / mode / probe_type.
 *
 * Google-truth baseline: the UE Systems ΔdB ladder gate lives in
 * src/lib/ultrasound/probeType.ts:148-158 (contact-only, descriptive-only)
 * and the dB math rules in src/lib/ultrasound/logUnits.ts:49-60 (power-domain
 * mean; ΔdB is subtraction of log levels, never a converted level).
 */
import type { TechFixtures } from "../contract";
import { DB_POWER_MEAN_NOTE } from "../../../lib/ultrasound/logUnits";
import { US_DDB_SOURCE } from "../../../lib/maintenance/prescriptiveDictionary";

const TS_MONDAY = "2026-11-09T09:00:00.000Z";
const TS_TUESDAY = "2026-11-10T09:00:00.000Z";
const TS_SAME_DAY_EARLY = "2026-11-13T12:00:00.000Z";
const TS_SAME_DAY_LATE = "2026-11-13T14:00:00.000Z";

type Row = Record<string, unknown>;

function baseRow(id: string, timestamp: string, overrides: Row = {}): Row {
  return {
    id,
    asset_id: "M-101",
    component: null,
    analysis_type: "ultrasound",
    timestamp,
    health_score: 40,
    primary_fault: "Air Leak",
    recommendations: [],
    peaks: [],
    ...overrides
  };
}

function bearingPeak(overrides: Row = {}): Row {
  return {
    type: "ultrasound",
    mode: "mechanical",
    probe_type: "contact",
    rms_dbuv: 39,
    peak_dbuv: 55,
    ...overrides
  };
}

function leakPeak(options: {
  peak: number;
  baseline?: number;
  probeType?: string;
  overrides?: Row;
}): Row {
  const { peak, baseline, probeType = "airborne", overrides = {} } = options;
  return {
    type: "ultrasound",
    peak_dbmv: peak,
    ...(baseline != null
      ? {
          baseline_dbmv: baseline,
          delta_db: peak - baseline,
          baseline_source: "stored"
        }
      : {}),
    mode: "leak",
    probe_type: probeType,
    ...overrides
  };
}

export const ultrasoundFixtures: TechFixtures = {
  tech: "ultrasound",

  /**
   * Data present on BOTH probe families: contact/mechanical bearings scan +
   * airborne leak scan with a stored baseline. Gates activate on both.
   */
  good: {
    name: "us-known-good",
    rows: [
      baseRow("us-good-1", TS_MONDAY, {
        primary_fault: "Bearing lubrication",
        peaks: [bearingPeak()]
      }),
      baseRow("us-good-2", TS_TUESDAY, {
        peaks: [leakPeak({ peak: 52, baseline: 20 })]
      })
    ],
    truth: [
      {
        field: "bearing ladder source",
        standard:
          "US_DDB_SOURCE — UE Systems structure-borne ladder, contact/mechanical only, NOT an ISO severity standard (prescriptiveDictionary.ts:1481-1482), rendered verbatim beside the ladder (TrendAnalyzer.tsx:7579-7584)",
        expected: US_DDB_SOURCE
      },
      {
        field: "bearing RMS KPI",
        standard:
          "stored rms_dbuv rendered with dBµV unit attached (TrendAnalyzer.tsx:7435-7438)",
        expected: "39 dBµV"
      },
      {
        field: "bearing peak KPI",
        standard: "stored peak_dbuv rendered with dBµV unit attached",
        expected: "55 dBµV"
      },
      {
        field: "leak dB mean",
        standard:
          "DB_POWER_MEAN_NOTE — power-domain mean, dB never arithmetically averaged (src/lib/ultrasound/logUnits.ts:59-60)",
        expected: DB_POWER_MEAN_NOTE
      },
      {
        field: "parked leak economics",
        standard:
          "SLICE-VS8: the dB→CFM model is parked and must NOT run on this tab (leakPerRunBasis.test.ts:55-69)",
        expected: "Parked"
      }
    ]
  },

  /** No data -> honest empty, NO fabricated default. */
  empty: {
    name: "us-known-empty",
    rows: [],
    truth: []
  },

  /**
   * Partial data: leak scan with NO stored baseline (modeled 28 dBµV
   * fallback), a legacy row with NO probe type (unclassified, never silently
   * treated as contact), and two runs captured on the SAME date (· n labels).
   */
  edge: {
    name: "us-known-edge",
    rows: [
      baseRow("us-edge-1", TS_SAME_DAY_EARLY, {
        peaks: [leakPeak({ peak: 44, probeType: "" })]
      }),
      baseRow("us-edge-2", TS_SAME_DAY_LATE, {
        peaks: [leakPeak({ peak: 46 })]
      }),
      baseRow("us-edge-3", TS_TUESDAY, {
        peaks: [bearingPeak()]
      })
    ],
    truth: [
      {
        field: "baseline fallback honesty",
        standard:
          "no stored baseline dBµV -> 28 dBµV applied and delta labeled MODELED, not measured (leakCalculator.ts:175 fallback; TrendAnalyzer.tsx:7667-7671)",
        expected: "Baseline fallback"
      },
      {
        field: "probe typing",
        standard:
          "legacy rows without a stored probe type resolve to unknown and are labeled unclassified — never silently contact (probeType.ts:10-12)",
        expected: "Probe unclassified"
      }
    ]
  }
};
