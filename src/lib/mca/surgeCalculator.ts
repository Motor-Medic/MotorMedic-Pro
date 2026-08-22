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
  hasData: boolean;
};

function finiteOr(value: unknown, fallback = NaN): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
    hasData: true
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
