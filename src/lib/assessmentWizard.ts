/**
 * ASSESSMENT-WIZARD - pure rules shared by the API, the wizard UI and tests.
 *
 * Disposition vocabulary is fixed by the product requirement (exactly one of
 * four). The database mirrors it with a CHECK constraint so an invalid value
 * can never be persisted even if a future caller skips this validator.
 */

import { failureModeLabel, isFailureModeKey } from "./failureModes";

export const ASSESSMENT_LINK_MISSING_STATUS = 404;

export const ASSESSMENT_DISPOSITIONS = [
  { key: "none", label: "No Identifiable Defect" },
  { key: "anomaly", label: "Anomaly Present" },
  { key: "defect", label: "Defect Identified" },
  { key: "unable", label: "Unable to Complete Assessment" }
] as const;

export type AssessmentDisposition =
  (typeof ASSESSMENT_DISPOSITIONS)[number]["key"];

export function isAssessmentDisposition(
  value: unknown
): value is AssessmentDisposition {
  return (
    typeof value === "string" &&
    ASSESSMENT_DISPOSITIONS.some((item) => item.key === value)
  );
}

export function dispositionLabel(value: unknown): string {
  return (
    ASSESSMENT_DISPOSITIONS.find((item) => item.key === value)?.label ??
    "Unknown Disposition"
  );
}

export interface RequiredMetadataField {
  key: string;
  label: string;
  placeholder: string;
}

/**
 * REQUIRED fields enforced by step 1. These are the component metadata items
 * the wizard treats as prerequisites for a standardized assessment; they map
 * to existing component/asset data rather than a new schema.
 */
export const REQUIRED_METADATA_FIELDS: readonly RequiredMetadataField[] = [
  {
    key: "bearing_type",
    label: "Bearing Type",
    placeholder: "e.g. 6314-C3"
  },
  {
    key: "coupling_type",
    label: "Coupling Type",
    placeholder: "e.g. Flexible Grid"
  },
  {
    key: "baseplate",
    label: "Baseplate",
    placeholder: "e.g. Fabricated steel baseplate"
  },
  {
    key: "criticality",
    label: "Criticality",
    placeholder: "e.g. High"
  }
];

export const REQUIRED_METADATA_KEYS: readonly string[] =
  REQUIRED_METADATA_FIELDS.map((field) => field.key);

export function isMetadataValueMissing(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Returns the field keys whose value is null/empty, in UI order. */
export function findMissingMetadata(
  metadata: Record<string, unknown>
): string[] {
  return REQUIRED_METADATA_KEYS.filter((key) =>
    isMetadataValueMissing(metadata[key])
  );
}

export function missingMetadataLabels(keys: readonly string[]): string[] {
  const byKey = new Map(REQUIRED_METADATA_FIELDS.map((f) => [f.key, f.label]));
  return keys.map((key) => byKey.get(key) ?? key);
}

export interface ComponentAssessmentRow {
  id: number;
  tenant_id: number;
  component_id: number;
  alert_id?: string | null;
  failure_mode_key?: string | null;
  disposition: AssessmentDisposition;
  notes?: string | null;
  metadata_missing_at_assessment?: string[] | null;
  assessed_by?: number | null;
  assessed_at?: string | Date | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
}

export interface AssessmentLinkRefs {
  component_id?: number | null;
  alert_id?: string | null;
}

export interface AssessmentOwnedLinks {
  components: ReadonlySet<number>;
  alerts: ReadonlySet<string>;
}

export type AssessmentLinkField = "component_id" | "alert_id";

export type AssessmentLinkValidation =
  | { ok: true }
  | {
      ok: false;
      status: typeof ASSESSMENT_LINK_MISSING_STATUS;
      field: AssessmentLinkField;
      id: string | number;
      error: string;
    };

/**
 * A cross-tenant component/alert link is indistinguishable from a missing one:
 * both return 404 so the API never confirms that another tenant's row exists.
 */
export function validateAssessmentLinks(
  refs: AssessmentLinkRefs,
  owned: AssessmentOwnedLinks
): AssessmentLinkValidation {
  if (refs.component_id != null) {
    const id = Number(refs.component_id);
    if (!Number.isSafeInteger(id) || !owned.components.has(id)) {
      return {
        ok: false,
        status: ASSESSMENT_LINK_MISSING_STATUS,
        field: "component_id",
        id: refs.component_id,
        error: "Component not found."
      };
    }
  }
  if (refs.alert_id != null && String(refs.alert_id).trim() !== "") {
    const id = String(refs.alert_id).trim();
    if (!owned.alerts.has(id)) {
      return {
        ok: false,
        status: ASSESSMENT_LINK_MISSING_STATUS,
        field: "alert_id",
        id,
        error: "Alert not found."
      };
    }
  }
  return { ok: true };
}

export interface AssessmentDraftInput {
  disposition?: unknown;
  failure_mode_key?: unknown;
  metadata_missing_at_assessment?: unknown;
  notes?: unknown;
}

export type AssessmentDraftValidation =
  | {
      ok: true;
      disposition: AssessmentDisposition;
      failureModeKey: string | null;
      metadataMissing: string[];
      notes: string | null;
    }
  | { ok: false; error: string; field: string };

export function validateAssessmentDraft(
  input: AssessmentDraftInput
): AssessmentDraftValidation {
  if (!isAssessmentDisposition(input.disposition)) {
    return {
      ok: false,
      field: "disposition",
      error:
        "Disposition must be one of: none, anomaly, defect, unable."
    };
  }

  let failureModeKey: string | null = null;
  if (input.failure_mode_key != null && String(input.failure_mode_key).trim() !== "") {
    const key = String(input.failure_mode_key).trim();
    if (!isFailureModeKey(key)) {
      return {
        ok: false,
        field: "failure_mode_key",
        error: "Failure mode key is not in the starter taxonomy."
      };
    }
    failureModeKey = key;
  }

  let metadataMissing: string[] = [];
  if (input.metadata_missing_at_assessment != null) {
    if (!Array.isArray(input.metadata_missing_at_assessment)) {
      return {
        ok: false,
        field: "metadata_missing_at_assessment",
        error: "metadata_missing_at_assessment must be an array of field names."
      };
    }
    metadataMissing = Array.from(
      new Set(
        input.metadata_missing_at_assessment
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter((item) => item !== "")
      )
    );
  }

  const notes =
    typeof input.notes === "string" && input.notes.trim()
      ? input.notes.trim()
      : null;

  return { ok: true, disposition: input.disposition, failureModeKey, metadataMissing, notes };
}

/** Human-readable summary line used by step 4 and the detail-view badge. */
export function assessmentSummaryLine(
  assessment: Pick<ComponentAssessmentRow, "disposition" | "failure_mode_key">
): string {
  const mode = assessment.failure_mode_key
    ? failureModeLabel(assessment.failure_mode_key)
    : "No failure mode";
  return `${dispositionLabel(assessment.disposition)} · ${mode}`;
}
