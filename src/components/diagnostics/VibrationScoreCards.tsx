import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { VibrationAnalysisResult } from "../../lib/consensusEngine";
import ConfidenceDisplay from "./ConfidenceDisplay";
import HealthGauge from "./HealthGauge";
import RoiBlock from "./RoiBlock";

export interface VibrationScoreCardsProps {
  apiSeverity: string | null;
  gaugeScore: number;
  hasDetectedFaults: boolean;
  primaryTitleDisplay: string;
  primaryFreqDisplay: string;
  primaryConfidenceDisplay: number | null;
  primaryUiSeverity: "HIGH" | "MEDIUM" | "LOW" | null;
  primaryFault: VibrationAnalysisResult["primaryFault"] | undefined;
  preventiveCostLabel: string;
  failureCostLabel: string;
  roiPercent: number | null;
  downtimeFigure: string;
  downtimeLabel: string;
}

export default function VibrationScoreCards({
  apiSeverity,
  gaugeScore,
  hasDetectedFaults,
  primaryTitleDisplay,
  primaryFreqDisplay,
  primaryConfidenceDisplay,
  primaryUiSeverity,
  primaryFault,
  preventiveCostLabel,
  failureCostLabel,
  roiPercent,
  downtimeFigure,
  downtimeLabel
}: VibrationScoreCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Card 1: Overall Health Score */}
      <HealthGauge gaugeScore={gaugeScore} apiSeverity={apiSeverity} />

      {/* Card 2: Primary Fault Identified */}
      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 flex flex-col">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Primary Fault Identified
        </p>
        <div className="mt-4 flex items-start gap-3 flex-1">
          <div
            className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 border ${
              hasDetectedFaults
                ? "bg-red-500/15 border-red-500/40"
                : "bg-emerald-500/15 border-emerald-500/40"
            }`}
          >
            {hasDetectedFaults ? (
              <AlertTriangle className="h-6 w-6 text-red-400" />
            ) : (
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <p className="text-lg font-bold text-white leading-snug">
              {primaryTitleDisplay}
            </p>
            <ConfidenceDisplay primaryFreqDisplay={primaryFreqDisplay} primaryConfidenceDisplay={primaryConfidenceDisplay} primaryUiSeverity={primaryUiSeverity} />
            <p className="text-sm text-yellow-400/90 font-semibold pt-1">
              {primaryFault?.actionWindow ||
                (hasDetectedFaults
                  ? "Action required within 7 days."
                  : "Continue routine monitoring.")}
            </p>
          </div>
        </div>
      </div>

      {/* Card 3: Financial Failure Horizon */}
      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 flex flex-col">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
          Financial Failure Horizon
        </p>
        <div className="grid grid-cols-2 gap-3 flex-1">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80 mb-1">
              Preventive Repair
            </p>
            <p className="text-lg font-bold text-emerald-400">
              {preventiveCostLabel}
            </p>
          </div>
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/80 mb-1">
              Failure if Delayed
            </p>
            <p className="text-lg font-bold text-red-400">
              {failureCostLabel}
            </p>
          </div>
        </div>
        <RoiBlock roiPercent={roiPercent} downtimeFigure={downtimeFigure} downtimeLabel={downtimeLabel} />
      </div>
    </div>
  );
}
