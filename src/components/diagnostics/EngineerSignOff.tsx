/**
 * Certified engineer sign-off.
 *
 * Sign-off is persisted against the saved diagnosis id, so it survives reloads
 * and is read back by the PDF export and CMMS payload. Until the analysis has
 * been saved there is nothing to sign off against, and the controls say so
 * rather than pretending to record an approval.
 */

import { useCallback, useState } from "react";
import { BadgeCheck, PencilLine, ShieldAlert } from "lucide-react";
import {
  SIGN_OFF_STATUS_LABEL,
  formatVerification,
  saveSignOff,
  type DiagnosisSignOff,
  type SignOffStatus
} from "../../lib/diagnostics/signOff";

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

export default function EngineerSignOff({
  diagnosisId,
  signOff,
  defaultEngineerName = "",
  onSaved,
  onToast,
  onDispatchWorkOrder
}: EngineerSignOffProps) {
  const [engineerName, setEngineerName] = useState(defaultEngineerName);
  const [overrideNote, setOverrideNote] = useState("");
  const [showModifyForm, setShowModifyForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const status: SignOffStatus = signOff?.status ?? "pending";
  const isSigned = status === "approved" || status === "modified";

  const submit = useCallback(
    async (nextStatus: SignOffStatus) => {
      if (!diagnosisId) return;
      const name = engineerName.trim();
      if (!name) {
        onToast?.("Enter the certifying engineer's name first.", "warning");
        return;
      }
      if (nextStatus === "modified" && !overrideNote.trim()) {
        onToast?.("Describe what you changed before saving.", "warning");
        return;
      }
      setSaving(true);
      try {
        const saved = await saveSignOff({
          diagnosisId,
          status: nextStatus,
          engineerName: name,
          overrideNote: overrideNote.trim() || undefined
        });
        onSaved(saved);
        setShowModifyForm(false);
        onToast?.(
          nextStatus === "approved"
            ? "Diagnosis approved and work order dispatched."
            : "Modified diagnosis recorded.",
          "success"
        );
        if (nextStatus === "approved") onDispatchWorkOrder?.(saved);
      } catch (err) {
        onToast?.(
          err instanceof Error ? err.message : "Failed to save sign-off.",
          "error"
        );
      } finally {
        setSaving(false);
      }
    },
    [
      diagnosisId,
      engineerName,
      overrideNote,
      onSaved,
      onToast,
      onDispatchWorkOrder
    ]
  );

  return (
    <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
      <div className="mb-5">
        <h3 className="text-lg font-bold text-white">
          Certified Engineer Sign-off
        </h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Recorded against the saved diagnosis and carried into exports and CMMS
          payloads
        </p>
      </div>

      {isSigned && signOff ? (
        <div
          className={`rounded-lg border p-4 ${
            status === "approved"
              ? "border-green-500/40 bg-green-500/10"
              : "border-yellow-500/40 bg-yellow-500/10"
          }`}
        >
          <div className="flex items-start gap-3">
            {status === "approved" ? (
              <BadgeCheck className="mt-0.5 h-6 w-6 shrink-0 text-green-400" />
            ) : (
              <PencilLine className="mt-0.5 h-6 w-6 shrink-0 text-yellow-300" />
            )}
            <div className="min-w-0">
              <div
                className={`text-sm font-bold uppercase tracking-wide ${
                  status === "approved" ? "text-green-300" : "text-yellow-300"
                }`}
              >
                {SIGN_OFF_STATUS_LABEL[status]}
              </div>
              <p className="mt-1 text-sm text-white">
                {formatVerification(signOff)}
              </p>
              {signOff.override_note && (
                <p className="mt-2 rounded border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
                  <span className="font-semibold text-slate-400">
                    Engineer note:
                  </span>{" "}
                  {signOff.override_note}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-800/40 p-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            <p className="text-sm text-slate-300">
              {SIGN_OFF_STATUS_LABEL.pending}
            </p>
          </div>

          {!diagnosisId ? (
            <p className="rounded-lg border border-dashed border-slate-700 px-4 py-3 text-xs text-slate-500">
              Save this analysis before signing off — a sign-off must reference a
              stored diagnosis record.
            </p>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Certifying Engineer
                </span>
                <input
                  type="text"
                  value={engineerName}
                  onChange={(e) => setEngineerName(e.target.value)}
                  placeholder="Name and certification level, e.g. J. Rivera, CAT III"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                />
              </label>

              {showModifyForm && (
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    What are you changing?
                  </span>
                  <textarea
                    value={overrideNote}
                    onChange={(e) => setOverrideNote(e.target.value)}
                    rows={3}
                    placeholder="Describe the correction to the AI diagnosis and the evidence behind it."
                    className="mt-1 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                  />
                </label>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void submit("approved")}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Approve & Dispatch Work Order"}
                </button>
                {showModifyForm ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void submit("modified")}
                    className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-bold text-slate-900 transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save Modified Diagnosis"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setShowModifyForm(true)}
                    className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
                  >
                    Modify Diagnosis
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
