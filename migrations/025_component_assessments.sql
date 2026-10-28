-- =============================================================================
-- ASSESSMENT-WIZARD - one standardized component evaluation per wizard run.
--
-- Tenant column matches the real ledger naming: INTEGER tenant_id NOT NULL
-- referencing companies(id) (see migrations/022_good_catches.sql / 023).
-- Every row is tenant-scoped from birth; reads and writes in server.ts derive
-- the tenant exclusively from the verified session.
--
-- disposition mirrors src/lib/assessmentWizard.ts ASSESSMENT_DISPOSITIONS:
--   none    = No Identifiable Defect
--   anomaly = Anomaly Present
--   defect  = Defect Identified
--   unable  = Unable to Complete Assessment
-- The CHECK constraint is the last line of defence if a future caller skips
-- the shared validator.
--
-- failure_mode_key is validated against src/lib/failureModes.ts in the API.
-- metadata_missing_at_assessment is a TEXT[] snapshot of the REQUIRED field
-- keys that were still null/empty when the assessment was saved.
--
-- Safe to re-run: CREATE TABLE/INDEX IF NOT EXISTS. Mirrored idempotently in
-- initializeDatabase() so a fresh boot and a migrated boot converge (DEP-1).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS component_assessments (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  component_id INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
  failure_mode_key TEXT,
  disposition TEXT NOT NULL
    CHECK (disposition IN ('none', 'anomaly', 'defect', 'unable')),
  notes TEXT,
  metadata_missing_at_assessment TEXT[],
  assessed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_component_assessments_tenant_component
  ON component_assessments (tenant_id, component_id, assessed_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_component_assessments_tenant_alert
  ON component_assessments (tenant_id, alert_id);

COMMIT;
