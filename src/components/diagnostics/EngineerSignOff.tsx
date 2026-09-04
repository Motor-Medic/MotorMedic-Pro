/**
 * Certified engineer sign-off.
 *
 * The sign-off section has been removed from the workflow. The CMMS payload
 * still carries the "PENDING ENGINEER SIGN-OFF - AI recommendation not yet
 * certified" field (see lib/diagnostics/cmmsPayload.ts), so the exported
 * payload remains correct without this UI.
 */

import type { DiagnosisSignOff } from "../../lib/diagnostics/signOff";

export interface EngineerSignOffProps {
  /** Saved analysis_results id; null until the analysis is persisted. */
  diagnosisId: string | null;
  signOff: DiagnosisSignOff | null;
  /** Logged-in user, used only to pre-fill the field — still editable. */
  defaultEngineerName?: string;
  onSaved: (signOff: DiagnosisSignOff) => void;
  onToast?: (
    message: string,
    type?: "success" | "info" | "warning" | "error"
  ) => void;
  /** Called after a successful approval, to dispatch the work order. */
  onDispatchWorkOrder?: (signOff: DiagnosisSignOff) => void;
}

export default function EngineerSignOff(_props: EngineerSignOffProps) {
  return null;
}
