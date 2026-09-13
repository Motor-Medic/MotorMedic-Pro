import React, { useState } from "react";
import { FileText, X } from "lucide-react";
import type { TechnologyReport } from "../../lib/reports/technologySummary";
import { getPrescription, type PrescriptivePackage } from "../../lib/maintenance/prescriptiveDictionary";
import { buildBridgeContext } from "../../lib/diagnostics/cmmsPayload";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { CmmsWorkOrderBridge } from "../CmmsWorkOrderBridge";

const REPLACE_RATIO_THRESHOLD = 0.5;
const REPLACE_RUL_THRESHOLD_DAYS = 365;

interface Props {
  tech: TechnologyReport;
  records: SavedAnalysisResult[];
  loadedAnalyses: SavedAnalysisResult[];
  planningInputs?: { leadTimeDays: number | null; nextShutdownDate: string | null; downtimeCostPerDay: number | null } | null;
  repairCosts?: Record<string, { repair: number | null; replacement: number | null }>;
}

export function TechPrescriptionCard({ tech, records, loadedAnalyses, planningInputs, repairCosts }: Props) {
  const [showPlan, setShowPlan] = useState(false);
  const latest = records.filter((r) => (r.analysis_type ?? "vibration") === tech.technology)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0] ?? null;
  const fault = tech.primaryFault;
  if (!fault || !latest) return null;
  const pkg: PrescriptivePackage = getPrescription(fault);
  if (!pkg.isMapped) return (
    <div className="mt-2 pt-2 border-t border-white/5">
      <p className="text-[11px] text-slate-500 italic">No prescriptive entry for &lsquo;{fault}&rsquo; &mdash; plan manually.</p>
    </div>
  );
  const ctx = buildBridgeContext(latest, { planningInputs: planningInputs ?? null, loadedAnalyses });

  // Breakeven: live derivation from current props (no snapshot at open)
  const rc = repairCosts?.[fault];
  const hasPlanning = planningInputs != null && planningInputs.leadTimeDays != null && planningInputs.nextShutdownDate != null && planningInputs.downtimeCostPerDay != null;
  const hasCosts = rc != null && rc.repair != null && rc.replacement != null;
  const breakevenAvailable = hasPlanning && hasCosts;

  return (
    <>
      <div className="mt-2 pt-2 border-t border-white/5 space-y-2">
        <p className="text-[11px] text-slate-400">
          {pkg.laborHours > 0 && <span className="text-white font-semibold">{pkg.laborHours}h labor</span>}
          {pkg.laborHours > 0 && pkg.defaultPriority <= 3 && <span className="text-slate-600 mx-1">&middot;</span>}
          {pkg.defaultPriority <= 3 && <span className="rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase border-amber-500/30 text-amber-400">Priority {pkg.defaultPriority}</span>}
        </p>
        {(pkg.safety.loto.length > 0 || pkg.safety.ppe) && (
          <div className="flex flex-wrap gap-1">
            {pkg.safety.loto.length > 0 && <span className="rounded border px-1.5 py-0.5 text-[9px] font-bold border-red-500/30 text-red-400">LOTO</span>}
            {pkg.safety.ppe && <span className="rounded border px-1.5 py-0.5 text-[9px] font-bold border-amber-500/30 text-amber-400">PPE</span>}
          </div>
        )}
        <button type="button" onClick={() => setShowPlan(true)} className="w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-[11px] font-semibold text-slate-300 hover:border-slate-500 transition-colors cursor-pointer flex items-center justify-center gap-1.5">
          <FileText className="h-3 w-3" />View full plan
        </button>
      </div>
      {showPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowPlan(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">{tech.label} &mdash; {fault}</h2>
              <button onClick={() => setShowPlan(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 mb-6">
              {pkg.procedure.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Procedure</h3>
                  <ol className="space-y-1">{pkg.procedure.map((s, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-300">
                      <span className="text-slate-500 font-mono">{s.step}.</span>
                      <span>{s.task}{s.tolerance ? <span className="text-slate-500"> ({s.tolerance})</span> : null}</span>
                    </li>
                  ))}</ol>
                </div>
              )}
              {pkg.parts.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Parts</h3>
                  <ul className="space-y-1">{pkg.parts.map((p, i) => (
                    <li key={i} className="text-xs text-slate-300">{p.name} &mdash; {p.spec} (qty {p.qty})</li>
                  ))}</ul>
                </div>
              )}
              {pkg.tools.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Tools</h3>
                  <p className="text-xs text-slate-300">{pkg.tools.join(", ")}</p>
                </div>
              )}
            </div>
            {/* Breakeven — live derivation from current planningInputs props, no snapshot */}
            <div className="border-t border-slate-700 pt-4 mb-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Repair vs Replace</h3>
              {breakevenAvailable ? (() => {
                const ratio = rc!.repair! / rc!.replacement!;
                const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
                return (
                  <div className="text-[11px] space-y-1">
                    <div className="text-slate-300">ratio = <span className="font-mono">{fmt(rc!.repair!)} / {fmt(rc!.replacement!)} = {ratio.toFixed(2)}</span></div>
                    <div className="text-slate-300">lead = <span className="font-mono">{planningInputs!.leadTimeDays}d</span> · downtime = <span className="font-mono">{fmt(planningInputs!.downtimeCostPerDay!)}/day</span></div>
                    <div className="pt-1 font-semibold text-sm">
                      {ratio >= REPLACE_RATIO_THRESHOLD ? <span className="text-red-400">Evaluate Capital Replacement</span> : <span className="text-emerald-400">Proceed with Planned Repair</span>}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {ratio.toFixed(2)} {ratio >= REPLACE_RATIO_THRESHOLD ? "&ge;" : "&lt;"} {REPLACE_RATIO_THRESHOLD} · inputs: repair {fmt(rc!.repair!)}, replace {fmt(rc!.replacement!)}, lead {planningInputs!.leadTimeDays}d, downtime {fmt(planningInputs!.downtimeCostPerDay!)}/day
                    </div>
                  </div>
                );
              })() : (
                <p className="text-[11px] text-slate-500 italic">Breakeven unavailable &mdash; planning inputs incomplete (needs lead time, downtime cost, repair and replace estimates)</p>
              )}
            </div>
            <div className="border-t border-slate-700 pt-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">CMMS Work Order Bridge</h3>
              <CmmsWorkOrderBridge context={ctx} sectionId={`bridge-${tech.technology}`} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
