/**
 * Fluid Chemistry & Contamination — Oil Analysis tab 2.
 *
 * Reads saved oil_samples only. Every value is either measured or shown as
 * "—"; nothing on this tab is generated, defaulted, or mocked.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Droplets } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  formatIsoCode,
  formatSampleDate,
  getIsoTriplet,
  noriaLifeExtensionFactor,
  projectTanTbnCrossover,
  waterPhaseAlert
} from "../../lib/oilAnalysisMetrics";
import { fetchOilSamples } from "../../lib/oilSampleRow";
import {
  ISO_CLEANLINESS_TARGET,
  type OilSample
} from "../../types/oilAnalysis";

export interface OilFluidChemistryTabProps {
  assetId: string;
  /** Bump from parent after Add Sample modal saves to re-fetch. */
  refreshKey?: number;
}

/** Fields this tab renders — used to decide whether any data exists at all. */
const CHEMISTRY_FIELDS = [
  "viscosity40C",
  "viscosity100C",
  "viscosityIndex",
  "acidNumber",
  "tbn",
  "waterPpm",
  "oxidation",
  "nitration",
  "iso4um",
  "iso6um",
  "iso14um"
] as const satisfies readonly (keyof OilSample)[];

function hasAnyChemistry(samples: OilSample[]): boolean {
  return samples.some((s) =>
    CHEMISTRY_FIELDS.some((f) => s[f] != null && Number.isFinite(s[f]))
  );
}

/** Render a measured number, or an em dash when the lab did not report it. */
function display(
  value: number | undefined,
  digits = 2,
  suffix = ""
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

const CARD_BASE =
  "rounded-lg border border-slate-700 bg-slate-800/40 p-4 flex flex-col gap-1";

function SummaryCard({
  label,
  value,
  unit,
  note
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
}) {
  const measured = value !== "—";
  return (
    <div className={CARD_BASE}>
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div
        className={`text-2xl font-bold ${measured ? "text-white" : "text-slate-600"}`}
      >
        {value}
        {measured && unit ? (
          <span className="ml-1 text-sm font-normal text-slate-400">
            {unit}
          </span>
        ) : null}
      </div>
      {note ? <div className="text-xs text-slate-500">{note}</div> : null}
    </div>
  );
}

export function OilFluidChemistryTab({
  assetId,
  refreshKey = 0
}: OilFluidChemistryTabProps) {
  const [samples, setSamples] = useState<OilSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (!assetId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 border border-dashed border-slate-700 rounded-lg">
        <p className="text-lg font-semibold">Select an Asset</p>
        <p className="text-sm mt-2">
          Choose a route and asset to review fluid chemistry.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400">
        Loading fluid chemistry data...
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">Error: {error}</div>;
  }

  if (samples.length === 0 || !hasAnyChemistry(samples)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 border border-dashed border-slate-700 rounded-lg">
        <Droplets className="h-6 w-6 text-slate-600 mb-3" />
        <p className="text-lg font-semibold">
          {samples.length === 0
            ? "No Oil Analysis Data"
            : "No Fluid Chemistry Recorded"}
        </p>
        <p className="text-sm mt-2 text-center max-w-md px-4">
          {samples.length === 0
            ? "Click “+ Add Sample” above to upload a lab report image or CSV."
            : `${samples.length} sample${samples.length === 1 ? "" : "s"} on file, but none include viscosity, TAN/TBN, water, oxidation, or ISO particle counts. Add a report with fluid chemistry via “+ Add Sample”.`}
        </p>
      </div>
    );
  }

  const latest = samples[samples.length - 1];
  const waterAlert = waterPhaseAlert(latest.waterPpm);
  const crossover = projectTanTbnCrossover(samples);

  const currentIso = getIsoTriplet(latest);
  const target = ISO_CLEANLINESS_TARGET as unknown as [number, number, number];
  const lifeExtension = currentIso
    ? noriaLifeExtensionFactor(currentIso, target)
    : null;

  const chartData = samples.map((s) => ({
    date: formatSampleDate(s.sampleDate, { month: "short", day: "numeric" }),
    hours: s.operatingHours,
    viscosity: s.viscosity40C ?? null,
    oxidation: s.oxidation ?? null,
    tan: s.acidNumber ?? null,
    tbn: s.tbn ?? null
  }));

  const tooltipStyle = {
    backgroundColor: "#0f172a",
    border: "1px solid #334155"
  };

  // Anchor the crossover marker on the last point that has both TAN and TBN.
  const lastTanTbnIndex = (() => {
    for (let i = chartData.length - 1; i >= 0; i -= 1) {
      if (chartData[i].tan != null && chartData[i].tbn != null) return i;
    }
    return -1;
  })();
  const showCrossoverDot =
    crossover.status === "projected" && lastTanTbnIndex >= 0;

  return (
    <div className="space-y-6 p-4">
      <div>
        <h2 className="text-xl font-bold text-white">
          Fluid Chemistry &amp; Contamination
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Latest sample {formatSampleDate(latest.sampleDate)} ·{" "}
          {latest.operatingHours.toLocaleString()} operating hours
        </p>
      </div>

      {waterAlert && (
        <div
          className={`flex items-start gap-3 rounded-lg border p-4 ${
            (latest.waterPpm ?? 0) > 500
              ? "border-red-500/40 bg-red-500/10 text-red-300"
              : "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
          }`}
        >
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Water Contamination</p>
            <p className="text-sm mt-0.5">{waterAlert}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <SummaryCard
          label="Viscosity @40°C"
          value={display(latest.viscosity40C, 1)}
          unit="cSt"
        />
        <SummaryCard label="TAN" value={display(latest.acidNumber, 2)} unit="mg KOH/g" />
        <SummaryCard label="TBN" value={display(latest.tbn, 2)} unit="mg KOH/g" />
        <SummaryCard
          label="Water"
          value={display(latest.waterPpm, 0)}
          unit="ppm"
          note={waterAlert ? "Above advisory limit" : undefined}
        />
        <SummaryCard
          label="Oxidation"
          value={display(latest.oxidation, 2)}
          unit="Abs/cm"
        />
        <SummaryCard
          label="Nitration"
          value={display(latest.nitration, 2)}
          unit="Abs/cm"
        />
      </div>

      {/* Viscosity vs Oxidation */}
      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          Viscosity vs. Oxidation
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Base oil degradation — viscosity (cSt @ 40°C) against oxidation
          (Abs/cm)
        </p>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(148,163,184,0.1)" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              <YAxis
                yAxisId="left"
                stroke="#eab308"
                fontSize={12}
                width={52}
                unit=" cSt"
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#f97316"
                fontSize={12}
                width={44}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => {
                  if (value == null || !Number.isFinite(Number(value))) {
                    return ["—", String(name)];
                  }
                  const n = Number(value);
                  if (name === "Viscosity @40°C") {
                    return [`${n.toFixed(1)} cSt`, String(name)];
                  }
                  if (name === "Oxidation") {
                    return [`${n.toFixed(2)} Abs/cm`, String(name)];
                  }
                  return [n, String(name)];
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
                dataKey="oxidation"
                name="Oxidation"
                stroke="#f97316"
                strokeWidth={2}
                dot={{ r: 3, fill: "#f97316" }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TAN vs TBN with crossover projection */}
      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          TAN vs. TBN
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Acid buildup against remaining alkaline reserve (mg KOH/g)
        </p>

        {crossover.status === "exceeded" && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-300">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm font-semibold">
              TAN has crossed TBN — schedule fluid replacement.
            </p>
          </div>
        )}
        {crossover.status === "projected" && (
          <p className="mb-4 text-sm text-yellow-300">
            Projected crossover at approximately{" "}
            <span className="font-bold">
              {Math.round(crossover.projectedAtHours ?? 0).toLocaleString()}
            </span>{" "}
            operating hours (linear trend estimate).
          </p>
        )}
        {crossover.status === "none" && (
          <p className="mb-4 text-sm text-slate-400">
            No crossover projected on current trend.
          </p>
        )}

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 40, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(148,163,184,0.1)" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} width={48} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Line
                type="monotone"
                dataKey="tan"
                name="TAN"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3, fill: "#ef4444" }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="tbn"
                name="TBN"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 3, fill: "#22c55e" }}
                connectNulls
              />
              {showCrossoverDot && (
                <ReferenceDot
                  x={chartData[lastTanTbnIndex].date}
                  y={chartData[lastTanTbnIndex].tan as number}
                  r={6}
                  fill="#facc15"
                  stroke="#0f172a"
                  strokeWidth={2}
                  label={{
                    value: "Projected Crossover",
                    position: "top",
                    fill: "#facc15",
                    fontSize: 11
                  }}
                  ifOverflow="extendDomain"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Noria cleanliness */}
      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          ISO 4406 Cleanliness
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Current particle count against the Noria target for general
          industrial service
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className={CARD_BASE}>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Current
            </div>
            <div
              className={`text-2xl font-bold font-mono ${currentIso ? "text-white" : "text-slate-600"}`}
            >
              {formatIsoCode(currentIso)}
            </div>
            <div className="text-xs text-slate-500">&gt;4µm / &gt;6µm / &gt;14µm</div>
          </div>
          <div className={CARD_BASE}>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Target
            </div>
            <div className="text-2xl font-bold font-mono text-cyan-300">
              {target.join("/")}
            </div>
            <div className="text-xs text-slate-500">Noria recommended</div>
          </div>
          <div className={CARD_BASE}>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Est. Life Extension
            </div>
            <div
              className={`text-2xl font-bold ${lifeExtension != null ? "text-green-400" : "text-slate-600"}`}
            >
              {lifeExtension != null ? `${lifeExtension}×` : "—"}
            </div>
            <div className="text-xs text-slate-500">
              {lifeExtension != null
                ? "Estimate if target reached"
                : "ISO codes not reported"}
            </div>
          </div>
        </div>
        {lifeExtension != null && (
          <p className="mt-3 text-xs text-slate-500">
            Estimated life extension if target reached: {lifeExtension}× —
            planning estimate based on Noria contamination-control research
            (~1.25× component life per ISO code reduction), not a guarantee.
          </p>
        )}
      </div>

      {/* Chronological table */}
      <div className="overflow-x-auto border border-slate-700 rounded-lg">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-xs uppercase bg-slate-800 text-slate-400">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">Visc @40</th>
              <th className="px-4 py-3">TAN</th>
              <th className="px-4 py-3">TBN</th>
              <th className="px-4 py-3">Water</th>
              <th className="px-4 py-3">Oxidation</th>
              <th className="px-4 py-3">ISO 4406</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((s, idx) => (
              <tr
                key={s.id ?? `${s.sampleDate}-${idx}`}
                className="border-b border-slate-700 hover:bg-slate-800/50"
              >
                <td className="px-4 py-3">{formatSampleDate(s.sampleDate)}</td>
                <td className="px-4 py-3">
                  {s.operatingHours.toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono">
                  {display(s.viscosity40C, 1)}
                </td>
                <td className="px-4 py-3 font-mono">
                  {display(s.acidNumber, 2)}
                </td>
                <td className="px-4 py-3 font-mono">{display(s.tbn, 2)}</td>
                <td className="px-4 py-3 font-mono">
                  {display(s.waterPpm, 0)}
                </td>
                <td className="px-4 py-3 font-mono">
                  {display(s.oxidation, 2)}
                </td>
                <td className="px-4 py-3 font-mono">
                  {formatIsoCode(getIsoTriplet(s))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default OilFluidChemistryTab;
