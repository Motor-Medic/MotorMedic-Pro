import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Loader2, Sparkles, Zap } from "lucide-react";
import { fetchAlerts, fetchAnalysisResults, type SavedAlert, type SavedAnalysisResult } from "../lib/analysisPersistence";
import RouteCadenceSection from "./planning/RouteCadenceSection";
import WorkOrderVerificationSection from "./planning/WorkOrderVerificationSection";
import {
  approveWorkOrderDraft,
  discardWorkOrderDraft,
  getWorkOrderDraftsSnapshot,
  subscribeWorkOrderDrafts,
  type WorkOrderDraft
} from "../lib/maintenance/workOrderDrafts";

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

const CAL_VIEWS: { id: CalView; label: string; title: string }[] = [
  { id: "month", label: "Month", title: "month grid" },
  { id: "week", label: "Week", title: "week list" },
  { id: "gantt", label: "Gantt", title: "gantt timeline" },
  { id: "list", label: "List", title: "flat list" }
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

/* ========================================================================== */
/* Draft Proposals (H3-2) - proposals generated from Fusion WINDOW/CROSSED    */
/* rows. A draft is never a work order: approve only records a state that     */
/* still awaits real CMMS integration (none is built). No dollars on drafts.  */
/* ========================================================================== */

function DraftProposalsSection() {
  const drafts = useSyncExternalStore(subscribeWorkOrderDrafts, getWorkOrderDraftsSnapshot);

  return (
    <section className={`${CARD} mb-6`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
        Draft Proposals
      </p>
      <p className="text-xs text-slate-500 mb-3">
        proposals awaiting your approval - generated from prognostic verdicts
      </p>
      {drafts.length === 0 ? (
        <p className="text-xs italic text-slate-400">
          no draft proposals - no WINDOW or CROSSED verdicts pending
        </p>
      ) : (
        <div className="space-y-3">
          {drafts.map((d: WorkOrderDraft) => (
            <div key={d.id}>
              <DraftProposalCard draft={d} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DraftProposalCard({ draft: d }: { draft: WorkOrderDraft }) {
  const generated = d.generatedAt
    ? new Date(d.generatedAt).toLocaleString()
    : "generated-at not on record";
  const slopeTxt =
    d.slope !== null && d.seOfSlope !== null
      ? `slope ${d.slope.toFixed(4)} +/- ${d.seOfSlope.toFixed(4)} ${d.unit || "units"} per day`
      : "slope not computed - no fit on record";

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-950/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-white">{d.modalityLabel}</span>
          <span className="text-[11px] text-slate-400 font-mono">
            {d.assetId}
            {d.component ? ` / ${d.component}` : ""}
          </span>
          <span className="px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 border-amber-500/40 text-amber-300">
            {d.verdict || "verdict not on record"}
          </span>
          <span className="px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider bg-slate-500/15 border-slate-500/40 text-slate-300">
            {d.status}
          </span>
        </div>
        <div className="flex gap-2 shrink-0">
          {d.status === "draft" && (
            <button
              type="button"
              onClick={() => approveWorkOrderDraft(d.id)}
              className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 cursor-pointer"
            >
              Approve
            </button>
          )}
          <button
            type="button"
            onClick={() => discardWorkOrderDraft(d.id)}
            className="text-[10px] px-1.5 py-0.5 rounded border border-red-500/40 text-red-300 hover:bg-red-500/10 cursor-pointer"
          >
            Discard
          </button>
        </div>
      </div>

      <div className="space-y-1 text-[11px] text-slate-400">
        <p>target: {d.target || "target not on record"}</p>
        <p>
          tracked metric: {d.trackedMetric || "not on record"} · unit: {d.unit || "not on record"}
        </p>
        <p>
          verdict: {d.verdict || "not on record"} - {d.sentence || "sentence not on record"}
        </p>
        <p>
          N = {d.n} over {d.spanDays.toFixed(1)} days · {slopeTxt}
        </p>
        <p>threshold provenance: {d.thresholdProvenance}</p>
        <p>generated at: {generated}</p>
      </div>

      <p className="text-[10px] text-amber-400/90 italic mt-2">
        proposal is guidance, not a diagnosis
      </p>
      {d.status === "approved" && (
        <p className="text-[10px] text-cyan-300 mt-1">
          approved - awaiting real CMMS integration (no sync built)
        </p>
      )}
    </div>
  );
}

/** Chips shown per day cell before the "+N more" pill.
 * Geometry (no DOM measurement): cell box 88px - 1px borders x2 - 12px padding = 74px content;
 * day label ~19px + one 2-line chip ~43px + pill ~10px ≈ 72px fits; a second chip (~43px more) would clip. */
const MAX_CHIPS_PER_DAY = 1;

export function DayCell({
  day,
  events,
  onSelect
}: {
  day: number | null;
  events: CalendarEvent[];
  onSelect: (ev: CalendarEvent) => void;
}) {
  const shown = events.slice(0, MAX_CHIPS_PER_DAY);
  const hidden = events.slice(MAX_CHIPS_PER_DAY);
  return (
    <div className="min-h-[88px] max-h-[88px] overflow-hidden rounded-lg border border-white/10 bg-slate-950/50 p-1.5">
      {day != null && (
        <>
          <p className="text-[10px] text-slate-500 mb-1">{day}</p>
          {shown.map((ev) => (
            <button
              key={ev.id}
              type="button"
              onClick={() => onSelect(ev)}
              title={`${ev.time} — ${ev.title}`}
              className="w-full text-left rounded-md border border-cyan-500/40 bg-cyan-500/10 p-1.5 mb-1 cursor-pointer hover:border-cyan-400/60 transition-colors"
            >
              <p className="text-[10px] font-bold text-white leading-tight line-clamp-2 break-words">
                {ev.time} — {ev.title}
              </p>
            </button>
          ))}
          {hidden.length > 0 && (
            <div
              title={hidden.map((h) => `${h.time} — ${h.title}`).join("\n")}
              className="text-[10px] font-bold text-slate-400 leading-none cursor-default"
            >
              +{hidden.length} more
            </div>
          )}
        </>
      )}
    </div>
  );
}

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
  const [fetchFailed, setFetchFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchFailed(false);
    void Promise.all([
      fetchAlerts({ limit: 100 }).catch(() => { if (!cancelled) setFetchFailed(true); return [] as SavedAlert[]; }),
      fetchAnalysisResults({ limit: 50 }).catch(() => { if (!cancelled) setFetchFailed(true); return [] as SavedAnalysisResult[]; })
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

  const rangeLabel = useMemo(() => {
    if (calView === "month") return monthLabel;
    const list = calView === "week" ? events.slice(0, 14) : events;
    if (list.length === 0) return "no dates on record";
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const newest = list[0].when;
    const oldest = list[list.length - 1].when;
    return oldest.getTime() === newest.getTime() ? fmt(newest) : `${fmt(oldest)} - ${fmt(newest)}`;
  }, [calView, monthLabel, events]);

  const eventsInView = useMemo(() => {
    if (calView === "week") return Math.min(14, events.length);
    if (calView !== "month") return events.length;
    const anchor = events[0]?.when ?? new Date();
    return events.filter(
      (ev) => ev.when.getFullYear() === anchor.getFullYear() && ev.when.getMonth() === anchor.getMonth()
    ).length;
  }, [events, calView]);

  const viewLabel = CAL_VIEWS.find((v) => v.id === calView)?.label ?? "Month";
  const groupLabel = groupBy === "asset" ? "Asset Route" : "Technician";

  return (
    <div className="w-full min-h-full bg-slate-950 text-white px-4 py-6 md:px-6">
      {/* ===== GLOBAL HEADER ===== */}
      <div className={`${CARD} mb-6`}>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
              Maintenance Calendar Engine
            </p>
            <p className="text-xs text-slate-400">
              {loading ? "loading scheduled events" : `${events.length} scheduled events`}
              {" - compiled from saved alerts, action plans & sign-offs"}
            </p>
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
        <p className="text-[11px] text-slate-500 mt-4 pt-3 border-t border-white/5">
          {`Showing ${viewLabel} ${rangeLabel} - grouped by ${groupLabel} - ${eventsInView} events in view`}
        </p>
      </div>

      {loading && (
        <div className={`${CARD} mb-6 flex items-center gap-2 text-sm text-slate-400`}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading scheduled events…
        </div>
      )}

      {!loading && events.length === 0 && (
        <section className={`${CARD} mb-6 text-center py-16 px-4`}>
          {fetchFailed ? (
            <p className="text-sm text-amber-400">alerts unavailable - fetch failed</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-300 mb-1">No maintenance events on file.</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Saved diagnostics alerts, engineer sign-offs, and action-plan recommendations will
                appear here once recorded.
              </p>
            </>
          )}
        </section>
      )}

      {!loading && events.length > 0 && (
        <>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-6">
            <div className="flex flex-wrap gap-2">
              {CAL_VIEWS.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setCalView(view.id)}
                  title={view.title}
                  className={tabBtn(calView === view.id)}
                >
                  {view.label}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-400">
              Group events by:
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
                  <React.Fragment key={idx}>
                    <DayCell
                      day={day}
                      events={day ? eventsForDay(day) : []}
                      onSelect={setSelectedWO}
                    />
                  </React.Fragment>
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
      {activeCalTab === 1 && <DraftProposalsSection />}
      {activeCalTab === 1 && <WorkOrderVerificationSection />}

      {activeCalTab === 1 && <RouteCadenceSection variant="planner" />}
      {activeCalTab === 1 && <RouteCadenceSection variant="calendar" />}

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
