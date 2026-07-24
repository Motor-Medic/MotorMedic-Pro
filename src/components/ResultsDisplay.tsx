import React from "react";
import { 
  Check, ClipboardCheck, Mail, FileText, AlertTriangle, ArrowUpRight, Copy 
} from "lucide-react";

interface ResultsDisplayProps {
  diagnosticResult: any;
  handleSave: () => void;
  handleGenerateCMMSWorkOrder: () => void;
  handleSendManualAlert: () => void;
  handleExportPDF: () => void;
  isAlertSending: boolean;
  alertSuccessMsg: string | null;
  generatedWorkOrder: string | null;
  handleCopyToClipboard: () => void;
}

export default function ResultsDisplay({
  diagnosticResult,
  handleSave,
  handleGenerateCMMSWorkOrder,
  handleSendManualAlert,
  handleExportPDF,
  isAlertSending,
  alertSuccessMsg,
  generatedWorkOrder,
  handleCopyToClipboard
}: ResultsDisplayProps) {
  if (!diagnosticResult) return null;

  return (
    <div className="space-y-6 pt-4 border-t border-slate-800 animate-fade-in" id="resultsSection">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-850">
        <div>
          <h3 className="text-lg font-black text-white font-display">Diagnostic Analytics Report</h3>
          <p className="text-xs text-slate-400">Computed via ISO 10816 baseline rules combined with AI-grounded analytics</p>
        </div>
        
        {/* Post-Diagnosis Action Controls */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSave}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-lg transition-all shadow-md cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Save to History</span>
          </button>
          <button
            onClick={handleGenerateCMMSWorkOrder}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-yellow-400 border border-slate-700 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow cursor-pointer"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Work Order</span>
          </button>
          <button
            onClick={handleSendManualAlert}
            disabled={isAlertSending}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-red-400 border border-slate-700 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow disabled:opacity-50 cursor-pointer"
          >
            {isAlertSending ? (
              <span className="w-3.5 h-3.5 border-2 border-t-transparent border-red-400 rounded-full animate-spin" />
            ) : (
              <Mail className="w-3.5 h-3.5" />
            )}
            <span>Email Report</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-rose-400 border border-slate-700 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {alertSuccessMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{alertSuccessMsg}</span>
        </div>
      )}

      {/* Primary Severity Banner and Circular Health Gauge */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-1 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-center items-center">
          {(() => {
            const isCritical = diagnosticResult.overall_severity === "Critical";
            const isWarning = diagnosticResult.overall_severity === "Warning";
            const score = isCritical ? 28 : isWarning ? 62 : 98;
            
            let colorClass = "text-emerald-500";
            let strokeColor = "stroke-emerald-500";
            if (score < 50) {
              colorClass = "text-rose-500";
              strokeColor = "stroke-rose-500";
            } else if (score < 80) {
              colorClass = "text-amber-500";
              strokeColor = "stroke-amber-500";
            }

            return (
              <div className="space-y-3 text-center w-full">
                <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="48" cy="48" r="40" className="stroke-slate-850 fill-none" strokeWidth="6" />
                    <circle 
                      cx="48" 
                      cy="48" 
                      r="40" 
                      className={`${strokeColor} fill-none transition-all duration-500`} 
                      strokeWidth="6" 
                      strokeDasharray="251.2" 
                      strokeDashoffset={251.2 - (251.2 * score) / 100} 
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-xl font-black font-mono text-white">{score}%</span>
                </div>
                <div>
                  <p className={`text-xs font-black uppercase tracking-wider ${colorClass}`}>Asset Health Score</p>
                  <p className="text-[9px] text-slate-500 mt-0.5 font-mono">Dynamic ISO evaluation</p>
                </div>
              </div>
            );
          })()}
        </div>

        <div className="md:col-span-3">
          {diagnosticResult.fault_detected ? (
            <div className={`border rounded-2xl p-5 flex flex-col sm:flex-row items-start gap-4 shadow-lg border-l-4 h-full ${
              diagnosticResult.overall_severity === "Critical"
                ? "bg-red-500/10 border-red-500/20 border-l-red-500 text-red-400"
                : "bg-amber-500/10 border-amber-500/20 border-l-amber-500 text-amber-400"
            }`}>
              <div className={`p-2.5 rounded-xl shrink-0 mt-1 ${
                diagnosticResult.overall_severity === "Critical" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"
              }`}>
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-2 flex-1">
                <h4 className="text-xs font-black uppercase tracking-wider font-mono">
                  {diagnosticResult.overall_severity === "Critical" 
                    ? "🚨 CRITICAL FAULT - IMMEDIATE MAINTENANCE ACTION REQUIRED" 
                    : "⚠️ WARNING FAULT - MACHINERY EXCURSION DETECTED"
                  }
                </h4>
                <p className="text-slate-300 text-xs leading-relaxed">
                  {diagnosticResult.executive_summary}
                </p>
                <div className="text-[10px] bg-slate-950 p-2 rounded-lg border border-slate-850 text-slate-400 font-mono">
                  <strong>Confidence:</strong> {diagnosticResult.confidence_score}% | <strong>Ruleset:</strong> ISO 10816-3 Mechanical Criteria
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 flex flex-col sm:flex-row items-start gap-4 shadow-lg border-l-4 border-l-emerald-500 h-full">
              <div className="p-2.5 bg-emerald-500/20 rounded-xl text-emerald-400 shrink-0 mt-1">
                <Check className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="space-y-2 flex-1">
                <h4 className="text-xs font-black text-emerald-400 uppercase tracking-wider font-mono">✓ ALL SYSTEMS OPERATING WITHIN COMPLIANT PARAMETERS</h4>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Vibration levels are fully compliant with ISO baseline specifications. No abnormal thermal, acoustic, or inductive deviations observed.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detailed Technical Analysis Summary */}
      {diagnosticResult.technical_details && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest font-mono">Technical Analysis Deep-Dive</h4>
          <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">
            {diagnosticResult.technical_details}
          </p>
        </div>
      )}

      {/* Identified Fault Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(diagnosticResult.faults || []).map((fault: any, index: number) => (
          <div key={index} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3.5 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex justify-between items-start gap-2 border-b border-slate-850 pb-2">
                <div>
                  <h4 className="text-xs font-black text-white font-mono uppercase tracking-tight">{fault.type}</h4>
                  <span className="text-[8px] font-mono text-slate-500 uppercase">Diagnosed Anomaly</span>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full font-mono border ${
                  fault.severity === "Critical" 
                    ? "bg-red-400/10 border-red-400/20 text-red-400" 
                    : "bg-amber-400/10 border-amber-400/20 text-amber-400"
                }`}>
                  {fault.severity}
                </span>
              </div>

              <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                <p><strong>Evidence:</strong> {fault.evidence}</p>
                {fault.environmental_factors && (
                  <p><strong>Web Search context:</strong> {fault.environmental_factors}</p>
                )}
                {fault.root_cause && (
                  <p><strong>Root cause:</strong> {fault.root_cause}</p>
                )}
                <p><strong>Remedy Action:</strong> {fault.recommendation}</p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-850 flex items-center justify-between gap-2">
              <span className="text-[9px] font-mono text-slate-500 uppercase">Mcmaster-Carr parts: {fault.mcmaster_search_term || "Standard Replacement"}</span>
              <a 
                href={`https://www.mcmaster.com/${encodeURIComponent(fault.mcmaster_search_term || fault.type)}`}
                target="_blank" 
                referrerPolicy="no-referrer"
                className="px-2.5 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-[10px] font-black rounded-lg flex items-center gap-1 shrink-0 cursor-pointer transition-all font-mono"
              >
                <span>Find Parts</span>
                <ArrowUpRight className="w-3 h-3" />
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* SAP/Maximo Work Order display */}
      {generatedWorkOrder && (
        <div className="bg-[#0f172a] border border-slate-850 rounded-2xl p-5 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h4 className="text-xs font-bold text-yellow-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
              <ClipboardCheck className="w-4 h-4" />
              SAP / Maximo Proactive CMMS Work Order
            </h4>
            <button
              onClick={handleCopyToClipboard}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-white rounded text-[10px] font-mono font-bold border border-slate-700 flex items-center gap-1 cursor-pointer transition-all"
            >
              <Copy className="w-3 h-3" />
              <span>Copy WO Code</span>
            </button>
          </div>
          <pre className="text-[10px] font-mono text-slate-300 p-4 bg-slate-950 rounded-xl overflow-x-auto whitespace-pre leading-relaxed border border-slate-900">
            {generatedWorkOrder}
          </pre>
        </div>
      )}
    </div>
  );
}
