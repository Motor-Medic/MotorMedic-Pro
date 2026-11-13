// @vitest-environment jsdom
/**
 * Slice VS9 — render substitute for the manual three-state MCA check (state
 * browser limitation): online / de-energized static / de-energized dynamic
 * mode separation of Section 3 (Online PQ vs Phase-to-Phase) and Section 4
 * (Insulation — de-energized only), plus the onlinePq snapshot emission.
 */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import McaInputAccordions from "./McaInputAccordions";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn()
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: ""
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderAccordions(
  onSnapshotChange?: (snapshot: Record<string, unknown>) => void
) {
  render(
    <McaInputAccordions
      onSnapshotChange={
        onSnapshotChange as unknown as React.ComponentProps<
          typeof McaInputAccordions
        >["onSnapshotChange"]
      }
    />
  );
}

function openSection(title: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: title }));
}

/** All accordions start collapsed; the mode cards live in Section 2. */
function openConfig() {
  fireEvent.click(screen.getByText("2. Test Configuration & Baseline"));
}

function setMode(label: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("VS9 render — three-state mode separation (jsdom substitute)", () => {
  it("online mode shows Online PQ inputs and replaces the de-energized insulation section with a disclosure", () => {
    renderAccordions();
    openConfig();
    setMode(/Energized \(Online\)/);
    openSection(/3\. High-Fidelity Data Ingestion/);
    openSection(/4\. Insulation to Ground/);

    expect(screen.getByText("Voltage Unbalance (%)")).toBeTruthy();
    expect(screen.getByText("Power Factor (Cos Φ)")).toBeTruthy();
    expect(
      screen.getByText(/no offline threshold is applied to these online values/i)
    ).toBeTruthy();

    // Section 4 in online mode: disclosure instead of Megger inputs.
    expect(
      screen.getByText(/it cannot be taken while the motor is energized/i)
    ).toBeTruthy();
    expect(
      screen.getByText(/No insulation data is collected in online mode/i)
    ).toBeTruthy();
    expect(screen.queryByText("Megohms (MΩ) @ Test Voltage")).toBeNull();
  });

  it("de-energized static mode shows the Megger inputs and the offline phase bridge", () => {
    renderAccordions();
    openConfig();
    setMode(/De-Energized \(Static\)/);
    openSection(/3\. High-Fidelity Data Ingestion/);
    openSection(/4\. Insulation to Ground/);

    expect(screen.getByText("Megohms (MΩ) @ Test Voltage")).toBeTruthy();
    expect(screen.queryByText("Voltage Unbalance (%)")).toBeNull();
    expect(
      screen.queryByText(/it cannot be taken while the motor is energized/i)
    ).toBeNull();
  });

  it("de-energized dynamic mode keeps Megger inputs and adds the rotation capture", () => {
    renderAccordions();
    openConfig();
    setMode(/De-Energized \(Dynamic\)/);
    openSection(/3\. High-Fidelity Data Ingestion/);
    openSection(/4\. Insulation to Ground/);

    expect(screen.getByText(/Dynamic Mode: Continuous waveform capture active/i)).toBeTruthy();
    expect(screen.getByText("Megohms (MΩ) @ Test Voltage")).toBeTruthy();
    expect(screen.queryByText("Voltage Unbalance (%)")).toBeNull();
  });

  it("online mode emits onlinePq in the operator snapshot; static does not", () => {
    const snapshots: Record<string, unknown>[] = [];
    renderAccordions((snapshot) => snapshots.push(snapshot));

    openConfig();
    setMode(/Energized \(Online\)/);
    openSection(/3\. High-Fidelity Data Ingestion/);
    const vu = screen.getByLabelText("Voltage Unbalance (%)") as HTMLInputElement;
    fireEvent.change(vu, { target: { value: "2.1" } });

    const online = snapshots[snapshots.length - 1];
    expect(online.mode).toBe("online");
    const onlinePq = online.onlinePq as Record<string, unknown>;
    expect(onlinePq.voltageUnbalancePct).toBe(2.1);

    setMode(/De-Energized \(Static\)/);
    const offline = snapshots[snapshots.length - 1];
    expect(offline.mode).toBe("static");
    expect(offline).not.toHaveProperty("onlinePq");
  });
});
