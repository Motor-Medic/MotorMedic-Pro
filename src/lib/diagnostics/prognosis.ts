/**
 * Computed prognosis / remaining useful life.
 *
 * Every horizon here is a linear extrapolation of values already stored in the
 * database, using the same `linearRatePerHour` and `projectHoursToThreshold`
 * helpers the oil tabs use. No hours are invented: a metric that is flat,
 * improving, or measured only once yields no projection at all.
 *
 * Note on time bases. Oil samples carry real `operating_hours`, so oil
 * projections are in operating hours. Saved vibration analyses carry only a
 * wall-clock `timestamp`, so vibration projections are in calendar hours and
 * are tagged as such. The two are not interchangeable and the UI says so
 * whenever a set mixes them.
 */

import {
  linearRatePerHour,
  projectHoursToThreshold
} from "../oilAnalysisMetrics";
import type { SavedAnalysisResult } from "../analysisPersistence";
import {
  DEFAULT_ALARM_LIMITS,
  type OilSample,
  type WearMetalKey
} from "../../types/oilAnalysis";

/** Whether hours are machine run-time or wall-clock elapsed time. */
export type TimeBasis = "operating" | "calendar";

export interface Projection {
  id: string;
  label: string;
  /** Where the numbers came from, shown verbatim in the UI. */
  source: string;
  currentValue: number;
  threshold: number;
  unit: string;
  direction: "rising" | "falling";
  basis: TimeBasis;
  ratePerHour: number;
  hoursRemaining: number;
  sampleCount: number;
}

export interface NonConvergingMetric {
  label: string;
  note: string;
}

export interface PrognosisResult {
  /** Converging projections, soonest first. */
  projections: Projection[];
  /** Metrics that had data but produced no horizon, with the reason. */
  nonConverging: NonConvergingMetric[];
  /** Soonest projection — the unmitigated horizon. */
  horizon: Projection | null;
  /** True when projections use more than one time basis. */
  mixedBasis: boolean;
}

/** Varnish onset thresholds, matching the Ferrography & Varnish tab. */
export const MPC_THRESHOLD = 30;
export const RULER_THRESHOLD = 25;

/**
 * Envelope acceleration danger line, matching the reference line already drawn
 * on the Run Diagnostics envelope chart.
 */
export const ENVELOPE_DANGER_GE = 2.5;

const WEAR_METAL_LABEL: Record<WearMetalKey, string> = {
  iron: "Iron (Fe)",
  copper: "Copper (Cu)",
  chromium: "Chromium (Cr)",
  lead: "Lead (Pb)",
  aluminum: "Aluminum (Al)",
  silicon: "Silicon (Si)"
};

interface MetricPoint {
  hours: number;
  value: number;
}

/**
 * Build a projection from a metric's history, or explain why there isn't one.
 * Returns null when there is too little data to say anything at all.
 */
function project(config: {
  id: string;
  label: string;
  source: string;
  points: MetricPoint[];
  threshold: number;
  unit: string;
  direction: "rising" | "falling";
  basis: TimeBasis;
}):
  | { projection: Projection }
  | { nonConverging: NonConvergingMetric }
  | null {
  const { id, label, source, points, threshold, unit, direction, basis } =
    config;

  if (points.length < 2) return null;

  const current = points[points.length - 1].value;
  const rate = linearRatePerHour(points);

  if (rate == null) {
    return {
      nonConverging: {
        label,
        note: "No elapsed time between records - cannot derive a rate."
      }
    };
  }

  const hours = projectHoursToThreshold(current, rate, threshold, direction);

  if (hours == null) {
    return {
      nonConverging: {
        label,
        note:
          direction === "rising"
            ? `Flat or improving (${current}${unit} vs ${threshold}${unit} limit) - no horizon.`
            : `Flat or recovering (${current}${unit} vs ${threshold}${unit} limit) - no horizon.`
      }
    };
  }

  if (hours <= 0) {
    return {
      nonConverging: {
        label,
        note: `Already past the ${threshold}${unit} limit at ${current}${unit} - act now, no countdown.`
      }
    };
  }

  return {
    projection: {
      id,
      label,
      source,
      currentValue: current,
      threshold,
      unit,
      direction,
      basis,
      ratePerHour: rate,
      hoursRemaining: hours,
      sampleCount: points.length
    }
  };
}

/** Oil-derived projections: varnish chemistry and wear metals vs alarm limits. */
export function buildOilProjections(samples: OilSample[]): {
  projections: Projection[];
  nonConverging: NonConvergingMetric[];
} {
  const projections: Projection[] = [];
  const nonConverging: NonConvergingMetric[] = [];

  const collect = (
    result: ReturnType<typeof project> | null
  ): void => {
    if (!result) return;
    if ("projection" in result) projections.push(result.projection);
    else nonConverging.push(result.nonConverging);
  };

  const pointsFor = (pick: (s: OilSample) => number | undefined): MetricPoint[] =>
    samples
      .filter((s) => {
        const v = pick(s);
        return v != null && Number.isFinite(v);
      })
      .map((s) => ({ hours: s.operatingHours, value: pick(s) as number }));

  collect(
    project({
      id: "oil-mpc",
      label: "MPC ΔE (varnish potential)",
      source: "oil_samples.mpc_delta_e",
      points: pointsFor((s) => s.mpcDeltaE),
      threshold: MPC_THRESHOLD,
      unit: " ΔE",
      direction: "rising",
      basis: "operating"
    })
  );

  collect(
    project({
      id: "oil-ruler",
      label: "RULER (antioxidant reserve)",
      source: "oil_samples.ruler_percent",
      points: pointsFor((s) => s.rulerPercent),
      threshold: RULER_THRESHOLD,
      unit: "%",
      direction: "falling",
      basis: "operating"
    })
  );

  for (const key of Object.keys(WEAR_METAL_LABEL) as WearMetalKey[]) {
    collect(
      project({
        id: `oil-${key}`,
        label: `${WEAR_METAL_LABEL[key]} vs alarm limit`,
        source: `oil_samples.${key}`,
        points: pointsFor((s) => s[key]),
        threshold: DEFAULT_ALARM_LIMITS[key],
        unit: " ppm",
        direction: "rising",
        basis: "operating"
      })
    );
  }

  return { projections, nonConverging };
}

/**
 * Vibration-derived projections from saved analyses. Uses calendar hours
 * between saved timestamps, since analysis_results stores no operating hours.
 */
export function buildVibrationProjections(records: SavedAnalysisResult[]): {
  projections: Projection[];
  nonConverging: NonConvergingMetric[];
} {
  const projections: Projection[] = [];
  const nonConverging: NonConvergingMetric[] = [];

  const chronological = records
    .filter((r) => (r.analysis_type ?? "vibration") === "vibration")
    .slice()
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

  if (chronological.length < 2) {
    return { projections, nonConverging };
  }

  const epoch = new Date(chronological[0].timestamp).getTime();
  const MS_PER_HOUR = 3_600_000;

  const points = chronological
    .filter(
      (r) =>
        r.envelope_peak_amplitude != null &&
        Number.isFinite(Number(r.envelope_peak_amplitude))
    )
    .map((r) => ({
      hours: (new Date(r.timestamp).getTime() - epoch) / MS_PER_HOUR,
      value: Number(r.envelope_peak_amplitude)
    }));

  const result = project({
    id: "vib-envelope",
    label: "Envelope peak acceleration",
    source: "analysis_results.envelope_peak_amplitude",
    points,
    threshold: ENVELOPE_DANGER_GE,
    unit: " gE",
    direction: "rising",
    basis: "calendar"
  });

  if (result) {
    if ("projection" in result) projections.push(result.projection);
    else nonConverging.push(result.nonConverging);
  }

  return { projections, nonConverging };
}

/** Combine every technology's projections into a single prognosis. */
export function buildPrognosis(input: {
  oilSamples: OilSample[];
  analysisRecords: SavedAnalysisResult[];
}): PrognosisResult {
  const oil = buildOilProjections(input.oilSamples);
  const vibration = buildVibrationProjections(input.analysisRecords);

  const projections = [...oil.projections, ...vibration.projections].sort(
    (a, b) => a.hoursRemaining - b.hoursRemaining
  );
  const nonConverging = [...oil.nonConverging, ...vibration.nonConverging];

  const bases = new Set(projections.map((p) => p.basis));

  return {
    projections,
    nonConverging,
    horizon: projections[0] ?? null,
    mixedBasis: bases.size > 1
  };
}

/** Format an hour count for display, e.g. `6,800 h`. */
export function formatHours(hours: number): string {
  return `${Math.round(hours).toLocaleString()} h`;
}

export const TIME_BASIS_LABEL: Record<TimeBasis, string> = {
  operating: "operating hours",
  calendar: "calendar hours"
};
