import React, { useState } from "react";
import { Sparkles, Zap } from "lucide-react";

/* ========================================================================== */
/* Props (unchanged contract for App.tsx)                                     */
/* ========================================================================== */

interface MaintenanceCalendarProps {
  selectedCompanyId?: number;
  onNavigateToTrends?: (assetId?: string) => void;
}

const CARD = "bg-slate-900/50 border border-white/10 rounded-xl p-6";

type CalTab = 1 | 2 | 3 | 4;
type CalView = "month" | "week" | "gantt" | "list";
type GroupBy = "asset" | "tech";

const CAL_TABS: { id: CalTab; label: string }[] = [
  { id: 1, label: "🗓️ Schedule & Dispatch" },
  { id: 2, label: "👷 Resource & Skills" },
  { id: 3, label: "📦 Parts & Downtime" },
  { id: 4, label: "📋 PM/PdM Templates" }
];

const CAL_VIEWS: { id: CalView; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "gantt", label: "Gantt" },
  { id: "list", label: "List" }
];

interface WorkOrderPeek {
  id: string;
  title: string;
  time: string;
  tech: string;
  tools: string;
  parts: string;
  vibration: string;
  assetId: string;
}

const FEATURED_WO: WorkOrderPeek = {
  id: "wo-vib-p101a",
  title: "Boiler Feed Pump A (Vib Route)",
  time: "8:00 AM",
  tech: "M. Delgado (Vib LII)",
  tools: "Accelerometer kit, laser tachometer",
  parts: "None (inspection route)",
  vibration: "2.8 mm/s",
  assetId: "P-101A"
};

const TECHNICIANS = [
  {
    name: "M. Delgado",
    skills: "Vib LII, Laser Align",
    hours: 36,
    capacity: 48,
    pct: 75,
    bar: "bg-yellow-500",
    certExpiry: "⚠️ Cert Expires Nov 12"
  },
  {
    name: "J. Chen",
    skills: "Ultrasound I, Oil Analysis",
    hours: 22,
    capacity: 48,
    pct: 46,
    bar: "bg-green-500",
    certExpiry: null as string | null
  },
  {
    name: "R. Okonkwo",
    skills: "MCA, Thermography II",
    hours: 44,
    capacity: 48,
    pct: 92,
    bar: "bg-red-500",
    certExpiry: null as string | null
  }
];

const PARTS_ROWS = [
  {
    part: "SKF 6214 Bearing",
    required: 2,
    inStock: 5,
    status: "ready" as const,
    statusLabel: "🟢 Ready"
  },
  {
    part: "Mechanical Seal Plan 53B",
    required: 1,
    inStock: 0,
    status: "awaiting" as const,
    statusLabel: "🟡 Awaiting Spare Parts"
  }
];

const TEMPLATES = [
  {
    id: "monthly-vib",
    title: "Monthly Vibration Route",
    desc: "ISO 20816 broadband + spectral checkpoints for critical pumps."
  },
  {
    id: "annual-bearing",
    title: "Annual Bearing Inspection",
    desc: "DE/NDE housing ΔT, ultrasound gSE, and grease purge verification."
  },
  {
    id: "quarterly-align",
    title: "Quarterly Laser Alignment",
    desc: "Coupling soft-foot check and 2X harmonic baseline capture."
  },
  {
    id: "oil-route",
    title: "Bi-Weekly Oil Sample Route",
    desc: "Wear metals, PQ index, and ISO cleanliness for gearbox sumps."
  }
];

const MONTH_DAYS = Array.from({ length: 35 }, (_, i) => {
  const day = i - 4; // mock Aug 2026 starting mid-week
  return day >= 1 && day <= 31 ? day : null;
});

const tabBtn = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
    active
      ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
      : "bg-slate-800 border-slate-700 text-slate-400"
  }`;

export default function MaintenanceCalendar({
  selectedCompanyId,
  onNavigateToTrends
}: MaintenanceCalendarProps) {
  void selectedCompanyId;

  const [activeCalTab, setActiveCalTab] = useState<CalTab>(1);
  const [calView, setCalView] = useState<CalView>("month");
  const [groupBy, setGroupBy] = useState<GroupBy>("asset");
  const [selectedWO, setSelectedWO] = useState<WorkOrderPeek | null>(null);

  return (
    <div className="w-full min-h-full bg-slate-950 text-white px-4 py-6 md:px-6">
      {/* ===== GLOBAL HEADER ===== */}
      <div className={`${CARD} mb-6`}>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
              Maintenance Calendar Engine
            </p>
            <div className="flex flex-wrap gap-2">
              <div className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs">
                <span className="text-slate-300">WORK ORDERS: 31 Total </span>
                <span className="text-red-500 font-semibold">(2 Overdue)</span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-green-400 font-semibold">
                PM RATIO: 80% Goal (Active)
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-yellow-500 font-semibold">
                DOWNTIME COST: $116,300 Est.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={() => alert("Optimizing schedule with AI constraint solver…")}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-500/40 text-cyan-400 text-xs font-semibold cursor-pointer hover:bg-cyan-500/10 transition-colors"
            >
              <Zap className="h-3.5 w-3.5" />
              Optimize Schedule
            </button>
            <button
              type="button"
              onClick={() => alert("Opening New Work Order form…")}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold cursor-pointer transition-colors"
            >
              + New Work Order
            </button>
          </div>
        </div>
      </div>

      {/* ===== SUB-TAB NAV ===== */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CAL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveCalTab(tab.id)}
            className={tabBtn(activeCalTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== TAB 1: SCHEDULE & DISPATCH ===== */}
      {activeCalTab === 1 && (
        <>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-6">
            <div className="flex flex-wrap gap-2">
              {CAL_VIEWS.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setCalView(view.id)}
                  className={tabBtn(calView === view.id)}
                >
                  {view.label}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-400">
              Group By:
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-cyan-500"
              >
                <option value="asset">Asset Route</option>
                <option value="tech">Technician</option>
              </select>
            </label>
          </div>

          {calView === "month" && (
            <div className={`${CARD} mb-6`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-white">August 2026</h3>
                <p className="text-xs text-slate-400">
                  Grouped by {groupBy === "asset" ? "Asset Route" : "Technician"}
                </p>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div
                    key={d}
                    className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 py-2"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {MONTH_DAYS.map((day, idx) => (
                  <div
                    key={idx}
                    className="min-h-[88px] rounded-lg border border-white/10 bg-slate-950/50 p-1.5"
                  >
                    {day && (
                      <>
                        <p className="text-[10px] text-slate-500 mb-1">{day}</p>
                        {day === 4 && (
                          <button
                            type="button"
                            onClick={() => setSelectedWO(FEATURED_WO)}
                            className="w-full text-left rounded-md border border-red-500/40 bg-red-500/10 p-1.5 cursor-pointer hover:border-cyan-500/50 transition-colors"
                          >
                            <p className="text-[10px] font-bold text-white leading-tight">
                              {FEATURED_WO.time} — {FEATURED_WO.title}
                            </p>
                            <span className="inline-flex mt-1 text-[9px] font-bold text-red-400">
                              🔴 Sensor Triggered
                            </span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {calView === "week" && (
            <div className={`${CARD} mb-6`}>
              <h3 className="text-base font-bold text-white mb-4">Week View</h3>
              <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
                  <div
                    key={d}
                    className="rounded-lg border border-white/10 bg-slate-950/50 p-3 min-h-[120px]"
                  >
                    <p className="text-[10px] font-bold text-slate-500 mb-2">{d}</p>
                    {i === 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedWO(FEATURED_WO)}
                        className="w-full text-left text-[10px] rounded border border-red-500/40 bg-red-500/10 p-2 cursor-pointer"
                      >
                        8:00 AM Vib Route
                        <span className="block text-red-400 mt-1">🔴 Sensor Triggered</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {calView === "gantt" && (
            <div className={`${CARD} mb-6 overflow-x-auto`}>
              <h3 className="text-base font-bold text-white mb-4">
                Gantt — by {groupBy === "asset" ? "Asset Route" : "Technician"}
              </h3>
              <div className="min-w-[640px] space-y-3">
                {(groupBy === "asset"
                  ? ["P-101A Vib Route", "GB-302 Oil Sample", "MCC-12 IR Scan"]
                  : ["M. Delgado", "J. Chen", "R. Okonkwo"]
                ).map((row, i) => (
                  <div key={row} className="flex items-center gap-3">
                    <p className="w-40 shrink-0 text-xs text-slate-300 truncate">{row}</p>
                    <div className="flex-1 h-8 rounded bg-slate-950 border border-white/10 relative">
                      <button
                        type="button"
                        onClick={() => setSelectedWO(FEATURED_WO)}
                        className="absolute top-1 bottom-1 rounded bg-cyan-500/30 border border-cyan-500/50 cursor-pointer hover:bg-cyan-500/40"
                        style={{ left: `${10 + i * 18}%`, width: "22%" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {calView === "list" && (
            <div className={`${CARD} mb-6`}>
              <h3 className="text-base font-bold text-white mb-4">Work Order List</h3>
              <div className="w-full overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="bg-slate-950/80 text-slate-400 text-left text-[10px] uppercase tracking-widest">
                      <th className="px-3 py-2 font-bold">Time</th>
                      <th className="px-3 py-2 font-bold">Work Order</th>
                      <th className="px-3 py-2 font-bold">Tech</th>
                      <th className="px-3 py-2 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-white/10">
                      <td className="px-3 py-2.5 text-slate-300">{FEATURED_WO.time}</td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => setSelectedWO(FEATURED_WO)}
                          className="text-white font-medium hover:text-cyan-400 cursor-pointer"
                        >
                          {FEATURED_WO.title}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">{FEATURED_WO.tech}</td>
                      <td className="px-3 py-2.5 text-red-400 text-xs font-bold">
                        🔴 Sensor Triggered
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Quick-Peek panel (static, scrolls with page — not fixed) */}
          {selectedWO && (
            <div className={`${CARD} mb-6 border-cyan-500/30`}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-1">
                    Quick Peek
                  </p>
                  <h3 className="text-base font-bold text-white">
                    {selectedWO.time} — {selectedWO.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedWO(null)}
                  className="text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Assigned Tech
                  </p>
                  <p className="text-sm text-white">{selectedWO.tech}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Required Tools / Parts
                  </p>
                  <p className="text-sm text-slate-300">{selectedWO.tools}</p>
                  <p className="text-xs text-slate-500 mt-1">{selectedWO.parts}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Live Sensor Health
                  </p>
                  <p className="text-sm text-red-400 font-semibold">
                    Vibration: {selectedWO.vibration} 🔴
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigateToTrends?.(selectedWO.assetId)}
                    className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer underline"
                  >
                    Open Trend Analyzer →
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== TAB 2: RESOURCE & SKILLS ===== */}
      {activeCalTab === 2 && (
        <>
          <div className={`${CARD} mb-6`}>
            <h3 className="text-base font-bold text-white mb-4">
              Technician Workload Heatmap
            </h3>
            <div className="space-y-4">
              {TECHNICIANS.map((tech) => (
                <div key={tech.name}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-white">
                        {tech.name}{" "}
                        <span className="text-slate-400 font-normal">({tech.skills})</span>
                      </p>
                      {tech.certExpiry && (
                        <span className="text-xs text-yellow-500 font-semibold">
                          {tech.certExpiry}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {tech.hours}h / {tech.capacity}h Assigned
                    </p>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded">
                    <div
                      className={`h-2 ${tech.bar} rounded`}
                      style={{ width: `${tech.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${CARD} mb-6`}>
            <h3 className="text-base font-bold text-white mb-3">Skill-to-WO Lockout</h3>
            <div className="rounded-lg border border-white/10 bg-slate-950/60 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">
                  WO-4481 — P-101A High-Freq Bearing Diagnostics
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Attempted assign: R. Okonkwo (MCA / Thermography)
                </p>
              </div>
              <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-xs font-bold text-slate-300">
                Status: 🔒 Locked (Requires Vibration LII)
              </span>
            </div>
          </div>
        </>
      )}

      {/* ===== TAB 3: PARTS & DOWNTIME ===== */}
      {activeCalTab === 3 && (
        <>
          <div className={`${CARD} mb-6`}>
            <h3 className="text-base font-bold text-white mb-4">
              Kitting &amp; Parts Reservation
            </h3>
            <div className="w-full overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 text-left text-[10px] uppercase tracking-widest">
                    <th className="px-3 py-2 font-bold">Part</th>
                    <th className="px-3 py-2 font-bold">Required</th>
                    <th className="px-3 py-2 font-bold">In Stock</th>
                    <th className="px-3 py-2 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {PARTS_ROWS.map((row) => (
                    <tr key={row.part} className="border-t border-white/10">
                      <td className="px-3 py-2.5 text-white font-medium">{row.part}</td>
                      <td className="px-3 py-2.5 text-slate-300">{row.required}</td>
                      <td className="px-3 py-2.5 text-slate-300">{row.inStock}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.status === "ready"
                              ? "bg-green-500/15 border border-green-500/30 text-green-400"
                              : "bg-yellow-500/15 border border-yellow-500/30 text-yellow-400"
                          }`}
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

          <div className={`${CARD} mb-6`}>
            <h3 className="text-base font-bold text-white mb-1">
              Production Schedule Collision Detector
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Planned Downtime (61h) overlapping with Production Run
            </p>
            <div className="relative h-14 rounded-lg border border-white/10 bg-slate-950 overflow-hidden mb-4">
              <div
                className="absolute top-2 bottom-2 left-[8%] w-[55%] rounded bg-blue-500/30 border border-blue-400/40"
                title="Production Run"
              />
              <div
                className="absolute top-3 bottom-3 left-[35%] w-[40%] rounded bg-yellow-500/40 border border-yellow-400/50"
                title="Planned Downtime 61h"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[10px] font-bold text-yellow-300 bg-slate-950/80 px-2 py-0.5 rounded border border-yellow-500/30">
                  Collision Zone
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-[10px] text-slate-400 mb-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/60" /> Production Run
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-yellow-500/70" /> Planned Downtime (61h)
              </span>
            </div>
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
              <p className="text-sm font-semibold text-yellow-400">
                Financial Exposure: $14,500 (Planned) + $45,000 (Unplanned Penalty Risk)
              </p>
            </div>
          </div>
        </>
      )}

      {/* ===== TAB 4: PM/PdM TEMPLATE STUDIO ===== */}
      {activeCalTab === 4 && (
        <>
          <div className={`${CARD} mb-6`}>
            <h3 className="text-base font-bold text-white mb-2">
              Condition-Based Trigger Rules
            </h3>
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-4 flex items-start gap-3">
              <Sparkles className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-200">
                <span className="font-mono text-cyan-300">
                  IF gSE &gt; 3.5 OR Bearing Temp &gt; 85°C
                </span>
                <span className="text-slate-400"> → </span>
                <span className="font-semibold text-white">
                  Auto-generate Priority 1 PdM Work Order
                </span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {TEMPLATES.map((tpl) => (
              <div key={tpl.id} className={CARD}>
                <h4 className="text-base font-bold text-white mb-2">{tpl.title}</h4>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">{tpl.desc}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => alert(`Generating work order from template: ${tpl.title}`)}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold cursor-pointer transition-colors"
                  >
                    Generate Work Order
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      alert(`Executing immediate route from template: ${tpl.title}`)
                    }
                    className="px-3 py-1.5 rounded-lg border border-cyan-500/40 text-cyan-400 text-xs font-semibold cursor-pointer hover:bg-cyan-500/10 transition-colors"
                  >
                    ⚡ Execute Immediate Route
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
