import React, { useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Radio, TrendingUp, Wrench
} from "lucide-react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

/* ========================================================================== */
/* Props (unchanged contract for App.tsx / sidebar)                           */
/* ========================================================================== */

interface DashboardProps {
  companyId: number;
  onNavigate: (tab: "diagnose" | "history" | "trends" | "sensors" | "assets" | "migration") => void;
  onSelectReport?: (report: any) => void;
  onStartQuickAnalysis: () => void;
  onAddAsset: () => void;
}

type AssetFilter = "All" | "Class A" | "Class B/C";

const CARD = "bg-slate-900/50 border border-white/10 rounded-xl p-6";

const TECH_COVERAGE = [
  { name: "Vibration Analysis", pct: 92, detail: "Route Coverage" },
  { name: "Oil / Lubrication Analysis", pct: 78, detail: "Sample Coverage" },
  { name: "Infrared Thermography", pct: 85, detail: "Inspection Coverage" },
  { name: "Motor Current (MCSA)", pct: 90, detail: "Monitoring Coverage" }
];

const ZONE_DISTRIBUTION = [
  { zone: "Zone A", count: 85, color: "bg-green-500", text: "text-green-400", border: "border-green-500/40" },
  { zone: "Zone B", count: 40, color: "bg-yellow-500", text: "text-yellow-500", border: "border-yellow-500/40" },
  { zone: "Zone C", count: 15, color: "bg-orange-500", text: "text-orange-400", border: "border-orange-500/40" },
  { zone: "Zone D", count: 2, color: "bg-red-500", text: "text-red-500", border: "border-red-500/40" }
];

const TOTAL_ZONE_ASSETS = ZONE_DISTRIBUTION.reduce((sum, z) => sum + z.count, 0);

type BadActor = {
  id: string;
  name: string;
  detail: string;
  classTier: "A" | "BC";
};

const BAD_ACTORS: BadActor[] = [
  { id: "bfp-a", name: "Boiler Feed Pump A", detail: "+0.42/wk degradation", classTier: "A" },
  { id: "gb-302", name: "Extruder Gearbox GB-302", detail: "+0.38/wk degradation", classTier: "A" },
  { id: "ctf-4", name: "Cooling Tower Fan 4", detail: "+0.18/wk degradation", classTier: "BC" },
  { id: "hp-2", name: "Hydraulic Press #2", detail: "+0.15/wk degradation", classTier: "BC" },
  { id: "ssp-b", name: "Secondary Sump Pump B", detail: "+0.12/wk degradation", classTier: "BC" }
];

type AlarmItem = {
  id: string;
  name: string;
  zone: string;
  detail: string;
  classTier: "A" | "BC";
  severity: "critical" | "warning";
  status: "wo_progress" | "unassigned" | "warning";
};

const LIVE_ALARMS: AlarmItem[] = [
  {
    id: "alarm-bfp",
    name: "Boiler Feed Pump A",
    zone: "Zone D",
    detail: "High Vibration — CMMS sync active",
    classTier: "A",
    severity: "critical",
    status: "wo_progress"
  },
  {
    id: "alarm-gb",
    name: "Extruder Gearbox GB-302",
    zone: "Zone D",
    detail: "Gear mesh peak exceeded",
    classTier: "A",
    severity: "critical",
    status: "unassigned"
  },
  {
    id: "alarm-ctf",
    name: "Cooling Tower Fan 4",
    zone: "Zone B",
    detail: "Elevated bearing temperature — monitor",
    classTier: "BC",
    severity: "warning",
    status: "warning"
  },
  {
    id: "alarm-hp",
    name: "Hydraulic Press #2",
    zone: "Zone B",
    detail: "Minor pressure ripple detected",
    classTier: "BC",
    severity: "warning",
    status: "warning"
  },
  {
    id: "alarm-ssp",
    name: "Secondary Sump Pump B",
    zone: "Zone C",
    detail: "Low-severity cavitation warning",
    classTier: "BC",
    severity: "warning",
    status: "warning"
  }
];

const FILTER_OPTIONS: { value: AssetFilter; label: string }[] = [
  { value: "All", label: "All Assets" },
  { value: "Class A", label: "Class A (Critical)" },
  { value: "Class B/C", label: "Class B/C" }
];

const correlationData = [
  { time: "08:00", vibration: 2.1, load: 85 },
  { time: "10:00", vibration: 2.4, load: 90 },
  { time: "12:00", vibration: 3.1, load: 95 },
  { time: "14:00", vibration: 7.8, load: 110 }, // The spike
  { time: "16:00", vibration: 4.2, load: 100 },
  { time: "18:00", vibration: 2.5, load: 88 }
];

function filterBadActors(assetFilter: AssetFilter): BadActor[] {
  if (assetFilter === "Class A") {
    return BAD_ACTORS.filter((a) => a.id === "bfp-a" || a.id === "gb-302");
  }
  if (assetFilter === "Class B/C") {
    return BAD_ACTORS.filter((a) => a.id === "ctf-4" || a.id === "ssp-b");
  }
  // All: Class A + Cooling Tower Fan 4 + Hydraulic Press #2
  return BAD_ACTORS.filter(
    (a) => a.id === "bfp-a" || a.id === "gb-302" || a.id === "ctf-4" || a.id === "hp-2"
  );
}

function filterAlarms(assetFilter: AssetFilter): AlarmItem[] {
  if (assetFilter === "Class A") {
    return LIVE_ALARMS.filter((a) => a.id === "alarm-bfp" || a.id === "alarm-gb");
  }
  if (assetFilter === "Class B/C") {
    return LIVE_ALARMS.filter((a) => a.id === "alarm-ctf" || a.id === "alarm-ssp");
  }
  return LIVE_ALARMS.filter(
    (a) =>
      a.id === "alarm-bfp" ||
      a.id === "alarm-gb" ||
      a.id === "alarm-ctf" ||
      a.id === "alarm-hp"
  );
}

export default function Dashboard({
  companyId,
  onNavigate,
  onSelectReport,
  onStartQuickAnalysis,
  onAddAsset
}: DashboardProps) {
  void companyId;
  void onSelectReport;

  const [assetFilter, setAssetFilter] = useState<AssetFilter>("Class A");
  const filteredBadActors = filterBadActors(assetFilter);
  const filteredAlarms = filterAlarms(assetFilter);

  return (
    <div className="w-full min-w-0 bg-slate-950 text-slate-100 space-y-0">
      {/* ===== SECTION 1: TOP TELEMETRY BAR ===== */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 bg-slate-950 border-b border-slate-800 p-4 mb-6">
        <p className="text-sm font-bold text-white shrink-0">Plant: Main Refinery</p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {FILTER_OPTIONS.map((option, index, arr) => (
            <React.Fragment key={option.value}>
              <button
                type="button"
                onClick={() => setAssetFilter(option.value)}
                className={`px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer ${
                  assetFilter === option.value
                    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 font-bold"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                {option.label}
              </button>
              {index < arr.length - 1 && (
                <span className="text-slate-600 text-xs hidden sm:inline">|</span>
              )}
            </React.Fragment>
          ))}
        </div>

        <p className="text-xs sm:text-sm font-semibold text-green-400 shrink-0 lg:text-right">
          🟢 142/142 Sensors Online | Gateway Uptime: 99.8%
        </p>
      </div>

      {/* ===== SECTION 2: KPI METRIC RIBBON ===== */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Fleet Health Score
          </p>
          <p className="text-4xl font-bold text-green-400 leading-none">87%</p>
          <p className="text-xs text-slate-400 mt-3">Class A: 91% | Class B/C: 84%</p>
        </div>

        <div className={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Total Monitored
          </p>
          <p className="text-4xl font-bold text-white leading-none">142 Assets</p>
          <p className="text-xs text-slate-400 mt-3">
            100% Wireless Coverage | +3 Added This Month
          </p>
        </div>

        <div className={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Active Critical Alarms
          </p>
          <p className="text-4xl font-bold text-red-500 leading-none">4 Critical</p>
          <p className="text-xs text-slate-400 mt-3">15 Warnings | 2 Unacknowledged</p>
        </div>

        <div className={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Work Order Action Status
          </p>
          <p className="text-4xl font-bold text-cyan-400 leading-none">3 Scheduled</p>
          <p className="text-xs text-yellow-500 mt-3 font-semibold">
            1 Unassigned Action Required
          </p>
        </div>
      </div>

      {/* ===== SECTION 3: FINANCIAL RISK & MULTI-TECH COVERAGE ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className={CARD}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-yellow-500" />
            <h3 className="text-lg font-bold text-white">
              Financial Risk vs. Repair Cost (Worst Actor Exposure)
            </h3>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            Projected Failure Exposure:{" "}
            <span className="text-red-500 font-bold">$45,000</span>{" "}
            <span className="text-slate-500">(12h Downtime Risk)</span>
            {" | "}
            Cost to Fix: <span className="text-white font-bold">$2,500</span>
            {" | "}
            Action ROI: <span className="text-green-400 font-bold">1,700%</span>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onStartQuickAnalysis}
              className="px-3 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 text-xs font-bold cursor-pointer transition-colors"
            >
              Run Quick Analysis
            </button>
            <button
              type="button"
              onClick={() => onNavigate("trends")}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold cursor-pointer transition-colors"
            >
              Open Trends
            </button>
          </div>
        </div>

        <div className={CARD}>
          <div className="flex items-center gap-2 mb-4">
            <Radio className="h-4 w-4 text-cyan-400" />
            <h3 className="text-lg font-bold text-white">Multi-Tech Diagnostic Coverage</h3>
          </div>
          <ul className="space-y-4">
            {TECH_COVERAGE.map((tech) => (
              <li key={tech.name}>
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="text-sm text-slate-300">{tech.name}</span>
                  <span className="text-xs font-mono font-bold text-cyan-400 shrink-0">
                    {tech.pct}% {tech.detail}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-950 border border-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-cyan-400/80"
                    style={{ width: `${tech.pct}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ===== SECTION 4: AI SHIFT BRIEFING & LIVE ALARM FEED ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className={CARD}>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-yellow-500" />
            <h3 className="text-lg font-bold text-white">AI Shift Briefing</h3>
          </div>
          <p className="text-sm text-slate-300 mb-4 leading-relaxed">
            Good morning. 3 assets require immediate attention. Priority 1: Boiler Feed Pump A is
            degrading 3x faster than fleet average due to process overload. Priority 2: Extruder
            Gearbox GB-302 requires immediate lubrication check.
          </p>

          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
            Top {filteredBadActors.length} Bad Actors
          </p>
          <ul className="space-y-2.5">
            {filteredBadActors.map((actor, index) => (
              <li
                key={actor.id}
                className="flex items-start gap-3 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2.5"
              >
                <span className="shrink-0 w-6 h-6 rounded-md bg-yellow-500/15 border border-yellow-500/40 text-yellow-500 text-xs font-bold flex items-center justify-center">
                  #{index + 1}
                </span>
                <span className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {actor.name} ({actor.detail})
                  </p>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={CARD}>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h3 className="text-lg font-bold text-white">Live Alarm Feed &amp; CMMS Sync Status</h3>
          </div>

          <ul className="space-y-3">
            {filteredAlarms.map((alarm) => (
              <li
                key={alarm.id}
                className={`rounded-lg border p-3 ${
                  alarm.severity === "critical"
                    ? alarm.status === "unassigned"
                      ? "border-yellow-500/30 bg-yellow-500/5"
                      : "border-white/10 bg-slate-950/40"
                    : "border-slate-700/60 bg-slate-950/40"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {alarm.name} ({alarm.zone})
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{alarm.detail}</p>
                  </div>

                  {alarm.status === "wo_progress" && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/15 text-green-400 border border-green-500/40 shrink-0">
                      <CheckCircle2 className="h-3 w-3" />
                      WO #8812 - In Progress
                    </span>
                  )}

                  {alarm.status === "unassigned" && (
                    <div className="flex flex-wrap items-center gap-0 shrink-0">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/15 text-yellow-500 border border-yellow-500/40 animate-pulse">
                        <Wrench className="h-3 w-3" />
                        Action Required - Unassigned
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          alert(
                            "Opening modal to create Work Order #8813 for Extruder Gearbox GB-302..."
                          )
                        }
                        className="ml-2 px-2 py-1 rounded text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 transition-colors cursor-pointer"
                      >
                        + Create Work Order
                      </button>
                    </div>
                  )}

                  {alarm.status === "warning" && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-600 shrink-0">
                      Warning — Monitor
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate("history")}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold cursor-pointer transition-colors"
            >
              View Diagnosis Logs
            </button>
            <button
              type="button"
              onClick={onAddAsset}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold cursor-pointer transition-colors"
            >
              Add Asset
            </button>
          </div>
        </div>
      </div>

      {/* ===== SECTION 5: ASSET HEALTH DISTRIBUTION ===== */}
      <div className={`${CARD} mb-6`}>
        <h3 className="text-lg font-bold text-white mb-4">
          Asset Health Distribution (ISO 20816)
        </h3>

        <div className="h-10 rounded-lg overflow-hidden flex border border-white/10 mb-4">
          {ZONE_DISTRIBUTION.map((zone) => {
            const showLabel = zone.count >= 15;
            return (
              <div
                key={zone.zone}
                className={`${zone.color} flex items-center justify-center min-w-[30px]`}
                style={{ width: `${(zone.count / TOTAL_ZONE_ASSETS) * 100}%` }}
                title={`${zone.zone}: ${zone.count}`}
              >
                {showLabel && (
                  <span className="text-[10px] font-bold text-slate-950 uppercase tracking-wide px-1 truncate">
                    {zone.zone.split(" ")[1]} {zone.count}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {ZONE_DISTRIBUTION.map((zone) => (
            <div
              key={zone.zone}
              className={`rounded-lg border ${zone.border} bg-slate-950/40 p-3 text-center`}
            >
              <p className={`text-2xl font-bold font-mono ${zone.text}`}>{zone.count}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">
                {zone.zone}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ===== SECTION 6: CONTEXTUAL ANALYSIS ===== */}
      <div className={CARD}>
        <h3 className="text-lg font-bold text-white mb-4">
          Contextual Analysis: Vibration vs. Production Load
        </h3>
        <div className="mb-4 p-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10">
          <p className="text-sm font-semibold text-cyan-400">
            Correlation: Vibration spike at 14:00 directly correlates with 110% process overload.
          </p>
        </div>
        <div className="h-64 bg-slate-950 rounded-lg border border-white/10 p-2">
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={correlationData} margin={{ top: 20, right: 30, bottom: 20, left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" stroke="#94a3b8" />
              <YAxis
                yAxisId="left"
                stroke="#eab308"
                label={{
                  value: "Vibration (mm/s)",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#eab308"
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#3b82f6"
                label={{
                  value: "Load (%)",
                  angle: 90,
                  position: "insideRight",
                  fill: "#3b82f6"
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "8px"
                }}
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="vibration"
                stroke="#eab308"
                strokeWidth={2}
                name="Vibration (mm/s)"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="load"
                stroke="#3b82f6"
                strokeDasharray="5 5"
                strokeWidth={2}
                name="Production Load (%)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
