import { describe, expect, it } from "vitest";
import {
  CANONICAL_VELOCITY_UNIT,
  formatVelocityMmS,
  inchPerSecondToMmPerSecond,
  MM_PER_INCH,
  mmPerSecondToInchPerSecond,
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
