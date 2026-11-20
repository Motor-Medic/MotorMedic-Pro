import type { OilSample } from "../types/oilAnalysis";
import {
  formatIsoCode,
  getIsoTriplet,
  isIsoTripletReported,
  isoNotchDelta,
  orderOilSamplesBySequence,
  toSampleDateKey,
  validateIsoTriplet,
  type IsoCodeTriplet
} from "./oilAnalysisMetrics";

export const VISCOSITY_REFERENCE_LABEL_40C =
  "Viscosity @ 40°C (ASTM D445 reference)";
export const VISCOSITY_REFERENCE_LABEL_100C =
  "Viscosity @ 100°C (ASTM D445 reference)";

export const ISO_VG_TOLERANCE_PERCENT = 10;

const ISO_VG_NOMINALS = [
  2, 3, 5, 7, 10, 15, 22, 32, 46, 68, 100, 150, 220, 320, 460, 680, 1000, 1500
] as const;

export interface IsoVgBand {
  grade: number;
  nominal: number;
  min: number;
  max: number;
}

export interface ViscosityGradeGuard {
  rawGrade: string;
  grade: number;
  band: IsoVgBand;
  measured: number | null;
  deviationPercent: number | null;
  withinBand: boolean | null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function parseIsoVgGrade(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const match = String(raw).match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return ISO_VG_NOMINALS.find((grade) => grade === parsed) ?? null;
}

export function isoVgBand(grade: number): IsoVgBand | null {
  const nominal = parseIsoVgGrade(String(grade));
  if (nominal == null) return null;
  const delta = (nominal * ISO_VG_TOLERANCE_PERCENT) / 100;
  return {
    grade: nominal,
    nominal,
    min: roundTo(nominal - delta, 2),
    max: roundTo(nominal + delta, 2)
  };
}

export function resolveViscosityGradeGuard(
  sample: Pick<OilSample, "lubricantGrade" | "oilGrade" | "viscosity40C">
): ViscosityGradeGuard | null {
  const rawGrade =
    typeof sample.lubricantGrade === "string" && sample.lubricantGrade.trim() !== ""
      ? sample.lubricantGrade.trim()
      : typeof sample.oilGrade === "string" && sample.oilGrade.trim() !== ""
        ? sample.oilGrade.trim()
        : null;
  if (rawGrade == null) return null;

  const grade = parseIsoVgGrade(rawGrade);
  if (grade == null) return null;
  const band = isoVgBand(grade);
  if (band == null) return null;

  const measured = finiteNumber(sample.viscosity40C);
  const deviationPercent =
    measured == null ? null : roundTo(((measured - band.nominal) / band.nominal) * 100, 1);

  return {
    rawGrade,
    grade,
    band,
    measured,
    deviationPercent,
    withinBand:
      measured == null ? null : measured >= band.min && measured <= band.max
  };
}

export interface Iso4406Range {
  code: number;
  minPerMl: number;
  maxPerMl: number;
}

export const ISO_4406_RANGES: readonly Iso4406Range[] = [
  { code: 0, minPerMl: 0, maxPerMl: 0.01 },
  { code: 1, minPerMl: 0.01, maxPerMl: 0.02 },
  { code: 2, minPerMl: 0.02, maxPerMl: 0.04 },
  { code: 3, minPerMl: 0.04, maxPerMl: 0.08 },
  { code: 4, minPerMl: 0.08, maxPerMl: 0.16 },
  { code: 5, minPerMl: 0.16, maxPerMl: 0.32 },
  { code: 6, minPerMl: 0.32, maxPerMl: 0.64 },
  { code: 7, minPerMl: 0.64, maxPerMl: 1.3 },
  { code: 8, minPerMl: 1.3, maxPerMl: 2.5 },
  { code: 9, minPerMl: 2.5, maxPerMl: 5 },
  { code: 10, minPerMl: 5, maxPerMl: 10 },
  { code: 11, minPerMl: 10, maxPerMl: 20 },
  { code: 12, minPerMl: 20, maxPerMl: 40 },
  { code: 13, minPerMl: 40, maxPerMl: 80 },
  { code: 14, minPerMl: 80, maxPerMl: 160 },
  { code: 15, minPerMl: 160, maxPerMl: 320 },
  { code: 16, minPerMl: 320, maxPerMl: 640 },
  { code: 17, minPerMl: 640, maxPerMl: 1300 },
  { code: 18, minPerMl: 1300, maxPerMl: 2500 },
  { code: 19, minPerMl: 2500, maxPerMl: 5000 },
  { code: 20, minPerMl: 5000, maxPerMl: 10000 },
  { code: 21, minPerMl: 10000, maxPerMl: 20000 },
  { code: 22, minPerMl: 20000, maxPerMl: 40000 },
  { code: 23, minPerMl: 40000, maxPerMl: 80000 },
  { code: 24, minPerMl: 80000, maxPerMl: 160000 },
  { code: 25, minPerMl: 160000, maxPerMl: 320000 },
  { code: 26, minPerMl: 320000, maxPerMl: 640000 },
  { code: 27, minPerMl: 640000, maxPerMl: 1300000 },
  { code: 28, minPerMl: 1300000, maxPerMl: 2500000 }
] as const;

export function iso4406Range(code: number | null | undefined): Iso4406Range | null {
  const value = finiteNumber(code);
  if (value == null || !Number.isInteger(value)) return null;
  return ISO_4406_RANGES.find((range) => range.code === value) ?? null;
}

export interface Iso4406ChannelDecode {
  channel: ">4 µm" | ">6 µm" | ">14 µm";
  code: number;
  minPerMl: number;
  maxPerMl: number;
}

export function decodeIso4406(
  sample: Pick<OilSample, "iso4um" | "iso6um" | "iso14um">
): Iso4406ChannelDecode[] {
  const channels: { channel: Iso4406ChannelDecode["channel"]; code: number | undefined }[] = [
    { channel: ">4 µm", code: sample.iso4um },
    { channel: ">6 µm", code: sample.iso6um },
    { channel: ">14 µm", code: sample.iso14um }
  ];

  return channels.flatMap(({ channel, code }) => {
    const range = iso4406Range(code);
    if (range == null) return [];
    return [{
      channel,
      code: range.code,
      minPerMl: range.minPerMl,
      maxPerMl: range.maxPerMl
    }];
  });
}

// ---------------------------------------------------------------------------
// SLICE-OA3 — ISO 4406 code provenance and ordinal trend
// ---------------------------------------------------------------------------

/**
 * Map one stored particles/mL count onto the ISO 4406 code band that contains
 * it. Reuses ISO_4406_RANGES (the in-repo ISO scale); this is not a second
 * implementation. Returns null for an absent or non-positive count so a
 * missing count can never become code 0.
 */
export function isoCodeFromParticleCount(
  count: number | null | undefined
): number | null {
  const value = finiteNumber(count);
  if (value == null || value <= 0) return null;
  const range = ISO_4406_RANGES.find(
    (band) => value >= band.minPerMl && value < band.maxPerMl
  );
  return range?.code ?? null;
}

/**
 * Derive the triplet implied by stored raw counts. This is the allowed
 * direction only: codes may be derived from reported counts, but counts are
 * never invented from a reported code.
 */
export function deriveIsoTripletFromParticleCounts(
  sample: Pick<
    OilSample,
    "particles4um" | "particles6um" | "particles14um"
  >
): IsoCodeTriplet | null {
  const codes = [
    isoCodeFromParticleCount(sample.particles4um),
    isoCodeFromParticleCount(sample.particles6um),
    isoCodeFromParticleCount(sample.particles14um)
  ] as const;
  const [code4, code6, code14] = codes;
  if (code4 == null || code6 == null || code14 == null) return null;
  return [code4, code6, code14];
}

export type IsoCodeProvenance =
  | "lab-reported"
  | "count-derived"
  | "lab-and-derived-agree"
  | "lab-and-derived-disagree"
  | "not-reported";

export interface IsoCodeProvenanceResult {
  labReported: IsoCodeTriplet | null;
  countDerived: IsoCodeTriplet | null;
  provenance: IsoCodeProvenance;
  /** Both provenances exist and at least one band differs. */
  disagreement: boolean;
  /** What the UI must say beside the displayed code. */
  label: string;
}

export const ISO_CODE_NOT_REPORTED_LABEL = "— / ISO codes not reported";

export const ISO_CODE_DISAGREEMENT_NOTE =
  "Lab-reported ISO 4406 code and count-derived code disagree — both are shown; neither is silently preferred.";

/**
 * Keep a lab-reported triplet and a code derived from stored raw counts as
 * distinct provenances. Never silently chooses one when they disagree.
 */
export function isoCodeProvenance(
  sample: Pick<
    OilSample,
    "iso4um" | "iso6um" | "iso14um" | "particles4um" | "particles6um" | "particles14um"
  >
): IsoCodeProvenanceResult {
  const labCodes = [sample.iso4um, sample.iso6um, sample.iso14um] as const;
  const [lab4, lab6, lab14] = labCodes;
  const labReported: IsoCodeTriplet | null =
    typeof lab4 === "number" &&
    typeof lab6 === "number" &&
    typeof lab14 === "number" &&
    isIsoTripletReported([lab4, lab6, lab14])
      ? [lab4, lab6, lab14]
      : null;
  const countDerived = deriveIsoTripletFromParticleCounts(sample);
  const disagreement =
    labReported != null &&
    countDerived != null &&
    labReported.some((code, index) => code !== countDerived[index]);

  if (labReported == null && countDerived == null) {
    return {
      labReported,
      countDerived,
      provenance: "not-reported",
      disagreement: false,
      label: ISO_CODE_NOT_REPORTED_LABEL
    };
  }
  if (labReported == null) {
    return {
      labReported,
      countDerived,
      provenance: "count-derived",
      disagreement: false,
      label:
        "ISO 4406 code derived from stored raw particle counts — no lab-reported triplet"
    };
  }
  if (countDerived == null) {
    return {
      labReported,
      countDerived,
      provenance: "lab-reported",
      disagreement: false,
      label: "Lab-reported ISO 4406 triplet"
    };
  }
  return disagreement
    ? {
        labReported,
        countDerived,
        provenance: "lab-and-derived-disagree",
        disagreement: true,
        label:
          "Lab-reported ISO 4406 triplet — count-derived code differs (both shown)"
      }
    : {
        labReported,
        countDerived,
        provenance: "lab-and-derived-agree",
        disagreement: false,
        label: "Lab-reported ISO 4406 triplet (count-derived check agrees)"
      };
}

export interface IsoBandStepChange {
  fromDate: string;
  toDate: string;
  fromCode: string;
  toCode: string;
  /** Signed per-band ordinal steps, via the shared isoNotchDelta helper. */
  steps: IsoCodeTriplet;
}

export const ISO_TREND_MEAN_NOTE =
  "Per-band ordinal steps only — ISO 4406 codes are never averaged.";

export const ISO_PARTICLE_METHOD_NOT_STORED =
  "Particle-counting method/instrument is not stored — ISO 4406 codes are not comparable across samples; cross-sample cleanliness trend withheld.";

/**
 * Consecutive per-band ordinal steps between valid reported triplets. Uses the
 * shared sequence ordering and isoNotchDelta; it never computes a mean code.
 */
export function isoBandStepChanges(
  samples: readonly OilSample[]
): IsoBandStepChange[] {
  const reported = orderOilSamplesBySequence(samples).flatMap((sample) => {
    const triplet = getIsoTriplet(sample);
    if (!isIsoTripletReported(triplet)) return [];
    if (!validateIsoTriplet(triplet).valid) return [];
    return [{ sample, triplet }];
  });

  return reported.slice(1).map((entry, index) => {
    const previous = reported[index];
    return {
      fromDate: previous.sample.sampleDate,
      toDate: entry.sample.sampleDate,
      fromCode: formatIsoCode(previous.triplet),
      toCode: formatIsoCode(entry.triplet),
      steps: isoNotchDelta(previous.triplet, entry.triplet)
    };
  });
}

export interface WearMetalRatio {
  id: "cuFe" | "pbFe" | "snCu" | "alSi";
  label: string;
  value: number;
}

export function wearMetalRatios(sample: OilSample): WearMetalRatio[] {
  const defs: { id: WearMetalRatio["id"]; label: string; numerator: unknown; denominator: unknown }[] = [
    { id: "cuFe", label: "Cu/Fe", numerator: sample.copper, denominator: sample.iron },
    { id: "pbFe", label: "Pb/Fe", numerator: sample.lead, denominator: sample.iron },
    { id: "snCu", label: "Sn/Cu", numerator: sample.tin, denominator: sample.copper },
    { id: "alSi", label: "Al/Si", numerator: sample.aluminum, denominator: sample.silicon }
  ];

  return defs.flatMap(({ id, label, numerator, denominator }) => {
    const n = finiteNumber(numerator);
    const d = finiteNumber(denominator);
    if (n == null || d == null || d <= 0) return [];
    return [{ id, label, value: roundTo(n / d, 3) }];
  });
}

export type AlloyCoElevationRatioId = "cuPb" | "cuSn" | "pbSn" | "feCr";

export interface AlloyCoElevationRatio {
  id: AlloyCoElevationRatioId;
  label: string;
  value: number;
}

/**
 * Descriptive ratios among the alloy-indicator elements (Cu, Pb, Sn) plus
 * Fe/Cr. A ratio is emitted only when both readings were stored and the
 * denominator is positive — nothing is zero-filled. These are raw elemental
 * ratios, not component metallurgy and not a wear-origin diagnosis.
 */
export function alloyCoElevationRatios(
  sample: Pick<OilSample, "copper" | "lead" | "tin" | "iron" | "chromium">
): AlloyCoElevationRatio[] {
  const defs: {
    id: AlloyCoElevationRatioId;
    label: string;
    numerator: unknown;
    denominator: unknown;
  }[] = [
    { id: "cuPb", label: "Cu/Pb", numerator: sample.copper, denominator: sample.lead },
    { id: "cuSn", label: "Cu/Sn", numerator: sample.copper, denominator: sample.tin },
    { id: "pbSn", label: "Pb/Sn", numerator: sample.lead, denominator: sample.tin },
    { id: "feCr", label: "Fe/Cr", numerator: sample.iron, denominator: sample.chromium }
  ];

  return defs.flatMap(({ id, label, numerator, denominator }) => {
    const n = finiteNumber(numerator);
    const d = finiteNumber(denominator);
    if (n == null || d == null || d <= 0) return [];
    return [{ id, label, value: roundTo(n / d, 3) }];
  });
}

export type SiliconAluminumRatio =
  | { status: "measured"; value: number; silicon: number; aluminum: number }
  | { status: "not-measured"; missing: ("silicon" | "aluminum")[] }
  | { status: "not-computable"; reason: "aluminum-zero"; silicon: number; aluminum: 0 };

/**
 * Si:Al ratio with explicit null-vs-zero discipline.
 *
 * An unreported element stays "not-measured" and never becomes a zero. A
 * measured aluminum of 0 is a real reading, but it cannot be a denominator, so
 * the ratio is reported as "not-computable" instead of dividing by zero. No
 * sealant-vs-dust classification is applied: that would require an in-repo
 * rubric plus a stored sample profile.
 */
export function siliconAluminumRatio(
  sample: Pick<OilSample, "silicon" | "aluminum">
): SiliconAluminumRatio {
  const silicon = finiteNumber(sample.silicon);
  const aluminum = finiteNumber(sample.aluminum);

  const missing: ("silicon" | "aluminum")[] = [];
  if (silicon == null) missing.push("silicon");
  if (aluminum == null) missing.push("aluminum");
  if (silicon == null || aluminum == null) {
    return { status: "not-measured", missing };
  }

  if (aluminum === 0) {
    return {
      status: "not-computable",
      reason: "aluminum-zero",
      silicon,
      aluminum: 0
    };
  }

  return {
    status: "measured",
    value: roundTo(silicon / aluminum, 3),
    silicon,
    aluminum
  };
}

export interface ComponentMetallurgy {
  bushing?: string | null;
  bearingOverlay?: string | null;
  steel?: string | null;
}

export interface MetallurgyOriginGuidance {
  text: string;
  basis: string;
}

export const METALLURGY_RATIOS_NOTE =
  "elemental ratios are descriptive metrics only - they are not component metallurgy and do not identify a wear source";

export function metallurgyOriginGuidance(input: {
  metallurgy: ComponentMetallurgy | null | undefined;
  samples: readonly OilSample[];
  ratios: readonly WearMetalRatio[];
}): MetallurgyOriginGuidance | null {
  if (input.metallurgy == null) return null;
  if (input.samples.length < 2) return null;

  const ratio = (id: WearMetalRatio["id"]): number | null =>
    input.ratios.find((entry) => entry.id === id)?.value ?? null;

  const cuFe = ratio("cuFe");
  const pbFe = ratio("pbFe");

  if (input.metallurgy.bushing != null && cuFe != null && cuFe >= 0.5) {
    return {
      text: "consistent with bushing sliding wear",
      basis: "in-repo metallurgy rubric: stored bushing metallurgy plus Cu/Fe >= 0.5 across 2+ samples"
    };
  }

  if (input.metallurgy.bearingOverlay != null && pbFe != null && pbFe >= 0.25) {
    return {
      text: "consistent with leaded bearing overlay wear",
      basis: "in-repo metallurgy rubric: stored bearing overlay metallurgy plus Pb/Fe >= 0.25 across 2+ samples"
    };
  }

  if (input.metallurgy.steel != null && (cuFe != null || pbFe != null)) {
    return {
      text: "consistent with steel-on-steel wear",
      basis: "in-repo metallurgy rubric: stored steel metallurgy plus elemental ratios across 2+ samples"
    };
  }

  return null;
}

export function filterOilSamplesToWindow(
  samples: readonly OilSample[],
  windowStart?: string | null,
  windowEnd?: string | null
): OilSample[] {
  if ((windowStart == null || windowStart === "") && (windowEnd == null || windowEnd === "")) {
    return [...samples];
  }

  const from = windowStart != null && windowStart !== ""
    ? new Date(`${windowStart}T00:00:00`).getTime()
    : Number.NEGATIVE_INFINITY;
  const to = windowEnd != null && windowEnd !== ""
    ? new Date(`${windowEnd}T23:59:59.999`).getTime()
    : Number.POSITIVE_INFINITY;

  return samples.filter((sample) => {
    const time = new Date(`${sample.sampleDate}T00:00:00`).getTime();
    return Number.isFinite(time) && time >= from && time <= to;
  });
}

/**
 * The newest sample, resolved through the SAME sequence helper the Wear Metals
 * and Cleanliness tabs use. Date alone is not an ordering key: same-day, same
 * hour uploads are tie-broken by created_at then id, so every oil surface picks
 * the same "latest" row.
 */
export function latestOilSample(samples: readonly OilSample[]): OilSample | null {
  if (samples.length === 0) return null;
  const ordered = orderOilSamplesBySequence(samples);
  return ordered[ordered.length - 1];
}

// ---------------------------------------------------------------------------
// SLICE-OA1 — ICP particle-size disclosure + viscosity/TAN pair completeness
// ---------------------------------------------------------------------------

/**
 * Static method disclosure rendered beside the ASTM D5185 note.
 *
 * ICP-OES reads dissolved and fine wear metal only, so a clean elemental
 * result cannot exclude large spalling debris. This is method limitation text:
 * no computation is derived from it.
 */
export const ICP_OES_PARTICLE_SIZE_DISCLOSURE =
  "ASTM D5185 ICP-OES resolves dissolved and fine wear metal (roughly < 10 µm) and does not detect large spalling debris; a clean ICP result does not rule out macroscopic wear.";

export interface ViscosityTanPairInput {
  sampleDate: string;
  viscosity40C?: number | null;
  acidNumber?: number | null;
  operatingHours?: number | null;
}

export interface ViscosityTanPairPoint {
  /** Calendar-day key (YYYY-MM-DD) the badges are grouped by. */
  date: string;
  hasViscosity: boolean;
  hasTan: boolean;
  /** A usable hour stamp: finite and non-zero (the existing rate gate). */
  hasOperatingHours: boolean;
  /** True only when viscosity, TAN and operating hours are all present. */
  isCompletePair: boolean;
}

function hasFiniteValue(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value);
}

/**
 * Pair completeness for the Viscosity-vs-TAN timeline.
 *
 * A row that carries TAN without Visc@40 or without a usable operating-hour
 * stamp is not a pair, so the UI marks it as a GAP instead of letting a lone
 * point read as a trend. Missing readings stay missing — nothing is filled.
 */
export function viscosityTanPairCompleteness(
  samples: readonly ViscosityTanPairInput[]
): ViscosityTanPairPoint[] {
  return samples.map((sample) => {
    const hasViscosity = hasFiniteValue(sample.viscosity40C);
    const hasTan = hasFiniteValue(sample.acidNumber);
    const hasOperatingHours =
      hasFiniteValue(sample.operatingHours) &&
      (sample.operatingHours as number) > 0;

    return {
      date: toSampleDateKey(sample.sampleDate),
      hasViscosity,
      hasTan,
      hasOperatingHours,
      isCompletePair: hasViscosity && hasTan && hasOperatingHours
    };
  });
}

// ---------------------------------------------------------------------------
// SLICE-OA2 — viscosity test-temperature guard
// ---------------------------------------------------------------------------

/** The only reference temperature this app's viscosity series plots against. */
export const VISCOSITY_SERIES_REFERENCE_C = 40;

export const VISCOSITY_TEMPERATURE_EXCLUSION_LABEL =
  "not comparable to the 40°C series";

export type ViscosityTemperatureReason =
  | "reference-40c"
  | "temperature-not-40c"
  | "temperature-not-recorded"
  | "no-40c-reading";

export interface ViscosityTemperatureGuard {
  /** True only for a reading measured at the 40 °C reference. */
  comparable: boolean;
  /** Temperature basis in °C when declared, else null. */
  temperatureC: number | null;
  reason: ViscosityTemperatureReason;
  /** Label the UI shows for an excluded row; null when comparable. */
  exclusionLabel: string | null;
}

/**
 * Kinematic viscosity is meaningless without its test temperature.
 *
 * `viscosity40C` is the stored 40 °C ASTM D445 column, so an absent declared
 * temperature is read as the 40 °C reference. A declared temperature other than
 * 40 °C — or a sample that carries only a non-40 °C reading — is excluded from
 * the 40 °C series instead of being plotted.
 */
export function viscosityTemperatureGuard(
  sample: Pick<
    OilSample,
    "viscosity40C" | "viscosity100C" | "viscosityTestTemperatureC"
  >
): ViscosityTemperatureGuard {
  const reading = finiteNumber(sample.viscosity40C);
  if (reading == null) {
    const otherReading = finiteNumber(sample.viscosity100C);
    if (otherReading != null) {
      // KV was reported, but not at the 40 °C reference and no test
      // temperature is stored for it.
      return {
        comparable: false,
        temperatureC: null,
        reason: "temperature-not-recorded",
        exclusionLabel: VISCOSITY_TEMPERATURE_EXCLUSION_LABEL
      };
    }
    return {
      comparable: false,
      temperatureC: null,
      reason: "no-40c-reading",
      exclusionLabel: null
    };
  }

  const declared = finiteNumber(sample.viscosityTestTemperatureC);
  if (declared == null) {
    // The value came from the 40 °C column, so its basis is recorded.
    return {
      comparable: true,
      temperatureC: VISCOSITY_SERIES_REFERENCE_C,
      reason: "reference-40c",
      exclusionLabel: null
    };
  }

  if (declared !== VISCOSITY_SERIES_REFERENCE_C) {
    return {
      comparable: false,
      temperatureC: declared,
      reason: "temperature-not-40c",
      exclusionLabel: VISCOSITY_TEMPERATURE_EXCLUSION_LABEL
    };
  }

  return {
    comparable: true,
    temperatureC: declared,
    reason: "reference-40c",
    exclusionLabel: null
  };
}
