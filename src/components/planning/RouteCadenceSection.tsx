/**
 * RouteCadenceSection — per-route cadence buckets for planner/calendar pages.
 * Cadence targets are site practice; a due date from a missing frequency is a
 * confession, not a guess; absence != normal; rendered rows capped at 10.
 */
import React, { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { getEquipmentData, type EquipRoute } from "../../data/equipmentDb";
import { fetchAnalysisResults, type SavedAnalysisResult } from "../../lib/analysisPersistence";

export interface RouteCadenceSectionProps {
  variant: "planner" | "calendar";
}

const FREQ_DAYS: Record<string, number> = {
  Daily: 1,
  Weekly: 7,
  "Bi-Weekly": 14,
  Monthly: 30,
  "Bi-Monthly": 60,
  Quarterly: 90,
  "Semi-Annually": 182,
  Annually: 365,
};

const MODALITY_LABEL: Record<string, string> = {
  vibration: "Vibration",
  thermography: "Thermography",
  ultrasound: "Ultrasound",
  mca: "MCA",
  oil: "Oil",
};

const DAY_MS = 86400000;
const MAX_ROWS = 10;
const CADENCE_CONFESS = "cadence target not recorded - actual intervals only";
const OVERDUE_LABEL = "guidance flag, not a diagnosis";

interface Bucket {
  modality: string;
  label: string;
  lastDate: string | null;
}

interface RouteRow {
  id: string;
  name: string;
  frequency: string | null;
  freqDays: number | null;
  analyst: string | null;
  buckets: Bucket[];
  lastAny: string | null;
}

interface CalEntry {
  key: string;
  routeName: string;
  modalityLabel: string;
  due: Date | null;
  overdue: boolean;
  confession: string | null;
}

function dayLabel(iso: string | null): string {
  if (!iso) return "no collections on record";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "no collections on record";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildRows(routes: EquipRoute[], analyses: SavedAnalysisResult[]): RouteRow[] {
  return routes.map((route) => {
    const assetIds = new Set(route.assets.map((a) => a.id));
    const mine = analyses.filter((a) => a.asset_id != null && assetIds.has(a.asset_id));
    const freq = route.collectionFrequency ?? null;
    const freqDays = freq != null && Object.prototype.hasOwnProperty.call(FREQ_DAYS, freq) ? FREQ_DAYS[freq] : null;
    const freqAny = (route as unknown as Record<string, unknown>).analyst;
    const analyst = typeof freqAny === "string" && freqAny.trim() !== "" ? freqAny : null;

    const buckets: Bucket[] = Object.keys(MODALITY_LABEL).map((modality) => {
      let last: string | null = null;
      for (const a of mine) {
        const am = (a.analysis_type ?? "vibration").toLowerCase();
        if (am !== modality) continue;
        const ts = a.timestamp || a.created_at || null;
        if (!ts) continue;
        if (!last || new Date(ts).getTime() > new Date(last).getTime()) last = ts;
      }
      return { modality, label: MODALITY_LABEL[modality] ?? modality, lastDate: last };
    });

    let lastAny: string | null = null;
    for (const b of buckets) {
      if (b.lastDate && (!lastAny || new Date(b.lastDate).getTime() > new Date(lastAny).getTime())) {
        lastAny = b.lastDate;
      }
    }

    return { id: route.id, name: route.name, frequency: freq, freqDays, analyst, buckets, lastAny };
  });
}

function Footer() {
  return (
    <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
      cadence targets are site practice. Due dates are computed only from stored cadence targets
      and recorded collection dates; missing values are shown as confessions, not estimates.
      Overdue marks are guidance flags, not diagnoses.
    </p>
  );
}

function AnalystTag({ analyst }: { analyst: string | null }) {
  if (analyst) {
    return <span className="text-[11px] text-slate-300 shrink-0">{analyst}</span>;
  }
  return <span className="text-[11px] italic text-slate-500 shrink-0">analyst not assigned</span>;
}

function PlannerGrid({ rows }: { rows: RouteRow[] }) {
  const shown = rows.slice(0, MAX_ROWS);
  const overflow = rows.length - shown.length;
  const today = startOfToday();

  if (rows.length === 0) {
    return <p className="text-xs italic text-slate-500">no routes configured on this site</p>;
  }

  return (
    <div className="space-y-3">
      {shown.map((row) => (
        <div key={row.id} className="rounded-lg border border-slate-700/80 bg-slate-950/40 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm font-bold text-white min-w-0 truncate">{row.name}</p>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-mono text-slate-400">
                {row.frequency ?? "no frequency"}
              </span>
              <AnalystTag analyst={row.analyst} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {row.buckets.map((b) => {
              const due =
                row.freqDays != null && b.lastDate
                  ? new Date(new Date(b.lastDate).getTime() + row.freqDays * DAY_MS)
                  : null;
              const overdue = due != null && due.getTime() < today.getTime();
              return (
                <div key={b.modality} className="rounded border border-slate-800 bg-slate-900/60 p-2 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{b.label}</p>
                  <p className="text-xs text-slate-300 font-mono mt-0.5 break-words">{dayLabel(b.lastDate)}</p>
                  {due != null ? (
                    <p className="text-[11px] mt-1 text-slate-400 break-words">
                      next due {dayLabel(due.toISOString())}
                      {overdue && (
                        <span className="block text-amber-400 mt-0.5">
                          overdue — {OVERDUE_LABEL}
                        </span>
                      )}
                    </p>
                  ) : row.freqDays == null ? (
                    <p className="text-[11px] mt-1 italic text-slate-500 break-words">{CADENCE_CONFESS}</p>
                  ) : (
                    <p className="text-[11px] mt-1 italic text-slate-500 break-words">
                      no collection recorded - due date cannot be computed
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {overflow > 0 && (
        <p className="text-[11px] text-slate-500">+{overflow} more route{overflow === 1 ? "" : "s"} not shown</p>
      )}
    </div>
  );
}

function CalendarList({ rows, failed }: { rows: RouteRow[]; failed: boolean }) {
  const today = startOfToday();
  const in30 = new Date(today.getTime() + 30 * DAY_MS);
  const in60 = new Date(today.getTime() + 60 * DAY_MS);
  const in90 = new Date(today.getTime() + 90 * DAY_MS);

  const entries: CalEntry[] = [];
  for (const row of rows) {
    const modalitiesWithHistory = row.buckets.filter((b) => b.lastDate != null);
    if (modalitiesWithHistory.length === 0) {
      entries.push({
        key: `${row.id}-none`,
        routeName: row.name,
        modalityLabel: "All",
        due: null,
        overdue: false,
        confession: "no collections on record",
      });
      continue;
    }
    for (const b of modalitiesWithHistory) {
      if (row.freqDays == null || b.lastDate == null) {
        entries.push({
          key: `${row.id}-${b.modality}-conf`,
          routeName: row.name,
          modalityLabel: b.label,
          due: null,
          overdue: false,
          confession: CADENCE_CONFESS,
        });
        continue;
      }
      const due = new Date(new Date(b.lastDate).getTime() + row.freqDays * DAY_MS);
      if (due.getTime() > in90.getTime()) continue;
      entries.push({
        key: `${row.id}-${b.modality}-due`,
        routeName: row.name,
        modalityLabel: b.label,
        due,
        overdue: due.getTime() < today.getTime(),
        confession: null,
      });
    }
  }

  const overdue = entries.filter((e) => e.overdue).sort((a, b) => (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0));
  const w30 = entries.filter((e) => !e.overdue && e.due != null && e.due <= in30).sort((a, b) => (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0));
  const w60 = entries.filter((e) => !e.overdue && e.due != null && e.due > in30 && e.due <= in60).sort((a, b) => (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0));
  const w90 = entries.filter((e) => !e.overdue && e.due != null && e.due > in60 && e.due <= in90).sort((a, b) => (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0));
  const confessions = entries.filter((e) => e.due == null && !e.overdue);

  const ordered: Array<{ heading: string | null; items: CalEntry[] }> = [
    { heading: "Overdue", items: overdue },
    { heading: "Next 30 days", items: w30 },
    { heading: "Next 31–60 days", items: w60 },
    { heading: "Next 61–90 days", items: w90 },
    { heading: "Cadence not recorded", items: confessions },
  ];

  const flat: Array<{ heading: string | null; entry: CalEntry }> = [];
  for (const group of ordered) {
    for (const entry of group.items) flat.push({ heading: group.heading, entry });
    if (flat.length >= MAX_ROWS) break;
  }

  if (failed) {
    return <p className="text-xs italic text-amber-400">analyses unavailable - fetch failed</p>;
  }
  if (rows.length === 0) {
    return <p className="text-xs italic text-slate-500">no routes configured on this site</p>;
  }
  if (flat.length === 0) {
    return <p className="text-xs italic text-slate-500">no due dates within the next 90 days and no confessions on file</p>;
  }

  const shown = flat.slice(0, MAX_ROWS);
  const overflow = flat.length - shown.length;
  let lastHeading: string | null | undefined;

  return (
    <div className="space-y-2">
      {shown.map(({ heading, entry }) => {
        const showHeading = heading !== lastHeading;
        lastHeading = heading;
        return (
          <React.Fragment key={entry.key}>
            {showHeading && heading && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 pt-1">{heading}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
              <span className="text-xs font-semibold text-white min-w-0 truncate">{entry.routeName}</span>
              <span className="text-[11px] text-slate-400">{entry.modalityLabel}</span>
              {entry.confession ? (
                <span className="text-[11px] italic text-slate-500">{entry.confession}</span>
              ) : (
                <span className="text-[11px] font-mono text-slate-300">due {dayLabel(entry.due ? entry.due.toISOString() : null)}</span>
              )}
              {entry.overdue && (
                <span className="text-[11px] text-amber-400">overdue — {OVERDUE_LABEL}</span>
              )}
            </div>
          </React.Fragment>
        );
      })}
      {overflow > 0 && (
        <p className="text-[11px] text-slate-500">+{overflow} more not shown</p>
      )}
    </div>
  );
}

export default function RouteCadenceSection({ variant }: RouteCadenceSectionProps) {
  const [analyses, setAnalyses] = useState<SavedAnalysisResult[]>([]);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchAnalysisResults({ limit: 500 })
      .then((rows) => {
        if (!cancelled) setAnalyses(rows);
      })
      .catch(() => {
        if (!cancelled) setFetchFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const routes = useMemo(() => getEquipmentData(), []);
  const rows = useMemo(() => buildRows(routes, analyses), [routes, analyses]);

  return (
    <section className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock className="h-4 w-4 text-cyan-400 shrink-0" />
        <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
          Route Cadence
        </h2>
        <span className="text-[10px] text-slate-500 ml-auto">
          {variant === "planner" ? "bucket grid" : "upcoming due · 90 days"}
        </span>
      </div>
      {loading ? (
        <p className="text-xs italic text-slate-500">loading collection history…</p>
      ) : fetchFailed ? (
        <p className="text-xs italic text-amber-400">analyses unavailable - fetch failed</p>
      ) : variant === "planner" ? (
        <PlannerGrid rows={rows} />
      ) : (
        <CalendarList rows={rows} failed={fetchFailed} />
      )}
      <Footer />
    </section>
  );
}
