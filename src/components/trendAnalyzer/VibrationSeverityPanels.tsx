import type { ReactNode } from "react";
import { Sparkles, Wrench } from "lucide-react";
import {
  classifyZone,
  isoZoneBands,
  isoZoneLabel,
  type IsoZone
} from "../../lib/vibration/isoZone";
import {
  formatVelocityDisplay,
  formatVelocityMmS,
  velocityValueForDisplay,
  type VelocityDisplayUnit
} from "../../lib/vibration/units";

const CARD = "bg-slate-900/50 border border-white/10 rounded-xl p-6";

const ZONE_ACTION: Record<IsoZone, string> = {
  A: "Continue routine condition monitoring.",
  B: "Continue routine condition monitoring.",
  C: "Schedule corrective maintenance and re-check the trend.",
  D: "Immediate corrective action required — plan intervention now."
};

export interface VibrationSeverityPanelProps {
  /** Overall velocity in canonical mm/s RMS. */
  valueMmS: number | null;
  /** Display-only preference; classification ALWAYS uses valueMmS (mm/s RMS). */
  velocityUnit?: VelocityDisplayUnit;
  machineClass?: string | null;
}

function velocityLabel(
  valueMmS: number,
  velocityUnit?: VelocityDisplayUnit
): string {
  return velocityUnit
    ? formatVelocityDisplay(valueMmS, velocityUnit)
    : formatVelocityMmS(valueMmS);
}

function bandEdgeLabel(
  valueMmS: number,
  velocityUnit?: VelocityDisplayUnit
): string {
  if (velocityUnit === "in/s") {
    return velocityValueForDisplay(valueMmS, "in/s").toFixed(4);
  }
  return valueMmS.toFixed(2);
}

export function VibrationIsoMatrix({
  valueMmS,
  velocityUnit,
  machineClass
}: VibrationSeverityPanelProps) {
  const bands = isoZoneBands(machineClass);
  const scaleMax = bands[bands.length - 1].to;
  const zone = classifyZone(valueMmS, machineClass);
  const markerPct =
    valueMmS != null && Number.isFinite(valueMmS)
      ? Math.min(100, Math.max(0, (valueMmS / scaleMax) * 100))
      : null;
  const bandUnit = velocityUnit ?? "mm/s";

  return (
    <div className={`${CARD} mb-6`}>
      <h3 className="text-base font-bold text-white mb-1">
        ISO 20816 Severity Matrix
      </h3>
      <p className="text-xs text-slate-400 mb-4">
        {valueMmS != null
          ? `Current asset marker at ${velocityLabel(valueMmS, velocityUnit)} (Zone ${
              zone ?? "—"
            } — ${isoZoneLabel(zone)})`
          : "No overall velocity available yet — run a diagnostic to place the severity marker."}
        {machineClass && machineClass !== "Not set" ? ` · ${machineClass}` : ""}
      </p>
      <div className="relative">
        <div className="flex h-8 w-full overflow-hidden rounded-lg border border-white/10">
          {bands.map((band) => (
            <div
              key={band.zone}
              className={`${zoneColor(band.zone)} h-full flex items-center justify-center text-[10px] font-bold text-slate-950`}
              style={{
                width: `${((band.to - band.from) / scaleMax) * 100}%`
              }}
              title={`Zone ${band.zone} — ${band.label} (${bandEdgeLabel(
                band.from,
                velocityUnit
              )}–${bandEdgeLabel(band.to, velocityUnit)} ${bandUnit}${
                velocityUnit ? "" : " RMS"
              })`}
            >
              {band.zone}
            </div>
          ))}
        </div>
        {valueMmS != null && markerPct != null && (
          <div
            className="absolute -top-1 flex flex-col items-center"
            style={{ left: `${markerPct}%` }}
          >
            <div className="w-0.5 h-10 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
            <span className="mt-1 text-[10px] font-bold text-white bg-slate-950 border border-white/20 px-1.5 py-0.5 rounded whitespace-nowrap">
              {velocityLabel(valueMmS, velocityUnit)}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-3 mt-8 text-[10px] text-slate-400">
        {bands.map((band) => (
          <span key={band.zone} className="inline-flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${zoneColor(band.zone)}`} />
            Zone {band.zone} — {band.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export interface VibrationKpiSummaryProps extends VibrationSeverityPanelProps {
  healthScore: number | null;
  primaryFault: string | null;
  analysesCount: number;
  source: string;
  provenanceSlot?: ReactNode;
}

export function VibrationKpiSummary({
  valueMmS,
  velocityUnit,
  machineClass,
  healthScore,
  primaryFault,
  analysesCount,
  source,
  provenanceSlot
}: VibrationKpiSummaryProps) {
  const zone = classifyZone(valueMmS, machineClass);
  return (
    <div className={CARD}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
        KPI Summary
      </p>
      <ul className="space-y-2.5">
        <li className="text-sm font-bold text-white flex items-center gap-1.5">
          Health Score: {healthScore ?? "—"}
          {provenanceSlot}
        </li>
        <li className="text-sm font-semibold text-cyan-300">
          Overall Velocity:{" "}
          {valueMmS != null ? velocityLabel(valueMmS, velocityUnit) : "—"}
        </li>
        <li className="text-sm font-semibold text-slate-300">
          ISO Zone: {zone ? `Zone ${zone} — ${isoZoneLabel(zone)}` : "—"}
        </li>
        <li className="text-sm font-semibold text-yellow-500">
          Primary Fault: {primaryFault || "No saved analysis"}
        </li>
        <li className="text-sm font-semibold text-slate-300">
          Analyses: {analysesCount}
        </li>
        <li className="text-sm font-semibold text-green-400">Source: {source}</li>
      </ul>
    </div>
  );
}

export interface VibrationActionCardProps extends VibrationSeverityPanelProps {
  summary: string | null;
  recommendation: string | null;
}

export function VibrationActionCard({
  valueMmS,
  machineClass,
  summary,
  recommendation
}: VibrationActionCardProps) {
  const zone = classifyZone(valueMmS, machineClass);
  const action =
    recommendation ||
    (zone
      ? ZONE_ACTION[zone]
      : "Recommended Action: Complete a diagnostic run to generate recommendations.");

  return (
    <div className={`${CARD} md:col-span-2`}>
      <div className="flex items-start gap-3 mb-3">
        <Sparkles className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-white leading-relaxed">
            {summary || "Run Diagnostics to populate health trends for this asset."}
          </p>
          <p className="text-sm text-slate-400 mt-2">
            <span className="font-bold text-slate-300">
              ISO Zone {zone ?? "—"}
              {zone ? ` — ${isoZoneLabel(zone)}` : ""}
            </span>
            {": "}
            {action}
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled
        title="Work order creation from trend pending — WO creation endpoint not connected"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-sm font-bold cursor-not-allowed hover:bg-slate-700 transition-colors"
      >
        <Wrench className="h-4 w-4" />
        + Create Work Order
      </button>
    </div>
  );
}

function zoneColor(zone: IsoZone): string {
  switch (zone) {
    case "A":
      return "bg-green-500";
    case "B":
      return "bg-yellow-500";
    case "C":
      return "bg-orange-500";
    default:
      return "bg-red-500";
  }
}
