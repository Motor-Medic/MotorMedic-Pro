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
import {
  VIBRATION_NOT_MEASURED,
  consensusContradicts
} from "../../lib/vibration/trendSsot";

/**
 * Re-exported for existing callers/tests. The implementation now lives in the
 * shared vibration SSOT module so the KPI reconciliation and the action card
 * read the same disagreement predicate.
 */
export { consensusContradicts };

const CARD = "bg-slate-900/50 border border-white/10 rounded-xl p-6";

const ZONE_ACTION: Record<IsoZone, string> = {
  A: "Continue routine condition monitoring.",
  B: "Continue routine condition monitoring.",
  C: "Schedule corrective maintenance and re-check the trend.",
  D: "Immediate corrective action required \u2014 plan intervention now."
};

/**
 * Audit-safe copy used when the ISO zone cannot be resolved or the agents
 * contradict each other. Never recommend a repair on an unresolved diagnosis.
 */
export const AUDIT_SAFE_FALLBACK =
  "Awaiting further multi-tech diagnostic data to confirm failure mode.";

export interface ActionCardCopyInput {
  zone: IsoZone | null;
  recommendation: string | null;
  consensusConflict?: boolean;
}

export function resolveActionCardAction({
  zone,
  recommendation,
  consensusConflict = false
}: ActionCardCopyInput): string {
  if (!zone || consensusConflict) return AUDIT_SAFE_FALLBACK;
  return recommendation || ZONE_ACTION[zone];
}

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
  machineClass,
  emptyNote
}: VibrationSeverityPanelProps & { emptyNote?: string | null }) {
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
          : emptyNote ||
            `No overall velocity available yet — ${VIBRATION_NOT_MEASURED}.`}
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
  /** Why health is blank / how it was derived (never a bare number). */
  healthProvenance?: string | null;
  /** Reconciled verdict state so the KPI cannot silently pick one agent. */
  verdictState?: "reconciled" | "indeterminate" | "no-sample";
  /** Why overall velocity is blank (Not measured / stopped sample). */
  valueEmptyReason?: string | null;
}

export function VibrationKpiSummary({
  valueMmS,
  velocityUnit,
  machineClass,
  healthScore,
  primaryFault,
  analysesCount,
  source,
  provenanceSlot,
  healthProvenance,
  verdictState = "reconciled",
  valueEmptyReason
}: VibrationKpiSummaryProps) {
  const zone = classifyZone(valueMmS, machineClass);
  const indeterminate = verdictState === "indeterminate";
  return (
    <div className={CARD}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
        KPI Summary
      </p>
      <ul className="space-y-2.5">
        <li className="text-sm font-bold text-white flex flex-wrap items-center gap-1.5">
          <span data-testid="vibration-kpi-health">
            Health Score: {healthScore ?? "—"}
          </span>
          {provenanceSlot}
          {healthProvenance ? (
            <span className="block w-full text-[10px] font-normal text-slate-400">
              {healthProvenance}
            </span>
          ) : null}
        </li>
        <li className="text-sm font-semibold text-cyan-300">
          <span data-testid="vibration-kpi-overall-velocity">
            Overall Velocity:{" "}
            {valueMmS != null ? velocityLabel(valueMmS, velocityUnit) : "—"}
          </span>
          {valueMmS == null && valueEmptyReason ? (
            <span className="block text-[10px] font-normal text-slate-400">
              {valueEmptyReason}
            </span>
          ) : null}
        </li>
        <li className="text-sm font-semibold text-slate-300">
          ISO Zone: {zone ? `Zone ${zone} — ${isoZoneLabel(zone)}` : "—"}
        </li>
        <li
          className={`text-sm font-semibold ${
            indeterminate ? "text-amber-300" : "text-yellow-500"
          }`}
          data-testid="vibration-kpi-primary-fault"
        >
          Primary Fault: {primaryFault || "—"}
          {indeterminate ? (
            <span className="block text-[10px] font-normal text-amber-200/80">
              Agents disagree — both readings remain in the narrative panel.
            </span>
          ) : null}
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
  /** True when the persisted multi-agent consensus reports a contradiction. */
  consensusConflict?: boolean;
  /**
   * SLICE-K - opens the existing work-order path with this already-resolved
   * action. Receives the zone too so the caller never re-derives suppression.
   */
  onCreateWorkOrder?: (resolvedAction: string, zone: IsoZone | null) => void;
}

export function VibrationActionCard({
  valueMmS,
  machineClass,
  summary,
  recommendation,
  consensusConflict = false,
  onCreateWorkOrder
}: VibrationActionCardProps) {
  const zone = classifyZone(valueMmS, machineClass);
  const action = resolveActionCardAction({
    zone,
    recommendation,
    consensusConflict
  });
  const canCreateWorkOrder = Boolean(onCreateWorkOrder);

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
        disabled={!canCreateWorkOrder}
        onClick={() => onCreateWorkOrder?.(action, zone)}
        title={
          canCreateWorkOrder
            ? "Prefill a work order from this action"
            : "Work order creation from trend pending — WO creation endpoint not connected"
        }
        className={
          canCreateWorkOrder
            ? "inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FFC700] text-slate-950 text-sm font-bold cursor-pointer hover:bg-[#e6b400] transition-colors"
            : "inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-sm font-bold cursor-not-allowed hover:bg-slate-700 transition-colors"
        }
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
