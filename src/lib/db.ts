/**
 * Shared PostgreSQL pool for API routes and server handlers.
 * Mirrors the connection setup in server.ts (DATABASE_URL + pg Pool).
 */

import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error("Database is not configured (DATABASE_URL).");
    }
    pool = new Pool({
      connectionString: dbUrl,
      connectionTimeoutMillis: 15000,
      ssl: {
        rejectUnauthorized: false
      }
    });
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
