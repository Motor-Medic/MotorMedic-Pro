/**
 * InfraredPrognosticsTab — thermography P-F window (thin adapter over pfEngine).
 * Series: ΔT P-P at tracked hotspot (°C), hotspot temp, optional I²R ΔT.
 * Threshold: stored max_allowable_limit, else NFPA 70B/NETA Class 1 proxy,
 * else confess (slope only). G8/G9 via engine; comparison tools remain
 * vibration-only this slice (declared).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Flame } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { peakOfType, resolveTempUnit } from "../../lib/diagnostics/sensorFusion";
import {
  MIN_POINTS,
  MIN_SPAN_DAYS,
  MAX_WINDOW_DAYS,
  dayLabel,
  derivePf,
  type SeriesCandidate,
  type Threshold,
} from "./pfEngine";

interface Props {
  isActive: boolean;
  selectedAnalysis: SavedAnalysisResult | null;
  loadedAnalyses: SavedAnalysisResult[];
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function toC(dT: number, unit: "°F" | "°C"): number {
  return unit === "°F" ? dT * (5 / 9) : dT;
}

export default function InfraredPrognosticsTab({ isActive, selectedAnalysis, loadedAnalyses }: Props) {
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const asset = selectedAnalysis?.asset_id ?? null;
  const component = selectedAnalysis?.component ?? null;

  useEffect(() => {
    setOverrideId(null);
  }, [asset, component, selectedAnalysis?.id]);

  const runs = useMemo(() => {
    if (!isActive) return [];
    return loadedAnalyses
      .filter((r) => (r.analysis_type ?? "").toLowerCase() === "thermography" && r.asset_id === asset && (!component || r.component === component))
      .sort((x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime());
  }, [isActive, loadedAnalyses, asset, component]);

  const candidates = useMemo<SeriesCandidate[]>(() => {
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
  }, [runs]);

  const threshold = useMemo<Threshold | null>(() => {
    const stored =
      num(selectedAnalysis?.max_allowable_limit) ??
      num((peakOfType(selectedAnalysis ?? ({} as SavedAnalysisResult), "thermography") as Record<string, unknown> | null)?.max_allowable_limit);
    if (stored != null && stored > 0) {
      return { value: stored, provenance: "stored max_allowable_limit (analysis row / peaks)" };
    }
    if (candidates.some((c) => c.id === "ir-delta-t")) {
      return {
        value: 15,
        provenance: "site-practice proxy — NFPA 70B/NETA Class 1 ΔT boundary (15 °C), not a stored functional limit",
      };
    }
    return null;
  }, [selectedAnalysis, candidates]);

  const derivation = useMemo(() => {
    const storedDetection =
      (selectedAnalysis?.telemetry_data as Record<string, unknown> | null | undefined)?.detectionDate != null
        ? String((selectedAnalysis.telemetry_data as Record<string, unknown>).detectionDate)
        : null;
    return derivePf({ candidates, overrideId, threshold, storedDetection });
  }, [candidates, overrideId, threshold, selectedAnalysis]);

  const { seriesLabel, unit, pts, n, spanDays, fit, functionalThreshold, detectionDate, g9Pass, slopeGatePass, fWindow, rulLabel, selectionNote, candidateSummaries, worsening } = derivation;

  if (!isActive) return null;

  const thr = functionalThreshold;
  const slopeTxt = fit ? `${fit.slope.toFixed(4)} ${unit || "°C"} per day` : "not computed";
  const seTxt = fit ? `± ${fit.seOfSlope.toFixed(4)}` : "—";
  const yMin = pts.length && thr ? Math.min(...pts.map((p) => p.value), thr.value) * 0.95 : pts.length ? Math.min(...pts.map((p) => p.value)) * 0.95 : 0;
  const yMax = pts.length && thr ? Math.max(...pts.map((p) => p.value), thr.value) * 1.05 : pts.length ? Math.max(...pts.map((p) => p.value)) * 1.05 : 1;
  const xMax = Math.max(spanDays, 1);
  const pathFor = (k: number): string => {
    if (!fit) return "";
    return pts.map((p, i) => {
      const x = (p.day / xMax) * 360;
      const y = 120 - ((fit.intercept + fit.slope * p.day + k * fit.seOfSlope) - yMin) / (yMax - yMin || 1) * 100;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${Math.max(5, Math.min(115, y)).toFixed(1)}`;
    }).join(" ");
  };
  const bandPath = fit && pts.length >= 2
    ? `${pathFor(1)} ${[...pts].reverse().map((p) => {
        const x = (p.day / xMax) * 360;
        const y = 120 - ((fit.intercept + fit.slope * p.day - fit.seOfSlope) - yMin) / (yMax - yMin || 1) * 100;
        return `L${x.toFixed(1)},${Math.max(5, Math.min(115, y)).toFixed(1)}`;
      }).join(" ")} Z`
    : "";
  const fWindowTxt = fWindow && thr
    ? `F window: ${dayLabel(fWindow.lower)}–${dayLabel(fWindow.upper)} from today, median ${
        Number.isFinite(fWindow.median) ? `${Math.round(fWindow.median)} days` : `Unconstrained (>${MAX_WINDOW_DAYS}d)`
      }`
    : null;

  if (!candidates.length) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4">
        <Flame className="h-8 w-8 text-slate-600 mb-3" />
        <p className="text-sm font-semibold text-slate-300">No IR series stored for this component</p>
        <p className="text-xs text-slate-500 mt-1">Run a thermography inspection to seed the P-F series.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3 space-y-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Basis</div>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <span className="shrink-0">Series</span>
          <select
            value={overrideId ?? ""}
            onChange={(e) => setOverrideId(e.target.value || null)}
            className="h-7 flex-1 min-w-0 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/60"
          >
            <option value="">default — longest history (largest N)</option>
            {candidateSummaries.map((c) => (
              <option key={c.id} value={c.id}>{c.label} (N = {c.n})</option>
            ))}
          </select>
        </label>
        <p className="text-xs text-slate-300">
          Series: <span className="text-white">{seriesLabel}</span> · {selectionNote}
        </p>
        <p className="text-xs text-slate-300">
          N = {n} over {spanDays.toFixed(1)} days (fractional day offsets) · unit: {unit || "°C"} · worsening: {worsening}
        </p>
        <p className="text-xs text-slate-400">
          Slope: <span className="font-mono text-white">{slopeTxt}</span> (SE {seTxt}) · ordinary linear regression; not a physics failure model
        </p>
        <p className="text-xs text-slate-400">
          Detection: {detectionDate ? <span className="text-amber-300">{new Date(detectionDate).toLocaleDateString()}</span> : <span className="italic text-slate-500">no threshold crossing on record</span>}
        </p>
        <p className="text-xs text-slate-400">
          Functional threshold:{" "}
          {thr ? (
            <><span className="text-white font-mono">{thr.value} {unit || "°C"}</span> — {thr.provenance}</>
          ) : (
            <span className="italic text-amber-400">no functional threshold stored - slope only, no F window</span>
          )}
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
      ) : !thr ? (
        <p className="text-xs italic text-amber-400 border-l-2 border-amber-400/40 pl-3">
          no functional threshold stored - slope only, no F window
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-300">
            P marker: {detectionDate ? new Date(detectionDate).toLocaleDateString() : "no stored detection date"} · current:{" "}
            <span className="font-mono text-white">{pts.length ? pts[pts.length - 1].value.toFixed(2) : "—"} {unit || "°C"}</span>
          </p>
          {fWindowTxt && <p className="text-xs text-amber-300">{fWindowTxt}</p>}
          <p className="text-[11px] text-slate-500 italic">RUL: {rulLabel ?? "—"} — modeled projection (G8) - not a measurement</p>
          <svg viewBox="0 0 360 130" className="w-full h-32 bg-slate-950/60 rounded border border-slate-800" role="img" aria-label="IR P-F curve with uncertainty band">
            <line x1="0" y1="120" x2="360" y2="120" stroke="#334155" strokeWidth="1" />
            <line x1="0" y1="10" x2="0" y2="120" stroke="#334155" strokeWidth="1" />
            <path d={bandPath} fill="rgba(251,191,36,0.15)" stroke="none" />
            <path d={pathFor(0)} fill="none" stroke="#fbbf24" strokeWidth="1.5" />
            <line
              x1="0"
              y1={Math.max(5, Math.min(115, 120 - (thr.value - yMin) / (yMax - yMin || 1) * 100))}
              x2="360"
              y2={Math.max(5, Math.min(115, 120 - (thr.value - yMin) / (yMax - yMin || 1) * 100))}
              stroke="#f87171"
              strokeDasharray="4 3"
              strokeWidth="1"
            />
            <text x="6" y="18" fill="#94a3b8" fontSize="8">P / F</text>
            <text x="330" y="128" fill="#64748b" fontSize="7">t (days)</text>
          </svg>
        </div>
      )}

      <footer className="border-t border-slate-800 pt-3">
        <p className="text-[10px] text-slate-500 italic">
          Projections are modeled estimates from stored history (G8) — not measurements. Absence of sufficient history is confessed, not extrapolated (G9). Comparison tools remain vibration-only this slice (declared). Selection policy: largest N, ties by severity.
        </p>
      </footer>
    </div>
  );
}
