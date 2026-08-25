import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity, AlertCircle, AlertTriangle, AudioWaveform, BarChart3, Bell, Bot, Check, CheckCircle2,
  ChevronDown, Clock, Database, Download, Droplet, Factory, FileText, Gauge, Image, Info, Keyboard,
  Layers, Loader2, Package, Radio, Tag, Thermometer, TrendingDown, Upload, Wrench, Zap, ZoomIn, ZoomOut
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
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
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useToast } from "./Toast";
import {
  BASE_COMPONENT_TYPES,
  emptySpecsFor,
  FieldDef,
  fieldsFor,
  getSpecTabs,
  SpecTabId
} from "./CreateComponentModal";
import { navigateToTab } from "../navigation";
import {
  getActiveDbSelection,
  getFlatEquipment,
  loadDemoData,
  type EquipComponent,
  type FlatEquipAsset
} from "../data/equipmentDb";
import {
  ANALYZE_VIBRATION_API_PATH,
  type ApiSeverity,
  type VibrationAnalysisResult
} from "../lib/consensusEngine";
import {
  applyTickDensityRoleCorrection,
  cropAllChartRegions,
  peakXPercent,
  peakYPercent,
  requestSpectrumRegionDetection,
  type ChartAxisRange,
  type ChartRegionDetectStatus,
  type ChartRegionKind,
  type CroppedChartRegions,
  type SpectrumChartPeak,
  type SpectrumRegionDetection
} from "../lib/spectrumChartRegions";
import {
  saveAnalysisResult,
  setAnalysisBaseline
} from "../lib/analysisPersistence";
import {
  extractVibrationDataFromImage,
  type ExtractedVibrationData
} from "../lib/vibration/vibrationImageExtractor";
import {
  SPECTRAL_EXTRACTION_FAILED_MSG,
  SPECTRAL_EXTRACTION_TIMEOUT_MSG,
  VISION_MODEL_CONFIG
} from "../lib/vibration/visionModelConfig";
import {
  classifyPipelineFailure,
  logPayloadSize,
  logPipelineFail,
  logPipelineSend,
  logPipelineStart,
  logPipelineSuccess,
  pipelineElapsedSec,
  pipelineErrorFields
} from "../lib/pipelineTrace";
import {
  buildVibrationDiagnosticRecord,
  cacheVibrationRecordLocally,
  VIBRATION_TREND_RECORD_TYPE,
  type VibrationDiagnosticRecord
} from "../lib/vibration/vibrationDiagnosticRecord";
import { normalizeWaveformMetrics } from "../lib/waveformMetrics";
import {
  ANALYZE_THERMOGRAPHY_API_PATH,
  extractRadiometricMetrics,
  mapThermographyToUiResult,
  normalizeThermographyResult,
  thermographyPeaksForSave,
  type ThermographyResult
} from "../lib/thermographyAnalysis";
import {
  ANALYZE_ULTRASOUND_API_PATH,
  mapUltrasoundToUiResult,
  normalizeUltrasoundResult,
  ultrasoundPeaksForSave,
  type UltrasoundResult
} from "../lib/ultrasoundAnalysis";
import VibrationInputAccordions, {
  type DriveConfig,
  type VibAccordionSection,
  type VibDataSource
} from "./VibrationInputAccordions";
import ThermographyInputAccordions, {
  type ThermographyTelemetrySnapshot
} from "./ThermographyInputAccordions";
import ThermographyResultsDashboard from "./ThermographyResultsDashboard";
import UltrasoundInputAccordions, {
  type UltrasoundInputSnapshot
} from "./UltrasoundInputAccordions";
import UltrasoundResultsDashboard from "./UltrasoundResultsDashboard";
import McaInputAccordions, {
  type McaOperatorSnapshot
} from "./McaInputAccordions";
import { calculateWindingBalance } from "../lib/mca/windingBalanceCalculator";
import { calculateGroundwallInsulation } from "../lib/mca/groundwallCalculator";
import {
  mcaPayloadForSave,
  mcaTripletHasData,
  normalizeMcaOperatorSnapshot
} from "../lib/mca/mcaPersistence";
import { mergeMcaOperatorSnapshots } from "../lib/mca/mcaSsot";
import McaResultsDashboard from "./McaResultsDashboard";
import OilInputAccordions from "./OilInputAccordions";
import OilResultsDashboard from "./OilResultsDashboard";
import CmmsPayloadBridge from "./diagnostics/CmmsPayloadBridge";
import DiagnosticsIntelligencePanel from "./diagnostics/DiagnosticsIntelligencePanel";
import { useDiagnosticsIntelligence } from "../lib/diagnostics/useDiagnosticsIntelligence";

/* ========================================================================== */
/* Props (keep App.tsx contract)                                              */
/* ========================================================================== */

interface DiagnoseProps {
  user?: any;
  onSaveReport?: (
    category: "Mechanical" | "Electrical" | "Hydraulic",
    symptoms: string,
    specs: Record<string, string>,
    data: any,
    fileName?: string,
    fileType?: string
  ) => void;
  targetContext?: {
    plantId: number | null;
    routeId: number | null;
    assetId: number | null;
    componentId: number | null;
    technologyType: string | null;
    quickAnalysisMode?: boolean;
    collectionPointId?: number | string | null;
  } | null;
  onClearTargetContext?: () => void;
  selectedCompanyId?: number;
  subscriptionPlan?: string;
  /** Optional: open Maintenance Calendar from the success modal Work Order action. */
  onNavigateToCalendar?: (assetLabel?: string) => void;
}

type Technology = "vibration" | "ir" | "ultrasound" | "mca" | "oil";
type DataSource = "upload" | "latest" | "realtime" | "manual";
type UnitMode = "velocity" | "acceleration" | "displacement";
type FreqRange = "0-500" | "0-1000" | "0-5000";
type Severity = "HIGH" | "MEDIUM" | "LOW";
type LoadCondition = "No Load" | "Partial Load" | "Full Load";
type AnalysisDepth = "quick" | "standard" | "deep";

interface DiagnoseAsset {
  id: string;
  label: string;
  tag: string;
  route: string;
  location: string;
  bearing: string;
  rpm: number;
  hp: number;
  voltage: string;
  oilType: string;
  components: string[];
  isoZone: string;
  manufacturer: string;
  componentType: string;
}

interface TechCard {
  id: Technology;
  title: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
}

interface UploadedFileMeta {
  name: string;
  preview?: string;
}

interface SpectrumPoint {
  hz: number;
  amp: number;
  baseline: number;
}

interface FaultAnnotation {
  id: string;
  hz: number;
  measuredHz: number;
  theoreticalHz: number;
  label: string;
  faultType: string;
  amplitude: number;
  isoZone: string;
  significance: string;
  color: string;
  width: number;
}

interface FaultFinding {
  id: string;
  severity: Severity;
  title: string;
  frequency: string;
  amplitude: string;
  confidence: number;
  detail: string;
}

async function blobUrlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to encode spectrum image."));
    reader.readAsDataURL(blob);
  });
}

/** Cropped analyzer panel with optional peak markers overlaid in plot space. */
function CroppedChartPanel({
  title,
  imageUrl,
  peaks,
  regionKind,
  axis,
  emptyHint,
  className = "h-64",
  onExpand
}: {
  title?: string;
  imageUrl: string;
  peaks: SpectrumChartPeak[];
  regionKind: ChartRegionKind;
  axis?: ChartAxisRange;
  emptyHint?: string;
  className?: string;
  onExpand?: () => void;
}) {
  const markers = peaks.filter(
    (p) => !p.chart || p.chart === regionKind
  );

  return (
    <button
      type="button"
      onClick={onExpand}
      className={`relative flex w-full items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-950 text-left ${className} ${
        onExpand ? "cursor-zoom-in hover:border-cyan-500/40 focus:outline-none focus:ring-1 focus:ring-cyan-500/50" : ""
      }`}
      title={onExpand ? "Click to expand" : title || "Cropped chart region"}
    >
      {title ? (
        <span className="sr-only">{title}</span>
      ) : null}
      <div className="relative inline-flex h-full max-h-full w-full max-w-full items-center justify-center">
        <img
          src={imageUrl}
          alt={title || "Cropped chart region"}
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
        {markers.map((p, i) => {
          const left = peakXPercent(p.frequencyHz, axis);
          const top =
            p.amplitude > 0
              ? peakYPercent(p.amplitude, axis)
              : 18;
          return (
            <div
              key={`${regionKind}-${p.frequencyHz}-${i}`}
              className="pointer-events-none absolute z-10"
              style={{ left: `${left}%`, top: `${top}%`, transform: "translate(-50%, -100%)" }}
              title={`${p.label || "Peak"} · ${p.frequencyHz} Hz · ${p.amplitude}`}
            >
              <div className="flex flex-col items-center">
                <span className="mb-0.5 max-w-[9rem] truncate rounded bg-red-950/90 px-1.5 py-0.5 text-[9px] font-semibold text-red-200 border border-red-500/40">
                  {p.label || `${p.frequencyHz} Hz`}
                </span>
                <span className="h-0 w-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-red-400" />
                <span className="mt-[-1px] h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]" />
              </div>
            </div>
          );
        })}
      </div>
      {markers.length === 0 && emptyHint ? (
        <span className="pointer-events-none absolute bottom-2 left-2 text-[10px] text-slate-500">
          {emptyHint}
        </span>
      ) : null}
      {onExpand ? (
        <span className="pointer-events-none absolute right-2 top-2 rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] text-slate-400 border border-slate-700">
          Expand
        </span>
      ) : null}
    </button>
  );
}

function CroppedChartExpandModal({
  title,
  imageUrl,
  peaks,
  regionKind,
  axis,
  onClose
}: {
  title: string;
  imageUrl: string;
  peaks: SpectrumChartPeak[];
  regionKind: ChartRegionKind;
  axis?: ChartAxisRange;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const markers = peaks.filter((p) => !p.chart || p.chart === regionKind);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <h3 className="text-sm font-bold text-white truncate">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="relative flex min-h-[50vh] flex-1 items-center justify-center bg-slate-950 p-4">
          <div className="relative inline-flex max-h-[75vh] max-w-full items-center justify-center">
            <img
              src={imageUrl}
              alt={title}
              className="max-h-[75vh] max-w-full object-contain"
              draggable={false}
            />
            {markers.map((p, i) => {
              const left = peakXPercent(p.frequencyHz, axis);
              const top =
                p.amplitude > 0 ? peakYPercent(p.amplitude, axis) : 18;
              return (
                <div
                  key={`modal-${regionKind}-${p.frequencyHz}-${i}`}
                  className="pointer-events-none absolute z-10"
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    transform: "translate(-50%, -100%)"
                  }}
                >
                  <div className="flex flex-col items-center">
                    <span className="mb-0.5 max-w-[12rem] truncate rounded bg-red-950/90 px-2 py-0.5 text-[11px] font-semibold text-red-200 border border-red-500/40">
                      {p.label || `${p.frequencyHz} Hz`}
                    </span>
                    <span className="h-0 w-0 border-l-[6px] border-r-[6px] border-t-[7px] border-l-transparent border-r-transparent border-t-red-400" />
                    <span className="mt-[-1px] h-3 w-3 rounded-full border-2 border-white bg-red-500" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function mapApiSeverityToUi(sev: ApiSeverity | string | undefined): Severity {
  if (sev === "CRITICAL") return "HIGH";
  if (sev === "ANOMALY") return "MEDIUM";
  return "LOW";
}

function isPlaceholderFaultTitle(title: string | undefined | null): boolean {
  const t = String(title || "").trim().toLowerCase();
  if (!t) return true;
  return /^(none|n\/?a|normal|no\s*faults?|none detected|no fault detected|healthy|ok|null|undefined|unresolved|continue monitoring)$/i.test(
    t
  );
}

function apiSeverityRank(sev: ApiSeverity | string | undefined): number {
  if (sev === "CRITICAL") return 3;
  if (sev === "ANOMALY") return 2;
  return 1;
}

function healthScoreForSeverity(sev: ApiSeverity): number {
  if (sev === "CRITICAL") return 32;
  if (sev === "ANOMALY") return 58;
  return 92;
}

type IdentifiedFault = VibrationAnalysisResult["identifiedFaults"][number];

function nearHz(hz: number, target: number, tol: number): boolean {
  return Number.isFinite(hz) && Number.isFinite(target) && Math.abs(hz - target) <= tol;
}

/**
 * Map Vision-extracted spectrum peaks into fault findings when the consensus
 * payload omits identifiedFaults (common when referee returns NORMAL/"None").
 */
function inferFaultsFromPeaks(
  peaks: SpectrumChartPeak[] | undefined,
  ratedRpm?: number
): IdentifiedFault[] {
  if (!peaks?.length) return [];

  const usable = peaks.filter(
    (p) => Number.isFinite(p.frequencyHz) && p.frequencyHz > 0
  );
  if (!usable.length) return [];

  const labeled1x = usable.find((p) =>
    /1\s*x|running\s*speed|shaft/i.test(String(p.label || ""))
  );
  const oneX =
    ratedRpm && ratedRpm > 0
      ? ratedRpm / 60
      : labeled1x?.frequencyHz ||
        usable.find((p) => p.frequencyHz >= 15 && p.frequencyHz <= 70)?.frequencyHz ||
        29.8;

  const byAmp = [...usable].sort(
    (a, b) => (b.amplitude || 0) - (a.amplitude || 0)
  );
  const faults: IdentifiedFault[] = [];
  const pushUnique = (fault: IdentifiedFault) => {
    const key = fault.title.toLowerCase();
    if (faults.some((f) => f.title.toLowerCase() === key)) return;
    faults.push(fault);
  };

  const bpfoPeak =
    usable.find((p) => /bpfo|outer\s*race/i.test(String(p.label || ""))) ||
    usable.find(
      (p) =>
        p.frequencyHz >= Math.max(80, oneX * 3.5) &&
        p.frequencyHz <= oneX * 12 &&
        !nearHz(p.frequencyHz, oneX, 2) &&
        !nearHz(p.frequencyHz, oneX * 2, 3)
    ) ||
    byAmp.find(
      (p) =>
        p.frequencyHz >= 100 &&
        p.frequencyHz <= 250 &&
        !nearHz(p.frequencyHz, oneX, 2) &&
        !nearHz(p.frequencyHz, oneX * 2, 3)
    );

  if (bpfoPeak) {
    pushUnique({
      title: "Outer Race Bearing Defect (BPFO)",
      frequencyHz: bpfoPeak.frequencyHz,
      confidencePercent: Math.min(
        96,
        Math.max(78, Math.round(70 + (bpfoPeak.amplitude || 0) * 3))
      ),
      severity: "CRITICAL",
      description:
        bpfoPeak.label
          ? `Vision peak "${bpfoPeak.label}" at ${bpfoPeak.frequencyHz} Hz matches outer-race bearing defect family.`
          : `Dominant non-synchronous peak at ${bpfoPeak.frequencyHz} Hz is consistent with BPFO (outer race defect).`
    });
  }

  const twoXPeak =
    usable.find((p) => /2\s*x|misalign/i.test(String(p.label || ""))) ||
    usable.find((p) => nearHz(p.frequencyHz, oneX * 2, Math.max(1.5, oneX * 0.08)));
  const oneXPeak =
    labeled1x ||
    usable.find((p) => nearHz(p.frequencyHz, oneX, Math.max(1.2, oneX * 0.06)));

  if (twoXPeak || (oneXPeak && (oneXPeak.amplitude || 0) > 0.5)) {
    pushUnique({
      title: "Angular Misalignment",
      frequencyHz: twoXPeak?.frequencyHz || oneXPeak?.frequencyHz || oneX * 2,
      confidencePercent: twoXPeak ? 87 : 78,
      severity: "ANOMALY",
      description:
        "Elevated 1X/2X running-speed peaks consistent with angular misalignment."
    });
  }

  if (oneXPeak) {
    pushUnique({
      title: "Unbalance",
      frequencyHz: oneXPeak.frequencyHz,
      confidencePercent: 81,
      severity: "ANOMALY",
      description:
        "Dominant 1X radial energy suggests residual unbalance. Verify coupling balance and rotor trim."
    });
  }

  const noiseLike = usable.find((p) =>
    /noise|floor|broadband|random/i.test(String(p.label || ""))
  );
  if (noiseLike || usable.length >= 3) {
    pushUnique({
      title: "Elevated Noise Floor",
      frequencyHz: noiseLike?.frequencyHz || 0,
      confidencePercent: 72,
      severity: "NORMAL",
      description:
        "Broadband / low-level spectral energy elevated — possible early lubrication variance or minor looseness."
    });
  }

  return faults;
}

/**
 * Keep banner, primary fault, health score, and identified-fault list consistent.
 * Prefer API faults; if missing, seed from primaryFault and/or Vision peaks.
 */
function reconcileAnalysisResult(
  raw: VibrationAnalysisResult,
  options?: { peaks?: SpectrumChartPeak[]; ratedRpm?: number }
): VibrationAnalysisResult {
  let identifiedFaults = (raw.identifiedFaults || []).filter(
    (f) => f && !isPlaceholderFaultTitle(f.title)
  );

  // Referee often returns a real primaryFault with an empty identifiedFaults[].
  if (
    identifiedFaults.length === 0 &&
    raw.primaryFault &&
    !isPlaceholderFaultTitle(raw.primaryFault.title)
  ) {
    identifiedFaults = [
      {
        title: raw.primaryFault.title,
        frequencyHz: Number(raw.primaryFault.frequencyHz) || 0,
        confidencePercent: Math.round(
          Number(raw.primaryFault.confidencePercent) || 80
        ),
        severity: (raw.primaryFault.severity as ApiSeverity) || "ANOMALY",
        description:
          raw.summary ||
          "Primary consensus finding elevated from empty identifiedFaults list."
      }
    ];
  }

  // Vision peaks are evidence — derive fault families when consensus omitted them.
  if (identifiedFaults.length === 0) {
    identifiedFaults = inferFaultsFromPeaks(options?.peaks, options?.ratedRpm);
  }

  let severity = String(raw.severity || "NORMAL").toUpperCase() as ApiSeverity;
  if (severity !== "NORMAL" && severity !== "ANOMALY" && severity !== "CRITICAL") {
    severity = "ANOMALY";
  }

  if (identifiedFaults.length > 0) {
    const worstFaultSev = identifiedFaults.reduce<ApiSeverity>((acc, f) => {
      const s = String(f.severity || "ANOMALY").toUpperCase() as ApiSeverity;
      const normalized =
        s === "CRITICAL" || s === "ANOMALY" || s === "NORMAL" ? s : "ANOMALY";
      return apiSeverityRank(normalized) > apiSeverityRank(acc) ? normalized : acc;
    }, "NORMAL");

    if (
      apiSeverityRank(worstFaultSev) > apiSeverityRank(severity) ||
      severity === "NORMAL"
    ) {
      severity = worstFaultSev === "NORMAL" ? "ANOMALY" : worstFaultSev;
    }
  } else {
    severity = "NORMAL";
  }

  let primaryFault = raw.primaryFault ? { ...raw.primaryFault } : undefined;
  const primaryIsPlaceholder = isPlaceholderFaultTitle(primaryFault?.title);

  if (identifiedFaults.length > 0 && primaryIsPlaceholder) {
    const top = [...identifiedFaults].sort((a, b) => {
      const bySev = apiSeverityRank(b.severity) - apiSeverityRank(a.severity);
      if (bySev !== 0) return bySev;
      return (b.confidencePercent || 0) - (a.confidencePercent || 0);
    })[0];
    primaryFault = {
      title: top.title,
      frequencyHz: Number(top.frequencyHz) || 0,
      confidencePercent: Math.round(Number(top.confidencePercent) || 0),
      severity: (top.severity as ApiSeverity) || severity,
      actionWindow:
        top.severity === "CRITICAL"
          ? "Immediate repair required within 7 days."
          : top.severity === "ANOMALY"
            ? "Schedule inspection within 14–30 days."
            : "Continue routine monitoring."
    };
  } else if (identifiedFaults.length === 0) {
    primaryFault = {
      title: "None Detected",
      frequencyHz: 0,
      confidencePercent: Math.max(Number(primaryFault?.confidencePercent) || 0, 90),
      severity: "NORMAL",
      actionWindow: "Continue routine monitoring."
    };
  } else if (primaryFault) {
    primaryFault.severity = (primaryFault.severity as ApiSeverity) || severity;
  }

  let overallHealthScore = Number(raw.overallHealthScore);
  if (!Number.isFinite(overallHealthScore)) {
    overallHealthScore = healthScoreForSeverity(severity);
  }
  if (
    identifiedFaults.length > 0 &&
    severity !== "NORMAL" &&
    overallHealthScore > 75
  ) {
    overallHealthScore = healthScoreForSeverity(severity);
  }
  if (
    severity === "NORMAL" &&
    identifiedFaults.length === 0 &&
    overallHealthScore < 80
  ) {
    overallHealthScore = healthScoreForSeverity("NORMAL");
  }

  let summary = String(raw.summary || "").trim();
  if (identifiedFaults.length > 0) {
    if (
      !summary ||
      /normal operation|continue monitoring|no fault|healthy|none detected/i.test(
        summary
      )
    ) {
      summary = `Consensus analysis: ${primaryFault?.title} at ${
        primaryFault?.frequencyHz || "—"
      } Hz (${severity}). ${identifiedFaults.length} fault signature(s) identified.`;
    }
  } else if (
    !summary ||
    /critical|anomaly|defect|bpfo|misalign|unbalance|fault/i.test(summary)
  ) {
    summary =
      "No actionable fault signatures identified. Continue routine monitoring.";
  }

  const { financialImpact, repairRecommendations } = computeFinancialImpactFromFault(
    primaryFault?.title
  );

  return {
    ...raw,
    severity,
    overallHealthScore: Math.max(0, Math.min(100, Math.round(overallHealthScore))),
    primaryFault: primaryFault!,
    identifiedFaults,
    summary,
    financialImpact,
    repairRecommendations
  };
}

function formatUsd(n: number | undefined): string {
  const value = Number.isFinite(n as number) ? Number(n) : 0;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

type FaultCostProfile = {
  kind:
    | "misalignment"
    | "unbalance"
    | "bearing"
    | "looseness"
    | "loose_connection"
    | "overheating"
    | "none"
    | "generic";
  preventiveRepairCost: number;
  repairHours: number;
  repairRecommendations: string[];
};

const DOWNTIME_RATE_PER_HOUR = 5000;
const REACTIVE_MAINTENANCE_MULTIPLIER = 5;

function classifyFaultForCosting(primaryFaultTitle: string | undefined | null): FaultCostProfile {
  const title = String(primaryFaultTitle || "").trim();
  if (!title || isPlaceholderFaultTitle(title) || /none detected|normal|healthy|no fault/i.test(title)) {
    return {
      kind: "none",
      preventiveRepairCost: 0,
      repairHours: 0,
      repairRecommendations: [
        "Continue routine condition monitoring on the current route interval.",
        "Archive this spectrum as a baseline for future comparison.",
        "Re-run analysis if noise, temperature, or load conditions change."
      ]
    };
  }

  // Thermal / IR faults — check before mechanical "looseness" (Loose Connection ≠ mechanical looseness)
  if (
    /loose\s*connection|high[\s-]*resistance|contact\s*resistance|lug|bus\s*bar|terminal|stab/i.test(
      title
    )
  ) {
    return {
      kind: "loose_connection",
      preventiveRepairCost: 750,
      repairHours: 3,
      repairRecommendations: [
        "De-energize and follow LOTO / NFPA 70E arc-flash PPE before opening the enclosure.",
        "Inspect the hot phase lug/bus joint for discoloration, pitting, or oxide.",
        "Clean mating surfaces and apply OEM-approved anti-oxidant compound.",
        "Retorque the connection to manufacturer specifications; replace damaged hardware.",
        "Re-energize under load and re-scan within 24 hours to verify ΔT is within NFPA 70B limits."
      ]
    };
  }

  if (
    /overheat|hot\s*spot|hotspot|thermal\s*anomal|elevated\s*temp|heat\s*rise|Δt|delta[\s-]*t/i.test(
      title
    )
  ) {
    return {
      kind: "overheating",
      preventiveRepairCost: 1200,
      repairHours: 4,
      repairRecommendations: [
        "Confirm load current vs nameplate and normalize ΔT to 100% load per NFPA 70B.",
        "Identify the heat source (connection, winding, bearing housing, or enclosure).",
        "Correct the root cause (retorque, cooling path, insulation, or lubrication as applicable).",
        "Verify emissivity and reflected-temperature settings before the verification scan.",
        "Document as-found / as-left radiometric images and close the CMMS work order."
      ]
    };
  }

  if (/misalign|angular|offset|soft\s*foot|coupling\s*align/i.test(title)) {
    return {
      kind: "misalignment",
      preventiveRepairCost: 800,
      repairHours: 4,
      repairRecommendations: [
        "Lock out / tag out the machine and verify zero energy before mechanical work.",
        "Inspect soft foot, baseplate flatness, and coupling condition.",
        "Perform precision laser shaft alignment targeting angular misalignment correction.",
        "Install or adjust shims per the alignment report; re-check soft foot.",
        "Run the machine and confirm 1X/2X vibration reduction vs this baseline."
      ]
    };
  }

  if (/unbalance|imbalance|1x\b|rotor\s*balance|fan\s*balance/i.test(title)) {
    return {
      kind: "unbalance",
      preventiveRepairCost: 600,
      repairHours: 3,
      repairRecommendations: [
        "Inspect the rotor/fan for missing balance weights, buildup, or damaged blades.",
        "Clean the rotating assembly and remove any process debris.",
        "Perform single- or two-plane field balancing at operating speed.",
        "Verify 1X amplitude is below alarm limits after balance correction.",
        "Document trial weights and final correction in the CMMS work order."
      ]
    };
  }

  if (/bearing|bpfo|bpfi|bsf|ftf|race|spall|outer\s*race|inner\s*race/i.test(title)) {
    return {
      kind: "bearing",
      preventiveRepairCost: 2500,
      repairHours: 8,
      repairRecommendations: [
        "Allocate the correct replacement bearing from inventory (match DE/NDE OEM spec).",
        "Schedule planned downtime and complete lock out / tag out before disassembly.",
        "Remove the defective bearing; inspect shaft/housing fits and lubrication condition.",
        "Install the new bearing per OEM procedure with correct clearance and grease fill.",
        "Verify soft foot and holding-down bolts, then remount and remeasure BPFO/BPFI."
      ]
    };
  }

  if (/loose|looseness|bolt|mount|structural\s*resonance|mechanical\s*looseness/i.test(title)) {
    return {
      kind: "looseness",
      preventiveRepairCost: 500,
      repairHours: 2,
      repairRecommendations: [
        "Inspect foundation bolts, bearing housings, and foot mounts for play or missing hardware.",
        "Torque all fasteners to OEM specification; replace stretched or damaged bolts.",
        "Check for cracked feet, worn fits, or damaged dowels that allow movement.",
        "Re-run vibration at 1X and harmonics to confirm looseness signatures are gone.",
        "Update the CMMS with torque values and any hardware replaced."
      ]
    };
  }

  return {
    kind: "generic",
    preventiveRepairCost: 1000,
    repairHours: 4,
    repairRecommendations: [
      `Investigate primary finding: ${title}.`,
      "Plan a controlled outage and verify machine isolation (LOTO) before corrective work.",
      "Correct the root cause identified in the consensus analysis, then remount sensors securely.",
      "Remeasure vibration post-repair and compare against this diagnostic baseline.",
      "Close the work order with as-found / as-left amplitudes and photos."
    ]
  };
}

function computeFinancialImpactFromFault(primaryFaultTitle: string | undefined | null): {
  financialImpact: {
    preventiveRepairCost: number;
    failureCostIfDelayed: number;
    downtimeLossPerHour: number;
  };
  repairRecommendations: string[];
  estimatedRepairHours: number;
} {
  const profile = classifyFaultForCosting(primaryFaultTitle);
  const preventiveRepairCost = profile.preventiveRepairCost;
  const failureCostIfDelayed = preventiveRepairCost * REACTIVE_MAINTENANCE_MULTIPLIER;
  // Stored total downtime loss ($5,000/hr × repair hours) — displayed as Downtime Loss
  const downtimeLossPerHour = DOWNTIME_RATE_PER_HOUR * profile.repairHours;
  return {
    financialImpact: {
      preventiveRepairCost,
      failureCostIfDelayed,
      downtimeLossPerHour
    },
    repairRecommendations: profile.repairRecommendations,
    estimatedRepairHours: profile.repairHours
  };
}

/**
 * Legacy local thermography builder removed — use POST /api/analyze-thermography
 * via mapThermographyToUiResult (src/lib/thermographyAnalysis.ts).
 */

function severityBannerCopy(sev: ApiSeverity | string | undefined): {
  title: string;
  wrap: string;
  icon: string;
} {
  if (sev === "CRITICAL") {
    return {
      title: "Critical Fault / Immediate Repair Required",
      wrap: "border-red-500/50 bg-gradient-to-r from-red-950/80 via-red-900/40 to-red-950/60 text-red-100 shadow-[0_0_28px_rgba(239,68,68,0.18)]",
      icon: "text-red-300"
    };
  }
  if (sev === "ANOMALY") {
    return {
      title: "Anomaly Detected — Schedule Inspection",
      wrap: "border-amber-500/50 bg-gradient-to-r from-amber-950/80 via-amber-900/40 to-amber-950/60 text-amber-100 shadow-[0_0_28px_rgba(245,158,11,0.16)]",
      icon: "text-amber-300"
    };
  }
  return {
    title: "Normal Operation — Continue Monitoring",
    wrap: "border-emerald-500/40 bg-gradient-to-r from-emerald-950/70 via-emerald-900/30 to-emerald-950/50 text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.12)]",
    icon: "text-emerald-300"
  };
}

/* ========================================================================== */
/* Mock diagnostic case — Boiler Feed Pump A / Motor DE                       */
/* ========================================================================== */

const TECH_CARDS: TechCard[] = [
  {
    id: "vibration",
    title: "Vibration Analysis",
    description: "FFT spectrum, waveform, bearing analysis",
    Icon: Activity,
    iconClass: "bg-yellow-500/15 border-yellow-500/40 text-yellow-400"
  },
  {
    id: "ir",
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
];

/** Labels use "Name - Tag" so Analysis Reports / Calendar can parse ?asset= */
const EMPTY_DIAGNOSE_ASSET: DiagnoseAsset = {
  id: "",
  label: "—",
  tag: "",
  route: "",
  location: "",
  bearing: "SKF 6320 C3",
  rpm: 1780,
  hp: 100,
  voltage: "460V",
  oilType: "ISO VG 68",
  components: [],
  isoZone: "Zone B",
  manufacturer: "",
  componentType: "Pump"
};

function inferComponentType(asset: FlatEquipAsset): string {
  const hay = `${asset.name} ${asset.tag}`.toLowerCase();
  if (hay.includes("gear") || hay.includes("gb-")) return "Gearbox";
  if (hay.includes("fan") || hay.includes("blower") || hay.includes("fn-")) return "Fan/Blower";
  if (hay.includes("compress") || hay.includes("c-20") || hay.includes("cmp-")) return "Compressor";
  if (hay.includes("motor") || hay.includes("m-")) return "Electric Motor";
  if (hay.includes("pump") || hay.includes("p-")) return "Pump";
  return "Pump";
}

function parseHpFromKin(motorHpKw?: string): number {
  if (!motorHpKw) return 100;
  const m = motorHpKw.match(/([\d.]+)/);
  return m ? Number(m[1]) || 100 : 100;
}

function formatVoltage(v?: string): string {
  if (!v || !v.trim()) return "460V";
  const t = v.trim();
  return /v/i.test(t) ? t : `${t}V`;
}

function lookupStoreComponent(
  asset: DiagnoseAsset | FlatEquipAsset,
  componentName: string
): EquipComponent | undefined {
  const tag = "tag" in asset ? asset.tag : "";
  const id = asset.id;
  const flat =
    getFlatEquipment().find((a) => a.id === id) ||
    getFlatEquipment().find((a) => a.tag === tag);
  return flat?.components.find((c) => c.name === componentName);
}

function flatToDiagnoseAsset(asset: FlatEquipAsset): DiagnoseAsset {
  const comps = asset.components.map((c) => c.name).filter(Boolean);
  const primary = asset.components[0];
  const kin = primary?.kinematics;
  return {
    id: asset.id,
    label: `${asset.name} - ${asset.tag}`,
    tag: asset.tag,
    route: asset.routeName,
    location: asset.location,
    bearing:
      kin?.bearingDe ||
      asset.bearingType ||
      primary?.bearingType ||
      "SKF 6320 C3",
    rpm: Number(kin?.ratedRpm) || asset.speedRpm || primary?.speedRpm || 1780,
    hp: parseHpFromKin(kin?.motorHpKw),
    voltage: formatVoltage(kin?.voltage),
    oilType: "ISO VG 68",
    components: comps.length > 0 ? comps : ["Motor DE"],
    isoZone: "Zone B",
    manufacturer: "—",
    componentType: inferComponentType(asset)
  };
}

const SYMPTOM_TAGS = [
  "Unusual noise",
  "Excessive vibration",
  "Overheating",
  "Oil leak",
  "Loose components",
  "Intermittent operation"
] as const;

const LOAD_OPTIONS: LoadCondition[] = ["No Load", "Partial Load", "Full Load"];

const MEASUREMENT_LOCATIONS = [
  "Motor DE",
  "Motor NDE",
  "Pump DE",
  "Pump NDE",
  "Gearbox Input",
  "Gearbox Output",
  "Fan DE",
  "Fan NDE",
  "Coupling"
] as const;

const CRITICALITY_OPTIONS = ["Critical", "Essential", "General/Non-Critical"] as const;

const ACQ_FREQ_OPTIONS = ["0-1,000 Hz", "0-10,000 Hz", "0-50,000 Hz"] as const;
const ACQ_UNIT_OPTIONS = ["Velocity mm/s", "Acceleration g", "Displacement mils"] as const;

const MOUNTING_METHODS = ["Stud Mount", "Magnetic Base", "Handheld Probe"] as const;

const ULTRASOUND_FREQ_OPTIONS = ["20 kHz", "30 kHz", "40 kHz", "60 kHz", "100 kHz"] as const;
const ULTRASOUND_MEAS_TYPES = ["dBuV", "RMS", "Peak", "Time Waveform"] as const;
const MCA_VOLTAGE_OPTIONS = ["230V", "380V", "460V", "575V", "4160V"] as const;
const OIL_VG_OPTIONS = ["ISO VG 32", "ISO VG 46", "ISO VG 68", "ISO VG 100", "ISO VG 150", "ISO VG 220", "ISO VG 320"] as const;

const TECH_PARAM_HINTS: Record<Technology, string> = {
  vibration: "Vibration — load, sensor, frequency & operating speed",
  ir: "Thermography — emissivity, distance, humidity & atmosphere",
  ultrasound: "Ultrasound — frequency, gain & measurement type",
  mca: "MCA — voltage, HP, resistance & insulation",
  oil: "Oil Analysis — viscosity, water, TAN & particle count"
};

const MACHINE_MOUNTING_TYPES = ["Foot-mounted", "Flange-mounted", "Baseplate"] as const;
const COUPLING_TYPES = ["Flexible", "Rigid", "Gear", "Universal Joint"] as const;
const DRIVE_TYPES = ["Direct Drive", "Belt Drive", "Gear Drive"] as const;

const MAINTENANCE_TAGS = [
  "Alignment",
  "Lubrication",
  "Balance",
  "Component Replacement"
] as const;

const ANALYSIS_DEPTH_OPTIONS: { id: AnalysisDepth; label: string; description: string; recommended?: boolean }[] = [
  {
    id: "quick",
    label: "Quick Scan",
    description: "Rapid assessment, basic fault detection"
  },
  {
    id: "standard",
    label: "Standard Diagnostic",
    description: "Full spectrum & bearing analysis",
    recommended: true
  },
  {
    id: "deep",
    label: "Deep Forensic Analysis",
    description: "Advanced waveform, phase, envelope analysis"
  }
];

/** IR / thermography-specific Analysis Mode copy (ISO 18436-7 / NFPA 70B) */
const IR_ANALYSIS_DEPTH_OPTIONS: { id: AnalysisDepth; label: string; description: string; recommended?: boolean }[] = [
  {
    id: "quick",
    label: "Quick Scan",
    description: "Rapid delta-T verification, automatic hot-spot classification."
  },
  {
    id: "standard",
    label: "Standard Diagnostic",
    description:
      "Complete component phase-to-phase thermal balance assessment and NFPA 70B compliance validation.",
    recommended: true
  },
  {
    id: "deep",
    label: "Deep Forensic Analysis",
    description:
      "Advanced multi-pixel emissivity correction matrices and historic thermal trend tracking."
  }
];

/** Ultrasound-specific Analysis Mode copy (UE Systems / SDT) */
const UE_ANALYSIS_DEPTH_OPTIONS: { id: AnalysisDepth; label: string; description: string; recommended?: boolean }[] = [
  {
    id: "quick",
    label: "Quick Scan",
    description: "Rapid dBµV trending and basic anomaly classification"
  },
  {
    id: "standard",
    label: "Standard Diagnostic",
    description:
      "Decibel trending, tracking anomaly classifications, and flow rate estimation formulas",
    recommended: true
  },
  {
    id: "deep",
    label: "Deep Forensic Analysis",
    description:
      "Advanced heterodyne frequency analysis and bearing lubrication state detection"
  }
];

/** MCA-specific Analysis Mode copy (IEEE 43 / NETA) */
const MCA_ANALYSIS_DEPTH_OPTIONS: { id: AnalysisDepth; label: string; description: string; recommended?: boolean }[] = [
  {
    id: "quick",
    label: "Quick Scan",
    description: "Rapid TVS / resistance balance check and insulation spot-test."
  },
  {
    id: "standard",
    label: "Standard Diagnostic",
    description:
      "Full phase-to-phase impedance balance, I/F ratio, and IEEE 43 insulation assessment.",
    recommended: true
  },
  {
    id: "deep",
    label: "Deep Forensic Analysis",
    description:
      "Advanced turn-to-turn impedance imbalance matrices, polarization index progression, and phase vector isolation."
  }
];

const OIL_ANALYSIS_DEPTH_OPTIONS: {
  id: AnalysisDepth;
  label: string;
  description: string;
  recommended?: boolean;
}[] = [
  {
    id: "quick",
    label: "Quick Scan",
    description:
      "Rapid spectroscopy verification, elemental trend tracking, and contaminant validation."
  },
  {
    id: "standard",
    label: "Standard Diagnostic",
    description:
      "Complete physical/chemical degradation tracking, ISO particle contamination analysis, and wear debris classification.",
    recommended: true
  },
  {
    id: "deep",
    label: "Deep Forensic Analysis",
    description:
      "Advanced multi-element analytical ferrography, varnish potential assessment, and remaining useful life (RULER) predictions."
  }
];

function processParamLabelFor(componentType: string): string {
  const t = componentType.toLowerCase();
  if (t.includes("pump")) return "Flow Rate (GPM)";
  if (t.includes("compress")) return "Discharge Pressure (PSI)";
  if (t.includes("fan") || t.includes("blower")) return "Airflow (CFM)";
  if (t.includes("motor")) return "Current Draw (A)";
  if (t.includes("gear")) return "Output Torque (ft-lb)";
  return "Process Parameter";
}

const DATA_SOURCE_CARDS: {
  id: DataSource;
  title: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  badge?: string;
}[] = [
  {
    id: "upload",
    title: "Upload Raw Data",
    description: "Upload .csv, .wav, or image",
    Icon: Upload,
    iconClass: "bg-yellow-500/15 border-yellow-500/40 text-yellow-400"
  },
  {
    id: "latest",
    title: "Use Latest Reading",
    description: "Load most recent measurement",
    Icon: Database,
    iconClass: "bg-emerald-500/15 border-emerald-500/40 text-emerald-400",
    badge: "Recommended"
  },
  {
    id: "realtime",
    title: "Real-Time Monitoring",
    description: "Connect to live sensor",
    Icon: Radio,
    iconClass: "bg-cyan-500/15 border-cyan-500/40 text-cyan-400"
  },
  {
    id: "manual",
    title: "Manual Entry",
    description: "Enter readings manually",
    Icon: Keyboard,
    iconClass: "bg-sky-500/15 border-sky-500/40 text-sky-400"
  }
];

const ANALYSIS_STEPS = [
  "Acquiring vibration data...",
  "Performing FFT spectrum analysis...",
  "Identifying fault frequencies...",
  "Calculating bearing defect signatures...",
  "Generating diagnostic report..."
];

const AI_LOADING_MESSAGES = [
  "Uploading diagnostic image...",
  "Calibrating X/Y axes scales...",
  "Deep scanning spectral peaks...",
  "Extracting frequency coordinates...",
  "Synthesizing consensus analysis...",
  "Finalizing diagnostic report..."
];

const AI_FETCH_TIMEOUT_MS = 60_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = AI_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(
      `❌ [PIPELINE] Client AbortController firing after ${timeoutMs}ms for ${url}`
    );
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    const aborted =
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError");
    if (aborted) {
      const timeoutErr = new Error(SPECTRAL_EXTRACTION_TIMEOUT_MSG);
      timeoutErr.name = "AbortError";
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

const HEALTH_SCORE_TARGET = 38;
/** Flip on when building fault list / recommendations in a later pass */
const SHOW_EXTENDED_RESULTS = false;
const BPFO_BAND = { x1: 145, x2: 160, hz: 152 };

const ANNOTATIONS: FaultAnnotation[] = [
  {
    id: "bpfo",
    hz: 152,
    measuredHz: 152.3,
    theoreticalHz: 151.8,
    label: "152 Hz - BPFO (Outer Race)",
    faultType: "Ball Pass Frequency Outer Race",
    amplitude: 4.2,
    isoZone: "ISO Zone C",
    significance: "Indicates outer race spalling",
    color: "#ef4444",
    width: 8
  },
  {
    id: "1x",
    hz: 29.8,
    measuredHz: 29.8,
    theoreticalHz: 29.67,
    label: "1X Running Speed — Slight Misalignment",
    faultType: "1× Running Speed",
    amplitude: 1.8,
    isoZone: "ISO Zone B",
    significance: "Minor shaft misalignment contribution",
    color: "#f59e0b",
    width: 6
  },
  {
    id: "bpfo-2x",
    hz: 304,
    measuredHz: 304.1,
    theoreticalHz: 303.6,
    label: "2× BPFO Harmonic",
    faultType: "BPFO 2nd Harmonic",
    amplitude: 1.1,
    isoZone: "ISO Zone B",
    significance: "Confirms outer race defect family",
    color: "#f87171",
    width: 5
  }
];

const FAULTS: FaultFinding[] = [
  {
    id: "f1",
    severity: "HIGH",
    title: "Outer Race Bearing Defect (BPFO)",
    frequency: "152 Hz",
    amplitude: "4.2 mm/s",
    confidence: 94,
    detail:
      "Bearing outer race defect signature with matching harmonic family — schedule DE bearing replacement."
  },
  {
    id: "f2",
    severity: "MEDIUM",
    title: "Angular Misalignment",
    frequency: "29.8 Hz (1X / 2X)",
    amplitude: "1.8 mm/s",
    confidence: 87,
    detail:
      "Elevated 1X/2X running-speed peaks with cross-channel phase shift consistent with angular misalignment."
  },
  {
    id: "f3",
    severity: "MEDIUM",
    title: "Unbalance",
    frequency: "29.7 Hz (1X RPM)",
    amplitude: "1.4 mm/s",
    confidence: 81,
    detail:
      "Dominant 1X radial energy suggests residual unbalance. Verify coupling balance and impeller/fan trim."
  },
  {
    id: "f4",
    severity: "LOW",
    title: "Elevated Noise Floor",
    frequency: "Broadband",
    amplitude: "0.5 mm/s floor",
    confidence: 72,
    detail:
      "Slight increase in broadband noise. Possible early lubrication variance or minor looseness."
  }
];

const TREND_30D = [
  { day: "D-30", amp: 0.6 },
  { day: "D-24", amp: 0.8 },
  { day: "D-18", amp: 1.1 },
  { day: "D-14", amp: 1.6 },
  { day: "D-10", amp: 2.2 },
  { day: "D-7", amp: 2.9 },
  { day: "D-4", amp: 3.5 },
  { day: "D-2", amp: 3.9 },
  { day: "Today", amp: 4.2 }
];

const IMMEDIATE_ACTIONS = [
  "Allocate replacement bearing from inventory.",
  "Schedule downtime within 7-14 days.",
  "Check holding-down bolts for soft foot condition before installing new bearing.",
  "Perform precision field balance in Plane 1 if 1X peak persists."
];

/** Deep-dive FFT mock — ~100 pts, BPFO spike @ index 15 (~152 Hz), 2X @ index 30 */
const DEEP_FFT_DATA = Array.from({ length: 100 }, (_, i) => {
  let measured = 0.35 + (i % 7) * 0.02 + Math.sin(i / 5) * 0.08;
  const baseline = 0.42 + Math.sin(i / 9) * 0.04;
  if (i === 15) measured = 9.5;
  else if (i === 14 || i === 16) measured = 3.4;
  else if (i === 30) measured = 2.9;
  else if (i === 29 || i === 31) measured = 1.15;
  return { hz: i * 10, measured: Math.round(measured * 100) / 100, baseline: Math.round(baseline * 100) / 100 };
});

/** High-freq / envelope view — 0–5 kHz mock (BPFO family + HF energy) */
const DEEP_FFT_DATA_HF = Array.from({ length: 51 }, (_, i) => {
  const hz = i * 100;
  let measured = 0.25 + (i % 6) * 0.015 + Math.sin(i / 4) * 0.06;
  const baseline = 0.3 + Math.sin(i / 8) * 0.03;
  if (hz === 200) measured = 4.8;
  else if (hz === 1500) measured = 6.2;
  else if (hz === 1400 || hz === 1600) measured = 2.1;
  else if (hz === 3000) measured = 3.4;
  return { hz, measured: Math.round(measured * 100) / 100, baseline: Math.round(baseline * 100) / 100 };
});

/** Time waveform — noisy sine */
const TWF_DATA = Array.from({ length: 80 }, (_, i) => {
  let amp =
    Math.sin(i / 2.8) * 5.5 +
    Math.sin(i * 1.9) * 2.2 +
    Math.sin(i * 0.4) * 1.1 +
    ((i * 17) % 10) / 10 -
    0.5;
  // Main impact peak — synced cursor target (index 15)
  if (i === 15) amp = 12.4;
  else if (i === 14 || i === 16) amp = Math.max(amp, 7.2);
  return { t: i, amp: Math.round(amp * 100) / 100 };
});

/** Demodulated / enveloped spectrum — flat with sharp mid spike (scaled for 0–4 gE axis) */
const ENVELOPE_DATA = Array.from({ length: 60 }, (_, i) => {
  const mid = 30;
  const dist = Math.abs(i - mid);
  const amp = dist === 0 ? 3.2 : dist === 1 ? 1.5 : dist === 2 ? 0.55 : 0.12 + (i % 5) * 0.01;
  return { hz: i * 5, amp: Math.round(amp * 100) / 100 };
});

function buildSpectrum(maxHz: number): SpectrumPoint[] {
  const peaks = [
    { f: 29.8, a: 1.8, w: 4 },
    { f: 59.6, a: 0.9, w: 4 },
    { f: 89.4, a: 0.28, w: 5 },
    { f: 152, a: 4.2, w: 2.2 }, // Primary BPFO — sharp, unmistakable
    { f: 304, a: 1.1, w: 4 },
    { f: 456, a: 0.4, w: 6 }
  ];

  // Dense base grid (~100 pts) + extra samples around fault peaks
  const hzSet = new Set<number>();
  const step = maxHz <= 500 ? 5 : maxHz <= 1000 ? 10 : 25;
  for (let hz = 0; hz <= maxHz; hz += step) hzSet.add(hz);
  for (const p of peaks) {
    if (p.f > maxHz) continue;
    for (let d = -8; d <= 8; d += 1) {
      const hz = Math.round((p.f + d) * 10) / 10;
      if (hz >= 0 && hz <= maxHz) hzSet.add(hz);
    }
  }

  const points: SpectrumPoint[] = Array.from(hzSet)
    .sort((a, b) => a - b)
    .map((hz) => {
      let amp = 0.2 + Math.sin(hz * 0.09) * 0.05 + Math.sin(hz * 0.31) * 0.025;
      let baseline = 0.15 + Math.sin(hz * 0.05) * 0.015;
      for (const p of peaks) {
        const d = Math.abs(hz - p.f);
        amp += p.a * Math.exp(-(d * d) / (p.w * p.w));
      }
      return {
        hz,
        amp: Math.max(0.1, Math.min(9.5, Math.round(amp * 1000) / 1000)),
        baseline: Math.max(0.12, Math.round(baseline * 1000) / 1000)
      };
    });

  // Lock exact demo peaks
  const lock = (f: number, a: number, b: number) => {
    const i = points.findIndex((p) => Math.abs(p.hz - f) < 0.05);
    if (i >= 0) points[i] = { hz: f, amp: a, baseline: b };
    else {
      points.push({ hz: f, amp: a, baseline: b });
      points.sort((x, y) => x.hz - y.hz);
    }
  };
  lock(29.8, 1.8, 0.2);
  lock(59.6, 0.9, 0.15);
  lock(152, 4.2, 0.15);
  return points;
}

function unitLabel(unit: UnitMode) {
  if (unit === "acceleration") return "g";
  if (unit === "displacement") return "mils";
  return "mm/s";
}

function scaleAmp(amp: number, unit: UnitMode) {
  if (unit === "acceleration") return Math.round(amp * 0.18 * 1000) / 1000;
  if (unit === "displacement") return Math.round(amp * 0.45 * 100) / 100;
  return amp;
}

function severityMeta(s: Severity) {
  if (s === "HIGH")
    return {
      Icon: AlertTriangle,
      icon: "text-red-400",
      row: "bg-red-500/5 border-l-4 border-red-500 hover:bg-red-500/10",
      sevBadge: "bg-red-500/20 text-red-400",
      confBadge: "bg-emerald-500/15 text-emerald-400"
    };
  if (s === "MEDIUM")
    return {
      Icon: AlertCircle,
      icon: "text-yellow-400",
      row: "bg-yellow-500/5 border-l-4 border-yellow-500 hover:bg-yellow-500/10",
      sevBadge: "bg-yellow-500/20 text-yellow-400",
      confBadge: "bg-emerald-500/15 text-emerald-400"
    };
  return {
    Icon: Info,
    icon: "text-blue-400",
    row: "bg-blue-500/5 border-l-4 border-blue-500 hover:bg-blue-500/10",
    sevBadge: "bg-blue-500/20 text-blue-400",
    confBadge: "bg-slate-500/20 text-slate-300"
  };
}

/* ========================================================================== */
/* Page                                                                       */
/* ========================================================================== */

export default function Diagnose({
  user,
  onSaveReport,
  targetContext,
  onClearTargetContext,
  selectedCompanyId,
  subscriptionPlan,
  onNavigateToCalendar
}: DiagnoseProps) {
  void selectedCompanyId;
  void subscriptionPlan;

  const { toast } = useToast();
  const [activeTech, setActiveTech] = useState<Technology>("vibration");
  /** Alias used for results gating (Thermography tech id is `"ir"`, not `"thermography"`). */
  const selectedTech = activeTech;
  const technology = activeTech;

  const [browseRoute, setBrowseRoute] = useState("");
  const [browseAssetTag, setBrowseAssetTag] = useState("");
  const [browseComponent, setBrowseComponent] = useState("");

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [analysisResult, setAnalysisResult] =
    useState<VibrationAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<{
    title: string;
    message: string;
    errorType?: string;
  } | null>(null);
  const [analysisSource, setAnalysisSource] = useState<"api" | "local" | null>(
    null
  );
  const [stepIdx, setStepIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [unit, setUnit] = useState<UnitMode>("velocity");
  const [fmaxView, setFmaxView] = useState<"standard" | "highfreq">("standard");
  const [fftAxis, setFftAxis] = useState<"horizontal" | "vertical" | "axial">("horizontal");
  const [syncCursorActive, setSyncCursorActive] = useState(true);
  const [range, setRange] = useState<FreqRange>("0-1000");
  const [zoom, setZoom] = useState(1);
  const [checkedActions, setCheckedActions] = useState<Record<string, boolean>>({});
  const [showTrend, setShowTrend] = useState(false);
  const [gaugeScore, setGaugeScore] = useState(0);

  const [vibRpm, setVibRpm] = useState(String(EMPTY_DIAGNOSE_ASSET.rpm));
  const [bearingType, setBearingType] = useState(EMPTY_DIAGNOSE_ASSET.bearing);
  const [motorHp, setMotorHp] = useState(String(EMPTY_DIAGNOSE_ASSET.hp));
  const [mcaVoltage, setMcaVoltage] = useState(EMPTY_DIAGNOSE_ASSET.voltage);
  const [isoZone, setIsoZone] = useState(EMPTY_DIAGNOSE_ASSET.isoZone);
  const [componentType, setComponentType] = useState(EMPTY_DIAGNOSE_ASSET.componentType);
  const [manufacturer, setManufacturer] = useState(EMPTY_DIAGNOSE_ASSET.manufacturer);
  const [specName, setSpecName] = useState("");
  const [specTab, setSpecTab] = useState<SpecTabId>("core");
  const [machineSpecs, setMachineSpecs] = useState<Record<string, string>>(() => ({
    ...emptySpecsFor(EMPTY_DIAGNOSE_ASSET.componentType),
    rpm: String(EMPTY_DIAGNOSE_ASSET.rpm),
    bearingDe: EMPTY_DIAGNOSE_ASSET.bearing,
    horsepower: String(EMPTY_DIAGNOSE_ASSET.hp),
    voltage: EMPTY_DIAGNOSE_ASSET.voltage.replace(/[^\d.]/g, ""),
    isoZone: EMPTY_DIAGNOSE_ASSET.isoZone
  }));
  const [customComponentType, setCustomComponentType] = useState("");
  const showCustomType = componentType === "Other";

  const [observations, setObservations] = useState("");
  const [symptomTags, setSymptomTags] = useState<string[]>([]);

  const [dataSource, setDataSource] = useState<DataSource>("latest");
  const [manualOverall, setManualOverall] = useState("");
  const [manual1x, setManual1x] = useState("");
  const [manual2x, setManual2x] = useState("");
  const [manualPeakVue, setManualPeakVue] = useState("");
  const [realtimeStatus, setRealtimeStatus] = useState<"idle" | "connecting" | "live">("idle");
  const [latestReadingMeta, setLatestReadingMeta] = useState<string | null>(null);

  const [spectrumUpload, setSpectrumUpload] = useState<UploadedFileMeta | null>(null);
  const [thermalUpload, setThermalUpload] = useState<UploadedFileMeta | null>(null);
  const [thermographyPeaks, setThermographyPeaks] = useState<{
    hotspot_temp: number;
    reference_temp: number;
    delta_t: number;
  } | null>(null);
  const [ultrasoundPeaks, setUltrasoundPeaks] = useState<{
    peak_dbmv: number;
    rms_dbmv: number;
    baseline_dbmv?: number;
    delta_db?: number;
    crest_factor?: number;
    mode?: string;
  } | null>(null);
  const [ultrasoundSnapshot, setUltrasoundSnapshot] =
    useState<UltrasoundInputSnapshot | null>(null);
  const [mcaSnapshot, setMcaSnapshot] = useState<McaOperatorSnapshot | null>(
    null
  );
  const mcaPeaksRef = useRef<unknown[] | null>(null);
  const mcaTelemetryRef = useRef<Record<string, unknown> | null>(null);
  const [thermoTelemetry, setThermoTelemetry] =
    useState<ThermographyTelemetrySnapshot | null>(null);
  const [rawUpload, setRawUpload] = useState<UploadedFileMeta | null>(null);
  const [chartRegionStatus, setChartRegionStatus] =
    useState<ChartRegionDetectStatus>("idle");
  const [chartRegionDetection, setChartRegionDetection] =
    useState<SpectrumRegionDetection | null>(null);
  const [croppedCharts, setCroppedCharts] = useState<CroppedChartRegions>({});
  const [chartRegionError, setChartRegionError] = useState<string | null>(null);
  const [expandedCrop, setExpandedCrop] = useState<{
    kind: ChartRegionKind;
    title: string;
    imageUrl: string;
  } | null>(null);
  const [savedAnalysisId, setSavedAnalysisId] = useState<string | null>(null);
  const [isSavingAnalysis, setIsSavingAnalysis] = useState(false);
  const [showManagerReport, setShowManagerReport] = useState(false);
  const analysisStartedAtRef = useRef<string | null>(null);
  const thermographyPeaksRef = useRef<unknown[] | null>(null);
  const thermographyPolyRef = useRef<{
    asset_type?: string | null;
    phase_a_temp?: number | null;
    phase_b_temp?: number | null;
    phase_c_temp?: number | null;
    measured_amps?: number | null;
    rated_amps?: number | null;
    de_bearing_temp?: number | null;
    ode_bearing_temp?: number | null;
    refractory_skin_temp?: number | null;
    max_allowable_limit?: number | null;
    i2r_normalized_delta_t?: number | null;
    telemetry_data?: Record<string, unknown> | null;
  } | null>(null);
  const ultrasoundPeaksRef = useRef<unknown[] | null>(null);
  const vibrationExtractedRef = useRef<ExtractedVibrationData | null>(null);
  const vibrationTrendRecordRef = useRef<VibrationDiagnosticRecord | null>(null);
  const [vibrationExtractStatus, setVibrationExtractStatus] = useState<
    "idle" | "extracting" | "ready" | "failed"
  >("idle");
  const [vibrationExtractError, setVibrationExtractError] = useState<
    string | null
  >(null);
  const [vibrationExtractSummary, setVibrationExtractSummary] = useState<{
    peakCount: number;
    confidence: number;
  } | null>(null);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const isLoading =
    isAnalyzing || vibrationExtractStatus === "extracting";

  const [measurementLocation, setMeasurementLocation] = useState<string>("Motor DE");
  const [measurementPoint, setMeasurementPoint] = useState("1H");
  const [rmsVelocity, setRmsVelocity] = useState("");
  const [peakAcceleration, setPeakAcceleration] = useState("");
  const [operatingTemp, setOperatingTemp] = useState("");
  const [machineCriticality, setMachineCriticality] = useState<string>("Essential");
  const [timeSinceService, setTimeSinceService] = useState("4,500 hours");
  const [ambientTemp, setAmbientTemp] = useState("72");
  const [acqFreqRange, setAcqFreqRange] = useState<string>("0-10,000 Hz");
  const [acqUnits, setAcqUnits] = useState<string>("Velocity mm/s");
  const [compareBaseline, setCompareBaseline] = useState(false);
  const [loadCondition, setLoadCondition] = useState<LoadCondition | null>(null);
  const [mountingMethod, setMountingMethod] = useState<string>("Stud Mount");
  const [sensorSensitivity, setSensorSensitivity] = useState("100 mV/g");
  const [analysisDepth, setAnalysisDepth] = useState<AnalysisDepth>("standard");
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);

  // Vibration enterprise accordion form
  const [openVibSection, setOpenVibSection] = useState<VibAccordionSection | null>(null);
  const [driveConfig, setDriveConfig] = useState<DriveConfig>("Direct-Coupled");
  const [drivePulleyDia, setDrivePulleyDia] = useState("");
  const [drivenPulleyDia, setDrivenPulleyDia] = useState("");
  const [centerToCenter, setCenterToCenter] = useState("");
  const [beltCount, setBeltCount] = useState("1");
  const [gearStages, setGearStages] = useState("1");
  const [toothZ1, setToothZ1] = useState("");
  const [toothZ2, setToothZ2] = useState("");
  const [bladeVaneCount, setBladeVaneCount] = useState("");
  const [bearingNde, setBearingNde] = useState("");
  const [rotorBars, setRotorBars] = useState("");
  const [statorSlots, setStatorSlots] = useState("");
  const [lineFrequency, setLineFrequency] = useState<string>("60 Hz");
  const [sensorOrientation, setSensorOrientation] = useState<string>("Triaxial");
  const [fmax, setFmax] = useState<string>("10,000 Hz");
  const [lor, setLor] = useState<string>("1600");
  const [windowing, setWindowing] = useState<string>("Hanning");
  const [averages, setAverages] = useState("4");

  const [irEmissivity, setIrEmissivity] = useState("0.95");
  const [irReflectedTemp, setIrReflectedTemp] = useState("70");
  const [irDistance, setIrDistance] = useState("3");
  const [irHumidity, setIrHumidity] = useState("45");
  const [irAtmosphericTemp, setIrAtmosphericTemp] = useState("72");

  const [usFrequency, setUsFrequency] = useState("40 kHz");
  const [usGain, setUsGain] = useState("30");
  const [usMeasType, setUsMeasType] = useState("dBuV");

  const [mcaParamVoltage, setMcaParamVoltage] = useState("460V");
  const [mcaHp, setMcaHp] = useState("50");
  const [mcaResistance, setMcaResistance] = useState("");
  const [mcaInductance, setMcaInductance] = useState("");
  const [mcaPhaseAngle, setMcaPhaseAngle] = useState("");
  const [mcaInsulation, setMcaInsulation] = useState("");

  const [oilViscosity, setOilViscosity] = useState("ISO VG 46");
  const [oilWater, setOilWater] = useState("");
  const [oilTan, setOilTan] = useState("");
  const [oilParticleCount, setOilParticleCount] = useState("18/16/13");

  const [operatingRpm, setOperatingRpm] = useState(String(EMPTY_DIAGNOSE_ASSET.rpm));
  const [loadPercentage, setLoadPercentage] = useState("");
  const [processParameter, setProcessParameter] = useState("");
  const [envHumidity, setEnvHumidity] = useState("");
  const [atmPressure, setAtmPressure] = useState("");
  const [machineMountingType, setMachineMountingType] = useState("Foot-mounted");
  const [couplingType, setCouplingType] = useState("Flexible");
  const [driveType, setDriveType] = useState("Direct Drive");
  const [recentMaintenance, setRecentMaintenance] = useState("");
  const [maintenanceTags, setMaintenanceTags] = useState<string[]>([]);

  const spectrumRef = useRef<HTMLInputElement>(null);
  const realtimeTimerRef = useRef<number | null>(null);
  const thermalRef = useRef<HTMLInputElement>(null);
  const rawRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const analysisTimersRef = useRef<number[]>([]);
  const chartRegionJobRef = useRef(0);

  const [equipTick, setEquipTick] = useState(0);

  const diagnoseAssets = useMemo(() => {
    void equipTick;
    return getFlatEquipment().map(flatToDiagnoseAsset);
  }, [equipTick]);

  const hasEquipment = diagnoseAssets.length > 0;

  const handleLoadDemoEquipment = () => {
    loadDemoData();
    const next = getFlatEquipment().map(flatToDiagnoseAsset);
    setEquipTick((n) => n + 1);
    const first = next[0];
    if (first) {
      setBrowseRoute(first.route);
      setBrowseAssetTag(first.tag);
      setBrowseComponent(first.components[0] ?? "");
    }
    toast("Demo plant data loaded.", "success");
  };

  const handlePrefillActiveDbSelection = () => {
    setEquipTick((n) => n + 1);
    const sel = getActiveDbSelection();
    const assets = getFlatEquipment().map(flatToDiagnoseAsset);

    if (!sel || (!sel.assetTag && !sel.assetId && !sel.routeName)) {
      toast(
        "No active Equipment DB selection found. Select an asset or component in Equipment DB first.",
        "warning"
      );
      return;
    }

    const match =
      assets.find((a) => sel.assetId && a.id === sel.assetId) ||
      assets.find((a) => sel.assetTag && a.tag === sel.assetTag) ||
      assets.find(
        (a) =>
          sel.routeName &&
          a.route === sel.routeName &&
          (!sel.assetTag || a.tag === sel.assetTag)
      );

    if (!match) {
      toast(
        "Active DB selection could not be matched. Load Demo Data or re-select in Equipment DB.",
        "warning"
      );
      return;
    }

    const component =
      (sel.componentName && match.components.includes(sel.componentName)
        ? sel.componentName
        : match.components[0]) || "";

    setBrowseRoute(match.route);
    setBrowseAssetTag(match.tag);
    setBrowseComponent(component);

    /* Instantly populate vibration accordion sections */
    setOpenVibSection("kinematics");
    setDataSource("upload");
    setMeasurementLocation(component || "Motor DE");
    setMeasurementPoint("1H");
    setFmax("10,000 Hz");
    setLor("1600");
    setWindowing("Hanning");
    setAverages("4");
    setSensorOrientation("Triaxial");
    setSensorSensitivity("100 mV/g");
    setMountingMethod("Stud Mount");
    setLineFrequency("60 Hz");
    setLoadCondition("Full Load");
    setAcqFreqRange("0-10,000 Hz");
    setAcqUnits("Velocity mm/s");
    setAnalysisDepth("standard");
    if (activeTech !== "vibration") setActiveTech("vibration");
    applyComponentKinematics(match, component || match.components[0] || "Motor DE");

    toast(
      `Pre-filled from Equipment DB: ${match.tag}${component ? ` · ${component}` : ""}`,
      "success"
    );
  };

  const routeOptions = useMemo(
    () => Array.from(new Set(diagnoseAssets.map((a) => a.route))),
    [diagnoseAssets]
  );
  const assetOptions = useMemo(
    () => diagnoseAssets.filter((a) => !browseRoute || a.route === browseRoute),
    [browseRoute, diagnoseAssets]
  );
  const selectedAsset = useMemo(
    () =>
      diagnoseAssets.find(
        (a) => a.tag === browseAssetTag && (!browseRoute || a.route === browseRoute)
      ) ?? null,
    [browseAssetTag, browseRoute, diagnoseAssets]
  );
  const componentOptions = selectedAsset?.components ?? [];
  const hasSpectrumImage = Boolean(spectrumUpload?.preview);
  const hasThermalImage = Boolean(thermalUpload?.preview);
  const useCroppedFft = Boolean(croppedCharts.fft);
  const useCroppedTwf = Boolean(croppedCharts.twf);
  const useCroppedEnvelope = Boolean(croppedCharts.envelope);
  const chartOverlayPeaks = useMemo(() => {
    const fromVision = chartRegionDetection?.peaks || [];
    if (fromVision.length > 0) return fromVision;
    const pf = analysisResult?.primaryFault;
    if (!pf?.frequencyHz) return [] as SpectrumChartPeak[];
    return [
      {
        frequencyHz: pf.frequencyHz,
        amplitude: 0,
        label: pf.title,
        chart: "fft" as const
      }
    ];
  }, [chartRegionDetection, analysisResult]);
  const equipmentReady = Boolean(
    browseRoute && browseAssetTag && browseComponent && selectedAsset
  );
  const ultrasoundTelemetryValid = useMemo(() => {
    if (activeTech !== "ultrasound") return true;
    const peakRaw = ultrasoundSnapshot?.peakDbuV;
    const rmsRaw = ultrasoundSnapshot?.rmsDbuV;
    if (peakRaw == null || peakRaw === "" || rmsRaw == null || rmsRaw === "") {
      return true;
    }
    const peak = Number(peakRaw);
    const rms = Number(rmsRaw);
    if (!Number.isFinite(peak) || !Number.isFinite(rms)) return true;
    return peak >= rms;
  }, [activeTech, ultrasoundSnapshot?.peakDbuV, ultrasoundSnapshot?.rmsDbuV]);
  const canRun =
    (activeTech === "vibration"
      ? equipmentReady && hasSpectrumImage
      : activeTech === "ir"
        ? equipmentReady && hasThermalImage
        : equipmentReady) && ultrasoundTelemetryValid;
  const runButtonReady = canRun && !isAnalyzing;

  const displayFaults: FaultFinding[] = useMemo(() => {
    // Never mix API NORMAL/"None" headers with the demo FAULTS mock list.
    if (analysisResult) {
      return (analysisResult.identifiedFaults || []).map((f, i) => ({
        id: `api-fault-${i}`,
        severity: mapApiSeverityToUi(f.severity),
        title: f.title,
        frequency: f.frequencyHz
          ? `${f.frequencyHz} Hz`
          : selectedTech === "ir"
            ? "ΔT"
            : /noise|floor|broadband/i.test(f.title)
              ? "Broadband"
              : "—",
        amplitude: "—",
        confidence: Math.round(f.confidencePercent ?? 0),
        detail: f.description || ""
      }));
    }
    return FAULTS;
  }, [analysisResult, selectedTech]);

  const repairSteps = useMemo(
    () =>
      analysisResult?.repairRecommendations?.length
        ? analysisResult.repairRecommendations
        : analysisResult
          ? []
          : IMMEDIATE_ACTIONS,
    [analysisResult]
  );

  const financial = analysisResult?.financialImpact;
  const preventiveCost = Number(financial?.preventiveRepairCost) || 0;
  const failureCost = Number(financial?.failureCostIfDelayed) || 0;
  // downtimeLossPerHour stores total downtime loss ($5k/hr × repair hours)
  const downtimeLoss = Number(financial?.downtimeLossPerHour) || 0;
  const roiPercent =
    preventiveCost > 0
      ? Math.round(((failureCost - preventiveCost) / preventiveCost) * 100)
      : 0;
  const primaryFault = analysisResult?.primaryFault;
  const apiSeverity = analysisResult?.severity ?? (analysisResult ? "NORMAL" : "CRITICAL");
  const banner = severityBannerCopy(apiSeverity);
  const primaryUiSeverity = mapApiSeverityToUi(
    primaryFault?.severity ?? apiSeverity
  );
  const hasDetectedFaults = displayFaults.length > 0;
  const primaryTitleDisplay = primaryFault?.title
    ? primaryFault.title
    : hasDetectedFaults
      ? displayFaults[0].title
      : analysisResult
        ? "None Detected"
        : "Outer Race Bearing Defect (BPFO)";
  const primaryFreqDisplay =
    selectedTech === "ir"
      ? "ΔT 50°F"
      : primaryFault?.frequencyHz && primaryFault.frequencyHz > 0
        ? `${primaryFault.frequencyHz} Hz`
        : hasDetectedFaults
          ? displayFaults[0].frequency
          : analysisResult
            ? "—"
            : "152 Hz";
  const primaryConfidenceDisplay =
    primaryFault?.confidencePercent ??
    (hasDetectedFaults ? displayFaults[0].confidence : analysisResult ? 90 : 94);
  const specTabs = useMemo(() => getSpecTabs(componentType), [componentType]);
  const activeSpecFields = useMemo(
    () => fieldsFor(componentType, specTab),
    [componentType, specTab]
  );

  const patchMachineSpec = (key: string, value: string) => {
    setMachineSpecs((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "rpm") setVibRpm(value);
      if (key === "bearingDe" || key === "bearing") setBearingType(value);
      if (key === "horsepower" || key === "hp" || key === "powerRating") {
        setMotorHp(value.replace(/[^\d.]/g, "") || value);
      }
      if (key === "voltage") setMcaVoltage(value.includes("V") ? value : `${value}V`);
      if (key === "isoZone") setIsoZone(value);
      return next;
    });
  };

  const handleComponentTypeChange = (type: string) => {
    setComponentType(type);
    setSpecTab("core");
    if (type !== "Other") setCustomComponentType("");
    const seeded = {
      ...emptySpecsFor(type),
      ...(selectedAsset
        ? {
            rpm: String(selectedAsset.rpm),
            bearingDe: selectedAsset.bearing,
            horsepower: String(selectedAsset.hp),
            voltage: selectedAsset.voltage.replace(/[^\d.]/g, ""),
            isoZone: selectedAsset.isoZone
          }
        : {})
    };
    setMachineSpecs(seeded);
    if (seeded.rpm) setVibRpm(seeded.rpm);
    if (seeded.bearingDe) setBearingType(seeded.bearingDe);
    if (seeded.horsepower) setMotorHp(seeded.horsepower);
    if (seeded.voltage) setMcaVoltage(`${seeded.voltage}V`);
    if (seeded.isoZone) setIsoZone(seeded.isoZone);
  };

  const maxHz = range === "0-500" ? 500 : range === "0-1000" ? 1000 : 5000;
  const spectrum = useMemo(() => buildSpectrum(maxHz), [maxHz]);
  const displaySpectrum = useMemo(
    () =>
      spectrum.map((p) => ({
        ...p,
        amp: scaleAmp(p.amp, unit),
        baseline: scaleAmp(p.baseline, unit)
      })),
    [spectrum, unit]
  );

  const visibleAnnotations = useMemo(
    () => ANNOTATIONS.filter((a) => a.hz <= maxHz / Math.max(1, zoom * 0.85)),
    [maxHz, zoom]
  );

  useEffect(() => {
    if (targetContext?.quickAnalysisMode) {
      toast("Quick analysis context loaded — ready to run advanced diagnostic.", "info");
      const tech = (targetContext.technologyType || "").toLowerCase();
      if (tech.includes("infra") || tech === "ir") setActiveTech("ir");
      else if (tech.includes("ultra")) setActiveTech("ultrasound");
      else if (tech.includes("mca") || tech.includes("motor current")) setActiveTech("mca");
      else if (tech.includes("oil")) setActiveTech("oil");
      else if (tech.includes("vib")) setActiveTech("vibration");
      onClearTargetContext?.();
    }
  }, [targetContext, onClearTargetContext, toast]);

  useEffect(() => {
    setShowAdvancedParams(false);
    // Never keep another tech's results visible after switching modality
    setShowResults(false);
    setAnalysisResult(null);
    setAnalysisSource(null);
    setSavedAnalysisId(null);
  }, [activeTech]);

  useEffect(() => {
    if (!isLoading) {
      setCurrentMessageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % AI_LOADING_MESSAGES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isLoading]);

  const applyComponentKinematics = useCallback(
    (asset: DiagnoseAsset, componentName: string) => {
      const comp = lookupStoreComponent(asset, componentName);
      const kin = comp?.kinematics as
        | (NonNullable<EquipComponent["kinematics"]> & {
            voltage?: string;
            operationalDuty?: string;
          })
        | undefined;
      const rpm =
        kin?.ratedRpm?.replace(/[^\d.]/g, "") ||
        (comp?.speedRpm != null ? String(comp.speedRpm) : "") ||
        String(asset.rpm);
      const de =
        kin?.bearingDe || comp?.bearingType || asset.bearing || "SKF 6320 C3";
      const nde = kin?.bearingNde || de;
      const hp =
        kin?.motorHpKw?.match(/[\d.]+/)?.[0] ||
        String(asset.hp);
      const voltage = formatVoltage(kin?.voltage || asset.voltage);

      setVibRpm(rpm);
      setOperatingRpm(rpm);
      setBearingType(de);
      setBearingNde(nde);
      setMotorHp(hp);
      setMcaVoltage(voltage);
      setMeasurementLocation(componentName || "Motor DE");
      if (kin?.rotorBars) setRotorBars(kin.rotorBars);
      if (kin?.statorSlots) setStatorSlots(kin.statorSlots);
      if (kin?.lineFrequency) {
        setLineFrequency(
          kin.lineFrequency === "50Hz" ? "50 Hz" : "60 Hz"
        );
      }
      if (kin?.driveArrangement === "Belt Drive") {
        setDriveConfig("Belt-Driven");
      } else if (kin?.gearboxRatio || kin?.gearTeethZ1) {
        setDriveConfig("Gearbox-Driven");
      } else {
        setDriveConfig("Direct-Coupled");
      }
      if (kin?.fanBladeCount) setBladeVaneCount(kin.fanBladeCount);
      if (kin?.impellerVanes) setBladeVaneCount(kin.impellerVanes);
      if (kin?.motorSheaveDia) setDrivePulleyDia(kin.motorSheaveDia);
      if (kin?.fanSheaveDia) setDrivenPulleyDia(kin.fanSheaveDia);
      if (kin?.gearTeethZ1) setToothZ1(kin.gearTeethZ1);
      if (kin?.gearTeethZ2) setToothZ2(kin.gearTeethZ2);
      setMachineSpecs((prev) => ({
        ...prev,
        rpm,
        bearingDe: de,
        horsepower: hp,
        voltage: voltage.replace(/[^\d.]/g, "")
      }));
    },
    []
  );

  useEffect(() => {
    if (!selectedAsset) return;
    setIsoZone(selectedAsset.isoZone);
    setComponentType(selectedAsset.componentType);
    setManufacturer(selectedAsset.manufacturer);
    setSpecName(selectedAsset.label);
    setSpecTab("core");
    setCustomComponentType("");
    setBrowseComponent((prev) => {
      const next = selectedAsset.components.includes(prev)
        ? prev
        : selectedAsset.components[0] ?? "";
      return next;
    });
  }, [selectedAsset]);

  useEffect(() => {
    if (!selectedAsset || !browseComponent) return;
    applyComponentKinematics(selectedAsset, browseComponent);
  }, [selectedAsset, browseComponent, applyComponentKinematics]);

  const clearAnalysisTimers = () => {
    analysisTimersRef.current.forEach((t) => window.clearTimeout(t));
    analysisTimersRef.current = [];
  };

  useEffect(
    () => () => {
      clearAnalysisTimers();
      if (realtimeTimerRef.current) window.clearTimeout(realtimeTimerRef.current);
    },
    []
  );

  // Animate health gauge when results appear
  useEffect(() => {
    if (!showResults) {
      setGaugeScore(0);
      return;
    }
    const target = analysisResult?.overallHealthScore ?? HEALTH_SCORE_TARGET;
    let frame = 0;
    const start = performance.now();
    const duration = 1000;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setGaugeScore(Math.round(target * eased));
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [showResults, analysisResult?.overallHealthScore]);

  const analysisTypeForTech = (tech: Technology = activeTech): string => {
    if (tech === "ir") return "thermography";
    return tech;
  };

  const applyAnalysisResult = (
    result: VibrationAnalysisResult,
    source: "api" | "local",
    peaks?: SpectrumChartPeak[],
    options?: { analysisType?: string; skipPeakInference?: boolean }
  ) => {
    const ratedRpm = Number(vibRpm) || Number(selectedAsset?.rpm) || undefined;
    const reconciled = reconcileAnalysisResult(result, {
      peaks: options?.skipPeakInference
        ? undefined
        : peaks?.length
          ? peaks
          : chartRegionDetection?.peaks,
      ratedRpm:
        options?.skipPeakInference
          ? undefined
          : Number.isFinite(ratedRpm) && (ratedRpm as number) > 0
            ? ratedRpm
            : undefined
    });
    setAnalysisResult(reconciled);
    setAnalysisSource(source);
    setAnalysisError(null);
    setShowResults(true);
    setProgress(100);
    setStepIdx(ANALYSIS_STEPS.length);
    // Allow results UI to paint, then return viewport to top
    window.setTimeout(() => {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }, 80);

    // Persist to PostgreSQL so Trend / Alerts / Reports / Logs stay in sync.
    void persistAnalysisToDatabase(
      reconciled,
      peaks,
      options?.analysisType || analysisTypeForTech()
    );
  };

  const persistAnalysisToDatabase = async (
    reconciled: VibrationAnalysisResult,
    peaks?: SpectrumChartPeak[],
    analysisType: string = "vibration"
  ) => {
    setIsSavingAnalysis(true);
    try {
      // Prefer tag (stable across Equipment DB ↔ Postgres), then id/label
      const assetKey =
        (browseAssetTag && String(browseAssetTag).trim()) ||
        (selectedAsset?.tag && String(selectedAsset.tag).trim()) ||
        (selectedAsset?.id != null ? String(selectedAsset.id) : null) ||
        selectedAsset?.label ||
        "unknown-asset";

      const faultList = (reconciled.identifiedFaults || []).map((f) => ({
        title: f.title,
        frequencyHz: f.frequencyHz,
        frequency:
          f.frequencyHz > 0
            ? `${f.frequencyHz} Hz`
            : analysisType === "thermography"
              ? "ΔT"
              : analysisType === "ultrasound"
                ? "dBµV"
                : undefined,
        confidence: f.confidencePercent,
        confidencePercent: f.confidencePercent,
        severity: f.severity,
        description: f.description,
        detail: f.description
      }));

      // Also include UI-mapped HIGH/MEDIUM/LOW for alert creation
      const faultListForSave = faultList.map((f) => ({
        ...f,
        severity: mapApiSeverityToUi(f.severity)
      }));

      const peakPayload =
        analysisType === "thermography"
          ? thermographyPeaksRef.current || []
          : analysisType === "ultrasound"
            ? ultrasoundPeaksRef.current || []
            : analysisType === "mca"
              ? mcaPeaksRef.current || []
              : peaks?.length
                ? peaks
                : chartRegionDetection?.peaks?.length
                  ? chartRegionDetection.peaks
                  : [];

      // Stamp unified Trend Analyzer vibration record onto peaks + telemetry
      let vibrationTrendRecord = vibrationTrendRecordRef.current;
      if (analysisType === "vibration" && vibrationExtractedRef.current) {
        const existingFallback =
          vibrationTrendRecordRef.current?.metadata?.extractionMethod ===
          "fallback";
        if (
          existingFallback &&
          !vibrationExtractedRef.current.spectralPeaks.length
        ) {
          vibrationTrendRecord = {
            ...vibrationTrendRecordRef.current!,
            broadband: {
              ...vibrationTrendRecordRef.current!.broadband,
              healthScore: reconciled.overallHealthScore,
              primaryFault:
                reconciled.primaryFault?.title ||
                vibrationTrendRecordRef.current!.broadband.primaryFault
            }
          };
        } else {
          vibrationTrendRecord = buildVibrationDiagnosticRecord({
            assetId: assetKey,
            extracted: vibrationExtractedRef.current,
            component: browseComponent || null,
            healthScore: reconciled.overallHealthScore,
            primaryFault: reconciled.primaryFault?.title || null,
            timestamp: new Date().toISOString()
          });
        }
        vibrationTrendRecordRef.current = vibrationTrendRecord;
        cacheVibrationRecordLocally(vibrationTrendRecord);
      }
      if (
        analysisType === "vibration" &&
        vibrationTrendRecord &&
        !vibrationTrendRecord.spectral.length &&
        vibrationTrendRecord.metadata?.extractionMethod !== "fallback"
      ) {
        vibrationTrendRecord = null;
      }

      let envelopeEnergyForSave: number | null = null;

      if (analysisType === "vibration" && vibrationTrendRecord) {
        const apiAny = reconciled as VibrationAnalysisResult & {
          waveform?: Record<string, unknown>;
          waveformPeakToPeak?: number;
          waveformCrestFactor?: number;
          waveformImpactCount?: number;
          waveformSymmetry?: string;
          waveformModulation?: string;
          waveformMetrics?: {
            peakAmplitude?: number;
            crestFactor?: number;
            rmsValue?: number;
          };
          envelope?: {
            peakAmplitude?: number;
            dominantFrequency?: number;
            energy?: number;
          } | null;
          envelopePeakAmplitude?: number;
          envelopeDominantFrequency?: number;
          envelopeEnergy?: number;
        };
        const wfFromApi = normalizeWaveformMetrics(
          apiAny.waveform || {
            peakToPeak: apiAny.waveformPeakToPeak,
            crestFactor:
              apiAny.waveformCrestFactor ??
              apiAny.waveformMetrics?.crestFactor,
            impactCount: apiAny.waveformImpactCount,
            symmetry: apiAny.waveformSymmetry,
            modulation: apiAny.waveformModulation,
            peakAmplitude: apiAny.waveformMetrics?.peakAmplitude,
            rmsValue: apiAny.waveformMetrics?.rmsValue
          },
          Number(vibRpm) || vibrationTrendRecord.rpm || undefined
        );
        const envPeak = Number(
          apiAny.envelope?.peakAmplitude ?? apiAny.envelopePeakAmplitude
        );
        const envFreq = Number(
          apiAny.envelope?.dominantFrequency ??
            apiAny.envelopeDominantFrequency
        );
        const envEnergy = Number(
          apiAny.envelope?.energy ?? apiAny.envelopeEnergy
        );
        const hasEnvelope =
          (Number.isFinite(envPeak) && envPeak > 0) ||
          (Number.isFinite(envFreq) && envFreq > 0) ||
          (Number.isFinite(envEnergy) && envEnergy > 0);

        envelopeEnergyForSave =
          Number.isFinite(envEnergy) && envEnergy > 0 ? envEnergy : null;

        if (wfFromApi || hasEnvelope) {
          const enveloping =
            hasEnvelope && Number.isFinite(envFreq) && envFreq > 0
              ? [
                  ...vibrationTrendRecord.enveloping.filter(
                    (p) =>
                      !/peak|envelope|ge/i.test(String(p.label || ""))
                  ),
                  {
                    frequency: envFreq,
                    amplitude:
                      Number.isFinite(envPeak) && envPeak > 0 ? envPeak : 0,
                    label: "Peak gE"
                  }
                ]
              : vibrationTrendRecord.enveloping;

          vibrationTrendRecord = {
            ...vibrationTrendRecord,
            ...(wfFromApi
              ? {
                  waveformAnalysis: {
                    peakToPeak: wfFromApi.peakToPeak,
                    crestFactor: wfFromApi.crestFactor,
                    impactCount: wfFromApi.impactCount,
                    symmetry: wfFromApi.symmetry,
                    timePerRevolutionMs: wfFromApi.timePerRevolutionMs,
                    modulation: wfFromApi.modulation
                  },
                  waveformMetrics: vibrationTrendRecord.waveformMetrics || {
                    peakAmplitude:
                      wfFromApi.peakAmplitude ?? wfFromApi.peakToPeak / 2,
                    crestFactor: wfFromApi.crestFactor,
                    rmsValue:
                      wfFromApi.rmsValue ??
                      (wfFromApi.crestFactor > 0
                        ? wfFromApi.peakToPeak / 2 / wfFromApi.crestFactor
                        : 0)
                  }
                }
              : {}),
            enveloping,
            broadband: {
              ...vibrationTrendRecord.broadband,
              ...(wfFromApi && wfFromApi.crestFactor > 0
                ? { kurtosis: wfFromApi.crestFactor }
                : {}),
              ...(hasEnvelope && Number.isFinite(envPeak) && envPeak > 0
                ? { peakGe: envPeak }
                : {})
            }
          };
          vibrationTrendRecordRef.current = vibrationTrendRecord;
          cacheVibrationRecordLocally(vibrationTrendRecord);
        }
        console.log("💾 [VIBRATION] Saving diagnostic record:", {
          assetId: assetKey,
          timestamp: new Date().toISOString(),
          hasSpectral: !!vibrationTrendRecord.spectral?.length,
          spectralLength: vibrationTrendRecord.spectral?.length,
          firstFewPeaks: vibrationTrendRecord.spectral?.slice(0, 3),
          hasWaveformAnalysis: Boolean(vibrationTrendRecord.waveformAnalysis),
          hasEnvelope: Boolean(vibrationTrendRecord.broadband.peakGe)
        });
      }

      const peaksForSave =
        analysisType === "vibration" && vibrationTrendRecord
          ? [
              ...(Array.isArray(peakPayload) ? peakPayload : []),
              {
                type: VIBRATION_TREND_RECORD_TYPE,
                record: vibrationTrendRecord
              }
            ]
          : peakPayload;

      const imageUrl =
        analysisType === "thermography"
          ? thermalUpload?.preview || null
          : spectrumUpload?.preview || null;

      const saved = await saveAnalysisResult({
        asset_id: assetKey,
        component: browseComponent || null,
        health_score: reconciled.overallHealthScore,
        primary_fault: reconciled.primaryFault?.title || null,
        fault_list: faultListForSave,
        peaks: peaksForSave,
        spectrum_image_url: imageUrl,
        recommendations: reconciled.repairRecommendations || [],
        financial_impact: {
          preventiveRepairCost: reconciled.financialImpact?.preventiveRepairCost ?? 0,
          failureCostIfDelayed: reconciled.financialImpact?.failureCostIfDelayed ?? 0,
          downtimeLossPerHour: reconciled.financialImpact?.downtimeLossPerHour ?? 0,
          downtimeRatePerHour: DOWNTIME_RATE_PER_HOUR,
          estimatedRepairHours:
            DOWNTIME_RATE_PER_HOUR > 0
              ? Math.round(
                  (Number(reconciled.financialImpact?.downtimeLossPerHour) || 0) /
                    DOWNTIME_RATE_PER_HOUR
                )
              : 0,
          roiPercent:
            (Number(reconciled.financialImpact?.preventiveRepairCost) || 0) > 0
              ? Math.round(
                  (((Number(reconciled.financialImpact?.failureCostIfDelayed) || 0) -
                    (Number(reconciled.financialImpact?.preventiveRepairCost) || 0)) /
                    (Number(reconciled.financialImpact?.preventiveRepairCost) || 1)) *
                    100
                )
              : 0
        },
        severity: reconciled.severity,
        summary: reconciled.summary,
        consensus_details: reconciled.consensusDetails || null,
        analysis_type: analysisType,
        started_at: analysisStartedAtRef.current,
        create_alerts_for_high: true,
        ...(analysisType === "thermography" && thermographyPolyRef.current
          ? thermographyPolyRef.current
          : {}),
        ...(analysisType === "mca" && mcaTelemetryRef.current
          ? { telemetry_data: mcaTelemetryRef.current }
          : {}),
        ...(analysisType === "vibration" && vibrationTrendRecord
          ? {
              telemetry_data: {
                schema_version: 1,
                captured_at: new Date().toISOString(),
                analysis_type: "vibration",
                vibration_trend_record: vibrationTrendRecord,
                spectral: vibrationTrendRecord.spectral || [],
                extraction_confidence:
                  vibrationTrendRecord.extractionConfidence ?? null,
                source_image: vibrationTrendRecord.sourceImage || null,
                waveform: vibrationTrendRecord.waveformAnalysis || null,
                envelope:
                  vibrationTrendRecord.broadband.peakGe != null ||
                  vibrationTrendRecord.enveloping.length > 0
                    ? {
                        peakAmplitude:
                          vibrationTrendRecord.broadband.peakGe ?? null,
                        dominantFrequency:
                          vibrationTrendRecord.enveloping.find((p) =>
                            /peak|ge/i.test(String(p.label || ""))
                          )?.frequency ??
                          vibrationTrendRecord.enveloping[0]?.frequency ??
                          null,
                        energy: envelopeEnergyForSave
                      }
                    : null
              },
              ...(vibrationTrendRecord.waveformAnalysis
                ? {
                    waveform_peak_to_peak:
                      vibrationTrendRecord.waveformAnalysis.peakToPeak,
                    waveform_crest_factor:
                      vibrationTrendRecord.waveformAnalysis.crestFactor,
                    waveform_impact_count:
                      vibrationTrendRecord.waveformAnalysis.impactCount,
                    waveform_symmetry:
                      vibrationTrendRecord.waveformAnalysis.symmetry,
                    waveform_modulation:
                      vibrationTrendRecord.waveformAnalysis.modulation || null
                  }
                : {}),
              ...(vibrationTrendRecord.broadband.peakGe != null &&
              vibrationTrendRecord.broadband.peakGe > 0
                ? {
                    envelope_peak_amplitude:
                      vibrationTrendRecord.broadband.peakGe,
                    envelope_dominant_frequency:
                      vibrationTrendRecord.enveloping.find((p) =>
                        /peak|ge/i.test(String(p.label || ""))
                      )?.frequency ??
                      vibrationTrendRecord.enveloping[0]?.frequency ??
                      null,
                    envelope_energy: envelopeEnergyForSave
                  }
                : {})
            }
          : {})
      });

      setSavedAnalysisId(saved.analysis?.id || null);
      if (analysisType === "vibration" && vibrationTrendRecord) {
        console.log("✅ [VIBRATION] Record saved successfully", {
          analysisId: saved.analysis?.id,
          assetId: assetKey,
          spectralLength: vibrationTrendRecord.spectral.length
        });
      }
      toast(
        saved.alerts_created > 0
          ? `Analysis saved · ${saved.alerts_created} alert(s) created`
          : "Analysis saved to database",
        "success"
      );
    } catch (err) {
      console.error("[Diagnose] Failed to persist analysis:", err);
      toast(
        err instanceof Error
          ? `Could not save analysis: ${err.message}`
          : "Could not save analysis to database",
        "warning"
      );
    } finally {
      setIsSavingAnalysis(false);
    }
  };

  const handleExportPdf = async () => {
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      const asset = selectedAsset?.label || browseAssetTag || "Asset";
      const y0 = 14;
      doc.setFontSize(16);
      doc.text(
        selectedTech === "ir"
          ? "Spectra CM — Thermography Analysis Report"
          : "Spectra CM — Vibration Analysis Report",
        14,
        y0
      );
      doc.setFontSize(11);
      doc.text(`Asset: ${asset}`, 14, y0 + 10);
      doc.text(`Component: ${browseComponent || "—"}`, 14, y0 + 17);
      doc.text(
        `Health Score: ${analysisResult?.overallHealthScore ?? gaugeScore} / 100`,
        14,
        y0 + 24
      );
      doc.text(
        `Severity: ${analysisResult?.severity || apiSeverity}`,
        14,
        y0 + 31
      );
      doc.text(
        `Primary Fault: ${primaryTitleDisplay}`,
        14,
        y0 + 38
      );
      doc.text(`Frequency: ${primaryFreqDisplay}`, 14, y0 + 45);
      doc.text(
        `Confidence: ${primaryConfidenceDisplay}%`,
        14,
        y0 + 52
      );

      let y = y0 + 64;
      doc.setFontSize(12);
      doc.text("Identified Faults", 14, y);
      y += 7;
      doc.setFontSize(10);
      const faults =
        displayFaults.length > 0
          ? displayFaults
          : [{ title: "None Detected", frequency: "—", confidence: 0, severity: "LOW" as const, detail: "", id: "none", amplitude: "—" }];
      for (const f of faults.slice(0, 8)) {
        const line = `• ${f.title} | ${f.frequency} | ${f.confidence}% | ${f.severity}`;
        doc.text(line.substring(0, 95), 14, y);
        y += 6;
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
      }

      y += 6;
      doc.setFontSize(12);
      doc.text("Financial Impact", 14, y);
      y += 7;
      doc.setFontSize(10);
      doc.text(`Preventive repair: ${formatUsd(preventiveCost)}`, 14, y);
      y += 6;
      doc.text(`Failure if delayed: ${formatUsd(failureCost)}`, 14, y);
      y += 6;
      doc.text(`Downtime loss: ${formatUsd(downtimeLoss)}`, 14, y);

      y += 10;
      doc.setFontSize(12);
      doc.text("Recommendations", 14, y);
      y += 7;
      doc.setFontSize(10);
      for (const step of (repairSteps.length ? repairSteps : ["Continue monitoring."]).slice(0, 8)) {
        const wrapped = doc.splitTextToSize(`• ${step}`, 180);
        doc.text(wrapped, 14, y);
        y += wrapped.length * 5 + 2;
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
      }

      if (analysisResult?.summary) {
        y += 6;
        doc.setFontSize(12);
        doc.text("Summary", 14, y);
        y += 7;
        doc.setFontSize(10);
        const summaryLines = doc.splitTextToSize(analysisResult.summary, 180);
        doc.text(summaryLines, 14, y);
      }

      const fileSafe = asset.replace(/[^\w.-]+/g, "_").slice(0, 40);
      doc.save(`Spectra_${fileSafe}_Vibration.pdf`);
      toast("PDF report downloaded.", "success");
    } catch (err) {
      console.error("[Diagnose] PDF export failed:", err);
      toast("PDF export failed.", "error");
    }
  };

  const handleSetBaseline = async () => {
    if (!savedAnalysisId) {
      toast("Save an analysis first, then set it as baseline.", "warning");
      return;
    }
    try {
      await setAnalysisBaseline(savedAnalysisId);
      toast("Session saved as baseline for future comparisons.", "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to set baseline.",
        "error"
      );
    }
  };

  const handleRunAnalysis = async () => {
    console.log("Starting analysis for:", selectedAsset, browseComponent, activeTech);
    if (!canRun) {
      toast("Select Route, Asset, and Component first.", "warning");
      return;
    }
    if (isAnalyzing) return;

    analysisStartedAtRef.current = new Date().toISOString();
    setSavedAnalysisId(null);

    if (activeTech === "ir") {
      // Thermography: AI vision pipeline → persist + show results
      setShowResults(false);
      setAnalysisResult(null);
      setGaugeScore(0);
      setStepIdx(0);
      setProgress(12);
      setIsAnalyzing(true);
      setAnalysisError(null);
      thermographyPeaksRef.current = null;
      thermographyPolyRef.current = null;
      clearAnalysisTimers();

      ANALYSIS_STEPS.forEach((_, i) => {
        if (i === 0) return;
        analysisTimersRef.current.push(
          window.setTimeout(() => {
            setStepIdx((prev) => Math.max(prev, i));
            setProgress((p) =>
              Math.min(90, Math.max(p, Math.round(((i + 1) / ANALYSIS_STEPS.length) * 85)))
            );
          }, Math.round(i * 700))
        );
      });

      try {
        if (!thermalUpload?.preview) {
          throw new Error("Upload a thermal image before running Advanced Diagnostic.");
        }

        const imageBase64 = await blobUrlToDataUrl(thermalUpload.preview);
        const tel = thermoTelemetry || {};
        const metadata = {
          asset: selectedAsset?.label || browseAssetTag,
          assetTag: selectedAsset?.tag || browseAssetTag,
          component: browseComponent,
          route: browseRoute,
          location: selectedAsset?.location,
          voltage: selectedAsset?.voltage,
          loadPercent: loadPercentage || 46,
          fileName: thermalUpload.name,
          tempUnit: tel.tempUnit === "°C" ? "°C" : "°F",
          // Existing physics from IR accordions (optional)
          ambientTemp: tel.ambientTemp,
          humidity: tel.humidity,
          windSpeed: tel.windSpeed,
          solarCondition: tel.solarCondition,
          emissivity: tel.emissivity,
          reflectedTemp: tel.reflectedTemp,
          distance: tel.distance,
          distanceUnit: tel.distanceUnit,
          // Polymorphic telemetry → DB columns
          asset_type: tel.asset_type,
          phase_a_temp: tel.phase_a_temp ?? null,
          phase_b_temp: tel.phase_b_temp ?? null,
          phase_c_temp: tel.phase_c_temp ?? null,
          measured_amps: tel.measured_amps ?? null,
          rated_amps: tel.rated_amps ?? null,
          de_bearing_temp: tel.de_bearing_temp ?? null,
          ode_bearing_temp: tel.ode_bearing_temp ?? null,
          refractory_skin_temp: tel.refractory_skin_temp ?? null,
          max_allowable_limit: tel.max_allowable_limit ?? null
        };

        const res = await fetch(ANALYZE_THERMOGRAPHY_API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64, metadata })
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok || payload?.success === false) {
          const title =
            payload?.title ||
            (res.status === 404
              ? "API Endpoint Not Found"
              : "Thermography Analysis Error");
          const message =
            payload?.message ||
            payload?.error ||
            payload?.detail ||
            `Thermography analysis failed (${res.status})`;
          const restartHint =
            res.status === 404
              ? " Restart the Spectra CM server (npm run dev) so POST /api/analyze-thermography is registered."
              : "";
          setAnalysisError({
            title: String(title),
            message: String(message) + restartHint,
            errorType: payload?.errorType
          });
          setIsAnalyzing(false);
          clearAnalysisTimers();
          toast(String(title), "error");
          return;
        }

        const thermoRaw =
          payload?.data && typeof payload.data === "object"
            ? payload.data
            : payload;
        const thermo: ThermographyResult = normalizeThermographyResult(thermoRaw);
        const radiometric =
          thermo.detailed?.radiometric ??
          extractRadiometricMetrics({
            extracted_data: thermo.detailed?.extracted_data,
            analysis: thermo.detailed?.analysis
          });
        const basePeaks = thermographyPeaksForSave(thermo);
        const poly =
          thermoRaw &&
          typeof thermoRaw === "object" &&
          (thermoRaw as { polymorphic_fields?: Record<string, unknown> })
            .polymorphic_fields &&
          typeof (thermoRaw as { polymorphic_fields?: unknown }).polymorphic_fields ===
            "object"
            ? ((thermoRaw as { polymorphic_fields: Record<string, unknown> })
                .polymorphic_fields as Record<string, unknown>)
            : {};
        // Prefer operator telemetry, then server-calculated polymorphic fields
        const enrichedPeak = {
          ...((basePeaks[0] as object) || {}),
          type: "thermography",
          asset_type: tel.asset_type ?? poly.asset_type ?? null,
          phase_a_temp:
            tel.phase_a_temp ??
            (typeof poly.phase_a_temp === "number" ? poly.phase_a_temp : null),
          phase_b_temp:
            tel.phase_b_temp ??
            (typeof poly.phase_b_temp === "number" ? poly.phase_b_temp : null),
          phase_c_temp:
            tel.phase_c_temp ??
            (typeof poly.phase_c_temp === "number" ? poly.phase_c_temp : null),
          measured_amps:
            tel.measured_amps ??
            (typeof poly.measured_amps === "number" ? poly.measured_amps : null),
          rated_amps:
            tel.rated_amps ??
            (typeof poly.rated_amps === "number" ? poly.rated_amps : null),
          de_bearing_temp:
            tel.de_bearing_temp ??
            (typeof poly.de_bearing_temp === "number"
              ? poly.de_bearing_temp
              : null),
          ode_bearing_temp:
            tel.ode_bearing_temp ??
            (typeof poly.ode_bearing_temp === "number"
              ? poly.ode_bearing_temp
              : null),
          refractory_skin_temp:
            tel.refractory_skin_temp ??
            (typeof poly.refractory_skin_temp === "number"
              ? poly.refractory_skin_temp
              : null),
          max_allowable_limit:
            tel.max_allowable_limit ??
            (typeof poly.max_allowable_limit === "number"
              ? poly.max_allowable_limit
              : null),
          i2r_normalized_delta_t:
            typeof poly.i2r_normalized_delta_t === "number"
              ? poly.i2r_normalized_delta_t
              : null,
          current_amps:
            tel.measured_amps ??
            (typeof poly.measured_amps === "number" ? poly.measured_amps : null)
        };
        thermographyPeaksRef.current = [enrichedPeak, ...basePeaks.slice(1)];
        // Stash polymorphic columns + hybrid telemetry_data for save-analysis-result
        thermographyPolyRef.current = {
          asset_type: tel.asset_type || null,
          phase_a_temp: tel.phase_a_temp ?? null,
          phase_b_temp: tel.phase_b_temp ?? null,
          phase_c_temp: tel.phase_c_temp ?? null,
          measured_amps: tel.measured_amps ?? null,
          rated_amps: tel.rated_amps ?? null,
          de_bearing_temp: tel.de_bearing_temp ?? null,
          ode_bearing_temp: tel.ode_bearing_temp ?? null,
          refractory_skin_temp: tel.refractory_skin_temp ?? null,
          max_allowable_limit: tel.max_allowable_limit ?? null,
          i2r_normalized_delta_t:
            typeof poly.i2r_normalized_delta_t === "number"
              ? poly.i2r_normalized_delta_t
              : null,
          telemetry_data: {
            schema_version: 1,
            captured_at: new Date().toISOString(),
            analysis_type: "thermography",
            environmental: {
              emissivity: tel.emissivity ?? radiometric.emissivitySetting ?? null,
              ambient_temp: tel.ambientTemp ?? null,
              reflected_temp: tel.reflectedTemp ?? null,
              distance: tel.distance ?? null,
              distance_unit: tel.distanceUnit ?? null,
              humidity: tel.humidity ?? null,
              wind_speed: tel.windSpeed ?? null,
              solar_condition: tel.solarCondition ?? null,
              temp_unit: tel.tempUnit ?? "°F",
              load_percent: loadPercentage || metadata.loadPercent || null
            },
            ai_vision: {
              hotspot_temp: thermo.peaks?.hotspot_temp ?? null,
              reference_temp: thermo.peaks?.reference_temp ?? null,
              delta_t: thermo.peaks?.delta_t ?? null,
              neta_class: thermo.detailed?.severity_class ?? null,
              severity_class: thermo.detailed?.severity_class ?? null,
              equipment_category: thermo.detailed?.equipment_category ?? null,
              primary_fault: thermo.primary_fault ?? null,
              emissivity: radiometric.emissivitySetting,
              emissivity_setting: radiometric.emissivitySetting,
              emissivitySetting: radiometric.emissivitySetting,
              scale_min: radiometric.scaleMinBoundary,
              scale_max: radiometric.scaleMaxBoundary,
              scaleMinBoundary: radiometric.scaleMinBoundary,
              scaleMaxBoundary: radiometric.scaleMaxBoundary,
              isotherm_threshold: radiometric.isothermThreshold,
              isothermThreshold: radiometric.isothermThreshold,
              box_average_temp:
                radiometric.boxAverageTemperature ?? radiometric.roiStatisticalMean,
              boxAverageTemperature: radiometric.boxAverageTemperature,
              roi_statistical_mean: radiometric.roiStatisticalMean,
              roiStatisticalMean: radiometric.roiStatisticalMean,
              radiometric,
              extracted_data: thermo.detailed?.extracted_data ?? null,
              analysis: thermo.detailed?.analysis ?? null
            },
            polymorphic: {
              asset_type: tel.asset_type || null,
              phase_a_temp: tel.phase_a_temp ?? null,
              phase_b_temp: tel.phase_b_temp ?? null,
              phase_c_temp: tel.phase_c_temp ?? null,
              measured_amps: tel.measured_amps ?? null,
              rated_amps: tel.rated_amps ?? null,
              de_bearing_temp: tel.de_bearing_temp ?? null,
              ode_bearing_temp: tel.ode_bearing_temp ?? null,
              refractory_skin_temp: tel.refractory_skin_temp ?? null,
              max_allowable_limit: tel.max_allowable_limit ?? null,
              i2r_normalized_delta_t:
                typeof poly.i2r_normalized_delta_t === "number"
                  ? poly.i2r_normalized_delta_t
                  : null
            },
            file: {
              fileName: thermalUpload.name || null
            },
            extras: {
              polymorphic_fields: poly,
              route: browseRoute || null,
              component: browseComponent || null,
              asset_tag: selectedAsset?.tag || browseAssetTag || null
            }
          }
        };
        setThermographyPeaks(thermo.peaks);
        const irResult = mapThermographyToUiResult(thermo);

        clearAnalysisTimers();
        setIsAnalyzing(false);
        applyAnalysisResult(irResult, "api", undefined, {
          analysisType: "thermography",
          skipPeakInference: true
        });
        toast("Thermography diagnostic complete.", "success");
      } catch (err) {
        clearAnalysisTimers();
        setIsAnalyzing(false);
        const message =
          err instanceof Error ? err.message : "Failed to run thermography analysis.";
        setAnalysisError({
          title: "Thermography Analysis Error",
          message,
          errorType: "VISION_ERROR"
        });
        toast(message, "error");
      }
      return;
    }

    if (activeTech === "ultrasound") {
      // Ultrasound: placeholder AI pipeline → persist + show results
      setShowResults(false);
      setAnalysisResult(null);
      setGaugeScore(0);
      setStepIdx(0);
      setProgress(12);
      setIsAnalyzing(true);
      setAnalysisError(null);
      ultrasoundPeaksRef.current = null;
      clearAnalysisTimers();

      ANALYSIS_STEPS.forEach((_, i) => {
        if (i === 0) return;
        analysisTimersRef.current.push(
          window.setTimeout(() => {
            setStepIdx((prev) => Math.max(prev, i));
            setProgress((p) =>
              Math.min(90, Math.max(p, Math.round(((i + 1) / ANALYSIS_STEPS.length) * 85)))
            );
          }, Math.round(i * 700))
        );
      });

      try {
        const snap = ultrasoundSnapshot || {};
        const metadata = {
          ...snap,
          asset: selectedAsset?.label || browseAssetTag || snap.asset,
          assetTag: selectedAsset?.tag || browseAssetTag || snap.assetTag,
          component: browseComponent || snap.component,
          route: browseRoute || snap.route,
          location: selectedAsset?.location || snap.location,
          heterodyneKhz: snap.heterodyneKhz || usFrequency,
          gainDb: snap.gainDb || usGain,
          peakDbuV: snap.peakDbuV || undefined,
          rmsDbuV: snap.rmsDbuV || undefined,
          crestFactor: snap.crestFactor || undefined
        };

        const res = await fetch(ANALYZE_ULTRASOUND_API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metadata })
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok || payload?.success === false) {
          const title =
            payload?.title ||
            (res.status === 404
              ? "API Endpoint Not Found"
              : "Ultrasound Analysis Error");
          const message =
            payload?.message ||
            payload?.error ||
            payload?.detail ||
            `Ultrasound analysis failed (${res.status})`;
          const restartHint =
            res.status === 404
              ? " Restart the Spectra CM server (npm run dev) so POST /api/analyze-ultrasound is registered."
              : "";
          setAnalysisError({
            title: String(title),
            message: String(message) + restartHint,
            errorType: payload?.errorType
          });
          setIsAnalyzing(false);
          clearAnalysisTimers();
          toast(String(title), "error");
          return;
        }

        const ueRaw =
          payload?.data && typeof payload.data === "object"
            ? payload.data
            : payload;
        const ue: UltrasoundResult = normalizeUltrasoundResult(ueRaw);
        ultrasoundPeaksRef.current = ultrasoundPeaksForSave(ue);
        setUltrasoundPeaks(ue.peaks);
        const ueResult = mapUltrasoundToUiResult(ue);

        clearAnalysisTimers();
        setIsAnalyzing(false);
        applyAnalysisResult(ueResult, "api", undefined, {
          analysisType: "ultrasound",
          skipPeakInference: true
        });
        toast("Ultrasound diagnostic complete.", "success");
      } catch (err) {
        clearAnalysisTimers();
        setIsAnalyzing(false);
        const message =
          err instanceof Error ? err.message : "Failed to run ultrasound analysis.";
        setAnalysisError({
          title: "Ultrasound Analysis Error",
          message,
          errorType: "ANALYSIS_ERROR"
        });
        toast(message, "error");
      }
      return;
    }

    if (activeTech === "mca") {
      setShowResults(false);
      setAnalysisResult(null);
      setGaugeScore(0);
      setStepIdx(0);
      setProgress(12);
      setIsAnalyzing(true);
      setAnalysisError(null);
      mcaPeaksRef.current = null;
      mcaTelemetryRef.current = null;
      clearAnalysisTimers();

      ANALYSIS_STEPS.forEach((_, i) => {
        if (i === 0) return;
        analysisTimersRef.current.push(
          window.setTimeout(() => {
            setStepIdx((prev) => Math.max(prev, i));
            setProgress((p) =>
              Math.min(
                90,
                Math.max(p, Math.round(((i + 1) / ANALYSIS_STEPS.length) * 85))
              )
            );
          }, Math.round(i * 700))
        );
      });

      try {
        const { winding, groundwall } = normalizeMcaOperatorSnapshot(mcaSnapshot);
        const hasWinding =
          mcaTripletHasData(winding.phaseR) ||
          mcaTripletHasData(winding.phaseL) ||
          mcaTripletHasData(winding.phaseZ) ||
          mcaTripletHasData(winding.phaseFi) ||
          mcaTripletHasData(winding.phaseIF);
        const hasGw =
          (groundwall.ir1mMOmega != null && groundwall.ir1mMOmega > 0) ||
          (groundwall.ir30sMOmega != null && groundwall.ir30sMOmega > 0) ||
          (groundwall.ir10mMOmega != null && groundwall.ir10mMOmega > 0) ||
          (groundwall.ir15sMOmega != null && groundwall.ir15sMOmega > 0);
        const hasRic = Boolean(
          mcaSnapshot?.ricData && mcaSnapshot.ricData.length > 0
        );

        if (!hasWinding && !hasGw && !hasRic) {
          throw new Error(
            "Enter MCA phase (R/L/Z/Fi/I-F), insulation readings, or upload a report with RIC before running Advanced Diagnostic."
          );
        }

        const windingResult = calculateWindingBalance(winding);
        const gwResult = calculateGroundwallInsulation({
          ir15sMOmega: groundwall.ir15sMOmega,
          ir30sMOmega: groundwall.ir30sMOmega,
          ir1mMOmega: groundwall.ir1mMOmega || 0,
          ir10mMOmega: groundwall.ir10mMOmega,
          testVoltageV: groundwall.testVoltageV || 0,
          windingTempC: groundwall.windingTempC ?? winding.windingTempC,
          insulationClass: groundwall.insulationClass
        });

        const primaryFault = hasWinding
          ? windingResult.fault
          : hasGw
            ? gwResult.fault
            : "Rotor Influence Check (RIC) data captured";
        const severityRaw = hasWinding
          ? windingResult.severity
          : hasGw
            ? gwResult.severity
            : "NORMAL";
        const healthScore = hasWinding
          ? windingResult.healthScore
          : hasGw
            ? gwResult.irIeeePass
              ? 85
              : 40
            : 75;
        const apiSeverity =
          severityRaw === "CRITICAL"
            ? "CRITICAL"
            : severityRaw === "WARNING"
              ? "ANOMALY"
              : "NORMAL";

        const reportPi =
          (typeof gwResult.pi === "number" && gwResult.pi > 0
            ? gwResult.pi
            : null) ??
          groundwall.reportPi ??
          mcaSnapshot?.reportPi ??
          null;
        const reportDar =
          (typeof gwResult.dar === "number" && gwResult.dar > 0
            ? gwResult.dar
            : null) ??
          groundwall.reportDar ??
          mcaSnapshot?.reportDar ??
          null;

        const payload = mcaPayloadForSave(
          {
            ...(mcaSnapshot || {}),
            reportPi,
            reportDar
          },
          {
            primaryFault,
            healthScore,
            unbalance: hasWinding
              ? {
                  R: windingResult.unbalanceR,
                  L: windingResult.unbalanceL,
                  Z: windingResult.unbalanceZ,
                  Fi: windingResult.unbalanceFi,
                  IF: windingResult.unbalanceIF,
                  maxRL: windingResult.maxUnbalanceRL
                }
              : undefined
          }
        );
        mcaPeaksRef.current = payload.peaks;
        mcaTelemetryRef.current = payload.telemetry_data;

        const mcaUiResult: VibrationAnalysisResult = {
          overallHealthScore: healthScore,
          severity: apiSeverity,
          summary: hasWinding
            ? `${windingResult.fault} — max R/L unbalance ${windingResult.maxUnbalanceRL.toFixed(2)}%. ${windingResult.recommendation}`
            : hasGw
              ? `${gwResult.fault} — IR@40°C ${gwResult.ir40MOmega} MΩ. ${gwResult.recommendation}`
              : `RIC series saved (${mcaSnapshot?.ricData?.length ?? 0} points) — verify Trend Analyzer Rotor Influence tab.`,
          primaryFault: {
            title: primaryFault,
            frequencyHz: 0,
            confidencePercent: hasWinding || hasGw || hasRic ? 90 : 50,
            severity: apiSeverity,
            actionWindow: hasWinding
              ? windingResult.recommendation
              : hasGw
                ? gwResult.recommendation
                : "Review RIC inductance variation vs baseline in Trend Analyzer."
          },
          identifiedFaults:
            primaryFault && !/healthy|normal|good|captured/i.test(primaryFault)
              ? [
                  {
                    title: primaryFault,
                    frequencyHz: 0,
                    confidencePercent: 90,
                    severity: apiSeverity,
                    description: hasWinding
                      ? windingResult.recommendation
                      : hasGw
                        ? gwResult.recommendation
                        : "Rotor Influence Check data archived with this MCA run."
                  }
                ]
              : [],
          financialImpact: {
            preventiveRepairCost: 2500,
            failureCostIfDelayed: 25000,
            downtimeLossPerHour: 5000
          },
          repairRecommendations: [
            hasWinding
              ? windingResult.recommendation
              : hasGw
                ? gwResult.recommendation
                : "Archive RIC fingerprint and compare on next outage.",
            "Archive this MCA fingerprint for Trend Analyzer phase balance / groundwall trending."
          ],
          consensusDetails: {
            modelA_Hypothesis: hasWinding
              ? `Winding unbalance R ${windingResult.unbalanceR.toFixed(2)}% · L ${windingResult.unbalanceL.toFixed(2)}%`
              : hasGw
                ? `Groundwall IR@40 ${gwResult.ir40MOmega} MΩ · PI ${reportPi ?? "n/a"}`
                : `RIC points ${mcaSnapshot?.ricData?.length ?? 0}`,
            modelB_Hypothesis: `MCA operator inputs · HP ${winding.ratedHp ?? "—"} · T ${winding.windingTempC ?? "—"}°C`,
            refereeDebateSummary: JSON.stringify({
              pipeline: "mcaOperatorInputs",
              winding: payload.telemetry_data.winding,
              groundwall: payload.telemetry_data.groundwall,
              ricData: payload.telemetry_data.ricData ?? null,
              unbalance: hasWinding
                ? {
                    R: windingResult.unbalanceR,
                    L: windingResult.unbalanceL,
                    Z: windingResult.unbalanceZ
                  }
                : null
            })
          }
        };

        clearAnalysisTimers();
        setIsAnalyzing(false);
        applyAnalysisResult(mcaUiResult, "local", undefined, {
          analysisType: "mca",
          skipPeakInference: true
        });
        toast("MCA diagnostic saved for Trend Analyzer.", "success");
      } catch (err) {
        clearAnalysisTimers();
        setIsAnalyzing(false);
        const message =
          err instanceof Error ? err.message : "Failed to run MCA analysis.";
        setAnalysisError({
          title: "MCA Analysis Error",
          message,
          errorType: "ANALYSIS_ERROR"
        });
        toast(message, "error");
      }
      return;
    }

    if (activeTech !== "vibration") {
      // Other non-vibration techs keep the lightweight simulated path
      setUnit("velocity");
      setFmaxView("standard");
      setShowResults(false);
      setGaugeScore(0);
      setStepIdx(0);
      setProgress(10);
      setIsAnalyzing(true);
      clearAnalysisTimers();
      const totalMs = 2500;
      const stepMs = totalMs / ANALYSIS_STEPS.length;
      ANALYSIS_STEPS.forEach((_, i) => {
        if (i === 0) return;
        analysisTimersRef.current.push(
          window.setTimeout(() => {
            setStepIdx(i);
            setProgress(Math.round(((i + 1) / ANALYSIS_STEPS.length) * 95));
          }, Math.round(i * stepMs))
        );
      });
      analysisTimersRef.current.push(
        window.setTimeout(() => {
          setIsAnalyzing(false);
          setShowResults(true);
          setProgress(100);
          window.setTimeout(() => {
            window.scrollTo({
              top: 0,
              behavior: "smooth"
            });
          }, 80);
        }, totalMs)
      );
      return;
    }

    setAnalysisError(null);
    setUnit("velocity");
    setFmaxView("standard");
    setShowResults(false);
    setGaugeScore(0);
    setStepIdx(0);
    setProgress(12);
    setIsAnalyzing(true);
    clearAnalysisTimers();

    // Soft progress while waiting on Gemini / consensus pipeline
    ANALYSIS_STEPS.forEach((_, i) => {
      if (i === 0) return;
      analysisTimersRef.current.push(
        window.setTimeout(() => {
          setStepIdx((prev) => Math.max(prev, i));
          setProgress((p) => Math.min(90, Math.max(p, Math.round(((i + 1) / ANALYSIS_STEPS.length) * 85))));
        }, Math.round(i * 700))
      );
    });

    try {
      if (!spectrumUpload?.preview) {
        throw new Error(
          "Upload a spectrum chart image before running Advanced Diagnostic."
        );
      }

      // Ensure unified trend record exists before consensus (re-extract if needed)
      if (!vibrationExtractedRef.current && spectrumUpload.preview) {
        try {
          const blob = await fetch(spectrumUpload.preview).then((r) => r.blob());
          const file = new File(
            [blob],
            spectrumUpload.name || "spectrum.png",
            { type: blob.type || "image/png" }
          );
          await runVibrationVisionExtraction(file);
        } catch (extractErr) {
          console.warn(
            "[Diagnose] Pre-analysis vibration extract skipped:",
            extractErr
          );
        }
      }

      const imageBase64 = await blobUrlToDataUrl(spectrumUpload.preview);
      const componentSpecs = {
        asset: selectedAsset?.label || browseAssetTag,
        component: browseComponent,
        motorHpKw: motorHp,
        ratedRpm: vibRpm,
        lineFrequency,
        bearingDe: bearingType,
        bearingNde,
        rotorBars,
        statorSlots
      };
      const telemetry = {
        measurementLocation,
        measurementPoint,
        rmsVelocity: rmsVelocity || manualOverall,
        peakAcceleration: peakAcceleration || manualPeakVue,
        operatingTemp: operatingTemp || ambientTemp,
        loadCondition: loadCondition || undefined,
        loadPercentage,
        fmax,
        lor
      };

      logPayloadSize("frontend-analyze-vibration", imageBase64);
      const startTime = logPipelineStart("frontend-analyze-vibration");
      logPipelineSend("frontend-analyze-vibration", {
        url: ANALYZE_VIBRATION_API_PATH
      });

      let res: Response;
      try {
        res = await fetchWithTimeout(ANALYZE_VIBRATION_API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64,
            componentSpecs,
            telemetry,
            mode: "full"
          })
        });
      } catch (error) {
        const kind = logPipelineFail("frontend-analyze-vibration", startTime, error);
        console.error("❌ [PIPELINE FAIL] Frontend fetch threw:", {
          kind,
          elapsedSec: pipelineElapsedSec(startTime),
          ...pipelineErrorFields(error)
        });
        throw error;
      }

      let payload: Record<string, unknown> = {};
      const responseText = await res.text();
      if (!responseText.trim()) {
        const emptyErr = new Error(
          `Empty response body from ${ANALYZE_VIBRATION_API_PATH} (HTTP ${res.status}). Restart npm run dev and check server logs.`
        );
        logPipelineFail("frontend-analyze-vibration:empty", startTime, emptyErr, res);
        throw emptyErr;
      }
      try {
        payload = JSON.parse(responseText) as Record<string, unknown>;
      } catch (parseErr) {
        logPipelineFail("frontend-analyze-vibration:json", startTime, parseErr, res);
        console.error("❌ [PIPELINE FAIL] Non-JSON response body:", {
          status: res.status,
          preview: responseText.slice(0, 200)
        });
        throw parseErr;
      }

      if (!res.ok || payload?.success === false) {
        const kind = classifyPipelineFailure(
          new Error(String(payload?.message || payload?.error || `HTTP ${res.status}`)),
          res
        );
        logPipelineFail(
          "frontend-analyze-vibration",
          startTime,
          new Error(String(payload?.detail || payload?.message || payload?.error || `HTTP ${res.status}`)),
          res
        );
        console.error("❌ [PIPELINE FAIL] Consensus HTTP error:", {
          kind,
          status: res.status,
          statusText: res.statusText,
          elapsedSec: pipelineElapsedSec(startTime),
          errorType: payload?.errorType,
          title: payload?.title,
          message: payload?.message,
          detail: payload?.detail
        });
        const errorType = String(payload?.errorType || "");
        const title =
          payload?.title ||
          (errorType === "SIGNAL_UNREADABLE"
            ? "OpenAI Vision Error"
            : errorType === "CONSENSUS_DIVERGENCE" || errorType === "GATEWAY_TIMEOUT"
              ? "Consensus Diagnostic Error"
              : res.status === 404
                ? "API Endpoint Not Found"
                : "Consensus Diagnostic Error");
        const message =
          payload?.message ||
          payload?.error ||
          payload?.detail ||
          `Consensus diagnostic failed (${res.status})`;
        const restartHint =
          res.status === 404
            ? " Restart the Spectra CM server (npm run dev) so POST /api/analyze-vibration is registered."
            : "";
        setAnalysisError({
          title: String(title),
          message: String(message) + restartHint,
          errorType: payload?.errorType
        });
        setIsAnalyzing(false);
        clearAnalysisTimers();
        toast(String(title), "error");
        return;
      }

      clearAnalysisTimers();
      setIsAnalyzing(false);
      logPipelineSuccess("frontend-analyze-vibration", startTime, {
        status: res.status
      });
      const payloadPeaks = Array.isArray((payload as any)?.spectrumPeaks)
        ? ((payload as any).spectrumPeaks as SpectrumChartPeak[])
        : chartRegionDetection?.peaks;
      applyAnalysisResult(payload as unknown as VibrationAnalysisResult, "api", payloadPeaks);
      toast("Consensus diagnostic complete.", "success");
    } catch (err) {
      clearAnalysisTimers();
      setIsAnalyzing(false);
      const message =
        err instanceof Error ? err.message : "Failed to run consensus vibration analysis.";
      const timedOut =
        /timed out|timeout|abort/i.test(message) ||
        (err instanceof DOMException && err.name === "AbortError");
      console.error("❌ [PIPELINE FAIL] handleRunAnalysis catch:", {
        kind: classifyPipelineFailure(err),
        ...pipelineErrorFields(err)
      });
      setAnalysisError({
        title: "Consensus Diagnostic Error",
        message: timedOut ? SPECTRAL_EXTRACTION_TIMEOUT_MSG : message,
        errorType: "GATEWAY_TIMEOUT"
      });
      toast(timedOut ? SPECTRAL_EXTRACTION_TIMEOUT_MSG : message, "error");
    }
  };

  const handleNewAnalysis = () => {
    clearAnalysisTimers();
    setIsAnalyzing(false);
    setShowResults(false);
    setProgress(0);
    setStepIdx(0);
    setGaugeScore(0);
    setAnalysisResult(null);
    setAnalysisError(null);
    setAnalysisSource(null);
    thermographyPeaksRef.current = null;
    thermographyPolyRef.current = null;
    setThermographyPeaks(null);
    ultrasoundPeaksRef.current = null;
    setUltrasoundPeaks(null);
    console.log("Reset to new analysis");
  };

  const ingestUpload = (
    file: File | null,
    setter: React.Dispatch<React.SetStateAction<UploadedFileMeta | null>>,
    acceptRe: RegExp
  ): string | undefined => {
    if (!file) return undefined;
    if (!acceptRe.test(file.name)) {
      toast("Unsupported file type for this upload zone.", "warning");
      return undefined;
    }
    const isImage = /\.(png|jpe?g|tiff?|gif|webp)$/i.test(file.name);
    const preview = isImage ? URL.createObjectURL(file) : undefined;
    setter((prev) => {
      if (prev?.preview) URL.revokeObjectURL(prev.preview);
      return { name: file.name, preview };
    });
    toast(`Loaded ${file.name}`, "success");
    return preview;
  };

  const resetChartRegions = () => {
    chartRegionJobRef.current += 1;
    setChartRegionStatus("idle");
    setChartRegionDetection(null);
    setCroppedCharts({});
    setChartRegionError(null);
    setExpandedCrop(null);
  };

  /** GPT-4o Vision → locate panels → Canvas crop (falls back to synthetic Recharts on failure). */
  const detectAndCropSpectrumCharts = async (previewUrl: string) => {
    const jobId = ++chartRegionJobRef.current;
    setChartRegionStatus("detecting");
    setChartRegionError(null);
    setCroppedCharts({});
    setChartRegionDetection(null);

    try {
      const imageBase64 = await blobUrlToDataUrl(previewUrl);
      if (jobId !== chartRegionJobRef.current) return;

      const detection = applyTickDensityRoleCorrection(
        await requestSpectrumRegionDetection(imageBase64)
      );
      if (jobId !== chartRegionJobRef.current) return;

      const crops = await cropAllChartRegions(previewUrl, detection.regions);
      if (jobId !== chartRegionJobRef.current) return;

      const hasCrop = Boolean(crops.fft || crops.twf || crops.envelope);
      setChartRegionDetection(detection);
      setCroppedCharts(crops);

      if (hasCrop) {
        setChartRegionStatus("ready");
        toast("Chart panels detected and cropped from spectrum image.", "success");
      } else {
        setChartRegionStatus("failed");
        setChartRegionError(
          "Vision found no croppable panels — using synthetic charts."
        );
      }
    } catch (err) {
      if (jobId !== chartRegionJobRef.current) return;
      console.error("[Diagnose] Chart region detection failed:", err);
      setChartRegionStatus("failed");
      setChartRegionError(
        err instanceof Error
          ? err.message
          : "Chart region detection failed — using synthetic charts."
      );
      setCroppedCharts({});
      setChartRegionDetection(null);
    }
  };

  /** Logged-in user, used only to pre-fill the sign-off name field. */
  const signOffEngineerName =
    (user?.full_name as string) ||
    (user?.name as string) ||
    (user?.username as string) ||
    "";

  const resolveVibrationAssetKey = () =>
    (browseAssetTag && String(browseAssetTag).trim()) ||
    (selectedAsset?.tag && String(selectedAsset.tag).trim()) ||
    (selectedAsset?.id != null ? String(selectedAsset.id) : null) ||
    selectedAsset?.label ||
    "pending-asset";

  /** Qwen-VL / local vision extract — only from Run Diagnostics spectrum upload. */
  const runVibrationVisionExtraction = async (file: File) => {
    setVibrationExtractStatus("extracting");
    setVibrationExtractError(null);
    setVibrationExtractSummary(null);
    vibrationExtractedRef.current = null;
    vibrationTrendRecordRef.current = null;
    const startTime = logPipelineStart("frontend-extract-vibration", {
      filename: file.name,
      sizeKb: (file.size / 1024).toFixed(1)
    });
    try {
      logPipelineSend("frontend-extract-vibration", { mode: "full" });
      const data = await extractVibrationDataFromImage(
        file,
        VISION_MODEL_CONFIG.endpoint,
        "full"
      );
      if (!data.spectralPeaks.length) {
        throw new Error(SPECTRAL_EXTRACTION_FAILED_MSG);
      }
      logPipelineSuccess("frontend-extract-vibration", startTime, {
        peakCount: data.spectralPeaks.length
      });

      vibrationExtractedRef.current = data;
      const record = buildVibrationDiagnosticRecord({
        assetId: resolveVibrationAssetKey(),
        extracted: data,
        component: browseComponent || null,
        timestamp: new Date().toISOString()
      });
      vibrationTrendRecordRef.current = record;
      if (record.spectral.length > 0) {
        cacheVibrationRecordLocally(record);
      }

      console.log("💾 [VIBRATION] Saving diagnostic record:", {
        assetId: record.assetId,
        timestamp: record.timestamp,
        hasSpectral: !!record.spectral?.length,
        spectralLength: record.spectral?.length,
        firstFewPeaks: record.spectral?.slice(0, 3)
      });

      setVibrationExtractSummary({
        peakCount: record.spectral.length,
        confidence: data.extractionConfidence
      });
      setVibrationExtractStatus("ready");
      toast(
        `Vibration chart extracted (${data.extractionConfidence}% confidence) · ${record.spectral.length} spectral peaks`,
        "success"
      );
    } catch (err) {
      logPipelineFail("frontend-extract-vibration", startTime, err);
      console.error("❌ [PIPELINE FAIL] Extraction failed (no fallback):", {
        kind: classifyPipelineFailure(err),
        elapsedSec: pipelineElapsedSec(startTime),
        ...pipelineErrorFields(err)
      });
      const message =
        err instanceof Error ? err.message : SPECTRAL_EXTRACTION_FAILED_MSG;
      vibrationExtractedRef.current = null;
      vibrationTrendRecordRef.current = null;
      setVibrationExtractSummary(null);
      setVibrationExtractStatus("failed");
      setVibrationExtractError(message);
      toast(
        /timed out|timeout/i.test(message)
          ? SPECTRAL_EXTRACTION_TIMEOUT_MSG
          : message,
        "warning"
      );
    }
  };

  const ingestSpectrumUpload = (file: File | null) => {
    if (!file) return;
    if (/\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
      resetChartRegions();
      const preview = ingestUpload(file, setSpectrumUpload, /\.(png|jpe?g|webp|gif)$/i);
      if (preview) void detectAndCropSpectrumCharts(preview);
      // Centralized Trend Analyzer payload — extract from spectrum image only here
      void runVibrationVisionExtraction(file);
      return;
    }
    ingestUpload(file, setSpectrumUpload, /\.(png|jpe?g|csv)$/i);
  };

  const toggleSymptom = (tag: string) => {
    setSymptomTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const exportChart = useCallback(() => {
    toast("Chart export queued (PNG/PDF) — demo mode.", "info");
  }, [toast]);

  const createWorkOrder = () => {
    const a = selectedAsset ?? EMPTY_DIAGNOSE_ASSET;
    const faultTitle =
      analysisResult?.primaryFault?.title ||
      "Outer Race Bearing Defect (BPFO)";
    onSaveReport?.(
      "Mechanical",
      `${faultTitle} — ${browseComponent || "Motor DE"}`,
      {
        asset: a.label,
        component: browseComponent,
        bearing: bearingType || a.bearing,
        rpm: vibRpm || String(a.rpm),
        bpfo_hz: String(analysisResult?.primaryFault?.frequencyHz ?? 152),
        amplitude_mm_s: "4.2",
        confidence: `${analysisResult?.primaryFault?.confidencePercent ?? 94}%`,
        ttf: analysisResult?.primaryFault?.actionWindow || "14-21 days",
        technology,
        observations: observations || symptomTags.join(", ")
      },
      {
        health_score: analysisResult?.overallHealthScore ?? 38,
        primary_fault: faultTitle,
        faults: displayFaults,
        recommendations: repairSteps,
        financialImpact: analysisResult?.financialImpact
      },
      rawUpload?.name || spectrumUpload?.name || "latest-reading.csv",
      technology
    );
    toast("Work order created from diagnostic findings.", "success");
  };

  const goToMaintenanceCalendar = () => {
    const assetLabel =
      selectedAsset?.label ||
      (browseAssetTag ? `Asset ${browseAssetTag}` : undefined);
    if (onNavigateToCalendar) {
      onNavigateToCalendar(assetLabel);
    } else {
      navigateToTab("calendar", assetLabel ? { asset: assetLabel } : undefined);
    }
  };

  const saveAndCreateWorkOrder = () => {
    createWorkOrder();
    goToMaintenanceCalendar();
  };

  const CARD =
    "bg-slate-800/30 border border-slate-700 rounded-lg p-4 backdrop-blur-sm shadow-[0_0_24px_rgba(0,0,0,0.25)]";
  const inputClass =
    "w-full min-h-[38px] rounded-lg bg-slate-950/70 border border-slate-600 px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500 transition-colors";
  const selectClass = inputClass;
  const sectionLabel = "text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block";
  const sectionTitle = "text-sm font-bold text-white tracking-tight";
  const sectionHint = "text-xs text-slate-500 mt-0.5";
  const paramLabel = "text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block";
  const paramInput =
    "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 transition-all outline-none";
  const paramSelect =
    "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 pr-10 text-sm text-white focus:border-yellow-500 transition-all outline-none appearance-none cursor-pointer";
  const techParamHint = TECH_PARAM_HINTS[activeTech];
  const processParamLabel = processParamLabelFor(
    showCustomType && customComponentType ? customComponentType : componentType
  );

  const toggleMaintenanceTag = (tag: string) => {
    const isOn = maintenanceTags.includes(tag);
    const next = isOn ? maintenanceTags.filter((t) => t !== tag) : [...maintenanceTags, tag];
    setMaintenanceTags(next);
    if (!isOn && !recentMaintenance.includes(tag)) {
      setRecentMaintenance((text) => (text.trim() ? `${text.trim()}; ${tag}` : tag));
    }
  };

  const toggleVibSection = (id: VibAccordionSection) => {
    setOpenVibSection((prev) => (prev === id ? null : id));
  };

  const isFanOrPump = /fan|blower|pump/i.test(
    showCustomType && customComponentType ? customComponentType : componentType
  );

  const handleVibUpload = (file: File) => {
    if (/\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
      ingestSpectrumUpload(file);
    } else {
      ingestUpload(file, setRawUpload, /\.(csv|wav|uff|txt)$/i);
    }
    setDataSource("upload");
  };

  const handleClearVibSpectrum = () => {
    resetChartRegions();
    vibrationExtractedRef.current = null;
    vibrationTrendRecordRef.current = null;
    setVibrationExtractStatus("idle");
    setVibrationExtractError(null);
    setVibrationExtractSummary(null);
    setSpectrumUpload((prev) => {
      if (prev?.preview) URL.revokeObjectURL(prev.preview);
      return null;
    });
  };

  const handleDataSourceSelect = (id: DataSource) => {
    setDataSource(id);
    if (realtimeTimerRef.current) {
      window.clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = null;
    }
    if (id !== "realtime") setRealtimeStatus("idle");
    if (id !== "latest") setLatestReadingMeta(null);

    if (id === "upload") {
      fileRef.current?.click();
      return;
    }
    if (id === "latest") {
      setOperatingRpm("1785");
      setLoadPercentage("82");
      setProcessParameter(componentType.toLowerCase().includes("pump") ? "420" : "95");
      setManualOverall("3.8");
      setManual1x("1.6");
      setManual2x("0.7");
      setManualPeakVue("2.1");
      setAcqFreqRange("0-10,000 Hz");
      setAcqUnits("Velocity mm/s");
      setMeasurementLocation("Motor DE");
      setAmbientTemp("74");
      setLatestReadingMeta("Mock DB · Last reading 2026-07-28 14:22 UTC · Route database");
      toast("Latest database reading loaded into measurement fields.", "success");
      return;
    }
    if (id === "realtime") {
      setRealtimeStatus("connecting");
      toast("Connecting to live sensor…", "info");
      realtimeTimerRef.current = window.setTimeout(() => {
        setRealtimeStatus("live");
        setManualOverall("4.1");
        setManual1x("1.9");
        setManual2x("0.8");
        setManualPeakVue("2.3");
        setOperatingRpm(vibRpm || "1780");
        toast("Live sensor stream connected.", "success");
        realtimeTimerRef.current = null;
      }, 1600);
    }
  };

  const xDomain: [number, number] = [0, Math.round(maxHz / zoom)];
  const yDomain: [number, number] =
    unit === "acceleration" ? [0, 2] : unit === "displacement" ? [0, 5] : [0, 10];

  const resetChartView = () => {
    setZoom(1);
    setRange("0-1000");
    setUnit("velocity");
  };

  const reportAsset = selectedAsset ?? EMPTY_DIAGNOSE_ASSET;

  return (
    <div className="min-h-full -mx-1 px-1 sm:px-0 pb-10 text-slate-100">
      <style>{`
        @keyframes techParamFade {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes hudPulse {
          0%, 100% { box-shadow: 0 0 16px rgba(234, 179, 8, 0.25); }
          50% { box-shadow: 0 0 28px rgba(234, 179, 8, 0.45); }
        }
      `}</style>

      {/* Iron Man HUD — full-page grid + waveform */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "40px 40px"
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-transparent to-slate-950/70" />
        <svg
          className="absolute bottom-0 left-0 right-0 h-36 w-full opacity-40"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="hudWave" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.2" />
              <stop offset="45%" stopColor="#fbbf24" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.25" />
            </linearGradient>
          </defs>
          <path
            d="M0 70 Q60 30 120 70 T240 70 T360 70 T480 70 T600 70 T720 70 T840 70 T960 70 T1080 70 T1200 70"
            fill="none"
            stroke="url(#hudWave)"
            strokeWidth="2"
          />
          <path
            d="M0 85 Q75 50 150 85 T300 85 T450 85 T600 85 T750 85 T900 85 T1050 85 T1200 85"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1.2"
            opacity="0.45"
          />
        </svg>
      </div>

      <div className="relative z-10 space-y-4">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400/90">
            Multi-Technology Predictive Diagnostics
          </p>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Run <span className="text-yellow-400">Advanced Diagnostic</span>
          </h1>
          <p className="text-sm text-slate-400 max-w-xl">
            Capture equipment context, observations, and measurement data — then let Spectra diagnose faults.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <span className="px-2 py-1 rounded border border-slate-700 bg-slate-900/60">ISO 13373</span>
          <span className="px-2 py-1 rounded border border-slate-700 bg-slate-900/60">ISO 10816-3</span>
          <span className="px-2 py-1 rounded border border-yellow-500/40 bg-yellow-500/10 text-yellow-300 shadow-yellow-500/20 shadow-sm">
            Automated
          </span>
        </div>
      </header>

      {!showResults && (
        <div className="space-y-4">
          {/* 1 — Technology Selector */}
          <section className="bg-slate-900/50 border border-white/80 rounded-xl p-4 space-y-3 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all">
            <div>
              <h2 className={sectionTitle}>Technology</h2>
              <p className={sectionHint}>Select diagnostic modality</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {TECH_CARDS.map(({ id, title, description, Icon, iconClass }) => {
                const active = activeTech === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setActiveTech(id);
                      setShowResults(false);
                    }}
                    className={`min-h-[160px] h-40 p-4 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-all ${
                      active
                        ? "border-yellow-500 bg-yellow-500/10"
                        : "bg-slate-800/50 border-white/80 hover:border-yellow-500 hover:bg-slate-800"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg border flex items-center justify-center mb-2 mx-auto shrink-0 ${iconClass}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-bold text-white text-center leading-tight">{title}</p>
                    <p className="text-[11px] text-slate-400 text-center mt-1 leading-snug">
                      {description}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2 — Equipment Hierarchy */}
          <section className="bg-slate-900/50 border border-white/80 rounded-xl p-4 space-y-3 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all">
            <div>
              <h2 className={sectionTitle}>Equipment Selection</h2>
              <p className={sectionHint}>Route → Asset → Component</p>
            </div>

            {!hasEquipment ? (
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 space-y-3">
                <p className="text-sm text-amber-100 leading-relaxed">
                  ⚠️ No equipment found in database. Add equipment in Equipment DB or click
                  &apos;Load Demo Data&apos;.
                </p>
                <button
                  type="button"
                  onClick={handleLoadDemoEquipment}
                  className="min-h-[40px] px-4 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-sm font-bold cursor-pointer hover:bg-cyan-500/30 transition-colors"
                >
                  🧪 Load Demo Data
                </button>
              </div>
            ) : (
              <>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <p className="text-[11px] text-slate-500">
                Sync from your last Equipment DB tree selection
              </p>
              <button
                type="button"
                onClick={handlePrefillActiveDbSelection}
                className="min-h-[36px] px-3 rounded-lg bg-amber-500/15 border border-amber-400/50 text-amber-300 text-xs font-bold cursor-pointer hover:bg-amber-500/25 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Zap className="h-3.5 w-3.5" />
                Pre-fill Active DB Selection
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block min-w-0">
                <span className={sectionLabel}>Select Route</span>
                <div className="relative">
                  <select
                    value={browseRoute}
                    onChange={(e) => {
                      const route = e.target.value;
                      setBrowseRoute(route);
                      const first = diagnoseAssets.find((a) => a.route === route);
                      setBrowseAssetTag(first?.tag ?? "");
                      setBrowseComponent(first?.components[0] ?? "");
                    }}
                    className={`${selectClass} appearance-none pr-10`}
                  >
                    <option value="">Select Route</option>
                    {routeOptions.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </label>
              <label className="block min-w-0">
                <span className={sectionLabel}>Select Asset</span>
                <div className="relative">
                  <select
                    value={browseAssetTag}
                    onChange={(e) => {
                      setBrowseAssetTag(e.target.value);
                      const asset = diagnoseAssets.find((a) => a.tag === e.target.value);
                      setBrowseComponent(asset?.components[0] ?? "");
                    }}
                    disabled={!browseRoute}
                    className={`${selectClass} appearance-none pr-10 disabled:opacity-50`}
                  >
                    <option value="">Select Asset</option>
                    {assetOptions.map((a) => (
                      <option key={a.id} value={a.tag}>{a.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </label>
              <label className="block min-w-0">
                <span className={sectionLabel}>Select Component</span>
                <div className="relative">
                  <select
                    value={browseComponent}
                    onChange={(e) => setBrowseComponent(e.target.value)}
                    disabled={!browseAssetTag}
                    className={`${selectClass} appearance-none pr-10 disabled:opacity-50`}
                  >
                    <option value="">Select Component</option>
                    {componentOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </label>
            </div>
            {selectedAsset && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-700/80 bg-slate-950/40 px-3 py-2 text-xs">
                <span className="font-mono font-bold text-yellow-400">{selectedAsset.tag}</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-300 truncate">{selectedAsset.location}</span>
                <span className="text-slate-600">|</span>
                <span className="text-cyan-300 font-semibold">{browseComponent || "—"}</span>
              </div>
            )}
              </>
            )}
          </section>

          {activeTech === "vibration" ? (
            <VibrationInputAccordions
              openSection={openVibSection}
              onToggleSection={toggleVibSection}
              isFanOrPump={isFanOrPump}
              vibRpm={vibRpm}
              setVibRpm={setVibRpm}
              driveConfig={driveConfig}
              setDriveConfig={setDriveConfig}
              drivePulleyDia={drivePulleyDia}
              setDrivePulleyDia={setDrivePulleyDia}
              drivenPulleyDia={drivenPulleyDia}
              setDrivenPulleyDia={setDrivenPulleyDia}
              centerToCenter={centerToCenter}
              setCenterToCenter={setCenterToCenter}
              beltCount={beltCount}
              setBeltCount={setBeltCount}
              gearStages={gearStages}
              setGearStages={setGearStages}
              toothZ1={toothZ1}
              setToothZ1={setToothZ1}
              toothZ2={toothZ2}
              setToothZ2={setToothZ2}
              bladeVaneCount={bladeVaneCount}
              setBladeVaneCount={setBladeVaneCount}
              bearingDe={bearingType}
              setBearingDe={(v) => {
                setBearingType(v);
                patchMachineSpec("bearingDe", v);
              }}
              bearingNde={bearingNde}
              setBearingNde={setBearingNde}
              rotorBars={rotorBars}
              setRotorBars={setRotorBars}
              statorSlots={statorSlots}
              setStatorSlots={setStatorSlots}
              lineFrequency={lineFrequency}
              setLineFrequency={setLineFrequency}
              sensorOrientation={sensorOrientation}
              setSensorOrientation={setSensorOrientation}
              sensorSensitivity={sensorSensitivity}
              setSensorSensitivity={setSensorSensitivity}
              mountingMethod={mountingMethod}
              setMountingMethod={setMountingMethod}
              fmax={fmax}
              setFmax={setFmax}
              lor={lor}
              setLor={setLor}
              windowing={windowing}
              setWindowing={setWindowing}
              averages={averages}
              setAverages={setAverages}
              loadCondition={loadCondition}
              setLoadCondition={setLoadCondition}
              loadPercentage={loadPercentage}
              setLoadPercentage={setLoadPercentage}
              recentMaintenance={recentMaintenance}
              setRecentMaintenance={setRecentMaintenance}
              maintenanceTags={maintenanceTags}
              onToggleMaintenanceTag={toggleMaintenanceTag}
              dataSource={
                dataSource === "upload" || dataSource === "realtime" || dataSource === "manual"
                  ? (dataSource as VibDataSource)
                  : "upload"
              }
              setDataSource={(v) => setDataSource(v)}
              realtimeStatus={realtimeStatus}
              onConnectIiot={() => handleDataSourceSelect("realtime")}
              uploadedFileName={spectrumUpload?.name ?? rawUpload?.name ?? null}
              spectrumPreviewUrl={spectrumUpload?.preview ?? null}
              onClearSpectrum={handleClearVibSpectrum}
              onUploadFile={handleVibUpload}
              manualOverall={manualOverall}
              setManualOverall={setManualOverall}
              manual1x={manual1x}
              setManual1x={setManual1x}
              manual2x={manual2x}
              setManual2x={setManual2x}
              manualPeakVue={manualPeakVue}
              setManualPeakVue={setManualPeakVue}
              matchedComponent={browseComponent || "Motor DE"}
              motorHp={motorHp}
              setMotorHp={setMotorHp}
              voltage={mcaVoltage}
              setVoltage={setMcaVoltage}
              measurementPoint={measurementPoint}
              setMeasurementPoint={setMeasurementPoint}
              measurementLocation={measurementLocation}
              setMeasurementLocation={setMeasurementLocation}
              rmsVelocity={rmsVelocity}
              setRmsVelocity={setRmsVelocity}
              peakAcceleration={peakAcceleration}
              setPeakAcceleration={setPeakAcceleration}
              operatingTemp={operatingTemp}
              setOperatingTemp={setOperatingTemp}
            />
          ) : activeTech === "ir" ? (
            <ThermographyInputAccordions
              onToast={(msg, type) => toast(msg, type ?? "info")}
              onTelemetryChange={setThermoTelemetry}
              onThermalFileReady={(meta) => {
                if (!meta?.name) {
                  setThermalUpload((prev) => {
                    if (prev?.preview) URL.revokeObjectURL(prev.preview);
                    return null;
                  });
                  return;
                }
                setThermalUpload((prev) => {
                  if (prev?.preview && prev.preview !== meta.preview) {
                    URL.revokeObjectURL(prev.preview);
                  }
                  return { name: meta.name, preview: meta.preview };
                });
              }}
              equipment={{
                route: browseRoute || undefined,
                assetTag: selectedAsset?.tag || browseAssetTag || undefined,
                assetLabel: selectedAsset?.label || undefined,
                component: browseComponent || undefined,
                componentType:
                  (showCustomType && customComponentType
                    ? customComponentType
                    : componentType) || undefined,
                voltage: selectedAsset?.voltage || undefined,
                location: selectedAsset?.location || undefined,
                hp: selectedAsset?.hp,
                rpm: selectedAsset?.rpm
              }}
            />
          ) : activeTech === "ultrasound" ? (
            <UltrasoundInputAccordions
              onToast={(msg, type) => toast(msg, type ?? "info")}
              onSnapshotChange={setUltrasoundSnapshot}
              equipment={{
                route: browseRoute || undefined,
                assetTag: selectedAsset?.tag || browseAssetTag || undefined,
                assetLabel: selectedAsset?.label || undefined,
                component: browseComponent || undefined,
                voltage: selectedAsset?.voltage || undefined,
                location: selectedAsset?.location || undefined,
                hp: selectedAsset?.hp,
                rpm: selectedAsset?.rpm
              }}
            />
          ) : activeTech === "mca" ? (
            <McaInputAccordions
              onToast={(msg, type) => toast(msg, type ?? "info")}
              onSnapshotChange={(snap) =>
                setMcaSnapshot((prev) => mergeMcaOperatorSnapshots(prev, snap))
              }
              equipment={{
                route: browseRoute || undefined,
                assetTag: selectedAsset?.tag || browseAssetTag || undefined,
                assetLabel: selectedAsset?.label || undefined,
                component: browseComponent || undefined,
                voltage: selectedAsset?.voltage || undefined,
                location: selectedAsset?.location || undefined,
                hp: selectedAsset?.hp,
                rpm: selectedAsset?.rpm
              }}
            />
          ) : activeTech === "oil" ? (
            <OilInputAccordions
              onToast={(msg, type) => toast(msg, type ?? "info")}
              equipment={{
                route: browseRoute || undefined,
                assetTag: selectedAsset?.tag || browseAssetTag || undefined,
                assetLabel: selectedAsset?.label || undefined,
                component: browseComponent || undefined,
                voltage: selectedAsset?.voltage || undefined,
                location: selectedAsset?.location || undefined,
                hp: selectedAsset?.hp,
                rpm: selectedAsset?.rpm
              }}
            />
          ) : (
          <>
          {/* 3 — Machine Specifications */}
          <section className="bg-slate-900/50 border border-white/80 rounded-xl p-6 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">Equipment Specifications</h2>
              <p className="text-sm text-slate-400 mt-0.5">Fault-frequency calculation inputs</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
              <label className="block min-w-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                  Name / Label
                </span>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                  <input
                    value={specName}
                    onChange={(e) => setSpecName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all outline-none"
                    placeholder="e.g., Motor DE"
                  />
                </div>
              </label>
              <label className="block min-w-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                  Component Type
                </span>
                <div className="relative">
                  <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                  <select
                    value={componentType}
                    onChange={(e) => handleComponentTypeChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-10 py-2.5 text-sm text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all outline-none appearance-none cursor-pointer"
                  >
                    {BASE_COMPONENT_TYPES.filter((t) => t !== "Other").map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                    <option value="Other">Other</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
                {showCustomType && (
                  <input
                    value={customComponentType}
                    onChange={(e) => setCustomComponentType(e.target.value)}
                    placeholder="Enter custom component type..."
                    className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all outline-none"
                  />
                )}
              </label>
              <label className="block min-w-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                  Manufacturer
                </span>
                <div className="relative">
                  <Factory className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                  <input
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all outline-none"
                    placeholder="e.g., SKF / Siemens"
                  />
                </div>
              </label>
            </div>

            <div className="flex flex-wrap gap-2 mb-4 border-b border-slate-800 pb-2">
              {specTabs.map((t) => {
                const on = specTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSpecTab(t.id)}
                    className={`px-4 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                      on
                        ? "bg-yellow-500 text-slate-900 font-bold"
                        : "bg-transparent text-slate-400 border border-slate-700 hover:text-white"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeSpecFields.map((field) => (
                <div key={field.key}>
                  <InlineSpecField
                    field={field}
                    value={machineSpecs[field.key] ?? ""}
                    onChange={(v) => patchMachineSpec(field.key, v)}
                  />
                </div>
              ))}
              {activeSpecFields.length === 0 && (
                <p className="text-xs text-slate-500 md:col-span-2">No fields for this tab.</p>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800 space-y-3">
              <div>
                <h3 className="text-xs font-bold text-white tracking-tight">Machine Configuration</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Mounting, coupling, and drive arrangement</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <label className="block min-w-0">
                  <span className={paramLabel}>Mounting Type</span>
                  <div className="relative">
                    <select
                      value={machineMountingType}
                      onChange={(e) => setMachineMountingType(e.target.value)}
                      className={paramSelect}
                    >
                      {MACHINE_MOUNTING_TYPES.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                  </div>
                </label>
                <label className="block min-w-0">
                  <span className={paramLabel}>Coupling Type</span>
                  <div className="relative">
                    <select
                      value={couplingType}
                      onChange={(e) => setCouplingType(e.target.value)}
                      className={paramSelect}
                    >
                      {COUPLING_TYPES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                  </div>
                </label>
                <label className="block min-w-0">
                  <span className={paramLabel}>Drive Type</span>
                  <div className="relative">
                    <select
                      value={driveType}
                      onChange={(e) => setDriveType(e.target.value)}
                      className={paramSelect}
                    >
                      {DRIVE_TYPES.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                  </div>
                </label>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-800">
              Live summary:{" "}
              <span className="text-slate-300 font-semibold">
                {bearingType} • {vibRpm} RPM • {motorHp} HP • {isoZone}
                {showCustomType && customComponentType ? ` • ${customComponentType}` : ""}
              </span>
            </p>
          </section>

          {/* 4a — Operating Parameters at Time of Measurement */}
          <section className="bg-slate-900/50 border border-white/80 rounded-xl p-6 mb-6 space-y-4 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all">
            <div>
              <h2 className={sectionTitle}>Operating Parameters at Time of Measurement</h2>
              <p className={sectionHint}>Capture speed, load, and process conditions during acquisition</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block min-w-0">
                <span className={paramLabel}>Operating Speed (RPM)</span>
                <input
                  type="number"
                  value={operatingRpm}
                  onChange={(e) => {
                    setOperatingRpm(e.target.value);
                    setVibRpm(e.target.value);
                  }}
                  placeholder="e.g., 1780"
                  className={paramInput}
                />
              </label>
              <label className="block min-w-0">
                <span className={paramLabel}>Load Percentage</span>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={loadPercentage}
                    onChange={(e) => setLoadPercentage(e.target.value)}
                    placeholder="e.g., 85"
                    className={`${paramInput} pr-8`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">%</span>
                </div>
              </label>
              <label className="block min-w-0">
                <span className={paramLabel}>{processParamLabel}</span>
                <input
                  type="text"
                  value={processParameter}
                  onChange={(e) => setProcessParameter(e.target.value)}
                  placeholder="Enter process value"
                  className={paramInput}
                />
              </label>
            </div>
          </section>

          {/* 4 — Advanced Measurement Parameters (collapsible, tech-specific) */}
          <section className="mb-6 transition-all duration-300">
            <button
              type="button"
              onClick={() => setShowAdvancedParams((v) => !v)}
              className={`w-full bg-slate-900 border border-white/20 p-4 flex justify-between items-center cursor-pointer hover:bg-slate-800 transition-all duration-300 ${
                showAdvancedParams ? "rounded-t-xl" : "rounded-xl"
              }`}
              aria-expanded={showAdvancedParams}
            >
              <div className="text-left min-w-0">
                <h2 className={sectionTitle}>Advanced Measurement Parameters</h2>
                <p className={sectionHint}>
                  {showAdvancedParams ? "Click to collapse" : techParamHint}
                </p>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-300 ${
                  showAdvancedParams ? "rotate-180 text-yellow-400" : ""
                }`}
              />
            </button>

            {showAdvancedParams && (
              <div className="bg-slate-900/50 border border-t-0 border-white/20 rounded-b-xl p-6 space-y-4 transition-all duration-300">
                {activeTech === "vibration" && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="block min-w-0 sm:col-span-2">
                        <span className={paramLabel}>Load Condition</span>
                        <div className="flex flex-wrap gap-2">
                          {LOAD_OPTIONS.map((opt) => {
                            const on = loadCondition === opt;
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => setLoadCondition(opt)}
                                className={`px-3 py-1.5 rounded-md text-xs cursor-pointer transition-all border ${
                                  on
                                    ? "bg-yellow-500 text-slate-900 border-yellow-500 font-bold"
                                    : "bg-slate-950 border-slate-700 text-slate-400 hover:border-yellow-500"
                                }`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                        <p className="mt-1.5 text-[10px] text-slate-500">Select the machine load during measurement</p>
                      </div>

                      <label className="block min-w-0">
                        <span className={paramLabel}>Operating Speed (RPM)</span>
                        <input
                          type="number"
                          value={operatingRpm}
                          onChange={(e) => {
                            setOperatingRpm(e.target.value);
                            setVibRpm(e.target.value);
                          }}
                          placeholder="e.g., 1780"
                          className={paramInput}
                        />
                      </label>

                      <label className="block min-w-0">
                        <span className={paramLabel}>Frequency Range</span>
                        <div className="relative">
                          <select
                            value={acqFreqRange}
                            onChange={(e) => setAcqFreqRange(e.target.value)}
                            className={paramSelect}
                          >
                            {ACQ_FREQ_OPTIONS.map((f) => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                        </div>
                      </label>

                      <label className="block min-w-0">
                        <span className={paramLabel}>Sensor Mounting</span>
                        <div className="relative">
                          <select
                            value={mountingMethod}
                            onChange={(e) => setMountingMethod(e.target.value)}
                            className={paramSelect}
                          >
                            {MOUNTING_METHODS.map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                        </div>
                        <p className="mt-1.5 text-[10px] text-slate-500">Stud mount recommended for &gt;10kHz measurements</p>
                      </label>

                      <label className="block min-w-0">
                        <span className={paramLabel}>Sensor Sensitivity</span>
                        <input
                          type="text"
                          value={sensorSensitivity}
                          onChange={(e) => setSensorSensitivity(e.target.value)}
                          placeholder="e.g., 100 mV/g"
                          className={paramInput}
                        />
                      </label>

                      <label className="block min-w-0">
                        <span className={`${paramLabel} flex items-center gap-2 flex-wrap`}>
                          Measurement Location
                          <span className="normal-case tracking-normal font-semibold text-[9px] px-1.5 py-0.5 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-300">
                            Triaxial: H, V, Axial
                          </span>
                        </span>
                        <div className="relative">
                          <select
                            value={measurementLocation}
                            onChange={(e) => setMeasurementLocation(e.target.value)}
                            className={paramSelect}
                          >
                            {MEASUREMENT_LOCATIONS.map((loc) => (
                              <option key={loc} value={loc}>{loc}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                        </div>
                      </label>

                      <label className="block min-w-0">
                        <span className={paramLabel}>Measurement Units</span>
                        <div className="relative">
                          <select
                            value={acqUnits}
                            onChange={(e) => setAcqUnits(e.target.value)}
                            className={paramSelect}
                          >
                            {ACQ_UNIT_OPTIONS.map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                        </div>
                      </label>

                      <label className="block min-w-0">
                        <span className={paramLabel}>Ambient Temperature</span>
                        <div className="relative">
                          <input
                            type="number"
                            value={ambientTemp}
                            onChange={(e) => setAmbientTemp(e.target.value)}
                            placeholder="°F"
                            className={`${paramInput} pr-10`}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">°F</span>
                        </div>
                      </label>

                      <label className="block min-w-0">
                        <span className={paramLabel}>Relative Humidity (%)</span>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={envHumidity}
                            onChange={(e) => setEnvHumidity(e.target.value)}
                            placeholder="e.g., 45"
                            className={`${paramInput} pr-8`}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">%</span>
                        </div>
                      </label>

                      <label className="block min-w-0">
                        <span className={paramLabel}>Atmospheric Pressure</span>
                        <div className="relative">
                          <input
                            type="number"
                            value={atmPressure}
                            onChange={(e) => setAtmPressure(e.target.value)}
                            placeholder="e.g., 1013"
                            className={`${paramInput} pr-12`}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">mbar</span>
                        </div>
                      </label>

                      <label className="block min-w-0">
                        <span className={paramLabel}>Machine Criticality</span>
                        <div className="relative">
                          <select
                            value={machineCriticality}
                            onChange={(e) => setMachineCriticality(e.target.value)}
                            className={paramSelect}
                          >
                            {CRITICALITY_OPTIONS.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                        </div>
                      </label>

                      <label className="block min-w-0">
                        <span className={paramLabel}>Time Since Last Service</span>
                        <input
                          type="text"
                          value={timeSinceService}
                          onChange={(e) => setTimeSinceService(e.target.value)}
                          placeholder="e.g., 4,500 hours"
                          className={paramInput}
                        />
                      </label>
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-700/80 bg-slate-950/40 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Baseline Comparison</p>
                        <p className="text-sm text-slate-200 mt-0.5">Compare with baseline &amp; previous readings</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={compareBaseline}
                        onClick={() => setCompareBaseline((v) => !v)}
                        className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors shrink-0 ${
                          compareBaseline ? "bg-yellow-500" : "bg-slate-700"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                            compareBaseline ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  </>
                )}

                {activeTech === "ir" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <label className="block min-w-0 sm:col-span-2 lg:col-span-1">
                      <span className={paramLabel}>Emissivity</span>
                      <div className="space-y-2">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={irEmissivity}
                          onChange={(e) => setIrEmissivity(e.target.value)}
                          className="w-full accent-yellow-500 cursor-pointer"
                        />
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={irEmissivity}
                          onChange={(e) => setIrEmissivity(e.target.value)}
                          className={paramInput}
                        />
                      </div>
                    </label>
                    <label className="block min-w-0">
                      <span className={paramLabel}>Reflected Background Temp</span>
                      <div className="relative">
                        <input
                          type="number"
                          value={irReflectedTemp}
                          onChange={(e) => setIrReflectedTemp(e.target.value)}
                          className={`${paramInput} pr-10`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">°F</span>
                      </div>
                    </label>
                    <label className="block min-w-0">
                      <span className={paramLabel}>Distance to Target</span>
                      <div className="relative">
                        <input
                          type="number"
                          value={irDistance}
                          onChange={(e) => setIrDistance(e.target.value)}
                          className={`${paramInput} pr-12`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">ft</span>
                      </div>
                    </label>
                    <label className="block min-w-0">
                      <span className={paramLabel}>Relative Humidity</span>
                      <div className="relative">
                        <input
                          type="number"
                          value={irHumidity}
                          onChange={(e) => setIrHumidity(e.target.value)}
                          className={`${paramInput} pr-8`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">%</span>
                      </div>
                    </label>
                    <label className="block min-w-0">
                      <span className={paramLabel}>Atmospheric Temp</span>
                      <div className="relative">
                        <input
                          type="number"
                          value={irAtmosphericTemp}
                          onChange={(e) => setIrAtmosphericTemp(e.target.value)}
                          className={`${paramInput} pr-10`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">°F</span>
                      </div>
                    </label>
                    <label className="block min-w-0">
                      <span className={paramLabel}>Atmospheric Pressure</span>
                      <div className="relative">
                        <input
                          type="number"
                          value={atmPressure}
                          onChange={(e) => setAtmPressure(e.target.value)}
                          placeholder="e.g., 1013"
                          className={`${paramInput} pr-12`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">mbar</span>
                      </div>
                      <p className="mt-1.5 text-[10px] text-slate-500">Critical for long-range IR path correction</p>
                    </label>
                  </div>
                )}

                {activeTech === "ultrasound" && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <label className="block min-w-0">
                      <span className={paramLabel}>Frequency (kHz)</span>
                      <div className="relative">
                        <select
                          value={usFrequency}
                          onChange={(e) => setUsFrequency(e.target.value)}
                          className={paramSelect}
                        >
                          {ULTRASOUND_FREQ_OPTIONS.map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                      </div>
                    </label>
                    <label className="block min-w-0">
                      <span className={paramLabel}>Gain (dB)</span>
                      <input
                        type="number"
                        value={usGain}
                        onChange={(e) => setUsGain(e.target.value)}
                        placeholder="e.g., 30"
                        className={paramInput}
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className={paramLabel}>Measurement Type</span>
                      <div className="relative">
                        <select
                          value={usMeasType}
                          onChange={(e) => setUsMeasType(e.target.value)}
                          className={paramSelect}
                        >
                          {ULTRASOUND_MEAS_TYPES.filter((t) =>
                            t === "dBuV" || t === "RMS" || t === "Peak" || t === "Time Waveform"
                          ).map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                      </div>
                      <p className="mt-1.5 text-[10px] text-slate-500">dBuV / RMS preferred for trending</p>
                    </label>
                  </div>
                )}

                {activeTech === "mca" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <label className="block min-w-0">
                      <span className={paramLabel}>Voltage</span>
                      <div className="relative">
                        <select
                          value={mcaParamVoltage}
                          onChange={(e) => setMcaParamVoltage(e.target.value)}
                          className={paramSelect}
                        >
                          {MCA_VOLTAGE_OPTIONS.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                      </div>
                    </label>
                    <label className="block min-w-0">
                      <span className={paramLabel}>Horsepower (HP)</span>
                      <input type="number" value={mcaHp} onChange={(e) => setMcaHp(e.target.value)} className={paramInput} />
                    </label>
                    <label className="block min-w-0">
                      <span className={paramLabel}>Resistance (Ohms)</span>
                      <input type="number" value={mcaResistance} onChange={(e) => setMcaResistance(e.target.value)} className={paramInput} />
                    </label>
                    <label className="block min-w-0">
                      <span className={paramLabel}>Inductance (mH)</span>
                      <input type="number" value={mcaInductance} onChange={(e) => setMcaInductance(e.target.value)} className={paramInput} />
                    </label>
                    <label className="block min-w-0">
                      <span className={paramLabel}>Phase Angle (Degrees)</span>
                      <input type="number" value={mcaPhaseAngle} onChange={(e) => setMcaPhaseAngle(e.target.value)} className={paramInput} />
                    </label>
                    <label className="block min-w-0">
                      <span className={paramLabel}>Insulation Resistance (Megohms)</span>
                      <input type="number" value={mcaInsulation} onChange={(e) => setMcaInsulation(e.target.value)} className={paramInput} />
                    </label>
                  </div>
                )}

                {activeTech === "oil" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <label className="block min-w-0">
                      <span className={paramLabel}>Viscosity Grade</span>
                      <div className="relative">
                        <select
                          value={oilViscosity}
                          onChange={(e) => setOilViscosity(e.target.value)}
                          className={paramSelect}
                        >
                          {OIL_VG_OPTIONS.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                      </div>
                    </label>
                    <label className="block min-w-0">
                      <span className={paramLabel}>Water Content (ppm)</span>
                      <input type="number" value={oilWater} onChange={(e) => setOilWater(e.target.value)} placeholder="ppm" className={paramInput} />
                    </label>
                    <label className="block min-w-0">
                      <span className={paramLabel}>Total Acid Number (TAN)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={oilTan}
                        onChange={(e) => setOilTan(e.target.value)}
                        placeholder="mg KOH/g"
                        className={paramInput}
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className={paramLabel}>Particle Count (ISO code)</span>
                      <input
                        type="text"
                        value={oilParticleCount}
                        onChange={(e) => setOilParticleCount(e.target.value)}
                        placeholder="ISO 4406 e.g. 18/16/13"
                        className={paramInput}
                      />
                    </label>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 5 — Data Source Selection */}
          <section className="bg-slate-900/50 border border-white/80 rounded-xl p-4 space-y-3 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all">
            <div>
              <h2 className={sectionTitle}>Data Source</h2>
              <p className={sectionHint}>Specify where measurement data is coming from</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {DATA_SOURCE_CARDS.map(({ id, title, description, Icon, iconClass, badge }) => {
                const active = dataSource === id;
                const connecting = id === "realtime" && realtimeStatus === "connecting";
                const live = id === "realtime" && realtimeStatus === "live";
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleDataSourceSelect(id)}
                    className={`relative min-h-[120px] p-4 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-all ${
                      active
                        ? "border-yellow-500 bg-yellow-500/10"
                        : "bg-slate-800/50 border-white/80 hover:border-yellow-500 hover:bg-slate-800"
                    }`}
                  >
                    {badge && (
                      <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-400">
                        {badge}
                      </span>
                    )}
                    {live && (
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Live
                      </span>
                    )}
                    <div className={`w-10 h-10 rounded-lg border flex items-center justify-center mb-2 ${iconClass}`}>
                      {connecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
                    </div>
                    <p className="text-sm font-bold text-white text-center leading-tight">
                      {connecting ? "Connecting…" : title}
                    </p>
                    <p className="text-[11px] text-slate-400 text-center mt-1 leading-snug">{description}</p>
                  </button>
                );
              })}
            </div>
            {latestReadingMeta && dataSource === "latest" && (
              <p className="text-xs text-emerald-400/90 border border-emerald-500/30 bg-emerald-500/10 rounded-lg px-3 py-2">
                {latestReadingMeta}
              </p>
            )}
            {dataSource === "realtime" && realtimeStatus === "live" && (
              <p className="text-xs text-cyan-300 border border-cyan-500/30 bg-cyan-500/10 rounded-lg px-3 py-2 inline-flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                Live sensor stream active — amplitudes updating from mock feed
              </p>
            )}
            {rawUpload && dataSource === "upload" && (
              <p className="text-xs text-yellow-300 border border-yellow-500/30 bg-yellow-500/10 rounded-lg px-3 py-2">
                Uploaded: {rawUpload.name}
              </p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.wav,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                ingestUpload(f, setRawUpload, /\.(csv|wav|xlsx?)$/i);
                setDataSource("upload");
                toast(`File ready: ${f.name}`, "success");
              }}
            />
          </section>

          {/* 6 — Manual Measurement Inputs (conditional) */}
          {dataSource === "manual" && (
            <section className="bg-slate-900/50 border border-white/80 rounded-xl p-4 space-y-3 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all">
              <div>
                <h2 className={sectionTitle}>Manual Measurement Inputs</h2>
                <p className={sectionHint}>Enter Overall, 1X, 2X, and PeakVue values</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className={paramLabel}>Overall Velocity (mm/s)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={manualOverall}
                    onChange={(e) => setManualOverall(e.target.value)}
                    placeholder="e.g., 4.2"
                    className={paramInput}
                  />
                </label>
                <label className="block">
                  <span className={paramLabel}>1X Amplitude (mm/s)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={manual1x}
                    onChange={(e) => setManual1x(e.target.value)}
                    placeholder="e.g., 1.8"
                    className={paramInput}
                  />
                </label>
                <label className="block">
                  <span className={paramLabel}>2X Amplitude (mm/s)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={manual2x}
                    onChange={(e) => setManual2x(e.target.value)}
                    placeholder="e.g., 0.9"
                    className={paramInput}
                  />
                </label>
                <label className="block">
                  <span className={paramLabel}>PeakVue / Peak Acceleration (g)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={manualPeakVue}
                    onChange={(e) => setManualPeakVue(e.target.value)}
                    placeholder="e.g., 2.4"
                    className={paramInput}
                  />
                </label>
              </div>
            </section>
          )}

          {/* 8 — Observations & File Uploads (side by side) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            <section className="bg-slate-900/50 border border-white/80 rounded-xl p-4 space-y-3 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all">
              <div>
                <h2 className={sectionTitle}>Observed Symptoms</h2>
                <p className={sectionHint}>Field notes and common tags</p>
              </div>
              <textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Describe what you're seeing or hearing (e.g., 'High-pitched whine from motor drive end', 'Excessive vibration at 10 AM')"
                className="w-full h-28 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all outline-none resize-y"
              />
              <div className="flex flex-wrap gap-1.5">
                {SYMPTOM_TAGS.map((tag) => {
                  const on = symptomTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleSymptom(tag)}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold border cursor-pointer transition-all duration-200 hover:scale-105 ${
                        on
                          ? "bg-yellow-500/15 border-yellow-500 text-yellow-300 shadow-yellow-500/20 shadow-sm"
                          : "bg-slate-950/60 border-slate-600 text-slate-400 hover:border-yellow-500/50 hover:text-slate-200"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="bg-slate-900/50 border border-white/80 rounded-xl p-4 space-y-3 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all">
              <div>
                <h2 className={sectionTitle}>Upload Diagnostic Data</h2>
                <p className={sectionHint}>Spectrum, thermal, or raw files</p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <UploadZone
                  icon={<BarChart3 className="h-6 w-6 text-yellow-400" />}
                  title="Vibration Spectrum"
                  hint="Upload spectrum image or CSV"
                  file={spectrumUpload}
                  onClick={() => spectrumRef.current?.click()}
                  onDropFile={(f) => ingestSpectrumUpload(f)}
                />
                <UploadZone
                  icon={<Image className="h-6 w-6 text-red-400" />}
                  title="IR Image"
                  hint="Upload thermal image"
                  file={thermalUpload}
                  onClick={() => thermalRef.current?.click()}
                  onDropFile={(f) =>
                    ingestUpload(f, setThermalUpload, /\.(png|jpe?g|gif|webp|tiff?)$/i)
                  }
                />
                <UploadZone
                  icon={<FileText className="h-6 w-6 text-cyan-400" />}
                  title="Raw Data"
                  hint="Upload raw files"
                  file={rawUpload}
                  onClick={() => rawRef.current?.click()}
                  onDropFile={(f) => ingestUpload(f, setRawUpload, /\.(csv|wav|txt)$/i)}
                />
              </div>
              {(vibrationExtractStatus !== "idle" || vibrationExtractError) && (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    vibrationExtractStatus === "extracting"
                      ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                      : vibrationExtractStatus === "ready"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  }`}
                >
                  {vibrationExtractStatus === "extracting" && (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      {AI_LOADING_MESSAGES[currentMessageIndex]}
                    </span>
                  )}
                  {vibrationExtractStatus === "ready" && vibrationExtractSummary && (
                      <span className="inline-flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        Trend record ready — {vibrationExtractSummary.peakCount}{" "}
                        spectral peaks · {vibrationExtractSummary.confidence}%
                        confidence. Cached for Trend Analyzer; PostgreSQL on Run
                        Diagnostics.
                      </span>
                    )}
                  {vibrationExtractStatus === "failed" && (
                    <span>
                      {vibrationExtractError ||
                        "Vision extraction failed. You can still run diagnostics."}
                    </span>
                  )}
                </div>
              )}
              {vibrationExtractStatus === "extracting" && (
                <div className="p-6 bg-slate-800/50 rounded-xl border border-cyan-500/30 mt-6">
                  <Loader2 className="animate-spin text-cyan-400 w-12 h-12 mx-auto mb-4" />
                  <p className="text-cyan-400 font-semibold text-center">
                    {AI_LOADING_MESSAGES[currentMessageIndex]}
                  </p>
                  <p className="text-xs text-slate-400 text-center mt-2">
                    This may take up to 60 seconds for complex high-resolution spectra.
                  </p>
                </div>
              )}
              <input
                ref={spectrumRef}
                type="file"
                accept=".png,.jpg,.jpeg,.csv"
                className="hidden"
                onChange={(e) => ingestSpectrumUpload(e.target.files?.[0] ?? null)}
              />
              <input
                ref={thermalRef}
                type="file"
                accept=".png,.jpg,.jpeg,.gif,.webp,.tif,.tiff"
                className="hidden"
                onChange={(e) =>
                  ingestUpload(
                    e.target.files?.[0] ?? null,
                    setThermalUpload,
                    /\.(png|jpe?g|gif|webp|tiff?)$/i
                  )
                }
              />
              <input
                ref={rawRef}
                type="file"
                accept=".csv,.wav,.txt"
                className="hidden"
                onChange={(e) => ingestUpload(e.target.files?.[0] ?? null, setRawUpload, /\.(csv|wav|txt)$/i)}
              />
            </section>
          </div>

          {/* 8 — Recent Maintenance */}
          <section className="bg-slate-900/50 border border-white/80 rounded-xl p-6 mb-2 space-y-3 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all">
            <div>
              <h2 className={sectionTitle}>Recent Maintenance (Last 30 Days)</h2>
              <p className={sectionHint}>Recent work can change vibration signatures and false-positive risk</p>
            </div>
            <textarea
              value={recentMaintenance}
              onChange={(e) => setRecentMaintenance(e.target.value)}
              placeholder="Describe any recent work performed (e.g., 'Bearing replaced 2 weeks ago', 'Alignment performed', 'Lubrication added')"
              className="w-full h-24 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-yellow-500 transition-all outline-none resize-y"
            />
            <div className="flex flex-wrap gap-1.5">
              {MAINTENANCE_TAGS.map((tag) => {
                const on = maintenanceTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleMaintenanceTag(tag)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold border cursor-pointer transition-all ${
                      on
                        ? "bg-yellow-500/15 border-yellow-500 text-yellow-300"
                        : "bg-slate-950/60 border-slate-600 text-slate-400 hover:border-yellow-500/50 hover:text-slate-200"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </section>
          </>
          )}

          {/* Run Analysis */}
          <section className="space-y-3 pt-1">
            {analysisError && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/50 bg-red-950/50 px-4 py-3 text-red-100 shadow-[0_0_24px_rgba(239,68,68,0.12)]"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-300 mt-0.5" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-sm font-bold text-red-100">
                      {analysisError.title}
                    </p>
                    {analysisError.errorType && (
                      <p className="text-[10px] font-mono uppercase tracking-wider text-red-300/70">
                        {analysisError.errorType}
                      </p>
                    )}
                    <p className="text-xs text-red-200/90 leading-relaxed break-words">
                      {analysisError.message}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void handleRunAnalysis()}
                        disabled={!canRun || isAnalyzing}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-400 text-black border border-amber-300 hover:bg-amber-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 hover:border-amber-500/30 transition-all">
              <span className="font-bold uppercase tracking-wider text-[#FFC700] shrink-0">
                Hardware ROI
              </span>
              <span className="text-slate-600 hidden sm:inline">|</span>
              <span>
                Legacy quote{" "}
                <span className="text-red-400/80 line-through">-$24k</span>
              </span>
              <span className="text-slate-600">→</span>
              <span>
                Spectra sensor{" "}
                <span className="text-emerald-400 font-semibold">$600</span>
              </span>
              <span className="text-slate-600 hidden sm:inline">|</span>
              <span className="text-amber-400/90 font-medium">
                +$23,400 CapEx retained
              </span>
            </div>
            {isAnalyzing && activeTech === "vibration" && (
              <div
                className="relative overflow-hidden rounded-xl border border-cyan-500/30 bg-slate-800/50 px-4 py-3 flex items-center gap-3 shadow-[0_0_28px_rgba(34,211,238,0.18)]"
                style={{ animation: "hudPulse 1.8s ease-in-out infinite" }}
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent animate-pulse" />
                <Loader2 className="h-4 w-4 text-cyan-400 animate-spin shrink-0 relative z-10" />
                <span className="relative z-10 text-xs sm:text-sm font-semibold tracking-wide text-cyan-400">
                  {AI_LOADING_MESSAGES[currentMessageIndex]}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => void handleRunAnalysis()}
              disabled={!canRun || isAnalyzing}
              className={`w-full py-3 rounded-xl text-sm inline-flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.01] disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed disabled:hover:scale-100 ${
                runButtonReady
                  ? "bg-amber-400 hover:bg-amber-300 text-black font-bold shadow-[0_0_24px_rgba(251,191,36,0.45)]"
                  : ""
              }`}
              style={
                runButtonReady
                  ? { animation: "hudPulse 2.4s ease-in-out infinite" }
                  : undefined
              }
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Bot className="h-4 w-4" />
                  Run Advanced Diagnostic
                </>
              )}
            </button>
            {!canRun && (
              <p className="text-center text-xs text-slate-500">
                {activeTech === "vibration" && equipmentReady && !hasSpectrumImage
                  ? "Upload a spectrum chart image in Data Ingestion to enable analysis"
                  : activeTech === "ir" && equipmentReady && !hasThermalImage
                    ? "Upload a thermal image in Data Ingestion to enable analysis"
                    : activeTech === "ultrasound" &&
                        equipmentReady &&
                        !ultrasoundTelemetryValid
                      ? "Peak dBµV must be greater than or equal to RMS dBµV"
                      : "Select Route, Asset, and Component to enable analysis"}
              </p>
            )}
          </section>
        </div>
      )}


      {/* RESULTS — mutually exclusive by selectedTech (activeTech). Vibration first. */}
      {selectedTech === "vibration" && showResults && (
        <div
          ref={resultsRef}
          className="space-y-6 pb-24 lg:pb-8"
          style={{ animation: "techParamFade 0.35s ease-out" }}
        >
            <div className="flex justify-between items-center py-4 mb-6 border-b border-slate-800 gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleNewAnalysis}
                className="text-slate-400 hover:text-white text-sm font-medium flex items-center gap-2 cursor-pointer bg-transparent border-0"
              >
                ← Run New Analysis
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleExportPdf()}
                  className="border border-slate-700 text-slate-300 hover:bg-slate-800 px-3 py-2 rounded-lg text-sm flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={() => setShowManagerReport(true)}
                  className="border border-slate-700 text-slate-300 hover:bg-slate-800 px-3 py-2 rounded-lg text-sm flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Manager Report
                </button>
                {isSavingAnalysis && (
                  <span className="text-xs text-cyan-400 inline-flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving…
                  </span>
                )}
                {savedAnalysisId && !isSavingAnalysis && (
                  <span className="text-xs text-emerald-400">Saved to DB</span>
                )}
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-6 hover:border-amber-500/30 transition-all">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FFC700]">
                  Vibration Analysis Results
                </p>
                <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">
                  {reportAsset.label}
                  {browseComponent ? ` · ${browseComponent}` : ""}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {bearingType || reportAsset.bearing} · {vibRpm || reportAsset.rpm} RPM ·{" "}
                  {motorHp} HP · {mcaVoltage} · {isoZone}
                </p>
                <span className="inline-flex items-center gap-2 px-2 py-1 rounded text-xs bg-slate-800/50 text-cyan-400 border border-cyan-500/20 mt-2">
                  Data Source: {spectrumUpload?.name || "Spectrum + Kinematics"} | Point{" "}
                  {measurementPoint} | {fmax} / {lor} LoR
                  {analysisSource === "local" ? " | Local Preview" : analysisSource === "api" ? " | Consensus Engine" : ""}
                </span>
              </div>

              {/* Color-coded severity banner */}
              <div
                className={`mt-5 rounded-xl border px-4 py-3.5 flex items-center gap-3 ${banner.wrap}`}
              >
                <AlertTriangle className={`h-5 w-5 shrink-0 ${banner.icon}`} />
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-bold tracking-tight">
                    {banner.title}
                  </p>
                  <p className="text-[11px] opacity-80 mt-0.5">
                    {analysisResult?.summary ||
                      `Master Vibration AI correlated spectrum imagery with verified kinematics (DE ${
                        bearingType || reportAsset.bearing
                      } @ ${vibRpm || reportAsset.rpm} RPM).`}
                  </p>
                </div>
              </div>
            </div>

          {/* PART 2 — Executive Control & Risk Analytics */}
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: Overall Health Score */}
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 flex flex-col">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Overall Health Score
                </p>
                <div className="mt-4 flex items-center gap-4 flex-1">
                  <div className="relative h-28 w-28 shrink-0">
                    <svg
                      viewBox="0 0 36 36"
                      className={`h-full w-full -rotate-90 ${
                        apiSeverity === "NORMAL"
                          ? "drop-shadow-[0_0_16px_rgba(16,185,129,0.35)]"
                          : apiSeverity === "ANOMALY"
                            ? "drop-shadow-[0_0_16px_rgba(245,158,11,0.35)]"
                            : "drop-shadow-[0_0_16px_rgba(239,68,68,0.4)]"
                      }`}
                    >
                      <defs>
                        <linearGradient id="healthGrad" x1="0" y1="0" x2="1" y2="1">
                          <stop
                            offset="0%"
                            stopColor={
                              apiSeverity === "NORMAL"
                                ? "#34d399"
                                : apiSeverity === "ANOMALY"
                                  ? "#fbbf24"
                                  : "#f97316"
                            }
                          />
                          <stop
                            offset="100%"
                            stopColor={
                              apiSeverity === "NORMAL"
                                ? "#10b981"
                                : apiSeverity === "ANOMALY"
                                  ? "#f59e0b"
                                  : "#ef4444"
                            }
                          />
                        </linearGradient>
                      </defs>
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#1e293b"
                        strokeWidth="3.5"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="url(#healthGrad)"
                        strokeWidth="3.5"
                        strokeDasharray={`${gaugeScore}, 100`}
                        strokeLinecap="round"
                        style={{ transition: "stroke-dasharray 80ms linear" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span
                        className={`text-2xl font-black leading-none ${
                          apiSeverity === "NORMAL"
                            ? "text-emerald-400"
                            : apiSeverity === "ANOMALY"
                              ? "text-amber-400"
                              : "text-red-500"
                        }`}
                      >
                        {gaugeScore}
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`text-xl font-bold ${
                        apiSeverity === "NORMAL"
                          ? "text-emerald-400"
                          : apiSeverity === "ANOMALY"
                            ? "text-amber-400"
                            : "text-red-500"
                      }`}
                    >
                      {gaugeScore} / 100
                    </p>
                    <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                      {apiSeverity === "CRITICAL"
                        ? "Immediate attention required."
                        : apiSeverity === "ANOMALY"
                          ? "Elevated risk — plan corrective action."
                          : "Within acceptable operating envelope."}{" "}
                      {apiSeverity === "CRITICAL" && (
                        <span className="inline-flex items-center gap-1 text-red-400 font-semibold">
                          <TrendingDown className="h-3.5 w-3.5" />
                          Priority repair window.
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 2: Primary Fault Identified */}
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 flex flex-col">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Primary Fault Identified
                </p>
                <div className="mt-4 flex items-start gap-3 flex-1">
                  <div
                    className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 border ${
                      hasDetectedFaults
                        ? "bg-red-500/15 border-red-500/40"
                        : "bg-emerald-500/15 border-emerald-500/40"
                    }`}
                  >
                    {hasDetectedFaults ? (
                      <AlertTriangle className="h-6 w-6 text-red-400" />
                    ) : (
                      <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <p className="text-lg font-bold text-white leading-snug">
                      {primaryTitleDisplay}
                    </p>
                    <p className="text-sm text-slate-300 font-mono">
                      {primaryFreqDisplay}{" "}
                      <span className="text-slate-600">|</span>{" "}
                      <span className="text-emerald-400 font-semibold">
                        {primaryConfidenceDisplay}% Confidence
                      </span>{" "}
                      <span className="text-slate-600">|</span>{" "}
                      <span
                        className={`font-bold ${
                          primaryUiSeverity === "HIGH"
                            ? "text-red-400"
                            : primaryUiSeverity === "MEDIUM"
                              ? "text-amber-400"
                              : "text-emerald-400"
                        }`}
                      >
                        {primaryUiSeverity} Severity
                      </span>
                    </p>
                    <p className="text-sm text-yellow-400/90 font-semibold pt-1">
                      {primaryFault?.actionWindow ||
                        (hasDetectedFaults
                          ? "Action required within 7 days."
                          : "Continue routine monitoring.")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 3: Financial Failure Horizon */}
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 flex flex-col">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
                  Financial Failure Horizon
                </p>
                <div className="grid grid-cols-2 gap-3 flex-1">
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80 mb-1">
                      Preventive Repair
                    </p>
                    <p className="text-lg font-bold text-emerald-400">
                      {formatUsd(preventiveCost)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/80 mb-1">
                      Failure if Delayed
                    </p>
                    <p className="text-lg font-bold text-red-400">
                      {formatUsd(failureCost)}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-slate-400 mt-3 leading-relaxed">
                  <span className="text-yellow-400 font-bold">
                    ROI: {roiPercent.toLocaleString()}%
                  </span>
                  {" "}
                  <span className="text-slate-600">|</span>
                  {" "}
                  Production Downtime Loss:{" "}
                  <span className="text-white font-semibold">
                    {formatUsd(downtimeLoss)}
                  </span>
                </p>
              </div>
            </div>
          </section>

          {/* PART 3 — Multi-Fault Diagnostics */}
          <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-6 hover:border-amber-500/30 transition-all">
            <div className="mb-5">
              <h3 className="text-lg font-bold text-white">Identified Fault List</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                Prioritized by severity with confidence scores
              </p>
            </div>
            <div className="space-y-3">
              {!hasDetectedFaults ? (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-4 py-5 text-sm text-emerald-200/90">
                  No actionable fault signatures identified. Machine health is within the
                  normal operating envelope.
                </div>
              ) : (
              displayFaults.map((f) => {
                const meta = severityMeta(f.severity);
                const Icon = meta.Icon;
                return (
                  <div
                    key={f.id}
                    className={`rounded-r-xl rounded-l-sm bg-slate-950/50 p-4 ${meta.row}`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${meta.icon}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white leading-snug">{f.title}</p>
                        <p className="text-sm text-slate-400 mt-1 font-mono">
                          {f.frequency}{" "}
                          <span className="text-slate-600">|</span>{" "}
                          <span className={meta.confBadge.includes("emerald") ? "text-emerald-400" : "text-slate-300"}>
                            {f.confidence}% Confidence
                          </span>
                        </p>
                        <p className="text-sm text-slate-400 mt-2 leading-relaxed">{f.detail}</p>
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md shrink-0 ${meta.sevBadge}`}
                      >
                        {f.severity}
                      </span>
                    </div>
                  </div>
                );
              })
              )}
            </div>
          </section>

          {/* PART 4 — Deep Dive Technical Visualizations */}
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white">Deep Dive Technical Visualizations</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {chartRegionStatus === "detecting"
                    ? "Detecting chart panels with OpenAI Vision…"
                    : useCroppedFft || useCroppedTwf || useCroppedEnvelope
                      ? "Cropped from uploaded analyzer screenshot · fault markers overlaid"
                      : "Spectral proof & waveform analysis"}
                  {chartRegionError ? (
                    <span className="block text-amber-500/90 mt-0.5">{chartRegionError}</span>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSyncCursorActive((v) => !v)}
                className={`text-xs px-3 py-1 rounded border flex items-center gap-2 cursor-pointer transition-colors ${
                  syncCursorActive
                    ? "bg-slate-800 hover:bg-slate-700 text-cyan-400 border-cyan-500/30"
                    : "bg-slate-900 hover:bg-slate-800 text-slate-500 border-slate-700"
                }`}
              >
                🔗 Sync Cursor {syncCursorActive ? "Active" : "Off"}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Interactive FFT */}
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4 space-y-3 min-w-0">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <h4 className="text-sm font-bold text-white">Interactive FFT Spectrum</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ["velocity", "Velocity (mm/s)"],
                          ["acceleration", "Acceleration (g)"],
                          ["displacement", "Displacement (mils)"]
                        ] as [UnitMode, string][]
                      ).map(([u, lab]) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setUnit(u)}
                          className={`bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                            unit === u
                              ? "border-yellow-500 bg-yellow-500 !text-slate-900 hover:bg-yellow-400"
                              : "border-slate-700"
                          }`}
                        >
                          {lab}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Vibration Axis
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ["horizontal", "Horizontal"],
                          ["vertical", "Vertical"],
                          ["axial", "Axial"]
                        ] as const
                      ).map(([id, lab]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setFftAxis(id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            fftAxis === id
                              ? "bg-yellow-500 text-slate-900"
                              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                          }`}
                        >
                          {lab}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFmaxView("standard")}
                      className={`bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                        fmaxView === "standard"
                          ? "border-yellow-500 bg-yellow-500 !text-slate-900 hover:bg-yellow-400"
                          : "border-slate-700"
                      }`}
                    >
                      Standard (1 kHz)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFmaxView("highfreq")}
                      className={`bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                        fmaxView === "highfreq"
                          ? "border-yellow-500 bg-yellow-500 !text-slate-900 hover:bg-yellow-400"
                          : "border-slate-700"
                      }`}
                    >
                      High-Freq / Envelope (5 kHz)
                    </button>
                  </div>
                </div>

                <div className="h-64 w-full relative">
                  {chartRegionStatus === "detecting" && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-slate-950/70 text-xs text-cyan-300 gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Locating FFT panel…
                    </div>
                  )}
                  {useCroppedFft && croppedCharts.fft ? (
                    <CroppedChartPanel
                      title="Cropped FFT Spectrum"
                      imageUrl={croppedCharts.fft}
                      peaks={chartOverlayPeaks}
                      regionKind="fft"
                      axis={chartRegionDetection?.axisRanges?.fft}
                      className="h-64"
                      onExpand={() =>
                        setExpandedCrop({
                          kind: "fft",
                          title: "FFT Spectrum (expanded)",
                          imageUrl: croppedCharts.fft!
                        })
                      }
                    />
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={fmaxView === "highfreq" ? DEEP_FFT_DATA_HF : DEEP_FFT_DATA}
                      margin={{ top: 28, right: 48, left: 0, bottom: 8 }}
                    >
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="hz"
                        type="number"
                        domain={fmaxView === "highfreq" ? [0, 5000] : [0, 1000]}
                        ticks={
                          fmaxView === "highfreq"
                            ? [0, 1000, 2000, 3000, 4000, 5000]
                            : [0, 200, 400, 600, 800, 1000]
                        }
                        tick={{ fill: "#64748b", fontSize: 10 }}
                        axisLine={{ stroke: "#334155" }}
                        tickLine={false}
                        label={{ value: "Hz", position: "insideBottomRight", offset: -4, fill: "#64748b", fontSize: 10 }}
                      />
                      <YAxis
                        tick={{ fill: "#64748b", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                        domain={[0, 10]}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0f172a",
                          border: "1px solid #334155",
                          borderRadius: 8,
                          fontSize: 12
                        }}
                        labelFormatter={(v) => `${v} Hz`}
                      />
                      <ReferenceLine
                        y={4.5}
                        stroke="#ef4444"
                        strokeDasharray="3 3"
                        label={{
                          value: "ISO 10816-3 Limit (4.5 mm/s)",
                          position: "right",
                          fill: "#ef4444",
                          fontSize: 10
                        }}
                      />
                      {fmaxView === "standard" && (
                        <ReferenceLine
                          x={150}
                          stroke="#ef4444"
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                          label={{
                            value: "152 Hz - BPFO (Outer Race)",
                            fill: "#f87171",
                            fontSize: 10,
                            position: "insideTopLeft"
                          }}
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="baseline"
                        stroke="#64748b"
                        strokeWidth={1.5}
                        strokeDasharray="5 4"
                        dot={false}
                        name="Healthy baseline"
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="measured"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: "#ef4444", stroke: "#fff", strokeWidth: 1 }}
                        name="Measured spectrum"
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                  {useCroppedFft ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-cyan-300">
                        <span className="h-2 w-2 rounded-sm bg-cyan-400" /> Cropped FFT image
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-red-400">
                        <span className="h-2 w-2 rounded-full bg-red-500" /> Vision peak markers
                      </span>
                    </>
                  ) : (
                    <>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-0.5 w-4 bg-cyan-400 rounded" /> Measured spectrum
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-0.5 w-4 border-t-2 border-dashed border-slate-500" /> Healthy baseline
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-red-400">
                    <span className="h-2 w-2 rounded-full bg-red-500" /> Fault highlight
                  </span>
                    </>
                  )}
                </div>
              </div>

              {/* Right: TWF + Envelope */}
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4 space-y-4 min-w-0">
                <h4 className="text-sm font-bold text-white">Time Waveform (TWF)</h4>
                <div className="h-32 w-full relative">
                  {useCroppedTwf && croppedCharts.twf ? (
                    <CroppedChartPanel
                      title="Cropped Time Waveform"
                      imageUrl={croppedCharts.twf}
                      peaks={[]}
                      regionKind="twf"
                      axis={chartRegionDetection?.axisRanges?.twf}
                      className="h-32"
                      onExpand={() =>
                        setExpandedCrop({
                          kind: "twf",
                          title: "Time Waveform (expanded)",
                          imageUrl: croppedCharts.twf!
                        })
                      }
                    />
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={TWF_DATA} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                      <XAxis dataKey="t" hide />
                      <YAxis tick={{ fill: "#64748b", fontSize: 10 }} width={32} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          background: "#0f172a",
                          border: "1px solid #334155",
                          borderRadius: 8,
                          fontSize: 12
                        }}
                      />
                      {syncCursorActive && (
                        <ReferenceLine x={15} stroke="#22d3ee" strokeDasharray="3 3" />
                      )}
                      <Line
                        type="monotone"
                        dataKey="amp"
                        stroke="#eab308"
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300 border border-slate-800 rounded-lg bg-slate-900/60 px-3 py-2">
                  <span>
                    Peak-to-Peak: <span className="font-bold text-white">18.4 mm/s</span>
                  </span>
                  <span className="text-slate-600">|</span>
                  <span>
                    Crest Factor:{" "}
                    <span className="font-bold text-yellow-400">4.2 (High)</span>
                  </span>
                  <span className="text-slate-600">|</span>
                  <span>
                    RMS: <span className="font-bold text-white">4.2 mm/s</span>
                  </span>
                </div>

                <h4 className="text-sm font-bold text-white pt-1">Demodulated / Enveloped Spectrum</h4>
                <div className="h-40 w-full relative">
                  {useCroppedEnvelope && croppedCharts.envelope ? (
                    <CroppedChartPanel
                      title="Cropped Envelope Spectrum"
                      imageUrl={croppedCharts.envelope}
                      peaks={chartOverlayPeaks}
                      regionKind="envelope"
                      axis={chartRegionDetection?.axisRanges?.envelope}
                      className="h-40"
                      onExpand={() =>
                        setExpandedCrop({
                          kind: "envelope",
                          title: "Demodulated / Enveloped Spectrum (expanded)",
                          imageUrl: croppedCharts.envelope!
                        })
                      }
                    />
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={ENVELOPE_DATA} margin={{ top: 8, right: 72, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                      <XAxis dataKey="hz" hide />
                      <YAxis
                        domain={[0, 4]}
                        tick={{ fill: "#64748b", fontSize: 10 }}
                        width={32}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0f172a",
                          border: "1px solid #334155",
                          borderRadius: 8,
                          fontSize: 12
                        }}
                        labelFormatter={(v) => `${v} Hz`}
                      />
                      <ReferenceLine
                        y={1.0}
                        stroke="#eab308"
                        strokeDasharray="3 3"
                        label={{
                          value: "1.0 gE (Warning)",
                          position: "right",
                          fill: "#eab308",
                          fontSize: 10
                        }}
                      />
                      <ReferenceLine
                        y={2.5}
                        stroke="#ef4444"
                        strokeDasharray="3 3"
                        label={{
                          value: "2.5 gE (Danger)",
                          position: "right",
                          fill: "#ef4444",
                          fontSize: 10
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="amp"
                        stroke="#eab308"
                        fill="#eab308"
                        fillOpacity={0.2}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-4">
              {useCroppedFft || useCroppedTwf || useCroppedEnvelope
                ? "Chart panels were cropped from the uploaded analyzer screenshot. Peak markers use Vision-extracted frequencies when available."
                : "Hovering over an impact peak in the TWF automatically highlights the corresponding frequency component in the FFT spectrum."}
            </p>
          </section>

          {/* PART 5 — Prescriptive Action Plan & Verification */}
          <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-6 hover:border-amber-500/30 transition-all">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Repair procedure checklist */}
              <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-5 space-y-4">
                <div>
                  <h4 className="text-lg font-bold text-white">
                    Actionable Repair Recommendations
                  </h4>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Step-by-step tasks for field technicians
                  </p>
                </div>
                <ul className="space-y-3">
                  {repairSteps.map((step, idx) => {
                    const on = !!checkedActions[step];
                    return (
                      <li key={`${idx}-${step}`}>
                        <label className="flex items-start gap-3 cursor-pointer text-sm text-slate-300 group">
                          <span
                            className={`mt-0.5 h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                              on
                                ? "bg-yellow-500 border-yellow-400 text-slate-950 shadow-md shadow-yellow-500/30"
                                : "border-slate-600 bg-slate-900 group-hover:border-yellow-500/50"
                            }`}
                          >
                            {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                          </span>
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={on}
                            onChange={() =>
                              setCheckedActions((p) => ({ ...p, [step]: !p[step] }))
                            }
                          />
                          <span className={`min-w-0 ${on ? "text-white" : ""}`}>
                            <span className="text-yellow-500/80 font-bold mr-1.5">{idx + 1}.</span>
                            {step}
                            {analysisSource !== "api" && idx === 0 && (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 border border-green-500/30 ml-2">
                                2x SKF 6320 C3 verified in Tool Crib - Bin 14A
                              </span>
                            )}
                            {analysisSource !== "api" && idx === 1 && (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 border border-red-500/30 ml-2">
                                Auto-PO generated for Alignment Shims (0 in stock)
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Right: Financial + verification */}
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-4 flex flex-col">
                <h4 className="text-lg font-bold text-white">Financial Impact &amp; ROI</h4>

                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    Preventive Repair Cost
                  </p>
                  <p className="text-2xl font-bold text-emerald-400 mt-1">
                    {formatUsd(preventiveCost)}
                  </p>
                </div>

                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                    Failure Cost if Delayed
                  </p>
                  <p className="text-2xl font-bold text-red-400 mt-1">
                    {formatUsd(failureCost)}
                  </p>
                </div>

                <p className="text-sm text-slate-400 text-center">
                  <span className="text-yellow-400 font-bold">
                    ROI: {roiPercent.toLocaleString()}%
                  </span>
                  {" "}
                  <span className="text-slate-600">|</span>
                  {" "}
                  Downtime Loss:{" "}
                  <span className="text-white font-semibold">
                    {formatUsd(downtimeLoss)}
                  </span>
                </p>

                <div className="mt-auto pt-4 border-t border-slate-800 space-y-3">
                  <div>
                    <h5 className="text-sm font-bold text-white">Post-Repair Verification</h5>
                    <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                      Save this session as a baseline. Upload a new scan after repair to verify
                      vibration drop.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSetBaseline()}
                    className="w-full min-h-[42px] px-4 rounded-lg border border-white/80 hover:border-yellow-500 hover:text-yellow-400 text-white text-sm font-bold cursor-pointer transition-colors bg-transparent"
                  >
                    Set as Baseline &amp; Schedule Verification
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* AI Procurement & BOM — between Repair Procedure and CMMS Bridge */}
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-bold text-white">AI Procurement &amp; Bill of Materials (BOM)</h3>
            <p className="text-sm text-slate-500 mt-0.5 mb-5">
              Auto-matched to P-101A Motor DE specifications
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Required Parts
                </p>
                <div className="text-sm text-slate-300 leading-snug">
                  <span>PART SKF 6320 C3 Deep Groove Ball Bearing (Qty: 2)</span>
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 border border-green-500/30 ml-2">
                    📦 2 In Stock - Allocated
                  </span>
                </div>
                <div className="text-sm text-slate-300 leading-snug">
                  <span>
                    PART Pre-Cut Stainless Steel Alignment Shim Kit (0.002&quot; - 0.050&quot;)
                    (Qty: 1 Kit)
                  </span>
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 border border-red-500/30 ml-2">
                    ⚠️ Out of Stock
                  </span>
                </div>
              </div>
              <div className="flex flex-col justify-center">
                <button
                  type="button"
                  onClick={() => toast("Alignment shim kit order queued…", "success")}
                  className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-2 rounded-lg text-sm mb-2 cursor-pointer transition-colors"
                >
                  🛒 Order Missing Alignment Shims - $85
                </button>
                <button
                  type="button"
                  onClick={() => toast("Stockroom picking ticket sent to printer…", "info")}
                  className="w-full border border-slate-700 text-white hover:bg-slate-800 py-2 rounded-lg text-sm cursor-pointer transition-colors"
                >
                  📋 Print Stockroom Picking Ticket
                </button>
              </div>
            </div>
          </section>

          {/*
            Fusion / prognosis / sign-off / CMMS run off saved records only, so
            they render exclusively for a real analysis — never for the demo
            fallback values used by the cards above.
          */}
          {analysisResult && (
            <>
              <DiagnosticsIntelligencePanel
                assetId={resolveVibrationAssetKey()}
                assetTag={
                  browseAssetTag || reportAsset.tag || reportAsset.label
                }
                component={browseComponent || ""}
                primaryFault={
                  analysisResult.primaryFault?.title ||
                  analysisResult.summary ||
                  "Unclassified finding"
                }
                severity={analysisResult.severity}
                confidencePercent={
                  analysisResult.primaryFault?.confidencePercent ?? null
                }
                healthScore={analysisResult.overallHealthScore ?? null}
                recommendations={analysisResult.repairRecommendations ?? []}
                savedAnalysisId={savedAnalysisId}
                engineerName={signOffEngineerName}
                onToast={(msg, type) => toast(msg, type ?? "info")}
                onDispatchWorkOrder={() => saveAndCreateWorkOrder()}
              />
              <CmmsPayloadBridge
                context={{
                  assetTag: browseAssetTag || reportAsset.tag || reportAsset.label,
                  component: browseComponent || "Motor DE",
                  faultTitle:
                    analysisResult.primaryFault?.title ||
                    analysisResult.summary ||
                    "Unclassified finding",
                  severity: analysisResult.severity,
                  confidencePercent:
                    analysisResult.primaryFault?.confidencePercent ?? null,
                  healthScore: analysisResult.overallHealthScore ?? null,
                  horizonHours: null,
                  horizonDriver: null,
                  horizonBasis: null,
                  corroborationPercent: null,
                  technologiesWithData: ["Vibration"],
                  signOffStatus: "pending",
                  signOffEngineer: null,
                  signOffAt: null,
                  recommendations: analysisResult.repairRecommendations ?? [],
                  diagnosisId: savedAnalysisId,
                  diagnosisAt: analysisStartedAtRef.current
                }}
                sectionId="cmms-data-bridge"
                onToast={(msg, type) => toast(msg, type ?? "info")}
              />
            </>
          )}

          <div className="flex justify-between items-center py-4 mt-6 border-t border-slate-800 gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setShowResults(false)}
              className="text-slate-400 hover:text-white text-sm font-medium flex items-center gap-2 cursor-pointer bg-transparent border-0"
            >
              ← Run New Analysis
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleExportPdf()}
                className="border border-slate-700 text-slate-300 hover:bg-slate-800 px-3 py-2 rounded-lg text-sm flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Export PDF
              </button>
              <button
                type="button"
                onClick={() => setShowManagerReport(true)}
                className="border border-slate-700 text-slate-300 hover:bg-slate-800 px-3 py-2 rounded-lg text-sm flex items-center gap-2 cursor-pointer transition-colors"
              >
                <FileText className="h-3.5 w-3.5" />
                Manager Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESULTS — Thermography (IR). Tech id is "ir" (not "thermography"). */}
      {selectedTech === "ir" && showResults && analysisResult && (
        <div ref={resultsRef}>
          <ThermographyResultsDashboard
            assetLabel={reportAsset.label}
            componentLabel={browseComponent || undefined}
            assetId={resolveVibrationAssetKey()}
            assetTag={browseAssetTag || reportAsset.tag || reportAsset.label}
            primaryFault={analysisResult.primaryFault?.title ?? ""}
            severity={analysisResult.severity ?? null}
            confidencePercent={analysisResult.primaryFault?.confidencePercent ?? null}
            healthScore={analysisResult.overallHealthScore ?? null}
            recommendations={analysisResult.repairRecommendations ?? []}
            savedAnalysisId={savedAnalysisId}
            engineerName={signOffEngineerName}
            analysis={analysisResult}
            gaugeScore={gaugeScore}
            thermalImageUrl={thermalUpload?.preview || null}
            thermalPeaks={thermographyPeaks}
            onNewAnalysis={() => {
              setShowResults(false);
              setAnalysisResult(null);
            }}
            onSaveWorkOrder={saveAndCreateWorkOrder}
            onExportPdf={() => void handleExportPdf()}
            onManagerReport={() => setShowManagerReport(true)}
            onToast={(msg, type) => toast(msg, type ?? "info")}
          />
        </div>
      )}

      {/* RESULTS — Ultrasound (UE) */}
      {selectedTech === "ultrasound" && showResults && analysisResult && (
        <div ref={resultsRef}>
          <UltrasoundResultsDashboard
            assetLabel={reportAsset.label}
            componentLabel={browseComponent || undefined}
            assetId={resolveVibrationAssetKey()}
            assetTag={browseAssetTag || reportAsset.tag || reportAsset.label}
            primaryFault={analysisResult.primaryFault?.title ?? ""}
            severity={analysisResult.severity ?? null}
            confidencePercent={analysisResult.primaryFault?.confidencePercent ?? null}
            healthScore={analysisResult.overallHealthScore ?? null}
            recommendations={analysisResult.repairRecommendations ?? []}
            savedAnalysisId={savedAnalysisId}
            engineerName={signOffEngineerName}
            analysis={analysisResult}
            gaugeScore={gaugeScore}
            ultrasoundPeaks={ultrasoundPeaks}
            onNewAnalysis={() => {
              setShowResults(false);
              setAnalysisResult(null);
            }}
            onSaveWorkOrder={saveAndCreateWorkOrder}
            onExportPdf={() => void handleExportPdf()}
            onManagerReport={() => setShowManagerReport(true)}
            onToast={(msg, type) => toast(msg, type ?? "info")}
          />
        </div>
      )}

      {/* RESULTS — MCA */}
      {selectedTech === "mca" && showResults && analysisResult && (
        <div ref={resultsRef}>
          <McaResultsDashboard
            assetLabel={reportAsset.label}
            componentLabel={browseComponent || undefined}
            assetId={resolveVibrationAssetKey()}
            assetTag={browseAssetTag || reportAsset.tag || reportAsset.label}
            primaryFault={analysisResult.primaryFault?.title ?? ""}
            severity={analysisResult.severity ?? null}
            confidencePercent={analysisResult.primaryFault?.confidencePercent ?? null}
            healthScore={analysisResult.overallHealthScore ?? null}
            recommendations={analysisResult.repairRecommendations ?? []}
            savedAnalysisId={savedAnalysisId}
            engineerName={signOffEngineerName}
            onNewAnalysis={() => setShowResults(false)}
            onSaveWorkOrder={saveAndCreateWorkOrder}
            onToast={(msg, type) => toast(msg, type ?? "info")}
          />
        </div>
      )}

      {/* RESULTS — Oil / Tribology */}
      {selectedTech === "oil" && showResults && (
        <div ref={resultsRef}>
          <OilResultsDashboard
            assetLabel={reportAsset.label}
            componentLabel={browseComponent || undefined}
            onNewAnalysis={() => setShowResults(false)}
            onSaveWorkOrder={saveAndCreateWorkOrder}
            onToast={(msg, type) => toast(msg, type ?? "info")}
            assetId={resolveVibrationAssetKey()}
            assetTag={browseAssetTag || reportAsset.tag || reportAsset.label}
            primaryFault={analysisResult?.primaryFault?.title ?? ""}
            severity={analysisResult?.severity ?? null}
            confidencePercent={
              analysisResult?.primaryFault?.confidencePercent ?? null
            }
            healthScore={analysisResult?.overallHealthScore ?? null}
            recommendations={analysisResult?.repairRecommendations}
            savedAnalysisId={savedAnalysisId}
            engineerName={signOffEngineerName}
            identifiedFaults={analysisResult?.identifiedFaults}
          />
        </div>
      )}

      {/* CROPPED CHART EXPAND MODAL */}
      {expandedCrop && (
        <CroppedChartExpandModal
          title={expandedCrop.title}
          imageUrl={expandedCrop.imageUrl}
          peaks={chartOverlayPeaks}
          regionKind={expandedCrop.kind}
          axis={chartRegionDetection?.axisRanges?.[expandedCrop.kind]}
          onClose={() => setExpandedCrop(null)}
        />
      )}

      {/* MANAGER EXECUTIVE SUMMARY */}
      {showManagerReport &&
        createPortal(
          <div
            className="fixed inset-0 z-[85] flex items-center justify-center bg-black/75 p-4"
            onClick={() => setShowManagerReport(false)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="relative w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Manager Executive Summary</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedAsset?.label || browseAssetTag || "Asset"} ·{" "}
                    {browseComponent || "Component"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowManagerReport(false)}
                  className="h-9 w-9 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-4 px-5 py-5 text-sm text-slate-300">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Health</p>
                    <p className="text-2xl font-black text-white mt-1">
                      {analysisResult?.overallHealthScore ?? gaugeScore}
                      <span className="text-sm text-slate-500"> / 100</span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Severity</p>
                    <p className="text-xl font-bold text-amber-300 mt-1">{apiSeverity}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                    Primary Finding
                  </p>
                  <p className="text-white font-semibold">{primaryTitleDisplay}</p>
                  <p className="text-slate-400 mt-1">
                    {primaryFreqDisplay} · {primaryConfidenceDisplay}% confidence
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                    Business Impact
                  </p>
                  <p>
                    Preventive: <span className="text-white font-semibold">{formatUsd(preventiveCost)}</span>
                    {" · "}
                    Failure risk:{" "}
                    <span className="text-red-300 font-semibold">{formatUsd(failureCost)}</span>
                    {" · "}
                    Downtime:{" "}
                    <span className="text-white font-semibold">{formatUsd(downtimeLoss)}</span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                    Recommended Action
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-slate-300">
                    {(repairSteps.length ? repairSteps : ["Continue routine monitoring."])
                      .slice(0, 4)
                      .map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                  </ul>
                </div>
                {analysisResult?.summary && (
                  <p className="text-slate-400 leading-relaxed border-t border-slate-800 pt-3">
                    {analysisResult.summary}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
                <button
                  type="button"
                  onClick={() => void handleExportPdf()}
                  className="px-3 py-2 rounded-lg border border-slate-700 text-slate-200 text-sm hover:bg-slate-800 cursor-pointer"
                >
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={() => setShowManagerReport(false)}
                  className="px-3 py-2 rounded-lg bg-yellow-500 text-slate-900 text-sm font-bold hover:bg-yellow-400 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* LOADING OVERLAY */}
      {isAnalyzing &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm px-4">
            {activeTech === "vibration" ? (
              <div className="p-6 bg-slate-800/50 rounded-xl border border-cyan-500/30 max-w-md w-full mx-4 shadow-2xl shadow-cyan-500/10">
                <Loader2 className="animate-spin text-cyan-400 w-12 h-12 mx-auto mb-4" />
                <p className="text-cyan-400 font-semibold text-center">
                  {AI_LOADING_MESSAGES[currentMessageIndex]}
                </p>
                <p className="text-xs text-slate-400 text-center mt-2">
                  This may take up to 60 seconds for complex high-resolution spectra.
                </p>
                <div className="mt-6 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl shadow-yellow-500/10">
                <div className="text-center">
                  <Bot className="w-12 h-12 text-yellow-500 mx-auto mb-4 animate-pulse" />
                  <h3 className="text-xl font-bold text-white mb-2">
                    Analyzing...
                  </h3>
                  <p className="text-sm text-slate-400 mb-6">
                    {`Spectra is reviewing ${reportAsset.label}`}
                  </p>
                  <div className="space-y-3 text-left">
                    {ANALYSIS_STEPS.map((s, i) => {
                      const done = i < stepIdx;
                      const active = i === stepIdx && stepIdx < ANALYSIS_STEPS.length;
                      return (
                        <div
                          key={s}
                          className={`flex items-center gap-3 ${
                            done ? "text-slate-300" : active ? "text-yellow-400" : "text-slate-500"
                          }`}
                        >
                          {done ? (
                            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : active ? (
                            <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin shrink-0" />
                          ) : (
                            <span className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />
                          )}
                          <span className="text-sm">{s}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-6 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-500 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}

      </div>
    </div>
  );
}

/* ========================================================================== */
/* Small UI bits                                                              */
/* ========================================================================== */

function SummaryCard({
  children,
  stagger = 0,
  visible = true,
  accent = "slate"
}: {
  children: React.ReactNode;
  stagger?: number;
  visible?: boolean;
  accent?: "red" | "amber" | "orange" | "slate";
}) {
  const border =
    accent === "red"
      ? "border-red-500/30"
      : accent === "amber"
        ? "border-yellow-500/30"
        : accent === "orange"
          ? "border-yellow-500/30"
          : "border-slate-700";
  return (
    <div
      className={`rounded-xl border ${border} bg-slate-800 backdrop-blur p-6 shadow-xl shadow-black/20 transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
      style={{ transitionDelay: visible ? `${stagger}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

function InlineSpecField({
  field,
  value,
  onChange
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const inputCls =
    "w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all outline-none";
  return (
    <label className="block min-w-0">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
        {field.label}
        {field.required ? <span className="text-yellow-400 ml-0.5">*</span> : null}
      </span>
      {field.kind === "select" ? (
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputCls} appearance-none cursor-pointer pr-10`}
          >
            <option value="">Select…</option>
            {(field.options ?? []).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
        </div>
      ) : (
        <input
          type={field.kind === "number" ? "number" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={inputCls}
        />
      )}
    </label>
  );
}

function UploadZone({
  icon,
  title,
  hint,
  file,
  onClick,
  onDropFile
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  file: UploadedFileMeta | null;
  onClick: () => void;
  onDropFile: (file: File) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) onDropFile(f);
      }}
      className="border-dashed border border-slate-700 rounded-lg p-3 sm:p-4 text-center hover:border-yellow-500 hover:shadow-yellow-500/10 hover:shadow-md transition-all duration-200 cursor-pointer bg-slate-950/40"
    >
      <div className="mx-auto mb-2 flex justify-center">{icon}</div>
      <p className="text-sm font-bold text-white">{title}</p>
      <p className="text-xs text-slate-400 mt-1">{file?.name || hint}</p>
      {file?.preview && (
        <img
          src={file.preview}
          alt={file.name}
          className="mt-2 mx-auto h-14 w-auto rounded border border-slate-700 object-cover"
        />
      )}
    </div>
  );
}

function ChartBtn({
  children,
  onClick,
  active,
  title
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-all duration-200 ${
        active
          ? "bg-yellow-500 text-slate-900 shadow-md shadow-yellow-500/25"
          : "bg-slate-700 hover:bg-slate-600 text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

/** Floating red tooltip annotation pinned to the BPFO peak */
function BpfoPeakLabel(props: { viewBox?: { x?: number; y?: number; width?: number; height?: number } }) {
  const x = props.viewBox?.x ?? 0;
  const y = props.viewBox?.y ?? 0;
  const width = 190;
  const height = 36;
  return (
    <g>
      {/* Pointer tick from label down toward the peak */}
      <line x1={x} y1={y + 28} x2={x} y2={y + 52} stroke="#ef4444" strokeWidth={2} />
      <foreignObject x={x - width / 2} y={Math.max(2, y - 4)} width={width} height={height}>
        <div className="flex justify-center">
          <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap ring-1 ring-red-300/40">
            152 Hz - BPFO (Outer Race)
          </span>
        </div>
      </foreignObject>
    </g>
  );
}

function SpectrumTooltip({
  active,
  payload,
  label,
  unit,
  annotations
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: number | string;
  unit: UnitMode;
  annotations: FaultAnnotation[];
}) {
  if (!active || !payload?.length) return null;
  const hz = Number(label);
  const amp = payload.find((p) => p.dataKey === "amp")?.value;
  const ann = annotations.find((a) => Math.abs(a.hz - hz) <= a.width);
  return (
    <div className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 shadow-xl max-w-[260px]">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{hz} Hz</p>
      <p className="text-sm font-bold text-white mt-0.5">
        {amp} {unitLabel(unit)}
      </p>
      {ann && (
        <div className="mt-2 pt-2 border-t border-slate-800 space-y-1 text-[11px]">
          <p className="font-bold" style={{ color: ann.color }}>
            {ann.faultType}
          </p>
          <p className="text-slate-400">
            Calculated: {ann.measuredHz} Hz (theoretical: {ann.theoreticalHz} Hz)
          </p>
          <p className="text-slate-400">
            Amplitude: {scaleAmp(ann.amplitude, unit)} {unitLabel(unit)} ({ann.isoZone})
          </p>
          <p className="text-slate-300">{ann.significance}</p>
        </div>
      )}
    </div>
  );
}
