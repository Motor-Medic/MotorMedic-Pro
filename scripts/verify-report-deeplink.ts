/**
 * Verifies the report deep-link contract that `SavedReportViewer` relies on:
 *
 *   1. A saved report fetched by id round-trips value-identically.
 *   2. A well-formed but unknown id answers 404 "Report not found."
 *   3. A malformed id answers 404 too, not a 500 uuid cast error.
 *   4. The list endpoint and the by-id endpoint agree on the same row.
 *
 * Run against a live dev server: npx tsx scripts/verify-report-deeplink.ts
 */

import { rehydrateReport } from "../src/lib/reports/reportPersistence";

const BASE = process.env.VERIFY_BASE_URL || "http://localhost:3000";

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** JSONB does not preserve key order, so compare canonically. */
function canon(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canon(v)])
    );
  }
  return value;
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(canon(a)) === JSON.stringify(canon(b));

async function main() {
  console.log(`\nReport deep-link verification against ${BASE}\n`);

  // ---- Seed a report we fully control -------------------------------------
  const assetId = `DEEPLINK-VERIFY-${Date.now()}`;
  const technologySummary = {
    vibration: {
      technology: "vibration",
      label: "Vibration",
      hasData: true,
      severity: "ANOMALY",
      recordedAt: new Date().toISOString(),
      primaryFault: "Outer race defect",
      emptyMessage: "",
      readings: [
        { label: "Overall velocity", value: "7.10 mm/s", limit: "4.50 mm/s", status: "over" }
      ]
    },
    oil: {
      technology: "oil",
      label: "Oil Analysis",
      hasData: false,
      severity: "NO_DATA",
      recordedAt: null,
      primaryFault: null,
      emptyMessage: "No oil sample on file for this asset.",
      readings: []
    }
  };
  const payload = {
    assetId,
    companyId: null,
    title: `${assetId} — deep link probe`,
    generatedBy: "verify-report-deeplink",
    technologySummary,
    overallSeverity: "ANOMALY",
    faultDiagnoses: [
      { technology: "vibration", title: "Outer race defect", severity: "ANOMALY" }
    ],
    recommendations: ["Stage a replacement bearing and re-test in 14 days."],
    technologiesWithData: ["vibration"]
  };

  const postRes = await fetch(`${BASE}/api/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!postRes.ok) {
    console.error(`Could not seed report: ${postRes.status} ${await postRes.text()}`);
    process.exit(1);
  }
  const saved = (await postRes.json()).report;
  console.log(`  seeded report ${saved.id}\n`);

  // ---- 1. Fetch by id round-trips -----------------------------------------
  const byIdRes = await fetch(`${BASE}/api/reports/${saved.id}`);
  check("GET /api/reports/:id returns 200", byIdRes.status === 200, `got ${byIdRes.status}`);
  const fetched = byIdRes.ok ? (await byIdRes.json()).report : null;

  if (fetched) {
    check("asset_id survives the round trip", fetched.asset_id === assetId);
    check("title survives the round trip", fetched.title === payload.title);
    check("generated_by survives the round trip", fetched.generated_by === payload.generatedBy);
    check(
      "overall_severity survives the round trip",
      fetched.overall_severity === "ANOMALY",
      String(fetched.overall_severity)
    );
    check(
      "technology_summary is value-identical",
      same(fetched.technology_summary, payload.technologySummary)
    );
    check(
      "fault_diagnoses is value-identical",
      same(fetched.fault_diagnoses, payload.faultDiagnoses)
    );
    check(
      "recommendations is value-identical",
      same(fetched.recommendations, payload.recommendations)
    );
    check(
      "technologies_with_data is value-identical",
      same(fetched.technologies_with_data, payload.technologiesWithData)
    );
    check(
      "the no-data technology keeps its honest empty message",
      fetched.technology_summary?.oil?.emptyMessage ===
        "No oil sample on file for this asset."
    );
  }

  // ---- 2. Unknown but well-formed id --------------------------------------
  const ghost = "00000000-0000-4000-8000-000000000000";
  const ghostRes = await fetch(`${BASE}/api/reports/${ghost}`);
  const ghostBody = await ghostRes.json().catch(() => ({}));
  check("unknown id returns 404", ghostRes.status === 404, `got ${ghostRes.status}`);
  check(
    "unknown id says 'Report not found'",
    /not found/i.test(String(ghostBody.error)),
    JSON.stringify(ghostBody)
  );

  // ---- 3. Malformed id -----------------------------------------------------
  const junkRes = await fetch(`${BASE}/api/reports/not-a-real-id`);
  const junkBody = await junkRes.json().catch(() => ({}));
  check(
    "malformed id returns 404 rather than a 500 cast error",
    junkRes.status === 404,
    `got ${junkRes.status}`
  );
  check(
    "malformed id says 'Report not found'",
    /not found/i.test(String(junkBody.error)),
    JSON.stringify(junkBody)
  );

  // ---- 3b. The client rehydration the viewer actually runs -----------------
  if (fetched) {
    const rehydrated = rehydrateReport(fetched);
    check("rehydrated report keeps the asset", rehydrated.assetId === assetId);
    check(
      "rehydrated report keeps the overall severity",
      rehydrated.overallSeverity === "ANOMALY"
    );
    check(
      "rehydration restores every technology, including the empty one",
      rehydrated.technologies.length >= 2 &&
        rehydrated.technologies.some((t) => t.technology === "vibration" && t.hasData) &&
        rehydrated.technologies.some((t) => t.technology === "oil" && !t.hasData)
    );
    const vib = rehydrated.technologies.find((t) => t.technology === "vibration");
    check(
      "rehydrated readings are the saved measured values, not recomputed",
      same(vib?.readings, technologySummary.vibration.readings),
      JSON.stringify(vib?.readings)
    );
    check(
      "rehydrated primary fault matches",
      vib?.primaryFault === "Outer race defect"
    );
    check(
      "rehydrated recommendations match",
      same(rehydrated.recommendations, payload.recommendations)
    );
  }

  // ---- 4. List and by-id agree --------------------------------------------
  const listRes = await fetch(`${BASE}/api/reports?asset_id=${encodeURIComponent(assetId)}`);
  const list = listRes.ok ? (await listRes.json()).reports : [];
  const listed = list.find((r: any) => r.id === saved.id);
  check("the seeded report appears in the asset's list", Boolean(listed));
  if (listed && fetched) {
    check(
      "list row and by-id row are value-identical",
      same(listed, fetched)
    );
  }

  // ---- Cleanup -------------------------------------------------------------
  const delRes = await fetch(`${BASE}/api/reports/${saved.id}`, { method: "DELETE" });
  check("seeded report deletes cleanly", delRes.ok, `got ${delRes.status}`);

  const goneRes = await fetch(`${BASE}/api/reports/${saved.id}`);
  check("deleted report now 404s, so a stale link is honest", goneRes.status === 404);

  console.log(
    failures === 0
      ? "\nAll deep-link checks passed.\n"
      : `\n${failures} check(s) failed.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main().catch((err) => {
  console.error("Verification crashed:", err);
  process.exit(1);
});
