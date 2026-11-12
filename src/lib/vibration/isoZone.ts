/**
 * ISO 20816 / ISO 10816 velocity severity zones.
 *
 * Single source of truth for zone boundaries. Values are always canonical
 * **mm/s RMS**; callers must convert alternate display units before calling
 * `classifyZone`.
 */

export type IsoZone = "A" | "B" | "C" | "D";
export type IsoMachineClass = "I" | "II" | "III" | "IV";

export interface IsoZoneBand {
  zone: IsoZone;
  label: string;
  from: number;
  /** Upper bound of the band in mm/s RMS (inclusive-exclusive semantics). */
  to: number;
}

export const ISO_ZONE_LABELS: Record<IsoZone, string> = {
  A: "Good",
  B: "Acceptable",
  C: "Unsatisfactory",
  D: "Unacceptable"
};

/**
 * Zone edges in mm/s RMS: [A/B, B/C, C/D].
 * Class II is the app-wide default and preserves the existing 2.3 / 4.5 / 7.1
 * machine-group bands used by the action card and severity assessment.
 */
const ISO_ZONE_EDGES_MM_S: Record<IsoMachineClass, readonly [number, number, number]> = {
  I: [0.71, 1.8, 4.5],
  II: [2.3, 4.5, 7.1],
  III: [4.5, 7.1, 11.2],
  IV: [7.1, 11.2, 18]
};

export const DEFAULT_ISO_MACHINE_CLASS: IsoMachineClass = "II";

export function parseMachineClass(
  input: string | null | undefined
): IsoMachineClass {
  const text = String(input ?? "").toUpperCase();
  if (/\bIV\b|CLASS\s*4|GROUP\s*4/.test(text)) return "IV";
  if (/\bIII\b|CLASS\s*3|GROUP\s*3/.test(text)) return "III";
  if (/\bII\b|CLASS\s*2|GROUP\s*2/.test(text)) return "II";
  if (/\bI\b|CLASS\s*1|GROUP\s*1/.test(text)) return "I";
  return DEFAULT_ISO_MACHINE_CLASS;
}

export function isoZoneEdges(
  machineClass: string | null | undefined
): readonly [number, number, number] {
  return ISO_ZONE_EDGES_MM_S[parseMachineClass(machineClass)];
}

/**
 * Classify an overall velocity (mm/s RMS) into an ISO zone.
 * Returns null when no finite, non-negative value is available.
 */
export function classifyZone(
  valueMmS: number | null | undefined,
  machineClass?: string | null
): IsoZone | null {
  if (valueMmS == null || !Number.isFinite(valueMmS) || valueMmS < 0) {
    return null;
  }
  const [aMax, bMax, cMax] = isoZoneEdges(machineClass);
  if (valueMmS < aMax) return "A";
  if (valueMmS < bMax) return "B";
  if (valueMmS < cMax) return "C";
  return "D";
}

/**
 * Health score derived from the canonical overall velocity zone. Used by the
 * Trend Analyzer KPI so health can never be a bare stored confidence number
 * beside a blank velocity reading.
 */
const ZONE_HEALTH_SCORE: Record<IsoZone, number> = {
  A: 92,
  B: 78,
  C: 58,
  D: 22
};

export function healthScoreFromVelocityMmS(
  valueMmS: number | null | undefined,
  machineClass?: string | null
): number | null {
  if (valueMmS == null || !Number.isFinite(valueMmS) || valueMmS <= 0) {
    return null;
  }
  const zone = classifyZone(valueMmS, machineClass);
  return zone ? ZONE_HEALTH_SCORE[zone] : null;
}

/** Health-score fallback used only when no stored velocity exists. */
export function classifyZoneFromHealth(
  healthScore: number | null | undefined
): IsoZone | null {
  if (healthScore == null || !Number.isFinite(healthScore)) return null;
  if (healthScore >= 85) return "A";
  if (healthScore >= 70) return "B";
  if (healthScore >= 50) return "C";
  return "D";
}

export function isoZoneLabel(zone: IsoZone | null): string {
  return zone ? ISO_ZONE_LABELS[zone] : "Not classified";
}

/** Finite display scale: the D band spans C/D → 1.5× that edge. */
export function isoZoneScaleMax(
  machineClass?: string | null
): number {
  const [, , cMax] = isoZoneEdges(machineClass);
  return cMax * 1.5;
}

export function isoZoneBands(
  machineClass?: string | null
): IsoZoneBand[] {
  const [aMax, bMax, cMax] = isoZoneEdges(machineClass);
  const scaleMax = isoZoneScaleMax(machineClass);
  return [
    { zone: "A", label: ISO_ZONE_LABELS.A, from: 0, to: aMax },
    { zone: "B", label: ISO_ZONE_LABELS.B, from: aMax, to: bMax },
    { zone: "C", label: ISO_ZONE_LABELS.C, from: bMax, to: cMax },
    { zone: "D", label: ISO_ZONE_LABELS.D, from: cMax, to: scaleMax }
  ];
}

export function isoZoneProvenance(
  machineClass?: string | null
): string {
  const cls = parseMachineClass(machineClass);
  const [aMax, bMax, cMax] = isoZoneEdges(cls);
  return `Zone provenance: guidance only — ISO 20816 velocity bands for Class ${cls} (A < ${aMax}, B < ${bMax}, C < ${cMax}, D ≥ ${cMax} mm/s RMS); health-score fallback when overall velocity is absent.`;
}
