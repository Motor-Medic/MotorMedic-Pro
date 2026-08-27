import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Cog,
  Droplets,
  FileAudio,
  Loader2,
  Upload,
  Wind,
  Zap
} from "lucide-react";
import type { UltrasoundMetadata } from "../lib/ultrasoundAnalysis";
import { analyzeUltrasoundWav } from "../lib/ultrasound/audioAnalyzer";

type UeAccordionSection = "mode" | "hardware" | "specific" | "ingestion";
export type UltrasoundMode = "leak" | "mechanical" | "electrical" | "valve";

/** Snapshot emitted to Run Diagnostics for /api/analyze-ultrasound. */
export type UltrasoundInputSnapshot = UltrasoundMetadata & {
  wavFileName?: string | null;
  photoFileName?: string | null;
};

const MODE_CARDS: {
  id: UltrasoundMode;
  title: string;
  hint: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "leak", title: "Leak Detection", hint: "Compressed gas / vacuum", Icon: Wind },
  { id: "mechanical", title: "Mechanical / Bearing", hint: "Friction & lubrication", Icon: Cog },
  { id: "electrical", title: "Electrical / Arcing", hint: "Corona, tracking, arcing", Icon: Zap },
  { id: "valve", title: "Valves & Steam Traps", hint: "Pass-through & blow-by", Icon: Droplets }
];

const TRANSDUCER_TYPES = [
  "Airborne Probe (Standard)",
  "Parabolic Dish (Long-range focus)",
  "Contact/Stethoscope Module (Direct mount)",
  "Flexible Probe (Tight spaces)",
  "Acoustic Laser Array (Non-contact)"
] as const;

const HARDWARE_BRAND_PROFILES = [
  "Spectra CM Sensor (Cloud Synced)",
  "UE Systems Ultraprobe Series",
  "SDT Ultrasound / CTRL Systems"
] as const;

const ORIFICE_PROFILES = [
  "Smooth/Round Hole (Coefficient 0.79)",
  "Jagged/Crack (Coefficient 0.74)",
  "Thread/Fitting Leak (Coefficient 0.65)",
  "Slit/Crack in Hose (Coefficient 0.72)",
  "Custom / Manual Entry"
] as const;

const CMMS_PAYLOAD_FORMATS = [
  "MaintainX",
  "Limble CMMS",
  "SAP PM",
  "IBM Maximo"
] as const;

const OPERATIONAL_HOURS = [
  "24/7/365 Continuous (8,760 hrs/year)",
  "2-Shift Operation (4,000 hrs/year)",
  "1-Shift Operation (2,000 hrs/year)",
  "Custom Manual Entry"
] as const;

const GAS_TYPES = ["Compressed Air", "Nitrogen", "Argon", "Steam", "Vacuum"] as const;
const GREASE_TYPES = ["Polyurea", "Lithium", "Synthetic", "None"] as const;
const VOLTAGE_CLASSES = [
  "Low Voltage <1kV",
  "Medium Voltage 1-35kV",
  "High Voltage >35kV"
] as const;
const ELEC_EQUIPMENT = [
  "Switchgear",
  "Transformer",
  "Transmission Line",
  "Motor Starter"
] as const;
const VALVE_TYPES = ["Gate", "Globe", "Ball", "Steam Trap"] as const;

const fieldLabel = "text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block";
const inputCls =
  "bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 transition-all outline-none w-full";
const selectCls = `${inputCls} appearance-none cursor-pointer pr-10`;
const helperCls = "mt-1.5 text-[11px] text-slate-500 leading-snug";

function AccordionShell({
  id,
  title,
  open,
  onToggle,
  children
}: {
  id: UeAccordionSection;
  title: string;
  open: boolean;
  onToggle: (id: UeAccordionSection) => void;
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

export interface UltrasoundInputAccordionsProps {
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
  /** Emits measurement metadata for POST /api/analyze-ultrasound. */
  onSnapshotChange?: (snapshot: UltrasoundInputSnapshot) => void;
  onExtractionStatusChange?: (isExtracting: boolean) => void;
}

function sanitizeTempUltra(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (v < -50 || v > 200) return null;
  return v;
}
function sanitizeRpmUltra(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (v < 100 || v > 10000) return null;
  return v;
}

export default function UltrasoundInputAccordions({
  onToast,
  equipment,
  onSnapshotChange,
  onExtractionStatusChange
}: UltrasoundInputAccordionsProps) {
  const [openSections, setOpenSections] = useState<UeAccordionSection[]>([]);
  const [ultrasoundMode, setUltrasoundMode] = useState<UltrasoundMode>("leak");

  // Hardware
  const [transducer, setTransducer] = useState<string>("Airborne Probe (Standard)");
  const [hardwareBrandProfile, setHardwareBrandProfile] = useState<string>(
    HARDWARE_BRAND_PROFILES[0]
  );
  const [heterodyneKhz, setHeterodyneKhz] = useState("40");
  const [gainDb, setGainDb] = useState(30);
  const [distance, setDistance] = useState("3");
  const [distanceUnit, setDistanceUnit] = useState<"ft" | "m">("ft");

  // Leak
  const [gasType, setGasType] = useState<string>("Compressed Air");
  const [operationalHours, setOperationalHours] = useState<string>(
    "24/7/365 Continuous (8,760 hrs/year)"
  );
  const [customHours, setCustomHours] = useState("");
  const [orificeProfile, setOrificeProfile] = useState<string>(
    "Smooth/Round Hole (Coefficient 0.79)"
  );
  const [customOrifice, setCustomOrifice] = useState(false);
  const [customDischargeCoeff, setCustomDischargeCoeff] = useState("");
  const [systemPressure, setSystemPressure] = useState("100");
  const [pressureUnit, setPressureUnit] = useState<"PSI" | "Bar">("PSI");
  const [costOfGas, setCostOfGas] = useState("0.25");
  const [cmmsPayloadFormat, setCmmsPayloadFormat] =
    useState<(typeof CMMS_PAYLOAD_FORMATS)[number]>("MaintainX");

  // Mechanical
  const [equipmentRpm, setEquipmentRpm] = useState("1780");
  const [greaseType, setGreaseType] = useState<string>("Polyurea");
  const [lubeState, setLubeState] = useState<"Pre-Grease" | "Post-Grease">("Pre-Grease");

  // Electrical
  const [voltageClass, setVoltageClass] = useState<string>("Medium Voltage 1-35kV");
  const [elecEquipType, setElecEquipType] = useState<string>("Switchgear");

  // Valve
  const [valveType, setValveType] = useState<string>("Steam Trap");
  const [expectedState, setExpectedState] = useState<"Normally Open" | "Normally Closed">(
    "Normally Closed"
  );

  // Ingestion
  const [wavName, setWavName] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [peakDbuV, setPeakDbuV] = useState("");
  const [rmsDbuV, setRmsDbuV] = useState("");
  const [crestFactor, setCrestFactor] = useState("");
  const [crestManual, setCrestManual] = useState(false);
  const [wavAnalyzing, setWavAnalyzing] = useState(false);
  const [wavMetricsNote, setWavMetricsNote] = useState<string | null>(null);
  const [physicalAssetTag, setPhysicalAssetTag] = useState("");
  const wavRef = useRef<HTMLInputElement>(null);
  const telemetryWavRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const equipmentRefUltra = useRef(equipment);
  useEffect(() => { equipmentRefUltra.current = equipment; }, [equipment]);
  useEffect(() => { onExtractionStatusChange?.(wavAnalyzing); }, [wavAnalyzing, onExtractionStatusChange]);

  /**
   * Crest Factor from Peak/RMS dB fields:
   * CF = 10^((Peak_dB − RMS_dB) / 20) = Peak_linear / RMS_linear
   * Never divide dB values (peak / rms).
   */
  const autoCrestFactor = useMemo(() => {
    const peak = Number(peakDbuV);
    const rms = Number(rmsDbuV);
    if (!Number.isFinite(peak) || !Number.isFinite(rms)) return null;
    const cf = Math.pow(10, (peak - rms) / 20);
    return Number.isFinite(cf) && cf > 0 ? Math.round(cf * 100) / 100 : null;
  }, [peakDbuV, rmsDbuV]);

  /** Manual Peak/RMS must satisfy Peak ≥ RMS when both are entered. */
  const peakRmsInvalid = useMemo(() => {
    const peak = Number(peakDbuV);
    const rms = Number(rmsDbuV);
    if (peakDbuV === "" || rmsDbuV === "") return false;
    if (!Number.isFinite(peak) || !Number.isFinite(rms)) return false;
    return rms > peak;
  }, [peakDbuV, rmsDbuV]);

  useEffect(() => {
    if (crestManual) return;
    if (autoCrestFactor == null) {
      setCrestFactor("");
      return;
    }
    setCrestFactor(String(autoCrestFactor));
  }, [autoCrestFactor, crestManual]);

  const toggleSection = (id: UeAccordionSection) => {
    setOpenSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const applyWavMetrics = async (file: File) => {
    if (!/\.wav$/i.test(file.name) && !/wav|wave/i.test(file.type || "")) {
      onToast?.("Please upload a .WAV audio file. Verify manually.", "warning");
      return;
    }

    const capturedAssetId = equipmentRefUltra.current?.assetTag || equipmentRefUltra.current?.assetLabel || "";
    setWavAnalyzing(true);
    setWavName(file.name);
    setWavMetricsNote(null);

    try {
      const metrics = await analyzeUltrasoundWav(file);
      // --- STALE-EXTRACTION RACE GUARD ---
      const currentAssetId = equipmentRefUltra.current?.assetTag || equipmentRefUltra.current?.assetLabel || "";
      if (capturedAssetId && currentAssetId !== capturedAssetId) {
        onToast?.("Extraction discarded - asset changed", "warning");
        return;
      }
      // --- SANITY BOUNDS: RPM 100-10000 if equipmentRpm derived from wav meta (fallback) ---
      // Peak/RMS dB honesty: never fabricate defaults — blank if missing (handled by metrics always present)
      // Crest factor honesty: computed from peak - rms, no division
      setPeakDbuV(String(metrics.peakDb));
      setRmsDbuV(String(metrics.rmsDb));
      setCrestFactor(String(metrics.crestFactor));
      setCrestManual(false);
      setWavMetricsNote(
        `Extracted · Peak ${metrics.peakDb} dB · RMS ${metrics.rmsDb} dB · CF ${metrics.crestFactor}`
      );
      // Ensure telemetry accordion is open so populated fields are visible
      setOpenSections((prev) =>
        prev.includes("ingestion") ? prev : [...prev, "ingestion"]
      );
      onToast?.("Acoustic metrics extracted successfully.", "success");
    } catch (err) {
      const currentAssetId2 = equipmentRefUltra.current?.assetTag || equipmentRefUltra.current?.assetLabel || "";
      if (capturedAssetId && currentAssetId2 !== capturedAssetId) {
        onToast?.("Extraction discarded - asset changed", "warning");
        return;
      }
      setWavMetricsNote(null);
      onToast?.(
        err instanceof Error ? err.message : "Failed to analyze WAV audio. Verify manually.",
        "error"
      );
    } finally {
      setWavAnalyzing(false);
    }
  };

  const handleWav = (file: File) => {
    void applyWavMetrics(file);
  };

  const clearWav = () => {
    setWavName(null);
    setWavMetricsNote(null);
    setWavAnalyzing(false);
    if (wavRef.current) wavRef.current.value = "";
    if (telemetryWavRef.current) telemetryWavRef.current.value = "";
  };

  const handlePhoto = (file?: File | null) => {
    if (!file) return;
    if (
      !/\.(jpe?g|png|gif|webp)$/i.test(file.name) &&
      !file.type.startsWith("image/")
    ) {
      onToast?.("Visual context must be an image (.jpg / .png / .webp).", "warning");
      return;
    }
    const preview = URL.createObjectURL(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return preview;
    });
    setPhotoName(file.name);
    onToast?.(`Visual context attached: ${file.name}`, "success");
  };

  const clearPhotoPreview = () => {
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPhotoName(null);
    if (photoRef.current) photoRef.current.value = "";
  };

  const hasPhotoPreview = Boolean(photoPreview || photoName);

  const modeLabel = MODE_CARDS.find((m) => m.id === ultrasoundMode)?.title ?? ultrasoundMode;

  // Push measurement snapshot to parent (Diagnose → /api/analyze-ultrasound)
  useEffect(() => {
    if (!onSnapshotChange) return;
    onSnapshotChange({
      asset: equipment?.assetLabel,
      assetTag: equipment?.assetTag,
      component: equipment?.component,
      route: equipment?.route,
      location: equipment?.location,
      mode: ultrasoundMode,
      transducer,
      hardwareBrand: hardwareBrandProfile,
      heterodyneKhz,
      gainDb,
      distance,
      distanceUnit,
      peakDbuV: peakDbuV || undefined,
      rmsDbuV: rmsDbuV || undefined,
      crestFactor:
        ultrasoundMode === "mechanical" && crestFactor
          ? crestFactor
          : undefined,
      wavFileName: wavName || undefined,
      photoFileName: photoName || undefined,
      gasType,
      systemPressure,
      equipmentRpm: equipmentRpm || equipment?.rpm,
      voltageClass,
      valveType,
      physicalAssetTag: physicalAssetTag || undefined
    });
  }, [
    onSnapshotChange,
    equipment?.assetLabel,
    equipment?.assetTag,
    equipment?.component,
    equipment?.route,
    equipment?.location,
    equipment?.rpm,
    ultrasoundMode,
    transducer,
    hardwareBrandProfile,
    heterodyneKhz,
    gainDb,
    distance,
    distanceUnit,
    peakDbuV,
    rmsDbuV,
    crestFactor,
    wavName,
    photoName,
    gasType,
    systemPressure,
    equipmentRpm,
    voltageClass,
    valveType,
    physicalAssetTag
  ]);

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
      {wavAnalyzing && (
        <div className="flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-300 mb-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Extracting Telemetry Data...
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 mb-4">
        <label className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">
            Target CMMS Payload Format
          </span>
          <select
            value={cmmsPayloadFormat}
            onChange={(e) =>
              setCmmsPayloadFormat(e.target.value as (typeof CMMS_PAYLOAD_FORMATS)[number])
            }
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-yellow-500 outline-none"
          >
            {CMMS_PAYLOAD_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Audio Upload — permanently visible at top (primary data) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-4 hover:border-amber-500/30 transition-all space-y-5 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFC700]">
              Data Ingestion
            </p>
            <h3 className="text-sm font-bold text-white mt-1">
              Audio Payload (.WAV)
              {ultrasoundMode === "leak" ? " — Optional" : ""}
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              Always visible — primary data for Ultrasound AI analysis
            </p>
          </div>
          <FileAudio className="h-5 w-5 text-amber-400 shrink-0" aria-hidden />
        </div>

        <div className="space-y-4">
          <span className={fieldLabel}>
            Audio Payload (.WAV)
            {ultrasoundMode === "leak" ? " — Optional" : ""}
          </span>
          {!wavName ? (
            <button
              type="button"
              onClick={() => { if (!wavAnalyzing) wavRef.current?.click(); }}
              onDragOver={(e) => { if (wavAnalyzing) return; e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                if (wavAnalyzing) return;
                const file = e.dataTransfer.files?.[0];
                if (file) handleWav(file);
              }}
              disabled={wavAnalyzing}
              className={`w-full rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${wavAnalyzing ? "border-slate-700 bg-slate-900/40 opacity-50 cursor-not-allowed" : "border-slate-600 hover:border-yellow-500/60 bg-slate-950/60 hover:bg-slate-950 cursor-pointer"}`}
            >
              <Upload className="h-8 w-8 text-yellow-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-white flex items-center justify-center gap-2">
                {wavAnalyzing && <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />}
                {wavAnalyzing
                  ? "Extracting Telemetry Data..."
                  : ultrasoundMode === "leak"
                    ? "Drag & Drop Audio File (.wav) — Optional"
                    : "Drag & Drop Audio File (.wav)"}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Zero-touch Peak / RMS / Crest Factor extraction (client-side Web Audio)
              </p>
            </button>
          ) : (
            <div className="space-y-4 rounded-xl border border-white/10 bg-slate-950/50 p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-36 h-24 shrink-0 rounded-lg border border-slate-600 bg-slate-900 relative overflow-hidden shadow-inner flex items-center justify-center">
                  <FileAudio className="h-10 w-10 text-amber-400/80" aria-hidden />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100">
                    <span className="truncate max-w-[180px] text-white">{wavName}</span>
                    <span className="text-slate-500">|</span>
                    <span className="text-amber-300">
                      {wavAnalyzing ? "Analyzing…" : "Audio Ready"}
                    </span>
                  </div>
                  {wavMetricsNote && (
                    <p className="text-[11px] text-emerald-400/90 font-mono">
                      {wavMetricsNote}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={clearWav}
                      disabled={wavAnalyzing}
                      className="min-h-[30px] px-2.5 rounded-md border border-slate-600 bg-slate-900 text-slate-300 text-[11px] font-bold cursor-pointer hover:border-red-400/50 hover:text-red-300 transition-colors disabled:opacity-50"
                    >
                      ✕ Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => wavRef.current?.click()}
                      disabled={wavAnalyzing}
                      className="min-h-[30px] px-2.5 rounded-md border border-slate-600 bg-slate-900 text-slate-300 text-[11px] font-bold cursor-pointer hover:border-cyan-400/40 hover:text-cyan-200 transition-colors disabled:opacity-50"
                    >
                      Replace audio
                    </button>
                  </div>
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200/90 leading-snug">
                    Ensure file contains the heterodyned (frequency-shifted) ultrasound signal, not
                    just ambient noise
                  </div>
                </div>
              </div>
            </div>
          )}
          {ultrasoundMode === "leak" && !wavName && (
            <p className="text-xs text-cyan-400 italic">
              Optional for Leak Detection. If no audio file is provided, AI can calculate CFM loss
              using manual Peak/RMS decibel inputs in the accordion below.
            </p>
          )}
          <input
            ref={wavRef}
            type="file"
            accept=".wav,audio/wav"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleWav(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* Image Upload — permanently visible */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-4 hover:border-amber-500/30 transition-all space-y-5 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFC700]">
              Data Ingestion
            </p>
            <h3 className="text-sm font-bold text-white mt-1">
              Visual Context / Image Upload
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              Always visible — photo or screenshot for Ultrasound AI analysis
            </p>
          </div>
          <Upload className="h-5 w-5 text-amber-400 shrink-0" aria-hidden />
        </div>

        <div className="space-y-4">
          <span className={fieldLabel}>Visual Context Image (AI Vision)</span>
          {!hasPhotoPreview ? (
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handlePhoto(e.dataTransfer.files?.[0] ?? null);
              }}
              className="w-full rounded-xl border border-dashed border-slate-600 hover:border-yellow-500/60 bg-slate-950/60 hover:bg-slate-950 px-6 py-10 text-center cursor-pointer transition-colors"
            >
              <Upload className="h-8 w-8 text-yellow-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-white">
                Drop visual context image here
              </p>
              <p className="text-xs text-slate-500 mt-1">
                .png, .jpg, .webp — photo or screenshot of valve / leak location
              </p>
            </button>
          ) : (
            <div className="space-y-4 rounded-xl border border-white/10 bg-slate-950/50 p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-36 h-24 shrink-0 rounded-lg border border-slate-600 bg-slate-900 relative overflow-hidden shadow-inner">
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt={photoName || "Visual context preview"}
                      className="w-full h-full object-cover object-left-top"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500 font-bold">
                      Preview
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100">
                    <span className="truncate max-w-[180px] text-white">
                      {photoName || "context.png"}
                    </span>
                    <span className="text-slate-500">|</span>
                    <span className="text-amber-300">AI Vision Ready</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={clearPhotoPreview}
                      className="min-h-[30px] px-2.5 rounded-md border border-slate-600 bg-slate-900 text-slate-300 text-[11px] font-bold cursor-pointer hover:border-red-400/50 hover:text-red-300 transition-colors"
                    >
                      ✕ Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => photoRef.current?.click()}
                      className="min-h-[30px] px-2.5 rounded-md border border-slate-600 bg-slate-900 text-slate-300 text-[11px] font-bold cursor-pointer hover:border-cyan-400/40 hover:text-cyan-200 transition-colors"
                    >
                      Replace image
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <input
            ref={photoRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp,.gif"
            className="hidden"
            onChange={(e) => {
              handlePhoto(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* SECTION 1 — Application Mode */}
      <AccordionShell
        id="mode"
        title="1. Application Mode"
        open={openSections.includes("mode")}
        onToggle={toggleSection}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {MODE_CARDS.map(({ id, title, hint, Icon }) => {
            const on = ultrasoundMode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setUltrasoundMode(id)}
                className={`min-h-[110px] p-4 rounded-xl border text-left cursor-pointer transition-all flex flex-col items-start gap-2 ${
                  on
                    ? "border-yellow-500 bg-yellow-500/10 shadow-[0_0_20px_rgba(234,179,8,0.12)]"
                    : "border-white/10 bg-slate-950/50 hover:border-yellow-500/40"
                }`}
              >
                <div
                  className={`h-9 w-9 rounded-lg border flex items-center justify-center ${
                    on
                      ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-400"
                      : "bg-slate-900 border-slate-700 text-slate-400"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <p className={`text-sm font-bold leading-tight ${on ? "text-white" : "text-slate-200"}`}>
                  {title}
                </p>
                <p className="text-[11px] text-slate-500 leading-snug">{hint}</p>
              </button>
            );
          })}
        </div>
        <p className={helperCls}>
          Active mode: <span className="text-yellow-400 font-semibold">{modeLabel}</span> — Section 3
          inputs adapt automatically.
        </p>
      </AccordionShell>

      {/* SECTION 2 — Hardware & Signal Physics */}
      <AccordionShell
        id="hardware"
        title="2. Hardware & Signal Physics"
        open={openSections.includes("hardware")}
        onToggle={toggleSection}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block min-w-0 sm:col-span-2 max-w-xl">
            <span className={fieldLabel}>Sensor / Transducer Type</span>
            <div className="relative">
              <select
                value={transducer}
                onChange={(e) => setTransducer(e.target.value)}
                className={selectCls}
              >
                {TRANSDUCER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
            <p className={helperCls}>Different sensors apply different hardware gain profiles</p>
          </label>

          <label className="block min-w-0 sm:col-span-2 max-w-xl">
            <span className={fieldLabel}>Hardware Brand Profile</span>
            <div className="relative">
              <select
                value={hardwareBrandProfile}
                onChange={(e) => setHardwareBrandProfile(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 transition-all outline-none w-full appearance-none cursor-pointer pr-10"
              >
                {HARDWARE_BRAND_PROFILES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
            <p className={helperCls}>
              Adjusts backend math scales to match physical instrument calibration.
            </p>
          </label>

          <label className="block min-w-0">
            <span className={fieldLabel}>Heterodyne Frequency (kHz)</span>
            <input
              type="number"
              min={20}
              max={100}
              step={1}
              value={heterodyneKhz}
              onChange={(e) => setHeterodyneKhz(e.target.value)}
              placeholder="e.g. 40"
              className={inputCls}
            />
            <p className={helperCls}>Tuned frequency for detection.</p>
          </label>

          <div className="block min-w-0 sm:col-span-2">
            <span className={`${fieldLabel} flex justify-between`}>
              <span>Gain / Sensitivity Setting</span>
              <span className="text-yellow-400 font-mono normal-case tracking-normal">
                {gainDb} dB
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={70}
              value={gainDb}
              onChange={(e) => setGainDb(Number(e.target.value))}
              className="w-full accent-yellow-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>0 dB</span>
              <span>70 dB</span>
            </div>
          </div>

          <label className="block min-w-0 sm:col-span-2 max-w-md">
            <span className={fieldLabel}>Distance to Target</span>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                step={0.1}
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
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
            <p className={helperCls}>Required for airborne amplitude correction.</p>
          </label>
        </div>
      </AccordionShell>

      {/* SECTION 3 — Mode-specific (min-height to reduce layout jump) */}
      <AccordionShell
        id="specific"
        title="3. Mode-Specific Critical Inputs"
        open={openSections.includes("specific")}
        onToggle={toggleSection}
      >
        <div className="min-h-[160px]">
          {(ultrasoundMode === "mechanical" || ultrasoundMode === "valve") && (
            <div className="mb-4">
              <span className={fieldLabel}>Database Baseline Reference</span>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs bg-slate-800 text-cyan-400 border border-cyan-500/30">
                12 dBµV
              </div>
              <p className={helperCls}>
                Mechanical bearing ultrasound is evaluated on delta over baseline. (+8 dB = Needs
                Lube, +24 dB = Severe Failure).
              </p>
            </div>
          )}

          <p className="text-xs font-bold text-yellow-400/90 uppercase tracking-wider mb-4">
            {modeLabel} parameters
          </p>

          {ultrasoundMode === "leak" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block min-w-0">
                  <span className={fieldLabel}>Gas Type</span>
                  <div className="relative">
                    <select
                      value={gasType}
                      onChange={(e) => setGasType(e.target.value)}
                      className={selectCls}
                    >
                      {GAS_TYPES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                  </div>
                </label>

                <label className="block min-w-0">
                  <span className={fieldLabel}>Asset Operational Hours</span>
                  <div className="relative">
                    <select
                      value={operationalHours}
                      onChange={(e) => setOperationalHours(e.target.value)}
                      className={selectCls}
                    >
                      {OPERATIONAL_HOURS.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                  </div>
                  <p className={helperCls}>
                    Required for accurate annualized leak cost calculation
                  </p>
                </label>
              </div>

              {operationalHours === "Custom Manual Entry" && (
                <label className="block min-w-0 max-w-xs">
                  <span className={fieldLabel}>Custom Hours / Year</span>
                  <input
                    type="number"
                    min={0}
                    max={8760}
                    value={customHours}
                    onChange={(e) => setCustomHours(e.target.value)}
                    placeholder="8760"
                    className={inputCls}
                  />
                </label>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="block min-w-0 sm:col-span-2 lg:col-span-1 space-y-3">
                  <label className="block min-w-0">
                    <span className={fieldLabel}>Orifice / Leak Profile</span>
                    <div className="relative">
                      <select
                        value={orificeProfile}
                        onChange={(e) => {
                          const v = e.target.value;
                          setOrificeProfile(v);
                          setCustomOrifice(v === "Custom / Manual Entry");
                        }}
                        className={selectCls}
                      >
                        {ORIFICE_PROFILES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                    </div>
                    <p className={helperCls}>
                      Affects CFM flow rate calculation accuracy by up to 30%
                    </p>
                  </label>
                  {customOrifice && (
                    <label className="block min-w-0">
                      <span className={fieldLabel}>Custom Discharge Coefficient</span>
                      <input
                        type="number"
                        step={0.01}
                        min={0}
                        max={1}
                        value={customDischargeCoeff}
                        onChange={(e) => setCustomDischargeCoeff(e.target.value)}
                        placeholder="0.75"
                        className={inputCls}
                      />
                      <p className={helperCls}>
                        Enter specific coefficient for unique leak geometry.
                      </p>
                    </label>
                  )}
                </div>

                <label className="block min-w-0">
                  <span className={fieldLabel}>System Pressure</span>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={0}
                      value={systemPressure}
                      onChange={(e) => setSystemPressure(e.target.value)}
                      className={inputCls}
                    />
                    <div className="relative w-24 shrink-0">
                      <select
                        value={pressureUnit}
                        onChange={(e) => setPressureUnit(e.target.value as "PSI" | "Bar")}
                        className={selectCls}
                      >
                        <option value="PSI">PSI</option>
                        <option value="Bar">Bar</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                    </div>
                  </div>
                </label>

                <label className="block min-w-0">
                  <span className={fieldLabel}>Cost of Gas ($ / 1000 SCF)</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={costOfGas}
                      onChange={(e) => setCostOfGas(e.target.value)}
                      className={`${inputCls} pl-7`}
                    />
                  </div>
                </label>
              </div>
            </div>
          )}

          {ultrasoundMode === "mechanical" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block min-w-0">
                <span className={fieldLabel}>Equipment RPM</span>
                <input
                  type="number"
                  min={0}
                  value={equipmentRpm}
                  onChange={(e) => setEquipmentRpm(e.target.value)}
                  placeholder="e.g. 1780"
                  className={inputCls}
                />
              </label>
              <label className="block min-w-0">
                <span className={fieldLabel}>Grease Type</span>
                <div className="relative">
                  <select
                    value={greaseType}
                    onChange={(e) => setGreaseType(e.target.value)}
                    className={selectCls}
                  >
                    {GREASE_TYPES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </label>
              <div className="block min-w-0">
                <span className={fieldLabel}>Lubrication State</span>
                <div className="flex flex-wrap gap-2">
                  {(["Pre-Grease", "Post-Grease"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setLubeState(s)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                        lubeState === s
                          ? "bg-yellow-500 text-slate-900 border-yellow-500"
                          : "bg-slate-950 border-slate-700 text-slate-400 hover:border-yellow-500"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {ultrasoundMode === "electrical" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block min-w-0">
                <span className={fieldLabel}>Voltage Class</span>
                <div className="relative">
                  <select
                    value={voltageClass}
                    onChange={(e) => setVoltageClass(e.target.value)}
                    className={selectCls}
                  >
                    {VOLTAGE_CLASSES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </label>
              <label className="block min-w-0">
                <span className={fieldLabel}>Equipment Type</span>
                <div className="relative">
                  <select
                    value={elecEquipType}
                    onChange={(e) => setElecEquipType(e.target.value)}
                    className={selectCls}
                  >
                    {ELEC_EQUIPMENT.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </label>
            </div>
          )}

          {ultrasoundMode === "valve" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block min-w-0">
                <span className={fieldLabel}>Valve Type</span>
                <div className="relative">
                  <select
                    value={valveType}
                    onChange={(e) => setValveType(e.target.value)}
                    className={selectCls}
                  >
                    {VALVE_TYPES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </label>
              <div className="block min-w-0">
                <span className={fieldLabel}>Expected State</span>
                <div className="flex flex-wrap gap-2">
                  {(["Normally Open", "Normally Closed"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setExpectedState(s)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                        expectedState === s
                          ? "bg-yellow-500 text-slate-900 border-yellow-500"
                          : "bg-slate-950 border-slate-700 text-slate-400 hover:border-yellow-500"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </AccordionShell>

      {/* SECTION 4 — Manual Telemetry */}
      <AccordionShell
        id="ingestion"
        title="4. Manual Telemetry & Asset Tag"
        open={openSections.includes("ingestion")}
        onToggle={toggleSection}
      >
        <div className="space-y-3 mb-5">
          <span className={fieldLabel}>Drag & Drop Audio File (.wav)</span>
          <button
            type="button"
            onClick={() => { if (!wavAnalyzing) telemetryWavRef.current?.click(); }}
            onDragOver={(e) => { if (wavAnalyzing) return; e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              if (wavAnalyzing) return;
              const file = e.dataTransfer.files?.[0];
              if (file) handleWav(file);
            }}
            disabled={wavAnalyzing}
            className={`w-full rounded-xl border border-dashed px-5 py-6 text-center transition-colors ${wavAnalyzing ? "border-slate-700 bg-slate-900/40 opacity-50 cursor-not-allowed" : "border-slate-600 hover:border-cyan-500/50 bg-slate-950/60 hover:bg-slate-950 cursor-pointer"}`}
          >
            <FileAudio className={`h-7 w-7 mx-auto mb-2 ${wavAnalyzing ? "text-slate-500" : "text-cyan-400"}`} />
            <p className="text-sm font-bold text-white flex items-center justify-center gap-2">
              {wavAnalyzing && <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />}
              {wavAnalyzing
                ? "Extracting Telemetry Data..."
                : "Drop .WAV here to auto-fill Peak, RMS & Crest Factor"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Client-side Web Audio analysis — no server upload required for metrics
            </p>
          </button>
          <input
            ref={telemetryWavRef}
            type="file"
            accept=".wav,audio/wav,audio/wave,audio/x-wav"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleWav(file);
              e.target.value = "";
            }}
          />
          {wavMetricsNote && (
            <p className="text-[11px] text-emerald-400/90 font-mono">{wavMetricsNote}</p>
          )}
        </div>

        <div>
          <span className={fieldLabel}>Manual Telemetry</span>
          <div
            className={`grid gap-4 ${
              ultrasoundMode === "mechanical"
                ? "grid-cols-1 sm:grid-cols-3"
                : "grid-cols-2"
            }`}
          >
            <label className="block min-w-0">
              <span className={fieldLabel}>Peak dBµV</span>
              <input
                type="number"
                step={0.1}
                value={peakDbuV}
                onChange={(e) => {
                  setCrestManual(false);
                  setPeakDbuV(e.target.value);
                }}
                placeholder="42.5"
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>RMS dBµV</span>
              <input
                type="number"
                step={0.1}
                value={rmsDbuV}
                onChange={(e) => {
                  setCrestManual(false);
                  setRmsDbuV(e.target.value);
                }}
                placeholder="28.1"
                className={inputCls}
              />
            </label>
            {ultrasoundMode === "mechanical" && (
              <label className="block min-w-0">
                <span className={fieldLabel}>Crest Factor</span>
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  value={crestFactor}
                  onChange={(e) => {
                    setCrestManual(true);
                    setCrestFactor(e.target.value);
                  }}
                  placeholder={
                    autoCrestFactor != null ? String(autoCrestFactor) : "e.g. 1.51"
                  }
                  className={inputCls}
                />
                <p className={helperCls}>
                  Auto: Peak dB − RMS dB → 10^((Peak − RMS) / 20)
                  {autoCrestFactor != null ? ` (= ${autoCrestFactor})` : ""}. Edit to
                  override.
                </p>
              </label>
            )}
          </div>
          {peakRmsInvalid && (
            <p
              className="mt-2 text-xs text-amber-400 leading-snug"
              role="alert"
            >
              Peak dBµV must be greater than or equal to RMS dBµV.
            </p>
          )}
        </div>

        <label className="block min-w-0 mt-4">
          <span className={fieldLabel}>Physical Asset Tag / Component Label</span>
          <input
            type="text"
            value={physicalAssetTag}
            onChange={(e) => setPhysicalAssetTag(e.target.value)}
            placeholder="e.g., Line 4 - Lower Union Valve"
            className={inputCls}
          />
          <p className={helperCls}>
            Ensures the exact physical location is included in the CMMS work order payload.
          </p>
        </label>
      </AccordionShell>
    </div>
  );
}
