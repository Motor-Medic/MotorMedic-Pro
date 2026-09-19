/**
 * McaTrendLibraryTab — MCA winding & insulation trend library.
 * Panel A: imbalance % with NEMA MG-1 bracket lines; Panel B: insulation
 * resistance with PI overlay and IEEE 43 reference bands (guidance only);
 * table <=10 rows; confessions printed once; absence != normal.
 */
import React, { useMemo, useState } from "react";
import { Info, Zap } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { classifyFaultFamily, FAULT_FAMILY_LABEL } from "../../lib/diagnostics/faultFamily";
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

export interface McaTrendLibraryTabProps {
  selectedAnalysis: SavedAnalysisResult | null;
  allAnalyses?: SavedAnalysisResult[];
}

interface TrendRow {
  date: string;
  ts: string;
  imbalancePct: number | null;
  audit: string;
  irMohm: number | null;
  pi: number | null;
  clazz: string;
  testVoltage: number | null;
  windingTemp: number | null;
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

function rowFor(r: SavedAnalysisResult): TrendRow {
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
  let audit: string;
  if (storedUb != null) {
    imbalancePct = storedUb;
    audit =
      computedUb != null && Math.abs(storedUb - computedUb) < 0.05
        ? "stored matches computed"
        : computedUb != null
          ? `stored (${storedUb.toFixed(1)}%) vs computed (${computedUb.toFixed(1)}%)`
          : "stored value only";
  } else if (computedUb != null) {
    imbalancePct = computedUb;
    audit = `derived from phase values (${computedUb.toFixed(1)}%)`;
  } else {
    imbalancePct = null;
    audit = "per-phase values not recorded";
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
    audit,
    irMohm: groundwall.ir1mMOmega != null ? groundwall.ir1mMOmega : null,
    pi: groundwall.reportPi ?? null,
    clazz,
    testVoltage: groundwall.testVoltageV > 0 ? groundwall.testVoltageV : null,
    windingTemp: winding.windingTempC ?? null,
    family,
  };
}

const W = 520;
const H = 150;
const PL = 54;
const PR = 12;
const PT = 16;
const PB = 30;
const PADX = 32;

export default function McaTrendLibraryTab({
  selectedAnalysis,
  allAnalyses,
}: McaTrendLibraryTabProps) {
  if (!selectedAnalysis?.asset_id)
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4">
        <Zap className="h-8 w-8 text-slate-600 mb-3" />
        <p className="text-sm font-semibold text-slate-300">
          Select an asset with MCA inspections
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Open an MCA report or select a location to build the winding library.
        </p>
      </div>
    );

  const rows = useMemo<TrendRow[]>(
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
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        )
        .map(rowFor),
    [selectedAnalysis, allAnalyses],
  );

  const [showAll, setShowAll] = useState(false);
  const hasData = rows.length > 0;

  // --- Panel A: imbalance % ---
  const ubVals = rows.map((r) => r.imbalancePct ?? 0);
  const aMax = Math.max(...ubVals, 10) * 1.15;
  const px = (i: number, n: number) =>
    n === 1
      ? (PL + W - PR) / 2
      : PL + PADX + (i * (W - PR - PL - PADX)) / (n - 1);
  const pyA = (v: number) => PT + (1 - Math.max(0, v) / aMax) * (H - PT - PB);
  const gridA = [0, 0.5, 1].map((f) => ({ v: aMax * f, y: pyA(aMax * f) }));
  const bracketLines = [
    { db: 2, label: "2% early asymmetry", color: "#eab308" },
    { db: 4, label: "4% investigate connections", color: "#f59e0b" },
    { db: 8, label: "8% severe asymmetry - derating", color: "#ef4444" },
  ];

  // Collision-aware stagger for Panel A bracket labels
  const COLLISION_PX = 12;
  const aLabelY = bracketLines.map((bl) => ({ raw: pyA(bl.db), adjusted: pyA(bl.db) }));
  for (let i = 1; i < aLabelY.length; i++) {
    if (aLabelY[i].adjusted - aLabelY[i - 1].adjusted < COLLISION_PX) {
      aLabelY[i].adjusted = aLabelY[i - 1].adjusted + COLLISION_PX;
    }
  }

  // --- Panel B: insulation resistance (only rows with stored IR) ---
  const irRows = rows.filter((r) => r.irMohm != null);
  const hasIrData = irRows.length > 0;
  const irVals = irRows.map((r) => r.irMohm!);
  const rawMax = hasIrData ? Math.max(...irVals) : 0;
  const rawMin = hasIrData ? Math.min(...irVals) : 0;
  const degenerate = hasIrData && rawMax === rawMin;
  const bMax = degenerate ? Math.max(4, rawMax + 1) : hasIrData ? rawMax * 1.15 : 10;
  const pyB = (v: number) => PT + (1 - Math.max(0, v) / bMax) * (H - PT - PB);
  const gridB = [0, 0.5, 1].map((f) => ({ v: bMax * f, y: pyB(bMax * f) }));
  const ieeeBands = [
    { v: 1.0, label: "1.0 MΩ", color: "#ef4444" },
    { v: 2.0, label: "2.0 MΩ", color: "#f59e0b" },
    { v: 4.0, label: "4.0 MΩ", color: "#22c55e" },
  ];

  // Collision-aware stagger for Panel B IEEE band labels
  const bLabelY = ieeeBands.map((b) => ({ raw: pyB(b.v), adjusted: pyB(b.v) }));
  for (let i = 1; i < bLabelY.length; i++) {
    if (bLabelY[i].adjusted - bLabelY[i - 1].adjusted < COLLISION_PX) {
      bLabelY[i].adjusted = bLabelY[i - 1].adjusted + COLLISION_PX;
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Zap className="h-4 w-4 text-amber-400 shrink-0" />
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
          Winding &amp; Insulation Trend Library
        </h4>
        <span className="text-[10px] text-slate-500">
          ({rows.length} MCA run{rows.length !== 1 ? "s" : ""})
        </span>
      </div>

      {!hasData ? (
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 mt-3">
          <p className="text-sm text-slate-400 italic">
            No MCA inspections stored for this component. Run an MCA diagnostic
            from Diagnose to seed the winding library.
          </p>
        </div>
      ) : (
        <>
          {rows.length === 1 && (
            <p className="text-[11px] text-slate-500 italic mt-2">
              winding library builds from 2+ tests &mdash; 1 recorded
            </p>
          )}

          {/* ===== Panel A: imbalance % ===== */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 mt-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Phase Imbalance
              </h4>
              <span className="text-[9px] border rounded px-1 border-amber-500/60 text-amber-400">
                %
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
                x={PL - 16}
                y={(PT + H - PB) / 2}
                fontSize="8"
                fill="#f59e0b"
                transform={`rotate(-90 ${PL - 16} ${(PT + H - PB) / 2})`}
                textAnchor="middle"
              >
                %
              </text>
              {/* bracket lines */}
              {bracketLines.map((bl, idx) => (
                <g key={bl.db}>
                  <line
                    x1={PL}
                    x2={W - PR}
                    y1={pyA(bl.db)}
                    y2={pyA(bl.db)}
                    stroke={bl.color}
                    strokeWidth="1"
                    strokeDasharray="6 3"
                    opacity="0.7"
                  />
                  <text
                    x={W - PR + 2}
                    y={aLabelY[idx].adjusted + 2}
                    fontSize="7"
                    fill={bl.color}
                    dominantBaseline="middle"
                  >
                    {bl.label}
                  </text>
                </g>
              ))}
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
              {/* imbalance line */}
              {rows.length > 1 && (
                <polyline
                  points={rows
                    .map(
                      (r, i) =>
                        `${px(i, rows.length)},${pyA(r.imbalancePct ?? 0)}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.2"
                  opacity="0.5"
                />
              )}
              {/* dots */}
              {rows.map((r, i) => (
                <circle
                  key={r.ts + "-pt"}
                  cx={px(i, rows.length)}
                  cy={pyA(r.imbalancePct ?? 0)}
                  r="3"
                  fill={classColor(r.clazz)}
                />
              ))}
            </svg>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {Object.entries(CLASS_COLOR).map(([l, f]) => (
                <span
                  key={l}
                  className="inline-flex items-center gap-1 text-[9px] text-slate-500"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: f }}
                  />
                  {l}
                </span>
              ))}
            </div>
          </div>

          {/* ===== Panel B: insulation resistance ===== */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 mt-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Insulation Resistance
              </h4>
              <span className="text-[9px] border rounded px-1 border-sky-500/60 text-sky-400">
                MΩ
              </span>
            </div>
            {!hasIrData ? (
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 mt-2">
                <p className="text-xs text-slate-400 italic">
                  insulation resistance not recorded in any test - nothing to
                  trend
                </p>
              </div>
            ) : (
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
                  x={PL - 16}
                  y={(PT + H - PB) / 2}
                  fontSize="8"
                  fill="#38bdf8"
                  transform={`rotate(-90 ${PL - 16} ${(PT + H - PB) / 2})`}
                  textAnchor="middle"
                >
                  MΩ
                </text>
                {/* IEEE 43 reference bands */}
                {ieeeBands.map((b, idx) => (
                  <g key={b.v}>
                    <line
                      x1={PL}
                      x2={W - PR}
                      y1={pyB(b.v)}
                      y2={pyB(b.v)}
                      stroke={b.color}
                      strokeWidth="1"
                      strokeDasharray="6 3"
                      opacity="0.7"
                    />
                    <text
                      x={W - PR + 2}
                      y={bLabelY[idx].adjusted + 2}
                      fontSize="7"
                      fill={b.color}
                      dominantBaseline="middle"
                    >
                      {b.label}
                    </text>
                  </g>
                ))}
                {/* date labels */}
                {irRows.map((r, i) => (
                  <g key={r.ts + "-ir-lbl"}>
                    {i === 0 ||
                    irRows[i - 1].ts.slice(0, 10) !== r.ts.slice(0, 10) ? (
                      <text
                        x={px(i, irRows.length)}
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
                {/* IR line */}
                {irRows.length > 1 && (
                  <polyline
                    points={irRows
                      .map(
                        (r, i) =>
                          `${px(i, irRows.length)},${pyB(r.irMohm!)}`,
                      )
                      .join(" ")}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                  />
                )}
                {/* PI overlay dots */}
                {irRows.map((r, i) => (
                  <g key={r.ts + "-ir"}>
                    <circle
                      cx={px(i, irRows.length)}
                      cy={pyB(r.irMohm!)}
                      r="3"
                      fill="#38bdf8"
                    />
                    {r.pi != null && r.pi > 0 && (
                      <text
                        x={px(i, irRows.length)}
                        y={pyB(r.irMohm!) - 6}
                        fontSize="7"
                        fill="#a78bfa"
                        textAnchor="middle"
                      >
                        PI {r.pi.toFixed(1)}
                      </text>
                    )}
                  </g>
                ))}
              </svg>
            )}
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="inline-flex items-center gap-1 text-[9px] text-slate-500">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: "#38bdf8" }}
                />
                IR (MΩ)
              </span>
              <span className="inline-flex items-center gap-1 text-[9px] text-slate-500">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: "#a78bfa" }}
                />
                PI overlay
              </span>
              {ieeeBands.map((b) => (
                <span
                  key={b.v}
                  className="inline-flex items-center gap-1 text-[9px] text-slate-500"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: b.color }}
                  />
                  {b.label}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              IEEE 43 reference bands - test-method guidance, not a severity
              class
            </p>
            {degenerate && (
              <p className="text-[10px] text-amber-500 mt-1">
                all stored insulation values identical ({rawMax.toFixed(1)} MΩ) -
                scale defaulted; zeros are stored measurements, not absence.
              </p>
            )}
          </div>

          {/* ===== Table ===== */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 mt-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              Runs
            </h4>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left font-normal px-2">Date</th>
                  <th className="text-right font-normal px-2">Imbalance %</th>
                  <th className="text-left font-normal px-2">Audit verdict</th>
                  <th className="text-right font-normal px-2">IR (MΩ)</th>
                  <th className="text-right font-normal px-2">PI</th>
                  <th className="text-left font-normal px-2">Class</th>
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
                      {r.imbalancePct != null
                        ? `${r.imbalancePct.toFixed(1)}%`
                        : "\u2014"}
                    </td>
                    <td className="py-1 px-2 text-[10px] text-slate-400">
                      {r.audit}
                    </td>
                    <td className="py-1 px-2 text-right font-mono">
                      {r.irMohm != null ? r.irMohm.toFixed(1) : "\u2014"}
                    </td>
                    <td className="py-1 px-2 text-right font-mono">
                      {r.pi != null ? r.pi.toFixed(2) : "\u2014"}
                    </td>
                    <td className="py-1 px-2">
                      <span
                        className="inline-flex items-center gap-1 text-[9px] font-bold uppercase"
                        style={{ color: classColor(r.clazz) }}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: classColor(r.clazz) }}
                        />
                        {r.clazz}
                      </span>
                    </td>
                    <td className="py-1 px-2 text-right font-mono text-slate-400">
                      {r.testVoltage != null ? r.testVoltage.toFixed(0) : "\u2014"}
                    </td>
                    <td className="py-1 px-2 text-right font-mono text-slate-400">
                      {r.windingTemp != null ? r.windingTemp.toFixed(0) : "\u2014"}
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
              MCA trend assumes comparable test conditions &mdash; winding
              temperature, lead compensation, and test voltage affect absolute
              values
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              <Info className="h-3 w-3 inline text-slate-400 mr-1" />
              winding library builds from 2+ tests &mdash; {rows.length}{" "}
              recorded
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
