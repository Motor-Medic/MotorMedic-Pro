import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  X
} from "lucide-react";
import {
  FAILURE_MODE_FAMILY_LABELS,
  failureModeLabel,
  failureModesForFamily,
  type FailureModeFamily,
  type FailureModeNode
} from "../lib/failureModes";
import {
  ASSESSMENT_DISPOSITIONS,
  REQUIRED_METADATA_FIELDS,
  dispositionLabel,
  findMissingMetadata,
  missingMetadataLabels,
  type AssessmentDisposition,
  type ComponentAssessmentRow
} from "../lib/assessmentWizard";

export type AssessmentMetadataValues = Record<string, string>;

export interface AssessmentWizardProps {
  componentId: number;
  componentName: string;
  metadata: AssessmentMetadataValues;
  alertId?: string | null;
  onClose: () => void;
  onSaved: (assessment: ComponentAssessmentRow) => void;
  onMetadataSave?: (
    changes: AssessmentMetadataValues
  ) => Promise<void> | void;
}

const STEPS = [
  { id: 1, label: "Metadata" },
  { id: 2, label: "Failure Mode" },
  { id: 3, label: "Disposition" },
  { id: 4, label: "Summary" }
] as const;

const INPUT =
  "w-full min-h-[40px] rounded-xl bg-slate-900 border border-slate-700 px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FFC700] transition-colors";

const BTN_PRIMARY =
  "min-h-[40px] px-4 rounded-xl bg-[#FFC700] hover:bg-[#e6b400] text-slate-950 text-sm font-bold cursor-pointer transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed";

const BTN_GHOST =
  "min-h-[40px] px-4 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-300 text-sm font-bold cursor-pointer hover:border-slate-500 transition-colors inline-flex items-center justify-center gap-2";

export default function AssessmentWizard({
  componentId,
  componentName,
  metadata: initialMetadata,
  alertId,
  onClose,
  onSaved,
  onMetadataSave
}: AssessmentWizardProps) {
  const [step, setStep] = useState<number>(1);
  const [metadata, setMetadata] = useState<AssessmentMetadataValues>(() => ({
    ...initialMetadata
  }));
  const [editedFields, setEditedFields] = useState<Record<string, boolean>>({});
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [failureFamily, setFailureFamily] =
    useState<FailureModeFamily>("vibration");
  const [failureModeKey, setFailureModeKey] = useState<string | null>(null);
  const [disposition, setDisposition] =
    useState<AssessmentDisposition | null>(null);
  const [notesByDisposition, setNotesByDisposition] = useState<
    Record<string, string>
  >({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const missing = useMemo(() => findMissingMetadata(metadata), [metadata]);
  const failureModes = useMemo(
    () => failureModesForFamily(failureFamily),
    [failureFamily]
  );
  const notes = disposition ? notesByDisposition[disposition] ?? "" : "";

  const patchMetadata = (key: string, value: string) => {
    setMetadata((prev) => ({ ...prev, [key]: value }));
    setEditedFields((prev) => ({ ...prev, [key]: true }));
  };

  const persistEditedMetadata = async () => {
    const changes: AssessmentMetadataValues = {};
    for (const field of REQUIRED_METADATA_FIELDS) {
      if (editedFields[field.key]) changes[field.key] = metadata[field.key] ?? "";
    }
    if (Object.keys(changes).length === 0 || !onMetadataSave) return true;
    setSavingMetadata(true);
    try {
      await onMetadataSave(changes);
      return true;
    } catch {
      setError("Could not save the edited metadata. Try again.");
      return false;
    } finally {
      setSavingMetadata(false);
    }
  };

  const goNext = async () => {
    setError("");
    if (step === 1) {
      const remaining = findMissingMetadata(metadata);
      if (remaining.length > 0) {
        const labels = missingMetadataLabels(remaining).join(", ");
        const confirmed = window.confirm(
          `These REQUIRED fields are still MISSING:\n\n${labels}\n\nSkip anyway? The assessment will record them as missing.`
        );
        if (!confirmed) return;
      }
      const persisted = await persistEditedMetadata();
      if (!persisted) return;
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }
    if (step === 3) {
      if (!disposition) {
        setError("Select exactly one disposition before continuing.");
        return;
      }
      setStep(4);
    }
  };

  const goBack = () => {
    setError("");
    setStep((prev) => Math.max(1, prev - 1));
  };

  const saveAssessment = async () => {
    if (!disposition) {
      setError("Select exactly one disposition before saving.");
      setStep(3);
      return;
    }
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/component-assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          component_id: componentId,
          alert_id: alertId ?? null,
          failure_mode_key: failureModeKey,
          disposition,
          notes: notesByDisposition[disposition] ?? "",
          metadata_missing_at_assessment: findMissingMetadata(metadata)
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.assessment) {
        setError(payload?.error || "Failed to save the assessment.");
        return;
      }
      onSaved(payload.assessment as ComponentAssessmentRow);
    } catch {
      setError("Failed to save the assessment. Check the connection and retry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assessment-wizard-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-amber-500/30 bg-[#0A0E1A] shadow-[0_0_60px_rgba(0,0,0,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-[#0A0E1A]/95 backdrop-blur-md px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#FFC700]/80">
                Guided Assessment
              </p>
              <h2
                id="assessment-wizard-title"
                className="text-lg font-bold text-white tracking-tight mt-0.5"
              >
                Component Evaluation · {componentName}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[36px] min-w-[36px] rounded-xl border border-slate-600 bg-slate-800/80 text-slate-300 cursor-pointer hover:text-white hover:border-slate-400 inline-flex items-center justify-center"
              aria-label="Close assessment wizard"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <ol className="mt-4 grid grid-cols-4 gap-2">
            {STEPS.map((item) => {
              const active = step === item.id;
              const complete = step > item.id;
              return (
                <li key={item.id} className="min-w-0">
                  <div
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                      active
                        ? "border-[#FFC700]/60 bg-[#FFC700]/10"
                        : complete
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : "border-slate-800 bg-slate-950/40"
                    }`}
                  >
                    <span
                      className={`h-5 w-5 shrink-0 rounded-full text-[10px] font-bold inline-flex items-center justify-center ${
                        active
                          ? "bg-[#FFC700] text-slate-950"
                          : complete
                            ? "bg-emerald-500 text-slate-950"
                            : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {complete ? <Check className="h-3 w-3" /> : item.id}
                    </span>
                    <span
                      className={`truncate text-[10px] font-bold uppercase tracking-wider ${
                        active ? "text-[#FFC700]" : "text-slate-400"
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="p-5 space-y-5">
          {error ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
              {error}
            </div>
          ) : null}

          {step === 1 ? (
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Metadata Completeness
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  REQUIRED fields that are null or empty are flagged MISSING.
                  Edit them inline, or skip with confirmation.
                </p>
              </div>

              {missing.length > 0 ? (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-300">
                    {missing.length} required field
                    {missing.length === 1 ? "" : "s"} missing
                  </p>
                  <p className="text-xs text-red-200/90 mt-1">
                    {missingMetadataLabels(missing).join(" · ")}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
                  All required metadata is present.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {REQUIRED_METADATA_FIELDS.map((field) => {
                  const value = metadata[field.key] ?? "";
                  const isMissing = missing.includes(field.key);
                  return (
                    <label key={field.key} className="block min-w-0 space-y-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {field.label}
                        </span>
                        {isMissing ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                            MISSING
                          </span>
                        ) : null}
                      </span>
                      <input
                        type="text"
                        value={value}
                        placeholder={field.placeholder}
                        onChange={(e) => patchMetadata(field.key, e.target.value)}
                        className={`${INPUT} ${
                          isMissing ? "border-red-500/60" : ""
                        }`}
                      />
                    </label>
                  );
                })}
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Failure Mode Selection
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Starter taxonomy (ISO 14224 family). Pick one mode or record
                  no identifiable mode.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {(["vibration", "oil"] as const).map((family) => {
                  const active = failureFamily === family;
                  return (
                    <button
                      key={family}
                      type="button"
                      onClick={() => setFailureFamily(family)}
                      className={`min-h-[36px] px-3 rounded-xl text-xs font-bold cursor-pointer border transition-colors ${
                        active
                          ? "border-[#FFC700]/60 bg-[#FFC700]/15 text-[#FFC700]"
                          : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                      }`}
                    >
                      {FAILURE_MODE_FAMILY_LABELS[family]}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setFailureModeKey(null)}
                className={`w-full text-left rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                  failureModeKey == null
                    ? "border-[#FFC700]/60 bg-[#FFC700]/10"
                    : "border-slate-800 bg-slate-950/40 hover:border-slate-600"
                }`}
              >
                <span className="text-xs font-bold text-slate-200">
                  No failure mode identified
                </span>
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  Use when the disposition is no identifiable defect or the
                  assessment could not be completed.
                </span>
              </button>

              <div className="space-y-2">
                {failureModes.map((node) => (
                  <FailureModeChoice
                    key={node.key}
                    node={node}
                    selectedKey={failureModeKey}
                    onSelect={setFailureModeKey}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">Disposition</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Select exactly one outcome and add notes for that outcome.
                </p>
              </div>

              <div className="space-y-2">
                {ASSESSMENT_DISPOSITIONS.map((item) => {
                  const active = disposition === item.key;
                  return (
                    <div
                      key={item.key}
                      className={`rounded-xl border transition-colors ${
                        active
                          ? "border-[#FFC700]/60 bg-[#FFC700]/10"
                          : "border-slate-800 bg-slate-950/40"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setDisposition(item.key)}
                        className="w-full text-left px-3 py-2.5 cursor-pointer flex items-center gap-2"
                      >
                        <span
                          className={`h-4 w-4 shrink-0 rounded-full border-2 inline-flex items-center justify-center ${
                            active
                              ? "border-[#FFC700] bg-[#FFC700]"
                              : "border-slate-600"
                          }`}
                        >
                          {active ? (
                            <Check className="h-2.5 w-2.5 text-slate-950" />
                          ) : null}
                        </span>
                        <span className="text-xs font-bold text-slate-200">
                          {item.label}
                        </span>
                      </button>
                      {active ? (
                        <div className="px-3 pb-3">
                          <textarea
                            value={notesByDisposition[item.key] ?? ""}
                            onChange={(e) =>
                              setNotesByDisposition((prev) => ({
                                ...prev,
                                [item.key]: e.target.value
                              }))
                            }
                            placeholder={`Notes for “${item.label}”…`}
                            className={`${INPUT} min-h-[80px] py-2 resize-y`}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Summary &amp; Save
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Review before writing the assessment. It will be saved under
                  your session tenant.
                </p>
              </div>

              <dl className="rounded-xl border border-slate-800 bg-slate-950/50 divide-y divide-slate-800 text-xs">
                <SummaryRow label="Component" value={componentName} />
                <SummaryRow
                  label="Failure Mode"
                  value={
                    failureModeKey
                      ? failureModeLabel(failureModeKey)
                      : "No failure mode identified"
                  }
                />
                <SummaryRow
                  label="Disposition"
                  value={disposition ? dispositionLabel(disposition) : "—"}
                />
                <SummaryRow
                  label="Notes"
                  value={
                    (disposition && notesByDisposition[disposition]) || "—"
                  }
                />
                <SummaryRow
                  label="Metadata Missing"
                  value={
                    missing.length > 0
                      ? missingMetadataLabels(missing).join(", ")
                      : "None"
                  }
                />
              </dl>

              {alertId ? (
                <p className="text-[11px] text-slate-500">
                  Linked alert: <span className="font-mono">{alertId}</span>
                </p>
              ) : null}

              {disposition === "defect" && !failureModeKey ? (
                <p className="flex items-start gap-1.5 text-[11px] text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  A defect disposition is being saved without a failure mode.
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        <div className="sticky bottom-0 border-t border-slate-800 bg-[#0A0E1A]/95 backdrop-blur-md px-5 py-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className={BTN_GHOST}
            disabled={saving}
          >
            Cancel
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={goBack}
                className={BTN_GHOST}
                disabled={saving || savingMetadata}
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            ) : null}
            {step < 4 ? (
              <button
                type="button"
                onClick={goNext}
                className={BTN_PRIMARY}
                disabled={savingMetadata}
              >
                {savingMetadata ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {step === 1 && missing.length > 0 ? "Skip / Next" : "Next"}
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={saveAssessment}
                className={BTN_PRIMARY}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ClipboardCheck className="h-4 w-4" />
                )}
                {saving ? "Saving…" : "Save Assessment"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FailureModeChoice({
  node,
  selectedKey,
  onSelect
}: {
  node: FailureModeNode;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const active = selectedKey === node.key;
  return (
    <div
      className={`rounded-xl border ${
        active ? "border-[#FFC700]/60 bg-[#FFC700]/10" : "border-slate-800 bg-slate-950/40"
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(node.key)}
        className="w-full text-left px-3 py-2.5 cursor-pointer"
      >
        <span className="text-xs font-bold text-slate-200">{node.label}</span>
        <span className="block text-[11px] text-slate-500 mt-0.5">
          {node.description}
        </span>
      </button>
      {node.children && node.children.length > 0 ? (
        <div className="px-3 pb-3 space-y-1.5">
          {node.children.map((child) => {
            const childActive = selectedKey === child.key;
            return (
              <button
                key={child.key}
                type="button"
                onClick={() => onSelect(child.key)}
                className={`w-full text-left rounded-lg border px-2.5 py-2 cursor-pointer transition-colors ${
                  childActive
                    ? "border-[#FFC700]/60 bg-[#FFC700]/10"
                    : "border-slate-800 bg-slate-900/50 hover:border-slate-600"
                }`}
              >
                <span className="text-[11px] font-bold text-slate-300">
                  {child.label}
                </span>
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  {child.description}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5 flex flex-wrap items-start gap-x-3 gap-y-1">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500 min-w-[110px]">
        {label}
      </dt>
      <dd className="text-slate-200 flex-1 min-w-0 break-words">{value}</dd>
    </div>
  );
}
