/**
 * Fluid Chemistry & Contamination — Oil Analysis tab 2.
 *
 * Reads saved oil_samples only. Every value is either measured or shown as
 * "—"; nothing on this tab is generated, defaulted, or mocked.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Droplets } from "lucide-react";
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
  compareIsoTripletToTarget,
  formatFluidChemistryAudit,
  formatIsoCode,
  formatSampleDate,
  fluidChemistryAudit,
  ftirComparability,
  FTIR_COMPARABILITY_REQUIREMENT,
  getIsoTriplet,
  isIsoTripletReported,
  ISO_4406_ORDINAL_RULE,
  orderOilSamplesBySequence,
  RAW_ABSORBANCE_BADGE,
  tanTbnTrend,
  waterPhaseAlert
} from "../../lib/oilAnalysisMetrics";
import { fetchOilSamples } from "../../lib/oilSampleRow";
import {
  filterOilSamplesToWindow,
  latestOilSample,
  VISCOSITY_REFERENCE_LABEL_40C,
  VISCOSITY_TEMPERATURE_EXCLUSION_LABEL,
  viscosityTemperatureGuard
} from "../../lib/oilTribologyGuidance";
import {
  ISO_CLEANLINESS_TARGET,
  type OilSample
} from "../../types/oilAnalysis";

export interface OilFluidChemistryTabProps {
  assetId: string;
  /** Bump from parent after Add Sample modal saves to re-fetch. */
  refreshKey?: number;
  /** Toolbar From date (YYYY-MM-DD); null/empty means open start. */
  windowStart?: string | null;
  /** Toolbar To date (YYYY-MM-DD); null/empty means open end. */
  windowEnd?: string | null;
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
  note,
  badge
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  badge?: string;
}) {
  const measured = value !== "—";
  return (
    <div className={CARD_BASE}>
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      {badge ? (
        <div className="w-fit rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
          {badge}
        </div>
      ) : null}
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
  refreshKey = 0,
  windowStart = null,
  windowEnd = null
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

  // Same point-in-time window predicate as the AL OilResultsTab so a date range
  // can never select different samples on the two oil surfaces.
  const windowActive = Boolean(
    (windowStart != null && windowStart !== "") ||
      (windowEnd != null && windowEnd !== "")
  );

  const windowed = useMemo(
    () => filterOilSamplesToWindow(samples, windowStart, windowEnd),
    [samples, windowStart, windowEnd]
  );

  const latest = useMemo(() => latestOilSample(windowed), [windowed]);
  // One shared sequence order for the table and every chart, so a same-date,
  // zero-hour upload cannot resolve differently on this tab than on Wear Metals.
  const orderedWindowed = useMemo(
    () => orderOilSamplesBySequence(windowed),
    [windowed]
  );

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

  if (samples.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 border border-dashed border-slate-700 rounded-lg">
        <Droplets className="h-6 w-6 text-slate-600 mb-3" />
        <p className="text-lg font-semibold">No Oil Analysis Data</p>
        <p className="text-sm mt-2 text-center max-w-md px-4">
          Click “+ Add Sample” above to upload a lab report image or CSV.
        </p>
      </div>
    );
  }

  if (windowActive && windowed.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 border border-dashed border-slate-700 rounded-lg">
        <Droplets className="h-6 w-6 text-slate-600 mb-3" />
        <p className="text-lg font-semibold">
          No oil samples in the selected date range
        </p>
        <p className="text-sm mt-2 text-center max-w-md px-4">
          Clear the From / To range to see all {samples.length} saved sample
          {samples.length === 1 ? "" : "s"}.
        </p>
      </div>
    );
  }

  if (!latest || !hasAnyChemistry(windowed)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 border border-dashed border-slate-700 rounded-lg">
        <Droplets className="h-6 w-6 text-slate-600 mb-3" />
        <p className="text-lg font-semibold">No Fluid Chemistry Recorded</p>
        <p className="text-sm mt-2 text-center max-w-md px-4">
          {`${windowed.length} sample${windowed.length === 1 ? "" : "s"} on file, but none include viscosity, TAN/TBN, water, oxidation, or ISO particle counts. Add a report with fluid chemistry via “+ Add Sample”.`}
        </p>
      </div>
    );
  }

  const waterAlert = waterPhaseAlert(latest.waterPpm);
  const trend = tanTbnTrend(windowed);
  // The paired TAN/TBN reading is not necessarily on the newest sample (a lab
  // report may report only water or viscosity). Say so instead of calling an
  // older reading "latest".
  const pairedIsLatest =
    trend.deltaDate != null && trend.deltaDate === latest.sampleDate;

  const audit = fluidChemistryAudit(windowed);
  const auditLine = formatFluidChemistryAudit(audit);
  const ftir = ftirComparability(windowed);

  const currentIsoRaw = getIsoTriplet(latest);
  const currentIso = isIsoTripletReported(currentIsoRaw) ? currentIsoRaw : null;
  const target = ISO_CLEANLINESS_TARGET;
  const isoBands = compareIsoTripletToTarget(currentIso, target);
  const isoAboveCount =
    isoBands == null
      ? null
      : isoBands.filter((band) => band.comparison === "above").length;
  const atTarget = isoAboveCount === 0;

  const chartData = orderedWindowed.map((s) => {
    const viscosityGuard = viscosityTemperatureGuard(s);
    const hasOxidation = s.oxidation != null && Number.isFinite(s.oxidation);
    return {
      date: formatSampleDate(s.sampleDate, { month: "short", day: "numeric" }),
      hours: s.operatingHours,
      viscosity: viscosityGuard.comparable ? s.viscosity40C ?? null : null,
      // Raw absorbance is plotted only when the stored instrument/pathlength/
      // method signature is complete and identical across readings.
      oxidation: ftir.comparable && hasOxidation ? s.oxidation : null,
      tan: s.acidNumber ?? null,
      tbn: s.tbn ?? null
    };
  });

  const viscosityOxidationPairCount = chartData.filter(
    (point) => point.viscosity != null && point.oxidation != null
  ).length;
  const tanTbnPairCount = chartData.filter(
    (point) => point.tan != null && point.tbn != null
  ).length;
  const tbnReported = orderedWindowed.some(
    (s) => s.tbn != null && Number.isFinite(s.tbn)
  );
  const excludedViscosity = orderedWindowed.filter(
    (s) => viscosityTemperatureGuard(s).exclusionLabel != null
  );

  const tooltipStyle = {
    backgroundColor: "#0f172a",
    border: "1px solid #334155"
  };

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
        <p className="text-xs text-slate-500 mt-1 font-mono">{auditLine}</p>
        {windowActive && (
          <p className="text-xs text-slate-500 mt-1">
            Window {windowStart || "open start"} &ndash;{" "}
            {windowEnd || "open end"} · {windowed.length} of {samples.length}{" "}
            samples in range
          </p>
        )}
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
          label={VISCOSITY_REFERENCE_LABEL_40C}
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
          badge={RAW_ABSORBANCE_BADGE}
        />
        <SummaryCard
          label="Nitration"
          value={display(latest.nitration, 2)}
          unit="Abs/cm"
          badge={RAW_ABSORBANCE_BADGE}
        />
      </div>

      <p className="text-xs text-slate-500 italic">
        Oxidation / nitration are shown as raw absorbance (Abs/cm). No stored
        fresh-oil or base-stock FTIR baseline exists, so neither reading carries
        a pass/fail verdict.
      </p>
      <p className="text-xs text-slate-500 italic">
        {RAW_ABSORBANCE_BADGE}. {FTIR_COMPARABILITY_REQUIREMENT}{" "}
        {ftir.note}
      </p>

      {/* Viscosity vs Oxidation */}
      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          Viscosity vs. Oxidation
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Base oil degradation — viscosity at the fixed 40°C reference (cSt)
          against oxidation (Abs/cm)
        </p>
        {!ftir.comparable ? (
          <p className="mb-3 rounded border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-300">
            {ftir.note}
          </p>
        ) : null}
        {excludedViscosity.length > 0 ? (
          <p className="mb-3 text-xs text-slate-500">
            Excluded from the 40°C series:{" "}
            {excludedViscosity
              .map((s) => formatSampleDate(s.sampleDate))
              .join(", ")}{" "}
            — {VISCOSITY_TEMPERATURE_EXCLUSION_LABEL}.
          </p>
        ) : null}
        {viscosityOxidationPairCount === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-500">
            No paired viscosity/oxidation readings in range — nothing plotted.
          </p>
        ) : (
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
                  if (name === VISCOSITY_REFERENCE_LABEL_40C) {
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
                name={VISCOSITY_REFERENCE_LABEL_40C}
                stroke="#eab308"
                strokeWidth={2}
                dot={{ r: 3, fill: "#eab308" }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="oxidation"
                name="Oxidation"
                stroke="#f97316"
                strokeWidth={2}
                dot={{ r: 3, fill: "#f97316" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>
      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          TAN vs. TBN
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Acid buildup against remaining alkaline reserve (mg KOH/g) —
          descriptive only.
        </p>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className={CARD_BASE}>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              TAN − TBN (latest)
            </div>
            <div
              className={`text-2xl font-bold font-mono ${trend.delta != null ? "text-white" : "text-slate-600"}`}
            >
              {display(trend.delta ?? undefined, 2)}
              {trend.delta != null ? (
                <span className="ml-1 text-sm font-normal text-slate-400">
                  mg KOH/g
                </span>
              ) : null}
            </div>
            <div className="text-xs text-slate-500">
              {trend.delta == null
                ? "Needs a sample with both TAN and TBN"
                : !pairedIsLatest
                  ? `Measured ${formatSampleDate(trend.deltaDate)} — later sample(s) omit TAN or TBN`
                  : trend.delta > 0
                    ? "TAN exceeds TBN in the latest sample"
                    : "Alkaline reserve remains in the latest sample"}
            </div>
          </div>
          <div className={CARD_BASE}>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              TAN − TBN trend slope
            </div>
            <div
              className={`text-2xl font-bold font-mono ${trend.slopePerDay != null ? "text-white" : "text-slate-600"}`}
            >
              {trend.slopePerDay != null
                ? `${trend.slopePerDay > 0 ? "+" : ""}${trend.slopePerDay.toFixed(4)}`
                : "—"}
            </div>
            <div className="text-xs text-slate-500">
              {trend.slopePerDay != null
                ? `mg KOH/g per day (Δelapsed days) · ${trend.distinctDateCount} distinct dates · descriptive only`
                : `Needs ≥3 distinct-date samples with TAN and TBN (${trend.distinctDateCount} on file)`}
            </div>
            {trend.slopePer100Hours != null ? (
              <div className="text-xs text-slate-500">
                Hour-gated basis:{" "}
                {`${trend.slopePer100Hours > 0 ? "+" : ""}${trend.slopePer100Hours.toFixed(4)}`}{" "}
                mg KOH/g per 100 operating hours (Δoperating-hours) ·
                descriptive only
              </div>
            ) : null}
          </div>
        </div>

        <p className="mb-4 text-xs text-slate-500 italic">
          Descriptive delta and slope only. Oil samples carry no load
          telemetry, so no future date is inferred.
        </p>

        {tanTbnPairCount === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-500">
            {tbnReported
              ? "TAN not reported — no pair"
              : "TBN not reported — no pair"}
          </p>
        ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(148,163,184,0.1)" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              <YAxis
                stroke="#94a3b8"
                fontSize={12}
                width={72}
                unit=" mg KOH/g"
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Line
                type="monotone"
                dataKey="tan"
                name="TAN"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3, fill: "#ef4444" }}
              />
              <Line
                type="monotone"
                dataKey="tbn"
                name="TBN"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 3, fill: "#22c55e" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>

      {/* ISO 4406 cleanliness — descriptive, no life-extension model */}
      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-white">
            ISO 4406 Cleanliness
          </h3>
          <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[10px] text-slate-400">
            Target basis: recalled Noria default — not a stored per-asset target
          </span>
        </div>
        <p className="text-sm text-slate-400 mb-2">
          Current particle count against a recalled Noria default for general
          industrial service — descriptive comparison only.
        </p>
        <p className="mb-4 text-xs text-slate-500 italic">
          {ISO_4406_ORDINAL_RULE}
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
            <div className="text-xs text-slate-500">&gt;4μm / &gt;6μm / &gt;14μm</div>
          </div>
          <div className={CARD_BASE}>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Target
            </div>
            <div className="text-2xl font-bold font-mono text-cyan-300">
              {target.join("/")}
            </div>
            <div className="text-xs text-slate-500">Recalled Noria default</div>
          </div>
          <div className={CARD_BASE}>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Current vs. target
            </div>
            <div
              className={`text-2xl font-bold ${isoBands != null ? (atTarget ? "text-green-400" : "text-yellow-300") : "text-slate-600"}`}
            >
              {isoBands == null
                ? "—"
                : atTarget
                  ? "At or below target in all 3 bands"
                  : `Above target in ${isoAboveCount} of 3 bands`}
            </div>
            {isoBands != null ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {isoBands.map((band) => (
                  <span
                    key={band.channel}
                    className={`rounded border px-1.5 py-0.5 text-[10px] ${
                      band.comparison === "above"
                        ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
                        : "border-green-500/40 bg-green-500/10 text-green-300"
                    }`}
                  >
                    {band.channel}:{" "}
                    {band.comparison === "above" ? "above" : "at or below"}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="text-xs text-slate-500">
              {isoBands == null
                ? "ISO codes not reported"
                : "Per-band ordinal comparison; codes are not subtracted"}
            </div>
          </div>
        </div>
      </div>

      {/* Chronological table */}
      <div className="overflow-x-auto border border-slate-700 rounded-lg">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-xs uppercase bg-slate-800 text-slate-400">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">{VISCOSITY_REFERENCE_LABEL_40C}</th>
              <th className="px-4 py-3">TAN (mg KOH/g)</th>
              <th className="px-4 py-3">TBN (mg KOH/g)</th>
              <th className="px-4 py-3">Water (ppm)</th>
              <th className="px-4 py-3">Oxidation (Abs/cm)</th>
              <th className="px-4 py-3">Nitration (Abs/cm)</th>
              <th className="px-4 py-3">ISO 4406</th>
            </tr>
          </thead>
          <tbody>
            {orderedWindowed.map((s, idx) => (
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
                  {display(s.nitration, 2)}
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
