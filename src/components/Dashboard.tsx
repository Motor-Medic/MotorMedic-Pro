import React from "react";
import { SavedReport, SystemHealth } from "../types";
import { Activity, AlertTriangle, FileText, CheckCircle2, ShieldAlert, Zap, Droplet, ArrowRight, TrendingUp } from "lucide-react";

interface DashboardProps {
  reports: SavedReport[];
  systemHealth: SystemHealth;
  onNavigate: (tab: "diagnose" | "history") => void;
  onSelectReport: (report: SavedReport) => void;
}

export default function Dashboard({ reports, systemHealth, onNavigate, onSelectReport }: DashboardProps) {
  // Calculate active issues
  const activeIssues = reports.filter(
    (r) => r.data?.manager_summary?.severity === "Critical" || r.data?.manager_summary?.severity === "High"
  );

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case "Critical":
        return "text-red-500 bg-red-500/10 border-red-500/20";
      case "High":
        return "text-amber-500 bg-amber-500/10 border-amber-500/20";
      case "Medium":
        return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
      default:
        return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
    }
  };

  const getHealthBarColor = (pct: number) => {
    if (pct >= 85) return "bg-emerald-500";
    if (pct >= 60) return "bg-amber-500";
    return "bg-rose-500";
  };

  const getHealthTextColor = (pct: number) => {
    if (pct >= 85) return "text-emerald-400";
    if (pct >= 60) return "text-amber-400";
    return "text-rose-400";
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="absolute top-0 right-0 p-6 opacity-5 sm:opacity-10 pointer-events-none">
          <Activity className="w-48 h-48 text-yellow-400" />
        </div>
        <div className="max-w-xl space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-full">
            <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse"></span>
            RELIABILITY ASSURANCE ONLINE
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight font-display text-white">
            Equipment Health Analyzer
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Diagnose mechanical, electrical, and hydraulic faults instantaneously with AI physics-grounded condition monitoring analysis.
          </p>
          <div className="pt-3">
            <button
              onClick={() => onNavigate("diagnose")}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-semibold text-sm rounded-xl shadow-lg transition-all"
            >
              Analyze New Asset
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Metric 1 */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Faults</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white tracking-tight">{activeIssues.length}</span>
              {activeIssues.length > 0 && (
                <span className="text-xs font-medium text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">
                  Action Required
                </span>
              )}
            </div>
          </div>
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Saved Reports</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white tracking-tight">{reports.length}</span>
              <span className="text-xs text-slate-500">total entries</span>
            </div>
          </div>
          <div className="p-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-300">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Plant Operations</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-emerald-400 tracking-tight">NOMINAL</span>
              <span className="text-xs text-slate-500">98.4% uptime</span>
            </div>
          </div>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Health Overview and Recent Faults Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* System Health Overview Card (Column span 7) */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white font-display">System Health Overview</h3>
              <p className="text-xs text-slate-400">Estimated machinery performance index based on active fault severities</p>
            </div>
            <Activity className="w-5 h-5 text-slate-400" />
          </div>

          <div className="space-y-5">
            {/* Mechanical */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2 text-slate-300">
                  <div className="p-1 bg-amber-500/10 rounded-md text-amber-400">
                    <Zap className="w-4 h-4" />
                  </div>
                  <span className="font-medium">Mechanical Systems</span>
                </div>
                <span className={`font-semibold ${getHealthTextColor(systemHealth.mechanical)}`}>
                  {systemHealth.mechanical}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${getHealthBarColor(systemHealth.mechanical)}`}
                  style={{ width: `${systemHealth.mechanical}%` }}
                ></div>
              </div>
            </div>

            {/* Electrical */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2 text-slate-300">
                  <div className="p-1 bg-yellow-500/10 rounded-md text-yellow-400">
                    <Zap className="w-4 h-4" />
                  </div>
                  <span className="font-medium">Electrical Systems</span>
                </div>
                <span className={`font-semibold ${getHealthTextColor(systemHealth.electrical)}`}>
                  {systemHealth.electrical}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${getHealthBarColor(systemHealth.electrical)}`}
                  style={{ width: `${systemHealth.electrical}%` }}
                ></div>
              </div>
            </div>

            {/* Hydraulic */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2 text-slate-300">
                  <div className="p-1 bg-cyan-500/10 rounded-md text-cyan-400">
                    <Droplet className="w-4 h-4" />
                  </div>
                  <span className="font-medium">Hydraulic Systems</span>
                </div>
                <span className={`font-semibold ${getHealthTextColor(systemHealth.hydraulic)}`}>
                  {systemHealth.hydraulic}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${getHealthBarColor(systemHealth.hydraulic)}`}
                  style={{ width: `${systemHealth.hydraulic}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-800/80 text-xs text-slate-400 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-300">Uptime Recommendation:</span> Continuous tracking is active. Keep system variables within designated thermal and vibration amplitude thresholds to protect machinery bearings and hydraulic valves.
            </div>
          </div>
        </div>

        {/* Recent Diagnoses List (Column span 5) */}
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-4">
            <div>
              <h3 className="text-base font-bold text-white font-display">Recent Diagnostics</h3>
              <p className="text-xs text-slate-400">Quick access to latest saved reports</p>
            </div>
            <button
              onClick={() => onNavigate("history")}
              className="text-xs text-yellow-400 hover:text-yellow-500 hover:underline"
            >
              View All
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto max-h-[280px] pr-1">
            {reports.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-10 text-center text-slate-500 space-y-2">
                <FileText className="w-8 h-8 opacity-30" />
                <p className="text-sm">No diagnostic reports yet.</p>
                <button
                  onClick={() => onNavigate("diagnose")}
                  className="text-xs text-yellow-400 hover:underline font-medium"
                >
                  Create one now
                </button>
              </div>
            ) : (
              reports.slice(0, 4).map((report) => (
                <div
                  key={report.id}
                  onClick={() => onSelectReport(report)}
                  className="group bg-slate-850/60 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 cursor-pointer transition-all flex items-start justify-between"
                >
                  <div className="space-y-1 max-w-[70%]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-yellow-400">{report.category}</span>
                      <span className="text-[10px] text-slate-500">• {report.date.split(",")[0]}</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-yellow-400 transition-colors">
                      {report.symptoms || "Visual/Data Diagnostic File"}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {report.data?.probable_faults?.[0]?.fault || "Analyzing Asset"}
                    </p>
                  </div>

                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border ${getSeverityColor(
                      report.data?.manager_summary?.severity
                    )}`}
                  >
                    {report.data?.manager_summary?.severity || "Nominal"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
