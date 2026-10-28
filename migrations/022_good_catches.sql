-- =============================================================================
-- GOOD-CATCHES - defects identified BEFORE functional failure, with their
-- avoided value shown as an additive block on the ROI / scorecard page.
--
-- Tenant column matches the real alerts ledger naming: alerts.tenant_id is
-- INTEGER NOT NULL (server.ts AR-29 tenant rollout / migrations/008).
--
-- MONEY RULE: avoided_cost_cents is INTEGER cents. The existing storefront
-- catalog likewise prices in integer minor units as price_cents
-- (src/lib/entitlements.ts:20) and Square's priceMoney.amount is compared
-- directly as cents (server.ts:6858-6865). No floating-point and no
-- dollar-based NUMERIC is introduced by this migration.
--
-- Safe to re-run: CREATE TABLE/INDEX IF NOT EXISTS. Mirrored idempotently in
-- initializeDatabase() so a fresh boot and a migrated boot converge (DEP-1).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS good_catches (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plant_id INTEGER REFERENCES plants(id) ON DELETE SET NULL,
  route_id INTEGER REFERENCES routes(id) ON DELETE SET NULL,
  asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
  component_id INTEGER REFERENCES components(id) ON DELETE SET NULL,
  alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
  work_order_id INTEGER REFERENCES work_orders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  catch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  avoided_cost_cents INTEGER NOT NULL DEFAULT 0
    CHECK (avoided_cost_cents >= 0),
  downtime_hours_avoided NUMERIC(10, 2) NOT NULL DEFAULT 0
    CHECK (downtime_hours_avoided >= 0),
  safety_hazard BOOLEAN NOT NULL DEFAULT FALSE,
  safety_note TEXT,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_good_catches_tenant
  ON good_catches (tenant_id, catch_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_good_catches_tenant_asset
  ON good_catches (tenant_id, asset_id);

CREATE INDEX IF NOT EXISTS idx_good_catches_tenant_work_order
  ON good_catches (tenant_id, work_order_id);

COMMIT;
