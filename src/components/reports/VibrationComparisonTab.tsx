import React, { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { extractVibrationRecordFromAnalysis } from "../../lib/vibration/vibrationDiagnosticRecord";
import { extractTruePeaks, diffSpectra, buildFaultHistory, type Peak, type DiffResult } from "../../lib/diagnostics/spectralDiff";

interface VibrationComparisonTabProps {
  isActive: boolean;
  selectedAnalysis: SavedAnalysisResult | null;
  loadedAnalyses: SavedAnalysisResult[];
}

function parsePeaks(row: SavedAnalysisResult | null): Peak[] {
  if (!row) return [];
  const out: Peak[] = [];
  const num = (v: unknown): number => (typeof v === "number" || typeof v === "string") && Number.isFinite(Number(v)) ? Number(v) : NaN;
  const walk = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const it of v) walk(it); return; }
    const o = v as Record<string, unknown>;
    const f = num(o.frequencyHz ?? o.frequency_hz ?? o.freqHz ?? o.freq_hz ?? o.frequency ?? o.freq ?? o.hz ?? o.count);
    const a = num(o.amplitude ?? o.amp ?? o.value);
    if (f > 0 && a > 0) { out.push({ frequency: f, amplitude: a }); return; }
    for (const k of ["record", "telemetry_data", "telemetry", "vibration_trend_record", "spectral", "spectrum", "peaks", "fft_data", "vibration_peaks"])
      if (o[k] != null) walk(o[k]);
  };
  walk(row);
  return out;
}

function rowRpm(row: SavedAnalysisResult): number | null {
  const td = row.telemetry_data;
  if (!td || typeof td !== "object") return null;
  const o = td as Record<string, unknown>;
  const vtr = o.vibration_trend_record as Record<string, unknown> | undefined;
  const r = Number(o.rpm ?? o.running_speed_rpm ?? (vtr ? vtr.rpm : null));
  return Number.isFinite(r) && r > 0 ? r : null;
}

function overallMmS(row: SavedAnalysisResult): number | null {
  const rec = extractVibrationRecordFromAnalysis(row);
  if (rec?.broadband && typeof rec.broadband.overallVelocity === "number" && Number.isFinite(rec.broadband.overallVelocity) && rec.broadband.overallVelocity > 0)
    return Number(rec.broadband.overallVelocity);
  const td = row.telemetry_data;
  if (td && typeof td === "object") { const v = (td as Record<string, unknown>).overallVelocity; if (typeof v === "number" && Number.isFinite(v) && v > 0) return v; }
  return null;
}

const ISO_ZONES = [{ zone: "A", label: "Good", to: 2.3 }, { zone: "B", label: "Acceptable", to: 4.5 }, { zone: "C", label: "Unsatisfactory", to: 7.1 }, { zone: "D", label: "Unacceptable", to: Infinity }] as const;

function zoneFor(rms: number | null, health: number | null): string {
  if (rms != null && Number.isFinite(rms) && rms >= 0) return ISO_ZONES.find((z) => rms < z.to)!.zone;
  if (health != null && Number.isFinite(health)) { if (health >= 85) return "A"; if (health >= 70) return "B"; if (health >= 50) return "C"; return "D"; }
  return "—";
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length === 0) return <span className="text-[10px] text-slate-500">—</span>;
  const W = 100, H = 20, PAD = 1;
  if (points.length === 1) {
    const y = H / 2;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-16 h-4" preserveAspectRatio="none">
        <circle cx={W / 2} cy={y} r="2" fill={color} />
      </svg>
    );
  }
  const mn = Math.min(...points), mx = Math.max(...points);
  const range = mx - mn || 1;
  const coords = points.map((v, i) => {
    const x = PAD + (i / (points.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((v - mn) / range) * (H - PAD * 2);
    return `${x},${y}`;
  }).join(" ");
  const last = points[points.length - 1];
  const lastX = W - PAD;
  const lastY = H - PAD - ((last - mn) / range) * (H - PAD * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-16 h-4" preserveAspectRatio="none">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r="1.5" fill={color} />
    </svg>
  );
}

export default function VibrationComparisonTab({ isActive, selectedAnalysis, loadedAnalyses }: VibrationComparisonTabProps) {
  const [selA, setSelA] = useState<string | null>(null);
  const [selB, setSelB] = useState<string | null>(null);
  const [normalize, setNormalize] = useState(false);
  const [showMoreFaults, setShowMoreFaults] = useState(false);
  const [showMoreAppeared, setShowMoreAppeared] = useState(false);
  const [showMoreGrew, setShowMoreGrew] = useState(false);
  const [showMoreSettled, setShowMoreSettled] = useState(false);

  const asset = selectedAnalysis?.asset_id ?? null;
  const component = selectedAnalysis?.component ?? null;
  const vibrationRuns = useMemo(() => loadedAnalyses
    .filter((r) => (r.analysis_type ?? "vibration") === "vibration" && r.asset_id === asset && (!component || r.component === component))
    .sort((x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime()), [loadedAnalyses, asset, component]);

  useEffect(() => {
    if (!isActive || !selectedAnalysis) return;
    const aDate = selectedAnalysis.timestamp.slice(0, 10);
    const prev = [...vibrationRuns].reverse().find((r) => r.id !== selectedAnalysis.id && r.timestamp.slice(0, 10) !== aDate);
    setSelA(selectedAnalysis.id);
    setSelB(selB == null || !vibrationRuns.some((r) => r.id === selB) ? (prev?.id ?? null) : selB);
  }, [isActive, selectedAnalysis?.id, vibrationRuns]);

  /* ── S2: Fault Track Board ── */
  const faultHistory = useMemo(() => buildFaultHistory(vibrationRuns), [vibrationRuns]);
  const topFaults = faultHistory.slice(0, 4);
  const moreFaults = faultHistory.slice(4);

  /* ── S3: Spectral Diff ── */
  const runA = selA ? vibrationRuns.find((r) => r.id === selA) ?? null : null;
  const runB = selB ? vibrationRuns.find((r) => r.id === selB) ?? null : null;
  const peaksA = useMemo(() => runA ? extractTruePeaks(parsePeaks(runA)) : [], [runA]);
  const peaksB = useMemo(() => runB ? extractTruePeaks(parsePeaks(runB)) : [], [runB]);
  const orderMode = runA != null && runB != null && rowRpm(runA) != null && rowRpm(runB) != null;
  const diff: DiffResult = useMemo(() => diffSpectra(peaksA, peaksB), [peaksA, peaksB]);

  const stemData = useMemo(() => {
    const map = new Map<number, { frequency: number; a?: number; b?: number }>();
    for (const p of peaksA) { const f = Math.round(p.frequency * 10) / 10; map.set(f, { frequency: f, a: p.amplitude }); }
    for (const p of peaksB) { const f = Math.round(p.frequency * 10) / 10; const e = map.get(f) ?? { frequency: f }; e.b = p.amplitude; map.set(f, e); }
    return [...map.values()].sort((x, y) => x.frequency - y.frequency);
  }, [peaksA, peaksB]);

  const stemYMax = useMemo(() => Math.max(...stemData.map((r) => Math.max(r.a ?? 0, r.b ?? 0)), 0.001) * 1.15, [stemData]);

  const unit = "mm/s";
  const dateFmt = (ts: string) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const dateFmtShort = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  /* ── S4: Audit strip zone history ── */
  const zoneHistory = useMemo(() => vibrationRuns.map((r) => ({ id: r.id, ts: r.timestamp, zone: zoneFor(overallMmS(r), r.health_score) })), [vibrationRuns]);

  const zoneColor = (z: string) => z === "D" ? "bg-red-500" : z === "C" ? "bg-amber-500" : z === "B" ? "bg-sky-500" : z === "A" ? "bg-emerald-500" : "bg-slate-600";

  if (!isActive) return null;

  return (
    <div className="space-y-4 p-4">
      {/* ═══ S2: FAULT TRACK BOARD ═══ */}
      <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3 space-y-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Fault Track Board</div>
        {!selectedAnalysis ? (
          <p className="text-xs text-slate-400 italic">Open a report to see fault evolution.</p>
        ) : faultHistory.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No faults with tracked frequencies across runs.</p>
        ) : (
          <div className="space-y-2">
            {topFaults.map((fh) => {
              const latestZone = (() => {
                const lastRun = vibrationRuns.find((r) => fh.series.some((s) => s.runId === r.id));
                return lastRun ? zoneFor(overallMmS(lastRun), lastRun.health_score) : "—";
              })();
              return (
                <div key={fh.title} className="flex items-center gap-3 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-300 truncate">{fh.title} <span className="text-slate-500">({fh.frequencyHz?.toFixed(1)} Hz)</span></p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Sparkline points={fh.series.map((s) => s.amplitude)} color={fh.delta > 0.005 ? "#f87171" : fh.delta < -0.005 ? "#34d399" : "#94a3b8"} />
                      <span className="text-[10px] text-slate-500">
                        <span className="font-mono text-white">{fh.series[0]?.amplitude.toFixed(2) ?? "—"}</span>
                        {" → "}
                        <span className="font-mono text-white">{fh.series[fh.series.length - 1]?.amplitude.toFixed(2) ?? "—"}</span>
                        <span className={`ml-1 ${fh.delta > 0.005 ? "text-red-400" : fh.delta < -0.005 ? "text-emerald-400" : "text-slate-500"}`}>
                          (Δ {fh.delta >= 0 ? "+" : ""}{fh.delta.toFixed(2)})
                        </span>
                        <span className="text-slate-600 ml-1 text-[9px]">(amplitude while diagnosed – {fh.series.length} run{fh.series.length !== 1 ? "s" : ""})</span>
                      </span>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${latestZone === "D" ? "border-red-500/40 text-red-400" : latestZone === "C" ? "border-amber-500/40 text-amber-400" : latestZone === "B" ? "border-sky-500/40 text-sky-400" : latestZone === "A" ? "border-emerald-500/40 text-emerald-400" : "border-slate-600 text-slate-400"}`}>{latestZone === "—" ? "—" : `Zone ${latestZone}`}</span>
                </div>
              );
            })}
            {moreFaults.length > 0 && (
              <button onClick={() => setShowMoreFaults((v) => !v)} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
                {showMoreFaults ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                +{moreFaults.length} more fault{moreFaults.length > 1 ? "s" : ""}
              </button>
            )}
            {showMoreFaults && moreFaults.map((fh) => (
              <div key={fh.title} className="flex items-center gap-3 text-xs pl-4">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-400 truncate">{fh.title} <span className="text-slate-500">({fh.frequencyHz?.toFixed(1)} Hz)</span></p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Sparkline points={fh.series.map((s) => s.amplitude)} color={fh.delta > 0.005 ? "#f87171" : fh.delta < -0.005 ? "#34d399" : "#94a3b8"} />
                    <span className="text-[10px] text-slate-500">
                      Δ <span className={`font-mono ${fh.delta > 0.005 ? "text-red-400" : fh.delta < -0.005 ? "text-emerald-400" : "text-slate-500"}`}>{fh.delta >= 0 ? "+" : ""}{fh.delta.toFixed(2)}</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[9px] text-slate-600 border-t border-slate-800 pt-2">
          Zone provenance: ISO 10816 velocity bands — A {"<"} 2.3, B {"<"} 4.5, C {"<"} 7.1, D ≥ 7.1 mm/s RMS (health-score fallback when overall velocity is absent).
        </p>
      </div>

      {/* ═══ S3: SPECTRAL DIFF ═══ */}
      <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3 space-y-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Spectral Diff</div>
        {!selectedAnalysis ? (
          <p className="text-xs text-slate-400 italic">Open a report to compare two stored runs.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">Run A</span>
              <select value={selA ?? ""} onChange={(e) => setSelA(e.target.value || null)} className="h-7 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/60">
                <option value="">Select…</option>
                {vibrationRuns.map((r) => <option key={r.id} value={r.id}>{dateFmtShort(r.timestamp)}</option>)}
              </select>
              <span className="text-slate-500">Run B</span>
              <select value={selB ?? ""} onChange={(e) => setSelB(e.target.value || null)} className="h-7 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/60">
                <option value="">Select…</option>
                {vibrationRuns.map((r) => <option key={r.id} value={r.id}>{dateFmtShort(r.timestamp)}</option>)}
              </select>
              <label className="flex items-center gap-1.5 cursor-pointer ml-2">
                <input type="checkbox" checked={normalize} onChange={() => setNormalize((v) => !v)} className="h-3.5 w-3.5 rounded border-slate-700 focus:ring-cyan-500" />
                <span className="text-[10px] text-slate-400">normalize shapes</span>
              </label>
            </div>

            {runA == null || runB == null ? (
              <p className="text-xs text-slate-400 italic">Select two distinct runs to compare.</p>
            ) : runA.id === runB.id ? (
              <p className="text-xs text-slate-400 italic">Select two distinct runs.</p>
            ) : (
              <>
                <p className="text-[10px] text-slate-500">{orderMode ? "matched by order +/-2% (stored RPM)" : "matched by frequency, max(2 Hz, 2%) — RPM not recorded"}</p>

                {stemData.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No stored peaks for {dateFmt(runA.timestamp)} or {dateFmt(runB.timestamp)}.</p>
                ) : normalize ? (
                  <p className="text-[10px] text-amber-400/80 italic">Shape view — each series scaled to its own maximum; do not compare amplitudes across series.</p>
                ) : (
                  <div className="h-[200px] bg-slate-950/80 rounded-lg border border-slate-800">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={stemData} margin={{ top: 8, right: 12, bottom: 24, left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis type="number" dataKey="frequency" domain={[0, "dataMax"]} stroke="#94a3b8" tick={{ fontSize: 9 }} tickFormatter={(v) => String(Math.round(Number(v)))} label={{ value: "Hz", position: "insideBottom", offset: -8, fill: "#64748b", fontSize: 10 }} />
                        <YAxis stroke="#38bdf8" tick={{ fontSize: 9 }} domain={[0, stemYMax]} label={{ value: unit, angle: -90, position: "insideLeft", fill: "#38bdf8", fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} formatter={(value: number, name: string) => [`${Number(value).toFixed(3)} ${unit}`, name === "a" ? `A (${dateFmt(runA.timestamp)})` : `B (${dateFmt(runB.timestamp)})`]} labelFormatter={(l) => `${l} Hz`} />
                        <Bar dataKey="a" fill="#38bdf8" fillOpacity={0.5} barSize={3} isAnimationActive={false} name="A" />
                        <Bar dataKey="b" fill="#f472b6" fillOpacity={0.5} barSize={3} isAnimationActive={false} name="B" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {(diff.appeared.length > 0 || diff.grew.length > 0 || diff.settled.length > 0) && (
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div>
                      <span className="font-semibold text-emerald-400 uppercase">Appeared</span>
                      <span className="ml-1 text-slate-500">({diff.appeared.length})</span>
                      {diff.appeared.length === 0 ? (
                        <p className="text-slate-500 mt-0.5">none</p>
                      ) : (
                        <ul className="mt-0.5 space-y-0.5">
                          {diff.appeared.slice(0, showMoreAppeared ? diff.appeared.length : 6).map((d, i) => (
                            <li key={`${d.a.frequency}-${i}`} className="text-slate-300">
                              <span className="font-mono">{d.a.frequency.toFixed(1)}</span> Hz · <span className="font-mono">{d.a.amplitude.toFixed(3)}</span> {unit}
                            </li>
                          ))}
                        </ul>
                      )}
                      {diff.appeared.length > 6 && (
                        <button onClick={() => setShowMoreAppeared((v) => !v)} className="text-slate-500 hover:text-slate-300 mt-0.5">
                          {showMoreAppeared ? "show less" : `+${diff.appeared.length - 6} more`}
                        </button>
                      )}
                    </div>

                    <div>
                      <span className="font-semibold text-red-400 uppercase">Grew</span>
                      <span className="ml-1 text-slate-500">({diff.grew.length})</span>
                      {diff.grew.length === 0 ? (
                        <p className="text-slate-500 mt-0.5">none</p>
                      ) : (
                        <ul className="mt-0.5 space-y-0.5">
                          {diff.grew.slice(0, showMoreGrew ? diff.grew.length : 6).map((d, i) => (
                            <li key={`${d.a.frequency}-${i}`} className="text-slate-300">
                              <span className="font-mono">{d.a.frequency.toFixed(1)}</span> Hz · <span className="font-mono text-red-400">+{((d.b!.amplitude - d.a.amplitude) / d.a.amplitude * 100).toFixed(0)}%</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {diff.grew.length > 6 && (
                        <button onClick={() => setShowMoreGrew((v) => !v)} className="text-slate-500 hover:text-slate-300 mt-0.5">
                          {showMoreGrew ? "show less" : `+${diff.grew.length - 6} more`}
                        </button>
                      )}
                    </div>

                    <div>
                      <span className="font-semibold text-sky-400 uppercase">Settled</span>
                      <span className="ml-1 text-slate-500">({diff.settled.length})</span>
                      {diff.settled.length === 0 ? (
                        <p className="text-slate-500 mt-0.5">none</p>
                      ) : (
                        <ul className="mt-0.5 space-y-0.5">
                          {diff.settled.slice(0, showMoreSettled ? diff.settled.length : 6).map((d, i) => (
                            <li key={`${d.a.frequency}-${i}`} className="text-slate-300">
                              <span className="font-mono">{d.a.frequency.toFixed(1)}</span> Hz · <span className="font-mono text-sky-400">{((d.b!.amplitude - d.a.amplitude) / d.a.amplitude * 100).toFixed(0)}%</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {diff.settled.length > 6 && (
                        <button onClick={() => setShowMoreSettled((v) => !v)} className="text-slate-500 hover:text-slate-300 mt-0.5">
                          {showMoreSettled ? "show less" : `+${diff.settled.length - 6} more`}
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {diff.appeared.length === 0 && diff.grew.length === 0 && diff.settled.length === 0 && (
                  <p className="text-xs text-slate-400 italic">All matched peaks within ±25% — no significant changes.</p>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ═══ S4: AUDIT STRIP ═══ */}
      <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3 space-y-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Audit Strip</div>
        {zoneHistory.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No stored vibration runs.</p>
        ) : (
          <>
            <div className="flex items-center gap-0.5 flex-wrap">
              {zoneHistory.map((zh) => (
                <div key={zh.id} className="flex flex-col items-center">
                  <div className={`w-2 h-2 rounded-full ${zoneColor(zh.zone)}`} title={`${dateFmt(zh.ts)} — Zone ${zh.zone}`} />
                  <span className="text-[7px] text-slate-600 leading-none mt-0.5">{dateFmt(zh.ts).split(",")[0]}</span>
                </div>
              ))}
            </div>

            {selectedAnalysis && (() => {
              const firstZone = zoneHistory[0]?.zone ?? "—";
              const lastZone = zoneHistory[zoneHistory.length - 1]?.zone ?? "—";
              const firstFault = faultHistory[0];
              const firstAppear = firstFault?.series[0];
              const vanished = faultHistory.filter((f) => f.series.length < vibrationRuns.length);
              const runsLackingZone = vibrationRuns.length - zoneHistory.length;
              return (
                <p className="text-[11px] text-slate-400">
                  Zone <span className="font-bold">{firstZone}</span> → <span className="font-bold">{lastZone}</span> over {vibrationRuns.length} runs
                  {runsLackingZone > 0 && <span className="text-slate-500"> ({runsLackingZone} run{runsLackingZone > 1 ? "s" : ""} lack zone data)</span>}
                  {firstAppear && <span> · {firstFault.title} first appeared {dateFmt(firstAppear.ts)}</span>}
                  {vanished.length > 0 && <span> · {vanished.length} fault{vanished.length > 1 ? "s" : ""} absent in some runs</span>}
                </p>
              );
            })()}

            {faultHistory.filter((f) => f.series.length < vibrationRuns.length).slice(0, 3).map((fh) => {
              const firstDate = fh.series.length ? dateFmt(fh.series[0].ts) : "—";
              const lastDate = fh.series.length ? dateFmt(fh.series[fh.series.length - 1].ts) : "—";
              const absentCount = vibrationRuns.length - fh.series.length;
              return (
                <p key={fh.title} className="text-[10px] text-slate-500">
                  <span className="text-slate-400">{fh.title}</span>: first seen {firstDate}, last seen {lastDate} · absent in {absentCount} run{absentCount > 1 ? "s" : ""}
                </p>
              );
            })}
          </>
        )}
        <p className="text-[9px] text-slate-600 border-t border-slate-800 pt-2">
          Zone provenance: ISO 10816 velocity bands — A {"<"} 2.3, B {"<"} 4.5, C {"<"} 7.1, D ≥ 7.1 mm/s RMS (health-score fallback when overall velocity is absent).
        </p>
      </div>
    </div>
  );
}
