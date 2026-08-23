import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  BarChart3,
  Check,
  ClipboardPaste,
  Clock,
  Cog,
  Download,
  Droplet,
  Droplets,
  FileText,
  Loader2,
  Mail,
  Printer,
  RotateCw,
  Search,
  Shield,
  Sparkles,
  Thermometer,
  Upload,
  Wind,
  Wrench,
  Zap
} from "lucide-react";
import { TrendDataPoint } from "../types";
import {
  fetchAnalysisResults,
  saveAnalysisResult,
  setAnalysisBaseline,
  type SavedAnalysisResult
} from "../lib/analysisPersistence";
import {
  buildThermoChartSeries,
  extractThermoChartFields,
  hottestPhaseFromPoint,
  mechanicalKpis,
  nfpaClassBadge,
  radiometricKpis,
  resolveThermoTempUnit,
  seriesHasAny,
  type ThermoChartPoint
} from "../lib/thermographyTrendSeries";
import { calculateLeakImpact } from "../lib/ultrasound/leakCalculator";
import {
  calculateAdvancedSteamLoss,
  estimateSteamOrificeFromPeakDb
} from "../lib/steam/advancedSteamCalculator";
import { calculateWindingBalance } from "../lib/mca/windingBalanceCalculator";
import {
  calculateGroundwallInsulation,
  type InsulationClass
} from "../lib/mca/groundwallCalculator";
import {
  calculateRotorInfluence,
  parseRicClipboardText,
  sanitizeRicPoint,
  toRicRadarData,
  type RicDataPoint
} from "../lib/mca/rotorInfluenceCalculator";
import {
  calculateSurgeHealth,
  parseSurgeClipboardText,
  surgeHealthFromManualEar,
  type SurgeDataPoint
} from "../lib/mca/surgeCalculator";
import {
  extractMcaDataFromFile,
  formatMcaPdfLabel,
  mcaExtractHasGroundwall,
  type McaExtractedData
} from "../lib/mca/mcaPdfExtractor";
import {
  extractMcaGroundwallFromSaved,
  extractMcaRicFromSaved,
  extractMcaWindingFromSaved,
  findLatestMcaWithGroundwall,
  MCA_GROUNDWALL_EMPTY,
  mergeGroundwallPreferPositive,
  mcaPayloadForSave,
  mcaTripletHasData
} from "../lib/mca/mcaPersistence";
import {
  deepMergeMcaSsot,
  EMPTY_MCA_SSOT,
  hasMcaSsotGroundwall,
  hasMcaSsotPhaseBalance,
  hasMcaSsotRotorInfluence,
  hasMcaSsotSurge,
  mcaGroundwallFromSsot,
  mcaSsotFromExtracted,
  mcaSsotFromSaved,
  mcaSsotToOperatorSnapshot,
  mcaWindingFromSsot,
  type McaSsotRecord
} from "../lib/mca/mcaSsot";
import {
  extractEnvelopingTrendPoint,
  extractVibrationRecordFromAnalysis,
  extractWaveformTrendPoint,
  hasSpectralPeaks,
  hasVibrationTrendCharts,
  readCachedVibrationRecord,
  type EnvelopingTrendPoint,
  type VibrationDiagnosticRecord
} from "../lib/vibration/vibrationDiagnosticRecord";
import { resolveBearingFaultFrequencies } from "../lib/vibration/bearingFaultFrequencies";
import WaveformTab from "./trendAnalyzer/WaveformTab";
import OilWearMetalsTab from "./trendAnalyzer/OilWearMetalsTab";
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
    if (
      p.phase_r != null ||
      p.phaseR != null ||
      (p.phases != null && typeof p.phases === "object") ||
      p.ir1mMOmega != null ||
      p.groundwall != null
    ) {
      return "mca";
    }
    if (String(p.type || "").toLowerCase() === "oil" || String(p.type || "").toLowerCase() === "oil_analysis")
      return "oil_analysis";
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
  crest: number | null;
  mode: string | null;
} {
  const peaks = Array.isArray(r.peaks) ? r.peaks : [];
  for (const raw of peaks) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (String(p.type || "").toLowerCase() !== "ultrasound") continue;
    const peak = Number(p.peak_dbmv ?? p.peak_dbuv);
    const rms = Number(p.rms_dbmv ?? p.rms_dbuv);
    const delta = Number(p.delta_db);
    let crest = Number(p.crest_factor ?? p.crestFactor);
    // dB space: never peak/rms — use 10^((peak−rms)/20)
    if (!Number.isFinite(crest) && Number.isFinite(peak) && Number.isFinite(rms)) {
      const cf = Math.pow(10, (peak - rms) / 20);
      if (Number.isFinite(cf) && cf > 0) {
        crest = Math.round(cf * 100) / 100;
      }
    }
    const modeRaw = p.mode != null ? String(p.mode).trim() : "";
    return {
      peak: Number.isFinite(peak) ? peak : null,
      rms: Number.isFinite(rms) ? rms : null,
      delta: Number.isFinite(delta) ? delta : null,
      crest: Number.isFinite(crest) ? crest : null,
      mode: modeRaw || null
    };
  }
  // Fallback: consensus_details.mode (older / detailed payloads)
  const cd =
    r.consensus_details && typeof r.consensus_details === "object"
      ? (r.consensus_details as Record<string, unknown>)
      : null;
  const cdMode =
    cd && (cd.mode != null || (cd.detailed && typeof cd.detailed === "object"))
      ? String(
          cd.mode ??
            (cd.detailed as Record<string, unknown>)?.mode ??
            ""
        ).trim()
      : "";
  return {
    peak: null,
    rms: null,
    delta: null,
    crest: null,
    mode: cdMode || null
  };
}

/** Bearings & Mechanical tab — mechanical / bearing modes (legacy untagged included). */
function isUeBearingMechanicalRow(r: SavedAnalysisResult): boolean {
  const { mode } = uePeaksFromRow(r);
  const m = (mode || "").toLowerCase();
  if (!m) return true;
  if (m === "mechanical" || m === "bearing" || m === "bearings") return true;
  if (m.includes("bearing") || m.includes("mechanical")) return true;
  if (m === "leak" || m === "electrical" || m === "pd" || m === "valve" || m === "steam") {
    return false;
  }
  return false;
}

/** Compressed Air Leaks tab — leak-mode ultrasound (or Air Leak classification). */
function isUeLeakRow(r: SavedAnalysisResult): boolean {
  const { mode } = uePeaksFromRow(r);
  const m = (mode || "").toLowerCase();
  if (m === "leak" || m === "leaks") return true;
  if (m.includes("leak")) return true;
  const fault = String(r.primary_fault || "").toLowerCase();
  if (fault.includes("air leak") || fault === "leak") return true;
  // Peaks already carry leak economics
  const peaks = Array.isArray(r.peaks) ? r.peaks : [];
  for (const raw of peaks) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (String(p.type || "").toLowerCase() !== "ultrasound") continue;
    if (
      p.estimated_cfm != null ||
      p.annual_cost != null ||
      p.orifice_size != null
    ) {
      return true;
    }
  }
  return false;
}

function safeFinite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

type UeLeakCostSeverity = "small" | "medium" | "large" | "critical";

function leakCostSeverity(annualCost: number): UeLeakCostSeverity {
  if (annualCost < 100) return "small";
  if (annualCost < 1000) return "medium";
  if (annualCost <= 5000) return "large";
  return "critical";
}

function leakCostTextClass(severity: UeLeakCostSeverity): string {
  switch (severity) {
    case "small":
      return "text-emerald-400";
    case "medium":
      return "text-yellow-400";
    case "large":
      return "text-orange-400";
    case "critical":
      return "text-red-400";
  }
}

function leakCostBadgeClass(severity: UeLeakCostSeverity): string {
  switch (severity) {
    case "small":
      return "bg-emerald-500/15 border-emerald-500/40 text-emerald-300";
    case "medium":
      return "bg-yellow-500/15 border-yellow-500/40 text-yellow-300";
    case "large":
      return "bg-orange-500/15 border-orange-500/40 text-orange-300";
    case "critical":
      return "bg-red-500/15 border-red-500/40 text-red-300";
  }
}

function formatUsdPerYear(n: number): string {
  return `${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(n)}/yr`;
}

function formatLeakDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

type UeLeakInventoryRow = {
  id: string;
  assetId: string;
  dateIso: string;
  dateMs: number;
  dateLabel: string;
  peakDb: number;
  baselineDb: number;
  orificeSize: number;
  estimatedCfm: number;
  annualCost: number;
  co2Emissions: number;
  healthScore: number | null;
  severity: UeLeakCostSeverity;
};

/** Extract leak economics from peaks / financial_impact / telemetry_data (+ calculator backfill). */
function ueLeakInventoryFromRow(r: SavedAnalysisResult): UeLeakInventoryRow {
  const peaks = Array.isArray(r.peaks) ? r.peaks : [];
  let peakDb = 0;
  let baselineDb = 28;
  let orificeSize = 0;
  let estimatedCfm = 0;
  let annualCost = 0;
  let co2Emissions = 0;
  let foundUe = false;

  for (const raw of peaks) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (String(p.type || "").toLowerCase() !== "ultrasound") continue;
    foundUe = true;
    peakDb = safeFinite(p.peak_dbmv ?? p.peak_dbuv, peakDb);
    baselineDb = safeFinite(p.baseline_dbmv ?? p.baseline_dbuv, baselineDb);
    orificeSize = safeFinite(p.orifice_size ?? p.orificeSize, orificeSize);
    estimatedCfm = safeFinite(p.estimated_cfm ?? p.estimatedCfm, estimatedCfm);
    annualCost = safeFinite(p.annual_cost ?? p.annualCost, annualCost);
    co2Emissions = safeFinite(p.co2_emissions ?? p.co2Emissions, co2Emissions);
    break;
  }

  const fi =
    r.financial_impact && typeof r.financial_impact === "object"
      ? r.financial_impact
      : {};
  if (!annualCost) {
    annualCost = safeFinite(
      (fi as Record<string, unknown>).annual_cost ??
        (fi as Record<string, unknown>).annualCost,
      0
    );
  }

  const td =
    r.telemetry_data && typeof r.telemetry_data === "object"
      ? r.telemetry_data
      : null;
  if (td) {
    const leakBlob =
      (td.leak_impact && typeof td.leak_impact === "object"
        ? (td.leak_impact as Record<string, unknown>)
        : null) ||
      (td.leak && typeof td.leak === "object"
        ? (td.leak as Record<string, unknown>)
        : null);
    if (leakBlob) {
      orificeSize = safeFinite(
        leakBlob.orifice_size ?? leakBlob.orificeSize,
        orificeSize
      );
      estimatedCfm = safeFinite(
        leakBlob.estimated_cfm ?? leakBlob.flowRateCfm,
        estimatedCfm
      );
      annualCost = safeFinite(
        leakBlob.annual_cost ?? leakBlob.annualCost,
        annualCost
      );
      co2Emissions = safeFinite(
        leakBlob.co2_emissions ?? leakBlob.co2Emissions,
        co2Emissions
      );
    }
  }

  // Backfill from peak/baseline when persisted economics are missing
  if (
    foundUe &&
    peakDb > 0 &&
    (estimatedCfm <= 0 || annualCost <= 0 || orificeSize <= 0)
  ) {
    const computed = calculateLeakImpact({
      peakDb,
      baselineDb
    });
    if (orificeSize <= 0) orificeSize = computed.orificeSize;
    if (estimatedCfm <= 0) estimatedCfm = computed.flowRateCfm;
    if (annualCost <= 0) annualCost = computed.annualCost;
    if (co2Emissions <= 0) co2Emissions = computed.co2Emissions;
  }

  const dateIso = r.timestamp || r.created_at || "";
  const dateMs = dateIso ? new Date(dateIso).getTime() : 0;

  return {
    id: String(r.id),
    assetId: String(r.asset_id || ""),
    dateIso,
    dateMs: Number.isFinite(dateMs) ? dateMs : 0,
    dateLabel: formatLeakDate(dateIso),
    peakDb,
    baselineDb,
    orificeSize,
    estimatedCfm,
    annualCost,
    co2Emissions,
    healthScore:
      r.health_score != null && Number.isFinite(Number(r.health_score))
        ? Number(r.health_score)
        : null,
    severity: leakCostSeverity(annualCost)
  };
}

/** Electrical PD tab — electrical / PD ultrasound modes. */
function isUeElectricalPdRow(r: SavedAnalysisResult): boolean {
  const { mode } = uePeaksFromRow(r);
  const m = (mode || "").toLowerCase();
  if (m === "electrical" || m === "pd" || m === "partial_discharge") return true;
  if (m.includes("electrical") || m.includes("corona") || m.includes("tracking")) {
    return true;
  }
  const fault = String(r.primary_fault || "").toLowerCase();
  if (
    fault.includes("corona") ||
    fault.includes("tracking") ||
    fault.includes("arcing") ||
    fault.includes("partial discharge") ||
    fault.includes("electrical")
  ) {
    return true;
  }
  return false;
}

type UePdSeverity = "normal" | "low" | "medium" | "critical";
type UePdClassification =
  | "Normal"
  | "Corona"
  | "Surface Tracking"
  | "General Discharge";

/** Phase 1 thresholds on peak dBµV (ISO-style acoustic PD screening). */
function classifyPdFromPeakDb(peakDb: number): {
  classification: UePdClassification;
  severity: UePdSeverity;
  severityLabel: string;
} {
  const peak = safeFinite(peakDb, 0);
  if (peak < 15) {
    return {
      classification: "Normal",
      severity: "normal",
      severityLabel: "Normal"
    };
  }
  if (peak < 25) {
    return {
      classification: "Corona",
      severity: "low",
      severityLabel: "Low / Corona"
    };
  }
  if (peak <= 40) {
    return {
      classification: "Surface Tracking",
      severity: "medium",
      severityLabel: "Medium / Tracking"
    };
  }
  return {
    classification: "General Discharge",
    severity: "critical",
    severityLabel: "Critical / Arcing"
  };
}

function pdSeverityRank(severity: UePdSeverity): number {
  switch (severity) {
    case "normal":
      return 0;
    case "low":
      return 1;
    case "medium":
      return 2;
    case "critical":
      return 3;
  }
}

function pdSeverityBadgeClass(severity: UePdSeverity): string {
  switch (severity) {
    case "normal":
      return "bg-emerald-500/15 border-emerald-500/40 text-emerald-300";
    case "low":
      return "bg-yellow-500/15 border-yellow-500/40 text-yellow-300";
    case "medium":
      return "bg-orange-500/15 border-orange-500/40 text-orange-300";
    case "critical":
      return "bg-red-500/15 border-red-500/40 text-red-300";
  }
}

function pdSeverityTextClass(severity: UePdSeverity): string {
  switch (severity) {
    case "normal":
      return "text-emerald-400";
    case "low":
      return "text-yellow-400";
    case "medium":
      return "text-orange-400";
    case "critical":
      return "text-red-400";
  }
}

type UePdInventoryRow = {
  id: string;
  assetId: string;
  dateIso: string;
  dateMs: number;
  dateLabel: string;
  peakDb: number;
  baselineDb: number;
  baselineDelta: number;
  classification: UePdClassification;
  severity: UePdSeverity;
  severityLabel: string;
  /** Phase 2 stubs — present when AI payload exists. */
  prpdData: Array<[number, number]> | null;
  environmentalContext: { temperature?: number; humidity?: number } | null;
  confidenceScore: number | null;
};

function parsePrpdData(raw: unknown): Array<[number, number]> | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: Array<[number, number]> = [];
  for (const pt of raw) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const a = Number(pt[0]);
    const b = Number(pt[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) out.push([a, b]);
  }
  return out.length > 0 ? out : null;
}

function uePdInventoryFromRow(r: SavedAnalysisResult): UePdInventoryRow {
  const peaks = Array.isArray(r.peaks) ? r.peaks : [];
  let peakDb = 0;
  let baselineDb = 0;
  let deltaDb: number | null = null;
  let prpdData: Array<[number, number]> | null = null;
  let environmentalContext: { temperature?: number; humidity?: number } | null =
    null;
  let confidenceScore: number | null = null;

  for (const raw of peaks) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (String(p.type || "").toLowerCase() !== "ultrasound") continue;
    peakDb = safeFinite(p.peak_dbmv ?? p.peak_dbuv, 0);
    baselineDb = safeFinite(p.baseline_dbmv ?? p.baseline_dbuv, 0);
    if (p.delta_db != null) deltaDb = safeFinite(p.delta_db, 0);
    prpdData = parsePrpdData(p.prpd_data ?? p.prpdData);
    const env = p.environmental_context ?? p.environmentalContext;
    if (env && typeof env === "object") {
      const e = env as Record<string, unknown>;
      environmentalContext = {
        ...(e.temperature != null
          ? { temperature: safeFinite(e.temperature, 0) }
          : {}),
        ...(e.humidity != null ? { humidity: safeFinite(e.humidity, 0) } : {})
      };
      if (
        environmentalContext.temperature == null &&
        environmentalContext.humidity == null
      ) {
        environmentalContext = null;
      }
    }
    const conf = optionalPdConfidence(p.confidence_score ?? p.confidenceScore);
    confidenceScore = conf;
    break;
  }

  // Phase 2 stubs may also live on telemetry_data / consensus_details
  const td =
    r.telemetry_data && typeof r.telemetry_data === "object"
      ? r.telemetry_data
      : null;
  if (td) {
    if (!prpdData) prpdData = parsePrpdData(td.prpd_data ?? td.prpdData);
    if (!environmentalContext) {
      const env = td.environmental_context ?? td.environmentalContext;
      if (env && typeof env === "object") {
        const e = env as Record<string, unknown>;
        environmentalContext = {
          ...(e.temperature != null
            ? { temperature: safeFinite(e.temperature, 0) }
            : {}),
          ...(e.humidity != null ? { humidity: safeFinite(e.humidity, 0) } : {})
        };
      }
    }
    if (confidenceScore == null) {
      confidenceScore = optionalPdConfidence(
        td.confidence_score ?? td.confidenceScore
      );
    }
  }

  const baselineDelta =
    deltaDb != null ? deltaDb : Math.max(0, peakDb - baselineDb);
  const classified = classifyPdFromPeakDb(peakDb);
  const dateIso = r.timestamp || r.created_at || "";
  const dateMs = dateIso ? new Date(dateIso).getTime() : 0;

  return {
    id: String(r.id),
    assetId: String(r.asset_id || ""),
    dateIso,
    dateMs: Number.isFinite(dateMs) ? dateMs : 0,
    dateLabel: formatLeakDate(dateIso),
    peakDb,
    baselineDb,
    baselineDelta: Math.round(baselineDelta * 10) / 10,
    classification: classified.classification,
    severity: classified.severity,
    severityLabel: classified.severityLabel,
    prpdData,
    environmentalContext,
    confidenceScore
  };
}

function optionalPdConfidence(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Steam trap ultrasound rows — prefer mode === "steam_trap". */
function isUeSteamTrapRow(r: SavedAnalysisResult): boolean {
  const { mode } = uePeaksFromRow(r);
  const m = (mode || "").toLowerCase().replace(/\s+/g, "_");
  if (m === "steam_trap" || m === "steam-trap") return true;
  if (m === "steam" || m === "valve" || m === "trap") return true;
  if (m.includes("steam") || m.includes("trap")) return true;
  const fault = String(r.primary_fault || "").toLowerCase();
  if (
    fault.includes("steam") ||
    fault.includes("blow-by") ||
    fault.includes("blow by") ||
    fault.includes("trap") ||
    fault.includes("blown-through") ||
    fault.includes("water hammer")
  ) {
    return true;
  }
  return false;
}

type UeSteamInventoryRow = {
  id: string;
  assetId: string;
  trapId: string;
  trapType: string;
  dateIso: string;
  dateMs: number;
  dateLabel: string;
  peakDb: number;
  pressurePsig: number;
  tempDrop: number | null;
  upstreamTemp: number | null;
  downstreamTemp: number | null;
  status: string;
  severity: "NORMAL" | "WARNING" | "CRITICAL";
  action: string;
  annualCostUsd: number;
  massFlowLbHr: number;
  roiPaybackDays: number | null;
  orificeSizeIn: number;
  thermalAvailable: boolean;
};

/**
 * Best-effort Tin/Tout from latest thermography scan for the same asset.
 * Prefers explicit inlet/outlet telemetry; falls back to hotspot/reference.
 */
function latestThermoSteamTemps(
  thermoRows: SavedAnalysisResult[],
  assetId: string
): { upstreamTemp: number | null; downstreamTemp: number | null } {
  const tag = String(assetId || "").trim().toLowerCase();
  if (!tag) return { upstreamTemp: null, downstreamTemp: null };

  const match = [...thermoRows].find((r) => {
    const a = String(r.asset_id || "").trim().toLowerCase();
    return a === tag || a.includes(tag) || tag.includes(a);
  });
  if (!match) return { upstreamTemp: null, downstreamTemp: null };

  const fields = extractThermoChartFields(match);
  const td =
    match.telemetry_data && typeof match.telemetry_data === "object"
      ? match.telemetry_data
      : null;
  const poly =
    td && td.polymorphic && typeof td.polymorphic === "object"
      ? (td.polymorphic as Record<string, unknown>)
      : null;

  const pickTemp = (...candidates: unknown[]): number | null => {
    for (const c of candidates) {
      if (c == null || c === "") continue;
      const n = Number(c);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  return {
    upstreamTemp: pickTemp(
      poly?.upstream_temp,
      poly?.inlet_temp,
      td?.upstream_temp,
      td?.inlet_temp,
      fields.hotspot,
      fields.deBearing,
      fields.phaseA
    ),
    downstreamTemp: pickTemp(
      poly?.downstream_temp,
      poly?.outlet_temp,
      td?.downstream_temp,
      td?.outlet_temp,
      fields.reference,
      fields.odeBearing,
      fields.ambientReferenceTemp,
      fields.phaseB
    )
  };
}

function ueSteamInventoryFromRow(
  r: SavedAnalysisResult,
  thermoTemps: { upstreamTemp: number | null; downstreamTemp: number | null }
): UeSteamInventoryRow {
  const peaks = Array.isArray(r.peaks) ? r.peaks : [];
  const td =
    r.telemetry_data && typeof r.telemetry_data === "object"
      ? r.telemetry_data
      : null;

  let peakDb = 0;
  let pressurePsig = 100;
  let orificeSize = 0;
  let trapType = "Thermodynamic";
  let trapId = String(r.asset_id || r.component || r.id || "TRAP");
  let upstreamTemp = thermoTemps.upstreamTemp;
  let downstreamTemp = thermoTemps.downstreamTemp;
  let operatingHours: number | undefined;
  let fuelCost: number | undefined;

  for (const raw of peaks) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (String(p.type || "").toLowerCase() !== "ultrasound") continue;
    peakDb = safeFinite(p.peak_dbmv ?? p.peak_dbuv, 0);
    pressurePsig = safeFinite(
      p.system_pressure_psi ??
        p.steam_pressure_psig ??
        p.systemPressure ??
        p.pressure_psi,
      100
    );
    orificeSize = safeFinite(
      p.orifice_size ?? p.orificeSize ?? p.orifice_size_in,
      0
    );
    if (p.trap_type != null || p.trapType != null) {
      trapType = String(p.trap_type ?? p.trapType);
    }
    if (p.trap_id != null || p.trapId != null) {
      trapId = String(p.trap_id ?? p.trapId);
    }
    if (p.upstream_temp != null && Number.isFinite(Number(p.upstream_temp))) {
      upstreamTemp = Number(p.upstream_temp);
    }
    if (p.downstream_temp != null && Number.isFinite(Number(p.downstream_temp))) {
      downstreamTemp = Number(p.downstream_temp);
    }
    if (p.operating_hours != null) {
      operatingHours = safeFinite(p.operating_hours, 8760);
    }
    if (p.fuel_cost_per_mlb != null || p.fuelCostPerThousandLb != null) {
      fuelCost = safeFinite(
        p.fuel_cost_per_mlb ?? p.fuelCostPerThousandLb,
        18.5
      );
    }
    break;
  }

  if (td) {
    if (orificeSize <= 0) {
      orificeSize = safeFinite(td.orifice_size ?? td.orificeSize, orificeSize);
    }
    if (td.trap_type != null || td.trapType != null) {
      trapType = String(td.trap_type ?? td.trapType);
    }
    if (td.trap_id != null || td.trapId != null) {
      trapId = String(td.trap_id ?? td.trapId);
    }
    if (upstreamTemp == null && td.upstream_temp != null) {
      const n = Number(td.upstream_temp);
      if (Number.isFinite(n)) upstreamTemp = n;
    }
    if (downstreamTemp == null && td.downstream_temp != null) {
      const n = Number(td.downstream_temp);
      if (Number.isFinite(n)) downstreamTemp = n;
    }
  }

  if (!(orificeSize > 0)) {
    orificeSize = estimateSteamOrificeFromPeakDb(peakDb);
  }

  const loss = calculateAdvancedSteamLoss({
    orificeSize,
    steamPressurePsig: pressurePsig,
    ultrasoundPeakDb: peakDb,
    upstreamTemp: upstreamTemp ?? undefined,
    downstreamTemp: downstreamTemp ?? undefined,
    trapType,
    operatingHours,
    fuelCostPerThousandLb: fuelCost
  });

  const dateIso = r.timestamp || r.created_at || "";
  const dateMs = dateIso ? new Date(dateIso).getTime() : 0;

  return {
    id: String(r.id),
    assetId: String(r.asset_id || ""),
    trapId,
    trapType,
    dateIso,
    dateMs: Number.isFinite(dateMs) ? dateMs : 0,
    dateLabel: formatLeakDate(dateIso),
    peakDb,
    pressurePsig,
    tempDrop: loss.tempDrop,
    upstreamTemp,
    downstreamTemp,
    status: loss.status,
    severity: loss.severity,
    action: loss.action,
    annualCostUsd: loss.annualCost,
    massFlowLbHr: loss.massFlowLbHr,
    roiPaybackDays: loss.roiPaybackDays,
    orificeSizeIn: orificeSize,
    thermalAvailable: loss.thermalAvailable
  };
}

function steamSeverityBadgeClass(
  severity: UeSteamInventoryRow["severity"]
): string {
  switch (severity) {
    case "NORMAL":
      return "bg-emerald-500/15 border-emerald-500/40 text-emerald-300";
    case "WARNING":
      return "bg-yellow-500/15 border-yellow-500/40 text-yellow-300";
    case "CRITICAL":
      return "bg-red-500/15 border-red-500/40 text-red-300";
  }
}

function steamSeverityTextClass(
  severity: UeSteamInventoryRow["severity"]
): string {
  switch (severity) {
    case "NORMAL":
      return "text-emerald-400";
    case "WARNING":
      return "text-yellow-400";
    case "CRITICAL":
      return "text-red-400";
  }
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
    id: "oil_analysis",
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

const VIB_MODE_OPTIONS: {
  id: VibMode;
  label: string;
  Icon?: React.ComponentType<{ className?: string }>;
  activeClass?: string;
  inactiveIconClass?: string;
}[] = [
  { id: "broadband", label: "Broadband & ISO 20816", Icon: Zap },
  {
    id: "spectral",
    label: "Spectral & Harmonics",
    Icon: BarChart3,
    activeClass: "bg-cyan-500/10 border-cyan-500 text-cyan-400",
    inactiveIconClass: "text-cyan-400"
  },
  { id: "enveloping", label: "Enveloping & Bearing", Icon: Cog },
  { id: "waveform", label: "Waveform & Phase", Icon: AudioWaveform }
];

const REFERENCE_TREND_DATA = [
  { date: "Jan", amp1X: 0.4, amp2X: 0.2, overall: 0.8 },
  { date: "Feb", amp1X: 0.5, amp2X: 0.3, overall: 0.9 },
  { date: "Mar", amp1X: 0.8, amp2X: 0.3, overall: 1.2 },
  { date: "Apr", amp1X: 1.2, amp2X: 0.4, overall: 1.7 },
  { date: "May", amp1X: 1.5, amp2X: 0.5, overall: 2.1 },
  { date: "Jun", amp1X: 1.9, amp2X: 0.8, overall: 2.8 }
];

const VIB_SPECTRAL = [
  { date: "Jul 05", oneX: 1.4, twoX: 0.55, harmonics: 0.32, vpf: 0.18, gmf: 0.22 },
  { date: "Jul 12", oneX: 1.55, twoX: 0.62, harmonics: 0.38, vpf: 0.2, gmf: 0.25 },
  { date: "Jul 19", oneX: 1.8, twoX: 0.78, harmonics: 0.48, vpf: 0.24, gmf: 0.28 },
  { date: "Jul 26", oneX: 2.1, twoX: 0.95, harmonics: 0.62, vpf: 0.31, gmf: 0.34 },
  { date: "Aug 03", oneX: 2.55, twoX: 1.1, harmonics: 0.78, vpf: 0.38, gmf: 0.42 }
];

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

const UE_MODE_OPTIONS: {
  id: UeMode;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
}[] = [
  {
    id: "bearings",
    label: "Bearings & Mechanical",
    Icon: Cog,
    iconClass: "bg-amber-500/15 border-amber-500/40 text-amber-400"
  },
  {
    id: "leaks",
    label: "Compressed Air Leaks",
    Icon: Wind,
    iconClass: "bg-sky-500/15 border-sky-500/40 text-sky-400"
  },
  {
    id: "electrical",
    label: "Electrical PD",
    Icon: Zap,
    iconClass: "bg-yellow-500/15 border-yellow-500/40 text-yellow-400"
  },
  {
    id: "steam",
    label: "Steam Traps",
    Icon: Droplets,
    iconClass: "bg-cyan-500/15 border-cyan-500/40 text-cyan-400"
  }
];

type McaMode = "winding" | "insulation" | "rotor" | "surge";

const MCA_MODE_OPTIONS: {
  id: McaMode;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  activeClass: string;
}[] = [
  {
    id: "winding",
    label: "Winding & Phase Balance",
    Icon: Zap,
    iconClass: "bg-cyan-500/10 border-cyan-500/40 text-cyan-400",
    activeClass: "bg-cyan-500/10 border-cyan-500 text-cyan-400"
  },
  {
    id: "insulation",
    label: "Groundwall Insulation",
    Icon: Shield,
    iconClass: "bg-amber-500/10 border-amber-500/40 text-amber-400",
    activeClass: "bg-amber-500/10 border-amber-500 text-amber-400"
  },
  {
    id: "rotor",
    label: "Rotor Influence Check",
    Icon: RotateCw,
    iconClass: "bg-purple-500/10 border-purple-500/40 text-purple-400",
    activeClass: "bg-purple-500/10 border-purple-500 text-purple-400"
  },
  {
    id: "surge",
    label: "Surge Waveforms",
    Icon: Activity,
    iconClass: "bg-emerald-500/10 border-emerald-500/40 text-emerald-400",
    activeClass: "bg-emerald-500/10 border-emerald-500 text-emerald-400"
  }
];

function mcaFmtCell(
  value: number | null | undefined,
  digits: number
): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "---";
  return value.toFixed(digits);
}

function mcaFaultBadgeClass(severity: string): string {
  const s = severity.toUpperCase();
  if (s === "CRITICAL") {
    return "bg-red-500/15 border-red-500/40 text-red-300";
  }
  if (s === "WARNING") {
    return "bg-yellow-500/15 border-yellow-500/40 text-yellow-300";
  }
  return "bg-emerald-500/15 border-emerald-500/40 text-emerald-300";
}

type OilSubTab = "wear_metals" | "chemistry" | "cleanliness" | "ferrography";

const OIL_SUB_TABS: {
  id: OilSubTab;
  label: string;
  disabled?: boolean;
  comingSoon?: boolean;
}[] = [
  { id: "wear_metals", label: "Wear Metals & Debris" },
  { id: "chemistry", label: "Fluid Chemistry", disabled: true, comingSoon: true },
  { id: "cleanliness", label: "Cleanliness", disabled: true, comingSoon: true },
  { id: "ferrography", label: "Ferrography & Varnish", disabled: true, comingSoon: true }
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

function amplitudeNearHz(
  peaks: Array<{ frequency: number; amplitude: number }>,
  targetHz: number
): number | null {
  if (!peaks.length || !(targetHz > 0)) return null;
  let best = peaks[0];
  let bestD = Math.abs(best.frequency - targetHz);
  for (const p of peaks) {
    const d = Math.abs(p.frequency - targetHz);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best.amplitude;
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
  const [ueLeakSort, setUeLeakSort] = useState<{
    key: "date" | "annual_cost";
    dir: "asc" | "desc";
  }>({ key: "date", dir: "desc" });
  const [mcaMode, setMcaMode] = useState<McaMode>("winding");
  /** MCA Single Source of Truth — all four tabs read slices from this record. */
  const [mcaRecord, setMcaRecord] = useState<McaSsotRecord>(EMPTY_MCA_SSOT);
  const mergeMcaRecord = useCallback((patch: Partial<McaSsotRecord>) => {
    setMcaRecord((prev) => deepMergeMcaSsot(prev, patch));
  }, []);
  const [mcaPdfFileName, setMcaPdfFileName] = useState<string | null>(null);
  const [mcaPdfParsing, setMcaPdfParsing] = useState(false);
  const [mcaPdfError, setMcaPdfError] = useState<string | null>(null);
  const [mcaManualEdit, setMcaManualEdit] = useState(false);
  const [mcaPdfDragOver, setMcaPdfDragOver] = useState(false);
  const mcaPdfInputRef = useRef<HTMLInputElement>(null);
  const mcaAssetKeyRef = useRef(selectedAssetKey);
  const [ricBaselineData, setRicBaselineData] = useState<RicDataPoint[]>([]);
  const [ricCompareBaseline, setRicCompareBaseline] = useState(false);
  const [ricApplySmoothing, setRicApplySmoothing] = useState(true);
  const [ricShowGrid, setRicShowGrid] = useState(false);
  const [ricPasteError, setRicPasteError] = useState<string | null>(null);
  const [surgePasteError, setSurgePasteError] = useState<string | null>(null);
  const surgeCsvInputRef = useRef<HTMLInputElement>(null);
  const [activeOilSubTab, setActiveOilSubTab] = useState<OilSubTab>("wear_metals");
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
  const [envelopeBaseline, setEnvelopeBaseline] =
    useState<EnvelopingTrendPoint | null>(null);
  const [envelopeBaselineBusy, setEnvelopeBaselineBusy] = useState(false);
  const [envelopeBaselineError, setEnvelopeBaselineError] = useState<
    string | null
  >(null);
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

  /** Latest unified vibration diagnostic record — prefer rows that include FFT peaks. */
  const latestVibrationRecord = useMemo((): VibrationDiagnosticRecord | null => {
    const fromDb = vibAnalyses
      .map((row) => extractVibrationRecordFromAnalysis(row))
      .filter((rec): rec is VibrationDiagnosticRecord => Boolean(rec));
    const dbWithSpectral = fromDb.find((rec) => hasSpectralPeaks(rec));
    if (dbWithSpectral) return dbWithSpectral;

    const candidateKeys = [
      analysisAssetQueryKey,
      selectedAsset?.tag,
      selectedAsset?.id != null ? String(selectedAsset.id) : null
    ].filter((k): k is string => Boolean(k && String(k).trim()));
    for (const key of candidateKeys) {
      const cached = readCachedVibrationRecord(key);
      if (hasSpectralPeaks(cached)) return cached;
    }
    for (const key of candidateKeys) {
      const cached = readCachedVibrationRecord(key);
      if (cached && hasVibrationTrendCharts(cached)) return cached;
    }
    return fromDb.find((rec) => hasVibrationTrendCharts(rec)) || fromDb[0] || null;
  }, [
    vibAnalyses,
    analysisAssetQueryKey,
    selectedAsset?.tag,
    selectedAsset?.id
  ]);

  const hasVibrationDiagnosticRecord = hasVibrationTrendCharts(
    latestVibrationRecord
  );

  // Debug: verify Trend Analyzer is reading the persisted spectral payload
  useEffect(() => {
    if (trendTech !== "vibration") return;
    const hasSpectral = Boolean(latestVibrationRecord?.spectral?.length);
    console.log("📈 [TREND ANALYZER] Loading vibration data for:", {
      id: selectedAsset?.id,
      tag: selectedAsset?.tag,
      name: selectedAsset?.name,
      queryKey: analysisAssetQueryKey
    });
    console.log("📥 [TREND ANALYZER] Loaded record:", {
      hasRecord: !!latestVibrationRecord,
      hasSpectral,
      spectralLength: latestVibrationRecord?.spectral?.length ?? 0,
      isUsingFallback: !hasSpectral,
      broadbandVelocity: latestVibrationRecord?.broadband?.overallVelocity
    });
    if (hasSpectral) {
      console.log(
        "📊 [TREND ANALYZER] Real Spectral peaks loaded:",
        latestVibrationRecord?.spectral
      );
    } else {
      console.warn("⚠️ [TREND ANALYZER] No spectral peaks — using reference spectrum");
    }
  }, [
    trendTech,
    selectedAsset?.id,
    selectedAsset?.tag,
    selectedAsset?.name,
    analysisAssetQueryKey,
    latestVibrationRecord
  ]);

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
    if (trendTech === "oil_analysis") return oilAnalyses;
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
  const latestMca = mcaAnalyses[0] ?? null;
  const latestMcaGroundwallRow = useMemo(
    () => findLatestMcaWithGroundwall(mcaAnalyses) ?? latestMca,
    [mcaAnalyses, latestMca]
  );

  // SSOT hydration: merge DB telemetry into master record (never wipe sibling domains).
  useEffect(() => {
    const assetChanged = mcaAssetKeyRef.current !== selectedAssetKey;
    mcaAssetKeyRef.current = selectedAssetKey;
    const latest = mcaAnalyses[0] ?? null;
    const gwRow = latestMcaGroundwallRow;
    if (!latest && assetChanged) {
      setMcaRecord(EMPTY_MCA_SSOT);
      return;
    }
    if (!latest) return;
    setMcaRecord((prev) =>
      deepMergeMcaSsot(
        assetChanged ? EMPTY_MCA_SSOT : prev,
        mcaSsotFromSaved(latest, gwRow)
      )
    );
  }, [mcaAnalyses, latestMcaGroundwallRow, selectedAssetKey]);

  const ricData = mcaRecord.rotor_influence.series;
  const surgeData = mcaRecord.surge.waveform;
  const surgeTestVoltageV = mcaRecord.surge.test_voltage_v ?? null;

  const mcaWindingParams = useMemo(() => {
    const w = mcaWindingFromSsot(mcaRecord.phase_balance);
    const fromDb = extractMcaWindingFromSaved(latestMca);
    return {
      ...w,
      windingTempC: w.windingTempC ?? fromDb.windingTempC,
      ratedHp: w.ratedHp ?? fromDb.ratedHp,
      fromTelemetry:
        hasMcaSsotPhaseBalance(mcaRecord) &&
        (mcaRecord.meta.source === "telemetry" || fromDb.fromTelemetry),
      fromPdf:
        mcaRecord.meta.source === "pdf" || mcaRecord.meta.source === "vision"
    };
  }, [mcaRecord, latestMca]);
  const mcaWindingResult = useMemo(
    () => calculateWindingBalance(mcaWindingParams),
    [mcaWindingParams]
  );
  const hasMcaWindingData =
    mcaTripletHasData(mcaWindingParams.phaseR) ||
    mcaTripletHasData(mcaWindingParams.phaseL) ||
    mcaTripletHasData(mcaWindingParams.phaseZ) ||
    mcaTripletHasData(mcaWindingParams.phaseFi) ||
    mcaTripletHasData(mcaWindingParams.phaseIF);

  const mcaWindingChartData = useMemo(
    () =>
      hasMcaWindingData
        ? [
            {
              phase: "T1-T2",
              Resistance: mcaWindingParams.phaseR[0] || undefined,
              Inductance: mcaWindingParams.phaseL[0] || undefined
            },
            {
              phase: "T2-T3",
              Resistance: mcaWindingParams.phaseR[1] || undefined,
              Inductance: mcaWindingParams.phaseL[1] || undefined
            },
            {
              phase: "T3-T1",
              Resistance: mcaWindingParams.phaseR[2] || undefined,
              Inductance: mcaWindingParams.phaseL[2] || undefined
            }
          ]
        : [
            { phase: "T1-T2" },
            { phase: "T2-T3" },
            { phase: "T3-T1" }
          ],
    [mcaWindingParams, hasMcaWindingData]
  );

  const mcaGwSnapshot = useMemo(
    () => mcaGroundwallFromSsot(mcaRecord.groundwall),
    [mcaRecord.groundwall]
  );

  const mcaGwResult = useMemo(() => {
    const computed = calculateGroundwallInsulation({
      ir15sMOmega: mcaGwSnapshot.ir15sMOmega,
      ir30sMOmega: mcaGwSnapshot.ir30sMOmega,
      ir1mMOmega: mcaGwSnapshot.ir1mMOmega || 0,
      ir10mMOmega: mcaGwSnapshot.ir10mMOmega,
      testVoltageV: mcaGwSnapshot.testVoltageV || 0,
      windingTempC: mcaGwSnapshot.windingTempC,
      insulationClass: mcaGwSnapshot.insulationClass as InsulationClass
    });
    const pi =
      computed.pi ??
      (mcaGwSnapshot.reportPi != null && mcaGwSnapshot.reportPi > 0
        ? mcaGwSnapshot.reportPi
        : null);
    const dar =
      computed.dar ??
      (mcaGwSnapshot.reportDar != null && mcaGwSnapshot.reportDar > 0
        ? mcaGwSnapshot.reportDar
        : null);
    return {
      ...computed,
      pi,
      dar,
      darStatus:
        dar != null && computed.dar == null
          ? dar >= 1.4
            ? ("Good Insulation" as const)
            : dar >= 1.25
              ? ("Questionable" as const)
              : ("Dangerous / Moisture Ingress" as const)
          : computed.darStatus,
      piStatus:
        pi != null && computed.pi == null
          ? pi >= 2
            ? ("Good Insulation Health" as const)
            : pi >= 1.5
              ? ("Warning / Contaminated" as const)
              : ("Critical Degradation / Wet Winding" as const)
          : computed.piStatus,
      hasData:
        computed.hasData ||
        hasMcaSsotGroundwall(mcaRecord) ||
        mcaRecord.meta.source === "manual"
    };
  }, [mcaGwSnapshot, mcaRecord]);

  const hasMcaGwData = hasMcaSsotGroundwall(mcaRecord) || mcaGwResult.hasData;

  const mcaExtractLoaded =
    mcaRecord.meta.source === "pdf" || mcaRecord.meta.source === "vision";
  const mcaMetaSource = mcaRecord.meta.source;
  const mcaExtractFormat = mcaRecord.meta.formatDetected ?? "UNKNOWN";
  const mcaExtractConfidence = mcaRecord.meta.confidenceScore ?? 0;
  const manualEar = mcaRecord.surge.ear ?? null;

  const mcaGwChartData = useMemo(
    () =>
      mcaGwResult.curvePoints
        .filter((p) => p.rawMOmega != null || p.corrected40MOmega != null)
        .map((p) => ({
          time: p.label,
          seconds: p.seconds,
          Raw: p.rawMOmega,
          Corrected40: p.corrected40MOmega
        })),
    [mcaGwResult.curvePoints]
  );

  const ricResult = useMemo(
    () =>
      calculateRotorInfluence(ricData, {
        applySmoothing: ricApplySmoothing,
        baselineData:
          ricCompareBaseline && ricBaselineData.length > 0
            ? ricBaselineData
            : undefined
      }),
    [ricData, ricApplySmoothing, ricCompareBaseline, ricBaselineData]
  );

  const hasRicData = ricData.length > 0 && ricResult != null;

  const ricLinearChartData = useMemo(() => {
    if (!ricResult) return [];
    const baseMap: Map<number, RicDataPoint> = new Map<number, RicDataPoint>();
    for (const point of ricBaselineData as RicDataPoint[]) {
      baseMap.set(Math.round(point.angle), point);
    }
    return ricResult.smoothedData.map((p: RicDataPoint) => {
      const baselinePoint: RicDataPoint | undefined = baseMap.get(
        Math.round(p.angle)
      );
      const row: {
        angle: number;
        L12: number;
        L23: number;
        L31: number;
        BaseL12?: number;
        BaseL23?: number;
        BaseL31?: number;
      } = {
        angle: p.angle,
        L12: p.l12,
        L23: p.l23,
        L31: p.l31
      };
      if (ricCompareBaseline && baselinePoint) {
        row.BaseL12 = baselinePoint.l12;
        row.BaseL23 = baselinePoint.l23;
        row.BaseL31 = baselinePoint.l31;
      }
      return row;
    });
  }, [ricResult, ricBaselineData, ricCompareBaseline]);

  const ricRadarChartData = useMemo(
    () => toRicRadarData(ricResult?.smoothedData ?? ricData),
    [ricResult, ricData]
  );

  const surgeCsvResult = useMemo(
    () => calculateSurgeHealth(surgeData),
    [surgeData]
  );
  const surgeManualResult = useMemo(
    () => surgeHealthFromManualEar(manualEar),
    [manualEar]
  );
  /** Prefer waveform EAR when CSV/clipboard data exists; else manual EAR. */
  const surgeResult = surgeCsvResult ?? surgeManualResult;
  const hasSurgeData = surgeResult != null;

  const surgeChartData = useMemo(
    () =>
      surgeData.map((p) => ({
        time: p.time,
        V12: p.v12,
        V23: p.v23,
        V31: p.v31
      })),
    [surgeData]
  );

  const spectralHarmonicTrend = useMemo(() => {
    const chronological = [...vibAnalyses].reverse();
    const rows: Array<{
      date: string;
      amp1X: number;
      amp2X: number;
      overall: number;
    }> = [];
    for (const analysis of chronological) {
      const rec = extractVibrationRecordFromAnalysis(analysis);
      const rpm =
        rec?.rpm ??
        rec?.context?.motorSpeedRPM ??
        machineSpecs.rpm ??
        1780;
      const h1 = rpm > 0 ? rpm / 60 : 1780 / 60;
      const peaks = rec?.spectral || [];
      const amp1X = amplitudeNearHz(peaks, h1) ?? 0;
      const amp2X = amplitudeNearHz(peaks, h1 * 2) ?? 0;
      const overall =
        rec?.broadband?.overallVelocity ||
        peakAmplitudeFromAnalysis(analysis) ||
        0;
      if (!(amp1X > 0 || amp2X > 0 || overall > 0)) continue;
      const ts = rec?.timestamp || analysis.timestamp;
      const date = ts
        ? new Date(ts).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric"
          })
        : "—";
      rows.push({
        date,
        amp1X: Number(amp1X.toFixed(3)),
        amp2X: Number(amp2X.toFixed(3)),
        overall: Number(overall.toFixed(3))
      });
    }
    return rows;
  }, [vibAnalyses, machineSpecs.rpm]);

  const isUsingReferenceSpectralTrend = spectralHarmonicTrend.length < 2;
  const spectralTrendChartData = isUsingReferenceSpectralTrend
    ? REFERENCE_TREND_DATA
    : spectralHarmonicTrend;

  const vibExtractedEnvelopeChart = useMemo(() => {
    if (!latestVibrationRecord?.enveloping?.length) return [];
    const defaultLabels = ["BPFO", "BPFI", "BSF", "FTF"];
    return latestVibrationRecord.enveloping.map((p, i) => ({
      frequency: p.frequency,
      amplitude: p.amplitude,
      label: p.label || defaultLabels[i] || `${p.frequency} Hz`
    }));
  }, [latestVibrationRecord]);

  /** Chronological enveloping metrics from real analysis_results only (no mock fill). */
  const envelopingTrendSeries = useMemo(() => {
    const rows: EnvelopingTrendPoint[] = [];
    for (const analysis of [...vibAnalyses].reverse()) {
      const point = extractEnvelopingTrendPoint(analysis);
      if (!point) continue;
      rows.push(point);
    }
    return rows;
  }, [vibAnalyses]);

  const envelopingGeChartData = useMemo(
    () =>
      envelopingTrendSeries
        .filter((p) => p.peakGe != null && p.peakGe > 0)
        .map((p) => ({
          date: p.date,
          peakGe: p.peakGe as number,
          analysisId: p.analysisId,
          fault: p.primaryFault,
          timestamp: p.timestamp
        })),
    [envelopingTrendSeries]
  );

  const envelopingKurtosisChartData = useMemo(
    () =>
      envelopingTrendSeries
        .filter((p) => p.kurtosis != null && p.kurtosis > 0)
        .map((p) => ({
          date: p.date,
          kurtosis: p.kurtosis as number,
          analysisId: p.analysisId,
          fault: p.primaryFault
        })),
    [envelopingTrendSeries]
  );

  const calculatedBearingFaults = useMemo(() => {
    const kin = (selectedComp?.kinematics || {}) as Record<string, unknown>;
    const rpm =
      latestVibrationRecord?.rpm ||
      latestVibrationRecord?.context?.motorSpeedRPM ||
      machineSpecs.rpm;
    return resolveBearingFaultFrequencies({
      bearingLabel: machineSpecs.bearing !== "Not set" ? machineSpecs.bearing : null,
      rpm,
      kinematics: kin
    });
  }, [
    selectedComp?.kinematics,
    latestVibrationRecord?.rpm,
    latestVibrationRecord?.context?.motorSpeedRPM,
    machineSpecs.rpm,
    machineSpecs.bearing
  ]);

  const latestEnvelopingPoint =
    envelopingTrendSeries.length > 0
      ? envelopingTrendSeries[envelopingTrendSeries.length - 1]
      : null;

  const envelopeBaselineCompare = useMemo(() => {
    if (!envelopeBaseline || !latestEnvelopingPoint) return null;
    const baseGe = envelopeBaseline.peakGe;
    const nowGe = latestEnvelopingPoint.peakGe;
    if (baseGe == null || !(baseGe > 0) || nowGe == null) return null;
    const pct = ((nowGe - baseGe) / baseGe) * 100;
    const baseKurt = envelopeBaseline.kurtosis;
    const nowKurt = latestEnvelopingPoint.kurtosis;
    const kurtPct =
      baseKurt != null && baseKurt > 0 && nowKurt != null
        ? ((nowKurt - baseKurt) / baseKurt) * 100
        : null;
    return {
      gePct: pct,
      kurtPct,
      baselineDate: envelopeBaseline.date,
      baselineGe: baseGe,
      currentGe: nowGe
    };
  }, [envelopeBaseline, latestEnvelopingPoint]);

  // Prefer DB baseline flag when available
  useEffect(() => {
    const fromDb = envelopingTrendSeries.find((p) => p.isBaseline);
    if (fromDb) {
      setEnvelopeBaseline(fromDb);
      return;
    }
    setEnvelopeBaseline((prev) => {
      if (!prev) return null;
      const stillExists = envelopingTrendSeries.some(
        (p) => p.analysisId === prev.analysisId
      );
      return stillExists ? prev : null;
    });
  }, [envelopingTrendSeries]);

  const handleSetEnvelopeBaseline = async (point: EnvelopingTrendPoint) => {
    setEnvelopeBaselineBusy(true);
    setEnvelopeBaselineError(null);
    try {
      await setAnalysisBaseline(point.analysisId);
      setEnvelopeBaseline(point);
      setFetchTick((t) => t + 1);
    } catch (err) {
      // Still allow local comparison if API fails
      setEnvelopeBaseline(point);
      setEnvelopeBaselineError(
        err instanceof Error
          ? err.message
          : "Baseline saved locally — server sync failed."
      );
    } finally {
      setEnvelopeBaselineBusy(false);
    }
  };

  const hasEnvelopingTabData =
    envelopingTrendSeries.length > 0 ||
    vibExtractedEnvelopeChart.length > 0 ||
    calculatedBearingFaults != null;

  const waveformTrendSeries = useMemo(() => {
    const rows = [];
    for (const analysis of [...vibAnalyses].reverse()) {
      const point = extractWaveformTrendPoint(analysis);
      if (point) rows.push(point);
    }
    return rows;
  }, [vibAnalyses]);

  const latestWaveformAnalysisMetrics = useMemo(() => {
    const fromRecord = latestVibrationRecord?.waveformAnalysis;
    const fromTrend =
      waveformTrendSeries.length > 0
        ? waveformTrendSeries[waveformTrendSeries.length - 1]
        : null;
    const peakToPeak =
      fromRecord?.peakToPeak ?? fromTrend?.peakToPeak ?? null;
    const crestFactor =
      fromRecord?.crestFactor ??
      latestVibrationRecord?.waveformMetrics?.crestFactor ??
      fromTrend?.crestFactor ??
      null;
    const impactCount =
      fromRecord?.impactCount ?? fromTrend?.impactCount ?? null;
    const symmetry = fromRecord?.symmetry ?? fromTrend?.symmetry ?? null;
    const modulation =
      fromRecord?.modulation ?? fromTrend?.modulation ?? null;
    const timePerRevolutionMs =
      fromRecord?.timePerRevolutionMs ??
      (latestVibrationRecord?.rpm && latestVibrationRecord.rpm > 0
        ? 60000 / latestVibrationRecord.rpm
        : machineSpecs.rpm && machineSpecs.rpm > 0
          ? 60000 / machineSpecs.rpm
          : null);

    if (
      peakToPeak == null &&
      crestFactor == null &&
      impactCount == null &&
      !symmetry &&
      !(latestVibrationRecord?.waveform?.length)
    ) {
      return null;
    }

    return {
      peakToPeak,
      crestFactor,
      impactCount,
      symmetry,
      modulation,
      timePerRevolutionMs
    };
  }, [
    latestVibrationRecord,
    waveformTrendSeries,
    machineSpecs.rpm
  ]);

  const waveformRpm =
    latestVibrationRecord?.rpm ||
    latestVibrationRecord?.context?.motorSpeedRPM ||
    machineSpecs.rpm ||
    null;

  const vibExtractedWaveformChart = useMemo(() => {
    if (!latestVibrationRecord?.waveform?.length) return [];
    return latestVibrationRecord.waveform.map((p) => ({
      time: p.time,
      amplitude: p.amplitude
    }));
  }, [latestVibrationRecord]);

  const vibrationAwaitingRecordAlert = (
    <div className={`${CARD} mb-6 flex flex-col items-center justify-center text-center py-16 px-6`}>
      <Activity className="h-8 w-8 text-slate-500 mb-3" />
      <p className="text-sm font-semibold text-slate-200">
        Awaiting Diagnostic Record — Run Diagnostics and upload a spectrum export
        to populate analysis tabs.
      </p>
    </div>
  );

  const handleMcaPdfFile = async (file: File | null | undefined) => {
    if (!file) return;
    const isPdf =
      /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    const isImage =
      /^image\//i.test(file.type) ||
      /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
    if (!isPdf && !isImage) {
      setMcaPdfError("Please upload an MCA report PDF (or image of a digital report).");
      return;
    }
    setMcaPdfParsing(true);
    setMcaPdfError(null);
    try {
      const extracted = await extractMcaDataFromFile(file);
      const patch = mcaSsotFromExtracted(extracted, {
        source: isImage ? "vision" : "pdf",
        fileName: file.name,
        formatDetected: extracted.formatDetected,
        confidenceScore: extracted.confidenceScore
      });
      const mergedRecord = deepMergeMcaSsot(mcaRecord, patch);
      mergeMcaRecord(patch);
      setMcaPdfFileName(file.name);
      setMcaManualEdit(false);
      if (extracted.ricData && extracted.ricData.length > 0) {
        setRicPasteError(null);
      }

      const hasGw = mcaExtractHasGroundwall(extracted);
      const hasWinding =
        mcaTripletHasData(extracted.phaseR) ||
        mcaTripletHasData(extracted.phaseL) ||
        mcaTripletHasData(extracted.phaseZ) ||
        mcaTripletHasData(extracted.phaseFi) ||
        mcaTripletHasData(extracted.phaseIF);
      const hasRic = Boolean(extracted.ricData && extracted.ricData.length > 0);
      const hasSurge = Boolean(
        patch.surge?.waveform && patch.surge.waveform.length >= 2
      );

      if (!hasGw && !hasWinding && !hasRic && !hasSurge) {
        setMcaPdfError(
          isImage
            ? "Vision model found no MCA fields — try a clearer full-report PNG/JPEG or a text PDF export."
            : "No winding, groundwall, or RIC values found in this file."
        );
        return;
      }

      if (extracted.confidenceScore < 20 && !hasGw) {
        setMcaPdfError(
          "Low extraction confidence — use Manual Entry to correct values."
        );
      } else if (hasGw) {
        setMcaPdfError(null);
      }

      // Persist extracted MCA metrics so Trend Analyzer history / grids stay populated
      if (analysisAssetQueryKey && (hasWinding || hasGw)) {
        try {
          const windingResult = calculateWindingBalance({
            phaseR: extracted.phaseR,
            phaseL: extracted.phaseL,
            phaseZ: extracted.phaseZ,
            phaseFi: extracted.phaseFi,
            phaseIF: extracted.phaseIF,
            windingTempC: extracted.windingTempC,
            ratedHp: extracted.ratedHp
          });
          const gwResult = calculateGroundwallInsulation({
            ir15sMOmega: extracted.ir15sMOmega,
            ir30sMOmega: extracted.ir30sMOmega,
            ir1mMOmega: extracted.ir1mMOmega || 0,
            ir10mMOmega: extracted.ir10mMOmega,
            testVoltageV: extracted.testVoltageV || 0,
            windingTempC: extracted.windingTempC,
            insulationClass: extracted.insulationClass
          });
          const primaryFault = hasWinding
            ? windingResult.fault
            : gwResult.fault;
          const healthScore = hasWinding
            ? windingResult.healthScore
            : gwResult.irIeeePass
              ? 85
              : gwResult.hasData
                ? 45
                : 70;
          const payload = mcaPayloadForSave(
            mcaSsotToOperatorSnapshot(mergedRecord, {
              reportPi: extracted.reportPi ?? gwResult.pi ?? undefined,
              reportDar: extracted.reportDar ?? gwResult.dar ?? undefined
            }),
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
          await saveAnalysisResult({
            asset_id: analysisAssetQueryKey,
            component: selectedComponent || null,
            health_score: healthScore,
            primary_fault: primaryFault,
            fault_list:
              primaryFault && !/healthy|normal|good|awaiting/i.test(primaryFault)
                ? [
                    {
                      title: primaryFault,
                      severity: hasWinding
                        ? windingResult.severity
                        : gwResult.severity,
                      confidence: 85,
                      description: hasWinding
                        ? windingResult.recommendation
                        : gwResult.recommendation
                    }
                  ]
                : [],
            peaks: payload.peaks,
            recommendations: [
              hasWinding
                ? windingResult.recommendation
                : gwResult.recommendation
            ],
            financial_impact: {},
            severity: (() => {
              const sev = hasWinding
                ? windingResult.severity
                : gwResult.severity;
              return sev === "CRITICAL"
                ? "CRITICAL"
                : sev === "WARNING"
                  ? "ANOMALY"
                  : "NORMAL";
            })(),
            summary: hasGw
              ? `MCA PDF extract (${file.name}) · IR1m ${extracted.ir1mMOmega ?? "—"} MΩ · PI ${extracted.reportPi ?? gwResult.pi ?? "—"} · DAR ${extracted.reportDar ?? gwResult.dar ?? "—"}`
              : `MCA PDF extract (${file.name}) · ${primaryFault}`,
            consensus_details: {
              modelA_Hypothesis: `PDF ${formatMcaPdfLabel(extracted.formatDetected)}`,
              modelB_Hypothesis: `Confidence ${extracted.confidenceScore}% · GW ${hasGw ? "yes" : "no"}`,
              refereeDebateSummary: JSON.stringify({
                pipeline: "mcaPdfExtract",
                fileName: file.name,
                winding: payload.telemetry_data.winding,
                groundwall: payload.telemetry_data.groundwall,
                extracted: {
                  ir30sMOmega: extracted.ir30sMOmega ?? null,
                  ir1mMOmega: extracted.ir1mMOmega ?? null,
                  ir10mMOmega: extracted.ir10mMOmega ?? null,
                  reportPi: extracted.reportPi ?? null,
                  reportDar: extracted.reportDar ?? null,
                  testVoltageV: extracted.testVoltageV ?? null
                }
              })
            },
            analysis_type: "mca",
            telemetry_data: payload.telemetry_data,
            create_alerts_for_high: false
          });
          // Refresh history so Groundwall IR Input Grid binds to saved row
          const rows = await fetchAnalysisResults({
            asset_id: analysisAssetQueryKey,
            component: selectedComponent?.trim() || undefined,
            limit: 100
          });
          setDbAnalyses(rows);
        } catch (saveErr) {
          console.warn(
            "[TrendAnalyzer] MCA PDF save skipped:",
            saveErr instanceof Error ? saveErr.message : saveErr
          );
        }
      }
    } catch (err) {
      console.warn("[TrendAnalyzer] MCA PDF extract failed:", err);
      setMcaPdfError(
        err instanceof Error ? err.message : "Failed to parse MCA PDF."
      );
    } finally {
      setMcaPdfParsing(false);
    }
  };

  const handleRicPasteFromClipboard = async () => {
    setRicPasteError(null);
    try {
      const text = await navigator.clipboard.readText();
      const parsed = parseRicClipboardText(text);
      if (parsed.length < 3) {
        setRicPasteError(
          "Clipboard needs ≥3 valid rows (Angle, L12, L23, L31). Headers are skipped."
        );
        return;
      }
      mergeMcaRecord({
        rotor_influence: { series: parsed },
        meta: { source: "manual" }
      });
    } catch (err) {
      console.warn("[TrendAnalyzer] RIC clipboard paste failed:", err);
      setRicPasteError(
        "Clipboard access failed — paste into a text field or grant clipboard permission."
      );
    }
  };

  const updateRicRow = (
    index: number,
    key: keyof RicDataPoint,
    value: string
  ) => {
    setMcaRecord((prev) => {
      const next = prev.rotor_influence.series.map((p) => ({ ...p }));
      const row = { ...next[index] };
      const n = Number(value);
      row[key] = Number.isFinite(n) ? n : 0;
      const clean = sanitizeRicPoint(row);
      next[index] = clean || row;
      return deepMergeMcaSsot(prev, {
        rotor_influence: { series: next },
        meta: { source: "manual" }
      });
    });
  };

  const saveRicAsBaseline = () => {
    if (ricData.length === 0) return;
    setRicBaselineData(ricData.map((p) => ({ ...p })));
    setRicCompareBaseline(true);
  };

  const applySurgeParsedPoints = (parsed: SurgeDataPoint[]) => {
    if (parsed.length < 2) {
      setSurgePasteError(
        "Need ≥2 valid rows (Time, V12, V23, V31). Headers and non-numeric rows are skipped."
      );
      return;
    }
    mergeMcaRecord({
      surge: { waveform: parsed },
      meta: { source: "manual" }
    });
    setSurgePasteError(null);
  };

  const handleSurgePasteFromClipboard = async () => {
    setSurgePasteError(null);
    try {
      const text = await navigator.clipboard.readText();
      applySurgeParsedPoints(parseSurgeClipboardText(text));
    } catch (err) {
      console.warn("[TrendAnalyzer] Surge clipboard paste failed:", err);
      setSurgePasteError(
        "Clipboard access failed — grant permission or upload a CSV file."
      );
    }
  };

  const handleSurgeCsvFile = async (file: File | null | undefined) => {
    if (!file) return;
    setSurgePasteError(null);
    try {
      const text = await file.text();
      applySurgeParsedPoints(parseSurgeClipboardText(text));
    } catch (err) {
      console.warn("[TrendAnalyzer] Surge CSV parse failed:", err);
      setSurgePasteError(
        err instanceof Error ? err.message : "Failed to read surge CSV."
      );
    }
  };

  const phaseKeyMap = {
    phaseR: "resistance",
    phaseL: "inductance",
    phaseZ: "impedance",
    phaseFi: "phase_angle",
    phaseIF: "if_ratio"
  } as const;

  const updateMcaPdfTriplet = (
    key: "phaseR" | "phaseL" | "phaseZ" | "phaseFi" | "phaseIF",
    index: 0 | 1 | 2,
    value: string
  ) => {
    const domainKey = phaseKeyMap[key];
    setMcaRecord((prev) => {
      const triplet = [...prev.phase_balance[domainKey]] as [
        number,
        number,
        number
      ];
      const n = Number(value);
      triplet[index] = Number.isFinite(n) ? n : 0;
      return deepMergeMcaSsot(prev, {
        phase_balance: {
          ...prev.phase_balance,
          [domainKey]: triplet
        },
        meta: { source: "manual" }
      });
    });
  };

  const gwFieldToDomain: Record<
    string,
    keyof McaSsotRecord["groundwall"] | "insulation_class"
  > = {
    ir15sMOmega: "ir_15s",
    ir30sMOmega: "ir_30s",
    ir1mMOmega: "ir_1m",
    ir10mMOmega: "ir_10m",
    testVoltageV: "test_voltage",
    windingTempC: "winding_temp_c",
    insulationClass: "insulation_class",
    reportPi: "pi",
    reportDar: "dar"
  };

  const updateMcaGwField = (
    key:
      | "ir15sMOmega"
      | "ir30sMOmega"
      | "ir1mMOmega"
      | "ir10mMOmega"
      | "testVoltageV"
      | "windingTempC"
      | "insulationClass"
      | "reportPi"
      | "reportDar",
    value: string
  ) => {
    const domainKey = gwFieldToDomain[key];
    if (key === "insulationClass") {
      const c = value.toUpperCase();
      const insulation_class =
        c === "A" || c === "B" || c === "F" || c === "H"
          ? (c as InsulationClass)
          : mcaRecord.groundwall.insulation_class || "F";
      mergeMcaRecord({
        groundwall: { insulation_class },
        meta: { source: "manual" }
      });
      return;
    }
    const n = Number(value);
    const num = Number.isFinite(n) ? n : 0;
    mergeMcaRecord({
      groundwall: { [domainKey]: num } as Partial<McaSsotRecord["groundwall"]>,
      meta: { source: "manual" }
    });
  };

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
    "reflectedApparentTemp",
    "ambientReferenceTemp"
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
  const thermoTempUnit = useMemo(
    () => resolveThermoTempUnit(thermoChartSeries),
    [thermoChartSeries]
  );
  const thermoTempAxisLabel = `Temperature (${thermoTempUnit})`;
  const ueBearingAnalyses = useMemo(
    () => ueAnalyses.filter(isUeBearingMechanicalRow),
    [ueAnalyses]
  );
  const ueLeakAnalyses = useMemo(
    () => ueAnalyses.filter(isUeLeakRow),
    [ueAnalyses]
  );
  const ueLeakInventoryRows = useMemo(() => {
    const rows = ueLeakAnalyses.map(ueLeakInventoryFromRow);
    const mult = ueLeakSort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (ueLeakSort.key === "annual_cost") {
        return (a.annualCost - b.annualCost) * mult;
      }
      return (a.dateMs - b.dateMs) * mult;
    });
  }, [ueLeakAnalyses, ueLeakSort]);
  const ueLeakKpis = useMemo(() => {
    let totalAnnualCost = 0;
    let totalCfm = 0;
    let totalCo2 = 0;
    for (const row of ueLeakInventoryRows) {
      totalAnnualCost += safeFinite(row.annualCost, 0);
      totalCfm += safeFinite(row.estimatedCfm, 0);
      totalCo2 += safeFinite(row.co2Emissions, 0);
    }
    return {
      totalAnnualCost: Math.round(totalAnnualCost * 100) / 100,
      totalCfm: Math.round(totalCfm * 10) / 10,
      totalCo2: Math.round(totalCo2 * 10) / 10
    };
  }, [ueLeakInventoryRows]);
  const ueElectricalAnalyses = useMemo(
    () => ueAnalyses.filter(isUeElectricalPdRow),
    [ueAnalyses]
  );
  const uePdInventoryRows = useMemo(() => {
    return [...ueElectricalAnalyses.map(uePdInventoryFromRow)].sort(
      (a, b) => b.dateMs - a.dateMs
    );
  }, [ueElectricalAnalyses]);
  const uePdKpis = useMemo(() => {
    if (uePdInventoryRows.length === 0) {
      return {
        peakElectricalDb: 0,
        avgBaselineDelta: 0,
        threatSeverity: "normal" as UePdSeverity,
        threatLabel: "Normal"
      };
    }
    let maxPeak = 0;
    let deltaSum = 0;
    let topSeverity: UePdSeverity = "normal";
    let topLabel = "Normal";
    for (const row of uePdInventoryRows) {
      maxPeak = Math.max(maxPeak, safeFinite(row.peakDb, 0));
      deltaSum += safeFinite(row.baselineDelta, 0);
      if (pdSeverityRank(row.severity) >= pdSeverityRank(topSeverity)) {
        topSeverity = row.severity;
        topLabel = row.severityLabel;
      }
    }
    return {
      peakElectricalDb: Math.round(maxPeak * 10) / 10,
      avgBaselineDelta:
        Math.round((deltaSum / uePdInventoryRows.length) * 10) / 10,
      threatSeverity: topSeverity,
      threatLabel: topLabel
    };
  }, [uePdInventoryRows]);
  const ueSteamAnalyses = useMemo(
    () => ueAnalyses.filter(isUeSteamTrapRow),
    [ueAnalyses]
  );
  const ueSteamThermoTemps = useMemo(() => {
    const assetKey =
      selectedAsset?.tag ||
      selectedAssetKey ||
      (ueSteamAnalyses[0]?.asset_id ?? "");
    return latestThermoSteamTemps(thermoAnalyses, String(assetKey));
  }, [thermoAnalyses, selectedAsset?.tag, selectedAssetKey, ueSteamAnalyses]);
  const ueSteamInventoryRows = useMemo(() => {
    return [...ueSteamAnalyses]
      .map((r) => ueSteamInventoryFromRow(r, ueSteamThermoTemps))
      .sort((a, b) => b.dateMs - a.dateMs);
  }, [ueSteamAnalyses, ueSteamThermoTemps]);
  const ueSteamKpis = useMemo(() => {
    let totalAnnualCost = 0;
    let criticalCount = 0;
    let blownCount = 0;
    let blockedCount = 0;
    let paybackSum = 0;
    let paybackN = 0;
    for (const row of ueSteamInventoryRows) {
      totalAnnualCost += safeFinite(row.annualCostUsd, 0);
      if (row.severity === "CRITICAL") {
        criticalCount += 1;
        const s = row.status.toLowerCase();
        if (s.includes("blown") || s.includes("live steam")) blownCount += 1;
        if (s.includes("blocked") || s.includes("cold")) blockedCount += 1;
      }
      if (
        row.severity !== "NORMAL" &&
        row.roiPaybackDays != null &&
        row.roiPaybackDays > 0
      ) {
        paybackSum += row.roiPaybackDays;
        paybackN += 1;
      }
    }
    return {
      totalAnnualCost: Math.round(totalAnnualCost * 100) / 100,
      criticalCount,
      blownCount,
      blockedCount,
      avgPaybackDays: paybackN > 0 ? Math.round(paybackSum / paybackN) : null,
      systemHealthy: criticalCount === 0 && paybackN === 0
    };
  }, [ueSteamInventoryRows]);
  const toggleUeLeakSort = (key: "date" | "annual_cost") => {
    setUeLeakSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "date" ? "desc" : "desc" }
    );
  };
  const ueBearingChartSeries = useMemo(() => {
    return [...ueBearingAnalyses]
      .slice()
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
          timestamp: r.timestamp || r.created_at || "",
          rms: up.rms,
          peak: up.peak,
          crest: up.crest,
          health: Number(r.health_score) || null,
          fault: r.primary_fault || "—"
        };
      });
  }, [ueBearingAnalyses]);
  const latestUeBearing =
    ueBearingAnalyses.length > 0 ? ueBearingAnalyses[0] : null;
  const latestUeBearingPeaks = latestUeBearing
    ? uePeaksFromRow(latestUeBearing)
    : null;
  const hasUeBearingSeries = ueBearingChartSeries.some(
    (p) =>
      (typeof p.rms === "number" && Number.isFinite(p.rms)) ||
      (typeof p.peak === "number" && Number.isFinite(p.peak))
  );
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
            {VIB_MODE_OPTIONS.map((mode) => {
              const active = vibMode === mode.id;
              const Icon = mode.Icon;
              const activeClass =
                mode.activeClass ||
                "bg-cyan-500/20 border-cyan-500 text-cyan-400";
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setVibMode(mode.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    active
                      ? activeClass
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}
                >
                  {Icon && (
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        active
                          ? mode.id === "spectral"
                            ? "text-cyan-400"
                            : "opacity-90"
                          : mode.inactiveIconClass || "text-slate-500"
                      }`}
                    />
                  )}
                  {mode.label}
                </button>
              );
            })}
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
      ) : !hasAnyAnalysisData && !hasVibrationDiagnosticRecord ? (
        <div className={`${CARD} mb-6 flex flex-col items-center justify-center text-center py-16 px-6`}>
          <div className="w-12 h-12 rounded-xl border border-slate-700 bg-slate-950 flex items-center justify-center mb-4">
            <Activity className="h-5 w-5 text-slate-500" />
          </div>
          <p className="text-sm font-semibold text-slate-200">
            Awaiting Diagnostic Record — Run Diagnostics and upload a spectrum export
            to populate analysis tabs.
          </p>
          {dbTrendError && (
            <p className="text-xs text-amber-400 mt-3">{dbTrendError}</p>
          )}
        </div>
      ) : (
        <>
      {latestVibrationRecord && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className={CARD}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              Overall Velocity
            </p>
            <p className="text-2xl font-bold text-cyan-400 font-mono">
              {latestVibrationRecord.broadband.overallVelocity > 0
                ? `${latestVibrationRecord.broadband.overallVelocity} mm/s`
                : "—"}
            </p>
          </div>
          <div className={CARD}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              Overall Acceleration
            </p>
            <p className="text-2xl font-bold text-cyan-400 font-mono">
              {latestVibrationRecord.broadband.overallAcceleration > 0
                ? `${latestVibrationRecord.broadband.overallAcceleration} g`
                : "—"}
            </p>
          </div>
          <div className={CARD}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              Health Score
            </p>
            <p className="text-2xl font-bold text-emerald-400 font-mono">
              {latestVibrationRecord.broadband.healthScore}
            </p>
          </div>
          <div className={CARD}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              Primary Fault
            </p>
            <p className="text-sm font-semibold text-amber-300 leading-snug">
              {latestVibrationRecord.broadband.primaryFault || "—"}
            </p>
          </div>
        </div>
      )}
      {/* ===== SECTION 2: KPI RIBBON & PREDICTIVE BANNER ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
            KPI Summary
          </p>
          <ul className="space-y-2.5">
            <li className="text-sm font-bold text-white">
              Health Score:{" "}
              {latestVibrationRecord?.broadband.healthScore ??
                (latestDb?.health_score != null ? latestDb.health_score : "—")}
            </li>
            <li className="text-sm font-semibold text-yellow-500">
              Primary Fault:{" "}
              {latestVibrationRecord?.broadband.primaryFault ||
                latestDb?.primary_fault ||
                "No saved analysis"}
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
              Source:{" "}
              {latestVibrationRecord
                ? vibAnalyses.length
                  ? "PostgreSQL + Trend Record"
                  : "Local cache"
                : "PostgreSQL"}
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
            <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-6 mb-6">
              <div className="mb-4">
                <h3 className="text-base font-bold text-white inline-flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-cyan-400" />
                  Spectral &amp; Harmonics
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Time-series amplitude trend · 1X unbalance, 2X misalignment, overall vibration
                </p>
              </div>

              {isUsingReferenceSpectralTrend && (
                <div className="text-xs text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full inline-flex items-center gap-1 mb-4">
                  <Activity className="h-3 w-3 shrink-0" />
                  Live historical data pending. Displaying reference degradation trend.
                </div>
              )}

              <div className="h-[420px] bg-slate-950 rounded-xl border border-slate-700/80 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={spectralTrendChartData}
                    margin={{ top: 16, right: 24, bottom: 28, left: 48 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      tick={{ fontSize: 11 }}
                      label={{
                        value: "Date",
                        position: "insideBottom",
                        offset: -12,
                        fill: "#64748b",
                        fontSize: 11
                      }}
                    />
                    <YAxis
                      stroke="#38bdf8"
                      tick={{ fontSize: 10 }}
                      label={{
                        value: "Amplitude (mm/s)",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#38bdf8",
                        fontSize: 11
                      }}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="amp1X"
                      name="1X Amplitude (Unbalance)"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="amp2X"
                      name="2X Amplitude (Misalignment)"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="overall"
                      name="Overall Vibration"
                      stroke="#94a3b8"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      dot={{ r: 3 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
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
            <>
              {vibAnalyses.length === 0 ? (
                vibrationAwaitingRecordAlert
              ) : !hasEnvelopingTabData ? (
                <div className={`${CARD} mb-6 flex flex-col items-center justify-center text-center py-16 px-6`}>
                  <Cog className="h-8 w-8 text-slate-500 mb-3" />
                  <p className="text-sm font-semibold text-slate-200">
                    Awaiting Diagnostic Record — Run Diagnostics to populate analysis trends.
                  </p>
                  <p className="text-xs text-slate-500 mt-2 max-w-md">
                    Saved vibration analyses for this asset have no enveloping / acceleration metrics yet.
                  </p>
                </div>
              ) : (
                <>
                  {envelopeBaselineCompare && (
                    <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-amber-200">
                          Peak g<sub>E</sub>{" "}
                          {envelopeBaselineCompare.gePct >= 0 ? "increased" : "decreased"} by{" "}
                          <span className="font-mono">
                            {envelopeBaselineCompare.gePct >= 0 ? "+" : ""}
                            {envelopeBaselineCompare.gePct.toFixed(0)}%
                          </span>{" "}
                          since baseline on {envelopeBaselineCompare.baselineDate}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Baseline {envelopeBaselineCompare.baselineGe.toFixed(3)} gE → current{" "}
                          {envelopeBaselineCompare.currentGe.toFixed(3)} gE
                          {envelopeBaselineCompare.kurtPct != null
                            ? ` · Kurtosis ${
                                envelopeBaselineCompare.kurtPct >= 0 ? "+" : ""
                              }${envelopeBaselineCompare.kurtPct.toFixed(0)}%`
                            : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEnvelopeBaseline(null)}
                        className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                      >
                        Clear baseline
                      </button>
                    </div>
                  )}
                  {envelopeBaselineError && (
                    <p className="text-xs text-amber-400 mb-4">{envelopeBaselineError}</p>
                  )}

                  {/* Calculated bearing fault frequency badges */}
                  <div className="mb-6">
                    <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
                      <div>
                        <h3 className="text-base font-bold text-white">
                          Bearing Fault Frequency Calculator
                        </h3>
                        <p className="text-xs text-slate-500">
                          {calculatedBearingFaults
                            ? `${machineSpecs.bearing} @ ${calculatedBearingFaults.rpm} RPM · 1X = ${calculatedBearingFaults.shaftHz.toFixed(2)} Hz · source ${calculatedBearingFaults.geometry.source}`
                            : "Configure DE bearing part # and RPM on the asset to calculate BPFO / BPFI / BSF / FTF"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {(
                        [
                          ["BPFO", "Outer Race", calculatedBearingFaults?.bpfo, "border-red-500/40 text-red-400"],
                          ["BPFI", "Inner Race", calculatedBearingFaults?.bpfi, "border-purple-500/40 text-purple-400"],
                          ["BSF", "Ball Spin", calculatedBearingFaults?.bsf, "border-orange-500/40 text-orange-400"],
                          ["FTF", "Cage / Train", calculatedBearingFaults?.ftf, "border-cyan-500/40 text-cyan-400"]
                        ] as const
                      ).map(([key, sub, hz, tone]) => (
                        <div
                          key={key}
                          className={`rounded-xl border bg-slate-950/60 px-4 py-3 ${tone}`}
                        >
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                            {key}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
                          <p className="text-2xl font-bold font-mono mt-2 text-white">
                            {hz != null && hz > 0 ? `${hz.toFixed(2)} Hz` : "—"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Latest measured enveloping peaks */}
                  {(vibExtractedEnvelopeChart.length > 0 ||
                    latestEnvelopingPoint) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                      <div className={CARD}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                          Peak g<sub>E</sub>
                        </p>
                        <p className="text-2xl font-bold text-amber-400 font-mono">
                          {latestEnvelopingPoint?.peakGe != null
                            ? `${latestEnvelopingPoint.peakGe.toFixed(3)}`
                            : "—"}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">gE / gSE</p>
                      </div>
                      <div className={CARD}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                          Kurtosis / Crest
                        </p>
                        <p className="text-2xl font-bold text-cyan-400 font-mono">
                          {latestEnvelopingPoint?.kurtosis != null
                            ? latestEnvelopingPoint.kurtosis.toFixed(2)
                            : "—"}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          From waveform / telemetry
                        </p>
                      </div>
                      <div className={CARD}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                          Accel (g)
                        </p>
                        <p className="text-2xl font-bold text-orange-400 font-mono">
                          {latestEnvelopingPoint?.overallAcceleration != null
                            ? latestEnvelopingPoint.overallAcceleration.toFixed(3)
                            : latestVibrationRecord?.broadband.overallAcceleration
                              ? latestVibrationRecord.broadband.overallAcceleration.toFixed(3)
                              : "—"}
                        </p>
                      </div>
                      <div className={CARD}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                          Health
                        </p>
                        <p className="text-2xl font-bold text-yellow-400 font-mono">
                          {latestEnvelopingPoint?.healthScore != null
                            ? latestEnvelopingPoint.healthScore
                            : "—"}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className={CARD}>
                      <h3 className="text-base font-bold text-white mb-1">
                        Peak g<sub>E</sub> Trend
                      </h3>
                      <p className="text-xs text-slate-500 mb-3">
                        Real demodulation / acceleration envelope from diagnostic history
                      </p>
                      <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                        {envelopingGeChartData.length === 0 ? (
                          <div className="h-full flex items-center justify-center px-4 text-center">
                            <p className="text-sm text-slate-500">
                              No recorded g<sub>E</sub> values yet — run a diagnostic with enveloping / acceleration data.
                            </p>
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={envelopingGeChartData}
                              margin={chartMargin}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                              <XAxis
                                dataKey="date"
                                stroke="#94a3b8"
                                tick={{ fontSize: 11 }}
                              />
                              <YAxis stroke="#eab308" tick={{ fontSize: 11 }} />
                              <Tooltip contentStyle={tooltipStyle} />
                              {envelopeBaseline?.peakGe != null &&
                                envelopeBaseline.peakGe > 0 && (
                                  <ReferenceLine
                                    y={envelopeBaseline.peakGe}
                                    stroke="#f59e0b"
                                    strokeDasharray="6 4"
                                    label={{
                                      value: `Baseline ${envelopeBaseline.peakGe.toFixed(2)} gE`,
                                      fill: "#f59e0b",
                                      fontSize: 10,
                                      position: "insideTopRight"
                                    }}
                                  />
                                )}
                              <Line
                                type="monotone"
                                dataKey="peakGe"
                                stroke="#eab308"
                                strokeWidth={2.5}
                                name="Peak gE"
                                dot={{ r: 4 }}
                                connectNulls={false}
                                isAnimationActive={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>

                    <div className={CARD}>
                      <h3 className="text-base font-bold text-white mb-1">
                        Kurtosis Trend
                      </h3>
                      <p className="text-xs text-slate-500 mb-3">
                        Crest / kurtosis from waveform metrics — gaps omitted (no zero fill)
                      </p>
                      <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                        {envelopingKurtosisChartData.length === 0 ? (
                          <div className="h-full flex items-center justify-center px-4 text-center">
                            <p className="text-sm text-slate-500">
                              No kurtosis / crest factor recorded yet.
                            </p>
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={envelopingKurtosisChartData}
                              margin={chartMargin}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                              <XAxis
                                dataKey="date"
                                stroke="#94a3b8"
                                tick={{ fontSize: 11 }}
                              />
                              <YAxis stroke="#22d3ee" tick={{ fontSize: 11 }} />
                              <Tooltip contentStyle={tooltipStyle} />
                              {envelopeBaseline?.kurtosis != null &&
                                envelopeBaseline.kurtosis > 0 && (
                                  <ReferenceLine
                                    y={envelopeBaseline.kurtosis}
                                    stroke="#22d3ee"
                                    strokeDasharray="6 4"
                                    label={{
                                      value: "Baseline",
                                      fill: "#22d3ee",
                                      fontSize: 10,
                                      position: "insideTopRight"
                                    }}
                                  />
                                )}
                              <Line
                                type="monotone"
                                dataKey="kurtosis"
                                stroke="#22d3ee"
                                strokeWidth={2.5}
                                name="Kurtosis"
                                dot={{ r: 4 }}
                                connectNulls={false}
                                isAnimationActive={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  </div>

                  {vibExtractedEnvelopeChart.length > 0 && (
                    <div className={`${CARD} mb-6`}>
                      <h3 className="text-base font-bold text-white mb-1">
                        Measured Bearing Band Amplitudes
                      </h3>
                      <p className="text-xs text-slate-500 mb-4">
                        From latest diagnostic enveloping peaks
                        {latestVibrationRecord?.extractionConfidence != null
                          ? ` · confidence ${latestVibrationRecord.extractionConfidence}%`
                          : ""}
                        {calculatedBearingFaults
                          ? ` · match vs calc BPFO ${calculatedBearingFaults.bpfo.toFixed(1)} Hz / BPFI ${calculatedBearingFaults.bpfi.toFixed(1)} Hz`
                          : ""}
                      </p>
                      <div className="h-[320px] bg-slate-950 rounded-lg border border-white/10 p-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={vibExtractedEnvelopeChart}
                            margin={{ top: 12, right: 16, bottom: 28, left: 48 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis
                              dataKey="label"
                              stroke="#94a3b8"
                              tick={{ fontSize: 11 }}
                            />
                            <YAxis
                              stroke="#f59e0b"
                              tick={{ fontSize: 10 }}
                              label={{
                                value: "Amplitude",
                                angle: -90,
                                position: "insideLeft",
                                fill: "#f59e0b",
                                fontSize: 11
                              }}
                            />
                            <Tooltip
                              contentStyle={tooltipStyle}
                              formatter={(value, _n, props) => [
                                `${Number(value).toFixed(3)} @ ${
                                  (props?.payload as { frequency?: number })
                                    ?.frequency ?? "—"
                                } Hz`,
                                "Amplitude"
                              ]}
                            />
                            <Bar
                              dataKey="amplitude"
                              fill="#f59e0b"
                              name="Amplitude"
                              isAnimationActive={false}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* History table with Set as Baseline */}
                  <div className={`${CARD} mb-2`}>
                    <h3 className="text-base font-bold text-white mb-1">
                      Enveloping History
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">
                      PostgreSQL analysis_results for this asset · Set any row as baseline for % change
                    </p>
                    {envelopingTrendSeries.length === 0 ? (
                      <p className="text-sm text-slate-500 py-8 text-center">
                        No enveloping metrics in saved diagnostics yet.
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-white/10">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-950/80 text-slate-400 text-left text-[10px] uppercase tracking-widest">
                              <th className="px-3 py-2 font-bold">Date</th>
                              <th className="px-3 py-2 font-bold">Peak gE</th>
                              <th className="px-3 py-2 font-bold">Kurtosis</th>
                              <th className="px-3 py-2 font-bold">Health</th>
                              <th className="px-3 py-2 font-bold">Fault</th>
                              <th className="px-3 py-2 font-bold">Baseline</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...envelopingTrendSeries].reverse().map((row) => {
                              const isBase =
                                envelopeBaseline?.analysisId === row.analysisId;
                              return (
                                <tr
                                  key={row.analysisId}
                                  className={`border-t border-white/10 ${
                                    isBase ? "bg-amber-500/5" : ""
                                  }`}
                                >
                                  <td className="px-3 py-2.5 text-white font-medium">
                                    {row.date}
                                  </td>
                                  <td className="px-3 py-2.5 text-amber-300 font-mono text-xs">
                                    {row.peakGe != null
                                      ? row.peakGe.toFixed(3)
                                      : "—"}
                                  </td>
                                  <td className="px-3 py-2.5 text-cyan-300 font-mono text-xs">
                                    {row.kurtosis != null
                                      ? row.kurtosis.toFixed(2)
                                      : "—"}
                                  </td>
                                  <td className="px-3 py-2.5 text-slate-300 font-mono text-xs">
                                    {row.healthScore != null
                                      ? row.healthScore
                                      : "—"}
                                  </td>
                                  <td className="px-3 py-2.5 text-slate-400 text-xs max-w-[180px] truncate">
                                    {row.primaryFault}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <button
                                      type="button"
                                      disabled={envelopeBaselineBusy}
                                      onClick={() => handleSetEnvelopeBaseline(row)}
                                      className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded border cursor-pointer transition-colors ${
                                        isBase
                                          ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                                          : "bg-slate-800 border-slate-600 text-slate-300 hover:border-amber-500/40 hover:text-amber-200"
                                      }`}
                                    >
                                      {isBase ? "Baseline" : "Set as Baseline"}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {vibMode === "waveform" && (
            <WaveformTab
              rpm={waveformRpm}
              trendPoints={waveformTrendSeries}
              latestMetrics={latestWaveformAnalysisMetrics}
              waveformSamples={vibExtractedWaveformChart}
              emptyAlert={vibrationAwaitingRecordAlert}
              analysesCount={vibAnalyses.length}
            />
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
                      <p
                        className={`text-2xl font-bold flex items-center gap-2 ${
                          radioKpis.latest?.emissivity != null
                            ? "text-purple-400"
                            : "text-slate-400"
                        }`}
                      >
                        {radioKpis.latest?.emissivity != null
                          ? `ε = ${radioKpis.latest.emissivity}`
                          : "Not Configured"}
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
                          : "From telemetry environmental settings"}
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        Palette Span Range
                      </p>
                      <p
                        className={`text-2xl font-bold ${
                          radioKpis.paletteConfigured
                            ? "text-cyan-400"
                            : "text-slate-400"
                        }`}
                      >
                        {radioKpis.paletteConfigured
                          ? `Range: ${radioKpis.paletteSpan}°`
                          : "Not Configured"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 font-mono">
                        {radioKpis.paletteConfigured
                          ? `${radioKpis.latest!.scaleMin}° → ${radioKpis.latest!.scaleMax}°`
                          : "Camera scale pending"}
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        Isotherm Alarm Status
                      </p>
                      <p
                        className={`text-2xl font-bold ${
                          radioKpis.isothermConfigured
                            ? "text-orange-400"
                            : "text-slate-400"
                        }`}
                      >
                        {radioKpis.isothermConfigured
                          ? `Active: >${radioKpis.latest!.isothermThreshold}°`
                          : "Not Configured"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {radioKpis.isothermConfigured
                          ? "Isotherm filter engaged"
                          : "Camera measurement settings pending"}
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        ROI Statistical Mean
                      </p>
                      <p
                        className={`text-2xl font-bold ${
                          radioKpis.boxAverageConfigured
                            ? "text-green-400"
                            : "text-slate-400"
                        }`}
                      >
                        {radioKpis.boxAverageConfigured
                          ? `Box Avg: ${radioKpis.latest!.boxAverage}°`
                          : "Awaiting AI Extraction"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {radioKpis.latest?.reflectedApparentTemp != null
                          ? `Reflected: ${radioKpis.latest.reflectedApparentTemp}°`
                          : radioKpis.boxAverageConfigured
                            ? "Baseline thermal creep tracking"
                            : "ROI statistics not yet available"}
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
                          ? "Environmental & radiometric fields will appear as scans include them"
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
                            value: thermoTempAxisLabel,
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
            {UE_MODE_OPTIONS.map((mode) => {
              const Icon = mode.Icon;
              const isActive = ueMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setUeMode(mode.id)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    isActive
                      ? "bg-cyan-500/20 border-cyan-500 text-cyan-300"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-md border shrink-0 ${mode.iconClass}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {mode.label}
                </button>
              );
            })}
          </div>

          {dbTrendLoading ? (
            <div className={`${CARD} mb-6 flex flex-col items-center justify-center text-center py-16 px-6`}>
              <p className="text-sm font-semibold text-slate-200">Loading ultrasound trends…</p>
            </div>
          ) : !hasUltrasoundData ? (
            <TechEmptyState technology="Ultrasound" />
          ) : ueMode === "bearings" ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Acoustic Friction (RMS dB)
                  </p>
                  <p className="text-2xl font-bold text-sky-400 font-mono">
                    {latestUeBearingPeaks?.rms != null
                      ? `${latestUeBearingPeaks.rms} dBµV`
                      : "—"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Latest mechanical / bearing scan RMS
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Impact Severity (Peak dB)
                  </p>
                  <p className="text-2xl font-bold text-orange-400 font-mono">
                    {latestUeBearingPeaks?.peak != null
                      ? `${latestUeBearingPeaks.peak} dBµV`
                      : "—"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Peak acoustic amplitude vs baseline
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Crest Factor
                  </p>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    {latestUeBearingPeaks?.crest != null
                      ? latestUeBearingPeaks.crest
                      : "—"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Peak dB - RMS dB — early bearing defect indicator
                  </p>
                </div>
              </div>

              <ThermoChartFrame
                title="Bearings & Mechanical — RMS / Peak acoustic trend"
                subtitle="Solid: RMS dBµV (friction) · Dashed: Peak dBµV (impact) · From analysis_results.peaks"
                overlay={
                  !hasUeBearingSeries
                    ? "No mechanical / bearing ultrasound metrics in saved scans yet"
                    : null
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={ueBearingChartSeries}
                    margin={chartMargin}
                  >
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
                        value: "Level (dBµV)",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#64748b",
                        fontSize: 11
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #334155",
                        borderRadius: 8
                      }}
                    />
                    <Legend verticalAlign="bottom" height={28} />
                    <Line
                      type="monotone"
                      dataKey="rms"
                      name="RMS dBµV"
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="peak"
                      name="Peak dBµV"
                      stroke="#f97316"
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </ThermoChartFrame>

              <div className={`${CARD} mb-6 overflow-x-auto`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Saved Mechanical / Bearing Scans
                </p>
                {ueBearingAnalyses.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center">
                    No mechanical-mode ultrasound rows for this asset yet. Run a
                    Mechanical / Bearing diagnostic to populate this table.
                  </p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                        <th className="py-2 pr-3 font-bold">Date</th>
                        <th className="py-2 pr-3 font-bold">RMS</th>
                        <th className="py-2 pr-3 font-bold">Peak</th>
                        <th className="py-2 pr-3 font-bold">Crest</th>
                        <th className="py-2 pr-3 font-bold">Fault</th>
                        <th className="py-2 pr-3 font-bold">Health</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ueBearingAnalyses.map((r) => {
                        const up = uePeaksFromRow(r);
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
                              {up.rms != null ? up.rms : "—"}
                            </td>
                            <td className="py-2 pr-3 font-mono">
                              {up.peak != null ? up.peak : "—"}
                            </td>
                            <td className="py-2 pr-3 font-mono">
                              {up.crest != null ? up.crest : "—"}
                            </td>
                            <td className="py-2 pr-3">{r.primary_fault || "—"}</td>
                            <td className="py-2 pr-3 font-mono">
                              {r.health_score ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : ueMode === "leaks" ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Total Annual Waste
                  </p>
                  <p className="text-2xl font-bold text-red-400 font-mono">
                    {formatUsdPerYear(ueLeakKpis.totalAnnualCost)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Sum of active leak annual energy cost
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Total Flow Loss
                  </p>
                  <p className="text-2xl font-bold text-sky-400 font-mono">
                    {ueLeakKpis.totalCfm.toFixed(1)} CFM
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Continuous compressed-air loss across inventory
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Total Carbon Footprint
                  </p>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    {ueLeakKpis.totalCo2.toFixed(1)} MT CO₂e/yr
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    EPA eGRID CO₂e from compressor energy waste
                  </p>
                </div>
              </div>

              <div className={`${CARD} mb-6 overflow-x-auto`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Active Leak Inventory
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Sort by Date or Annual Cost · severity from $/yr thresholds
                  </p>
                </div>
                {ueLeakInventoryRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                    <div className="w-12 h-12 rounded-xl border border-sky-500/40 bg-sky-500/10 text-sky-400 flex items-center justify-center mb-4">
                      <Wind className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-semibold text-slate-200 max-w-lg">
                      No compressed air leaks detected for this asset. Run an
                      ultrasound diagnostic in Leak Detection mode to populate
                      this inventory.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                        <th className="py-2 pr-3 font-bold">
                          <button
                            type="button"
                            onClick={() => toggleUeLeakSort("date")}
                            className="inline-flex items-center gap-1 cursor-pointer hover:text-slate-300 bg-transparent border-0 p-0 text-[10px] font-bold uppercase tracking-wider text-slate-500"
                          >
                            Date
                            {ueLeakSort.key === "date"
                              ? ueLeakSort.dir === "asc"
                                ? " ↑"
                                : " ↓"
                              : ""}
                          </button>
                        </th>
                        <th className="py-2 pr-3 font-bold">Peak Level</th>
                        <th className="py-2 pr-3 font-bold">Est. Orifice</th>
                        <th className="py-2 pr-3 font-bold">Flow Loss</th>
                        <th className="py-2 pr-3 font-bold">
                          <button
                            type="button"
                            onClick={() => toggleUeLeakSort("annual_cost")}
                            className="inline-flex items-center gap-1 cursor-pointer hover:text-slate-300 bg-transparent border-0 p-0 text-[10px] font-bold uppercase tracking-wider text-slate-500"
                          >
                            Annual Cost ($/yr)
                            {ueLeakSort.key === "annual_cost"
                              ? ueLeakSort.dir === "asc"
                                ? " ↑"
                                : " ↓"
                              : ""}
                          </button>
                        </th>
                        <th className="py-2 pr-3 font-bold">CO₂ Impact</th>
                        <th className="py-2 pr-3 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ueLeakInventoryRows.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b border-slate-800/80 text-slate-300"
                        >
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            {row.dateLabel}
                          </td>
                          <td className="py-2.5 pr-3 font-mono">
                            {safeFinite(row.peakDb, 0).toFixed(1)} dBµV
                          </td>
                          <td className="py-2.5 pr-3 font-mono">
                            {safeFinite(row.orificeSize, 0).toFixed(4)} in
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-sky-300">
                            {safeFinite(row.estimatedCfm, 0).toFixed(2)} CFM
                          </td>
                          <td
                            className={`py-2.5 pr-3 font-mono font-semibold ${leakCostTextClass(row.severity)}`}
                          >
                            {formatUsdPerYear(safeFinite(row.annualCost, 0))}
                          </td>
                          <td className="py-2.5 pr-3 font-mono">
                            {safeFinite(row.co2Emissions, 0).toFixed(2)} MT/yr
                          </td>
                          <td className="py-2.5 pr-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${leakCostBadgeClass(row.severity)}`}
                            >
                              Active Leak
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : ueMode === "electrical" ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Peak Electrical dB
                  </p>
                  <p className="text-2xl font-bold text-yellow-400 font-mono">
                    {uePdKpis.peakElectricalDb.toFixed(1)} dBµV
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Max peak_dbmv across electrical / PD scans
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Avg Baseline Delta
                  </p>
                  <p className="text-2xl font-bold text-sky-400 font-mono">
                    {uePdKpis.avgBaselineDelta.toFixed(1)} dB
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Mean peak − baseline across PD event history
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Threat Level
                  </p>
                  <p
                    className={`text-2xl font-bold font-mono ${pdSeverityTextClass(uePdKpis.threatSeverity)}`}
                  >
                    {uePdInventoryRows.length === 0
                      ? "—"
                      : uePdKpis.threatLabel}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Highest severity from peak dBµV thresholds
                  </p>
                </div>
              </div>

              <div className={`${CARD} mb-6 overflow-x-auto`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    PD Event History
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Phase 1 · dB thresholds · PRPD / env AI stubs reserved
                  </p>
                </div>
                {uePdInventoryRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                    <div className="w-12 h-12 rounded-xl border border-yellow-500/40 bg-yellow-500/10 text-yellow-400 flex items-center justify-center mb-4">
                      <Zap className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-semibold text-slate-200 max-w-lg">
                      No electrical PD events detected for this asset. Run an
                      ultrasound diagnostic in Electrical mode to populate this
                      history.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                        <th className="py-2 pr-3 font-bold">Date</th>
                        <th className="py-2 pr-3 font-bold">Peak Level</th>
                        <th className="py-2 pr-3 font-bold">Baseline Delta</th>
                        <th className="py-2 pr-3 font-bold">Classification</th>
                        <th className="py-2 pr-3 font-bold">Severity Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uePdInventoryRows.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b border-slate-800/80 text-slate-300"
                        >
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            {row.dateLabel}
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-yellow-300">
                            {safeFinite(row.peakDb, 0).toFixed(1)} dBµV
                          </td>
                          <td className="py-2.5 pr-3 font-mono">
                            {safeFinite(row.baselineDelta, 0).toFixed(1)} dB
                          </td>
                          <td className="py-2.5 pr-3">{row.classification}</td>
                          <td className="py-2.5 pr-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${pdSeverityBadgeClass(row.severity)}`}
                            >
                              {row.severityLabel}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : ueMode === "steam" ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Total Annual Steam Waste
                  </p>
                  <p className="text-2xl font-bold text-red-400 font-mono">
                    {formatUsdPerYear(ueSteamKpis.totalAnnualCost)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Domain-safe Napier / subsonic mass-loss economics
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Critical Fault Traps
                  </p>
                  <p className="text-2xl font-bold text-orange-400 font-mono">
                    {ueSteamKpis.criticalCount}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {ueSteamKpis.blownCount} Blown-Through •{" "}
                    {ueSteamKpis.blockedCount} Blocked
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Avg Repair Payback
                  </p>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    {ueSteamKpis.avgPaybackDays != null
                      ? `${ueSteamKpis.avgPaybackDays} days`
                      : "N/A - System Healthy"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Mean ROI days across active failing traps
                  </p>
                </div>
              </div>

              <div className={`${CARD} mb-6 overflow-x-auto`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Steam Trap Inventory
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Priority fusion matrix · thermal{" "}
                    {ueSteamThermoTemps.upstreamTemp != null &&
                    ueSteamThermoTemps.downstreamTemp != null
                      ? "linked"
                      : "optional / unavailable"}
                  </p>
                </div>
                {ueSteamInventoryRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                    <div className="w-12 h-12 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-4">
                      <Droplets className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-semibold text-slate-200 max-w-lg">
                      No steam trap diagnostics for this asset. Run an ultrasound
                      scan in Valves &amp; Steam Traps mode (mode = steam_trap)
                      to populate this inventory.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                        <th className="py-2 pr-3 font-bold">Date</th>
                        <th className="py-2 pr-3 font-bold">Trap ID / Type</th>
                        <th className="py-2 pr-3 font-bold">Pressure &amp; ΔT</th>
                        <th className="py-2 pr-3 font-bold">Acoustic Level</th>
                        <th className="py-2 pr-3 font-bold">Fusion Status</th>
                        <th className="py-2 pr-3 font-bold">Annual Waste</th>
                        <th className="py-2 pr-3 font-bold">Payback</th>
                        <th className="py-2 pr-3 font-bold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ueSteamInventoryRows.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b border-slate-800/80 text-slate-300"
                        >
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            {row.dateLabel}
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="font-semibold text-slate-200">
                              {row.trapId}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {row.trapType}
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-xs">
                            <div>{safeFinite(row.pressurePsig, 0)} psig</div>
                            <div className="text-slate-500">
                              {row.tempDrop != null
                                ? `ΔT ${row.tempDrop.toFixed(1)} °F`
                                : "ΔT N/A"}
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-cyan-300">
                            {safeFinite(row.peakDb, 0).toFixed(1)} dBµV
                          </td>
                          <td className="py-2.5 pr-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold tracking-wider ${steamSeverityBadgeClass(row.severity)}`}
                              title={row.action}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td
                            className={`py-2.5 pr-3 font-mono font-semibold ${steamSeverityTextClass(row.severity)}`}
                          >
                            {formatUsdPerYear(safeFinite(row.annualCostUsd, 0))}
                          </td>
                          <td className="py-2.5 pr-3 font-mono">
                            {row.roiPaybackDays != null
                              ? `${row.roiPaybackDays} days`
                              : "—"}
                          </td>
                          <td className="py-2.5 pr-3">
                            <button
                              type="button"
                              onClick={() => {
                                window.alert(
                                  `Generate Work Order\n\nTrap: ${row.trapId} (${row.trapType})\nStatus: ${row.status}\nAction: ${row.action}\nAnnual Waste: ${formatUsdPerYear(row.annualCostUsd)}\nPayback: ${row.roiPaybackDays != null ? `${row.roiPaybackDays} days` : "N/A"}`
                                );
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 cursor-pointer whitespace-nowrap"
                            >
                              Generate Work Order
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : null}
        </>
      )}

      {/* ===== MCA TECH CONTENT ===== */}
      {trendTech === "mca" && (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {MCA_MODE_OPTIONS.map((mode) => {
              const Icon = mode.Icon;
              const isActive = mcaMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setMcaMode(mode.id)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    isActive
                      ? mode.activeClass
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-md border shrink-0 ${mode.iconClass}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {mode.label}
                </button>
              );
            })}
          </div>

          {dbTrendLoading ? (
            <div className={`${CARD} mb-6 flex flex-col items-center justify-center text-center py-16 px-6`}>
              <p className="text-sm font-semibold text-slate-200">Loading MCA trends…</p>
            </div>
          ) : mcaMode === "winding" ? (
            <>
              {hasMcaWindingData && !mcaPdfParsing ? (
                <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-emerald-200">
                      {mcaExtractLoaded
                        ? `Winding loaded from ${formatMcaPdfLabel(mcaExtractFormat)} extract`
                        : mcaMetaSource === "telemetry"
                          ? "Winding loaded from saved MCA telemetry"
                          : "Winding data loaded"}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Phase balance R / L / Z / Fi / I-F
                      {mcaExtractLoaded && mcaExtractConfidence > 0
                        ? ` · Confidence ${mcaExtractConfidence}%`
                        : ""}
                      {mcaPdfFileName ? ` · ${mcaPdfFileName}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={mcaPdfInputRef}
                      type="file"
                      accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        void handleMcaPdfFile(f);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => mcaPdfInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-600 bg-slate-900 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200 cursor-pointer"
                    >
                      Replace PDF / screenshot
                    </button>
                  </div>
                </div>
              ) : (
              <div
                className={`mb-6 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  mcaPdfDragOver
                    ? "border-cyan-400 bg-cyan-500/10"
                    : "border-cyan-500/30 hover:border-cyan-400 bg-slate-900/50"
                }`}
                onClick={() => mcaPdfInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setMcaPdfDragOver(true);
                }}
                onDragLeave={() => setMcaPdfDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setMcaPdfDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  void handleMcaPdfFile(f);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    mcaPdfInputRef.current?.click();
                  }
                }}
              >
                <input
                  ref={mcaPdfInputRef}
                  type="file"
                  accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    void handleMcaPdfFile(f);
                    e.target.value = "";
                  }}
                />
                <div className="flex flex-col items-center gap-3">
                  {mcaPdfParsing ? (
                    <>
                      <Loader2 className="h-8 w-8 text-cyan-400 animate-spin" />
                      <p className="text-sm font-semibold text-cyan-300">
                        Parsing MCA report…
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                        <Upload className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-semibold text-slate-200">
                        Upload MCA Test PDF or screenshot (ALL-TEST / Megger / Baker)
                      </p>
                      <p className="text-xs text-slate-500 max-w-md">
                        Text PDFs parse locally; PNG/JPEG screenshots use vision (GPT-4o / Qwen)
                        to fill phase balance grids.
                      </p>
                    </>
                  )}
                </div>
                {mcaPdfError && (
                  <p className="mt-3 text-xs text-amber-400">{mcaPdfError}</p>
                )}
              </div>
              )}

              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMcaManualEdit((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    mcaManualEdit
                      ? "bg-cyan-500/15 border-cyan-500 text-cyan-300"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  Manual Entry / Edit Values
                </button>
                {mcaExtractLoaded && (
                  <button
                    type="button"
                    onClick={() => {
                      mergeMcaRecord({
                        phase_balance: {
                          resistance: [0, 0, 0],
                          inductance: [0, 0, 0],
                          impedance: [0, 0, 0],
                          phase_angle: [0, 0, 0],
                          if_ratio: [0, 0, 0]
                        },
                        meta: { source: "manual" }
                      });
                      setMcaPdfFileName(null);
                      setMcaPdfError(null);
                      setMcaManualEdit(false);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 cursor-pointer"
                  >
                    Clear Winding Data
                  </button>
                )}
              </div>

              {mcaManualEdit && (
                <div className={`${CARD} mb-6`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                    Manual Phase Metrics (T1-T2 · T2-T3 · T3-T1)
                  </p>
                  {(
                    [
                      ["phaseR", "R (Ω)"],
                      ["phaseL", "L (mH)"],
                      ["phaseZ", "Z (Ω)"],
                      ["phaseFi", "Fi (°)"],
                      ["phaseIF", "I/F (%)"]
                    ] as const
                  ).map(([key, label]) => (
                    <div
                      key={key}
                      className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2 items-center"
                    >
                      <span className="text-xs text-slate-400 font-semibold">
                        {label}
                      </span>
                      {([0, 1, 2] as const).map((idx) => (
                        <input
                          key={idx}
                          type="number"
                          step="any"
                          placeholder="—"
                          value={
                            mcaWindingParams[key][idx] === 0
                              ? ""
                              : mcaWindingParams[key][idx]
                          }
                          onChange={(e) =>
                            updateMcaPdfTriplet(key, idx, e.target.value)
                          }
                          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none font-mono"
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}

              <div className={`${CARD} mb-6 overflow-x-auto`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Phase Input / Summary Grid
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {mcaExtractLoaded
                      ? `PDF · ${formatMcaPdfLabel(mcaExtractFormat)}`
                      : mcaWindingParams.fromTelemetry
                        ? "From saved MCA telemetry"
                        : "Awaiting Data · upload PDF or use Manual Entry"}
                    {hasMcaWindingData && mcaWindingResult.tempCorrected
                      ? " · R @ 25°C copper correction"
                      : ""}
                  </p>
                </div>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                      <th className="py-2 pr-3 font-bold">Parameter</th>
                      <th className="py-2 pr-3 font-bold font-mono">T1-T2</th>
                      <th className="py-2 pr-3 font-bold font-mono">T2-T3</th>
                      <th className="py-2 pr-3 font-bold font-mono">T3-T1</th>
                      <th className="py-2 pr-3 font-bold">% Unbalance</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    <tr className="border-b border-slate-800/80">
                      <td className="py-2 pr-3">
                        R (Ω)
                        {hasMcaWindingData && mcaWindingResult.tempCorrected
                          ? " @25°C"
                          : ""}
                      </td>
                      <td className="py-2 pr-3 font-mono text-cyan-300">
                        {mcaFmtCell(mcaWindingResult.phaseR25[0], 3)}
                      </td>
                      <td className="py-2 pr-3 font-mono text-cyan-300">
                        {mcaFmtCell(mcaWindingResult.phaseR25[1], 3)}
                      </td>
                      <td className="py-2 pr-3 font-mono text-cyan-300">
                        {mcaFmtCell(mcaWindingResult.phaseR25[2], 3)}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {hasMcaWindingData
                          ? `${mcaWindingResult.unbalanceR.toFixed(2)}%`
                          : "---"}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-800/80">
                      <td className="py-2 pr-3">L (mH)</td>
                      <td className="py-2 pr-3 font-mono">
                        {mcaFmtCell(mcaWindingParams.phaseL[0], 2)}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {mcaFmtCell(mcaWindingParams.phaseL[1], 2)}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {mcaFmtCell(mcaWindingParams.phaseL[2], 2)}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {hasMcaWindingData
                          ? `${mcaWindingResult.unbalanceL.toFixed(2)}%`
                          : "---"}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-800/80">
                      <td className="py-2 pr-3">Z (Ω)</td>
                      <td className="py-2 pr-3 font-mono">
                        {mcaFmtCell(mcaWindingParams.phaseZ[0], 2)}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {mcaFmtCell(mcaWindingParams.phaseZ[1], 2)}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {mcaFmtCell(mcaWindingParams.phaseZ[2], 2)}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {hasMcaWindingData
                          ? `${mcaWindingResult.unbalanceZ.toFixed(2)}%`
                          : "---"}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-800/80">
                      <td className="py-2 pr-3">Phase Angle Fi (°)</td>
                      <td className="py-2 pr-3 font-mono">
                        {mcaFmtCell(mcaWindingParams.phaseFi[0], 1)}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {mcaFmtCell(mcaWindingParams.phaseFi[1], 1)}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {mcaFmtCell(mcaWindingParams.phaseFi[2], 1)}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {hasMcaWindingData
                          ? `${mcaWindingResult.unbalanceFi.toFixed(2)}%`
                          : "---"}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-800/80">
                      <td className="py-2 pr-3">I/F (%)</td>
                      <td className="py-2 pr-3 font-mono">
                        {mcaFmtCell(mcaWindingParams.phaseIF[0], 1)}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {mcaFmtCell(mcaWindingParams.phaseIF[1], 1)}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {mcaFmtCell(mcaWindingParams.phaseIF[2], 1)}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {hasMcaWindingData
                          ? `${mcaWindingResult.unbalanceIF.toFixed(2)}%`
                          : "---"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Max Phase Unbalance
                  </p>
                  <p className="text-2xl font-bold text-cyan-400 font-mono">
                    {hasMcaWindingData
                      ? `${mcaWindingResult.maxUnbalanceRL.toFixed(2)}%`
                      : "---"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {hasMcaWindingData
                      ? `Max of R ${mcaWindingResult.unbalanceR.toFixed(2)}% · L ${mcaWindingResult.unbalanceL.toFixed(2)}%`
                      : "Awaiting Data"}
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Thermal &amp; Life Impact
                  </p>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    {hasMcaWindingData
                      ? `+${mcaWindingResult.extraTempRiseC.toFixed(1)} °C`
                      : "---"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Insulation life remaining{" "}
                    <span className="text-slate-300 font-semibold">
                      {hasMcaWindingData
                        ? `${mcaWindingResult.remainingLifePercent.toFixed(1)}%`
                        : "N/A"}
                    </span>
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    MCA Health Index
                  </p>
                  <p className="text-2xl font-bold text-emerald-400 font-mono">
                    {hasMcaWindingData
                      ? `${mcaWindingResult.healthScore}%`
                      : "---"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Usable HP{" "}
                    <span className="text-slate-300 font-semibold">
                      {hasMcaWindingData && mcaWindingResult.usableHp != null
                        ? `${mcaWindingResult.usableHp} HP`
                        : "N/A"}
                    </span>
                    {hasMcaWindingData
                      ? ` · NEMA derate ${mcaWindingResult.nemaDeratingFactor.toFixed(3)}`
                      : ""}
                  </p>
                </div>
              </div>

              <div className={`${CARD} mb-6`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Diagnostic Fault Isolation
                </p>
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-bold tracking-wide ${
                      hasMcaWindingData
                        ? mcaFaultBadgeClass(mcaWindingResult.severity)
                        : "bg-slate-800/80 border-slate-700 text-slate-400"
                    }`}
                  >
                    {hasMcaWindingData
                      ? mcaWindingResult.fault
                      : "Awaiting Data"}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 pt-1">
                    {hasMcaWindingData ? mcaWindingResult.severity : "---"}
                  </span>
                </div>
                <p className="text-sm text-slate-300 mt-3 leading-relaxed">
                  <span className="text-slate-500 text-xs font-bold uppercase tracking-wider mr-2">
                    Recommended action
                  </span>
                  {hasMcaWindingData
                    ? mcaWindingResult.recommendation
                    : "Upload MCA PDF or enter phase values manually"}
                </p>
              </div>

              <div className={`${CARD} mb-6`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Tri-Phase Balance Comparison — R (Ω) &amp; L (mH)
                </p>
                <div className="h-72 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={mcaWindingChartData}
                      margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        dataKey="phase"
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                      />
                      <YAxis
                        yAxisId="left"
                        orientation="left"
                        stroke="#38bdf8"
                        domain={[0, "auto"]}
                        unit=" Ω"
                        tick={{ fill: "#38bdf8", fontSize: 11 }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#eab308"
                        domain={[0, "auto"]}
                        unit=" mH"
                        tick={{ fill: "#eab308", fontSize: 11 }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0f172a",
                          border: "1px solid #334155",
                          borderRadius: 8
                        }}
                      />
                      <Legend />
                      {hasMcaWindingData && (
                        <>
                          <Bar
                            yAxisId="left"
                            dataKey="Resistance"
                            name="Resistance (Ω)"
                            fill="#38bdf8"
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            yAxisId="right"
                            dataKey="Inductance"
                            name="Inductance (mH)"
                            fill="#eab308"
                            radius={[4, 4, 0, 0]}
                          />
                        </>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                  {!hasMcaWindingData && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <p className="text-xs text-slate-500 bg-slate-950/70 px-3 py-1.5 rounded-lg border border-slate-800">
                        Awaiting Data
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : mcaMode === "insulation" ? (
            <>
              {hasMcaGwData && !mcaPdfParsing ? (
                <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-emerald-200">
                      {mcaExtractLoaded
                        ? `Groundwall loaded from ${formatMcaPdfLabel(mcaExtractFormat)} extract`
                        : mcaMetaSource === "telemetry"
                          ? "Groundwall loaded from saved MCA telemetry"
                          : "Groundwall data loaded"}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      IR 30s / 1m / 10m
                      {mcaGwSnapshot.testVoltageV > 0
                        ? ` · ${mcaGwSnapshot.testVoltageV} V`
                        : ""}
                      {mcaGwSnapshot.insulationClass
                        ? ` · Class ${mcaGwSnapshot.insulationClass}`
                        : ""}
                      {mcaGwSnapshot.reportPi != null
                        ? ` · PI ${mcaGwSnapshot.reportPi}`
                        : ""}
                      {mcaGwSnapshot.reportDar != null
                        ? ` · DAR ${mcaGwSnapshot.reportDar}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={mcaPdfInputRef}
                      type="file"
                      accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        void handleMcaPdfFile(f);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => mcaPdfInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-600 bg-slate-900 text-slate-300 hover:border-amber-400/50 hover:text-amber-200 cursor-pointer"
                    >
                      Replace PDF / screenshot
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`mb-6 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                    mcaPdfDragOver
                      ? "border-amber-400 bg-amber-500/10"
                      : "border-amber-500/30 hover:border-amber-400 bg-slate-900/50"
                  }`}
                  onClick={() => mcaPdfInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setMcaPdfDragOver(true);
                  }}
                  onDragLeave={() => setMcaPdfDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setMcaPdfDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    void handleMcaPdfFile(f);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      mcaPdfInputRef.current?.click();
                    }
                  }}
                >
                  <input
                    ref={mcaPdfInputRef}
                    type="file"
                    accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      void handleMcaPdfFile(f);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex flex-col items-center gap-3">
                    {mcaPdfParsing ? (
                      <>
                        <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
                        <p className="text-sm font-semibold text-amber-300">
                          Parsing MCA report…
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400 flex items-center justify-center">
                          <Shield className="h-5 w-5" />
                        </div>
                        <p className="text-sm font-semibold text-slate-200">
                          Upload MCA Test PDF or screenshot (ALL-TEST / Megger / Baker)
                        </p>
                        <p className="text-xs text-slate-500 max-w-md">
                          Auto-extract IR 30s / 1m / 10m, PI, and DAR from text PDFs or
                          PNG/JPEG screenshots via vision — values save to history automatically.
                        </p>
                      </>
                    )}
                  </div>
                  {mcaPdfError && (
                    <p className="mt-3 text-xs text-amber-400">{mcaPdfError}</p>
                  )}
                </div>
              )}

              <div className={`${CARD} mb-6`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Groundwall IR Input Grid
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {mcaExtractLoaded
                      ? `PDF · ${formatMcaPdfLabel(mcaExtractFormat)}`
                      : mcaMetaSource === "telemetry"
                        ? "From saved MCA telemetry"
                        : mcaMetaSource === "manual"
                          ? "Manual entry"
                          : "Awaiting Data · upload PDF or enter IR readings"}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(
                    [
                      ["ir30sMOmega", "IR 30s (MΩ)"],
                      ["ir1mMOmega", "IR 1m (MΩ)"],
                      ["ir10mMOmega", "IR 10m (MΩ)"],
                      ["testVoltageV", "Test Voltage (V DC)"],
                      ["windingTempC", "Winding Temp (°C)"],
                      ["reportPi", "Report PI"],
                      ["reportDar", "Report DAR"]
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {label}
                      </span>
                      <input
                        type="number"
                        step="any"
                        placeholder="—"
                        value={
                          mcaGwSnapshot[key] == null || mcaGwSnapshot[key] === 0
                            ? ""
                            : mcaGwSnapshot[key]
                        }
                        onChange={(e) => updateMcaGwField(key, e.target.value)}
                        className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 outline-none font-mono"
                      />
                    </label>
                  ))}
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Insulation Class
                    </span>
                    <select
                      value={mcaGwSnapshot.insulationClass || "F"}
                      onChange={(e) =>
                        updateMcaGwField("insulationClass", e.target.value)
                      }
                      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                    >
                      <option value="A">Class A (PI ≥ 1.5)</option>
                      <option value="B">Class B (PI ≥ 2.0)</option>
                      <option value="F">Class F (PI ≥ 2.0)</option>
                      <option value="H">Class H (PI ≥ 2.0)</option>
                    </select>
                  </label>
                </div>
                <p className="text-[10px] text-slate-500 mt-3">
                  {hasMcaGwData
                    ? `IEEE 43-2013 · kT = ${mcaGwResult.kT.toFixed(3)} · IR corrected to 40°C baseline`
                    : "IEEE 43-2013 · Awaiting IR data"}
                  {mcaGwSnapshot.reportPi != null
                    ? ` · Report PI ${mcaGwSnapshot.reportPi}`
                    : ""}
                  {mcaGwSnapshot.reportDar != null
                    ? ` · Report DAR ${mcaGwSnapshot.reportDar}`
                    : ""}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    IR @ 40°C Baseline
                  </p>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    {hasMcaGwData
                      ? `${mcaGwResult.ir40MOmega.toFixed(1)} MΩ`
                      : "---"}
                  </p>
                  {hasMcaGwData ? (
                    <span
                      className={`mt-2 inline-flex px-2 py-0.5 rounded border text-[10px] font-bold tracking-wide ${
                        mcaGwResult.irIeeePass
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                          : "bg-red-500/15 border-red-500/40 text-red-300"
                      }`}
                    >
                      IEEE 43 {mcaGwResult.irIeeePass ? "PASS" : "FAIL"} (≥{" "}
                      {mcaGwResult.irIeeeMinMOmega} MΩ)
                    </span>
                  ) : (
                    <p className="text-xs text-slate-500 mt-2">Awaiting Data</p>
                  )}
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Polarization Index (PI)
                  </p>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    {hasMcaGwData && mcaGwResult.pi != null
                      ? mcaGwResult.pi.toFixed(2)
                      : "---"}
                    {hasMcaGwData &&
                      mcaGwResult.pi != null &&
                      mcaGwResult.piIeeePass != null && (
                        <span
                          className={`ml-2 text-sm ${
                            mcaGwResult.piIeeePass
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          {mcaGwResult.piIeeePass ? "PASS" : "FAIL"}
                        </span>
                      )}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {hasMcaGwData
                      ? `${mcaGwResult.piStatus}${
                          mcaGwResult.pi != null
                            ? ` · min ${mcaGwResult.piIeeeMin}`
                            : " · needs IR 10m"
                        }`
                      : "Awaiting Data"}
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Dielectric Absorption (DAR)
                  </p>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    {hasMcaGwData && mcaGwResult.dar != null
                      ? mcaGwResult.dar.toFixed(2)
                      : "---"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {hasMcaGwData ? mcaGwResult.darStatus : "Awaiting Data"}
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Leakage Current
                  </p>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    {hasMcaGwData && mcaGwSnapshot.testVoltageV > 0
                      ? `${mcaGwResult.leakageCurrentUA.toFixed(2)} μA`
                      : "---"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {hasMcaGwData && mcaGwSnapshot.testVoltageV > 0
                      ? `@ ${mcaGwSnapshot.testVoltageV} V DC · IR@40°C`
                      : "Awaiting Data"}
                  </p>
                </div>
              </div>

              <div className={`${CARD} mb-6`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Diagnostic Fault Isolation
                </p>
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-bold tracking-wide ${
                      hasMcaGwData
                        ? mcaFaultBadgeClass(mcaGwResult.severity)
                        : "bg-slate-800/80 border-slate-700 text-slate-400"
                    }`}
                  >
                    {hasMcaGwData ? mcaGwResult.fault : "Awaiting Data"}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 pt-1">
                    {hasMcaGwData ? mcaGwResult.severity : "---"}
                  </span>
                </div>
                <p className="text-sm text-slate-300 mt-3 leading-relaxed">
                  <span className="text-slate-500 text-xs font-bold uppercase tracking-wider mr-2">
                    Recommended action
                  </span>
                  {hasMcaGwData
                    ? mcaGwResult.recommendation
                    : "Upload MCA PDF or enter IR values manually"}
                </p>
              </div>

              <div className={`${CARD} mb-6`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Polarization Curve — Raw vs IR @ 40°C
                </p>
                <div className="h-72 relative">
                  {hasMcaGwData && mcaGwChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={mcaGwChartData}
                        margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey="time"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                        />
                        <YAxis
                          tick={{ fill: "#fbbf24", fontSize: 11 }}
                          unit=" MΩ"
                          domain={[0, "auto"]}
                        />
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
                          dataKey="Raw"
                          name="Raw IR (MΩ)"
                          stroke="#94a3b8"
                          strokeWidth={2}
                          dot={{ r: 4, fill: "#94a3b8" }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="Corrected40"
                          name="IR @ 40°C (MΩ)"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          dot={{ r: 4, fill: "#f59e0b" }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6 border border-dashed border-amber-500/20 rounded-lg bg-slate-950/40">
                      <Shield className="h-6 w-6 text-amber-500/50 mb-2" />
                      <p className="text-sm text-slate-400">
                        Upload PDF or enter values to view curve
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : mcaMode === "rotor" ? (
            <>
              {hasMcaSsotRotorInfluence(mcaRecord) && !mcaPdfParsing ? (
                <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-emerald-200">
                      {mcaExtractLoaded
                        ? `RIC loaded from ${formatMcaPdfLabel(mcaExtractFormat)} extract`
                        : mcaMetaSource === "telemetry"
                          ? "RIC loaded from saved MCA telemetry"
                          : "RIC data loaded"}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {ricData.length} RIC points
                      {mcaPdfFileName ? ` · ${mcaPdfFileName}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={mcaPdfInputRef}
                      type="file"
                      accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        void handleMcaPdfFile(f);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => mcaPdfInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-600 bg-slate-900 text-slate-300 hover:border-purple-400/50 hover:text-purple-200 cursor-pointer"
                    >
                      Replace PDF / screenshot
                    </button>
                  </div>
                </div>
              ) : (
              <div
                className={`mb-6 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  mcaPdfDragOver
                    ? "border-purple-400 bg-purple-500/10"
                    : "border-purple-500/30 hover:border-purple-400 bg-slate-900/50"
                }`}
                onClick={() => mcaPdfInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setMcaPdfDragOver(true);
                }}
                onDragLeave={() => setMcaPdfDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setMcaPdfDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  void handleMcaPdfFile(f);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    mcaPdfInputRef.current?.click();
                  }
                }}
              >
                <input
                  ref={mcaPdfInputRef}
                  type="file"
                  accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    void handleMcaPdfFile(f);
                    e.target.value = "";
                  }}
                />
                <div className="flex flex-col items-center gap-3">
                  {mcaPdfParsing ? (
                    <>
                      <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
                      <p className="text-sm font-semibold text-purple-300">
                        Parsing MCA report…
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-xl border border-purple-500/40 bg-purple-500/10 text-purple-400 flex items-center justify-center">
                        <RotateCw className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-semibold text-slate-200">
                        Upload MCA PDF or screenshot (RIC / Rotor Influence)
                      </p>
                      <p className="text-xs text-slate-500 max-w-md">
                        Auto-extract angle vs L12 / L23 / L31 from text PDF or vision screenshot.
                      </p>
                    </>
                  )}
                </div>
                {mcaPdfError && (
                  <p className="mt-3 text-xs text-amber-400">{mcaPdfError}</p>
                )}
              </div>
              )}

              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleRicPasteFromClipboard()}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-purple-500/40 bg-purple-500/10 text-purple-300 hover:border-purple-400 cursor-pointer"
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  Paste from Clipboard
                </button>
                <button
                  type="button"
                  onClick={() => setRicShowGrid((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    ricShowGrid
                      ? "bg-purple-500/15 border-purple-500 text-purple-300"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  Manual Grid / Edit Values
                </button>
                <button
                  type="button"
                  onClick={() => setRicApplySmoothing((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    ricApplySmoothing
                      ? "bg-purple-500/15 border-purple-500 text-purple-300"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  3-Pt Smoothing {ricApplySmoothing ? "On" : "Off"}
                </button>
                <button
                  type="button"
                  onClick={() => setRicCompareBaseline((v) => !v)}
                  disabled={ricBaselineData.length === 0}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    ricCompareBaseline
                      ? "bg-purple-500/15 border-purple-500 text-purple-300"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  Compare to Baseline
                </button>
                <button
                  type="button"
                  onClick={saveRicAsBaseline}
                  disabled={ricData.length === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save Current as Baseline
                </button>
                {ricData.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      mergeMcaRecord({
                        rotor_influence: { series: [] },
                        meta: { source: "manual" }
                      });
                      setRicPasteError(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 cursor-pointer"
                  >
                    Clear RIC Data
                  </button>
                )}
              </div>
              {ricPasteError && (
                <p className="mb-4 text-xs text-amber-400">{ricPasteError}</p>
              )}

              {ricShowGrid && (
                <div className={`${CARD} mb-6 overflow-x-auto`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                    RIC Data Grid — Angle (0–360°) · L12 · L23 · L31 (mH)
                  </p>
                  {ricData.length === 0 ? (
                    <p className="text-sm text-slate-500 py-6 text-center">
                      Awaiting Data — paste clipboard rows or upload a PDF
                    </p>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                          <th className="py-2 pr-2 font-bold">#</th>
                          <th className="py-2 pr-2 font-bold">Angle</th>
                          <th className="py-2 pr-2 font-bold font-mono">L12</th>
                          <th className="py-2 pr-2 font-bold font-mono">L23</th>
                          <th className="py-2 pr-2 font-bold font-mono">L31</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-300">
                        {ricData.map((row, idx) => (
                          <tr
                            key={`${row.angle}-${idx}`}
                            className="border-b border-slate-800/80"
                          >
                            <td className="py-1.5 pr-2 text-slate-500 text-xs">
                              {idx + 1}
                            </td>
                            {(
                              [
                                ["angle", row.angle],
                                ["l12", row.l12],
                                ["l23", row.l23],
                                ["l31", row.l31]
                              ] as const
                            ).map(([key, val]) => (
                              <td key={key} className="py-1.5 pr-2">
                                <input
                                  type="number"
                                  step="any"
                                  value={val}
                                  onChange={(e) =>
                                    updateRicRow(idx, key, e.target.value)
                                  }
                                  className="w-full min-w-[4.5rem] bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-sm text-white focus:border-purple-500 outline-none font-mono"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Max Inductance Variation
                  </p>
                  <p className="text-2xl font-bold text-purple-400 font-mono">
                    {hasRicData
                      ? `${ricResult!.maxVariation.toFixed(2)}%`
                      : "---"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {hasRicData
                      ? `L12 ${ricResult!.variationL12.toFixed(2)}% · L23 ${ricResult!.variationL23.toFixed(2)}% · L31 ${ricResult!.variationL31.toFixed(2)}%`
                      : "Awaiting Data"}
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Eccentricity Index
                  </p>
                  <p className="text-2xl font-bold text-purple-400 font-mono">
                    {hasRicData
                      ? `${ricResult!.eccentricityIndex.toFixed(2)}%`
                      : "---"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Mean phase peak-to-peak variation
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Peak Variance
                  </p>
                  <p className="text-2xl font-bold text-purple-400 font-mono">
                    {hasRicData
                      ? `${ricResult!.peakVariance.toFixed(2)}`
                      : "---"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {hasRicData
                      ? ricResult!.peakVarianceErratic
                        ? "Erratic signature"
                        : "Stable signature"
                      : "Awaiting Data"}
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Baseline Degradation
                  </p>
                  <p className="text-2xl font-bold text-purple-400 font-mono">
                    {hasRicData && ricResult!.degradationPercent != null
                      ? `${ricResult!.degradationPercent.toFixed(2)}%`
                      : "---"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {hasRicData && ricResult!.degradationPercent != null
                      ? ricResult!.degradationFlagged
                        ? "Flagged · shift > 2%"
                        : "Within 2% band"
                      : "Save baseline to compare"}
                  </p>
                </div>
              </div>

              <div className={`${CARD} mb-6`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Diagnostic Fault Isolation
                </p>
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-bold tracking-wide ${
                      hasRicData
                        ? mcaFaultBadgeClass(ricResult!.severity)
                        : "bg-slate-800/80 border-slate-700 text-slate-400"
                    }`}
                  >
                    {hasRicData ? ricResult!.fault : "Awaiting Data"}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 pt-1">
                    {hasRicData ? ricResult!.severity : "---"}
                  </span>
                </div>
                <p className="text-sm text-slate-300 mt-3 leading-relaxed">
                  <span className="text-slate-500 text-xs font-bold uppercase tracking-wider mr-2">
                    Recommended action
                  </span>
                  {hasRicData
                    ? ricResult!.recommendation
                    : "Upload PDF or paste RIC clipboard data (Angle, L12, L23, L31)"}
                </p>
              </div>

              <div className={`${CARD} mb-6`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Linear RIC Trace — Inductance vs Rotor Angle
                </p>
                <div className="h-72 relative">
                  {hasRicData ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={ricLinearChartData}
                        margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey="angle"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          unit="°"
                        />
                        <YAxis
                          tick={{ fill: "#c084fc", fontSize: 11 }}
                          unit=" mH"
                          domain={["auto", "auto"]}
                        />
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
                          dataKey="L12"
                          name="L12 (mH)"
                          stroke="#c084fc"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="L23"
                          name="L23 (mH)"
                          stroke="#a78bfa"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="L31"
                          name="L31 (mH)"
                          stroke="#818cf8"
                          strokeWidth={2}
                          dot={false}
                        />
                        {ricCompareBaseline && ricBaselineData.length > 0 && (
                          <>
                            <Line
                              type="monotone"
                              dataKey="BaseL12"
                              name="Baseline L12"
                              stroke="#c084fc"
                              strokeWidth={1.5}
                              strokeDasharray="6 4"
                              dot={false}
                            />
                            <Line
                              type="monotone"
                              dataKey="BaseL23"
                              name="Baseline L23"
                              stroke="#a78bfa"
                              strokeWidth={1.5}
                              strokeDasharray="6 4"
                              dot={false}
                            />
                            <Line
                              type="monotone"
                              dataKey="BaseL31"
                              name="Baseline L31"
                              stroke="#818cf8"
                              strokeWidth={1.5}
                              strokeDasharray="6 4"
                              dot={false}
                            />
                          </>
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6 border border-dashed border-purple-500/20 rounded-lg bg-slate-950/40">
                      <RotateCw className="h-6 w-6 text-purple-500/50 mb-2" />
                      <p className="text-sm text-slate-400">
                        Upload PDF or paste RIC values to view linear trace
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className={`${CARD} mb-6`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Polar Magnetic Map — L12 · L23 · L31
                </p>
                <div className="h-80 relative">
                  {hasRicData ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={ricRadarChartData}>
                        <PolarGrid stroke="#334155" />
                        <PolarAngleAxis
                          dataKey="angleLabel"
                          tick={{ fill: "#94a3b8", fontSize: 10 }}
                        />
                        <PolarRadiusAxis
                          tick={{ fill: "#64748b", fontSize: 10 }}
                          stroke="#475569"
                        />
                        <Radar
                          name="L12"
                          dataKey="L12"
                          stroke="#c084fc"
                          fill="#c084fc"
                          fillOpacity={0.25}
                        />
                        <Radar
                          name="L23"
                          dataKey="L23"
                          stroke="#a78bfa"
                          fill="#a78bfa"
                          fillOpacity={0.2}
                        />
                        <Radar
                          name="L31"
                          dataKey="L31"
                          stroke="#818cf8"
                          fill="#818cf8"
                          fillOpacity={0.15}
                        />
                        <Legend />
                        <Tooltip
                          contentStyle={{
                            background: "#0f172a",
                            border: "1px solid #334155",
                            borderRadius: 8
                          }}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6 border border-dashed border-purple-500/20 rounded-lg bg-slate-950/40">
                      <RotateCw className="h-6 w-6 text-purple-500/50 mb-2" />
                      <p className="text-sm text-slate-400">
                        Upload PDF or paste RIC values to view polar map
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : mcaMode === "surge" ? (
            <>
              <div className={`${CARD} mb-6 border border-emerald-500/20`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Surge Test Inputs
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Test Voltage (V)
                    </span>
                    <input
                      type="number"
                      step="any"
                      placeholder="—"
                      value={surgeTestVoltageV ?? ""}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        mergeMcaRecord({
                          surge: {
                            test_voltage_v:
                              e.target.value === "" || !Number.isFinite(n)
                                ? undefined
                                : n
                          },
                          meta: { source: "manual" }
                        });
                      }}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none font-mono"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Manual Area Difference (%)
                    </span>
                    <input
                      type="number"
                      step="any"
                      placeholder="—"
                      value={manualEar ?? ""}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        mergeMcaRecord({
                          surge: {
                            ear:
                              e.target.value === "" || !Number.isFinite(n)
                                ? undefined
                                : n
                          },
                          meta: { source: "manual" }
                        });
                      }}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none font-mono"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={surgeCsvInputRef}
                    type="file"
                    accept=".csv,text/csv,text/plain,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      void handleSurgeCsvFile(f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => surgeCsvInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400 cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload Surge CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSurgePasteFromClipboard()}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400 cursor-pointer"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" />
                    Paste from Clipboard
                  </button>
                  {(surgeData.length > 0 ||
                    manualEar != null ||
                    surgeTestVoltageV != null) && (
                    <button
                      type="button"
                      onClick={() => {
                        mergeMcaRecord({
                          surge: {
                            waveform: [],
                            ear: null,
                            test_voltage_v: null
                          },
                          meta: { source: "manual" }
                        });
                        setSurgePasteError(null);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 cursor-pointer"
                    >
                      Clear Surge Data
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-3">
                  CSV / clipboard columns: Time, V12, V23, V31
                  {surgeData.length > 0
                    ? ` · ${surgeData.length} waveform samples loaded`
                    : ""}
                  {surgeTestVoltageV != null
                    ? ` · Test @ ${surgeTestVoltageV} V`
                    : ""}
                </p>
                {surgePasteError && (
                  <p className="mt-2 text-xs text-amber-400">{surgePasteError}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Max Error Area Ratio (EAR)
                  </p>
                  <p className="text-2xl font-bold text-emerald-400 font-mono">
                    {hasSurgeData ? `${surgeResult!.maxEar.toFixed(2)}%` : "---"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {hasSurgeData
                      ? surgeCsvResult
                        ? `V12-V23 ${surgeCsvResult.ear12_23.toFixed(2)}% · V23-V31 ${surgeCsvResult.ear23_31.toFixed(2)}% · V31-V12 ${surgeCsvResult.ear31_12.toFixed(2)}%`
                        : "From manual area difference"
                      : "Awaiting Data"}
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Surge Health Status
                  </p>
                  {hasSurgeData ? (
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-bold tracking-wide ${mcaFaultBadgeClass(surgeResult!.severity)}`}
                    >
                      {surgeResult!.fault}
                    </span>
                  ) : (
                    <p className="text-2xl font-bold text-emerald-400 font-mono">
                      ---
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-2">
                    {hasSurgeData ? surgeResult!.severity : "Awaiting Data"}
                  </p>
                </div>
              </div>

              {hasSurgeData && (
                <div className={`${CARD} mb-6`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                    Diagnostic Fault Isolation
                  </p>
                  <div className="flex flex-wrap items-start gap-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-bold tracking-wide ${mcaFaultBadgeClass(surgeResult!.severity)}`}
                    >
                      {surgeResult!.fault}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 pt-1">
                      {surgeResult!.severity}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 mt-3 leading-relaxed">
                    <span className="text-slate-500 text-xs font-bold uppercase tracking-wider mr-2">
                      Recommended action
                    </span>
                    {surgeResult!.recommendation}
                  </p>
                </div>
              )}

              <div className={`${CARD} mb-6`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Comparative Surge Waveforms — V12 · V23 · V31
                </p>
                <div className="h-80 relative">
                  {surgeData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={surgeChartData}
                        margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey="time"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          unit=" µs"
                        />
                        <YAxis
                          tick={{ fill: "#34d399", fontSize: 11 }}
                          unit=" V"
                          domain={["auto", "auto"]}
                        />
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
                          dataKey="V12"
                          name="V12"
                          stroke="#34d399"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="V23"
                          name="V23"
                          stroke="#22d3ee"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="V31"
                          name="V31"
                          stroke="#c084fc"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6 border border-dashed border-emerald-500/20 rounded-lg bg-slate-950/40">
                      <Activity className="h-6 w-6 text-emerald-500/50 mb-2" />
                      <p className="text-sm text-slate-400">
                        Upload Surge CSV or paste Time / V12 / V23 / V31 to
                        overlay waveforms
                      </p>
                      <p className="text-xs text-slate-600 mt-2 max-w-md">
                        Overlapping waves form a solid healthy trace; separation
                        reveals turn insulation asymmetry.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : !hasMcaData ? (
            <TechEmptyState technology="MCA" />
          ) : (
            <div className={`${CARD} mb-6 flex flex-col items-center justify-center text-center py-16 px-6`}>
              <div
                className={`w-12 h-12 rounded-xl border flex items-center justify-center mb-4 ${
                  MCA_MODE_OPTIONS.find((m) => m.id === mcaMode)?.iconClass ||
                  "border-slate-700 bg-slate-950 text-slate-500"
                }`}
              >
                {(() => {
                  const Icon =
                    MCA_MODE_OPTIONS.find((m) => m.id === mcaMode)?.Icon || Activity;
                  return <Icon className="h-5 w-5" />;
                })()}
              </div>
              <p className="text-sm font-semibold text-slate-200">
                {MCA_MODE_OPTIONS.find((m) => m.id === mcaMode)?.label} — Phase 1 pending
              </p>
              <p className="text-xs text-slate-500 mt-2 max-w-md">
                All MCA modes are available — use the sub-tabs above.
              </p>
            </div>
          )}
        </>
      )}

      {/* ===== OIL ANALYSIS TECH CONTENT ===== */}
      {trendTech === "oil_analysis" && (
        <div className="mt-6">
          <div className="flex flex-wrap gap-2 mb-4 border-b border-slate-700 pb-2">
            {OIL_SUB_TABS.map((tab) => {
              const isActive = activeOilSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  disabled={tab.disabled}
                  onClick={() => {
                    if (!tab.disabled) setActiveOilSubTab(tab.id);
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    tab.disabled
                      ? "bg-slate-800 text-slate-500 border-slate-700 opacity-50 cursor-not-allowed"
                      : isActive
                        ? "bg-cyan-600 text-white border-cyan-500"
                        : "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500 cursor-pointer"
                  }`}
                >
                  {tab.label}
                  {tab.comingSoon ? " (Coming Soon)" : ""}
                </button>
              );
            })}
          </div>

          {activeOilSubTab === "wear_metals" ? (
            <OilWearMetalsTab assetId={analysisAssetQueryKey ?? ""} />
          ) : dbTrendLoading ? (
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
                      · {OIL_SUB_TABS.find((m) => m.id === activeOilSubTab)?.label}
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
        </div>
      )}

      {trendTech !== "vibration" &&
        trendTech !== "thermography" &&
        trendTech !== "ultrasound" &&
        trendTech !== "mca" &&
        trendTech !== "oil_analysis" && (
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
