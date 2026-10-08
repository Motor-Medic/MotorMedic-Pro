import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PROGNOSTICS_PF_DISCLOSURES,
  DIAGNOSE_NOT_RECORDED,
  DIAGNOSE_NOT_RECORDED_FOR_ASSET,
  DIAGNOSE_HEALTH_SCORE_SOURCE,
  DIAGNOSE_CONFIDENCE_SOURCE,
  DIAGNOSE_FUSION_METHOD,
  DIAGNOSE_FUSION_AGGREGATE_LABEL,
  DIAGNOSE_SAMPLE_DATASET,
  DIAGNOSE_NORMALIZATION_NOT_APPLIED,
  DIAGNOSE_SAVINGS_NOT_DERIVABLE_NEGATIVE,
  DIAGNOSE_COMPUTED_COST_IMPACT,
  DIAGNOSE_ROI_SOURCE,
  DIAGNOSE_FAILURE_ESTIMATE_SOURCE,
  DIAGNOSE_ENVELOPE_LIMIT_SOURCE,
  DIAGNOSE_SEVERITY_NOT_COMPUTED,
  DIAGNOSE_SEVERITY_SOURCE,
  MCA_DEFAULT_SCORE_PROVENANCE,
  HEALTH_SCORE_DEFAULT_PROVENANCE,
  SAVED_ANALYSES_OIL_EMPTY_PROVENANCE,
  dedupeAnalysisResults,
} from "./prescriptiveDictionary";

const readRel = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("P1 dictionary single-source / byte-identity", () => {
  it("PROGNOSTICS_PF_DISCLOSURES is frozen with exactly 26 keys", () => {
    expect(Object.isFrozen(PROGNOSTICS_PF_DISCLOSURES)).toBe(true);
    expect(Object.keys(PROGNOSTICS_PF_DISCLOSURES).length).toBe(26);
  });

  it("all 26 disclosures byte-equal their contract text", () => {
    const D = PROGNOSTICS_PF_DISCLOSURES;
    expect(D.trendGateLabel).toBe("trend gate: |slope| >= 2 x SE");
    expect(D.selectionPolicyCore).toBe("largest N, ties by severity");
    expect(D.selectionPolicy).toBe("Selection policy: largest N, ties by severity.");
    expect(D.selectionPolicyVibration).toBe(
      "Series selection policy: largest N, ties by severity; override does not borrow another curve.",
    );
    expect(D.projectionG8).toBe(
      "Projections are modeled estimates from stored history (G8) — not measurements.",
    );
    expect(D.absenceG9).toBe(
      "Absence of sufficient history is confessed, not extrapolated (G9).",
    );
    expect(D.comparisonVibrationOnly).toBe(
      "Comparison tools remain vibration-only this slice (declared).",
    );
    expect(D.rulModeledG8).toBe("modeled projection (G8) - not a measurement");
    expect(D.projectionNotComputable).toBe(
      "insufficient or flat history - projection not computed (confessed, not extrapolated)",
    );
    expect(D.noThresholdSlopeOnly).toBe(
      "no functional threshold stored - slope only, no F window",
    );
    expect(D.noThresholdCrossing).toBe("no threshold crossing on record");
    expect(D.noStoredDetection).toBe("no stored detection date");
    expect(D.defaultSeriesOption).toBe("default — longest history (largest N)");
    expect(D.notComputed).toBe("not computed");
    expect(D.fitRegressionNote).toBe(
      "ordinary linear regression; not a physics failure model",
    );
    expect(D.trendNotEstablished).toBe("degradation trend not established");
    expect(D.stableTrendLead).toBe("no degradation trend - slope ");
    expect(D.stableTrendTail).toBe(
      " not statistically distinguishable from flat (trend gate: |slope| >= 2 x SE); RUL not computed",
    );
    expect(D.improvingTrendLead).toBe(
      "trend improving - significant slope in the healthy direction: ",
    );
    expect(D.improvingTrendTail).toBe(
      "; no RUL computed (no degradation trend to project)",
    );
    expect(D.vibrationThresholdIso20816Proxy).toBe(
      "site-practice proxy - not a stored functional limit (ISO 20816 zone C/D boundary)",
    );
    expect(D.infraredThresholdNfpaNetaProxy).toBe(
      "site-practice proxy — NFPA 70B/NETA Class 1 ΔT boundary (15 °C), not a stored functional limit",
    );
    expect(D.ultrasoundThresholdUeLadderProxy).toBe(
      "site-practice proxy — UE Systems bearing-condition ladder Class 1 boundary (+16 dB), not a stored functional limit",
    );
    expect(D.mcaThresholdNemaProxy).toBe(
      "site-practice proxy — NEMA MG-1 Class 1 unbalance boundary (8 %), not a stored functional limit; no ISO severity standard exists for MCA",
    );
    expect(D.mcaThresholdIeee43Hook).toBe(
      "IEEE 43 minimum (groundwall calculator irIeeeMinMOmega from test voltage / winding class)",
    );
    expect(D.oilThresholdDefaultAlarmHook).toBe(
      "DEFAULT_ALARM_LIMITS (lab/OEM practice defaults in oilAnalysis.ts)",
    );
  });

  it("all 15 DIAGNOSE_* constants byte-equal their contract text", () => {
    expect(DIAGNOSE_NOT_RECORDED).toBe("not recorded");
    expect(DIAGNOSE_NOT_RECORDED_FOR_ASSET).toBe("not recorded for this asset");
    expect(DIAGNOSE_HEALTH_SCORE_SOURCE).toBe(
      "derived health index from the stored analysis record (0-100) - not a direct measurement",
    );
    expect(DIAGNOSE_CONFIDENCE_SOURCE).toBe(
      "consensus-engine confidence from the saved record - not a measured value",
    );
    expect(DIAGNOSE_FUSION_METHOD).toBe(
      "unweighted mean of scored technologies, rounded; withheld below two scored technologies",
    );
    expect(DIAGNOSE_FUSION_AGGREGATE_LABEL).toBe("Cross-tech corroboration");
    expect(DIAGNOSE_SAMPLE_DATASET).toBe(
      "sample dataset - not this asset's measured values",
    );
    expect(DIAGNOSE_NORMALIZATION_NOT_APPLIED).toBe(
      "normalization not applied - values as stored",
    );
    expect(DIAGNOSE_SAVINGS_NOT_DERIVABLE_NEGATIVE).toBe(
      "Savings not derivable - computed value negative.",
    );
    expect(DIAGNOSE_COMPUTED_COST_IMPACT).toBe("computed cost impact");
    expect(DIAGNOSE_ROI_SOURCE).toBe(
      "ROI = (failure estimate - preventive estimate) / preventive estimate x 100, from the stored financial estimates",
    );
    expect(DIAGNOSE_FAILURE_ESTIMATE_SOURCE).toBe(
      "stored failure estimate from the analysis record - not a recomputed projection",
    );
    expect(DIAGNOSE_ENVELOPE_LIMIT_SOURCE).toBe(
      "envelope warning and danger limits - site practice, not a stored functional limit",
    );
    expect(DIAGNOSE_SEVERITY_NOT_COMPUTED).toBe(
      "severity not recorded - severity-derived guidance not computed",
    );
    expect(DIAGNOSE_SEVERITY_SOURCE).toBe(
      "severity status from the stored analysis record - not recomputed here",
    );
  });

  it("the provenance trio byte-equals its contract text", () => {
    expect(MCA_DEFAULT_SCORE_PROVENANCE).toBe(
      "default score - not a measured result",
    );
    expect(HEALTH_SCORE_DEFAULT_PROVENANCE).toBe(
      "default-derived - not measured",
    );
    expect(SAVED_ANALYSES_OIL_EMPTY_PROVENANCE).toBe(
      "0 saved analyses - dossier builds from stored samples",
    );
  });

  it("five prognostics tabs compose footers from the dictionary, byte-identical", () => {
    const tabs: [string, string][] = [
      [
        "InfraredPrognosticsTab.tsx",
        "{PF_PROJECTION_G8} {PF_ABSENCE_G9} {PF_COMPARISON_VIBRATION_ONLY} {PF_SELECTION_POLICY}",
      ],
      [
        "McaPrognosticsTab.tsx",
        "{PF_PROJECTION_G8} {PF_ABSENCE_G9} No ISO severity class standard exists for MCA. {PF_COMPARISON_VIBRATION_ONLY} {PF_SELECTION_POLICY}",
      ],
      [
        "OilPrognosticsTab.tsx",
        "{PF_PROJECTION_G8} {PF_ABSENCE_G9} Wear limits are lab and OEM practice — no universal ISO severity class standard exists for oil. {PF_COMPARISON_VIBRATION_ONLY} {PF_SELECTION_POLICY}",
      ],
      [
        "UltrasoundPrognosticsTab.tsx",
        "{PF_PROJECTION_G8} {PF_ABSENCE_G9} No ISO severity standard exists for ultrasound. {PF_COMPARISON_VIBRATION_ONLY} {PF_SELECTION_POLICY}",
      ],
      [
        "VibrationPrognosticsTab.tsx",
        "{PF_PROJECTION_G8} {PF_ABSENCE_G9} Guidance flags are guidance, not diagnoses. {PF_COMPARISON_VIBRATION_ONLY} {PF_SELECTION_POLICY_VIBRATION}",
      ],
    ];
    for (const [file, footer] of tabs) {
      const src = readRel(`../../components/reports/${file}`);
      expect(src).toContain("PROGNOSTICS_PF_DISCLOSURES");
      expect(src, `${file} footer`).toContain(footer);
    }
  });

  it("consumers import provenance from the dictionary; literals never re-declared", () => {
    const consumers: [string, string, string[]][] = [
      [
        "../../components/McaResultsDashboard.tsx",
        'from "../lib/maintenance/prescriptiveDictionary"',
        ["default score - not a measured result", "default-derived - not measured"],
      ],
      [
        "../../components/Diagnose.tsx",
        'from "../lib/maintenance/prescriptiveDictionary"',
        ["sample dataset - not this asset's measured values", "default-derived - not measured"],
      ],
      [
        "../../components/diagnostics/CmmsPayloadBridge.tsx",
        'from "../../lib/maintenance/prescriptiveDictionary"',
        ["default-derived - not measured"],
      ],
      [
        "../../components/diagnostics/DiagnosticsIntelligencePanel.tsx",
        'from "../../lib/maintenance/prescriptiveDictionary"',
        ["default-derived - not measured"],
      ],
      [
        "../../components/AnalysisReport.tsx",
        'from "../lib/maintenance/prescriptiveDictionary"',
        ["0 saved analyses - dossier builds from stored samples"],
      ],
    ];
    for (const [file, importNeedle, literals] of consumers) {
      const src = readRel(file);
      expect(src, `${file} import`).toContain(importNeedle);
      for (const literal of literals) {
        expect(src.includes(literal), `${file} re-declares "${literal}"`).toBe(false);
      }
    }
  });
});

describe("P3 dup-key absence — dedupeAnalysisResults", () => {
  type Row = {
    id?: string | null;
    timestamp?: string | null;
    asset_id?: string | null;
    component?: string | null;
  };

  const rows: Row[] = [
    { id: "a", timestamp: "t1", asset_id: "x", component: "Motor" },
    { id: "a", timestamp: "t2", asset_id: "x", component: "Motor" },
    { id: "b", timestamp: "t1", asset_id: "x", component: "Motor" },
  ];

  it("collapses duplicate identity rows to the first occurrence", () => {
    const out = dedupeAnalysisResults(rows);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("post-dedupe identity keys are unique — no dup-key survives", () => {
    const out = dedupeAnalysisResults([...rows, { id: "a" }]);
    const keys = out.map(
      (r) => r.id ?? `${r.timestamp ?? ""}|${r.asset_id ?? ""}|${r.component ?? ""}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("id-less rows key on timestamp|asset|component", () => {
    const out = dedupeAnalysisResults([
      { timestamp: "t1", asset_id: "x", component: "M" },
      { timestamp: "t1", asset_id: "x", component: "M" },
      { timestamp: "t1", asset_id: "x", component: "Other" },
    ]);
    expect(out).toHaveLength(2);
  });

  it("never mutates the caller's array", () => {
    const input = [...rows];
    dedupeAnalysisResults(input);
    expect(input).toHaveLength(3);
  });
});
