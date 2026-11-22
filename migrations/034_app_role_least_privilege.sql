-- =============================================================================
-- SEC-15 - least-privilege application database role.
--
-- DRAFT ONLY. NOT APPLIED. No database connection was made while writing this.
-- Run on a Neon branch first; never run against production unreviewed.
--
-- The role is a login role with NO password in this file. Its credential is
-- set out-of-band (secret manager). Migrations keep running as the separate
-- admin/owner role (docs/LAUNCH-READINESS.md, Security item 2).
--
-- Tenant column naming in this schema is NOT uniform. Real columns:
--   company_id -> companies(id), users, plants, tenant_entitlements,
--                 checkout_pending_provisioning, auth_invites, assets,
--                 alert_preferences, reports, tenant_settings
--   tenant_id  -> analysis_results, diagnosis_logs, analysis_history,
--                 diagnosis_history, work_orders, oil_analysis, oil_samples,
--                 alerts, good_catches, bearing_specs, route_assignments,
--                 component_assessments, notifications,
--                 tenant_alert_recipients, imports,
--                 diagnosis_sign_off (031), planning_configs (032),
--                 maintenance_logs (033)
--   no own tenant column, scoped through parent:
--                 units, routes, components, collection_points,
--                 measurement_points
--   global, no tenant column:
--                 auth_sessions, alert_history, diagnosis_feedback,
--                 learning_database, component_spec_templates,
--                 square_webhook_events
--
-- Privileges below are derived from actual call sites in server.ts and
-- src/lib (SELECT / INSERT / UPDATE / DELETE). DROP and ALTER are ownership
-- privileges and are never granted; the app role is never an object owner.
-- =============================================================================

BEGIN;

-- 1) Create the role only if it does not exist. No password, no DDL rights.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'motormedic_app') THEN
    EXECUTE 'CREATE ROLE motormedic_app LOGIN NOSUPERUSER NOCREATEDB '
         || 'NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS';
  END IF;
END
$$;

-- 2) Grants: only SELECT, INSERT, UPDATE, DELETE, only on app-touched tables.
GRANT USAGE ON SCHEMA public TO motormedic_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.assets,
  public.analysis_history,
  public.diagnosis_history,
  public.plants,
  public.collection_points,
  public.users,
  public.good_catches,
  public.bearing_specs,
  public.custom_cmms_templates,
  public.tenant_alert_recipients
TO motormedic_app;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.companies,
  public.analysis_results,
  public.alerts,
  public.auth_invites,
  public.checkout_pending_provisioning,
  public.imports,
  public.notifications,
  public.route_assignments,
  public.tenant_entitlements,
  public.tenant_settings,
  public.planning_configs,
  public.diagnosis_sign_off,
  public.alert_preferences,
  public.component_spec_templates
TO motormedic_app;

GRANT SELECT, INSERT, DELETE ON TABLE
  public.reports,
  public.units,
  public.routes,
  public.components,
  public.measurement_points,
  public.auth_sessions
TO motormedic_app;

GRANT SELECT, INSERT ON TABLE
  public.maintenance_logs,
  public.oil_analysis,
  public.oil_samples,
  public.diagnosis_logs,
  public.learning_database,
  public.square_webhook_events,
  public.alert_history,
  public.component_assessments,
  public.asset_part_history
TO motormedic_app;

-- Read-only in the current codebase (no INSERT/UPDATE/DELETE call site).
GRANT SELECT ON TABLE public.work_orders TO motormedic_app;

-- Insert-only in the current codebase (no read call site found).
GRANT INSERT ON TABLE public.diagnosis_feedback TO motormedic_app;

-- SERIAL primary keys need sequence USAGE for INSERT to work. Scope it to
-- sequences owned by the granted tables; no sequence DDL and no UPDATE
-- (setval) is granted.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS seq
    FROM pg_class c
    JOIN pg_depend d ON d.objid = c.oid AND d.deptype IN ('a', 'i')
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.relkind = 'S'
      AND n.nspname = 'public'
      AND t.relname = ANY (ARRAY[
        'assets', 'analysis_history', 'diagnosis_history', 'plants',
        'collection_points', 'users', 'good_catches', 'bearing_specs',
        'custom_cmms_templates', 'tenant_alert_recipients', 'companies',
        'analysis_results', 'alerts', 'auth_invites',
        'checkout_pending_provisioning', 'imports', 'notifications',
        'route_assignments', 'tenant_entitlements', 'tenant_settings',
        'planning_configs', 'diagnosis_sign_off', 'alert_preferences',
        'component_spec_templates', 'reports', 'units', 'routes',
        'components', 'measurement_points', 'auth_sessions',
        'maintenance_logs', 'oil_analysis', 'oil_samples', 'diagnosis_logs',
        'learning_database', 'square_webhook_events', 'alert_history',
        'component_assessments', 'asset_part_history', 'work_orders',
        'diagnosis_feedback'
      ])
  LOOP
    EXECUTE format(
      'GRANT USAGE, SELECT ON SEQUENCE %s TO motormedic_app', r.seq
    );
  END LOOP;
END
$$;

-- 3) Revoke every other privilege on objects the app must never touch.
--    TRUNCATE / REFERENCES / TRIGGER are removed even where never granted, so
--    a pre-existing broad grant cannot survive this migration.
REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM motormedic_app;
REVOKE UPDATE ON ALL SEQUENCES IN SCHEMA public FROM motormedic_app;

-- Revoke ALL on every public table/partition/view/matview that is not in the
-- app allow-list above. Scoped (not a blanket revoke) so the grants in step 2
-- are preserved.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm')
      AND c.relname <> ALL (ARRAY[
        'assets', 'analysis_history', 'diagnosis_history', 'plants',
        'collection_points', 'users', 'good_catches', 'bearing_specs',
        'custom_cmms_templates', 'tenant_alert_recipients', 'companies',
        'analysis_results', 'alerts', 'auth_invites',
        'checkout_pending_provisioning', 'imports', 'notifications',
        'route_assignments', 'tenant_entitlements', 'tenant_settings',
        'planning_configs', 'diagnosis_sign_off', 'alert_preferences',
        'component_spec_templates', 'reports', 'units', 'routes',
        'components', 'measurement_points', 'auth_sessions',
        'maintenance_logs', 'oil_analysis', 'oil_samples', 'diagnosis_logs',
        'learning_database', 'square_webhook_events', 'alert_history',
        'component_assessments', 'asset_part_history', 'work_orders',
        'diagnosis_feedback'
      ])
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM motormedic_app',
      r.relname
    );
  END LOOP;
END
$$;

REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM motormedic_app;
REVOKE CREATE ON SCHEMA public FROM motormedic_app;

-- 4) Default privileges for objects the migration/owner role creates later.
--    Future tables inherit exactly the four DML privileges, never DDL. A
--    future table holding data the app must not touch must revoke explicitly
--    in its own migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM motormedic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO motormedic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM motormedic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO motormedic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM motormedic_app;

-- 5) Search path: pg_catalog first, then public. public is not mutable by the
--    app role because CREATE on schema public was revoked in step 3.
ALTER ROLE motormedic_app SET search_path = pg_catalog, public;

COMMIT;

-- =============================================================================
-- ROLLBACK (commented). Branch only, never production. Run as admin/owner.
-- =============================================================================
-- BEGIN;
-- REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM motormedic_app;
-- REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM motormedic_app;
-- REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM motormedic_app;
-- REVOKE ALL PRIVILEGES ON SCHEMA public FROM motormedic_app;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public
--   REVOKE ALL ON TABLES FROM motormedic_app;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public
--   REVOKE ALL ON SEQUENCES FROM motormedic_app;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public
--   REVOKE ALL ON FUNCTIONS FROM motormedic_app;
-- ALTER ROLE motormedic_app RESET search_path;
-- DROP ROLE IF EXISTS motormedic_app;
-- COMMIT;

-- =============================================================================
-- VERIFICATION (commented). Human-run on a Neon BRANCH tomorrow, never on
-- production. Expected result is shown at the end of each line.
-- =============================================================================
-- -- 1. Catalog checks, no row data read:
-- SELECT has_table_privilege('motormedic_app', 'public.assets', 'SELECT');   -- t
-- SELECT has_table_privilege('motormedic_app', 'public.assets', 'INSERT');   -- t
-- SELECT has_table_privilege('motormedic_app', 'public.assets', 'UPDATE');   -- t
-- SELECT has_table_privilege('motormedic_app', 'public.assets', 'DELETE');   -- t
-- SELECT has_table_privilege('motormedic_app', 'public.assets', 'TRUNCATE'); -- f
-- SELECT has_table_privilege('motormedic_app', 'public.assets', 'TRIGGER');  -- f
-- SELECT has_schema_privilege('motormedic_app', 'public', 'CREATE');         -- f
--
-- -- 2. Behavioural checks, real tenant columns (assets.company_id,
-- --    alerts.tenant_id):
-- SET ROLE motormedic_app;
-- SELECT count(*) FROM public.assets;                                  -- ok
-- SELECT count(*) FROM public.assets WHERE company_id = -1;            -- ok
-- SELECT count(*) FROM public.alerts WHERE tenant_id = -1;             -- ok
-- DROP TABLE public.alerts;      -- ERROR: must be owner of table alerts
-- TRUNCATE public.assets;        -- ERROR: permission denied for table assets
-- ALTER TABLE public.assets ADD COLUMN sec15_probe integer;
--                                -- ERROR: must be owner of table assets
-- CREATE TABLE public.sec15_probe (id integer);
--                                -- ERROR: permission denied for schema public
-- RESET ROLE;
