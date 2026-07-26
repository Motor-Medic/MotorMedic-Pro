import React, { useState, useEffect } from "react";
import { 
  Sliders, 
  Disc, 
  Settings as GearIcon, 
  Wind, 
  Link as ChainIcon, 
  Zap, 
  Gauge,
  AlertCircle,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  CoreSpecsTab, 
  BearingsTab, 
  GearboxTab, 
  FansImpellersTab, 
  BeltsPulleysTab, 
  ElectricalTab,
  CompressorTab 
} from "./EquipmentSpecs/Tabs";

/**
 * ISO 14224 & Category IV Vibration Analysis Standard Parameter Keys.
 * Includes explicit parameters for fault frequency calculations:
 * - Gear Mesh Frequency (GMF)
 * - Vane Pass Frequency (VPF)
 * - Blade Pass Frequency (BPF)
 * - Rotor Bar Pass Frequency (RBPF) & Pole Passing Frequency (PPF)
 * - Lobe Mesh Frequency for screw compressors
 */
const standardKeys = new Set([
  "specRpm", "motorSpecs", "transmissionType", "gravitySpecs", "specOrientation", 
  "powerRating", "assetCriticality", "driveType", "specDrive", "pumpType", 
  "bearingType", "systemDetails", "fanBlades", "lineFrequency", "numPoles", 
  "motorType", "numRotorBars", "bearing_inner", "bearing_outer", "numShafts", "shafts",
  // ISO 14224 Category IV critical specification additions:
  "horsepower", "impellerVanes", "numStages", "flowRate_GPM", "numBlades", 
  "fanType", "bladeAngle", "compressorType", "numCylinders", "numLobes", 
  "gearRatio"
]);

export interface ShaftConfig {
  name: string;
  teeth: string;
  rpm: string;
  type: "Spur" | "Helical" | "Bevel" | "Worm" | "Herringbone" | string;
}

export interface SpecsFormProps {
  specs: Record<string, string>;
  handleSpecChange: (key: string, value: string) => void;
  equipmentType: string;
  numShafts: number;
  setNumShafts: (val: number) => void;
  shafts: ShaftConfig[];
  setShafts: React.Dispatch<React.SetStateAction<ShaftConfig[]>>;
  isAutoFilled?: boolean;
}

export default function SpecsForm({
  specs,
  handleSpecChange,
  equipmentType,
  numShafts,
  setNumShafts,
  shafts,
  setShafts,
  isAutoFilled
}: SpecsFormProps) {
  // Available Tabs list based on conditional logic & equipment classification
  const showGearbox = specs.driveType === "Gear Drive" || equipmentType === "Gearbox";
  const showFans = equipmentType === "Ventilation Fan" || equipmentType === "Fan" || equipmentType === "Blower" || equipmentType === "Pump Unit" || equipmentType === "Pump";
  const showBelts = specs.driveType === "Belt Drive";
  const showElectrical = equipmentType === "Electric Motor" || equipmentType === "Motor";
  const showCompressor = equipmentType === "Compressor";
  const showCustom = Object.keys(specs).some(key => !standardKeys.has(key));

  const tabsConfig = [
    { id: "core", label: "Core Specs", icon: Sliders, visible: true },
    { id: "bearings", label: "Bearings", icon: Disc, visible: true },
    { id: "gearbox", label: "Gearbox", icon: GearIcon, visible: showGearbox },
    { id: "fans", label: showFans && (equipmentType === "Pump Unit" || equipmentType === "Pump") ? "Impellers/Pumps" : "Fans/Impellers", icon: Wind, visible: showFans },
    { id: "belts", label: "Belts & Pulleys", icon: ChainIcon, visible: showBelts },
    { id: "electrical", label: "Electrical", icon: Zap, visible: showElectrical },
    { id: "compressor", label: "Compressor", icon: Gauge, visible: showCompressor },
    { id: "custom", label: "Custom Specs", icon: Sparkles, visible: showCustom }
  ];

  const visibleTabs = tabsConfig.filter(t => t.visible);
  const [activeTab, setActiveTab] = useState<string>("core");

  // Keep active tab safe if visibility changes dynamically
  useEffect(() => {
    const isCurrentTabVisible = visibleTabs.some(t => t.id === activeTab);
    if (!isCurrentTabVisible && visibleTabs.length > 0) {
      setActiveTab("core");
    }
  }, [equipmentType, specs.driveType, activeTab]);

  // SMART DEFAULTS - Apply when equipmentType changes (ISO 14224 / Cat IV compliant)
  useEffect(() => {
    if (!equipmentType) return;

    // Helper to safely populate smart defaults without overwriting user data
    const applyIfEmpty = (key: string, defaultValue: string) => {
      if (!specs[key] || specs[key] === "N/A" || specs[key] === "") {
        handleSpecChange(key, defaultValue);
      }
    };

    switch (equipmentType) {
      case "Pump Unit":
      case "Pump":
        applyIfEmpty("bearingType", "Ball");
        applyIfEmpty("driveType", "Direct Coupled");
        // Pump-specific ISO 14224 Category IV defaults:
        applyIfEmpty("pumpType", "Centrifugal"); // dropdown: "Centrifugal", "Positive Displacement", "Multistage", "Axial Flow"
        applyIfEmpty("impellerVanes", "5"); // CRITICAL for Vane Pass Frequency (VPF) calculation
        applyIfEmpty("fanBlades", "5"); // Legacy alias compatibility
        applyIfEmpty("numStages", "1"); // Multi-stage pump count
        applyIfEmpty("flowRate_GPM", "0"); // Hydraulic flow rate to evaluate cavitation risk
        break;

      case "Electric Motor":
      case "Motor":
        applyIfEmpty("bearingType", "Ball");
        applyIfEmpty("driveType", "Direct Coupled");
        // Motor-specific Category IV defaults for electrical fault diagnosis:
        applyIfEmpty("lineFrequency", "60");
        applyIfEmpty("numPoles", "4");
        applyIfEmpty("motorType", "Induction"); // dropdown: "Induction", "Synchronous", "DC", "Servo"
        applyIfEmpty("horsepower", "0"); // Motor horsepower for torque & load scaling
        applyIfEmpty("numRotorBars", "0"); // CRITICAL for broken rotor bar detection (RBPF)
        break;

      case "Ventilation Fan":
      case "Fan":
      case "Blower":
        applyIfEmpty("bearingType", "Ball");
        applyIfEmpty("driveType", "Belt Drive");
        // Fan-specific Category IV defaults for aerodynamic fault diagnosis:
        applyIfEmpty("numBlades", "8"); // CRITICAL for Blade Pass Frequency (BPF) calculation
        applyIfEmpty("fanBlades", "8"); // Legacy alias compatibility
        applyIfEmpty("fanType", "Centrifugal"); // dropdown: "Centrifugal", "Axial", "Mixed Flow"
        applyIfEmpty("bladeAngle", "Fixed"); // dropdown: "Fixed", "Variable"
        break;

      case "Compressor":
        applyIfEmpty("bearingType", "Roller");
        applyIfEmpty("driveType", "Direct Coupled");
        // Compressor-specific Category IV defaults:
        applyIfEmpty("compressorType", "Centrifugal"); // dropdown: "Centrifugal", "Reciprocating", "Screw"
        applyIfEmpty("numStages", "1"); // Compression stage count
        applyIfEmpty("numCylinders", "0"); // Reciprocating cylinder count
        applyIfEmpty("numLobes", "0"); // Screw compressor lobe count for Lobe Mesh Frequency
        break;

      case "Gearbox":
        applyIfEmpty("bearingType", "Roller");
        applyIfEmpty("driveType", "Gear Drive");
        // Gearbox-specific Category IV defaults for Gear Mesh Frequency (GMF) calculation:
        applyIfEmpty("gearRatio", "1"); // Calculated or nominal gear ratio
        // Ensure shafts array has at least 2 shafts initialized (Input & Output)
        if (!shafts || shafts.length < 2) {
          setNumShafts(2);
          setShafts([
            { name: "Input Shaft", teeth: "20", rpm: specs.specRpm || "1750", type: "Spur" },
            { name: "Output Shaft", teeth: "40", rpm: String(Math.round((parseFloat(specs.specRpm || "1750") || 1750) / 2)), type: "Spur" }
          ]);
        }
        break;

      default:
        break;
    }
  }, [equipmentType]);

  // Client-side real-time validation check based on Category IV vibration rules
  const validationError = (() => {
    // 1. Validate Operating Speed (RPM)
    if (equipmentType !== "Static Measurement" && (!specs.specRpm || isNaN(parseFloat(specs.specRpm)) || parseFloat(specs.specRpm) <= 0)) {
      return "Operating Speed (RPM) must be a positive number.";
    }

    // 2. Validate Pump Impeller Vanes (CRITICAL for Vane Pass Frequency calculation)
    if ((equipmentType === "Pump Unit" || equipmentType === "Pump") && specs.impellerVanes && (isNaN(parseInt(specs.impellerVanes)) || parseInt(specs.impellerVanes) <= 0)) {
      return "Number of Impeller Vanes must be a positive integer.";
    }

    // 3. Validate Fan Blades (CRITICAL for Blade Pass Frequency calculation)
    if ((equipmentType === "Ventilation Fan" || equipmentType === "Fan" || equipmentType === "Blower") && specs.numBlades && (isNaN(parseInt(specs.numBlades)) || parseInt(specs.numBlades) <= 0)) {
      return "Number of Fan Blades must be a positive integer.";
    }

    // 4. Validate Rotor Bars (CRITICAL for broken rotor bar & RBPF detection)
    if ((equipmentType === "Electric Motor" || equipmentType === "Motor") && specs.numRotorBars && specs.numRotorBars !== "0" && (isNaN(parseInt(specs.numRotorBars)) || parseInt(specs.numRotorBars) < 0)) {
      return "Number of Rotor Bars must be a non-negative integer.";
    }

    // 5. Legacy fanBlades check
    if (showFans && specs.fanBlades && (isNaN(parseInt(specs.fanBlades)) || parseInt(specs.fanBlades) <= 0)) {
      return "Number of Blades/Vanes must be a positive integer.";
    }

    return null;
  })();

  return (
    <div className="space-y-4">
      {isAutoFilled && (
        <div className="flex flex-wrap items-center gap-2 px-3.5 py-2 bg-emerald-500/5 border border-emerald-500/15 rounded-xl animate-fade-in">
          <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-emerald-400 uppercase">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            ✓ Auto-Filled from Database
          </span>
          <span className="text-[10px] text-slate-500 font-mono">|</span>
          <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-400 text-[9px] font-mono font-black uppercase tracking-widest rounded border border-emerald-500/25 flex items-center gap-1">
            <Sliders className="w-3 h-3 text-emerald-400" />
            CMMS Ready (ISO 14224 / Cat IV)
          </span>
        </div>
      )}

      {/* 1. Progressive Disclosure Tabs Navigation */}
      <div className="flex flex-col sm:flex-row gap-2 border-b border-slate-850 pb-1 overflow-x-auto scrollbar-none">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              id={`tab-btn-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center sm:justify-start gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold font-mono tracking-wide transition-all duration-200 cursor-pointer whitespace-nowrap min-h-[44px] ${
                isSelected
                  ? "bg-yellow-400 text-slate-950 border-yellow-400 font-bold shadow-md shadow-yellow-400/10"
                  : "bg-slate-950/40 border-slate-850 text-slate-400 hover:text-white hover:bg-slate-900/50"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2. Real-time Validation Errors */}
      {validationError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-mono rounded-xl flex items-center gap-2 animate-fade-in">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* 3. Smooth Collapsible Accordion-tab panel */}
      <div className="bg-slate-900/40 border border-slate-850/80 rounded-2xl p-4 min-h-[220px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "core" && (
              <CoreSpecsTab 
                specs={specs} 
                handleSpecChange={handleSpecChange} 
                equipmentType={equipmentType} 
              />
            )}
            {activeTab === "bearings" && (
              <BearingsTab 
                specs={specs} 
                handleSpecChange={handleSpecChange} 
                equipmentType={equipmentType} 
              />
            )}
            {activeTab === "gearbox" && (
              <GearboxTab 
                specs={specs} 
                handleSpecChange={handleSpecChange} 
                equipmentType={equipmentType} 
                numShafts={numShafts} 
                setNumShafts={setNumShafts} 
                shafts={shafts} 
                setShafts={setShafts} 
              />
            )}
            {activeTab === "fans" && (
              <FansImpellersTab 
                specs={specs} 
                handleSpecChange={handleSpecChange} 
                equipmentType={equipmentType} 
              />
            )}
            {activeTab === "belts" && (
              <BeltsPulleysTab 
                specs={specs} 
                handleSpecChange={handleSpecChange} 
                equipmentType={equipmentType} 
              />
            )}
            {activeTab === "electrical" && (
              <ElectricalTab 
                specs={specs} 
                handleSpecChange={handleSpecChange} 
                equipmentType={equipmentType} 
              />
            )}
            {activeTab === "compressor" && (
              <CompressorTab 
                specs={specs} 
                handleSpecChange={handleSpecChange} 
                equipmentType={equipmentType} 
              />
            )}
            {activeTab === "custom" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.keys(specs)
                  .filter(key => !standardKeys.has(key))
                  .map(key => (
                    <div key={key} className="space-y-1.5" id={`custom-spec-${key}`}>
                      <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
                        {key.replace(/_/g, " ")}
                      </label>
                      <input
                        type="text"
                        value={specs[key] || ""}
                        onChange={(e) => handleSpecChange(key, e.target.value)}
                        placeholder={`Enter ${key.replace(/_/g, " ").toLowerCase()}`}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono outline-none focus:border-yellow-400"
                      />
                    </div>
                  ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
