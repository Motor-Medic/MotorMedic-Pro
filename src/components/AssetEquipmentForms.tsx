import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Sparkles, X } from "lucide-react";

/* Shared equipment form types — keep in sync with Assets.tsx */

export type Criticality = "High" | "Medium" | "Low";
export type AssetStatus = "Active" | "Inactive";
export type PointDirection = "Radial Horizontal" | "Radial Vertical" | "Axial";
export type PointQuality = "Ideal" | "Acceptable" | "Not Recommended";
export type IsoZone = "A" | "B" | "C" | "D";

export interface CollectionPointDraft {
  id: string;
  name: string;
  direction: PointDirection;
  quality: PointQuality;
  surface_finish: string;
  recommended_mounting: string;
  iso_reference: string;
  last_reading: string;
  current_value: number;
}

export interface ComponentDraft {
  id: string;
  name: string;
  component_type: string;
  bearing_de: string;
  bearing_nde: string;
  rpm: string;
  horsepower: string;
  kw: string;
  fan_blades: string;
  gear_teeth: string;
  coupling_type: string;
  lubrication_type: string;
  make: string;
  model: string;
  serial_number: string;
  notes: string;
  shafts: ShaftConfig[];
  collection_points: CollectionPointDraft[];
}

/** Multi-shaft gear / drive configuration — points nest under each shaft */
export interface ShaftConfig {
  id: string;
  name: string;
  teeth: string;
  rpm: string;
  type: string;
  bearing_de: string;
  bearing_nde: string;
  collection_points: CollectionPointDraft[];
}

/** Saved / looked-up component type templates for reuse */
export interface ComponentTypeTemplate {
  type: string;
  bearing_de: string;
  bearing_nde: string;
  rpm: string;
  horsepower: string;
  kw: string;
  fan_blades: string;
  gear_teeth: string;
  coupling_type: string;
  lubrication_type: string;
  make: string;
  model: string;
  notes: string;
}

export interface AssetWizardResult {
  name: string;
  tag: string;
  asset_type: string;
  criticality: Criticality;
  location: string;
  route_id: string;
  rpm: number | null;
  horsepower: number | null;
  kw: number | null;
  make: string;
  model: string;
  serial_number: string;
  installation_date: string;
  voltage: number | null;
  amps: number | null;
  coupling_type: string;
  lubrication_type: string;
  fan_blades: number | null;
  gear_teeth: number | null;
  bearing_de: string | null;
  bearing_nde: string | null;
  components: ComponentDraft[];
}

export interface ComponentFormResult {
  name: string;
  component_type: string;
  bearing_de: string;
  bearing_nde: string;
  rpm: number | null;
  horsepower: number | null;
  kw: number | null;
  fan_blades: number | null;
  gear_teeth: number | null;
  coupling_type: string;
  lubrication_type: string;
  make: string;
  model: string;
  serial_number: string;
  notes: string;
  shafts: ShaftConfig[];
}

export interface CollectionPointFormResult {
  name: string;
  direction: PointDirection;
  quality: PointQuality;
  surface_finish: string;
  recommended_mounting: string;
  iso_reference: string;
}

export const COMPONENT_TYPES = [
  "Motor DE",
  "Motor NDE",
  "Pump DE",
  "Pump NDE",
  "Gearbox Input",
  "Gearbox Output",
  "Fan DE",
  "Fan NDE",
  "Compressor Airend DE",
  "Compressor Airend NDE",
  "Cooling Fan",
  "Helical Gear Reducer",
  "Other"
];

export const COUPLING_TYPES = ["Flexible", "Rigid", "Universal Joint", "Grid", "Disc", "None"];
export const LUBE_TYPES = ["Grease", "Oil", "Oil Mist", "Dry", "Sealed for Life"];
export const ASSET_TYPES = ["Pump", "Motor", "Gearbox", "Fan", "Compressor", "Heat Exchanger", "Electrical", "Other"];
export const BEARING_SUGGESTIONS = [
  "6319 C3", "6318 C3", "6317 C3", "6320 C3", "6322 C3", "6309 C3", "6308 C3",
  "22216 E", "22214 E", "22218 EK", "6205", "6312", "6316 C3", "6314 C3"
];

const CUSTOM_TYPES_KEY = "motormedic-component-types-v1";

/** Built-in AI knowledge base for common industrial component types */
export const COMPONENT_TYPE_KB: ComponentTypeTemplate[] = [
  {
    type: "Motor DE",
    bearing_de: "6319 C3",
    bearing_nde: "6317 C3",
    rpm: "1780",
    horsepower: "100",
    kw: "75",
    fan_blades: "",
    gear_teeth: "",
    coupling_type: "Flexible",
    lubrication_type: "Grease",
    make: "Siemens",
    model: "1LA8",
    notes: "Drive-end motor bearing — typical TEFC industrial motor"
  },
  {
    type: "Motor NDE",
    bearing_de: "6317 C3",
    bearing_nde: "6317 C3",
    rpm: "1780",
    horsepower: "100",
    kw: "75",
    fan_blades: "",
    gear_teeth: "",
    coupling_type: "None",
    lubrication_type: "Grease",
    make: "Siemens",
    model: "1LA8",
    notes: "Non-drive-end motor bearing — often fan-cooled side"
  },
  {
    type: "Pump DE",
    bearing_de: "6320 C3",
    bearing_nde: "6318 C3",
    rpm: "1780",
    horsepower: "250",
    kw: "186",
    fan_blades: "",
    gear_teeth: "",
    coupling_type: "Flexible",
    lubrication_type: "Grease",
    make: "Flowserve",
    model: "HPX",
    notes: "Pump drive-end — monitor for misalignment and cavitation"
  },
  {
    type: "Pump NDE",
    bearing_de: "6318 C3",
    bearing_nde: "6318 C3",
    rpm: "1780",
    horsepower: "250",
    kw: "186",
    fan_blades: "",
    gear_teeth: "",
    coupling_type: "None",
    lubrication_type: "Grease",
    make: "Flowserve",
    model: "HPX",
    notes: "Pump non-drive-end — check soft foot and thrust loading"
  },
  {
    type: "Gearbox Input",
    bearing_de: "22216 E",
    bearing_nde: "22214 E",
    rpm: "1750",
    horsepower: "50",
    kw: "37",
    fan_blades: "",
    gear_teeth: "23",
    coupling_type: "Flexible",
    lubrication_type: "Oil",
    make: "Falk",
    model: "2055Y3",
    notes: "High-speed shaft — gear mesh frequency critical"
  },
  {
    type: "Gearbox Output",
    bearing_de: "22214 E",
    bearing_nde: "22212 E",
    rpm: "350",
    horsepower: "50",
    kw: "37",
    fan_blades: "",
    gear_teeth: "87",
    coupling_type: "Rigid",
    lubrication_type: "Oil",
    make: "Falk",
    model: "2055Y3",
    notes: "Low-speed shaft — monitor output torque and mesh sidebands"
  },
  {
    type: "Helical Gear Reducer",
    bearing_de: "6317 C3",
    bearing_nde: "6315 C3",
    rpm: "1750",
    horsepower: "40",
    kw: "30",
    fan_blades: "",
    gear_teeth: "2",
    coupling_type: "Flexible",
    lubrication_type: "Oil",
    make: "SEW-Eurodrive",
    model: "R97",
    notes: "Standard specs: 1750 RPM input, 6317 C3 bearing, dual gear ratio stages typical"
  },
  {
    type: "Fan DE",
    bearing_de: "22218 EK",
    bearing_nde: "22216 EK",
    rpm: "1180",
    horsepower: "75",
    kw: "56",
    fan_blades: "8",
    gear_teeth: "",
    coupling_type: "Flexible",
    lubrication_type: "Grease",
    make: "Howden",
    model: "Variax",
    notes: "Fan drive-end — blade-pass frequency = RPM × blades / 60"
  },
  {
    type: "Cooling Fan",
    bearing_de: "6205",
    bearing_nde: "6205",
    rpm: "1750",
    horsepower: "5",
    kw: "3.7",
    fan_blades: "6",
    gear_teeth: "",
    coupling_type: "None",
    lubrication_type: "Sealed for Life",
    make: "TBD",
    model: "TBD",
    notes: "Auxiliary cooling fan — imbalance and looseness common"
  },
  {
    type: "Compressor Airend DE",
    bearing_de: "6309 C3",
    bearing_nde: "6308 C3",
    rpm: "3550",
    horsepower: "100",
    kw: "75",
    fan_blades: "",
    gear_teeth: "",
    coupling_type: "Flexible",
    lubrication_type: "Oil",
    make: "Atlas Copco",
    model: "GA75",
    notes: "Screw compressor airend — oil analysis critical"
  }
];

const INPUT =
  "w-full min-h-[40px] rounded-xl bg-slate-950 border border-slate-700 px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400/50";
const LABEL = "text-[10px] font-bold text-slate-500 uppercase tracking-wider";
const SELECT = INPUT;

function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function loadSavedComponentTypes(): ComponentTypeTemplate[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TYPES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveComponentTypeTemplate(t: ComponentTypeTemplate) {
  const existing = loadSavedComponentTypes().filter(
    (x) => x.type.toLowerCase() !== t.type.toLowerCase()
  );
  existing.unshift(t);
  try {
    localStorage.setItem(CUSTOM_TYPES_KEY, JSON.stringify(existing.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

/** Fuzzy match query against KB + saved templates */
export function aiLookupComponentType(query: string): { match: ComponentTypeTemplate; score: number; source: "kb" | "saved" }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const scoreOne = (type: string) => {
    const t = type.toLowerCase();
    if (t === q) return 100;
    if (t.includes(q) || q.includes(t)) return 80;
    const hits = tokens.filter((tok) => t.includes(tok)).length;
    return hits > 0 ? 40 + hits * 15 : 0;
  };
  const results: { match: ComponentTypeTemplate; score: number; source: "kb" | "saved" }[] = [];
  for (const m of COMPONENT_TYPE_KB) {
    const score = scoreOne(m.type);
    if (score > 0) results.push({ match: m, score, source: "kb" });
  }
  for (const m of loadSavedComponentTypes()) {
    const score = scoreOne(m.type);
    if (score > 0) results.push({ match: m, score: score + 5, source: "saved" });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}

function applyTemplate(draft: ComponentDraft, tpl: ComponentTypeTemplate): ComponentDraft {
  return {
    ...draft,
    component_type: tpl.type,
    name: draft.name || tpl.type,
    bearing_de: tpl.bearing_de,
    bearing_nde: tpl.bearing_nde,
    rpm: tpl.rpm,
    horsepower: tpl.horsepower,
    kw: tpl.kw,
    fan_blades: tpl.fan_blades,
    gear_teeth: tpl.gear_teeth,
    coupling_type: tpl.coupling_type,
    lubrication_type: tpl.lubrication_type,
    make: tpl.make,
    model: tpl.model,
    notes: tpl.notes,
    shafts: draft.shafts?.length ? draft.shafts : defaultShafts(1),
    collection_points: autoPointsForType(tpl.type)
  };
}

function emptyComponent(type = "Motor DE"): ComponentDraft {
  return {
    id: uid("comp"),
    name: type,
    component_type: type,
    bearing_de: "",
    bearing_nde: "",
    rpm: "",
    horsepower: "",
    kw: "",
    fan_blades: "",
    gear_teeth: "",
    coupling_type: "Flexible",
    lubrication_type: "Grease",
    make: "",
    model: "",
    serial_number: "",
    notes: "",
    shafts: defaultShafts(1),
    collection_points: []
  };
}

export function defaultShafts(count = 2): ShaftConfig[] {
  const n = Math.max(1, Math.min(6, count));
  return Array.from({ length: n }, (_, i) => {
    let name = `Intermediate Shaft ${i}`;
    if (i === 0) name = "Input Shaft";
    if (i === n - 1 && n > 1) name = "Output Shaft";
    if (n === 1) name = "Main Shaft";
    return {
      id: uid("shaft"),
      name,
      teeth: i === 0 ? "20" : "40",
      rpm: i === 0 ? "1750" : String(Math.round(1750 / (i + 1))),
      type: "Spur",
      bearing_de: "",
      bearing_nde: "",
      collection_points: autoPointsForType(name)
    };
  });
}

function emptyPoint(shaftName: string, direction: PointDirection = "Radial Horizontal"): CollectionPointDraft {
  const short =
    direction === "Radial Horizontal" ? "Horizontal" : direction === "Radial Vertical" ? "Vertical" : "Axial";
  return {
    id: uid("pt"),
    name: `${shaftName} - ${short}`,
    direction,
    quality: direction === "Axial" ? "Acceptable" : "Ideal",
    surface_finish: "Machined bearing housing",
    recommended_mounting: "Stud mount on bearing cap",
    iso_reference: "ISO 10816-3",
    last_reading: "",
    current_value: 0
  };
}

/** Multi-shaft editor with per-shaft bearings + nested collection points */
export function ShaftEditor({
  shafts,
  onChange,
  title = "Shaft Configuration"
}: {
  shafts: ShaftConfig[];
  onChange: (next: ShaftConfig[]) => void;
  title?: string;
}) {
  const [expanded, setExpanded] = useState<number | null>(0);

  const ratios = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < shafts.length - 1; i++) {
      const r1 = parseFloat(shafts[i].rpm);
      const r2 = parseFloat(shafts[i + 1].rpm);
      if (r1 > 0 && r2 > 0) out.push(`${shafts[i].name} → ${shafts[i + 1].name}: ${(r1 / r2).toFixed(2)}:1`);
    }
    return out;
  }, [shafts]);

  const patch = (idx: number, partial: Partial<ShaftConfig>) => {
    onChange(
      shafts.map((s, i) => {
        if (i !== idx) return s;
        const next = { ...s, ...partial };
        // Keep point names in sync when shaft renamed
        if (partial.name && partial.name !== s.name) {
          next.collection_points = (next.collection_points || []).map((p) => ({
            ...p,
            name: p.name.replace(s.name, partial.name!)
          }));
        }
        return next;
      })
    );
  };

  const addShaft = () => {
    if (shafts.length >= 6) return;
    const name = shafts.length === 0 ? "Main Shaft" : `Shaft ${shafts.length + 1}`;
    onChange([
      ...shafts,
      {
        id: uid("shaft"),
        name,
        teeth: "30",
        rpm: "1000",
        type: "Spur",
        bearing_de: "",
        bearing_nde: "",
        collection_points: autoPointsForType(name)
      }
    ]);
    setExpanded(shafts.length);
  };

  const addPoint = (shaftIdx: number) => {
    const shaft = shafts[shaftIdx];
    const dirs: PointDirection[] = ["Radial Horizontal", "Radial Vertical", "Axial"];
    const used = new Set((shaft.collection_points || []).map((p) => p.direction));
    const nextDir = dirs.find((d) => !used.has(d)) ?? "Radial Horizontal";
    patch(shaftIdx, {
      collection_points: [...(shaft.collection_points || []), emptyPoint(shaft.name, nextDir)]
    });
  };

  const patchPoint = (shaftIdx: number, pointId: string, partial: Partial<CollectionPointDraft>) => {
    const shaft = shafts[shaftIdx];
    patch(shaftIdx, {
      collection_points: (shaft.collection_points || []).map((p) =>
        p.id === pointId ? { ...p, ...partial } : p
      )
    });
  };

  const removePoint = (shaftIdx: number, pointId: string) => {
    const shaft = shafts[shaftIdx];
    patch(shaftIdx, {
      collection_points: (shaft.collection_points || []).filter((p) => p.id !== pointId)
    });
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">{title}</p>
        <button
          type="button"
          onClick={addShaft}
          disabled={shafts.length >= 6}
          className="min-h-[36px] px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Add Shaft
        </button>
      </div>
      {ratios.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ratios.map((r) => (
            <span key={r} className="text-[10px] font-mono px-2 py-0.5 rounded border border-amber-400/30 bg-amber-400/5 text-amber-200">
              {r}
            </span>
          ))}
        </div>
      )}
      {shafts.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-4 border border-dashed border-slate-700 rounded-xl">
          No shafts yet — add Input / Output / Intermediate shafts for this component.
        </p>
      )}
      <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-0.5">
        {shafts.map((shaft, idx) => {
          const open = expanded === idx;
          const pts = shaft.collection_points || [];
          return (
            <div key={shaft.id || idx} className="rounded-xl border border-slate-700 bg-slate-900/70 overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : idx)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-slate-800/60"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{shaft.name || `Shaft ${idx + 1}`}</p>
                  <p className="text-[10px] text-slate-500">
                    {shaft.rpm || "—"} RPM · DE {shaft.bearing_de || "—"} · NDE {shaft.bearing_nde || "—"} · {pts.length} pts
                  </p>
                </div>
                <span className="text-[10px] font-bold text-amber-300 shrink-0">{open ? "Hide" : "Configure"}</span>
              </button>
              {open && (
                <div className="border-t border-slate-700 p-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="space-y-0.5 block sm:col-span-2">
                      <span className="text-[9px] font-bold text-slate-500 uppercase">Shaft Name</span>
                      <input className={INPUT} value={shaft.name} onChange={(e) => patch(idx, { name: e.target.value })} />
                    </label>
                    <label className="space-y-0.5 block">
                      <span className="text-[9px] font-bold text-slate-500 uppercase">RPM</span>
                      <input type="number" className={INPUT} value={shaft.rpm} onChange={(e) => patch(idx, { rpm: e.target.value })} />
                    </label>
                    <label className="space-y-0.5 block">
                      <span className="text-[9px] font-bold text-slate-500 uppercase">Gear Teeth</span>
                      <input type="number" className={INPUT} value={shaft.teeth} onChange={(e) => patch(idx, { teeth: e.target.value })} />
                    </label>
                    <label className="space-y-0.5 block">
                      <span className="text-[9px] font-bold text-slate-500 uppercase">Drive End Bearing</span>
                      <input className={INPUT} list="bearing-suggestions" value={shaft.bearing_de} onChange={(e) => patch(idx, { bearing_de: e.target.value })} placeholder="e.g. 6319 C3" />
                    </label>
                    <label className="space-y-0.5 block">
                      <span className="text-[9px] font-bold text-slate-500 uppercase">Non-Drive End Bearing</span>
                      <input className={INPUT} list="bearing-suggestions" value={shaft.bearing_nde} onChange={(e) => patch(idx, { bearing_nde: e.target.value })} placeholder="e.g. 6317 C3" />
                    </label>
                    <label className="space-y-0.5 block sm:col-span-2">
                      <span className="text-[9px] font-bold text-slate-500 uppercase">Gear Type</span>
                      <select className={SELECT} value={shaft.type} onChange={(e) => patch(idx, { type: e.target.value })}>
                        {["Spur", "Helical", "Bevel", "Worm", "Herringbone", "None"].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Collection Points on this Shaft
                      </p>
                      <button
                        type="button"
                        onClick={() => addPoint(idx)}
                        className="min-h-[32px] px-2.5 rounded-lg bg-amber-400/10 border border-amber-400/40 text-amber-300 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Collection Point
                      </button>
                    </div>
                    {pts.length === 0 && (
                      <p className="text-[11px] text-slate-500">No points — add Horizontal / Vertical / Axial.</p>
                    )}
                    {pts.map((p) => (
                      <div key={p.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          className={INPUT}
                          value={p.name}
                          onChange={(e) => patchPoint(idx, p.id, { name: e.target.value })}
                          placeholder="Point name"
                        />
                        <select
                          className={SELECT}
                          value={p.direction}
                          onChange={(e) => patchPoint(idx, p.id, { direction: e.target.value as PointDirection })}
                        >
                          <option>Radial Horizontal</option>
                          <option>Radial Vertical</option>
                          <option>Axial</option>
                        </select>
                        <div className="flex gap-1">
                          <select
                            className={SELECT}
                            value={p.quality}
                            onChange={(e) => patchPoint(idx, p.id, { quality: e.target.value as PointQuality })}
                          >
                            <option>Ideal</option>
                            <option>Acceptable</option>
                            <option>Not Recommended</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => removePoint(idx, p.id)}
                            className="px-2 text-red-400 text-[10px] font-bold cursor-pointer shrink-0"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {shafts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        onChange(shafts.filter((_, i) => i !== idx));
                        setExpanded(null);
                      }}
                      className="text-[11px] font-bold text-red-400 cursor-pointer"
                    >
                      Remove Shaft
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <datalist id="bearing-suggestions">
        {BEARING_SUGGESTIONS.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
    </div>
  );
}

/** Standard H/V/Axial points for a component type */
export function autoPointsForType(componentType: string, baseVib = 1.5): CollectionPointDraft[] {
  const prefix = componentType;
  return [
    {
      id: uid("pt"),
      name: `${prefix} - Horizontal`,
      direction: "Radial Horizontal",
      quality: "Ideal",
      surface_finish: "Machined bearing housing",
      recommended_mounting: "Stud mount on bearing cap",
      iso_reference: "ISO 10816-3",
      last_reading: new Date().toISOString().slice(0, 10),
      current_value: Number(baseVib.toFixed(2))
    },
    {
      id: uid("pt"),
      name: `${prefix} - Vertical`,
      direction: "Radial Vertical",
      quality: "Ideal",
      surface_finish: "Machined bearing housing",
      recommended_mounting: "Stud mount on bearing cap (12 o'clock)",
      iso_reference: "ISO 10816-3",
      last_reading: new Date().toISOString().slice(0, 10),
      current_value: Number((baseVib * 0.92).toFixed(2))
    },
    {
      id: uid("pt"),
      name: `${prefix} - Axial`,
      direction: "Axial",
      quality: "Acceptable",
      surface_finish: "End bell / housing face",
      recommended_mounting: "Magnet or adhesive pad if stud unavailable",
      iso_reference: "ISO 10816-3",
      last_reading: new Date().toISOString().slice(0, 10),
      current_value: Number((baseVib * 0.75).toFixed(2))
    }
  ];
}

function FormField({
  label,
  required,
  children,
  className = ""
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`space-y-1 block ${className}`}>
      <span className={LABEL}>
        {label}
        {required && <span className="text-amber-400 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function ModalShell({
  title,
  subtitle,
  children,
  onClose,
  footer,
  wide
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
      <div
        className={`bg-slate-800 border border-slate-700 rounded-2xl w-full shadow-2xl flex flex-col max-h-[92vh] ${
          wide ? "max-w-3xl" : "max-w-xl"
        }`}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-700 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 max-h-[min(70vh,36rem)]">{children}</div>
        <div className="flex flex-wrap justify-end gap-2 px-4 py-3 border-t border-slate-700 shrink-0">{footer}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Component detailed form (shared by wizard + Add Component)                 */
/* -------------------------------------------------------------------------- */

export function ComponentSpecFields({
  value,
  onChange,
  showPointsPreview,
  onAiMessage
}: {
  value: ComponentDraft;
  onChange: (next: ComponentDraft) => void;
  showPointsPreview?: boolean;
  onAiMessage?: (msg: string) => void;
}) {
  const [customType, setCustomType] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiHits, setAiHits] = useState<{ match: ComponentTypeTemplate; score: number; source: "kb" | "saved" }[]>([]);
  const [savedTypes, setSavedTypes] = useState<ComponentTypeTemplate[]>(() => loadSavedComponentTypes());

  const knownTypes = useMemo(() => {
    const set = new Set([...COMPONENT_TYPES.filter((t) => t !== "Other"), ...savedTypes.map((t) => t.type)]);
    return Array.from(set);
  }, [savedTypes]);

  const isUnknownType =
    !!value.component_type &&
    value.component_type !== "Other" &&
    !knownTypes.some((t) => t.toLowerCase() === value.component_type.toLowerCase());

  const showAi = value.component_type === "Other" || isUnknownType || !!customType.trim();

  const runAiLookup = (query?: string) => {
    const q = (query ?? (customType || value.component_type || value.name)).trim();
    if (!q || q === "Other") {
      onAiMessage?.("Enter a component type name to look up (e.g. Helical Gear Reducer).");
      return;
    }
    setAiBusy(true);
    // Simulate brief AI latency for UX
    window.setTimeout(() => {
      const hits = aiLookupComponentType(q);
      setAiHits(hits);
      setAiBusy(false);
      if (hits.length === 0) {
        onAiMessage?.(`No close matches for “${q}”. Fill specs manually, then Save Type for reuse.`);
      } else {
        onAiMessage?.(`Found ${hits.length} similar type(s) for “${q}”.`);
      }
    }, 450);
  };

  const applyHit = (tpl: ComponentTypeTemplate) => {
    onChange(applyTemplate(value, tpl));
    setCustomType("");
    setAiHits([]);
    onAiMessage?.(`Applied specs from “${tpl.type}”.`);
  };

  const saveCurrentAsType = () => {
    const typeName = (customType.trim() || value.component_type || value.name).trim();
    if (!typeName || typeName === "Other") {
      onAiMessage?.("Name the component type before saving.");
      return;
    }
    const tpl: ComponentTypeTemplate = {
      type: typeName,
      bearing_de: value.bearing_de,
      bearing_nde: value.bearing_nde,
      rpm: value.rpm,
      horsepower: value.horsepower,
      kw: value.kw,
      fan_blades: value.fan_blades,
      gear_teeth: value.gear_teeth,
      coupling_type: value.coupling_type,
      lubrication_type: value.lubrication_type,
      make: value.make,
      model: value.model,
      notes: value.notes
    };
    saveComponentTypeTemplate(tpl);
    setSavedTypes(loadSavedComponentTypes());
    onChange({
      ...value,
      component_type: typeName,
      name: value.name || typeName,
      collection_points: value.collection_points.length ? value.collection_points : autoPointsForType(typeName)
    });
    onAiMessage?.(`Saved “${typeName}” for future reuse.`);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Component Name" required>
          <input
            className={INPUT}
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="e.g. Motor DE"
          />
        </FormField>
        <FormField label="Component Type" required>
          <select
            className={SELECT}
            value={knownTypes.includes(value.component_type) ? value.component_type : "Other"}
            onChange={(e) => {
              const t = e.target.value;
              if (t === "Other") {
                onChange({ ...value, component_type: customType || "Other" });
                return;
              }
              const tpl = [...COMPONENT_TYPE_KB, ...savedTypes].find(
                (x) => x.type.toLowerCase() === t.toLowerCase()
              );
              if (tpl) onChange(applyTemplate(value, tpl));
              else {
                onChange({
                  ...value,
                  component_type: t,
                  name: value.name || t,
                  collection_points: autoPointsForType(t)
                });
              }
              setCustomType("");
              setAiHits([]);
            }}
          >
            {knownTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
            <option value="Other">Other (custom / smart lookup)</option>
          </select>
        </FormField>

        {(value.component_type === "Other" || isUnknownType || customType) && (
          <FormField label="Custom Type Name" className="sm:col-span-2" required>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className={INPUT}
                value={customType || (isUnknownType ? value.component_type : "")}
                onChange={(e) => {
                  setCustomType(e.target.value);
                  onChange({ ...value, component_type: e.target.value || "Other", name: value.name || e.target.value });
                }}
                placeholder="e.g. Helical Gear Reducer"
              />
              <button
                type="button"
                disabled={aiBusy}
                onClick={() => runAiLookup()}
                className="min-h-[40px] px-3 rounded-xl bg-sky-500/15 border border-sky-400/40 text-sky-300 text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-sky-500/25 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {aiBusy ? "Looking up…" : "Smart Lookup"}
              </button>
              <button
                type="button"
                onClick={saveCurrentAsType}
                className="min-h-[40px] px-3 rounded-xl bg-amber-400/10 border border-amber-400/40 text-amber-300 text-xs font-bold cursor-pointer hover:bg-amber-400/20 shrink-0"
              >
                Save Type
              </button>
            </div>
          </FormField>
        )}

        {showAi && aiHits.length > 0 && (
          <div className="sm:col-span-2 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 space-y-2">
            <p className="text-[10px] font-bold text-sky-300 uppercase tracking-wider">Suggestions</p>
            {aiHits.map(({ match, source }) => (
              <button
                key={`${source}-${match.type}`}
                type="button"
                onClick={() => applyHit(match)}
                className="w-full text-left rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 hover:border-sky-400/50 cursor-pointer transition-colors"
              >
                <p className="text-sm font-bold text-white">{match.type}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {match.rpm ? `${match.rpm} RPM` : "—"} · {match.bearing_de || "bearing TBD"} · {match.lubrication_type}
                  {match.gear_teeth ? ` · ${match.gear_teeth} gear teeth` : ""}
                  {match.fan_blades ? ` · ${match.fan_blades} blades` : ""}
                  <span className="text-slate-600"> · {source === "saved" ? "Saved" : "KB"}</span>
                </p>
                {match.notes && <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{match.notes}</p>}
              </button>
            ))}
          </div>
        )}

        <FormField label="Bearing Type DE">
          <input
            className={INPUT}
            list="bearing-suggestions"
            value={value.bearing_de}
            onChange={(e) => onChange({ ...value, bearing_de: e.target.value })}
            placeholder="e.g. 6319 C3"
          />
        </FormField>
        <FormField label="Bearing Type NDE">
          <input
            className={INPUT}
            list="bearing-suggestions"
            value={value.bearing_nde}
            onChange={(e) => onChange({ ...value, bearing_nde: e.target.value })}
            placeholder="e.g. 6317 C3"
          />
        </FormField>
        <datalist id="bearing-suggestions">
          {BEARING_SUGGESTIONS.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
        <FormField label="RPM">
          <input type="number" className={INPUT} value={value.rpm} onChange={(e) => onChange({ ...value, rpm: e.target.value })} />
        </FormField>
        <FormField label="Horsepower">
          <input type="number" className={INPUT} value={value.horsepower} onChange={(e) => onChange({ ...value, horsepower: e.target.value })} />
        </FormField>
        <FormField label="Power (kW)">
          <input type="number" className={INPUT} value={value.kw} onChange={(e) => onChange({ ...value, kw: e.target.value })} />
        </FormField>
        <FormField label="Number of Fan Blades">
          <input type="number" className={INPUT} value={value.fan_blades} onChange={(e) => onChange({ ...value, fan_blades: e.target.value })} />
        </FormField>
        <FormField label="Number of Gear Teeth">
          <input type="number" className={INPUT} value={value.gear_teeth} onChange={(e) => onChange({ ...value, gear_teeth: e.target.value })} />
        </FormField>
        <FormField label="Coupling Type">
          <select className={SELECT} value={value.coupling_type} onChange={(e) => onChange({ ...value, coupling_type: e.target.value })}>
            {COUPLING_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Lubrication Type">
          <select className={SELECT} value={value.lubrication_type} onChange={(e) => onChange({ ...value, lubrication_type: e.target.value })}>
            {LUBE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Manufacturer">
          <input className={INPUT} value={value.make} onChange={(e) => onChange({ ...value, make: e.target.value })} placeholder="e.g. Siemens" />
        </FormField>
        <FormField label="Model Number">
          <input className={INPUT} value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })} placeholder="e.g. 1LA8 316" />
        </FormField>
        <FormField label="Serial Number" className="sm:col-span-2">
          <input className={INPUT} value={value.serial_number} onChange={(e) => onChange({ ...value, serial_number: e.target.value })} />
        </FormField>
        <FormField label="Notes" className="sm:col-span-2">
          <textarea
            className={`${INPUT} min-h-[72px] py-2`}
            value={value.notes}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
            placeholder="Mounting notes, soft-foot history…"
          />
        </FormField>
      </div>
      <ShaftEditor
        shafts={value.shafts?.length ? value.shafts : defaultShafts(1)}
        onChange={(shafts) => onChange({ ...value, shafts, collection_points: flattenShaftPoints(shafts) })}
        title="Multi-Shaft Specs + Collection Points"
      />
      {showPointsPreview && (
        <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
          <p className={LABEL}>
            All collection points ({flattenShaftPoints(value.shafts?.length ? value.shafts : []).length})
          </p>
          <ul className="mt-2 space-y-1">
            {(value.shafts || []).flatMap((s) =>
              (s.collection_points || []).map((p) => (
                <li key={p.id} className="text-xs text-slate-400 flex justify-between gap-2">
                  <span className="text-slate-200 font-medium truncate">{p.name}</span>
                  <span className="shrink-0">{s.name} · {p.direction}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function draftToComponentResult(d: ComponentDraft): ComponentFormResult {
  const shafts = (d.shafts?.length ? d.shafts : defaultShafts(1)).map((s) => ({
    ...s,
    id: s.id || uid("shaft"),
    bearing_de: s.bearing_de ?? "",
    bearing_nde: s.bearing_nde ?? "",
    collection_points: s.collection_points?.length ? s.collection_points : autoPointsForType(s.name)
  }));
  // Flatten points for callers that still expect component-level list
  const flatPoints = shafts.flatMap((s) => s.collection_points);
  return {
    name: d.name.trim() || d.component_type,
    component_type: d.component_type,
    bearing_de: d.bearing_de.trim() || shafts[0]?.bearing_de || "",
    bearing_nde: d.bearing_nde.trim() || shafts[0]?.bearing_nde || "",
    rpm: numOrNull(d.rpm) ?? (shafts[0]?.rpm ? Number(shafts[0].rpm) : null),
    horsepower: numOrNull(d.horsepower),
    kw: numOrNull(d.kw),
    fan_blades: numOrNull(d.fan_blades),
    gear_teeth: numOrNull(d.gear_teeth),
    coupling_type: d.coupling_type,
    lubrication_type: d.lubrication_type,
    make: d.make.trim(),
    model: d.model.trim(),
    serial_number: d.serial_number.trim(),
    notes: d.notes.trim(),
    shafts
  };
}

/** Flatten all shaft collection points for wizard review tables */
export function flattenShaftPoints(shafts: ShaftConfig[]): CollectionPointDraft[] {
  return shafts.flatMap((s) => s.collection_points || []);
}

/* -------------------------------------------------------------------------- */
/* Add Component Modal                                                        */
/* -------------------------------------------------------------------------- */

export function AddComponentModal({
  onClose,
  onSave,
  initial,
  title = "Add Component"
}: {
  onClose: () => void;
  onSave: (result: ComponentFormResult, points: CollectionPointDraft[]) => void;
  initial?: Partial<ComponentDraft>;
  title?: string;
}) {
  const [draft, setDraft] = useState<ComponentDraft>(() => ({ ...emptyComponent(), ...initial }));
  const [error, setError] = useState("");
  const [aiMsg, setAiMsg] = useState("");

  return (
    <ModalShell
      title={title}
      subtitle="Detailed specs, multi-shaft bearings, and collection points"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="min-h-[40px] px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-slate-300 cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!draft.name.trim() && !draft.component_type) {
                setError("Component name or type is required.");
                return;
              }
              if (draft.component_type && draft.component_type !== "Other") {
                saveComponentTypeTemplate({
                  type: draft.component_type,
                  bearing_de: draft.bearing_de,
                  bearing_nde: draft.bearing_nde,
                  rpm: draft.rpm,
                  horsepower: draft.horsepower,
                  kw: draft.kw,
                  fan_blades: draft.fan_blades,
                  gear_teeth: draft.gear_teeth,
                  coupling_type: draft.coupling_type,
                  lubrication_type: draft.lubrication_type,
                  make: draft.make,
                  model: draft.model,
                  notes: draft.notes
                });
              }
              const result = draftToComponentResult(draft);
              onSave(result, flattenShaftPoints(result.shafts));
            }}
            className="min-h-[40px] px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold cursor-pointer"
          >
            Save Component
          </button>
        </>
      }
    >
      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
      {aiMsg && <p className="text-xs text-sky-300 mb-3">{aiMsg}</p>}
      <ComponentSpecFields value={draft} onChange={setDraft} showPointsPreview onAiMessage={setAiMsg} />
    </ModalShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Collection Point Modal                                                     */
/* -------------------------------------------------------------------------- */

export function AddCollectionPointModal({
  onClose,
  onSave,
  initial,
  title = "Add Collection Point"
}: {
  onClose: () => void;
  onSave: (result: CollectionPointFormResult) => void;
  initial?: Partial<CollectionPointFormResult>;
  title?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [direction, setDirection] = useState<PointDirection>(initial?.direction ?? "Radial Horizontal");
  const [quality, setQuality] = useState<PointQuality>(initial?.quality ?? "Ideal");
  const [surface, setSurface] = useState(initial?.surface_finish ?? "");
  const [mounting, setMounting] = useState(initial?.recommended_mounting ?? "");
  const [iso, setIso] = useState(initial?.iso_reference ?? "ISO 10816-3");
  const [error, setError] = useState("");

  return (
    <ModalShell
      title={title}
      subtitle="Define where and how vibration is measured"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="min-h-[40px] px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-slate-300 cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!name.trim()) {
                setError("Point name is required.");
                return;
              }
              onSave({
                name: name.trim(),
                direction,
                quality,
                surface_finish: surface.trim(),
                recommended_mounting: mounting.trim(),
                iso_reference: iso.trim() || "ISO 10816-3"
              });
            }}
            className="min-h-[40px] px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold cursor-pointer"
          >
            Save Point
          </button>
        </>
      }
    >
      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Point Name" required className="sm:col-span-2">
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Motor DE - Horizontal" />
        </FormField>
        <FormField label="Direction" required>
          <select className={SELECT} value={direction} onChange={(e) => setDirection(e.target.value as PointDirection)}>
            <option>Radial Horizontal</option>
            <option>Radial Vertical</option>
            <option>Axial</option>
          </select>
        </FormField>
        <FormField label="Quality" required>
          <select className={SELECT} value={quality} onChange={(e) => setQuality(e.target.value as PointQuality)}>
            <option>Ideal</option>
            <option>Acceptable</option>
            <option>Not Recommended</option>
          </select>
        </FormField>
        <FormField label="Surface Finish" className="sm:col-span-2">
          <textarea className={`${INPUT} min-h-[64px] py-2`} value={surface} onChange={(e) => setSurface(e.target.value)} placeholder="Machined housing, painted, cast…" />
        </FormField>
        <FormField label="Recommended Mounting" className="sm:col-span-2">
          <textarea className={`${INPUT} min-h-[64px] py-2`} value={mounting} onChange={(e) => setMounting(e.target.value)} placeholder="Stud mount on bearing cap…" />
        </FormField>
        <FormField label="ISO Standard Reference" className="sm:col-span-2">
          <input className={INPUT} value={iso} onChange={(e) => setIso(e.target.value)} placeholder="ISO 10816-3" />
        </FormField>
      </div>
    </ModalShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Add Route Modal                                                            */
/* -------------------------------------------------------------------------- */

export function AddRouteModal({
  onClose,
  onSave
}: {
  onClose: () => void;
  onSave: (data: { name: string; tag: string; location: string }) => void;
}) {
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");

  return (
    <ModalShell
      title="Add Route"
      subtitle="Create a route or system to organize assets"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="min-h-[40px] px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-slate-300 cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!name.trim()) {
                setError("Route name is required.");
                return;
              }
              onSave({ name: name.trim(), tag: tag.trim(), location: location.trim() });
            }}
            className="min-h-[40px] px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold cursor-pointer"
          >
            Create Route
          </button>
        </>
      }
    >
      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
      <div className="grid grid-cols-1 gap-3">
        <FormField label="Route Name" required>
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Tag">
          <input className={INPUT} value={tag} onChange={(e) => setTag(e.target.value)} placeholder="BFS-101" />
        </FormField>
        <FormField label="Location">
          <input className={INPUT} value={location} onChange={(e) => setLocation(e.target.value)} />
        </FormField>
      </div>
    </ModalShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Add / Edit Asset Wizard (5 steps)                                          */
/* -------------------------------------------------------------------------- */

export function AddAssetWizard({
  onClose,
  onSave,
  routes,
  defaultRouteId,
  mode = "add",
  initialAsset
}: {
  onClose: () => void;
  onSave: (result: AssetWizardResult) => void;
  routes: { id: string; name: string; location: string }[];
  defaultRouteId?: string | null;
  mode?: "add" | "edit";
  initialAsset?: Partial<AssetWizardResult> & { components?: ComponentDraft[] };
}) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");

  const [name, setName] = useState(initialAsset?.name ?? "");
  const [tag, setTag] = useState(initialAsset?.tag ?? "");
  const [assetType, setAssetType] = useState(initialAsset?.asset_type ?? "Pump");
  const [criticality, setCriticality] = useState<Criticality>(initialAsset?.criticality ?? "Medium");
  const [location, setLocation] = useState(initialAsset?.location ?? "");
  const [routeId, setRouteId] = useState(initialAsset?.route_id ?? defaultRouteId ?? routes[0]?.id ?? "");

  const [rpm, setRpm] = useState(initialAsset?.rpm != null ? String(initialAsset.rpm) : "");
  const [hp, setHp] = useState(initialAsset?.horsepower != null ? String(initialAsset.horsepower) : "");
  const [kw, setKw] = useState(initialAsset?.kw != null ? String(initialAsset.kw) : "");
  const [make, setMake] = useState(initialAsset?.make ?? "");
  const [model, setModel] = useState(initialAsset?.model ?? "");
  const [serial, setSerial] = useState(initialAsset?.serial_number ?? "");
  const [installDate, setInstallDate] = useState(initialAsset?.installation_date ?? "");
  const [voltage, setVoltage] = useState(initialAsset?.voltage != null ? String(initialAsset.voltage) : "");
  const [amps, setAmps] = useState(initialAsset?.amps != null ? String(initialAsset.amps) : "");
  const [coupling, setCoupling] = useState(initialAsset?.coupling_type ?? "Flexible");
  const [lube, setLube] = useState(initialAsset?.lubrication_type ?? "Grease");
  const [bearingDe, setBearingDe] = useState(initialAsset?.bearing_de ?? "");
  const [bearingNde, setBearingNde] = useState(initialAsset?.bearing_nde ?? "");
  const [fanBlades, setFanBlades] = useState(initialAsset?.fan_blades != null ? String(initialAsset.fan_blades) : "");
  const [gearTeeth, setGearTeeth] = useState(initialAsset?.gear_teeth != null ? String(initialAsset.gear_teeth) : "");

  const [components, setComponents] = useState<ComponentDraft[]>(
    () => initialAsset?.components?.length ? initialAsset.components : []
  );
  const [editingCompIdx, setEditingCompIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!location && routeId) {
      const r = routes.find((x) => x.id === routeId);
      if (r?.location) setLocation(r.location);
    }
  }, [routeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = ["Basic Info", "Technical Specs", "Components", "Collection Points", "Review & Save"];

  const buildResult = (): AssetWizardResult => ({
    name: name.trim(),
    tag: tag.trim(),
    asset_type: assetType,
    criticality,
    location: location.trim(),
    route_id: routeId,
    rpm: numOrNull(rpm),
    horsepower: numOrNull(hp),
    kw: numOrNull(kw),
    make: make.trim(),
    model: model.trim(),
    serial_number: serial.trim(),
    installation_date: installDate,
    voltage: numOrNull(voltage),
    amps: numOrNull(amps),
    coupling_type: coupling,
    lubrication_type: lube,
    fan_blades: numOrNull(fanBlades),
    gear_teeth: numOrNull(gearTeeth),
    bearing_de: bearingDe.trim() || null,
    bearing_nde: bearingNde.trim() || null,
    components
  });

  const validateStep = () => {
    setError("");
    if (step === 0) {
      if (!name.trim()) {
        setError("Asset name is required.");
        return false;
      }
      if (!tag.trim()) {
        setError("Tag ID is required.");
        return false;
      }
      if (!routeId) {
        setError("Select a route.");
        return false;
      }
    }
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    if (step === 2 && components.length === 0) {
      // allow empty but warn
    }
    setStep((s) => Math.min(4, s + 1));
  };

  const back = () => setStep((s) => Math.max(0, s - 1));

  const allPoints = useMemo(
    () => components.flatMap((c) => c.collection_points.map((p) => ({ ...p, parent: c.name }))),
    [components]
  );

  return (
    <ModalShell
      title={mode === "edit" ? "Edit Asset" : "Add Asset Wizard"}
      subtitle={`Step ${step + 1} of 5 — ${steps[step]}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="min-h-[40px] px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-slate-300 cursor-pointer mr-auto">
            Cancel
          </button>
          {step > 0 && (
            <button type="button" onClick={back} className="min-h-[40px] px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-slate-200 inline-flex items-center gap-1 cursor-pointer">
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </button>
          )}
          {step < 4 ? (
            <button type="button" onClick={next} className="min-h-[40px] px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold inline-flex items-center gap-1 cursor-pointer">
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!validateStep()) return;
                onSave(buildResult());
              }}
              className="min-h-[40px] px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold cursor-pointer"
            >
              {mode === "edit" ? "Save Changes" : "Create Asset"}
            </button>
          )}
        </>
      }
    >
      {/* Step indicators */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {steps.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              if (i < step || validateStep()) setStep(i);
            }}
            className={`text-[10px] font-bold px-2 py-1 rounded-lg border cursor-pointer ${
              i === step ? "bg-amber-400 text-slate-950 border-amber-400" : i < step ? "border-amber-400/40 text-amber-300" : "border-slate-700 text-slate-500"
            }`}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      {step === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Asset Name" required>
            <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Tag ID" required>
            <input className={INPUT} value={tag} onChange={(e) => setTag(e.target.value)} placeholder="P-101A" />
          </FormField>
          <FormField label="Asset Type" required>
            <select className={SELECT} value={assetType} onChange={(e) => setAssetType(e.target.value)}>
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Criticality" required>
            <select className={SELECT} value={criticality} onChange={(e) => setCriticality(e.target.value as Criticality)}>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </FormField>
          <FormField label="Route / System" required>
            <select className={SELECT} value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Location">
            <input className={INPUT} value={location} onChange={(e) => setLocation(e.target.value)} />
          </FormField>
        </div>
      )}

      {step === 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="RPM"><input type="number" className={INPUT} value={rpm} onChange={(e) => setRpm(e.target.value)} /></FormField>
          <FormField label="Horsepower"><input type="number" className={INPUT} value={hp} onChange={(e) => setHp(e.target.value)} /></FormField>
          <FormField label="Power (kW)"><input type="number" className={INPUT} value={kw} onChange={(e) => setKw(e.target.value)} /></FormField>
          <FormField label="Voltage"><input type="number" className={INPUT} value={voltage} onChange={(e) => setVoltage(e.target.value)} /></FormField>
          <FormField label="Amps"><input type="number" className={INPUT} value={amps} onChange={(e) => setAmps(e.target.value)} /></FormField>
          <FormField label="Installation Date"><input type="date" className={INPUT} value={installDate} onChange={(e) => setInstallDate(e.target.value)} /></FormField>
          <FormField label="Manufacturer"><input className={INPUT} value={make} onChange={(e) => setMake(e.target.value)} /></FormField>
          <FormField label="Model Number"><input className={INPUT} value={model} onChange={(e) => setModel(e.target.value)} /></FormField>
          <FormField label="Serial Number" className="sm:col-span-2"><input className={INPUT} value={serial} onChange={(e) => setSerial(e.target.value)} /></FormField>
          <FormField label="Bearing DE"><input className={INPUT} list="bearing-suggestions" value={bearingDe} onChange={(e) => setBearingDe(e.target.value)} /></FormField>
          <FormField label="Bearing NDE"><input className={INPUT} list="bearing-suggestions" value={bearingNde} onChange={(e) => setBearingNde(e.target.value)} /></FormField>
          <FormField label="Coupling Type">
            <select className={SELECT} value={coupling} onChange={(e) => setCoupling(e.target.value)}>
              {COUPLING_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Lubrication">
            <select className={SELECT} value={lube} onChange={(e) => setLube(e.target.value)}>
              {LUBE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Fan Blades"><input type="number" className={INPUT} value={fanBlades} onChange={(e) => setFanBlades(e.target.value)} /></FormField>
          <FormField label="Gear Teeth"><input type="number" className={INPUT} value={gearTeeth} onChange={(e) => setGearTeeth(e.target.value)} /></FormField>
          <datalist id="bearing-suggestions">
            {BEARING_SUGGESTIONS.map((b) => <option key={b} value={b} />)}
          </datalist>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-400">Add Motor DE / NDE, Pump DE / NDE, etc.</p>
            <button
              type="button"
              onClick={() => {
                setComponents((prev) => [...prev, emptyComponent()]);
                setEditingCompIdx(components.length);
              }}
              className="min-h-[32px] px-2.5 rounded-lg bg-amber-400/10 border border-amber-400/40 text-amber-300 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add Component
            </button>
          </div>
          {components.length === 0 && (
            <p className="text-sm text-slate-500 border border-dashed border-slate-700 rounded-xl p-6 text-center">
              No components yet. Add Motor DE, Motor NDE, Pump DE, Pump NDE…
            </p>
          )}
          <ul className="space-y-2">
            {components.map((c, i) => (
              <li key={c.id} className="rounded-xl border border-slate-700 bg-slate-950/50 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <button type="button" onClick={() => setEditingCompIdx(editingCompIdx === i ? null : i)} className="text-left min-w-0 cursor-pointer">
                    <p className="text-sm font-bold text-white truncate">{c.name || c.component_type}</p>
                    <p className="text-[10px] text-slate-500">{c.component_type} · {c.collection_points.length} points</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setComponents((prev) => prev.filter((_, j) => j !== i))}
                    className="text-[10px] font-bold text-red-400 cursor-pointer px-2"
                  >
                    Remove
                  </button>
                </div>
                {editingCompIdx === i && (
                  <div className="border-t border-slate-700 p-3">
                    <ComponentSpecFields
                      value={c}
                      showPointsPreview
                      onChange={(next) => setComponents((prev) => prev.map((x, j) => (j === i ? next : x)))}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Standard points were auto-generated from component types. Customize names or quality as needed.
          </p>
          {allPoints.length === 0 ? (
            <p className="text-sm text-slate-500 border border-dashed border-slate-700 rounded-xl p-6 text-center">
              Add components in Step 3 to generate collection points.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-700">
              <table className="w-full text-xs text-left min-w-[520px]">
                <thead className="bg-slate-950 text-slate-500 uppercase">
                  <tr className="border-b border-slate-700">
                    <th className="px-2 py-2">Point</th>
                    <th className="px-2 py-2">Component</th>
                    <th className="px-2 py-2">Direction</th>
                    <th className="px-2 py-2">Quality</th>
                    <th className="px-2 py-2">ISO</th>
                  </tr>
                </thead>
                <tbody>
                  {components.map((c, ci) =>
                    c.collection_points.map((p, pi) => (
                      <tr key={p.id} className="border-b border-slate-800">
                        <td className="px-2 py-1.5">
                          <input
                            className="w-full bg-transparent border border-transparent hover:border-slate-600 rounded px-1 text-white"
                            value={p.name}
                            onChange={(e) => {
                              const v = e.target.value;
                              setComponents((prev) =>
                                prev.map((comp, i) =>
                                  i !== ci
                                    ? comp
                                    : {
                                        ...comp,
                                        collection_points: comp.collection_points.map((pt, j) =>
                                          j === pi ? { ...pt, name: v } : pt
                                        )
                                      }
                                )
                              );
                            }}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-slate-400">{c.name}</td>
                        <td className="px-2 py-1.5 text-slate-400">{p.direction}</td>
                        <td className="px-2 py-1.5">
                          <select
                            className="bg-slate-950 border border-slate-700 rounded px-1 text-slate-200"
                            value={p.quality}
                            onChange={(e) => {
                              const v = e.target.value as PointQuality;
                              setComponents((prev) =>
                                prev.map((comp, i) =>
                                  i !== ci
                                    ? comp
                                    : {
                                        ...comp,
                                        collection_points: comp.collection_points.map((pt, j) =>
                                          j === pi ? { ...pt, quality: v } : pt
                                        )
                                      }
                                )
                              );
                            }}
                          >
                            <option>Ideal</option>
                            <option>Acceptable</option>
                            <option>Not Recommended</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5 text-slate-500">{p.iso_reference}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3 text-sm">
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 grid grid-cols-2 gap-2">
            <SummaryRow label="Name" value={name} />
            <SummaryRow label="Tag" value={tag} />
            <SummaryRow label="Type" value={assetType} />
            <SummaryRow label="Criticality" value={criticality} />
            <SummaryRow label="Route" value={routes.find((r) => r.id === routeId)?.name ?? "—"} />
            <SummaryRow label="Location" value={location || "—"} />
            <SummaryRow label="RPM" value={rpm || "—"} />
            <SummaryRow label="HP / kW" value={`${hp || "—"} / ${kw || "—"}`} />
            <SummaryRow label="Make / Model" value={`${make || "—"} ${model}`.trim()} />
            <SummaryRow label="Serial" value={serial || "—"} />
          </div>
          <p className="text-xs text-slate-400">
            <span className="font-bold text-white">{components.length}</span> components ·{" "}
            <span className="font-bold text-white">{allPoints.length}</span> collection points
          </p>
          <ul className="text-xs text-slate-400 space-y-1 max-h-40 overflow-y-auto">
            {components.map((c) => (
              <li key={c.id}>
                <span className="text-slate-200 font-medium">{c.name}</span> — {c.collection_points.length} points
                {c.bearing_de ? ` · DE ${c.bearing_de}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </ModalShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-slate-500 uppercase">{label}</p>
      <p className="text-white font-semibold truncate">{value || "—"}</p>
    </div>
  );
}
