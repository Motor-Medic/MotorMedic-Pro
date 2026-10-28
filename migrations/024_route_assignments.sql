-- =============================================================================
-- ROUTE-CHECKOUT - one analyst checks a route out at a time, then checks it
-- back in with a timestamp and notes. Small state model only:
--
--   unassigned (no open row) -> checked_out -> checked_in -> closed
--
-- No SLA engine and no other states are introduced by this slice.
--
-- DOUBLE-CHECKOUT LOCK LIVES IN THE DATABASE: the partial UNIQUE index below
-- makes a second row with status = 'checked_out' for the same route fail in
-- PostgreSQL (SQLSTATE 23505), even if two requests race past the app check.
--
-- Tenant column matches the real ledger naming: routes are tenant-scoped
-- through plants.company_id, and route_assignments.tenant_id is the same
-- INTEGER NOT NULL companies(id) convention as migrations/022 and 023.
--
-- Safe to re-run: CREATE TABLE/INDEX IF NOT EXISTS. Mirrored idempotently in
-- initializeDatabase() so a fresh boot and a migrated boot converge (DEP-1).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS route_assignments (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL
    CHECK (status IN ('checked_out', 'checked_in', 'closed')),
  checked_out_at TIMESTAMPTZ,
  checked_in_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_route_assignments_tenant_status
  ON route_assignments (tenant_id, status, id DESC);

CREATE INDEX IF NOT EXISTS idx_route_assignments_tenant_route
  ON route_assignments (tenant_id, route_id);

CREATE UNIQUE INDEX IF NOT EXISTS route_assignments_active_unique
  ON route_assignments (route_id) WHERE status = 'checked_out';

COMMIT;
