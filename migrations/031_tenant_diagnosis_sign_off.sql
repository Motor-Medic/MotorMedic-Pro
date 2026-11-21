-- =============================================================================
-- MotorMedic Pro — Add nullable tenant_id to diagnosis_sign_off (SLICE-SEC-8)
-- WRITE ONLY — do not apply. Additive: adds a column only.
--
-- Parent relation for backfill: diagnosis_sign_off.diagnosis_id ->
-- analysis_results.id (analysis_results.tenant_id already populated by 008).
-- Rows still NULL after backfill are unassignable; count them with:
--   SELECT COUNT(*) FROM diagnosis_sign_off WHERE tenant_id IS NULL;
-- NOT NULL enforcement is a separate later step (after backfill verified).
--
-- ROLLBACK: ALTER TABLE diagnosis_sign_off DROP COLUMN tenant_id;
-- =============================================================================

BEGIN;

ALTER TABLE diagnosis_sign_off
  ADD COLUMN IF NOT EXISTS tenant_id INTEGER NULL;

-- Backfill tenant from the owning diagnosis (analysis_results).
-- Guarded: only rows still NULL are touched, so re-running is a no-op.
UPDATE diagnosis_sign_off AS dso
SET tenant_id = ar.tenant_id
FROM analysis_results AS ar
WHERE dso.diagnosis_id = ar.id
  AND dso.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_diagnosis_sign_off_tenant
  ON diagnosis_sign_off (tenant_id);

COMMIT;
