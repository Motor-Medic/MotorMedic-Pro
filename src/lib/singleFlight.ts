/**
 * A synchronous in-flight latch for write actions. React state updates are
 * async, so two clicks in the same tick can both read `pending === false`.
 * This guard flips synchronously before the first await, guaranteeing that
 * only one request is ever started for a burst of clicks.
 */
export interface SingleFlightResult<T> {
  /** False when this call was ignored because another run was in flight. */
  started: boolean;
  value?: T;
}

export interface SingleFlight {
  readonly pending: boolean;
  run<T>(task: () => Promise<T>): Promise<SingleFlightResult<T>>;
}

export function createSingleFlight(): SingleFlight {
  let pending = false;
  return {
    get pending() {
      return pending;
    },
    async run<T>(task: () => Promise<T>): Promise<SingleFlightResult<T>> {
      if (pending) return { started: false };
      pending = true;
      try {
        const value = await task();
        return { started: true, value };
      } finally {
        pending = false;
      }
    }
  };
}
