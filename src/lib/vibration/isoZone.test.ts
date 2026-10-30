import { describe, expect, it } from "vitest";
import {
  classifyZone,
  classifyZoneFromHealth,
  isoZoneBands,
  isoZoneEdges,
  parseMachineClass,
  type IsoMachineClass,
  type IsoZone
} from "./isoZone";

const EPS = 0.001;

describe("classifyZone", () => {
  it.each<[IsoMachineClass, readonly [number, number, number]]>([
    ["I", [0.71, 1.8, 4.5]],
    ["II", [2.3, 4.5, 7.1]],
    ["III", [4.5, 7.1, 11.2]],
    ["IV", [7.1, 11.2, 18]]
  ])("splits every zone edge for Class %s", (machineClass, edges) => {
    expect(isoZoneEdges(machineClass)).toEqual(edges);
    const expectedBefore: IsoZone[] = ["A", "B", "C"];
    const expectedAt: IsoZone[] = ["B", "C", "D"];
    edges.forEach((edge, index) => {
      expect(classifyZone(edge - EPS, machineClass)).toBe(expectedBefore[index]);
      expect(classifyZone(edge, machineClass)).toBe(expectedAt[index]);
      expect(classifyZone(edge + EPS, machineClass)).toBe(expectedAt[index]);
    });
  });

  it("classifies the canonical Class II bands exactly as the app expects", () => {
    expect(classifyZone(0, "Class II")).toBe("A");
    expect(classifyZone(2.299, "Class II")).toBe("A");
    expect(classifyZone(2.3, "Class II")).toBe("B");
    expect(classifyZone(4.499, "Class II")).toBe("B");
    expect(classifyZone(4.5, "Class II")).toBe("C");
    expect(classifyZone(7.099, "Class II")).toBe("C");
    expect(classifyZone(7.1, "Class II")).toBe("D");
    expect(classifyZone(12, "Class II")).toBe("D");
  });

  it("returns null for missing or invalid values", () => {
    expect(classifyZone(null)).toBeNull();
    expect(classifyZone(undefined)).toBeNull();
    expect(classifyZone(Number.NaN)).toBeNull();
    expect(classifyZone(-0.1)).toBeNull();
  });

  it("parses ISO machine class labels and defaults to Class II", () => {
    expect(parseMachineClass("Class I")).toBe("I");
    expect(parseMachineClass("Class II")).toBe("II");
    expect(parseMachineClass("Class III")).toBe("III");
    expect(parseMachineClass("Class IV")).toBe("IV");
    expect(parseMachineClass("Not set")).toBe("II");
    expect(parseMachineClass(null)).toBe("II");
  });

  it("maps health fallback values to the same zone letters", () => {
    expect(classifyZoneFromHealth(90)).toBe("A");
    expect(classifyZoneFromHealth(85)).toBe("A");
    expect(classifyZoneFromHealth(84.9)).toBe("B");
    expect(classifyZoneFromHealth(70)).toBe("B");
    expect(classifyZoneFromHealth(69.9)).toBe("C");
    expect(classifyZoneFromHealth(50)).toBe("C");
    expect(classifyZoneFromHealth(49.9)).toBe("D");
    expect(classifyZoneFromHealth(null)).toBeNull();
  });

  it("builds contiguous display bands that reach the finite scale maximum", () => {
    const bands = isoZoneBands("Class II");
    expect(bands.map((band) => band.zone)).toEqual(["A", "B", "C", "D"]);
    expect(bands[0].from).toBe(0);
    expect(bands[0].to).toBe(bands[1].from);
    expect(bands[1].to).toBe(bands[2].from);
    expect(bands[2].to).toBe(bands[3].from);
    expect(bands[3].to).toBeGreaterThan(bands[2].to);
  });
});
