// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn()
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: ""
}));

import TrendAnalyzer from "./TrendAnalyzer";
import {
  saveEquipmentStore,
  type EquipmentStore
} from "../data/equipmentDb";

const equipmentStore: EquipmentStore = {
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
                ratedRpm: "1800",
                bearingDe: "SKF 6205",
                isoClass: "Class II"
              }
            }
          ]
        }
      ]
    }
  ]
};

function jsonResponse(data: unknown) {
  return {
    ok: true,
    json: async () => data
  } as Response;
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let fetchCalls: string[] = [];

beforeEach(() => {
  localStorage.clear();
  fetchCalls = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  saveEquipmentStore(equipmentStore);
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url.startsWith("/api/tenant-settings")) return jsonResponse({});
      if (url.startsWith("/api/analysis-results")) {
        return jsonResponse({ results: [] });
      }
      return jsonResponse({});
    })
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function assertSelectorBeneathCards() {
  const cards = screen.getByTestId("trend-tech-cards");
  const selector = screen.getByTestId("trend-equipment-selector");
  expect(screen.getAllByTestId("trend-equipment-selector")).toHaveLength(1);
  expect(
    cards.compareDocumentPosition(selector) & Node.DOCUMENT_POSITION_FOLLOWING
  ).not.toBe(0);
  return { cards, selector };
}

describe("SLICE-Z selector sits beneath the technology cards", () => {
  it("renders one selector after the cards and keeps it on every technology view", async () => {
    render(<TrendAnalyzer selectedAssetId="asset-1" />);
    await screen.findByTestId("trend-tech-cards");

    const { cards } = assertSelectorBeneathCards();
    const techButtons = within(cards).getAllByRole("button");
    expect(techButtons).toHaveLength(5);

    for (const button of techButtons) {
      fireEvent.click(button);
      assertSelectorBeneathCards();
    }
  });

  it("still drives the analysis fetch from the shell selection state", async () => {
    render(<TrendAnalyzer selectedAssetId="asset-1" />);
    await screen.findByTestId("trend-tech-cards");

    await waitFor(() => {
      expect(
        fetchCalls.some(
          (url) =>
            url.startsWith("/api/analysis-results") &&
            url.includes("asset_id=M-101")
        )
      ).toBe(true);
    });

    const { selector } = assertSelectorBeneathCards();
    const selects = within(selector).getAllByRole("combobox");
    fireEvent.change(selects[2], { target: { value: "Motor DE" } });

    await waitFor(() => {
      expect(
        fetchCalls.some(
          (url) =>
            url.startsWith("/api/analysis-results") &&
            url.includes("component=Motor")
        )
      ).toBe(true);
    });

    assertSelectorBeneathCards();
  });
});
