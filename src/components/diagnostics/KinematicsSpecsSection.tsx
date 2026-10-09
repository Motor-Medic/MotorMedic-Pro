import { ChevronDown, Factory, Layers, Tag } from "lucide-react";
import {
  BASE_COMPONENT_TYPES,
  type FieldDef,
  type SpecTabId
} from "../CreateComponentModal";
import { paramLabel, paramSelect } from "./intakeSectionStyles";

const MACHINE_MOUNTING_TYPES = ["Foot-mounted", "Flange-mounted", "Baseplate"] as const;
const COUPLING_TYPES = ["Flexible", "Rigid", "Gear", "Universal Joint"] as const;
const DRIVE_TYPES = ["Direct Drive", "Belt Drive", "Gear Drive"] as const;

export interface KinematicsSpecsSectionProps {
  specName: string;
  setSpecName: (value: string) => void;
  componentType: string;
  handleComponentTypeChange: (type: string) => void;
  showCustomType: boolean;
  customComponentType: string;
  setCustomComponentType: (value: string) => void;
  manufacturer: string;
  setManufacturer: (value: string) => void;
  specTabs: { id: SpecTabId; label: string }[];
  specTab: SpecTabId;
  setSpecTab: (tab: SpecTabId) => void;
  activeSpecFields: FieldDef[];
  machineSpecs: Record<string, string>;
  patchMachineSpec: (key: string, value: string) => void;
  machineMountingType: string;
  setMachineMountingType: (value: string) => void;
  couplingType: string;
  setCouplingType: (value: string) => void;
  driveType: string;
  setDriveType: (value: string) => void;
  bearingType: string;
  vibRpm: string;
  motorHp: string;
  isoZone: string;
}

export default function KinematicsSpecsSection({
  specName,
  setSpecName,
  componentType,
  handleComponentTypeChange,
  showCustomType,
  customComponentType,
  setCustomComponentType,
  manufacturer,
  setManufacturer,
  specTabs,
  specTab,
  setSpecTab,
  activeSpecFields,
  machineSpecs,
  patchMachineSpec,
  machineMountingType,
  setMachineMountingType,
  couplingType,
  setCouplingType,
  driveType,
  setDriveType,
  bearingType,
  vibRpm,
  motorHp,
  isoZone
}: KinematicsSpecsSectionProps) {
  return (
    <section className="bg-slate-900/50 border border-white/80 rounded-xl p-6 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Equipment Specifications</h2>
        <p className="text-sm text-slate-400 mt-0.5">Fault-frequency calculation inputs</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
        <label className="block min-w-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
            Name / Label
          </span>
          <div className="relative">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <input
              value={specName}
              onChange={(e) => setSpecName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all outline-none"
              placeholder="e.g., Motor DE"
            />
          </div>
        </label>
        <label className="block min-w-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
            Component Type
          </span>
          <div className="relative">
            <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <select
              value={componentType}
              onChange={(e) => handleComponentTypeChange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-10 py-2.5 text-sm text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all outline-none appearance-none cursor-pointer"
            >
              {BASE_COMPONENT_TYPES.filter((t) => t !== "Other").map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
              <option value="Other">Other</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
          </div>
          {showCustomType && (
            <input
              value={customComponentType}
              onChange={(e) => setCustomComponentType(e.target.value)}
              placeholder="Enter custom component type..."
              className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all outline-none"
            />
          )}
        </label>
        <label className="block min-w-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
            Manufacturer
          </span>
          <div className="relative">
            <Factory className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <input
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all outline-none"
              placeholder="e.g., SKF / Siemens"
            />
          </div>
        </label>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 border-b border-slate-800 pb-2">
        {specTabs.map((t) => {
          const on = specTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSpecTab(t.id)}
              className={`px-4 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                on
                  ? "bg-yellow-500 text-slate-900 font-bold"
                  : "bg-transparent text-slate-400 border border-slate-700 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {activeSpecFields.map((field) => (
          <div key={field.key}>
            <InlineSpecField
              field={field}
              value={machineSpecs[field.key] ?? ""}
              onChange={(v) => patchMachineSpec(field.key, v)}
            />
          </div>
        ))}
        {activeSpecFields.length === 0 && (
          <p className="text-xs text-slate-500 md:col-span-2">No fields for this tab.</p>
        )}
      </div>

      <div className="pt-4 border-t border-slate-800 space-y-3">
        <div>
          <h3 className="text-xs font-bold text-white tracking-tight">Machine Configuration</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">Mounting, coupling, and drive arrangement</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block min-w-0">
            <span className={paramLabel}>Mounting Type</span>
            <div className="relative">
              <select
                value={machineMountingType}
                onChange={(e) => setMachineMountingType(e.target.value)}
                className={paramSelect}
              >
                {MACHINE_MOUNTING_TYPES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
          </label>
          <label className="block min-w-0">
            <span className={paramLabel}>Coupling Type</span>
            <div className="relative">
              <select
                value={couplingType}
                onChange={(e) => setCouplingType(e.target.value)}
                className={paramSelect}
              >
                {COUPLING_TYPES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
          </label>
          <label className="block min-w-0">
            <span className={paramLabel}>Drive Type</span>
            <div className="relative">
              <select
                value={driveType}
                onChange={(e) => setDriveType(e.target.value)}
                className={paramSelect}
              >
                {DRIVE_TYPES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
          </label>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-800">
        Live summary:{" "}
        <span className="text-slate-300 font-semibold">
          {bearingType} • {vibRpm} RPM • {motorHp} HP • {isoZone}
          {showCustomType && customComponentType ? ` • ${customComponentType}` : ""}
        </span>
      </p>
    </section>
  );
}

function InlineSpecField({
  field,
  value,
  onChange
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const inputCls =
    "w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all outline-none";
  return (
    <label className="block min-w-0">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
        {field.label}
        {field.required ? <span className="text-yellow-400 ml-0.5">*</span> : null}
      </span>
      {field.kind === "select" ? (
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputCls} appearance-none cursor-pointer pr-10`}
          >
            <option value="">Select…</option>
            {(field.options ?? []).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
        </div>
      ) : (
        <input
          type={field.kind === "number" ? "number" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={inputCls}
        />
      )}
    </label>
  );
}
