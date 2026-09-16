/**
 * UltrasoundPatternDossierTab — acoustic pattern history, condition-indicator
 * log, survey program practice & competency validity for ultrasound.
 * ISO 18436-8 cited for personnel competency only; all intervals are
 * "practice" not "rule"; guidance labeled; absence != normal.
 */
import React, { useMemo, useState } from "react";
import { Activity, CalendarDays, ClipboardList, Info, Waves } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { classifyFaultFamily, FAULT_FAMILY_LABEL } from "../../lib/diagnostics/faultFamily";
import { peakOfType } from "../../lib/diagnostics/sensorFusion";

export interface UltrasoundPatternDossierTabProps {
  selectedAnalysis: SavedAnalysisResult | null;
  allAnalyses?: SavedAnalysisResult[];
}

interface SurveyRow {
  date: string;
  ts: string;
  peakDb: number | null;
  rmsDb: number | null;
  crest: number | null;
  family: string;
  pattern: string;
  primaryFault: string | null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const card = "rounded-xl border border-white/10 bg-slate-950/40 p-4";

function patternFromCrest(crest: number | null, family: string): string {
  if (crest == null) return "not classified";
  if (family === "leak") return "continuous";
  if (crest >= 6) return "burst-like";
  if (crest >= 2) return "mixed";
  return "continuous";
}

function crestNote(crest: number | null): string | null {
  if (crest == null) return null;
  if (crest < 2)
    return "Low crest — broad-band signal suggests airborne or turbulence rather than a discrete mechanical event.";
  if (crest <= 6)
    return "Moderate crest — intermittent mechanical contact typical of dry or rubbing surfaces.";
  return "High crest — burst-like signature consistent with spalling or discrete impacts.";
}

function rowFor(r: SavedAnalysisResult): SurveyRow {
  const p = peakOfType(r, "ultrasound") ??
    (Array.isArray(r.peaks) ? (r.peaks[0] as Record<string, unknown>) : null);
  const peakDb = num(p?.peak_dbmv);
  const rmsDb = num(p?.rms_dbmv);
  const crest = num(p?.crest_factor) ?? num(r.waveform_crest_factor);
  const primaryFault = r.primary_fault ?? r.fault_list?.[0]?.title ?? null;
  const family = classifyFaultFamily(primaryFault);
  const pattern = patternFromCrest(crest, family);
  return {
    date: new Date(r.timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    ts: r.timestamp,
    peakDb,
    rmsDb,
    crest,
    family,
    pattern,
    primaryFault,
  };
}

export default function UltrasoundPatternDossierTab({
  selectedAnalysis,
  allAnalyses,
}: UltrasoundPatternDossierTabProps) {
  if (!selectedAnalysis?.asset_id)
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4">
        <Waves className="h-8 w-8 text-slate-600 mb-3" />
        <p className="text-sm font-semibold text-slate-300">
          Select an asset with ultrasound inspections
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Open an ultrasound report or select a location to view the pattern
          dossier.
        </p>
      </div>
    );

  const rows = useMemo<SurveyRow[]>(
    () =>
      (allAnalyses ?? [])
        .filter(
          (r) =>
            (r.analysis_type ?? "vibration").toLowerCase() === "ultrasound" &&
            r.asset_id === selectedAnalysis.asset_id &&
            (!selectedAnalysis.component ||
              r.component === selectedAnalysis.component),
        )
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() -
            new Date(a.timestamp).getTime(),
        )
        .map(rowFor),
    [selectedAnalysis, allAnalyses],
  );

  const [showAllS2, setShowAllS2] = useState(false);

  const lastSurvey = rows.length > 0 ? rows[0] : null;
  const lastDate = lastSurvey?.ts ?? null;

  // Condition-based vs calendar-based: if we have 2+ surveys, suggest
  // condition-based; otherwise calendar-based with a 6-month default.
  const hasTwoPlus = rows.length >= 2;
  const nextIntervalLabel = hasTwoPlus
    ? "condition-based practice (criticality route)"
    : "calendar-based practice (program custom)";

  // Next-suggested date: 6 months from last survey as a default practice.
  const nextSuggested = lastDate
    ? (() => {
        const d = new Date(lastDate);
        d.setMonth(d.getMonth() + 6);
        return d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      })()
    : null;

  return (
    <div className="space-y-4">
      {/* ===== S1: Pattern History ===== */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-cyan-400 shrink-0" />
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
            Pattern History
          </h4>
        </div>
        <p className="text-[11px] text-slate-500 italic mb-3">
          pattern classification is an interpretation guide &mdash; not a
          diagnosis
        </p>
        {rows.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            No ultrasound surveys recorded for this component.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.ts}
                className="flex items-center gap-3 text-xs text-slate-300"
              >
                <span className="text-slate-500 w-28 shrink-0">
                  {r.date}
                </span>
                <span className="font-mono text-white">
                  {r.crest != null ? `crest ${r.crest}` : "crest \u2014"}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase ${
                    r.pattern === "burst-like"
                      ? "text-red-400"
                      : r.pattern === "mixed"
                        ? "text-amber-400"
                        : r.pattern === "continuous"
                          ? "text-emerald-400"
                          : "text-slate-500"
                  }`}
                >
                  {r.pattern}
                </span>
                <span className="text-slate-500">
                  ({FAULT_FAMILY_LABEL[
                    r.family as keyof typeof FAULT_FAMILY_LABEL
                  ] ?? "Unclassified"})
                </span>
              </div>
            ))}
          </div>
        )}
        {rows.length > 0 && (
          <p className="text-[10px] text-slate-600 italic mt-3">
            time-waveform / FFT anomaly classification not stored &mdash;
            pattern inferred from crest factor and fault family
          </p>
        )}
      </div>

      {/* ===== S2: Condition-Indicator Log ===== */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="h-4 w-4 text-amber-400 shrink-0" />
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
            Condition-Indicator Log
          </h4>
          <span className="text-[10px] text-slate-500">
            ({rows.length} run{rows.length !== 1 ? "s" : ""})
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            No ultrasound surveys recorded.
          </p>
        ) : (
          <>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left font-normal">Date</th>
                  <th className="text-right font-normal">RMS dB</th>
                  <th className="text-right font-normal">Peak dB</th>
                  <th className="text-right font-normal">Crest</th>
                </tr>
              </thead>
              <tbody>
                {(showAllS2 ? rows : rows.slice(0, 10)).map((r) => (
                  <tr
                    key={r.ts}
                    className="text-slate-300 border-t border-slate-800"
                  >
                    <td className="py-1">{r.date}</td>
                    <td className="py-1 text-right font-mono">
                      {r.rmsDb != null ? r.rmsDb.toFixed(1) : "\u2014"}
                    </td>
                    <td className="py-1 text-right font-mono">
                      {r.peakDb != null ? r.peakDb.toFixed(1) : "\u2014"}
                    </td>
                    <td className="py-1 text-right font-mono">
                      {r.crest != null ? r.crest.toFixed(2) : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && (
              <button
                onClick={() => setShowAllS2((v) => !v)}
                className="text-[10px] text-slate-500 hover:text-slate-300 mt-2"
              >
                {showAllS2
                  ? "show less"
                  : `+${rows.length - 10} more runs`}
              </button>
            )}
          </>
        )}
      </div>

      {/* ===== S3: Survey Program Practice ===== */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays className="h-4 w-4 text-emerald-400 shrink-0" />
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
            Survey Program Practice
          </h4>
        </div>
        {lastDate == null ? (
          <p className="text-xs text-slate-400 italic">
            No ultrasound surveys recorded for this component.
          </p>
        ) : (
          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Last survey:</span>
              <span className="font-mono text-white">{lastSurvey?.date}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">
                Next-suggested (practice):
              </span>
              <span className="font-mono text-white">{nextSuggested}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Approach:</span>
              <span className="text-white">{nextIntervalLabel}</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Source: UE Systems survey custom &mdash; practice, not a standard
            </p>
          </div>
        )}
      </div>

      {/* ===== S4: Competency & Validity Line ===== */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-4 w-4 text-sky-400 shrink-0" />
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
            Competency &amp; Validity
          </h4>
        </div>
        <p className="text-[11px] text-slate-500">
          ultrasound practitioner competency per ISO 18436-8 (personnel
          certification); operator ID not recorded at capture
        </p>
      </div>

      {/* ===== Footer: watchlist + honesty ===== */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
        <p className="text-[11px] text-slate-500">
          <Info className="h-3 w-3 inline text-slate-400 mr-1" />
          watchlist: crest factor trend, delta-dB drift, fault family
          progression. this dossier is a pattern summary &mdash; it does not
          replace on-site inspection or engineering judgment.
        </p>
      </div>
    </div>
  );
}
