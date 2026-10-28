-- =============================================================================
-- USERS-1 - tenant owner/admin invites and account disable.
--
-- EXISTING SCHEMA (cited before adding anything):
--   * users (server.ts initializeDatabase / migrations/008):
--       id, company_id, username, password_hash, role, is_temp_password,
--       email, created_at, terms_accepted_at.
--     -> There is NO disabled flag, so this migration adds is_disabled.
--   * auth_invites (migrations/008_auth_sessions_rbac.sql /
--     server.ts initializeDatabase):
--       id, token_hash, company_id, role, email, username, created_by,
--       created_at, expires_at, used_at.
--     -> Tenant binding (company_id), invited_by (created_by), token_hash,
--        expires_at and used_at ALREADY EXIST. This migration does NOT add
--        duplicates of those. It only adds the delivery/revocation state the
--        new flow needs: status, sent_at, revoked_at.
--
-- Token rule: raw token = 32 random bytes hex, sent only in the invite email.
-- token_hash stores its SHA-256 hex digest (Node crypto). Resend overwrites
-- token_hash + expires_at, so the previous raw token can never be replayed.
--
-- Safe to re-run: every statement is ADD COLUMN IF NOT EXISTS or
-- CREATE INDEX IF NOT EXISTS. Mirrored idempotently in initializeDatabase()
-- so a fresh boot and a migrated boot converge (DEP-1).
-- =============================================================================

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE auth_invites
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'revoked', 'accepted'));

ALTER TABLE auth_invites
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

ALTER TABLE auth_invites
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_auth_invites_company_status
  ON auth_invites (company_id, status, created_at DESC);

COMMIT;
