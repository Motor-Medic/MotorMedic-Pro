/**
 * ThermalLibraryTab — component-level IR trend library (NFPA 70B-2023).
 * ΔT conversions offset-free; no table >10 rows; absences confessed once.
 */
import React, { useMemo, useState } from "react";
import { Flame, Info } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { evaluateIrSeverity, type IrSeverityBracket } from "../../lib/maintenance/prescriptiveDictionary";
import { peakOfType, resolveTempUnit } from "../../lib/diagnostics/sensorFusion";

export interface ThermalLibraryTabProps { selectedAnalysis: SavedAnalysisResult | null; allAnalyses?: SavedAnalysisResult[]; }
interface IrRow { date: string; ts: string; hotspot: number | null; deltaT: number | null; unit: "°F" | "°C"; dTC: number | null; bracket: IrSeverityBracket | null; eps: string; }

const CLASS_FILL: Record<string, string> = { "Class 1": "#ef4444", "Class 2": "#f59e0b", "Class 3": "#eab308", "Normal": "#22c55e" };

const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;

function rowFor(r: SavedAnalysisResult): IrRow | null {
  const peak = peakOfType(r, "thermography") ?? (Array.isArray(r.peaks) ? r.peaks[0] as Record<string, unknown> : null);
  const dT = num(peak?.delta_t ?? peak?.deltaT ?? null);
  if (dT == null) return null;
  const hs = num(peak?.hotspot_temp ?? peak?.hotspotTemp ?? null);
  const unit = resolveTempUnit(r) ?? "°F";
  const dTC = unit === "°F" ? dT * (5 / 9) : dT;
  const td = (r.telemetry_data ?? {}) as Record<string, unknown>;
  const epsRaw = td.emissivity ?? (td.environmental as Record<string, unknown> | null)?.emissivity ?? null;
  return { date: new Date(r.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), ts: r.timestamp, hotspot: hs, deltaT: dT, unit, dTC, bracket: evaluateIrSeverity(dTC, "P-P"), eps: epsRaw == null ? "not recorded" : String(epsRaw) };
}

const W = 520, H = 150, PL = 54, PR = 12, PT = 16, PB = 30, PADX = 32;

export default function ThermalLibraryTab({ selectedAnalysis, allAnalyses }: ThermalLibraryTabProps) {
  if (!selectedAnalysis?.asset_id) return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <Flame className="h-8 w-8 text-slate-600 mb-3" />
      <p className="text-sm font-semibold text-slate-300">Select an asset with IR inspections</p>
      <p className="text-xs text-slate-500 mt-1">Open a thermography report or select a location to build the thermal library.</p>
    </div>
  );

  const rows = useMemo<IrRow[]>(() => (allAnalyses ?? [])
    .filter((r) => (r.analysis_type ?? "vibration").toLowerCase() === "thermography" && r.asset_id === selectedAnalysis.asset_id && (!selectedAnalysis.component || r.component === selectedAnalysis.component))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map(rowFor).filter((x) => x != null), [selectedAnalysis, allAnalyses]);

  const [showAll, setShowAll] = useState(false);
  const unit = rows[0]?.unit ?? "°F";
  const maxV = Math.max(...rows.map((r) => Math.max(r.hotspot ?? 0, r.deltaT ?? 0)), 10) * 1.15;
  const px = (i: number, n: number) => n === 1 ? (PL + W - PR) / 2 : (PL + PADX) + i * (W - PR - PL - PADX) / (n - 1);
  const py = (v: number) => PT + (1 - Math.max(0, v) / maxV) * (H - PT - PB);
  const cat = (b: IrSeverityBracket | null) => b ? CLASS_FILL[b.netaClass.split(" — ")[0]] ?? "#64748b" : "#64748b";
  const grid = [0, 0.5, 1].map((f) => ({ v: maxV * f, y: py(maxV * f) }));
  const unitLabel = unit === "°F" ? "degF" : "degC";

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Flame className="h-4 w-4 text-red-400 shrink-0" />
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Thermal Trend Library</h4>
          <span className="text-[10px] text-slate-500">({rows.length} IR run{rows.length !== 1 ? "s" : ""})</span>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 mt-3">
            <p className="text-sm text-slate-400 italic">No thermography inspections stored for this component. Run an IR inspection from Diagnose to seed the thermal library.</p>
          </div>
        ) : (<>
          {rows.length === 1 && <p className="text-[11px] text-slate-500 italic mt-2">thermal library builds from 2+ inspections — 1 recorded</p>}

          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 mt-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Timeline — hotspot &amp; ΔT</h4>
              <span className="text-[9px] border rounded px-1 border-amber-500/60 text-amber-400">Y axes in {unit}</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-48" preserveAspectRatio="none">
              {grid.map((g) => (<g key={g.v.toFixed(1)}><line x1={PL} x2={W - PR} y1={g.y} y2={g.y} stroke="#334155" strokeDasharray="3 3" /><text x={PL - 6} y={g.y + 2} fontSize="8" fill="#64748b" textAnchor="end" dominantBaseline="middle">{g.v.toFixed(0)}</text></g>))}
              <text x={PL - 10} y={(PT + H - PB) / 2} fontSize="8" fill="#38bdf8" transform={`rotate(-90 ${PL - 10} ${(PT + H - PB) / 2})`} textAnchor="middle">Temp ({unitLabel})</text>
              {rows.map((r, i) => (<g key={r.ts}>
                {i === 0 || rows[i - 1].ts.slice(0, 10) !== r.ts.slice(0, 10) ? <text x={px(i, rows.length)} y={H - 10} fontSize="8" fill="#64748b" textAnchor="middle">{r.date.split(",")[0]}</text> : null}
                <circle cx={px(i, rows.length)} cy={py(r.hotspot ?? 0)} r="2.6" fill={cat(r.bracket)} />
                <circle cx={px(i, rows.length)} cy={py(r.deltaT ?? 0)} r="2.6" fill="none" stroke={cat(r.bracket)} strokeWidth="1" />
                {r.bracket && <text x={px(i, rows.length)} y={py(r.hotspot ?? 0) - 6} fontSize="7" fill={cat(r.bracket)} textAnchor="middle">{r.bracket.netaClass.split(" — ")[0]}</text>}
              </g>))}
            </svg>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="inline-flex items-center gap-1 text-[9px] text-slate-500"><span className="w-2 h-2 rounded-full" style={{ background: "#38bdf8" }} />hotspot (filled) · <span className="w-2 h-2 rounded-full border border-slate-400" style={{ background: "transparent" }} />ΔT (ring)</span>
              {Object.entries(CLASS_FILL).map(([l, f]) => <span key={l} className="inline-flex items-center gap-1 text-[9px] text-slate-500"><span className="w-2 h-2 rounded-full" style={{ background: f }} />{l}</span>)}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">ΔT conversion: {unit === "°F" ? "°C = °F × 5/9" : "°F = °C × 9/5 + 32 for absolute temps; ΔT scales multiplicatively (offset-free)"} · shared date axis</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 mt-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Runs</h4>
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500">
                <th className="text-left font-normal">Date</th><th className="text-right font-normal">ΔT stored</th><th className="text-right font-normal">ΔT (°C)</th><th className="text-right font-normal">Hotspot</th><th className="text-left font-normal">Class / axis</th><th className="text-left font-normal">Window</th><th className="text-left font-normal">ε</th>
              </tr></thead>
              <tbody>
                {(showAll ? rows : rows.slice(0, 10)).map((r) => (
                  <tr key={r.ts} className="text-slate-300 border-t border-slate-800">
                    <td className="py-1">{r.date}</td>
                    <td className="py-1 text-right font-mono">{r.deltaT != null ? `${r.deltaT.toFixed(1)}${r.unit}` : "—"}</td>
                    <td className="py-1 text-right font-mono">{r.dTC != null ? `${r.dTC.toFixed(1)}°C` : "—"}</td>
                    <td className="py-1 text-right font-mono">{r.hotspot != null ? `${r.hotspot.toFixed(1)}${r.unit}` : "—"}</td>
                    <td className="py-1">{r.bracket ? <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase"><span className="w-2 h-2 rounded-full" style={{ background: cat(r.bracket) }} />{r.bracket.netaClass} · P-P</span> : <span className="text-slate-500">—</span>}</td>
                    <td className="py-1 text-slate-400">{r.bracket?.repairWindow ?? "—"}</td>
                    <td className="py-1 text-slate-400">{r.eps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && <button onClick={() => setShowAll((v) => !v)} className="text-[10px] text-slate-500 hover:text-slate-300 mt-2">{showAll ? "show less" : `+${rows.length - 10} more runs`}</button>}
          </div>
        </>)}
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 mt-3">
          <p className="text-[11px] text-slate-500"><Info className="h-3 w-3 inline text-slate-400 mr-1" /> Scope: per-connection trending requires a location field at capture — not recorded today; this library tracks the component.</p>
        </div>
    </div>
  );
}