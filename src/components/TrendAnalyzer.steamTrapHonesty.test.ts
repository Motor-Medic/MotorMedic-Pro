import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  calculateAdvancedSteamLoss,
  classifySteamTrapFusionStatus,
  formatSteamUsd,
  formatSteamUsdPerYear,
  roundToSignificant,
  STEAM_BASIS_NOTE,
  STEAM_BASIS_TEXT,
  STEAM_ECONOMICS_DEFAULTS,
  STEAM_PAYBACK_BASIS_TEXT
} from "../lib/steam/advancedSteamCalculator";
import { buildWorkOrderPrefill } from "../lib/maintenance/workOrderPrefill";
import { convertTemperatureDelta } from "../lib/vibration/units";
import { filterTrendByTimeRange } from "../lib/vibration/trendSeries";

const src = readFileSync(
  fileURLToPath(new URL("./TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
);
const calcSrc = readFileSync(
  fileURLToPath(
    new URL("../lib/steam/advancedSteamCalculator.ts", import.meta.url)
  ),
  "utf8"
);
const reportSrc = readFileSync(
  fileURLToPath(new URL("./AnalysisReport.tsx", import.meta.url)),
  "utf8"
);
const dictSrc = readFileSync(
  fileURLToPath(
    new URL("../lib/maintenance/prescriptiveDictionary.ts", import.meta.url)
  ),
  "utf8"
);

function block(start: string, end: string): string {
  const from = src.indexOf(start);
  const to = src.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return src.slice(from, to);
}

const steamMemos = block(
  "const ueSteamAnalyses = useMemo",
  "const toggleUeLeakSort"
);
const steamRow = block(
  "function ueSteamInventoryFromRow",
  "function steamSeverityBadgeClass"
);
const steam = block(
  ') : ueMode === "steam" ? (',
  ') : null}'
);

describe("SLICE-AD steam payback provenance", () => {
  it("labels payback as a hardcoded replacement-cost assumption, not stored data", () => {
    expect(STEAM_PAYBACK_BASIS_TEXT).toContain("hardcoded");
    expect(STEAM_PAYBACK_BASIS_TEXT).toContain(
      "not a stored repair estimate"
    );
    expect(STEAM_PAYBACK_BASIS_TEXT).toContain(
      `$${STEAM_ECONOMICS_DEFAULTS.standardReplacementCostUsd}`
    );
    expect(STEAM_PAYBACK_BASIS_TEXT).toContain(
      `$${STEAM_ECONOMICS_DEFAULTS.invertedBucketReplacementCostUsd}`
    );
    expect(steam).toContain("STEAM_PAYBACK_BASIS_TEXT");
    expect(steam).toContain('data-testid="ue-steam-payback-basis"');
    expect(steamMemos).not.toContain("estimated_repair_cost");
  });

  it("marks the calculator result as assumption-backed with the exact USD assumption", () => {
    const standard = calculateAdvancedSteamLoss({
      orificeSize: 0.125,
      steamPressurePsig: 100,
      ultrasoundPeakDb: 40,
      upstreamTemp: 300,
      downstreamTemp: 250
    });
    expect(standard.paybackBasis).toBe("hardcoded-replacement-cost");
    expect(standard.paybackAssumptionUsd).toBe(
      STEAM_ECONOMICS_DEFAULTS.standardReplacementCostUsd
    );

    const inverted = calculateAdvancedSteamLoss({
      orificeSize: 0.125,
      steamPressurePsig: 100,
      ultrasoundPeakDb: 40,
      trapType: "Inverted Bucket",
      upstreamTemp: 300,
      downstreamTemp: 250
    });
    expect(inverted.paybackAssumptionUsd).toBe(
      STEAM_ECONOMICS_DEFAULTS.invertedBucketReplacementCostUsd
    );
  });
});

describe("SLICE-AD trap ΔT provenance", () => {
  it("reads ΔT only from the trap scan's own stored endpoints, never IR", () => {
    expect(steamRow).toContain("p.upstream_temp");
    expect(steamRow).toContain("p.downstream_temp");
    expect(steamRow).toContain("td.upstream_temp");
    expect(steamRow).toContain("td.downstream_temp");
    expect(steamRow).not.toContain("thermoTemps");
    expect(src).not.toContain("latestThermoSteamTemps");
    expect(src).not.toContain("fields.hotspot");
  });

  it("reports the fusion matrix as stored-per-scan, not thermal-linked", () => {
    expect(steam).toContain("stored per-scan ΔT");
    expect(steam).toContain("no stored per-trap ΔT");
    expect(steam).not.toContain("thermal linked");
    expect(steam).toContain("ueSteamThermalLinkedCount");
  });

  it("returns null ΔT (no invented differential) when the scan stored none", () => {
    const fusion = classifySteamTrapFusionStatus({
      ultrasoundPeakDb: 40
    });
    expect(fusion.tempDrop).toBeNull();
    expect(fusion.thermalAvailable).toBe(false);
    expect(fusion.status).not.toMatch(/blocked/i);
  });

  it("uses a stored per-scan ΔT when both endpoints exist", () => {
    const fusion = classifySteamTrapFusionStatus({
      ultrasoundPeakDb: 10,
      upstreamTemp: 212,
      downstreamTemp: 209.7
    });
    expect(fusion.tempDrop).toBe(2.3);
    expect(fusion.thermalAvailable).toBe(true);
    expect(fusion.status).toBe("Cold / Blocked");
  });
});

describe("SLICE-AD water-hammer is withheld (no stored acoustic volatility)", () => {
  it("narrows the blocked label to the stored classification alone", () => {
    expect(calcSrc).not.toMatch(/water hammer/i);
    expect(steam).not.toMatch(/water hammer/i);
    expect(calcSrc).toContain("Cold / Blocked");
  });

  it("does not claim a water-hammer risk from ΔT alone", () => {
    const blocked = classifySteamTrapFusionStatus({
      ultrasoundPeakDb: 5,
      upstreamTemp: 212,
      downstreamTemp: 205
    });
    expect(blocked.severity).toBe("CRITICAL");
    expect(blocked.status).toBe("Cold / Blocked");
    expect(blocked.status).not.toMatch(/water hammer/i);
  });
});

function centered(text: string, needle: string): boolean {
  return text.includes(needle);
}

describe("SLICE-AD economics basis disclosure", () => {
  it("lists every true modeled constant in the basis pill", () => {
    expect(STEAM_BASIS_TEXT).toContain(
      `${STEAM_ECONOMICS_DEFAULTS.returnHeaderPsia} psia atmospheric`
    );
    expect(STEAM_BASIS_TEXT).toContain(
      `$${STEAM_ECONOMICS_DEFAULTS.fuelCostPerThousandLb.toFixed(2)}/1,000 lb`
    );
    expect(STEAM_BASIS_TEXT).toContain(
      `${STEAM_ECONOMICS_DEFAULTS.operatingHoursPerYear} h/yr`
    );
    expect(STEAM_BASIS_TEXT).toContain(
      `Napier ${STEAM_ECONOMICS_DEFAULTS.napierCoeff}`
    );
    expect(STEAM_BASIS_TEXT).toContain(
      `choked ratio ${STEAM_ECONOMICS_DEFAULTS.chokedRatio}`
    );
    expect(STEAM_BASIS_TEXT).toContain(
      `${STEAM_ECONOMICS_DEFAULTS.co2ShortTonsPerLbSteam} short tons/lb`
    );
    expect(STEAM_BASIS_TEXT).toContain("no boiler-efficiency term");
    expect(STEAM_BASIS_TEXT).toContain(
      `${STEAM_ECONOMICS_DEFAULTS.defaultSupplyPsig} psig default`
    );
    expect(STEAM_BASIS_NOTE).toContain("not measured");
    expect(steam).toContain('data-testid="ue-steam-basis-pill"');
    expect(steam).toContain("STEAM_BASIS_TEXT");
    expect(steam).toContain("STEAM_BASIS_NOTE");
  });

  it("keeps the return header atmospheric because no return pressure is stored", () => {
    expect(steamRow).not.toContain("downstreamPressurePsia");
    expect(STEAM_ECONOMICS_DEFAULTS.returnHeaderPsia).toBe(14.7);
  });
});

describe("SLICE-AD honest precision for modeled dollars", () => {
  it("rounds modeled dollars to two significant figures", () => {
    expect(roundToSignificant(11072.58, 2)).toBe(11000);
    expect(formatSteamUsd(11072.58)).toBe("$11,000");
    expect(formatSteamUsd(5536.29)).toBe("$5,500");
    expect(formatSteamUsdPerYear(11072.58)).toBe("$11,000/yr");
  });

  it("replaces the old two-decimal currency formatter in the steam surface", () => {
    expect(steam).not.toContain("formatUsdPerYear");
    expect(steam).toContain("formatSteamUsdPerYear");
  });
});

describe("SLICE-AD units stay honest", () => {
  it("projects ΔT by scale only when the temperature preference flips", () => {
    expect(convertTemperatureDelta(2.3, "°F", "°C")).toBeCloseTo(1.278, 3);
    expect(steam).toContain("formatSteamDelta");
    expect(steam).toContain("steamDeltaUnit");
    expect(steamMemos).toContain("resolveTemperatureDisplayUnit");
    expect(steam).not.toContain("convertAbsoluteTemperature");
  });

  it("never converts psig or dBµV through the display-unit preferences", () => {
    expect(steam).toContain("psig");
    expect(steam).toContain("dBµV");
    for (const forbidden of [
      "formatVelocityDisplay",
      "velocityValueForDisplay",
      "formatAccelerationDisplay",
      "frequencyValueForDisplay"
    ]) {
      expect(steam).not.toContain(forbidden);
    }
  });
});

describe("SLICE-AD windowing, lockstep, absent-vs-zero", () => {
  it("windows steam analyses through the shared predicate", () => {
    expect(steamMemos).toContain(
      "windowTrendByTimeRange(ueSteamAnalyses, timeRange)"
    );
    expect(steamMemos).toContain("windowedUeSteamAnalyses");
    expect(steamMemos).not.toMatch(/ueSteamAnalyses\.map/);
  });

  it("a 7D window excludes an old trap scan instead of showing a stale KPI", () => {
    const now = Date.parse("2026-11-02T12:00:00.000Z");
    const scans = [
      { timestamp: "2026-01-01T00:00:00.000Z" },
      { timestamp: "2026-11-01T00:00:00.000Z" }
    ];
    const windowed = filterTrendByTimeRange(scans, "7D", now);
    expect(windowed).toHaveLength(1);
    expect(windowed[0].timestamp).toBe("2026-11-01T00:00:00.000Z");
  });

  it("keeps KPIs in lockstep with the rendered rows", () => {
    expect(steamMemos).toContain(
      "const ueSteamKpisAbsent = windowedUeSteamAnalyses.length === 0"
    );
    expect(steamMemos).not.toMatch(/for \(const row of ueSteamAnalyses\)/);
    expect(steam).toContain(
      "Sum of displayed trap waste in the selected {timeRange}"
    );
  });

  it("renders N/A for an absent window and distinguishes stored-but-empty", () => {
    expect(steam).toContain("ueSteamKpisAbsent");
    expect(steam).toContain('"N/A"');
    expect(steam).toContain("No stored ultrasound steam-trap scans");
    expect(steam).toContain("No steam-trap scans in the selected ${timeRange} window.");
  });
});

describe("SLICE-AD work-order button is wired to the real draft path", () => {
  it("stages a trap-context prefill and navigates to the calendar", () => {
    expect(steam).toContain("stageWorkOrderPrefill");
    expect(steam).toContain('navigateToTab("calendar")');
    expect(steam).toContain('modality: "ultrasound"');
    expect(steam).toContain("Trap status:");
    expect(steam).toContain("Stored per-scan ΔT:");
    expect(steam).not.toContain("new Blob");
    expect(steam).not.toContain("work-order-${row.trapId}");
  });

  it("carries the trap modality and context into the drafted work order", () => {
    const prefill = buildWorkOrderPrefill({
      assetTag: "P-101A",
      zone: null,
      action: "Immediate Isolate & Inspect - Freeze/Blockage Hazard",
      component: "ST-12 (Thermodynamic)",
      sourceLabel: "Ultrasound Steam Trap Analyzer",
      modality: "ultrasound",
      modalityLabel: "Ultrasound / Steam Trap",
      trackedMetric: "Peak acoustic level",
      unit: "dBµV",
      contextLines: ["Trap status: Cold / Blocked."]
    });
    expect(prefill.modality).toBe("ultrasound");
    expect(prefill.modalityLabel).toBe("Ultrasound / Steam Trap");
    expect(prefill.trackedMetric).toBe("Peak acoustic level");
    expect(prefill.unit).toBe("dBµV");
    expect(prefill.description).toContain(
      "Work order prefill from Ultrasound Steam Trap Analyzer"
    );
    expect(prefill.description).toContain("Trap status: Cold / Blocked.");
  });
});

describe("SLICE-AD queued electrical-safety copy audit", () => {
  it("removes the dB-scanned ultrasound PPE category claim", () => {
    const start = reportSrc.indexOf("const US_ARCING_STEPS = [");
    const end = reportSrc.indexOf("];", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const arcing = reportSrc.slice(start, end);
    expect(arcing).not.toMatch(/NFPA\s*70E/i);
    expect(arcing).not.toMatch(/Category\s*[24]/i);
    expect(reportSrc).not.toContain(
      "NFPA 70E Category 2 / 4 Arc Flash Suit before opening energized enclosures"
    );
    expect(reportSrc).not.toMatch(/Category\s*2\s*\/\s*4/);
    expect(reportSrc).not.toMatch(/Arc Flash Suit/);
    expect(reportSrc).not.toMatch(/PPE Level \d/);
    expect(reportSrc).toContain(
      "Follow the site arc-flash risk assessment to select PPE"
    );
  });

  it("keeps static dictionary safety guidance generic (not dB-derived)", () => {
    const start = dictSrc.indexOf("const ELEC_SAFETY");
    const end = dictSrc.indexOf(";", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const elec = dictSrc.slice(start, end);
    expect(elec).not.toMatch(/dB/i);
    expect(elec).not.toMatch(/peak/i);
    expect(elec).toContain("Apply grounds per NFPA 70E");
  });
});
