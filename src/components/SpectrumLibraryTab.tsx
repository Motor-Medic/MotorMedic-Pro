import React, { useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { FileText, Info, LineChart } from "lucide-react";
import type { SavedAnalysisResult } from "../lib/analysisPersistence";
import type {
  VibrationDiagnosticRecord,
  VibrationTrendPoint
} from "../lib/vibration/vibrationDiagnosticRecord";

const selectInputClass =
  "w-full min-h-[38px] rounded-lg bg-slate-950/70 border border-slate-600 px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500 transition-colors";

export interface SpectrumLibraryTabProps {
  selectedAnalysis: SavedAnalysisResult | null;
  peakList: { frequency: number; amplitude: number }[];
  fullPts: VibrationTrendPoint[];
  mode: "stems" | "curve" | "empty";
  baselineSpectrum: VibrationTrendPoint[];
  reportVibrationRecord: VibrationDiagnosticRecord | null;
}

/**
 * Tab 2 "Spectrum Library" view — extracted from AnalysisReport's shared
 * spectral workspace. Fully self-contained: owns its own control state
 * (rpm / unit / domain / baseline overlay / bearing / baseline / view mode)
 * and consumes only the derived spectral data props it needs to draw.
 */
export default function SpectrumLibraryTab({
  selectedAnalysis,
  peakList,
  fullPts,
  mode,
  baselineSpectrum,
  reportVibrationRecord
}: SpectrumLibraryTabProps) {
  const [rpm, setRpm] = useState(3530);
  const [unit, setUnit] = useState<"velocity" | "acceleration">("velocity");
  const [domain, setDomain] = useState<"fft" | "waveform">("fft");
  const [showBaseline, setShowBaseline] = useState(false);
  const [bearing, setBearing] = useState<"SKF 6210" | "NSK 6312" | "Custom">("SKF 6210");
  const [baseline, setBaseline] = useState<"Initial Commissioning" | "30-Day Average" | "None">("Initial Commissioning");
  const [viewMode, setViewMode] = useState<"2D Overlay" | "Historical Waterfall">("2D Overlay");
  const [harmonicZoom, setHarmonicZoom] = useState(true);
  const [showBearingCursors, setShowBearingCursors] = useState(true);

  const hasBaseline = baselineSpectrum.length > 0;
  const chartRows = mode === "curve" ? fullPts : peakList.map((p) => ({ frequency: p.frequency, amplitude: p.amplitude, baselineAmplitude: undefined as number | undefined, stemLabel: `${p.frequency.toFixed(1)}Hz` }));
  const unitShort = unit === "acceleration" ? "g" : "mm/s";
  const unitLabel = unit === "acceleration" ? "Acceleration (g)" : "Velocity (mm/s)";
  const toUnitAmp = (freq: number, amp: number) =>
    unit === "acceleration" ? (amp * 2 * Math.PI * freq) / 9806.65 : amp;
  const displayRows = chartRows.map((r) => ({
    ...r,
    amplitude: toUnitAmp(r.frequency, r.amplitude),
    baselineAmplitude:
      r.baselineAmplitude != null ? toUnitAmp(r.frequency, r.baselineAmplitude) : undefined
  }));
  const waveformRows = reportVibrationRecord?.waveform ?? [];
  const rpmHz = rpm / 60;

  // Bearing geometry catalog
  const BEARING_GEOMETRY: Record<string, { n: number; bd: number; pd: number; angle: number }> = {
    "SKF 6210": { n: 9, bd: 12.7, pd: 70.0, angle: 0 },
    "NSK 6312": { n: 8, bd: 22.225, pd: 95.0, angle: 0 },
  };

  // Bearing fault characteristic orders (ISO 15242)
  const bearingHz = (() => {
    const geo = BEARING_GEOMETRY[bearing];
    if (!geo) return null;
    const r = (geo.bd / geo.pd) * Math.cos((geo.angle * Math.PI) / 180);
    const bpfoOrder = (geo.n / 2) * (1 - r);
    const bpfiOrder = (geo.n / 2) * (1 + r);
    const bsfOrder = (geo.pd / (2 * geo.bd)) * (1 - r * r);
    const ftfOrder = 0.5 * (1 - r);
    const hz = (order: number) => order * rpmHz;
    return {
      BPFO: { order: bpfoOrder, hz: hz(bpfoOrder) },
      BPFI: { order: bpfiOrder, hz: hz(bpfiOrder) },
      BSF:  { order: bsfOrder,  hz: hz(bsfOrder) },
      FTF:  { order: ftfOrder,  hz: hz(ftfOrder) },
    };
  })();

  const activeCursorHz = [rpmHz, rpmHz * 2, rpmHz * 3, rpmHz * 4];
  if (showBearingCursors && bearingHz) {
    activeCursorHz.push(bearingHz.FTF.hz, bearingHz.BSF.hz, bearingHz.BPFO.hz, bearingHz.BPFI.hz);
  }
  const highestActiveCursorHz = activeCursorHz.length > 0 ? Math.max(...activeCursorHz) : rpmHz * 4;
  const maxDataPeakHz = chartRows.length ? Math.max(...chartRows.map((r) => r.frequency)) : 0;
  const xDomainMax = harmonicZoom
    ? highestActiveCursorHz * 1.15
    : Math.max(highestActiveCursorHz, maxDataPeakHz) * 1.15;
  // Count peaks whose frequency exceeds the zoomed domain
  const peaksOutsideZoom = peakList.filter((p) => p.frequency > highestActiveCursorHz).length;
  const topPeaks = [...displayRows]
    .sort((a, b) => b.amplitude - a.amplitude)
    .slice(0, 5)
    .sort((a, b) => a.frequency - b.frequency)
    .map((p) => ({
      ...p,
      harmonicOrder: rpmHz > 0 ? p.frequency / rpmHz : 0,
      delta:
        p.baselineAmplitude != null && p.baselineAmplitude > 1e-6
          ? ((p.amplitude - p.baselineAmplitude) / p.baselineAmplitude) * 100
          : null,
    }));

  return (
    <div className="space-y-4">
      {/* -- Tab 2 structural shell: control bar -- */}
      <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 space-y-3">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Spectrum Library Controls</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <label className="block min-w-0">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest block mb-1">Bearing</span>
            <select
              value={bearing}
              onChange={(e) => setBearing(e.target.value as typeof bearing)}
              className={selectInputClass}
            >
              <option value="SKF 6210">SKF 6210</option>
              <option value="NSK 6312">NSK 6312</option>
              <option value="Custom">Custom</option>
            </select>
          </label>
          <label className="block min-w-0">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest block mb-1">Baseline</span>
            <select
              value={baseline}
              onChange={(e) => setBaseline(e.target.value as typeof baseline)}
              className={selectInputClass}
            >
              <option value="Initial Commissioning">Initial Commissioning</option>
              <option value="30-Day Average">30-Day Average</option>
              <option value="None">None</option>
            </select>
          </label>
          <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-1">
            <button type="button" onClick={() => setViewMode("2D Overlay")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${viewMode === "2D Overlay" ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:text-slate-200"}`}>2D Overlay</button>
            <button type="button" onClick={() => setViewMode("Historical Waterfall")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${viewMode === "Historical Waterfall" ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:text-slate-200"}`}>Historical Waterfall</button>
          </div>
        </div>
      </div>

      {selectedAnalysis == null || mode === "empty" ? (
        <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Spectrum Library workspace</h4>
          <div className="h-[300px] bg-slate-950 rounded-xl border border-slate-700/80 p-3 flex items-center justify-center text-center">
            <p className="text-slate-500 text-sm max-w-md">No report loaded - select and click Load Report, or pick a Saved Analysis</p>
          </div>
        </div>
      ) : (
        <>
          {/* -- Baseline badge -- */}
          {showBaseline && !hasBaseline && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-300 flex items-center gap-2">
              <Info className="h-3.5 w-3.5 shrink-0" />
              No stored baseline signature available for comparison
            </div>
          )}
          {showBaseline && hasBaseline && (
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 px-4 py-2.5 text-xs text-sky-300 flex items-center gap-2">
              <LineChart className="h-3.5 w-3.5 shrink-0" />
              Baseline overlay active — dashed trace comparison against saved baseline record
            </div>
          )}

          {/* -- Reference RPM slider -- */}
          <div className="flex items-center gap-4 p-4 bg-slate-900/60 border border-slate-700/80 rounded-xl">
            <span className="text-sm font-semibold text-slate-300 shrink-0">Reference RPM:</span>
            <input
              type="range"
              min={600}
              max={3600}
              step={10}
              value={rpm}
              onChange={(e) => setRpm(Number(e.target.value))}
              className="flex-1 accent-cyan-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-cyan-400 font-mono font-bold w-20 text-right tabular-nums">{rpm} RPM</span>
          </div>
          {/* -- Harmonic Zoom toggle -- */}
          <div className="flex items-center gap-2">
            <label>
              <input
                type="radio"
                name="zoom-mode"
                checked={harmonicZoom}
                onChange={() => setHarmonicZoom(true)}
                className="h-4 w-4 rounded border-slate-700 focus:ring-cyan-500"
              />
              <span className="text-sm text-slate-300">Harmonic Zoom</span>
            </label>
            <label>
              <input
                type="radio"
                name="zoom-mode"
                checked={!harmonicZoom}
                onChange={() => setHarmonicZoom(false)}
                className="h-4 w-4 rounded border-slate-700 focus:ring-cyan-500"
              />
              <span className="text-sm text-slate-300">Full Range</span>
            </label>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showBearingCursors}
              onChange={() => setShowBearingCursors((v) => !v)}
              className="h-4 w-4 rounded border-slate-700 focus:ring-cyan-500"
            />
            <span className="text-sm text-slate-300">Bearing Cursors</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-1">
              <button type="button" onClick={() => setDomain("fft")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${domain === "fft" ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:text-slate-200"}`}>FFT Spectrum</button>
              <button type="button" onClick={() => setDomain("waveform")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${domain === "waveform" ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:text-slate-200"}`}>Time Waveform</button>
            </div>
            <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-1">
              <button type="button" onClick={() => setUnit("velocity")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${unit === "velocity" ? "bg-amber-500/20 text-amber-300" : "text-slate-400 hover:text-slate-200"}`}>Velocity (mm/s)</button>
              <button type="button" onClick={() => setUnit("acceleration")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${unit === "acceleration" ? "bg-amber-500/20 text-amber-300" : "text-slate-400 hover:text-slate-200"}`}>Acceleration (g)</button>
            </div>
            <button type="button" onClick={() => setShowBaseline((v) => !v)} className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${showBaseline ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200"}`}>Overlay Baseline</button>
          </div>
          <p className="text-[10px] text-slate-500 font-mono">
            1X = {rpmHz.toFixed(2)} Hz · 2X = {(rpmHz * 2).toFixed(2)} Hz · 3X = {(rpmHz * 3).toFixed(2)} Hz · 4X = {(rpmHz * 4).toFixed(2)} Hz
          </p>

          {/* -- Chart: FFT Spectrum or Time Waveform -- */}
          {domain === "waveform" ? (
            waveformRows.length > 0 ? (
              <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Time Waveform</h4>
                <div className="h-[380px] bg-slate-950 rounded-xl border border-slate-700/80 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={waveformRows} margin={{ top: 16, right: 16, bottom: 28, left: 48 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" dataKey="time" domain={[0, "dataMax"]} stroke="#94a3b8" tick={{ fontSize: 10 }} label={{ value: "Time (s)", position: "insideBottom", offset: -12, fill: "#64748b", fontSize: 11 }} />
                      <YAxis stroke="#38bdf8" tick={{ fontSize: 10 }} label={{ value: "Amplitude (mm/s)", angle: -90, position: "insideLeft", fill: "#38bdf8", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} formatter={(value) => [`${Number(value).toFixed(3)} mm/s`, "Amplitude"]} labelFormatter={(label) => `${label} s`} />
                      <Line type="monotone" dataKey="amplitude" stroke="#38bdf8" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Amplitude" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-16 px-4 bg-slate-900/60 border border-slate-700/80 rounded-xl">
                <FileText className="h-8 w-8 text-slate-600 mb-2" />
                <p className="text-sm font-semibold text-slate-300">No time waveform captured</p>
              </div>
            )
          ) : (
          <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">
              {unitLabel}
              {showBaseline && hasBaseline && <span className="ml-2 text-amber-400 normal-case tracking-normal">— dashed = baseline</span>}
            </h4>
            <div key={harmonicZoom ? "zoom" : "full"} className="h-[380px] bg-slate-950 rounded-xl border border-slate-700/80 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={displayRows}
                      margin={{ top: 28, right: 16, bottom: 28, left: 48 }}
                    >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    type="number"
                    dataKey="frequency"
                    domain={[0, xDomainMax]}
                    allowDataOverflow={true}
                    stroke="#94a3b8"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => String(Math.round(Number(v)))}
                    label={{ value: "Frequency (Hz)", position: "insideBottom", offset: -12, fill: "#64748b", fontSize: 11 }}
                  />
                  <YAxis
                    stroke="#38bdf8"
                    tick={{ fontSize: 10 }}
                    label={{ value: `Amplitude (${unitShort})`, angle: -90, position: "insideLeft", fill: "#38bdf8", fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                    formatter={(value, name) => {
                      const val = Number(value);
                      const label = name === "baselineAmplitude" ? "Baseline" : "Amplitude";
                      return [`${val.toFixed(unit === "acceleration" ? 6 : 3)} ${unitShort}`, label];
                    }}
                    labelFormatter={(label) => `${label} Hz`}
                  />
                  {/* Harmonic cursors 1X–4X */}
                  <ReferenceLine x={rpmHz} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: "1X", fill: "#f59e0b", position: "top", fontSize: 11, fontWeight: 700 }} />
                  <ReferenceLine x={rpmHz * 2} stroke="#38bdf8" strokeDasharray="6 3" label={{ value: "2X", fill: "#38bdf8", position: "top", fontSize: 11, fontWeight: 700 }} />
                  <ReferenceLine x={rpmHz * 3} stroke="#a855f7" strokeDasharray="6 3" label={{ value: "3X", fill: "#a855f7", position: "top", fontSize: 11, fontWeight: 700 }} />
                  <ReferenceLine x={rpmHz * 4} stroke="#ef4444" strokeDasharray="6 3" label={{ value: "4X", fill: "#ef4444", position: "top", fontSize: 11, fontWeight: 700 }} />
                  {/* Bearing fault cursors */}
                  {showBearingCursors && bearingHz && (
                    <>
                      <ReferenceLine x={bearingHz.FTF.hz} stroke="#fbbf24" strokeDasharray="4 4" label={{ value: `FTF ${bearingHz.FTF.hz.toFixed(1)} Hz`, fill: "#fbbf24", position: "top", fontSize: 10 }} />
                      <ReferenceLine x={bearingHz.BSF.hz} stroke="#34d399" strokeDasharray="4 4" label={{ value: `BSF ${bearingHz.BSF.hz.toFixed(1)} Hz`, fill: "#34d399", position: "top", fontSize: 10 }} />
                      <ReferenceLine x={bearingHz.BPFO.hz} stroke="#a78bfa" strokeDasharray="4 4" label={{ value: `BPFO ${bearingHz.BPFO.hz.toFixed(1)} Hz`, fill: "#a78bfa", position: "top", fontSize: 10 }} />
                      <ReferenceLine x={bearingHz.BPFI.hz} stroke="#f472b6" strokeDasharray="4 4" label={{ value: `BPFI ${bearingHz.BPFI.hz.toFixed(1)} Hz`, fill: "#f472b6", position: "top", fontSize: 10 }} />
                    </>
                  )}
                  {/* Baseline trace (dashed, semi-transparent) */}
                  {showBaseline && hasBaseline && (
                    <Area
                      type="monotone"
                      dataKey="baselineAmplitude"
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      strokeDasharray="5 5"
                      fill="#94a3b8"
                      fillOpacity={0.06}
                      isAnimationActive={false}
                      name="Baseline"
                      connectNulls={false}
                    />
                  )}
                  {/* Full spectrum — continuous curve */}
                  {mode === "curve" && (
                    <Area
                      type="monotone"
                      dataKey="amplitude"
                      stroke="#38bdf8"
                      fill="#38bdf8"
                      fillOpacity={0.15}
                      isAnimationActive={false}
                      name="Amplitude"
                    />
                  )}
                  {/* Stored peaks only — thin vertical stems */}
                  {mode === "stems" && (
                    <Bar dataKey="amplitude" name="Stored Peak" barSize={3} fill="#38bdf8" isAnimationActive={false}>
                      <LabelList dataKey="stemLabel" position="top" fill="#94a3b8" fontSize={9} />
                    </Bar>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {harmonicZoom && peaksOutsideZoom > 0 && (
              <p className="text-[10px] text-slate-500 mt-2 px-1 font-mono">
                {peaksOutsideZoom} peaks exist outside zoomed range - switch to Full Range to view.
              </p>
            )}
            {mode === "stems" && (
              <p className="text-[10px] text-slate-500 mt-2 px-1 font-mono">{peakList.length} stored peaks — full spectrum not captured</p>
            )}
          </div>
          )}

          {/* -- Peak Analysis table with Delta column -- */}
          <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-cyan-300">Peak Analysis</h4>
              <span className="text-[10px] text-slate-500 font-mono">Top 5 amplitude peaks · order = f / 1X</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 text-left text-[10px] uppercase tracking-widest">
                    <th className="px-4 py-2.5 font-bold">Freq (Hz)</th>
                    <th className="px-4 py-2.5 font-bold">Amplitude ({unitShort})</th>
                    <th className="px-4 py-2.5 font-bold">Order</th>
                    {showBaseline && hasBaseline && <th className="px-4 py-2.5 font-bold">Baseline</th>}
                    {showBaseline && hasBaseline && <th className="px-4 py-2.5 font-bold">Delta vs Baseline</th>}
                    <th className="px-4 py-2.5 font-bold">Diagnosis</th>
                  </tr>
                </thead>
                <tbody>
                  {topPeaks.map((peak, i) => (
                    <tr key={`${peak.frequency}-${i}`} className="border-t border-slate-700/80">
                      <td className="px-4 py-3 text-cyan-300 font-mono">{peak.frequency.toFixed(2)}</td>
                      <td className="px-4 py-3 text-emerald-400 font-mono">{unit === "acceleration" ? peak.amplitude.toExponential(3) : peak.amplitude.toFixed(3)}</td>
                      <td className="px-4 py-3 text-yellow-400 font-mono font-semibold">{peak.harmonicOrder.toFixed(2)}×</td>
                      {showBaseline && hasBaseline && (
                        <td className="px-4 py-3 text-slate-400 font-mono">
                          {peak.baselineAmplitude != null ? (unit === "acceleration" ? peak.baselineAmplitude.toExponential(3) : peak.baselineAmplitude.toFixed(3)) : "—"}
                        </td>
                      )}
                      {showBaseline && hasBaseline && (
                        <td className="px-4 py-3 font-mono font-semibold">
                          {peak.delta != null ? (
                            <span className={peak.delta <= 0 ? "text-emerald-400" : "text-red-400"}>
                              {peak.delta > 0 ? "+" : ""}{peak.delta.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-600">n/a</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-slate-200 font-medium">
                        {peak.harmonicOrder >= 0.9 && peak.harmonicOrder <= 1.1 && "Mass Unbalance"}
                        {peak.harmonicOrder >= 1.9 && peak.harmonicOrder <= 2.1 && "Angular Misalignment"}
                        {peak.harmonicOrder >= 2.9 && peak.harmonicOrder <= 3.1 && "Mechanical Looseness"}
                        {(peak.harmonicOrder < 0.9 || (peak.harmonicOrder > 1.1 && peak.harmonicOrder < 1.9) || (peak.harmonicOrder > 2.1 && peak.harmonicOrder < 2.9) || (peak.harmonicOrder > 3.1)) && "Bearing Fault / Other"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
