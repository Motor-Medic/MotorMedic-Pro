import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CONSENSUS_TEXT_CHAIN,
  CONSENSUS_VISION_CHAIN,
  CONSENSUS_WITHHELD_PROVIDERS,
  ConsensusCascadeExhaustedError,
  ConsensusProvenanceRecorder,
  consensusCascadeReadiness,
  deriveConsensusMode,
  describeCascadeFailure,
  describeConsensusSkips,
  listConsensusSkips,
  type ConsensusAttemptRecord,
  type ConsensusProviderSpec,
  type ConsensusSkipRecord
} from "./consensusCascade";

const ENV_KEYS = [
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "DASHSCOPE_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY"
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function clearKeys(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

const chainIds = (chain: readonly ConsensusProviderSpec[]): string[] =>
  chain.map((spec) => spec.id);

describe("consensus cascade chains (AR-25 probe-verified ordering)", () => {
  it("keeps OpenRouter LAST in both vision and text chains", () => {
    expect(chainIds(CONSENSUS_VISION_CHAIN)).toEqual([
      "gemini",
      "mistral",
      "openai",
      "openrouter"
    ]);
    expect(chainIds(CONSENSUS_TEXT_CHAIN)).toEqual([
      "gemini",
      "groq",
      "mistral",
      "openai",
      "openrouter"
    ]);
    expect(
      CONSENSUS_VISION_CHAIN[CONSENSUS_VISION_CHAIN.length - 1]?.id
    ).toBe("openrouter");
    expect(
      CONSENSUS_TEXT_CHAIN[CONSENSUS_TEXT_CHAIN.length - 1]?.id
    ).toBe("openrouter");
  });

  it("uses only strict-200 probe-verified model ids", () => {
    const visionModels = CONSENSUS_VISION_CHAIN.flatMap((s) => [...s.models]);
    const textModels = CONSENSUS_TEXT_CHAIN.flatMap((s) => [...s.models]);
    expect(visionModels).toContain("gemini-3.5-flash");
    expect(visionModels).toContain("pixtral-12b-2409");
    expect(visionModels).toContain("gpt-4o-mini");
    expect(textModels).toContain("openai/gpt-oss-120b");
    expect(textModels).toContain("open-mistral-nemo");
    expect(visionModels).not.toContain("gemini-flash-latest");
    expect(textModels).not.toContain("llama-3.3-70b-versatile");
    expect(textModels).not.toContain("mistral-small-latest");
  });

  it("withholds DashScope with the honest 401 probe skip, never as a chain entry", () => {
    expect(CONSENSUS_WITHHELD_PROVIDERS).toHaveLength(1);
    const withheld = CONSENSUS_WITHHELD_PROVIDERS[0];
    expect(withheld?.id).toBe("dashscope");
    expect(withheld?.probeStatus).toBe(401);
    const allChainIds = [
      ...chainIds(CONSENSUS_VISION_CHAIN),
      ...chainIds(CONSENSUS_TEXT_CHAIN)
    ];
    expect(allChainIds).not.toContain("dashscope");
  });
});

describe("describeCascadeFailure — honest per-provider surfacing", () => {
  const timeoutAttempt: ConsensusAttemptRecord = {
    providerId: "openai",
    providerLabel: "OpenAI",
    model: "gpt-4o-mini",
    httpStatus: null,
    ok: false,
    reason: "timed out after 55000ms"
  };
  const attempts: ConsensusAttemptRecord[] = [
    {
      providerId: "gemini",
      providerLabel: "Gemini",
      model: "gemini-3.5-flash",
      httpStatus: 401,
      ok: false,
      reason: "API key not valid (INVALID_ARGUMENT)"
    },
    {
      providerId: "groq",
      providerLabel: "Groq",
      model: "openai/gpt-oss-120b",
      httpStatus: 402,
      ok: false,
      reason: "insufficient credits (insufficient_quota)"
    },
    timeoutAttempt
  ];
  const skips: ConsensusSkipRecord[] = [
    {
      providerId: "dashscope",
      providerLabel: "DashScope",
      envKey: "DASHSCOPE_API_KEY",
      reason: "withheld",
      detail: "probe 401: invalid_api_key on intl + CN host variants during AR-25 Phase 1 probe"
    }
  ];

  it("formats real HTTP codes with provider labels and model ids", () => {
    const text = describeCascadeFailure(attempts, skips);
    expect(text).toContain("Gemini 401");
    expect(text).toContain("Groq 402");
    expect(text).toContain("gemini-3.5-flash");
    expect(text).toContain("openai/gpt-oss-120b");
    expect(text).toContain("DashScope skipped (probe 401");
    expect(text).not.toContain("GATEWAY_TIMEOUT");
  });

  it("formats null-status attempts as no-response with the reason", () => {
    const text = describeCascadeFailure([timeoutAttempt], []);
    expect(text).toContain("OpenAI no response (timed out after 55000ms)");
    expect(text).toContain("[gpt-4o-mini]");
  });

  it("returns a stable fallback when nothing was attempted", () => {
    expect(describeCascadeFailure([], [])).toBe(
      "no consensus providers attempted"
    );
  });

  it("ConsensusCascadeExhaustedError carries attempts and codes in the message", () => {
    const err = new ConsensusCascadeExhaustedError(attempts, skips);
    expect(err.name).toBe("ConsensusCascadeExhaustedError");
    expect(err.attempts).toHaveLength(3);
    expect(err.skips).toHaveLength(1);
    expect(err.message).toContain("All consensus providers failed:");
    expect(err.message).toContain("Gemini 401");
    expect(err.message).toContain("Groq 402");
  });
});

describe("key gating and withheld skip records", () => {
  it("listConsensusSkips reports every missing key plus the withheld DashScope 401", () => {
    clearKeys();
    const skips = listConsensusSkips(CONSENSUS_TEXT_CHAIN);
    const missing = skips.filter((s) => s.reason === "missing-key");
    expect(missing.map((s) => s.envKey).sort()).toEqual([
      "GEMINI_API_KEY",
      "GROQ_API_KEY",
      "MISTRAL_API_KEY",
      "OPENAI_API_KEY",
      "OPENROUTER_API_KEY"
    ]);
    const withheld = skips.find((s) => s.reason === "withheld");
    expect(withheld?.providerLabel).toBe("DashScope");
    expect(withheld?.detail).toContain("probe 401");
    expect(describeConsensusSkips(skips)).toContain(
      "DashScope skipped (probe 401"
    );
  });

  it("consensusCascadeReadiness is false with no keys and true with any key", () => {
    clearKeys();
    const cold = consensusCascadeReadiness();
    expect(cold.ready).toBe(false);
    expect(cold.skips.some((s) => s.reason === "missing-key")).toBe(true);
    expect(cold.skips.some((s) => s.reason === "withheld")).toBe(true);

    process.env.GEMINI_API_KEY = "test-key";
    const warm = consensusCascadeReadiness();
    expect(warm.ready).toBe(true);
    expect(warm.skips.some((s) => s.envKey === "GEMINI_API_KEY")).toBe(false);
  });
});

describe("deriveConsensusMode — rule 9 degraded tagging", () => {
  it("tags multi-model only with >=2 distinct synthesis models and both agents answering", () => {
    expect(
      deriveConsensusMode(
        ["Gemini/gemini-3.5-flash", "Groq/openai/gpt-oss-120b"],
        true,
        true
      )
    ).toBe("multi-model");
  });

  it("tags single-model-degraded when the same model answered both synthesis stages", () => {
    expect(
      deriveConsensusMode(
        ["Gemini/gemini-3.5-flash", "Gemini/gemini-3.5-flash"],
        true,
        true
      )
    ).toBe("single-model-degraded");
  });

  it("tags single-model-degraded when only one model or one agent answered", () => {
    expect(deriveConsensusMode(["Gemini/gemini-3.5-flash"], true, true)).toBe(
      "single-model-degraded"
    );
    expect(
      deriveConsensusMode(
        ["Gemini/gemini-3.5-flash", "Groq/openai/gpt-oss-120b"],
        false,
        true
      )
    ).toBe("single-model-degraded");
  });
});

describe("ConsensusProvenanceRecorder", () => {
  it("separates answering models from synthesis models (stage1 excluded)", () => {
    const recorder = new ConsensusProvenanceRecorder();
    recorder.record("stage1", "Gemini", "gemini-3.5-flash");
    recorder.record("stage2a", "Groq", "openai/gpt-oss-120b");
    recorder.record("stage2b", "Groq", "openai/gpt-oss-120b");
    recorder.record("stage3", "Groq", "openai/gpt-oss-120b");
    expect(recorder.answeringModels()).toEqual([
      "Gemini/gemini-3.5-flash",
      "Groq/openai/gpt-oss-120b"
    ]);
    expect(recorder.synthesisModels()).toEqual([
      "Groq/openai/gpt-oss-120b"
    ]);
  });

  it("exposes distinct synthesis models for the multi-model tag", () => {
    const recorder = new ConsensusProvenanceRecorder();
    recorder.record("stage1", "Gemini", "gemini-3.5-flash");
    recorder.record("stage2a", "Gemini", "gemini-3.5-flash");
    recorder.record("stage2b", "Groq", "openai/gpt-oss-120b");
    recorder.record("stage3", "Mistral", "open-mistral-nemo");
    const synthesis = recorder.synthesisModels();
    expect(synthesis).toHaveLength(3);
    expect(deriveConsensusMode(synthesis, true, true)).toBe("multi-model");
  });
});
