// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OilInputAccordions from "./OilInputAccordions";
import {
  buildOilSampleSavePayload,
  type OilLabSnapshot
} from "../lib/oilDiagnosticSave";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

describe("SLICE-IDENTITY-GUARD — Fluid Identity provenance & baseline gate", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const lastIdentity = (snapshots: OilLabSnapshot[]): OilLabSnapshot => {
    const snapshot = snapshots[snapshots.length - 1];
    expect(snapshot).toBeTruthy();
    expect(snapshot.oilIdentity).toBeTruthy();
    return snapshot;
  };

  /** Open the identity accordion so its fields are in the DOM. */
  const openIdentity = async () => {
    const btn = screen.getByRole("button", { name: /1\. Fluid Identity & Sump Genetics/i });
    if (btn.getAttribute("aria-expanded") !== "true") {
      fireEvent.click(btn);
    }
    await waitFor(() =>
      expect(
        screen.queryAllByText(/not identified — confirm/).length
      ).toBeGreaterThan(0)
    );
  };

  it("unset-default identity: renders 'not identified — confirm'; NO baseline attached", async () => {
    const snapshots: OilLabSnapshot[] = [];
    render(<OilInputAccordions onSnapshotChange={(s) => snapshots.push(s)} />);

    await waitFor(() => expect(snapshots.length).toBeGreaterThan(0));

    await openIdentity();

    const snapshot = lastIdentity(snapshots);
    // Every identity field starts unset-default — factory default is NOT treated as read.
    expect(snapshot.oilIdentity!.assetType).toBe("unset-default");
    expect(snapshot.oilIdentity!.brand).toBe("unset-default");
    expect(snapshot.oilIdentity!.isoGrade).toBe("unset-default");
    expect(snapshot.oilIdentity!.baseChemistry).toBe("unset-default");
    expect(snapshot.oilIdentity!.confirmed).toBe(false);

    // DOM: per-field "not identified — confirm" is shown (not the default as if read).
    const confirmTexts = screen.getAllByText(/not identified — confirm/);
    expect(confirmTexts.length).toBeGreaterThanOrEqual(4);

    // [VERIFY] affordances are present for unconfirmed fields.
    expect(screen.getAllByText(/\[VERIFY\]/).length).toBeGreaterThanOrEqual(4);
  });

  it("human-confirm on all identity fields -> confirmed=true, baseline attaches", async () => {
    const snapshots: OilLabSnapshot[] = [];
    render(<OilInputAccordions onSnapshotChange={(s) => snapshots.push(s)} />);

    await waitFor(() => expect(snapshots.length).toBeGreaterThan(0));

    await openIdentity();

    // Confirm every identity field via [VERIFY].
    // Re-query after each click since confirming removes that field's [VERIFY].
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getAllByText(/\[VERIFY\]/)[0]);
      await waitFor(() => expect(snapshots.length).toBeGreaterThan(i + 1));
    }

    const snapshot = lastIdentity(snapshots);
    expect(snapshot.oilIdentity!.confirmed).toBe(true);
    expect(snapshot.oilIdentity!.assetType).toBe("human-confirmed");
    expect(snapshot.oilIdentity!.brand).toBe("human-confirmed");
    expect(snapshot.oilIdentity!.isoGrade).toBe("human-confirmed");
    expect(snapshot.oilIdentity!.baseChemistry).toBe("human-confirmed");
    expect(snapshot.oilIdentity!.contradictions).toEqual({
      assetType: null,
      brand: null,
      isoGrade: null,
      baseChemistry: null
    });
  });

  it("extracted-low-confidence identity: baseline WITHHELD until human confirm; after confirm -> attaches", async () => {
    // Mock URL.createObjectURL (dropzone calls it on file selection).
    vi.stubGlobal("URL", {
      ...(globalThis as unknown as { URL: typeof URL }).URL,
      createObjectURL: vi.fn(() => "mock-url")
    });
    // Mock the vision extract API to return low-confidence extraction.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          technology: "OIL",
          data: {
            header: {
              lubricantBrand: "Mobil DTE 25",
              lubricantGrade: "ISO VG 46",
              assetDescription: null,
              rawNotes: null
            },
            metals: {},
            fluidProperties: {},
            operatingParams: {},
            confidenceScore: 50, // below high-confidence threshold (80)
            sourceFileName: "report.png"
          } as any
        })
      }) as unknown as Response)
    );
    // Mock FileReader so the dropzone can "read" the file.
    vi.stubGlobal("FileReader", class {
      result = "data:image/png;base64,mock";
      onload: ((ev: Event) => void) | null = null;
      readAsDataURL() {
        setTimeout(() => this.onload?.(new Event("load") as any), 0);
      }
      abort() {}
    } as any);

    const snapshots: OilLabSnapshot[] = [];
    render(<OilInputAccordions onSnapshotChange={(s) => snapshots.push(s)} />);

    await waitFor(() => expect(snapshots.length).toBeGreaterThan(0));

    // Select the image file input in the dropzone to trigger extraction.
    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: [new File([""], "report.png", { type: "image/png" })]
      }
    });

    // Wait for extraction to complete and snapshot to update.
    await waitFor(() => expect(snapshots.length).toBeGreaterThan(1));
    await new Promise((r) => setTimeout(r, 100));

    const snapshot = lastIdentity(snapshots);
    // Low-confidence extraction: brand/grade set but provenance = extracted-low-confidence.
    expect(snapshot.oilIdentity!.brand).toBe("extracted-low-confidence");
    expect(snapshot.oilIdentity!.isoGrade).toBe("extracted-low-confidence");
    // Asset type / base chemistry were never extracted → unset-default.
    expect(snapshot.oilIdentity!.assetType).toBe("unset-default");
    expect(snapshot.oilIdentity!.baseChemistry).toBe("unset-default");
    // Not all fields confirmed → baseline NOT attached.
    expect(snapshot.oilIdentity!.confirmed).toBe(false);

    // DOM still shows "not identified — confirm" for unset-default fields.
    await openIdentity();
    expect(screen.getAllByText(/not identified — confirm/).length).toBeGreaterThan(0);

    // Now human-confirm all unset-default fields → confirmed=true.
    // Re-query after each click since confirming removes that field's [VERIFY].
    for (let i = 0; i < 4; i++) {
      if (screen.queryAllByText(/\[VERIFY\]/).length === 0) break;
      fireEvent.click(screen.getAllByText(/\[VERIFY\]/)[0]);
      await waitFor(() => expect(snapshots.length).toBeGreaterThan(2 + i));
    }

    const snapshot2 = lastIdentity(snapshots);
    expect(snapshot2.oilIdentity!.confirmed).toBe(true);
    expect(snapshot2.oilIdentity!.brand).toBe("human-confirmed");
    expect(snapshot2.oilIdentity!.isoGrade).toBe("human-confirmed");
    expect(snapshot2.oilIdentity!.assetType).toBe("human-confirmed");
    expect(snapshot2.oilIdentity!.baseChemistry).toBe("human-confirmed");
  });

  it("CANONICAL contradiction: extractor surfaces AMSOIL/0W30/engine but identity = Mobil DTE 25/ISO VG 46/Hydraulic/Mineral -> demote, withhold baseline, surface mismatch", async () => {
    vi.stubGlobal("URL", {
      ...(globalThis as unknown as { URL: typeof URL }).URL,
      createObjectURL: vi.fn(() => "mock-url")
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          technology: "OIL",
          data: {
            header: {
              lubricantBrand: "AMSOIL",
              lubricantGrade: "SAE 0W30",
              assetDescription: "UNLEADED GASOLINE ENGINE",
              rawNotes: "TOYOTA COROLLA"
            },
            metals: {},
            fluidProperties: {},
            operatingParams: {},
            confidenceScore: 95,
            sourceFileName: "report.png"
          } as any
        })
      }) as unknown as Response)
    );
    vi.stubGlobal("FileReader", class {
      result = "data:image/png;base64,mock";
      onload: ((ev: Event) => void) | null = null;
      readAsDataURL() {
        setTimeout(() => this.onload?.(new Event("load") as any), 0);
      }
      abort() {}
    } as any);

    const snapshots: OilLabSnapshot[] = [];
    render(<OilInputAccordions onSnapshotChange={(s) => snapshots.push(s)} />);

    await waitFor(() => expect(snapshots.length).toBeGreaterThan(0));

    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: [new File([""], "report.png", { type: "image/png" })]
      }
    });

    await waitFor(() => expect(snapshots.length).toBeGreaterThan(1));
    await new Promise((r) => setTimeout(r, 100));

    const snapshot = lastIdentity(snapshots);
    // Contradictions detected on all three mismatched fields → demoted to unset-default.
    expect(snapshot.oilIdentity!.brand).toBe("unset-default"); // demoted
    expect(snapshot.oilIdentity!.isoGrade).toBe("unset-default"); // demoted
    expect(snapshot.oilIdentity!.assetType).toBe("unset-default"); // demoted
    expect(snapshot.oilIdentity!.confirmed).toBe(false);

    // Contradictions surfaced in DOM.
    await openIdentity();
    const contraText = screen.getAllByText(/⚠/);
    expect(contraText.length).toBeGreaterThan(0);

    // Baseline NOT attached — unconfirmed identity routes through existing
    // "no baseline is invented" withhold, no variance computed against Mobil DTE 25.
    expect(snapshot.oilIdentity!.confirmed).toBe(false);

    // DOM surfaces the specific mismatches.
    const body = document.body.textContent ?? "";
    expect(body).toMatch(/conflict|contradict|conflicts/i);
  });

  it("extracted-high-confidence identity: provenance recorded for extracted fields", async () => {
    vi.stubGlobal("URL", {
      ...(globalThis as unknown as { URL: typeof URL }).URL,
      createObjectURL: vi.fn(() => "mock-url")
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          technology: "OIL",
          data: {
            header: {
              lubricantBrand: "Mobil DTE 25",
              lubricantGrade: "ISO VG 46",
              assetDescription: null,
              rawNotes: null
            },
            metals: {},
            fluidProperties: {},
            operatingParams: {},
            confidenceScore: 95,
            sourceFileName: "report.png"
          } as any
        })
      }) as unknown as Response)
    );
    vi.stubGlobal("FileReader", class {
      result = "data:image/png;base64,mock";
      onload: ((ev: Event) => void) | null = null;
      readAsDataURL() {
        setTimeout(() => this.onload?.(new Event("load") as any), 0);
      }
      abort() {}
    } as any);

    const snapshots: OilLabSnapshot[] = [];
    render(<OilInputAccordions onSnapshotChange={(s) => snapshots.push(s)} />);

    await waitFor(() => expect(snapshots.length).toBeGreaterThan(0));

    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: [new File([""], "report.png", { type: "image/png" })]
      }
    });

    await waitFor(() => expect(snapshots.length).toBeGreaterThan(1));
    await new Promise((r) => setTimeout(r, 100));

    const snapshot = lastIdentity(snapshots);
    // High-confidence extraction → extracted-high-confidence for brand/grade.
    expect(snapshot.oilIdentity!.brand).toBe("extracted-high-confidence");
    expect(snapshot.oilIdentity!.isoGrade).toBe("extracted-high-confidence");
    // Asset type / base chemistry never extracted → still unset-default.
    expect(snapshot.oilIdentity!.assetType).toBe("unset-default");
    expect(snapshot.oilIdentity!.baseChemistry).toBe("unset-default");
    // Not all confirmed → baseline withheld.
    expect(snapshot.oilIdentity!.confirmed).toBe(false);
  });

  it("unconfirmed state reuses existing no-baseline withhold wording (no parallel gate)", async () => {
    const snapshots: OilLabSnapshot[] = [];
    render(<OilInputAccordions onSnapshotChange={(s) => snapshots.push(s)} />);

    await waitFor(() => expect(snapshots.length).toBeGreaterThan(0));

    await openIdentity();

    const snapshot = lastIdentity(snapshots);
    // When identity is unconfirmed, oilIdentity.confirmed is false — the
    // persistence layer will store NULL baselines, and the read-side
    // wearMetalLimitDisplay / OilWearMetalsTab "no baseline is invented"
    // path withholds delta/rate/slope. No parallel gate is introduced.
    expect(snapshot.oilIdentity!.confirmed).toBe(false);

    // The baseline-attached note reflects the withhold.
    expect(
      screen.getByText(/baseline withheld until identity is confirmed/i)
    ).toBeTruthy();
  });
});
