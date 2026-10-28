-- =============================================================================
-- BEARING-CALC - user-entered rolling-element bearing geometry per component.
--
-- NO PROPRIETARY PART-NUMBER DATABASE: this table stores only numbers the user
-- typed plus a free-text reference_label (stored verbatim, never looked up).
-- There is no manufacturer part-number geometry catalog behind it.
--
-- Tenant column matches the real ledger naming: INTEGER tenant_id NOT NULL
-- referencing companies(id) (see migrations/022_good_catches.sql and the
-- existing AR-29 tenant rollout columns).
--
-- Geometry rules mirrored by src/lib/bearingCalc.ts: Z >= 3, Bd > 0, Pd > 0,
-- Bd < Pd, contact angle 0-45 degrees. Bd and Pd are entered in one shared
-- unit (mm or in); only their ratio enters the equations.
--
-- Safe to re-run: CREATE TABLE/INDEX IF NOT EXISTS. Mirrored idempotently in
-- initializeDatabase() so a fresh boot and a migrated boot converge (DEP-1).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS bearing_specs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  component_id INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  z INTEGER NOT NULL CHECK (z >= 3),
  bd NUMERIC(12, 4) NOT NULL CHECK (bd > 0),
  pd NUMERIC(12, 4) NOT NULL CHECK (pd > 0),
  contact_angle NUMERIC(6, 2) NOT NULL DEFAULT 0
    CHECK (contact_angle >= 0 AND contact_angle <= 45),
  unit TEXT NOT NULL DEFAULT 'mm',
  reference_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (bd < pd)
);

CREATE INDEX IF NOT EXISTS idx_bearing_specs_tenant_component
  ON bearing_specs (tenant_id, component_id);

COMMIT;
