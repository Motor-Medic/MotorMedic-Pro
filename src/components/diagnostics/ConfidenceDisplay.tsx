import {
  DIAGNOSE_CONFIDENCE_SOURCE,
  DIAGNOSE_NOT_RECORDED
} from "../../lib/maintenance/prescriptiveDictionary";

export interface ConfidenceDisplayProps {
  primaryFreqDisplay: string;
  primaryConfidenceDisplay: number | null;
  primaryUiSeverity: "HIGH" | "MEDIUM" | "LOW" | null;
}

export default function ConfidenceDisplay({
  primaryFreqDisplay,
  primaryConfidenceDisplay,
  primaryUiSeverity
}: ConfidenceDisplayProps) {
  return (
    <>
      <p className="text-sm text-slate-300 font-mono">
        {primaryFreqDisplay}{" "}
        <span className="text-slate-600">|</span>{" "}
        <span className="text-emerald-400 font-semibold">
          {primaryConfidenceDisplay != null
            ? `${primaryConfidenceDisplay}% Confidence`
            : `Confidence: ${DIAGNOSE_NOT_RECORDED}`}
        </span>{" "}
        <span className="text-slate-600">|</span>{" "}
        <span
          className={`font-bold ${
            primaryUiSeverity === "HIGH"
              ? "text-red-400"
              : primaryUiSeverity === "MEDIUM"
                ? "text-amber-400"
                : primaryUiSeverity === null
                  ? "text-slate-400"
                  : "text-emerald-400"
          }`}
        >
          {primaryUiSeverity != null
            ? `${primaryUiSeverity} Severity`
            : DIAGNOSE_NOT_RECORDED}
        </span>
      </p>
      {primaryConfidenceDisplay != null && (
        <p className="text-[10px] text-slate-500 leading-snug">
          {DIAGNOSE_CONFIDENCE_SOURCE}
        </p>
      )}
    </>
  );
}
