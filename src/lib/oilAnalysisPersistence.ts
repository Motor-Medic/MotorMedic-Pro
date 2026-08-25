/**
 * Oil analysis persistence — GET/POST handlers shared by App Router and Express.
 */

import { query, isDbConfigured } from "./db";
import {
  DEFAULT_ALARM_LIMITS,
  MORPH_CATEGORIES,
  MORPH_SEVERITIES,
  type MorphCategoryKey,
  type MorphSeverity,
  type MorphologyMap
} from "../types/oilAnalysis";

export const OIL_ANALYSIS_API_PATH = "/api/oil-analysis";

export type SaveOilSampleInput = {
  assetId: string;
  sampleDate: string;
  operatingHours: number;
  iron?: number;
  copper?: number;
  chromium?: number;
  lead?: number;
  aluminum?: number;
  silicon?: number;
  tin?: number;
  nickel?: number;
  viscosity40C?: number | null;
  viscosity100C?: number | null;
  viscosityIndex?: number | null;
  acidNumber?: number | null;
  tbn?: number | null;
  waterPpm?: number | null;
  oxidation?: number | null;
  nitration?: number | null;
  iso4um?: number | null;
  iso6um?: number | null;
  iso14um?: number | null;
  particles4um?: number | null;
  particles6um?: number | null;
  particles14um?: number | null;
  drLarge?: number | null;
  drSmall?: number | null;
  mpcDeltaE?: number | null;
  rulerPercent?: number | null;
  ucRating?: number | null;
  morphology?: MorphologyMap | null;
  ferrographImageUrl?: string | null;
};

/** Parse an optional numeric body field; blank/garbage becomes null. */
function optNumeric(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Parse an optional integer body field (ISO 4406 codes). */
function optInt(raw: unknown): number | null {
  const n = optNumeric(raw);
  return n == null ? null : Math.round(n);
}

/** Clamp an optional integer into an inclusive range, else null. */
function optIntInRange(raw: unknown, min: number, max: number): number | null {
  const n = optInt(raw);
  if (n == null) return null;
  return Math.min(max, Math.max(min, n));
}

/** Trim an optional text field; blank becomes null. */
function optText(raw: unknown, maxLength = 2048): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  return s.slice(0, maxLength);
}

/** Accept only known morphology severities; anything else becomes null. */
function optMorphSeverity(raw: unknown): MorphSeverity | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (MORPH_SEVERITIES as readonly string[]).includes(s)
    ? (s as MorphSeverity)
    : null;
}

/**
 * Read a morphology map from either a nested `morphology` object or flat
 * `morphRubbing` / `morph_rubbing` body keys. Unknown severities are dropped
 * rather than written through to the database.
 */
function coerceMorphology(body: Record<string, unknown>): MorphologyMap | null {
  const nested =
    body.morphology && typeof body.morphology === "object"
      ? (body.morphology as Record<string, unknown>)
      : {};

  const result: MorphologyMap = {};
  for (const cat of MORPH_CATEGORIES) {
    const key = cat.key as MorphCategoryKey;
    const camel = `morph${key.replace(/(^|_)([a-z])/g, (_m, _p, c: string) => c.toUpperCase())}`;
    const severity = optMorphSeverity(
      nested[key] ?? body[camel] ?? body[`morph_${key}`]
    );
    if (severity) result[key] = severity;
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Build a SaveOilSampleInput from an untrusted request body.
 * Shared by the App Router route and the Express handler so the two paths
 * can never drift on which fields they accept.
 */
export function coerceSaveOilSampleInput(
  body: Record<string, unknown>
): SaveOilSampleInput | { error: string } {
  const assetId = body.assetId != null ? String(body.assetId).trim() : "";
  const sampleDate =
    body.sampleDate != null ? String(body.sampleDate).trim() : "";
  const operatingHours = optNumeric(body.operatingHours);

  if (!assetId || !sampleDate || operatingHours == null) {
    return { error: "Missing required fields" };
  }

  return {
    assetId,
    sampleDate,
    operatingHours,
    iron: optNumeric(body.iron) ?? 0,
    copper: optNumeric(body.copper) ?? 0,
    chromium: optNumeric(body.chromium) ?? 0,
    lead: optNumeric(body.lead) ?? 0,
    aluminum: optNumeric(body.aluminum) ?? 0,
    silicon: optNumeric(body.silicon) ?? 0,
    tin: optNumeric(body.tin) ?? 0,
    nickel: optNumeric(body.nickel) ?? 0,
    viscosity40C: optNumeric(body.viscosity40C),
    viscosity100C: optNumeric(body.viscosity100C),
    viscosityIndex: optNumeric(body.viscosityIndex),
    acidNumber: optNumeric(body.acidNumber),
    tbn: optNumeric(body.tbn),
    waterPpm: optNumeric(body.waterPpm),
    oxidation: optNumeric(body.oxidation),
    nitration: optNumeric(body.nitration),
    iso4um: optInt(body.iso4um),
    iso6um: optInt(body.iso6um),
    iso14um: optInt(body.iso14um),
    particles4um: optNumeric(body.particles4um),
    particles6um: optNumeric(body.particles6um),
    particles14um: optNumeric(body.particles14um),
    drLarge: optNumeric(body.drLarge),
    drSmall: optNumeric(body.drSmall),
    mpcDeltaE: optNumeric(body.mpcDeltaE),
    rulerPercent: optNumeric(body.rulerPercent),
    ucRating: optIntInRange(body.ucRating, 0, 8),
    morphology: coerceMorphology(body),
    ferrographImageUrl: optText(body.ferrographImageUrl)
  };
}

async function findOilAnalysisId(assetId: string): Promise<string | null> {
  const result = await query(
    "SELECT id FROM oil_analysis WHERE asset_id = $1",
    [assetId]
  );
  return result.rows.length > 0 ? (result.rows[0].id as string) : null;
}

export async function getOrCreateOilAnalysisId(assetId: string): Promise<string> {
  const existingId = await findOilAnalysisId(assetId);
  if (existingId) return existingId;

  const inserted = await query(
    "INSERT INTO oil_analysis (asset_id) VALUES ($1) RETURNING id",
    [assetId]
  );
  return inserted.rows[0].id as string;
}

export async function fetchOilSamplesForAsset(assetId: string) {
  if (!isDbConfigured()) {
    throw new Error("Database is not configured (DATABASE_URL).");
  }

  const analysisId = await getOrCreateOilAnalysisId(assetId);
  const samples = await query(
    `SELECT * FROM oil_samples
     WHERE oil_analysis_id = $1
     ORDER BY sample_date ASC`,
    [analysisId]
  );

  return { analysisId, samples: samples.rows };
}

export async function saveOilSample(input: SaveOilSampleInput) {
  if (!isDbConfigured()) {
    throw new Error("Database is not configured (DATABASE_URL).");
  }

  const {
    assetId,
    sampleDate,
    operatingHours,
    iron = 0,
    copper = 0,
    chromium = 0,
    lead = 0,
    aluminum = 0,
    silicon = 0,
    tin = 0,
    nickel = 0,
    viscosity40C = null,
    viscosity100C = null,
    viscosityIndex = null,
    acidNumber = null,
    tbn = null,
    waterPpm = null,
    oxidation = null,
    nitration = null,
    iso4um = null,
    iso6um = null,
    iso14um = null,
    particles4um = null,
    particles6um = null,
    particles14um = null,
    drLarge = null,
    drSmall = null,
    mpcDeltaE = null,
    rulerPercent = null,
    ucRating = null,
    morphology = null,
    ferrographImageUrl = null
  } = input;

  const morph = (key: MorphCategoryKey): MorphSeverity | null =>
    morphology?.[key] ?? null;

  const analysisId = await getOrCreateOilAnalysisId(assetId);

  const existingSamples = await query(
    `SELECT id FROM oil_samples
     WHERE oil_analysis_id = $1
     ORDER BY sample_date ASC
     LIMIT 1`,
    [analysisId]
  );
  const isFirstSample = existingSamples.rows.length === 0;

  const result = await query(
    `INSERT INTO oil_samples (
      oil_analysis_id,
      sample_date,
      operating_hours,
      iron,
      copper,
      chromium,
      lead,
      aluminum,
      silicon,
      tin,
      nickel,
      viscosity_40c,
      viscosity_100c,
      viscosity_index,
      acid_number,
      tbn,
      water_ppm,
      oxidation,
      nitration,
      iso_4um,
      iso_6um,
      iso_14um,
      particles_4um,
      particles_6um,
      particles_14um,
      dr_large,
      dr_small,
      mpc_delta_e,
      ruler_percent,
      uc_rating,
      morph_rubbing,
      morph_cutting,
      morph_spherical,
      morph_fatigue_chunk,
      morph_severe_sliding,
      morph_corrosive,
      morph_nonmetallic,
      morph_fibers,
      ferrograph_image_url,
      baseline_iron,
      baseline_copper,
      baseline_chromium,
      baseline_lead,
      baseline_aluminum,
      baseline_silicon,
      iron_alarm_limit,
      copper_alarm_limit,
      chromium_alarm_limit,
      lead_alarm_limit,
      aluminum_alarm_limit,
      silicon_alarm_limit
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
      $23, $24, $25,
      $26, $27, $28, $29, $30,
      $31, $32, $33, $34, $35, $36, $37, $38,
      $39,
      $40, $41, $42, $43, $44, $45,
      $46, $47, $48, $49, $50, $51
    )
    RETURNING *`,
    [
      analysisId,
      sampleDate,
      operatingHours,
      iron,
      copper,
      chromium,
      lead,
      aluminum,
      silicon,
      tin,
      nickel,
      viscosity40C,
      viscosity100C,
      viscosityIndex,
      acidNumber,
      tbn,
      waterPpm,
      oxidation,
      nitration,
      iso4um,
      iso6um,
      iso14um,
      particles4um,
      particles6um,
      particles14um,
      drLarge,
      drSmall,
      mpcDeltaE,
      rulerPercent,
      ucRating,
      morph("rubbing"),
      morph("cutting"),
      morph("spherical"),
      morph("fatigue_chunk"),
      morph("severe_sliding"),
      morph("corrosive"),
      morph("nonmetallic"),
      morph("fibers"),
      ferrographImageUrl,
      isFirstSample ? iron : null,
      isFirstSample ? copper : null,
      isFirstSample ? chromium : null,
      isFirstSample ? lead : null,
      isFirstSample ? aluminum : null,
      isFirstSample ? silicon : null,
      DEFAULT_ALARM_LIMITS.iron,
      DEFAULT_ALARM_LIMITS.copper,
      DEFAULT_ALARM_LIMITS.chromium,
      DEFAULT_ALARM_LIMITS.lead,
      DEFAULT_ALARM_LIMITS.aluminum,
      DEFAULT_ALARM_LIMITS.silicon
    ]
  );

  return { sample: result.rows[0], status: 200 as const };
}
