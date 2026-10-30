import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  KinematicSpecsEmptyState,
  KinematicSpecsOutageBanner
} from "./KinematicSpecsNotice";
import {
  KINEMATIC_SPECS_EMPTY_MESSAGE,
  KINEMATIC_SPECS_OUTAGE_MESSAGE
} from "../lib/vibration/componentSpecs";

describe("SLICE-J kinematic spec notices", () => {
  it("renders the configuration prompt with a real Equipment DB link", () => {
    const html = renderToStaticMarkup(<KinematicSpecsEmptyState />);
    expect(html).toContain(KINEMATIC_SPECS_EMPTY_MESSAGE);
    expect(html).toContain("Configure in Equipment DB");
    expect(html).toContain('href="/equipment-db"');
    expect(html).not.toContain(KINEMATIC_SPECS_OUTAGE_MESSAGE);
  });

  it("renders a distinct red outage banner for genuine failures", () => {
    const html = renderToStaticMarkup(<KinematicSpecsOutageBanner />);
    expect(html).toContain("reach the server to load kinematic specs");
    expect(html).toContain("border-red-500/40");
    expect(html).not.toContain(KINEMATIC_SPECS_EMPTY_MESSAGE);
    expect(KINEMATIC_SPECS_OUTAGE_MESSAGE).not.toBe(
      KINEMATIC_SPECS_EMPTY_MESSAGE
    );
  });
});
