/**
 * Thin-asset resilience for OPTIONAL component spec records.
 *
 * A missing spec row is not an outage. Equipment DB is the source of truth for
 * RPM / bearing / ISO class, and a partially configured asset is expected to
 * return either a 404 or an empty 200 for those optional records. Only a real
 * server/network failure may surface the red outage banner.
 */

export const EQUIPMENT_DB_PATH = "/equipment-db";

export const KINEMATIC_SPECS_EMPTY_MESSAGE =
  "Kinematic specs not configured \u2014 set RPM and bearing in Equipment DB to enable full ISO matrix";

export const KINEMATIC_SPECS_OUTAGE_MESSAGE =
  "We couldn't reach the server to load kinematic specs. Check your connection and try again.";

export type OptionalSpecOutcome<T> =
  | { kind: "ok"; spec: T }
  | { kind: "empty"; message: typeof KINEMATIC_SPECS_EMPTY_MESSAGE }
  | { kind: "outage"; message: typeof KINEMATIC_SPECS_OUTAGE_MESSAGE };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isEmptySpecValue(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

/**
 * Classify an optional spec-record response.
 *
 * - 404 or an empty 200 body => `empty` (honest inline configuration state).
 * - any other non-2xx (including 5xx) => `outage` (red banner).
 */
export function classifyOptionalSpecResponse<T>(
  status: number,
  body: unknown
): OptionalSpecOutcome<T> {
  if (status === 404) {
    return { kind: "empty", message: KINEMATIC_SPECS_EMPTY_MESSAGE };
  }
  if (status >= 200 && status < 300) {
    const record = asRecord(body);
    const candidate =
      "spec" in record
        ? record.spec
        : "specs" in record
          ? Array.isArray(record.specs)
            ? record.specs[0]
            : record.specs
          : record;
    if (isEmptySpecValue(candidate)) {
      return { kind: "empty", message: KINEMATIC_SPECS_EMPTY_MESSAGE };
    }
    return { kind: "ok", spec: candidate as T };
  }
  return { kind: "outage", message: KINEMATIC_SPECS_OUTAGE_MESSAGE };
}

export function optionalSpecNetworkFailure<T>(): OptionalSpecOutcome<T> {
  return { kind: "outage", message: KINEMATIC_SPECS_OUTAGE_MESSAGE };
}
