import React from "react";
import CmmsPayloadBridge from "./diagnostics/CmmsPayloadBridge";
import { useDiagnosticsIntelligence } from "../lib/diagnostics/useDiagnosticsIntelligence";
import {
  MCA_IR_CITATION,
  MCA_DEFAULT_SCORE_PROVENANCE,
  HEALTH_SCORE_DEFAULT_PROVENANCE,
  DIAGNOSE_NOT_RECORDED,
  DIAGNOSE_NOT_RECORDED_FOR_ASSET,
  DIAGNOSE_NORMALIZATION_NOT_APPLIED,
  DIAGNOSE_SAMPLE_DATASET
} from "../lib/maintenance/prescriptiveDictionary";

const NEUTRAL_BADGE_CLASS =
  "bg-slate-500/15 border-slate-500/40 text-slate-400";

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

export interface McaResultsDashboardProps {
  assetLabel: string;
  componentLabel?: string;
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
  /** AR-20d provenance: true when healthScore is default-derived, not measured. */
  healthScoreIsDefault?: boolean;
  /** Logged-in user, pre-fills the sign-off name field. */
  engineerName?: string;
  onNewAnalysis: () => void;
  onSaveWorkOrder: () => void;
  onToast?: (message: string, type?: "success" | "info" | "warning" | "error") => void;
}

const NO_RECOMMENDATIONS: string[] = [];

export default function McaResultsDashboard({
  assetLabel,
  componentLabel,
  assetId,
  assetTag,
  primaryFault = "",
  severity = null,
  confidencePercent = null,
  healthScore = null,
  healthScoreIsDefault = false,
  recommendations = NO_RECOMMENDATIONS,
  savedAnalysisId = null,
  engineerName,
  onNewAnalysis,
  onToast
}: McaResultsDashboardProps) {
  const motorHP: number | null = null;
  const recommendReplace = motorHP != null && motorHP < 100;

  // Load saved records for fusion, prognosis, sign-off and CMMS context
  const {
    loading: intelLoading,
    error: intelError,
    cmmsContext
  } = useDiagnosticsIntelligence({
    assetId,
    assetTag: assetTag || assetLabel,
    component: componentLabel || "",
    primaryFault,
    severity,
    confidencePercent,
    healthScore,
    healthScoreIsDefault,
    recommendations,
    savedAnalysisId
  });

  const handleExportPdf = () => {
    const reportData = { type: "mca_pdf_report", timestamp: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MCA-Report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onToast?.("MCA PDF report export initiated", "info");
  };

  const handleManagerReport = () => {
    const reportData = { type: "mca_manager_summary", timestamp: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MCA-Manager-Summary-${Date.now()}.json`;
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
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-yellow-400">
          MCA Analysis Results
        </p>
        <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">
          {assetLabel}
          {componentLabel ? ` · ${componentLabel}` : ""}
        </h2>
        <p className="text-sm text-slate-500 mt-1 break-words">
          Six Fault Zone analytics · IEEE 43 / NETA · Offline MCA ·{" "}
          {motorHP !== null
            ? `${motorHP} HP`
            : `motor HP ${DIAGNOSE_NOT_RECORDED_FOR_ASSET}`}
        </p>
        <p className="text-[11px] text-slate-600 mt-1 break-words">
          {MCA_IR_CITATION}
        </p>
      </div>

      {/* 1 — Motor Health Matrix (Spider Chart) */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <h3 className="text-lg font-bold text-white">
            Motor Health Matrix (Six Fault Zones)
          </h3>
          <span className="inline-flex rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300 break-words">
            {DIAGNOSE_SAMPLE_DATASET}
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4 min-w-0">
            <div className="h-80 w-full flex items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/40 px-4 text-center">
              <p className="text-xs text-slate-500">
                No fault zone data captured — run an MCA analysis to populate the health matrix.
              </p>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 text-center break-words">
              {MCA_DEFAULT_SCORE_PROVENANCE}
            </p>
            {/* AR-20d — in-memory provenance flag: default-derived scores are
                labelled beside the radar; measured runs render no caption. */}
            {healthScoreIsDefault && (
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400 mt-1 text-center break-words">
                {HEALTH_SCORE_DEFAULT_PROVENANCE}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4 space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Zone Status
            </p>
            <p className="text-xs text-slate-500 italic">
              No zone status recorded — zone scores appear after a measured MCA run.
            </p>
          </div>
        </div>
      </section>

      {/* 2 — Automated Fault Algorithms */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <h3 className="text-lg font-bold text-white">Automated Fault Algorithms</h3>
          <span className="inline-flex rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300 break-words">
            {DIAGNOSE_SAMPLE_DATASET}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Stator Winding Health
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed break-words">
              Logic: Impedance Imbalance &gt; 3% AND Phase Angle Deviation &gt; 2°
            </p>
            <p className="text-sm font-bold text-slate-400 break-words">
              {DIAGNOSE_NOT_RECORDED_FOR_ASSET}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Rotor Bar Integrity
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed break-words">
              Logic: Inductance variance during Dynamic Rotation test.
            </p>
            <p className="text-sm font-bold text-slate-400 break-words">
              {DIAGNOSE_NOT_RECORDED_FOR_ASSET}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Winding Contamination
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed break-words">
              Logic: Phase Angle stable, but IR &lt; 100 MΩ.
            </p>
            <p className="text-sm font-bold text-slate-400 break-words">
              {DIAGNOSE_NOT_RECORDED_FOR_ASSET}
            </p>
          </div>
        </div>
      </section>

      {/* 3 — Financial Impact */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <h3 className="text-lg font-bold text-white">
            Financial Impact &amp; Lifecycle Analysis
          </h3>
          <span className="inline-flex rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300 break-words">
            {DIAGNOSE_SAMPLE_DATASET}
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Repair vs. Replace
            </p>
            <div className="rounded-xl border-2 border-yellow-500/50 bg-yellow-500/5 p-5">
              <p className="text-sm text-slate-400">Est. Rewind Cost</p>
              <p className="text-3xl font-black text-yellow-400 tracking-tight break-words">
                {DIAGNOSE_NOT_RECORDED}
              </p>
            </div>
            <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5 p-5">
              <p className="text-sm text-slate-400">New Premium Efficient Motor</p>
              <p className="text-3xl font-black text-emerald-400 tracking-tight break-words">
                {DIAGNOSE_NOT_RECORDED}
              </p>
            </div>
            <div
              className={`rounded-xl border-2 p-4 ${
                recommendReplace
                  ? "border-red-500/50 bg-red-500/5"
                  : "border-yellow-500/50 bg-yellow-500/5"
              }`}
            >
              {motorHP == null ? (
                <p className="text-sm text-slate-200 break-words">
                  Recommend:{" "}
                  <span
                    className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${NEUTRAL_BADGE_CLASS}`}
                  >
                    {DIAGNOSE_NOT_RECORDED_FOR_ASSET}
                  </span>
                </p>
              ) : recommendReplace ? (
                <p className="text-sm text-slate-200 break-words">
                  Recommend:{" "}
                  <span className="text-red-400 font-bold">REPLACE</span> (Rewind labor costs
                  exceed asset value for &lt;100HP random-wound motors).
                </p>
              ) : (
                <p className="text-sm text-slate-200 break-words">
                  Recommend: <span className="text-yellow-400 font-bold">Rewind</span>.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5 flex flex-col justify-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-500/80">
              Resistive Imbalance Cost
            </p>
            <p className="text-4xl sm:text-5xl font-black text-yellow-400 tracking-tight break-words">
              {DIAGNOSE_NOT_RECORDED}
            </p>
            <p className="text-sm text-slate-400 break-words">
              {DIAGNOSE_NOT_RECORDED_FOR_ASSET}
            </p>
          </div>
        </div>
      </section>

      {/* 4 — AI Procurement & BOM */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <h3 className="text-lg font-bold text-white">AI Procurement &amp; Bill of Materials (BOM)</h3>
          <span className="inline-flex rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300 break-words">
            {DIAGNOSE_SAMPLE_DATASET}
          </span>
        </div>
        <p className="text-sm text-slate-500 mt-0.5 mb-5 break-words">
          {DIAGNOSE_NOT_RECORDED_FOR_ASSET} - nameplate NEMA Frame &amp; Stator Slots
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <p className="text-sm font-bold text-white">
              Required Action: Motor In-Shop Overhaul &amp; Rewind
            </p>
            <p className="text-xs text-slate-500 italic">
              No BOM configured — parts list is generated once a measured analysis defines the repair scope.
            </p>
          </div>
          <div className="flex flex-col gap-3 justify-center">
            <button
              type="button"
              disabled
              title="Procurement integration pending — order endpoint not connected"
              className="w-full bg-slate-800 border border-slate-700 text-slate-400 py-3 px-4 rounded-lg text-sm font-bold cursor-not-allowed transition-colors"
            >
              🛒 Order Overhaul Kit
            </button>
            <button
              type="button"
              disabled
              title="Rewind shop dispatch pending — rewind shop endpoint not connected"
              className="w-full border border-slate-700 bg-slate-800 text-slate-400 py-3 px-4 rounded-lg text-sm font-bold cursor-not-allowed transition-colors"
            >
              🔧 Dispatch to Approved Rewind Shop
            </button>
          </div>
        </div>
      </section>

      {/* 5 — Visual Verification */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <h3 className="text-lg font-bold text-white">
            Visual Verification (Trending &amp; Analytics)
          </h3>
          <span className="inline-flex rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300 break-words">
            {DIAGNOSE_SAMPLE_DATASET}
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4 min-w-0">
            <h4 className="text-sm font-bold text-white mb-3">
              Insulation Resistance / Stator Signature
            </h4>
            <div className="h-48 w-full flex items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/40 px-4 text-center">
              <p className="text-xs text-slate-500">No insulation or stator signature data captured — run a measured MCA analysis to populate this chart.</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4 min-w-0">
            <span className="inline-flex items-center gap-2 px-2 py-1 rounded text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 mb-2 break-words">
              🛡️ {DIAGNOSE_NORMALIZATION_NOT_APPLIED}
            </span>
            <h4 className="text-sm font-bold text-white mb-3">
              Historical Resistance Trend (3 Years)
            </h4>
            <div className="h-56 w-full flex items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/40 px-4 text-center">
              <p className="text-xs text-slate-500">
                No resistance trend captured — 3-phase historical readings appear after periodic measured runs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6 — CMMS Work Order Bridge (last content section) */}
      {!intelLoading && !intelError && (
        <CmmsPayloadBridge
          context={cmmsContext}
          sectionId="mca-cmms-data-bridge"
          onToast={onToast}
        />
      )}
      {intelError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          Could not load CMMS context: {intelError}
        </div>
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
