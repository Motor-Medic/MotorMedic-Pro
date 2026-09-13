import React, { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Clock, ChevronDown, ChevronRight } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { extractVibrationRecordFromAnalysis } from "../../lib/vibration/vibrationDiagnosticRecord";
import { getPrescription } from "../../lib/maintenance/prescriptiveDictionary";
import { extractTruePeaks, diffSpectra, buildFaultHistory, faultFreq, type Peak, type DiffResult, type FaultHistoryEntry } from "../../lib/diagnostics/spectralDiff";

/* ── Props ─────────────────────────────────────────────────────────────────── */

interface PrognosticsTabProps {
  isActive: boolean;
  selectedAnalysis: SavedAnalysisResult | null;
  loadedAnalyses: SavedAnalysisResult[];
  planningInputs?: { leadTimeDays: number | null; nextShutdownDate: string | null; downtimeCostPerDay: number | null } | null;
}
interface PlanningInputs { leadTimeDays: number | null; nextShutdownDate: string | null; downtimeCostPerDay: number | null; }

/* ── Helpers (reuse from prior slice) ──────────────────────────────────────── */

function parsePeaks(row: SavedAnalysisResult | null): Peak[] {
  if (!row) return [];
  const out: Peak[] = [];
  const num = (v: unknown): number => (typeof v === "number" || typeof v === "string") && Number.isFinite(Number(v)) ? Number(v) : NaN;
  const walk = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const it of v) walk(it); return; }
    const o = v as Record<string, unknown>;
    const f = num(o.frequencyHz ?? o.frequency_hz ?? o.freqHz ?? o.freq_hz ?? o.frequency ?? o.freq ?? o.hz ?? o.count);
    const a = num(o.amplitude ?? o.amp ?? o.value);
    if (f > 0 && a > 0) { out.push({ frequency: f, amplitude: a }); return; }
    for (const k of ["record", "telemetry_data", "telemetry", "vibration_trend_record", "spectral", "spectrum", "peaks", "fft_data", "vibration_peaks"])
      if (o[k] != null) walk(o[k]);
  };
  walk(row);
  return out;
}
function rowRpm(row: SavedAnalysisResult): number | null {
  const td = row.telemetry_data;
  if (!td || typeof td !== "object") return null;
  const o = td as Record<string, unknown>;
  const vtr = o.vibration_trend_record as Record<string, unknown> | undefined;
  const r = Number(o.rpm ?? o.running_speed_rpm ?? (vtr ? vtr.rpm : null));
  return Number.isFinite(r) && r > 0 ? r : null;
}
function overallMmS(row: SavedAnalysisResult): number | null {
  const rec = extractVibrationRecordFromAnalysis(row);
  if (rec?.broadband && typeof rec.broadband.overallVelocity === "number" && Number.isFinite(rec.broadband.overallVelocity) && rec.broadband.overallVelocity > 0)
    return Number(rec.broadband.overallVelocity);
  const td = row.telemetry_data;
  if (td && typeof td === "object") { const v = (td as Record<string, unknown>).overallVelocity; if (typeof v === "number" && Number.isFinite(v) && v > 0) return v; }
  return null;
}

const ISO_ZONES = [{ zone: "A", label: "Good", to: 2.3 }, { zone: "B", label: "Acceptable", to: 4.5 }, { zone: "C", label: "Unsatisfactory", to: 7.1 }, { zone: "D", label: "Unacceptable", to: Infinity }] as const;
function zoneFor(rms: number | null, health: number | null): string {
  if (rms != null && Number.isFinite(rms) && rms >= 0) return ISO_ZONES.find((z) => rms < z.to)!.zone;
  if (health != null && Number.isFinite(health)) { if (health >= 85) return "A"; if (health >= 70) return "B"; if (health >= 50) return "C"; return "D"; }
  return "—";
}

/* ── F3 math (verbatim) ───────────────────────────────────────────────────── */

function computeAvgIntervalDays(timestamps: string[]): { days: number; fallback: boolean } {
  if (timestamps.length < 2) return { days: 30, fallback: true };
  const sorted = [...timestamps].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86400000;
    if (d >= 1) gaps.push(d);
  }
  if (gaps.length === 0) return { days: 30, fallback: true };
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return { days: Math.round(gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2) || 30, fallback: false };
}
function computeTiming(trend: { first: number; last: number; delta: number } | null, alarmThreshold: number | null | undefined, unit: string, inputs: PlanningInputs | null, avgDays: number, intervalFallback: boolean) {
  if (!inputs || inputs.leadTimeDays == null || inputs.nextShutdownDate == null || inputs.downtimeCostPerDay == null) return null;
  if (alarmThreshold == null) return { executeBy: null, method: "not computed", recommendation: `not computed - thresholds not curated for ${unit} modality`, costOfWait: null, intervalLabel: "" };
  if (!trend || trend.delta <= 0.005) return { executeBy: null, method: "no growth", recommendation: "no growth trend - schedule at convenience", costOfWait: null, intervalLabel: "" };
  const runsToAlarm = (alarmThreshold - trend.last) / trend.delta;
  if (!Number.isFinite(runsToAlarm) || runsToAlarm <= 0) return { executeBy: null, method: "already past alarm", recommendation: "amplitude at or above alarm - execute immediately", costOfWait: null, intervalLabel: "" };
  const daysToAlarm = Math.round(runsToAlarm * avgDays);
  const execDate = new Date(); execDate.setDate(execDate.getDate() + daysToAlarm);
  const executeBy = execDate.toISOString().slice(0, 10);
  const shutdownDate = new Date(inputs.nextShutdownDate); const now = new Date();
  let recommendation: string; let costText: string | null = null;
  if (shutdownDate <= execDate && shutdownDate > now) {
    const daysDeferred = Math.round((shutdownDate.getTime() - now.getTime()) / 86400000);
    costText = `max exposure if failure occurs today: $${inputs.downtimeCostPerDay}/day x ${daysDeferred} days = $${(inputs.downtimeCostPerDay * daysDeferred).toFixed(0)} (defer window to shutdown)`;
    recommendation = `defer to shutdown ${inputs.nextShutdownDate}`;
  } else {
    const arrivalWindow = Math.round(daysToAlarm * 0.8);
    costText = `max exposure if failure occurs today: $${inputs.downtimeCostPerDay}/day x ${arrivalWindow} days = $${(inputs.downtimeCostPerDay * arrivalWindow).toFixed(0)}`;
    recommendation = `execute within ${inputs.leadTimeDays} days of parts arrival`;
  }
  return { executeBy, method: "linear trend extrapolation", recommendation, costOfWait: costText, intervalLabel: intervalFallback ? "linear trend extrapolation - not a failure model; median run interval assumed 30 days - too few dated runs" : `linear trend extrapolation - not a failure model; median run interval ${avgDays} days (same-day runs excluded)` };
}
function extrapolateTo(trend: { first: number; last: number; delta: number }, threshold: number, avgDays: number): { runs: number; days: number; date: string } | null {
  const runs = (threshold - trend.last) / trend.delta;
  if (!Number.isFinite(runs) || runs <= 0) return null;
  const days = Math.round(runs * avgDays);
  const d = new Date(); d.setDate(d.getDate() + days);
  return { runs, days, date: d.toISOString().slice(0, 10) };
}

/* ── Prognosis band (slope ± 30%) ─────────────────────────────────────────── */

function prognosisBand(peakAmps: number[], avgDays: number, alarmThreshold: number): { predictedDate: string; bestDate: string; worstDate: string } | null {
  if (peakAmps.length < 2) return null;
  const last = peakAmps[peakAmps.length - 1];
  const slope = (last - peakAmps[0]) / (peakAmps.length - 1);
  if (slope <= 0 || last >= alarmThreshold) return null;
  const remaining = alarmThreshold - last;
  const bestSlope = slope * 1.3;   // faster → earlier execute-by
  const worstSlope = slope * 0.7;  // slower → later execute-by
  const now = new Date();
  const pDays = Math.round(remaining / slope * avgDays);
  const bDays = Math.round(remaining / bestSlope * avgDays);
  const wDays = Math.round(remaining / worstSlope * avgDays);
  const fmt = (off: number) => { const d = new Date(now); d.setDate(d.getDate() + off); return d.toISOString().slice(0, 10); };
  return { predictedDate: fmt(pDays), bestDate: fmt(bDays), worstDate: fmt(wDays) };
}

/* ── Sparkline (inline SVG polyline) ───────────────────────────────────────── */

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length === 0) return <span className="text-[10px] text-slate-500">—</span>;
  const W = 100, H = 20, PAD = 1;
  if (points.length === 1) {
    const y = H / 2;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-16 h-4" preserveAspectRatio="none">
        <circle cx={W / 2} cy={y} r="2" fill={color} />
      </svg>
    );
  }
  const mn = Math.min(...points), mx = Math.max(...points);
  const range = mx - mn || 1;
  const coords = points.map((v, i) => {
    const x = PAD + (i / (points.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((v - mn) / range) * (H - PAD * 2);
    return `${x},${y}`;
  }).join(" ");
  const last = points[points.length - 1];
  const lastX = W - PAD;
  const lastY = H - PAD - ((last - mn) / range) * (H - PAD * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-16 h-4" preserveAspectRatio="none">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r="1.5" fill={color} />
    </svg>
  );
}

/* ── Main component ────────────────────────────────────────────────────────── */

export default function PrognosticsTab({ isActive, selectedAnalysis, loadedAnalyses, planningInputs }: PrognosticsTabProps) {
  const [selA, setSelA] = useState<string | null>(null);
  const [selB, setSelB] = useState<string | null>(null);
  const [normalize, setNormalize] = useState(false);
  const [showMoreFaults, setShowMoreFaults] = useState(false);
  const [showMoreAppeared, setShowMoreAppeared] = useState(false);
  const [showMoreGrew, setShowMoreGrew] = useState(false);
  const [showMoreSettled, setShowMoreSettled] = useState(false);

  const asset = selectedAnalysis?.asset_id ?? null;
  const component = selectedAnalysis?.component ?? null;
  const vibrationRuns = useMemo(() => loadedAnalyses
    .filter((r) => (r.analysis_type ?? "vibration") === "vibration" && r.asset_id === asset && (!component || r.component === component))
    .sort((x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime()), [loadedAnalyses, asset, component]);

  useEffect(() => {
    if (!isActive || !selectedAnalysis) return;
    const aDate = selectedAnalysis.timestamp.slice(0, 10);
    const prev = [...vibrationRuns].reverse().find((r) => r.id !== selectedAnalysis.id && r.timestamp.slice(0, 10) !== aDate);
    setSelA(selectedAnalysis.id);
    setSelB(selB == null || !vibrationRuns.some((r) => r.id === selB) ? (prev?.id ?? null) : selB);
  }, [isActive, selectedAnalysis?.id, vibrationRuns]);

  /* ── Tracked fault & trend ── */
  const topFault = useMemo(() => (Array.isArray(selectedAnalysis?.fault_list) && selectedAnalysis.fault_list.length ? selectedAnalysis.fault_list[0] : null), [selectedAnalysis]);
  const hz = useMemo(() => { const f = topFault; if (!f) return null; const raw = f.frequencyHz ?? (typeof f.frequency === "number" ? f.frequency : typeof f.frequency === "string" ? Number(f.frequency) : NaN); return Number.isFinite(raw) && raw > 0 ? raw : null; }, [topFault]);
  const trend = useMemo(() => {
    if (hz == null) return null;
    const series: number[] = [];
    for (const r of vibrationRuns) {
      const amp = parsePeaks(r).reduce((m, p) => Math.abs(p.frequency - hz) <= 2 && Math.abs(p.frequency - hz) < Math.abs(m.frequency - hz) ? p : m, { frequency: Infinity, amplitude: -Infinity });
      if (Number.isFinite(amp.amplitude) && amp.amplitude > 0) series.push(amp.amplitude);
    }
    if (series.length < 2) return null;
    return { first: series[0], last: series[series.length - 1], delta: series[series.length - 1] - series[0] };
  }, [vibrationRuns, hz]);

  const avgInterval = useMemo(() => computeAvgIntervalDays(vibrationRuns.map((r) => r.timestamp)), [vibrationRuns]);
  const zones = useMemo(() => topFault ? getPrescription(topFault.title).severityZones : null, [topFault]);
  const alarm = zones?.alarm ?? null;
  const danger = zones?.danger ?? null;
  const unit = zones?.unit ?? "mm/s";
  const timing = useMemo(() => computeTiming(trend, alarm, unit, planningInputs, avgInterval.days, avgInterval.fallback), [trend, alarm, unit, planningInputs, avgInterval]);
  const dangerEta = useMemo(() => trend && danger != null ? extrapolateTo(trend, danger, avgInterval.days) : null, [trend, danger, avgInterval]);

  /* Band window (last-5-run slope ± 30%) */
  const band = useMemo(() => {
    if (hz == null || alarm == null) return null;
    const amps: number[] = [];
    for (const r of vibrationRuns.slice(-5)) {
      const amp = parsePeaks(r).reduce((m, p) => Math.abs(p.frequency - hz) <= 2 && Math.abs(p.frequency - hz) < Math.abs(m.frequency - hz) ? p : m, { frequency: Infinity, amplitude: -Infinity });
      if (Number.isFinite(amp.amplitude) && amp.amplitude > 0) amps.push(amp.amplitude);
    }
    return prognosisBand(amps, avgInterval.days, alarm!);
  }, [vibrationRuns, hz, avgInterval, alarm]);

  /* Cadence lines — observations remaining at current vs 30d cadence */
  const cadence = useMemo(() => {
    if (!timing?.executeBy || avgInterval.days <= 0) return null;
    const daysToAlarm = Math.round((new Date(timing.executeBy).getTime() - Date.now()) / 86400000);
    if (daysToAlarm <= 0) return null;
    const atCurrent = Math.floor(daysToAlarm / avgInterval.days);
    const at30 = Math.floor(daysToAlarm / 30);
    return { atCurrent, at30, cadenceDays: avgInterval.days };
  }, [timing, avgInterval]);

  /* ── S2: Fault Track Board ── */
  const faultHistory = useMemo(() => buildFaultHistory(vibrationRuns), [vibrationRuns]);
  const topFaults = faultHistory.slice(0, 4);
  const moreFaults = faultHistory.slice(4);

  /* ── S3: Spectral Diff ── */
  const runA = selA ? vibrationRuns.find((r) => r.id === selA) ?? null : null;
  const runB = selB ? vibrationRuns.find((r) => r.id === selB) ?? null : null;
  const peaksA = useMemo(() => runA ? extractTruePeaks(parsePeaks(runA)) : [], [runA]);
  const peaksB = useMemo(() => runB ? extractTruePeaks(parsePeaks(runB)) : [], [runB]);
  const orderMode = runA != null && runB != null && rowRpm(runA) != null && rowRpm(runB) != null;
  const diff: DiffResult = useMemo(() => diffSpectra(peaksA, peaksB), [peaksA, peaksB]);

  /* Stem chart data */
  const stemData = useMemo(() => {
    const map = new Map<number, { frequency: number; a?: number; b?: number }>();
    for (const p of peaksA) { const f = Math.round(p.frequency * 10) / 10; map.set(f, { frequency: f, a: p.amplitude }); }
    for (const p of peaksB) { const f = Math.round(p.frequency * 10) / 10; const e = map.get(f) ?? { frequency: f }; e.b = p.amplitude; map.set(f, e); }
    return [...map.values()].sort((x, y) => x.frequency - y.frequency);
  }, [peaksA, peaksB]);

  const stemYMax = useMemo(() => Math.max(...stemData.map((r) => Math.max(r.a ?? 0, r.b ?? 0)), 0.001) * 1.15, [stemData]);

  const dateFmt = (ts: string) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const dateFmtShort = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  /* ── S4: Audit strip zone history ── */
  const zoneHistory = useMemo(() => vibrationRuns.map((r) => ({ id: r.id, ts: r.timestamp, zone: zoneFor(overallMmS(r), r.health_score) })), [vibrationRuns]);

  const zoneColor = (z: string) => z === "D" ? "bg-red-500" : z === "C" ? "bg-amber-500" : z === "B" ? "bg-sky-500" : z === "A" ? "bg-emerald-500" : "bg-slate-600";

  return (
    <div className="space-y-4 p-4">

      {/* ═══ S1: PROGNOSIS HEADER ═══ */}
      <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3 space-y-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <Clock className="h-3 w-3" />Prognosis
          {trend && timing && <span className="text-[9px] border rounded px-1 border-amber-500/60 text-amber-400 normal-case tracking-normal">PREDICTED</span>}
        </div>
        {!selectedAnalysis ? (
          <p className="text-xs text-slate-400 italic">Open a report to compute trend extrapolation.</p>
        ) : hz == null ? (
          <p className="text-xs text-slate-400 italic">No tracked fault frequency on this record — trend unavailable.</p>
        ) : !trend ? (
          <p className="text-xs text-slate-400 italic">Fewer than two dated runs store a peak near {hz.toFixed(1)} Hz — trend unavailable.</p>
        ) : (
          <div className="space-y-1.5 text-xs">
            <p className="text-slate-300">
              <span className="text-slate-500">Tracked: </span>{hz.toFixed(2)} Hz · first <span className="font-mono text-white">{trend.first.toFixed(3)}</span> → latest <span className="font-mono text-white">{trend.last.toFixed(3)}</span> {unit}
              <span className={`ml-1 ${trend.delta > 0.005 ? "text-red-400" : trend.delta < -0.005 ? "text-emerald-400" : "text-slate-500"}`}>
                (Δ {trend.delta >= 0 ? "+" : ""}{trend.delta.toFixed(3)})
              </span>
              <span className="text-slate-500 ml-1 text-[10px]">(peak amplitude at tracked Hz, all runs)</span>
            </p>
            {band ? (
              <p className="text-[11px] text-slate-400">
                Execute-by window (last 5 runs, ±30% slope): <span className="text-emerald-400 font-medium">{band.bestDate}</span> – <span className="text-amber-400 font-medium">{band.worstDate}</span>
                <span className="text-slate-500 ml-1">· predicted {band.predictedDate}</span>
              </p>
            ) : timing?.executeBy ? (
              <p className="text-[11px] text-slate-400">
                Execute-by: <span className="text-amber-400 font-medium">{dateFmt(timing.executeBy)}</span>
                <span className="text-slate-500 ml-1">· slope band unavailable (insufficient recent peaks)</span>
              </p>
            ) : null}
            <p className="text-slate-500 italic">{timing?.intervalLabel ?? "linear trend extrapolation - not a failure model"}</p>
            {alarm != null && timing?.executeBy && (
              <p className="text-slate-300">
                <span className="text-slate-500">Reaches alarm ({alarm} {unit}): </span>
                <span className="text-amber-300 font-medium">{dateFmt(timing.executeBy)}</span>
                {timing.recommendation && <span className="text-slate-500 ml-1">· {timing.recommendation}</span>}
              </p>
            )}
            {dangerEta && <p className="text-slate-300"><span className="text-slate-500">Reaches danger ({danger} {unit}): </span><span className="text-red-400 font-medium">{dateFmt(dangerEta.date)}</span> <span className="text-slate-500">(~{dangerEta.days}d at median interval {avgInterval.days}d)</span></p>}
            {timing?.costOfWait && <p className="text-[11px] text-slate-400">{timing.costOfWait}</p>}
            {cadence && (
              <p className="text-[11px] text-slate-500">
                Cadence: ~{cadence.atCurrent} observations remaining at current cadence ({cadence.cadenceDays}d) vs ~{cadence.at30} at 30d cadence
              </p>
            )}
          </div>
        )}
      </div>

      {/* ═══ S2: FAULT TRACK BOARD ═══ */}
      <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3 space-y-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Fault Track Board</div>
        {!selectedAnalysis ? (
          <p className="text-xs text-slate-400 italic">Open a report to see fault evolution.</p>
        ) : faultHistory.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No faults with tracked frequencies across runs.</p>
        ) : (
          <div className="space-y-2">
            {topFaults.map((fh) => {
              const latestZone = (() => {
                const lastRun = vibrationRuns.find((r) => fh.series.some((s) => s.runId === r.id));
                return lastRun ? zoneFor(overallMmS(lastRun), lastRun.health_score) : "—";
              })();
              return (
                <div key={fh.title} className="flex items-center gap-3 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-300 truncate">{fh.title} <span className="text-slate-500">({fh.frequencyHz?.toFixed(1)} Hz)</span></p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Sparkline points={fh.series.map((s) => s.amplitude)} color={fh.delta > 0.005 ? "#f87171" : fh.delta < -0.005 ? "#34d399" : "#94a3b8"} />
                      <span className="text-[10px] text-slate-500">
                        <span className="font-mono text-white">{fh.series[0]?.amplitude.toFixed(2) ?? "—"}</span>
                        {" → "}
                        <span className="font-mono text-white">{fh.series[fh.series.length - 1]?.amplitude.toFixed(2) ?? "—"}</span>
                        <span className={`ml-1 ${fh.delta > 0.005 ? "text-red-400" : fh.delta < -0.005 ? "text-emerald-400" : "text-slate-500"}`}>
                          (Δ {fh.delta >= 0 ? "+" : ""}{fh.delta.toFixed(2)})
                        </span>
                        <span className="text-slate-600 ml-1 text-[9px]">(amplitude while diagnosed – {fh.series.length} run{fh.series.length !== 1 ? "s" : ""})</span>
                      </span>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${latestZone === "D" ? "border-red-500/40 text-red-400" : latestZone === "C" ? "border-amber-500/40 text-amber-400" : latestZone === "B" ? "border-sky-500/40 text-sky-400" : latestZone === "A" ? "border-emerald-500/40 text-emerald-400" : "border-slate-600 text-slate-400"}`}>{latestZone === "—" ? "—" : `Zone ${latestZone}`}</span>
                </div>
              );
            })}
            {moreFaults.length > 0 && (
              <button onClick={() => setShowMoreFaults((v) => !v)} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
                {showMoreFaults ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                +{moreFaults.length} more fault{moreFaults.length > 1 ? "s" : ""}
              </button>
            )}
            {showMoreFaults && moreFaults.map((fh) => (
              <div key={fh.title} className="flex items-center gap-3 text-xs pl-4">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-400 truncate">{fh.title} <span className="text-slate-500">({fh.frequencyHz?.toFixed(1)} Hz)</span></p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Sparkline points={fh.series.map((s) => s.amplitude)} color={fh.delta > 0.005 ? "#f87171" : fh.delta < -0.005 ? "#34d399" : "#94a3b8"} />
                    <span className="text-[10px] text-slate-500">
                      Δ <span className={`font-mono ${fh.delta > 0.005 ? "text-red-400" : fh.delta < -0.005 ? "text-emerald-400" : "text-slate-500"}`}>{fh.delta >= 0 ? "+" : ""}{fh.delta.toFixed(2)}</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ S3: SPECTRAL DIFF ═══ */}
      <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3 space-y-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Spectral Diff</div>
        {!selectedAnalysis ? (
          <p className="text-xs text-slate-400 italic">Open a report to compare two stored runs.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">Run A</span>
              <select value={selA ?? ""} onChange={(e) => setSelA(e.target.value || null)} className="h-7 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/60">
                <option value="">Select…</option>
                {vibrationRuns.map((r) => <option key={r.id} value={r.id}>{dateFmtShort(r.timestamp)}</option>)}
              </select>
              <span className="text-slate-500">Run B</span>
              <select value={selB ?? ""} onChange={(e) => setSelB(e.target.value || null)} className="h-7 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/60">
                <option value="">Select…</option>
                {vibrationRuns.map((r) => <option key={r.id} value={r.id}>{dateFmtShort(r.timestamp)}</option>)}
              </select>
              <label className="flex items-center gap-1.5 cursor-pointer ml-2">
                <input type="checkbox" checked={normalize} onChange={() => setNormalize((v) => !v)} className="h-3.5 w-3.5 rounded border-slate-700 focus:ring-cyan-500" />
                <span className="text-[10px] text-slate-400">normalize shapes</span>
              </label>
            </div>

            {runA == null || runB == null ? (
              <p className="text-xs text-slate-400 italic">Select two distinct runs to compare.</p>
            ) : runA.id === runB.id ? (
              <p className="text-xs text-slate-400 italic">Select two distinct runs.</p>
            ) : (
              <>
                <p className="text-[10px] text-slate-500">{orderMode ? "matched by order +/-2% (stored RPM)" : "matched by frequency, max(2 Hz, 2%) — RPM not recorded"}</p>

                {/* Stem overlay chart */}
                {stemData.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No stored peaks for {dateFmt(runA.timestamp)} or {dateFmt(runB.timestamp)}.</p>
                ) : normalize ? (
                  <p className="text-[10px] text-amber-400/80 italic">Shape view — each series scaled to its own maximum; do not compare amplitudes across series.</p>
                ) : (
                  <div className="h-[200px] bg-slate-950/80 rounded-lg border border-slate-800">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={stemData} margin={{ top: 8, right: 12, bottom: 24, left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis type="number" dataKey="frequency" domain={[0, "dataMax"]} stroke="#94a3b8" tick={{ fontSize: 9 }} tickFormatter={(v) => String(Math.round(Number(v)))} label={{ value: "Hz", position: "insideBottom", offset: -8, fill: "#64748b", fontSize: 10 }} />
                        <YAxis stroke="#38bdf8" tick={{ fontSize: 9 }} domain={[0, stemYMax]} label={{ value: unit, angle: -90, position: "insideLeft", fill: "#38bdf8", fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} formatter={(value: number, name: string) => [`${Number(value).toFixed(3)} ${unit}`, name === "a" ? `A (${dateFmt(runA.timestamp)})` : `B (${dateFmt(runB.timestamp)})`]} labelFormatter={(l) => `${l} Hz`} />
                        <Bar dataKey="a" fill="#38bdf8" fillOpacity={0.5} barSize={3} isAnimationActive={false} name="A" />
                        <Bar dataKey="b" fill="#f472b6" fillOpacity={0.5} barSize={3} isAnimationActive={false} name="B" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Change lists */}
                {(diff.appeared.length > 0 || diff.grew.length > 0 || diff.settled.length > 0) && (
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    {/* APPEARED */}
                    <div>
                      <span className="font-semibold text-emerald-400 uppercase">Appeared</span>
                      <span className="ml-1 text-slate-500">({diff.appeared.length})</span>
                      {diff.appeared.length === 0 ? (
                        <p className="text-slate-500 mt-0.5">none</p>
                      ) : (
                        <ul className="mt-0.5 space-y-0.5">
                          {diff.appeared.slice(0, showMoreAppeared ? diff.appeared.length : 6).map((d, i) => (
                            <li key={`${d.a.frequency}-${i}`} className="text-slate-300">
                              <span className="font-mono">{d.a.frequency.toFixed(1)}</span> Hz · <span className="font-mono">{d.a.amplitude.toFixed(3)}</span> {unit}
                            </li>
                          ))}
                        </ul>
                      )}
                      {diff.appeared.length > 6 && (
                        <button onClick={() => setShowMoreAppeared((v) => !v)} className="text-slate-500 hover:text-slate-300 mt-0.5">
                          {showMoreAppeared ? "show less" : `+${diff.appeared.length - 6} more`}
                        </button>
                      )}
                    </div>

                    {/* GREW */}
                    <div>
                      <span className="font-semibold text-red-400 uppercase">Grew</span>
                      <span className="ml-1 text-slate-500">({diff.grew.length})</span>
                      {diff.grew.length === 0 ? (
                        <p className="text-slate-500 mt-0.5">none</p>
                      ) : (
                        <ul className="mt-0.5 space-y-0.5">
                          {diff.grew.slice(0, showMoreGrew ? diff.grew.length : 6).map((d, i) => (
                            <li key={`${d.a.frequency}-${i}`} className="text-slate-300">
                              <span className="font-mono">{d.a.frequency.toFixed(1)}</span> Hz · <span className="font-mono text-red-400">+{((d.b!.amplitude - d.a.amplitude) / d.a.amplitude * 100).toFixed(0)}%</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {diff.grew.length > 6 && (
                        <button onClick={() => setShowMoreGrew((v) => !v)} className="text-slate-500 hover:text-slate-300 mt-0.5">
                          {showMoreGrew ? "show less" : `+${diff.grew.length - 6} more`}
                        </button>
                      )}
                    </div>

                    {/* SETTLED */}
                    <div>
                      <span className="font-semibold text-sky-400 uppercase">Settled</span>
                      <span className="ml-1 text-slate-500">({diff.settled.length})</span>
                      {diff.settled.length === 0 ? (
                        <p className="text-slate-500 mt-0.5">none</p>
                      ) : (
                        <ul className="mt-0.5 space-y-0.5">
                          {diff.settled.slice(0, showMoreSettled ? diff.settled.length : 6).map((d, i) => (
                            <li key={`${d.a.frequency}-${i}`} className="text-slate-300">
                              <span className="font-mono">{d.a.frequency.toFixed(1)}</span> Hz · <span className="font-mono text-sky-400">{((d.b!.amplitude - d.a.amplitude) / d.a.amplitude * 100).toFixed(0)}%</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {diff.settled.length > 6 && (
                        <button onClick={() => setShowMoreSettled((v) => !v)} className="text-slate-500 hover:text-slate-300 mt-0.5">
                          {showMoreSettled ? "show less" : `+${diff.settled.length - 6} more`}
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {diff.appeared.length === 0 && diff.grew.length === 0 && diff.settled.length === 0 && (
                  <p className="text-xs text-slate-400 italic">All matched peaks within ±25% — no significant changes.</p>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ═══ S4: AUDIT STRIP ═══ */}
      <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3 space-y-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Audit Strip</div>
        {zoneHistory.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No stored vibration runs.</p>
        ) : (
          <>
            {/* Zone ticks timeline */}
            <div className="flex items-center gap-0.5 flex-wrap">
              {zoneHistory.map((zh) => (
                <div key={zh.id} className="flex flex-col items-center">
                  <div className={`w-2 h-2 rounded-full ${zoneColor(zh.zone)}`} title={`${dateFmt(zh.ts)} — Zone ${zh.zone}`} />
                  <span className="text-[7px] text-slate-600 leading-none mt-0.5">{dateFmt(zh.ts).split(",")[0]}</span>
                </div>
              ))}
            </div>

            {/* One-line callout */}
            {selectedAnalysis && (() => {
              const firstZone = zoneHistory[0]?.zone ?? "—";
              const lastZone = zoneHistory[zoneHistory.length - 1]?.zone ?? "—";
              const firstFault = faultHistory[0];
              const firstAppear = firstFault?.series[0];
              const vanished = faultHistory.filter((f) => f.series.length < vibrationRuns.length);
              const runsLackingZone = vibrationRuns.length - zoneHistory.length;
              return (
                <p className="text-[11px] text-slate-400">
                  Zone <span className="font-bold">{firstZone}</span> → <span className="font-bold">{lastZone}</span> over {vibrationRuns.length} runs
                  {runsLackingZone > 0 && <span className="text-slate-500"> ({runsLackingZone} run{runsLackingZone > 1 ? "s" : ""} lack zone data)</span>}
                  {firstAppear && <span> · {firstFault.title} first appeared {dateFmt(firstAppear.ts)}</span>}
                  {vanished.length > 0 && <span> · {vanished.length} fault{vanished.length > 1 ? "s" : ""} absent in some runs</span>}
                </p>
              );
            })()}

            {/* Fault evolution lines */}
            {faultHistory.filter((f) => f.series.length < vibrationRuns.length).slice(0, 3).map((fh) => {
              const firstDate = fh.series.length ? dateFmt(fh.series[0].ts) : "—";
              const lastDate = fh.series.length ? dateFmt(fh.series[fh.series.length - 1].ts) : "—";
              const absentCount = vibrationRuns.length - fh.series.length;
              return (
                <p key={fh.title} className="text-[10px] text-slate-500">
                  <span className="text-slate-400">{fh.title}</span>: first seen {firstDate}, last seen {lastDate} · absent in {absentCount} run{absentCount > 1 ? "s" : ""}
                </p>
              );
            })}
          </>
        )}
      </div>

      <p className="text-[10px] text-slate-600 text-center pt-2">Analyst workbook — forecasts are model extrapolation, not guarantees; planning and prescriptions live on the fusion page.</p>
    </div>
  );
}
