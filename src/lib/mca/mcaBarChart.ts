/**
 * SLICE-MCA-VISION v2 — MCA grouped-bar report values.
 *
 * Additive branch only: this module understands the "mca_bar_chart" object the
 * MCA-only vision prompt emits. It never touches the shared raw_table mapper
 * used by oil / vibration / thermography / ultrasound.
 *
 * Honesty rules:
 *  - A value exists only when the bar top is readable against a PRINTED axis.
 *  - The stored value carries the axis-read tolerance (half the printed minor
 *    division, or half the major division when no minor ticks are printed).
 *  - Out-of-axis, low-confidence, illegible, or absent values stay null. No
 *    interpolation, no cross-rotor borrowing, no derived values.
 */

import {
  evaluateMcaSeverity,
  type McaImbalanceBracket
} from "../maintenance/prescriptiveDictionary";
import { percentUnbalance } from "./windingBalanceCalculator";

export const MCA_BAR_CHART_PROVENANCE =
  "vision-extracted from uploaded report (bar chart)";

export const MCA_BAR_METRICS = ["z_ohm", "l_mh", "angle_deg", "c_rel"] as const;
export type McaBarMetric = (typeof MCA_BAR_METRICS)[number];

export const MCA_BAR_METRIC_UNIT: Record<McaBarMetric, string> = {
  z_ohm: "Ω",
  l_mh: "mH",
  angle_deg: "°",
  c_rel: "rel"
};

export const MCA_BAR_METRIC_LABEL: Record<McaBarMetric, string> = {
  z_ohm: "Impedance Z",
  l_mh: "Inductance L",
  angle_deg: "Phase angle",
  c_rel: "Relative capacitance C"
};

export type McaBarReadingStatus = "extracted" | "illegible" | "absent";

export interface McaBarChartAxis {
  min: number | null;
  max: number | null;
  major_step: number | null;
  minor_step: number | null;
  unit: string;
  /** Half the printed minor division (else half the major division). */
  tolerance: number | null;
}

export interface McaBarChartReading {
  value: number | null;
  status: McaBarReadingStatus;
  confidence: number | null;
}

export type McaBarPhase = "A" | "B" | "C";

export interface McaBarChartSample {
  phase: McaBarPhase;
  rotor_deg: number;
  z_ohm: McaBarChartReading;
  l_mh: McaBarChartReading;
  angle_deg: McaBarChartReading;
  c_rel: McaBarChartReading;
}

export interface McaBarChartRecord {
  samples: McaBarChartSample[];
  axes: Record<McaBarMetric, McaBarChartAxis>;
  provenance: typeof MCA_BAR_CHART_PROVENANCE;
  tolerance_disclosure: string;
}

/* ------------------------------------------------------------------ */
/* Small numeric helpers                                              */
/* ------------------------------------------------------------------ */

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function finiteNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed || /not visible|n\/a|unknown|null|—|^-$/i.test(trimmed)) return null;
    const m = trimmed.replace(/,/g, "").match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizePhase(raw: unknown): McaBarPhase | null {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase();
  if (/^(A|PHASE\s*A|T1|U|1)$/.test(s)) return "A";
  if (/^(B|PHASE\s*B|T2|V|2)$/.test(s)) return "B";
  if (/^(C|PHASE\s*C|T3|W|3)$/.test(s)) return "C";
  // Pair labels are a different chart shape — never force-fit them.
  if (/-|–|TO/i.test(s)) return null;
  return null;
}

function normalizeRotor(raw: unknown): number | null {
  const n = finiteNum(raw);
  if (n == null) return null;
  const deg = ((n % 360) + 360) % 360;
  return Math.round(deg * 100) / 100;
}

function axisFrom(raw: unknown, unit: string): McaBarChartAxis {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const minor = finiteNum(o.minor_step ?? o.minorStep);
  const major = finiteNum(o.major_step ?? o.majorStep);
  const basis = minor != null && minor > 0 ? minor : major != null && major > 0 ? major : null;
  return {
    min: finiteNum(o.min ?? o.minimum),
    max: finiteNum(o.max ?? o.maximum),
    major_step: major,
    minor_step: minor,
    unit,
    tolerance: basis != null ? round6(basis / 2) : null
  };
}

function formatTolerance(axis: McaBarChartAxis, metric: McaBarMetric): string {
  if (axis.tolerance == null) return `${MCA_BAR_METRIC_UNIT[metric]} (tolerance not printed)`;
  return `±${axis.tolerance} ${MCA_BAR_METRIC_UNIT[metric]}`;
}

export function buildToleranceDisclosure(
  axes: Record<McaBarMetric, McaBarChartAxis>
): string {
  const parts = MCA_BAR_METRICS.map(
    (m) => `${MCA_BAR_METRIC_LABEL[m]} ${formatTolerance(axes[m], m)}`
  );
  return (
    "Axis-read tolerance: half the printed minor division (half the major division when no minor tick is printed) — " +
    parts.join("; ") +
    ". Values are read against the printed gridlines, never interpolated between bars."
  );
}

/* ------------------------------------------------------------------ */
/* Vision JSON -> stored record                                       */
/* ------------------------------------------------------------------ */

function readingFrom(
  raw: unknown,
  axis: McaBarChartAxis,
  declaredStatus: unknown,
  entryConfidence: number | null = null
): McaBarChartReading {
  const statusWord = String(declaredStatus ?? "").toLowerCase();
  if (statusWord === "illegible" || statusWord === "absent") {
    return { value: null, status: statusWord, confidence: null };
  }

  let value: number | null = null;
  let confidence: number | null = entryConfidence;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    value = finiteNum(o.value);
    confidence = finiteNum(o.confidence) ?? entryConfidence;
    const nested = String(o.status ?? "").toLowerCase();
    if (nested === "illegible" || nested === "absent") {
      return { value: null, status: nested, confidence };
    }
  } else {
    value = finiteNum(raw);
  }

  if (value == null) return { value: null, status: "absent", confidence };

  // Axis-read only: no axis means no defensible bar-top value.
  if (axis.tolerance == null || axis.min == null || axis.max == null) {
    return { value: null, status: "illegible", confidence };
  }
  const lower = axis.min - axis.tolerance;
  const upper = axis.max + axis.tolerance;
  if (value < lower || value > upper) {
    return { value: null, status: "illegible", confidence };
  }
  if (confidence != null && confidence < 0.8) {
    return { value: null, status: "illegible", confidence };
  }
  return { value: round6(value), status: "extracted", confidence };
}

function emptyReading(status: McaBarReadingStatus = "absent"): McaBarChartReading {
  return { value: null, status, confidence: null };
}

/**
 * Parse the model's `mca_bar_chart` object. Returns null when there is nothing
 * readable — callers must treat that as "not extracted", never as zeros.
 */
export function parseMcaBarChart(raw: unknown): McaBarChartRecord | null {
  const o = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
  if (!o) return null;

  const rawAxes =
    (o.axes && typeof o.axes === "object" ? (o.axes as Record<string, unknown>) : null) ??
    (o.axis && typeof o.axis === "object" ? (o.axis as Record<string, unknown>) : null) ??
    {};

  const axes = {
    z_ohm: axisFrom(rawAxes.z_ohm, MCA_BAR_METRIC_UNIT.z_ohm),
    l_mh: axisFrom(rawAxes.l_mh, MCA_BAR_METRIC_UNIT.l_mh),
    angle_deg: axisFrom(rawAxes.angle_deg, MCA_BAR_METRIC_UNIT.angle_deg),
    c_rel: axisFrom(rawAxes.c_rel, MCA_BAR_METRIC_UNIT.c_rel)
  } as Record<McaBarMetric, McaBarChartAxis>;

  const rawSeries = Array.isArray(o.series)
    ? o.series
    : Array.isArray(o.samples)
      ? o.samples
      : [];
  if (rawSeries.length === 0) return null;

  const byKey = new Map<string, McaBarChartSample>();
  for (const entry of rawSeries) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const phase = normalizePhase(e.phase);
    const rotor = normalizeRotor(e.rotor_deg ?? e.rotorDeg ?? e.rotor);
    if (!phase || rotor == null) continue;
    const key = `${phase}@${rotor}`;
    if (byKey.has(key)) continue; // first transcription wins = document order
    const entryConfidence = finiteNum(e.confidence);
    byKey.set(key, {
      phase,
      rotor_deg: rotor,
      z_ohm: readingFrom(e.z_ohm ?? e.zOhm, axes.z_ohm, e.status, entryConfidence),
      l_mh: readingFrom(e.l_mh ?? e.lMh, axes.l_mh, e.status, entryConfidence),
      angle_deg: readingFrom(e.angle_deg ?? e.angleDeg, axes.angle_deg, e.status, entryConfidence),
      c_rel: readingFrom(e.c_rel ?? e.cRel ?? e.capacitance_rel, axes.c_rel, e.status, entryConfidence)
    });
  }

  const samples = [...byKey.values()].sort(
    (a, b) => a.rotor_deg - b.rotor_deg || a.phase.localeCompare(b.phase)
  );
  if (samples.length === 0) return null;
  if (
    !samples.some((s) =>
      MCA_BAR_METRICS.some((m) => s[m].status === "extracted")
    )
  ) {
    return null;
  }

  return {
    samples,
    axes,
    provenance: MCA_BAR_CHART_PROVENANCE,
    tolerance_disclosure: buildToleranceDisclosure(axes)
  };
}

/** Validate a record that was already stored (re-hydration, never re-reads). */
export function sanitizeMcaBarChartRecord(raw: unknown): McaBarChartRecord | null {
  return parseMcaBarChart(raw);
}

/* ------------------------------------------------------------------ */
/* Stored record -> columns / legacy triplets                         */
/* ------------------------------------------------------------------ */

export function barChartReading(
  record: McaBarChartRecord | null | undefined,
  metric: McaBarMetric,
  rotorDeg: number,
  phase: McaBarPhase
): McaBarChartReading {
  const sample = record?.samples.find(
    (s) => s.rotor_deg === rotorDeg && s.phase === phase
  );
  return sample ? sample[metric] : emptyReading();
}

export function barChartTriplet(
  record: McaBarChartRecord | null | undefined,
  metric: McaBarMetric,
  rotorDeg: number
): [number | null, number | null, number | null] {
  return [
    barChartReading(record, metric, rotorDeg, "A").value,
    barChartReading(record, metric, rotorDeg, "B").value,
    barChartReading(record, metric, rotorDeg, "C").value
  ];
}

function completeTriplet(
  values: [number | null, number | null, number | null]
): [number, number, number] | null {
  return values.every((v): v is number => v != null) ? values : null;
}

/**
 * Map the rotor-0° grouped-bar columns onto the existing winding triplets.
 * This is the only bridge to the legacy manual-entry/save path; the full
 * two-position record is preserved separately. Incomplete rows stay absent.
 */
export function barChartLegacyTriplets(
  record: McaBarChartRecord | null | undefined
): {
  phaseZ?: [number, number, number];
  phaseL?: [number, number, number];
  phaseFi?: [number, number, number];
} {
  const z = completeTriplet(barChartTriplet(record, "z_ohm", 0));
  const l = completeTriplet(barChartTriplet(record, "l_mh", 0));
  const fi = completeTriplet(barChartTriplet(record, "angle_deg", 0));
  return {
    ...(z ? { phaseZ: z } : {}),
    ...(l ? { phaseL: l } : {}),
    ...(fi ? { phaseFi: fi } : {})
  };
}

/* ------------------------------------------------------------------ */
/* Six fault-zone surfaces                                           */
/* ------------------------------------------------------------------ */

export interface McaFaultZoneCell {
  phase: McaBarPhase;
  values: Partial<Record<McaBarMetric, number | null>>;
}

export interface McaFaultZone {
  id: string;
  label: string;
  basis: string;
  rotor_deg: number | null;
  cells: McaFaultZoneCell[];
  unbalance_pct: number | null;
  severity: McaImbalanceBracket | null;
}

function valuesAt(
  record: McaBarChartRecord,
  rotorDeg: number,
  phases: McaBarPhase[],
  metrics: McaBarMetric[]
): McaFaultZoneCell[] {
  return phases.map((phase) => {
    const values: Partial<Record<McaBarMetric, number | null>> = {};
    for (const metric of metrics) {
      values[metric] = barChartReading(record, metric, rotorDeg, phase).value;
    }
    return { phase, values };
  });
}

function zoneWithUnbalance(
  id: string,
  label: string,
  metric: McaBarMetric,
  record: McaBarChartRecord
): McaFaultZone {
  const cells = valuesAt(record, 0, ["A", "B", "C"], [metric]);
  const triplet = completeTriplet(barChartTriplet(record, metric, 0));
  const unbalance = triplet ? percentUnbalance(triplet) : null;
  return {
    id,
    label,
    basis: `${MCA_BAR_METRIC_LABEL[metric]} at rotor 0° — % unbalance = (max |Xi − mean| / mean) × 100`,
    rotor_deg: 0,
    cells,
    unbalance_pct: unbalance,
    // Only Z and L have the in-repo MCA asymmetry rubric. Angle and relative C
    // are descriptive: no stored severity standard exists, so no class.
    severity:
      unbalance != null && (metric === "z_ohm" || metric === "l_mh")
        ? evaluateMcaSeverity(unbalance)
        : null
  };
}

/**
 * Six stored-value surfaces, no invented thresholds:
 *  1 Z balance @0°, 2 L balance @0°, 3 phase-angle signature @0°,
 *  4 relative-C signature @0°, 5 rotor 0° column, 6 rotor 90° column.
 */
export function deriveMcaSixFaultZones(
  record: McaBarChartRecord | null | undefined
): McaFaultZone[] {
  if (!record) return [];
  return [
    zoneWithUnbalance("zone-z-0", "Fault Zone 1 — Impedance (Z) balance", "z_ohm", record),
    zoneWithUnbalance("zone-l-0", "Fault Zone 2 — Inductance (L) balance", "l_mh", record),
    zoneWithUnbalance("zone-angle-0", "Fault Zone 3 — Phase-angle signature", "angle_deg", record),
    zoneWithUnbalance("zone-c-0", "Fault Zone 4 — Relative-capacitance signature", "c_rel", record),
    {
      id: "zone-rotor-0",
      label: "Fault Zone 5 — Rotor 0° column",
      basis: "All four stored metrics at rotor 0° — per-phase values only",
      rotor_deg: 0,
      cells: valuesAt(record, 0, ["A", "B", "C"], [...MCA_BAR_METRICS]),
      unbalance_pct: null,
      severity: null
    },
    {
      id: "zone-rotor-90",
      label: "Fault Zone 6 — Rotor 90° column",
      basis: "All four stored metrics at rotor 90° — per-phase values only",
      rotor_deg: 90,
      cells: valuesAt(record, 90, ["A", "B", "C"], [...MCA_BAR_METRICS]),
      unbalance_pct: null,
      severity: null
    }
  ];
}
