-- BLOCKER-12 - oil analysis tables are tenant data.
--
-- Adds tenant_id to both oil tables and backfills it through the owning
-- asset -> route -> plant -> company chain. Unresolvable rows keep the
-- disclosed -1 sentinel; nothing is assigned to another tenant.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS are
-- no-ops on re-run; the backfill only touches rows still at -1.

ALTER TABLE oil_analysis ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT -1;
ALTER TABLE oil_samples  ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT -1;

CREATE INDEX IF NOT EXISTS idx_oil_analysis_tenant ON oil_analysis (tenant_id);
CREATE INDEX IF NOT EXISTS idx_oil_samples_tenant  ON oil_samples (tenant_id);

UPDATE oil_analysis oa
   SET tenant_id = pl.company_id
  FROM assets a
  LEFT JOIN routes r ON r.id = a.route_id
  LEFT JOIN plants pl ON pl.id = r.plant_id
 WHERE oa.tenant_id = -1
   AND (a.id::text = oa.asset_id OR a.tag_number = oa.asset_id OR a.name = oa.asset_id)
   AND pl.company_id IS NOT NULL;

UPDATE oil_samples os
   SET tenant_id = oa.tenant_id
  FROM oil_analysis oa
 WHERE os.oil_analysis_id = oa.id
   AND os.tenant_id = -1
   AND oa.tenant_id <> -1;
