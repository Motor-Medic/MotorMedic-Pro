import { useCallback, useRef, useState } from "react";
import { createSingleFlight, type SingleFlightResult } from "./singleFlight";

/**
 * React wrapper around createSingleFlight. `pending` drives the disabled /
 * "Saving..." button state; the ref-backed latch is what actually enforces
 * one-click-one-request even before React has re-rendered.
 */
export function useSingleFlight() {
  const guardRef = useRef<ReturnType<typeof createSingleFlight> | null>(null);
  if (guardRef.current == null) {
    guardRef.current = createSingleFlight();
  }
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async <T,>(task: () => Promise<T>): Promise<SingleFlightResult<T>> => {
      const guard = guardRef.current!;
      if (guard.pending) return { started: false };
      setPending(true);
      try {
        return await guard.run(task);
      } finally {
        setPending(false);
      }
    },
    []
  );

  return { pending, run };
}
