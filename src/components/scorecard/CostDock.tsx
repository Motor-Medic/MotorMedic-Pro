import React, { useState, useEffect, useRef } from "react";
import CostSuggestionCard, { estimateFromImageFile, type Suggestion } from "./CostSuggestionCard";

export const COST_MODEL_KEY = "spectra_cost_model_v1";
export const COST_MODEL_EVENT = "costModelChanged";

export interface CostModelValue {
  value: number;
  source: "manual";
  enteredBy: string;
  enteredAt: string;
  adoptedFrom?: string;
}

export interface CostModel {
  downtimeCostPerHour: CostModelValue | null;
  replacementCost: CostModelValue | null;
  laborRate: CostModelValue | null;
}

export function loadCostModel(): CostModel {
  try {
    const raw = localStorage.getItem(COST_MODEL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { downtimeCostPerHour: null, replacementCost: null, laborRate: null };
}

function saveCostModel(model: CostModel): void {
  localStorage.setItem(COST_MODEL_KEY, JSON.stringify(model));
  window.dispatchEvent(new CustomEvent(COST_MODEL_EVENT, { detail: model }));
}

interface CostDockProps {
  onChange: (model: CostModel) => void;
}

export default function CostDock({ onChange }: CostDockProps) {
  const [model, setModel] = useState<CostModel>(loadCostModel);
  const [downtime, setDowntime] = useState(model.downtimeCostPerHour?.value?.toString() ?? "");
  const [replacement, setReplacement] = useState(model.replacementCost?.value?.toString() ?? "");
  const [labor, setLabor] = useState(model.laborRate?.value?.toString() ?? "");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    saveCostModel(model);
    onChange(model);
  }, [model]);

  const commit = (field: keyof CostModel, raw: string, setter: (v: string) => void) => {
    setter(raw);
    const num = parseFloat(raw);
    const entry: CostModelValue = {
      value: isNaN(num) ? 0 : num,
      source: "manual",
      enteredBy: "user",
      enteredAt: new Date().toISOString(),
    };
    setModel((prev) => ({ ...prev, [field]: raw === "" ? null : entry }));
  };

  const asOf = model.downtimeCostPerHour?.enteredAt
    ?? model.replacementCost?.enteredAt
    ?? model.laborRate?.enteredAt;

  const onImagePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const s = await estimateFromImageFile(file);
    if (s) {
      setUnavailable(false);
      setSuggestion(s);
    } else {
      setSuggestion(null);
      setUnavailable(true);
    }
  };

  const adoptSuggestion = (value: number) => {
    if (!suggestion) return;
    setReplacement(value.toString());
    const entry: CostModelValue = {
      value,
      source: "manual",
      enteredBy: "user",
      enteredAt: new Date().toISOString(),
      adoptedFrom: "vision-suggestion",
    };
    setModel((prev) => ({ ...prev, replacementCost: entry }));
    setSuggestion(null);
    setUnavailable(false);
  };

  const dismissSuggestion = () => {
    setSuggestion(null);
    setUnavailable(false);
  };

  return (
    <div className="border border-slate-700 rounded-xl p-4 bg-slate-900/40 space-y-3">
      <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Site Cost Model</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-slate-400 uppercase">Downtime $/hr</span>
          <input
            type="number"
            value={downtime}
            onChange={(e) => commit("downtimeCostPerHour", e.target.value, setDowntime)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            placeholder="e.g. 500"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-slate-400 uppercase">Replacement $</span>
          <input
            type="number"
            value={replacement}
            onChange={(e) => commit("replacementCost", e.target.value, setReplacement)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            placeholder="e.g. 25000"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-slate-400 uppercase">Labor $/hr</span>
          <input
            type="number"
            value={labor}
            onChange={(e) => commit("laborRate", e.target.value, setLabor)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            placeholder="e.g. 85"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
        >
          Attach equipment photo (vision prefill)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onImagePicked}
        />
      </div>
      {unavailable && !suggestion && (
        <p className="text-[11px] italic text-amber-400">
          vision prefill unavailable - manual entry remains the only source
        </p>
      )}
      {suggestion && (
        <CostSuggestionCard
          suggestion={suggestion}
          onAdopt={adoptSuggestion}
          onDismiss={dismissSuggestion}
        />
      )}
      {asOf && (
        <p className="text-[10px] text-slate-500">cost model as of {new Date(asOf).toLocaleString()}</p>
      )}
    </div>
  );
}
