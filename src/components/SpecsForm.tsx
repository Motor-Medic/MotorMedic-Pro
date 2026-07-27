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
  Sparkles,
  Layers,
  Wrench,
  Eye,
  CheckCircle2
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
import SpecsFormWizard from "./SpecsFormWizard";

/**
 * ISO 14224 & Category IV Vibration Analysis Standard Parameter Keys.
 */
const standardKeys = new Set([
  "specRpm", "motorSpecs", "transmissionType", "gravitySpecs", "specOrientation", 
  "powerRating", "assetCriticality", "driveType", "specDrive", "pumpType", 
  "bearingType", "systemDetails", "fanBlades", "lineFrequency", "numPoles", 
  "motorType", "numRotorBars", "bearing_inner", "bearing_outer", "numShafts", "shafts",
  "horsepower", "impellerVanes", "numStages", "flowRate_GPM", "numBlades", 
  "fanType", "bladeAngle", "compressorType", "numCylinders", "numLobes", 
  "gearRatio", "manufacturer", "model", "serialNumber", "lubricationType", "frameSize"
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
  setEquipmentType?: (type: string) => void;
  numShafts: number;
  setNumShafts: (val: number) => void;
  shafts: ShaftConfig[];
  setShafts: React.Dispatch<React.SetStateAction<ShaftConfig[]>>;
  isAutoFilled?: boolean;
  defaultViewMode?: "wizard" | "tabs";
}

export default function SpecsForm({
  specs,
  handleSpecChange,
  equipmentType,
  setEquipmentType,
  numShafts,
  setNumShafts,
  shafts,
  setShafts,
  isAutoFilled,
  defaultViewMode = "tabs"
}: SpecsFormProps) {
  // Mode State: "wizard" for multi-step 4-step wizard, "tabs" for classic tabbed breakdown
  const [viewMode, setViewMode] = useState<"wizard" | "tabs">(defaultViewMode);

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
        applyIfEmpty("pumpType", "Centrifugal");
        applyIfEmpty("impellerVanes", "5");
        applyIfEmpty("fanBlades", "5");
        applyIfEmpty("numStages", "1");
        applyIfEmpty("flowRate_GPM", "0");
        break;

      case "Electric Motor":
      case "Motor":
        applyIfEmpty("bearingType", "Ball");
        applyIfEmpty("driveType", "Direct Coupled");
        applyIfEmpty("lineFrequency", "60");
        applyIfEmpty("numPoles", "4");
        applyIfEmpty("motorType", "Induction");
        applyIfEmpty("horsepower", "0");
        applyIfEmpty("numRotorBars", "0");
        break;

      case "Ventilation Fan":
      case "Fan":
      case "Blower":
        applyIfEmpty("bearingType", "Ball");
        applyIfEmpty("driveType", "Belt Drive");
        applyIfEmpty("numBlades", "8");
        applyIfEmpty("fanBlades", "8");
        applyIfEmpty("fanType", "Centrifugal");
        applyIfEmpty("bladeAngle", "Fixed");
        break;

      case "Compressor":
        applyIfEmpty("bearingType", "Roller");
        applyIfEmpty("driveType", "Direct Coupled");
        applyIfEmpty("compressorType", "Centrifugal");
        applyIfEmpty("numStages", "1");
        applyIfEmpty("numCylinders", "0");
        applyIfEmpty("numLobes", "0");
        break;

      case "Gearbox":
        applyIfEmpty("bearingType", "Roller");
        applyIfEmpty("driveType", "Gear Drive");
        applyIfEmpty("gearRatio", "1");
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
    if (equipmentType !== "Static Measurement" && (!specs.specRpm || isNaN(parseFloat(specs.specRpm)) || parseFloat(specs.specRpm) <= 0)) {
      return "Operating Speed (RPM) must be a positive number.";
    }

    if ((equipmentType === "Pump Unit" || equipmentType === "Pump") && specs.impellerVanes && (isNaN(parseInt(specs.impellerVanes)) || parseInt(specs.impellerVanes) <= 0)) {
      return "Number of Impeller Vanes must be a positive integer.";
    }

    if ((equipmentType === "Ventilation Fan" || equipmentType === "Fan" || equipmentType === "Blower") && specs.numBlades && (isNaN(parseInt(specs.numBlades)) || parseInt(specs.numBlades) <= 0)) {
      return "Number of Fan Blades must be a positive integer.";
    }

    if ((equipmentType === "Electric Motor" || equipmentType === "Motor") && specs.numRotorBars && specs.numRotorBars !== "0" && (isNaN(parseInt(specs.numRotorBars)) || parseInt(specs.numRotorBars) < 0)) {
      return "Number of Rotor Bars must be a non-negative integer.";
    }

    return null;
  })();

  return (
    <div className="space-y-4">
      {/* View Switcher Toggle Header (Wizard vs Compact Tab View) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-md">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400">
            <Wrench className="w-4 h-4" />
          </span>
          <span className="text-xs font-mono font-bold text-slate-200">
            Specs Mode:
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setViewMode("wizard")}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center gap-1.5 ${
              viewMode === "wizard"
                ? "bg-emerald-500 text-slate-950 shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Multi-Step Wizard (Guided)</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("tabs")}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center gap-1.5 ${
              viewMode === "tabs"
                ? "bg-emerald-500 text-slate-950 shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Compact Tabs (Quick)</span>
          </button>
        </div>
      </div>

      {/* RENDER WIZARD OR TABBED VIEW */}
      {viewMode === "wizard" ? (
        <SpecsFormWizard 
          specs={specs} 
          handleSpecChange={handleSpecChange} 
          equipmentType={equipmentType} 
          setEquipmentType={setEquipmentType}
          numShafts={numShafts} 
          setNumShafts={setNumShafts} 
          shafts={shafts} 
          setShafts={setShafts} 
          isAutoFilled={isAutoFilled} 
        />
      ) : (
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

          {/* Progressive Disclosure Tabs Navigation */}
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

          {/* Real-time Validation Errors */}
          {validationError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-mono rounded-xl flex items-center gap-2 animate-fade-in">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Smooth Collapsible Accordion-tab panel */}
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
      )}
    </div>
  );
}
