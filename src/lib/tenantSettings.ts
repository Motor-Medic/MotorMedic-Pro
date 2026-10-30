/**
 * SLICE-H2 - per-tenant display-unit preferences.
 *
 * The server derives the tenant from the verified session, so this client
 * helper never sends a company id. Storage is preference-only: the canonical
 * mm/s RMS / g / Hz values are untouched. No localStorage cache is used, so a
 * browser can never carry one tenant's units into another tenant's session.
 */
import { useCallback, useEffect, useState } from "react";
import {
  CANONICAL_DISPLAY_UNITS,
  normalizeDisplayUnits,
  type DisplayUnits
} from "./vibration/units";

export const TENANT_SETTINGS_PATH = "/api/tenant-settings";

interface TenantSettingsResponse {
  company_id?: number;
  display_units?: unknown;
}

async function readDisplayUnits(res: Response): Promise<DisplayUnits> {
  const payload = (await res.json().catch(() => ({}))) as TenantSettingsResponse;
  if (!res.ok) {
    throw new Error(
      typeof (payload as { error?: unknown }).error === "string"
        ? String((payload as { error?: unknown }).error)
        : "Failed to load display units"
    );
  }
  return normalizeDisplayUnits(payload.display_units ?? CANONICAL_DISPLAY_UNITS);
}

export async function fetchTenantDisplayUnits(
  signal?: AbortSignal
): Promise<DisplayUnits> {
  const res = await fetch(TENANT_SETTINGS_PATH, {
    credentials: "same-origin",
    signal
  });
  return readDisplayUnits(res);
}

export async function saveTenantDisplayUnits(
  units: DisplayUnits
): Promise<DisplayUnits> {
  const res = await fetch(TENANT_SETTINGS_PATH, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ display_units: units })
  });
  return readDisplayUnits(res);
}

export interface TenantDisplayUnitsState {
  units: DisplayUnits;
  loading: boolean;
  error: string | null;
  /** Replace the local view immediately (optimistic quick switch). */
  setUnits: (units: DisplayUnits) => void;
  /** Persist to the session tenant, then apply the normalized response. */
  saveUnits: (units: DisplayUnits) => Promise<DisplayUnits>;
  reload: () => void;
}

export function useTenantDisplayUnits(): TenantDisplayUnitsState {
  const [units, setUnitsState] = useState<DisplayUnits>(CANONICAL_DISPLAY_UNITS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    fetchTenantDisplayUnits(controller.signal)
      .then((next) => {
        if (cancelled) return;
        setUnitsState(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        setError(
          err instanceof Error ? err.message : "Failed to load display units"
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadTick]);

  const setUnits = useCallback((next: DisplayUnits) => {
    setUnitsState(normalizeDisplayUnits(next));
  }, []);

  const saveUnits = useCallback(async (next: DisplayUnits) => {
    const saved = await saveTenantDisplayUnits(normalizeDisplayUnits(next));
    setUnitsState(saved);
    setError(null);
    return saved;
  }, []);

  const reload = useCallback(() => setReloadTick((n) => n + 1), []);

  return { units, loading, error, setUnits, saveUnits, reload };
}
