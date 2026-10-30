import { afterEach, describe, expect, it } from "vitest";
import {
  AUDIT_SAFE_FALLBACK
} from "../../components/trendAnalyzer/VibrationSeverityPanels";
import {
  buildWorkOrderPrefill,
  clearWorkOrderPrefill,
  getWorkOrderPrefillSnapshot,
  stageWorkOrderPrefill
} from "./workOrderPrefill";

const BEARING_REPAIR =
  "Allocate the correct replacement bearing from inventory (match DE/NDE OEM spec).";

afterEach(() => {
  clearWorkOrderPrefill();
});

describe("SLICE-K work-order prefill", () => {
  it("prefills the repair action verbatim when the recommendation stands", () => {
    const prefill = buildWorkOrderPrefill({
      assetTag: "P-101A",
      assetName: "Boiler Feed Pump A",
      component: "Motor DE",
      zone: "C",
      recommendation: BEARING_REPAIR,
      velocityMmS: 5,
      velocityUnit: "mm/s"
    });

    expect(prefill.suppressed).toBe(false);
    expect(prefill.action).toBe(BEARING_REPAIR);
    expect(prefill.fault).toBe(BEARING_REPAIR);
    expect(prefill.description).toContain(`Recommended action: ${BEARING_REPAIR}`);
    expect(prefill.description).not.toContain(AUDIT_SAFE_FALLBACK);
    expect(prefill.description).toContain("ISO 20816 Zone C");
  });

  it("prefills the audit-safe neutral action for the P-204A unresolved case", () => {
    const prefill = buildWorkOrderPrefill({
      assetTag: "P-204A",
      component: "DE Bearing",
      zone: null,
      recommendation: BEARING_REPAIR,
      velocityMmS: 2.1,
      velocityUnit: "mm/s"
    });

    expect(prefill.suppressed).toBe(true);
    expect(prefill.action).toBe(AUDIT_SAFE_FALLBACK);
    expect(prefill.fault).toBe(AUDIT_SAFE_FALLBACK);
    expect(prefill.description).toContain(AUDIT_SAFE_FALLBACK);
    expect(prefill.description).not.toMatch(
      /bearing replacement|Allocate the correct replacement bearing/i
    );
    expect(prefill.description).toContain("No repair action is recommended");
  });

  it("keeps a contradictory consensus neutral even when the zone resolves", () => {
    const prefill = buildWorkOrderPrefill({
      assetTag: "P-204A",
      zone: "D",
      recommendation: BEARING_REPAIR,
      consensusConflict: true
    });

    expect(prefill.suppressed).toBe(true);
    expect(prefill.description).toContain(AUDIT_SAFE_FALLBACK);
    expect(prefill.description).not.toContain(BEARING_REPAIR);
  });

  it("never re-derives suppression from the raw recommendation", () => {
    const prefill = buildWorkOrderPrefill({
      assetTag: "P-204A",
      zone: "D",
      recommendation: BEARING_REPAIR,
      action: AUDIT_SAFE_FALLBACK
    });

    expect(prefill.suppressed).toBe(true);
    expect(prefill.description).not.toContain(BEARING_REPAIR);
  });

  it("formats the embedded velocity through the display-unit preference", () => {
    const inches = buildWorkOrderPrefill({
      assetTag: "P-101A",
      zone: "D",
      recommendation: BEARING_REPAIR,
      velocityMmS: 11.85,
      velocityUnit: "in/s"
    });
    expect(inches.description).toContain("0.4665 in/s");
    expect(inches.description).not.toContain("11.85 mm/s");

    const millimetres = buildWorkOrderPrefill({
      assetTag: "P-101A",
      zone: "D",
      recommendation: BEARING_REPAIR,
      velocityMmS: 11.85,
      velocityUnit: "mm/s"
    });
    expect(millimetres.description).toContain("11.85 mm/s");
  });

  it("stages a complete snapshot synchronously so the route cannot read an empty form", () => {
    const staged = stageWorkOrderPrefill({
      assetTag: "P-101A",
      component: "Motor DE",
      zone: "C",
      recommendation: BEARING_REPAIR,
      velocityMmS: 5,
      velocityUnit: "mm/s"
    });

    const read = getWorkOrderPrefillSnapshot();
    expect(read).not.toBeNull();
    expect(read).toBe(staged);
    expect(read?.assetTag).toBe("P-101A");
    expect(read?.description).toContain(BEARING_REPAIR);
  });

  it("clears the staged prefill after review", () => {
    stageWorkOrderPrefill({
      assetTag: "P-101A",
      zone: "C",
      recommendation: BEARING_REPAIR
    });
    clearWorkOrderPrefill();
    expect(getWorkOrderPrefillSnapshot()).toBeNull();
  });
});
