/**
 * Closed-WO post-repair verification evaluator — the single source of the
 * HEALED / NOT HEALED / INCONCLUSIVE verdict rule.
 *
 * Extracted verbatim from WorkOrderVerificationSection (src/components/planning)
 * and adopted by BacklogVelocityTab (src/components/scorecard) so the 14-day
 * verification window, unit ladder gate, and below-detection check exist once.
 *
 * All figures entering here are evidence reads: metric + unit from the run,
 * threshold + unit from the severity ladder. Dollar figures are not part of
 * the verdict; avoided-exposure estimates stay with their render sites (G1/G2).
 */

import type {
  ClosedWorkOrder,
  SeededVerificationRun
} from "./closedWorkOrderSeed";

/** Verification window after close: 14 days (site practice, unit: days). */
export const VERIFICATION_WINDOW_DAYS = 14;
export const VERIFICATION_WINDOW_MS = VERIFICATION_WINDOW_DAYS * 86400000;

export type Verdict = "HEALED" | "NOT HEALED" | "INCONCLUSIVE";

export interface Peak {
  frequencyHz: number;
  amplitude: number;
}

export interface FaultItem {
  title: string;
  frequencyHz: number | null;
  severity: string | null;
}

export interface RunRecord {
  id: string;
  tsMs: number;
  seeded: boolean;
  analysisType: string | null;
  peaks: Peak[];
  faults: FaultItem[];
  primaryFault: string | null;
  severity: string | null;
  healthScore: number | null;
  waveformPp: number | null;
  phaseTemps: number[];
}

export interface MetricReading {
  value: number | null;
  label: string;
  unit: string;
  source: string;
}

export interface FaultState {
  reported: boolean;
  detail: string;
}

export interface VerdictRead {
  verdict: Verdict;
  reason: string;
}

export const UNIT_BY_ANALYSIS: Record<string, string> = {
  vibration: "mm/s",
  ultrasound: "dB",
  infrared: "°C",
  thermography: "°C",
  mca: "A",
  oil_analysis: "ppm"
};

export function toNumberOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeSeededRun(r: SeededVerificationRun): RunRecord {
  const tsMs = new Date(r.timestamp).getTime();
  return {
    id: r.id,
    tsMs: Number.isFinite(tsMs) ? tsMs : NaN,
    seeded: true,
    analysisType: r.analysisType,
    peaks: r.peaks.map((p) => ({ frequencyHz: p.frequencyHz, amplitude: p.amplitude })),
    faults: r.fault_list.map((f) => ({
      title: f.title,
      frequencyHz: toNumberOrNull(f.frequencyHz),
      severity: typeof f.severity === "string" ? f.severity : null
    })),
    primaryFault: r.primary_fault,
    severity: r.severity,
    healthScore: r.health_score,
    waveformPp: null,
    phaseTemps: []
  };
}

export function trackedHzTolerance(trackedHz: number): number {
  return Math.max(2, Math.abs(trackedHz) * 0.02);
}

export function readPrimaryMetric(
  wo: ClosedWorkOrder,
  run: RunRecord | null
): MetricReading {
  if (!run) {
    return { value: null, label: "primary metric", unit: "", source: "no run on record" };
  }
  const typeKey = (run.analysisType ?? "").trim().toLowerCase();
  if (wo.trackedHz !== null) {
    const tol = trackedHzTolerance(wo.trackedHz);
    let hit: Peak | null = null;
    for (const p of run.peaks) {
      if (Math.abs(p.frequencyHz - wo.trackedHz) <= tol) {
        if (hit === null || p.amplitude > hit.amplitude) hit = p;
      }
    }
    if (hit !== null) {
      const mapped = UNIT_BY_ANALYSIS[typeKey];
      if (mapped) {
        return {
          value: hit.amplitude,
          label: `Amplitude @ ${wo.trackedHz} Hz`,
          unit: mapped,
          source: `peak within tolerance of tracked ${wo.trackedHz} Hz (max(2 Hz, 2% of tracked))`
        };
      }
      return {
        value: null,
        label: `Amplitude @ ${wo.trackedHz} Hz`,
        unit: "",
        source: "peak found at tracked Hz but unit not on record for this analysis type"
      };
    }
  }
  if (run.waveformPp !== null) {
    return {
      value: run.waveformPp,
      label: "Waveform peak-to-peak",
      unit: "mm/s",
      source: "structured waveform field on the run"
    };
  }
  if (run.phaseTemps.length > 0) {
    return {
      value: Math.max(...run.phaseTemps),
      label: "Phase temperature (max)",
      unit: "°C",
      source: "structured thermography fields on the run"
    };
  }
  return {
    value: null,
    label: "primary metric",
    unit: "",
    source: "no structured primary metric on record - summary prose not parsed"
  };
}

export function faultStateAt(
  run: RunRecord | null,
  wo: ClosedWorkOrder
): FaultState {
  if (!run) return { reported: false, detail: "no run on record" };
  const target = wo.targetFault.trim().toLowerCase();
  const tol = wo.trackedHz !== null ? trackedHzTolerance(wo.trackedHz) : null;
  for (const f of run.faults) {
    const title = f.title.trim().toLowerCase();
    const titleHit =
      target.length > 0 &&
      title.length > 0 &&
      (title === target || title.includes(target) || target.includes(title));
    const hzHit =
      tol !== null && wo.trackedHz !== null && f.frequencyHz !== null &&
      Math.abs(f.frequencyHz - wo.trackedHz) <= tol;
    if (titleHit || hzHit) {
      const bits: string[] = [];
      if (f.title) bits.push(f.title);
      if (f.frequencyHz !== null) bits.push(`${f.frequencyHz} Hz`);
      if (f.severity) bits.push(f.severity);
      return { reported: true, detail: bits.join(" - ") || "target fault reported" };
    }
  }
  const primary = (run.primaryFault ?? "").trim().toLowerCase();
  if (target.length > 0 && primary.length > 0 && (primary === target || primary.includes(target))) {
    return { reported: true, detail: run.primaryFault ?? "target fault reported" };
  }
  return { reported: false, detail: "target fault not reported" };
}

export function evaluateVerdict(args: {
  closeMs: number;
  post: RunRecord | null;
  postMetric: MetricReading;
  threshold: number | null;
  ladderUnit: string;
  postFault: FaultState;
}): VerdictRead {
  if (!Number.isFinite(args.closeMs)) {
    return {
      verdict: "INCONCLUSIVE",
      reason: "close date not on record - verification window cannot be computed"
    };
  }
  if (!args.post) {
    return {
      verdict: "INCONCLUSIVE",
      reason: `no post-repair run within ${VERIFICATION_WINDOW_DAYS} days of close`
    };
  }
  if (args.postFault.reported) {
    return {
      verdict: "NOT HEALED",
      reason: `target fault still reported on the post-repair run (${args.postFault.detail}) - re-inspection advised`
    };
  }
  if (args.postMetric.value === null) {
    return {
      verdict: "INCONCLUSIVE",
      reason: `primary metric not on record on the post-repair run - ${args.postMetric.source}`
    };
  }
  const metricUnit = args.postMetric.unit.trim();
  const ladderUnit = args.ladderUnit.trim();
  if (metricUnit.length > 0 && ladderUnit.length > 0 && metricUnit !== ladderUnit) {
    return {
      verdict: "INCONCLUSIVE",
      reason: `metric unit (${metricUnit}) does not match severity ladder unit (${ladderUnit}) - below-detection check cannot be evaluated`
    };
  }
  if (args.threshold === null) {
    return {
      verdict: "INCONCLUSIVE",
      reason: "no detection threshold on record for this fault - below-detection check cannot be evaluated"
    };
  }
  if (args.postMetric.value >= args.threshold) {
    return {
      verdict: "NOT HEALED",
      reason: `post-repair metric ${args.postMetric.value} ${args.postMetric.unit} is at or above the site alarm ${args.threshold} ${ladderUnit} - re-inspection advised`
    };
  }
  return {
    verdict: "HEALED",
    reason: `post-repair run within ${VERIFICATION_WINDOW_DAYS} days of close: target fault no longer reported and metric ${args.postMetric.value} ${args.postMetric.unit} below the site alarm ${args.threshold} ${ladderUnit} - repair verified by the post-repair evidence, not by work-order closure`
  };
}

export function selectRuns(
  closeMs: number,
  runs: RunRecord[]
): { pre: RunRecord | null; post: RunRecord | null } {
  if (!Number.isFinite(closeMs)) return { pre: null, post: null };
  let pre: RunRecord | null = null;
  let post: RunRecord | null = null;
  for (const r of runs) {
    if (!Number.isFinite(r.tsMs)) continue;
    if (r.tsMs < closeMs) {
      if (pre === null || r.tsMs > pre.tsMs) pre = r;
    } else {
      const delta = r.tsMs - closeMs;
      if (delta <= VERIFICATION_WINDOW_MS && (post === null || r.tsMs < post.tsMs)) post = r;
    }
  }
  return { pre, post };
}
