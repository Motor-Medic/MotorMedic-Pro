/**
 * NfpaComplianceTab — NFPA 70B-2023 compliance dossier for IR inspections.
 * NFPA brackets are DISCRETE regulatory states — evaluateIrSeverity is the sole
 * classifier; dossier renders its verdict verbatim. No thermal slope extrapolation.
 */
import React, { useMemo, useState } from "react";
import { CalendarDays, Info, Shield, ShieldAlert } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { evaluateIrSeverity, IR_PP_BRACKETS, IR_PA_BRACKETS, type IrSeverityBracket } from "../../lib/maintenance/prescriptiveDictionary";
import { peakOfType, resolveTempUnit } from "../../lib/diagnostics/sensorFusion";

export interface NfpaComplianceTabProps { selectedAnalysis: SavedAnalysisResult | null; allAnalyses?: SavedAnalysisResult[]; }
interface DirRow { date: string; ts: string; deltaT: number | null; unit: "°F" | "°C"; dTC: number | null; pp: IrSeverityBracket | null; pa: IrSeverityBracket | null; gov: IrSeverityBracket | null; axis: string; eps: string; measured: number | null; rated: number | null; }

const NUM = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const dTfmt = (dT: number | null, u: string) => dT == null ? "—" : `${dT.toFixed(1)}${u}`;

function diskRow(r: SavedAnalysisResult): DirRow | null {
  const peak = peakOfType(r, "thermography") ?? (Array.isArray(r.peaks) ? r.peaks[0] as Record<string, unknown> : null);
  const dT = NUM(peak?.delta_t ?? peak?.deltaT ?? null);
  if (dT == null) return null;
  const unit = resolveTempUnit(r) ?? "°F";
  const dTC = unit === "°F" ? dT * (5 / 9) : dT;
  const pp = evaluateIrSeverity(dTC, "P-P");
  const td = (r.telemetry_data ?? {}) as Record<string, unknown>;
  const env = (td.environmental ?? {}) as Record<string, unknown>;
  const ambient = NUM(td.ambient_temp ?? td.ambientTemp ?? env.ambient_temp ?? env.ambientTemp ?? null);
  const pa = ambient != null ? evaluateIrSeverity(dTC, "P-A") : null;
  const gov = pa ? (IR_PP_BRACKETS.indexOf(pp) <= IR_PA_BRACKETS.indexOf(pa) ? pp : pa) : pp;
  const axis = pa ? (gov === pa ? "P-A" : "P-P") : "P-P";
  const epsRaw = td.emissivity ?? env.emissivity ?? null;
  const measured = NUM(r.measured_amps ?? td.measured_amps ?? env.measured_amps ?? peak?.measured_amps ?? null);
  const rated = NUM(r.rated_amps ?? td.rated_amps ?? env.rated_amps ?? peak?.rated_amps ?? null);
  return { date: new Date(r.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), ts: r.timestamp, deltaT: dT, unit, dTC, pp, pa, gov, axis, eps: epsRaw == null ? "not recorded" : `${epsRaw} recorded`, measured, rated };
}

export default function NfpaComplianceTab({ selectedAnalysis, allAnalyses }: NfpaComplianceTabProps) {
  if (!selectedAnalysis?.asset_id) return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <Shield className="h-8 w-8 text-amber-400 mb-3" />
      <p className="text-sm font-semibold text-slate-300">Select an asset with IR inspections</p>
      <p className="text-xs text-slate-500 mt-1">Open a thermography report to view its NFPA 70B compliance dossier.</p>
    </div>
  );

  const rows = useMemo<DirRow[]>(() => (allAnalyses ?? [])
    .filter((r) => (r.analysis_type ?? "vibration").toLowerCase() === "thermography" && r.asset_id === selectedAnalysis.asset_id && (!selectedAnalysis.component || r.component === selectedAnalysis.component))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .map(diskRow).filter((x) => x != null), [selectedAnalysis, allAnalyses]);

  const [showAll, setShowAll] = useState(false);
  const latest = rows[0];

  const due = useMemo(() => {
    if (!latest) return null;
    const d = new Date(latest.ts); d.setDate(d.getDate() + 365);
    const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
    return { date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), overdue: Date.now() - d.getTime() > 0 ? days : 0 };
  }, [latest]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="h-4 w-4 text-amber-400 shrink-0" />
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">NFPA 70B Compliance Dossier</h4>
          <span className="text-[10px] text-slate-500">({rows.length} IR run{rows.length !== 1 ? "s" : ""})</span>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 mt-3">
            <p className="text-sm text-slate-400 italic">No IR inspections stored for this component — no compliance dossier to render.</p>
          </div>
        ) : (<>
          {latest && (
            <div className={`rounded-xl border p-3 mt-3 ${latest.gov?.requiresImmediateAction ? "border-red-500/50 bg-red-500/10" : "border-amber-500/30 bg-amber-500/5"}`}>
              <div className="flex items-start gap-3">
                {latest.gov?.requiresImmediateAction ? <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" /> : <Shield className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-1">Mandate — {latest.date}</p>
                  <p className="text-xs text-slate-300">Governing class: <span className="font-bold uppercase">{latest.gov?.netaClass ?? "—"}</span><span className="text-slate-500 ml-1">· {latest.gov ? `axis ${latest.axis}` : "no verdict"}</span></p>
                  {latest.gov && <p className="text-xs text-amber-300 mt-1">{latest.gov.repairWindow}{latest.gov.requiresImmediateAction ? " — MANDATORY immediate action: stop equipment, apply lockout/tagout." : ""}</p>}
                  <p className="text-[10px] text-slate-500 mt-1">NFPA 70B-2023 (enforceable) / NETA severity classes</p>
                </div>
              </div>
            </div>
          )}

          {due && <p className="text-[11px] text-slate-400 mt-1"><CalendarDays className="h-3 w-3 inline text-slate-400 mr-1" /> Next inspection due <span className="font-mono text-white">{due.date}</span> per NFPA 70B-2023 annual interval — a rule, not a measurement.{due.overdue > 0 && <span className="text-red-400 font-semibold"> OVERDUE by {due.overdue} days.</span>}</p>}

          {latest && <p className="text-[11px] text-slate-500 mt-1"><Info className="h-3 w-3 inline text-slate-400 mr-1" /> {latest.measured != null && latest.rated != null ? "Severity evaluated at measured load; square-law projection to rated load shown in Tab 1." : latest.rated != null ? "Severity is based on available data — measured amps not recorded; rated amps present. Peak load conditions will accelerate this failure mode." : latest.measured != null ? "Severity reflects measured load only — rated amps not recorded; peak load conditions will accelerate this failure mode." : "Severity evaluated from ΔT alone — neither measured nor rated amps recorded; load state unknown."}</p>}

          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 mt-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Dossier</h4>
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500">
                <th className="text-left font-normal">Date</th><th className="text-right font-normal">ΔT stored</th><th className="text-right font-normal">ΔT (°C)</th><th className="text-left font-normal">Axis</th><th className="text-left font-normal">Class</th><th className="text-left font-normal">Window</th><th className="text-left font-normal">ε</th>
              </tr></thead>
              <tbody>
                {(showAll ? rows : rows.slice(0, 10)).map((r) => (
                  <tr key={r.ts} className="text-slate-300 border-t border-slate-800">
                    <td className="py-1">{r.date}</td>
                    <td className="py-1 text-right font-mono">{dTfmt(r.deltaT, r.unit)}</td>
                    <td className="py-1 text-right font-mono">{r.dTC != null ? `${r.dTC.toFixed(1)}°C` : "—"}</td>
                    <td className="py-1 text-slate-400">{r.pa == null ? "P-P only (P-A unavailable — ambient not recorded)" : r.axis}</td>
                    <td className="py-1"><span className="font-bold uppercase">{r.gov?.netaClass ?? "—"}</span></td>
                    <td className="py-1 text-slate-400">{r.gov?.repairWindow ?? "—"}</td>
                    <td className="py-1 text-slate-400">{r.eps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && <button onClick={() => setShowAll((v) => !v)} className="text-[10px] text-slate-500 hover:text-slate-300 mt-2">{showAll ? "show less" : `+${rows.length - 10} more runs`}</button>}
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 mt-3">
            <p className="text-[11px] text-slate-500"><Info className="h-3 w-3 inline text-slate-400 mr-1" /> No slope extrapolation for thermal faults — degradation is load-dependent and non-linear; NFPA 70B brackets apply per inspection.</p>
          </div>
        </>)}
      </div>
    </div>
  );
}