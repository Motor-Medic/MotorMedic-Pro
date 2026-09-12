/**
 * Standalone page for the Multi-Tech Fusion surface.
 *
 * This is a thin wrapper that owns the asset-selector chrome and deep-link
 * routing; the actual cross-technology assessment lives in MultiTechTab.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import {
  fetchAnalysisResults,
  type SavedAnalysisResult,
} from "../../lib/analysisPersistence";
import { navigateToTab } from "../../navigation";
import { useQueryParam } from "../../lib/useQueryParam";
import { useToast } from "../Toast";
import SavedReportViewer from "./SavedReportViewer";
import MultiTechTab from "./MultiTechTab";

interface MultiTechPageProps {
  selectedCompanyId?: number;
}

export default function MultiTechPage({ selectedCompanyId }: MultiTechPageProps) {
  const { toast } = useToast();

  const [loadedAnalyses, setLoadedAnalyses] = useState<SavedAnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [assessmentAssetId, setAssessmentAssetId] = useState<string | null>(null);

  const deepLinkReportId = useQueryParam("reportId");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchAnalysisResults({ limit: 200 });
        if (!cancelled) setLoadedAnalyses(rows);
      } catch {
        // Non-fatal — the tab will show an empty state.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const assetsWithRecords = useMemo(() => {
    const ids = new Set<string>();
    for (const row of loadedAnalyses) {
      if (row.asset_id) ids.add(row.asset_id);
    }
    return [...ids].sort();
  }, [loadedAnalyses]);

  useEffect(() => {
    if (assessmentAssetId == null && assetsWithRecords.length > 0) {
      setAssessmentAssetId(assetsWithRecords[0]);
    }
  }, [assessmentAssetId, assetsWithRecords]);

  const openReport = (reportId: string) => {
    navigateToTab("multi-tech", { reportId });
  };

  const closeReport = (assetId?: string | null) => {
    navigateToTab("multi-tech", assetId ? { assetId } : {});
  };

  if (deepLinkReportId) {
    return (
      <div className="space-y-6 pb-28 bg-slate-950/80 rounded-2xl min-h-full p-4 sm:p-6">
        <div>
          <h2 className="text-xl font-bold text-white">Multi-Tech Fusion</h2>
          <p className="text-xs text-slate-500 mt-1">
            Asset-level cross-technology consolidation
          </p>
        </div>
        <SavedReportViewer
          reportId={deepLinkReportId}
          knownAssetIds={assetsWithRecords}
          onBack={closeReport}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28 bg-slate-950/80 rounded-2xl min-h-full p-4 sm:p-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Layers className="h-5 w-5 text-yellow-400" />
          <h2 className="text-xl font-bold text-white">Multi-Tech Fusion</h2>
        </div>
        <p className="text-xs text-slate-500">
          Asset-level cross-technology consolidation
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading saved records…
        </div>
      ) : assetsWithRecords.length === 0 ? (
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
          <h3 className="text-base font-bold text-white mb-1">
            Multi-Technology Assessment
          </h3>
          <p className="text-sm text-slate-400">
            No saved condition-monitoring records found. Run and save an analysis
            from Run Diagnostics to build an assessment.
          </p>
        </section>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="min-w-0">
              <label
                htmlFor="assessment-asset"
                className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1"
              >
                Assessment Asset
              </label>
              <select
                id="assessment-asset"
                value={assessmentAssetId ?? ""}
                onChange={(e) => setAssessmentAssetId(e.target.value)}
                className="h-9 min-w-[200px] px-3 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-amber-400/60"
              >
                {assetsWithRecords.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-sm text-slate-500 pb-2">
              Assets with saved records ({assetsWithRecords.length})
            </p>
          </div>
          {assessmentAssetId && (
            <MultiTechTab
              assetId={assessmentAssetId}
              assetLabel={assessmentAssetId}
              companyId={selectedCompanyId ?? null}
              onToast={toast}
              onOpenReport={openReport}
            />
          )}
        </div>
      )}
    </div>
  );
}
