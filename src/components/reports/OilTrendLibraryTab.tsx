/**
 * OilTrendLibraryTab — Tribology & Wear Trend Library (oil Tab 2).
 * Four panels: Wear Debris Matrix, Fluid Health Slope Bands,
 * Baseline Comparator, Sampling Cadence.  Top-off / oil-change
 * events confessed when absent; slope bands are guidance, never
 * severity; sparklines confess their own normalization.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Droplet, Info } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { fetchOilSamples } from "../../lib/oilSampleRow";
import type { OilSample } from "../../types/oilAnalysis";

export interface OilTrendLibraryTabProps {
  selectedAnalysis: SavedAnalysisResult | null;
  allAnalyses?: SavedAnalysisResult[];
  equipmentAssetId?: string | null;
}

const card = "rounded-xl border border-white/10 bg-slate-950/40 p-4";
const subcard = "rounded-lg border border-slate-700 bg-slate-900/50 p-3";
const lbl = "text-[10px] font-bold uppercase tracking-wider text-slate-500";

interface ElementDef {
  key: keyof OilSample;
  symbol: string;
  unit: string;
  color: string;
  alarmKey: keyof OilSample;
  baselineKey?: keyof OilSample;
}

const ELEMENTS: ElementDef[] = [
  { key: "iron", symbol: "Fe", unit: "PPM", color: "#eab308", alarmKey: "ironAlarmLimit", baselineKey: "baselineIron" },
  { key: "copper", symbol: "Cu", unit: "PPM", color: "#22d3ee", alarmKey: "copperAlarmLimit", baselineKey: "baselineCopper" },
  { key: "lead", symbol: "Pb", unit: "PPM", color: "#a78bfa", alarmKey: "leadAlarmLimit" },
  { key: "chromium", symbol: "Cr", unit: "PPM", color: "#94a3b8", alarmKey: "chromiumAlarmLimit", baselineKey: "baselineChromium" },
  { key: "aluminum", symbol: "Al", unit: "PPM", color: "#f472b6", alarmKey: "aluminumAlarmLimit" },
  { key: "silicon", symbol: "Si", unit: "PPM", color: "#fb923c", alarmKey: "siliconAlarmLimit" },
];

const ADDITIVE_ELEMENTS: { symbol: string; label: string }[] = [
  { symbol: "Zn", label: "Zinc" },
  { symbol: "P", label: "Phosphorus" },
  { symbol: "Ca", label: "Calcium" },
];

const SW = 100;
const SH = 20;
const SPAD = 1;

function val(sample: OilSample, key: keyof OilSample): number | undefined {
  const v = sample[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : iso;
}

function daysBetween(a: string, b: string): number {
  return Math.round(Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

/* ── Sparkline (row-normalized) ────────────────────────────────────────── */

function RowSparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length === 0) return <span className="text-[10px] text-slate-500">—</span>;
  if (points.length === 1) {
    return (
      <svg viewBox={`0 0 ${SW} ${SH}`} className="w-16 h-4" preserveAspectRatio="none">
        <circle cx={SW / 2} cy={SH / 2} r="2" fill={color} />
      </svg>
    );
  }
  const mn = Math.min(...points);
  const mx = Math.max(...points);
  const range = mx - mn || 1;
  const coords = points.map((v, i) => {
    const x = SPAD + (i / (points.length - 1)) * (SW - SPAD * 2);
    const y = SH - SPAD - ((v - mn) / range) * (SH - SPAD * 2);
    return `${x},${y}`;
  }).join(" ");
  const last = points[points.length - 1];
  const lastX = SW - SPAD;
  const lastY = SH - SPAD - ((last - mn) / range) * (SH - SPAD * 2);
  return (
    <svg viewBox={`0 0 ${SW} ${SH}`} className="w-16 h-4" preserveAspectRatio="none">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r="1.5" fill={color} />
    </svg>
  );
}

/* ── Wear-mode pattern detection ───────────────────────────────────────── */

function detectWearPattern(samples: OilSample[]): string | null {
  if (samples.length < 2) return null;
  const prev = samples[samples.length - 2];
  const curr = samples[samples.length - 1];
  const cuUp = (val(curr, "copper") ?? 0) > (val(prev, "copper") ?? 0);
  const pbUp = (val(curr, "lead") ?? 0) > (val(prev, "lead") ?? 0);
  const feUp = (val(curr, "iron") ?? 0) > (val(prev, "iron") ?? 0);
  const crUp = (val(curr, "chromium") ?? 0) > (val(prev, "chromium") ?? 0);
  const siUp = (val(curr, "silicon") ?? 0) > (val(prev, "silicon") ?? 0);
  const alUp = (val(curr, "aluminum") ?? 0) > (val(prev, "aluminum") ?? 0);
  if (cuUp && pbUp) return "Cu + Pb rise — bronze/brass bearing or bushing wear";
  if (feUp && crUp) return "Fe + Cr rise — steel component wear (gears, shafts, bearing races)";
  if (siUp && alUp) return "Si + Al rise — dirt contamination ingress";
  if (feUp && siUp) return "Fe + Si rise — abrasive wear from contamination";
  return null;
}

/* ── Slope computation (per calendar day, last 3+ samples) ─────────────── */

function slopePerDay(
  samples: OilSample[],
  extract: (s: OilSample) => number | undefined
): { rate: number; n: number } | null {
  const pts = samples
    .map((s) => ({ days: daysBetween(samples[0].sampleDate, s.sampleDate), v: extract(s) }))
    .filter((p) => p.v != null) as { days: number; v: number }[];
  if (pts.length < 3) return { rate: 0, n: pts.length };
  const first = pts[0];
  const last = pts[pts.length - 1];
  const dd = last.days - first.days;
  if (dd <= 0) return { rate: 0, n: pts.length };
  return { rate: (last.v - first.v) / dd, n: pts.length };
}

/* ── Component ─────────────────────────────────────────────────────────── */

export default function OilTrendLibraryTab({
  selectedAnalysis,
  allAnalyses,
  equipmentAssetId,
}: OilTrendLibraryTabProps) {
  const assetId = equipmentAssetId ?? selectedAnalysis?.asset_id ?? (() => {
    if (!allAnalyses?.length) return null;
    const ids = [...new Set(allAnalyses.map((r) => r.asset_id).filter(Boolean))];
    return ids.length === 1 ? ids[0]! : null;
  })();

  const [samples, setSamples] = useState<OilSample[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId) { setSamples([]); return; }
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
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;

  if (!assetId) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4">
        <Droplet className="h-8 w-8 text-slate-600 mb-3" />
        <p className="text-sm font-semibold text-slate-300">Select an asset with oil analysis samples</p>
        <p className="text-xs text-slate-500 mt-1">Open an oil report or select a location to build the trend library.</p>
      </div>
    );
  }

  const n = sorted.length;
  const pattern = detectWearPattern(sorted);

  /* P1 data */
  const elementRows = ELEMENTS.map((el) => {
    const values = sorted.map((s) => val(s, el.key));
    const hasData = values.some((v) => v != null && v > 0);
    const latestVal = latest ? val(latest, el.key) : undefined;
    const prevVal = prev ? val(prev, el.key) : undefined;
    const delta = latestVal != null && prevVal != null ? latestVal - prevVal : undefined;
    const alarmVal = latest ? val(latest, el.alarmKey) : undefined;
    return { ...el, values, hasData, latestVal, delta, alarmVal };
  });

  /* P2 data — two charts: viscosity + acid/base number */
  const hasViscosity = sorted.some((s) => s.viscosity40C != null);
  const hasTan = sorted.some((s) => s.acidNumber != null);
  const hasTbn = sorted.some((s) => s.tbn != null);
  const viscParam = hasViscosity
    ? { key: "viscosity40C" as const, label: "Viscosity @40°C", unit: "cSt" }
    : null;
  const chemParam = hasTan
    ? { key: "acidNumber" as const, label: "TAN (Total Acid Number)", unit: "mg KOH/g" }
    : hasTbn
      ? { key: "tbn" as const, label: "TBN (Total Base Number)", unit: "mg KOH/g" }
      : null;
  const viscSlope = viscParam ? slopePerDay(sorted, (s) => val(s, viscParam.key)) : null;
  const chemSlope = chemParam ? slopePerDay(sorted, (s) => val(s, chemParam.key)) : null;

  /* P3 data */
  const hasVirginBaseline = ELEMENTS.some((el) => {
    if (!el.baselineKey) return false;
    return latest && val(latest, el.baselineKey) != null;
  });

  /* P4 data */
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(daysBetween(sorted[i - 1].sampleDate, sorted[i].sampleDate));
  }
  const avgInterval = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;
  const intervalSpread = intervals.length > 1
    ? Math.max(...intervals) - Math.min(...intervals)
    : 0;

  return (
    <div className="space-y-4">
      {/* ===== HEADER ===== */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-1">
          <Droplet className="h-4 w-4 text-cyan-400 shrink-0" />
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Tribology & Wear Trend Library</h4>
          <span className="text-[10px] text-slate-500">({n} sample{n !== 1 ? "s" : ""})</span>
        </div>
        <p className="text-[10px] text-slate-500">wear limits are lab and OEM practice — no universal ISO severity class standard exists for oil analysis</p>
      </div>

      {loading && (
        <div className={card}>
          <p className="text-xs text-slate-400 italic">Loading oil samples…</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {!loading && !error && n === 0 && (
        <div className={card}>
          <p className="text-sm text-slate-400 italic">No oil samples on file for this asset. Capture a sample to populate the trend library.</p>
        </div>
      )}

      {!loading && !error && n > 0 && (<>

        {/* ===== P1: WEAR DEBRIS MATRIX ===== */}
        <div className={card}>
          <h5 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-2">P1 — Wear Debris Matrix</h5>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left font-normal py-1 pr-2">Element</th>
                  <th className="text-left font-normal py-1 px-1">Trend</th>
                  <th className="text-right font-normal py-1 px-1">Latest</th>
                  <th className="text-right font-normal py-1 px-1">Δ prev</th>
                  <th className="text-right font-normal py-1 px-1">Alarm (lab practice)</th>
                  <th className="text-left font-normal py-1 pl-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {elementRows.map((el) => {
                  const tested = el.hasData;
                  const latestStr = el.latestVal != null ? el.latestVal.toFixed(1) : "—";
                  const deltaStr = el.delta != null ? `${el.delta >= 0 ? "+" : ""}${el.delta.toFixed(1)}` : "—";
                  const alarmStr = el.alarmVal != null ? el.alarmVal.toFixed(0) : "—";
                  const overAlarm = el.latestVal != null && el.alarmVal != null && el.latestVal > el.alarmVal;
                  return (
                    <tr key={el.key} className="border-t border-slate-800/50">
                      <td className="py-1.5 pr-2 font-mono font-bold" style={{ color: el.color }}>
                        {el.symbol} <span className="text-slate-500 font-normal normal-case">{el.unit}</span>
                      </td>
                      <td className="py-1.5 px-1">
                        {tested ? (
                          <RowSparkline points={el.values.filter((v): v is number => v != null)} color={el.color} />
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-1 text-right font-mono">{latestStr}</td>
                      <td className={`py-1.5 px-1 text-right font-mono ${el.delta != null && el.delta > 0 ? "text-amber-400" : el.delta != null && el.delta < 0 ? "text-emerald-400" : ""}`}>
                        {deltaStr}
                      </td>
                      <td className="py-1.5 px-1 text-right font-mono text-slate-500">{alarmStr}</td>
                      <td className="py-1.5 pl-2">
                        {overAlarm ? (
                          <span className="text-[9px] font-bold uppercase text-red-400">over alarm</span>
                        ) : tested ? (
                          <span className="text-[9px] text-slate-500">within limit</span>
                        ) : (
                          <span className="text-[9px] text-slate-600">not tested</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            <Info className="h-3 w-3 inline text-slate-400 mr-1" />
            row-normalized sparklines — absolute scales differ per element
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            <Info className="h-3 w-3 inline text-slate-400 mr-1" />
            alarm limits per stored lab practice — not a universal standard
          </p>
          {n < 2 && (
            <p className="text-[10px] text-amber-400/80 mt-1">
              trend requires 2+ samples — {n} recorded
            </p>
          )}
          {pattern && (
            <p className="text-[10px] text-cyan-400/80 mt-1">
              <Info className="h-3 w-3 inline mr-1" />
              pattern guidance, not a diagnosis: {pattern}
            </p>
          )}
        </div>

        {/* ===== P2: FLUID HEALTH SLOPE BANDS ===== */}
        <div className={card}>
          <h5 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-2">P2 — Fluid Health Slope Bands</h5>
          {viscParam && (
            <>
              <FluidChart
                samples={sorted}
                paramKey={viscParam.key}
                label={viscParam.label}
                unit={viscParam.unit}
              />
              {viscSlope && viscSlope.n >= 3 && (
                <p className="text-[10px] text-slate-500 mt-2">
                  slope: {viscSlope.rate >= 0 ? "+" : ""}{viscSlope.rate.toFixed(4)} {viscParam.unit}/day (last {viscSlope.n} samples)
                </p>
              )}
              {viscSlope && viscSlope.n < 3 && (
                <p className="text-[10px] text-amber-400/80 mt-2">
                  slope requires 3+ samples — {viscSlope.n} recorded
                </p>
              )}
            </>
          )}
          {chemParam && (
            <>
              <FluidChart
                samples={sorted}
                paramKey={chemParam.key}
                label={chemParam.label}
                unit={chemParam.unit}
              />
              {chemSlope && chemSlope.n >= 3 && (
                <p className="text-[10px] text-slate-500 mt-2">
                  slope: {chemSlope.rate >= 0 ? "+" : ""}{chemSlope.rate.toFixed(4)} {chemParam.unit}/day (last {chemSlope.n} samples)
                </p>
              )}
              {chemSlope && chemSlope.n < 3 && (
                <p className="text-[10px] text-amber-400/80 mt-2">
                  slope requires 3+ samples — {chemSlope.n} recorded
                </p>
              )}
            </>
          )}
          {!viscParam && !chemParam && (
            <p className="text-[10px] text-slate-500 italic">
              viscosity @40°C, TAN, and TBN not recorded — fluid health trending unavailable
            </p>
          )}
        </div>

        {/* ===== P3: BASELINE COMPARATOR ===== */}
        <div className={card}>
          <h5 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-2">P3 — Baseline Comparator</h5>
          {latest && (
            <BaselineBars
              latest={latest}
              prev={prev}
              hasVirginBaseline={hasVirginBaseline}
              elements={ELEMENTS}
            />
          )}
          {!hasVirginBaseline && (
            <p className="text-[10px] text-slate-500 mt-2">
              <Info className="h-3 w-3 inline text-slate-400 mr-1" />
              virgin oil baseline not recorded — diffing against previous sample
            </p>
          )}
          <p className="text-[10px] text-slate-500 mt-1">
            <Info className="h-3 w-3 inline text-slate-400 mr-1" />
            additive package not recorded — depletion diffing unavailable
          </p>
        </div>

        {/* ===== P4: SAMPLING CADENCE ===== */}
        <div className={card}>
          <h5 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-2">P4 — Sampling Cadence</h5>
          {intervals.length > 0 ? (
            <CadenceBars intervals={intervals} sorted={sorted} />
          ) : (
            <p className="text-[10px] text-slate-500 italic">
              sampling cadence requires 2+ samples — {n} recorded
            </p>
          )}
          <p className="text-[10px] text-slate-500 mt-2">
            <Info className="h-3 w-3 inline text-slate-400 mr-1" />
            target cadence not recorded — actual intervals only
          </p>
          {intervalSpread > 60 && intervals.length > 1 && (
            <p className="text-[10px] text-amber-400/80 mt-1">
              irregular sampling cadence lowers slope confidence
            </p>
          )}
        </div>

        {/* ===== GUARDIAN: TOP-OFF / OIL-CHANGE ===== */}
        <div className={subcard}>
          <p className="text-[11px] text-slate-500">
            <Info className="h-3 w-3 inline text-slate-400 mr-1" />
            top-off / make-up oil events not recorded — dilution effects cannot be flagged on these timelines; wear concentration drops may be dilution, not machine recovery
          </p>
        </div>

        {/* ===== FOOTER ===== */}
        <div className={subcard}>
          <p className="text-[10px] text-slate-500">
            Three pillars: trend direction, rate of change, and context — none alone is a diagnosis.
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            Watchlist: rising wear metals, declining TBN, increasing viscosity, ISO code drift.
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            This library presents guided trending — every interpretation requires site-specific context and professional judgment.
          </p>
        </div>
      </>)}
    </div>
  );
}

/* ── Fluid Health Chart (P2 sub-component) ─────────────────────────────── */

function FluidChart({
  samples,
  paramKey,
  label,
  unit,
}: {
  samples: OilSample[];
  paramKey: "viscosity40C" | "acidNumber" | "tbn";
  label: string;
  unit: string;
}) {
  const W = 520;
  const H = 150;
  const PL = 54;
  const PR = 12;
  const PT = 16;
  const PB = 30;
  const PADX = 32;

  const pts = samples
    .map((s) => ({ date: s.sampleDate, v: val(s, paramKey) }))
    .filter((p) => p.v != null) as { date: string; v: number }[];

  if (pts.length === 0) {
    return <p className="text-[10px] text-slate-500 italic">{label} not recorded across any samples</p>;
  }

  const values = pts.map((p) => p.v);
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const pad = (mx - mn) * 0.15 || 1;
  const yMin = mn - pad;
  const yMax = mx + pad;

  const px = (i: number) => {
    if (pts.length === 1) return (PL + W - PR) / 2;
    return PL + PADX + (i / (pts.length - 1)) * (W - PR - PL - PADX);
  };
  const py = (v: number) => PT + (1 - (v - yMin) / (yMax - yMin)) * (H - PT - PB);

  const coords = pts.map((p, i) => `${px(i)},${py(p.v)}`).join(" ");

  /* Degradation window band */
  const slope = pts.length >= 3
    ? (pts[pts.length - 1].v - pts[0].v) / daysBetween(pts[0].date, pts[pts.length - 1].date)
    : 0;
  const bandTop = pts[pts.length - 1].v + Math.abs(slope) * 30;
  const bandBot = pts[pts.length - 1].v - Math.abs(slope) * 30;
  const bandY1 = py(Math.min(bandTop, yMax));
  const bandY2 = py(Math.max(bandBot, yMin));

  const grid = [0, 0.5, 1].map((f) => {
    const v = yMin + f * (yMax - yMin);
    return { v, y: py(v) };
  });

  return (
    <div className={subcard}>
      <div className="flex items-center justify-between gap-2 px-1 mb-1">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</h4>
        <span className="text-[9px] border rounded px-1 border-cyan-500/60 text-cyan-400">{unit}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40" preserveAspectRatio="none">
        {grid.map((g, gi) => (
          <g key={g.v.toFixed(2)}>
            <line x1={PL} x2={W - PR} y1={g.y} y2={g.y} stroke="#334155" strokeDasharray="3 3" />
            <text x={PL - 6 - (gi === 1 ? 6 : 0)} y={g.y + 2} fontSize="8" fill="#64748b" textAnchor="end" dominantBaseline="middle">
              {g.v.toFixed(1)}
            </text>
          </g>
        ))}
        <text x={PL - 10} y={(PT + H - PB) / 2} fontSize="8" fill="#38bdf8" transform={`rotate(-90 ${PL - 10} ${(PT + H - PB) / 2})`} textAnchor="middle">
          {unit}
        </text>
        {pts.length >= 3 && (
          <rect x={PL} y={Math.min(bandY1, bandY2)} width={W - PL - PR} height={Math.abs(bandY2 - bandY1)} fill="#22d3ee" opacity={0.08} />
        )}
        <polyline points={coords} fill="none" stroke="#22d3ee" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {pts.map((p, i) => (
          <circle key={i} cx={px(i)} cy={py(p.v)} r="2.5" fill="#22d3ee" />
        ))}
        {pts.map((p, i) => (
          <text key={`d${i}`} x={px(i)} y={H - 10} fontSize="7" fill="#64748b" textAnchor="middle">
            {fmtDate(p.date).split(",")[0]}
          </text>
        ))}
      </svg>
      {pts.length >= 3 && (
        <p className="text-[9px] text-slate-500 mt-1">
          site practice degradation window — guidance, not a standard
        </p>
      )}
    </div>
  );
}

/* ── Baseline Bars (P3 sub-component) ──────────────────────────────────── */

function BaselineBars({
  latest,
  prev,
  hasVirginBaseline,
  elements,
}: {
  latest: OilSample;
  prev: OilSample | null;
  hasVirginBaseline: boolean;
  elements: ElementDef[];
}) {
  const bars = elements.map((el) => {
    const currVal = val(latest, el.key);
    if (currVal == null) return null;
    let refVal: number | undefined;
    let refLabel: string;
    if (hasVirginBaseline && el.baselineKey) {
      refVal = val(latest, el.baselineKey);
      refLabel = "virgin";
    } else if (prev) {
      refVal = val(prev, el.key);
      refLabel = "previous sample";
    } else {
      return null;
    }
    if (refVal == null) return null;
    const pctChange = refVal === 0 ? (currVal > 0 ? 100 : 0) : ((currVal - refVal) / refVal) * 100;
    const absDelta = currVal - refVal;
    return { ...el, pctChange, absDelta, refLabel };
  }).filter(Boolean) as (ElementDef & { pctChange: number; absDelta: number; refLabel: string })[];

  if (bars.length === 0) {
    return <p className="text-[10px] text-slate-500 italic">insufficient data for baseline comparison</p>;
  }

  const maxAbs = Math.max(...bars.map((b) => Math.abs(b.pctChange)), 1);
  const barW = 60;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[9px] border rounded px-1 border-cyan-500/60 text-cyan-400">% change vs {bars[0]?.refLabel ?? "baseline"}</span>
        <span className="text-[9px] text-slate-500">absolute units differ per element</span>
      </div>
      <div className="flex items-end gap-3 overflow-x-auto pb-2">
        {bars.map((b) => {
          const h = Math.max(4, (Math.abs(b.pctChange) / maxAbs) * 80);
          const isPos = b.pctChange >= 0;
          return (
            <div key={b.key} className="flex flex-col items-center min-w-[70px]">
              <span className="text-[9px] font-mono text-slate-400 mb-1">
                {isPos ? "+" : ""}{b.pctChange.toFixed(1)}%
              </span>
              <div
                className="w-10 rounded-t"
                style={{
                  height: h,
                  background: isPos ? "#ef4444" : "#22c55e",
                  opacity: 0.7,
                }}
              />
              <div className="w-10 h-px bg-slate-600" />
              <span className="text-[9px] font-mono text-slate-500 mt-1">
                {b.absDelta >= 0 ? "+" : ""}{b.absDelta.toFixed(1)} {b.unit}
              </span>
              <span className="text-[9px] font-bold mt-0.5" style={{ color: b.color }}>
                {b.symbol}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Cadence Bars (P4 sub-component) ───────────────────────────────────── */

function CadenceBars({
  intervals,
  sorted,
}: {
  intervals: number[];
  sorted: OilSample[];
}) {
  const maxInterval = Math.max(...intervals, 1);
  const barH = 20;

  return (
    <div>
      <div className="flex items-end gap-1 overflow-x-auto pb-1">
        {intervals.map((d, i) => {
          const h = Math.max(4, (d / maxInterval) * barH);
          return (
            <div key={i} className="flex flex-col items-center min-w-[50px]">
              <span className="text-[9px] font-mono text-slate-400 mb-0.5">{d}d</span>
              <div
                className="w-8 rounded-t"
                style={{
                  height: h,
                  background: "#22d3ee",
                  opacity: 0.6,
                }}
              />
              <span className="text-[7px] text-slate-600 mt-0.5">
                {fmtDate(sorted[i].sampleDate).split(",")[0]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
