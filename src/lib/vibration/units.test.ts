import { describe, expect, it } from "vitest";
import {
  CANONICAL_DISPLAY_UNITS,
  CANONICAL_VELOCITY_UNIT,
  ORDERS_FALLBACK_HINT,
  STANDARD_GRAVITY_MM_S2,
  cpmToHz,
  formatAccelerationDisplay,
  formatVelocityDisplay,
  formatVelocityMmS,
  frequencyDisplayValue,
  frequencyValueForDisplay,
  gToMmPerSecondSquared,
  hzToCpm,
  hzToOrders,
  inchPerSecondToMmPerSecond,
  MM_PER_INCH,
  mmPerSecondSquaredToG,
  mmPerSecondToInchPerSecond,
  normalizeDisplayUnits,
  ordersToHz,
  resolveFrequencyDisplayUnit,
  roundTo
} from "./units";

describe("vibration unit conversion", () => {
  it("converts in/s to mm/s using 25.4", () => {
    expect(MM_PER_INCH).toBe(25.4);
    expect(inchPerSecondToMmPerSecond(1)).toBeCloseTo(25.4, 10);
    expect(inchPerSecondToMmPerSecond(0.1)).toBeCloseTo(2.54, 10);
  });

  it("converts mm/s to in/s using 25.4", () => {
    expect(mmPerSecondToInchPerSecond(25.4)).toBeCloseTo(1, 10);
    expect(mmPerSecondToInchPerSecond(2.54)).toBeCloseTo(0.1, 10);
  });

  it("round-trips in both directions", () => {
    for (const value of [0, 0.07, 0.18, 0.36, 2.3, 4.5, 7.1, 11.2]) {
      expect(
        mmPerSecondToInchPerSecond(inchPerSecondToMmPerSecond(value))
      ).toBeCloseTo(value, 10);
    }
  });

  it("rounds display values and always attaches the canonical unit", () => {
    expect(roundTo(2.345, 2)).toBe(2.35);
    expect(roundTo(2.344, 2)).toBe(2.34);
    expect(formatVelocityMmS(2.3)).toBe("2.30 mm/s RMS");
    expect(formatVelocityMmS(7.123, 1)).toBe("7.1 mm/s RMS");
    expect(CANONICAL_VELOCITY_UNIT).toBe("mm/s RMS");
  });
});

describe("SLICE-H2 acceleration conversion", () => {
  it("converts g to mm/s2 using 9.80665 and back", () => {
    expect(STANDARD_GRAVITY_MM_S2).toBe(9.80665);
    expect(gToMmPerSecondSquared(1)).toBeCloseTo(9.80665, 10);
    expect(mmPerSecondSquaredToG(9.80665)).toBeCloseTo(1, 10);
    expect(mmPerSecondSquaredToG(gToMmPerSecondSquared(0.5))).toBeCloseTo(
      0.5,
      10
    );
  });

  it("formats acceleration with the selected display unit", () => {
    expect(formatAccelerationDisplay(0.5, "g")).toBe("0.500 g");
    expect(formatAccelerationDisplay(1, "mm/s2")).toBe("9.81 mm/s2");
  });
});

describe("SLICE-H2 frequency and orders conversion", () => {
  it("converts Hz to CPM with x60 and back", () => {
    expect(hzToCpm(30)).toBe(1800);
    expect(cpmToHz(1800)).toBe(30);
    expect(cpmToHz(hzToCpm(12.5))).toBeCloseTo(12.5, 10);
  });

  it("computes orders from Hz and recorded RPM", () => {
    expect(hzToOrders(30, 1800)).toBeCloseTo(1, 10);
    expect(hzToOrders(60, 1800)).toBeCloseTo(2, 10);
    expect(ordersToHz(2, 1800)).toBeCloseTo(60, 10);
  });

  it("never guesses orders when RPM is missing", () => {
    expect(hzToOrders(30, null)).toBeNull();
    expect(hzToOrders(30, 0)).toBeNull();
    expect(ordersToHz(1, null)).toBeNull();
    expect(resolveFrequencyDisplayUnit("orders", null)).toBe("Hz");
    expect(resolveFrequencyDisplayUnit("orders", 1800)).toBe("orders");

    const fallback = frequencyDisplayValue(30, "orders", null);
    expect(fallback.unit).toBe("Hz");
    expect(fallback.value).toBe(30);
    expect(fallback.text).toBe("30.0 Hz");
    expect(fallback.ordersFallback).toBe(true);
    expect(fallback.fallbackHint).toBe(ORDERS_FALLBACK_HINT);

    const orders = frequencyDisplayValue(30, "orders", 1800);
    expect(orders.unit).toBe("orders");
    expect(orders.value).toBeCloseTo(1, 10);
    expect(orders.text).toBe("1.00 orders");
    expect(orders.ordersFallback).toBe(false);
    expect(orders.fallbackHint).toBeNull();
  });

  it("projects numeric chart values for Hz, CPM and orders", () => {
    expect(frequencyValueForDisplay(30, "Hz", null)).toBe(30);
    expect(frequencyValueForDisplay(30, "CPM", null)).toBe(1800);
    expect(frequencyValueForDisplay(30, "orders", 1800)).toBeCloseTo(1, 10);
    // Missing RPM falls back to Hz rather than fabricating orders.
    expect(frequencyValueForDisplay(30, "orders", null)).toBe(30);
  });
});

describe("SLICE-H2 display preference normalization", () => {
  it("defaults to canonical mm/s, g and Hz", () => {
    expect(CANONICAL_DISPLAY_UNITS).toEqual({
      velocity: "mm/s",
      acceleration: "g",
      frequency: "Hz"
    });
    expect(normalizeDisplayUnits(null)).toEqual(CANONICAL_DISPLAY_UNITS);
    expect(normalizeDisplayUnits({})).toEqual(CANONICAL_DISPLAY_UNITS);
  });

  it("round-trips valid per-tenant choices and rejects unknown values", () => {
    const chosen = {
      velocity: "in/s",
      acceleration: "mm/s2",
      frequency: "CPM"
    } as const;
    expect(normalizeDisplayUnits(chosen)).toEqual(chosen);
    expect(
      normalizeDisplayUnits({ velocity: "furlongs", acceleration: "x", frequency: "y" })
    ).toEqual(CANONICAL_DISPLAY_UNITS);
  });

  it("formats velocity in the selected unit without touching the canonical value", () => {
    expect(formatVelocityDisplay(25.4, "in/s")).toBe("1.0000 in/s");
    expect(formatVelocityDisplay(11.85, "mm/s")).toBe("11.85 mm/s");
  });
});
