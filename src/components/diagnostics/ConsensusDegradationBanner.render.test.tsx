// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ConsensusDegradationBanner from "./ConsensusDegradationBanner";

afterEach(() => cleanup());

describe("VS-3 consensus degradation banner", () => {
  it("renders the engine's degraded status with the only responding provider", () => {
    render(
      <ConsensusDegradationBanner
        details={{
          consensusMode: "single-model-degraded",
          answeringModels: ["Gemini/gemini-3.5-flash"]
        }}
      />
    );

    const banner = screen.getByTestId("consensus-degradation-banner");
    expect(banner.textContent).toContain(
      "Consensus degraded: only Gemini responded"
    );
  });

  it("renders nothing for a multi-model run", () => {
    render(
      <ConsensusDegradationBanner
        details={{
          consensusMode: "multi-model",
          answeringModels: [
            "Gemini/gemini-3.5-flash",
            "Groq/openai/gpt-oss-120b"
          ]
        }}
      />
    );

    expect(screen.queryByTestId("consensus-degradation-banner")).toBeNull();
  });
});
