-- =============================================================================
-- MotorMedic Pro — Hybrid polymorphic blob on analysis_results
-- Keeps the 11 dedicated thermography columns; adds flexible JSONB for the rest
-- Safe to re-run: ADD COLUMN IF NOT EXISTS
-- =============================================================================

BEGIN;

ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS telemetry_data JSONB NULL;

CREATE INDEX IF NOT EXISTS idx_analysis_results_telemetry_data_gin
  ON analysis_results USING GIN (telemetry_data);

COMMIT;

-- Verification:
-- SELECT id, asset_id, telemetry_data
-- FROM analysis_results
-- WHERE asset_id = 'PMP030'
-- ORDER BY COALESCE(timestamp, created_at) DESC
-- LIMIT 1;
