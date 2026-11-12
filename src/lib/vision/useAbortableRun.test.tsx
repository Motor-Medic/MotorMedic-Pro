// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRunStatus } from "./clientDeadline";
import { useAbortableRun } from "./useAbortableRun";

afterEach(() => {
  vi.useRealTimers();
});

describe("SLICE-VS2 useAbortableRun (single-flight + cancel)", () => {
  it("holds one in-flight lock and cancel resets state + releases it", () => {
    const { result } = renderHook(() => useAbortableRun());

    let signal: AbortSignal | null = null;
    act(() => {
      signal = result.current.begin("vision");
    });
    expect(signal).not.toBeNull();
    expect(result.current.isRunning).toBe(true);
    expect(result.current.stage).toBe("vision");

    // A second begin must not start an orphan run while the first is in flight.
    let second: AbortSignal | null = null;
    act(() => {
      second = result.current.begin("vision");
    });
    expect(second).toBeNull();

    act(() => {
      result.current.cancel();
    });
    expect(signal!.aborted).toBe(true);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.stage).toBeNull();
    expect(result.current.elapsedSec).toBe(0);
    expect(result.current.wasCancelled()).toBe(true);

    // Lock released: the next run starts cleanly.
    let third: AbortSignal | null = null;
    act(() => {
      third = result.current.begin("consensus");
    });
    expect(third).not.toBeNull();
    expect(result.current.stage).toBe("consensus");
  });

  it("finish releases the lock without marking the run cancelled", () => {
    const { result } = renderHook(() => useAbortableRun());

    let signal: AbortSignal | null = null;
    act(() => {
      signal = result.current.begin("consensus");
    });
    act(() => {
      result.current.finish();
    });

    expect(signal!.aborted).toBe(false);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.wasCancelled()).toBe(false);

    let next: AbortSignal | null = null;
    act(() => {
      next = result.current.begin("vision");
    });
    expect(next).not.toBeNull();
  });

  it("reports elapsed seconds after 10s so the spinner is never bare", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAbortableRun());

    act(() => {
      result.current.begin("vision");
    });
    act(() => {
      vi.advanceTimersByTime(12_000);
    });

    expect(result.current.elapsedSec).toBe(12);
    const label = formatRunStatus(result.current.stage, result.current.elapsedSec);
    expect(label).toContain("Vision extraction");
    expect(label).toContain("12s elapsed");
  });
});
