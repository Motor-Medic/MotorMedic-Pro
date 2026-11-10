import type { OilSample } from "../types/oilAnalysis";

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

export function latestOilSample(samples: readonly OilSample[]): OilSample | null {
  if (samples.length === 0) return null;
  return samples.reduce((newest, sample) => {
    const sampleTime = new Date(sample.sampleDate).getTime();
    const newestTime = new Date(newest.sampleDate).getTime();
    if (sampleTime > newestTime) return sample;
    if (sampleTime < newestTime) return newest;
    return String(sample.id ?? "") >= String(newest.id ?? "") ? sample : newest;
  });
}
