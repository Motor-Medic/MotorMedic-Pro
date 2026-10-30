import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  fileURLToPath(new URL("./TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
);

describe("SLICE-L Enveloping History containment + shared window", () => {
  it("uses exactly one chart/table window predicate (no fork)", () => {
    expect(
      src.includes(
        "filterTrendByTimeRange(envelopingTrendSeries, timeRange)"
      )
    ).toBe(true);
    expect((src.match(/filterTrendByTimeRange\(/g) ?? []).length).toBe(1);
  });

  it("feeds both enveloping charts and the table from the shared window", () => {
    const geChart = src.slice(
      src.indexOf("const envelopingGeChartData = useMemo"),
      src.indexOf("const envelopingKurtosisChartData = useMemo")
    );
    const kurtosisChart = src.slice(
      src.indexOf("const envelopingKurtosisChartData = useMemo"),
      src.indexOf("const calculatedBearingFaults = useMemo")
    );
    expect(geChart.includes("envelopingTrendWindow")).toBe(true);
    expect(kurtosisChart.includes("envelopingTrendWindow")).toBe(true);
    expect(src.includes("[...envelopingTrendWindow].reverse()")).toBe(true);
    expect(src.includes("[...envelopingTrendSeries].reverse()")).toBe(false);
  });

  it("shows an honest empty state for a zero-row range", () => {
    expect(
      src.includes("No enveloping history in the selected {timeRange} window.")
    ).toBe(true);
    expect(src.includes("envelopingTrendWindow.length === 0")).toBe(true);
  });

  it("contains the table in a fixed scroll card with a sticky header", () => {
    expect(src.includes("max-h-[420px]")).toBe(true);
    expect(src.includes("overflow-y-auto")).toBe(true);
    expect(src.includes('thead className="sticky top-0 z-10"')).toBe(true);
    expect(src.includes("Set as Baseline")).toBe(true);
  });

  it("listens for component-spec cache invalidation and re-reads kinematics", () => {
    expect(src.includes("subscribeEquipmentStoreChanged")).toBe(true);
    expect(src.includes("setEquipTick((n) => n + 1)")).toBe(true);
  });
});
