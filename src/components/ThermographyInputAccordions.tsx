import React, { useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  QrCode,
  Upload
} from "lucide-react";

type IrAccordionSection = "asset" | "physics" | "ingestion" | "camera";

const PLANTS = ["Main Substation", "Powerhouse", "Process Plant A", "Utilities Yard"] as const;

const AREA_BY_PLANT: Record<string, string[]> = {
  "Main Substation": ["Breaker Panel 4", "Transformer Bay 1", "Bus Duct Run A"],
  Powerhouse: ["MCC Room 2", "Turbine Deck", "Switchgear Line"],
  "Process Plant A": ["Compressor Shelter", "Extrusion Hall", "Cooling Tower"],
  "Utilities Yard": ["Pad Mount XFMR", "VFD Skid", "Pump House"]
};

const UNIT_BY_AREA: Record<string, string[]> = {
  "Breaker Panel 4": ["Breaker 2B", "Breaker 2A", "Breaker 3C"],
  "Transformer Bay 1": ["XFMR-T1", "XFMR-T2"],
  "Bus Duct Run A": ["Joint J-12", "Joint J-18"],
  "MCC Room 2": ["MCC Bucket 14", "MCC Bucket 22"],
  "Turbine Deck": ["Unit 1 Aux", "Unit 2 Aux"],
  "Switchgear Line": ["Cubicle 3A", "Cubicle 3B"],
  "Compressor Shelter": ["C-37 Drive", "C-37 Starter"],
  "Extrusion Hall": ["Line 3 Drive", "Line 3 Gearbox"],
  "Cooling Tower": ["Fan Cell 4", "Pump Skid"],
  "Pad Mount XFMR": ["Primary Bushing", "Secondary Lug"],
  "VFD Skid": ["Heat Sink Bank", "Input Contactor"],
  "Pump House": ["P-101A Motor", "P-101B Motor"]
};

const ASSET_BY_UNIT: Record<string, string[]> = {
  "Breaker 2B": ["L1 Lug", "L2 Lug", "L3 Lug", "Load Side Stabs"],
  "Breaker 2A": ["L1 Lug", "L2 Lug", "L3 Lug"],
  "Breaker 3C": ["Line Side", "Load Side"],
  "XFMR-T1": ["HV Bushing A", "LV Bushing A", "Tank Wall"],
  "XFMR-T2": ["HV Bushing B", "Radiator"],
  "Joint J-12": ["Phase A Joint", "Phase B Joint"],
  "Joint J-18": ["Phase C Joint"],
  "MCC Bucket 14": ["Contactor Line", "Overload Heater"],
  "MCC Bucket 22": ["Terminal Block", "Fuse Clip"],
  "Unit 1 Aux": ["Bearing Housing", "Coupling Guard"],
  "Unit 2 Aux": ["NDE Bearing", "DE Bearing"],
  "Cubicle 3A": ["Bus Bar Joint", "Cable Lug"],
  "Cubicle 3B": ["PT Fuse", "CT Secondary"],
  "C-37 Drive": ["VFD Heat Sink", "Output Terminals"],
  "C-37 Starter": ["Line Contactor"],
  "Line 3 Drive": ["Motor Terminal Box", "VFD Cabinet"],
  "Line 3 Gearbox": ["Input Bearing", "Output Bearing"],
  "Fan Cell 4": ["Motor DE", "Gearbox Housing"],
  "Pump Skid": ["Seal Housing", "Coupling"],
  "Primary Bushing": ["Phase A", "Phase B", "Phase C"],
  "Secondary Lug": ["Phase A Lug", "Neutral"],
  "Heat Sink Bank": ["Module Bank 1", "Module Bank 2"],
  "Input Contactor": ["Line Lugs"],
  "P-101A Motor": ["DE Bearing", "Terminal Box"],
  "P-101B Motor": ["DE Bearing", "Terminal Box"]
};

const COMPONENT_OPTS = ["L1 Lug", "L2 Lug", "L3 Lug", "Load Side Stabs", "Housing", "Other"];

const NFPA_CLASSES = [
  "Switchgear",
  "Motor Control Center (MCC)",
  "Transformer (Oil-filled)",
  "Transformer (Dry)",
  "Bus Duct",
  "VFD",
  "Bearing Housing",
  "Gearbox",
  "Other"
] as const;

const RATED_VOLTAGES = ["208V", "240V", "480V", "600V", "2400V", "4160V", "13.8kV", "34.5kV"] as const;

const EMISSIVITY_PRESETS = [
  { label: "Copper - Oxidized (0.65)", value: "0.65" },
  { label: "Copper - Polished (0.05)", value: "0.05" },
  { label: "Electrical Tape (0.95)", value: "0.95" },
  { label: "Stainless Steel (0.20)", value: "0.20" },
  { label: "Painted Surface (0.90-0.95)", value: "0.93" },
  { label: "Bare Aluminum (0.10)", value: "0.10" },
  { label: "Custom / Manual…", value: "custom" }
] as const;

const TEMP_RANGES = [
  "Auto",
  "-4°F to 248°F",
  "32°F to 662°F",
  "up to 2192°F"
] as const;

const COLOR_PALETTES = ["Ironbow", "Rainbow", "High Contrast", "Grayscale", "Arctic"] as const;
const FOCUS_MODES = ["Auto", "Manual", "LaserSharp"] as const;
const MEASUREMENT_TOOLS = ["Spot Meter", "Area Box", "Delta-T Marker", "Isotherm Alarm"] as const;

const fieldLabel = "text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block";
const inputCls =
  "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 transition-all outline-none";
const selectCls = `${inputCls} appearance-none cursor-pointer pr-10`;
const helperCls = "mt-1.5 text-[11px] text-slate-500 leading-snug";

function AccordionShell({
  id,
  title,
  open,
  onToggle,
  children
}: {
  id: IrAccordionSection;
  title: string;
  open: boolean;
  onToggle: (id: IrAccordionSection) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-xl mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full p-4 flex justify-between items-center cursor-pointer hover:bg-slate-800/50 transition-colors bg-slate-900"
        aria-expanded={open}
      >
        <span className="text-sm font-bold text-white uppercase tracking-wider text-left">
          {title}
        </span>
        <ChevronDown
          className={`h-5 w-5 text-slate-400 shrink-0 transition-transform duration-300 ${
            open ? "rotate-180 text-yellow-400" : ""
          }`}
        />
      </button>
      {open && (
        <div className="p-6 border-t border-white/5 bg-slate-950/30 space-y-5">{children}</div>
      )}
    </div>
  );
}

export interface ThermographyInputAccordionsProps {
  onToast?: (message: string, type?: "success" | "info" | "warning" | "error") => void;
}

export default function ThermographyInputAccordions({
  onToast
}: ThermographyInputAccordionsProps) {
  const [openSections, setOpenSections] = useState<IrAccordionSection[]>([
    "asset",
    "physics",
    "ingestion"
  ]);

  // Section 1 — hierarchy
  const [plant, setPlant] = useState<string>(PLANTS[0]);
  const [area, setArea] = useState<string>(AREA_BY_PLANT[PLANTS[0]][0]);
  const [unit, setUnit] = useState<string>(UNIT_BY_AREA[AREA_BY_PLANT[PLANTS[0]][0]][0]);
  const [asset, setAsset] = useState<string>(
    ASSET_BY_UNIT[UNIT_BY_AREA[AREA_BY_PLANT[PLANTS[0]][0]][0]]?.[0] ?? "L1 Lug"
  );
  const [component, setComponent] = useState<string>("L1 Lug");
  const [nfpaClass, setNfpaClass] = useState<string>("Switchgear");
  const [ratedAmps, setRatedAmps] = useState("400");
  const [measuredAmps, setMeasuredAmps] = useState("185");
  const [ratedVoltage, setRatedVoltage] = useState("480V");
  const [aiLoadNormalization, setAiLoadNormalization] = useState(true);
  const [deltaTBaseline, setDeltaTBaseline] = useState<string>(
    "Phase-to-Phase (L1 vs L2/L3)"
  );

  // Section 2 — physics
  const [tempUnit, setTempUnit] = useState<"°F" | "°C">("°F");
  const [ambientTemp, setAmbientTemp] = useState("68");
  const [humidity, setHumidity] = useState("45");
  const [windSpeed, setWindSpeed] = useState("0.5");
  const [solarCondition, setSolarCondition] = useState<"indoor" | "shaded" | "direct">("indoor");
  const [emissivityPreset, setEmissivityPreset] = useState("0.95");
  const [emissivityManual, setEmissivityManual] = useState("0.95");
  const [reflectedTemp, setReflectedTemp] = useState("72");
  const [distance, setDistance] = useState(3);
  const [distanceUnit, setDistanceUnit] = useState<"ft" | "m">("ft");

  // Section 3 — ingestion
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [visualRefEnabled, setVisualRefEnabled] = useState(false);
  const [visualRefName, setVisualRefName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const visualRef = useRef<HTMLInputElement>(null);

  // Section 4 — camera
  const [tempRange, setTempRange] = useState("Auto");
  const [colorPalette, setColorPalette] = useState("Ironbow");
  const [focusMode, setFocusMode] = useState("Auto");
  const [measurementTools, setMeasurementTools] = useState<string[]>([
    "Spot Meter",
    "Delta-T Marker"
  ]);

  const areaOptions = AREA_BY_PLANT[plant] ?? [];
  const unitOptions = UNIT_BY_AREA[area] ?? [];
  const assetOptions = ASSET_BY_UNIT[unit] ?? COMPONENT_OPTS;

  const loadPercent = useMemo(() => {
    const rated = parseFloat(ratedAmps);
    const measured = parseFloat(measuredAmps);
    if (!Number.isFinite(rated) || rated <= 0 || !Number.isFinite(measured)) return null;
    return Math.round((measured / rated) * 1000) / 10;
  }, [ratedAmps, measuredAmps]);

  const effectiveEmissivity =
    emissivityPreset === "custom" ? emissivityManual : emissivityPreset;

  const breadcrumb = [plant, area, unit, asset, component].filter(Boolean).join(" > ");

  /** Spot diameter (inches) via typical industrial 40:1 D:S — distance in feet */
  const distanceFt = distanceUnit === "m" ? distance * 3.28084 : distance;
  const spotSize = Number((distanceFt * 0.04).toFixed(2));

  const toggleSection = (id: IrAccordionSection) => {
    setOpenSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleTool = (tool: string) => {
    setMeasurementTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  };

  const handlePlantChange = (next: string) => {
    setPlant(next);
    const nextArea = AREA_BY_PLANT[next]?.[0] ?? "";
    setArea(nextArea);
    const nextUnit = UNIT_BY_AREA[nextArea]?.[0] ?? "";
    setUnit(nextUnit);
    const nextAsset = ASSET_BY_UNIT[nextUnit]?.[0] ?? COMPONENT_OPTS[0];
    setAsset(nextAsset);
    setComponent(nextAsset);
  };

  const handleAreaChange = (next: string) => {
    setArea(next);
    const nextUnit = UNIT_BY_AREA[next]?.[0] ?? "";
    setUnit(nextUnit);
    const nextAsset = ASSET_BY_UNIT[nextUnit]?.[0] ?? COMPONENT_OPTS[0];
    setAsset(nextAsset);
    setComponent(nextAsset);
  };

  const handleUnitChange = (next: string) => {
    setUnit(next);
    const nextAsset = ASSET_BY_UNIT[next]?.[0] ?? COMPONENT_OPTS[0];
    setAsset(nextAsset);
    setComponent(nextAsset);
  };

  const handleThermalUpload = (file: File) => {
    if (!/\.(r-?jpe?g|jpe?g|png|is2|seq)$/i.test(file.name)) {
      onToast?.(
        "Unsupported format. Use .r-jpg, .is2, .seq, .jpg, or .png.",
        "warning"
      );
      return;
    }
    setUploadedName(file.name);
    onToast?.(`Radiometric file ready: ${file.name}`, "success");
  };

  const handleVisualUpload = (file: File) => {
    if (!/\.(jpe?g|png)$/i.test(file.name)) {
      onToast?.("Visual reference must be .jpg or .png.", "warning");
      return;
    }
    setVisualRefName(file.name);
    onToast?.(`Daylight reference attached: ${file.name}`, "success");
  };

  const scanAssetTag = () => {
    // Mock QR / asset-tag autofill
    setPlant("Main Substation");
    setArea("Breaker Panel 4");
    setUnit("Breaker 2B");
    setAsset("L1 Lug");
    setComponent("L1 Lug");
    setNfpaClass("Switchgear");
    setRatedAmps("400");
    setMeasuredAmps("185");
    setRatedVoltage("480V");
    setEmissivityPreset("0.95");
    onToast?.(
      "Asset tag scanned — hierarchy & NFPA class autofilled from machine tag (demo).",
      "success"
    );
  };

  return (
    <div className="space-y-0">
      {/* SECTION 1 */}
      <AccordionShell
        id="asset"
        title="1. Smart Asset & Route Context"
        open={openSections.includes("asset")}
        onToggle={toggleSection}
      >
        <div>
          <span className={fieldLabel}>Asset Hierarchy ID</span>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800 font-mono min-w-0 flex-1">
              <span className="text-yellow-400 font-semibold">{plant}</span>
              <ChevronRight className="h-3 w-3 text-slate-600 shrink-0" />
              <span>{area}</span>
              <ChevronRight className="h-3 w-3 text-slate-600 shrink-0" />
              <span>{unit}</span>
              <ChevronRight className="h-3 w-3 text-slate-600 shrink-0" />
              <span className="text-white font-semibold">{asset}</span>
              <ChevronRight className="h-3 w-3 text-slate-600 shrink-0" />
              <span className="text-cyan-300">{component}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                const path =
                  breadcrumb ||
                  "Main Substation > Breaker Panel 4 > Breaker 2B > L1 Lug";
                void navigator.clipboard.writeText(path).then(
                  () => alert("Asset path copied!"),
                  () => alert("Asset path copied!")
                );
              }}
              className="ml-2 px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-cyan-400 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
            >
              <Copy className="h-3 w-3" />
              Copy Hierarchy String
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <label className="block min-w-0">
              <span className={fieldLabel}>Plant</span>
              <div className="relative">
                <select
                  value={plant}
                  onChange={(e) => handlePlantChange(e.target.value)}
                  className={selectCls}
                >
                  {PLANTS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Area</span>
              <div className="relative">
                <select
                  value={area}
                  onChange={(e) => handleAreaChange(e.target.value)}
                  className={selectCls}
                >
                  {areaOptions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Unit</span>
              <div className="relative">
                <select
                  value={unit}
                  onChange={(e) => handleUnitChange(e.target.value)}
                  className={selectCls}
                >
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Asset</span>
              <div className="relative">
                <select
                  value={asset}
                  onChange={(e) => {
                    setAsset(e.target.value);
                    setComponent(e.target.value);
                  }}
                  className={selectCls}
                >
                  {assetOptions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Component</span>
              <div className="relative">
                <select
                  value={component}
                  onChange={(e) => setComponent(e.target.value)}
                  className={selectCls}
                >
                  {Array.from(new Set([...assetOptions, ...COMPONENT_OPTS])).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
          </div>
          <p className={`${helperCls} font-mono text-slate-400`}>{breadcrumb}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block min-w-0">
            <span className={fieldLabel}>NFPA 70B Equipment Class</span>
            <div className="relative">
              <select
                value={nfpaClass}
                onChange={(e) => setNfpaClass(e.target.value)}
                className={selectCls}
              >
                {NFPA_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
            <p className={helperCls}>
              Auto-selects severity / ΔT evaluation rules per NFPA 70B 2026.
            </p>
          </label>
          <label className="block min-w-0">
            <span className={fieldLabel}>Rated Voltage</span>
            <div className="relative">
              <select
                value={ratedVoltage}
                onChange={(e) => setRatedVoltage(e.target.value)}
                className={selectCls}
              >
                {RATED_VOLTAGES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
          </label>
        </div>

        <div>
          <p className="text-xs font-bold text-white uppercase tracking-wider mb-3">
            Component Metadata
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block min-w-0">
              <span className={fieldLabel}>Rated Amps (Nameplate)</span>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  value={ratedAmps}
                  onChange={(e) => setRatedAmps(e.target.value)}
                  placeholder="e.g., 400"
                  className={`${inputCls} pr-8`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                  A
                </span>
              </div>
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Measured Amps (At Scan)</span>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  value={measuredAmps}
                  onChange={(e) => setMeasuredAmps(e.target.value)}
                  placeholder="e.g., 185"
                  className={`${inputCls} pr-8`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                  A
                </span>
              </div>
            </label>
          </div>
          <div className="mt-3 min-h-[72px]">
            <span className={fieldLabel}>% Load (Auto-Calculated)</span>
            <div
              className={`min-h-[42px] flex items-center px-3 rounded-lg border text-sm font-bold tabular-nums ${
                loadPercent == null
                  ? "border-slate-700 bg-slate-950 text-slate-500"
                  : loadPercent >= 80
                    ? "border-red-500/40 bg-red-500/10 text-red-400"
                    : loadPercent >= 50
                      ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400"
                      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              }`}
            >
              {loadPercent == null ? "—" : `${loadPercent}%`}
            </div>
            <p className={helperCls}>
              Critical for NFPA 70B severity assessment. Temperature rise rules change based on
              load %.
            </p>

            <label className="flex items-center gap-2 mt-3 p-2 rounded bg-slate-800/50 border border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={aiLoadNormalization}
                onChange={(e) => setAiLoadNormalization(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-yellow-500 focus:ring-yellow-500 focus:ring-offset-0 cursor-pointer accent-yellow-500"
              />
              <span className="text-sm font-medium text-white">
                Enable AI Load Normalization (to 100% Full Load Rating)
              </span>
            </label>
            <p className={helperCls}>
              Predicts catastrophic temperature rise if facility runs at maximum capacity (I²R
              losses).
            </p>
          </div>

          <label className="block min-w-0 max-w-xl mt-4">
            <span className={fieldLabel}>
              Reference Component Baseline Type (Delta-T Logic)
            </span>
            <div className="relative">
              <select
                value={deltaTBaseline}
                onChange={(e) => setDeltaTBaseline(e.target.value)}
                className={selectCls}
              >
                <option value="Phase-to-Phase (L1 vs L2/L3)">
                  Phase-to-Phase (L1 vs L2/L3)
                </option>
                <option value="Component-to-Ambient (Lug vs Air)">
                  Component-to-Ambient (Lug vs Air)
                </option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
            <p className={helperCls}>
              Determines how the AI calculates severity against NFPA 70B standards.
            </p>
          </label>
        </div>
      </AccordionShell>

      {/* SECTION 2 */}
      <AccordionShell
        id="physics"
        title="2. Environmental & Physics Correction Layer"
        open={openSections.includes("physics")}
        onToggle={toggleSection}
      >
        <div>
          <p className="text-xs font-bold text-white uppercase tracking-wider mb-3">
            Atmospheric Data
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="block min-w-0">
              <span className={`${fieldLabel} flex items-center justify-between gap-2`}>
                <span>Ambient Temperature (T_amb)</span>
                <span className="flex gap-1 normal-case tracking-normal">
                  {(["°F", "°C"] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setTempUnit(u)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                        tempUnit === u
                          ? "bg-yellow-500 text-slate-900 border-yellow-500"
                          : "bg-slate-950 text-slate-400 border-slate-700"
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </span>
              </span>
              <input
                type="number"
                value={ambientTemp}
                onChange={(e) => setAmbientTemp(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Relative Humidity (%)</span>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={humidity}
                  onChange={(e) => setHumidity(e.target.value)}
                  className={`${inputCls} pr-8`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                  %
                </span>
              </div>
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Wind Speed (m/s)</span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={windSpeed}
                onChange={(e) => setWindSpeed(e.target.value)}
                className={inputCls}
              />
              <p className={helperCls}>Critical for outdoor substation scans</p>
            </label>
          </div>

          <div className="mt-5">
            <span className={fieldLabel}>Environmental Condition</span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "indoor" as const, label: "Indoor / Controlled" },
                  { id: "shaded" as const, label: "Outdoor (Shaded)" },
                  { id: "direct" as const, label: "Outdoor (Direct Sun)" }
                ] as const
              ).map(({ id, label }) => {
                const on = solarCondition === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSolarCondition(id)}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                      on
                        ? id === "direct"
                          ? "bg-orange-500 text-slate-900 border-orange-500"
                          : "bg-yellow-500 text-slate-900 border-yellow-500"
                        : id === "direct"
                          ? "bg-slate-950 text-orange-400/80 border-orange-500/40 hover:border-orange-500 hover:text-orange-300"
                          : "bg-slate-950 text-slate-400 border-slate-700 hover:border-yellow-500/50 hover:text-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {solarCondition === "direct" && (
              <p className={`${helperCls} text-orange-400/90`}>
                Applies solar-radiation mitigation offset (+5°C to +15°C compensation)
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
            Optics &amp; Material Physics
            <span title="ISO 18434 / NFPA radiometric correction parameters">
              <Info className="h-3.5 w-3.5 text-slate-500" />
            </span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="block min-w-0 sm:col-span-2 lg:col-span-1 space-y-2">
              <span className={fieldLabel}>Emissivity (ε) — Database Preset</span>
              <div className="relative">
                <select
                  value={emissivityPreset}
                  onChange={(e) => {
                    setEmissivityPreset(e.target.value);
                    if (e.target.value !== "custom") setEmissivityManual(e.target.value);
                  }}
                  className={selectCls}
                >
                  {EMISSIVITY_PRESETS.map((p) => (
                    <option key={p.label} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
              <label className="block">
                <span className={fieldLabel}>Manual ε (0.01–1.00)</span>
                <input
                  type="number"
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={effectiveEmissivity}
                  onChange={(e) => {
                    setEmissivityPreset("custom");
                    setEmissivityManual(e.target.value);
                  }}
                  className={inputCls}
                />
              </label>
              <p className={helperCls}>
                Active ε = <span className="text-yellow-400 font-mono font-bold">{effectiveEmissivity}</span>
                . Critical for accurate absolute temperature.
              </p>
            </div>

            <label className="block min-w-0">
              <span className={fieldLabel}>Reflected Apparent Temp (T_refl)</span>
              <div className="relative">
                <input
                  type="number"
                  value={reflectedTemp}
                  onChange={(e) => setReflectedTemp(e.target.value)}
                  className={`${inputCls} pr-10`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                  {tempUnit}
                </span>
              </div>
              <p className={helperCls}>Compensates for heat reflecting off shiny busbars</p>
            </label>

            <div className="block min-w-0">
              <span className={fieldLabel}>Distance to Target</span>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={distance}
                  onChange={(e) => setDistance(Number(e.target.value) || 0)}
                  className={inputCls}
                />
                <div className="relative w-24 shrink-0">
                  <select
                    value={distanceUnit}
                    onChange={(e) => setDistanceUnit(e.target.value as "ft" | "m")}
                    className={selectCls}
                  >
                    <option value="ft">ft</option>
                    <option value="m">m</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg space-y-1.5">
                <p className="text-xs font-bold text-cyan-400">📐 Spatial Calibration</p>
                <p className="text-xs text-slate-300">
                  Spot size diameter at {distanceFt.toFixed(1)} ft is {spotSize} inches.
                </p>
                {spotSize < 0.5 ? (
                  <p className="text-xs text-green-400 font-medium">
                    ✅ Safe for small electrical lug measurements.
                  </p>
                ) : spotSize > 2.0 ? (
                  <p className="text-xs text-red-400 font-medium">
                    ⚠️ WARNING: Too far! Pixel averaging may under-report temperature by up to
                    40°C. Move closer or use telephoto lens.
                  </p>
                ) : (
                  <p className="text-xs text-yellow-400/90 font-medium">
                    Acceptable for larger targets — verify lug size vs. spot diameter.
                  </p>
                )}
                <p className="text-[11px] text-slate-500">
                  Based on 40:1 Distance-to-Spot ratio (typical industrial camera)
                </p>
              </div>
            </div>
          </div>
        </div>
      </AccordionShell>

      {/* SECTION 3 — Radiometric Thermal Image Ingestion (primary upload target) */}
      <AccordionShell
        id="ingestion"
        title="3. RADIOMETRIC THERMAL IMAGE INGESTION"
        open={openSections.includes("ingestion")}
        onToggle={toggleSection}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileRef.current?.click();
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleThermalUpload(file);
          }}
          className="border-2 border-dashed border-slate-600 rounded-xl p-10 text-center hover:border-yellow-500 transition-colors cursor-pointer bg-slate-950/30"
        >
          <Upload className="h-10 w-10 text-yellow-400 mx-auto mb-4" />
          <p className="text-lg sm:text-xl font-bold text-white">
            Drag &amp; Drop Radiometric Thermal Image Here
          </p>
          <p className="text-sm text-slate-400 mt-3 max-w-2xl mx-auto leading-relaxed">
            Supports raw radiometric formats from FLIR (.jpg), Hikmicro, Seek, and Teledyne |
            AI will auto-extract individual pixel temperatures, thermal matrices, and embedded
            visual metadata.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileRef.current?.click();
            }}
            className="mt-5 inline-flex items-center justify-center min-h-[40px] px-5 rounded-lg border border-slate-600 text-white hover:bg-slate-800 hover:border-yellow-500/50 text-sm font-bold cursor-pointer transition-colors"
          >
            Browse Files
          </button>
          {uploadedName && (
            <p className="mt-4 text-xs text-yellow-300 inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {uploadedName}
            </p>
          )}
        </div>
        <div className="mt-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2.5 text-xs text-yellow-200/90 leading-snug">
          ⚠️ Standard compressed JPG files will NOT work. Ensure images are exported as raw
          radiometric files from your thermal camera software to preserve temperature data
          arrays.
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".r-jpg,.rjpg,.is2,.seq,image/jpeg,.jpg,.jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleThermalUpload(f);
          }}
        />

        <div>
          {visualRefEnabled && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-bold text-white">
                📸 Upload Matching Daylight Reference Photo
              </p>
              <p className="text-xs text-slate-500">
                Helps AI read circuit labels (Phase A, L1, etc.) that are invisible in thermal
                view.
              </p>
              <button
                type="button"
                onClick={() => visualRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleVisualUpload(file);
                }}
                className="w-full border-2 border-dashed border-slate-600 rounded-lg p-6 text-center hover:border-yellow-500 transition-colors cursor-pointer bg-slate-950/40"
              >
                <p className="text-sm text-slate-300">Drop standard visible-light photo here</p>
                {visualRefName && (
                  <p className="mt-2 text-xs text-yellow-300 inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {visualRefName}
                  </p>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">Visual Reference Match</p>
              <p className={helperCls}>
                Upload side-by-side daylight photo (for cameras without embedded visual)
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={visualRefEnabled}
              onClick={() => setVisualRefEnabled((v) => !v)}
              className={`relative w-11 h-6 rounded-full cursor-pointer transition-colors shrink-0 ${
                visualRefEnabled ? "bg-yellow-500" : "bg-slate-700"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  visualRefEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <input
            ref={visualRef}
            type="file"
            accept=".jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleVisualUpload(f);
            }}
          />
        </div>

        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">Tag-Based Automated Linking</p>
            <p className={helperCls}>
              Auto-fills all asset info from physical machine tag
            </p>
          </div>
          <button
            type="button"
            onClick={scanAssetTag}
            className="inline-flex items-center justify-center gap-2 min-h-[40px] px-5 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 text-xs font-bold cursor-pointer transition-colors shrink-0"
          >
            <QrCode className="h-4 w-4" />
            Scan QR Code / Asset Tag
          </button>
        </div>
      </AccordionShell>

      {/* SECTION 4 */}
      <AccordionShell
        id="camera"
        title="4. Camera & Measurement Configuration"
        open={openSections.includes("camera")}
        onToggle={toggleSection}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block min-w-0">
            <span className={fieldLabel}>Temperature Range</span>
            <div className="relative">
              <select
                value={tempRange}
                onChange={(e) => setTempRange(e.target.value)}
                className={selectCls}
              >
                {TEMP_RANGES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
          </label>
          <label className="block min-w-0">
            <span className={fieldLabel}>Color Palette</span>
            <div className="relative">
              <select
                value={colorPalette}
                onChange={(e) => setColorPalette(e.target.value)}
                className={selectCls}
              >
                {COLOR_PALETTES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
          </label>
          <label className="block min-w-0">
            <span className={fieldLabel}>Focus Mode</span>
            <div className="relative">
              <select
                value={focusMode}
                onChange={(e) => setFocusMode(e.target.value)}
                className={selectCls}
              >
                {FOCUS_MODES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
          </label>
        </div>

        <div>
          <span className={fieldLabel}>Measurement Tools</span>
          <div className="flex flex-wrap gap-2">
            {MEASUREMENT_TOOLS.map((tool) => {
              const on = measurementTools.includes(tool);
              return (
                <button
                  key={tool}
                  type="button"
                  onClick={() => toggleTool(tool)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                    on
                      ? "bg-yellow-500/15 border-yellow-500 text-yellow-300"
                      : "bg-slate-950 border-slate-700 text-slate-400 hover:border-yellow-500/50"
                  }`}
                >
                  <span
                    className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                      on ? "bg-yellow-500 border-yellow-500 text-slate-950" : "border-slate-600"
                    }`}
                  >
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  {tool}
                </button>
              );
            })}
          </div>
        </div>
      </AccordionShell>
    </div>
  );
}
