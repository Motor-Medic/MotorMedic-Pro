/**
 * Dynamic multi-system CMMS bridge.
 *
 * Renders the live diagnosis as pre-formatted work order fields in the selected
 * system's own vocabulary. Switching systems re-keys every field, relabels it
 * and re-maps the priority code; the underlying values never change.
 */

import { useMemo, useState } from "react";
import { Check, Clipboard, Copy } from "lucide-react";
import {
  buildCmmsFieldList,
  CMMS_TARGETS,
  type CmmsPayloadContext,
  type CmmsTargetId
} from "../../lib/diagnostics/cmmsPayload";

export interface CmmsPayloadBridgeProps {
  context: CmmsPayloadContext;
  sectionId?: string;
  onToast?: (
    message: string,
    type?: "success" | "info" | "warning" | "error"
  ) => void;
}

export default function CmmsPayloadBridge({
  context,
  sectionId = "cmms-data-bridge",
  onToast
}: CmmsPayloadBridgeProps) {
  const [target, setTarget] = useState<CmmsTargetId>("sap");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const cmmsFields = useMemo(
    () => buildCmmsFieldList(target, context),
    [target, context]
  );

  const fullPayloadText = cmmsFields
    .map((f) => `${f.key}: ${f.value}`)
    .join("\n");

  const copy = (value: string, id: string, label: string) => {
    void navigator.clipboard.writeText(value).then(
      () => {
        setCopiedKey(id);
        onToast?.(`${label} copied to clipboard`, "success");
        window.setTimeout(
          () => setCopiedKey((k) => (k === id ? null : k)),
          2000
        );
      },
      () => onToast?.("Clipboard unavailable in this browser", "error")
    );
  };

  return (
    <section
      id={sectionId}
      className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6"
    >
      <div className="mb-5">
        <h3 className="text-lg font-bold text-white">CMMS Work Order Bridge</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Live diagnosis pre-formatted for your system&apos;s fields and
          priority codes
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <label
            htmlFor={`${sectionId}-system`}
            className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block"
          >
            Step 1: Choose Your System
          </label>
          <select
            id={`${sectionId}-system`}
            value={target}
            onChange={(e) => setTarget(e.target.value as CmmsTargetId)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 outline-none"
          >
            {CMMS_TARGETS.map((sys) => (
              <option key={sys.id} value={sys.id}>
                {sys.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            Step 2: Pre-Formatted Work Order Fields
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {cmmsFields.map((field) => (
              <div
                key={field.key}
                className={`min-w-0 ${field.multiline ? "sm:col-span-2" : ""}`}
              >
                <span className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {field.label}:
                  <span className="font-mono normal-case tracking-normal text-slate-600">
                    {field.key}
                  </span>
                </span>
                <div className="flex gap-2 items-stretch">
                  {field.multiline ? (
                    <textarea
                      readOnly
                      rows={2}
                      value={field.value}
                      className="flex-1 min-w-0 resize-y bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
                    />
                  ) : (
                    <input
                      type="text"
                      readOnly
                      value={field.value}
                      className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => copy(field.value, field.key, field.label)}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300 cursor-pointer transition-colors shrink-0 inline-flex items-center gap-1"
                    title={`Copy ${field.label}`}
                  >
                    {copiedKey === field.key ? (
                      <Check className="h-3.5 w-3.5 text-green-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => copy(fullPayloadText, "__all__", "Full payload")}
          className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
        >
          <Clipboard className="h-4 w-4" />
          Copy Full Multi-Field Payload to Clipboard
        </button>

        <p className="text-xs leading-relaxed text-slate-500">
          Fields whose source value was never recorded are omitted rather than
          defaulted. Priority and work-order type are mapped from the diagnosis
          severity using each system&apos;s own scale — switching systems
          rewrites the keys and codes, never the measured values.
        </p>
      </div>
    </section>
  );
}
