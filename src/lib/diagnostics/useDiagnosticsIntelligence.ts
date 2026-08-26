/**
 * Loads every saved record an asset has and derives the fusion, prognosis,
 * sign-off and CMMS state from it.
 *
 * Extracted from the panel container so the four modules can be mounted at
 * separate points in a results page (the oil view interleaves them with its
 * own sections) while still sharing a single fetch — fusion and prognosis can
 * never disagree about what is in the database.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAnalysisResults,
  type SavedAnalysisResult
} from "../analysisPersistence";
import { fetchOilSamples } from "../oilSampleRow";
import type { OilSample } from "../../types/oilAnalysis";
import { buildFusionFromRecords, type FusionResult } from "./sensorFusion";
import { buildPrognosis, type PrognosisResult } from "./prognosis";
import { fetchSignOff, type DiagnosisSignOff } from "./signOff";
import { normalizeSeverity, type CmmsPayloadContext } from "./cmmsPayload";

export interface UseDiagnosticsIntelligenceInput {
  assetId: string;
  assetTag: string;
  component: string;
  /** Active diagnosis text; empty when no analysis has been run. */
  primaryFault: string;
  severity?: string | null;
  confidencePercent?: number | null;
  healthScore?: number | null;
  recommendations?: string[];
  /** Saved analysis_results id; null until the analysis is persisted. */
  savedAnalysisId: string | null;
}

export interface DiagnosticsIntelligence {
  loading: boolean;
  error: string | null;
  fusion: FusionResult;
  prognosis: PrognosisResult;
  signOff: DiagnosisSignOff | null;
  setSignOff: (signOff: DiagnosisSignOff) => void;
  cmmsContext: CmmsPayloadContext;
  /** Most recent oil sample on file, for snapshot panels. */
  latestOilSample: OilSample | null;
  reload: () => void;
}

const EMPTY_RECOMMENDATIONS: string[] = [];

export function useDiagnosticsIntelligence({
  assetId,
  assetTag,
  component,
  primaryFault,
  severity,
  confidencePercent = null,
  healthScore = null,
  recommendations = EMPTY_RECOMMENDATIONS,
  savedAnalysisId
}: UseDiagnosticsIntelligenceInput): DiagnosticsIntelligence {
  const [analysisRecords, setAnalysisRecords] = useState<SavedAnalysisResult[]>(
    []
  );
  const [oilSamples, setOilSamples] = useState<OilSample[]>([]);
  const [signOff, setSignOff] = useState<DiagnosisSignOff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    let cancelled = false;

    if (!assetId) {
      setAnalysisRecords([]);
      setOilSamples([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);

    // A failure in one technology must not blank the others.
    void Promise.all([
      fetchAnalysisResults({ asset_id: assetId }).catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load saved records"
          );
        }
        return [] as SavedAnalysisResult[];
      }),
      fetchOilSamples(assetId).catch(() => [] as OilSample[])
    ]).then(([records, samples]) => {
      if (cancelled) return;
      setAnalysisRecords(records);
      setOilSamples(samples);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [assetId]);

  useEffect(() => reload(), [reload]);

  // Sign-off is keyed on the saved diagnosis, so re-read it whenever that id
  // changes. This is what makes an approval survive a page refresh.
  useEffect(() => {
    let cancelled = false;
    if (!savedAnalysisId) {
      setSignOff(null);
      return;
    }
    void fetchSignOff(savedAnalysisId)
      .then((result) => {
        if (!cancelled) setSignOff(result);
      })
      .catch(() => {
        if (!cancelled) setSignOff(null);
      });
    return () => {
      cancelled = true;
    };
  }, [savedAnalysisId]);

  const fusion = useMemo(
    () => buildFusionFromRecords({ analysisRecords, oilSamples, primaryFault }),
    [analysisRecords, oilSamples, primaryFault]
  );

  const prognosis = useMemo(
    () => buildPrognosis({ oilSamples, analysisRecords }),
    [oilSamples, analysisRecords]
  );

  const latestOilSample = useMemo(() => {
    if (oilSamples.length === 0) return null;
    return oilSamples.reduce((newest, s) =>
      new Date(s.sampleDate).getTime() > new Date(newest.sampleDate).getTime()
        ? s
        : newest
    );
  }, [oilSamples]);

  // Only the record this diagnosis was actually saved as can date it.
  const savedRecord = useMemo(
    () =>
      savedAnalysisId
        ? (analysisRecords.find((r) => r.id === savedAnalysisId) ?? null)
        : null,
    [analysisRecords, savedAnalysisId]
  );
  const diagnosisAt = savedRecord?.timestamp ?? null;
  const rationale = savedRecord?.summary ?? null;

  // The exact strings the Fusion Matrix shows, so a work order composed from
  // readings quotes the same numbers the matrix does.
  const evidence = useMemo(
    () =>
      fusion.rows
        .filter((row) => row.hasRecord && row.detail.length > 0)
        .map((row) => ({ label: row.label, details: row.detail })),
    [fusion.rows]
  );

  const cmmsContext: CmmsPayloadContext = useMemo(
    () => ({
      assetTag,
      component,
      faultTitle: primaryFault,
      severity: normalizeSeverity(severity),
      confidencePercent,
      healthScore,
      horizonHours: prognosis.horizon?.hoursRemaining ?? null,
      horizonDriver: prognosis.horizon?.label ?? null,
      horizonBasis: prognosis.horizon?.basis ?? null,
      corroborationPercent: fusion.aggregate,
      technologiesWithData: fusion.scored.map((r) => r.label),
      signOffStatus: signOff?.status ?? "pending",
      signOffEngineer: signOff?.engineer_name ?? null,
      signOffAt: signOff?.updated_at ?? signOff?.created_at ?? null,
      recommendations,
      diagnosisId: savedAnalysisId,
      diagnosisAt,
      rationale,
      evidence
    }),
    [
      assetTag,
      component,
      primaryFault,
      severity,
      confidencePercent,
      healthScore,
      prognosis.horizon,
      fusion.aggregate,
      fusion.scored,
      signOff,
      recommendations,
      savedAnalysisId,
      diagnosisAt,
      rationale,
      evidence
    ]
  );

  return {
    loading,
    error,
    fusion,
    prognosis,
    signOff,
    setSignOff,
    cmmsContext,
    latestOilSample,
    reload
  };
}
