/**
 * BEARING-CALC - pure rolling-element bearing fault-frequency math.
 *
 * FORMULA SOURCE: standard rolling-element bearing defect-frequency equations
 * (ISO 15243 defect taxonomy; Harris, Rolling Bearing Analysis, 4th ed., ch. 9;
 * the same BPFO/BPFI/BSF/FTF relations published in most vibration references).
 *
 * NO PART-NUMBER CATALOG: every geometry value is supplied by the user. There
 * is no SKF/manufacturer lookup table behind this module. A free-text
 * reference_label is stored verbatim elsewhere and never resolved to geometry.
 *
 * Geometry unit rule: Bd and Pd must use the SAME unit (mm or in). Only their
 * ratio Bd/Pd enters the equations, so the unit cancels out.
 */

export interface BearingGeometry {
  /** Ball / roller count (Z). */
  z: number;
  /** Rolling-element diameter (Bd) in the same unit as Pd. */
  bd: number;
  /** Pitch diameter (Pd) in the same unit as Bd. */
  pd: number;
  /** Contact angle in DEGREES. Converted to radians explicitly below. */
  contactAngle: number;
}

export interface BearingCalcInput extends BearingGeometry {
  /** Shaft speed in revolutions per minute. */
  rpm: number;
}

export interface BearingFaultFrequencies {
  /** Shaft rotation frequency in Hz (RPM / 60). */
  shaftHz: number;
  /** Ball pass frequency, outer race. */
  bpfo: number;
  /** Ball pass frequency, inner race. */
  bpfi: number;
  /** Ball spin frequency. */
  bsf: number;
  /** Fundamental train frequency (cage). */
  ftf: number;
}

export type BearingField = "z" | "bd" | "pd" | "contactAngle" | "rpm";

export type BearingValidationErrors = Partial<Record<BearingField, string>>;

/**
 * Always carries `errors` and a (possibly null) `value` so callers never need
 * discriminated-union narrowing (the project tsconfig is intentionally
 * non-strict, where boolean-literal narrowing is not reliable).
 */
export interface BearingValidation<T> {
  ok: boolean;
  value: T | null;
  errors: BearingValidationErrors;
}

function toFiniteNumber(raw: unknown): number {
  if (raw == null) return NaN;
  if (typeof raw === "string" && raw.trim() === "") return NaN;
  const numeric = typeof raw === "number" ? raw : Number(String(raw).trim());
  return Number.isFinite(numeric) ? numeric : NaN;
}

/**
 * Validate the stored geometry only (no RPM). Used by the bearing-specs API,
 * which persists geometry but never a shaft speed.
 */
export function validateBearingGeometry(raw: {
  z: unknown;
  bd: unknown;
  pd: unknown;
  contactAngle: unknown;
}): BearingValidation<BearingGeometry> {
  const errors: BearingValidationErrors = {};
  const z = toFiniteNumber(raw.z);
  const bd = toFiniteNumber(raw.bd);
  const pd = toFiniteNumber(raw.pd);
  const contactAngle = toFiniteNumber(raw.contactAngle);

  if (!Number.isFinite(z) || !Number.isInteger(z) || z < 3) {
    errors.z = "Ball count must be a whole number of at least 3.";
  }
  if (!Number.isFinite(bd) || bd <= 0) {
    errors.bd = "Ball diameter must be greater than 0.";
  }
  if (!Number.isFinite(pd) || pd <= 0) {
    errors.pd = "Pitch diameter must be greater than 0.";
  }
  if (
    Number.isFinite(bd) &&
    Number.isFinite(pd) &&
    bd > 0 &&
    pd > 0 &&
    bd >= pd
  ) {
    errors.bd = "Ball diameter must be smaller than pitch diameter.";
    errors.pd = "Pitch diameter must be larger than ball diameter.";
  }
  if (
    !Number.isFinite(contactAngle) ||
    contactAngle < 0 ||
    contactAngle > 45
  ) {
    errors.contactAngle =
      "Contact angle must be between 0 and 45 degrees.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, value: null, errors };
  }
  return {
    ok: true,
    errors: {},
    value: { z, bd, pd, contactAngle }
  };
}

/** Validate the full calculator input: geometry plus a positive shaft RPM. */
export function validateBearingCalcInput(raw: {
  z: unknown;
  bd: unknown;
  pd: unknown;
  contactAngle: unknown;
  rpm: unknown;
}): BearingValidation<BearingCalcInput> {
  const geometry = validateBearingGeometry(raw);
  const rpm = toFiniteNumber(raw.rpm);
  const rpmError =
    !Number.isFinite(rpm) || rpm <= 0
      ? "RPM must be greater than 0."
      : null;

  if (!geometry.ok) {
    const errors: BearingValidationErrors = { ...geometry.errors };
    if (rpmError) errors.rpm = rpmError;
    return { ok: false, value: null, errors };
  }
  if (rpmError) {
    return { ok: false, value: null, errors: { rpm: rpmError } };
  }
  return {
    ok: true,
    errors: {},
    value: {
      ...geometry.value,
      rpm
    }
  };
}

/**
 * Compute the four characteristic bearing frequencies from VALIDATED input.
 *
 * shaft_hz = RPM / 60
 * BPFO = (Z/2) * shaft_hz * (1 - (Bd/Pd) * cos(rad))
 * BPFI = (Z/2) * shaft_hz * (1 + (Bd/Pd) * cos(rad))
 * BSF  = (Pd/(2*Bd)) * shaft_hz * (1 - ((Bd/Pd) * cos(rad))^2)
 * FTF  = (1/2) * shaft_hz * (1 - (Bd/Pd) * cos(rad))
 */
export function calculateBearingFrequencies(
  input: BearingCalcInput
): BearingFaultFrequencies {
  const shaftHz = input.rpm / 60;
  // Math.cos takes RADIANS; the user enters DEGREES. Convert explicitly.
  const radians = (input.contactAngle * Math.PI) / 180;
  const ratio = (input.bd / input.pd) * Math.cos(radians);

  return {
    shaftHz,
    bpfo: (input.z / 2) * shaftHz * (1 - ratio),
    bpfi: (input.z / 2) * shaftHz * (1 + ratio),
    bsf: (input.pd / (2 * input.bd)) * shaftHz * (1 - ratio * ratio),
    ftf: 0.5 * shaftHz * (1 - ratio)
  };
}

/** Validate + compute in one call; never throws on user input. */
export function calculateBearingFaultFrequencies(raw: {
  z: unknown;
  bd: unknown;
  pd: unknown;
  contactAngle: unknown;
  rpm: unknown;
}): BearingValidation<BearingFaultFrequencies> {
  const validation = validateBearingCalcInput(raw);
  if (!validation.ok) {
    return { ok: false, value: null, errors: validation.errors };
  }
  return {
    ok: true,
    errors: {},
    value: calculateBearingFrequencies(validation.value)
  };
}

/** Round to 2 decimal places for display / fixture assertions. */
export function roundBearingFrequency(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Human table cell; an unavailable value is shown as an em dash, never 0. */
export function formatBearingFrequency(
  value: number | null | undefined
): string {
  return Number.isFinite(value as number)
    ? Number(value).toFixed(2)
    : "—";
}
