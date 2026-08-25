/**
 * Renders the sensor-fusion matrix and prognosis for a real asset against the
 * live API, so the claims about what the page shows can be checked rather than
 * assumed. Defaults to PMP030.
 *
 * Usage: npx tsx scripts/verify-pmp030-fusion.ts [ASSET_TAG] ["Primary fault"]
 */

import {
  fetchAnalysisResults,
  type SavedAnalysisResult
} from "../src/lib/analysisPersistence";
import { fetchOilSamples } from "../src/lib/oilSampleRow";
import {
  buildFusionFromRecords,
  oilExceedances
} from "../src/lib/diagnostics/sensorFusion";
import { buildPrognosis, formatHours } from "../src/lib/diagnostics/prognosis";
import {
  buildCmmsFieldList,
  buildCmmsPayload,
  CMMS_TARGETS,
  type CmmsPayloadContext
} from "../src/lib/diagnostics/cmmsPayload";
import {
  DEFAULT_ALARM_LIMITS,
  ISO_CLEANLINESS_TARGET
} from "../src/types/oilAnalysis";

const BASE = "http://localhost:3000";
const asset = process.argv[2] || "PMP030";
const primaryFault =
  process.argv[3] || "Abrasive wear from atmospheric dirt ingress";

// The lib helpers use relative fetch paths; give them an origin under Node.
const nativeFetch = globalThis.fetch;
globalThis.fetch = ((input: any, init?: any) =>
  nativeFetch(
    typeof input === "string" && input.startsWith("/")
      ? `${BASE}${input}`
      : input,
    init
  )) as typeof fetch;

const [records, samples] = await Promise.all([
  fetchAnalysisResults({ asset_id: asset }).catch(
    () => [] as SavedAnalysisResult[]
  ),
  fetchOilSamples(asset).catch(() => [])
]);

console.log(`Asset: ${asset}`);
console.log(`Diagnosis under test: "${primaryFault}"`);
console.log(
  `Saved records: ${records.length} analysis_results, ${samples.length} oil samples\n`
);

const byType = records.reduce<Record<string, number>>((acc, r) => {
  const t = r.analysis_type ?? "vibration";
  acc[t] = (acc[t] ?? 0) + 1;
  return acc;
}, {});
console.log("analysis_results by technology:", byType, "\n");

const fusion = buildFusionFromRecords({
  analysisRecords: records,
  oilSamples: samples,
  primaryFault
});

console.log("--- SENSOR FUSION MATRIX (as rendered) ---");
console.table(
  fusion.rows.map((r) => ({
    Technology: r.label,
    Corroboration: r.score == null ? "—" : `${r.score}%`,
    Evidence: r.reason.length > 68 ? `${r.reason.slice(0, 65)}…` : r.reason,
    Captured: r.recordedAt ? String(r.recordedAt).slice(0, 10) : "—"
  }))
);

console.log(
  fusion.aggregate != null
    ? `Aggregated badge: ${fusion.aggregate}% (mean of ${fusion.scored.length} scored)`
    : "Aggregated badge: Single-domain diagnosis - cross-validation pending"
);
console.log(`Status: ${fusion.status}\n`);

const unscored = fusion.rows.filter((r) => r.score == null);
console.log(
  unscored.every((r) => r.reason.includes("No record - awaiting capture") || r.reason.includes("cannot score"))
    ? `PASS: ${unscored.length} unscored technolog${unscored.length === 1 ? "y renders" : "ies render"} without a percentage`
    : "FAIL: an unscored technology is showing a number"
);
console.log(
  fusion.rows.every((r) => r.score == null || Number.isFinite(r.score))
    ? "PASS: every displayed score is a finite computed number"
    : "FAIL: non-finite score present"
);

const prognosis = buildPrognosis({
  oilSamples: samples,
  analysisRecords: records
});

console.log("\n--- PROGNOSIS / RUL (as rendered) ---");
if (prognosis.horizon) {
  console.log(
    `Unmitigated Horizon: ${formatHours(prognosis.horizon.hoursRemaining)} — driven by ${prognosis.horizon.label} (${prognosis.horizon.basis} hours)`
  );
  console.table(
    prognosis.projections.map((p) => ({
      Metric: p.label,
      Now: `${p.currentValue}${p.unit}`,
      Limit: `${p.threshold}${p.unit}`,
      Remaining: formatHours(p.hoursRemaining),
      Basis: p.basis,
      Readings: p.sampleCount
    }))
  );
  console.log(`Mixed time bases: ${prognosis.mixedBasis}`);
} else {
  console.log("No failure horizon projected on current trends");
}
if (prognosis.nonConverging.length) {
  console.log("\nTracked but not projecting:");
  for (const m of prognosis.nonConverging) {
    console.log(`  - ${m.label}: ${m.note}`);
  }
}

const ctx: CmmsPayloadContext = {
  assetTag: asset,
  component: "Sump",
  faultTitle: primaryFault,
  severity: "CRITICAL",
  confidencePercent: null,
  healthScore: null,
  horizonHours: prognosis.horizon?.hoursRemaining ?? null,
  horizonDriver: prognosis.horizon?.label ?? null,
  horizonBasis: prognosis.horizon?.basis ?? null,
  corroborationPercent: fusion.aggregate,
  technologiesWithData: fusion.scored.map((r) => r.label),
  signOffStatus: "pending",
  signOffEngineer: null,
  signOffAt: null,
  recommendations: [],
  diagnosisId: null
};

console.log("\n--- CMMS: same diagnosis, five vocabularies ---");
console.table(
  (
    [
      ["sap", "PRIORITY", "EQUNR"],
      ["maximo", "WOPRIORITY", "ASSETNUM"],
      ["maintainx", "priority", "asset"],
      ["fiix", "strPriority", "strAssetCode"],
      ["oracle_eam", "PRIORITY_CODE", "ASSET_NUMBER"]
    ] as const
  ).map(([sys, prioKey, assetKey]) => {
    const p = buildCmmsPayload(sys, ctx) as Record<string, unknown>;
    return {
      System: sys,
      "Priority key": prioKey,
      "Priority value": String(p[prioKey]),
      "Asset key": assetKey,
      "Asset value": String(p[assetKey])
    };
  })
);

const horizons = new Set(
  CMMS_TARGETS.map(
    (t) =>
      buildCmmsFieldList(t.id, ctx).find((f) => f.label === "Failure Horizon")
        ?.value
  )
);
console.log(
  horizons.size === 1
    ? `PASS: Failure Horizon reads identically in all five systems -> "${[...horizons][0]}"`
    : `FAIL: Failure Horizon differs across systems: ${[...horizons].join(" | ")}`
);
console.log(
  `SAP field cards (${buildCmmsFieldList("sap", ctx).length} fields, no JSON rendered):`
);
console.table(
  buildCmmsFieldList("sap", ctx).map((f) => ({
    Label: f.label,
    Key: f.key,
    Value: f.value.length > 52 ? `${f.value.slice(0, 49)}…` : f.value
  }))
);

// --- Wear particle panel + root-cause evidence ------------------------------
const latest = samples.length
  ? samples.reduce((a, b) =>
      new Date(b.sampleDate).getTime() > new Date(a.sampleDate).getTime() ? b : a
    )
  : null;

console.log("\n--- WEAR METALS SNAPSHOT (right column) ---");
if (!latest) {
  console.log('No oil sample on file -> honest placeholder panel renders');
} else {
  console.log(`Latest sample: ${latest.sampleDate}`);
  console.table(
    (
      [
        ["iron", "Fe"],
        ["copper", "Cu"],
        ["chromium", "Cr"],
        ["lead", "Pb"],
        ["aluminum", "Al"],
        ["silicon", "Si"]
      ] as const
    ).map(([key, label]) => ({
      Metal: label,
      Measured: latest[key] ?? "—",
      Limit: DEFAULT_ALARM_LIMITS[key],
      Status:
        latest[key] != null && latest[key]! > DEFAULT_ALARM_LIMITS[key]
          ? "OVER"
          : "ok"
    }))
  );
  const isoTriplet =
    latest.iso4um != null && latest.iso6um != null && latest.iso14um != null
      ? `${latest.iso4um}/${latest.iso6um}/${latest.iso14um}`
      : null;
  console.log(
    isoTriplet
      ? `ISO grid plots ${isoTriplet} against target ${ISO_CLEANLINESS_TARGET.join("/")}`
      : "ISO grid shows the no-code placeholder"
  );
}

console.log("\n--- ROOT-CAUSE EVIDENCE vs FUSION MATRIX ---");
const cardEvidence = latest ? oilExceedances(latest).map((e) => e.text) : [];
const oilRow = fusion.rows.find((r) => r.label === "Oil Analysis");
const fusionEvidence = oilRow?.detail ?? [];
console.log("Root-cause cards draw from:", cardEvidence);
console.log("Fusion matrix oil detail  :", fusionEvidence);
console.log(
  JSON.stringify(cardEvidence) === JSON.stringify(fusionEvidence)
    ? "PASS: root-cause ppm strings are byte-identical to the fusion matrix"
    : "FAIL: root-cause and fusion matrix quote different values"
);
const banned = /\b(94|45|12)%|Si \(45ppm\)|Fe \(120ppm\)|Al \(38ppm\)/;
console.log(
  cardEvidence.some((t) => banned.test(t))
    ? "FAIL: a legacy hardcoded figure survived"
    : "PASS: no 94/45/12% or static ppm strings in the evidence"
);
