/**
 * Backfill: give every peak-bearing analysis_results row a deterministic
 * 501-point trace synthesized from its own stored peaks, flagged
 * "synthesized-from-peaks". Single source of truth = src/lib/vibration/synthesizeSpectrum.ts.
 *
 * Run: npx tsx backfill-spectra.ts
 */
import dotenv from "dotenv";
import pg from "pg";
import { synthesizeSpectrumFromPeaks } from "./src/lib/vibration/synthesizeSpectrum";

dotenv.config();

const EXPECT_LACKING = 51;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function hasSynthesizedTrace(td: unknown): boolean {
  if (!td || typeof td !== "object" || Array.isArray(td)) return false;
  const o = td as Record<string, unknown>;
  return (
    Array.isArray(o.spectral) &&
    o.spectral.length === 501 &&
    o.spectral_source === "synthesized-from-peaks"
  );
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, analysis_type, peaks, telemetry_data FROM analysis_results ORDER BY timestamp ASC`
  );

  const lacking = rows.filter((r) => !hasSynthesizedTrace(r.telemetry_data));
  console.log(`Rows lacking a synthesized 501-point trace: ${lacking.length}`);
  for (const r of lacking) {
    console.log(`  - ${String(r.id).slice(0, 8)}  (${r.analysis_type ?? "vibration"})`);
  }

  if (lacking.length !== EXPECT_LACKING) {
    console.error(
      `ABORT: expected ${EXPECT_LACKING} rows lacking spectral, found ${lacking.length}.`
    );
    await pool.end();
    process.exit(1);
  }

  let updated = 0;
  let skippedNoPeaks = 0;
  for (const r of rows) {
    const peaks = Array.isArray(r.peaks) ? r.peaks : [];
    if (peaks.length === 0) {
      skippedNoPeaks++;
      continue;
    }
    const spectral = synthesizeSpectrumFromPeaks(peaks);
    const patch = { spectral, spectral_source: "synthesized-from-peaks" };
    await pool.query(
      `UPDATE analysis_results
       SET telemetry_data = COALESCE(telemetry_data, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [r.id, JSON.stringify(patch)]
    );
    updated++;
  }

  console.log(`Updated rows (non-empty peaks): ${updated}`);
  console.log(`Skipped rows (no peaks, e.g. thermography): ${skippedNoPeaks}`);

  const { rows: remainingRows } = await pool.query(
    `SELECT id, peaks, telemetry_data FROM analysis_results`
  );
  const remaining = remainingRows.filter(
    (r) => Array.isArray(r.peaks) && r.peaks.length > 0 && !hasSynthesizedTrace(r.telemetry_data)
  );
  console.log(`Remaining missing (peak-bearing rows without trace): ${remaining.length}`);
  for (const r of remaining) console.log(`  - ${r.id}`);

  if (remaining.length !== 0) {
    console.error("ABORT: peak-bearing rows still missing a synthesized trace.");
    await pool.end();
    process.exit(1);
  }

  await pool.end();
  console.log("Backfill complete.");
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});