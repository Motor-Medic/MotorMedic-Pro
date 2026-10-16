import {
  TELEMETRY_PROVENANCE_DEFAULT,
  TELEMETRY_PROVENANCE_DEFAULT_BADGE,
  TELEMETRY_PROVENANCE_DEFAULT_NOTE,
  TELEMETRY_PROVENANCE_PREFILLED_BADGE,
  TELEMETRY_PROVENANCE_PREFILLED_NOTE,
  TELEMETRY_PROVENANCE_PREFILLED_RUN,
  type TelemetryProvenance
} from "../../lib/maintenance/prescriptiveDictionary";

/**
 * Shared run-level telemetry-provenance badge — honesty does not stop at
 * the intake page. Every surface that renders a SAVED run's severity/health
 * renders this next to the number:
 *   * 'default'        → DEFAULT      (amber — AR-20d default-derived)
 *   * 'prefilled-run'  → UNCONFIRMED  (orange — auto-sourced, not
 *                        engineer-confirmed this session: last-scan restore
 *                        or live SCADA; an explicit override clears it)
 *   * 'manual' / null  → nothing      (engineer-entered or measured this run)
 * Vocabulary is imported from the dictionary, never re-declared; styling
 * lives here once so every call site stays a single element.
 */
export default function TelemetryProvenanceBadge({
  provenance,
  className = "",
}: {
  provenance: TelemetryProvenance | null;
  className?: string;
}) {
  if (provenance === TELEMETRY_PROVENANCE_DEFAULT) {
    return (
      <span
        title={TELEMETRY_PROVENANCE_DEFAULT_NOTE}
        className={`inline-flex items-center rounded border border-amber-400/50 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-300 ${className}`}
      >
        {TELEMETRY_PROVENANCE_DEFAULT_BADGE}
      </span>
    );
  }
  if (provenance === TELEMETRY_PROVENANCE_PREFILLED_RUN) {
    return (
      <span
        title={TELEMETRY_PROVENANCE_PREFILLED_NOTE}
        className={`inline-flex items-center rounded border border-orange-400/50 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-orange-300 ${className}`}
      >
        {TELEMETRY_PROVENANCE_PREFILLED_BADGE}
      </span>
    );
  }
  return null;
}
