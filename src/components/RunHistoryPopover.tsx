import { useState, useEffect, useRef, useMemo } from "react";
import { ChevronDown, Clock, X } from "lucide-react";

export interface RunHistoryRun {
  id: string;
  timestamp: string;
  rpm: number | null;
  primaryFault: string | null;
  peakCount: number;
  analysis_type?: string | null;
}

export const isVibrationRun = (r: { analysis_type?: string | null }) => (r.analysis_type ?? "vibration") === "vibration";

export const isModalityRun = (r: { analysis_type?: string | null }, modality: string) =>
  (r.analysis_type ?? "vibration").toLowerCase() === modality.toLowerCase();

export interface RunHistoryPopoverProps {
  open: boolean;
  onClose: () => void;
  runs: RunHistoryRun[];
  selectedId: string | null;
  onSelect: (run: RunHistoryRun) => void;
  componentLabel: string;
  modalities?: string[];
}

export function RunHistoryTrigger({ onClick, viewDate, isLatest }: { onClick: () => void; viewDate: string; isLatest: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onClick} title="Open run history"
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded transition-colors ${isLatest ? "bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-100" : "bg-amber-500/10 border-amber-500 text-amber-300"}`}>
        <Clock className="w-4 h-4" />
        Run history: {viewDate}{isLatest ? "" : " - not latest"}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${isLatest ? "border-emerald-500/50 text-emerald-400" : "border-amber-500/50 text-amber-400"}`}>
        {isLatest ? "LATEST RUN" : "PAST RUN"}
      </span>
      <span className="text-xs text-slate-400">Browse earlier analysis runs for this component - every tab follows the selected date.</span>
    </div>
  );
}

const PAGE_SIZE = 25;
const MODS = [{ k: "vibration", l: "VIB" }, { k: "mca", l: "MCA" }, { k: "ultrasound", l: "US" }, { k: "thermography", l: "IR" }] as const;
const chipCls = (a: boolean) => `px-2 py-0.5 text-[11px] font-semibold rounded border transition-colors cursor-pointer select-none ${a ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300" : "bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500"}`;

export function RunHistoryPopover({ open, onClose, runs, selectedId, onSelect, componentLabel, modalities = ["vibration"] }: RunHistoryPopoverProps) {
  const [filter, setFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [mods, setMods] = useState<Set<string>>(() => new Set(["vibration"]));
  const [vis, setVis] = useState(PAGE_SIZE);
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  const boundaryRuns = useMemo(() => {
    if (modalities.length === 1 && modalities[0].toLowerCase() === "vibration") return runs.filter(isVibrationRun);
    const allowed = new Set(modalities.map((m) => m.toLowerCase()));
    return runs.filter((r) => allowed.has((r.analysis_type ?? "vibration").toLowerCase()));
  }, [runs, modalities]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of boundaryRuns) { const t = (r.analysis_type ?? "vibration").toLowerCase(); c[t] = (c[t] ?? 0) + 1; }
    return c;
  }, [boundaryRuns]);

  const filtered = useMemo(() => {
    let r = boundaryRuns;
    if (modalities.length > 1 && mods.size > 0) r = r.filter((x) => mods.has((x.analysis_type ?? "vibration").toLowerCase()));
    if (filter) { const q = filter.toLowerCase(); r = r.filter((x) => x.primaryFault?.toLowerCase().includes(q) || x.id.toLowerCase().includes(q)); }
    if (fromDate) { const f = new Date(fromDate).getTime(); r = r.filter((x) => new Date(x.timestamp).getTime() >= f); }
    if (toDate) { const t = new Date(toDate).getTime() + 86400000; r = r.filter((x) => new Date(x.timestamp).getTime() <= t); }
    return [...r].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [boundaryRuns, filter, fromDate, toDate, mods, modalities]);

  const selIdx = selectedId != null ? filtered.findIndex((r) => r.id === selectedId) : -1;
  const displayCount = selIdx >= vis ? selIdx + 1 : vis;
  const displayed = filtered.slice(0, displayCount);

  const toggleMod = (k: string) => { setMods((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; }); setVis(PAGE_SIZE); };

  if (!open) return null;
  const cls = "px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-slate-200 focus:outline-none focus:border-cyan-500";

  return (
    <div ref={backdropRef} onClick={(e) => { if (e.target === backdropRef.current) onClose(); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-2xl mx-4 shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-100">Run history - {componentLabel}</h2>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800">
          <input ref={inputRef} type="text" placeholder="Filter..." value={filter} onChange={(e) => setFilter(e.target.value)} className={`flex-1 ${cls}`} />
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={cls} />
          <span className="text-xs text-slate-500">to</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={cls} />
        </div>
        {modalities.length > 1 && (
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-800">
            {MODS.filter(({ k }) => modalities.some((m) => m.toLowerCase() === k)).map(({ k, l }) => <button key={k} type="button" onClick={() => toggleMod(k)} className={chipCls(mods.has(k))}>{l} <span className="ml-1 opacity-70">{counts[k] ?? 0}</span></button>)}
          </div>
        )}
        <div className="px-4 py-1.5 text-[11px] text-slate-500 border-b border-slate-800">{filtered.length} run{filtered.length !== 1 ? "s" : ""} - showing {displayed.length}</div>
        <div className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">no runs match</p>
          ) : (
            <>
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="text-slate-400 border-b border-slate-700">
                    <th className="px-4 py-2 text-left font-medium">Date</th>
                    <th className="px-4 py-2 text-left font-medium">Type</th>
                    <th className="px-4 py-2 text-right font-medium">RPM</th>
                    <th className="px-4 py-2 text-left font-medium">Top diagnosis</th>
                    <th className="px-4 py-2 text-right font-medium">Peaks</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((run) => (
                    <tr key={run.id} onClick={() => { onSelect(run); onClose(); }}
                      className={`cursor-pointer border-b border-slate-800 transition-colors ${run.id === selectedId ? "bg-cyan-500/10 text-cyan-300" : "hover:bg-slate-800/50 text-slate-300"}`}>
                      <td className="px-4 py-2">{new Date(run.timestamp).toLocaleDateString()}</td>
                      <td className="px-4 py-2 text-xs font-mono uppercase">{(run.analysis_type ?? "vibration").slice(0, 4)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{run.rpm ?? "—"}</td>
                      <td className="px-4 py-2 truncate max-w-[200px]">{run.primaryFault ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{run.peakCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {displayCount < filtered.length && (
                <button type="button" onClick={() => setVis((c) => c + PAGE_SIZE)}
                  className="w-full px-4 py-2 text-xs font-medium text-cyan-400 hover:bg-slate-800 transition-colors">
                  Show {Math.min(PAGE_SIZE, filtered.length - displayCount)} earlier runs
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
