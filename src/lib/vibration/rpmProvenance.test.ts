import { describe, expect, it } from "vitest";
import {
  CAPTURE_DEFAULT_VIBRATION_RPM,
  VIBRATION_RPM_CONFIGURED_LABEL,
  VIBRATION_RPM_DEFAULT_WARNING,
  VIBRATION_RPM_MEASURED_LABEL,
  buildVibrationRpmReading,
  classifyVibrationRpmSource,
  isGatingQualityVibrationRpm,
  vibrationRpmProvenanceLabel
} from "./rpmProvenance";

describe("SLICE-VS5 RPM provenance classification", () => {
  it("treats an untagged capture-default 1780 as default, not measured", () => {
    expect(classifyVibrationRpmSource(null, CAPTURE_DEFAULT_VIBRATION_RPM)).toBe(
      "default"
    );
    expect(classifyVibrationRpmSource(null, 1800)).toBe("unknown");
    expect(classifyVibrationRpmSource(undefined, null)).toBe("absent");
  });

  it("recognizes measured and configured source tokens", () => {
    expect(classifyVibrationRpmSource("vision-extracted", 1780)).toBe(
      "measured"
    );
    expect(classifyVibrationRpmSource("measured", 1790)).toBe("measured");
    expect(classifyVibrationRpmSource("configured", 1780)).toBe("configured");
    expect(classifyVibrationRpmSource("equipment-db", 1780)).toBe("configured");
    expect(classifyVibrationRpmSource("default", 1780)).toBe("default");
    expect(classifyVibrationRpmSource("mystery", 1780)).toBe("unknown");
  });

  it("only measured/configured sources are gating-quality", () => {
    expect(isGatingQualityVibrationRpm("measured")).toBe(true);
    expect(isGatingQualityVibrationRpm("configured")).toBe(true);
    expect(isGatingQualityVibrationRpm("default")).toBe(false);
    expect(isGatingQualityVibrationRpm("unknown")).toBe(false);
    expect(isGatingQualityVibrationRpm("absent")).toBe(false);
    expect(isGatingQualityVibrationRpm(null)).toBe(false);
  });

  it("builds display-safe readings with honest labels", () => {
    const reading = buildVibrationRpmReading(1780, null);
    expect(reading.gatingQuality).toBe(false);
    expect(reading.warning).toBe(VIBRATION_RPM_DEFAULT_WARNING);
    expect(vibrationRpmProvenanceLabel("measured")).toBe(
      VIBRATION_RPM_MEASURED_LABEL
    );
    expect(vibrationRpmProvenanceLabel("configured")).toBe(
      VIBRATION_RPM_CONFIGURED_LABEL
    );
    expect(vibrationRpmProvenanceLabel("default")).toContain("not measured");
    expect(buildVibrationRpmReading(null, "vision-extracted").source).toBe(
      "absent"
    );
  });
});
