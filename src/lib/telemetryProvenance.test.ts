import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { telemetryProvenanceOf } from "./analysisPersistence";
import {
  TELEMETRY_PROVENANCE_DEFAULT,
  TELEMETRY_PROVENANCE_KEY,
  TELEMETRY_PROVENANCE_MANUAL,
  TELEMETRY_PROVENANCE_PREFILLED_NOTE,
  TELEMETRY_PROVENANCE_PREFILLED_RUN
} from "./maintenance/prescriptiveDictionary";

const readRel = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("telemetryProvenanceOf — persisted tag reader", () => {
  it("reads the nested telemetry_data key (analysis_results rows)", () => {
    expect(
      telemetryProvenanceOf({
        telemetry_data: { [TELEMETRY_PROVENANCE_KEY]: TELEMETRY_PROVENANCE_DEFAULT }
      })
    ).toBe(TELEMETRY_PROVENANCE_DEFAULT);
    expect(
      telemetryProvenanceOf({
        telemetry_data: { telemetry_provenance: TELEMETRY_PROVENANCE_PREFILLED_RUN }
      })
    ).toBe(TELEMETRY_PROVENANCE_PREFILLED_RUN);
  });

  it("reads the top-level key (diagnosis_logs result_summary)", () => {
    expect(
      telemetryProvenanceOf({
        telemetry_provenance: TELEMETRY_PROVENANCE_MANUAL
      })
    ).toBe(TELEMETRY_PROVENANCE_MANUAL);
    // top-level wins over a conflicting nested value
    expect(
      telemetryProvenanceOf({
        telemetry_provenance: TELEMETRY_PROVENANCE_DEFAULT,
        telemetry_data: { telemetry_provenance: TELEMETRY_PROVENANCE_MANUAL }
      })
    ).toBe(TELEMETRY_PROVENANCE_DEFAULT);
  });

  it("returns null for pre-tag rows, junk values, and empty input", () => {
    expect(telemetryProvenanceOf(null)).toBeNull();
    expect(telemetryProvenanceOf(undefined)).toBeNull();
    expect(telemetryProvenanceOf({})).toBeNull();
    expect(telemetryProvenanceOf({ telemetry_data: null })).toBeNull();
    expect(telemetryProvenanceOf({ telemetry_data: {} })).toBeNull();
    expect(telemetryProvenanceOf({ telemetry_provenance: "MEASURED" })).toBeNull();
    expect(telemetryProvenanceOf({ telemetry_data: { telemetry_provenance: 42 } })).toBeNull();
  });
});

describe("persistence — server stamps the tag into telemetry_data", () => {
  it("server.ts nests body.telemetry_provenance and puts it in the log summary", () => {
    const src = readRel("../../server.ts");
    expect(src).toContain("body.telemetry_provenance === \"manual\"");
    expect(src).toContain("body.telemetry_provenance === \"default\"");
    expect(src).toContain("body.telemetry_provenance === \"prefilled-run\"");
    expect(src).toContain("telemetryData.telemetry_provenance = body.telemetry_provenance");
    expect(src).toContain("telemetry_provenance: telemetryData.telemetry_provenance ?? null");
  });

  it("the save payload carries the computed tag", () => {
    const src = readRel("../components/Diagnose.tsx");
    expect(src).toContain("telemetry_provenance: telemetryProvenance");
    expect(src).toContain("? TELEMETRY_PROVENANCE_DEFAULT");
    expect(src).toContain(": telemetryOriginRef.current");
  });
});

describe("wipe-to-null on asset switch + restore-as-prefilled-run", () => {
  const src = readRel("../components/Diagnose.tsx");

  it("the asset-switch effect wipes telemetry origins and values to null", () => {
    expect(src).toContain("wipe-to-null on asset switch (approved)");
    expect(src).toContain("telemetryOriginRef.current = null;");
    expect(src).toContain('setManualOverall("");');
    expect(src).toContain('setManual1x("");');
    expect(src).toContain('setVibSeverity("");');
    expect(src).toContain('setUltrasoundSnapshot(null);');
    expect(src).toContain('setThermoTelemetry(null);');
    expect(src).toContain("thermographyPolyRef.current = null;");
    expect(src).toContain("vibrationExtractedRef.current = null;");
    expect(src).toContain("setAnalysisResult(null);");
    expect(src).toContain("setSavedAnalysisId(null);");
  });

  it("restored MCA values stamp prefilled-run, never silent manual", () => {
    expect(src).toContain("Restored-from-run values stamp the run 'prefilled-run'");
    const restoreBlock = src.slice(
      src.indexOf("buildMcaSnapshotFromPeak(mcaPeak)"),
      src.indexOf("buildMcaSnapshotFromPeak(mcaPeak)") + 600
    );
    expect(restoreBlock).toContain("TELEMETRY_PROVENANCE_PREFILLED_RUN");
    expect(restoreBlock).toContain("telemetryOriginRef.current === null");
  });

  it("operator choices map: manual → manual, latest → prefilled-run, upload/realtime → measured", () => {
    const apply = src.slice(
      src.indexOf("const applyDataSource ="),
      src.indexOf("const applyDataSource =") + 420
    );
    expect(apply).toContain('v === "manual"');
    expect(apply).toContain("TELEMETRY_PROVENANCE_MANUAL");
    expect(apply).toContain('v === "latest"');
    expect(apply).toContain("TELEMETRY_PROVENANCE_PREFILLED_RUN");
    // every operator-facing data-source call routes through applyDataSource
    expect(src).toContain("applyDataSource(id);");
    expect(src).toContain('applyDataSource("upload");');
    expect(src).toContain("setVibSeverity={handleManualSeverityChange}");
  });
});

describe("badge at every saved-run severity/health display site", () => {
  const sites: Array<[string, string[]]> = [
    ["../components/AnalysisReport.tsx", ["TelemetryProvenanceBadge", "telemetryProvenanceOf(row)", "telemetryProvenanceOf(selectedAnalysis)"]],
    ["../components/TrendAnalyzer.tsx", ["TelemetryProvenanceBadge", "telemetryProvenanceOf(latestDb ?? null)", "telemetryProvenanceOf(r)"]],
    ["../components/reports/MultiTechTab.tsx", ["TelemetryProvenanceBadge", "tech.telemetryProvenance ?? null"]],
    ["../components/reports/reportPresentation.tsx", ["TelemetryProvenanceBadge", "tech.telemetryProvenance ?? null"]],
    ["../components/DiagnosisLogs.tsx", ["TelemetryProvenanceBadge", "telemetryProvenanceOf(summary)"]],
    ["../components/RootCauseAnalysis.tsx", ["TelemetryProvenanceBadge", "telemetryProvenanceOf(latestRecord)"]],
    ["../components/reports/McaResultsTab.tsx", ["TelemetryProvenanceBadge", "telemetryProvenanceOf(selectedAnalysis)"]],
    ["../components/reports/UltrasoundResultsTab.tsx", ["TelemetryProvenanceBadge", "telemetryProvenanceOf(selectedAnalysis)"]],
    ["../components/reports/ThermographyResultsTab.tsx", ["TelemetryProvenanceBadge", "telemetryProvenanceOf(selectedAnalysis)"]],
    ["../components/Dashboard.tsx", ["TelemetryProvenanceBadge", "entry.telemetryProvenance", "actor.telemetryProvenance"]],
    ["../components/planning/WorkOrderVerificationSection.tsx", ["TelemetryProvenanceBadge", "telemetryProvenanceOf(row)", "provenanceByRunId"]],
    ["../lib/reportExport.ts", ["TELEMETRY_PROVENANCE_DEFAULT_NOTE", "TELEMETRY_PROVENANCE_PREFILLED_NOTE", "Telemetry Provenance"]]
  ];

  for (const [rel, needles] of sites) {
    it(`${rel} badges default/prefilled runs`, () => {
      const src = readRel(rel);
      for (const needle of needles) {
        expect(src, `${rel} must reference ${needle}`).toContain(needle);
      }
    });
  }

  it("the multi-tech builder persists the tag onto each technology", () => {
    const src = readRel("./reports/technologySummary.ts");
    expect(src).toContain("telemetryProvenance: telemetryProvenanceOf(record)");
    expect(src).toContain("telemetryProvenance?: TelemetryProvenance | null");
  });

  it("the shared badge imports vocabulary and never re-declares it", () => {
    const src = readRel("../components/diagnostics/TelemetryProvenanceBadge.tsx");
    expect(src).toContain('from "../../lib/maintenance/prescriptiveDictionary"');
    expect(src).toContain("TELEMETRY_PROVENANCE_DEFAULT_BADGE");
    expect(src).toContain("TELEMETRY_PROVENANCE_PREFILLED_BADGE");
    expect(src).not.toContain('"DEFAULT"');
    expect(src).not.toContain('"UNCONFIRMED"');
    expect(src).not.toContain('"manual"');
  });
});

describe("AR-24b — provenance gap close-out", () => {
  it("the UNCONFIRMED tooltip states the approved auto-sourced semantics", () => {
    expect(TELEMETRY_PROVENANCE_PREFILLED_NOTE).toBe(
      "auto-sourced, not engineer-confirmed this session"
    );
    const badge = readRel("../components/diagnostics/TelemetryProvenanceBadge.tsx");
    expect(badge).toContain("TELEMETRY_PROVENANCE_PREFILLED_NOTE");
  });

  it("the thermo snapshot carries autoSourced/manualTouched from fieldSources", () => {
    const src = readRel("../components/ThermographyInputAccordions.tsx");
    expect(src).toContain("autoSourced:");
    expect(src).toContain("      manualTouched,");
    expect(src).toContain(
      'sourceValues.some((s) => s === "last_scan" || s === "live")'
    );
    expect(src).toContain('sourceValues.some((s) => s === "manual")');
    // fieldSources must be a push-effect dependency or the flags go stale
    const push = src.slice(
      src.indexOf("if (!onTelemetryChange) return;"),
      src.indexOf("if (!onTelemetryChange) return;") + 3000
    );
    expect(push).toContain("const sourceValues = Object.values(fieldSources);");
    expect(push).toContain("fieldSources,");
  });

  it("Diagnose stamps prefilled-run for auto-sourced thermo, manual on override", () => {
    const src = readRel("../components/Diagnose.tsx");
    const block = src.slice(
      src.indexOf("if (!thermoTelemetry) return;"),
      src.indexOf("if (!thermoTelemetry) return;") + 600
    );
    expect(block).toContain("thermoTelemetry.autoSourced");
    expect(block).toContain("telemetryOriginRef.current === null");
    expect(block).toContain("TELEMETRY_PROVENANCE_PREFILLED_RUN");
    expect(block).toContain("thermoTelemetry.manualTouched");
    expect(block).toContain("TELEMETRY_PROVENANCE_MANUAL");
  });

  it("the dashboard payload builders carry the run-level tag", () => {
    const src = readRel("../../server.ts");
    expect(src).toContain(
      "telemetryProvenance: readTelemetryProvenance(r.telemetry_data)"
    );
    expect(src).toContain("recommendations, timestamp, telemetry_data");
    expect(src).toContain("severity, summary, timestamp, telemetry_data");
    expect(src).toContain("telemetryProvenance: string | null");
    expect(src).toContain("asTelemetryData");
  });

  it("the verification surface maps provenance per run id", () => {
    const src = readRel(
      "../components/planning/WorkOrderVerificationSection.tsx"
    );
    expect(src).toContain("byRunId[String(row.id)] = telemetryProvenanceOf(row)");
    expect(src).toContain("provenance={preProvenance}");
    expect(src).toContain("provenance={postProvenance}");
    expect(src).toContain("provenanceByRunId={provByWo[wo.id] ?? {}}");
  });
});
