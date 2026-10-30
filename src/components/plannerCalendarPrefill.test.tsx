import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrefilledWorkOrderCard } from "./MaintenanceCalendar";
import { AUDIT_SAFE_FALLBACK } from "./trendAnalyzer/VibrationSeverityPanels";
import type { WorkOrderPrefill } from "../lib/maintenance/workOrderPrefill";

function prefill(overrides: Partial<WorkOrderPrefill>): WorkOrderPrefill {
  return {
    id: "P-101A::2026-01-01T00:00:00.000Z",
    assetTag: "P-101A",
    assetName: "Boiler Feed Pump A",
    component: "Motor DE",
    isoZone: "C",
    action: "Schedule corrective maintenance and re-check the trend.",
    fault: "Schedule corrective maintenance and re-check the trend.",
    description:
      "Work order prefill from Trend Analyzer for P-101A / Motor DE.\nRecommended action: Schedule corrective maintenance and re-check the trend.\nOverall velocity: 5.00 mm/s.",
    velocityMmS: 5,
    velocityDisplay: "5.00 mm/s",
    velocityUnit: "mm/s",
    suppressed: false,
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("SLICE-K prefilled work-order review card", () => {
  it("shows the repair prefill and requires an explicit confirmation", () => {
    const html = renderToStaticMarkup(
      <PrefilledWorkOrderCard
        prefill={prefill({})}
        onCreate={() => {}}
        onDiscard={() => {}}
      />
    );

    expect(html).toContain("P-101A");
    expect(html).toContain("Motor DE");
    expect(html).toContain("Schedule corrective maintenance");
    expect(html).toContain("5.00 mm/s");
    expect(html).toContain("Create draft proposal");
    expect(html).toContain("Review and confirm");
  });

  it("shows a neutral investigative prefill for P-204A with zero bearing-replacement text", () => {
    const html = renderToStaticMarkup(
      <PrefilledWorkOrderCard
        prefill={prefill({
          assetTag: "P-204A",
          assetName: "Cooling Water Pump B",
          component: "DE Bearing",
          isoZone: null,
          action: AUDIT_SAFE_FALLBACK,
          fault: AUDIT_SAFE_FALLBACK,
          description: `Work order prefill from Trend Analyzer for P-204A / DE Bearing.\n${AUDIT_SAFE_FALLBACK}\nNo repair action is recommended until the failure mode is confirmed.`,
          velocityMmS: 2.1,
          velocityDisplay: "2.10 mm/s",
          suppressed: true
        })}
        onCreate={() => {}}
        onDiscard={() => {}}
      />
    );

    expect(html).toContain("P-204A");
    expect(html).toContain(AUDIT_SAFE_FALLBACK);
    expect(html).toContain("Investigative");
    expect(html).not.toMatch(/bearing replacement|Allocate the correct replacement bearing/i);
  });
});
