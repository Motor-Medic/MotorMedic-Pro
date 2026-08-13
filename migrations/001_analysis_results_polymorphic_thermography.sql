-- =============================================================================
-- MotorMedic Pro — Polymorphic Thermography columns for analysis_results
-- Phase 1 schema only (no UI / API changes in this step)
-- Safe to re-run: ADD COLUMN IF NOT EXISTS
-- All new columns are NULLABLE for backward compatibility with existing rows
-- =============================================================================

BEGIN;

-- Asset classification (drives Electrical vs Mechanical UI / analysis paths)
ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS asset_type VARCHAR(64) NULL;

-- Electrical thermography
ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS phase_a_temp DOUBLE PRECISION NULL;

ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS phase_b_temp DOUBLE PRECISION NULL;

ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS phase_c_temp DOUBLE PRECISION NULL;

ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS measured_amps DOUBLE PRECISION NULL;

ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS rated_amps DOUBLE PRECISION NULL;

-- Mechanical thermography
ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS de_bearing_temp DOUBLE PRECISION NULL;

ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS ode_bearing_temp DOUBLE PRECISION NULL;

-- Thermal / refractory
ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS refractory_skin_temp DOUBLE PRECISION NULL;

ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS max_allowable_limit DOUBLE PRECISION NULL;

-- Calculated electrical severity support
ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS i2r_normalized_delta_t DOUBLE PRECISION NULL;

-- Optional lookup helper for Trend Analyzer / polymorphic queries
CREATE INDEX IF NOT EXISTS idx_analysis_results_asset_type
  ON analysis_results (asset_type);

CREATE INDEX IF NOT EXISTS idx_analysis_results_asset_type_ts
  ON analysis_results (asset_id, analysis_type, timestamp DESC);

COMMIT;

-- =============================================================================
-- Verification (run after migrate):
--
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'analysis_results'
--   AND column_name IN (
--     'asset_type',
--     'phase_a_temp', 'phase_b_temp', 'phase_c_temp',
--     'measured_amps', 'rated_amps',
--     'de_bearing_temp', 'ode_bearing_temp',
--     'refractory_skin_temp', 'max_allowable_limit',
--     'i2r_normalized_delta_t'
--   )
-- ORDER BY column_name;
-- =============================================================================
