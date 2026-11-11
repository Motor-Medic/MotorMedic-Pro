// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import OilInputAccordions from "./OilInputAccordions";
import {
  buildOilSampleSavePayload,
  type OilLabSnapshot
} from "../lib/oilDiagnosticSave";

afterEach(() => {
  cleanup();
});

const last = (snapshots: OilLabSnapshot[]): OilLabSnapshot => {
  const snapshot = snapshots[snapshots.length - 1];
  expect(snapshot).toBeTruthy();
  return snapshot;
};

describe("OilInputAccordions SLICE-AO section 5", () => {
  it("emits MPC, RULER, DR and operator morphology into the save snapshot", async () => {
    const snapshots: OilLabSnapshot[] = [];
    render(<OilInputAccordions onSnapshotChange={(s) => snapshots.push(s)} />);

    await waitFor(() => expect(snapshots.length).toBeGreaterThan(0));
    expect(last(snapshots).mpcDeltaE).toBeNull();
    expect(last(snapshots).morphology).toBeUndefined();

    fireEvent.click(
      screen.getByRole("button", { name: /5\. Ferrography & Varnish/i })
    );
    expect(screen.getByText(/Operator Observation/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/MPC/), {
      target: { value: "28.4" }
    });
    fireEvent.change(screen.getByLabelText(/^RULER$/), {
      target: { value: "42" }
    });
    fireEvent.change(screen.getByLabelText(/DR Large/), {
      target: { value: "12.5" }
    });
    fireEvent.change(screen.getByLabelText(/DR Small/), {
      target: { value: "4.2" }
    });
    fireEvent.change(screen.getByLabelText(/Cutting Wear/), {
      target: { value: "moderate" }
    });

    await waitFor(() => expect(last(snapshots).mpcDeltaE).toBe(28.4));
    const snapshot = last(snapshots);
    expect(snapshot.rulerPercent).toBe(42);
    expect(snapshot.drLarge).toBe(12.5);
    expect(snapshot.drSmall).toBe(4.2);
    expect(snapshot.ucRating).toBeNull();
    expect(snapshot.morphology).toEqual({ cutting: "moderate" });

    const payload = buildOilSampleSavePayload(
      snapshot,
      "PUMP-1",
      "2026-03-01"
    );
    expect(payload).toMatchObject({
      mpcDeltaE: 28.4,
      rulerPercent: 42,
      drLarge: 12.5,
      drSmall: 4.2
    });
    expect(payload?.ucRating).toBeUndefined();
    expect(payload?.morphology).toEqual({ cutting: "moderate" });
  });

  it("keeps blank section 5 fields null in the snapshot and undefined in the payload", async () => {
    const snapshots: OilLabSnapshot[] = [];
    render(<OilInputAccordions onSnapshotChange={(s) => snapshots.push(s)} />);

    await waitFor(() => expect(snapshots.length).toBeGreaterThan(0));
    fireEvent.click(
      screen.getByRole("button", { name: /5\. Ferrography & Varnish/i })
    );

    const snapshot = last(snapshots);
    expect(snapshot.mpcDeltaE).toBeNull();
    expect(snapshot.rulerPercent).toBeNull();
    expect(snapshot.drLarge).toBeNull();
    expect(snapshot.drSmall).toBeNull();
    expect(snapshot.ucRating).toBeNull();
    expect(snapshot.morphology).toBeUndefined();

    expect(
      buildOilSampleSavePayload(snapshot, "PUMP-1", "2026-03-01")
    ).toBeNull();
  });
});
