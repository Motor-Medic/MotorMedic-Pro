-- =============================================================================
-- MotorMedic Pro — Oil sample contamination & chemistry columns
--
-- Extends oil_samples for the Fluid Chemistry & Contamination tab.
-- Viscosity @40/@100 and TAN already exist from migration 008 as
-- viscosity_40c / viscosity_100c / acid_number and are reused here rather than
-- duplicated, so a single measurement never lands in two columns.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS.
-- =============================================================================

BEGIN;

ALTER TABLE oil_samples
  ADD COLUMN IF NOT EXISTS viscosity_index DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS tbn DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS water_ppm DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS oxidation DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS nitration DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS iso_4um INTEGER,
  ADD COLUMN IF NOT EXISTS iso_6um INTEGER,
  ADD COLUMN IF NOT EXISTS iso_14um INTEGER;

COMMIT;
