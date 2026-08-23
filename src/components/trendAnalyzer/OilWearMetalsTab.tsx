/**
 * Wear Metals & Debris — vision auto-extract, editable form fields, sample history.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  calculateBaselineDelta,
  calculateWearRate,
  getThresholdStatus,
  interpretWearPattern
} from "../../lib/oilAnalysisMetrics";
import {
  DEFAULT_ALARM_LIMITS,
  type OilSample,
  type ThresholdStatus
} from "../../types/oilAnalysis";
import type { OilReportData } from "../../types/oilVision";
import OilCsvUploader from "./OilCsvUploader";
import OilVisionDropzone from "./OilVisionDropzone";

const OIL_ANALYSIS_API_PATH = "/api/oil-analysis";
const CARD = "bg-slate-900/50 border border-white/10 rounded-xl p-6";
const INPUT =
  "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none font-mono";
const LABEL =
  "text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block";

export interface OilWearMetalsTabProps {
  assetId: string;
}

type OilFormState = {
  header: {
    labName: string;
    reportNumber: string;
    sampleDate: string;
    receivedDate: string;
    assetId: string;
    assetDescription: string;
    component: string;
    lubricantBrand: string;
    lubricantGrade: string;
    samplePoint: string;
  };
  metals: {
    iron: string;
    copper: string;
    chromium: string;
    lead: string;
    aluminum: string;
    silicon: string;
    tin: string;
    nickel: string;
    molybdenum: string;
    magnesium: string;
    calcium: string;
    zinc: string;
    sodium: string;
    potassium: string;
    boron: string;
    silver: string;
    titanium: string;
    vanadium: string;
  };
  fluid: {
    viscosity40C: string;
    viscosity100C: string;
    viscosityIndex: string;
    waterPpm: string;
    waterPercent: string;
    acidNumber: string;
    baseNumber: string;
    oxidation: string;
    nitration: string;
    sulfation: string;
    sootPercent: string;
    flashPointC: string;
    particleCountIso4406: string;
    pqIndex: string;
  };
  ops: {
    operatingHours: string;
    oilHours: string;
    milesOrKm: string;
    makeUpOilLiters: string;
    filterChanged: string;
    oilChanged: string;
  };
  formatDetected: string;
  confidenceScore: string;
  rawNotes: string;
};

const EMPTY_FORM: OilFormState = {
  header: {
    labName: "",
    reportNumber: "",
    sampleDate: "",
    receivedDate: "",
    assetId: "",
    assetDescription: "",
    component: "",
    lubricantBrand: "",
    lubricantGrade: "",
    samplePoint: ""
  },
  metals: {
    iron: "",
    copper: "",
    chromium: "",
    lead: "",
    aluminum: "",
    silicon: "",
    tin: "",
    nickel: "",
    molybdenum: "",
    magnesium: "",
    calcium: "",
    zinc: "",
    sodium: "",
    potassium: "",
    boron: "",
    silver: "",
    titanium: "",
    vanadium: ""
  },
  fluid: {
    viscosity40C: "",
    viscosity100C: "",
    viscosityIndex: "",
    waterPpm: "",
    waterPercent: "",
    acidNumber: "",
    baseNumber: "",
    oxidation: "",
    nitration: "",
    sulfation: "",
    sootPercent: "",
    flashPointC: "",
    particleCountIso4406: "",
    pqIndex: ""
  },
  ops: {
    operatingHours: "",
    oilHours: "",
    milesOrKm: "",
    makeUpOilLiters: "",
    filterChanged: "",
    oilChanged: ""
  },
  formatDetected: "",
  confidenceScore: "",
  rawNotes: ""
};

type OilSampleDbRow = {
  id?: string;
  sample_date: string;
  operating_hours: number;
  iron?: string | number | null;
  copper?: string | number | null;
  chromium?: string | number | null;
  lead?: string | number | null;
  aluminum?: string | number | null;
  silicon?: string | number | null;
  tin?: string | number | null;
  nickel?: string | number | null;
  baseline_iron?: string | number | null;
  baseline_copper?: string | number | null;
  baseline_chromium?: string | number | null;
  iron_alarm_limit?: string | number | null;
  copper_alarm_limit?: string | number | null;
  chromium_alarm_limit?: string | number | null;
  lead_alarm_limit?: string | number | null;
  aluminum_alarm_limit?: string | number | null;
  silicon_alarm_limit?: string | number | null;
};

function str(v: string | null | undefined): string {
  return v ?? "";
}

function numStr(v: number | null | undefined): string {
  return v != null && Number.isFinite(v) ? String(v) : "";
}

function boolStr(v: boolean | null | undefined): string {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "";
}

function parseNum(raw: string): number {
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function reportToForm(data: OilReportData, assetId: string): OilFormState {
  const h = data.header;
  const m = data.metals;
  const f = data.fluidProperties;
  const o = data.operatingParams;
  return {
    header: {
      labName: str(h.labName),
      reportNumber: str(h.reportNumber),
      sampleDate: str(h.sampleDate),
      receivedDate: str(h.receivedDate),
      assetId: str(h.assetId) || assetId,
      assetDescription: str(h.assetDescription),
      component: str(h.component),
      lubricantBrand: str(h.lubricantBrand),
      lubricantGrade: str(h.lubricantGrade),
      samplePoint: str(h.samplePoint)
    },
    metals: {
      iron: numStr(m.iron),
      copper: numStr(m.copper),
      chromium: numStr(m.chromium),
      lead: numStr(m.lead),
      aluminum: numStr(m.aluminum),
      silicon: numStr(m.silicon),
      tin: numStr(m.tin),
      nickel: numStr(m.nickel),
      molybdenum: numStr(m.molybdenum),
      magnesium: numStr(m.magnesium),
      calcium: numStr(m.calcium),
      zinc: numStr(m.zinc),
      sodium: numStr(m.sodium),
      potassium: numStr(m.potassium),
      boron: numStr(m.boron),
      silver: numStr(m.silver),
      titanium: numStr(m.titanium),
      vanadium: numStr(m.vanadium)
    },
    fluid: {
      viscosity40C: numStr(f.viscosity40C),
      viscosity100C: numStr(f.viscosity100C),
      viscosityIndex: numStr(f.viscosityIndex),
      waterPpm: numStr(f.waterPpm),
      waterPercent: numStr(f.waterPercent),
      acidNumber: numStr(f.acidNumber),
      baseNumber: numStr(f.baseNumber),
      oxidation: numStr(f.oxidation),
      nitration: numStr(f.nitration),
      sulfation: numStr(f.sulfation),
      sootPercent: numStr(f.sootPercent),
      flashPointC: numStr(f.flashPointC),
      particleCountIso4406: str(f.particleCountIso4406),
      pqIndex: numStr(f.pqIndex)
    },
    ops: {
      operatingHours: numStr(o.operatingHours),
      oilHours: numStr(o.oilHours),
      milesOrKm: numStr(o.milesOrKm),
      makeUpOilLiters: numStr(o.makeUpOilLiters),
      filterChanged: boolStr(o.filterChanged),
      oilChanged: boolStr(o.oilChanged)
    },
    formatDetected: data.formatDetected,
    confidenceScore: String(data.confidenceScore ?? ""),
    rawNotes: str(data.rawNotes)
  };
}

function formToPreviewSample(form: OilFormState, assetId: string): OilSample | null {
  const iron = parseNum(form.metals.iron);
  const copper = parseNum(form.metals.copper);
  const chromium = parseNum(form.metals.chromium);
  if (iron === 0 && copper === 0 && chromium === 0) return null;

  return {
    assetId,
    sampleDate: form.header.sampleDate || new Date().toISOString().slice(0, 10),
    operatingHours: parseNum(form.ops.operatingHours),
    iron,
    copper,
    chromium,
    lead: parseNum(form.metals.lead),
    aluminum: parseNum(form.metals.aluminum),
    silicon: parseNum(form.metals.silicon),
    tin: parseNum(form.metals.tin) || undefined,
    nickel: parseNum(form.metals.nickel) || undefined,
    ironAlarmLimit: DEFAULT_ALARM_LIMITS.iron,
    copperAlarmLimit: DEFAULT_ALARM_LIMITS.copper,
    chromiumAlarmLimit: DEFAULT_ALARM_LIMITS.chromium,
    leadAlarmLimit: DEFAULT_ALARM_LIMITS.lead,
    aluminumAlarmLimit: DEFAULT_ALARM_LIMITS.aluminum,
    siliconAlarmLimit: DEFAULT_ALARM_LIMITS.silicon
  };
}

function mapSample(dbRow: OilSampleDbRow, assetId: string): OilSample {
  const num = (raw: unknown, fallback = 0) => {
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    id: dbRow.id,
    assetId,
    sampleDate: dbRow.sample_date,
    operatingHours: num(dbRow.operating_hours),
    iron: num(dbRow.iron),
    copper: num(dbRow.copper),
    chromium: num(dbRow.chromium),
    lead: num(dbRow.lead),
    aluminum: num(dbRow.aluminum),
    silicon: num(dbRow.silicon),
    ironAlarmLimit: num(dbRow.iron_alarm_limit, DEFAULT_ALARM_LIMITS.iron),
    copperAlarmLimit: num(dbRow.copper_alarm_limit, DEFAULT_ALARM_LIMITS.copper),
    chromiumAlarmLimit: num(
      dbRow.chromium_alarm_limit,
      DEFAULT_ALARM_LIMITS.chromium
    ),
    leadAlarmLimit: num(dbRow.lead_alarm_limit, DEFAULT_ALARM_LIMITS.lead),
    aluminumAlarmLimit: num(
      dbRow.aluminum_alarm_limit,
      DEFAULT_ALARM_LIMITS.aluminum
    ),
    siliconAlarmLimit: num(
      dbRow.silicon_alarm_limit,
      DEFAULT_ALARM_LIMITS.silicon
    )
  };
}

function getStatusColor(status: ThresholdStatus): string {
  switch (status) {
    case "normal":
      return "text-green-400 bg-green-400/10 border-green-400/20";
    case "warning":
      return "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";
    case "critical":
      return "text-red-400 bg-red-400/10 border-red-400/20";
  }
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "—"
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col">
      <span className={LABEL}>{label}</span>
      <input
        type={type}
        step={type === "number" ? "any" : undefined}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT}
      />
    </label>
  );
}

function BoolSelect({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col">
      <span className={LABEL}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT}
      >
        <option value="">—</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}

export function OilWearMetalsTab({ assetId }: OilWearMetalsTabProps) {
  const [form, setForm] = useState<OilFormState>(EMPTY_FORM);
  const [samples, setSamples] = useState<OilSample[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const loadSamples = useCallback(async () => {
    if (!assetId) {
      setSamples([]);
      setHistoryLoading(false);
      return;
    }
    try {
      setHistoryLoading(true);
      setHistoryError(null);
      const res = await fetch(
        `${OIL_ANALYSIS_API_PATH}?assetId=${encodeURIComponent(assetId)}`
      );
      if (!res.ok) throw new Error("Failed to fetch oil analysis history");
      const data = (await res.json()) as { samples?: OilSampleDbRow[] };
      setSamples(
        (data.samples ?? []).map((row) => mapSample(row, assetId))
      );
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Unknown error");
      setSamples([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    void loadSamples();
  }, [loadSamples, refreshKey]);

  const applyExtracted = useCallback(
    (data: OilReportData) => {
      setForm(reportToForm(data, assetId));
      setSaveMsg(null);
    },
    [assetId]
  );

  const previewSample = useMemo(
    () => formToPreviewSample(form, assetId),
    [form, assetId]
  );

  const latestHistory = samples.length > 0 ? samples[samples.length - 1] : null;
  const displaySample = previewSample ?? latestHistory;

  const updateHeader = (key: keyof OilFormState["header"], value: string) => {
    setForm((prev) => ({
      ...prev,
      header: { ...prev.header, [key]: value }
    }));
  };

  const updateMetal = (key: keyof OilFormState["metals"], value: string) => {
    setForm((prev) => ({
      ...prev,
      metals: { ...prev.metals, [key]: value }
    }));
  };

  const updateFluid = (key: keyof OilFormState["fluid"], value: string) => {
    setForm((prev) => ({
      ...prev,
      fluid: { ...prev.fluid, [key]: value }
    }));
  };

  const updateOps = (key: keyof OilFormState["ops"], value: string) => {
    setForm((prev) => ({
      ...prev,
      ops: { ...prev.ops, [key]: value }
    }));
  };

  const saveCurrentSample = async () => {
    if (!assetId || !form.header.sampleDate || !form.ops.operatingHours) {
      setSaveMsg("Sample date and operating hours are required to save.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      await fetch(
        `${OIL_ANALYSIS_API_PATH}?assetId=${encodeURIComponent(assetId)}`
      );
      const res = await fetch(OIL_ANALYSIS_API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId,
          sampleDate: form.header.sampleDate,
          operatingHours: parseNum(form.ops.operatingHours),
          iron: parseNum(form.metals.iron),
          copper: parseNum(form.metals.copper),
          chromium: parseNum(form.metals.chromium),
          lead: parseNum(form.metals.lead),
          aluminum: parseNum(form.metals.aluminum),
          silicon: parseNum(form.metals.silicon),
          tin: parseNum(form.metals.tin) || undefined,
          nickel: parseNum(form.metals.nickel) || undefined
        })
      });
      if (!res.ok) throw new Error("Failed to save sample");
      setSaveMsg("Sample saved to history.");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!assetId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 border border-dashed border-slate-700 rounded-lg">
        <p className="text-lg font-semibold">Select an Asset</p>
        <p className="text-sm mt-2">
          Choose a route and asset to analyze oil wear metals.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <OilVisionDropzone
        disabled={!assetId}
        onExtracted={(data) => applyExtracted(data)}
      />

      <OilCsvUploader
        assetId={assetId}
        onUploadComplete={() => setRefreshKey((k) => k + 1)}
      />

      {(form.formatDetected || form.confidenceScore) && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-xs text-emerald-300">
          Vision extract · {form.formatDetected || "UNKNOWN"}
          {form.confidenceScore ? ` · Confidence ${form.confidenceScore}%` : ""}
        </div>
      )}

      {/* Header */}
      <div className={CARD}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">
          Sample Header
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Lab Name" value={form.header.labName} onChange={(v) => updateHeader("labName", v)} />
          <Field label="Report #" value={form.header.reportNumber} onChange={(v) => updateHeader("reportNumber", v)} />
          <Field label="Sample Date" value={form.header.sampleDate} onChange={(v) => updateHeader("sampleDate", v)} type="date" />
          <Field label="Received Date" value={form.header.receivedDate} onChange={(v) => updateHeader("receivedDate", v)} type="date" />
          <Field label="Asset ID" value={form.header.assetId} onChange={(v) => updateHeader("assetId", v)} />
          <Field label="Asset Description" value={form.header.assetDescription} onChange={(v) => updateHeader("assetDescription", v)} />
          <Field label="Component" value={form.header.component} onChange={(v) => updateHeader("component", v)} />
          <Field label="Lubricant Brand" value={form.header.lubricantBrand} onChange={(v) => updateHeader("lubricantBrand", v)} />
          <Field label="Lubricant Grade" value={form.header.lubricantGrade} onChange={(v) => updateHeader("lubricantGrade", v)} />
          <Field label="Sample Point" value={form.header.samplePoint} onChange={(v) => updateHeader("samplePoint", v)} />
        </div>
      </div>

      {/* Operating params */}
      <div className={CARD}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">
          Operating Parameters
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Operating Hours" value={form.ops.operatingHours} onChange={(v) => updateOps("operatingHours", v)} type="number" />
          <Field label="Oil Hours" value={form.ops.oilHours} onChange={(v) => updateOps("oilHours", v)} type="number" />
          <Field label="Miles / Km" value={form.ops.milesOrKm} onChange={(v) => updateOps("milesOrKm", v)} type="number" />
          <Field label="Make-up Oil (L)" value={form.ops.makeUpOilLiters} onChange={(v) => updateOps("makeUpOilLiters", v)} type="number" />
          <BoolSelect label="Filter Changed" value={form.ops.filterChanged} onChange={(v) => updateOps("filterChanged", v)} />
          <BoolSelect label="Oil Changed" value={form.ops.oilChanged} onChange={(v) => updateOps("oilChanged", v)} />
        </div>
      </div>

      {/* Wear metals */}
      <div className={CARD}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">
          Wear Metals (PPM)
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {(
            [
              ["iron", "Iron (Fe)"],
              ["copper", "Copper (Cu)"],
              ["chromium", "Chromium (Cr)"],
              ["lead", "Lead (Pb)"],
              ["aluminum", "Aluminum (Al)"],
              ["silicon", "Silicon (Si)"],
              ["tin", "Tin (Sn)"],
              ["nickel", "Nickel (Ni)"],
              ["molybdenum", "Molybdenum (Mo)"],
              ["magnesium", "Magnesium (Mg)"],
              ["calcium", "Calcium (Ca)"],
              ["zinc", "Zinc (Zn)"],
              ["sodium", "Sodium (Na)"],
              ["potassium", "Potassium (K)"],
              ["boron", "Boron (B)"],
              ["silver", "Silver (Ag)"],
              ["titanium", "Titanium (Ti)"],
              ["vanadium", "Vanadium (V)"]
            ] as const
          ).map(([metalKey, label]) => (
            <Fragment key={metalKey}>
              <Field
                label={label}
                value={form.metals[metalKey]}
                onChange={(v) => updateMetal(metalKey, v)}
                type="number"
              />
            </Fragment>
          ))}
        </div>
      </div>

      {/* Fluid properties */}
      <div className={CARD}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">
          Fluid Properties
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Viscosity @ 40°C (cSt)" value={form.fluid.viscosity40C} onChange={(v) => updateFluid("viscosity40C", v)} type="number" />
          <Field label="Viscosity @ 100°C (cSt)" value={form.fluid.viscosity100C} onChange={(v) => updateFluid("viscosity100C", v)} type="number" />
          <Field label="Viscosity Index" value={form.fluid.viscosityIndex} onChange={(v) => updateFluid("viscosityIndex", v)} type="number" />
          <Field label="Water (PPM)" value={form.fluid.waterPpm} onChange={(v) => updateFluid("waterPpm", v)} type="number" />
          <Field label="Water (%)" value={form.fluid.waterPercent} onChange={(v) => updateFluid("waterPercent", v)} type="number" />
          <Field label="TAN (mg KOH/g)" value={form.fluid.acidNumber} onChange={(v) => updateFluid("acidNumber", v)} type="number" />
          <Field label="TBN (mg KOH/g)" value={form.fluid.baseNumber} onChange={(v) => updateFluid("baseNumber", v)} type="number" />
          <Field label="Oxidation" value={form.fluid.oxidation} onChange={(v) => updateFluid("oxidation", v)} type="number" />
          <Field label="Nitration" value={form.fluid.nitration} onChange={(v) => updateFluid("nitration", v)} type="number" />
          <Field label="Sulfation" value={form.fluid.sulfation} onChange={(v) => updateFluid("sulfation", v)} type="number" />
          <Field label="Soot (%)" value={form.fluid.sootPercent} onChange={(v) => updateFluid("sootPercent", v)} type="number" />
          <Field label="Flash Point (°C)" value={form.fluid.flashPointC} onChange={(v) => updateFluid("flashPointC", v)} type="number" />
          <Field label="ISO 4406" value={form.fluid.particleCountIso4406} onChange={(v) => updateFluid("particleCountIso4406", v)} />
          <Field label="PQ Index" value={form.fluid.pqIndex} onChange={(v) => updateFluid("pqIndex", v)} type="number" />
        </div>
        {form.rawNotes && (
          <p className="text-xs text-slate-500 mt-3">{form.rawNotes}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void saveCurrentSample()}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:border-cyan-400 cursor-pointer disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Sample to History"}
        </button>
        {saveMsg && (
          <span className={`text-xs ${saveMsg.includes("saved") ? "text-green-400" : "text-amber-400"}`}>
            {saveMsg}
          </span>
        )}
      </div>

      {displaySample && (
        <>
          <div>
            <h2 className="text-xl font-bold text-white">Wear Metals & Debris</h2>
            <p className="text-sm text-slate-400 mt-1">
              {interpretWearPattern(displaySample)}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(
              [
                ["iron", "Iron (Fe)", displaySample.iron, displaySample.ironAlarmLimit],
                ["copper", "Copper (Cu)", displaySample.copper, displaySample.copperAlarmLimit],
                ["chromium", "Chromium (Cr)", displaySample.chromium, displaySample.chromiumAlarmLimit]
              ] as const
            ).map(([key, label, ppm, limit]) => (
              <div
                key={key}
                className={`p-4 rounded-lg border ${getStatusColor(getThresholdStatus(ppm, limit))}`}
              >
                <div className="text-sm opacity-80">{label}</div>
                <div className="text-2xl font-bold mt-1">{ppm} PPM</div>
                <div className="text-xs mt-2 opacity-75">Limit: {limit} PPM</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* History */}
      <div className={`${CARD} overflow-x-auto`}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Sample History
          </p>
          {historyLoading && (
            <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />
          )}
        </div>
        {historyError && (
          <p className="text-xs text-red-400 mb-2">{historyError}</p>
        )}
        {samples.length === 0 && !historyLoading ? (
          <p className="text-sm text-slate-500 py-4 text-center">
            No saved samples — upload a CSV or save after vision extract.
          </p>
        ) : (
          <table className="w-full text-sm text-left text-slate-300">
            <thead className="text-xs uppercase bg-slate-800 text-slate-400">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Iron</th>
                <th className="px-4 py-3">Copper</th>
                <th className="px-4 py-3">Chromium</th>
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Aluminum</th>
                <th className="px-4 py-3">Silicon</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((sample) => (
                <tr
                  key={sample.id ?? `${sample.sampleDate}-${sample.operatingHours}`}
                  className="border-b border-slate-700 hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3">
                    {new Date(sample.sampleDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">{sample.operatingHours}</td>
                  <td className="px-4 py-3 font-mono">{sample.iron}</td>
                  <td className="px-4 py-3 font-mono">{sample.copper}</td>
                  <td className="px-4 py-3 font-mono">{sample.chromium}</td>
                  <td className="px-4 py-3 font-mono">{sample.lead}</td>
                  <td className="px-4 py-3 font-mono">{sample.aluminum}</td>
                  <td className="px-4 py-3 font-mono">{sample.silicon}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default OilWearMetalsTab;
