-- =============================================================================
-- MotorMedic Pro — Persisted multi-technology assessment reports
--
-- A report is a point-in-time consolidation of every technology that had
-- telemetry for one asset. It stores the measured values themselves rather
-- than a pointer to them, so reopening a report six months later shows the
-- numbers as they were at save time even if newer samples have since landed.
--
-- technology_summary is the whole point of the table: one entry per
-- technology, each carrying its measured readings and an explicit
-- "hasData: false" when nothing was recorded. Rehydration is therefore a
-- straight read with no recomputation, which is what makes the round trip
-- value-identical.
--
-- company_id is denormalised onto the row. Reports outlive the asset
-- hierarchy they were generated from, so resolving the tenant through
-- assets -> routes -> plants at read time would break once an asset is
-- re-routed or deleted.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id TEXT NOT NULL,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  title TEXT,
  -- Measured values per technology, keyed by technology id.
  technology_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Worst severity across every technology that reported data.
  overall_severity VARCHAR(16) NOT NULL DEFAULT 'NORMAL'
    CHECK (overall_severity IN ('CRITICAL', 'ANOMALY', 'NORMAL', 'NO_DATA')),
  fault_diagnoses JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Technologies that contributed at least one reading, for cheap filtering.
  technologies_with_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_asset_id ON reports (asset_id);
CREATE INDEX IF NOT EXISTS idx_reports_company_id ON reports (company_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC);

COMMIT;
