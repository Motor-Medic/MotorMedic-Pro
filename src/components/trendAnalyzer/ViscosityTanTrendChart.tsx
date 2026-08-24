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

export type ViscosityTanSamplePoint = {
  sampleDate: string;
  viscosity40C?: number | null;
  acidNumber?: number | null;
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
  const chartData = samples
    .filter(
      (s) =>
        (s.viscosity40C != null && Number.isFinite(s.viscosity40C)) ||
        (s.acidNumber != null && Number.isFinite(s.acidNumber))
    )
    .slice(-maxPoints)
    .map((s) => ({
      date: new Date(s.sampleDate).toLocaleDateString(undefined, {
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
      <p className="text-sm text-slate-400 mb-4">
        Last {maxPoints} samples with fluid chemistry (cSt @ 40°C · mg KOH/g)
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
    </div>
  );
}

export default ViscosityTanTrendChart;
