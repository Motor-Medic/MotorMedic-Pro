-- =============================================================================
-- Fix legacy PMP030 ultrasound Peak 38 / RMS 45 (invalid: RMS > Peak)
-- → peak_dbmv 55, rms_dbmv 39, crest_factor = 10^((55−39)/20) ≈ 6.31
-- Safe to re-run: only matches the bad 38/45 ultrasound peak entries
-- =============================================================================

BEGIN;

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

COMMIT;

-- Verification:
-- SELECT id, asset_id, peaks
-- FROM analysis_results
-- WHERE asset_id ILIKE '%PMP030%'
--   AND analysis_type ILIKE '%ultrasound%'
-- ORDER BY COALESCE(timestamp, created_at) DESC;
