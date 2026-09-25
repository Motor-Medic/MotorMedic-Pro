/**
 * McaPrognosticsTab — imbalance / IR P-F window (thin adapter over pfEngine).
 * Series: imbalance % (rising) and insulation resistance MΩ (falling).
 * Threshold: NEMA Class 1 proxy on imbalance; IEEE 43 gate on IR when
 * present; else confess. G8/G9 via engine; comparison remains vibration-only.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Zap } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import {
  mcaPeakBlob,
  extractMcaWindingFromSaved,
  extractMcaGroundwallFromSaved,
} from "../../lib/mca/mcaPersistence";
import { percentUnbalance } from "../../lib/mca/windingBalanceCalculator";
import { calculateGroundwallInsulation } from "../../lib/mca/groundwallCalculator";
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

interface Props {
  isActive: boolean;
  selectedAnalysis: SavedAnalysisResult | null;
  loadedAnalyses: SavedAnalysisResult[];
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

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

export default function McaPrognosticsTab({ isActive, selectedAnalysis, loadedAnalyses }: Props) {
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const asset = selectedAnalysis?.asset_id ?? null;
  const component = selectedAnalysis?.component ?? null;

  useEffect(() => {
    setOverrideId(null);
  }, [asset, component, selectedAnalysis?.id]);

  const runs = useMemo(() => {
    if (!isActive) return [];
    return loadedAnalyses
      .filter((r) => (r.analysis_type ?? "").toLowerCase() === "mca" && r.asset_id === asset && (!component || r.component === component))
      .sort((x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime());
  }, [isActive, loadedAnalyses, asset, component]);

  const candidates = useMemo<SeriesCandidate[]>(() => {
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
  }, [runs]);

  const threshold = useMemo<Threshold | null>(() => {
    const sel = candidates.find((c) => c.id === overrideId)
      ?? candidates.slice().sort((a, b) => b.points.length - a.points.length || b.severityRank - a.severityRank)[0]
      ?? null;
    if (sel?.id === "mca-imbalance") {
      return {
        value: 8,
        provenance: "site-practice proxy — NEMA MG-1 Class 1 unbalance boundary (8 %), not a stored functional limit; no ISO severity standard exists for MCA",
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
            value: result.irIeeeMinMOmega,
            provenance: "IEEE 43 minimum (groundwall calculator irIeeeMinMOmega from test voltage / winding class)",
          };
        }
      }
      return null;
    }
    return null;
  }, [candidates, overrideId, runs]);

  const derivation = useMemo(() => {
    const storedDetection = null;
    return derivePf({ candidates, overrideId, threshold, storedDetection });
  }, [candidates, overrideId, threshold]);

  const { seriesLabel, unit, pts, n, spanDays, fit, functionalThreshold, detectionDate, verdict, fWindow, rulLabel, selectionNote, candidateSummaries, worsening } = derivation;

  if (!isActive) return null;

  if (!candidates.length) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4">
        <Zap className="h-8 w-8 text-slate-600 mb-3" />
        <p className="text-sm font-semibold text-slate-300">No MCA series stored for this component</p>
        <p className="text-xs text-slate-500 mt-1">Run an MCA test to seed imbalance / IR history.</p>
      </div>
    );
  }

  const thr = functionalThreshold;
  const slopeTxt = fit ? `${fit.slope.toFixed(4)} ${unit || ""} per day` : "not computed";
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
          N = {n} over {spanDays.toFixed(1)} days (fractional day offsets) · unit: {unit || "—"} · worsening: {worsening}
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
            <><span className="text-white font-mono">{thr.value} {unit || ""}</span> — {thr.provenance}</>
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
            <span className="font-mono text-white">{pts.length ? pts[pts.length - 1].value.toFixed(2) : "—"} {unit || ""}</span>
          </p>
          {fWindowTxt && <p className="text-xs text-amber-300">{fWindowTxt}</p>}
          <p className="text-[11px] text-slate-500 italic">RUL: {rulLabel ?? "—"} — modeled projection (G8) - not a measurement</p>
          <svg viewBox="0 0 360 130" className="w-full h-32 bg-slate-950/60 rounded border border-slate-800" role="img" aria-label="MCA P-F curve with uncertainty band">
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
          Projections are modeled estimates from stored history (G8) — not measurements. Absence of sufficient history is confessed, not extrapolated (G9). No ISO severity class standard exists for MCA. Comparison tools remain vibration-only this slice (declared). Selection policy: largest N, ties by severity.
        </p>
      </footer>
    </div>
  );
}
