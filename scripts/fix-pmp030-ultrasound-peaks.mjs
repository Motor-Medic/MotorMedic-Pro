import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const UPDATE_SQL = `
UPDATE analysis_results ar
SET peaks = (
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN LOWER(COALESCE(e->>'type', '')) = 'ultrasound'
          AND (
            (
              NULLIF(e->>'peak_dbmv', '')::double precision = 38
              AND NULLIF(e->>'rms_dbmv', '')::double precision = 45
            )
            OR (
              NULLIF(e->>'peak_dbuv', '')::double precision = 38
              AND NULLIF(e->>'rms_dbuv', '')::double precision = 45
            )
          )
        THEN e || jsonb_build_object(
          'peak_dbmv', 55,
          'rms_dbmv', 39,
          'crest_factor', round((power(10::numeric, ((55.0 - 39.0) / 20.0)))::numeric, 2)
        )
        ELSE e
      END
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(ar.peaks, '[]'::jsonb)) AS e
)
WHERE (
  COALESCE(ar.asset_id, '') ILIKE '%PMP030%'
  OR COALESCE(ar.component, '') ILIKE '%PMP030%'
)
AND EXISTS (
  SELECT 1
  FROM jsonb_array_elements(COALESCE(ar.peaks, '[]'::jsonb)) AS e
  WHERE LOWER(COALESCE(e->>'type', '')) = 'ultrasound'
    AND (
      (
        NULLIF(e->>'peak_dbmv', '')::double precision = 38
        AND NULLIF(e->>'rms_dbmv', '')::double precision = 45
      )
      OR (
        NULLIF(e->>'peak_dbuv', '')::double precision = 38
        AND NULLIF(e->>'rms_dbuv', '')::double precision = 45
      )
    )
);
`;

async function main() {
  const before = await pool.query(`
    SELECT id, asset_id, analysis_type, peaks, COALESCE(timestamp, created_at) AS ts
    FROM analysis_results
    WHERE COALESCE(asset_id, '') ILIKE '%PMP030%'
      AND (
        peaks::text ILIKE '%ultrasound%'
        OR COALESCE(analysis_type, '') ILIKE '%ultra%'
        OR peaks::text LIKE '%peak_dbmv%'
      )
    ORDER BY ts DESC
    LIMIT 20
  `);
  console.log("BEFORE", JSON.stringify(before.rows, null, 2));

  const bad = await pool.query(`
    SELECT id, asset_id, peaks
    FROM analysis_results
    WHERE peaks::text LIKE '%38%'
      AND peaks::text LIKE '%45%'
      AND peaks::text ILIKE '%ultrasound%'
    LIMIT 20
  `);
  console.log("BAD_CANDIDATES", JSON.stringify(bad.rows, null, 2));

  const doUpdate = process.argv.includes("--apply");
  if (doUpdate) {
    const upd = await pool.query(UPDATE_SQL);
    console.log("UPDATED_ROWS", upd.rowCount);
    const after = await pool.query(`
      SELECT id, asset_id, analysis_type, peaks
      FROM analysis_results
      WHERE COALESCE(asset_id, '') ILIKE '%PMP030%'
        AND peaks::text ILIKE '%ultrasound%'
      ORDER BY COALESCE(timestamp, created_at) DESC
      LIMIT 10
    `);
    console.log("AFTER", JSON.stringify(after.rows, null, 2));
  } else {
    console.log("Dry run only. Pass --apply to write.");
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
