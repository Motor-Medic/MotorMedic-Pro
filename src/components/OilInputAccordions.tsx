import React, { useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Upload } from "lucide-react";

type OilAccordionSection = "identity" | "telemetry" | "spectroscopy" | "degradation";

type BaseOilChemistry = "Mineral" | "Synthetic PAO" | "Synthetic PAG/Ester" | "Food-Grade H1";
type OilAssetType = "Engine" | "Gearbox" | "Hydraulic System" | "Turbine";
type SampleExtractionMethod =
  | "Live Zone Minimess Valve"
  | "Siphon/Vacuum Pump (Drop Tube)"
  | "Sump Drain Valve";

const ASSET_TYPES: OilAssetType[] = ["Engine", "Gearbox", "Hydraulic System", "Turbine"];

const SAMPLE_EXTRACTION_METHODS: SampleExtractionMethod[] = [
  "Live Zone Minimess Valve",
  "Siphon/Vacuum Pump (Drop Tube)",
  "Sump Drain Valve"
];

const BRANDS = [
  "Mobil DTE 25",
  "Shell Tellus S2 V 32",
  "Exxon Spartan EP 220",
  "Custom"
] as const;

const ISO_GRADES = [
  "ISO VG 32",
  "ISO VG 46",
  "ISO VG 68",
  "ISO VG 100",
  "ISO VG 150",
  "ISO VG 220",
  "ISO VG 320",
  "ISO VG 460",
  "ISO VG 680"
] as const;

const BASE_CHEMISTRIES: BaseOilChemistry[] = [
  "Mineral",
  "Synthetic PAO",
  "Synthetic PAG/Ester",
  "Food-Grade H1"
];

const BETA_RATINGS = ["β₆ ≥ 100", "β₁₀ ≥ 1000", "β₁₄ ≥ 1000"] as const;

const WEAR_METALS: { key: string; label: string }[] = [
  { key: "fe", label: "Iron (Fe)" },
  { key: "cu", label: "Copper (Cu)" },
  { key: "pb", label: "Lead (Pb)" },
  { key: "sn", label: "Tin (Sn)" },
  { key: "al", label: "Aluminum (Al)" },
  { key: "cr", label: "Chromium (Cr)" },
  { key: "ni", label: "Nickel (Ni)" }
];

const CONTAMINANTS: { key: string; label: string }[] = [
  { key: "si", label: "Silicon (Si/Dirt)" },
  { key: "na", label: "Sodium (Na/Coolant)" },
  { key: "k", label: "Potassium (K/Coolant)" }
];

const ADDITIVES: { key: string; label: string }[] = [
  { key: "zn", label: "Zinc (Zn)" },
  { key: "p", label: "Phosphorus (P)" },
  { key: "ca", label: "Calcium (Ca)" },
  { key: "mg", label: "Magnesium (Mg)" }
];

const fieldLabel = "text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block";
const inputCls =
  "bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 transition-all outline-none w-full";
const inputCompact =
  "bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white focus:border-yellow-500 transition-all outline-none w-full";
const selectCls = `${inputCls} appearance-none cursor-pointer pr-10`;
const microLabel = "text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 block";

function AccordionShell({
  id,
  title,
  open,
  onToggle,
  children
}: {
  id: OilAccordionSection;
  title: string;
  open: boolean;
  onToggle: (id: OilAccordionSection) => void;
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

function PpmField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className={microLabel}>{label}</span>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ppm"
        className={inputCompact}
      />
    </label>
  );
}

export interface OilInputAccordionsProps {
  onToast?: (message: string, type?: "success" | "info" | "warning" | "error") => void;
}

export default function OilInputAccordions({ onToast }: OilInputAccordionsProps) {
  const [openSections, setOpenSections] = useState<OilAccordionSection[]>([
    "identity",
    "telemetry"
  ]);

  // Section 1
  const [assetType, setAssetType] = useState<OilAssetType>("Hydraulic System");
  const [brand, setBrand] = useState<string>("Mobil DTE 25");
  const [isoGrade, setIsoGrade] = useState<string>("ISO VG 46");
  const [baseChemistry, setBaseChemistry] = useState<BaseOilChemistry>("Mineral");
  const [systemCapacity, setSystemCapacity] = useState("");
  const [capacityUnit, setCapacityUnit] = useState<"Gallons" | "Liters">("Gallons");

  // Section 2
  const [assetHours, setAssetHours] = useState("");
  const [fluidAgeHours, setFluidAgeHours] = useState("");
  const [makeupOilAdded, setMakeupOilAdded] = useState("");
  const [makeupOilUnit, setMakeupOilUnit] = useState<"Gallons" | "Liters">("Gallons");
  const [sampleExtraction, setSampleExtraction] =
    useState<SampleExtractionMethod>("Live Zone Minimess Valve");
  const [filterHours, setFilterHours] = useState("");
  const [betaRating, setBetaRating] = useState<string>("β₁₀ ≥ 1000");

  // Section 3 — spectroscopy
  const [ppm, setPpm] = useState<Record<string, string>>({});

  // Section 4
  const [visc40, setVisc40] = useState("");
  const [visc100, setVisc100] = useState("");
  const [tan, setTan] = useState("");
  const [tbn, setTbn] = useState("");
  const [ftirOxidation, setFtirOxidation] = useState("");
  const [ftirNitration, setFtirNitration] = useState("");
  const [ftirSulfation, setFtirSulfation] = useState("");
  const [fuelDilution, setFuelDilution] = useState("");
  const [sootContent, setSootContent] = useState("");
  const [waterPpm, setWaterPpm] = useState("");
  const [iso4406Code, setIso4406Code] = useState("");
  const [pdfName, setPdfName] = useState<string | null>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  /** Engine → TBN; Gearbox / Hydraulic / Turbine → TAN */
  const showTbn = assetType === "Engine";
  const isEngineAsset = assetType === "Engine";

  const toggleSection = (id: OilAccordionSection) => {
    setOpenSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const setPpmKey = (key: string, value: string) => {
    setPpm((prev) => ({ ...prev, [key]: value }));
  };

  const handlePdf = (file: File) => {
    const ok = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    if (!ok) {
      onToast?.("Upload a lab PDF (SGS, Polaris, LubeWatch).", "warning");
      return;
    }
    setPdfName(file.name);
    onToast?.(`Lab PDF ready for mock extraction: ${file.name}`, "success");
  };

  return (
    <div className="space-y-0">
      {/* SECTION 1 — Fluid Identity */}
      <AccordionShell
        id="identity"
        title="1. Fluid Identity & Sump Genetics"
        open={openSections.includes("identity")}
        onToggle={toggleSection}
      >
        <label className="block min-w-0 max-w-md">
          <span className={fieldLabel}>Asset Type</span>
          <div className="relative">
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as OilAssetType)}
              className={selectCls}
            >
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
          </div>
        </label>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-3">
            Lubricant Lineage Database
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block min-w-0">
              <span className={fieldLabel}>Brand / Product Family</span>
              <div className="relative">
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className={selectCls}
                >
                  {BRANDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Weight / ISO Grade</span>
              <div className="relative">
                <select
                  value={isoGrade}
                  onChange={(e) => setIsoGrade(e.target.value)}
                  className={selectCls}
                >
                  {ISO_GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
          </div>
          <p className="text-xs text-slate-400 mt-1 italic">
            AI has pre-loaded fresh fluid specifications for trend variance validation.
          </p>
        </div>

        <div>
          <span className={fieldLabel}>Base Oil Chemistry Classification</span>
          <div className="flex flex-wrap gap-2">
            {BASE_CHEMISTRIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setBaseChemistry(c)}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                  baseChemistry === c
                    ? "bg-yellow-500 text-slate-900 border-yellow-500"
                    : "bg-slate-950 text-slate-400 border-slate-700 hover:border-yellow-500/50 hover:text-slate-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={fieldLabel}>System Capacity</span>
          <div className="flex gap-2 max-w-md">
            <input
              type="number"
              step="any"
              value={systemCapacity}
              onChange={(e) => setSystemCapacity(e.target.value)}
              placeholder="e.g. 55"
              className={inputCls}
            />
            <div className="flex shrink-0 rounded-lg border border-slate-700 overflow-hidden">
              {(["Gallons", "Liters"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setCapacityUnit(u)}
                  className={`min-h-[42px] px-3 text-xs font-bold cursor-pointer transition-colors ${
                    capacityUnit === u
                      ? "bg-yellow-500 text-slate-900"
                      : "bg-slate-950 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>
      </AccordionShell>

      {/* SECTION 2 — Time-In-Service */}
      <AccordionShell
        id="telemetry"
        title="2. Time-In-Service Telemetry"
        open={openSections.includes("telemetry")}
        onToggle={toggleSection}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block min-w-0">
            <span className={fieldLabel}>Asset Total Operating Hours</span>
            <input
              type="number"
              value={assetHours}
              onChange={(e) => setAssetHours(e.target.value)}
              placeholder="e.g. 42000"
              className={inputCls}
            />
          </label>
          <label className="block min-w-0">
            <span className={fieldLabel}>Fluid Age (Hours)</span>
            <input
              type="number"
              value={fluidAgeHours}
              onChange={(e) => setFluidAgeHours(e.target.value)}
              placeholder="Runtime on this oil batch"
              className={inputCls}
            />
          </label>
        </div>

        <div>
          <span className={fieldLabel}>Makeup Oil Added Since Last Sample</span>
          <div className="flex gap-2 max-w-md">
            <input
              type="number"
              step="any"
              value={makeupOilAdded}
              onChange={(e) => setMakeupOilAdded(e.target.value)}
              placeholder="e.g. 2.5"
              className={inputCls}
            />
            <div className="flex shrink-0 rounded-lg border border-slate-700 overflow-hidden">
              {(["Gallons", "Liters"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setMakeupOilUnit(u)}
                  className={`min-h-[42px] px-3 text-xs font-bold cursor-pointer transition-colors ${
                    makeupOilUnit === u
                      ? "bg-yellow-500 text-slate-900"
                      : "bg-slate-950 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Tracks fresh oil dilution to prevent false-negative wear metal readings.
          </p>
        </div>

        <label className="block min-w-0 max-w-md">
          <span className={fieldLabel}>Sample Extraction Method</span>
          <div className="relative">
            <select
              value={sampleExtraction}
              onChange={(e) => setSampleExtraction(e.target.value as SampleExtractionMethod)}
              className={selectCls}
            >
              {SAMPLE_EXTRACTION_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Crucial for AI context. Drain valves often capture concentrated sludge.
          </p>
        </label>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-3">
            Filter Age &amp; Rating
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block min-w-0">
              <span className={fieldLabel}>Filter Hours</span>
              <input
                type="number"
                value={filterHours}
                onChange={(e) => setFilterHours(e.target.value)}
                placeholder="e.g. 2000"
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Beta Rating</span>
              <div className="relative">
                <select
                  value={betaRating}
                  onChange={(e) => setBetaRating(e.target.value)}
                  className={selectCls}
                >
                  {BETA_RATINGS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
          </div>
        </div>
      </AccordionShell>

      {/* SECTION 3 — Spectroscopy Matrix */}
      <AccordionShell
        id="spectroscopy"
        title="3. Elemental Spectroscopy Matrix (PPM)"
        open={openSections.includes("spectroscopy")}
        onToggle={toggleSection}
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-2">
            Wear Metals (PPM)
          </p>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {WEAR_METALS.map(({ key, label }) => (
              <PpmField
                key={key}
                label={label}
                value={ppm[key] ?? ""}
                onChange={(v) => setPpmKey(key, v)}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-2">
            Contaminants (PPM)
          </p>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {CONTAMINANTS.map(({ key, label }) => (
              <PpmField
                key={key}
                label={label}
                value={ppm[key] ?? ""}
                onChange={(v) => setPpmKey(key, v)}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-2">
            Additives (PPM)
          </p>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {ADDITIVES.map(({ key, label }) => (
              <PpmField
                key={key}
                label={label}
                value={ppm[key] ?? ""}
                onChange={(v) => setPpmKey(key, v)}
              />
            ))}
          </div>
        </div>
      </AccordionShell>

      {/* SECTION 4 — Physical & Chemical Degradation */}
      <AccordionShell
        id="degradation"
        title="4. Physical & Chemical Degradation"
        open={openSections.includes("degradation")}
        onToggle={toggleSection}
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-3">
            Kinematic Viscosity
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block min-w-0">
              <span className={fieldLabel}>@ 40°C (cSt)</span>
              <input
                type="number"
                step="any"
                value={visc40}
                onChange={(e) => setVisc40(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>@ 100°C (cSt)</span>
              <input
                type="number"
                step="any"
                value={visc100}
                onChange={(e) => setVisc100(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
          <span className="inline-flex items-center gap-2 px-2 py-1 rounded text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 mt-2">
            ⚙️ Viscosity Index (VI) automatically calculated via ASTM D2270
          </span>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-3">
            Acid / Base Breakdown
          </p>
          {showTbn ? (
            <label className="block min-w-0 max-w-md">
              <span className={fieldLabel}>Total Base Number (TBN - mg KOH/g)</span>
              <input
                type="number"
                step="0.01"
                value={tbn}
                onChange={(e) => setTbn(e.target.value)}
                className={inputCls}
              />
            </label>
          ) : (
            <label className="block min-w-0 max-w-md">
              <span className={fieldLabel}>Total Acid Number (TAN - mg KOH/g)</span>
              <input
                type="number"
                step="0.01"
                value={tan}
                onChange={(e) => setTan(e.target.value)}
                className={inputCls}
              />
            </label>
          )}
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-3">
            FTIR Molecular Breakdown (Abs/cm)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="block min-w-0">
              <span className={fieldLabel}>Oxidation</span>
              <input
                type="number"
                step="any"
                value={ftirOxidation}
                onChange={(e) => setFtirOxidation(e.target.value)}
                placeholder="Abs/cm"
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Nitration</span>
              <input
                type="number"
                step="any"
                value={ftirNitration}
                onChange={(e) => setFtirNitration(e.target.value)}
                placeholder="Abs/cm"
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Sulfation</span>
              <input
                type="number"
                step="any"
                value={ftirSulfation}
                onChange={(e) => setFtirSulfation(e.target.value)}
                placeholder="Abs/cm"
                className={inputCls}
              />
            </label>
          </div>
          {isEngineAsset && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block min-w-0">
                <span className={fieldLabel}>Fuel Dilution (%)</span>
                <input
                  type="number"
                  step="any"
                  value={fuelDilution}
                  onChange={(e) => setFuelDilution(e.target.value)}
                  placeholder="0.0"
                  className={inputCls}
                />
              </label>
              <label className="block min-w-0">
                <span className={fieldLabel}>Soot Content (%)</span>
                <input
                  type="number"
                  step="any"
                  value={sootContent}
                  onChange={(e) => setSootContent(e.target.value)}
                  placeholder="0.0"
                  className={inputCls}
                />
              </label>
              <p className="sm:col-span-2 text-[11px] text-slate-500 leading-snug">
                Critical for monitoring internal combustion engine oil degradation.
              </p>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-3">
            Contamination Volumetrics
          </p>
          <label className="block min-w-0 max-w-md">
            <span className={fieldLabel}>Water Content (Karl Fischer – PPM)</span>
            <input
              type="number"
              step="any"
              value={waterPpm}
              onChange={(e) => setWaterPpm(e.target.value)}
              placeholder="ppm"
              className={inputCls}
            />
          </label>
        </div>

        <label className="block min-w-0 max-w-md">
          <span className={fieldLabel}>ISO 4406:2021 Cleanliness Code</span>
          <input
            type="text"
            value={iso4406Code}
            onChange={(e) => setIso4406Code(e.target.value)}
            placeholder="e.g., 19/17/14"
            className={inputCls}
          />
          <p className="mt-1.5 text-[11px] text-slate-500">
            Format: &gt;4μm / &gt;6μm / &gt;14μm
          </p>
        </label>

        <div>
          <span className={fieldLabel}>Automated Lab PDF Parser</span>
          <button
            type="button"
            onClick={() => pdfRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handlePdf(file);
            }}
            className="w-full rounded-xl border border-dashed border-slate-600 hover:border-yellow-500/60 bg-slate-950/60 hover:bg-slate-950 px-6 py-8 text-center cursor-pointer transition-colors"
          >
            <Upload className="h-7 w-7 text-yellow-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-white">
              Drop standard lab PDF here
            </p>
            <p className="text-xs text-slate-500 mt-1">
              SGS, Polaris, LubeWatch — mock auto-extraction
            </p>
            {pdfName && (
              <p className="mt-2 text-xs text-yellow-300 inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {pdfName}
              </p>
            )}
          </button>
          <input
            ref={pdfRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePdf(f);
            }}
          />
        </div>
      </AccordionShell>
    </div>
  );
}
