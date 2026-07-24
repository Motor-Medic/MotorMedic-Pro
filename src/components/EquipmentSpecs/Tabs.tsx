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
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
              Machine Orientation
              <HelpTooltip text="Structural mounting direction. Affects gravity loading and vibration axial sensitivity." />
            </label>
            <select 
              value={specs.gravitySpecs || "Horizontal"} 
              onChange={e => handleSpecChange("gravitySpecs", e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-mono outline-none focus:border-yellow-400 cursor-pointer"
            >
              <option value="Horizontal">Horizontal</option>
              <option value="Vertical">Vertical</option>
              <option value="Angular">Angular / Suspended</option>
            </select>
          </div>

          {/* Drive Mode */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
              Drive Mode
              <HelpTooltip text="The physical coupling type of the machine power transmission. Conditionally enables Gear or Belt tabs." />
            </label>
            <select 
              value={specs.driveType || "Direct Coupled"} 
              onChange={e => handleSpecChange("driveType", e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-mono outline-none focus:border-yellow-400 cursor-pointer"
            >
              <option value="Direct Coupled">Direct Coupled</option>
              <option value="Belt Drive">Belt Drive</option>
              <option value="Gear Drive">Gear Drive</option>
            </select>
          </div>

          {/* Asset Criticality */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
              Asset Criticality
              <HelpTooltip text="Defines reliability focus. Highly critical assets trigger tighter warning and shutdown thresholds." />
            </label>
            <select 
              value={specs.assetCriticality || "Standard"} 
              onChange={e => handleSpecChange("assetCriticality", e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-mono outline-none focus:border-yellow-400 cursor-pointer"
            >
              <option value="Critical">Critical (Class I / High Ingress)</option>
              <option value="Important">Important (Class II / Process Core)</option>
              <option value="Standard">Standard (Class III / Auxiliary)</option>
              <option value="Non-Critical">Non-Critical (Class IV / Run to Fail)</option>
            </select>
          </div>

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
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
              OEM Manufacturer
              <HelpTooltip text="Original Equipment Manufacturer name to identify custom bearing profiles." />
            </label>
            <input 
              type="text" 
              value={specs.manufacturer || ""} 
              onChange={e => handleSpecChange("manufacturer", e.target.value)}
              placeholder="E.g., Sulzer, Baldor, SKF"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-sans outline-none focus:border-yellow-400"
            />
          </div>
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
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Primary Bearing Type</label>
            <select 
              value={specs.bearingType || "Ball"} 
              onChange={e => handleSpecChange("bearingType", e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-mono outline-none focus:border-yellow-400 cursor-pointer"
            >
              <option value="Ball">Rolling Element - Ball</option>
              <option value="Roller">Rolling Element - Cylindrical Roller</option>
              <option value="Sleeve">Fluid Film / Journal Sleeve</option>
              <option value="Thrust">Thrust Bearing</option>
              <option value="Other">Specialized / Other</option>
            </select>
          </div>

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
                  <div className="space-y-1">
                    <label className="text-[9px] font-mono text-slate-500 uppercase block">Location</label>
                    <select 
                      value={specs[locKey] || (idx === 0 ? "Drive End" : "Non-Drive End")}
                      onChange={e => handleSpecChange(locKey, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                    >
                      <option value="Drive End">Drive End (DE)</option>
                      <option value="Non-Drive End">Non-Drive End (NDE)</option>
                      <option value="Inboard">Inboard (IB)</option>
                      <option value="Outboard">Outboard (OB)</option>
                    </select>
                  </div>

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
    type: "Spur" | "Helical" | "Bevel" | "Worm" | "Herringbone";
  }>;
  setShafts: React.Dispatch<React.SetStateAction<Array<{
    name: string;
    teeth: string;
    rpm: string;
    type: "Spur" | "Helical" | "Bevel" | "Worm" | "Herringbone";
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

                  <div>
                    <label className="text-[8px] font-mono text-slate-500 uppercase block mb-1">Gear Type</label>
                    <select 
                      value={shaft.type || "Spur"}
                      onChange={e => {
                        const newType = e.target.value as any;
                        setShafts(prev => prev.map((s, sIdx) => sIdx === idx ? { ...s, type: newType } : s));
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1 text-white font-mono outline-none focus:border-yellow-400 cursor-pointer text-[10px]"
                    >
                      <option value="Spur">Spur</option>
                      <option value="Helical">Helical</option>
                      <option value="Bevel">Bevel</option>
                      <option value="Worm">Worm</option>
                      <option value="Herringbone">Herringbone</option>
                    </select>
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
// 4. FANS / IMPELLERS TAB
// ==========================================
export function FansImpellersTab({ specs, handleSpecChange }: TabProps) {
  const blades = parseInt(specs.fanBlades || "6") || 6;
  const rpm = parseFloat(specs.specRpm || "1750") || 1750;
  
  // LIVE calculation of Blade Pass Frequency
  const bpfHz = (rpm * blades) / 60;
  const bpfCpm = rpm * blades;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850/60 space-y-4">
        <h4 className="text-[10px] font-mono font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-900 pb-2">
          <Wind className="w-3.5 h-3.5 text-yellow-400" />
          Fan / Rotor Impeller Specifications
        </h4>

        {/* Live Calculation Badge */}
        <div className="p-3 bg-yellow-400/5 border border-yellow-400/20 rounded-xl flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono font-bold text-yellow-400 uppercase tracking-wider block">
              Calculated Blade Pass Frequency (BPF)
            </span>
            <span className="text-[9px] text-slate-400 block font-sans">
              Critical diagnostic marker for blade damage or flow aerodynamics.
            </span>
          </div>
          <div className="text-right">
            <span className="text-sm font-bold font-mono text-yellow-400 block">{bpfHz.toFixed(1)} Hz</span>
            <span className="text-[9px] text-slate-500 font-mono block">{bpfCpm.toLocaleString()} CPM</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          {/* Number of Blades / Vanes */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
              Blades / Vanes Count
              <HelpTooltip text="Number of impeller blades or diffuser vanes. Drives Blade Pass Frequency calculations." />
            </label>
            <input 
              type="number" 
              value={specs.fanBlades || ""} 
              onChange={e => handleSpecChange("fanBlades", e.target.value)}
              placeholder="E.g., 6"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-yellow-400"
            />
          </div>

          {/* Fan Type */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Fan / Impeller Type</label>
            <select 
              value={specs.fanType || "Centrifugal"} 
              onChange={e => handleSpecChange("fanType", e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-mono outline-none focus:border-yellow-400 cursor-pointer"
            >
              <option value="Centrifugal">Centrifugal (Radial Flow)</option>
              <option value="Axial">Axial (Propeller/Vaneaxial)</option>
              <option value="Mixed Flow">Mixed Flow</option>
            </select>
          </div>

          {/* Impeller Diameter */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
              Impeller Diameter
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
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Belt Profile Type</label>
            <select 
              value={specs.beltType || "V-Belt"} 
              onChange={e => handleSpecChange("beltType", e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-mono outline-none focus:border-yellow-400 cursor-pointer"
            >
              <option value="V-Belt">Standard V-Belt</option>
              <option value="Timing Belt">Timing Belt (Synchronous Cogged)</option>
              <option value="Flat Belt">Flat Belt</option>
            </select>
          </div>

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
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Belt Tension State</label>
            <select 
              value={specs.beltTension || "Normal"} 
              onChange={e => handleSpecChange("beltTension", e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-mono outline-none focus:border-yellow-400 cursor-pointer"
            >
              <option value="Normal">Normal (Optimal)</option>
              <option value="Loose">Loose (Slipping risk / 1X belt frequency)</option>
              <option value="Tight">Over-tightened (Excessive bearing wear risk)</option>
            </select>
          </div>
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
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Line Frequency</label>
            <select 
              value={specs.lineFrequency || "60"} 
              onChange={e => handleSpecChange("lineFrequency", e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-mono outline-none focus:border-yellow-400 cursor-pointer"
            >
              <option value="60">60 Hz (North America / standard)</option>
              <option value="50">50 Hz (Europe / International)</option>
            </select>
          </div>

          {/* Motor Type */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Motor Class Type</label>
            <select 
              value={specs.motorType || "Induction"} 
              onChange={e => handleSpecChange("motorType", e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-mono outline-none focus:border-yellow-400 cursor-pointer"
            >
              <option value="Induction">Squirrel Cage Induction</option>
              <option value="Synchronous">Synchronous Motor</option>
              <option value="DC">Direct Current (DC)</option>
              <option value="VFD">Variable Frequency Drive (VFD)</option>
            </select>
          </div>

          {/* Number of Poles */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Number of Poles</label>
            <select 
              value={specs.numPoles || "4"} 
              onChange={e => handleSpecChange("numPoles", e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-mono outline-none focus:border-yellow-400 cursor-pointer"
            >
              <option value="2">2 Poles (3600 RPM @ 60Hz)</option>
              <option value="4">4 Poles (1800 RPM @ 60Hz)</option>
              <option value="6">6 Poles (1200 RPM @ 60Hz)</option>
              <option value="8">8 Poles (900 RPM @ 60Hz)</option>
            </select>
          </div>

          {/* Number of Rotor Bars */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
              Rotor Bars Count
              <HelpTooltip text="Number of copper/aluminum conductor bars in the rotor cage. Used to identify Rotor Bar Pass Frequencies (RBPF)." />
            </label>
            <input 
              type="number" 
              value={specs.numRotorBars || ""} 
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
