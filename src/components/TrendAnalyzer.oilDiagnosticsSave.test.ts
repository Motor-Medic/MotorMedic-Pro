import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8").replace(
    /\r\n/g,
    "\n"
  );

const diagnose = read("./Diagnose.tsx");
const oilInput = read("./OilInputAccordions.tsx");
const wearMetals = read("./trendAnalyzer/OilWearMetalsTab.tsx");
const trend = read("./TrendAnalyzer.tsx");

describe("SLICE-AJ oil Run Diagnostics → Trend Analyzer Oil tab link", () => {
  it("Run Diagnostics persists an oil run to the oil SSOT", () => {
    expect(diagnose).toContain('if (activeTech === "oil")');
    expect(diagnose).toContain("hasOilLabData(oilLabSnapshot)");
    expect(diagnose).toContain("buildOilSampleSavePayload(");
    expect(diagnose).toContain("fetch(OIL_ANALYSIS_API_PATH");
    expect(diagnose).toContain("onSnapshotChange={setOilLabSnapshot}");
  });

  it("the oil intake form emits a measurable snapshot to the host", () => {
    expect(oilInput).toContain(
      "onSnapshotChange?: (snapshot: OilLabSnapshot) => void;"
    );
    expect(oilInput).toContain("const labSnapshot = useMemo<OilLabSnapshot>");
    expect(oilInput).toContain("onSnapshotChange?.(labSnapshot)");
  });

  it("the Oil tab Wear Metals reader consumes the same oil SSOT", () => {
    expect(wearMetals).toContain(
      'import { fetchOilSamples } from "../../lib/oilSampleRow";'
    );
    expect(wearMetals).toContain("setSamples(await fetchOilSamples(assetId))");
  });

  it("the running-state toggle cannot hide null-load oil lab samples", () => {
    const oilAnalysesBlock = trend.slice(
      trend.indexOf("const oilAnalyses = useMemo("),
      trend.indexOf("const healthTrendSeries")
    );
    expect(oilAnalysesBlock).not.toContain("runningOnly");
    expect(wearMetals).not.toContain("runningOnly");
  });

  it("vibration running-state gating is unchanged", () => {
    expect(trend).toContain(
      'const vibAnalyses = useMemo(\n    () => dbAnalyses.filter((r) => resolveAnalysisType(r) === "vibration"),'
    );
    expect(trend).toContain("Running State Only (&gt;80% Load)");
  });
});
