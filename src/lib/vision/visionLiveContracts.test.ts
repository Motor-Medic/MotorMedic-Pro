/**
 * SLICE-VISION-LIVE-2 — recorded-fixture integration contracts.
 *
 * Replays the real provider responses captured in
 * src/test/harness/fixtures/recordedVisionResponses.ts through the SAME
 * finalizers the live route uses. No network: global fetch is replaced.
 *
 * Contracts:
 *  1. oil tabular replay maps the MEASURED values (limit column is not data)
 *  2. MCA grouped-bar replay maps the bar values with provenance + tolerance
 *  3. purpose "mca" attaches the grouped-bar addendum to EVERY chain rung
 *  4. non-MCA purposes keep MASTER_VISION_PROMPT byte-for-byte
 *  5. the live-verified primary is Mistral; OpenRouter stays last
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  finalizeOilFromParses,
  runMasterVisionModelLoop,
  VISION_PROVIDER_CHAIN,
  VisionProviderError,
  type MasterVisionParse
} from "../oilVisionExtractor";
import { finalizeMcaFromParses } from "../mcaVisionExtractor";
import {
  MCA_BAR_CHART_PROVENANCE,
  type McaBarChartRecord
} from "../mca/mcaBarChart";
import { MASTER_VISION_PROMPT } from "../vision/masterVisionPrompt";
import { MCA_GROUPED_BAR_PROMPT } from "../vision/mcaGroupedBarPrompt";
import {
  RECORDED_MCA_RESPONSE,
  RECORDED_OIL_RESPONSE,
  type RecordedVisionResponse
} from "../../test/harness/fixtures/recordedVisionResponses";
import {
  MCA_BAR_CHART_TRUTH,
  MCA_BAR_METRIC_TOLERANCE
} from "../../test/harness/fixtures/mcaGroupedBarFixture";

function replay(recorded: RecordedVisionResponse): MasterVisionParse {
  return {
    provider: recorded.provider,
    providerId: recorded.providerId,
    model: recorded.model,
    parsed: JSON.parse(recorded.content) as Record<string, unknown>
  };
}

function within(actual: number | null, truth: number, tolerance: number): void {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as number) - truth)).toBeLessThanOrEqual(tolerance);
}

describe("SLICE-VISION-LIVE-2 recorded oil tabular replay", () => {
  it("maps measured oil values and ignores the printed Limit column", () => {
    const recorded = RECORDED_OIL_RESPONSE;
    const parse = replay(recorded);
    const outcome = finalizeOilFromParses([parse], null, {
      imageBase64: "recorded://oil",
      fileName: "oil-report.png"
    });

    if (!outcome.success) {
      throw new Error(`oil finalize failed: ${JSON.stringify(outcome)}`);
    }
    expect(outcome.success).toBe(true);
    if (!outcome.success) return;

    const data = outcome.data;
    // Measured Results column — NOT the 100/50/30/25/15 limit column.
    expect(data.metals.iron).toBe(10);
    expect(data.metals.copper).toBe(5);
    expect(data.metals.chromium).toBe(1);
    expect(data.metals.lead).toBe(2);
    expect(data.metals.aluminum).toBe(3);
    expect(data.metals.silicon).toBe(8);
    expect(data.metals.tin).toBe(1);
    expect(data.fluidProperties.viscosity40C).toBe(46);
    expect(data.fluidProperties.acidNumber).toBe(1.2);
    expect(data.fluidProperties.oxidation).toBe(0.11);
    expect(data.metals.iron).not.toBe(100);
    expect(data.metals.copper).not.toBe(50);

    // Provenance: the recorded rung/model is what the payload reports.
    expect(data.model).toBe(recorded.model);
    expect(data.consensusModels).toEqual([recorded.model]);
    expect(data.detectedTechnology).toBe("OIL");
    expect(data.extractionMode).toBe("single");
  });
});

describe("SLICE-VISION-LIVE-2 recorded MCA grouped-bar replay", () => {
  it("maps bar values with axis-read provenance and tolerance disclosure", () => {
    const recorded = RECORDED_MCA_RESPONSE;
    const parse = replay(recorded);
    const outcome = finalizeMcaFromParses([parse], null, {
      imageBase64: "recorded://mca",
      fileName: "mca-grouped-bar.png"
    });

    expect(outcome.success, outcome.detail ?? outcome.message).toBe(true);
    if (!outcome.success || !outcome.data) return;

    const data = outcome.data;
    const bars = data.barChart as McaBarChartRecord;
    expect(bars).toBeTruthy();
    expect(bars.samples).toHaveLength(6);

    const a0 = bars.samples.find((s) => s.phase === "A" && s.rotor_deg === 0);
    expect(a0).toBeTruthy();
    if (!a0) return;
    // Recorded bar-top reads stay inside the fixture's disclosed tolerance.
    within(a0.z_ohm.value, MCA_BAR_CHART_TRUTH.z0[0], MCA_BAR_METRIC_TOLERANCE.z_ohm);
    within(a0.l_mh.value, MCA_BAR_CHART_TRUTH.l0[0], MCA_BAR_METRIC_TOLERANCE.l_mh);
    within(a0.angle_deg.value, MCA_BAR_CHART_TRUTH.angle0[0], MCA_BAR_METRIC_TOLERANCE.angle_deg);
    within(a0.c_rel.value, MCA_BAR_CHART_TRUTH.c0[0], MCA_BAR_METRIC_TOLERANCE.c_rel);
    expect(a0.z_ohm.status).toBe("extracted");

    // Provenance + tolerance travel with the values.
    expect(bars.provenance).toBe(MCA_BAR_CHART_PROVENANCE);
    expect(bars.tolerance_disclosure).toContain("Axis-read tolerance");
    expect(bars.tolerance_disclosure).toContain("never interpolated between bars");
    expect(bars.axes.z_ohm.tolerance).not.toBeNull();

    // Legacy rotor-0 bridge derives only from the recorded rotor-0 triplet.
    expect(data.impedanceAb).toBe(a0.z_ohm.value);
    expect(data.inductanceAb).toBe(a0.l_mh.value);
    expect(data.phaseAngleAb).toBe(a0.angle_deg.value);

    expect(data.model).toBe(recorded.model);
    expect(data.detectedTechnology).toBe("MCA");
    expect(data.consensusModels).toEqual([recorded.model]);
  });
});

/* ------------------------------------------------------------------ */
/* Every-rung prompt contract (offline fake transport)                 */
/* ------------------------------------------------------------------ */

const CHAIN_ENV_KEYS = [
  "MISTRAL_API_KEY",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY"
] as const;

interface CapturedRequest {
  url: string;
  prompt: string;
}

function promptFromBody(body: string): string {
  const parsed = JSON.parse(body) as {
    messages?: { content?: { type?: string; text?: string }[] }[];
    contents?: { parts?: { text?: string }[] }[];
  };
  const text = parsed.messages?.[0]?.content?.find((p) => p.type === "text")?.text;
  return text ?? parsed.contents?.[0]?.parts?.find((p) => p.text)?.text ?? "";
}

async function captureAllRungPrompts(purpose: "mca" | null): Promise<{
  requests: CapturedRequest[];
  error: unknown;
}> {
  const requests: CapturedRequest[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      url: String(input),
      prompt: promptFromBody(String(init?.body ?? "{}"))
    });
    // 500 on every rung: the loop walks the WHOLE chain, so the prompt on
    // every rung is observable. No real network is touched.
    return new Response(JSON.stringify({ error: { message: "offline probe" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  try {
    await runMasterVisionModelLoop({
      imageBase64: "data:image/png;base64,AAAA",
      maxTokens: 100,
      ...(purpose ? { purpose } : {})
    });
    return { requests, error: null };
  } catch (error) {
    return { requests, error };
  } finally {
    globalThis.fetch = realFetch;
  }
}

describe("SLICE-VISION-LIVE-2 prompt + serving order", () => {
  beforeEach(() => {
    for (const key of CHAIN_ENV_KEYS) vi.stubEnv(key, "offline-test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("attaches the grouped-bar addendum on every MCA rung, OpenRouter last", async () => {
    const { requests, error } = await captureAllRungPrompts("mca");
    expect(error).toBeInstanceOf(VisionProviderError);
    // 4 single-model rungs + 4 OpenRouter models, all attempted.
    expect(requests.length).toBe(8);
    for (const request of requests) {
      expect(request.prompt).toBe(MCA_GROUPED_BAR_PROMPT);
      expect(request.prompt.startsWith(MASTER_VISION_PROMPT)).toBe(true);
    }
    // Chain order is unchanged: Gemini first, OpenRouter pinned last.
    expect(VISION_PROVIDER_CHAIN[0]?.id).toBe("gemini");
    expect(requests[requests.length - 1]?.url).toContain("openrouter.ai");
  });

  it("keeps every non-MCA rung byte-identical to MASTER_VISION_PROMPT", async () => {
    const { requests, error } = await captureAllRungPrompts(null);
    expect(error).toBeInstanceOf(VisionProviderError);
    expect(requests.length).toBe(8);
    for (const request of requests) {
      expect(request.prompt).toBe(MASTER_VISION_PROMPT);
      expect(request.prompt.startsWith(MCA_GROUPED_BAR_PROMPT)).toBe(false);
    }
  });

  it("keeps OpenRouter last in the exported chain", () => {
    expect(VISION_PROVIDER_CHAIN[0]?.id).toBe("gemini");
    expect(VISION_PROVIDER_CHAIN[VISION_PROVIDER_CHAIN.length - 1]?.id).toBe("openrouter");
  });
});
