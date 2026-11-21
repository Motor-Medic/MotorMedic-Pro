-- =============================================================================
-- MotorMedic Pro — Add nullable tenant_id to maintenance_logs (SLICE-SEC-8)
-- WRITE ONLY — do not apply. Additive: adds a column only.
--
-- Parent relation for backfill: maintenance_logs.asset_id ->
-- assets.id (FK); assets.company_id already populated.
-- Rows still NULL after backfill are unassignable; count them with:
--   SELECT COUNT(*) FROM maintenance_logs WHERE tenant_id IS NULL;
-- NOT NULL enforcement is a separate later step (after backfill verified).
--
-- ROLLBACK: ALTER TABLE maintenance_logs DROP COLUMN tenant_id;
-- =============================================================================

BEGIN;

ALTER TABLE maintenance_logs
  ADD COLUMN IF NOT EXISTS tenant_id INTEGER NULL;

-- Backfill tenant from the owning asset.
-- Guarded: only rows still NULL are touched, so re-running is a no-op.
UPDATE maintenance_logs AS ml
SET tenant_id = a.company_id
FROM assets AS a
WHERE ml.asset_id = a.id
  AND ml.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_logs_tenant
  ON maintenance_logs (tenant_id);

COMMIT;
