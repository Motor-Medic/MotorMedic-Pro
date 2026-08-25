-- =============================================================================
-- MotorMedic Pro — Certified engineer sign-off on a saved diagnosis
--
-- One row per analysis_results record. A diagnosis with no row here is
-- implicitly 'pending' — we do not pre-seed pending rows, so the absence of a
-- record and an explicit pending record mean the same thing to the UI.
--
-- ON DELETE CASCADE: a sign-off has no meaning once its diagnosis is gone.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS diagnosis_sign_off (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id UUID NOT NULL UNIQUE
    REFERENCES analysis_results(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'modified')),
  engineer_name TEXT,
  override_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diagnosis_sign_off_diagnosis_id
  ON diagnosis_sign_off (diagnosis_id);

COMMIT;
