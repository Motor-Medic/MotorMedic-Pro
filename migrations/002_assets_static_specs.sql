-- =============================================================================
-- MotorMedic Pro — Static equipment specs on `assets` (Equipment DB)
-- Safe to re-run: ADD COLUMN IF NOT EXISTS
-- All new columns are NULLABLE so existing assets are unaffected
-- =============================================================================

BEGIN;

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS rated_amps DOUBLE PRECISION NULL;

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS max_allowable_temp DOUBLE PRECISION NULL;

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS bearing_specs JSONB NULL;

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS voltage_rating DOUBLE PRECISION NULL;

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS horsepower DOUBLE PRECISION NULL;

COMMIT;

-- =============================================================================
-- Verification:
--
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'assets'
--   AND column_name IN (
--     'rated_amps', 'max_allowable_temp', 'bearing_specs',
--     'voltage_rating', 'horsepower'
--   )
-- ORDER BY column_name;
-- =============================================================================
