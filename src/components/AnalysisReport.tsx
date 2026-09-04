import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Activity, AlertOctagon, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, AudioWaveform, Calendar, Check,
  CheckCircle2, ChevronDown, ClipboardCheck, Clock, Crosshair, DollarSign, Download, Droplet, Eye,
  FileText, Filter, Gauge, GitBranch, Info, Layers, LineChart, Loader2, Mail, MapPin, MessageSquare, Pause, Play,
  Plus, Search, ShieldCheck, Sliders, Sparkles, Target, Thermometer, Trash2, Upload, User, Wrench, X, Zap
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { getEquipmentData, getFlatEquipment, type EquipComponent } from "../data/equipmentDb";
import { navigateToTab } from "../navigation";
import { useToast } from "./Toast";
import OnboardingEmptyState from "./OnboardingEmptyState";
import {
  fetchAnalysisResults,
  type SavedAnalysisResult
} from "../lib/analysisPersistence";
import { extractVibrationRecordFromAnalysis } from "../lib/vibration/vibrationDiagnosticRecord";
import SpectralFftWorkspace from "./SpectralFftWorkspace";
import PartsInventoryModal, {
  formatUsd, getStockStatus, usePartsInventory, type InventoryPart
} from "./PartsInventory";
import WorkOrderGenerator from "./WorkOrderGenerator";
import { exportReportCsv, exportReportPdf, exportReportXlsx } from "../lib/reportExport";
import MultiTechAssessment from "./reports/MultiTechAssessment";
import SavedReportViewer from "./reports/SavedReportViewer";
import { useQueryParam } from "../lib/useQueryParam";
import { fetchOilSamples } from "../lib/oilSampleRow";
import {
  DEFAULT_ALARM_LIMITS,
  ISO_CLEANLINESS_TARGET,
  type OilSample
} from "../types/oilAnalysis";
import { latestOfType, peakOfType, resolveTempUnit } from "../lib/diagnostics/sensorFusion";

type ReportTab = 0 | 1 | 2 | 3 | 4;
type ReportTechnology = "vibration" | "thermography" | "ultrasound" | "mca" | "oil";

interface AnalysisReportProps {
  selectedCompanyId?: number;
  /** Navigate to Maintenance Calendar when creating work orders from Repair Actions. */
  onNavigateToCalendar?: (assetLabel: string) => void;
  /** Navigate to Root Cause Analysis tab from report. */
  onNavigateToRca?: () => void;
}

const DEFAULT_ASSET_LABEL = "Boiler Feed Pump A - P-101A";

const REPORT_TECH_CARDS: {
  id: ReportTechnology;
  title: string;
  subtitle: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
}[] = [
  {
    id: "vibration",
    title: "Vibration Analysis",
    subtitle: "FFT spectrum, waveform, bearing analysis",
    Icon: Activity,
    iconClass: "bg-yellow-500/15 border-yellow-500/40 text-yellow-400"
  },
  {
    id: "thermography",
    title: "Thermography Analysis",
    subtitle: "Thermal imaging, temperature analysis",
    Icon: Thermometer,
    iconClass: "bg-red-500/15 border-red-500/40 text-red-400"
  },
  {
    id: "ultrasound",
    title: "Ultrasound Analysis",
    subtitle: "Acoustic emissions, leak detection",
    Icon: AudioWaveform,
    iconClass: "bg-sky-500/15 border-sky-500/40 text-sky-400"
  },
  {
    id: "mca",
    title: "Motor Circuit Analysis",
    subtitle: "Winding health, insulation testing",
    Icon: Zap,
    iconClass: "bg-yellow-500/15 border-yellow-500/40 text-yellow-400"
  },
  {
    id: "oil",
    title: "Oil Analysis",
    subtitle: "Wear metals, viscosity, contamination",
    Icon: Droplet,
    iconClass: "bg-cyan-500/15 border-cyan-500/40 text-cyan-400"
  }
];

type ReportAsset = { id: string; name: string; tag: string; location: string };

const HIER_SELECT =
  "w-full min-h-[40px] px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 truncate disabled:opacity-50 focus:outline-none focus:border-amber-400/60";

const sectionTitle = "text-sm font-bold text-white tracking-tight";
const sectionHint = "text-xs text-slate-500 mt-0.5";
const sectionLabel = "text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block";
const selectInputClass =
  "w-full min-h-[38px] rounded-lg bg-slate-950/70 border border-slate-600 px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500 transition-colors";

/** Match an asset label (e.g. "Boiler Feed Pump A - P-101A") to a mock report asset. */
/**
 * Reasons shown on actions that have no backend behind them yet. Each of these
 * buttons stays visible but disabled so the workflow is still legible, rather
 * than reporting a success that never happened.
 */
const PENDING_UPLOAD = "Upload integration pending — no ingestion endpoint is connected";
const PENDING_DETAIL = "Record detail view is not built yet";
const PENDING_COMPARE = "Comparison view is not built yet";
const PENDING_SCHEDULE =
  "Scheduling integration pending — no work-management endpoint is connected";
const PENDING_EMAIL = "Email delivery pending — no report mailing endpoint is connected";

/** Swapped in for hover/cursor classes when an action is disabled. */
const PENDING_BTN = "cursor-not-allowed opacity-50";

/**
 * Marks panels still drawn from the built-in demo dataset. Live, asset-bound
 * figures are in the Multi-Technology Assessment at the top of this page; this
 * banner keeps the two from being mistaken for each other.
 */
function sampleDataBadge() {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
      <p className="text-[11px] leading-relaxed text-amber-200/90">
        <span className="font-bold">Sample data — not from this asset.</span> These
        panels illustrate the workflow with a built-in demo dataset. Measured values
        for the selected asset appear in the Multi-Technology Assessment above.
      </p>
    </div>
  );
}

function matchReportAssetFromLabel(label: string): ReportAsset | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const exactCombo = MOCK_ASSETS.find((a) => `${a.name} - ${a.tag}` === trimmed);
  if (exactCombo) return exactCombo;
  const parts = trimmed.split(" - ");
  const maybeTag = parts.length >= 2 ? parts[parts.length - 1].trim() : trimmed;
  const byTag = MOCK_ASSETS.find((a) => a.tag.toLowerCase() === maybeTag.toLowerCase());
  if (byTag) return byTag;
  const namePart = parts.length >= 2 ? parts.slice(0, -1).join(" - ").trim() : trimmed;
  return MOCK_ASSETS.find((a) => a.name.toLowerCase() === namePart.toLowerCase()) ?? null;
}

function resolveReportAsset(tag: string): ReportAsset | null {
  return MOCK_ASSETS.find((a) => a.tag === tag) ?? null;
}

// ===== Stub declarations for dead sub-components (previously removed mock data) =====
const MOCK_ASSETS = [
  { id: "p-101a", name: "Boiler Feed Pump A", tag: "P-101A", location: "Powerhouse — Floor 1" },
  { id: "p-101b", name: "Boiler Feed Pump B", tag: "P-101B", location: "Powerhouse — Floor 1" },
  { id: "m-101a", name: "Drive Motor M-101A", tag: "M-101A", location: "Powerhouse — Floor 1" },
  { id: "m-210", name: "Primary Induction Motor", tag: "M-210", location: "Drive Hall" },
  { id: "fn-04", name: "Cooling Tower Fan 4", tag: "FN-04", location: "Roof Deck" },
  { id: "cmp-37", name: "Screw Compressor RS37i", tag: "CMP-37", location: "Utility Pad" },
  { id: "gb-302", name: "Extruder Gearbox GB-302", tag: "GB-302", location: "Polymer Line 3" },
  { id: "p-402", name: "Slurry Recirc Pump P-402", tag: "P-402", location: "Chemical Unit 4" },
  { id: "cv-gb3", name: "Conveyor Gearbox 3", tag: "CV-GB-3", location: "Conveyor Gallery" },
  { id: "sub-2", name: "Substation 2 Bus", tag: "SUB-2", location: "Electrical Yard" },
  { id: "hx-12", name: "Heat Exchanger Bundle 12", tag: "HX-12", location: "Process Area B" }
] as const;

type PointGroup = "drive" | "nondrive" | "axial";

interface SpectrumPeak { freq: number; amp: number; width?: number; }
interface SpectrumRecord { id: number; date: string; time: string; point: string; pointGroup: PointGroup; overall: number; dominant: string; peaks: SpectrumPeak[]; }
interface AnalysedPeak { hz: number; order: number; amplitude: number; share: number; code: string; fault: string; severity: FaultSeverity; }
interface BearingModel { id: string; label: string; ftf: number; bpfo: number; bpfi: number; bsf: number; }
interface BearingFrequency { key: "FTF" | "BSF" | "BPFO" | "BPFI"; name: string; order: number; hz: number; }

const BEARINGS: BearingModel[] = [];
function bearingFrequencies(_bearing: BearingModel, _rpm: number): BearingFrequency[] { return []; }
function analysePeaks(_record: SpectrumRecord, _rpm: number, _bearing: BearingModel): AnalysedPeak[] { return []; }

function formatSpectrumDate(iso: string) { return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function overallBadgeStyle(overall: number) { if (overall >= 2.8) return "bg-red-500/15 text-red-400 border-red-500/30"; if (overall >= 2.2) return "bg-yellow-400/15 text-yellow-400 border-yellow-400/30"; return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"; }

const ISO_SCALE_MAX = 0.43;
const ISO_READING = 0.08;
const ISO_ZONES = [
  { label: "Nominal", zone: "A", from: 0, to: 0.08, bar: "bg-emerald-500", text: "text-emerald-400", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25", criteria: "" },
  { label: "Warning", zone: "B/C", from: 0.08, to: 0.28, bar: "bg-yellow-400", text: "text-yellow-400", badge: "bg-yellow-400/10 text-yellow-400 border-yellow-400/25", criteria: "" },
  { label: "Danger", zone: "D", from: 0.28, to: ISO_SCALE_MAX, bar: "bg-red-500", text: "text-red-400", badge: "bg-red-500/10 text-red-400 border-red-500/25", criteria: "" }
];
const ISO_LIMIT_LINES = [
  { label: "Warning", mms: 2.032, stroke: "#facc15" },
  { label: "Danger", mms: 7.112, stroke: "#ef4444" }
];

const TREND_DATA: { date: string; value: number }[] = [];
const TREND_MAX = 3;
const REPORT_SUMMARY = { assetName: "", tagId: "", inspectionDate: "", topFaultCode: "", assessment: "" };
const FAULT_MATRIX: { name: string; code: string; probability: number; severity: FaultSeverity }[] = [];
const ACQUISITION = { analyst: "", measuredAt: "", analysedAt: "", route: "", loadPercent: 0, bearingTemp: "", aiConfidence: 0 };
const DEFAULT_DATE_FILTER = "all";
const DEMO_SPECTRA_SEED: SpectrumRecord[] = [];
const DATE_FILTERS: { id: string; label: string; days: number | null }[] = [];
const POINT_FILTERS: { id: PointGroup | "all"; label: string }[] = [];
const LIBRARY_TODAY = new Date();

const THERMAL_LIBRARY_IMAGES: { id: string; asset: string; location: string; date: string; maxTemp: number; deltaT: number; severity: string; gradient: string; hotspotPos?: string; hasIsotherm: boolean; }[] = [];
const THERMAL_FAULT_HISTORY: { date: string; description: string; tone: "red" | "yellow" | "green"; }[] = [];

const AI_RECOMMENDATIONS: { id: number; text: string; priority: string; rationale: string; }[] = [];
const PRIORITY_STYLES: Record<string, string> = {
  High: "bg-red-500/10 text-red-400 border-red-500/25",
  Medium: "bg-yellow-400/10 text-yellow-400 border-yellow-400/25",
  Low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
};

const US_WAVEFORM_DATA: { ms: number; amp: number; }[] = [];
const US_SPECTRUM_DATA: { khz: number; db: number; }[] = [];
const US_TREND_DATA: { month: string; db: number; }[] = [];
const US_LIBRARY_RECORDINGS: { id: string; asset: string; location: string; peakDb: number; classification: string; faultKey: string; date: string; duration: string; }[] = [];
const US_AUDIO_WAVE_DATA: { t: number; amp: number; }[] = [];
const US_SPECTROGRAM_BARS: number[] = [];

const MCA_PHASE_RESISTANCE: { phase: string; value: number; fill: string; }[] = [];
const MCA_PHASE_ANGLE: { phase: string; value: number; fill: string; }[] = [];
const MCA_PI_TREND: { date: string; pi: number; }[] = [];
const MCA_ACTION_PLAN: string[] = [];
const MCA_LIBRARY_TESTS: { id: string; date: string; dateMs: number; motorId: string; location: string; testType: string; methodCategory: McaMethodCategory; insulationGohm: number; phaseBalancePct: number; pi: number; status: string; }[] = [];
const MCA_MULTI_TREND: { date: string; ir40: number | null; imbalance: number | null; pi: number | null; fi: number | null; projection: number | null; }[] = [];
const MCA_PHASE_HISTORY: { date: string; a: number; b: number; c: number; }[] = [];

function SpectrumTrace(_props: { record: SpectrumRecord; className?: string }) { return null; }
function SpectrumMetrics(_props: { record: SpectrumRecord }) { return null; }

const TABS: { id: ReportTab; label: string }[] = [
  { id: 1, label: "1. Analysis Results" },
  { id: 2, label: "2. Spectrum Library" },
  { id: 3, label: "3. Repair & Actions" },
  { id: 4, label: "4. Multi-Tech Overview" }
];

const THERMOGRAPHY_TABS: { id: ReportTab; label: string }[] = [
  { id: 1, label: "1. Analysis Results" },
  { id: 2, label: "2. Data Library" },
  { id: 3, label: "3. Repair Actions" },
  { id: 4, label: "4. Multi-Tech Overview" }
];

const ULTRASOUND_TABS: { id: ReportTab; label: string }[] = [
  { id: 1, label: "1. Analysis Results" },
  { id: 2, label: "2. Data Library" },
  { id: 3, label: "3. Repair Actions" },
  { id: 4, label: "4. Multi-Tech Overview" }
];

const MCA_TABS: { id: ReportTab; label: string }[] = [
  { id: 1, label: "1. Analysis Results" },
  { id: 2, label: "2. Data Library" },
  { id: 3, label: "3. Repair Actions" },
  { id: 4, label: "4. Multi-Tech Overview" }
];

const OIL_TABS: { id: ReportTab; label: string }[] = [
  { id: 1, label: "1. Lab Results" },
  { id: 2, label: "2. Sample Library" },
  { id: 3, label: "3. Repair Actions" },
  { id: 4, label: "4. Multi-Tech Overview" }
];

/** Spectrometry groups — wear / contaminants / additives (ppm). */
const OIL_SPECTROMETRY = {
  wear: [
    { metal: "Fe", name: "Iron", ppm: 120, fill: "#eab308" },
    { metal: "Cu", name: "Copper", ppm: 45, fill: "#22d3ee" },
    { metal: "Cr", name: "Chromium", ppm: 8, fill: "#94a3b8" },
    { metal: "Pb", name: "Lead", ppm: 3, fill: "#94a3b8" },
    { metal: "Sn", name: "Tin", ppm: 2, fill: "#94a3b8" }
  ],
  contaminants: [
    { metal: "Si", name: "Silicon/Dirt", ppm: 48, fill: "#eab308" },
    { metal: "Na", name: "Sodium", ppm: 12, fill: "#94a3b8" }
  ],
  additives: [
    { metal: "P", name: "Phosphorus", ppm: 410, fill: "#34d399" },
    { metal: "Zn", name: "Zinc", ppm: 15, fill: "#22d3ee" },
    { metal: "S", name: "Sulfur (EP Additives)", ppm: 1250, fill: "#eab308" }
  ]
} as const;

type OilSpectrometryTab = keyof typeof OIL_SPECTROMETRY;

/** Action Level 17/15/12 · Target Baseline 15/13/10 */
const OIL_ISO_ACTION_LEVEL = "17/15/12";
const OIL_ISO_TARGET_BASELINE = "15/13/10";

const OIL_ACTION_PLAN = [
  `Perform offline kidney-loop filtration to reduce ISO code below Action Level ${OIL_ISO_ACTION_LEVEL} toward Target Baseline ${OIL_ISO_TARGET_BASELINE}.`,
  "Investigate water ingress source (check breathers, seals, or heat exchanger).",
  "Schedule oil change if TAN exceeds 2.0 mg KOH/g.",
  "Increase vibration analysis frequency to monitor gear mesh frequencies."
];

type OilAlertStatus = "NORMAL" | "WARNING" | "CRITICAL";

const MCA_PHASE_INDUCTANCE = [
  { phase: "Phase A", value: 12.5, fill: "#22d3ee" },
  { phase: "Phase B", value: 12.6, fill: "#94a3b8" },
  { phase: "Phase C", value: 12.8, fill: "#eab308" }
];

const MCA_PHASE_IMPEDANCE = [
  { phase: "Phase A", value: 14.2, fill: "#22d3ee" },
  { phase: "Phase B", value: 14.3, fill: "#94a3b8" },
  { phase: "Phase C", value: 14.5, fill: "#eab308" }
];

type McaTestStatus = "PASS" | "WARNING" | "FAIL";
type McaTestKind =
  | "Full MCA Test"
  | "Insulation Resistance"
  | "Phase Balance"
  | "Polarization Index"
  | "Rotor Bar Test";
type McaMethodCategory = "de_energized_mca" | "energized_esa" | "offline_surge";

function mcaMethodBadge(category: McaMethodCategory) {
  if (category === "energized_esa") {
    return {
      label: "Energized ESA",
      className:
        "inline-block px-2 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 border border-green-500/30"
    };
  }
  if (category === "offline_surge") {
    return {
      label: "Offline Surge / Hi-Pot",
      className:
        "inline-block px-2 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/30"
    };
  }
  return {
    label: "De-energized MCA",
    className:
      "inline-block px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/30"
  };
}

type UsClass = "LEAK" | "NORMAL" | "BEARING" | "ARCING" | "STEAM";

type ThermalSeverity = "CRITICAL" | "WARNING" | "NORMAL";

// Shaft speed anchors every order calculation: 1X, its harmonics, and bearing defect tones.
const SHAFT_RPM = 3550;
const ONE_X_HZ = SHAFT_RPM / 60;
// Top of the acquired analysis band.
const SPECTRUM_FMAX = 500;
const IN_S_TO_MM_S = 25.4;

// ISO 10816-3 Group 2 velocity thresholds (mm/s RMS) — Medium machines 15–300 kW, rigid foundation.
const ISO_10816_ZONES_MM = [
  { zone: "A", label: "Good", from: 0, to: 2.3, bg: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500/30", bgLight: "bg-emerald-500/10" },
  { zone: "B", label: "Acceptable", from: 2.3, to: 4.5, bg: "bg-sky-500", text: "text-sky-400", border: "border-sky-500/30", bgLight: "bg-sky-500/10" },
  { zone: "C", label: "Unsatisfactory", from: 4.5, to: 7.1, bg: "bg-amber-500", text: "text-amber-400", border: "border-amber-500/30", bgLight: "bg-amber-500/10" },
  { zone: "D", label: "Unacceptable", from: 7.1, to: 12, bg: "bg-red-500", text: "text-red-400", border: "border-red-500/30", bgLight: "bg-red-500/10" },
] as const;

function resolveIso10816Zone(
  vibrationRms: number | null | undefined,
  healthScore: number | null | undefined,
): { zone: string; label: string; rmsMmS: number | null; source: "vibration_rms" | "health_score" | "none" } {
  if (vibrationRms != null && Number.isFinite(vibrationRms) && vibrationRms >= 0) {
    const match = ISO_10816_ZONES_MM.find((z) => vibrationRms < z.to) ?? ISO_10816_ZONES_MM[3];
    return { zone: match.zone, label: match.label, rmsMmS: vibrationRms, source: "vibration_rms" };
  }
  if (healthScore != null && Number.isFinite(healthScore)) {
    if (healthScore >= 85) return { zone: "A", label: "Good", rmsMmS: null, source: "health_score" };
    if (healthScore >= 70) return { zone: "B", label: "Acceptable", rmsMmS: null, source: "health_score" };
    if (healthScore >= 50) return { zone: "C", label: "Unsatisfactory", rmsMmS: null, source: "health_score" };
    return { zone: "D", label: "Unacceptable", rmsMmS: null, source: "health_score" };
  }
  return { zone: "—", label: "No stored RMS/Health metric available", rmsMmS: null, source: "none" };
}

type FaultSeverity = "Low" | "Medium" | "High";

const SEVERITY_STYLES: Record<FaultSeverity, string> = {
  Low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  Medium: "bg-yellow-400/10 text-yellow-400 border-yellow-400/25",
  High: "bg-red-500/10 text-red-400 border-red-500/25"
};

type SpectrumDomain = "fft" | "psd" | "waveform";

type RecommendationPriority = "HIGH" | "MEDIUM" | "LOW";

const SPECTRUM_DOMAINS: { id: SpectrumDomain; label: string }[] = [
  { id: "fft", label: "FFT Velocity" },
  { id: "psd", label: "Power Density" },
  { id: "waveform", label: "Time Waveform" }
];

const FREQ_RANGES: { id: string; label: string; lo: number; hi: number }[] = [
  { id: "full", label: `Full 0–${SPECTRUM_FMAX} Hz`, lo: 0, hi: SPECTRUM_FMAX },
  { id: "low", label: "Low 0–100 Hz", lo: 0, hi: 100 },
  { id: "mid", label: "Mid 0–250 Hz", lo: 0, hi: 250 },
  { id: "high", label: `High 250–${SPECTRUM_FMAX} Hz`, lo: 250, hi: SPECTRUM_FMAX }
];

const TRACE_SAMPLES = 320;
const PSD_BIN_HZ = SPECTRUM_FMAX / TRACE_SAMPLES;
const PEAK_WIDTH_HZ = 3.2;
const WAVEFORM_REVOLUTIONS = 4;

interface SpectrumAnalysisChartProps {
  record: SpectrumRecord;
  peaks: AnalysedPeak[];
  rpm: number;
  domain: SpectrumDomain;
  range: { lo: number; hi: number };
  cursorHz: number | null;
  onCursorChange: (hz: number) => void;
  showHarmonics: boolean;
  showSidebands: boolean;
  bearingMarkers: BearingFrequency[] | null;
  showIsoLimits: boolean;
}

/** Mock cascade slices for the Variable Speed Waterfall view (frequency × amplitude × time). */
const WATERFALL_SERIES = ["T-10min", "T-20min", "T-30min", "T-40min", "T-50min", "T-60min"] as const;
const WATERFALL_COLORS = ["#1e3a5f", "#1d4ed8", "#0891b2", "#22d3ee", "#facc15", "#fbbf24"];
const WATERFALL_DATA = Array.from({ length: 48 }, (_, i) => {
  const hz = (i / 47) * SPECTRUM_FMAX;
  const fund = Math.exp(-((hz - 59.2) ** 2) / 90);
  const second = Math.exp(-((hz - 118.4) ** 2) / 120);
  const third = Math.exp(-((hz - 177.6) ** 2) / 160);
  const base = fund * 1.8 + second * 0.7 + third * 0.35 + 0.08;
  return {
    hz: Math.round(hz),
    "T-10min": Number((base * 0.55).toFixed(3)),
    "T-20min": Number((base * 0.7).toFixed(3)),
    "T-30min": Number((base * 0.85).toFixed(3)),
    "T-40min": Number((base * 1.0).toFixed(3)),
    "T-50min": Number((base * 1.15 + fund * 0.2).toFixed(3)),
    "T-60min": Number((base * 1.35 + fund * 0.35).toFixed(3))
  };
});

/**
 * Analyst-grade view of a single spectrum: labelled axes in engineering units, a placeable
 * frequency cursor with harmonic markers, bearing tone markers and ISO alarm lines.
 */
function SpectrumAnalysisChart({
  record,
  peaks,
  rpm,
  domain,
  range,
  cursorHz,
  onCursorChange,
  showHarmonics,
  showSidebands,
  bearingMarkers,
  showIsoLimits
}: SpectrumAnalysisChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const geo = { width: 760, height: 280, left: 60, right: 742, top: 18, bottom: 224 };
  const oneX = rpm / 60;
  const isWaveform = domain === "waveform";

  const trace = useMemo(() => {
    if (isWaveform) {
      const duration = WAVEFORM_REVOLUTIONS / oneX;
      return Array.from({ length: 360 }, (_, i) => {
        const seconds = (i / 359) * duration;
        // Sum the resolved components back into the time domain; RMS amplitudes become peak
        // amplitudes through the sqrt(2) crest factor of a sinusoid.
        const y = peaks.reduce(
          (sum, peak, index) =>
            sum + peak.amplitude * Math.SQRT2 * Math.sin(2 * Math.PI * peak.hz * seconds + index * 0.9),
          0
        );
        return { x: seconds * 1000, y };
      });
    }

    return Array.from({ length: TRACE_SAMPLES }, (_, i) => {
      const hz = range.lo + (i / (TRACE_SAMPLES - 1)) * (range.hi - range.lo);
      const resolved = peaks.reduce(
        (sum, peak) => sum + peak.amplitude * Math.exp(-((hz - peak.hz) ** 2) / (2 * PEAK_WIDTH_HZ ** 2)),
        0
      );
      // Deterministic noise floor, seeded from the record so the trace never moves between renders.
      const noise = Math.abs(Math.sin((i + 1) * (record.id + 1) * 12.9898) * 43758.5453) % 1;
      const y = resolved + record.overall * (0.01 + noise * 0.018);
      return { x: hz, y: domain === "psd" ? (y * y) / PSD_BIN_HZ : y };
    });
  }, [domain, isWaveform, oneX, peaks, range.hi, range.lo, record.id, record.overall]);

  const xMin = isWaveform ? 0 : range.lo;
  const xMax = isWaveform ? trace[trace.length - 1].x : range.hi;
  const traceMax = trace.reduce((max, point) => Math.max(max, Math.abs(point.y)), 0);
  const isoCeiling = showIsoLimits && domain === "fft" ? ISO_LIMIT_LINES[1].mms : 0;
  const yMax = Math.max(traceMax * 1.15, isoCeiling * 1.05, 0.1);
  const yMin = isWaveform ? -yMax : 0;

  const toX = (value: number) => geo.left + ((value - xMin) / (xMax - xMin)) * (geo.right - geo.left);
  const toY = (value: number) => geo.bottom - ((value - yMin) / (yMax - yMin)) * (geo.bottom - geo.top);

  const linePath = trace
    .map((point, i) => `${i === 0 ? "M" : "L"} ${toX(point.x).toFixed(1)} ${toY(point.y).toFixed(1)}`)
    .join(" ");
  const areaPath = isWaveform
    ? null
    : `${linePath} L ${toX(xMax).toFixed(1)} ${geo.bottom} L ${geo.left} ${geo.bottom} Z`;

  const xTicks = Array.from({ length: 6 }, (_, i) => xMin + (i / 5) * (xMax - xMin));
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (i / 4) * (yMax - yMin));

  const unit = domain === "psd" ? "(mm/s)²/Hz" : "mm/s";
  const decimals = domain === "psd" ? 3 : 2;

  const harmonicLines =
    showHarmonics && !isWaveform && cursorHz
      ? Array.from({ length: 8 }, (_, i) => ({ order: i + 1, hz: cursorHz * (i + 1) }))
          .filter(line => line.order > 1 && line.hz >= xMin && line.hz <= xMax)
      : [];

  const sidebandLines =
    showSidebands && !isWaveform && cursorHz
      ? [
          { key: "-1X", hz: cursorHz - oneX },
          { key: "+1X", hz: cursorHz + oneX }
        ].filter(line => line.hz >= xMin && line.hz <= xMax)
      : [];

  const bearingLines =
    bearingMarkers && !isWaveform
      ? bearingMarkers.filter(marker => marker.hz >= xMin && marker.hz <= xMax)
      : [];

  const handlePlaceCursor = (event: React.MouseEvent<SVGSVGElement>) => {
    if (isWaveform || !svgRef.current) return;
    // The SVG scales through its viewBox, so map client pixels back into viewBox units.
    const bounds = svgRef.current.getBoundingClientRect();
    const viewBoxX = ((event.clientX - bounds.left) / bounds.width) * geo.width;
    const ratio = (viewBoxX - geo.left) / (geo.right - geo.left);
    const hz = range.lo + Math.min(Math.max(ratio, 0), 1) * (range.hi - range.lo);
    onCursorChange(Number(hz.toFixed(1)));
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${geo.width} ${geo.height}`}
      onClick={handlePlaceCursor}
      className={`w-full h-64 ${isWaveform ? "" : "cursor-crosshair"}`}
      role="img"
      aria-label={`${domain === "waveform" ? "Time waveform" : "Frequency spectrum"} for ${record.point}`}
    >
      <defs>
        <linearGradient id="analysisFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#facc15" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Amplitude gridlines and ticks */}
      {yTicks.map(tick => (
        <g key={`y-${tick}`}>
          <line
            x1={geo.left}
            y1={toY(tick)}
            x2={geo.right}
            y2={toY(tick)}
            stroke="#1e293b"
            strokeWidth="1"
            strokeDasharray={tick === yMin ? undefined : "4 4"}
          />
          <text x={geo.left - 8} y={toY(tick) + 4} textAnchor="end" fill="#64748b" fontSize="10" fontFamily="monospace">
            {tick.toFixed(decimals)}
          </text>
        </g>
      ))}

      {/* Frequency (or time) ticks */}
      {xTicks.map(tick => (
        <text
          key={`x-${tick}`}
          x={toX(tick)}
          y={geo.bottom + 18}
          textAnchor="middle"
          fill="#64748b"
          fontSize="10"
          fontFamily="monospace"
        >
          {isWaveform ? tick.toFixed(1) : Math.round(tick)}
        </text>
      ))}
      <text x={geo.right} y={geo.bottom + 34} textAnchor="end" fill="#94a3b8" fontSize="10" fontWeight="bold">
        {isWaveform ? "milliseconds" : "Hz"}
      </text>
      <text
        x="14"
        y={(geo.top + geo.bottom) / 2}
        fill="#94a3b8"
        fontSize="10"
        fontWeight="bold"
        textAnchor="middle"
        transform={`rotate(-90 14 ${(geo.top + geo.bottom) / 2})`}
      >
        {unit}
      </text>

      {/* ISO overall-velocity alarm lines */}
      {showIsoLimits && domain === "fft" && ISO_LIMIT_LINES.map(limit => (
        <g key={limit.label}>
          <line
            x1={geo.left}
            y1={toY(limit.mms)}
            x2={geo.right}
            y2={toY(limit.mms)}
            stroke={limit.stroke}
            strokeWidth="1.5"
            strokeDasharray="6 4"
            opacity="0.85"
          />
          <text x={geo.left + 6} y={toY(limit.mms) - 5} fill={limit.stroke} fontSize="10" fontWeight="bold">
            ISO {limit.label} {limit.mms.toFixed(1)} mm/s
          </text>
        </g>
      ))}

      {/* Bearing defect tone markers */}
      {bearingLines.map(marker => (
        <g key={marker.key}>
          <line
            x1={toX(marker.hz)}
            y1={geo.top}
            x2={toX(marker.hz)}
            y2={geo.bottom}
            stroke="#f472b6"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.8"
          />
          <text x={toX(marker.hz) + 3} y={geo.top + 10} fill="#f472b6" fontSize="9" fontFamily="monospace">
            {marker.key}
          </text>
        </g>
      ))}

      {/* Harmonic markers projected from the cursor */}
      {harmonicLines.map(line => (
        <g key={line.order}>
          <line
            x1={toX(line.hz)}
            y1={geo.top}
            x2={toX(line.hz)}
            y2={geo.bottom}
            stroke="#22d3ee"
            strokeWidth="1"
            strokeDasharray="2 4"
            opacity="0.7"
          />
          <text x={toX(line.hz) + 3} y={geo.top + 22} fill="#22d3ee" fontSize="9" fontFamily="monospace">
            {line.order}X
          </text>
        </g>
      ))}

      {/* Sideband cursors at cursor ± 1X running speed */}
      {sidebandLines.map(line => (
        <g key={line.key}>
          <line
            x1={toX(line.hz)}
            y1={geo.top}
            x2={toX(line.hz)}
            y2={geo.bottom}
            stroke="#22d3ee"
            strokeWidth="1.5"
            strokeDasharray="5 3"
            opacity="0.9"
          />
          <text x={toX(line.hz) + 3} y={geo.top + 34} fill="#22d3ee" fontSize="9" fontFamily="monospace" fontWeight="bold">
            {line.key}
          </text>
        </g>
      ))}

      {areaPath && <path d={areaPath} fill="url(#analysisFill)" />}
      <path d={linePath} fill="none" stroke="#facc15" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />

      {/* Placed frequency cursor */}
      {!isWaveform && cursorHz !== null && cursorHz >= xMin && cursorHz <= xMax && (
        <g>
          <line
            x1={toX(cursorHz)}
            y1={geo.top}
            x2={toX(cursorHz)}
            y2={geo.bottom}
            stroke="#ffffff"
            strokeWidth="1.5"
          />
          <rect x={toX(cursorHz) - 34} y={geo.top - 2} width="68" height="16" rx="3" fill="#ffffff" />
          <text
            x={toX(cursorHz)}
            y={geo.top + 10}
            textAnchor="middle"
            fill="#020617"
            fontSize="9"
            fontWeight="bold"
            fontFamily="monospace"
          >
            {cursorHz.toFixed(1)} Hz
          </text>
        </g>
      )}

      {/* Baseline */}
      <line x1={geo.left} y1={geo.bottom} x2={geo.right} y2={geo.bottom} stroke="#334155" strokeWidth="1" />
    </svg>
  );
}

function PeakTable({
  peaks,
  oneX,
  cursorHz,
  onSelect,
  limit = 6
}: {
  peaks: AnalysedPeak[];
  oneX: number;
  cursorHz?: number | null;
  onSelect?: (hz: number) => void;
  limit?: number;
}) {
  if (peaks.length === 0) {
    return <p className="text-[11px] text-slate-500">No resolved peaks for this measurement.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[520px]">
        <thead>
          <tr className="border-b border-slate-800 text-[9px] text-slate-500 uppercase font-mono tracking-wider">
            <th className="py-2 pr-3 font-bold">Order</th>
            <th className="py-2 px-3 font-bold">Frequency</th>
            <th className="py-2 px-3 font-bold">Amplitude</th>
            <th className="py-2 px-3 font-bold">Attribution</th>
            <th className="py-2 pl-3 font-bold text-right">Severity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {peaks.slice(0, limit).map(peak => {
            const isCursor = cursorHz !== null && cursorHz !== undefined && Math.abs(peak.hz - cursorHz) <= 1.5;
            return (
              <tr
                key={peak.hz}
                onClick={() => onSelect?.(Number(peak.hz.toFixed(1)))}
                className={`transition-colors ${onSelect ? "cursor-pointer" : ""} ${
                  isCursor ? "bg-yellow-400/5" : "hover:bg-slate-900/40"
                }`}
              >
                <td className="py-2.5 pr-3">
                  <span className="text-xs font-bold text-yellow-400 font-mono">{peak.code}</span>
                  <span className="text-[10px] text-slate-500 font-mono block">
                    {peak.order.toFixed(2)}&times; RPM
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <span className="text-xs font-semibold text-slate-200 font-mono block">
                    {peak.hz.toFixed(1)} Hz
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {Math.round(peak.hz * 60).toLocaleString()} CPM
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <span className="text-xs font-semibold text-slate-200 font-mono block">
                    {peak.amplitude.toFixed(3)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {Math.round(peak.share * 100)}% of overall
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <span className="text-[11px] text-slate-300">{peak.fault}</span>
                </td>
                <td className="py-2.5 pl-3 text-right">
                  <span
                    className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${SEVERITY_STYLES[peak.severity]}`}
                  >
                    {peak.severity}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-500 font-mono pt-2">
        Orders referenced to {Math.round(oneX * 60).toLocaleString()} RPM (1X = {oneX.toFixed(1)} Hz).
      </p>
    </div>
  );
}

function ToolToggle({
  active,
  onClick,
  icon: Icon,
  label
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
        active
          ? "bg-yellow-400/10 border-yellow-400/40 text-yellow-400"
          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
      }`}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
    </button>
  );
}

// ===== Repair & Actions data =====

const DAYS_SINCE_SERVICE = 47;
export const ESTIMATED_LABOR_HOURS = 4;

const REPAIR_STEPS = [
  {
    id: 1,
    title: "Establish Lock-out/Tag-out (LOTO) protocols",
    description: "Isolate the drive, discharge stored energy, and apply personal locks before any contact with rotating elements."
  },
  {
    id: 2,
    title: "Check bearing alignment and clean structural feet",
    description: "Dial-indicate the coupling, then remove scale and paint from all mounting feet to guarantee metal-to-metal seating."
  },
  {
    id: 3,
    title: "Tighten foundation anchor fasteners to nominal torque",
    description: "Torque anchors in a diagonal sequence to the manufacturer specification and record final values."
  },
  {
    id: 4,
    title: "Re-energize unit and verify vibration levels",
    description: "Restart under normal load and confirm overall velocity has returned inside ISO 10816 Zone A."
  }
];

/** Report parts reference inventory records by id so pricing always comes from the database. */
export interface ReportPart {
  partId: number;
  quantity: number;
}

const INITIAL_REPORT_PARTS: ReportPart[] = [
  { partId: 1, quantity: 1 },
  { partId: 2, quantity: 1 },
  { partId: 3, quantity: 4 }
];

interface RepairActionsPanelProps {
  inventory: InventoryPart[];
  reportParts: ReportPart[];
  onOpenInventory: () => void;
  onCreateWorkOrder: () => void;
  onChangeQuantity: (partId: number, quantity: number) => void;
  onRemovePart: (partId: number) => void;
  /** Owned by AnalysisReport, which holds the navigation callback. */
  onInitiateRca: () => void;
  onExportPdf: () => void;
  onExportCsv: () => void;
  /** False until an analysis record is loaded, since exports read from it. */
  canExport: boolean;
}

function RepairActionsPanel({
  inventory,
  reportParts,
  onOpenInventory,
  onCreateWorkOrder,
  onChangeQuantity,
  onRemovePart,
  onInitiateRca,
  onExportPdf,
  onExportCsv,
  canExport
}: RepairActionsPanelProps) {
  const { toast } = useToast();
  // Seeded to match the reference progress counts (2 of 4 steps, 1 of 3 recommendations).
  const [completedSteps, setCompletedSteps] = useState<number[]>([1, 2]);
  const [addressedRecs, setAddressedRecs] = useState<number[]>([3]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [noteEditorId, setNoteEditorId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const stepsComplete = completedSteps.length;
  const allStepsComplete = stepsComplete === REPAIR_STEPS.length;
  const stepPercent = (stepsComplete / REPAIR_STEPS.length) * 100;

  // Join the report's part references against the inventory so descriptions and
  // pricing stay authoritative even after an inventory record is edited.
  const partLines = useMemo(
    () =>
      reportParts
        .map(line => {
          const part = inventory.find(p => p.id === line.partId);
          return part ? { ...line, part } : null;
        })
        .filter((line): line is { partId: number; quantity: number; part: InventoryPart } => line !== null),
    [reportParts, inventory]
  );

  const partsTotal = partLines.reduce((sum, line) => sum + line.quantity * line.part.unitPrice, 0);

  const availability = useMemo(() => {
    if (partLines.length === 0) {
      return { value: "No Parts Listed", tone: "text-slate-400", icon: Layers };
    }
    if (partLines.some(line => line.part.quantityInStock <= 0)) {
      return { value: "Backordered", tone: "text-red-400", icon: AlertTriangle };
    }
    if (partLines.some(line => line.part.quantityInStock < line.quantity)) {
      return { value: "Partial Stock", tone: "text-yellow-400", icon: AlertTriangle };
    }
    return { value: "In Stock", tone: "text-emerald-400", icon: CheckCircle2 };
  }, [partLines]);

  const quickStats = [
    { label: "Days Since Last Service", value: String(DAYS_SINCE_SERVICE), icon: Clock, tone: "text-yellow-400" },
    { label: "Estimated Repair Time", value: `${ESTIMATED_LABOR_HOURS} hours`, icon: Wrench, tone: "text-slate-200" },
    { label: "Parts Availability", value: availability.value, icon: availability.icon, tone: availability.tone }
  ];

  const toggleStep = (id: number) => {
    setCompletedSteps(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const toggleRec = (id: number) => {
    setAddressedRecs(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const openNoteEditor = (id: number) => {
    setNoteEditorId(id);
    setNoteDraft(notes[id] ?? "");
  };

  const saveNote = (id: number) => {
    const trimmed = noteDraft.trim();
    setNotes(prev => {
      const next = { ...prev };
      if (trimmed) next[id] = trimmed;
      else delete next[id];
      return next;
    });
    setNoteEditorId(null);
    setNoteDraft("");
  };

  return (
    <div className="space-y-5">

      {/* ===== 5. Quick Stats Row ===== */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {quickStats.map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
              <span className="h-9 w-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                <Icon className={`h-4 w-4 ${stat.tone}`} />
              </span>
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block truncate">
                  {stat.label}
                </span>
                <span className={`text-sm font-bold block ${stat.tone}`}>{stat.value}</span>
              </div>
            </div>
          );
        })}
      </section>

      {/* ===== Two-column: Checklist (left) + Parts (right) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ===== 1. Step-by-Step Repair Checklist ===== */}
        <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
              <ClipboardCheck className="h-4 w-4 text-yellow-400" />
              <span>Repair Procedure</span>
            </h4>
            <span className="text-[10px] font-bold text-slate-400 font-mono">
              {stepsComplete} of {REPAIR_STEPS.length} steps completed
            </span>
          </div>

          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-yellow-400 rounded-full transition-all duration-300"
              style={{ width: `${stepPercent}%` }}
            />
          </div>

          <ol className="space-y-2 flex-1">
            {REPAIR_STEPS.map((step, index) => {
              const isDone = completedSteps.includes(step.id);
              return (
                <li key={step.id}>
                  <label
                    className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      isDone
                        ? "bg-emerald-500/5 border-emerald-500/25"
                        : "bg-slate-900/50 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => toggleStep(step.id)}
                      className="h-4 w-4 mt-0.5 accent-yellow-400 cursor-pointer shrink-0"
                    />
                    <div className="min-w-0 space-y-0.5">
                      <p className={`text-xs font-bold ${isDone ? "text-slate-500 line-through" : "text-slate-200"}`}>
                        <span className="font-mono text-yellow-400/80 mr-1.5">{index + 1}.</span>
                        {step.title}
                      </p>
                      <p className="text-[11px] text-slate-500 leading-relaxed">{step.description}</p>
                    </div>
                  </label>
                </li>
              );
            })}
          </ol>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setCompletedSteps(REPAIR_STEPS.map(s => s.id))}
              disabled={allStepsComplete}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-yellow-400 text-slate-950 text-xs font-bold rounded-lg transition-colors enabled:hover:bg-yellow-500 enabled:cursor-pointer disabled:opacity-40"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{allStepsComplete ? "All Steps Complete" : "Mark All Complete"}</span>
            </button>
            {stepsComplete > 0 && (
              <button
                type="button"
                onClick={() => setCompletedSteps([])}
                className="px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </section>

        {/* ===== 2. Replacement Parts Catalog ===== */}
        <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-yellow-400" />
              <span>Required Parts</span>
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 font-mono">
                {partLines.length} line items
              </span>
              <button
                type="button"
                onClick={onOpenInventory}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-950 border border-slate-800 hover:border-yellow-400/50 hover:text-yellow-400 text-slate-300 text-[10px] font-bold rounded cursor-pointer transition-colors"
              >
                <Search className="h-3 w-3" />
                <span>Search Inventory</span>
              </button>
            </div>
          </div>

          {partLines.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 space-y-3">
              <Layers className="h-8 w-8 text-slate-700" />
              <p className="text-xs font-bold text-slate-400">No parts attached to this report</p>
              <p className="text-[11px] text-slate-500 max-w-xs">
                Search the stockroom inventory to attach parts. Pricing and stock levels are pulled
                from the inventory database.
              </p>
              <button
                type="button"
                onClick={onOpenInventory}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Search Inventory</span>
              </button>
            </div>
          ) : (
            <ul className="space-y-2 flex-1">
              {partLines.map(({ partId, quantity, part }) => {
                const stock = getStockStatus(part);
                const shortfall = part.quantityInStock < quantity;
                const isDiagnosticBearing =
                  partId === 1 ||
                  /NU\s*314/i.test(part.partNumber) ||
                  /NU\s*314/i.test(part.description);

                return (
                  <li
                    key={partId}
                    className="bg-slate-900/50 border border-white/10 rounded-lg p-3 space-y-2.5 hover:border-white/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-200 truncate" title={part.description}>
                          {part.description}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {part.partNumber} &middot; {part.supplierName}
                          {isDiagnosticBearing && (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 border border-green-500/30 ml-2">
                              ✓ Matched to Diagnostic Spec (70mm Bore)
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${stock.badge}`}>
                          {stock.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRemovePart(partId)}
                          aria-label={`Remove ${part.partNumber} from report`}
                          className="text-slate-600 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/70">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Qty</span>
                        <input
                          type="number"
                          min="1"
                          value={quantity}
                          onChange={e => onChangeQuantity(partId, parseInt(e.target.value, 10) || 1)}
                          aria-label={`Quantity for ${part.partNumber}`}
                          className="w-14 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[10px] font-bold text-slate-200 font-mono focus:outline-none focus:border-yellow-400/60"
                        />
                        <span className="text-[10px] text-slate-500 font-mono">
                          {isDiagnosticBearing ? "Qty: 1 · " : ""}
                          &times; {formatUsd(part.unitPrice)} ={" "}
                          <span className="text-slate-300 font-bold">
                            {formatUsd(part.unitPrice * quantity)}
                          </span>
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled
                        title="Procurement integration pending — no supplier ordering endpoint is connected"
                        className="flex items-center gap-1 px-2.5 py-1 bg-slate-950 border border-slate-800 text-slate-500 text-[10px] font-bold rounded cursor-not-allowed transition-colors shrink-0"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Order</span>
                      </button>
                    </div>

                    {shortfall && (
                      <p className="text-[10px] text-yellow-400 flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span>
                          Only {part.quantityInStock} on hand &middot; {part.leadTimeDays} day lead time
                        </span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between px-3 py-2.5 bg-slate-900/60 border border-slate-800 rounded-lg">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                <span>Total Estimated Cost</span>
              </span>
              <span className="text-sm font-bold text-emerald-400 font-mono">
                {formatUsd(partsTotal)}
              </span>
            </div>
            <button
              type="button"
              disabled
              title="Procurement integration pending — no supplier ordering endpoint is connected"
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-800 text-slate-500 text-xs font-bold rounded-lg cursor-not-allowed transition-colors"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Order All from Supplier</span>
            </button>
          </div>
        </section>
      </div>

      {/* ===== 3. Automated Recommendations Tracker ===== */}
      <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-yellow-400" />
            <span>Automated Recommendations</span>
          </h4>
          <span className="text-[10px] font-bold text-slate-400 font-mono">
            {addressedRecs.length} of {AI_RECOMMENDATIONS.length} recommendations addressed
          </span>
        </div>

        <ul className="space-y-2">
          {AI_RECOMMENDATIONS.map(rec => {
            const isAddressed = addressedRecs.includes(rec.id);
            const isEditing = noteEditorId === rec.id;
            const savedNote = notes[rec.id];

            return (
              <li
                key={rec.id}
                className={`rounded-lg border p-3 space-y-2.5 transition-colors ${
                  isAddressed ? "bg-emerald-500/5 border-emerald-500/25" : "bg-slate-900/50 border-slate-800"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isAddressed}
                    onChange={() => toggleRec(rec.id)}
                    aria-label={`Mark as complete: ${rec.text}`}
                    className="h-4 w-4 mt-0.5 accent-yellow-400 cursor-pointer shrink-0"
                  />

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-bold shrink-0 ${PRIORITY_STYLES[rec.priority]}`}
                      >
                        {rec.priority}
                      </span>
                      <p className={`text-xs font-bold ${isAddressed ? "text-slate-500 line-through" : "text-slate-200"}`}>
                        {rec.text}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{rec.rationale}</p>
                    <div className="pt-1 space-y-1">
                      <button
                        type="button"
                        onClick={onInitiateRca}
                        className="px-3 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 flex items-center gap-2 cursor-pointer transition-colors"
                      >
                        <GitBranch className="h-3.5 w-3.5" />
                        <span>Initiate RCA</span>
                      </button>
                      <p className="text-[10px] text-slate-500 leading-snug max-w-md">
                        Auto-populates 5-Why / Fishbone template in sidebar RCA module with this report&apos;s findings.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => (isEditing ? setNoteEditorId(null) : openNoteEditor(rec.id))}
                    className="flex items-center gap-1 px-2.5 py-1 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-[10px] font-bold rounded cursor-pointer transition-colors shrink-0"
                  >
                    <MessageSquare className="h-3 w-3" />
                    <span>{savedNote ? "Edit Note" : "Add Note"}</span>
                  </button>
                </div>

                {savedNote && !isEditing && (
                  <p className="text-[11px] text-slate-400 italic border-l-2 border-yellow-400/50 pl-2.5 ml-7">
                    {savedNote}
                  </p>
                )}

                {isEditing && (
                  <div className="ml-7 space-y-2">
                    <textarea
                      value={noteDraft}
                      onChange={e => setNoteDraft(e.target.value)}
                      rows={2}
                      placeholder="Technician feedback, field observations, or deferral reason..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[11px] text-slate-200 focus:outline-none focus:border-yellow-400/60 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveNote(rec.id)}
                        className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-[10px] font-bold rounded cursor-pointer transition-colors"
                      >
                        Save Note
                      </button>
                      <button
                        type="button"
                        onClick={() => setNoteEditorId(null)}
                        className="px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 text-[10px] font-bold rounded cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ===== 4. Export & Share ===== */}
      <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
          <Download className="h-4 w-4 text-yellow-400" />
          <span>Report Distribution</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: "Export as PDF",
              hint: canExport ? "Full technical report" : "Load a report first",
              icon: FileText,
              primary: true,
              onClick: onExportPdf,
              disabledReason: canExport ? null : "Load an analysis report before exporting"
            },
            {
              label: "Export as CSV",
              hint: canExport ? "Raw measurement data" : "Load a report first",
              icon: Download,
              primary: false,
              onClick: onExportCsv,
              disabledReason: canExport ? null : "Load an analysis report before exporting"
            },
            {
              label: "Email to Manager",
              hint: "Sends summary",
              icon: Mail,
              primary: false,
              onClick: undefined,
              disabledReason: "Email delivery pending — no report mailing endpoint is connected"
            },
            {
              label: "Create Work Order",
              hint: "Pre-populated with findings",
              icon: Wrench,
              primary: false,
              onClick: onCreateWorkOrder,
              disabledReason: null
            }
          ].map(action => {
            const Icon = action.icon;
            const disabled = action.disabledReason !== null;
            return (
              <div key={action.label} className="space-y-2">
                <button
                  type="button"
                  onClick={action.onClick}
                  disabled={disabled}
                  title={action.disabledReason ?? undefined}
                  className={`w-full flex flex-col items-start gap-1.5 p-3.5 rounded-lg border text-left transition-colors ${
                    disabled
                      ? "bg-slate-900/40 border-slate-800 text-slate-500 cursor-not-allowed"
                      : action.primary
                        ? "bg-yellow-400 border-yellow-400 text-slate-950 hover:bg-yellow-500 cursor-pointer"
                        : "bg-slate-900/50 border border-white/10 text-slate-300 hover:border-white/30 hover:text-white cursor-pointer"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-xs font-bold">{action.label}</span>
                  <span
                    className={`text-[10px] ${
                      !disabled && action.primary ? "text-slate-800" : "text-slate-500"
                    }`}
                  >
                    {action.hint}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SpectrumLibraryPanel({
  assetName,
  tagId
}: {
  assetName: string;
  tagId: string;
}) {
  const [compareMode, setCompareMode] = useState(false);
  const [dateFilter, setDateFilter] = useState<string>(DEFAULT_DATE_FILTER);
  const [pointFilter, setPointFilter] = useState<PointGroup | "all">("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [syncScroll, setSyncScroll] = useState(true);
  const spectra = DEMO_SPECTRA_SEED;
  const [scrubId, setScrubId] = useState<number | null>(spectra[0]?.id ?? null);

  // Analysis tools
  const [domain, setDomain] = useState<SpectrumDomain>("fft");
  const [waveformDomain, setWaveformDomain] = useState<"spectrum" | "time">("spectrum");
  const [showWaterfall, setShowWaterfall] = useState(false);
  const [rangeId, setRangeId] = useState<string>(FREQ_RANGES[0].id);
  const [cursorHz, setCursorHz] = useState<number | null>(Number(ONE_X_HZ.toFixed(1)));
  const [showHarmonics, setShowHarmonics] = useState(true);
  const [showSidebands, setShowSidebands] = useState(false);
  const [showBearingMarkers, setShowBearingMarkers] = useState(true);
  const [showIsoLimits, setShowIsoLimits] = useState(false);
  const [bearingId, setBearingId] = useState(BEARINGS[0].id);
  const [rpm, setRpm] = useState(SHAFT_RPM);

  const scrollRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isSyncing = useRef(false);

  // Newest first for the grid.
  const filtered = useMemo(() => {
    const days = DATE_FILTERS.find(f => f.id === dateFilter)?.days ?? null;
    return spectra.filter(s => {
      if (pointFilter !== "all" && s.pointGroup !== pointFilter) return false;
      if (days === null) return true;
      const ageDays = (LIBRARY_TODAY.getTime() - new Date(`${s.date}T00:00:00`).getTime()) / 86_400_000;
      return ageDays <= days;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [dateFilter, pointFilter, spectra]);

  // Oldest first for the timeline scrubber.
  const chronological = useMemo(() => [...filtered].reverse(), [filtered]);

  // Leaving compare mode must not leave selections or an open comparison behind.
  useEffect(() => {
    if (!compareMode) {
      setSelectedIds([]);
      setComparisonOpen(false);
    }
  }, [compareMode]);

  // Drop selections and scrub position that the active filters no longer include.
  useEffect(() => {
    const visible = new Set(filtered.map(s => s.id));
    setSelectedIds(prev => prev.filter(id => visible.has(id)));
    setScrubId(prev => (prev !== null && visible.has(prev) ? prev : filtered[0]?.id ?? null));
  }, [filtered]);

  const filtersActive = dateFilter !== DEFAULT_DATE_FILTER || pointFilter !== "all";
  const selectionFull = selectedIds.length >= 4;
  const selectedRecords = filtered.filter(s => selectedIds.includes(s.id));
  const detailRecord = detailId !== null ? spectra.find(s => s.id === detailId) ?? null : null;
  const scrubIndex = Math.max(0, chronological.findIndex(s => s.id === scrubId));

  // The scrubbed record drives the analysis tools, so the timeline doubles as a record selector.
  const activeRecord = chronological[scrubIndex] ?? filtered[0] ?? null;
  const bearing = BEARINGS.find(b => b.id === bearingId) ?? BEARINGS[0];
  const oneX = rpm / 60;
  const range = FREQ_RANGES.find(r => r.id === rangeId) ?? FREQ_RANGES[0];
  const bearingFreqs = useMemo(() => bearingFrequencies(bearing, rpm), [bearing, rpm]);
  const activePeaks = useMemo(
    () => (activeRecord ? analysePeaks(activeRecord, rpm, bearing) : []),
    [activeRecord, rpm, bearing]
  );
  const detailPeaks = useMemo(
    () => (detailRecord ? analysePeaks(detailRecord, rpm, bearing) : []),
    [detailRecord, rpm, bearing]
  );
  const cursorPeak =
    cursorHz === null ? null : activePeaks.find(peak => Math.abs(peak.hz - cursorHz) <= 6) ?? null;
  const cursorInSpan = cursorHz !== null && cursorHz >= range.lo && cursorHz <= range.hi;

  // Selecting a tone from a table widens the span when needed so the cursor stays visible.
  const placeCursor = (hz: number) => {
    setCursorHz(hz);
    if (hz < range.lo || hz > range.hi) setRangeId(FREQ_RANGES[0].id);
  };

  const toggleSelected = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 4 ? prev : [...prev, id]
    );
  };

  const clearFilters = () => {
    setDateFilter(DEFAULT_DATE_FILTER);
    setPointFilter("all");
  };

  const handleSyncedScroll = (index: number) => (event: React.UIEvent<HTMLDivElement>) => {
    if (!syncScroll || isSyncing.current) return;
    isSyncing.current = true;
    const { scrollLeft } = event.currentTarget;
    scrollRefs.current.forEach((el, i) => {
      if (el && i !== index) el.scrollLeft = scrollLeft;
    });
    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  };

  return (
    <div className="space-y-5">

      {/* ===== 5. Filter Controls ===== */}
      <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">

          <div className="space-y-1.5 flex-1 min-w-0">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Filter className="h-3 w-3 text-yellow-400" />
              <span>Date Range</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DATE_FILTERS.map(filter => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setDateFilter(filter.id)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer border ${
                    dateFilter === filter.id
                      ? "bg-yellow-400 text-slate-950 border-yellow-400"
                      : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <MapPin className="h-3 w-3 text-yellow-400" />
              <span>Measurement Point</span>
            </label>
            <div className="relative">
              <select
                value={pointFilter}
                onChange={e => setPointFilter(e.target.value as PointGroup | "all")}
                className="appearance-none bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-9 py-1.5 text-[11px] font-bold text-slate-200 cursor-pointer focus:outline-none focus:border-yellow-400/60"
              >
                {POINT_FILTERS.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Compare Mode lives with the library filters because Tab 2 is its only consumer. */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Layers className="h-3 w-3 text-yellow-400" />
              <span>Compare Mode</span>
            </label>
            <button
              type="button"
              role="switch"
              aria-checked={compareMode}
              onClick={() => setCompareMode(prev => !prev)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 cursor-pointer transition-colors ${
                compareMode
                  ? "bg-yellow-400/10 border-yellow-400/40"
                  : "bg-slate-950 border-slate-800 hover:border-slate-700"
              }`}
            >
              <span
                className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${
                  compareMode ? "bg-yellow-400" : "bg-slate-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                    compareMode ? "left-4" : "left-0.5"
                  }`}
                />
              </span>
              <span
                className={`text-[11px] font-bold ${compareMode ? "text-yellow-400" : "text-slate-400"}`}
              >
                {compareMode ? "ON" : "OFF"}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={clearFilters}
            disabled={!filtersActive}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors bg-slate-950 border-slate-800 text-slate-400 enabled:hover:text-white enabled:hover:border-slate-700 enabled:cursor-pointer disabled:opacity-40"
          >
            Clear Filters
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/70">
          <span className="text-[10px] text-slate-500 font-mono">
            Showing {filtered.length} of {spectra.length} spectra
          </span>
          {compareMode && (
            <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1.5">
              <Info className="h-3 w-3 text-yellow-400" />
              Select 2-4 spectra to compare side-by-side
            </span>
          )}
        </div>
      </section>

      {/* Compare action bar */}
      {compareMode && selectedIds.length >= 2 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-yellow-400/10 border border-yellow-400/30 rounded-xl px-4 py-3">
          <span className="text-xs font-bold text-yellow-400">
            {selectedIds.length} spectra selected{selectionFull ? " (maximum reached)" : ""}
          </span>
          <button
            type="button"
            onClick={() => setComparisonOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Compare Selected ({selectedIds.length})</span>
          </button>
        </div>
      )}

      {/* ===== 1. Spectrum Image Grid ===== */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl">
          <Info className="h-6 w-6 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-400 font-medium">No spectra match the current filters</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 text-[11px] font-bold rounded-lg cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(record => {
            const isSelected = selectedIds.includes(record.id);
            const isScrubbed = record.id === scrubId;
            return (
              <div
                key={record.id}
                onClick={() => (compareMode ? toggleSelected(record.id) : setDetailId(record.id))}
                className={`relative bg-slate-900 border rounded-xl overflow-hidden transition-all cursor-pointer group ${
                  isSelected
                    ? "border-yellow-400 shadow-lg shadow-yellow-400/10"
                    : isScrubbed
                      ? "border-yellow-400/50"
                      : "border-slate-800 hover:border-slate-700"
                }`}
              >
                {/* Selection checkbox */}
                {compareMode && (
                  <label
                    className="absolute top-2 right-2 z-10 flex items-center justify-center"
                    onClick={e => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!isSelected && selectionFull}
                      onChange={() => toggleSelected(record.id)}
                      aria-label={`Select spectrum from ${formatSpectrumDate(record.date)}`}
                      className="h-4 w-4 accent-yellow-400 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </label>
                )}

                {/* Spectrum visual */}
                <div className="relative bg-slate-950 border-b border-slate-800">
                  <SpectrumTrace record={record} />
                  <span
                    className={`absolute bottom-2 left-2 px-1.5 py-0.5 rounded border text-[9px] font-bold font-mono ${overallBadgeStyle(record.overall)}`}
                  >
                    {record.overall.toFixed(2)} mm/s
                  </span>
                  {!compareMode && (
                    <span className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[9px] font-bold text-slate-300">
                      <Eye className="h-3 w-3" />
                      View
                    </span>
                  )}
                </div>

                {/* Meta */}
                <div className="p-3 space-y-0.5">
                  <p className="text-xs font-bold text-slate-200 truncate" title={record.point}>
                    {record.point}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    {formatSpectrumDate(record.date)} &middot; {record.time}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== 4. Time Slider ===== */}
      {chronological.length > 1 && (
        <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-yellow-400" />
              <span>Spectrum Timeline</span>
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">
              {chronological[scrubIndex]
                ? `${formatSpectrumDate(chronological[scrubIndex].date)} · ${chronological[scrubIndex].point}`
                : "—"}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={chronological.length - 1}
            step={1}
            value={scrubIndex}
            onChange={e => setScrubId(chronological[parseInt(e.target.value, 10)]?.id ?? null)}
            aria-label="Scrub through historical spectra"
            className="w-full accent-yellow-400 cursor-pointer"
          />

          {/* Date markers */}
          <div className="flex justify-between gap-1">
            {chronological.map((record, i) => (
              <button
                key={record.id}
                type="button"
                onClick={() => setScrubId(record.id)}
                title={`${formatSpectrumDate(record.date)} — ${record.point}`}
                className="flex flex-col items-center gap-1 flex-1 min-w-0 cursor-pointer group"
              >
                <span
                  className={`h-2 w-2 rounded-full transition-all ${
                    i === scrubIndex
                      ? "bg-yellow-400 ring-2 ring-yellow-400/30 scale-125"
                      : "bg-slate-600 group-hover:bg-slate-400"
                  }`}
                />
                <span
                  className={`text-[9px] font-mono truncate w-full text-center ${
                    i === scrubIndex ? "text-yellow-400 font-bold" : "text-slate-600"
                  }`}
                >
                  {record.date.slice(5)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ===== 6. Spectrum Analysis Tools ===== */}
      {activeRecord && (
        <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
              <Crosshair className="h-4 w-4 text-yellow-400" />
              <span>Spectrum Analysis</span>
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">
              {activeRecord.point} &middot; {formatSpectrumDate(activeRecord.date)} &middot;{" "}
              {activeRecord.overall.toFixed(2)} mm/s overall
            </span>
          </div>

          {/* Domain, zoom and overlay controls */}
          <div className="flex flex-wrap items-end gap-4 pb-3 border-b border-slate-800/70">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                Signal Domain
              </label>
              <div className="flex flex-wrap gap-1.5">
                {SPECTRUM_DOMAINS.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setDomain(option.id);
                      setWaveformDomain(option.id === "waveform" ? "time" : "spectrum");
                      if (option.id === "waveform") setShowWaterfall(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                      domain === option.id && !showWaterfall
                        ? "bg-yellow-400 text-slate-950 border-yellow-400"
                        : "bg-transparent text-slate-400 border-white/30 hover:text-slate-200 hover:border-yellow-500"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setShowWaterfall(prev => !prev);
                    if (!showWaterfall) {
                      setWaveformDomain("spectrum");
                      if (domain === "waveform") setDomain("fft");
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                    showWaterfall
                      ? "bg-yellow-500/20 border-yellow-500 text-yellow-400"
                      : "bg-transparent text-slate-400 border-white/30 hover:text-slate-200 hover:border-yellow-500"
                  }`}
                >
                  3D Waterfall View
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                Frequency Span
              </label>
              <div className="flex flex-wrap gap-1.5">
                {FREQ_RANGES.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    disabled={domain === "waveform" || showWaterfall}
                    onClick={() => setRangeId(option.id)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors disabled:opacity-40 enabled:cursor-pointer ${
                      rangeId === option.id && domain !== "waveform" && !showWaterfall
                        ? "bg-yellow-400 text-slate-950 border-yellow-400"
                        : "bg-transparent text-slate-400 border-white/30 enabled:hover:text-slate-200 enabled:hover:border-yellow-500"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                Overlays
              </label>
              <div className="flex flex-wrap gap-1.5">
                <ToolToggle
                  active={showHarmonics}
                  onClick={() => setShowHarmonics(prev => !prev)}
                  icon={Target}
                  label="Harmonic Markers"
                />
                <ToolToggle
                  active={showBearingMarkers}
                  onClick={() => setShowBearingMarkers(prev => !prev)}
                  icon={Sliders}
                  label="Bearing Tones"
                />
                <ToolToggle
                  active={showIsoLimits}
                  onClick={() => setShowIsoLimits(prev => !prev)}
                  icon={AlertOctagon}
                  label="ISO Alarm Lines"
                />
                <button
                  type="button"
                  role="switch"
                  aria-checked={showSidebands}
                  onClick={() => setShowSidebands(prev => !prev)}
                  className={`px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer ${
                    showSidebands
                      ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}
                >
                  Sideband Cursors (±1X)
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

            {/* Interactive spectrum */}
            <div className="xl:col-span-2 space-y-3">
              {waveformDomain === "time" && !showWaterfall && (
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3 flex-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                      Crest Factor
                    </span>
                    <span className="text-lg font-bold text-yellow-400 font-mono block mt-1">4.2</span>
                    <span className="text-[10px] text-slate-500 block mt-1 leading-snug">
                      Peak / RMS (Detects impacting/spalling)
                    </span>
                  </div>
                  <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3 flex-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                      Kurtosis
                    </span>
                    <span className="text-lg font-bold text-red-500 font-mono block mt-1">3.8</span>
                    <span className="text-[10px] text-slate-500 block mt-1 leading-snug">
                      Signal spikiness (Localized damage)
                    </span>
                  </div>
                  <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3 flex-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                      Peak-to-Peak
                    </span>
                    <span className="text-lg font-bold text-cyan-400 font-mono block mt-1">12.4 mils</span>
                    <span className="text-[10px] text-slate-500 block mt-1 leading-snug">
                      Displacement / Clearance check
                    </span>
                  </div>
                </div>
              )}

              <div className="bg-slate-950 border border-white/10 rounded-xl px-2 py-3">
                {showWaterfall ? (
                  <div className="space-y-2 px-1">
                    <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">
                      Variable Speed Cascade Plot (Frequency vs. Amplitude vs. Time)
                    </p>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={WATERFALL_DATA} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                          <defs>
                            {WATERFALL_SERIES.map((key, i) => (
                              <linearGradient key={key} id={`waterfall-${key}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={WATERFALL_COLORS[i]} stopOpacity={0.75} />
                                <stop offset="100%" stopColor={WATERFALL_COLORS[i]} stopOpacity={0.05} />
                              </linearGradient>
                            ))}
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis
                            dataKey="hz"
                            tick={{ fill: "#64748b", fontSize: 10 }}
                            stroke="#334155"
                            label={{ value: "Hz", position: "insideBottomRight", fill: "#94a3b8", fontSize: 10 }}
                          />
                          <YAxis
                            tick={{ fill: "#64748b", fontSize: 10 }}
                            stroke="#334155"
                            label={{ value: "mm/s", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 10 }}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "#0f172a",
                              border: "1px solid #334155",
                              borderRadius: 8,
                              fontSize: 11
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
                          {WATERFALL_SERIES.map((key, i) => (
                            <Area
                              key={key}
                              type="monotone"
                              dataKey={key}
                              stroke={WATERFALL_COLORS[i]}
                              fill={`url(#waterfall-${key})`}
                              strokeWidth={1.5}
                              fillOpacity={0.55}
                              isAnimationActive={false}
                            />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : (
                  <SpectrumAnalysisChart
                    record={activeRecord}
                    peaks={activePeaks}
                    rpm={rpm}
                    domain={domain}
                    range={range}
                    cursorHz={cursorHz}
                    onCursorChange={setCursorHz}
                    showHarmonics={showHarmonics}
                    showSidebands={showSidebands}
                    bearingMarkers={showBearingMarkers ? bearingFreqs : null}
                    showIsoLimits={showIsoLimits}
                  />
                )}
              </div>

              {/* Cursor readout */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Crosshair className="h-3.5 w-3.5 text-yellow-400" />
                    <span>Frequency Cursor</span>
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {domain === "waveform"
                      ? "Switch to a frequency domain to place the cursor."
                      : "Click the spectrum to move the cursor."}
                  </span>
                </div>

                {cursorHz === null ? (
                  <p className="text-[11px] text-slate-500">No cursor placed.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <div className="bg-slate-950/60 border border-slate-800 rounded-lg py-2">
                        <span className="text-[9px] text-slate-500 uppercase font-mono block">Frequency</span>
                        <span className="text-xs font-bold text-white font-mono">{cursorHz.toFixed(1)} Hz</span>
                      </div>
                      <div className="bg-slate-950/60 border border-slate-800 rounded-lg py-2">
                        <span className="text-[9px] text-slate-500 uppercase font-mono block">Speed Ratio</span>
                        <span className="text-xs font-bold text-yellow-400 font-mono">
                          {(cursorHz / oneX).toFixed(2)}&times;
                        </span>
                      </div>
                      <div className="bg-slate-950/60 border border-slate-800 rounded-lg py-2">
                        <span className="text-[9px] text-slate-500 uppercase font-mono block">CPM</span>
                        <span className="text-xs font-bold text-slate-200 font-mono">
                          {Math.round(cursorHz * 60).toLocaleString()}
                        </span>
                      </div>
                      <div className="bg-slate-950/60 border border-slate-800 rounded-lg py-2">
                        <span className="text-[9px] text-slate-500 uppercase font-mono block">Amplitude</span>
                        <span className="text-xs font-bold text-slate-200 font-mono">
                          {cursorPeak ? `${cursorPeak.amplitude.toFixed(3)} mm/s` : "—"}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {cursorPeak
                        ? `Matched peak ${cursorPeak.code} — ${cursorPeak.fault}.`
                        : "No resolved peak within 6 Hz of the cursor; this position sits in the noise floor."}
                      {!cursorInSpan && (
                        <span className="text-yellow-400">
                          {" "}
                          Cursor sits outside the {range.label.toLowerCase()} span.
                        </span>
                      )}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Bearing fault frequency calculator */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3.5">
              <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-yellow-400" />
                <span>Bearing Fault Frequencies</span>
              </h5>

              <label className="block space-y-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                  Bearing
                </span>
                <div className="relative">
                  <select
                    value={bearingId}
                    onChange={e => setBearingId(e.target.value)}
                    className="w-full appearance-none bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-9 py-2 text-[11px] font-bold text-slate-200 cursor-pointer focus:outline-none focus:border-yellow-400/60"
                  >
                    {BEARINGS.map(option => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </label>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Shaft Speed
                  </span>
                  <span className="text-[11px] font-bold text-yellow-400 font-mono">
                    {rpm.toLocaleString()} RPM &middot; 1X = {oneX.toFixed(1)} Hz
                  </span>
                </div>
                <input
                  type="range"
                  min={600}
                  max={6000}
                  step={10}
                  value={rpm}
                  onChange={e => setRpm(parseInt(e.target.value, 10))}
                  aria-label="Shaft speed for bearing frequency calculation"
                  className="w-full accent-yellow-400 cursor-pointer"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={600}
                    max={6000}
                    step={10}
                    value={rpm}
                    onChange={e => setRpm(Math.min(6000, Math.max(600, parseInt(e.target.value, 10) || SHAFT_RPM)))}
                    aria-label="Shaft speed in RPM"
                    className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] font-bold text-slate-200 font-mono focus:outline-none focus:border-yellow-400/60"
                  />
                  <button
                    type="button"
                    onClick={() => setRpm(SHAFT_RPM)}
                    disabled={rpm === SHAFT_RPM}
                    className="px-2.5 py-1 bg-slate-950 border border-slate-800 text-slate-400 text-[10px] font-bold rounded transition-colors enabled:hover:text-white enabled:hover:border-slate-700 enabled:cursor-pointer disabled:opacity-40"
                  >
                    Reset to Nameplate
                  </button>
                </div>
              </div>

              <ul className="space-y-1.5">
                {bearingFreqs.map(freq => {
                  const hit = activePeaks.find(peak => peak.code === freq.key);
                  return (
                    <li key={freq.key}>
                      <button
                        type="button"
                        onClick={() => placeCursor(Number(freq.hz.toFixed(1)))}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border text-left cursor-pointer transition-colors ${
                          hit
                            ? "bg-red-500/5 border-red-500/25 hover:border-red-500/40"
                            : "bg-slate-950 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="text-[11px] font-bold text-slate-200 font-mono block">
                            {freq.key}
                            {hit && <span className="text-red-400 ml-1.5">peak present</span>}
                          </span>
                          <span className="text-[9px] text-slate-500 block truncate">{freq.name}</span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className="text-[11px] font-bold text-yellow-400 font-mono block">
                            {freq.hz.toFixed(1)} Hz
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono block">
                            {freq.order.toFixed(2)}&times;
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <p className="text-[10px] text-slate-500 leading-relaxed">
                Defect frequencies scale linearly with shaft speed. Select a row to place the cursor on
                that tone in the spectrum.
              </p>
            </div>
          </div>

          {/* Resolved peak table */}
          <div className="pt-1 space-y-2">
            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-yellow-400" />
              <span>Dominant Peaks &amp; Fault Attribution</span>
            </h5>
            <PeakTable peaks={activePeaks} oneX={oneX} cursorHz={cursorHz} onSelect={placeCursor} />
          </div>
        </section>
      )}

      {/* ===== 3. Side-by-Side Comparison View ===== */}
      {comparisonOpen && selectedRecords.length >= 2 && (
        <>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]" onClick={() => setComparisonOpen(false)} />
          <div className="fixed inset-3 sm:inset-6 lg:inset-10 z-[60] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">

            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="h-4 w-4 text-yellow-400" />
                <span>Side-by-Side Comparison ({selectedRecords.length})</span>
              </h3>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={syncScroll}
                  onClick={() => setSyncScroll(prev => !prev)}
                  className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 cursor-pointer hover:border-slate-700 transition-colors"
                >
                  <span className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${syncScroll ? "bg-yellow-400" : "bg-slate-700"}`}>
                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${syncScroll ? "left-4" : "left-0.5"}`} />
                  </span>
                  <span className={`text-[11px] font-bold ${syncScroll ? "text-yellow-400" : "text-slate-400"}`}>
                    Sync Scroll
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setComparisonOpen(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-[11px] font-bold rounded-lg cursor-pointer transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Close Comparison</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-[10px] text-slate-500 font-mono mb-3">
                {syncScroll
                  ? "Sync Scroll is on — panning one spectrum pans all others."
                  : "Sync Scroll is off — each spectrum pans independently."}
              </p>

              <div className={`grid gap-4 ${selectedRecords.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-2 xl:grid-cols-4"}`}>
                {selectedRecords.map((record, index) => (
                  <div key={record.id} className="bg-slate-950/50 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                    <div className="px-3 py-2.5 border-b border-slate-800">
                      <p className="text-xs font-bold text-white truncate" title={record.point}>{record.point}</p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {formatSpectrumDate(record.date)} &middot; {record.time}
                      </p>
                    </div>

                    <div
                      ref={el => { scrollRefs.current[index] = el; }}
                      onScroll={handleSyncedScroll(index)}
                      className="overflow-x-auto bg-slate-950 border-b border-slate-800 scrollbar-none"
                    >
                      <div className="w-[220%]">
                        <SpectrumTrace record={record} className="w-full h-44" />
                      </div>
                    </div>

                    <div className="p-3">
                      <SpectrumMetrics record={record} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===== 2. Detailed single-spectrum view (Compare Mode off) ===== */}
      {detailRecord && (
        <>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]" onClick={() => setDetailId(null)} />
          <div className="fixed inset-x-3 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-2xl z-[60] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white">{detailRecord.point}</h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                  {assetName} &middot; {tagId} &middot;{" "}
                  {formatSpectrumDate(detailRecord.date)} &middot; {detailRecord.time}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailId(null)}
                aria-label="Close detailed view"
                className="text-slate-500 hover:text-white shrink-0 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <SpectrumTrace record={detailRecord} className="w-full h-56" />
              </div>
              <SpectrumMetrics record={detailRecord} />

              <div className="space-y-2 pt-1 border-t border-slate-800">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 pt-3">
                  <Activity className="h-3.5 w-3.5 text-yellow-400" />
                  <span>Resolved Peaks</span>
                </h4>
                <PeakTable peaks={detailPeaks} oneX={oneX} limit={5} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AnalysisResultsPanel({
  assetName,
  tagId,
  component,
  analysis
}: {
  assetName: string;
  tagId: string;
  component?: string | null;
  analysis?: SavedAnalysisResult | null;
}) {
  const [analyst, setAnalyst] = useState(ACQUISITION.analyst);
  const [velocityUnit, setVelocityUnit] = useState<"mms" | "ins">("mms");
  const isMms = velocityUnit === "mms";

  // Canonical storage is in/s; convert for display. Zone A upper bound is inclusive.
  const readingZone = ISO_ZONES.find(z => ISO_READING <= z.to) ?? ISO_ZONES[ISO_ZONES.length - 1];
  const markerPercent = Math.min((ISO_READING / ISO_SCALE_MAX) * 100, 100);
  const zoneHeadroomIns = readingZone.to - ISO_READING;
  const nextZone = ISO_ZONES[ISO_ZONES.indexOf(readingZone) + 1];

  const toDisplay = (ins: number) => (isMms ? ins * IN_S_TO_MM_S : ins);
  const fmt = (ins: number, digits?: number) =>
    toDisplay(ins).toFixed(digits ?? (isMms ? 1 : 2));
  const unitShort = isMms ? "mm/s" : "in/s";
  const unitLabel = `${unitShort} RMS`;
  const gaugeRangeText = isMms
    ? "Nominal 0.0 - 2.0, Warning 2.0 - 7.1, Danger 7.1 - 11.0"
    : "Nominal 0.00 - 0.08, Warning 0.08 - 0.28, Danger 0.28 - 0.43";

  const trendFirst = TREND_DATA[0].value;
  const trendLast = TREND_DATA[TREND_DATA.length - 1].value;
  const trendDelta = ((trendLast - trendFirst) / trendFirst) * 100;
  const trendRising = trendDelta >= 0;
  // TREND_DATA is stored in mm/s; scale for the active unit system.
  const trendToDisplay = (mms: number) => (isMms ? mms : mms / IN_S_TO_MM_S);
  const trendMaxDisplay = isMms ? TREND_MAX : TREND_MAX / IN_S_TO_MM_S;
  const yTicksMms = [0, 0.75, 1.5, 2.25, 3];
  const yTicks = yTicksMms.map(trendToDisplay);
  const pointDecimals = isMms ? 2 : 3;

  // Trend chart geometry. The SVG scales as a unit via viewBox, so no library is needed.
  const chart = { width: 720, height: 240, left: 62, right: 704, top: 18, bottom: 188 };
  const pointX = (i: number) =>
    chart.left + (i * (chart.right - chart.left)) / (TREND_DATA.length - 1);
  const pointY = (displayValue: number) =>
    chart.bottom - (displayValue / trendMaxDisplay) * (chart.bottom - chart.top);
  const linePath = TREND_DATA.map((d, i) => `${i === 0 ? "M" : "L"} ${pointX(i)} ${pointY(trendToDisplay(d.value))}`).join(" ");
  const areaPath = `${linePath} L ${pointX(TREND_DATA.length - 1)} ${chart.bottom} L ${chart.left} ${chart.bottom} Z`;

  const inspectionDate = analysis?.timestamp
    ? new Date(analysis.timestamp).toLocaleDateString()
    : REPORT_SUMMARY.inspectionDate;
  const topFault =
    analysis?.primary_fault ||
    analysis?.fault_list?.[0]?.title ||
    REPORT_SUMMARY.topFaultCode;

  return (
    <div className="space-y-5">

      {/* ===== 1. Executive Summary ===== */}
      <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Asset</span>
            <span className="text-sm font-bold text-white block truncate">
              {assetName}
              {component ? ` · ${component}` : ""}
            </span>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Tag ID</span>
            <span className="text-sm font-bold text-slate-200 font-mono block truncate">{tagId}</span>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Inspection Date</span>
            <span className="text-sm font-semibold text-slate-200 block truncate">{inspectionDate}</span>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
              {analysis ? "Health / Primary Fault" : "Top Fault Code"}
            </span>
            <span className="text-sm font-bold text-yellow-400 font-mono block truncate">
              {analysis?.health_score != null ? `H${analysis.health_score} · ` : ""}
              {topFault}
            </span>
          </div>
        </div>

        {/* Operating conditions — order-based diagnosis is only valid against the measured speed and load. */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 pt-4 border-t border-slate-800/70">
          <div className="flex items-center gap-2.5 min-w-0 bg-slate-900/50 border border-white/10 rounded-lg p-3">
            <Gauge className="h-4 w-4 text-yellow-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Shaft Speed</span>
              <span className="text-xs font-bold text-slate-200 font-mono block truncate">
                {SHAFT_RPM.toLocaleString()} RPM
              </span>
              <span className="text-[10px] text-slate-500 font-mono block">1X = {ONE_X_HZ.toFixed(1)} Hz</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 min-w-0 bg-slate-900/50 border border-white/10 rounded-lg p-3">
            <Activity className="h-4 w-4 text-yellow-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Load</span>
              <span className="text-xs font-bold text-slate-200 font-mono block">{ACQUISITION.loadPercent}%</span>
              <span className="text-[10px] text-slate-500 font-mono block">of rated duty</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 min-w-0 bg-slate-900/50 border border-white/10 rounded-lg p-3">
            <Thermometer className="h-4 w-4 text-yellow-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Bearing Temp</span>
              <span className="text-xs font-bold text-slate-200 font-mono block">{ACQUISITION.bearingTemp}</span>
              <span className="text-[10px] text-slate-500 font-mono block">drive end</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 min-w-0 bg-slate-900/50 border border-white/10 rounded-lg p-3">
            <MapPin className="h-4 w-4 text-yellow-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Route</span>
              <span className="text-xs font-bold text-slate-200 block truncate">{ACQUISITION.route}</span>
              <span className="text-[10px] text-slate-500 font-mono block">{DEMO_SPECTRA_SEED.length} spectra on file</span>
            </div>
          </div>
          <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3 min-w-0 col-span-2 lg:col-span-1 xl:col-span-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
              PeakVue / Acceleration Enveloping
            </span>
            <span className="text-sm font-bold text-white font-mono block mt-1">0.45 gE</span>
            <span className="text-[10px] text-slate-500 block mt-1 leading-snug">
              Essential for catching early-stage bearing defects.
            </span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>Vibration Health Assessment</span>
            </h4>
            <span className="px-2 py-0.5 rounded border border-yellow-400/25 bg-yellow-400/10 text-yellow-400 text-[10px] font-bold flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              <span>{ACQUISITION.aiConfidence}% model confidence</span>
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{REPORT_SUMMARY.assessment}</p>
        </div>

        {/* Chain of custody for the measurement */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Measured</span>
            <span className="text-[11px] font-semibold text-slate-300 font-mono block">{ACQUISITION.measuredAt}</span>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Analysed</span>
            <span className="text-[11px] font-semibold text-slate-300 font-mono block">{ACQUISITION.analysedAt}</span>
          </div>
          <label className="space-y-1 block">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <User className="h-3 w-3 text-yellow-400" />
              <span>Responsible Analyst</span>
            </span>
            <input
              type="text"
              value={analyst}
              onChange={e => setAnalyst(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 focus:outline-none focus:border-yellow-400/60"
            />
          </label>
        </div>
      </section>

      {/* ===== 2. ISO 20816 Severity Visualization ===== */}
      <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-yellow-400" />
              <span>ISO 20816 SEVERITY</span>
            </h4>
            <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-slate-800 text-cyan-400 border border-cyan-500/30 mt-1">
              Group 2 — Medium Machine (15–300 kW) | Rigid Foundation
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
              <button
                type="button"
                onClick={() => setVelocityUnit("ins")}
                className={`px-2.5 py-1 text-[10px] font-bold font-mono uppercase cursor-pointer transition-colors ${
                  !isMms
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-slate-900 text-slate-500 hover:text-slate-300"
                }`}
              >
                in/s
              </button>
              <button
                type="button"
                onClick={() => setVelocityUnit("mms")}
                className={`px-2.5 py-1 text-[10px] font-bold font-mono uppercase cursor-pointer transition-colors border-l border-slate-700 ${
                  isMms
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-slate-900 text-slate-500 hover:text-slate-300"
                }`}
              >
                mm/s
              </button>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-white font-mono">{fmt(ISO_READING, isMms ? 1 : 2)}</span>
              <span className="text-[10px] text-slate-500 font-mono uppercase">{unitLabel}</span>
              <span className={`ml-1.5 px-2 py-0.5 rounded border text-[10px] font-bold ${readingZone.badge}`}>
                ZONE {readingZone.zone} &middot; {readingZone.label.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-slate-500 font-mono">{gaugeRangeText}</p>

        <div className="pt-6 pb-1">
          <div className="relative">
            {/* Zone bar */}
            <div className="flex h-4 rounded-full overflow-hidden border border-slate-800">
              {ISO_ZONES.map(zone => (
                <div
                  key={zone.zone}
                  className={zone.bar}
                  style={{ width: `${((zone.to - zone.from) / ISO_SCALE_MAX) * 100}%` }}
                  title={`Zone ${zone.zone}: ${zone.label}`}
                />
              ))}
            </div>

            {/* Current reading marker */}
            <div
              className="absolute -top-6 flex flex-col items-center -translate-x-1/2"
              style={{ left: `${markerPercent}%` }}
            >
              <span className="px-1.5 py-0.5 bg-white text-slate-950 text-[9px] font-bold rounded whitespace-nowrap shadow">
                {fmt(ISO_READING, isMms ? 1 : 2)}
              </span>
              <span className="w-0.5 h-7 bg-white" />
            </div>
          </div>

          {/* Zone labels */}
          <div className="flex mt-2">
            {ISO_ZONES.map(zone => (
              <div
                key={zone.zone}
                className="text-center px-1"
                style={{ width: `${((zone.to - zone.from) / ISO_SCALE_MAX) * 100}%` }}
              >
                <span className={`text-[10px] font-bold block truncate ${zone.text}`}>{zone.label}</span>
                <span className="text-[9px] text-slate-500 font-mono block">
                  {fmt(zone.from)}&ndash;{fmt(zone.to)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Headroom to the next zone boundary */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-slate-900/60 border border-slate-800 rounded-lg">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Alarm Headroom</span>
          </span>
          <span className="text-[11px] text-slate-300 font-mono">
            {fmt(ISO_READING, isMms ? 1 : 2)} {unitShort} &middot;{" "}
            {nextZone ? (
              <>
                <span className="text-emerald-400 font-bold">
                  {fmt(zoneHeadroomIns, isMms ? 1 : 2)} {unitShort}
                </span>{" "}
                below the {nextZone.label} boundary at {fmt(readingZone.to, isMms ? 1 : 2)} {unitShort}
              </>
            ) : (
              <span className="text-red-400 font-bold">above the highest defined zone boundary</span>
            )}
          </span>
        </div>

        {/* Zone criteria — what each band permits, per ISO 20816 evaluation guidance */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {ISO_ZONES.map(zone => {
            const isCurrent = zone.zone === readingZone.zone;
            return (
              <div
                key={`criteria-${zone.zone}`}
                className={`rounded-lg border p-3 space-y-1.5 ${
                  isCurrent ? "bg-slate-900/70 border-slate-700" : "bg-slate-900/30 border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${zone.badge}`}>
                    ZONE {zone.zone}
                  </span>
                  {isCurrent && (
                    <span className="text-[9px] font-bold text-white uppercase tracking-widest">Current</span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 font-mono block">
                  {fmt(zone.from)}&ndash;{fmt(zone.to)} {unitLabel}
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">{zone.criteria}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== 3. Fault Probability Matrix ===== */}
      <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-yellow-400" />
          <span>Fault Probability Matrix</span>
        </h4>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[420px]">
            <thead>
              <tr className="border-b border-slate-800 text-[9px] text-slate-500 uppercase font-mono tracking-wider">
                <th className="py-2 pr-3 font-bold">Fault</th>
                <th className="py-2 px-3 font-bold">Probability</th>
                <th className="py-2 pl-3 font-bold text-right">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {FAULT_MATRIX.map(fault => (
                <tr key={fault.name} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-3 pr-3">
                    <span className="text-xs font-semibold text-slate-200 block">{fault.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{fault.code}</span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-[60px] h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-yellow-400 rounded-full"
                          style={{ width: `${fault.probability}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-200 font-mono w-9 text-right">
                        {fault.probability}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${SEVERITY_STYLES[fault.severity]}`}
                    >
                      {fault.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===== 4. Overall Vibration Trend ===== */}
      <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
            <LineChart className="h-4 w-4 text-yellow-400" />
            <span>Overall Vibration Trend</span>
          </h4>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded border text-[10px] font-bold font-mono flex items-center gap-1 ${
                trendRising
                  ? "bg-yellow-400/10 text-yellow-400 border-yellow-400/25"
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
              }`}
            >
              {trendRising ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              <span>
                {trendRising ? "+" : ""}
                {trendDelta.toFixed(1)}% vs {TREND_DATA[0].date}
              </span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono uppercase">Last 7 days</span>
          </div>
        </div>

        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="w-full h-56" role="img" aria-label="Overall vibration trend over the last 7 days">
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#facc15" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Horizontal gridlines + Y axis ticks */}
          {yTicks.map(tick => (
            <g key={tick}>
              <line
                x1={chart.left}
                y1={pointY(tick)}
                x2={chart.right}
                y2={pointY(tick)}
                stroke="#1e293b"
                strokeWidth="1"
                strokeDasharray={tick === 0 ? undefined : "4 4"}
              />
              <text x={chart.left - 10} y={pointY(tick) + 4} textAnchor="end" fill="#64748b" fontSize="11" fontFamily="monospace">
                {tick.toFixed(pointDecimals)}
              </text>
            </g>
          ))}

          {/* Y axis caption */}
          <text
            x="16"
            y={(chart.top + chart.bottom) / 2}
            fill="#94a3b8"
            fontSize="11"
            fontWeight="bold"
            textAnchor="middle"
            transform={`rotate(-90 16 ${(chart.top + chart.bottom) / 2})`}
          >
            {unitLabel}
          </text>

          {/* Area + line */}
          <path d={areaPath} fill="url(#trendFill)" />
          <path d={linePath} fill="none" stroke="#facc15" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

          {/* Data points and X axis labels */}
          {TREND_DATA.map((d, i) => {
            const displayVal = trendToDisplay(d.value);
            return (
              <g key={d.date}>
                <circle cx={pointX(i)} cy={pointY(displayVal)} r="4" fill="#0f172a" stroke="#facc15" strokeWidth="2.5" />
                <text x={pointX(i)} y={pointY(displayVal) - 12} textAnchor="middle" fill="#e2e8f0" fontSize="11" fontFamily="monospace" fontWeight="bold">
                  {displayVal.toFixed(pointDecimals)}
                </text>
                <text x={pointX(i)} y={chart.bottom + 26} textAnchor="middle" fill="#64748b" fontSize="11" fontFamily="monospace">
                  {d.date}
                </text>
              </g>
            );
          })}
        </svg>
      </section>
    </div>
  );
}

const EXPORT_FORMATS = [
  { id: "pdf", label: "PDF", hint: "Full technical report" },
  { id: "csv", label: "CSV", hint: "Raw measurement data" },
  { id: "excel", label: "Excel", hint: "Workbook with charts" }
];

/** Thermography — Tab 1: Analysis Results (ISO 18434-1) */
const IR_EMISSIVITY_PRESETS = [
  { label: "Painted Steel / PVC Tape (0.95)", value: "0.95" },
  { label: "Heavily Oxidized Copper (0.88)", value: "0.88" },
  { label: "Clean Brass / Bare Busbar (0.40)", value: "0.40" },
  { label: "Polished Aluminum (0.09)", value: "0.09" }
] as const;

const IR_MEASURED_LOAD_PERCENT = 88;
const IR_MEASURED_DELTA_T_F = 58.3;
/** I²R load normalization: ΔT_100% ≈ ΔT_meas × (100 / load%)² → 58.3 × (100/88)² ≈ 75.2°F */
const IR_PROJECTED_FULL_LOAD_DT_F = 75.2;

type IrViewMode = "thermal" | "visual" | "dual";

function ThermographyAnalysisResults({
  liveHotspot
}: {
  liveHotspot: string | null;
}) {
  const [emissivity, setEmissivity] = useState("0.95");
  const [irViewMode, setIrViewMode] = useState<IrViewMode>("thermal");

  return (
    <div className="space-y-6">
      {sampleDataBadge()}
      {/* ===== SECTION 1: Inspection Context Header ===== */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-3 text-xs text-slate-400 mb-6 pb-4 border-b border-slate-800">
        <div className="space-y-1 min-w-0">
          <p>
            <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">Asset</span>
            <span className="text-white font-semibold">Main MCC Panel A - Busbar Connection</span>
          </p>
          <p>
            <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">Inspector</span>
            J. Smith - Level II Thermographer
          </p>
        </div>
        <div className="space-y-2 lg:text-right shrink-0">
          <p>
            <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">Date</span>
            Oct 24, 2023
          </p>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <label className="inline-flex items-center gap-1.5">
              <span className="text-slate-500 uppercase tracking-wider font-bold">Emissivity</span>
              <input
                type="number"
                min="0.01"
                max="1"
                step="0.01"
                value={emissivity}
                onChange={(e) => setEmissivity(e.target.value)}
                className="w-16 bg-slate-950 border border-white/20 rounded px-1.5 py-1 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-yellow-500/60"
              />
            </label>
            <select
              aria-label="Material Preset Lookup"
              value={IR_EMISSIVITY_PRESETS.some((p) => p.value === emissivity) ? emissivity : ""}
              onChange={(e) => {
                if (e.target.value) setEmissivity(e.target.value);
              }}
              className="px-2 py-1 rounded text-xs bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 cursor-pointer focus:outline-none focus:border-cyan-400"
            >
              <option value="">Material Preset Lookup</option>
              {IR_EMISSIVITY_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
            <span className="text-slate-500">| Reflected Temp: 68°F</span>
          </div>
        </div>
      </div>

      {/* ===== SECTION 2: Key Thermal Metrics ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Hotspot Max</p>
          <p className="text-2xl font-bold text-red-500 leading-none">
            {liveHotspot ?? "—"}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            {liveHotspot ? "Max Temp" : "No thermography record on file"}
          </p>
        </div>
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Background Min</p>
          <p className="text-2xl font-bold text-blue-400 leading-none">84.2°F</p>
          <p className="text-xs text-slate-500 mt-2">Min Temp</p>
        </div>
        <div className="bg-slate-900/50 border border-orange-500/40 rounded-xl p-4 shadow-[0_0_20px_rgba(249,115,22,0.08)]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400/80 mb-2">
            Temperature Rise
          </p>
          <p className="text-2xl font-bold text-orange-500 leading-none">58.3°F</p>
          <p className="text-xs text-slate-400 mt-2">Delta-T (ΔT)</p>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400/80 mb-2">
            ISO 18434-1 Zone
          </p>
          <p className="text-2xl font-bold text-orange-500 leading-none">SERIOUS</p>
          <p className="text-xs text-orange-400/70 mt-2">Severity</p>
        </div>
      </div>

      {/* Load + I²R projected full-load ΔT */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Load</p>
          <p className="text-sm font-bold text-slate-200 font-mono">
            {IR_MEASURED_LOAD_PERCENT}% of rated duty
          </p>
          <p className="text-[10px] text-slate-500 mt-1">Measured operating current ratio</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-xs text-red-400 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-red-400/80 mb-1">
            I²R Projected Full-Load ΔT
          </p>
          <p className="text-sm font-bold font-mono text-red-400">
            {IR_PROJECTED_FULL_LOAD_DT_F.toFixed(1)}°F (CRITICAL)
          </p>
          <p className="text-[10px] text-red-400/70 mt-1">
            Scales with square of electrical load current.
          </p>
        </div>
      </div>

      {/* ===== SECTION 3: Thermal Image & Isotherm Analysis ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-bold text-white">Thermal Image &amp; Isotherm Analysis</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              { id: "thermal" as const, label: "Thermal View" },
              { id: "visual" as const, label: "Visual Light Photo" },
              { id: "dual" as const, label: "Dual / PiP Overlay" }
            ]).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setIrViewMode(option.id)}
                className={`px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer ${
                  irViewMode === option.id
                    ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-6">
          {/* Left — thermal image placeholder (view mode toggles UI state only) */}
          <div className="space-y-2">
            <div className="h-80 bg-slate-950 rounded-lg border border-white/10 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-purple-900 to-red-600 opacity-80" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="w-16 h-16 rounded-full bg-red-500/40 border-2 border-red-400 shadow-[0_0_30px_rgba(239,68,68,0.7)] animate-pulse" />
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded bg-slate-950/90 border border-red-500/50 text-[11px] font-bold text-red-400">
                  {liveHotspot ?? "—"}
                </div>
              </div>
              <div className="absolute right-3 top-4 bottom-4 w-3 rounded-full overflow-hidden border border-white/20 flex flex-col">
                <div className="flex-1 bg-gradient-to-b from-red-500 via-yellow-400 to-blue-600" />
              </div>
              <div className="absolute right-8 top-4 text-[9px] font-mono text-red-300">142°</div>
              <div className="absolute right-8 bottom-4 text-[9px] font-mono text-blue-300">84°</div>
              <p className="absolute left-3 bottom-3 text-[10px] font-bold uppercase tracking-wider text-white/70">
                IR Frame · MCC-A Busbar · ε {emissivity}
              </p>
              <span className="absolute top-3 left-3 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-950/80 border border-cyan-500/40 text-cyan-400">
                {irViewMode === "thermal"
                  ? "Thermal View"
                  : irViewMode === "visual"
                    ? "Visual Light Photo"
                    : "Dual / PiP Overlay"}
              </span>
            </div>
          </div>

          {/* Right — hotspot data */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-white">Isotherm Analysis</h4>
            <ul className="space-y-3">
              <li className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5">
                <span className="inline-flex items-center gap-2 text-sm text-slate-200">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                  Point 1: Busbar Phase B
                </span>
                <span className="text-sm font-bold text-red-400 font-mono">
                  {liveHotspot ?? "—"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5">
                <span className="inline-flex items-center gap-2 text-sm text-slate-200">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Point 2: Busbar Phase A
                </span>
                <span className="text-sm font-bold text-emerald-400 font-mono">92.1°F</span>
              </li>
              <li className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5">
                <span className="inline-flex items-center gap-2 text-sm text-slate-200">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Point 3: Busbar Phase C
                </span>
                <span className="text-sm font-bold text-emerald-400 font-mono">88.4°F</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400/80 mb-1">
              Phase-to-Phase ΔT
            </p>
            <p className="text-sm font-mono text-cyan-400 font-bold">50.4°F (vs. Phase A)</p>
          </div>
          <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400/80 mb-1">
              Rise Over Ambient ΔT
            </p>
            <p className="text-sm font-mono text-orange-500 font-bold">58.3°F (vs. Background)</p>
          </div>
        </div>
      </section>

      {/* ===== SECTION 4: Temperature Profile Graph ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-1">Temperature Profile (Horizontal Scan)</h3>
        <p className="text-xs text-slate-500 mb-4">
          Line profile across the busbar — Phase B hotspot spike highlighted
        </p>
        <p className="rounded-lg border border-slate-700/60 bg-slate-950/50 px-4 py-6 text-center text-xs text-slate-400">
          No line-scan profile is stored on thermography records, so no temperature
          traverse can be plotted.
        </p>
      </section>

      {/* ===== SECTION 5: Diagnostic Summary & Recommendations ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-3">Thermal Diagnostic Summary</h3>
        <p className="text-sm text-slate-300 leading-relaxed mb-5">
          Thermographic inspection reveals a thermal anomaly on the Phase B busbar connection within MCC Panel A.
          The rise-over-ambient ΔT of 58.3°F (32.4°C) falls in the NETA Serious band (21–40°C) — schedule repair at
          the next planned maintenance window. Phase-to-phase ΔT of 50.4°F vs. Phase A supports a high-resistance
          connection from loose hardware or corrosion.
        </p>
        <h4 className="text-sm font-bold text-yellow-500 mb-3 uppercase tracking-wider">Action Plan</h4>
        <ol className="space-y-2.5 list-decimal list-inside text-sm text-slate-300">
          <li>Schedule de-energization at next planned outage for torque verification.</li>
          <li>Inspect busbar surfaces for oxidation/pitting.</li>
          <li>Apply thermal compound and retorque to manufacturer specs upon reassembly.</li>
        </ol>
      </section>

<button
        type="button"
        onClick={() => {
          const reportData = {
            title: "NFPA 70B Compliance Certificate",
            content: "Inspected in full compliance with NFPA 70B Chapter 9 & ISO 18434-1 standards by Level II Thermographer. Asset assessed under live operating load.",
            timestamp: new Date().toISOString()
          };
          const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `NFPA70B-Compliance-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }}
        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 mb-4 cursor-pointer transition-colors"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2H7a2 2 0 01-2-2v-5.586a1 1 0 00-.293-.707L7.707 7.707a1 1 0 010-1.414L12.293 3.293A1 1 0 0113.707 4H17a2 2 0 012 2v8a2 2 0 01-2 2h-2v2" />
        </svg>
        Export NFPA 70B Compliance Certificate
      </button>
      </div>
    );
  }

function thermalSeverityBadge(severity: ThermalSeverity) {
  if (severity === "CRITICAL") {
    return "bg-red-500/15 border-red-500/40 text-red-400";
  }
  if (severity === "WARNING") {
    return "bg-yellow-500/15 border-yellow-500/40 text-yellow-400";
  }
  return "bg-emerald-500/15 border-emerald-500/40 text-emerald-400";
}

function thermalHistoryDot(tone: "red" | "yellow" | "green") {
  if (tone === "red") return "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.7)]";
  if (tone === "yellow") return "bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.6)]";
  return "bg-emerald-500";
}

type ThermalPaletteId = "ironbow" | "rainbow" | "white-hot" | "black-hot";

const THERMAL_PALETTE_OPTIONS: { id: ThermalPaletteId; label: string }[] = [
  { id: "ironbow", label: "Ironbow" },
  { id: "rainbow", label: "Rainbow" },
  { id: "white-hot", label: "White-Hot" },
  { id: "black-hot", label: "Black-Hot" }
];

function thermalPaletteClass(palette: ThermalPaletteId): string {
  if (palette === "rainbow") {
    return "bg-gradient-to-br from-blue-500 via-green-500 via-yellow-500 to-red-500";
  }
  if (palette === "white-hot") return "bg-gradient-to-br from-black to-white";
  if (palette === "black-hot") return "bg-gradient-to-br from-white to-black";
  return "bg-gradient-to-br from-blue-900 via-purple-800 to-red-600";
}

/** Rainbow needs a true multi-stop gradient; Tailwind only honors one `via`, so use inline style. */
function thermalPaletteStyle(palette: ThermalPaletteId): React.CSSProperties | undefined {
  if (palette === "rainbow") {
    return {
      backgroundImage: "linear-gradient(to bottom right, #3b82f6, #22c55e, #eab308, #ef4444)"
    };
  }
  return undefined;
}

/** Thermography — Tab 2: Thermal Image Library (FLIR-style archive) */
function ThermographyDataLibrary({ onUpload }: { onUpload?: () => void }) {
  const [librarySearch, setLibrarySearch] = useState("");
  const [dateFilter, setDateFilter] = useState("30");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [isothermFilter, setIsothermFilter] = useState("all");
  const [thermalPalette, setThermalPalette] = useState<ThermalPaletteId>("ironbow");
  void dateFilter;

  const filtered = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    return THERMAL_LIBRARY_IMAGES.filter((img) => {
      const severityOk =
        severityFilter === "all" || img.severity.toLowerCase() === severityFilter;
      const isothermOk = isothermFilter !== "isotherms" || img.hasIsotherm;
      const searchOk =
        !q ||
        img.asset.toLowerCase().includes(q) ||
        img.location.toLowerCase().includes(q) ||
        img.severity.toLowerCase().includes(q);
      return severityOk && isothermOk && searchOk;
    });
  }, [librarySearch, severityFilter, isothermFilter]);

  const paletteGradient = thermalPaletteClass(thermalPalette);
  const paletteStyle = thermalPaletteStyle(thermalPalette);

  return (
    <div className="space-y-6">
      {sampleDataBadge()}
      {/* ===== SECTION 1: Library Header & Filters ===== */}
      <div className="flex flex-col xl:flex-row xl:justify-between xl:items-center mb-6 gap-4">
        <div className="relative flex-1 min-w-0 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          <input
            type="search"
            value={librarySearch}
            onChange={(e) => setLibrarySearch(e.target.value)}
            placeholder="Search by location, component, or fault type..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-yellow-500 outline-none transition-all"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="appearance-none bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-9 py-2.5 text-xs font-bold text-slate-200 cursor-pointer focus:outline-none focus:border-yellow-500"
            >
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
              <option value="365">Last Year</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="appearance-none bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-9 py-2.5 text-xs font-bold text-slate-200 cursor-pointer focus:outline-none focus:border-yellow-500"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="normal">Normal</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={isothermFilter}
              onChange={(e) => setIsothermFilter(e.target.value)}
              className="appearance-none bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-9 py-2.5 text-xs font-bold text-slate-200 cursor-pointer focus:outline-none focus:border-yellow-500"
            >
              <option value="all">All Frames</option>
              <option value="isotherms">Show Isotherms Only</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          </div>
          <button
            type="button"
            onClick={onUpload}
            disabled={!onUpload}
            title={onUpload ? undefined : PENDING_UPLOAD}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-yellow-500 text-slate-900 text-xs font-bold transition-colors ${
              onUpload
                ? "hover:bg-yellow-400 cursor-pointer shadow-[0_0_15px_rgba(234,179,8,0.25)]"
                : PENDING_BTN
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Thermal Image
          </button>
        </div>
      </div>

      {/* ===== SECTION 2: Thermal Image Gallery Grid ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Thermal Image Gallery</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {filtered.length} frame{filtered.length === 1 ? "" : "s"} · palette preview
            </p>
          </div>
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
              Thermal Palette
            </span>
            <div className="flex flex-wrap gap-1.5">
              {THERMAL_PALETTE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setThermalPalette(option.id)}
                  className={`px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer ${
                    thermalPalette === option.id
                      ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((img) => (
            <article
              key={img.id}
              className="rounded-xl border border-white/10 bg-slate-950/40 overflow-hidden hover:border-yellow-500/40 transition-all cursor-pointer group"
            >
              <div className="h-48 bg-slate-950 rounded-lg border border-slate-800 relative overflow-hidden m-0">
                <div
                  className={`absolute inset-0 opacity-90 group-hover:opacity-100 transition-opacity ${paletteGradient}`}
                  style={paletteStyle}
                />
                {/* Isotherm measurement spot overlay */}
                {img.hasIsotherm && (
                  <div
                    className={`absolute ${img.hotspotPos ?? "left-1/2 top-1/2"} -translate-x-1/2 -translate-y-1/2`}
                  >
                    <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/80 shadow-[0_0_18px_rgba(255,255,255,0.35)]" />
                    <div className="absolute inset-2 rounded-full bg-red-500/40 border border-red-300/80 shadow-[0_0_16px_rgba(239,68,68,0.7)]" />
                  </div>
                )}
                <span className="absolute top-2 left-2 bg-slate-900/80 text-slate-300 text-xs px-2 py-1 rounded">
                  {img.date}
                </span>
                <span className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-1 rounded font-bold">
                  {img.maxTemp}°F
                </span>
                <div className="absolute right-2 top-10 bottom-3 w-1.5 rounded-full overflow-hidden border border-white/20">
                  <div
                    className={`h-full ${paletteGradient}`}
                    style={paletteStyle}
                  />
                </div>
              </div>
              <div className="p-3 space-y-1.5">
                <p className="text-sm font-bold text-white truncate">{img.asset}</p>
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="text-xs font-bold text-yellow-500">ΔT: {img.deltaT}°F</span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${thermalSeverityBadge(img.severity)}`}
                  >
                    {img.severity}
                  </span>
                </div>
              </div>
            </article>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full text-center text-sm text-slate-500 py-10">
              No thermal images match the current filters.
            </p>
          )}
        </div>
      </section>

      {/* ===== SECTION 3: Side-by-Side Comparison ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-1">Trend Comparison (Emissivity Corrected)</h3>
        <p className="text-xs text-slate-500 mb-4">
          FLIR-style side-by-side — previous cooler frame vs current Phase B hotspot
        </p>
        <div className="relative grid grid-cols-1 md:grid-cols-2 rounded-xl overflow-hidden border border-slate-800">
          {/* Previous — cooler blue/purple */}
          <div className="relative h-56 md:h-64 bg-slate-950 border-b md:border-b-0 md:border-r border-slate-800">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-950 via-indigo-900 to-purple-800 opacity-90" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full border-2 border-dashed border-white/50 bg-blue-400/20" />
            <span className="absolute top-3 left-3 bg-slate-900/85 text-slate-200 text-xs font-bold px-2 py-1 rounded">
              Previous Reading (Oct 10)
            </span>
            <span className="absolute top-3 right-3 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">
              108°F
            </span>
          </div>
          {/* Current — follows selected thermal palette */}
          <div className="relative h-56 md:h-64 bg-slate-950">
            <div
              className={`absolute inset-0 opacity-95 ${paletteGradient}`}
              style={paletteStyle}
            />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-white via-red-400 to-red-700 shadow-[0_0_36px_rgba(255,255,255,0.45)] border border-white/70" />
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-white/90" />
            </div>
            <span className="absolute top-3 left-3 bg-slate-900/85 text-slate-200 text-xs font-bold px-2 py-1 rounded">
              Current Reading (Oct 24)
            </span>
            <span className="absolute top-3 right-3 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded">
              142°F
            </span>
          </div>
          <div className="hidden md:block absolute inset-y-0 left-1/2 w-px bg-yellow-500/70 z-10 pointer-events-none" />
        </div>
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              ΔT Phase-to-Phase
            </p>
            <p className="text-sm font-bold font-mono text-orange-500">50.4°F</p>
            <p className="text-[10px] text-slate-500 mt-1 leading-snug">
              Hotspot (Phase B) vs. Healthy Phase (Phase A)
            </p>
          </div>
          <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              ΔT Over Ambient
            </p>
            <p className="text-sm font-bold font-mono text-red-500">58.3°F</p>
            <p className="text-[10px] text-slate-500 mt-1 leading-snug">
              Hotspot vs. Ambient Air Temp (84.2°F)
            </p>
          </div>
          <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              ΔT Historical
            </p>
            <p className="text-sm font-bold font-mono text-yellow-500">+12.5°F Increase</p>
            <p className="text-[10px] text-slate-500 mt-1 leading-snug">
              vs. Last Month&apos;s Scan (Identical 88% Load)
            </p>
          </div>
        </div>
      </section>

      {/* ===== SECTION 4: Thermal Fault History Timeline ===== */}
      <section className="bg-slate-900/50 border border-white/20 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-5">Thermal Fault History (ISO 18434-1)</h3>
        <div className="relative pl-8">
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-700" />
          <ul className="space-y-5">
            {THERMAL_FAULT_HISTORY.map((item) => (
              <li key={item.date} className="relative flex items-start gap-4">
                <span
                  className={`absolute -left-8 top-1.5 w-3 h-3 rounded-full border-2 border-slate-950 ${thermalHistoryDot(item.tone)}`}
                />
                <div className="flex-1 rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{item.date}</p>
                  <p className="text-sm font-bold text-white mt-0.5">{item.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

const THERMAL_REPAIR_STEPS = [
  "De-energize MCC Panel A and follow LOTO procedures.",
  "Inspect Phase B busbar connection for oxidation, pitting, or discoloration.",
  "Clean contact surfaces with electrical contact cleaner.",
  "Apply no-oxide thermal compound to busbar interfaces.",
  "Retorque bolts to manufacturer specification (e.g., 25 ft-lbs) using a calibrated torque wrench.",
  "Perform follow-up thermographic scan under load to verify ΔT < 10°C."
];

/** Thermography — Tab 3: Repair & Actions (NETA / ANSI) */
function ThermographyRepairActions({
  onCreateWorkOrder,
  onExportPdf,
  onEmailManager
}: {
  onCreateWorkOrder: () => void;
  onExportPdf: () => void;
  onEmailManager?: () => void;
}) {
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});

  const toggleStep = (index: number) => {
    setCheckedSteps((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="space-y-6">
      {/* ===== SECTION 1: Severity Assessment (NETA) ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Thermal Severity Assessment</h3>
            <p className="text-xs text-slate-500 mt-0.5">NETA / ANSI ΔT criteria for electrical connections</p>
          </div>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border border-orange-500/40 bg-orange-500/10 text-orange-400">
            Serious
          </span>
        </div>

        {/* Zone bar — 32.4°C sits in Serious (21–40°C), not Critical (>40°C) */}
        <div className="relative pt-10 pb-2">
          <div className="absolute top-0 left-[62%] -translate-x-1/2 flex flex-col items-center z-10 max-w-[280px]">
            <span className="text-[10px] font-bold text-orange-400 text-center leading-tight mb-1 px-1.5 py-0.5 rounded bg-slate-950/90 border border-orange-500/40">
              Current ΔT: 58.3°F (32.4°C) — SERIOUS: Repair at next scheduled maintenance.
            </span>
            <span className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-orange-500" />
          </div>

          <div className="h-8 rounded-lg overflow-hidden flex border border-slate-700">
            <div className="w-[20%] bg-emerald-500/80 flex items-center justify-center">
              <span className="text-[9px] font-bold text-slate-950 uppercase tracking-wide hidden sm:block">
                Normal
              </span>
            </div>
            <div className="w-[20%] bg-yellow-500/85 flex items-center justify-center">
              <span className="text-[9px] font-bold text-slate-950 uppercase tracking-wide hidden sm:block text-center px-1">
                Monitor
              </span>
            </div>
            <div className="w-[40%] bg-orange-500/90 flex items-center justify-center relative">
              <span className="text-[9px] font-bold text-white uppercase tracking-wide hidden sm:block text-center px-1">
                Serious
              </span>
              <span className="absolute left-[55%] top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
            </div>
            <div className="w-[20%] bg-red-500/90 flex items-center justify-center">
              <span className="text-[9px] font-bold text-white uppercase tracking-wide hidden sm:block text-center px-1">
                Critical
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-[10px] font-mono">
            <span className="text-emerald-400">Normal: &lt;18°F (&lt;10°C)</span>
            <span className="text-yellow-500">Monitor: 19°F – 36°F (11°C – 20°C)</span>
            <span className="text-orange-400">Serious: 37°F – 72°F (21°C – 40°C)</span>
            <span className="text-red-400">Critical: &gt;72°F (&gt;40°C)</span>
          </div>
        </div>
      </section>

      {/* ===== SECTION 2: Recommended Repair Procedure ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-1">Recommended Repair Procedure</h3>
        <p className="text-xs text-slate-500 mb-4">Technician checklist — mark steps as completed in the field</p>
        <div className="w-full bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4 flex items-start gap-3">
          <AlertTriangle className="h-7 w-7 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm font-bold text-white leading-snug">
            Required PPE Level: NFPA 70E Category 2 / 4 Arc Flash Suit required prior to removing MCC Panel A cover.
          </p>
        </div>
        <ul className="space-y-2.5">
          {THERMAL_REPAIR_STEPS.map((step, index) => {
            const on = Boolean(checkedSteps[index]);
            return (
              <li key={step}>
                <button
                  type="button"
                  onClick={() => toggleStep(index)}
                  className={`w-full flex items-start gap-3 text-left rounded-lg border px-3 py-2.5 cursor-pointer transition-all ${
                    on
                      ? "border-yellow-500/50 bg-yellow-500/10"
                      : "border-slate-800 bg-slate-950/40 hover:border-yellow-500/30"
                  }`}
                >
                  <span
                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      on
                        ? "bg-yellow-500 border-yellow-500 text-slate-900"
                        : "border-slate-600 bg-slate-950"
                    }`}
                  >
                    {on ? <Check className="w-3.5 h-3.5" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider">
                      Step {index + 1}
                    </span>
                    <p className={`text-sm mt-0.5 ${on ? "text-slate-200 line-through decoration-slate-600" : "text-slate-300"}`}>
                      {step}
                    </p>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ===== SECTION 3: Required Parts & Tools ===== */}
      <section className="bg-slate-900/50 border border-white/20 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-4">Required Parts &amp; Tools</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-500 mb-3">Parts</p>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-1">•</span>
                Thermal Compound (No-Ox-ID)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-1">•</span>
                Replacement Busbar (if pitted)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-1">•</span>
                Torque Wrench (10-50 ft-lbs)
              </li>
            </ul>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-500 mb-3">Tools</p>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-1">•</span>
                Infrared Camera (FLIR E8 or equivalent)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-1">•</span>
                LOTO Kit
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-1">•</span>
                Multimeter
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ===== SECTION 4: Cost of Delay ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-5 w-5 text-yellow-500" />
          <h3 className="text-lg font-bold text-white">Financial Impact of Delay</h3>
        </div>
        <div className="flex flex-row justify-between gap-4 items-center flex-wrap sm:flex-nowrap">
          <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3 flex-1 min-w-[120px]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Power Wasted</p>
            <p className="text-sm font-bold font-mono text-yellow-500">450 Watts</p>
          </div>
          <span className="text-slate-500 text-xl shrink-0" aria-hidden>
            →
          </span>
          <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3 flex-1 min-w-[120px]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Annual Loss</p>
            <p className="text-sm font-bold font-mono text-red-500">$473 / yr</p>
          </div>
          <span className="text-slate-500 text-xl shrink-0" aria-hidden>
            →
          </span>
          <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3 flex-1 min-w-[120px]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">CO₂ Wasted</p>
            <p className="text-sm font-bold font-mono text-green-400">2.8 Metric Tons / yr</p>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mt-4">
          Data available for corporate ESG and carbon reduction reporting.
        </p>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-xs text-red-400 mt-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-red-400/80 mb-1">
            I²R Projected Full-Load ΔT
          </p>
          <p className="text-sm font-mono text-red-400 font-bold">
            {IR_PROJECTED_FULL_LOAD_DT_F.toFixed(1)}°F (CRITICAL)
          </p>
          <p className="text-[10px] text-red-400/70 mt-1">
            58.3°F @ 88% load → scales with square of electrical load current.
          </p>
        </div>
      </section>

      {/* ===== SECTION 5: Actions / Report Distribution ===== */}
      <button
        type="button"
        onClick={() => {
          const reportData = {
            title: "NFPA 70B Compliance Certificate",
            content: "Inspected in full compliance with NFPA 70B Chapter 9 & ISO 18434-1 standards by Level II Thermographer. Asset assessed under live operating load.",
            timestamp: new Date().toISOString()
          };
          const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `NFPA70B-Compliance-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }}
        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 mb-4 cursor-pointer transition-colors"
      >
        <FileText className="h-4 w-4" />
        Export NFPA 70B Compliance Certificate
      </button>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onCreateWorkOrder}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 text-xs font-bold cursor-pointer transition-colors shadow-[0_0_15px_rgba(234,179,8,0.25)]"
        >
          <Wrench className="h-3.5 w-3.5" />
          Create Work Order
        </button>
        <button
          type="button"
          onClick={onExportPdf}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/30 bg-transparent hover:border-yellow-500/50 text-slate-200 text-xs font-bold cursor-pointer transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Export PDF Report
        </button>
        <button
          type="button"
          onClick={onEmailManager}
          disabled={!onEmailManager}
          title={onEmailManager ? undefined : PENDING_EMAIL}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/30 bg-transparent text-slate-200 text-xs font-bold transition-colors ${
            onEmailManager ? "hover:border-yellow-500/50 cursor-pointer" : PENDING_BTN
          }`}
        >
          <Mail className="h-3.5 w-3.5" />
          Email Facility Manager
        </button>
      </div>
    </div>
  );
}

/** Ultrasound — Tab 1: Analysis Results */
function UltrasoundAnalysisResults() {
  const [showLineHarmonics, setShowLineHarmonics] = useState(false);
  const [showShaftHarmonics, setShowShaftHarmonics] = useState(false);
  const fftXMax = showLineHarmonics || showShaftHarmonics ? 190 : 60;

  return (
    <div className="space-y-6">
      {sampleDataBadge()}
      {/* ===== SECTION 1: Inspection Context Header ===== */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-3 text-xs text-slate-400 mb-6 pb-4 border-b border-slate-800">
        <div className="space-y-1 min-w-0">
          <p>
            <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">Asset</span>
            <span className="text-white font-semibold">Compressed Air Header - Valve Station 4</span>
          </p>
          <p>
            <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">Inspector</span>
            M. Davis - Level I Ultrasound Tech
          </p>
        </div>
        <div className="space-y-2 lg:text-right shrink-0">
          <p>
            <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">Date</span>
            Oct 25, 2023
          </p>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <p>
              <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">Settings</span>
              Freq: 40 kHz | Gain: 18 dB | Mode: Heterodyne
            </p>
            <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-slate-800 text-cyan-400 border border-cyan-500/30">
              Probe: Airborne Parabolic Dish
            </span>
          </div>
        </div>
      </div>

      {/* ===== SECTION 2: Key Ultrasound Metrics ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Peak Intensity</p>
          <p className="text-2xl font-bold text-yellow-500 leading-none">48.2 dBµV</p>
          <p className="text-xs text-slate-500 mt-2">Peak dBµV</p>
        </div>
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">RMS Level</p>
          <p className="text-2xl font-bold text-slate-300 leading-none">32.5 dBµV</p>
          <p className="text-xs text-slate-500 mt-2">RMS dBµV</p>
        </div>
        <div className="bg-slate-900/50 border border-yellow-500/30 rounded-lg p-3 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            ΔdB Over Baseline
          </p>
          <p className="text-2xl font-bold text-orange-500 leading-none">+15.7 dB</p>
          <p className="text-[10px] text-slate-500 mt-2 leading-snug">
            ASTM E1002: &gt;12 dB indicates minor bearing failure / surface degradation.
          </p>
        </div>
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Crest Factor</p>
          <p className="text-2xl font-bold text-cyan-400 leading-none">6.10</p>
          <p className="text-[10px] text-slate-500 mt-2 leading-snug" title="10^((Peak − RMS)/20)">
            Calculated via 10^((Peak − RMS)/20). A CF of 6.10 indicates spiky impact noise (leaks/bearing damage).
          </p>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-500/80 mb-2">
            Automated Classification
          </p>
          <p className="text-xl font-bold text-yellow-500 leading-none">LEAK DETECTED</p>
          <p className="text-xs text-yellow-500/70 mt-2">Diagnosis</p>
        </div>
      </div>

      {/* ===== SECTION 3: Waveform & Spectrum Analysis ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-4">Waveform &amp; Spectrum Analysis</h3>
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
          <div>
            <p className="text-sm font-bold text-white mb-2">Time Waveform (0-100ms)</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={US_WAVEFORM_DATA} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="usWaveFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#eab308" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#eab308" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgb(30 41 59)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="ms"
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={{ stroke: "#334155" }}
                    tickLine={false}
                    unit="ms"
                  />
                  <YAxis
                    domain={[0, 55]}
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={{ stroke: "#334155" }}
                    tickLine={false}
                    unit=" dB"
                    width={44}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 8,
                      fontSize: 12
                    }}
                    formatter={(value: number) => [`${value} dBµV`, "Amplitude"]}
                    labelFormatter={(v) => `t = ${v} ms`}
                  />
                  <Area
                    type="monotone"
                    dataKey="amp"
                    stroke="#eab308"
                    strokeWidth={2}
                    fill="url(#usWaveFill)"
                    fillOpacity={1}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-sm font-bold text-white">Frequency Spectrum (FFT)</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowLineHarmonics((prev) => !prev)}
                  className={`px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer ${
                    showLineHarmonics
                      ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}
                >
                  60Hz/120Hz Line Harmonics
                </button>
                <button
                  type="button"
                  onClick={() => setShowShaftHarmonics((prev) => !prev)}
                  className={`px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer ${
                    showShaftHarmonics
                      ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}
                >
                  Shaft Speed Harmonics
                </button>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart data={US_SPECTRUM_DATA} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="rgb(30 41 59)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="khz"
                    type="number"
                    domain={[20, fftXMax]}
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={{ stroke: "#334155" }}
                    tickLine={false}
                    unit="kHz"
                  />
                  <YAxis
                    domain={[0, 55]}
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={{ stroke: "#334155" }}
                    tickLine={false}
                    unit=" dB"
                    width={44}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 8,
                      fontSize: 12
                    }}
                    formatter={(value: number) => [`${value} dBµV`, "Level"]}
                    labelFormatter={(v) => `${v} kHz`}
                  />
                  <ReferenceLine
                    x={40}
                    stroke="#22d3ee"
                    strokeDasharray="4 4"
                    label={{ value: "40 kHz", fill: "#22d3ee", fontSize: 10, position: "insideTopRight" }}
                  />
                  {showLineHarmonics && (
                    <>
                      <ReferenceLine
                        x={60}
                        stroke="#ef4444"
                        strokeDasharray="3 3"
                        label={{ value: "60 Hz", fill: "#ef4444", fontSize: 9, position: "insideTopLeft" }}
                      />
                      <ReferenceLine
                        x={120}
                        stroke="#ef4444"
                        strokeDasharray="3 3"
                        label={{ value: "120 Hz", fill: "#ef4444", fontSize: 9, position: "insideTopLeft" }}
                      />
                    </>
                  )}
                  {showShaftHarmonics && (
                    <>
                      <ReferenceLine
                        x={59.2}
                        stroke="#eab308"
                        strokeDasharray="3 3"
                        label={{ value: "1X", fill: "#eab308", fontSize: 9, position: "insideTopLeft" }}
                      />
                      <ReferenceLine
                        x={118.4}
                        stroke="#eab308"
                        strokeDasharray="3 3"
                        label={{ value: "2X", fill: "#eab308", fontSize: 9, position: "insideTopLeft" }}
                      />
                      <ReferenceLine
                        x={177.6}
                        stroke="#eab308"
                        strokeDasharray="3 3"
                        label={{ value: "3X", fill: "#eab308", fontSize: 9, position: "insideTopLeft" }}
                      />
                    </>
                  )}
                  <Line
                    type="monotone"
                    dataKey="db"
                    stroke="#22d3ee"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#22d3ee" }}
                    activeDot={{ r: 5 }}
                  />
                </RechartsLineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SECTION 4: dBµV Trend Over Time ===== */}
      <section className="bg-slate-900/50 border border-white/20 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-1">Historical dBµV Trend (Last 6 Months)</h3>
        <p className="text-xs text-slate-500 mb-4">
          Progressive rise toward leak threshold — Valve Station 4
        </p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart data={US_TREND_DATA} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="rgb(30 41 59)" strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
              />
              <YAxis
                domain={[20, 55]}
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
                unit=" dB"
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  fontSize: 12
                }}
                formatter={(value: number) => [`${value} dBµV`, "Level"]}
              />
              <ReferenceLine
                y={35}
                stroke="#ef4444"
                strokeDasharray="5 5"
                label={{ value: "Leak Threshold", fill: "#ef4444", fontSize: 10, position: "insideTopLeft" }}
              />
              <Line
                type="monotone"
                dataKey="db"
                stroke="#eab308"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#eab308" }}
                activeDot={{ r: 6 }}
              />
            </RechartsLineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ===== SECTION 5: Diagnostic Summary & Recommendations ===== */}
      <section className="bg-slate-900/50 border border-white/20 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-3">Ultrasound Diagnostic Summary</h3>
        <p className="text-sm text-slate-300 leading-relaxed mb-5">
          Ultrasound inspection at Valve Station 4 reveals a distinct high-frequency hiss pattern measuring
          48.2 dBµV. The broad-spectrum nature of the signal and the crest factor of 6.10 are characteristic of
          turbulent flow, strongly indicating a compressed air leak downstream of the valve seat.
        </p>
        <h4 className="text-sm font-bold text-yellow-500 mb-3 uppercase tracking-wider">Action Plan</h4>
        <ol className="space-y-2.5 list-decimal list-inside text-sm text-slate-300">
          <li>Apply ultrasonic leak detection soap or flow meter to quantify loss.</li>
          <li>Schedule valve repair or replacement during next shutdown.</li>
          <li>Estimated annual energy loss: ~$7,190 based on 1/8&quot; equivalent orifice (US DOE compressed-air formula).</li>
        </ol>
      </section>
    </div>
  );
}

function usClassBadge(classification: UsClass) {
  if (classification === "LEAK") return "bg-red-500/15 border-red-500/40 text-red-400";
  if (classification === "NORMAL") return "bg-emerald-500/15 border-emerald-500/40 text-emerald-400";
  if (classification === "BEARING") return "bg-cyan-500/15 border-cyan-500/40 text-cyan-400";
  if (classification === "ARCING") return "bg-yellow-500/15 border-yellow-500/40 text-yellow-400";
  return "bg-blue-500/15 border-blue-500/40 text-blue-400";
}

/** Ultrasound — Tab 2: Waveform & Audio Library */
function UltrasoundDataLibrary({
  onUpload,
  onView,
  onCompare
}: {
  onUpload?: () => void;
  onView?: (name: string) => void;
  onCompare?: (name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [faultFilter, setFaultFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("30");
  const [selectedId, setSelectedId] = useState(US_LIBRARY_RECORDINGS[0].id);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(28);
  const [speed, setSpeed] = useState("1x");
  const [ueViewMode, setUeViewMode] = useState<"waveform" | "fft" | "spectrogram">("waveform");
  const [isComparing, setIsComparing] = useState(false);
  const [crossfade, setCrossfade] = useState(50);
  const [baselinePlaying, setBaselinePlaying] = useState(false);
  const [hotspotPlaying, setHotspotPlaying] = useState(false);
  void dateFilter;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return US_LIBRARY_RECORDINGS.filter((row) => {
      const faultOk =
        faultFilter === "all" ||
        row.faultKey === faultFilter ||
        (faultFilter === "normal" && row.classification === "NORMAL");
      const searchOk =
        !q ||
        row.asset.toLowerCase().includes(q) ||
        row.location.toLowerCase().includes(q) ||
        row.classification.toLowerCase().includes(q);
      return faultOk && searchOk;
    });
  }, [search, faultFilter]);

  const selected = US_LIBRARY_RECORDINGS.find((r) => r.id === selectedId) ?? US_LIBRARY_RECORDINGS[0];

  return (
    <div className="space-y-6 pb-28">
      {sampleDataBadge()}
      {/* ===== SECTION 1: Library Header & Filters ===== */}
      <div className="flex flex-col xl:flex-row xl:justify-between xl:items-center mb-6 gap-4">
        <div className="relative flex-1 min-w-0 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by asset, location, or recording name..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-yellow-500 outline-none transition-all"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={faultFilter}
              onChange={(e) => setFaultFilter(e.target.value)}
              className="appearance-none bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-9 py-2.5 text-xs font-bold text-slate-200 cursor-pointer focus:outline-none focus:border-yellow-500"
            >
              <option value="all">All Fault Types</option>
              <option value="leak">Compressed Air Leak</option>
              <option value="bearing">Bearing Fault</option>
              <option value="arcing">Electrical Arcing</option>
              <option value="steam">Steam Trap</option>
              <option value="normal">Normal</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="appearance-none bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-9 py-2.5 text-xs font-bold text-slate-200 cursor-pointer focus:outline-none focus:border-yellow-500"
            >
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
              <option value="all">All Time</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          </div>
          <button
            type="button"
            onClick={onUpload}
            disabled={!onUpload}
            title={onUpload ? undefined : PENDING_UPLOAD}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-yellow-500 text-slate-900 text-xs font-bold transition-colors ${
              onUpload
                ? "hover:bg-yellow-400 cursor-pointer shadow-[0_0_15px_rgba(234,179,8,0.25)]"
                : PENDING_BTN
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Recording
          </button>
        </div>
      </div>

      {/* ===== SECTION 2: Recording List ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Waveform &amp; Audio Library</h3>
          <p className="text-xs text-slate-500">{filtered.length} recording{filtered.length === 1 ? "" : "s"}</p>
        </div>
        <table className="w-full text-left border-collapse min-w-[720px]">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800">
              <th className="py-2.5 pr-3 font-bold">Play</th>
              <th className="py-2.5 pr-3 font-bold">Asset / Location</th>
              <th className="py-2.5 pr-3 font-bold">Peak dBµV</th>
              <th className="py-2.5 pr-3 font-bold">Classification</th>
              <th className="py-2.5 pr-3 font-bold">Date</th>
              <th className="py-2.5 pr-3 font-bold">Duration</th>
              <th className="py-2.5 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const active = selectedId === row.id;
              return (
                <tr
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className={`border-b border-slate-800 hover:bg-slate-800/50 transition-colors cursor-pointer ${
                    active ? "bg-slate-800/40" : ""
                  }`}
                >
                  <td className="py-3 pr-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(row.id);
                        setPlaying((p) => (selectedId === row.id ? !p : true));
                      }}
                      className="w-8 h-8 rounded-full bg-yellow-500/20 text-yellow-500 flex items-center justify-center hover:bg-yellow-500 hover:text-slate-900 transition-colors cursor-pointer"
                      aria-label={`Play ${row.asset}`}
                    >
                      {playing && active ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5 ml-0.5" />
                      )}
                    </button>
                  </td>
                  <td className="py-3 pr-3">
                    <p className="text-sm font-bold text-white leading-tight">{row.asset}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{row.location}</p>
                  </td>
                  <td className="py-3 pr-3 text-sm font-bold text-yellow-500 font-mono whitespace-nowrap">
                    {row.peakDb.toFixed(1)} dBµV
                  </td>
                  <td className="py-3 pr-3">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${usClassBadge(row.classification)}`}
                    >
                      {row.classification}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-xs text-slate-400 whitespace-nowrap">{row.date}</td>
                  <td className="py-3 pr-3 text-xs text-slate-400 font-mono">{row.duration}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={!onView}
                        title={onView ? undefined : PENDING_DETAIL}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(row.id);
                          onView?.(row.asset);
                        }}
                        className={`text-xs font-bold ${
                          onView
                            ? "text-cyan-400 hover:text-cyan-300 cursor-pointer"
                            : `text-slate-500 ${PENDING_BTN}`
                        }`}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        disabled={!onCompare}
                        title={onCompare ? undefined : PENDING_COMPARE}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(row.id);
                          setIsComparing(true);
                          onCompare?.(row.asset);
                        }}
                        className={`text-xs font-bold transition-colors ${
                          !onCompare
                            ? `text-slate-500 ${PENDING_BTN}`
                            : isComparing
                              ? "text-cyan-400 cursor-pointer"
                              : "text-slate-400 hover:text-yellow-500 cursor-pointer"
                        }`}
                      >
                        Compare
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  No recordings match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ===== SECTION 3: Audio Player & Waveform Viewer ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-bold text-white">
            Recording Detail: {selected.asset.split(" - ")[0]} ({selected.date.split(",")[0]})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {([
              { id: "waveform" as const, label: "Time Waveform" },
              { id: "fft" as const, label: "FFT Spectrum" },
              { id: "spectrogram" as const, label: "3D Spectrogram Heatmap" }
            ]).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setUeViewMode(option.id)}
                className={`px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer ${
                  ueViewMode === option.id
                    ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-4">
          <div className="bg-slate-950 border border-white/10 rounded-lg p-4 space-y-4">
            {ueViewMode === "waveform" && (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={US_AUDIO_WAVE_DATA} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="usAudioFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#eab308" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#eab308" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgb(30 41 59)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="t" hide />
                    <YAxis hide domain={[0, 45]} />
                    <Area
                      type="monotone"
                      dataKey="amp"
                      stroke="#eab308"
                      strokeWidth={1.5}
                      fill="url(#usAudioFill)"
                      isAnimationActive={playing}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {ueViewMode === "fft" && (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart data={US_SPECTRUM_DATA} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke="rgb(30 41 59)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="khz"
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      axisLine={{ stroke: "#334155" }}
                      tickLine={false}
                      unit="kHz"
                    />
                    <YAxis
                      domain={[0, 55]}
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      axisLine={{ stroke: "#334155" }}
                      tickLine={false}
                      unit=" dB"
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #334155",
                        borderRadius: 8,
                        fontSize: 12
                      }}
                      formatter={(value: number) => [`${value} dBµV`, "Level"]}
                      labelFormatter={(v) => `${v} kHz`}
                    />
                    <ReferenceLine x={40} stroke="#22d3ee" strokeDasharray="4 4" />
                    <Line
                      type="monotone"
                      dataKey="db"
                      stroke="#22d3ee"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#22d3ee" }}
                    />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>
            )}

            {ueViewMode === "spectrogram" && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">
                  Frequency vs. Time vs. Intensity
                </p>
                <div className="h-64 w-full bg-slate-950 rounded-lg border border-white/10 overflow-hidden relative">
                  <div className="absolute inset-0 flex items-end justify-between gap-px px-1 pb-1 pt-6">
                    {US_SPECTROGRAM_BARS.map((height, i) => (
                      <div
                        key={`spec-bar-${i}`}
                        className="w-1 flex-1 min-w-[2px] rounded-t-sm"
                        style={{
                          height: `${height}%`,
                          background:
                            "linear-gradient(to top, #1e3a8a 0%, #22d3ee 35%, #eab308 70%, #ef4444 100%)"
                        }}
                      />
                    ))}
                  </div>
                  <span className="absolute top-2 left-2 text-[9px] font-mono text-slate-500">
                    Freq ↑
                  </span>
                  <span className="absolute bottom-2 right-2 text-[9px] font-mono text-slate-500">
                    Time →
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className="w-10 h-10 rounded-full bg-yellow-500 text-slate-900 flex items-center justify-center hover:bg-yellow-400 transition-colors cursor-pointer shrink-0"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  className="w-full accent-yellow-500 cursor-pointer"
                  aria-label="Playback progress"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
                  <span>0:{(progress * 0.45).toFixed(0).padStart(2, "0")}</span>
                  <span>{selected.duration}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1">
                  Speed
                </span>
                {(["0.5x", "1x", "2x", "10x"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeed(s)}
                    className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition-colors border ${
                      speed === s
                        ? "bg-yellow-500 text-slate-900 border-yellow-500"
                        : "bg-slate-900 text-slate-400 border-slate-700 hover:border-yellow-500/50"
                    }`}
                    title={s === "10x" ? "Heterodyne review speed" : undefined}
                  >
                    {s}
                  </button>
                ))}
<button
              type="button"
              onClick={() => {
                const audioData = {
                  type: "heterodyned_audio",
                  format: "WAV",
                  purpose: "client_reports_audit_logs"
                };
                const blob = new Blob([JSON.stringify(audioData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `heterodyned-audio-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-3 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Download .WAV Audio
            </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4 text-sm space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Metadata</p>
            <div>
              <p className="text-xs text-slate-500">Carrier Center Freq</p>
              <p className="text-cyan-400 font-semibold">40 kHz</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Heterodyne Audio Freq</p>
              <p className="text-white font-semibold">2.0 kHz</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Gain</p>
              <p className="text-white font-semibold">18 dB</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Sensor</p>
              <p className="text-white font-semibold">UE Systems Ultraprobe 10,000</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Peak Level</p>
              <p className="text-yellow-500 font-bold font-mono">{selected.peakDb.toFixed(1)} dBµV</p>
            </div>
            <div className="pt-2 border-t border-slate-800">
              <p className="text-xs text-slate-500 mb-1">Notes</p>
              <p className="text-slate-300 text-xs leading-relaxed">
                Distinct hissing sound audible at 1x speed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* A/B Dual Audio Comparison Bar */}
      {isComparing && (
        <div className="fixed bottom-20 left-4 right-4 md:left-64 bg-slate-900 border border-cyan-500/30 rounded-xl p-4 z-40 flex flex-col lg:flex-row items-stretch lg:items-center gap-4 shadow-2xl">
          <div className="flex-1 min-w-0 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Baseline Audio (May 12)
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBaselinePlaying((p) => !p)}
                className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center hover:bg-cyan-500 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
                aria-label="Play baseline audio"
              >
                {baselinePlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              </button>
              <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-cyan-400 rounded-full transition-all"
                  style={{ width: baselinePlaying ? "62%" : "18%" }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-1 shrink-0 px-2">
            <label htmlFor="ue-crossfade" className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">
              Crossfade
            </label>
            <input
              id="ue-crossfade"
              type="range"
              min={0}
              max={100}
              value={crossfade}
              onChange={(e) => setCrossfade(Number(e.target.value))}
              className="w-32 accent-cyan-500 cursor-pointer"
            />
            <span className="text-[10px] font-mono text-slate-500">{crossfade}%</span>
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Active Hotspot Audio (Oct 25)
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHotspotPlaying((p) => !p)}
                className="w-8 h-8 rounded-full bg-yellow-500/20 text-yellow-500 flex items-center justify-center hover:bg-yellow-500 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
                aria-label="Play hotspot audio"
              >
                {hotspotPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              </button>
              <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-yellow-500 rounded-full transition-all"
                  style={{ width: hotspotPlaying ? "74%" : "28%" }}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsComparing(false);
              setBaselinePlaying(false);
              setHotspotPlaying(false);
            }}
            aria-label="Close A/B comparison"
            className="absolute top-2 right-2 lg:static lg:shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

const US_LUBE_STEPS = [
  "Attach ultrasonic sensor to bearing housing at 45-degree angle.",
  "Set instrument to 'Lube' mode or monitor RMS dBµV continuously.",
  "Apply grease in small bursts (1-2 seconds) while listening/watching meter.",
  "STOP immediately when dB level drops and stabilizes, or when a change in sound quality is heard.",
  "Record final dBµV level and amount of grease applied."
];

const US_LEAK_STEPS = [
  "Schedule repair during next planned shutdown or use online leak sealant if applicable.",
  "Replace faulty valve seat or tighten fittings.",
  "Perform follow-up ultrasound scan to verify dBµV < 25 dBµV."
];

const US_ARCING_STEPS = [
  "Do not approach energized equipment until arc-flash boundary and PPE category are confirmed.",
  "Notify electrical supervision and open a Category 2 / 4 arc-flash work permit as required.",
  "De-energize and LOTO the affected cubicle before cleaning or retorquing connections.",
  "Clean corona residue / tracking paths; retorque bus joints to manufacturer torque values.",
  "Perform follow-up ultrasound scan under load to verify arcing signature is eliminated."
];

/** Ultrasound — Tab 3: Repair & Lubrication Actions */
function UltrasoundRepairActions({
  onCreateLubeWo,
  onCreateLeakWo,
  onExportPdf
}: {
  onCreateLubeWo: () => void;
  onCreateLeakWo: () => void;
  onExportPdf: () => void;
}) {
  // Valve Station 4 defaults to compressed_air leak workflow.
  const [ueAssetCategory, setUeAssetCategory] = useState<
    "compressed_air" | "rotating" | "electrical"
  >("compressed_air");
  const [lubeChecked, setLubeChecked] = useState<Record<number, boolean>>({});
  const [leakChecked, setLeakChecked] = useState<Record<number, boolean>>({});
  const [arcingChecked, setArcingChecked] = useState<Record<number, boolean>>({});
  const [greaseApplied, setGreaseApplied] = useState("");
  const [physicalTagId, setPhysicalTagId] = useState("#UL-045");
  const [operatingHoursPerYear, setOperatingHoursPerYear] = useState(8760);

  // US DOE: 38 CFM × 0.18 kW/CFM × hours × $0.12/kWh → ~$7,190 at 8,760 hrs
  const annualKwh = 38 * 0.18 * operatingHoursPerYear;
  const annualCost = annualKwh * 0.12;
  // ESG baseline ~93.5 t CO₂e/yr at 8,760 hrs; scales with operating hours.
  const carbonDisplay = Number(((93.5 * operatingHoursPerYear) / 8760).toFixed(1));

  const lubeInitial = 36.8;
  const lubeCurrent = 24.1;
  const lubeTarget = 22.0;
  const lubeProgressPct = Math.min(
    100,
    Math.max(0, ((lubeInitial - lubeCurrent) / (lubeInitial - lubeTarget)) * 100)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Workflow context
        </span>
        {(
          [
            { id: "compressed_air" as const, label: "Compressed Air (Leak)" },
            { id: "rotating" as const, label: "Rotating Equipment" },
            { id: "electrical" as const, label: "Electrical / Arcing" }
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setUeAssetCategory(option.id)}
            className={`px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer ${
              ueAssetCategory === option.id
                ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* ===== SECTION 1: Acoustic Lubrication Procedure ===== */}
      {ueAssetCategory === "rotating" && (
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-1">
              Bearing Fault Workflow
            </p>
            <h3 className="text-lg font-bold text-white">Acoustic Lubrication Procedure</h3>
            <p className="text-xs text-slate-500 mt-1">
              Target: Reduce dBµV from{" "}
              <span className="text-yellow-500 font-semibold">36.8</span> to baseline (~
              <span className="text-cyan-400 font-semibold">22 dBµV</span>)
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-400">
            Lube Mode
          </span>
        </div>

        {/* Grease Meter Widget */}
        <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4 mb-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Grease Meter Widget
          </p>
          <div className="flex flex-col sm:flex-row justify-between gap-3 text-xs">
            <div>
              <span className="text-slate-500 block">Initial Level</span>
              <span className="font-bold font-mono text-red-500">36.8 dBµV</span>
            </div>
            <div>
              <span className="text-slate-500 block">Current Level</span>
              <span className="font-bold font-mono text-yellow-500">24.1 dBµV</span>
            </div>
            <div>
              <span className="text-slate-500 block">Target Baseline</span>
              <span className="font-bold font-mono text-green-400">~22.0 dBµV</span>
            </div>
          </div>
          <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden border border-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-400 transition-all"
              style={{ width: `${lubeProgressPct}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 font-mono">
            Progress to baseline: {lubeProgressPct.toFixed(0)}%
          </p>
          <label className="block space-y-1.5 pt-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Total Grease Applied
            </span>
            <input
              type="text"
              value={greaseApplied}
              onChange={(e) => setGreaseApplied(e.target.value)}
              placeholder="[ ___ ] Grams / Strokes"
              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-yellow-500/60"
            />
            <span className="text-[10px] text-slate-500 block leading-snug">
              Automatically stored in asset database to track long-term grease consumption.
            </span>
          </label>
        </div>

        <ul className="space-y-2.5">
          {US_LUBE_STEPS.map((step, index) => {
            const on = Boolean(lubeChecked[index]);
            return (
              <li key={step}>
                <button
                  type="button"
                  onClick={() =>
                    setLubeChecked((prev) => ({ ...prev, [index]: !prev[index] }))
                  }
                  className={`w-full flex items-start gap-3 text-left rounded-lg border px-3 py-2.5 cursor-pointer transition-all ${
                    on
                      ? "border-yellow-500/50 bg-yellow-500/10"
                      : "border-slate-800 bg-slate-950/40 hover:border-yellow-500/30"
                  }`}
                >
                  <span
                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                      on
                        ? "bg-yellow-500 border-yellow-500 text-slate-900"
                        : "border-slate-600 bg-slate-950"
                    }`}
                  >
                    {on ? <Check className="w-3.5 h-3.5" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider">
                      Step {index + 1}
                    </span>
                    <p
                      className={`text-sm mt-0.5 ${
                        on ? "text-slate-200 line-through decoration-slate-600" : "text-slate-300"
                      }`}
                    >
                      {step}
                    </p>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      )}

      {/* ===== SECTION 2: Compressed Air Leak Repair Plan ===== */}
      {ueAssetCategory === "compressed_air" && (
      <>
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1">
              Leak Detection Workflow
            </p>
            <h3 className="text-lg font-bold text-white">Leak Repair Action Plan</h3>
            <p className="text-xs text-slate-500 mt-1">
              Leak Severity:{" "}
              <span className="text-yellow-500 font-semibold">
                48.2 dBµV — Equivalent to 1/8&quot; orifice at 100 PSI
              </span>
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border border-red-500/40 bg-red-500/10 text-red-400">
            Leak Detected
          </span>
        </div>

        <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4 mb-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <label className="block flex-1 space-y-1.5 min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Physical Tag ID
              </span>
              <input
                type="text"
                value={physicalTagId}
                onChange={(e) => setPhysicalTagId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-cyan-500/60"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                const mapUrl = `https://maps.google.com/?q=UL-045+leak+location`;
                window.open(mapUrl, '_blank');
              }}
              className="px-3 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 flex items-center gap-2 cursor-pointer transition-colors shrink-0"
            >
              <MapPin className="h-3.5 w-3.5" />
              Pin Location on Facility Layout Map
            </button>
          </div>
        </div>

        <ul className="space-y-2.5">
          {US_LEAK_STEPS.map((step, index) => {
            const on = Boolean(leakChecked[index]);
            return (
              <li key={step}>
                <button
                  type="button"
                  onClick={() =>
                    setLeakChecked((prev) => ({ ...prev, [index]: !prev[index] }))
                  }
                  className={`w-full flex items-start gap-3 text-left rounded-lg border px-3 py-2.5 cursor-pointer transition-all ${
                    on
                      ? "border-cyan-500/50 bg-cyan-500/10"
                      : "border-slate-800 bg-slate-950/40 hover:border-cyan-500/30"
                  }`}
                >
                  <span
                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                      on
                        ? "bg-cyan-400 border-cyan-400 text-slate-900"
                        : "border-slate-600 bg-slate-950"
                    }`}
                  >
                    {on ? <Check className="w-3.5 h-3.5" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
                      Step {index + 1}
                    </span>
                    <p
                      className={`text-sm mt-0.5 ${
                        on ? "text-slate-200 line-through decoration-slate-600" : "text-slate-300"
                      }`}
                    >
                      {step}
                    </p>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ===== Cost of Inaction / Energy ROI (Leak workflow) ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-5 w-5 text-yellow-500" />
          <h3 className="text-lg font-bold text-white">Cost of Inaction (Energy Waste)</h3>
        </div>
        <div className="flex flex-row justify-between gap-4 flex-wrap sm:flex-nowrap mb-4">
          <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3 flex-1 min-w-[140px]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              Annual Cost Wasted
            </p>
            <p className="text-sm font-bold font-mono text-red-500">
              ${Math.round(annualCost).toLocaleString()} / yr
            </p>
          </div>
          <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3 flex-1 min-w-[140px]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              Air Loss Volume
            </p>
            <p className="text-sm font-bold font-mono text-yellow-500">~38 CFM continuous</p>
          </div>
          <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3 flex-1 min-w-[140px]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              Equivalent Carbon Footprint
            </p>
            <p className="text-sm font-bold font-mono text-green-400">
              ~{carbonDisplay.toFixed(1)} Metric Tons CO₂e / yr
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <label htmlFor="ue-operating-hours" className="text-xs text-slate-500">
            Operating Hours/Year
          </label>
          <input
            id="ue-operating-hours"
            type="number"
            min={1}
            max={8760}
            value={operatingHoursPerYear}
            onChange={(e) =>
              setOperatingHoursPerYear(Math.max(1, parseInt(e.target.value, 10) || 1))
            }
            className="w-28 bg-slate-900/50 border border-white/20 rounded-lg px-2 py-1.5 text-xs font-mono text-cyan-400 text-right focus:outline-none focus:border-yellow-500/60"
          />
        </div>
        <p className="text-[10px] text-slate-500 font-mono mb-2">
          DOE: 38 CFM × 0.18 kW/CFM × {operatingHoursPerYear.toLocaleString()} hrs × $0.12/kWh
          {" · "}
          {Math.round(annualKwh).toLocaleString()} kWh
        </p>
        <p className="text-[11px] text-slate-500">
          Data available for corporate ESG and carbon reduction reporting.
        </p>
      </section>
      </>
      )}

      {/* ===== SECTION 2b: Arcing & Corona Safety Workflow ===== */}
      {ueAssetCategory === "electrical" && (
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-500 mb-1">
              Electrical Fault Workflow
            </p>
            <h3 className="text-lg font-bold text-white">Arcing &amp; Corona Safety Workflow</h3>
            <p className="text-xs text-slate-500 mt-1">
              Ultrasonic arcing / corona signature detected — energized work controls apply.
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border border-yellow-500/40 bg-yellow-500/10 text-yellow-400">
            Electrical
          </span>
        </div>
        <div className="w-full bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4 flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" />
          <p className="text-sm font-bold text-white leading-snug">
            Required PPE: NFPA 70E Category 2 / 4 Arc Flash Suit before opening energized enclosures.
          </p>
        </div>
        <ul className="space-y-2.5">
          {US_ARCING_STEPS.map((step, index) => {
            const on = Boolean(arcingChecked[index]);
            return (
              <li key={step}>
                <button
                  type="button"
                  onClick={() =>
                    setArcingChecked((prev) => ({ ...prev, [index]: !prev[index] }))
                  }
                  className={`w-full flex items-start gap-3 text-left rounded-lg border px-3 py-2.5 cursor-pointer transition-all ${
                    on
                      ? "border-yellow-500/50 bg-yellow-500/10"
                      : "border-slate-800 bg-slate-950/40 hover:border-yellow-500/30"
                  }`}
                >
                  <span
                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                      on
                        ? "bg-yellow-500 border-yellow-500 text-slate-900"
                        : "border-slate-600 bg-slate-950"
                    }`}
                  >
                    {on ? <Check className="w-3.5 h-3.5" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider">
                      Step {index + 1}
                    </span>
                    <p
                      className={`text-sm mt-0.5 ${
                        on ? "text-slate-200 line-through decoration-slate-600" : "text-slate-300"
                      }`}
                    >
                      {step}
                    </p>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      )}

      {/* ===== SECTION 4: Required Supplies & Tools ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-4">Required Supplies &amp; Tools</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-white/10 bg-slate-950/50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-500 mb-3">
              Supplies
            </p>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-1">•</span>
                Polyurea Grease (NLGI #2)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-1">•</span>
                Ultrasonic Leak Tags (Pack of 10)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-1">•</span>
                Thread sealant
              </li>
            </ul>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-950/50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-3">
              Tools
            </p>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-1">•</span>
                Ultrasonic Detector (Ultraprobe 10,000)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-1">•</span>
                Grease Gun with metering valve
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-1">•</span>
                Leak sealant applicator
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ===== SECTION 5: Action Buttons ===== */}
      <div className="flex flex-wrap items-center gap-3">
        {ueAssetCategory === "rotating" && (
          <button
            type="button"
            onClick={onCreateLubeWo}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 text-xs font-bold cursor-pointer transition-colors shadow-[0_0_15px_rgba(234,179,8,0.25)]"
          >
            <Wrench className="h-3.5 w-3.5" />
            Create Lubrication Work Order
          </button>
        )}
        {ueAssetCategory === "compressed_air" && (
          <button
            type="button"
            onClick={onCreateLeakWo}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 text-xs font-bold cursor-pointer transition-colors shadow-[0_0_15px_rgba(234,179,8,0.25)]"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Create Leak Repair Work Order
          </button>
        )}
        {ueAssetCategory === "electrical" && (
          <button
            type="button"
            onClick={onCreateLeakWo}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 text-xs font-bold cursor-pointer transition-colors shadow-[0_0_15px_rgba(234,179,8,0.25)]"
          >
            <Zap className="h-3.5 w-3.5" />
            Create Electrical Repair Work Order
          </button>
        )}
        <button
          type="button"
          onClick={onExportPdf}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/30 bg-transparent hover:border-yellow-500/50 text-slate-200 text-xs font-bold cursor-pointer transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Export PDF Report
        </button>
      </div>
    </div>
  );
}

function McaPhaseMetricChart({
  title,
  unit,
  data,
  domain
}: {
  title: string;
  unit: string;
  data: { phase: string; value: number; fill: string }[];
  domain: [number, number];
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold text-slate-300 mb-2">{title}</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="rgb(30 41 59)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="phase"
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={{ stroke: "#334155" }}
              tickLine={false}
            />
            <YAxis
              domain={domain}
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={{ stroke: "#334155" }}
              tickLine={false}
              width={40}
              unit={unit}
            />
            <Tooltip
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 8,
                fontSize: 12
              }}
              formatter={(value: number) => [`${value}${unit}`, title]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {data.map((entry) => (
                <Cell key={entry.phase} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** MCA — Tab 1: Analysis Results (ALL-TEST Pro / PdMA style) */
function McaAnalysisResults({ assetLabel }: { assetLabel: string }) {
  const [windingTempC, setWindingTempC] = useState(18);
  const [mcaChartView, setMcaChartView] = useState<
    "resistance" | "inductance" | "impedance" | "phase_angle"
  >("resistance");

  const measuredIrGohm = 2.4;
  // IEEE 43: IR40 = IR_T × 0.5^((40-T)/10) → 2.4 GΩ @ 18°C ≈ 0.52 GΩ
  const ir40Gohm = measuredIrGohm * Math.pow(0.5, (40 - windingTempC) / 10);

  const chartToggleOptions = [
    { id: "resistance" as const, label: "Resistance (Ω)" },
    { id: "inductance" as const, label: "Inductance (mH)" },
    { id: "impedance" as const, label: "Impedance (Z)" },
    { id: "phase_angle" as const, label: "Phase Angle (Fi / I/F)" }
  ];

  const faultZones = [
    {
      id: "grid",
      title: "Power Quality / Grid",
      status: "NORMAL",
      tone: "normal" as const
    },
    {
      id: "feeder",
      title: "Feeder Cable & MCC",
      status: "NORMAL",
      tone: "normal" as const
    },
    {
      id: "stator",
      title: "Stator Windings",
      status: "INTER-TURN FAULT DETECTED",
      tone: "critical" as const
    },
    {
      id: "rotor",
      title: "Rotor Bar Integrity",
      status: "NORMAL",
      tone: "normal" as const
    },
    {
      id: "ground",
      title: "Ground Insulation",
      status: "DEGRADING",
      tone: "warning" as const
    }
  ];

  return (
    <div className="space-y-6">
      {sampleDataBadge()}
      {/* ===== SECTION 1: Inspection Context Header ===== */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4 text-xs text-slate-400 mb-6 pb-4 border-b border-slate-800">
        <div className="space-y-1 min-w-0">
          <p>
            <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">Asset</span>
            <span className="text-white font-semibold">{assetLabel}</span>
          </p>
          <p>
            <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">Inspector</span>
            R. Johnson - MCA Level II Technician
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 sm:gap-5 shrink-0">
          <div className="space-y-1 sm:text-right">
            <p>
              <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">Date</span>
              Oct 26, 2023
            </p>
            <p>
              <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">Test Mode</span>
              De-energized | ALL-TEST Pro 6™
            </p>
          </div>
          <label className="flex flex-col gap-1 sm:items-end">
            <span className="text-slate-500 uppercase tracking-wider font-bold text-[10px]">
              Winding Temp (T<sub>winding</sub>)
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={windingTempC}
                onChange={(e) => setWindingTempC(parseFloat(e.target.value) || 0)}
                className="w-20 bg-slate-900/50 border border-white/10 rounded-lg px-2 py-1.5 text-sm font-mono text-cyan-400 text-right focus:outline-none focus:border-yellow-500/60"
              />
              <span className="text-slate-400 font-mono">°C</span>
            </div>
          </label>
        </div>
      </div>

      {/* ===== SECTION 2: Key Electrical Metrics ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4 sm:col-span-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
            Insulation Resistance
          </p>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <p className="text-sm text-slate-300">
                Measured: {measuredIrGohm.toFixed(1)} GΩ @ {windingTempC}°C
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-sm font-bold text-white">
                Normalized (IR<sub>40</sub>): {ir40Gohm.toFixed(2)} GΩ
              </p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-3 leading-snug font-mono">
            Automatically corrected per IEEE 43 formula: IR<sub>40</sub> = IR<sub>T</sub> × 0.5
            <sup>((40-T)/10)</sup>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-y-1 border-t border-white/10 pt-3">
            <span className="text-xs text-slate-400">
              Polarization Index: <span className="font-bold text-white">2.9</span>
            </span>
            <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 border border-red-500/30 ml-2">
              Declined from 4.1 (18 mos ago)
            </span>
          </div>
        </div>
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Resistance Imbalance
          </p>
          <p className="text-2xl font-bold text-yellow-500 leading-none">6.82%</p>
          <p className="text-xs text-slate-500 mt-2 leading-snug">
            Calculated via Max Deviation / 3-Phase Average (R̄).
          </p>
        </div>
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Inductance Imbalance
          </p>
          <p className="text-2xl font-bold text-slate-300 leading-none">1.2%</p>
          <p className="text-xs text-slate-500 mt-2">Normal (&lt;2%)</p>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 sm:col-span-2 lg:col-span-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-500/80 mb-2">
            Automated Classification
          </p>
          <p className="text-xl font-bold text-yellow-500 leading-tight">WINDING DEGRADATION</p>
        </div>
      </div>

      {/* ===== SECTION 3: Phase Balance Analysis ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <h3 className="text-lg font-bold text-white">Phase Balance Analysis</h3>
          <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400" /> Phase A
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-400" /> Phase B
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-yellow-500" /> Phase C
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {chartToggleOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setMcaChartView(option.id)}
              className={`px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer ${
                mcaChartView === option.id
                  ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {(
            [
              {
                id: "resistance" as const,
                title: "Resistance (Ω)",
                unit: "Ω",
                data: MCA_PHASE_RESISTANCE,
                domain: [0.35, 0.5] as [number, number]
              },
              {
                id: "inductance" as const,
                title: "Inductance (mH)",
                unit: "mH",
                data: MCA_PHASE_INDUCTANCE,
                domain: [12, 13.2] as [number, number]
              },
              {
                id: "impedance" as const,
                title: "Impedance (Z)",
                unit: "Ω",
                data: MCA_PHASE_IMPEDANCE,
                domain: [13.5, 15] as [number, number]
              }
            ] as const
          ).map((chart) => (
            <div
              key={chart.id}
              className={
                mcaChartView === chart.id
                  ? "ring-1 ring-cyan-500/40 rounded-lg"
                  : "opacity-40"
              }
            >
              <McaPhaseMetricChart
                title={chart.title}
                unit={chart.unit}
                data={chart.data}
                domain={chart.domain}
              />
            </div>
          ))}
        </div>

        {mcaChartView === "phase_angle" && (
          <div className="mt-4 ring-1 ring-cyan-500/40 rounded-lg p-2 bg-slate-950/30">
            <McaPhaseMetricChart
              title="Phase Angle (Fi / I/F)"
              unit="°"
              data={MCA_PHASE_ANGLE}
              domain={[50, 62]}
            />
          </div>
        )}

        <div className="mt-4 border-t border-slate-800 pt-3 space-y-1">
          <p className="text-xs text-yellow-500/90">
            Phase C resistance imbalance of 6.82% exceeds 3% warning threshold per IEEE 1415 / NEMA
            MG-1 standards.
          </p>
          <p className="text-[10px] text-slate-500">
            Calculated via Max Deviation / 3-Phase Average (R̄).
          </p>
        </div>
      </section>

      {/* ===== SECTION 4: Polarization Index Trend ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-4">
          Polarization Index Trend (Last 5 Tests)
        </h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart
              data={MCA_PI_TREND}
              margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid stroke="rgb(30 41 59)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 5]}
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  fontSize: 12
                }}
                formatter={(value: number) => [value.toFixed(1), "PI"]}
              />
              <ReferenceLine
                y={2.0}
                stroke="#ef4444"
                strokeDasharray="5 5"
                label={{
                  value: "Minimum Acceptable (IEEE 43)",
                  position: "insideTopRight",
                  fill: "#f87171",
                  fontSize: 10
                }}
              />
              <Line
                type="monotone"
                dataKey="pi"
                stroke="#22d3ee"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#22d3ee", stroke: "#0f172a", strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
            </RechartsLineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-slate-400 mt-4 border-t border-slate-800 pt-3 leading-relaxed">
          PI has declined from 4.1 to 2.9 over 18 months, indicating progressive insulation
          degradation. Schedule motor rewind or replacement within 6 months.
        </p>
      </section>

      {/* ===== SECTION 5a: Fault Zone Isolator Pipeline ===== */}
      <div className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-4 mb-6 flex flex-row flex-wrap justify-between items-center relative gap-3">
        <p className="w-full text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
          Fault Zone Isolator
        </p>
        {faultZones.map((zone, index) => (
          <React.Fragment key={zone.id}>
            <div
              className={`flex-1 min-w-[140px] rounded-lg border p-3 text-center transition-colors ${
                zone.tone === "critical"
                  ? "bg-red-500/10 border-red-500 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.25)]"
                  : zone.tone === "warning"
                    ? "bg-yellow-500/10 border-yellow-500/40"
                    : "bg-slate-950/40 border-white/10"
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                {zone.title}
              </p>
              <span
                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                  zone.tone === "critical"
                    ? "bg-red-500/20 text-red-500 border-red-500/40"
                    : zone.tone === "warning"
                      ? "bg-yellow-500/20 text-yellow-500 border-yellow-500/40"
                      : "bg-emerald-500/15 text-green-400 border-emerald-500/30"
                }`}
              >
                {zone.status}
              </span>
            </div>
            {index < faultZones.length - 1 && (
              <ArrowRight
                className="hidden xl:block h-4 w-4 text-slate-600 shrink-0"
                aria-hidden
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* ===== SECTION 5: Diagnostic Summary & Recommendations ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-3">MCA Diagnostic Summary</h3>
        <p className="text-sm text-slate-300 leading-relaxed mb-5">
          Motor Circuit Analysis of M-101A reveals a 6.82% resistance imbalance between phases, with
          Phase C showing the highest deviation. The Polarization Index has declined from 4.1 to 2.9
          over the past 18 months, indicating progressive insulation degradation likely due to
          thermal aging and moisture ingress. While the motor is still operational, continued
          operation without intervention risks catastrophic winding failure.
        </p>
        <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-3">
          Action Plan
        </p>
        <ol className="space-y-2.5">
          {MCA_ACTION_PLAN.map((step, index) => (
            <li
              key={step}
              className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5"
            >
              <span className="shrink-0 w-6 h-6 rounded-md bg-yellow-500/15 border border-yellow-500/40 text-yellow-500 text-xs font-bold flex items-center justify-center">
                {index + 1}
              </span>
              <span className="text-sm text-slate-300 pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function mcaStatusBadge(status: McaTestStatus) {
  if (status === "PASS") {
    return "bg-emerald-500/15 text-emerald-400 border-emerald-500/40";
  }
  if (status === "FAIL") {
    return "bg-red-500/15 text-red-400 border-red-500/40";
  }
  return "bg-yellow-500/15 text-yellow-500 border-yellow-500/40";
}

/** MCA — Tab 2: Test History Library */
function McaDataLibrary({
  onUpload,
  onView,
  onCompare
}: {
  onUpload?: () => void;
  onView?: (label: string) => void;
  onCompare?: (label: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [testTypeFilter, setTestTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showIr40, setShowIr40] = useState(true);
  const [showImbalance, setShowImbalance] = useState(true);
  const [showPi, setShowPi] = useState(true);
  const [showFi, setShowFi] = useState(true);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.parse("2023-10-26");
    const cutoffMs =
      dateFilter === "6m"
        ? now - 183 * 24 * 60 * 60 * 1000
        : dateFilter === "year"
          ? now - 365 * 24 * 60 * 60 * 1000
          : 0;

    return MCA_LIBRARY_TESTS.filter((row) => {
      if (dateFilter !== "all" && row.dateMs < cutoffMs) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (testTypeFilter === "insulation" && row.testType !== "Insulation Resistance") return false;
      if (testTypeFilter === "phase" && row.testType !== "Phase Balance") return false;
      if (testTypeFilter === "pi" && row.testType !== "Polarization Index") return false;
      if (testTypeFilter === "rotor" && row.testType !== "Rotor Bar Test") return false;
      if (testTypeFilter === "full" && row.testType !== "Full MCA Test") return false;
      if (!q) return true;
      const methodLabel = mcaMethodBadge(row.methodCategory).label.toLowerCase();
      return (
        row.motorId.toLowerCase().includes(q) ||
        row.location.toLowerCase().includes(q) ||
        row.testType.toLowerCase().includes(q) ||
        methodLabel.includes(q) ||
        row.date.toLowerCase().includes(q)
      );
    });
  }, [search, testTypeFilter, dateFilter, statusFilter]);

  return (
    <div className="space-y-6">
      {sampleDataBadge()}
      {/* ===== SECTION 1: Library Header & Filters ===== */}
      <div className="flex flex-col xl:flex-row xl:justify-between xl:items-center mb-6 gap-4">
        <div className="relative flex-1 min-w-0 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by motor ID, location, or test type..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-yellow-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={testTypeFilter}
              onChange={(e) => setTestTypeFilter(e.target.value)}
              className="appearance-none bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-9 py-2.5 text-xs font-bold text-slate-200 cursor-pointer focus:outline-none focus:border-yellow-500"
            >
              <option value="all">All Tests</option>
              <option value="full">Full MCA Test</option>
              <option value="insulation">Insulation Resistance</option>
              <option value="phase">Phase Balance</option>
              <option value="pi">Polarization Index</option>
              <option value="rotor">Rotor Bar Test</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="appearance-none bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-9 py-2.5 text-xs font-bold text-slate-200 cursor-pointer focus:outline-none focus:border-yellow-500"
            >
              <option value="6m">Last 6 Months</option>
              <option value="year">Last Year</option>
              <option value="all">All Time</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-9 py-2.5 text-xs font-bold text-slate-200 cursor-pointer focus:outline-none focus:border-yellow-500"
            >
              <option value="all">All</option>
              <option value="PASS">Pass</option>
              <option value="WARNING">Warning</option>
              <option value="FAIL">Fail</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          </div>
          <button
            type="button"
            onClick={onUpload}
            disabled={!onUpload}
            title={onUpload ? undefined : PENDING_UPLOAD}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-yellow-500 text-slate-900 text-xs font-bold transition-colors ${
              onUpload
                ? "hover:bg-yellow-400 cursor-pointer shadow-[0_0_15px_rgba(234,179,8,0.25)]"
                : PENDING_BTN
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Test Results
          </button>
        </div>
      </div>

      {/* ===== SECTION 2: MCA Test History Table ===== */}
      <section className="bg-slate-900/50 border border-white/20 rounded-xl p-6 mb-6 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">MCA Test History</h3>
          <p className="text-xs text-slate-500">
            {filtered.length} test{filtered.length === 1 ? "" : "s"}
          </p>
        </div>
        <table className="w-full text-left border-collapse min-w-[820px]">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800">
              <th className="py-2.5 pr-3 font-bold">Date</th>
              <th className="py-2.5 pr-3 font-bold">Test Type</th>
              <th className="py-2.5 pr-3 font-bold">Insulation Resistance</th>
              <th className="py-2.5 pr-3 font-bold">Phase Balance %</th>
              <th className="py-2.5 pr-3 font-bold">PI Value</th>
              <th className="py-2.5 pr-3 font-bold">Status</th>
              <th className="py-2.5 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.id}
                className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
              >
                <td className="py-3 pr-3 text-xs text-slate-400 whitespace-nowrap">{row.date}</td>
                <td className="py-3 pr-3 whitespace-nowrap">
                  {(() => {
                    const badge = mcaMethodBadge(row.methodCategory);
                    return <span className={badge.className}>{badge.label}</span>;
                  })()}
                </td>
                <td className="py-3 pr-3 text-sm font-semibold text-cyan-400 font-mono whitespace-nowrap">
                  {row.insulationGohm.toFixed(1)} GΩ
                </td>
                <td
                  className={`py-3 pr-3 text-sm font-semibold font-mono whitespace-nowrap ${
                    row.phaseBalancePct > 3 ? "text-yellow-500" : "text-emerald-400"
                  }`}
                >
                  {row.phaseBalancePct.toFixed(2)}%
                </td>
                <td
                  className={`py-3 pr-3 text-sm font-semibold font-mono whitespace-nowrap ${
                    row.pi < 3 ? "text-yellow-500" : "text-emerald-400"
                  }`}
                >
                  {row.pi.toFixed(1)}
                </td>
                <td className="py-3 pr-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${mcaStatusBadge(row.status)}`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={!onView}
                      title={onView ? undefined : PENDING_DETAIL}
                      onClick={() => onView?.(`${row.testType} · ${row.date}`)}
                      className={`text-xs font-bold ${
                        onView
                          ? "text-cyan-400 hover:text-cyan-300 cursor-pointer"
                          : `text-slate-500 ${PENDING_BTN}`
                      }`}
                    >
                      View Details
                    </button>
                    <button
                      type="button"
                      disabled={!onCompare}
                      title={onCompare ? undefined : PENDING_COMPARE}
                      onClick={() => onCompare?.(`${row.testType} · ${row.date}`)}
                      className={`text-xs font-bold ${
                        onCompare
                          ? "text-slate-400 hover:text-yellow-500 cursor-pointer"
                          : `text-slate-500 ${PENDING_BTN}`
                      }`}
                    >
                      Compare
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  No MCA tests match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ===== SECTION 3: Multi-Parameter Overlay Trend ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-4">
          Multi-Parameter Trend &amp; Failure Projection
        </h3>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {(
            [
              {
                id: "ir40",
                label: "IR40",
                checked: showIr40,
                set: setShowIr40,
                color: "text-cyan-400"
              },
              {
                id: "imbalance",
                label: "Phase Resistance Imbalance (%)",
                checked: showImbalance,
                set: setShowImbalance,
                color: "text-yellow-500"
              },
              {
                id: "pi",
                label: "Polarization Index (PI)",
                checked: showPi,
                set: setShowPi,
                color: "text-emerald-400"
              },
              {
                id: "fi",
                label: "Phase Angle (Fi)",
                checked: showFi,
                set: setShowFi,
                color: "text-blue-400"
              }
            ] as const
          ).map((toggle) => (
            <label
              key={toggle.id}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs border cursor-pointer transition-colors ${
                toggle.checked
                  ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              }`}
            >
              <input
                type="checkbox"
                checked={toggle.checked}
                onChange={(e) => toggle.set(e.target.checked)}
                className="accent-cyan-400"
              />
              <span className={toggle.checked ? toggle.color : ""}>{toggle.label}</span>
            </label>
          ))}
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart
              data={MCA_MULTI_TREND}
              margin={{ top: 8, right: 48, left: 0, bottom: 4 }}
            >
              <CartesianGrid stroke="rgb(30 41 59)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                domain={[0, 8]}
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
                width={36}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[50, 65]}
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
                width={36}
                unit="°"
              />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  fontSize: 12
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}
                iconType="plainline"
              />
              <ReferenceLine
                yAxisId="left"
                y={2.0}
                stroke="#ef4444"
                strokeDasharray="4 4"
                label={{
                  value: "PI / IR min threshold",
                  position: "insideTopLeft",
                  fill: "#f87171",
                  fontSize: 10
                }}
              />
              {showIr40 && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="ir40"
                  name="IR40 (GΩ)"
                  stroke="#22d3ee"
                  strokeWidth={2.5}
                  connectNulls={false}
                  dot={{ r: 3, fill: "#22d3ee", stroke: "#0f172a", strokeWidth: 1 }}
                />
              )}
              {showImbalance && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="imbalance"
                  name="Imbalance (%)"
                  stroke="#eab308"
                  strokeWidth={2}
                  connectNulls={false}
                  dot={{ r: 3, fill: "#eab308", stroke: "#0f172a", strokeWidth: 1 }}
                />
              )}
              {showPi && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="pi"
                  name="PI"
                  stroke="#34d399"
                  strokeWidth={2}
                  connectNulls={false}
                  dot={{ r: 3, fill: "#34d399", stroke: "#0f172a", strokeWidth: 1 }}
                />
              )}
              {showFi && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="fi"
                  name="Phase Angle Fi (°)"
                  stroke="#60a5fa"
                  strokeWidth={2}
                  connectNulls={false}
                  dot={{ r: 3, fill: "#60a5fa", stroke: "#0f172a", strokeWidth: 1 }}
                />
              )}
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="projection"
                name="Curve-Fit Failure Projection"
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="6 4"
                connectNulls
                dot={{ r: 3, fill: "#ef4444", stroke: "#0f172a", strokeWidth: 1 }}
              />
            </RechartsLineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-red-500 mt-4 border-t border-slate-800 pt-3 leading-relaxed font-semibold">
          Based on current PI &amp; IR40 degradation rate, minimum threshold will be breached in
          ~142 days.
        </p>
      </section>

      {/* ===== SECTION 4: Phase Balance History ===== */}
      <section className="bg-slate-900/50 border border-white/20 rounded-lg p-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <h3 className="text-lg font-bold text-white">Phase Balance History</h3>
          <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-500">
            Phase C consistently elevated (outlier)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400" /> Phase A
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-400" /> Phase B
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-yellow-500" /> Phase C
          </span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={MCA_PHASE_HISTORY} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="rgb(30 41 59)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
              />
              <YAxis
                domain={[0.35, 0.5]}
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
                width={40}
                unit="Ω"
              />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  fontSize: 12
                }}
                formatter={(value: number, name: string) => [
                  `${value}Ω`,
                  name === "a" ? "Phase A" : name === "b" ? "Phase B" : "Phase C"
                ]}
              />
              <Bar dataKey="a" fill="#22d3ee" radius={[3, 3, 0, 0]} maxBarSize={18} />
              <Bar dataKey="b" fill="#94a3b8" radius={[3, 3, 0, 0]} maxBarSize={18} />
              <Bar dataKey="c" fill="#eab308" radius={[3, 3, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ===== SECTION 5: Side-by-Side Comparison Matrix ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-1">Compare Test Results</h3>
        <p className="text-xs text-slate-500 mb-4">
          Test 1 (Oct 26, 2023) vs Test 2 (Apr 15, 2023) — IR<sub>40</sub> normalized deltas
        </p>
        <div className="w-full bg-slate-900/50 border border-white/10 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-4 gap-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 pb-2 border-b border-white/10">
            <div>Metric</div>
            <div className="text-cyan-400">Test 1 · Oct 26, 2023</div>
            <div>Test 2 · Apr 15, 2023</div>
            <div>Delta</div>
          </div>
          <div className="grid grid-cols-4 gap-4 items-center text-sm py-2 border-b border-white/5">
            <div className="text-slate-400 text-xs sm:text-sm">
              Insulation Resistance (IR<sub>40</sub>)
            </div>
            <div className="font-mono font-semibold text-white">0.52 GΩ</div>
            <div className="font-mono font-semibold text-slate-300">0.85 GΩ</div>
            <div className="font-mono font-bold text-red-500 text-xs sm:text-sm">
              🔴 -38.8% (Degrading)
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 items-center text-sm py-2 border-b border-white/5">
            <div className="text-slate-400 text-xs sm:text-sm">Phase Resistance Imbalance</div>
            <div className="font-mono font-semibold text-white">6.82%</div>
            <div className="font-mono font-semibold text-slate-300">3.20%</div>
            <div className="font-mono font-bold text-red-500 text-xs sm:text-sm">
              +113.1% (Worsening)
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 items-center text-sm py-2">
            <div className="text-slate-400 text-xs sm:text-sm">Polarization Index (PI)</div>
            <div className="font-mono font-semibold text-white">2.90</div>
            <div className="font-mono font-semibold text-slate-300">3.50</div>
            <div className="font-mono font-bold text-yellow-500 text-xs sm:text-sm">
              🟡 -17.1% (Warning)
            </div>
          </div>
        </div>
        <p className="text-xs text-yellow-500/90 mt-4 leading-relaxed">
          Significant degradation detected between these two test dates.
        </p>
      </section>
    </div>
  );
}

/** Synced to active MCA test record (Oct 26, 2023). */
const MCA_ACTIVE_PI = 2.9;

const MCA_ISOLATION_STEPS = [
  "Apply Lockout/Tagout (LOTO) at MCC Feeder Breaker.",
  "Disconnect motor leads at the local junction box (T-leads) and perform a point-of-use MCA test.",
  "Verify Arc Flash PPE Level 2 requirements before panel open."
];

/** MCA — Tab 3: Repair & Rewind Actions */
function McaRepairActions({
  onCreateRepairWo,
  onScheduleRewind,
  onExportPdf
}: {
  onCreateRepairWo: () => void;
  onScheduleRewind?: () => void;
  onExportPdf: () => void;
}) {
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  // PI 2.0–4.0 yellow zone: map 2.9 within that band (~66% across full gauge scale)
  const piMarkerPct = 66;

  return (
    <div className="space-y-6">
      {/* ===== SECTION 1: Severity Assessment (IEEE 43) ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Motor Health Assessment (IEEE 43-2000)</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Polarization Index zones for winding insulation condition
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border border-yellow-500/40 bg-yellow-500/10 text-yellow-500">
            Schedule Maintenance
          </span>
        </div>

        <div className="relative pt-10 pb-2">
          <div
            className="absolute top-0 -translate-x-1/2 flex flex-col items-center z-10 max-w-[240px] w-max"
            style={{ left: `${piMarkerPct}%` }}
          >
            <span className="text-[10px] font-bold text-yellow-500 text-center leading-tight mb-1 px-1.5 py-0.5 rounded bg-slate-950/90 border border-yellow-500/40">
              Current PI: {MCA_ACTIVE_PI.toFixed(1)} — SCHEDULE MAINTENANCE
            </span>
            <span className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-yellow-500" />
          </div>

          <div className="h-8 rounded-lg overflow-hidden flex border border-slate-700 relative">
            <div className="w-[30%] bg-emerald-500/80 flex items-center justify-center">
              <span className="text-[9px] font-bold text-slate-950 uppercase tracking-wide hidden sm:block text-center px-1">
                Excellent / New
              </span>
            </div>
            <div className="w-[36%] bg-yellow-500/85 flex items-center justify-center">
              <span className="text-[9px] font-bold text-slate-950 uppercase tracking-wide hidden sm:block text-center px-1">
                Monitor / Schedule Maintenance
              </span>
            </div>
            <div className="w-[34%] bg-red-500/90 flex items-center justify-center">
              <span className="text-[9px] font-bold text-white uppercase tracking-wide hidden sm:block text-center px-1">
                Critical / Immediate Rewind
              </span>
            </div>
            <span
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] z-10"
              style={{ left: `${piMarkerPct}%` }}
            />
          </div>

          <div className="flex justify-between mt-2 text-[10px] font-mono text-slate-500">
            <span className="text-emerald-400">PI &gt; 4.0</span>
            <span className="text-yellow-500">PI 2.0 – 4.0</span>
            <span className="text-red-400">PI &lt; 2.0</span>
          </div>
        </div>
        <p className="text-xs text-slate-400 italic mt-2">
          Note: Per IEEE 43, if total IR40 &gt; 5 GΩ, Polarization Index (PI) readings become less
          significant due to ultra-low leakage current.
        </p>
      </section>

      {/* ===== SECTION 2: Location Isolation Checklist ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Location Isolation Checklist</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              MCC vs. Junction Box — isolate cable/starter unbalance from stator windings
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-400">
            Step-by-Step Isolation
          </span>
        </div>
        <ul className="space-y-2.5">
          {MCA_ISOLATION_STEPS.map((step, index) => {
            const on = Boolean(checkedSteps[index]);
            return (
              <li key={step}>
                <button
                  type="button"
                  onClick={() =>
                    setCheckedSteps((prev) => ({ ...prev, [index]: !prev[index] }))
                  }
                  className={`w-full flex items-start gap-3 text-left rounded-lg border px-3 py-2.5 cursor-pointer transition-all ${
                    on
                      ? "border-yellow-500/50 bg-yellow-500/10"
                      : "border-slate-800 bg-slate-950/40 hover:border-yellow-500/30"
                  }`}
                >
                  <span
                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      on
                        ? "bg-yellow-500 border-yellow-500 text-slate-900"
                        : "border-slate-600 bg-slate-950"
                    }`}
                  >
                    {on ? <Check className="w-3.5 h-3.5" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider">
                      Step {index + 1}
                    </span>
                    <p
                      className={`text-sm mt-0.5 ${
                        on ? "text-slate-200 line-through decoration-slate-600" : "text-slate-300"
                      }`}
                    >
                      {step}
                    </p>
                  </span>
                </button>
                {index === 1 && (
                  <div className="mt-2 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-xs text-cyan-400">
                    💡 Diagnostic Logic: If phase imbalance disappears at the junction box, cancel
                    motor rewind—the fault is located in the MCC contactor or buried feeder cable!
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ===== SECTION 3: Required Parts & Tools ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-4">Required Parts &amp; Tools</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-white/10 bg-slate-950/50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-500 mb-3">
              Parts
            </p>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-1">•</span>
                Motor Bearings (SKF 6312-2RS)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-1">•</span>
                Insulating Varnish
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-1">•</span>
                Shaft Seal Kit
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-1">•</span>
                Coupling Insert
              </li>
            </ul>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-950/50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-3">
              Tools
            </p>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-1">•</span>
                Megger Insulation Tester (5kV)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-1">•</span>
                Surge Tester (Baker AWA-IV)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-1">•</span>
                Laser Alignment Tool
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-1">•</span>
                Bearing Heater
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ===== SECTION 4: Executive Decision Matrix ===== */}
      <section className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-5 w-5 text-yellow-500" />
          <h3 className="text-lg font-bold text-white">
            Executive Decision Matrix: Rewind vs. IE4 Motor Replacement
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-950/40 border border-white/10 rounded-lg p-4 space-y-3">
            <p className="text-base font-bold text-white">Option A: Motor Shop Rewind</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Cost</span>
                <span className="font-mono font-semibold text-white">$8,500 Upfront</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Efficiency</span>
                <span className="font-mono font-semibold text-white">93.2%</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Operating Cost</span>
                <span className="font-mono font-semibold text-white">$42,100/yr</span>
              </div>
            </div>
          </div>
          <div className="bg-cyan-500/5 border border-cyan-500/30 rounded-lg p-4 space-y-3">
            <p className="text-base font-bold text-cyan-400">Option B: IE4 Premium Replacement</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Cost</span>
                <span className="font-mono font-semibold text-cyan-400">$12,200 Upfront</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Efficiency</span>
                <span className="font-mono font-semibold text-cyan-400">95.8%</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Operating Cost</span>
                <span className="font-mono font-semibold text-cyan-400">$39,400/yr</span>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
          <p className="text-sm font-bold text-yellow-500 leading-relaxed">
            Executive Verdict: Upgrading to a new IE4 motor pays for itself in 1.37 Years through
            $2,700/yr in reduced electricity costs.
          </p>
        </div>
      </section>

      {/* ===== SECTION 5: Action Buttons ===== */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onCreateRepairWo}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 text-xs font-bold cursor-pointer transition-colors shadow-[0_0_15px_rgba(234,179,8,0.25)]"
        >
          <Wrench className="h-3.5 w-3.5" />
          Create Motor Repair Work Order
        </button>
        <button
          type="button"
          onClick={onScheduleRewind}
          disabled={!onScheduleRewind}
          title={onScheduleRewind ? undefined : PENDING_SCHEDULE}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-600 bg-transparent text-slate-200 text-xs font-bold transition-colors ${
            onScheduleRewind ? "hover:border-cyan-400/50 cursor-pointer" : PENDING_BTN
          }`}
        >
          <Calendar className="h-3.5 w-3.5 text-cyan-400" />
          Schedule Shop Rewind
        </button>
        <button
          type="button"
          onClick={onExportPdf}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-600 bg-transparent hover:border-yellow-500/50 text-slate-200 text-xs font-bold cursor-pointer transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Export PDF Report
        </button>
      </div>
    </div>
  );
}

/** Oil Analysis — Tab 1: Lab Results & Analysis */
function OilAnalysisResults({ liveIsoCode }: { liveIsoCode: string | null }) {
  const [oilSpecTab, setOilSpecTab] = useState<OilSpectrometryTab>("wear");
  const spectrometryData = OIL_SPECTROMETRY[oilSpecTab];
  const spectrometryMax = Math.max(...spectrometryData.map((d) => d.ppm), 10);
  const spectrometryYMax = Math.ceil(spectrometryMax * 1.15);

  const spectrometryTabs: { id: OilSpectrometryTab; label: string }[] = [
    { id: "wear", label: "Wear Metals" },
    { id: "contaminants", label: "Dirt & Contaminants" },
    { id: "additives", label: "Additive Package" }
  ];

  return (
    <div className="space-y-6">
      {sampleDataBadge()}
      {/* ===== SECTION 1: Lab Report Header ===== */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 text-xs text-slate-400 mb-6 pb-4 border-b border-slate-800">
        <div className="space-y-1 min-w-0">
          <p>
            <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">Asset</span>
            <span className="text-white font-semibold">Main Gearbox - GB-101 (ISO VG 320)</span>
          </p>
          <p>
            <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">Oil Type</span>
            Mobil Gear 600 XP 320
          </p>
        </div>
        <div className="space-y-1 sm:text-right shrink-0">
          <p>
            <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">Sample Date</span>
            Oct 20, 2023
            <span className="mx-2 text-slate-600">|</span>
            <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">Lab Received</span>
            Oct 22, 2023
          </p>
          <p>
            <span className="text-slate-500 uppercase tracking-wider font-bold mr-2">Lab</span>
            Spectra Certified Lab
          </p>
        </div>
      </div>

      {/* ===== SECTION 2: Key Oil Condition Metrics ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 leading-snug">
            Kinematic Viscosity @ 40°C (ASTM D445)
          </p>
          <p className="text-2xl font-bold text-cyan-400 leading-none">318 cSt @ 40°C</p>
          <p className="text-xs text-slate-500 mt-2 leading-snug">
            Target Band: 288 – 352 cSt (ISO VG 320 Grade)
          </p>
        </div>
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 leading-snug">
            Water Content (ASTM D6304)
          </p>
          <p className="text-2xl font-bold text-red-500 leading-none">450 ppm</p>
          <p className="text-xs text-slate-500 mt-2 leading-snug">
            Warning Threshold: &gt; 200 ppm (Karl Fischer)
          </p>
        </div>
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 leading-snug">
            Total Acid Number (TAN)
          </p>
          <p className="text-2xl font-bold text-yellow-500 leading-none">1.8 mg KOH/g</p>
          <p className="text-xs text-slate-500 mt-2 leading-snug">
            Fresh Baseline: 0.4 mg KOH/g (Oxidation Warning &gt; 1.5)
          </p>
        </div>
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 leading-snug">
            ISO 4406 Cleanliness
          </p>
          <p className="text-2xl font-bold text-yellow-500 leading-none">
            {liveIsoCode ?? "—"}
          </p>
          <p className="text-xs text-slate-500 mt-2 leading-snug">
            {liveIsoCode
              ? `Action: ${OIL_ISO_ACTION_LEVEL} | Target: ${OIL_ISO_TARGET_BASELINE} (≥4µm / ≥6µm / ≥14µm)`
              : "No particle count on file for this asset"}
          </p>
        </div>
      </div>

      {/* ===== SECTION 3: Wear Metal Spectrometry ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <h3 className="text-lg font-bold text-white">Wear Metal Analysis (Spectrometry)</h3>
          <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-yellow-500" /> Elevated
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400" /> Moderate
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-400" /> Nominal
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {spectrometryTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setOilSpecTab(tab.id)}
              className={`px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer ${
                oilSpecTab === tab.id
                  ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[...spectrometryData]} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="rgb(30 41 59)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="metal"
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
              />
              <YAxis
                domain={[0, spectrometryYMax]}
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
                width={40}
                unit=" ppm"
              />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  fontSize: 12
                }}
                formatter={(value: number, _name: string, item: { payload?: { name?: string } }) => [
                  `${value} ppm`,
                  item.payload?.name ?? "Concentration"
                ]}
              />
              <Bar dataKey="ppm" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {spectrometryData.map((entry) => (
                  <Cell key={entry.metal} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-sm text-slate-300 italic">
          Elevated Iron (120 ppm) combined with Silicon (48 ppm) indicates three-body abrasive wear
          caused by external dirt ingress through a compromised breather cap.
        </p>
      </section>

      {/* ===== SECTION 4: Oil Degradation Trend ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <h3 className="text-lg font-bold text-white">
            Viscosity &amp; TAN Dual-Axis Trend Chart
          </h3>
          <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400" /> Viscosity (cSt @ 40°C)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-yellow-500" /> TAN (mg KOH/g)
            </span>
          </div>
        </div>
        <p className="rounded-lg border border-slate-700/60 bg-slate-950/50 px-4 py-6 text-center text-xs text-slate-400">
          Viscosity and TAN are trended from saved oil samples in Trend Analyzer →
          Fluid Chemistry &amp; Contamination.
        </p>
      </section>

      {/* ===== SECTION 5: Diagnostic Summary & Recommendations ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-3">Oil Diagnostic Summary</h3>
        <p className="text-sm text-slate-300 leading-relaxed mb-5">
          {liveIsoCode ? (
            <>
              The measured ISO 4406 cleanliness code is {liveIsoCode}, against Action
              Level {OIL_ISO_ACTION_LEVEL} and Target Baseline{" "}
              {OIL_ISO_TARGET_BASELINE}. Review the wear metals and fluid chemistry
              below alongside this code before committing to a filtration plan.
            </>
          ) : (
            <>
              No oil sample is on file for this asset, so no cleanliness code, wear
              metal concentration or fluid chemistry result can be reported. Capture a
              sample to populate this summary.
            </>
          )}
        </p>
        <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-3">
          Action Plan
        </p>
        <ol className="space-y-2.5">
          {OIL_ACTION_PLAN.map((step, index) => (
            <li
              key={step}
              className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5"
            >
              <span className="shrink-0 w-6 h-6 rounded-md bg-yellow-500/15 border border-yellow-500/40 text-yellow-500 text-xs font-bold flex items-center justify-center">
                {index + 1}
              </span>
              <span className="text-sm text-slate-300 pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function oilAlertBadge(status: OilAlertStatus) {
  if (status === "NORMAL") {
    return "bg-emerald-500/15 text-emerald-400 border-emerald-500/40";
  }
  if (status === "CRITICAL") {
    return "bg-red-500/15 text-red-400 border-red-500/40";
  }
  return "bg-yellow-500/15 text-yellow-500 border-yellow-500/40";
}

function oilIsoDirty(isoCode: string) {
  // Action Level trigger: 17/15/12 — flag when first digit is at or above 17
  const first = Number(isoCode.split("/")[0]);
  return Number.isFinite(first) && first >= 17;
}

/** A history row projected from one saved oil sample. */
interface OilHistoryRow {
  id: string;
  date: string;
  dateMs: number;
  sampleId: string;
  viscosity: number | null;
  moisture: number | null;
  tan: number | null;
  isoCode: string | null;
  fe: number | null;
  cu: number | null;
  si: number | null;
  status: OilAlertStatus;
}

/**
 * Grade a saved sample against the same alarm limits the assessment uses, so
 * the library badge and the assessment card cannot disagree.
 */
function oilSampleStatus(sample: OilSample): OilAlertStatus {
  const over = (v: number | null | undefined, limit: number) => v != null && v > limit;
  const critical =
    over(sample.iron, DEFAULT_ALARM_LIMITS.iron * 2) ||
    over(sample.silicon, DEFAULT_ALARM_LIMITS.silicon * 2) ||
    over(sample.waterPpm, 400);
  if (critical) return "CRITICAL";
  const warning =
    over(sample.iron, DEFAULT_ALARM_LIMITS.iron) ||
    over(sample.copper, DEFAULT_ALARM_LIMITS.copper) ||
    over(sample.chromium, DEFAULT_ALARM_LIMITS.chromium) ||
    over(sample.silicon, DEFAULT_ALARM_LIMITS.silicon) ||
    over(sample.waterPpm, 200) ||
    (sample.iso4um != null && sample.iso4um > ISO_CLEANLINESS_TARGET[0]);
  return warning ? "WARNING" : "NORMAL";
}

function toOilHistoryRow(sample: OilSample): OilHistoryRow {
  const parsed = Date.parse(sample.sampleDate);
  return {
    id: sample.id,
    date: Number.isFinite(parsed)
      ? new Date(parsed).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric"
        })
      : sample.sampleDate,
    dateMs: Number.isFinite(parsed) ? parsed : 0,
    // Samples carry no lab reference number, so the stored row id stands in.
    sampleId: sample.id.slice(0, 8),
    viscosity: sample.viscosity40C ?? null,
    moisture: sample.waterPpm ?? null,
    tan: sample.acidNumber ?? null,
    isoCode:
      sample.iso4um != null && sample.iso6um != null && sample.iso14um != null
        ? `${sample.iso4um}/${sample.iso6um}/${sample.iso14um}`
        : null,
    fe: sample.iron ?? null,
    cu: sample.copper ?? null,
    si: sample.silicon ?? null,
    status: oilSampleStatus(sample)
  };
}

/** Oil Analysis — Tab 2: Sample History Library */
function OilDataLibrary({
  onUpload,
  onView,
  onCompare,
  samples
}: {
  onUpload?: () => void;
  onView?: (label: string) => void;
  onCompare?: (label: string) => void;
  samples: OilSample[];
}) {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [oilTrendElements, setOilTrendElements] = useState({
    fe: true,
    cu: true,
    si: true
  });

  const rows = useMemo(
    () =>
      samples
        .map(toOilHistoryRow)
        .sort((a, b) => b.dateMs - a.dateMs),
    [samples]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const cutoffMs =
      dateFilter === "6m"
        ? now - 183 * 24 * 60 * 60 * 1000
        : dateFilter === "year"
          ? now - 365 * 24 * 60 * 60 * 1000
          : 0;

    return rows.filter((row) => {
      if (dateFilter !== "all" && row.dateMs > 0 && row.dateMs < cutoffMs) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!q) return true;
      return (
        row.sampleId.toLowerCase().includes(q) ||
        row.date.toLowerCase().includes(q) ||
        (row.isoCode ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, dateFilter, statusFilter]);

  /** Oldest-first so the trend chart reads left to right in time. */
  const wearTrend = useMemo(
    () =>
      [...rows]
        .sort((a, b) => a.dateMs - b.dateMs)
        .map((row) => ({
          date: row.date,
          fe: row.fe,
          cu: row.cu,
          si: row.si
        })),
    [rows]
  );

  const statusBadgeLabel = (status: OilAlertStatus) => {
    if (status === "CRITICAL") return "🔴 CRITICAL";
    if (status === "WARNING") return "🟡 WARNING";
    return "🟢 NORMAL";
  };

  const toggleTrend = (key: "fe" | "cu" | "si") => {
    setOilTrendElements((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      {/* ===== SECTION 1: Library Header & Filters ===== */}
      <div className="flex flex-col xl:flex-row xl:justify-between xl:items-center mb-6 gap-4">
        <div className="relative flex-1 min-w-0 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by sample ID, date, or ISO code..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-yellow-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="appearance-none bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-9 py-2.5 text-xs font-bold text-slate-200 cursor-pointer focus:outline-none focus:border-yellow-500"
            >
              <option value="6m">Last 6 Months</option>
              <option value="year">Last Year</option>
              <option value="all">All Time</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-9 py-2.5 text-xs font-bold text-slate-200 cursor-pointer focus:outline-none focus:border-yellow-500"
            >
              <option value="all">All</option>
              <option value="NORMAL">Normal</option>
              <option value="WARNING">Warning</option>
              <option value="CRITICAL">Critical</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          </div>
          <button
            type="button"
            onClick={onUpload}
            disabled={!onUpload}
            title={onUpload ? undefined : PENDING_UPLOAD}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-yellow-500 text-slate-900 text-xs font-bold transition-colors ${
              onUpload
                ? "hover:bg-yellow-400 cursor-pointer shadow-[0_0_15px_rgba(234,179,8,0.25)]"
                : PENDING_BTN
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Lab Report
          </button>
        </div>
      </div>

      {/* ===== SECTION 2: Enhanced History Table ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Oil Sample History</h3>
          <p className="text-xs text-slate-500">
            {filtered.length} sample{filtered.length === 1 ? "" : "s"}
          </p>
        </div>
        <table className="w-full text-left border-collapse min-w-[1020px]">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-white/10">
              <th className="py-2.5 pr-3 font-bold">Sample Date</th>
              <th className="py-2.5 pr-3 font-bold">Sample ID</th>
              <th className="py-2.5 pr-3 font-bold">Viscosity (cSt @ 40°C)</th>
              <th className="py-2.5 pr-3 font-bold">Moisture (PPM)</th>
              <th className="py-2.5 pr-3 font-bold">TAN (mg KOH/g)</th>
              <th className="py-2.5 pr-3 font-bold">ISO Code</th>
              <th className="py-2.5 pr-3 font-bold">Wear (Fe/Cu)</th>
              <th className="py-2.5 pr-3 font-bold">Ingress (Si)</th>
              <th className="py-2.5 pr-3 font-bold">Status</th>
              <th className="py-2.5 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.id}
                className="border-b border-white/10 hover:bg-slate-800/40 transition-colors"
              >
                <td className="py-3 pr-3 text-xs text-slate-400 whitespace-nowrap">{row.date}</td>
                <td className="py-3 pr-3 text-sm text-white font-medium whitespace-nowrap">
                  {row.sampleId}
                </td>
                <td className="py-3 pr-3 text-sm font-semibold text-cyan-400 font-mono whitespace-nowrap">
                  {row.viscosity != null ? `${row.viscosity} cSt` : "—"}
                </td>
                <td
                  className={`py-3 pr-3 text-sm font-semibold font-mono whitespace-nowrap ${
                    row.moisture != null && row.moisture > 200
                      ? "text-red-500"
                      : "text-slate-300"
                  }`}
                >
                  {row.moisture != null ? `${row.moisture} ppm` : "—"}
                </td>
                <td
                  className={`py-3 pr-3 text-sm font-semibold font-mono whitespace-nowrap ${
                    row.tan != null && row.tan > 1.5 ? "text-yellow-500" : "text-slate-300"
                  }`}
                >
                  {row.tan != null ? row.tan.toFixed(1) : "—"}
                </td>
                <td
                  className={`py-3 pr-3 text-sm font-semibold font-mono whitespace-nowrap ${
                    row.isoCode && oilIsoDirty(row.isoCode)
                      ? "text-yellow-500"
                      : "text-slate-300"
                  }`}
                >
                  {row.isoCode ?? "—"}
                </td>
                <td className="py-3 pr-3 text-sm font-mono text-slate-300 whitespace-nowrap">
                  {row.fe ?? "—"} / {row.cu ?? "—"}
                </td>
                <td className="py-3 pr-3 text-sm font-mono text-slate-300 whitespace-nowrap">
                  {row.si != null ? `${row.si} ppm` : "—"}
                </td>
                <td className="py-3 pr-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${oilAlertBadge(row.status)}`}
                  >
                    {statusBadgeLabel(row.status)}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={!onView}
                      title={onView ? undefined : PENDING_DETAIL}
                      onClick={() => onView?.(`${row.sampleId} · ${row.date}`)}
                      className={`text-xs font-bold ${
                        onView
                          ? "text-cyan-400 hover:text-cyan-300 cursor-pointer"
                          : `text-slate-500 ${PENDING_BTN}`
                      }`}
                    >
                      View Details
                    </button>
                    <button
                      type="button"
                      disabled={!onCompare}
                      title={onCompare ? undefined : PENDING_COMPARE}
                      onClick={() => onCompare?.(`${row.sampleId} · ${row.date}`)}
                      className={`text-xs font-bold ${
                        onCompare
                          ? "text-slate-400 hover:text-yellow-500 cursor-pointer"
                          : `text-slate-500 ${PENDING_BTN}`
                      }`}
                    >
                      Compare
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="py-10 text-center text-sm text-slate-500">
                  {rows.length === 0
                    ? "No oil samples on file for this asset."
                    : "No oil samples match the current filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ===== SECTION 3: Multi-Element Trend Graph ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-4">
          Multi-Element Wear &amp; Ingress Trend
        </h3>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {(
            [
              { key: "fe" as const, label: "Iron (Fe)", color: "text-red-400" },
              { key: "cu" as const, label: "Copper (Cu)", color: "text-yellow-500" },
              { key: "si" as const, label: "Silicon (Si / Dirt)", color: "text-purple-400" }
            ] as const
          ).map((toggle) => (
            <button
              key={toggle.key}
              type="button"
              onClick={() => toggleTrend(toggle.key)}
              className={`px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer ${
                oilTrendElements[toggle.key]
                  ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              }`}
            >
              <span className={oilTrendElements[toggle.key] ? toggle.color : ""}>
                {toggle.label}
              </span>
            </button>
          ))}
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart
              data={wearTrend}
              margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid stroke="rgb(30 41 59)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 140]}
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
                width={40}
                unit=" ppm"
              />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  fontSize: 12
                }}
                formatter={(value: number, name: string) => [`${value} ppm`, name]}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingBottom: 8 }}
              />
              {oilTrendElements.fe && (
                <Line
                  type="monotone"
                  dataKey="fe"
                  name="Iron (Fe)"
                  stroke="#ef4444"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#ef4444", stroke: "#0f172a", strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              )}
              {oilTrendElements.cu && (
                <Line
                  type="monotone"
                  dataKey="cu"
                  name="Copper (Cu)"
                  stroke="#eab308"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#eab308", stroke: "#0f172a", strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              )}
              {oilTrendElements.si && (
                <Line
                  type="monotone"
                  dataKey="si"
                  name="Silicon (Si / Dirt)"
                  stroke="#a855f7"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#a855f7", stroke: "#0f172a", strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              )}
            </RechartsLineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-yellow-500/90 mt-4 border-t border-white/10 pt-3 leading-relaxed">
          Iron and Silicon rise in parallel — dirt ingress (Si) correlates with abrasive metal wear
          (Fe/Cu). Investigate the breather immediately.
        </p>
      </section>

      {/* ===== SECTION 4: Dynamic Sample Comparison Matrix ===== */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-1">Compare Oil Samples</h3>
        <p className="text-xs text-slate-500 mb-4">
          Current (Oct 20, 2023) vs Baseline (Apr 15, 2023)
        </p>
        <div className="w-full bg-slate-900/50 border border-white/10 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-4 gap-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 pb-2 border-b border-white/10">
            <div>Metric</div>
            <div className="text-cyan-400">Current · Oct 20, 2023</div>
            <div>Baseline · Apr 15, 2023</div>
            <div>Delta</div>
          </div>
          <div className="grid grid-cols-4 gap-4 items-center text-sm py-2 border-b border-white/5">
            <div className="text-slate-400 text-xs sm:text-sm">Viscosity @ 40°C</div>
            <div className="font-mono font-semibold text-white">318 cSt</div>
            <div className="font-mono font-semibold text-slate-300">305 cSt</div>
            <div className="font-mono font-bold text-red-500 text-xs sm:text-sm">
              🔴 +4.26% (Oxidation)
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 items-center text-sm py-2 border-b border-white/5">
            <div className="text-slate-400 text-xs sm:text-sm">Moisture Content</div>
            <div className="font-mono font-semibold text-white">450 ppm</div>
            <div className="font-mono font-semibold text-slate-300">120 ppm</div>
            <div className="font-mono font-bold text-red-500 text-xs sm:text-sm">
              🔴 +275.0% (Water Ingress)
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 items-center text-sm py-2 border-b border-white/5">
            <div className="text-slate-400 text-xs sm:text-sm">Total Acid Number (TAN)</div>
            <div className="font-mono font-semibold text-white">1.8 mg KOH/g</div>
            <div className="font-mono font-semibold text-slate-300">1.2 mg KOH/g</div>
            <div className="font-mono font-bold text-red-500 text-xs sm:text-sm">
              🔴 +50.0% (Acid Buildup)
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 items-center text-sm py-2 border-b border-white/5">
            <div className="text-slate-400 text-xs sm:text-sm">Iron Wear (Fe)</div>
            <div className="font-mono font-semibold text-white">120 ppm</div>
            <div className="font-mono font-semibold text-slate-300">45 ppm</div>
            <div className="font-mono font-bold text-red-500 text-xs sm:text-sm">
              🔴 +166.7% (Abrasive Wear)
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 items-center text-sm py-2">
            <div className="text-slate-400 text-xs sm:text-sm">Silicon Ingress (Si)</div>
            <div className="font-mono font-semibold text-white">48 ppm</div>
            <div className="font-mono font-semibold text-slate-300">12 ppm</div>
            <div className="font-mono font-bold text-red-500 text-xs sm:text-sm">
              +300.0% (Breather Failure)
            </div>
          </div>
        </div>
        <p className="text-xs text-yellow-500/90 mt-4 leading-relaxed">
          Severe contamination and wear detected. Moisture increased by 275%; Silicon ingress tracks
          abrasive Iron wear.
        </p>
      </section>
    </div>
  );
}

const OIL_FILTRATION_STEPS = [
  "Connect offline filter cart equipped with high-efficiency Beta_2000 >= 3-micron absolute filter elements.",
  "Run continuous kidney-loop filtration for a minimum of 6 volume turnovers until particle counts meet ISO 15/13/10.",
  "Replace OEM vented cap with a desiccant silica-gel breather (3-micron particulate rating) to stop ambient moisture (450 ppm) and airborne dust (Si = 48 ppm) ingress."
];

const OIL_ROOT_CAUSE_ITEMS = [
  {
    text: "Is the current breather clogged or missing?",
    note: "Common cause of particle ingress"
  },
  {
    text: "Is the heat exchanger leaking?",
    note: "Common cause of water ingress"
  },
  {
    text: "Was the top-up oil filtered before adding?",
    note: "Unfiltered makeup oil introduces dirt"
  },
  {
    text: "Are shaft seals worn?",
    note: "Allows external contamination and leakage"
  }
];

/** Oil Analysis — Tab 3: Filtration & Maintenance Actions */
function OilRepairActions({
  onCreateFiltrationWo,
  onScheduleOilChange,
  onExportLabReport,
  liveIsoCode
}: {
  onCreateFiltrationWo: () => void;
  onScheduleOilChange?: () => void;
  onExportLabReport: () => void;
  liveIsoCode: string | null;
}) {
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const [rootChecked, setRootChecked] = useState<Record<number, boolean>>({});

  return (
    <div className="space-y-6">
      {/* ===== SECTION 1: Oil Condition Severity Assessment ===== */}
      <section className="bg-slate-900/50 border border-white/20 rounded-xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Oil Condition Assessment</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              ISO 4406 cleanliness zones · TAN / moisture also elevated
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border border-red-500/40 bg-red-500/10 text-red-400">
            Immediate Filtration
          </span>
        </div>

        <div className="relative pt-12 pb-2">
          <div className="absolute top-0 left-[88%] -translate-x-1/2 flex flex-col items-center z-10 max-w-[300px] w-max">
            <span className="text-[10px] font-bold text-red-500 text-center leading-tight mb-1 px-2 py-1 rounded bg-slate-950/95 border border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.45)]">
              Current Reading: {liveIsoCode ?? "—"}
            </span>
            <span className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-red-500" />
          </div>

          <div className="h-10 rounded-lg overflow-hidden flex border border-white/10 relative">
            <div className="w-[34%] bg-green-500/20 border-r border-white/10 flex items-center justify-center px-1">
              <span className="text-[9px] font-bold text-green-400 uppercase tracking-wide text-center leading-tight">
                Target · ISO ≤ 15/13/10
              </span>
            </div>
            <div className="w-[32%] bg-yellow-500/20 border-r border-white/10 flex items-center justify-center px-1">
              <span className="text-[9px] font-bold text-yellow-500 uppercase tracking-wide text-center leading-tight">
                Monitor · 16/14/11 – 17/15/12
              </span>
            </div>
            <div className="w-[34%] bg-red-500/20 flex items-center justify-center px-1">
              <span className="text-[9px] font-bold text-red-500 uppercase tracking-wide text-center leading-tight">
                Critical · ISO ≥ 18/16/13
              </span>
            </div>
            <span className="absolute left-[88%] top-0 bottom-0 w-1 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.9)] z-10" />
          </div>

          <div className="flex justify-between mt-2 text-[10px] font-mono text-slate-500">
            <span className="text-green-400">Green: ≤ 15/13/10</span>
            <span className="text-yellow-500">Yellow: 16/14/11 – 17/15/12</span>
            <span className="text-red-500">Red: ≥ 18/16/13</span>
          </div>
        </div>
      </section>

      {/* ===== SECTION 2: Offline Filtration Procedure ===== */}
      <section className="bg-slate-900/50 border border-white/20 rounded-xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Offline Filtration Procedure (Kidney Loop)</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Preferred first action — restore cleanliness before committing to a full oil change
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-400">
            Filtration First
          </span>
        </div>
        <ul className="space-y-2.5">
          {OIL_FILTRATION_STEPS.map((step, index) => {
            const on = Boolean(checkedSteps[index]);
            return (
              <li key={step}>
                <button
                  type="button"
                  onClick={() =>
                    setCheckedSteps((prev) => ({ ...prev, [index]: !prev[index] }))
                  }
                  className={`w-full flex items-start gap-3 text-left rounded-lg border px-3 py-2.5 cursor-pointer transition-all ${
                    on
                      ? "border-yellow-500/50 bg-yellow-500/10"
                      : "border-slate-800 bg-slate-950/40 hover:border-yellow-500/30"
                  }`}
                >
                  <span
                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      on
                        ? "bg-yellow-500 border-yellow-500 text-slate-900"
                        : "border-slate-600 bg-slate-950"
                    }`}
                  >
                    {on ? <Check className="w-3.5 h-3.5" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider">
                      Step {index + 1}
                    </span>
                    <p
                      className={`text-sm mt-0.5 ${
                        on ? "text-slate-200 line-through decoration-slate-600" : "text-slate-300"
                      }`}
                    >
                      {step}
                    </p>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ===== SECTION 3: Root Cause Analysis ===== */}
      <section className="bg-slate-900/50 border border-white/20 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-1">Contamination Root Cause Checklist</h3>
        <p className="text-xs text-slate-500 mb-4">
          Identify why the oil got dirty — fix the source or filtration will not hold
        </p>
        <ul className="space-y-2.5">
          {OIL_ROOT_CAUSE_ITEMS.map((item, index) => {
            const on = Boolean(rootChecked[index]);
            return (
              <li key={item.text}>
                <button
                  type="button"
                  onClick={() =>
                    setRootChecked((prev) => ({ ...prev, [index]: !prev[index] }))
                  }
                  className={`w-full flex items-start gap-3 text-left rounded-lg border px-3 py-2.5 cursor-pointer transition-all ${
                    on
                      ? "border-yellow-500/40 bg-yellow-500/10"
                      : "border-slate-800 bg-slate-950/40 hover:border-yellow-500/25"
                  }`}
                >
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      on ? "text-yellow-500" : "text-yellow-500/70"
                    }`}
                  />
                  <span className="min-w-0">
                    <p className={`text-sm font-medium ${on ? "text-white" : "text-slate-300"}`}>
                      {item.text}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{item.note}</p>
                  </span>
                  <span
                    className={`ml-auto mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                      on
                        ? "bg-yellow-500 border-yellow-500 text-slate-900"
                        : "border-slate-600 bg-slate-950"
                    }`}
                  >
                    {on ? <Check className="w-3.5 h-3.5" /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ===== SECTION 4: Noria / SKF LEF Financial Engine ===== */}
      <section className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-5 w-5 text-yellow-500" />
          <h3 className="text-lg font-bold text-white">
            Noria / SKF Life Extension Factor (LEF) Financial Engine
          </h3>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 mb-4">
          <div className="flex-1 min-w-[140px] rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              Current ISO
            </p>
            <p className="text-base font-bold font-mono text-red-500">
              {liveIsoCode ?? "—"}
            </p>
          </div>
          <ArrowRight className="hidden sm:block h-5 w-5 text-slate-600 shrink-0" aria-hidden />
          <div className="flex-1 min-w-[140px] rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              Target ISO
            </p>
            <p className="text-base font-bold font-mono text-green-400">15/13/10</p>
          </div>
          <ArrowRight className="hidden sm:block h-5 w-5 text-slate-600 shrink-0" aria-hidden />
          <div className="flex-1 min-w-[140px] rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              Life Extension Factor
            </p>
            <p className="text-base font-bold font-mono text-cyan-400">3.0x (300%)</p>
          </div>
        </div>

        <p className="text-sm text-slate-300 font-mono mb-1">
          Extended MTBF = Baseline MTBF (5 Yrs) × 3.0 ={" "}
          <span className="text-cyan-400 font-bold">15.0 Years</span>
        </p>

        <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
          <p className="text-sm font-bold text-yellow-500 leading-relaxed">
            Achieving target cleanliness prevents premature wear, avoiding ~$85,000 in overhaul, gear
            replacement, and un-planned downtime costs.
          </p>
        </div>
      </section>

      {/* ===== SECTION 5: Required Supplies & Tools ===== */}
      <section className="bg-slate-900/50 border border-white/20 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-4">Required Supplies &amp; Tools</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-500 mb-3">
              Supplies
            </p>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-1">•</span>
                3-micron Filter Elements (x4)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-1">•</span>
                Desiccant Breather (3-micron)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 mt-1">•</span>
                ISO VG 320 Top-up Oil (5 gal)
              </li>
            </ul>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-3">
              Tools
            </p>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-1">•</span>
                Offline Filter Cart
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-1">•</span>
                Hose kit with quick-connects
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-1">•</span>
                Particle Counter (for verification)
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ===== SECTION 6: Direct Action Buttons ===== */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onCreateFiltrationWo}
          className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors inline-flex items-center gap-2"
        >
          <Wrench className="h-3.5 w-3.5" />
          Create Filtration Work Order
        </button>
        <button
          type="button"
          onClick={onScheduleOilChange}
          disabled={!onScheduleOilChange}
          title={
            onScheduleOilChange
              ? undefined
              : "Procurement integration pending — no supplier ordering endpoint is connected"
          }
          className={`border border-slate-700 px-4 py-2 rounded-lg text-sm transition-colors inline-flex items-center gap-2 ${
            onScheduleOilChange
              ? "text-white hover:bg-slate-800 cursor-pointer"
              : `text-slate-400 ${PENDING_BTN}`
          }`}
        >
          <Droplet className="h-3.5 w-3.5 text-cyan-400" />
          Order 3-Micron Filters &amp; Desiccant Breather
        </button>
        <button
          type="button"
          onClick={onExportLabReport}
          className="border border-slate-700 text-white hover:bg-slate-800 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors inline-flex items-center gap-2"
        >
          <Download className="h-3.5 w-3.5" />
          Export ISO 4406 Lab Report (PDF)
        </button>
      </div>
    </div>
  );
}

function collectRawSpectral(row: SavedAnalysisResult | null): Array<{ frequency: number; amplitude: number }> {
  const out: Array<{ frequency: number; amplitude: number }> = [];
  const n = (v: unknown) => (typeof v === "number" || typeof v === "string") && Number.isFinite(Number(v)) ? Number(v) : NaN;
  const walk = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const it of v) walk(it);
      return;
    }
    const o = v as Record<string, unknown>;
    const f = n(o.frequencyHz ?? o.frequency_hz ?? o.freqHz ?? o.freq_hz ?? o.frequency ?? o.freq ?? o.hz ?? o.count);
    const a = n(o.amplitude ?? o.amp ?? o.value);
    if (f > 0 && a > 0) { out.push({ frequency: f, amplitude: a }); return; }
    for (const k of ["record", "telemetry_data", "telemetry", "vibration_trend_record", "spectral", "spectrum", "peaks", "fft_data", "vibration_peaks"]) {
      if (o[k] != null) walk(o[k]);
    }
  };
  walk(row);
  return out;
}

export default function AnalysisReport({
  selectedCompanyId,
  onNavigateToCalendar,
  onNavigateToRca
}: AnalysisReportProps) {
  const { toast } = useToast();
  const [selectedTech, setSelectedTech] = useState<ReportTechnology>("vibration");
  const [activeTab, setActiveTab] = useState<ReportTab>(1); // 1=Analysis, 2=Library, 3=Actions

  // Draft dropdown selections ONLY — changing these never fetches / updates the report
  const [selectedRoute, setSelectedRoute] = useState("Boiler Feed System");
  const [selectedAsset, setSelectedAsset] = useState(MOCK_ASSETS[0].tag);
  const [selectedComponent, setSelectedComponent] = useState("Motor DE");
  const [isLoading, setIsLoading] = useState(false);

  // Committed report context — updated only by Load Report (page-local state)
  const [loadedAssetLabel, setLoadedAssetLabel] = useState(
    () => `${MOCK_ASSETS[0].name} - ${MOCK_ASSETS[0].tag}`
  );
  const [loadedAssetId, setLoadedAssetId] = useState(MOCK_ASSETS[0].id);
  const [loadedComponent, setLoadedComponent] = useState<string | null>("Motor DE");

  const [assetSearch, setAssetSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const loadTimerRef = useRef<number | null>(null);

  const { inventory, savePart } = usePartsInventory();
  const [reportParts, setReportParts] = useState<ReportPart[]>(INITIAL_REPORT_PARTS);
  const [showInventory, setShowInventory] = useState(false);

  const [showWorkOrder, setShowWorkOrder] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [equipTick, setEquipTick] = useState(0);
  const [loadedAnalyses, setLoadedAnalyses] = useState<SavedAnalysisResult[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<SavedAnalysisResult | null>(null);
  const [hasLoadedReport, setHasLoadedReport] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Asset the live multi-technology assessment is built for. Null until the
  // saved records tell us which assets actually have telemetry.
  const [assessmentAssetId, setAssessmentAssetId] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(10);
  const [showBaseline, setShowBaseline] = useState(false);
  const [tab2Rpm, setTab2Rpm] = useState(SHAFT_RPM);
  const [tab2Domain, setTab2Domain] = useState<"fft" | "waveform">("fft");
  const [tab2Unit, setTab2Unit] = useState<"velocity" | "acceleration">("velocity");

  const initiateRcaFromReport = () => {
    if (onNavigateToRca) {
      onNavigateToRca();
    }
  };

  // Fetch saved analyses from PostgreSQL on page load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchAnalysisResults({ limit: 200 });
        if (cancelled) return;
        setLoadedAnalyses(rows);
        setSelectedAnalysis(rows[0] ?? null);
        setHasLoadedReport(true);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load analysis results"
        );
        setHasLoadedReport(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Assets that actually have saved records. Offering anything else would let
   * the assessment be opened on an asset that can only ever render empty.
   */
  const assetsWithRecords = useMemo(() => {
    const ids = new Set<string>();
    for (const row of loadedAnalyses) {
      if (row.asset_id) ids.add(row.asset_id);
    }
    return [...ids].sort();
  }, [loadedAnalyses]);

  /**
   * Deep links. `?reportId=` opens one persisted report by id; `?assetId=`
   * lands on a particular asset's live assessment, which is what the alert and
   * asset-header triggers use since alerts carry an asset, not a report.
   */
  const deepLinkReportId = useQueryParam("reportId");
  const deepLinkAssetId = useQueryParam("assetId");

  const openReport = useCallback((reportId: string) => {
    navigateToTab("analysis", { reportId });
  }, []);

  const closeReport = useCallback(
    (assetId?: string | null) => {
      // Prefer the report's own asset so back lands on the assessment it came
      // from, rather than whichever asset the selector happened to default to.
      const target = assetId || assessmentAssetId;
      navigateToTab("analysis", target ? { assetId: target } : {});
    },
    [assessmentAssetId]
  );

  useEffect(() => {
    // A linked asset wins over the default pick, but only if it really exists;
    // otherwise the selector would show an asset with nothing behind it.
    if (deepLinkAssetId && assetsWithRecords.includes(deepLinkAssetId)) {
      setAssessmentAssetId(deepLinkAssetId);
      return;
    }
    if (assessmentAssetId == null && assetsWithRecords.length > 0) {
      setAssessmentAssetId(assetsWithRecords[0]);
    }
  }, [assessmentAssetId, assetsWithRecords, deepLinkAssetId]);

  // Saved oil samples for the assessment asset. Metric cards that used to
  // print a fixed ISO code read from these, and show an em dash without them.
  const [assessmentOilSamples, setAssessmentOilSamples] = useState<OilSample[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!assessmentAssetId) {
      setAssessmentOilSamples([]);
      return;
    }
    void fetchOilSamples(assessmentAssetId)
      .then((samples) => {
        if (!cancelled) setAssessmentOilSamples(samples);
      })
      .catch(() => {
        if (!cancelled) setAssessmentOilSamples([]);
      });
    return () => {
      cancelled = true;
    };
  }, [assessmentAssetId]);

  const assessmentOilSample = useMemo(
    () =>
      assessmentOilSamples.length
        ? assessmentOilSamples.reduce((newest, s) =>
            new Date(s.sampleDate).getTime() > new Date(newest.sampleDate).getTime()
              ? s
              : newest
          )
        : null,
    [assessmentOilSamples]
  );

  /** Measured ISO 4406 code for the assessment asset, or null when unsampled. */
  const liveIsoCode = useMemo(() => {
    const s = assessmentOilSample;
    if (!s || s.iso4um == null || s.iso6um == null || s.iso14um == null) return null;
    return `${s.iso4um}/${s.iso6um}/${s.iso14um}`;
  }, [assessmentOilSample]);

  /** Measured hotspot from the newest thermography record on the asset. */
  const liveHotspot = useMemo(() => {
    if (!assessmentAssetId) return null;
    const record = latestOfType(
      loadedAnalyses.filter((r) => r.asset_id === assessmentAssetId),
      "thermography"
    );
    if (!record) return null;
    const peak = peakOfType(record, "thermography");
    const hotspot = peak?.hotspot_temp;
    if (hotspot == null || !Number.isFinite(Number(hotspot))) return null;
    return `${hotspot}${resolveTempUnit(record) ?? ""}`;
  }, [assessmentAssetId, loadedAnalyses]);

  const flatEquipment = useMemo(() => {
    void equipTick;
    return getFlatEquipment();
  }, [equipTick]);
  const equipmentRoutes = useMemo(() => {
    void equipTick;
    return getEquipmentData();
  }, [equipTick]);

  const reportAsset = MOCK_ASSETS.find((a) => a.id === loadedAssetId) ?? MOCK_ASSETS[0];
  const selectedEquip = flatEquipment.find((e) => e.tag === reportAsset.tag) ?? null;
  const displayAssetLabel =
    loadedAssetLabel || `${reportAsset.name} - ${reportAsset.tag}`;

  const reportVibrationRecord = useMemo(() => {
    const candidates = [selectedAnalysis, ...loadedAnalyses].filter(
      (row): row is SavedAnalysisResult => Boolean(row)
    );
    for (const row of candidates) {
      const rec = extractVibrationRecordFromAnalysis(row);
      if (rec?.spectral?.length) return rec;
    }
    for (const row of candidates) {
      const rec = extractVibrationRecordFromAnalysis(row);
      if (rec) return rec;
    }
    return null;
  }, [selectedAnalysis, loadedAnalyses]);

  const baselineRecord = useMemo(() => {
    return loadedAnalyses.find((a) => a.is_baseline) ?? null;
  }, [loadedAnalyses]);

  const baselineSpectrum = useMemo(() => {
    if (!baselineRecord) return [];
    const rec = extractVibrationRecordFromAnalysis(baselineRecord);
    return rec?.spectral ?? [];
  }, [baselineRecord]);

  const tab2SpectrumData = useMemo(() => {
    const current = (reportVibrationRecord?.spectral?.length
      ? reportVibrationRecord.spectral
      : collectRawSpectral(selectedAnalysis)).map((p) => ({ frequency: p.frequency, amplitude: p.amplitude }));
    if (current.length === 0) return [];
    const hz = (tab2Rpm || SHAFT_RPM) / 60;
    if (baselineSpectrum.length === 0) return current.map((p) => ({ ...p, baselineAmplitude: undefined as number | undefined }));
    return current.map((p) => {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let j = 0; j < baselineSpectrum.length; j++) {
        const d = Math.abs(baselineSpectrum[j].frequency - p.frequency);
        if (d < bestDist) { bestDist = d; bestIdx = j; }
      }
      return { ...p, baselineAmplitude: bestDist < hz * 0.05 ? baselineSpectrum[bestIdx].amplitude : undefined };
    });
  }, [reportVibrationRecord, baselineSpectrum, selectedAnalysis, tab2Rpm]);

  const tab2RpmHz = tab2Rpm / 60;

  const storedStemPeaks = useMemo(() => {
    const raw = selectedAnalysis?.peaks;
    if (Array.isArray(raw)) {
      const direct = raw
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((p) => ({ frequency: Number(p.frequencyHz ?? p.frequency_hz ?? p.freqHz ?? p.freq_hz ?? p.frequency ?? p.freq ?? p.hz ?? p.count), amplitude: Number(p.amplitude ?? p.amp ?? p.value) }))
        .filter((p) => Number.isFinite(p.frequency) && p.frequency > 0 && Number.isFinite(p.amplitude) && p.amplitude > 0);
      if (direct.length) return direct;
    }
    return collectRawSpectral(selectedAnalysis);
  }, [selectedAnalysis]);

  // Hoisted out of the interactive FFT workspace so the render gate (and the
  // legacy SpectralFftWorkspace fallback below) can read the active chart mode.
  const fullPts = tab2SpectrumData.length > 0 ? tab2SpectrumData : [];
  const peakList = storedStemPeaks;
  const mode: "stems" | "curve" | "empty" =
    peakList.length > 0 ? "stems" : fullPts.length >= 8 ? "curve" : "empty";

  useEffect(() => {
    const speed = reportVibrationRecord?.rpm ?? reportVibrationRecord?.context?.motorSpeedRPM;
    if (speed != null && Number.isFinite(speed) && speed > 0) setTab2Rpm(Math.round(speed));
  }, [reportVibrationRecord]);

  useEffect(() => {
    return () => {
      if (loadTimerRef.current != null) window.clearTimeout(loadTimerRef.current);
    };
  }, []);

  const createWorkOrderAndGo = (message: string) => {
    toast(message, "success");
    const assetLabel = displayAssetLabel || DEFAULT_ASSET_LABEL;
    if (onNavigateToCalendar) {
      onNavigateToCalendar(assetLabel);
    } else {
      navigateToTab("calendar", { asset: assetLabel });
    }
  };

  const searchResults = useMemo(() => {
    const q = assetSearch.trim().toLowerCase();
    if (!q) return flatEquipment;
    return flatEquipment.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.tag.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.location.toLowerCase().includes(q) ||
        a.routeName.toLowerCase().includes(q) ||
        a.hierarchyPath.toLowerCase().includes(q)
    );
  }, [assetSearch, flatEquipment]);

  const routeOptions = useMemo(() => equipmentRoutes.map((r) => r.name), [equipmentRoutes]);

  const assetOptions = useMemo(() => {
    if (!selectedRoute) return [];
    return flatEquipment.filter((a) => a.routeName === selectedRoute);
  }, [selectedRoute, flatEquipment]);

  const componentOptions = useMemo((): EquipComponent[] => {
    if (!selectedAsset) return [];
    const match = flatEquipment.find(
      (a) => a.tag === selectedAsset && (!selectedRoute || a.routeName === selectedRoute)
    );
    return match?.components ?? [];
  }, [selectedRoute, selectedAsset, flatEquipment]);

  // Dismiss the export menu on any outside click.
  useEffect(() => {
    if (!exportOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [exportOpen]);

  // Close asset search on outside click.
  useEffect(() => {
    if (!searchOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [searchOpen]);

  /** Search / picker: update draft dropdowns only — never load report data */
  const applyDraftSelection = (tag: string, component?: string | null) => {
    const flat = flatEquipment.find((a) => a.tag === tag);
    if (!flat) {
      toast(`Unknown asset tag ${tag}.`, "warning");
      return;
    }
    setSelectedRoute(flat.routeName);
    setSelectedAsset(flat.tag);
    setSelectedComponent(component ?? flat.components[0]?.name ?? "");
    setAssetSearch("");
    setSearchOpen(false);
  };

  /** Explicit load — commits draft selection and fetches saved analyses from PostgreSQL */
  const handleLoadReport = async () => {
    if (!selectedRoute || !selectedAsset) {
      toast("Select Route and Asset before loading a report.", "warning");
      return;
    }

    const flat = flatEquipment.find(
      (a) => a.tag === selectedAsset && a.routeName === selectedRoute
    );
    const matched =
      resolveReportAsset(selectedAsset) ||
      (flat ? matchReportAssetFromLabel(`${flat.name} - ${flat.tag}`) : null);
    const label = flat
      ? `${flat.name} - ${flat.tag}`
      : matched
        ? `${matched.name} - ${matched.tag}`
        : selectedAsset || DEFAULT_ASSET_LABEL;

    if (!matched && !flat) {
      toast(`No analysis report available for ${selectedAsset}.`, "warning");
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    if (matched) setLoadedAssetId(matched.id);
    setLoadedAssetLabel(label);
    setLoadedComponent(selectedComponent || null);

    if (loadTimerRef.current != null) {
      window.clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
    }

    try {
      const matchKeys = [
        flat?.id,
        flat?.tag,
        selectedAsset,
        label,
        matched?.id,
        matched?.tag,
        matched ? `${matched.name} - ${matched.tag}` : null
      ]
        .filter(Boolean)
        .map((k) => String(k).toLowerCase());

      // Prefer exact asset_id query using equipment id/tag, then broaden if empty
      let rows: SavedAnalysisResult[] = [];
      for (const key of [flat?.id, flat?.tag, matched?.id, matched?.tag, selectedAsset]) {
        if (!key) continue;
        rows = await fetchAnalysisResults({ asset_id: String(key), limit: 50 });
        if (rows.length) break;
      }
      if (!rows.length) {
        const all = await fetchAnalysisResults({ limit: 100 });
        rows = all.filter((r) => {
          const id = (r.asset_id || "").toLowerCase();
          if (!id) return false;
          return matchKeys.some(
            (k) => id === k || id.includes(k) || k.includes(id)
          );
        });
      }

      if (selectedComponent) {
        const byComponent = rows.filter(
          (r) =>
            !r.component ||
            r.component.toLowerCase() === selectedComponent.toLowerCase()
        );
        if (byComponent.length) rows = byComponent;
      }

      const sorted = [...rows].sort((a, b) => new Date(b.timestamp || b.created_at || 0).getTime() - new Date(a.timestamp || a.created_at || 0).getTime());
      setLoadedAnalyses(sorted);
      setSelectedAnalysis(sorted[0] ?? null);
      setHasLoadedReport(true);

      if (rows.length === 0) {
        toast(
          `No saved analyses found for ${label}. Run Diagnostics to create one.`,
          "warning"
        );
      } else {
        toast(`Loaded ${rows.length} analysis result${rows.length === 1 ? "" : "s"} for ${label}.`, "success");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load analysis results";
      setLoadError(message);
      setLoadedAnalyses([]);
      setSelectedAnalysis(null);
      setHasLoadedReport(true);
      toast(message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const addPartToReport = (part: InventoryPart) => {
    setReportParts((prev) =>
      prev.some((line) => line.partId === part.id) ? prev : [...prev, { partId: part.id, quantity: 1 }]
    );
  };

  const changePartQuantity = (partId: number, quantity: number) => {
    setReportParts((prev) =>
      prev.map((line) => (line.partId === partId ? { ...line, quantity: Math.max(1, quantity) } : line))
    );
  };

  const removePartFromReport = (partId: number) => {
    setReportParts((prev) => prev.filter((line) => line.partId !== partId));
  };

  // Resolved against inventory so the work order carries live descriptions and pricing.
  const workOrderParts = reportParts
    .map((line) => {
      const part = inventory.find((p) => p.id === line.partId);
      return part
        ? {
            partNumber: part.partNumber,
            description: part.description,
            quantity: line.quantity,
            unitPrice: part.unitPrice
          }
        : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const exportContext = {
    assetLabel: displayAssetLabel,
    component: loadedComponent,
    technology: selectedTech,
    analysis: selectedAnalysis,
    records: loadedAnalyses
  };

  const runExport = (
    exporter: (ctx: typeof exportContext) => string,
    kind: string
  ) => {
    try {
      toast(`${kind} saved as ${exporter(exportContext)}.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : `${kind} export failed.`, "error");
    }
  };

  const handleExportPdf = () => runExport(exportReportPdf, "Report");
  const handleExportCsv = () => runExport(exportReportCsv, "Measurements");

  const handleExport = (formatId: string) => {
    setExportOpen(false);
    if (formatId === "csv") handleExportCsv();
    else if (formatId === "excel") runExport(exportReportXlsx, "Workbook");
    else handleExportPdf();
  };

  if (flatEquipment.length === 0) {
    return (
      <div className="space-y-6 pb-28 bg-slate-950/80 rounded-2xl min-h-full p-4 sm:p-6">
        <div>
          <h2 className="text-xl font-bold text-white">Analysis Report</h2>
          <p className="text-xs text-slate-500 mt-1">
            Vibration spectra, fault matrix, and AI recommendations.
          </p>
        </div>
        <OnboardingEmptyState
          variant="analysis"
          onDataChange={() => setEquipTick((n) => n + 1)}
        />
      </div>
    );
  }

  const currentTechTabs = selectedTech === "oil" ? OIL_TABS
    : selectedTech === "thermography" ? THERMOGRAPHY_TABS
    : selectedTech === "ultrasound" ? ULTRASOUND_TABS
    : selectedTech === "mca" ? MCA_TABS
    : TABS;

  return (
    <div className="min-h-screen flex flex-col gap-4 p-4 bg-slate-950">

      {/* ===== Technology Selector ===== */}
      <div className="shrink-0 px-4 pt-4 pb-2 space-y-4">
        <section className="bg-slate-900/50 border border-white/80 rounded-xl p-4 space-y-3 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all">
          <div>
            <h2 className={sectionTitle}>Technology</h2>
            <p className={sectionHint}>Select diagnostic modality</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {REPORT_TECH_CARDS.map(({ id, title, subtitle, Icon, iconClass }) => {
              const active = selectedTech === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setSelectedTech(id);
                    setActiveTab(1);
                  }}
                  className={`min-h-[160px] h-40 p-4 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-all ${
                    active
                      ? "border-yellow-500 bg-yellow-500/10"
                      : "bg-slate-800/50 border-white/80 hover:border-yellow-500 hover:bg-slate-800"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg border flex items-center justify-center mb-2 mx-auto shrink-0 ${iconClass}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-bold text-white text-center leading-tight">{title}</p>
                  <p className="text-[11px] text-slate-400 text-center mt-1 leading-snug">{subtitle}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ===== Equipment Selection ===== */}
        <section className="bg-slate-900/50 border border-white/80 rounded-xl p-4 space-y-3 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all">
          <div>
            <h2 className={sectionTitle}>Equipment Selection</h2>
            <p className={sectionHint}>Route → Asset → Component</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block min-w-0">
              <span className={sectionLabel}>Select Route</span>
              <div className="relative">
                <select
                  value={selectedRoute}
                  onChange={(e) => { setSelectedRoute(e.target.value); setSelectedAsset(""); setSelectedComponent(""); }}
                  className={`${selectInputClass} appearance-none pr-10`}
                >
                  <option value="">Select Route</option>
                  {routeOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
            <label className="block min-w-0">
              <span className={sectionLabel}>Select Asset</span>
              <div className="relative">
                <select
                  value={selectedAsset}
                  onChange={(e) => { setSelectedAsset(e.target.value); setSelectedComponent(""); }}
                  disabled={!selectedRoute}
                  className={`${selectInputClass} appearance-none pr-10 disabled:opacity-50`}
                >
                  <option value="">Select Asset</option>
                  {assetOptions.map((a) => <option key={a.tag} value={a.tag}>{a.name} - {a.tag}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
            <label className="block min-w-0">
              <span className={sectionLabel}>Select Component</span>
              <div className="relative">
                <select
                  value={selectedComponent}
                  onChange={(e) => setSelectedComponent(e.target.value)}
                  disabled={!selectedAsset}
                  className={`${selectInputClass} appearance-none pr-10 disabled:opacity-50`}
                >
                  <option value="">Select Component</option>
                  {componentOptions.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
          </div>
          {selectedAsset && (() => {
            const equip = flatEquipment.find((a) => a.tag === selectedAsset);
            return equip ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-700/80 bg-slate-950/40 px-3 py-2 text-xs">
                <span className="font-mono font-bold text-yellow-400">{equip.tag}</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-300 truncate">{equip.routeName}</span>
                <span className="text-slate-600">|</span>
                <span className="text-cyan-300 font-semibold">{selectedComponent || "—"}</span>
              </div>
            ) : null;
          })()}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleLoadReport}
              disabled={isLoading || !selectedRoute || !selectedAsset}
              className="inline-flex items-center gap-2 h-9 px-4 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 text-sm font-semibold rounded-lg cursor-pointer transition-colors shrink-0"
            >
              {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Loading…</> : "Load Report"}
            </button>
            {reportAsset && (
              <span
                className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-slate-950 border border-amber-400/30 text-amber-300 text-sm font-semibold shrink-0"
                title={`${reportAsset.name} · ${reportAsset.tag} · ${reportAsset.location}`}
              >
                <span className="truncate max-w-[240px]">{displayAssetLabel}{loadedComponent ? ` · ${loadedComponent}` : ""}</span>
              </span>
            )}
          </div>
        </section>
      </div>

      {/* ===== Action Toolbar ===== */}
      <div className="shrink-0 mx-4 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          <input
            type="search"
            value={assetSearch}
            onChange={(e) => { setAssetSearch(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search assets by name, tag, ID, or location…"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-200 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
          />
          {searchOpen && (
            <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 shadow-2xl p-1.5 space-y-0.5">
              {searchResults.length === 0 ? (
                <p className="text-sm text-slate-500 px-2 py-2.5">No matching assets.</p>
              ) : (
                searchResults.map((asset) => {
                  const on = selectedAsset === asset.tag;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => applyDraftSelection(asset.tag, asset.components[0]?.name ?? null)}
                      className={`w-full text-left px-2.5 py-2 rounded-md text-sm cursor-pointer ${
                        on ? "bg-amber-400/10 text-amber-300" : "text-slate-300 hover:bg-slate-900"
                      }`}
                    >
                      <span className="block font-semibold truncate">{asset.name} · {asset.tag}</span>
                      <span className="block text-xs text-slate-500 truncate mt-0.5">{asset.hierarchyPath}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        <span className="h-6 border-l border-slate-700 shrink-0" />

        <label className="text-sm text-slate-400 shrink-0">From</label>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
          className="h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-yellow-400/60" />
        <label className="text-sm text-slate-400 shrink-0">To</label>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
          className="h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-yellow-400/60" />

        <span className="h-6 border-l border-slate-700 shrink-0" />

        <button type="button" onClick={() => createWorkOrderAndGo("Work order staged — opening Maintenance Calendar.")}
          className="flex items-center gap-1.5 h-9 px-3 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-sm font-semibold rounded-lg cursor-pointer transition-colors shrink-0">
          <Wrench className="h-4 w-4" /><span>Create Work Order</span>
        </button>

        <div className="relative shrink-0" ref={exportRef}>
          <button type="button" onClick={() => setExportOpen((p) => !p)} aria-haspopup="menu" aria-expanded={exportOpen}
            className="flex items-center gap-1.5 h-9 px-3 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:text-white text-slate-300 text-sm font-medium rounded-lg cursor-pointer transition-colors">
            <Download className="h-4 w-4" /><span>Export Report</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${exportOpen ? "rotate-180" : ""}`} />
          </button>
          {exportOpen && (
            <div role="menu" className="absolute right-0 top-full mt-1.5 w-52 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl p-1.5 z-30">
              {EXPORT_FORMATS.map((format) => (
                <button key={format.id} type="button" role="menuitem" onClick={() => handleExport(format.id)}
                  className="w-full text-left px-2.5 py-2 rounded-md hover:bg-slate-950 cursor-pointer transition-colors group">
                  <span className="text-sm font-semibold text-slate-200 group-hover:text-yellow-400 block">{format.label}</span>
                  <span className="text-xs text-slate-500 block">{format.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button type="button" onClick={() => setShowInventory(true)}
          className="flex items-center gap-1.5 h-9 px-3 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:text-white text-slate-300 text-sm font-medium rounded-lg cursor-pointer transition-colors shrink-0">
          <Search className="h-4 w-4" /><span>Parts Search</span>
        </button>

        <button
          type="button"
          onClick={() => setShowWorkOrder(true)}
          disabled={!selectedAnalysis}
          title={
            selectedAnalysis
              ? "Draft a work order from the selected saved analysis"
              : "Select a saved analysis to draft a work order from it"
          }
          className={`flex items-center gap-1.5 h-9 px-3 bg-slate-950 border border-slate-800 text-sm font-medium rounded-lg transition-colors shrink-0 ${
            selectedAnalysis
              ? "text-slate-300 hover:border-slate-700 hover:text-white cursor-pointer"
              : "text-slate-500 cursor-not-allowed opacity-60"
          }`}
        >
          <Wrench className="h-4 w-4" /><span>Work Order</span>
        </button>

        <button type="button" disabled title={PENDING_SCHEDULE}
          className={`flex items-center gap-1.5 h-9 px-3 bg-slate-950 border border-slate-800 text-slate-400 text-sm font-medium rounded-lg transition-colors shrink-0 cursor-not-allowed opacity-50`}>
          <Calendar className="h-4 w-4" /><span>Schedule Re-test</span>
        </button>
      </div>

      {/* ===== Master-Detail Split ===== */}
      {deepLinkReportId ? (
        <div className="w-full p-4">
          <div className="w-full">
            <SavedReportViewer
              reportId={deepLinkReportId}
              knownAssetIds={assetsWithRecords}
              onBack={closeReport}
            />
          </div>
        </div>
      ) : (
        <div className="w-full">

          {/* ===== Tab Strip + Detail + FFT ===== */}
          <div className="w-full h-fit bg-slate-900/40 rounded-xl border border-slate-800 p-6 gap-6 flex flex-col">

            {/* Tab Navigation */}
            <div className="flex gap-1 border-b border-slate-800 pb-2 shrink-0 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveTab(0)}
                className={`px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer border-b-2 ${
                  activeTab === 0
                    ? "text-yellow-400 border-yellow-400"
                    : "text-slate-400 hover:text-slate-200 border-transparent"
                }`}
              >
                Saved Analyses ({loadedAnalyses.length})
              </button>
              {currentTechTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer border-b-2 ${
                      isActive
                        ? "text-yellow-400 border-yellow-400"
                        : "text-slate-400 hover:text-slate-200 border-transparent"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* ===== Tab 0: Saved Analyses ===== */}
            {activeTab === 0 && (
              <div className="space-y-3">
                {loadError && <p className="text-xs text-amber-400">{loadError}</p>}
                {loadedAnalyses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-16 px-4">
                    <FileText className="h-8 w-8 text-slate-600 mb-2" />
                    <p className="text-sm font-semibold text-slate-300">No saved analyses for this asset yet</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Complete a Run Diagnostics analysis to populate this list.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {loadedAnalyses.slice(0, visibleLimit).map((row) => {
                        const on = selectedAnalysis?.id === row.id;
                        const sevRaw = String(
                          (Array.isArray(row.fault_list) && row.fault_list[0]?.severity) || ""
                        ).toLowerCase();
                        const sevBadge = sevRaw.includes("high") || sevRaw.includes("crit")
                          ? "bg-red-500/15 text-red-400 border-red-500/30"
                          : sevRaw.includes("low")
                            ? "bg-green-500/15 text-green-400 border-green-500/30"
                            : "bg-amber-500/15 text-amber-400 border-amber-500/30";
                        return (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => { setSelectedAnalysis(row); setActiveTab(1); }}
                            className={`w-full text-left rounded-lg border p-3 transition-colors cursor-pointer ${
                              on
                                ? "border-amber-400/50 bg-amber-400/10"
                                : "border-slate-800 bg-slate-950/50 hover:border-slate-600"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-white truncate">
                                {row.primary_fault || "Analysis"}
                              </p>
                              {sevRaw && (
                                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${sevBadge}`}>
                                  {sevRaw.includes("high") || sevRaw.includes("crit") ? "HIGH" : sevRaw.includes("low") ? "LOW" : "MED"}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-1 truncate">
                              {row.component || "—"} · {row.asset_id || "—"}
                            </p>
                            <p className="text-xs text-slate-600 mt-1">
                              {row.timestamp ? new Date(row.timestamp).toLocaleDateString() : ""}
                              {row.health_score != null ? ` · Health ${row.health_score}` : ""}
                              {row.is_baseline ? " · BASELINE" : ""}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                    {visibleLimit < loadedAnalyses.length && (
                      <button
                        type="button"
                        onClick={() => setVisibleLimit((n) => n + 10)}
                        className="w-full py-2 text-xs font-semibold text-amber-400 bg-slate-800/50 hover:bg-slate-800 rounded-lg border border-slate-700/50"
                      >
                        Show More (+10)
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ===== Selected Analysis Detail — Tab 1 ===== */}
            {selectedAnalysis && activeTab === 1 && (() => {
              const isoInfo = resolveIso10816Zone(
                (selectedAnalysis.telemetry_data as Record<string, unknown> | null | undefined)?.overallVelocity as number | undefined,
                selectedAnalysis.health_score,
              );
              const isoZoneMeta = ISO_10816_ZONES_MM.find((z) => z.zone === isoInfo.zone);
              const faults = Array.isArray(selectedAnalysis.fault_list) ? selectedAnalysis.fault_list : [];
              const hasHigh = faults.some((f) => String(f.severity ?? "").toUpperCase() === "HIGH");

              return (
                <div className="space-y-4">
                  {/* -- ISO 10816 Severity Bar -- */}
                  <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Gauge className="h-4 w-4 text-amber-400" />
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">ISO 10816 Severity Assessment</h4>
                    </div>
                    {isoInfo.source === "none" ? (
                      <p className="text-sm text-slate-500 italic">No stored RMS/Health metric available</p>
                    ) : (
                      <>
                        {/* Zone indicator badge */}
                        <div className="flex flex-wrap items-center gap-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${isoZoneMeta?.bgLight ?? "bg-slate-800/50"} ${isoZoneMeta?.border ?? "border-slate-600"} ${isoZoneMeta?.text ?? "text-slate-300"}`}>
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Zone {isoInfo.zone} — {isoInfo.label}
                          </span>
                          {isoInfo.rmsMmS != null && (
                            <span className="text-xs text-slate-400 font-mono">
                              {isoInfo.rmsMmS.toFixed(2)} mm/s RMS
                            </span>
                          )}
                          {isoInfo.source === "health_score" && (
                            <span className="text-[10px] text-slate-500 italic">
                              (mapped from health score {selectedAnalysis.health_score})
                            </span>
                          )}
                        </div>
                        {/* 4-zone horizontal bar */}
                        <div className="relative">
                          <div className="flex w-full h-3 rounded-full overflow-hidden border border-slate-800">
                            {ISO_10816_ZONES_MM.map((z) => (
                              <div key={z.zone} className={`${z.bg} opacity-80`} style={{ width: `${((z.to - z.from) / 12) * 100}%` }} />
                            ))}
                          </div>
                          {/* Marker */}
                          {isoInfo.rmsMmS != null && (
                            <div
                              className="absolute top-0 h-3 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] rounded-full"
                              style={{ left: `${Math.min((isoInfo.rmsMmS / 12) * 100, 100)}%`, transform: "translateX(-50%)" }}
                            />
                          )}
                          {/* Zone labels under bar */}
                          <div className="flex w-full mt-1.5">
                            {ISO_10816_ZONES_MM.map((z) => (
                              <div key={z.zone} className="text-center" style={{ width: `${((z.to - z.from) / 12) * 100}%` }}>
                                <span className={`text-[9px] font-bold ${z.text}`}>{z.zone}</span>
                                <span className="text-[8px] text-slate-600 block leading-tight">{z.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* -- Report Summary -- */}
                  {(selectedAnalysis.summary || selectedAnalysis.primary_fault) && (
                    <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                      <p className="text-sm text-slate-300 leading-relaxed">
                        {selectedAnalysis.summary || selectedAnalysis.primary_fault}
                      </p>
                      {selectedAnalysis.component && (
                        <p className="text-xs text-slate-500 mt-2">
                          Component: <span className="text-slate-400 font-semibold">{selectedAnalysis.component}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* -- Fault Diagnosis Cards -- */}
                  {faults.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Fault Diagnoses</h4>
                      <div className="grid gap-2">
                        {faults.map((f, i) => {
                          const sev = String(f.severity ?? "").toUpperCase();
                          const sevStyle =
                            sev === "HIGH" || sev === "CRITICAL"
                              ? "bg-red-500/10 text-red-400 border-red-500/30"
                              : sev === "LOW" || sev === "MINOR"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                : "bg-amber-500/10 text-amber-400 border-amber-500/30";
                          const sevLabel =
                            sev === "HIGH" || sev === "CRITICAL" ? "HIGH"
                              : sev === "LOW" || sev === "MINOR" ? "LOW"
                                : "MED";
                          const confidence = f.confidencePercent ?? f.confidence;
                          const proofLine = f.detail || f.description || "Standard Spectral Signature Detected";

                          return (
                            <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-bold text-slate-100">{f.title || `Fault ${i + 1}`}</p>
                                <div className="flex items-center gap-2 shrink-0">
                                  {confidence != null && (
                                    <span className="text-[10px] text-slate-400 font-mono">{confidence}% conf.</span>
                                  )}
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${sevStyle}`}>
                                    {sevLabel}
                                  </span>
                                </div>
                              </div>
                              <p className="text-xs text-slate-500 font-mono leading-relaxed">
                                {proofLine}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* -- Recommendations & Safety -- */}
                  {Array.isArray(selectedAnalysis.recommendations) && selectedAnalysis.recommendations.length > 0 && (
                    <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 space-y-3">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Recommendations</h4>
                      <ul className="space-y-2">
                        {selectedAnalysis.recommendations.map((r, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                            <Check className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* -- LOTO Safety Block (HIGH severity) -- */}
                  {hasHigh && (
                    <div className="rounded-xl border border-amber-500/50 bg-amber-950/20 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                        <p className="text-sm font-bold text-amber-300">LOTO Required — High Severity Fault Detected</p>
                      </div>
                      <p className="text-xs text-amber-200/80 leading-relaxed">
                        A high-severity fault has been identified. Lockout/Tagout (LOTO) procedures must be followed before
                        any physical inspection or repair. Isolate all energy sources, apply personal locks, and verify zero
                        energy state per OSHA 29 CFR 1910.147.
                      </p>
                    </div>
                  )}

                  {/* -- No fault fallback -- */}
                  {faults.length === 0 && !selectedAnalysis.summary && !selectedAnalysis.primary_fault && (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      <Info className="h-5 w-5 mx-auto mb-2 text-slate-600" />
                      <p>No detailed fault data available for this record.</p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ===== Tab 1: Analysis Results (no selection) ===== */}
            {activeTab === 1 && !selectedAnalysis && (
              <div className="flex flex-col items-center justify-center text-center py-16 px-4">
                <FileText className="h-8 w-8 text-slate-600 mb-3" />
                <p className="text-sm font-semibold text-slate-300">Select an analysis from the list</p>
                <p className="text-sm text-slate-500 mt-1 max-w-md">
                  Click a saved analysis on the left to view its details, fault diagnoses, and recommendations.
                </p>
              </div>
            )}

              {/* ===== Interactive FFT Workspace — live spectral chart block (also the Tab 2: Spectrum Library view) ===== */}
              {(activeTab === 2 || (selectedTech === "vibration" && mode !== "empty")) && (() => {
                if (selectedTech !== "vibration" || mode === "empty") {
                  const title = selectedTech !== "vibration" ? "No data available" : selectedAnalysis ? "No spectral data captured" : "No saved analyses for this asset yet";
                  const body = selectedTech !== "vibration" ? `No ${selectedTech} data library available for this asset. Run a diagnostic to populate reports.` : selectedAnalysis ? "This record has no stored vibration spectrum. Run Diagnostics to capture data for this asset." : "Load a saved analysis report or run a diagnostic to populate the spectrum library.";
                  return (
                    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
                      <FileText className="h-8 w-8 text-slate-600 mb-3" />
                      <p className="text-sm font-semibold text-slate-300">{title}</p>
                      <p className="text-sm text-slate-500 mt-1 max-w-md">{body}</p>
                    </div>
                  );
                }
                const hasBaseline = baselineSpectrum.length > 0;
              const chartRows = mode === "curve" ? fullPts : peakList.map((p) => ({ frequency: p.frequency, amplitude: p.amplitude, baselineAmplitude: undefined as number | undefined, stemLabel: `${p.frequency.toFixed(1)}Hz` }));
              const unitShort = tab2Unit === "acceleration" ? "g" : "mm/s";
              const unitLabel = tab2Unit === "acceleration" ? "Acceleration (g)" : "Velocity (mm/s)";
              const toUnitAmp = (freq: number, amp: number) =>
                tab2Unit === "acceleration" ? (amp * 2 * Math.PI * freq) / 9806.65 : amp;
              const displayRows = chartRows.map((r) => ({
                ...r,
                amplitude: toUnitAmp(r.frequency, r.amplitude),
                baselineAmplitude:
                  r.baselineAmplitude != null ? toUnitAmp(r.frequency, r.baselineAmplitude) : undefined
              }));
              const waveformRows = reportVibrationRecord?.waveform ?? [];
              const xDomainMax = Math.max(tab2RpmHz * 4, (chartRows.length ? Math.max(...chartRows.map((r) => r.frequency)) : 0) * 1.15);
              const topPeaks = [...displayRows]
                .sort((a, b) => b.amplitude - a.amplitude)
                .slice(0, 5)
                .sort((a, b) => a.frequency - b.frequency)
                .map((p) => ({
                  ...p,
                  harmonicOrder: tab2RpmHz > 0 ? p.frequency / tab2RpmHz : 0,
                  delta:
                    p.baselineAmplitude != null && p.baselineAmplitude > 1e-6
                      ? ((p.amplitude - p.baselineAmplitude) / p.baselineAmplitude) * 100
                      : null,
                }));
              return (
                <div className="space-y-4">
                  {/* -- Baseline badge -- */}
                  {showBaseline && !hasBaseline && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-300 flex items-center gap-2">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      No stored baseline signature available for comparison
                    </div>
                  )}
                  {showBaseline && hasBaseline && (
                    <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 px-4 py-2.5 text-xs text-sky-300 flex items-center gap-2">
                      <LineChart className="h-3.5 w-3.5 shrink-0" />
                      Baseline overlay active — dashed trace comparison against saved baseline record
                    </div>
                  )}

                  {/* -- Reference RPM slider -- */}
                  <div className="flex items-center gap-4 p-4 bg-slate-900/60 border border-slate-700/80 rounded-xl">
                    <span className="text-sm font-semibold text-slate-300 shrink-0">Reference RPM:</span>
                    <input
                      type="range"
                      min={600}
                      max={3600}
                      step={10}
                      value={tab2Rpm}
                      onChange={(e) => setTab2Rpm(Number(e.target.value))}
                      className="flex-1 accent-cyan-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-cyan-400 font-mono font-bold w-20 text-right tabular-nums">{tab2Rpm} RPM</span>
                  </div>
                  {/* -- Spectral control row: domain / unit / baseline -- */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-1">
                      <button type="button" onClick={() => setTab2Domain("fft")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${tab2Domain === "fft" ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:text-slate-200"}`}>FFT Spectrum</button>
                      <button type="button" onClick={() => setTab2Domain("waveform")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${tab2Domain === "waveform" ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:text-slate-200"}`}>Time Waveform</button>
                    </div>
                    <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-1">
                      <button type="button" onClick={() => setTab2Unit("velocity")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${tab2Unit === "velocity" ? "bg-amber-500/20 text-amber-300" : "text-slate-400 hover:text-slate-200"}`}>Velocity (mm/s)</button>
                      <button type="button" onClick={() => setTab2Unit("acceleration")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${tab2Unit === "acceleration" ? "bg-amber-500/20 text-amber-300" : "text-slate-400 hover:text-slate-200"}`}>Acceleration (g)</button>
                    </div>
                    <button type="button" onClick={() => setShowBaseline((v) => !v)} className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${showBaseline ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200"}`}>Overlay Baseline</button>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono">
                    1X = {tab2RpmHz.toFixed(2)} Hz · 2X = {(tab2RpmHz * 2).toFixed(2)} Hz · 3X = {(tab2RpmHz * 3).toFixed(2)} Hz · 4X = {(tab2RpmHz * 4).toFixed(2)} Hz
                  </p>

                  {/* -- Chart: FFT Spectrum or Time Waveform -- */}
                  {tab2Domain === "waveform" ? (
                    waveformRows.length > 0 ? (
                      <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-3">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Time Waveform</h4>
                        <div className="h-[380px] bg-slate-950 rounded-xl border border-slate-700/80 p-3">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={waveformRows} margin={{ top: 16, right: 16, bottom: 28, left: 48 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                              <XAxis type="number" dataKey="time" domain={[0, "dataMax"]} stroke="#94a3b8" tick={{ fontSize: 10 }} label={{ value: "Time (s)", position: "insideBottom", offset: -12, fill: "#64748b", fontSize: 11 }} />
                              <YAxis stroke="#38bdf8" tick={{ fontSize: 10 }} label={{ value: "Amplitude (mm/s)", angle: -90, position: "insideLeft", fill: "#38bdf8", fontSize: 11 }} />
                              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} formatter={(value) => [`${Number(value).toFixed(3)} mm/s`, "Amplitude"]} labelFormatter={(label) => `${label} s`} />
                              <Line type="monotone" dataKey="amplitude" stroke="#38bdf8" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Amplitude" />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center py-16 px-4 bg-slate-900/60 border border-slate-700/80 rounded-xl">
                        <FileText className="h-8 w-8 text-slate-600 mb-2" />
                        <p className="text-sm font-semibold text-slate-300">No time waveform captured</p>
                      </div>
                    )
                  ) : (
                  <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">
                      {unitLabel}
                      {showBaseline && hasBaseline && <span className="ml-2 text-amber-400 normal-case tracking-normal">— dashed = baseline</span>}
                    </h4>
                    <div className="h-[380px] bg-slate-950 rounded-xl border border-slate-700/80 p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={displayRows}
                          margin={{ top: 28, right: 16, bottom: 28, left: 48 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis
                            type="number"
                            dataKey="frequency"
                            domain={[0, xDomainMax]}
                            stroke="#94a3b8"
                            tick={{ fontSize: 10 }}
                            label={{ value: "Frequency (Hz)", position: "insideBottom", offset: -12, fill: "#64748b", fontSize: 11 }}
                          />
                          <YAxis
                            stroke="#38bdf8"
                            tick={{ fontSize: 10 }}
                            label={{ value: `Amplitude (${unitShort})`, angle: -90, position: "insideLeft", fill: "#38bdf8", fontSize: 11 }}
                          />
                          <Tooltip
                            contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                            formatter={(value, name) => {
                              const val = Number(value);
                              const label = name === "baselineAmplitude" ? "Baseline" : "Amplitude";
                              return [`${val.toFixed(tab2Unit === "acceleration" ? 6 : 3)} ${unitShort}`, label];
                            }}
                            labelFormatter={(label) => `${label} Hz`}
                          />
                          {/* Harmonic cursors 1X–4X */}
                          <ReferenceLine x={tab2RpmHz} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: "1X", fill: "#f59e0b", position: "top", fontSize: 11, fontWeight: 700 }} />
                          <ReferenceLine x={tab2RpmHz * 2} stroke="#38bdf8" strokeDasharray="6 3" label={{ value: "2X", fill: "#38bdf8", position: "top", fontSize: 11, fontWeight: 700 }} />
                          <ReferenceLine x={tab2RpmHz * 3} stroke="#a855f7" strokeDasharray="6 3" label={{ value: "3X", fill: "#a855f7", position: "top", fontSize: 11, fontWeight: 700 }} />
                          <ReferenceLine x={tab2RpmHz * 4} stroke="#ef4444" strokeDasharray="6 3" label={{ value: "4X", fill: "#ef4444", position: "top", fontSize: 11, fontWeight: 700 }} />
                          {/* Baseline trace (dashed, semi-transparent) */}
                          {showBaseline && hasBaseline && (
                            <Area
                              type="monotone"
                              dataKey="baselineAmplitude"
                              stroke="#94a3b8"
                              strokeWidth={1.5}
                              strokeDasharray="5 5"
                              fill="#94a3b8"
                              fillOpacity={0.06}
                              isAnimationActive={false}
                              name="Baseline"
                              connectNulls={false}
                            />
                          )}
                          {/* Full spectrum — continuous curve */}
                          {mode === "curve" && (
                            <Area
                              type="monotone"
                              dataKey="amplitude"
                              stroke="#38bdf8"
                              fill="#38bdf8"
                              fillOpacity={0.15}
                              isAnimationActive={false}
                              name="Amplitude"
                            />
                          )}
                          {/* Stored peaks only — thin vertical stems */}
                          {mode === "stems" && (
                            <Bar dataKey="amplitude" name="Stored Peak" barSize={3} fill="#38bdf8" isAnimationActive={false}>
                              <LabelList dataKey="stemLabel" position="top" fill="#94a3b8" fontSize={9} />
                            </Bar>
                          )}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    {mode === "stems" && (
                      <p className="text-[10px] text-slate-500 mt-2 px-1 font-mono">{peakList.length} stored peaks — full spectrum not captured</p>
                    )}
                  </div>
                  )}

                  {/* -- Peak Analysis table with Delta column -- */}
                  <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-cyan-300">Peak Analysis</h4>
                      <span className="text-[10px] text-slate-500 font-mono">Top 5 amplitude peaks · order = f / 1X</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-950/80 text-slate-400 text-left text-[10px] uppercase tracking-widest">
                            <th className="px-4 py-2.5 font-bold">Freq (Hz)</th>
                            <th className="px-4 py-2.5 font-bold">Amplitude ({unitShort})</th>
                            <th className="px-4 py-2.5 font-bold">Order</th>
                            {showBaseline && hasBaseline && <th className="px-4 py-2.5 font-bold">Baseline</th>}
                            {showBaseline && hasBaseline && <th className="px-4 py-2.5 font-bold">Delta vs Baseline</th>}
                            <th className="px-4 py-2.5 font-bold">Diagnosis</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topPeaks.map((peak, i) => (
                            <tr key={`${peak.frequency}-${i}`} className="border-t border-slate-700/80">
                              <td className="px-4 py-3 text-cyan-300 font-mono">{peak.frequency.toFixed(2)}</td>
                              <td className="px-4 py-3 text-emerald-400 font-mono">{tab2Unit === "acceleration" ? peak.amplitude.toExponential(3) : peak.amplitude.toFixed(3)}</td>
                              <td className="px-4 py-3 text-yellow-400 font-mono font-semibold">{peak.harmonicOrder.toFixed(2)}×</td>
                              {showBaseline && hasBaseline && (
                                <td className="px-4 py-3 text-slate-400 font-mono">
                                  {peak.baselineAmplitude != null ? (tab2Unit === "acceleration" ? peak.baselineAmplitude.toExponential(3) : peak.baselineAmplitude.toFixed(3)) : "—"}
                                </td>
                              )}
                              {showBaseline && hasBaseline && (
                                <td className="px-4 py-3 font-mono font-semibold">
                                  {peak.delta != null ? (
                                    <span className={peak.delta <= 0 ? "text-emerald-400" : "text-red-400"}>
                                      {peak.delta > 0 ? "+" : ""}{peak.delta.toFixed(1)}%
                                    </span>
                                  ) : (
                                    <span className="text-slate-600">n/a</span>
                                  )}
                                </td>
                              )}
                              <td className="px-4 py-3 text-slate-200 font-medium">
                                {peak.harmonicOrder >= 0.9 && peak.harmonicOrder <= 1.1 && "Mass Unbalance"}
                                {peak.harmonicOrder >= 1.9 && peak.harmonicOrder <= 2.1 && "Angular Misalignment"}
                                {peak.harmonicOrder >= 2.9 && peak.harmonicOrder <= 3.1 && "Mechanical Looseness"}
                                {(peak.harmonicOrder < 0.9 || (peak.harmonicOrder > 1.1 && peak.harmonicOrder < 1.9) || (peak.harmonicOrder > 2.1 && peak.harmonicOrder < 2.9) || (peak.harmonicOrder > 3.1)) && "Bearing Fault / Other"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ===== Tab 3: Repair & Actions ===== */}
            {activeTab === 3 && (
              <div className="flex flex-col items-center justify-center text-center py-16 px-4">
                <FileText className="h-8 w-8 text-slate-600 mb-3" />
                <p className="text-sm font-semibold text-slate-300">No data available</p>
                <p className="text-sm text-slate-500 mt-1 max-w-md">
                  Repair actions will appear when a saved analysis includes recommended parts and work.
                </p>
              </div>
            )}

            {/* ===== Tab 4: Multi-Tech Overview ===== */}
            {activeTab === 4 && (
              <>
                {assetsWithRecords.length === 0 ? (
                  <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
                    <h3 className="text-base font-bold text-white mb-1">
                      Multi-Technology Assessment
                    </h3>
                    <p className="text-sm text-slate-400">
                      No saved condition-monitoring records found. Run and save an analysis
                      from Run Diagnostics to build an assessment.
                    </p>
                  </section>
                ) : (
                  <div>
                    <div className="mb-3 flex flex-wrap items-end gap-3">
                      <div className="min-w-0">
                        <label
                          htmlFor="assessment-asset"
                          className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1"
                        >
                          Assessment Asset
                        </label>
                        <select
                          id="assessment-asset"
                          value={assessmentAssetId ?? ""}
                          onChange={(e) => setAssessmentAssetId(e.target.value)}
                          className="h-9 min-w-[200px] px-3 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-amber-400/60"
                        >
                          {assetsWithRecords.map((id) => (
                            <option key={id} value={id}>
                              {id}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="text-sm text-slate-500 pb-2">
                        Assets with saved records ({assetsWithRecords.length})
                      </p>
                    </div>
                    {assessmentAssetId && (
                      <MultiTechAssessment
                        assetId={assessmentAssetId}
                        assetLabel={assessmentAssetId}
                        companyId={selectedCompanyId ?? null}
                        onToast={toast}
                        onOpenReport={openReport}
                      />
                    )}
                  </div>
                )}
              </>
            )}

            {/* ===== Legacy FFT card (SpectralFftWorkspace) — fallback only, renders when the
                  live interactive workspace above has no spectrum/peaks to plot.
                  Alternate view: NOT dead, NOT deleted — do not rewrite, replaced by props later. ===== */}
            {selectedTech === "vibration" && reportVibrationRecord && activeTab !== 2 && mode === "empty" && (
              <div className="shrink-0 min-h-[380px] w-full border-t border-slate-800 pt-4">
                <SpectralFftWorkspace record={reportVibrationRecord} />
              </div>
            )}

          </div>
        </div>
      )}

      {/* ===== Loading Overlay ===== */}
      {isLoading && (
        <div
          className="absolute inset-0 z-30 rounded-2xl bg-slate-950/70 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3"
          aria-busy="true"
          aria-live="polite"
        >
          <Loader2 className="h-8 w-8 text-yellow-400 animate-spin" />
          <p className="text-sm font-semibold text-slate-200">Loading report data…</p>
          <div className="w-full max-w-md space-y-2 px-6">
            <div className="h-3 rounded bg-slate-800 animate-pulse" />
            <div className="h-3 rounded bg-slate-800/80 animate-pulse w-5/6" />
            <div className="h-24 rounded-xl bg-slate-800/60 animate-pulse" />
          </div>
        </div>
      )}

      {/* ===== Floating Quick Actions Bar ===== */}
      <div className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-wrap justify-center gap-2 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl px-3 py-2.5 shadow-2xl">
        <button
          type="button"
          disabled
          title="Watchlist persistence pending — no watchlist endpoint is connected"
          className={`flex items-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-800 text-slate-400 text-xs font-bold rounded-lg transition-colors ${PENDING_BTN}`}
        >
          <Eye className="h-3.5 w-3.5" />
          <span>Watchlist</span>
        </button>
      </div>

      {/* ===== Modals ===== */}
      {showInventory && (
        <PartsInventoryModal
          inventory={inventory}
          reportPartIds={reportParts.map(line => line.partId)}
          onAddToReport={addPartToReport}
          onSavePart={savePart}
          onClose={() => setShowInventory(false)}
        />
      )}

      {showWorkOrder && (
        <WorkOrderGenerator
          assetName={loadedAssetLabel || selectedAnalysis?.asset_id || reportAsset.name}
          tagId={selectedAnalysis?.asset_id || reportAsset.tag}
          faultCode={
            selectedAnalysis?.primary_fault ||
            (Array.isArray(selectedAnalysis?.fault_list) &&
            selectedAnalysis.fault_list[0]?.title
              ? String(selectedAnalysis.fault_list[0].title)
              : "—")
          }
          faultSeverity={(() => {
            const raw = String(
              (Array.isArray(selectedAnalysis?.fault_list) &&
                selectedAnalysis.fault_list[0]?.severity) ||
                ""
            ).toLowerCase();
            if (raw.includes("high") || raw.includes("crit")) return "High";
            if (raw.includes("low")) return "Low";
            return "Medium";
          })()}
          recommendations={(Array.isArray(selectedAnalysis?.recommendations)
            ? selectedAnalysis.recommendations
            : []
          ).map((r) => ({ text: String(r), priority: "Medium" as const }))}
          parts={workOrderParts}
          estimatedHours={0}
          onClose={() => setShowWorkOrder(false)}
        />
      )}
    </div>
  );
}
