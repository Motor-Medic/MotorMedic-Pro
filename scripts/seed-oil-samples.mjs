/**
 * Seed a trending series of oil samples for one asset, so the Trend Analyzer
 * "Wear Metals & Debris" tab can be verified end to end.
 *
 *   node scripts/seed-oil-samples.mjs <assetId> [--clear]
 *
 * <assetId> must match the asset tag/id the Trend Analyzer sends to
 * /api/oil-analysis (visible in the network tab as ?assetId=...).
 * Pass --clear to delete existing samples for that asset first.
 */
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const assetId = process.argv[2];
const clear = process.argv.includes("--clear");

if (!assetId) {
  console.error("Usage: node scripts/seed-oil-samples.mjs <assetId> [--clear]");
  process.exit(1);
}

const BASE = process.env.SEED_API_BASE || "http://localhost:3000";

// Six quarterly samples: rising wear, thinning oil, TAN climbing toward a
// falling TBN, water crossing the saturation advisory, ISO codes degrading.
const SAMPLES = [
  { sampleDate: "2025-03-12", operatingHours: 800, iron: 9, copper: 3, chromium: 1, lead: 1, aluminum: 2, silicon: 6, tin: 1, nickel: 1, viscosity40C: 46.5, viscosity100C: 6.8, viscosityIndex: 106, acidNumber: 0.35, tbn: 9.8, waterPpm: 85, oxidation: 3.1, nitration: 2.2, iso4um: 19, iso6um: 17, iso14um: 12 },
  { sampleDate: "2025-06-11", operatingHours: 1650, iron: 18, copper: 6, chromium: 3, lead: 2, aluminum: 3, silicon: 10, tin: 2, nickel: 1, viscosity40C: 45.8, viscosity100C: 6.7, viscosityIndex: 105, acidNumber: 0.52, tbn: 9.1, waterPpm: 120, oxidation: 4.6, nitration: 2.8, iso4um: 20, iso6um: 17, iso14um: 13 },
  { sampleDate: "2025-09-15", operatingHours: 2500, iron: 34, copper: 11, chromium: 7, lead: 3, aluminum: 5, silicon: 16, tin: 3, nickel: 2, viscosity40C: 44.6, viscosity100C: 6.5, viscosityIndex: 103, acidNumber: 0.78, tbn: 8.3, waterPpm: 175, oxidation: 6.4, nitration: 3.4, iso4um: 20, iso6um: 18, iso14um: 13 },
  { sampleDate: "2025-12-10", operatingHours: 3350, iron: 55, copper: 17, chromium: 11, lead: 5, aluminum: 8, silicon: 23, tin: 4, nickel: 3, viscosity40C: 42.7, viscosity100C: 6.2, viscosityIndex: 101, acidNumber: 1.15, tbn: 7.4, waterPpm: 245, oxidation: 8.9, nitration: 4.3, iso4um: 21, iso6um: 19, iso14um: 14 },
  { sampleDate: "2026-03-18", operatingHours: 4200, iron: 79, copper: 23, chromium: 16, lead: 7, aluminum: 10, silicon: 31, tin: 6, nickel: 4, viscosity40C: 40.3, viscosity100C: 5.9, viscosityIndex: 98, acidNumber: 1.54, tbn: 6.3, waterPpm: 380, oxidation: 12.1, nitration: 5.5, iso4um: 21, iso6um: 19, iso14um: 15 },
  { sampleDate: "2026-06-22", operatingHours: 5050, iron: 108, copper: 29, chromium: 22, lead: 10, aluminum: 13, silicon: 39, tin: 8, nickel: 5, viscosity40C: 37.9, viscosity100C: 5.6, viscosityIndex: 95, acidNumber: 1.97, tbn: 5.2, waterPpm: 540, oxidation: 15.8, nitration: 6.9, iso4um: 22, iso6um: 20, iso14um: 16 }
];

if (clear) {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  const { rowCount } = await pool.query(
    `DELETE FROM oil_samples WHERE oil_analysis_id IN
       (SELECT id FROM oil_analysis WHERE asset_id = $1)`,
    [assetId]
  );
  console.log(`Cleared ${rowCount} existing sample(s) for "${assetId}".`);
  await pool.end();
}

for (const sample of SAMPLES) {
  const res = await fetch(`${BASE}/api/oil-analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetId, ...sample })
  });
  if (!res.ok) {
    console.error(`FAILED ${sample.sampleDate}:`, res.status, await res.text());
    process.exit(1);
  }
  console.log(`Seeded ${sample.sampleDate} (Fe ${sample.iron} ppm)`);
}

const verify = await fetch(
  `${BASE}/api/oil-analysis?assetId=${encodeURIComponent(assetId)}`
);
const body = await verify.json();
console.log(
  `\nDone. ${body.samples?.length ?? 0} sample(s) now stored for "${assetId}".`
);
