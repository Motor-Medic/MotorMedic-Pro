/**
 * MCA Single Source of Truth — unified record for all four telemetry domains.
 * Used by Run Diagnostics (McaInputAccordions / Diagnose) and Trend Analyzer tabs.
 */

import type { SavedAnalysisResult } from "../analysisPersistence";
import type { InsulationClass } from "./groundwallCalculator";
import type { McaExtractedData, RicDataPoint } from "./mcaPdfExtractor";
import {
  extractMcaGroundwallFromSaved,
  extractMcaRicFromSaved,
  extractMcaWindingFromSaved,
  findLatestMcaWithGroundwall,
  MCA_GROUNDWALL_EMPTY,
  MCA_WINDING_EMPTY,
  mcaTripletHasData,
  normalizeMcaOperatorSnapshot,
  type McaGroundwallSnapshot,
  type McaOperatorSnapshot,
  type McaPhaseTriplet,
  type McaWindingSnapshot
} from "./mcaPersistence";
import { sanitizeRicSeries } from "./rotorInfluenceCalculator";
import { sanitizeSurgeSeries, type SurgeDataPoint } from "./surgeCalculator";

export type { RicDataPoint, SurgeDataPoint };

/** Winding & phase balance (T12 / T23 / T31 triplets). */
export type McaPhaseBalanceDomain = {
  resistance: McaPhaseTriplet;
  inductance: McaPhaseTriplet;
  impedance: McaPhaseTriplet;
  phase_angle: McaPhaseTriplet;
  if_ratio: McaPhaseTriplet;
  winding_temp_c?: number;
  rated_hp?: number;
};

/** Groundwall insulation IR timeline + PI/DAR. */
export type McaGroundwallDomain = {
  ir_15s?: number;
  ir_30s?: number;
  ir_1m?: number;
  ir_10m?: number;
  test_voltage?: number;
  insulation_class?: InsulationClass;
  pi?: number;
  dar?: number;
  winding_temp_c?: number;
};

/** Rotor Influence Check series + summary metrics. */
export type McaRotorInfluenceDomain = {
  series: RicDataPoint[];
  peak_variance?: number;
  eccentricity_index?: number;
};

/** Surge waveform + EAR summary. */
export type McaSurgeDomain = {
  waveform: SurgeDataPoint[];
  test_voltage_v?: number | null;
  ear?: number | null;
  peak_error_ratio?: number | null;
};

export type McaSsotMeta = {
  source?: "telemetry" | "pdf" | "vision" | "manual" | "empty";
  formatDetected?: string | null;
  confidenceScore?: number | null;
  fileName?: string | null;
};

/** Master MCA record — all tabs read slices from this object. */
export type McaSsotRecord = {
  phase_balance: McaPhaseBalanceDomain;
  groundwall: McaGroundwallDomain;
  rotor_influence: McaRotorInfluenceDomain;
  surge: McaSurgeDomain;
  meta: McaSsotMeta;
};

const ZERO: McaPhaseTriplet = [0, 0, 0];

export const EMPTY_MCA_SSOT: McaSsotRecord = {
  phase_balance: {
    resistance: [...ZERO],
    inductance: [...ZERO],
    impedance: [...ZERO],
    phase_angle: [...ZERO],
    if_ratio: [...ZERO]
  },
  groundwall: {},
  rotor_influence: { series: [] },
  surge: { waveform: [] },
  meta: { source: "empty" }
};

function finiteNum(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed || /not visible|n\/a|unknown|null/i.test(trimmed)) return undefined;
    const m = trimmed.replace(/,/g, "").match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
    if (!m) return undefined;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : undefined;
  }
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function pickPositive(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    const n = finiteNum(v);
    if (n != null && n > 0) return n;
  }
  for (const v of vals) {
    const n = finiteNum(v);
    if (n != null) return n;
  }
  return undefined;
}

function parseInsulationClass(raw: unknown): InsulationClass | undefined {
  if (raw == null || raw === "") return undefined;
  const s = String(raw).toUpperCase();
  if (/\bH\b|CLASS\s*H/.test(s)) return "H";
  if (/\bF\b|CLASS\s*F/.test(s)) return "F";
  if (/\bB\b|CLASS\s*B/.test(s)) return "B";
  if (/\bA\b|CLASS\s*A/.test(s)) return "A";
  return undefined;
}

function toTriplet(raw: unknown): McaPhaseTriplet {
  if (!Array.isArray(raw) || raw.length < 3) return [...ZERO];
  const a = finiteNum(raw[0]) ?? 0;
  const b = finiteNum(raw[1]) ?? 0;
  const c = finiteNum(raw[2]) ?? 0;
  return [a, b, c];
}

function mergeTriplet(
  prev: McaPhaseTriplet,
  patch: McaPhaseTriplet | undefined
): McaPhaseTriplet {
  if (!patch) return [...prev];
  return patch.map((v, i) =>
    v != null && Number.isFinite(v) && v !== 0 ? v : prev[i]
  ) as McaPhaseTriplet;
}

function windingToPhaseBalance(w: McaWindingSnapshot): McaPhaseBalanceDomain {
  return {
    resistance: [...w.phaseR],
    inductance: [...w.phaseL],
    impedance: [...w.phaseZ],
    phase_angle: [...w.phaseFi],
    if_ratio: [...w.phaseIF],
    ...(w.windingTempC != null ? { winding_temp_c: w.windingTempC } : {}),
    ...(w.ratedHp != null ? { rated_hp: w.ratedHp } : {})
  };
}

function groundwallSnapshotToDomain(
  gw: McaGroundwallSnapshot & { fromTelemetry?: boolean }
): McaGroundwallDomain {
  const domain: McaGroundwallDomain = {};
  const ir15 = pickPositive(gw.ir15sMOmega);
  const ir30 = pickPositive(gw.ir30sMOmega);
  const ir1 = pickPositive(gw.ir1mMOmega);
  const ir10 = pickPositive(gw.ir10mMOmega);
  const tv = pickPositive(gw.testVoltageV);
  if (ir15 != null) domain.ir_15s = ir15;
  if (ir30 != null) domain.ir_30s = ir30;
  if (ir1 != null) domain.ir_1m = ir1;
  if (ir10 != null) domain.ir_10m = ir10;
  if (tv != null) domain.test_voltage = tv;
  if (gw.insulationClass) domain.insulation_class = gw.insulationClass;
  if (gw.reportPi != null) domain.pi = gw.reportPi;
  if (gw.reportDar != null) domain.dar = gw.reportDar;
  if (gw.windingTempC != null) domain.winding_temp_c = gw.windingTempC;
  return domain;
}

/** Immutable deep-merge — never wipes sibling domains or unmentioned nested keys. */
export function deepMergeMcaSsot(
  prev: McaSsotRecord,
  patch: Partial<McaSsotRecord> | null | undefined
): McaSsotRecord {
  if (!patch) return prev;

  const pb = patch.phase_balance;
  const gw = patch.groundwall;
  const ri = patch.rotor_influence;
  const sg = patch.surge;
  const meta = patch.meta;

  const nextPhase: McaPhaseBalanceDomain = pb
    ? {
        resistance: mergeTriplet(prev.phase_balance.resistance, pb.resistance),
        inductance: mergeTriplet(prev.phase_balance.inductance, pb.inductance),
        impedance: mergeTriplet(prev.phase_balance.impedance, pb.impedance),
        phase_angle: mergeTriplet(prev.phase_balance.phase_angle, pb.phase_angle),
        if_ratio: mergeTriplet(prev.phase_balance.if_ratio, pb.if_ratio),
        winding_temp_c: pb.winding_temp_c ?? prev.phase_balance.winding_temp_c,
        rated_hp: pb.rated_hp ?? prev.phase_balance.rated_hp
      }
    : prev.phase_balance;

  const nextGw: McaGroundwallDomain = gw
    ? {
        ...prev.groundwall,
        ...Object.fromEntries(
          Object.entries(gw).filter(([, v]) => v != null)
        )
      }
    : prev.groundwall;

  const nextRi: McaRotorInfluenceDomain = ri
    ? {
        series:
          ri.series !== undefined
            ? sanitizeRicSeries(ri.series)
            : prev.rotor_influence.series,
        peak_variance: ri.peak_variance ?? prev.rotor_influence.peak_variance,
        eccentricity_index:
          ri.eccentricity_index ?? prev.rotor_influence.eccentricity_index
      }
    : prev.rotor_influence;

  const nextSg: McaSurgeDomain = sg
    ? {
        waveform:
          sg.waveform !== undefined
            ? sanitizeSurgeSeries(sg.waveform)
            : prev.surge.waveform,
        test_voltage_v:
          sg.test_voltage_v !== undefined
            ? sg.test_voltage_v
            : prev.surge.test_voltage_v,
        ear: sg.ear !== undefined ? sg.ear : prev.surge.ear,
        peak_error_ratio:
          sg.peak_error_ratio !== undefined
            ? sg.peak_error_ratio
            : prev.surge.peak_error_ratio
      }
    : prev.surge;

  return {
    phase_balance: nextPhase,
    groundwall: nextGw,
    rotor_influence: nextRi,
    surge: nextSg,
    meta: { ...prev.meta, ...(meta || {}) }
  };
}

export function hasMcaSsotPhaseBalance(r: McaSsotRecord): boolean {
  const pb = r.phase_balance;
  return (
    mcaTripletHasData(pb.resistance) ||
    mcaTripletHasData(pb.inductance) ||
    mcaTripletHasData(pb.impedance) ||
    mcaTripletHasData(pb.phase_angle) ||
    mcaTripletHasData(pb.if_ratio)
  );
}

export function hasMcaSsotGroundwall(r: McaSsotRecord): boolean {
  const gw = r.groundwall;
  return (
    (gw.ir_1m != null && gw.ir_1m > 0) ||
    (gw.ir_30s != null && gw.ir_30s > 0) ||
    (gw.ir_10m != null && gw.ir_10m > 0) ||
    (gw.ir_15s != null && gw.ir_15s > 0) ||
    (gw.pi != null && gw.pi > 0) ||
    (gw.dar != null && gw.dar > 0) ||
    (gw.test_voltage != null && gw.test_voltage > 0)
  );
}

export function hasMcaSsotRotorInfluence(r: McaSsotRecord): boolean {
  return r.rotor_influence.series.length > 0;
}

export function hasMcaSsotSurge(r: McaSsotRecord): boolean {
  return r.surge.waveform.length >= 2;
}

export function hasAnyMcaSsotTelemetry(r: McaSsotRecord): boolean {
  return (
    hasMcaSsotPhaseBalance(r) ||
    hasMcaSsotGroundwall(r) ||
    hasMcaSsotRotorInfluence(r) ||
    hasMcaSsotSurge(r)
  );
}

/** Groundwall domain → calculator / legacy snapshot shape. */
export function mcaGroundwallFromSsot(
  gw: McaGroundwallDomain
): McaGroundwallSnapshot & { reportPi?: number; reportDar?: number } {
  return {
    ir15sMOmega: gw.ir_15s ?? 0,
    ir30sMOmega: gw.ir_30s ?? 0,
    ir1mMOmega: gw.ir_1m ?? 0,
    ir10mMOmega: gw.ir_10m ?? 0,
    testVoltageV: gw.test_voltage ?? 0,
    windingTempC: gw.winding_temp_c,
    insulationClass: gw.insulation_class ?? "F",
    reportPi: gw.pi,
    reportDar: gw.dar
  };
}

/** Phase balance domain → winding calculator shape. */
export function mcaWindingFromSsot(
  pb: McaPhaseBalanceDomain
): McaWindingSnapshot & { fromTelemetry?: boolean } {
  return {
    phaseR: [...pb.resistance],
    phaseL: [...pb.inductance],
    phaseZ: [...pb.impedance],
    phaseFi: [...pb.phase_angle],
    phaseIF: [...pb.if_ratio],
    windingTempC: pb.winding_temp_c,
    ratedHp: pb.rated_hp
  };
}

/** Build SSOT patch from legacy flat extract (PDF / vision). */
export function mcaSsotFromExtracted(
  extracted: McaExtractedData,
  meta?: Partial<McaSsotMeta>
): Partial<McaSsotRecord> {
  const patch: Partial<McaSsotRecord> = {
    phase_balance: {
      resistance: [...extracted.phaseR],
      inductance: [...extracted.phaseL],
      impedance: [...extracted.phaseZ],
      phase_angle: [...extracted.phaseFi],
      if_ratio: [...extracted.phaseIF],
      ...(extracted.windingTempC != null
        ? { winding_temp_c: extracted.windingTempC }
        : {}),
      ...(extracted.ratedHp != null ? { rated_hp: extracted.ratedHp } : {})
    },
    groundwall: {},
    meta: {
      source: meta?.source ?? "pdf",
      formatDetected: extracted.formatDetected,
      confidenceScore: extracted.confidenceScore,
      fileName: meta?.fileName ?? null
    }
  };

  const gw = patch.groundwall!;
  const ir15 = pickPositive(extracted.ir15sMOmega, extracted.ir_15s);
  const ir30 = pickPositive(extracted.ir30sMOmega, extracted.ir_30s);
  const ir1 = pickPositive(extracted.ir1mMOmega, extracted.ir_1m);
  const ir10 = pickPositive(extracted.ir10mMOmega, extracted.ir_10m);
  if (ir15 != null) gw.ir_15s = ir15;
  if (ir30 != null) gw.ir_30s = ir30;
  if (ir1 != null) gw.ir_1m = ir1;
  if (ir10 != null) gw.ir_10m = ir10;
  const tv = pickPositive(extracted.testVoltageV);
  if (tv != null) gw.test_voltage = tv;
  const ic = parseInsulationClass(extracted.insulationClass);
  if (ic) gw.insulation_class = ic;
  const pi = pickPositive(extracted.reportPi, extracted.pi);
  const dar = pickPositive(extracted.reportDar, extracted.dar);
  if (pi != null) gw.pi = pi;
  if (dar != null) gw.dar = dar;
  if (extracted.windingTempC != null) gw.winding_temp_c = extracted.windingTempC;

  if (extracted.ricData && extracted.ricData.length > 0) {
    patch.rotor_influence = { series: sanitizeRicSeries(extracted.ricData) };
  }

  // Unified vision schema may include surge on extracted object
  const ext = extracted as McaExtractedData & {
    surge?: { waveform?: SurgeDataPoint[]; test_voltage_v?: number; ear?: number };
    rotor_influence?: { peak_variance?: number; eccentricity_index?: number };
  };
  if (ext.surge?.waveform && ext.surge.waveform.length > 0) {
    patch.surge = {
      waveform: sanitizeSurgeSeries(ext.surge.waveform),
      test_voltage_v: ext.surge.test_voltage_v,
      ear: ext.surge.ear
    };
  }
  if (ext.rotor_influence) {
    patch.rotor_influence = {
      ...(patch.rotor_influence || { series: [] }),
      peak_variance: ext.rotor_influence.peak_variance,
      eccentricity_index: ext.rotor_influence.eccentricity_index
    };
  }

  return patch;
}

/** Map unified vision JSON (four domains) → SSOT patch. */
export function mcaSsotFromVisionJson(
  parsed: Record<string, unknown>,
  fileName: string
): Partial<McaSsotRecord> {
  const pbRaw =
    (parsed.phase_balance as Record<string, unknown> | undefined) || parsed;
  const gwRaw =
    (parsed.groundwall as Record<string, unknown> | undefined) ||
    (parsed.insulation as Record<string, unknown> | undefined) ||
    parsed;
  const riRaw =
    (parsed.rotor_influence as Record<string, unknown> | undefined) || parsed;
  const sgRaw = (parsed.surge as Record<string, unknown> | undefined) || parsed;

  const phase_balance: McaPhaseBalanceDomain = {
    resistance: toTriplet(
      pbRaw.resistance ?? pbRaw.phaseR ?? pbRaw.phase_r ?? parsed.phaseR
    ),
    inductance: toTriplet(
      pbRaw.inductance ?? pbRaw.phaseL ?? pbRaw.phase_l ?? parsed.phaseL
    ),
    impedance: toTriplet(
      pbRaw.impedance ?? pbRaw.phaseZ ?? pbRaw.phase_z ?? parsed.phaseZ
    ),
    phase_angle: toTriplet(
      pbRaw.phase_angle ??
        pbRaw.phaseAngle ??
        pbRaw.phaseFi ??
        pbRaw.phase_fi ??
        parsed.phaseFi
    ),
    if_ratio: toTriplet(
      pbRaw.if_ratio ?? pbRaw.ifRatio ?? pbRaw.phaseIF ?? parsed.phaseIF
    ),
    winding_temp_c:
      finiteNum(pbRaw.winding_temp_c ?? pbRaw.windingTempC ?? parsed.windingTempC),
    rated_hp: finiteNum(pbRaw.rated_hp ?? pbRaw.ratedHp ?? parsed.ratedHp)
  };

  const groundwall: McaGroundwallDomain = {};
  const ir15 = pickPositive(
    gwRaw.ir_15s,
    gwRaw.ir15s,
    gwRaw.ir15sMOmega,
    parsed.ir_15s,
    parsed.ir15sMOmega
  );
  const ir30 = pickPositive(
    gwRaw.ir_30s,
    gwRaw.ir30s,
    gwRaw.ir30sMOmega,
    parsed.ir_30s,
    parsed.ir30sMOmega
  );
  const ir1 = pickPositive(
    gwRaw.ir_1m,
    gwRaw.ir1m,
    gwRaw.ir1mMOmega,
    parsed.ir_1m,
    parsed.ir1mMOmega
  );
  const ir10 = pickPositive(
    gwRaw.ir_10m,
    gwRaw.ir10m,
    gwRaw.ir10mMOmega,
    parsed.ir_10m,
    parsed.ir10mMOmega
  );
  if (ir15 != null) groundwall.ir_15s = ir15;
  if (ir30 != null) groundwall.ir_30s = ir30;
  if (ir1 != null) groundwall.ir_1m = ir1;
  if (ir10 != null) groundwall.ir_10m = ir10;
  const tv = pickPositive(
    gwRaw.test_voltage,
    gwRaw.test_voltage_v,
    gwRaw.testVoltageV,
    parsed.testVoltageV
  );
  if (tv != null) groundwall.test_voltage = tv;
  const ic = parseInsulationClass(
    gwRaw.insulation_class ?? gwRaw.insulationClass ?? parsed.insulationClass
  );
  if (ic) groundwall.insulation_class = ic;
  const pi = pickPositive(gwRaw.pi, gwRaw.reportPi, parsed.pi, parsed.reportPi);
  const dar = pickPositive(gwRaw.dar, gwRaw.reportDar, parsed.dar, parsed.reportDar);
  if (pi != null) groundwall.pi = pi;
  if (dar != null) groundwall.dar = dar;

  const ricRaw =
    riRaw.series ??
    riRaw.ricData ??
    riRaw.ric_data ??
    parsed.ricData ??
    parsed.ric_data;
  const series = sanitizeRicSeries(
    Array.isArray(ricRaw) ? (ricRaw as RicDataPoint[]) : null
  );
  const rotor_influence: McaRotorInfluenceDomain = {
    series,
    peak_variance: finiteNum(riRaw.peak_variance ?? riRaw.peakVariance),
    eccentricity_index: finiteNum(
      riRaw.eccentricity_index ?? riRaw.eccentricityIndex
    )
  };

  const wfRaw =
    sgRaw.waveform ?? sgRaw.data ?? sgRaw.surgeData ?? parsed.surgeWaveform;
  const waveform = sanitizeSurgeSeries(
    Array.isArray(wfRaw) ? (wfRaw as SurgeDataPoint[]) : null
  );
  const surge: McaSurgeDomain = {
    waveform,
    test_voltage_v: finiteNum(
      sgRaw.test_voltage_v ?? sgRaw.testVoltageV ?? parsed.surgeTestVoltageV
    ),
    ear: finiteNum(sgRaw.ear ?? sgRaw.EAR ?? sgRaw.maxEar),
    peak_error_ratio: finiteNum(
      sgRaw.peak_error_ratio ?? sgRaw.peakErrorRatio ?? sgRaw.maxEar
    )
  };

  return {
    phase_balance,
    groundwall,
    rotor_influence,
    surge,
    meta: {
      source: "vision",
      formatDetected: String(parsed.formatDetected || "VISION_SCREENSHOT"),
      confidenceScore: finiteNum(parsed.confidenceScore ?? parsed.confidence),
      fileName
    }
  };
}

/** Load all domains from saved analysis_results row(s). */
export function mcaSsotFromSaved(
  row: SavedAnalysisResult | null,
  groundwallRow?: SavedAnalysisResult | null
): Partial<McaSsotRecord> {
  if (!row) return {};
  const winding = extractMcaWindingFromSaved(row);
  const gw = extractMcaGroundwallFromSaved(groundwallRow ?? row);
  const ric = extractMcaRicFromSaved(row);
  const surge = extractMcaSurgeFromSaved(row);

  const patch: Partial<McaSsotRecord> = {
    meta: { source: "telemetry" }
  };

  if (
    winding.fromTelemetry ||
    mcaTripletHasData(winding.phaseR) ||
    mcaTripletHasData(winding.phaseL)
  ) {
    patch.phase_balance = windingToPhaseBalance(winding);
  }
  if (gw.fromTelemetry) {
    patch.groundwall = groundwallSnapshotToDomain(gw);
  }
  if (ric.length > 0) {
    patch.rotor_influence = { series: ric };
  }
  if (surge.waveform.length > 0) {
    patch.surge = surge;
  }

  return patch;
}

/** Extract surge telemetry from saved MCA row. */
export function extractMcaSurgeFromSaved(
  row: SavedAnalysisResult | null
): McaSurgeDomain {
  if (!row) return { waveform: [] };
  const peaks = Array.isArray(row.peaks) ? row.peaks : [];
  const tele =
    row.telemetry_data && typeof row.telemetry_data === "object"
      ? (row.telemetry_data as Record<string, unknown>)
      : {};

  const candidates: unknown[] = [
    tele.surge,
    tele.surge_waveform,
    tele.surgeWaveform
  ];
  for (const raw of peaks) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    candidates.push(p.surge, p.surge_waveform, p.surgeWaveform);
    const nested = p.surge as Record<string, unknown> | undefined;
    if (nested) {
      candidates.push(nested.waveform, nested.data);
    }
  }

  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const wf = o.waveform ?? o.data ?? (Array.isArray(c) ? c : null);
    const series = sanitizeSurgeSeries(wf as SurgeDataPoint[] | null);
    if (series.length >= 2) {
      return {
        waveform: series,
        test_voltage_v: finiteNum(o.test_voltage_v ?? o.testVoltageV),
        ear: finiteNum(o.ear ?? o.EAR ?? o.maxEar),
        peak_error_ratio: finiteNum(o.peak_error_ratio ?? o.peakErrorRatio)
      };
    }
  }
  return { waveform: [] };
}

/** SSOT → legacy operator snapshot for Diagnose save path. */
export function mcaSsotToOperatorSnapshot(
  record: McaSsotRecord,
  extras?: Partial<McaOperatorSnapshot>
): McaOperatorSnapshot {
  const pb = record.phase_balance;
  const gw = record.groundwall;
  return {
    ...extras,
    phaseR: [...pb.resistance],
    phaseL: [...pb.inductance],
    phaseZ: [...pb.impedance],
    phaseFi: [...pb.phase_angle],
    phaseIF: [...pb.if_ratio],
    windingTempC: pb.winding_temp_c ?? gw.winding_temp_c ?? null,
    ratedHp: pb.rated_hp ?? null,
    ir15sMOmega: gw.ir_15s ?? null,
    ir30sMOmega: gw.ir_30s ?? null,
    ir1mMOmega: gw.ir_1m ?? null,
    ir10mMOmega: gw.ir_10m ?? null,
    testVoltageV: gw.test_voltage ?? null,
    insulationClass: gw.insulation_class ?? null,
    reportPi: gw.pi ?? null,
    reportDar: gw.dar ?? null,
    ricData:
      record.rotor_influence.series.length > 0
        ? record.rotor_influence.series
        : null,
    surgeData:
      record.surge.waveform.length >= 2 ? record.surge.waveform : null,
    surgeTestVoltageV: record.surge.test_voltage_v ?? null,
    surgeEar: record.surge.ear ?? null,
    extractMeta: {
      fileName: record.meta.fileName,
      formatDetected: record.meta.formatDetected,
      confidenceScore: record.meta.confidenceScore
    }
  };
}

/** Hydrate Trend Analyzer when asset / history changes — merge, never wipe. */
export function hydrateMcaSsotFromAnalyses(
  prev: McaSsotRecord,
  mcaAnalyses: SavedAnalysisResult[],
  resetOnAssetChange: boolean
): McaSsotRecord {
  if (resetOnAssetChange) {
    return deepMergeMcaSsot(EMPTY_MCA_SSOT, {});
  }
  const latest = mcaAnalyses[0] ?? null;
  const gwRow = findLatestMcaWithGroundwall(mcaAnalyses) ?? latest;
  if (!latest) return prev;
  return deepMergeMcaSsot(prev, mcaSsotFromSaved(latest, gwRow));
}

/** Operator accordion snapshot → SSOT patch (omits empty/null fields that would wipe domains). */
export function mcaSsotPatchFromOperatorSnapshot(
  snap: McaOperatorSnapshot
): Partial<McaSsotRecord> {
  const { winding, groundwall } = normalizeMcaOperatorSnapshot(snap);
  const patch: Partial<McaSsotRecord> = {};

  const hasWinding =
    mcaTripletHasData(winding.phaseR) ||
    mcaTripletHasData(winding.phaseL) ||
    mcaTripletHasData(winding.phaseZ) ||
    mcaTripletHasData(winding.phaseFi) ||
    mcaTripletHasData(winding.phaseIF);
  if (hasWinding) {
    patch.phase_balance = windingToPhaseBalance(winding);
  }

  const gwDomain = groundwallSnapshotToDomain(groundwall);
  if (hasMcaSsotGroundwall({ ...EMPTY_MCA_SSOT, groundwall: gwDomain })) {
    patch.groundwall = gwDomain;
  }

  if (snap.ricData && snap.ricData.length > 0) {
    patch.rotor_influence = { series: sanitizeRicSeries(snap.ricData) };
  }

  const surgeSeries = sanitizeSurgeSeries(
    Array.isArray(snap.surgeData) ? snap.surgeData : null
  );
  if (surgeSeries.length >= 2) {
    patch.surge = {
      waveform: surgeSeries,
      test_voltage_v: finiteNum(snap.surgeTestVoltageV),
      ear: finiteNum(snap.surgeEar)
    };
  }

  if (snap.extractMeta) {
    patch.meta = {
      source: snap.extractMeta.fileName ? "pdf" : "manual",
      fileName: snap.extractMeta.fileName ?? null,
      formatDetected: snap.extractMeta.formatDetected ?? null,
      confidenceScore: snap.extractMeta.confidenceScore ?? null
    };
  }

  return patch;
}

/** Deep-merge Diagnose accordion emissions into the master operator snapshot. */
export function mergeMcaOperatorSnapshots(
  prev: McaOperatorSnapshot | null,
  next: McaOperatorSnapshot
): McaOperatorSnapshot {
  const prevSsot = prev
    ? deepMergeMcaSsot(EMPTY_MCA_SSOT, mcaSsotPatchFromOperatorSnapshot(prev))
    : EMPTY_MCA_SSOT;
  const merged = deepMergeMcaSsot(
    prevSsot,
    mcaSsotPatchFromOperatorSnapshot(next)
  );
  const base = mcaSsotToOperatorSnapshot(merged);
  return {
    ...base,
    mode: next.mode ?? prev?.mode,
    windingConfig: next.windingConfig ?? prev?.windingConfig,
    ratedVoltage: next.ratedVoltage ?? prev?.ratedVoltage,
    ambientTempC: next.ambientTempC ?? prev?.ambientTempC,
    phases: next.phases ?? prev?.phases,
    extractMeta: next.extractMeta ?? prev?.extractMeta
  };
}
