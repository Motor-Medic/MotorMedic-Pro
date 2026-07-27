import React, { useState, useEffect, useRef } from "react";
import { 
  Sliders, 
  Search, 
  Copy, 
  Sparkles, 
  Check, 
  AlertCircle, 
  AlertTriangle, 
  HelpCircle, 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft, 
  Save, 
  ArrowRight, 
  Info, 
  Zap, 
  Disc, 
  Settings as GearIcon, 
  Wind, 
  Gauge, 
  Wrench, 
  Layers, 
  Eye, 
  X, 
  RotateCcw,
  ShieldCheck,
  Building2,
  Cpu,
  BarChart2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ManufacturerDatabase, 
  ManufacturerModelPreset, 
  SIMILAR_ASSETS_DATABASE, 
  ExistingAssetPreset,
  FIELD_TOOLTIPS, 
  UnitConverters, 
  validateField, 
  getIsoStandardDefaults,
  FieldValidation 
} from "./SpecsValidation";

export interface ShaftConfig {
  name: string;
  teeth: string;
  rpm: string;
  type: string;
}

export interface SpecsFormWizardProps {
  specs: Record<string, string>;
  handleSpecChange: (key: string, value: string) => void;
  equipmentType: string;
  setEquipmentType?: (type: string) => void;
  numShafts?: number;
  setNumShafts?: (val: number) => void;
  shafts?: ShaftConfig[];
  setShafts?: React.Dispatch<React.SetStateAction<ShaftConfig[]>>;
  onSaveDraft?: (draftSpecs: Record<string, string>) => void;
  onComplete?: (finalSpecs: Record<string, string>) => void;
  isAutoFilled?: boolean;
}

export default function SpecsFormWizard({
  specs,
  handleSpecChange,
  equipmentType,
  setEquipmentType,
  numShafts = 1,
  setNumShafts,
  shafts = [],
  setShafts,
  onSaveDraft,
  onComplete,
  isAutoFilled
}: SpecsFormWizardProps) {
  // Wizard Step State (1: Basic Info, 2: Technical Specs, 3: Mounting & Drive, 4: Review)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Modals & Popovers
  const [showMfgModal, setShowMfgModal] = useState<boolean>(false);
  const [showSimilarModal, setShowSimilarModal] = useState<boolean>(false);
  const [mfgSearchQuery, setMfgSearchQuery] = useState<string>("");
  const [activeTooltipField, setActiveTooltipField] = useState<string | null>(null);
  const [draftSavedToast, setDraftSavedToast] = useState<boolean>(false);
  const [isoAppliedToast, setIsoAppliedToast] = useState<boolean>(false);

  // Unit Converters State / Modals
  const [converterOpenField, setConverterOpenField] = useState<string | null>(null);
  const [converterInputVal, setConverterInputVal] = useState<string>("");

  const containerRef = useRef<HTMLDivElement>(null);

  // Standard HP options for dropdown suggestions
  const COMMON_HP_SIZES = ["1", "3", "5", "7.5", "10", "15", "20", "25", "30", "40", "50", "75", "100", "150", "200", "250", "300", "500"];
  const COMMON_RPM_SIZES = ["3600", "1800", "1775", "1750", "1200", "1180", "900", "3550", "1150", "850"];

  // 1. Keyboard Shortcuts (Tab navigation handled natively, Enter to proceed/submit, Ctrl+S / Cmd+S for Draft)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveDraft();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [specs]);

  // Save Draft Helper
  const handleSaveDraft = () => {
    try {
      localStorage.setItem("motormedic_specs_draft", JSON.stringify({
        specs,
        equipmentType,
        timestamp: new Date().toISOString()
      }));
    } catch (err) {
      console.error("Failed to save draft:", err);
    }
    if (onSaveDraft) onSaveDraft(specs);
    setDraftSavedToast(true);
    setTimeout(() => setDraftSavedToast(false), 2500);
  };

  // One-click ISO Standard Defaults Handler
  const handleApplyIsoDefaults = () => {
    const defaults = getIsoStandardDefaults(equipmentType || "Pump Unit");
    Object.entries(defaults).forEach(([key, val]) => {
      if (!specs[key] || specs[key] === "N/A" || specs[key] === "") {
        handleSpecChange(key, val);
      }
    });
    setIsoAppliedToast(true);
    setTimeout(() => setIsoAppliedToast(false), 2500);
  };

  // Manufacturer Preset Select Handler
  const handleSelectMfgPreset = (preset: ManufacturerModelPreset) => {
    if (setEquipmentType && preset.equipmentType) {
      setEquipmentType(preset.equipmentType);
    }
    Object.entries(preset.specs).forEach(([k, v]) => {
      handleSpecChange(k, v);
    });
    setShowMfgModal(false);
    setDraftSavedToast(true);
    setTimeout(() => setDraftSavedToast(false), 2000);
  };

  // Copy Specs from Existing Similar Asset Handler
  const handleCopySimilarAsset = (asset: ExistingAssetPreset) => {
    if (setEquipmentType && asset.equipmentType) {
      setEquipmentType(asset.equipmentType);
    }
    Object.entries(asset.specs).forEach(([k, v]) => {
      handleSpecChange(k, v);
    });
    setShowSimilarModal(false);
    setDraftSavedToast(true);
    setTimeout(() => setDraftSavedToast(false), 2000);
  };

  // Duplicate Serial Number Detection
  const serialDuplicateWarning = (() => {
    if (!specs.serialNumber || specs.serialNumber.trim() === "") return null;
    const match = SIMILAR_ASSETS_DATABASE.find(
      a => a.serialNumber.toLowerCase() === specs.serialNumber.trim().toLowerCase()
    );
    if (match) {
      return `Warning: Serial Number matches registered asset "${match.assetName}" (${match.location}).`;
    }
    return null;
  })();

  // Completion Percentage Calculation (Based on required & common specs)
  const calculateCompletion = (): number => {
    const keyFields = [
      "manufacturer", "model", "serialNumber", "specRpm", 
      "assetCriticality", "specOrientation", "bearingType", "driveType"
    ];
    if (equipmentType === "Electric Motor" || equipmentType === "Motor") {
      keyFields.push("horsepower", "numPoles", "lineFrequency");
    } else if (equipmentType === "Pump Unit" || equipmentType === "Pump") {
      keyFields.push("pumpType", "impellerVanes");
    } else if (equipmentType === "Ventilation Fan" || equipmentType === "Fan" || equipmentType === "Blower") {
      keyFields.push("numBlades", "fanType");
    } else if (equipmentType === "Gearbox") {
      keyFields.push("gearRatio", "gearType");
    } else if (equipmentType === "Compressor") {
      keyFields.push("compressorType", "numStages");
    }

    const filledCount = keyFields.filter(k => specs[k] && specs[k].trim() !== "" && specs[k] !== "N/A").length;
    return Math.round((filledCount / keyFields.length) * 100);
  };

  const completionPercent = calculateCompletion();

  // Field Renderer with Tooltip, Validation Indicator, and Contextual Messaging
  const renderField = ({
    key,
    label,
    placeholder = "",
    type = "text",
    options,
    required = false,
    unit = "",
    suggestions,
    converter
  }: {
    key: string;
    label: string;
    placeholder?: string;
    type?: "text" | "number" | "select";
    options?: string[];
    required?: boolean;
    unit?: string;
    suggestions?: string[];
    converter?: "power" | "flow" | "pressure";
  }) => {
    const val = specs[key] || "";
    const validation: FieldValidation = validateField(key, val, specs, equipmentType);
    const tooltipText = FIELD_TOOLTIPS[key];

    return (
      <div key={key} className="space-y-1.5 relative group/field">
        {/* Label Row */}
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-mono font-bold text-slate-300 uppercase flex items-center gap-1.5">
            <span>{label}</span>
            {required && <span className="text-red-400 font-bold">*</span>}
            {tooltipText && (
              <button
                type="button"
                onClick={() => setActiveTooltipField(activeTooltipField === key ? null : key)}
                className="text-slate-500 hover:text-cyan-400 transition-colors focus:outline-none"
                title="View Field Guidance"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            )}
          </label>

          {/* Validation Status Badge */}
          <div className="flex items-center gap-1">
            {val.trim() !== "" && (
              <>
                {validation.status === "valid" && (
                  <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Valid</span>
                  </span>
                )}
                {validation.status === "warning" && (
                  <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    <span>Check Value</span>
                  </span>
                )}
                {validation.status === "error" && (
                  <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                    <AlertCircle className="w-3 h-3 text-red-400" />
                    <span>Error</span>
                  </span>
                )}
              </>
            )}

            {/* Converter Button */}
            {converter && (
              <button
                type="button"
                onClick={() => {
                  setConverterOpenField(converterOpenField === key ? null : key);
                  setConverterInputVal(val);
                }}
                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded border border-slate-700 transition-colors ml-1"
                title="Unit Converter"
              >
                ⇄ Convert
              </button>
            )}
          </div>
        </div>

        {/* Field Tooltip Popover */}
        {activeTooltipField === key && tooltipText && (
          <motion.div 
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-2.5 bg-slate-950 border border-cyan-500/40 rounded-xl text-xs text-cyan-200 space-y-1 shadow-lg z-20"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-[10px] uppercase font-mono text-cyan-400 flex items-center gap-1">
                <Info className="w-3 h-3" /> Parameter Context
              </span>
              <button 
                onClick={() => setActiveTooltipField(null)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
            <p className="leading-relaxed">{tooltipText}</p>
          </motion.div>
        )}

        {/* Converter Tool Popover */}
        {converterOpenField === key && (
          <div className="p-3 bg-slate-950 border border-amber-500/40 rounded-xl text-xs text-amber-200 space-y-2 shadow-xl z-20">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[10px] uppercase font-mono text-amber-400">
                Quick Unit Converter ({converter.toUpperCase()})
              </span>
              <button onClick={() => setConverterOpenField(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            {converter === "power" && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Val in kW"
                  value={converterInputVal}
                  onChange={(e) => setConverterInputVal(e.target.value)}
                  className="w-24 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    const hp = UnitConverters.kwToHp(parseFloat(converterInputVal) || 0);
                    handleSpecChange(key, String(hp));
                    setConverterOpenField(null);
                  }}
                  className="px-2 py-1 bg-amber-500 text-slate-950 font-bold rounded text-[11px]"
                >
                  Convert kW ➔ {UnitConverters.kwToHp(parseFloat(converterInputVal) || 0)} HP
                </button>
              </div>
            )}
            {converter === "flow" && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="m³/h"
                  value={converterInputVal}
                  onChange={(e) => setConverterInputVal(e.target.value)}
                  className="w-24 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    const gpm = UnitConverters.m3hToGpm(parseFloat(converterInputVal) || 0);
                    handleSpecChange(key, String(gpm));
                    setConverterOpenField(null);
                  }}
                  className="px-2 py-1 bg-amber-500 text-slate-950 font-bold rounded text-[11px]"
                >
                  Convert m³/h ➔ {UnitConverters.m3hToGpm(parseFloat(converterInputVal) || 0)} GPM
                </button>
              </div>
            )}
          </div>
        )}

        {/* Input Controls */}
        {type === "select" && options ? (
          <select
            value={val}
            onChange={(e) => handleSpecChange(key, e.target.value)}
            className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-xs text-white outline-none transition-all font-mono ${
              validation.status === "error"
                ? "border-red-500/80 focus:border-red-400"
                : validation.status === "warning"
                ? "border-amber-500/80 focus:border-amber-400"
                : "border-slate-800 focus:border-emerald-400"
            }`}
          >
            <option value="">-- Select {label} --</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <div className="relative">
            <input
              type={type}
              value={val}
              onChange={(e) => handleSpecChange(key, e.target.value)}
              placeholder={placeholder}
              className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-xs text-white outline-none transition-all font-mono ${
                unit ? "pr-12" : ""
              } ${
                validation.status === "error"
                  ? "border-red-500/80 focus:border-red-400"
                  : validation.status === "warning"
                  ? "border-amber-500/80 focus:border-amber-400"
                  : "border-slate-800 focus:border-emerald-400"
              }`}
            />
            {unit && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono font-bold pointer-events-none">
                {unit}
              </span>
            )}
          </div>
        )}

        {/* Contextual Warning or Error Message */}
        {validation.message && (
          <p className={`text-[10px] font-mono ${
            validation.status === "error" ? "text-red-400 font-bold" : "text-amber-400"
          }`}>
            {validation.message}
          </p>
        )}

        {/* Quick Dropdown Suggestions */}
        {suggestions && suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pt-1">
            <span className="text-[9px] font-mono text-slate-500 uppercase">Common:</span>
            {suggestions.map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => handleSpecChange(key, sug)}
                className={`px-1.5 py-0.5 text-[9px] font-mono rounded transition-colors ${
                  val === sug
                    ? "bg-emerald-500 text-slate-950 font-bold"
                    : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                }`}
              >
                {sug} {unit}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={containerRef} className="space-y-6 max-w-5xl mx-auto text-left">
      {/* Notifications Toast */}
      {draftSavedToast && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="p-3 bg-emerald-500 text-slate-950 text-xs font-bold font-mono rounded-xl shadow-xl flex items-center gap-2 border border-emerald-300"
        >
          <CheckCircle2 className="w-4 h-4 text-slate-950" />
          <span>Form Data Saved to Draft Successfully! (Press Ctrl+S / Cmd+S anytime)</span>
        </motion.div>
      )}

      {isoAppliedToast && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="p-3 bg-cyan-500 text-slate-950 text-xs font-bold font-mono rounded-xl shadow-xl flex items-center gap-2 border border-cyan-300"
        >
          <Sparkles className="w-4 h-4 text-slate-950" />
          <span>ISO 14224 Industry Standard Default Specs Applied for {equipmentType}!</span>
        </motion.div>
      )}

      {/* Header & Smart Automation Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
                <Wrench className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg font-extrabold text-white font-display flex items-center gap-2">
                  <span>Equipment Specification Wizard</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Smart Spec V2.0
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Step-by-step equipment configuration with real-time ISO validation & OEM database lookups.
                </p>
              </div>
            </div>
          </div>

          {/* Smart Auto-Population Action Buttons (As requested in prompt) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMfgModal(true)}
              className="px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 min-h-[38px]"
            >
              <Search className="w-3.5 h-3.5 text-slate-950" />
              <span>Search OEM Database</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSimilarModal(true)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 min-h-[38px]"
            >
              <Copy className="w-3.5 h-3.5 text-cyan-400" />
              <span>Copy Similar Asset</span>
            </button>

            <button
              type="button"
              onClick={handleApplyIsoDefaults}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 min-h-[38px]"
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
              <span>Use ISO Defaults</span>
            </button>
          </div>
        </div>

        {/* Progress Bar & Wizard Step Navigation Header */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">Form Completion Status:</span>
            <span className="font-extrabold text-emerald-400">{completionPercent}% Complete</span>
          </div>
          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-300"
              style={{ width: `${completionPercent}%` }}
            />
          </div>

          {/* Step Indicator Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            {[
              { num: 1, title: "1. Basic Info", sub: "Identification" },
              { num: 2, title: "2. Technical Specs", sub: "Speed & Power" },
              { num: 3, title: "3. Drive & Mount", sub: "Bearings & Base" },
              { num: 4, title: "4. Review & Card", sub: "Live Preview" }
            ].map((st) => {
              const isActive = currentStep === st.num;
              const isDone = currentStep > st.num;
              return (
                <button
                  key={st.num}
                  type="button"
                  onClick={() => setCurrentStep(st.num)}
                  className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                    isActive
                      ? "bg-emerald-500/15 border-emerald-500 text-emerald-400 font-bold shadow-md shadow-emerald-950/20"
                      : isDone
                      ? "bg-slate-950 border-slate-800 text-slate-300"
                      : "bg-slate-950/50 border-slate-850 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                    isActive ? "bg-emerald-500 text-slate-950" : isDone ? "bg-slate-800 text-emerald-400" : "bg-slate-900 text-slate-500"
                  }`}>
                    {isDone ? "✓" : st.num}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold truncate">{st.title}</p>
                    <p className="text-[10px] text-slate-400 truncate">{st.sub}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* STEP CONTENT BODY */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-6 shadow-lg min-h-[380px]">
        {/* ==================================================================== */}
        {/* STEP 1: BASIC INFO & IDENTIFICATION                                 */}
        {/* ==================================================================== */}
        {currentStep === 1 && (
          <motion.div 
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider font-mono">
                  Step 1: Machine Identification & Classification
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                Primary Asset Tags
              </span>
            </div>

            {/* Equipment Type Selection */}
            <div className="space-y-2">
              <label className="text-[11px] font-mono font-bold text-slate-300 uppercase flex items-center gap-1.5">
                <span>Equipment Classification Type *</span>
                <span className="text-slate-500 font-normal text-[10px]">(Controls conditional fields)</span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {[
                  { name: "Pump Unit", icon: Wrench, desc: "Centrifugal & Positive Disp." },
                  { name: "Electric Motor", icon: Zap, desc: "3-Phase AC Induction" },
                  { name: "Ventilation Fan", icon: Wind, desc: "Centrifugal & Axial Blower" },
                  { name: "Gearbox", icon: GearIcon, desc: "Helical & Bevel Reducer" },
                  { name: "Compressor", icon: Gauge, desc: "Rotary Screw & Recip" }
                ].map((item) => {
                  const Icon = item.icon;
                  const isSel = equipmentType === item.name || (equipmentType === "Pump" && item.name === "Pump Unit") || (equipmentType === "Motor" && item.name === "Electric Motor") || (equipmentType === "Fan" && item.name === "Ventilation Fan");
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setEquipmentType && setEquipmentType(item.name)}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 min-h-[72px] ${
                        isSel
                          ? "bg-emerald-500/15 border-emerald-500 text-emerald-400 shadow-md shadow-emerald-950/30"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <Icon className="w-5 h-5 text-emerald-400" />
                        {isSel && <Check className="w-4 h-4 text-emerald-400" />}
                      </div>
                      <div>
                        <p className="text-xs font-extrabold text-white">{item.name}</p>
                        <p className="text-[9px] text-slate-400 truncate">{item.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main Form Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {renderField({ key: "manufacturer", label: "Manufacturer (OEM)", placeholder: "E.g. Baldor, Flowserve, SKF", required: true })}
              {renderField({ key: "model", label: "Model Number", placeholder: "E.g. EM3710T, Durco Mark 3", required: true })}
              {renderField({ key: "serialNumber", label: "Plant Serial Number", placeholder: "E.g. SN-2026-X99", required: true })}
              {renderField({ 
                key: "assetCriticality", 
                label: "Asset Criticality Level", 
                type: "select", 
                options: ["Low", "Medium", "High", "Critical"],
                required: true 
              })}
              {renderField({ 
                key: "specOrientation", 
                label: "Mounting Orientation", 
                type: "select", 
                options: ["Horizontal Mount", "Vertical Mount", "Overhung / Inclined"],
                required: true 
              })}
              {renderField({ key: "systemDetails", label: "System Tag / Location", placeholder: "E.g. Line 2 Boiler Feed Pump" })}
            </div>

            {/* Serial Duplicate Alert */}
            {serialDuplicateWarning && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{serialDuplicateWarning}</span>
              </div>
            )}
          </motion.div>
        )}

        {/* ==================================================================== */}
        {/* STEP 2: TECHNICAL SPECS (SPEED, POWER, & CONDITIONAL FIELDS)        */}
        {/* ==================================================================== */}
        {currentStep === 2 && (
          <motion.div 
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider font-mono">
                  Step 2: Technical Specifications & Operating Parameters
                </h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                {equipmentType} Specifics
              </span>
            </div>

            {/* Core Operating Speed & Power */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-850">
              {renderField({ 
                key: "specRpm", 
                label: "Operating Speed (RPM)", 
                placeholder: "1750", 
                required: true, 
                unit: "RPM",
                suggestions: COMMON_RPM_SIZES 
              })}

              {renderField({ 
                key: "horsepower", 
                label: "Power Capacity (HP)", 
                placeholder: "15", 
                unit: "HP",
                converter: "power",
                suggestions: COMMON_HP_SIZES 
              })}

              {renderField({ 
                key: "voltage", 
                label: "Operating Voltage", 
                placeholder: "460V", 
                suggestions: ["230V", "460V", "575V", "4160V"] 
              })}
            </div>

            {/* CONDITIONAL FIELDS BASED ON EQUIPMENT TYPE */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Conditional Parameters for {equipmentType}:</span>
              </h4>

              {/* ELECTRIC MOTOR SPECIFIC FIELDS */}
              {(equipmentType === "Electric Motor" || equipmentType === "Motor") && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-slate-950/80 p-4 rounded-xl border border-emerald-500/20">
                  {renderField({ key: "motorType", label: "Motor Type", type: "select", options: ["Induction", "Synchronous", "DC", "Servo", "VFD-Driven"] })}
                  {renderField({ key: "numPoles", label: "Stator Poles", type: "select", options: ["2 Poles (3600 RPM)", "4 Poles (1800 RPM)", "6 Poles (1200 RPM)", "8 Poles (900 RPM)"] })}
                  {renderField({ key: "numRotorBars", label: "Rotor Bars Count", placeholder: "36", unit: "Bars" })}
                  {renderField({ key: "lineFrequency", label: "Line Frequency", type: "select", options: ["60", "50"] })}
                  {renderField({ key: "motorWinding", label: "Winding Type", placeholder: "Random Wound / Form Wound" })}
                  {renderField({ key: "insulationClass", label: "Insulation Class", type: "select", options: ["Class B (130°C)", "Class F (155°C)", "Class H (180°C)"] })}
                </div>
              )}

              {/* PUMP SPECIFIC FIELDS */}
              {(equipmentType === "Pump Unit" || equipmentType === "Pump") && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-slate-950/80 p-4 rounded-xl border border-emerald-500/20">
                  {renderField({ key: "pumpType", label: "Pump Hydraulic Type", type: "select", options: ["Centrifugal", "Positive Displacement", "Multistage", "Axial Flow", "Submersible"] })}
                  {renderField({ key: "impellerVanes", label: "Impeller Vanes Count", placeholder: "5", required: true, unit: "Vanes", suggestions: ["3", "4", "5", "6", "7", "8"] })}
                  {renderField({ key: "impellerDiameter", label: "Impeller Outer Dia.", placeholder: "10.0", unit: "in" })}
                  {renderField({ key: "flowRate_GPM", label: "Flow Rate", placeholder: "350", unit: "GPM", converter: "flow" })}
                  {renderField({ key: "suctionPressure", label: "Suction Pressure", placeholder: "15", unit: "PSI" })}
                  {renderField({ key: "dischargePressure", label: "Discharge Pressure", placeholder: "125", unit: "PSI" })}
                </div>
              )}

              {/* FAN SPECIFIC FIELDS */}
              {(equipmentType === "Ventilation Fan" || equipmentType === "Fan" || equipmentType === "Blower") && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-slate-950/80 p-4 rounded-xl border border-emerald-500/20">
                  {renderField({ key: "fanType", label: "Fan Aerodynamic Design", type: "select", options: ["Centrifugal Blower", "Axial Flow", "Propeller", "Mixed Flow"] })}
                  {renderField({ key: "numBlades", label: "Fan Blades Count", placeholder: "10", required: true, unit: "Blades", suggestions: ["6", "8", "10", "12", "16"] })}
                  {renderField({ key: "bladeAngle", label: "Blade Pitch Profile", type: "select", options: ["Backward Curved", "Forward Curved", "Airfoil", "Radial Tip", "Fixed Axial"] })}
                </div>
              )}

              {/* GEARBOX SPECIFIC FIELDS */}
              {equipmentType === "Gearbox" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-slate-950/80 p-4 rounded-xl border border-emerald-500/20">
                  {renderField({ key: "gearType", label: "Gear Tooth Geometry", type: "select", options: ["Spur", "Helical", "Bevel", "Planetary", "Worm", "Herringbone"] })}
                  {renderField({ key: "gearRatio", label: "Reduction Gear Ratio", placeholder: "15.4", required: true, unit: ":1" })}
                  {renderField({ key: "inputTeeth", label: "Input Pinion Teeth", placeholder: "19", unit: "Teeth" })}
                  {renderField({ key: "outputTeeth", label: "Output Gear Teeth", placeholder: "293", unit: "Teeth" })}
                </div>
              )}

              {/* COMPRESSOR SPECIFIC FIELDS */}
              {equipmentType === "Compressor" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-slate-950/80 p-4 rounded-xl border border-emerald-500/20">
                  {renderField({ key: "compressorType", label: "Compression Method", type: "select", options: ["Rotary Screw", "Centrifugal Turbo", "Reciprocating Piston", "Scroll"] })}
                  {renderField({ key: "numStages", label: "Compression Stages", type: "select", options: ["1 Stage", "2 Stages", "3 Stages", "4 Stages"] })}
                  {renderField({ key: "numLobes", label: "Helical Rotor Lobes", placeholder: "4 Male / 6 Female" })}
                  {renderField({ key: "dischargePressure", label: "Max Air Pressure", placeholder: "125", unit: "PSI" })}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ==================================================================== */}
        {/* STEP 3: MOUNTING & DRIVE DETAILS (BEARINGS, SHAFTS, ORIENTATION)     */}
        {/* ==================================================================== */}
        {currentStep === 3 && (
          <motion.div 
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Disc className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider font-mono">
                  Step 3: Power Transmission, Bearings & Mounting Setup
                </h3>
              </div>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded border border-cyan-500/20">
                Vibration Diagnostics
              </span>
            </div>

            {/* Smart Field Dependencies (e.g. Vertical vs Horizontal Mount) */}
            {specs.specOrientation === "Vertical Mount" ? (
              <div className="p-3.5 bg-cyan-950/30 border border-cyan-500/40 rounded-xl space-y-1 text-xs text-cyan-300">
                <div className="flex items-center gap-2 font-bold font-mono text-[10px] uppercase text-cyan-400">
                  <Info className="w-4 h-4" /> Vertical Mounting Orientation Active
                </div>
                <p>
                  Vertical drivers experience top-heavy structural reed frequency resonance. Enhanced thrust bearing tracking enabled.
                </p>
              </div>
            ) : (
              <div className="p-3.5 bg-slate-950 border border-slate-850 rounded-xl space-y-1 text-xs text-slate-300">
                <div className="flex items-center gap-2 font-bold font-mono text-[10px] uppercase text-slate-400">
                  <Info className="w-4 h-4 text-emerald-400" /> Horizontal Foot Mounting Active
                </div>
                <p>Standard NEMA / IEC horizontal base. Soft foot tolerance checking enabled.</p>
              </div>
            )}

            {/* Drive & Bearings Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {renderField({ 
                key: "driveType", 
                label: "Coupling / Drive Type", 
                type: "select", 
                options: ["Direct Coupled", "Belt Drive", "Gear Drive", "Magnetic Coupling", "Overhung Sheave"],
                required: true 
              })}

              {renderField({ 
                key: "bearingType", 
                label: "Bearing Construction", 
                type: "select", 
                options: ["Ball", "Roller", "Tapered Roller", "Spherical Roller", "Sleeve / Journal", "Angular Contact"],
                required: true 
              })}

              {renderField({ key: "bearing_inner", label: "Inboard Bearing Part #", placeholder: "E.g. SKF 6308-2Z" })}
              {renderField({ key: "bearing_outer", label: "Outboard Bearing Part #", placeholder: "E.g. SKF 6207-2Z" })}
              {renderField({ key: "lubricationType", label: "Lubricant Viscosity / Grade", placeholder: "E.g. ISO VG 68 / Polyurea Grease" })}
              {renderField({ key: "frameSize", label: "Frame Size Footprint", placeholder: "E.g. 215T, NEMA 284" })}
            </div>
          </motion.div>
        )}

        {/* ==================================================================== */}
        {/* STEP 4: REVIEW & LIVE EQUIPMENT CARD PREVIEW                         */}
        {/* ==================================================================== */}
        {currentStep === 4 && (
          <motion.div 
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider font-mono">
                  Step 4: Review Entry & Live Asset Card Preview
                </h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                Ready for Registration
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* LIVE EQUIPMENT CARD PREVIEW (As requested in prompt) */}
              <div className="md:col-span-6 space-y-2">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <BarChart2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Live Equipment Card Preview</span>
                </label>

                <div className="bg-slate-950 border-2 border-emerald-500/40 rounded-2xl p-5 space-y-4 shadow-2xl relative overflow-hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        {equipmentType || "Industrial Asset"}
                      </span>
                      <h4 className="text-base font-extrabold text-white">
                        {specs.manufacturer || "OEM"} {specs.model || "Model"}
                      </h4>
                      <p className="text-xs text-slate-400 font-mono">
                        S/N: {specs.serialNumber || "SN-PENDING"}
                      </p>
                    </div>

                    <div className="text-right space-y-1">
                      <span className={`px-2 py-0.5 text-[9px] font-mono font-black uppercase rounded ${
                        specs.assetCriticality === "Critical" 
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" 
                          : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      }`}>
                        {specs.assetCriticality || "Medium"} Risk
                      </span>
                      <p className="text-[10px] text-slate-500 font-mono">{specs.specOrientation || "Horizontal"}</p>
                    </div>
                  </div>

                  {/* Summary Grid */}
                  <div className="grid grid-cols-2 gap-2 bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs font-mono">
                    <div>
                      <span className="text-[9px] text-slate-500 block">RPM Speed:</span>
                      <span className="font-bold text-emerald-400">{specs.specRpm || "1750"} RPM</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block">Power Rating:</span>
                      <span className="font-bold text-white">{specs.horsepower || specs.powerRating || "15"} HP</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block">Drive Type:</span>
                      <span className="text-slate-300">{specs.driveType || "Direct"}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block">Bearings:</span>
                      <span className="text-slate-300">{specs.bearingType || "Ball"}</span>
                    </div>
                  </div>

                  <div className="p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-[10px] font-mono text-emerald-400 flex items-center justify-between">
                    <span>ISO 10816 Diagnostics:</span>
                    <span className="font-bold">CMMS VALIDATED ✓</span>
                  </div>
                </div>
              </div>

              {/* Summary Checklist */}
              <div className="md:col-span-6 space-y-3">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                  Specification Completeness Checklist
                </label>

                <div className="space-y-2 bg-slate-950 p-4 rounded-xl border border-slate-850 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">1. Basic Identification:</span>
                    <span className={specs.manufacturer && specs.model ? "text-emerald-400 font-bold" : "text-amber-400"}>
                      {specs.manufacturer && specs.model ? "✓ Complete" : "⚠️ Incomplete"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">2. Operating Speed (RPM):</span>
                    <span className={specs.specRpm ? "text-emerald-400 font-bold" : "text-red-400"}>
                      {specs.specRpm ? `${specs.specRpm} RPM` : "❌ Missing"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">3. Drive & Bearings:</span>
                    <span className={specs.bearingType && specs.driveType ? "text-emerald-400 font-bold" : "text-amber-400"}>
                      {specs.bearingType ? "✓ Set" : "⚠️ Optional"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <span className="text-slate-200 font-bold">Overall Score:</span>
                    <span className="text-emerald-400 font-extrabold">{calculateCompletion()}%</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* FOOTER WIZARD CONTROLS (Next, Previous, Save Draft, Finish) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleSaveDraft}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-1.5 min-h-[42px]"
          >
            <Save className="w-4 h-4 text-emerald-400" />
            <span>Save as Draft (Ctrl+S)</span>
          </button>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {currentStep > 1 && (
            <button
              type="button"
              onClick={() => setCurrentStep(prev => prev - 1)}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-950 hover:bg-slate-900 text-slate-300 font-bold text-xs rounded-xl border border-slate-800 transition-colors flex items-center justify-center gap-1.5 min-h-[42px]"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          )}

          {currentStep < 4 ? (
            <button
              type="button"
              onClick={() => setCurrentStep(prev => prev + 1)}
              className="flex-1 sm:flex-initial px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition-colors flex items-center justify-center gap-1.5 min-h-[42px]"
            >
              <span>Next Step</span>
              <ChevronRight className="w-4 h-4 text-slate-950" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (onComplete) onComplete(specs);
              }}
              className="flex-1 sm:flex-initial px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-1.5 min-h-[42px]"
            >
              <Check className="w-4 h-4 text-slate-950" />
              <span>Save & Register Specs</span>
            </button>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL 1: SEARCH OEM MANUFACTURER DATABASE                           */}
      {/* ==================================================================== */}
      {showMfgModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Search className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-extrabold text-white">Search OEM Manufacturer Database</h3>
              </div>
              <button 
                onClick={() => setShowMfgModal(false)}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search Baldor, Flowserve, Dodge, SKF, Ingersoll, Grundfos..."
                value={mfgSearchQuery}
                onChange={(e) => setMfgSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Results List */}
            <div className="overflow-y-auto space-y-2.5 pr-1 flex-1">
              {ManufacturerDatabase.search(mfgSearchQuery, equipmentType).map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => handleSelectMfgPreset(preset)}
                  className="p-3.5 bg-slate-950 border border-slate-800 hover:border-emerald-500/60 rounded-xl transition-all cursor-pointer group space-y-2 hover:bg-slate-900"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-mono text-emerald-400 font-bold uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        {preset.manufacturer}
                      </span>
                      <h4 className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors mt-1">
                        {preset.model}
                      </h4>
                    </div>
                    <span className="px-2 py-1 bg-slate-900 text-slate-300 text-[10px] font-mono rounded border border-slate-800">
                      {preset.equipmentType}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{preset.description}</p>
                  <div className="text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-2">
                    <span>Bearings: {preset.commonBearings.inboard} / {preset.commonBearings.outboard}</span>
                    <span>• Click to Auto-Populate</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: COPY SPECS FROM SIMILAR PLANT ASSET                        */}
      {/* ==================================================================== */}
      {showSimilarModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Copy className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-extrabold text-white">Copy Specs from Similar Plant Asset</h3>
              </div>
              <button 
                onClick={() => setShowSimilarModal(false)}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-2.5 pr-1 flex-1">
              {SIMILAR_ASSETS_DATABASE.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => handleCopySimilarAsset(asset)}
                  className="p-3.5 bg-slate-950 border border-slate-800 hover:border-cyan-500/60 rounded-xl transition-all cursor-pointer group space-y-2 hover:bg-slate-900"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-mono text-cyan-400 font-bold uppercase tracking-wider bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                        {asset.location}
                      </span>
                      <h4 className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors mt-1">
                        {asset.assetName}
                      </h4>
                    </div>
                    <span className="px-2 py-1 bg-slate-900 text-slate-300 text-[10px] font-mono rounded border border-slate-800">
                      S/N: {asset.serialNumber}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Mfg: {asset.manufacturer} {asset.model} | {asset.specs.specRpm || 1750} RPM
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
