/**
 * SLICE-VS2 — client-side deadline + honest status for vision/consensus calls.
 *
 * The browser used to wait on a bare `fetch` (180s extraction controller, no
 * cancel, no stage feedback). These helpers put an explicit, observable
 * deadline on every extraction/consensus request and name the elapsed time in
 * the failure message instead of guessing at a cause.
 */

/** Client deadline for a vision extraction request (upload -> vision result). */
export const VISION_EXTRACTION_TIMEOUT_MS = 60_000;

/** Client deadline for a consensus diagnostic request. */
export const CONSENSUS_TIMEOUT_MS = 60_000;

/** Elapsed seconds before the spinner is allowed to show a bare message. */
export const EXTRACTION_ELAPSED_REVEAL_SEC = 10;

export type ExtractionStage = "vision" | "consensus";

export const STAGE_LABELS: Record<ExtractionStage, string> = {
  vision: "Vision extraction",
  consensus: "Consensus analysis"
};

/**
 * Factual timeout copy: says only what is known (no upstream response within
 * the deadline). It deliberately makes no claim about image complexity.
 */
export function buildClientDeadlineMessage(elapsedSec: number): string {
  const seconds = Math.max(1, Math.round(elapsedSec));
  return `Upstream did not respond in ${seconds}s. No result was received — retry, or check the server logs for the provider that stalled.`;
}

/** Raised when our own deadline fired before the upstream answered. */
export class ClientDeadlineError extends Error {
  readonly elapsedMs: number;
  readonly timeoutMs: number;

  constructor(elapsedMs: number, timeoutMs: number) {
    super(buildClientDeadlineMessage(elapsedMs / 1000));
    this.name = "ClientDeadlineError";
    this.elapsedMs = elapsedMs;
    this.timeoutMs = timeoutMs;
  }
}

/** Raised when the operator cancelled the in-flight request. */
export class ClientCancelledError extends Error {
  constructor() {
    super("Request cancelled by operator.");
    this.name = "ClientCancelledError";
  }
}

export function isClientCancelledError(err: unknown): err is ClientCancelledError {
  return err instanceof ClientCancelledError;
}

export function isClientDeadlineError(err: unknown): err is ClientDeadlineError {
  return err instanceof ClientDeadlineError;
}

export interface DeadlineOptions {
  /** Override the default 60s deadline. */
  timeoutMs?: number;
  /** Operator cancel signal (from useAbortableRun / a Cancel button). */
  externalSignal?: AbortSignal | null;
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

/**
 * Runs `task` with a combined signal: our timeout abort OR the caller's cancel
 * abort. A timeout becomes ClientDeadlineError (naming elapsed seconds); an
 * operator cancel becomes ClientCancelledError. Both signals are always
 * released so no orphan lock survives.
 */
export async function withDeadline<T>(
  task: (signal: AbortSignal) => Promise<T>,
  options: DeadlineOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? VISION_EXTRACTION_TIMEOUT_MS;
  const externalSignal = options.externalSignal ?? null;

  if (externalSignal?.aborted) {
    throw new ClientCancelledError();
  }

  const controller = new AbortController();
  const startedAt = Date.now();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  const cleanup = () => {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  };

  try {
    return await task(controller.signal);
  } catch (err) {
    // Operator cancel wins over a same-tick timer race: if the caller aborted
    // their own signal, report cancellation rather than a timeout.
    if (externalSignal?.aborted) throw new ClientCancelledError();
    if (timedOut) throw new ClientDeadlineError(Date.now() - startedAt, timeoutMs);
    if (isAbortError(err)) {
      // The signal aborted for a reason we did not record (defensive).
      throw new ClientDeadlineError(Date.now() - startedAt, timeoutMs);
    }
    throw err;
  } finally {
    cleanup();
  }
}

/**
 * Spinner copy: a bare message for the first 10s, then the current stage AND
 * elapsed seconds. Never an indefinite bare spinner.
 */
export function formatRunStatus(
  stage: ExtractionStage | null,
  elapsedSec: number,
  baseMessage = "Extracting Telemetry Data..."
): string {
  if (elapsedSec < EXTRACTION_ELAPSED_REVEAL_SEC) return baseMessage;
  const label = stage ? STAGE_LABELS[stage] : "Extraction";
  return `${label} — ${Math.max(0, Math.floor(elapsedSec))}s elapsed`;
}
