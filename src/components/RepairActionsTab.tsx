import React, { useMemo, useState, useEffect, useCallback } from "react";
import { FileText, ArrowUp, ArrowDown, Minus, Save, Check, Lock, Shield, Wrench } from "lucide-react";
import { getPrescription, DICTIONARY_VERSION, type PrescriptivePackage } from "../lib/maintenance/prescriptiveDictionary";
import type { SavedAnalysisResult, SavedFaultItem } from "../lib/analysisPersistence";
import { CmmsWorkOrderBridge } from "./CmmsWorkOrderBridge";
import { buildBridgeContext } from "../lib/diagnostics/cmmsPayload";
import { useToast } from "./Toast";

// ── Helpers ────────────────────────────────────────────────────────────────
function parsePeaks(row: SavedAnalysisResult | null): Array<{ frequency: number; amplitude: number }> {
  if (!row) return [];
  const out: Array<{ frequency: number; amplitude: number }> = [];
  const n = (v: unknown): number => (typeof v === "number" || typeof v === "string") && Number.isFinite(Number(v)) ? Number(v) : NaN;
  const walk = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const it of v) walk(it); return; }
    const o = v as Record<string, unknown>;
    const f = n(o.frequencyHz ?? o.frequency_hz ?? o.freqHz ?? o.freq_hz ?? o.frequency ?? o.freq ?? o.hz ?? o.count);
    const a = n(o.amplitude ?? o.amp ?? o.value);
    if (f > 0 && a > 0) { out.push({ frequency: f, amplitude: a }); return; }
    for (const k of ["record", "telemetry_data", "telemetry", "vibration_trend_record", "spectral", "spectrum", "peaks", "fft_data", "vibration_peaks"]) {
      if (o[k] != null) walk(o[k]);
    }
  };
  walk(row);
  return out;
}
function faultFreq(fault: SavedFaultItem): number | null {
  const hz = fault.frequencyHz ?? (typeof fault.frequency === "number" ? fault.frequency : typeof fault.frequency === "string" ? Number(fault.frequency) : NaN);
  return Number.isFinite(hz) && hz > 0 ? hz : null;
}
function findAmplitude(peaks: Array<{ frequency: number; amplitude: number }>, targetHz: number, tolHz = 2): number | null {
  let best: number | null = null; let bestDist = Infinity;
  for (const p of peaks) { const d = Math.abs(p.frequency - targetHz); if (d <= tolHz && d < bestDist) { bestDist = d; best = p.amplitude; } }
  return best;
}
function severityColor(ratio: number): string {
  if (ratio < 0.5) return "bg-emerald-500"; if (ratio < 0.8) return "bg-amber-400"; if (ratio < 1.0) return "bg-orange-500"; return "bg-red-500";
}

// ── Types ──────────────────────────────────────────────────────────────────
interface RepairCostEntry { repair: number | null; replacement: number | null; }
interface PlanningInputs { leadTimeDays: number | null; nextShutdownDate: string | null; downtimeCostPerDay: number | null; repairCosts?: Record<string, RepairCostEntry>; }
export interface RepairActionsTabProps { isActive: boolean; selectedAnalysis: SavedAnalysisResult | null; loadedAnalyses: SavedAnalysisResult[]; assetId?: string | null; }

// ── Avg run interval ───────────────────────────────────────────────────────
function computeAvgIntervalDays(timestamps: string[]): { days: number; fallback: boolean } {
  if (timestamps.length < 2) return { days: 30, fallback: true };
  const sorted = [...timestamps].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  let total = 0;
  for (let i = 1; i < sorted.length; i++) { total += (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86400000; }
  const avg = total / (sorted.length - 1);
  return { days: Math.round(avg) || 30, fallback: false };
}

// ── Timing ─────────────────────────────────────────────────────────────────
interface TimingResult { executeBy: string | null; method: string; recommendation: string; costOfWait: string | null; intervalLabel: string; }
function computeTiming(trend: { first: number; last: number; delta: number } | null, alarmMmS: number, inputs: PlanningInputs | null, avgDays: number, intervalFallback: boolean): TimingResult | null {
  if (!inputs || inputs.leadTimeDays == null || inputs.nextShutdownDate == null || inputs.downtimeCostPerDay == null) return null;
  if (!trend || trend.delta <= 0.005) return { executeBy: null, method: "no growth", recommendation: "no growth trend - schedule at convenience", costOfWait: null, intervalLabel: "" };
  const ratePerRun = trend.delta;
  const runsToAlarm = (alarmMmS - trend.last) / ratePerRun;
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
  return { executeBy, method: "linear trend extrapolation", recommendation, costOfWait: costText, intervalLabel: intervalFallback ? "linear trend extrapolation - not a failure model; avg run interval assumed 30 days - too few dated runs" : `linear trend extrapolation - not a failure model; avg run interval ${avgDays} days` };
}

// ── RUL ────────────────────────────────────────────────────────────────────
const REPLACE_RATIO_THRESHOLD = 0.5;
const REPLACE_RUL_THRESHOLD_DAYS = 365;
function computeRulDays(trend: { first: number; last: number; delta: number } | null, alarmMmS: number, avgDays: number, intervalFallback: boolean): { days: number | null; label: string } {
  if (!trend || trend.delta <= 0.005) return { days: null, label: "" };
  const ratePerRun = trend.delta;
  const runsToAlarm = (alarmMmS - trend.last) / ratePerRun;
  if (!Number.isFinite(runsToAlarm) || runsToAlarm <= 0) return { days: 0, label: "" };
  return { days: Math.round(runsToAlarm * avgDays), label: intervalFallback ? "linear trend extrapolation - not a failure model; avg run interval assumed 30 days - too few dated runs" : `linear trend extrapolation - not a failure model; avg run interval ${avgDays} days` };
}

// ── Priority Score ─────────────────────────────────────────────────────────
// Weights: severity 0.4, trend 0.3, downtime 0.2, base 0.1
// Example: resting unbalance (sev 0.0223, trend 0.92, downtime 0, base 0.8)
//   => rawSum 0.36493 => score 36
const WEIGHTS = { severity: 0.4, trend: 0.3, downtime: 0.2, base: 0.1 } as const;
function computePriorityScore(amplitude: number | null, trend: { delta: number } | null, dangerMmS: number, defaultPriority: 1 | 2 | 3 | 4 | 5, downtimeCostPerDay: number | null): { score: number; rawSum: number; breakdown: string } {
  const sevRatio = amplitude != null ? Math.min(amplitude / dangerMmS, 1) : 0;
  const trendRatio = trend != null && amplitude != null && amplitude > 0 ? Math.min(Math.max(trend.delta, 0) / amplitude, 1) : 0;
  const dtRatio = downtimeCostPerDay != null ? Math.min(downtimeCostPerDay / 10000, 1) : 0;
  const baseRatio = (6 - defaultPriority) / 5;
  const sevTerm = WEIGHTS.severity * sevRatio;
  const trendTerm = WEIGHTS.trend * trendRatio;
  const dtTerm = WEIGHTS.downtime * dtRatio;
  const baseTerm = WEIGHTS.base * baseRatio;
  const rawSum = sevTerm + trendTerm + dtTerm + baseTerm;
  const score = Math.round(rawSum * 100);
  const fmt = (v: number) => v.toFixed(4);
  const dtLabel = downtimeCostPerDay != null ? "entered" : "not entered";
  const breakdown = `sev: ${fmt(sevRatio)} x ${WEIGHTS.severity} = ${fmt(sevTerm)} | trend: ${fmt(trendRatio)} x ${WEIGHTS.trend} = ${fmt(trendTerm)} | dt: ${fmt(dtRatio)} x ${WEIGHTS.downtime} = ${fmt(dtTerm)} [${dtLabel}] | base: ${fmt(baseRatio)} x ${WEIGHTS.base} = ${fmt(baseTerm)}`;
  return { score, rawSum, breakdown };
}

// ── Ranked Fault Card ──────────────────────────────────────────────────────
function FaultCard({ fault, prescription, amplitude, trend, timing, repairCost, replacementCost, onRepairCostChange, onReplacementCostChange, rulDays, intervalLabel, planningInputs }: {
  key?: React.Key; fault: SavedFaultItem; prescription: PrescriptivePackage; amplitude: number | null;
  trend: { first: number; last: number; delta: number } | null; timing: TimingResult | null;
  repairCost: number | null; replacementCost: number | null;
  onRepairCostChange: (v: number | null) => void; onReplacementCostChange: (v: number | null) => void;
  rulDays: number | null; intervalLabel: string; planningInputs: PlanningInputs | null;
}) {
  const { severityZones } = prescription;
  const barMax = severityZones.dangerMmS * 1.3;
  const alarmPct = Math.min((severityZones.alarmMmS / barMax) * 100, 100);
  const dangerPct = Math.min((severityZones.dangerMmS / barMax) * 100, 100);
  const ampPct = amplitude != null ? Math.min((amplitude / barMax) * 100, 100) : null;
  const ampRatio = amplitude != null ? amplitude / severityZones.dangerMmS : null;
  return (
    <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-200">{fault.title}</h4>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">P{prescription.defaultPriority}</span>
      </div>
      {prescription.isMapped ? (
        <>
          {(prescription.safety.loto.length > 0 || prescription.safety.ppe) && (
            <div className="flex flex-wrap gap-1.5">
              {prescription.safety.loto.map((entry, i) => (
                <span key={`loto-${i}`} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  <Lock className="h-2.5 w-2.5" />{entry}
                </span>
              ))}
              {prescription.safety.ppe && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">
                  <Shield className="h-2.5 w-2.5" />{prescription.safety.ppe}
                </span>
              )}
            </div>
          )}
          {prescription.procedure.length > 0 && (
            <div>
              <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Procedure</h5>
              <ol className="list-decimal list-inside space-y-0.5">{prescription.procedure.map((s) => (
                <li key={s.step} className="text-xs text-slate-300">{s.task}{s.tolerance && <span className="text-[10px] text-cyan-400 ml-1">({s.tolerance})</span>}</li>
              ))}</ol>
            </div>
          )}
          {prescription.parts.length > 0 && (
            <div>
              <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Parts</h5>
              <table className="w-full text-xs"><thead><tr className="text-slate-500"><th className="text-left font-normal">Name</th><th className="text-left font-normal">Spec</th><th className="text-right font-normal">Qty</th></tr></thead>
              <tbody>{prescription.parts.map((p, i) => (
                <tr key={i} className="text-slate-300 border-t border-slate-800"><td className="py-0.5">{p.name}</td><td className="py-0.5 text-slate-400">{p.spec}</td><td className="py-0.5 text-right">{p.qty}</td></tr>
              ))}</tbody></table>
            </div>
          )}
          {prescription.tools.length > 0 && (
            <div>
              <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Tools</h5>
              <div className="flex flex-wrap gap-1">{prescription.tools.map((t, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">{t}</span>
              ))}</div>
            </div>
          )}
          <div className="text-[11px] text-slate-400">Est. labor: <span className="text-slate-200 font-medium">{prescription.laborHours}h</span></div>
          {amplitude != null && ampPct != null && ampRatio != null && (
            <div>
              <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Severity</h5>
              <div className="relative h-3 bg-slate-800 rounded-full overflow-visible">
                <div className={`absolute inset-y-0 left-0 rounded-full ${severityColor(ampRatio)}`} style={{ width: `${ampPct}%` }} />
                <div className="absolute top-0 bottom-0 w-px bg-amber-400" style={{ left: `${alarmPct}%` }} />
                <div className="absolute top-0 bottom-0 w-px bg-red-500" style={{ left: `${dangerPct}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 mt-0.5"><span>0</span><span className="text-amber-400">{severityZones.alarmMmS} mm/s alarm</span><span className="text-red-500">{severityZones.dangerMmS} mm/s danger</span></div>
              <div className="text-[11px] text-slate-300 mt-0.5">Measured: <span className="font-medium">{amplitude.toFixed(2)} mm/s</span></div>
            </div>
          )}
          {amplitude == null && <div className="text-[11px] text-slate-500">No matching peak found in stored spectrum (±2 Hz).</div>}
          <div className="text-[11px]">
            {trend ? (
              <span className="text-slate-300">
                {trend.delta > 0.005 ? <ArrowUp className="inline h-3 w-3 text-red-400" /> : trend.delta < -0.005 ? <ArrowDown className="inline h-3 w-3 text-emerald-400" /> : <Minus className="inline h-3 w-3 text-slate-500" />}
                {" "}{trend.first.toFixed(2)} → {trend.last.toFixed(2)} mm/s
                <span className="text-slate-500 ml-1">(Δ {trend.delta >= 0 ? "+" : ""}{trend.delta.toFixed(2)})</span>
                <span className="text-slate-600 ml-1">· stored trend – linear only</span>
              </span>
            ) : <span className="text-slate-500">No stored trend</span>}
          </div>
          {timing && (
            <div className="text-sm border-t border-slate-800 pt-2 mt-2 space-y-1">
              {timing.executeBy && <div><span className="text-slate-400">Execute by: </span><span className="text-amber-300 font-medium">{timing.executeBy}</span><span className="text-slate-600 ml-1">({timing.intervalLabel})</span></div>}
              {!timing.executeBy && timing.method === "no growth" && <div className="text-emerald-400">{timing.recommendation}</div>}
              {!timing.executeBy && timing.method !== "no growth" && <div className="text-red-400">{timing.recommendation}</div>}
              <div className="text-slate-300">{timing.recommendation}</div>
              {timing.costOfWait && <div className="text-slate-500">{timing.costOfWait}</div>}
              {timing.executeBy && planningInputs?.leadTimeDays != null && planningInputs?.nextShutdownDate != null && planningInputs?.downtimeCostPerDay != null && (() => {
                const daysToShutdown = Math.round((new Date(planningInputs.nextShutdownDate!).getTime() - Date.now()) / 86400000);
                const lead = planningInputs.leadTimeDays!;
                if (daysToShutdown > 0 && daysToShutdown < lead) {
                  const gap = lead - daysToShutdown;
                  const cost = planningInputs.downtimeCostPerDay!;
                  return (
                    <div className="text-[11px] px-2 py-1 rounded bg-red-500/15 text-red-300 border border-red-500/30 mt-1">
                      High Risk: part lead time ({lead}d) exceeds window to next shutdown ({daysToShutdown}d) — ${cost.toLocaleString()}/day x {gap}d gap = ${(cost * gap).toLocaleString()} exposure
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}
          {!timing && <div className="text-sm text-slate-500 border-t border-slate-800 pt-2 mt-2">enter planning inputs to compute timing</div>}
          <div className="border-t border-slate-800 pt-2 mt-2 space-y-2">
            <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Repair vs Replace</h5>
            <div className="flex gap-3">
              <div><label className="text-[10px] text-slate-500 block mb-0.5">Repair cost $</label>
                <input type="number" min={0} value={repairCost ?? ""} onChange={(e) => onRepairCostChange(e.target.value ? Number(e.target.value) : null)} className="h-7 w-24 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/60" /></div>
              <div><label className="text-[10px] text-slate-500 block mb-0.5">Replacement cost $</label>
                <input type="number" min={0} value={replacementCost ?? ""} onChange={(e) => onReplacementCostChange(e.target.value ? Number(e.target.value) : null)} className="h-7 w-24 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/60" /></div>
            </div>
            {repairCost != null && replacementCost != null && replacementCost > 0 && (
              <div className="text-[11px] space-y-1">
                <div className="text-slate-300">
                  ratio = <span className="font-mono">${repairCost.toLocaleString()}</span> / <span className="font-mono">${replacementCost.toLocaleString()}</span> = <span className="font-mono font-medium">{(repairCost / replacementCost).toFixed(2)}</span>
                </div>
                <div className="text-slate-300">
                  rul = <span className="font-mono">{rulDays != null ? `${rulDays} days` : "not estimable"}</span>
                  <span className="text-slate-500 ml-1">({intervalLabel})</span>
                </div>
                {rulDays != null && (
                  <div className="space-y-0.5">
                    <div className="text-slate-400">ratio ≥ 0.5: <span className={repairCost / replacementCost >= REPLACE_RATIO_THRESHOLD ? "text-emerald-400" : "text-slate-500"}>{repairCost / replacementCost >= REPLACE_RATIO_THRESHOLD ? "TRUE" : "FALSE"}</span> ({(repairCost / replacementCost).toFixed(2)} ≥ 0.5)</div>
                    <div className="text-slate-400">rul &lt; 365 days: <span className={rulDays < REPLACE_RUL_THRESHOLD_DAYS ? "text-emerald-400" : "text-slate-500"}>{rulDays < REPLACE_RUL_THRESHOLD_DAYS ? "TRUE" : "FALSE"}</span> ({rulDays} &lt; 365)</div>
                  </div>
                )}
                <div className="pt-1 font-semibold text-sm">
                  {rulDays != null ? (
                    repairCost / replacementCost >= REPLACE_RATIO_THRESHOLD && rulDays < REPLACE_RUL_THRESHOLD_DAYS
                      ? <span className="text-red-400">Evaluate Capital Replacement</span>
                      : <span className="text-emerald-400">Proceed with Planned Repair</span>
                  ) : (
                    <span className="text-slate-300">not time-critical - choose on cost (cheaper: <span className="font-mono">{repairCost <= replacementCost ? `repair $${repairCost.toLocaleString()}` : `replace $${replacementCost.toLocaleString()}`}</span>)</span>
                  )}
                </div>
              </div>
            )}
            {(repairCost == null || replacementCost == null) && <div className="text-[10px] text-slate-500 italic">enter both costs to see repair-vs-replace recommendation</div>}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-400 italic">No procedure mapped in dictionary v{DICTIONARY_VERSION}</p>
          {prescription.diagnosis && <div className="text-xs text-slate-500">Raw recommendation: {prescription.diagnosis}</div>}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function RepairActionsTab({ isActive, selectedAnalysis, loadedAnalyses, assetId }: RepairActionsTabProps) {
  // ── ALL hooks FIRST (unconditional) ───────────────────────────────────
  const [planningInputs, setPlanningInputs] = useState<PlanningInputs | null>(null);
  const [draftInputs, setDraftInputs] = useState<PlanningInputs>({ leadTimeDays: null, nextShutdownDate: null, downtimeCostPerDay: null });
  const [repairCosts, setRepairCosts] = useState<Record<string, RepairCostEntry>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showBridge, setShowBridge] = useState(false);
  const { toast } = useToast();
  useEffect(() => {
    if (!assetId) { setLoaded(true); return; }
    setLoaded(false);
    fetch(`/api/assets/${assetId}/planning-config`).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (data && typeof data === "object") { setPlanningInputs(data); setDraftInputs(data); setRepairCosts(data.repairCosts ?? {}); }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [assetId]);
  const faults: SavedFaultItem[] = selectedAnalysis?.fault_list ?? [];
  const currentPeaks = useMemo(() => parsePeaks(selectedAnalysis), [selectedAnalysis]);
  // Match history by asset_id + component + analysis_type, timestamp <= selected, exclude selected row
  const historyPeaks = useMemo(() => {
    if (!selectedAnalysis) return [];
    const selTs = new Date(selectedAnalysis.timestamp).getTime();
    return loadedAnalyses
      .filter((r) => r.id !== selectedAnalysis.id && r.asset_id === selectedAnalysis.asset_id && r.component === selectedAnalysis.component && (r.analysis_type ?? "vibration") === (selectedAnalysis.analysis_type ?? "vibration") && new Date(r.timestamp).getTime() <= selTs)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((r) => ({ id: r.id, timestamp: r.timestamp, peaks: parsePeaks(r) }));
  }, [loadedAnalyses, selectedAnalysis]);
  const hasLaterSameModality = useMemo(() => {
    if (!selectedAnalysis) return false;
    const selTs = new Date(selectedAnalysis.timestamp).getTime();
    return loadedAnalyses.some((r) => r.id !== selectedAnalysis.id && r.asset_id === selectedAnalysis.asset_id && r.component === selectedAnalysis.component && (r.analysis_type ?? "vibration") === (selectedAnalysis.analysis_type ?? "vibration") && new Date(r.timestamp).getTime() > selTs);
  }, [loadedAnalyses, selectedAnalysis]);
  const avgInterval = useMemo(() => {
    const ts = historyPeaks.map((h) => h.timestamp);
    if (selectedAnalysis) ts.push(selectedAnalysis.timestamp);
    return computeAvgIntervalDays(ts);
  }, [historyPeaks, selectedAnalysis]);
  const ranked: Array<{ fault: SavedFaultItem; prescription: PrescriptivePackage; amplitude: number | null; trend: { first: number; last: number; delta: number } | null }> = useMemo(() => {
    const items = faults.map((fault) => {
      const prescription = getPrescription(fault.title); const hz = faultFreq(fault);
      const amplitude = hz != null ? findAmplitude(currentPeaks, hz) : null;
      let trend: { first: number; last: number; delta: number } | null = null;
      if (hz != null) {
        const series: number[] = [];
        for (const hp of historyPeaks) { const a = findAmplitude(hp.peaks, hz); if (a != null) series.push(a); }
        if (amplitude != null) series.push(amplitude);
        if (series.length >= 2) { const first = series[0]; const last = series[series.length - 1]; trend = { first, last, delta: last - first }; }
      }
      return { fault, prescription, amplitude, trend };
    });
    items.sort((a, b) => { const pa = a.prescription.defaultPriority; const pb = b.prescription.defaultPriority; if (pa !== pb) return pa - pb; return (b.amplitude ?? -1) - (a.amplitude ?? -1); });
    return items;
  }, [faults, currentPeaks, historyPeaks]);
  const hasInputs = planningInputs != null && planningInputs.leadTimeDays != null && planningInputs.nextShutdownDate != null && planningInputs.downtimeCostPerDay != null;
  const saveInputs = async () => {
    if (!assetId) return; setSaving(true); setSaved(false);
    const payload = { ...draftInputs, repairCosts };
    try { await fetch(`/api/assets/${assetId}/planning-config`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); setPlanningInputs({ ...payload }); setSaved(true); setTimeout(() => setSaved(false), 3000); } finally { setSaving(false); }
  };
  // ── Conditional guards (AFTER all hooks) ──────────────────────────────
  if (!isActive) return null;
  if (faults.length === 0) {
    return (<div className="flex flex-col items-center justify-center text-center py-16 px-4"><FileText className="h-8 w-8 text-slate-600 mb-3" /><p className="text-sm font-semibold text-slate-300">No data available</p><p className="text-sm text-slate-500 mt-1 max-w-md">Repair actions will appear when a saved analysis includes recommended parts and work.</p></div>);
  }
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-200">Prescriptive Action Plan</h3>
        <button onClick={() => setShowBridge(true)} className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded bg-amber-600/80 hover:bg-amber-500 text-white font-semibold transition-colors">
          <Wrench className="h-3 w-3" />Open Work Order Bridge
        </button>
      </div>
      {hasLaterSameModality && (
        <p className="text-[11px] text-amber-400/80">as of {new Date(selectedAnalysis!.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} - later runs excluded from trends</p>
      )}
      {assetId && (
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Planning Inputs</div>
          <div className="flex flex-wrap gap-3 items-end">
            <div><label className="text-[10px] text-slate-500 block mb-0.5">Lead time (days)</label>
              <input type="number" min={0} value={draftInputs.leadTimeDays ?? ""} onChange={(e) => setDraftInputs({ ...draftInputs, leadTimeDays: e.target.value ? Number(e.target.value) : null })} className="h-7 w-20 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-400/60" /></div>
            <div><label className="text-[10px] text-slate-500 block mb-0.5">Next shutdown</label>
              <input type="date" value={draftInputs.nextShutdownDate ?? ""} onChange={(e) => setDraftInputs({ ...draftInputs, nextShutdownDate: e.target.value || null })} className="h-7 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-400/60" /></div>
            <div><label className="text-[10px] text-slate-500 block mb-0.5">Downtime cost ($/day)</label>
              <input type="number" min={0} value={draftInputs.downtimeCostPerDay ?? ""} onChange={(e) => setDraftInputs({ ...draftInputs, downtimeCostPerDay: e.target.value ? Number(e.target.value) : null })} className="h-7 w-24 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-400/60" /></div>
            <button onClick={saveInputs} disabled={saving} className="h-7 px-3 rounded bg-amber-600 hover:bg-amber-500 text-[11px] font-semibold text-white flex items-center gap-1 disabled:opacity-50">
              <Save className="h-3 w-3" />{saving ? "Saving…" : "Save"}
            </button>
            {saved && <span className="text-[11px] text-emerald-400 flex items-center gap-1"><Check className="h-3 w-3" />saved ✓</span>}
          </div>
        </div>
      )}
      <div className="space-y-3">
        {ranked.map(({ fault, prescription, amplitude, trend }, i) => {
          const entry = repairCosts[fault.title] ?? { repair: null, replacement: null };
          const rul = computeRulDays(trend, prescription.severityZones.alarmMmS, avgInterval.days, avgInterval.fallback);
          return (
            <FaultCard key={`${fault.title}-${fault.frequencyHz ?? fault.frequency ?? i}`} fault={fault} prescription={prescription} amplitude={amplitude} trend={trend}
              timing={hasInputs ? computeTiming(trend, prescription.severityZones.alarmMmS, planningInputs, avgInterval.days, avgInterval.fallback) : null}
              repairCost={entry.repair} replacementCost={entry.replacement}
              onRepairCostChange={(v) => setRepairCosts((prev) => ({ ...prev, [fault.title]: { ...prev[fault.title], repair: v } }))}
              onReplacementCostChange={(v) => setRepairCosts((prev) => ({ ...prev, [fault.title]: { ...prev[fault.title], replacement: v } }))}
              rulDays={rul.days} intervalLabel={rul.label || (hasInputs ? computeTiming(trend, prescription.severityZones.alarmMmS, planningInputs, avgInterval.days, avgInterval.fallback)?.intervalLabel ?? "" : "")}
              planningInputs={planningInputs} />
          );
        })}
      </div>
      <p className="text-[10px] text-slate-600 text-center pt-2">Prescriptions from prescriptiveDictionary v{DICTIONARY_VERSION} – deterministic, curated content</p>
      {showBridge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowBridge(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">CMMS Work Order Bridge</h2>
              <button onClick={() => setShowBridge(false)} className="text-slate-400 hover:text-white transition-colors">✕</button>
            </div>
            <CmmsWorkOrderBridge
              context={buildBridgeContext(selectedAnalysis, { planningInputs, loadedAnalyses, repairCosts })}
              sectionId="repair-actions-bridge"
              onToast={toast}
            />
          </div>
        </div>
      )}
    </div>
  );
}
