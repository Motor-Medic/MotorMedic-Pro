import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  // Recalc crest (+ delta) for PMP030 ultrasound peaks that already have Peak 55 / RMS 39
  // but still store crest as peak/rms (≈1.41).
  const upd = await pool.query(`
    UPDATE analysis_results ar
    SET peaks = (
      SELECT COALESCE(
        jsonb_agg(
          CASE
            WHEN LOWER(COALESCE(e->>'type', '')) = 'ultrasound'
              AND NULLIF(e->>'peak_dbmv', '')::double precision = 55
              AND NULLIF(e->>'rms_dbmv', '')::double precision = 39
            THEN e || jsonb_build_object(
              'crest_factor', round((power(10::numeric, ((55.0 - 39.0) / 20.0)))::numeric, 2),
              'delta_db', round(
                (
                  55.0 - COALESCE(NULLIF(e->>'baseline_dbmv', '')::double precision, 28)
                )::numeric,
                1
              )
            )
            ELSE e
          END
        ),
        '[]'::jsonb
      )
      FROM jsonb_array_elements(COALESCE(ar.peaks, '[]'::jsonb)) AS e
    )
    WHERE COALESCE(ar.asset_id, '') ILIKE '%PMP030%'
      AND peaks::text ILIKE '%ultrasound%'
    RETURNING id, peaks
  `);
  console.log("UPDATED", upd.rowCount, JSON.stringify(upd.rows, null, 2));

  const verify = await pool.query(`
    SELECT id, asset_id, analysis_type, peaks
    FROM analysis_results
    WHERE asset_id ILIKE '%PMP030%'
      AND peaks::text ILIKE '%ultrasound%'
    ORDER BY COALESCE(timestamp, created_at) DESC
  `);
  console.log("VERIFY", JSON.stringify(verify.rows, null, 2));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
