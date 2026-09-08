/**
 * Backfill: give every peak-bearing analysis_results row a deterministic
 * 0-1000 Hz demod (envelope) trace, diagnosis-consistent, flagged
 * "synthesized-from-record". Single source of truth = synthesizeSpectrum.ts.
 *
 * Run: npx tsx backfill-envelopes.ts
 */
import dotenv from "dotenv";
import pg from "pg";
import { synthesizeEnvelopeFromRecord } from "./src/lib/vibration/synthesizeSpectrum";

dotenv.config();

const EXPECT_LACKING = 49;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function hasEnvelope(td: unknown): boolean {
  if (!td || typeof td !== "object" || Array.isArray(td)) return false;
  const o = td as Record<string, unknown>;
  return (
    Array.isArray(o.envelope) &&
    o.envelope.length === 1001 &&
    o.envelope_source === "synthesized-from-record"
  );
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, analysis_type, primary_fault, fault_list, peaks, telemetry_data
     FROM analysis_results ORDER BY timestamp ASC`
  );

  const peakRows = rows.filter((r) => Array.isArray(r.peaks) && r.peaks.length > 0);
  const lacking = peakRows.filter((r) => !hasEnvelope(r.telemetry_data));
  console.log(`Peak-bearing rows lacking a synthesized envelope: ${lacking.length}`);
  for (const r of lacking) {
    console.log(`  - ${String(r.id).slice(0, 8)}  (${r.analysis_type ?? "vibration"} | ${r.primary_fault ?? "?"})`);
  }

  if (lacking.length !== EXPECT_LACKING) {
    console.warn(`NOTE: expected ~${EXPECT_LACKING}, found ${lacking.length}.`);
  }

  let updated = 0;
  for (const r of peakRows) {
    const envelope = synthesizeEnvelopeFromRecord(r.peaks, null, {
      primary: r.primary_fault,
      faults: r.fault_list,
    });
    const patch = { envelope, envelope_source: "synthesized-from-record" };
    await pool.query(
      `UPDATE analysis_results
       SET telemetry_data = COALESCE(telemetry_data, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [r.id, JSON.stringify(patch)]
    );
    updated++;
  }

  console.log(`Updated rows (non-empty peaks): ${updated}`);

  const { rows: remainingRows } = await pool.query(
    `SELECT id, peaks, telemetry_data FROM analysis_results`
  );
  const remaining = remainingRows.filter(
    (r) => Array.isArray(r.peaks) && r.peaks.length > 0 && !hasEnvelope(r.telemetry_data)
  );
  console.log(`Remaining missing (peak-bearing rows without envelope): ${remaining.length}`);

  if (remaining.length !== 0) {
    console.error("ABORT: peak-bearing rows still missing an envelope.");
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