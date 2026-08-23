import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Info,
  Loader2,
  Power,
  RotateCcw,
  Upload
} from "lucide-react";
import {
  extractMcaDataFromFile,
  formatMcaPdfLabel,
  mcaExtractHasGroundwall,
  type McaExtractedData,
  type RicDataPoint
} from "../lib/mca/mcaPdfExtractor";
import { mcaTripletHasData } from "../lib/mca/mcaPersistence";

type McaAccordionSection = "fingerprint" | "config" | "phase" | "insulation";
export type McaMode = "static" | "dynamic" | "online";
type InsulationTestType = "PI" | "DAR";
type TestConnectionPoint = "terminals" | "mcc";

type PhasePair = "uv" | "vw" | "wu";

type PhaseMetrics = {
  resistance: string;
  impedance: string;
  inductance: string;
  inductanceMin: string;
  inductanceMax: string;
  phaseAngle: string;
  ifRatio: string;
};

const WINDING_CONFIGS = ["Wye/Star", "Delta", "Wound Rotor", "Synchronous"] as const;

const RATED_VOLTAGES = ["208V", "480V", "2300V", "4160V", "13.8kV"] as const;

const INSULATION_CLASSES = [
  "Class A 105°C",
  "Class B 130°C",
  "Class F 155°C",
  "Class H 180°C"
] as const;

const INSULATION_TYPES = [
  "Form-Wound (Medium/High Voltage)",
  "Random-Wound (Low Voltage)"
] as const;

const NEMA_DESIGNS = ["A", "B", "C", "D"] as const;

const MEGGER_VOLTAGES = ["250V", "500V", "1000V", "2500V", "5000V"] as const;

const PHASE_PAIRS: { id: PhasePair; label: string }[] = [
  { id: "uv", label: "U–V" },
  { id: "vw", label: "V–W" },
  { id: "wu", label: "W–U" }
];

const MODE_CARDS: {
  id: McaMode;
  title: string;
  hint: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: "static",
    title: "De-Energized (Static)",
    hint: "Standard 3-minute health check",
    Icon: Power
  },
  {
    id: "dynamic",
    title: "De-Energized (Dynamic)",
    hint: "Manually rotating shaft for rotor bar cracks",
    Icon: RotateCcw
  },
  {
    id: "online",
    title: "Energized (Online)",
    hint: "Power quality analysis while running",
    Icon: Activity
  }
];

const emptyPhase = (): PhaseMetrics => ({
  resistance: "",
  impedance: "",
  inductance: "",
  inductanceMin: "",
  inductanceMax: "",
  phaseAngle: "",
  ifRatio: ""
});

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
  id: McaAccordionSection;
  title: string;
  open: boolean;
  onToggle: (id: McaAccordionSection) => void;
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

export interface McaOperatorSnapshot {
  mode: string;
  windingConfig: string;
  ratedHp: number | null;
  ratedVoltage: string | null;
  windingTempC: number | null;
  ambientTempC: number | null;
  insulationClass: string | null;
  testVoltageV: number | null;
  phases: {
    uv: PhaseMetrics;
    vw: PhaseMetrics;
    wu: PhaseMetrics;
  };
  ir15sMOmega: number | null;
  ir30sMOmega: number | null;
  ir1mMOmega: number | null;
  ir10mMOmega: number | null;
  reading30s: number | null;
  reading60s: number | null;
  reading1Min: number | null;
  reading10Min: number | null;
  megohms: number | null;
  reportPi: number | null;
  reportDar: number | null;
  /** Rotor Influence Check series when extracted from PDF. */
  ricData: RicDataPoint[] | null;
  extractMeta?: {
    fileName: string | null;
    formatDetected: string | null;
    confidenceScore: number | null;
  } | null;
}

export interface McaInputAccordionsProps {
  onToast?: (message: string, type?: "success" | "info" | "warning" | "error") => void;
  /** Emits live operator inputs for Diagnose → save-analysis-result. */
  onSnapshotChange?: (snapshot: McaOperatorSnapshot) => void;
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
}

function optionalNum(raw: string): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/[^\d.eE+-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export default function McaInputAccordions({
  onToast,
  onSnapshotChange,
  equipment
}: McaInputAccordionsProps) {
  const [openSections, setOpenSections] = useState<McaAccordionSection[]>([]);
  const [mcaMode, setMcaMode] = useState<McaMode>("static");

  // Section 1 — Fingerprint
  const [windingConfig, setWindingConfig] = useState<string>("Wye/Star");
  const [hpKw, setHpKw] = useState("");
  const [ratedVoltage, setRatedVoltage] = useState<string>("480V");
  const [fla, setFla] = useState("");
  const [insulationClass, setInsulationClass] = useState<string>("Class F 155°C");
  const [insulationType, setInsulationType] = useState<string>(
    "Random-Wound (Low Voltage)"
  );
  const [nemaDesign, setNemaDesign] = useState<string>("B");
  const [serviceFactor, setServiceFactor] = useState("1.15");
  const [statorSlots, setStatorSlots] = useState("");
  const [rotorBars, setRotorBars] = useState("");

  // Prefill nameplate fields from top Equipment Selection when available
  useEffect(() => {
    if (equipment?.voltage) {
      const v = String(equipment.voltage).trim();
      if (v) setRatedVoltage(v.includes("V") ? v : `${v}V`);
    }
    if (equipment?.hp != null && Number.isFinite(equipment.hp) && equipment.hp > 0) {
      setHpKw(String(equipment.hp));
    }
  }, [equipment?.voltage, equipment?.hp, equipment?.assetTag]);

  // Section 2 — Config
  const [tvsBaseline, setTvsBaseline] = useState("");
  const [windingTemp, setWindingTemp] = useState("");
  const [ambientTemp, setAmbientTemp] = useState("");

  // Section 3 — Phase-to-phase (offline) / Online PQ
  const [testConnectionPoint, setTestConnectionPoint] =
    useState<TestConnectionPoint>("terminals");
  const [phases, setPhases] = useState<Record<PhasePair, PhaseMetrics>>({
    uv: emptyPhase(),
    vw: emptyPhase(),
    wu: emptyPhase()
  });
  const [voltageUnbalance, setVoltageUnbalance] = useState("");
  const [currentUnbalance, setCurrentUnbalance] = useState("");
  const [voltageThd, setVoltageThd] = useState("");
  const [currentThd, setCurrentThd] = useState("");
  const [powerFactor, setPowerFactor] = useState("");

  // Section 4 — Insulation
  const [megohms, setMegohms] = useState("");
  const [capacitanceCg, setCapacitanceCg] = useState("");
  const [capacitanceUnit, setCapacitanceUnit] = useState<"nF" | "µF">("nF");
  const [dissipationFactor, setDissipationFactor] = useState("");
  const [testVoltage, setTestVoltage] = useState<string>("1000V");
  const [insulationTestType, setInsulationTestType] = useState<InsulationTestType>("PI");
  const [reading1Min, setReading1Min] = useState("");
  const [reading10Min, setReading10Min] = useState("");
  const [reading30s, setReading30s] = useState("");
  const [reading60s, setReading60s] = useState("");
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [extractParsing, setExtractParsing] = useState(false);
  const [extractBanner, setExtractBanner] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [ricData, setRicData] = useState<RicDataPoint[] | null>(null);
  const [reportPi, setReportPi] = useState<number | null>(null);
  const [reportDar, setReportDar] = useState<number | null>(null);
  const [ir15s, setIr15s] = useState("");
  const [extractMeta, setExtractMeta] = useState<{
    fileName: string | null;
    formatDetected: string | null;
    confidenceScore: number | null;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isOnline = mcaMode === "online";
  const isDynamic = mcaMode === "dynamic";

  // Keep Diagnose / save path in sync with accordion inputs
  useEffect(() => {
    if (!onSnapshotChange) return;
    const testV = optionalNum(String(testVoltage).replace(/[^\d.]/g, ""));
    onSnapshotChange({
      mode: mcaMode,
      windingConfig,
      ratedHp: optionalNum(hpKw),
      ratedVoltage: ratedVoltage || null,
      windingTempC: optionalNum(windingTemp),
      ambientTempC: optionalNum(ambientTemp),
      insulationClass: insulationClass || null,
      testVoltageV: testV,
      phases: {
        uv: { ...phases.uv },
        vw: { ...phases.vw },
        wu: { ...phases.wu }
      },
      ir15sMOmega: optionalNum(ir15s),
      ir30sMOmega: optionalNum(reading30s),
      ir1mMOmega:
        optionalNum(reading1Min) ??
        optionalNum(reading60s) ??
        optionalNum(megohms),
      ir10mMOmega: optionalNum(reading10Min),
      reading30s: optionalNum(reading30s),
      reading60s: optionalNum(reading60s),
      reading1Min: optionalNum(reading1Min),
      reading10Min: optionalNum(reading10Min),
      megohms: optionalNum(megohms),
      reportPi,
      reportDar,
      ricData: ricData && ricData.length > 0 ? ricData : null,
      extractMeta
    });
  }, [
    onSnapshotChange,
    mcaMode,
    windingConfig,
    hpKw,
    ratedVoltage,
    windingTemp,
    ambientTemp,
    insulationClass,
    testVoltage,
    phases,
    // Groundwall / insulation IR timeline — any edit must re-emit snapshot
    ir15s,
    reading30s,
    reading60s,
    reading1Min,
    reading10Min,
    megohms,
    reportPi,
    reportDar,
    ricData,
    extractMeta
  ]);

  const ratedVoltageVolts = useMemo(() => {
    const raw = ratedVoltage.trim().toLowerCase();
    if (raw.endsWith("kv")) {
      const n = parseFloat(raw.replace("kv", ""));
      return Number.isFinite(n) ? n * 1000 : null;
    }
    const n = parseFloat(raw.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }, [ratedVoltage]);

  const isLowVoltageMotor =
    ratedVoltageVolts != null && ratedVoltageVolts < 480;

  const testVoltageVolts = useMemo(() => {
    const n = parseFloat(testVoltage.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }, [testVoltage]);

  const showHighVoltageWarning =
    isLowVoltageMotor && testVoltageVolts != null && testVoltageVolts > 500;

  const piRatio = useMemo(() => {
    const one = parseFloat(reading1Min);
    const ten = parseFloat(reading10Min);
    if (!Number.isFinite(one) || !Number.isFinite(ten) || one <= 0) return null;
    return (ten / one).toFixed(2);
  }, [reading1Min, reading10Min]);

  const darRatio = useMemo(() => {
    const thirty = parseFloat(reading30s);
    const sixty = parseFloat(reading60s);
    if (!Number.isFinite(thirty) || !Number.isFinite(sixty) || thirty <= 0) return null;
    return (sixty / thirty).toFixed(2);
  }, [reading30s, reading60s]);

  const toggleSection = (id: McaAccordionSection) => {
    setOpenSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const updatePhase = (pair: PhasePair, key: keyof PhaseMetrics, value: string) => {
    setPhases((prev) => ({
      ...prev,
      [pair]: { ...prev[pair], [key]: value }
    }));
  };

  const fmtNum = (n: number | undefined | null, digits = 4): string => {
    if (n == null || !Number.isFinite(n) || n === 0) return "";
    const rounded = Number(n.toFixed(digits));
    return String(rounded);
  };

  const applyExtractedToForm = (extracted: McaExtractedData, fileName: string) => {
    const hasWinding =
      mcaTripletHasData(extracted.phaseR) ||
      mcaTripletHasData(extracted.phaseL) ||
      mcaTripletHasData(extracted.phaseZ) ||
      mcaTripletHasData(extracted.phaseFi) ||
      mcaTripletHasData(extracted.phaseIF);
    const hasGw = mcaExtractHasGroundwall(extracted);
    const hasRic = Boolean(extracted.ricData && extracted.ricData.length > 0);

    if (extracted.ratedHp != null && extracted.ratedHp > 0) {
      setHpKw(String(extracted.ratedHp));
    }
    if (extracted.windingTempC != null && Number.isFinite(extracted.windingTempC)) {
      setWindingTemp(String(extracted.windingTempC));
    }
    if (extracted.insulationClass) {
      const map: Record<string, string> = {
        A: "Class A 105°C",
        B: "Class B 130°C",
        F: "Class F 155°C",
        H: "Class H 180°C"
      };
      setInsulationClass(map[extracted.insulationClass] || insulationClass);
    }
    if (extracted.testVoltageV != null && extracted.testVoltageV > 0) {
      const v = Math.round(extracted.testVoltageV);
      const match = MEGGER_VOLTAGES.find(
        (opt) => parseFloat(opt) === v || opt === `${v}V`
      );
      setTestVoltage(match || `${v}V`);
    }

    if (hasWinding) {
      setPhases({
        uv: {
          ...emptyPhase(),
          resistance: fmtNum(extracted.phaseR[0], 4),
          inductance: fmtNum(extracted.phaseL[0], 3),
          impedance: fmtNum(extracted.phaseZ[0], 3),
          phaseAngle: fmtNum(extracted.phaseFi[0], 2),
          ifRatio: fmtNum(extracted.phaseIF[0], 3)
        },
        vw: {
          ...emptyPhase(),
          resistance: fmtNum(extracted.phaseR[1], 4),
          inductance: fmtNum(extracted.phaseL[1], 3),
          impedance: fmtNum(extracted.phaseZ[1], 3),
          phaseAngle: fmtNum(extracted.phaseFi[1], 2),
          ifRatio: fmtNum(extracted.phaseIF[1], 3)
        },
        wu: {
          ...emptyPhase(),
          resistance: fmtNum(extracted.phaseR[2], 4),
          inductance: fmtNum(extracted.phaseL[2], 3),
          impedance: fmtNum(extracted.phaseZ[2], 3),
          phaseAngle: fmtNum(extracted.phaseFi[2], 2),
          ifRatio: fmtNum(extracted.phaseIF[2], 3)
        }
      });
    }

    // Section 4 — Groundwall IR timeline (IR 30s / 1m / 10m / Report PI / DAR).
    // Accept camelCase + snake_case mirrors from vision (ir_30s, ir_1m, pi, dar).
    const ir15 =
      extracted.ir15sMOmega ?? extracted.ir_15s ?? null;
    const ir30 =
      extracted.ir30sMOmega ?? extracted.ir_30s ?? null;
    const ir1m =
      extracted.ir1mMOmega ?? extracted.ir_1m ?? null;
    const ir10 =
      extracted.ir10mMOmega ?? extracted.ir_10m ?? null;
    const piVal = extracted.reportPi ?? extracted.pi ?? null;
    const darVal = extracted.reportDar ?? extracted.dar ?? null;

    const hasGwFields =
      hasGw ||
      (ir15 != null && ir15 > 0) ||
      (ir30 != null && ir30 > 0) ||
      (ir1m != null && ir1m > 0) ||
      (ir10 != null && ir10 > 0) ||
      (piVal != null && piVal > 0) ||
      (darVal != null && darVal > 0);

    if (hasGwFields) {
      if (ir15 != null && ir15 > 0) {
        setIr15s(fmtNum(ir15, 3));
      }
      if (ir30 != null && ir30 > 0) {
        setReading30s(fmtNum(ir30, 3));
      }
      if (ir1m != null && ir1m > 0) {
        const v = fmtNum(ir1m, 3);
        setReading1Min(v);
        setReading60s(v);
        setMegohms(v);
      }
      if (ir10 != null && ir10 > 0) {
        setReading10Min(fmtNum(ir10, 3));
      }
      if (piVal != null && piVal > 0) {
        setReportPi(piVal);
      } else if (ir10 != null && ir1m != null && ir1m > 0) {
        const derived = ir10 / ir1m;
        if (derived > 0 && derived < 50) {
          setReportPi(Math.round(derived * 1000) / 1000);
        }
      }
      if (darVal != null && darVal > 0) {
        setReportDar(darVal);
      } else if (ir1m != null && ir30 != null && ir30 > 0) {
        const derived = ir1m / ir30;
        if (derived > 0 && derived < 50) {
          setReportDar(Math.round(derived * 1000) / 1000);
        }
      }
      // Prefer PI mode when 10m present; else DAR when 30s present
      if (ir10 != null && ir10 > 0) {
        setInsulationTestType("PI");
      } else if (ir30 != null && ir30 > 0) {
        setInsulationTestType("DAR");
      }
    }

    if (hasRic && extracted.ricData) {
      setRicData(extracted.ricData);
      setMcaMode("dynamic");
    }

    setExtractMeta({
      fileName,
      formatDetected: extracted.formatDetected,
      confidenceScore: extracted.confidenceScore
    });

    // Open sections that received data so the operator can verify visually
    const nextOpen: McaAccordionSection[] = [];
    if (hasWinding) {
      nextOpen.push("fingerprint", "config", "phase");
    }
    if (hasGwFields) nextOpen.push("insulation");
    if (nextOpen.length) {
      setOpenSections((prev) => Array.from(new Set([...prev, ...nextOpen])));
    }

    const parts: string[] = [];
    if (hasWinding) parts.push("Winding / phase balance");
    if (hasGwFields) parts.push("Groundwall IR / PI / DAR");
    if (hasRic) parts.push(`RIC (${extracted.ricData!.length} pts)`);
    setExtractBanner(
      parts.length
        ? `Auto-filled from ${formatMcaPdfLabel(extracted.formatDetected)} · ${parts.join(" · ")} (confidence ${extracted.confidenceScore}%)`
        : null
    );
  };

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    const isPdf =
      /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    const isImage =
      /^image\//i.test(file.type) ||
      /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
    if (!isPdf && !isImage) {
      onToast?.(
        "Upload an MCA report PDF or analyzer screenshot (.pdf / .png / .jpg).",
        "warning"
      );
      return;
    }

    setExtractError(null);
    setExtractBanner(null);

    if (isImage) {
      const preview = URL.createObjectURL(file);
      setUploadPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return preview;
      });
    } else {
      setUploadPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
    setUploadName(file.name);

    setExtractParsing(true);
    try {
      const extracted = await extractMcaDataFromFile(file);
      const hasWinding =
        mcaTripletHasData(extracted.phaseR) ||
        mcaTripletHasData(extracted.phaseL) ||
        mcaTripletHasData(extracted.phaseZ) ||
        mcaTripletHasData(extracted.phaseFi) ||
        mcaTripletHasData(extracted.phaseIF);
      const hasGw = mcaExtractHasGroundwall(extracted);
      const hasRic = Boolean(extracted.ricData && extracted.ricData.length > 0);

      if (!hasWinding && !hasGw && !hasRic) {
        setExtractError(
          isImage
            ? "Vision model found no winding, groundwall, or RIC values — try a sharper full-screen PNG/JPEG or enter values manually."
            : "No winding, groundwall, or RIC values found — check the PDF or enter values manually."
        );
        onToast?.(
          isImage
            ? "MCA vision extract found no measurable fields."
            : "MCA extract found no measurable fields.",
          "warning"
        );
        return;
      }

      applyExtractedToForm(extracted, file.name);
      onToast?.(
        isImage
          ? `MCA screenshot read by vision — form fields updated for review before Run.`
          : `MCA report parsed — form fields updated for review before Run.`,
        "success"
      );
    } catch (err) {
      console.warn("[McaInputAccordions] extract failed:", err);
      setExtractError(
        err instanceof Error ? err.message : "Failed to parse MCA report."
      );
      onToast?.("MCA extract failed.", "error");
    } finally {
      setExtractParsing(false);
    }
  };

  const clearUploadPreview = () => {
    setUploadPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setUploadName(null);
    setExtractBanner(null);
    setExtractError(null);
    setExtractMeta(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const hasUploadPreview = Boolean(uploadPreview || uploadName);

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
      {/* Data Ingestion — permanently visible (not inside accordion) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-4 hover:border-amber-500/30 transition-all space-y-5 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFC700]">
              Data Ingestion
            </p>
            <h3 className="text-sm font-bold text-white mt-1">
              MCA Report PDF / Analyzer Image Upload
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              Auto-extracts winding, groundwall IR (30s / 1m / 10m), PI / DAR, and RIC —
              PDF text parse or vision (PNG/JPEG) fills fields below for review before Run
            </p>
          </div>
          <Upload className="h-5 w-5 text-amber-400 shrink-0" aria-hidden />
        </div>

        <div className="space-y-4">
          <span className={fieldLabel}>
            Analyzer Report Upload (PDF preferred · ALL-TEST / Megger / Baker)
          </span>
          {!hasUploadPreview ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className="w-full rounded-xl border border-dashed border-slate-600 hover:border-yellow-500/60 bg-slate-950/60 hover:bg-slate-950 px-6 py-10 text-center cursor-pointer transition-colors"
            >
              <Upload className="h-8 w-8 text-yellow-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-white">
                Drop MCA PDF or analyzer screenshot here
              </p>
              <p className="text-xs text-slate-500 mt-1">
                .pdf · .png / .jpg — text PDF or vision screenshot (GPT-4o / Qwen VL)
              </p>
            </button>
          ) : (
            <div className="space-y-4 rounded-xl border border-white/10 bg-slate-950/50 p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-36 h-24 shrink-0 rounded-lg border border-slate-600 bg-slate-900 relative overflow-hidden shadow-inner">
                  {extractParsing ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-amber-300">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-[10px] font-bold">
                      {/\.(png|jpe?g|webp|gif)$/i.test(uploadName || "")
                        ? "Vision…"
                        : "Parsing…"}
                    </span>
                    </div>
                  ) : uploadPreview ? (
                    <img
                      src={uploadPreview}
                      alt={uploadName || "MCA preview"}
                      className="w-full h-full object-cover object-left-top"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500 font-bold px-2 text-center">
                      PDF · {uploadName || "report.pdf"}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100">
                    <span className="truncate max-w-[220px] text-white">
                      {uploadName || "mca-report.pdf"}
                    </span>
                    <span className="text-slate-500">|</span>
                    <span className="text-amber-300">
                      {extractParsing
                        ? "Extracting…"
                        : extractBanner
                          ? "Fields auto-filled"
                          : "Ready"}
                    </span>
                  </div>
                  {extractBanner && (
                    <p className="text-[11px] text-emerald-300/90 flex items-start gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      {extractBanner}
                    </p>
                  )}
                  {extractError && (
                    <p className="text-[11px] text-amber-400">{extractError}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={clearUploadPreview}
                      className="min-h-[30px] px-2.5 rounded-md border border-slate-600 bg-slate-900 text-slate-300 text-[11px] font-bold cursor-pointer hover:border-red-400/50 hover:text-red-300 transition-colors"
                    >
                      ✕ Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={extractParsing}
                      className="min-h-[30px] px-2.5 rounded-md border border-slate-600 bg-slate-900 text-slate-300 text-[11px] font-bold cursor-pointer hover:border-cyan-400/40 hover:text-cyan-200 transition-colors disabled:opacity-50"
                    >
                      Replace file
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp,.gif"
            className="hidden"
            onChange={(e) => {
              void handleFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </div>

        {ricData && ricData.length > 0 && (
          <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-300 mb-1">
              Rotor Influence Check — extracted
            </p>
            <p className="text-sm text-slate-200">
              {ricData.length} angle / inductance points loaded (L12 / L23 / L31).
              Dynamic mode enabled — values are included in the save payload.
            </p>
            <p className="text-[11px] text-slate-500 mt-1 font-mono">
              First: {ricData[0].angle}° → L12 {ricData[0].l12} · Last:{" "}
              {ricData[ricData.length - 1].angle}° → L12{" "}
              {ricData[ricData.length - 1].l12}
            </p>
          </div>
        )}
      </div>

      {/* SECTION 1 — Motor Electromagnetic Fingerprint */}
      <AccordionShell
        id="fingerprint"
        title="1. Motor Electromagnetic Fingerprint"
        open={openSections.includes("fingerprint")}
        onToggle={toggleSection}
      >
        <div>
          <span className={fieldLabel}>Winding Configuration</span>
          <div className="flex flex-wrap gap-2">
            {WINDING_CONFIGS.map((cfg) => (
              <button
                key={cfg}
                type="button"
                onClick={() => setWindingConfig(cfg)}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                  windingConfig === cfg
                    ? "bg-yellow-500 text-slate-900 border-yellow-500"
                    : "bg-slate-950 text-slate-400 border-slate-700 hover:border-yellow-500/50 hover:text-slate-200"
                }`}
              >
                {cfg}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-3">
            Nameplate Genetics
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <label className="block min-w-0">
              <span className={fieldLabel}>Horsepower (HP) / kW</span>
              <input
                type="number"
                value={hpKw}
                onChange={(e) => setHpKw(e.target.value)}
                placeholder="e.g. 100"
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Rated Voltage</span>
              <div className="relative">
                <select
                  value={ratedVoltage}
                  onChange={(e) => {
                    const next = e.target.value;
                    setRatedVoltage(next);
                    const raw = next.trim().toLowerCase();
                    const volts = raw.endsWith("kv")
                      ? parseFloat(raw.replace("kv", "")) * 1000
                      : parseFloat(raw.replace(/[^\d.]/g, ""));
                    if (Number.isFinite(volts) && volts < 480) {
                      const tv = parseFloat(testVoltage.replace(/[^\d.]/g, ""));
                      if (Number.isFinite(tv) && tv > 500) setTestVoltage("500V");
                    }
                  }}
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
            <label className="block min-w-0">
              <span className={fieldLabel}>Full Load Amps (FLA)</span>
              <input
                type="number"
                value={fla}
                onChange={(e) => setFla(e.target.value)}
                placeholder="e.g. 124"
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Insulation Class</span>
              <div className="relative">
                <select
                  value={insulationClass}
                  onChange={(e) => setInsulationClass(e.target.value)}
                  className={selectCls}
                >
                  {INSULATION_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Insulation Type</span>
              <div className="relative">
                <select
                  value={insulationType}
                  onChange={(e) => setInsulationType(e.target.value)}
                  className={selectCls}
                >
                  {INSULATION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
              <p className={helperCls}>
                Form-wound motors require different degradation tolerances for surge/DF testing.
              </p>
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>NEMA Design Letter</span>
              <div className="relative">
                <select
                  value={nemaDesign}
                  onChange={(e) => setNemaDesign(e.target.value)}
                  className={selectCls}
                >
                  {NEMA_DESIGNS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Service Factor</span>
              <input
                type="number"
                step="0.01"
                value={serviceFactor}
                onChange={(e) => setServiceFactor(e.target.value)}
                placeholder="1.15"
                className={inputCls}
              />
            </label>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            Rotor / Stator Geometry{" "}
            <span className="normal-case tracking-normal font-medium text-slate-600">
              (optional)
            </span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block min-w-0">
              <span className={fieldLabel}>Number of Stator Slots</span>
              <input
                type="number"
                value={statorSlots}
                onChange={(e) => setStatorSlots(e.target.value)}
                placeholder="e.g. 48"
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Number of Rotor Bars</span>
              <input
                type="number"
                value={rotorBars}
                onChange={(e) => setRotorBars(e.target.value)}
                placeholder="e.g. 40"
                className={inputCls}
              />
            </label>
          </div>
        </div>
      </AccordionShell>

      {/* SECTION 2 — Test Configuration & Baseline */}
      <AccordionShell
        id="config"
        title="2. Test Configuration & Baseline"
        open={openSections.includes("config")}
        onToggle={toggleSection}
      >
        <div>
          <span className={fieldLabel}>Test Mode</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {MODE_CARDS.map(({ id, title, hint, Icon }) => {
              const active = mcaMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMcaMode(id)}
                  className={`text-left p-4 rounded-xl border cursor-pointer transition-all min-h-[110px] ${
                    active
                      ? "border-yellow-500 bg-yellow-500/10"
                      : "border-white/10 bg-slate-950/50 hover:border-yellow-500/50"
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 mb-2 ${active ? "text-yellow-400" : "text-slate-500"}`}
                  />
                  <p className={`text-sm font-bold leading-tight ${active ? "text-white" : "text-slate-200"}`}>
                    {title}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">{hint}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-w-md space-y-2">
          <label className="block min-w-0">
            <span className={fieldLabel}>TVS Baseline Reference</span>
            <input
              type="number"
              step="0.01"
              value={tvsBaseline}
              onChange={(e) => setTvsBaseline(e.target.value)}
              placeholder="e.g. 1.02"
              className={inputCls}
            />
            <p className={helperCls}>
              Test Value Static — The motor&apos;s &ldquo;birth&rdquo; signature for rapid
              degradation detection.
            </p>
          </label>
          <span
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
            title="Copper/aluminum temperature correction applied behind the scenes."
          >
            ⚙️ Winding resistance normalized to 40°C; Insulation metrics normalized to 20°C
            per IEEE 43.
            <Info className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
          </span>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-3">
            Temperature Correction
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <label className="block min-w-0">
              <span className={fieldLabel}>Winding Temperature (°C)</span>
              <input
                type="number"
                value={windingTemp}
                onChange={(e) => setWindingTemp(e.target.value)}
                placeholder="e.g. 35"
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Ambient Temperature (°C)</span>
              <input
                type="number"
                value={ambientTemp}
                onChange={(e) => setAmbientTemp(e.target.value)}
                placeholder="e.g. 22"
                className={inputCls}
              />
            </label>
          </div>
          <p className={helperCls}>
            Used to auto-correct Ohms readings to a standard 40°C baseline.
          </p>
        </div>
      </AccordionShell>

      {/* SECTION 3 — Offline phase OR Online PQ (min-height reduces layout jump) */}
      <AccordionShell
        id="phase"
        title={
          isOnline
            ? "3. High-Fidelity Data Ingestion (Online Electrical)"
            : "3. High-Fidelity Data Ingestion (Phase-to-Phase)"
        }
        open={openSections.includes("phase")}
        onToggle={toggleSection}
      >
        <div className="min-h-[280px]">
          {!isOnline ? (
            <>
              <div className="mb-4">
                <span className={fieldLabel}>Test Connection Point</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTestConnectionPoint("terminals")}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                      testConnectionPoint === "terminals"
                        ? "bg-yellow-500 text-slate-900 border-yellow-500"
                        : "bg-slate-950 text-slate-400 border-slate-700 hover:border-yellow-500/50"
                    }`}
                  >
                    Motor Terminals (Direct)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestConnectionPoint("mcc")}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                      testConnectionPoint === "mcc"
                        ? "bg-yellow-500 text-slate-900 border-yellow-500"
                        : "bg-slate-950 text-slate-400 border-slate-700 hover:border-yellow-500/50"
                    }`}
                  >
                    Motor Control Center (MCC) / VFD Output
                  </button>
                </div>
                {testConnectionPoint === "mcc" && (
                  <div className="mt-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2.5 text-xs text-yellow-200/90 leading-snug">
                    ⚠️ Testing through VFD/cables may mask faults. Cable impedance/capacitance
                    compensation will be applied.
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-3">
                <p className="text-[11px] text-slate-500">
                  4-wire bridge precision · IEEE / NETA phase balance
                </p>
                {isDynamic && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    Dynamic Mode: Continuous waveform capture active
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {PHASE_PAIRS.map(({ id, label }) => (
                  <div
                    key={id}
                    className="rounded-xl border border-white/10 bg-slate-950/60 p-3 space-y-2.5"
                  >
                    <p className="text-xs font-bold text-yellow-400 uppercase tracking-wider text-center pb-1 border-b border-white/5">
                      {label}
                    </p>
                    <label className="block min-w-0">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">
                        Resistance (mΩ)
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={phases[id].resistance}
                        onChange={(e) => updatePhase(id, "resistance", e.target.value)}
                        className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:border-yellow-500 transition-all outline-none w-full"
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">
                        Impedance (Z – Ω)
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={phases[id].impedance}
                        onChange={(e) => updatePhase(id, "impedance", e.target.value)}
                        className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:border-yellow-500 transition-all outline-none w-full"
                      />
                    </label>
                    {isDynamic ? (
                      <div className="min-w-0">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block min-w-0">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">
                              Inductance Min (mH)
                            </span>
                            <input
                              type="number"
                              step="any"
                              value={phases[id].inductanceMin}
                              onChange={(e) =>
                                updatePhase(id, "inductanceMin", e.target.value)
                              }
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white focus:border-yellow-500 transition-all outline-none w-full"
                            />
                          </label>
                          <label className="block min-w-0">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">
                              Inductance Max (mH)
                            </span>
                            <input
                              type="number"
                              step="any"
                              value={phases[id].inductanceMax}
                              onChange={(e) =>
                                updatePhase(id, "inductanceMax", e.target.value)
                              }
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white focus:border-yellow-500 transition-all outline-none w-full"
                            />
                          </label>
                        </div>
                        <p className="mt-1.5 text-[10px] text-slate-500 leading-snug">
                          Captures peak-to-peak inductance variance over 360° rotation for rotor
                          bar crack detection.
                        </p>
                      </div>
                    ) : (
                      <label className="block min-w-0">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">
                          Inductance (L – mH)
                        </span>
                        <input
                          type="number"
                          step="any"
                          value={phases[id].inductance}
                          onChange={(e) => updatePhase(id, "inductance", e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:border-yellow-500 transition-all outline-none w-full"
                        />
                      </label>
                    )}
                    <label className="block min-w-0">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">
                        Phase Angle (θ – °)
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={phases[id].phaseAngle}
                        onChange={(e) => updatePhase(id, "phaseAngle", e.target.value)}
                        className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:border-yellow-500 transition-all outline-none w-full"
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">
                        I/F Ratio
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={phases[id].ifRatio}
                        onChange={(e) => updatePhase(id, "ifRatio", e.target.value)}
                        className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:border-yellow-500 transition-all outline-none w-full"
                      />
                    </label>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-2">
                Online Electrical Parameters
              </p>
              <p className={helperCls}>
                Active power quality analysis. Phase-to-phase bridge measurements are unavailable
                while energized.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                <label className="block min-w-0">
                  <span className={fieldLabel}>Voltage Unbalance (%)</span>
                  <input
                    type="number"
                    step="any"
                    value={voltageUnbalance}
                    onChange={(e) => setVoltageUnbalance(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="block min-w-0">
                  <span className={fieldLabel}>Current Unbalance (%)</span>
                  <input
                    type="number"
                    step="any"
                    value={currentUnbalance}
                    onChange={(e) => setCurrentUnbalance(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="block min-w-0">
                  <span className={fieldLabel}>Voltage THD (V-THD %)</span>
                  <input
                    type="number"
                    step="any"
                    value={voltageThd}
                    onChange={(e) => setVoltageThd(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="block min-w-0">
                  <span className={fieldLabel}>Current THD (I-THD %)</span>
                  <input
                    type="number"
                    step="any"
                    value={currentThd}
                    onChange={(e) => setCurrentThd(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="block min-w-0">
                  <span className={fieldLabel}>Power Factor (Cos Φ)</span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    value={powerFactor}
                    onChange={(e) => setPowerFactor(e.target.value)}
                    placeholder="0.85"
                    className={inputCls}
                  />
                </label>
              </div>
            </>
          )}
        </div>
      </AccordionShell>

      {/* SECTION 4 — Insulation */}
      <AccordionShell
        id="insulation"
        title="4. Insulation to Ground"
        open={openSections.includes("insulation")}
        onToggle={toggleSection}
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-3">
            Insulation to Ground (Megger)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block min-w-0">
              <span className={fieldLabel}>Megohms (MΩ) @ Test Voltage</span>
              <input
                type="number"
                step="any"
                value={megohms}
                onChange={(e) => setMegohms(e.target.value)}
                placeholder="2500"
                className={inputCls}
              />
            </label>
            <div className="block min-w-0">
              <span className={fieldLabel}>Capacitance to Ground (Cg)</span>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="any"
                  value={capacitanceCg}
                  onChange={(e) => setCapacitanceCg(e.target.value)}
                  placeholder="0.00"
                  className={inputCls}
                />
                <div className="relative w-24 shrink-0">
                  <select
                    value={capacitanceUnit}
                    onChange={(e) => setCapacitanceUnit(e.target.value as "nF" | "µF")}
                    className={selectCls}
                  >
                    <option value="nF">nF</option>
                    <option value="µF">µF</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </div>
              <p className={helperCls}>
                Early-stage contamination detection (moisture/carbon dust spikes Cg before IR
                drops).
              </p>
            </div>
            <label className="block min-w-0">
              <span className={fieldLabel}>Test Voltage Used</span>
              <div className="relative">
                <select
                  value={testVoltage}
                  onChange={(e) => setTestVoltage(e.target.value)}
                  className={selectCls}
                >
                  {MEGGER_VOLTAGES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                      {isLowVoltageMotor && parseFloat(v) > 500 ? " (caution)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
              {isLowVoltageMotor && !showHighVoltageWarning && (
                <p className={helperCls}>
                  Low-voltage motor (&lt;480V) — recommended max test voltage: 500V
                </p>
              )}
              {showHighVoltageWarning && (
                <p className="mt-1.5 text-[11px] text-red-400 leading-snug font-medium">
                  ⚠️ High voltage may damage low-voltage windings. Recommended max: 500V.
                </p>
              )}
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Dissipation Factor / Power Factor (tan δ)</span>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  value={dissipationFactor}
                  onChange={(e) => setDissipationFactor(e.target.value)}
                  placeholder="0.0"
                  className={`${inputCls} pr-8`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                  %
                </span>
              </div>
              <p className={helperCls}>Evaluates insulation voids in high-voltage motors.</p>
            </label>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-3">
            Groundwall IR timeline (verify before Run)
          </p>
          <p className="text-[11px] text-slate-500 mb-3">
            Auto-extracted IR 15s / 30s / 1m / 10m and report PI / DAR appear here for visual check.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <label className="block min-w-0">
              <span className={fieldLabel}>IR 15s (MΩ)</span>
              <input
                type="number"
                step="any"
                value={ir15s}
                onChange={(e) => setIr15s(e.target.value)}
                placeholder="—"
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>IR 30s (MΩ)</span>
              <input
                type="number"
                step="any"
                value={reading30s}
                onChange={(e) => setReading30s(e.target.value)}
                placeholder="—"
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>IR 1m / 60s (MΩ)</span>
              <input
                type="number"
                step="any"
                value={reading1Min}
                onChange={(e) => {
                  setReading1Min(e.target.value);
                  setReading60s(e.target.value);
                  if (!megohms) setMegohms(e.target.value);
                }}
                placeholder="—"
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>IR 10m (MΩ)</span>
              <input
                type="number"
                step="any"
                value={reading10Min}
                onChange={(e) => setReading10Min(e.target.value)}
                placeholder="—"
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Report PI</span>
              <input
                type="number"
                step="any"
                value={reportPi != null ? String(reportPi) : ""}
                onChange={(e) => {
                  const n = optionalNum(e.target.value);
                  setReportPi(n);
                }}
                placeholder={piRatio ?? "—"}
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Report DAR</span>
              <input
                type="number"
                step="any"
                value={reportDar != null ? String(reportDar) : ""}
                onChange={(e) => {
                  const n = optionalNum(e.target.value);
                  setReportDar(n);
                }}
                placeholder={darRatio ?? "—"}
                className={inputCls}
              />
            </label>
          </div>

          <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-3">
            Dielectric Absorption / Polarization Index
          </p>
          <div className="mb-4">
            <span className={fieldLabel}>Evaluate Via</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setInsulationTestType("PI")}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                  insulationTestType === "PI"
                    ? "bg-yellow-500 text-slate-900 border-yellow-500"
                    : "bg-slate-950 text-slate-400 border-slate-700 hover:border-yellow-500/50"
                }`}
              >
                PI Ratio (10m / 1m)
              </button>
              <button
                type="button"
                onClick={() => setInsulationTestType("DAR")}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                  insulationTestType === "DAR"
                    ? "bg-yellow-500 text-slate-900 border-yellow-500"
                    : "bg-slate-950 text-slate-400 border-slate-700 hover:border-yellow-500/50"
                }`}
              >
                DAR Ratio (60s / 30s)
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="min-h-[56px] rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 inline-flex items-baseline gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Calc PI
              </span>
              <span className="text-xl font-black text-yellow-400 tabular-nums">
                {piRatio ?? "—"}
              </span>
              <span className="text-[11px] text-slate-500">10m ÷ 1m</span>
            </div>
            <div className="min-h-[56px] rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-4 py-3 inline-flex items-baseline gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Calc DAR
              </span>
              <span className="text-xl font-black text-cyan-300 tabular-nums">
                {darRatio ?? "—"}
              </span>
              <span className="text-[11px] text-slate-500">60s ÷ 30s</span>
            </div>
            {(reportPi != null || reportDar != null) && (
              <div className="min-h-[56px] rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 inline-flex flex-wrap items-baseline gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  From report
                </span>
                {reportPi != null && (
                  <span className="text-sm font-bold text-emerald-300 tabular-nums">
                    PI {reportPi}
                  </span>
                )}
                {reportDar != null && (
                  <span className="text-sm font-bold text-emerald-300 tabular-nums">
                    DAR {reportDar}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </AccordionShell>
    </div>
  );
}
