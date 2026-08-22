import React, { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3 } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { VibrationDiagnosticRecord } from "../lib/vibration/vibrationDiagnosticRecord";

const REFERENCE_SPECTRUM = [
  { frequency: 10, amplitude: 0.05 },
  { frequency: 29.6, amplitude: 1.45 },
  { frequency: 59.3, amplitude: 0.85 },
  { frequency: 89.0, amplitude: 0.3 },
  { frequency: 118.5, amplitude: 0.15 },
  { frequency: 145.0, amplitude: 0.4 }
];

function getDiagnosis(order: number): string {
  if (!Number.isFinite(order)) return "Bearing Fault or Other Mechanical Issue";
  if (order >= 0.9 && order <= 1.1) return "Mass Unbalance";
  if (order >= 1.9 && order <= 2.1) return "Angular Misalignment";
  if (order >= 2.9 && order <= 3.1) return "Mechanical Looseness";
  return "Bearing Fault or Other Mechanical Issue";
}

const TOOLTIP_STYLE = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 8,
  fontSize: 12
};

interface SpectralFftWorkspaceProps {
  record: VibrationDiagnosticRecord | null;
}

export default function SpectralFftWorkspace({
  record
}: SpectralFftWorkspaceProps) {
  const [referenceRPM, setReferenceRPM] = useState(
    record?.context?.motorSpeedRPM || record?.rpm || 1780
  );

  useEffect(() => {
    const fromContext = record?.context?.motorSpeedRPM;
    const fromRecord = record?.rpm ?? fromContext;
    if (fromRecord != null && Number.isFinite(fromRecord) && fromRecord > 0) {
      setReferenceRPM(Math.round(fromRecord));
      return;
    }
    setReferenceRPM(1780);
  }, [record?.rpm, record?.context?.motorSpeedRPM, record?.assetId]);

  const isUsingReferenceSpectrum = !(
    record?.spectral && record.spectral.length > 0
  );

  const activeSpectralData = useMemo(() => {
    if (record?.spectral && record.spectral.length > 0) {
      return record.spectral.map((p) => ({
        frequency: p.frequency,
        amplitude: p.amplitude
      }));
    }
    return REFERENCE_SPECTRUM.map((p) => ({ ...p }));
  }, [record]);

  const h1 = referenceRPM / 60;
  const h2 = h1 * 2;
  const h3 = h1 * 3;
  const h4 = h1 * 4;

  const topPeaks = useMemo(() => {
    return [...activeSpectralData]
      .sort((a, b) => b.amplitude - a.amplitude)
      .slice(0, 3)
      .sort((a, b) => a.frequency - b.frequency)
      .map((peak) => ({
        ...peak,
        harmonicOrder: h1 > 0 ? peak.frequency / h1 : 0
      }));
  }, [activeSpectralData, h1]);

  return (
    <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-white inline-flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            Spectral &amp; Harmonics
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Point-in-time FFT with live harmonic cursors · Reference RPM
            workspace
          </p>
        </div>
        {!isUsingReferenceSpectrum && record && (
          <p className="text-[10px] text-slate-500 font-mono">
            {record.spectral.length} live peaks
            {record.timestamp
              ? ` · ${new Date(record.timestamp).toLocaleString()}`
              : ""}
          </p>
        )}
      </div>

      {isUsingReferenceSpectrum && (
        <div className="text-xs text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full inline-flex items-center gap-1 mb-4">
          <Activity className="h-3 w-3 shrink-0" />
          Live data pending. Displaying Interactive Reference Spectrum for
          baseline analysis.
        </div>
      )}

      <div className="flex items-center gap-4 mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
        <span className="text-sm font-semibold text-slate-300 shrink-0">
          Reference RPM:
        </span>
        <input
          type="range"
          min={600}
          max={3600}
          step={10}
          value={referenceRPM}
          onChange={(e) => setReferenceRPM(Number(e.target.value))}
          className="flex-1 accent-cyan-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
        />
        <span className="text-cyan-400 font-mono font-bold w-20 text-right tabular-nums">
          {referenceRPM} RPM
        </span>
      </div>
      <p className="text-[10px] text-slate-500 mb-3 font-mono">
        1X = {h1.toFixed(2)} Hz · 2X = {h2.toFixed(2)} Hz · 3X = {h3.toFixed(2)}{" "}
        Hz · 4X = {h4.toFixed(2)} Hz
      </p>

      <div className="h-[420px] bg-slate-950 rounded-xl border border-slate-700/80 p-3 mb-6">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={activeSpectralData}
            margin={{ top: 28, right: 16, bottom: 28, left: 48 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              type="number"
              dataKey="frequency"
              domain={[0, "dataMax"]}
              stroke="#94a3b8"
              tick={{ fontSize: 10 }}
              label={{
                value: "Frequency (Hz)",
                position: "insideBottom",
                offset: -12,
                fill: "#64748b",
                fontSize: 11
              }}
            />
            <YAxis
              stroke="#38bdf8"
              tick={{ fontSize: 10 }}
              label={{
                value: "Amplitude (mm/s)",
                angle: -90,
                position: "insideLeft",
                fill: "#38bdf8",
                fontSize: 11
              }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [
                `${Number(value).toFixed(3)} mm/s`,
                "Amplitude"
              ]}
              labelFormatter={(label) => `${label} Hz`}
            />
            <ReferenceLine
              x={h1}
              stroke="#38bdf8"
              strokeDasharray="3 3"
              label={{
                value: "1X",
                fill: "#38bdf8",
                position: "top",
                fontSize: 11,
                fontWeight: 700
              }}
            />
            <ReferenceLine
              x={h2}
              stroke="#f59e0b"
              strokeDasharray="3 3"
              label={{
                value: "2X",
                fill: "#f59e0b",
                position: "top",
                fontSize: 11,
                fontWeight: 700
              }}
            />
            <ReferenceLine
              x={h3}
              stroke="#a855f7"
              strokeDasharray="3 3"
              label={{
                value: "3X",
                fill: "#a855f7",
                position: "top",
                fontSize: 11,
                fontWeight: 700
              }}
            />
            <ReferenceLine
              x={h4}
              stroke="#ef4444"
              strokeDasharray="3 3"
              label={{
                value: "4X",
                fill: "#ef4444",
                position: "top",
                fontSize: 11,
                fontWeight: 700
              }}
            />
            <Area
              type="monotone"
              dataKey="amplitude"
              stroke="#38bdf8"
              fill="#38bdf8"
              fillOpacity={0.2}
              isAnimationActive={false}
              name="Amplitude"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-cyan-300">
            Peak Analysis &amp; Physics Proof
          </h4>
          <span className="text-[10px] text-slate-500 font-mono">
            Top 3 amplitude peaks · order = f / 1X
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-950/80 text-slate-400 text-left text-[10px] uppercase tracking-widest">
                <th className="px-4 py-2.5 font-bold">Frequency (Hz)</th>
                <th className="px-4 py-2.5 font-bold">Amplitude (mm/s)</th>
                <th className="px-4 py-2.5 font-bold">Harmonic Order</th>
                <th className="px-4 py-2.5 font-bold">AI Diagnosis</th>
              </tr>
            </thead>
            <tbody>
              {topPeaks.map((peak) => (
                <tr
                  key={`${peak.frequency}-${peak.amplitude}`}
                  className="border-t border-slate-700/80"
                >
                  <td className="px-4 py-3 text-cyan-300 font-mono">
                    {peak.frequency.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-emerald-400 font-mono">
                    {peak.amplitude.toFixed(3)}
                  </td>
                  <td className="px-4 py-3 text-yellow-400 font-mono font-semibold">
                    {peak.harmonicOrder.toFixed(2)}×
                  </td>
                  <td className="px-4 py-3 text-slate-200 font-medium">
                    {getDiagnosis(peak.harmonicOrder)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
