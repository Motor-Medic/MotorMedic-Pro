import React, { useMemo, useState, useEffect } from "react";
import { FileText, ArrowUp, ArrowDown, Minus, Save } from "lucide-react";
import { getPrescription, DICTIONARY_VERSION, type PrescriptivePackage } from "../lib/maintenance/prescriptiveDictionary";
import type { SavedAnalysisResult, SavedFaultItem } from "../lib/analysisPersistence";

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
interface PlanningInputs { leadTimeDays: number | null; nextShutdownDate: string | null; downtimeCostPerDay: number | null; }
export interface RepairActionsTabProps { isActive: boolean; selectedAnalysis: SavedAnalysisResult | null; loadedAnalyses: SavedAnalysisResult[]; assetId?: string | null; }

// ── Timing ─────────────────────────────────────────────────────────────────
interface TimingResult { executeBy: string | null; method: string; recommendation: string; costOfWait: string | null; }
function computeTiming(trend: { first: number; last: number; delta: number } | null, alarmMmS: number, inputs: PlanningInputs | null): TimingResult | null {
  if (!inputs || inputs.leadTimeDays == null || inputs.nextShutdownDate == null || inputs.downtimeCostPerDay == null) return null;
  if (!trend || trend.delta <= 0.005) return { executeBy: null, method: "no growth", recommendation: "no growth trend - schedule at convenience", costOfWait: null };
  const ratePerRun = trend.delta;
  const runsToAlarm = (alarmMmS - trend.last) / ratePerRun;
  if (!Number.isFinite(runsToAlarm) || runsToAlarm <= 0) return { executeBy: null, method: "already past alarm", recommendation: "amplitude at or above alarm - execute immediately", costOfWait: null };
  const daysToAlarm = Math.round(runsToAlarm * 30);
  const execDate = new Date(); execDate.setDate(execDate.getDate() + daysToAlarm);
  const executeBy = execDate.toISOString().slice(0, 10);
  const shutdownDate = new Date(inputs.nextShutdownDate); const now = new Date();
  let recommendation: string; let costText: string | null = null;
  if (shutdownDate <= execDate && shutdownDate > now) {
    const daysDeferred = Math.round((shutdownDate.getTime() - now.getTime()) / 86400000);
    costText = `$${inputs.downtimeCostPerDay}/day x ${daysDeferred} days = $${(inputs.downtimeCostPerDay * daysDeferred).toFixed(0)}`;
    recommendation = `defer to shutdown ${inputs.nextShutdownDate}`;
  } else {
    const arrivalWindow = Math.round(daysToAlarm * 0.8);
    costText = `$${inputs.downtimeCostPerDay}/day x ${arrivalWindow} days = $${(inputs.downtimeCostPerDay * arrivalWindow).toFixed(0)}`;
    recommendation = `execute within ${inputs.leadTimeDays} days of parts arrival`;
  }
  return { executeBy, method: "linear trend extrapolation", recommendation, costOfWait: costText };
}

// ── Ranked Fault Card ──────────────────────────────────────────────────────
function FaultCard({ fault, prescription, amplitude, trend, timing }: {
  key?: React.Key; fault: SavedFaultItem; prescription: PrescriptivePackage; amplitude: number | null;
  trend: { first: number; last: number; delta: number } | null; timing: TimingResult | null;
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
            <div className="text-[11px] border-t border-slate-800 pt-2 space-y-1">
              {timing.executeBy && <div><span className="text-slate-400">Execute by: </span><span className="text-amber-300 font-medium">{timing.executeBy}</span><span className="text-slate-600 ml-1">({timing.method} – not a failure model)</span></div>}
              {!timing.executeBy && timing.method === "no growth" && <div className="text-emerald-400">{timing.recommendation}</div>}
              {!timing.executeBy && timing.method !== "no growth" && <div className="text-red-400">{timing.recommendation}</div>}
              <div className="text-slate-300">{timing.recommendation}</div>
              {timing.costOfWait && <div className="text-slate-500">{timing.costOfWait}</div>}
            </div>
          )}
          {!timing && <div className="text-[11px] text-slate-500 border-t border-slate-800 pt-2">enter planning inputs to compute timing</div>}
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
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!assetId) { setLoaded(true); return; }
    setLoaded(false);
    fetch(`/api/assets/${assetId}/planning-config`).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (data && typeof data === "object") { setPlanningInputs(data); setDraftInputs(data); }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [assetId]);
  const faults: SavedFaultItem[] = selectedAnalysis?.fault_list ?? [];
  const currentPeaks = useMemo(() => parsePeaks(selectedAnalysis), [selectedAnalysis]);
  // Match history by asset_id, exclude selected row, sort ascending by date
  const historyPeaks = useMemo(() => {
    const selAsset = selectedAnalysis?.asset_id ?? null;
    return loadedAnalyses
      .filter((r) => r.id !== selectedAnalysis?.id && (selAsset == null || r.asset_id === selAsset))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((r) => ({ id: r.id, timestamp: r.timestamp, peaks: parsePeaks(r) }));
  }, [loadedAnalyses, selectedAnalysis]);
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
    if (!assetId) return; setSaving(true);
    try { await fetch(`/api/assets/${assetId}/planning-config`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draftInputs) }); setPlanningInputs({ ...draftInputs }); } finally { setSaving(false); }
  };

  // ── Conditional guards (AFTER all hooks) ──────────────────────────────
  if (!isActive) return null;
  if (faults.length === 0) {
    return (<div className="flex flex-col items-center justify-center text-center py-16 px-4"><FileText className="h-8 w-8 text-slate-600 mb-3" /><p className="text-sm font-semibold text-slate-300">No data available</p><p className="text-sm text-slate-500 mt-1 max-w-md">Repair actions will appear when a saved analysis includes recommended parts and work.</p></div>);
  }
  return (
    <div className="space-y-4 p-4">
      <h3 className="text-base font-semibold text-slate-200">Prescriptive Action Plan</h3>
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
          </div>
        </div>
      )}
      <div className="space-y-3">
        {ranked.map(({ fault, prescription, amplitude, trend }, i) => (
          <FaultCard key={`${fault.title}-${fault.frequencyHz ?? fault.frequency ?? i}`} fault={fault} prescription={prescription} amplitude={amplitude} trend={trend}
            timing={hasInputs ? computeTiming(trend, prescription.severityZones.alarmMmS, planningInputs) : null} />
        ))}
      </div>
      <p className="text-[10px] text-slate-600 text-center pt-2">Prescriptions from prescriptiveDictionary v{DICTIONARY_VERSION} – deterministic, curated content</p>
    </div>
  );
}
