/**
 * OilPrognosticsTab — wear-metal P-F window (thin adapter over pfEngine).
 * Series: Fe/Cu/Cr/Pb/Al/Si ppm from oil_samples (fetchOilSamples).
 * Threshold: stored per-sample alarm limit, else DEFAULT_ALARM_LIMITS,
 * else confess. G8/G9 via engine; comparison remains vibration-only.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Droplet } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { fetchOilSamples } from "../../lib/oilSampleRow";
import { type OilSample } from "../../types/oilAnalysis";
import {
  MIN_POINTS,
  MIN_SPAN_DAYS,
  MAX_WINDOW_DAYS,
  TREND_GATE_LABEL,
  dayLabel,
  derivePf,
  type SeriesCandidate,
  type Threshold,
} from "./pfEngine";
import {
  oilCandidates,
  oilThreshold,
  resolveOilAssetId,
} from "./prognosticsResolvers";

interface Props {
  isActive: boolean;
  selectedAnalysis: SavedAnalysisResult | null;
  loadedAnalyses: SavedAnalysisResult[];
  equipmentAssetId?: string | null;
}

export default function OilPrognosticsTab({ isActive, selectedAnalysis, loadedAnalyses, equipmentAssetId }: Props) {
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [samples, setSamples] = useState<OilSample[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const assetId = resolveOilAssetId(equipmentAssetId, selectedAnalysis, loadedAnalyses);

  useEffect(() => {
    setOverrideId(null);
  }, [assetId, selectedAnalysis?.id]);

  useEffect(() => {
    if (!isActive || !assetId) {
      setSamples([]);
      return;
    }
    let cancelled = false;
    fetchOilSamples(assetId)
      .then((s) => { if (!cancelled) { setSamples(s); setLoadError(null); } })
      .catch((e) => { if (!cancelled) setLoadError(String(e)); });
    return () => { cancelled = true; };
  }, [isActive, assetId]);

  const sorted = useMemo(
    () => [...samples].sort((a, b) => a.sampleDate.localeCompare(b.sampleDate)),
    [samples],
  );

  const candidates = useMemo<SeriesCandidate[]>(() => {
    if (!isActive) return [];
    return oilCandidates(sorted);
  }, [isActive, sorted]);

  const threshold = useMemo<Threshold | null>(
    () => oilThreshold(candidates, overrideId, sorted).threshold,
    [candidates, overrideId, sorted],
  );

  const derivation = useMemo(() => {
    const storedDetection = null;
    return derivePf({ candidates, overrideId, threshold, storedDetection });
  }, [candidates, overrideId, threshold]);

  const { seriesLabel, unit, pts, n, spanDays, fit, functionalThreshold, detectionDate, verdict, fWindow, rulLabel, selectionNote, candidateSummaries, worsening } = derivation;

  if (!isActive) return null;

  if (!assetId) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4">
        <Droplet className="h-8 w-8 text-slate-600 mb-3" />
        <p className="text-sm font-semibold text-slate-300">Select an asset with oil samples</p>
        <p className="text-xs text-slate-500 mt-1">Oil P-F series builds from stored lab samples.</p>
      </div>
    );
  }

  const thr = functionalThreshold;
  const slopeTxt = fit ? `${fit.slope.toFixed(4)} ${unit || "ppm"} per day` : "not computed";
  const seTxt = fit ? `± ${fit.seOfSlope.toFixed(4)}` : "—";
  const yMin = pts.length ? Math.min(...pts.map((p) => p.value), thr?.value ?? Infinity) * 0.95 : 0;
  const yMax = pts.length ? Math.max(...pts.map((p) => p.value), thr?.value ?? -Infinity) * 1.05 : 1;
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
    ? fWindow.median >= 0
      ? `F window: ${dayLabel(fWindow.lower)}–${dayLabel(fWindow.upper)} from today, median ${
          Number.isFinite(fWindow.median) ? `${Math.round(fWindow.median)} days` : `Unconstrained (>${MAX_WINDOW_DAYS}d)`
        }`
      : fWindow.upper < 0
        ? `F window: already crossed (median ~${Math.abs(Math.round(fWindow.median))} days ago, upper ~${Math.abs(Math.round(fWindow.upper))} days ago)`
        : `F window: median already crossed (~${Math.abs(Math.round(fWindow.median))} days ago) - upper bound in ~${Math.round(fWindow.upper)} days`
    : null;

  if (loadError) {
    return (
      <p className="text-xs italic text-amber-400 p-4">
        failed to load oil samples: {loadError} — slope not computed from missing data
      </p>
    );
  }

  if (!candidates.length) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4">
        <Droplet className="h-8 w-8 text-slate-600 mb-3" />
        <p className="text-sm font-semibold text-slate-300">No oil wear-metal series stored</p>
        <p className="text-xs text-slate-500 mt-1">Log a lab sample to seed the P-F series.</p>
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
          N = {n} over {spanDays.toFixed(1)} days (fractional day offsets from sample dates) · unit: {unit || "ppm"} · worsening: {worsening}
        </p>
        <p className="text-xs text-slate-400">
          Slope: <span className="font-mono text-white">{slopeTxt}</span> (SE {seTxt}) · {TREND_GATE_LABEL} · ordinary linear regression; not a physics failure model
        </p>
        <p className="text-xs text-slate-400">
          Detection: {detectionDate ? <span className="text-amber-300">{new Date(detectionDate).toLocaleDateString()}</span> : <span className="italic text-slate-500">no threshold crossing on record</span>}
        </p>
        <p className="text-xs text-slate-400">
          Functional threshold:{" "}
          {thr ? (
            <><span className="text-white font-mono">{thr.value} {unit || "ppm"}</span> — {thr.provenance}</>
          ) : (
            <span className="italic text-amber-400">no functional threshold stored - slope only, no F window</span>
          )}
        </p>
      </div>

      {verdict === "thin" ? (
        <p className="text-xs italic text-amber-400 border-l-2 border-amber-400/40 pl-3">
          degradation trend not established - {n} points over {Math.round(spanDays)} days (minimum {MIN_POINTS} over {MIN_SPAN_DAYS} days)
        </p>
      ) : verdict === "stable" ? (
        <p className="text-xs italic text-emerald-400 border-l-2 border-emerald-400/40 pl-3">
          no degradation trend - slope {slopeTxt} (SE {seTxt}) not statistically distinguishable from flat ({TREND_GATE_LABEL}); RUL not computed
        </p>
      ) : verdict === "improving" ? (
        <p className="text-xs italic text-emerald-400 border-l-2 border-emerald-400/40 pl-3">
          trend improving - significant slope in the healthy direction: {slopeTxt} (SE {seTxt}); no RUL computed (no degradation trend to project)
        </p>
      ) : verdict === "no-threshold" || !thr ? (
        <p className="text-xs italic text-amber-400 border-l-2 border-amber-400/40 pl-3">
          no functional threshold stored - slope only, no F window
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-300">
            P marker: {detectionDate ? new Date(detectionDate).toLocaleDateString() : "no stored detection date"} · current:{" "}
            <span className="font-mono text-white">{pts.length ? pts[pts.length - 1].value.toFixed(2) : "—"} {unit || "ppm"}</span>
          </p>
          {fWindowTxt && <p className="text-xs text-amber-300">{fWindowTxt}</p>}
          <p className="text-[11px] text-slate-500 italic">RUL: {rulLabel ?? "—"} — modeled projection (G8) - not a measurement</p>
          <svg viewBox="0 0 360 130" className="w-full h-32 bg-slate-950/60 rounded border border-slate-800" role="img" aria-label="Oil P-F curve with uncertainty band">
            <line x1="0" y1="120" x2="360" y2="120" stroke="#334155" strokeWidth="1" />
            <line x1="0" y1="10" x2="0" y2="120" stroke="#334155" strokeWidth="1" />
            <path d={bandPath} fill="rgba(251,191,36,0.15)" stroke="none" />
            <path d={pathFor(0)} fill="none" stroke="#fbbf24" strokeWidth="1.5" />
            {thr && (
              <line
                x1="0"
                y1={Math.max(5, Math.min(115, 120 - (thr.value - yMin) / (yMax - yMin || 1) * 100))}
                x2="360"
                y2={Math.max(5, Math.min(115, 120 - (thr.value - yMin) / (yMax - yMin || 1) * 100))}
                stroke="#f87171"
                strokeDasharray="4 3"
                strokeWidth="1"
              />
            )}
            <text x="6" y="18" fill="#94a3b8" fontSize="8">P / F</text>
            <text x="330" y="128" fill="#64748b" fontSize="7">t (days)</text>
          </svg>
        </div>
      )}

      <footer className="border-t border-slate-800 pt-3">
        <p className="text-[10px] text-slate-500 italic">
          Projections are modeled estimates from stored history (G8) — not measurements. Absence of sufficient history is confessed, not extrapolated (G9). Wear limits are lab and OEM practice — no universal ISO severity class standard exists for oil. Comparison tools remain vibration-only this slice (declared). Selection policy: largest N, ties by severity.
        </p>
      </footer>
    </div>
  );
}
