import React, { useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { SavedAnalysisResult } from "../lib/analysisPersistence";
import type {
  VibrationDiagnosticRecord,
  VibrationTrendPoint
} from "../lib/vibration/vibrationDiagnosticRecord";

// Downsample by MAX-per-bucket (never first/mean) so bump heights and
// positions survive (the max point keeps its own frequency).
function downsampleMax(
  pts: { frequency: number; amplitude: number }[],
  bucket = 3
): { frequency: number; amplitude: number }[] {
  const out: { frequency: number; amplitude: number }[] = [];
  for (let i = 0; i < pts.length; i += bucket) {
    const slice = pts.slice(i, i + bucket);
    if (!slice.length) continue;
    out.push(slice.reduce((m, p) => (p.amplitude > m.amplitude ? p : m), slice[0]));
  }
  return out;
}

export interface SpectrumLibraryTabProps {
  selectedAnalysis: SavedAnalysisResult | null;
  peakList: { frequency: number; amplitude: number }[];
  fullPts: VibrationTrendPoint[];
  mode: "stems" | "curve" | "empty";
  baselineSpectrum: VibrationTrendPoint[];
  reportVibrationRecord: VibrationDiagnosticRecord | null;
  allAnalyses?: SavedAnalysisResult[];
}

/**
 * Tab 2 "Spectrum Library" view — extracted from AnalysisReport's shared
 * spectral workspace. Fully self-contained: derives RPM and bearing geometry
 * from the loaded row data and asset profile; the only visible control is the
 * "Bearing harmonics & sidebands" checkbox.
 */
export default function SpectrumLibraryTab({
  selectedAnalysis,
  peakList,
  fullPts,
  mode,
  baselineSpectrum,
  reportVibrationRecord,
  allAnalyses = []
}: SpectrumLibraryTabProps) {
  const [showBearingHarmonics, setShowBearingHarmonics] = useState(false);
  const [manualRefRpm, setManualRefRpm] = useState(3530);

  // Extract peaks from a SavedAnalysisResult into canonical {frequency, amplitude}[]
  const extractPeaks = (row: SavedAnalysisResult): { frequency: number; amplitude: number }[] => {
    const raw = row.peaks;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((p) => ({
        frequency: Number(p.frequencyHz ?? p.frequency_hz ?? p.freqHz ?? p.freq_hz ?? p.frequency ?? p.freq ?? p.hz ?? p.count),
        amplitude: Number(p.amplitude ?? p.amp ?? p.value),
      }))
      .filter((p) => Number.isFinite(p.frequency) && p.frequency > 0 && Number.isFinite(p.amplitude) && p.amplitude > 0);
  };

  // Extract a full telemetry_data.spectral trace from a SavedAnalysisResult.
  const extractSpectral = (row: SavedAnalysisResult): { frequency: number; amplitude: number }[] => {
    const td = row.telemetry_data;
    if (!td || typeof td !== "object") return [];
    const s = (td as Record<string, unknown>).spectral;
    if (!Array.isArray(s)) return [];
    return s
      .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
      .map((p) => ({ frequency: Number(p.frequency ?? p.f), amplitude: Number(p.amplitude ?? p.a) }))
      .filter((p) => Number.isFinite(p.frequency) && p.frequency >= 0 && Number.isFinite(p.amplitude) && p.amplitude >= 0);
  };

  const extractSpectralSource = (row: SavedAnalysisResult): string | null => {
    const td = row.telemetry_data;
    if (!td || typeof td !== "object") return null;
    const s = (td as Record<string, unknown>).spectral_source;
    return typeof s === "string" ? s : null;
  };

  const extractEnvelope = (row: SavedAnalysisResult): { frequency: number; amplitude: number }[] => {
    const td = row.telemetry_data;
    if (!td || typeof td !== "object") return [];
    const e = (td as Record<string, unknown>).envelope;
    if (!Array.isArray(e)) return [];
    return e
      .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
      .map((p) => ({ frequency: Number(p.frequency ?? p.f), amplitude: Number(p.amplitude ?? p.a) }))
      .filter((p) => Number.isFinite(p.frequency) && p.frequency >= 0 && Number.isFinite(p.amplitude) && p.amplitude >= 0);
  };

  const extractRowRpm = (row: SavedAnalysisResult): number | null => {
    const td = row.telemetry_data;
    if (!td || typeof td !== "object") return null;
    const o = td as Record<string, unknown>;
    const vtr = o.vibration_trend_record as Record<string, unknown> | undefined;
    const r = Number(o.rpm ?? o.running_speed_rpm ?? (vtr ? vtr.rpm : null));
    return Number.isFinite(r) && r > 0 ? r : null;
  };

  // ---- DERIVED DATA: RPM and bearing geometry from the row / asset ----

  // effectiveRpm: row.rpm ?? assetRpm ?? manualRefRpm
  const rowRpm = selectedAnalysis ? extractRowRpm(selectedAnalysis) : null;
  // Check if telemetry_data.context.motorSpeedRPM has a value (from vibration record)
  const contextRpm = (() => {
    const td = selectedAnalysis?.telemetry_data;
    if (!td || typeof td !== "object") return null;
    const ctx = (td as Record<string, unknown>).context;
    if (!ctx || typeof ctx !== "object") return null;
    const r = Number((ctx as Record<string, unknown>).motorSpeedRPM);
    return Number.isFinite(r) && r > 0 ? r : null;
  })();
  // Asset-level RPM: check telemetry_data.asset_rpm or component-level fields
  const assetRpm = (() => {
    const td = selectedAnalysis?.telemetry_data;
    if (!td || typeof td !== "object") return null;
    const o = td as Record<string, unknown>;
    const vtr = o.vibration_trend_record as Record<string, unknown> | undefined;
    const r = Number(o.asset_rpm ?? o.operating_rpm ?? o.nameplate_rpm ?? (vtr ? vtr.asset_rpm ?? vtr.operating_rpm : null));
    return Number.isFinite(r) && r > 0 ? r : null;
  })();
  const effectiveRpm = rowRpm ?? contextRpm ?? assetRpm ?? manualRefRpm;
  const rpmSource: "record" | "context" | "asset" | "manual" = rowRpm != null ? "record" : contextRpm != null ? "context" : assetRpm != null ? "asset" : "manual";
  const rpmHz = effectiveRpm / 60;
  const hasRpm = effectiveRpm != null;

  // geometry: asset bearing model if in BEARING_GEOMETRY, else "SKF 6210"
  const BEARING_GEOMETRY: Record<string, { n: number; bd: number; pd: number; angle: number }> = {
    "SKF 6210": { n: 9, bd: 12.7, pd: 70.0, angle: 0 },
    "NSK 6312": { n: 8, bd: 22.225, pd: 95.0, angle: 0 },
  };
  const extractBearingModel = (row: SavedAnalysisResult): string | null => {
    const td = row.telemetry_data;
    if (!td || typeof td !== "object") return null;
    const o = td as Record<string, unknown>;
    const vtr = o.vibration_trend_record as Record<string, unknown> | undefined;
    const model = o.bearing_model ?? o.bearing ?? (vtr ? vtr.bearing_model ?? vtr.bearing : null);
    return typeof model === "string" && model.trim() ? model.trim() : null;
  };
  const assetBearingModel = selectedAnalysis ? extractBearingModel(selectedAnalysis) : null;
  const geometryModel = assetBearingModel && BEARING_GEOMETRY[assetBearingModel] ? assetBearingModel : "SKF 6210";

  // Bearing fault characteristic orders (ISO 15242)
  const bearingHz = (() => {
    const geo = BEARING_GEOMETRY[geometryModel];
    if (!geo || !hasRpm) return null;
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

  // Waterfall data prep: filter to vibration, sort chronologically, take last 6
  const waterfallRuns = (() => {
    const vibrationRows = allAnalyses
      .filter((a) => a.analysis_type === "vibration")
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-6);
    return vibrationRows.map((row) => ({
      date: new Date(row.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      peaks: extractPeaks(row),
      spectral: extractSpectral(row),
      spectralSource: extractSpectralSource(row),
    }));
  })();

  // Shared waterfall domains + color ramp (kept across mini-chart strips)
  const waterfallMaxAmp = Math.max(...waterfallRuns.flatMap((r) => r.peaks.map((p) => p.amplitude)), 0.001);
  const waterfallMaxFreq = Math.max(...waterfallRuns.flatMap((r) => r.peaks.map((p) => p.frequency)), 1);
  const waterfallColors = ["#475569", "#64748b", "#94a3b8", "#22d3ee", "#06b6d4", "#0891b2"];

  const chartRows = mode === "curve"
    ? fullPts
    : peakList.map((p) => ({
        frequency: p.frequency,
        amplitude: p.amplitude,
        stemLabel: `${p.frequency.toFixed(1)}Hz`,
      }));
  const displayRows = chartRows;

  // ==== Envelope / demod primary view ====
  const DEMOD_GEOMETRY = { n: 9, bd: 12.7, pd: 70.0 };
  const selectedEnvelope = selectedAnalysis ? extractEnvelope(selectedAnalysis) : [];
  const envelopeRows = downsampleMax(selectedEnvelope, 3);
  const envelopeFloor = (() => {
    if (!selectedEnvelope.length) return 0;
    const amps = selectedEnvelope.map((p) => p.amplitude).sort((a, b) => a - b);
    return amps[Math.floor(amps.length / 2)];
  })();
  const envelopeLocalMaxima = envelopeRows.filter(
    (p, i, a) => i > 0 && i < a.length - 1 && p.amplitude > a[i - 1].amplitude && p.amplitude >= a[i + 1].amplitude
  );
  const envelopePeaks = envelopeLocalMaxima.filter((p) => envelopeFloor > 0 && p.amplitude > envelopeFloor * 5);
  const hasBearingEnergy = envelopePeaks.length > 0;

  // Demod cursor anchoring: recorded-fault (dominant peak) only when a bearing
  // fault is diagnosed AND row rpm is missing; otherwise theoretical geometry
  // for the selected bearing at the effective RPM.
  const diagnosisImpliesBearingFault = /bearing|bpfo|bpfi|bsf|ftf|outer race|inner race|rolling element/i.test(
    selectedAnalysis
      ? [selectedAnalysis.primary_fault, ...(Array.isArray(selectedAnalysis.fault_list) ? selectedAnalysis.fault_list.map((f) => `${f.title ?? ""} ${f.frequency ?? ""}`) : [])].join(" ")
      : ""
  );
  const useRecordedFaultAnchor = diagnosisImpliesBearingFault && rowRpm == null;

  const demodBearing = (() => {
    const ratio = DEMOD_GEOMETRY.bd / DEMOD_GEOMETRY.pd;
    const bpfoOrder = (DEMOD_GEOMETRY.n / 2) * (1 - ratio);
    const bpfiOrder = (DEMOD_GEOMETRY.n / 2) * (1 + ratio);
    const bsfOrder = (DEMOD_GEOMETRY.pd / (2 * DEMOD_GEOMETRY.bd)) * (1 - ratio * ratio);
    const ftfOrder = 0.5 * (1 - ratio);
    const make = (bpfo: number) => ({
      BPFO: { order: bpfoOrder, hz: bpfo },
      BPFI: { order: bpfiOrder, hz: bpfo * (bpfiOrder / bpfoOrder) },
      BSF: { order: bsfOrder, hz: bpfo * (bsfOrder / bpfoOrder) },
      FTF: { order: ftfOrder, hz: bpfo * (ftfOrder / bpfoOrder) },
    });
    if (useRecordedFaultAnchor) {
      const peaks = selectedAnalysis ? extractPeaks(selectedAnalysis) : [];
      const bpfo = peaks.reduce((m, p) => (p.amplitude > m.amplitude ? p : m), { frequency: 0, amplitude: 0 }).frequency;
      return make(bpfo);
    }
    if (bearingHz) return bearingHz;
    if (!hasRpm) return null;
    return make(bpfoOrder * rpmHz);
  })();
  const demodShaftHz = useRecordedFaultAnchor && demodBearing ? demodBearing.BPFO.hz / demodBearing.BPFO.order : rpmHz;

  // Stagger the 4 bearing cursor labels into vertical lanes; hide a
  // lower-priority label when cursors sit within ~40 Hz (≈40 px).
  const demodCursorDefs: { key: "FTF" | "BSF" | "BPFO" | "BPFI"; hz: number; stroke: string; offset: number }[] = demodBearing ? [
    { key: "FTF", hz: demodBearing.FTF.hz, stroke: "#fbbf24", offset: -60 },
    { key: "BSF", hz: demodBearing.BSF.hz, stroke: "#34d399", offset: -40 },
    { key: "BPFO", hz: demodBearing.BPFO.hz, stroke: "#a78bfa", offset: -20 },
    { key: "BPFI", hz: demodBearing.BPFI.hz, stroke: "#f472b6", offset: 0 },
  ] : [];
  const hiddenDemodLabels = new Set<"FTF" | "BSF" | "BPFO" | "BPFI">();
  const keptCursorHz: number[] = [];
  for (const def of demodCursorDefs) {
    if (keptCursorHz.some((k) => Math.abs(k - def.hz) < 40)) hiddenDemodLabels.add(def.key);
    else keptCursorHz.push(def.hz);
  }

  const demodHarmonicLines: { x: number; label: string; sideband: boolean }[] = (() => {
    if (!demodBearing) return [];
    const bpfo = demodBearing.BPFO.hz;
    const bpfi = demodBearing.BPFI.hz;
    const s = demodShaftHz;
    return [
      { x: bpfo * 2, label: "2xBPFO", sideband: false },
      { x: bpfo * 3, label: "3xBPFO", sideband: false },
      { x: bpfi * 2, label: "2xBPFI", sideband: false },
      { x: bpfi * 3, label: "3xBPFI", sideband: false },
      { x: bpfo - s, label: "BPFO-1X", sideband: true },
      { x: bpfo + s, label: "BPFO+1X", sideband: true },
      { x: bpfi - s, label: "BPFI-1X", sideband: true },
      { x: bpfi + s, label: "BPFI+1X", sideband: true },
    ];
  })();

  const envelopeChartRows = envelopeRows.map((p, i) => ({
    ...p,
  }));

  // Family labeling for the table (R5): only +/-3 Hz of a family frequency.
  const familyFreqs = demodBearing ? [
    { name: "BPFO", base: demodBearing.BPFO.hz },
    { name: "BPFI", base: demodBearing.BPFI.hz },
    { name: "BSF", base: demodBearing.BSF.hz },
    { name: "FTF", base: demodBearing.FTF.hz },
  ] : [];
  const assignFamily = (f: number): string => {
    for (const fam of familyFreqs) {
      for (let m = 1; m <= 3; m++) {
        if (Math.abs(f - fam.base * m) <= 3) return `${(f / fam.base).toFixed(2)}x ${fam.name}`;
      }
    }
    return "unassigned";
  };
  const envelopeTablePeaks = envelopePeaks.map((p) => ({ ...p, family: assignFamily(p.frequency) }));

  // Caption assembly: energy + RPM source + geometry
  const rpmSourceNote = useRecordedFaultAnchor
    ? "row RPM not stored - cursors anchored to recorded fault frequency"
    : rpmSource === "record"
      ? "record RPM"
      : rpmSource === "context"
        ? "record RPM (context)"
        : rpmSource === "asset"
          ? "asset nameplate RPM"
          : "manual reference RPM";
  const geometryNote = `geometry: ${geometryModel}`;
  const energyNote = hasBearingEnergy
    ? "bearing family energy present (SIM)"
    : "quiet demod band - no bearing fault energy in this record (SIM floor)";

  return (
    <div className="space-y-4">
      {selectedAnalysis == null || mode === "empty" ? (
        <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Spectrum Library workspace</h4>
          <div className="h-[300px] bg-slate-950 rounded-xl border border-slate-700/80 p-3 flex items-center justify-center text-center">
            <p className="text-slate-500 text-sm max-w-md">No report loaded - select and click Load Report, or pick a Saved Analysis</p>
          </div>
        </div>
      ) : (
        <>
          {/* -- Only control: Bearing harmonics & sidebands -- */}
          <label className={`flex items-center gap-2 ${hasRpm ? "cursor-pointer" : "opacity-50"}`} title={hasRpm ? undefined : "requires RPM"}>
            <input
              type="checkbox"
              checked={showBearingHarmonics}
              onChange={() => setShowBearingHarmonics((v) => !v)}
              disabled={!hasRpm}
              className="h-4 w-4 rounded border-slate-700 focus:ring-cyan-500"
            />
            <span className="text-sm text-slate-300">Bearing harmonics & sidebands</span>
          </label>

          {/* -- Chart 1: Demod envelope -- */}
          {(() => {
            const hasEnvelope = envelopeRows.length > 0;
            const title = (
              <div className="flex items-center justify-between gap-2 px-1 mb-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  ENVELOPE / DEMOD - {geometryModel}
                  <span className="text-[9px] border rounded px-1 border-amber-500/60 text-amber-400 normal-case tracking-normal">SIM</span>
                </h4>
                <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                  Ref RPM
                  {rpmSource === "record" || rpmSource === "context" || rpmSource === "asset" ? (
                    <span title={`source: ${rpmSource === "record" ? "record RPM" : rpmSource === "context" ? "record RPM (context)" : "asset nameplate RPM"}`} className="text-cyan-400 cursor-help">{effectiveRpm}</span>
                  ) : (
                    <input
                      type="number"
                      value={manualRefRpm}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v > 0) setManualRefRpm(v);
                      }}
                      className="w-24 text-xs rounded bg-slate-950/70 border border-slate-600 px-1.5 py-0.5 text-cyan-400 tabular-nums focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  )}
                </span>
              </div>
            );
            if (!hasEnvelope) {
              return (
                <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-3">
                  {title}
                  <div className="h-[300px] bg-slate-950 rounded-xl border border-slate-700/80 p-3 flex items-center justify-center text-center">
                    <p className="text-slate-500 text-sm max-w-md">No envelope stored for this record</p>
                  </div>
                </div>
              );
            }
            return (
              <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-3">
                {title}
                <p className="text-xs text-slate-400 px-1 mb-2">{energyNote} · {rpmSourceNote} · {geometryNote}</p>
                <div className="h-[380px] bg-slate-950 rounded-xl border border-slate-700/80 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={envelopeChartRows} margin={{ top: 28, right: 16, bottom: 28, left: 48 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" dataKey="frequency" domain={[0, 1000]} stroke="#94a3b8" tick={{ fontSize: 10 }} tickFormatter={(v) => String(Math.round(Number(v)))} label={{ value: "Frequency (Hz)", position: "insideBottom", offset: -12, fill: "#64748b", fontSize: 11 }} />
                      <YAxis stroke="#38bdf8" tick={{ fontSize: 10 }} label={{ value: "Demod amplitude (SIM)", angle: -90, position: "insideLeft", fill: "#38bdf8", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} formatter={(value) => [`${Number(value).toFixed(5)} SIM`, "Demod amplitude"]} labelFormatter={(label) => {
                        const freq = Number(label);
                        const hiddenNearby = demodCursorDefs
                          .filter((d) => hiddenDemodLabels.has(d.key) && Math.abs(d.hz - freq) < 40)
                          .map((d) => `${d.key} ${d.hz.toFixed(1)} Hz`)
                          .join(", ");
                        return hiddenNearby ? `${freq} Hz (${hiddenNearby})` : `${freq} Hz`;
                      }} />
                      <Line type="monotone" dataKey="amplitude" stroke="#38bdf8" strokeWidth={1} dot={false} isAnimationActive={false} name="Demod" />
                      {hasRpm && demodBearing && (
                        <>
                          {demodCursorDefs.map((def) => (
                            <ReferenceLine
                              key={def.key}
                              x={def.hz}
                              stroke={def.stroke}
                              strokeDasharray="4 4"
                              label={hiddenDemodLabels.has(def.key) ? undefined : { value: `${def.key} ${def.hz.toFixed(1)} Hz`, fill: def.stroke, position: "top", fontSize: 10 }}
                            />
                          ))}
                          {showBearingHarmonics && demodHarmonicLines.map((l) => (
                            <ReferenceLine key={l.label} x={l.x} stroke={l.sideband ? "#7c3aed" : "#a78bfa"} strokeDasharray="2 4" strokeWidth={l.sideband ? 0.75 : 1} opacity={l.sideband ? 0.3 : 0.45} label={{ value: l.label, fill: "#8b5cf6", position: "top", fontSize: l.sideband ? 8 : 9 }} />
                          ))}
                        </>
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}

          {/* -- Chart 2: Historical Waterfall -- */}
          {(() => {
            const traceWidth = 620;
            const xMax = waterfallMaxFreq * 1.25;
            const freqToX = (f: number) => (f / xMax) * traceWidth;
            const ampToHeight = (a: number) => (a / waterfallMaxAmp) * 45;
            const xLabels = [0, xMax / 4, xMax / 2, (3 * xMax) / 4, xMax].map((v) => Math.round(Number(v)));
            const allSpectral = waterfallRuns.length > 0 && waterfallRuns.every((r) => r.spectral.length > 0);
            return (
              <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2 px-1 mb-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Historical Waterfall — Last {waterfallRuns.length} Runs</h4>
                </div>
                <p className="text-xs text-slate-400 px-1 mb-2">
                  {allSpectral ? "continuous traces - SIM rows synthesized from stored peaks" : "peak-list traces - full spectrum not captured"}
                </p>
                <div className="flex flex-col w-full h-[420px] bg-slate-950/90 rounded-lg p-4 border border-slate-800">
                  <p className="text-[10px] font-mono text-slate-400 mb-1">Max Amp: {waterfallMaxAmp.toFixed(2)} mm/s (shared scale)</p>
                  <div className="relative flex-1 min-h-0 w-full">
                    <svg viewBox="0 0 850 320" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                      {waterfallRuns.map((run, i) => {
                        const color = waterfallColors[i] ?? "#0891b2";
                        const sorted = [...run.peaks].sort((a, b) => a.frequency - b.frequency);
                        const pathD = sorted.reduce((acc, p) => {
                          const x = freqToX(p.frequency);
                          const h = ampToHeight(p.amplitude);
                          return `${acc} L ${x} 0 L ${x} ${-h} L ${x} 0`;
                        }, "M 0 0") + " L 620 0";
                        let traceD = "";
                        if (run.spectral.length > 0) {
                          const step = 2;
                          for (let k = 0; k < run.spectral.length; k += step) {
                            const sp = run.spectral[k];
                            const x = freqToX(sp.frequency);
                            if (x > traceWidth) break;
                            traceD += `${k === 0 ? "M" : "L"}${x.toFixed(1)} ${(-ampToHeight(sp.amplitude)).toFixed(2)} `;
                          }
                        }
                        return (
                          <g key={i} transform={`translate(${i * 22}, ${270 - i * 32})`}>
                            <line x1={0} x2={620} y1={0} y2={0} stroke={color} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
                            {traceD ? (
                              <path d={traceD.trim()} stroke={color} strokeWidth={1.25} fill="none" vectorEffect="non-scaling-stroke" />
                            ) : (
                              <path d={pathD} stroke={color} strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
                            )}
                            {sorted.map((p, j) => {
                              const x = freqToX(p.frequency);
                              const h = ampToHeight(p.amplitude);
                              return (
                                <rect key={j} x={x - 3} y={-h} width={6} height={h + 1} fill="transparent">
                                  <title>{`${run.date} | ${p.frequency.toFixed(1)} Hz | ${p.amplitude.toFixed(2)} mm/s`}</title>
                                </rect>
                              );
                            })}
                          </g>
                        );
                      })}
                    </svg>
                    {/* Date labels — HTML spans, not stretched SVG text */}
                    {waterfallRuns.map((run, i) => (
                      <span
                        key={`date_${i}`}
                        className="absolute text-[10px] font-mono leading-none -translate-y-1/2 pointer-events-none flex items-center gap-1"
                        style={{
                          left: `${((i * 22 + 630) / 850) * 100}%`,
                          top: `${((270 - i * 32) / 320) * 100}%`,
                          color: waterfallColors[i] ?? "#0891b2",
                        }}
                      >
                        <span>{run.date}</span>
                        {run.spectralSource === "synthesized-from-peaks" && (
                          <span className="text-[9px] border rounded px-1 border-amber-500/60 text-amber-400">SIM</span>
                        )}
                        {run.spectral.length === 0 && (
                          <span className="text-[9px] border rounded px-1 border-slate-600 text-slate-400">PEAKS ONLY</span>
                        )}
                      </span>
                    ))}
                  </div>
                  {/* Frequency ticks — aligned to the front trace (620/850) */}
                  <div className="relative w-[72.9%] h-6 border-t border-slate-800 mt-1 flex justify-between text-xs text-slate-400 pt-1">
                    {xLabels.map((v) => (
                      <span key={v}>{v}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* -- Envelope peak table -- */}
          <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-cyan-300">Envelope Peaks</h4>
              <span className="text-[10px] text-slate-500 font-mono">local maxima &gt; 5x demod floor</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 text-left text-[10px] uppercase tracking-widest">
                    <th className="px-4 py-2.5 font-bold">Freq (Hz)</th>
                    <th className="px-4 py-2.5 font-bold">Amp (SIM)</th>
                    <th className="px-4 py-2.5 font-bold">Family</th>
                  </tr>
                </thead>
                <tbody>
                  {envelopeTablePeaks.length === 0 ? (
                    <tr className="border-t border-slate-700/80">
                      <td colSpan={3} className="px-4 py-6 text-center text-slate-500 text-sm">no envelope peaks above 5x floor</td>
                    </tr>
                  ) : (
                    envelopeTablePeaks.map((peak, i) => (
                      <tr key={`${peak.frequency}-${i}`} className="border-t border-slate-700/80">
                        <td className="px-4 py-3 text-cyan-300 font-mono">{peak.frequency.toFixed(1)}</td>
                        <td className="px-4 py-3 text-emerald-400 font-mono">{peak.amplitude.toFixed(5)}</td>
                        <td className="px-4 py-3 text-yellow-400 font-mono font-semibold">{peak.family}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
