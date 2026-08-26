import React, { useMemo, useState } from "react";
import { Check } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useDiagnosticsIntelligence } from "../lib/diagnostics/useDiagnosticsIntelligence";
import type { DiagnosisSignOff } from "../lib/diagnostics/signOff";
import { oilExceedances } from "../lib/diagnostics/sensorFusion";
import { classifyFaultFamily, familiesCorroborate } from "../lib/diagnostics/faultFamily";
import {
  DEFAULT_ALARM_LIMITS,
  ISO_CLEANLINESS_TARGET,
  type OilSample,
  type WearMetalKey
} from "../types/oilAnalysis";
import { formatSampleDate } from "../lib/oilAnalysisMetrics";
import SensorFusionMatrix from "./diagnostics/SensorFusionMatrix";
import PrognosisPanel from "./diagnostics/PrognosisPanel";
import EngineerSignOff from "./diagnostics/EngineerSignOff";
import CmmsPayloadBridge from "./diagnostics/CmmsPayloadBridge";

/** Named financial constants (edit per site/fluid). */
const OIL_COST_PER_GAL = 30;          // USD/gal, ISO VG46 synthetic blend
const KIDNEY_LOOP_CART_RATE = 112.5;  // USD/hr offline filtration cart
const FLOW_RATE_GPH = 600;            // cart flow rating
const TURNOVERS_TARGET = 7;           // industry practice: 7 volume turnovers

interface DynamicOilMetrics {
  capacityGallons?: number | null;
  tanValue?: number | null;
}

interface OilFinancialsResult {
  fullSumpFormatted: string;
  kidneyCostFormatted: string;
  savingsFormatted: string;
  lifeImpactFormatted: string;
  sumpFootnote: string;
  lifeFootnote: string;
}

function calculateOilFinancials({ capacityGallons, tanValue }: DynamicOilMetrics): OilFinancialsResult {
  const hasCapacity = typeof capacityGallons === "number" && capacityGallons > 0;
  const hasTan = typeof tanValue === "number" && !isNaN(tanValue);

  const fullSumpReplacement = hasCapacity ? capacityGallons * OIL_COST_PER_GAL : null;
  const kidneyHours = hasCapacity ? Math.max(6, (capacityGallons * TURNOVERS_TARGET) / FLOW_RATE_GPH) : null;
  const kidneyCost = kidneyHours !== null ? kidneyHours * KIDNEY_LOOP_CART_RATE : null;
  const savings = fullSumpReplacement !== null && kidneyCost !== null ? fullSumpReplacement - kidneyCost : null;

  const sumpFootnote = hasCapacity
    ? `${capacityGallons} gal × $${OIL_COST_PER_GAL}/gal = $${fullSumpReplacement?.toLocaleString()}`
    : "Enter sump capacity to compute ROI";

  const lifeImpactPct = hasTan ? Math.min(50, Math.max(0, (tanValue - 2.0) * 14)) : null;
  const lifeFootnote = hasTan
    ? `Rule: -14% per 1.0 TAN above 2.0; TAN ${tanValue.toFixed(1)} → -${lifeImpactPct?.toFixed(1)}%`
    : "Awaiting TAN measurement";

  return {
    fullSumpFormatted: fullSumpReplacement !== null ? `$${fullSumpReplacement.toLocaleString()}` : "—",
    kidneyCostFormatted: kidneyCost !== null ? `$${kidneyCost.toLocaleString()}` : "—",
    savingsFormatted: savings !== null ? `$${savings.toLocaleString()}` : "—",
    lifeImpactFormatted: lifeImpactPct !== null ? `-${lifeImpactPct.toFixed(1)}%` : "—",
    sumpFootnote,
    lifeFootnote,
  };
}

/** One saved fault hypothesis from the diagnosis. */
export interface IdentifiedFault {
  title: string;
  confidencePercent?: number | null;
  severity?: string | null;
  description?: string | null;
}

const WEAR_METALS: { key: WearMetalKey; label: string }[] = [
  { key: "iron", label: "Fe" },
  { key: "copper", label: "Cu" },
  { key: "chromium", label: "Cr" },
  { key: "lead", label: "Pb" },
  { key: "aluminum", label: "Al" },
  { key: "silicon", label: "Si" }
];

const PANEL =
  "rounded-xl border border-white/10 bg-slate-950/40 p-4 min-w-0 flex flex-col";

/** Plot range for the contamination grid; ISO 4406 codes in practice sit here. */
const ISO_PLOT_MIN = 8;
const ISO_PLOT_MAX = 25;

function isoPercent(code: number): number {
  const span = ISO_PLOT_MAX - ISO_PLOT_MIN;
  return Math.max(0, Math.min(100, ((code - ISO_PLOT_MIN) / span) * 100));
}

/** ISO 4406 code of the latest sample, plotted against the cleanliness target. */
function IsoContaminationGrid({ sample }: { sample: OilSample | null }) {
  const iso =
    sample?.iso4um != null && sample.iso6um != null && sample.iso14um != null
      ? ([sample.iso4um, sample.iso6um, sample.iso14um] as const)
      : null;

  if (!iso) {
    return (
      <div className={`${PANEL} justify-center items-center text-center`}>
        <h4 className="text-sm font-bold text-white mb-2">
          ISO 4406:2021 Contamination Grid
        </h4>
        <p className="text-sm font-semibold text-slate-300">
          {sample ? "No ISO code in the latest sample" : "No oil sample on file"}
        </p>
        <p className="mt-2 max-w-xs text-xs leading-relaxed text-slate-500">
          A full 4/6/14 µm code is needed to place this sample on the grid.
        </p>
      </div>
    );
  }

  const over = iso.some((code, i) => code > ISO_CLEANLINESS_TARGET[i]);
  // x = 4 µm channel, y = 14 µm channel (inverted: dirtier plots higher).
  const left = isoPercent(iso[0]);
  const bottom = isoPercent(iso[2]);
  const targetLeft = isoPercent(ISO_CLEANLINESS_TARGET[0]);
  const targetBottom = isoPercent(ISO_CLEANLINESS_TARGET[2]);

  return (
    <div className={PANEL}>
      <h4 className="text-sm font-bold text-white mb-1">
        ISO 4406:2021 Contamination Grid
      </h4>
      <p className="text-[11px] text-slate-500 mb-3">
        Sampled {formatSampleDate(sample.sampleDate)} · codes {ISO_PLOT_MIN}–
        {ISO_PLOT_MAX} plotted
      </p>
      <div className="h-64 bg-slate-950 rounded-lg relative border border-slate-800 overflow-hidden">
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3" aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="border border-slate-800/80" />
          ))}
        </div>
        <span className="absolute left-2 bottom-2 text-[9px] text-slate-600 font-mono">
          4 µm code →
        </span>
        <span className="absolute left-2 top-2 text-[9px] text-slate-600 font-mono">
          ↑ 14 µm code
        </span>

        <div
          className="absolute h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-emerald-400"
          style={{ left: `${targetLeft}%`, bottom: `${targetBottom}%` }}
          title={`Target ISO ${ISO_CLEANLINESS_TARGET.join("/")}`}
        />
        <div
          className={`absolute h-4 w-4 -translate-x-1/2 translate-y-1/2 rounded-full ${
            over
              ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]"
              : "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]"
          }`}
          style={{ left: `${left}%`, bottom: `${bottom}%` }}
          title={`ISO ${iso.join("/")}`}
        />
      </div>
      <p
        className={`text-sm font-semibold mt-3 ${over ? "text-red-400" : "text-emerald-400"}`}
      >
        Current Code: {iso.join("/")} ({over ? "above" : "within"} target{" "}
        {ISO_CLEANLINESS_TARGET.join("/")})
      </p>
    </div>
  );
}

/**
 * Latest measured wear metals against their alarm limits. Snapshot only —
 * sample-over-sample history lives in Trend Analyzer by design.
 */
function WearMetalsSnapshot({ sample }: { sample: OilSample | null }) {
  const data = useMemo(() => {
    if (!sample) return [];
    return WEAR_METALS.filter((m) => sample[m.key] != null).map((m) => ({
      metal: m.label,
      measured: sample[m.key] as number,
      limit: DEFAULT_ALARM_LIMITS[m.key]
    }));
  }, [sample]);

  if (!sample || data.length === 0) {
    return (
      <div className={`${PANEL} justify-center items-center text-center`}>
        <h4 className="text-sm font-bold text-white mb-2">
          Latest Sample — Wear Metals vs Alarm Limits
        </h4>
        <p className="text-sm font-semibold text-slate-300">
          {sample ? "No wear metals in the latest sample" : "No oil sample on file"}
        </p>
        <p className="mt-2 max-w-xs text-xs leading-relaxed text-slate-500">
          {sample
            ? "The most recent sample was saved without any of Fe, Cu, Cr, Pb, Al or Si, so there is nothing to plot against alarm limits."
            : "Add a sample in Trend Analyzer to plot measured wear metals against their alarm limits."}
        </p>
      </div>
    );
  }

  const overLimit = data.filter((d) => d.measured > d.limit);

  return (
    <div className={PANEL}>
      <h4 className="text-sm font-bold text-white mb-1">
        Latest Sample — Wear Metals vs Alarm Limits
      </h4>
      <p className="text-[11px] text-slate-500 mb-3">
        Sampled {formatSampleDate(sample.sampleDate)}
        {sample.operatingHours != null
          ? ` · ${sample.operatingHours.toLocaleString()} operating hours`
          : ""}
      </p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
            barGap={2}
          >
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              unit=" ppm"
            />
            <YAxis
              type="category"
              dataKey="metal"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              width={34}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(148,163,184,0.08)" }}
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 8,
                fontSize: 12
              }}
              formatter={(value: number | string, name: string) => [
                `${value} ppm`,
                name === "measured" ? "Measured" : "Alarm limit"
              ]}
            />
            <Legend
              verticalAlign="bottom"
              wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 4 }}
              formatter={(name) => (name === "measured" ? "Measured" : "Alarm limit")}
            />
            <Bar dataKey="limit" fill="#334155" radius={[0, 3, 3, 0]} isAnimationActive={false} />
            <Bar dataKey="measured" fill="#eab308" radius={[0, 3, 3, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p
        className={`mt-3 text-sm font-semibold ${
          overLimit.length > 0 ? "text-red-400" : "text-emerald-400"
        }`}
      >
        {overLimit.length > 0
          ? `Over limit: ${overLimit.map((d) => `${d.metal} ${d.measured}/${d.limit} ppm`).join(", ")}`
          : "All measured wear metals within alarm limits"}
      </p>
    </div>
  );
}

const ACTION_ITEMS = [
  "Change out system filter element immediately; upgrade to a high-efficiency 3-micron absolute (β₃ ≥ 1000) element to aggressively target the 4μm and 6μm particle spikes.",
  "Inspect and replace saturated desiccant breather cap.",
  "Perform offline kidney-loop filtration to reduce ISO code.",
  "Resample fluid in 250 operating hours to verify particle reduction."
];

const BOM_PARTS = [
  "High-Efficiency Filter Element: Beta 3 ≥ 1000 Absolute Micro-Glass Element",
  "Desiccant Breather Cap: Z-134 Desiccant Breather with Phase-Inversion Color Indicator"
];

function StaticActionBar({
  onNewAnalysis,
  onExportPdf,
  onManagerReport,
  position
}: {
  onNewAnalysis: () => void;
  onExportPdf: () => void;
  onManagerReport: () => void;
  position: "top" | "bottom";
}) {
  return (
    <div
      className={`flex justify-between items-center py-4 border-slate-800 gap-3 flex-wrap ${
        position === "top" ? "mb-6 border-b" : "mt-6 border-t"
      }`}
    >
      <button
        type="button"
        onClick={onNewAnalysis}
        className="text-slate-400 hover:text-white text-sm font-medium flex items-center gap-2 cursor-pointer bg-transparent border-0"
      >
        ← Run New Analysis
      </button>
      <div className="flex gap-3 flex-wrap">
        <button
          type="button"
          onClick={onExportPdf}
          className="border border-slate-700 text-white hover:bg-slate-800 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors"
        >
          Export PDF
        </button>
        <button
          type="button"
          onClick={onManagerReport}
          className="border border-slate-700 text-white hover:bg-slate-800 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors"
        >
          Manager Report
        </button>
      </div>
    </div>
  );
}

export interface OilResultsDashboardProps {
  assetLabel: string;
  componentLabel?: string;
  onNewAnalysis: () => void;
  onSaveWorkOrder: () => void;
  onToast?: (message: string, type?: "success" | "info" | "warning" | "error") => void;
  /** Asset key used to look up saved records; matches the persistence key. */
  assetId: string;
  /** Short asset tag for CMMS payloads. */
  assetTag?: string;
  /** Active diagnosis text; empty when no analysis has been run. */
  primaryFault?: string;
  severity?: string | null;
  confidencePercent?: number | null;
  healthScore?: number | null;
  recommendations?: string[];
  /** Saved analysis_results id; null until the analysis is persisted. */
  savedAnalysisId?: string | null;
  /** Logged-in user, pre-fills the sign-off name field. */
  engineerName?: string;
  /** Saved fault hypotheses; root-cause cards render from these alone. */
  identifiedFaults?: IdentifiedFault[];
}

const NO_RECOMMENDATIONS: string[] = [];
const NO_FAULTS: IdentifiedFault[] = [];

export default function OilResultsDashboard({
  assetLabel,
  componentLabel,
  onNewAnalysis,
  onSaveWorkOrder,
  onToast,
  assetId,
  assetTag,
  primaryFault = "",
  severity = null,
  confidencePercent = null,
  healthScore = null,
  recommendations = NO_RECOMMENDATIONS,
  savedAnalysisId = null,
  engineerName,
  identifiedFaults = NO_FAULTS
}: OilResultsDashboardProps) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  // One fetch feeds the fusion matrix, the RUL panel and the CMMS payload.
  const {
    loading: intelLoading,
    error: intelError,
    fusion,
    prognosis,
    signOff,
    setSignOff,
    cmmsContext,
    latestOilSample
  } = useDiagnosticsIntelligence({
    assetId,
    assetTag: assetTag || assetLabel,
    component: componentLabel || "",
    primaryFault,
    severity,
    confidencePercent,
    healthScore,
    recommendations,
    savedAnalysisId
  });

  const dispatchWorkOrder = (_signOff: DiagnosisSignOff) => onSaveWorkOrder();

  const latestIsoCode =
    latestOilSample?.iso4um != null &&
    latestOilSample.iso6um != null &&
    latestOilSample.iso14um != null
      ? `${latestOilSample.iso4um}/${latestOilSample.iso6um}/${latestOilSample.iso14um}`
      : null;

  // The exact strings the fusion matrix quotes, so the two can never disagree.
  const exceedances = useMemo(
    () => (latestOilSample ? oilExceedances(latestOilSample) : []),
    [latestOilSample]
  );

  /**
   * Confidence priority: a stored per-fault figure wins; failing that, only the
   * primary hypothesis may inherit the fusion aggregate; otherwise we say the
   * cross-validation is pending rather than printing a bare number.
   */
  const hypotheses = useMemo(
    () =>
      identifiedFaults.map((fault, index) => {
        const stored =
          typeof fault.confidencePercent === "number" &&
          Number.isFinite(fault.confidencePercent)
            ? Math.round(fault.confidencePercent)
            : null;

        let confidenceLabel: string;
        let confidenceKind: "ai" | "fusion" | "none";
        if (stored != null) {
          confidenceLabel = `${stored}% AI confidence`;
          confidenceKind = "ai";
        } else if (index === 0 && fusion.aggregate != null) {
          confidenceLabel = `${fusion.aggregate}% Multi-domain confidence`;
          confidenceKind = "fusion";
        } else {
          confidenceLabel = "Cross-validation pending";
          confidenceKind = "none";
        }

        const family = classifyFaultFamily(fault.title);
        const evidence = exceedances
          .filter((e) => familiesCorroborate(e.family, family))
          .map((e) => e.text);

        return {
          title: fault.title,
          confidenceLabel,
          confidenceKind,
          evidence,
          rationale: fault.description?.trim() || null
        };
      }),
    [identifiedFaults, fusion.aggregate, exceedances]
  );

  const toggleCheck = (i: number) => {
    setChecked((prev) => ({ ...prev, [i]: !prev[i] }));
  };

  const handleExportPdf = () => {
    const reportData = { type: "oil_analysis_pdf", timestamp: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Oil-Analysis-Report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onToast?.("Oil Analysis PDF report export initiated", "info");
  };

  const handleManagerReport = () => {
    const reportData = { type: "oil_manager_summary", timestamp: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Oil-Manager-Summary-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onToast?.("Manager summary export initiated", "info");
  };

  return (
    <div className="relative space-y-6" style={{ animation: "techParamFade 0.35s ease-out" }}>
      <StaticActionBar
        position="top"
        onNewAnalysis={onNewAnalysis}
        onExportPdf={handleExportPdf}
        onManagerReport={handleManagerReport}
      />

      {/* Header */}
      <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">
          Oil Analysis Results
        </p>
        <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">
          {assetLabel}
          {componentLabel ? ` · ${componentLabel}` : ""}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Proactive tribology · ISO 4406 · Wear metals → operational directives
        </p>
      </div>

      {intelError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          Could not load saved analysis records: {intelError}
        </div>
      )}

      {/* Sign-off sits with the asset title so its status is visible up front. */}
      <EngineerSignOff
        diagnosisId={savedAnalysisId}
        signOff={signOff}
        defaultEngineerName={engineerName}
        onSaved={setSignOff}
        onToast={onToast}
        onDispatchWorkOrder={dispatchWorkOrder}
      />

      {/* 1 — Wear Particle Matrix (snapshot only — trends live in Trend Analyzer) */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-5">Wear Particle Matrix Visuals</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          <IsoContaminationGrid sample={latestOilSample} />
          <WearMetalsSnapshot sample={latestOilSample} />
        </div>
      </section>

      {/* 2 — Cross-technology corroboration, ahead of the root-cause call */}
      {intelLoading ? (
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
          <p className="text-sm text-slate-400">
            Loading saved records for {assetTag || assetLabel}…
          </p>
        </section>
      ) : (
        <SensorFusionMatrix fusion={fusion} diagnosisLabel={primaryFault} />
      )}

      {/* 3 — Automated Root-Cause Analysis, from the saved diagnosis only */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-1">
          Automated Root-Cause Analysis
        </h3>
        <p className="text-sm text-slate-500 mb-5">
          Hypotheses as saved with the diagnosis, evidenced against the latest
          oil sample
        </p>

        {hypotheses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {hypotheses.map((h) => (
              <div
                key={h.title}
                className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {h.title}
                  </p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded border ${
                      h.confidenceKind === "none"
                        ? "bg-slate-500/10 text-slate-400 border-slate-500/30"
                        : "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
                    }`}
                  >
                    {h.confidenceLabel}
                  </span>
                </div>

                {h.evidence.length > 0 ? (
                  <ul className="space-y-1">
                    {h.evidence.map((line) => (
                      <li
                        key={line}
                        className="text-[11px] text-slate-400 leading-relaxed font-mono"
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    No oil-sample exceedance links to this hypothesis.
                  </p>
                )}

                {h.rationale && (
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {h.rationale}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center">
            <p className="text-sm font-semibold text-slate-300">
              No saved fault hypotheses for this asset
            </p>
            <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-500">
              Root-cause cards are rendered from the diagnosis record; none has
              been saved yet, so nothing is inferred here.
              {exceedances.length > 0 &&
                " The latest oil sample does show measured exceedances:"}
            </p>
            {exceedances.length > 0 && (
              <ul className="mx-auto mt-3 max-w-lg space-y-1 text-left">
                {exceedances.map((e) => (
                  <li key={e.text} className="font-mono text-[11px] text-slate-400">
                    {e.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* 4 — Financial Sump Optimization */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-5">Financial Sump Optimization</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Oil Life Extension ROI
            </p>
            {(() => {
              // OilSample doesn't have capacityGallons; will fall back to "—" when unavailable
              const capacity = null as number | null;
              const tan = latestOilSample?.acidNumber ?? null;
              const { fullSumpFormatted, kidneyCostFormatted, savingsFormatted, sumpFootnote } = calculateOilFinancials({ capacityGallons: capacity, tanValue: tan });
              const kidneyHours = capacity ? Math.max(6, (capacity * TURNOVERS_TARGET) / FLOW_RATE_GPH) : null;

              return (
                <>
                  <div className="rounded-xl border-2 border-red-500/50 bg-red-500/5 p-5">
                    <p className="text-sm text-slate-400">Full Sump Replacement{capacity ? ` (${capacity} gal)` : ""}</p>
                    <p className="text-3xl font-black text-red-400 tracking-tight">{fullSumpFormatted}</p>
                    {capacity && <p className="text-[11px] text-slate-500 mt-1">{sumpFootnote}</p>}
                  </div>
                  <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5 p-5">
                    <p className="text-sm text-slate-400">
                      Kidney-Loop Filtration ({kidneyHours ? `${kidneyHours.toFixed(1)}` : "6"} hours minimum - {TURNOVERS_TARGET} volume turnovers)
                    </p>
                    <p className="text-3xl font-black text-emerald-400 tracking-tight">{kidneyCostFormatted}</p>
                    {capacity && <p className="text-[11px] text-slate-500 mt-2">{sumpFootnote}</p>}
                  </div>
                  <p className="text-sm text-slate-300">
                    Action Advised:{" "}
                    <span className="text-yellow-400 font-bold">Filter Sump</span>. Potential Savings:{" "}
                    <span className="text-emerald-400 font-bold">{savingsFormatted}</span>.
                  </p>
                </>
              );
            })()}
          </div>

          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 flex flex-col justify-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/80">
              Asset Life Impact
            </p>
            {(() => {
              const tan = latestOilSample?.acidNumber ?? null;
              const { lifeImpactFormatted, lifeFootnote } = calculateOilFinancials({ capacityGallons: null, tanValue: tan });
              return (
                <>
                  <p className="text-4xl sm:text-5xl font-black text-red-400 tracking-tight">{lifeImpactFormatted}</p>
                  <p className="text-sm text-slate-400">{tan !== null ? `TAN ${tan.toFixed(1)}: ${lifeFootnote}` : lifeFootnote}</p>
                </>
              );
            })()}
          </div>
        </div>
      </section>

      {/* 5 — Computed prognosis, directly below the financial case */}
      {!intelLoading && <PrognosisPanel prognosis={prognosis} />}

      {/* 6 — Field Technician Action Plan */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-2">Field Technician Action Plan</h3>
        <p className="text-sm text-slate-500 mb-5">
          Clear remediation steps — check off as completed in the field
        </p>
        <ul className="space-y-3 max-w-2xl">
          {ACTION_ITEMS.map((item, i) => {
            const on = !!checked[i];
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => toggleCheck(i)}
                  className={`w-full flex items-start gap-3 text-left rounded-xl border px-4 py-3.5 cursor-pointer transition-all ${
                    on
                      ? "border-yellow-500/50 bg-yellow-500/10"
                      : "border-white/10 bg-slate-950/50 hover:border-yellow-500/30"
                  }`}
                >
                  <span
                    className={`mt-0.5 h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      on
                        ? "bg-yellow-500 border-yellow-500 text-slate-900"
                        : "border-slate-600 bg-slate-950"
                    }`}
                  >
                    {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-yellow-500/80 uppercase tracking-wider">
                      Step {i + 1}
                    </span>
                    <p
                      className={`text-sm font-medium mt-0.5 ${
                        on ? "text-slate-400 line-through" : "text-slate-200"
                      }`}
                    >
                      {item}
                    </p>
                    {i === 0 && latestIsoCode && (
                      <p className="mt-2 text-xs text-red-400 font-medium leading-relaxed">
                        ⚠️ A standard 10-micron nominal filter cannot capture the microscopic
                        particles causing this ISO {latestIsoCode} contamination.
                      </p>
                    )}
                  </span>
                </button>
                {i === 3 && (
                    <button
                      type="button"
                      disabled
                      title="Label printer endpoint not connected — label printer endpoint not connected"
                      className="mt-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 px-3 py-1.5 rounded border border-slate-700/30 flex items-center gap-2 cursor-not-allowed transition-colors"
                    >
                      🧪 Pre-Print Sample Label & Order Kit
                    </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* 7 — AI Procurement & BOM */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white">AI Procurement &amp; Bill of Materials (BOM)</h3>
        <p className="text-sm text-slate-500 mt-0.5 mb-5">
          Auto-matched to P-101A System Housing Specs
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Required Parts
            </p>
            <ul className="space-y-2.5">
              {BOM_PARTS.map((part) => (
                <li
                  key={part}
                  className="flex items-start gap-2 text-sm text-slate-300 leading-snug"
                >
                  <span className="mt-0.5 shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/40">
                    PART
                  </span>
                  <span>{part}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3 justify-center">
            <button
              type="button"
              disabled
              title="Procurement integration pending — purchase endpoint not connected"
              className="w-full bg-slate-800 border border-slate-700 text-slate-400 py-3 px-4 rounded-lg text-sm font-bold cursor-not-allowed transition-colors"
            >
              🛒 Purchase Maintenance Kit
            </button>
            <button
              type="button"
              disabled
              title="Stock room integration pending — stock room endpoint not connected"
              className="w-full border border-slate-700 text-slate-400 py-3 px-4 rounded-lg text-sm font-bold cursor-not-allowed transition-colors"
            >
              📦 Pull Parts from On-Site Stock Room
            </button>
          </div>
        </div>
      </section>

      {/*
        8 — CMMS bridge. Replaces the legacy Universal CMMS Data Bridge, whose
        oil payload was a fixed demo string; this one is built from the live
        diagnosis, prognosis and sign-off state.
      */}
      {!intelLoading && (
        <CmmsPayloadBridge context={cmmsContext} onToast={onToast} />
      )}

      <StaticActionBar
        position="bottom"
        onNewAnalysis={onNewAnalysis}
        onExportPdf={handleExportPdf}
        onManagerReport={handleManagerReport}
      />

    </div>
  );
}
