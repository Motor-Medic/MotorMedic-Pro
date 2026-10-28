/**
 * Shared PostgreSQL pool for API routes and server handlers.
 * Mirrors the connection setup in server.ts (DATABASE_URL + pg Pool).
 */

import dotenv from "dotenv";
import pg from "pg";
import {
  buildPoolConfig,
  resolveTlsModeForPool
} from "./dbConnection";

dotenv.config();

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error("Database is not configured (DATABASE_URL).");
    }
    pool = new Pool(
      buildPoolConfig(dbUrl, resolveTlsModeForPool(process.env))
    );
  }
  return pool;
}

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function query(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult> {
  return getPool().query(text, params);
}

/**
 * DEP-2 boot-order gate. Probes the database with SELECT 1, retrying with
 * capped exponential backoff. Used by production startup BEFORE app.listen
 * so Render never routes traffic (or passes /api/health) before the DB is
 * reachable — the cold-start safety lives in boot order, not in a DB-blind
 * health check. Throws after the final attempt so the process exits
 * non-zero instead of serving a lying green.
 */
export interface BootPingable {
  query(text: string): Promise<unknown>;
}

export interface ConnectRetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function connectWithRetry(
  pool: BootPingable,
  options: ConnectRetryOptions = {}
): Promise<void> {
  const attempts = options.attempts ?? 6;
  const baseDelayMs = options.baseDelayMs ?? 2000;
  const maxDelayMs = options.maxDelayMs ?? 10_000;
  const sleep = options.sleep ?? defaultSleep;
  const log = options.log ?? console.log;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await pool.query("SELECT 1");
      if (attempt > 1) {
        log(`[boot] Database reachable on attempt ${attempt}/${attempts}.`);
      }
      return;
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      log(
        `[boot] Database not reachable (attempt ${attempt}/${attempts}); retrying in ${delay}ms...`
      );
      await sleep(delay);
    }
  }
  const detail =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Database not reachable after ${attempts} attempts (DATABASE_URL): ${detail}`
  );
}
