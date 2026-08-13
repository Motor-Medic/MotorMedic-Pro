import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
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
  Printer,
  Search,
  Settings,
  Sparkles,
  Thermometer,
  Waves,
  Wrench,
  Zap
} from "lucide-react";
import { TrendDataPoint } from "../types";
import {
  fetchAnalysisResults,
  type SavedAnalysisResult
} from "../lib/analysisPersistence";
import {
  buildThermoChartSeries,
  hottestPhaseFromPoint,
  mechanicalKpis,
  nfpaClassBadge,
  radiometricKpis,
  seriesHasAny,
  type ThermoChartPoint
} from "../lib/thermographyTrendSeries";
import {
  getEquipmentData,
  getFlatEquipment,
  type FlatEquipAsset
} from "../data/equipmentDb";

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

function TechEmptyState({ technology }: { technology: string }) {
  return (
    <div className={`${CARD} mb-6 flex flex-col items-center justify-center text-center py-16 px-6`}>
      <div className="w-12 h-12 rounded-xl border border-slate-700 bg-slate-950 flex items-center justify-center mb-4">
        <Activity className="h-5 w-5 text-slate-500" />
      </div>
      <p className="text-sm font-semibold text-slate-200">
        No {technology} data available for this asset.
      </p>
      <p className="text-xs text-slate-500 mt-2 max-w-md">
        Run a diagnostic to populate trends.
      </p>
    </div>
  );
}

/** Chart shell with axes always rendered; optional overlay when series is empty. */
function ThermoChartFrame({
  title,
  subtitle,
  overlay,
  children
}: {
  title: string;
  subtitle?: string;
  overlay?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className={`${CARD} mb-6`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
        {title}
      </p>
      {subtitle ? (
        <p className="text-xs text-slate-500 mb-3">{subtitle}</p>
      ) : (
        <div className="mb-3" />
      )}
      <div className="relative h-72 bg-slate-950/40 rounded-lg border border-white/5">
        <div className="absolute inset-0 p-2">{children}</div>
        {overlay ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-slate-950/55 rounded-lg">
            <p className="text-sm font-semibold text-slate-200 px-4 text-center max-w-md">
              {overlay}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Infer technology when older analysis_results rows lack analysis_type. */
function resolveAnalysisType(r: SavedAnalysisResult): string {
  const explicit = String(r.analysis_type || "").trim().toLowerCase();
  if (explicit) return explicit;
  const peaks = Array.isArray(r.peaks) ? r.peaks : [];
  for (const raw of peaks) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (String(p.type || "").toLowerCase() === "thermography") return "thermography";
    if (String(p.type || "").toLowerCase() === "ultrasound") return "ultrasound";
    if (String(p.type || "").toLowerCase() === "mca") return "mca";
    if (String(p.type || "").toLowerCase() === "oil" || String(p.type || "").toLowerCase() === "oil_analysis")
      return "oil";
    if (p.frequencyHz != null || p.chart != null) return "vibration";
  }
  const fault = String(r.primary_fault || "").toLowerCase();
  if (
    /loose connection|high resistance|overload|phase imbalance|harmonic|hotspot|thermal|bearing defect|lubrication failure|friction|misalignment/.test(
      fault
    ) &&
    !/angular misalignment|parallel misalignment|unbalance|looseness|bpfo|bpfi|bsf|ftf/.test(fault)
  ) {
    // Prefer thermography for IR-style titles; keep classic vib misalignment as vibration
    if (
      /loose connection|high resistance|overload|phase imbalance|harmonic|hotspot|thermal/.test(
        fault
      )
    ) {
      return "thermography";
    }
  }
  return "vibration";
}

function uePeaksFromRow(r: SavedAnalysisResult): {
  peak: number | null;
  rms: number | null;
  delta: number | null;
} {
  const peaks = Array.isArray(r.peaks) ? r.peaks : [];
  for (const raw of peaks) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (String(p.type || "").toLowerCase() !== "ultrasound") continue;
    const peak = Number(p.peak_dbmv ?? p.peak_dbuv);
    const rms = Number(p.rms_dbmv ?? p.rms_dbuv);
    const delta = Number(p.delta_db);
    return {
      peak: Number.isFinite(peak) ? peak : null,
      rms: Number.isFinite(rms) ? rms : null,
      delta: Number.isFinite(delta) ? delta : null
    };
  }
  return { peak: null, rms: null, delta: null };
}

function healthTrendFromAnalyses(rows: SavedAnalysisResult[]) {
  return [...rows]
    .reverse()
    .map((r) => ({
      date: r.timestamp
        ? new Date(r.timestamp).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric"
          })
        : "—",
      health: Number(r.health_score) || 0,
      fault: r.primary_fault || "—",
      timestamp: r.timestamp
    }));
}

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

const TREND_TECH_CARDS = [
  {
    id: "vibration",
    title: "Vibration Analysis",
    description: "FFT spectrum, waveform, bearing analysis",
    Icon: Activity,
    iconClass: "bg-yellow-500/15 border-yellow-500/40 text-yellow-400"
  },
  {
    id: "thermography",
    title: "Thermography",
    description: "Thermal imaging, temperature analysis",
    Icon: Thermometer,
    iconClass: "bg-red-500/15 border-red-500/40 text-red-400"
  },
  {
    id: "ultrasound",
    title: "Ultrasound",
    description: "Acoustic emissions, leak detection",
    Icon: AudioWaveform,
    iconClass: "bg-sky-500/15 border-sky-500/40 text-sky-400"
  },
  {
    id: "mca",
    title: "Motor Circuit Analysis",
    description: "Winding health, insulation testing",
    Icon: Zap,
    iconClass: "bg-yellow-500/15 border-yellow-500/40 text-yellow-400"
  },
  {
    id: "oil",
    title: "Oil Analysis",
    description: "Wear metals, viscosity, contamination",
    Icon: Droplet,
    iconClass: "bg-cyan-500/15 border-cyan-500/40 text-cyan-400"
  }
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

type IrMode = "hotspot" | "phase" | "radiometric" | "mechanical";

const IR_MODE_OPTIONS: { id: IrMode; label: string }[] = [
  { id: "hotspot", label: "🔥 Hotspot & NETA Severity" },
  { id: "phase", label: "⚡ Phase Delta & I²R Load" },
  { id: "radiometric", label: "🖼️ Radiometric & Isotherm" },
  { id: "mechanical", label: "🧱 Mechanical & Refractory" }
];

type UeMode = "bearings" | "leaks" | "electrical" | "steam";

const UE_MODE_OPTIONS: { id: UeMode; label: string }[] = [
  { id: "bearings", label: "Bearings & Mechanical" },
  { id: "leaks", label: "Compressed Air Leaks" },
  { id: "electrical", label: "Electrical PD" },
  { id: "steam", label: "Steam Traps" }
];

type McaMode = "winding" | "insulation" | "rotor" | "surge";

const MCA_MODE_OPTIONS: {
  id: McaMode;
  label: string;
  icon: "settings" | "zap" | "activity" | "waves";
}[] = [
  { id: "winding", label: "Winding & Phase Balance", icon: "settings" },
  { id: "insulation", label: "Groundwall Insulation", icon: "zap" },
  { id: "rotor", label: "Rotor Influence Check", icon: "activity" },
  { id: "surge", label: "Surge Waveforms", icon: "waves" }
];

type OilMode = "wear" | "chemistry" | "cleanliness" | "ferrography";

const OIL_MODE_OPTIONS: { id: OilMode; label: string }[] = [
  { id: "wear", label: "🔩 Wear Metals & Debris" },
  { id: "chemistry", label: "🧪 Fluid Chemistry" },
  { id: "cleanliness", label: "🧹 Cleanliness" },
  { id: "ferrography", label: "Ferrography & Varnish" }
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
  markers?: typeof EVENT_MARKERS;
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

function peakAmplitudeFromAnalysis(row: SavedAnalysisResult): number | null {
  const peaks = Array.isArray(row.peaks) ? row.peaks : [];
  let max = 0;
  let found = false;
  for (const raw of peaks) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const amp = Number(p.amplitude ?? p.amp ?? p.ips ?? p.mm_s ?? p.value);
    if (Number.isFinite(amp)) {
      found = true;
      max = Math.max(max, amp);
    }
  }
  return found ? Number(max.toFixed(4)) : null;
}

function formatRpmHz(rpm: number | null): string {
  if (rpm == null || !Number.isFinite(rpm) || rpm <= 0) return "Not set";
  const hz = rpm / 60;
  return `${rpm.toLocaleString()} RPM (${hz.toFixed(1)} Hz)`;
}

function readSpecNumber(
  specs: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    const raw = specs[key];
    if (raw == null) continue;
    const n = Number(String(raw).replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function readSpecString(
  specs: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const raw = specs[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  }
  return null;
}

export default function TrendAnalyzer({
  trendData,
  onAddTrendPoint,
  selectedAssetId,
  selectedCompanyId
}: TrendAnalyzerProps) {
  void trendData;
  void onAddTrendPoint;
  void selectedCompanyId;

  const [equipTick, setEquipTick] = useState(0);
  const equipmentRoutes = useMemo(() => {
    void equipTick;
    return getEquipmentData();
  }, [equipTick]);
  const flatEquipment = useMemo(() => {
    void equipTick;
    return getFlatEquipment();
  }, [equipTick]);

  const [selectedRouteName, setSelectedRouteName] = useState("");
  const [selectedAssetKey, setSelectedAssetKey] = useState("");
  const [selectedComponent, setSelectedComponent] = useState("");
  const [trendTech, setTrendTech] = useState<string>("vibration");
  const [vibMode, setVibMode] = useState<VibMode>("broadband");
  const [spectrumView, setSpectrumView] = useState<"side-by-side" | "overlay">("side-by-side");
  const [irMode, setIrMode] = useState<IrMode>("hotspot");
  const [ueMode, setUeMode] = useState<UeMode>("bearings");
  const [mcaMode, setMcaMode] = useState<McaMode>("winding");
  const [oilMode, setOilMode] = useState<OilMode>("wear");
  const [timeRange, setTimeRange] = useState<TimeRange>("30D");
  const [runningOnly, setRunningOnly] = useState(true);
  const [overlayParam, setOverlayParam] = useState<OverlayParam>(null);
  const [speedFactor, setSpeedFactor] = useState(1.0);
  const [selectedPointA, setSelectedPointA] = useState<SpectrumPoint | null>(null);
  const [selectedPointB, setSelectedPointB] = useState<SpectrumPoint | null>(null);
  const [nextPick, setNextPick] = useState<"A" | "B">("A");
  const [showThresholds, setShowThresholds] = useState(true);
  const [dbAnalyses, setDbAnalyses] = useState<SavedAnalysisResult[]>([]);
  const [dbTrendError, setDbTrendError] = useState<string | null>(null);
  const [dbTrendLoading, setDbTrendLoading] = useState(false);
  const [fetchTick, setFetchTick] = useState(0);
  const [assetSearch, setAssetSearch] = useState("");
  const seededFromPropRef = useRef<string | null>(null);

  // Seed selection from Equipment DB once per navigation prop — do not reset on Refresh
  useEffect(() => {
    if (!flatEquipment.length) return;
    const propId = selectedAssetId ? String(selectedAssetId) : "";
    if (propId) {
      if (seededFromPropRef.current === propId) return;
      const propAsset =
        flatEquipment.find((a) => a.id === propId || a.tag === propId) || null;
      if (propAsset) {
        seededFromPropRef.current = propId;
        setSelectedRouteName(propAsset.routeName);
        setSelectedAssetKey(propAsset.id);
        setSelectedComponent("");
        return;
      }
    }
    setSelectedRouteName((prev) => prev || equipmentRoutes[0]?.name || "");
  }, [equipmentRoutes, flatEquipment, selectedAssetId]);

  const routeAssets = useMemo(() => {
    if (!selectedRouteName) return [] as FlatEquipAsset[];
    return flatEquipment.filter((a) => a.routeName === selectedRouteName);
  }, [flatEquipment, selectedRouteName]);

  const filteredRouteAssets = useMemo(() => {
    const q = assetSearch.trim().toLowerCase();
    if (!q) return routeAssets;
    return routeAssets.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.tag.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
    );
  }, [routeAssets, assetSearch]);

  const selectedAsset = useMemo(
    () =>
      flatEquipment.find((a) => a.id === selectedAssetKey) ||
      routeAssets.find((a) => a.id === selectedAssetKey) ||
      null,
    [flatEquipment, routeAssets, selectedAssetKey]
  );

  useEffect(() => {
    if (!selectedRouteName) return;
    if (selectedAssetKey && routeAssets.some((a) => a.id === selectedAssetKey)) {
      return;
    }
    if (routeAssets[0]) {
      setSelectedAssetKey(routeAssets[0].id);
      setSelectedComponent("");
    } else {
      setSelectedAssetKey("");
      setSelectedComponent("");
    }
  }, [selectedRouteName, routeAssets, selectedAssetKey]);

  useEffect(() => {
    if (!selectedAsset) return;
    setSelectedComponent((prev) => {
      if (prev && selectedAsset.components.some((c) => c.name === prev)) return prev;
      return "";
    });
  }, [selectedAsset]);

  const selectedComp = useMemo(
    () => selectedAsset?.components.find((c) => c.name === selectedComponent) || null,
    [selectedAsset, selectedComponent]
  );

  const machineSpecs = useMemo(() => {
    const kin = (selectedComp?.kinematics || {}) as Record<string, unknown>;
    const isoClass =
      readSpecString(kin, "isoClass", "iso_class") ||
      selectedComp?.isoClass ||
      selectedAsset?.isoClass ||
      "Not set";
    const rpm =
      readSpecNumber(kin, "ratedRpm", "rpm") ||
      selectedComp?.speedRpm ||
      selectedAsset?.speedRpm ||
      null;
    const bearing =
      readSpecString(kin, "bearingDe", "bearingNde", "bearingType") ||
      selectedComp?.bearingType ||
      selectedAsset?.bearingType ||
      "Not set";
    const bpfo = readSpecString(kin, "bpfo", "BPFO", "bpfoOrder");
    const foundation =
      isoClass.includes("III") || isoClass.includes("IV")
        ? "Rigid Foundation"
        : isoClass !== "Not set"
          ? "Flexible / general"
          : null;
    return {
      pills: [
        isoClass === "Not set"
          ? "MACHINE CLASS: Not set"
          : `MACHINE CLASS: ${isoClass}${foundation ? ` (${foundation})` : ""}`,
        `RUNNING SPEED: ${formatRpmHz(rpm)}`,
        bpfo ? `BEARING: ${bearing} (BPFO: ${bpfo})` : `BEARING: ${bearing}`
      ],
      isoClass,
      rpm,
      bearing
    };
  }, [selectedAsset, selectedComp]);

  // Prefer tag (Diagnose persists asset_id as tag), then id — never mix in stale nav props
  const analysisAssetQueryKey = useMemo(() => {
    if (!selectedAsset) return "";
    const tag = selectedAsset.tag?.trim();
    const id = selectedAsset.id?.trim();
    return tag || id || "";
  }, [selectedAsset]);

  // Pull health / peak history from analysis_results for selected asset + component
  useEffect(() => {
    let cancelled = false;

    // Clear previous selection data immediately so UI never shows stale charts
    setDbAnalyses([]);
    setDbTrendError(null);

    if (!analysisAssetQueryKey) {
      setDbTrendLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setDbTrendLoading(true);

    (async () => {
      try {
        const keys = [analysisAssetQueryKey];
        if (
          selectedAsset?.id &&
          selectedAsset.id !== analysisAssetQueryKey
        ) {
          keys.push(selectedAsset.id);
        }
        if (
          selectedAsset?.tag &&
          selectedAsset.tag !== analysisAssetQueryKey &&
          !keys.includes(selectedAsset.tag)
        ) {
          keys.push(selectedAsset.tag);
        }

        const componentFilter = selectedComponent?.trim() || undefined;

        let rows = await fetchAnalysisResults({
          asset_id: keys.length === 1 ? keys[0] : keys.join(","),
          component: componentFilter,
          limit: 100
        });

        // Strict client-side asset match — drop fuzzy ILIKE false positives
        const lowerKeys = keys.map((k) => k.toLowerCase());
        rows = rows.filter((r) => {
          const id = String(r.asset_id || "").toLowerCase();
          if (!id) return false;
          return lowerKeys.some((k) => id === k);
        });

        // Component match when selected — keep asset-level rows with no component set
        if (componentFilter) {
          const compLower = componentFilter.toLowerCase();
          rows = rows.filter((r) => {
            const c = String(r.component || "").trim().toLowerCase();
            return !c || c === compLower;
          });
        }

        if (!cancelled) {
          setDbAnalyses(rows);
          setDbTrendError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setDbTrendError(
            err instanceof Error ? err.message : "Failed to load trend data"
          );
          setDbAnalyses([]);
        }
      } finally {
        if (!cancelled) setDbTrendLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    analysisAssetQueryKey,
    selectedAsset?.id,
    selectedAsset?.tag,
    selectedComponent,
    fetchTick
  ]);

  const vibAnalyses = useMemo(
    () => dbAnalyses.filter((r) => resolveAnalysisType(r) === "vibration"),
    [dbAnalyses]
  );
  const thermoAnalyses = useMemo(
    () => dbAnalyses.filter((r) => resolveAnalysisType(r) === "thermography"),
    [dbAnalyses]
  );
  const ueAnalyses = useMemo(
    () => dbAnalyses.filter((r) => resolveAnalysisType(r) === "ultrasound"),
    [dbAnalyses]
  );
  const mcaAnalyses = useMemo(
    () => dbAnalyses.filter((r) => resolveAnalysisType(r) === "mca"),
    [dbAnalyses]
  );
  const oilAnalyses = useMemo(
    () =>
      dbAnalyses.filter((r) => {
        const t = resolveAnalysisType(r);
        return t === "oil" || t === "oil_analysis";
      }),
    [dbAnalyses]
  );

  const healthTrendSeries = useMemo(() => {
    return [...vibAnalyses]
      .filter((r) => r.health_score != null)
      .reverse()
      .map((r) => ({
        date: r.timestamp
          ? new Date(r.timestamp).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric"
            })
          : "—",
        health: Number(r.health_score) || 0,
        fault: r.primary_fault || "—",
        timestamp: r.timestamp
      }));
  }, [vibAnalyses]);

  const velocityTrendSeries = useMemo(() => {
    return [...vibAnalyses]
      .map((r) => {
        const peak = peakAmplitudeFromAnalysis(r);
        if (peak == null) return null;
        return {
          date: r.timestamp
            ? new Date(r.timestamp).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric"
              })
            : "—",
          peak,
          fault: r.primary_fault || "—",
          timestamp: r.timestamp
        };
      })
      .filter(Boolean)
      .reverse() as { date: string; peak: number; fault: string; timestamp: string }[];
  }, [vibAnalyses]);

  const activeAnalyses = useMemo(() => {
    if (trendTech === "thermography") return thermoAnalyses;
    if (trendTech === "ultrasound") return ueAnalyses;
    if (trendTech === "mca") return mcaAnalyses;
    if (trendTech === "oil") return oilAnalyses;
    if (trendTech === "vibration") return vibAnalyses;
    return dbAnalyses;
  }, [
    trendTech,
    thermoAnalyses,
    ueAnalyses,
    mcaAnalyses,
    oilAnalyses,
    vibAnalyses,
    dbAnalyses
  ]);

  const latestDb = activeAnalyses[0] ?? null;
  const latestThermo = thermoAnalyses[0] ?? null;
  const latestUe = ueAnalyses[0] ?? null;
  const latestMca = mcaAnalyses[0] ?? null;
  const latestOil = oilAnalyses[0] ?? null;
  const thermoChartSeries = useMemo(
    () => buildThermoChartSeries(thermoAnalyses),
    [thermoAnalyses]
  );
  const latestThermoChart: ThermoChartPoint | null =
    thermoChartSeries.length > 0
      ? thermoChartSeries[thermoChartSeries.length - 1]
      : null;
  const hasHotspotSeries = seriesHasAny(thermoChartSeries, [
    "hotspot",
    "reference",
    "deltaT",
    "severityClass"
  ]);
  const hasPhaseSeries = seriesHasAny(thermoChartSeries, [
    "phaseA",
    "phaseB",
    "phaseC",
    "loadPercent",
    "i2rDelta",
    "i2rNormalizedDelta"
  ]);
  const phaseHottest = hottestPhaseFromPoint(latestThermoChart);
  const phaseNfpaBadge = nfpaClassBadge(latestThermoChart);
  const hasRadiometricSeries = seriesHasAny(thermoChartSeries, [
    "emissivity",
    "scaleMin",
    "scaleMax",
    "isothermThreshold",
    "boxAverage",
    "reflectedApparentTemp"
  ]);
  const radioKpis = radiometricKpis(thermoChartSeries);
  const hasMechanicalSeries = seriesHasAny(thermoChartSeries, [
    "deBearing",
    "odeBearing",
    "skinTemp",
    "refractorySkinTemp",
    "ambientReferenceTemp",
    "maxAllowable",
    "thermalGradient",
    "thermalDissipationRate"
  ]);
  const mechKpis = mechanicalKpis(thermoChartSeries);
  const ueTrendSeries = useMemo(() => {
    return [...ueAnalyses]
      .reverse()
      .map((r) => {
        const up = uePeaksFromRow(r);
        return {
          date: r.timestamp
            ? new Date(r.timestamp).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric"
              })
            : "—",
          health: Number(r.health_score) || 0,
          peak: up.peak,
          rms: up.rms,
          fault: r.primary_fault || "—"
        };
      });
  }, [ueAnalyses]);
  const mcaTrendSeries = useMemo(
    () => healthTrendFromAnalyses(mcaAnalyses),
    [mcaAnalyses]
  );
  const oilTrendSeries = useMemo(
    () => healthTrendFromAnalyses(oilAnalyses),
    [oilAnalyses]
  );
  const latestPeak =
    velocityTrendSeries.length > 0
      ? velocityTrendSeries[velocityTrendSeries.length - 1].peak
      : null;
  const warningThreshold =
    selectedAsset?.warningThreshold ??
    selectedComp?.warningThreshold ??
    null;
  const criticalThreshold =
    selectedAsset?.criticalThreshold ??
    selectedComp?.criticalThreshold ??
    null;
  const isoMarkerPct =
    latestPeak != null
      ? Math.min(100, Math.max(2, (latestPeak / 11) * 100))
      : null;

  const triaxialAxes = useMemo(() => {
    const peaks = Array.isArray(latestDb?.peaks) ? latestDb!.peaks : [];
    const byLabel = (re: RegExp) => {
      for (const raw of peaks) {
        if (!raw || typeof raw !== "object") continue;
        const p = raw as Record<string, unknown>;
        const label = String(p.label ?? p.axis ?? "");
        const amp = Number(p.amplitude ?? p.amp ?? p.value);
        if (re.test(label) && Number.isFinite(amp)) return amp;
      }
      return null;
    };
    const h = byLabel(/\bH\b|horiz/i);
    const v = byLabel(/\bV\b|vert/i);
    const a = byLabel(/\bA\b|axial/i);
    // If axis-tagged peaks are missing, use overall peak for Horizontal only
    const overall = latestPeak;
    return [
      {
        axis: "Horizontal (H)",
        value: h ?? overall,
        unit: "mm/s RMS",
        tone: "text-yellow-500"
      },
      {
        axis: "Vertical (V)",
        value: v,
        unit: "mm/s RMS",
        tone: "text-green-400"
      },
      {
        axis: "Axial (A)",
        value: a,
        unit: "mm/s RMS",
        tone: "text-orange-400"
      }
    ];
  }, [latestDb, latestPeak]);

  const hasAnyAnalysisData = dbAnalyses.length > 0;
  const hasThermographyData = thermoAnalyses.length > 0;
  const hasUltrasoundData = ueAnalyses.length > 0;
  const hasMcaData = mcaAnalyses.length > 0;
  const hasOilData = oilAnalyses.length > 0;

  const selectClass =
    "bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 outline-none w-full";

  const rulData = useMemo(() => buildRulCone(speedFactor), [speedFactor]);
  const projectedRulDays = Math.max(3, Math.round(14 / speedFactor));

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
        {/* Asset selection — Equipment DB (same keys Diagnose saves with) */}
        <div className="mb-4">
          {!equipmentRoutes.length && (
            <p className="text-xs text-amber-400 mb-2">
              No equipment in Equipment DB yet. Add assets there, then run a diagnostic.
            </p>
          )}
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1 min-w-0">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                  Select Route
                </label>
                <select
                  value={selectedRouteName}
                  onChange={(e) => {
                    setSelectedRouteName(e.target.value);
                    setSelectedAssetKey("");
                    setSelectedComponent("");
                    setAssetSearch("");
                    setDbAnalyses([]);
                    setDbTrendError(null);
                  }}
                  className={selectClass}
                >
                  <option value="">Select Route</option>
                  {equipmentRoutes.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                  Select Asset
                </label>
                <select
                  value={selectedAssetKey}
                  onChange={(e) => {
                    setSelectedAssetKey(e.target.value);
                    setDbAnalyses([]);
                    setDbTrendError(null);
                  }}
                  disabled={!selectedRouteName}
                  className={selectClass}
                >
                  <option value="">Select Asset</option>
                  {filteredRouteAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.tag ? ` — ${a.tag}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                  Select Component
                </label>
                <select
                  value={selectedComponent}
                  onChange={(e) => {
                    setSelectedComponent(e.target.value);
                    setDbAnalyses([]);
                    setDbTrendError(null);
                  }}
                  disabled={!selectedAssetKey}
                  className={selectClass}
                >
                  <option value="">All components</option>
                  {(selectedAsset?.components || []).map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
                <input
                  type="search"
                  value={assetSearch}
                  onChange={(e) => setAssetSearch(e.target.value)}
                  placeholder="Search asset…"
                  className="min-h-[40px] pl-8 pr-3 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-200 placeholder:text-slate-500 focus:border-yellow-500 outline-none w-40"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setEquipTick((n) => n + 1);
                  setFetchTick((n) => n + 1);
                }}
                className="min-h-[40px] px-3 rounded-lg border border-slate-700 text-xs text-slate-300 hover:border-amber-400/50"
                title="Refresh equipment + analysis trends"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Technology switcher — match Run Diagnostics card layout */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-6 pb-4 border-b border-white/10">
          {TREND_TECH_CARDS.map(({ id, title, description, Icon, iconClass }) => {
            const isActive = trendTech === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTrendTech(id)}
                className={`min-h-[160px] h-40 p-4 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-all ${
                  isActive
                    ? "border-yellow-500 bg-yellow-500/10"
                    : "bg-slate-800/50 border-white/80 hover:border-yellow-500 hover:bg-slate-800"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-lg border flex items-center justify-center mb-2 mx-auto shrink-0 ${iconClass}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <p className="text-sm font-bold text-white text-center leading-tight">
                  {title}
                </p>
                <p className="text-[11px] text-slate-400 text-center mt-1 leading-snug">
                  {description}
                </p>
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
            {machineSpecs.pills.map((pill) => (
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
      {dbTrendLoading ? (
        <div className={`${CARD} mb-6 flex flex-col items-center justify-center text-center py-16 px-6`}>
          <div className="w-12 h-12 rounded-xl border border-slate-700 bg-slate-950 flex items-center justify-center mb-4">
            <Activity className="h-5 w-5 text-yellow-500 animate-pulse" />
          </div>
          <p className="text-sm font-semibold text-slate-200">
            Loading analysis trends…
          </p>
          <p className="text-xs text-slate-500 mt-2 max-w-md">
            Fetching saved diagnostics for this asset
            {selectedComponent ? ` / ${selectedComponent}` : ""} from PostgreSQL.
          </p>
        </div>
      ) : !hasAnyAnalysisData ? (
        <div className={`${CARD} mb-6 flex flex-col items-center justify-center text-center py-16 px-6`}>
          <div className="w-12 h-12 rounded-xl border border-slate-700 bg-slate-950 flex items-center justify-center mb-4">
            <Activity className="h-5 w-5 text-slate-500" />
          </div>
          <p className="text-sm font-semibold text-slate-200">
            {selectedComponent
              ? "No analysis data for this component."
              : "No analysis data for this asset."}
          </p>
          <p className="text-xs text-slate-500 mt-2 max-w-md">
            Run a diagnostic to populate trends.
          </p>
          {dbTrendError && (
            <p className="text-xs text-amber-400 mt-3">{dbTrendError}</p>
          )}
        </div>
      ) : (
        <>
      {/* ===== SECTION 2: KPI RIBBON & PREDICTIVE BANNER ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
            KPI Summary
          </p>
          <ul className="space-y-2.5">
            <li className="text-sm font-bold text-white">
              Health Score:{" "}
              {latestDb?.health_score != null ? latestDb.health_score : "—"}
            </li>
            <li className="text-sm font-semibold text-yellow-500">
              Primary Fault: {latestDb?.primary_fault || "No saved analysis"}
            </li>
            <li className="text-sm font-semibold text-slate-300">
              Analyses:{" "}
              {trendTech === "thermography"
                ? thermoAnalyses.length
                : trendTech === "vibration"
                  ? vibAnalyses.length
                  : dbAnalyses.length}
            </li>
            <li className="text-sm font-semibold text-green-400">
              Source: PostgreSQL
            </li>
          </ul>
        </div>

        <div className={`${CARD} md:col-span-2`}>
          <div className="flex items-start gap-3 mb-3">
            <Sparkles className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white leading-relaxed">
                {latestDb?.summary ||
                  latestDb?.primary_fault ||
                  "Run Diagnostics to populate health trends for this asset."}
              </p>
              <p className="text-sm text-slate-400 mt-2">
                {Array.isArray(latestDb?.recommendations) &&
                latestDb.recommendations.length > 0
                  ? String(latestDb.recommendations[0])
                  : "Recommended Action: Complete a diagnostic run to generate recommendations."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              alert(
                `Opening modal to create Work Order for ${
                  selectedAsset
                    ? `${selectedAsset.name}${
                        selectedAsset.tag ? ` (${selectedAsset.tag})` : ""
                      }`
                    : "selected asset"
                }…`
              )
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
        {/* Chart 1 — Health score from saved diagnostics */}
        <div className={CARD}>
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-yellow-500" />
              <h3 className="text-base font-bold text-white">Health Score Trend</h3>
            </div>
            <p className="text-xs text-slate-400">
              From Run Diagnostics (PostgreSQL)
              {latestDb?.primary_fault ? ` · latest: ${latestDb.primary_fault}` : ""}
            </p>
            {dbTrendError && (
              <p className="text-xs text-amber-400">{dbTrendError}</p>
            )}
          </div>
          <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2">
                {healthTrendSeries.length === 0 ? (
              <div className="h-full flex items-center justify-center px-4 text-center">
                <p className="text-sm text-slate-500">
                  No analysis data yet - run a diagnostic to populate trends
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={healthTrendSeries}
                  margin={chartMargin}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis
                    domain={[0, 100]}
                    stroke="#eab308"
                    tick={{ fontSize: 11 }}
                    label={{
                      value: "Health",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#eab308",
                      fontSize: 11
                    }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [`${value}`, "Health score"]}
                    labelFormatter={(label, payload) => {
                      const fault = payload?.[0]?.payload?.fault;
                      return fault ? `${label} · ${fault}` : String(label);
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="health"
                    stroke="#eab308"
                    strokeWidth={2}
                    name="Health score"
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2 — Peak velocity from analysis peaks */}
        <div className={CARD}>
          <div className="flex flex-col gap-1 mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-400" />
              <h3 className="text-base font-bold text-white">Peak Velocity</h3>
            </div>
            <p className="text-xs text-slate-400">
              From analysis peaks
              {warningThreshold != null || criticalThreshold != null
                ? ` · Warning ${warningThreshold ?? "—"} / Alarm ${criticalThreshold ?? "—"}`
                : " · thresholds not set for this asset"}
            </p>
          </div>
          <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2">
            {velocityTrendSeries.length === 0 ? (
              <div className="h-full flex items-center justify-center px-4 text-center">
                <p className="text-sm text-slate-500">
                  No velocity readings yet — run a diagnostic with spectrum peaks to populate this chart.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={velocityTrendSeries} margin={chartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis
                    stroke="#f97316"
                    tick={{ fontSize: 11 }}
                    label={{
                      value: "Peak amp",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#f97316",
                      fontSize: 11
                    }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [`${value}`, "Peak"]}
                    labelFormatter={(label, payload) => {
                      const fault = payload?.[0]?.payload?.fault;
                      return fault ? `${label} · ${fault}` : String(label);
                    }}
                  />
                  {showThresholds && warningThreshold != null && (
                      <ReferenceLine
                        y={warningThreshold}
                        stroke="#eab308"
                        strokeDasharray="4 4"
                        label={{
                          value: "Warn",
                          fill: "#eab308",
                          fontSize: 10,
                          position: "insideTopRight"
                        }}
                      />
                  )}
                  {showThresholds && criticalThreshold != null && (
                      <ReferenceLine
                        y={criticalThreshold}
                        stroke="#ef4444"
                        strokeDasharray="4 4"
                        label={{
                          value: "Alarm",
                          fill: "#ef4444",
                          fontSize: 10,
                          position: "insideTopRight"
                        }}
                      />
                  )}
                  <Line
                    type="monotone"
                    dataKey="peak"
                    stroke="#f97316"
                    strokeWidth={2}
                    name="Peak Velocity"
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ISO 20816 Severity Matrix */}
      <div className={`${CARD} mb-6`}>
        <h3 className="text-base font-bold text-white mb-1">ISO 20816 Severity Matrix</h3>
        <p className="text-xs text-slate-400 mb-4">
          {latestPeak != null
            ? `Current asset marker at ${latestPeak} (peak amplitude from latest analysis)`
            : "No peak amplitude available yet — run a diagnostic to place the severity marker."}
          {machineSpecs.isoClass !== "Not set" ? ` · ${machineSpecs.isoClass}` : ""}
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
          {latestPeak != null && isoMarkerPct != null && (
            <div
              className="absolute -top-1 flex flex-col items-center"
              style={{ left: `${isoMarkerPct}%` }}
            >
              <div className="w-0.5 h-10 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
              <span className="mt-1 text-[10px] font-bold text-white bg-slate-950 border border-white/20 px-1.5 py-0.5 rounded whitespace-nowrap">
                {latestPeak}
              </span>
            </div>
          )}
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
        {triaxialAxes.map((axis) => (
          <div key={axis.axis} className={CARD}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              {axis.axis}
            </p>
            <p className={`text-2xl font-bold ${axis.tone}`}>
              {axis.value != null ? Number(axis.value).toFixed(2) : "—"}
            </p>
            <p className="text-xs text-slate-400 mt-1">{axis.unit}</p>
          </div>
        ))}
      </div>
        </>
      )}
            </>
          )}

          {vibMode === "spectral" && (
            <TechEmptyState technology="Spectral trend" />
          )}
          {false && vibMode === "spectral" && (
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
            <TechEmptyState technology="Enveloping" />
          )}
          {false && vibMode === "enveloping" && (
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
            <TechEmptyState technology="Waveform" />
          )}
          {false && vibMode === "waveform" && (
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

          {dbTrendLoading ? (
            <div className={`${CARD} mb-6 flex flex-col items-center justify-center text-center py-16 px-6`}>
              <p className="text-sm font-semibold text-slate-200">Loading thermography trends…</p>
            </div>
          ) : (
            <>
              {/* TAB 1 — Hotspot & NETA Severity (KPI + chart + history) */}
              {irMode === "hotspot" && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                        Thermography KPI
                      </p>
                      <ul className="space-y-2.5">
                        <li className="text-sm font-bold text-red-400">
                          Hotspot:{" "}
                          {latestThermoChart?.hotspot != null
                            ? `${latestThermoChart.hotspot}°`
                            : "—"}
                        </li>
                        <li className="text-sm font-semibold text-green-400">
                          Reference:{" "}
                          {latestThermoChart?.reference != null
                            ? `${latestThermoChart.reference}°`
                            : "—"}
                        </li>
                        <li className="text-sm font-semibold text-yellow-400">
                          ΔT:{" "}
                          {latestThermoChart?.deltaT != null
                            ? `${latestThermoChart.deltaT}°`
                            : "—"}
                        </li>
                        <li className="text-sm font-semibold text-white">
                          Fault: {latestThermo?.primary_fault || "—"}
                        </li>
                        <li className="text-sm font-semibold text-slate-300">
                          NETA: {latestThermoChart?.severityLabel || "—"}
                        </li>
                      </ul>
                    </div>
                    <div className={`${CARD} md:col-span-2`}>
                      <p className="text-sm font-semibold text-white leading-relaxed">
                        {hasThermographyData
                          ? latestThermo?.summary ||
                            latestThermo?.primary_fault ||
                            "Thermography analysis saved."
                          : "No thermography data available for this asset."}
                      </p>
                      <p className="text-xs text-slate-500 mt-2">
                        {thermoAnalyses.length} thermography run
                        {thermoAnalyses.length === 1 ? "" : "s"} from PostgreSQL
                        (analysis_type = thermography)
                      </p>
                    </div>
                  </div>

                  <ThermoChartFrame
                    title="Hotspot & NETA Severity"
                    subtitle="Primary: hotspot / reference / ΔT · Secondary: NETA Class 1–4"
                    overlay={
                      !hasThermographyData
                        ? "No thermography scans for this asset"
                        : !hasHotspotSeries
                          ? "No hotspot / ΔT fields in saved scans yet"
                          : null
                    }
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={thermoChartSeries} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis
                          yAxisId="temp"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          label={{
                            value: "°C / °F",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#64748b",
                            fontSize: 11
                          }}
                        />
                        <YAxis
                          yAxisId="sev"
                          orientation="right"
                          domain={[0, 5]}
                          ticks={[1, 2, 3, 4]}
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          label={{
                            value: "NETA Class",
                            angle: 90,
                            position: "insideRight",
                            fill: "#64748b",
                            fontSize: 11
                          }}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        <Line
                          yAxisId="temp"
                          type="monotone"
                          dataKey="hotspot"
                          name="Hotspot"
                          stroke="#f87171"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          yAxisId="temp"
                          type="monotone"
                          dataKey="reference"
                          name="Reference"
                          stroke="#34d399"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          yAxisId="temp"
                          type="monotone"
                          dataKey="deltaT"
                          name="ΔT"
                          stroke="#fbbf24"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          yAxisId="sev"
                          type="stepAfter"
                          dataKey="severityClass"
                          name="Severity Class"
                          stroke="#a78bfa"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ThermoChartFrame>

                  {hasThermographyData && (
                    <div className={`${CARD} mb-6 overflow-x-auto`}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                        Saved Thermography Analyses
                      </p>
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                            <th className="py-2 pr-3 font-bold">Date</th>
                            <th className="py-2 pr-3 font-bold">Health</th>
                            <th className="py-2 pr-3 font-bold">Fault</th>
                            <th className="py-2 pr-3 font-bold">Hotspot</th>
                            <th className="py-2 pr-3 font-bold">ΔT</th>
                            <th className="py-2 pr-3 font-bold">NETA</th>
                          </tr>
                        </thead>
                        <tbody>
                          {thermoAnalyses.map((r, idx) => {
                            const pt =
                              thermoChartSeries[thermoChartSeries.length - 1 - idx];
                            return (
                              <tr
                                key={r.id}
                                className="border-b border-slate-800/80 text-slate-300"
                              >
                                <td className="py-2 pr-3 whitespace-nowrap">
                                  {r.timestamp
                                    ? new Date(r.timestamp).toLocaleString()
                                    : r.created_at
                                      ? new Date(r.created_at).toLocaleString()
                                      : "—"}
                                </td>
                                <td className="py-2 pr-3 font-mono">
                                  {r.health_score ?? "—"}
                                </td>
                                <td className="py-2 pr-3">{r.primary_fault || "—"}</td>
                                <td className="py-2 pr-3 font-mono">
                                  {pt?.hotspot != null ? pt.hotspot : "—"}
                                </td>
                                <td className="py-2 pr-3 font-mono">
                                  {pt?.deltaT != null ? pt.deltaT : "—"}
                                </td>
                                <td className="py-2 pr-3">{pt?.severityLabel || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {/* TAB 2 — Phase Delta & I²R Load (standalone layout) */}
              {irMode === "phase" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        Hottest Phase
                      </p>
                      <p className="text-2xl font-bold text-red-400">
                        {phaseHottest
                          ? `Phase ${phaseHottest.phase}`
                          : "N/A"}
                      </p>
                      <p className="text-sm text-slate-400 mt-1 font-mono">
                        {phaseHottest != null ? `${phaseHottest.temp}°` : "—"}
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        Live Load vs Rated
                      </p>
                      <p className="text-2xl font-bold text-cyan-400">
                        {latestThermoChart?.loadPercent != null
                          ? `${latestThermoChart.loadPercent}%`
                          : "N/A"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {latestThermoChart?.currentAmps != null &&
                        latestThermoChart?.ratedAmps != null
                          ? `${latestThermoChart.currentAmps} A / ${latestThermoChart.ratedAmps} A rated`
                          : latestThermoChart?.loadPercent != null
                            ? "Load % from saved scan"
                            : "—"}
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        Normalized ΔT Projection
                      </p>
                      <p className="text-2xl font-bold text-yellow-400">
                        {latestThermoChart?.i2rNormalizedDelta != null
                          ? `${latestThermoChart.i2rNormalizedDelta}°`
                          : latestThermoChart?.i2rDelta != null
                            ? `${latestThermoChart.i2rDelta}°`
                            : "N/A"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        I²R-corrected rise @ 100% load
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        NFPA 70B Compliance
                      </p>
                      <span
                        className={`inline-flex mt-1 px-3 py-1.5 rounded-lg border text-sm font-bold ${phaseNfpaBadge.className}`}
                      >
                        {phaseNfpaBadge.label}
                      </span>
                      <p className="text-xs text-slate-500 mt-2">Severity class badge</p>
                    </div>
                  </div>

                  <ThermoChartFrame
                    title="Phase Delta & I²R Load — Phase A/B/C temperatures with ≥40% load validity band"
                    subtitle="Left: Temperature (°C) · Right: Load (%) · Green band = operational validity (≥40% load)"
                    overlay={
                      !hasThermographyData
                        ? "No thermography scans for this asset"
                        : !hasPhaseSeries
                          ? "No phase/load data in saved scans yet"
                          : null
                    }
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={thermoChartSeries} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          label={{
                            value: "Time",
                            position: "insideBottom",
                            offset: -2,
                            fill: "#64748b",
                            fontSize: 11
                          }}
                        />
                        <YAxis
                          yAxisId="temp"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          label={{
                            value: "Temperature (°C)",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#64748b",
                            fontSize: 11
                          }}
                        />
                        <YAxis
                          yAxisId="load"
                          orientation="right"
                          domain={[0, 100]}
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          label={{
                            value: "Load (%)",
                            angle: 90,
                            position: "insideRight",
                            fill: "#64748b",
                            fontSize: 11
                          }}
                        />
                        {/* Green ≥40% load validity band (NFPA operational zone) */}
                        {React.createElement(ReferenceArea as unknown as React.ComponentType<Record<string, unknown>>, {
                          yAxisId: "load",
                          y1: 40,
                          y2: 100,
                          fill: "#22c55e",
                          fillOpacity: 0.12,
                          strokeOpacity: 0
                        })}
                        <ReferenceLine
                          yAxisId="load"
                          y={40}
                          stroke="#22c55e"
                          strokeDasharray="4 4"
                          label={{
                            value: "≥40% load",
                            fill: "#4ade80",
                            fontSize: 10,
                            position: "insideTopRight"
                          }}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend verticalAlign="bottom" height={28} />
                        <Line
                          yAxisId="temp"
                          type="monotone"
                          dataKey="phaseA"
                          name="Phase A"
                          stroke="#ef4444"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          yAxisId="temp"
                          type="monotone"
                          dataKey="phaseB"
                          name="Phase B"
                          stroke="#f59e0b"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          yAxisId="temp"
                          type="monotone"
                          dataKey="phaseC"
                          name="Phase C"
                          stroke="#3b82f6"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          yAxisId="load"
                          type="stepAfter"
                          dataKey="loadPercent"
                          name="Load %"
                          stroke="#22d3ee"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ThermoChartFrame>
                </>
              )}

              {/* TAB 3 — Radiometric & Isotherm (standalone layout) */}
              {irMode === "radiometric" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        Emissivity Consistency Check
                      </p>
                      <p className="text-2xl font-bold text-purple-400 flex items-center gap-2">
                        {radioKpis.latest?.emissivity != null
                          ? `ε = ${radioKpis.latest.emissivity}`
                          : "N/A"}
                        {radioKpis.emissivityDrift && (
                          <AlertTriangle
                            className="h-5 w-5 text-amber-400 shrink-0"
                            aria-label="Emissivity changed vs baseline"
                          />
                        )}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {radioKpis.baselineEmissivity != null
                          ? radioKpis.emissivityDrift
                            ? `Changed vs baseline ε = ${radioKpis.baselineEmissivity}`
                            : `Matches baseline ε = ${radioKpis.baselineEmissivity}`
                          : "—"}
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        Palette Span Range
                      </p>
                      <p className="text-2xl font-bold text-cyan-400">
                        {radioKpis.paletteSpan != null
                          ? `Range: ${radioKpis.paletteSpan}°`
                          : "N/A"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 font-mono">
                        {radioKpis.latest?.scaleMin != null &&
                        radioKpis.latest?.scaleMax != null
                          ? `${radioKpis.latest.scaleMin}° → ${radioKpis.latest.scaleMax}°`
                          : "—"}
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        Isotherm Alarm Status
                      </p>
                      <p className="text-2xl font-bold text-orange-400">
                        {radioKpis.latest?.isothermThreshold != null
                          ? `Active: >${radioKpis.latest.isothermThreshold}°`
                          : "N/A"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {radioKpis.latest?.isothermThreshold != null
                          ? "Isotherm filter engaged"
                          : "—"}
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        ROI Statistical Mean
                      </p>
                      <p className="text-2xl font-bold text-green-400">
                        {radioKpis.latest?.boxAverage != null
                          ? `Box Avg: ${radioKpis.latest.boxAverage}°`
                          : "N/A"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {radioKpis.latest?.reflectedApparentTemp != null
                          ? `Reflected: ${radioKpis.latest.reflectedApparentTemp}°`
                          : "Baseline thermal creep tracking"}
                      </p>
                    </div>
                  </div>

                  <ThermoChartFrame
                    title="Radiometric & Isotherm — Calibration parameters over time (emissivity, scale, isotherm, box avg)"
                    subtitle="Left: temperatures (°C) · Right: emissivity (ε) · Detect operator ε drift between scans"
                    overlay={
                      !hasThermographyData
                        ? "No thermography scans for this asset"
                        : !hasRadiometricSeries
                          ? "No radiometric calibration fields in saved scans yet"
                          : null
                    }
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={thermoChartSeries} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          label={{
                            value: "Date",
                            position: "insideBottom",
                            offset: -2,
                            fill: "#64748b",
                            fontSize: 11
                          }}
                        />
                        <YAxis
                          yAxisId="temp"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          label={{
                            value: "Calibration Parameters (°C)",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#64748b",
                            fontSize: 11
                          }}
                        />
                        <YAxis
                          yAxisId="eps"
                          orientation="right"
                          domain={[0, 1]}
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          label={{
                            value: "Emissivity (ε)",
                            angle: 90,
                            position: "insideRight",
                            fill: "#64748b",
                            fontSize: 11
                          }}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend verticalAlign="bottom" height={28} />
                        <Line
                          yAxisId="temp"
                          type="monotone"
                          dataKey="boxAverage"
                          name="Box Average Temperature"
                          stroke="#22c55e"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          yAxisId="eps"
                          type="monotone"
                          dataKey="emissivity"
                          name="Emissivity setting"
                          stroke="#a78bfa"
                          strokeWidth={2.5}
                          strokeDasharray="6 4"
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          yAxisId="temp"
                          type="monotone"
                          dataKey="isothermThreshold"
                          name="Isotherm threshold"
                          stroke="#f97316"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          yAxisId="temp"
                          type="monotone"
                          dataKey="scaleMax"
                          name="Scale Max boundary"
                          stroke="#ef4444"
                          strokeWidth={2}
                          strokeDasharray="4 3"
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          yAxisId="temp"
                          type="monotone"
                          dataKey="scaleMin"
                          name="Scale Min boundary"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          strokeDasharray="4 3"
                          dot={{ r: 3 }}
                          connectNulls
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ThermoChartFrame>
                </>
              )}

              {/* TAB 4 — Mechanical & Refractory (standalone layout) */}
              {irMode === "mechanical" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        Bearing Housing Thermal Delta
                      </p>
                      <p className="text-sm font-semibold text-slate-300">
                        DE:{" "}
                        <span className="text-red-400 font-mono">
                          {mechKpis.latest?.deBearing != null
                            ? `${mechKpis.latest.deBearing}°`
                            : "—"}
                        </span>
                        <span className="text-slate-600 mx-1">·</span>
                        ODE:{" "}
                        <span className="text-blue-400 font-mono">
                          {mechKpis.latest?.odeBearing != null
                            ? `${mechKpis.latest.odeBearing}°`
                            : "—"}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 mt-2">
                        ΔT vs ambient:{" "}
                        {mechKpis.deDeltaAmbient != null ||
                        mechKpis.odeDeltaAmbient != null
                          ? `DE ${
                              mechKpis.deDeltaAmbient != null
                                ? `${mechKpis.deDeltaAmbient}°`
                                : "—"
                            } / ODE ${
                              mechKpis.odeDeltaAmbient != null
                                ? `${mechKpis.odeDeltaAmbient}°`
                                : "—"
                            }`
                          : "N/A"}
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        Refractory Insulation Integrity
                      </p>
                      <p className="text-2xl font-bold text-orange-400">
                        {mechKpis.latest?.refractorySkinTemp != null ||
                        mechKpis.latest?.skinTemp != null
                          ? `Skin: ${
                              mechKpis.latest?.refractorySkinTemp ??
                              mechKpis.latest?.skinTemp
                            }°`
                          : "N/A"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 font-mono">
                        {mechKpis.latest?.maxAllowable != null
                          ? `Max: ${mechKpis.latest.maxAllowable}°`
                          : "—"}
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        Frictional Anomaly Flag
                      </p>
                      {mechKpis.latest?.frictionalAnomaly ? (
                        <span className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-400 text-sm font-bold">
                          <AlertTriangle className="h-4 w-4" />
                          {mechKpis.latest.frictionalSeverity || "Anomaly"}
                        </span>
                      ) : (
                        <p className="text-2xl font-bold text-slate-400">
                          {mechKpis.latest?.frictionalSeverity || "N/A"}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 mt-2">
                        ISO 18434-1 mechanical friction class
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        Thermal Creep Velocity
                      </p>
                      <p className="text-2xl font-bold text-yellow-400">
                        {mechKpis.creepRatePerDay != null
                          ? `${mechKpis.creepRatePerDay}°/day`
                          : "N/A"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {mechKpis.creepAccelerating === true
                          ? "Accelerating — friction/binding may be rising"
                          : mechKpis.creepAccelerating === false
                            ? "Not accelerating vs prior interval"
                            : "—"}
                      </p>
                    </div>
                  </div>

                  <ThermoChartFrame
                    title="Mechanical & Refractory — Bearing housing and refractory skin temps vs ambient and limits"
                    subtitle="DE / ODE housing · refractory lagging · ambient reference · max allowable threshold"
                    overlay={
                      !hasThermographyData
                        ? "No thermography scans for this asset"
                        : !hasMechanicalSeries
                          ? "No mechanical or refractory thermal logs in saved scans yet"
                          : null
                    }
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={thermoChartSeries} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          label={{
                            value: "Date",
                            position: "insideBottom",
                            offset: -2,
                            fill: "#64748b",
                            fontSize: 11
                          }}
                        />
                        <YAxis
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          label={{
                            value: "Temperature (°C)",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#64748b",
                            fontSize: 11
                          }}
                        />
                        {mechKpis.latest?.maxAllowable != null && (
                          <ReferenceLine
                            y={mechKpis.latest.maxAllowable}
                            stroke="#ef4444"
                            strokeDasharray="6 4"
                            strokeWidth={2}
                            label={{
                              value: "Max Allowable Limit",
                              fill: "#ef4444",
                              fontSize: 10,
                              position: "insideTopRight"
                            }}
                          />
                        )}
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend verticalAlign="bottom" height={28} />
                        <Line
                          type="monotone"
                          dataKey="deBearing"
                          name="Drive-End (DE) Bearing Housing Temp"
                          stroke="#ef4444"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="odeBearing"
                          name="Opposite Drive-End (ODE) Bearing Housing Temp"
                          stroke="#3b82f6"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="refractorySkinTemp"
                          name="Refractory Lagging Skin Temp"
                          stroke="#f97316"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="ambientReferenceTemp"
                          name="Ambient Reference Temp"
                          stroke="#94a3b8"
                          strokeWidth={2}
                          strokeDasharray="6 4"
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="maxAllowable"
                          name="Max Allowable Limit"
                          stroke="#ef4444"
                          strokeWidth={1.5}
                          strokeDasharray="6 4"
                          dot={false}
                          connectNulls
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ThermoChartFrame>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ===== ULTRASOUND TECH CONTENT ===== */}
      {trendTech === "ultrasound" && (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
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

          {dbTrendLoading ? (
            <div className={`${CARD} mb-6 flex flex-col items-center justify-center text-center py-16 px-6`}>
              <p className="text-sm font-semibold text-slate-200">Loading ultrasound trends…</p>
            </div>
          ) : !hasUltrasoundData ? (
            <TechEmptyState technology="Ultrasound" />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                    Ultrasound KPI
                    <span className="ml-2 text-slate-600 normal-case tracking-normal">
                      · {UE_MODE_OPTIONS.find((m) => m.id === ueMode)?.label}
                    </span>
                  </p>
                  <ul className="space-y-2.5">
                    <li className="text-sm font-bold text-cyan-400">
                      Peak:{" "}
                      {uePeaksFromRow(latestUe!).peak != null
                        ? `${uePeaksFromRow(latestUe!).peak} dBµV`
                        : "—"}
                    </li>
                    <li className="text-sm font-semibold text-sky-400">
                      RMS:{" "}
                      {uePeaksFromRow(latestUe!).rms != null
                        ? `${uePeaksFromRow(latestUe!).rms} dBµV`
                        : "—"}
                    </li>
                    <li className="text-sm font-semibold text-yellow-400">
                      Δ:{" "}
                      {uePeaksFromRow(latestUe!).delta != null
                        ? `${uePeaksFromRow(latestUe!).delta} dB`
                        : "—"}
                    </li>
                    <li className="text-sm font-semibold text-white">
                      Fault: {latestUe?.primary_fault || "—"}
                    </li>
                    <li className="text-sm font-semibold text-slate-300">
                      Health: {latestUe?.health_score ?? "—"}
                    </li>
                  </ul>
                </div>
                <div className={`${CARD} md:col-span-2`}>
                  <p className="text-sm font-semibold text-white leading-relaxed">
                    {latestUe?.summary || latestUe?.primary_fault || "Ultrasound analysis saved."}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    {ueAnalyses.length} ultrasound run
                    {ueAnalyses.length === 1 ? "" : "s"} from PostgreSQL
                  </p>
                </div>
              </div>

              <div className={`${CARD} mb-6`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Health Trend
                </p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ueTrendSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          background: "#0f172a",
                          border: "1px solid #334155",
                          borderRadius: 8
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="health"
                        name="Health Score"
                        stroke="#38bdf8"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="peak"
                        name="Peak dBµV"
                        stroke="#fbbf24"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={`${CARD} mb-6 overflow-x-auto`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Saved Ultrasound Analyses
                </p>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                      <th className="py-2 pr-3 font-bold">Date</th>
                      <th className="py-2 pr-3 font-bold">Health</th>
                      <th className="py-2 pr-3 font-bold">Fault</th>
                      <th className="py-2 pr-3 font-bold">Peak</th>
                      <th className="py-2 pr-3 font-bold">RMS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ueAnalyses.map((r) => {
                      const up = uePeaksFromRow(r);
                      return (
                        <tr key={r.id} className="border-b border-slate-800/80 text-slate-300">
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {r.timestamp
                              ? new Date(r.timestamp).toLocaleString()
                              : r.created_at
                                ? new Date(r.created_at).toLocaleString()
                                : "—"}
                          </td>
                          <td className="py-2 pr-3 font-mono">{r.health_score ?? "—"}</td>
                          <td className="py-2 pr-3">{r.primary_fault || "—"}</td>
                          <td className="py-2 pr-3 font-mono">
                            {up.peak != null ? up.peak : "—"}
                          </td>
                          <td className="py-2 pr-3 font-mono">
                            {up.rms != null ? up.rms : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ===== MCA TECH CONTENT ===== */}
      {trendTech === "mca" && (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
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
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
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

          {dbTrendLoading ? (
            <div className={`${CARD} mb-6 flex flex-col items-center justify-center text-center py-16 px-6`}>
              <p className="text-sm font-semibold text-slate-200">Loading MCA trends…</p>
            </div>
          ) : !hasMcaData ? (
            <TechEmptyState technology="MCA" />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                    MCA KPI
                    <span className="ml-2 text-slate-600 normal-case tracking-normal">
                      · {MCA_MODE_OPTIONS.find((m) => m.id === mcaMode)?.label}
                    </span>
                  </p>
                  <ul className="space-y-2.5">
                    <li className="text-sm font-bold text-white">
                      Health: {latestMca?.health_score ?? "—"}
                    </li>
                    <li className="text-sm font-semibold text-yellow-500">
                      Fault: {latestMca?.primary_fault || "—"}
                    </li>
                    <li className="text-sm font-semibold text-slate-300">
                      Runs: {mcaAnalyses.length}
                    </li>
                  </ul>
                </div>
                <div className={`${CARD} md:col-span-2`}>
                  <p className="text-sm font-semibold text-white leading-relaxed">
                    {latestMca?.summary || latestMca?.primary_fault || "MCA analysis saved."}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    {mcaAnalyses.length} MCA run
                    {mcaAnalyses.length === 1 ? "" : "s"} from PostgreSQL
                  </p>
                </div>
              </div>

              <div className={`${CARD} mb-6`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Health Trend
                </p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mcaTrendSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          background: "#0f172a",
                          border: "1px solid #334155",
                          borderRadius: 8
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="health"
                        name="Health Score"
                        stroke="#eab308"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={`${CARD} mb-6 overflow-x-auto`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Saved MCA Analyses
                </p>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                      <th className="py-2 pr-3 font-bold">Date</th>
                      <th className="py-2 pr-3 font-bold">Health</th>
                      <th className="py-2 pr-3 font-bold">Fault</th>
                      <th className="py-2 pr-3 font-bold">Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mcaAnalyses.map((r) => (
                      <tr key={r.id} className="border-b border-slate-800/80 text-slate-300">
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {r.timestamp
                            ? new Date(r.timestamp).toLocaleString()
                            : r.created_at
                              ? new Date(r.created_at).toLocaleString()
                              : "—"}
                        </td>
                        <td className="py-2 pr-3 font-mono">{r.health_score ?? "—"}</td>
                        <td className="py-2 pr-3">{r.primary_fault || "—"}</td>
                        <td className="py-2 pr-3 text-slate-400 max-w-md truncate">
                          {r.summary || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

          {dbTrendLoading ? (
            <div className={`${CARD} mb-6 flex flex-col items-center justify-center text-center py-16 px-6`}>
              <p className="text-sm font-semibold text-slate-200">Loading oil analysis trends…</p>
            </div>
          ) : !hasOilData ? (
            <TechEmptyState technology="Oil Analysis" />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                    Oil Analysis KPI
                    <span className="ml-2 text-slate-600 normal-case tracking-normal">
                      · {OIL_MODE_OPTIONS.find((m) => m.id === oilMode)?.label}
                    </span>
                  </p>
                  <ul className="space-y-2.5">
                    <li className="text-sm font-bold text-white">
                      Health: {latestOil?.health_score ?? "—"}
                    </li>
                    <li className="text-sm font-semibold text-yellow-500">
                      Fault: {latestOil?.primary_fault || "—"}
                    </li>
                    <li className="text-sm font-semibold text-slate-300">
                      Runs: {oilAnalyses.length}
                    </li>
                  </ul>
                </div>
                <div className={`${CARD} md:col-span-2`}>
                  <p className="text-sm font-semibold text-white leading-relaxed">
                    {latestOil?.summary || latestOil?.primary_fault || "Oil analysis saved."}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    {oilAnalyses.length} oil analysis run
                    {oilAnalyses.length === 1 ? "" : "s"} from PostgreSQL
                  </p>
                </div>
              </div>

              <div className={`${CARD} mb-6`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Health Trend
                </p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={oilTrendSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          background: "#0f172a",
                          border: "1px solid #334155",
                          borderRadius: 8
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="health"
                        name="Health Score"
                        stroke="#a78bfa"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={`${CARD} mb-6 overflow-x-auto`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Saved Oil Analyses
                </p>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                      <th className="py-2 pr-3 font-bold">Date</th>
                      <th className="py-2 pr-3 font-bold">Health</th>
                      <th className="py-2 pr-3 font-bold">Fault</th>
                      <th className="py-2 pr-3 font-bold">Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {oilAnalyses.map((r) => (
                      <tr key={r.id} className="border-b border-slate-800/80 text-slate-300">
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {r.timestamp
                            ? new Date(r.timestamp).toLocaleString()
                            : r.created_at
                              ? new Date(r.created_at).toLocaleString()
                              : "—"}
                        </td>
                        <td className="py-2 pr-3 font-mono">{r.health_score ?? "—"}</td>
                        <td className="py-2 pr-3">{r.primary_fault || "—"}</td>
                        <td className="py-2 pr-3 text-slate-400 max-w-md truncate">
                          {r.summary || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
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
