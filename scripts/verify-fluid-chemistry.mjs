/**
 * Verifies the Fluid Chemistry tab data path end to end:
 *   1. migration 009 columns exist
 *   2. POST /api/oil-analysis persists every fluid/ISO field
 *   3. GET returns them chronologically
 * Uses a throwaway asset and removes it afterwards.
 */
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const BASE = "http://localhost:3000";
const ASSET = "__FLUID_CHEM_SMOKETEST__";

const EXPECTED_COLUMNS = [
  "viscosity_40c",
  "viscosity_100c",
  "viscosity_index",
  "acid_number",
  "tbn",
  "water_ppm",
  "oxidation",
  "nitration",
  "iso_4um",
  "iso_6um",
  "iso_14um"
];

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const cols = await pool.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'oil_samples'`
);
const present = new Set(cols.rows.map((r) => r.column_name));
const missing = EXPECTED_COLUMNS.filter((c) => !present.has(c));
console.log(
  missing.length === 0
    ? "PASS: all fluid chemistry columns exist"
    : `FAIL: missing columns -> ${missing.join(", ")}`
);

// TAN rising, TBN falling -> should yield a projected crossover.
const ROWS = [
  { sampleDate: "2025-09-15", operatingHours: 2500, iron: 34, copper: 11, chromium: 7, lead: 3, aluminum: 5, silicon: 16, viscosity40C: 46.1, viscosity100C: 6.8, viscosityIndex: 104, acidNumber: 0.55, tbn: 9.4, waterPpm: 110, oxidation: 5.2, nitration: 3.1, iso4um: 20, iso6um: 18, iso14um: 14 },
  { sampleDate: "2025-12-10", operatingHours: 3350, iron: 55, copper: 17, chromium: 11, lead: 5, aluminum: 8, silicon: 23, viscosity40C: 44.0, viscosity100C: 6.5, viscosityIndex: 101, acidNumber: 1.05, tbn: 7.8, waterPpm: 240, oxidation: 8.9, nitration: 4.4, iso4um: 20, iso6um: 18, iso14um: 13 },
  { sampleDate: "2026-06-22", operatingHours: 5050, iron: 108, copper: 29, chromium: 22, lead: 10, aluminum: 13, silicon: 39, viscosity40C: 39.2, viscosity100C: 5.9, viscosityIndex: 96, acidNumber: 2.30, tbn: 5.1, waterPpm: 620, oxidation: 15.7, nitration: 6.8, iso4um: 22, iso6um: 20, iso14um: 16 }
];

// Insert newest-first to also re-confirm the API sorts on read.
for (const row of [ROWS[2], ROWS[0], ROWS[1]]) {
  const res = await fetch(`${BASE}/api/oil-analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetId: ASSET, ...row })
  });
  console.log(`POST ${row.sampleDate} -> ${res.status}${res.ok ? "" : " " + (await res.text())}`);
}

const getRes = await fetch(
  `${BASE}/api/oil-analysis?assetId=${encodeURIComponent(ASSET)}`
);
const body = await getRes.json();
const samples = body.samples || [];
console.log(`\nGET -> ${getRes.status}, ${samples.length} samples`);
console.table(
  samples.map((s) => ({
    date: String(s.sample_date).slice(0, 10),
    hrs: s.operating_hours,
    visc40: s.viscosity_40c,
    VI: s.viscosity_index,
    TAN: s.acid_number,
    TBN: s.tbn,
    water: s.water_ppm,
    ox: s.oxidation,
    nit: s.nitration,
    iso: `${s.iso_4um}/${s.iso_6um}/${s.iso_14um}`
  }))
);

const nulls = EXPECTED_COLUMNS.filter((c) => samples.some((s) => s[c] == null));
console.log(
  nulls.length === 0
    ? "PASS: every fluid chemistry field round-tripped non-null"
    : `FAIL: fields came back null -> ${nulls.join(", ")}`
);

const dates = samples.map((s) => String(s.sample_date).slice(0, 10));
const sorted = [...dates].sort();
console.log(
  JSON.stringify(dates) === JSON.stringify(sorted)
    ? "PASS: samples returned chronologically"
    : `FAIL: out of order -> ${dates.join(", ")}`
);

await pool.query(
  `DELETE FROM oil_samples WHERE oil_analysis_id IN
     (SELECT id FROM oil_analysis WHERE asset_id = $1)`,
  [ASSET]
);
await pool.query("DELETE FROM oil_analysis WHERE asset_id = $1", [ASSET]);
console.log("cleanup: smoketest asset removed");
await pool.end();
