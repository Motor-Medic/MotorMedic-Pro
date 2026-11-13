import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LEAK_COST_SEVERITY_BANDS,
  LEAK_COST_SEVERITY_SOURCE,
  LEAK_REPAIR_LABOR_RATE_USD_PER_HOUR,
  roundToSignificant,
  summarizeLeakInventory
} from "../lib/ultrasound/leakCalculator";
import {
  dbDelta,
  powerMeanDb,
  powerMeanDbRounded
} from "../lib/ultrasound/logUnits";
import { normalizeProbeType } from "../lib/ultrasound/probeType";
import { applySameDateSequenceLabels } from "../lib/vibration/trendSeries";

const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8").replace(
    /\r\n/g,
    "\n"
  );

const src = read("./TrendAnalyzer.tsx");
const logUnitsSrc = read("../lib/ultrasound/logUnits.ts");

function block(start: string, end: string): string {
  const from = src.indexOf(start);
  const to = src.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return src.slice(from, to);
}

const memos = block(
  "const ueLeakAnalyses = useMemo",
  "const ueElectricalAnalyses = useMemo"
);

const leaks = block(
  ') : ueMode === "leaks" ? (',
  ') : ueMode === "electrical" ? ('
);

describe("SLICE-VS8 the derived leak model is parked on the trend tab", () => {
  it("discloses the parked model in the basis pill instead of a basis table", () => {
    expect(leaks).toContain('data-testid="ue-leak-basis-pill"');
    expect(leaks).toContain("Measured dBµV readings only");
    expect(leaks).toContain("parked (SLICE-VS8)");
    expect(leaks).toContain("does not run on this tab");
    // No modeled basis constants surface on this tab anymore.
    expect(leaks).not.toContain("LEAK_BASIS_TEXT");
    expect(leaks).not.toContain("LEAK_IMPACT_DEFAULTS");
  });

  it("keeps the leak-rate KPI card parked and the measured cards live", () => {
    expect(leaks).toContain("Parked");
    expect(leaks).toContain("CFM / orifice / $ / CO₂ outputs are not derived here");
    expect(leaks).toContain("windowedUeLeakAnalyses.length");
    expect(leaks).toContain("ueLeakKpis.avgDelta");
  });

  it("proves provenance: delta is descriptive, no CFM derived on this tab", () => {
    expect(leaks).toContain('data-testid="ue-leak-status-provenance"');
    expect(leaks).toContain("descriptive subtraction of two dBµV levels");
    expect(leaks).toMatch(
      /No CFM,\s+orifice, dollar, or CO₂ estimate is derived on this tab/
    );
  });

  it("renders no dollar, CFM, orifice or CO₂ output anywhere in the leaks block", () => {
    expect(leaks).not.toContain("formatLeakUsdPerYear(");
    expect(leaks).not.toContain("formatLeakCfm(");
    expect(leaks).not.toContain("formatLeakOrificeIn(");
    expect(leaks).not.toContain("formatLeakCo2(");
    expect(leaks).not.toContain("annualCost");
    expect(leaks).not.toContain("estimatedCfm");
    expect(leaks).not.toContain("co2Emissions");
    expect(leaks).not.toContain(".toFixed(4)");
    expect(leaks).not.toMatch(/payback/i);
  });
});

describe("SLICE-VS8 log-unit guard", () => {
  it("aggregates dB deltas in the power domain, never with an arithmetic mean", () => {
    expect(memos).toContain("powerMeanDbRounded(deltaValues)");
    expect(src).toContain('powerMeanDbRounded,\n  DB_POWER_MEAN_NOTE\n} from "../lib/ultrasound/logUnits"');
    expect(leaks).toContain("{DB_POWER_MEAN_NOTE}");
    expect(leaks).toContain("Power-domain mean of per-run deltas");
    expect(leaks).toContain("not an arithmetic mean");
  });

  it("performs no dB→linear conversion on the leak surface", () => {
    // logUnits.ts permits only ΔdB subtraction and the power-domain
    // round-trip; the leak surface does neither (it only subtracts).
    expect(memos).not.toContain("Math.pow(10");
    expect(memos).not.toContain("10 **");
    expect(leaks).not.toContain("Math.pow(10");
    expect(leaks).not.toContain("10 **");
    // Any conversion must live in logUnits with its documented round-trip.
    expect(logUnitsSrc).toContain(
      "Never convert dBµV with an affine transform"
    );
    expect(powerMeanDb([])).toBeNull();
    // 10·log10(mean(10^(10/10), 10^(20/10))) = 17.4 — an arithmetic mean
    // would fabricate 15.0, proving this is not an affine/linear average.
    expect(powerMeanDbRounded([10, 20])).toBe(17.4);
    expect(powerMeanDbRounded([10, 20])).not.toBe(15);
    expect(dbDelta(55, 28)).toBe(27);
    expect(dbDelta(55, 28)).not.toBe(55 * 2);
  });

  it("renders an honest N/A when no finite delta exists — never a fabricated 0 dB", () => {
    expect(memos).toContain(
      ".filter((value): value is number => value != null && Number.isFinite(value))"
    );
    expect(leaks).toContain("ueLeakKpis.avgDelta == null");
    expect(leaks).toContain('"N/A"');
  });
});

describe("SLICE-VS8 airborne vs contact are separate quantities", () => {
  it("shows one labelled probe column — never one unlabeled pooled series", () => {
    expect(leaks).toContain("ULTRASOUND_PROBE_LABEL[row.probeType]");
    expect(leaks).toContain("<th className=\"py-2 pr-3 font-bold\">Probe</th>");
    // The reading mapper resolves the stored probe/transducer, not a guess.
    expect(src).toContain(
      "probeType = resolveProbeType(\n      p.probe_type ?? p.probeType ?? p.sensor_mount_type ?? p.mount_type,\n      p.transducer ?? p.sensor_type\n    );"
    );
  });

  it("never applies the bearing ladder to the leak tab", () => {
    expect(leaks).not.toContain("US_DDB_BRACKETS");
    expect(leaks).not.toContain("evaluateUsSeverity");
    expect(leaks).not.toContain("bearingLadderApplicable");
  });

  it("orders probe matching non-contact before contact", () => {
    // "non-contact" contains the substring "contact" but is an airborne
    // method; the airborne branch must be evaluated first.
    expect(normalizeProbeType("non-contact")).toBe("airborne");
    expect(normalizeProbeType("contact")).toBe("contact");
  });
});

describe("SLICE-VS8 windowing, lockstep totals and same-date labels", () => {
  it("windows leak analyses through the shared predicate", () => {
    expect(memos).toContain(
      "windowTrendByTimeRange(ueLeakAnalyses, timeRange)"
    );
    // Table rows and KPIs are derived from the windowed rows — never the
    // unwindowed set.
    const rowsBlock = memos.slice(memos.indexOf("ueLeakReadingRows"));
    expect(rowsBlock).toContain("[...windowedUeLeakAnalyses]");
    expect(memos).toContain("[ueLeakReadingRows]");
    expect(memos).toContain("hasUeLeakScans = ueLeakAnalyses.length > 0");
  });

  it("computes the KPIs from the exact rows the table renders", () => {
    const rows = [
      { annualCost: 48.95, estimatedCfm: 0.26, co2Emissions: 0.16 },
      { annualCost: 100.5, estimatedCfm: 1.2, co2Emissions: 0.31 }
    ];
    const totals = summarizeLeakInventory(rows);
    expect(totals.totalAnnualCost).toBe(149.45);
    expect(totals.totalCfm).toBe(1.5);
    expect(totals.totalCo2).toBe(0.5);
    // Kept as parked-math regression for the verify script only.
    expect(summarizeLeakInventory([])).toEqual({
      totalAnnualCost: 0,
      totalCfm: 0,
      totalCo2: 0
    });
  });

  it("labels same-day runs deterministically via the shared SSOT helper", () => {
    expect(memos).toContain("applySameDateSequenceLabels(");
    const labeled = applySameDateSequenceLabels([
      { date: "Mar 5", dateLabel: "Mar 5" },
      { date: "Mar 5", dateLabel: "Mar 5" },
      { date: "Mar 7", dateLabel: "Mar 7" }
    ]);
    expect(labeled.map((p) => p.dateLabel)).toEqual([
      "Mar 5 · 1",
      "Mar 5 · 2",
      "Mar 7"
    ]);
  });
});

describe("SLICE-VS8 absent vs zero and honest empty states", () => {
  it("separates no-scans, no-scans-in-window, and unreadable-peaks states", () => {
    expect(leaks).toContain("No stored ultrasound leak scans for this asset");
    expect(leaks).toContain(
      "No leak scans in the selected ${timeRange} window."
    );
    expect(leaks).toContain(
      "none carry a readable peak dBµV value"
    );
    expect(leaks).toContain("ueLeakReadingRows.length === 0");
  });

  it("renders a dash for every missing measured field (null-trio)", () => {
    expect(leaks).toContain(
      'row.peakDb != null\n                              ? `${row.peakDb.toFixed(1)} dBµV`\n                              : "—"'
    );
    expect(leaks).toContain(
      'row.baselineDb != null\n                              ? `${row.baselineDb.toFixed(1)} dBµV`\n                              : "—"'
    );
    expect(leaks).toContain(
      'row.deltaDb != null\n                              ? `${row.deltaDb.toFixed(1)} dB`\n                              : "—"'
    );
    // A fallback baseline is disclosed as modeled, not stored.
    expect(leaks).toContain('"Modeled fallback"');
    expect(leaks).toContain('"Stored baseline"');
  });
});

describe("SLICE-VS8 threshold citations stay in-repo guidance", () => {
  it("keeps the dollar bands in an explicit labelled constant table (parked math)", () => {
    expect(LEAK_COST_SEVERITY_BANDS).toHaveLength(3);
    expect(LEAK_COST_SEVERITY_SOURCE).toContain("Static in-repo");
    expect(LEAK_COST_SEVERITY_SOURCE).toContain("not an ISO/DOE standard");
  });

  it("keeps the two-sig-fig rounding honest for dB-derived figures", () => {
    expect(roundToSignificant(48.95, 2)).toBe(49);
    expect(roundToSignificant(0.0112, 2)).toBe(0.011);
  });

  it("has no stored/configured repair labor rate, so no payback sentence", () => {
    expect(LEAK_REPAIR_LABOR_RATE_USD_PER_HOUR).toBeNull();
    expect(leaks).not.toMatch(/payback/i);
  });
});

describe("SLICE-VS8 erosion is omitted (no leak identity across inspections)", () => {
  it("does not fabricate per-leak erosion or a days-to-critical extrapolation", () => {
    expect(memos).not.toContain("leak_id");
    expect(leaks).not.toMatch(/erosion/i);
    expect(leaks).not.toMatch(/slope/i);
    expect(src).not.toMatch(/projected to exceed/i);
    expect(src).not.toMatch(/critical CFM/i);
  });
});

describe("SLICE-VS8 dBµV isolation regression", () => {
  it("keeps peak dBµV unconverted and outside the H2 display-unit prefs", () => {
    expect(leaks).toContain("dBµV");
    for (const forbidden of [
      "displayUnits",
      "formatVelocityDisplay",
      "formatAccelerationDisplay",
      "velocityValueForDisplay",
      "frequencyValueForDisplay",
      "convertTemperature"
    ]) {
      expect(leaks).not.toContain(forbidden);
    }
  });
});
