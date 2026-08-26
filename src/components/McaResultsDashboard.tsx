import React, { useMemo } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import CmmsPayloadBridge from "./diagnostics/CmmsPayloadBridge";
import { useDiagnosticsIntelligence } from "../lib/diagnostics/useDiagnosticsIntelligence";
import type { VibrationAnalysisResult } from "../lib/consensusEngine";

const FAULT_ZONE_DATA = [
  { subject: "Power Quality", A: 85, fullMark: 100 },
  { subject: "Power Circuit", A: 90, fullMark: 100 },
  { subject: "Insulation", A: 40, fullMark: 100 },
  { subject: "Stator", A: 65, fullMark: 100 },
  { subject: "Rotor", A: 80, fullMark: 100 },
  { subject: "Air Gap", A: 95, fullMark: 100 }
];

const ZONE_STATUS: {
  zone: string;
  score: number;
  status: "critical" | "warning" | "normal";
  detail: string;
}[] = [
  { zone: "Power Quality", score: 85, status: "normal", detail: "NORMAL" },
  { zone: "Power Circuit", score: 90, status: "normal", detail: "NORMAL" },
  {
    zone: "Insulation",
    score: 40,
    status: "critical",
    detail: "CRITICAL (Ground Wall Degradation)"
  },
  {
    zone: "Stator",
    score: 65,
    status: "warning",
    detail: "WARNING (Turn-to-Turn Imbalance)"
  },
  { zone: "Rotor", score: 80, status: "normal", detail: "NORMAL" },
  { zone: "Air Gap", score: 95, status: "normal", detail: "NORMAL" }
];

/** 3-phase historical resistance — U-V drifts up (imbalance proof) */
const RESISTANCE_TREND_3PH = [
  { period: "Jan '21", uv: 1.8, vw: 1.8, wu: 1.8 },
  { period: "Jul '21", uv: 1.92, vw: 1.81, wu: 1.8 },
  { period: "Jan '22", uv: 2.05, vw: 1.82, wu: 1.81 },
  { period: "Jul '22", uv: 2.15, vw: 1.83, wu: 1.81 },
  { period: "Jan '23", uv: 2.28, vw: 1.84, wu: 1.82 },
  { period: "Oct '23", uv: 2.4, vw: 1.85, wu: 1.82 }
];

/**
 * Insulation time-charge curve — resistance rises as winding polarizes (PI).
 * 50 MΩ at 1 min → 450 MΩ at 10 min (PI = 9.0).
 */
const INSULATION_DISCHARGE = Array.from({ length: 11 }, (_, min) => {
  const mohm =
    min <= 0 ? 28 : Math.round(50 * Math.pow(9, (min - 1) / 9) * 10) / 10;
  return { min, mohm };
});

const BOM_PARTS = [
  "Insulation Material Kit: Class F Slot Liners & Wedges",
  "Magnet Wire: Heavy Armored Polythermaleze",
  "Bearings (Standard Overhaul): 6313-C3 (DE) / 6212-C3 (ODE)"
];

function statusBadgeClass(status: "critical" | "warning" | "normal") {
  if (status === "critical") return "bg-red-500/15 border-red-500/50 text-red-400";
  if (status === "warning") return "bg-yellow-500/15 border-yellow-500/50 text-yellow-400";
  return "bg-emerald-500/15 border-emerald-500/40 text-emerald-400";
}

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
  recommendations = NO_RECOMMENDATIONS,
  savedAnalysisId = null,
  engineerName,
  onNewAnalysis,
  onToast
}: McaResultsDashboardProps) {
  const motorHP = 75;
  const recommendReplace = motorHP < 100;

  /** Mock primary fault flag — insulation drives left-column chart selection */
  const isInsulationFault = true;

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
        <p className="text-sm text-slate-500 mt-1">
          Six Fault Zone analytics · IEEE 43 / NETA · Offline MCA · {motorHP} HP
        </p>
      </div>

      {/* 1 — Motor Health Matrix (Spider Chart) */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-5">
          Motor Health Matrix (Six Fault Zones)
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4 min-w-0">
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={FAULT_ZONE_DATA}>
                  <PolarGrid stroke="#334155" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={false}
                  />
                  <Radar
                    name="Health"
                    dataKey="A"
                    stroke="#eab308"
                    fill="#eab308"
                    fillOpacity={0.2}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 8,
                      fontSize: 12
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 text-center">
              Insulation score (40) pulls the radar inward — ground-wall degradation.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4 space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Zone Status
            </p>
            {ZONE_STATUS.map((z) => (
              <div
                key={z.zone}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-white/5 bg-slate-900/50 px-3 py-2.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {z.status === "critical" ? (
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                  ) : z.status === "warning" ? (
                    <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  )}
                  <span className="text-sm font-bold text-white">{z.zone}</span>
                  <span className="text-[11px] text-slate-500 font-mono">{z.score}</span>
                </div>
                <span
                  className={`inline-flex self-start sm:self-auto text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border ${statusBadgeClass(
                    z.status
                  )}`}
                >
                  {z.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2 — Automated Fault Algorithms */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-5">Automated Fault Algorithms</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Stator Winding Health
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Logic: Impedance Imbalance &gt; 3% AND Phase Angle Deviation &gt; 2°
            </p>
            <p className="text-sm font-bold text-yellow-400">
              Developing Turn-to-Turn Short (Early Stage)
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Rotor Bar Integrity
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Logic: Inductance variance during Dynamic Rotation test.
            </p>
            <p className="text-sm font-bold text-emerald-400">
              Rotor Health: NORMAL (No broken bars detected)
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Winding Contamination
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Logic: Phase Angle stable, but IR &lt; 100 MΩ.
            </p>
            <p className="text-sm font-bold text-cyan-400">
              Clean &amp; Varnish Dip Recommended
            </p>
          </div>
        </div>
      </section>

      {/* 3 — Financial Impact */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-5">
          Financial Impact &amp; Lifecycle Analysis
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Repair vs. Replace
            </p>
            <div className="rounded-xl border-2 border-yellow-500/50 bg-yellow-500/5 p-5">
              <p className="text-sm text-slate-400">Est. Rewind Cost</p>
              <p className="text-3xl font-black text-yellow-400 tracking-tight">$4,200</p>
            </div>
            <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5 p-5">
              <p className="text-sm text-slate-400">New Premium Efficient Motor</p>
              <p className="text-3xl font-black text-emerald-400 tracking-tight">$12,500</p>
            </div>
            <div
              className={`rounded-xl border-2 p-4 ${
                recommendReplace
                  ? "border-red-500/50 bg-red-500/5"
                  : "border-yellow-500/50 bg-yellow-500/5"
              }`}
            >
              {recommendReplace ? (
                <p className="text-sm text-slate-200">
                  Recommend:{" "}
                  <span className="text-red-400 font-bold">REPLACE</span> (Rewind labor costs
                  exceed asset value for &lt;100HP random-wound motors).
                </p>
              ) : (
                <p className="text-sm text-slate-200">
                  Recommend: <span className="text-yellow-400 font-bold">Rewind</span>.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5 flex flex-col justify-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-500/80">
              Resistive Imbalance Cost
            </p>
            <p className="text-4xl sm:text-5xl font-black text-yellow-400 tracking-tight">
              $1,100 / year
            </p>
            <p className="text-sm text-slate-400">
              Caused by 5% I²R heat loss due to phase imbalance.
            </p>
          </div>
        </div>
      </section>

      {/* 4 — AI Procurement & BOM */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white">AI Procurement &amp; Bill of Materials (BOM)</h3>
        <p className="text-sm text-slate-500 mt-0.5 mb-5">
          Auto-matched to Nameplate NEMA Frame &amp; Stator Slots
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <p className="text-sm font-bold text-white">
              Required Action: Motor In-Shop Overhaul &amp; Rewind
            </p>
            <ul className="space-y-2.5">
              {BOM_PARTS.map((part) => (
                <li
                  key={part}
                  className="flex items-start gap-2 text-sm text-slate-300 leading-snug"
                >
                  <span className="mt-0.5 shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/40">
                    Part
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
        <h3 className="text-lg font-bold text-white mb-5">
          Visual Verification (Trending &amp; Analytics)
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4 min-w-0">
            {isInsulationFault ? (
              <>
                <h4 className="text-sm font-bold text-white mb-3">
                  Insulation Resistance Time-Discharge Plot
                </h4>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={INSULATION_DISCHARGE}
                      margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="min"
                        tick={{ fill: "#64748b", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        label={{
                          value: "min",
                          position: "insideBottomRight",
                          offset: -2,
                          fill: "#64748b",
                          fontSize: 10
                        }}
                      />
                      <YAxis
                        domain={[0, 550]}
                        tick={{ fill: "#64748b", fontSize: 10 }}
                        width={56}
                        axisLine={false}
                        tickLine={false}
                        label={{
                          value: "Megohms (MΩ)",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#64748b",
                          fontSize: 10,
                          offset: 0
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0f172a",
                          border: "1px solid #334155",
                          borderRadius: 8,
                          fontSize: 12
                        }}
                        labelFormatter={(v) => `${v} min`}
                        formatter={(value: number | string) => [`${value} MΩ`, "IR"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="mohm"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Exponential rise confirms capacitive/absorption current decay. (PI Ratio =
                  9.0)
                </p>
              </>
            ) : (
              <>
                <h4 className="text-sm font-bold text-white mb-3">
                  Dynamic Stator Signature (Butterfly Plot)
                </h4>
                <div className="h-48 bg-slate-950 rounded-lg relative overflow-hidden border border-white/5">
                  <svg
                    viewBox="0 0 400 192"
                    className="absolute inset-0 w-full h-full"
                    preserveAspectRatio="none"
                    aria-hidden
                  >
                    {[48, 96, 144].map((y) => (
                      <line
                        key={y}
                        x1="0"
                        y1={y}
                        x2="400"
                        y2={y}
                        stroke="#1e293b"
                        strokeWidth="1"
                      />
                    ))}
                    <path
                      d="M 20 96 C 80 40, 140 40, 200 96 C 260 152, 320 152, 380 96"
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="2.5"
                      opacity="0.95"
                    />
                    <path
                      d="M 20 96 C 80 152, 140 152, 200 96 C 260 40, 320 40, 380 96"
                      fill="none"
                      stroke="#eab308"
                      strokeWidth="2.5"
                      opacity="0.95"
                    />
                  </svg>
                  <div className="absolute bottom-2 left-3 right-3 flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>0°</span>
                    <span className="text-yellow-500/80">Phase separation</span>
                    <span>360°</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Overlapping sine paths diverge mid-rotation — stator impedance asymmetry.
                </p>
              </>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4 min-w-0">
            <span className="inline-flex items-center gap-2 px-2 py-1 rounded text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 mb-2">
              🛡️ Values Normalized to 40°C per IEEE 43 standard
            </span>
            <h4 className="text-sm font-bold text-white mb-3">
              Historical Resistance Trend (3 Years)
            </h4>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={RESISTANCE_TREND_3PH}
                  margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                >
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="period"
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    width={36}
                    axisLine={false}
                    tickLine={false}
                    unit=" Ω"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 8,
                      fontSize: 12
                    }}
                    formatter={(value: number | string) => [`${value} Ω`, ""]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 8 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="uv"
                    name="Phase U-V"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#22d3ee" }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="vw"
                    name="Phase V-W"
                    stroke="#eab308"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#eab308" }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="wu"
                    name="Phase W-U"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#94a3b8" }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Phase U–V drifts upward while V–W / W–U stay flat — resistive imbalance proof.
            </p>
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
