/**
 * UltrasoundTrendLibraryTab — component-level acoustic trend library.
 * UE Systems bearing-condition ladder (v1.6); two stacked SVG panels on a
 * shared date axis; table <=10 rows; confessions printed once; leak nuance.
 */
import React, { useMemo, useState } from "react";
import { Info, Waves } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { classifyFaultFamily, FAULT_FAMILY_LABEL } from "../../lib/diagnostics/faultFamily";
import {
  evaluateUsSeverity,
  US_CATASTROPHIC_DB,
  US_DDB_BRACKETS,
  US_DDB_SOURCE,
} from "../../lib/maintenance/prescriptiveDictionary";
import { peakOfType } from "../../lib/diagnostics/sensorFusion";

export interface UltrasoundTrendLibraryTabProps {
  selectedAnalysis: SavedAnalysisResult | null;
  allAnalyses?: SavedAnalysisResult[];
}

interface TrendRow {
  date: string;
  ts: string;
  peakDb: number | null;
  baselineDb: number | null;
  deltaDb: number | null;
  audit: string;
  clazz: string;
  family: string;
  isCatastrophic: boolean;
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

function rowFor(r: SavedAnalysisResult): TrendRow | null {
  const p = peakOfType(r, "ultrasound") ?? (Array.isArray(r.peaks) ? r.peaks[0] as Record<string, unknown> : null);
  const peakDb = num(p?.peak_dbmv);
  const baselineDb = num(p?.baseline_dbmv);
  const storedDelta = num(p?.delta_db);

  let deltaDb: number | null;
  let audit: string;

  if (storedDelta != null) {
    deltaDb = storedDelta;
    const computed =
      peakDb != null && baselineDb != null
        ? Math.round((peakDb - baselineDb) * 10) / 10
        : null;
    audit =
      computed != null && Math.abs(computed - storedDelta) < 0.05
        ? "stored matches peak\u2013baseline"
        : computed != null
          ? "stored uses different definition"
          : "stored value only \u2014 endpoints not both recorded";
  } else if (peakDb != null && baselineDb != null) {
    deltaDb = Math.round((peakDb - baselineDb) * 10) / 10;
    audit = "derived from peak \u2013 baseline (no stored delta)";
  } else {
    deltaDb = null;
    audit = "delta-dB unavailable \u2014 baseline not recorded";
  }

  const bracket = deltaDb != null ? evaluateUsSeverity(deltaDb) : null;
  const clazz = bracket?.clazz ?? "No data";
  const primaryFault = r.primary_fault ?? r.fault_list?.[0]?.title ?? null;
  const family = classifyFaultFamily(primaryFault);
  const isCatastrophic = deltaDb != null && deltaDb >= US_CATASTROPHIC_DB;

  return {
    date: new Date(r.timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    ts: r.timestamp,
    peakDb,
    baselineDb,
    deltaDb,
    audit,
    clazz,
    family,
    isCatastrophic,
  };
}

const W = 520;
const H = 150;
const PL = 54;
const PR = 12;
const PT = 16;
const PB = 30;
const PADX = 32;

export default function UltrasoundTrendLibraryTab({
  selectedAnalysis,
  allAnalyses,
}: UltrasoundTrendLibraryTabProps) {
  if (!selectedAnalysis?.asset_id)
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4">
        <Waves className="h-8 w-8 text-slate-600 mb-3" />
        <p className="text-sm font-semibold text-slate-300">
          Select an asset with ultrasound inspections
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Open an ultrasound report or select a location to build the acoustic
          library.
        </p>
      </div>
    );

  const rows = useMemo<TrendRow[]>(
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
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        )
        .map(rowFor),
    [selectedAnalysis, allAnalyses],
  );

  const [showAll, setShowAll] = useState(false);
  const hasData = rows.length > 0;

  // --- Panel A: peak & baseline dBuV ---
  const allPeakVals = rows.map((r) => r.peakDb ?? 0);
  const allBaseVals = rows.map((r) => r.baselineDb ?? 0);
  const aMax = Math.max(...allPeakVals, ...allBaseVals, 10) * 1.15;
  const px = (i: number, n: number) =>
    n === 1
      ? (PL + W - PR) / 2
      : PL + PADX + (i * (W - PR - PL - PADX)) / (n - 1);
  const pyA = (v: number) => PT + (1 - Math.max(0, v) / aMax) * (H - PT - PB);
  const gridA = [0, 0.5, 1].map((f) => ({
    v: aMax * f,
    y: pyA(aMax * f),
  }));

  // --- Panel B: delta-dB ---
  const deltaVals = rows.map((r) => r.deltaDb ?? 0);
  const bMax = Math.max(...deltaVals, 40) * 1.1;
  const pyB = (v: number) => PT + (1 - Math.max(0, v) / bMax) * (H - PT - PB);
  const gridB = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    v: bMax * f,
    y: pyB(bMax * f),
  }));

  // bracket lines for Panel B
  const bracketLines = US_DDB_BRACKETS.slice(1).map((b) => ({
    y: pyB(b.minDb),
    label: `${b.minDb} dB`,
    desc: b.action,
    color: classColor(b.clazz),
  }));
  // catastrophic line
  const catY = pyB(US_CATASTROPHIC_DB);
  const showCat = US_CATASTROPHIC_DB <= bMax;

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Waves className="h-4 w-4 text-cyan-400 shrink-0" />
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
          Acoustic Trend Library
        </h4>
        <span className="text-[10px] text-slate-500">
          ({rows.length} US run{rows.length !== 1 ? "s" : ""})
        </span>
      </div>

      {!hasData ? (
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 mt-3">
          <p className="text-sm text-slate-400 italic">
            No ultrasound inspections stored for this component. Run a
            ultrasound diagnostic from Diagnose to seed the acoustic library.
          </p>
        </div>
      ) : (
        <>
          {rows.length === 1 && (
            <p className="text-[11px] text-slate-500 italic mt-2">
              acoustic library builds from 2+ surveys &mdash; 1 recorded
            </p>
          )}

          {/* ===== Panel A: peak & baseline dBuV ===== */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 mt-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Peak &amp; Baseline
              </h4>
              <span className="text-[9px] border rounded px-1 border-cyan-500/60 text-cyan-400">
                dBuV
              </span>
            </div>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-48"
              preserveAspectRatio="none"
            >
              {gridA.map((g) => (
                <g key={g.v.toFixed(0)}>
                  <line
                    x1={PL}
                    x2={W - PR}
                    y1={g.y}
                    y2={g.y}
                    stroke="#334155"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={PL - 6}
                    y={g.y + 2}
                    fontSize="8"
                    fill="#64748b"
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {g.v.toFixed(0)}
                  </text>
                </g>
              ))}
              <text
                x={PL - 10}
                y={(PT + H - PB) / 2}
                fontSize="8"
                fill="#22d3ee"
                transform={`rotate(-90 ${PL - 10} ${(PT + H - PB) / 2})`}
                textAnchor="middle"
              >
                dBuV
              </text>
              {rows.map((r, i) => (
                <g key={r.ts}>
                  {i === 0 ||
                  rows[i - 1].ts.slice(0, 10) !== r.ts.slice(0, 10) ? (
                    <text
                      x={px(i, rows.length)}
                      y={H - 10}
                      fontSize="8"
                      fill="#64748b"
                      textAnchor="middle"
                    >
                      {r.date.split(",")[0]}
                    </text>
                  ) : null}
                </g>
              ))}
              {/* baseline line */}
              {rows.length > 1 && (
                <polyline
                  points={rows
                    .map(
                      (r, i) =>
                        `${px(i, rows.length)},${pyA(r.baselineDb ?? 0)}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="1.2"
                  strokeDasharray="4 3"
                />
              )}
              {/* peak line */}
              {rows.length > 1 && (
                <polyline
                  points={rows
                    .map(
                      (r, i) =>
                        `${px(i, rows.length)},${pyA(r.peakDb ?? 0)}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="1.5"
                />
              )}
              {/* dots */}
              {rows.map((r, i) => (
                <g key={r.ts + "-dot"}>
                  <circle
                    cx={px(i, rows.length)}
                    cy={pyA(r.peakDb ?? 0)}
                    r="2.6"
                    fill="#22d3ee"
                  />
                  <circle
                    cx={px(i, rows.length)}
                    cy={pyA(r.baselineDb ?? 0)}
                    r="2.6"
                    fill="#94a3b8"
                  />
                </g>
              ))}
            </svg>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="inline-flex items-center gap-1 text-[9px] text-slate-500">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: "#22d3ee" }}
                />
                peak (solid)
              </span>
              <span className="inline-flex items-center gap-1 text-[9px] text-slate-500">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: "#94a3b8" }}
                />
                baseline (dashed)
              </span>
            </div>
          </div>

          {/* ===== Panel B: delta-dB with bracket lines ===== */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 mt-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Delta over Baseline
              </h4>
              <span className="text-[9px] border rounded px-1 border-amber-500/60 text-amber-400">
                dB
              </span>
            </div>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-48"
              preserveAspectRatio="none"
            >
              {gridB.map((g) => (
                <g key={g.v.toFixed(0)}>
                  <line
                    x1={PL}
                    x2={W - PR}
                    y1={g.y}
                    y2={g.y}
                    stroke="#334155"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={PL - 6}
                    y={g.y + 2}
                    fontSize="8"
                    fill="#64748b"
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {g.v.toFixed(0)}
                  </text>
                </g>
              ))}
              <text
                x={PL - 10}
                y={(PT + H - PB) / 2}
                fontSize="8"
                fill="#f59e0b"
                transform={`rotate(-90 ${PL - 10} ${(PT + H - PB) / 2})`}
                textAnchor="middle"
              >
                dB
              </text>
              {/* bracket lines */}
              {bracketLines.map((bl) => (
                <g key={bl.label}>
                  <line
                    x1={PL}
                    x2={W - PR}
                    y1={bl.y}
                    y2={bl.y}
                    stroke={bl.color}
                    strokeWidth="1"
                    strokeDasharray="6 3"
                    opacity="0.7"
                  />
                  <text
                    x={W - PR + 2}
                    y={bl.y + 2}
                    fontSize="7"
                    fill={bl.color}
                    dominantBaseline="middle"
                  >
                    {bl.label} {bl.desc}
                  </text>
                </g>
              ))}
              {/* catastrophic line */}
              {showCat && (
                <g>
                  <line
                    x1={PL}
                    x2={W - PR}
                    y1={catY}
                    y2={catY}
                    stroke="#dc2626"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                  <text
                    x={W - PR + 2}
                    y={catY + 2}
                    fontSize="7"
                    fill="#dc2626"
                    dominantBaseline="middle"
                  >
                    {US_CATASTROPHIC_DB} dB catastrophic
                  </text>
                </g>
              )}
              {/* date labels */}
              {rows.map((r, i) => (
                <g key={r.ts + "-lbl"}>
                  {i === 0 ||
                  rows[i - 1].ts.slice(0, 10) !== r.ts.slice(0, 10) ? (
                    <text
                      x={px(i, rows.length)}
                      y={H - 10}
                      fontSize="8"
                      fill="#64748b"
                      textAnchor="middle"
                    >
                      {r.date.split(",")[0]}
                    </text>
                  ) : null}
                </g>
              ))}
              {/* delta line */}
              {rows.length > 1 && (
                <polyline
                  points={rows
                    .map(
                      (r, i) =>
                        `${px(i, rows.length)},${pyB(r.deltaDb ?? 0)}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.2"
                  opacity="0.5"
                />
              )}
              {/* dots colored by class */}
              {rows.map((r, i) => (
                <g key={r.ts + "-pt"}>
                  <circle
                    cx={px(i, rows.length)}
                    cy={pyB(r.deltaDb ?? 0)}
                    r="3"
                    fill={classColor(r.clazz)}
                  />
                  {r.isCatastrophic && (
                    <circle
                      cx={px(i, rows.length)}
                      cy={pyB(r.deltaDb ?? 0)}
                      r="5"
                      fill="none"
                      stroke="#dc2626"
                      strokeWidth="1"
                    />
                  )}
                </g>
              ))}
            </svg>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {US_DDB_BRACKETS.map((b) => (
                <span
                  key={b.clazz}
                  className="inline-flex items-center gap-1 text-[9px] text-slate-500"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: classColor(b.clazz) }}
                  />
                  {b.clazz}
                </span>
              ))}
            </div>
          </div>

          {/* ===== Table ===== */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 mt-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              Runs
            </h4>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left font-normal">Date</th>
                  <th className="text-right font-normal">Peak dBuV</th>
                  <th className="text-right font-normal">Baseline dBuV</th>
                  <th className="text-right font-normal">Delta stored</th>
                  <th className="text-left font-normal">Audit verdict</th>
                  <th className="text-left font-normal">Class</th>
                  <th className="text-left font-normal">Pattern</th>
                </tr>
              </thead>
              <tbody>
                {(showAll ? rows : rows.slice(0, 10)).map((r) => (
                  <tr
                    key={r.ts}
                    className="text-slate-300 border-t border-slate-800"
                  >
                    <td className="py-1">{r.date}</td>
                    <td className="py-1 text-right font-mono">
                      {r.peakDb != null ? r.peakDb.toFixed(1) : "\u2014"}
                    </td>
                    <td className="py-1 text-right font-mono">
                      {r.baselineDb != null ? r.baselineDb.toFixed(1) : "\u2014"}
                    </td>
                    <td className="py-1 text-right font-mono">
                      {r.deltaDb != null ? `${r.deltaDb.toFixed(1)} dB` : "\u2014"}
                    </td>
                    <td className="py-1 text-[10px] text-slate-400">
                      {r.audit}
                    </td>
                    <td className="py-1">
                      <span
                        className="inline-flex items-center gap-1 text-[9px] font-bold uppercase"
                        style={{ color: classColor(r.clazz) }}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: classColor(r.clazz) }}
                        />
                        {r.clazz}
                        {r.isCatastrophic && (
                          <span className="text-[8px] text-red-400 ml-0.5">
                            CAT
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-1 text-slate-400">
                      {FAULT_FAMILY_LABEL[
                        r.family as keyof typeof FAULT_FAMILY_LABEL
                      ] ?? "Unclassified"}
                      {r.family === "leak" && (
                        <span className="text-[8px] text-slate-500 ml-1 italic">
                          leak nuance
                        </span>
                      )}
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
                {showAll
                  ? "show less"
                  : `+${rows.length - 10} more runs`}
              </button>
            )}
          </div>

          {/* ===== Confessions ===== */}
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 mt-3">
            <p className="text-[11px] text-slate-500">
              <Info className="h-3 w-3 inline text-slate-400 mr-1" />
              measurement point / path ID not recorded at capture &mdash;
              trend assumes same point or permanent mount
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              <Info className="h-3 w-3 inline text-slate-400 mr-1" />
              acoustic library builds from 2+ surveys &mdash;{" "}
              {rows.length} recorded
            </p>
          </div>

          {/* ===== Leak nuance note (if any leak rows exist) ===== */}
          {rows.some((r) => r.family === "leak") && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 mt-3">
              <p className="text-[11px] text-slate-500 italic">
                delta-dB ladder is bearing-condition guidance; leak severity
                rests on pattern and absolute level
              </p>
            </div>
          )}
        </>
      )}

      {/* ===== Source attribution ===== */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 mt-3">
        <p className="text-[10px] text-slate-500">
          Source: {US_DDB_SOURCE}
        </p>
      </div>
    </div>
  );
}
