/**
 * prognosticsResolvers — pure data-extraction and threshold-ladder logic for
 * the five prognostics modalities (vibration, thermography, ultrasound, MCA,
 * oil). One computation path shared by the modality tab 4 adapters (drill-down
 * evidence rooms) and ComponentPrognosticsSummary (component front door):
 * pfEngine owns the math, this module owns extraction and provenance only.
 * Pure functions, no React — keeps Fast Refresh exports in .tsx components only.
 */
import type { SavedAnalysisResult, SavedFaultItem } from "../../lib/analysisPersistence";
import { buildFaultHistory, faultFreq } from "../../lib/diagnostics/spectralDiff";
import { peakOfType, resolveTempUnit } from "../../lib/diagnostics/sensorFusion";
import { getPrescription } from "../../lib/maintenance/prescriptiveDictionary";
import {
  extractMcaGroundwallFromSaved,
  extractMcaWindingFromSaved,
  mcaPeakBlob,
} from "../../lib/mca/mcaPersistence";
import { calculateGroundwallInsulation } from "../../lib/mca/groundwallCalculator";
import { percentUnbalance } from "../../lib/mca/windingBalanceCalculator";
import { DEFAULT_ALARM_LIMITS, type OilSample } from "../../types/oilAnalysis";
import {
  ISO_C_D_BOUNDARY,
  MAX_WINDOW_DAYS,
  MIN_POINTS,
  MIN_SPAN_DAYS,
  TREND_GATE_LABEL,
  dayLabel,
  type FWindow,
  type PfDerivation,
  type SeriesCandidate,
  type Threshold,
} from "./pfEngine";

export type PrognosticsModality = "vibration" | "thermography" | "ultrasound" | "mca" | "oil";

export interface RunsSplit {
  assetRuns: SavedAnalysisResult[];
  runs: SavedAnalysisResult[];
}

export type ThresholdKind = "stored" | "named proxy" | "none";

export interface ThresholdResolved {
  threshold: Threshold | null;
  kind: ThresholdKind;
}

export type SummaryVerdict = "CROSSED" | "WINDOW" | "STABLE" | "IMPROVING" | "THIN" | "NO-THRESHOLD";

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const byTime = (x: SavedAnalysisResult, y: SavedAnalysisResult) =>
  new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime();

const longestFirst = (a: SeriesCandidate, b: SeriesCandidate) =>
  b.points.length - a.points.length || b.severityRank - a.severityRank;

function toC(dT: number, unit: "°F" | "°C"): number {
  return unit === "°F" ? dT * (5 / 9) : dT;
}

export function storedDetectionOf(selectedAnalysis: SavedAnalysisResult | null): string | null {
  return (selectedAnalysis?.telemetry_data as Record<string, unknown> | null | undefined)?.detectionDate != null
    ? String((selectedAnalysis.telemetry_data as Record<string, unknown>).detectionDate)
    : null;
}

export function vibrationRuns(
  loadedAnalyses: SavedAnalysisResult[],
  asset: string | null,
  component: string | null,
): RunsSplit {
  const assetRuns = loadedAnalyses
    .filter((r) => (r.analysis_type ?? "vibration") === "vibration" && r.asset_id === asset)
    .sort(byTime);
  return { assetRuns, runs: assetRuns.filter((r) => !component || r.component === component) };
}

function severityRankOf(faults: SavedFaultItem[], title: string): number {
  const hit = faults.find((f) => f.title === title);
  const s = String(hit?.severity ?? "").toLowerCase();
  if (s.includes("critical") || s.includes("high") || s.includes("severe")) return 3;
  if (s.includes("medium") || s.includes("moderate") || s.includes("warning")) return 2;
  if (s.includes("low") || s.includes("minor")) return 1;
  return 0;
}

export function vibrationCandidates(
  runs: SavedAnalysisResult[],
  selectedAnalysis: SavedAnalysisResult | null,
): SeriesCandidate[] {
  const faultList = Array.isArray(selectedAnalysis?.fault_list) ? selectedAnalysis.fault_list : [];
  const history = buildFaultHistory(runs);
  const out: SeriesCandidate[] = [];
  const seen = new Set<string>();

  for (const fh of history) {
    const hz = fh.frequencyHz;
    const id = hz != null ? `${fh.title}@${hz.toFixed(1)}` : fh.title;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: hz != null ? `${fh.title} ${hz.toFixed(2)} Hz` : fh.title,
      unit: "mm/s",
      points: fh.series.map((s) => ({ value: s.amplitude, date: s.ts })),
      severityRank: severityRankOf(faultList, fh.title),
      worsening: "increase",
    });
  }

  for (const f of faultList) {
    const hz = faultFreq(f);
    const id = hz != null ? `${f.title}@${hz.toFixed(1)}` : f.title;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: hz != null ? `${f.title} ${hz.toFixed(2)} Hz` : f.title,
      unit: "mm/s",
      points: [],
      severityRank: severityRankOf(faultList, f.title),
      worsening: "increase",
    });
  }

  return out;
}

export function vibrationThreshold(
  candidates: SeriesCandidate[],
  overrideId: string | null,
  selectedAnalysis: SavedAnalysisResult | null,
): ThresholdResolved {
  const faultList = Array.isArray(selectedAnalysis?.fault_list) ? selectedAnalysis.fault_list : [];
  const selected = candidates.find((c) => c.id === overrideId)
    ?? candidates.slice().sort(longestFirst)[0]
    ?? null;
  const title = selected ? selected.label.replace(/\s+[\d.]+\s*Hz$/, "") : faultList[0]?.title ?? null;
  const siteAlarm = title ? getPrescription(title).severityZones.alarm ?? null : null;
  if (siteAlarm != null) {
    return {
      threshold: { value: siteAlarm, provenance: "stored site alarm (prescriptive dictionary severity zones)" },
      kind: "stored",
    };
  }
  return {
    threshold: {
      value: ISO_C_D_BOUNDARY,
      provenance: "site-practice proxy - not a stored functional limit (ISO 20816 zone C/D boundary)",
    },
    kind: "named proxy",
  };
}

export function thermographyRuns(
  loadedAnalyses: SavedAnalysisResult[],
  asset: string | null,
  component: string | null,
): RunsSplit {
  const assetRuns = loadedAnalyses
    .filter((r) => (r.analysis_type ?? "").toLowerCase() === "thermography" && r.asset_id === asset)
    .sort(byTime);
  return { assetRuns, runs: assetRuns.filter((r) => !component || r.component === component) };
}

export function thermographyCandidates(runs: SavedAnalysisResult[]): SeriesCandidate[] {
  const dT: { value: number; date: string }[] = [];
  const hs: { value: number; date: string }[] = [];
  const i2r: { value: number; date: string }[] = [];
  let maxSev = 0;
  for (const r of runs) {
    const peak = peakOfType(r, "thermography") ?? (Array.isArray(r.peaks) ? r.peaks[0] as Record<string, unknown> : null);
    const unit = resolveTempUnit(r) ?? "°F";
    const dTRaw = num(peak?.delta_t ?? peak?.deltaT);
    if (dTRaw != null) dT.push({ value: toC(dTRaw, unit), date: r.timestamp });
    const hsRaw = num(peak?.hotspot_temp ?? peak?.hotspotTemp);
    if (hsRaw != null) hs.push({ value: unit === "°F" ? (hsRaw - 32) * (5 / 9) : hsRaw, date: r.timestamp });
    const i2rRaw = num(r.i2r_normalized_delta_t);
    if (i2rRaw != null) i2r.push({ value: i2rRaw, date: r.timestamp });
    if (num(r.max_allowable_limit) != null) maxSev = Math.max(maxSev, 1);
  }
  const out: SeriesCandidate[] = [];
  if (dT.length) out.push({ id: "ir-delta-t", label: "ΔT P-P at tracked hotspot", unit: "°C", points: dT, severityRank: 3 + maxSev, worsening: "increase" });
  if (hs.length) out.push({ id: "ir-hotspot", label: "Hotspot temperature", unit: "°C", points: hs, severityRank: 2, worsening: "increase" });
  if (i2r.length) out.push({ id: "ir-i2r", label: "I²R normalized ΔT", unit: "°C", points: i2r, severityRank: 1, worsening: "increase" });
  return out;
}

export function thermographyThreshold(
  candidates: SeriesCandidate[],
  overrideId: string | null,
  selectedAnalysis: SavedAnalysisResult | null,
): ThresholdResolved {
  void overrideId;
  const stored =
    num(selectedAnalysis?.max_allowable_limit) ??
    num((peakOfType(selectedAnalysis ?? ({} as SavedAnalysisResult), "thermography") as Record<string, unknown> | null)?.max_allowable_limit);
  if (stored != null && stored > 0) {
    return {
      threshold: { value: stored, provenance: "stored max_allowable_limit (analysis row / peaks)" },
      kind: "stored",
    };
  }
  if (candidates.some((c) => c.id === "ir-delta-t")) {
    return {
      threshold: {
        value: 15,
        provenance: "site-practice proxy — NFPA 70B/NETA Class 1 ΔT boundary (15 °C), not a stored functional limit",
      },
      kind: "named proxy",
    };
  }
  return { threshold: null, kind: "none" };
}

export function ultrasoundRuns(
  loadedAnalyses: SavedAnalysisResult[],
  asset: string | null,
  component: string | null,
): RunsSplit {
  const assetRuns = loadedAnalyses
    .filter((r) => (r.analysis_type ?? "").toLowerCase() === "ultrasound" && r.asset_id === asset)
    .sort(byTime);
  return { assetRuns, runs: assetRuns.filter((r) => !component || r.component === component) };
}

export function ultrasoundCandidates(runs: SavedAnalysisResult[]): SeriesCandidate[] {
  const peak: { value: number; date: string }[] = [];
  const delta: { value: number; date: string }[] = [];
  const rms: { value: number; date: string }[] = [];
  for (const r of runs) {
    const p = peakOfType(r, "ultrasound") ?? (Array.isArray(r.peaks) ? r.peaks[0] as Record<string, unknown> : null);
    const peakDb = num(p?.peak_dbmv ?? p?.peak_dbuv);
    const baseline = num(p?.baseline_dbmv ?? p?.baseline_dbuv);
    const storedDelta = num(p?.delta_db);
    const rmsDb = num(p?.rms_dbmv ?? p?.rms_dbuv);
    if (peakDb != null) peak.push({ value: peakDb, date: r.timestamp });
    if (rmsDb != null) rms.push({ value: rmsDb, date: r.timestamp });
    const d = storedDelta ?? (peakDb != null && baseline != null ? Math.round((peakDb - baseline) * 10) / 10 : null);
    if (d != null) delta.push({ value: d, date: r.timestamp });
  }
  const out: SeriesCandidate[] = [];
  if (delta.length) out.push({ id: "us-delta-db", label: "ΔdB over baseline", unit: "dB", points: delta, severityRank: 3, worsening: "increase" });
  if (peak.length) out.push({ id: "us-peak-db", label: "Peak level", unit: "dBmV", points: peak, severityRank: 2, worsening: "increase" });
  if (rms.length) out.push({ id: "us-rms-db", label: "RMS level", unit: "dBmV", points: rms, severityRank: 1, worsening: "increase" });
  return out;
}

export function ultrasoundThreshold(
  candidates: SeriesCandidate[],
  overrideId: string | null,
): ThresholdResolved {
  const sel = candidates.find((c) => c.id === overrideId)
    ?? candidates.slice().sort(longestFirst)[0]
    ?? null;
  if (sel?.id === "us-delta-db") {
    return {
      threshold: {
        value: 16,
        provenance: "site-practice proxy — UE Systems bearing-condition ladder Class 1 boundary (+16 dB), not a stored functional limit",
      },
      kind: "named proxy",
    };
  }
  return { threshold: null, kind: "none" };
}

export function mcaRuns(
  loadedAnalyses: SavedAnalysisResult[],
  asset: string | null,
  component: string | null,
): RunsSplit {
  const assetRuns = loadedAnalyses
    .filter((r) => (r.analysis_type ?? "").toLowerCase() === "mca" && r.asset_id === asset)
    .sort(byTime);
  return { assetRuns, runs: assetRuns.filter((r) => !component || r.component === component) };
}

function imbalanceFor(r: SavedAnalysisResult): number | null {
  const blob = mcaPeakBlob(r);
  const winding = extractMcaWindingFromSaved(r);
  const stored = num(blob.imbalance_pct ?? blob.imbalancePct ?? blob.max_unbalance_rl ?? blob.maxUnbalanceRl);
  if (stored != null) return stored;
  if (winding.fromTelemetry) {
    return Math.max(
      percentUnbalance(winding.phaseR),
      percentUnbalance(winding.phaseL),
      percentUnbalance(winding.phaseZ),
    );
  }
  return null;
}

export function mcaCandidates(runs: SavedAnalysisResult[]): SeriesCandidate[] {
  const imb: { value: number; date: string }[] = [];
  const ir: { value: number; date: string }[] = [];
  let maxImb = 0;
  let minIr = Infinity;
  for (const r of runs) {
    const u = imbalanceFor(r);
    if (u != null) {
      imb.push({ value: u, date: r.timestamp });
      maxImb = Math.max(maxImb, u);
    }
    const gw = extractMcaGroundwallFromSaved(r);
    const irV = gw.ir1mMOmega != null && gw.ir1mMOmega > 0 ? gw.ir1mMOmega : null;
    if (irV != null) {
      ir.push({ value: irV, date: r.timestamp });
      minIr = Math.min(minIr, irV);
    }
  }
  const out: SeriesCandidate[] = [];
  if (imb.length) {
    out.push({
      id: "mca-imbalance",
      label: "Current unbalance",
      unit: "%",
      points: imb,
      severityRank: Math.round(maxImb * 10),
      worsening: "increase",
    });
  }
  if (ir.length) {
    out.push({
      id: "mca-ir",
      label: "Insulation resistance (IR 1 min)",
      unit: "MΩ",
      points: ir,
      severityRank: Number.isFinite(minIr) ? Math.max(0, 100 - Math.round(minIr)) : 0,
      worsening: "decrease",
    });
  }
  return out;
}

export function mcaThreshold(
  candidates: SeriesCandidate[],
  overrideId: string | null,
  runs: SavedAnalysisResult[],
): ThresholdResolved {
  const sel = candidates.find((c) => c.id === overrideId)
    ?? candidates.slice().sort(longestFirst)[0]
    ?? null;
  if (sel?.id === "mca-imbalance") {
    return {
      threshold: {
        value: 8,
        provenance: "site-practice proxy — NEMA MG-1 Class 1 unbalance boundary (8 %), not a stored functional limit; no ISO severity standard exists for MCA",
      },
      kind: "named proxy",
    };
  }
  if (sel?.id === "mca-ir") {
    const last = runs[runs.length - 1];
    const gw = last ? extractMcaGroundwallFromSaved(last) : null;
    if (gw && gw.ir1mMOmega != null && gw.ir1mMOmega > 0 && gw.testVoltageV != null && gw.testVoltageV > 0) {
      const result = calculateGroundwallInsulation({
        ir1mMOmega: gw.ir1mMOmega,
        ir15sMOmega: gw.ir15sMOmega,
        ir30sMOmega: gw.ir30sMOmega,
        ir10mMOmega: gw.ir10mMOmega,
        testVoltageV: gw.testVoltageV,
        windingTempC: gw.windingTempC,
        insulationClass: gw.insulationClass,
      });
      if (result.hasData && result.irIeeeMinMOmega > 0) {
        return {
          threshold: {
            value: result.irIeeeMinMOmega,
            provenance: "IEEE 43 minimum (groundwall calculator irIeeeMinMOmega from test voltage / winding class)",
          },
          kind: "named proxy",
        };
      }
    }
    return { threshold: null, kind: "none" };
  }
  return { threshold: null, kind: "none" };
}

export function resolveOilAssetId(
  equipmentAssetId: string | null | undefined,
  selectedAnalysis: SavedAnalysisResult | null,
  loadedAnalyses: SavedAnalysisResult[],
): string | null {
  return equipmentAssetId ?? selectedAnalysis?.asset_id ?? (() => {
    if (!loadedAnalyses?.length) return null;
    const ids = [...new Set(loadedAnalyses.map((r) => r.asset_id).filter(Boolean))];
    return ids.length === 1 ? ids[0]! : null;
  })();
}

interface ElementDef {
  key: keyof OilSample;
  symbol: string;
  label: string;
  alarmKey: keyof OilSample;
  defaultLimit: number;
}

const ELEMENTS: ElementDef[] = [
  { key: "iron", symbol: "Fe", label: "Iron", alarmKey: "ironAlarmLimit", defaultLimit: DEFAULT_ALARM_LIMITS.iron },
  { key: "copper", symbol: "Cu", label: "Copper", alarmKey: "copperAlarmLimit", defaultLimit: DEFAULT_ALARM_LIMITS.copper },
  { key: "chromium", symbol: "Cr", label: "Chromium", alarmKey: "chromiumAlarmLimit", defaultLimit: DEFAULT_ALARM_LIMITS.chromium },
  { key: "lead", symbol: "Pb", label: "Lead", alarmKey: "leadAlarmLimit", defaultLimit: DEFAULT_ALARM_LIMITS.lead },
  { key: "aluminum", symbol: "Al", label: "Aluminum", alarmKey: "aluminumAlarmLimit", defaultLimit: DEFAULT_ALARM_LIMITS.aluminum },
  { key: "silicon", symbol: "Si", label: "Silicon", alarmKey: "siliconAlarmLimit", defaultLimit: DEFAULT_ALARM_LIMITS.silicon },
];

function numVal(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function oilCandidates(sorted: OilSample[]): SeriesCandidate[] {
  const out: SeriesCandidate[] = [];
  for (const el of ELEMENTS) {
    const points: { value: number; date: string }[] = [];
    let maxRatio = 0;
    let storedLimit = false;
    for (const s of sorted) {
      const v = numVal(s[el.key]);
      if (v == null) continue;
      points.push({ value: v, date: s.sampleDate });
      const lim = numVal(s[el.alarmKey]) ?? el.defaultLimit;
      if (numVal(s[el.alarmKey]) != null) storedLimit = true;
      if (lim > 0) maxRatio = Math.max(maxRatio, v / lim);
    }
    if (!points.length) continue;
    out.push({
      id: `oil-${el.key}`,
      label: `${el.symbol} — ${el.label}`,
      unit: "ppm",
      points,
      severityRank: Math.round(maxRatio * 10) + (storedLimit ? 1 : 0),
      worsening: "increase",
    });
  }
  return out.sort(longestFirst);
}

export function oilThreshold(
  candidates: SeriesCandidate[],
  overrideId: string | null,
  sorted: OilSample[],
): ThresholdResolved {
  const sel = candidates.find((c) => c.id === overrideId) ?? candidates[0] ?? null;
  if (!sel) return { threshold: null, kind: "none" };
  const key = sel.id.replace(/^oil-/, "") as keyof OilSample;
  const alarmKey = (`${key}AlarmLimit` in (sorted[0] ?? {}) ? `${key}AlarmLimit` : null) as keyof OilSample | null;
  const latest = sorted[sorted.length - 1];
  const stored = latest && alarmKey ? numVal(latest[alarmKey]) : null;
  if (stored != null && stored > 0) {
    return {
      threshold: { value: stored, provenance: `stored ${String(alarmKey)} on latest oil sample (oil_samples)` },
      kind: "stored",
    };
  }
  const def = ELEMENTS.find((e) => e.key === key)?.defaultLimit;
  if (def != null && def > 0) {
    return {
      threshold: { value: def, provenance: "DEFAULT_ALARM_LIMITS (lab/OEM practice defaults in oilAnalysis.ts)" },
      kind: "named proxy",
    };
  }
  return { threshold: null, kind: "none" };
}

export function fWindowSentence(fWindow: FWindow | null, thr: Threshold | null): string | null {
  if (!fWindow || !thr) return null;
  return fWindow.median >= 0
    ? `F window: ${dayLabel(fWindow.lower)}–${dayLabel(fWindow.upper)} from today, median ${
        Number.isFinite(fWindow.median) ? `${Math.round(fWindow.median)} days` : `Unconstrained (>${MAX_WINDOW_DAYS}d)`
      }`
    : fWindow.upper < 0
      ? `F window: already crossed (median ~${Math.abs(Math.round(fWindow.median))} days ago, upper ~${Math.abs(Math.round(fWindow.upper))} days ago)`
      : `F window: median already crossed (~${Math.abs(Math.round(fWindow.median))} days ago) - upper bound in ~${Math.round(fWindow.upper)} days`;
}

export function summaryVerdict(d: PfDerivation): SummaryVerdict {
  if (d.verdict === "window") {
    return d.fWindow && d.fWindow.median < 0 ? "CROSSED" : "WINDOW";
  }
  if (d.verdict === "stable") return "STABLE";
  if (d.verdict === "improving") return "IMPROVING";
  if (d.verdict === "thin") return "THIN";
  return "NO-THRESHOLD";
}

export function summarySentence(d: PfDerivation): string {
  const slopeTxt = d.fit ? `${d.fit.slope.toFixed(4)} ${d.unit || "units"} per day` : "not computed";
  const seTxt = d.fit ? `± ${d.fit.seOfSlope.toFixed(4)}` : "—";
  if (d.verdict === "thin") {
    return `degradation trend not established - ${d.n} points over ${Math.round(d.spanDays)} days (minimum ${MIN_POINTS} over ${MIN_SPAN_DAYS} days)`;
  }
  if (d.verdict === "stable") {
    return `no degradation trend - slope ${slopeTxt} (SE ${seTxt}) not statistically distinguishable from flat (${TREND_GATE_LABEL}); RUL not computed`;
  }
  if (d.verdict === "improving") {
    return `trend improving - significant slope in the healthy direction: ${slopeTxt} (SE ${seTxt}); no RUL computed (no degradation trend to project)`;
  }
  if (d.verdict === "no-threshold") {
    return `no functional threshold stored - slope only, no F window`;
  }
  return fWindowSentence(d.fWindow, d.functionalThreshold) ?? `F window unavailable - no functional threshold stored`;
}
