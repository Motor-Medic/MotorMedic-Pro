import React, { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import type { SavedAnalysisResult, SavedFaultItem } from "../../lib/analysisPersistence";
import { getPrescription } from "../../lib/maintenance/prescriptiveDictionary";
import { buildFaultHistory, faultFreq } from "../../lib/diagnostics/spectralDiff";
import {
  MIN_POINTS,
  MIN_SPAN_DAYS,
  ISO_C_D_BOUNDARY,
  MAX_WINDOW_DAYS,
  dayLabel,
  derivePf,
  type SeriesCandidate,
  type Threshold,
} from "./pfEngine";

interface VibrationPrognosticsTabProps {
  isActive: boolean;
  selectedAnalysis: SavedAnalysisResult | null;
  loadedAnalyses: SavedAnalysisResult[];
}

function severityRank(faults: SavedFaultItem[], title: string): number {
  const hit = faults.find((f) => f.title === title);
  const s = String(hit?.severity ?? "").toLowerCase();
  if (s.includes("critical") || s.includes("high") || s.includes("severe")) return 3;
  if (s.includes("medium") || s.includes("moderate") || s.includes("warning")) return 2;
  if (s.includes("low") || s.includes("minor")) return 1;
  return 0;
}

export default function VibrationPrognosticsTab({ isActive, selectedAnalysis, loadedAnalyses }: VibrationPrognosticsTabProps) {
  const [epoch, setEpoch] = useState(0);
  const [overrideId, setOverrideId] = useState<string | null>(null);

  const asset = selectedAnalysis?.asset_id ?? null;
  const component = selectedAnalysis?.component ?? null;

  useEffect(() => {
    if (isActive) setEpoch((e) => e + 1);
  }, [isActive, asset, component]);

  useEffect(() => {
    setOverrideId(null);
  }, [asset, component, selectedAnalysis?.id]);

  const candidates = useMemo<SeriesCandidate[]>(() => {
    void epoch;
    const runs = loadedAnalyses
      .filter((r) => (r.analysis_type ?? "vibration") === "vibration" && r.asset_id === asset && (!component || r.component === component))
      .sort((x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime());

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
        severityRank: severityRank(faultList, fh.title),
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
        severityRank: severityRank(faultList, f.title),
        worsening: "increase",
      });
    }

    return out;
  }, [loadedAnalyses, asset, component, selectedAnalysis, epoch]);

  const threshold = useMemo<Threshold | null>(() => {
    const faultList = Array.isArray(selectedAnalysis?.fault_list) ? selectedAnalysis.fault_list : [];
    const selected = candidates.find((c) => c.id === overrideId)
      ?? candidates.slice().sort((a, b) => b.points.length - a.points.length || b.severityRank - a.severityRank)[0]
      ?? null;
    const title = selected ? selected.label.replace(/\s+[\d.]+\s*Hz$/, "") : faultList[0]?.title ?? null;
    const siteAlarm = title ? getPrescription(title).severityZones.alarm ?? null : null;
    if (siteAlarm != null) {
      return { value: siteAlarm, provenance: "stored site alarm (prescriptive dictionary severity zones)" };
    }
    return {
      value: ISO_C_D_BOUNDARY,
      provenance: "site-practice proxy - not a stored functional limit (ISO 20816 zone C/D boundary)",
    };
  }, [candidates, overrideId, selectedAnalysis]);

  const derivation = useMemo(() => {
    const storedDetection =
      (selectedAnalysis?.telemetry_data as Record<string, unknown> | null | undefined)?.detectionDate != null
        ? String((selectedAnalysis.telemetry_data as Record<string, unknown>).detectionDate)
        : null;
    return derivePf({
      candidates,
      overrideId,
      threshold,
      storedDetection,
    });
  }, [candidates, overrideId, threshold, selectedAnalysis, epoch]);

  const {
    seriesLabel, unit, pts, n, spanDays, fit,
    functionalThreshold, detectionDate,
    g9Pass, slopeGatePass, fWindow, rulLabel,
    selectionNote, candidateSummaries,
  } = derivation;

  const watchlist = useMemo(() => {
    const open = loadedAnalyses
      .filter((r) => (r.analysis_type ?? "vibration") === "vibration" && r.asset_id === asset && (!component || r.component === component))
      .slice(-3)
      .map((r) => `${r.asset_id ?? "unknown"} (${r.primary_fault ?? "no primary fault"})`);
    return open.length ? open.join(", ") : "none for this component";
  }, [loadedAnalyses, asset, component]);

  if (!isActive) return null;

  const thr = functionalThreshold ?? { value: ISO_C_D_BOUNDARY, provenance: "no threshold" };
  const slopeTxt = fit ? `${fit.slope.toFixed(4)} mm/s per day` : "not computed";
  const seTxt = fit ? `± ${fit.seOfSlope.toFixed(4)}` : "—";

  const yMin = pts.length ? Math.min(...pts.map((p) => p.value), thr.value) * 0.95 : 0;
  const yMax = pts.length ? Math.max(...pts.map((p) => p.value), thr.value) * 1.05 : 1;
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
          Projected fault: <span className="text-white">{seriesLabel}</span> — {selectionNote.replace(/^projected series: /, "")}
        </p>
        <p className="text-xs text-slate-300">
          N = {n} points over {spanDays.toFixed(1)} days (fractional day offsets from stored timestamps) · unit: {unit || "mm/s"}
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
          Functional threshold: <span className="text-white font-mono">{thr.value} mm/s</span> — {thr.provenance}
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
      ) : !functionalThreshold ? (
        <p className="text-xs italic text-amber-400 border-l-2 border-amber-400/40 pl-3">
          no functional threshold stored - slope only, no F window
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
              y1={Math.max(5, Math.min(115, 120 - (thr.value - yMin) / (yMax - yMin) * 100))}
              x2="360"
              y2={Math.max(5, Math.min(115, 120 - (thr.value - yMin) / (yMax - yMin) * 100))}
              stroke="#f87171"
              strokeDasharray="4 3"
              strokeWidth="1"
            />
            {detectionDate && pts.length > 0 && (
              <circle
                cx={(pts[0].day / xMax) * 360}
                cy={Math.max(5, Math.min(115, 120 - (pts[0].value - yMin) / (yMax - yMin) * 100))}
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
          Projections are modeled estimates from stored history (G8) — not measurements. Absence of sufficient history is confessed, not extrapolated (G9). Guidance flags are guidance, not diagnoses. Series selection policy: largest N, ties by severity; override does not borrow another curve.
        </p>
        <p className="text-[10px] text-slate-500">Watchlist: {watchlist}</p>
      </footer>
    </div>
  );
}
