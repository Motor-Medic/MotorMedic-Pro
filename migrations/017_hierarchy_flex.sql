-- H4 - hierarchy flexibility (flat assets + invisible system route).
--
--   * routes.is_system marks the single per-plant route named
--     'System (Simple Mode)' that holds assets added without a route.
--   * route_id stays NULLABLE on purpose (do not add NOT NULL yet).
--
-- Idempotency: ADD COLUMN IF NOT EXISTS is a no-op on re-run. It is still
-- wrapped in a DO block whose EXCEPTION list covers the duplicate family
-- (duplicate_column / duplicate_object) so the migration re-runs cleanly on
-- any database state, matching the swallow set used by the Node builder in
-- initializeDatabase() (42701 / 42P06 / 42P07).

DO $$ BEGIN
  ALTER TABLE routes
    ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN null; END $$;

-- H5 client persistence support: units above routes. Kept idempotent so a
-- populated database picks the tables up without a destructive rebuild.
CREATE TABLE IF NOT EXISTS units (
  id SERIAL PRIMARY KEY,
  plant_id INTEGER REFERENCES plants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  ALTER TABLE routes
    ADD COLUMN IF NOT EXISTS unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column OR duplicate_object THEN null; END $$;

-- Backfill - find-or-create each plant's system route, then attach the
-- NULL-route assets to it. Such assets carry no plant linkage in the schema,
-- so the deterministic fallback is the lowest-id system route.
DO $$
DECLARE
  p RECORD;
  system_route_id INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM assets WHERE route_id IS NULL) THEN
    FOR p IN SELECT id FROM plants LOOP
      INSERT INTO routes (plant_id, name, description, is_system)
      SELECT p.id, 'System (Simple Mode)',
             'Auto-created route for assets added without a route.', TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM routes
         WHERE plant_id = p.id AND is_system = TRUE
      );
    END LOOP;
    SELECT MIN(id) INTO system_route_id FROM routes WHERE is_system = TRUE;
    IF system_route_id IS NOT NULL THEN
      UPDATE assets SET route_id = system_route_id WHERE route_id IS NULL;
    END IF;
  END IF;
END $$;
