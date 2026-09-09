import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { SavedAnalysisResult } from "../lib/analysisPersistence";

function extractRpm(row: SavedAnalysisResult): number | null {
  const td = row.telemetry_data;
  if (!td || typeof td !== "object") return null;
  const o = td as Record<string, unknown>;
  const vtr = o.vibration_trend_record as Record<string, unknown> | undefined;
  const r = Number(o.rpm ?? o.running_speed_rpm ?? (vtr ? vtr.rpm : null));
  return Number.isFinite(r) && r > 0 ? r : null;
}

export interface AnalysisHistoryBrowserProps {
  analyses: SavedAnalysisResult[];
  selectedId: string | null;
  onSelect: (analysis: SavedAnalysisResult) => void;
}

export default function AnalysisHistoryBrowser({ analyses, selectedId, onSelect }: AnalysisHistoryBrowserProps) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let rows = [...analyses].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (dateFrom) { const from = new Date(dateFrom).getTime(); rows = rows.filter((r) => new Date(r.timestamp).getTime() >= from); }
    if (dateTo) { const to = new Date(dateTo).getTime() + 86400000; rows = rows.filter((r) => new Date(r.timestamp).getTime() <= to); }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => (r.primary_fault || "").toLowerCase().includes(q) || (r.component || "").toLowerCase().includes(q) || (r.asset_id || "").toLowerCase().includes(q));
    }
    return rows;
  }, [analyses, dateFrom, dateTo, search]);

  if (analyses.length === 0) return null;

  return (
    <div className="mb-4 border border-slate-800 rounded-lg bg-slate-900/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900/80">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0">Run History</span>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
          <input type="text" placeholder="Filter…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-6 pl-6 pr-2 text-xs bg-slate-800 border border-slate-700 rounded text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 w-32" />
        </div>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-6 px-1.5 text-xs bg-slate-800 border border-slate-700 rounded text-slate-300 focus:outline-none focus:border-amber-500/50" />
        <span className="text-[10px] text-slate-600">to</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-6 px-1.5 text-xs bg-slate-800 border border-slate-700 rounded text-slate-300 focus:outline-none focus:border-amber-500/50" />
      </div>
      <div className="max-h-48 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-900">
            <tr className="text-slate-500 border-b border-slate-800">
              <th className="text-left px-3 py-1.5 font-medium">Date</th>
              <th className="text-right px-3 py-1.5 font-medium">RPM</th>
              <th className="text-left px-3 py-1.5 font-medium">Top Diagnosis</th>
              <th className="text-right px-3 py-1.5 font-medium">Peaks</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} onClick={() => onSelect(row)} className={`cursor-pointer border-b border-slate-800/50 transition-colors ${row.id === selectedId ? "bg-amber-500/10 text-amber-300" : "hover:bg-slate-800/50 text-slate-400"}`}>
                <td className="px-3 py-1.5 whitespace-nowrap">{row.timestamp ? new Date(row.timestamp).toLocaleDateString() : "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{extractRpm(row) ?? "—"}</td>
                <td className="px-3 py-1.5 truncate max-w-[200px]">{row.primary_fault || "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{Array.isArray(row.peaks) ? row.peaks.length : 0}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-600">No runs match filters</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
