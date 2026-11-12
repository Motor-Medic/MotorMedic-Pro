import { describe, expect, it, vi } from "vitest";
import { probeAiBootHealth } from "./aiBootHealth";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("VS-3 truthful AI boot health", () => {
  it("reports INVALID(key) for a present-but-rejected key (no presence-only OK)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, { error: { message: "invalid api key" } })
    ) as unknown as typeof fetch;

    const reports = await probeAiBootHealth({
      env: { GEMINI_API_KEY: "bad-key" },
      fetchImpl
    });
    const gemini = reports.find((report) => report.id === "gemini");

    expect(gemini?.status).toBe("INVALID(key)");
    expect(gemini?.httpStatus).toBe(401);
    expect(gemini?.detail).toContain("401");
  });

  it("reports VALID for a stubbed good key", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { data: [] })
    ) as unknown as typeof fetch;

    const reports = await probeAiBootHealth({
      env: { GEMINI_API_KEY: "good-key" },
      fetchImpl
    });
    const gemini = reports.find((report) => report.id === "gemini");

    expect(gemini?.status).toBe("VALID");
    expect(gemini?.httpStatus).toBe(200);
  });

  it("reports CREDITS(402) when OpenRouter credits are exhausted", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        data: { total_credits: 15, total_usage: 15.198 }
      })
    ) as unknown as typeof fetch;

    const reports = await probeAiBootHealth({
      env: { OPENROUTER_API_KEY: "creditless-key" },
      fetchImpl
    });
    const openrouter = reports.find((report) => report.id === "openrouter");

    expect(openrouter?.status).toBe("CREDITS(402)");
    expect(openrouter?.detail).toContain("used 15.198 of 15");
  });

  it("reports Anthropic as UNUSED(not in chain) without a network call", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {})
    ) as unknown as typeof fetch;

    const reports = await probeAiBootHealth({
      env: { ANTHROPIC_API_KEY: "present-but-unused" },
      fetchImpl
    });
    const anthropic = reports.find((report) => report.id === "anthropic");

    expect(anthropic?.status).toBe("UNUSED(not in chain)");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
