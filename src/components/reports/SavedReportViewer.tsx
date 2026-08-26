/**
 * A saved report opened by id, for `/analysis-reports?reportId=…`.
 *
 * Loads through `GET /api/reports/:id` and renders the stored values, so a
 * pasted link resolves on first render without depending on any list having
 * been fetched first. A missing id, a deleted report and an asset that no
 * longer has records are three different situations and each says so plainly.
 */

import React, { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Clock, FileWarning, Loader2, User } from "lucide-react";
import {
  fetchReport,
  rehydrateReport,
  type SavedReportRow
} from "../../lib/reports/reportPersistence";
import type { MultiTechReport } from "../../lib/reports/technologySummary";
import {
  formatWhen,
  renderReportBody,
  SEVERITY_LABEL,
  SEVERITY_STYLE
} from "./reportPresentation";

export interface SavedReportViewerProps {
  reportId: string;
  /** Asset ids that still have saved records, used to flag orphaned reports. */
  knownAssetIds?: string[];
  /** Receives the report's asset once known, so back lands where it came from. */
  onBack: (assetId?: string | null) => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; row: SavedReportRow; report: MultiTechReport }
  | { status: "missing" }
  | { status: "error"; message: string };

function backButton(onBack: () => void) {
  return (
    <button
      type="button"
      onClick={() => onBack()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 cursor-pointer transition-colors"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to Assessment
    </button>
  );
}

export default function SavedReportViewer({
  reportId,
  knownAssetIds,
  onBack
}: SavedReportViewerProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void fetchReport(reportId)
      .then((row) => {
        if (cancelled) return;
        setState({ status: "ready", row, report: rehydrateReport(row) });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load report.";
        // A 404 is a normal outcome for a stale link, not an error to shout about.
        setState(
          /not found/i.test(message)
            ? { status: "missing" }
            : { status: "error", message }
        );
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  if (state.status === "loading") {
    return (
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading saved report…
        </p>
      </section>
    );
  }

  if (state.status === "missing") {
    return (
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex items-start gap-3">
          <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-white">Report not found</h3>
            <p className="mt-1 text-sm text-slate-400">
              No saved report exists with id{" "}
              <span className="font-mono text-slate-300">{reportId}</span>. It may have
              been deleted, or the link may be mistyped.
            </p>
            <div className="mt-4">{backButton(onBack)}</div>
          </div>
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-white">Could not load this report</h3>
            <p className="mt-1 text-sm text-slate-400">{state.message}</p>
            <div className="mt-4">{backButton(onBack)}</div>
          </div>
        </div>
      </section>
    );
  }

  const { row, report } = state;
  // The stored values still stand on their own; only live cross-referencing is
  // lost when the asset is gone, so this is a note rather than a failure.
  const assetMissing =
    knownAssetIds != null &&
    knownAssetIds.length > 0 &&
    !knownAssetIds.includes(row.asset_id);

  return (
    <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-white">
            {row.title || `${row.asset_id} — saved report`}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Saved {formatWhen(row.created_at)}
            </span>
            <span className="font-mono text-slate-400">{row.asset_id}</span>
            {row.generated_by && (
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                {row.generated_by}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${SEVERITY_STYLE[report.overallSeverity]}`}
          >
            {SEVERITY_LABEL[report.overallSeverity]}
          </span>
          {backButton(() => onBack(row.asset_id))}
        </div>
      </div>

      <p className="mb-4 rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2 text-[11px] text-slate-400">
        Showing the measured values exactly as they were saved. Newer readings for this
        asset are not reflected here.
      </p>

      {assetMissing && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          Asset <span className="font-mono">{row.asset_id}</span> no longer has any saved
          records. The values below are preserved from this report, but the asset cannot
          be re-examined live.
        </p>
      )}

      {renderReportBody(report)}
    </section>
  );
}
