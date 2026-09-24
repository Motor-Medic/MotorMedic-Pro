import React, { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { getPrescription } from "../../lib/maintenance/prescriptiveDictionary";
import { buildFaultHistory, faultFreq } from "../../lib/diagnostics/spectralDiff";

interface VibrationPrognosticsTabProps {
  isActive: boolean;
  selectedAnalysis: SavedAnalysisResult | null;
  loadedAnalyses: SavedAnalysisResult[];
}

interface SeriesPoint {
  day: number;
  value: number;
  date: string;
}

const MIN_POINTS = 4;
const MIN_SPAN_DAYS = 30;
const ISO_C_D_BOUNDARY = 7.1;
const MAX_WINDOW_DAYS = 180;

function leastSquares(pts: SeriesPoint[]): { slope: number; intercept: number; stdErr: number; seOfSlope: number } | null {
  const n = pts.length;
  if (n < 2) return null;
  const meanX = pts.reduce((s, p) => s + p.day, 0) / n;
  const meanY = pts.reduce((s, p) => s + p.value, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.day - meanX) ** 2;
    sxy += (p.day - meanX) * (p.value - meanY);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  let sse = 0;
  for (const p of pts) {
    const pred = intercept + slope * p.day;
    sse += (p.value - pred) ** 2;
  }
  const se = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  const seOfSlope = sxx > 0 ? se / Math.sqrt(sxx) : 0;
  return { slope, intercept, stdErr: se, seOfSlope };
}

function daysFromIso(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 86400000;
}

function dayLabel(days: number): string {
  if (!Number.isFinite(days)) return "—";
  if (days > MAX_WINDOW_DAYS) return `Unconstrained (>${MAX_WINDOW_DAYS}d)`;
  if (days < 0) return "already crossed";
  return `${Math.round(days)} days`;
}

function findDetectionDate(pts: SeriesPoint[], functional: number, storedDetection: string | null): string | null {
  if (storedDetection) return storedDetection;
  for (const p of pts) {
    if (p.value >= functional) return p.date;
  }
  return null;
}

export default function VibrationPrognosticsTab({ isActive, selectedAnalysis, loadedAnalyses }: VibrationPrognosticsTabProps) {
  const [epoch, setEpoch] = useState(0);

  const asset = selectedAnalysis?.asset_id ?? null;
  const component = selectedAnalysis?.component ?? null;

  useEffect(() => {
    if (isActive) setEpoch((e) => e + 1);
  }, [isActive, asset, component]);

  const derivation = useMemo(() => {
    void epoch;
    const runs = loadedAnalyses
      .filter((r) => (r.analysis_type ?? "vibration") === "vibration" && r.asset_id === asset && (!component || r.component === component))
      .sort((x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime());

    const topFault = Array.isArray(selectedAnalysis?.fault_list) && selectedAnalysis.fault_list.length
      ? selectedAnalysis.fault_list[0]
      : null;
    const trackedHz = topFault ? faultFreq(topFault) : null;

    let seriesLabel = trackedHz != null
      ? `peak amplitude at ${trackedHz.toFixed(1)} Hz — mm/s at tracked Hz`
      : "no tracked fault frequency on this record — series unavailable";
    let pts: SeriesPoint[] = [];

    if (trackedHz != null) {
      const fh = buildFaultHistory(runs).find((e) => e.frequencyHz != null && Math.abs(e.frequencyHz - trackedHz) <= Math.max(2, trackedHz * 0.02));
      if (fh) {
        pts = fh.series.map((s) => ({ day: 0, value: s.amplitude, date: s.ts }));
        seriesLabel = `peak amplitude at ${fh.frequencyHz?.toFixed(1) ?? trackedHz.toFixed(1)} Hz — mm/s at tracked Hz`;
      }
    }

    if (pts.length >= 2) {
      const t0 = new Date(pts[0].date).getTime();
      pts = pts.map((p) => ({ ...p, day: (new Date(p.date).getTime() - t0) / 86400000 }));
    }

    const n = pts.length;
    const spanDays = n >= 2 ? pts[n - 1].day - pts[0].day : 0;
    const fit = n >= 2 ? leastSquares(pts) : null;

    const siteAlarm = topFault ? getPrescription(topFault.title).severityZones.alarm ?? null : null;

    const functionalThreshold = siteAlarm != null
      ? { value: siteAlarm, provenance: "stored site alarm (prescriptive dictionary severity zones)" }
      : { value: ISO_C_D_BOUNDARY, provenance: "site-practice proxy - not a stored functional limit (ISO 20816 zone C/D boundary)" };

    const storedDetection =
      (selectedAnalysis?.telemetry_data as Record<string, unknown> | null | undefined)?.detectionDate != null
        ? String((selectedAnalysis.telemetry_data as Record<string, unknown>).detectionDate)
        : null;

    const detectionDate = pts.length > 0 ? findDetectionDate(pts, functionalThreshold.value, storedDetection) : null;

    const g9Pass = n >= MIN_POINTS && spanDays >= MIN_SPAN_DAYS;
    const slopeGatePass = fit != null && fit.slope > 0;

    let fWindow: { lower: number; upper: number; median: number } | null = null;
    let rulLabel: string | null = null;
    if (g9Pass && slopeGatePass && fit) {
      const last = pts[n - 1];
      const remaining = functionalThreshold.value - last.value;
      const slopeMain = fit.slope;
      const slopeFast = fit.slope + fit.seOfSlope;
      const slopeSlow = fit.slope - fit.seOfSlope;
      const toDays = (sl: number): number => {
        if (!Number.isFinite(sl) || sl <= 0) return Infinity;
        return remaining / sl;
      };
      const dMed = toDays(slopeMain);
      const dFast = toDays(slopeFast);
      const dSlow = toDays(slopeSlow);
      fWindow = {
        lower: dFast,
        upper: dSlow <= 0 || !Number.isFinite(dSlow) ? Infinity : dSlow,
        median: dMed,
      };
      rulLabel = Number.isFinite(dMed) ? dayLabel(dMed) : `Unconstrained (>${MAX_WINDOW_DAYS}d)`;
    }

    return {
      seriesLabel,
      pts,
      n,
      spanDays,
      fit,
      functionalThreshold,
      detectionDate,
      g9Pass,
      slopeGatePass,
      fWindow,
      rulLabel,
      component,
      asset,
    };
  }, [loadedAnalyses, asset, component, selectedAnalysis, epoch]);

  const {
    seriesLabel, pts, n, spanDays, fit,
    functionalThreshold, detectionDate,
    g9Pass, slopeGatePass, fWindow, rulLabel,
  } = derivation;

  const watchlist = useMemo(() => {
    const open = loadedAnalyses
      .filter((r) => (r.analysis_type ?? "vibration") === "vibration" && r.asset_id === asset && (!component || r.component === component))
      .slice(-3)
      .map((r) => `${r.asset_id ?? "unknown"} (${r.primary_fault ?? "no primary fault"})`);
    return open.length ? open.join(", ") : "none for this component";
  }, [loadedAnalyses, asset, component]);

  if (!isActive) return null;

  const slopeTxt = fit ? `${fit.slope.toFixed(4)} mm/s per day` : "not computed";
  const seTxt = fit ? `± ${fit.seOfSlope.toFixed(4)}` : "—";

  const yMin = pts.length ? Math.min(...pts.map((p) => p.value), functionalThreshold.value) * 0.95 : 0;
  const yMax = pts.length ? Math.max(...pts.map((p) => p.value), functionalThreshold.value) * 1.05 : 1;
  const xMax = Math.max(spanDays, 1);

  const pathFor = (k: number): string => {
    if (!fit) return "";
    return pts.map((p, i) => {
      const x = (p.day / xMax) * 360;
      const y = 120 - ((fit.intercept + fit.slope * p.day + k * fit.seOfSlope) - yMin) / (yMax - yMin) * 100;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${Math.max(5, Math.min(115, y)).toFixed(1)}`;
    }).join(" ");
  };

  const bandPath = fit && pts.length >= 2
    ? `${pathFor(1)} ${[...pts].reverse().map((p) => {
        const x = (p.day / xMax) * 360;
        const y = 120 - ((fit.intercept + fit.slope * p.day - fit.seOfSlope) - yMin) / (yMax - yMin) * 100;
        return `L${x.toFixed(1)},${Math.max(5, Math.min(115, y)).toFixed(1)}`;
      }).join(" ")} Z`
    : "";

  const fWindowTxt = fWindow
    ? `F window: ${dayLabel(fWindow.lower)}–${dayLabel(fWindow.upper)} from today, median ${
        Number.isFinite(fWindow.median) ? `${Math.round(fWindow.median)} days` : `Unconstrained (>${MAX_WINDOW_DAYS}d)`
      }`
    : null;

  return (
    <div className="space-y-4 p-4">
      <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3 space-y-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <Clock className="h-3 w-3" />Basis
        </div>
        <p className="text-xs text-slate-300">
          Series: <span className="text-white">{seriesLabel}</span> · N = {n} points over {spanDays.toFixed(1)} days (fractional day offsets from stored timestamps)
        </p>
        <p className="text-xs text-slate-400">
          Least-squares slope: <span className="font-mono text-white">{slopeTxt}</span> (SE of slope {seTxt}) · fit note: ordinary linear regression on stored timestamps; not a physics failure model
        </p>
        <p className="text-xs text-slate-400">
          Detection point:{" "}
          {detectionDate
            ? <span className="text-amber-300">{new Date(detectionDate).toLocaleDateString()}</span>
            : <span className="italic text-slate-500">no threshold crossing on record</span>}
        </p>
        <p className="text-xs text-slate-400">
          Functional threshold: <span className="text-white font-mono">{functionalThreshold.value} mm/s</span> — {functionalThreshold.provenance}
        </p>
      </div>

      {!g9Pass ? (
        <p className="text-xs italic text-amber-400 border-l-2 border-amber-400/40 pl-3">
          degradation trend not established - {n} points over {Math.round(spanDays)} days (minimum {MIN_POINTS} over {MIN_SPAN_DAYS})
        </p>
      ) : !slopeGatePass ? (
        <p className="text-xs italic text-emerald-400 border-l-2 border-emerald-400/40 pl-3">
          no degradation trend - slope flat or improving; RUL not computed
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-300">
            P marker: {detectionDate ? new Date(detectionDate).toLocaleDateString() : "no stored detection date"} · current value:{" "}
            <span className="font-mono text-white">{pts.length ? pts[pts.length - 1].value.toFixed(2) : "—"} mm/s</span>
          </p>
          {fWindowTxt && <p className="text-xs text-amber-300">{fWindowTxt}</p>}
          <p className="text-[11px] text-slate-500 italic">
            RUL: {rulLabel ?? "—"} — modeled projection (G8) - not a measurement
          </p>
          <svg viewBox="0 0 360 130" className="w-full h-32 bg-slate-950/60 rounded border border-slate-800" role="img" aria-label="P-F curve with uncertainty band">
            <line x1="0" y1="120" x2="360" y2="120" stroke="#334155" strokeWidth="1" />
            <line x1="0" y1="10" x2="0" y2="120" stroke="#334155" strokeWidth="1" />
            <path d={bandPath} fill="rgba(251,191,36,0.15)" stroke="none" />
            <path d={pathFor(0)} fill="none" stroke="#fbbf24" strokeWidth="1.5" />
            <line
              x1="0"
              y1={Math.max(5, Math.min(115, 120 - (functionalThreshold.value - yMin) / (yMax - yMin) * 100))}
              x2="360"
              y2={Math.max(5, Math.min(115, 120 - (functionalThreshold.value - yMin) / (yMax - yMin) * 100))}
              stroke="#f87171"
              strokeDasharray="4 3"
              strokeWidth="1"
            />
            {detectionDate && (
              <circle
                cx={(pts.length ? pts[0].day : 0)}
                cy={pts.length ? Math.max(5, Math.min(115, 120 - (pts[0].value - yMin) / (yMax - yMin) * 100)) : 60}
                r="4"
                fill="#38bdf8"
              />
            )}
            <text x="6" y="18" fill="#94a3b8" fontSize="8">P (detection)</text>
            <text x="300" y="18" fill="#f87171" fontSize="8">F (functional)</text>
            <text x="6" y="128" fill="#64748b" fontSize="7">t0</text>
            <text x="330" y="128" fill="#64748b" fontSize="7">t (days)</text>
          </svg>
        </div>
      )}

      <footer className="border-t border-slate-800 pt-3 space-y-1">
        <p className="text-[10px] text-slate-500 italic">
          Projections are modeled estimates from stored history (G8) — not measurements. Absence of sufficient history is confessed, not extrapolated (G9). Guidance flags are guidance, not diagnoses.
        </p>
        <p className="text-[10px] text-slate-500">Watchlist: {watchlist}</p>
      </footer>
    </div>
  );
}
