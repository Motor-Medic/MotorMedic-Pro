import { afterEach, describe, expect, it } from "vitest";
import {
  getFlatEquipment,
  saveEquipmentStore,
  subscribeEquipmentStoreChanged,
  type EquipmentStore
} from "./equipmentDb";
import { resolveBearingFaultFrequencies } from "../lib/vibration/bearingFaultFrequencies";

const makeStore = (rpm: string): EquipmentStore => ({
  plants: [
    {
      id: "plant-1",
      name: "Test Plant",
      location: "Test Plant",
      facilityType: "Power Plant"
    }
  ],
  units: [],
  routes: [
    {
      id: "route-1",
      name: "Test Route",
      location: "Test Plant",
      assets: [
        {
          id: "asset-1",
          tag: "M-101",
          name: "Motor",
          location: "Test Plant",
          components: [
            {
              id: "comp-1",
              name: "Motor DE",
              kinematics: {
                ratedRpm: rpm,
                bearingDe: "SKF 6205"
              }
            }
          ]
        }
      ]
    }
  ]
});

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage"
);

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
  if (originalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalStorage);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});

describe("SLICE-L equipment cache invalidation", () => {
  it("save -> invalidate -> recompute moves BPFO without a second save", () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });
    const eventTarget = new EventTarget();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: eventTarget
    });

    const computeBpfo = () => {
      const component = getFlatEquipment()[0]?.components[0];
      const kinematics = component?.kinematics ?? {};
      const rpm = Number(kinematics.ratedRpm);
      return (
        resolveBearingFaultFrequencies({
          bearingLabel: kinematics.bearingDe,
          rpm,
          kinematics: kinematics as Record<string, unknown>
        })?.bpfo ?? null
      );
    };

    let recomputedBpfo: number | null = null;
    const unsubscribe = subscribeEquipmentStoreChanged(() => {
      recomputedBpfo = computeBpfo();
    });

    saveEquipmentStore(makeStore("1800"));
    const firstSaveBpfo = recomputedBpfo;

    saveEquipmentStore(makeStore("3600"));
    const secondSaveBpfo = recomputedBpfo;

    unsubscribe();

    expect(firstSaveBpfo).not.toBeNull();
    expect(secondSaveBpfo).toBeCloseTo((firstSaveBpfo as number) * 2, 2);
  });

  it("unsubscribe stops the invalidation stream", () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: new EventTarget()
    });

    let calls = 0;
    const unsubscribe = subscribeEquipmentStoreChanged(() => {
      calls += 1;
    });
    saveEquipmentStore(makeStore("1800"));
    unsubscribe();
    saveEquipmentStore(makeStore("3600"));

    expect(calls).toBe(1);
  });
});
