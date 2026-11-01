import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  calculateLeakImpact,
  formatLeakCfm,
  formatLeakCo2,
  formatLeakOrificeIn,
  formatLeakUsdPerYear,
  leakCostSeverity,
  leakDailySavingsUsd,
  LEAK_BASIS_NOTE,
  LEAK_BASIS_TEXT,
  LEAK_COST_SEVERITY_BANDS,
  LEAK_COST_SEVERITY_SOURCE,
  LEAK_IMPACT_DEFAULTS,
  LEAK_REPAIR_LABOR_RATE_USD_PER_HOUR,
  roundToSignificant,
  summarizeLeakInventory
} from "../lib/ultrasound/leakCalculator";
import { filterTrendByTimeRange } from "../lib/vibration/trendSeries";

const src = readFileSync(
  fileURLToPath(new URL("./TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
);

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

describe("SLICE-AA compressed-air assumption transparency", () => {
  it("lists the exact hardcoded calculator basis beside derived dollars/CO2", () => {
    expect(LEAK_BASIS_TEXT).toContain("100 psi");
    expect(LEAK_BASIS_TEXT).toContain("$0.12/kWh");
    expect(LEAK_BASIS_TEXT).toContain("8760 h/yr");
    expect(LEAK_BASIS_TEXT).toContain("18 kW/100 CFM");
    expect(LEAK_BASIS_TEXT).toContain("eGRID US avg");
    expect(LEAK_BASIS_TEXT).toContain(
      String(LEAK_IMPACT_DEFAULTS.egridMetricTonsCo2PerKwh)
    );
    expect(LEAK_BASIS_NOTE).toContain("not measured");
    expect(leaks).toContain("data-testid=\"ue-leak-basis-pill\"");
    expect(leaks).toContain("LEAK_BASIS_TEXT");
    expect(leaks).toContain("LEAK_BASIS_NOTE");
  });

  it("derives the demo leak with the documented defaults (100 psi, $0.12, 8760 h, 18 kW/100 CFM)", () => {
    const result = calculateLeakImpact({ peakDb: 55, baselineDb: 28 });
    expect(result.orificeSize).toBe(0.0112);
    expect(result.flowRateCfm).toBe(0.26);
    expect(result.annualCost).toBe(48.95);
    expect(result.co2Emissions).toBe(0.16);
  });
});

describe("SLICE-AA honest precision for dB-derived figures", () => {
  it("rounds to two significant figures instead of four-sig-fig dollars", () => {
    expect(roundToSignificant(48.95, 2)).toBe(49);
    expect(roundToSignificant(0.0112, 2)).toBe(0.011);
    expect(roundToSignificant(0.26, 2)).toBe(0.26);
    expect(formatLeakUsdPerYear(48.95)).toBe("$49/yr");
    expect(formatLeakOrificeIn(0.0112)).toBe("0.011 in");
    expect(formatLeakCfm(0.26)).toBe("0.26 CFM");
    expect(formatLeakCo2(0.16)).toBe("0.16 MT/yr");
  });

  it("stops formatting leak rows at the old four-decimal orifice / two-decimal dollar precision", () => {
    expect(leaks).not.toContain(".toFixed(4)");
    expect(leaks).not.toMatch(/formatUsdPerYear\(/);
    expect(leaks).toContain("formatLeakUsdPerYear(");
    expect(leaks).toContain("formatLeakOrificeIn(");
    expect(leaks).toContain("formatLeakCfm(");
    expect(leaks).toContain("formatLeakCo2(");
  });
});

describe("SLICE-AA severity thresholds are in-repo guidance", () => {
  it("keeps the dollar bands in an explicit labelled constant table", () => {
    expect(LEAK_COST_SEVERITY_BANDS).toHaveLength(3);
    expect(LEAK_COST_SEVERITY_SOURCE).toContain("Static in-repo");
    expect(leaks).toContain("LEAK_COST_SEVERITY_SOURCE");
  });

  it("classifies by the stored/computed annual cost only", () => {
    expect(leakCostSeverity(0)).toBe("small");
    expect(leakCostSeverity(99)).toBe("small");
    expect(leakCostSeverity(100)).toBe("medium");
    expect(leakCostSeverity(999)).toBe("medium");
    expect(leakCostSeverity(1000)).toBe("large");
    expect(leakCostSeverity(5000)).toBe("large");
    expect(leakCostSeverity(5000.01)).toBe("critical");
  });
});

describe("SLICE-AA windowing and totals lockstep", () => {
  it("windows leak analyses through the shared predicate", () => {
    expect(memos).toContain(
      "windowTrendByTimeRange(ueLeakAnalyses, timeRange)"
    );
    const rows = block(
      "const ueLeakInventoryRows = useMemo",
      "const ueLeakKpis = useMemo"
    );
    expect(rows).toContain("windowedUeLeakAnalyses");
    expect(rows).not.toContain("ueLeakAnalyses.map");
  });

  it("a 7D window excludes an old leak scan instead of showing a stale total", () => {
    const now = Date.parse("2026-10-30T12:00:00.000Z");
    const scans = [
      { timestamp: "2026-01-01T00:00:00.000Z" },
      { timestamp: "2026-10-29T00:00:00.000Z" }
    ];
    const windowed = filterTrendByTimeRange(scans, "7D", now);
    expect(windowed).toHaveLength(1);
    expect(windowed[0].timestamp).toBe("2026-10-29T00:00:00.000Z");
  });

  it("computes the three KPI totals from the exact rows the table renders", () => {
    expect(memos).toContain("summarizeLeakInventory(ueLeakInventoryRows)");
    expect(memos).not.toMatch(/for \(const row of ueLeakAnalyses\)/);

    const rows = [
      { annualCost: 48.95, estimatedCfm: 0.26, co2Emissions: 0.16 },
      { annualCost: 100.5, estimatedCfm: 1.2, co2Emissions: 0.31 }
    ];
    const totals = summarizeLeakInventory(rows);
    expect(totals.totalAnnualCost).toBe(149.45);
    expect(totals.totalCfm).toBe(1.5);
    expect(totals.totalCo2).toBe(0.5);
  });
});

describe("SLICE-AA absent vs zero", () => {
  it("renders N/A when the window has no scans and $0 only when scans have no leaks", () => {
    expect(memos).toContain(
      "const ueLeakKpisAbsent = windowedUeLeakAnalyses.length === 0"
    );
    expect(leaks).toContain('"N/A"');
    expect(leaks).toContain("No stored ultrasound leak scans");
    expect(leaks).toContain("No leak scans in the selected ${timeRange} window.");
    expect(leaks).toContain("No active leaks in the selected window");
    // N/A is gated by the absent flag, never shown as a hardcoded zero.
    expect(leaks).toContain("ueLeakKpisAbsent");
  });
});

describe("SLICE-AA sort controls are live", () => {
  it("wires both Date and Annual Cost headers to the sort handler", () => {
    expect(leaks).toContain('toggleUeLeakSort("date")');
    expect(leaks).toContain('toggleUeLeakSort("annual_cost")');
    expect(src).toContain("const toggleUeLeakSort =");
    const rows = block(
      "const ueLeakInventoryRows = useMemo",
      "const ueLeakKpis = useMemo"
    );
    expect(rows).toContain('ueLeakSort.key === "annual_cost"');
    expect(rows).toContain("a.dateMs - b.dateMs");
  });
});

describe("SLICE-AA payback is gated off (no stored labor rate)", () => {
  it("has no stored/configured repair labor rate", () => {
    expect(LEAK_REPAIR_LABOR_RATE_USD_PER_HOUR).toBeNull();
  });

  it("shows derived daily savings and omits any payback-days sentence", () => {
    expect(leakDailySavingsUsd(48.95)).toBe(0.13);
    expect(leakDailySavingsUsd(0)).toBeNull();
    expect(leaks).toContain("Derived daily savings:");
    expect(leaks).toContain("365");
    expect(leaks).not.toMatch(/payback/i);
  });
});

describe("SLICE-AA erosion is omitted (no leak identity across inspections)", () => {
  it("does not fabricate per-leak erosion or a days-to-critical extrapolation", () => {
    expect(memos).not.toContain("leak_id");
    expect(leaks).not.toMatch(/erosion/i);
    expect(leaks).not.toMatch(/slope/i);
    expect(src).not.toMatch(/projected to exceed/i);
    expect(src).not.toMatch(/critical CFM/i);
  });
});

describe("SLICE-AA dBµV isolation regression", () => {
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
