/**
 * Read a URL query parameter reactively.
 *
 * The SPA router in `navigation.ts` pushes history entries and then dispatches
 * a synthetic `popstate`, so subscribing to that one event covers both a cold
 * load from a pasted link and an in-app navigation.
 */

import { useEffect, useState } from "react";

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(key);
  return value && value.trim() !== "" ? value : null;
}

export function useQueryParam(key: string): string | null {
  const [value, setValue] = useState<string | null>(() => read(key));

  useEffect(() => {
    const sync = () => setValue(read(key));
    // Re-read immediately: the key may have changed since the last render.
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [key]);

  return value;
}
