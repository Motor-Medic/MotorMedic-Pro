-- DEP-1b — unique key backing the ON CONFLICT target used by
-- POST /api/cmms/templates (ON CONFLICT (program_name, created_by_tenant)).
-- Without it Postgres raises 42P10 ("no unique or exclusion constraint
-- matching the ON CONFLICT specification") and the route 500s.
--
-- ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS, so the creation is
-- wrapped in a DO block that swallows only the duplicate family — which makes
-- re-running this migration a no-op on an already-migrated database.
--
-- Idempotency correction (measured on PostgreSQL 18.6, not assumed): the
-- constraint's backing index shares the constraint's name, and the relation
-- namespace check fires BEFORE the pg_constraint name check, so a re-run
-- raises 42P07 duplicate_table ("relation ... already exists"), NOT 42710
-- duplicate_object ("constraint ... already exists"). A block catching only
-- duplicate_object therefore re-raises on every second run. The catch list
-- below is the same duplicate-object family the Node builder swallows
-- (42710 / 42P06 / 42P07) so SQL and Node agree on the re-run codes.

DO $$ BEGIN
  ALTER TABLE custom_cmms_templates
    ADD CONSTRAINT custom_cmms_templates_program_name_tenant_key
    UNIQUE (program_name, created_by_tenant);
EXCEPTION WHEN duplicate_object OR duplicate_table OR duplicate_schema THEN null; END $$;
