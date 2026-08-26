/**
 * Unit checks for the Run Diagnostics fusion + prognosis logic.
 *
 * The invariants that matter most here are the honesty ones: a technology with
 * no record must score null (never 0), an aggregate must be withheld below two
 * scored technologies, and no projection may be emitted for a flat or
 * improving trend.
 */

import {
  assembleFusion,
  buildFusionFromRecords,
  scoreOil,
  scoreThermography,
  scoreUltrasound,
  scoreVibration,
  type TechnologyEvidence
} from "../src/lib/diagnostics/sensorFusion";
import {
  classifyFaultFamily,
  familiesCorroborate
} from "../src/lib/diagnostics/faultFamily";
import {
  buildPrognosis,
  buildOilProjections,
  buildVibrationProjections
} from "../src/lib/diagnostics/prognosis";
import {
  buildCmmsPayload,
  buildCmmsFieldList,
  normalizeSeverity,
  type CmmsPayloadContext
} from "../src/lib/diagnostics/cmmsPayload";
import { composeWorkOrderDescription } from "../src/lib/diagnostics/workOrderText";
import type { SavedAnalysisResult } from "../src/lib/analysisPersistence";
import type { OilSample } from "../src/types/oilAnalysis";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`PASS: ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL: ${name}\n   expected ${e}\n   actual   ${a}`);
  }
}

// --- Fault family classification -------------------------------------------
check("family bearing from BPFO", classifyFaultFamily("Outer Race Bearing Defect (BPFO)"), "bearing");
check("family electrical from rotor bar", classifyFaultFamily("Broken rotor bar"), "electrical");
check("family contamination from ISO", classifyFaultFamily("ISO 4406 particle ingress"), "contamination");
check("family leak", classifyFaultFamily("Compressed air leak — turbulent flow"), "leak");
check("family unknown on empty", classifyFaultFamily(""), "unknown");
check("family unknown on gibberish", classifyFaultFamily("zzz qqq"), "unknown");

check("same family corroborates", familiesCorroborate("bearing", "bearing"), true);
check("bearing <- contamination corroborates", familiesCorroborate("bearing", "contamination"), true);
check("bearing vs leak does not", familiesCorroborate("bearing", "leak"), false);
check("unknown never corroborates", familiesCorroborate("unknown", "unknown"), false);

// --- Per-technology scoring -------------------------------------------------
const vibRecord = (over: Partial<SavedAnalysisResult> = {}): SavedAnalysisResult =>
  ({
    id: "v1", asset_id: "A", component: null, timestamp: "2026-06-01T00:00:00Z",
    health_score: 42, primary_fault: "Outer Race Bearing Defect (BPFO)",
    fault_list: [], peaks: [], spectrum_image_url: null, recommendations: [],
    financial_impact: {}, severity: "CRITICAL", summary: "BPFO sidebands rising.",
    analysis_type: "vibration", ...over
  }) as SavedAnalysisResult;

check("vibration no record -> null score", scoreVibration(null, "bearing").score, null);
check("vibration no record -> no_record reason", scoreVibration(null, "bearing").unscoredReason, "no_record");
check("vibration family match -> 100", scoreVibration(vibRecord(), "bearing").score, 100);
check("vibration NORMAL -> 0", scoreVibration(vibRecord({ severity: "NORMAL" }), "bearing").score, 0);
check(
  "vibration anomaly, different family -> 50",
  scoreVibration(vibRecord({ primary_fault: "Compressed air leak", severity: "ANOMALY" }), "bearing").score,
  50
);
check("vibration reason uses saved summary", scoreVibration(vibRecord(), "bearing").reason, "BPFO sidebands rising.");

const ueRecord = (peak: Record<string, unknown>): SavedAnalysisResult =>
  ({ ...vibRecord(), id: "u1", analysis_type: "ultrasound", primary_fault: "Air Leak",
     peaks: [{ type: "ultrasound", ...peak }] }) as SavedAnalysisResult;

check("ultrasound no record -> null", scoreUltrasound(null, "leak").score, null);
check("ultrasound +14 dB -> 100", scoreUltrasound(ueRecord({ delta_db: 14 }), "leak").score, 100);
check("ultrasound +9 dB -> 75", scoreUltrasound(ueRecord({ delta_db: 9 }), "leak").score, 75);
check("ultrasound +5 dB -> 50", scoreUltrasound(ueRecord({ delta_db: 5 }), "leak").score, 50);
check("ultrasound +0.2 dB -> 0", scoreUltrasound(ueRecord({ delta_db: 0.2 }), "leak").score, 0);
check(
  "ultrasound derives delta from peak+baseline",
  scoreUltrasound(ueRecord({ peak_dbmv: 55, baseline_dbmv: 39 }), "leak").score,
  100
);
check(
  "ultrasound record without delta -> null score, not 0",
  scoreUltrasound(ueRecord({ peak_dbmv: 55 }), "leak").score,
  null
);
check(
  "ultrasound record without delta -> no_usable_metric",
  scoreUltrasound(ueRecord({ peak_dbmv: 55 }), "leak").unscoredReason,
  "no_usable_metric"
);

// Band tests use an on-family fault so the raw band score is exercised; the
// off-family cap is covered separately below.
const irRecord = (
  peak: Record<string, unknown>,
  unit?: string,
  fault = "Hot spot at terminal"
): SavedAnalysisResult =>
  ({ ...vibRecord(), id: "t1", analysis_type: "thermography", primary_fault: fault,
     peaks: [{ type: "thermography", ...peak }],
     telemetry_data: unit ? { environmental: { temp_unit: unit } } : null }) as SavedAnalysisResult;

check("thermography no record -> null", scoreThermography(null, "thermal").score, null);
check("thermography 45C -> 100", scoreThermography(irRecord({ delta_t: 45 }, "°C"), "thermal").score, 100);
check("thermography 20C -> 75", scoreThermography(irRecord({ delta_t: 20 }, "°C"), "thermal").score, 75);
check("thermography 5C -> 50", scoreThermography(irRecord({ delta_t: 5 }, "°C"), "thermal").score, 50);
// 90°F delta = 50°C -> must land in the top band, not be read as 90°C.
check("thermography 90F converts to 50C -> 100", scoreThermography(irRecord({ delta_t: 90 }, "°F"), "thermal").score, 100);
// 20°F delta = 11.1°C -> mid band, NOT the 75 band that raw 20 would hit.
check("thermography 20F converts to 11C -> 50", scoreThermography(irRecord({ delta_t: 20 }, "°F"), "thermal").score, 50);
check(
  "thermography without unit falls back to NETA class",
  scoreThermography(irRecord({ delta_t: 30, severity_class: "Class 3" }), "thermal").score,
  75
);
check(
  "thermography without unit or class -> null score",
  scoreThermography(irRecord({ delta_t: 30 }), "thermal").score,
  null
);

// --- Off-family cap ---------------------------------------------------------
// A severity band proves a problem exists, not that it is the diagnosed one.
check(
  "thermography 45C off-family capped at 50",
  scoreThermography(irRecord({ delta_t: 45 }, "°C", "Loose connection"), "thermal").score,
  50
);
check(
  "thermography off-family cap is explained in the reason",
  scoreThermography(irRecord({ delta_t: 45 }, "°C", "Loose connection"), "thermal")
    .reason.includes("Held at 50"),
  true
);
check(
  "thermography NETA fallback also capped off-family",
  scoreThermography(
    irRecord({ delta_t: 30, severity_class: "Class 3" }, undefined, "Loose connection"),
    "thermal"
  ).score,
  50
);
check(
  "thermography with no diagnosed family is capped, not credited",
  scoreThermography(irRecord({ delta_t: 45 }, "°C"), "unknown").score,
  50
);
check(
  "ultrasound +14 dB off-family capped at 50",
  scoreUltrasound(ueRecord({ delta_db: 14 }), "bearing").score,
  50
);
check(
  "cap never raises a low band score",
  scoreUltrasound(ueRecord({ delta_db: 0.2 }), "bearing").score,
  0
);
check(
  "on-family record keeps full marks",
  scoreUltrasound(ueRecord({ delta_db: 14 }), "leak").score,
  100
);

const oilSample = (over: Partial<OilSample> = {}): OilSample =>
  ({ assetId: "A", sampleDate: "2026-06-01", operatingHours: 5000,
     iron: 10, copper: 5, chromium: 2, lead: 1, aluminum: 3, silicon: 8, ...over }) as OilSample;

check("oil no record -> null", scoreOil(null, "bearing").score, null);
check("oil all within limits -> 0", scoreOil(oilSample(), "bearing").score, 0);
check("oil Fe over limit, bearing diagnosis -> 100", scoreOil(oilSample({ iron: 120 }), "bearing").score, 100);
check(
  "oil Fe over limit reason quotes saved values",
  scoreOil(oilSample({ iron: 120 }), "bearing").reason,
  "Fe 120 ppm > 100 ppm limit"
);
check(
  "oil ISO over target, bearing diagnosis -> 100 (contamination drives wear)",
  scoreOil(oilSample({ iso4um: 22, iso6um: 20, iso14um: 16 }), "bearing").score,
  100
);
check(
  "oil contamination vs leak diagnosis -> 50",
  scoreOil(oilSample({ iso4um: 22, iso6um: 20, iso14um: 16 }), "leak").score,
  50
);
check("oil MPC abnormal counts", scoreOil(oilSample({ mpcDeltaE: 31 }), "lubrication").score, 100);
check("oil MPC good does not count", scoreOil(oilSample({ mpcDeltaE: 8 }), "lubrication").score, 0);
check("oil water over 200 counts", scoreOil(oilSample({ waterPpm: 540 }), "contamination").score, 100);

// --- Aggregation ------------------------------------------------------------
const ev = (score: number | null, hasRecord = true): TechnologyEvidence => ({
  technology: "oil", label: "Oil", hasRecord, score,
  unscoredReason: score == null ? "no_record" : null,
  reason: "", detail: [], recordedAt: null, family: null
});

check("aggregate withheld with 1 scored", assembleFusion([ev(100), ev(null, false)], "bearing").aggregate, null);
check("aggregate withheld status", assembleFusion([ev(100), ev(null, false)], "bearing").status, "single_domain");
check("aggregate of 2", assembleFusion([ev(100), ev(50)], "bearing").aggregate, 75);
check("aggregate rounds", assembleFusion([ev(100), ev(50), ev(0)], "bearing").aggregate, 50);
check("aggregate ignores nulls, not zeros", assembleFusion([ev(100), ev(0), ev(null, false)], "bearing").aggregate, 50);
check("no data status", assembleFusion([ev(null, false), ev(null, false)], "bearing").status, "no_data");
check("cross validated status", assembleFusion([ev(100), ev(50)], "bearing").status, "cross_validated");

const fullFusion = buildFusionFromRecords({
  analysisRecords: [vibRecord(), ueRecord({ delta_db: 14 })],
  oilSamples: [oilSample({ iron: 120 })],
  primaryFault: "Outer Race Bearing Defect (BPFO)"
});
check("end-to-end fusion rows", fullFusion.rows.length, 4);
check("end-to-end thermography absent -> null", fullFusion.rows[3].score, null);
// Vibration BPFO and oil iron are on-family (100 each); the air-leak ultrasound
// record is off-family for a bearing defect, so it is held at 50.
check("end-to-end vibration on-family", fullFusion.rows[0].score, 100);
check("end-to-end oil on-family", fullFusion.rows[1].score, 100);
check("end-to-end ultrasound off-family capped", fullFusion.rows[2].score, 50);
check("end-to-end aggregate = round(mean(100,100,50))", fullFusion.aggregate, 83);

// --- Prognosis --------------------------------------------------------------
const rising: OilSample[] = [
  oilSample({ sampleDate: "2025-01-01", operatingHours: 1000, mpcDeltaE: 10 }),
  oilSample({ sampleDate: "2026-01-01", operatingHours: 3000, mpcDeltaE: 20 })
];
const oilRise = buildOilProjections(rising);
check("mpc projects", oilRise.projections.find((p) => p.id === "oil-mpc")?.hoursRemaining, 2000);
check("mpc basis is operating hours", oilRise.projections.find((p) => p.id === "oil-mpc")?.basis, "operating");

const flat: OilSample[] = [
  oilSample({ operatingHours: 1000, mpcDeltaE: 10 }),
  oilSample({ operatingHours: 3000, mpcDeltaE: 10 })
];
check("flat mpc yields no projection", buildOilProjections(flat).projections.length, 0);
// The fixture's wear metals are flat too, so filter to the MPC entry.
const flatMpc = buildOilProjections(flat).nonConverging.find((m) =>
  m.label.startsWith("MPC")
);
check("flat mpc is reported as non-converging", Boolean(flatMpc), true);
check("flat mpc note explains why", flatMpc?.note.includes("Flat or improving"), true);

const improving: OilSample[] = [
  oilSample({ operatingHours: 1000, mpcDeltaE: 20 }),
  oilSample({ operatingHours: 3000, mpcDeltaE: 10 })
];
check("improving mpc yields no projection", buildOilProjections(improving).projections.length, 0);

const single: OilSample[] = [oilSample({ operatingHours: 1000, mpcDeltaE: 10 })];
check("single sample yields nothing at all", buildOilProjections(single).projections.length, 0);
check("single sample is not listed as non-converging", buildOilProjections(single).nonConverging.length, 0);

const past: OilSample[] = [
  oilSample({ operatingHours: 1000, mpcDeltaE: 31 }),
  oilSample({ operatingHours: 3000, mpcDeltaE: 40 })
];
check("already past threshold -> no countdown", buildOilProjections(past).projections.length, 0);
const pastMpc = buildOilProjections(past).nonConverging.find((m) =>
  m.label.startsWith("MPC")
);
check("already past threshold -> flagged", Boolean(pastMpc), true);
check("already past threshold says act now", pastMpc?.note.includes("act now"), true);

const rulerFall: OilSample[] = [
  oilSample({ operatingHours: 1000, rulerPercent: 90 }),
  oilSample({ operatingHours: 3000, rulerPercent: 65 })
];
check("ruler falling projects", buildOilProjections(rulerFall).projections[0]?.hoursRemaining, 3200);

const vibRecords: SavedAnalysisResult[] = [
  vibRecord({ id: "a", timestamp: "2026-01-01T00:00:00Z", envelope_peak_amplitude: 0.5 }),
  vibRecord({ id: "b", timestamp: "2026-01-11T00:00:00Z", envelope_peak_amplitude: 1.5 })
];
const vibProj = buildVibrationProjections(vibRecords);
check("vibration envelope projects", Math.round(vibProj.projections[0]?.hoursRemaining ?? -1), 240);
check("vibration basis is calendar", vibProj.projections[0]?.basis, "calendar");

const combined = buildPrognosis({ oilSamples: rising, analysisRecords: vibRecords });
check("horizon is the soonest", combined.horizon?.id, "vib-envelope");
check("mixed basis detected", combined.mixedBasis, true);
check("oil-only prognosis is not mixed", buildPrognosis({ oilSamples: rising, analysisRecords: [] }).mixedBasis, false);
check("empty prognosis has no horizon", buildPrognosis({ oilSamples: [], analysisRecords: [] }).horizon, null);

// --- CMMS payloads ----------------------------------------------------------
const ctx: CmmsPayloadContext = {
  assetTag: "PMP030", component: "Motor DE", faultTitle: "Outer Race Bearing Defect (BPFO)",
  severity: "CRITICAL", confidencePercent: 91, healthScore: 38,
  horizonHours: 6800, horizonDriver: "MPC ΔE", horizonBasis: "operating",
  corroborationPercent: 83, technologiesWithData: ["Vibration", "Oil Analysis"],
  signOffStatus: "approved", signOffEngineer: "J. Rivera, CAT III",
  signOffAt: "2026-08-24T15:00:00Z", recommendations: ["Replace bearing"],
  diagnosisId: "abc-123"
};

check("severity normalize CRITICAL", normalizeSeverity("CRITICAL"), "CRITICAL");
check("severity normalize HIGH", normalizeSeverity("HIGH"), "CRITICAL");
check("severity normalize ANOMALY", normalizeSeverity("ANOMALY"), "ANOMALY");
check("severity normalize unknown -> NORMAL", normalizeSeverity(null), "NORMAL");

check("sap uses EQUNR key", (buildCmmsPayload("sap", ctx) as any).EQUNR, "PMP030");
check("maximo uses ASSETNUM key", (buildCmmsPayload("maximo", ctx) as any).ASSETNUM, "PMP030");
check("maximo approved -> APPR", (buildCmmsPayload("maximo", ctx) as any).STATUS, "APPR");
check("fiix uses hungarian keys", (buildCmmsPayload("fiix", ctx) as any).strAssetCode, "PMP030");
check("oracle uses ASSET_NUMBER key", (buildCmmsPayload("oracle_eam", ctx) as any).ASSET_NUMBER, "PMP030");

// --- Priority renders as code + label + reason ------------------------------
check(
  "sap critical priority carries code, label and reason",
  (buildCmmsPayload("sap", ctx) as any).PRIORITY,
  "1 - Very High (critical severity recorded, expedite ahead of routine work)"
);
check(
  "sap anomaly priority carries the anomaly reason",
  (buildCmmsPayload("sap", { ...ctx, severity: "ANOMALY" }) as any).PRIORITY,
  "2 - High (anomaly recorded, plan into the next maintenance window)"
);
check(
  "word-based systems do not repeat the code as the label",
  (buildCmmsPayload("maintainx", ctx) as any).priority,
  "High (critical severity recorded, expedite ahead of routine work)"
);
check(
  "switching system changes priority vocabulary",
  [
    (buildCmmsPayload("sap", ctx) as any).PRIORITY,
    (buildCmmsPayload("maximo", ctx) as any).WOPRIORITY,
    (buildCmmsPayload("maintainx", ctx) as any).priority,
    (buildCmmsPayload("fiix", ctx) as any).strPriority,
    (buildCmmsPayload("oracle_eam", ctx) as any).PRIORITY_CODE
  ].map((v) => String(v).split(" (")[0]),
  ["1 - Very High", "1 - Highest", "High", "Critical", "1 - Emergency"]
);
check(
  "every system states a reason alongside the priority",
  ["sap", "maximo", "maintainx", "fiix", "oracle_eam"].every((t) =>
    buildCmmsFieldList(t as any, ctx).some(
      (f) => f.label.includes("Priority") && f.value.includes("(critical severity recorded")
    )
  ),
  true
);

const pendingCtx: CmmsPayloadContext = {
  ...ctx, signOffStatus: "pending", signOffEngineer: null, signOffAt: null,
  corroborationPercent: null, technologiesWithData: ["Vibration"],
  horizonHours: null, horizonDriver: null, horizonBasis: null,
  confidencePercent: null, healthScore: null
};
const pendingPayload = buildCmmsPayload("sap", pendingCtx) as any;
check("pending sign-off surfaces in payload", String(pendingPayload.SIGN_OFF).startsWith("PENDING"), true);
check("single-domain surfaces in payload", String(pendingPayload.CORROBORATION).includes("Single-domain"), true);
check("null horizon omits the key entirely", "FAILURE_HORIZON" in pendingPayload, false);
check("maximo pending -> WAPPR", (buildCmmsPayload("maximo", pendingCtx) as any).STATUS, "WAPPR");

// --- Confidence never appears as a bare percentage --------------------------
check(
  "stored per-fault confidence is labelled as AI confidence",
  (buildCmmsPayload("sap", ctx) as any).DIAGNOSIS_CONFIDENCE,
  "91% (AI confidence)"
);
check(
  "no stored confidence falls back to the fusion aggregate",
  (buildCmmsPayload("sap", { ...ctx, confidencePercent: null }) as any)
    .DIAGNOSIS_CONFIDENCE,
  "83% (multi-domain corroboration)"
);
check(
  "neither source available -> cross-validation pending",
  String(pendingPayload.DIAGNOSIS_CONFIDENCE),
  "Cross-validation pending"
);
check(
  "confidence is never a bare percentage in any system",
  ["sap", "maximo", "maintainx", "fiix", "oracle_eam"].every((t) =>
    buildCmmsFieldList(t as any, ctx)
      .filter((f) => f.label === "Diagnosis Confidence")
      .every((f) => !/^\d+%?$/.test(f.value))
  ),
  true
);

// --- Tiered description composition -----------------------------------------
const oilEvidence = [
  { label: "Oil Analysis", details: ["Fe 108 ppm > 100 ppm limit", "ISO 22/20/16 above target 15/13/10"] },
  { label: "Vibration", details: ["Primary fault: Unbalance", "Severity: ANOMALY"] }
];

check(
  "tier 1 - saved diagnosis drives the description",
  composeWorkOrderDescription({
    assetTag: "PMP030", component: "Motor DE",
    faultTitle: "Outer Race Bearing Defect (BPFO)", severity: "CRITICAL",
    rationale: "Envelope spectrum shows BPFO with three harmonics.",
    evidence: oilEvidence
  }),
  {
    tier: "diagnosis",
    text:
      "Outer Race Bearing Defect (BPFO) detected on PMP030 Motor DE. Severity recorded as Critical." +
      "\n\nEnvelope spectrum shows BPFO with three harmonics."
  }
);
check(
  "tier 1 with no stored rationale appends nothing",
  composeWorkOrderDescription({
    assetTag: "PMP030", component: "Motor DE", faultTitle: "Dirt ingress",
    severity: "ANOMALY", rationale: null
  }).text.includes("\n"),
  false
);
const tier2 = composeWorkOrderDescription({
  assetTag: "PMP030", component: "Motor DE", faultTitle: "", severity: "ANOMALY",
  evidence: oilEvidence
});
check("tier 2 - no diagnosis composes from readings", tier2.tier, "measurements");
check(
  "tier 2 quotes the fusion evidence strings verbatim",
  oilEvidence.every((g) => g.details.every((d) => tier2.text.includes(d))),
  true
);
check(
  "tier 2 never claims a diagnosis",
  tier2.text.startsWith("No saved diagnosis for PMP030 Motor DE."),
  true
);
check(
  "tier 3 - nothing on file",
  composeWorkOrderDescription({
    assetTag: "PMP030", component: "Motor DE", faultTitle: "", severity: "NORMAL",
    evidence: []
  }),
  { tier: "none", text: "No diagnostic findings recorded." }
);
check(
  "empty evidence groups are dropped rather than printed",
  composeWorkOrderDescription({
    assetTag: "PMP030", component: "Motor DE", faultTitle: "", severity: "NORMAL",
    evidence: [{ label: "Oil Analysis", details: ["", "  "] }]
  }).tier,
  "none"
);

// The composed description must reach the CMMS long-text field itself.
const tier2Ctx: CmmsPayloadContext = {
  ...pendingCtx, faultTitle: "", rationale: null, evidence: oilEvidence
};
check(
  "tier 2 description reaches the SAP long text",
  String((buildCmmsPayload("sap", tier2Ctx) as any).LONG_TEXT).includes(
    "Fe 108 ppm > 100 ppm limit"
  ),
  true
);
check(
  "no data at all -> long text states no findings",
  (buildCmmsPayload("sap", { ...pendingCtx, faultTitle: "", rationale: null, evidence: [] }) as any)
    .LONG_TEXT,
  "No diagnostic findings recorded."
);
check(
  "short text truncates on a word boundary, not mid-measurement",
  String((buildCmmsPayload("sap", tier2Ctx) as any).SHORT_TEXT).length <= 41,
  true
);

// --- No synthetic payload strings survive anywhere ---------------------------
const BANNED = ["Fe 120", "Cu 85", "Confidence 94", "Lorem", "19/17/14", "$15,840"];
check(
  "no hardcoded mock text in any system payload",
  ["sap", "maximo", "maintainx", "fiix", "oracle_eam", "custom"].flatMap((t) =>
    buildCmmsFieldList(t as any, tier2Ctx)
      .concat(buildCmmsFieldList(t as any, ctx))
      .filter((f) => BANNED.some((b) => f.value.includes(b)))
      .map((f) => `${t}.${f.key}`)
  ),
  []
);

// --- CMMS field cards -------------------------------------------------------
const sapFields = buildCmmsFieldList("sap", ctx);
check(
  "field list carries a human label per key",
  sapFields.every((f) => f.key.length > 0 && f.label.length > 0 && f.value.length > 0),
  true
);
check(
  "sap labels the equipment field",
  sapFields.find((f) => f.key === "EQUNR")?.label,
  "Equipment ID"
);
check(
  "long text is flagged for a textarea",
  sapFields.find((f) => f.key === "LONG_TEXT")?.multiline,
  true
);
check(
  "field list and payload agree exactly",
  Object.fromEntries(sapFields.map((f) => [f.key, f.value])),
  buildCmmsPayload("sap", ctx)
);

// The whole point of the switcher: keys and codes move, values do not.
const valueOf = (target: Parameters<typeof buildCmmsFieldList>[0], label: string) =>
  buildCmmsFieldList(target, ctx).find((f) => f.label === label)?.value;
check(
  "asset value identical across all five systems",
  ["sap", "maximo", "maintainx", "fiix", "oracle_eam"].map((t) =>
    valueOf(t as any, t === "sap" ? "Equipment ID" : t === "maximo" ? "Asset Number" : t === "maintainx" ? "Asset" : t === "fiix" ? "Asset Code" : "Asset Number")
  ),
  ["PMP030", "PMP030", "PMP030", "PMP030", "PMP030"]
);
check(
  "failure horizon text identical across systems",
  new Set(
    ["sap", "maximo", "maintainx", "fiix", "oracle_eam"].map((t) =>
      valueOf(t as any, "Failure Horizon")
    )
  ).size,
  1
);
check(
  "keys differ across systems for the same field",
  new Set(
    ["sap", "maximo", "maintainx", "fiix", "oracle_eam"].map(
      (t) => buildCmmsFieldList(t as any, ctx).find((f) => f.label === "Priority" || f.label === "Priority Code" || f.label === "Work Order Priority")?.key
    )
  ).size,
  5
);

// Malfunction start is only offered when the diagnosis was actually dated.
check(
  "no diagnosis timestamp -> malfunction start omitted",
  buildCmmsFieldList("sap", ctx).some((f) => f.key === "MALFUNCTION_START"),
  false
);
check(
  "diagnosis timestamp -> malfunction start present",
  buildCmmsFieldList("sap", { ...ctx, diagnosisAt: "2026-08-22T13:45:00Z" }).some(
    (f) => f.key === "MALFUNCTION_START"
  ),
  true
);
check(
  "no parts on file -> parts field omitted",
  buildCmmsFieldList("sap", ctx).some((f) => f.key === "REQUIRED_PARTS"),
  false
);

console.log(
  failures === 0
    ? "\nAll diagnostics fusion checks passed."
    : `\n${failures} check(s) failed.`
);
