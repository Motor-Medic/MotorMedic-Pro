import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Radio,
  TrendingUp,
  Wrench
} from "lucide-react";

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

type DashboardPayload = {
  plantName: string | null;
  assetCount: number;
  fleetHealthScore: number | null;
  highAlerts: number;
  warningAlerts: number;
  unacknowledgedAlerts: number;
  scheduledWorkOrders: number;
  unassignedWorkOrders: number;
  financialRisk: {
    failureExposure: number;
    costToFix: number;
    roiPercent: number | null;
  } | null;
  techCoverage: Array<{ name: string; pct: number; detail: string }>;
  aiBriefing: string | null;
  badActors: Array<{
    id: string;
    name: string;
    detail: string;
    healthScore: number;
    severity: string;
    classTier: "A" | "BC";
  }>;
  liveAlarms: Array<{
    id: string;
    name: string;
    zone: string;
    detail: string;
    severity: "critical" | "warning";
    acknowledged: boolean;
    assetId: string | null;
  }>;
  healthZones: { A: number; B: number; C: number; D: number };
  recentAnalyses: unknown[];
  correlationData: unknown[];
  error?: string;
};

const CARD = "bg-slate-900/50 border border-white/10 rounded-xl p-6";

const FILTER_OPTIONS: { value: AssetFilter; label: string }[] = [
  { value: "All", label: "All Assets" },
  { value: "Class A", label: "Class A (Critical)" },
  { value: "Class B/C", label: "Class B/C" }
];

const ZONE_META = [
  { key: "A" as const, zone: "Zone A", color: "bg-green-500", text: "text-green-400", border: "border-green-500/40" },
  { key: "B" as const, zone: "Zone B", color: "bg-yellow-500", text: "text-yellow-500", border: "border-yellow-500/40" },
  { key: "C" as const, zone: "Zone C", color: "bg-orange-500", text: "text-orange-400", border: "border-orange-500/40" },
  { key: "D" as const, zone: "Zone D", color: "bg-red-500", text: "text-red-500", border: "border-red-500/40" }
];

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

function EmptyBlock({
  icon: Icon,
  title,
  message
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <div className="w-11 h-11 rounded-xl border border-slate-700 bg-slate-950 flex items-center justify-center mb-3">
        <Icon className="h-5 w-5 text-slate-500" />
      </div>
      <p className="text-sm font-semibold text-slate-300">{title}</p>
      <p className="text-xs text-slate-500 mt-1.5 max-w-sm">{message}</p>
    </div>
  );
}

export default function Dashboard({
  companyId,
  onNavigate,
  onSelectReport,
  onStartQuickAnalysis,
  onAddAsset
}: DashboardProps) {
  void onSelectReport;

  const [assetFilter, setAssetFilter] = useState<AssetFilter>("All");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const q =
          companyId != null && Number.isFinite(companyId)
            ? `?company_id=${encodeURIComponent(String(companyId))}`
            : "";
        const res = await fetch(`/api/dashboard${q}`);
        const json = (await res.json().catch(() => ({}))) as DashboardPayload;
        if (!res.ok) {
          throw new Error(json?.error || `Dashboard load failed (HTTP ${res.status})`);
        }
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const filteredBadActors = useMemo(() => {
    const actors = data?.badActors || [];
    if (assetFilter === "Class A") return actors.filter((a) => a.classTier === "A");
    if (assetFilter === "Class B/C") return actors.filter((a) => a.classTier === "BC");
    return actors;
  }, [data?.badActors, assetFilter]);

  const filteredAlarms = useMemo(() => {
    const alarms = data?.liveAlarms || [];
    if (assetFilter === "Class A") {
      return alarms.filter((a) => a.severity === "critical");
    }
    if (assetFilter === "Class B/C") {
      return alarms.filter((a) => a.severity === "warning");
    }
    return alarms;
  }, [data?.liveAlarms, assetFilter]);

  const zoneDistribution = useMemo(() => {
    const zones = data?.healthZones || { A: 0, B: 0, C: 0, D: 0 };
    return ZONE_META.map((z) => ({ ...z, count: zones[z.key] || 0 }));
  }, [data?.healthZones]);

  const totalZoneAssets = zoneDistribution.reduce((s, z) => s + z.count, 0);

  const fleetHealth = data?.fleetHealthScore;
  const healthTone =
    fleetHealth == null
      ? "text-slate-400"
      : fleetHealth >= 85
        ? "text-green-400"
        : fleetHealth >= 70
          ? "text-yellow-400"
          : fleetHealth >= 50
            ? "text-orange-400"
            : "text-red-500";

  if (loading) {
    return (
      <div className="w-full min-w-0 bg-slate-950 text-slate-100">
        <div className={`${CARD} flex flex-col items-center justify-center py-20`}>
          <Activity className="h-6 w-6 text-yellow-500 animate-pulse mb-3" />
          <p className="text-sm font-semibold text-slate-300">Loading health dashboard…</p>
          <p className="text-xs text-slate-500 mt-1">Fetching metrics from PostgreSQL.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 bg-slate-950 text-slate-100 space-y-0">
      {/* ===== SECTION 1: TOP TELEMETRY BAR ===== */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 bg-slate-950 border-b border-slate-800 p-4 mb-6">
        <p className="text-sm font-bold text-white shrink-0">
          Plant: {data?.plantName || "No plant configured"}
        </p>

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

        <p className="text-xs sm:text-sm font-semibold text-slate-400 shrink-0 lg:text-right">
          {(data?.assetCount ?? 0) > 0
            ? `${data?.assetCount} assets in database`
            : "No assets in database"}
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      )}

      {/* ===== SECTION 2: KPI METRIC RIBBON ===== */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Fleet Health Score
          </p>
          <p className={`text-4xl font-bold leading-none ${healthTone}`}>
            {fleetHealth != null ? `${fleetHealth}%` : "—"}
          </p>
          <p className="text-xs text-slate-400 mt-3">
            {fleetHealth != null
              ? "AVG(health_score) from analysis_results"
              : "No data available"}
          </p>
        </div>

        <div className={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Total Monitored
          </p>
          <p className="text-4xl font-bold text-white leading-none">
            {data?.assetCount ?? 0} Assets
          </p>
          <p className="text-xs text-slate-400 mt-3">
            From assets table
            {totalZoneAssets > 0 ? ` · ${totalZoneAssets} with health scores` : ""}
          </p>
        </div>

        <div className={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Active Critical Alarms
          </p>
          <p className="text-4xl font-bold text-red-500 leading-none">
            {data?.highAlerts ?? 0} Critical
          </p>
          <p className="text-xs text-slate-400 mt-3">
            {data?.warningAlerts ?? 0} Warnings | {data?.unacknowledgedAlerts ?? 0}{" "}
            Unacknowledged
          </p>
        </div>

        <div className={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Work Order Action Status
          </p>
          <p className="text-4xl font-bold text-cyan-400 leading-none">
            {data?.scheduledWorkOrders ?? 0} Scheduled
          </p>
          <p className="text-xs text-slate-400 mt-3 font-semibold">
            {(data?.unassignedWorkOrders ?? 0) > 0 ? (
              <span className="text-yellow-500">
                {data?.unassignedWorkOrders} Unassigned Action Required
              </span>
            ) : (
              "No unassigned work orders"
            )}
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
          {data?.financialRisk ? (
            <>
              <p className="text-sm text-slate-300 leading-relaxed">
                Projected Failure Exposure:{" "}
                <span className="text-red-500 font-bold">
                  {formatUsd(data.financialRisk.failureExposure)}
                </span>
                {" | "}
                Cost to Fix:{" "}
                <span className="text-white font-bold">
                  {formatUsd(data.financialRisk.costToFix)}
                </span>
                {" | "}
                Action ROI:{" "}
                <span className="text-green-400 font-bold">
                  {data.financialRisk.roiPercent != null
                    ? `${data.financialRisk.roiPercent.toLocaleString()}%`
                    : "—"}
                </span>
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
            </>
          ) : (
            <EmptyBlock
              icon={TrendingUp}
              title="No data available"
              message="Financial risk will appear after diagnostics save cost estimates."
            />
          )}
        </div>

        <div className={CARD}>
          <div className="flex items-center gap-2 mb-4">
            <Radio className="h-4 w-4 text-cyan-400" />
            <h3 className="text-lg font-bold text-white">Multi-Tech Diagnostic Coverage</h3>
          </div>
          {(data?.techCoverage?.length ?? 0) > 0 ? (
            <ul className="space-y-4">
              {data!.techCoverage.map((tech) => (
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
                      style={{ width: `${Math.min(100, Math.max(0, tech.pct))}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyBlock
              icon={Radio}
              title="No data available"
              message="Coverage percentages appear after diagnostics are run across technologies."
            />
          )}
        </div>
      </div>

      {/* ===== SECTION 4: AI SHIFT BRIEFING & LIVE ALARM FEED ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className={CARD}>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-yellow-500" />
            <h3 className="text-lg font-bold text-white">AI Shift Briefing</h3>
          </div>
          {data?.aiBriefing ? (
            <>
              <p className="text-sm text-slate-300 mb-4 leading-relaxed">{data.aiBriefing}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                Top {filteredBadActors.length} Bad Actors
              </p>
              {filteredBadActors.length > 0 ? (
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
                          {actor.name}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Health {actor.healthScore} · {actor.detail}
                        </p>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">No bad actors for this filter.</p>
              )}
            </>
          ) : (
            <EmptyBlock
              icon={Activity}
              title="No data available"
              message="Shift briefing is generated from recent diagnostic analyses."
            />
          )}
        </div>

        <div className={CARD}>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h3 className="text-lg font-bold text-white">Live Alarm Feed &amp; CMMS Sync Status</h3>
          </div>

          {filteredAlarms.length > 0 ? (
            <ul className="space-y-3">
              {filteredAlarms.map((alarm) => (
                <li
                  key={alarm.id}
                  className={`rounded-lg border p-3 ${
                    alarm.severity === "critical"
                      ? "border-red-500/30 bg-red-500/5"
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
                    {alarm.acknowledged ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/15 text-green-400 border border-green-500/40 shrink-0">
                        <CheckCircle2 className="h-3 w-3" />
                        Acknowledged
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/15 text-yellow-500 border border-yellow-500/40 shrink-0">
                        <Wrench className="h-3 w-3" />
                        Unacknowledged
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyBlock
              icon={AlertTriangle}
              title="No data available"
              message="Alarms appear here when diagnostics create HIGH/MEDIUM severity alerts."
            />
          )}

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

        {totalZoneAssets > 0 ? (
          <>
            <div className="h-10 rounded-lg overflow-hidden flex border border-white/10 mb-4">
              {zoneDistribution.map((zone) => {
                const showLabel = zone.count > 0 && zone.count / totalZoneAssets >= 0.08;
                return (
                  <div
                    key={zone.zone}
                    className={`${zone.color} flex items-center justify-center min-w-0`}
                    style={{
                      width: `${(zone.count / totalZoneAssets) * 100}%`,
                      minWidth: zone.count > 0 ? 8 : 0
                    }}
                    title={`${zone.zone}: ${zone.count}`}
                  >
                    {showLabel && (
                      <span className="text-[10px] font-bold text-slate-950 uppercase tracking-wide px-1 truncate">
                        {zone.key} {zone.count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {zoneDistribution.map((zone) => (
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
          </>
        ) : (
          <EmptyBlock
            icon={Activity}
            title="No data available"
            message="Health zone distribution is calculated from latest analysis health scores."
          />
        )}
      </div>

      {/* ===== SECTION 6: CONTEXTUAL ANALYSIS ===== */}
      <div className={CARD}>
        <h3 className="text-lg font-bold text-white mb-4">
          Contextual Analysis: Vibration vs. Production Load
        </h3>
        <EmptyBlock
          icon={TrendingUp}
          title="No data available"
          message="Vibration vs. load correlation will appear when paired process telemetry is available."
        />
      </div>
    </div>
  );
}
