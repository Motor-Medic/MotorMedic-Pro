-- SLICE-H2 - per-tenant display preferences.
--
-- Display units are presentation-only. Canonical storage/computation stays
-- mm/s RMS (velocity), g (acceleration) and Hz (frequency); this row only
-- records what the tenant's users SEE. Company scoping is enforced by the
-- server from the verified session, never by a client-supplied company_id.
--
-- Idempotency: CREATE TABLE IF NOT EXISTS + a canonical JSONB default mirror
-- initializeDatabase(), so a fresh boot and a migrated boot converge.

CREATE TABLE IF NOT EXISTS tenant_settings (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  display_units JSONB NOT NULL DEFAULT
    '{"velocity":"mm/s","acceleration":"g","frequency":"Hz"}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
