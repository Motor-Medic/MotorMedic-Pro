/**
 * MCA persistence helpers — peaks JSONB + telemetry_data shapes for
 * analysis_results ↔ Trend Analyzer Winding / Groundwall tabs.
 */

import type { SavedAnalysisResult } from "../analysisPersistence";
import type { InsulationClass } from "./groundwallCalculator";
import type { McaExtractedData, RicDataPoint } from "./mcaPdfExtractor";
import { sanitizeRicSeries } from "./rotorInfluenceCalculator";
import { sanitizeSurgeSeries, type SurgeDataPoint } from "./surgeCalculator";

export type McaPhaseTriplet = [number, number, number];

export type McaWindingSnapshot = {
  phaseR: McaPhaseTriplet;
  phaseL: McaPhaseTriplet;
  phaseZ: McaPhaseTriplet;
  phaseFi: McaPhaseTriplet;
  phaseIF: McaPhaseTriplet;
  windingTempC?: number;
  ratedHp?: number;
};

export type McaGroundwallSnapshot = {
  ir15sMOmega?: number;
  ir30sMOmega?: number;
  ir1mMOmega?: number;
  ir10mMOmega?: number;
  testVoltageV?: number;
  windingTempC?: number;
  insulationClass?: InsulationClass;
  /** Pre-calculated Polarization Index from report / saved telemetry. */
  reportPi?: number;
  /** Pre-calculated Dielectric Absorption Ratio from report / saved telemetry. */
  reportDar?: number;
};

/** Operator / Diagnose accordion payload used to build save peaks. */
export type McaOperatorSnapshot = {
  mode?: string;
  windingConfig?: string;
  ratedHp?: number | string | null;
  ratedVoltage?: string | null;
  windingTempC?: number | string | null;
  ambientTempC?: number | string | null;
  insulationClass?: string | null;
  testVoltageV?: number | string | null;
  /** Phase pairs as entered in Diagnose (uv / vw / wu). */
  phases?: {
    uv?: Record<string, string | number | null | undefined>;
    vw?: Record<string, string | number | null | undefined>;
    wu?: Record<string, string | number | null | undefined>;
  };
  /** Flat triplets when already normalized. */
  phaseR?: McaPhaseTriplet | number[];
  phaseL?: McaPhaseTriplet | number[];
  phaseZ?: McaPhaseTriplet | number[];
  phaseFi?: McaPhaseTriplet | number[];
  phaseIF?: McaPhaseTriplet | number[];
  ir15sMOmega?: number | string | null;
  ir30sMOmega?: number | string | null;
  ir1mMOmega?: number | string | null;
  ir10mMOmega?: number | string | null;
  reading30s?: number | string | null;
  reading60s?: number | string | null;
  reading1Min?: number | string | null;
  reading10Min?: number | string | null;
  megohms?: number | string | null;
  reportPi?: number | string | null;
  reportDar?: number | string | null;
  /** Rotor Influence Check series (angle → L12/L23/L31). */
  ricData?: RicDataPoint[] | null;
  /** Surge waveform samples (time, V12, V23, V31). */
  surgeData?: SurgeDataPoint[] | null;
  surgeTestVoltageV?: number | string | null;
  surgeEar?: number | string | null;
  extractMeta?: {
    fileName?: string | null;
    formatDetected?: string | null;
    confidenceScore?: number | null;
  } | null;
};

export const MCA_WINDING_EMPTY: McaWindingSnapshot = {
  phaseR: [0, 0, 0],
  phaseL: [0, 0, 0],
  phaseZ: [0, 0, 0],
  phaseFi: [0, 0, 0],
  phaseIF: [0, 0, 0]
};

export const MCA_GROUNDWALL_EMPTY: McaGroundwallSnapshot = {
  ir15sMOmega: 0,
  ir30sMOmega: 0,
  ir1mMOmega: 0,
  ir10mMOmega: 0,
  testVoltageV: 0,
  insulationClass: "F"
};

function finiteNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed || /not visible|n\/a|unknown/i.test(trimmed)) return null;
    const m = trimmed.replace(/,/g, "").match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
  }
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function mcaTripletHasData(t: McaPhaseTriplet): boolean {
  return t.some((n) => Number.isFinite(n) && n !== 0);
}

export function parsePhaseTriplet(raw: unknown): McaPhaseTriplet | null {
  if (Array.isArray(raw) && raw.length >= 3) {
    const a = finiteNum(raw[0]);
    const b = finiteNum(raw[1]);
    const c = finiteNum(raw[2]);
    if (a == null || b == null || c == null) return null;
    return [a, b, c];
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    // Ordered phase-pair keys
    const a =
      finiteNum(o.t12 ?? o.T12 ?? o.uv ?? o.UV ?? o.u ?? o.U ?? o.phase1 ?? o.p1) ??
      finiteNum(o[0]);
    const b =
      finiteNum(o.t23 ?? o.T23 ?? o.vw ?? o.VW ?? o.v ?? o.V ?? o.phase2 ?? o.p2) ??
      finiteNum(o[1]);
    const c =
      finiteNum(o.t31 ?? o.T31 ?? o.wu ?? o.WU ?? o.w ?? o.W ?? o.phase3 ?? o.p3) ??
      finiteNum(o[2]);
    if (a != null && b != null && c != null) return [a, b, c];
  }
  return null;
}

function pickPhaseTriplet(...candidates: unknown[]): McaPhaseTriplet | null {
  for (const c of candidates) {
    const t = parsePhaseTriplet(c);
    if (t) return t;
  }
  return null;
}

function phaseMetricFromPairs(
  phases: Record<string, unknown> | null | undefined,
  metricKeys: string[]
): McaPhaseTriplet | null {
  if (!phases || typeof phases !== "object") return null;
  const uv = phases.uv ?? phases.t12 ?? phases.T12;
  const vw = phases.vw ?? phases.t23 ?? phases.T23;
  const wu = phases.wu ?? phases.t31 ?? phases.T31;
  if (!uv || typeof uv !== "object") return null;
  if (!vw || typeof vw !== "object") return null;
  if (!wu || typeof wu !== "object") return null;
  const u = uv as Record<string, unknown>;
  const v = vw as Record<string, unknown>;
  const w = wu as Record<string, unknown>;
  const pick = (row: Record<string, unknown>) => {
    for (const k of metricKeys) {
      const n = finiteNum(row[k]);
      if (n != null) return n;
    }
    return null;
  };
  const a = pick(u);
  const b = pick(v);
  const c = pick(w);
  if (a == null || b == null || c == null) return null;
  return [a, b, c];
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

function asObj(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

/** Find primary MCA peak blob from analysis_results.peaks. */
export function mcaPeakBlob(row: SavedAnalysisResult | null): Record<string, unknown> {
  if (!row) return {};
  const peaks = Array.isArray(row.peaks) ? row.peaks : [];
  for (const raw of peaks) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (String(p.type || "").toLowerCase() === "mca") return p;
  }
  for (const raw of peaks) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (
      p.phase_r != null ||
      p.phaseR != null ||
      p.resistance != null ||
      p.phases != null ||
      p.winding != null ||
      p.groundwall != null ||
      p.ir1mMOmega != null ||
      p.ir_1m != null ||
      p.ricData != null ||
      p.ric_data != null ||
      p.rotor_influence != null
    ) {
      return p;
    }
  }
  return {};
}

function telemetryRoots(row: SavedAnalysisResult | null): {
  root: Record<string, unknown>;
  winding: Record<string, unknown>;
  groundwall: Record<string, unknown>;
  consensus: Record<string, unknown>;
} {
  const root = asObj(row?.telemetry_data) || {};
  const winding =
    asObj(root.winding) ||
    asObj(root.mca_winding) ||
    asObj(root.phase) ||
    {};
  const groundwall =
    asObj(root.groundwall) ||
    asObj(root.insulation) ||
    asObj(root.mca_groundwall) ||
    {};
  let consensus = asObj(row?.consensus_details) || {};
  const referee = consensus.refereeDebateSummary;
  if (typeof referee === "string" && referee.trim().startsWith("{")) {
    const nested = asObj(referee);
    if (nested) consensus = { ...consensus, ...nested };
  }
  return { root, winding, groundwall, consensus };
}

/**
 * Map a saved analysis_results row → winding phase triplets for Trend Analyzer.
 */
export function extractMcaWindingFromSaved(
  row: SavedAnalysisResult | null
): McaWindingSnapshot & { fromTelemetry: boolean } {
  if (!row) {
    return { ...MCA_WINDING_EMPTY, fromTelemetry: false };
  }

  const blob = mcaPeakBlob(row);
  const { winding, consensus, root } = telemetryRoots(row);
  const nestedWinding = asObj(blob.winding) || {};
  const phasesObj =
    asObj(blob.phases) ||
    asObj(nestedWinding.phases) ||
    asObj(winding.phases) ||
    asObj(consensus.phases);

  const phaseR =
    pickPhaseTriplet(
      blob.phase_r,
      blob.phaseR,
      blob.resistance,
      blob.R,
      nestedWinding.phase_r,
      nestedWinding.phaseR,
      nestedWinding.resistance,
      winding.phase_r,
      winding.phaseR,
      winding.resistance,
      consensus.phase_r,
      consensus.phaseR,
      phaseMetricFromPairs(phasesObj, [
        "resistance",
        "R",
        "r",
        "ohms",
        "ohm"
      ])
    ) || MCA_WINDING_EMPTY.phaseR;

  const phaseL =
    pickPhaseTriplet(
      blob.phase_l,
      blob.phaseL,
      blob.inductance,
      blob.L,
      nestedWinding.phase_l,
      nestedWinding.phaseL,
      nestedWinding.inductance,
      winding.phase_l,
      winding.phaseL,
      winding.inductance,
      consensus.phase_l,
      consensus.phaseL,
      phaseMetricFromPairs(phasesObj, [
        "inductance",
        "L",
        "l",
        "mH",
        "mh"
      ])
    ) || MCA_WINDING_EMPTY.phaseL;

  const phaseZ =
    pickPhaseTriplet(
      blob.phase_z,
      blob.phaseZ,
      blob.impedance,
      blob.Z,
      nestedWinding.phase_z,
      nestedWinding.phaseZ,
      nestedWinding.impedance,
      winding.phase_z,
      winding.phaseZ,
      winding.impedance,
      consensus.phase_z,
      consensus.phaseZ,
      phaseMetricFromPairs(phasesObj, [
        "impedance",
        "Z",
        "z",
        "ohmsZ"
      ])
    ) || MCA_WINDING_EMPTY.phaseZ;

  const phaseFi =
    pickPhaseTriplet(
      blob.phase_fi,
      blob.phaseFi,
      blob.phase_angle,
      blob.phaseAngle,
      blob.Fi,
      nestedWinding.phase_fi,
      nestedWinding.phaseFi,
      nestedWinding.phaseAngle,
      winding.phase_fi,
      winding.phaseFi,
      winding.phase_angle,
      consensus.phase_fi,
      consensus.phaseFi,
      phaseMetricFromPairs(phasesObj, [
        "phaseAngle",
        "phase_angle",
        "angle",
        "Fi",
        "fi",
        "phi"
      ])
    ) || MCA_WINDING_EMPTY.phaseFi;

  const phaseIF =
    pickPhaseTriplet(
      blob.phase_if,
      blob.phaseIF,
      blob.if_ratio,
      blob.ifRatio,
      nestedWinding.phase_if,
      nestedWinding.phaseIF,
      nestedWinding.ifRatio,
      winding.phase_if,
      winding.phaseIF,
      winding.if_ratio,
      consensus.phase_if,
      consensus.phaseIF,
      phaseMetricFromPairs(phasesObj, [
        "ifRatio",
        "if_ratio",
        "I/F",
        "IF",
        "if"
      ])
    ) || MCA_WINDING_EMPTY.phaseIF;

  const windingTempC =
    finiteNum(
      blob.winding_temp_c ??
        blob.windingTempC ??
        nestedWinding.winding_temp_c ??
        nestedWinding.windingTempC ??
        winding.winding_temp_c ??
        winding.windingTempC ??
        root.winding_temp_c ??
        consensus.windingTempC
    ) ?? undefined;

  const ratedHp =
    finiteNum(
      blob.rated_hp ??
        blob.ratedHp ??
        nestedWinding.rated_hp ??
        nestedWinding.ratedHp ??
        winding.rated_hp ??
        winding.ratedHp ??
        consensus.rated_hp ??
        consensus.ratedHp
    ) ?? undefined;

  const fromTelemetry =
    mcaTripletHasData(phaseR) ||
    mcaTripletHasData(phaseL) ||
    mcaTripletHasData(phaseZ) ||
    mcaTripletHasData(phaseFi) ||
    mcaTripletHasData(phaseIF);

  return {
    phaseR,
    phaseL,
    phaseZ,
    phaseFi,
    phaseIF,
    windingTempC,
    ratedHp,
    fromTelemetry
  };
}

/**
 * Map a saved analysis_results row → groundwall IR params for Trend Analyzer.
 * Reads peaks[].groundwall / peaks[].insulation / telemetry_data.groundwall
 * with camelCase + snake_case aliases.
 */
export function extractMcaGroundwallFromSaved(
  row: SavedAnalysisResult | null
): McaGroundwallSnapshot & { fromTelemetry: boolean } {
  if (!row) {
    return { ...MCA_GROUNDWALL_EMPTY, fromTelemetry: false };
  }

  const blob = mcaPeakBlob(row);
  const { groundwall, winding, root, consensus } = telemetryRoots(row);
  const nestedGw =
    asObj(blob.groundwall) ||
    asObj(blob.insulation) ||
    asObj(blob.groundwall_insulation) ||
    {};
  const nestedIns =
    asObj(blob.insulation) ||
    asObj(groundwall.insulation) ||
    asObj(root.insulation) ||
    {};
  const consensusGw =
    asObj(consensus.groundwall) ||
    asObj(consensus.insulation) ||
    {};

  /** Prefer first finite positive; allow 0 only when explicitly the sole candidate. */
  const pickPos = (...vals: unknown[]): number => {
    for (const v of vals) {
      const n = finiteNum(v);
      if (n != null && n > 0) return n;
    }
    return 0;
  };
  const pickAny = (...vals: unknown[]): number | undefined => {
    for (const v of vals) {
      const n = finiteNum(v);
      if (n != null) return n;
    }
    return undefined;
  };

  const ir15sMOmega = pickPos(
    nestedGw.ir15sMOmega,
    nestedGw.ir_15s,
    nestedGw.ir15s,
    nestedIns.ir15sMOmega,
    blob.ir15sMOmega,
    blob.ir_15s,
    blob.ir15s,
    groundwall.ir15sMOmega,
    groundwall.ir_15s,
    groundwall.ir15s,
    root.ir15sMOmega,
    root.ir_15s,
    consensusGw.ir15sMOmega
  );
  const ir30sMOmega = pickPos(
    nestedGw.ir30sMOmega,
    nestedGw.ir_30s,
    nestedGw.ir30s,
    nestedGw.reading30s,
    nestedIns.ir30sMOmega,
    nestedIns.ir_30s,
    blob.ir30sMOmega,
    blob.ir_30s,
    blob.ir30s,
    blob.reading30s,
    groundwall.ir30sMOmega,
    groundwall.ir_30s,
    groundwall.ir30s,
    groundwall.reading30s,
    root.ir30sMOmega,
    root.ir_30s,
    root.ir30s,
    consensusGw.ir30sMOmega,
    consensusGw.ir_30s
  );
  const ir1mMOmega = pickPos(
    nestedGw.ir1mMOmega,
    nestedGw.ir_1m,
    nestedGw.ir1m,
    nestedGw.ir60s,
    nestedGw.reading1Min,
    nestedGw.megohms,
    nestedIns.ir1mMOmega,
    nestedIns.ir_1m,
    nestedIns.megohms,
    blob.ir1mMOmega,
    blob.ir_1m,
    blob.ir1m,
    blob.megohms,
    blob.reading1Min,
    groundwall.ir1mMOmega,
    groundwall.ir_1m,
    groundwall.ir1m,
    groundwall.megohms,
    groundwall.reading1Min,
    root.ir1mMOmega,
    root.ir_1m,
    root.megohms,
    consensusGw.ir1mMOmega,
    consensusGw.megohms
  );
  const ir10mMOmega = pickPos(
    nestedGw.ir10mMOmega,
    nestedGw.ir_10m,
    nestedGw.ir10m,
    nestedGw.reading10Min,
    nestedIns.ir10mMOmega,
    nestedIns.ir_10m,
    blob.ir10mMOmega,
    blob.ir_10m,
    blob.ir10m,
    blob.reading10Min,
    groundwall.ir10mMOmega,
    groundwall.ir_10m,
    groundwall.ir10m,
    groundwall.reading10Min,
    root.ir10mMOmega,
    root.ir_10m,
    consensusGw.ir10mMOmega
  );
  const testVoltageV = pickPos(
    nestedGw.testVoltageV,
    nestedGw.test_voltage_v,
    nestedGw.test_voltage,
    nestedGw.testVoltage,
    nestedIns.testVoltageV,
    nestedIns.test_voltage_v,
    nestedIns.test_voltage,
    blob.testVoltageV,
    blob.test_voltage_v,
    blob.test_voltage,
    blob.testVoltage,
    groundwall.testVoltageV,
    groundwall.test_voltage_v,
    groundwall.test_voltage,
    root.testVoltageV,
    root.test_voltage_v,
    root.test_voltage,
    consensusGw.testVoltageV,
    consensusGw.test_voltage
  );
  const windingTempC = pickAny(
    nestedGw.windingTempC,
    nestedGw.winding_temp_c,
    nestedIns.windingTempC,
    blob.windingTempC,
    blob.winding_temp_c,
    groundwall.windingTempC,
    groundwall.winding_temp_c,
    winding.windingTempC,
    winding.winding_temp_c,
    root.winding_temp_c,
    root.windingTempC
  );
  const insulationClass =
    parseInsulationClass(
      nestedGw.insulationClass ??
        nestedGw.insulation_class ??
        nestedIns.insulationClass ??
        nestedIns.insulation_class ??
        blob.insulationClass ??
        blob.insulation_class ??
        groundwall.insulationClass ??
        groundwall.insulation_class ??
        root.insulationClass ??
        root.insulation_class ??
        consensus.insulationClass ??
        consensusGw.insulationClass ??
        consensusGw.insulation_class
    ) ?? "F";

  const reportPi = pickAny(
    nestedGw.reportPi,
    nestedGw.report_pi,
    nestedGw.pi,
    nestedGw.polarization_index,
    nestedIns.reportPi,
    nestedIns.pi,
    blob.reportPi,
    blob.report_pi,
    blob.pi,
    blob.polarization_index,
    groundwall.reportPi,
    groundwall.report_pi,
    groundwall.pi,
    root.reportPi,
    root.report_pi,
    root.pi,
    consensusGw.reportPi,
    consensusGw.pi
  );
  const reportDar = pickAny(
    nestedGw.reportDar,
    nestedGw.report_dar,
    nestedGw.dar,
    nestedGw.dielectric_absorption,
    nestedIns.reportDar,
    nestedIns.dar,
    blob.reportDar,
    blob.report_dar,
    blob.dar,
    groundwall.reportDar,
    groundwall.report_dar,
    groundwall.dar,
    root.reportDar,
    root.report_dar,
    root.dar,
    consensusGw.reportDar,
    consensusGw.dar
  );

  const fromTelemetry =
    ir1mMOmega > 0 ||
    ir30sMOmega > 0 ||
    ir10mMOmega > 0 ||
    ir15sMOmega > 0 ||
    testVoltageV > 0 ||
    (reportPi != null && reportPi > 0) ||
    (reportDar != null && reportDar > 0);

  return {
    ir15sMOmega,
    ir30sMOmega,
    ir1mMOmega,
    ir10mMOmega,
    testVoltageV,
    windingTempC,
    insulationClass,
    reportPi,
    reportDar,
    fromTelemetry
  };
}

/** Newest MCA row that actually contains groundwall / IR telemetry. */
export function findLatestMcaWithGroundwall(
  rows: SavedAnalysisResult[]
): SavedAnalysisResult | null {
  for (const row of rows) {
    const gw = extractMcaGroundwallFromSaved(row);
    if (gw.fromTelemetry) return row;
  }
  return null;
}

/** Pull Rotor Influence Check series from a saved MCA analysis_results row. */
export function extractMcaRicFromSaved(
  row: SavedAnalysisResult | null
): RicDataPoint[] {
  if (!row) return [];
  const blob = mcaPeakBlob(row);
  const { root } = telemetryRoots(row);
  const candidates = [
    blob.ricData,
    blob.ric_data,
    blob.rotorInfluence,
    blob.rotor_influence,
    root.ricData,
    root.ric_data,
    root.rotorInfluence,
    root.rotor_influence
  ];
  for (const c of candidates) {
    const series = sanitizeRicSeries(c as RicDataPoint[] | null);
    if (series.length > 0) return series;
  }
  return [];
}

/** Prefer positive PDF/manual values; otherwise keep DB / fallback. */
export function mergeGroundwallPreferPositive(
  preferred: Partial<McaGroundwallSnapshot> | null | undefined,
  fallback: McaGroundwallSnapshot & { fromTelemetry?: boolean }
): McaGroundwallSnapshot & { fromTelemetry: boolean } {
  const pick = (
    pref: number | null | undefined,
    fb: number | null | undefined,
    empty = 0
  ): number => {
    if (pref != null && Number.isFinite(pref) && pref > 0) return pref;
    if (fb != null && Number.isFinite(fb) && fb > 0) return fb;
    if (pref != null && Number.isFinite(pref)) return pref;
    if (fb != null && Number.isFinite(fb)) return fb;
    return empty;
  };
  const pickOpt = (
    pref: number | null | undefined,
    fb: number | null | undefined
  ): number | undefined => {
    if (pref != null && Number.isFinite(pref) && pref !== 0) return pref;
    if (fb != null && Number.isFinite(fb)) return fb;
    if (pref != null && Number.isFinite(pref)) return pref;
    return undefined;
  };

  const ir15sMOmega = pick(preferred?.ir15sMOmega, fallback.ir15sMOmega);
  const ir30sMOmega = pick(preferred?.ir30sMOmega, fallback.ir30sMOmega);
  const ir1mMOmega = pick(preferred?.ir1mMOmega, fallback.ir1mMOmega);
  const ir10mMOmega = pick(preferred?.ir10mMOmega, fallback.ir10mMOmega);
  const testVoltageV = pick(preferred?.testVoltageV, fallback.testVoltageV);
  const windingTempC = pickOpt(
    preferred?.windingTempC,
    fallback.windingTempC
  );
  const reportPi = pickOpt(preferred?.reportPi, fallback.reportPi);
  const reportDar = pickOpt(preferred?.reportDar, fallback.reportDar);
  const insulationClass =
    preferred?.insulationClass || fallback.insulationClass || "F";

  const fromTelemetry =
    Boolean(fallback.fromTelemetry) ||
    ir1mMOmega > 0 ||
    ir30sMOmega > 0 ||
    ir10mMOmega > 0 ||
    ir15sMOmega > 0 ||
    testVoltageV > 0 ||
    reportPi != null ||
    reportDar != null;

  return {
    ir15sMOmega,
    ir30sMOmega,
    ir1mMOmega,
    ir10mMOmega,
    testVoltageV,
    windingTempC,
    insulationClass,
    reportPi,
    reportDar,
    fromTelemetry
  };
}

function tripletFromPhaseField(
  phases: McaOperatorSnapshot["phases"],
  field: string
): McaPhaseTriplet {
  const uv = finiteNum(phases?.uv?.[field]) ?? 0;
  const vw = finiteNum(phases?.vw?.[field]) ?? 0;
  const wu = finiteNum(phases?.wu?.[field]) ?? 0;
  return [uv, vw, wu];
}

/** Normalize Diagnose accordion / PDF extract into winding + groundwall snapshots. */
export function normalizeMcaOperatorSnapshot(
  snap: McaOperatorSnapshot | McaExtractedData | null | undefined
): {
  winding: McaWindingSnapshot;
  groundwall: McaGroundwallSnapshot;
} {
  if (!snap) {
    return { winding: { ...MCA_WINDING_EMPTY }, groundwall: { ...MCA_GROUNDWALL_EMPTY } };
  }

  const s = snap as McaOperatorSnapshot & Partial<McaExtractedData>;
  const phaseR =
    parsePhaseTriplet(s.phaseR) ||
    (s.phases ? tripletFromPhaseField(s.phases, "resistance") : null) ||
    MCA_WINDING_EMPTY.phaseR;
  const phaseL =
    parsePhaseTriplet(s.phaseL) ||
    (s.phases ? tripletFromPhaseField(s.phases, "inductance") : null) ||
    MCA_WINDING_EMPTY.phaseL;
  const phaseZ =
    parsePhaseTriplet(s.phaseZ) ||
    (s.phases ? tripletFromPhaseField(s.phases, "impedance") : null) ||
    MCA_WINDING_EMPTY.phaseZ;
  const phaseFi =
    parsePhaseTriplet(s.phaseFi) ||
    (s.phases
      ? tripletFromPhaseField(s.phases, "phaseAngle")
      : null) ||
    MCA_WINDING_EMPTY.phaseFi;
  const phaseIF =
    parsePhaseTriplet(s.phaseIF) ||
    (s.phases ? tripletFromPhaseField(s.phases, "ifRatio") : null) ||
    MCA_WINDING_EMPTY.phaseIF;

  const windingTempC = finiteNum(s.windingTempC) ?? undefined;
  const ratedHp = finiteNum(s.ratedHp) ?? undefined;

  const ir1m =
    finiteNum(s.ir1mMOmega) ??
    finiteNum(s.reading1Min) ??
    finiteNum(s.reading60s) ??
    finiteNum(s.megohms) ??
    0;
  const ir30s =
    finiteNum(s.ir30sMOmega) ?? finiteNum(s.reading30s) ?? 0;
  const ir10m =
    finiteNum(s.ir10mMOmega) ?? finiteNum(s.reading10Min) ?? 0;
  const ir15s = finiteNum(s.ir15sMOmega) ?? 0;
  const testVoltageV = finiteNum(s.testVoltageV) ?? 0;

  return {
    winding: {
      phaseR,
      phaseL,
      phaseZ,
      phaseFi,
      phaseIF,
      windingTempC,
      ratedHp
    },
    groundwall: {
      ir15sMOmega: ir15s,
      ir30sMOmega: ir30s,
      ir1mMOmega: ir1m,
      ir10mMOmega: ir10m,
      testVoltageV,
      windingTempC,
      insulationClass: parseInsulationClass(s.insulationClass) ?? "F",
      reportPi: finiteNum(s.reportPi) ?? undefined,
      reportDar: finiteNum(s.reportDar) ?? undefined
    }
  };
}

/**
 * Build peaks + telemetry_data for /api/save-analysis-result (analysis_type: mca).
 */
export function mcaPayloadForSave(
  snap: McaOperatorSnapshot | McaExtractedData | null | undefined,
  extras?: {
    primaryFault?: string | null;
    healthScore?: number | null;
    unbalance?: Record<string, number | null | undefined>;
  }
): {
  peaks: unknown[];
  telemetry_data: Record<string, unknown>;
} {
  const { winding, groundwall } = normalizeMcaOperatorSnapshot(snap);
  const snapRec = (snap || {}) as McaOperatorSnapshot & Partial<McaExtractedData>;
  const ricNormalized = sanitizeRicSeries(
    Array.isArray(snapRec.ricData) ? snapRec.ricData : null
  );
  const ricData = ricNormalized.length > 0 ? ricNormalized : null;
  const surgeNormalized = sanitizeSurgeSeries(
    Array.isArray(snapRec.surgeData) ? snapRec.surgeData : null
  );
  const surgeData = surgeNormalized.length >= 2 ? surgeNormalized : null;
  const surgeTestVoltageV = finiteNum(snapRec.surgeTestVoltageV);
  const surgeEar = finiteNum(snapRec.surgeEar);
  const extractMeta =
    snapRec.extractMeta && typeof snapRec.extractMeta === "object"
      ? snapRec.extractMeta
      : null;
  const phases = {
    uv: {
      resistance: winding.phaseR[0],
      inductance: winding.phaseL[0],
      impedance: winding.phaseZ[0],
      phaseAngle: winding.phaseFi[0],
      ifRatio: winding.phaseIF[0]
    },
    vw: {
      resistance: winding.phaseR[1],
      inductance: winding.phaseL[1],
      impedance: winding.phaseZ[1],
      phaseAngle: winding.phaseFi[1],
      ifRatio: winding.phaseIF[1]
    },
    wu: {
      resistance: winding.phaseR[2],
      inductance: winding.phaseL[2],
      impedance: winding.phaseZ[2],
      phaseAngle: winding.phaseFi[2],
      ifRatio: winding.phaseIF[2]
    }
  };

  const peak = {
    type: "mca",
    // Canonical camelCase (Trend Analyzer)
    phaseR: winding.phaseR,
    phaseL: winding.phaseL,
    phaseZ: winding.phaseZ,
    phaseFi: winding.phaseFi,
    phaseIF: winding.phaseIF,
    // snake_case aliases
    phase_r: winding.phaseR,
    phase_l: winding.phaseL,
    phase_z: winding.phaseZ,
    phase_fi: winding.phaseFi,
    phase_if: winding.phaseIF,
    resistance: winding.phaseR,
    inductance: winding.phaseL,
    impedance: winding.phaseZ,
    phase_angle: winding.phaseFi,
    if_ratio: winding.phaseIF,
    winding_temp_c: winding.windingTempC ?? null,
    windingTempC: winding.windingTempC ?? null,
    rated_hp: winding.ratedHp ?? null,
    ratedHp: winding.ratedHp ?? null,
    phases,
    winding: {
      phaseR: winding.phaseR,
      phaseL: winding.phaseL,
      phaseZ: winding.phaseZ,
      phaseFi: winding.phaseFi,
      phaseIF: winding.phaseIF,
      windingTempC: winding.windingTempC ?? null,
      ratedHp: winding.ratedHp ?? null,
      phases
    },
    // Groundwall
    ir15sMOmega: groundwall.ir15sMOmega ?? null,
    ir30sMOmega: groundwall.ir30sMOmega ?? null,
    ir1mMOmega: groundwall.ir1mMOmega ?? null,
    ir10mMOmega: groundwall.ir10mMOmega ?? null,
    ir_15s: groundwall.ir15sMOmega ?? null,
    ir_30s: groundwall.ir30sMOmega ?? null,
    ir_1m: groundwall.ir1mMOmega ?? null,
    ir_10m: groundwall.ir10mMOmega ?? null,
    testVoltageV: groundwall.testVoltageV ?? null,
    test_voltage_v: groundwall.testVoltageV ?? null,
    test_voltage: groundwall.testVoltageV ?? null,
    insulationClass: groundwall.insulationClass ?? null,
    insulation_class: groundwall.insulationClass ?? null,
    groundwall: {
      ir15sMOmega: groundwall.ir15sMOmega ?? null,
      ir30sMOmega: groundwall.ir30sMOmega ?? null,
      ir1mMOmega: groundwall.ir1mMOmega ?? null,
      ir10mMOmega: groundwall.ir10mMOmega ?? null,
      ir_15s: groundwall.ir15sMOmega ?? null,
      ir_30s: groundwall.ir30sMOmega ?? null,
      ir_1m: groundwall.ir1mMOmega ?? null,
      ir_10m: groundwall.ir10mMOmega ?? null,
      testVoltageV: groundwall.testVoltageV ?? null,
      test_voltage_v: groundwall.testVoltageV ?? null,
      test_voltage: groundwall.testVoltageV ?? null,
      windingTempC: groundwall.windingTempC ?? winding.windingTempC ?? null,
      insulationClass: groundwall.insulationClass ?? null,
      insulation_class: groundwall.insulationClass ?? null,
      reportPi: groundwall.reportPi ?? null,
      report_pi: groundwall.reportPi ?? null,
      reportDar: groundwall.reportDar ?? null,
      report_dar: groundwall.reportDar ?? null,
      pi: groundwall.reportPi ?? null,
      dar: groundwall.reportDar ?? null
    },
    insulation: {
      ir15sMOmega: groundwall.ir15sMOmega ?? null,
      ir30sMOmega: groundwall.ir30sMOmega ?? null,
      ir1mMOmega: groundwall.ir1mMOmega ?? null,
      ir10mMOmega: groundwall.ir10mMOmega ?? null,
      ir_30s: groundwall.ir30sMOmega ?? null,
      ir_1m: groundwall.ir1mMOmega ?? null,
      ir_10m: groundwall.ir10mMOmega ?? null,
      testVoltageV: groundwall.testVoltageV ?? null,
      test_voltage: groundwall.testVoltageV ?? null,
      windingTempC: groundwall.windingTempC ?? winding.windingTempC ?? null,
      insulationClass: groundwall.insulationClass ?? null,
      insulation_class: groundwall.insulationClass ?? null,
      reportPi: groundwall.reportPi ?? null,
      reportDar: groundwall.reportDar ?? null,
      pi: groundwall.reportPi ?? null,
      dar: groundwall.reportDar ?? null
    },
    reportPi: groundwall.reportPi ?? null,
    report_pi: groundwall.reportPi ?? null,
    reportDar: groundwall.reportDar ?? null,
    report_dar: groundwall.reportDar ?? null,
    pi: groundwall.reportPi ?? null,
    dar: groundwall.reportDar ?? null,
    ...(ricData
      ? {
          ricData,
          ric_data: ricData,
          rotor_influence: ricData,
          rotorInfluence: ricData
        }
      : {}),
    ...(surgeData
      ? {
          surge: {
            waveform: surgeData,
            test_voltage_v: surgeTestVoltageV,
            testVoltageV: surgeTestVoltageV,
            ear: surgeEar,
            EAR: surgeEar
          },
          surge_waveform: surgeData,
          surgeWaveform: surgeData
        }
      : {}),
    ...(extractMeta ? { extract_meta: extractMeta, extractMeta } : {}),
    ...(extras?.unbalance ? { unbalance: extras.unbalance } : {}),
    ...(extras?.primaryFault ? { primary_fault: extras.primaryFault } : {}),
    ...(extras?.healthScore != null ? { health_score: extras.healthScore } : {})
  };

  const telemetry_data = {
    schema_version: 1,
    captured_at: new Date().toISOString(),
    analysis_type: "mca",
    winding: {
      phaseR: winding.phaseR,
      phaseL: winding.phaseL,
      phaseZ: winding.phaseZ,
      phaseFi: winding.phaseFi,
      phaseIF: winding.phaseIF,
      phase_r: winding.phaseR,
      phase_l: winding.phaseL,
      phase_z: winding.phaseZ,
      phase_fi: winding.phaseFi,
      phase_if: winding.phaseIF,
      resistance: winding.phaseR,
      inductance: winding.phaseL,
      impedance: winding.phaseZ,
      windingTempC: winding.windingTempC ?? null,
      winding_temp_c: winding.windingTempC ?? null,
      ratedHp: winding.ratedHp ?? null,
      rated_hp: winding.ratedHp ?? null,
      phases
    },
    groundwall: {
      ir15sMOmega: groundwall.ir15sMOmega ?? null,
      ir30sMOmega: groundwall.ir30sMOmega ?? null,
      ir1mMOmega: groundwall.ir1mMOmega ?? null,
      ir10mMOmega: groundwall.ir10mMOmega ?? null,
      ir_15s: groundwall.ir15sMOmega ?? null,
      ir_30s: groundwall.ir30sMOmega ?? null,
      ir_1m: groundwall.ir1mMOmega ?? null,
      ir_10m: groundwall.ir10mMOmega ?? null,
      testVoltageV: groundwall.testVoltageV ?? null,
      test_voltage_v: groundwall.testVoltageV ?? null,
      test_voltage: groundwall.testVoltageV ?? null,
      windingTempC: groundwall.windingTempC ?? winding.windingTempC ?? null,
      insulationClass: groundwall.insulationClass ?? null,
      insulation_class: groundwall.insulationClass ?? null,
      reportPi: groundwall.reportPi ?? null,
      report_pi: groundwall.reportPi ?? null,
      reportDar: groundwall.reportDar ?? null,
      report_dar: groundwall.reportDar ?? null,
      pi: groundwall.reportPi ?? null,
      dar: groundwall.reportDar ?? null
    },
    insulation: {
      ir15sMOmega: groundwall.ir15sMOmega ?? null,
      ir30sMOmega: groundwall.ir30sMOmega ?? null,
      ir1mMOmega: groundwall.ir1mMOmega ?? null,
      ir10mMOmega: groundwall.ir10mMOmega ?? null,
      ir_30s: groundwall.ir30sMOmega ?? null,
      ir_1m: groundwall.ir1mMOmega ?? null,
      ir_10m: groundwall.ir10mMOmega ?? null,
      testVoltageV: groundwall.testVoltageV ?? null,
      test_voltage: groundwall.testVoltageV ?? null,
      windingTempC: groundwall.windingTempC ?? winding.windingTempC ?? null,
      insulationClass: groundwall.insulationClass ?? null,
      insulation_class: groundwall.insulationClass ?? null,
      reportPi: groundwall.reportPi ?? null,
      reportDar: groundwall.reportDar ?? null,
      pi: groundwall.reportPi ?? null,
      dar: groundwall.reportDar ?? null
    },
    ...(ricData
      ? {
          ricData,
          ric_data: ricData,
          rotor_influence: ricData,
          rotorInfluence: ricData
        }
      : {}),
    ...(surgeData
      ? {
          surge: {
            waveform: surgeData,
            test_voltage_v: surgeTestVoltageV,
            testVoltageV: surgeTestVoltageV,
            ear: surgeEar,
            EAR: surgeEar
          },
          surge_waveform: surgeData
        }
      : {}),
    ...(extractMeta ? { extract_meta: extractMeta, extractMeta } : {})
  };

  return { peaks: [peak], telemetry_data };
}
