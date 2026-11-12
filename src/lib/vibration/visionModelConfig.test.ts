import { describe, expect, it } from "vitest";
import {
  LEGACY_VISION_CHAIN,
  VISION_MODEL_CONFIG,
  resolveLegacyVisionChain
} from "./visionModelConfig";

describe("VS-3 legacy vision chain", () => {
  it("serves Gemini primary -> Mistral -> OpenAI fallback -> OpenRouter LAST", () => {
    expect(LEGACY_VISION_CHAIN.map((provider) => provider.id)).toEqual([
      "gemini",
      "mistral",
      "openai",
      "openrouter"
    ]);
    expect(LEGACY_VISION_CHAIN.map((provider) => provider.model)).toEqual([
      "gemini-3.5-flash",
      "pixtral-12b-2409",
      "gpt-4o-mini",
      "openai/gpt-4o"
    ]);
    expect(LEGACY_VISION_CHAIN[LEGACY_VISION_CHAIN.length - 1]?.id).toBe(
      "openrouter"
    );
  });

  it("exposes Gemini as the config primary and gpt-4o-mini as fallback", () => {
    expect(VISION_MODEL_CONFIG.model).toBe("gemini-3.5-flash");
    expect(VISION_MODEL_CONFIG.fallbackModel).toBe("gpt-4o-mini");
    expect(VISION_MODEL_CONFIG.chain).toBe(LEGACY_VISION_CHAIN);
  });

  it("never promotes OpenRouter even when a caller requests it first", () => {
    expect(
      resolveLegacyVisionChain(["openai/gpt-4o"]).map((provider) => provider.id)
    ).toEqual(["gemini", "mistral", "openai", "openrouter"]);
    expect(
      resolveLegacyVisionChain(["gpt-4o-mini", "gemini-3.5-flash"]).map(
        (provider) => provider.id
      )
    ).toEqual(["gemini", "openai", "openrouter"]);
  });
});
