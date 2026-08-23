-- =============================================================================
-- MotorMedic Pro — Oil analysis (wear metals lab results)
-- Matches src/types/oilAnalysis.ts (OilAnalysisRecord, OilSample)
-- Safe to re-run: IF NOT EXISTS on tables and indexes
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Main oil analysis record (one row per asset oil-analysis session / history)
CREATE TABLE IF NOT EXISTS oil_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id TEXT NOT NULL,
  technology_type VARCHAR(20) DEFAULT 'oil_analysis',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Individual lab samples linked to an oil_analysis record
CREATE TABLE IF NOT EXISTS oil_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oil_analysis_id UUID NOT NULL REFERENCES oil_analysis(id) ON DELETE CASCADE,

  sample_date DATE NOT NULL,
  operating_hours INTEGER NOT NULL,

  -- Wear metals (PPM)
  iron DECIMAL(10, 2) DEFAULT 0,
  copper DECIMAL(10, 2) DEFAULT 0,
  chromium DECIMAL(10, 2) DEFAULT 0,
  lead DECIMAL(10, 2) DEFAULT 0,
  aluminum DECIMAL(10, 2) DEFAULT 0,
  silicon DECIMAL(10, 2) DEFAULT 0,
  tin DECIMAL(10, 2) DEFAULT 0,
  nickel DECIMAL(10, 2) DEFAULT 0,

  -- Baseline values (optional; usually set on first sample)
  baseline_iron DECIMAL(10, 2),
  baseline_copper DECIMAL(10, 2),
  baseline_chromium DECIMAL(10, 2),
  baseline_lead DECIMAL(10, 2),
  baseline_aluminum DECIMAL(10, 2),
  baseline_silicon DECIMAL(10, 2),

  -- Alarm limits (customizable per asset; defaults match DEFAULT_ALARM_LIMITS)
  iron_alarm_limit DECIMAL(10, 2) DEFAULT 100,
  copper_alarm_limit DECIMAL(10, 2) DEFAULT 50,
  chromium_alarm_limit DECIMAL(10, 2) DEFAULT 25,
  lead_alarm_limit DECIMAL(10, 2) DEFAULT 30,
  aluminum_alarm_limit DECIMAL(10, 2) DEFAULT 40,
  silicon_alarm_limit DECIMAL(10, 2) DEFAULT 30,

  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oil_samples_analysis ON oil_samples(oil_analysis_id);
CREATE INDEX IF NOT EXISTS idx_oil_analysis_asset ON oil_analysis(asset_id);

COMMIT;

-- =============================================================================
-- Verification:
--
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('oil_analysis', 'oil_samples')
-- ORDER BY table_name, ordinal_position;
-- =============================================================================
