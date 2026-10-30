import { describe, expect, it } from "vitest";
import {
  MISSING_RPM_ORDER_HELPER_TEXT,
  SPARSE_TREND_HELPER_TEXT,
  buildSpectralHarmonicTrend,
  spectralAmplitudeAxisLabel
} from "./spectralTrend";

const RPM_1780 = 1780;
const H1 = RPM_1780 / 60;
const PEAKS = [
  { frequency: H1, amplitude: 1.2 },
  { frequency: H1 * 2, amplitude: 0.6 }
];

function completeInput(timestamp: string) {
  return {
    timestamp,
    rpm: RPM_1780,
    peaks: PEAKS,
    overall: 2.5
  };
}

describe("SLICE-J2 spectral trend guards", () => {
  it("flags a single spectral reading as sparse and keeps the point", () => {
    const trend = buildSpectralHarmonicTrend([completeInput("2026-01-01T00:00:00.000Z")]);
    expect(trend.rows).toHaveLength(1);
    expect(trend.isSparse).toBe(true);
    expect(trend.ordersUnavailable).toBe(false);
    expect(SPARSE_TREND_HELPER_TEXT).toBe(
      "Additional historical readings required to plot trend slope"
    );
  });

  it("flags duplicate dates as sparse", () => {
    const date = "2026-01-01T00:00:00.000Z";
    const trend = buildSpectralHarmonicTrend([
      completeInput(date),
      completeInput(date)
    ]);
    expect(trend.rows).toHaveLength(2);
    expect(trend.isSparse).toBe(true);
  });

  it("does not zero-fill or fake 1X/2X when RPM is absent", () => {
    const trend = buildSpectralHarmonicTrend([
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        rpm: null,
        peaks: PEAKS,
        overall: 2.5
      },
      {
        timestamp: "2026-01-02T00:00:00.000Z",
        rpm: null,
        peaks: PEAKS,
        overall: 3.1
      }
    ]);

    expect(trend.ordersUnavailable).toBe(true);
    expect(trend.rows).toHaveLength(2);
    for (const row of trend.rows) {
      expect(row.amp1X).toBeNull();
      expect(row.amp2X).toBeNull();
    }
    expect(trend.rows.map((row) => row.overall)).toEqual([2.5, 3.1]);
    expect(MISSING_RPM_ORDER_HELPER_TEXT).toBe(
      "Running speed required to compute order harmonics"
    );
  });

  it("keeps overall rows even when no spectral peaks are stored", () => {
    const trend = buildSpectralHarmonicTrend([
      { timestamp: "2026-01-01T00:00:00.000Z", rpm: null, peaks: [], overall: 1.8 },
      { timestamp: "2026-01-02T00:00:00.000Z", rpm: null, peaks: [], overall: 1.9 }
    ]);
    expect(trend.ordersUnavailable).toBe(true);
    expect(trend.rows.map((row) => row.overall)).toEqual([1.8, 1.9]);
    expect(trend.rows.every((row) => row.amp1X === null)).toBe(true);
    expect(trend.rows.every((row) => row.amp2X === null)).toBe(true);
  });

  it("is inert on complete P-101A-equivalent data", () => {
    const trend = buildSpectralHarmonicTrend([
      completeInput("2026-01-01T00:00:00.000Z"),
      completeInput("2026-01-02T00:00:00.000Z")
    ]);

    expect(trend.isSparse).toBe(false);
    expect(trend.ordersUnavailable).toBe(false);
    expect(trend.rows).toHaveLength(2);
    expect(trend.rows[0].amp1X).toBe(1.2);
    expect(trend.rows[0].amp2X).toBe(0.6);
    expect(trend.rows[0].overall).toBe(2.5);
  });

  it("never zero-flattens a missing peak amplitude", () => {
    const trend = buildSpectralHarmonicTrend([
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        rpm: RPM_1780,
        peaks: [{ frequency: H1, amplitude: null }],
        overall: 2.5
      },
      {
        timestamp: "2026-01-02T00:00:00.000Z",
        rpm: RPM_1780,
        peaks: [{ frequency: H1, amplitude: null }],
        overall: 2.8
      }
    ]);
    expect(trend.ordersUnavailable).toBe(false);
    expect(trend.rows.every((row) => row.amp1X === null)).toBe(true);
    expect(trend.rows.every((row) => row.amp2X === null)).toBe(true);
  });

  it("routes the amplitude axis label through tenant display units", () => {
    expect(spectralAmplitudeAxisLabel("mm/s")).toBe("Peak amplitude (mm/s)");
    expect(spectralAmplitudeAxisLabel("in/s")).toBe("Peak amplitude (in/s)");
  });
});
