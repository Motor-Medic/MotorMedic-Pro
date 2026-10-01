/**
 * Standalone page for the Multi-Tech Fusion surface.
 *
 * This is a thin wrapper that owns the asset-selector chrome and deep-link
 * routing; the actual cross-technology assessment lives in MultiTechTab.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import {
  fetchAnalysisResults,
  type SavedAnalysisResult,
} from "../../lib/analysisPersistence";
import { getFlatEquipment } from "../../data/equipmentDb";
import { navigateToTab } from "../../navigation";
import { useQueryParam } from "../../lib/useQueryParam";
import { useToast } from "../Toast";
import SavedReportViewer from "./SavedReportViewer";
import MultiTechTab from "./MultiTechTab";
import ComponentPrognosticsSummary from "./ComponentPrognosticsSummary";
import type { PrognosticsModality } from "./prognosticsResolvers";

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

  /** Component scope for the prognosis section: newest record's component wins. */
  const [prognosisComponent, setPrognosisComponent] = useState<string | null>(null);
  const prognosisInitAssetRef = useRef<string | null>(null);

  const assetComponentRows = useMemo(() => {
    return [...loadedAnalyses]
      .filter((r) => r.asset_id === assessmentAssetId)
      .sort(
        (a, b) =>
          new Date(b.timestamp || b.created_at || 0).getTime() -
          new Date(a.timestamp || a.created_at || 0).getTime()
      );
  }, [loadedAnalyses, assessmentAssetId]);

  const componentsForAsset = useMemo(() => {
    const names = new Set<string>();
    for (const row of assetComponentRows) {
      if (row.component) names.add(row.component);
    }
    return [...names].sort();
  }, [assetComponentRows]);

  const hasComponentlessRecords = useMemo(
    () => assetComponentRows.some((r) => !r.component),
    [assetComponentRows]
  );

  useEffect(() => {
    if (!assessmentAssetId || prognosisInitAssetRef.current === assessmentAssetId) return;
    if (assetComponentRows.length === 0) return; // wait for records to land
    prognosisInitAssetRef.current = assessmentAssetId;
    setPrognosisComponent(assetComponentRows.find((r) => r.component)?.component ?? null);
  }, [assessmentAssetId, assetComponentRows]);

  const prognosisAnalysis = useMemo<SavedAnalysisResult | null>(() => {
    if (!assessmentAssetId) return null;
    const pool = prognosisComponent
      ? assetComponentRows.filter((r) => r.component === prognosisComponent)
      : assetComponentRows.filter((r) => !r.component);
    return pool[0] ?? null;
  }, [assetComponentRows, assessmentAssetId, prognosisComponent]);

  /**
   * Drill-down: the payload carries the full equipment context (route/asset/
   * component) plus modality + tab — context alone or modality alone would
   * land Analysis Reports on the wrong asset or a blank reading room.
   */
  const openPrognostics = (id: PrognosticsModality) => {
    if (!assessmentAssetId) return;
    const flat = getFlatEquipment().find(
      (a) => a.tag === assessmentAssetId || a.id === assessmentAssetId
    );
    navigateToTab("analysis", {
      route: flat?.routeName ?? "",
      asset: assessmentAssetId,
      component: prognosisComponent ?? "",
      tech: id,
      tab: "4",
    });
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
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0">
                <label
                  htmlFor="prognosis-component"
                  className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1"
                >
                  Prognosis Component
                </label>
                <select
                  id="prognosis-component"
                  value={prognosisComponent ?? ""}
                  onChange={(e) => setPrognosisComponent(e.target.value || null)}
                  className="h-9 min-w-[200px] px-3 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-amber-400/60"
                >
                  {(hasComponentlessRecords || componentsForAsset.length === 0) && (
                    <option value="">All components (asset-wide)</option>
                  )}
                  {componentsForAsset.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-sm text-slate-500 pb-2">
                Components with saved records ({componentsForAsset.length})
              </p>
            </div>
            <ComponentPrognosticsSummary
              selectedAnalysis={prognosisAnalysis}
              loadedAnalyses={loadedAnalyses}
              equipmentAssetId={assessmentAssetId}
              onSelectModality={openPrognostics}
            />
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
