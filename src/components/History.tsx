import React, { useState } from "react";
import { SavedReport } from "../types";
import { Calendar, Search, Filter, Trash2, FileText, ChevronRight, AlertCircle, Wrench, ShieldAlert } from "lucide-react";

interface HistoryProps {
  reports: SavedReport[];
  onSelectReport: (report: SavedReport) => void;
  onDeleteReport: (id: string) => void;
  onClearHistory: () => void;
}

export default function History({ reports, onSelectReport, onDeleteReport, onClearHistory }: HistoryProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [severityFilter, setSeverityFilter] = useState<string>("All");

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

  // Filter reports
  const filteredReports = reports.filter((r) => {
    const matchesSearch =
      r.symptoms.toLowerCase().includes(search.toLowerCase()) ||
      (r.fileName && r.fileName.toLowerCase().includes(search.toLowerCase())) ||
      r.data?.probable_faults?.some((f) => f.fault.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory = categoryFilter === "All" || r.category === categoryFilter;

    const matchesSeverity = severityFilter === "All" || r.data?.manager_summary?.severity === severityFilter;

    return matchesSearch && matchesCategory && matchesSeverity;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white font-display">Diagnostic History</h2>
          <p className="text-xs text-slate-400">Search and filter through historical condition monitoring entries</p>
        </div>
        {reports.length > 0 && (
          <button
            onClick={() => {
              if (confirm("Are you sure you want to purge all historical reports? This action is irreversible.")) {
                onClearHistory();
              }
            }}
            className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/40 text-red-400 hover:text-red-300 border border-red-500/20 rounded-lg text-xs font-semibold transition-all"
          >
            Purge History Log
          </button>
        )}
      </div>

      {reports.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-12 text-center max-w-xl mx-auto flex flex-col items-center justify-center space-y-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-500">
            <Calendar className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-slate-200 text-sm">No Saved Reports Available</p>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              When you perform machinery diagnostics scans, you can save them directly into this cloud log for historical reference.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            {/* Search */}
            <div className="sm:col-span-6 relative">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by symptoms, fault names or file attachments..."
                className="w-full bg-slate-900/60 border border-slate-800 hover:border-slate-750 focus:border-yellow-400 focus:outline-none rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200"
              />
            </div>

            {/* Category filter */}
            <div className="sm:col-span-3 relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-800 hover:border-slate-750 focus:border-yellow-400 focus:outline-none rounded-xl px-3.5 py-2.5 text-xs text-slate-350 appearance-none"
              >
                <option value="All">All Categories</option>
                <option value="Mechanical">Mechanical Only</option>
                <option value="Electrical">Electrical Only</option>
                <option value="Hydraulic">Hydraulic Only</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-slate-400">
                <Filter className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Severity filter */}
            <div className="sm:col-span-3 relative">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-800 hover:border-slate-750 focus:border-yellow-400 focus:outline-none rounded-xl px-3.5 py-2.5 text-xs text-slate-350 appearance-none"
              >
                <option value="All">All Severities</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-slate-400">
                <AlertCircle className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Reports List */}
          <div className="space-y-3">
            {filteredReports.length === 0 ? (
              <div className="bg-slate-900/30 border border-slate-850 rounded-2xl py-12 text-center text-xs text-slate-500">
                No reports match your current search queries or filters.
              </div>
            ) : (
              filteredReports.map((report) => (
                <div
                  key={report.id}
                  onClick={() => onSelectReport(report)}
                  className="group bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-4 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-2.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Category */}
                      <span className="text-[10px] font-bold text-yellow-400 bg-yellow-400/5 px-2 py-0.5 rounded border border-yellow-400/10">
                        {report.category}
                      </span>
                      {/* Date */}
                      <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {report.date}
                      </span>
                      {/* File attachment indicators */}
                      {report.fileName && (
                        <span className="text-[9px] text-emerald-400 bg-emerald-400/5 border border-emerald-400/10 px-1.5 py-0.5 rounded flex items-center gap-1 font-sans">
                          <FileText className="w-2.5 h-2.5" />
                          {report.fileName}
                        </span>
                      )}
                    </div>

                    <div className="space-y-0.5">
                      {/* Diagnostic Symptoms Title */}
                      <p className="text-xs font-semibold text-slate-100 group-hover:text-yellow-400 transition-colors truncate">
                        {report.symptoms || "Diagnostic File Asset Assessment"}
                      </p>
                      {/* Main Diagnosed Fault Subheading */}
                      <p className="text-[11px] text-slate-400 truncate">
                        Detected: <span className="font-semibold text-slate-300">{report.data?.probable_faults?.[0]?.fault || "Undetermined failure"}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                    {/* Severity Status Tag */}
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${getSeverityBadge(
                      report.data?.manager_summary?.severity
                    )}`}>
                      {report.data?.manager_summary?.severity}
                    </span>

                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete this saved diagnostic record?")) {
                          onDeleteReport(report.id);
                        }
                      }}
                      className="p-2 bg-slate-950 hover:bg-red-500/15 border border-slate-800 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                      title="Delete Report"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-yellow-400 transition-colors" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
