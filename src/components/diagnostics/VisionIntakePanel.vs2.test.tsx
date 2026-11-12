// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import VisionIntakePanel, {
  type VisionIntakePanelProps
} from "./VisionIntakePanel";

afterEach(cleanup);

function renderPanel(overrides: Partial<VisionIntakePanelProps> = {}) {
  const props: VisionIntakePanelProps = {
    spectrumUpload: null,
    thermalUpload: null,
    rawUpload: null,
    spectrumRef: React.createRef<HTMLInputElement>(),
    thermalRef: React.createRef<HTMLInputElement>(),
    rawRef: React.createRef<HTMLInputElement>(),
    ingestSpectrumUpload: vi.fn(),
    ingestUpload: vi.fn(),
    setThermalUpload: vi.fn(),
    setRawUpload: vi.fn(),
    vibrationExtractStatus: "extracting",
    vibrationExtractError: null,
    vibrationExtractSummary: null,
    currentMessageIndex: 0,
    AI_LOADING_MESSAGES: ["Uploading diagnostic image..."],
    ...overrides
  };
  return render(<VisionIntakePanel {...props} />);
}

describe("SLICE-VS2 VisionIntakePanel", () => {
  it("shows stage + elapsed after 10s and aborts via Cancel", () => {
    const onCancelExtraction = vi.fn();
    renderPanel({
      extractionStatusLabel: "Vision extraction — 12s elapsed",
      onCancelExtraction
    });

    expect(screen.getAllByText(/Vision extraction — 12s elapsed/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);
    expect(onCancelExtraction).toHaveBeenCalledTimes(1);
  });

  it("offers Retry after a factual deadline failure", () => {
    const onRetryExtraction = vi.fn();
    renderPanel({
      vibrationExtractStatus: "failed",
      vibrationExtractError: "Upstream did not respond in 60s. No result was received.",
      onRetryExtraction
    });

    expect(screen.getByText(/did not respond in 60s/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryExtraction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/too complex|clearer image/i)).toBeNull();
  });
});
