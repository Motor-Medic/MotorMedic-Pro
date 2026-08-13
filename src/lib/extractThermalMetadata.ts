/**
 * Thermal / radiometric EXIF + XMP metadata extractor.
 * Uses `exifr` to read camera tags commonly embedded by FLIR / Testo / Fluke / etc.
 *
 * Standard JPEG screenshots usually have no radiometric tags — returns empty found=false.
 */

import exifr from "exifr";

export const EXTRACT_THERMAL_METADATA_API_PATH = "/api/extract-thermal-metadata";

export interface ThermalImageMetadata {
  emissivity: number | null;
  /** Ambient / atmospheric temperature in the unit indicated by tempUnit */
  ambientTemp: number | null;
  reflectedTemp: number | null;
  /** Object distance in the unit indicated by distanceUnit */
  distance: number | null;
  humidity: number | null;
  tempUnit: "°C" | "°F" | null;
  distanceUnit: "m" | "ft" | null;
  /** Raw tag map for debugging (optional keys only) */
  rawTags?: Record<string, unknown>;
  found: boolean;
  sourceTags: string[];
}

function asFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.+\-eE]/g, "").trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object" && value !== null && "value" in (value as object)) {
    return asFiniteNumber((value as { value: unknown }).value);
  }
  return null;
}

function flattenTags(input: unknown, out: Record<string, unknown> = {}, prefix = ""): Record<string, unknown> {
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      // Keep leaf-ish scalars; also recurse one level for nested XMP bags
      const entries = Object.entries(v as Record<string, unknown>);
      const mostlyScalar = entries.every(
        ([, ev]) =>
          ev == null ||
          typeof ev === "string" ||
          typeof ev === "number" ||
          typeof ev === "boolean"
      );
      if (mostlyScalar && entries.length <= 12) {
        for (const [sk, sv] of entries) {
          out[`${key}.${sk}`] = sv;
          out[sk] = out[sk] ?? sv;
        }
      }
      flattenTags(v, out, key);
    } else {
      out[key] = v;
      out[k] = out[k] ?? v;
    }
  }
  return out;
}

function findByAliases(
  flat: Record<string, unknown>,
  aliases: string[]
): { value: number | null; tag: string | null } {
  const lowerMap = new Map<string, { original: string; value: unknown }>();
  for (const [k, v] of Object.entries(flat)) {
    lowerMap.set(k.toLowerCase().replace(/[\s_\-]/g, ""), { original: k, value: v });
  }
  for (const alias of aliases) {
    const norm = alias.toLowerCase().replace(/[\s_\-]/g, "");
    const hit = lowerMap.get(norm);
    if (!hit) continue;
    const n = asFiniteNumber(hit.value);
    if (n != null) return { value: n, tag: hit.original };
  }
  // Partial contains match (e.g. "ReflectedApparentTemperature")
  for (const alias of aliases) {
    const norm = alias.toLowerCase().replace(/[\s_\-]/g, "");
    for (const [k, entry] of lowerMap) {
      if (k.includes(norm) || norm.includes(k)) {
        const n = asFiniteNumber(entry.value);
        if (n != null) return { value: n, tag: entry.original };
      }
    }
  }
  return { value: null, tag: null };
}

function guessTempUnit(flat: Record<string, unknown>, ambient: number | null): "°C" | "°F" | null {
  const unitHit = findByAliases(flat, [
    "TemperatureUnit",
    "TempUnit",
    "PlanckUnit",
    "IRTemperatureUnit"
  ]);
  const raw = unitHit.tag
    ? String(flat[unitHit.tag] ?? "").toLowerCase()
    : "";
  if (raw.includes("f") || raw.includes("fahrenheit")) return "°F";
  if (raw.includes("c") || raw.includes("celsius")) return "°C";
  // Heuristic: ambient outdoor plant temps rarely > 70°C in EXIF without being °F mislabel
  if (ambient != null && ambient > 80 && ambient < 200) return "°F";
  if (ambient != null) return "°C";
  return null;
}

function guessDistanceUnit(flat: Record<string, unknown>, distance: number | null): "m" | "ft" | null {
  const unitHit = findByAliases(flat, ["ObjectDistanceUnit", "DistanceUnit", "FocusDistanceUnit"]);
  const raw = unitHit.tag ? String(flat[unitHit.tag] ?? "").toLowerCase() : "";
  if (raw.includes("ft") || raw.includes("feet")) return "ft";
  if (raw.includes("m") || raw.includes("meter")) return "m";
  // Radiometric cameras almost always store meters
  if (distance != null) return "m";
  return null;
}

function normalizeHumidity(n: number | null): number | null {
  if (n == null) return null;
  // Some cameras store 0–1 fraction
  if (n > 0 && n <= 1) return Number((n * 100).toFixed(1));
  if (n < 0 || n > 100) return null;
  return Number(n.toFixed(1));
}

function normalizeEmissivity(n: number | null): number | null {
  if (n == null) return null;
  // Occasionally stored as percent
  if (n > 1 && n <= 100) return Number((n / 100).toFixed(3));
  if (n < 0.01 || n > 1) return null;
  return Number(n.toFixed(3));
}

/**
 * Extract radiometric / environmental tags from an image buffer or ArrayBuffer.
 */
export async function extractThermalMetadata(
  imageBuffer: Buffer | ArrayBuffer | Uint8Array
): Promise<ThermalImageMetadata> {
  const empty: ThermalImageMetadata = {
    emissivity: null,
    ambientTemp: null,
    reflectedTemp: null,
    distance: null,
    humidity: null,
    tempUnit: null,
    distanceUnit: null,
    found: false,
    sourceTags: []
  };

  try {
    const parsed = await exifr.parse(imageBuffer as Buffer, {
      tiff: true,
      xmp: true,
      icc: false,
      iptc: true,
      jfif: false,
      ihdr: false,
      // Multi-segment + maker notes help FLIR / Testo radiometric JPEGs
      mergeOutput: true,
      reviveValues: true,
      translateKeys: true,
      translateValues: true
    });

    if (!parsed || typeof parsed !== "object") {
      return empty;
    }

    const flat = flattenTags(parsed);
    const sourceTags: string[] = [];

    const emis = findByAliases(flat, [
      "Emissivity",
      "EmissivityValue",
      "ObjectEmissivity",
      "Epsilon",
      "ε"
    ]);
    const ambient = findByAliases(flat, [
      "AtmosphericTemperature",
      "AtmosphericTemp",
      "AmbientTemperature",
      "AmbientTemp",
      "AirTemperature",
      "IRWindowTemperature"
    ]);

    const reflected = findByAliases(flat, [
      "ReflectedApparentTemperature",
      "ReflectedTemperature",
      "ReflectedTemp",
      "ApparentReflectedTemperature",
      "BackgroundTemperature",
      "ReflectedApparentTemp"
    ]);
    const distance = findByAliases(flat, [
      "ObjectDistance",
      "Distance",
      "FocusDistance",
      "SubjectDistance"
    ]);
    const humidity = findByAliases(flat, [
      "RelativeHumidity",
      "Humidity",
      "AtmosphericHumidity",
      "RH"
    ]);

    const emissivity = normalizeEmissivity(emis.value);
    if (emissivity != null && emis.tag) sourceTags.push(emis.tag);

    let ambientTemp = ambient.value;
    // Filter absurd Planck constants mistaken as ambient
    if (ambientTemp != null && (ambientTemp < -80 || ambientTemp > 500)) {
      ambientTemp = null;
    } else if (ambientTemp != null && ambient.tag) {
      sourceTags.push(ambient.tag);
    }

    let reflectedTemp = reflected.value;
    if (reflectedTemp != null && (reflectedTemp < -80 || reflectedTemp > 500)) {
      reflectedTemp = null;
    } else if (reflectedTemp != null && reflected.tag) {
      sourceTags.push(reflected.tag);
    }

    let distanceVal = distance.value;
    if (distanceVal != null && (distanceVal < 0 || distanceVal > 10000)) {
      distanceVal = null;
    } else if (distanceVal != null && distance.tag) {
      sourceTags.push(distance.tag);
    }

    const humidityPct = normalizeHumidity(humidity.value);
    if (humidityPct != null && humidity.tag) sourceTags.push(humidity.tag);

    const tempUnit = guessTempUnit(flat, ambientTemp);
    const distanceUnit = guessDistanceUnit(flat, distanceVal);

    const found =
      emissivity != null ||
      ambientTemp != null ||
      reflectedTemp != null ||
      distanceVal != null ||
      humidityPct != null;

    return {
      emissivity,
      ambientTemp: ambientTemp != null ? Number(ambientTemp.toFixed(2)) : null,
      reflectedTemp: reflectedTemp != null ? Number(reflectedTemp.toFixed(2)) : null,
      distance: distanceVal != null ? Number(distanceVal.toFixed(2)) : null,
      humidity: humidityPct,
      tempUnit,
      distanceUnit,
      found,
      sourceTags,
      rawTags: found
        ? {
            emissivity: emis.value,
            ambient: ambient.value,
            reflected: reflected.value,
            distance: distance.value,
            humidity: humidity.value
          }
        : undefined
    };
  } catch (err) {
    console.warn("[extractThermalMetadata] Parse failed:", (err as Error)?.message || err);
    return empty;
  }
}

/** Convert °C ↔ °F for form population. */
export function convertTemp(
  value: number,
  from: "°C" | "°F",
  to: "°C" | "°F"
): number {
  if (from === to) return value;
  if (from === "°C" && to === "°F") return Number(((value * 9) / 5 + 32).toFixed(2));
  return Number((((value - 32) * 5) / 9).toFixed(2));
}

export function convertDistance(
  value: number,
  from: "m" | "ft",
  to: "m" | "ft"
): number {
  if (from === to) return value;
  if (from === "m" && to === "ft") return Number((value * 3.28084).toFixed(2));
  return Number((value / 3.28084).toFixed(2));
}
