/**
 * Thermography Results Tab — IR thermal severity assessment.
 * NFPA 70B-2023 dual-axis severity; models labeled; absence ≠ normal.
 */
import React, { useMemo } from "react";
import { AlertTriangle, CheckCircle2, FileText, Flame, Gauge, Info, Shield, ShieldAlert, Thermometer, Zap } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { SEVERITY_LABEL, SEVERITY_STYLE } from "./reportPresentation";
import { classifyFaultFamily, FAULT_FAMILY_LABEL } from "../../lib/diagnostics/faultFamily";
import { evaluateIrSeverity, IR_PP_BRACKETS, IR_PA_BRACKETS, type IrSeverityBracket } from "../../lib/maintenance/prescriptiveDictionary";

export interface ThermographyResultsTabProps { selectedAnalysis: SavedAnalysisResult; }

function extractMeta(r: SavedAnalysisResult) {
  const td = (r.telemetry_data ?? {}) as Record<string, unknown>;
  return {
    emissivity: td.emissivity ?? null, reflectedTemp: td.reflectedTemp ?? null,
    ambientTemp: td.ambient_temp ?? td.ambientTemp ?? null,
    measuredAmps: r.measured_amps ?? null, ratedAmps: r.rated_amps ?? null,
    distance: td.distance ?? null, humidity: td.humidity ?? null,
    tempUnit: (td.tempUnit ?? "°F") as string,
    phaseA: r.phase_a_temp ?? null, phaseB: r.phase_b_temp ?? null, phaseC: r.phase_c_temp ?? null,
    storedNorm: r.i2r_normalized_delta_t ?? null,
  };
}

function extractPeaks(r: SavedAnalysisResult) {
  const p = (Array.isArray(r.peaks) ? r.peaks[0] : undefined) as Record<string, unknown> | undefined;
  return { hotspot: p?.hotspot_temp ?? p?.hotspotTemp ?? null, deltaT: p?.delta_t ?? p?.deltaT ?? null };
}

const dTtoC = (dT: number, unit: string) => unit === "°F" ? dT * (5 / 9) : dT;
const fmtTemp = (v: number | null, u: string) => v == null ? "—" : `${v.toFixed(1)}${u}`;
const fmtDeltaT = (dT: number | null, u: string) => {
  if (dT == null) return "—";
  const s = `${dT.toFixed(1)}${u}`;
  return u === "°F" ? `${s} (Δ ${(dT * 5 / 9).toFixed(1)}°C)` : `${s} (Δ ${(dT * 9 / 5).toFixed(1)}°F)`;
};
const sevClass = (r: SavedAnalysisResult) => {
  const s = (r.severity ?? "").toUpperCase();
  if (s.includes("CRITICAL") || s.includes("HIGH")) return "CRITICAL";
  if (s.includes("ANOMALY") || s.includes("MEDIUM")) return "ANOMALY";
  if (s.includes("NORMAL") || s.includes("LOW")) return "NORMAL";
  return "NO_DATA";
};
const netaClass = (r: SavedAnalysisResult) => (r.consensus_details as Record<string, unknown> | null)?.severity_class as string ?? "not recorded";

function Field({ label, value, unit }: { label: string; value: unknown; unit?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2.5">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-mono mt-0.5 ${value != null ? "text-white" : "text-slate-500 italic"}`}>
        {value != null ? `${value}${unit ? ` ${unit}` : ""}` : "not recorded"}
      </p>
    </div>
  );
}

function RField({ label, value, age, note }: { label: string; value: string; age?: number | null; note?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2.5">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-mono font-bold text-white mt-0.5">{value}</p>
      {age != null && (
        <span className={`inline-block mt-1 rounded border px-1.5 py-0.5 text-[9px] font-bold ${age === 0 ? "border-emerald-500/30 text-emerald-400" : "border-slate-600 text-slate-400"}`}>
          {age === 0 ? "today" : `${age}d old`}
        </span>
      )}
      {note && <p className="text-[9px] text-slate-500 mt-1 italic">{note}</p>}
    </div>
  );
}

export default function ThermographyResultsTab({ selectedAnalysis }: ThermographyResultsTabProps) {
  const meta = useMemo(() => extractMeta(selectedAnalysis), [selectedAnalysis]);
  const peaks = useMemo(() => extractPeaks(selectedAnalysis), [selectedAnalysis]);
  const sev = useMemo(() => sevClass(selectedAnalysis), [selectedAnalysis]);
  const neta = useMemo(() => netaClass(selectedAnalysis), [selectedAnalysis]);
  const age = useMemo(() => selectedAnalysis.timestamp ? Math.floor((Date.now() - new Date(selectedAnalysis.timestamp).getTime()) / 86400000) : null, [selectedAnalysis.timestamp]);
  const dTC = useMemo(() => peaks.deltaT != null ? dTtoC(peaks.deltaT as number, meta.tempUnit) : null, [peaks.deltaT, meta.tempUnit]);

  const pp = useMemo<IrSeverityBracket | null>(() => dTC != null ? evaluateIrSeverity(dTC, "P-P") : null, [dTC]);
  const pa = useMemo<IrSeverityBracket | null>(() => dTC != null && meta.ambientTemp != null ? evaluateIrSeverity(dTC, "P-A") : null, [dTC, meta.ambientTemp]);
  const gov = useMemo(() => {
    if (pp && pa) { const pi = IR_PP_BRACKETS.indexOf(pp), ai = IR_PA_BRACKETS.indexOf(pa); return pi <= ai ? pp : pa; }
    return pp;
  }, [pp, pa]);
  const govAxis = pp && pa ? (IR_PP_BRACKETS.indexOf(pp) <= IR_PA_BRACKETS.indexOf(pa) ? "P-P" : "P-A") : pa ? "P-A" : "P-P";

  const loadNorm = useMemo(() => {
    const rawM = meta.measuredAmps, rawR = meta.ratedAmps;
    const hasMeasured = rawM != null && !isNaN(Number(rawM));
    const hasRated = rawR != null && !isNaN(Number(rawR));
    const m = hasMeasured ? Number(rawM) : null;
    const r = hasRated ? Number(rawR) : null;
    if (dTC == null) return { ok: false, msg: "load normalization unavailable - delta-T not recorded" };
    if (!hasMeasured && !hasRated) return { ok: false, msg: "load normalization unavailable - amps not recorded" };
    if (!hasMeasured) return { ok: false, msg: "load normalization unavailable - measured amps not recorded" };
    if (!hasRated) return { ok: false, msg: "load normalization unavailable - rated amps not recorded (square-law needs both)" };
    if (m === 0) return { ok: false, msg: "load normalization unavailable - measured amps is zero" };
    const dR = dTC * (r! / m!) ** 2;
    const sC = meta.storedNorm != null ? dTtoC(meta.storedNorm, meta.tempUnit) : null;
    const match = sC != null ? Math.abs(sC - dR) < 0.5 : null;
    return { ok: true, dR, msg: match === true ? "stored matches square-law" : match === false ? "stored uses different definition" : "no stored value to audit against" };
  }, [meta, dTC]);

  const eps = useMemo(() => { const e = meta.emissivity as number | null; return e == null ? "absent" : e < 0.6 ? "low" : "normal"; }, [meta.emissivity]);

  const faults = useMemo(() => (Array.isArray(selectedAnalysis.fault_list) ? selectedAnalysis.fault_list : []).map(f => ({
    title: f.title ?? "Unknown", sev: f.severity ?? "MEDIUM", conf: f.confidence ?? 0, family: classifyFaultFamily(f.title),
  })), [selectedAnalysis.fault_list]);

  const recs = useMemo(() => (selectedAnalysis.recommendations ?? []).map(r => {
    const family = classifyFaultFamily(r);
    return { text: r, family, label: family === "unknown" ? "Unattributed (stored consensus)" : FAULT_FAMILY_LABEL[family] };
  }), [selectedAnalysis.recommendations]);

  if (!selectedAnalysis || (selectedAnalysis.analysis_type ?? "vibration") !== "thermography") return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <FileText className="h-8 w-8 text-slate-600 mb-3" />
      <p className="text-sm font-semibold text-slate-300">No thermography run selected</p>
      <p className="text-sm text-slate-500 mt-1 max-w-md">Choose from run history — thermography tile requires an IR record.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-red-400 shrink-0" />
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Thermal Severity Assessment</h4>
            </div>
            <p className="text-sm text-slate-500 mt-1">{selectedAnalysis.component || "—"} · {selectedAnalysis.asset_id || "—"},</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${SEVERITY_STYLE[sev as keyof typeof SEVERITY_STYLE]}`}>{SEVERITY_LABEL[sev as keyof typeof SEVERITY_LABEL]}</span>
            <span className="rounded-md border border-slate-600 bg-slate-800/50 px-2.5 py-1 text-[11px] font-bold text-slate-400">NETA: {neta}</span>
          </div>
        </div>
      </div>

      {gov && (
        <div className={`rounded-xl border p-4 ${gov.requiresImmediateAction ? "border-red-500/50 bg-red-500/10" : "border-amber-500/30 bg-amber-500/5"}`}>
          <div className="flex items-start gap-3">
            {gov.requiresImmediateAction ? <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" /> : <Shield className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />}
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-1">NFPA 70B-2023 Severity Evaluation</p>
              <div className="flex items-center gap-2 mb-2">
                <span className={`rounded border px-2 py-0.5 text-[11px] font-bold uppercase ${gov.requiresImmediateAction ? "border-red-500/50 text-red-400 bg-red-500/10" : "border-amber-500/30 text-amber-400 bg-amber-500/10"}`}>{gov.netaClass}</span>
                <span className="text-[11px] text-slate-400">Governing axis: {govAxis}</span>
              </div>
              <p className="text-xs text-slate-300">
                <span className="text-slate-500">ΔT: </span>{dTC != null ? `${dTC.toFixed(1)}°C` : "—"}
                {meta.ambientTemp != null ? " (P-A axis evaluated)" : " (P-A axis unavailable - ambient not recorded)"}
              </p>
              <p className="text-xs text-slate-400 mt-1"><span className="font-semibold text-slate-300">Repair window: </span>{gov.repairWindow}</p>
              {gov.requiresImmediateAction && <p className="text-xs text-red-400 mt-1 font-semibold">⚠ MANDATORY: Immediate action required — stop equipment and apply lockout/tagout procedures.</p>}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
        <div className="flex items-center gap-2 mb-3"><Gauge className="h-4 w-4 text-amber-400 shrink-0" /><h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Inspection Metadata</h4></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Field label="Emissivity (ε)" value={meta.emissivity} />
          <Field label="Reflected Temp (T_refl)" value={meta.reflectedTemp} unit={meta.tempUnit} />
          <Field label="Ambient Temp (T_amb)" value={meta.ambientTemp} unit={meta.tempUnit} />
          <Field label="Measured Amps (I_measured)" value={meta.measuredAmps} unit="A" />
          <Field label="Rated Amps (I_rated)" value={meta.ratedAmps} unit="A" />
          <Field label="Distance" value={meta.distance} unit="m" />
          <Field label="Relative Humidity (RH)" value={meta.humidity} unit="%" />
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
        <div className="flex items-center gap-2 mb-3"><Thermometer className="h-4 w-4 text-red-400 shrink-0" /><h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Readings</h4></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <RField label="Hotspot Temp" value={fmtTemp(peaks.hotspot as number, meta.tempUnit)} age={age} />
          <RField label="Delta-T (stored)" value={fmtDeltaT(peaks.deltaT as number, meta.tempUnit)} age={age} note="Stored unit primary + labeled conversion" />
          <RField label="Phase A Temp" value={fmtTemp(meta.phaseA as number, meta.tempUnit)} age={age} />
          <RField label="Phase B Temp" value={fmtTemp(meta.phaseB as number, meta.tempUnit)} age={age} />
          <RField label="Phase C Temp" value={fmtTemp(meta.phaseC as number, meta.tempUnit)} age={age} />
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
        <div className="flex items-center gap-2 mb-3"><Zap className="h-4 w-4 text-cyan-400 shrink-0" /><h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Load Normalization</h4></div>
        {loadNorm.ok ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-300"><span className="text-slate-500">dT_rated (I²R model): </span><span className="font-mono font-bold text-white">{loadNorm.dR!.toFixed(1)}°C</span></p>
            <p className="text-[11px] text-slate-400 italic">Projection for resistive connections — model, not measurement.</p>
            <p className="text-[11px] text-slate-500"><span className="font-semibold">Audit: </span>{loadNorm.msg}</p>
          </div>
        ) : <p className="text-xs text-slate-400 italic">{loadNorm.msg}</p>}
      </div>

      {eps !== "normal" && (
        <div className={`rounded-xl border p-4 ${eps === "low" ? "border-amber-500/30 bg-amber-500/5" : "border-slate-600 bg-slate-800/30"}`}>
          <div className="flex items-start gap-3">
            <Info className={`h-4 w-4 shrink-0 mt-0.5 ${eps === "low" ? "text-amber-400" : "text-slate-400"}`} />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-1">Emissivity Uncertainty</p>
              {eps === "low" ? (
                <>
                  <p className="text-xs text-amber-300">Emissivity {meta.emissivity} is below 0.60 — quantitative temperature readings may be unreliable on bare metal surfaces.</p>
                  <p className="text-[11px] text-slate-400 mt-1">Guidance: Apply high-emissivity tape or coating to measurement points for accurate readings.</p>
                </>
              ) : <p className="text-xs text-slate-400 italic">Emissivity not recorded - quantitative readings uncertain on bare metal.</p>}
            </div>
          </div>
        </div>
      )}

      {faults.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
          <div className="flex items-center gap-2 mb-3"><AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" /><h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Fault Diagnoses</h4></div>
          <ul className="space-y-1.5">
            {faults.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-slate-300">
                <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${SEVERITY_STYLE[f.sev as keyof typeof SEVERITY_STYLE]}`}>{SEVERITY_LABEL[f.sev as keyof typeof SEVERITY_LABEL]}</span>
                <span className="font-semibold text-white">{f.title}</span>
                <span className="text-slate-500">({f.conf}% · {FAULT_FAMILY_LABEL[f.family]})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recs.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
          <div className="flex items-center gap-2 mb-3"><CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /><h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Recommendations</h4></div>
          <ul className="space-y-1.5">
            {recs.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span className="text-slate-500 shrink-0">{r.label}:</span>{r.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
