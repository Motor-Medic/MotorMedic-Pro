-- =============================================================================
-- MotorMedic Pro — Add nullable tenant_id to planning_configs (SLICE-SEC-8)
-- WRITE ONLY — do not apply. Additive: adds a column only.
--
-- No parent relation exists: planning_configs.asset_id is a TEXT PK with no FK
-- to assets (assets.id is INTEGER SERIAL; asset_id only loosely matches tag
-- text). tenant_id is left NULL for every row; all rows are unassignable.
-- Count unassignable rows with:
--   SELECT COUNT(*) FROM planning_configs WHERE tenant_id IS NULL;
-- NOT NULL enforcement is a separate later step (after backfill verified).
--
-- ROLLBACK: ALTER TABLE planning_configs DROP COLUMN tenant_id;
-- =============================================================================

BEGIN;

ALTER TABLE planning_configs
  ADD COLUMN IF NOT EXISTS tenant_id INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_planning_configs_tenant
  ON planning_configs (tenant_id);

COMMIT;
