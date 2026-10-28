import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Loader2,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2
} from "lucide-react";
import LogGoodCatchModal from "./LogGoodCatchModal";
import {
  formatCents,
  type GoodCatchRow
} from "../../lib/goodCatches";
import { canCurrent } from "../../lib/roles";

interface GoodCatchSummaryPayload {
  tenant_id: number;
  catch_count: number;
  total_avoided_cost_cents: number;
  total_downtime_hours_avoided: number;
  safety_catch_count: number;
  empty: boolean;
}

interface GoodCatchListResponse {
  success: boolean;
  catches: GoodCatchRow[];
  summary: GoodCatchSummaryPayload;
}

const EMPTY_SUMMARY: GoodCatchSummaryPayload = {
  tenant_id: -1,
  catch_count: 0,
  total_avoided_cost_cents: 0,
  total_downtime_hours_avoided: 0,
  safety_catch_count: 0,
  empty: true
};

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) }
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(body.error || body.message || `Request failed (${res.status})`);
  }
  return body as T;
}

function lineageLabel(row: GoodCatchRow): string {
  const parts = [
    row.plant_name,
    row.route_name,
    row.asset_tag || row.asset_name,
    row.component_name
  ].filter((part): part is string => !!part && String(part).trim() !== "");
  return parts.length ? parts.join(" / ") : "No lineage linked";
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(rows: GoodCatchRow[]): string {
  const header = [
    "Catch date",
    "Title",
    "Description",
    "Plant",
    "Route",
    "Asset",
    "Asset tag",
    "Component",
    "Work order id",
    "Work order status",
    "Alert id",
    "Avoided cost (USD)",
    "Avoided cost (cents)",
    "Downtime hours avoided",
    "Safety hazard",
    "Safety note",
    "Created at"
  ];
  const lines = rows.map((row) =>
    [
      row.catch_date != null ? String(row.catch_date).slice(0, 10) : "",
      row.title,
      row.description ?? "",
      row.plant_name ?? "",
      row.route_name ?? "",
      row.asset_name ?? "",
      row.asset_tag ?? "",
      row.component_name ?? "",
      row.work_order_id ?? "",
      row.work_order_status ?? "",
      row.alert_id ?? "",
      formatCents(Number(row.avoided_cost_cents ?? 0)),
      String(Math.max(0, Math.trunc(Number(row.avoided_cost_cents ?? 0)))),
      String(row.downtime_hours_avoided ?? 0),
      row.safety_hazard === true ? "yes" : "no",
      row.safety_note ?? "",
      row.created_at != null ? String(row.created_at) : ""
    ]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...lines].join("\r\n");
}

export default function GoodCatchesSection({
  selectedCompanyId
}: {
  selectedCompanyId: number;
}) {
  const [catches, setCatches] = useState<GoodCatchRow[]>([]);
  const [summary, setSummary] = useState<GoodCatchSummaryPayload>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<GoodCatchRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await apiJson<GoodCatchListResponse>("/api/good-catches");
      setCatches(payload.catches ?? []);
      setSummary(payload.summary ?? EMPTY_SUMMARY);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load good catches."
      );
      setCatches([]);
      setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, selectedCompanyId]);

  const createCatch = async (body: Record<string, unknown>) => {
    await apiJson("/api/good-catches", {
      method: "POST",
      body: JSON.stringify(body)
    });
    setModalOpen(false);
    await load();
  };

  const updateCatch = async (body: Record<string, unknown>) => {
    if (!editing) return;
    await apiJson(`/api/good-catches/${editing.id}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
    setModalOpen(false);
    setEditing(null);
    await load();
  };

  const deleteCatch = async (row: GoodCatchRow) => {
    if (!window.confirm(`Delete good catch "${row.title}"?`)) return;
    setError("");
    try {
      await apiJson(`/api/good-catches/${row.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete good catch."
      );
    }
  };

  const exportCsv = () => {
    if (catches.length === 0) return;
    const blob = new Blob([buildCsv(catches)], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `good-catches-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const hasRows = useMemo(() => catches.length > 0, [catches.length]);
  // ROLES-1 UI mirror only; the server still 403s a hidden tool request.
  const mayWrite = canCurrent("goodcatch.write");
  const mayExport = canCurrent("reports.export");

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-white">Good-catch value</h3>
          <p className="text-[10px] text-slate-500 mt-1 max-w-2xl">
            Additive block - shown separately from the S1 open-fault risk index
            and the dashboard ROI calculation. Nothing here is silently folded
            into an existing ROI number.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mayExport && (
            <button
              type="button"
              onClick={exportCsv}
              disabled={!hasRows}
              className="min-h-[36px] px-3 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-300 text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer hover:border-slate-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          )}
          {mayWrite && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              className="min-h-[36px] px-3 rounded-xl bg-[#FFC700] hover:bg-[#e6b400] text-slate-950 text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-lg shadow-[#FFC700]/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Log good catch
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 font-medium bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <p className="text-[10px] text-slate-400 uppercase">Avoided cost</p>
          <p className="text-lg font-bold text-yellow-400">
            {formatCents(summary.total_avoided_cost_cents)}
          </p>
          <p className="text-[10px] text-slate-500">integer cents summed</p>
        </div>
        <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
          <p className="text-[10px] text-slate-400 uppercase">Downtime avoided</p>
          <p className="text-lg font-bold text-white">
            {summary.total_downtime_hours_avoided}
          </p>
          <p className="text-[10px] text-slate-500">hours</p>
        </div>
        <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
          <p className="text-[10px] text-slate-400 uppercase">Safety catches</p>
          <p className="text-lg font-bold text-white">
            {summary.safety_catch_count}
          </p>
          <p className="text-[10px] text-slate-500">hazards removed</p>
        </div>
        <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
          <p className="text-[10px] text-slate-400 uppercase">Catches logged</p>
          <p className="text-lg font-bold text-white">{summary.catch_count}</p>
          <p className="text-[10px] text-slate-500">before failure</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading good catches...
        </div>
      ) : !hasRows ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 px-4 py-8 text-center">
          <ShieldAlert className="h-6 w-6 text-[#FFC700]/60 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-300">
            No good catches logged for this site yet.
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Record one when a defect is found before it becomes a functional
            failure. The avoided value appears here as an additive ROI block.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700/60">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-[10px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 font-bold">Catch</th>
                <th className="px-3 py-2 font-bold">Lineage</th>
                <th className="px-3 py-2 font-bold">Linked WO</th>
                <th className="px-3 py-2 font-bold text-right">Avoided cost</th>
                <th className="px-3 py-2 font-bold text-right">Downtime</th>
                <th className="px-3 py-2 font-bold">Safety</th>
                <th className="px-3 py-2 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {catches.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-slate-800 hover:bg-slate-800/30"
                >
                  <td className="px-3 py-2.5 min-w-[220px]">
                    <p className="text-white font-semibold">{row.title}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {row.catch_date != null
                        ? new Date(String(row.catch_date)).toLocaleDateString()
                        : "No date"}
                      {row.description ? ` - ${row.description}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 min-w-[180px]">
                    {lineageLabel(row)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {row.work_order_id != null ? (
                      <span>
                        #{row.work_order_id}
                        {row.work_order_status ? (
                          <span className="text-[10px] text-slate-500">
                            {" "}
                            ({row.work_order_status})
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-yellow-400">
                    {formatCents(Number(row.avoided_cost_cents ?? 0))}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-300">
                    {row.downtime_hours_avoided ?? 0}h
                  </td>
                  <td className="px-3 py-2.5">
                    {row.safety_hazard ? (
                      <span className="text-[10px] font-bold text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded px-1.5 py-0.5">
                        Safety
                      </span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {mayWrite ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(row);
                            setModalOpen(true);
                          }}
                          className="h-7 w-7 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/60 cursor-pointer transition-colors"
                          aria-label={`Edit ${row.title}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteCatch(row)}
                          className="h-7 w-7 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
                          aria-label={`Delete ${row.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className="text-slate-600 text-[10px]">View only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <LogGoodCatchModal
          initial={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSave={editing ? updateCatch : createCatch}
        />
      )}
    </section>
  );
}
