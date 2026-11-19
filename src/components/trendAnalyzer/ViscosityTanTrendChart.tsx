/**
 * Viscosity vs TAN dual-axis trend — Recharts only.
 * Data comes from saved oil_samples (viscosity_40c / acid_number), not mocks.
 */

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
import { formatSampleDate } from "../../lib/oilAnalysisMetrics";
import { viscosityTanPairCompleteness } from "../../lib/oilTribologyGuidance";

export type ViscosityTanSamplePoint = {
  sampleDate: string;
  viscosity40C?: number | null;
  acidNumber?: number | null;
  operatingHours?: number | null;
};

export interface ViscosityTanTrendChartProps {
  samples: ViscosityTanSamplePoint[];
  /** Show at most N most recent samples (default 6). */
  maxPoints?: number;
}

export function ViscosityTanTrendChart({
  samples,
  maxPoints = 6
}: ViscosityTanTrendChartProps) {
  const visibleSamples = samples
    .filter(
      (s) =>
        (s.viscosity40C != null && Number.isFinite(s.viscosity40C)) ||
        (s.acidNumber != null && Number.isFinite(s.acidNumber))
    )
    .slice(-maxPoints);

  // Pair-completeness is keyed off the same visible rows as the plot, so a TAN
  // point without Visc@40 / operating hours is marked as a GAP in place.
  const pairPoints = viscosityTanPairCompleteness(visibleSamples);

  const chartData = visibleSamples.map((s) => ({
    date: formatSampleDate(s.sampleDate, {
      month: "short",
      day: "numeric",
      year: "2-digit"
    }),
    viscosity: s.viscosity40C ?? null,
    tan: s.acidNumber ?? null
  }));

  return (
    <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
      <h3 className="text-lg font-semibold text-white mb-1">
        Viscosity vs. TAN Trend
      </h3>
      <p className="text-sm text-slate-400 mb-1">
        Last {maxPoints} samples with fluid chemistry (cSt @ 40°C · mg KOH/g)
      </p>
      <p className="text-[11px] text-slate-500 mb-4">
        Descriptive time trend of stored within-sample pairs; no projection or
        extrapolation.
      </p>

      {chartData.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-700 rounded-lg">
          <p className="text-sm font-semibold text-slate-400">
            No viscosity / TAN history yet
          </p>
          <p className="text-xs mt-1 text-center max-w-sm px-4">
            Add samples via “+ Add Sample” (vision or CSV with viscosity40C /
            acidNumber columns) to populate this chart.
          </p>
        </div>
      ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="rgba(148,163,184,0.1)" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              <YAxis
                yAxisId="left"
                stroke="#94a3b8"
                fontSize={12}
                unit=" cSt"
                width={48}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#94a3b8"
                fontSize={12}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #334155"
                }}
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="viscosity"
                name="Viscosity @40°C"
                stroke="#eab308"
                strokeWidth={2}
                dot={{ r: 3, fill: "#eab308" }}
                connectNulls
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="tan"
                name="TAN"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3, fill: "#ef4444" }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {chartData.length > 0 && (
        <div className="mt-4 border-t border-slate-700 pt-3">
          <p className="text-[11px] text-slate-500 mb-2">
            Pair completeness: a TAN point without Visc@40 or operating hours is
            a GAP, not a trend. Missing readings stay “—”.
          </p>
          <ul className="space-y-1">
            {pairPoints.map((point, index) => {
              const gap = point.hasTan && !point.isCompletePair;
              const gapReasons = [
                point.hasTan && !point.hasViscosity ? "Visc@40 missing" : null,
                point.hasTan && !point.hasOperatingHours
                  ? "operating hours missing"
                  : null
              ].filter((reason): reason is string => reason != null);

              return (
                <li
                  key={`${point.date}-${index}`}
                  className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400"
                >
                  <span>{formatSampleDate(point.date)}</span>
                  {gap && (
                    <span className="rounded border border-yellow-400/30 bg-yellow-400/10 px-1.5 py-0.5 font-semibold text-yellow-400">
                      GAP
                    </span>
                  )}
                  <span className="font-mono">
                    Visc@40 {point.hasViscosity ? "reported" : "—"} · TAN{" "}
                    {point.hasTan ? "reported" : "—"} · Hours{" "}
                    {point.hasOperatingHours ? "reported" : "—"}
                  </span>
                  {gap && (
                    <span className="text-slate-500">
                      lone TAN point ({gapReasons.join(", ")}) — read as a gap,
                      not a trend.
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ViscosityTanTrendChart;
