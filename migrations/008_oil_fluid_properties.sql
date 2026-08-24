-- =============================================================================
-- MotorMedic Pro — Oil sample fluid chemistry columns (viscosity / TAN)
-- Safe to re-run: IF NOT EXISTS via DO blocks
-- =============================================================================

BEGIN;

ALTER TABLE oil_samples
  ADD COLUMN IF NOT EXISTS viscosity_40c DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS viscosity_100c DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS acid_number DECIMAL(10, 3);

COMMIT;
