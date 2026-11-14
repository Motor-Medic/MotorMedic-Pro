import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  Maximize2,
  Plus,
  Printer,
  RotateCw,
  Search,
  Shield,
  Thermometer,
  Upload,
  Wind,
  Zap
} from "lucide-react";
import { TrendDataPoint } from "../types";
import {
  fetchAnalysisResults,
  saveAnalysisResult,
  setAnalysisBaseline,
  telemetryProvenanceOf,
  type SavedAnalysisResult
} from "../lib/analysisPersistence";
import TelemetryProvenanceBadge from "./diagnostics/TelemetryProvenanceBadge";
import {
  NOT_DETECTED,
  NOT_MEASURED,
  NOT_REPORTED,
  PROJECTION_MIN_VALID_LOAD_PERCENT,
  THERMO_REF_TEMP_MISSING,
  buildThermoChartSeries,
  hottestPhaseFromPoint,
  mechanicalKpis,
  netaRepairWindowForStoredClass,
  nfpaClassBadge,
  planThermoTrendAxis,
  radiometricKpis,
  resolveThermoTempUnit,
  seriesHasAny,
  skinAmbientDelta,
  THERMO_EMISSIVITY_APP_DEFAULT_BADGE,
  THERMO_EMISSIVITY_EXTRACTED_NOTE,
  THERMO_LOAD_DISCLOSURE,
  thermoEmissivityAmbientPill,
  thermoLoadTelemetryStored,
  type ThermoChartPoint
} from "../lib/thermographyTrendSeries";
import {
  powerMeanDbRounded,
  DB_POWER_MEAN_NOTE
} from "../lib/ultrasound/logUnits";
import {
  resolveProbeType,
  ULTRASOUND_PROBE_LABEL,
  type UltrasoundProbeType
} from "../lib/ultrasound/probeType";
import {
  calculateAdvancedSteamLoss,
  estimateSteamOrificeFromPeakDb,
  formatSteamUsdPerYear,
  STEAM_BASIS_NOTE,
  STEAM_BASIS_TEXT,
  STEAM_PAYBACK_BASIS_TEXT
} from "../lib/steam/advancedSteamCalculator";
import { calculateWindingBalance, type ConductorMaterial } from "../lib/mca/windingBalanceCalculator";
import {
  calculateGroundwallInsulation,
  evaluateGroundwallTestVoltage,
  parseRatedVoltageVolts,
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
  calculateSurgeDamping,
  calculateSurgeHealth,
  evaluateSurgeTestVoltage,
  parseSurgeClipboardText,
  surgeHealthFromManualEar,
  type SurgeDataPoint
} from "../lib/mca/surgeCalculator";
import {
  extractMcaDataFromFile,
  formatMcaPdfLabel,
  isMcaPdfFormat,
  mcaExtractHasGroundwall,
  type McaExtractedData,
  type McaPdfFormat
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
  type McaSsotPatch,
  type McaSsotRecord
} from "../lib/mca/mcaSsot";
import {
  extractEnvelopingTrendPoint,
  extractVibrationRecordFromAnalysis,
  extractWaveformTrendPoint,
  hasVibrationTrendCharts,
  type EnvelopingTrendPoint,
  type VibrationDiagnosticRecord,
  type WaveformTrendPoint
} from "../lib/vibration/vibrationDiagnosticRecord";
import {
  VIBRATION_NOT_MEASURED,
  applyVibrationRunningStateFilter,
  latestVibrationRecordFromRows,
  readVibrationOverallAcceleration,
  readVibrationOverallVelocity,
  readVibrationPerAxis,
  readVibrationRpmProvenance,
  reconcileVibrationVerdict,
  sortVibrationRowsNewestFirst,
  vibrationRowsInScope,
  vibrationSampleState,
  vibrationStoppedSampleLabel
} from "../lib/vibration/trendSsot";
import {
  VIBRATION_RPM_ABSENT_WARNING,
  vibrationRpmProvenanceLabel,
  type VibrationRpmReading
} from "../lib/vibration/rpmProvenance";
import { resolveBearingFaultFrequencies } from "../lib/vibration/bearingFaultFrequencies";
import type { BearingFaultFrequenciesHz } from "../lib/vibration/bearingFaultFrequencies";
import {
  ACCELERATION_DISPLAY_OPTIONS,
  FREQUENCY_DISPLAY_OPTIONS,
  ORDERS_FALLBACK_HINT,
  TEMPERATURE_DISPLAY_OPTIONS,
  VELOCITY_DISPLAY_OPTIONS,
  convertAbsoluteTemperature,
  convertTemperatureDelta,
  formatAccelerationDisplay,
  formatVelocityDisplay,
  formatVelocityMmS,
  frequencyDisplayValue,
  frequencyValueForDisplay,
  resolveFrequencyDisplayUnit,
  resolveTemperatureDisplayUnit,
  velocityValueForDisplay,
  type DisplayUnits,
  type TemperatureDisplayUnit
} from "../lib/vibration/units";
import {
  resolveVelocityThresholds,
  type VelocityThresholdResolution
} from "../lib/vibration/velocityThresholds";
import {
  MISSING_RPM_ORDER_HELPER_TEXT,
  SPECTRAL_ORDERS_RPM_GATE_NOTE,
  SPECTRAL_ORDERS_STORED_FALLBACK_NOTE,
  SPECTRAL_UNIT_PHYSICS_NOTE,
  buildSpectralHarmonicTrend,
  spectralAmplitudeAxisLabel,
  spectralOrderProvenanceLabel,
  type HarmonicRatio
} from "../lib/vibration/spectralTrend";
import { useTenantDisplayUnits } from "../lib/tenantSettings";
import { navigateToTab } from "../navigation";
import { stageWorkOrderPrefill } from "../lib/maintenance/workOrderPrefill";
import {
  PD_PEAK_DB_SOURCE,
  US_DDB_BRACKETS,
  US_DDB_SOURCE,
  MCA_IMBALANCE_SOURCE,
  MCA_LZ_DIVERGENCE_SOURCE,
  MCA_RIC_RATIO_SOURCE,
  MCA_RIC_SPATIAL_FFT_SOURCE,
  MCA_RIC_VARIATION_SOURCE,
  MCA_UNBALANCE_FORMULA,
  evaluateMcaSeverity,
  evaluatePdPeakDb,
  type PdPeakDbClassification,
  type PdPeakDbSeverity
} from "../lib/maintenance/prescriptiveDictionary";
import WaveformTab, {
  buildWaveformChartModel,
  CrestFactorTrendChartBody,
  ImpactCountTrendChartBody,
  WaveformTimeChartBody,
  type WaveformChartId
} from "./trendAnalyzer/WaveformTab";
import OilWearMetalsTab from "./trendAnalyzer/OilWearMetalsTab";
import OilFluidChemistryTab from "./trendAnalyzer/OilFluidChemistryTab";
import OilCleanlinessTab from "./trendAnalyzer/OilCleanlinessTab";
import OilFerrographyVarnishTab from "./trendAnalyzer/OilFerrographyVarnishTab";
import AddOilSampleModal from "./trendAnalyzer/AddOilSampleModal";
import {
  VibrationActionCard,
  VibrationIsoMatrix,
  VibrationKpiSummary
} from "./trendAnalyzer/VibrationSeverityPanels";
import {
  KinematicSpecsEmptyState
} from "./KinematicSpecsNotice";
import {
  SPARSE_TREND_HELPER_TEXT,
  applySameDateSequenceLabels,
  filterTrendByTimeRange,
  isSparseTrendSeries,
  windowTrendByTimeRange,
  type TrendTimeRange
} from "../lib/vibration/trendSeries";
import {
  getEquipmentData,
  getFlatEquipment,
  routeDisplayName,
  subscribeEquipmentStoreChanged,
  type FlatEquipAsset
} from "../data/equipmentDb";
import {
  ARTIFACT_DISCLAIMER,
  confirmArtifactExport
} from "./ArtifactDisclaimer";

/* ========================================================================== */
/* Props (unchanged contract for Trends.tsx / App.tsx)                        */
/* ========================================================================== */

interface TrendAnalyzerProps {
  trendData?: TrendDataPoint[];
  onAddTrendPoint?: (point: Omit<TrendDataPoint, "id" | "timestamp">) => void;
  selectedAssetId?: string;
  selectedCompanyId?: number;
}

type TimeRange = TrendTimeRange;
type OverlayParam = "Temp" | "MCSA" | "Load" | null;
type ExpandedTrendChartId =
  | "health"
  | "velocity"
  | "spectral"
  | "envelopingGe"
  | "envelopingKurtosis"
  | "waveformTime"
  | "waveformCrest"
  | "waveformImpact";

const CARD = "bg-slate-900/50 border border-white/10 rounded-xl p-6";

function healthScoreTone(score: number | null): string {
  if (score == null) return "text-slate-500";
  if (score >= 85) return "text-emerald-400";
  if (score >= 70) return "text-yellow-400";
  if (score >= 50) return "text-orange-400";
  return "text-red-400";
}

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
  note,
  children
}: {
  title: string;
  subtitle?: string;
  overlay?: string | null;
  /** Honest caveat under the plot (reuses SPARSE_TREND_HELPER_TEXT). */
  note?: string | null;
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
      {note ? (
        <p className="text-[11px] text-amber-300 mt-2">{note}</p>
      ) : null}
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
  probeType: UltrasoundProbeType;
  transducer: string | null;
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
    const transducer =
      p.transducer != null ? String(p.transducer) : p.sensor_type != null ? String(p.sensor_type) : null;
    const probeType = resolveProbeType(
      p.probe_type ?? p.probeType ?? p.sensor_mount_type ?? p.mount_type,
      transducer
    );
    return {
      peak: Number.isFinite(peak) ? peak : null,
      rms: Number.isFinite(rms) ? rms : null,
      delta: Number.isFinite(delta) ? delta : null,
      crest: Number.isFinite(crest) ? crest : null,
      mode: modeRaw || null,
      probeType,
      transducer
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
  const td =
    r.telemetry_data && typeof r.telemetry_data === "object"
      ? (r.telemetry_data as Record<string, unknown>)
      : null;
  const tdProbe =
    td?.probe_type ?? td?.probeType ?? td?.sensor_mount_type ?? td?.mount_type;
  const tdTransducer = td?.transducer ?? td?.sensor_type;
  return {
    peak: null,
    rms: null,
    delta: null,
    crest: null,
    mode: cdMode || null,
    probeType: resolveProbeType(tdProbe, tdTransducer),
    transducer: tdTransducer != null ? String(tdTransducer) : null
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

/** Compressed Air Leaks tab — leak-mode ultrasound (or Air Leak classification).
 * PARKED (SLICE-VS8): measured dBµV readings only. The derived
 * CFM/orifice/$/CO₂ model is intentionally not called from this surface.
 */
function isUeLeakRow(r: SavedAnalysisResult): boolean {
  const { mode } = uePeaksFromRow(r);
  const m = (mode || "").toLowerCase();
  if (m === "leak" || m === "leaks") return true;
  if (m.includes("leak")) return true;
  const fault = String(r.primary_fault || "").toLowerCase();
  return fault.includes("air leak") || fault === "leak";
}

function safeFinite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

type UeLeakReadingRow = {
  id: string;
  assetId: string;
  dateIso: string;
  dateMs: number;
  dateLabel: string;
  peakDb: number | null;
  baselineDb: number | null;
  baselineStored: boolean;
  deltaDb: number | null;
  probeType: UltrasoundProbeType;
  /** fallback means the delta rests on the modeled baseline, not a measurement. */
  baselineSource: "stored" | "fallback" | "unknown";
  baselineFallbackDb: number | null;
};

function optionalFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Read measured dBµV fields only — no leak-rate/orifice/economic derivation. */
function ueLeakReadingFromRow(r: SavedAnalysisResult): UeLeakReadingRow {
  const peaks = Array.isArray(r.peaks) ? r.peaks : [];
  let peakDb: number | null = null;
  let baselineDb: number | null = null;
  let deltaDb: number | null = null;
  let baselineSource: "stored" | "fallback" | "unknown" = "unknown";
  let baselineFallbackDb: number | null = null;
  let probeType: UltrasoundProbeType = "unknown";

  for (const raw of peaks) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (String(p.type || "").toLowerCase() !== "ultrasound") continue;
    peakDb = optionalFiniteNumber(p.peak_dbmv ?? p.peak_dbuv);
    const storedBaseline = optionalFiniteNumber(
      p.baseline_dbmv ?? p.baseline_dbuv
    );
    baselineDb = storedBaseline;
    deltaDb = optionalFiniteNumber(p.delta_db);
    const sourceRaw = String(
      p.baseline_source ?? p.baselineSource ?? ""
    ).toLowerCase();
    baselineSource =
      sourceRaw === "stored" || sourceRaw === "fallback"
        ? sourceRaw
        : storedBaseline != null
          ? "stored"
          : "fallback";
    const fallbackDb = optionalFiniteNumber(
      p.baseline_fallback_db ?? p.baselineFallbackDb
    );
    baselineFallbackDb =
      fallbackDb ?? (baselineSource === "fallback" ? storedBaseline ?? 28 : null);
    probeType = resolveProbeType(
      p.probe_type ?? p.probeType ?? p.sensor_mount_type ?? p.mount_type,
      p.transducer ?? p.sensor_type
    );
    break;
  }

  if (probeType === "unknown") {
    const fromRow = uePeaksFromRow(r);
    probeType = fromRow.probeType;
  }

  const baselineForDelta =
    baselineSource === "fallback" && baselineFallbackDb != null
      ? baselineFallbackDb
      : baselineDb;
  const resolvedDelta =
    deltaDb ??
    (peakDb != null && baselineForDelta != null
      ? Math.round((peakDb - baselineForDelta) * 10) / 10
      : null);

  const dateIso = r.timestamp || r.created_at || "";
  const dateMs = dateIso ? new Date(dateIso).getTime() : 0;

  return {
    id: String(r.id),
    assetId: String(r.asset_id || ""),
    dateIso,
    dateMs: Number.isFinite(dateMs) ? dateMs : 0,
    dateLabel: formatLeakDate(dateIso),
    peakDb,
    baselineDb:
      baselineSource === "fallback" ? baselineFallbackDb : baselineDb,
    baselineStored: baselineSource === "stored",
    deltaDb: resolvedDelta,
    probeType,
    baselineSource,
    baselineFallbackDb
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

type UePdSeverity = PdPeakDbSeverity;
type UePdClassification = PdPeakDbClassification;

/**
 * Phase 1 screening on peak dBµV. Boundaries live in the single in-repo table
 * (PD_PEAK_DB_BRACKETS) which supplies BOTH the classification and the
 * severity so they can never disagree on a row.
 */
function classifyPdFromPeakDb(peakDb: number): {
  classification: UePdClassification;
  severity: UePdSeverity;
  severityLabel: string;
} {
  const bracket = evaluatePdPeakDb(safeFinite(peakDb, 0));
  return {
    classification: bracket.classification,
    severity: bracket.severity,
    severityLabel: bracket.severityLabel
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

/**
 * Safe electrical advisory. Deliberately generic: it derives no electrical
 * safety category, protective-equipment level, energy value, or standard
 * citation from dBµV.
 */
const PD_ELECTRICAL_ADVISORY =
  "Severe acoustic discharge detected — follow site electrical safety procedures before approach.";

/**
 * Cross-technology workflow pointer only. It must not assert that a thermal
 * signature exists, pair specific events, or claim a statistical link.
 */
const PD_THERMAL_FOLLOWUP_POINTER =
  "Consider thermal follow-up per site procedure when critical discharge is present.";

type UePdInventoryRow = {
  id: string;
  assetId: string;
  dateIso: string;
  dateMs: number;
  dateLabel: string;
  peakDb: number;
  baselineDb: number;
  baselineDelta: number;
  /** AB persisted basis: fallback means the delta is modeled, not measured. */
  baselineSource: "stored" | "fallback" | "unknown";
  baselineFallbackDb: number | null;
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
  let baselineSource: "stored" | "fallback" | "unknown" = "unknown";
  let baselineFallbackDb: number | null = null;
  let prpdData: Array<[number, number]> | null = null;
  let environmentalContext: { temperature?: number; humidity?: number } | null =
    null;
  let confidenceScore: number | null = null;

  for (const raw of peaks) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (String(p.type || "").toLowerCase() !== "ultrasound") continue;
    const storedBaseline = p.baseline_dbmv ?? p.baseline_dbuv;
    peakDb = safeFinite(p.peak_dbmv ?? p.peak_dbuv, 0);
    baselineDb = safeFinite(storedBaseline, 0);
    if (p.delta_db != null) deltaDb = safeFinite(p.delta_db, 0);
    const sourceRaw = String(
      p.baseline_source ?? p.baselineSource ?? ""
    ).toLowerCase();
    baselineSource =
      sourceRaw === "stored" || sourceRaw === "fallback"
        ? sourceRaw
        : storedBaseline != null && storedBaseline !== ""
          ? "stored"
          : "fallback";
    const fallbackDb = optionalPdConfidence(
      p.baseline_fallback_db ?? p.baselineFallbackDb
    );
    baselineFallbackDb =
      fallbackDb ??
      (baselineSource === "fallback"
        ? optionalPdConfidence(storedBaseline) ?? 28
        : null);
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

  // A fallback baseline still anchors the modeled delta; never subtract 0.
  const baselineForDelta =
    baselineSource === "fallback" && baselineFallbackDb != null
      ? baselineFallbackDb
      : baselineDb;
  const baselineDelta =
    deltaDb != null ? deltaDb : Math.max(0, peakDb - baselineForDelta);
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
    baselineSource,
    baselineFallbackDb,
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
 * Trap ΔT comes ONLY from the trap scan itself (stored per-scan upstream /
 * downstream temperature). A thermography hotspot/reference delta is an
 * electrical-connection measurement and must never be presented as a trap
 * differential, so no IR fallback is read here.
 */
function ueSteamInventoryFromRow(r: SavedAnalysisResult): UeSteamInventoryRow {
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
  let upstreamTemp: number | null = null;
  let downstreamTemp: number | null = null;
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

/**
 * ΔT is a difference: convert by scale only, never with the absolute offset.
 * Kept in one helper so the dBµV UE surface never performs a temp conversion.
 */
function formatSteamDelta(
  tempDropF: number,
  unit: TemperatureDisplayUnit
): string {
  return `${convertTemperatureDelta(tempDropF, "°F", unit).toFixed(1)} ${unit}`;
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
  { id: "waveform", label: "Waveform Metrics", Icon: AudioWaveform }
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

const VIB_TRIAXIAL = [
  { axis: "Horizontal (H)", value: 3.45, unit: "mm/s peak", tone: "text-yellow-500" },
  { axis: "Vertical (V)", value: 2.18, unit: "mm/s peak", tone: "text-green-400" },
  { axis: "Axial (A)", value: 2.92, unit: "mm/s peak", tone: "text-orange-400" }
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
}[] = [
  { id: "wear_metals", label: "Wear Metals & Debris" },
  { id: "chemistry", label: "Fluid Chemistry" },
  { id: "cleanliness", label: "Cleanliness" },
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

interface BroadbandChartPoint {
  date: string;
  fault?: string;
  health?: number;
  peak?: number;
  timestamp?: string;
  /** Included only when the running-state toggle is OFF. */
  stopped?: boolean;
  loadPercent?: number | null;
}

/**
 * Single renderer for the broadband Health / Peak Velocity chart bodies.
 *
 * Both the inline card and the enlarged modal render through this component
 * with the exact same windowed series, guard booleans, threshold resolution
 * and display-unit props — there is no second data path or re-derivation.
 */
function BroadbandTrendChartBody({
  variant,
  data,
  isEmpty,
  isSparse,
  velocityUnit,
  thresholds,
  showThresholds
}: {
  variant: "health" | "velocity";
  data: BroadbandChartPoint[];
  isEmpty: boolean;
  isSparse: boolean;
  velocityUnit: string;
  thresholds: VelocityThresholdResolution;
  showThresholds: boolean;
}) {
  const pointLabel = (
    label: unknown,
    payload: ReadonlyArray<{ payload?: BroadbandChartPoint }> | undefined
  ): string => {
    const point = payload?.[0]?.payload;
    const fault =
      point?.fault && point.fault !== "\u2014" ? ` \u00b7 ${point.fault}` : "";
    const stopped = point?.stopped ? " \u00b7 stopped sample" : "";
    return `${String(label)}${fault}${stopped}`;
  };

  if (isEmpty) {
    return (
      <div
        data-testid={`chart-body-${variant}`}
        className="h-full flex items-center justify-center px-4 text-center"
      >
        <p className="text-sm text-slate-500">
          {variant === "health"
            ? "No analysis data yet - run a diagnostic to populate trends"
            : "No velocity readings yet \u2014 run a diagnostic with spectrum peaks to populate this chart."}
        </p>
      </div>
    );
  }

  if (isSparse) {
    const first = data[0];
    const tone =
      variant === "health"
        ? {
            dot: "bg-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.8)]",
            value: "text-yellow-400",
            label: `${first?.health ?? "\u2014"}`
          }
        : {
            dot: "bg-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.8)]",
            value: "text-orange-400",
            label: `${first?.peak ?? "\u2014"}`
          };
    return (
      <div
        data-testid={`chart-body-${variant}`}
        className="h-full flex flex-col items-center justify-center gap-2 px-4 text-center"
      >
        <span className={`h-3 w-3 rounded-full ${tone.dot}`} />
        <p className={`text-2xl font-bold font-mono ${tone.value}`}>
          {tone.label}
          {variant === "velocity" ? (
            <span className="text-xs font-normal text-slate-400">
              {" "}
              {velocityUnit} peak
            </span>
          ) : null}
        </p>
        <p className="text-xs text-slate-400">
          {first?.date}
          {first?.fault && first.fault !== "\u2014" ? ` \u00b7 ${first.fault}` : ""}
        </p>
        {first?.stopped ? (
          <p className="text-xs font-semibold text-amber-300">
            Stopped sample \u2014 no running-state measurement
          </p>
        ) : null}
        <p className="text-xs text-amber-300">{SPARSE_TREND_HELPER_TEXT}</p>
      </div>
    );
  }

  if (variant === "health") {
    return (
      <ResponsiveContainer
        width="100%"
        height="100%"
        data-testid={`chart-body-${variant}`}
      >
        <LineChart data={data} margin={chartMargin}>
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
            allowEscapeViewBox={{ x: true, y: true }}
            wrapperStyle={{ zIndex: 20 }}
            formatter={(value: number) => [
              `${value}`,
              "Saved diagnostic health score"
            ]}
            labelFormatter={(label, payload) => pointLabel(label, payload)}
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
    );
  }

  return (
    <ResponsiveContainer
      width="100%"
      height="100%"
      data-testid={`chart-body-${variant}`}
    >
      <LineChart data={data} margin={chartMargin}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
        <YAxis
          stroke="#f97316"
          tick={{ fontSize: 11 }}
          label={{
            value: `Peak amp (${velocityUnit})`,
            angle: -90,
            position: "insideLeft",
            fill: "#f97316",
            fontSize: 11
          }}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          allowEscapeViewBox={{ x: true, y: true }}
          wrapperStyle={{ zIndex: 20 }}
          formatter={(value: number) => [
            `${value} ${velocityUnit} (peak)`,
            "Peak amplitude"
          ]}
          labelFormatter={(label, payload) => pointLabel(label, payload)}
        />
        {showThresholds && (
          <ReferenceLine
            y={thresholds.alertDisplay}
            stroke="#eab308"
            strokeDasharray="4 4"
            ifOverflow="extendDomain"
            label={{
              value: thresholds.alertLabel,
              fill: "#eab308",
              fontSize: 10,
              position: "insideTopRight"
            }}
          />
        )}
        {showThresholds && (
          <ReferenceLine
            y={thresholds.dangerDisplay}
            stroke="#ef4444"
            strokeDasharray="4 4"
            ifOverflow="extendDomain"
            label={{
              value: thresholds.dangerLabel,
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
  );
}

type SpectralTrendChartPoint = {
  date: string;
  /** Deterministic X-axis label; same-date points get a "· n" suffix. */
  dateLabel: string;
  amp1X: number | null;
  amp2X: number | null;
  overall: number | null;
  amp1XSource?: "stored" | "derived" | null;
  amp2XSource?: "stored" | "derived" | null;
  stoppedLabel?: string | null;
  ratio?: HarmonicRatio | null;
};

interface SpectralTooltipEntry {
  dataKey?: unknown;
  value?: unknown;
  payload?: unknown;
}

/**
 * Public tooltip for the spectral series. It is the only place a per-point
 * "stopped sample" label and the stored-vs-derived order provenance surface,
 * matching the Broadband tooltip contract when Running State Only is OFF.
 */
function SpectralTrendTooltip({
  active,
  payload,
  velocityUnit
}: {
  active?: boolean;
  payload?: ReadonlyArray<SpectralTooltipEntry>;
  velocityUnit: DisplayUnits["velocity"];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as SpectralTrendChartPoint | undefined;
  if (!point) return null;

  const allRows: Array<{
    key: "amp1X" | "amp2X" | "overall";
    name: string;
    color: string;
    source?: "stored" | "derived" | null;
  }> = [
    {
      key: "amp1X",
      name: "1X Amplitude (Unbalance)",
      color: "#38bdf8",
      source: point.amp1XSource
    },
    {
      key: "amp2X",
      name: "2X Amplitude (Misalignment)",
      color: "#f59e0b",
      source: point.amp2XSource
    },
    { key: "overall", name: "Overall Vibration", color: "#94a3b8" }
  ];
  const rows = allRows.filter((row) => point[row.key] != null);

  if (rows.length === 0 && !point.stoppedLabel) return null;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] shadow-lg">
      <div className="mb-1 text-slate-400">{point.dateLabel || point.date}</div>
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: row.color }}
          />
          <span className="text-slate-300">{row.name}</span>
          <span className="ml-3 font-mono text-white">
            {Number(point[row.key]).toFixed(3)} {velocityUnit}
          </span>
          {spectralOrderProvenanceLabel(row.source) ? (
            <span className="ml-2 text-[10px] text-slate-500">
              {spectralOrderProvenanceLabel(row.source)}
            </span>
          ) : null}
        </div>
      ))}
      {point.stoppedLabel ? (
        <div className="mt-1 text-[10px] text-amber-300">
          {point.stoppedLabel}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Single renderer for the Spectral & Harmonics 1X/2X/overall series. Inline and
 * enlarged views share this body so guards and display units never diverge.
 *
 * `hasOrderSeries` is driven by actual amplitudes (stored or re-extracted), not
 * by RPM availability: a stored 1X/2X measurement must never be hidden just
 * because the sample has no running speed.
 *
 * Unit physics: data arrives as velocity values converted only by the
 * frequency-independent mm/s <-> in/s display helper. No g conversion is
 * applied here (that would need an order frequency).
 */
function SpectralTrendChartBody({
  data,
  windowEmpty,
  isSparse,
  hasOrderSeries,
  velocityUnit,
  timeRange
}: {
  data: SpectralTrendChartPoint[];
  windowEmpty: boolean;
  isSparse: boolean;
  hasOrderSeries: boolean;
  velocityUnit: DisplayUnits["velocity"];
  timeRange: TimeRange;
}) {
  if (windowEmpty) {
    return (
      <div
        data-testid="chart-body-spectral"
        className="h-full flex items-center justify-center px-4 text-center"
      >
        <p className="text-sm text-slate-500">
          No spectral readings in the selected {timeRange} window.
        </p>
      </div>
    );
  }

  if (isSparse) {
    return (
      <div
        data-testid="chart-body-spectral"
        className="h-full flex flex-col items-center justify-center gap-2 px-4 text-center"
      >
        <span className="h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
        <p className="text-2xl font-bold font-mono text-cyan-400">
          {data[0]?.overall != null
            ? Number(data[0].overall).toFixed(3)
            : "\u2014"}{" "}
          <span className="text-xs font-normal text-slate-400">
            {velocityUnit} overall
          </span>
        </p>
        <p className="text-xs text-slate-400">{data[0]?.dateLabel}</p>
        {data[0]?.stoppedLabel ? (
          <p className="text-xs text-amber-300">{data[0].stoppedLabel}</p>
        ) : null}
        <p className="text-xs text-amber-300">{SPARSE_TREND_HELPER_TEXT}</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer
      width="100%"
      height="100%"
      data-testid="chart-body-spectral"
    >
      <LineChart
        data={data}
        margin={{ top: 16, right: 24, bottom: 28, left: 48 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="dateLabel"
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
            value: spectralAmplitudeAxisLabel(velocityUnit),
            angle: -90,
            position: "insideLeft",
            fill: "#38bdf8",
            fontSize: 11
          }}
        />
        <Tooltip
          content={<SpectralTrendTooltip velocityUnit={velocityUnit} />}
          allowEscapeViewBox={{ x: true, y: true }}
          wrapperStyle={{ zIndex: 20 }}
        />
        <Legend />
        {hasOrderSeries && (
          <>
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
          </>
        )}
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
  );
}

/**
 * One latest-in-window order readout. A stored amplitude is a measurement and
 * renders even without RPM; an absent one says why instead of showing a
 * fabricated zero.
 */
function SpectralOrderReadout({
  order,
  value,
  unit,
  source,
  testId
}: {
  order: string;
  value: number | null | undefined;
  unit: DisplayUnits["velocity"];
  source: "stored" | "derived" | null | undefined;
  testId: string;
}) {
  const provenance =
    value == null
      ? "not stored \u2014 no stored RPM for bin re-extraction"
      : spectralOrderProvenanceLabel(source) || "source unrecorded";
  return (
    <div data-testid={testId}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {order}
      </p>
      <p className="font-mono text-lg font-semibold text-white">
        {value == null ? "\u2014" : Number(value).toFixed(3)}{" "}
        <span className="text-[11px] font-normal text-slate-400">{unit}</span>
      </p>
      <p className="text-[10px] text-slate-500">{provenance}</p>
    </div>
  );
}

type EnvelopingGeChartPoint = {
  date: string;
  dateLabel?: string;
  peakGe: number;
  stoppedLabel?: string | null;
};

type EnvelopingKurtosisChartPoint = {
  date: string;
  dateLabel?: string;
  kurtosis: number;
  stoppedLabel?: string | null;
};

/** Shared Peak gE body for the inline card and the enlarged modal. */
function EnvelopingGeChartBody({
  data,
  hasAnySeries,
  timeRange,
  baselinePeakGe,
  isSparse = false
}: {
  data: EnvelopingGeChartPoint[];
  hasAnySeries: boolean;
  timeRange: TimeRange;
  baselinePeakGe: number | null;
  isSparse?: boolean;
}) {
  if (data.length === 0) {
    return (
      <div
        data-testid="chart-body-envelopingGe"
        className="h-full flex items-center justify-center px-4 text-center"
      >
        <p className="text-sm text-slate-500">
          {!hasAnySeries ? (
            <>
              No recorded g<sub>E</sub> values yet — run a diagnostic with
              enveloping / acceleration data.
            </>
          ) : (
            <>
              No recorded g<sub>E</sub> values in the selected {timeRange}{" "}
              window.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="chart-body-envelopingGe">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={chartMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="dateLabel"
              stroke="#94a3b8"
              tick={{ fontSize: 11 }}
            />
            <YAxis stroke="#eab308" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={tooltipStyle}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ zIndex: 20 }}
              labelFormatter={(_label, payload) => {
                const point = payload?.[0]?.payload as
                  | EnvelopingGeChartPoint
                  | undefined;
                if (!point) return _label;
                return point.stoppedLabel
                  ? `${point.dateLabel ?? point.date} \u00b7 ${point.stoppedLabel}`
                  : point.dateLabel ?? _label;
              }}
            />
            {baselinePeakGe != null && baselinePeakGe > 0 && (
              <ReferenceLine
                y={baselinePeakGe}
                stroke="#f59e0b"
                strokeDasharray="6 4"
                label={{
                  value: `Baseline ${baselinePeakGe.toFixed(2)} gE`,
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
      </div>
      {isSparse && (
        <p className="text-xs text-amber-300 pt-1">{SPARSE_TREND_HELPER_TEXT}</p>
      )}
    </div>
  );
}

/** Shared Kurtosis body for the inline card and the enlarged modal. */
function EnvelopingKurtosisChartBody({
  data,
  hasAnySeries,
  timeRange,
  baselineKurtosis,
  isSparse = false
}: {
  data: EnvelopingKurtosisChartPoint[];
  hasAnySeries: boolean;
  timeRange: TimeRange;
  baselineKurtosis: number | null;
  isSparse?: boolean;
}) {
  if (data.length === 0) {
    return (
      <div
        data-testid="chart-body-envelopingKurtosis"
        className="h-full flex items-center justify-center px-4 text-center"
      >
        <p className="text-sm text-slate-500">
          {!hasAnySeries
            ? "No kurtosis / crest factor recorded yet."
            : `No kurtosis / crest factor recorded in the selected ${timeRange} window.`}
        </p>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col"
      data-testid="chart-body-envelopingKurtosis"
    >
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={chartMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="dateLabel"
              stroke="#94a3b8"
              tick={{ fontSize: 11 }}
            />
            <YAxis stroke="#22d3ee" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={tooltipStyle}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ zIndex: 20 }}
              labelFormatter={(_label, payload) => {
                const point = payload?.[0]?.payload as
                  | EnvelopingKurtosisChartPoint
                  | undefined;
                if (!point) return _label;
                return point.stoppedLabel
                  ? `${point.dateLabel ?? point.date} \u00b7 ${point.stoppedLabel}`
                  : point.dateLabel ?? _label;
              }}
            />
            {baselineKurtosis != null && baselineKurtosis > 0 && (
              <ReferenceLine
                y={baselineKurtosis}
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
      </div>
      {isSparse && (
        <p className="text-xs text-amber-300 pt-1">{SPARSE_TREND_HELPER_TEXT}</p>
      )}
    </div>
  );
}

const ENVELOPING_UNIT_PHYSICS_NOTE =
  "Envelope amplitudes stay in stored gE / gSE (and acceleration in g). The g and Hz display selectors never convert them: gE to velocity/acceleration is frequency-dependent and would need the demodulation band, not just stored RPM.";

const ENVELOPING_ORDER_OVERLAY_NOTE =
  "Expected bearing defect orders computed from stored bearing geometry and a gating-quality RPM.";

export const ENVELOPING_BEARING_DORMANT_NOTE =
  "Bearing geometry/RPM not configured \u2014 envelope trends shown without defect-frequency overlay.";

/** Frequency-axis envelope order overlay (BPFO/BPFI/BSF/FTF reference lines). */
function EnvelopeOrderOverlayChart({
  data,
  frequencies
}: {
  data: Array<{ frequency: number; amplitude: number | null; label: string }>;
  frequencies: BearingFaultFrequenciesHz;
}) {
  const lines = [
    { key: "BPFO", hz: frequencies.bpfo, color: "#f87171" },
    { key: "BPFI", hz: frequencies.bpfi, color: "#c084fc" },
    { key: "BSF", hz: frequencies.bsf, color: "#fb923c" },
    { key: "FTF", hz: frequencies.ftf, color: "#22d3ee" }
  ].filter((line) => Number.isFinite(line.hz) && line.hz > 0);

  const measuredMax = Math.max(
    0,
    ...data.map((point) => (Number.isFinite(point.frequency) ? point.frequency : 0))
  );
  const expectedMax = Math.max(0, ...lines.map((line) => line.hz));
  const xMax = Math.max(measuredMax, expectedMax) * 1.1 || 1;

  return (
    <div data-testid="enveloping-order-overlay">
      <div className="flex flex-wrap gap-2 mb-2">
        {lines.map((line) => (
          <span
            key={line.key}
            data-testid={`enveloping-order-${line.key}`}
            className="rounded-full border px-2 py-0.5 text-[10px] font-mono"
            style={{ borderColor: line.color, color: line.color }}
          >
            {line.key} {line.hz.toFixed(2)} Hz
          </span>
        ))}
      </div>
      <div className="h-[300px] bg-slate-950 rounded-lg border border-white/10 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 28, left: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="frequency"
              type="number"
              domain={[0, xMax]}
              stroke="#94a3b8"
              tick={{ fontSize: 10 }}
              label={{
                value: "Frequency (Hz)",
                position: "insideBottom",
                offset: -12,
                fill: "#94a3b8",
                fontSize: 10
              }}
            />
            <YAxis stroke="#f59e0b" tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={tooltipStyle}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ zIndex: 20 }}
            />
            {lines.map((line) => (
              <ReferenceLine
                key={line.key}
                x={line.hz}
                stroke={line.color}
                strokeDasharray="4 3"
                label={{
                  value: line.key,
                  fill: line.color,
                  fontSize: 10,
                  position: "insideTop"
                }}
              />
            ))}
            <Bar
              dataKey="amplitude"
              fill="#f59e0b"
              name="Stored envelope amplitude"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


/**
 * Dark-styled enlarge dialog. Focus is trapped while open, body scroll is
 * locked, and focus returns to the icon button that opened it on unmount.
 */
function TrendChartExpandModal({
  title,
  subtitle,
  onClose,
  children
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const root = dialogRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter(
        (el) =>
          !el.hasAttribute("disabled") &&
          el.getAttribute("aria-hidden") !== "true"
      );

      if (focusables.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !root.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !root.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="trend-chart-expand-modal"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-white">{title}</h3>
            {subtitle ? (
              <p className="truncate text-xs text-slate-400">{subtitle}</p>
            ) : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 cursor-pointer"
            aria-label="Close enlarged chart"
          >
            ✕
          </button>
        </div>
        <div
          className="min-h-[450px] overflow-visible bg-slate-950 p-4"
          style={{ height: "min(70vh, 560px)", minHeight: "450px" }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ChartExpandButton({
  onClick,
  label
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 cursor-pointer"
      aria-label={label}
      title={label}
    >
      <Maximize2 className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

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
                  content: (props) => (
                    <EventBadgeLabel
                      viewBox={
                        props.viewBox && "x" in props.viewBox
                          ? props.viewBox
                          : undefined
                      }
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

function toSpectralHarmonicInputs(
  analyses: readonly SavedAnalysisResult[]
) {
  // Caller passes newest-first SSOT rows; reverse to chronological for writing.
  return [...analyses].reverse().map((analysis) => {
    const rec = extractVibrationRecordFromAnalysis(analysis);
    const rpmReading = readVibrationRpmProvenance(analysis);
    return {
      timestamp: rec?.timestamp || analysis.timestamp,
      /**
       * STORED running speed for THIS sample only. We never fall back to the
       * Equipment-DB rating here: an unmeasured RPM must not fabricate a 1X
       * frequency or a re-extracted bin amplitude (SLICE-VS4).
       *
       * SLICE-VS5: the number travels with its provenance; a capture-default /
       * unrecorded source is not gating-quality downstream.
       */
      rpm: rpmReading.rpm,
      rpmSource: rpmReading.source,
      peaks: rec?.spectral || [],
      overall:
        rec?.broadband?.overallVelocity ||
        peakAmplitudeFromAnalysis(analysis) ||
        null,
      stoppedLabel: vibrationStoppedSampleLabel(analysis)
    };
  });
}

function formatRpmHz(
  rpm: number | null,
  frequencyUnit: DisplayUnits["frequency"] = "Hz"
): string {
  if (rpm == null || !Number.isFinite(rpm) || rpm <= 0) return "Not set";
  const hz = rpm / 60;
  const display = frequencyDisplayValue(hz, frequencyUnit, rpm);
  return `${rpm.toLocaleString()} RPM (${display.text})`;
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

  // SLICE-H2 - display-only unit preference. The API scopes this to the
  // session tenant; canonical values and classifyZone never see these units.
  const {
    units: displayUnits,
    setUnits: setDisplayUnitsLocal,
    saveUnits: saveDisplayUnits,
    error: displayUnitsError
  } = useTenantDisplayUnits();
  const displayUnitsRef = useRef(displayUnits);
  displayUnitsRef.current = displayUnits;
  const [unitsSaveError, setUnitsSaveError] = useState<string | null>(null);
  const updateDisplayUnits = useCallback(
    async (patch: Partial<DisplayUnits>) => {
      const next = { ...displayUnitsRef.current, ...patch };
      displayUnitsRef.current = next;
      setDisplayUnitsLocal(next);
      try {
        await saveDisplayUnits(next);
        setUnitsSaveError(null);
      } catch (err) {
        setUnitsSaveError(
          err instanceof Error ? err.message : "Failed to save display units"
        );
      }
    },
    [saveDisplayUnits, setDisplayUnitsLocal]
  );

  const [equipTick, setEquipTick] = useState(0);
  const equipmentRoutes = useMemo(() => {
    void equipTick;
    return getEquipmentData();
  }, [equipTick]);
  const flatEquipment = useMemo(() => {
    void equipTick;
    return getFlatEquipment();
  }, [equipTick]);
  // Component-spec saves refresh the localStorage cache through saveEquipmentStore,
  // but this view only re-read it on its own Refresh button. Subscribe so BPFO /
  // BPFI / BSF / FTF and the enveloping surfaces recompute without a re-save.
  useEffect(() => {
    return subscribeEquipmentStoreChanged(() => {
      setEquipTick((n) => n + 1);
    });
  }, []);
  // H7 - the invisible system route is surfaced here as "Facility (direct)".
  const routeOptions = useMemo(
    () => equipmentRoutes.map((r) => ({ id: r.id, name: routeDisplayName(r) })),
    [equipmentRoutes]
  );

  const [selectedRouteName, setSelectedRouteName] = useState("");
  const [selectedAssetKey, setSelectedAssetKey] = useState("");
  const [selectedComponent, setSelectedComponent] = useState("");
  const [trendTech, setTrendTech] = useState<string>("vibration");
  const [vibMode, setVibMode] = useState<VibMode>("broadband");
  const [irMode, setIrMode] = useState<IrMode>("hotspot");
  const [ueMode, setUeMode] = useState<UeMode>("bearings");
  const [mcaMode, setMcaMode] = useState<McaMode>("winding");
  /** MCA Single Source of Truth — all four tabs read slices from this record. */
  const [mcaRecord, setMcaRecord] = useState<McaSsotRecord>(EMPTY_MCA_SSOT);
  const mergeMcaRecord = useCallback((patch: McaSsotPatch) => {
    setMcaRecord((prev) => deepMergeMcaSsot(prev, patch));
  }, []);
  const [mcaPdfFileName, setMcaPdfFileName] = useState<string | null>(null);
  const [mcaPdfParsing, setMcaPdfParsing] = useState(false);
  const [mcaPdfError, setMcaPdfError] = useState<string | null>(null);
  const [mcaManualEdit, setMcaManualEdit] = useState(false);
  const [mcaPdfDragOver, setMcaPdfDragOver] = useState(false);
  const mcaPdfInputRef = useRef<HTMLInputElement>(null);
  const mcaAssetKeyRef = useRef(selectedAssetKey);
  const [ricCompareBaseline, setRicCompareBaseline] = useState(false);
  const [ricApplySmoothing, setRicApplySmoothing] = useState(true);
  const [ricShowGrid, setRicShowGrid] = useState(false);
  const [ricPasteError, setRicPasteError] = useState<string | null>(null);
  const [surgePasteError, setSurgePasteError] = useState<string | null>(null);
  const surgeCsvInputRef = useRef<HTMLInputElement>(null);
  const [activeOilSubTab, setActiveOilSubTab] = useState<OilSubTab>("wear_metals");
  const [addOilSampleOpen, setAddOilSampleOpen] = useState(false);
  const [oilSampleRefreshKey, setOilSampleRefreshKey] = useState(0);
  const [timeRange, setTimeRange] = useState<TimeRange>("30D");
  const [runningOnly, setRunningOnly] = useState(true);
  const [overlayParam, setOverlayParam] = useState<OverlayParam>(null);
  const [speedFactor, setSpeedFactor] = useState(1.0);
  const [showThresholds, setShowThresholds] = useState(true);
  const [expandedChart, setExpandedChart] =
    useState<ExpandedTrendChartId | null>(null);
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
    setSelectedRouteName((prev) => prev || routeOptions[0]?.name || "");
  }, [equipmentRoutes, routeOptions, flatEquipment, selectedAssetId]);

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
        `RUNNING SPEED: ${formatRpmHz(rpm, displayUnits.frequency)}`,
        bpfo ? `BEARING: ${bearing} (BPFO: ${bpfo})` : `BEARING: ${bearing}`
      ],
      isoClass,
      rpm,
      bearing
    };
  }, [selectedAsset, selectedComp, displayUnits.frequency]);

  /**
   * Same condition the amber KinematicSpecsEmptyState uses. The ISO threshold
   * basis note below is tied to it so the chart never presents a default zone
   * band as a configured/OEM limit.
   */
  const kinematicSpecsUnconfigured = Boolean(
    selectedAsset &&
      (machineSpecs.rpm == null ||
        machineSpecs.isoClass === "Not set" ||
        machineSpecs.bearing === "Not set")
  );

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

  /**
   * One shared window for every vibration trend surface (broadband, spectral,
   * enveloping charts + table). The time predicate runs exactly once, then the
   * running-state scope (load telemetry) and deterministic newest-first
   * ordering are applied to that same array. No surface may re-filter or
   * re-select from raw `vibAnalyses`.
   */
  const windowedVibAnalyses = useMemo(
    () =>
      sortVibrationRowsNewestFirst(
        applyVibrationRunningStateFilter(
          filterTrendByTimeRange(vibAnalyses, timeRange),
          runningOnly
        )
      ),
    [vibAnalyses, timeRange, runningOnly]
  );

  /** Latest-in-window row — single selection shared by KPI/matrix/axes. */
  const latestVibrationRow = windowedVibAnalyses[0] ?? null;
  const latestVibrationSample = useMemo(
    () => (latestVibrationRow ? vibrationSampleState(latestVibrationRow) : null),
    [latestVibrationRow]
  );

  /** Latest unified diagnostic record inside the shared window (no cache fallback). */
  const latestVibrationRecord = useMemo(
    (): VibrationDiagnosticRecord | null =>
      latestVibrationRecordFromRows(windowedVibAnalyses),
    [windowedVibAnalyses]
  );

  /**
   * Waveform samples are one captured snapshot, not a windowed trend. The
   * Waveform Metrics tab keeps its pre-VS1 latest-record behavior so an old
   * capture is not erased by the broadband time window; the broadband KPI,
   * matrix and axis cards never read this record.
   */
  const latestWaveformRecord = useMemo(
    (): VibrationDiagnosticRecord | null =>
      latestVibrationRecordFromRows(vibAnalyses),
    [vibAnalyses]
  );

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
  /**
   * MCA winding / groundwall are point-in-time de-energized tests, not a
   * continuous series. The shared 7D/30D/90D/1Y window therefore selects
   * WHICH stored test is latest / in view — it does not imply a trend line.
   * Delegating to the shared predicate keeps the toolbar honest and in
   * lockstep with the other technologies.
   */
  const windowedMcaAnalyses = useMemo(
    () => windowTrendByTimeRange(mcaAnalyses, timeRange),
    [mcaAnalyses, timeRange]
  );
  /**
   * Real stored RIC traces for this asset, newest first (the API orders by
   * timestamp DESC). The overlay baseline is the OLDEST stored trace — never a
   * local snapshot, a default, or a synthesized waveform.
   */
  const ricStoredTraces = useMemo(() => {
    const traces: { analysisId: string; timestamp: string; series: RicDataPoint[] }[] = [];
    const seen = new Set<string>();
    for (const row of mcaAnalyses) {
      const series = extractMcaRicFromSaved(row);
      if (series.length === 0) continue;
      const analysisId = String(
        row.id ?? `${row.timestamp ?? ""}|${traces.length}`
      );
      if (seen.has(analysisId)) continue;
      seen.add(analysisId);
      traces.push({
        analysisId,
        timestamp: String(row.timestamp ?? ""),
        series
      });
    }
    return traces;
  }, [mcaAnalyses]);
  const ricHistoricalBaselineSeries = useMemo(
    () =>
      ricStoredTraces.length > 1
        ? ricStoredTraces[ricStoredTraces.length - 1].series
        : [],
    [ricStoredTraces]
  );
  const ricHistoricalBaseline =
    ricStoredTraces.length > 1
      ? ricStoredTraces[ricStoredTraces.length - 1]
      : null;
  const hasRicHistoricalBaseline = ricHistoricalBaselineSeries.length > 0;
  const oilAnalyses = useMemo(
    () =>
      dbAnalyses.filter((r) => {
        const t = resolveAnalysisType(r);
        return t === "oil" || t === "oil_analysis";
      }),
    [dbAnalyses]
  );

  const healthTrendSeries = useMemo(() => {
    return [...windowedVibAnalyses]
      .filter((r) => r.health_score != null)
      .reverse()
      .map((r) => {
        const sample = vibrationSampleState(r);
        return {
          date: r.timestamp
            ? new Date(r.timestamp).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric"
              })
            : "—",
          health: Number(r.health_score) || 0,
          fault: r.primary_fault || "—",
          timestamp: r.timestamp,
          stopped: sample.stopped,
          loadPercent: sample.loadPercent
        };
      });
  }, [windowedVibAnalyses]);

  const velocityTrendSeries = useMemo(() => {
    return [...windowedVibAnalyses]
      .map((r) => {
        const peak = peakAmplitudeFromAnalysis(r);
        if (peak == null) return null;
        const sample = vibrationSampleState(r);
        return {
          date: r.timestamp
            ? new Date(r.timestamp).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric"
              })
            : "—",
          peak,
          fault: r.primary_fault || "—",
          timestamp: r.timestamp,
          stopped: sample.stopped,
          loadPercent: sample.loadPercent
        };
      })
      .filter(Boolean)
      .reverse() as {
      date: string;
      peak: number;
      fault: string;
      timestamp: string;
      stopped: boolean;
      loadPercent: number | null;
    }[];
  }, [windowedVibAnalyses]);

  const healthTrendIsSparse = useMemo(
    () => isSparseTrendSeries(healthTrendSeries),
    [healthTrendSeries]
  );
  const velocityTrendIsSparse = useMemo(
    () => isSparseTrendSeries(velocityTrendSeries),
    [velocityTrendSeries]
  );

  const activeAnalyses = useMemo(() => {
    if (trendTech === "thermography") return thermoAnalyses;
    if (trendTech === "ultrasound") return ueAnalyses;
    if (trendTech === "mca") return windowedMcaAnalyses;
    if (trendTech === "oil_analysis") return oilAnalyses;
    if (trendTech === "vibration") return windowedVibAnalyses;
    return dbAnalyses;
  }, [
    trendTech,
    thermoAnalyses,
    ueAnalyses,
    windowedMcaAnalyses,
    oilAnalyses,
    windowedVibAnalyses,
    dbAnalyses
  ]);

  const latestDb = activeAnalyses[0] ?? null;
  const latestThermo = thermoAnalyses[0] ?? null;
  const latestMca = windowedMcaAnalyses[0] ?? null;
  const latestMcaGroundwallRow = useMemo(
    () => findLatestMcaWithGroundwall(windowedMcaAnalyses) ?? latestMca,
    [windowedMcaAnalyses, latestMca]
  );

  // SSOT hydration: merge DB telemetry into master record (never wipe sibling domains).
  useEffect(() => {
    const assetChanged = mcaAssetKeyRef.current !== selectedAssetKey;
    mcaAssetKeyRef.current = selectedAssetKey;
    const latest = windowedMcaAnalyses[0] ?? null;
    const gwRow = latestMcaGroundwallRow;
    // Point-in-time window: if no stored MCA test falls inside the selected
    // 7D/30D/90D/1Y window, the honest in-view state is empty — never a stale
    // out-of-window snapshot.
    if (!latest) {
      setMcaRecord(EMPTY_MCA_SSOT);
      return;
    }
    setMcaRecord((prev) =>
      deepMergeMcaSsot(
        assetChanged ? EMPTY_MCA_SSOT : prev,
        mcaSsotFromSaved(latest, gwRow)
      )
    );
  }, [windowedMcaAnalyses, latestMcaGroundwallRow, selectedAssetKey]);

  const ricData = mcaRecord.rotor_influence.series;
  const surgeData = mcaRecord.surge.waveform;
  const surgeTestVoltageV = mcaRecord.surge.test_voltage_v ?? null;

  const mcaWindingParams = useMemo(() => {
    const w = mcaWindingFromSsot(mcaRecord.phase_balance);
    const fromDb = extractMcaWindingFromSaved(latestMca);
    return {
      ...w,
      windingTempC: w.windingTempC ?? fromDb.windingTempC,
      conductorMaterial: w.conductorMaterial ?? fromDb.conductorMaterial,
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
  const mcaWindingBracket = useMemo(
    () =>
      mcaWindingResult.hasData
        ? evaluateMcaSeverity(mcaWindingResult.maxUnbalance)
        : null,
    [mcaWindingResult]
  );
  /**
   * Display-unit boundary for temperature only. The stored value and the
   * normalization formula remain °C-locked; this converts the display only.
   */
  const mcaWindingTempDisplayUnit = resolveTemperatureDisplayUnit(
    displayUnits.temperature,
    "°C"
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
              Resistance: mcaWindingResult.phaseR25[0] || undefined,
              Inductance: mcaWindingParams.phaseL[0] || undefined
            },
            {
              phase: "T2-T3",
              Resistance: mcaWindingResult.phaseR25[1] || undefined,
              Inductance: mcaWindingParams.phaseL[1] || undefined
            },
            {
              phase: "T3-T1",
              Resistance: mcaWindingResult.phaseR25[2] || undefined,
              Inductance: mcaWindingParams.phaseL[2] || undefined
            }
          ]
        : [
            { phase: "T1-T2" },
            { phase: "T2-T3" },
            { phase: "T3-T1" }
          ],
    [mcaWindingParams, mcaWindingResult, hasMcaWindingData]
  );

  const mcaGwSnapshot = useMemo(
    () => mcaGroundwallFromSsot(mcaRecord.groundwall),
    [mcaRecord.groundwall]
  );

  /**
   * Nameplate voltage is stored on the component kinematics (and, for newer
   * saves, in MCA groundwall telemetry). Never inferred from test voltage.
   */
  const mcaRatedVoltageV = useMemo(() => {
    // Use the selected component; when the asset has exactly one component
    // its stored kinematics are unambiguous. Never pick among several.
    const component =
      selectedComp ??
      (selectedAsset?.components.length === 1
        ? selectedAsset.components[0]
        : null);
    const kinematics = (component?.kinematics ?? null) as Record<
      string,
      unknown
    > | null;
    return parseRatedVoltageVolts(
      mcaRecord.groundwall.rated_voltage_v ??
        mcaGwSnapshot.ratedVoltageV ??
        kinematics?.voltage ??
        null
    );
  }, [
    selectedComp,
    selectedAsset,
    mcaRecord.groundwall.rated_voltage_v,
    mcaGwSnapshot.ratedVoltageV
  ]);

  const mcaGwResult = useMemo(() => {
    const computed = calculateGroundwallInsulation({
      ir15sMOmega: mcaGwSnapshot.ir15sMOmega,
      ir30sMOmega: mcaGwSnapshot.ir30sMOmega,
      ir1mMOmega: mcaGwSnapshot.ir1mMOmega || 0,
      ir10mMOmega: mcaGwSnapshot.ir10mMOmega,
      testVoltageV: mcaGwSnapshot.testVoltageV || 0,
      windingTempC: mcaGwSnapshot.windingTempC,
      insulationClass: mcaGwSnapshot.insulationClass as InsulationClass,
      ratedVoltageV: mcaRatedVoltageV ?? undefined
    });
    // A report PI/DAR fallback is only trustworthy when the raw sequence
    // passes the data-quality gate — never re-inject an artifact ratio.
    const reportPi =
      mcaGwSnapshot.reportPi != null && mcaGwSnapshot.reportPi > 0
        ? mcaGwSnapshot.reportPi
        : null;
    const reportDar =
      mcaGwSnapshot.reportDar != null && mcaGwSnapshot.reportDar > 0
        ? mcaGwSnapshot.reportDar
        : null;
    const pi = computed.dataQuality.valid ? computed.pi ?? reportPi : null;
    const dar = computed.dataQuality.valid ? computed.dar ?? reportDar : null;
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
  }, [mcaGwSnapshot, mcaRecord, mcaRatedVoltageV]);

  const mcaGwVoltageGuard = useMemo(
    () =>
      evaluateGroundwallTestVoltage({
        testVoltageV: mcaGwSnapshot.testVoltageV,
        ratedVoltageV: mcaRatedVoltageV
      }),
    [mcaGwSnapshot.testVoltageV, mcaRatedVoltageV]
  );

  const hasMcaGwData = hasMcaSsotGroundwall(mcaRecord) || mcaGwResult.hasData;

  const mcaExtractLoaded =
    mcaRecord.meta.source === "pdf" || mcaRecord.meta.source === "vision";
  const mcaMetaSource = mcaRecord.meta.source;
  const rawExtractFormat = mcaRecord.meta.formatDetected ?? "UNKNOWN";
  const mcaExtractFormat: McaPdfFormat = isMcaPdfFormat(rawExtractFormat)
    ? rawExtractFormat
    : "UNKNOWN";
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
          ricCompareBaseline && hasRicHistoricalBaseline
            ? ricHistoricalBaselineSeries
            : undefined
      }),
    [
      ricData,
      ricApplySmoothing,
      ricCompareBaseline,
      hasRicHistoricalBaseline,
      ricHistoricalBaselineSeries
    ]
  );

  const hasRicData = ricData.length > 0 && ricResult != null;

  const ricLinearChartData = useMemo(() => {
    if (!ricResult) return [];
    const baseMap: Map<number, RicDataPoint> = new Map<number, RicDataPoint>();
    for (const point of ricHistoricalBaselineSeries) {
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
  }, [ricResult, ricHistoricalBaselineSeries, ricCompareBaseline]);

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

  /**
   * IEEE 522 voltage-ceiling guard. Gated on a STORED nameplate voltage
   * (component kinematics or MCA groundwall telemetry) — never inferred from
   * the entered test voltage. Omitted cleanly when the rating is absent.
   */
  const surgeVoltageGuard = useMemo(
    () =>
      evaluateSurgeTestVoltage({
        testVoltageV: surgeTestVoltageV,
        ratedVoltageV: mcaRatedVoltageV
      }),
    [surgeTestVoltageV, mcaRatedVoltageV]
  );

  /**
   * Damping alpha is computed ONLY from stored multi-point decay samples.
   * calculateSurgeDamping returns null otherwise, so the card is omitted.
   */
  const surgeDamping = useMemo(
    () => calculateSurgeDamping(surgeData),
    [surgeData]
  );

  /**
   * SSOT lockstep (SLICE-VS4): the spectral series reads the same windowed,
   * running-state-scoped, deterministically sorted rows as Broadband. No
   * surface re-filters raw `vibAnalyses` or re-selects its own latest row.
   */
  const spectralScopeRows = useMemo(
    () => vibrationRowsInScope(windowedVibAnalyses, runningOnly),
    [windowedVibAnalyses, runningOnly]
  );

  const spectralHarmonicTrendAll = useMemo(
    () => buildSpectralHarmonicTrend(toSpectralHarmonicInputs(vibAnalyses)),
    [vibAnalyses]
  );

  const spectralHarmonicTrend = useMemo(
    () => buildSpectralHarmonicTrend(toSpectralHarmonicInputs(spectralScopeRows)),
    [spectralScopeRows]
  );

  const hasAnySpectralTrend = spectralHarmonicTrendAll.rows.length > 0;
  const isUsingReferenceSpectralTrend = !hasAnySpectralTrend;
  const spectralWindowEmpty =
    hasAnySpectralTrend && spectralHarmonicTrend.rows.length === 0;
  const spectralTrendChartData: SpectralTrendChartPoint[] =
    isUsingReferenceSpectralTrend
      ? REFERENCE_TREND_DATA.map((point) => ({
          ...point,
          dateLabel: point.date
        }))
      : spectralHarmonicTrend.rows;
  const spectralOrdersUnavailable =
    !isUsingReferenceSpectralTrend && spectralHarmonicTrend.ordersUnavailable;
  const spectralHasOrderSeries =
    !isUsingReferenceSpectralTrend && spectralHarmonicTrend.hasOrderSeries;
  const spectralHasStoredOrders =
    !isUsingReferenceSpectralTrend && spectralHarmonicTrend.hasStoredOrders;
  const spectralTrendIsSparse =
    !isUsingReferenceSpectralTrend && spectralHarmonicTrend.isSparse;
  const spectralHasStoppedSamples = useMemo(
    () =>
      spectralScopeRows.some(
        (row) => vibrationStoppedSampleLabel(row) != null
      ),
    [spectralScopeRows]
  );
  const spectralWindowEmptyNote = spectralWindowEmpty
    ? runningOnly
      ? "No running-state samples in this range \u2014 turn off Running State Only to include stopped samples."
      : "No spectral readings in this time range."
    : null;

  // Display-only projection: amplitudes keep the stored velocity dimension.
  // Only mm/s <-> in/s is applied (frequency-independent). The g/Hz selectors
  // never touch this series.
  const spectralTrendDisplayData = useMemo(
    () =>
      spectralTrendChartData.map((point) => ({
        ...point,
        dateLabel: point.dateLabel || point.date,
        amp1X:
          point.amp1X == null
            ? null
            : velocityValueForDisplay(point.amp1X, displayUnits.velocity),
        amp2X:
          point.amp2X == null
            ? null
            : velocityValueForDisplay(point.amp2X, displayUnits.velocity),
        overall:
          point.overall == null
            ? null
            : velocityValueForDisplay(point.overall, displayUnits.velocity)
      })),
    [spectralTrendChartData, displayUnits.velocity]
  );

  /** Latest-in-window spectral row for the summary strip (never a raw pick). */
  const spectralLatestPoint = isUsingReferenceSpectralTrend
    ? null
    : spectralTrendDisplayData[spectralTrendDisplayData.length - 1] ?? null;

  /**
   * SLICE-VS5 — provenance of the running speed on the latest in-window
   * spectral sample. A capture-default / untagged speed is surfaced wherever
   * the gate is explained; it never clears the order gate.
   */
  const spectralLatestRpmReading = useMemo(
    () => readVibrationRpmProvenance(spectralScopeRows[0] ?? null),
    [spectralScopeRows]
  );

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
      const point = extractEnvelopingTrendPoint(
        analysis,
        vibrationStoppedSampleLabel(analysis)
      );
      if (!point) continue;
      rows.push(point);
    }
    return rows;
  }, [vibAnalyses]);

  // Charts and the Enveloping History table share the same windowed analyses as
  // broadband and spectral — no second date predicate, no drift (Slice-H lesson).
  // SLICE-VS5: same trendSsot contract as Spectral — window scope, running-state,
  // deterministic newest-first sort, then deterministic same-date labels.
  const envelopingTrendWindow = useMemo(() => {
    const rows: EnvelopingTrendPoint[] = [];
    for (const analysis of [...windowedVibAnalyses].reverse()) {
      const point = extractEnvelopingTrendPoint(
        analysis,
        vibrationStoppedSampleLabel(analysis)
      );
      if (!point) continue;
      rows.push(point);
    }
    return applySameDateSequenceLabels(rows);
  }, [windowedVibAnalyses]);

  const envelopingHasStoppedSamples = useMemo(
    () => envelopingTrendWindow.some((point) => point.stoppedLabel != null),
    [envelopingTrendWindow]
  );

  const envelopingTrendIsSparse = useMemo(
    () => isSparseTrendSeries(envelopingTrendWindow),
    [envelopingTrendWindow]
  );

  const envelopingWindowEmpty =
    envelopingTrendSeries.length > 0 && envelopingTrendWindow.length === 0;

  const envelopingWindowEmptyNote = envelopingWindowEmpty
    ? runningOnly
      ? "No running-state enveloping samples in this range \u2014 turn off Running State Only to include stopped samples."
      : "No enveloping readings in this time range."
    : null;

  const envelopingGeChartData = useMemo(
    () =>
      envelopingTrendWindow
        .filter((p) => p.peakGe != null && p.peakGe > 0)
        .map((p) => ({
          date: p.date,
          dateLabel: p.dateLabel,
          peakGe: p.peakGe as number,
          analysisId: p.analysisId,
          fault: p.primaryFault,
          timestamp: p.timestamp,
          stoppedLabel: p.stoppedLabel
        })),
    [envelopingTrendWindow]
  );

  const envelopingKurtosisChartData = useMemo(
    () =>
      envelopingTrendWindow
        .filter((p) => p.kurtosis != null && p.kurtosis > 0)
        .map((p) => ({
          date: p.date,
          dateLabel: p.dateLabel,
          kurtosis: p.kurtosis as number,
          analysisId: p.analysisId,
          fault: p.primaryFault,
          stoppedLabel: p.stoppedLabel
        })),
    [envelopingTrendWindow]
  );

  /**
   * SLICE-VS5 — source-aware running speed for bearing kinematics.
   *
   * A sample speed is used only when it is measured/configured. Otherwise the
   * Equipment-DB nameplate (configured) may stand in; a capture default or an
   * untagged speed never does. If neither exists the defect overlay is dormant.
   */
  const bearingRpmReading: VibrationRpmReading = useMemo(() => {
    const stored = readVibrationRpmProvenance(latestVibrationRow);
    if (stored.gatingQuality) return stored;
    if (machineSpecs.rpm != null && machineSpecs.rpm > 0) {
      return {
        rpm: machineSpecs.rpm,
        source: "configured",
        rawSource: "equipment-db",
        gatingQuality: true,
        warning: null
      };
    }
    return stored;
  }, [latestVibrationRow, machineSpecs.rpm]);

  const bearingGeometryConfigured =
    machineSpecs.bearing.trim().length > 0 &&
    machineSpecs.bearing !== "Not set";

  const calculatedBearingFaults = useMemo(() => {
    if (!bearingGeometryConfigured) return null;
    if (!bearingRpmReading.gatingQuality || bearingRpmReading.rpm == null) {
      return null;
    }
    const kin = (selectedComp?.kinematics || {}) as Record<string, unknown>;
    return resolveBearingFaultFrequencies({
      bearingLabel: machineSpecs.bearing,
      rpm: bearingRpmReading.rpm,
      kinematics: kin
    });
  }, [
    selectedComp?.kinematics,
    bearingGeometryConfigured,
    bearingRpmReading,
    machineSpecs.bearing
  ]);

  /** Latest IN-WINDOW enveloping point — never an out-of-window/raw pick. */
  const latestEnvelopingPoint =
    envelopingTrendWindow.length > 0
      ? envelopingTrendWindow[envelopingTrendWindow.length - 1]
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

  /** Full history for the latest-metrics summary cards (not date-windowed). */
  const waveformTrendSeriesAll = useMemo(() => {
    const rows = [];
    for (const analysis of [...vibAnalyses].reverse()) {
      const point = extractWaveformTrendPoint(analysis);
      if (point) rows.push(point);
    }
    return rows;
  }, [vibAnalyses]);

  // Waveform charts share the single windowed analyses array (Slice N intent):
  // no second date predicate, so 7D/30D/90D/1Y matches every other tab.
  // SLICE-VS6: same trendSsot contract as Spectral/Enveloping — window scope,
  // running-state labels, deterministic newest-first sort, then deterministic
  // same-date labels. The raw latest record stays snapshot-only (see above).
  const waveformTrendSeries = useMemo(() => {
    const rows: WaveformTrendPoint[] = [];
    for (const analysis of [...windowedVibAnalyses].reverse()) {
      const point = extractWaveformTrendPoint(
        analysis,
        vibrationStoppedSampleLabel(analysis)
      );
      if (point) rows.push(point);
    }
    return applySameDateSequenceLabels(rows);
  }, [windowedVibAnalyses]);

  const latestWaveformAnalysisMetrics = useMemo(() => {
    const fromRecord = latestWaveformRecord?.waveformAnalysis;
    const fromTrend =
      waveformTrendSeriesAll.length > 0
        ? waveformTrendSeriesAll[waveformTrendSeriesAll.length - 1]
        : null;
    // A 0 peak/crest is the normalizer's "not measured" placeholder, not a
    // measurement. Keep it null so the snapshot cards render an em dash.
    const positiveOrNull = (value: number | null | undefined) =>
      value != null && Number.isFinite(value) && value > 0 ? value : null;
    const peakToPeak =
      positiveOrNull(fromRecord?.peakToPeak) ?? fromTrend?.peakToPeak ?? null;
    const crestFactor =
      positiveOrNull(fromRecord?.crestFactor) ??
      positiveOrNull(latestWaveformRecord?.waveformMetrics?.crestFactor) ??
      fromTrend?.crestFactor ??
      null;
    const impactCount =
      fromRecord?.impactCount ?? fromTrend?.impactCount ?? null;
    const symmetry = fromRecord?.symmetry ?? fromTrend?.symmetry ?? null;
    const modulation =
      fromRecord?.modulation ?? fromTrend?.modulation ?? null;
    const timePerRevolutionMs =
      fromRecord?.timePerRevolutionMs ??
      (latestWaveformRecord?.rpm && latestWaveformRecord.rpm > 0
        ? 60000 / latestWaveformRecord.rpm
        : machineSpecs.rpm && machineSpecs.rpm > 0
          ? 60000 / machineSpecs.rpm
          : null);

    if (
      peakToPeak == null &&
      crestFactor == null &&
      impactCount == null &&
      !symmetry &&
      !(latestWaveformRecord?.waveform?.length)
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
    latestWaveformRecord,
    waveformTrendSeriesAll,
    machineSpecs.rpm
  ]);

  /**
   * SLICE-VS6 — trend-window honesty, mirroring Spectral/Enveloping:
   * empty-window note, stopped-sample note (OFF only), and latest-in-window.
   * The snapshot cards above deliberately stay on the raw latest record.
   */
  const waveformWindowEmpty =
    waveformTrendSeriesAll.length > 0 && waveformTrendSeries.length === 0;
  const waveformWindowEmptyNote = waveformWindowEmpty
    ? runningOnly
      ? "No running-state waveform samples in this range \u2014 turn off Running State Only to include stopped samples."
      : "No waveform readings in this time range."
    : null;
  const waveformHasStoppedSamples = useMemo(
    () => waveformTrendSeries.some((point) => point.stoppedLabel != null),
    [waveformTrendSeries]
  );
  const latestWaveformTrendPoint =
    waveformTrendSeries.length > 0
      ? waveformTrendSeries[waveformTrendSeries.length - 1]
      : null;

  const waveformRpm =
    latestWaveformRecord?.rpm ||
    latestWaveformRecord?.context?.motorSpeedRPM ||
    machineSpecs.rpm ||
    null;

  const vibExtractedWaveformChart = useMemo(() => {
    if (!latestWaveformRecord?.waveform?.length) return [];
    return latestWaveformRecord.waveform.map((p) => ({
      time: p.time,
      amplitude: p.amplitude
    }));
  }, [latestWaveformRecord]);

  // One waveform model feeds the inline cards and every enlarged twin.
  const waveformChartModel = useMemo(
    () =>
      buildWaveformChartModel({
        rpm: waveformRpm,
        trendPoints: waveformTrendSeries,
        waveformSamples: vibExtractedWaveformChart
      }),
    [waveformRpm, waveformTrendSeries, vibExtractedWaveformChart]
  );

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
      if (analysisAssetQueryKey && (hasWinding || hasGw || hasRic)) {
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
            insulationClass: extracted.insulationClass,
            ratedVoltageV: mcaRatedVoltageV ?? undefined
          });
          const ricSavedResult = hasRic
            ? calculateRotorInfluence(extracted.ricData ?? [])
            : null;
          const primaryFault = hasWinding
            ? windingResult.fault
            : hasGw
              ? gwResult.fault
              : ricSavedResult?.fault ?? "Rotor Influence Check";
          const healthScore = hasWinding
            ? windingResult.healthScore
            : hasGw
              ? gwResult.irIeeePass === true
                ? 85
                : gwResult.irIeeePass === false
                  ? 45
                  : 70
              : ricSavedResult?.severity === "CRITICAL"
                ? 40
                : ricSavedResult?.severity === "WARNING"
                  ? 65
                  : 85;
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
                        : hasGw
                          ? gwResult.severity
                          : ricSavedResult?.severity ?? "NORMAL",
                      confidence: 85,
                      description: hasWinding
                        ? windingResult.recommendation
                        : hasGw
                          ? gwResult.recommendation
                          : ricSavedResult?.recommendation ?? ""
                    }
                  ]
                : [],
            peaks: payload.peaks,
            recommendations: [
              hasWinding
                ? windingResult.recommendation
                : hasGw
                  ? gwResult.recommendation
                  : ricSavedResult?.recommendation ?? ""
            ],
            financial_impact: {},
            severity: (() => {
              const sev = hasWinding
                ? windingResult.severity
                : hasGw
                  ? gwResult.severity
                  : ricSavedResult?.severity ?? "NORMAL";
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

  const updateMcaWindingMaterial = (value: string) => {
    const material: ConductorMaterial =
      value === "aluminum"
        ? "aluminum"
        : value === "copper"
          ? "copper"
          : "unknown";
    mergeMcaRecord({
      phase_balance: {
        ...mcaRecord.phase_balance,
        conductor_material: material
      },
      meta: { source: "manual" }
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
      // "Not stored" option is a no-op — the SSOT merge never wipes a stored
      // class, and an absent class must never be back-filled with "F" here
      // (the calculator's disclosed assumption carries the fallback, slice VS9).
      if (value === "") return;
      const c = value.toUpperCase();
      if (c !== "A" && c !== "B" && c !== "F" && c !== "H") return;
      mergeMcaRecord({
        groundwall: { insulation_class: c as InsulationClass },
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
  /**
   * IR trends share slice N's exact time window. `windowTrendByTimeRange`
   * delegates to `filterTrendByTimeRange`, so 7D/30D/90D/1Y can never drift
   * between the vibration and thermography tabs.
   */
  const windowedThermoAnalyses = useMemo(
    () => windowTrendByTimeRange(thermoAnalyses, timeRange),
    [thermoAnalyses, timeRange]
  );
  const thermoChartSeries = useMemo(
    () => buildThermoChartSeries(windowedThermoAnalyses),
    [windowedThermoAnalyses]
  );
  /** Unit the rows were actually saved in; absent preference must defer to it. */
  const thermoStoredUnit = useMemo(
    () => resolveThermoTempUnit(thermoChartSeries),
    [thermoChartSeries]
  );
  const thermoDisplayUnit = resolveTemperatureDisplayUnit(
    displayUnits.temperature,
    thermoStoredUnit
  );
  /**
   * Display-only projection. SLICE-VS7 unit isolation: only MEASURED absolute
   * temperatures convert affinely and ΔT / rates convert by scale. Reference
   * temperatures (`ambientReferenceTemp`, `reflectedApparentTemp`) and the
   * dimensionless `emissivity` are intentionally left in their stored units —
   * they never enter the °C/°F conversion path. Concentration fields (ppm,
   * e.g. H2) likewise have no route through this function.
   */
  const thermoDisplaySeries = useMemo<
    (ThermoChartPoint & { skinAmbientDelta: number | null })[]
  >(() => {
    const absolute = (value: number | null, from: "°C" | "°F") =>
      value == null
        ? null
        : from === thermoDisplayUnit
          ? value
          : Math.round(
              convertAbsoluteTemperature(value, from, thermoDisplayUnit) * 10
            ) / 10;
    const difference = (value: number | null, from: "°C" | "°F") =>
      value == null
        ? null
        : from === thermoDisplayUnit
          ? value
          : Math.round(
              convertTemperatureDelta(value, from, thermoDisplayUnit) * 10
            ) / 10;
    return thermoChartSeries.map((point) => {
      const from = point.tempUnit ?? thermoStoredUnit;
      // Reference temp stays raw, so subtract in the stored unit first and
      // convert only the resulting difference by scale.
      const rawSkinAmbientDelta = skinAmbientDelta({
        refractorySkinTemp: point.refractorySkinTemp,
        skinTemp: point.skinTemp,
        ambientReferenceTemp: point.ambientReferenceTemp
      });
      return {
        ...point,
        hotspot: absolute(point.hotspot, from),
        reference: absolute(point.reference, from),
        deltaT: difference(point.deltaT, from),
        phaseA: absolute(point.phaseA, from),
        phaseB: absolute(point.phaseB, from),
        phaseC: absolute(point.phaseC, from),
        i2rDelta: difference(point.i2rDelta, from),
        scaleMin: absolute(point.scaleMin, from),
        scaleMax: absolute(point.scaleMax, from),
        isothermThreshold: absolute(point.isothermThreshold, from),
        boxAverage: absolute(point.boxAverage, from),
        deBearing: absolute(point.deBearing, from),
        odeBearing: absolute(point.odeBearing, from),
        skinTemp: absolute(point.skinTemp, from),
        refractorySkinTemp: absolute(point.refractorySkinTemp, from),
        maxAllowable: absolute(point.maxAllowable, from),
        thermalGradient: difference(point.thermalGradient, from),
        thermalDissipationRate: difference(point.thermalDissipationRate, from),
        // Reference values and ε deliberately not projected above.
        skinAmbientDelta:
          rawSkinAmbientDelta == null
            ? null
            : difference(rawSkinAmbientDelta, from)
      };
    });
  }, [thermoChartSeries, thermoStoredUnit, thermoDisplayUnit]);
  const latestThermoChart: ThermoChartPoint | null =
    thermoDisplaySeries.length > 0
      ? thermoDisplaySeries[thermoDisplaySeries.length - 1]
      : null;
  /** Raw (unprojected) latest scan for stored-unit reference values. */
  const latestThermoRaw: ThermoChartPoint | null =
    thermoChartSeries.length > 0
      ? thermoChartSeries[thermoChartSeries.length - 1]
      : null;
  /** Stored unit of the latest run — the basis for every ΔT/rate conversion. */
  const thermoReferenceUnit = latestThermoRaw?.tempUnit ?? thermoStoredUnit;
  const thermoEmissivityPill = thermoEmissivityAmbientPill(
    latestThermoRaw,
    thermoStoredUnit
  );
  /**
   * SLICE-IR1 — ε default-vs-extracted badge, reusing the THERMO-RAD cyan
   * provenance mechanism. Source comes from stored markers only (never
   * inferred from an unentered substrate); silent when no ε is stored.
   */
  const thermoEmissivityBadge =
    latestThermoRaw?.emissivity != null && latestThermoRaw.emissivitySource
      ? latestThermoRaw.emissivitySource === "app-default"
        ? THERMO_EMISSIVITY_APP_DEFAULT_BADGE
        : THERMO_EMISSIVITY_EXTRACTED_NOTE
      : null;
  /** SLICE-IR1 — load gate: disclosure ONLY, and only when load is NOT stored. */
  const thermoLoadStored = thermoLoadTelemetryStored(latestThermoRaw);
  /** Reference temps stay in stored units — surface them as a note, never on the axis. */
  const thermoAmbientStoredNote =
    latestThermoRaw?.ambientReferenceTemp != null
      ? `Ambient reference: ${
          Math.round(latestThermoRaw.ambientReferenceTemp * 10) / 10
        }${latestThermoRaw.tempUnit ?? thermoStoredUnit} (stored units) — not plotted on the converted axis.`
      : null;
  const netaRepairReference = netaRepairWindowForStoredClass(
    latestThermoChart?.severityClass ?? null
  );
  const thermoAxisPlan = useMemo(
    () => planThermoTrendAxis(thermoChartSeries),
    [thermoChartSeries]
  );
  const thermoAxisDataKey = thermoAxisPlan.dataKey;
  const hasHotspotSeries = seriesHasAny(thermoDisplaySeries, [
    "hotspot",
    "reference",
    "deltaT",
    "severityClass"
  ]);
  const hasPhaseSeries = seriesHasAny(thermoDisplaySeries, [
    "phaseA",
    "phaseB",
    "phaseC",
    "loadPercent",
    "i2rDelta"
  ]);
  const phaseHottest = hottestPhaseFromPoint(latestThermoChart);
  const phaseNfpaBadge = nfpaClassBadge(latestThermoChart);
  /**
   * The left/right Radiometric axes are type-specific: left carries measured
   * absolute temperatures only (already display-projected), right carries
   * dimensionless ε. Reference temps stay off the converted axis.
   */
  const hasRadiometricTempSeries = seriesHasAny(thermoDisplaySeries, [
    "scaleMin",
    "scaleMax",
    "isothermThreshold",
    "boxAverage"
  ]);
  const hasEmissivitySeries = seriesHasAny(thermoDisplaySeries, ["emissivity"]);
  /** T_ref presence drives the radiometric gate; absence is stated verbatim. */
  const hasReflectedTempSeries = seriesHasAny(thermoDisplaySeries, [
    "reflectedApparentTemp"
  ]);
  /** Ambient-only rows plot nothing here, so they must still show the overlay. */
  const hasRadiometricSeries =
    hasRadiometricTempSeries || hasEmissivitySeries;
  const radioKpis = radiometricKpis(thermoDisplaySeries);
  const hasMechanicalSeries = seriesHasAny(thermoDisplaySeries, [
    "deBearing",
    "odeBearing",
    "skinTemp",
    "refractorySkinTemp",
    "ambientReferenceTemp",
    "maxAllowable",
    "thermalGradient",
    "thermalDissipationRate"
  ]);
  /** Raw fit: differences/rates are converted by scale for display below. */
  const mechKpis = mechanicalKpis(thermoChartSeries);
  const mechDeltaAmbientDE =
    mechKpis.deDeltaAmbient == null
      ? null
      : Math.round(
          convertTemperatureDelta(
            mechKpis.deDeltaAmbient,
            thermoReferenceUnit,
            thermoDisplayUnit
          ) * 10
        ) / 10;
  const mechDeltaAmbientODE =
    mechKpis.odeDeltaAmbient == null
      ? null
      : Math.round(
          convertTemperatureDelta(
            mechKpis.odeDeltaAmbient,
            thermoReferenceUnit,
            thermoDisplayUnit
          ) * 10
        ) / 10;
  const mechCreepRate =
    mechKpis.creepRatePerDay == null
      ? null
      : Math.round(
          convertTemperatureDelta(
            mechKpis.creepRatePerDay,
            thermoReferenceUnit,
            thermoDisplayUnit
          ) * 100
        ) / 100;
  /** A safety threshold may only render when the run actually stored one. */
  const hasStoredMaxAllowable = latestThermoChart?.maxAllowable != null;
  const hasSkinAmbientDeltaSeries = thermoDisplaySeries.some(
    (point) => point.skinAmbientDelta != null
  );
  const thermoTempAxisLabel = `Temperature (${thermoDisplayUnit})`;
  const ueBearingAnalyses = useMemo(
    () => ueAnalyses.filter(isUeBearingMechanicalRow),
    [ueAnalyses]
  );
  /**
   * Same shared window as every other technology. Delegates to
   * filterTrendByTimeRange via windowTrendByTimeRange so the window predicate
   * can never drift per tab.
   */
  const windowedUeBearingAnalyses = useMemo(
    () => windowTrendByTimeRange(ueBearingAnalyses, timeRange),
    [ueBearingAnalyses, timeRange]
  );
  const ueLeakAnalyses = useMemo(
    () => ueAnalyses.filter(isUeLeakRow),
    [ueAnalyses]
  );
  /** Leak readings share the SAME window predicate as every other tab. */
  const windowedUeLeakAnalyses = useMemo(
    () => windowTrendByTimeRange(ueLeakAnalyses, timeRange),
    [ueLeakAnalyses, timeRange]
  );
  /** True when the asset has any stored leak-mode scan at all (not windowed). */
  const hasUeLeakScans = ueLeakAnalyses.length > 0;
  /**
   * Measured dBµV rows only. CFM/orifice/$/CO₂ are parked (SLICE-VS8) and are
   * deliberately absent from this table and its KPIs.
   */
  const ueLeakReadingRows = useMemo(() => {
    const rows = [...windowedUeLeakAnalyses]
      .map(ueLeakReadingFromRow)
      .sort((a, b) => b.dateMs - a.dateMs);
    // Deterministic same-date labels: two leak runs captured on the same day
    // never render one ambiguous date cell. Shared SSOT helper (trendSeries).
    return applySameDateSequenceLabels(
      rows.map((row) => ({ ...row, date: row.dateLabel }))
    );
  }, [windowedUeLeakAnalyses]);
  /** KPI values are computed from the exact rows rendered below (lockstep). */
  const ueLeakKpis = useMemo(() => {
    const deltaValues = ueLeakReadingRows
      .map((row) => row.deltaDb)
      .filter((value): value is number => value != null && Number.isFinite(value));
    let fallbackCount = 0;
    let fallbackDb: number | null = null;
    for (const row of ueLeakReadingRows) {
      if (row.baselineSource === "fallback") {
        fallbackCount += 1;
        if (fallbackDb == null && row.baselineFallbackDb != null) {
          fallbackDb = row.baselineFallbackDb;
        }
      }
    }
    return {
      runCount: ueLeakReadingRows.length,
      avgDelta: powerMeanDbRounded(deltaValues),
      fallbackCount,
      fallbackDb
    };
  }, [ueLeakReadingRows]);
  const ueElectricalAnalyses = useMemo(
    () => ueAnalyses.filter(isUeElectricalPdRow),
    [ueAnalyses]
  );
  /** PD history shares the SAME window predicate as every other tab. */
  const windowedUePdAnalyses = useMemo(
    () => windowTrendByTimeRange(ueElectricalAnalyses, timeRange),
    [ueElectricalAnalyses, timeRange]
  );
  /** True when the asset has any stored electrical/PD scan at all (not windowed). */
  const hasUePdScans = ueElectricalAnalyses.length > 0;
  /** Table rows and KPIs are derived from the exact same windowed rows. */
  const uePdInventoryRows = useMemo(() => {
    return [...windowedUePdAnalyses.map(uePdInventoryFromRow)].sort(
      (a, b) => b.dateMs - a.dateMs
    );
  }, [windowedUePdAnalyses]);
  /** N/A when the window holds no PD scans (or none exist at all). */
  const uePdKpisAbsent = windowedUePdAnalyses.length === 0;
  const uePdKpis = useMemo(() => {
    if (uePdInventoryRows.length === 0) {
      return {
        peakElectricalDb: null as number | null,
        avgBaselineDelta: null as number | null,
        threatSeverity: "normal" as UePdSeverity,
        threatLabel: "N/A",
        baselineFallbackCount: 0,
        baselineFallbackDb: null as number | null
      };
    }
    let maxPeak = 0;
    const deltaValues: number[] = [];
    let topSeverity: UePdSeverity = "normal";
    let topLabel = "Normal";
    let baselineFallbackCount = 0;
    let baselineFallbackDb: number | null = null;
    for (const row of uePdInventoryRows) {
      maxPeak = Math.max(maxPeak, safeFinite(row.peakDb, 0));
      if (Number.isFinite(row.baselineDelta)) {
        deltaValues.push(row.baselineDelta);
      }
      if (row.baselineSource === "fallback") {
        baselineFallbackCount += 1;
        if (baselineFallbackDb == null && row.baselineFallbackDb != null) {
          baselineFallbackDb = row.baselineFallbackDb;
        }
      }
      if (pdSeverityRank(row.severity) >= pdSeverityRank(topSeverity)) {
        topSeverity = row.severity;
        topLabel = row.severityLabel;
      }
    }
    return {
      peakElectricalDb: Math.round(maxPeak * 10) / 10,
      avgBaselineDelta: powerMeanDbRounded(deltaValues),
      threatSeverity: topSeverity,
      threatLabel: topLabel,
      baselineFallbackCount,
      baselineFallbackDb
    };
  }, [uePdInventoryRows]);
  const ueSteamAnalyses = useMemo(
    () => ueAnalyses.filter(isUeSteamTrapRow),
    [ueAnalyses]
  );
  /** Steam inventory shares the SAME window predicate as every other tab. */
  const windowedUeSteamAnalyses = useMemo(
    () => windowTrendByTimeRange(ueSteamAnalyses, timeRange),
    [ueSteamAnalyses, timeRange]
  );
  /** True when the asset has any stored steam-trap scan at all (not windowed). */
  const hasUeSteamScans = ueSteamAnalyses.length > 0;
  /** Table rows and KPIs are derived from the exact same windowed rows. */
  const ueSteamInventoryRows = useMemo(() => {
    return [...windowedUeSteamAnalyses]
      .map((r) => ueSteamInventoryFromRow(r))
      .sort((a, b) => b.dateMs - a.dateMs);
  }, [windowedUeSteamAnalyses]);
  /** N/A when the window holds no trap scans (or none exist at all). */
  const ueSteamKpisAbsent = windowedUeSteamAnalyses.length === 0;
  /** ΔT is a difference → scale-only projection when the preference flips. */
  const steamDeltaUnit = resolveTemperatureDisplayUnit(
    displayUnits.temperature,
    "°F"
  );
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
  /** Rows whose ΔT came from the trap scan itself (never from IR). */
  const ueSteamThermalLinkedCount = useMemo(
    () => ueSteamInventoryRows.filter((row) => row.thermalAvailable).length,
    [ueSteamInventoryRows]
  );
  const ueBearingChartSeries = useMemo(() => {
    return [...windowedUeBearingAnalyses]
      .filter((r) => uePeaksFromRow(r).probeType !== "airborne")
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
  }, [windowedUeBearingAnalyses]);
  /**
   * Ladder/KPI source: contact or unclassified legacy rows only. Airborne
   * readings are a different physical quantity and never drive the ladder.
   */
  const ueBearingLadderAnalyses = useMemo(
    () => ueBearingAnalyses.filter((r) => uePeaksFromRow(r).probeType !== "airborne"),
    [ueBearingAnalyses]
  );
  const latestUeBearing =
    ueBearingLadderAnalyses.length > 0 ? ueBearingLadderAnalyses[0] : null;
  const latestUeBearingPeaks = latestUeBearing
    ? uePeaksFromRow(latestUeBearing)
    : null;
  const hasUeBearingSeries = ueBearingChartSeries.some(
    (p) =>
      (typeof p.rms === "number" && Number.isFinite(p.rms)) ||
      (typeof p.peak === "number" && Number.isFinite(p.peak))
  );
  /**
   * J2 snapshot guard: a same-day series whose runs sit inside one inspection
   * window is a snapshot, not a trend. Reused here instead of forking a UE-only
   * sparse-date check.
   */
  const ueBearingAxisPlan = useMemo(
    () => planThermoTrendAxis(ueBearingChartSeries),
    [ueBearingChartSeries]
  );
  const ueBearingChartSparse =
    isSparseTrendSeries(ueBearingChartSeries) || ueBearingAxisPlan.snapshot;
  const ueBearingWindowEmpty =
    ueBearingAnalyses.length > 0 && ueBearingChartSeries.length === 0;
  const mcaTrendSeries = useMemo(
    () => healthTrendFromAnalyses(windowedMcaAnalyses),
    [windowedMcaAnalyses]
  );
  const oilTrendSeries = useMemo(
    () => healthTrendFromAnalyses(oilAnalyses),
    [oilAnalyses]
  );
  /**
   * KPI/matrix value = latest-in-window overall RMS. A stopped latest sample
   * (load telemetry below the running threshold) is blank, never a zero
   * plotted as collapsed velocity.
   */
  const latestOverallVelocity = useMemo((): number | null => {
    if (!latestVibrationRow || latestVibrationSample?.stopped) return null;
    const value = readVibrationOverallVelocity(latestVibrationRow);
    return value != null && value > 0 ? value : null;
  }, [latestVibrationRow, latestVibrationSample]);

  const latestOverallAcceleration = useMemo((): number | null => {
    if (!latestVibrationRow || latestVibrationSample?.stopped) return null;
    const value = readVibrationOverallAcceleration(latestVibrationRow);
    return value != null && value > 0 ? value : null;
  }, [latestVibrationRow, latestVibrationSample]);

  const latestOverallEmptyNote = !latestVibrationRow
    ? VIBRATION_NOT_MEASURED
    : latestVibrationSample?.stopped
      ? "Stopped sample \u2014 no running-state overall velocity."
      : VIBRATION_NOT_MEASURED;

  /** Windowed series still carry stopped points when the toggle is OFF. */
  const healthSeriesHasStoppedPoints = useMemo(
    () => healthTrendSeries.some((point) => point.stopped),
    [healthTrendSeries]
  );
  const velocitySeriesHasStoppedPoints = useMemo(
    () => velocityTrendSeries.some((point) => point.stopped),
    [velocityTrendSeries]
  );

  /**
   * Honest empty-window copy. An empty chart must say whether the time range
   * had no samples at all or whether the running-state filter removed them.
   */
  const vibrationWindowEmptyNote =
    vibAnalyses.length > 0 && windowedVibAnalyses.length === 0
      ? runningOnly
        ? "No running-state samples in this range \u2014 turn off Running State Only to include stopped samples."
        : "No vibration samples in this time range."
      : null;

  /** Reconciled KPI verdict — never a silent pick between disagreeing agents. */
  const reconciledVerdict = useMemo(
    () => reconcileVibrationVerdict(latestVibrationRow, machineSpecs.isoClass),
    [latestVibrationRow, machineSpecs.isoClass]
  );
  // Plant values (when set) win; otherwise ISO B/C and C/D zone edges apply.
  const velocityThresholds = useMemo(
    () =>
      resolveVelocityThresholds({
        machineClass: machineSpecs.isoClass,
        warningThresholdMmS:
          selectedAsset?.warningThreshold ??
          selectedComp?.warningThreshold ??
          null,
        criticalThresholdMmS:
          selectedAsset?.criticalThreshold ??
          selectedComp?.criticalThreshold ??
          null,
        unit: displayUnits.velocity
      }),
    [
      machineSpecs.isoClass,
      selectedAsset?.warningThreshold,
      selectedComp?.warningThreshold,
      selectedAsset?.criticalThreshold,
      selectedComp?.criticalThreshold,
      displayUnits.velocity
    ]
  );

  /**
   * ISO default-threshold basis. When kinematic specs are unconfigured the
   * chart falls back to the standard ISO 20816 B/C and C/D zone edges; that is
   * a published zone boundary, never an OEM/plant limit.
   */
  const isoDefaultThresholdBasis =
    velocityThresholds.source === "iso" && kinematicSpecsUnconfigured
      ? "ISO 20816 default zone bands apply because kinematics (RPM / ISO class / bearing) are unconfigured \u2014 these are standard zone boundaries, not an OEM or plant limit."
      : null;

  // Display-only projection: the saved series stays canonical.
  const velocityTrendDisplaySeries = useMemo(
    () =>
      velocityTrendSeries.map((point) => ({
        ...point,
        peak: velocityValueForDisplay(point.peak, displayUnits.velocity)
      })),
    [velocityTrendSeries, displayUnits.velocity]
  );

  const triaxialAxes = useMemo(() => {
    // Latest-in-window per-axis values. Stopped latest sample = blank axes;
    // missing axis-tagged peaks stay null (never the overall peak under an
    // axis label).
    const axes =
      latestVibrationSample?.stopped
        ? { horizontal: null, vertical: null, axial: null }
        : readVibrationPerAxis(latestVibrationRow);
    const peakUnit = `${displayUnits.velocity} peak`;
    const display = (valueMmS: number | null) =>
      valueMmS == null
        ? "—"
        : formatVelocityDisplay(valueMmS, displayUnits.velocity);
    return [
      {
        axis: "Horizontal (H)",
        value: axes.horizontal,
        display: display(axes.horizontal),
        unit: axes.horizontal == null ? VIBRATION_NOT_MEASURED : peakUnit,
        tone: "text-yellow-500"
      },
      {
        axis: "Vertical (V)",
        value: axes.vertical,
        display: display(axes.vertical),
        unit: axes.vertical == null ? VIBRATION_NOT_MEASURED : peakUnit,
        tone: "text-green-400"
      },
      {
        axis: "Axial (A)",
        value: axes.axial,
        display: display(axes.axial),
        unit: axes.axial == null ? VIBRATION_NOT_MEASURED : peakUnit,
        tone: "text-orange-400"
      }
    ];
  }, [latestVibrationRow, latestVibrationSample, displayUnits.velocity]);

  const hasAnyAnalysisData = dbAnalyses.length > 0;
  const hasThermographyData = thermoAnalyses.length > 0;
  const hasUltrasoundData = ueAnalyses.length > 0;
  const hasMcaData = mcaAnalyses.length > 0;
  const hasOilData = oilAnalyses.length > 0;

  const selectClass =
    "bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 outline-none w-full";

  const rulData = useMemo(() => buildRulCone(speedFactor), [speedFactor]);
  const rulDisplayData = useMemo(
    () =>
      rulData.map((point) => ({
        ...point,
        best: velocityValueForDisplay(point.best, displayUnits.velocity),
        mostLikely: velocityValueForDisplay(
          point.mostLikely,
          displayUnits.velocity
        ),
        worst: velocityValueForDisplay(point.worst, displayUnits.velocity),
        alarm: velocityValueForDisplay(point.alarm, displayUnits.velocity)
      })),
    [rulData, displayUnits.velocity]
  );
  const projectedRulDays = Math.max(3, Math.round(14 / speedFactor));

  const closeExpandedChart = useCallback(() => setExpandedChart(null), []);

  return (
    <div className="w-full min-w-0 bg-slate-950 text-slate-100">
      {/* ===== SECTION 1: TOP FILTER (Tech → Equipment → Time Range) ===== */}
      <div className={`${CARD} mb-4`}>
        {/* Technology switcher — match Run Diagnostics card layout */}
        <div
          data-testid="trend-tech-cards"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-6 pb-4 border-b border-white/10"
        >
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

        {/* Asset selection — Equipment DB (same keys Diagnose saves with) */}
        <div data-testid="trend-equipment-selector" className="mb-4">
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
                  {routeOptions.map((r) => (
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

        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mr-1">
              Time Range
            </span>
            {(["7D", "30D", "90D", "1Y", "Custom"] as TimeRange[]).map((range) => {
              const isCustom = range === "Custom";
              return (
                <button
                  key={range}
                  type="button"
                  disabled={isCustom}
                  aria-disabled={isCustom}
                  title={
                    isCustom
                      ? "Custom range picker is not available yet — choose 7D, 30D, 90D, or 1Y"
                      : undefined
                  }
                  onClick={() => {
                    if (!isCustom) setTimeRange(range);
                  }}
                  className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                    isCustom
                      ? "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed opacity-60"
                      : timeRange === range
                        ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 font-bold cursor-pointer"
                        : "bg-slate-800 border-slate-700 text-slate-400 cursor-pointer"
                  }`}
                >
                  {range}
                </button>
              );
            })}

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

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Units
            </span>
            <select
              value={displayUnits.velocity}
              onChange={(e) =>
                void updateDisplayUnits({
                  velocity: e.target.value as DisplayUnits["velocity"]
                })
              }
              aria-label="Velocity display unit"
              title="Velocity display unit"
              className="min-h-[34px] px-2 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-200 focus:border-yellow-500 outline-none cursor-pointer"
            >
              {VELOCITY_DISPLAY_OPTIONS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
            <select
              value={displayUnits.acceleration}
              onChange={(e) =>
                void updateDisplayUnits({
                  acceleration: e.target.value as DisplayUnits["acceleration"]
                })
              }
              aria-label="Acceleration display unit"
              title="Acceleration display unit"
              className="min-h-[34px] px-2 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-200 focus:border-yellow-500 outline-none cursor-pointer"
            >
              {ACCELERATION_DISPLAY_OPTIONS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
            <select
              value={displayUnits.frequency}
              onChange={(e) =>
                void updateDisplayUnits({
                  frequency: e.target.value as DisplayUnits["frequency"]
                })
              }
              aria-label="Frequency display unit"
              title="Frequency display unit"
              className="min-h-[34px] px-2 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-200 focus:border-yellow-500 outline-none cursor-pointer"
            >
              {FREQUENCY_DISPLAY_OPTIONS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
            {trendTech === "thermography" && (
              <>
                <select
                  value={thermoDisplayUnit}
                  onChange={(e) =>
                    void updateDisplayUnits({
                      temperature: e.target.value as DisplayUnits["temperature"]
                    })
                  }
                  aria-label="Temperature display unit"
                  title="Temperature display unit"
                  className="min-h-[34px] px-2 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-200 focus:border-yellow-500 outline-none cursor-pointer"
                >
                  {TEMPERATURE_DISPLAY_OPTIONS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <p
                  data-testid="thermo-unit-isolation-note"
                  className="text-[10px] text-slate-500 max-w-xs leading-snug"
                >
                  Applies to measured absolute temperatures only. Reference
                  temps (ambient / T_ref) and ε stay in stored units;
                  concentration fields (ppm) never convert.
                </p>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                const trendData = { exported: new Date().toISOString() };
                const blob = new Blob([JSON.stringify(trendData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `trend-package-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 text-white hover:bg-slate-800 text-xs font-semibold cursor-pointer transition-colors shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
        </div>
        {(displayUnits.frequency === "orders" && !machineSpecs.rpm) ||
        displayUnitsError ||
        unitsSaveError ? (
          <p className="mt-2 text-[11px] text-amber-300">
            {displayUnits.frequency === "orders" && !machineSpecs.rpm
              ? ORDERS_FALLBACK_HINT
              : displayUnitsError || unitsSaveError}
          </p>
        ) : null}
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

          {kinematicSpecsUnconfigured ? (
            <KinematicSpecsEmptyState className="mb-6" />
          ) : null}

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
      {vibrationWindowEmptyNote ? (
        <p
          className="text-xs text-amber-300 mb-4"
          data-testid="vibration-window-empty-note"
        >
          {vibrationWindowEmptyNote}
        </p>
      ) : null}
      {latestVibrationRow && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className={CARD}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              Overall Velocity
            </p>
            <p
              className="text-2xl font-bold text-cyan-400 font-mono"
              data-testid="overall-velocity-kpi"
            >
              {latestOverallVelocity != null
                ? formatVelocityDisplay(
                    latestOverallVelocity,
                    displayUnits.velocity
                  )
                : "—"}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">
              {latestOverallVelocity != null
                ? "Latest in-window overall RMS"
                : latestOverallEmptyNote}
            </p>
          </div>
          <div className={CARD}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              Overall Acceleration
            </p>
            <p className="text-2xl font-bold text-cyan-400 font-mono">
              {latestOverallAcceleration != null
                ? formatAccelerationDisplay(
                    latestOverallAcceleration,
                    displayUnits.acceleration
                  )
                : "—"}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">
              {latestOverallAcceleration != null
                ? "Latest in-window acceleration"
                : latestOverallEmptyNote}
            </p>
          </div>
          <div className={CARD}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
              Health Score
              <TelemetryProvenanceBadge provenance={telemetryProvenanceOf(latestDb ?? null)} />
            </p>
            <p
              className={`text-2xl font-bold font-mono ${healthScoreTone(
                reconciledVerdict.healthScore
              )}`}
              data-testid="health-score-kpi"
            >
              {reconciledVerdict.healthScore ?? "—"}
            </p>
            <p className="text-[10px] text-slate-500 mt-1 leading-snug">
              {reconciledVerdict.healthProvenance ?? VIBRATION_NOT_MEASURED}
            </p>
          </div>
          <div className={CARD}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              Primary Fault
            </p>
            <p
              className="text-sm font-semibold leading-snug text-amber-300"
              data-testid="primary-fault-kpi"
            >
              {reconciledVerdict.primaryFault}
            </p>
            {reconciledVerdict.status === "indeterminate" ? (
              <p className="text-[10px] text-amber-200/80 mt-1">
                Agents disagree — narrative panel retains both readings.
              </p>
            ) : null}
          </div>
        </div>
      )}
      {/* ===== SECTION 2: KPI RIBBON & PREDICTIVE BANNER ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <VibrationKpiSummary
          valueMmS={latestOverallVelocity}
          velocityUnit={displayUnits.velocity}
          machineClass={machineSpecs.isoClass}
          healthScore={reconciledVerdict.healthScore}
          healthProvenance={reconciledVerdict.healthProvenance}
          verdictState={reconciledVerdict.status}
          valueEmptyReason={latestOverallEmptyNote}
          primaryFault={reconciledVerdict.primaryFault}
          analysesCount={windowedVibAnalyses.length}
          source={
            latestVibrationRow
              ? "PostgreSQL · windowed record"
              : "PostgreSQL"
          }
          provenanceSlot={
            <TelemetryProvenanceBadge
              provenance={telemetryProvenanceOf(latestDb ?? null)}
            />
          }
        />
        <VibrationActionCard
          valueMmS={latestOverallVelocity}
          velocityUnit={displayUnits.velocity}
          machineClass={machineSpecs.isoClass}
          summary={
            latestVibrationRow?.summary ||
            reconciledVerdict.primaryFault ||
            null
          }
          recommendation={
            Array.isArray(latestVibrationRow?.recommendations) &&
            latestVibrationRow.recommendations.length > 0
              ? String(latestVibrationRow.recommendations[0])
              : null
          }
          consensusConflict={reconciledVerdict.conflict}
          onCreateWorkOrder={
            selectedAsset
              ? (resolvedAction, zone) => {
                  stageWorkOrderPrefill({
                    assetTag: selectedAsset.tag || selectedAsset.id,
                    assetName: selectedAsset.name,
                    component: selectedComponent,
                    zone,
                    action: resolvedAction,
                    velocityMmS: latestOverallVelocity,
                    velocityUnit: displayUnits.velocity
                  });
                  navigateToTab("calendar");
                }
              : undefined
          }
        />
      </div>

      {/* ===== SECTION 3: PRIMARY TREND CHARTS (2x2) ===== */}
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-yellow-500" />
                <h3 className="text-base font-bold text-white">Health Score Trend</h3>
              </div>
              <ChartExpandButton
                onClick={() => setExpandedChart("health")}
                label="Expand Health Score Trend"
              />
            </div>
            <p className="text-xs text-slate-400">
              From Run Diagnostics (PostgreSQL)
              {latestDb?.primary_fault ? ` · latest: ${latestDb.primary_fault}` : ""}
            </p>
            {dbTrendError && (
              <p className="text-xs text-amber-400">{dbTrendError}</p>
            )}
            {!runningOnly && healthSeriesHasStoppedPoints ? (
              <p
                className="text-xs text-amber-300"
                data-testid="health-stopped-series-note"
              >
                Includes stopped samples (load \u2264 80%) \u2014 labeled
                &ldquo;stopped sample&rdquo; in the tooltip.
              </p>
            ) : null}
          </div>
          <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2">
            <BroadbandTrendChartBody
              variant="health"
              data={healthTrendSeries}
              isEmpty={healthTrendSeries.length === 0}
              isSparse={healthTrendIsSparse}
              velocityUnit={displayUnits.velocity}
              thresholds={velocityThresholds}
              showThresholds={showThresholds}
            />
          </div>
        </div>

        {/* Chart 2 — Peak velocity from analysis peaks */}
        <div className={CARD}>
          <div className="flex flex-col gap-1 mb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-400" />
                <h3 className="text-base font-bold text-white">Peak Velocity</h3>
              </div>
              <ChartExpandButton
                onClick={() => setExpandedChart("velocity")}
                label="Expand Peak Velocity"
              />
            </div>
            <p className="text-xs text-slate-400">
              From analysis peaks · {velocityThresholds.provenance}
            </p>
            {isoDefaultThresholdBasis ? (
              <p
                className="text-xs text-amber-300"
                data-testid="iso-default-threshold-basis"
              >
                {isoDefaultThresholdBasis}
              </p>
            ) : null}
            {!runningOnly && velocitySeriesHasStoppedPoints ? (
              <p
                className="text-xs text-amber-300"
                data-testid="velocity-stopped-series-note"
              >
                Includes stopped samples (load \u2264 80%) \u2014 labeled
                &ldquo;stopped sample&rdquo; in the tooltip.
              </p>
            ) : null}
          </div>
          <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2">
            <BroadbandTrendChartBody
              variant="velocity"
              data={velocityTrendDisplaySeries}
              isEmpty={velocityTrendSeries.length === 0}
              isSparse={velocityTrendIsSparse}
              velocityUnit={displayUnits.velocity}
              thresholds={velocityThresholds}
              showThresholds={showThresholds}
            />
          </div>
        </div>
      </div>

      {expandedChart === "health" && (
        <TrendChartExpandModal
          title="Health Score Trend"
          subtitle={`From Run Diagnostics (PostgreSQL)${
            latestDb?.primary_fault ? ` · latest: ${latestDb.primary_fault}` : ""
          }`}
          onClose={closeExpandedChart}
        >
          <BroadbandTrendChartBody
            variant="health"
            data={healthTrendSeries}
            isEmpty={healthTrendSeries.length === 0}
            isSparse={healthTrendIsSparse}
            velocityUnit={displayUnits.velocity}
            thresholds={velocityThresholds}
            showThresholds={showThresholds}
          />
        </TrendChartExpandModal>
      )}

      {expandedChart === "velocity" && (
        <TrendChartExpandModal
          title="Peak Velocity"
          subtitle={`From analysis peaks · ${velocityThresholds.provenance}`}
          onClose={closeExpandedChart}
        >
          {isoDefaultThresholdBasis ? (
            <p
              className="text-xs text-amber-300 mb-2"
              data-testid="iso-default-threshold-basis-expanded"
            >
              {isoDefaultThresholdBasis}
            </p>
          ) : null}
          <BroadbandTrendChartBody
            variant="velocity"
            data={velocityTrendDisplaySeries}
            isEmpty={velocityTrendSeries.length === 0}
            isSparse={velocityTrendIsSparse}
            velocityUnit={displayUnits.velocity}
            thresholds={velocityThresholds}
            showThresholds={showThresholds}
          />
        </TrendChartExpandModal>
      )}

      {/* ISO 20816 Severity Matrix */}
      <VibrationIsoMatrix
        valueMmS={latestOverallVelocity}
        velocityUnit={displayUnits.velocity}
        machineClass={machineSpecs.isoClass}
        emptyNote={latestOverallEmptyNote}
      />

      {/* Triaxial Severity Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {triaxialAxes.map((axis) => (
          <div key={axis.axis} className={CARD}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              {axis.axis}
            </p>
            <p className={`text-2xl font-bold ${axis.tone}`}>
              {axis.display}
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
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold text-white inline-flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-cyan-400" />
                    Spectral &amp; Harmonics
                  </h3>
                  <ChartExpandButton
                    onClick={() => setExpandedChart("spectral")}
                    label="Enlarge Spectral & Harmonics chart"
                  />
                </div>
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

              {spectralOrdersUnavailable && (
                <div
                  data-testid="spectral-orders-rpm-gate"
                  className="text-xs text-amber-300 mb-3 space-y-1"
                >
                  <p>{MISSING_RPM_ORDER_HELPER_TEXT}.</p>
                  <p>{SPECTRAL_ORDERS_RPM_GATE_NOTE}.</p>
                  {spectralHasStoredOrders && (
                    <p>{SPECTRAL_ORDERS_STORED_FALLBACK_NOTE}</p>
                  )}
                </div>
              )}

              {spectralLatestRpmReading.warning && (
                <p
                  data-testid="spectral-rpm-provenance-note"
                  className="text-xs text-amber-300 mb-3"
                >
                  {spectralLatestRpmReading.warning}
                </p>
              )}

              {spectralWindowEmptyNote && (
                <p
                  data-testid="spectral-window-empty-note"
                  className="text-xs text-amber-300 mb-3"
                >
                  {spectralWindowEmptyNote}
                </p>
              )}

              {!runningOnly && spectralHasStoppedSamples && (
                <p
                  data-testid="spectral-stopped-series-note"
                  className="text-xs text-amber-300 mb-3"
                >
                  Includes stopped samples (load \u2264 80%) \u2014 labeled
                  &ldquo;stopped sample&rdquo; in the tooltip.
                </p>
              )}

              {spectralLatestPoint && (
                <div
                  data-testid="spectral-latest-summary"
                  className="mb-4 rounded-lg border border-slate-700/70 bg-slate-950/60 p-3"
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Latest in window \u00b7 {spectralLatestPoint.dateLabel}
                    {spectralLatestPoint.stoppedLabel
                      ? ` \u00b7 ${spectralLatestPoint.stoppedLabel}`
                      : ""}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <SpectralOrderReadout
                      order="1X"
                      value={spectralLatestPoint.amp1X}
                      unit={displayUnits.velocity}
                      source={spectralLatestPoint.amp1XSource}
                      testId="spectral-1x-readout"
                    />
                    <SpectralOrderReadout
                      order="2X"
                      value={spectralLatestPoint.amp2X}
                      unit={displayUnits.velocity}
                      source={spectralLatestPoint.amp2XSource}
                      testId="spectral-2x-readout"
                    />
                    <div data-testid="spectral-overall-readout">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Overall
                      </p>
                      <p className="font-mono text-lg font-semibold text-white">
                        {spectralLatestPoint.overall == null
                          ? "\u2014"
                          : Number(spectralLatestPoint.overall).toFixed(3)}{" "}
                        <span className="text-[11px] font-normal text-slate-400">
                          {displayUnits.velocity}
                        </span>
                      </p>
                      <p className="text-[10px] text-slate-500">
                        stored overall broadband
                      </p>
                    </div>
                    {spectralLatestPoint.ratio ? (
                      <div data-testid="spectral-2x1x-ratio">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          2X:1X
                        </p>
                        <p className="font-mono text-lg font-semibold text-white">
                          {Number(spectralLatestPoint.ratio.ratio).toFixed(2)}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {spectralLatestPoint.ratio.basisNote}
                        </p>
                        {spectralLatestPoint.ratio.interpretation ? (
                          <>
                            <span
                              data-testid="spectral-ratio-interpretation"
                              className="mt-1 inline-flex rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300"
                            >
                              {spectralLatestPoint.ratio.interpretation.label}
                            </span>
                            <p className="mt-1 text-[10px] text-slate-500">
                              {spectralLatestPoint.ratio.interpretation.source}
                            </p>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              <div className="h-[420px] bg-slate-950 rounded-xl border border-slate-700/80 p-3">
                <SpectralTrendChartBody
                  data={spectralTrendDisplayData}
                  windowEmpty={spectralWindowEmpty}
                  isSparse={spectralTrendIsSparse}
                  hasOrderSeries={spectralHasOrderSeries}
                  velocityUnit={displayUnits.velocity}
                  timeRange={timeRange}
                />
              </div>
              <p
                data-testid="spectral-unit-physics-note"
                className="mt-2 text-[10px] leading-relaxed text-slate-500"
              >
                {SPECTRAL_UNIT_PHYSICS_NOTE}
              </p>
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
            <ComposedChart data={rulDisplayData} margin={{ top: 20, right: 30, bottom: 20, left: 56 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="day" stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
                label={{
                  value: `Velocity (${displayUnits.velocity})`,
                  angle: -90,
                  position: "insideLeft",
                  fill: "#94a3b8",
                  fontSize: 11
                }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number, name: string) => [
                  `${value} ${displayUnits.velocity}`,
                  name
                ]}
              />
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
                  {envelopingWindowEmptyNote && (
                    <p
                      data-testid="enveloping-window-empty-note"
                      className="text-xs text-amber-300 mb-3"
                    >
                      {envelopingWindowEmptyNote}
                    </p>
                  )}
                  {!runningOnly && envelopingHasStoppedSamples && (
                    <p
                      data-testid="enveloping-stopped-series-note"
                      className="text-xs text-amber-300 mb-3"
                    >
                      Includes stopped samples (load \u2264 80%) \u2014 labeled
                      &ldquo;stopped sample&rdquo; in the tooltip and history.
                    </p>
                  )}
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
                            ? `${machineSpecs.bearing} @ ${calculatedBearingFaults.rpm} RPM · 1X = ${calculatedBearingFaults.shaftHz.toFixed(2)} Hz · geometry ${calculatedBearingFaults.geometry.source} · ${vibrationRpmProvenanceLabel(bearingRpmReading.source)}`
                            : "Configure DE bearing part # and RPM on the asset to calculate BPFO / BPFI / BSF / FTF"}
                        </p>
                        {!calculatedBearingFaults && (
                          <p
                            data-testid="enveloping-bearing-dormant-note"
                            className="text-xs text-amber-300 mt-1"
                          >
                            {ENVELOPING_BEARING_DORMANT_NOTE}
                            {bearingRpmReading.warning
                              ? ` ${bearingRpmReading.warning}.`
                              : ""}
                          </p>
                        )}
                        {calculatedBearingFaults && bearingRpmReading.warning && (
                          <p
                            data-testid="enveloping-rpm-provenance"
                            className="text-xs text-amber-300 mt-1"
                          >
                            {bearingRpmReading.warning}
                          </p>
                        )}
                        {!calculatedBearingFaults &&
                          !bearingRpmReading.warning &&
                          (bearingRpmReading.source === "absent" ||
                            !bearingGeometryConfigured) && (
                            <p
                              data-testid="enveloping-rpm-provenance"
                              className="text-xs text-amber-300 mt-1"
                            >
                              {bearingGeometryConfigured
                                ? VIBRATION_RPM_ABSENT_WARNING
                                : "Bearing geometry not configured"}
                            </p>
                          )}
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
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-base font-bold text-white">
                          Peak g<sub>E</sub> Trend
                        </h3>
                        <ChartExpandButton
                          onClick={() => setExpandedChart("envelopingGe")}
                          label="Enlarge Peak gE Trend chart"
                        />
                      </div>
                      <p className="text-xs text-slate-500 mb-3">
                        Real demodulation / acceleration envelope from diagnostic history
                      </p>
                      <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                        <EnvelopingGeChartBody
                          data={envelopingGeChartData}
                          hasAnySeries={envelopingTrendSeries.length > 0}
                          timeRange={timeRange}
                          baselinePeakGe={envelopeBaseline?.peakGe ?? null}
                          isSparse={envelopingTrendIsSparse}
                        />
                      </div>
                    </div>

                    <div className={CARD}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-base font-bold text-white">
                          Kurtosis Trend
                        </h3>
                        <ChartExpandButton
                          onClick={() => setExpandedChart("envelopingKurtosis")}
                          label="Enlarge Kurtosis Trend chart"
                        />
                      </div>
                      <p className="text-xs text-slate-500 mb-3">
                        Crest / kurtosis from waveform metrics — gaps omitted (no zero fill)
                      </p>
                      <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
                        <EnvelopingKurtosisChartBody
                          data={envelopingKurtosisChartData}
                          hasAnySeries={envelopingTrendSeries.length > 0}
                          timeRange={timeRange}
                          baselineKurtosis={envelopeBaseline?.kurtosis ?? null}
                          isSparse={envelopingTrendIsSparse}
                        />
                      </div>
                    </div>
                  </div>

                  {vibExtractedEnvelopeChart.length > 0 && (
                    <div className={`${CARD} mb-6`}>
                      <h3 className="text-base font-bold text-white mb-1">
                        Measured Bearing Band Amplitudes
                      </h3>
                      <p className="text-xs text-slate-500 mb-2">
                        From latest diagnostic enveloping peaks
                        {latestVibrationRecord?.extractionConfidence != null
                          ? ` · confidence ${latestVibrationRecord.extractionConfidence}%`
                          : ""}
                        {calculatedBearingFaults
                          ? ` · match vs calc BPFO ${calculatedBearingFaults.bpfo.toFixed(1)} Hz / BPFI ${calculatedBearingFaults.bpfi.toFixed(1)} Hz`
                          : ""}
                      </p>
                      <p
                        data-testid="enveloping-envelope-provenance"
                        className="text-xs text-slate-500 mb-3"
                      >
                        Stored envelope peaks as extracted at collection — not
                        re-derived from RPM, and not converted for the g / Hz
                        display selectors.
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

                  {/* SLICE-VS5 — envelope order overlay only with stored
                      geometry AND gating-quality RPM. Dormant otherwise. */}
                  {calculatedBearingFaults && vibExtractedEnvelopeChart.length > 0 && (
                    <div className={`${CARD} mb-6`}>
                      <h3 className="text-base font-bold text-white mb-1">
                        Envelope Order Overlay
                      </h3>
                      <p className="text-xs text-slate-500 mb-3">
                        {ENVELOPING_ORDER_OVERLAY_NOTE} Source:{" "}
                        {vibrationRpmProvenanceLabel(bearingRpmReading.source)} ·
                        geometry {calculatedBearingFaults.geometry.source}.
                      </p>
                      <EnvelopeOrderOverlayChart
                        data={vibExtractedEnvelopeChart}
                        frequencies={calculatedBearingFaults}
                      />
                    </div>
                  )}

                  <p
                    data-testid="enveloping-unit-physics-note"
                    className="text-[10px] leading-relaxed text-slate-500 mb-4"
                  >
                    {ENVELOPING_UNIT_PHYSICS_NOTE}
                  </p>

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
                    ) : envelopingTrendWindow.length === 0 ? (
                      <p className="text-sm text-slate-500 py-8 text-center">
                        No enveloping history in the selected {timeRange} window.
                      </p>
                    ) : (
                      <div className="max-h-[420px] overflow-y-auto overflow-x-auto rounded-lg border border-white/10">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 z-10">
                            <tr className="bg-slate-950 text-slate-400 text-left text-[10px] uppercase tracking-widest">
                              <th className="px-3 py-2 font-bold">Date</th>
                              <th className="px-3 py-2 font-bold">Peak gE</th>
                              <th className="px-3 py-2 font-bold">Kurtosis</th>
                              <th className="px-3 py-2 font-bold">Health</th>
                              <th className="px-3 py-2 font-bold">Fault</th>
                              <th className="px-3 py-2 font-bold">Baseline</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...envelopingTrendWindow].reverse().map((row) => {
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
                                    {row.dateLabel}
                                    {row.stoppedLabel ? (
                                      <span className="block text-[10px] text-amber-300">
                                        {row.stoppedLabel}
                                      </span>
                                    ) : null}
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
              model={waveformChartModel}
              latestMetrics={latestWaveformAnalysisMetrics}
              waveformSamples={vibExtractedWaveformChart}
              emptyAlert={vibrationAwaitingRecordAlert}
              analysesCount={vibAnalyses.length}
              velocityUnit={displayUnits.velocity}
              windowEmptyNote={waveformWindowEmptyNote}
              hasStoppedSamples={waveformHasStoppedSamples}
              runningOnly={runningOnly}
              latestTrendPoint={latestWaveformTrendPoint}
              renderExpandButton={(chart: WaveformChartId, label: string) => (
                <ChartExpandButton
                  onClick={() =>
                    setExpandedChart(
                      chart === "time"
                        ? "waveformTime"
                        : chart === "crest"
                          ? "waveformCrest"
                          : "waveformImpact"
                    )
                  }
                  label={label}
                />
              )}
            />
          )}

          {expandedChart === "spectral" && (
            <TrendChartExpandModal
              title="Spectral & Harmonics"
              subtitle="Time-series amplitude trend · 1X unbalance, 2X misalignment, overall vibration"
              onClose={closeExpandedChart}
            >
              <SpectralTrendChartBody
                data={spectralTrendDisplayData}
                windowEmpty={spectralWindowEmpty}
                isSparse={spectralTrendIsSparse}
                hasOrderSeries={spectralHasOrderSeries}
                velocityUnit={displayUnits.velocity}
                timeRange={timeRange}
              />
            </TrendChartExpandModal>
          )}

          {expandedChart === "envelopingGe" && (
            <TrendChartExpandModal
              title="Peak gE Trend"
              subtitle="Real demodulation / acceleration envelope from diagnostic history"
              onClose={closeExpandedChart}
            >
              <EnvelopingGeChartBody
                data={envelopingGeChartData}
                hasAnySeries={envelopingTrendSeries.length > 0}
                timeRange={timeRange}
                baselinePeakGe={envelopeBaseline?.peakGe ?? null}
                isSparse={envelopingTrendIsSparse}
              />
            </TrendChartExpandModal>
          )}

          {expandedChart === "envelopingKurtosis" && (
            <TrendChartExpandModal
              title="Kurtosis Trend"
              subtitle="Crest / kurtosis from waveform metrics — gaps omitted (no zero fill)"
              onClose={closeExpandedChart}
            >
              <EnvelopingKurtosisChartBody
                data={envelopingKurtosisChartData}
                hasAnySeries={envelopingTrendSeries.length > 0}
                timeRange={timeRange}
                baselineKurtosis={envelopeBaseline?.kurtosis ?? null}
                isSparse={envelopingTrendIsSparse}
              />
            </TrendChartExpandModal>
          )}

          {expandedChart === "waveformTime" && (
            <TrendChartExpandModal
              title="Time Waveform"
              subtitle={`Real samples from latest diagnostic${
                waveformRpm != null && waveformRpm > 0
                  ? ` · 1X markers every ${(60000 / waveformRpm).toFixed(1)} ms (${waveformRpm} RPM)`
                  : ""
              }`}
              onClose={closeExpandedChart}
            >
              <WaveformTimeChartBody
                data={waveformChartModel.waveformChartData}
                oneXMarkers={waveformChartModel.oneXMarkers}
                velocityUnit={displayUnits.velocity}
              />
            </TrendChartExpandModal>
          )}

          {expandedChart === "waveformCrest" && (
            <TrendChartExpandModal
              title="Crest Factor Trend"
              subtitle="Early warning — rising crest factor often precedes overall velocity growth"
              onClose={closeExpandedChart}
            >
              <CrestFactorTrendChartBody data={waveformChartModel.crestTrend} />
            </TrendChartExpandModal>
          )}

          {expandedChart === "waveformImpact" && (
            <TrendChartExpandModal
              title="Impact Count Trend"
              subtitle="Transient peaks exceeding 3× RMS per measurement window"
              onClose={closeExpandedChart}
            >
              <ImpactCountTrendChartBody data={waveformChartModel.impactTrend} />
            </TrendChartExpandModal>
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
                            ? `${latestThermoChart.hotspot}${thermoDisplayUnit}`
                            : NOT_MEASURED}
                        </li>
                        <li className="text-sm font-semibold text-green-400">
                          Reference:{" "}
                          {latestThermoChart?.reference != null
                            ? `${latestThermoChart.reference}${thermoDisplayUnit}`
                            : NOT_MEASURED}
                        </li>
                        <li className="text-sm font-semibold text-yellow-400">
                          ΔT:{" "}
                          {latestThermoChart?.deltaT != null
                            ? `${latestThermoChart.deltaT}${thermoDisplayUnit}`
                            : NOT_MEASURED}
                        </li>
                        <li className="text-sm font-semibold text-white">
                          Fault:{" "}
                          {windowedThermoAnalyses[0]?.primary_fault || NOT_REPORTED}
                        </li>
                        <li className="text-sm font-semibold text-slate-300">
                          NETA:{" "}
                          {latestThermoChart?.severityLabel || NOT_REPORTED}
                        </li>
                        {hasThermographyData && (
                          <li className="pt-1" data-testid="thermo-kpi-provenance">
                            <p className="text-[10px] text-slate-500 italic">
                              Fault / NETA verdict stored from the saved scan —
                              not ΔT-derived.
                            </p>
                          </li>
                        )}
                        {hasThermographyData && !thermoLoadStored && (
                          <li
                            className="pt-1"
                            data-testid="thermo-kpi-load-disclosure"
                          >
                            <p className="text-[10px] text-slate-500 italic">
                              {THERMO_LOAD_DISCLOSURE}
                            </p>
                          </li>
                        )}
                        {thermoEmissivityPill && (
                          <li className="pt-1">
                            <span className="inline-flex max-w-full rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold text-cyan-300">
                              {thermoEmissivityPill}
                            </span>
                          </li>
                        )}
                        {thermoEmissivityBadge && (
                          <li
                            className="pt-1"
                            data-testid="thermo-kpi-emissivity-provenance"
                          >
                            <span
                              className={
                                latestThermoRaw?.emissivitySource ===
                                "app-default"
                                  ? "inline-flex max-w-full rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-300"
                                  : "inline-flex max-w-full rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold text-cyan-300"
                              }
                            >
                              {thermoEmissivityBadge}
                            </span>
                          </li>
                        )}
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

                  {netaRepairReference && (
                    <div className={`${CARD} mb-6`}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        NETA Repair-Priority Reference
                      </p>
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                            <th className="py-2 pr-3 font-bold">Stored class</th>
                            <th className="py-2 pr-3 font-bold">
                              Reference repair window
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="text-slate-300">
                            <td className="py-2 pr-3 font-semibold">
                              {netaRepairReference.classLabel}
                            </td>
                            <td className="py-2 pr-3">
                              {netaRepairReference.repairWindow}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="text-[10px] text-slate-500 mt-2 italic">
                        Static NETA / NFPA 70B reference guidance keyed to the
                        stored severity class — not a live per-asset diagnosis
                        and not recomputed from ΔT.
                      </p>
                    </div>
                  )}

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
                    note={
                      thermoAxisPlan.snapshot && hasHotspotSeries
                        ? SPARSE_TREND_HELPER_TEXT
                        : null
                    }
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={thermoDisplaySeries}
                        margin={chartMargin}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey={thermoAxisDataKey}
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          label={{
                            value: thermoAxisPlan.sameDate ? "Date · run" : "Date",
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
                            value: thermoTempAxisLabel,
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
                          stroke={thermoAxisPlan.snapshot ? "transparent" : "#f87171"}
                          strokeWidth={2}
                          dot={
                            thermoAxisPlan.snapshot
                              ? { r: 4, fill: "#f87171", stroke: "#f87171" }
                              : { r: 3 }
                          }
                          connectNulls
                        />
                        <Line
                          yAxisId="temp"
                          type="monotone"
                          dataKey="reference"
                          name="Reference"
                          stroke={thermoAxisPlan.snapshot ? "transparent" : "#34d399"}
                          strokeWidth={2}
                          dot={
                            thermoAxisPlan.snapshot
                              ? { r: 4, fill: "#34d399", stroke: "#34d399" }
                              : { r: 3 }
                          }
                          connectNulls
                        />
                        <Line
                          yAxisId="temp"
                          type="monotone"
                          dataKey="deltaT"
                          name="ΔT"
                          stroke={thermoAxisPlan.snapshot ? "transparent" : "#fbbf24"}
                          strokeWidth={2}
                          dot={
                            thermoAxisPlan.snapshot
                              ? { r: 4, fill: "#fbbf24", stroke: "#fbbf24" }
                              : { r: 3 }
                          }
                          connectNulls
                        />
                        <Line
                          yAxisId="sev"
                          type="stepAfter"
                          dataKey="severityClass"
                          name="Severity Class"
                          stroke={thermoAxisPlan.snapshot ? "transparent" : "#a78bfa"}
                          strokeWidth={2}
                          dot={
                            thermoAxisPlan.snapshot
                              ? { r: 4, fill: "#a78bfa", stroke: "#a78bfa" }
                              : { r: 3 }
                          }
                          connectNulls
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ThermoChartFrame>

                  {windowedThermoAnalyses.length > 0 && (
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
                            <th className="py-2 pr-3 font-bold">
                              Hotspot ({thermoDisplayUnit})
                            </th>
                            <th className="py-2 pr-3 font-bold">
                              ΔT ({thermoDisplayUnit})
                            </th>
                            <th className="py-2 pr-3 font-bold">NETA</th>
                          </tr>
                        </thead>
                        <tbody>
                          {windowedThermoAnalyses.map((r, idx) => {
                            const pt =
                              thermoDisplaySeries[
                                thermoDisplaySeries.length - 1 - idx
                              ];
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
                                  <span className="inline-flex items-center gap-1.5">
                                    {r.health_score ?? "—"}
                                    <TelemetryProvenanceBadge provenance={telemetryProvenanceOf(r)} />
                                  </span>
                                </td>
                                <td className="py-2 pr-3">{r.primary_fault || NOT_REPORTED}</td>
                                <td className="py-2 pr-3 font-mono">
                                  {pt?.hotspot != null ? pt.hotspot : NOT_MEASURED}
                                </td>
                                <td className="py-2 pr-3 font-mono">
                                  {pt?.deltaT != null ? pt.deltaT : NOT_MEASURED}
                                </td>
                                <td className="py-2 pr-3">
                                  <span className="inline-flex items-center gap-1.5">
                                    {pt?.severityLabel || NOT_REPORTED}
                                    <TelemetryProvenanceBadge provenance={telemetryProvenanceOf(r)} />
                                  </span>
                                </td>
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
                          : NOT_MEASURED}
                      </p>
                      <p className="text-sm text-slate-400 mt-1 font-mono">
                        {phaseHottest != null
                          ? `${phaseHottest.temp}${thermoDisplayUnit}`
                          : NOT_MEASURED}
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        Live Load vs Rated
                      </p>
                      <p className="text-2xl font-bold text-cyan-400">
                        {latestThermoChart?.loadPercent != null
                          ? `${latestThermoChart.loadPercent}%`
                          : NOT_REPORTED}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {latestThermoChart?.currentAmps != null &&
                        latestThermoChart?.ratedAmps != null
                          ? `${latestThermoChart.currentAmps} A / ${latestThermoChart.ratedAmps} A rated`
                          : latestThermoChart?.loadPercent != null
                            ? "Load % from saved scan"
                            : NOT_REPORTED}
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        Current I²R ΔT
                      </p>
                      <p className="text-2xl font-bold text-yellow-400">
                        {latestThermoChart?.deltaT != null
                          ? `${latestThermoChart.deltaT}${thermoDisplayUnit}`
                          : NOT_MEASURED}
                      </p>
                      <p className="text-xs mt-1 text-slate-500">
                        Current operating point, not a projection
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        NFPA 70B Compliance
                      </p>
                      {phaseNfpaBadge ? (
                        <span
                          className={`inline-flex mt-1 px-3 py-1.5 rounded-lg border text-sm font-bold ${phaseNfpaBadge.className}`}
                        >
                          {phaseNfpaBadge.label}
                        </span>
                      ) : (
                        <p className="text-sm text-slate-500 mt-1">
                          {NOT_REPORTED}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 mt-2">Severity class badge</p>
                    </div>
                  </div>

                  <ThermoChartFrame
                    title="Phase Delta & I²R Load — Phase A/B/C temperatures with ≥40% load validity band"
                    subtitle={`Left: Temperature (${thermoDisplayUnit}) · Right: Load (%) · Green band = operational validity (≥40% load)`}
                    overlay={
                      !hasThermographyData
                        ? "No thermography scans for this asset"
                        : !hasPhaseSeries
                          ? "No phase/load data in saved scans yet"
                          : null
                    }
                    note={
                      thermoAxisPlan.snapshot && hasPhaseSeries
                        ? SPARSE_TREND_HELPER_TEXT
                        : null
                    }
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={thermoDisplaySeries}
                        margin={chartMargin}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey={thermoAxisDataKey}
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          label={{
                            value: thermoAxisPlan.sameDate ? "Date · run" : "Date",
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
                            value: thermoTempAxisLabel,
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
                        {React.createElement(ReferenceArea, {
                          yAxisId: "load",
                          y1: PROJECTION_MIN_VALID_LOAD_PERCENT,
                          y2: 100,
                          fill: "#22c55e",
                          fillOpacity: 0.12,
                          strokeOpacity: 0
                        })}
                        <ReferenceLine
                          yAxisId="load"
                          y={PROJECTION_MIN_VALID_LOAD_PERCENT}
                          stroke="#22c55e"
                          strokeDasharray="4 4"
                          label={{
                            value: `≥${PROJECTION_MIN_VALID_LOAD_PERCENT}% load`,
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
                          stroke={thermoAxisPlan.snapshot ? "transparent" : "#ef4444"}
                          strokeWidth={2.5}
                          dot={
                            thermoAxisPlan.snapshot
                              ? { r: 4, fill: "#ef4444", stroke: "#ef4444" }
                              : { r: 3 }
                          }
                          connectNulls
                        />
                        <Line
                          yAxisId="temp"
                          type="monotone"
                          dataKey="phaseB"
                          name="Phase B"
                          stroke={thermoAxisPlan.snapshot ? "transparent" : "#f59e0b"}
                          strokeWidth={2.5}
                          dot={
                            thermoAxisPlan.snapshot
                              ? { r: 4, fill: "#f59e0b", stroke: "#f59e0b" }
                              : { r: 3 }
                          }
                          connectNulls
                        />
                        <Line
                          yAxisId="temp"
                          type="monotone"
                          dataKey="phaseC"
                          name="Phase C"
                          stroke={thermoAxisPlan.snapshot ? "transparent" : "#3b82f6"}
                          strokeWidth={2.5}
                          dot={
                            thermoAxisPlan.snapshot
                              ? { r: 4, fill: "#3b82f6", stroke: "#3b82f6" }
                              : { r: 3 }
                          }
                          connectNulls
                        />
                        <Line
                          yAxisId="load"
                          type="stepAfter"
                          dataKey="loadPercent"
                          name="Load %"
                          stroke={thermoAxisPlan.snapshot ? "transparent" : "#22d3ee"}
                          strokeWidth={2}
                          dot={
                            thermoAxisPlan.snapshot
                              ? { r: 4, fill: "#22d3ee", stroke: "#22d3ee" }
                              : { r: 3 }
                          }
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
                          : NOT_MEASURED}
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
                          ? `Range: ${radioKpis.paletteSpan}${thermoDisplayUnit}`
                          : NOT_REPORTED}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 font-mono">
                        {radioKpis.paletteConfigured
                          ? `${radioKpis.latest!.scaleMin}${thermoDisplayUnit} → ${radioKpis.latest!.scaleMax}${thermoDisplayUnit}`
                          : "Camera scale not reported in saved scan"}
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
                          ? `Active: >${radioKpis.latest!.isothermThreshold}${thermoDisplayUnit}`
                          : NOT_REPORTED}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {radioKpis.isothermConfigured
                          ? "Isotherm filter engaged"
                          : "Camera measurement settings not reported"}
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
                          ? `Box Avg: ${radioKpis.latest!.boxAverage}${thermoDisplayUnit}`
                          : NOT_MEASURED}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {radioKpis.latest?.reflectedApparentTemp != null
                          ? `Reflected: ${
                              radioKpis.latest.reflectedApparentTemp
                            }${
                              radioKpis.latest.tempUnit ?? thermoStoredUnit
                            } (stored units)`
                          : radioKpis.boxAverageConfigured
                            ? "Baseline thermal creep tracking"
                            : "ROI statistics not measured"}
                      </p>
                    </div>
                  </div>

                  {!hasReflectedTempSeries && (
                    <div
                      data-testid="thermo-tref-gate"
                      className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 mb-6"
                    >
                      <p className="text-sm font-semibold text-amber-300">
                        {THERMO_REF_TEMP_MISSING}
                      </p>
                    </div>
                  )}

                  <ThermoChartFrame
                    title="Radiometric & Isotherm — Temperature & emissivity over time (scale, isotherm, box avg)"
                    subtitle={`Left: ${thermoTempAxisLabel} · Right: Emissivity (ε) · T_refl is shown in stored units, not on the converted axis`}
                    overlay={
                      !hasThermographyData
                        ? "No thermography scans for this asset"
                        : !hasRadiometricSeries
                          ? "No temperature or emissivity series in saved scans yet"
                          : null
                    }
                    note={
                      thermoAxisPlan.snapshot && hasRadiometricSeries
                        ? SPARSE_TREND_HELPER_TEXT
                        : null
                    }
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={thermoDisplaySeries}
                        margin={chartMargin}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey={thermoAxisDataKey}
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          label={{
                            value: thermoAxisPlan.sameDate ? "Date · run" : "Date",
                            position: "insideBottom",
                            offset: -2,
                            fill: "#64748b",
                            fontSize: 11
                          }}
                        />
                        {hasRadiometricTempSeries && (
                          <YAxis
                            yAxisId="temp"
                            tick={{ fill: "#94a3b8", fontSize: 11 }}
                            label={{
                              value: thermoTempAxisLabel,
                              angle: -90,
                              position: "insideLeft",
                              fill: "#64748b",
                              fontSize: 11
                            }}
                          />
                        )}
                        {hasEmissivitySeries && (
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
                        )}
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend verticalAlign="bottom" height={28} />
                        {hasRadiometricTempSeries && (
                          <>
                            <Line
                              yAxisId="temp"
                              type="monotone"
                              dataKey="boxAverage"
                              name="Box Average Temperature"
                              stroke={
                                thermoAxisPlan.snapshot ? "transparent" : "#22c55e"
                              }
                              strokeWidth={2.5}
                              dot={
                                thermoAxisPlan.snapshot
                                  ? { r: 4, fill: "#22c55e", stroke: "#22c55e" }
                                  : { r: 3 }
                              }
                              connectNulls
                            />
                            <Line
                              yAxisId="temp"
                              type="monotone"
                              dataKey="isothermThreshold"
                              name="Isotherm threshold"
                              stroke={
                                thermoAxisPlan.snapshot ? "transparent" : "#f97316"
                              }
                              strokeWidth={2}
                              dot={
                                thermoAxisPlan.snapshot
                                  ? { r: 4, fill: "#f97316", stroke: "#f97316" }
                                  : { r: 3 }
                              }
                              connectNulls
                            />
                            <Line
                              yAxisId="temp"
                              type="monotone"
                              dataKey="scaleMax"
                              name="Scale Max boundary"
                              stroke={
                                thermoAxisPlan.snapshot ? "transparent" : "#ef4444"
                              }
                              strokeWidth={2}
                              strokeDasharray="4 3"
                              dot={
                                thermoAxisPlan.snapshot
                                  ? { r: 4, fill: "#ef4444", stroke: "#ef4444" }
                                  : { r: 3 }
                              }
                              connectNulls
                            />
                            <Line
                              yAxisId="temp"
                              type="monotone"
                              dataKey="scaleMin"
                              name="Scale Min boundary"
                              stroke={
                                thermoAxisPlan.snapshot ? "transparent" : "#3b82f6"
                              }
                              strokeWidth={2}
                              strokeDasharray="4 3"
                              dot={
                                thermoAxisPlan.snapshot
                                  ? { r: 4, fill: "#3b82f6", stroke: "#3b82f6" }
                                  : { r: 3 }
                              }
                              connectNulls
                            />
                          </>
                        )}
                        {hasEmissivitySeries && (
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
                        )}
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
                          {latestThermoChart?.deBearing != null
                            ? `${latestThermoChart.deBearing}${thermoDisplayUnit}`
                            : NOT_MEASURED}
                        </span>
                        <span className="text-slate-600 mx-1">·</span>
                        ODE:{" "}
                        <span className="text-blue-400 font-mono">
                          {latestThermoChart?.odeBearing != null
                            ? `${latestThermoChart.odeBearing}${thermoDisplayUnit}`
                            : NOT_MEASURED}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 mt-2">
                        ΔT vs ambient:{" "}
                        {mechDeltaAmbientDE != null ||
                        mechDeltaAmbientODE != null
                          ? `DE ${
                              mechDeltaAmbientDE != null
                                ? `${mechDeltaAmbientDE}${thermoDisplayUnit}`
                                : NOT_MEASURED
                            } / ODE ${
                              mechDeltaAmbientODE != null
                                ? `${mechDeltaAmbientODE}${thermoDisplayUnit}`
                                : NOT_MEASURED
                            }`
                          : NOT_MEASURED}
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        Refractory Insulation Integrity
                      </p>
                      <p className="text-2xl font-bold text-orange-400">
                        {latestThermoChart?.refractorySkinTemp != null ||
                        latestThermoChart?.skinTemp != null
                          ? `Skin: ${
                              latestThermoChart?.refractorySkinTemp ??
                              latestThermoChart?.skinTemp
                            }${thermoDisplayUnit}`
                          : NOT_MEASURED}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 font-mono">
                        {latestThermoChart?.maxAllowable != null
                          ? `Max: ${latestThermoChart.maxAllowable}${thermoDisplayUnit}`
                          : NOT_MEASURED}
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        Frictional Anomaly Flag
                      </p>
                      {mechKpis.latest?.frictionalAnomaly ? (
                        <span className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-400 text-sm font-bold">
                          <AlertTriangle className="h-4 w-4" />
                          {mechKpis.latest.frictionalSeverity ?? "Anomaly"}
                        </span>
                      ) : (
                        <p className="text-2xl font-bold text-slate-400">
                          {mechKpis.latest?.frictionalAnomaly === false
                            ? NOT_DETECTED
                            : mechKpis.latest?.frictionalSeverity ??
                              NOT_REPORTED}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 mt-2">
                        {mechKpis.latest?.frictionalSeverity
                          ? "Stored friction class"
                          : mechKpis.latest?.frictionalAnomaly === true
                            ? "Stored friction anomaly flag — no class recorded"
                            : mechKpis.latest?.frictionalAnomaly === false
                              ? "Stored flag reports no friction anomaly"
                              : "No stored friction flag reported"}
                      </p>
                    </div>
                    <div className={CARD}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                        Thermal Creep Velocity
                      </p>
                      <p className="text-2xl font-bold text-yellow-400">
                        {mechCreepRate != null
                          ? `${mechCreepRate}${thermoDisplayUnit}/day`
                          : NOT_MEASURED}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {mechCreepRate != null
                          ? "Measured least-squares slope across stored skin temps"
                          : SPARSE_TREND_HELPER_TEXT}
                      </p>
                    </div>
                  </div>

                  <ThermoChartFrame
                    title="Mechanical & Refractory — Bearing housing and refractory skin temps vs limits"
                    subtitle={`DE / ODE housing · refractory lagging${hasStoredMaxAllowable ? " · max allowable threshold" : ""}${hasSkinAmbientDeltaSeries ? " · derived skin−ambient ΔT" : ""} (${thermoDisplayUnit})`}
                    overlay={
                      !hasThermographyData
                        ? "No thermography scans for this asset"
                        : !hasMechanicalSeries
                          ? "No mechanical or refractory thermal logs in saved scans yet"
                          : null
                    }
                    note={
                      thermoAxisPlan.snapshot && hasMechanicalSeries
                        ? [SPARSE_TREND_HELPER_TEXT, thermoAmbientStoredNote]
                            .filter(Boolean)
                            .join(" ")
                        : thermoAmbientStoredNote
                    }
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={thermoDisplaySeries}
                        margin={chartMargin}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey={thermoAxisDataKey}
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          label={{
                            value: thermoAxisPlan.sameDate ? "Date · run" : "Date",
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
                        {hasStoredMaxAllowable && latestThermoChart?.maxAllowable != null && (
                          <ReferenceLine
                            y={latestThermoChart.maxAllowable}
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
                          stroke={thermoAxisPlan.snapshot ? "transparent" : "#ef4444"}
                          strokeWidth={2.5}
                          dot={
                            thermoAxisPlan.snapshot
                              ? { r: 4, fill: "#ef4444", stroke: "#ef4444" }
                              : { r: 3 }
                          }
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="odeBearing"
                          name="Opposite Drive-End (ODE) Bearing Housing Temp"
                          stroke={thermoAxisPlan.snapshot ? "transparent" : "#3b82f6"}
                          strokeWidth={2.5}
                          dot={
                            thermoAxisPlan.snapshot
                              ? { r: 4, fill: "#3b82f6", stroke: "#3b82f6" }
                              : { r: 3 }
                          }
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="refractorySkinTemp"
                          name="Refractory Lagging Skin Temp"
                          stroke={thermoAxisPlan.snapshot ? "transparent" : "#f97316"}
                          strokeWidth={2.5}
                          dot={
                            thermoAxisPlan.snapshot
                              ? { r: 4, fill: "#f97316", stroke: "#f97316" }
                              : { r: 3 }
                          }
                          connectNulls
                        />
                        {hasSkinAmbientDeltaSeries && (
                          <Line
                            type="monotone"
                            dataKey="skinAmbientDelta"
                            name="Skin - Ambient ΔT (derived)"
                            stroke={
                              thermoAxisPlan.snapshot ? "transparent" : "#a78bfa"
                            }
                            strokeWidth={2}
                            strokeDasharray="2 3"
                            dot={
                              thermoAxisPlan.snapshot
                                ? { r: 4, fill: "#a78bfa", stroke: "#a78bfa" }
                                : { r: 3 }
                            }
                            connectNulls
                          />
                        )}
                        {hasStoredMaxAllowable && (
                          <Line
                            type="monotone"
                            dataKey="maxAllowable"
                            name="Max Allowable Limit"
                            stroke={
                              thermoAxisPlan.snapshot ? "transparent" : "#ef4444"
                            }
                            strokeWidth={1.5}
                            strokeDasharray="6 4"
                            dot={false}
                            connectNulls
                          />
                        )}
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
                    Latest mechanical / bearing scan peak acoustic amplitude
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
                    Linear peak/RMS ratio (stored crest, else
                    10^((Peak−RMS)/20)) — early bearing defect indicator
                  </p>
                </div>
              </div>

              <ThermoChartFrame
                title="Bearings & Mechanical — RMS / Peak acoustic trend"
                subtitle="Solid: RMS dBµV (friction) · Dashed: Peak dBµV (impact) · From analysis_results.peaks"
                overlay={
                  ueBearingWindowEmpty
                    ? `No mechanical / bearing ultrasound readings in the selected ${timeRange} window.`
                    : !hasUeBearingSeries
                      ? ueBearingAnalyses.length === 0
                        ? "No mechanical / bearing ultrasound metrics in saved scans yet"
                        : `No mechanical / bearing ultrasound metrics in the selected ${timeRange} window.`
                      : null
                }
                note={
                  hasUeBearingSeries && ueBearingChartSparse
                    ? SPARSE_TREND_HELPER_TEXT
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

              <div className={`${CARD} mb-6 overflow-x-auto`} data-testid="ue-ddb-rubric">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                  UE Systems Bearing-Condition Reference Ladder
                </p>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                      <th className="py-2 pr-3 font-bold">Δ over baseline</th>
                      <th className="py-2 pr-3 font-bold">Stored class</th>
                      <th className="py-2 pr-3 font-bold">Program action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {US_DDB_BRACKETS.map((bracket) => (
                      <tr key={bracket.clazz} className="text-slate-300">
                        <td className="py-2 pr-3 font-mono">
                          {bracket.minDb === -Infinity
                            ? `≤ ${bracket.maxDb} dB`
                            : bracket.maxDb === Infinity
                              ? `> ${bracket.minDb} dB`
                              : `> ${bracket.minDb} – ≤ ${bracket.maxDb} dB`}
                        </td>
                        <td className="py-2 pr-3 font-semibold">
                          {bracket.clazz}
                        </td>
                        <td className="py-2 pr-3">{bracket.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[10px] text-slate-500 mt-2 italic">
                  {US_DDB_SOURCE}. Static in-repo reference — not recomputed
                  from this scan and not a live per-asset diagnosis. Applies
                  only to contact / structure-borne mechanical readings;
                  airborne leak and electrical scans are descriptive-only.
                </p>
              </div>

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
                        <th className="py-2 pr-3 font-bold">Probe</th>
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
                            <td className="py-2 pr-3 text-xs">
                              {ULTRASOUND_PROBE_LABEL[up.probeType]}
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
              {hasUeLeakScans && (
                <div
                  className="rounded-xl border border-sky-500/30 bg-sky-500/[0.06] px-4 py-3 mb-4"
                  data-testid="ue-leak-basis-pill"
                >
                  <p className="text-[11px] font-semibold text-sky-200">
                    Measured dBµV readings only — the derived leak-rate model is
                    parked (SLICE-VS8) and does not run on this tab.
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {DB_POWER_MEAN_NOTE}
                  </p>
                  {ueLeakKpis.fallbackCount > 0 && (
                    <p
                      className="text-[10px] font-semibold text-amber-300 mt-1"
                      data-testid="ue-leak-baseline-fallback-note"
                    >
                      Baseline fallback: no stored baseline dBµV for{" "}
                      {ueLeakKpis.fallbackCount} run
                      {ueLeakKpis.fallbackCount === 1 ? "" : "s"} —{" "}
                      {ueLeakKpis.fallbackDb ?? 28} dBµV applied. Delta is
                      modeled, not measured.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Leak Scans (Window)
                  </p>
                  <p className="text-2xl font-bold text-sky-400 font-mono">
                    {windowedUeLeakAnalyses.length}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Stored leak-mode runs inside the selected window
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Mean ΔdBµV
                  </p>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    {ueLeakKpis.avgDelta == null
                      ? "N/A"
                      : `${ueLeakKpis.avgDelta.toFixed(1)} dB`}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Power-domain mean of per-run deltas — not an arithmetic mean
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Leak-Rate Estimate
                  </p>
                  <p className="text-2xl font-bold text-slate-400 font-mono">
                    Parked
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    CFM / orifice / $ / CO₂ outputs are not derived here
                    (SLICE-VS8)
                  </p>
                </div>
              </div>

              <div className={`${CARD} mb-6 overflow-x-auto`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Leak Reading Inventory
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Measured dBµV only · sorted newest first
                  </p>
                </div>
                {ueLeakReadingRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                    <div className="w-12 h-12 rounded-xl border border-sky-500/40 bg-sky-500/10 text-sky-400 flex items-center justify-center mb-4">
                      <Wind className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-semibold text-slate-200 max-w-lg">
                      {!hasUeLeakScans
                        ? "No stored ultrasound leak scans for this asset. Run a Leak Detection diagnostic to populate this inventory."
                        : windowedUeLeakAnalyses.length === 0
                          ? `No leak scans in the selected ${timeRange} window.`
                          : "Stored leak scans exist in this window, but none carry a readable peak dBµV value."}
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                        <th className="py-2 pr-3 font-bold">Date</th>
                        <th className="py-2 pr-3 font-bold">Peak (dBµV)</th>
                        <th className="py-2 pr-3 font-bold">Baseline (dBµV)</th>
                        <th className="py-2 pr-3 font-bold">Δ (dB)</th>
                        <th className="py-2 pr-3 font-bold">Probe</th>
                        <th className="py-2 pr-3 font-bold">Baseline Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ueLeakReadingRows.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b border-slate-800/80 text-slate-300"
                        >
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            {row.dateLabel}
                          </td>
                          <td className="py-2.5 pr-3 font-mono">
                            {row.peakDb != null
                              ? `${row.peakDb.toFixed(1)} dBµV`
                              : "—"}
                          </td>
                          <td className="py-2.5 pr-3 font-mono">
                            {row.baselineDb != null
                              ? `${row.baselineDb.toFixed(1)} dBµV`
                              : "—"}
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-amber-300">
                            {row.deltaDb != null
                              ? `${row.deltaDb.toFixed(1)} dB`
                              : "—"}
                          </td>
                          <td className="py-2.5 pr-3">
                            {ULTRASOUND_PROBE_LABEL[row.probeType]}
                          </td>
                          <td className="py-2.5 pr-3 text-xs">
                            {row.baselineSource === "stored"
                              ? "Stored baseline"
                              : row.baselineSource === "fallback"
                                ? "Modeled fallback"
                                : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p
                  className="text-[10px] text-slate-500 mt-3"
                  data-testid="ue-leak-status-provenance"
                >
                  Δ is a descriptive subtraction of two dBµV levels. No CFM,
                  orifice, dollar, or CO₂ estimate is derived on this tab
                  (SLICE-VS8).
                </p>
              </div>
            </>
          ) : ueMode === "electrical" ? (
            <>
              {hasUePdScans && (
                <div
                  className="rounded-xl border border-yellow-500/30 bg-yellow-500/[0.06] px-4 py-3 mb-4"
                  data-testid="ue-pd-baseline-disclosure"
                >
                  <p className="text-[11px] font-semibold text-yellow-200">
                    {uePdKpis.baselineFallbackCount > 0
                      ? `Baseline delta basis: fallback model applied (${uePdKpis.baselineFallbackDb ?? 28} dBµV).`
                      : "Baseline delta basis: each run's stored baseline."}
                  </p>
                  {uePdKpis.baselineFallbackCount > 0 && (
                    <p
                      className="text-[10px] font-semibold text-amber-300 mt-1"
                      data-testid="ue-pd-baseline-fallback-note"
                    >
                      Baseline fallback: no stored baseline dBµV for{" "}
                      {uePdKpis.baselineFallbackCount} run
                      {uePdKpis.baselineFallbackCount === 1 ? "" : "s"} —{" "}
                      {uePdKpis.baselineFallbackDb ?? 28} dBµV applied. Delta is
                      modeled, not measured.
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">
                    Classification and severity are keyed off peak dBµV
                    thresholds only — not the baseline delta. {PD_PEAK_DB_SOURCE}.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Peak Electrical dB
                  </p>
                  <p className="text-2xl font-bold text-yellow-400 font-mono">
                    {uePdKpisAbsent || uePdKpis.peakElectricalDb == null
                      ? "N/A"
                      : `${uePdKpis.peakElectricalDb.toFixed(1)} dBµV`}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Max peak_dbmv across electrical / PD scans in the selected{" "}
                    {timeRange} window
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Avg Baseline Delta
                  </p>
                  <p className="text-2xl font-bold text-sky-400 font-mono">
                    {uePdKpisAbsent || uePdKpis.avgBaselineDelta == null
                      ? "N/A"
                      : `${uePdKpis.avgBaselineDelta.toFixed(1)} dB`}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Mean peak − baseline across PD event history in the selected{" "}
                    {timeRange} window
                  </p>
                  {uePdKpis.baselineFallbackCount > 0 && (
                    <p
                      className="text-[10px] font-semibold text-amber-300 mt-1"
                      data-testid="ue-pd-avg-delta-modeled"
                    >
                      Includes modeled fallback deltas — not measured.
                    </p>
                  )}
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Threat Level
                  </p>
                  <p
                    className={`text-2xl font-bold font-mono ${pdSeverityTextClass(uePdKpis.threatSeverity)}`}
                  >
                    {uePdKpisAbsent ? "N/A" : uePdKpis.threatLabel}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Highest severity from peak dBµV thresholds only — not the
                    baseline delta
                  </p>
                </div>
              </div>

              {!uePdKpisAbsent && uePdKpis.threatSeverity === "critical" && (
                <div
                  className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 mb-6"
                  data-testid="ue-pd-electrical-advisory"
                >
                  <p className="text-[11px] font-semibold text-red-200">
                    {PD_ELECTRICAL_ADVISORY}
                  </p>
                  <p
                    className="text-[10px] text-slate-400 mt-1"
                    data-testid="ue-pd-thermal-followup"
                  >
                    {PD_THERMAL_FOLLOWUP_POINTER}
                  </p>
                </div>
              )}

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
                      {!hasUePdScans
                        ? "No stored electrical PD scans for this asset. Run an ultrasound diagnostic in Electrical mode to populate this history."
                        : `No electrical PD scans in the selected ${timeRange} window.`}
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
                            {row.baselineSource === "fallback" && (
                              <span
                                className="ml-1 text-[10px] font-semibold text-amber-300"
                                data-testid="ue-pd-delta-modeled"
                              >
                                (modeled)
                              </span>
                            )}
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
              {hasUeSteamScans && (
                <div
                  className="rounded-xl border border-cyan-500/30 bg-cyan-500/[0.06] px-4 py-3 mb-4"
                  data-testid="ue-steam-basis-pill"
                >
                  <p className="text-[11px] font-semibold text-cyan-200">
                    {STEAM_BASIS_TEXT}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {STEAM_BASIS_NOTE}
                  </p>
                  <p
                    className="text-[10px] font-semibold text-amber-300 mt-1"
                    data-testid="ue-steam-payback-basis"
                  >
                    {STEAM_PAYBACK_BASIS_TEXT}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Total Annual Steam Waste
                  </p>
                  <p className="text-2xl font-bold text-red-400 font-mono">
                    {ueSteamKpisAbsent
                      ? "N/A"
                      : formatSteamUsdPerYear(ueSteamKpis.totalAnnualCost)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Sum of displayed trap waste in the selected {timeRange}{" "}
                    window
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Critical Fault Traps
                  </p>
                  <p className="text-2xl font-bold text-orange-400 font-mono">
                    {ueSteamKpisAbsent ? "N/A" : ueSteamKpis.criticalCount}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {ueSteamKpisAbsent
                      ? "N/A"
                      : `${ueSteamKpis.blownCount} Blown-Through • ${ueSteamKpis.blockedCount} Blocked`}
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Avg Repair Payback
                  </p>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    {ueSteamKpisAbsent
                      ? "N/A"
                      : ueSteamKpis.avgPaybackDays != null
                        ? `${ueSteamKpis.avgPaybackDays} days`
                        : "N/A - System Healthy"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Mean ROI days across active failing traps — hardcoded
                    replacement-cost assumption, not a stored repair estimate
                  </p>
                </div>
              </div>

              <div className={`${CARD} mb-6 overflow-x-auto`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Steam Trap Inventory
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Priority fusion matrix ·{" "}
                    {ueSteamThermalLinkedCount > 0
                      ? `${ueSteamThermalLinkedCount} trap${
                          ueSteamThermalLinkedCount === 1 ? "" : "s"
                        } with stored per-scan ΔT`
                      : "no stored per-trap ΔT — acoustic priority only"}
                  </p>
                </div>
                {ueSteamInventoryRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                    <div className="w-12 h-12 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-4">
                      <Droplets className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-semibold text-slate-200 max-w-lg">
                      {!hasUeSteamScans
                        ? "No stored ultrasound steam-trap scans for this asset. Run an ultrasound scan in Valves & Steam Traps mode (mode = steam_trap) to populate this inventory."
                        : `No steam-trap scans in the selected ${timeRange} window.`}
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
                                ? `ΔT ${formatSteamDelta(
                                    row.tempDrop,
                                    steamDeltaUnit
                                  )}`
                                : "ΔT N/A (no stored per-trap temps)"}
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
                            {formatSteamUsdPerYear(
                              safeFinite(row.annualCostUsd, 0)
                            )}
                          </td>
                          <td className="py-2.5 pr-3 font-mono">
                            {row.roiPaybackDays != null ? (
                              <span title={STEAM_PAYBACK_BASIS_TEXT}>
                                {row.roiPaybackDays} days
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            <button
                              type="button"
                              onClick={() => {
                                // LEGAL-WRAPPER-A (E3/E7) — the cost-bearing
                                // work order is the highest-risk artifact: it
                                // is confirmed before it fires.
                                if (!confirmArtifactExport("Generate work order")) return;
                                stageWorkOrderPrefill({
                                  assetTag:
                                    selectedAsset?.tag ||
                                    row.assetId ||
                                    "steam-trap",
                                  assetName: selectedAsset?.name,
                                  component: `${row.trapId} (${row.trapType})`,
                                  zone: null,
                                  action: row.action,
                                  recommendation: row.status,
                                  modality: "ultrasound",
                                  modalityLabel: "Ultrasound / Steam Trap",
                                  trackedMetric: "Peak acoustic level",
                                  unit: "dBµV",
                                  sourceLabel: "Ultrasound Steam Trap Analyzer",
                                  contextLines: [
                                    `Trap status: ${row.status}.`,
                                    `Peak acoustic level: ${safeFinite(
                                      row.peakDb,
                                      0
                                    ).toFixed(1)} dBµV.`,
                                    `Supply pressure: ${safeFinite(
                                      row.pressurePsig,
                                      0
                                    )} psig.`,
                                    row.upstreamTemp != null &&
                                    row.downstreamTemp != null
                                      ? `Stored per-scan ΔT: ${formatSteamDelta(
                                          row.tempDrop ?? 0,
                                          steamDeltaUnit
                                        )}.`
                                      : "No stored per-trap ΔT — acoustic priority only.",
                                    `Modeled annual steam waste: ${formatSteamUsdPerYear(
                                      safeFinite(row.annualCostUsd, 0)
                                    )}. ${STEAM_BASIS_TEXT}`,
                                    row.roiPaybackDays != null
                                      ? `Modeled payback: ${
                                          row.roiPaybackDays
                                        } days. ${STEAM_PAYBACK_BASIS_TEXT}`
                                      : "Payback not modeled."
                                  ]
                                });
                                navigateToTab("calendar");
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
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2 items-center">
                    <span className="text-xs text-slate-400 font-semibold">
                      Conductor material
                    </span>
                    <select
                      value={mcaWindingParams.conductorMaterial ?? "unknown"}
                      onChange={(e) => updateMcaWindingMaterial(e.target.value)}
                      className="sm:col-span-3 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none"
                    >
                      <option value="unknown">
                        Unknown — assumed copper if normalized (labelled)
                      </option>
                      <option value="copper">Copper (K = 234.5)</option>
                      <option value="aluminum">Aluminum (K = 228)</option>
                    </select>
                  </div>
                </div>
              )}

              <div className={`${CARD} mb-6 overflow-x-auto`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Phase Input / Summary Grid
                  </p>
                  <p
                    className="text-[10px] text-slate-500"
                    data-testid="mca-normalization-basis"
                  >
                    {mcaExtractLoaded
                      ? `PDF · ${formatMcaPdfLabel(mcaExtractFormat)}`
                      : mcaWindingParams.fromTelemetry
                        ? "From saved MCA telemetry"
                        : "Awaiting Data · upload PDF or use Manual Entry"}
                    {hasMcaWindingData
                      ? ` · ${mcaWindingResult.normalization.basis}`
                      : ""}
                    {mcaWindingParams.windingTempC != null
                      ? ` · winding temp ${convertAbsoluteTemperature(
                          mcaWindingParams.windingTempC,
                          "°C",
                          mcaWindingTempDisplayUnit
                        ).toFixed(1)}${mcaWindingTempDisplayUnit} (stored °C, formula °C-locked)`
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
                        {hasMcaWindingData && mcaWindingResult.metricData.R
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
                        {hasMcaWindingData && mcaWindingResult.metricData.L
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
                        {hasMcaWindingData && mcaWindingResult.metricData.Z
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
                        {hasMcaWindingData && mcaWindingResult.metricData.Fi
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
                        {hasMcaWindingData && mcaWindingResult.metricData.IF
                          ? `${mcaWindingResult.unbalanceIF.toFixed(2)}%`
                          : "---"}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-[10px] text-slate-500 mt-2">
                  {MCA_UNBALANCE_FORMULA}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Max Phase Unbalance
                  </p>
                  <p className="text-2xl font-bold text-cyan-400 font-mono">
                    {hasMcaWindingData
                      ? `${mcaWindingResult.maxUnbalance.toFixed(2)}%`
                      : "---"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {hasMcaWindingData
                      ? "Max of the stored R/L/Z/Fi/I-F unbalances"
                      : "Awaiting Data"}
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Phase L/Z Divergence (descriptive)
                  </p>
                  <p
                    className="text-2xl font-bold text-sky-400 font-mono"
                    data-testid="mca-lz-divergence"
                  >
                    {mcaWindingResult.phaseLZDivergencePct != null
                      ? `${mcaWindingResult.phaseLZDivergencePct.toFixed(2)}%`
                      : "---"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Descriptive only — not a fault verdict or severity score.
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Indicative Thermal &amp; Life Proxy
                  </p>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    {hasMcaWindingData && mcaWindingResult.metricData.R
                      ? `+${mcaWindingResult.extraTempRiseC.toFixed(1)} °C`
                      : "---"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    R-unbalance proxy — not NEMA MG-1 compliance. Insulation life
                    remaining{" "}
                    <span className="text-slate-300 font-semibold">
                      {hasMcaWindingData && mcaWindingResult.metricData.R
                        ? `${mcaWindingResult.remainingLifePercent.toFixed(1)}%`
                        : "N/A"}
                    </span>
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Indicative Health Index
                  </p>
                  <p className="text-2xl font-bold text-emerald-400 font-mono">
                    {hasMcaWindingData && mcaWindingResult.metricData.R
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
                    {hasMcaWindingData && mcaWindingResult.metricData.R
                      ? ` · indicative derate proxy ${mcaWindingResult.nemaDeratingFactor.toFixed(3)}`
                      : ""}
                  </p>
                </div>
              </div>

              <div className={`${CARD} mb-6`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Phase Unbalance Classification (descriptive)
                </p>
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-bold tracking-wide ${
                      hasMcaWindingData
                        ? mcaFaultBadgeClass(mcaWindingResult.severity)
                        : "bg-slate-800/80 border-slate-700 text-slate-400"
                    }`}
                    data-testid="mca-unbalance-bracket"
                  >
                    {hasMcaWindingData && mcaWindingBracket
                      ? mcaWindingBracket.clazz
                      : "Awaiting Data"}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 pt-1">
                    {hasMcaWindingData ? mcaWindingResult.fault : "---"}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  Source: {MCA_IMBALANCE_SOURCE}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  {MCA_LZ_DIVERGENCE_SOURCE}
                </p>
                <p className="text-sm text-slate-300 mt-3 leading-relaxed">
                  <span className="text-slate-500 text-xs font-bold uppercase tracking-wider mr-2">
                    Suggested next check
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
                      {mcaGwResult.dataQuality.valid &&
                      mcaGwSnapshot.reportPi != null
                        ? ` · PI ${mcaGwSnapshot.reportPi}`
                        : ""}
                      {mcaGwResult.dataQuality.valid &&
                      mcaGwSnapshot.reportDar != null
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

              {hasMcaGwData && !mcaGwResult.dataQuality.valid && (
                <div
                  data-testid="mca-gw-data-quality-warning"
                  className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3"
                >
                  <p className="text-sm font-semibold text-amber-200">
                    IR sequence non-monotonic — data-quality warning
                  </p>
                  <p className="text-xs text-amber-100/80 mt-1">
                    Readings inconsistent with dielectric absorption. Verify
                    30s / 1m / 10m entry order before trusting PI / DAR / fault.
                  </p>
                  <p className="text-xs text-amber-100/70 mt-1 font-mono">
                    Raw IR: 15s {mcaFmtCell(mcaGwSnapshot.ir15sMOmega, 1)} · 30s{" "}
                    {mcaFmtCell(mcaGwSnapshot.ir30sMOmega, 1)} · 1m{" "}
                    {mcaFmtCell(mcaGwSnapshot.ir1mMOmega, 1)} · 10m{" "}
                    {mcaFmtCell(mcaGwSnapshot.ir10mMOmega, 1)} MΩ
                  </p>
                  <ul className="mt-1 text-[11px] text-amber-100/70 list-disc list-inside">
                    {mcaGwResult.dataQuality.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-amber-200/70 mt-1">
                    PI, DAR, leakage, and the IEEE 43 energize verdict are
                    suppressed. The motor is not condemned from a physically
                    invalid test.
                  </p>
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
                      value={mcaGwSnapshot.insulationClass ?? ""}
                      onChange={(e) =>
                        updateMcaGwField("insulationClass", e.target.value)
                      }
                      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                    >
                      <option value="">
                        Not stored — Class F assumed for PI minimum
                      </option>
                      <option value="A">Class A (PI ≥ 1.5)</option>
                      <option value="B">Class B (PI ≥ 2.0)</option>
                      <option value="F">Class F (PI ≥ 2.0)</option>
                      <option value="H">Class H (PI ≥ 2.0)</option>
                    </select>
                  </label>
                </div>
                <p className="text-[10px] text-slate-500 mt-3">
                  {hasMcaGwData
                    ? mcaGwResult.tempCorrected
                      ? `IEEE 43-2013 · kT = ${mcaGwResult.kT.toFixed(3)} · IR corrected to 40°C baseline`
                      : "IEEE 43-2013 · IR shown uncorrected (no winding temp recorded, kt=1)"
                    : "IEEE 43-2013 · Awaiting IR data"}
                  {mcaGwResult.dataQuality.valid &&
                  mcaGwSnapshot.reportPi != null
                    ? ` · Report PI ${mcaGwSnapshot.reportPi}`
                    : ""}
                  {mcaGwResult.dataQuality.valid &&
                  mcaGwSnapshot.reportDar != null
                    ? ` · Report DAR ${mcaGwSnapshot.reportDar}`
                    : ""}
                </p>
              </div>

              {mcaGwVoltageGuard.applicable && (
                <div
                  data-testid="mca-gw-voltage-guard"
                  className={`mb-6 rounded-xl border px-4 py-3 ${
                    mcaGwVoltageGuard.overVoltage
                      ? "border-red-500/40 bg-red-500/10"
                      : "border-slate-700 bg-slate-900/60"
                  }`}
                >
                  <p
                    className={`text-sm font-semibold ${
                      mcaGwVoltageGuard.overVoltage
                        ? "text-red-200"
                        : "text-slate-200"
                    }`}
                  >
                    IEEE 43 test-voltage ceiling{" "}
                    {mcaGwVoltageGuard.overVoltage ? "exceeded" : "check"}
                  </p>
                  <p
                    className={`text-xs mt-1 ${
                      mcaGwVoltageGuard.overVoltage
                        ? "text-red-100/80"
                        : "text-slate-400"
                    }`}
                  >
                    {mcaGwVoltageGuard.message}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {mcaGwVoltageGuard.provenance}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    {mcaGwResult.tempCorrected
                      ? "IR @ 40°C Baseline"
                      : "IR (raw, uncorrected)"}
                  </p>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    {hasMcaGwData
                      ? `${mcaGwResult.ir40MOmega.toFixed(1)} MΩ`
                      : "---"}
                  </p>
                  {hasMcaGwData ? (
                    mcaGwResult.irIeeePass != null &&
                    mcaGwResult.irIeeeMinMOmega != null ? (
                      <span
                        data-testid="mca-gw-threshold-badge"
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
                      <span
                        data-testid="mca-gw-threshold-badge"
                        className="mt-2 inline-flex px-2 py-0.5 rounded border text-[10px] font-bold tracking-wide bg-slate-800/80 border-slate-700 text-slate-400"
                      >
                        {mcaGwResult.dataQuality.valid
                          ? "No IEEE 43 verdict — nameplate voltage not stored"
                          : "IEEE 43 verdict withheld — IR data quality"}
                      </span>
                    )
                  ) : (
                    <p className="text-xs text-slate-500 mt-2">Awaiting Data</p>
                  )}
                  {hasMcaGwData && !mcaGwResult.tempCorrected && (
                    <p
                      data-testid="mca-gw-temp-basis"
                      className="text-[10px] text-slate-500 mt-2"
                    >
                      IR shown uncorrected (no winding temp recorded, kt=1)
                    </p>
                  )}
                  {hasMcaGwData && (
                    <p
                      data-testid="mca-gw-threshold-provenance"
                      className="text-[10px] text-slate-500 mt-1"
                    >
                      {mcaGwResult.irIeeeMinProvenance}
                    </p>
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
                      ? !mcaGwResult.dataQuality.valid
                        ? "Suppressed — IR data quality"
                        : `${mcaGwResult.piStatus}${
                            mcaGwResult.pi != null
                              ? ` · min ${mcaGwResult.piIeeeMin}${
                                  mcaGwResult.insulationClassAssumed
                                    ? " (no class stored — F assumed)"
                                    : ""
                                }`
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
                    {hasMcaGwData
                      ? !mcaGwResult.dataQuality.valid
                        ? "Suppressed — IR data quality"
                        : mcaGwResult.darStatus
                      : "Awaiting Data"}
                  </p>
                </div>
                <div className={CARD}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Leakage Current
                  </p>
                  <p
                    data-testid="mca-gw-leakage-value"
                    className="text-2xl font-bold text-amber-400 font-mono"
                  >
                    {hasMcaGwData &&
                    mcaGwResult.dataQuality.valid &&
                    mcaGwSnapshot.testVoltageV > 0
                      ? `${mcaGwResult.leakageCurrentUA.toFixed(2)} μA`
                      : "---"}
                  </p>
                  <p
                    data-testid="mca-gw-leakage-caveat"
                    className="text-xs text-slate-500 mt-1"
                  >
                    {hasMcaGwData
                      ? !mcaGwResult.dataQuality.valid
                        ? "Suppressed by data-quality gate — derived from the same suspect 1m IR (V/R)"
                        : mcaGwSnapshot.testVoltageV > 0
                          ? `Derived from 1m IR (V/R) @ ${mcaGwSnapshot.testVoltageV} V DC — not an independent leakage measurement`
                          : "Derived from 1m IR (V/R) — requires a test voltage"
                      : "Awaiting Data · derived from 1m IR (V/R)"}
                  </p>
                </div>
              </div>

              <details
                data-testid="mca-gw-kt-drawer"
                className={`${CARD} mb-6`}
              >
                <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  kt correction audit — IEEE 43 temperature correction
                </summary>
                <div className="mt-3 space-y-1 text-xs text-slate-300">
                  <p>
                    Formula: <code className="text-amber-300">R40 = kt × R_T</code>{" "}
                    with{" "}
                    <code className="text-amber-300">
                      kt = 0.5^((40 − T)/10)
                    </code>
                    .
                  </p>
                  <p>
                    kt used:{" "}
                    <span className="font-mono text-amber-300">
                      {mcaGwResult.kT.toFixed(3)}
                    </span>
                    {mcaGwResult.tempCorrected && mcaGwResult.windingTempC != null
                      ? ` · winding temp ${
                          Math.round(
                            convertAbsoluteTemperature(
                              mcaGwResult.windingTempC,
                              "°C",
                              mcaWindingTempDisplayUnit
                            ) * 10
                          ) / 10
                        } ${mcaWindingTempDisplayUnit}`
                      : " · no winding temp recorded — passthrough (uncorrected)"}
                  </p>
                  <p>
                    Temperature lock: the correction formula is °C-locked (no
                    display-unit conversion in the math); only the temperature
                    display follows the tenant U preference.
                  </p>
                  <p>
                    {mcaGwResult.tempCorrected
                      ? "R40 is the 40°C baseline reported above."
                      : "Missing-temperature rule: null temp is NOT coerced to 0°C (which would apply a bogus kt); IR is shown uncorrected with kt = 1."}
                  </p>
                </div>
              </details>

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
                {hasRicHistoricalBaseline && (
                  <button
                    type="button"
                    onClick={() => setRicCompareBaseline((v) => !v)}
                    aria-pressed={ricCompareBaseline}
                    data-testid="mca-ric-baseline-toggle"
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                      ricCompareBaseline
                        ? "bg-purple-500/15 border-purple-500 text-purple-300"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    Compare to Baseline
                  </button>
                )}
                {hasRicHistoricalBaseline && ricHistoricalBaseline && (
                  <span
                    data-testid="mca-ric-baseline-provenance"
                    className="text-[11px] text-slate-500"
                  >
                    Oldest stored RIC test
                    {ricHistoricalBaseline.timestamp
                      ? ` · ${new Date(
                          ricHistoricalBaseline.timestamp
                        ).toLocaleDateString()}`
                      : ""}
                  </span>
                )}
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
              <p
                data-testid="mca-ric-windowing-note"
                className="text-[11px] text-slate-500 mb-4"
              >
                Point-in-time rotor test — the toolbar window selects which
                stored test is in view, not a continuous trend. Values are shown
                in mH and degrees (no H² conversion).
              </p>

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
                      : hasRicHistoricalBaseline
                        ? "Enable Compare to Baseline"
                        : "No historical RIC baseline stored"}
                  </p>
                </div>
              </div>

              {hasRicData &&
                (ricResult!.inductanceRatio != null ||
                  ricResult!.spatialSecondHarmonic != null) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    {ricResult!.inductanceRatio != null && (
                      <div className={CARD} data-testid="mca-ric-inductance-ratio">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                          Lmax/Lmin Inductance Ratio
                        </p>
                        <p className="text-2xl font-bold text-purple-400 font-mono">
                          {ricResult!.inductanceRatio.ratio.toFixed(2)}×
                        </p>
                        <p className="text-xs text-slate-500 mt-1 font-mono">
                          Lmax {ricResult!.inductanceRatio.max.toFixed(3)} mH ·
                          Lmin {ricResult!.inductanceRatio.min.toFixed(3)} mH
                        </p>
                        <p
                          data-testid="mca-ric-ratio-source"
                          className="text-[11px] text-slate-500 mt-2"
                        >
                          {MCA_RIC_RATIO_SOURCE}
                        </p>
                      </div>
                    )}
                    {ricResult!.spatialSecondHarmonic != null && (
                      <div className={CARD} data-testid="mca-ric-spatial-fft">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                          Spatial FFT (2nd harmonic)
                        </p>
                        <p className="text-sm font-bold text-purple-300 font-mono">
                          L12 {ricResult!.spatialSecondHarmonic.l12.toFixed(3)} mH
                          · L23{" "}
                          {ricResult!.spatialSecondHarmonic.l23.toFixed(3)} mH ·
                          L31{" "}
                          {ricResult!.spatialSecondHarmonic.l31.toFixed(3)} mH
                        </p>
                        <p
                          data-testid="mca-ric-spatial-fft-source"
                          className="text-[11px] text-slate-500 mt-2"
                        >
                          {MCA_RIC_SPATIAL_FFT_SOURCE}
                        </p>
                      </div>
                    )}
                  </div>
                )}

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
                {hasRicData && (
                  <p
                    data-testid="mca-ric-threshold-provenance"
                    className="text-[11px] text-slate-500 mt-3 leading-relaxed"
                  >
                    {MCA_RIC_VARIATION_SOURCE}.
                  </p>
                )}
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
                        {ricCompareBaseline && hasRicHistoricalBaseline && (
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

              {surgeVoltageGuard.applicable && (
                <div
                  data-testid="mca-surge-voltage-guard"
                  className={`mb-6 rounded-xl border px-4 py-3 ${
                    surgeVoltageGuard.overVoltage
                      ? "border-red-500/40 bg-red-500/10"
                      : "border-slate-700 bg-slate-900/60"
                  }`}
                >
                  <p
                    className={`text-sm font-semibold ${
                      surgeVoltageGuard.overVoltage
                        ? "text-red-200"
                        : "text-slate-200"
                    }`}
                  >
                    IEEE 522 surge test-voltage ceiling{" "}
                    {surgeVoltageGuard.overVoltage ? "exceeded" : "check"}
                  </p>
                  <p
                    className={`text-xs mt-1 ${
                      surgeVoltageGuard.overVoltage
                        ? "text-red-100/80"
                        : "text-slate-400"
                    }`}
                  >
                    {surgeVoltageGuard.message}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {surgeVoltageGuard.provenance}
                  </p>
                </div>
              )}

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
                  {hasSurgeData && (
                    <p
                      data-testid="mca-surge-ear-source"
                      className="text-[10px] text-slate-500 mt-1"
                    >
                      {surgeResult!.severitySource}
                    </p>
                  )}
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

              {surgeDamping && (
                <div
                  data-testid="mca-surge-damping"
                  className={`${CARD} mb-6`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                    Damping — Log Decrement (δ per cycle)
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">
                        Mean δ
                      </p>
                      <p className="text-xl font-bold text-emerald-300 font-mono">
                        {surgeDamping.meanLogDecrement.toFixed(4)}
                      </p>
                    </div>
                    {surgeDamping.perPhase.map((phase) => (
                      <div key={phase.phase}>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">
                          {phase.phase.toUpperCase()}
                        </p>
                        <p className="text-sm font-semibold text-slate-200 font-mono">
                          {phase.logDecrement.toFixed(4)}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {phase.peakCount} peaks · {phase.cycles} cycles
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-3">
                    {surgeDamping.provenance}
                  </p>
                </div>
              )}

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
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-slate-700 pb-2">
            <div className="flex flex-wrap gap-2">
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
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={!analysisAssetQueryKey}
              onClick={() => setAddOilSampleOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-cyan-500/40 bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600/30 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Sample
            </button>
          </div>

          <AddOilSampleModal
            isOpen={addOilSampleOpen}
            onClose={() => setAddOilSampleOpen(false)}
            assetId={analysisAssetQueryKey ?? ""}
            onSampleSaved={() => setOilSampleRefreshKey((k) => k + 1)}
          />

          {activeOilSubTab === "wear_metals" ? (
            <OilWearMetalsTab
              assetId={analysisAssetQueryKey ?? ""}
              refreshKey={oilSampleRefreshKey}
            />
          ) : activeOilSubTab === "chemistry" ? (
            <OilFluidChemistryTab
              assetId={analysisAssetQueryKey ?? ""}
              refreshKey={oilSampleRefreshKey}
            />
          ) : activeOilSubTab === "cleanliness" ? (
            <OilCleanlinessTab
              assetId={analysisAssetQueryKey ?? ""}
              refreshKey={oilSampleRefreshKey}
            />
          ) : activeOilSubTab === "ferrography" ? (
            <OilFerrographyVarnishTab
              assetId={analysisAssetQueryKey ?? ""}
              refreshKey={oilSampleRefreshKey}
            />
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
          onClick={() => {
            // LEGAL-WRAPPER-A (E7/E9) — confirm, then carry the reused
            // disclaimer in the exported JSON's _meta.
            if (!confirmArtifactExport("Export trend report")) return;
            const reportData = {
              exported: new Date().toISOString(),
              _meta: { disclaimer: ARTIFACT_DISCLAIMER }
            };
            const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `trend-report-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="inline-flex items-center gap-2 border border-slate-700 text-white hover:bg-slate-800 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors"
        >
          <FileText className="h-4 w-4" />
          Export PDF Report
        </button>
        <button
          type="button"
          onClick={() => {
            // LEGAL-WRAPPER-A (E7) — confirm before the file leaves the app.
            if (!confirmArtifactExport("Export CSV")) return;
            const csvData = "Sample CSV export data";
            const blob = new Blob([csvData], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `trend-export-${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="inline-flex items-center gap-2 border border-slate-700 text-white hover:bg-slate-800 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
        <button
          type="button"
          onClick={() => {
            // LEGAL-WRAPPER-A (E7) — confirm before the report is shared.
            if (!confirmArtifactExport("Email trend report")) return;
            const mailtoLink = `mailto:?subject=Trend%20Report&body=Trend%20analysis%20report%20attached`;
            window.open(mailtoLink);
          }}
          className="inline-flex items-center gap-2 border border-slate-700 text-white hover:bg-slate-800 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors"
        >
          <Mail className="h-4 w-4" />
          Email Manager
        </button>
        <button
          type="button"
          onClick={() => {
            // LEGAL-WRAPPER-A (E7) — confirm before printing leaves the app.
            if (!confirmArtifactExport("Print trend report")) return;
            window.print();
          }}
          className="inline-flex items-center gap-2 border border-slate-700 text-white hover:bg-slate-800 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>
    </div>
  );
}
