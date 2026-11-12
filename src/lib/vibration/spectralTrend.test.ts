import { describe, expect, it } from "vitest";
import {
  HARMONIC_RATIO_RUBRIC,
  MISSING_RPM_ORDER_HELPER_TEXT,
  SPARSE_TREND_HELPER_TEXT,
  SPECTRAL_ORDERS_RPM_GATE_NOTE,
  SPECTRAL_ORDER_PROVENANCE_STORED,
  buildSpectralHarmonicTrend,
  computeHarmonicRatio,
  describeHarmonicRatio,
  spectralAmplitudeAxisLabel,
  spectralOrderProvenanceLabel
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

describe("SLICE-VS4 stored-vs-derived order discipline", () => {
  const STORED_ORDERS = [
    { frequency: H1, amplitude: 1.2, label: "1X" },
    { frequency: H1 * 2, amplitude: 0.6, label: "2X" }
  ];

  it("renders stored 1X/2X with provenance even when RPM is absent", () => {
    const trend = buildSpectralHarmonicTrend([
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        rpm: null,
        peaks: STORED_ORDERS,
        overall: 2.5
      },
      {
        timestamp: "2026-01-02T00:00:00.000Z",
        rpm: null,
        peaks: STORED_ORDERS,
        overall: 3.1
      }
    ]);

    // Never suppress a real stored measurement because RPM is missing.
    expect(trend.rows.map((row) => row.amp1X)).toEqual([1.2, 1.2]);
    expect(trend.rows.map((row) => row.amp2X)).toEqual([0.6, 0.6]);
    expect(trend.rows[0].amp1XSource).toBe("stored");
    expect(trend.rows[0].amp2XSource).toBe("stored");
    expect(spectralOrderProvenanceLabel("stored")).toBe(
      SPECTRAL_ORDER_PROVENANCE_STORED
    );
    expect(trend.hasStoredOrders).toBe(true);
    expect(trend.hasOrderSeries).toBe(true);
    // RPM is still required for re-extraction and interpretation gating.
    expect(trend.ordersUnavailable).toBe(true);
    expect(trend.hasDerivedOrders).toBe(false);
    expect(SPECTRAL_ORDERS_RPM_GATE_NOTE).toContain(
      "requires configured RPM in Equipment DB"
    );
    // Pure ratio math survives, but RPM-gated interpretation does not.
    expect(trend.rows[0].ratio?.ratio).toBe(0.5);
    expect(trend.rows[0].ratio?.basis).toBe("stored");
    expect(trend.rows[0].ratio?.interpretation).toBeNull();
  });

  it("never derives bins or interprets without a stored RPM", () => {
    const trend = buildSpectralHarmonicTrend([
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        rpm: null,
        peaks: [
          { frequency: H1, amplitude: 1.2 },
          { frequency: H1 * 2, amplitude: 0.6 }
        ],
        overall: 2.5
      }
    ]);

    expect(trend.rows[0].amp1X).toBeNull();
    expect(trend.rows[0].amp2X).toBeNull();
    expect(trend.rows[0].amp1XSource).toBeNull();
    expect(trend.rows[0].amp2XSource).toBeNull();
    expect(trend.rows[0].ratio).toBeNull();
    expect(trend.ordersUnavailable).toBe(true);
    expect(trend.hasOrderSeries).toBe(false);
    expect(trend.hasDerivedOrders).toBe(false);
  });

  it("re-extracts from stored bins only when the sample stores RPM", () => {
    const trend = buildSpectralHarmonicTrend([
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        rpm: RPM_1780,
        peaks: [
          { frequency: H1, amplitude: 1.2 },
          { frequency: H1 * 2, amplitude: 0.6 }
        ],
        overall: 2.5
      }
    ]);

    expect(trend.rows[0].amp1X).toBe(1.2);
    expect(trend.rows[0].amp2X).toBe(0.6);
    expect(trend.rows[0].amp1XSource).toBe("derived");
    expect(trend.rows[0].amp2XSource).toBe("derived");
    expect(trend.ordersUnavailable).toBe(false);
    expect(trend.hasDerivedOrders).toBe(true);
    expect(trend.hasStoredOrders).toBe(false);
  });

  it("prefers a stored labeled order over a same-bin re-extraction", () => {
    const trend = buildSpectralHarmonicTrend([
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        rpm: RPM_1780,
        peaks: [
          { frequency: H1, amplitude: 9.9 },
          { frequency: H1, amplitude: 1.2, label: "1X" }
        ],
        overall: 2.5
      }
    ]);
    expect(trend.rows[0].amp1X).toBe(1.2);
    expect(trend.rows[0].amp1XSource).toBe("stored");
  });

  it("does not zero-flatten or re-derive a labeled peak with no amplitude", () => {
    const trend = buildSpectralHarmonicTrend([
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        rpm: RPM_1780,
        peaks: [
          { frequency: H1, amplitude: null, label: "1X" },
          { frequency: H1, amplitude: 9.9 }
        ],
        overall: 2.5
      }
    ]);
    expect(trend.rows[0].amp1X).toBeNull();
    expect(trend.rows[0].amp1XSource).toBeNull();
  });
});

describe("SLICE-VS4 2X:1X ratio and labeled rubric", () => {
  it("computes the ratio only when both amplitudes exist and 1X > 0", () => {
    expect(computeHarmonicRatio(1.2, 0.6, "stored", "stored")).toMatchObject({
      ratio: 0.5,
      basis: "stored"
    });
    expect(computeHarmonicRatio(null, 0.6, null, "stored")).toBeNull();
    expect(computeHarmonicRatio(1.2, null, "stored", null)).toBeNull();
    expect(computeHarmonicRatio(0, 0.6, null, "stored")).toBeNull();
    expect(computeHarmonicRatio(-1, 0.6, "stored", "stored")).toBeNull();
  });

  it("labels the ratio basis without implying a measurement it lacks", () => {
    const stored = computeHarmonicRatio(1.2, 0.6, "stored", "stored");
    expect(stored?.basisNote).toContain("as extracted at collection");
    const derived = computeHarmonicRatio(1.2, 0.6, "derived", "derived");
    expect(derived?.basisNote).toContain("re-extracted from stored FFT bins");
    const mixed = computeHarmonicRatio(1.2, 0.6, "stored", "derived");
    expect(mixed?.basis).toBe("mixed");
    expect(mixed?.basisNote).toContain("mixed");
  });

  it("attaches only a descriptive, labeled-rubric interpretation", () => {
    const ratio = computeHarmonicRatio(1.0, 2.0, "stored", "stored");
    expect(ratio?.interpretation?.label).toContain("consistent with");
    expect(ratio?.interpretation?.label).not.toMatch(
      /confirmed|diagnosis|fault detected/i
    );
    expect(ratio?.interpretation?.source).toContain("not an ISO 20816");
    expect(ratio?.interpretation?.rubricId).toBe(HARMONIC_RATIO_RUBRIC.id);
  });

  it("omits interpretation when no labeled rubric is available", () => {
    const ratio = computeHarmonicRatio(1.0, 2.0, "stored", "stored", null);
    expect(ratio).not.toBeNull();
    expect(ratio?.interpretation).toBeNull();
    expect(describeHarmonicRatio(2, null)).toBeNull();
  });

  it("puts the ratio on a row only when prerequisites are met", () => {
    const trend = buildSpectralHarmonicTrend([
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        rpm: null,
        peaks: [
          { frequency: H1, amplitude: 1.2, label: "1X" },
          { frequency: H1 * 2, amplitude: 0.6, label: "2X" }
        ],
        overall: 2.5
      }
    ]);
    expect(trend.rows[0].ratio?.ratio).toBe(0.5);
    expect(trend.rows[0].ratio?.basis).toBe("stored");
    // No stored RPM -> no RPM-gated interpretation, even for stored orders.
    expect(trend.rows[0].ratio?.interpretation).toBeNull();
  });

  it("attaches the rubric interpretation to a stored order when RPM is present", () => {
    const trend = buildSpectralHarmonicTrend([
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        rpm: RPM_1780,
        peaks: [
          { frequency: H1, amplitude: 1.2, label: "1X" },
          { frequency: H1 * 2, amplitude: 0.6, label: "2X" }
        ],
        overall: 2.5
      }
    ]);
    expect(trend.rows[0].ratio?.ratio).toBe(0.5);
    expect(trend.rows[0].ratio?.interpretation?.label).toContain(
      "consistent with"
    );
    expect(trend.rows[0].ratio?.interpretation?.source).toContain(
      "not an ISO 20816"
    );
  });
});

describe("SLICE-VS4 same-date, stopped-sample, and unit-physics guards", () => {
  it("assigns deterministic same-date sequence labels", () => {
    const inputs = [
      {
        timestamp: "2026-10-30T12:00:00.000Z",
        rpm: null,
        peaks: [{ frequency: H1, amplitude: 1.1, label: "1X" }],
        overall: 2.5
      },
      {
        timestamp: "2026-10-30T13:00:00.000Z",
        rpm: null,
        peaks: [{ frequency: H1, amplitude: 1.3, label: "1X" }],
        overall: 2.7
      }
    ];
    const first = buildSpectralHarmonicTrend(inputs);
    const second = buildSpectralHarmonicTrend(inputs);
    expect(first.rows[0].date).toBe(first.rows[1].date);
    expect(first.rows.map((row) => row.dateLabel)).toEqual([
      `${first.rows[0].date} \u00b7 1`,
      `${first.rows[0].date} \u00b7 2`
    ]);
    expect(second.rows.map((row) => row.dateLabel)).toEqual(
      first.rows.map((row) => row.dateLabel)
    );
  });

  it("keeps a single date label clean (no sequence suffix)", () => {
    const trend = buildSpectralHarmonicTrend([
      {
        timestamp: "2026-10-30T12:00:00.000Z",
        rpm: null,
        peaks: [{ frequency: H1, amplitude: 1.1, label: "1X" }],
        overall: 2.5
      }
    ]);
    expect(trend.rows[0].dateLabel).toBe(trend.rows[0].date);
    expect(trend.rows[0].sequence).toBe(1);
  });

  it("carries the SSOT stopped-sample label through to the row", () => {
    const trend = buildSpectralHarmonicTrend([
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        rpm: null,
        peaks: [],
        overall: 2.5,
        stoppedLabel: "stopped sample"
      }
    ]);
    expect(trend.rows[0].stoppedLabel).toBe("stopped sample");
  });

  it("never converts a velocity amplitude without an order frequency", () => {
    // Without RPM there is no order frequency, yet the stored amplitude is
    // unchanged: no mm/s -> g conversion may be applied to the series.
    const trend = buildSpectralHarmonicTrend([
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        rpm: null,
        peaks: [{ frequency: H1, amplitude: 1.234, label: "1X" }],
        overall: 2.5
      }
    ]);
    expect(trend.rows[0].amp1X).toBe(1.234);
    expect(trend.rows[0].amp1XSource).toBe("stored");
  });
});
