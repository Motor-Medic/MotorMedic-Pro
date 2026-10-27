-- STOREFRONT (E1/E3/E4) - module entitlements + server-held checkout mapping.
--
-- Entitlements are MODULE-based only: a tenant either has an active row for
-- a catalog key (vibration | thermography | ultrasound | oil) or it does not.
-- There is intentionally no capacity / usage / seat limit anywhere here.
--
-- Idempotency: CREATE TABLE/INDEX IF NOT EXISTS plus ADD COLUMN IF NOT
-- EXISTS are no-ops on re-run, mirroring initializeDatabase() (DEP-1 style).

CREATE TABLE IF NOT EXISTS tenant_entitlements (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'canceled')),
  stripe_subscription_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_entitlements_company
  ON tenant_entitlements (company_id);
CREATE INDEX IF NOT EXISTS idx_tenant_entitlements_status
  ON tenant_entitlements (company_id, status);

-- Server-held checkout mapping. The browser never supplies a company_id:
-- checkout/create writes the chosen modules + generated account placeholder
-- here, keyed by the Stripe Checkout Session id, and the webhook reads it
-- back to provision the NEW tenant. checkout_ref is the value carried in
-- Stripe metadata / client_reference_id so a retried session is resolvable.
CREATE TABLE IF NOT EXISTS checkout_pending_provisioning (
  id SERIAL PRIMARY KEY,
  checkout_session_id TEXT NOT NULL UNIQUE,
  checkout_ref TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  admin_username TEXT NOT NULL,
  admin_email TEXT,
  password_hash TEXT NOT NULL,
  terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  module_keys TEXT[] NOT NULL DEFAULT '{}',
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  admin_user_id INTEGER,
  plant_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'provisioning', 'provisioned', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkout_pending_status
  ON checkout_pending_provisioning (status);

-- Webhook replay memory. Inserted only after a handler completes, so a
-- transient failure still lets Stripe retry the same event.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
