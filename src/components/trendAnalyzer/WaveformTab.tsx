/**
 * Waveform & Phase tab — Phase 1 single-channel accelerometer metrics.
 * Recharts (matches Trend Analyzer). ZERO mock data.
 */

import React, { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Activity, AudioWaveform } from "lucide-react";
import type { WaveformTrendPoint } from "../../lib/vibration/vibrationDiagnosticRecord";
import {
  calculate1XMarkers,
  interpretCrestFactor,
  interpretImpactCount
} from "../../lib/waveformMetrics";

const CARD = "bg-slate-900/50 border border-white/10 rounded-xl p-6";

const tooltipStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  fontSize: 12
};

export interface WaveformTabProps {
  rpm: number | null;
  trendPoints: WaveformTrendPoint[];
  latestMetrics: {
    peakToPeak: number | null;
    crestFactor: number | null;
    impactCount: number | null;
    symmetry: string | null;
    modulation: string | null;
    timePerRevolutionMs: number | null;
  } | null;
  waveformSamples: Array<{ time: number; amplitude: number }>;
  emptyAlert: React.ReactNode;
  analysesCount: number;
}

export default function WaveformTab({
  rpm,
  trendPoints,
  latestMetrics,
  waveformSamples,
  emptyAlert,
  analysesCount
}: WaveformTabProps) {
  const hasLatest =
    latestMetrics != null &&
    (latestMetrics.peakToPeak != null ||
      latestMetrics.crestFactor != null ||
      latestMetrics.impactCount != null ||
      Boolean(latestMetrics.symmetry) ||
      waveformSamples.length > 0);

  const crestTrend = useMemo(
    () =>
      trendPoints
        .filter((p) => p.crestFactor != null && p.crestFactor > 0)
        .map((p) => ({
          date: p.date,
          crestFactor: p.crestFactor as number,
          fault: p.primaryFault
        })),
    [trendPoints]
  );

  const impactTrend = useMemo(
    () =>
      trendPoints
        .filter((p) => p.impactCount != null)
        .map((p) => ({
          date: p.date,
          impactCount: p.impactCount as number,
          fault: p.primaryFault
        })),
    [trendPoints]
  );

  const sampleWindowMs = useMemo(() => {
    if (waveformSamples.length < 2) return 10000;
    const times = waveformSamples.map((s) => s.time).filter(Number.isFinite);
    if (!times.length) return 10000;
    const span = Math.max(...times) - Math.min(...times);
    return span > 0 ? span : 10000;
  }, [waveformSamples]);

  const oneXMarkers = useMemo(() => {
    if (!(rpm != null && rpm > 0)) return [];
    return calculate1XMarkers(rpm, sampleWindowMs);
  }, [rpm, sampleWindowMs]);

  const waveformChartData = useMemo(() => {
    if (!waveformSamples.length) return [];
    const markerSet = new Set(
      oneXMarkers.map((t) => Math.round(t * 10) / 10)
    );
    return waveformSamples.map((s) => ({
      time: s.time,
      amplitude: s.amplitude,
      oneX:
        markerSet.has(Math.round(s.time * 10) / 10) ||
        oneXMarkers.some((m) => Math.abs(m - s.time) < sampleWindowMs * 0.002)
          ? s.amplitude
          : null
    }));
  }, [waveformSamples, oneXMarkers, sampleWindowMs]);

  if (analysesCount === 0) {
    return <>{emptyAlert}</>;
  }

  if (!hasLatest && trendPoints.length === 0) {
    return (
      <div
        className={`${CARD} mb-6 flex flex-col items-center justify-center text-center py-16 px-6`}
      >
        <AudioWaveform className="h-8 w-8 text-slate-500 mb-3" />
        <p className="text-sm font-semibold text-slate-200">
          Awaiting Diagnostic Record
        </p>
        <p className="text-sm text-slate-400 mt-2 max-w-lg">
          Run Diagnostics and upload a spectrum export with time waveform data
          to populate analysis trends.
        </p>
        <p className="text-xs mt-2 text-slate-500 max-w-md">
          Saved vibration analyses for this asset have no waveform/acceleration
          metrics yet.
        </p>
      </div>
    );
  }

  const crest = latestMetrics?.crestFactor;
  const impacts = latestMetrics?.impactCount;
  const windowSec = sampleWindowMs / 1000;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Peak-to-Peak
          </p>
          <p className="text-2xl font-bold text-emerald-400 font-mono">
            {latestMetrics?.peakToPeak != null
              ? `${latestMetrics.peakToPeak.toFixed(2)}`
              : "—"}
          </p>
          <p className="text-xs text-slate-500 mt-1">mm/s (or chart unit)</p>
        </div>
        <div className={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Crest Factor
          </p>
          <p
            className={`text-2xl font-bold font-mono ${
              crest != null && crest > 5 ? "text-orange-400" : "text-cyan-400"
            }`}
          >
            {crest != null ? crest.toFixed(2) : "—"}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {crest != null ? interpretCrestFactor(crest) : "Not recorded"}
          </p>
        </div>
        <div className={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Impact Count
          </p>
          <p
            className={`text-2xl font-bold font-mono ${
              impacts != null && impacts > 5
                ? "text-orange-400"
                : "text-amber-400"
            }`}
          >
            {impacts != null ? String(impacts) : "—"}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {impacts != null && rpm != null && rpm > 0
              ? interpretImpactCount(impacts, rpm, windowSec || 10)
              : impacts != null
                ? `${impacts} peak(s) &gt; 3× RMS`
                : "Not recorded"}
          </p>
        </div>
        <div className={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Symmetry
          </p>
          <p
            className={`text-2xl font-bold ${
              latestMetrics?.symmetry === "Symmetric"
                ? "text-green-400"
                : latestMetrics?.symmetry
                  ? "text-yellow-400"
                  : "text-slate-400"
            }`}
          >
            {latestMetrics?.symmetry || "—"}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {latestMetrics?.modulation
              ? `Modulation: ${latestMetrics.modulation}`
              : latestMetrics?.timePerRevolutionMs != null
                ? `TPR ${latestMetrics.timePerRevolutionMs.toFixed(1)} ms`
                : rpm != null && rpm > 0
                  ? `1X TPR ${(60000 / rpm).toFixed(1)} ms @ ${rpm} RPM`
                  : "RPM required for 1X markers"}
          </p>
        </div>
      </div>

      {waveformChartData.length > 0 && (
        <div className={CARD}>
          <div className="flex items-start gap-2 mb-1">
            <Activity className="h-4 w-4 text-emerald-400 mt-0.5" />
            <div>
              <h3 className="text-base font-bold text-white">Time Waveform</h3>
              <p className="text-xs text-slate-500">
                Real samples from latest diagnostic
                {rpm != null && rpm > 0
                  ? ` · 1X markers every ${(60000 / rpm).toFixed(1)} ms (${rpm} RPM)`
                  : ""}
              </p>
            </div>
          </div>
          <div className="h-[320px] bg-slate-950 rounded-lg border border-white/10 p-2 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={waveformChartData}
                margin={{ top: 12, right: 16, bottom: 28, left: 48 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="time"
                  stroke="#94a3b8"
                  tick={{ fontSize: 10 }}
                  label={{
                    value: "Time (ms)",
                    position: "insideBottom",
                    offset: -12,
                    fill: "#64748b",
                    fontSize: 11
                  }}
                />
                <YAxis
                  stroke="#10b981"
                  tick={{ fontSize: 10 }}
                  label={{
                    value: "Amplitude",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#10b981",
                    fontSize: 11
                  }}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="amplitude"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  name="Amplitude"
                  dot={false}
                  isAnimationActive={false}
                />
                {oneXMarkers.slice(0, 40).map((t) => (
                  <ReferenceLine
                    key={`1x-${t}`}
                    x={t}
                    stroke="#eab308"
                    strokeDasharray="3 3"
                    strokeOpacity={0.45}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={CARD}>
          <h3 className="text-base font-bold text-white mb-1">
            Crest Factor Trend
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Early warning — rising crest factor often precedes overall velocity
            growth
          </p>
          <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
            {crestTrend.length === 0 ? (
              <div className="h-full flex items-center justify-center px-4 text-center">
                <p className="text-sm text-slate-500">
                  No crest factor history yet.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={crestTrend}
                  margin={{ top: 12, right: 16, bottom: 8, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis
                    stroke="#22d3ee"
                    tick={{ fontSize: 11 }}
                    domain={[0, "auto"]}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [
                      `${value.toFixed(2)} — ${interpretCrestFactor(value)}`,
                      "Crest Factor"
                    ]}
                  />
                  <Legend />
                  <ReferenceLine
                    y={5}
                    stroke="#ef4444"
                    strokeDasharray="5 5"
                    label={{
                      value: "CF=5 Warn",
                      fill: "#ef4444",
                      fontSize: 10,
                      position: "insideTopRight"
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="crestFactor"
                    stroke="#22d3ee"
                    strokeWidth={2.5}
                    name="Crest Factor"
                    dot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className={CARD}>
          <h3 className="text-base font-bold text-white mb-1">
            Impact Count Trend
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Transient peaks exceeding 3× RMS per measurement window
          </p>
          <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
            {impactTrend.length === 0 ? (
              <div className="h-full flex items-center justify-center px-4 text-center">
                <p className="text-sm text-slate-500">
                  No impact count history yet.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={impactTrend}
                  margin={{ top: 12, right: 16, bottom: 8, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#f97316" tick={{ fontSize: 11 }} domain={[0, "auto"]} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="impactCount"
                    stroke="#f97316"
                    strokeWidth={2.5}
                    name="Impacts"
                    dot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
