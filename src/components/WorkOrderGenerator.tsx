import React, { useMemo, useRef, useState } from "react";
import {
  CheckCircle2, ChevronDown, ClipboardCheck, Copy, Database, DollarSign, Download,
  FileImage, Loader2, Mail, Printer, ShieldCheck, Trash2, Upload, Wrench, X
} from "lucide-react";
import { useToast } from "./Toast";
import { formatUsd } from "./PartsInventory";

export type WorkOrderPriority = "Critical" | "High" | "Medium" | "Low";

export interface WorkOrderPart {
  partNumber: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface WorkOrderRecommendation {
  text: string;
  priority: string;
}

interface WorkOrderGeneratorProps {
  assetName: string;
  tagId: string;
  faultCode: string;
  faultSeverity: "Low" | "Medium" | "High";
  recommendations: WorkOrderRecommendation[];
  parts: WorkOrderPart[];
  estimatedHours: number;
  onClose: () => void;
}

const TECHNICIANS = [
  "M. Delgado — Vibration Analyst II",
  "R. Chen — Mechanical Technician",
  "T. Okafor — Reliability Engineer",
  "J. Whitfield — Millwright",
  "S. Barrett — Predictive Maintenance Lead"
];

const PRIORITIES: WorkOrderPriority[] = ["Critical", "High", "Medium", "Low"];

const PRIORITY_STYLES: Record<WorkOrderPriority, string> = {
  Critical: "bg-red-500/10 text-red-400 border-red-500/25",
  High: "bg-orange-500/10 text-orange-400 border-orange-500/25",
  Medium: "bg-yellow-400/10 text-yellow-400 border-yellow-400/25",
  Low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
};

// Turnaround targets by urgency, used to seed the due date.
const DUE_DAYS: Record<WorkOrderPriority, number> = {
  Critical: 2,
  High: 7,
  Medium: 21,
  Low: 45
};

const LABOR_RATE = 95;

// ===== CMMS targets =====

export type CmmsTarget = "standard" | "sap" | "maximo" | "custom";

const CMMS_OPTIONS: { id: CmmsTarget; label: string }[] = [
  { id: "standard", label: "Standard Format" },
  { id: "sap", label: "SAP PM" },
  { id: "maximo", label: "IBM Maximo" },
  { id: "custom", label: "Other / Custom" }
];

interface CmmsFieldLabels {
  title: string;
  assignedTo: string;
  dueDate: string;
  priority: string;
  hours: string;
  description: string;
  safety: string;
}

/** Each target renames the shared fields to the terminology its planners expect. */
const CMMS_LABELS: Record<Exclude<CmmsTarget, "custom">, CmmsFieldLabels> = {
  standard: {
    title: "Work Order Title",
    assignedTo: "Assigned To",
    dueDate: "Due Date",
    priority: "Priority Level",
    hours: "Estimated Labor Hours",
    description: "Detailed Description",
    safety: "Safety Notes"
  },
  sap: {
    title: "Short Text",
    assignedTo: "Person Responsible",
    dueDate: "Basic Finish Date",
    priority: "Priority",
    hours: "Planned Work (hrs)",
    description: "Long Text",
    safety: "Permit / Safety Requirements"
  },
  maximo: {
    title: "Reported Problem",
    assignedTo: "Lead Craft",
    dueDate: "Target Finish",
    priority: "Priority",
    hours: "Estimated Duration (hrs)",
    description: "Work Log Details",
    safety: "Safety Plan"
  }
};

const NOTIFICATION_TYPES = [
  "M1 — Malfunction Report",
  "M2 — Maintenance Request",
  "M3 — Activity Report"
];

const PLANNER_GROUPS = [
  "100 — Rotating Equipment",
  "200 — Static Equipment",
  "300 — Electrical & Instrumentation"
];

const WORK_CENTERS = ["MECH-01", "MECH-02", "ELEC-01", "PDM-01"];

const FAILURE_CLASSES = [
  "ROTATING-EQUIP",
  "PUMP-CENTRIFUGAL",
  "MOTOR-AC",
  "GEARBOX"
];

const ASSET_FAILURE_CODES = [
  "VIB-HIGH — Excessive Vibration",
  "BRG-WEAR — Bearing Degradation",
  "ALIGN-OUT — Shaft Misalignment",
  "LOOSE-MECH — Mechanical Looseness"
];

const isoDatePlusDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const inputClass =
  "w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-yellow-400/60";

function Field({
  label,
  children,
  hint
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
        {label}
      </span>
      {children}
      {hint && <span className="text-[10px] text-slate-500 block">{hint}</span>}
    </label>
  );
}

export default function WorkOrderGenerator({
  assetName,
  tagId,
  faultCode,
  faultSeverity,
  recommendations,
  parts,
  estimatedHours,
  onClose
}: WorkOrderGeneratorProps) {
  const { toast } = useToast();

  const seededPriority: WorkOrderPriority = faultSeverity === "High"
    ? "High"
    : faultSeverity === "Medium"
      ? "Medium"
      : "Low";

  const [title, setTitle] = useState(`${faultCode} correction — ${assetName}`);
  const [assignedTo, setAssignedTo] = useState(TECHNICIANS[0]);
  const [priority, setPriority] = useState<WorkOrderPriority>(seededPriority);
  const [dueDate, setDueDate] = useState(isoDatePlusDays(DUE_DAYS[seededPriority]));
  const [laborHours, setLaborHours] = useState(String(estimatedHours));
  const [description, setDescription] = useState(() => {
    const actions = recommendations.length
      ? recommendations.map((r) => `- [${r.priority}] ${r.text}`).join("\n")
      : "- No automated recommendations were returned for this analysis.";
    return (
      `Vibration analysis of ${assetName} (${tagId}) returned fault code ${faultCode} at ${faultSeverity.toLowerCase()} severity.\n\n` +
      `Recommended actions:\n${actions}\n\n` +
      `Complete the documented repair procedure, then re-measure overall velocity to confirm the unit has returned inside ISO 10816 Zone A.`
    );
  });
  const [safetyNotes, setSafetyNotes] = useState(
    "Apply Lock-out/Tag-out (LOTO) at the primary motor junction box and verify a zero-energy state before removing guards. " +
    "Confirm the coupling is de-energized and the rotor is at rest. Required PPE: safety glasses, cut-resistant gloves, hearing protection."
  );

  const [workOrderNumber, setWorkOrderNumber] = useState<string | null>(null);

  // CMMS targeting
  const [targetCms, setTargetCms] = useState<CmmsTarget>("standard");
  const [notificationType, setNotificationType] = useState(NOTIFICATION_TYPES[1]);
  const [plannerGroup, setPlannerGroup] = useState(PLANNER_GROUPS[0]);
  const [mainWorkCenter, setMainWorkCenter] = useState(WORK_CENTERS[0]);
  const [failureClass, setFailureClass] = useState(FAILURE_CLASSES[0]);
  const [assetFailureCode, setAssetFailureCode] = useState(ASSET_FAILURE_CODES[0]);

  // Custom template builder
  const [customCmmsName, setCustomCmmsName] = useState("");
  const [screenshotName, setScreenshotName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isCustom = targetCms === "custom";
  const labels = targetCms === "custom" ? CMMS_LABELS.standard : CMMS_LABELS[targetCms];
  const activeCmmsLabel = isCustom
    ? customCmmsName.trim() || "Custom"
    : CMMS_OPTIONS.find((o) => o.id === targetCms)!.label;

  const partsTotal = useMemo(
    () => parts.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0),
    [parts]
  );
  const hours = Math.max(0, Number(laborHours) || 0);
  const laborTotal = hours * LABOR_RATE;
  const totalCost = partsTotal + laborTotal;

  // Keep the due date aligned with the turnaround target when urgency changes.
  const handlePriorityChange = (next: WorkOrderPriority) => {
    setPriority(next);
    setDueDate(isoDatePlusDays(DUE_DAYS[next]));
  };

  const validate = () => {
    // Custom targets have no field mapping until a template has been generated.
    if (isCustom && !templateSaved) {
      toast("Generate and save a custom template before exporting.", "error");
      return false;
    }
    if (!title.trim()) {
      toast(`${labels.title} is required.`, "error");
      return false;
    }
    if (!assignedTo) {
      toast("Assign the work order to a technician first.", "error");
      return false;
    }
    if (!dueDate) {
      toast(`${labels.dueDate} is required.`, "error");
      return false;
    }
    return true;
  };

  /** Field/value pairs for the active target, shared by copy and export. */
  const buildRecord = (): [string, string][] => {
    const base: [string, string][] = [
      ["Work Order", workOrderNumber ?? "(unassigned)"],
      ["Target System", activeCmmsLabel],
      [labels.title, title],
      ["Asset", assetName],
      ["Tag ID", tagId],
      ["Fault Code", faultCode]
    ];

    if (targetCms === "sap") {
      base.push(
        ["Notification Type", notificationType],
        ["Planner Group", plannerGroup],
        ["Main Work Center", mainWorkCenter]
      );
    }
    if (targetCms === "maximo") {
      base.push(["Failure Class", failureClass], ["Asset Failure Code", assetFailureCode]);
    }

    base.push(
      [labels.assignedTo, assignedTo],
      [labels.priority, priority],
      [labels.dueDate, dueDate],
      [labels.hours, String(hours)],
      ["Parts Cost", formatUsd(partsTotal)],
      ["Labor Cost", formatUsd(laborTotal)],
      ["Total Cost", formatUsd(totalCost)],
      ["Required Parts", parts.map((p) => `${p.partNumber} x${p.quantity}`).join("; ") || "None"],
      [labels.description, description],
      [labels.safety, safetyNotes]
    );

    return base;
  };

  const handleCopy = async () => {
    if (!validate()) return;
    const text = buildRecord()
      .map(([field, value]) => `${field}: ${value}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast(`Work order copied in ${activeCmmsLabel} format.`, "success");
    } catch {
      toast("Clipboard unavailable in this browser context.", "error");
    }
  };

  const downloadFile = (contents: string, filename: string, mime: string) => {
    const blob = new Blob([contents], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportForCmms = () => {
    if (!validate()) return;
    const record = buildRecord();
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = (workOrderNumber ?? "draft").toLowerCase();

    if (isCustom) {
      const payload = {
        targetSystem: activeCmmsLabel,
        templateSource: screenshotName,
        generated: stamp,
        fields: Object.fromEntries(record)
      };
      downloadFile(JSON.stringify(payload, null, 2), `workorder-${slug}-custom.json`, "application/json");
    } else {
      // Quote every cell so embedded commas and newlines survive the round trip.
      const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
      const csv = [
        record.map(([field]) => escape(field)).join(","),
        record.map(([, value]) => escape(value)).join(",")
      ].join("\n");
      downloadFile(csv, `workorder-${slug}-${targetCms}.csv`, "text/csv;charset=utf-8;");
    }

    toast(`Export generated for ${activeCmmsLabel}.`, "success");
  };

  const acceptScreenshot = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Upload an image file (PNG, JPG, or WEBP).", "error");
      return;
    }
    setScreenshotName(file.name);
    setTemplateSaved(false);
  };

  const handleAnalyzeTemplate = () => {
    if (!customCmmsName.trim()) {
      toast("Enter the name of your CMMS first.", "error");
      return;
    }
    if (!screenshotName) {
      toast("Upload a screenshot of your work order format.", "error");
      return;
    }
    setAnalyzing(true);
    window.setTimeout(() => {
      setAnalyzing(false);
      setTemplateSaved(true);
      toast("Template Saved", "success");
    }, 1800);
  };

  const handleGenerate = () => {
    if (!validate()) return;
    const number = `WO-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
    setWorkOrderNumber(number);
    toast(`${number} created and saved.`, "success");
  };

  const handleEmail = () => {
    if (!validate()) return;
    toast(`Work order emailed to ${assignedTo.split(" — ")[0]}.`, "success");
  };

  const handlePrint = () => {
    if (!validate()) return;
    toast("Preparing printable work order...", "info");
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-800">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Wrench className="h-4 w-4 text-yellow-400" />
              <span>{workOrderNumber ? "Work Order Created" : "Create Work Order"}</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {workOrderNumber
                ? "The work order has been saved to the maintenance queue."
                : `Pre-populated from the current analysis of ${assetName} (${tagId}).`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close work order generator"
            className="text-slate-500 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {workOrderNumber ? (
          /* ===== Success state ===== */
          <div className="p-8 text-center space-y-4">
            <span className="h-14 w-14 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            </span>
            <div className="space-y-1">
              <p className="text-lg font-bold text-white font-mono">{workOrderNumber}</p>
              <p className="text-xs text-slate-400">{title}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto text-left">
              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Assigned To</span>
                <span className="text-xs font-bold text-slate-200">{assignedTo.split(" — ")[0]}</span>
              </div>
              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Due</span>
                <span className="text-xs font-bold text-slate-200 font-mono">{dueDate}</span>
              </div>
              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Total Cost</span>
                <span className="text-xs font-bold text-emerald-400 font-mono">{formatUsd(totalCost)}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => toast(`Opening ${workOrderNumber} in the maintenance queue.`, "info")}
                className="flex items-center gap-1.5 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                <span>View Work Order</span>
              </button>
              <button
                type="button"
                onClick={handleEmail}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Email to Technician</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ===== Body ===== */}
            <div className="p-5 overflow-y-auto flex-1 min-h-0 space-y-5">

              {/* ===== CMMS Integration ===== */}
              <section className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Database className="h-3 w-3 text-yellow-400" />
                      <span>Target CMMS</span>
                    </span>
                    <div className="relative">
                      <select
                        value={targetCms}
                        onChange={(e) => setTargetCms(e.target.value as CmmsTarget)}
                        className={`${inputClass} appearance-none pr-9 cursor-pointer font-bold`}
                      >
                        {CMMS_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 sm:max-w-xs">
                    {isCustom
                      ? "Teach MotorMedic your work order layout from a screenshot."
                      : `Fields are labelled and exported to match ${activeCmmsLabel} conventions.`}
                  </p>
                </div>
              </section>

              {isCustom ? (
                /* ===== Custom Template Setup ===== */
                <section className="bg-slate-950/50 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                      <Upload className="h-4 w-4 text-yellow-400" />
                      <span>Custom Template Setup</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Upload an example of your existing work order and we will map the analysis
                      data onto its layout.
                    </p>
                  </div>

                  <Field label="Name of your CMMS">
                    <input
                      type="text"
                      value={customCmmsName}
                      onChange={(e) => {
                        setCustomCmmsName(e.target.value);
                        setTemplateSaved(false);
                      }}
                      placeholder="e.g., Fiix, UpKeep, Limble"
                      className={inputClass}
                    />
                  </Field>

                  {/* Drag & drop upload */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      acceptScreenshot(e.dataTransfer.files?.[0]);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                      isDragging
                        ? "border-yellow-400 bg-yellow-400/5"
                        : "border-slate-800 hover:border-slate-700 bg-slate-900/40"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => acceptScreenshot(e.target.files?.[0])}
                    />

                    {screenshotName ? (
                      <div className="flex items-center justify-center gap-2.5">
                        <FileImage className="h-5 w-5 text-yellow-400 shrink-0" />
                        <span className="text-xs font-bold text-slate-200 truncate">{screenshotName}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setScreenshotName(null);
                            setTemplateSaved(false);
                          }}
                          aria-label="Remove uploaded screenshot"
                          className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Upload className="h-6 w-6 text-slate-600 mx-auto" />
                        <p className="text-xs font-bold text-slate-300">
                          Upload a screenshot of your current work order format
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Drag and drop, or click to browse · PNG, JPG, or WEBP
                        </p>
                      </div>
                    )}
                  </div>

                  {templateSaved ? (
                    <div className="flex items-start gap-2.5 bg-emerald-500/5 border border-emerald-500/25 rounded-xl p-3.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-emerald-400">Template Saved</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {activeCmmsLabel} layout mapped from {screenshotName}. Exports will now use
                          this format.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAnalyzeTemplate}
                      disabled={analyzing}
                      className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-yellow-400 text-slate-950 text-xs font-bold rounded-lg transition-colors enabled:hover:bg-yellow-500 enabled:cursor-pointer disabled:opacity-60"
                    >
                      {analyzing ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Analyzing layout...</span>
                        </>
                      ) : (
                        <>
                          <Database className="h-3.5 w-3.5" />
                          <span>Analyze &amp; Generate Template</span>
                        </>
                      )}
                    </button>
                  )}

                  <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
                    <ShieldCheck className="h-3 w-3 text-slate-600 shrink-0" />
                    <span>This format will be saved for all users in your organization.</span>
                  </p>
                </section>
              ) : (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

              {/* Editable fields */}
              <div className="lg:col-span-3 space-y-4">
                <Field label={labels.title}>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={inputClass}
                  />
                </Field>

                {/* SAP PM specific */}
                {targetCms === "sap" && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Notification Type">
                      <div className="relative">
                        <select
                          value={notificationType}
                          onChange={(e) => setNotificationType(e.target.value)}
                          className={`${inputClass} appearance-none pr-9 cursor-pointer`}
                        >
                          {NOTIFICATION_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </Field>
                    <Field label="Planner Group">
                      <div className="relative">
                        <select
                          value={plannerGroup}
                          onChange={(e) => setPlannerGroup(e.target.value)}
                          className={`${inputClass} appearance-none pr-9 cursor-pointer`}
                        >
                          {PLANNER_GROUPS.map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                        <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </Field>
                    <Field label="Main Work Center">
                      <div className="relative">
                        <select
                          value={mainWorkCenter}
                          onChange={(e) => setMainWorkCenter(e.target.value)}
                          className={`${inputClass} appearance-none pr-9 cursor-pointer font-mono`}
                        >
                          {WORK_CENTERS.map((w) => (
                            <option key={w} value={w}>{w}</option>
                          ))}
                        </select>
                        <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </Field>
                  </div>
                )}

                {/* IBM Maximo specific */}
                {targetCms === "maximo" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Failure Class">
                      <div className="relative">
                        <select
                          value={failureClass}
                          onChange={(e) => setFailureClass(e.target.value)}
                          className={`${inputClass} appearance-none pr-9 cursor-pointer font-mono`}
                        >
                          {FAILURE_CLASSES.map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                        <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </Field>
                    <Field label="Asset Failure Code">
                      <div className="relative">
                        <select
                          value={assetFailureCode}
                          onChange={(e) => setAssetFailureCode(e.target.value)}
                          className={`${inputClass} appearance-none pr-9 cursor-pointer`}
                        >
                          {ASSET_FAILURE_CODES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </Field>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label={labels.assignedTo}>
                    <div className="relative">
                      <select
                        value={assignedTo}
                        onChange={(e) => setAssignedTo(e.target.value)}
                        className={`${inputClass} appearance-none pr-9 cursor-pointer`}
                      >
                        {TECHNICIANS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </Field>

                  <Field label={labels.dueDate}>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label={labels.priority} hint={`Seeded from ${faultSeverity} fault severity.`}>
                    <div className="flex flex-wrap gap-1.5">
                      {PRIORITIES.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => handlePriorityChange(p)}
                          className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                            priority === p
                              ? PRIORITY_STYLES[p]
                              : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label={labels.hours} hint={`Billed at ${formatUsd(LABOR_RATE)}/hr.`}>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={laborHours}
                      onChange={(e) => setLaborHours(e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                  </Field>
                </div>

                <Field label={labels.description}>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={8}
                    className={`${inputClass} resize-none leading-relaxed`}
                  />
                </Field>

                <Field label={labels.safety}>
                  <textarea
                    value={safetyNotes}
                    onChange={(e) => setSafetyNotes(e.target.value)}
                    rows={4}
                    className={`${inputClass} resize-none leading-relaxed`}
                  />
                </Field>
              </div>

              {/* Pre-populated summary */}
              <div className="lg:col-span-2 space-y-3">

                <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-2.5">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-yellow-400" />
                    <span>From Analysis</span>
                  </h4>
                  <dl className="space-y-2 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-500">Asset</dt>
                      <dd className="text-slate-200 font-bold truncate">{assetName}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-500">Tag ID</dt>
                      <dd className="text-slate-200 font-bold font-mono">{tagId}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-500">Fault Code</dt>
                      <dd className="text-yellow-400 font-bold font-mono">{faultCode}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-500">Priority</dt>
                      <dd>
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${PRIORITY_STYLES[priority]}`}>
                          {priority}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-2.5">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Required Parts ({parts.length})
                  </h4>
                  {parts.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      No parts attached. Add them from the Repair &amp; Actions tab.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {parts.map((part) => (
                        <li key={part.partNumber} className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-slate-200 truncate">{part.description}</p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              {part.partNumber} · qty {part.quantity}
                            </p>
                          </div>
                          <span className="text-[11px] text-slate-300 font-bold font-mono shrink-0">
                            {formatUsd(part.quantity * part.unitPrice)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-2.5">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Estimated Cost</span>
                  </h4>
                  <dl className="space-y-2 text-[11px] font-mono">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-500">Parts</dt>
                      <dd className="text-slate-200 font-bold">{formatUsd(partsTotal)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-500">Labor ({hours} hr)</dt>
                      <dd className="text-slate-200 font-bold">{formatUsd(laborTotal)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                      <dt className="text-slate-400 font-bold">Total</dt>
                      <dd className="text-emerald-400 font-bold text-sm">{formatUsd(totalCost)}</dd>
                    </div>
                  </dl>
                </div>

                <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Recommended Actions ({recommendations.length})
                  </h4>
                  <ul className="space-y-1.5">
                    {recommendations.map((rec) => (
                      <li key={rec.text} className="text-[11px] text-slate-400 flex gap-1.5">
                        <span className="text-yellow-400 shrink-0">·</span>
                        <span>{rec.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              </div>
              )}
            </div>

            {/* ===== Footer actions ===== */}
            <div className="flex flex-wrap items-center justify-end gap-2 p-5 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print Work Order</span>
              </button>
              <button
                type="button"
                onClick={handleEmail}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Email to Technician</span>
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Formatted Text</span>
              </button>
              <button
                type="button"
                onClick={handleExportForCmms}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export for CMMS</span>
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                className="flex items-center gap-1.5 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                <Wrench className="h-3.5 w-3.5" />
                <span>Generate Work Order</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
