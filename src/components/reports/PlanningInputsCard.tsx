import React, { useState, useEffect } from "react";
import { Save, Check } from "lucide-react";

interface PlanningInputs { leadTimeDays: number | null; nextShutdownDate: string | null; downtimeCostPerDay: number | null; }

interface Props {
  assetId: string;
  planningInputs: PlanningInputs | null;
  onSave: (inputs: PlanningInputs) => void;
}

export function PlanningInputsCard({ assetId, planningInputs, onSave }: Props) {
  const [draft, setDraft] = useState<PlanningInputs>({ leadTimeDays: null, nextShutdownDate: null, downtimeCostPerDay: null });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => { setDraft(planningInputs ?? { leadTimeDays: null, nextShutdownDate: null, downtimeCostPerDay: null }); }, [planningInputs]);
  const isDirty = planningInputs?.leadTimeDays !== draft.leadTimeDays || planningInputs?.nextShutdownDate !== draft.nextShutdownDate || planningInputs?.downtimeCostPerDay !== draft.downtimeCostPerDay;
  const save = async () => {
    setSaving(true); setSaved(false); setSaveError(false);
    try {
      const res = await fetch(`/api/assets/${assetId}/planning-config`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      onSave(draft); setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch { setSaveError(true); } finally { setSaving(false); }
  };
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4 space-y-2">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Planning Inputs (asset-level)</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div><label className="text-[10px] text-slate-500 block mb-0.5">Lead time (days)</label>
          <input type="number" min={0} value={draft.leadTimeDays ?? ""} onChange={(e) => setDraft({ ...draft, leadTimeDays: e.target.value ? Number(e.target.value) : null })} className="h-7 w-20 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-400/60" /></div>
        <div><label className="text-[10px] text-slate-500 block mb-0.5">Next shutdown</label>
          <input type="date" value={draft.nextShutdownDate ?? ""} onChange={(e) => setDraft({ ...draft, nextShutdownDate: e.target.value || null })} className="h-7 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-400/60" /></div>
        <div><label className="text-[10px] text-slate-500 block mb-0.5">Downtime cost ($/day)</label>
          <input type="number" min={0} value={draft.downtimeCostPerDay ?? ""} onChange={(e) => setDraft({ ...draft, downtimeCostPerDay: e.target.value ? Number(e.target.value) : null })} className="h-7 w-24 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-400/60" /></div>
        <button onClick={save} disabled={saving} className="h-7 px-3 rounded bg-amber-600 hover:bg-amber-500 text-[11px] font-semibold text-white flex items-center gap-1 disabled:opacity-50 cursor-pointer">
          <Save className="h-3 w-3" />{saving ? "Saving…" : "Save"}
        </button>
        {isDirty && !saving && !saved && <span className="text-[11px] text-amber-400 font-medium">unsaved changes</span>}
        {saved && <span className="text-[11px] text-emerald-400 flex items-center gap-1"><Check className="h-3 w-3" />saved</span>}
        {saveError && <span className="text-[11px] text-red-400 font-medium">Save failed</span>}
      </div>
    </div>
  );
}
