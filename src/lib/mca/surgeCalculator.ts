/**
 * MCA Surge Waveform Health — Error Area Ratio (EAR) via trapezoidal integration.
 */

export interface SurgeDataPoint {
  time: number;
  v12: number;
  v23: number;
  v31: number;
}

export type SurgeFaultSeverity = "NORMAL" | "WARNING" | "CRITICAL";

/**
 * TRUE-SOURCE label for the in-repo EAR severity brackets. These 2 % / 5 %
 * cut-offs are vendor heuristics, NOT an IEEE 522 or NEMA pass/fail limit.
 * IEEE 522 governs the surge test METHOD only; it does not grade EAR.
 */
export const SURGE_EAR_SOURCE =
  "Vendor heuristic (in-repo EAR brackets: <2% healthy, 2–5% monitor, >5% investigate) — not an IEEE 522 or NEMA pass/fail limit. IEEE 522 governs the surge test method only; EAR grading is vendor guidance.";

/** In-repo EAR severity brackets (vendor heuristic — see SURGE_EAR_SOURCE). */
export const SURGE_EAR_BRACKETS = [
  { maxEar: 2.0, severity: "NORMAL" as const },
  { maxEar: 5.0, severity: "WARNING" as const },
  {
    maxEar: Number.POSITIVE_INFINITY,
    severity: "CRITICAL" as const
  }
] as const;

export type SurgeHealthResult = {
  areaV12: number;
  areaV23: number;
  areaV31: number;
  ear12_23: number;
  ear23_31: number;
  ear31_12: number;
  maxEar: number;
  fault: string;
  severity: SurgeFaultSeverity;
  recommendation: string;
  /** Provenance for the EAR severity brackets (vendor heuristic, not IEEE/NEMA). */
  severitySource: string;
  hasData: boolean;
};

/**
 * IEEE 522-2023 turn-insulation surge withstand for form-wound coils.
 * Per-unit coil voltage V1 = (√2/√3)·VL ≈ 0.8165·VL; the momentary withstand
 * V2 = 3.5·V1 ≈ 2.86·VL for a new fully cured coil. In-service (used) machines
 * are tested at 75% of that (≈ 2.15·VL). VL is rated line-to-line RMS volts.
 *
 * NOTE: ANSI/EASA AR100 uses a separate formula (V = 2E + 1000). This guard
 * applies the IEEE 522 form-wound ceiling only and says so in its provenance.
 */
export const IEEE522_FORM_COIL_WITHSTAND_FACTOR = (3.5 * Math.SQRT2) / Math.sqrt(3);
export const IEEE522_USED_MACHINE_FACTOR = 0.75;

export type SurgeDampingPhase = "v12" | "v23" | "v31";

export type SurgeDampingPhaseResult = {
  phase: SurgeDampingPhase;
  /** Log decrement δ per cycle, from stored peak amplitudes. */
  logDecrement: number;
  cycles: number;
  peakCount: number;
};

export type SurgeDampingResult = {
  /** Every phase present in the stored multi-point decay trace. */
  perPhase: SurgeDampingPhaseResult[];
  meanLogDecrement: number;
  /** Discloses the derivation basis so no synthesized trace can be implied. */
  provenance: string;
};

function finiteOr(value: unknown, fallback = NaN): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Validate a surge sample (finite time + voltages). */
export function sanitizeSurgePoint(
  raw: Partial<SurgeDataPoint> | null | undefined
): SurgeDataPoint | null {
  if (!raw) return null;
  const time = finiteOr(raw.time);
  const v12 = finiteOr(raw.v12);
  const v23 = finiteOr(raw.v23);
  const v31 = finiteOr(raw.v31);
  if (![time, v12, v23, v31].every((n) => Number.isFinite(n))) return null;
  return { time, v12, v23, v31 };
}

export function sanitizeSurgeSeries(
  data: SurgeDataPoint[] | null | undefined
): SurgeDataPoint[] {
  if (!Array.isArray(data) || data.length === 0) return [];
  return data
    .map((p) => sanitizeSurgePoint(p))
    .filter((p): p is SurgeDataPoint => p != null)
    .sort((a, b) => a.time - b.time);
}

/**
 * Trapezoidal numerical integration of y vs x (time).
 * Uses absolute area contribution so bipolar waveforms don't cancel.
 */
export function trapezoidalArea(
  points: { x: number; y: number }[]
): number {
  if (points.length < 2) return 0;
  let area = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    if (!(dx > 0) || !Number.isFinite(dx)) continue;
    const y0 = points[i - 1].y;
    const y1 = points[i].y;
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
    area += Math.abs(((y0 + y1) / 2) * dx);
  }
  return area;
}

/** EAR = |Area1 − Area2| / Area1 × 100 (safe when Area1 ≈ 0). */
export function errorAreaRatio(area1: number, area2: number): number {
  if (!(area1 > 0) || !Number.isFinite(area1) || !Number.isFinite(area2)) {
    return 0;
  }
  return round2(Math.abs((area1 - area2) / area1) * 100);
}

function isolateSurgeFault(maxEar: number): {
  fault: string;
  severity: SurgeFaultSeverity;
  recommendation: string;
} {
  if (maxEar > 5.0) {
    return {
      fault: "Severe Turn-to-Turn Insulation Failure",
      severity: "CRITICAL",
      recommendation:
        "Do not energize. Immediate winding rewind or replacement required."
    };
  }
  if (maxEar >= 2.0) {
    return {
      fault: "Early Turn Insulation Degradation / Asymmetry",
      severity: "WARNING",
      recommendation:
        "Monitor closely; check for thermal stress or transient voltage spikes."
    };
  }
  return {
    fault: "Healthy Surge Response",
    severity: "NORMAL",
    recommendation: "Insulation integrity verified."
  };
}

/**
 * Full surge waveform EAR analysis. Returns null when series is empty.
 */
export function calculateSurgeHealth(
  data: SurgeDataPoint[]
): SurgeHealthResult | null {
  const cleaned = sanitizeSurgeSeries(data);
  if (cleaned.length < 2) return null;

  const areaV12 = trapezoidalArea(
    cleaned.map((p) => ({ x: p.time, y: p.v12 }))
  );
  const areaV23 = trapezoidalArea(
    cleaned.map((p) => ({ x: p.time, y: p.v23 }))
  );
  const areaV31 = trapezoidalArea(
    cleaned.map((p) => ({ x: p.time, y: p.v31 }))
  );

  const ear12_23 = errorAreaRatio(areaV12, areaV23);
  const ear23_31 = errorAreaRatio(areaV23, areaV31);
  const ear31_12 = errorAreaRatio(areaV31, areaV12);
  const maxEar = round2(Math.max(ear12_23, ear23_31, ear31_12));

  const isolated = isolateSurgeFault(maxEar);

  return {
    areaV12: round2(areaV12),
    areaV23: round2(areaV23),
    areaV31: round2(areaV31),
    ear12_23,
    ear23_31,
    ear31_12,
    maxEar,
    fault: isolated.fault,
    severity: isolated.severity,
    recommendation: isolated.recommendation,
    severitySource: SURGE_EAR_SOURCE,
    hasData: true
  };
}

/**
 * Derive fault status from a technician-entered manual EAR %.
 */
export function surgeHealthFromManualEar(
  manualEarPercent: number | null | undefined
): SurgeHealthResult | null {
  if (manualEarPercent == null || !Number.isFinite(manualEarPercent)) {
    return null;
  }
  const maxEar = round2(Math.abs(manualEarPercent));
  const isolated = isolateSurgeFault(maxEar);
  return {
    areaV12: 0,
    areaV23: 0,
    areaV31: 0,
    ear12_23: maxEar,
    ear23_31: maxEar,
    ear31_12: maxEar,
    maxEar,
    fault: isolated.fault,
    severity: isolated.severity,
    recommendation: isolated.recommendation,
    severitySource: SURGE_EAR_SOURCE,
    hasData: true
  };
}

export type SurgeVoltageGuard = {
  applicable: boolean;
  ratedVoltageV: number | null;
  maxSurgeTestVoltageV: number | null;
  overVoltage: boolean;
  message: string;
  provenance: string;
};

/**
 * IEEE 522-2023 form-wound maintenance surge test-voltage ceiling for a given
 * stored nameplate line-to-line voltage. Null when no positive rating exists —
 * the ceiling is never guessed.
 */
export function ieee522SurgeTestVoltageCeilingV(
  ratedVoltageV?: number | null
): number | null {
  if (
    ratedVoltageV == null ||
    !Number.isFinite(Number(ratedVoltageV)) ||
    Number(ratedVoltageV) <= 0
  ) {
    return null;
  }
  const vl = Number(ratedVoltageV);
  return Math.round(
    IEEE522_FORM_COIL_WITHSTAND_FACTOR * IEEE522_USED_MACHINE_FACTOR * vl
  );
}

/**
 * Safety guard for the applied surge test voltage. Applicable only when a
 * stored nameplate voltage exists — otherwise the ceiling cannot be derived
 * and the guard is omitted entirely (never guessed).
 */
export function evaluateSurgeTestVoltage(params: {
  testVoltageV?: number | null;
  ratedVoltageV?: number | null;
}): SurgeVoltageGuard {
  const rated =
    params.ratedVoltageV != null &&
    Number.isFinite(Number(params.ratedVoltageV)) &&
    Number(params.ratedVoltageV) > 0
      ? Number(params.ratedVoltageV)
      : null;
  const test =
    params.testVoltageV != null &&
    Number.isFinite(Number(params.testVoltageV)) &&
    Number(params.testVoltageV) > 0
      ? Number(params.testVoltageV)
      : null;

  if (rated == null || test == null) {
    return {
      applicable: false,
      ratedVoltageV: rated,
      maxSurgeTestVoltageV: null,
      overVoltage: false,
      message: "",
      provenance: ""
    };
  }

  const max = ieee522SurgeTestVoltageCeilingV(rated);
  if (max == null) {
    return {
      applicable: false,
      ratedVoltageV: rated,
      maxSurgeTestVoltageV: null,
      overVoltage: false,
      message: "",
      provenance: ""
    };
  }

  const over = test > max;
  const kv = (rated / 1000).toFixed(2);
  return {
    applicable: true,
    ratedVoltageV: rated,
    maxSurgeTestVoltageV: max,
    overVoltage: over,
    message: over
      ? `Surge test voltage ${test} V exceeds the IEEE 522 form-wound maintenance ceiling ${max} V for a ${kv} kV machine. Reduce the test voltage before applying the surge.`
      : `Surge test voltage ${test} V is within the IEEE 522 form-wound maintenance ceiling ${max} V for a ${kv} kV machine.`,
    provenance:
      "IEEE 522-2023 form-wound used-machine maintenance ceiling = 2.86 × VL × 75% ≈ 2.15 × VL (VL = stored nameplate line-to-line RMS). ANSI/EASA AR100 (V = 2E + 1000) is a separate formula, not applied here."
  };
}

type SurgeSample = { x: number; y: number };

/** Local maxima above zero (boundary samples included when they are peaks). */
function positivePeaks(points: SurgeSample[]): SurgeSample[] {
  const peaks: SurgeSample[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const cur = points[i];
    if (!(cur.y > 0) || !Number.isFinite(cur.y)) continue;
    const prev = points[i - 1];
    const next = points[i + 1];
    const abovePrev = !prev || cur.y >= prev.y;
    const aboveNext = !next || cur.y > next.y;
    if (abovePrev && aboveNext) peaks.push(cur);
  }
  return peaks;
}

/** Minimum stored samples before a decay envelope is considered multi-point. */
export const SURGE_DAMPING_MIN_SAMPLES = 8;
/** Minimum strictly-decaying peaks per phase. */
export const SURGE_DAMPING_MIN_PEAKS = 3;

/**
 * Log-decrement damping from STORED multi-point decay samples, per phase.
 *
 * Gated hard: returns null unless every phase (V12/V23/V31) has ≥
 * SURGE_DAMPING_MIN_SAMPLES samples and ≥ SURGE_DAMPING_MIN_PEAKS strictly
 * decreasing positive peaks. It never fits or synthesizes a curve — if the
 * decay is not present in the stored samples, alpha is omitted entirely.
 */
export function calculateSurgeDamping(
  data: SurgeDataPoint[] | null | undefined
): SurgeDampingResult | null {
  const cleaned = sanitizeSurgeSeries(data);
  if (cleaned.length < SURGE_DAMPING_MIN_SAMPLES) return null;

  const phases: { phase: SurgeDampingPhase; field: keyof SurgeDataPoint }[] = [
    { phase: "v12", field: "v12" },
    { phase: "v23", field: "v23" },
    { phase: "v31", field: "v31" }
  ];

  const perPhase: SurgeDampingPhaseResult[] = [];
  for (const { phase, field } of phases) {
    const peaks = positivePeaks(
      cleaned.map((p) => ({ x: p.time, y: Number(p[field]) }))
    );
    if (peaks.length < SURGE_DAMPING_MIN_PEAKS) return null;

    let strictlyDecaying = true;
    for (let i = 1; i < peaks.length; i += 1) {
      if (!(peaks[i].y < peaks[i - 1].y)) {
        strictlyDecaying = false;
        break;
      }
    }
    if (!strictlyDecaying) return null;

    const first = peaks[0].y;
    const last = peaks[peaks.length - 1].y;
    const cycles = peaks.length - 1;
    const logDecrement = Math.log(first / last) / cycles;
    if (!Number.isFinite(logDecrement) || logDecrement <= 0) return null;

    perPhase.push({
      phase,
      logDecrement: round4(logDecrement),
      cycles,
      peakCount: peaks.length
    });
  }

  if (perPhase.length !== phases.length) return null;
  const meanLogDecrement = round4(
    perPhase.reduce((sum, p) => sum + p.logDecrement, 0) / perPhase.length
  );

  return {
    perPhase,
    meanLogDecrement,
    provenance:
      "Log decrement derived from stored multi-point decay peak amplitudes (δ = ln(A₀/An)/cycles). Omitted entirely when the stored samples do not contain a decaying envelope; never curve-fit from a synthesized trace."
  };
}

/**
 * Parse clipboard / CSV surge tables (Time, V12, V23, V31).
 * Skips headers and non-numeric rows safely.
 */
export function parseSurgeClipboardText(text: string): SurgeDataPoint[] {
  if (!text || typeof text !== "string") return [];
  const lines = text.split(/\r?\n/);
  const points: SurgeDataPoint[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (
      /time|v12|v23|v31|voltage|header|phase/i.test(line) &&
      !/\d/.test(line.replace(/[^\d]/g, ""))
    ) {
      continue;
    }

    const cells = line
      .split(/[\t,;|]+/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length < 4) continue;

    const nums = cells
      .map((c) => Number(String(c).replace(/[^0-9.+\-eE]/g, "")))
      .filter((n) => Number.isFinite(n));
    if (nums.length < 4) continue;

    const point = sanitizeSurgePoint({
      time: nums[0],
      v12: nums[1],
      v23: nums[2],
      v31: nums[3]
    });
    if (point) points.push(point);
  }

  return sanitizeSurgeSeries(points);
}
