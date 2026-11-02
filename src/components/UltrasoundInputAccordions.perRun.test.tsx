// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import UltrasoundInputAccordions, {
  type UltrasoundInputSnapshot
} from "./UltrasoundInputAccordions";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function openLeakInputs() {
  const snapshots: UltrasoundInputSnapshot[] = [];
  const onSnapshotChange = vi.fn((snapshot: UltrasoundInputSnapshot) => {
    snapshots.push(snapshot);
  });
  render(
    <UltrasoundInputAccordions
      equipment={{ assetTag: "M-101", assetLabel: "Compressor" }}
      onSnapshotChange={onSnapshotChange}
    />
  );
  fireEvent.click(
    screen.getByRole("button", { name: /Mode-Specific Critical Inputs/ })
  );
  return { snapshots, onSnapshotChange };
}

function latest(snapshots: UltrasoundInputSnapshot[]): UltrasoundInputSnapshot {
  return snapshots[snapshots.length - 1];
}

describe("SLICE-AB operational hours / pressure / coefficient reach the snapshot", () => {
  it("emits the selected operational hours instead of dropping them", async () => {
    const { snapshots } = openLeakInputs();

    await waitFor(() => {
      expect(latest(snapshots).operatingHours).toBe(8760);
    });

    fireEvent.change(screen.getByLabelText(/Asset Operational Hours/), {
      target: { value: "2-Shift Operation (4,000 hrs/year)" }
    });

    await waitFor(() => {
      expect(latest(snapshots).operatingHours).toBe(4000);
    });
  });

  it("emits line pressure (converted from bar) and the discharge coefficient", async () => {
    const { snapshots } = openLeakInputs();

    fireEvent.change(screen.getByLabelText("System Pressure"), {
      target: { value: "150" }
    });
    await waitFor(() => {
      expect(latest(snapshots).systemPressure).toBe(150);
    });

    fireEvent.change(screen.getByLabelText(/Orifice \/ Leak Profile/), {
      target: { value: "Jagged/Crack (Coefficient 0.74)" }
    });
    await waitFor(() => {
      expect(latest(snapshots).dischargeCoefficient).toBe(0.74);
    });

    fireEvent.change(screen.getByDisplayValue("PSI"), {
      target: { value: "Bar" }
    });
    fireEvent.change(screen.getByLabelText("System Pressure"), {
      target: { value: "10" }
    });
    await waitFor(() => {
      expect(latest(snapshots).systemPressure).toBeCloseTo(145.04, 2);
    });
  });
});
