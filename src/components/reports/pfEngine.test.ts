import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MIN_POINTS,
  MIN_SPAN_DAYS,
  MAX_WINDOW_DAYS,
  componentExclusionVerdict,
  dayLabel,
  derivePf,
  significanceGatePass,
  type Fit,
  type RawPoint,
  type SeriesCandidate,
  type Threshold,
} from "./pfEngine";

const day = (i: number, step = 10): string =>
  new Date(Date.UTC(2026, 0, 1 + i * step)).toISOString();

const rising = (n: number, step = 10): RawPoint[] =>
  Array.from({ length: n }, (_, i) => ({ value: 1 + i * 0.3, date: day(i, step) }));

const falling = (n: number, step = 10): RawPoint[] =>
  Array.from({ length: n }, (_, i) => ({ value: 5 - i * 0.4, date: day(i, step) }));

const noisyFlat = (): RawPoint[] =>
  [5, 5.3, 4.8, 5.2, 4.9, 5.1, 4.7, 5.0].map((value, i) => ({ value, date: day(i) }));

const candidate = (
  points: RawPoint[],
  worsening: "increase" | "decrease" = "increase",
): SeriesCandidate => ({
  id: "test-series",
  label: "test series",
  unit: "mm/s",
  points,
  severityRank: 1,
  worsening,
});

const thr = (value: number): Threshold => ({ value, provenance: "test threshold" });

type FWindowState = { lower: number; upper: number; median: number };

const fitOf = (slope: number, seOfSlope: number): Fit => ({
  slope,
  intercept: 0,
  stdErr: 0,
  seOfSlope,
});

describe("calibrated gate constants", () => {
  it("keeps the recalibrated thresholds", () => {
    expect(MIN_POINTS).toBe(4);
    expect(MIN_SPAN_DAYS).toBe(7);
  });
});

describe("five verdict kinds", () => {
  it("window: significant rise with threshold ahead yields a future F window", () => {
    const d = derivePf({
      candidates: [candidate(rising(8))],
      overrideId: null,
      threshold: thr(30),
      storedDetection: null,
    });
    expect(d.verdict).toBe("window");
    expect(d.fWindow).not.toBeNull();
    expect(d.fWindow!.median).toBeGreaterThan(0);
    expect(d.fWindow!.upper).toBeGreaterThan(0);
    expect(Number.isFinite(d.fWindow!.upper)).toBe(true);
  });

  it("stable: noisy flat series fails the significance gate", () => {
    const d = derivePf({
      candidates: [candidate(noisyFlat())],
      overrideId: null,
      threshold: thr(7.1),
      storedDetection: null,
    });
    expect(d.verdict).toBe("stable");
    expect(d.significancePass).toBe(false);
    expect(d.fWindow).toBeNull();
  });

  it("improving: significant slope in the healthy direction", () => {
    const d = derivePf({
      candidates: [candidate(falling(8))],
      overrideId: null,
      threshold: thr(7.1),
      storedDetection: null,
    });
    expect(d.verdict).toBe("improving");
    expect(d.slopeGatePass).toBe(false);
    expect(d.fWindow).toBeNull();
  });

  it("thin: fewer than MIN_POINTS points confess insufficient history", () => {
    const d = derivePf({
      candidates: [candidate(rising(3))],
      overrideId: null,
      threshold: thr(30),
      storedDetection: null,
    });
    expect(d.verdict).toBe("thin");
    expect(d.g9Pass).toBe(false);
  });

  it("thin: span below MIN_SPAN_DAYS also confesses", () => {
    const d = derivePf({
      candidates: [candidate(rising(5, 1))],
      overrideId: null,
      threshold: thr(30),
      storedDetection: null,
    });
    expect(d.verdict).toBe("thin");
    expect(d.spanDays).toBeLessThan(MIN_SPAN_DAYS);
  });

  it("no-threshold: significant rise without a functional limit stays slope-only", () => {
    const d = derivePf({
      candidates: [candidate(rising(8))],
      overrideId: null,
      threshold: null,
      storedDetection: null,
    });
    expect(d.verdict).toBe("no-threshold");
    expect(d.fWindow).toBeNull();
    expect(d.rulLabel).toBeNull();
  });
});

describe("SE = 0 significance guard", () => {
  it("flat perfect fit (SE = 0, slope = 0) does not pass", () => {
    expect(significanceGatePass(fitOf(0, 0))).toBe(false);
  });

  it("non-flat perfect fit (SE = 0, slope != 0) passes on its own slope", () => {
    expect(significanceGatePass(fitOf(1, 0))).toBe(true);
  });

  it("noisy fit still requires |slope| >= 2 x SE", () => {
    expect(significanceGatePass(fitOf(0.01, 0.01))).toBe(false);
    expect(significanceGatePass(fitOf(0.03, 0.01))).toBe(true);
    expect(significanceGatePass(null)).toBe(false);
  });
});

describe("already-crossed F window", () => {
  const d = derivePf({
    candidates: [candidate(rising(8))],
    overrideId: null,
    threshold: thr(1),
    storedDetection: null,
  });

  it("crossed threshold keeps a finite negative upper bound, not an em-dash sentinel", () => {
    expect(d.verdict).toBe("window");
    expect(d.fWindow).not.toBeNull();
    expect(d.fWindow!.median).toBeLessThan(0);
    expect(d.fWindow!.lower).toBeLessThan(0);
    expect(d.fWindow!.upper).toBeLessThan(0);
    expect(Number.isFinite(d.fWindow!.upper)).toBe(true);
  });

  it("bounds and RUL render the crossed phrasing instead of —", () => {
    expect(dayLabel(d.fWindow!.lower)).toBe("already crossed");
    expect(dayLabel(d.fWindow!.upper)).toBe("already crossed");
    expect(d.rulLabel).toBe("already crossed");
    expect(Math.abs(Math.round(d.fWindow!.median))).toBe(70);
  });

  it("future wording path is untouched (positive median, finite dayLabel)", () => {
    const future = derivePf({
      candidates: [candidate(rising(8))],
      overrideId: null,
      threshold: thr(8),
      storedDetection: null,
    });
    expect(future.fWindow!.median).toBeGreaterThan(0);
    expect(dayLabel(future.fWindow!.median)).toMatch(/^\d+ days$/);
  });
});

const countOccurrences = (s: string, sub: string): number => s.split(sub).length - 1;

const TAB_FILES = [
  "VibrationPrognosticsTab.tsx",
  "InfraredPrognosticsTab.tsx",
  "UltrasoundPrognosticsTab.tsx",
  "OilPrognosticsTab.tsx",
  "McaPrognosticsTab.tsx",
];

function fWindowText(tab: string, fWindow: FWindowState, thr: Threshold): string {
  const src = readFileSync(fileURLToPath(new URL(`./${tab}`, import.meta.url)), "utf8");
  const anchor = "const fWindowTxt = ";
  const at = src.indexOf(anchor);
  expect(at).toBeGreaterThan(-1);
  const rhs = src.slice(at + anchor.length).split(": null;")[0] + ": null";
  const fn = new Function(
    "fWindow",
    "thr",
    "dayLabel",
    "MAX_WINDOW_DAYS",
    `return (${rhs});`,
  ) as unknown as (w: FWindowState, t: Threshold, d: typeof dayLabel, m: number) => string | null;
  const out = fn(fWindow, thr, dayLabel, MAX_WINDOW_DAYS);
  expect(out).not.toBeNull();
  return out as string;
}

describe("crossed line composition (one verdict per sentence)", () => {
  const thr8: Threshold = { value: 8, provenance: "fixture threshold" };
  const thr1: Threshold = { value: 1, provenance: "fixture threshold" };

  const derive = (threshold: Threshold) =>
    derivePf({
      candidates: [candidate(rising(8))],
      overrideId: null,
      threshold,
      storedDetection: null,
    }).fWindow!;

  const entirePast = derive(thr1);
  const future = derive(thr8);
  const hybridPast: FWindowState = { lower: -18, upper: 12, median: -5 };

  const ENTIRE_PAST_TXT = "F window: already crossed (median ~70 days ago, upper ~70 days ago)";
  const HYBRID_TXT = "F window: median already crossed (~5 days ago) - upper bound in ~12 days";
  const FUTURE_TXT = "F window: 163 days–163 days from today, median 163 days";

  it("fixture states are what the templates are keyed on", () => {
    expect(entirePast.median).toBeLessThan(0);
    expect(entirePast.upper).toBeLessThan(0);
    expect(hybridPast.median).toBeLessThan(0);
    expect(hybridPast.upper).toBeGreaterThan(0);
    expect(future.median).toBeGreaterThanOrEqual(0);
  });

  for (const tab of TAB_FILES) {
    it(`${tab}: entire-window-past state matches template, verdict said once`, () => {
      const s = fWindowText(tab, entirePast, thr1);
      expect(s).toBe(ENTIRE_PAST_TXT);
      expect(countOccurrences(s, "already crossed")).toBe(1);
    });

    it(`${tab}: median-past/upper-future state matches template, verdict said once`, () => {
      const s = fWindowText(tab, hybridPast, thr1);
      expect(s).toBe(HYBRID_TXT);
      expect(countOccurrences(s, "already crossed")).toBe(1);
    });

    it(`${tab}: future-window wording byte-identical, no crossed text`, () => {
      const s = fWindowText(tab, future, thr8);
      expect(s).toBe(FUTURE_TXT);
      expect(countOccurrences(s, "already crossed")).toBe(0);
    });
  }
});

describe("exclusion confession count", () => {
  const rows = [
    { component: "Motor" },
    { component: "Drive End" },
    { component: "Pump" },
  ];

  it("counts dropped rows and names the mismatched sub-components", () => {
    const v = componentExclusionVerdict(rows, "Motor");
    expect(v.count).toBe(2);
    expect(v.components).toEqual(["Drive End", "Pump"]);
  });

  it("no scoped component means no exclusions", () => {
    expect(componentExclusionVerdict(rows, null)).toEqual({ count: 0, components: [] });
  });

  it("all-matching rows report zero exclusions", () => {
    expect(componentExclusionVerdict([{ component: "Motor" }], "Motor").count).toBe(0);
  });

  it("unlabeled rows are confessed, not dropped silently", () => {
    const v = componentExclusionVerdict([{ component: null }], "Motor");
    expect(v.count).toBe(1);
    expect(v.components).toEqual(["unlabeled"]);
  });
});
