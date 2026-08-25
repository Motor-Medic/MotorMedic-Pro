/**
 * Fault families — the shared vocabulary that lets one technology's finding be
 * compared against another's.
 *
 * Cross-technology corroboration needs a common noun. A vibration engine says
 * "Outer Race Bearing Defect (BPFO)" and an oil lab says "Fe 120 ppm"; neither
 * string matches the other, but both belong to the `bearing` family. Every
 * classifier here works off text already saved in the database — nothing is
 * inferred from data the user never recorded.
 */

export type FaultFamily =
  | "bearing"
  | "gear"
  | "misalignment"
  | "unbalance"
  | "looseness"
  | "electrical"
  | "lubrication"
  | "contamination"
  | "leak"
  | "thermal"
  | "cavitation"
  | "unknown";

export const FAULT_FAMILY_LABEL: Record<FaultFamily, string> = {
  bearing: "Bearing",
  gear: "Gear",
  misalignment: "Misalignment",
  unbalance: "Unbalance",
  looseness: "Looseness",
  electrical: "Electrical",
  lubrication: "Lubrication / Varnish",
  contamination: "Contamination",
  leak: "Leak",
  thermal: "Thermal",
  cavitation: "Cavitation",
  unknown: "Unclassified"
};

/**
 * Keyword patterns per family, most specific first. Order matters: a string
 * containing both "bearing" and "lubrication" is classified by whichever
 * family appears earlier in this list.
 */
const FAMILY_PATTERNS: { family: FaultFamily; pattern: RegExp }[] = [
  {
    family: "bearing",
    pattern:
      /\b(bearing|bpfo|bpfi|bsf|ftf|outer race|inner race|race defect|spall|brinell)\b/i
  },
  {
    family: "gear",
    pattern: /\b(gear|gmf|mesh|tooth|pinion|backlash)\b/i
  },
  {
    family: "misalignment",
    pattern: /\b(misalign|alignment|angular offset|parallel offset|soft foot)\b/i
  },
  {
    family: "unbalance",
    pattern: /\b(unbalance|imbalance|out of balance|1x radial)\b/i
  },
  {
    family: "looseness",
    pattern: /\b(loose|looseness|structural resonance|rocking|bolt)\b/i
  },
  {
    family: "electrical",
    pattern:
      /\b(electrical|rotor bar|stator|winding|insulation|phase|partial discharge|corona|arcing|vfd|broken bar|air gap)\b/i
  },
  {
    family: "cavitation",
    pattern: /\b(cavitat|npsh|starvation|recirculation)\b/i
  },
  {
    family: "leak",
    pattern: /\b(leak|leakage|orifice|steam trap|valve pass|blow[- ]?by)\b/i
  },
  {
    family: "lubrication",
    pattern:
      /\b(lubricat|varnish|oxidation|antioxidant|ruler|mpc|additive depletion|starved|grease|friction)\b/i
  },
  {
    family: "contamination",
    pattern:
      /\b(contamin|particle|ingress|dirt|silica|silicon|water|moisture|cleanliness|iso 4406|abrasive|siltation)\b/i
  },
  {
    family: "thermal",
    pattern:
      /\b(thermal|overheat|hot spot|hotspot|overload|temperature rise|delta ?t|connection heat)\b/i
  }
];

/** Classify a saved fault string into a family. Unmatched text is `unknown`. */
export function classifyFaultFamily(text?: string | null): FaultFamily {
  if (!text) return "unknown";
  for (const { family, pattern } of FAMILY_PATTERNS) {
    if (pattern.test(text)) return family;
  }
  return "unknown";
}

/**
 * Families that legitimately corroborate one another across technologies.
 *
 * These are causal neighbours, not synonyms: contamination drives abrasive
 * bearing wear, lubrication loss drives bearing distress, and both bearing
 * damage and electrical faults show up as heat. A pair listed here scores as a
 * match; anything else does not.
 */
const RELATED_FAMILIES: Partial<Record<FaultFamily, FaultFamily[]>> = {
  bearing: ["lubrication", "contamination", "thermal"],
  gear: ["lubrication", "contamination"],
  lubrication: ["bearing", "gear", "thermal"],
  contamination: ["bearing", "gear"],
  electrical: ["thermal"],
  thermal: ["electrical", "bearing", "lubrication"],
  cavitation: ["bearing"],
  misalignment: ["bearing", "looseness"],
  unbalance: ["looseness"],
  looseness: ["misalignment", "unbalance"]
};

/**
 * True when two families describe the same problem or a documented cause-effect
 * pair. `unknown` never matches — an unclassified finding cannot corroborate.
 */
export function familiesCorroborate(a: FaultFamily, b: FaultFamily): boolean {
  if (a === "unknown" || b === "unknown") return false;
  if (a === b) return true;
  return (RELATED_FAMILIES[a] ?? []).includes(b);
}
