/**
 * Cleanliness & Particle Count — Oil Analysis tab 3.
 *
 * Reads saved oil_samples only. Raw counts are shown only when the lab
 * reported them; they are never back-calculated from ISO codes, and NAS/SAE
 * classes are derived on read rather than stored.
 *
 * Every derived value on this tab is gated on a physically consistent ISO 4406
 * triplet. A stored code such as 12/34/8 is still shown raw (it is the lab
 * record), but it cannot trigger a degradation alert, NAS/SAE equivalency,
 * filtration recommendation, overshoot comparison, or fine/coarse profile.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Filter, ShieldAlert } from "lucide-react";
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
  compareIsoTripletToTarget,
  FILTER_BETA_GUIDANCE_BASIS,
  filterBetaGuidanceFor,
  formatIsoCode,
  formatSampleDate,
  getIsoTriplet,
  hasValidIsoTriplet,
  ISO_4406_ORDINAL_RULE,
  ISO_CODE_SCALE_MAX,
  ISO_CODE_SCALE_MIN,
  ISO_TRIPLET_DATA_QUALITY_WARNING,
  isoNotchDelta,
  isoToNasClass,
  isoToSaeClass,
  orderOilSamplesBySequence,
  recommendedFilterBeta,
  validateIsoTriplet,
  worstChannelOvershoot,
  type IsoCodeTriplet,
  type IsoTripletValidation
} from "../../lib/oilAnalysisMetrics";
import { fetchOilSamples } from "../../lib/oilSampleRow";
import {
  filterOilSamplesToWindow,
  ISO_CODE_DISAGREEMENT_NOTE,
  ISO_PARTICLE_METHOD_NOT_STORED,
  ISO_TREND_MEAN_NOTE,
  isoBandStepChanges,
  isoCodeProvenance,
  latestOilSample
} from "../../lib/oilTribologyGuidance";
import {
  ISO_CLEANLINESS_TARGET,
  type OilSample
} from "../../types/oilAnalysis";

export interface OilCleanlinessTarget {
  triplet: IsoCodeTriplet;
  /** Stored provenance, e.g. "OEM gearbox spec rev C" — never inferred. */
  source: string;
}

export interface OilCleanlinessTabProps {
  assetId: string;
  /** Bump from parent after Add Sample modal saves to re-fetch. */
  refreshKey?: number;
  /** Toolbar From date (YYYY-MM-DD); null/empty means open start. */
  windowStart?: string | null;
  /** Toolbar To date (YYYY-MM-DD); null/empty means open end. */
  windowEnd?: string | null;
  /**
   * Optional stored per-asset/OEM target supplied by the caller. When absent,
   * the recalled Noria default is labelled as not a stored per-asset target.
   */
  target?: OilCleanlinessTarget;
  /**
   * Set true only when the caller holds stored particle-counting method and
   * instrument evidence showing every in-window sample used the same method.
   * Absent/false means the method is not stored, so the trend is withheld.
   */
  methodComparable?: boolean;
}

const TARGET: IsoCodeTriplet = ISO_CLEANLINESS_TARGET;

/**
 * The only target available in-repo is a recalled Noria default. There is no
 * stored per-asset cleanliness spec, so every target comparison says so.
 */
const TARGET_BASIS_LABEL =
  "recalled Noria default — not a stored per-asset target";
const TARGET_BASIS_SHORT = "recalled Noria default";

/** A notch jump this large between valid samples suggests an ingress event. */
const NOTCH_ALERT_THRESHOLD = 2;

const CARD_BASE =
  "rounded-lg border border-slate-700 bg-slate-800/40 p-4 flex flex-col gap-1";

const INSUFFICIENT_RATIO = {
  ratio: null,
  diagnosis: "Insufficient particle data for wear-mode ratio."
} as const;

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

function validityFor(sample: OilSample): IsoTripletValidation {
  return validateIsoTriplet(getIsoTriplet(sample));
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
  refreshKey = 0,
  windowStart = null,
  windowEnd = null,
  target: storedTarget,
  methodComparable = false
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

  // Order once by sequence (date, created_at, id) so same-date uploads get a
  // deterministic index instead of relying on a date-string collation.
  const orderedSamples = useMemo(
    () => orderOilSamplesBySequence(samples),
    [samples]
  );

  const sequenceNumber = useMemo(() => {
    const map = new Map<OilSample, number>();
    orderedSamples.forEach((sample, index) => map.set(sample, index + 1));
    return map;
  }, [orderedSamples]);

  const windowActive = Boolean(
    (windowStart != null && windowStart !== "") ||
      (windowEnd != null && windowEnd !== "")
  );

  const windowed = useMemo(
    () => filterOilSamplesToWindow(orderedSamples, windowStart, windowEnd),
    [orderedSamples, windowStart, windowEnd]
  );

  const anyRawCounts = useMemo(
    () => windowed.some(hasRawCounts),
    [windowed]
  );

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

  if (samples.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 border border-dashed border-slate-700 rounded-lg">
        <Filter className="h-6 w-6 text-slate-600 mb-3" />
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
        <Filter className="h-6 w-6 text-slate-600 mb-3" />
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

  if (!hasAnyCleanlinessData(windowed)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 border border-dashed border-slate-700 rounded-lg">
        <Filter className="h-6 w-6 text-slate-600 mb-3" />
        <p className="text-lg font-semibold">No Cleanliness Data Recorded</p>
        <p className="text-sm mt-2 text-center max-w-md px-4">
          {`${windowed.length} sample${windowed.length === 1 ? "" : "s"} on file, but none include ISO 4406 codes or particle counts. Add a report with cleanliness data via “+ Add Sample”.`}
        </p>
      </div>
    );
  }

  // Shared ordering helper: the same "latest" row OA1/OA2 resolve.
  const latest =
    latestOilSample(windowed) ?? windowed[windowed.length - 1];
  const latestTriplet = getIsoTriplet(latest);
  const latestValidation = validateIsoTriplet(latestTriplet);
  const latestInvalid = latestValidation.present && !latestValidation.valid;
  /** Only a valid lab triplet may feed any derived value below. */
  const derivationTriplet: IsoCodeTriplet | null = latestValidation.valid
    ? latestTriplet
    : null;

  // Provenance: lab-reported and count-derived codes are kept distinct.
  const latestProvenance = isoCodeProvenance(latest);
  const latestDerivedTriplet = latestProvenance.countDerived;
  /** Show a reported lab code when present; otherwise a labelled derived code. */
  const headlineTriplet =
    latestProvenance.labReported ?? latestDerivedTriplet;
  const targetTriplet: IsoCodeTriplet = storedTarget?.triplet ?? TARGET;
  const targetBasisLabel = storedTarget
    ? `${storedTarget.source} — stored per-asset/OEM target`
    : TARGET_BASIS_LABEL;
  const targetBasisShort = storedTarget ? storedTarget.source : TARGET_BASIS_SHORT;
  /**
   * Comparison never silently substitutes a derived code for an invalid lab
   * code. Derived comparison is used only when no lab triplet is stored.
   */
  const comparisonTriplet =
    derivationTriplet ??
    (latestTriplet == null ? latestDerivedTriplet : null);
  const isoBands = compareIsoTripletToTarget(comparisonTriplet, targetTriplet);
  const isoAboveCount =
    isoBands == null
      ? null
      : isoBands.filter((band) => band.comparison === "above").length;

  const validTripletSamples = windowed.filter(hasValidIsoTriplet);
  const invalidSamples = windowed.filter((sample) => {
    const validation = validityFor(sample);
    return validation.present && !validation.valid;
  });

  // Compare against the most recent earlier VALID sample. An invalid previous
  // code cannot anchor a notch delta or an ingress alert.
  const previousIso = (() => {
    for (let i = windowed.length - 2; i >= 0; i -= 1) {
      const triplet = getIsoTriplet(windowed[i]);
      if (validateIsoTriplet(triplet).valid) {
        return { triplet: triplet as IsoCodeTriplet, sample: windowed[i] };
      }
    }
    return null;
  })();

  const delta =
    derivationTriplet && previousIso
      ? isoNotchDelta(previousIso.triplet, derivationTriplet)
      : null;
  const notchAlert =
    delta != null && delta.some((d) => d >= NOTCH_ALERT_THRESHOLD);

  const atTarget = isoBands != null && isoAboveCount === 0;

  const worstOvershoot = derivationTriplet
    ? worstChannelOvershoot(derivationTriplet, targetTriplet)
    : null;

  // Fine/coarse profiling needs at least two VALID multi-channel samples; a
  // single upload (or an invalid code) keeps the honest insufficient state.
  const canProfileFineCoarse =
    derivationTriplet != null && validTripletSamples.length >= 2;
  const particleRatio = canProfileFineCoarse
    ? calculateParticleRatio(latest.particles4um, latest.particles14um)
    : INSUFFICIENT_RATIO;

  const ratioNote = latestInvalid
    ? "Withheld - ISO 4406 code failed validity check"
    : !derivationTriplet || validTripletSamples.length < 2
      ? `Needs ≥2 valid multi-channel samples (${validTripletSamples.length} on file)`
      : particleRatio.diagnosis;

  const overshootRows = derivationTriplet
    ? ([">4μm", ">6μm", ">14μm"] as const).map((channel, index) => {
        const current = derivationTriplet[index];
        const target = targetTriplet[index];
        const steps = current - target;
        return {
          channel,
          current,
          target,
          steps,
          multiplier: steps > 0 ? 2 ** steps : 1
        };
      })
    : [];

  const trendSteps = isoBandStepChanges(windowed);
  const trendWithheldReason =
    validTripletSamples.length < 2
      ? `Cleanliness trend withheld — ${validTripletSamples.length} valid reported ISO 4406 triplet${validTripletSamples.length === 1 ? "" : "s"} in range; at least 2 are required.`
      : !methodComparable
        ? ISO_PARTICLE_METHOD_NOT_STORED
        : null;

  const chartData = windowed.map((s) => {
    const triplet = getIsoTriplet(s);
    const valid = validateIsoTriplet(triplet).valid;
    return {
      date: formatSampleDate(s.sampleDate, { month: "short", day: "numeric" }),
      p4: logSafe(s.particles4um),
      p6: logSafe(s.particles6um),
      p14: logSafe(s.particles14um),
      // Invalid codes stay visible in the table, but the trend line only plots
      // physically consistent codes so a typo cannot invent a spike.
      iso4: valid ? triplet?.[0] ?? null : null,
      iso6: valid ? triplet?.[1] ?? null : null,
      iso14: valid ? triplet?.[2] ?? null : null
    };
  });
  const hasPlottableChartData = chartData.some(
    (point) =>
      point.p4 != null ||
      point.p6 != null ||
      point.p14 != null ||
      point.iso4 != null ||
      point.iso6 != null ||
      point.iso14 != null
  );

  const tooltipStyle = {
    backgroundColor: "#0f172a",
    border: "1px solid #334155"
  };

  const previousSequence = previousIso
    ? sequenceNumber.get(previousIso.sample)
    : undefined;
  const latestSequence = sequenceNumber.get(latest);

  return (
    <div className="space-y-6 p-4">
      <div>
        <h2 className="text-xl font-bold text-white">
          Cleanliness &amp; Particle Count
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Latest sample {formatSampleDate(latest.sampleDate)} ·{" "}
          {latest.operatingHours.toLocaleString()} operating hours
          {latestSequence != null ? ` · sample #${latestSequence}` : ""}
        </p>
        {windowActive && (
          <p className="text-xs text-slate-500 mt-1">
            Window {windowStart || "open start"} &ndash;{" "}
            {windowEnd || "open end"} · {windowed.length} of {samples.length}{" "}
            samples in range
          </p>
        )}
      </div>

      {invalidSamples.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-300"
        >
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">
              {ISO_TRIPLET_DATA_QUALITY_WARNING}
            </p>
            <p className="text-sm mt-0.5">
              {latestInvalid
                ? "The latest sample"
                : `${invalidSamples.length} sample${invalidSamples.length === 1 ? "" : "s"} in range`}{" "}
              failed the ISO 4406 triplet check
              {latestInvalid ? " (shown raw below)" : ""}. Degradation alerts,
              NAS/SAE equivalencies, filtration recommendations, overshoot
              comparisons and fine/coarse classification are suppressed for
              invalid samples. Re-check the lab report before acting.
            </p>
            {latestInvalid && latestValidation.issues.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs text-amber-200/80">
                {latestValidation.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-amber-200/70">
              Valid range for this gate: whole ISO codes {ISO_CODE_SCALE_MIN}–
              {ISO_CODE_SCALE_MAX}, with &gt;4μm ≥ &gt;6μm ≥ &gt;14μm.
            </p>
          </div>
        </div>
      )}

      {latestProvenance.disagreement && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-4 text-sky-200"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Code provenance discrepancy</p>
            <p className="text-sm mt-0.5">{ISO_CODE_DISAGREEMENT_NOTE}</p>
            <p className="mt-1 text-xs font-mono">
              Lab-reported: {formatIsoCode(latestProvenance.labReported)} ·
              Count-derived: {formatIsoCode(latestProvenance.countDerived)}
            </p>
          </div>
        </div>
      )}

      {notchAlert && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-300">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">
              Possible filter bypass or ingress event
            </p>
            <p className="text-sm mt-0.5">
              Cleanliness degraded by {NOTCH_ALERT_THRESHOLD}+ ISO notches since{" "}
              {previousSequence != null
                ? `sample #${previousSequence} (${formatSampleDate(previousIso?.sample.sampleDate)})`
                : formatSampleDate(previousIso?.sample.sampleDate)}
              . Check filter condition, seals, and breathers.
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
            className={`text-3xl font-bold font-mono ${
              headlineTriplet
                ? latestInvalid
                  ? "text-amber-300"
                  : "text-white"
                : "text-slate-600"
            }`}
          >
            {formatIsoCode(headlineTriplet)}
          </div>
          <div className="text-xs text-slate-500">
            Target {formatIsoCode(targetTriplet)} · {targetBasisLabel} · &gt;4μm
            / &gt;6μm / &gt;14μm
          </div>
          <div className="text-xs text-slate-400">{latestProvenance.label}</div>
          {headlineTriplet && (
            <div
              className={`mt-2 inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${
                latestInvalid
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  : isoBands == null
                    ? "border-slate-600 bg-slate-700/30 text-slate-300"
                    : atTarget
                      ? "border-green-500/40 bg-green-500/10 text-green-300"
                      : "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
              }`}
            >
              {latestInvalid
                ? `${targetBasisShort} comparison withheld`
                : isoBands == null
                  ? "Comparison withheld"
                  : atTarget
                    ? `At or below ${targetBasisShort}`
                    : `Above ${targetBasisShort}`}
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
                notches vs{" "}
                {previousSequence != null
                  ? `sample #${previousSequence} `
                  : ""}
                ({formatSampleDate(previousIso?.sample.sampleDate)})
                {previousIso?.sample.sampleDate === latest.sampleDate
                  ? " · same-day earlier entry"
                  : ""}
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-slate-600">—</div>
              <div className="text-xs text-slate-500">
                {latestInvalid
                  ? "Withheld - ISO 4406 code failed validity check"
                  : "Needs two samples with valid ISO codes"}
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
            className={`text-2xl font-bold ${
              derivationTriplet ? "text-white" : "text-slate-600"
            }`}
          >
            {derivationTriplet
              ? `NAS 1638 ~ ${isoToNasClass(derivationTriplet[1])} | SAE AS4059 ~ ${isoToSaeClass(derivationTriplet[1])}`
              : "—"}
          </div>
          <div className="text-xs text-slate-500">
            {latestInvalid
              ? "Withheld - ISO 4406 code failed validity check"
              : "Reference equivalency, not certified conversion"}
          </div>
        </div>

        {/* Fine / coarse descriptive profile */}
        <div className={CARD_BASE}>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Fine / Coarse Ratio
          </div>
          <div
            className={`text-2xl font-bold ${
              particleRatio.ratio != null ? "text-white" : "text-slate-600"
            }`}
          >
            {particleRatio.ratio != null
              ? `${particleRatio.ratio.toFixed(1)}:1`
              : "—"}
          </div>
          <div className="text-xs text-slate-500">{ratioNote}</div>
        </div>

        {/* Filtration recommendation */}
        <div className={`${CARD_BASE} md:col-span-2`}>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Recommended Filtration
          </div>
          <div
            className={`text-base font-semibold ${
              derivationTriplet ? "text-cyan-300" : "text-slate-600"
            }`}
          >
            {derivationTriplet
              ? recommendedFilterBeta(derivationTriplet, targetTriplet)
              : "—"}
          </div>
          <div className="text-xs text-slate-500">
            {latestInvalid
              ? "Withheld - ISO 4406 code failed validity check"
              : derivationTriplet
                ? `Based on worst-channel overshoot against the ${targetBasisShort} ${formatIsoCode(targetTriplet)} (${storedTarget ? "stored per-asset/OEM target" : "not a stored per-asset spec"}). ${FILTER_BETA_GUIDANCE_BASIS}`
                : "ISO codes not reported"}
          </div>
        </div>
      </div>

      {/* Per-band ordinal comparison vs target */}
      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-white">
            ISO 4406 vs Target — Per-Band Ordinal Comparison
          </h3>
          <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[10px] text-slate-400">
            Target basis: {targetBasisLabel}
          </span>
        </div>
        <p className="mb-1 text-sm text-slate-400">
          Code shown: {latestProvenance.label}
        </p>
        <p className="mb-3 text-xs italic text-slate-500">
          {ISO_4406_ORDINAL_RULE}
        </p>
        <p className="mb-3 text-xs text-slate-400">
          Target {formatIsoCode(targetTriplet)} · &gt;4μm / &gt;6μm / &gt;14μm
        </p>

        {isoBands != null ? (
          <>
            <div
              className={`text-base font-semibold ${
                isoAboveCount === 0 ? "text-green-300" : "text-yellow-300"
              }`}
            >
              {isoAboveCount === 0
                ? "At or below target in all 3 bands"
                : `Above target in ${isoAboveCount} of 3 bands`}
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-300">
                <thead className="text-xs uppercase bg-slate-800 text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Band</th>
                    <th className="px-4 py-2">Current</th>
                    <th className="px-4 py-2">Target</th>
                    <th className="px-4 py-2">Ordinal position</th>
                  </tr>
                </thead>
                <tbody>
                  {isoBands.map((band) => {
                    const position =
                      band.current === band.target
                        ? "at target"
                        : band.current < band.target
                          ? "below target"
                          : "above target";
                    return (
                      <tr key={band.channel} className="border-b border-slate-700/70">
                        <td className="px-4 py-2 font-mono">{band.channel}</td>
                        <td className="px-4 py-2 font-mono">{band.current}</td>
                        <td className="px-4 py-2 font-mono">{band.target}</td>
                        <td
                          className={`px-4 py-2 ${
                            band.comparison === "above"
                              ? "text-yellow-300"
                              : "text-green-300"
                          }`}
                        >
                          {position}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-500">
            <p className="font-mono text-slate-400">{formatIsoCode(null)}</p>
            <p className="mt-1">{latestProvenance.label}</p>
            <p className="mt-1">
              No per-band comparison is derived. No baseline is invented and no
              code is subtracted or averaged.
            </p>
          </div>
        )}
      </div>

      {/* Raw counts, only when stored */}
      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          Raw Particle Counts (per mL)
        </h3>
        <p className="text-sm text-slate-400 mb-3">
          Stored lab counts only. Each ISO 4406 code step is roughly a doubling
          of particles/mL; codes are ordinal log bands, not linear values.
        </p>
        {hasRawCounts(latest) ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                [">4μm", latest.particles4um],
                [">6μm", latest.particles6um],
                [">14μm", latest.particles14um]
              ] as const
            ).map(([channel, count]) => (
              <div key={channel} className={CARD_BASE}>
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {channel}
                </div>
                <div className="text-xl font-bold font-mono text-white">
                  {formatCount(count)}
                </div>
                <div className="text-xs text-slate-500">particles/mL</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-500">
            <p className="font-mono text-slate-400">—</p>
            <p className="mt-1">
              Raw particle counts not stored for the latest sample — not
              back-filled from ISO codes.
            </p>
          </div>
        )}
      </div>

      {/* Overshoot matrix — one row per channel, gated on a valid triplet */}
      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          Target Overshoot Matrix
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Per-channel step deltas and 2^steps concentration multipliers against
          the {targetBasisLabel} ({formatIsoCode(targetTriplet)}). Each ISO code
          step is roughly a doubling of particle concentration.
        </p>

        {derivationTriplet ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-300">
              <thead className="text-xs uppercase bg-slate-800 text-slate-400">
                <tr>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Current code</th>
                  <th className="px-4 py-3">
                    {targetBasisShort} target
                  </th>
                  <th className="px-4 py-3">Step delta</th>
                  <th className="px-4 py-3">2^steps multiplier</th>
                </tr>
              </thead>
              <tbody>
                {overshootRows.map((row) => (
                  <tr
                    key={row.channel}
                    className="border-b border-slate-700/70"
                  >
                    <td className="px-4 py-3 font-mono">{row.channel}</td>
                    <td className="px-4 py-3 font-mono">{row.current}</td>
                    <td className="px-4 py-3 font-mono">{row.target}</td>
                    <td
                      className={`px-4 py-3 font-mono ${
                        row.steps > 0
                          ? "text-yellow-300"
                          : "text-green-400"
                      }`}
                    >
                      {row.steps > 0 ? `+${row.steps}` : String(row.steps)}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {row.steps > 0 ? `${row.multiplier.toLocaleString()}×` : "1×"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-slate-500">
              Worst-channel guidance:{" "}
              {filterBetaGuidanceFor(worstOvershoot ?? 0).recommendation}{" "}
              {FILTER_BETA_GUIDANCE_BASIS}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-500">
            <p className="font-semibold text-slate-400">
              Overshoot comparison withheld
            </p>
            <p className="mt-1">
              {latestInvalid
                ? `${ISO_TRIPLET_DATA_QUALITY_WARNING}. No step delta or concentration multiplier is derived from an invalid code.`
                : "No complete ISO 4406 triplet in the latest in-window sample."}
            </p>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Target basis: {targetBasisLabel}. {FILTER_BETA_GUIDANCE_BASIS}
        </p>
      </div>

      {/* Cleanliness trend — ordinal steps only, method-gated */}
      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          Cleanliness Trend — Per-Band Ordinal Steps
        </h3>
        <p className="text-sm text-slate-400 mb-2">{ISO_TREND_MEAN_NOTE}</p>
        {trendWithheldReason != null ? (
          <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-500">
            <p className="font-semibold text-slate-400">
              Cleanliness trend withheld
            </p>
            <p className="mt-1">{trendWithheldReason}</p>
            <p className="mt-1">
              Stored values remain visible in the table below; no cross-sample
              direction is implied and no numeric mean of codes is computed.
            </p>
          </div>
        ) : trendSteps.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-500">
            <p className="font-semibold text-slate-400">
              Cleanliness trend withheld
            </p>
            <p className="mt-1">
              No consecutive reported ISO 4406 triplets are available.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-300">
              <thead className="text-xs uppercase bg-slate-800 text-slate-400">
                <tr>
                  <th className="px-4 py-2">Sequence</th>
                  <th className="px-4 py-2">&gt;4μm step</th>
                  <th className="px-4 py-2">&gt;6μm step</th>
                  <th className="px-4 py-2">&gt;14μm step</th>
                </tr>
              </thead>
              <tbody>
                {trendSteps.map((step, index) => (
                  <tr
                    key={`${step.fromDate}-${step.toDate}-${index}`}
                    className="border-b border-slate-700/70"
                  >
                    <td className="px-4 py-2 font-mono">
                      {step.fromCode} → {step.toCode}
                      <span className="ml-2 text-xs text-slate-500">
                        {formatSampleDate(step.fromDate)} →{" "}
                        {formatSampleDate(step.toDate)}
                      </span>
                    </td>
                    {step.steps.map((value, bandIndex) => (
                      <td
                        key={bandIndex}
                        className={`px-4 py-2 font-mono ${
                          value > 0 ? "text-yellow-300" : value < 0 ? "text-green-300" : "text-slate-300"
                        }`}
                      >
                        {value > 0 ? `+${value}` : String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trend chart: raw counts when available, valid ISO codes otherwise */}
      <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
        <h3 className="text-lg font-semibold text-white mb-1">
          {anyRawCounts ? "Particle Count Trend" : "ISO 4406 Code Trend"}
        </h3>
        <p className="text-sm text-slate-400 mb-1">
          {anyRawCounts
            ? "Particles per mL by channel (logarithmic scale)"
            : "Raw counts not recorded — plotting ISO 4406 codes"}
        </p>
        <p className="text-xs text-slate-500 mb-4">
          Stored readings only —{" "}
          {methodComparable
            ? "the caller attests a common stored particle-counting method."
            : "particle-counting method/instrument is not stored, so this is not a comparable cleanliness trend."}
        </p>
        {hasPlottableChartData ? (
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
        ) : (
          <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-500">
            <p className="font-mono text-slate-400">—</p>
            <p className="mt-1">
              No plottable particle count or valid ISO 4406 code in this range.
              No zero is implied.
            </p>
          </div>
        )}
      </div>

      {/* Standards table */}
      <div className="overflow-x-auto border border-slate-700 rounded-lg">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-xs uppercase bg-slate-800 text-slate-400">
            <tr>
              <th className="px-4 py-3">#</th>
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
            {windowed.map((s, idx) => {
              const triplet = getIsoTriplet(s);
              const validation = validateIsoTriplet(triplet);
              const invalid = validation.present && !validation.valid;
              return (
                <tr
                  key={s.id ?? `${s.sampleDate}-${idx}`}
                  className={`border-b border-slate-700 hover:bg-slate-800/50 ${
                    invalid ? "bg-amber-500/5" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-slate-500">
                    {sequenceNumber.get(s) ?? idx + 1}
                  </td>
                  <td className="px-4 py-3">{formatSampleDate(s.sampleDate)}</td>
                  <td className="px-4 py-3">
                    {s.operatingHours.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {formatIsoCode(triplet)}
                    {invalid && (
                      <span
                        className="ml-1 text-amber-400"
                        title={ISO_TRIPLET_DATA_QUALITY_WARNING}
                      >
                        ⚠
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {validation.valid ? isoToNasClass(triplet![1]) : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {validation.valid ? isoToSaeClass(triplet![1]) : "—"}
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
          from the ISO &gt;6μm code, not certified conversions. ISO 4406 codes
          and NAS/SAE classes are dimensionless; particle counts are per mL.
          Invalid triplets are shown raw with their equivalencies withheld.
        </p>
      </div>
    </div>
  );
}

export default OilCleanlinessTab;
