/**
 * Shared mapping from `oil_samples` DB rows to the `OilSample` domain type.
 *
 * Used by every Oil Analysis tab so the snake_case → camelCase translation
 * exists in exactly one place. Numeric columns arrive from pg as strings
 * (DECIMAL is not auto-parsed), so everything goes through coercion.
 */

import { DEFAULT_ALARM_LIMITS, type OilSample } from "../types/oilAnalysis";
import { toSampleDateKey } from "./oilAnalysisMetrics";

export const OIL_ANALYSIS_API_PATH = "/api/oil-analysis";

export type OilSampleDbRow = {
  id?: string;
  asset_id?: string;
  sample_date: string | Date;
  operating_hours: number | string;
  iron?: number | string | null;
  copper?: number | string | null;
  chromium?: number | string | null;
  lead?: number | string | null;
  aluminum?: number | string | null;
  silicon?: number | string | null;
  tin?: number | string | null;
  nickel?: number | string | null;
  viscosity_40c?: number | string | null;
  viscosity_100c?: number | string | null;
  viscosity_index?: number | string | null;
  acid_number?: number | string | null;
  tbn?: number | string | null;
  water_ppm?: number | string | null;
  oxidation?: number | string | null;
  nitration?: number | string | null;
  iso_4um?: number | string | null;
  iso_6um?: number | string | null;
  iso_14um?: number | string | null;
  baseline_iron?: number | string | null;
  baseline_copper?: number | string | null;
  baseline_chromium?: number | string | null;
  iron_alarm_limit?: number | string | null;
  copper_alarm_limit?: number | string | null;
  chromium_alarm_limit?: number | string | null;
  lead_alarm_limit?: number | string | null;
  aluminum_alarm_limit?: number | string | null;
  silicon_alarm_limit?: number | string | null;
};

function num(raw: unknown, fallback = 0): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function optNum(raw: unknown): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function mapOilSampleRow(
  row: OilSampleDbRow,
  assetId: string
): OilSample {
  return {
    id: row.id,
    assetId: row.asset_id || assetId,
    sampleDate: toSampleDateKey(row.sample_date),
    operatingHours: num(row.operating_hours),

    iron: num(row.iron),
    copper: num(row.copper),
    chromium: num(row.chromium),
    lead: num(row.lead),
    aluminum: num(row.aluminum),
    silicon: num(row.silicon),
    tin: optNum(row.tin),
    nickel: optNum(row.nickel),

    viscosity40C: optNum(row.viscosity_40c),
    viscosity100C: optNum(row.viscosity_100c),
    viscosityIndex: optNum(row.viscosity_index),
    acidNumber: optNum(row.acid_number),
    tbn: optNum(row.tbn),
    waterPpm: optNum(row.water_ppm),
    oxidation: optNum(row.oxidation),
    nitration: optNum(row.nitration),
    iso4um: optNum(row.iso_4um),
    iso6um: optNum(row.iso_6um),
    iso14um: optNum(row.iso_14um),

    baselineIron: optNum(row.baseline_iron),
    baselineCopper: optNum(row.baseline_copper),
    baselineChromium: optNum(row.baseline_chromium),

    ironAlarmLimit: num(row.iron_alarm_limit, DEFAULT_ALARM_LIMITS.iron),
    copperAlarmLimit: num(row.copper_alarm_limit, DEFAULT_ALARM_LIMITS.copper),
    chromiumAlarmLimit: num(
      row.chromium_alarm_limit,
      DEFAULT_ALARM_LIMITS.chromium
    ),
    leadAlarmLimit: num(row.lead_alarm_limit, DEFAULT_ALARM_LIMITS.lead),
    aluminumAlarmLimit: num(
      row.aluminum_alarm_limit,
      DEFAULT_ALARM_LIMITS.aluminum
    ),
    siliconAlarmLimit: num(row.silicon_alarm_limit, DEFAULT_ALARM_LIMITS.silicon)
  };
}

/**
 * Fetch an asset's oil samples, normalized and sorted oldest → newest.
 * Throws on a non-OK response so callers can surface the error state.
 */
export async function fetchOilSamples(assetId: string): Promise<OilSample[]> {
  const res = await fetch(
    `${OIL_ANALYSIS_API_PATH}?assetId=${encodeURIComponent(assetId)}`
  );
  if (!res.ok) throw new Error("Failed to fetch oil analysis history");

  const data = (await res.json()) as { samples?: OilSampleDbRow[] };
  return (data.samples || [])
    .map((row) => mapOilSampleRow(row, assetId))
    .filter((s) => s.sampleDate !== "")
    .sort((a, b) => a.sampleDate.localeCompare(b.sampleDate));
}
