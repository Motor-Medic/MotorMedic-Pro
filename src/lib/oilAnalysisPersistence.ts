/**
 * Oil analysis persistence — GET/POST handlers shared by App Router and Express.
 */

import { query, isDbConfigured } from "./db";
import { DEFAULT_ALARM_LIMITS } from "../types/oilAnalysis";

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
  acidNumber?: number | null;
};

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
    acidNumber = null
  } = input;

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
      acid_number,
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
      $12, $13, $14,
      $15, $16, $17, $18, $19, $20,
      $21, $22, $23, $24, $25, $26
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
      acidNumber,
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
