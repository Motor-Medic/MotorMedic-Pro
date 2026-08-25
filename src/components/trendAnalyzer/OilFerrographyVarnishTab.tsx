/**
 * Ferrography & Varnish — Oil Analysis tab 4.
 *
 * Reads saved oil_samples only. DR indices are derived from drLarge/drSmall at
 * render time; every unmeasured field renders as "—" rather than a placeholder
 * number.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ImageOff, Microscope } from "lucide-react";
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
  MORPH_CATEGORIES,
  detectMorphologyTransitions,
  drFerroIndices,
  formatSampleDate,
  linearRatePerHour,
  mpcBand,
  primaryMorphology,
  projectHoursToThreshold,
  rulerBand,
  varnishRiskIndex,
  type MorphSeverity,
  type MpcBand,
  type RulerBand
} from "../../lib/oilAnalysisMetrics";
import { fetchOilSamples } from "../../lib/oilSampleRow";
import type { OilSample } from "../../types/oilAnalysis";

export interface OilFerrographyVarnishTabProps {
  assetId: string;
  /** Bump from parent after Add Sample modal saves to re-fetch. */
  refreshKey?: number;
}

/** Varnish onset thresholds used for the projection panel. */
const MPC_ONSET = 30;
const RULER_ONSET = 25;

const CARD_BASE =
  "rounded-lg border border-slate-700 bg-slate-800/40 p-4 flex flex-col gap-1";

const MPC_BAND_STYLES: Record<MpcBand, string> = {
  good: "border-green-500/40 bg-green-500/10 text-green-300",
  monitor: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  abnormal: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  critical: "border-red-500/40 bg-red-500/10 text-red-300"
};

const RULER_BAND_STYLES: Record<RulerBand, string> = {
  healthy: "border-green-500/40 bg-green-500/10 text-green-300",
  monitor: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  warning: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  critical: "border-red-500/40 bg-red-500/10 text-red-300"
};

const SEVERITY_STYLES: Record<MorphSeverity, string> = {
  not_detected: "border-slate-700 bg-slate-800/60 text-slate-500",
  trace: "border-slate-600 bg-slate-700/40 text-slate-300",
  mild: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  moderate: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  severe: "border-red-500/40 bg-red-500/10 text-red-300"
};

const SEVERITY_LABELS: Record<MorphSeverity, string> = {
  not_detected: "Not detected",
  trace: "Trace",
  mild: "Mild",
  moderate: "Moderate",
  severe: "Severe"
};

function hasFerrographyData(s: OilSample): boolean {
  return (
    s.drLarge != null ||
    s.drSmall != null ||
    s.mpcDeltaE != null ||
    s.rulerPercent != null ||
    s.ucRating != null ||
    s.ferrographImageUrl != null ||
    (s.morphology != null && Object.keys(s.morphology).length > 0)
  );
}

function display(value: number | undefined, digits = 1, suffix = ""): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

function StatusBadge({ text, styles }: { text: string; styles: string }) {
  return (
    <span
      className={`mt-1 inline-flex w-fit rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles}`}
    >
      {text}
    </span>
  );
}

/** Human-readable projection line for one varnish indicator. */
function projectionText(
  label: string,
  unit: string,
  threshold: number,
  current: number | undefined,
  hoursToThreshold: number | null,
  latestHours: number
): string {
  if (current == null || !Number.isFinite(current)) {
    return `${label}: not measured — cannot project.`;
  }
  if (hoursToThreshold == null) {
    return `${label}: no onset projected on current trend (now ${current}${unit}).`;
  }
  if (hoursToThreshold <= 0) {
    return `${label}: already past ${threshold}${unit} (now ${current}${unit}).`;
  }
  const atHours = Math.round(latestHours + hoursToThreshold);
  return `${label} projected to cross ${threshold}${unit} at ~${atHours.toLocaleString()} operating hours (in ~${Math.round(hoursToThreshold).toLocaleString()} h).`;
}

export function OilFerrographyVarnishTab({
  assetId,
  refreshKey = 0
}: OilFerrographyVarnishTabProps) {
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

  const anyDrData = useMemo(
    () => samples.some((s) => s.drLarge != null && s.drSmall != null),
    [samples]
  );

  if (!assetId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 border border-dashed border-slate-700 rounded-lg">
        <p className="text-lg font-semibold">Select an Asset</p>
        <p className="text-sm mt-2">
          Choose a route and asset to review ferrography and varnish.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400">
        Loading ferrography data...
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">Error: {error}</div>;
  }

  if (samples.length === 0 || !samples.some(hasFerrographyData)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 border border-dashed border-slate-700 rounded-lg">
        <Microscope className="h-6 w-6 text-slate-600 mb-3" />
        <p className="text-lg font-semibold">
          {samples.length === 0
            ? "No Oil Analysis Data"
            : "No Ferrography or Varnish Data"}
        </p>
        <p className="text-sm mt-2 text-center max-w-md px-4">
          {samples.length === 0
            ? "Click “+ Add Sample” above to upload a lab report image or CSV."
            : `${samples.length} sample${samples.length === 1 ? "" : "s"} on file, but none include MPC, RULER, DR ferrography, or wear morphology. Add a report with these tests via “+ Add Sample”.`}
        </p>
      </div>
    );
  }

  const latest = samples[samples.length - 1];
  const dr = drFerroIndices(latest.drLarge, latest.drSmall);
  const riskIndex = varnishRiskIndex(latest.mpcDeltaE, latest.rulerPercent);

  // Rates measured only across samples that actually carry the reading.
  const mpcPoints = samples
    .filter((s) => s.mpcDeltaE != null && Number.isFinite(s.mpcDeltaE))
    .map((s) => ({ hours: s.operatingHours, value: s.mpcDeltaE as number }));
  const rulerPoints = samples
    .filter((s) => s.rulerPercent != null && Number.isFinite(s.rulerPercent))
    .map((s) => ({ hours: s.operatingHours, value: s.rulerPercent as number }));

  const mpcRate = linearRatePerHour(mpcPoints);
  const rulerRate = linearRatePerHour(rulerPoints);

  const mpcHours =
    latest.mpcDeltaE != null
      ? projectHoursToThreshold(latest.mpcDeltaE, mpcRate, MPC_ONSET, "rising")
      : null;
  const rulerHours =
    latest.rulerPercent != null
      ? projectHoursToThreshold(
          latest.rulerPercent,
          rulerRate,
          RULER_ONSET,
          "falling"
        )
      : null;

  // Morphology transitions compare against the previous sample that recorded any.
  const previousMorphSample = (() => {
    for (let i = samples.length - 2; i >= 0; i -= 1) {
      const m = samples[i].morphology;
      if (m && Object.keys(m).length > 0) return samples[i];
    }
    return null;
  })();
  const transitions = latest.morphology
    ? detectMorphologyTransitions(
        previousMorphSample?.morphology ?? null,
        latest.morphology
      )
    : [];

  const chartData = samples.map((s) => {
    const indices = drFerroIndices(s.drLarge, s.drSmall);
    return {
      date: formatSampleDate(s.sampleDate, { month: "short", day: "numeric" }),
      mpc: s.mpcDeltaE ?? null,
      ruler: s.rulerPercent ?? null,
      wpc: indices?.wpc ?? null,
      wsi: indices?.wsi ?? null
    };
  });

  const tooltipStyle = {
    backgroundColor: "#0f172a",
    border: "1px solid #334155"
  };

  const imageSamples = samples.filter((s) => s.ferrographImageUrl);
  const compareImages = imageSamples.slice(-2);

  return (
    <div className="space-y-6 p-4">
      <div>
        <h2 className="text-xl font-bold text-white">
          Ferrography &amp; Varnish
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Latest sample {formatSampleDate(latest.sampleDate)} ·{" "}
          {latest.operatingHours.toLocaleString()} operating hours
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className={CARD_BASE}>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            MPC ΔE (ASTM D7843)
          </div>
          <div
            className={`text-3xl font-bold ${latest.mpcDeltaE != null ? "text-white" : "text-slate-600"}`}
          >
            {display(latest.mpcDeltaE, 1)}
          </div>
          {latest.mpcDeltaE != null ? (
            <StatusBadge
              text={mpcBand(latest.mpcDeltaE)}
              styles={MPC_BAND_STYLES[mpcBand(latest.mpcDeltaE)]}
            />
          ) : (
            <div className="text-xs text-slate-500">Not measured</div>
          )}
        </div>

        <div className={CARD_BASE}>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            RULER % (ASTM D6971)
          </div>
          <div
            className={`text-3xl font-bold ${latest.rulerPercent != null ? "text-white" : "text-slate-600"}`}
          >
            {display(latest.rulerPercent, 0, "%")}
          </div>
          {latest.rulerPercent != null ? (
            <StatusBadge
              text={rulerBand(latest.rulerPercent)}
              styles={RULER_BAND_STYLES[rulerBand(latest.rulerPercent)]}
            />
          ) : (
            <div className="text-xs text-slate-500">Not measured</div>
          )}
        </div>

        <div className={CARD_BASE}>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Ultra-Centrifuge Rating{" "}
            <span className="normal-case text-slate-600">(0-8 scale)</span>
          </div>
          <div
            className={`text-3xl font-bold ${latest.ucRating != null ? "text-white" : "text-slate-600"}`}
          >
            {latest.ucRating != null ? latest.ucRating : "—"}
            {latest.ucRating != null && (
              <span className="ml-1 text-sm font-normal text-slate-400">
                / 8
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500">
            {latest.ucRating != null
              ? "0-8 scale · 0 = clean, 8 = heavy insolubles"
              : "Not measured (0-8 scale)"}
          </div>
        </div>

        {/* DR ferrography */}
        <div className={`${CARD_BASE} sm:col-span-2`}>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            DR Ferrography
          </div>
          {dr ? (
            <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-[11px] uppercase text-slate-500">WPC</div>
                <div className="text-xl font-bold text-white font-mono">
                  {dr.wpc.toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-slate-500">WSI</div>
                <div className="text-xl font-bold text-white font-mono">
                  {dr.wsi.toFixed(0)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-slate-500">PLP</div>
                <div className="text-xl font-bold text-white font-mono">
                  {dr.plp}%
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-slate-500">
                  DL/DS
                </div>
                <div className="text-xl font-bold text-white font-mono">
                  {dr.dlDsRatio != null ? dr.dlDsRatio.toFixed(2) : "—"}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold text-slate-600">—</div>
              <div className="text-xs text-slate-500">
                Needs both DL and DS densities
              </div>
            </>
          )}
          <p className="mt-2 border-t border-slate-700/60 pt-2 font-mono text-[11px] leading-relaxed text-slate-500">
            WPC = DL + DS | WSI = DL² - DS² | PLP = (DL - DS) / (DL + DS) × 100
          </p>
        </div>

        {/* Composite varnish risk */}
        <div className={CARD_BASE}>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Varnish Risk Index
          </div>
          {riskIndex != null ? (
            <>
              <div
                className={`text-3xl font-bold ${
                  riskIndex >= 70
                    ? "text-red-400"
                    : riskIndex >= 40
                      ? "text-yellow-300"
                      : "text-green-400"
                }`}
              >
                {riskIndex}
                <span className="ml-1 text-sm font-normal text-slate-400">
                  / 100
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                <div
                  className={`h-full rounded-full ${
                    riskIndex >= 70
                      ? "bg-red-500"
                      : riskIndex >= 40
                        ? "bg-yellow-400"
                        : "bg-green-500"
                  }`}
                  style={{ width: `${riskIndex}%` }}
                />
              </div>
              <div className="text-xs text-slate-500">
                Equal weight MPC and RULER depletion
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-slate-600">—</div>
              <div className="text-xs text-slate-500">
                Insufficient data (needs MPC + RULER)
              </div>
            </>
          )}
        </div>
      </div>

      {/* Varnish onset projection */}
      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          Varnish Onset Projection
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Linear trend across samples carrying each reading — planning estimate,
          not a guarantee
        </p>
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2 text-slate-300">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-400" />
            {projectionText(
              "MPC ΔE",
              " ΔE",
              MPC_ONSET,
              latest.mpcDeltaE,
              mpcHours,
              latest.operatingHours
            )}
          </li>
          <li className="flex items-start gap-2 text-slate-300">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
            {projectionText(
              "RULER",
              "%",
              RULER_ONSET,
              latest.rulerPercent,
              rulerHours,
              latest.operatingHours
            )}
          </li>
        </ul>
        <p className="mt-4 border-t border-slate-700/60 pt-3 text-xs leading-relaxed text-slate-500">
          Projections use linear rates from stored samples; MPC target 30 ΔE =
          varnish-onset threshold (default bands). No projection is shown when
          the trend does not converge.
        </p>
      </div>

      {/* Varnish potential trend */}
      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          Varnish Potential Trend
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Varnish formed (MPC ΔE) against remaining antioxidant (RULER %)
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
              <YAxis
                yAxisId="left"
                stroke="#eab308"
                fontSize={12}
                width={48}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#38bdf8"
                fontSize={12}
                width={48}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => {
                  if (value == null || !Number.isFinite(Number(value))) {
                    return ["—", String(name)];
                  }
                  const n = Number(value);
                  return name === "MPC ΔE"
                    ? [`${n.toFixed(1)} ΔE`, String(name)]
                    : [`${n.toFixed(0)}%`, String(name)];
                }}
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="mpc"
                name="MPC ΔE"
                stroke="#eab308"
                strokeWidth={2}
                dot={{ r: 3, fill: "#eab308" }}
                connectNulls
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="ruler"
                name="RULER %"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={{ r: 3, fill: "#38bdf8" }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DR ferrograph trend — only when DL/DS exist */}
      {anyDrData && (
        <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
          <h3 className="text-lg font-semibold text-white mb-1">
            DR Ferrograph Trend
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            Wear Particle Concentration and Wear Severity Index over time
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
                <YAxis
                  yAxisId="left"
                  stroke="#a855f7"
                  fontSize={12}
                  width={52}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#ef4444"
                  fontSize={12}
                  width={60}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="wpc"
                  name="WPC"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#a855f7" }}
                  connectNulls
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="wsi"
                  name="WSI"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#ef4444" }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Wear particle morphology */}
      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          Wear Particle Morphology
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Particle types on the latest ferrogram (
          {formatSampleDate(latest.sampleDate)})
        </p>

        {transitions.length > 0 && (
          <div className="mb-4 space-y-2">
            {transitions.map((alert) => (
              <div
                key={alert}
                className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-yellow-300"
              >
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <p className="text-sm">{alert}</p>
              </div>
            ))}
          </div>
        )}

        {latest.morphology ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MORPH_CATEGORIES.map((cat) => {
              const severity = latest.morphology?.[cat.key] ?? "not_detected";
              return (
                <div
                  key={cat.key}
                  className={`rounded-lg border p-3 ${SEVERITY_STYLES[severity]}`}
                >
                  <div className="text-sm font-semibold">{cat.label}</div>
                  <div className="mt-1 text-xs font-bold uppercase tracking-wide">
                    {SEVERITY_LABELS[severity]}
                  </div>
                  <div className="mt-1.5 text-xs opacity-70">{cat.meaning}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No morphology recorded for this sample.
          </p>
        )}
      </div>

      {/* Photomicrograph time machine */}
      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          Photomicrograph Time Machine
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Two most recent ferrograms side by side
        </p>

        {compareImages.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {compareImages.map((s, idx) => (
              <figure
                key={s.id ?? `${s.sampleDate}-${idx}`}
                className="rounded-lg border border-slate-700 overflow-hidden bg-slate-900"
              >
                <img
                  src={s.ferrographImageUrl}
                  alt={`Ferrogram from ${formatSampleDate(s.sampleDate)}`}
                  className="w-full h-56 object-cover"
                  loading="lazy"
                />
                <figcaption className="px-3 py-2 text-xs text-slate-400 border-t border-slate-700">
                  <span className="font-semibold text-slate-200">
                    {formatSampleDate(s.sampleDate)}
                  </span>{" "}
                  · {s.operatingHours.toLocaleString()} h
                  {compareImages.length === 2 && (
                    <span className="ml-2 text-slate-500">
                      {idx === 0 ? "(earlier)" : "(latest)"}
                    </span>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 rounded-lg border border-dashed border-slate-700 text-slate-500">
            <ImageOff className="h-5 w-5 mb-2" />
            <p className="text-sm font-semibold text-slate-400">
              No photomicrographs on file
            </p>
            <p className="text-xs mt-1">
              Ferrogram images attached to a sample will appear here.
            </p>
          </div>
        )}
      </div>

      {/* Historical table */}
      <div className="overflow-x-auto border border-slate-700 rounded-lg">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-xs uppercase bg-slate-800 text-slate-400">
            <tr>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Hours</th>
              <th className="px-3 py-3">DL</th>
              <th className="px-3 py-3">DS</th>
              <th className="px-3 py-3">WPC</th>
              <th className="px-3 py-3">WSI</th>
              <th className="px-3 py-3">PLP</th>
              <th className="px-3 py-3 normal-case">MPC ΔE</th>
              <th className="px-3 py-3">RULER</th>
              <th className="px-3 py-3 normal-case">UC (0-8)</th>
              <th className="px-3 py-3">Primary Morphology</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((s, idx) => {
              const indices = drFerroIndices(s.drLarge, s.drSmall);
              const primary = primaryMorphology(s.morphology);
              return (
                <tr
                  key={s.id ?? `${s.sampleDate}-${idx}`}
                  className="border-b border-slate-700 hover:bg-slate-800/50"
                >
                  <td className="px-3 py-3">{formatSampleDate(s.sampleDate)}</td>
                  <td className="px-3 py-3">
                    {s.operatingHours.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {display(s.drLarge, 1)}
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {display(s.drSmall, 1)}
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {indices ? indices.wpc.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {indices ? indices.wsi.toFixed(0) : "—"}
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {indices ? `${indices.plp}%` : "—"}
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {display(s.mpcDeltaE, 1)}
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {display(s.rulerPercent, 0, "%")}
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {s.ucRating != null ? s.ucRating : "—"}
                  </td>
                  <td className="px-3 py-3">
                    {primary ? (
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLES[primary.severity]}`}
                      >
                        {primary.label} · {SEVERITY_LABELS[primary.severity]}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default OilFerrographyVarnishTab;
