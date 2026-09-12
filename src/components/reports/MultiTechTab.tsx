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
  Check,
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
  SEVERITY_LABEL,
  SEVERITY_STYLE
} from "./reportPresentation";
import {
  buildFusionFromRecords,
  type TechnologyEvidence,
  type FusionResult
} from "../../lib/diagnostics/sensorFusion";
import {
  classifyFaultFamily,
  familiesCorroborate,
  FAULT_FAMILY_LABEL,
  type FaultFamily
} from "../../lib/diagnostics/faultFamily";

export interface MultiTechTabProps {
  assetId: string;
  assetLabel: string;
  companyId?: number | null;
  engineerName?: string | null;
  onToast?: (message: string, type?: "success" | "info" | "warning" | "error") => void;
  /** Open a saved report by id. Routed as a deep link so it can be shared. */
  onOpenReport: (reportId: string) => void;
}

export default function MultiTechTab({
  assetId,
  assetLabel,
  companyId,
  engineerName,
  onToast,
  onOpenReport
}: MultiTechTabProps) {
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

  const primaryFault = report.faultDiagnoses[0]?.title ?? null;
  const fusion = useMemo<FusionResult>(
    () => buildFusionFromRecords({ analysisRecords: records, oilSamples, primaryFault }),
    [records, oilSamples, primaryFault]
  );

  const recordCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of records) {
      counts[r.analysis_type] = (counts[r.analysis_type] ?? 0) + 1;
    }
    counts["oil"] = oilSamples.length;
    return counts;
  }, [records, oilSamples]);

  const corroboratingPairs = useMemo(() => {
    const pairs: { a: TechnologyEvidence; b: TechnologyEvidence; witnessGapDays: number }[] = [];
    for (let i = 0; i < fusion.scored.length; i++) {
      for (let j = i + 1; j < fusion.scored.length; j++) {
        const a = fusion.scored[i];
        const b = fusion.scored[j];
        if (familiesCorroborate(a.family, b.family)) {
          const aTime = a.recordedAt ? new Date(a.recordedAt).getTime() : 0;
          const bTime = b.recordedAt ? new Date(b.recordedAt).getTime() : 0;
          const witnessGapDays = Math.round(Math.abs(aTime - bTime) / 86400000);
          pairs.push({ a, b, witnessGapDays });
        }
      }
    }
    return pairs;
  }, [fusion]);

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
  const ts = report.technologies.filter((t) => t.hasData && t.recordedAt).map((t) => new Date(t.recordedAt!).getTime()).sort((a, b) => a - b);
  const temporalSpanDays = ts.length >= 2 ? Math.round((ts[ts.length - 1] - ts[0]) / 86400000) : 0;

  return (
    <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-cyan-400 shrink-0" />
            <h3 className="text-lg font-bold text-white">Multi-Technology Assessment</h3>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">Live consolidation of every saved record for {assetLabel || assetId}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {corroboratingPairs.length > 0 ? (
            <span className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${SEVERITY_STYLE[report.overallSeverity]}`}>
              Corroborated worst: {SEVERITY_LABEL[report.overallSeverity]}
            </span>
          ) : (
            <span className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${SEVERITY_STYLE[report.overallSeverity]}`}>
              Worst observed (uncorroborated)
            </span>
          )}
          {fusion.aggregate != null ? (
            <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-bold text-cyan-400">
              Cross-tech corroboration {fusion.aggregate}%
            </span>
          ) : fusion.scored.length === 1 ? (
            <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-400">
              Single-domain diagnosis
            </span>
          ) : (
            <span className="rounded-md border border-slate-600 bg-slate-800/50 px-2.5 py-1 text-[11px] font-bold text-slate-400">
              No scored data
            </span>
          )}
          {corroboratingPairs.map((pair, idx) => (
            <span key={idx} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-400">
              {pair.a.label}↔{pair.b.label}
              {pair.witnessGapDays > 0 && (
                <span className="text-emerald-500 ml-1">|{pair.witnessGapDays}d</span>
              )}
            </span>
          ))}
          <button type="button" onClick={() => void handleSave()} disabled={saving || loading || withData === 0}
            title={withData === 0 ? "No telemetry on file for this asset — nothing to save" : "Save this assessment to the database"}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${saving || loading || withData === 0 ? "bg-slate-700 text-slate-400 cursor-not-allowed" : "bg-cyan-500 text-slate-900 hover:bg-cyan-400 cursor-pointer"}`}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
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
        <>
          <div className="grid grid-cols-5 gap-2 mb-5">
            {report.technologies.map((t) => (
              <div
                key={t.technology}
                className={`rounded-lg border p-2.5 text-center ${
                  t.hasData
                    ? "border-white/10 bg-slate-950/40"
                    : "border-dashed border-slate-700/60 bg-slate-950/20"
                }`}
              >
                <p className="text-[11px] font-bold text-white truncate">{t.label}</p>
                {t.hasData ? (
                  <>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {recordCounts[t.technology] ?? 0} record{(recordCounts[t.technology] ?? 0) !== 1 ? "s" : ""}
                    </p>
                    {t.recordedAt && (
                      <p className="text-[9px] text-slate-500 mt-0.5 truncate">
                        {formatWhen(t.recordedAt)}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[9px] text-slate-500 mt-1">
                    No {t.label.toLowerCase()} data collected — not part of assessment scope
                  </p>
                )}
              </div>
            ))}
          </div>

          {temporalSpanDays > 30 && (
            <p className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Readings span {temporalSpanDays} days — cross-tech comparison may be stale
            </p>
          )}

          {fusion.rows.length > 0 && (
            <div className="mb-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Correlation Matrix</p>
              <div className="rounded-lg border border-white/10 bg-slate-950/40 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Modality</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Status</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Key Reading</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Fault Family</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Corroborates With</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fusion.rows.map((row) => {
                      const corrTechs = fusion.scored.filter(
                        (s) => s.technology !== row.technology && familiesCorroborate(row.family, s.family)
                      );
                      const ageDays = row.recordedAt
                        ? Math.floor((Date.now() - new Date(row.recordedAt).getTime()) / 86400000)
                        : null;
                      return (
                        <tr key={row.technology} className="border-b border-white/5 last:border-0">
                          <td className="px-3 py-2 font-semibold text-white">{row.label}</td>
                          <td className="px-3 py-2">
                            {row.hasRecord ? (
                              row.score != null ? (
                                <span className="text-emerald-400">Scored ({row.score}%)</span>
                              ) : (
                                <span className="text-amber-400">Recorded — not scored</span>
                              )
                            ) : (
                              <span className="text-slate-500">No record</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-300 font-mono text-[11px]">{row.reason}</td>
                          <td className="px-3 py-2 text-slate-400">{FAULT_FAMILY_LABEL[row.family]}</td>
                          <td className="px-3 py-2 text-slate-400">
                            {corrTechs.length > 0
                              ? corrTechs.map((c) => c.label).join(", ")
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {ageDays != null ? (ageDays === 0 ? "today" : `${ageDays}d`) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {report.technologies.some((t) => t.technology === "mca") && (
                <p className="text-[9px] text-slate-500 mt-1.5">
                  MCA is recorded but not scored in fusion — no validated scoring function exists.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
            {report.technologies.map((tech) => {
              const ageDays = tech.recordedAt
                ? Math.floor((Date.now() - new Date(tech.recordedAt).getTime()) / 86400000)
                : null;
              return (
                <div key={tech.technology} className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="text-sm font-bold text-white truncate">{tech.label}</p>
                    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${SEVERITY_STYLE[tech.severity]}`}>
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
                      {tech.readings.slice(0, 4).map((r) => (
                        <div key={`${tech.technology}-${r.label}`} className="flex items-baseline justify-between gap-3">
                          <span className="text-[11px] text-slate-400 truncate">{r.label}</span>
                          <span className="flex items-baseline gap-2 shrink-0">
                            <span className={`text-xs font-mono font-bold ${r.status === "over" ? "text-red-400" : "text-slate-100"}`}>{r.value}</span>
                            {r.limit && <span className="text-[10px] text-slate-600 font-mono">/ {r.limit}</span>}
                          </span>
                        </div>
                      ))}
                      {tech.healthScore != null && (
                        <p className="text-[10px] text-slate-500 pt-1 border-t border-white/5">
                          Health score: {tech.healthScore}/100
                          <span className="text-slate-600 ml-1">
                            {tech.technology === "mca" ? "(MCA index — not comparable across technologies)" : "(0–100 consensus engine)"}
                          </span>
                        </p>
                      )}
                      <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                        <span className="text-[10px] text-slate-500">{formatWhen(tech.recordedAt)}</span>
                        {ageDays != null && (
                          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${ageDays === 0 ? "border-emerald-500/30 text-emerald-400" : "border-slate-600 text-slate-400"}`}>
                            {ageDays === 0 ? "today" : `${ageDays}d old`}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {report.faultDiagnoses.length > 0 && (
            <div className="mb-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Fault Diagnoses</p>
              <ul className="space-y-1.5">
                {report.faultDiagnoses.map((f) => (
                  <li key={`${f.technology}-${f.title}`} className="flex items-center gap-2 text-xs text-slate-300">
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${SEVERITY_STYLE[f.severity]}`}>{SEVERITY_LABEL[f.severity]}</span>
                    <span className="text-slate-500">{f.techLabel}:</span>
                    <span className="font-semibold text-white">{f.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.recommendations.length > 0 && (
            <div className="mb-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Recommendations</p>
              {(["vibration", "ultrasound", "thermography", "mca"] as const).map((tech) => {
                const items = report.recommendations.filter((r) => r.technology === tech);
                if (items.length === 0) return null;
                return (
                  <div key={tech} className="mb-3 last:mb-0">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{items[0].techLabel}</p>
                    <ul className="space-y-1.5">
                      {items.map((r) => (
                        <li key={r.text} className="flex items-start gap-2 text-xs text-slate-300">
                          <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                          {r.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="mt-6 border-t border-white/10 pt-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Saved Reports</p>
        {history.length === 0 ? (
          <p className="text-xs text-slate-500">No reports saved for this asset yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {history.map((row) => (
              <li key={row.id} className="flex items-center gap-2">
                <button type="button" onClick={() => onOpenReport(row.id)} title="Open this saved report"
                  className="flex flex-1 min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-left text-xs text-slate-300 hover:border-slate-600 transition-colors cursor-pointer">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="truncate">{formatWhen(row.created_at)}</span>
                  <span className={`ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${SEVERITY_STYLE[row.overall_severity]}`}>{SEVERITY_LABEL[row.overall_severity]}</span>
                  <span className="shrink-0 text-[10px] text-slate-500">{(row.technologies_with_data ?? []).length} tech</span>
                </button>
                <button type="button" onClick={() => void handleDelete(row.id)} title="Delete this report"
                  className="shrink-0 rounded-lg border border-white/10 p-2 text-slate-500 hover:text-red-400 hover:border-red-500/30 cursor-pointer transition-colors">
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
