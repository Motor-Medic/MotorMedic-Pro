-- AR-29 — Real authentication, session security & multi-tenancy
-- 008: auth_sessions table, structured-role column, tenant_id rollout
--      with disclosed-sentinel backfill (no silent NULL tenant_ids).
--
-- Sentinel: tenant_id = -1 means "unassigned" — rows carrying it are
-- EXCLUDED from tenant-scoped reads until an operator assigns them.

-- ---------------------------------------------------------------------------
-- Sessions: only the sha256 digest of the 32-byte token is stored.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- users: canonical structured role values (legacy strings remain valid in
-- rows; the server normalizes via normalizeRole() at session load).
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'plant-engineer';

-- ---------------------------------------------------------------------------
-- tenant_id rollout on write-target tables.
-- ---------------------------------------------------------------------------
ALTER TABLE analysis_results   ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT -1;
ALTER TABLE diagnosis_logs     ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT -1;
ALTER TABLE analysis_history   ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT -1;
ALTER TABLE diagnosis_history  ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT -1;
ALTER TABLE work_orders        ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT -1;
ALTER TABLE reports            ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT -1;
ALTER TABLE oil_analysis       ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT -1;

CREATE INDEX IF NOT EXISTS idx_analysis_results_tenant  ON analysis_results (tenant_id);
CREATE INDEX IF NOT EXISTS idx_diagnosis_logs_tenant    ON diagnosis_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_analysis_history_tenant  ON analysis_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_diagnosis_history_tenant ON diagnosis_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_tenant       ON work_orders (tenant_id);

-- ---------------------------------------------------------------------------
-- Backfill: derive tenant from the owning company_id chain where possible.
-- Rows that cannot be derived keep the disclosed sentinel (-1).
-- ---------------------------------------------------------------------------

-- analysis_history → measurement_points → collection_points → components
--                   → assets → routes → plants → company_id
UPDATE analysis_history ah
   SET tenant_id = pl.company_id
  FROM measurement_points mp
  JOIN collection_points cp ON cp.id = mp.collection_point_id
  JOIN components c ON c.id = cp.component_id
  JOIN assets a ON a.id = c.asset_id
  JOIN routes r ON r.id = a.route_id
  JOIN plants pl ON pl.id = r.plant_id
 WHERE ah.measurement_point_id = mp.id
   AND ah.tenant_id = -1
   AND pl.company_id IS NOT NULL;

-- diagnosis_history → asset_id → assets → routes → plants → company_id
UPDATE diagnosis_history dh
   SET tenant_id = pl.company_id
  FROM assets a
  JOIN routes r ON r.id = a.route_id
  JOIN plants pl ON pl.id = r.plant_id
 WHERE dh.asset_id = a.id
   AND dh.tenant_id = -1
   AND pl.company_id IS NOT NULL;

-- diagnosis_history fallback → user_id → users.company_id
UPDATE diagnosis_history dh
   SET tenant_id = u.company_id
  FROM users u
 WHERE dh.user_id = u.id
   AND dh.tenant_id = -1
   AND u.company_id IS NOT NULL;

-- analysis_results / diagnosis_logs / work_orders: asset_id is a TEXT tag
-- (numeric id, tag_number, or name) — derive through assets when resolvable.
UPDATE analysis_results ar
   SET tenant_id = pl.company_id
  FROM assets a
  JOIN routes r ON r.id = a.route_id
  JOIN plants pl ON pl.id = r.plant_id
 WHERE ar.tenant_id = -1
   AND (a.id::text = ar.asset_id OR a.tag_number = ar.asset_id OR a.name = ar.asset_id)
   AND pl.company_id IS NOT NULL;

UPDATE diagnosis_logs dl
   SET tenant_id = pl.company_id
  FROM assets a
  JOIN routes r ON r.id = a.route_id
  JOIN plants pl ON pl.id = r.plant_id
 WHERE dl.tenant_id = -1
   AND (a.id::text = dl.asset_id OR a.tag_number = dl.asset_id OR a.name = dl.asset_id)
   AND pl.company_id IS NOT NULL;

UPDATE work_orders wo
   SET tenant_id = pl.company_id
  FROM assets a
  JOIN routes r ON r.id = a.route_id
  JOIN plants pl ON pl.id = r.plant_id
 WHERE wo.tenant_id = -1
   AND (a.id::text = wo.asset_id OR a.tag_number = wo.asset_id OR a.name = wo.asset_id)
   AND pl.company_id IS NOT NULL;

-- reports carry company_id directly.
UPDATE reports rp
   SET tenant_id = rp.company_id
 WHERE rp.tenant_id = -1
   AND rp.company_id IS NOT NULL;

-- Anything still -1 stays on the disclosed sentinel and is excluded from
-- tenant-scoped reads until assigned by an operator.
