// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AddOilSampleModal from "./AddOilSampleModal";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true })
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

async function openManual(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Manual Entry" }));
}

function savedBody(): Record<string, unknown> {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const init = fetchMock.mock.calls[0][1] as { body?: string };
  expect(init.body).toBeTruthy();
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe("AddOilSampleModal SLICE-AO section 5", () => {
  it("saves section 5 numeric values and operator morphology", async () => {
    render(
      <AddOilSampleModal
        isOpen
        assetId="asset-1"
        onClose={() => {}}
        onSampleSaved={() => {}}
      />
    );
    await openManual();

    expect(screen.getByText(/5\. Ferrography & Varnish/)).toBeTruthy();
    expect(screen.getByText(/Operator Observation/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/MPC/), {
      target: { value: "28.4" }
    });
    fireEvent.change(screen.getByLabelText(/RULER/), {
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

    fireEvent.click(screen.getByRole("button", { name: "Save Sample" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const body = savedBody();
    expect(body).toMatchObject({
      assetId: "asset-1",
      mpcDeltaE: 28.4,
      rulerPercent: 42,
      drLarge: 12.5,
      drSmall: 4.2
    });
    expect(body.morphology).toEqual({ cutting: "moderate" });
    expect(body).not.toHaveProperty("ucRating");
  });

  it("does not coerce blank section 5 fields to zero", async () => {
    render(
      <AddOilSampleModal
        isOpen
        assetId="asset-1"
        onClose={() => {}}
        onSampleSaved={() => {}}
      />
    );
    await openManual();

    fireEvent.change(screen.getByLabelText(/Iron/), {
      target: { value: "12" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Sample" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const body = savedBody();
    expect(body.iron).toBe(12);
    expect(body).not.toHaveProperty("mpcDeltaE");
    expect(body).not.toHaveProperty("rulerPercent");
    expect(body).not.toHaveProperty("drLarge");
    expect(body).not.toHaveProperty("drSmall");
    expect(body).not.toHaveProperty("ucRating");
    expect(body).not.toHaveProperty("morphology");
  });
});
