-- =============================================================================
-- SLICE-A - atomic, honest, batch-handleable hierarchy import.
--
-- Scope audit before writing this migration:
--   * The live write path is POST /api/assets/bulk-import (aliases
--     /api/bulk-import, /api/assets/upload) in server.ts. Its row loop actually
--     INSERTs into plants, routes, assets and components.
--   * It does NOT write collection_points or measurement_points. Those columns
--     are added anyway so a future import writer can stamp the full hierarchy
--     and discard-by-import_id can remove a batch without special cases.
--   * Existing rows keep import_id NULL. Only rows created by one promotion are
--     stamped with that promotion's import_id.
--
-- Tenant naming follows the real ledger convention used by migrations 022-027:
--   INTEGER tenant_id NOT NULL REFERENCES companies(id) ON DELETE CASCADE.
-- Every read/write in server.ts derives the tenant from the verified session
-- only; req.query is never authority.
--
-- Safe to re-run: CREATE TABLE/INDEX IF NOT EXISTS and ADD COLUMN IF NOT EXISTS.
-- Mirrored idempotently in initializeDatabase() so a fresh boot and a migrated
-- boot converge (DEP-1).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS imports (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'hierarchy_bulk_import',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'discarded'))
);

CREATE INDEX IF NOT EXISTS idx_imports_tenant_created
  ON imports (tenant_id, created_at DESC);

ALTER TABLE plants
  ADD COLUMN IF NOT EXISTS import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL;
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL;
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL;
ALTER TABLE components
  ADD COLUMN IF NOT EXISTS import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL;
ALTER TABLE collection_points
  ADD COLUMN IF NOT EXISTS import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL;
ALTER TABLE measurement_points
  ADD COLUMN IF NOT EXISTS import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plants_import_id
  ON plants (import_id) WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_routes_import_id
  ON routes (import_id) WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_import_id
  ON assets (import_id) WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_components_import_id
  ON components (import_id) WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collection_points_import_id
  ON collection_points (import_id) WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_measurement_points_import_id
  ON measurement_points (import_id) WHERE import_id IS NOT NULL;

COMMIT;
