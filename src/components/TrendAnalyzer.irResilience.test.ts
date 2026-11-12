import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  fileURLToPath(new URL("./TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
);

const trendSeriesSrc = readFileSync(
  fileURLToPath(new URL("../lib/vibration/trendSeries.ts", import.meta.url)),
  "utf8"
);

const thermoSeriesSrc = readFileSync(
  fileURLToPath(new URL("../lib/thermographyTrendSeries.ts", import.meta.url)),
  "utf8"
);

describe("SLICE-U IR trend resilience", () => {
  it("shares slice N's window predicate instead of forking an IR-only filter", () => {
    expect(src).toContain(
      "windowTrendByTimeRange(thermoAnalyses, timeRange)"
    );
    expect(src).toContain(
      "buildThermoChartSeries(windowedThermoAnalyses)"
    );
    // The literal shared call stays exactly once (the vibration window); the IR
    // path reuses it through the delegating wrapper.
    expect((src.match(/filterTrendByTimeRange\(/g) ?? []).length).toBe(1);
    expect(trendSeriesSrc).toContain(
      "return filterTrendByTimeRange(points, range, nowMs);"
    );
  });

  it("uses timestamp granularity for same-date runs and an honest snapshot guard", () => {
    expect(src).toContain("planThermoTrendAxis(thermoChartSeries)");
    expect(src).toContain("dataKey={thermoAxisDataKey}");
    expect(src).toContain(
      'thermoAxisPlan.snapshot ? "transparent"'
    );
    expect(thermoSeriesSrc).toContain("SAME_DATE_SNAPSHOT_SPAN_MS");
    expect(thermoSeriesSrc).toContain('sameDate ? "dateLabel" : "date"');
    expect(thermoSeriesSrc).toContain("dateLabel");
  });

  it("reuses J2's sparse helper constant instead of a second empty-state string", () => {
    expect(src).toContain("SPARSE_TREND_HELPER_TEXT");
    expect(src).not.toContain(
      "Additional historical readings required to plot trend slope"
    );
    expect(thermoSeriesSrc).not.toContain(
      "Additional historical readings required to plot trend slope"
    );
  });

  it("removes the °C / °F slash hedge and shows one selected unit", () => {
    expect(src).not.toContain("°C / °F");
    expect(src).toContain("thermoTempAxisLabel");
    expect(src).toMatch(
      /resolveTemperatureDisplayUnit\(\s*displayUnits\.temperature,\s*thermoStoredUnit\s*\)/
    );
    // Default must defer to the stored unit, never a hardcoded °C.
    expect(src).toContain("resolveThermoTempUnit(thermoChartSeries)");
    expect(src).toContain("convertAbsoluteTemperature");
    expect(src).toContain("convertTemperatureDelta");
    expect(src).toContain("TEMPERATURE_DISPLAY_OPTIONS");
    expect(src).toContain('aria-label="Temperature display unit"');
    // KPI, table header and narrative subtitles all consume the same unit.
    expect(src).toContain("Hotspot ({thermoDisplayUnit})");
    expect(src).toContain("ΔT ({thermoDisplayUnit})");
    expect(src).toContain("Left: ${thermoTempAxisLabel}");
    expect(src).toContain("${latestThermoChart.hotspot}${thermoDisplayUnit}");
    expect(src).not.toContain("${latestThermoChart.hotspot}°");
  });

  it("routes every IR chart and KPI through the display-unit projection", () => {
    expect((src.match(/data=\{thermoDisplaySeries\}/g) ?? []).length).toBe(4);
    expect(src).toContain("latestThermoChart");
    expect(src).toContain("thermoDisplaySeries[thermoDisplaySeries.length - 1]");
  });
});
