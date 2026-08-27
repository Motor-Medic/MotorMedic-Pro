import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { OilReportData } from "../types/oilVision";
import OilVisionDropzone from "./trendAnalyzer/OilVisionDropzone";

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

function numStr(v: number | null | undefined): string {
  return v != null && Number.isFinite(v) ? String(v) : "";
}

function matchBrand(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const lower = raw.toLowerCase();
  for (const b of BRANDS) {
    if (b === "Custom") continue;
    if (lower.includes(b.toLowerCase())) return b;
  }
  return "Custom";
}

function matchIsoGrade(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const vg = raw.match(/(\d+)/)?.[1];
  if (vg) {
    const candidate = `ISO VG ${vg}`;
    if ((ISO_GRADES as readonly string[]).includes(candidate)) return candidate;
  }
  for (const g of ISO_GRADES) {
    if (raw.toLowerCase().includes(g.toLowerCase())) return g;
  }
  return raw.trim();
}

function matchSampleExtraction(
  raw: string | null | undefined
): SampleExtractionMethod | null {
  if (!raw?.trim()) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("minimess") || lower.includes("live zone")) {
    return "Live Zone Minimess Valve";
  }
  if (lower.includes("siphon") || lower.includes("vacuum") || lower.includes("drop tube")) {
    return "Siphon/Vacuum Pump (Drop Tube)";
  }
  if (lower.includes("drain")) return "Sump Drain Valve";
  return null;
}

function oilReportHasData(data: OilReportData): boolean {
  const { header: h, metals: m, fluidProperties: f, operatingParams: o } = data;
  return Boolean(
    h.labName ||
      h.reportNumber ||
      h.sampleDate ||
      h.lubricantBrand ||
      h.lubricantGrade ||
      m.iron != null ||
      m.copper != null ||
      m.chromium != null ||
      f.viscosity40C != null ||
      f.waterPpm != null ||
      f.acidNumber != null ||
      f.baseNumber != null ||
      o.operatingHours != null ||
      o.oilHours != null
  );
}

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
  /** Selected from top Equipment Selection (Route / Asset / Component). */
  equipment?: {
    route?: string;
    assetTag?: string;
    assetLabel?: string;
    component?: string;
    voltage?: string;
    location?: string;
    hp?: number;
    rpm?: number;
  };
  onExtractionStatusChange?: (isExtracting: boolean) => void;
}

function sanitizePpmOil(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (v < 0) return null;
  return v;
}
function sanitizeTempOil(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (v < -50 || v > 200) return null;
  return v;
}

export default function OilInputAccordions({
  onToast,
  equipment,
  onExtractionStatusChange
}: OilInputAccordionsProps) {
  const [openSections, setOpenSections] = useState<OilAccordionSection[]>([]);
  const [oilParsing, setOilParsing] = useState(false);
  const equipmentRefOil = React.useRef(equipment);
  React.useEffect(() => { equipmentRefOil.current = equipment; }, [equipment]);
  React.useEffect(() => { onExtractionStatusChange?.(oilParsing); }, [oilParsing, onExtractionStatusChange]);

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

  const applyOilReportToForm = useCallback(
    (data: OilReportData, _fileName: string) => {
      const h = data.header;
      const m = data.metals;
      const f = data.fluidProperties;
      const o = data.operatingParams;

      const brandMatch = matchBrand(h.lubricantBrand);
      if (brandMatch) setBrand(brandMatch);

      const gradeMatch = matchIsoGrade(h.lubricantGrade);
      if (gradeMatch) setIsoGrade(gradeMatch);

      const extractionMatch = matchSampleExtraction(h.samplePoint);
      if (extractionMatch) setSampleExtraction(extractionMatch);

      if (o.operatingHours != null) setAssetHours(numStr(o.operatingHours));
      if (o.oilHours != null) setFluidAgeHours(numStr(o.oilHours));
      if (o.makeUpOilLiters != null) {
        setMakeupOilAdded(numStr(o.makeUpOilLiters));
        setMakeupOilUnit("Liters");
      }

      const ppmUpdates: Record<string, string> = {};
      const collectPpm = (key: string, v: number | null | undefined) => {
        const sane = sanitizePpmOil(v);
        if (v != null && sane == null) {
          onToast?.(`Verify manually — ${key} ppm ${v} out of bounds (<0) discarded`, "warning");
          return;
        }
        if (sane != null) ppmUpdates[key] = numStr(sane);
      };
      collectPpm("fe", m.iron);
      collectPpm("cu", m.copper);
      collectPpm("pb", m.lead);
      collectPpm("sn", m.tin);
      collectPpm("al", m.aluminum);
      collectPpm("cr", m.chromium);
      collectPpm("ni", m.nickel);
      collectPpm("si", m.silicon);
      collectPpm("na", m.sodium);
      collectPpm("k", m.potassium);
      collectPpm("zn", m.zinc);
      collectPpm("ca", m.calcium);
      collectPpm("mg", m.magnesium);
      if (Object.keys(ppmUpdates).length) {
        setPpm((prev) => ({ ...prev, ...ppmUpdates }));
      }

      if (f.viscosity40C != null) setVisc40(numStr(f.viscosity40C));
      if (f.viscosity100C != null) setVisc100(numStr(f.viscosity100C));
      if (f.acidNumber != null) setTan(numStr(f.acidNumber));
      if (f.baseNumber != null) setTbn(numStr(f.baseNumber));
      if (f.oxidation != null) setFtirOxidation(numStr(f.oxidation));
      if (f.nitration != null) setFtirNitration(numStr(f.nitration));
      if (f.sulfation != null) setFtirSulfation(numStr(f.sulfation));
      if (f.sootPercent != null) setSootContent(numStr(f.sootPercent));
      if (f.waterPpm != null) {
        const saneW = sanitizePpmOil(f.waterPpm);
        if (saneW != null) setWaterPpm(numStr(saneW));
        else if (f.waterPpm != null) onToast?.(`Verify manually — water ppm ${f.waterPpm} out of bounds discarded`, "warning");
      }
      // ISO 4406 codes: honest parsing — never fabricated; blank if missing/invalid
      if (f.particleCountIso4406) {
        const c = String(f.particleCountIso4406).trim();
        // Basic validation xx/xx/xx ; out-of-bounds remains blank with verify note
        if (/^\s*\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{1,2}\s*$/.test(c)) setIso4406Code(c);
        else onToast?.(`Verify manually — ISO 4406 code "${c}" invalid — left blank`, "warning");
      }

      const nextOpen: OilAccordionSection[] = [];
      if (brandMatch || gradeMatch) nextOpen.push("identity");
      if (
        o.operatingHours != null ||
        o.oilHours != null ||
        o.makeUpOilLiters != null ||
        extractionMatch
      ) {
        nextOpen.push("telemetry");
      }
      if (Object.keys(ppmUpdates).length) nextOpen.push("spectroscopy");
      if (
        f.viscosity40C != null ||
        f.viscosity100C != null ||
        f.acidNumber != null ||
        f.baseNumber != null ||
        f.oxidation != null ||
        f.waterPpm != null
      ) {
        nextOpen.push("degradation");
      }
      if (nextOpen.length) {
        setOpenSections((prev) => Array.from(new Set([...prev, ...nextOpen])));
      }

      onToast?.(
        `Oil lab report read by vision — form fields updated for review (${data.formatDetected}, confidence ${data.confidenceScore}%).`,
        "success"
      );
    },
    [onToast]
  );

  const handleVisionExtracted = useCallback(
    (data: OilReportData, fileName: string) => {
      const captured = equipmentRefOil.current?.assetTag || equipmentRefOil.current?.assetLabel || "";
      const current = equipment?.assetTag || equipment?.assetLabel || "";
      if (captured && current !== captured) {
        onToast?.("Extraction discarded - asset changed", "warning");
        return;
      }
      if (!oilReportHasData(data)) {
        onToast?.(
          "Vision model found no oil analysis fields — try a sharper screenshot or enter values manually. Verify manually.",
          "warning"
        );
        return;
      }
      applyOilReportToForm(data, fileName);
    },
    [applyOilReportToForm, onToast, equipment?.assetTag, equipment?.assetLabel]
  );

  return (
    <div className="space-y-0">
      {(equipment?.assetLabel || equipment?.assetTag || equipment?.component) && (
        <div className="mb-4 rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Analyzing equipment
          </p>
          <p className="text-sm text-white font-semibold mt-0.5">
            {[equipment.route, equipment.assetLabel || equipment.assetTag, equipment.component]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      )}
      {oilParsing && (
        <div className="flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-300 mb-4">
          <div className="h-4 w-4 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
          Extracting Telemetry Data...
        </div>
      )}
      <OilVisionDropzone
        activeAssetId={equipment?.assetTag || equipment?.assetLabel || ""}
        onParsingChange={(p) => { setOilParsing(p); onExtractionStatusChange?.(p); }}
        disabled={oilParsing}
        onExtracted={handleVisionExtracted}
        onError={(msg) => onToast?.(msg, "error")}
      />

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
            {WEAR_METALS.map(({ key: ppmKey, label }) => (
              <React.Fragment key={ppmKey}>
                <PpmField
                  label={label}
                  value={ppm[ppmKey] ?? ""}
                  onChange={(v) => setPpmKey(ppmKey, v)}
                />
              </React.Fragment>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-2">
            Contaminants (PPM)
          </p>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {CONTAMINANTS.map(({ key: ppmKey, label }) => (
              <React.Fragment key={ppmKey}>
                <PpmField
                  label={label}
                  value={ppm[ppmKey] ?? ""}
                  onChange={(v) => setPpmKey(ppmKey, v)}
                />
              </React.Fragment>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-2">
            Additives (PPM)
          </p>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {ADDITIVES.map(({ key: ppmKey, label }) => (
              <React.Fragment key={ppmKey}>
                <PpmField
                  label={label}
                  value={ppm[ppmKey] ?? ""}
                  onChange={(v) => setPpmKey(ppmKey, v)}
                />
              </React.Fragment>
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
            placeholder="__/__/__"
            className={inputCls}
          />
          <p className="mt-1.5 text-[11px] text-slate-500">
            Format: &gt;4μm / &gt;6μm / &gt;14μm
          </p>
        </label>
      </AccordionShell>
    </div>
  );
}
