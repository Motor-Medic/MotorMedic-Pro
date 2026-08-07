import React, { useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  Activity,
  AlertTriangle,
  AudioWaveform,
  Clock,
  Download,
  Droplet,
  FileText,
  Mail,
  Pause,
  Play,
  Printer,
  Search,
  Settings,
  Sparkles,
  Thermometer,
  Waves,
  Wrench,
  X,
  Zap
} from "lucide-react";
import { TrendDataPoint } from "../types";

/* ========================================================================== */
/* Props (unchanged contract for Trends.tsx / App.tsx)                        */
/* ========================================================================== */

interface TrendAnalyzerProps {
  trendData?: TrendDataPoint[];
  onAddTrendPoint?: (point: Omit<TrendDataPoint, "id" | "timestamp">) => void;
  selectedAssetId?: string;
  selectedCompanyId?: number;
}

type TimeRange = "7D" | "30D" | "90D" | "1Y" | "Custom";
type OverlayParam = "Temp" | "MCSA" | "Load" | null;

interface SpectrumPoint {
  date: string;
  vibration: number;
  peak: number;
  oneX: number;
  bpfo: number;
  bpfi: number;
  temp: number;
  mcsa: number;
  load: number;
}

const CARD = "bg-slate-900/50 border border-white/10 rounded-xl p-6";

const TREND_SERIES: SpectrumPoint[] = [
  { date: "Jul 05", vibration: 2.1, peak: 3.2, oneX: 1.4, bpfo: 0.18, bpfi: 0.12, temp: 62, mcsa: 1.1, load: 82 },
  { date: "Jul 12", vibration: 2.3, peak: 3.5, oneX: 1.55, bpfo: 0.22, bpfi: 0.14, temp: 64, mcsa: 1.2, load: 85 },
  { date: "Jul 19", vibration: 2.6, peak: 3.9, oneX: 1.8, bpfo: 0.28, bpfi: 0.18, temp: 67, mcsa: 1.35, load: 88 },
  { date: "Jul 26", vibration: 2.95, peak: 4.4, oneX: 2.1, bpfo: 0.36, bpfi: 0.24, temp: 71, mcsa: 1.5, load: 92 },
  { date: "Aug 03", vibration: 3.45, peak: 5.2, oneX: 2.55, bpfo: 0.48, bpfi: 0.31, temp: 76, mcsa: 1.75, load: 96 }
];

const EVENT_MARKERS = [
  { date: "Jul 12", kind: "Maintenance", label: "Maintenance", color: "#eab308" },
  { date: "Jul 19", kind: "Lubrication", label: "Lubrication", color: "#3b82f6" },
  { date: "Jul 26", kind: "Alarm", label: "Alarm Triggered", color: "#ef4444" }
];

const TREND_TECH_OPTIONS = [
  { id: "vibration", label: "Vibration", Icon: Activity },
  { id: "thermography", label: "Thermography", Icon: Thermometer },
  { id: "ultrasound", label: "Ultrasound", Icon: AudioWaveform },
  { id: "mca", label: "MCA", Icon: Zap },
  { id: "oil", label: "Oil Analysis", Icon: Droplet }
] as const;

const FFT_A = [
  { hz: 0, amp: 0.2 },
  { hz: 30, amp: 1.4 },
  { hz: 60, amp: 2.1 },
  { hz: 90, amp: 0.8 },
  { hz: 120, amp: 1.1 },
  { hz: 150, amp: 0.45 },
  { hz: 180, amp: 0.7 },
  { hz: 210, amp: 0.35 },
  { hz: 240, amp: 0.55 },
  { hz: 300, amp: 0.25 }
];

const FFT_B = [
  { hz: 0, amp: 0.25 },
  { hz: 30, amp: 2.55 },
  { hz: 60, amp: 1.9 },
  { hz: 90, amp: 1.2 },
  { hz: 120, amp: 1.8 },
  { hz: 150, amp: 0.9 },
  { hz: 180, amp: 1.4 },
  { hz: 210, amp: 0.7 },
  { hz: 240, amp: 1.1 },
  { hz: 300, amp: 0.5 }
];

const FFT_OVERLAY = FFT_A.map((point, i) => ({
  hz: point.hz,
  ampA: point.amp,
  ampB: FFT_B[i]?.amp ?? 0
}));

const DOMINANT_FREQ_ROWS = [
  { feature: "1X Running Speed", a: "1.40 mm/s @ 30 Hz", b: "2.55 mm/s @ 30 Hz", fault: "Misalignment rising" },
  { feature: "2X Harmonic", a: "0.55 mm/s @ 60 Hz", b: "1.10 mm/s @ 60 Hz", fault: "Coupling / soft foot" },
  { feature: "BPFO", a: "0.18 mm/s @ 124 Hz", b: "0.48 mm/s @ 124 Hz", fault: "Outer race wear" },
  { feature: "BPFI", a: "0.12 mm/s @ 186 Hz", b: "0.31 mm/s @ 186 Hz", fault: "Inner race early stage" }
];

type VibMode = "broadband" | "spectral" | "enveloping" | "waveform";

const VIB_MODE_OPTIONS: { id: VibMode; label: string }[] = [
  { id: "broadband", label: "⚡ Broadband & ISO 20816" },
  { id: "spectral", label: "Spectral & Harmonics" },
  { id: "enveloping", label: "🔬 Enveloping & Bearing" },
  { id: "waveform", label: "🌀 Waveform & Phase" }
];

const VIB_SPECTRAL = [
  { date: "Jul 05", oneX: 1.4, twoX: 0.55, harmonics: 0.32, vpf: 0.18, gmf: 0.22 },
  { date: "Jul 12", oneX: 1.55, twoX: 0.62, harmonics: 0.38, vpf: 0.2, gmf: 0.25 },
  { date: "Jul 19", oneX: 1.8, twoX: 0.78, harmonics: 0.48, vpf: 0.24, gmf: 0.28 },
  { date: "Jul 26", oneX: 2.1, twoX: 0.95, harmonics: 0.62, vpf: 0.31, gmf: 0.34 },
  { date: "Aug 03", oneX: 2.55, twoX: 1.1, harmonics: 0.78, vpf: 0.38, gmf: 0.42 }
];

const VIB_ENVELOPE = [
  { date: "Jul 05", gse: 1.2, bpfo: 0.18, bpfi: 0.12, bsf: 0.08, ftf: 0.05 },
  { date: "Jul 12", gse: 1.45, bpfo: 0.22, bpfi: 0.14, bsf: 0.1, ftf: 0.06 },
  { date: "Jul 19", gse: 1.8, bpfo: 0.28, bpfi: 0.18, bsf: 0.14, ftf: 0.08 },
  { date: "Jul 26", gse: 2.35, bpfo: 0.36, bpfi: 0.24, bsf: 0.2, ftf: 0.11 },
  { date: "Aug 03", gse: 3.1, bpfo: 0.48, bpfi: 0.31, bsf: 0.28, ftf: 0.15 }
];

const VIB_BEARING_STAGES = [
  { id: 1, label: "Stage 1: Ultrasonic Activity", tone: "green" as const },
  { id: 2, label: "Stage 2: Natural Frequency Ringing", tone: "yellow" as const },
  { id: 3, label: "Stage 3: Defect Harmonics in FFT", tone: "orange" as const },
  { id: 4, label: "Stage 4: Broadband White Noise / Imminent Failure", tone: "red" as const }
];

const VIB_PHASE = [
  { date: "Jul 05", phase: 42 },
  { date: "Jul 12", phase: 48 },
  { date: "Jul 19", phase: 55 },
  { date: "Jul 26", phase: 78 },
  { date: "Aug 03", phase: 112 }
];

const VIB_WAVEFORM = Array.from({ length: 80 }, (_, i) => {
  const t = i * 0.5; // ms
  const carrier = Math.sin((i / 80) * Math.PI * 8) * 2.2;
  const impact =
    i % 16 === 0 ? 4.5 + (i % 7) * 0.15 : i % 16 === 1 ? 2.8 : 0;
  return { t: Number(t.toFixed(1)), amp: Number((carrier + impact * (i % 2 === 0 ? 1 : -0.6)).toFixed(3)) };
});

const VIB_ORBIT = Array.from({ length: 72 }, (_, i) => {
  const a = (i / 72) * Math.PI * 2;
  const rx = 1.0;
  const ry = 0.62;
  return {
    x: Number((Math.cos(a) * rx + Math.cos(a * 2) * 0.08).toFixed(3)),
    y: Number((Math.sin(a) * ry + Math.sin(a * 3) * 0.05).toFixed(3))
  };
});

const VIB_ISO_ZONES = [
  { id: "A", label: "Zone A — Good", width: "22%", color: "bg-green-500" },
  { id: "B", label: "Zone B — Acceptable", width: "28%", color: "bg-yellow-500" },
  { id: "C", label: "Zone C — Warning", width: "28%", color: "bg-orange-500" },
  { id: "D", label: "Zone D — Critical", width: "22%", color: "bg-red-500" }
];

const VIB_TRIAXIAL = [
  { axis: "Horizontal (H)", value: 3.45, unit: "mm/s RMS", tone: "text-yellow-500" },
  { axis: "Vertical (V)", value: 2.18, unit: "mm/s RMS", tone: "text-green-400" },
  { axis: "Axial (A)", value: 2.92, unit: "mm/s RMS", tone: "text-orange-400" }
];

const IR_EVENT_MARKERS = [
  { date: "Jul 12", kind: "Torque", label: "Torque Check", color: "#eab308" },
  { date: "Jul 19", kind: "Clean", label: "Cleaned Contacts", color: "#3b82f6" },
  { date: "Jul 26", kind: "Alarm", label: "Alarm Triggered", color: "#ef4444" }
];

const IR_TREND = [
  { date: "Jul 05", hotspot: 48.5, ambient: 22.0, deltaT: 26.5, phaseAB: 5.5, phaseBC: 6.4, phaseAC: 0.9, tNorm: 51.2 },
  { date: "Jul 12", hotspot: 52.0, ambient: 23.5, deltaT: 28.5, phaseAB: 6.0, phaseBC: 8.1, phaseAC: 1.2, tNorm: 54.8 },
  { date: "Jul 19", hotspot: 55.4, ambient: 24.0, deltaT: 31.4, phaseAB: 6.8, phaseBC: 10.2, phaseAC: 1.5, tNorm: 58.1 },
  { date: "Jul 26", hotspot: 64.8, ambient: 25.2, deltaT: 39.6, phaseAB: 7.2, phaseBC: 18.5, phaseAC: 2.0, tNorm: 67.4 },
  { date: "Aug 03", hotspot: 78.4, ambient: 50.2, deltaT: 28.2, phaseAB: 8.4, phaseBC: 35.4, phaseAC: 1.2, tNorm: 78.4 }
];

const IR_SPOT_COMPARE = [
  { phase: "Phase A Spot", a: "42.1°C", b: "43.0°C", note: "Normal", tone: "green" as const },
  { phase: "Phase B Spot", a: "48.5°C", b: "78.4°C", note: "+29.9°C Rise", tone: "red" as const },
  { phase: "Phase C Spot", a: "43.0°C", b: "44.2°C", note: "Normal", tone: "green" as const }
];

type IrMode = "hotspot" | "phase" | "radiometric" | "mechanical";
type IrPalette = "ironbow" | "rainbow" | "grayscale" | "contrast";

const IR_MODE_OPTIONS: { id: IrMode; label: string }[] = [
  { id: "hotspot", label: "🔥 Hotspot & NETA Severity" },
  { id: "phase", label: "⚡ Phase Delta & I²R Load" },
  { id: "radiometric", label: "🖼️ Radiometric & Isotherm" },
  { id: "mechanical", label: "🧱 Mechanical & Refractory" }
];

const IR_PALETTE_OPTIONS: { id: IrPalette; label: string; gradient: string }[] = [
  {
    id: "ironbow",
    label: "🔥 Ironbow",
    gradient: "bg-gradient-to-br from-blue-900 via-purple-800 to-red-600"
  },
  {
    id: "rainbow",
    label: "🌈 Rainbow",
    gradient: "bg-gradient-to-br from-indigo-700 via-green-500 to-yellow-300"
  },
  {
    id: "grayscale",
    label: "⚪ Grayscale",
    gradient: "bg-gradient-to-br from-black via-slate-500 to-white"
  },
  {
    id: "contrast",
    label: "🎛️ High Contrast",
    gradient: "bg-gradient-to-br from-slate-950 via-cyan-700 to-yellow-300"
  }
];

const IR_BEARING_TREND = [
  { date: "Jul 05", de: 58.2, nde: 54.1 },
  { date: "Jul 12", de: 61.0, nde: 55.4 },
  { date: "Jul 19", de: 64.8, nde: 56.2 },
  { date: "Jul 26", de: 71.5, nde: 58.0 },
  { date: "Aug 03", de: 79.2, nde: 59.4 }
];

const IR_EMISSIVITY_MATERIALS = [
  { id: "copper", label: "Oxidized Copper Busbar (0.65)", epsilon: 0.65 },
  { id: "paint", label: "Painted Enclosure (0.95)", epsilon: 0.95 },
  { id: "aluminum", label: "Polished Aluminum (0.20)", epsilon: 0.2 }
] as const;

type UeMode = "bearings" | "leaks" | "electrical" | "steam";

const UE_MODE_OPTIONS: { id: UeMode; label: string }[] = [
  { id: "bearings", label: "Bearings & Mechanical" },
  { id: "leaks", label: "Compressed Air Leaks" },
  { id: "electrical", label: "Electrical PD" },
  { id: "steam", label: "Steam Traps" }
];

const UE_TREND = [
  { date: "Jul 05", rms: 22.1, peak: 38.0, crest: 2.1 },
  { date: "Jul 12", rms: 24.8, peak: 52.0, crest: 2.8 },
  { date: "Jul 19", rms: 26.5, peak: 61.0, crest: 3.2 },
  { date: "Jul 26", rms: 30.1, peak: 78.0, crest: 3.5 },
  { date: "Aug 03", rms: 34.2, peak: 92.0, crest: 3.8 }
];

const UE_LUBE_DELTA = [
  { label: "Pre-Grease dB", value: 34.2, fill: "#ef4444" },
  { label: "Post-Grease dB", value: 22.4, fill: "#22c55e" }
];

const UE_WAVEFORM = Array.from({ length: 51 }, (_, i) => {
  const t = i * 10; // 0–500 ms
  const base = Math.sin(i / 3) * 4;
  const burst =
    (t > 80 && t < 110) || (t > 210 && t < 235) || (t > 360 && t < 390)
      ? 28 + ((i * 7) % 18)
      : Math.abs(base) + ((i * 3) % 3);
  return { ms: t, amp: Number(burst.toFixed(1)) };
});

const UE_COMPARE_ROWS = [
  { metric: "RMS (dBµV)", a: "22.1", b: "34.2", delta: "+12.1" },
  { metric: "Max RMS (dBµV)", a: "24.0", b: "36.8", delta: "+12.8" },
  { metric: "Peak (dBµV)", a: "38.0", b: "92.0", delta: "+54.0" },
  { metric: "Crest Factor", a: "2.1", b: "3.8", delta: "+1.7" },
  { metric: "Kurtosis", a: "3.2", b: "6.9", delta: "+3.7" }
];

const UE_EVENT_MARKERS = [
  { date: "Jul 12", kind: "Inspect", label: "Inspection", color: "#eab308" },
  { date: "Jul 19", kind: "Lube", label: "Lubrication", color: "#3b82f6" },
  { date: "Jul 26", kind: "Alarm", label: "Alarm Triggered", color: "#ef4444" }
];

const UE_CFM_TREND = [
  { date: "Jul 05", cfm: 2.1 },
  { date: "Jul 12", cfm: 2.6 },
  { date: "Jul 19", cfm: 3.1 },
  { date: "Jul 26", cfm: 3.7 },
  { date: "Aug 03", cfm: 4.2 }
];

const UE_PRPD_CORONA = [
  { phase: 85, amp: 22 },
  { phase: 90, amp: 38 },
  { phase: 95, amp: 28 },
  { phase: 265, amp: 24 },
  { phase: 270, amp: 41 },
  { phase: 275, amp: 30 },
  { phase: 88, amp: 18 },
  { phase: 272, amp: 20 }
];

const UE_PRPD_TRACKING = [
  { phase: 40, amp: 26 },
  { phase: 55, amp: 34 },
  { phase: 70, amp: 29 },
  { phase: 110, amp: 16 },
  { phase: 130, amp: 22 },
  { phase: 200, amp: 19 },
  { phase: 220, amp: 27 },
  { phase: 245, amp: 31 }
];

const UE_PRPD_ARCING = [
  { phase: 15, amp: 36 },
  { phase: 48, amp: 44 },
  { phase: 102, amp: 39 },
  { phase: 155, amp: 47 },
  { phase: 178, amp: 33 },
  { phase: 210, amp: 42 },
  { phase: 298, amp: 45 },
  { phase: 330, amp: 37 },
  { phase: 350, amp: 40 }
];

const UE_AC_SINE = Array.from({ length: 73 }, (_, i) => {
  const phase = i * 5;
  return {
    phase,
    sine: Number((25 + 18 * Math.sin((phase * Math.PI) / 180)).toFixed(2))
  };
});

const UE_STEAM_ENV = [
  { date: "Jul 05", upstream: 48, downstream: 44 },
  { date: "Jul 12", upstream: 49, downstream: 41 },
  { date: "Jul 19", upstream: 51, downstream: 38 },
  { date: "Jul 26", upstream: 52, downstream: 36 },
  { date: "Aug 03", upstream: 54, downstream: 33 }
];

type McaMode = "winding" | "insulation" | "rotor" | "surge";

const MCA_MODE_OPTIONS: { id: McaMode; label: string; icon: "settings" | "zap" | "activity" | "waves" }[] = [
  { id: "winding", label: "Winding & Phase Balance", icon: "settings" },
  { id: "insulation", label: "Groundwall Insulation", icon: "zap" },
  { id: "rotor", label: "Rotor Influence Check", icon: "activity" },
  { id: "surge", label: "Surge Waveforms", icon: "waves" }
];

const MCA_FAULT_ZONES = [
  { id: "power_quality", name: "Power Quality", score: "100%", tone: "green" as const },
  { id: "power_circuit", name: "Power Circuit", score: "98%", tone: "green" as const },
  { id: "stator", name: "Stator Winding", score: "74%", tone: "yellow" as const },
  { id: "rotor", name: "Rotor Bar", score: "100%", tone: "green" as const },
  { id: "air_gap", name: "Air Gap", score: "95%", tone: "green" as const },
  { id: "insulation", name: "Insulation Ground", score: "100%", tone: "green" as const }
];

const MCA_PHASE_TREND = [
  { date: "Jul 05", rA: 1.82, rB: 1.81, rC: 1.83, lA: 42.1, lB: 41.8, lC: 42.4, pA: 58.2, pB: 59.1, pC: 57.8, tvs: 98.2 },
  { date: "Jul 12", rA: 1.83, rB: 1.82, rC: 1.84, lA: 42.0, lB: 41.6, lC: 42.5, pA: 58.0, pB: 59.4, pC: 57.5, tvs: 96.8 },
  { date: "Jul 19", rA: 1.84, rB: 1.82, rC: 1.85, lA: 41.9, lB: 41.4, lC: 42.6, pA: 57.8, pB: 59.8, pC: 57.2, tvs: 94.5 },
  { date: "Jul 26", rA: 1.85, rB: 1.83, rC: 1.86, lA: 41.7, lB: 41.2, lC: 42.8, pA: 57.5, pB: 60.2, pC: 56.9, tvs: 91.2 },
  { date: "Aug 03", rA: 1.86, rB: 1.83, rC: 1.87, lA: 41.5, lB: 41.0, lC: 42.9, pA: 57.2, pB: 60.6, pC: 56.5, tvs: 88.4 }
];

const MCA_IR_TREND = [
  { date: "Jul 05", raw: 850, corrected: 920 },
  { date: "Jul 12", raw: 820, corrected: 890 },
  { date: "Jul 19", raw: 780, corrected: 860 },
  { date: "Jul 26", raw: 740, corrected: 820 },
  { date: "Aug 03", raw: 710, corrected: 795 }
];

const MCA_PI_TREND = [
  { date: "Jul 05", pi: 2.8 },
  { date: "Jul 12", pi: 2.7 },
  { date: "Jul 19", pi: 2.6 },
  { date: "Jul 26", pi: 2.5 },
  { date: "Aug 03", pi: 2.4 }
];

const MCA_DAR_TREND = [
  { date: "Jul 05", dar: 1.45 },
  { date: "Jul 12", dar: 1.42 },
  { date: "Jul 19", dar: 1.40 },
  { date: "Jul 26", dar: 1.38 },
  { date: "Aug 03", dar: 1.35 }
];

const MCA_CG_TREND = [
  { date: "Jul 05", cg: 12.2 },
  { date: "Jul 12", cg: 12.4 },
  { date: "Jul 19", cg: 12.6 },
  { date: "Jul 26", cg: 12.8 },
  { date: "Aug 03", cg: 13.1 }
];

const MCA_TAN_DELTA = [
  { date: "Jul 05", tan: 1.2 },
  { date: "Jul 12", tan: 1.3 },
  { date: "Jul 19", tan: 1.4 },
  { date: "Jul 26", tan: 1.55 },
  { date: "Aug 03", tan: 1.7 }
];

/** 3-phase RIC polar data — Phase C dented ~120° simulates rotor influence */
const MCA_RIC_DATA = [
  { angle: "0°", phaseA: 42.0, phaseB: 41.9, phaseC: 42.1 },
  { angle: "30°", phaseA: 41.8, phaseB: 41.7, phaseC: 41.9 },
  { angle: "60°", phaseA: 41.5, phaseB: 41.6, phaseC: 41.4 },
  { angle: "90°", phaseA: 41.2, phaseB: 41.3, phaseC: 40.0 },
  { angle: "120°", phaseA: 41.0, phaseB: 41.1, phaseC: 37.4 },
  { angle: "150°", phaseA: 41.3, phaseB: 41.4, phaseC: 39.2 },
  { angle: "180°", phaseA: 41.6, phaseB: 41.5, phaseC: 41.5 },
  { angle: "210°", phaseA: 41.9, phaseB: 41.8, phaseC: 42.0 },
  { angle: "240°", phaseA: 42.0, phaseB: 41.9, phaseC: 42.1 },
  { angle: "270°", phaseA: 41.7, phaseB: 41.6, phaseC: 41.8 },
  { angle: "300°", phaseA: 41.8, phaseB: 41.7, phaseC: 41.9 },
  { angle: "330°", phaseA: 41.9, phaseB: 41.8, phaseC: 42.0 }
];

const MCA_SURGE_WAVE = Array.from({ length: 61 }, (_, i) => {
  const t = i * 0.5; // µs
  const decay = Math.exp(-t / 8);
  const phase1 = 5.0 * Math.sin(t * 1.8) * decay;
  const phase2 = 5.0 * Math.sin(t * 1.8 + 0.05) * decay;
  const phase3 = 5.0 * Math.sin(t * 1.8 + 0.22) * decay * 0.96; // EAR mismatch offset
  const baseline = 5.0 * Math.sin(t * 1.8 + 0.02) * decay * 0.99; // Jul 05 baseline
  return {
    us: Number(t.toFixed(1)),
    p1: Number(phase1.toFixed(3)),
    p2: Number(phase2.toFixed(3)),
    p3: Number(phase3.toFixed(3)),
    baseline: Number(baseline.toFixed(3))
  };
});

type McaEarMode = "pulse" | "line";

type OilMode = "wear" | "chemistry" | "cleanliness" | "ferrography";

const OIL_MODE_OPTIONS: { id: OilMode; label: string }[] = [
  { id: "wear", label: "🔩 Wear Metals & Debris" },
  { id: "chemistry", label: "🧪 Fluid Chemistry" },
  { id: "cleanliness", label: "🧹 Cleanliness" },
  { id: "ferrography", label: "Ferrography & Varnish" }
];

const OIL_WEAR_TREND = [
  { date: "Jul 05", fe: 28, si: 8, cu: 12, pb: 4, al: 6, cr: 2, pq: 12 },
  { date: "Jul 12", fe: 32, si: 12, cu: 14, pb: 5, al: 7, cr: 3, pq: 15 },
  { date: "Jul 19", fe: 48, si: 45, cu: 18, pb: 9, al: 11, cr: 5, pq: 28 },
  { date: "Jul 26", fe: 72, si: 38, cu: 26, pb: 14, al: 16, cr: 8, pq: 41 },
  { date: "Aug 03", fe: 82, si: 35, cu: 31, pb: 18, al: 19, cr: 10, pq: 48 }
];

const OIL_ISO_PROGRESSION = [
  { date: "Jul 05", code: 15 },
  { date: "Jul 19", code: 17 },
  { date: "Aug 03", code: 18 }
];

type OilCorrelationPair = "fe-si" | "cu-pb" | "al-cr";

const OIL_CORRELATION_OPTIONS: {
  id: OilCorrelationPair;
  label: string;
  leftKey: "fe" | "cu" | "al";
  rightKey: "si" | "pb" | "cr";
  leftName: string;
  rightName: string;
  leftColor: string;
  rightColor: string;
}[] = [
  {
    id: "fe-si",
    label: "Fe (Iron) vs Si (Dirt Ingress)",
    leftKey: "fe",
    rightKey: "si",
    leftName: "Iron (Fe)",
    rightName: "Silicon (Si)",
    leftColor: "#ef4444",
    rightColor: "#a855f7"
  },
  {
    id: "cu-pb",
    label: "Cu (Copper) vs Pb (Bearing Babbitt)",
    leftKey: "cu",
    rightKey: "pb",
    leftName: "Copper (Cu)",
    rightName: "Lead (Pb)",
    leftColor: "#f59e0b",
    rightColor: "#64748b"
  },
  {
    id: "al-cr",
    label: "Al (Aluminum) vs Cr (Piston Rings)",
    leftKey: "al",
    rightKey: "cr",
    leftName: "Aluminum (Al)",
    rightName: "Chromium (Cr)",
    leftColor: "#22d3ee",
    rightColor: "#22c55e"
  }
];

const OIL_HEALTH_CARDS: {
  id: OilMode;
  title: string;
  value: string;
  valueClass: string;
  subtext: string;
}[] = [
  {
    id: "wear",
    title: "WEAR HEALTH",
    value: "72% - Warning",
    valueClass: "text-yellow-500",
    subtext: "High Fe (82 PPM)"
  },
  {
    id: "chemistry",
    title: "CHEMISTRY HEALTH",
    value: "88% - Good",
    valueClass: "text-green-400",
    subtext: "TAN/TBN Normal"
  },
  {
    id: "cleanliness",
    title: "CLEANLINESS HEALTH",
    value: "62% - Alert",
    valueClass: "text-red-500",
    subtext: "ISO Code 18/16/13"
  },
  {
    id: "ferrography",
    title: "VARNISH RISK",
    value: "45% - Elevated",
    valueClass: "text-orange-400",
    subtext: "MPC ΔE = 31"
  }
];

const OIL_TAN_TBN = [
  { date: "Jul 05", tan: 0.8, tbn: 8.2 },
  { date: "Jul 12", tan: 1.1, tbn: 7.4 },
  { date: "Jul 19", tan: 1.6, tbn: 6.1 },
  { date: "Jul 26", tan: 2.4, tbn: 4.2 },
  { date: "Aug 03", tan: 3.1, tbn: 3.0 } // crossover near Aug 03
];

const OIL_VISCOSITY = [
  { date: "Jul 05", visc: 46.2, low: 41.4, high: 50.6 },
  { date: "Jul 12", visc: 47.1, low: 41.4, high: 50.6 },
  { date: "Jul 19", visc: 48.8, low: 41.4, high: 50.6 },
  { date: "Jul 26", visc: 51.2, low: 41.4, high: 50.6 },
  { date: "Aug 03", visc: 52.4, low: 41.4, high: 50.6 }
];

const OIL_MOISTURE = [
  { date: "Jul 05", ppm: 85 },
  { date: "Jul 12", ppm: 110 },
  { date: "Jul 19", ppm: 145 },
  { date: "Jul 26", ppm: 190 },
  { date: "Aug 03", ppm: 235 }
];

const OIL_MPC = [
  { date: "Jul 05", de: 8 },
  { date: "Jul 12", de: 12 },
  { date: "Jul 19", de: 18 },
  { date: "Jul 26", de: 24 },
  { date: "Aug 03", de: 31 }
];

const OIL_PATCHES = [
  {
    id: "cutting",
    title: "Patch A — Cutting Wear",
    label: "Cutting Wear",
    box: "border-red-500 text-red-400",
    boxPos: "top-6 left-6",
    caption:
      "Particle Morphology: Cutting Wear (Long, curled metallic ribbons indicating severe abrasive wear)."
  },
  {
    id: "fatigue",
    title: "Patch B — Fatigue Spalling",
    label: "Fatigue Spalling",
    box: "border-yellow-500 text-yellow-400",
    boxPos: "top-10 right-8",
    caption:
      "Particle Morphology: Fatigue Spalling (Platelets with smooth surfaces and irregular edges from cyclic stress)."
  },
  {
    id: "oxides",
    title: "Patch C — Red Oxides",
    label: "Red Oxides",
    box: "border-orange-500 text-orange-400",
    boxPos: "bottom-8 left-10",
    caption:
      "Particle Morphology: Red Oxides (Iron oxide clusters indicating moisture-driven corrosion)."
  }
];

function buildRulCone(speedFactor: number) {
  // Higher operational speed accelerates degradation → shorter RUL
  const accel = Math.max(0.5, Math.min(2, speedFactor));
  const days = [0, 7, 14, 21, 28, 35, 42];
  return days.map((day) => {
    const mostLikely = 3.45 + (day / 14) * 1.2 * accel;
    const best = mostLikely - 0.35 * (day / 14) - 0.1;
    const worst = mostLikely + 0.55 * (day / 14) * accel;
    return {
      day: `D+${day}`,
      best: Number(best.toFixed(2)),
      mostLikely: Number(mostLikely.toFixed(2)),
      worst: Number(worst.toFixed(2)),
      alarm: 7.1
    };
  });
}

const chartMargin = { top: 16, right: 24, bottom: 12, left: 48 };

const tooltipStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid #334155",
  borderRadius: "8px",
  color: "#e2e8f0",
  fontSize: 12
};

/** Shared maintenance / lubrication / alarm vertical markers for all trend charts */
function EventBadgeLabel(props: {
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
  value?: string;
  fill?: string;
}) {
  const { viewBox, value, fill } = props;
  if (!viewBox || value == null) return null;
  const x = viewBox.x ?? 0;
  const y = viewBox.y ?? 0;
  return (
    <foreignObject x={x - 48} y={y - 22} width={96} height={24} style={{ overflow: "visible" }}>
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        className="bg-slate-900/90 px-1.5 py-0.5 rounded text-[10px] border border-slate-700 shadow-sm text-center font-semibold -translate-y-1 whitespace-nowrap"
        style={{ color: fill ?? "#e2e8f0" }}
      >
        {value}
      </div>
    </foreignObject>
  );
}

function EventMarkerLines({
  yAxisId,
  markers = EVENT_MARKERS,
  badgeLabels = false
}: {
  yAxisId?: string;
  markers?: typeof EVENT_MARKERS | typeof IR_EVENT_MARKERS | typeof UE_EVENT_MARKERS;
  badgeLabels?: boolean;
}) {
  return (
    <>
      {markers.map((ev) => (
        <ReferenceLine
          key={`${ev.date}-${ev.kind}`}
          x={ev.date}
          {...(yAxisId ? { yAxisId } : {})}
          stroke={ev.color}
          strokeWidth={2}
          strokeDasharray="4 3"
          label={
            badgeLabels
              ? {
                  position: "top",
                  content: (props: {
                    viewBox?: { x?: number; y?: number; width?: number; height?: number };
                  }) => (
                    <EventBadgeLabel
                      viewBox={props.viewBox}
                      value={ev.label}
                      fill={ev.color}
                    />
                  )
                }
              : {
                  value: ev.label,
                  position: "insideTop",
                  fill: ev.color,
                  fontSize: 10,
                  fontWeight: 600
                }
          }
        />
      ))}
    </>
  );
}

export default function TrendAnalyzer({
  trendData,
  onAddTrendPoint,
  selectedAssetId,
  selectedCompanyId
}: TrendAnalyzerProps) {
  void trendData;
  void onAddTrendPoint;
  void selectedAssetId;
  void selectedCompanyId;

  const [selectedRoute, setSelectedRoute] = useState("Boiler Feed System");
  const [selectedAsset, setSelectedAsset] = useState("Boiler Feed Pump A - P-101A");
  const [selectedComponent, setSelectedComponent] = useState("Motor DE");
  const [trendTech, setTrendTech] = useState("vibration");
  const [vibMode, setVibMode] = useState<VibMode>("broadband");
  const [spectrumView, setSpectrumView] = useState<"side-by-side" | "overlay">("side-by-side");
  const [irMode, setIrMode] = useState<IrMode>("hotspot");
  const [irPalette, setIrPalette] = useState<IrPalette>("ironbow");
  const [irPlantLoad, setIrPlantLoad] = useState(82);
  const [isothermCutoff, setIsothermCutoff] = useState(65);
  const [customEpsilon, setCustomEpsilon] = useState(0.88);
  const [useCustomEpsilon, setUseCustomEpsilon] = useState(false);
  const [irEmissivityMaterial, setIrEmissivityMaterial] =
    useState<(typeof IR_EMISSIVITY_MATERIALS)[number]["id"]>("paint");
  const [ueMode, setUeMode] = useState<UeMode>("bearings");
  const [ueAudioPlaying, setUeAudioPlaying] = useState(false);
  const [showLubeDrawer, setShowLubeDrawer] = useState(false);
  const [mcaMode, setMcaMode] = useState<McaMode>("winding");
  const [irIeeeCorrected, setIrIeeeCorrected] = useState(false);
  const [mcaEarMode, setMcaEarMode] = useState<McaEarMode>("pulse");
  const [showBaseline, setShowBaseline] = useState(false);
  const [testLocation, setTestLocation] = useState<"MCC" | "JBOX">("MCC");
  const [activeFaultZone, setActiveFaultZone] = useState<string | null>(null);
  const [showThresholds, setShowThresholds] = useState(true);
  const [oilMode, setOilMode] = useState<OilMode>("wear");
  const [correlationPair, setCorrelationPair] = useState<OilCorrelationPair>("fe-si");
  const [selectedPatch, setSelectedPatch] = useState<string | null>(null);
  const [patchZoom, setPatchZoom] = useState<"100x" | "400x">("100x");
  const [timeRange, setTimeRange] = useState<TimeRange>("30D");
  const [runningOnly, setRunningOnly] = useState(true);
  const [overlayParam, setOverlayParam] = useState<OverlayParam>(null);
  const [speedFactor, setSpeedFactor] = useState(1.0);
  const [selectedPointA, setSelectedPointA] = useState<SpectrumPoint | null>(null);
  const [selectedPointB, setSelectedPointB] = useState<SpectrumPoint | null>(null);
  const [nextPick, setNextPick] = useState<"A" | "B">("A");

  const selectClass =
    "bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 outline-none w-full";

  const rulData = useMemo(() => buildRulCone(speedFactor), [speedFactor]);
  const projectedRulDays = Math.max(3, Math.round(14 / speedFactor));
  const oilCorrelation =
    OIL_CORRELATION_OPTIONS.find((o) => o.id === correlationPair) ?? OIL_CORRELATION_OPTIONS[0];
  const selectedPatchData = OIL_PATCHES.find((p) => p.id === selectedPatch) ?? null;
  const activeIrPalette =
    IR_PALETTE_OPTIONS.find((p) => p.id === irPalette) ?? IR_PALETTE_OPTIONS[0];
  const activeIrEpsilon = useCustomEpsilon
    ? customEpsilon
    : IR_EMISSIVITY_MATERIALS.find((m) => m.id === irEmissivityMaterial)?.epsilon ?? 0.95;
  // I²R-style projection anchored so 82% ≈ 78.4°C and 100% ≈ 92.4°C
  const projectedPhaseBHotspot = Number(
    (24.2 + (78.4 - 24.2) * Math.pow(irPlantLoad / 82, 1.16)).toFixed(1)
  );
  const projectedLoadCritical = projectedPhaseBHotspot > 80;

  const handlePointClick = (point: SpectrumPoint) => {
    if (nextPick === "A") {
      setSelectedPointA(point);
      setNextPick("B");
    } else {
      setSelectedPointB(point);
      setNextPick("A");
    }
  };

  const spectrumALabel = selectedPointA?.date ?? "Jul 05";
  const spectrumBLabel = selectedPointB?.date ?? "Aug 03";

  return (
    <div className="w-full min-w-0 bg-slate-950 text-slate-100">
      {/* ===== SECTION 1: TOP FILTER (Dropdowns → Tech → Time Range) ===== */}
      <div className={`${CARD} mb-4`}>
        {/* Asset selection — always first */}
        <div className="mb-4">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1 min-w-0">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                  Select Route
                </label>
                <select
                  value={selectedRoute}
                  onChange={(e) => setSelectedRoute(e.target.value)}
                  className={selectClass}
                >
                  <option value="Boiler Feed System">Boiler Feed System</option>
                  <option value="Cooling Water Loop">Cooling Water Loop</option>
                  <option value="Extrusion Line 2">Extrusion Line 2</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                  Select Asset
                </label>
                <select
                  value={selectedAsset}
                  onChange={(e) => setSelectedAsset(e.target.value)}
                  className={selectClass}
                >
                  <option value="Boiler Feed Pump A - P-101A">Boiler Feed Pump A - P-101A</option>
                  <option value="Extruder Gearbox GB-302">Extruder Gearbox GB-302</option>
                  <option value="Cooling Tower Fan 4">Cooling Tower Fan 4</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                  Select Component
                </label>
                <select
                  value={selectedComponent}
                  onChange={(e) => setSelectedComponent(e.target.value)}
                  className={selectClass}
                >
                  <option value="Motor DE">Motor DE</option>
                  <option value="Motor NDE">Motor NDE</option>
                  <option value="Pump DE">Pump DE</option>
                  <option value="Pump NDE">Pump NDE</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                /* Search functionality to be implemented */
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 text-xs font-semibold cursor-pointer transition-colors shrink-0"
            >
              <Search className="h-3.5 w-3.5" />
              Search Asset
            </button>
          </div>
        </div>

        {/* Technology switcher — Diagnose-style large hollow boxes */}
        <div className="grid grid-cols-5 gap-4 mb-6 pb-4 border-b border-white/10">
          {TREND_TECH_OPTIONS.map((tech) => {
            const Icon = tech.Icon;
            const isActive = trendTech === tech.id;
            return (
              <button
                key={tech.id}
                type="button"
                onClick={() => setTrendTech(tech.id)}
                className={`border rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                  isActive
                    ? "bg-yellow-500/10 border-yellow-500 text-yellow-400"
                    : "bg-transparent border-white/30 hover:border-yellow-500 hover:bg-white/5 text-slate-300"
                }`}
              >
                <Icon size={24} className="shrink-0" />
                <span className="text-white font-medium text-sm">{tech.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mr-1">
              Time Range
            </span>
            {(["7D", "30D", "90D", "1Y", "Custom"] as TimeRange[]).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setTimeRange(range)}
                className={`px-2.5 py-1 rounded text-xs border transition-colors cursor-pointer ${
                  timeRange === range
                    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 font-bold"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                {range}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setRunningOnly((v) => !v)}
              className={`ml-0 sm:ml-2 px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer ${
                runningOnly
                  ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 font-semibold"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              }`}
            >
              {runningOnly ? "✔ " : ""}Running State Only (&gt;80% Load)
            </button>
          </div>

          <button
            type="button"
            onClick={() => alert("Exporting trend package…")}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 text-white hover:bg-slate-800 text-xs font-semibold cursor-pointer transition-colors shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* ===== VIBRATION TECH CONTENT ===== */}
      {trendTech === "vibration" && (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {VIB_MODE_OPTIONS.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setVibMode(mode.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                  vibMode === mode.id
                    ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {[
              "MACHINE CLASS: Class III (Rigid Foundation, >300kW)",
              "RUNNING SPEED: 1,780 RPM (29.6 Hz)",
              "BEARING: SKF 6214 (BPFO: 3.58X)"
            ].map((pill) => (
              <div
                key={pill}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300"
              >
                {pill}
              </div>
            ))}
          </div>

          {vibMode === "broadband" && (
            <>
      {/* ===== SECTION 2: KPI RIBBON & PREDICTIVE BANNER ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
            KPI Summary
          </p>
          <ul className="space-y-2.5">
            <li className="text-sm font-bold text-white">Velocity: 3.45 mm/s RMS</li>
            <li className="text-sm font-semibold text-yellow-500">ISO Zone: C (Warning)</li>
            <li className="text-sm font-semibold text-red-500">RUL: {projectedRulDays} Days</li>
            <li className="text-sm font-semibold text-green-400">Acquisition: Real-time</li>
          </ul>
        </div>

        <div className={`${CARD} md:col-span-2`}>
          <div className="flex items-start gap-3 mb-3">
            <Sparkles className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white leading-relaxed">
                Steady degradation detected. 2X rising (misalignment signature); BPFO elevating.
              </p>
              <p className="text-sm text-slate-400 mt-2">
                Recommended Action: Schedule inspection within 14 days.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              alert("Opening modal to create Work Order for Pump P-101A (NDE)…")
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 text-sm font-bold cursor-pointer transition-colors"
          >
            <Wrench className="h-4 w-4" />
            + Create Work Order
          </button>
        </div>
      </div>

      {/* ===== SECTION 3: PRIMARY TREND CHARTS (2x2) ===== */}
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-xs text-slate-400">
          Click any data point to set as Spectrum A or B for comparison below.
          {selectedPointA && (
            <span className="text-yellow-400 ml-2">A: {selectedPointA.date}</span>
          )}
          {selectedPointB && (
            <span className="text-cyan-400 ml-2">B: {selectedPointB.date}</span>
          )}
          <span className="text-slate-500 ml-2">(next: Spectrum {nextPick})</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-widest">Overlay</span>
          {(["Temp", "MCSA", "Load"] as const).map((param) => (
            <button
              key={param}
              type="button"
              onClick={() => setOverlayParam((prev) => (prev === param ? null : param))}
              className={`px-2.5 py-1 rounded text-[10px] border cursor-pointer transition-colors ${
                overlayParam === param
                  ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 font-bold"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              }`}
            >
              + Add Overlay Parameter: {param}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Chart 1 */}
        <div className={CARD}>
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-yellow-500" />
              <h3 className="text-base font-bold text-white">Overall RMS Velocity</h3>
            </div>
            <p className="text-xs text-slate-400">
              Legend: 🟡 Maintenance | 🔵 Lubrication | 🔴 Alarm
            </p>
          </div>
          <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={TREND_SERIES}
                margin={chartMargin}
                onClick={(state) => {
                  const point = state?.activePayload?.[0]?.payload as SpectrumPoint | undefined;
                  if (point?.date) handlePointClick(point);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <YAxis
                  yAxisId="left"
                  stroke="#eab308"
                  tick={{ fontSize: 11 }}
                  label={{
                    value: "mm/s RMS",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#eab308",
                    fontSize: 11
                  }}
                />
                {overlayParam && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#22d3ee"
                    tick={{ fontSize: 11 }}
                  />
                )}
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <EventMarkerLines yAxisId="left" />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="vibration"
                  stroke="#eab308"
                  strokeWidth={2}
                  name="RMS Velocity"
                  dot={{ r: 4, cursor: "pointer" }}
                  activeDot={{ r: 6, cursor: "pointer" }}
                />
                {overlayParam === "Temp" && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="temp"
                    stroke="#22d3ee"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    name="Temp (°C)"
                    dot={false}
                  />
                )}
                {overlayParam === "MCSA" && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="mcsa"
                    stroke="#22d3ee"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    name="MCSA"
                    dot={false}
                  />
                )}
                {overlayParam === "Load" && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="load"
                    stroke="#22d3ee"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    name="Load (%)"
                    dot={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2 */}
        <div className={CARD}>
          <div className="flex flex-col gap-1 mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-400" />
              <h3 className="text-base font-bold text-white">Peak Velocity</h3>
            </div>
            <p className="text-xs text-slate-400">
              Legend: 🟡 Maintenance | 🔵 Lubrication | 🔴 Alarm
            </p>
          </div>
          <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={TREND_SERIES}
                margin={chartMargin}
                onClick={(state) => {
                  const point = state?.activePayload?.[0]?.payload as SpectrumPoint | undefined;
                  if (point?.date) handlePointClick(point);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <YAxis
                  stroke="#f97316"
                  tick={{ fontSize: 11 }}
                  label={{
                    value: "mm/s Peak",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#f97316",
                    fontSize: 11
                  }}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <EventMarkerLines />
                <Line
                  type="monotone"
                  dataKey="peak"
                  stroke="#f97316"
                  strokeWidth={2}
                  name="Peak Velocity"
                  dot={{ r: 4, cursor: "pointer" }}
                  activeDot={{ r: 6, cursor: "pointer" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ISO 20816 Severity Matrix */}
      <div className={`${CARD} mb-6`}>
        <h3 className="text-base font-bold text-white mb-1">ISO 20816 Severity Matrix</h3>
        <p className="text-xs text-slate-400 mb-4">
          Current asset marker at 3.45 mm/s RMS — Zone C (Warning)
        </p>
        <div className="relative">
          <div className="flex h-8 w-full overflow-hidden rounded-lg border border-white/10">
            {VIB_ISO_ZONES.map((zone) => (
              <div
                key={zone.id}
                className={`${zone.color} h-full flex items-center justify-center text-[10px] font-bold text-slate-950`}
                style={{ width: zone.width }}
                title={zone.label}
              >
                {zone.id}
              </div>
            ))}
          </div>
          <div
            className="absolute -top-1 flex flex-col items-center"
            style={{ left: "58%" }}
          >
            <div className="w-0.5 h-10 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
            <span className="mt-1 text-[10px] font-bold text-white bg-slate-950 border border-white/20 px-1.5 py-0.5 rounded whitespace-nowrap">
              3.45 mm/s
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-8 text-[10px] text-slate-400">
          {VIB_ISO_ZONES.map((zone) => (
            <span key={zone.id} className="inline-flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-sm ${zone.color}`} />
              {zone.label}
            </span>
          ))}
        </div>
      </div>

      {/* Triaxial Severity Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {VIB_TRIAXIAL.map((axis) => (
          <div key={axis.axis} className={CARD}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              {axis.axis}
            </p>
            <p className={`text-2xl font-bold ${axis.tone}`}>
              {axis.value.toFixed(2)}
            </p>
            <p className="text-xs text-slate-400 mt-1">{axis.unit}</p>
          </div>
        ))}
      </div>
            </>
          )}

          {vibMode === "spectral" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className={CARD}>
                  <h3 className="text-base font-bold text-white mb-3">
                    1X Running Speed Trend (Unbalance)
                  </h3>
                  <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={VIB_SPECTRAL} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#22d3ee" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line
                          type="monotone"
                          dataKey="oneX"
                          stroke="#22d3ee"
                          strokeWidth={2.5}
                          name="1X"
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className={CARD}>
                  <h3 className="text-base font-bold text-white mb-3">
                    2X Running Speed Trend (Misalignment)
                  </h3>
                  <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={VIB_SPECTRAL} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#eab308" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line
                          type="monotone"
                          dataKey="twoX"
                          stroke="#eab308"
                          strokeWidth={2.5}
                          name="2X"
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className={CARD}>
                  <h3 className="text-base font-bold text-white mb-3">
                    3X–10X Harmonics Trend (Looseness)
                  </h3>
                  <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={VIB_SPECTRAL} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#f97316" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line
                          type="monotone"
                          dataKey="harmonics"
                          stroke="#f97316"
                          strokeWidth={2.5}
                          name="3X–10X"
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className={CARD}>
                  <h3 className="text-base font-bold text-white mb-3">
                    Forcing Frequencies (VPF / GMF)
                  </h3>
                  <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={VIB_SPECTRAL} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="vpf"
                          stroke="#a855f7"
                          strokeWidth={2.5}
                          name="VPF"
                          dot={{ r: 3 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="gmf"
                          stroke="#22c55e"
                          strokeWidth={2.5}
                          name="GMF"
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

      {/* ===== SECTION 4: RUL PROJECTION ===== */}
      <div className={`${CARD} mb-6`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-red-500" />
            <h3 className="text-lg font-bold text-white">Remaining Useful Life (RUL) Projection</h3>
          </div>
          <p className="text-sm font-semibold text-red-500">
            Most Likely RUL: {projectedRulDays} days @ {speedFactor.toFixed(1)}x speed
          </p>
        </div>

        <div className="mb-5 p-4 rounded-lg border border-white/10 bg-slate-950/50">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Interactive What-If Slope Slider
            </p>
            <p className="text-xs font-mono text-cyan-400">{speedFactor.toFixed(1)}x operational speed</p>
          </div>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={speedFactor}
            onChange={(e) => setSpeedFactor(Number(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>0.5x</span>
            <span>1.0x</span>
            <span>2.0x</span>
          </div>
        </div>

        <div className="h-72 bg-slate-950 rounded-lg border border-white/10 p-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rulData} margin={{ top: 20, right: 30, bottom: 20, left: 56 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="day" stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
                label={{
                  value: "Velocity (mm/s)",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#94a3b8",
                  fontSize: 11
                }}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Area
                type="monotone"
                dataKey="worst"
                stroke="none"
                fill="#ef4444"
                fillOpacity={0.12}
                name="Worst Case Band"
              />
              <Area
                type="monotone"
                dataKey="best"
                stroke="none"
                fill="#22c55e"
                fillOpacity={0.12}
                name="Best Case Band"
              />
              <Line
                type="monotone"
                dataKey="best"
                stroke="#22c55e"
                strokeWidth={2}
                strokeDasharray="4 4"
                name="Best Case"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="mostLikely"
                stroke="#eab308"
                strokeWidth={2.5}
                name="Most Likely"
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="worst"
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="4 4"
                name="Worst Case"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="alarm"
                stroke="#f87171"
                strokeWidth={1}
                strokeDasharray="2 4"
                name="ISO Alarm"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ===== SECTION 5: HISTORICAL & SPECTRUM COMPARISON ===== */}
      <div className={`${CARD} mb-6`}>
        <h3 className="text-lg font-bold text-white mb-1">
          Historical &amp; Spectrum Comparison Tools
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Click points on the trend charts above to populate Spectrum A and B.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => setSpectrumView("side-by-side")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
              spectrumView === "side-by-side"
                ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
          >
            👁️ Side-by-Side View
          </button>
          <button
            type="button"
            onClick={() => setSpectrumView("overlay")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
              spectrumView === "overlay"
                ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
          >
            🔀 Stacked Overlay View
          </button>
        </div>

        {spectrumView === "side-by-side" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="rounded-lg border border-white/10 bg-slate-950 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-yellow-400 mb-2">
                Spectrum A ({spectrumALabel})
              </p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={FFT_A} margin={{ top: 12, right: 16, bottom: 12, left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="hz"
                      stroke="#94a3b8"
                      tick={{ fontSize: 10 }}
                      label={{ value: "Hz", position: "insideBottom", offset: -4, fill: "#64748b" }}
                    />
                    <YAxis stroke="#eab308" tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="amp"
                      stroke="#eab308"
                      strokeWidth={2}
                      name="Amplitude"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-slate-950 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-400 mb-2">
                Spectrum B ({spectrumBLabel})
              </p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={FFT_B} margin={{ top: 12, right: 16, bottom: 12, left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="hz"
                      stroke="#94a3b8"
                      tick={{ fontSize: 10 }}
                      label={{ value: "Hz", position: "insideBottom", offset: -4, fill: "#64748b" }}
                    />
                    <YAxis stroke="#22d3ee" tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="amp"
                      stroke="#22d3ee"
                      strokeWidth={2}
                      name="Amplitude"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-slate-950 p-3 mb-6">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
              Stacked Overlay — A ({spectrumALabel}) vs B ({spectrumBLabel})
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={FFT_OVERLAY} margin={{ top: 12, right: 16, bottom: 12, left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="hz"
                    stroke="#94a3b8"
                    tick={{ fontSize: 10 }}
                    label={{ value: "Hz", position: "insideBottom", offset: -4, fill: "#64748b" }}
                  />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="ampA"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    name={`Spectrum A (${spectrumALabel})`}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ampB"
                    stroke="#eab308"
                    strokeWidth={2}
                    name={`Spectrum B (${spectrumBLabel})`}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
          Dominant Frequencies &amp; Fault Identification
        </p>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-950/80 text-slate-400 text-left text-[10px] uppercase tracking-widest">
                <th className="px-3 py-2 font-bold">Feature</th>
                <th className="px-3 py-2 font-bold">Spectrum A ({spectrumALabel})</th>
                <th className="px-3 py-2 font-bold">Spectrum B ({spectrumBLabel})</th>
                <th className="px-3 py-2 font-bold">Fault ID</th>
              </tr>
            </thead>
            <tbody>
              {DOMINANT_FREQ_ROWS.map((row) => (
                <tr key={row.feature} className="border-t border-white/10">
                  <td className="px-3 py-2.5 text-white font-medium">{row.feature}</td>
                  <td className="px-3 py-2.5 text-slate-300 font-mono text-xs">{row.a}</td>
                  <td className="px-3 py-2.5 text-slate-300 font-mono text-xs">{row.b}</td>
                  <td className="px-3 py-2.5 text-yellow-500 text-xs font-semibold">{row.fault}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
            </>
          )}

          {vibMode === "enveloping" && (
            <>
              <div className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-4 mb-6">
                <h3 className="text-base font-bold text-white mb-1">
                  Automated Bearing Failure Stage Matrix
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Current diagnosis: Stage 3 — Defect harmonics present in FFT (BPFO elevating)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {VIB_BEARING_STAGES.map((stage) => {
                    const isActive = stage.id === 3;
                    const toneClass =
                      stage.tone === "green"
                        ? "border-green-500/50 bg-green-500/10 text-green-400"
                        : stage.tone === "yellow"
                          ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
                          : stage.tone === "orange"
                            ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                            : "border-red-500/50 bg-red-500/10 text-red-400";
                    return (
                      <div
                        key={stage.id}
                        className={`rounded-lg border p-3 ${toneClass} ${
                          isActive ? "ring-2 ring-orange-400/60" : "opacity-60"
                        } ${stage.id === 4 ? "animate-pulse" : ""}`}
                      >
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-1">
                          Stage {stage.id}
                          {isActive ? " · ACTIVE" : ""}
                        </p>
                        <p className="text-xs font-semibold leading-snug">{stage.label.replace(/^Stage \d+:\s*/, "")}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className={CARD}>
                  <h3 className="text-base font-bold text-white mb-3">
                    Demodulation / PeakVue (gSE)
                  </h3>
                  <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={VIB_ENVELOPE} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#eab308" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line
                          type="monotone"
                          dataKey="gse"
                          stroke="#eab308"
                          strokeWidth={2.5}
                          name="gSE"
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className={CARD}>
                  <h3 className="text-base font-bold text-white mb-3">BPFO Trend</h3>
                  <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={VIB_ENVELOPE} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#ef4444" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line
                          type="monotone"
                          dataKey="bpfo"
                          stroke="#ef4444"
                          strokeWidth={2.5}
                          name="BPFO"
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className={CARD}>
                  <h3 className="text-base font-bold text-white mb-3">BPFI Trend</h3>
                  <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={VIB_ENVELOPE} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#a855f7" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line
                          type="monotone"
                          dataKey="bpfi"
                          stroke="#a855f7"
                          strokeWidth={2.5}
                          name="BPFI"
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className={CARD}>
                  <h3 className="text-base font-bold text-white mb-3">BSF / FTF Trend</h3>
                  <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={VIB_ENVELOPE} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="bsf"
                          stroke="#f97316"
                          strokeWidth={2.5}
                          name="BSF"
                          dot={{ r: 3 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="ftf"
                          stroke="#22d3ee"
                          strokeWidth={2.5}
                          name="FTF"
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}

          {vibMode === "waveform" && (
            <>
              <div className={`${CARD} mb-4`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Kurtosis KPI
                </p>
                <p className="text-2xl font-bold text-yellow-500">K = 4.2</p>
                <p className="text-xs text-slate-400 mt-1">
                  Kurtosis (K &gt; 3.0 indicates impacting)
                </p>
              </div>

              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-3">Time Waveform Display</h3>
                <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={VIB_WAVEFORM} margin={chartMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        dataKey="t"
                        stroke="#94a3b8"
                        tick={{ fontSize: 11 }}
                        label={{ value: "ms", position: "insideBottom", offset: -2, fill: "#64748b", fontSize: 10 }}
                      />
                      <YAxis
                        stroke="#22d3ee"
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "g",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#22d3ee",
                          fontSize: 11
                        }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line
                        type="monotone"
                        dataKey="amp"
                        stroke="#22d3ee"
                        strokeWidth={1.5}
                        name="Amplitude"
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-3">1X Phase Angle Trend</h3>
                <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={VIB_PHASE} margin={chartMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis
                        stroke="#eab308"
                        tick={{ fontSize: 11 }}
                        domain={[0, 180]}
                        label={{
                          value: "deg",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#eab308",
                          fontSize: 11
                        }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line
                        type="monotone"
                        dataKey="phase"
                        stroke="#eab308"
                        strokeWidth={2.5}
                        name="1X Phase"
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  Phase shift &gt; 30° between samples indicates developing unbalance or soft foot.
                </p>
              </div>

              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-3">
                  Animated Shaft Orbit / Lissajous Plot
                </h3>
                <div className="h-72 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 16, right: 24, bottom: 16, left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="X"
                        domain={[-1.4, 1.4]}
                        stroke="#94a3b8"
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="Y"
                        domain={[-1.0, 1.0]}
                        stroke="#94a3b8"
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        contentStyle={tooltipStyle}
                      />
                      <Scatter
                        name="Orbit"
                        data={VIB_ORBIT}
                        fill="#22d3ee"
                        line={{ stroke: "#22d3ee", strokeWidth: 1.5 }}
                        lineType="joint"
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  Detecting oil whirl/whip in sleeve bearings.
                </p>
              </div>
            </>
          )}
        </>
      )}

      {/* ===== THERMOGRAPHY TECH CONTENT ===== */}
      {trendTech === "thermography" && (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {IR_MODE_OPTIONS.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setIrMode(mode.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                  irMode === mode.id
                    ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {irMode === "hotspot" && (
            <>
              <div className="flex flex-wrap gap-2 mb-6">
                {[
                  "ASSET: Line 1 Bus Connection",
                  "EMISSIVITY (ε): 0.95",
                  "AMBIENT: 24.2°C",
                  "LOAD: 82%"
                ].map((pill) => (
                  <div
                    key={pill}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300"
                  >
                    {pill}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                    KPI Summary
                  </p>
                  <ul className="space-y-2.5">
                    <li className="text-sm font-bold text-red-500">Max Hotspot: 78.4°C</li>
                    <li className="text-sm font-semibold text-yellow-500">
                      NETA Class: Intermediate (ΔT = 28.2°C)
                    </li>
                    <li className="text-sm font-semibold text-orange-400">Thermal Rate: +2.1°C/week</li>
                    <li className="text-sm font-semibold text-cyan-400">Last IR Scan: Aug 03, 2026</li>
                  </ul>
                </div>

                <div className={`${CARD} md:col-span-2`}>
                  <div className="flex items-start gap-3 mb-3">
                    <Thermometer className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-white leading-relaxed">
                        Phase B contact thermal rise detected (ΔT = 28.2°C over ambient). High
                        electrical resistance pattern identified on Line 1 Bus Connection.
                      </p>
                      <p className="text-sm text-slate-400 mt-2">
                        Recommended: Torque check and thermal scan within 7 days.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      alert("Opening modal to create Work Order for Line 1 Bus Connection…")
                    }
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 text-sm font-bold cursor-pointer transition-colors"
                  >
                    <Wrench className="h-4 w-4" />
                    + Create Work Order
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-400 mb-3">
                Legend: 🟡 Torque Check | 🔵 Cleaned Contacts | 🔴 Alarm
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className={CARD}>
                  <div className="flex items-center gap-2 mb-3">
                    <Thermometer className="h-4 w-4 text-red-500" />
                    <h3 className="text-base font-bold text-white">Max Spot Temp vs Ambient</h3>
                  </div>
                  <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={IR_TREND} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                          label={{
                            value: "Temperature (°C)",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#94a3b8",
                            fontSize: 11
                          }}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        <EventMarkerLines markers={IR_EVENT_MARKERS} />
                        <Line
                          type="monotone"
                          dataKey="hotspot"
                          stroke="#ef4444"
                          strokeWidth={2}
                          name="Max Hotspot"
                          dot={{ r: 3 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="ambient"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          name="Ambient Temp"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className={CARD}>
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-orange-400" />
                    <h3 className="text-base font-bold text-white">
                      NETA MTS / NFPA 70B Severity Matrix Gauge
                    </h3>
                  </div>
                  <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={IR_TREND}
                        margin={{ top: 20, right: 40, bottom: 20, left: 48 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis
                          stroke="#f97316"
                          tick={{ fontSize: 11 }}
                          domain={[0, 50]}
                          label={{
                            value: "ΔT (°C)",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#f97316",
                            fontSize: 11
                          }}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        <ReferenceArea
                          y1={0}
                          y2={10}
                          fill="#22c55e"
                          fillOpacity={0.1}
                          label={{
                            value: "Zone A",
                            position: "insideTopRight",
                            fill: "#22c55e",
                            fontSize: 10
                          }}
                        />
                        <ReferenceArea
                          y1={10}
                          y2={25}
                          fill="#eab308"
                          fillOpacity={0.1}
                          label={{
                            value: "Zone B",
                            position: "insideTopRight",
                            fill: "#eab308",
                            fontSize: 10
                          }}
                        />
                        <ReferenceArea
                          y1={25}
                          y2={40}
                          fill="#f97316"
                          fillOpacity={0.1}
                          label={{
                            value: "Zone C",
                            position: "insideTopRight",
                            fill: "#f97316",
                            fontSize: 10
                          }}
                        />
                        <ReferenceArea
                          y1={40}
                          y2={50}
                          fill="#ef4444"
                          fillOpacity={0.1}
                          label={{
                            value: "Zone D",
                            position: "insideTopRight",
                            fill: "#ef4444",
                            fontSize: 10
                          }}
                        />
                        <EventMarkerLines markers={IR_EVENT_MARKERS} />
                        <Line
                          type="monotone"
                          dataKey="deltaT"
                          stroke="#f97316"
                          strokeWidth={2.5}
                          name="ΔT Rise"
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="w-full bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-yellow-400 mb-6">
                Thermal Accumulation: +2.1°C / Week (Electrical connection rapidly deteriorating).
              </div>
            </>
          )}

          {irMode === "phase" && (
            <>
              <div className={`${CARD} mb-6`}>
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-4 w-4 text-yellow-500" />
                  <h3 className="text-base font-bold text-white">Phase-to-Phase Differential</h3>
                </div>
                <div className="h-72 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={IR_TREND} margin={chartMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis
                        stroke="#94a3b8"
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "ΔT (°C)",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#94a3b8",
                          fontSize: 11
                        }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <EventMarkerLines markers={IR_EVENT_MARKERS} />
                      <Line
                        type="monotone"
                        dataKey="phaseAB"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        name="Phase A-B"
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="phaseAC"
                        stroke="#22c55e"
                        strokeWidth={2}
                        name="Phase A-C"
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="phaseBC"
                        stroke="#ef4444"
                        strokeWidth={2.5}
                        name="Phase B-C"
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={`${CARD} mb-6`}>
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="h-4 w-4 text-purple-400" />
                  <h3 className="text-base font-bold text-white">
                    I²R Load Normalization Engine
                  </h3>
                </div>
                <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={IR_TREND} margin={chartMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis
                        stroke="#a855f7"
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "Normalized Temp (°C)",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#a855f7",
                          fontSize: 11
                        }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <EventMarkerLines markers={IR_EVENT_MARKERS} />
                      <Line
                        type="monotone"
                        dataKey="tNorm"
                        stroke="#a855f7"
                        strokeWidth={2.5}
                        name="T_norm (100% Load)"
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-3">
                  Interactive What-If Plant Load Slider
                </h3>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-sm text-slate-300">
                    Simulated Plant Load:{" "}
                    <span className="font-mono font-bold text-cyan-400">{irPlantLoad}%</span>
                  </p>
                </div>
                <input
                  type="range"
                  min={20}
                  max={120}
                  value={irPlantLoad}
                  onChange={(e) => setIrPlantLoad(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1 mb-4">
                  <span>20%</span>
                  <span>82%</span>
                  <span>120%</span>
                </div>
                <p
                  className={`text-sm font-semibold ${
                    projectedLoadCritical ? "text-red-500" : "text-slate-300"
                  }`}
                >
                  At {irPlantLoad}% Load, Phase B Hotspot will reach {projectedPhaseBHotspot}°C
                  {projectedLoadCritical ? " (Zone D Critical)." : "."}
                </p>
              </div>
            </>
          )}

          {irMode === "radiometric" && (
            <>
              <div className="flex flex-wrap gap-2 mb-6">
                {IR_PALETTE_OPTIONS.map((palette) => (
                  <button
                    key={palette.id}
                    type="button"
                    onClick={() => setIrPalette(palette.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                      irPalette === palette.id
                        ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                        : "bg-slate-800 border-slate-700 text-slate-400"
                    }`}
                  >
                    {palette.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className={CARD}>
                  <p className="text-xs font-bold uppercase tracking-widest text-yellow-400 mb-3">
                    Image A — Baseline (Jul 05)
                  </p>
                  <div className="h-64 w-full bg-slate-950 rounded-lg border border-white/10 relative overflow-hidden">
                    <div className={`absolute inset-0 ${activeIrPalette.gradient} opacity-70`} />
                    <div className="absolute top-4 left-4 px-2 py-1 rounded bg-slate-950/80 border border-white/20 text-[10px] text-white font-mono">
                      Phase A: 42.1°C
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-2 py-1 rounded bg-slate-950/80 border border-yellow-500/40 text-[10px] text-yellow-300 font-mono">
                      ✛ Phase B: 48.5°C
                    </div>
                    <div className="absolute bottom-4 right-4 px-2 py-1 rounded bg-slate-950/80 border border-white/20 text-[10px] text-white font-mono">
                      Phase C: 43.0°C
                    </div>
                  </div>
                </div>

                <div className={CARD}>
                  <p className="text-xs font-bold uppercase tracking-widest text-cyan-400 mb-3">
                    Image B — Current (Aug 03)
                  </p>
                  <div className="h-64 w-full bg-slate-950 rounded-lg border border-white/10 relative overflow-hidden">
                    <div className={`absolute inset-0 ${activeIrPalette.gradient} opacity-80`} />
                    <div
                      className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-red-500/80 blur-md ${
                        isothermCutoff < 78.4 ? "opacity-100" : "opacity-40"
                      }`}
                    />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 blur-[2px]" />
                    <div
                      className={`absolute inset-0 bg-cyan-400/30 mix-blend-screen pointer-events-none transition-opacity duration-300 ${
                        isothermCutoff < 78.4 ? "opacity-100" : "opacity-0"
                      }`}
                      style={{ clipPath: "circle(15% at 60% 50%)" }}
                    />
                    <div className="absolute top-4 left-4 px-2 py-1 rounded bg-slate-950/80 border border-white/20 text-[10px] text-white font-mono">
                      Phase A: 43.0°C
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-14 px-2 py-1 rounded bg-red-500/90 border border-white text-[10px] text-white font-bold font-mono">
                      ✛ Phase B: 78.4°C
                    </div>
                    <div className="absolute bottom-4 right-4 px-2 py-1 rounded bg-slate-950/80 border border-white/20 text-[10px] text-white font-mono">
                      Phase C: 44.2°C
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${CARD} mb-6`}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h3 className="text-base font-bold text-white">Isotherm Highlight Threshold</h3>
                  <p className="text-sm font-mono text-cyan-400">
                    Isotherm Cutoff: &gt; {isothermCutoff.toFixed(1)}°C
                  </p>
                </div>
                <input
                  type="range"
                  min={40}
                  max={90}
                  step={0.5}
                  value={isothermCutoff}
                  onChange={(e) => setIsothermCutoff(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <p className="text-xs text-slate-400 mt-3">
                  Instantly colors the exact loose bolt terminal on Phase B.
                </p>
              </div>

              <div className="overflow-x-auto rounded-lg border border-white/10 mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-950/80 text-slate-400 text-left text-[10px] uppercase tracking-widest">
                      <th className="px-3 py-2 font-bold">Phase</th>
                      <th className="px-3 py-2 font-bold">Spot A (Jul 05)</th>
                      <th className="px-3 py-2 font-bold">Spot B (Aug 03)</th>
                      <th className="px-3 py-2 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {IR_SPOT_COMPARE.map((row) => (
                      <tr key={row.phase} className="border-t border-white/10">
                        <td className="px-3 py-2.5 text-white font-medium">{row.phase}</td>
                        <td className="px-3 py-2.5 text-slate-300 font-mono text-xs">{row.a}</td>
                        <td
                          className={`px-3 py-2.5 font-mono text-xs ${
                            row.tone === "red" ? "text-red-500 font-bold" : "text-green-400"
                          }`}
                        >
                          {row.b}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-xs font-semibold ${
                            row.tone === "red" ? "text-red-500" : "text-green-400"
                          }`}
                        >
                          {row.note}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {irMode === "mechanical" && (
            <>
              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-3">
                  Bearing Housing Delta — DE vs NDE
                </h3>
                <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={IR_BEARING_TREND} margin={chartMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis
                        stroke="#94a3b8"
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "°C",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#94a3b8",
                          fontSize: 11
                        }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="de"
                        stroke="#ef4444"
                        strokeWidth={2.5}
                        name="DE Housing"
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="nde"
                        stroke="#22d3ee"
                        strokeWidth={2.5}
                        name="NDE Housing"
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  DE–NDE Δ = {(79.2 - 59.4).toFixed(1)}°C — elevated drive-end friction / lubrication
                  degradation.
                </p>
              </div>

              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-3">
                  Emissivity (ε) Surface Material Calculator
                </h3>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {IR_EMISSIVITY_MATERIALS.map((material) => (
                    <button
                      key={material.id}
                      type="button"
                      onClick={() => {
                        setIrEmissivityMaterial(material.id);
                        setUseCustomEpsilon(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                        !useCustomEpsilon && irEmissivityMaterial === material.id
                          ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                          : "bg-slate-800 border-slate-700 text-slate-400"
                      }`}
                    >
                      {material.label}
                    </button>
                  ))}
                  <label className="inline-flex items-center gap-2 text-xs text-slate-300 ml-1">
                    Custom ε:
                    <input
                      type="number"
                      step={0.01}
                      min={0.01}
                      max={1}
                      value={customEpsilon}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (Number.isFinite(next)) {
                          setCustomEpsilon(Math.min(1, Math.max(0.01, next)));
                          setUseCustomEpsilon(true);
                        }
                      }}
                      onFocus={() => setUseCustomEpsilon(true)}
                      className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white outline-none focus:border-cyan-500"
                    />
                  </label>
                </div>
                <p className="text-sm text-slate-300">
                  Selected ε ={" "}
                  <span className="font-mono font-bold text-cyan-400">
                    {activeIrEpsilon.toFixed(2)}
                  </span>
                  {activeIrEpsilon < 0.5 && (
                    <span className="text-yellow-500 ml-2">
                      — Low emissivity: measured temps may under-read without correction.
                    </span>
                  )}
                </p>
              </div>

              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-2">
                  Insulation Heat Loss / Energy Loss Estimate
                </h3>
                <p className="text-sm text-slate-400 mb-3">
                  Damaged refractory / uninsulated pipe sections on steam header.
                </p>
                <p className="text-2xl font-bold text-red-500">Energy Wasted: $1,240 / yr</p>
              </div>
            </>
          )}
        </>
      )}

      {/* ===== ULTRASOUND TECH CONTENT ===== */}
      {trendTech === "ultrasound" && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {UE_MODE_OPTIONS.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setUeMode(mode.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                  ueMode === mode.id
                    ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* ---- BEARINGS MODE (default) ---- */}
          {ueMode === "bearings" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Acoustic RMS
                  </p>
                  <p className="text-2xl font-bold text-yellow-500">34.2 dBµV</p>
                  <p className="text-xs text-slate-400 mt-2">+12 dBµV over baseline</p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Crest Factor
                  </p>
                  <p className="text-2xl font-bold text-red-500">3.8</p>
                  <p className="text-xs text-slate-400 mt-2">High Impacting Detected</p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Lubrication Status
                  </p>
                  <p className="text-lg font-bold text-orange-400 leading-snug">
                    Under-Lubricated / High Friction
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Acoustic Severity
                  </p>
                  <span className="inline-flex px-2.5 py-1 rounded text-xs font-bold bg-red-500/15 text-red-500 border border-red-500/40">
                    Zone C (Action Required)
                  </span>
                </div>
              </div>

              <div className={`${CARD} mb-6`}>
                <div className="flex items-start gap-3 mb-3">
                  <AudioWaveform className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-white leading-relaxed">
                      Acoustic friction elevated by +12 dBµV with a high Crest Factor spike (3.8).
                      Pattern matches Stage 2 bearing subsurface fatigue or acute lubricant starvation.
                    </p>
                    <p className="text-sm text-slate-400 mt-2">
                      Recommended Action: Apply 3 strokes (6g) of polyurea grease or inspect acoustic
                      time waveform.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLubeDrawer(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 text-sm font-bold cursor-pointer transition-colors"
                  >
                    <Droplet className="h-4 w-4" />
                    + Launch Lubrication Assistant
                  </button>
                  <button
                    type="button"
                    onClick={() => alert("Opening modal to create Work Order for Motor DE…")}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 text-white hover:bg-slate-800 text-sm font-bold cursor-pointer transition-colors"
                  >
                    <Wrench className="h-4 w-4" />
                    + Create Work Order
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Chart 1 */}
                <div className={CARD}>
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="h-4 w-4 text-yellow-500" />
                    <h3 className="text-base font-bold text-white">RMS vs. Peak Acoustic Amplitude</h3>
                  </div>
                  <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2 relative">
                    <span className="absolute top-2 right-2 z-10 px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded border border-red-500/30">
                      Critical Threshold: +16 dB
                    </span>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={UE_TREND}
                        margin={{ top: 25, right: 20, bottom: 20, left: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                          label={{
                            value: "dBµV",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#94a3b8",
                            fontSize: 11
                          }}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        <EventMarkerLines markers={UE_EVENT_MARKERS} badgeLabels />
                        <ReferenceLine y={30.1} stroke="#eab308" strokeDasharray="5 5" />
                        <ReferenceLine y={38.1} stroke="#ef4444" strokeDasharray="5 5" />
                        <Line
                          type="monotone"
                          dataKey="rms"
                          stroke="#eab308"
                          strokeWidth={2}
                          name="Overall RMS"
                          dot={{ r: 3 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="peak"
                          stroke="#ef4444"
                          strokeWidth={2}
                          name="Peak"
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Chart 2 */}
                <div className={CARD}>
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-cyan-400" />
                    <h3 className="text-base font-bold text-white">
                      Crest Factor Trend &amp; Bearing Failure Stage Classifier
                    </h3>
                  </div>
                  <div className="flex gap-3">
                    <div className="h-64 flex-1 min-w-0 bg-slate-950 rounded-lg border border-white/10 p-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={UE_TREND}
                          margin={{ top: 25, right: 20, bottom: 20, left: 20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                          <YAxis
                            stroke="#22d3ee"
                            tick={{ fontSize: 11 }}
                            domain={[0, 5]}
                            label={{
                              value: "Crest Factor Ratio",
                              angle: -90,
                              position: "insideLeft",
                              fill: "#22d3ee",
                              fontSize: 11
                            }}
                          />
                          <Tooltip contentStyle={tooltipStyle} />
                          <ReferenceArea y1={1.5} y2={2.0} fill="#22c55e" fillOpacity={0.15} />
                          <ReferenceArea y1={3.5} y2={5.0} fill="#ef4444" fillOpacity={0.12} />
                          <ReferenceLine y={2.0} stroke="#22c55e" strokeDasharray="3 3" />
                          <ReferenceLine y={3.5} stroke="#eab308" strokeDasharray="3 3" />
                          <EventMarkerLines markers={UE_EVENT_MARKERS} badgeLabels />
                          <Line
                            type="monotone"
                            dataKey="crest"
                            stroke="#22d3ee"
                            strokeWidth={2.5}
                            name="Crest Factor"
                            dot={{ r: 3 }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-36 shrink-0 rounded-lg border border-white/10 bg-slate-950/60 p-3 space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Stage Legend
                      </p>
                      <div className="flex items-start gap-2">
                        <span className="mt-1 w-2.5 h-2.5 rounded-sm bg-green-500 shrink-0" />
                        <p className="text-[11px] text-green-400 leading-snug">
                          Stage 1 — Lubrication (CF 1.5–2.0)
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-1 w-2.5 h-2.5 rounded-sm bg-yellow-500 shrink-0" />
                        <p className="text-[11px] text-yellow-400 leading-snug">
                          Stage 2/3 — Incipient Fault (CF &gt; 3.5)
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-1 w-2.5 h-2.5 rounded-sm bg-red-500 shrink-0" />
                        <p className="text-[11px] text-red-400 leading-snug">
                          Stage 4 — Severe Fatigue (CF &lt; 1.8 + high RMS)
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chart 3 */}
                <div className={CARD}>
                  <div className="flex items-center gap-2 mb-3">
                    <Droplet className="h-4 w-4 text-green-400" />
                    <h3 className="text-base font-bold text-white">Precision Lubrication Delta</h3>
                  </div>
                  <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2 relative">
                    <span className="absolute top-2 left-2 z-10 px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30 max-w-[90%]">
                      -33.3% Friction Reduction | Mobilith SHC 220 | 6g (3 Strokes)
                    </span>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={UE_LUBE_DELTA} margin={{ ...chartMargin, top: 36 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                          label={{
                            value: "dBµV",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#94a3b8",
                            fontSize: 11
                          }}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="value" name="Acoustic Level" radius={[6, 6, 0, 0]}>
                          {UE_LUBE_DELTA.map((entry) => (
                            <Cell key={entry.label} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Chart 4 */}
                <div className={CARD}>
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="h-4 w-4 text-red-500" />
                    <h3 className="text-base font-bold text-white">
                      Acoustic Time Waveform / Impact Burst Capture
                    </h3>
                  </div>
                  <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={UE_WAVEFORM} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey="ms"
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                          label={{
                            value: "Time (ms)",
                            position: "insideBottom",
                            offset: -2,
                            fill: "#64748b",
                            fontSize: 10
                          }}
                        />
                        <YAxis
                          stroke="#ef4444"
                          tick={{ fontSize: 11 }}
                          label={{
                            value: "Amplitude (dBµV)",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#ef4444",
                            fontSize: 11
                          }}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line
                          type="linear"
                          dataKey="amp"
                          stroke="#ef4444"
                          strokeWidth={1.5}
                          name="Amplitude"
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ---- COMPRESSED AIR LEAKS ---- */}
          {ueMode === "leaks" && (
            <div className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Est. Leak Rate
                  </p>
                  <p className="text-2xl font-bold text-red-500">4.2 CFM</p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Ultrasonic dB
                  </p>
                  <p className="text-2xl font-bold text-yellow-500">28.4 dBµV</p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Line Pressure
                  </p>
                  <p className="text-2xl font-bold text-cyan-400">90 PSI</p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Equivalent Orifice
                  </p>
                  <p className="text-lg font-bold text-white">1/16&quot; (1.6 mm)</p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    CO2 Impact
                  </p>
                  <p className="text-2xl font-bold text-orange-400">2.1 Tons/yr</p>
                </div>
              </div>
              <div
                className={`${CARD} mb-6 border-red-500/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`}
              >
                <p className="text-sm font-bold text-red-500">
                  💰 Current Leak Waste: $1,450 / year
                </p>
                <button
                  type="button"
                  onClick={() => alert("Tagging leak and issuing work order…")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 text-sm font-bold cursor-pointer transition-colors shrink-0"
                >
                  🏷️ Tag Leak / Issue Work Order
                </button>
              </div>
              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-3">CFM Air Volume Loss Trend</h3>
                <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={UE_CFM_TREND} margin={chartMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis
                        stroke="#ef4444"
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "CFM",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#ef4444",
                          fontSize: 11
                        }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line
                        type="monotone"
                        dataKey="cfm"
                        stroke="#ef4444"
                        strokeWidth={2.5}
                        name="Leak Rate (CFM)"
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className={CARD}>
                  <h4 className="text-sm font-bold text-white mb-3">Orifice &amp; Flow Estimator</h4>
                  <ul className="space-y-2 text-sm text-slate-300">
                    <li className="flex justify-between gap-2">
                      <span className="text-slate-400">Orifice Equivalent</span>
                      <span className="font-mono text-white">0.0625 in</span>
                    </li>
                    <li className="flex justify-between gap-2">
                      <span className="text-slate-400">System Duty Cycle</span>
                      <span className="font-mono text-white">8,760 hrs/yr</span>
                    </li>
                    <li className="flex justify-between gap-2">
                      <span className="text-slate-400">Air Cost Rate</span>
                      <span className="font-mono text-white">$0.12 / kWh</span>
                    </li>
                  </ul>
                </div>
                <div className={CARD}>
                  <h4 className="text-sm font-bold text-white mb-3">Leak Location &amp; Distance</h4>
                  <ul className="space-y-2 text-sm text-slate-300">
                    <li className="flex justify-between gap-2">
                      <span className="text-slate-400">Measured Distance</span>
                      <span className="font-mono text-white">15 ft</span>
                    </li>
                    <li className="flex justify-between gap-2">
                      <span className="text-slate-400">Decibel at Source (1m)</span>
                      <span className="font-mono text-yellow-500">41.8 dBµV</span>
                    </li>
                    <li className="flex justify-between gap-2">
                      <span className="text-slate-400">Attenuation Factor</span>
                      <span className="font-mono text-white">-6 dB per doubling distance</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ---- ELECTRICAL PD ---- */}
          {ueMode === "electrical" && (
            <>
              <div className="mb-4">
                <span className="inline-flex px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900/50 border border-white/10 text-cyan-400">
                  Switchgear Enclosure #4 — Cubicle B (Non-Intrusive Ultrasound Probe)
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    PD Type
                  </p>
                  <p className="text-xl font-bold text-red-500">Arcing Detected</p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Confidence
                  </p>
                  <p className="text-2xl font-bold text-yellow-500">92%</p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Pulse Rate
                  </p>
                  <p className="text-2xl font-bold text-orange-400">120 bursts/sec</p>
                </div>
              </div>
              <div
                className={`${CARD} mb-6 border-yellow-500/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`}
              >
                <p className="text-sm font-bold text-yellow-400">
                  ⚠️ Arc Flash Risk: High — Maintenance Required
                </p>
                <button
                  type="button"
                  onClick={() => alert("Opening switchgear thermal image…")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 text-white hover:bg-slate-800 text-sm font-bold cursor-pointer transition-colors shrink-0"
                >
                  View Switchgear Thermal Image
                </button>
              </div>
              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-3">
                  360° Phase-Resolved Partial Discharge (PRPD) Scatter Plot
                </h3>
                <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart margin={chartMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        type="number"
                        dataKey="phase"
                        name="Phase"
                        domain={[0, 360]}
                        stroke="#94a3b8"
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "Phase (°)",
                          position: "insideBottom",
                          offset: -2,
                          fill: "#64748b",
                          fontSize: 10
                        }}
                      />
                      <YAxis
                        type="number"
                        stroke="#eab308"
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "dBµV",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#eab308",
                          fontSize: 11
                        }}
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        contentStyle={tooltipStyle}
                      />
                      <Legend />
                      <Line
                        data={UE_AC_SINE}
                        type="monotone"
                        dataKey="sine"
                        stroke="#475569"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        name="60Hz AC Reference"
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Scatter
                        name="Corona"
                        data={UE_PRPD_CORONA}
                        dataKey="amp"
                        fill="#eab308"
                      />
                      <Scatter
                        name="Tracking"
                        data={UE_PRPD_TRACKING}
                        dataKey="amp"
                        fill="#f97316"
                      />
                      <Scatter
                        name="Arcing"
                        data={UE_PRPD_ARCING}
                        dataKey="amp"
                        fill="#ef4444"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  PRPD Fault Classification: 🟡 Corona (90°/270° peaks) | 🟠 Tracking (Asymmetric) | 🔴
                  Arcing (Random)
                </p>
              </div>
            </>
          )}

          {/* ---- STEAM TRAPS ---- */}
          {ueMode === "steam" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Trap Status
                  </p>
                  <p className="text-xl font-bold text-red-500">Failed / Bypassing</p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Temp Delta
                  </p>
                  <p className="text-2xl font-bold text-yellow-500">ΔT = 4°C</p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Steam Loss
                  </p>
                  <p className="text-2xl font-bold text-orange-400">32 lbs/hr</p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Trap Type
                  </p>
                  <p className="text-sm font-bold text-white leading-snug">
                    Thermodynamic Disc (1/2&quot; NPT, 150 PSI)
                  </p>
                </div>
              </div>
              <div
                className={`${CARD} mb-6 border-red-500/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`}
              >
                <p className="text-sm font-bold text-red-500">
                  💰 Boiler Steam Loss: $3,840 / year
                </p>
                <button
                  type="button"
                  onClick={() => alert("Logging steam trap replacement task…")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 text-sm font-bold cursor-pointer transition-colors shrink-0"
                >
                  Log Replacement Task
                </button>
              </div>
              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-3">
                  Upstream vs. Downstream Acoustic Envelope
                </h3>
                <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={UE_STEAM_ENV} margin={chartMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis
                        stroke="#94a3b8"
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "dBµV",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#94a3b8",
                          fontSize: 11
                        }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="upstream"
                        stroke="#ef4444"
                        strokeWidth={2}
                        name="Upstream"
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="downstream"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="Downstream"
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="w-full bg-slate-900/50 border border-white/10 rounded-lg p-4 mb-6">
                <h4 className="text-sm font-bold text-white mb-3">
                  Steam Trap Diagnostic State Matrix
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 text-left text-[10px] uppercase tracking-widest border-b border-white/10">
                        <th className="px-3 py-2 font-bold">State</th>
                        <th className="px-3 py-2 font-bold">Acoustic Signature</th>
                        <th className="px-3 py-2 font-bold">Thermal Cue</th>
                        <th className="px-3 py-2 font-bold">Verdict</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-white/10">
                        <td className="px-3 py-2.5 text-white font-medium">Healthy (Cycling)</td>
                        <td className="px-3 py-2.5 text-slate-300">Intermittent Bursts</td>
                        <td className="px-3 py-2.5 text-slate-300">High ΔT (&gt; 25°C)</td>
                        <td className="px-3 py-2.5 text-green-400 font-semibold">✅ Normal</td>
                      </tr>
                      <tr className="border-b border-white/10 bg-red-500/5">
                        <td className="px-3 py-2.5 text-white font-medium">Failed Open</td>
                        <td className="px-3 py-2.5 text-slate-300">Continuous High dBµV</td>
                        <td className="px-3 py-2.5 text-slate-300">Low ΔT (&lt; 10°C)</td>
                        <td className="px-3 py-2.5 text-red-500 font-bold">🔴 CURRENT STATE</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 text-white font-medium">Failed Closed</td>
                        <td className="px-3 py-2.5 text-slate-300">Low / Zero dBµV</td>
                        <td className="px-3 py-2.5 text-slate-300">Cold Trap</td>
                        <td className="px-3 py-2.5 text-blue-400 font-semibold">❄️ Blocked</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Shared: Spectrogram Audio + Comparison (bearings keeps full compare) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden">
              <div className="h-24 w-full bg-slate-950 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-cyan-900/50 to-red-900/50" />
                <div className="absolute left-0 right-0 top-1/3 border-t border-white/10" />
                <div className="absolute left-0 right-0 top-2/3 border-t border-white/10" />
                <span className="absolute left-2 top-[28%] mr-3 text-[9px] text-slate-400 font-mono">
                  40 kHz
                </span>
                <span className="absolute left-2 top-[62%] mr-3 text-[9px] text-slate-400 font-mono">
                  20 kHz
                </span>
                <p className="absolute bottom-1 right-2 text-[10px] text-slate-400">
                  Acoustic Spectrogram
                </p>
              </div>
              <div className="p-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setUeAudioPlaying((v) => !v)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 text-xs font-bold cursor-pointer hover:bg-cyan-500/30 transition-colors inline-flex items-center gap-1.5"
                >
                  {ueAudioPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {ueAudioPlaying ? "Pause" : "Play"}
                </button>
                <span className="text-xs font-mono text-slate-400">0:15 / 0:30</span>
                <div className="flex-1 min-w-[80px] h-1 bg-slate-700 rounded overflow-hidden">
                  <div className="h-full w-1/2 bg-cyan-500 rounded" />
                </div>
                <span className="text-xs text-slate-400">Vol: 80%</span>
                <button
                  type="button"
                  onClick={() => alert("Downloading WAV…")}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs font-semibold cursor-pointer hover:bg-slate-800 transition-colors"
                >
                  💾 Download WAV
                </button>
              </div>
              <p className="px-4 pb-3 text-xs text-slate-500">
                🎧 Heterodyned Ultrasound Recording (38 kHz → 2 kHz)
              </p>
            </div>

            {ueMode === "bearings" && (
              <div className={CARD}>
                <h3 className="text-sm font-bold text-white mb-3">
                  Metric Comparison — Jul 05 vs Aug 03
                </h3>
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-950/80 text-slate-400 text-left text-[10px] uppercase tracking-widest">
                        <th className="px-3 py-2 font-bold">Metric</th>
                        <th className="px-3 py-2 font-bold">Jul 05</th>
                        <th className="px-3 py-2 font-bold">Aug 03</th>
                        <th className="px-3 py-2 font-bold">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {UE_COMPARE_ROWS.map((row) => (
                        <tr key={row.metric} className="border-t border-white/10">
                          <td className="px-3 py-2.5 text-white font-medium">{row.metric}</td>
                          <td className="px-3 py-2.5 text-slate-300 font-mono text-xs">{row.a}</td>
                          <td className="px-3 py-2.5 text-yellow-500 font-mono text-xs font-semibold">
                            {row.b}
                          </td>
                          <td className="px-3 py-2.5 text-red-500 font-mono text-xs font-bold">
                            {row.delta}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {ueMode !== "bearings" && (
              <div className={CARD}>
                <h3 className="text-sm font-bold text-white mb-2">Mode Context</h3>
                <p className="text-sm text-slate-400">
                  Viewing{" "}
                  <span className="text-cyan-400 font-semibold">
                    {UE_MODE_OPTIONS.find((m) => m.id === ueMode)?.label}
                  </span>{" "}
                  ultrasound diagnostics. Switch back to Bearings &amp; Mechanical for Crest Factor
                  and lubrication workflows.
                </p>
              </div>
            )}
          </div>

          {/* Lubrication Assistant Drawer */}
          {showLubeDrawer && (
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowLubeDrawer(false)}
              aria-hidden
            />
          )}
          <div
            className={`fixed top-0 right-0 h-full w-96 bg-slate-900 border-l border-white/10 shadow-2xl z-50 p-6 transform transition-transform duration-300 ${
              showLubeDrawer ? "translate-x-0" : "translate-x-full pointer-events-none"
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="Precision Lubrication Assistant"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Precision Lubrication Assistant</h3>
              <button
                type="button"
                onClick={() => setShowLubeDrawer(false)}
                className="p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="space-y-4 text-sm">
              <li className="rounded-lg border border-white/10 bg-slate-950/50 p-3 text-slate-300">
                <span className="text-yellow-400 font-bold">Stroke 1:</span> 34.2 dBµV → Friction
                drops slightly
              </li>
              <li className="rounded-lg border border-white/10 bg-slate-950/50 p-3 text-slate-300">
                <span className="text-yellow-400 font-bold">Stroke 2:</span> 28.0 dBµV → Friction
                dropping optimal path
              </li>
              <li className="rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-green-400 font-bold">
                Stroke 3: 22.8 dBµV → ✅ BASELINE REACHED (STOP GREASING)
              </li>
            </ol>
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
              ⚠️ Over-grease Alert: Adding more grease will cause dBµV to climb and risk blowing
              bearing seals.
            </div>
          </div>
        </>
      )}

      {/* ===== MCA TECH CONTENT ===== */}
      {trendTech === "mca" && (
        <>
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 mb-4">
            <div className="flex flex-wrap gap-2">
              {MCA_MODE_OPTIONS.map((mode) => {
                const Icon =
                  mode.icon === "settings"
                    ? Settings
                    : mode.icon === "zap"
                      ? Zap
                      : mode.icon === "waves"
                        ? Waves
                        : Activity;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setMcaMode(mode.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors inline-flex items-center gap-1.5 ${
                      mcaMode === mode.id
                        ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                        : "bg-slate-800 border-slate-700 text-slate-400"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {mode.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 shrink-0">
              <span className="text-slate-500">Test Location:</span>
              <select
                value={testLocation}
                onChange={(e) => setTestLocation(e.target.value as "MCC" | "JBOX")}
                className="bg-transparent text-slate-200 text-xs outline-none cursor-pointer border-0 focus:ring-0"
              >
                <option value="MCC">MCC Cabinet 4B</option>
                <option value="JBOX">Motor Junction Box (Local)</option>
              </select>
            </div>
          </div>

          <div className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-4 mb-4 flex flex-wrap justify-between gap-4">
            <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                6-Fault Zone Reliability Health Score Matrix
              </p>
              {activeFaultZone && (
                <button
                  type="button"
                  onClick={() => setActiveFaultZone(null)}
                  className="px-2 py-1 rounded text-[10px] font-bold border border-slate-600 text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Clear Filter
                </button>
              )}
            </div>
            {MCA_FAULT_ZONES.map((zone) => {
              const isActive = activeFaultZone === zone.id;
              return (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() =>
                    setActiveFaultZone((prev) => (prev === zone.id ? null : zone.id))
                  }
                  className={`flex-1 min-w-[120px] rounded-lg border px-3 py-2 text-center cursor-pointer transition-all ${
                    isActive
                      ? "border-cyan-500 bg-cyan-500/15 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                      : zone.tone === "yellow"
                        ? "border-yellow-500/40 bg-yellow-500/10 hover:border-yellow-500/60"
                        : "border-green-500/40 bg-green-500/10 hover:border-green-500/60"
                  } ${activeFaultZone && !isActive ? "opacity-40" : "opacity-100"}`}
                >
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">{zone.name}</p>
                  <p
                    className={`text-lg font-bold font-mono ${
                      zone.tone === "yellow" ? "text-yellow-400" : "text-green-400"
                    }`}
                  >
                    {zone.score}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="w-full bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
            <span className="text-cyan-400 text-xl shrink-0" aria-hidden>
              💡
            </span>
            <div>
              <p className="text-sm font-bold text-white leading-relaxed">
                AI Fault Diagnosis: Phase C resistance drift (+3.2% over 30 days) combined with
                elevated I/F unbalance (3 units) points to early Stator Turn-to-Turn Insulation
                Degradation in Phase C.
              </p>
              <p className="text-sm text-cyan-400 mt-2">
                🛠️ Prescriptive Action: Schedule an offline surge and partial discharge test
                directly at the Motor Junction Box within 14 days to rule out MCC feeder cable
                corrosion.
              </p>
            </div>
          </div>

          {/* Winding & Phase Balance */}
          {mcaMode === "winding" && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                Automated NEMA MG-1 &amp; IEEE 1415 Unbalance Gauge Matrix
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                <div className={`${CARD} border-green-500/30`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Resistance Unbalance
                  </p>
                  <p className="text-xl font-bold text-green-400">0.8%</p>
                  <p className="text-xs text-slate-400 mt-1">Limit &lt;1.0% — Green</p>
                </div>
                <div className={`${CARD} border-green-500/30`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Inductance Unbalance
                  </p>
                  <p className="text-xl font-bold text-green-400">2.1%</p>
                  <p className="text-xs text-slate-400 mt-1">Limit &lt;3.0% — Green</p>
                </div>
                <div className={`${CARD} border-yellow-500/30`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Phase Angle Delta
                  </p>
                  <p className="text-xl font-bold text-yellow-500">1.4°</p>
                  <p className="text-xs text-slate-400 mt-1">Limit &gt;1.0° — Yellow Warning</p>
                </div>
                <div className={`${CARD} border-red-500/30`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    I/F Unbalance
                  </p>
                  <p className="text-xl font-bold text-red-500">3 units</p>
                  <p className="text-xs text-slate-400 mt-1">Limit &gt;2 — Red Alert</p>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 mb-4 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showThresholds}
                  onChange={(e) => setShowThresholds(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                />
                Show IEEE/NEMA Thresholds
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div
                  className={`${CARD} transition-all ${
                    activeFaultZone === "stator"
                      ? "opacity-100 border-2 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                      : activeFaultZone
                        ? "opacity-40"
                        : "opacity-100"
                  }`}
                >
                  <h3 className="text-base font-bold text-white mb-3">Phase Resistance (Ω)</h3>
                  <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={MCA_PHASE_TREND} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        {showThresholds && (
                          <ReferenceLine
                            y={1.838}
                            stroke="#ef4444"
                            strokeDasharray="3 3"
                            label={{
                              value: "+1% Limit",
                              position: "right",
                              fill: "#ef4444",
                              fontSize: 10
                            }}
                          />
                        )}
                        <Line type="monotone" dataKey="rA" stroke="#22d3ee" strokeWidth={2} name="Phase A" dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="rB" stroke="#eab308" strokeWidth={2} name="Phase B" dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="rC" stroke="#ef4444" strokeWidth={2} name="Phase C" dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {testLocation === "MCC" && (
                    <p className="text-xs text-slate-500 italic mt-2">
                      * Includes ~120 ft Feeder Cable Impedance Offset.
                    </p>
                  )}
                </div>
                <div
                  className={`${CARD} transition-all ${
                    activeFaultZone === "stator"
                      ? "opacity-100 border-2 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                      : activeFaultZone
                        ? "opacity-40"
                        : "opacity-100"
                  }`}
                >
                  <h3 className="text-base font-bold text-white mb-3">Phase Inductance (mH)</h3>
                  <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={MCA_PHASE_TREND} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        <Line type="monotone" dataKey="lA" stroke="#22d3ee" strokeWidth={2} name="Phase A" dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="lB" stroke="#eab308" strokeWidth={2} name="Phase B" dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="lC" stroke="#ef4444" strokeWidth={2} name="Phase C" dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div
                  className={`${CARD} transition-all ${
                    activeFaultZone === "stator"
                      ? "opacity-100 border-2 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                      : activeFaultZone
                        ? "opacity-40"
                        : "opacity-100"
                  }`}
                >
                  <h3 className="text-base font-bold text-white mb-3">Phase Angle (Φ)</h3>
                  <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={MCA_PHASE_TREND} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        <Line type="monotone" dataKey="pA" stroke="#22d3ee" strokeWidth={2} name="Phase A" dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="pB" stroke="#eab308" strokeWidth={2} name="Phase B" dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="pC" stroke="#ef4444" strokeWidth={2} name="Phase C" dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div
                  className={`${CARD} transition-all ${
                    activeFaultZone === "stator"
                      ? "opacity-100 border-2 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                      : activeFaultZone
                        ? "opacity-40"
                        : "opacity-100"
                  }`}
                >
                  <h3 className="text-base font-bold text-white mb-3">Test Value Static (TVS)</h3>
                  <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={MCA_PHASE_TREND} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#a855f7" tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line
                          type="monotone"
                          dataKey="tvs"
                          stroke="#a855f7"
                          strokeWidth={2.5}
                          name="TVS Drift"
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Groundwall Insulation */}
          {mcaMode === "insulation" && (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setIrIeeeCorrected(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    !irIeeeCorrected
                      ? "bg-yellow-500/20 border-yellow-500 text-yellow-400"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}
                >
                  Raw Measured Megohms
                </button>
                <button
                  type="button"
                  onClick={() => setIrIeeeCorrected(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    irIeeeCorrected
                      ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}
                >
                  IEEE 43 Temp-Corrected (40°C)
                </button>
                <div className="inline-flex flex-col ml-0 sm:ml-4 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
                  <span className="inline-flex items-center gap-2 text-xs text-slate-300">
                    Measured Temp: 52°C | Temperature Coefficient (Kt): 0.43
                  </span>
                  <span className="text-[10px] italic text-slate-500 mt-0.5">R40 = Kt × RT</span>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 mb-4 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showThresholds}
                  onChange={(e) => setShowThresholds(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                />
                Show IEEE/NEMA Thresholds
              </label>

              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-3">
                  Insulation Resistance (IR) Trend
                </h3>
                <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={MCA_IR_TREND} margin={chartMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis
                        stroke="#94a3b8"
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "MΩ",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#94a3b8",
                          fontSize: 11
                        }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="raw"
                        stroke="#eab308"
                        strokeWidth={2}
                        name="Raw Measured"
                        dot={{ r: 3 }}
                      />
                      {irIeeeCorrected && (
                        <Line
                          type="monotone"
                          dataKey="corrected"
                          stroke="#22d3ee"
                          strokeWidth={2}
                          name="IEEE 43 Corrected (40°C)"
                          dot={{ r: 3 }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className={CARD}>
                  <h3 className="text-sm font-bold text-white mb-3">Polarization Index (PI)</h3>
                  <div className="h-48 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={MCA_PI_TREND} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                        <YAxis stroke="#22d3ee" tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line type="monotone" dataKey="pi" stroke="#22d3ee" strokeWidth={2} name="PI" dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className={CARD}>
                  <h3 className="text-sm font-bold text-white mb-3">
                    Dielectric Absorption Ratio (DAR)
                  </h3>
                  <div className="h-48 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={MCA_DAR_TREND} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                        <YAxis stroke="#eab308" tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line type="monotone" dataKey="dar" stroke="#eab308" strokeWidth={2} name="DAR" dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className={CARD}>
                  <h3 className="text-sm font-bold text-white mb-3">
                    Capacitance to Ground (Cg)
                  </h3>
                  <div className="h-48 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={MCA_CG_TREND} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                        <YAxis stroke="#a855f7" tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line type="monotone" dataKey="cg" stroke="#a855f7" strokeWidth={2} name="Cg (nF)" dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className={CARD}>
                  <h3 className="text-sm font-bold text-white mb-3">
                    Dissipation Factor (Tan δ)
                  </h3>
                  <div className="h-48 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={MCA_TAN_DELTA} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                        <YAxis stroke="#ef4444" tick={{ fontSize: 10 }} domain={[0.8, "auto"]} />
                        <Tooltip contentStyle={tooltipStyle} />
                        {showThresholds && (
                          <ReferenceLine
                            y={1.0}
                            stroke="#eab308"
                            strokeDasharray="3 3"
                            label={{
                              value: "1.0% Tan δ Limit",
                              position: "right",
                              fill: "#eab308",
                              fontSize: 10
                            }}
                          />
                        )}
                        <Line type="monotone" dataKey="tan" stroke="#ef4444" strokeWidth={2} name="Tan δ (%)" dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Rotor Influence Check */}
          {mcaMode === "rotor" && (
            <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
              <h3 className="text-lg font-bold text-white mb-1">
                360° Interactive Polar Radar — Rotor Influence Check (RIC)
              </h3>
              <p className="text-sm text-slate-400 mb-4">
                Inductance vs rotor angular position — 3-phase overlay
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                <div className="lg:col-span-2 h-80 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={MCA_RIC_DATA}>
                      <PolarGrid stroke="#334155" />
                      <PolarAngleAxis dataKey="angle" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis stroke="#475569" tick={{ fontSize: 10 }} domain={[36, 43]} />
                      <Radar
                        name="Phase A (T1-T2)"
                        dataKey="phaseA"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.1}
                      />
                      <Radar
                        name="Phase B (T2-T3)"
                        dataKey="phaseB"
                        stroke="#eab308"
                        fill="#eab308"
                        fillOpacity={0.1}
                      />
                      <Radar
                        name="Phase C (T3-T1)"
                        dataKey="phaseC"
                        stroke="#ef4444"
                        fill="#ef4444"
                        fillOpacity={0.1}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className={`${CARD} flex flex-col justify-center`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    RIC Peak-to-Peak Delta
                  </p>
                  <p className="text-3xl font-bold text-green-400">4.8%</p>
                  <p className="text-xs text-slate-400 mt-2">Limit &lt;5.0% - Normal</p>
                </div>
              </div>
              <p className="text-sm text-slate-300">
                Symmetrical Oval = Perfect Rotor. Asymmetric Dents = Broken Rotor Bar / Eccentric
                Airgap.
              </p>
            </div>
          )}

          {/* Surge Waveforms */}
          {mcaMode === "surge" && (
            <>
              <div className={`${CARD} mb-6 max-w-md`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                  Error Area Ratio (EAR)
                </p>
                <p className="text-2xl font-bold text-green-400">4.2%</p>
                <p className="text-xs text-slate-400 mt-1">
                  Normal &lt;5% · Mode:{" "}
                  {mcaEarMode === "pulse" ? "Pulse-to-Pulse" : "Line-to-Line"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setMcaEarMode("pulse")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    mcaEarMode === "pulse"
                      ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}
                >
                  Pulse-to-Pulse EAR
                </button>
                <button
                  type="button"
                  onClick={() => setMcaEarMode("line")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    mcaEarMode === "line"
                      ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}
                >
                  Line-to-Line EAR
                </button>
              </div>
              <label className="inline-flex items-center gap-2 mb-4 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBaseline}
                  onChange={(e) => setShowBaseline(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                />
                Overlay Baseline Waveform (Jul 05)
              </label>

              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-3">
                  Surge Waveform Fold-Over Comparison
                </h3>
                <div className="h-72 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={MCA_SURGE_WAVE} margin={chartMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        dataKey="us"
                        stroke="#94a3b8"
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "Time (µs)",
                          position: "insideBottom",
                          offset: -2,
                          fill: "#64748b",
                          fontSize: 10
                        }}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "Voltage (kV)",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#94a3b8",
                          fontSize: 11
                        }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="p1"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        name="Phase 1"
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="p2"
                        stroke="#eab308"
                        strokeWidth={2}
                        name="Phase 2"
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="p3"
                        stroke="#ef4444"
                        strokeWidth={2}
                        name="Phase 3"
                        dot={false}
                        isAnimationActive={false}
                      />
                      {showBaseline && (
                        <Line
                          type="monotone"
                          dataKey="baseline"
                          stroke="#64748b"
                          strokeDasharray="5 5"
                          strokeWidth={2}
                          name="Baseline (Jul 05)"
                          dot={false}
                          isAnimationActive={false}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  Phase 3 offset reflects EAR mismatch (4.2%) — within normal tolerance.
                </p>
              </div>
            </>
          )}
        </>
      )}

      {/* ===== OIL ANALYSIS TECH CONTENT ===== */}
      {trendTech === "oil" && (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {OIL_MODE_OPTIONS.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setOilMode(mode.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                  oilMode === mode.id
                    ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Asset & Lubricant Metadata */}
          <div className="flex flex-wrap gap-2 mb-6">
            {[
              "LUBRICANT: Mobil SHC 630",
              "ISO VG: 220",
              "SUMP CAPACITY: 45 Gal",
              "LAST SAMPLED: Aug 03, 2026",
              "FILTER RATING: β10 = 1000"
            ].map((pill) => (
              <div
                key={pill}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 flex items-center gap-1"
              >
                {pill}
              </div>
            ))}
          </div>

          {/* Executive Fluid Health Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {OIL_HEALTH_CARDS.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => setOilMode(card.id)}
                className="bg-slate-900/50 border border-white/10 rounded-xl p-4 cursor-pointer hover:border-cyan-500/50 hover:bg-slate-800/50 transition-all text-left"
              >
                <p className="text-[10px] font-bold tracking-wider text-slate-400 mb-2">
                  {card.title}
                </p>
                <p className={`text-lg font-bold mb-1 ${card.valueClass}`}>{card.value}</p>
                <p className="text-xs text-slate-400">{card.subtext}</p>
              </button>
            ))}
          </div>

          {/* Wear Metals & Debris */}
          {oilMode === "wear" && (
            <>
              <div className={`${CARD} mb-4`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                  <h3 className="text-base font-bold text-white">
                    Multi-Element Correlation Engine — {oilCorrelation.leftName} vs{" "}
                    {oilCorrelation.rightName}
                  </h3>
                  <select
                    value={correlationPair}
                    onChange={(e) => setCorrelationPair(e.target.value as OilCorrelationPair)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
                  >
                    {OIL_CORRELATION_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="h-72 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={OIL_WEAR_TREND} margin={{ top: 16, right: 40, bottom: 12, left: 48 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis
                        yAxisId="left"
                        stroke={oilCorrelation.leftColor}
                        tick={{ fontSize: 11 }}
                        label={{
                          value: `${oilCorrelation.leftName} (PPM)`,
                          angle: -90,
                          position: "insideLeft",
                          fill: oilCorrelation.leftColor,
                          fontSize: 11
                        }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke={oilCorrelation.rightColor}
                        tick={{ fontSize: 11 }}
                        label={{
                          value: `${oilCorrelation.rightName} (PPM)`,
                          angle: 90,
                          position: "insideRight",
                          fill: oilCorrelation.rightColor,
                          fontSize: 11
                        }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey={oilCorrelation.leftKey}
                        stroke={oilCorrelation.leftColor}
                        strokeWidth={2.5}
                        name={oilCorrelation.leftName}
                        dot={{ r: 3 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey={oilCorrelation.rightKey}
                        stroke={oilCorrelation.rightColor}
                        strokeWidth={2.5}
                        name={oilCorrelation.rightName}
                        dot={{ r: 3 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4 mt-4 flex items-start gap-3">
                  <span className="text-cyan-400 text-lg shrink-0" aria-hidden>
                    💡
                  </span>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    <span className="font-bold text-cyan-400">Automated Diagnosis:</span> Silicon
                    (Si) spiked to 45 PPM on Jul 19, followed immediately by a sharp rise in Iron
                    (Fe) to 82 PPM. Dirt ingress through breathers/seals is causing abrasive wear on
                    steel shaft journals.
                  </p>
                </div>
              </div>

              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-3">
                  Ferrous Wear Index (PQ Index)
                </h3>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 mb-3">
                  ⚠️ Severe Particle Size Mismatch: High PQ Index (42) with low ICP Iron indicates
                  large fatigue spalls (&gt;10µm) that emission spectrometry cannot detect.
                </div>
                <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={OIL_WEAR_TREND} margin={chartMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis
                        stroke="#f97316"
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "PQ Index",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#f97316",
                          fontSize: 11
                        }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line
                        type="monotone"
                        dataKey="pq"
                        stroke="#f97316"
                        strokeWidth={2.5}
                        name="PQ Index"
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {/* Fluid Chemistry */}
          {oilMode === "chemistry" && (
            <>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center mb-6">
                <p className="text-sm font-bold text-yellow-400 tracking-wide">
                  ESTIMATED OIL CHANGE REQUIRED IN: 28 DAYS
                </p>
              </div>

              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-3">
                  RUL &amp; Oil Change Estimator — TAN/TBN Crossover
                </h3>
                <div className="h-72 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={OIL_TAN_TBN} margin={chartMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis
                        stroke="#94a3b8"
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "mg KOH/g",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#94a3b8",
                          fontSize: 11
                        }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <ReferenceLine
                        x="Aug 03"
                        stroke="#ef4444"
                        strokeDasharray="4 4"
                        label={{
                          value: "Optimal Drain Interval",
                          position: "insideTop",
                          fill: "#ef4444",
                          fontSize: 10
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="tan"
                        stroke="#eab308"
                        strokeWidth={2.5}
                        name="TAN (rising)"
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="tbn"
                        stroke="#3b82f6"
                        strokeWidth={2.5}
                        name="TBN (dropping)"
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-3">
                  Viscosity @ 40°C (Baseline ±10%)
                </h3>
                <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={OIL_VISCOSITY} margin={chartMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis
                        stroke="#22c55e"
                        tick={{ fontSize: 11 }}
                        domain={[38, 56]}
                        label={{
                          value: "cSt",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#22c55e",
                          fontSize: 11
                        }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="high"
                        stroke="#22c55e"
                        strokeDasharray="4 4"
                        strokeWidth={1}
                        name="+10% Band"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="low"
                        stroke="#22c55e"
                        strokeDasharray="4 4"
                        strokeWidth={1}
                        name="-10% Band"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="visc"
                        stroke="#eab308"
                        strokeWidth={2.5}
                        name="Viscosity @ 40°C"
                        dot={{ r: 3 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <span className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-green-400">
                    Oxidation: 18 abs/cm (Limit &lt;25)
                  </span>
                  <span className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-green-400">
                    Nitration: 12 abs/cm
                  </span>
                  <span className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-green-400">
                    Sulfation: 14 abs/cm
                  </span>
                  <span className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-green-400">
                    Soot: 0.4% wt
                  </span>
                </div>
                <div className="mt-4">
                  <p className="text-xs text-slate-300">
                    Anti-Wear Additive Reserve (Zn/P): 78% Remaining (Good)
                  </p>
                  <div className="w-full h-2 bg-slate-800 rounded-full mt-1">
                    <div className="h-2 bg-green-500 rounded-full" style={{ width: "78%" }} />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Cleanliness */}
          {oilMode === "cleanliness" && (
            <>
              <div className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
                <h3 className="text-base font-bold text-white mb-4">
                  Interactive ISO 4406 Visual Cleanliness Gauge
                </h3>
                <div className="space-y-5">
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-400">&gt;4µm</span>
                      <span className="text-red-400 font-bold font-mono">Code 18</span>
                    </div>
                    <div
                      className="h-3 rounded-full bg-slate-950 border border-white/10 overflow-hidden"
                      title="1,300 - 2,500 particles/mL"
                    >
                      <div className="h-full w-[80%] rounded-full bg-red-500" />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">1,300 - 2,500 particles/mL</p>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-400">&gt;6µm</span>
                      <span className="text-orange-400 font-bold font-mono">Code 16</span>
                    </div>
                    <div
                      className="h-3 rounded-full bg-slate-950 border border-white/10 overflow-hidden"
                      title="320 - 640 particles/mL"
                    >
                      <div className="h-full w-[60%] rounded-full bg-orange-500" />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">320 - 640 particles/mL</p>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-400">&gt;14µm</span>
                      <span className="text-yellow-400 font-bold font-mono">Code 13</span>
                    </div>
                    <div
                      className="h-3 rounded-full bg-slate-950 border border-white/10 overflow-hidden"
                      title="40 - 80 particles/mL"
                    >
                      <div className="h-full w-[30%] rounded-full bg-yellow-500" />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">40 - 80 particles/mL</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-4">Target ISO Limit: 15/13/10</p>
                <div className="mt-5">
                  <h4 className="text-sm font-semibold text-white mb-2">ISO Code Progression</h4>
                  <div className="h-40 bg-slate-950 rounded-lg border border-white/10 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={OIL_ISO_PROGRESSION} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                        <YAxis
                          stroke="#ef4444"
                          tick={{ fontSize: 10 }}
                          domain={[14, 19]}
                          allowDecimals={false}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line
                          type="monotone"
                          dataKey="code"
                          stroke="#ef4444"
                          strokeWidth={2.5}
                          name="ISO &gt;4µm"
                          dot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Jul 05: 15/13/10 ➔ Jul 19: 17/15/12 ➔ Aug 03: 18/16/13 (Alert)
                  </p>
                </div>
              </div>

              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-3">Moisture Content (PPM)</h3>
                <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={OIL_MOISTURE} margin={chartMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis
                        stroke="#22d3ee"
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "PPM",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#22d3ee",
                          fontSize: 11
                        }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <ReferenceLine
                        y={200}
                        stroke="#f97316"
                        strokeDasharray="3 3"
                        label={{
                          value: "Mineral Oil Saturation Limit (200 PPM)",
                          position: "right",
                          fill: "#f97316",
                          fontSize: 10
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="ppm"
                        stroke="#22d3ee"
                        strokeWidth={2.5}
                        name="Moisture"
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {/* Ferrography & Varnish */}
          {oilMode === "ferrography" && (
            <>
              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-4">
                  Microscopic Patch Viewer
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {OIL_PATCHES.map((patch) => (
                    <button
                      key={patch.id}
                      type="button"
                      onClick={() => {
                        setSelectedPatch(patch.id);
                        setPatchZoom("100x");
                      }}
                      className="text-left cursor-pointer group relative"
                    >
                      <p className="text-xs font-semibold text-slate-400 mb-2 group-hover:text-cyan-400 transition-colors">
                        {patch.title}
                      </p>
                      <div className="h-48 w-full bg-slate-950 rounded-lg border border-white/10 relative overflow-hidden group-hover:border-cyan-500/50 transition-colors">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-800 to-slate-950" />
                        <div
                          className={`absolute ${patch.boxPos} px-2 py-1 rounded border ${patch.box} bg-slate-950/80 text-[10px] font-bold`}
                        >
                          {patch.label}
                        </div>
                        <div className="absolute inset-0 opacity-30">
                          <div className="absolute top-1/3 left-1/4 w-2 h-2 rounded-full bg-amber-600/80" />
                          <div className="absolute top-1/2 left-1/2 w-3 h-1.5 rounded-sm bg-red-700/70 rotate-12" />
                          <div className="absolute bottom-1/3 right-1/3 w-1.5 h-1.5 rounded-full bg-orange-500/70" />
                        </div>
                        <div className="absolute top-2 right-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 pointer-events-none">
                          🔍 400x Zoom
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className={`${CARD} mb-6`}>
                <h3 className="text-base font-bold text-white mb-3">
                  Membrane Patch Colorimetry (MPC ΔE)
                </h3>
                <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={OIL_MPC} margin={chartMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis
                        stroke="#eab308"
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "ΔE",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#eab308",
                          fontSize: 11
                        }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <ReferenceLine
                        y={25}
                        stroke="#ef4444"
                        strokeDasharray="4 4"
                        label={{
                          value: "Critical Varnish",
                          position: "right",
                          fill: "#ef4444",
                          fontSize: 10
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="de"
                        stroke="#eab308"
                        strokeWidth={2.5}
                        name="MPC ΔE"
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  Rising MPC ΔE indicates varnish potential — current ΔE 31 exceeds critical
                  threshold (25).
                </p>
                <div className="w-full bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 mt-4 flex items-start gap-3">
                  <span className="text-purple-400 text-lg shrink-0" aria-hidden>
                    🧪
                  </span>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    <span className="font-bold text-purple-300">Prescriptive Action:</span> MPC ΔE =
                    31 exceeds critical varnish threshold (25). Recommend installing an
                    Electrostatic Oil Cleaner (EOC) or Soluble Contaminant Removal (SAC) filtration
                    skid to prevent servo-valve sticking.
                  </p>
                </div>
              </div>
            </>
          )}

          {selectedPatchData && (
            <div
              className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
              onClick={() => setSelectedPatch(null)}
              role="presentation"
            >
              <div
                className="bg-slate-900 border border-white/10 rounded-xl p-6 max-w-2xl w-full relative"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
              >
                <button
                  type="button"
                  onClick={() => setSelectedPatch(null)}
                  className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
                  aria-label="Close patch lightbox"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-2 mb-4 pr-8">
                  {(["100x", "400x"] as const).map((zoom) => (
                    <button
                      key={zoom}
                      type="button"
                      onClick={() => setPatchZoom(zoom)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                        patchZoom === zoom
                          ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                          : "bg-slate-800 border-slate-700 text-slate-400"
                      }`}
                    >
                      {zoom}
                    </button>
                  ))}
                </div>
                <div
                  className={`h-96 w-full bg-slate-950 rounded-lg border border-white/10 relative overflow-hidden ${
                    patchZoom === "400x" ? "scale-110 origin-center" : ""
                  }`}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-800 to-slate-950" />
                  <div
                    className={`absolute ${selectedPatchData.boxPos} px-2 py-1 rounded border ${selectedPatchData.box} bg-slate-950/80 text-xs font-bold`}
                  >
                    {selectedPatchData.label}
                  </div>
                  <div
                    className={`absolute inset-0 ${patchZoom === "400x" ? "opacity-60 scale-150" : "opacity-40"}`}
                  >
                    <div className="absolute top-1/3 left-1/4 w-3 h-3 rounded-full bg-amber-600/80" />
                    <div className="absolute top-1/2 left-1/2 w-5 h-2.5 rounded-sm bg-red-700/70 rotate-12" />
                    <div className="absolute bottom-1/3 right-1/3 w-2.5 h-2.5 rounded-full bg-orange-500/70" />
                    <div className="absolute top-1/4 right-1/4 w-4 h-1 rounded-full bg-yellow-600/60 rotate-45" />
                  </div>
                </div>
                <p className="text-sm text-slate-300 mt-4">{selectedPatchData.caption}</p>
              </div>
            </div>
          )}
        </>
      )}

      {trendTech !== "vibration" &&
        trendTech !== "thermography" &&
        trendTech !== "ultrasound" &&
        trendTech !== "mca" &&
        trendTech !== "oil" && (
        <div className={`${CARD} mb-6`}>
          <p className="text-sm text-slate-300">
            <span className="text-yellow-400 font-semibold capitalize">{trendTech}</span> trend
            views are next — all primary technologies are available above.
          </p>
        </div>
      )}

      {/* ===== SECTION 6: REPORTING ACTIONS ===== */}
      <div className="flex flex-wrap gap-3 pb-2">
        <button
          type="button"
          onClick={() => alert("Exporting PDF report…")}
          className="inline-flex items-center gap-2 border border-slate-700 text-white hover:bg-slate-800 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors"
        >
          <FileText className="h-4 w-4" />
          Export PDF Report
        </button>
        <button
          type="button"
          onClick={() => alert("Exporting CSV…")}
          className="inline-flex items-center gap-2 border border-slate-700 text-white hover:bg-slate-800 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
        <button
          type="button"
          onClick={() => alert("Emailing manager…")}
          className="inline-flex items-center gap-2 border border-slate-700 text-white hover:bg-slate-800 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors"
        >
          <Mail className="h-4 w-4" />
          Email Manager
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 border border-slate-700 text-white hover:bg-slate-800 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>
    </div>
  );
}
