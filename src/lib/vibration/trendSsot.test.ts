import { describe, expect, it } from "vitest";
import type { SavedAnalysisResult } from "../analysisPersistence";
import { filterTrendByTimeRange } from "./trendSeries";
import {
  RUNNING_STATE_LOAD_THRESHOLD_PERCENT,
  VIBRATION_INDETERMINATE_VERDICT,
  VIBRATION_NOT_DETECTED,
  VIBRATION_NOT_MEASURED,
  VIBRATION_NOT_REPORTED,
  applyVibrationRunningStateFilter,
  latestVibrationRecordFromRows,
  readVibrationLoadPercent,
  readVibrationOverallAcceleration,
  readVibrationOverallVelocity,
  readVibrationPerAxis,
  reconcileVibrationVerdict,
  selectLatestVibrationRow,
  sortVibrationRowsNewestFirst,
  vibrationSampleState,
  vibrationStoppedSampleLabel,
  vibrationRowsInScope
} from "./trendSsot";
import { healthScoreFromVelocityMmS } from "./isoZone";
import {
  formatAccelerationDisplay,
  formatVelocityDisplay,
  frequencyValueForDisplay
} from "./units";

interface RowOptions {
  id?: string;
  timestamp?: string;
  created_at?: string;
  fault?: string | null;
  overallVelocity?: number | null;
  overallAcceleration?: number | null;
  loadFactorPercent?: number | null;
  peaks?: unknown[];
  consensus?: Record<string, unknown> | null;
}

function row(options: RowOptions = {}): SavedAnalysisResult {
  const {
    id = "row-1",
    timestamp = "2026-01-01T00:00:00.000Z",
    created_at,
    fault = "Imbalance",
    overallVelocity,
    overallAcceleration,
    loadFactorPercent,
    peaks = [],
    consensus = null
  } = options;

  const trendContext: Record<string, unknown> = {};
  if (loadFactorPercent !== undefined) {
    trendContext.loadFactorPercent = loadFactorPercent;
  }

  const telemetry: Record<string, unknown> = {
    vibration_trend_record: {
      assetId: "asset-1",
      timestamp,
      context: trendContext,
      broadband: {
        overallVelocity: overallVelocity ?? 0,
        overallAcceleration: overallAcceleration ?? 0,
        healthScore: 80,
        primaryFault: fault ?? ""
      },
      spectral: [],
      enveloping: [],
      waveform: []
    }
  };
  if (overallVelocity !== undefined) {
    telemetry.overall_velocity = overallVelocity;
  }
  if (overallAcceleration !== undefined) {
    telemetry.overall_acceleration = overallAcceleration;
  }

  return {
    id,
    asset_id: "asset-1",
    component: "DE Bearing",
    timestamp,
    created_at,
    health_score: 92,
    primary_fault: fault,
    fault_list: [],
    peaks,
    spectrum_image_url: null,
    recommendations: [],
    financial_impact: {},
    severity: "MEDIUM",
    summary: "Saved row",
    consensus_details: consensus,
    telemetry_data: telemetry
  } as SavedAnalysisResult;
}

describe("trend SSOT — running-state scope", () => {
  it("keeps the threshold rule in sync with the >80% load copy", () => {
    expect(RUNNING_STATE_LOAD_THRESHOLD_PERCENT).toBe(80);
  });

  it("reads load telemetry from the trend-record context and telemetry root", () => {
    expect(readVibrationLoadPercent(row({ loadFactorPercent: 72 }))).toBe(72);
    expect(
      readVibrationLoadPercent({
        ...row(),
        telemetry_data: { overall_velocity: 3, load_percent: 91 }
      } as SavedAnalysisResult)
    ).toBe(91);
    expect(readVibrationLoadPercent(row())).toBeNull();
  });

  it("never infers a missing load field as stopped", () => {
    const state = vibrationSampleState(row({ overallVelocity: 4 }));
    expect(state.hasLoadTelemetry).toBe(false);
    expect(state.stopped).toBe(false);
    expect(state.running).toBe(true);
    expect(state.zeroVelocity).toBe(false);
  });

  it("treats at-or-below-threshold load as stopped and above as running", () => {
    expect(vibrationSampleState(row({ loadFactorPercent: 80 })).stopped).toBe(
      true
    );
    expect(vibrationSampleState(row({ loadFactorPercent: 80.1 })).stopped).toBe(
      false
    );
  });

  it("ON excludes stopped rows; OFF keeps every in-window row", () => {
    const running = row({
      id: "run",
      timestamp: "2026-01-02T00:00:00.000Z",
      loadFactorPercent: 88,
      overallVelocity: 4
    });
    const stopped = row({
      id: "stop",
      timestamp: "2026-01-03T00:00:00.000Z",
      loadFactorPercent: 72,
      overallVelocity: 0
    });

    expect(applyVibrationRunningStateFilter([running, stopped], true)).toEqual([
      running
    ]);
    expect(applyVibrationRunningStateFilter([running, stopped], false)).toEqual([
      running,
      stopped
    ]);
  });

  it("selects the newest running row when ON, the newest row when OFF", () => {
    const running = row({
      id: "run",
      timestamp: "2026-01-02T00:00:00.000Z",
      loadFactorPercent: 88,
      overallVelocity: 4
    });
    const stopped = row({
      id: "stop",
      timestamp: "2026-01-03T00:00:00.000Z",
      loadFactorPercent: 72,
      overallVelocity: 0
    });

    expect(selectLatestVibrationRow([running, stopped], true)?.id).toBe("run");
    expect(selectLatestVibrationRow([running, stopped], false)?.id).toBe("stop");
    expect(selectLatestVibrationRow([], true)).toBeNull();
  });

  it("labels stopped samples and zero-velocity samples honestly", () => {
    expect(
      vibrationStoppedSampleLabel(
        row({ loadFactorPercent: 72, overallVelocity: 0 })
      )
    ).toBe("stopped sample");
    expect(
      vibrationStoppedSampleLabel(
        row({ loadFactorPercent: 90, overallVelocity: 0 })
      )
    ).toBe("no velocity recorded");
    expect(
      vibrationStoppedSampleLabel(
        row({ loadFactorPercent: 90, overallVelocity: 4 })
      )
    ).toBeNull();
  });
});

describe("trend SSOT — deterministic ordering", () => {
  it("orders by timestamp DESC, then created_at DESC, then id DESC", () => {
    const sameTimeA = row({
      id: "row-2",
      timestamp: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T10:00:00.000Z"
    });
    const sameTimeB = row({
      id: "row-10",
      timestamp: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T10:00:00.000Z"
    });
    const newerCreated = row({
      id: "row-3",
      timestamp: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T11:00:00.000Z"
    });
    const newest = row({
      id: "row-4",
      timestamp: "2026-01-02T00:00:00.000Z"
    });

    const ordered = sortVibrationRowsNewestFirst([
      sameTimeB,
      newerCreated,
      sameTimeA,
      newest
    ]);

    expect(ordered.map((r) => r.id)).toEqual([
      "row-4",
      "row-3",
      "row-10",
      "row-2"
    ]);
  });

  it("keeps equal rows in a stable order across repeated sorts", () => {
    const rows = [
      row({ id: "b", timestamp: "2026-01-01T00:00:00.000Z" }),
      row({ id: "a", timestamp: "2026-01-01T00:00:00.000Z" })
    ];
    const first = sortVibrationRowsNewestFirst(rows).map((r) => r.id);
    const second = sortVibrationRowsNewestFirst(rows).map((r) => r.id);
    expect(first).toEqual(second);
  });
});

describe("trend SSOT — metric readers", () => {
  it("reads overall velocity/acceleration without fabricating values", () => {
    expect(readVibrationOverallVelocity(row({ overallVelocity: 4.2 }))).toBe(4.2);
    expect(
      readVibrationOverallAcceleration(row({ overallAcceleration: 0.61 }))
    ).toBe(0.61);
    expect(readVibrationOverallVelocity(row())).toBe(0);
    expect(readVibrationOverallVelocity(null)).toBeNull();
    expect(readVibrationOverallAcceleration(null)).toBeNull();
  });

  it("reads each axis independently and never falls back to the overall peak", () => {
    const axes = readVibrationPerAxis(
      row({
        peaks: [
          { label: "H", amplitude: 1.2 },
          { label: "Axial (A)", amplitude: 0.8 }
        ]
      })
    );
    expect(axes).toEqual({ horizontal: 1.2, vertical: null, axial: 0.8 });
    expect(readVibrationPerAxis(row())).toEqual({
      horizontal: null,
      vertical: null,
      axial: null
    });
    expect(readVibrationPerAxis(null)).toEqual({
      horizontal: null,
      vertical: null,
      axial: null
    });
  });

  it("uses the newest saved record inside the shared scope", () => {
    const older = row({
      id: "old",
      timestamp: "2026-01-01T00:00:00.000Z",
      overallVelocity: 3
    });
    const newer = row({
      id: "new",
      timestamp: "2026-01-02T00:00:00.000Z",
      overallVelocity: 5
    });
    const record = latestVibrationRecordFromRows([older, newer]);
    expect(record?.broadband.overallVelocity).toBe(5);
    expect(latestVibrationRecordFromRows([])).toBeNull();
  });
});

describe("trend SSOT — reconciled verdict + health provenance", () => {
  it("shows the agreed verdict and a velocity-derived health score", () => {
    const verdict = reconcileVibrationVerdict(
      row({ overallVelocity: 5, fault: "Imbalance" }),
      "Class II"
    );
    expect(verdict.status).toBe("reconciled");
    expect(verdict.primaryFault).toBe("Imbalance");
    expect(verdict.conflict).toBe(false);
    expect(verdict.healthScore).toBe(58);
    expect(verdict.healthSource).toBe("iso-velocity");
    expect(verdict.healthProvenance).toContain("ISO 20816");
    expect(verdict.healthProvenance).toContain("5.00 mm/s RMS");
    expect(verdict.overallVelocityMmS).toBe(5);
  });

  it("returns Indeterminate and blanks health when agents disagree", () => {
    const verdict = reconcileVibrationVerdict(
      row({
        overallVelocity: 4,
        fault: "Bearing defect",
        consensus: {
          refereeDebateSummary:
            'Agents disagreed: AgentA="Normal" vs AgentB="Bearing defect ISO Zone D".'
        }
      }),
      "Class II"
    );
    expect(verdict.status).toBe("indeterminate");
    expect(verdict.primaryFault).toBe(VIBRATION_INDETERMINATE_VERDICT);
    expect(verdict.conflict).toBe(true);
    expect(verdict.healthScore).toBeNull();
    expect(verdict.healthProvenance).toContain("agents disagree");
    expect(verdict.primaryFaultRaw).toBe("Bearing defect");
  });

  it("returns Indeterminate when the referee asks for manual review", () => {
    const verdict = reconcileVibrationVerdict(
      row({
        overallVelocity: 4,
        consensus: {
          refereeDebateSummary:
            "Verdict inconclusive — manual review recommended before action."
        }
      })
    );
    expect(verdict.status).toBe("indeterminate");
    expect(verdict.healthScore).toBeNull();
  });

  it("blanks health for a stopped latest sample while keeping the verdict", () => {
    const verdict = reconcileVibrationVerdict(
      row({
        overallVelocity: 0,
        loadFactorPercent: 72,
        fault: "Imbalance"
      })
    );
    expect(verdict.status).toBe("reconciled");
    expect(verdict.primaryFault).toBe("Imbalance");
    expect(verdict.healthScore).toBeNull();
    expect(verdict.healthSource).toBe("none");
    expect(verdict.healthProvenance).toContain("stopped");
    expect(verdict.overallVelocityMmS).toBeNull();
  });

  it("blanks health when velocity is missing but the verdict is present", () => {
    const verdict = reconcileVibrationVerdict(row({ fault: "Misalignment" }));
    expect(verdict.primaryFault).toBe("Misalignment");
    expect(verdict.healthScore).toBeNull();
    expect(verdict.healthProvenance).toContain("no overall velocity");
  });

  it("distinguishes the null trio: measured / reported / detected", () => {
    const measured = new Set([
      VIBRATION_NOT_MEASURED,
      VIBRATION_NOT_REPORTED,
      VIBRATION_NOT_DETECTED
    ]);
    expect(measured.size).toBe(3);

    const noRow = reconcileVibrationVerdict(null);
    expect(noRow.status).toBe("no-sample");
    expect(noRow.primaryFault).toBe(VIBRATION_NOT_MEASURED);
    expect(noRow.healthScore).toBeNull();

    const noFault = reconcileVibrationVerdict(
      row({ fault: null, overallVelocity: 4 })
    );
    expect(noFault.primaryFault).toBe(VIBRATION_NOT_REPORTED);

    const normal = reconcileVibrationVerdict(
      row({ fault: "No significant fault", overallVelocity: 1 })
    );
    expect(normal.primaryFault).toBe(VIBRATION_NOT_DETECTED);
  });

  it("derives health from the ISO zone of the overall velocity", () => {
    expect(healthScoreFromVelocityMmS(1, "Class II")).toBe(92);
    expect(healthScoreFromVelocityMmS(3, "Class II")).toBe(78);
    expect(healthScoreFromVelocityMmS(5, "Class II")).toBe(58);
    expect(healthScoreFromVelocityMmS(9, "Class II")).toBe(22);
    expect(healthScoreFromVelocityMmS(0, "Class II")).toBeNull();
    expect(healthScoreFromVelocityMmS(null, "Class II")).toBeNull();
  });
});

describe("trend SSOT — windowing lockstep", () => {
  it("windows once, then filters/sorts the same rows for every surface", () => {
    const now = Date.parse("2026-02-01T00:00:00.000Z");
    const inWindowRunning = row({
      id: "in-run",
      timestamp: "2026-01-31T00:00:00.000Z",
      loadFactorPercent: 90,
      overallVelocity: 4
    });
    const inWindowStopped = row({
      id: "in-stop",
      timestamp: "2026-01-30T00:00:00.000Z",
      loadFactorPercent: 72,
      overallVelocity: 0
    });
    const outOfWindow = row({
      id: "out",
      timestamp: "2025-10-01T00:00:00.000Z",
      loadFactorPercent: 90,
      overallVelocity: 8
    });

    const windowed = filterTrendByTimeRange(
      [inWindowRunning, inWindowStopped, outOfWindow],
      "30D",
      now
    );
    expect(windowed.map((r) => r.id).sort()).toEqual(["in-run", "in-stop"]);

    const onScope = vibrationRowsInScope(windowed, true);
    const offScope = vibrationRowsInScope(windowed, false);
    expect(onScope.map((r) => r.id)).toEqual(["in-run"]);
    expect(offScope.map((r) => r.id)).toEqual(["in-run", "in-stop"]);
    expect(selectLatestVibrationRow(windowed, true)?.id).toBe("in-run");
    expect(selectLatestVibrationRow(windowed, false)?.id).toBe("in-run");
  });
});

describe("trend SSOT — unit isolation", () => {
  it("isolates mm/s, g and Hz display readouts", () => {
    expect(formatVelocityDisplay(4, "mm/s")).toBe("4.00 mm/s");
    expect(formatVelocityDisplay(4, "in/s")).toBe("0.1575 in/s");
    expect(formatAccelerationDisplay(0.5, "g")).toBe("0.500 g");
    expect(formatAccelerationDisplay(0.5, "mm/s2")).toContain("mm/s2");
    // Frequency display conversion is independent of the velocity unit.
    expect(frequencyValueForDisplay(50, "Hz", 1500)).toBe(50);
    expect(frequencyValueForDisplay(50, "CPM", 1500)).toBe(3000);
  });
});
