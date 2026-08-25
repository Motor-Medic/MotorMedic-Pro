/**
 * Verifies engineer sign-off persistence:
 *   1. diagnosis_sign_off table + FK/unique constraints exist
 *   2. a fresh diagnosis reads back as null (pending), not a 404
 *   3. approve persists and re-reads identically (survives reload)
 *   4. re-signing the same diagnosis updates in place, never duplicates
 *   5. validation rejects bad status, missing engineer, unexplained modify,
 *      and unknown diagnosis ids
 *   6. deleting the diagnosis cascades the sign-off away
 */
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const BASE = "http://localhost:3000";
const ASSET = "__SIGNOFF_SMOKETEST__";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const cols = await pool.query(
  `SELECT column_name FROM information_schema.columns
   WHERE table_name = 'diagnosis_sign_off'`
);
const present = new Set(cols.rows.map((r) => r.column_name));
const expected = [
  "id", "diagnosis_id", "status", "engineer_name",
  "override_note", "created_at", "updated_at"
];
const missing = expected.filter((c) => !present.has(c));
console.log(
  missing.length === 0
    ? "PASS: diagnosis_sign_off has all columns"
    : `FAIL: missing -> ${missing.join(", ")}`
);

const uniq = await pool.query(
  `SELECT COUNT(*)::int AS n FROM pg_constraint
   WHERE conrelid = 'diagnosis_sign_off'::regclass AND contype = 'u'`
);
console.log(
  uniq.rows[0].n >= 1
    ? "PASS: unique constraint on diagnosis_id (one sign-off per diagnosis)"
    : "FAIL: no unique constraint — duplicates possible"
);

// Create a diagnosis to sign off against.
const created = await pool.query(
  `INSERT INTO analysis_results (asset_id, primary_fault, severity, health_score)
   VALUES ($1, 'Outer Race Bearing Defect (BPFO)', 'CRITICAL', 38)
   RETURNING id`,
  [ASSET]
);
const diagnosisId = created.rows[0].id;

const get = async (id) => {
  const res = await fetch(
    `${BASE}/api/diagnosis-sign-off?diagnosisId=${encodeURIComponent(id)}`
  );
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const post = async (body) => {
  const res = await fetch(`${BASE}/api/diagnosis-sign-off`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const fresh = await get(diagnosisId);
console.log(
  fresh.status === 200 && fresh.body.signOff === null
    ? "PASS: unsigned diagnosis reads as null (pending), HTTP 200"
    : `FAIL: expected 200 + null, got ${fresh.status} ${JSON.stringify(fresh.body.signOff)}`
);

const approved = await post({
  diagnosisId,
  status: "approved",
  engineerName: "J. Rivera, CAT III"
});
console.log(
  approved.status === 200 && approved.body.signOff?.status === "approved"
    ? "PASS: approval persisted"
    : `FAIL: approve returned ${approved.status} ${JSON.stringify(approved.body)}`
);

const reread = await get(diagnosisId);
console.log(
  reread.body.signOff?.engineer_name === "J. Rivera, CAT III" &&
    reread.body.signOff?.status === "approved"
    ? "PASS: sign-off survives a fresh read (persists across reload)"
    : `FAIL: re-read mismatch -> ${JSON.stringify(reread.body.signOff)}`
);

const modified = await post({
  diagnosisId,
  status: "modified",
  engineerName: "K. Osei, CAT II",
  overrideNote: "Reclassified as inner race; BPFI sidebands dominate."
});
const rows = await pool.query(
  `SELECT COUNT(*)::int AS n FROM diagnosis_sign_off WHERE diagnosis_id = $1`,
  [diagnosisId]
);
console.log(
  modified.body.signOff?.status === "modified" && rows.rows[0].n === 1
    ? "PASS: re-signing updates in place (1 row, not a duplicate)"
    : `FAIL: expected 1 updated row, got ${rows.rows[0].n} rows / ${JSON.stringify(modified.body)}`
);
console.log(
  modified.body.signOff?.override_note?.includes("inner race")
    ? "PASS: override note stored"
    : "FAIL: override note not stored"
);

const badStatus = await post({ diagnosisId, status: "rubber-stamped", engineerName: "X" });
console.log(
  badStatus.status === 400
    ? "PASS: unknown status rejected (400)"
    : `FAIL: expected 400, got ${badStatus.status}`
);

const noName = await post({ diagnosisId, status: "approved", engineerName: "  " });
console.log(
  noName.status === 400
    ? "PASS: approval without engineer name rejected (400)"
    : `FAIL: expected 400, got ${noName.status}`
);

const noNote = await post({ diagnosisId, status: "modified", engineerName: "Z" });
console.log(
  noNote.status === 400
    ? "PASS: modify without an explanation rejected (400)"
    : `FAIL: expected 400, got ${noNote.status}`
);

const unknown = await post({
  diagnosisId: "00000000-0000-0000-0000-000000000000",
  status: "approved",
  engineerName: "Ghost"
});
console.log(
  unknown.status === 404
    ? "PASS: sign-off against an unsaved diagnosis rejected (404)"
    : `FAIL: expected 404, got ${unknown.status}`
);

await pool.query("DELETE FROM analysis_results WHERE id = $1", [diagnosisId]);
const orphans = await pool.query(
  `SELECT COUNT(*)::int AS n FROM diagnosis_sign_off WHERE diagnosis_id = $1`,
  [diagnosisId]
);
console.log(
  orphans.rows[0].n === 0
    ? "PASS: sign-off cascades away with its diagnosis"
    : `FAIL: ${orphans.rows[0].n} orphaned sign-off row(s)`
);

await pool.query("DELETE FROM analysis_results WHERE asset_id = $1", [ASSET]);
console.log("cleanup: smoketest diagnosis removed");
await pool.end();
