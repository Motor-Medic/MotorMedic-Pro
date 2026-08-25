/**
 * Certified engineer sign-off — client helpers.
 *
 * Sign-off is keyed on a saved `analysis_results.id`, so a diagnosis must be
 * persisted before it can be approved. A diagnosis with no sign-off row is
 * pending; the API returns null rather than a 404 for that case.
 */

export const DIAGNOSIS_SIGN_OFF_PATH = "/api/diagnosis-sign-off";

export type SignOffStatus = "pending" | "approved" | "modified";

export interface DiagnosisSignOff {
  id: string;
  diagnosis_id: string;
  status: SignOffStatus;
  engineer_name: string | null;
  override_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveSignOffInput {
  diagnosisId: string;
  status: SignOffStatus;
  engineerName: string;
  overrideNote?: string;
}

export const SIGN_OFF_STATUS_LABEL: Record<SignOffStatus, string> = {
  pending: "AI Prescriptive Recommendation - Pending Engineer Sign-off",
  approved: "Approved & Dispatched",
  modified: "Modified by Engineer"
};

/** Returns null when the diagnosis has no sign-off yet (i.e. still pending). */
export async function fetchSignOff(
  diagnosisId: string
): Promise<DiagnosisSignOff | null> {
  const res = await fetch(
    `${DIAGNOSIS_SIGN_OFF_PATH}?diagnosisId=${encodeURIComponent(diagnosisId)}`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || "Failed to load sign-off");
  }
  return (data?.signOff as DiagnosisSignOff | null) ?? null;
}

export async function saveSignOff(
  input: SaveSignOffInput
): Promise<DiagnosisSignOff> {
  const res = await fetch(DIAGNOSIS_SIGN_OFF_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || "Failed to save sign-off");
  }
  return data.signOff as DiagnosisSignOff;
}

/** "Verified by Dana Ruiz at Aug 24, 2026, 3:27 PM" */
export function formatVerification(signOff: DiagnosisSignOff): string {
  const who = signOff.engineer_name || "unnamed engineer";
  const when = new Date(signOff.updated_at || signOff.created_at);
  const stamp = Number.isNaN(when.getTime())
    ? signOff.updated_at
    : when.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
  return `Verified by ${who} at ${stamp}`;
}
