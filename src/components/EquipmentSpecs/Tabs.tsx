import React, { useMemo } from "react";
import { 
  Sliders, 
  HelpCircle, 
  Zap, 
  Settings as GearIcon, 
  Wind, 
  Link as ChainIcon, 
  Gauge, 
  Info,
  Layers,
  Disc,
  AlertCircle
} from "lucide-react";

interface TabProps {
  specs: Record<string, string>;
  handleSpecChange: (key: string, value: string) => void;
  equipmentType: string;
}

// Simple Tooltip Helper Component (Touch-friendly and accessible)
export function HelpTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-block ml-1 cursor-pointer align-middle">
      <HelpCircle className="w-3.5 h-3.5 text-slate-500 hover:text-yellow-400 transition-colors" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-950 border border-slate-800 text-[10px] text-slate-300 rounded-lg p-2 font-sans leading-relaxed shadow-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100 z-50 text-center">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-950"></span>
      </span>
    </span>
  );
}

// Highly interactive SmartSelect Component with "Other / Custom" option,
// text specify input, onBlur/Enter endpoint fetching, AI specification generation & caching,
// and Standard vs AI-Generated visual badges.
export function SmartSelect({
  label,
  value,
  onChange,
  options,
  specKey,
  specs,
  handleSpecChange,
  helpText
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: Array<{ value: string; label: string }>;
  specKey: string;
  specs: Record<string, string>;
  handleSpecChange: (key: string, value: string) => void;
  helpText?: string;
}) {
  const isCustom = specs[specKey + "_is_custom"] === "true" || value === "custom_other" || (!options.some(o => o.value === value) && value !== "");
  const customVal = specs[specKey + "_custom_val"] || (isCustom ? value : "");
  const source = specs[specKey + "_source"] || "";
  
  const [typedVal, setTypedVal] = useState(customVal);

  // Sync state if external change happens
  React.useEffect(() => {
    setTypedVal(customVal);
  }, [customVal]);

  const triggerFetch = async (val: string) => {
    if (!val.trim()) return;
    try {
      const res = await fetch("/api/get-component-specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentType: val })
      });
      if (res.ok) {
        const data = await res.json();
        handleSpecChange(specKey + "_source", data.source || "cached");
        if (Array.isArray(data.specs)) {
          handleSpecChange(specKey + "_fields", JSON.stringify(data.specs));
          data.specs.forEach((field: string) => {
            const keyName = field.toLowerCase().replace(/[^a-z0-9]+/g, "_");
            if (specs[keyName] === undefined) {
              handleSpecChange(keyName, "");
            }
          });
        }
      }
    } catch (err) {
      console.error("Error fetching custom specs:", err);
    }
  };

  const handleBlurOrEnter = () => {
    if (typedVal !== customVal) {
      handleSpecChange(specKey + "_custom_val", typedVal);
      handleSpecChange(specKey, typedVal);
      triggerFetch(typedVal);
    }
  };

  const parsedFields = (() => {
    try {
      const fieldsStr = specs[specKey + "_fields"];
      return fieldsStr ? JSON.parse(fieldsStr) : [];
    } catch {
      return [];
    }
  })();

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
          {label}
          {helpText && <HelpTooltip text={helpText} />}
        </label>
        {isCustom && source && (
          <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded ${
            source === "ai-generated" ? "bg-purple-500/10 text-purple-400 border border-purple-500/10" : "bg-blue-500/10 text-blue-400 border border-blue-500/10"
          }`}>
            {source === "ai-generated" ? "✨ AI-Generated" : "📋 Standard"}
          </span>
        )}
      </div>

      <select
        value={isCustom ? "custom_other" : value}
        onChange={e => {
          const val = e.target.value;
          if (val === "custom_other") {
            handleSpecChange(specKey + "_is_custom", "true");
            onChange("");
          } else {
            handleSpecChange(specKey + "_is_custom", "false");
            handleSpecChange(specKey + "_source", "");
            handleSpecChange(specKey + "_fields", "");
            onChange(val);
          }
        }}
        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-mono outline-none focus:border-yellow-400 cursor-pointer"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
        <option value="custom_other">Other / Custom</option>
      </select>

      {isCustom && (
        <div className="mt-2 space-y-2 pl-3 border-l-2 border-yellow-400/30">
          <div className="space-y-1">
            <span className="text-[9px] font-mono text-slate-500 block uppercase">Please specify custom {label}</span>
            <input
              type="text"
              value={typedVal}
              onChange={e => setTypedVal(e.target.value)}
              onBlur={handleBlurOrEnter}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  handleBlurOrEnter();
                }
              }}
              placeholder={`Enter custom ${label.toLowerCase()}...`}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs outline-none focus:border-yellow-400"
            />
          </div>

          {parsedFields.length > 0 && (
            <div className="space-y-2 mt-2 pt-2 border-t border-slate-900">
              <span className="text-[9px] font-mono text-slate-400 block uppercase tracking-wider">
                {typedVal || "Custom"} Specifications:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {parsedFields.map((field: string) => {
                  const keyName = field.toLowerCase().replace(/[^a-z0-9]+/g, "_");
                  return (
                    <div key={field} className="space-y-1">
                      <label className="text-[9px] font-mono text-slate-500 uppercase block">
                        {field}
                      </label>
                      <input
                        type="text"
                        value={specs[keyName] || ""}
                        onChange={e => handleSpecChange(keyName, e.target.value)}
                        placeholder={`Enter value`}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white font-mono text-xs outline-none focus:border-yellow-400"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Add state hook import at top for SmartSelect
import { useState } from "react";

// ==========================================
// 1. CORE SPECS TAB
// ==========================================
export function CoreSpecsTab({ specs, handleSpecChange }: TabProps) {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850/60 space-y-4">
        <h4 className="text-[10px] font-mono font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-900 pb-2">
          <Sliders className="w-3.5 h-3.5 text-yellow-400" />
          General & Boundary Specifications
        </h4>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          {/* Operating Speed (RPM) */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
              Operating Speed (RPM) <span className="text-red-500">*</span>
              <HelpTooltip text="Nominal design or actual running shaft speed under load. Used to scale frequency spectra." />
            </label>
            <input 
              type="number" 
              required
              value={specs.specRpm || ""} 
              onChange={e => handleSpecChange("specRpm", e.target.value)}
              placeholder="E.g., 1750"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
            />
          </div>

          {/* Machine Orientation */}
          <SmartSelect
            label="Machine Orientation"
            value={specs.gravitySpecs || "Horizontal"}
            onChange={val => handleSpecChange("gravitySpecs", val)}
            options={[
              { value: "Horizontal", label: "Horizontal" },
              { value: "Vertical", label: "Vertical" },
              { value: "Angular", label: "Angular / Suspended" }
            ]}
            specKey="gravitySpecs"
            specs={specs}
            handleSpecChange={handleSpecChange}
            helpText="Structural mounting direction. Affects gravity loading and vibration axial sensitivity."
          />

          {/* Drive Mode */}
          <SmartSelect
            label="Drive Mode"
            value={specs.driveType || "Direct Coupled"}
            onChange={val => handleSpecChange("driveType", val)}
            options={[
              { value: "Direct Coupled", label: "Direct Coupled" },
              { value: "Belt Drive", label: "Belt Drive" },
              { value: "Gear Drive", label: "Gear Drive" }
            ]}
            specKey="driveType"
            specs={specs}
            handleSpecChange={handleSpecChange}
            helpText="The physical coupling type of the machine power transmission. Conditionally enables Gear or Belt tabs."
          />

          {/* Asset Criticality */}
          <SmartSelect
            label="Asset Criticality"
            value={specs.assetCriticality || "Standard"}
            onChange={val => handleSpecChange("assetCriticality", val)}
            options={[
              { value: "Critical", label: "Critical (Class I / High Ingress)" },
              { value: "Important", label: "Important (Class II / Process Core)" },
              { value: "Standard", label: "Standard (Class III / Auxiliary)" },
              { value: "Non-Critical", label: "Non-Critical (Class IV / Run to Fail)" }
            ]}
            specKey="assetCriticality"
            specs={specs}
            handleSpecChange={handleSpecChange}
            helpText="Defines reliability focus. Highly critical assets trigger tighter warning and shutdown thresholds."
          />

          {/* Power Rating */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
              Power Rating (HP/kW)
              <HelpTooltip text="Machine electrical or shaft power rating. Used to categorize machine class under ISO 10816 standards." />
            </label>
            <input 
              type="text" 
              value={specs.powerRating || ""} 
              onChange={e => handleSpecChange("powerRating", e.target.value)}
              placeholder="E.g., 150 kW"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
            />
          </div>

          {/* Manufacturer */}
          <SmartSelect
            label="OEM Manufacturer"
            value={specs.manufacturer || "Baldor"}
            onChange={val => handleSpecChange("manufacturer", val)}
            options={[
              { value: "Baldor", label: "Baldor Electric" },
              { value: "Sulzer", label: "Sulzer Pumps" },
              { value: "SKF", label: "SKF Group" },
              { value: "Siemens", label: "Siemens AG" },
              { value: "General Electric", label: "General Electric (GE)" },
              { value: "WEG", label: "WEG Motors" }
            ]}
            specKey="manufacturer"
            specs={specs}
            handleSpecChange={handleSpecChange}
            helpText="Original Equipment Manufacturer name to identify custom bearing profiles."
          />
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. BEARINGS TAB
// ==========================================
export function BearingsTab({ specs, handleSpecChange }: TabProps) {
  const numBearings = parseInt(specs.numBearings || "2") || 2;

  const handleNumBearingsChange = (val: number) => {
    handleSpecChange("numBearings", String(Math.max(1, Math.min(8, val))));
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850/60 space-y-4">
        <div className="flex justify-between items-center border-b border-slate-900 pb-2">
          <h4 className="text-[10px] font-mono font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-1.5">
            <Disc className="w-3.5 h-3.5 text-yellow-400 animate-spin-slow" />
            Bearing Housing & Geometry Details
          </h4>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-400">Total Bearings:</span>
            <input 
              type="number" 
              min={1} 
              max={8}
              value={numBearings}
              onChange={e => handleNumBearingsChange(parseInt(e.target.value) || 1)}
              className="w-14 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-center text-yellow-400 font-bold font-mono text-xs outline-none focus:border-yellow-400"
            />
          </div>
        </div>

        {/* Global Bearing Specs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-950/30 p-3 rounded-lg border border-slate-900/50">
          <SmartSelect
            label="Primary Bearing Type"
            value={specs.bearingType || "Ball"}
            onChange={val => handleSpecChange("bearingType", val)}
            options={[
              { value: "Ball", label: "Rolling Element - Ball" },
              { value: "Roller", label: "Rolling Element - Cylindrical Roller" },
              { value: "Sleeve", label: "Fluid Film / Journal Sleeve" },
              { value: "Thrust", label: "Thrust Bearing" }
            ]}
            specKey="bearingType"
            specs={specs}
            handleSpecChange={handleSpecChange}
          />

          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Standard Part Model / Brand</label>
            <input 
              type="text" 
              value={specs.bearingModel || ""} 
              onChange={e => handleSpecChange("bearingModel", e.target.value)}
              placeholder="E.g., SKF 6314 C3"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
            />
          </div>
        </div>

        {/* Dynamic Bearings Loop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: numBearings }).map((_, idx) => {
            const locKey = `bearing_${idx}_location`;
            const numKey = `bearing_${idx}_number`;
            const elemKey = `bearing_${idx}_elements`;
            const pitchKey = `bearing_${idx}_pitch`;
            const diaKey = `bearing_${idx}_diameter`;
            const angKey = `bearing_${idx}_angle`;

            return (
              <div key={idx} className="bg-slate-950/60 border border-slate-900 p-4 rounded-xl space-y-3 relative">
                <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                  <span className="text-[10px] font-mono font-bold text-yellow-400 uppercase tracking-wider">
                    Bearing #{idx + 1} Configuration
                  </span>
                  <span className="text-[8px] bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-400 font-mono">
                    Node ID: B-{idx + 1}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <SmartSelect
                    label="Location"
                    value={specs[locKey] || (idx === 0 ? "Drive End" : "Non-Drive End")}
                    onChange={val => handleSpecChange(locKey, val)}
                    options={[
                      { value: "Drive End", label: "Drive End (DE)" },
                      { value: "Non-Drive End", label: "Non-Drive End (NDE)" },
                      { value: "Inboard", label: "Inboard (IB)" },
                      { value: "Outboard", label: "Outboard (OB)" }
                    ]}
                    specKey={locKey}
                    specs={specs}
                    handleSpecChange={handleSpecChange}
                  />

                  <div className="space-y-1">
                    <label className="text-[9px] font-mono text-slate-500 uppercase block">Bearing Number</label>
                    <input 
                      type="text" 
                      value={specs[numKey] || ""}
                      onChange={e => handleSpecChange(numKey, e.target.value)}
                      placeholder="E.g., 6205-2RS"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-mono text-slate-500 uppercase block">Rolling Elements</label>
                    <input 
                      type="number" 
                      value={specs[elemKey] || ""}
                      onChange={e => handleSpecChange(elemKey, e.target.value)}
                      placeholder="E.g., 9"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-mono text-slate-500 uppercase block">Pitch Dia. (mm/in)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={specs[pitchKey] || ""}
                      onChange={e => handleSpecChange(pitchKey, e.target.value)}
                      placeholder="E.g., 52.0"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-mono text-slate-500 uppercase block">Element Dia. (mm/in)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={specs[diaKey] || ""}
                      onChange={e => handleSpecChange(diaKey, e.target.value)}
                      placeholder="E.g., 7.94"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-mono text-slate-500 uppercase block">Contact Angle (°)</label>
                    <input 
                      type="number" 
                      value={specs[angKey] || ""}
                      onChange={e => handleSpecChange(angKey, e.target.value)}
                      placeholder="E.g., 0"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 3. GEARBOX TAB
// ==========================================
interface GearboxTabProps extends TabProps {
  numShafts: number;
  setNumShafts: (val: number) => void;
  shafts: Array<{
    name: string;
    teeth: string;
    rpm: string;
    type: string;
  }>;
  setShafts: React.Dispatch<React.SetStateAction<Array<{
    name: string;
    teeth: string;
    rpm: string;
    type: string;
  }>>>;
}

export function GearboxTab({ 
  specs, 
  handleSpecChange, 
  numShafts, 
  setNumShafts, 
  shafts, 
  setShafts 
}: GearboxTabProps) {
  
  const numStages = parseInt(specs.numStages || "1") || 1;

  // Compute live gear ratio between adjacent shafts if they have RPMs defined
  const gearRatios = useMemo(() => {
    const ratios: string[] = [];
    for (let i = 0; i < shafts.length - 1; i++) {
      const rpm1 = parseFloat(shafts[i].rpm);
      const rpm2 = parseFloat(shafts[i + 1].rpm);
      if (rpm1 > 0 && rpm2 > 0) {
        const ratio = (rpm1 / rpm2).toFixed(2);
        ratios.push(`${shafts[i].name} ➔ ${shafts[i+1].name}: ${ratio}:1`);
      }
    }
    return ratios;
  }, [shafts]);

  const handleNumStagesChange = (val: number) => {
    handleSpecChange("numStages", String(Math.max(1, Math.min(4, val))));
  };

  const handleNumShaftsChange = (val: number) => {
    const newNum = Math.max(1, Math.min(6, val));
    setNumShafts(newNum);
    
    // Sync shafts array length
    setShafts(prev => {
      const updated = [...prev];
      if (updated.length < newNum) {
        for (let i = updated.length; i < newNum; i++) {
          let name = `Intermediate Shaft ${i}`;
          if (i === newNum - 1) name = "Output Shaft";
          updated.push({
            name,
            teeth: "30",
            rpm: "1000",
            type: "Spur"
          });
        }
      } else if (updated.length > newNum) {
        return updated.slice(0, newNum);
      }
      return updated;
    });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850/60 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-900 pb-3">
          <h4 className="text-[10px] font-mono font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-1.5">
            <GearIcon className="w-3.5 h-3.5 text-yellow-400 animate-spin-slow" />
            Gear Mesh & Shaft Configuration
          </h4>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-slate-400">Stages (1-4):</span>
              <input 
                type="number" 
                min={1} 
                max={4}
                value={numStages}
                onChange={e => handleNumStagesChange(parseInt(e.target.value) || 1)}
                className="w-12 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-center text-yellow-400 font-bold font-mono text-xs outline-none focus:border-yellow-400"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-slate-400">Shafts (1-6):</span>
              <input 
                type="number" 
                min={1} 
                max={6}
                value={numShafts}
                onChange={e => handleNumShaftsChange(parseInt(e.target.value) || 1)}
                className="w-12 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-center text-yellow-400 font-bold font-mono text-xs outline-none focus:border-yellow-400"
              />
            </div>
          </div>
        </div>

        {/* Live calculated Gear Ratios */}
        {gearRatios.length > 0 && (
          <div className="p-3 bg-yellow-400/5 border border-yellow-400/20 rounded-xl space-y-1.5">
            <span className="text-[9px] font-mono font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-1">
              <Info className="w-3 h-3" /> Live Gear Ratio Calculations
            </span>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-300 font-mono">
              {gearRatios.map((ratio, index) => (
                <span key={index} className="bg-slate-950 px-2 py-0.5 rounded border border-slate-900">
                  {ratio}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Dynamic Shaft Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {shafts.map((shaft, idx) => {
            const rpm = parseFloat(shaft.rpm) || 0;
            const teeth = parseInt(shaft.teeth) || 0;
            const gmfHz = (rpm * teeth) / 60;

            return (
              <div key={idx} className="bg-slate-950/60 border border-slate-900 p-4 rounded-xl space-y-3 relative overflow-hidden">
                <div className="flex justify-between items-center border-b border-slate-900 pb-1.5">
                  <input 
                    type="text" 
                    value={shaft.name}
                    onChange={e => {
                      const newName = e.target.value;
                      setShafts(prev => prev.map((s, sIdx) => sIdx === idx ? { ...s, name: newName } : s));
                    }}
                    className="bg-transparent text-[10px] font-mono font-bold text-yellow-400 uppercase tracking-wider border-b border-transparent focus:border-yellow-400 outline-none w-2/3"
                  />
                  <span className="text-[8px] bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded text-yellow-400 font-mono">
                    GMF: {gmfHz.toFixed(1)} Hz
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <label className="text-[8px] font-mono text-slate-500 uppercase block mb-1">Gear Teeth</label>
                    <input 
                      type="number" 
                      value={shaft.teeth}
                      onChange={e => {
                        const newTeeth = e.target.value;
                        setShafts(prev => prev.map((s, sIdx) => sIdx === idx ? { ...s, teeth: newTeeth } : s));
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white font-mono outline-none focus:border-yellow-400"
                    />
                  </div>

                  <div>
                    <label className="text-[8px] font-mono text-slate-500 uppercase block mb-1">Shaft RPM</label>
                    <input 
                      type="number" 
                      value={shaft.rpm}
                      onChange={e => {
                        const newRpm = e.target.value;
                        setShafts(prev => prev.map((s, sIdx) => sIdx === idx ? { ...s, rpm: newRpm } : s));
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white font-mono outline-none focus:border-yellow-400"
                    />
                  </div>

                  <div className="col-span-1">
                    <SmartSelect
                      label="Gear Type"
                      value={shaft.type || "Spur"}
                      onChange={val => {
                        setShafts(prev => prev.map((s, sIdx) => sIdx === idx ? { ...s, type: val } : s));
                      }}
                      options={[
                        { value: "Spur", label: "Spur" },
                        { value: "Helical", label: "Helical" },
                        { value: "Bevel", label: "Bevel" },
                        { value: "Worm", label: "Worm" },
                        { value: "Herringbone", label: "Herringbone" }
                      ]}
                      specKey={`shaft_${idx}_type`}
                      specs={specs}
                      handleSpecChange={handleSpecChange}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 4. FANS / IMPELLERS / PUMPS TAB
// ==========================================
export function FansImpellersTab({ specs, handleSpecChange, equipmentType }: TabProps) {
  const isPump = equipmentType === "Pump Unit" || equipmentType === "Pump";
  const blades = parseInt(specs.numBlades || specs.impellerVanes || specs.fanBlades || (isPump ? "5" : "8")) || (isPump ? 5 : 8);
  const rpm = parseFloat(specs.specRpm || "1750") || 1750;
  
  // LIVE calculation of Blade/Vane Pass Frequency
  const bpfHz = (rpm * blades) / 60;
  const bpfCpm = rpm * blades;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850/60 space-y-4">
        <h4 className="text-[10px] font-mono font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-900 pb-2">
          <Wind className="w-3.5 h-3.5 text-yellow-400" />
          {isPump ? "Pump Impeller & Hydraulic Specifications" : "Fan / Blower Rotor Specifications"}
        </h4>

        {/* Live Calculation Badge */}
        <div className="p-3 bg-yellow-400/5 border border-yellow-400/20 rounded-xl flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono font-bold text-yellow-400 uppercase tracking-wider block">
              Calculated {isPump ? "Vane Pass Frequency (VPF)" : "Blade Pass Frequency (BPF)"}
            </span>
            <span className="text-[9px] text-slate-400 block font-sans">
              Critical ISO 14224 diagnostic marker for {isPump ? "impeller vane pass turbulence and cavitation" : "blade damage or flow aerodynamics"}.
            </span>
          </div>
          <div className="text-right">
            <span className="text-sm font-bold font-mono text-yellow-400 block">{bpfHz.toFixed(1)} Hz</span>
            <span className="text-[9px] text-slate-500 font-mono block">{bpfCpm.toLocaleString()} CPM</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          {/* Pump Specific Fields */}
          {isPump ? (
            <>
              {/* Impeller Vanes Count */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
                  Impeller Vanes Count <span className="text-red-500">*</span>
                  <HelpTooltip text="Number of impeller vanes. CRITICAL for Vane Pass Frequency (VPF = RPM * impellerVanes / 60)." />
                </label>
                <input 
                  type="number" 
                  value={specs.impellerVanes || specs.fanBlades || "5"} 
                  onChange={e => {
                    handleSpecChange("impellerVanes", e.target.value);
                    handleSpecChange("fanBlades", e.target.value);
                  }}
                  placeholder="E.g., 5"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
                />
              </div>

              {/* Pump Type */}
              <SmartSelect
                label="Pump Construction Type"
                value={specs.pumpType || "Centrifugal"}
                onChange={val => handleSpecChange("pumpType", val)}
                options={[
                  { value: "Centrifugal", label: "Centrifugal Pump" },
                  { value: "Positive Displacement", label: "Positive Displacement" },
                  { value: "Multistage", label: "Multistage Pump" },
                  { value: "Axial Flow", label: "Axial Flow Pump" }
                ]}
                specKey="pumpType"
                specs={specs}
                handleSpecChange={handleSpecChange}
                helpText="Pump hydraulic design classification."
              />

              {/* Number of Stages */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
                  Number of Stages
                  <HelpTooltip text="Number of impeller stages in multistage pump assemblies." />
                </label>
                <input 
                  type="number" 
                  value={specs.numStages || "1"} 
                  onChange={e => handleSpecChange("numStages", e.target.value)}
                  placeholder="E.g., 1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
                />
              </div>

              {/* Flow Rate (GPM) */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
                  Flow Rate (GPM)
                  <HelpTooltip text="Operating flow rate in Gallons Per Minute. Helps detect cavitation and off-BEP hydraulic recirculation." />
                </label>
                <input 
                  type="number" 
                  value={specs.flowRate_GPM || "0"} 
                  onChange={e => handleSpecChange("flowRate_GPM", e.target.value)}
                  placeholder="E.g., 500"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
                />
              </div>
            </>
          ) : (
            <>
              {/* Number of Blades */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
                  Blades Count <span className="text-red-500">*</span>
                  <HelpTooltip text="Number of fan blades. CRITICAL for Blade Pass Frequency (BPF = RPM * numBlades / 60)." />
                </label>
                <input 
                  type="number" 
                  value={specs.numBlades || specs.fanBlades || "8"} 
                  onChange={e => {
                    handleSpecChange("numBlades", e.target.value);
                    handleSpecChange("fanBlades", e.target.value);
                  }}
                  placeholder="E.g., 8"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
                />
              </div>

              {/* Fan Type */}
              <SmartSelect
                label="Fan / Blower Type"
                value={specs.fanType || "Centrifugal"}
                onChange={val => handleSpecChange("fanType", val)}
                options={[
                  { value: "Centrifugal", label: "Centrifugal (Radial Flow)" },
                  { value: "Axial", label: "Axial (Propeller/Vaneaxial)" },
                  { value: "Mixed Flow", label: "Mixed Flow" }
                ]}
                specKey="fanType"
                specs={specs}
                handleSpecChange={handleSpecChange}
                helpText="Aerodynamic fan construction type."
              />

              {/* Blade Angle */}
              <SmartSelect
                label="Blade Pitch / Angle"
                value={specs.bladeAngle || "Fixed"}
                onChange={val => handleSpecChange("bladeAngle", val)}
                options={[
                  { value: "Fixed", label: "Fixed Pitch Blades" },
                  { value: "Variable", label: "Variable Pitch / Adjustable" }
                ]}
                specKey="bladeAngle"
                specs={specs}
                handleSpecChange={handleSpecChange}
                helpText="Blade pitch setting impacting aerodynamic loading."
              />
            </>
          )}

          {/* Impeller / Fan Diameter */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
              Outer Diameter (in/mm)
              <HelpTooltip text="Outer diameter of the rotor assembly (in inches or mm). Used to evaluate boundary tip speed." />
            </label>
            <input 
              type="text" 
              value={specs.impellerDiameter || ""} 
              onChange={e => handleSpecChange("impellerDiameter", e.target.value)}
              placeholder="E.g., 24.5 in"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 5. BELTS & PULLEYS TAB
// ==========================================
export function BeltsPulleysTab({ specs, handleSpecChange }: TabProps) {
  const driverDia = parseFloat(specs.pulleyDriver || "0") || 0;
  const drivenDia = parseFloat(specs.pulleyDriven || "0") || 0;
  const rpm = parseFloat(specs.specRpm || "1750") || 1750;

  // Live Pulley Ratio & Driven Speed Calculation
  const pulleyRatio = drivenDia > 0 ? (driverDia / drivenDia) : 0;
  const drivenRpm = pulleyRatio * rpm;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850/60 space-y-4">
        <h4 className="text-[10px] font-mono font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-900 pb-2">
          <ChainIcon className="w-3.5 h-3.5 text-yellow-400" />
          Belt & Pulley Transmission Specs
        </h4>

        {/* Live Calculation Results */}
        {driverDia > 0 && drivenDia > 0 && (
          <div className="p-3 bg-yellow-400/5 border border-yellow-400/20 rounded-xl grid grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] font-mono font-bold text-yellow-400 uppercase tracking-wider block">
                Calculated Pulley Ratio
              </span>
              <span className="text-sm font-bold font-mono text-slate-200 block">{pulleyRatio.toFixed(2)} : 1</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-mono font-bold text-yellow-400 uppercase tracking-wider block">
                Estimated Driven Shaft Speed
              </span>
              <span className="text-sm font-bold font-mono text-yellow-400 block">{drivenRpm.toFixed(0)} RPM</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          {/* Number of Belts */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Number of Belts</label>
            <input 
              type="number" 
              value={specs.numBelts || ""} 
              onChange={e => handleSpecChange("numBelts", e.target.value)}
              placeholder="E.g., 4"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
            />
          </div>

          {/* Belt Length */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Belt Length (in/mm)</label>
            <input 
              type="text" 
              value={specs.beltLength || ""} 
              onChange={e => handleSpecChange("beltLength", e.target.value)}
              placeholder="E.g., 96 inches"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
            />
          </div>

          {/* Belt Type */}
          <SmartSelect
            label="Belt Profile Type"
            value={specs.beltType || "V-Belt"}
            onChange={val => handleSpecChange("beltType", val)}
            options={[
              { value: "V-Belt", label: "Standard V-Belt" },
              { value: "Timing Belt", label: "Timing Belt (Synchronous Cogged)" },
              { value: "Flat Belt", label: "Flat Belt" }
            ]}
            specKey="beltType"
            specs={specs}
            handleSpecChange={handleSpecChange}
          />

          {/* Pulley Driver Dia */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
              Driver Sheave Diameter
              <HelpTooltip text="Outer diameter of the pulley on the primary driving shaft (motor side)." />
            </label>
            <input 
              type="number" 
              step="0.1"
              value={specs.pulleyDriver || ""} 
              onChange={e => handleSpecChange("pulleyDriver", e.target.value)}
              placeholder="E.g., 6.5"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
            />
          </div>

          {/* Pulley Driven Dia */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
              Driven Sheave Diameter
              <HelpTooltip text="Outer diameter of the pulley on the receiving driven shaft (fan or pump side)." />
            </label>
            <input 
              type="number" 
              step="0.1"
              value={specs.pulleyDriven || ""} 
              onChange={e => handleSpecChange("pulleyDriven", e.target.value)}
              placeholder="E.g., 12.0"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
            />
          </div>

          {/* Belt Tension */}
          <SmartSelect
            label="Belt Tension State"
            value={specs.beltTension || "Normal"}
            onChange={val => handleSpecChange("beltTension", val)}
            options={[
              { value: "Normal", label: "Normal (Optimal)" },
              { value: "Loose", label: "Loose (Slipping risk / 1X belt frequency)" },
              { value: "Tight", label: "Over-tightened (Excessive bearing wear risk)" }
            ]}
            specKey="beltTension"
            specs={specs}
            handleSpecChange={handleSpecChange}
          />
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 6. ELECTRICAL TAB
// ==========================================
export function ElectricalTab({ specs, handleSpecChange }: TabProps) {
  const lineFreq = parseFloat(specs.lineFrequency || "60") || 60;
  const poles = parseInt(specs.numPoles || "4") || 4;
  const opRpm = parseFloat(specs.specRpm || "1750") || 1750;

  // Live Electrical Motor Speed and Slip calculations
  const syncSpeed = (120 * lineFreq) / poles;
  const slipRpm = Math.max(0, syncSpeed - opRpm);
  const slipPercent = syncSpeed > 0 ? (slipRpm / syncSpeed) * 100 : 0;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850/60 space-y-4">
        <h4 className="text-[10px] font-mono font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-900 pb-2">
          <Zap className="w-3.5 h-3.5 text-yellow-400" />
          Electrical Induction Motor Specifications
        </h4>

        {/* Live Slip calculation box */}
        <div className="p-3 bg-yellow-400/5 border border-yellow-400/20 rounded-xl flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono font-bold text-yellow-400 uppercase tracking-wider block">
              Calculated Synced Speed & Slip
            </span>
            <span className="text-[9px] text-slate-400 block font-sans">
              Pole-frequency sync speed is {syncSpeed} RPM. Slip indicates induction torque load.
            </span>
          </div>
          <div className="text-right">
            <span className="text-sm font-bold font-mono text-slate-200 block">{syncSpeed} RPM Synced</span>
            <span className="text-[9px] text-yellow-400 font-mono block">
              Slip: {slipRpm.toFixed(0)} RPM ({slipPercent.toFixed(1)}%)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          {/* Line Frequency */}
          <SmartSelect
            label="Line Frequency"
            value={specs.lineFrequency || "60"}
            onChange={val => handleSpecChange("lineFrequency", val)}
            options={[
              { value: "60", label: "60 Hz (North America / standard)" },
              { value: "50", label: "50 Hz (Europe / International)" }
            ]}
            specKey="lineFrequency"
            specs={specs}
            handleSpecChange={handleSpecChange}
          />

          {/* Motor Type */}
          <SmartSelect
            label="Motor Class Type"
            value={specs.motorType || "Induction"}
            onChange={val => handleSpecChange("motorType", val)}
            options={[
              { value: "Induction", label: "Squirrel Cage Induction" },
              { value: "Synchronous", label: "Synchronous Motor" },
              { value: "DC", label: "Direct Current (DC)" },
              { value: "VFD", label: "Variable Frequency Drive (VFD)" }
            ]}
            specKey="motorType"
            specs={specs}
            handleSpecChange={handleSpecChange}
          />

          {/* Number of Poles */}
          <SmartSelect
            label="Number of Poles"
            value={specs.numPoles || "4"}
            onChange={val => handleSpecChange("numPoles", val)}
            options={[
              { value: "2", label: "2 Poles (3600 RPM @ 60Hz)" },
              { value: "4", label: "4 Poles (1800 RPM @ 60Hz)" },
              { value: "6", label: "6 Poles (1200 RPM @ 60Hz)" },
              { value: "8", label: "8 Poles (900 RPM @ 60Hz)" }
            ]}
            specKey="numPoles"
            specs={specs}
            handleSpecChange={handleSpecChange}
          />

          {/* Enclosure Type */}
          <SmartSelect
            label="Enclosure Type"
            value={specs.enclosure_type || "TEFC"}
            onChange={val => handleSpecChange("enclosure_type", val)}
            options={[
              { value: "TEFC", label: "TEFC (Totally Enclosed Fan Cooled)" },
              { value: "ODP", label: "ODP (Open Drip Proof)" },
              { value: "Explosion Proof", label: "Explosion Proof (HazLoc)" },
              { value: "TENV", label: "TENV (Totally Enclosed Non-Ventilated)" }
            ]}
            specKey="enclosure_type"
            specs={specs}
            handleSpecChange={handleSpecChange}
          />

          {/* Motor Horsepower */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
              Motor Horsepower (HP)
              <HelpTooltip text="Nameplate motor horsepower rating. Used for ISO 10816 class boundary determination and torque load scaling." />
            </label>
            <input 
              type="number" 
              value={specs.horsepower || "0"} 
              onChange={e => handleSpecChange("horsepower", e.target.value)}
              placeholder="E.g., 50"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
            />
          </div>

          {/* Number of Rotor Bars */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
              Rotor Bars Count <span className="text-red-500">*</span>
              <HelpTooltip text="Number of copper/aluminum conductor bars in the rotor cage. CRITICAL for broken rotor bar and RBPF (Rotor Bar Pass Frequency) detection." />
            </label>
            <input 
              type="number" 
              value={specs.numRotorBars || "0"} 
              onChange={e => handleSpecChange("numRotorBars", e.target.value)}
              placeholder="E.g., 44"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
            />
          </div>

          {/* Number of Stator Slots */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
              Stator Slots Count
              <HelpTooltip text="Number of internal stator wiring slots. Used to diagnose electrical core/slot faults." />
            </label>
            <input 
              type="number" 
              value={specs.numStatorSlots || ""} 
              onChange={e => handleSpecChange("numStatorSlots", e.target.value)}
              placeholder="E.g., 36"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
            />
          </div>

          {/* Voltage Rating */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Voltage Rating (V)</label>
            <input 
              type="number" 
              value={specs.voltageRating || ""} 
              onChange={e => handleSpecChange("voltageRating", e.target.value)}
              placeholder="E.g., 460"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
            />
          </div>

          {/* Current Rating */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Current FLA Rating (A)</label>
            <input 
              type="number" 
              value={specs.currentRating || ""} 
              onChange={e => handleSpecChange("currentRating", e.target.value)}
              placeholder="E.g., 220"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 7. COMPRESSOR TAB
// ==========================================
export function CompressorTab({ specs, handleSpecChange }: TabProps) {
  const compType = specs.compressorType || "Centrifugal";

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850/60 space-y-4">
        <h4 className="text-[10px] font-mono font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-900 pb-2">
          <Gauge className="w-3.5 h-3.5 text-yellow-400" />
          Compressor Specifications (ISO 14224 / Category IV)
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          {/* Compressor Type */}
          <SmartSelect
            label="Compressor Type"
            value={specs.compressorType || "Centrifugal"}
            onChange={val => handleSpecChange("compressorType", val)}
            options={[
              { value: "Centrifugal", label: "Centrifugal Compressor" },
              { value: "Reciprocating", label: "Reciprocating Compressor" },
              { value: "Screw", label: "Screw / Rotary Compressor" }
            ]}
            specKey="compressorType"
            specs={specs}
            handleSpecChange={handleSpecChange}
            helpText="Thermodynamic compression process & mechanical construction type."
          />

          {/* Number of Stages */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
              Number of Stages
              <HelpTooltip text="Number of compression stages. Multi-stage setups create distinct inter-stage pressure and blade/vane pass frequencies." />
            </label>
            <input 
              type="number" 
              value={specs.numStages || "1"} 
              onChange={e => handleSpecChange("numStages", e.target.value)}
              placeholder="E.g., 1"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
            />
          </div>

          {/* Conditionally render Cylinders for Reciprocating or Lobes for Screw */}
          {compType === "Reciprocating" && (
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
                Number of Cylinders
                <HelpTooltip text="Cylinder count for reciprocating compressor impact pulsation and crank frequency." />
              </label>
              <input 
                type="number" 
                value={specs.numCylinders || "0"} 
                onChange={e => handleSpecChange("numCylinders", e.target.value)}
                placeholder="E.g., 2"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
              />
            </div>
          )}

          {compType === "Screw" && (
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
                Number of Lobes (Male/Female)
                <HelpTooltip text="Rotor lobe count for screw compressors (used to calculate Lobe Mesh Frequency)." />
              </label>
              <input 
                type="number" 
                value={specs.numLobes || "0"} 
                onChange={e => handleSpecChange("numLobes", e.target.value)}
                placeholder="E.g., 4"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
