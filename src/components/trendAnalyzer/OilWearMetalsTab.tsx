/**
 * Wear Metals & Debris — historical Recharts trends + Viscosity/TAN + sample table.
 * Ingestion lives in AddOilSampleModal (not on this page body).
 *
 * Every reader (latest cards, charts, viscosity trend, table) and the in-range
 * count share one window predicate, `filterOilSamplesToWindow`, so the tab can
 * never show rows outside the selected range.
 *
 * Honesty boundaries:
 *   * alarm limits come from in-repo DEFAULT_ALARM_LIMITS / lab-OEM guidance;
 *     ASTM D5185 is the ICP test method, not a threshold source;
 *   * generation rates require two samples with distinct non-zero operating
 *     hours and are descriptive only (no hours-to-limit projection);
 *   * alloy and Si:Al ratios are descriptive, present-if-stored, and never
 *     attributed to a component because component metallurgy is not stored.
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
  formatPercentOfLimit,
  formatSampleDate,
  getThresholdStatus,
  interpretWearPattern,
  latestWearMetalPresence,
  orderOilSamplesBySequence,
  wearMetalCoMovementStatus,
  wearMetalLimitDisplay,
  WEAR_METAL_ENDPOINT_RATE_NOTE
} from "../../lib/oilAnalysisMetrics";
import { fetchOilSamples } from "../../lib/oilSampleRow";
import {
  alloyCoElevationRatios,
  filterOilSamplesToWindow,
  ICP_OES_PARTICLE_SIZE_DISCLOSURE,
  METALLURGY_RATIOS_NOTE,
  siliconAluminumRatio
} from "../../lib/oilTribologyGuidance";
import {
  OIL_ALARM_LIMIT_CITATION,
  OIL_SPECTROSCOPY_CITATION
} from "../../lib/maintenance/prescriptiveDictionary";
import type {
  OilSample,
  ThresholdStatus,
  WearMetalKey
} from "../../types/oilAnalysis";
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

const NOT_MEASURED_STYLE = "text-slate-400 bg-slate-800/40 border-slate-700";

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

function ppmCell(value: number | undefined): string | number {
  return value != null && Number.isFinite(value) ? value : "—";
}

interface BaselineAnchor {
  value: number;
  source: "stored" | "first-in-window";
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
  // first in-window sample so deltas stay correct for back-dated uploads. When
  // no stored baseline exists, the first in-window measured sample is used and
  // the card says so; with one sample or no reading, no delta is shown.
  const baselineFor = (
    stored: number | undefined,
    measured: number | undefined
  ): BaselineAnchor | null => {
    if (windowed.length < 2) return null;
    if (stored != null && Number.isFinite(stored)) {
      return { value: stored, source: "stored" };
    }
    if (measured != null && Number.isFinite(measured)) {
      return { value: measured, source: "first-in-window" };
    }
    return null;
  };

  const renderCard = (
    label: string,
    element: WearMetalKey,
    baselineAnchor: BaselineAnchor | null
  ) => {
    // Limit + percent-of-limit + endpoint rate all come from the shared display
    // helper, so the card, the rate gate and the ordering rule stay in lockstep.
    const display = wearMetalLimitDisplay(
      windowed,
      element,
      baselineAnchor?.value ?? null
    );
    const measuredValue = display.latestPpm;
    const status =
      measuredValue == null
        ? null
        : getThresholdStatus(measuredValue, display.limitPpm);

    return (
      <div
        className={`p-4 rounded-lg border ${
          status == null ? NOT_MEASURED_STYLE : STATUS_STYLES[status]
        }`}
      >
        <div className="text-sm opacity-80">{label}</div>
        <div className="text-2xl font-bold mt-1 text-white">
          {measuredValue == null ? (
            "Not measured"
          ) : (
            <>
              {measuredValue} <span className="text-sm font-normal">PPM</span>
            </>
          )}
        </div>
        <div className="text-xs mt-2 opacity-75">
          <div>Limit: {display.limitPpm} PPM</div>
          <div>
            {formatPercentOfLimit(display.percentOfLimit)} of limit
          </div>
          {measuredValue != null && baselineAnchor != null && (
            <div>
              Δ{" "}
              {calculateBaselineDelta(
                measuredValue,
                baselineAnchor.value
              ).toFixed(1)}
              % vs{" "}
              {baselineAnchor.source === "stored"
                ? "stored baseline"
                : "first in-window sample (no stored baseline)"}
            </div>
          )}
          {measuredValue != null && (
            <div>
              {display.rateStatus === "available" &&
              display.ratePer100Hours != null
                ? `Rate: ${display.ratePer100Hours.toFixed(2)} PPM/100h`
                : "Rate: insufficient operating-hour data"}
            </div>
          )}
          {measuredValue != null && display.rateStatus === "available" && (
            <div className="text-[11px] opacity-60">
              {WEAR_METAL_ENDPOINT_RATE_NOTE}
            </div>
          )}
        </div>
      </div>
    );
  };

  const chartData = windowed.map((s) => ({
    date: formatSampleDate(s.sampleDate, { month: "short", day: "numeric" }),
    Iron: s.iron,
    Copper: s.copper,
    Chromium: s.chromium,
    Silicon: s.silicon
  }));

  const alloyRatios = alloyCoElevationRatios(latest);
  const siAl = siliconAluminumRatio(latest);
  const latestPresence = latestWearMetalPresence(windowed);
  const coMovement = wearMetalCoMovementStatus(windowed);
  const missingSiAlLabels = (missing: ("silicon" | "aluminum")[]): string =>
    missing
      .map((key) => (key === "silicon" ? "Silicon" : "Aluminum"))
      .join(" and ");

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

      <div className="rounded-lg border border-slate-700 bg-slate-800/30 p-3">
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-slate-300">Limit source:</span>{" "}
          {OIL_ALARM_LIMIT_CITATION}
        </p>
        <p className="text-[11px] text-slate-500 mt-1 break-words">
          {OIL_SPECTROSCOPY_CITATION}
        </p>
        <p className="text-[11px] text-slate-500 mt-1 break-words">
          {ICP_OES_PARTICLE_SIZE_DISCLOSURE}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {renderCard(
          "Iron (Fe)",
          "iron",
          baselineFor(baseline.baselineIron, baseline.iron)
        )}
        {renderCard(
          "Copper (Cu)",
          "copper",
          baselineFor(baseline.baselineCopper, baseline.copper)
        )}
        {renderCard(
          "Chromium (Cr)",
          "chromium",
          baselineFor(baseline.baselineChromium, baseline.chromium)
        )}
        {renderCard(
          "Silicon (Si)",
          "silicon",
          baselineFor(baseline.baselineSilicon, baseline.silicon)
        )}
      </div>

      <div className="space-y-1">
        <p className="text-[11px] text-slate-500">
          Baseline: stored fresh-oil value when recorded; otherwise the first
          in-window measured sample. No baseline is invented.
        </p>
        <p className="text-[11px] text-slate-500">
          Generation rate: Δppm / Δoperating hours, shown only when at least two
          samples carry distinct non-zero operating hours. Descriptive only; no
          projection or extrapolation.
        </p>
      </div>

      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          Latest sample completeness (descriptive)
        </h3>
        <p className="text-sm text-slate-400 mb-3">
          Element presence in the latest sample only — measured, reported 0, or
          not measured. Presence is never attributed to a component.
        </p>
        <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {latestPresence.map((entry) => (
            <li
              key={entry.element}
              className="rounded border border-slate-700 px-3 py-2"
            >
              <span className="text-xs text-slate-500">{entry.label}</span>
              <div className="font-mono text-slate-200">
                {entry.state === "measured" && `${entry.ppm} PPM`}
                {entry.state === "zero" && "0 PPM (reported)"}
                {entry.state === "unmeasured" && (
                  <span className="text-slate-400">Not measured</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          Co-movement status (descriptive)
        </h3>
        {coMovement.status === "insufficient-hours" ? (
          <p className="text-sm text-slate-400">
            insufficient operating-hour data — co-movement flag withheld.
          </p>
        ) : coMovement.flags.length > 0 ? (
          <ul className="space-y-1 text-sm text-slate-300">
            {coMovement.flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">
            No gated co-movement flag across the hour-stamped samples.
          </p>
        )}
        <p className="text-[11px] text-slate-500 mt-2">
          A co-movement flag (rising Si with rising Fe/Cr) is rendered only when
          at least two samples carry distinct non-zero operating hours. Rate
          basis: {WEAR_METAL_ENDPOINT_RATE_NOTE}.
        </p>
      </div>

      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          Alloy co-elevation (descriptive)
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Elemental ratios are shown only when both readings were stored.
        </p>
        {alloyRatios.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {alloyRatios.map((ratio) => (
              <div
                key={ratio.id}
                className="rounded border border-slate-700 p-3"
              >
                <div className="text-xs text-slate-500">{ratio.label}</div>
                <div className="font-mono text-slate-200">
                  {ratio.value.toFixed(3)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 italic">
            No paired Cu/Pb/Sn/Fe/Cr readings in the latest sample — ratios
            omitted rather than zero-filled.
          </p>
        )}
        <p className="text-[11px] text-slate-500 mt-3 break-words">
          {METALLURGY_RATIOS_NOTE}
        </p>
      </div>

      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          Si:Al (descriptive)
        </h3>
        {siAl.status === "measured" ? (
          <>
            <p className="text-2xl font-bold text-white mt-1">
              Si:Al = {siAl.value.toFixed(3)}
            </p>
            <p className="text-[11px] text-slate-500 mt-2">
              Stored readings: Si {siAl.silicon} ppm · Al {siAl.aluminum} ppm.
              Raw ratio only — no sealant-vs-dust classification is applied
              without an in-repo rubric and stored profile.
            </p>
          </>
        ) : siAl.status === "not-measured" ? (
          <p className="text-sm text-slate-400 mt-1">
            {missingSiAlLabels(siAl.missing)}:{" "}
            <span className="font-semibold text-slate-300">Not measured</span> —
            Si:Al not computed.
          </p>
        ) : (
          <p className="text-sm text-slate-400 mt-1">
            Aluminum reported 0 ppm — Si:Al not computable (division by zero).
          </p>
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
                <td className="px-4 py-3 font-mono">{ppmCell(s.iron)}</td>
                <td className="px-4 py-3 font-mono">{ppmCell(s.copper)}</td>
                <td className="px-4 py-3 font-mono">{ppmCell(s.chromium)}</td>
                <td className="px-4 py-3 font-mono">{ppmCell(s.silicon)}</td>
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
