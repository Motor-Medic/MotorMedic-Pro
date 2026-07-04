import React, { useState } from "react";
import { SavedReport } from "../types";
import { 
  ArrowLeft, Calendar, FileText, Settings, AlertTriangle, 
  Wrench, Check, Copy, Trash2, Info, ArrowUpRight, Globe 
} from "lucide-react";

interface ReportDetailsProps {
  report: SavedReport;
  onBack: () => void;
  onDelete: (id: string) => void;
}

export default function ReportDetails({ report, onBack, onDelete }: ReportDetailsProps) {
  const [isCopied, setIsCopied] = useState(false);

  const getSeverityBadge = (severity?: string) => {
    switch (severity) {
      case "Critical":
        return "text-red-400 bg-red-400/10 border-red-500/20";
      case "High":
        return "text-amber-400 bg-amber-400/10 border-amber-500/20";
      case "Medium":
        return "text-yellow-400 bg-yellow-400/10 border-yellow-500/20";
      default:
        return "text-emerald-400 bg-emerald-400/10 border-emerald-500/20";
    }
  };

  const handleCopyCMMS = () => {
    const d = report.data;
    const faults = d.probable_faults
      .map((f) => `- ${f.fault} (Confidence: ${f.confidence}, ${f.probability}%): ${f.description}`)
      .join("\n");
    const actions = d.immediate_actions
      .map(
        (a) =>
          `- [Priority ${a.priority}] ${a.action}\n  Rationale: ${a.rationale}${
            a.safety_warning ? `\n  ⚠️ SAFETY: ${a.safety_warning}` : ""
          }\n  Time: ${a.estimated_time || "N/A"} | Tools: ${(a.required_tools || []).join(", ") || "Standard"}`
      )
      .join("\n");

    const cmmsText = `================================================
CMMS MAINTENANCE WORK ORDER REQUEST
================================================
System Category : ${report.category}
Date            : ${report.date}
Observed Symptoms: ${report.symptoms || "No symptoms stated. Analysed from data file."}
------------------------------------------------
PROBABLE FAULTS DIAGNOSED:
${faults}

CORRECTIVE ACTIONS REQUIRED:
${actions}

------------------------------------------------
EXECUTIVE ANALYSIS BRIEF:
Severity Level  : ${d.manager_summary.severity}
Est. Downtime   : ${d.manager_summary.estimated_downtime}
Repair Estimate : ${d.manager_summary.cost_estimate}
Business Impact : ${d.manager_summary.business_impact}
================================================`;

    navigator.clipboard.writeText(cmmsText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Navigation Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-yellow-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to History</span>
        </button>

        <div className="flex gap-2">
          <button
            onClick={handleCopyCMMS}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-yellow-400 border border-slate-800 font-semibold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{isCopied ? "CMMS Copied!" : "Copy Work Order"}</span>
          </button>
          <button
            onClick={() => {
              if (confirm("Delete this saved diagnostic record?")) {
                onDelete(report.id);
                onBack();
              }
            }}
            className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/40 text-red-400 hover:text-red-300 border border-red-500/20 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Equipment Profile Section */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-yellow-400 bg-yellow-400/5 px-2 py-0.5 rounded border border-yellow-400/10">
                {report.category} System
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                <Calendar className="w-3.5 h-3.5" />
                {report.date}
              </span>
            </div>
            <h3 className="text-lg font-bold text-white font-display">
              {report.symptoms ? `Assessing: ${report.symptoms.substring(0, 80)}${report.symptoms.length > 80 ? "..." : ""}` : "Data File Assessment Scan"}
            </h3>
          </div>

          <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border self-start sm:self-auto ${getSeverityBadge(
            report.data?.manager_summary?.severity
          )}`}>
            {report.data?.manager_summary?.severity} severity
          </span>
        </div>

        {/* Specifications Table */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            Equipment Parameters Specified
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(report.specs).map(([key, val]) => (
              <div key={key} className="bg-slate-950/60 px-3.5 py-2.5 rounded-xl border border-slate-850/80">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                  {key.replace("spec", "").replace("Rpm", "Base RPM").replace("Orientation", "Shaft Mount").replace("Drive", "Drive Coupling").replace("FanBlades", "Fan Blades").replace("PumpImpellers", "Impellers").replace("PinionTeeth", "Pinion Teeth")}
                </p>
                <p className="font-semibold text-slate-200 text-xs mt-0.5">{val}</p>
              </div>
            ))}
            {report.fileName && (
              <div className="bg-emerald-950/15 border border-emerald-500/20 px-3.5 py-2.5 rounded-xl col-span-2 sm:col-span-1">
                <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider">Attached File</p>
                <p className="font-semibold text-emerald-400 text-xs mt-0.5 truncate" title={report.fileName}>
                  {report.fileName}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Symptoms block */}
        {report.symptoms && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Full Observed Symptoms</h4>
            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850 leading-relaxed text-slate-300 text-xs font-sans">
              {report.symptoms}
            </div>
          </div>
        )}
      </div>

      {/* Structured Results Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Probable Faults */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 border-l-4 border-rose-500 space-y-4">
          <h4 className="font-bold text-rose-400 text-sm flex items-center gap-1.5 pb-2 border-b border-slate-800">
            <AlertTriangle className="w-4.5 h-4.5" />
            Probable Faults & Physics
          </h4>
          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
            {report.data?.probable_faults?.map((f, i) => (
              <div key={i} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2.5">
                <div className="flex justify-between items-start gap-2">
                  <h5 className="text-xs font-bold text-slate-200">{f.fault}</h5>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                    f.confidence === "High" 
                      ? "text-red-400 bg-red-400/10 border-red-400/20" 
                      : "text-amber-400 bg-amber-400/10 border-amber-400/20"
                  }`}>
                    {f.confidence} ({f.probability}%)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">{f.description}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[9px] font-medium bg-slate-900 text-slate-500 px-2 py-0.5 rounded border border-slate-850">
                    {f.subsystem}
                  </span>
                  <span className="text-[9px] font-medium bg-slate-900 text-slate-500 px-2 py-0.5 rounded border border-slate-850">
                    {f.failure_mode}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Corrective Actions */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 border-l-4 border-amber-500 space-y-4">
          <h4 className="font-bold text-amber-400 text-sm flex items-center gap-1.5 pb-2 border-b border-slate-800">
            <Wrench className="w-4.5 h-4.5" />
            Corrective Guidance
          </h4>
          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
            {report.data?.immediate_actions?.map((a, i) => (
              <div key={i} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
                <div className="flex justify-between items-start gap-1.5">
                  <h5 className="text-xs font-bold text-slate-200">
                    {i+1}. {a.action}
                  </h5>
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                    a.priority === "High" 
                      ? "text-red-400 bg-red-400/10 border-red-400/20" 
                      : "text-slate-400 bg-slate-850 border-slate-800"
                  }`}>
                    {a.priority}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">{a.rationale}</p>
                
                {a.safety_warning && (
                  <div className="bg-rose-500/10 border border-rose-500/20 text-rose-350 p-2 rounded-lg text-[10px] leading-relaxed">
                    <span className="font-bold">⚠️ SAFETY PRECAUTION: </span>
                    {a.safety_warning}
                  </div>
                )}

                <div className="pt-1.5 text-[10px] text-slate-500 flex items-center justify-between border-t border-slate-850">
                  <span>⏱ Est: {a.estimated_time || "N/A"}</span>
                  <span className="truncate max-w-[60%]">
                    🔧 {(a.required_tools || []).slice(0, 3).join(", ")}
                    {(a.required_tools || []).length > 3 && "..."}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Manager Summary */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 border-l-4 border-cyan-500 space-y-4">
          <h4 className="font-bold text-cyan-400 text-sm flex items-center gap-1.5 pb-2 border-b border-slate-800">
            <FileText className="w-4.5 h-4.5" />
            Plant Management Brief
          </h4>
          <div className="space-y-4 text-xs">
            {/* Severity Badge */}
            <div className="flex justify-between items-center bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 font-medium">Criticality Status</span>
              <span className={`px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-lg border ${
                report.data?.manager_summary?.severity === "Critical"
                  ? "text-red-400 bg-red-500/15 border-red-500/30"
                  : "text-amber-400 bg-amber-500/15 border-amber-500/30"
              }`}>
                {report.data?.manager_summary?.severity}
              </span>
            </div>

            {/* Executive Brief */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Executive Brief</span>
              <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800 leading-relaxed text-slate-300 text-[11px] font-sans">
                {report.data?.manager_summary?.executive_brief}
              </div>
            </div>

            {/* Downtime & Cost info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-0.5">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Est. Downtime</span>
                <p className="font-bold text-slate-200 text-xs">{report.data?.manager_summary?.estimated_downtime}</p>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-0.5">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Repair Cost Est</span>
                <p className="font-bold text-emerald-400 text-xs">{report.data?.manager_summary?.cost_estimate}</p>
              </div>
            </div>

            {/* Operations Business Impact */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Operations Business Impact</span>
              <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 leading-relaxed font-sans">
                {report.data?.manager_summary?.business_impact}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grounded Web Research Sources */}
      {report.data?.sources && report.data.sources.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800/85 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5 text-xs font-bold text-yellow-400 uppercase tracking-wider font-display">
              <Globe className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>Grounded Live Web Research Citations</span>
            </div>
            <span className="text-[10px] font-mono text-slate-500">
              Verified via {report.data.attemptedModel || "Gemini Search Grounding"}
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            The diagnostic engine actively queried the live internet to cross-verify machinery configurations, nominal vibration profiles, and standards (e.g., ISO 10816) to prevent guessing and ensure zero hallucination:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {report.data.sources.map((src, idx) => (
              <a
                key={idx}
                href={src.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 p-3 bg-slate-950/60 hover:bg-slate-900/60 border border-slate-850 hover:border-slate-700 rounded-xl transition-all group"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs font-semibold text-slate-200 group-hover:text-yellow-400 transition-colors truncate">
                    {src.title}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono truncate">
                    {src.uri}
                  </p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-yellow-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
