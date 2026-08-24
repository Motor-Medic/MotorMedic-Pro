import React, { useState } from "react";
import { Check, X } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import CmmsDataBridge from "./CmmsDataBridge";

/** Si / Fe / Al abrasive wear correlation — last 6 samples */
const ELEMENTAL_TREND = [
  { sample: "S1", date: "Jan", si: 18, fe: 35, al: 12 },
  { sample: "S2", date: "Mar", si: 22, fe: 48, al: 15 },
  { sample: "S3", date: "May", si: 28, fe: 62, al: 18 },
  { sample: "S4", date: "Jul", si: 34, fe: 80, al: 22 },
  { sample: "S5", date: "Sep", si: 40, fe: 98, al: 26 },
  { sample: "S6", date: "Nov", si: 45, fe: 120, al: 30 }
];

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
}

export default function OilResultsDashboard({
  assetLabel,
  componentLabel,
  onNewAnalysis,
  onToast
}: OilResultsDashboardProps) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [showElementTrend, setShowElementTrend] = useState(false);

  const toggleCheck = (i: number) => {
    setChecked((prev) => ({ ...prev, [i]: !prev[i] }));
  };

  const handleExportPdf = () => {
    onToast?.("Generating Oil Analysis PDF report…", "info") ??
      alert("Generating Oil Analysis PDF report…");
  };

  const handleManagerReport = () => {
    onToast?.("Preparing manager summary…", "info") ?? alert("Preparing manager summary…");
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

      {/* 1 — Wear Particle Matrix (snapshot only — trends live in Trend Analyzer) */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-5">Wear Particle Matrix Visuals</h3>
        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4 min-w-0 max-w-xl">
          <h4 className="text-sm font-bold text-white mb-3">
            ISO 4406:2021 Contamination Grid
          </h4>
          <div className="h-64 bg-slate-950 rounded-lg relative border border-slate-800 overflow-hidden">
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3" aria-hidden>
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-slate-800/80" />
              ))}
            </div>
            <span className="absolute left-2 bottom-2 text-[9px] text-slate-600 font-mono">
              Cleaner →
            </span>
            <span className="absolute left-2 top-2 text-[9px] text-slate-600 font-mono rotate-0">
              ↑ Contaminated
            </span>
            <div
              className="w-4 h-4 bg-red-500 rounded-full absolute shadow-[0_0_10px_rgba(239,68,68,0.8)]"
              style={{ top: "18%", right: "18%" }}
              title="ISO 19/17/14"
            />
            <span className="absolute top-[14%] right-[28%] text-[10px] font-bold text-red-400">
              19/17/14
            </span>
          </div>
          <p className="text-sm text-red-400 font-semibold mt-3">
            Current Code: 19/17/14 (CRITICAL – Target: 15/13/10)
          </p>
        </div>
      </section>

      {/* 2 — Automated Root-Cause Analysis */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-5">Automated Root-Cause Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => setShowElementTrend(true)}
            className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3 text-left cursor-pointer hover:bg-slate-800/50 transition-colors w-full"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Abrasive Wear Detected
              </p>
              <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded border border-red-500/30">
                94% Confidence
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
              Si (45ppm) + Fe (120ppm) + Al (30ppm)
            </p>
            <p className="text-sm font-bold text-red-400">
              Atmospheric dirt bypassing breathers. Grinding internal gears.
            </p>
          </button>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3 cursor-pointer hover:bg-slate-800/50 transition-colors">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Journal Bearing Degradation
              </p>
              <span className="text-xs bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded border border-yellow-500/30">
                45% Confidence
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
              Cu (85ppm) + Pb (40ppm) elevated together.
            </p>
            <p className="text-sm font-bold text-yellow-400">
              High friction on copper-alloy thrust plates.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3 cursor-pointer hover:bg-slate-800/50 transition-colors">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Coolant Ingress
              </p>
              <span className="text-xs bg-slate-500/10 text-slate-400 px-2 py-0.5 rounded border border-slate-500/30">
                12% Confidence
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
              Na/K spike + Water &gt; 500 PPM.
            </p>
            <p className="text-sm font-bold text-cyan-400">
              Inspect heat exchanger/head gasket immediately.
            </p>
          </div>
        </div>
      </section>

      {/* 3 — Financial Sump Optimization */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-5">Financial Sump Optimization</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Oil Life Extension ROI
            </p>
            <div className="rounded-xl border-2 border-red-500/50 bg-red-500/5 p-5">
              <p className="text-sm text-slate-400">Full Sump Replacement (500 gal)</p>
              <p className="text-3xl font-black text-red-400 tracking-tight">$15,000</p>
            </div>
            <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5 p-5">
              <p className="text-sm text-slate-400">
                Kidney-Loop Filtration (6 hours minimum - 7 volume turnovers)
              </p>
              <p className="text-3xl font-black text-emerald-400 tracking-tight">$675</p>
              <p className="text-[11px] text-slate-500 mt-2">
                Calculated for 500-gallon reservoir @ 600 GPH cart rate.
              </p>
            </div>
            <p className="text-sm text-slate-300">
              Action Advised:{" "}
              <span className="text-yellow-400 font-bold">Filter Sump</span>. Potential Savings:{" "}
              <span className="text-emerald-400 font-bold">$14,325</span>.
            </p>
          </div>

          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 flex flex-col justify-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/80">
              Asset Life Impact
            </p>
            <p className="text-4xl sm:text-5xl font-black text-red-400 tracking-tight">
              −28% Life Expectancy
            </p>
            <p className="text-sm text-slate-400">
              High TAN (3.2) is accelerating yellow-metal leaching.
            </p>
          </div>
        </div>
      </section>

      {/* 4 — Field Technician Action Plan */}
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
                    {i === 0 && (
                      <p className="mt-2 text-xs text-red-400 font-medium leading-relaxed">
                        ⚠️ A standard 10-micron nominal filter cannot capture the microscopic
                        particles causing this ISO 19/17/14 contamination.
                      </p>
                    )}
                  </span>
                </button>
                {i === 3 && (
                  <button
                    type="button"
                    onClick={() =>
                      alert(
                        "Generating shipping manifest and barcoded label for Boiler Feed Pump A..."
                      )
                    }
                    className="mt-2 text-xs bg-slate-800 hover:bg-slate-700 text-yellow-500 px-3 py-1.5 rounded border border-yellow-500/30 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    🧪 Pre-Print Sample Label &amp; Order Kit
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* 5 — AI Procurement & BOM */}
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
              onClick={() =>
                onToast?.("Maintenance kit queued for purchase…", "success") ??
                alert("Maintenance kit queued for purchase…")
              }
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-4 rounded-lg text-sm cursor-pointer transition-colors"
            >
              🛒 Purchase Maintenance Kit - $145
            </button>
            <button
              type="button"
              onClick={() =>
                onToast?.("Parts pull request sent to stock room…", "info") ??
                alert("Parts pull request sent to stock room…")
              }
              className="w-full border border-slate-700 text-white hover:bg-slate-800 py-3 px-4 rounded-lg text-sm font-bold cursor-pointer transition-colors"
            >
              📦 Pull Parts from On-Site Stock Room
            </button>
          </div>
        </div>
      </section>

      {/* 6 — Universal CMMS Data Bridge */}
      <CmmsDataBridge
        domain="oil"
        assetLabel={assetLabel}
        componentLabel={componentLabel || "Motor DE / Sump"}
        onToast={onToast}
      />

      <StaticActionBar
        position="bottom"
        onNewAnalysis={onNewAnalysis}
        onExportPdf={handleExportPdf}
        onManagerReport={handleManagerReport}
      />

      {/* Elemental trend modal (dialog overlay — not an action bar) */}
      {showElementTrend && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="elemental-trend-title"
          onClick={() => setShowElementTrend(false)}
        >
          <div
            className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowElementTrend(false)}
              className="absolute top-4 right-4 text-white hover:text-yellow-400 cursor-pointer transition-colors p-1"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <h4
              id="elemental-trend-title"
              className="text-lg font-bold text-white pr-10 mb-1"
            >
              Elemental Trend: Si, Fe, Al (Last 6 Samples)
            </h4>
            <p className="text-xs text-slate-500 mb-4">
              Rising Si + Fe + Al correlation confirms abrasive dirt ingress.
            </p>
            <div className="h-64 w-full max-w-2xl">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={ELEMENTAL_TREND}
                  margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                >
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    width={36}
                    axisLine={false}
                    tickLine={false}
                    unit=" ppm"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 8,
                      fontSize: 12
                    }}
                    formatter={(value: number | string) => [`${value} ppm`, ""]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 8 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="si"
                    name="Silicon (Si)"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#ef4444" }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="fe"
                    name="Iron (Fe)"
                    stroke="#eab308"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#eab308" }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="al"
                    name="Aluminum (Al)"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#22d3ee" }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
