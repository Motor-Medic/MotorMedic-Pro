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
  reportVibrationRecord,
  allAnalyses = []
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
  const [showBearingHarmonics, setShowBearingHarmonics] = useState(false);

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

  const extractEnvelopeSource = (row: SavedAnalysisResult): string | null => {
    const td = row.telemetry_data;
    if (!td || typeof td !== "object") return null;
    const s = (td as Record<string, unknown>).envelope_source;
    return typeof s === "string" ? s : null;
  };

  const extractRowRpm = (row: SavedAnalysisResult): number | null => {
    const td = row.telemetry_data;
    if (!td || typeof td !== "object") return null;
    const o = td as Record<string, unknown>;
    const vtr = o.vibration_trend_record as Record<string, unknown> | undefined;
    const r = Number(o.rpm ?? o.running_speed_rpm ?? (vtr ? vtr.rpm : null));
    return Number.isFinite(r) && r > 0 ? r : null;
  };

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

  // Compute baseline peaks based on selected baseline mode
  const baselinePeaks = (() => {
    if (baseline === "None") return [];
    if (allAnalyses.length === 0) return [];

    if (baseline === "Initial Commissioning") {
      // Use the record flagged as baseline, or fall back to the oldest record
      const baseRow = allAnalyses.find((a) => a.is_baseline) ?? [...allAnalyses].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
      return baseRow ? extractPeaks(baseRow) : [];
    }

    // 30-Day Average: average amplitude across all analyses within 30 days, binned at 2 Hz
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = allAnalyses.filter((a) => new Date(a.timestamp).getTime() >= cutoff);
    if (recent.length === 0) return [];

    const bins = new Map<number, { sum: number; count: number }>();
    for (const row of recent) {
      for (const p of extractPeaks(row)) {
        const binKey = Math.round(p.frequency / 2) * 2; // 2 Hz bins
        const existing = bins.get(binKey);
        if (existing) {
          existing.sum += p.amplitude;
          existing.count += 1;
        } else {
          bins.set(binKey, { sum: p.amplitude, count: 1 });
        }
      }
    }
    return Array.from(bins.entries())
      .map(([freq, { sum, count }]) => ({ frequency: freq, amplitude: sum / count }))
      .filter((p) => Number.isFinite(p.frequency) && p.frequency > 0 && Number.isFinite(p.amplitude) && p.amplitude > 0)
      .sort((a, b) => a.frequency - b.frequency);
  })();

  const hasBaseline = baselineSpectrum.length > 0 || baselinePeaks.length > 0;
  const chartRows = mode === "curve"
    ? fullPts
    : peakList.map((p) => {
        const match = baselinePeaks.length > 0
          ? baselinePeaks.reduce<{ frequency: number; amplitude: number; dist: number } | null>((best, bp) => {
              const dist = Math.abs(bp.frequency - p.frequency);
              if (!best || dist < best.dist) return { ...bp, dist };
              return best;
            }, null)
          : null;
        const baselineAmp = match && match.dist < 2 ? match.amplitude : undefined;
        return { frequency: p.frequency, amplitude: p.amplitude, baselineAmplitude: baselineAmp as number | undefined, stemLabel: `${p.frequency.toFixed(1)}Hz` };
      });
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

  // Bearing harmonic multiples + 1X sidebands (label, x, sideband flag)
  const bearingHarmonicLines: { x: number; label: string; sideband: boolean }[] = [];
  if (bearingHz) {
    const bpfo = bearingHz.BPFO.hz;
    const bpfi = bearingHz.BPFI.hz;
    bearingHarmonicLines.push(
      { x: bpfo * 2, label: "2xBPFO", sideband: false },
      { x: bpfo * 3, label: "3xBPFO", sideband: false },
      { x: bpfi * 2, label: "2xBPFI", sideband: false },
      { x: bpfi * 3, label: "3xBPFI", sideband: false },
      { x: bpfo - rpmHz, label: "BPFO-1X", sideband: true },
      { x: bpfo + rpmHz, label: "BPFO+1X", sideband: true },
      { x: bpfi - rpmHz, label: "BPFI-1X", sideband: true },
      { x: bpfi + rpmHz, label: "BPFI+1X", sideband: true }
    );
  }

  const activeCursorHz = [rpmHz, rpmHz * 2, rpmHz * 3, rpmHz * 4];
  if (showBearingCursors && bearingHz) {
    activeCursorHz.push(bearingHz.FTF.hz, bearingHz.BSF.hz, bearingHz.BPFO.hz, bearingHz.BPFI.hz);
  }
  const highestActiveCursorHz = activeCursorHz.length > 0 ? Math.max(...activeCursorHz) : rpmHz * 4;
  const allDataFreqs = [
    ...chartRows.map((r) => r.frequency),
    ...(showBaseline ? baselinePeaks.map((p) => p.frequency) : [])
  ];
  const maxDataPeakHz = allDataFreqs.length ? Math.max(...allDataFreqs) : highestActiveCursorHz;
  const xDomainMax = harmonicZoom
    ? highestActiveCursorHz * 1.15
    : maxDataPeakHz * 1.25;
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

  // R4: demod bearing cursors match the synthesis convention (fixed geometry).
  const demodBearing = (() => {
    const ratio = DEMOD_GEOMETRY.bd / DEMOD_GEOMETRY.pd;
    const bpfoOrder = (DEMOD_GEOMETRY.n / 2) * (1 - ratio);
    const bpfiOrder = (DEMOD_GEOMETRY.n / 2) * (1 + ratio);
    const bsfOrder = (DEMOD_GEOMETRY.pd / (2 * DEMOD_GEOMETRY.bd)) * (1 - ratio * ratio);
    const ftfOrder = 0.5 * (1 - ratio);
    const rowRpm = selectedAnalysis ? extractRowRpm(selectedAnalysis) : null;
    const peaks = selectedAnalysis ? extractPeaks(selectedAnalysis) : [];
    const dominant = peaks.reduce((m, p) => (p.amplitude > m.amplitude ? p : m), { frequency: 0, amplitude: 0 });
    const bpfo = rowRpm && rowRpm > 0 ? bpfoOrder * (rowRpm / 60) : dominant.frequency;
    return {
      rpm: rowRpm,
      BPFO: { order: bpfoOrder, hz: bpfo },
      BPFI: { order: bpfiOrder, hz: bpfo * (bpfiOrder / bpfoOrder) },
      BSF: { order: bsfOrder, hz: bpfo * (bsfOrder / bpfoOrder) },
      FTF: { order: ftfOrder, hz: bpfo * (ftfOrder / bpfoOrder) },
    };
  })();
  const demodShaftHz =
    demodBearing.rpm && demodBearing.rpm > 0 ? demodBearing.rpm / 60 : demodBearing.BPFO.hz / demodBearing.BPFO.order;

  const demodHarmonicLines: { x: number; label: string; sideband: boolean }[] = (() => {
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

  // Baseline ghost = oldest other row's envelope for this component.
  const baselineEnvelopeRows = (() => {
    const oldest = [...allAnalyses]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .find((a) => a.id !== selectedAnalysis?.id);
    return oldest ? downsampleMax(extractEnvelope(oldest), 3) : [];
  })();
  const envelopeChartRows = envelopeRows.map((p, i) => ({
    ...p,
    baselineAmp: baselineEnvelopeRows[i]?.amplitude ?? undefined,
  }));

  // Family labeling for the table (R5): only +/-3 Hz of a family frequency.
  const familyFreqs = [
    { name: "BPFO", base: demodBearing.BPFO.hz },
    { name: "BPFI", base: demodBearing.BPFI.hz },
    { name: "BSF", base: demodBearing.BSF.hz },
    { name: "FTF", base: demodBearing.FTF.hz },
  ];
  const assignFamily = (f: number): string => {
    for (const fam of familyFreqs) {
      for (let m = 1; m <= 3; m++) {
        if (Math.abs(f - fam.base * m) <= 3) return `${(f / fam.base).toFixed(2)}x ${fam.name}`;
      }
    }
    return "unassigned";
  };
  const envelopeTablePeaks = envelopePeaks.map((p) => ({ ...p, family: assignFamily(p.frequency) }));

  const viewModeControls = (
    <div className="flex rounded-md border border-slate-700 bg-slate-900/80 p-1">
      <button type="button" onClick={() => setViewMode("2D Overlay")} className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${viewMode === "2D Overlay" ? "bg-cyan-600 text-white font-medium" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`}>Demod Overlay</button>
      <button type="button" onClick={() => setViewMode("Historical Waterfall")} className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${viewMode === "Historical Waterfall" ? "bg-cyan-600 text-white font-medium" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`}>Historical Waterfall</button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* -- Tab 2 structural shell: control bar -- */}
      <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 space-y-3">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Spectrum Library Controls</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
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

          {viewMode !== "Historical Waterfall" && (
          <>
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
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showBearingCursors}
              onChange={() => setShowBearingCursors((v) => !v)}
              className="h-4 w-4 rounded border-slate-700 focus:ring-cyan-500"
            />
            <span className="text-sm text-slate-300">Bearing Cursors</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showBearingHarmonics}
              onChange={() => setShowBearingHarmonics((v) => !v)}
              className="h-4 w-4 rounded border-slate-700 focus:ring-cyan-500"
            />
            <span className="text-sm text-slate-300">Bearing harmonics & sidebands</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-1">
              <button type="button" onClick={() => setDomain("fft")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${domain === "fft" ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:text-slate-200"}`}>Demod Spectrum</button>
              <button type="button" onClick={() => setDomain("waveform")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${domain === "waveform" ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:text-slate-200"}`}>Time Waveform</button>
            </div>
            <button type="button" onClick={() => setShowBaseline((v) => !v)} className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${showBaseline ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200"}`}>Overlay Baseline</button>
          </div>
          <p className="text-[10px] text-slate-500 font-mono">
            1X = {rpmHz.toFixed(2)} Hz · 2X = {(rpmHz * 2).toFixed(2)} Hz · 3X = {(rpmHz * 3).toFixed(2)} Hz · 4X = {(rpmHz * 4).toFixed(2)} Hz
          </p>
          </>
          )}

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
          ) : viewMode === "Historical Waterfall" ? (
          (() => {
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
                  {viewModeControls}
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
          })()
          ) : (
          (() => {
            const hasEnvelope = envelopeRows.length > 0;
            const energyCaption = hasBearingEnergy
              ? "bearing family energy present (SIM)"
              : "quiet demod band - no bearing fault energy in this record (SIM floor)";
            const rpmNote = demodBearing.rpm
              ? `cursors at record RPM ${demodBearing.rpm}`
              : "row RPM not stored - cursors anchored to recorded fault frequency";
            const title = (
              <div className="flex items-center justify-between gap-2 px-1 mb-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  ENVELOPE / DEMOD - {bearing}
                  <span className="text-[9px] border rounded px-1 border-amber-500/60 text-amber-400 normal-case tracking-normal">SIM</span>
                </h4>
                {viewModeControls}
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
            const ghostNote =
              showBaseline && baselineEnvelopeRows.length === 0
                ? " · no stored baseline envelope to overlay"
                : "";
            return (
              <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-3">
                {title}
                <p className="text-xs text-slate-400 px-1 mb-2">{energyCaption} · {rpmNote}{ghostNote}</p>
                <div className="h-[380px] bg-slate-950 rounded-xl border border-slate-700/80 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={envelopeChartRows} margin={{ top: 28, right: 16, bottom: 28, left: 48 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" dataKey="frequency" domain={[0, 1000]} stroke="#94a3b8" tick={{ fontSize: 10 }} tickFormatter={(v) => String(Math.round(Number(v)))} label={{ value: "Frequency (Hz)", position: "insideBottom", offset: -12, fill: "#64748b", fontSize: 11 }} />
                      <YAxis stroke="#38bdf8" tick={{ fontSize: 10 }} label={{ value: "Demod amplitude (SIM)", angle: -90, position: "insideLeft", fill: "#38bdf8", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} formatter={(value) => [`${Number(value).toFixed(5)} SIM`, "Demod amplitude"]} labelFormatter={(label) => `${label} Hz`} />
                      {showBaseline && baselineEnvelopeRows.length > 0 && (
                        <Line type="monotone" dataKey="baselineAmp" stroke="#64748b" strokeWidth={1} opacity={0.3} dot={false} isAnimationActive={false} name="Baseline" />
                      )}
                      <Area type="monotone" dataKey="amplitude" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.2} isAnimationActive={false} name="Demod" />
                      {showBearingCursors && (
                        <>
                          <ReferenceLine x={demodBearing.FTF.hz} stroke="#fbbf24" strokeDasharray="4 4" label={{ value: `FTF ${demodBearing.FTF.hz.toFixed(1)} Hz`, fill: "#fbbf24", position: "top", fontSize: 10 }} />
                          <ReferenceLine x={demodBearing.BSF.hz} stroke="#34d399" strokeDasharray="4 4" label={{ value: `BSF ${demodBearing.BSF.hz.toFixed(1)} Hz`, fill: "#34d399", position: "top", fontSize: 10 }} />
                          <ReferenceLine x={demodBearing.BPFO.hz} stroke="#a78bfa" strokeDasharray="4 4" label={{ value: `BPFO ${demodBearing.BPFO.hz.toFixed(1)} Hz`, fill: "#a78bfa", position: "top", fontSize: 10 }} />
                          <ReferenceLine x={demodBearing.BPFI.hz} stroke="#f472b6" strokeDasharray="4 4" label={{ value: `BPFI ${demodBearing.BPFI.hz.toFixed(1)} Hz`, fill: "#f472b6", position: "top", fontSize: 10 }} />
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
          })()
          )}

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
