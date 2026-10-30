import { describe, expect, it } from "vitest";
import { classifyZone, isoZoneEdges, type IsoMachineClass } from "./isoZone";
import { mmPerSecondToInchPerSecond } from "./units";
import { resolveVelocityThresholds } from "./velocityThresholds";

describe("SLICE-I peak velocity threshold lines", () => {
  it.each<IsoMachineClass>(["I", "II", "III", "IV"])(
    "defaults alert/danger to the ISO B|C and C|D edges for Class %s",
    (machineClass) => {
      const [, alertEdge, dangerEdge] = isoZoneEdges(machineClass);
      const resolution = resolveVelocityThresholds({ machineClass });

      expect(resolution.source).toBe("iso");
      expect(resolution.machineClass).toBe(machineClass);
      expect(resolution.alertMmS).toBe(alertEdge);
      expect(resolution.dangerMmS).toBe(dangerEdge);
      expect(resolution.alertDisplay).toBe(alertEdge);
      expect(resolution.dangerDisplay).toBe(dangerEdge);
    }
  );

  it("keeps Class II at the expected 4.5 / 7.1 mm/s RMS edges", () => {
    const resolution = resolveVelocityThresholds({ machineClass: "Class II" });
    expect(resolution.alertMmS).toBe(4.5);
    expect(resolution.dangerMmS).toBe(7.1);
    expect(resolution.alertLabel).toBe("Alert 4.50 mm/s");
    expect(resolution.dangerLabel).toBe("Danger 7.10 mm/s");
    expect(resolution.provenance).toBe(
      "ISO II defaults - alert 4.50, danger 7.10 mm/s"
    );
  });

  it("converts line positions and labels when the display unit is in/s", () => {
    const mm = resolveVelocityThresholds({ machineClass: "II", unit: "mm/s" });
    const inch = resolveVelocityThresholds({ machineClass: "II", unit: "in/s" });

    expect(inch.alertDisplay).toBeCloseTo(
      mmPerSecondToInchPerSecond(4.5),
      10
    );
    expect(inch.dangerDisplay).toBeCloseTo(
      mmPerSecondToInchPerSecond(7.1),
      10
    );
    expect(inch.alertDisplay).toBeCloseTo(0.1772, 3);
    expect(inch.dangerDisplay).toBeCloseTo(0.2795, 3);
    expect(inch.alertLabel).toBe("Alert 0.1772 in/s");
    expect(inch.dangerLabel).toBe("Danger 0.2795 in/s");
    expect(inch.provenance).toBe(
      "ISO II defaults - alert 0.1772, danger 0.2795 in/s"
    );
    expect(mm.alertDisplay).toBe(4.5);
    expect(mm.dangerDisplay).toBe(7.1);
  });

  it("lets plant thresholds beat ISO defaults", () => {
    const resolution = resolveVelocityThresholds({
      machineClass: "Class II",
      warningThresholdMmS: 3.2,
      criticalThresholdMmS: 6.4
    });
    expect(resolution.source).toBe("plant");
    expect(resolution.alertMmS).toBe(3.2);
    expect(resolution.dangerMmS).toBe(6.4);
    expect(resolution.provenance).toBe(
      "Plant thresholds - alert 3.20, danger 6.40 mm/s"
    );
  });

  it("reports plant provenance in the active unit for overrides", () => {
    const resolution = resolveVelocityThresholds({
      machineClass: "II",
      warningThresholdMmS: 3.2,
      criticalThresholdMmS: 6.4,
      unit: "in/s"
    });
    expect(resolution.alertDisplay).toBeCloseTo(
      mmPerSecondToInchPerSecond(3.2),
      10
    );
    expect(resolution.provenance).toBe(
      "Plant thresholds - alert 0.1260, danger 0.2520 in/s"
    );
  });

  it("falls back to ISO defaults when the plant pair is incomplete", () => {
    const onlyAlert = resolveVelocityThresholds({
      machineClass: "II",
      warningThresholdMmS: 3.2
    });
    expect(onlyAlert.source).toBe("iso");
    expect(onlyAlert.alertMmS).toBe(4.5);
    expect(onlyAlert.dangerMmS).toBe(7.1);

    const onlyDanger = resolveVelocityThresholds({
      machineClass: "II",
      criticalThresholdMmS: 6.4
    });
    expect(onlyDanger.source).toBe("iso");
    expect(onlyDanger.alertMmS).toBe(4.5);
    expect(onlyDanger.dangerMmS).toBe(7.1);
  });

  it("leaves canonical classifyZone behaviour untouched", () => {
    expect(classifyZone(4.499, "Class II")).toBe("B");
    expect(classifyZone(4.5, "Class II")).toBe("C");
    expect(classifyZone(7.099, "Class II")).toBe("C");
    expect(classifyZone(7.1, "Class II")).toBe("D");
  });
});
