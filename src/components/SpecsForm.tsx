import React, { useState, useEffect } from "react";
import { 
  Sliders, 
  Disc, 
  Settings as GearIcon, 
  Wind, 
  Link as ChainIcon, 
  Zap, 
  AlertCircle 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  CoreSpecsTab, 
  BearingsTab, 
  GearboxTab, 
  FansImpellersTab, 
  BeltsPulleysTab, 
  ElectricalTab 
} from "./EquipmentSpecs/Tabs";

interface SpecsFormProps {
  specs: Record<string, string>;
  handleSpecChange: (key: string, value: string) => void;
  equipmentType: string;
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

export default function SpecsForm({
  specs,
  handleSpecChange,
  equipmentType,
  numShafts,
  setNumShafts,
  shafts,
  setShafts
}: any) {
  // Available Tabs list based on conditional logic
  const showGearbox = specs.driveType === "Gear Drive" || equipmentType === "Gearbox";
  const showFans = equipmentType === "Ventilation Fan" || equipmentType === "Pump Unit";
  const showBelts = specs.driveType === "Belt Drive";
  const showElectrical = equipmentType === "Electric Motor";

  const tabsConfig = [
    { id: "core", label: "Core Specs", icon: Sliders, visible: true },
    { id: "bearings", label: "Bearings", icon: Disc, visible: true },
    { id: "gearbox", label: "Gearbox", icon: GearIcon, visible: showGearbox },
    { id: "fans", label: "Fans/Impellers", icon: Wind, visible: showFans },
    { id: "belts", label: "Belts & Pulleys", icon: ChainIcon, visible: showBelts },
    { id: "electrical", label: "Electrical", icon: Zap, visible: showElectrical }
  ];

  const visibleTabs = tabsConfig.filter(t => t.visible);
  const [activeTab, setActiveTab] = useState<string>("core");

  // Keep active tab safe if visibility changes
  useEffect(() => {
    const isCurrentTabVisible = visibleTabs.some(t => t.id === activeTab);
    if (!isCurrentTabVisible && visibleTabs.length > 0) {
      setActiveTab("core");
    }
  }, [equipmentType, specs.driveType, activeTab]);

  // SMART DEFAULTS - Apply when equipmentType changes
  useEffect(() => {
    if (!equipmentType) return;

    // Apply defaults only if values aren't already set or are standard N/A
    const applyIfEmpty = (key: string, defaultValue: string) => {
      if (!specs[key] || specs[key] === "N/A" || specs[key] === "") {
        handleSpecChange(key, defaultValue);
      }
    };

    switch (equipmentType) {
      case "Pump Unit":
        applyIfEmpty("bearingType", "Ball");
        applyIfEmpty("driveType", "Direct Coupled");
        applyIfEmpty("pumpType", "Centrifugal");
        applyIfEmpty("fanBlades", "5"); // default impeller blades
        break;
      case "Electric Motor":
        applyIfEmpty("bearingType", "Ball");
        applyIfEmpty("driveType", "Direct Coupled");
        applyIfEmpty("lineFrequency", "60");
        applyIfEmpty("numPoles", "4");
        applyIfEmpty("motorType", "Induction");
        break;
      case "Ventilation Fan":
        applyIfEmpty("bearingType", "Ball");
        applyIfEmpty("driveType", "Belt Drive");
        applyIfEmpty("fanBlades", "8"); // default fan blades
        break;
      case "Gearbox":
        applyIfEmpty("bearingType", "Roller");
        applyIfEmpty("driveType", "Gear Drive");
        break;
      default:
        break;
    }
  }, [equipmentType]);

  // Client-side real-time validation check
  const validationError = (() => {
    if (!specs.specRpm || isNaN(parseFloat(specs.specRpm)) || parseFloat(specs.specRpm) <= 0) {
      return "Operating Speed (RPM) must be a positive number.";
    }
    if (showFans && specs.fanBlades && (isNaN(parseInt(specs.fanBlades)) || parseInt(specs.fanBlades) <= 0)) {
      return "Number of Blades/Vanes must be a positive integer.";
    }
    if (showElectrical && specs.numRotorBars && isNaN(parseInt(specs.numRotorBars))) {
      return "Number of Rotor Bars must be an integer.";
    }
    return null;
  })();

  const activeTabDetails = visibleTabs.find(t => t.id === activeTab) || visibleTabs[0];

  return (
    <div className="space-y-4">
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
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
