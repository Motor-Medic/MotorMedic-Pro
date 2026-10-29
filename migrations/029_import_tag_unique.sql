-- =============================================================================
-- SLICE-B - tag-keyed idempotent upsert on the bulk-import path.
--
-- STEP 0 evidence that fixed the key shape (measured, not assumed):
--   * assets is the ONLY table the 14603 bulk-import path writes that carries an
--     external tag column (server.ts:17103 tag_number VARCHAR(100)). plants,
--     routes, components, collection_points and measurement_points have no tag
--     column (information_schema query returned only assets.tag_number).
--   * Live duplicate audit: SELECT company_id, tag_number, COUNT(*) FROM assets
--     WHERE tag_number IS NOT NULL GROUP BY 1,2 HAVING COUNT(*) > 1 returned 0
--     rows; the LOWER(BTRIM(tag_number)) variant also returned 0. So the unique
--     key can be added without touching or dropping any live row.
--   * Real tags are external CMMS identities (e.g. TAG-P101A, TAG-P102B) and
--     are unique per tenant. Keeping the key at (company_id, tag_number) - not
--     route-scoped - lets a re-upload heal an asset that legitimately moved
--     routes instead of inserting a second copy.
--   * SOFT-DELETE CHECK: information_schema returned NO deleted_at / is_deleted
--     / deleted column on plants, routes, assets, components, collection_points
--     or measurement_points. Therefore a plain table-level UNIQUE is correct
--     and no partial-index WHERE clause is needed.
--
-- NULL exemption: Postgres treats NULL values as distinct in a UNIQUE
-- constraint/index by default (the opposite of NULLS NOT DISTINCT). Untagged
-- legacy/manual rows therefore never collide with each other or with tagged
-- rows, so the bulk-import path can keep inserting untagged rows as-is.
--
-- Idempotency: ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS, so the
-- creation is wrapped in a DO block that swallows only the duplicate family
-- (duplicate_object / duplicate_table / duplicate_schema), matching
-- migrations/015 and the Node builder in initializeDatabase() (DEP-1).
--
-- The Node builder mirror lives in initializeDatabase() immediately after the
-- migrations/028 block so a fresh boot and a migrated boot converge.
-- =============================================================================

BEGIN;

DO $$ BEGIN
  ALTER TABLE assets
    ADD CONSTRAINT assets_company_tag_number_key
    UNIQUE (company_id, tag_number);
EXCEPTION WHEN duplicate_object OR duplicate_table OR duplicate_schema THEN null; END $$;

COMMIT;
