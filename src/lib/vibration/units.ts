/**
 * Vibration unit conversion helpers.
 *
 * Canonical velocity unit across the app is **mm/s RMS**. Alternate display
 * units are derived here so the conversion constant lives in exactly one
 * place: `in/s = mm/s / 25.4`.
 *
 * Acceleration is stored canonically in **g** (physical); frequency is stored
 * canonically in **Hz**. Everything below is display-only: callers convert a
 * stored value for presentation, never for storage or zone classification.
 */

export const MM_PER_INCH = 25.4;
export const STANDARD_GRAVITY_MM_S2 = 9.80665;
export const SECONDS_PER_MINUTE = 60;

export const CANONICAL_VELOCITY_UNIT = "mm/s RMS" as const;

export type VelocityDisplayUnit = "mm/s" | "in/s";
export type AccelerationDisplayUnit = "g" | "mm/s2";
export type FrequencyDisplayUnit = "Hz" | "CPM" | "orders";
export type TemperatureDisplayUnit = "°C" | "°F";

export interface DisplayUnits {
  velocity: VelocityDisplayUnit;
  acceleration: AccelerationDisplayUnit;
  frequency: FrequencyDisplayUnit;
  /**
   * Optional tenant override. Absent means "render the unit stored on the
   * reading" — never a hardcoded default, because silently converting real
   * thermography data on first load would misstate every temperature.
   */
  temperature?: TemperatureDisplayUnit;
}

/** Canonical defaults; every tenant without a saved preference reads these. */
export const CANONICAL_DISPLAY_UNITS: DisplayUnits = {
  velocity: "mm/s",
  acceleration: "g",
  frequency: "Hz"
};

export const VELOCITY_DISPLAY_OPTIONS: readonly VelocityDisplayUnit[] = [
  "mm/s",
  "in/s"
];
export const ACCELERATION_DISPLAY_OPTIONS: readonly AccelerationDisplayUnit[] = [
  "g",
  "mm/s2"
];
export const FREQUENCY_DISPLAY_OPTIONS: readonly FrequencyDisplayUnit[] = [
  "Hz",
  "CPM",
  "orders"
];
export const TEMPERATURE_DISPLAY_OPTIONS: readonly TemperatureDisplayUnit[] = [
  "°C",
  "°F"
];

const VELOCITY_UNITS = new Set<string>(VELOCITY_DISPLAY_OPTIONS);
const ACCELERATION_UNITS = new Set<string>(ACCELERATION_DISPLAY_OPTIONS);
const FREQUENCY_UNITS = new Set<string>(FREQUENCY_DISPLAY_OPTIONS);
const TEMPERATURE_UNITS = new Set<string>(TEMPERATURE_DISPLAY_OPTIONS);

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

/**
 * Coerce an untrusted settings payload into a valid DisplayUnits object.
 * Unknown/missing keys fall back to the canonical defaults, never to an empty
 * string, so a malformed row can never blank a customer's labels.
 */
export function normalizeDisplayUnits(input: unknown): DisplayUnits {
  const raw = asRecord(input);
  const velocity = String(raw.velocity ?? "");
  const acceleration = String(raw.acceleration ?? "");
  const frequency = String(raw.frequency ?? "");
  const temperature = String(raw.temperature ?? "");
  const units: DisplayUnits = {
    velocity: VELOCITY_UNITS.has(velocity)
      ? (velocity as VelocityDisplayUnit)
      : CANONICAL_DISPLAY_UNITS.velocity,
    acceleration: ACCELERATION_UNITS.has(acceleration)
      ? (acceleration as AccelerationDisplayUnit)
      : CANONICAL_DISPLAY_UNITS.acceleration,
    frequency: FREQUENCY_UNITS.has(frequency)
      ? (frequency as FrequencyDisplayUnit)
      : CANONICAL_DISPLAY_UNITS.frequency
  };
  // Temperature is deliberately omitted when not chosen: an absent preference
  // must fall through to the reading's stored unit, not a guessed default.
  if (TEMPERATURE_UNITS.has(temperature)) {
    units.temperature = temperature as TemperatureDisplayUnit;
  }
  return units;
}

/** Convert a velocity expressed in in/s to the canonical mm/s. */
export function inchPerSecondToMmPerSecond(value: number): number {
  return value * MM_PER_INCH;
}

/** Convert a canonical mm/s velocity to in/s for alternate display. */
export function mmPerSecondToInchPerSecond(value: number): number {
  return value / MM_PER_INCH;
}

/** Convert a canonical g acceleration to mm/s² for display. */
export function gToMmPerSecondSquared(value: number): number {
  return value * STANDARD_GRAVITY_MM_S2;
}

/** Convert an mm/s² acceleration back to canonical g. */
export function mmPerSecondSquaredToG(value: number): number {
  return value / STANDARD_GRAVITY_MM_S2;
}

/** Convert canonical frequency (Hz) to cycles per minute. */
export function hzToCpm(value: number): number {
  return value * SECONDS_PER_MINUTE;
}

/** Convert cycles per minute back to canonical Hz. */
export function cpmToHz(value: number): number {
  return value / SECONDS_PER_MINUTE;
}

/** Orders = frequency / running speed in Hz. Null when RPM is unavailable. */
export function hzToOrders(value: number, rpm: number | null | undefined): number | null {
  if (rpm == null || !Number.isFinite(rpm) || rpm <= 0) return null;
  return value / (rpm / SECONDS_PER_MINUTE);
}

/** Convert orders back to Hz using the running speed. Null without RPM. */
export function ordersToHz(value: number, rpm: number | null | undefined): number | null {
  if (rpm == null || !Number.isFinite(rpm) || rpm <= 0) return null;
  return value * (rpm / SECONDS_PER_MINUTE);
}

/** Exact affine Celsius → Fahrenheit scale (9/5) and zero-point offset (+32). */
export const FAHRENHEIT_PER_CELSIUS = 9 / 5;
export const FAHRENHEIT_OFFSET = 32;

export function celsiusToFahrenheit(valueC: number): number {
  return valueC * FAHRENHEIT_PER_CELSIUS + FAHRENHEIT_OFFSET;
}

export function fahrenheitToCelsius(valueF: number): number {
  return (valueF - FAHRENHEIT_OFFSET) / FAHRENHEIT_PER_CELSIUS;
}

/**
 * Absolute temperature (hotspot, ambient, bearing housing) has a real zero
 * point, so the conversion is affine — scale plus offset.
 */
export function convertAbsoluteTemperature(
  value: number,
  from: TemperatureDisplayUnit,
  to: TemperatureDisplayUnit
): number {
  if (from === to) return value;
  return from === "°C" ? celsiusToFahrenheit(value) : fahrenheitToCelsius(value);
}

/**
 * A temperature DIFFERENCE or rate (ΔT, gradient, creep/day) has no zero point:
 * convert with the scale only. Applying +32 here would fabricate ~32° of rise.
 */
export function convertTemperatureDelta(
  value: number,
  from: TemperatureDisplayUnit,
  to: TemperatureDisplayUnit
): number {
  if (from === to) return value;
  return from === "°C"
    ? value * FAHRENHEIT_PER_CELSIUS
    : value / FAHRENHEIT_PER_CELSIUS;
}

/**
 * Effective display unit: an explicit tenant preference wins; otherwise the
 * unit the reading was stored in is authoritative. Never invents °C.
 */
export function resolveTemperatureDisplayUnit(
  preference: TemperatureDisplayUnit | null | undefined,
  storedUnit: TemperatureDisplayUnit
): TemperatureDisplayUnit {
  return preference ?? storedUnit;
}

/** Round a number to a fixed number of decimal places (banker-safe enough here). */
export function roundTo(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Format a canonical mm/s RMS value with its unit always attached. */
export function formatVelocityMmS(value: number, digits = 2): string {
  return `${roundTo(value, digits).toFixed(digits)} ${CANONICAL_VELOCITY_UNIT}`;
}

/** Short unit label for the selected velocity display unit. */
export function velocityUnitLabel(
  unit: VelocityDisplayUnit = "mm/s"
): string {
  return unit === "in/s" ? "in/s" : "mm/s";
}

/**
 * Numeric velocity in the selected display unit, rounded for labels.
 * The unit stays separate so callers can render "alert 4.50, danger 7.10 mm/s".
 */
export function formatVelocityValue(
  valueMmS: number,
  unit: VelocityDisplayUnit = "mm/s"
): string {
  const display = velocityValueForDisplay(valueMmS, unit);
  return unit === "in/s"
    ? roundTo(display, 4).toFixed(4)
    : roundTo(display, 2).toFixed(2);
}

/** Format canonical mm/s for a tenant-selected display unit (never re-labelled). */
export function formatVelocityDisplay(
  valueMmS: number,
  unit: VelocityDisplayUnit = "mm/s"
): string {
  return `${formatVelocityValue(valueMmS, unit)} ${velocityUnitLabel(unit)}`;
}

/** Numeric velocity in the selected display unit (for chart series/axes). */
export function velocityValueForDisplay(
  valueMmS: number,
  unit: VelocityDisplayUnit
): number {
  return unit === "in/s" ? mmPerSecondToInchPerSecond(valueMmS) : valueMmS;
}

/** Format canonical g for a tenant-selected acceleration display unit. */
export function formatAccelerationDisplay(
  valueG: number,
  unit: AccelerationDisplayUnit = "g"
): string {
  if (unit === "mm/s2") {
    return `${roundTo(gToMmPerSecondSquared(valueG), 2).toFixed(2)} mm/s2`;
  }
  return `${roundTo(valueG, 3).toFixed(3)} g`;
}

/**
 * Resolve the frequency unit that can actually be rendered. Orders need a
 * recorded running speed; without one we fall back to Hz (never blank/guess).
 */
export function resolveFrequencyDisplayUnit(
  unit: FrequencyDisplayUnit,
  rpm: number | null | undefined
): FrequencyDisplayUnit {
  if (unit === "orders" && hzToOrders(1, rpm) == null) return "Hz";
  return unit;
}

export interface FrequencyDisplayValue {
  /** Unit actually rendered (orders falls back to Hz without RPM). */
  unit: FrequencyDisplayUnit;
  /** Numeric value in `unit`. */
  value: number;
  /** Value plus unit, e.g. "30.0 Hz" / "1,800 CPM" / "2.00 orders". */
  text: string;
  /** True only when the requested orders view could not be honoured. */
  ordersFallback: boolean;
  /** Non-intrusive copy for the UI when orders fall back. */
  fallbackHint: string | null;
}

export const ORDERS_FALLBACK_HINT =
  "orders unavailable - no running speed recorded";

export function frequencyDisplayValue(
  valueHz: number,
  unit: FrequencyDisplayUnit,
  rpm: number | null | undefined,
  digits = 1
): FrequencyDisplayValue {
  const resolved = resolveFrequencyDisplayUnit(unit, rpm);
  const ordersFallback = unit === "orders" && resolved !== "orders";
  if (resolved === "CPM") {
    const value = hzToCpm(valueHz);
    return {
      unit: "CPM",
      value,
      text: `${Math.round(value).toLocaleString()} CPM`,
      ordersFallback,
      fallbackHint: ordersFallback ? ORDERS_FALLBACK_HINT : null
    };
  }
  if (resolved === "orders") {
    const orders = hzToOrders(valueHz, rpm);
    // resolveFrequencyDisplayUnit guarantees a finite value here.
    const value = orders ?? 0;
    return {
      unit: "orders",
      value,
      text: `${roundTo(value, 2).toFixed(2)} orders`,
      ordersFallback: false,
      fallbackHint: null
    };
  }
  return {
    unit: "Hz",
    value: valueHz,
    text: `${roundTo(valueHz, digits).toFixed(digits)} Hz`,
    ordersFallback,
    fallbackHint: ordersFallback ? ORDERS_FALLBACK_HINT : null
  };
}

/** Numeric frequency in the selected display unit (for chart x-values). */
export function frequencyValueForDisplay(
  valueHz: number,
  unit: FrequencyDisplayUnit,
  rpm: number | null | undefined
): number {
  const resolved = resolveFrequencyDisplayUnit(unit, rpm);
  if (resolved === "CPM") return hzToCpm(valueHz);
  if (resolved === "orders") return hzToOrders(valueHz, rpm) ?? valueHz;
  return valueHz;
}

/** Short axis/tooltip label for the frequency unit actually rendered. */
export function frequencyUnitLabel(
  unit: FrequencyDisplayUnit,
  rpm: number | null | undefined
): FrequencyDisplayUnit {
  return resolveFrequencyDisplayUnit(unit, rpm);
}
