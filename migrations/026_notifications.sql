-- =============================================================================
-- NOTIFICATIONS-1 - email + in-app notification ledger and tenant alert
-- recipient defaults.
--
-- Alert-recipient storage audit (grep before writing this migration):
--   * users.email and alert_preferences (user_id, company_id, email_enabled,
--     alert_threshold) already exist, but there is NO tenant-level editable
--     alert-recipient default list anywhere in the tree.
--   * Therefore this migration adds tenant_alert_recipients below instead of
--     inventing a second meaning for alert_preferences.
--
-- Tenant column naming follows the real ledger convention used by
-- migrations/022_good_catches.sql, 023_bearing_specs.sql, 024 and 025:
--   INTEGER tenant_id NOT NULL REFERENCES companies(id) ON DELETE CASCADE.
-- Every read/write in server.ts derives tenant_id from the verified session
-- only; the client can never supply it.
--
-- status vocabulary:
--   pending = queued (email rows only, before the provider result)
--   sent    = provider accepted / in-app row written
--   failed  = provider or dispatch exception (error is stored)
--   skipped = no provider configured (dev/memory) or no valid recipient
--
-- read_at is required by the bell's mark-read action; it is additive to the
-- NOTIFICATIONS-1 column list.
--
-- Safe to re-run: CREATE TABLE/INDEX IF NOT EXISTS. Mirrored idempotently in
-- initializeDatabase() so a fresh boot and a migrated boot converge (DEP-1).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'in_app')),
  kind TEXT NOT NULL CHECK (kind IN ('alert', 'receipt', 'welcome', 'invite', 'digest')),
  recipient_email TEXT,
  subject TEXT,
  body_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_created
  ON notifications (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user
  ON notifications (tenant_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_alert_recipients (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_alert_recipients_tenant_email
  ON tenant_alert_recipients (tenant_id, LOWER(email));

COMMIT;
