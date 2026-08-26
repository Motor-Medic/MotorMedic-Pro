/**
 * Work-order prose composed from saved records.
 *
 * A CMMS description is the part of a payload a planner actually reads, so it
 * is also the easiest place for a plausible-sounding invented sentence to
 * survive. Everything here is therefore derived from three sources only: the
 * saved diagnosis, the measured exceedances the Fusion Matrix already renders,
 * or an explicit statement that nothing was recorded.
 */

import type { DiagnosisSeverity } from "./cmmsPayload";

export type DescriptionTier =
  /** A saved diagnosis exists; its fault and rationale drive the text. */
  | "diagnosis"
  /** No diagnosis, but saved readings have measured exceedances. */
  | "measurements"
  /** Nothing on file. */
  | "none";

export interface WorkOrderDescription {
  tier: DescriptionTier;
  text: string;
}

/** Measured readings for one technology, as the Fusion Matrix renders them. */
export interface EvidenceGroup {
  label: string;
  details: string[];
}

export const NO_FINDINGS_TEXT = "No diagnostic findings recorded.";

const SEVERITY_LABEL: Record<DiagnosisSeverity, string> = {
  CRITICAL: "Critical",
  ANOMALY: "Anomaly",
  NORMAL: "Normal"
};

function assetPhrase(assetTag: string, component: string): string {
  return [assetTag.trim(), component.trim()].filter(Boolean).join(" ") || "the asset";
}

/** Drop groups that carry no readings so an empty technology never prints. */
export function usableEvidence(groups: EvidenceGroup[]): EvidenceGroup[] {
  return groups
    .map((g) => ({ label: g.label, details: g.details.filter((d) => d.trim() !== "") }))
    .filter((g) => g.details.length > 0);
}

/**
 * The tiered description. Tier 2 reuses the Fusion Matrix's own evidence
 * strings verbatim, so a planner reading the work order and an engineer
 * reading the matrix are quoting identical numbers.
 */
export function composeWorkOrderDescription(input: {
  assetTag: string;
  component: string;
  faultTitle: string;
  severity: DiagnosisSeverity;
  rationale?: string | null;
  evidence?: EvidenceGroup[];
}): WorkOrderDescription {
  const where = assetPhrase(input.assetTag, input.component);
  const fault = input.faultTitle.trim();

  if (fault !== "") {
    const rationale = input.rationale?.trim();
    return {
      tier: "diagnosis",
      text:
        `${fault} detected on ${where}. ` +
        `Severity recorded as ${SEVERITY_LABEL[input.severity]}.` +
        (rationale ? `\n\n${rationale}` : "")
    };
  }

  const groups = usableEvidence(input.evidence ?? []);
  if (groups.length > 0) {
    return {
      tier: "measurements",
      text:
        `No saved diagnosis for ${where}. ` +
        `Composed from the latest saved readings:\n` +
        groups.map((g) => `${g.label}: ${g.details.join("; ")}`).join("\n")
    };
  }

  return { tier: "none", text: NO_FINDINGS_TEXT };
}

/**
 * Confidence follows a fixed priority chain so a number is never shown without
 * saying what produced it: the diagnosis's own stored figure, else the fusion
 * aggregate, else an explicit statement that neither exists.
 */
export function composeConfidenceText(input: {
  storedConfidencePercent: number | null;
  fusionAggregate: number | null;
}): string {
  if (input.storedConfidencePercent != null) {
    return `${Math.round(input.storedConfidencePercent)}% (AI confidence)`;
  }
  if (input.fusionAggregate != null) {
    return `${Math.round(input.fusionAggregate)}% (multi-domain corroboration)`;
  }
  return "Cross-validation pending";
}

/**
 * Why a severity earns its priority. These describe this tool's own triage
 * policy rather than any observed fact about the asset, so they stay true
 * regardless of what the readings turn out to be.
 */
const PRIORITY_REASON: Record<DiagnosisSeverity, string> = {
  CRITICAL: "critical severity recorded, expedite ahead of routine work",
  ANOMALY: "anomaly recorded, plan into the next maintenance window",
  NORMAL: "no exceedance recorded, handle as routine work"
};

export interface PriorityCode {
  code: string;
  label: string;
}

/** "1 - Very High (critical severity recorded, expedite ahead of routine work)" */
export function composePriorityText(
  priority: PriorityCode,
  severity: DiagnosisSeverity
): string {
  // Word-based systems use the label as the code; don't print it twice.
  const head =
    priority.code === priority.label
      ? priority.label
      : `${priority.code} - ${priority.label}`;
  return `${head} (${PRIORITY_REASON[severity]})`;
}
