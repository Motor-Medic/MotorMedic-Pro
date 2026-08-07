import React, { useState } from "react";
import {
  AlertTriangle,
  Check,
  DollarSign,
  RefreshCw,
  Thermometer,
  Upload,
  Zap
} from "lucide-react";
import CmmsDataBridge from "./CmmsDataBridge";

const REPAIR_STEPS = [
  "De-energize and follow LOTO procedures.",
  "Torque Phase B lug to original manufacturer (OEM) technical specifications. Reference Switchgear tightening spec card inside enclosure door.",
  "Inspect busbar for pitting/discoloration.",
  "Re-scan within 24 hours of load restoration."
];

const PALETTES = ["Ironbow", "Grayscale", "Rainbow"] as const;

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

export interface ThermographyResultsDashboardProps {
  assetLabel: string;
  componentLabel?: string;
  onNewAnalysis: () => void;
  onSaveWorkOrder: () => void;
  onToast?: (message: string, type?: "success" | "info" | "warning" | "error") => void;
}

export default function ThermographyResultsDashboard({
  assetLabel,
  componentLabel,
  onNewAnalysis,
  onSaveWorkOrder,
  onToast
}: ThermographyResultsDashboardProps) {
  const [isothermC, setIsothermC] = useState(60);
  const [palette, setPalette] = useState<(typeof PALETTES)[number]>("Ironbow");
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});

  const gradientByPalette =
    palette === "Grayscale"
      ? "bg-gradient-to-br from-slate-900 via-slate-500 to-white"
      : palette === "Rainbow"
        ? "bg-gradient-to-br from-indigo-700 via-emerald-400 to-rose-500"
        : "bg-gradient-to-br from-blue-900 via-purple-800 to-red-600";

  return (
    <div className="relative space-y-6" style={{ animation: "techParamFade 0.35s ease-out" }}>
      <StaticActionBar
        position="top"
        onNewAnalysis={onNewAnalysis}
        onExportPdf={() => onToast?.("Exporting thermography PDF report…", "info")}
        onManagerReport={() => onToast?.("Generating manager executive report…", "info")}
      />

      {/* Header */}
      <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-400">
            Thermography Analysis Results
          </p>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">
            {assetLabel}
            {componentLabel ? ` · ${componentLabel}` : ""}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            NFPA 70B 2026 · Radiometric assessment · ISO 18434-1
          </p>
        </div>
      </div>

      {/* SECTION 1 — SmartView */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="mb-4 flex items-center gap-2">
          <Thermometer className="h-5 w-5 text-red-400" />
          <div>
            <h3 className="text-lg font-bold text-white">Interactive Thermal Analysis (SmartView)</h3>
            <p className="text-sm text-slate-500">Web-based radiometric inspection canvas</p>
          </div>
        </div>

        <div
          className={`h-96 ${gradientByPalette} rounded-lg relative overflow-hidden border border-white/10 shadow-inner`}
        >
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)"
            }}
          />

          {/* Area / max box */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-white/50 bg-black/30 backdrop-blur-sm p-2 rounded-sm">
            <p className="text-xs font-bold text-white font-mono tracking-wide">Max: 142.5°F</p>
          </div>

          {/* Reference component marker */}
          <div className="absolute top-1/4 left-1/4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shrink-0" />
            <span className="bg-slate-900/80 text-green-400 text-xs px-2 py-1 rounded border border-green-500/30">
              Ref (Phase C Lug): 92.5°F
            </span>
          </div>

          {/* Spot meter */}
          <div className="absolute top-1/3 left-[55%] flex items-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-white bg-white/20 shadow-[0_0_12px_rgba(255,255,255,0.5)]" />
            <span className="text-xs font-bold text-white font-mono bg-black/40 px-1.5 py-0.5 rounded">
              92.1°F
            </span>
          </div>

          {/* Canvas controls (overlay inside image — not a page action bar) */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-4 pt-10 pb-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="flex-1 min-w-0 text-xs text-slate-200 font-semibold">
                Isotherm Slider — Show temps &gt;{" "}
                <span className="text-yellow-400 font-mono">[ {isothermC}°C ]</span>
                <input
                  type="range"
                  min={20}
                  max={120}
                  value={isothermC}
                  onChange={(e) => setIsothermC(Number(e.target.value))}
                  className="mt-1.5 w-full accent-yellow-500 cursor-pointer"
                />
              </label>
              <div className="flex flex-wrap gap-1.5 shrink-0">
                {PALETTES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPalette(p)}
                    className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold border cursor-pointer transition-colors ${
                      palette === p
                        ? "bg-yellow-500 text-slate-900 border-yellow-500"
                        : "bg-black/50 text-slate-200 border-white/30 hover:border-yellow-500/60"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2 — NFPA Severity Engine */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-5">
          Automated Severity Engine (NFPA 70B)
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              The Physics Math
            </p>
            <p className="text-sm text-slate-300">
              Measured Rise (ΔT<sub>1</sub> over Ambient):{" "}
              <span className="text-white font-bold">15°C</span>
            </p>
            <p className="text-sm text-slate-300">
              Phase-to-Phase Rise (ΔT<sub>2</sub>):{" "}
              <span className="text-white font-bold">50°C</span>
            </p>
            <p className="text-sm text-slate-300">
              Current Load:{" "}
              <span className="text-yellow-400 font-bold">46%</span>{" "}
              <span className="text-slate-500">(185A / 400A)</span>
            </p>
            <div className="pt-3 mt-2 border-t border-slate-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/80 mb-1">
                Critical Calculation
              </p>
              <p className="text-xl sm:text-2xl font-black text-red-500 leading-snug">
                Projected Rise at 100% Load: 71°C (CRITICAL)
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-5 flex flex-col justify-center items-start gap-3">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-xs font-bold uppercase tracking-wider">
              <AlertTriangle className="h-4 w-4" />
              Severity Level 4
            </span>
            <p className="text-xl sm:text-2xl font-black text-red-400 leading-tight">
              Immediate Action Required
            </p>
            <p className="text-sm text-slate-300 leading-relaxed">
              Based on ΔT &gt; 15°C and High Criticality Asset.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 3 — Financial Fire Drill */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-5">
          Risk &amp; Financial Impact Assessment
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3">
            <div className="h-10 w-10 rounded-xl bg-red-500/15 border border-red-500/40 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Arc Flash Probability
            </p>
            <p className="text-2xl font-black text-red-500">HIGH</p>
            <p className="text-sm text-slate-400">Links to OSHA General Duty Clause.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3">
            <div className="h-10 w-10 rounded-xl bg-yellow-500/15 border border-yellow-500/40 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-yellow-400" />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Downtime Cost
            </p>
            <p className="text-2xl font-black text-yellow-400">$22,000 / hr</p>
            <p className="text-sm text-slate-400">Asset feeds Main Production Line.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3">
            <div className="h-10 w-10 rounded-xl bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center">
              <Zap className="h-5 w-5 text-cyan-400" />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Excess Heat Loss
            </p>
            <p className="text-2xl font-black text-cyan-400">450 kWh / year</p>
            <p className="text-sm text-slate-400">Equivalent to $540 annual waste.</p>
          </div>
        </div>
      </section>

      {/* SECTION 4 — Remediation & Verification */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-lg font-bold text-white">Field Repair Procedure</h4>
                <p className="text-sm text-slate-500 mt-0.5">
                  Auto-generated for Phase B lug anomaly
                </p>
              </div>
              <button
                type="button"
                onClick={() => alert("Job plan copied to clipboard in Maximo format!")}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-cyan-400 flex items-center gap-1 border border-cyan-500/30 cursor-pointer transition-colors shrink-0"
              >
                📋 Copy Job Plan to CMMS
              </button>
            </div>
            <ul className="space-y-3">
              {REPAIR_STEPS.map((step, idx) => {
                const on = !!checkedSteps[step];
                return (
                  <li key={step}>
                    <label className="flex items-start gap-3 cursor-pointer text-sm text-slate-300 group">
                      <span
                        className={`mt-0.5 h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                          on
                            ? "bg-yellow-500 border-yellow-400 text-slate-950"
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
                          setCheckedSteps((p) => ({ ...p, [step]: !p[step] }))
                        }
                      />
                      <span className={`min-w-0 block ${on ? "text-white" : ""}`}>
                        <span>
                          <span className="text-yellow-500/80 font-bold mr-1.5">{idx + 1}.</span>
                          {step}
                        </span>
                        {idx === 0 && (
                          <span className="mt-2 inline-flex items-center gap-2 px-2 py-1 rounded text-xs bg-red-500/10 text-red-400 border border-red-500/30">
                            ⚠️ Incident Energy Threshold Alert: Ensure Class 2 or higher Arc Flash
                            PPE is worn during initial enclosure opening and dead-bus voltmeter
                            verification testing.
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-4 flex flex-col">
            <div>
              <h4 className="text-lg font-bold text-white">Post-Repair Verification</h4>
              <p className="text-sm text-slate-500 mt-0.5">Close the NFPA work-order loop</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="min-w-0 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  As-Found (Hotspot: 142.5°F)
                </p>
                <div className="h-32 bg-gradient-to-br from-blue-900 to-red-600 rounded-lg relative">
                  <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
                </div>
              </div>
              <div className="min-w-0 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  As-Left (Verified Base: 91.2°F)
                </p>
                <div className="h-32 bg-gradient-to-br from-blue-900 to-blue-700 rounded-lg relative flex items-center justify-center">
                  <Check
                    className="h-8 w-8 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                    strokeWidth={3}
                  />
                </div>
                <p className="mt-2 text-xs text-green-400 font-medium">
                  ✅ Verification Scan Approved: Phase B temperature stabilized at 91.2°F
                  (Normal).
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                onToast?.(
                  "Verification scan upload opened (demo). Re-scan after load restoration.",
                  "info"
                )
              }
              className="min-h-[40px] px-5 rounded-lg border border-white/80 hover:border-yellow-500 hover:text-yellow-400 text-white text-sm font-bold cursor-pointer transition-colors bg-transparent inline-flex items-center justify-center gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload Verification Scan
            </button>

            <span className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <RefreshCw className="h-3.5 w-3.5 shrink-0" />
              System Action: Reset Thermal Baseline Timeline for Breaker 2B upon approval.
            </span>
          </div>
        </div>
      </section>

      {/* AI Procurement & BOM — between Field Repair / Verification and CMMS Bridge */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white">AI Procurement &amp; Bill of Materials (BOM)</h3>
        <p className="text-sm text-slate-500 mt-0.5 mb-5">
          Auto-matched to 400A / 480V Switchgear Casing Specs
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Required Parts
            </p>
            <div className="text-sm text-slate-300 leading-snug">
              <span>PART Heavy-Duty Compression Lug (Dual-Hole, Copper) (Qty: 3)</span>
              <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 border border-green-500/30 ml-2">
                📦 In Stock - Allocated
              </span>
            </div>
            <div className="text-sm text-slate-300 leading-snug">
              <span>PART Electrical Joint Anti-Oxidant Compound (No-Ox-Id) (Qty: 1 Tube)</span>
              <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 border border-green-500/30 ml-2">
                📦 In Stock
              </span>
            </div>
          </div>
          <div className="flex flex-col justify-center">
            <button
              type="button"
              onClick={() =>
                onToast?.("Electrical overhaul kit queued for purchase…", "success")
              }
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-2 rounded-lg text-sm mb-2 cursor-pointer transition-colors"
            >
              🛒 Purchase Electrical Overhaul Kit - $45
            </button>
            <button
              type="button"
              onClick={() =>
                onToast?.("Lug kit pull request sent to electrical crib…", "info")
              }
              className="w-full border border-slate-700 text-white hover:bg-slate-800 py-2 rounded-lg text-sm cursor-pointer transition-colors"
            >
              📦 Pull Lug Kit from On-Site Electrical Crib
            </button>
          </div>
        </div>
      </section>

      {/* Universal CMMS Data Bridge — last content section above bottom action bar */}
      <CmmsDataBridge
        domain="thermography"
        assetLabel={assetLabel}
        componentLabel={componentLabel || "Phase B Lug"}
        sectionId="ir-cmms-data-bridge"
        onToast={onToast}
      />

      <div className="mb-2">
        <button
          type="button"
          onClick={onSaveWorkOrder}
          className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg text-sm cursor-pointer transition-colors"
        >
          ✍️ Save Work Order &amp; Commit to CMMS
        </button>
      </div>

      <StaticActionBar
        position="bottom"
        onNewAnalysis={onNewAnalysis}
        onExportPdf={() => onToast?.("Exporting thermography PDF report…", "info")}
        onManagerReport={() => onToast?.("Generating manager executive report…", "info")}
      />
    </div>
  );
}
