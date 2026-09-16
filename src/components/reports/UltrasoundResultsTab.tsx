/**
 * UltrasoundResultsTab — ultrasound / acoustic severity assessment.
 * US_DDB_BRACKETS (industry structure-borne delta-dB guidance, UE Systems/SDT);
 * no ISO severity standard exists for ultrasound; absence != normal; guidance labeled.
 */
import React, { useMemo } from "react";
import { AlertTriangle, CheckCircle2, FileText, Gauge, RadioTower, Waves, Zap } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { SEVERITY_LABEL, SEVERITY_STYLE } from "./reportPresentation";
import { classifyFaultFamily, FAULT_FAMILY_LABEL } from "../../lib/diagnostics/faultFamily";
import { evaluateUsSeverity, US_DDB_SOURCE } from "../../lib/maintenance/prescriptiveDictionary";
import { peakOfType } from "../../lib/diagnostics/sensorFusion";
export interface UltrasoundResultsTabProps { selectedAnalysis: SavedAnalysisResult; }
const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const card = "rounded-xl border border-white/10 bg-slate-950/40 p-4";
const cell = "rounded-lg border border-white/10 bg-slate-900/50 p-2.5";

function peaks(r: SavedAnalysisResult) {
  const p = peakOfType(r, "ultrasound") ?? (Array.isArray(r.peaks) ? r.peaks[0] as Record<string, unknown> : null);
  return { peakDb: num(p?.peak_dbmv), rmsDb: num(p?.rms_dbmv), baselineDb: num(p?.baseline_dbmv), deltaDb: num(p?.delta_db), crest: num(p?.crest_factor) ?? num(r.waveform_crest_factor) };
}
function meta(r: SavedAnalysisResult) {
  const td = (r.telemetry_data ?? {}) as Record<string, unknown>;
  return { mountType: td.sensor_mount_type ?? td.mountType ?? td.mount_type ?? null, centerKhz: num(td.center_frequency_khz ?? td.centerKhz ?? td.heterodyneKhz ?? td.frequency_khz ?? null), gainDb: num(td.gain_db ?? td.gainDb ?? null), noiseFloor: num(td.ambient_noise_floor ?? td.noise_floor_db ?? td.acoustic_noise_floor ?? null) };
}
function Field({ label, value, unit }: { label: string; value: unknown; unit?: string }) {
  return (<div className={cell}><p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p><p className={`text-sm font-mono mt-0.5 ${value != null ? "text-white" : "text-slate-500 italic"}`}>{value != null ? `${value}${unit ? ` ${unit}` : ""}` : "not recorded"}</p></div>);
}
const crestGuide = (c: number | null) => c == null ? null : c < 2 ? "Compact signal — low crest suggests broad-band (airborne/turbulence) rather than a discrete bearing event." : c <= 6 ? "Moderate crest — intermittent mechanical contact typical of dry/rubbing surfaces." : "High crest — burst-like signature consistent with spalling or discrete impacts.";
const sevClass = (r: SavedAnalysisResult) => { const s = (r.severity ?? "").toUpperCase(); return s.includes("CRITICAL") || s.includes("HIGH") ? "CRITICAL" : s.includes("MODERATE") || s.includes("MEDIUM") ? "ANOMALY" : s.includes("MINOR") || s.includes("LOW") ? "MINOR" : "NO_DATA"; };
const sevTone = (c: string | null) => c == null ? "" : c.includes("Class 1") ? "border-red-500/50 text-red-400 bg-red-500/10" : c.includes("Class 2") ? "border-amber-500/30 text-amber-400 bg-amber-500/10" : c.includes("Class 3") ? "border-sky-500/30 text-sky-400 bg-sky-500/10" : "border-emerald-500/30 text-emerald-400 bg-emerald-500/10";

export default function UltrasoundResultsTab({ selectedAnalysis }: UltrasoundResultsTabProps) {
  const pks = useMemo(() => peaks(selectedAnalysis), [selectedAnalysis]);
  const mt = useMemo(() => meta(selectedAnalysis), [selectedAnalysis]);
  const age = useMemo(() => selectedAnalysis.timestamp ? Math.floor((Date.now() - new Date(selectedAnalysis.timestamp).getTime()) / 86400000) : null, [selectedAnalysis.timestamp]);

  const delta = (() => {
    if (pks.deltaDb != null) {
      const c = pks.peakDb != null && pks.baselineDb != null ? pks.peakDb - pks.baselineDb : null;
      return { value: pks.deltaDb, audit: c != null && Math.abs(c - pks.deltaDb) < 0.05 ? "stored matches peak-baseline" : c != null ? "stored uses different definition" : "stored value only - endpoints not both recorded" };
    }
    if (pks.peakDb != null && pks.baselineDb != null) return { value: Math.round((pks.peakDb - pks.baselineDb) * 10) / 10, audit: "derived from peak - baseline (no stored delta)" };
    return { value: null as number | null, audit: "delta-dB unavailable - baseline not recorded" };
  })();
  const bracket = useMemo(() => delta.value != null ? evaluateUsSeverity(delta.value) : null, [delta.value]);
  const faults = useMemo(() => (Array.isArray(selectedAnalysis.fault_list) ? selectedAnalysis.fault_list : []).map(f => { const o = f as unknown as Record<string, unknown>; const t = String(o.fault ?? f.title ?? "Unknown"); return { title: t, sev: String(o.severity ?? f.severity ?? "MEDIUM"), conf: Number(o.confidence ?? f.confidence ?? 0), family: classifyFaultFamily(t) }; }), [selectedAnalysis.fault_list]);
  const recs = useMemo(() => (selectedAnalysis.recommendations ?? []).map(r => { const family = classifyFaultFamily(r); return { text: r, label: family === "unknown" ? "Unattributed (stored consensus)" : "Ultrasound" }; }), [selectedAnalysis.recommendations]);
  if (!selectedAnalysis || (selectedAnalysis.analysis_type ?? "vibration") !== "ultrasound") return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <FileText className="h-8 w-8 text-slate-600 mb-3" />
      <p className="text-sm font-semibold text-slate-300">No ultrasound run selected</p>
      <p className="text-sm text-slate-500 mt-1 max-w-md">Choose from run history — the ultrasound tile requires an acoustic record.</p>
    </div>
  );
  return (<div className="space-y-4">
    <div className={card}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="flex items-center gap-2"><Waves className="h-4 w-4 text-cyan-400 shrink-0" /><h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Ultrasound / Acoustic Severity Assessment</h4></div><p className="text-sm text-slate-500 mt-1">{selectedAnalysis.component || "—"} · {selectedAnalysis.asset_id || "—"},</p></div>
        <span className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider shrink-0 ${SEVERITY_STYLE[sevClass(selectedAnalysis) as keyof typeof SEVERITY_STYLE]}`}>{SEVERITY_LABEL[sevClass(selectedAnalysis) as keyof typeof SEVERITY_LABEL]}</span>
      </div>
      <p className="text-[10px] text-slate-500 mt-1">{US_DDB_SOURCE}</p>
    </div>
    <div className={card}>
      <div className="flex items-center gap-2 mb-3"><RadioTower className="h-4 w-4 text-sky-400 shrink-0" /><h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Capture Metadata</h4></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Sensor Mount Type" value={mt.mountType} />
        <Field label="Center / Heterodyne Frequency" value={mt.centerKhz} unit="kHz" />
        <Field label="Gain" value={mt.gainDb} unit="dB" />
        <Field label="Ambient Acoustic Noise Floor" value={mt.noiseFloor} unit="dB" />
      </div>
    </div>
    <div className={card}>
      <div className="flex items-center gap-2 mb-3"><Gauge className="h-4 w-4 text-amber-400 shrink-0" /><h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Readings</h4></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <div className={cell}><p className="text-[10px] text-slate-500 uppercase tracking-wider">Peak</p><p className="text-sm font-mono font-bold text-white mt-0.5">{pks.peakDb != null ? `${pks.peakDb} dBµV` : "not recorded"}</p>{age != null && <span className={`inline-block mt-1 rounded border px-1.5 py-0.5 text-[9px] font-bold ${age === 0 ? "border-emerald-500/30 text-emerald-400" : "border-slate-600 text-slate-400"}`}>{age === 0 ? "recorded today" : `${age}d old`}</span>}</div>
        <Field label="RMS" value={pks.rmsDb} unit="dBµV" />
        <Field label="Baseline" value={pks.baselineDb} unit="dBµV" />
        <Field label="Delta over Baseline" value={pks.deltaDb != null ? pks.deltaDb : null} unit="dB" />
      </div>
      <p className="text-[11px] text-slate-500 mt-2"><span className="font-semibold">Delta audit: </span>{delta.audit}</p>
      {pks.crest != null && <div className={`${cell} mt-2`}><p className="text-[10px] text-slate-500 uppercase tracking-wider">Crest Factor</p><p className="text-sm font-mono font-bold text-white mt-0.5">{pks.crest}</p><p className="text-[10px] text-slate-500 mt-1 italic">{crestGuide(pks.crest)}</p><p className="text-[9px] text-slate-600 italic">interpretation guide — not a diagnosis</p></div>}
    </div>
    <div className={`rounded-xl border p-4 ${bracket ? sevTone(bracket.clazz) : "border-slate-600 bg-slate-800/30"}`}>
      <div className="flex items-start gap-3">
        <Zap className={`h-5 w-5 shrink-0 mt-0.5 ${bracket?.clazz.includes("Class 1") ? "text-red-400" : "text-amber-400"}`} />
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-1">Ultrasound Severity Evaluation</p>
          {delta.value == null ? <p className="text-xs text-slate-400 italic">delta-dB unavailable — baseline not recorded; no severity class claimed.</p> : bracket ? <p className="text-xs text-slate-300">Δ {delta.value} dB: <span className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${sevTone(bracket.clazz)}`}>{bracket.clazz}</span> <span className="text-slate-500">· {bracket.action}</span></p> : null}
          <p className="text-[10px] text-slate-500 mt-1">Source: {US_DDB_SOURCE}</p>
        </div>
      </div>
    </div>
    {faults.length > 0 && <div className={card}>
      <div className="flex items-center gap-2 mb-3"><AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" /><h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Fault Diagnoses</h4></div>
      <ul className="space-y-1.5">{faults.map((f, i) => (
        <li key={i} className="flex items-center gap-2 text-xs text-slate-300">
          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${SEVERITY_STYLE[f.sev as keyof typeof SEVERITY_STYLE]}`}>{SEVERITY_LABEL[f.sev as keyof typeof SEVERITY_LABEL]}</span>
          <span className="font-semibold text-white">{f.title}</span>
          <span className="text-slate-500">({f.conf}% · {FAULT_FAMILY_LABEL[f.family]})</span>
        </li>
      ))}</ul></div>}
    {recs.length > 0 && <div className={card}>
      <div className="flex items-center gap-2 mb-3"><CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /><h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Recommendations</h4></div>
      <ul className="space-y-1.5">{recs.map((r, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
          <span className="text-slate-500 shrink-0">{r.label}:</span>{r.text}
        </li>
      ))}</ul></div>}
  </div>);
}