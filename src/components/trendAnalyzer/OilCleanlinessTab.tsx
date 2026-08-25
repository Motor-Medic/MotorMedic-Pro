/**
 * Cleanliness & Particle Count — Oil Analysis tab 3.
 *
 * Reads saved oil_samples only. Raw counts are shown only when the lab
 * reported them; they are never back-calculated from ISO codes, and NAS/SAE
 * classes are derived on read rather than stored.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Filter } from "lucide-react";
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
  calculateParticleRatio,
  formatIsoCode,
  formatSampleDate,
  getIsoTriplet,
  isoNotchDelta,
  isoToNasClass,
  isoToSaeClass,
  recommendedFilterBeta,
  type IsoCodeTriplet
} from "../../lib/oilAnalysisMetrics";
import { fetchOilSamples } from "../../lib/oilSampleRow";
import {
  ISO_CLEANLINESS_TARGET,
  type OilSample
} from "../../types/oilAnalysis";

export interface OilCleanlinessTabProps {
  assetId: string;
  /** Bump from parent after Add Sample modal saves to re-fetch. */
  refreshKey?: number;
}

const TARGET = ISO_CLEANLINESS_TARGET as unknown as IsoCodeTriplet;

/** A notch jump this large between samples suggests an ingress/bypass event. */
const NOTCH_ALERT_THRESHOLD = 2;

const CARD_BASE =
  "rounded-lg border border-slate-700 bg-slate-800/40 p-4 flex flex-col gap-1";

function hasRawCounts(s: OilSample): boolean {
  return (
    (s.particles4um != null && Number.isFinite(s.particles4um)) ||
    (s.particles6um != null && Number.isFinite(s.particles6um)) ||
    (s.particles14um != null && Number.isFinite(s.particles14um))
  );
}

function hasAnyCleanlinessData(samples: OilSample[]): boolean {
  return samples.some((s) => getIsoTriplet(s) != null || hasRawCounts(s));
}

/** Positive counts only — a log axis cannot plot 0 or null. */
function logSafe(value: number | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

function formatCount(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}

export function OilCleanlinessTab({
  assetId,
  refreshKey = 0
}: OilCleanlinessTabProps) {
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

  const anyRawCounts = useMemo(() => samples.some(hasRawCounts), [samples]);

  if (!assetId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 border border-dashed border-slate-700 rounded-lg">
        <p className="text-lg font-semibold">Select an Asset</p>
        <p className="text-sm mt-2">
          Choose a route and asset to review oil cleanliness.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400">
        Loading cleanliness data...
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">Error: {error}</div>;
  }

  if (samples.length === 0 || !hasAnyCleanlinessData(samples)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 border border-dashed border-slate-700 rounded-lg">
        <Filter className="h-6 w-6 text-slate-600 mb-3" />
        <p className="text-lg font-semibold">
          {samples.length === 0
            ? "No Oil Analysis Data"
            : "No Cleanliness Data Recorded"}
        </p>
        <p className="text-sm mt-2 text-center max-w-md px-4">
          {samples.length === 0
            ? "Click “+ Add Sample” above to upload a lab report image or CSV."
            : `${samples.length} sample${samples.length === 1 ? "" : "s"} on file, but none include ISO 4406 codes or particle counts. Add a report with cleanliness data via “+ Add Sample”.`}
        </p>
      </div>
    );
  }

  const latest = samples[samples.length - 1];
  const latestIso = getIsoTriplet(latest);

  // Compare against the most recent earlier sample that also has ISO codes.
  const previousIso = (() => {
    for (let i = samples.length - 2; i >= 0; i -= 1) {
      const triplet = getIsoTriplet(samples[i]);
      if (triplet) return { triplet, sample: samples[i] };
    }
    return null;
  })();

  const delta =
    latestIso && previousIso ? isoNotchDelta(previousIso.triplet, latestIso) : null;
  const notchAlert =
    delta != null && delta.some((d) => d >= NOTCH_ALERT_THRESHOLD);

  const atTarget =
    latestIso != null &&
    latestIso[0] <= TARGET[0] &&
    latestIso[1] <= TARGET[1] &&
    latestIso[2] <= TARGET[2];

  const particleRatio = calculateParticleRatio(
    latest.particles4um,
    latest.particles14um
  );

  const chartData = samples.map((s) => {
    const triplet = getIsoTriplet(s);
    return {
      date: formatSampleDate(s.sampleDate, { month: "short", day: "numeric" }),
      p4: logSafe(s.particles4um),
      p6: logSafe(s.particles6um),
      p14: logSafe(s.particles14um),
      iso4: triplet?.[0] ?? null,
      iso6: triplet?.[1] ?? null,
      iso14: triplet?.[2] ?? null
    };
  });

  const tooltipStyle = {
    backgroundColor: "#0f172a",
    border: "1px solid #334155"
  };

  return (
    <div className="space-y-6 p-4">
      <div>
        <h2 className="text-xl font-bold text-white">
          Cleanliness &amp; Particle Count
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Latest sample {formatSampleDate(latest.sampleDate)} ·{" "}
          {latest.operatingHours.toLocaleString()} operating hours
        </p>
      </div>

      {notchAlert && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-300">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">
              Possible filter bypass or ingress event
            </p>
            <p className="text-sm mt-0.5">
              Cleanliness degraded by {NOTCH_ALERT_THRESHOLD}+ ISO notches since{" "}
              {formatSampleDate(previousIso?.sample.sampleDate)}. Check filter
              condition, seals, and breathers.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* ISO code vs target */}
        <div className={CARD_BASE}>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            ISO 4406 (Current)
          </div>
          <div
            className={`text-3xl font-bold font-mono ${latestIso ? "text-white" : "text-slate-600"}`}
          >
            {formatIsoCode(latestIso)}
          </div>
          <div className="text-xs text-slate-500">
            Target {TARGET.join("/")} · &gt;4μm / &gt;6μm / &gt;14μm
          </div>
          {latestIso && (
            <div
              className={`mt-2 inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${
                atTarget
                  ? "border-green-500/40 bg-green-500/10 text-green-300"
                  : "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
              }`}
            >
              {atTarget ? "At or below target" : "Above target"}
            </div>
          )}
        </div>

        {/* Notch delta */}
        <div className={CARD_BASE}>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Change Since Last Sample
          </div>
          {delta ? (
            <>
              <div
                className={`text-2xl font-bold font-mono ${
                  notchAlert
                    ? "text-red-400"
                    : delta.some((d) => d > 0)
                      ? "text-yellow-300"
                      : "text-green-400"
                }`}
              >
                {delta
                  .map((d) => (d > 0 ? `+${d}` : String(d)))
                  .join(" / ")}
              </div>
              <div className="text-xs text-slate-500">
                notches vs {formatSampleDate(previousIso?.sample.sampleDate)}
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-slate-600">—</div>
              <div className="text-xs text-slate-500">
                Needs two samples with ISO codes
              </div>
            </>
          )}
        </div>

        {/* NAS / SAE equivalency */}
        <div className={CARD_BASE}>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Reference Equivalency
          </div>
          <div
            className={`text-2xl font-bold ${latestIso ? "text-white" : "text-slate-600"}`}
          >
            {latestIso
              ? `NAS 1638 ~ ${isoToNasClass(latestIso[1])} | SAE AS4059 ~ ${isoToSaeClass(latestIso[1])}`
              : "—"}
          </div>
          <div className="text-xs text-slate-500">
            Reference equivalency, not certified conversion
          </div>
        </div>

        {/* Siltation vs spalling */}
        <div className={CARD_BASE}>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Fine / Coarse Ratio
          </div>
          <div
            className={`text-2xl font-bold ${particleRatio.ratio != null ? "text-white" : "text-slate-600"}`}
          >
            {particleRatio.ratio != null
              ? `${particleRatio.ratio.toFixed(1)}:1`
              : "—"}
          </div>
          <div className="text-xs text-slate-500">
            {particleRatio.diagnosis}
          </div>
        </div>

        {/* Filtration recommendation */}
        <div className={`${CARD_BASE} md:col-span-2`}>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Recommended Filtration
          </div>
          <div
            className={`text-base font-semibold ${latestIso ? "text-cyan-300" : "text-slate-600"}`}
          >
            {latestIso ? recommendedFilterBeta(latestIso, TARGET) : "—"}
          </div>
          <div className="text-xs text-slate-500">
            {latestIso
              ? `Based on worst-channel overshoot against target ${TARGET.join("/")}`
              : "ISO codes not reported"}
          </div>
        </div>
      </div>

      {/* Trend chart: raw counts when available, ISO codes otherwise */}
      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          {anyRawCounts ? "Particle Count Trend" : "ISO 4406 Code Trend"}
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          {anyRawCounts
            ? "Particles per mL by channel (logarithmic scale)"
            : "Raw counts not recorded — plotting ISO 4406 codes"}
        </p>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 24, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                stroke="rgba(148,163,184,0.1)"
                strokeDasharray="3 3"
              />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              {anyRawCounts ? (
                <YAxis
                  stroke="#94a3b8"
                  fontSize={12}
                  width={64}
                  scale="log"
                  domain={[1, "auto"]}
                  allowDataOverflow={false}
                  tickFormatter={(v: number) => v.toLocaleString()}
                />
              ) : (
                <YAxis
                  stroke="#94a3b8"
                  fontSize={12}
                  width={44}
                  domain={["dataMin - 1", "dataMax + 1"]}
                  allowDecimals={false}
                />
              )}
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => {
                  if (value == null || !Number.isFinite(Number(value))) {
                    return ["—", String(name)];
                  }
                  const n = Number(value);
                  return anyRawCounts
                    ? [`${Math.round(n).toLocaleString()} /mL`, String(name)]
                    : [`code ${n}`, String(name)];
                }}
              />
              <Legend
                // Recharts sorts legend entries alphabetically by name, which
                // puts ">14μm" ahead of ">4μm". Force industry channel order.
                content={({ payload }) => {
                  const order = anyRawCounts
                    ? [">4μm", ">6μm", ">14μm"]
                    : ["ISO >4μm", "ISO >6μm", "ISO >14μm"];
                  const items = [...(payload ?? [])].sort(
                    (a, b) =>
                      order.indexOf(String(a.value)) -
                      order.indexOf(String(b.value))
                  );
                  return (
                    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-xs text-slate-300">
                      {items.map((entry) => (
                        <li
                          key={String(entry.value)}
                          className="inline-flex items-center gap-1.5"
                        >
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: entry.color }}
                          />
                          {entry.value}
                        </li>
                      ))}
                    </ul>
                  );
                }}
              />
              {anyRawCounts ? (
                <>
                  <Line
                    type="monotone"
                    dataKey="p4"
                    name=">4μm"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#38bdf8" }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="p6"
                    name=">6μm"
                    stroke="#a855f7"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#a855f7" }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="p14"
                    name=">14μm"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#ef4444" }}
                    connectNulls
                  />
                </>
              ) : (
                <>
                  <Line
                    type="monotone"
                    dataKey="iso4"
                    name="ISO >4μm"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#38bdf8" }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="iso6"
                    name="ISO >6μm"
                    stroke="#a855f7"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#a855f7" }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="iso14"
                    name="ISO >14μm"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#ef4444" }}
                    connectNulls
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Standards table */}
      <div className="overflow-x-auto border border-slate-700 rounded-lg">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-xs uppercase bg-slate-800 text-slate-400">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">ISO 4406</th>
              <th className="px-4 py-3">~NAS</th>
              <th className="px-4 py-3">~SAE</th>
              <th className="px-4 py-3 normal-case">&gt;4μm /mL</th>
              <th className="px-4 py-3 normal-case">&gt;6μm /mL</th>
              <th className="px-4 py-3 normal-case">&gt;14μm /mL</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((s, idx) => {
              const triplet = getIsoTriplet(s);
              return (
                <tr
                  key={s.id ?? `${s.sampleDate}-${idx}`}
                  className="border-b border-slate-700 hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3">{formatSampleDate(s.sampleDate)}</td>
                  <td className="px-4 py-3">
                    {s.operatingHours.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {formatIsoCode(triplet)}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {triplet ? isoToNasClass(triplet[1]) : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {triplet ? isoToSaeClass(triplet[1]) : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {formatCount(s.particles4um)}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {formatCount(s.particles6um)}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {formatCount(s.particles14um)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-4 py-3 text-xs text-slate-500 border-t border-slate-700">
          NAS 1638 and SAE AS4059 columns are reference equivalencies derived
          from the ISO &gt;6μm code, not certified conversions.
        </p>
      </div>
    </div>
  );
}

export default OilCleanlinessTab;
