/**
 * AR-28 CLS-safe <Suspense> fallbacks (rule 2).
 *
 * Every lazy route resolves into the same content panel, so its fallback has
 * to reserve the target view's bounding box *before* the chunk arrives;
 * otherwise the panel and everything below it jump the moment React commits
 * the resolved view.
 *
 * - Width: every route root is a block-level, full-width child of the panel,
 *   so `w-full` matches the target exactly at every breakpoint.
 * - Height: fixed per route (BOX_HEIGHT), mirroring that view's standard box
 *   inside the panel. Standalone pages (`/terms`, `/privacy`) and Analysis
 *   Reports declare `min-h-screen` at their own root, so their fallback is
 *   exactly `100vh` — the same bounding height the resolved view occupies.
 * - The onboarding wizard is a modal overlay, so its fallback is a
 *   fixed-position overlay of the same footprint: it reserves zero in-flow
 *   page height and therefore cannot shift the document.
 */
import type { AppTab } from "../../navigation";

export type RouteSkeletonRoute =
  | AppTab
  | "report-details"
  | "terms"
  | "privacy"
  | "onboarding";

const BOX_HEIGHT: Record<RouteSkeletonRoute, number | "100vh"> = {
  dashboard: 780,
  assets: 720,
  // Diagnose stays a static (eager) import — entry never suspends on it — but
  // the table stays exhaustive over AppTab so route/type drift fails typecheck.
  diagnose: 860,
  trends: 820,
  sensors: 800,
  migration: 640,
  // Root: `min-h-screen` → the resolved panel content is exactly 100vh tall.
  analysis: "100vh",
  rca: 700,
  fmea: 660,
  calendar: 780,
  alerts: 700,
  "anomaly-board": 760,
  history: 620,
  admin: 680,
  "multi-tech": 720,
  "reliability-scorecard": 700,
  "report-details": 660,
  terms: "100vh",
  privacy: "100vh",
  onboarding: 0
};

function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-lg border border-slate-800/80 bg-slate-800/50 ${className}`}
    />
  );
}

function PanelContent() {
  return (
    <div className="w-full space-y-5">
      <div className="space-y-2.5">
        <Bar className="h-7 w-64 max-w-full" />
        <Bar className="h-3 w-96 max-w-full bg-slate-800/35" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Bar className="h-9 w-32" />
        <Bar className="h-9 w-36" />
        <Bar className="h-9 w-28" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Bar className="h-36 rounded-xl" />
        <Bar className="h-36 rounded-xl" />
        <Bar className="h-36 rounded-xl" />
        <Bar className="h-36 rounded-xl" />
        <Bar className="h-36 rounded-xl" />
        <Bar className="h-36 rounded-xl" />
      </div>
    </div>
  );
}

export default function RouteSkeleton({ route }: { route: RouteSkeletonRoute }) {
  if (route === "onboarding") {
    // Modal overlay: same fixed footprint as the wizard, zero in-flow height.
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-4"
        role="status"
        aria-label="Loading setup wizard"
      >
        <div className="h-[620px] max-h-[85vh] w-full max-w-2xl rounded-2xl border border-slate-800 bg-[#0d1323] p-6 animate-pulse">
          <PanelContent />
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full"
      style={{ minHeight: BOX_HEIGHT[route] }}
      role="status"
      aria-busy="true"
      aria-label="Loading view"
      data-route-skeleton={route}
    >
      <div className="animate-pulse">
        <PanelContent />
      </div>
    </div>
  );
}
