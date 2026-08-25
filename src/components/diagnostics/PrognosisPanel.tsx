/**
 * Computed prognosis and RUL countdown.
 *
 * The unmitigated horizon is the soonest converging projection across stored
 * metrics. When nothing converges the panel says so and renders no bar — an
 * empty progress bar would read as "plenty of time left", which we have not
 * measured.
 */

import { AlertTriangle, TrendingDown } from "lucide-react";
import {
  TIME_BASIS_LABEL,
  formatHours,
  type PrognosisResult,
  type Projection
} from "../../lib/diagnostics/prognosis";

export interface PrognosisPanelProps {
  prognosis: PrognosisResult;
}

/**
 * Fraction of the countdown already elapsed, for the bar width. Anchored to
 * the longest projection on screen so the bars are comparable to each other.
 */
function barPercent(hours: number, longest: number): number {
  if (longest <= 0) return 100;
  return Math.max(4, Math.min(100, ((longest - hours) / longest) * 100));
}

function renderProjectionRow(
  projection: Projection,
  longest: number,
  isHorizon: boolean
) {
  return (
    <div
      key={projection.id}
      className={`rounded-lg border p-3 ${
        isHorizon
          ? "border-red-500/40 bg-red-500/5"
          : "border-slate-800 bg-slate-950/40"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-white">
          {projection.label}
          {isHorizon && (
            <span className="ml-2 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
              Horizon driver
            </span>
          )}
        </span>
        <span className="font-mono text-sm text-slate-200">
          {formatHours(projection.hoursRemaining)}
        </span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${isHorizon ? "bg-red-500" : "bg-slate-500"}`}
          style={{
            width: `${barPercent(projection.hoursRemaining, longest)}%`
          }}
        />
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {projection.currentValue}
        {projection.unit} now → {projection.threshold}
        {projection.unit} limit · {projection.sampleCount} stored readings ·{" "}
        {TIME_BASIS_LABEL[projection.basis]}
      </p>
      <p className="mt-0.5 font-mono text-[11px] text-slate-600">
        {projection.source}
      </p>
    </div>
  );
}

export default function PrognosisPanel({ prognosis }: PrognosisPanelProps) {
  const { projections, nonConverging, horizon, mixedBasis } = prognosis;
  const longest = projections.length
    ? projections[projections.length - 1].hoursRemaining
    : 0;

  return (
    <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
      <div className="mb-5">
        <h3 className="text-lg font-bold text-white">
          Computed Prognosis &amp; RUL
        </h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Linear extrapolation of stored metrics toward their documented limits
        </p>
      </div>

      {horizon ? (
        <>
          <div className="mb-5 rounded-lg border border-red-500/40 bg-red-500/10 p-4">
            <div className="flex items-start gap-3">
              <TrendingDown className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-red-300/80">
                  Unmitigated Horizon
                </div>
                <div className="text-2xl font-bold text-white">
                  {formatHours(horizon.hoursRemaining)}
                </div>
                <p className="mt-1 text-sm text-red-200/80">
                  Driven by {horizon.label}, measured in{" "}
                  {TIME_BASIS_LABEL[horizon.basis]}.
                </p>
              </div>
            </div>
          </div>

          {/* Post-remediation bar — explicitly an assumption, not a measurement. */}
          <div className="mb-5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-cyan-200">
                Post-Remediation Outlook
              </span>
              <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-300">
                Planning assumption
              </span>
            </div>
            {/*
              Hatched, not filled: a fill fraction would read as a computed
              post-repair position, which no measurement supports.
            */}
            <div
              className="mt-2 h-1.5 w-full rounded-full bg-slate-800"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, rgba(34,211,238,0.45) 0 6px, transparent 6px 12px)"
              }}
              aria-hidden
            />
            <p className="mt-2 text-xs leading-relaxed text-cyan-200/70">
              Assumes restoration to target cleanliness / balance spec, resetting
              the {horizon.label.toLowerCase()} trend to baseline. This is a
              planning assumption, not a measurement — no post-repair data exists
              for this asset until a verification survey is captured.
            </p>
          </div>

          <div className="space-y-3">
            {projections.map((p) =>
              renderProjectionRow(p, longest, p.id === horizon.id)
            )}
          </div>

          {mixedBasis && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-xs text-yellow-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                These projections mix time bases. Oil trends use machine
                operating hours; vibration trends use calendar hours between
                saved analyses, because no operating hours are stored with them.
                Compare the two only after converting for duty cycle.
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center">
          <p className="text-sm font-semibold text-slate-300">
            No failure horizon projected on current trends
          </p>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-500">
            {nonConverging.length > 0
              ? "Stored metrics are flat, improving, or already past their limits, so no countdown can be computed."
              : "At least two readings of the same metric are needed before a rate can be measured."}
          </p>
        </div>
      )}

      {nonConverging.length > 0 && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Tracked but not projecting
          </p>
          <ul className="space-y-1.5">
            {nonConverging.map((m) => (
              <li key={m.label} className="text-xs text-slate-400">
                <span className="font-semibold text-slate-300">{m.label}:</span>{" "}
                {m.note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
