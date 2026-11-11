/**
 * Wear Metals & Debris — historical Recharts trends + Viscosity/TAN + sample table.
 * Ingestion lives in AddOilSampleModal (not on this page body).
 *
 * Every reader (latest cards, charts, viscosity trend, table) and the in-range
 * count share one window predicate, `filterOilSamplesToWindow`, so the tab can
 * never show rows outside the selected range.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  calculateBaselineDelta,
  calculateWearRate,
  formatSampleDate,
  getThresholdStatus,
  interpretWearPattern,
  orderOilSamplesBySequence
} from "../../lib/oilAnalysisMetrics";
import { fetchOilSamples } from "../../lib/oilSampleRow";
import { filterOilSamplesToWindow } from "../../lib/oilTribologyGuidance";
import type { OilSample, ThresholdStatus } from "../../types/oilAnalysis";
import ViscosityTanTrendChart from "./ViscosityTanTrendChart";

export interface OilWearMetalsTabProps {
  assetId: string;
  /** Bump from parent after Add Sample modal saves to re-fetch. */
  refreshKey?: number;
  /** Toolbar From date (YYYY-MM-DD); null/empty means open start. */
  windowStart?: string | null;
  /** Toolbar To date (YYYY-MM-DD); null/empty means open end. */
  windowEnd?: string | null;
}

const STATUS_STYLES: Record<ThresholdStatus, string> = {
  normal: "text-green-400 bg-green-400/10 border-green-400/20",
  warning: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  critical: "text-red-400 bg-red-400/10 border-red-400/20"
};

type SampleRange = "ALL" | "7D" | "30D" | "90D" | "1Y";

const RANGE_DAYS: Record<Exclude<SampleRange, "ALL">, number> = {
  "7D": 7,
  "30D": 30,
  "90D": 90,
  "1Y": 365
};

const RANGE_OPTIONS: readonly SampleRange[] = [
  "ALL",
  "7D",
  "30D",
  "90D",
  "1Y"
] as const;

/** Local calendar-day key N days ago; the window predicate reads YYYY-MM-DD. */
function dateKeyDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function OilWearMetalsTab({
  assetId,
  refreshKey = 0,
  windowStart = null,
  windowEnd = null
}: OilWearMetalsTabProps) {
  const [samples, setSamples] = useState<OilSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<SampleRange>("ALL");

  const loadSamples = useCallback(async () => {
    if (!assetId) {
      setSamples([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setSamples(await fetchOilSamples(assetId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSamples([]);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    void loadSamples();
  }, [loadSamples, refreshKey]);

  const orderedSamples = useMemo(
    () => orderOilSamplesBySequence(samples),
    [samples]
  );

  const parentWindowActive = Boolean(
    (windowStart != null && windowStart !== "") ||
      (windowEnd != null && windowEnd !== "")
  );
  const windowActive = parentWindowActive || timeRange !== "ALL";
  const toolbarStart =
    timeRange === "ALL" ? null : dateKeyDaysAgo(RANGE_DAYS[timeRange]);
  const effectiveStart =
    windowStart != null && windowStart !== "" ? windowStart : toolbarStart;

  const windowed = useMemo(
    () =>
      filterOilSamplesToWindow(orderedSamples, effectiveStart, windowEnd),
    [orderedSamples, effectiveStart, windowEnd]
  );

  if (!assetId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 border border-dashed border-slate-700 rounded-lg">
        <p className="text-lg font-semibold">Select an Asset</p>
        <p className="text-sm mt-2">
          Choose a route and asset to analyze oil wear metals.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400">
        Loading oil analysis data...
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">Error: {error}</div>;
  }

  if (samples.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 border border-dashed border-slate-700 rounded-lg">
        <p className="text-lg font-semibold">No Oil Analysis Data</p>
        <p className="text-sm mt-2 text-center max-w-md px-4">
          Click “+ Add Sample” above to upload a lab report image or CSV and
          start trending wear metals.
        </p>
      </div>
    );
  }

  if (windowActive && windowed.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 border border-dashed border-slate-700 rounded-lg">
        <p className="text-lg font-semibold">
          No oil samples in the selected date range
        </p>
        <p className="text-sm mt-2 text-center max-w-md px-4">
          Clear the From / To range or choose “All” to see all{" "}
          {samples.length} saved sample{samples.length === 1 ? "" : "s"}.
        </p>
      </div>
    );
  }

  const latest = windowed[windowed.length - 1];
  const baseline = windowed[0];

  // Stored baseline_* columns are written on whichever row is inserted first,
  // which is not necessarily the oldest sample. Anchor to the chronologically
  // first in-window sample so deltas stay correct for back-dated uploads.
  const baselineFor = (
    stored: number | undefined,
    measured: number
  ): number | undefined =>
    windowed.length > 1 ? (stored ?? measured) : undefined;

  const chartData = windowed.map((s) => ({
    date: formatSampleDate(s.sampleDate, { month: "short", day: "numeric" }),
    Iron: s.iron,
    Copper: s.copper,
    Chromium: s.chromium,
    Silicon: s.silicon
  }));

  const renderCard = (
    label: string,
    value: number,
    limit: number,
    baselineVal?: number
  ) => (
    <div
      className={`p-4 rounded-lg border ${STATUS_STYLES[getThresholdStatus(value, limit)]}`}
    >
      <div className="text-sm opacity-80">{label}</div>
      <div className="text-2xl font-bold mt-1 text-white">
        {value} <span className="text-sm font-normal">PPM</span>
      </div>
      <div className="text-xs mt-2 opacity-75">
        <div>Limit: {limit} PPM</div>
        {baselineVal !== undefined && (
          <>
            <div>
              Δ {calculateBaselineDelta(value, baselineVal).toFixed(1)}% vs
              baseline
            </div>
            <div>
              Rate:{" "}
              {calculateWearRate(
                value,
                baselineVal,
                latest.operatingHours,
                baseline.operatingHours
              ).toFixed(2)}{" "}
              PPM/100h
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Wear Metals &amp; Debris</h2>
          <p className="text-sm text-slate-400 mt-1">
            {interpretWearPattern(latest)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {windowed.length} of {samples.length} samples in range
          </p>
          {windowActive && (
            <p className="text-xs text-slate-500 mt-1">
              Window {effectiveStart || "open start"} &ndash;{" "}
              {windowEnd || "open end"} · {windowed.length} of {samples.length}{" "}
              samples in range
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGE_OPTIONS.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 rounded text-sm cursor-pointer ${
                timeRange === range
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {range === "ALL" ? "All" : range}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {renderCard(
          "Iron (Fe)",
          latest.iron as number,
          latest.ironAlarmLimit,
          baselineFor(baseline.baselineIron, baseline.iron as number)
        )}
        {renderCard(
          "Copper (Cu)",
          latest.copper as number,
          latest.copperAlarmLimit,
          baselineFor(baseline.baselineCopper, baseline.copper as number)
        )}
        {renderCard(
          "Chromium (Cr)",
          latest.chromium as number,
          latest.chromiumAlarmLimit,
          baselineFor(baseline.baselineChromium, baseline.chromium as number)
        )}
        {renderCard(
          "Silicon (Si)",
          latest.silicon as number,
          latest.siliconAlarmLimit,
          undefined
        )}
      </div>

      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          Wear Metal Trends
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Historical concentration of key wear metals (PPM), in range only
        </p>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="rgba(148,163,184,0.1)" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #334155"
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="Iron"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="Copper"
                stroke="#f97316"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="Chromium"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="Silicon"
                stroke="#a855f7"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <ViscosityTanTrendChart samples={windowed} maxPoints={6} />

      <div className="overflow-x-auto border border-slate-700 rounded-lg">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-xs uppercase bg-slate-800 text-slate-400">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">Iron</th>
              <th className="px-4 py-3">Copper</th>
              <th className="px-4 py-3">Chromium</th>
              <th className="px-4 py-3">Silicon</th>
              <th className="px-4 py-3">Visc@40</th>
              <th className="px-4 py-3">TAN</th>
            </tr>
          </thead>
          <tbody>
            {windowed.map((s, idx) => (
              <tr
                key={s.id ?? `${s.sampleDate}-${idx}`}
                className="border-b border-slate-700 hover:bg-slate-800/50"
              >
                <td className="px-4 py-3">{formatSampleDate(s.sampleDate)}</td>
                <td className="px-4 py-3">{s.operatingHours}</td>
                <td className="px-4 py-3 font-mono">{s.iron}</td>
                <td className="px-4 py-3 font-mono">{s.copper}</td>
                <td className="px-4 py-3 font-mono">{s.chromium}</td>
                <td className="px-4 py-3 font-mono">{s.silicon}</td>
                <td className="px-4 py-3 font-mono">
                  {s.viscosity40C != null ? s.viscosity40C : "—"}
                </td>
                <td className="px-4 py-3 font-mono">
                  {s.acidNumber != null ? s.acidNumber : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default OilWearMetalsTab;
