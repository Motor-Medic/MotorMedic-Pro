import { useCallback, useEffect, useRef, useState } from "react";
import type { ExtractionStage } from "./clientDeadline";

export interface AbortableRun {
  /** True between begin() and finish()/cancel(). */
  isRunning: boolean;
  /** Stage shown by the honest spinner while running. */
  stage: ExtractionStage | null;
  /** Whole seconds since begin(), refreshed once per second. */
  elapsedSec: number;
  /**
   * Acquire the single-flight lock. Returns the operator-cancel signal, or
   * null when a run is already in flight (the lock is held).
   */
  begin: (stage: ExtractionStage) => AbortSignal | null;
  /** Release the lock after success/failure, without aborting anything. */
  finish: () => void;
  /** Abort the in-flight request and release the lock immediately. */
  cancel: () => void;
  /** True once the current run was cancelled by the operator. */
  wasCancelled: () => boolean;
}

/**
 * SLICE-VS2 — single-flight run tracker with an operator-cancel signal.
 *
 * Pre-fix the extraction had no cancel path: the UI lock (Run disabled,
 * dropzone disabled) only cleared when the fetch settled. cancel() aborts the
 * fetch AND clears the lock synchronously so no orphan in-flight run survives.
 */
export function useAbortableRun(): AbortableRun {
  const controllerRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [stage, setStage] = useState<ExtractionStage | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!isRunning) {
      setElapsedSec(0);
      return;
    }
    const tick = () => {
      const startedAt = startedAtRef.current;
      if (startedAt == null) return;
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const begin = useCallback((nextStage: ExtractionStage): AbortSignal | null => {
    if (controllerRef.current) return null;
    const controller = new AbortController();
    controllerRef.current = controller;
    cancelledRef.current = false;
    startedAtRef.current = Date.now();
    setStage(nextStage);
    setElapsedSec(0);
    setIsRunning(true);
    return controller.signal;
  }, []);

  const finish = useCallback(() => {
    controllerRef.current = null;
    startedAtRef.current = null;
    setIsRunning(false);
    setStage(null);
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    controllerRef.current?.abort();
    controllerRef.current = null;
    startedAtRef.current = null;
    setIsRunning(false);
    setStage(null);
    setElapsedSec(0);
  }, []);

  const wasCancelled = useCallback(() => cancelledRef.current, []);

  return { isRunning, stage, elapsedSec, begin, finish, cancel, wasCancelled };
}
