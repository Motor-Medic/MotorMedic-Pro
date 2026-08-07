import React, { useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Sparkles } from "lucide-react";

/* ========================================================================== */
/* Props (unchanged contract for App.tsx)                                     */
/* ========================================================================== */

interface RootCauseAnalysisProps {
  selectedCompanyId?: number;
}

const CARD = "bg-slate-900/50 border border-white/10 rounded-xl p-6";
const PILL =
  "px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300";

type RcaTab = 1 | 2 | 3 | 4;
type RcaView = "logic" | "fishbone" | "5whys";

const RCA_TABS: { id: RcaTab; label: string }[] = [
  { id: 1, label: "🌳 Logic Tree & Evidence" },
  { id: 2, label: "⏱️ SnapCharT Timeline" },
  { id: 3, label: "🧠 3-Tier Cause Breakdown" },
  { id: 4, label: "💰 CAPA & ROI Engine" }
];

const RCA_VIEWS: { id: RcaView; label: string }[] = [
  { id: "logic", label: "🌳 Logic Tree (PROACT)" },
  { id: "fishbone", label: "🐟 Fishbone (6Ms)" },
  { id: "5whys", label: "❓ 5 Whys Sequence" }
];

type EvidenceStatus = "verified" | "disproved" | "untested";

const EvidenceBadge = ({ status }: { status: EvidenceStatus }) => {
  if (status === "verified") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/15 border border-green-500/30 text-green-400">
        🟢 VERIFIED TRUE
      </span>
    );
  }
  if (status === "disproved") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/15 border border-red-500/30 text-red-400">
        🔴 DISPROVED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/15 border border-yellow-500/30 text-yellow-400">
      🟡 UNTESTED
    </span>
  );
};

const LOGIC_BRANCHES: {
  title: string;
  tone: string;
  nodes: { text: string; status: EvidenceStatus }[];
}[] = [
  {
    title: "Physical Causes",
    tone: "border-red-500/40 text-red-400",
    nodes: [
      { text: "Outer race spalling (BPFO @ 3.58X)", status: "verified" },
      { text: "Lubrication starvation in DE housing", status: "verified" },
      { text: "Shaft misalignment > 0.5 mils/in", status: "disproved" }
    ]
  },
  {
    title: "Human Causes",
    tone: "border-yellow-500/40 text-yellow-400",
    nodes: [
      { text: "Over-greasing until purge observed", status: "verified" },
      { text: "Wrong NLGI grade selected", status: "untested" }
    ]
  },
  {
    title: "Latent Causes",
    tone: "border-cyan-500/40 text-cyan-400",
    nodes: [
      { text: "SOP #204 lacks gram-weight specs", status: "verified" },
      { text: "No ultrasonic-assisted greasing training", status: "untested" }
    ]
  }
];

const FISHBONE_RIBS: { label: string; items: string[]; side: "top" | "bottom" }[] = [
  { label: "Man", items: ["Over-grease habit", "No UE greasing skill"], side: "top" },
  { label: "Machine", items: ["DE bearing wear", "Breather clogged"], side: "top" },
  { label: "Method", items: ["SOP #204 vague", "PM interval drift"], side: "top" },
  { label: "Material", items: ["Wrong grease qty", "Supplier change"], side: "bottom" },
  { label: "Measurement", items: ["No gram scale", "gSE not trended"], side: "bottom" },
  { label: "Environment", items: ["High ambient", "Dust ingress"], side: "bottom" }
];

const FIVE_WHYS = [
  {
    why: "Why did the bearing overheat?",
    answer: "Outer race fatigue spalling under lubrication starvation.",
    status: "verified" as EvidenceStatus
  },
  {
    why: "Why was lubrication starved?",
    answer: "Excess purge grease packed the cavity and blocked fresh oil film.",
    status: "verified" as EvidenceStatus
  },
  {
    why: "Why was excess grease applied?",
    answer: "Technician followed 'grease until purge' verbal rule.",
    status: "verified" as EvidenceStatus
  },
  {
    why: "Why was that the rule?",
    answer: "SOP #204 does not specify gram weight or ultrasonic endpoint.",
    status: "verified" as EvidenceStatus
  },
  {
    why: "Why was the SOP incomplete?",
    answer: "Procedure last revised in 2018; no reliability review cycle.",
    status: "untested" as EvidenceStatus
  }
];

const TIMELINE_EVENTS = [
  { date: "Jul 12", label: "Speed Increased" },
  { date: "Jul 19", label: "Lube Top-up" },
  { date: "Aug 03", label: "Temp Alarm" }
];

const timelineData = [
  { date: "Jul 12", temp: 45, vibration: 1.2, event: "Speed Increased" },
  { date: "Jul 19", temp: 52, vibration: 1.8, event: "Lube Top-up" },
  { date: "Aug 03", temp: 78.4, vibration: 3.45, event: "Temp Alarm" }
];

type CapaStatus = "in-progress" | "pending" | "complete";

const CAPA_ROWS: {
  action: string;
  cost: string;
  owner: string;
  target: string;
  status: CapaStatus;
  statusLabel: string;
}[] = [
  {
    action: "Replace DE Bearing & Flush Oil",
    cost: "$1,200",
    owner: "Maint. Lead",
    target: "Aug 15, 2026",
    status: "in-progress",
    statusLabel: "🟡 In Progress"
  },
  {
    action: "Train technicians on Ultrasonic Greasing",
    cost: "$800",
    owner: "Reliability Eng.",
    target: "Aug 20, 2026",
    status: "pending",
    statusLabel: "⏳ Pending"
  },
  {
    action: "Update SOP #204",
    cost: "$500",
    owner: "Quality Mgr.",
    target: "Aug 10, 2026",
    status: "complete",
    statusLabel: "✅ Complete"
  }
];

const capaStatusClass = (status: CapaStatus) => {
  if (status === "in-progress") {
    return "bg-yellow-500/15 border border-yellow-500/30 text-yellow-400";
  }
  if (status === "complete") {
    return "bg-green-500/15 border border-green-500/30 text-green-400";
  }
  return "bg-slate-700/40 border border-slate-600 text-slate-300";
};

const tabBtn = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
    active
      ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
      : "bg-slate-800 border-slate-700 text-slate-400"
  }`;

export default function RootCauseAnalysis({ selectedCompanyId }: RootCauseAnalysisProps) {
  void selectedCompanyId;

  const [activeRcaTab, setActiveRcaTab] = useState<RcaTab>(1);
  const [rcaView, setRcaView] = useState<RcaView>("logic");
  const [aiSuggested, setAiSuggested] = useState(false);

  return (
    <div className="w-full min-h-full bg-slate-950 text-white px-4 py-6 md:px-6">
      {/* ===== GLOBAL HEADER ===== */}
      <div className={`${CARD} mb-6`}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
          Root Cause Analysis Engine
        </p>
        <div className="flex flex-wrap gap-2">
          <div className={PILL}>ASSET: Boiler Feed Pump B (P-101B)</div>
          <div className={PILL}>INCIDENT: Bearing Overheating &amp; Vibration Spike</div>
          <div className={PILL}>DATE: Aug 03, 2026</div>
          <div className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500 font-semibold">
            SEVERITY: High ($192.5k Risk)
          </div>
        </div>
      </div>

      {/* ===== SUB-TAB NAV ===== */}
      <div className="flex flex-wrap gap-2 mb-6">
        {RCA_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveRcaTab(tab.id)}
            className={tabBtn(activeRcaTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== TAB 1: LOGIC TREE & EVIDENCE ===== */}
      {activeRcaTab === 1 && (
        <>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-6">
            <div className="flex flex-wrap gap-2">
              {RCA_VIEWS.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setRcaView(view.id)}
                  className={tabBtn(rcaView === view.id)}
                >
                  {view.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAiSuggested(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-purple-500/40 bg-gradient-to-r from-purple-500/10 to-cyan-500/10 text-xs font-semibold cursor-pointer hover:border-cyan-500/50 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              <span className="bg-gradient-to-r from-purple-300 to-cyan-300 bg-clip-text text-transparent">
                ✨ AI Auto-Suggest Causal Nodes
              </span>
            </button>
          </div>

          {aiSuggested && (
            <div className="mb-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300">
              AI suggested 2 additional latent nodes (training gap + SOP revision lag). Review and
              verify before locking the logic tree.
            </div>
          )}

          {rcaView === "logic" && (
            <div className={`${CARD} mb-6`}>
              <h3 className="text-base font-bold text-white mb-6">PROACT Logic Tree</h3>
              <div className="flex flex-col items-center">
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-3 text-center max-w-md">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1">
                    Problem
                  </p>
                  <p className="text-sm font-semibold text-white">
                    Bearing Overheating &amp; Vibration Spike — P-101B DE
                  </p>
                </div>

                <div className="w-px h-8 bg-white/20" />
                <div className="h-px w-full max-w-4xl bg-white/20" />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-5xl mt-0">
                  {LOGIC_BRANCHES.map((branch) => (
                    <div key={branch.title} className="flex flex-col items-center">
                      <div className="w-px h-6 bg-white/20" />
                      <div
                        className={`w-full rounded-lg border bg-slate-950/60 px-3 py-2 text-center mb-3 ${branch.tone}`}
                      >
                        <p className="text-xs font-bold">{branch.title}</p>
                      </div>
                      <div className="w-full space-y-2">
                        {branch.nodes.map((node) => (
                          <div
                            key={node.text}
                            className="rounded-lg border border-white/10 bg-slate-950/80 p-3"
                          >
                            <p className="text-xs text-slate-200 mb-2 leading-snug">{node.text}</p>
                            <EvidenceBadge status={node.status} />
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            alert(
                              "Opens modal to add custom field finding or hypothesis node."
                            )
                          }
                          className="w-full mt-3 py-2 border border-dashed border-slate-600 text-slate-400 rounded-lg hover:border-cyan-500 hover:text-cyan-400 hover:bg-cyan-500/5 transition-all text-sm font-medium flex items-center justify-center gap-1 cursor-pointer"
                        >
                          + Add Hypothesis
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {rcaView === "fishbone" && (
            <div className={`${CARD} mb-6 overflow-x-auto`}>
              <h3 className="text-base font-bold text-white mb-6">Ishikawa Diagram (6Ms)</h3>
              <div className="min-w-[720px] relative py-8">
                <div className="absolute left-8 right-28 top-1/2 h-0.5 bg-cyan-500/60 -translate-y-1/2" />
                <div className="absolute right-8 top-1/2 -translate-y-1/2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 max-w-[160px] text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-400">
                    Effect
                  </p>
                  <p className="text-xs font-semibold text-white">Bearing Failure</p>
                </div>

                <div className="grid grid-cols-3 gap-6 pr-44 pl-4">
                  {FISHBONE_RIBS.filter((r) => r.side === "top").map((rib) => (
                    <div key={rib.label} className="flex flex-col items-center">
                      <div className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 w-full mb-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-2">
                          {rib.label}
                        </p>
                        <ul className="space-y-1">
                          {rib.items.map((item) => (
                            <li key={item} className="text-[11px] text-slate-300">
                              • {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="w-px h-10 bg-cyan-500/40" />
                    </div>
                  ))}
                </div>

                <div className="h-8" />

                <div className="grid grid-cols-3 gap-6 pr-44 pl-4">
                  {FISHBONE_RIBS.filter((r) => r.side === "bottom").map((rib) => (
                    <div key={rib.label} className="flex flex-col items-center">
                      <div className="w-px h-10 bg-cyan-500/40" />
                      <div className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 w-full mt-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400 mb-2">
                          {rib.label}
                        </p>
                        <ul className="space-y-1">
                          {rib.items.map((item) => (
                            <li key={item} className="text-[11px] text-slate-300">
                              • {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <EvidenceBadge status="verified" />
                <EvidenceBadge status="disproved" />
                <EvidenceBadge status="untested" />
              </div>
            </div>
          )}

          {rcaView === "5whys" && (
            <div className={`${CARD} mb-6`}>
              <h3 className="text-base font-bold text-white mb-4">5 Whys Sequence</h3>
              <ol className="space-y-4">
                {FIVE_WHYS.map((row, idx) => (
                  <li
                    key={row.why}
                    className="rounded-lg border border-white/10 bg-slate-950/60 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-bold text-cyan-400">
                        {idx + 1}. {row.why}
                      </p>
                      <EvidenceBadge status={row.status} />
                    </div>
                    <p className="text-sm text-slate-200">{row.answer}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      {/* ===== TAB 2: SNAPCHART TIMELINE ===== */}
      {activeRcaTab === 2 && (
        <>
          <div className={`${CARD} mb-6`}>
            <h3 className="text-base font-bold text-white mb-1">
              Synchronized Telemetry–Visual Timeline
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Event track aligned with bearing temperature and vibration RMS sparklines.
            </p>

            {/* Top track — events */}
            <div className="relative mb-8 px-2">
              <div className="absolute left-4 right-4 top-3 h-0.5 bg-white/20" />
              <div className="grid grid-cols-3 gap-2 relative">
                {TIMELINE_EVENTS.map((ev) => (
                  <div key={ev.date} className="flex flex-col items-center text-center">
                    <div className="w-3 h-3 rounded-full bg-cyan-400 border-2 border-slate-950 mb-2" />
                    <p className="text-[10px] font-bold text-cyan-400">{ev.date}</p>
                    <p className="text-xs text-slate-300 mt-1">{ev.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Synchronized telemetry chart with crosshair cursor */}
            <div className="h-72 bg-slate-950 rounded-lg border border-white/10 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={timelineData}
                  margin={{ top: 16, right: 40, bottom: 12, left: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis
                    yAxisId="temp"
                    stroke="#ef4444"
                    tick={{ fontSize: 11 }}
                    label={{
                      value: "Temp °C",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#ef4444",
                      fontSize: 10
                    }}
                  />
                  <YAxis
                    yAxisId="vib"
                    orientation="right"
                    stroke="#eab308"
                    tick={{ fontSize: 11 }}
                    label={{
                      value: "mm/s",
                      angle: 90,
                      position: "insideRight",
                      fill: "#eab308",
                      fontSize: 10
                    }}
                  />
                  <Tooltip
                    cursor={{ stroke: "#06b6d4", strokeWidth: 1, strokeDasharray: "4 4" }}
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: "8px",
                      color: "#fff"
                    }}
                    formatter={(value, name) => {
                      if (name === "temp") return [`${value}°C`, "Temp"];
                      if (name === "vibration") return [`${value} mm/s`, "Vibration"];
                      return [value, name];
                    }}
                    labelFormatter={(label, payload) => {
                      const row = payload?.[0]?.payload as
                        | (typeof timelineData)[number]
                        | undefined;
                      if (!row) return `Date: ${label}`;
                      return `Date: ${row.date} | Temp: ${row.temp}°C | Vibration: ${row.vibration} mm/s | Event: ${row.event}`;
                    }}
                  />
                  <Legend />
                  <ReferenceLine
                    yAxisId="temp"
                    x="Aug 03"
                    stroke="#ef4444"
                    strokeDasharray="3 3"
                  />
                  <Line
                    yAxisId="temp"
                    type="monotone"
                    dataKey="temp"
                    stroke="#ef4444"
                    strokeWidth={2.5}
                    name="Bearing Temp"
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    yAxisId="vib"
                    type="monotone"
                    dataKey="vibration"
                    stroke="#eab308"
                    strokeWidth={2.5}
                    name="Vibration RMS"
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3 text-yellow-400 text-sm mb-6">
            ⚠️ Process Change Detected: Switched lubricant supplier on Jul 15.
          </div>
        </>
      )}

      {/* ===== TAB 3: 3-TIER CAUSE BREAKDOWN ===== */}
      {activeRcaTab === 3 && (
        <div className="mb-6">
          <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-2">
              Physical Root Cause
            </p>
            <p className="text-base font-bold text-white mb-2">
              Bearing Spalling / Lubrication Starvation
            </p>
            <p className="text-sm text-slate-400">
              Evidence: gSE peak at 3.58X (BPFO) + Oil PQ Index = 145
            </p>
          </div>

          <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-500 mb-2">
              Human Root Cause
            </p>
            <p className="text-base font-bold text-white mb-2">
              Incorrect lubricant quantity applied
            </p>
            <p className="text-sm text-slate-400">
              Evidence: PM log notes &apos;added grease until purge&apos;
            </p>
          </div>

          <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-2">
              Latent / Systemic Root Cause
            </p>
            <p className="text-base font-bold text-white mb-2">
              PM Procedure SOP #204 lacks precise gram-weight specs
            </p>
            <p className="text-sm text-slate-400">Evidence: SOP last updated in 2018</p>
          </div>
        </div>
      )}

      {/* ===== TAB 4: CAPA & ROI ENGINE ===== */}
      {activeRcaTab === 4 && (
        <>
          <div className={`${CARD} mb-6`}>
            <h3 className="text-base font-bold text-white mb-4">Failure Financial Impact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs text-slate-400 mb-1">Unplanned Downtime</p>
                <p className="text-lg font-semibold text-white">$180,000</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Component Replacement</p>
                <p className="text-lg font-semibold text-white">$12,500</p>
              </div>
            </div>
            <div className="space-y-2 border-t border-white/10 pt-4">
              <p className="text-lg font-bold text-red-500">Total Failure Cost: $192,500</p>
              <p className="text-base font-semibold text-green-400">Total CAPA Cost: $2,500</p>
              <p className="text-2xl font-bold text-cyan-400 pt-2">
                Projected 3-Year ROI: 7,600% (Net Saved: $190,000)
              </p>
            </div>
          </div>

          <div className={`${CARD} mb-6`}>
            <h3 className="text-base font-bold text-white mb-4">SMARTER Corrective Actions</h3>
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 text-left text-[10px] uppercase tracking-widest">
                    <th className="px-3 py-2 font-bold">Action</th>
                    <th className="px-3 py-2 font-bold">Cost</th>
                    <th className="px-3 py-2 font-bold">Owner</th>
                    <th className="px-3 py-2 font-bold">Target Date</th>
                    <th className="px-3 py-2 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {CAPA_ROWS.map((row) => (
                    <tr key={row.action} className="border-t border-white/10">
                      <td className="px-3 py-2.5 text-white font-medium">{row.action}</td>
                      <td className="px-3 py-2.5 text-slate-300 font-mono">{row.cost}</td>
                      <td className="px-3 py-2.5 text-slate-400">{row.owner}</td>
                      <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">{row.target}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${capaStatusClass(row.status)}`}
                        >
                          {row.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
