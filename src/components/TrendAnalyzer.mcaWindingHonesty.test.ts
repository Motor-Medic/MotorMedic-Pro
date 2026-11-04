import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALUMINUM_TEMP_COEFFICIENT_K,
  COPPER_TEMP_COEFFICIENT_K,
  calculateWindingBalance,
  normalizeResistanceTo25C,
  type WindingBalanceParams
} from "../lib/mca/windingBalanceCalculator";
import {
  MCA_IMBALANCE_BRACKETS,
  MCA_IMBALANCE_SOURCE,
  MCA_LZ_DIVERGENCE_SOURCE
} from "../lib/maintenance/prescriptiveDictionary";
import {
  EMPTY_MCA_SSOT,
  deepMergeMcaSsot,
  mcaSsotFromExtracted,
  mcaWindingFromSsot
} from "../lib/mca/mcaSsot";
import type { McaExtractedData } from "../lib/mca/mcaPdfExtractor";

const trendSrc = readFileSync(
  fileURLToPath(new URL("./TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
);
const calcSrc = readFileSync(
  fileURLToPath(new URL("../lib/mca/windingBalanceCalculator.ts", import.meta.url)),
  "utf8"
);
const promptSrc = readFileSync(
  fileURLToPath(new URL("../lib/mca/mcaVisionExtractor.ts", import.meta.url)),
  "utf8"
);

function block(start: string, end: string): string {
  const from = trendSrc.indexOf(start);
  const to = trendSrc.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return trendSrc.slice(from, to);
}

const base: WindingBalanceParams = {
  phaseR: [1, 1, 1.02],
  phaseL: [10, 10, 10],
  phaseZ: [2, 2, 2],
  phaseFi: [80, 80, 80],
  phaseIF: [1, 1, 1],
  windingTempC: 75
};

describe("SLICE-AF material-gated °C-locked normalization", () => {
  it("uses the matching coefficient for copper and aluminum", () => {
    expect(COPPER_TEMP_COEFFICIENT_K).toBe(234.5);
    expect(ALUMINUM_TEMP_COEFFICIENT_K).toBe(228);
    const copper = normalizeResistanceTo25C(2, 75, "copper");
    const aluminum = normalizeResistanceTo25C(2, 75, "aluminum");
    expect(copper).toBeCloseTo((2 * (234.5 + 25)) / (234.5 + 75), 8);
    expect(aluminum).toBeCloseTo((2 * (228 + 25)) / (228 + 75), 8);
    expect(copper).not.toBe(aluminum);
  });

  it("never silently applies copper math when material is unknown", () => {
    const copper = calculateWindingBalance({
      ...base,
      conductorMaterial: "copper"
    });
    const aluminum = calculateWindingBalance({
      ...base,
      conductorMaterial: "aluminum"
    });
    const unknown = calculateWindingBalance({
      ...base,
      conductorMaterial: "unknown"
    });
    const missing = calculateWindingBalance(base);

    expect(unknown.normalization.materialAssumed).toBe(true);
    expect(unknown.normalization.basis).toContain("assumed copper");
    expect(missing.normalization.materialAssumed).toBe(true);
    expect(missing.normalization.basis).toContain("assumed copper");
    expect(unknown.normalization.basis).not.toBe(
      copper.normalization.basis
    );
    expect(aluminum.normalization.basis).toContain("aluminum");
    expect(aluminum.phaseR25[0]).not.toBe(copper.phaseR25[0]);
  });

  it("shows raw R and an honest note when temperature is absent", () => {
    const raw = calculateWindingBalance({ ...base, windingTempC: undefined });
    expect(raw.tempCorrected).toBe(false);
    expect(raw.normalization.applied).toBe(false);
    expect(raw.normalization.basis).toContain("not temperature-corrected");
  });

  it("keeps the formula °C-locked (no display-unit conversion in the math)", () => {
    expect(calcSrc).toContain("COPPER_TEMP_COEFFICIENT_K");
    expect(calcSrc).toContain("ALUMINUM_TEMP_COEFFICIENT_K");
    expect(calcSrc).not.toContain("fahrenheitToCelsius");
    expect(calcSrc).not.toContain("convertAbsoluteTemperature");
    expect(calcSrc).not.toContain("°F");
  });
});

describe("SLICE-AF unbalance source is corrected (not a NEMA resistance matrix)", () => {
  it("labels the bracket as industry rule-of-thumb / vendor guidance", () => {
    expect(MCA_IMBALANCE_SOURCE).toContain("industry rule-of-thumb");
    expect(MCA_IMBALANCE_SOURCE).toContain("motor voltage unbalance");
    expect(MCA_IMBALANCE_SOURCE).not.toContain("NEMA MG-1 practice");
    expect(
      MCA_IMBALANCE_BRACKETS.every((b) => !b.action.includes("NEMA"))
    ).toBe(true);
  });

  it("states the unbalance denominator is the three-phase mean", () => {
    expect(trendSrc).toContain("MCA_UNBALANCE_FORMULA");
    expect(
      readFileSync(
        fileURLToPath(
          new URL("../lib/maintenance/prescriptiveDictionary.ts", import.meta.url)
        ),
        "utf8"
      )
    ).toContain("denominator is the three-phase mean");
  });
});

describe("SLICE-AF divergence is descriptive-only", () => {
  it("computes a present-if-stored L/Z divergence without a severity verdict", () => {
    const r = calculateWindingBalance({ ...base, conductorMaterial: "copper" });
    expect(r.phaseLZDivergencePct).not.toBeNull();
    expect(r.phaseLZDivergencePct).toBeGreaterThanOrEqual(0);
    expect(MCA_LZ_DIVERGENCE_SOURCE).toContain("descriptive only");
    expect(MCA_LZ_DIVERGENCE_SOURCE).not.toMatch(/short detected/i);
    expect(calcSrc).not.toMatch(/short detected/i);
    expect(calcSrc).not.toContain("Stator Turn-to-Turn / Coil Short");
    expect(trendSrc).toContain('data-testid="mca-lz-divergence"');
  });
});

describe("SLICE-AF null-vs-zero guard (0 Ω cannot come from a missing phase)", () => {
  it("treats a partial R triplet as absent instead of zero-filling it", () => {
    const partial = calculateWindingBalance({
      phaseR: [5, null, 7] as unknown as [number, number, number],
      phaseL: [0, 0, 0],
      phaseZ: [0, 0, 0],
      phaseFi: [0, 0, 0],
      phaseIF: [0, 0, 0]
    });
    expect(partial.metricData.R).toBe(false);
    expect(partial.phaseR25).toEqual([0, 0, 0]);
    expect(partial.hasData).toBe(false);
    expect(partial.unbalanceR).toBe(0);
  });

  it("treats a zero resistance as absent, never as a dead short", () => {
    const zero = calculateWindingBalance({
      phaseR: [5, 0, 7],
      phaseL: [10, 10, 10],
      phaseZ: [2, 2, 2],
      phaseFi: [80, 80, 80],
      phaseIF: [1, 1, 1]
    });
    expect(zero.metricData.R).toBe(false);
    expect(zero.phaseR25).toEqual([0, 0, 0]);
    expect(zero.unbalanceR).toBe(0);
  });

  it("renders the honest Awaiting Data state with no 0-ohm/0-% fabrication", () => {
    const empty = calculateWindingBalance(
      mcaWindingFromSsot(EMPTY_MCA_SSOT.phase_balance)
    );
    expect(empty.hasData).toBe(false);
    expect(empty.phaseR25).toEqual([0, 0, 0]);
    expect(empty.phaseLZDivergencePct).toBeNull();
    expect(empty.fault).toBe("Awaiting Data");
  });

  it("carries the uploaded file values through SSOT into the rendered params", () => {
    const extracted: McaExtractedData = {
      phaseR: [11.1, 11.4, 11.8],
      phaseL: [21, 21.2, 21.4],
      phaseZ: [13, 13.1, 13.2],
      phaseFi: [78, 79, 80],
      phaseIF: [1.1, 1.2, 1.3],
      windingTempC: 60,
      conductorMaterial: "aluminum",
      rawText: "sample report",
      formatDetected: "GENERIC_TABULAR",
      confidenceScore: 80
    };
    const record = deepMergeMcaSsot(
      EMPTY_MCA_SSOT,
      mcaSsotFromExtracted(extracted)
    );
    const rendered = calculateWindingBalance(
      mcaWindingFromSsot(record.phase_balance)
    );
    expect(rendered.hasData).toBe(true);
    expect(rendered.normalization.material).toBe("aluminum");
    expect(rendered.normalization.applied).toBe(true);
    expect(rendered.unbalanceL).toBeCloseTo(0.94, 1);
    // Copper math would not equal these normalized values (material preserved).
    expect(rendered.phaseR25[0]).toBeCloseTo(
      normalizeResistanceTo25C(11.1, 60, "aluminum"),
      2
    );
  });

  it("the grid formatter renders a blank for zero/null", () => {
    expect(trendSrc).toContain(
      "if (value == null || !Number.isFinite(value) || value === 0) return \"---\";"
    );
  });
});

describe("SLICE-AF ingestion, windowing, and unit isolation", () => {
  it("wires upload → extracted SSOT → rendered record", () => {
    expect(trendSrc).toContain("const extracted = await extractMcaDataFromFile(file)");
    expect(trendSrc).toContain("mcaSsotFromExtracted(extracted");
    expect(trendSrc).toContain("mergeMcaRecord(patch)");
    expect(trendSrc).toContain("mcaWindingParams");
  });

  it("windows the point-in-time MCA tests through the shared predicate", () => {
    expect(trendSrc).toContain(
      "windowTrendByTimeRange(mcaAnalyses, timeRange)"
    );
    expect(trendSrc).toContain("const latestMca = windowedMcaAnalyses[0] ?? null");
    expect(trendSrc).toContain("findLatestMcaWithGroundwall(windowedMcaAnalyses)");
  });

  it("keeps ohm/mH/deg/% raw and routes only temperature through the U preference", () => {
    const mca = block(
      '{trendTech === "mca" && (',
      '{trendTech === "oil_analysis" && ('
    );
    for (const forbidden of [
      "formatVelocityDisplay",
      "formatAccelerationDisplay",
      "velocityValueForDisplay",
      "frequencyValueForDisplay",
      "hzToCpm"
    ]) {
      expect(mca).not.toContain(forbidden);
    }
    expect(trendSrc).toContain("resolveTemperatureDisplayUnit");
    expect(mca).toContain("mcaWindingTempDisplayUnit");
    expect(mca).toContain("convertAbsoluteTemperature");
    expect(mca).toContain("formula °C-locked");
  });

  it("declares material in the extraction schema", () => {
    expect(promptSrc).toContain("conductor_material");
    expect(promptSrc).toContain("windingTempC");
  });
});
