/**
 * DEP-2 — one-time, env-gated first-admin bootstrap.
 *
 * Runs ONLY when the users table is completely empty: reads
 * BOOTSTRAP_ADMIN_EMAIL + BOOTSTRAP_ADMIN_PASSWORD, bcrypt-hashes the
 * password, and creates exactly one system-admin. Permanently inert once
 * any user exists (the vars can then be deleted from the Render env
 * dashboard — see .env.example). The insert is guarded by
 * WHERE NOT EXISTS (users) so even a raced double-boot cannot mint a
 * second admin.
 */
import { hashPassword } from "./password";

export interface BootstrapQueryable {
  query(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface BootstrapAdminEnv {
  BOOTSTRAP_ADMIN_EMAIL?: string;
  BOOTSTRAP_ADMIN_PASSWORD?: string;
}

export type BootstrapAdminSkipReason =
  | "missing-email"
  | "missing-password"
  | "users-exist"
  | "raced";

export type BootstrapAdminResult =
  | { status: "created"; userId: number | string; email: string }
  | { status: "skipped"; reason: BootstrapAdminSkipReason };

export async function bootstrapFirstAdmin(
  pool: BootstrapQueryable,
  env: BootstrapAdminEnv,
  log: (message: string) => void = console.log
): Promise<BootstrapAdminResult> {
  const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || "";
  const password = env.BOOTSTRAP_ADMIN_PASSWORD || "";

  if (!email) return { status: "skipped", reason: "missing-email" };
  if (!password) return { status: "skipped", reason: "missing-password" };

  // Inert once ANY user exists — the vars are ignored entirely.
  const existing = await pool.query(
    "SELECT COUNT(*)::int AS count FROM users"
  );
  const count = Number(existing.rows[0]?.count ?? 0);
  if (count > 0) return { status: "skipped", reason: "users-exist" };

  const passwordHash = await hashPassword(password);

  // WHERE NOT EXISTS keeps a concurrent/raced boot from minting a second
  // admin; ON CONFLICT covers the UNIQUE username backstop.
  const inserted = await pool.query(
    `INSERT INTO users (company_id, username, password_hash, role, is_temp_password, email)
     SELECT NULL, $1, $2, 'system-admin', FALSE, $1
     WHERE NOT EXISTS (SELECT 1 FROM users)
     ON CONFLICT (username) DO NOTHING
     RETURNING id`,
    [email, passwordHash]
  );

  const row = inserted.rows[0];
  if (!row) return { status: "skipped", reason: "raced" };

  const userId = row.id as number | string;
  log(
    `[bootstrap] Created first system-admin from BOOTSTRAP_ADMIN_* env (id=${userId}, email=${email}). ` +
      `Bootstrap is now permanently inert — delete BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD from the Render env dashboard.`
  );
  return { status: "created", userId, email };
}
