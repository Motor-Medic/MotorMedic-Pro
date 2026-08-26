/**
 * Live multi-technology assessment for one asset, with persistence.
 *
 * The same renderer draws a freshly computed assessment and a report reopened
 * from the database. That is deliberate: a saved report stores its measured
 * values rather than a pointer to them, so rehydrating is a straight read and
 * the history view cannot drift from what was saved.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock,
  Database,
  Loader2,
  Save,
  Trash2
} from "lucide-react";
import {
  fetchAnalysisResults,
  type SavedAnalysisResult
} from "../../lib/analysisPersistence";
import { fetchOilSamples } from "../../lib/oilSampleRow";
import type { OilSample } from "../../types/oilAnalysis";
import { buildMultiTechReport } from "../../lib/reports/technologySummary";
import {
  deleteReport,
  fetchReports,
  saveReport,
  type SavedReportRow
} from "../../lib/reports/reportPersistence";
import {
  formatWhen,
  renderReportBody,
  SEVERITY_LABEL,
  SEVERITY_STYLE
} from "./reportPresentation";

export interface MultiTechAssessmentProps {
  assetId: string;
  assetLabel: string;
  companyId?: number | null;
  engineerName?: string | null;
  onToast?: (message: string, type?: "success" | "info" | "warning" | "error") => void;
  /** Open a saved report by id. Routed as a deep link so it can be shared. */
  onOpenReport: (reportId: string) => void;
}

export default function MultiTechAssessment({
  assetId,
  assetLabel,
  companyId,
  engineerName,
  onToast,
  onOpenReport
}: MultiTechAssessmentProps) {
  const [records, setRecords] = useState<SavedAnalysisResult[]>([]);
  const [oilSamples, setOilSamples] = useState<OilSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<SavedReportRow[]>([]);
  const [saving, setSaving] = useState(false);

  const loadHistory = useCallback(() => {
    if (!assetId) return;
    void fetchReports({ assetId, limit: 25 })
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [assetId]);

  useEffect(() => {
    let cancelled = false;
    if (!assetId) {
      setRecords([]);
      setOilSamples([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    // One technology failing must not blank the others.
    void Promise.all([
      fetchAnalysisResults({ asset_id: assetId }).catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load saved records");
        }
        return [] as SavedAnalysisResult[];
      }),
      fetchOilSamples(assetId).catch(() => [] as OilSample[])
    ]).then(([rows, samples]) => {
      if (cancelled) return;
      setRecords(rows);
      setOilSamples(samples);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const report = useMemo(
    () => buildMultiTechReport({ assetId, analysisRecords: records, oilSamples }),
    [assetId, records, oilSamples]
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const row = await saveReport({
        assetId,
        companyId: companyId ?? null,
        title: `${assetLabel} — multi-technology assessment`,
        generatedBy: engineerName ?? null,
        report
      });
      setHistory((prev) => [row, ...prev]);
      onToast?.("Report saved to database", "success");
    } catch (err) {
      onToast?.(
        err instanceof Error ? err.message : "Failed to save report",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteReport(id);
      setHistory((prev) => prev.filter((r) => r.id !== id));
      onToast?.("Report deleted", "info");
    } catch (err) {
      onToast?.(
        err instanceof Error ? err.message : "Failed to delete report",
        "error"
      );
    }
  };

  const withData = report.technologies.filter((t) => t.hasData).length;

  return (
    <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-cyan-400 shrink-0" />
            <h3 className="text-lg font-bold text-white">
              Multi-Technology Assessment
            </h3>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Live consolidation of every saved record for {assetLabel || assetId}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${SEVERITY_STYLE[report.overallSeverity]}`}
          >
            {SEVERITY_LABEL[report.overallSeverity]}
          </span>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || loading || withData === 0}
            title={
              withData === 0
                ? "No telemetry on file for this asset — nothing to save"
                : "Save this assessment to the database"
            }
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              saving || loading || withData === 0
                ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                : "bg-cyan-500 text-slate-900 hover:bg-cyan-400 cursor-pointer"
            }`}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save Report
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading saved records…
        </p>
      ) : (
        renderReportBody(report)
      )}

      <div className="mt-6 border-t border-white/10 pt-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
          Saved Reports
        </p>
        {history.length === 0 ? (
          <p className="text-xs text-slate-500">
            No reports saved for this asset yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {history.map((row) => (
              <li key={row.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenReport(row.id)}
                  title="Open this saved report"
                  className="flex flex-1 min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-left text-xs text-slate-300 hover:border-slate-600 transition-colors cursor-pointer"
                >
                  <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="truncate">{formatWhen(row.created_at)}</span>
                  <span
                    className={`ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${SEVERITY_STYLE[row.overall_severity]}`}
                  >
                    {SEVERITY_LABEL[row.overall_severity]}
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-500">
                    {(row.technologies_with_data ?? []).length} tech
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(row.id)}
                  title="Delete this report"
                  className="shrink-0 rounded-lg border border-white/10 p-2 text-slate-500 hover:text-red-400 hover:border-red-500/30 cursor-pointer transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
