import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  DollarSign,
  Factory,
  FileText,
  Layers,
  Loader2,
  ShieldCheck,
  Tag,
  Wrench,
  X
} from "lucide-react";
import {
  dollarsInputToCents,
  formatCents,
  type GoodCatchRow
} from "../../lib/goodCatches";

const INPUT_BASE =
  "w-full min-h-[44px] rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder:text-slate-500 transition-colors focus:outline-none focus:border-[#FFC700]";

interface HierarchyPayload {
  plants?: Array<{ id: number; name: string }>;
  routes?: Array<{ id: number; plant_id: number; name: string }>;
  assets?: Array<{
    id: number;
    route_id: number | null;
    name: string;
    tag_number?: string | null;
  }>;
  components?: Array<{ id: number; asset_id: number; name: string }>;
}

interface GoodCatchDraft {
  title: string;
  description: string;
  catch_date: string;
  avoided_cost_cents: number;
  downtime_hours_avoided: number;
  safety_hazard: boolean;
  safety_note: string;
  plant_id: number | null;
  route_id: number | null;
  asset_id: number | null;
  component_id: number | null;
  alert_id: string;
  work_order_id: number | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function centsToInput(cents: number | string | null | undefined): string {
  if (cents == null) return "";
  const safe = Math.max(0, Math.trunc(Number(cents)));
  const dollars = Math.floor(safe / 100);
  const remainder = safe % 100;
  return `${dollars}.${String(remainder).padStart(2, "0")}`;
}

function draftFrom(initial?: GoodCatchRow | null): GoodCatchDraft {
  return {
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    catch_date:
      initial?.catch_date != null
        ? String(initial.catch_date).slice(0, 10)
        : todayIso(),
    avoided_cost_cents: Number(initial?.avoided_cost_cents ?? 0) || 0,
    downtime_hours_avoided: Number(initial?.downtime_hours_avoided ?? 0) || 0,
    safety_hazard: initial?.safety_hazard === true,
    safety_note: initial?.safety_note ?? "",
    plant_id: initial?.plant_id ?? null,
    route_id: initial?.route_id ?? null,
    asset_id: initial?.asset_id ?? null,
    component_id: initial?.component_id ?? null,
    alert_id: initial?.alert_id ? String(initial.alert_id) : "",
    work_order_id: initial?.work_order_id ?? null
  };
}

function FieldLabel({
  label,
  required
}: {
  label: string;
  required?: boolean;
}) {
  return (
    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
      {label}
      {required && <span className="text-[#FFC700] ml-0.5">*</span>}
    </span>
  );
}

export default function LogGoodCatchModal({
  initial,
  onClose,
  onSave
}: {
  initial?: GoodCatchRow | null;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const isEdit = !!initial;
  const [draft, setDraft] = useState<GoodCatchDraft>(() => draftFrom(initial));
  const [hierarchy, setHierarchy] = useState<HierarchyPayload>({});
  const [costInput, setCostInput] = useState(() =>
    centsToInput(initial?.avoided_cost_cents)
  );
  const [hoursInput, setHoursInput] = useState(() =>
    initial?.downtime_hours_avoided != null
      ? String(initial.downtime_hours_avoided)
      : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/hierarchy", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: HierarchyPayload | null) => {
        if (!cancelled && payload) setHierarchy(payload);
      })
      .catch(() => {
        // Lineage is optional; the modal still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const routes = useMemo(() => {
    const all = hierarchy.routes ?? [];
    if (draft.plant_id == null) return all;
    return all.filter((route) => Number(route.plant_id) === draft.plant_id);
  }, [hierarchy.routes, draft.plant_id]);

  const assets = useMemo(() => {
    const all = hierarchy.assets ?? [];
    if (draft.route_id == null) return all;
    return all.filter((asset) => Number(asset.route_id) === draft.route_id);
  }, [hierarchy.assets, draft.route_id]);

  const components = useMemo(() => {
    const all = hierarchy.components ?? [];
    if (draft.asset_id == null) return all;
    return all.filter((component) => Number(component.asset_id) === draft.asset_id);
  }, [hierarchy.components, draft.asset_id]);

  const setField = <K extends keyof GoodCatchDraft>(
    key: K,
    value: GoodCatchDraft[K]
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError("");
  };

  const submit = async () => {
    if (!draft.title.trim()) {
      setError("Title is required.");
      return;
    }
    const cents = dollarsInputToCents(costInput);
    if (cents == null) {
      setError("Avoided cost must be a dollar amount (up to two decimals).");
      return;
    }
    const hours = hoursInput.trim() === "" ? 0 : Number(hoursInput);
    if (!Number.isFinite(hours) || hours < 0) {
      setError("Downtime hours avoided must be a non-negative number.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        catch_date: draft.catch_date || todayIso(),
        avoided_cost_cents: cents,
        downtime_hours_avoided: hours,
        safety_hazard: draft.safety_hazard,
        safety_note: draft.safety_note.trim() || null,
        plant_id: draft.plant_id,
        route_id: draft.route_id,
        asset_id: draft.asset_id,
        component_id: draft.component_id,
        alert_id: draft.alert_id.trim() || null,
        work_order_id: draft.work_order_id
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save good catch.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative bg-slate-900 rounded-xl shadow-2xl border border-slate-700 w-full max-w-3xl max-h-[90vh] flex flex-col mx-4 overflow-hidden">
        <div className="shrink-0 flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-slate-800 bg-slate-900">
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-bold text-white tracking-tight">
              {isEdit ? (
                <>
                  Edit <span className="text-[#FFC700]">GOOD CATCH</span>
                </>
              ) : (
                <>
                  Log <span className="text-[#FFC700]">GOOD CATCH</span>
                </>
              )}
            </h2>
            <p className="text-xs text-slate-400">
              A defect found before functional failure - recorded value is additive
              to the ROI page, never folded into an existing ROI number.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-700/60 cursor-pointer shrink-0 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
          {error && (
            <p className="text-xs text-red-400 font-medium bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div>
            <FieldLabel label="Title" required />
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
              <input
                className={`${INPUT_BASE} pl-10 pr-3`}
                value={draft.title}
                onChange={(event) => setField("title", event.target.value)}
                placeholder="e.g., Cracked coupling spider caught during route walkdown"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Catch Date" required />
              <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                <input
                  type="date"
                  className={`${INPUT_BASE} pl-10 pr-3`}
                  value={draft.catch_date}
                  onChange={(event) => setField("catch_date", event.target.value)}
                />
              </div>
            </div>
            <div>
              <FieldLabel label="Avoided Cost (USD)" />
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                <input
                  inputMode="decimal"
                  className={`${INPUT_BASE} pl-10 pr-3`}
                  value={costInput}
                  onChange={(event) => {
                    setCostInput(event.target.value);
                    setError("");
                  }}
                  placeholder="e.g., 12500.00"
                />
              </div>
              <p className="mt-1.5 text-[10px] text-slate-500">
                Stored as integer cents
                {costInput.trim() !== "" && dollarsInputToCents(costInput) != null
                  ? ` - ${formatCents(dollarsInputToCents(costInput) ?? 0)}`
                  : ""}
              </p>
            </div>
            <div>
              <FieldLabel label="Downtime Hours Avoided" />
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                <input
                  inputMode="decimal"
                  className={`${INPUT_BASE} pl-10 pr-3`}
                  value={hoursInput}
                  onChange={(event) => {
                    setHoursInput(event.target.value);
                    setError("");
                  }}
                  placeholder="e.g., 8"
                />
              </div>
            </div>
            <div>
              <FieldLabel label="Linked Work Order ID" />
              <div className="relative">
                <Wrench className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                <input
                  inputMode="numeric"
                  className={`${INPUT_BASE} pl-10 pr-3`}
                  value={draft.work_order_id ?? ""}
                  onChange={(event) =>
                    setField(
                      "work_order_id",
                      event.target.value.trim() === ""
                        ? null
                        : Number(event.target.value)
                    )
                  }
                  placeholder="Optional - must belong to this site"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/50 bg-slate-950/40 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-slate-500" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300">
                Lineage (optional)
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Plant" />
                <div className="relative">
                  <Factory className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                  <select
                    className={`${INPUT_BASE} pl-10 pr-3 appearance-none cursor-pointer`}
                    value={draft.plant_id ?? ""}
                    onChange={(event) => {
                      const value =
                        event.target.value === "" ? null : Number(event.target.value);
                      setDraft((prev) => ({
                        ...prev,
                        plant_id: value,
                        route_id: null,
                        asset_id: null,
                        component_id: null
                      }));
                      setError("");
                    }}
                  >
                    <option value="">Select plant</option>
                    {(hierarchy.plants ?? []).map((plant) => (
                      <option key={plant.id} value={plant.id}>
                        {plant.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <FieldLabel label="Route" />
                <div className="relative">
                  <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                  <select
                    className={`${INPUT_BASE} pl-10 pr-3 appearance-none cursor-pointer`}
                    value={draft.route_id ?? ""}
                    onChange={(event) => {
                      const value =
                        event.target.value === "" ? null : Number(event.target.value);
                      setDraft((prev) => ({
                        ...prev,
                        route_id: value,
                        asset_id: null,
                        component_id: null
                      }));
                      setError("");
                    }}
                  >
                    <option value="">Select route</option>
                    {routes.map((route) => (
                      <option key={route.id} value={route.id}>
                        {route.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <FieldLabel label="Asset" />
                <div className="relative">
                  <Factory className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                  <select
                    className={`${INPUT_BASE} pl-10 pr-3 appearance-none cursor-pointer`}
                    value={draft.asset_id ?? ""}
                    onChange={(event) => {
                      const value =
                        event.target.value === "" ? null : Number(event.target.value);
                      setDraft((prev) => ({
                        ...prev,
                        asset_id: value,
                        component_id: null
                      }));
                      setError("");
                    }}
                  >
                    <option value="">Select asset</option>
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.tag_number
                          ? `${asset.name} (${asset.tag_number})`
                          : asset.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <FieldLabel label="Component" />
                <div className="relative">
                  <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                  <select
                    className={`${INPUT_BASE} pl-10 pr-3 appearance-none cursor-pointer`}
                    value={draft.component_id ?? ""}
                    onChange={(event) =>
                      setField(
                        "component_id",
                        event.target.value === ""
                          ? null
                          : Number(event.target.value)
                      )
                    }
                  >
                    <option value="">Select component</option>
                    {components.map((component) => (
                      <option key={component.id} value={component.id}>
                        {component.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div>
            <FieldLabel label="Linked Alert ID" />
            <div className="relative">
              <AlertTriangle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
              <input
                className={`${INPUT_BASE} pl-10 pr-3`}
                value={draft.alert_id}
                onChange={(event) => setField("alert_id", event.target.value)}
                placeholder="Optional - must belong to this site"
              />
            </div>
          </div>

          <div>
            <FieldLabel label="Description" />
            <div className="relative">
              <FileText className="absolute left-3 top-3 h-4 w-4 text-slate-500 pointer-events-none" />
              <textarea
                className={`${INPUT_BASE} pl-10 pr-3 py-3 min-h-[88px] resize-y`}
                value={draft.description}
                onChange={(event) => setField("description", event.target.value)}
                placeholder="What was found before failure, and what was done about it?"
              />
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draft.safety_hazard}
                onChange={(event) =>
                  setField("safety_hazard", event.target.checked)
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-[#FFC700] focus:ring-[#FFC700] cursor-pointer"
              />
              <span className="text-xs text-slate-300 leading-snug">
                <span className="font-semibold text-amber-300">Safety hazard</span>{" "}
                - this catch also removed a safety exposure.
              </span>
            </label>
            {draft.safety_hazard && (
              <div>
                <FieldLabel label="Safety Note" />
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-400/70 pointer-events-none" />
                  <input
                    className={`${INPUT_BASE} pl-10 pr-3`}
                    value={draft.safety_note}
                    onChange={(event) =>
                      setField("safety_note", event.target.value)
                    }
                    placeholder="Describe the safety exposure that was avoided"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 shrink-0 bg-slate-900 border-t border-slate-800 p-4 flex justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-[42px] px-4 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-300 text-xs font-bold cursor-pointer hover:border-slate-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="min-h-[42px] px-4 rounded-xl bg-[#FFC700] hover:bg-[#e6b400] text-slate-950 text-xs font-bold cursor-pointer transition-colors shadow-lg shadow-[#FFC700]/20 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : isEdit ? (
              "Save Changes"
            ) : (
              "Save Good Catch"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
