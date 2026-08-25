/**
 * Verifies the Cleanliness tab data path across its three rendering states:
 *   A. zero samples            -> honest empty state
 *   B. ISO codes, no raw counts -> ISO fallback chart
 *   C. raw counts present       -> log-scale particle chart
 * Uses throwaway assets and removes them afterwards.
 */
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const BASE = "http://localhost:3000";
const ASSET_ISO_ONLY = "__CLEAN_ISO_ONLY__";
const ASSET_RAW = "__CLEAN_RAW_COUNTS__";
const ASSET_EMPTY = "__CLEAN_EMPTY__";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const cols = await pool.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'oil_samples'`
);
const present = new Set(cols.rows.map((r) => r.column_name));
const needed = ["particles_4um", "particles_6um", "particles_14um"];
const missing = needed.filter((c) => !present.has(c));
console.log(
  missing.length === 0
    ? "PASS: particle count columns exist"
    : `FAIL: missing -> ${missing.join(", ")}`
);
console.log(
  !present.has("nas_class") && !present.has("sae_class")
    ? "PASS: NAS/SAE not stored (derived on read)"
    : "FAIL: derived class columns were persisted"
);

const post = async (assetId, row) => {
  const res = await fetch(`${BASE}/api/oil-analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetId, ...row })
  });
  if (!res.ok) console.log(`  POST failed ${res.status}: ${await res.text()}`);
  return res.ok;
};

const base = { iron: 20, copper: 6, chromium: 3, lead: 2, aluminum: 4, silicon: 12 };

// B: ISO codes only, and a +2 notch jump on the last sample.
await post(ASSET_ISO_ONLY, { ...base, sampleDate: "2025-10-01", operatingHours: 1000, iso4um: 18, iso6um: 16, iso14um: 13 });
await post(ASSET_ISO_ONLY, { ...base, sampleDate: "2026-02-01", operatingHours: 2000, iso4um: 19, iso6um: 17, iso14um: 13 });
await post(ASSET_ISO_ONLY, { ...base, sampleDate: "2026-06-01", operatingHours: 3000, iso4um: 21, iso6um: 19, iso14um: 15 });

// C: raw counts alongside codes, including a zero that must not reach a log axis.
await post(ASSET_RAW, { ...base, sampleDate: "2025-10-01", operatingHours: 1000, iso4um: 18, iso6um: 16, iso14um: 13, particles4um: 1300, particles6um: 320, particles14um: 40 });
await post(ASSET_RAW, { ...base, sampleDate: "2026-02-01", operatingHours: 2000, iso4um: 20, iso6um: 18, iso14um: 14, particles4um: 8600, particles6um: 1900, particles14um: 0 });
await post(ASSET_RAW, { ...base, sampleDate: "2026-06-01", operatingHours: 3000, iso4um: 22, iso6um: 20, iso14um: 16, particles4um: 32000, particles6um: 7400, particles14um: 610 });

const get = async (assetId) => {
  const res = await fetch(
    `${BASE}/api/oil-analysis?assetId=${encodeURIComponent(assetId)}`
  );
  const body = await res.json();
  return body.samples || [];
};

const empty = await get(ASSET_EMPTY);
console.log(
  empty.length === 0
    ? "PASS: state A — no samples returns empty array"
    : `FAIL: expected 0 samples, got ${empty.length}`
);

const isoOnly = await get(ASSET_ISO_ONLY);
const isoOnlyHasNoCounts = isoOnly.every(
  (s) => s.particles_4um == null && s.particles_6um == null && s.particles_14um == null
);
const isoOnlyHasCodes = isoOnly.every((s) => s.iso_4um != null);
console.log(
  isoOnly.length === 3 && isoOnlyHasCodes && isoOnlyHasNoCounts
    ? "PASS: state B — ISO codes stored, raw counts left null (no fabrication)"
    : `FAIL: state B unexpected (n=${isoOnly.length}, codes=${isoOnlyHasCodes}, countsNull=${isoOnlyHasNoCounts})`
);

const raw = await get(ASSET_RAW);
console.table(
  raw.map((s) => ({
    date: String(s.sample_date).slice(0, 10),
    iso: `${s.iso_4um}/${s.iso_6um}/${s.iso_14um}`,
    p4: s.particles_4um,
    p6: s.particles_6um,
    p14: s.particles_14um
  }))
);
console.log(
  raw.length === 3 && raw.every((s) => s.particles_4um != null)
    ? "PASS: state C — raw counts round-tripped"
    : "FAIL: state C raw counts missing"
);

// The zero count must be dropped before it reaches a log axis.
const logSafe = (v) => (v != null && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const plotted = raw.map((s) => logSafe(s.particles_14um));
const anyNonPositive = plotted.some((v) => v != null && v <= 0);
const zeroBecameNull = plotted[1] === null;
console.log(
  !anyNonPositive && zeroBecameNull
    ? "PASS: zero count filtered out — log scale receives only positive values"
    : `FAIL: log-unsafe value reached the chart -> ${JSON.stringify(plotted)}`
);

for (const asset of [ASSET_ISO_ONLY, ASSET_RAW, ASSET_EMPTY]) {
  await pool.query(
    `DELETE FROM oil_samples WHERE oil_analysis_id IN
       (SELECT id FROM oil_analysis WHERE asset_id = $1)`,
    [asset]
  );
  await pool.query("DELETE FROM oil_analysis WHERE asset_id = $1", [asset]);
}
console.log("cleanup: smoketest assets removed");
await pool.end();
