/**
 * Verifies the Ferrography & Varnish data path:
 *   1. migration 011 columns exist, derived indices are NOT stored
 *   2. POST persists DR / MPC / RULER / UC / morphology / image URL
 *   3. invalid morphology severities and out-of-range UC are rejected
 *   4. GET returns everything chronologically
 * Uses a throwaway asset and removes it afterwards.
 */
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const BASE = "http://localhost:3000";
const ASSET = "__FERRO_SMOKETEST__";

const EXPECTED = [
  "dr_large", "dr_small", "mpc_delta_e", "ruler_percent", "uc_rating",
  "morph_rubbing", "morph_cutting", "morph_spherical", "morph_fatigue_chunk",
  "morph_severe_sliding", "morph_corrosive", "morph_nonmetallic", "morph_fibers",
  "ferrograph_image_url"
];
const MUST_NOT_EXIST = ["wpc", "wsi", "plp", "dl_ds_ratio", "varnish_risk_index"];

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const cols = await pool.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'oil_samples'`
);
const present = new Set(cols.rows.map((r) => r.column_name));
const missing = EXPECTED.filter((c) => !present.has(c));
console.log(
  missing.length === 0
    ? "PASS: all ferrography columns exist"
    : `FAIL: missing -> ${missing.join(", ")}`
);
const leaked = MUST_NOT_EXIST.filter((c) => present.has(c));
console.log(
  leaked.length === 0
    ? "PASS: derived indices not stored (WPC/WSI/PLP computed on read)"
    : `FAIL: derived columns persisted -> ${leaked.join(", ")}`
);

const base = { iron: 20, copper: 6, chromium: 3, lead: 2, aluminum: 4, silicon: 12 };

const post = async (row) => {
  const res = await fetch(`${BASE}/api/oil-analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetId: ASSET, ...row })
  });
  if (!res.ok) console.log(`  POST failed ${res.status}: ${await res.text()}`);
  return res.ok;
};

// MPC rising toward 30, RULER falling toward 25 -> both should project.
await post({ ...base, sampleDate: "2025-09-01", operatingHours: 1000, drLarge: 12, drSmall: 8, mpcDeltaE: 8.5, rulerPercent: 92, ucRating: 1, morphology: { rubbing: "mild" }, ferrographImageUrl: "https://example.test/ferro-1.png" });
await post({ ...base, sampleDate: "2026-01-15", operatingHours: 2400, drLarge: 26, drSmall: 11, mpcDeltaE: 15.2, rulerPercent: 71, ucRating: 3, morphology: { rubbing: "mild", cutting: "trace" } });
await post({ ...base, sampleDate: "2026-06-20", operatingHours: 4000, drLarge: 48, drSmall: 14, mpcDeltaE: 23.9, rulerPercent: 48, ucRating: 5, morphology: { rubbing: "moderate", cutting: "moderate", spherical: "severe" }, ferrographImageUrl: "https://example.test/ferro-3.png" });

// Hostile input: unknown severity, out-of-range UC.
await post({ ...base, sampleDate: "2026-07-01", operatingHours: 4200, ucRating: 47, morphology: { rubbing: "CATASTROPHIC", cutting: "Moderate" } });

const res = await fetch(
  `${BASE}/api/oil-analysis?assetId=${encodeURIComponent(ASSET)}`
);
const samples = (await res.json()).samples || [];
console.log(`\nGET -> ${res.status}, ${samples.length} samples`);
console.table(
  samples.map((s) => ({
    date: String(s.sample_date).slice(0, 10),
    DL: s.dr_large,
    DS: s.dr_small,
    MPC: s.mpc_delta_e,
    RULER: s.ruler_percent,
    UC: s.uc_rating,
    rubbing: s.morph_rubbing,
    cutting: s.morph_cutting,
    spherical: s.morph_spherical,
    img: s.ferrograph_image_url ? "yes" : "—"
  }))
);

const trended = samples.slice(0, 3);
const allFields = ["dr_large", "dr_small", "mpc_delta_e", "ruler_percent", "uc_rating"];
const nulls = allFields.filter((f) => trended.some((s) => s[f] == null));
console.log(
  nulls.length === 0
    ? "PASS: DR / MPC / RULER / UC round-tripped non-null"
    : `FAIL: null fields -> ${nulls.join(", ")}`
);
console.log(
  samples[0].morph_rubbing === "mild" && samples[2].morph_spherical === "severe"
    ? "PASS: morphology severities persisted"
    : "FAIL: morphology not persisted correctly"
);
console.log(
  samples[0].ferrograph_image_url === "https://example.test/ferro-1.png"
    ? "PASS: ferrograph image URL persisted"
    : "FAIL: image URL not persisted"
);

const hostile = samples[3];
console.log(
  hostile.morph_rubbing === null
    ? "PASS: unknown severity rejected (stored as null)"
    : `FAIL: bad severity written -> ${hostile.morph_rubbing}`
);
console.log(
  hostile.morph_cutting === "moderate"
    ? "PASS: mixed-case severity normalized"
    : `FAIL: expected 'moderate', got ${hostile.morph_cutting}`
);
console.log(
  Number(hostile.uc_rating) === 8
    ? "PASS: UC rating clamped to 0-8"
    : `FAIL: UC not clamped -> ${hostile.uc_rating}`
);

const dates = samples.map((s) => String(s.sample_date).slice(0, 10));
console.log(
  JSON.stringify(dates) === JSON.stringify([...dates].sort())
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
