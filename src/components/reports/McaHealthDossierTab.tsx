/**
 * McaHealthDossierTab — Motor Health & Test Practice Dossier for MCA.
 * S1 Winding Health Summary; S2 Test History Log; S3 Test Program Practice;
 * S4 Test-Method Citations; S5 Competency & Validity.
 * IEEE 43 / IEEE 286 / NETA MTS cited only as test-method standards;
 * ISO 18436-4 cited only for personnel competency; every interval labeled
 * "practice"; guidance labeled as guidance; absence != normal.
 */
import React, { useMemo, useState } from "react";
import { CalendarDays, Info, Zap } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { classifyFaultFamily } from "../../lib/diagnostics/faultFamily";
import {
  evaluateMcaSeverity,
  MCA_IMBALANCE_SOURCE,
} from "../../lib/maintenance/prescriptiveDictionary";
import {
  mcaPeakBlob,
  extractMcaWindingFromSaved,
  extractMcaGroundwallFromSaved,
} from "../../lib/mca/mcaPersistence";
import { percentUnbalance } from "../../lib/mca/windingBalanceCalculator";

export interface McaHealthDossierTabProps {
  selectedAnalysis: SavedAnalysisResult | null;
  allAnalyses?: SavedAnalysisResult[];
}

interface DossierRow {
  date: string;
  ts: string;
  imbalancePct: number | null;
  irMohm: number | null;
  pi: number | null;
  testVoltage: number | null;
  windingTemp: number | null;
  clazz: string;
  family: string;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const CLASS_COLOR: Record<string, string> = {
  Satisfactory: "#22c55e",
  "Class 3": "#eab308",
  "Class 2": "#f59e0b",
  "Class 1": "#ef4444",
};

function classColor(clazz: string): string {
  for (const [key, color] of Object.entries(CLASS_COLOR)) {
    if (clazz.startsWith(key)) return color;
  }
  return "#64748b";
}

function rowFor(r: SavedAnalysisResult): DossierRow {
  const blob = mcaPeakBlob(r);
  const winding = extractMcaWindingFromSaved(r);
  const groundwall = extractMcaGroundwallFromSaved(r);

  const storedUb = num(
    blob.imbalance_pct ?? blob.imbalancePct ?? blob.max_unbalance_rl ?? blob.maxUnbalanceRl,
  );
  const computedUb = winding.fromTelemetry
    ? Math.max(
        percentUnbalance(winding.phaseR),
        percentUnbalance(winding.phaseL),
        percentUnbalance(winding.phaseZ),
      )
    : null;

  let imbalancePct: number | null;
  if (storedUb != null) {
    imbalancePct = storedUb;
  } else if (computedUb != null) {
    imbalancePct = computedUb;
  } else {
    imbalancePct = null;
  }

  const bracket = imbalancePct != null ? evaluateMcaSeverity(imbalancePct) : null;
  const clazz = bracket?.clazz ?? "No data";
  const primaryFault = r.primary_fault ?? r.fault_list?.[0]?.title ?? null;
  const family = classifyFaultFamily(primaryFault);

  return {
    date: new Date(r.timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    ts: r.timestamp,
    imbalancePct,
    irMohm: groundwall.ir1mMOmega != null ? groundwall.ir1mMOmega : null,
    pi: groundwall.reportPi ?? null,
    testVoltage: groundwall.testVoltageV > 0 ? groundwall.testVoltageV : null,
    windingTemp: winding.windingTempC ?? null,
    clazz,
    family,
  };
}

function piInterpretation(pi: number): string {
  if (pi < 1.0) return "IEEE 43: retest recommended before energizing";
  if (pi < 2.0) return "IEEE 43: acceptable for some machines - test-method guidance only";
  if (pi < 4.0) return "IEEE 43: good insulation condition - test-method guidance only";
  return "IEEE 43: excellent insulation condition - test-method guidance only";
}

export default function McaHealthDossierTab({
  selectedAnalysis,
  allAnalyses,
}: McaHealthDossierTabProps) {
  if (!selectedAnalysis?.asset_id)
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4">
        <Zap className="h-8 w-8 text-slate-600 mb-3" />
        <p className="text-sm font-semibold text-slate-300">
          Select an asset with MCA inspections
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Open an MCA report or select a location to build the motor health dossier.
        </p>
      </div>
    );

  const rows = useMemo<DossierRow[]>(
    () =>
      (allAnalyses ?? [])
        .filter(
          (r) =>
            (r.analysis_type ?? "vibration").toLowerCase() === "mca" &&
            r.asset_id === selectedAnalysis.asset_id &&
            (!selectedAnalysis.component ||
              r.component === selectedAnalysis.component),
        )
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
        .map(rowFor),
    [selectedAnalysis, allAnalyses],
  );

  const [showAll, setShowAll] = useState(false);
  const hasData = rows.length > 0;
  const latest = rows.length > 0 ? rows[0] : null;

  // S3: compute next-suggested interval
  const lastTestDate = latest ? new Date(latest.ts) : null;
  const isCritical = latest?.clazz?.startsWith("Class 1") || latest?.clazz?.startsWith("Class 2");
  const intervalYears = isCritical ? 1 : 3;
  const intervalLabel = isCritical
    ? "annual practice (critical motor)"
    : "2-3 year practice (standard motor)";
  const nextSuggested = lastTestDate
    ? new Date(lastTestDate.getTime() + intervalYears * 365.25 * 24 * 60 * 60 * 1000)
    : null;

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Zap className="h-4 w-4 text-amber-400 shrink-0" />
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
          Motor Health &amp; Test Practice Dossier
        </h4>
        <span className="text-[10px] text-slate-500">
          ({rows.length} MCA run{rows.length !== 1 ? "s" : ""})
        </span>
      </div>

      {!hasData ? (
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 mt-3">
          <p className="text-sm text-slate-400 italic">
            No MCA inspections stored for this component. Run an MCA diagnostic
            from Diagnose to seed the motor health dossier.
          </p>
        </div>
      ) : (
        <>
          {/* ===== S1: Winding Health Summary ===== */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 mt-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              S1 — Winding Health Summary
            </h4>
            {latest && (
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">Imbalance:</span>
                  <span className="font-mono text-slate-300">
                    {latest.imbalancePct != null ? `${latest.imbalancePct.toFixed(1)}%` : "not recorded"}
                  </span>
                  {latest.imbalancePct != null && (
                    <span
                      className="inline-flex items-center gap-1 text-[9px] font-bold uppercase"
                      style={{ color: classColor(latest.clazz) }}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: classColor(latest.clazz) }}
                      />
                      {latest.clazz}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">Insulation:</span>
                  <span className="font-mono text-slate-300">
                    {latest.irMohm != null ? `${latest.irMohm.toFixed(1)} MΩ` : "not recorded"}
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-slate-500">PI:</span>
                  {latest.pi != null ? (
                    <div>
                      <span className="font-mono text-slate-300">{latest.pi.toFixed(2)}</span>
                      <span className="text-slate-500 ml-2">
                        {piInterpretation(latest.pi)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-500 italic">
                      polarization index not recorded
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ===== S2: Test History Log ===== */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 mt-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              S2 — Test History Log
            </h4>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left font-normal px-2">Date</th>
                  <th className="text-right font-normal px-2">Imbalance %</th>
                  <th className="text-right font-normal px-2">IR (MΩ)</th>
                  <th className="text-right font-normal px-2">PI</th>
                  <th className="text-right font-normal px-2">V (V)</th>
                  <th className="text-right font-normal px-2">Temp (°C)</th>
                </tr>
              </thead>
              <tbody>
                {(showAll ? rows : rows.slice(0, 10)).map((r) => (
                  <tr
                    key={r.ts}
                    className="text-slate-300 border-t border-slate-800"
                  >
                    <td className="py-1 px-2">{r.date}</td>
                    <td className="py-1 px-2 text-right font-mono">
                      {r.imbalancePct != null ? `${r.imbalancePct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-1 px-2 text-right font-mono">
                      {r.irMohm != null ? r.irMohm.toFixed(1) : "—"}
                    </td>
                    <td className="py-1 px-2 text-right font-mono">
                      {r.pi != null ? r.pi.toFixed(2) : "—"}
                    </td>
                    <td className="py-1 px-2 text-right font-mono text-slate-400">
                      {r.testVoltage != null ? r.testVoltage.toFixed(0) : "—"}
                    </td>
                    <td className="py-1 px-2 text-right font-mono text-slate-400">
                      {r.windingTemp != null ? r.windingTemp.toFixed(0) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="text-[10px] text-slate-500 hover:text-slate-300 mt-2"
              >
                {showAll ? "show less" : `+${rows.length - 10} more runs`}
              </button>
            )}
          </div>

          {/* ===== S3: Test Program Practice ===== */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 mt-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              S3 — Test Program Practice
            </h4>
            {lastTestDate && (
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  <span className="text-slate-500">Last test:</span>
                  <span className="font-mono text-slate-300">
                    {latest?.date ?? "—"}
                  </span>
                </div>
                {nextSuggested && (
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <span className="text-slate-500">Next suggested:</span>
                    <span className="font-mono text-slate-300">
                      {nextSuggested.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      ({intervalLabel})
                    </span>
                  </div>
                )}
                <p className="text-[10px] text-slate-500 mt-1">
                  Source: IEEE 43 / NETA MTS test-interval practice - practice, not a rule
                </p>
              </div>
            )}
          </div>

          {/* ===== S4: Test-Method Citations ===== */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 mt-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              S4 — Test-Method Citations
            </h4>
            <div className="space-y-1.5 text-xs text-slate-400">
              <p>Insulation resistance test method per IEEE 43.</p>
              <p>Winding resistance measurement per IEEE 286.</p>
              <p>Maintenance testing per NETA MTS.</p>
              <p className="text-[10px] text-slate-500 mt-2">
                Each cited for test method only - no ISO severity class standard exists for MCA.
              </p>
            </div>
          </div>

          {/* ===== S5: Competency & Validity ===== */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 mt-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              S5 — Competency &amp; Validity
            </h4>
            <div className="space-y-1.5 text-xs text-slate-400">
              <p>no ISO 18436 part covers motor circuit analysis; practitioner competency per industry training practice and vendor certification.</p>
              <p>Operator ID not recorded at capture.</p>
            </div>
          </div>

          {/* ===== Confessions ===== */}
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 mt-3">
            <p className="text-[11px] text-slate-500">
              <Info className="h-3 w-3 inline text-slate-400 mr-1" />
              MCA trend assumes comparable test conditions &mdash; winding
              temperature, lead compensation, and test voltage affect absolute
              values
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              <Info className="h-3 w-3 inline text-slate-400 mr-1" />
              motor health dossier builds from stored MCA inspections &mdash;{" "}
              {rows.length} recorded
            </p>
          </div>
        </>
      )}

      {/* ===== Source attribution ===== */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 mt-3">
        <p className="text-[10px] text-slate-500">
          Source: {MCA_IMBALANCE_SOURCE}
        </p>
      </div>
    </div>
  );
}
