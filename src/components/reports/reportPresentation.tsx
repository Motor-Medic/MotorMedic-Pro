/**
 * Shared rendering for multi-technology reports.
 *
 * Both the live assessment and a report reopened from the database render
 * through here, so a saved report cannot drift in appearance or in meaning
 * from the assessment it was captured out of.
 */

import React from "react";
import { Check } from "lucide-react";
import type {
  MultiTechReport,
  ReportSeverity,
  TechnologyReport
} from "../../lib/reports/technologySummary";

export const SEVERITY_STYLE: Record<ReportSeverity, string> = {
  CRITICAL: "bg-red-500/10 text-red-400 border-red-500/30",
  ANOMALY: "bg-yellow-400/10 text-yellow-400 border-yellow-400/30",
  NORMAL: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  NO_DATA: "bg-slate-500/10 text-slate-400 border-slate-500/30"
};

export const SEVERITY_LABEL: Record<ReportSeverity, string> = {
  CRITICAL: "Critical",
  ANOMALY: "Anomaly",
  NORMAL: "Normal",
  NO_DATA: "No data"
};

export function formatWhen(raw: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

// Plain render functions rather than components: this project has no
// @types/react installed, so `key` on a locally-typed component is rejected.
export function renderTechnologyCard(tech: TechnologyReport) {
  return (
    <div
      key={tech.technology}
      className="rounded-xl border border-white/10 bg-slate-950/40 p-4"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">{tech.label}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {tech.hasData ? `Captured ${formatWhen(tech.recordedAt)}` : "Not captured"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${SEVERITY_STYLE[tech.severity]}`}
        >
          {SEVERITY_LABEL[tech.severity]}
        </span>
      </div>

      {!tech.hasData ? (
        <p className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2.5 text-xs text-slate-400">
          {tech.emptyMessage}
        </p>
      ) : (
        <div className="space-y-2">
          {tech.primaryFault && (
            <p className="text-xs text-slate-300">
              <span className="text-slate-500">Primary fault: </span>
              <span className="font-semibold text-white">{tech.primaryFault}</span>
            </p>
          )}
          {tech.readings.length === 0 ? (
            <p className="text-xs text-slate-500">
              Record on file, but no numeric readings were stored.
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {tech.readings.map((r) => (
                <li
                  key={`${tech.technology}-${r.label}`}
                  className="flex items-baseline justify-between gap-3 py-1.5"
                >
                  <span className="text-[11px] text-slate-400 truncate">{r.label}</span>
                  <span className="flex items-baseline gap-2 shrink-0">
                    <span
                      className={`text-xs font-mono font-bold ${
                        r.status === "over" ? "text-red-400" : "text-slate-100"
                      }`}
                    >
                      {r.value}
                    </span>
                    {r.limit && (
                      <span className="text-[10px] text-slate-600 font-mono">
                        / {r.limit}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Technology grid plus the fault and recommendation lists beneath it. */
export function renderReportBody(report: MultiTechReport) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {report.technologies.map(renderTechnologyCard)}
      </div>

      {report.faultDiagnoses.length > 0 && (
        <div className="mt-5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
            Fault Diagnoses
          </p>
          <ul className="space-y-1.5">
            {report.faultDiagnoses.map((f) => (
              <li
                key={`${f.technology}-${f.title}`}
                className="flex items-center gap-2 text-xs text-slate-300"
              >
                <span
                  className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${SEVERITY_STYLE[f.severity]}`}
                >
                  {SEVERITY_LABEL[f.severity]}
                </span>
                <span className="text-slate-500">
                  {report.technologies.find((t) => t.technology === f.technology)?.label}:
                </span>
                <span className="font-semibold text-white">{f.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.recommendations.length > 0 && (
        <div className="mt-5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
            Recommendations
          </p>
          <ul className="space-y-1.5">
            {report.recommendations.map((r) => (
              <li key={r} className="flex items-start gap-2 text-xs text-slate-300">
                <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
