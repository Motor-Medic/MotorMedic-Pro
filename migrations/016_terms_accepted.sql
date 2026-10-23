-- LEGAL-WRAPPER-A (E5/E6) — records WHEN a user accepted the existing legal
-- documents (Terms of Service / Privacy Policy).
--
--   * E5: POST /api/auth/register stamps terms_accepted_at = NOW() on the row
--     it inserts (the route 400s when the client does not send
--     termsAccepted: true, so a registrant always lands with a timestamp).
--   * E6: any account whose column is NULL (bootstrap admin, invited
--     technicians, pre-migration rows) meets the first-login assent
--     interstitial once and is stamped by POST /api/auth/terms-accepted.
--
-- NULL is the correct value for every pre-existing row: no acceptance event
-- was ever recorded for them, and inventing one would forge an assent record.
--
-- Idempotency: ADD COLUMN IF NOT EXISTS is a no-op on re-run. It is still
-- wrapped in a DO block whose EXCEPTION list covers the duplicate family
-- (duplicate_column / duplicate_object) so the migration re-runs cleanly on
-- any database state, matching the swallow set used by the Node builder in
-- initializeDatabase() (42701 / 42P06 / 42P07).

DO $$ BEGIN
  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN null; END $$;
