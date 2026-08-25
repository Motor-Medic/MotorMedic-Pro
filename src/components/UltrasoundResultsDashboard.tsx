import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  AudioWaveform,
  CheckCircle2,
  Pause,
  Play,
  Shield,
  XCircle
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import CmmsPayloadBridge from "./diagnostics/CmmsPayloadBridge";
import { useDiagnosticsIntelligence } from "../lib/diagnostics/useDiagnosticsIntelligence";
import type { VibrationAnalysisResult } from "../lib/consensusEngine";

const PLAYBACK_SPEEDS = [0.5, 1.0, 2.0] as const;
const EQ_FILTERS = ["Low Pass", "High Pass", "Band Pass"] as const;
const CMMS_CLIPBOARD_FORMATS = ["IBM Maximo", "SAP PM", "MaintainX"] as const;
const UE_DEMO_MODES = ["leak", "mechanical", "valve"] as const;

export type UltrasoundPeaksLite = {
  peak_dbmv: number;
  rms_dbmv: number;
  baseline_dbmv?: number;
  delta_db?: number;
  crest_factor?: number;
  mode?: string;
};

/** Sharp impact spikes — mechanical / bearing signature */
const TWF_IMPACT_DATA = Array.from({ length: 80 }, (_, i) => {
  const base = Math.sin(i / 6) * 0.4 + (Math.random() - 0.5) * 0.15;
  const spike =
    i === 12 || i === 28 || i === 44 || i === 60
      ? 4.2 + Math.random() * 0.8
      : i === 13 || i === 29 || i === 45 || i === 61
        ? 1.4
        : 0;
  return { t: i, amp: Math.round((base + spike) * 100) / 100 };
});

/** Broad hump — compressed-air leak spectral energy */
const FFT_LEAK_DATA = Array.from({ length: 60 }, (_, i) => {
  const center = 28;
  const dist = Math.abs(i - center);
  const hump = Math.max(0, 6.5 - dist * 0.35) + Math.sin(i / 3) * 0.2;
  const floor = 0.35 + (i % 5) * 0.02;
  return { hz: i * 0.8, amp: Math.round(Math.max(floor, hump) * 100) / 100 };
});

/** Live acoustic lube trend — dBµV drop during greasing (mock) */
const LUBE_TREND_DATA = Array.from({ length: 20 }, (_, i) => {
  const db = 44 - i * 1.15 + (i > 14 ? (i - 14) * 0.35 : 0) + Math.sin(i / 2) * 0.3;
  return { t: i, db: Math.round(Math.max(22, db) * 10) / 10 };
});

const LEAK_REMEDIATION_STEPS = [
  "Isolate compressed air line and depressurize system.",
  "Identify leak source (e.g., failed quick-connect coupler, cracked hose).",
  "Replace fitting with high-efficiency industrial interchange coupler.",
  "Re-scan with ultrasound detector to verify zero dBµV leakage."
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

export interface UltrasoundResultsDashboardProps {
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
  /** Logged-in user, pre-fills the sign-off name field. */
  engineerName?: string;
  analysis?: VibrationAnalysisResult | null;
  gaugeScore?: number;
  ultrasoundPeaks?: UltrasoundPeaksLite | null;
  onNewAnalysis: () => void;
  onSaveWorkOrder: () => void;
  onExportPdf?: () => void;
  onManagerReport?: () => void;
  onToast?: (message: string, type?: "success" | "info" | "warning" | "error") => void;
}

const NO_RECOMMENDATIONS: string[] = [];

export default function UltrasoundResultsDashboard({
  assetLabel,
  componentLabel,
  assetId,
  assetTag,
  primaryFault = "",
  severity = null,
  confidencePercent = null,
  healthScore = null,
  recommendations = NO_RECOMMENDATIONS,
  savedAnalysisId = null,
  engineerName,
  analysis,
  gaugeScore,
  ultrasoundPeaks,
  onNewAnalysis,
  onExportPdf,
  onManagerReport,
  onToast
}: UltrasoundResultsDashboardProps) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof PLAYBACK_SPEEDS)[number]>(1.0);
  const [eqFilter, setEqFilter] = useState<(typeof EQ_FILTERS)[number]>("Band Pass");
  const [lubeFeedback, setLubeFeedback] = useState<"yes" | "no" | "rising" | null>(null);
  const [greaseVerified, setGreaseVerified] = useState(false);
  const [ueResultMode, setUeResultMode] =
    useState<(typeof UE_DEMO_MODES)[number]>("leak");
  const [cmmsClipboardFormat, setCmmsClipboardFormat] =
    useState<(typeof CMMS_CLIPBOARD_FORMATS)[number]>("IBM Maximo");

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
    recommendations,
    savedAnalysisId
  });

  const baselineDb = ultrasoundPeaks?.baseline_dbmv ?? 28;
  const currentDb = ultrasoundPeaks?.peak_dbmv ?? 44;
  const deltaDb =
    ultrasoundPeaks?.delta_db ??
    Math.round((currentDb - baselineDb) * 10) / 10;
  const healthDisplay =
    gaugeScore != null
      ? gaugeScore
      : analysis?.overallHealthScore != null
        ? analysis.overallHealthScore
        : null;
  const primaryFaultTitle =
    analysis?.primaryFault?.title || analysis?.summary || null;

  const bearingBarPct = useMemo(
    () => Math.min(100, Math.round((currentDb / 60) * 100)),
    [currentDb]
  );

  return (
    <div className="relative space-y-6" style={{ animation: "techParamFade 0.35s ease-out" }}>
      <StaticActionBar
        position="top"
        onNewAnalysis={onNewAnalysis}
        onExportPdf={() =>
          onExportPdf
            ? onExportPdf()
            : onToast?.("Exporting ultrasound PDF report…", "info")
        }
        onManagerReport={() =>
          onManagerReport
            ? onManagerReport()
            : onToast?.("Generating manager executive report…", "info")
        }
      />

      {/* Header */}
      <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-400">
            Ultrasound Analysis Results
          </p>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">
            {assetLabel}
            {componentLabel ? ` · ${componentLabel}` : ""}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Psychoacoustic analytics · Heterodyne UE · ISO 29821
          </p>
          {(primaryFaultTitle || healthDisplay != null) && (
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              {healthDisplay != null && (
                <span className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-200">
                  Health:{" "}
                  <span className="font-bold text-yellow-400">{healthDisplay}</span>
                </span>
              )}
              {primaryFaultTitle && (
                <span className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-200">
                  Primary:{" "}
                  <span className="font-bold text-sky-400">{primaryFaultTitle}</span>
                </span>
              )}
              <span className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-200">
                Peak:{" "}
                <span className="font-mono text-cyan-400">{currentDb}</span> dBµV
                <span className="text-slate-500 mx-1">·</span>Δ{" "}
                <span className="font-mono text-amber-400">{deltaDb}</span> dB
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 1 — Acoustic Spectrum Visualizer */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <AudioWaveform className="h-5 w-5 text-cyan-400" />
            <div>
              <h3 className="text-lg font-bold text-white">Acoustic Spectrum Visualizer</h3>
              <p className="text-sm text-slate-500">Time domain impacts + frequency-domain energy</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPlaying((p) => !p);
                onToast?.(
                  playing ? "Playback paused (demo)." : "Playing heterodyned .WAV (demo).",
                  "info"
                );
              }}
              className="inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-lg bg-slate-950 border border-slate-700 hover:border-yellow-500/50 text-xs font-bold text-slate-200 cursor-pointer"
            >
              {playing ? (
                <Pause className="h-3.5 w-3.5 text-yellow-400" />
              ) : (
                <Play className="h-3.5 w-3.5 text-yellow-400" />
              )}
              {playing ? "Pause" : "Play"}
            </button>

            <div className="flex gap-1">
              {PLAYBACK_SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`min-h-[34px] px-2.5 rounded-md text-[10px] font-bold border cursor-pointer ${
                    speed === s
                      ? "bg-yellow-500 text-slate-900 border-yellow-500"
                      : "bg-slate-950 text-slate-400 border-slate-700 hover:border-yellow-500/50"
                  }`}
                >
                  {s.toFixed(1)}x
                </button>
              ))}
            </div>

            <div className="flex gap-1">
              {EQ_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setEqFilter(f)}
                  className={`min-h-[34px] px-2.5 rounded-md text-[10px] font-bold border cursor-pointer ${
                    eqFilter === f
                      ? "bg-yellow-500/15 text-yellow-300 border-yellow-500"
                      : "bg-slate-950 text-slate-400 border-slate-700 hover:border-yellow-500/50"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4 min-w-0">
            <h4 className="text-sm font-bold text-white mb-3">Time Waveform (TWF)</h4>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={TWF_IMPACT_DATA} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="t" hide />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    width={28}
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
                  />
                  <Line
                    type="monotone"
                    dataKey="amp"
                    stroke="#22d3ee"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Sharp vertical spikes indicate repetitive mechanical impacts (Stage 2 bearing).
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4 min-w-0">
            <h4 className="text-sm font-bold text-white mb-3">Frequency Spectrum (FFT)</h4>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={FFT_LEAK_DATA}
                  margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                >
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="hz" hide />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    width={40}
                    axisLine={false}
                    tickLine={false}
                    label={{
                      value: "dBμV",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#94a3b8"
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 8,
                      fontSize: 12
                    }}
                    labelFormatter={(v) => `${v} kHz`}
                    formatter={(value: number | string) => [`${value} dBμV`, "Amplitude"]}
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
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Broad spectral hump consistent with turbulent compressed-air leak energy.
            </p>
          </div>
        </div>
      </section>

      {/* 2 — Automated Fault Classification */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <h3 className="text-lg font-bold text-white">Automated Fault Classification</h3>
          <div className="flex flex-wrap gap-1.5">
            {UE_DEMO_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setUeResultMode(m)}
                className={`min-h-[30px] px-2.5 rounded-md text-[10px] font-bold border cursor-pointer capitalize ${
                  ueResultMode === m
                    ? "bg-yellow-500 text-slate-900 border-yellow-500"
                    : "bg-slate-950 text-slate-400 border-slate-700 hover:border-yellow-500/50"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ueResultMode === "mechanical" && (
            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3 md:col-span-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Bearing 4-Stage Health
              </p>
              <div className="flex items-end gap-3 h-24 max-w-md">
                <div className="flex-1 h-full flex flex-col justify-end gap-1">
                  <div className="text-[10px] text-slate-500 font-mono">
                    Baseline {baselineDb} dB
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-slate-500 rounded-full"
                      style={{ width: `${Math.round((baselineDb / 60) * 100)}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-orange-400 font-mono mt-1">
                    Current {currentDb} dB
                  </div>
                  <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-orange-500 rounded-full transition-all"
                      style={{ width: `${bearingBarPct}%` }}
                    />
                  </div>
                </div>
              </div>
              <p className="text-sm font-bold text-orange-400">+{deltaDb} dB over baseline</p>
              <p className="text-sm text-slate-300">
                Stage 2: Minor Damage{" "}
                <span className="text-orange-400 font-semibold">(Orange)</span>
              </p>
            </div>
          )}

          {ueResultMode === "leak" && (
            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3 md:col-span-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Leak Classification
              </p>
              <div className="h-10 w-10 rounded-xl bg-red-500/15 border border-red-500/40 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <p className="text-sm font-bold text-white">Turbulent Flow Detected</p>
              <p className="text-sm text-red-400 font-semibold">
                Compressed Air Leak (High Severity)
              </p>
              <p className="text-[11px] text-slate-500">
                Broadband UE signature + elevated RMS at 40 kHz heterodyne.
              </p>
            </div>
          )}

          {ueResultMode === "valve" && (
            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3 md:col-span-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Discharge / Trap State
              </p>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              </div>
              <p className="text-sm font-bold text-emerald-400">Normal</p>
              <p className="text-sm text-slate-300">
                No arcing / corona pattern. Steam trap cycle within expected band.
              </p>
              <p className="text-[11px] text-slate-500">
                Alternate mock: <span className="text-red-400 font-semibold">Failed Open</span>{" "}
                when continuous blow-by is detected.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 3 — Financial Impact (Leak mode only) */}
      {ueResultMode === "leak" && (
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
          <label className="block mb-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
              Target CMMS Clipboard Format
            </span>
            <select
              value={cmmsClipboardFormat}
              onChange={(e) =>
                setCmmsClipboardFormat(e.target.value as (typeof CMMS_CLIPBOARD_FORMATS)[number])
              }
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-yellow-500 outline-none"
            >
              {CMMS_CLIPBOARD_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <h3 className="text-lg font-bold text-white mb-5">
            Financial Impact &amp; Energy Waste
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                The Math
              </p>
              <p className="text-sm text-slate-300">
                Estimated Leak Size:{" "}
                <span className="text-white font-bold">1/8 inch equivalent orifice</span>
              </p>
              <p className="text-sm text-slate-300">
                System Pressure: <span className="text-white font-bold">100 PSI</span>
              </p>
              <p className="text-sm text-slate-300">
                Flow Rate Loss:{" "}
                <span className="text-cyan-400 font-bold">~38 CFM continuous</span>
              </p>
              <p className="text-[11px] text-slate-500">
                Clipboard format:{" "}
                <span className="text-cyan-400 font-semibold">{cmmsClipboardFormat}</span>
              </p>
            </div>

            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5 flex flex-col justify-center gap-2">
              <p className="text-sm text-slate-300">
                Annual Energy Waste:{" "}
                <span className="text-white font-bold">132,000 kWh</span>
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-500/80 mt-2">
                Total Annual Cost
              </p>
              <p className="text-4xl sm:text-5xl font-black text-yellow-400 tracking-tight">
                $15,840
              </p>
              <p className="text-sm text-slate-400">Based on $0.12/kWh and 24/7 operation.</p>
            </div>
          </div>
        </section>
      )}

      {/* 4a — Air Leak Remediation (Leak mode) */}
      {ueResultMode === "leak" && (
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-bold text-white mb-2">
            Air Leak Remediation &amp; Repair Protocol
          </h3>
          <p className="text-sm text-slate-500 mb-5">
            Field checklist — isolate, repair, and verify zero leakage
          </p>
          <ul className="space-y-3 max-w-2xl">
            {LEAK_REMEDIATION_STEPS.map((step, idx) => (
              <li
                key={step}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3.5"
              >
                <span className="mt-0.5 h-6 w-6 rounded-md bg-yellow-500 text-slate-900 text-xs font-black flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <p className="text-sm text-slate-200">{step}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 4b — Smart Lubrication Assistant (Mechanical mode only) */}
      {ueResultMode === "mechanical" && (
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white">Smart Lubrication Assistant</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                Field tablet workflow — grease while watching RMS dBµV in real time
              </p>
            </div>
            <button
              type="button"
              onClick={() => alert("Lubrication job plan copied to clipboard!")}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-cyan-400 flex items-center gap-1 border border-cyan-500/30 cursor-pointer transition-colors shrink-0"
            >
              📋 Copy Maintenance Action to CMMS
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/50 p-5 sm:p-6 space-y-4 max-w-2xl mt-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-500/90 mb-2">
                Live Acoustic Trend (dBµV)
              </p>
              <div className="h-24 w-full rounded-lg border border-white/5 bg-slate-950/80 px-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={LUBE_TREND_DATA}
                    margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="t" hide />
                    <YAxis
                      domain={["auto", "auto"]}
                      tick={{ fill: "#64748b", fontSize: 9 }}
                      width={28}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #334155",
                        borderRadius: 8,
                        fontSize: 11
                      }}
                      formatter={(value: number | string) => [`${value} dBµV`, "RMS"]}
                      labelFormatter={() => "Sample"}
                    />
                    <Line
                      type="monotone"
                      dataKey="db"
                      stroke="#eab308"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Watch the line drop as you grease — stop before it curves back up.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="h-7 w-7 rounded-lg bg-yellow-500 text-slate-900 text-xs font-black flex items-center justify-center shrink-0">
                1
              </span>
              <p className="text-sm text-slate-200 pt-1">Attach sensor and begin greasing.</p>
            </div>

            <div className="flex items-start gap-3">
              <span className="h-7 w-7 rounded-lg bg-yellow-500 text-slate-900 text-xs font-black flex items-center justify-center shrink-0">
                2
              </span>
              <div className="min-w-0 flex-1 space-y-2 pt-1">
                <p className="text-sm text-slate-200">
                  Add <span className="text-yellow-400 font-bold">1 half-stroke</span> of grease
                  slowly, then wait 15 seconds for acoustic signal to stabilize.
                </p>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-medium">
                  <Shield className="h-3.5 w-3.5 shrink-0" />
                  Verification Required: Confirm Polyurea matches plant lubrication schedule for
                  this asset
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={greaseVerified}
                    onChange={(e) => setGreaseVerified(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-950 text-yellow-500 accent-yellow-500 cursor-pointer"
                  />
                  I have verified grease compatibility
                </label>
                <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200/90 leading-snug">
                  ⚠️ Bearing capacity varies by size. Never apply more than 1-2 strokes without
                  monitoring dB response.
                </div>
                <p className="text-[11px] text-slate-500">
                  Typical grease gun discharge: 0.5g - 3.0g per full stroke
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-3">
              <p className="text-sm font-bold text-white">
                Did the RMS dB level drop by &gt;10 dB?
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLubeFeedback("yes");
                    onToast?.("Lubrication successful — RMS drop confirmed.", "success");
                  }}
                  className={`w-full min-h-[48px] px-4 rounded-xl text-sm font-bold border cursor-pointer inline-flex items-center justify-center gap-2 transition-all ${
                    lubeFeedback === "yes"
                      ? "bg-emerald-500 text-slate-950 border-emerald-400"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/20"
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Yes — Lubrication Successful
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLubeFeedback("no");
                    onToast?.(
                      "Stop greasing — bearing may be physically damaged. Escalate to repair.",
                      "warning"
                    );
                  }}
                  className={`w-full min-h-[48px] px-4 rounded-xl text-sm font-bold border cursor-pointer inline-flex items-center justify-center gap-2 transition-all ${
                    lubeFeedback === "no"
                      ? "bg-red-500 text-white border-red-400"
                      : "bg-red-500/10 text-red-400 border-red-500/40 hover:bg-red-500/20"
                  }`}
                >
                  <XCircle className="h-4 w-4" />
                  No — Stop! Bearing physically damaged
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLubeFeedback("rising");
                    alert(
                      "Over-lubrication detected. Bearing seals may be at risk. Do not add more grease."
                    );
                    onToast?.("Over-lubrication — stop pumping. Seals may be at risk.", "error");
                  }}
                  className={`w-full min-h-[48px] px-4 rounded-xl text-sm font-bold border cursor-pointer inline-flex items-center justify-center gap-2 transition-all ${
                    lubeFeedback === "rising"
                      ? "bg-orange-500 text-slate-950 border-orange-400"
                      : "bg-orange-500/15 text-orange-400 border-orange-500/50 hover:bg-orange-500/25"
                  }`}
                >
                  <AlertTriangle className="h-4 w-4" />
                  ⚠️ dB Rising — Stop Pumping!
                </button>
              </div>
              {lubeFeedback === "rising" && (
                <p className="text-sm font-semibold text-orange-400">
                  Decibel levels are rising after initial drop. Churning detected. Stop immediately.
                </p>
              )}
              {lubeFeedback === "yes" && (
                <p className="text-sm font-semibold text-emerald-400">
                  Record post-grease baseline and schedule next UE route check.
                </p>
              )}
              {lubeFeedback === "no" && (
                <p className="text-sm font-semibold text-red-400">
                  Cease lubrication. Create work order for bearing replacement.
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 5 — AI Procurement & BOM (directly above CMMS) */}
      {(ueResultMode === "leak" || ueResultMode === "mechanical") && (
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-bold text-white">AI Procurement &amp; Bill of Materials (BOM)</h3>
          <p className="text-sm text-slate-500 mt-0.5 mb-5">
            {ueResultMode === "leak"
              ? "Auto-matched to compressed-air fitting specs"
              : "Auto-matched to bearing lubrication schedule"}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {ueResultMode === "leak" ? (
              <>
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Required Parts
                  </p>
                  <div className="text-sm text-slate-300 leading-snug">
                    <span>PART 1/2&quot; NPT Industrial Interchange Air Coupler Kit (Qty: 1)</span>
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 border border-green-500/30 ml-2">
                      📦 In Stock
                    </span>
                  </div>
                </div>
                <div className="flex flex-col justify-center">
                  <button
                    type="button"
                    onClick={() =>
                      onToast?.("Fitting kit queued for purchase…", "success")
                    }
                    className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-2 rounded-lg text-sm mb-2 cursor-pointer transition-colors"
                  >
                    🛒 Purchase Fitting Kit - $18
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onToast?.("Parts pull request sent to stock room…", "info")
                    }
                    className="w-full border border-slate-700 text-white hover:bg-slate-800 py-2 rounded-lg text-sm cursor-pointer transition-colors"
                  >
                    📦 Pull from On-Site Stock Room
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Required Parts
                  </p>
                  <div className="text-sm text-slate-300 leading-snug">
                    <span>
                      PART Mobilith SHC 100 Premium Synthetic Grease Cartridge (Qty: 1)
                    </span>
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 border border-green-500/30 ml-2">
                      📦 In Stock - Bin 04B
                    </span>
                  </div>
                </div>
                <div className="flex flex-col justify-center">
                  <button
                    type="button"
                    onClick={() =>
                      onToast?.("Grease cartridge order queued…", "success")
                    }
                    className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-2 rounded-lg text-sm mb-2 cursor-pointer transition-colors"
                  >
                    🛒 Order Grease Cartridge - $22
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onToast?.("Tool crib picking ticket sent to printer…", "info")
                    }
                    className="w-full border border-slate-700 text-white hover:bg-slate-800 py-2 rounded-lg text-sm cursor-pointer transition-colors"
                  >
                    📋 Print Tool Crib Picking Ticket
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* 6 — CMMS Work Order Bridge + static footer (no Page 1 artifacts) */}
      {!intelLoading && !intelError && (
        <CmmsPayloadBridge
          context={cmmsContext}
          sectionId="ue-cmms-data-bridge"
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
        onExportPdf={() =>
          onExportPdf
            ? onExportPdf()
            : onToast?.("Exporting ultrasound PDF report…", "info")
        }
        onManagerReport={() =>
          onManagerReport
            ? onManagerReport()
            : onToast?.("Generating manager executive report…", "info")
        }
      />
    </div>
  );
}
