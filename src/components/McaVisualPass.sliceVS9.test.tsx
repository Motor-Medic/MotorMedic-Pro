/**
 * Slice VS9 — MCA visual-pass audit: four-mode separation, winding-health
 * citation honesty, assumed-insulation-class disclosure, parked-extrapolation
 * regression lock (AQ pattern e954169), vision-repoint true-source, unit-rule
 * isolation, and transformer-gate N/A evidence.
 *
 * Source-scan tests use raw file reads (same pattern as
 * TrendAnalyzer.mcaGroundwallHonesty.test.ts / ArtifactDisclaimer.test.tsx).
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  calculateGroundwallInsulation,
  piIeeeMinProvenance
} from "../lib/mca/groundwallCalculator";
import {
  MCA_GROUNDWALL_EMPTY,
  mcaPayloadForSave,
  type McaOperatorSnapshot
} from "../lib/mca/mcaPersistence";
import { parseMcaValueAndUnit } from "../lib/mcaVisionExtractor";
import { VISION_PROVIDER_CHAIN } from "../lib/oilVisionExtractor";

const read = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

const reportSrc = read("./AnalysisReport.tsx");
const dashboardSrc = read("./McaResultsDashboard.tsx");
const trendSrc = read("./TrendAnalyzer.tsx");
const accordionsSrc = read("./McaInputAccordions.tsx");
const metadataSrc = read("./diagnostics/MeasurementMetadataSection.tsx");
const diagnoseSrc = read("./Diagnose.tsx");
const persistenceSrc = read("../lib/mca/mcaPersistence.ts");
const ssotSrc = read("../lib/mca/mcaSsot.ts");
const dictSrc = read("../lib/maintenance/prescriptiveDictionary.ts");
const calcSrc = read("../lib/mca/groundwallCalculator.ts");
const visionSrc = read("../lib/mcaVisionExtractor.ts");
const trendLibrarySrc = read("./reports/McaTrendLibraryTab.tsx");

describe("VS9 G1 — four-mode separation (static / dynamic / online / ESA)", () => {
  it("keeps the three collection modes declared and separate", () => {
    expect(accordionsSrc).toContain(
      'export type McaMode = "static" | "dynamic" | "online";'
    );
    expect(accordionsSrc).toContain('id: "static"');
    expect(accordionsSrc).toContain('id: "dynamic"');
    expect(accordionsSrc).toContain('id: "online"');
  });

  it("online PQ inputs are collected into the snapshot, labeled online", () => {
    // The five energized readings must reach the operator snapshot…
    expect(accordionsSrc).toContain("voltageUnbalancePct: optionalNum(voltageUnbalance)");
    expect(accordionsSrc).toContain("currentUnbalancePct: optionalNum(currentUnbalance)");
    expect(accordionsSrc).toContain("voltageThdPct: optionalNum(voltageThd)");
    expect(accordionsSrc).toContain("currentThdPct: optionalNum(currentThd)");
    expect(accordionsSrc).toContain("powerFactor: optionalNum(powerFactor)");
    // …gated to online mode…
    expect(accordionsSrc).toMatch(/\.\.\.\(isOnline\s*\?\s*\{\s*onlinePq:/);
    // …with the no-cross-threshold disclosure at the inputs.
    expect(normalize(accordionsSrc)).toContain(
      "no offline threshold is applied to these online values"
    );
  });

  it("the snapshot type carries onlinePq and the payload labels the mode", () => {
    expect(persistenceSrc).toContain("onlinePq?: {");
    expect(persistenceSrc).toContain("measurement_mode: \"online\"");
    expect(persistenceSrc).toContain("mca_mode: mcaMode");
    expect(persistenceSrc).toContain("NO offline winding threshold");
    expect(persistenceSrc).toContain("is computed from energized values");
  });

  it("an online snapshot persists onlinePq with measurement_mode=online and empty groundwall", () => {
    const payload = mcaPayloadForSave({
      mode: "online",
      onlinePq: {
        voltageUnbalancePct: 2.1,
        currentUnbalancePct: 1.4,
        voltageThdPct: 3.2,
        currentThdPct: 4.1,
        powerFactor: 0.87
      }
    } as McaOperatorSnapshot);
    const peak = payload.peaks[0] as Record<string, unknown>;
    const onlinePq = peak.online_pq as Record<string, unknown>;
    expect(onlinePq.voltageUnbalancePct).toBe(2.1);
    expect(onlinePq.powerFactor).toBe(0.87);
    expect(peak.measurement_mode).toBe("online");
    expect((payload.telemetry_data as Record<string, unknown>).mca_mode).toBe("online");
    // No offline winding value is fabricated from energized readings (the
    // empty-snapshot zeros stay zeros — nothing derived from onlinePq).
    const groundwall = peak.groundwall as Record<string, unknown>;
    expect(groundwall.ir1mMOmega).toBeFalsy();
    expect(groundwall.testVoltageV).toBeFalsy();
  });

  it("an offline snapshot carries no onlinePq block and labels its mode", () => {
    const payload = mcaPayloadForSave({ mode: "static" });
    const peak = payload.peaks[0] as Record<string, unknown>;
    expect(peak).not.toHaveProperty("online_pq");
    expect(peak).not.toHaveProperty("onlinePq");
    expect(peak.measurement_mode).toBeUndefined();
    expect((payload.telemetry_data as Record<string, unknown>).mca_mode).toBe("static");
  });

  it("insulation (Megger/PI/DAR) section is de-energized-gated with an online disclosure", () => {
    expect(accordionsSrc).toContain('title="4. Insulation to Ground (De-Energized)"');
    expect(normalize(accordionsSrc)).toContain(
      "it cannot be taken while the motor is energized"
    );
    expect(normalize(accordionsSrc)).toContain(
      "No insulation data is collected in online mode"
    );
  });
});

describe("VS9 G2 — winding-health citation is the real IEEE 43 / IEEE 118, never fabricated", () => {
  it("dashboard never states the flat 100 MΩ contradiction", () => {
    expect(dashboardSrc).not.toContain("IR &lt; 100 MΩ");
    expect(normalize(dashboardSrc)).toContain(
      "IR below the IEEE 43 voltage-rated minimum (kV + 1 MΩ from the stored nameplate; never a flat 100 MΩ constant)"
    );
    expect(normalize(dashboardSrc)).toContain(
      "Verdict omitted when no nameplate voltage is stored"
    );
  });

  it("the calculator's provenance is voltage-rated or omitted — the reference truth", () => {
    expect(calcSrc).toContain("never a flat 100 MΩ constant");
    const r = calculateGroundwallInsulation({
      ir30sMOmega: 2,
      ir1mMOmega: 4,
      ir10mMOmega: 8,
      testVoltageV: 250,
      ratedVoltageV: 480
    });
    expect(r.irIeeeMinMOmega).toBeCloseTo(1.48, 2);
    expect(r.irIeeeMinProvenance).toContain("voltage-rated minimum");
  });

  it("winding-resistance citation cites IEEE 118, not IEEE 286 (a tip-up standard)", () => {
    expect(dictSrc).toMatch(
      /MCA_WINDING_RESISTANCE_CITATION\s*=\s*"Winding resistance measurement per IEEE 118/
    );
    // The exported citation value itself must never cite 286 (explanatory
    // comments about the relabel are allowed to mention it).
    expect(dictSrc).not.toMatch(/CITATION\s*=\s*"[^"]*IEEE 286/);
    expect(dictSrc).toMatch(/CITATION\s*=\s*"[^"]*IEEE 118/);
    expect(normalize(dictSrc)).toContain(
      "Test Code for Electrical Measurement of Resistance of Windings of Rotating Machinery"
    );
    expect(normalize(dictSrc)).toContain("test method only, not a severity class");
  });
});

describe("VS9 G3 — ESA-family thresholds keep their in-repo basis", () => {
  it("surge EAR brackets stay labeled as vendor-heuristic source, not IEEE 522", () => {
    const surgeSrc = read("../lib/mca/surgeCalculator.ts");
    expect(surgeSrc).toContain("SURGE_EAR_SOURCE");
    expect(surgeSrc).not.toMatch(/IEEE\s*522[^"]*severity/i);
  });

  it("RIC variation brackets stay labeled as in-repo heuristics", () => {
    const dictNeedle = normalize(dictSrc);
    expect(dictNeedle).toContain(
      "in-repo heuristic RIC peak-to-peak variation brackets (4 % / 7 %)"
    );
  });
});

describe("VS9 G4 — transformer gating is honestly N/A (no MCA transformer variant)", () => {
  it("no transformer module or gating identifier exists in src/lib/mca", () => {
    const dir = fileURLToPath(new URL("../lib/mca", import.meta.url));
    const files = readdirSync(dir);
    expect(files.filter((f) => /transformer/i.test(f))).toEqual([]);
    for (const f of files.filter((f) => f.endsWith(".ts"))) {
      const src = read(`../lib/mca/${f}`);
      expect(
        src,
        `${f} must not carry a transformer-variant gate`
      ).not.toMatch(/transformerVariant|hasTransformer|isTransformer|mcaTransformer/);
    }
  });
});

describe("VS9 G5 — VS-3 vision repoint is live and not credit-dead", () => {
  it("mcaVisionExtractor runs the repointed shared master-vision loop", () => {
    expect(visionSrc).toContain("runMasterVisionModelLoop");
    expect(visionSrc).toContain("await runMasterVisionModelLoop(input)");
    expect(visionSrc).toContain("OIL_VISION_API_PATH");
  });

  it("no direct vendor fetch bypasses the shared loop", () => {
    expect(visionSrc).not.toMatch(/api\.openai\.com|openrouter\.ai|api\.mistral\.ai|generativelanguage\.googleapis\.com/);
  });

  it("the shared provider chain leads with a live provider; OpenRouter is a key-gated entry", () => {
    expect(VISION_PROVIDER_CHAIN[0].id).toBe("gemini");
    expect(
      VISION_PROVIDER_CHAIN.some((p) => p.envKey === "OPENROUTER_API_KEY")
    ).toBe(true);
  });

  it("the MCA technology gate stays — non-MCA documents never fill MCA fields", () => {
    expect(visionSrc).toContain(
      "MCA fields are auto-filled ONLY when the MCA gate passes"
    );
  });
});

describe("VS9 G6 — parked-extrapolation regression lock (AQ pattern e954169)", () => {
  it("AnalysisReport carries the park marker and none of the removed strings", () => {
    expect(reportSrc).toContain("PARKED (slice VS9, AQ pattern e954169)");
    expect(reportSrc).toContain("McaVisualPass.sliceVS9.test.tsx");
    for (const forbidden of [
      "Curve-Fit Failure Projection",
      "142 days",
      "McaDataLibrary",
      "MCA_LIBRARY_TESTS",
      "MCA_MULTI_TREND",
      "MCA_PHASE_HISTORY",
      "McaMethodCategory",
      "mcaMethodBadge",
      "mcaStatusBadge"
    ]) {
      // The only permitted occurrences are inside the parked doc-comments.
      const hits = reportSrc.split(forbidden).length - 1;
      if (hits > 0) {
        for (const line of reportSrc.split("\n")) {
          if (line.includes(forbidden)) {
            expect(line.trim().startsWith("//"), `line must be a comment: ${line}`).toBe(true);
          }
        }
      }
    }
  });

  it("the live wired tabs are untouched by the park", () => {
    expect(reportSrc).toContain('import McaResultsTab from "./reports/McaResultsTab"');
    expect(reportSrc).toContain('import McaTrendLibraryTab from "./reports/McaTrendLibraryTab"');
    expect(reportSrc).toContain("return <McaResultsTab selectedAnalysis={selectedAnalysis} />;");
  });

  it("no days/hours-to-limit projection re-enters TrendAnalyzer or the calculator", () => {
    for (const src of [trendSrc, calcSrc, dashboardSrc]) {
      const low = src.toLowerCase();
      for (const forbidden of [
        "hours to compliance",
        "days to compliance",
        "days to limit",
        "breached in ~",
        "degradation rate, minimum threshold will be breached"
      ]) {
        expect(low.includes(forbidden)).toBe(false);
      }
    }
  });
});

describe("VS9 G6b — assumed insulation class is disclosed, never stored as fact", () => {
  it("no stored class → Class F assumption with disclosed provenance", () => {
    const r = calculateGroundwallInsulation({
      ir30sMOmega: 2,
      ir1mMOmega: 4,
      ir10mMOmega: 8,
      testVoltageV: 250
    });
    expect(r.insulationClass).toBe("F");
    expect(r.insulationClassAssumed).toBe(true);
    expect(r.piIeeeMinProvenance).toContain("no insulation class stored");
    expect(r.piIeeeMinProvenance).toContain("Class A would allow 1.5");
    expect(r.piIeeeMin).toBe(2);
  });

  it("a stored class is used as fact (not 'assumed')", () => {
    const a = calculateGroundwallInsulation({
      ir30sMOmega: 2,
      ir1mMOmega: 4,
      ir10mMOmega: 8,
      testVoltageV: 250,
      insulationClass: "A"
    });
    expect(a.insulationClass).toBe("A");
    expect(a.insulationClassAssumed).toBe(false);
    expect(a.piIeeeMin).toBe(1.5);
    expect(a.piIeeeMinProvenance).toContain("stored Class A");

    const f = calculateGroundwallInsulation({
      ir30sMOmega: 2,
      ir1mMOmega: 4,
      ir10mMOmega: 8,
      testVoltageV: 250,
      insulationClass: "F"
    });
    expect(f.insulationClassAssumed).toBe(false);
    expect(f.piIeeeMin).toBe(2);
  });

  it("the empty snapshot no longer fabricates Class F", () => {
    expect(MCA_GROUNDWALL_EMPTY.insulationClass).toBeUndefined();
  });

  it("persistence / SSOT / trend sources carry no insulation-class fabrication", () => {
    for (const src of [persistenceSrc, ssotSrc, trendSrc]) {
      expect(src).not.toMatch(/insulation[Cc]lass[^;\n]{0,90}\?\?\s*"F"/);
      expect(src).not.toMatch(/insulation_[Cc]lass[^;\n]{0,90}\?\?\s*"F"/);
      expect(src).not.toMatch(/insulation[Cc]lass[^;\n]{0,90}\|\|\s*"F"/);
      expect(src).not.toMatch(/insulation_[Cc]lass[^;\n]{0,90}\|\|\s*"F"/);
    }
  });

  it("the TrendAnalyzer select exposes 'not stored' and never back-fills F on merge", () => {
    expect(trendSrc).toContain("Not stored — Class F assumed for PI minimum");
    expect(trendSrc).toContain("if (value === \"\") return;");
    expect(normalize(trendSrc)).toContain("(no class stored — F assumed)");
  });

  it("piIeeeMinProvenance helper states both classes honestly", () => {
    expect(piIeeeMinProvenance("A", false)).toContain("stored Class A");
    expect(piIeeeMinProvenance("F", true)).toContain("Class F assumed");
  });
});

describe("VS9 G7 — dimensionless ratios never enter a conversion path", () => {
  it("PI is untouched by the temperature correction that applies to IR only", () => {
    const withTemp = calculateGroundwallInsulation({
      ir30sMOmega: 2,
      ir1mMOmega: 4,
      ir10mMOmega: 8,
      testVoltageV: 250,
      windingTempC: 50
    });
    const withoutTemp = calculateGroundwallInsulation({
      ir30sMOmega: 2,
      ir1mMOmega: 4,
      ir10mMOmega: 8,
      testVoltageV: 250
    });
    expect(withTemp.pi).toBe(2);
    expect(withoutTemp.pi).toBe(2);
    // kT applies to IR only — never to the PI ratio.
    expect(withTemp.ir40MOmega).toBe(8);
    expect(withoutTemp.ir40MOmega).toBe(4);
  });
});

describe("VS9 G8 — vision unit rules: mega vs milli decided by SI case", () => {
  it("capital-M spellings are megaohm (previously misread as milliohm)", () => {
    expect(parseMcaValueAndUnit("12 MOhm")).toEqual({ value: 12, unit: "Mohm" });
    expect(parseMcaValueAndUnit("12 Mohms")).toEqual({ value: 12, unit: "Mohm" });
    expect(parseMcaValueAndUnit("1250 MΩ")).toEqual({ value: 1250, unit: "Mohm" });
    expect(parseMcaValueAndUnit("12 MOHM")).toEqual({ value: 12, unit: "Mohm" });
    expect(parseMcaValueAndUnit("1.2 megohm")).toEqual({ value: 1.2, unit: "Mohm" });
    expect(parseMcaValueAndUnit("1.2 MegOhm")).toEqual({ value: 1.2, unit: "Mohm" });
  });

  it("lowercase-m spellings are milliohm", () => {
    expect(parseMcaValueAndUnit("12.5 mOhm")).toEqual({ value: 0.0125, unit: "Ohm" });
    expect(parseMcaValueAndUnit("12.5 mΩ")).toEqual({ value: 0.0125, unit: "Ohm" });
    expect(parseMcaValueAndUnit("3 mohm")).toEqual({ value: 0.003, unit: "Ohm" });
  });

  it("other families keep their base conversions", () => {
    expect(parseMcaValueAndUnit("12 kohm")).toEqual({ value: 0.012, unit: "Mohm" });
    expect(parseMcaValueAndUnit("1.2 gohm")).toEqual({ value: 1200, unit: "Mohm" });
    expect(parseMcaValueAndUnit("0.35 Ω")).toEqual({ value: 0.35, unit: "Ohm" });
    expect(parseMcaValueAndUnit("12 mH")).toEqual({ value: 12, unit: "mH" });
    expect(parseMcaValueAndUnit("12 µH")).toEqual({ value: 0.012, unit: "mH" });
  });
});

describe("VS9 G9 — sweep discipline on the wired trend library", () => {
  it("date labels deduplicate same-date ticks (one label per calendar day)", () => {
    expect(trendLibrarySrc).toContain("rows[i - 1].ts.slice(0, 10) !== r.ts.slice(0, 10)");
  });

  it("windowing predicate and point-in-time honesty remain in TrendAnalyzer MCA", () => {
    expect(trendSrc).toContain("windowTrendByTimeRange(mcaAnalyses, timeRange)");
    expect(trendSrc).toContain("findLatestMcaWithGroundwall(windowedMcaAnalyses)");
  });

  it("TrendAnalyzer merge path never wipes a stored class with F", () => {
    expect(trendSrc).not.toContain('mcaRecord.groundwall.insulation_class || "F"');
  });
});

describe("VS9 G10 — orphaned legacy MCA inputs removed (dead-end panel)", () => {
  it("MeasurementMetadataSection no longer renders the parallel MCA parameter panel", () => {
    for (const forbidden of [
      "mcaParamVoltage",
      "mcaHp",
      "mcaResistance",
      "mcaInductance",
      "mcaPhaseAngle",
      "mcaInsulation"
    ]) {
      expect(metadataSrc.includes(forbidden), `${forbidden} must be gone`).toBe(false);
      expect(diagnoseSrc.includes(forbidden), `${forbidden} must be gone from Diagnose`).toBe(false);
    }
    expect(normalize(metadataSrc)).toContain(
      "MCA is collected through McaInputAccordions (mcaOperatorSnapshot)"
    );
  });
});
