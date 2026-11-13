/**
 * Airborne vs contact / structure-borne probe typing.
 *
 * The same dBµV number means different things depending on how it was
 * captured: an airborne probe measures radiated sound (leaks, electrical
 * discharge) while a contact / stethoscope module measures structure-borne
 * vibration (bearings, gear mesh). Those are separate quantities and must
 * never share one unlabeled trend axis or severity ladder.
 *
 * Legacy rows without a stored probe type resolve to `unknown` and are
 * labelled as unclassified — never silently treated as contact.
 */
import { classifyFaultFamily, type FaultFamily } from "../diagnostics/faultFamily";

export type UltrasoundProbeType = "airborne" | "contact" | "unknown";

export const ULTRASOUND_PROBE_TYPES: readonly UltrasoundProbeType[] = [
  "airborne",
  "contact",
  "unknown",
] as const;

export const ULTRASOUND_PROBE_LABEL: Record<UltrasoundProbeType, string> = {
  airborne: "Airborne",
  contact: "Contact / structure-borne",
  unknown: "Probe unclassified",
};

/** Input labels offered by the capture form. */
export const ULTRASOUND_PROBE_OPTIONS: readonly {
  value: UltrasoundProbeType;
  label: string;
}[] = [
  { value: "airborne", label: "Airborne probe (radiated sound)" },
  { value: "contact", label: "Contact / stethoscope (structure-borne)" },
  { value: "unknown", label: "Not recorded / unclassified" },
];

export function normalizeProbeType(raw: unknown): UltrasoundProbeType {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  // "non-contact" contains "contact" but is explicitly an airborne method, so
  // the airborne branch must be evaluated first.
  if (
    s.includes("airborne") ||
    s.includes("parabolic") ||
    s.includes("flexible") ||
    s.includes("laser") ||
    s.includes("non-contact") ||
    s.includes("non contact")
  ) {
    return "airborne";
  }
  if (s.includes("contact") || s.includes("stethoscope") || s.includes("structure")) {
    return "contact";
  }
  return "unknown";
}

/** Derive a default coupling from the stored transducer label. */
export function deriveProbeTypeFromTransducer(
  transducer: unknown
): UltrasoundProbeType {
  const s = String(transducer ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (
    s.includes("contact") ||
    s.includes("stethoscope") ||
    s.includes("direct mount")
  ) {
    return "contact";
  }
  if (
    s.includes("airborne") ||
    s.includes("parabolic") ||
    s.includes("flexible") ||
    s.includes("laser")
  ) {
    return "airborne";
  }
  return "unknown";
}

/**
 * Prefer an explicitly stored coupling; fall back to the transducer label.
 * An explicit `unknown` is respected (the operator said they did not record it).
 */
export function resolveProbeType(
  raw: unknown,
  transducer?: unknown
): UltrasoundProbeType {
  const explicit = normalizeProbeType(raw);
  if (explicit !== "unknown" || String(raw ?? "").trim()) return explicit;
  return deriveProbeTypeFromTransducer(transducer);
}

export type UsAcousticDomain =
  | "structure-borne-mechanical"
  | "airborne-leak"
  | "electrical"
  | "valve"
  | "unknown";

/** Classify what the reading physically represents from stored mode + fault. */
export function usAcousticDomain(
  modeRaw: unknown,
  faultText?: unknown
): UsAcousticDomain {
  const mode = String(modeRaw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (mode.includes("leak")) return "airborne-leak";
  if (mode === "electrical" || mode === "pd" || mode === "partial_discharge") {
    return "electrical";
  }
  if (mode === "valve" || mode.includes("steam") || mode.includes("trap")) {
    return "valve";
  }
  if (mode.includes("mechanical") || mode.includes("bearing")) {
    return "structure-borne-mechanical";
  }

  const family: FaultFamily = classifyFaultFamily(
    typeof faultText === "string" ? faultText : undefined
  );
  if (
    family === "bearing" ||
    family === "gear" ||
    family === "lubrication" ||
    family === "misalignment" ||
    family === "looseness" ||
    family === "unbalance"
  ) {
    return "structure-borne-mechanical";
  }
  if (family === "leak") return "airborne-leak";
  if (family === "electrical") return "electrical";
  if (family === "cavitation") return "structure-borne-mechanical";
  return "unknown";
}

/**
 * The UE Systems delta-dB ladder describes structure-borne bearing condition.
 * It may only be applied to contact (or unclassified legacy) mechanical data.
 * Airborne leak / electrical / valve readings are descriptive-only.
 */
export function bearingLadderApplicable(input: {
  probeType: UltrasoundProbeType;
  domain: UsAcousticDomain;
}): boolean {
  if (input.probeType === "airborne") return false;
  return input.domain === "structure-borne-mechanical";
}

/** Short disclosure printed beside gated severity output. */
export const US_BEARING_LADDER_GATE_NOTE =
  "UE Systems bearing-condition ladder applies only to contact/structure-borne mechanical readings; airborne leak and electrical scans are descriptive-only (no ISO severity standard exists for ultrasound)";
