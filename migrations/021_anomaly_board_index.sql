-- =============================================================================
-- ANOMALY-BOARD - composite index for the session-tenant open-anomaly read.
--
-- The real schema columns are the ones the alerts ledger actually uses:
--   company/tenant -> alerts.tenant_id
--   status         -> alerts.acknowledged  (open = acknowledged IS NOT TRUE;
--                     the dashboard already uses this status vocabulary)
--   severity       -> alerts.severity      (CHECK IN ('HIGH','MEDIUM','LOW'))
--
-- Safe to re-run: CREATE INDEX IF NOT EXISTS. Mirrored idempotently in
-- initializeDatabase() so a fresh boot and a migrated boot converge.
-- =============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_alerts_tenant_ack_severity
  ON alerts (tenant_id, acknowledged, severity);

COMMIT;
