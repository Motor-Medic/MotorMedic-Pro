import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ClientCancelledError,
  ClientDeadlineError,
  CONSENSUS_TIMEOUT_MS,
  EXTRACTION_ELAPSED_REVEAL_SEC,
  VISION_EXTRACTION_TIMEOUT_MS,
  buildClientDeadlineMessage,
  formatRunStatus,
  withDeadline
} from "./clientDeadline";

function stalledTask() {
  return vi.fn(
    (signal: AbortSignal) =>
      new Promise<never>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          },
          { once: true }
        );
      })
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("SLICE-VS2 client deadline", () => {
  it("aborts a stalled fetch at the 60s deadline and names elapsed seconds", async () => {
    vi.useFakeTimers();
    const task = stalledTask();
    const promise = withDeadline(task, { timeoutMs: VISION_EXTRACTION_TIMEOUT_MS });
    const assertion = expect(promise).rejects.toBeInstanceOf(ClientDeadlineError);

    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;

    await expect(promise).rejects.toMatchObject({
      name: "ClientDeadlineError",
      elapsedMs: 60_000,
      timeoutMs: 60_000
    });
    await expect(promise).rejects.toThrow(/did not respond in 60s/);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("turns an operator abort into ClientCancelledError, not a timeout", async () => {
    const task = stalledTask();
    const external = new AbortController();
    const promise = withDeadline(task, {
      timeoutMs: CONSENSUS_TIMEOUT_MS,
      externalSignal: external.signal
    });
    const assertion = expect(promise).rejects.toBeInstanceOf(ClientCancelledError);

    external.abort();
    await assertion;
  });

  it("rejects immediately when the caller's signal is already aborted", async () => {
    const external = new AbortController();
    external.abort();
    await expect(
      withDeadline(stalledTask(), { externalSignal: external.signal })
    ).rejects.toBeInstanceOf(ClientCancelledError);
  });

  it("propagates an ordinary upstream error unchanged", async () => {
    await expect(
      withDeadline(async () => {
        throw new Error("HTTP 503");
      })
    ).rejects.toThrow("HTTP 503");
  });

  it("states the fact (no guessed image-complexity cause) in timeout copy", () => {
    const message = buildClientDeadlineMessage(60);
    expect(message).toMatch(/did not respond in 60s/i);
    expect(message).not.toMatch(/too complex|clearer image|spectrum image may/i);
  });

  it("keeps a bare spinner for 10s, then shows stage + elapsed seconds", () => {
    expect(formatRunStatus("vision", EXTRACTION_ELAPSED_REVEAL_SEC - 1)).toBe(
      "Extracting Telemetry Data..."
    );
    const vision = formatRunStatus("vision", 12);
    expect(vision).toContain("Vision extraction");
    expect(vision).toContain("12s elapsed");
    const consensus = formatRunStatus("consensus", 42);
    expect(consensus).toContain("Consensus analysis");
    expect(consensus).toContain("42s elapsed");
  });
});
