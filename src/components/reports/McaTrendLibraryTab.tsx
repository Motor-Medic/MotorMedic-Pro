/**
 * McaTrendLibraryTab — MCA winding & insulation trend library.
 * Panel A: imbalance % with NEMA MG-1 bracket lines from the practice
 * dictionary; Panel B: insulation resistance with PI overlay and in-tab IR
 * guidance bands; the footnote names IEEE Std 43 as the recommended practice
 * for insulation-resistance testing (guidance only); table <=10 rows;
 * confessions printed once; absence != normal; zero is a valid reading.
 */
import React, { useMemo, useState } from "react";
import { Info, Zap } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { classifyFaultFamily, FAULT_FAMILY_LABEL } from "../../lib/diagnostics/faultFamily";
import {
  evaluateMcaSeverity,
  formatMcaPi,
  MCA_IMBALANCE_BRACKETS,
  MCA_IMBALANCE_SOURCE,
  MCA_IR_CITATION,
  MCA_TEST_CONDITIONS_CONFESSION,
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
  ir10Mohm: number | null;
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

/** contiguous [start, end) spans where valid holds - missing runs break the
 * plot line instead of being drawn through or drawn as 0 */
function validSpans(valid: boolean[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = -1;
  valid.forEach((v, i) => {
    if (v && start < 0) start = i;
    if (!v && start >= 0) {
      out.push([start, i]);
      start = -1;
    }
  });
  if (start >= 0) out.push([start, valid.length]);
  return out;
}

/** label y positions that shift up only (never down) with a guaranteed
 * clearance, so crowded labels stay inside the panel and non-overlapping */
function labelRows(naturals: number[], gap: number, top: number): number[] {
  const placed = [...naturals];
  let prev = Number.POSITIVE_INFINITY;
  const bottomFirst = naturals
    .map((y, i) => ({ y, i }))
    .sort((a, b) => b.y - a.y);
  for (const { y, i } of bottomFirst) {
    const candidate =
      prev === Number.POSITIVE_INFINITY ? y : Math.min(y, prev - gap);
    placed[i] = Math.max(candidate, top);
    prev = placed[i];
  }
  return placed;
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
    irMohm: groundwall.fromTelemetry ? num(groundwall.ir1mMOmega) : null,
    ir10Mohm: groundwall.fromTelemetry ? num(groundwall.ir10mMOmega) : null,
    pi: num(groundwall.reportPi),
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
// bracket/band gutter labels start just right of the plot edge
const GUTTER_X = W - PR + 2;
// conservative half-width of an "Aug 15"-style date label at fontSize 8
const DATE_LABEL_HALF = 14;
// gutter sizing: longest label + clearance, shared by both panels so their
// x scales and date labels stay aligned
const GUTTER_LABEL_EM = 0.56;
const GUTTER_CLEAR = 40;

/** right-edge date labels are anchored at their tick instead of centered
 * across the plot border, so the full date always sits inside the plot
 * (geometry only - no label text is truncated) */
function dateAnchor(x: number): "middle" | "end" {
  return x + DATE_LABEL_HALF > W - PR ? "end" : "middle";
}

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
  const ubPresent = rows
    .map((r) => r.imbalancePct)
    .filter((v): v is number => v != null);
  const aMax = Math.max(...ubPresent, 10) * 1.15;
  const px = (i: number, n: number) =>
    n === 1
      ? (PL + W - PR) / 2
      : PL + PADX + (i * (W - PR - PL - PADX)) / (n - 1);
  const pyA = (v: number) => PT + (1 - Math.max(0, v) / aMax) * (H - PT - PB);
  const gridA = [0, 0.5, 1].map((f) => ({ v: aMax * f, y: pyA(aMax * f) }));
  // thresholds and names single-sourced from the practice dictionary
  const bracketLines = MCA_IMBALANCE_BRACKETS.slice(1).map((b) => ({
    pct: b.minPct,
    label: `${b.minPct}% ${b.action}`,
    color: classColor(b.clazz),
  }));

  // Collision-aware upward stagger for Panel A bracket labels
  const COLLISION_PX = 12;
  const aLabelY = labelRows(
    bracketLines.map((bl) => pyA(bl.pct)),
    COLLISION_PX,
    PT + 4,
  );
  const ubSpans = validSpans(rows.map((r) => r.imbalancePct != null));
  const ubGapSpans = validSpans(rows.map((r) => r.imbalancePct == null));
  const ubMissY = PT + (H - PT - PB) / 2;

  // --- Panel B: insulation resistance (scale from rows with recorded IR) ---
  const irRows = rows.filter((r) => r.irMohm != null);
  const hasIrData = irRows.length > 0;
  const irVals = irRows.map((r) => r.irMohm!);
  const rawMax = hasIrData ? Math.max(...irVals) : 0;
  const rawMin = hasIrData ? Math.min(...irVals) : 0;
  const degenerate = hasIrData && rawMax === rawMin;
  const bMax = degenerate ? Math.max(4, rawMax + 1) : hasIrData ? rawMax * 1.15 : 10;
  const pyB = (v: number) => PT + (1 - Math.max(0, v) / bMax) * (H - PT - PB);
  const gridB = [0, 0.5, 1].map((f) => ({ v: bMax * f, y: pyB(bMax * f) }));
  // in-tab IR trend guidance bands (footnote confesses the real source)
  const ieeeBands = [
    { v: 1.0, label: "1.0 MΩ", color: "#ef4444" },
    { v: 2.0, label: "2.0 MΩ", color: "#f59e0b" },
    { v: 4.0, label: "4.0 MΩ", color: "#22c55e" },
  ];

  // Right gutter: labels drawn from GUTTER_X must fit fully inside the
  // viewBox with clearance (0.56 em/char at fontSize 7 covers the longest
  // dictionary rung; the 48-char 8% rung measures ~168 user units).
  const RGUT = Math.ceil(
    Math.max(
      0,
      ...bracketLines.map((b) => b.label.length * 7 * GUTTER_LABEL_EM),
      ...ieeeBands.map((b) => b.label.length * 7 * GUTTER_LABEL_EM),
    ) +
      GUTTER_CLEAR +
      (GUTTER_X - W),
  );

  // Collision-aware upward stagger for Panel B band labels
  const bLabelY = labelRows(
    ieeeBands.map((b) => pyB(b.v)),
    COLLISION_PX,
    PT + 4,
  );
  const irSpans = validSpans(rows.map((r) => r.irMohm != null));
  const irGapSpans = validSpans(rows.map((r) => r.irMohm == null));
  const irMissY = PT + (H - PT - PB) / 2;

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
              viewBox={`0 0 ${W + RGUT} ${H}`}
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
                <g key={bl.pct}>
                  <line
                    x1={PL}
                    x2={W - PR}
                    y1={pyA(bl.pct)}
                    y2={pyA(bl.pct)}
                    stroke={bl.color}
                    strokeWidth="1"
                    strokeDasharray="6 3"
                    opacity="0.7"
                  />
                  <text
                    x={W - PR + 2}
                    y={aLabelY[idx] + 2}
                    fontSize="7"
                    fill={bl.color}
                    dominantBaseline="middle"
                  >
                    {bl.label}
                  </text>
                </g>
              ))}
              {/* date labels - right-edge label anchored at its tick so the
                  full date stays inside the plot */}
              {rows.map((r, i) => (
                <g key={r.ts + "-lbl"}>
                  {i === 0 ||
                  rows[i - 1].ts.slice(0, 10) !== r.ts.slice(0, 10) ? (
                    <text
                      x={px(i, rows.length)}
                      y={H - 10}
                      fontSize="8"
                      fill="#64748b"
                      textAnchor={dateAnchor(px(i, rows.length))}
                    >
                      {r.date.split(",")[0]}
                    </text>
                  ) : null}
                </g>
              ))}
              {/* imbalance line - breaks at runs with no recorded value */}
              {ubSpans
                .filter((s) => s[1] - s[0] > 1)
                .map((s) => (
                  <polyline
                    key={`ub-${s[0]}-${s[1]}`}
                    points={rows
                      .slice(s[0], s[1])
                      .map(
                        (r, k) =>
                          `${px(s[0] + k, rows.length)},${pyA(r.imbalancePct!)}`,
                      )
                      .join(" ")}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1.2"
                    opacity="0.5"
                  />
                ))}
              {ubPresent.length === 0 ? (
                <text
                  x={(PL + W - PR) / 2}
                  y={ubMissY}
                  fontSize="8"
                  fill="#94a3b8"
                  textAnchor="middle"
                >
                  no phase imbalance recorded in any run
                </text>
              ) : (
                ubGapSpans.map((s) => (
                  <text
                    key={`ubgap-${s[0]}-${s[1]}`}
                    x={px((s[0] + s[1] - 1) / 2, rows.length)}
                    y={ubMissY}
                    fontSize="7"
                    fill="#94a3b8"
                    textAnchor="middle"
                  >
                    no data recorded
                  </text>
                ))
              )}
              {/* dots - only where recorded; a stored 0 plots at 0 */}
              {rows.map((r, i) =>
                r.imbalancePct != null ? (
                  <circle
                    key={r.ts + "-pt"}
                    cx={px(i, rows.length)}
                    cy={pyA(r.imbalancePct)}
                    r="3"
                    fill={classColor(r.clazz)}
                  />
                ) : null,
              )}
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
                viewBox={`0 0 ${W + RGUT} ${H}`}
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
                {/* IR trend guidance bands */}
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
                      y={bLabelY[idx] + 2}
                      fontSize="7"
                      fill={b.color}
                      dominantBaseline="middle"
                    >
                      {b.label}
                    </text>
                  </g>
                ))}
                {/* date labels - shared x scale with Panel A */}
                {rows.map((r, i) => (
                  <g key={r.ts + "-ir-lbl"}>
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
                {/* IR line - breaks at runs without recorded IR */}
                {irSpans
                  .filter((s) => s[1] - s[0] > 1)
                  .map((s) => (
                    <polyline
                      key={`ir-${s[0]}-${s[1]}`}
                      points={rows
                        .slice(s[0], s[1])
                        .map(
                          (r, k) =>
                            `${px(s[0] + k, rows.length)},${pyB(r.irMohm!)}`,
                        )
                        .join(" ")}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                    />
                  ))}
                {irGapSpans.map((s) => (
                  <text
                    key={`irgap-${s[0]}-${s[1]}`}
                    x={px((s[0] + s[1] - 1) / 2, rows.length)}
                    y={irMissY}
                    fontSize="7"
                    fill="#94a3b8"
                    textAnchor="middle"
                  >
                    no data recorded
                  </text>
                ))}
                {/* IR dots + PI overlay - only where recorded; stored 0 plots at 0 */}
                {rows.map((r, i) =>
                  r.irMohm != null ? (
                    <g key={r.ts + "-ir"}>
                      <circle
                        cx={px(i, rows.length)}
                        cy={pyB(r.irMohm)}
                        r="3"
                        fill="#38bdf8"
                      />
                      {r.pi != null && (
                        <text
                          x={px(i, rows.length)}
                          y={pyB(r.irMohm) - 6}
                          fontSize="7"
                          fill="#a78bfa"
                          textAnchor="middle"
                        >
                          PI {r.pi.toFixed(1)}
                        </text>
                      )}
                    </g>
                  ) : null,
                )}
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
              1.0 / 2.0 / 4.0 MΩ bands are in-tab trend guidance, not IEEE Std
              43 thresholds; {MCA_IR_CITATION}
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
                      {formatMcaPi(r.pi, r.irMohm, r.ir10Mohm)}
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
              {MCA_TEST_CONDITIONS_CONFESSION}
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
