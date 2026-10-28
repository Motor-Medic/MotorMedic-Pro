import { useCallback, useEffect, useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";
import { navigateToTab } from "../navigation";
import { can } from "../lib/roles";

interface QueueItem {
  assignment_id: number | null;
  route_id: number;
  route_name: string;
  plant_id: number | null;
  plant_name: string | null;
  state: string;
  assigned_to: number | null;
  assigned_analyst_name: string | null;
  checked_out_at: string | null;
  checked_in_at: string | null;
  closed_at: string | null;
  notes: string | null;
}

interface QueuePayload {
  tenant_id: number;
  active: QueueItem[];
  awaiting_review: QueueItem[];
  closed: QueueItem[];
  unassigned: QueueItem[];
  counts: {
    active: number;
    awaiting_review: number;
    closed: number;
    unassigned: number;
  };
  empty: boolean;
}

type QueueTab = "active" | "awaiting_review" | "closed" | "unassigned";

const TABS: Array<{ key: QueueTab; label: string; empty: string }> = [
  {
    key: "active",
    label: "Active",
    empty:
      "No routes are checked out right now. Check a route out from the Unassigned tab to start a collection pass."
  },
  {
    key: "awaiting_review",
    label: "Awaiting Review",
    empty:
      "No collection passes are awaiting review. A pass appears here after an analyst checks a route back in."
  },
  {
    key: "closed",
    label: "Closed",
    empty:
      "No collection passes have been closed yet. Close an awaiting-review pass after it has been reviewed."
  },
  {
    key: "unassigned",
    label: "Unassigned",
    empty:
      "No routes are available to check out. Add a route in the Equipment DB, or close the open pass on an existing route first."
  }
];

const INPUT =
  "min-h-[36px] rounded-lg bg-slate-950 border border-slate-700 px-2.5 text-xs text-slate-100 focus:outline-none focus:border-[#FFC700]/70";

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "not recorded";
  return date.toLocaleString();
}

function routeLabel(item: QueueItem): string {
  return item.route_name || `Route #${item.route_id}`;
}

function AnalystPill({ item }: { item: QueueItem }) {
  if (item.state === "unassigned") {
    return <span className="text-slate-500">Unassigned</span>;
  }
  return (
    <span className="inline-flex items-center rounded-lg border border-[#FFC700]/40 bg-[#FFC700]/10 px-2 py-0.5 text-[10px] font-bold text-[#FFC700]">
      {item.assigned_analyst_name || "Analyst not recorded"}
    </span>
  );
}

export default function WorkQueue({
  user
}: {
  user?: { role?: unknown } | null;
} = {}) {
  const mayCheckout = can(user, "route.checkout");
  const mayCheckIn = can(user, "route.checkin");
  const [queue, setQueue] = useState<QueuePayload | null>(null);
  const [tab, setTab] = useState<QueueTab>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkInTarget, setCheckInTarget] = useState<QueueItem | null>(null);
  const [notes, setNotes] = useState("");
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/route-queue");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Failed to load the work queue (HTTP ${res.status})`);
      }
      setQueue(data?.queue ?? null);
    } catch (err) {
      setQueue(null);
      setError(err instanceof Error ? err.message : "Failed to load the work queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const checkout = async (item: QueueItem) => {
    if (!window.confirm(`Check out "${routeLabel(item)}"? This assigns the collection pass to you.`)) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/routes/${item.route_id}/checkout`, {
        method: "POST"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to check out the route.");
      setTab("active");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check out the route.");
    } finally {
      setBusy(false);
    }
  };

  const closeAssignment = async (item: QueueItem) => {
    if (!item.assignment_id) return;
    if (!window.confirm(`Close the collection pass for "${routeLabel(item)}"? This is final for this pass.`)) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/route-assignments/${item.assignment_id}/close`, {
        method: "POST"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to close the route assignment.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close the route assignment.");
    } finally {
      setBusy(false);
    }
  };

  const submitCheckIn = async () => {
    if (!checkInTarget?.assignment_id) return;
    setBusy(true);
    setActionError("");
    try {
      const res = await fetch(
        `/api/route-assignments/${checkInTarget.assignment_id}/check-in`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes })
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to check in the route.");
      setCheckInTarget(null);
      setNotes("");
      setTab("awaiting_review");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to check in the route.");
    } finally {
      setBusy(false);
    }
  };

  const items = queue ? queue[tab] : [];
  const activeTab = TABS.find((entry) => entry.key === tab) ?? TABS[0];

  return (
    <div className="w-full min-h-full px-2 sm:px-4 py-4 md:px-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Field collection execution
          </p>
          <h2 className="text-xl font-bold text-white inline-flex items-center gap-2 mt-0.5">
            <ClipboardList className="h-5 w-5 text-[#FFC700]" />
            Work Queue
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            One analyst holds a route at a time. Check in with notes, then close
            the pass after review.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busy}
          className="min-h-[36px] px-3 rounded-xl border border-[#FFC700]/45 bg-[#FFC700]/10 text-[#FFC700] text-xs font-bold cursor-pointer hover:bg-[#FFC700]/20 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-300">Could not complete that action.</p>
          <p className="text-xs text-amber-200/80 mt-1">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 border-b border-slate-800 pb-2">
        {TABS.map((entry) => {
          const count = queue?.counts?.[entry.key] ?? 0;
          const selected = tab === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              className={`min-h-[34px] px-3 rounded-lg border text-xs font-bold transition-colors ${
                selected
                  ? "border-[#FFC700] bg-[#FFC700] text-slate-950"
                  : "border-slate-800 bg-slate-950/50 text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              {entry.label}
              <span className={selected ? "ml-1.5 text-slate-800" : "ml-1.5 text-slate-500"}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-8 text-center text-sm text-slate-400">
          Loading the work queue...
        </div>
      ) : !queue ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-8 text-center">
          <p className="text-sm font-semibold text-slate-300">The work queue is unavailable.</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 min-h-[36px] px-3 rounded-xl border border-[#FFC700]/45 bg-[#FFC700]/10 text-[#FFC700] text-xs font-bold hover:bg-[#FFC700]/20 transition-colors"
          >
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-10 text-center">
          <ClipboardList className="h-8 w-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">{activeTab.empty}</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            This tab only shows routes owned by the signed-in tenant.
          </p>
        </div>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/50">
          <table className="w-full text-left text-xs min-w-[980px]">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                {[
                  "Route / Lineage",
                  "Assigned Analyst",
                  "Checked Out",
                  "Checked In",
                  "Closed",
                  "Notes",
                  "Action"
                ].map((column) => (
                  <th
                    key={column}
                    className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#FFC700]/90 whitespace-nowrap"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={`${tab}-${item.assignment_id ?? item.route_id}`}
                  className="border-b border-slate-800/80 last:border-b-0 hover:bg-slate-900/50"
                >
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => navigateToTab("assets")}
                      title="Open the Equipment DB for this route"
                      className="text-left text-[#FFC700] hover:underline font-medium cursor-pointer"
                    >
                      {routeLabel(item)}
                    </button>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {item.plant_name || "Plant not recorded"}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <AnalystPill item={item} />
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                    {formatTimestamp(item.checked_out_at)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                    {formatTimestamp(item.checked_in_at)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                    {formatTimestamp(item.closed_at)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 max-w-[260px]">
                    {item.notes ? (
                      <span className="line-clamp-2">{item.notes}</span>
                    ) : (
                      <span className="text-slate-500">No notes</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {tab === "unassigned" ? (
                      mayCheckout ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void checkout(item)}
                          className="min-h-[32px] px-3 rounded-lg border border-[#FFC700]/45 bg-[#FFC700]/10 text-[#FFC700] text-[11px] font-bold hover:bg-[#FFC700]/20 transition-colors disabled:opacity-50"
                        >
                          Check out
                        </button>
                      ) : (
                        <span className="text-slate-500">View only</span>
                      )
                    ) : tab === "active" ? (
                      mayCheckIn ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setCheckInTarget(item);
                            setNotes("");
                            setActionError("");
                          }}
                          className="min-h-[32px] px-3 rounded-lg border border-[#FFC700]/45 bg-[#FFC700]/10 text-[#FFC700] text-[11px] font-bold hover:bg-[#FFC700]/20 transition-colors disabled:opacity-50"
                        >
                          Check in
                        </button>
                      ) : (
                        <span className="text-slate-500">View only</span>
                      )
                    ) : tab === "awaiting_review" ? (
                      mayCheckIn ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void closeAssignment(item)}
                          className="min-h-[32px] px-3 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 text-[11px] font-bold hover:border-[#FFC700]/50 hover:text-[#FFC700] transition-colors disabled:opacity-50"
                        >
                          Close
                        </button>
                      ) : (
                        <span className="text-slate-500">View only</span>
                      )
                    ) : (
                      <span className="text-slate-500">Closed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-[10px] text-slate-500 italic">
        A checked-out route is locked to one analyst by a database unique index.
        Check-in records the timestamp and notes; close is allowed only after
        check-in. The tenant always comes from the signed-in session.
      </p>

      {checkInTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#0c1220] p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-white">
              Check in {routeLabel(checkInTarget)}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              This records the check-in timestamp and moves the pass to Awaiting Review.
            </p>
            <label className="block mt-4 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Notes for this collection pass
              </span>
              <textarea
                className={`${INPUT} w-full min-h-[100px] py-2`}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="What was collected, skipped, or needs follow-up?"
              />
            </label>
            {actionError && (
              <p className="text-xs text-amber-300 mt-2">{actionError}</p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setCheckInTarget(null);
                  setActionError("");
                }}
                className="min-h-[36px] px-3 rounded-xl border border-slate-700 text-slate-300 text-xs font-bold hover:bg-slate-900 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void submitCheckIn()}
                className="min-h-[36px] px-4 rounded-xl bg-[#FFC700] text-slate-950 text-xs font-bold hover:bg-[#e6b400] transition-colors disabled:opacity-50"
              >
                {busy ? "Checking in..." : "Confirm check-in"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
