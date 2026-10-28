import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, RefreshCw } from "lucide-react";
import { navigateToTab } from "../navigation";
import {
  type AnomalyBoard as AnomalyBoardData,
  type AnomalyBoardItem,
  type AnomalySeverityBucket
} from "../lib/anomalyBoard";

const INPUT =
  "min-h-[36px] rounded-lg bg-slate-950 border border-slate-700 px-2.5 text-xs text-slate-100 focus:outline-none focus:border-[#FFC700]/70";
const LABEL = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";

const SEVERITY_BADGE: Record<AnomalySeverityBucket, string> = {
  HIGH: "border-red-500/50 bg-red-500/15 text-red-300",
  MEDIUM: "border-amber-400/50 bg-amber-400/15 text-amber-300",
  LOW: "border-slate-600 bg-slate-800 text-slate-300"
};

const SEVERITY_CARD: Record<AnomalySeverityBucket, string> = {
  HIGH: "border-red-500/30",
  MEDIUM: "border-amber-400/30",
  LOW: "border-slate-700"
};

type SeverityFilter = "ALL" | AnomalySeverityBucket;
type DaysBand = "ALL" | "0-7" | "8-30" | "31-90" | "91+";
type GroupBy = "NONE" | "SEVERITY" | "MODULE" | "DAYS";

function daysBandOf(days: number): Exclude<DaysBand, "ALL"> {
  if (days <= 7) return "0-7";
  if (days <= 30) return "8-30";
  if (days <= 90) return "31-90";
  return "91+";
}

function daysBandLabel(band: Exclude<DaysBand, "ALL">): string {
  if (band === "0-7") return "0-7 days";
  if (band === "8-30") return "8-30 days";
  if (band === "31-90") return "31-90 days";
  return "91+ days";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "date not recorded";
  return d.toLocaleDateString();
}

function severityHeader(item: AnomalyBoardItem): string {
  return item.severity;
}

export default function AnomalyBoard() {
  const [board, setBoard] = useState<AnomalyBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [severity, setSeverity] = useState<SeverityFilter>("ALL");
  const [moduleFilter, setModuleFilter] = useState("ALL");
  const [daysBand, setDaysBand] = useState<DaysBand>("ALL");
  const [groupBy, setGroupBy] = useState<GroupBy>("NONE");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/anomaly-board");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Failed to load anomaly board (HTTP ${res.status})`);
      }
      setBoard(data?.board ?? null);
    } catch (err) {
      setBoard(null);
      setError(err instanceof Error ? err.message : "Failed to load anomaly board.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const items = board?.items ?? [];
    return items.filter((item) => {
      if (severity !== "ALL" && item.severity !== severity) return false;
      if (moduleFilter !== "ALL" && item.module !== moduleFilter) return false;
      if (daysBand !== "ALL" && daysBandOf(item.daysOpen) !== daysBand) return false;
      return true;
    });
  }, [board, severity, moduleFilter, daysBand]);

  const grouped = useMemo(() => {
    if (groupBy === "NONE") return null;
    const groups = new Map<string, AnomalyBoardItem[]>();
    for (const item of filtered) {
      const key =
        groupBy === "SEVERITY"
          ? severityHeader(item)
          : groupBy === "MODULE"
            ? item.moduleLabel
            : daysBandLabel(daysBandOf(item.daysOpen));
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [filtered, groupBy]);

  const modules = board?.modules ?? [];

  return (
    <div className="w-full min-h-full px-2 sm:px-4 py-4 md:px-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Cross-module reliability
          </p>
          <h2 className="text-xl font-bold text-white inline-flex items-center gap-2 mt-0.5">
            <BellRing className="h-5 w-5 text-[#FFC700]" />
            Anomaly Board
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Every open anomaly/fault recorded for the signed-in tenant across
            vibration, oil, ultrasound and thermography.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="min-h-[36px] px-3 rounded-xl border border-[#FFC700]/45 bg-[#FFC700]/10 text-[#FFC700] text-xs font-bold cursor-pointer hover:bg-[#FFC700]/20 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-8 text-center text-sm text-slate-400">
          Loading open anomalies...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-300">Could not load the anomaly board.</p>
          <p className="text-xs text-amber-200/80 mt-1">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 min-h-[36px] px-3 rounded-xl border border-[#FFC700]/45 bg-[#FFC700]/10 text-[#FFC700] text-xs font-bold hover:bg-[#FFC700]/20 transition-colors"
          >
            Try again
          </button>
        </div>
      ) : !board || board.empty ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-10 text-center">
          <BellRing className="h-8 w-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">
            No open anomalies recorded for this tenant yet.
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            The board only shows anomalies opened in the signed-in tenant's
            session. It will populate when a diagnostics run records a fault
            that opens an alert.
          </p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {(["HIGH", "MEDIUM", "LOW"] as const).map((bucket) => (
              <div
                key={bucket}
                className={`rounded-xl border bg-slate-950/60 p-4 ${SEVERITY_CARD[bucket]}`}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {bucket}
                </p>
                <p className="text-2xl font-bold text-white mt-1">
                  {board.counts[bucket]}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">open items</p>
              </div>
            ))}
            <div className="rounded-xl border border-[#FFC700]/30 bg-slate-950/60 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Open / Risk
              </p>
              <p className="text-2xl font-bold text-[#FFC700] mt-1">
                {board.openCount}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                risk index {board.totalRiskIndex} pts
              </p>
            </div>
          </section>

          {board.oldestOpen && (
            <section className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Oldest open item
              </span>
              <span className="text-sm font-semibold text-white">
                {board.oldestOpen.title}
              </span>
              <span className="text-xs text-slate-400">
                {board.oldestOpen.assetName || board.oldestOpen.assetTag || board.oldestOpen.assetId || "Unassigned asset"}
                {" "}&middot; {board.oldestOpen.daysOpen} days
                {" "}&middot; {formatDate(board.oldestOpen.detectedAt)}
              </span>
              <span
                className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SEVERITY_BADGE[board.oldestOpen.severity]}`}
              >
                {board.oldestOpen.severity}
              </span>
            </section>
          )}

          <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 flex flex-wrap items-end gap-3">
            <label className="space-y-1 block">
              <span className={LABEL}>Severity</span>
              <select
                className={INPUT}
                value={severity}
                onChange={(e) => setSeverity(e.target.value as SeverityFilter)}
              >
                <option value="ALL">All severities</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </label>

            <label className="space-y-1 block">
              <span className={LABEL}>Module</span>
              <select
                className={INPUT}
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
              >
                <option value="ALL">All modules</option>
                {modules.map((module) => (
                  <option key={module.key} value={module.key}>
                    {module.label} ({module.count})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 block">
              <span className={LABEL}>Days open</span>
              <select
                className={INPUT}
                value={daysBand}
                onChange={(e) => setDaysBand(e.target.value as DaysBand)}
              >
                <option value="ALL">All ages</option>
                <option value="0-7">0-7 days</option>
                <option value="8-30">8-30 days</option>
                <option value="31-90">31-90 days</option>
                <option value="91+">91+ days</option>
              </select>
            </label>

            <label className="space-y-1 block">
              <span className={LABEL}>Group by</span>
              <select
                className={INPUT}
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              >
                <option value="NONE">No grouping</option>
                <option value="SEVERITY">Severity</option>
                <option value="MODULE">Module</option>
                <option value="DAYS">Days-open band</option>
              </select>
            </label>

            <span className="text-[11px] text-slate-500 ml-auto">
              {filtered.length} of {board.openCount} open
            </span>
          </section>

          <section className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/50">
            <table className="w-full text-left text-xs min-w-[980px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  {[
                    "Severity",
                    "Anomaly / Fault",
                    "Module",
                    "Asset / Lineage",
                    "Days Open",
                    "Risk Index",
                    "Linked WO",
                    "Opened"
                  ].map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#FFC700]/90 whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500 text-sm">
                      No open anomalies match these filters.
                    </td>
                  </tr>
                ) : grouped ? (
                  grouped.map(([label, items]) => (
                    <React.Fragment key={label}>
                      <tr className="border-b border-slate-800 bg-slate-900/60">
                        <td
                          colSpan={8}
                          className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400"
                        >
                          {label} &middot; {items.length}
                        </td>
                      </tr>
                      {items.map((item) => (
                        <AnomalyRow key={item.id} item={item} />
                      ))}
                    </React.Fragment>
                  ))
                ) : (
                  filtered.map((item) => <AnomalyRow key={item.id} item={item} />)
                )}
              </tbody>
            </table>
          </section>

          <p className="text-[10px] text-slate-500 italic">
            Days open = floor((now - first detected) / 86,400,000 ms). Risk index
            = severity weight x days open. Work orders are linked only when the
            same tenant and asset match.
          </p>
        </>
      )}
    </div>
  );
}

function AnomalyRow({ item }: { item: AnomalyBoardItem }) {
  const assetLabel =
    item.assetName || item.assetTag || item.assetId || "Unassigned asset";

  return (
    <tr className="border-b border-slate-800/80 last:border-b-0 hover:bg-slate-900/50">
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span
          className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SEVERITY_BADGE[item.severity]}`}
        >
          {item.severity}
        </span>
      </td>
      <td className="px-3 py-2.5 max-w-[300px]">
        <p className="font-medium text-slate-200">{item.title}</p>
        {item.description && (
          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
            {item.description}
          </p>
        )}
      </td>
      <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
        {item.moduleLabel}
      </td>
      <td className="px-3 py-2.5">
        <button
          type="button"
          onClick={() =>
            item.assetId
              ? navigateToTab("analysis", { assetId: item.assetId })
              : navigateToTab("assets")
          }
          title={
            item.assetId
              ? `Open the saved assessment for ${assetLabel}`
              : "Open the Equipment DB"
          }
          className="text-left text-[#FFC700] hover:underline font-medium cursor-pointer"
        >
          {assetLabel}
        </button>
        <div className="text-[10px] text-slate-500 mt-0.5">
          {item.plantName && <span>{item.plantName}</span>}
          {item.plantName && item.routeName && <span> / </span>}
          {item.routeName && (
            <button
              type="button"
              onClick={() => navigateToTab("assets")}
              title="Open the Equipment DB for this route"
              className="hover:text-slate-300 hover:underline cursor-pointer"
            >
              {item.routeName}
            </button>
          )}
          {!item.plantName && !item.routeName && <span>lineage not recorded</span>}
        </div>
      </td>
      <td className="px-3 py-2.5 text-slate-300 font-mono whitespace-nowrap">
        {item.daysOpen}
      </td>
      <td className="px-3 py-2.5 text-slate-200 font-mono whitespace-nowrap">
        {item.riskIndex}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {item.workOrderNumber != null ? (
          <span className="text-slate-200">
            #{item.workOrderNumber}
            {item.workOrderStatus && (
              <span className="text-[10px] text-slate-500 ml-1">
                ({item.workOrderStatus})
              </span>
            )}
          </span>
        ) : (
          <span className="text-slate-500">&mdash;</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
        {formatDate(item.detectedAt)}
      </td>
    </tr>
  );
}
