/**
 * SLICE-US1 — stored-baseline ΔdB provenance for the Bearings & Mechanical tab.
 *
 * What this module is:
 *  - A descriptive indicator only. ΔdB is the subtraction of two stored dBµV
 *    levels; it is never a crest factor, never a severity class, and never
 *    converted to a linear/µV level.
 *  - A stored-class passthrough. If a saved scan carries a class / action
 *    string, that exact string is surfaced verbatim. Nothing here derives a
 *    class from the in-repo UE Systems ladder, a delta, a probe type or a fault
 *    name — the static ladder in prescriptiveDictionary.ts stays a reference.
 *  - An honest gap. No stored baseline -> "baseline not stored" and no ΔdB.
 *
 * Negative dBµV is a valid reading (0 dBµV is a reference, not a floor).
 * Only missing / non-finite values produce a null, which renders as an
 * honest empty value rather than a fabricated 0 dB.
 */

export type UeBearingBaselineProvenance = "stored" | "fallback" | "not-stored";

export interface UeBearingDeltaDescriptor {
  /** Stored peak dBµV (negative allowed), null when missing/non-finite. */
  peakDb: number | null;
  /** Baseline actually used for the descriptive delta, null when absent. */
  baselineDb: number | null;
  /** Where the baseline came from. */
  baselineProvenance: UeBearingBaselineProvenance;
  /**
   * Descriptive ΔdB = peak − baseline. Null when either side is absent.
   * Never a crest factor; never a class.
   */
  deltaDb: number | null;
  /** True only when the delta rests on a stored (measured) baseline. */
  deltaIsMeasured: boolean;
  /** Stored class string, verbatim. Null when nothing is stored. */
  storedClass: string | null;
  /** Stored action string, verbatim. Null when nothing is stored. */
  storedAction: string | null;
}

export const UE_BASELINE_NOT_STORED_LABEL = "baseline not stored";
export const UE_STORED_CLASS_ABSENT_LABEL = "class not stored";

export const UE_BEARING_DELTA_DESCRIPTIVE_NOTE =
  "ΔdB is a descriptive subtraction of two stored dBµV levels — not a crest factor, not a severity class, and never converted to a linear level.";

/** Finite dB value, negative allowed. Missing / NaN / ±Infinity -> null. */
export function finiteDb(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstStoredText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/** First ultrasound peak record in a saved row's peaks jsonb array. */
export function ueUltrasoundPeakRecord(
  peaks: unknown
): Record<string, unknown> | null {
  if (!Array.isArray(peaks)) return null;
  for (const raw of peaks) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    if (String(record.type || "").toLowerCase() === "ultrasound") {
      return record;
    }
  }
  return null;
}

/**
 * Read only stored fields. No ladder lookup, no probe inference, no units.
 */
export function describeUeBearingDelta(
  raw: unknown
): UeBearingDeltaDescriptor {
  const p =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const peakDb = finiteDb(p.peak_dbmv ?? p.peak_dbuv);
  const storedBaseline = finiteDb(p.baseline_dbmv ?? p.baseline_dbuv);
  const fallbackDb = finiteDb(p.baseline_fallback_db ?? p.baselineFallbackDb);
  const sourceRaw = String(
    p.baseline_source ?? p.baselineSource ?? ""
  ).trim().toLowerCase();

  let baselineProvenance: UeBearingBaselineProvenance;
  if (sourceRaw === "stored") {
    baselineProvenance = "stored";
  } else if (sourceRaw === "fallback") {
    baselineProvenance = "fallback";
  } else if (fallbackDb != null && storedBaseline == null) {
    baselineProvenance = "fallback";
  } else if (storedBaseline != null) {
    baselineProvenance = "stored";
  } else {
    baselineProvenance = "not-stored";
  }

  const baselineDb =
    baselineProvenance === "fallback"
      ? fallbackDb ?? storedBaseline
      : baselineProvenance === "stored"
        ? storedBaseline
        : null;

  let deltaDb: number | null = null;
  if (peakDb != null && baselineDb != null) {
    const storedDelta = finiteDb(p.delta_db ?? p.deltaDb);
    deltaDb = storedDelta ?? Math.round((peakDb - baselineDb) * 10) / 10;
  }

  return {
    peakDb,
    baselineDb,
    baselineProvenance,
    deltaDb,
    deltaIsMeasured: baselineProvenance === "stored",
    // Verbatim passthrough — no mapping table, no bracket lookup, no fallback
    // to a computed label. `severity_class` is the repo-wide stored convention
    // (see thermography); the others are accepted only when stored.
    storedClass: firstStoredText(
      p.severity_class,
      p.condition_class,
      p.class_label,
      p.class
    ),
    storedAction: firstStoredText(
      p.class_action,
      p.condition_action,
      p.severity_action
    )
  };
}

/** Display the descriptive delta (1 dp, dB — never dBµV, never a ratio). */
export function formatUeDeltaDb(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)} dB`;
}

/** Provenance sentence rendered beside the delta. */
export function ueBaselineProvenanceLabel(
  descriptor: UeBearingDeltaDescriptor
): string {
  if (descriptor.baselineProvenance === "stored" && descriptor.baselineDb != null) {
    return `Stored baseline (${descriptor.baselineDb.toFixed(1)} dBµV)`;
  }
  if (descriptor.baselineProvenance === "fallback" && descriptor.baselineDb != null) {
    return `Modeled fallback (${descriptor.baselineDb.toFixed(1)} dBµV) — delta modeled, not measured`;
  }
  return UE_BASELINE_NOT_STORED_LABEL;
}

/** Stored class sentence. The class string is never normalized or re-derived. */
export function ueStoredClassLabel(
  descriptor: UeBearingDeltaDescriptor
): string {
  return descriptor.storedClass ?? UE_STORED_CLASS_ABSENT_LABEL;
}
