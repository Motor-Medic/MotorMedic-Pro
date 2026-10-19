/**
 * AR-28 CLS-safe <Suspense> fallbacks for Diagnose's split sub-views (rule 2).
 *
 * These boundaries render *inside* Diagnose (its input ternary and its
 * results region), not at route level, so each fallback must reserve the box
 * the resolved accordion/dashboard occupies:
 *
 * - Width: every sub-view is a block-level, full-width child of its container
 *   (the input panel's space-y-4 flow, or the results wrapper div), so
 *   `w-full` matches at every breakpoint.
 * - Height: fixed per sub-view (BOX_HEIGHT), mirroring that view's standard
 *   box. The static pieces (default vibration input, inline vibration
 *   results) never suspend; their entries keep the table exhaustive over the
 *   Technology template-literal union so technology drift fails typecheck.
 */
import type { Technology } from "../Diagnose";

export type SubviewSkeletonView =
  | `diagnose-${Technology}-input`
  | `diagnose-${Technology}-results`
  | "diagnose-kinematics-specs"
  | "diagnose-telemetry-context"
  | "diagnose-measurement-metadata"
  | "diagnose-vision-intake"
  | "diagnose-cmms-bridge";

const BOX_HEIGHT: Record<SubviewSkeletonView, number> = {
  // Static (never suspends) — listed so the union stays exhaustive.
  "diagnose-vibration-input": 700,
  "diagnose-vibration-results": 760,
  // Lazy input accordions (replaced in place inside the input ternary).
  "diagnose-ir-input": 640,
  "diagnose-ultrasound-input": 600,
  "diagnose-mca-input": 660,
  "diagnose-oil-input": 620,
  // Lazy results dashboards (replaced inside the results wrapper div).
  "diagnose-ir-results": 700,
  "diagnose-ultrasound-results": 700,
  "diagnose-mca-results": 700,
  "diagnose-oil-results": 700,
  // Shared intake sections (generic branch of the input ternary) and the
  // post-analysis CMMS bridge. Boxes mirror each component's root <section>:
  // specs grid / operating-parameter row / collapsed advanced-params toggle
  // (showAdvancedParams defaults to false) / intake dropzone grid / bridge.
  "diagnose-kinematics-specs": 600,
  "diagnose-telemetry-context": 280,
  "diagnose-measurement-metadata": 80,
  "diagnose-vision-intake": 480,
  "diagnose-cmms-bridge": 480
};

function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-lg border border-slate-800/80 bg-slate-800/50 ${className}`}
    />
  );
}

export default function SubviewSkeleton({ view }: { view: SubviewSkeletonView }) {
  return (
    <div
      className="w-full overflow-hidden"
      style={{ height: BOX_HEIGHT[view] }}
      role="status"
      aria-busy="true"
      aria-label="Loading view"
      data-subview-skeleton={view}
    >
      <div className="animate-pulse space-y-4">
        <div className="space-y-2.5">
          <Bar className="h-7 w-56 max-w-full" />
          <Bar className="h-3 w-80 max-w-full bg-slate-800/35" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Bar className="h-40 rounded-xl" />
          <Bar className="h-40 rounded-xl" />
        </div>
        <div className="space-y-2.5">
          <Bar className="h-5 w-48 max-w-full bg-slate-800/35" />
          <Bar className="h-44 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
