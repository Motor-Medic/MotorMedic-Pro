import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  fileURLToPath(new URL("./TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
).replace(/\r\n/g, "\n");

function block(start: string, end: string): string {
  const from = src.indexOf(start);
  const to = src.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return src.slice(from, to);
}

const sharedWindow = block(
  "const windowedVibAnalyses = useMemo",
  "const latestVibrationRow"
);

describe("SLICE-VS1 broadband surfaces share one windowed SSOT", () => {
  it("windows the raw rows exactly once", () => {
    expect((src.match(/filterTrendByTimeRange\(/g) ?? []).length).toBe(1);
    expect(sharedWindow).toContain(
      "filterTrendByTimeRange(vibAnalyses, timeRange)"
    );
  });

  it("applies the running-state filter and deterministic sort to the same array", () => {
    expect(sharedWindow).toContain("applyVibrationRunningStateFilter(");
    expect(sharedWindow).toContain("sortVibrationRowsNewestFirst(");
    expect(sharedWindow).toContain("runningOnly");
    expect(sharedWindow).toContain("[vibAnalyses, timeRange, runningOnly]");
  });

  it("selects the latest row from the shared array, not raw rows or cache", () => {
    expect(src).toContain("const latestVibrationRow = windowedVibAnalyses[0] ?? null;");
    expect(src).not.toContain("readCachedVibrationRecord(");
    expect(src).toContain("latestVibrationRecordFromRows(windowedVibAnalyses)");
  });

  it("keeps waveform snapshot extraction outside the broadband KPI selection", () => {
    expect(src).toContain("latestVibrationRecordFromRows(vibAnalyses)");
    expect(src).toContain("const latestWaveformRecord = useMemo(");
    const velocity = block(
      "const latestOverallVelocity = useMemo",
      "const latestOverallAcceleration = useMemo"
    );
    expect(velocity).not.toContain("latestWaveformRecord");
    expect(src).toContain("Saved diagnostic health score");
  });

  it("derives the KPI overall values from the latest shared row", () => {
    const velocity = block(
      "const latestOverallVelocity = useMemo",
      "const latestOverallAcceleration = useMemo"
    );
    const acceleration = block(
      "const latestOverallAcceleration = useMemo",
      "const latestOverallEmptyNote"
    );
    expect(velocity).toContain("readVibrationOverallVelocity(latestVibrationRow)");
    expect(velocity).toContain("latestVibrationSample?.stopped");
    expect(acceleration).toContain(
      "readVibrationOverallAcceleration(latestVibrationRow)"
    );
    expect(velocity).not.toContain("latestDb");
    expect(velocity).not.toContain("latestVibrationRecord");
  });

  it("derives per-axis cards from the same latest row with no overall fallback", () => {
    const axes = block(
      "const triaxialAxes = useMemo",
      "const hasAnyAnalysisData"
    );
    expect(axes).toContain("readVibrationPerAxis(latestVibrationRow)");
    expect(axes).toContain("latestVibrationSample?.stopped");
    expect(axes).not.toContain("latestPeak");
    expect(axes).not.toContain("latestDb?.peaks");
  });

  it("uses the reconciled verdict for the KPI surfaces", () => {
    expect(src).toContain("reconcileVibrationVerdict(latestVibrationRow");
    expect(src).toContain("healthScore={reconciledVerdict.healthScore}");
    expect(src).toContain("healthProvenance={reconciledVerdict.healthProvenance}");
    expect(src).toContain("verdictState={reconciledVerdict.status}");
    expect(src).toContain("primaryFault={reconciledVerdict.primaryFault}");
    expect(src).toContain("consensusConflict={reconciledVerdict.conflict}");
    expect(src).toContain("data-testid=\"primary-fault-kpi\"");
    expect(src).toContain("data-testid=\"health-score-kpi\"");
  });

  it("charts the full windowed series and labels stopped points when OFF", () => {
    const health = block(
      "const healthTrendSeries = useMemo",
      "const velocityTrendSeries = useMemo"
    );
    const velocity = block(
      "const velocityTrendSeries = useMemo",
      "const healthTrendIsSparse = useMemo"
    );
    expect(health).toContain("[...windowedVibAnalyses]");
    expect(health).toContain("stopped: sample.stopped");
    expect(velocity).toContain("[...windowedVibAnalyses]");
    expect(velocity).toContain("stopped: sample.stopped");
    expect(src).toContain('const stopped = point?.stopped ? " \\u00b7 stopped sample" : "";');
    expect(src).toContain("data-testid=\"health-stopped-series-note\"");
    expect(src).toContain("data-testid=\"velocity-stopped-series-note\"");
  });

  it("states why an empty window is empty", () => {
    expect(src).toContain("data-testid=\"vibration-window-empty-note\"");
    expect(src).toContain("turn off Running State Only to include stopped samples");
  });
});

describe("SLICE-VS1 ISO threshold basis and null vocabulary", () => {
  it("explains default ISO zone bands only when kinematics are unconfigured", () => {
    expect(src).toContain("const kinematicSpecsUnconfigured = Boolean(");
    expect(src).toContain('velocityThresholds.source === "iso" && kinematicSpecsUnconfigured');
    expect(src).toContain("standard zone boundaries, not an OEM or plant limit");
    expect(src).toContain("data-testid=\"iso-default-threshold-basis\"");
    expect(src).toContain("data-testid=\"iso-default-threshold-basis-expanded\"");
  });

  it("reuses the kinematic-specs condition for the amber banner", () => {
    const banner = block("kinematicSpecsUnconfigured ? (", "<KinematicSpecsEmptyState");
    expect(banner).toContain("kinematicSpecsUnconfigured");
    expect(src).not.toContain(
      'machineSpecs.isoClass === "Not set" ||\n            machineSpecs.bearing === "Not set") ? ('
    );
  });

  it("passes the honest empty note into the ISO matrix", () => {
    expect(src).toContain("emptyNote={latestOverallEmptyNote}");
    expect(src).toContain("valueMmS={latestOverallVelocity}");
  });
});

describe("SLICE-VS1 lockstep and isolation guards", () => {
  it("keeps all four chart bodies and the prior prop contract", () => {
    expect((src.match(/<BroadbandTrendChartBody/g) ?? []).length).toBe(4);
    expect(src).toContain("data={healthTrendSeries}");
    expect(src).toContain("isEmpty={healthTrendSeries.length === 0}");
    expect(src).toContain("isSparse={healthTrendIsSparse}");
    expect(src).toContain("data={velocityTrendDisplaySeries}");
    expect(src).toContain("isEmpty={velocityTrendSeries.length === 0}");
    expect(src).toContain("isSparse={velocityTrendIsSparse}");
  });

  it("leaves oil and MCA readers free of the vibration running-state filter", () => {
    const oil = block("const oilAnalyses = useMemo(", "const healthTrendSeries");
    const mca = block(
      "const windowedMcaAnalyses = useMemo",
      "const ricStoredTraces"
    );
    expect(oil).not.toContain("runningOnly");
    expect(mca).not.toContain("runningOnly");
    expect(src).toContain("Running State Only (&gt;80% Load)");
  });

  it("keeps mm/s, g and Hz selectors isolated to their own dimension", () => {
    const velocity = block("value={displayUnits.velocity}", "</select>");
    const acceleration = block(
      "value={displayUnits.acceleration}",
      "</select>"
    );
    const frequency = block("value={displayUnits.frequency}", "</select>");

    expect(velocity).toContain("value={displayUnits.velocity}");
    expect(velocity).toContain("velocity: e.target.value");
    expect(velocity).not.toContain("acceleration:");

    expect(acceleration).toContain("value={displayUnits.acceleration}");
    expect(acceleration).toContain("acceleration: e.target.value");
    expect(acceleration).not.toContain("velocity:");

    expect(frequency).toContain("value={displayUnits.frequency}");
    expect(frequency).toContain("frequency: e.target.value");
    expect(frequency).not.toContain("velocity:");
  });
});
