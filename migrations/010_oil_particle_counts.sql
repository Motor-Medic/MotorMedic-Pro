-- =============================================================================
-- MotorMedic Pro — Raw ISO 4406 particle counts (per mL)
--
-- Supports the Cleanliness & Particle Count tab. ISO codes themselves
-- (iso_4um / iso_6um / iso_14um) already exist from migration 009.
--
-- NAS 1638 and SAE AS4059 classes are intentionally NOT stored: they are
-- derived from the ISO codes and are computed on read, so a stored copy can
-- never fall out of sync with the code it came from.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS.
-- =============================================================================

BEGIN;

ALTER TABLE oil_samples
  ADD COLUMN IF NOT EXISTS particles_4um DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS particles_6um DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS particles_14um DECIMAL(12, 2);

COMMIT;
