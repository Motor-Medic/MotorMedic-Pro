/**
 * SLICE-VS5 — running-speed provenance.
 *
 * A positive RPM on a saved row is not automatically gating-quality evidence:
 * `buildVibrationDiagnosticRecord` used to persist a 1780 capture fallback when
 * vision did not read a running speed, and older rows carry it with no source
 * tag. Frequency-domain interpretation (1X/2X re-extraction, bearing defect
 * orders) may only run on a MEASURED or CONFIGURED running speed. A capture
 * default or an untagged speed is displayed, never used to gate physics.
 */

/** The historical capture fallback written when vision read no RPM. */
export const CAPTURE_DEFAULT_VIBRATION_RPM = 1780;

export type VibrationRpmSource =
  | "measured"
  | "configured"
  | "default"
  | "unknown"
  | "absent";

export interface VibrationRpmReading {
  rpm: number | null;
  source: VibrationRpmSource;
  /** Raw persisted token, when the row carries one. */
  rawSource: string | null;
  /** ONLY measured / configured RPM may gate frequency-domain interpretation. */
  gatingQuality: boolean;
  /** Honest provenance sentence; null for measured / configured speeds. */
  warning: string | null;
}

export const VIBRATION_RPM_DEFAULT_WARNING =
  "RPM defaulted at capture \u2014 not measured";
export const VIBRATION_RPM_UNKNOWN_WARNING =
  "RPM source not recorded \u2014 not gating-quality";
export const VIBRATION_RPM_ABSENT_WARNING = "RPM not recorded";

export const VIBRATION_RPM_MEASURED_LABEL =
  "RPM measured (vision-extracted)";
export const VIBRATION_RPM_CONFIGURED_LABEL =
  "RPM configured (Equipment DB nameplate)";

const MEASURED_TOKENS = new Set([
  "measured",
  "vision-extracted",
  "vision",
  "stored",
  "fft"
]);

const CONFIGURED_TOKENS = new Set([
  "configured",
  "manual",
  "operator",
  "equipment-db",
  "equipmentdb",
  "nameplate",
  "rated"
]);

const DEFAULT_TOKENS = new Set(["default", "capture-default", "fallback"]);

function normalizeToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const token = raw.trim().toLowerCase();
  return token ? token : null;
}

/**
 * Classify one persisted RPM as gating-quality or not.
 *
 * An untagged RPM equal to the historical capture fallback is treated as
 * DEFAULT — the one thing we know is that it may not be measured. Any other
 * untagged RPM is UNKNOWN (not gating) rather than silently promoted.
 */
export function classifyVibrationRpmSource(
  rawSource: unknown,
  rpm: number | null | undefined
): VibrationRpmSource {
  const value = rpm != null && Number.isFinite(rpm) && rpm > 0 ? rpm : null;
  if (value == null) return "absent";

  const token = normalizeToken(rawSource);
  if (token) {
    if (MEASURED_TOKENS.has(token)) return "measured";
    if (CONFIGURED_TOKENS.has(token)) return "configured";
    if (DEFAULT_TOKENS.has(token)) return "default";
    return "unknown";
  }

  return value === CAPTURE_DEFAULT_VIBRATION_RPM ? "default" : "unknown";
}

export function isGatingQualityVibrationRpm(
  source: VibrationRpmSource | null | undefined
): boolean {
  return source === "measured" || source === "configured";
}

export function vibrationRpmProvenanceLabel(
  source: VibrationRpmSource
): string {
  switch (source) {
    case "measured":
      return VIBRATION_RPM_MEASURED_LABEL;
    case "configured":
      return VIBRATION_RPM_CONFIGURED_LABEL;
    case "default":
      return VIBRATION_RPM_DEFAULT_WARNING;
    case "unknown":
      return VIBRATION_RPM_UNKNOWN_WARNING;
    default:
      return VIBRATION_RPM_ABSENT_WARNING;
  }
}

export function vibrationRpmWarning(
  source: VibrationRpmSource
): string | null {
  if (source === "default") return VIBRATION_RPM_DEFAULT_WARNING;
  if (source === "unknown") return VIBRATION_RPM_UNKNOWN_WARNING;
  return null;
}

/** Build the display-safe reading from an already-extracted raw RPM/token. */
export function buildVibrationRpmReading(
  rpm: number | null,
  rawSource: unknown
): VibrationRpmReading {
  const source = classifyVibrationRpmSource(rawSource, rpm);
  return {
    rpm: rpm != null && Number.isFinite(rpm) && rpm > 0 ? rpm : null,
    source,
    rawSource: normalizeToken(rawSource),
    gatingQuality: isGatingQualityVibrationRpm(source),
    warning: vibrationRpmWarning(source)
  };
}
