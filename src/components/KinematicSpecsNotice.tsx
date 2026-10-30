import AppLink from "./AppLink";
import {
  EQUIPMENT_DB_PATH,
  KINEMATIC_SPECS_EMPTY_MESSAGE,
  KINEMATIC_SPECS_OUTAGE_MESSAGE
} from "../lib/vibration/componentSpecs";

interface NoticeProps {
  className?: string;
}

/** Optional spec record missing: configuration prompt, never an outage. */
export function KinematicSpecsEmptyState({ className = "" }: NoticeProps) {
  return (
    <div
      data-testid="kinematic-specs-empty"
      className={`flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 ${className}`}
    >
      <p className="text-xs text-amber-200/90">{KINEMATIC_SPECS_EMPTY_MESSAGE}</p>
      <AppLink
        href={EQUIPMENT_DB_PATH}
        className="text-xs font-bold text-amber-300 underline decoration-amber-400/40 underline-offset-2 hover:text-amber-200"
      >
        Configure in Equipment DB
      </AppLink>
    </div>
  );
}

/** Genuine 5xx / network failure: the red outage banner. */
export function KinematicSpecsOutageBanner({ className = "" }: NoticeProps) {
  return (
    <div
      role="alert"
      data-testid="kinematic-specs-outage"
      className={`rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 ${className}`}
    >
      <p className="text-xs text-red-300">{KINEMATIC_SPECS_OUTAGE_MESSAGE}</p>
    </div>
  );
}
