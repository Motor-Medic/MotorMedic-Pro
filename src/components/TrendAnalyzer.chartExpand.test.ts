import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  filterTrendByTimeRange,
  isSparseTrendSeries
} from "../lib/vibration/trendSeries";

const src = readFileSync(
  fileURLToPath(new URL("./TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
);

const waveformSrc = readFileSync(
  fileURLToPath(new URL("./trendAnalyzer/WaveformTab.tsx", import.meta.url)),
  "utf8"
);

function componentCalls(component: string): string[] {
  return [
    ...src.matchAll(new RegExp(`<${component}[\\s\\S]*?/>`, "g"))
  ].map((match) => match[0]);
}

function block(start: string, end: string): string {
  const from = src.indexOf(start);
  const to = src.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return src.slice(from, to);
}

function bodyCalls(): string[] {
  return [...src.matchAll(/<BroadbandTrendChartBody[\s\S]*?\/>/g)].map(
    (match) => match[0]
  );
}

describe("SLICE-O enlarged Trend Analyzer charts", () => {
  it("routes inline and enlarged charts through one shared body with identical props", () => {
    const calls = bodyCalls();
    expect(calls).toHaveLength(4);

    const health = calls.filter((call) => call.includes('variant="health"'));
    expect(health).toHaveLength(2);
    for (const call of health) {
      expect(call).toContain("data={healthTrendSeries}");
      expect(call).toContain("isEmpty={healthTrendSeries.length === 0}");
      expect(call).toContain("isSparse={healthTrendIsSparse}");
      expect(call).toContain("velocityUnit={displayUnits.velocity}");
      expect(call).toContain("thresholds={velocityThresholds}");
      expect(call).toContain("showThresholds={showThresholds}");
    }

    const velocity = calls.filter((call) => call.includes('variant="velocity"'));
    expect(velocity).toHaveLength(2);
    for (const call of velocity) {
      expect(call).toContain("data={velocityTrendDisplaySeries}");
      expect(call).toContain("isEmpty={velocityTrendSeries.length === 0}");
      expect(call).toContain("isSparse={velocityTrendIsSparse}");
      expect(call).toContain("velocityUnit={displayUnits.velocity}");
      expect(call).toContain("thresholds={velocityThresholds}");
      expect(call).toContain("showThresholds={showThresholds}");
    }
  });

  it("renders the same threshold lines and display units in both sizes", () => {
    const body = block(
      "function BroadbandTrendChartBody",
      "function TrendChartExpandModal"
    );
    expect(body).toContain("thresholds.alertDisplay");
    expect(body).toContain("thresholds.dangerDisplay");
    expect(body).toContain("thresholds.alertLabel");
    expect(body).toContain("thresholds.dangerLabel");
    expect(body).toContain("`Peak amp (${velocityUnit})`");
    expect(body).toContain("`${value} ${velocityUnit} (peak)`");
    expect(body).toContain("allowEscapeViewBox={{ x: true, y: true }}");
    expect(body).not.toContain("resolveVelocityThresholds(");
    expect(body).not.toContain("VIB_SPECTRAL");
  });

  it("keeps the empty and sparse guards in the enlarged view", () => {
    const body = block(
      "function BroadbandTrendChartBody",
      "function TrendChartExpandModal"
    );
    expect(body).toContain("if (isEmpty)");
    expect(body).toContain("if (isSparse)");
    expect(body).toContain("No analysis data yet - run a diagnostic to populate trends");
    expect(body).toContain("No velocity readings yet");
    expect(body).toContain("SPARSE_TREND_HELPER_TEXT");
  });

  it("a 7D range over old data is empty/sparse in the enlarged data path", () => {
    const now = Date.parse("2026-10-30T12:00:00.000Z");
    const oldData = [
      { timestamp: "2026-01-01T00:00:00.000Z" },
      { timestamp: "2026-02-01T00:00:00.000Z" }
    ];
    const windowed = filterTrendByTimeRange(oldData, "7D", now);
    expect(windowed).toEqual([]);
    expect(isSparseTrendSeries(windowed)).toBe(false);

    const oneInWindow = filterTrendByTimeRange(
      [
        { timestamp: "2026-02-01T00:00:00.000Z" },
        { timestamp: "2026-10-29T00:00:00.000Z" }
      ],
      "7D",
      now
    );
    expect(oneInWindow).toHaveLength(1);
    expect(isSparseTrendSeries(oneInWindow)).toBe(true);
  });

  it("closes via Esc, backdrop and button, locks scroll and traps focus", () => {
    const modal = block(
      "function TrendChartExpandModal",
      "function ChartExpandButton"
    );
    expect(modal).toContain("createPortal(");
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('event.key === "Escape"');
    expect(modal).toContain('event.key !== "Tab"');
    expect(modal).toContain('document.body.style.overflow = "hidden"');
    expect(modal).toContain("document.body.style.overflow = previousOverflow");
    expect(modal).toContain("previouslyFocused?.focus()");
    expect(modal).toContain("first.focus()");
    expect(modal).toContain("last.focus()");
    expect(modal).toContain('aria-label="Close enlarged chart"');
    expect(modal).toContain("onClick={onClose}");
    expect(modal).toContain("min-h-[450px]");
    expect(modal).toContain('height: "min(70vh, 560px)"');
  });

  it("exposes an icon-only expand affordance outside the chart hit area", () => {
    const healthCard = block("{/* Chart 1", "{/* Chart 2");
    expect(healthCard).toContain('label="Expand Health Score Trend"');
    expect(healthCard.indexOf("ChartExpandButton")).toBeLessThan(
      healthCard.indexOf('className="h-64')
    );

    const velocityCard = block("{/* Chart 2", "{/* ISO 20816");
    expect(velocityCard).toContain('label="Expand Peak Velocity"');
    expect(velocityCard.indexOf("ChartExpandButton")).toBeLessThan(
      velocityCard.indexOf('className="h-64')
    );

    const body = block(
      "function BroadbandTrendChartBody",
      "function TrendChartExpandModal"
    );
    expect(body).not.toContain("onClick");
    expect(velocityCard).not.toContain("onClick={handlePointClick}");
    expect(velocityCard).not.toContain("<LineChart onClick");
  });
});

describe("SLICE-Q every series chart enlarges through the same bodies", () => {
  it("routes spectral and enveloping inline/modal pairs through identical props", () => {
    for (const component of [
      "SpectralTrendChartBody",
      "EnvelopingGeChartBody",
      "EnvelopingKurtosisChartBody"
    ]) {
      const calls = componentCalls(component);
      expect(calls).toHaveLength(2);
      expect(calls[0].replace(/\s+/g, " ")).toBe(
        calls[1].replace(/\s+/g, " ")
      );
    }

    const spectral = componentCalls("SpectralTrendChartBody")[0];
    expect(spectral).toContain("data={spectralTrendDisplayData}");
    expect(spectral).toContain("windowEmpty={spectralWindowEmpty}");
    expect(spectral).toContain("isSparse={spectralTrendIsSparse}");
    expect(spectral).toContain("ordersUnavailable={spectralOrdersUnavailable}");
    expect(spectral).toContain("velocityUnit={displayUnits.velocity}");
    expect(spectral).toContain("timeRange={timeRange}");

    const ge = componentCalls("EnvelopingGeChartBody")[0];
    expect(ge).toContain("data={envelopingGeChartData}");
    expect(ge).toContain("baselinePeakGe={envelopeBaseline?.peakGe ?? null}");

    const kurt = componentCalls("EnvelopingKurtosisChartBody")[0];
    expect(kurt).toContain("data={envelopingKurtosisChartData}");
    expect(kurt).toContain(
      "baselineKurtosis={envelopeBaseline?.kurtosis ?? null}"
    );
  });

  it("keeps the threshold/guard/unit logic inside the shared bodies", () => {
    for (const component of [
      "SpectralTrendChartBody",
      "EnvelopingGeChartBody",
      "EnvelopingKurtosisChartBody"
    ]) {
      const body = block(`function ${component}`, "\n/**");
      expect(body).toContain('allowEscapeViewBox={{ x: true, y: true }}');
    }

    const spectral = block(
      "function SpectralTrendChartBody",
      "type EnvelopingGeChartPoint"
    );
    expect(spectral).toContain("No spectral readings in the selected {timeRange} window.");
    expect(spectral).toContain("SPARSE_TREND_HELPER_TEXT");
    expect(spectral).toContain("spectralAmplitudeAxisLabel(velocityUnit)");
    expect(spectral).toContain("${value} ${velocityUnit}");
    expect(spectral).not.toContain("buildSpectralHarmonicTrend(");

    const ge = block(
      "function EnvelopingGeChartBody",
      "function EnvelopingKurtosisChartBody"
    );
    expect(ge).toContain("baselinePeakGe");
    expect(ge).toContain("No recorded g<sub>E</sub> values");
    expect(ge).not.toContain("filterTrendByTimeRange(");

    const kurt = block(
      "function EnvelopingKurtosisChartBody",
      "function TrendChartExpandModal"
    );
    expect(kurt).toContain("baselineKurtosis");
    expect(kurt).toContain("No kurtosis / crest factor recorded");
    expect(kurt).not.toContain("filterTrendByTimeRange(");
  });

  it("keeps the generalized modal a11y + tooltip-safe shell", () => {
    const modal = block(
      "function TrendChartExpandModal",
      "function ChartExpandButton"
    );
    expect(modal).toContain("createPortal(");
    expect(modal).toContain('event.key === "Escape"');
    expect(modal).toContain("document.body.style.overflow = previousOverflow");
    expect(modal).toContain("previouslyFocused?.focus()");
    expect(modal).toContain("min-h-[450px]");
    expect(modal).toContain("overflow-visible");
    expect(modal).toContain('height: "min(70vh, 560px)"');
  });

  it("exposes one distinct icon-only aria-label per targeted series chart", () => {
    const labels = [
      "Expand Health Score Trend",
      "Expand Peak Velocity",
      "Enlarge Spectral & Harmonics chart",
      "Enlarge Peak gE Trend chart",
      "Enlarge Kurtosis Trend chart"
    ];
    for (const label of labels) {
      expect(src).toContain(`label="${label}"`);
    }
    for (const label of [
      "Enlarge Time Waveform chart",
      "Enlarge Crest Factor Trend chart",
      "Enlarge Impact Count Trend chart"
    ]) {
      expect(waveformSrc).toContain(label);
    }

    expect((src.match(/<ChartExpandButton/g) ?? []).length).toBe(6);
    expect((waveformSrc.match(/<ChartExpandButton/g) ?? []).length).toBe(0);
  });

  it("keeps new icons outside the chart hit areas", () => {
    const spectralIcon = src.indexOf(
      'label="Enlarge Spectral & Harmonics chart"'
    );
    expect(spectralIcon).toBeGreaterThanOrEqual(0);
    expect(src.indexOf('className="h-[420px]', spectralIcon)).toBeGreaterThan(
      spectralIcon
    );

    const geIcon = src.indexOf('label="Enlarge Peak gE Trend chart"');
    expect(geIcon).toBeGreaterThanOrEqual(0);
    expect(src.indexOf('className="h-56', geIcon)).toBeGreaterThan(geIcon);

    const kurtIcon = src.indexOf('label="Enlarge Kurtosis Trend chart"');
    expect(kurtIcon).toBeGreaterThanOrEqual(0);
    expect(src.indexOf('className="h-56', kurtIcon)).toBeGreaterThan(kurtIcon);

    const timeIcon = waveformSrc.indexOf('"Enlarge Time Waveform chart"');
    expect(timeIcon).toBeGreaterThanOrEqual(0);
    expect(
      waveformSrc.indexOf("<WaveformTimeChartBody", timeIcon)
    ).toBeGreaterThan(timeIcon);

    const crestIcon = waveformSrc.indexOf(
      '"Enlarge Crest Factor Trend chart"'
    );
    expect(crestIcon).toBeGreaterThanOrEqual(0);
    expect(
      waveformSrc.indexOf("<CrestFactorTrendChartBody", crestIcon)
    ).toBeGreaterThan(crestIcon);

    const impactIcon = waveformSrc.indexOf(
      '"Enlarge Impact Count Trend chart"'
    );
    expect(impactIcon).toBeGreaterThanOrEqual(0);
    expect(
      waveformSrc.indexOf("<ImpactCountTrendChartBody", impactIcon)
    ).toBeGreaterThan(impactIcon);
  });

  it("keeps excluded non-series surfaces icon-free", () => {
    const rul = block(
      "{/* ===== SECTION 4: RUL PROJECTION ===== */}",
      '{vibMode === "enveloping"'
    );
    expect(rul).not.toContain("ChartExpandButton");

    const bearingBands = block(
      "Measured Bearing Band Amplitudes",
      "Enveloping History"
    );
    expect(bearingBands).not.toContain("ChartExpandButton");

    const historyTable = block(
      "{/* History table with Set as Baseline */}",
      '{vibMode === "waveform"'
    );
    expect(historyTable).not.toContain("ChartExpandButton");

    const triaxial = block(
      "{/* Triaxial Severity Breakdown */}",
      '{vibMode === "spectral"'
    );
    expect(triaxial).not.toContain("ChartExpandButton");

    const severitySrc = readFileSync(
      fileURLToPath(
        new URL("./trendAnalyzer/VibrationSeverityPanels.tsx", import.meta.url)
      ),
      "utf8"
    );
    expect(severitySrc).not.toContain("ChartExpandButton");

    const fftSrc = readFileSync(
      fileURLToPath(
        new URL("./SpectralFftWorkspace.tsx", import.meta.url)
      ),
      "utf8"
    );
    expect(fftSrc).not.toContain("ChartExpandButton");
  });

  it("re-windows the waveform trend charts through the shared predicate", () => {
    const waveform = block(
      "const waveformTrendSeries = useMemo",
      "const latestWaveformAnalysisMetrics = useMemo"
    );
    expect(waveform).toContain("[...windowedVibAnalyses].reverse()");
    expect(waveform).not.toContain("[...vibAnalyses].reverse()");
    expect((src.match(/filterTrendByTimeRange\(/g) ?? []).length).toBe(1);
    expect(src).toContain("trendPoints={waveformTrendSeries}");
  });

  it("feeds inline and enlarged waveform cards from one model", () => {
    expect(src).toContain("buildWaveformChartModel({");
    expect(src).toContain("model={waveformChartModel}");
    expect(src).toContain(
      "data={waveformChartModel.waveformChartData}"
    );
    expect(src).toContain("data={waveformChartModel.crestTrend}");
    expect(src).toContain("data={waveformChartModel.impactTrend}");

    expect(waveformSrc).toContain("data={crestTrend}");
    expect(waveformSrc).toContain("data={impactTrend}");
    expect(waveformSrc).toContain("data={waveformChartData}");
  });

  it("regression-locks tab 1 labels, triggers and modal body props", () => {
    expect(src).toContain('label="Expand Health Score Trend"');
    expect(src).toContain('label="Expand Peak Velocity"');
    expect(src).toContain('onClick={() => setExpandedChart("health")}');
    expect(src).toContain('onClick={() => setExpandedChart("velocity")}');
    const bodies = bodyCalls();
    expect(bodies).toHaveLength(4);
  });
});

describe("SLICE-P phantom Spectrum A/B affordance", () => {
  it("removes the header promise and its dead handler, state and comparison containers", () => {
    expect(src).not.toContain(
      "Click any data point to set as Spectrum A or B"
    );
    expect(src).not.toContain("next: Spectrum");
    expect(src).not.toContain("handlePointClick");
    expect(src).not.toContain("selectedPointA");
    expect(src).not.toContain("selectedPointB");
    expect(src).not.toContain("nextPick");
    expect(src).not.toContain("spectrumView");
    expect(src).not.toContain("spectrumALabel");
    expect(src).not.toContain("spectrumBLabel");
    expect(src).not.toContain("fftADisplay");
    expect(src).not.toContain("fftBDisplay");
    expect(src).not.toContain("fftOverlayDisplay");
    expect(src).not.toContain("DOMINANT_FREQ_ROWS");
    expect(src).not.toContain("HISTORICAL & SPECTRUM COMPARISON");
  });
});
