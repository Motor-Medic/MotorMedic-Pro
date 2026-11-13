/**
 * SLICE-HARNESS fixtures — VIBRATION tab (broadband + spectral).
 *
 * Row shape mirrors the proven SLICE-VS4 factory
 * (src/components/TrendAnalyzer.vs4SpectralRender.test.tsx:26-74):
 * telemetry_data.vibration_trend_record carries broadband/spectral/enveloping.
 *
 * Google-truth baseline: ISO 20816/10816 Class II zone edges live in
 * src/lib/vibration/isoZone.ts:32-37 — I: [0.71,1.8,4.5], II: [2.3,4.5,7.1] —
 * so 2.50 mm/s RMS must classify Zone B and the matrix must say so.
 */
import type { TechFixtures } from "../contract";

const TS_A = "2026-11-13T09:00:00.000Z";
const TS_B = "2026-11-13T11:00:00.000Z";

type Row = Record<string, unknown>;

function vibRow(options: {
  id: string;
  timestamp: string;
  rpm?: number | null;
  rpmSource?: string | null;
}): Row {
  return {
    id: options.id,
    asset_id: "M-101",
    component: null,
    analysis_type: "vibration",
    timestamp: options.timestamp,
    health_score: 82,
    primary_fault: "Imbalance",
    recommendations: [],
    peaks: [],
    telemetry_data: {
      ...(options.rpmSource != null ? { rpm_source: options.rpmSource } : {}),
      vibration_trend_record: {
        assetId: "M-101",
        timestamp: options.timestamp,
        // RPM is only present when the test explicitly stores one — a stored
        // reading must never gain an inferred RPM.
        ...(options.rpm != null ? { rpm: options.rpm } : {}),
        broadband: {
          overallVelocity: 2.5,
          overallAcceleration: 0.42,
          healthScore: 82,
          primaryFault: "Imbalance"
        },
        context: { loadFactorPercent: 90, analysisType: "vibration" },
        spectral: [
          { frequency: 30, amplitude: 1.2, label: "1X" },
          { frequency: 60, amplitude: 0.6, label: "2X" }
        ],
        enveloping: [],
        waveform: []
      }
    }
  };
}

export const vibrationFixtures: TechFixtures = {
  tech: "vibration",

  /** Data present -> gates activate, real values render. */
  good: {
    name: "vibration-known-good",
    rows: [vibRow({ id: "vib-good-1", timestamp: TS_A })],
    truth: [
      {
        field: "overall velocity",
        standard:
          "ISO 20816/10816 Class II zone edges [2.3 / 4.5 / 7.1] mm/s RMS (src/lib/vibration/isoZone.ts:32-37) — 2.50 mm/s is Zone B",
        expected: "Zone B"
      },
      {
        field: "ISO severity matrix",
        standard:
          "ISO 20816 velocity severity matrix rendered from the measured mm/s RMS value",
        expected: "ISO 20816 Severity Matrix"
      },
      {
        field: "overall velocity KPI",
        standard:
          "canonical mm/s RMS stored value rendered with its unit (src/lib/vibration/units.ts:228-233)",
        expected: "2.50 mm/s"
      }
    ]
  },

  /** No data -> honest empty, NO fabricated default. */
  empty: {
    name: "vibration-known-empty",
    rows: [],
    truth: []
  },

  /** Partial data: stored RPM clears the gate; ratio stays dimensionless. */
  edge: {
    name: "vibration-known-edge",
    rows: [vibRow({ id: "vib-edge-1", timestamp: TS_B, rpm: 1780, rpmSource: "vision-extracted" })],
    truth: [
      {
        field: "2X:1X ratio",
        standard:
          "0.6 / 1.2 = 0.50 — pure math on stored amplitudes; HARMONIC_RATIO_RUBRIC (src/lib/vibration/spectralTrend.ts:255-258) is descriptive, NOT an ISO 20816 severity limit",
        expected: "0.50"
      }
    ]
  }
};
