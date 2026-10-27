-- T3 - tenant-scoped hierarchy backfill.
--
-- Adds an explicit owning company to assets so a route-less asset can be
-- attached to its OWN tenant's is_system route. Never fall back to the
-- globally-lowest system route or the globally-first company: a row with no
-- derivable lineage stays unassigned instead of moving across tenants.
--
-- Idempotency: ADD COLUMN IF NOT EXISTS plus the same duplicate-family
-- exception set used by migrations/017 (duplicate_column / duplicate_object /
-- duplicate_table), mirroring initializeDatabase().

DO $$ BEGIN
  ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column OR duplicate_object OR duplicate_table THEN null; END $$;

-- Route-backed legacy assets inherit their company from their own lineage.
UPDATE assets a
   SET company_id = pl.company_id
  FROM routes r
  JOIN plants pl ON pl.id = r.plant_id
 WHERE a.route_id = r.id
   AND a.company_id IS NULL
   AND pl.company_id IS NOT NULL;

-- Find-or-create each tenant plant's system route, then attach only that
-- tenant's NULL-route assets to it (company_id is the row's own lineage).
DO $$
DECLARE
  p RECORD;
  system_route_id INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM assets WHERE route_id IS NULL) THEN
    FOR p IN SELECT id, company_id FROM plants WHERE company_id IS NOT NULL LOOP
      INSERT INTO routes (plant_id, name, description, is_system)
      SELECT p.id, 'System (Simple Mode)',
             'Auto-created route for assets added without a route.', TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM routes
         WHERE plant_id = p.id AND is_system = TRUE
      );
      SELECT id INTO system_route_id
        FROM routes
       WHERE plant_id = p.id AND is_system = TRUE
       ORDER BY id ASC
       LIMIT 1;
      IF system_route_id IS NOT NULL THEN
        UPDATE assets SET route_id = system_route_id WHERE route_id IS NULL AND company_id = p.company_id;
      END IF;
    END LOOP;
  END IF;
END $$;
