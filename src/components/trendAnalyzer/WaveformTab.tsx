/**
 * Waveform Metrics tab — single-channel time-domain metrics.
 * Raw samples render only when stored; phase/keyphasor capture is not in the
 * dataset. Recharts (matches Trend Analyzer). ZERO mock data.
 */

import React from "react";
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
import {
  SPARSE_TREND_HELPER_TEXT,
  isSparseTrendSeries
} from "../../lib/vibration/trendSeries";
import {
  formatVelocityValue,
  velocityUnitLabel,
  velocityValueForDisplay,
  type VelocityDisplayUnit
} from "../../lib/vibration/units";

const CARD = "bg-slate-900/50 border border-white/10 rounded-xl p-6";

const PHASE_CAPABILITY_NOTE =
  "Derived time-domain metrics from stored waveform data. Phase/keyphasor capture requires reference-channel acquisition hardware and is not recorded in this dataset.";

function PhaseCapabilityNote() {
  return (
    <p
      data-testid="waveform-phase-capture-note"
      className="text-xs text-slate-500"
    >
      {PHASE_CAPABILITY_NOTE}
    </p>
  );
}

/**
 * Slice-J2 reuse: a series with no readings (or a single reading) has no
 * measurable slope. Both waveform trend cards share this honest fallback
 * instead of plotting a fabricated flat line.
 */
function WaveformSeriesFallback({ testId }: { testId: string }) {
  return (
    <div
      data-testid={testId}
      className="h-full flex items-center justify-center px-4 text-center"
    >
      <p className="text-sm text-slate-500">{SPARSE_TREND_HELPER_TEXT}</p>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  fontSize: 12
};

export type WaveformChartId = "time" | "crest" | "impact";

export interface WaveformChartModel {
  crestTrend: Array<{
    date: string;
    dateLabel: string;
    timestamp: string;
    crestFactor: number;
    fault: string;
    stoppedLabel: string | null;
  }>;
  impactTrend: Array<{
    date: string;
    dateLabel: string;
    timestamp: string;
    impactCount: number;
    fault: string;
    stoppedLabel: string | null;
  }>;
  waveformChartData: Array<{
    time: number;
    amplitude: number;
    oneX: number | null;
  }>;
  oneXMarkers: number[];
  sampleWindowMs: number;
}

/**
 * Single data path for the inline cards and their enlarged twins. The parent
 * computes this once and hands the same model to both surfaces.
 */
export function buildWaveformChartModel({
  rpm,
  trendPoints,
  waveformSamples
}: {
  rpm: number | null;
  trendPoints: WaveformTrendPoint[];
  waveformSamples: Array<{ time: number; amplitude: number }>;
}): WaveformChartModel {
  const crestTrend = trendPoints
    .filter((p) => p.crestFactor != null && p.crestFactor > 0)
    .map((p) => ({
      date: p.date,
      dateLabel: p.dateLabel || p.date,
      timestamp: p.timestamp,
      crestFactor: p.crestFactor as number,
      fault: p.primaryFault,
      stoppedLabel: p.stoppedLabel ?? null
    }));

  const impactTrend = trendPoints
    .filter((p) => p.impactCount != null)
    .map((p) => ({
      date: p.date,
      dateLabel: p.dateLabel || p.date,
      timestamp: p.timestamp,
      impactCount: p.impactCount as number,
      fault: p.primaryFault,
      stoppedLabel: p.stoppedLabel ?? null
    }));

  let sampleWindowMs = 10000;
  if (waveformSamples.length >= 2) {
    const times = waveformSamples.map((s) => s.time).filter(Number.isFinite);
    if (times.length) {
      const span = Math.max(...times) - Math.min(...times);
      sampleWindowMs = span > 0 ? span : 10000;
    }
  }

  const oneXMarkers =
    rpm != null && rpm > 0 ? calculate1XMarkers(rpm, sampleWindowMs) : [];

  let waveformChartData: WaveformChartModel["waveformChartData"] = [];
  if (waveformSamples.length) {
    const markerSet = new Set(
      oneXMarkers.map((t) => Math.round(t * 10) / 10)
    );
    waveformChartData = waveformSamples.map((s) => ({
      time: s.time,
      amplitude: s.amplitude,
      oneX:
        markerSet.has(Math.round(s.time * 10) / 10) ||
        oneXMarkers.some((m) => Math.abs(m - s.time) < sampleWindowMs * 0.002)
          ? s.amplitude
          : null
    }));
  }

  return {
    crestTrend,
    impactTrend,
    waveformChartData,
    oneXMarkers,
    sampleWindowMs
  };
}

export function WaveformTimeChartBody({
  data,
  oneXMarkers,
  velocityUnit = "mm/s"
}: {
  data: WaveformChartModel["waveformChartData"];
  oneXMarkers: number[];
  velocityUnit?: VelocityDisplayUnit;
}) {
  const unitLabel = velocityUnitLabel(velocityUnit);
  const displayData = data.map((point) => ({
    ...point,
    amplitude: velocityValueForDisplay(point.amplitude, velocityUnit),
    oneX:
      point.oneX == null
        ? null
        : velocityValueForDisplay(point.oneX, velocityUnit)
  }));

  return (
    <ResponsiveContainer
      width="100%"
      height="100%"
      data-testid="chart-body-waveformTime"
    >
      <LineChart
        data={displayData}
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
            value: `Amplitude (${unitLabel})`,
            angle: -90,
            position: "insideLeft",
            fill: "#10b981",
            fontSize: 11
          }}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          allowEscapeViewBox={{ x: true, y: true }}
          wrapperStyle={{ zIndex: 20 }}
          formatter={(value: number) => [`${value} ${unitLabel}`, "Amplitude"]}
        />
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
  );
}

export function CrestFactorTrendChartBody({
  data
}: {
  data: WaveformChartModel["crestTrend"];
}) {
  if (data.length === 0) {
    return <WaveformSeriesFallback testId="chart-body-waveformCrest" />;
  }

  const sparse = isSparseTrendSeries(data);

  return (
    <div
      data-testid="chart-body-waveformCrest"
      className="h-full flex flex-col"
    >
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 12, right: 16, bottom: 8, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="dateLabel" stroke="#94a3b8" tick={{ fontSize: 11 }} />
            <YAxis
              stroke="#22d3ee"
              tick={{ fontSize: 11 }}
              domain={[0, "auto"]}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ zIndex: 20 }}
              labelFormatter={(label, payload) => {
                const stopped = (
                  payload?.[0]?.payload as
                    | { stoppedLabel?: string | null }
                    | undefined
                )?.stoppedLabel;
                return stopped ? `${label} · ${stopped}` : label;
              }}
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
      </div>
      {sparse && (
        <p className="text-xs text-amber-300 text-center px-2">
          {SPARSE_TREND_HELPER_TEXT}
        </p>
      )}
    </div>
  );
}

export function ImpactCountTrendChartBody({
  data
}: {
  data: WaveformChartModel["impactTrend"];
}) {
  if (data.length === 0) {
    return <WaveformSeriesFallback testId="chart-body-waveformImpact" />;
  }

  const sparse = isSparseTrendSeries(data);

  return (
    <div
      data-testid="chart-body-waveformImpact"
      className="h-full flex flex-col"
    >
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 12, right: 16, bottom: 8, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="dateLabel" stroke="#94a3b8" tick={{ fontSize: 11 }} />
            <YAxis
              stroke="#f97316"
              tick={{ fontSize: 11 }}
              domain={[0, "auto"]}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ zIndex: 20 }}
              labelFormatter={(label, payload) => {
                const stopped = (
                  payload?.[0]?.payload as
                    | { stoppedLabel?: string | null }
                    | undefined
                )?.stoppedLabel;
                return stopped ? `${label} · ${stopped}` : label;
              }}
            />
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
      </div>
      {sparse && (
        <p className="text-xs text-amber-300 text-center px-2">
          {SPARSE_TREND_HELPER_TEXT}
        </p>
      )}
    </div>
  );
}

export interface WaveformTabProps {
  rpm: number | null;
  trendPoints: WaveformTrendPoint[];
  model: WaveformChartModel;
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
  /** Active tenant velocity display unit (slice H2); defaults to mm/s. */
  velocityUnit?: VelocityDisplayUnit;
  /** Shared trendSsot window note; null when the window has readings. */
  windowEmptyNote?: string | null;
  /** True when stopped samples exist in the shared scope (OFF toggle). */
  hasStoppedSamples?: boolean;
  /** Running-state toggle state, used only for the stopped-series note. */
  runningOnly?: boolean;
  /** Latest point inside the shared trend window (never the raw snapshot). */
  latestTrendPoint?: {
    dateLabel: string;
    stoppedLabel: string | null;
  } | null;
  renderExpandButton?: (
    chart: WaveformChartId,
    label: string
  ) => React.ReactNode;
}

export default function WaveformTab({
  rpm,
  trendPoints,
  model,
  latestMetrics,
  waveformSamples,
  emptyAlert,
  analysesCount,
  velocityUnit = "mm/s",
  windowEmptyNote = null,
  hasStoppedSamples = false,
  runningOnly = true,
  latestTrendPoint = null,
  renderExpandButton
}: WaveformTabProps) {
  const [timeWaveformOpen, setTimeWaveformOpen] = React.useState(true);
  const hasLatest =
    waveformSamples.length > 0 ||
    (latestMetrics != null &&
      (latestMetrics.peakToPeak != null ||
        latestMetrics.crestFactor != null ||
        latestMetrics.impactCount != null ||
        Boolean(latestMetrics.symmetry)));

  const { crestTrend, impactTrend, waveformChartData, oneXMarkers } = model;
  const sampleWindowMs = model.sampleWindowMs;

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
        <div className="mt-3 max-w-lg">
          <PhaseCapabilityNote />
        </div>
      </div>
    );
  }

  const crest = latestMetrics?.crestFactor;
  const impacts = latestMetrics?.impactCount;
  const windowSec = sampleWindowMs / 1000;
  // Peak-to-peak is a velocity amplitude (time-waveform Y axis is mm/s), so the
  // label and value follow the tenant velocity preference, never a vague hedge.
  const peakToPeakDisplay =
    latestMetrics?.peakToPeak != null
      ? formatVelocityValue(latestMetrics.peakToPeak, velocityUnit)
      : "—";

  return (
    <div className="space-y-6">
      <PhaseCapabilityNote />
      <p
        data-testid="waveform-snapshot-exception-note"
        className="text-xs text-amber-300"
      >
        Raw waveform snapshot — not filtered by running-state or window. Trend
        charts below use the shared time window.
      </p>
      {windowEmptyNote && (
        <p
          data-testid="waveform-window-empty-note"
          className="text-xs text-amber-300"
        >
          {windowEmptyNote}
        </p>
      )}
      {!runningOnly && hasStoppedSamples && (
        <p
          data-testid="waveform-stopped-series-note"
          className="text-xs text-amber-300"
        >
          Includes stopped samples (load ≤ 80%) — labeled &ldquo;stopped
          sample&rdquo; in the tooltip.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Peak-to-Peak
          </p>
          <p className="text-2xl font-bold text-emerald-400 font-mono">
            {peakToPeakDisplay}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {velocityUnitLabel(velocityUnit)}
          </p>
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
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-start gap-2">
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTimeWaveformOpen((open) => !open)}
                aria-expanded={timeWaveformOpen}
                aria-controls="waveform-time-panel"
                className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded border border-slate-600 bg-slate-800 text-slate-300 hover:border-emerald-500/50 hover:text-emerald-200 cursor-pointer transition-colors"
              >
                {timeWaveformOpen
                  ? "Collapse time waveform"
                  : "Expand time waveform"}
              </button>
              {renderExpandButton?.("time", "Enlarge Time Waveform chart")}
            </div>
          </div>
          {timeWaveformOpen && (
            <div
              id="waveform-time-panel"
              className="h-[320px] bg-slate-950 rounded-lg border border-white/10 p-2 mt-3"
            >
              <WaveformTimeChartBody
                data={waveformChartData}
                oneXMarkers={oneXMarkers}
                velocityUnit={velocityUnit}
              />
            </div>
          )}
        </div>
      )}

      {latestTrendPoint && (
        <p
          data-testid="waveform-latest-trend-summary"
          className="text-xs text-slate-400"
        >
          Latest in window · {latestTrendPoint.dateLabel}
          {latestTrendPoint.stoppedLabel
            ? ` · ${latestTrendPoint.stoppedLabel}`
            : ""}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={CARD}>
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-base font-bold text-white">
              Crest Factor Trend
            </h3>
            {renderExpandButton?.("crest", "Enlarge Crest Factor Trend chart")}
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Early warning — rising crest factor often precedes overall velocity
            growth
          </p>
          <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
            <CrestFactorTrendChartBody data={crestTrend} />
          </div>
        </div>

        <div className={CARD}>
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-base font-bold text-white">
              Impact Count Trend
            </h3>
            {renderExpandButton?.("impact", "Enlarge Impact Count Trend chart")}
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Transient peaks exceeding 3× RMS per measurement window
          </p>
          <div className="h-56 bg-slate-950 rounded-lg border border-white/10 p-2">
            <ImpactCountTrendChartBody data={impactTrend} />
          </div>
        </div>
      </div>
    </div>
  );
}
