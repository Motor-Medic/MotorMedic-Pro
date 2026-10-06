/**
 * OilProgramDossierTab — Lubrication Program & Lab Dossier (oil Tab 3).
 * S1 Program Logistics; S2 Test-Method Citations; S3 Competency & Validity;
 * S4 Fluid & Program Record; S5 Golden Line.
 * ASTM D445 / D5185 cited only as test methods; ISO 4406 for particle-count
 * coding method; ICML and ISO 18436-4 for personnel competency; every interval
 * labeled "practice"; guidance labeled as guidance; absence != normal.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Droplet, Info } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { fetchOilSamples } from "../../lib/oilSampleRow";
import type { OilSample } from "../../types/oilAnalysis";
import {
  OIL_COMPETENCY_CITATION,
  OIL_ISO4406_CITATION,
  OIL_LAB_ACCREDITATION_NOT_RECORDED,
  OIL_SPECTROSCOPY_CITATION,
  OIL_TARGET_INTERVAL_DAYS,
  OIL_TARGET_INTERVAL_PRACTICE,
  OIL_VISCOSITY_CITATION,
  OIL_WEAR_LIMIT_CITATION,
} from "../../lib/maintenance/prescriptiveDictionary";

export interface OilProgramDossierTabProps {
  selectedAnalysis: SavedAnalysisResult | null;
  allAnalyses?: SavedAnalysisResult[];
  equipmentAssetId?: string | null;
}

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(new Date(b).getTime() - new Date(a).getTime());
  return Math.round(ms / 86_400_000);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : iso;
}

export default function OilProgramDossierTab({
  selectedAnalysis,
  allAnalyses,
  equipmentAssetId,
}: OilProgramDossierTabProps) {
  const assetId = equipmentAssetId ?? selectedAnalysis?.asset_id ?? (() => {
    if (allAnalyses == null || allAnalyses.length === 0) return null;
    const ids = [...new Set(allAnalyses.map((r) => r.asset_id).filter((id) => id != null && id !== ""))];
    return ids.length === 1 ? (ids[0] ?? null) : null;
  })();

  const [samples, setSamples] = useState<OilSample[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (assetId == null || assetId === "") { setSamples([]); return; }
    let cancelled = false;
    setLoading(true);
    fetchOilSamples(assetId)
      .then((s) => { if (!cancelled) { setSamples(s); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [assetId]);

  const sorted = useMemo(
    () => [...samples].sort((a, b) => a.sampleDate.localeCompare(b.sampleDate)),
    [samples]
  );

  const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;

  /* S1: trailing-average interval */
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(daysBetween(sorted[i - 1].sampleDate, sorted[i].sampleDate));
  }
  const avgInterval = intervals.length > 0
    ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
    : 0;

  /* Missed windows: any inter-sample gap past the confessed default target. */
  const missedGaps = intervals.filter((d) => d > OIL_TARGET_INTERVAL_DAYS);
  const longestGap = intervals.length > 0 ? Math.max(...intervals) : 0;

  const firstSampleDate = sorted.length > 0 ? sorted[0].sampleDate : null;
  const lastSampleDate = sorted.length > 0 ? sorted[sorted.length - 1].sampleDate : null;

  /* Duck-typed fields that may or may not exist on samples at runtime */
  const labName = latest && typeof (latest as Record<string, unknown>).labName === "string"
    ? (latest as Record<string, unknown>).labName as string
    : null;

  const lubricantGrade = latest && typeof (latest as Record<string, unknown>).lubricantGrade === "string"
    ? (latest as Record<string, unknown>).lubricantGrade as string
    : null;

  const oilGrade = latest && typeof (latest as Record<string, unknown>).oilGrade === "string"
    ? (latest as Record<string, unknown>).oilGrade as string
    : null;

  const grade = lubricantGrade ?? oilGrade ?? null;

  const samplerId = latest && typeof (latest as Record<string, unknown>).samplerId === "string"
    ? (latest as Record<string, unknown>).samplerId as string
    : null;

  const samplePoint = latest && typeof (latest as Record<string, unknown>).samplePoint === "string"
    ? (latest as Record<string, unknown>).samplePoint as string
    : null;

  const samplingPort = latest && typeof (latest as Record<string, unknown>).samplingPort === "string"
    ? (latest as Record<string, unknown>).samplingPort as string
    : null;

  const samplingMethod = latest && typeof (latest as Record<string, unknown>).samplingMethod === "string"
    ? (latest as Record<string, unknown>).samplingMethod as string
    : null;

  const hasMakeUpOil = latest != null && "makeUpOilLiters" in latest;
  const topOffVal = latest && typeof (latest as Record<string, unknown>).makeUpOilLiters === "number"
    ? ((latest as Record<string, unknown>).makeUpOilLiters as number)
    : null;

  if (assetId == null || assetId === "") {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4">
        <Droplet className="h-8 w-8 text-slate-600 mb-3" />
        <p className="text-sm font-semibold text-slate-300">
          Select an asset with oil analysis samples
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Open an oil report or select a location to view the lubrication program dossier.
        </p>
      </div>
    );
  }

  const n = sorted.length;

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
      {/* ===== HEADER ===== */}
      <div className="flex items-center gap-2 mb-1">
        <Droplet className="h-4 w-4 text-cyan-400 shrink-0" />
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
          Lubrication Program &amp; Lab Dossier
        </h4>
        <span className="text-[10px] text-slate-500">
          ({n} oil sample{n !== 1 ? "s" : ""})
        </span>
      </div>

      {loading && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 mt-3">
          <p className="text-xs text-slate-400 italic">Loading oil samples&hellip;</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 mt-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {!loading && !error && n === 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 mt-3">
          <p className="text-sm text-slate-400 italic">
            No oil samples on file for this asset. Capture a sample to populate
            the lubrication program dossier.
          </p>
        </div>
      )}

      {!loading && !error && n > 0 && (
        <>
          {/* ===== S1: Program Logistics ===== */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 mt-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              S1 &mdash; Program Logistics
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="text-slate-500">Sample count:</span>
                <span className="font-mono text-slate-300">{n}</span>
              </div>
              {firstSampleDate && lastSampleDate && (
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">Coverage window:</span>
                  <span className="font-mono text-slate-300 min-w-0 break-words">
                    {fmtDate(firstSampleDate)} &mdash; {fmtDate(lastSampleDate)}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    ({daysBetween(firstSampleDate, lastSampleDate)} days)
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="text-slate-500">Sampling cadence:</span>
                {avgInterval > 0 ? (
                  <span className="font-mono text-slate-300 min-w-0 break-words">
                    actual trailing average: {avgInterval} days
                  </span>
                ) : (
                  <span className="font-mono text-slate-500 italic min-w-0 break-words">
                    sampling cadence requires 2+ samples &mdash; {n} recorded
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 italic mt-1">
                defaulting to a {OIL_TARGET_INTERVAL_DAYS}-day{" "}
                {OIL_TARGET_INTERVAL_PRACTICE}; actual trailing average:{" "}
                {avgInterval > 0 ? `${avgInterval} days` : "insufficient samples"}{" "}
                (practice, not a rule)
              </p>
              <p className="text-[10px] text-slate-500 italic mt-1">
                {intervals.length === 0
                  ? `missed windows not evaluated - sampling cadence requires 2+ samples, ${n} recorded`
                  : missedGaps.length > 0
                    ? `missed sampling windows: ${missedGaps.length} gap${missedGaps.length !== 1 ? "s" : ""} exceeded the ${OIL_TARGET_INTERVAL_DAYS}-day target - longest ${longestGap} days between samples`
                    : `no sampling window exceeded the ${OIL_TARGET_INTERVAL_DAYS}-day default target`}
              </p>
            </div>
          </div>

          {/* ===== S2: Test-Method Citations ===== */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 mt-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              S2 &mdash; Test-Method Citations
            </h4>
            <div className="space-y-1.5 text-xs text-slate-400">
              <p>{OIL_VISCOSITY_CITATION}</p>
              <p>{OIL_SPECTROSCOPY_CITATION}</p>
              <p>{OIL_ISO4406_CITATION}</p>
              <p className="text-[10px] text-slate-500 mt-2">{OIL_WEAR_LIMIT_CITATION}</p>
            </div>
          </div>

          {/* ===== S3: Competency & Validity ===== */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 mt-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              S3 &mdash; Competency &amp; Validity
            </h4>
            <div className="space-y-1.5 text-xs text-slate-400">
              <p className="break-words">{OIL_COMPETENCY_CITATION}</p>
              <p className="break-words">
                {samplerId != null && samplerId !== ""
                  ? `sampler ID: ${samplerId}`
                  : <span className="italic text-slate-500">
                      sampler ID not recorded at capture &mdash; competency attribution unavailable
                    </span>}
              </p>
              <p className="break-words">
                {labName != null && labName !== ""
                  ? `lab: ${labName}`
                  : <span className="italic text-slate-500">{OIL_LAB_ACCREDITATION_NOT_RECORDED}</span>}
              </p>
            </div>
          </div>

          {/* ===== S4: Fluid & Program Record ===== */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 mt-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              S4 &mdash; Fluid &amp; Program Record
            </h4>
            <div className="space-y-2 text-xs text-slate-400">
              <div className="break-words">
                <span className="text-slate-500">Oil grade: </span>
                {grade != null && grade !== ""
                  ? <span className="text-slate-300">{grade}</span>
                  : <span className="italic text-slate-500">
                      oil grade not recorded &mdash; viscosity as measured only
                    </span>}
              </div>
              <div className="break-words">
                <span className="text-slate-500">Sampling port / method: </span>
                {samplePoint != null && samplePoint !== ""
                || samplingPort != null && samplingPort !== ""
                || samplingMethod != null && samplingMethod !== ""
                  ? <span className="text-slate-300">
                      {[samplePoint, samplingPort, samplingMethod]
                        .filter((v) => v != null && v !== "")
                        .join(" / ")}
                    </span>
                  : <span className="italic text-slate-500">
                      sampling port/method not recorded &mdash; bottom-drain
                      sampling artificially inflates wear debris and water relative
                      to live circulating fluid
                    </span>}
              </div>
              <div className="break-words">
                <span className="text-slate-500">Top-off / oil-change log: </span>
                {hasMakeUpOil
                  ? <span className="text-slate-300">
                      {topOffVal != null
                        ? (topOffVal > 0
                            ? `${topOffVal} L make-up oil recorded`
                            : "no make-up oil added")
                        : <span className="italic text-slate-500">
                            make-up oil quantity not recorded &mdash; dilution history unavailable
                          </span>}
                    </span>
                  : <span className="italic text-slate-500">
                      top-off log not recorded &mdash; dilution history unavailable
                    </span>}
              </div>
            </div>
          </div>

          {/* ===== S5: Golden Line ===== */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 mt-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              S5 &mdash; Golden Line
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              oil analysis is a lagging indicator for active mechanical wear,
              but a leading indicator for fluid degradation and contamination.
            </p>
          </div>

          {/* ===== Watchlist & Honesty Footer ===== */}
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 mt-3">
            <p className="text-[11px] text-slate-500">
              <Info className="h-3 w-3 inline text-slate-400 mr-1" />
              lubrication program dossier builds from stored oil samples &mdash;{" "}
              {n} recorded
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              <Info className="h-3 w-3 inline text-slate-400 mr-1" />
              absence of data is not evidence of normal condition
            </p>
          </div>
        </>
      )}

      {/* ===== Source ===== */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 mt-3">
        <p className="text-[10px] text-slate-500">
          <Info className="h-3 w-3 inline text-slate-400 mr-1" />
          oil analysis lab snapshot &mdash; fluid chemistry, contamination, and
          wear debris assessed separately
        </p>
      </div>
    </div>
  );
}
