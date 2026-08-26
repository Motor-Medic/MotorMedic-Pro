import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Zap } from "lucide-react";
import { fetchAlerts, fetchAnalysisResults, type SavedAlert, type SavedAnalysisResult } from "../lib/analysisPersistence";

/* ========================================================================== */
/* Props (unchanged contract for App.tsx)                                     */
/* ========================================================================== */

interface MaintenanceCalendarProps {
  selectedCompanyId?: number;
  onNavigateToTrends?: (assetId?: string) => void;
}

const CARD = "bg-slate-900/50 border border-white/10 rounded-xl p-6";

type CalTab = 1 | 2 | 3 | 4;
type CalView = "month" | "week" | "gantt" | "list";
type GroupBy = "asset" | "tech";

const CAL_TABS: { id: CalTab; label: string }[] = [
  { id: 1, label: "🗓️ Schedule & Dispatch" },
  { id: 2, label: "👷 Resource & Skills" },
  { id: 3, label: "📦 Parts & Downtime" },
  { id: 4, label: "📋 PM/PdM Templates" }
];

const CAL_VIEWS: { id: CalView; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "gantt", label: "Gantt" },
  { id: "list", label: "List" }
];

interface CalendarEvent {
  id: string;
  title: string;
  time: string;
  when: Date;
  kind: "alert" | "action-plan" | "sign-off";
  assetId: string;
  tech: string;
  tools: string;
  parts: string;
  vibration: string;
}

interface SignOffRow {
  diagnosis_id: string;
  status: string;
  engineer_name?: string | null;
  updated_at?: string;
}

async function fetchSignOff(diagnosisId: string): Promise<SignOffRow | null> {
  try {
    const res = await fetch(
      `/api/diagnosis-sign-off?diagnosisId=${encodeURIComponent(diagnosisId)}`
    );
    if (!res.ok) return null;
    const body = await res.json();
    return body.signOff ?? body.sign_off ?? null;
  } catch {
    return null;
  }
}

function buildEvents(
  alerts: SavedAlert[],
  analyses: SavedAnalysisResult[],
  signOffs: Map<string, SignOffRow>
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const alert of alerts) {
    const when = alert.created_at ? new Date(alert.created_at) : new Date();
    events.push({
      id: `alert-${alert.id}`,
      title: alert.title || "Diagnostics alert",
      time: when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
      when,
      kind: "alert",
      assetId: alert.asset_id || "—",
      tech: "—",
      tools: "—",
      parts: "—",
      vibration: alert.description || "—"
    });
  }

  for (const rec of analyses) {
    const when = new Date(rec.timestamp || rec.created_at || Date.now());
    for (const [idx, recText] of (rec.recommendations || []).entries()) {
      events.push({
        id: `action-${rec.id}-${idx}`,
        title: String(recText),
        time: when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
        when,
        kind: "action-plan",
        assetId: rec.asset_id || "—",
        tech: "From saved diagnosis",
        tools: rec.analysis_type || "—",
        parts: "—",
        vibration: rec.primary_fault || "—"
      });
    }
    const signOff = signOffs.get(rec.id);
    if (signOff && signOff.status !== "pending") {
      const signedWhen = signOff.updated_at ? new Date(signOff.updated_at) : when;
      events.push({
        id: `signoff-${rec.id}`,
        title: `Engineer sign-off (${signOff.status})`,
        time: signedWhen.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
        when: signedWhen,
        kind: "sign-off",
        assetId: rec.asset_id || "—",
        tech: signOff.engineer_name || "—",
        tools: "Certified review",
        parts: "—",
        vibration: rec.primary_fault || "—"
      });
    }
  }

  return events.sort((a, b) => b.when.getTime() - a.when.getTime());
}

const tabBtn = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
    active
      ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
      : "bg-slate-800 border-slate-700 text-slate-400"
  }`;

export default function MaintenanceCalendar({
  selectedCompanyId,
  onNavigateToTrends
}: MaintenanceCalendarProps) {
  void selectedCompanyId;

  const [activeCalTab, setActiveCalTab] = useState<CalTab>(1);
  const [calView, setCalView] = useState<CalView>("month");
  const [groupBy, setGroupBy] = useState<GroupBy>("asset");
  const [selectedWO, setSelectedWO] = useState<CalendarEvent | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetchAlerts({ limit: 100 }).catch(() => [] as SavedAlert[]),
      fetchAnalysisResults({ limit: 50 }).catch(() => [] as SavedAnalysisResult[])
    ])
      .then(async ([alerts, analyses]) => {
        const signOffEntries = await Promise.all(
          analyses.slice(0, 25).map(async (rec) => {
            const row = await fetchSignOff(rec.id);
            return row ? ([rec.id, row] as const) : null;
          })
        );
        const signOffs = new Map(
          signOffEntries.filter((e): e is [string, SignOffRow] => e != null)
        );
        if (!cancelled) {
          setEvents(buildEvents(alerts, analyses, signOffs));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const monthLabel = useMemo(() => {
    const d = events[0]?.when ?? new Date();
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [events]);

  const monthDays = useMemo(() => {
    const anchor = events[0]?.when ?? new Date();
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: 35 }, (_, i) => {
      const day = i - startPad + 1;
      return day >= 1 && day <= daysInMonth ? day : null;
    });
  }, [events]);

  const eventsForDay = (day: number) => {
    const anchor = events[0]?.when ?? new Date();
    return events.filter(
      (ev) =>
        ev.when.getFullYear() === anchor.getFullYear() &&
        ev.when.getMonth() === anchor.getMonth() &&
        ev.when.getDate() === day
    );
  };

  return (
    <div className="w-full min-h-full bg-slate-950 text-white px-4 py-6 md:px-6">
      {/* ===== GLOBAL HEADER ===== */}
      <div className={`${CARD} mb-6`}>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
              Maintenance Calendar Engine
            </p>
            <div className="flex flex-wrap gap-2">
              <div className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs">
                <span className="text-slate-300">
                  SCHEDULED EVENTS: {loading ? "…" : events.length}
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-400">
                From saved alerts, action plans &amp; sign-offs
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled
              title="AI optimizer not yet connected — schedule optimizer endpoint not available"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 text-xs font-semibold cursor-not-allowed hover:bg-slate-700 transition-colors"
            >
              <Zap className="h-3.5 w-3.5" />
              Optimize Schedule
            </button>
            <button
              type="button"
              disabled
              title="Work order form integration pending — WO form endpoint not connected"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 text-xs font-semibold cursor-not-allowed hover:bg-slate-700 transition-colors"
            >
              + New Work Order
            </button>
          </div>
        </div>
      </div>

      {/* ===== SUB-TAB NAV ===== */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CAL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveCalTab(tab.id)}
            className={tabBtn(activeCalTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== TAB 1: SCHEDULE & DISPATCH ===== */}
      {activeCalTab === 1 && loading && (
        <div className={`${CARD} mb-6 flex items-center gap-2 text-sm text-slate-400`}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading scheduled events…
        </div>
      )}

      {activeCalTab === 1 && !loading && events.length === 0 && (
        <section className={`${CARD} mb-6 text-center py-16 px-4`}>
          <p className="text-sm font-semibold text-slate-300 mb-1">No maintenance events on file.</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Saved diagnostics alerts, engineer sign-offs, and action-plan recommendations will
            appear here once recorded.
          </p>
        </section>
      )}

      {activeCalTab === 1 && !loading && events.length > 0 && (
        <>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-6">
            <div className="flex flex-wrap gap-2">
              {CAL_VIEWS.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setCalView(view.id)}
                  className={tabBtn(calView === view.id)}
                >
                  {view.label}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-400">
              Group By:
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-cyan-500"
              >
                <option value="asset">Asset Route</option>
                <option value="tech">Technician</option>
              </select>
            </label>
          </div>

          {calView === "month" && (
            <div className={`${CARD} mb-6`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-white">{monthLabel}</h3>
                <p className="text-xs text-slate-400">
                  Grouped by {groupBy === "asset" ? "Asset Route" : "Technician"}
                </p>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div
                    key={d}
                    className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 py-2"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthDays.map((day, idx) => (
                  <div
                    key={idx}
                    className="min-h-[88px] rounded-lg border border-white/10 bg-slate-950/50 p-1.5"
                  >
                    {day && (
                      <>
                        <p className="text-[10px] text-slate-500 mb-1">{day}</p>
                        {eventsForDay(day).slice(0, 2).map((ev) => (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => setSelectedWO(ev)}
                            className="w-full text-left rounded-md border border-cyan-500/40 bg-cyan-500/10 p-1.5 mb-1 cursor-pointer hover:border-cyan-400/60 transition-colors"
                          >
                            <p className="text-[10px] font-bold text-white leading-tight truncate">
                              {ev.time} — {ev.title}
                            </p>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {calView === "week" && (
            <div className={`${CARD} mb-6`}>
              <h3 className="text-base font-bold text-white mb-4">Week View</h3>
              <ul className="space-y-2">
                {events.slice(0, 14).map((ev) => (
                  <li key={ev.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedWO(ev)}
                      className="w-full text-left rounded-lg border border-white/10 bg-slate-950/50 p-3 hover:border-cyan-500/40 cursor-pointer"
                    >
                      <p className="text-xs text-slate-400">
                        {ev.when.toLocaleDateString()} · {ev.time}
                      </p>
                      <p className="text-sm font-semibold text-white mt-0.5">{ev.title}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {calView === "gantt" && (
            <div className={`${CARD} mb-6 overflow-x-auto`}>
              <h3 className="text-base font-bold text-white mb-4">
                Gantt — by {groupBy === "asset" ? "Asset" : "Technician"}
              </h3>
              <div className="min-w-[640px] space-y-3">
                {[...new Set(events.map((e) => (groupBy === "asset" ? e.assetId : e.tech)))].map(
                  (row, i) => (
                    <div key={row} className="flex items-center gap-3">
                      <p className="w-40 shrink-0 text-xs text-slate-300 truncate">{row}</p>
                      <div className="flex-1 h-8 rounded bg-slate-950 border border-white/10 relative">
                        <button
                          type="button"
                          onClick={() => {
                            const match = events.find((e) =>
                              groupBy === "asset" ? e.assetId === row : e.tech === row
                            );
                            if (match) setSelectedWO(match);
                          }}
                          className="absolute top-1 bottom-1 rounded bg-cyan-500/30 border border-cyan-500/50 cursor-pointer hover:bg-cyan-500/40"
                          style={{ left: `${10 + i * 12}%`, width: "18%" }}
                        />
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {calView === "list" && (
            <div className={`${CARD} mb-6`}>
              <h3 className="text-base font-bold text-white mb-4">Event List</h3>
              <div className="w-full overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="bg-slate-950/80 text-slate-400 text-left text-[10px] uppercase tracking-widest">
                      <th className="px-3 py-2 font-bold">When</th>
                      <th className="px-3 py-2 font-bold">Event</th>
                      <th className="px-3 py-2 font-bold">Asset</th>
                      <th className="px-3 py-2 font-bold">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => (
                      <tr key={ev.id} className="border-t border-white/10">
                        <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                          {ev.when.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setSelectedWO(ev)}
                            className="text-white font-medium hover:text-cyan-400 cursor-pointer text-left"
                          >
                            {ev.title}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-slate-400">{ev.assetId}</td>
                        <td className="px-3 py-2.5 text-slate-400 text-xs capitalize">
                          {ev.kind.replace("-", " ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Quick-Peek panel (static, scrolls with page — not fixed) */}
          {selectedWO && (
            <div className={`${CARD} mb-6 border-cyan-500/30`}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-1">
                    Quick Peek
                  </p>
                  <h3 className="text-base font-bold text-white">
                    {selectedWO.time} — {selectedWO.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedWO(null)}
                  className="text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Assigned Tech
                  </p>
                  <p className="text-sm text-white">{selectedWO.tech}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Required Tools / Parts
                  </p>
                  <p className="text-sm text-slate-300">{selectedWO.tools}</p>
                  <p className="text-xs text-slate-500 mt-1">{selectedWO.parts}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Live Sensor Health
                  </p>
                  <p className="text-sm text-slate-300">{selectedWO.vibration}</p>
                  <button
                    type="button"
                    onClick={() => onNavigateToTrends?.(selectedWO.assetId)}
                    className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer underline"
                  >
                    Open Trend Analyzer →
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== TAB 2: RESOURCE & SKILLS ===== */}
      {activeCalTab === 2 && (
        <section className={`${CARD} mb-6 text-center py-16 px-4`}>
          <p className="text-sm font-semibold text-slate-300 mb-1">No technician workload data.</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Resource scheduling requires work-order assignees from your CMMS. Events on the Schedule
            tab show saved alerts and action plans only.
          </p>
        </section>
      )}

      {activeCalTab === 3 && (
        <section className={`${CARD} mb-6 text-center py-16 px-4`}>
          <p className="text-sm font-semibold text-slate-300 mb-1">No parts reservations on file.</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Parts kitting links to work orders once CMMS integration is connected.
          </p>
        </section>
      )}

      {activeCalTab === 4 && (
        <section className={`${CARD} mb-6 text-center py-16 px-4`}>
          <p className="text-sm font-semibold text-slate-300 mb-1">No PM/PdM templates saved.</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Template studio will populate when recurring routes are configured in your CMMS.
          </p>
        </section>
      )}
    </div>
  );
}
