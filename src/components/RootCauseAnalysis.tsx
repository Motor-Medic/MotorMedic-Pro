import React, { useState } from "react";
import {
  Activity, AlertTriangle, Building, CheckCircle2, ChevronDown, ClipboardCheck,
  Eye, Layers, Plus, Settings, Target, Trash2, Wrench, X
} from "lucide-react";
import { useToast } from "./Toast";

interface RootCauseAnalysisProps {
  selectedCompanyId?: number;
}

// ===== Types & mock data =====

type InvestigationStatus = "In Progress" | "Completed" | "Archived";

interface Investigation {
  id: number;
  assetName: string;
  failureTitle: string;
  failureDate: string;
  status: InvestigationStatus;
  leadInvestigator: string;
}

type FishboneCategory =
  | "Man"
  | "Machine"
  | "Method"
  | "Material"
  | "Measurement"
  | "Environment";

const FISHBONE_CATEGORIES: { id: FishboneCategory; icon: typeof Wrench; blurb: string }[] = [
  { id: "Man", icon: Wrench, blurb: "Training, staffing, human error" },
  { id: "Machine", icon: Settings, blurb: "Equipment, tooling, wear" },
  { id: "Method", icon: ClipboardCheck, blurb: "Procedures, work instructions" },
  { id: "Material", icon: Layers, blurb: "Consumables, spares, quality" },
  { id: "Measurement", icon: Activity, blurb: "Instrumentation, calibration" },
  { id: "Environment", icon: Building, blurb: "Ambient, layout, contamination" }
];

type ActionStatus = "Open" | "In Progress" | "Complete";

interface ActionItem {
  id: number;
  action: string;
  assignedTo: string;
  dueDate: string;
  status: ActionStatus;
}

const INVESTIGATORS = [
  "M. Delgado",
  "R. Chen",
  "T. Okafor",
  "J. Whitfield",
  "S. Barrett"
];

const MAX_WHYS = 5;

const INITIAL_INVESTIGATIONS: Investigation[] = [
  { id: 1, assetName: "Boiler Feed Pump B", failureTitle: "Bearing Failure", failureDate: "2026-07-18", status: "In Progress", leadInvestigator: "M. Delgado" },
  { id: 2, assetName: "Cooling Tower Fan 4", failureTitle: "Blade Imbalance", failureDate: "2026-06-29", status: "Completed", leadInvestigator: "T. Okafor" },
  { id: 3, assetName: "Screw Compressor RS37i", failureTitle: "Discharge Temperature Excursion", failureDate: "2026-05-14", status: "Completed", leadInvestigator: "R. Chen" },
  { id: 4, assetName: "Primary Induction Motor", failureTitle: "Stator Winding Insulation Breakdown", failureDate: "2026-03-02", status: "Archived", leadInvestigator: "S. Barrett" }
];

interface Workspace {
  problem: string;
  whys: string[];
  fishbone: Record<FishboneCategory, string[]>;
  actions: ActionItem[];
}

const emptyFishbone = (): Record<FishboneCategory, string[]> => ({
  Man: [],
  Machine: [],
  Method: [],
  Material: [],
  Measurement: [],
  Environment: []
});

const emptyWorkspace = (): Workspace => ({
  problem: "",
  whys: [""],
  fishbone: emptyFishbone(),
  actions: []
});

// Only the active investigation ships with worked-through content.
const INITIAL_WORKSPACES: Record<number, Workspace> = {
  1: {
    problem: "Pump bearing failed.",
    whys: [
      "Lubrication was insufficient.",
      "Auto-lube system clogged.",
      "Filter was not replaced."
    ],
    fishbone: {
      Man: ["PM route skipped during shutdown coverage", "New technician unfamiliar with lube schedule"],
      Machine: ["Auto-lube pump discharge line partially blocked"],
      Method: ["Filter replacement interval not defined in the PM task"],
      Material: ["Grease grade differs from OEM specification"],
      Measurement: ["No flow confirmation on the lube circuit"],
      Environment: ["High ambient temperature accelerating grease breakdown"]
    },
    actions: [
      { id: 1, action: "Add auto-lube filter replacement to the 90-day PM task list", assignedTo: "M. Delgado", dueDate: "2026-08-14", status: "In Progress" },
      { id: 2, action: "Install flow indicator on the lube discharge line", assignedTo: "J. Whitfield", dueDate: "2026-09-01", status: "Open" },
      { id: 3, action: "Re-train shutdown coverage crew on lube route execution", assignedTo: "T. Okafor", dueDate: "2026-08-05", status: "Complete" }
    ]
  }
};

const STATUS_BADGES: Record<InvestigationStatus, string> = {
  "In Progress": "bg-yellow-400/10 text-yellow-400 border-yellow-400/25",
  Completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  Archived: "bg-slate-700/20 text-slate-400 border-slate-700"
};

const ACTION_STATUS_BADGES: Record<ActionStatus, string> = {
  Open: "bg-slate-700/20 text-slate-400 border-slate-700",
  "In Progress": "bg-yellow-400/10 text-yellow-400 border-yellow-400/25",
  Complete: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
};

const ACTION_STATUSES: ActionStatus[] = ["Open", "In Progress", "Complete"];

const formatDate = (iso: string) => {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const inputClass =
  "w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-yellow-400/60";

// ===== New investigation modal =====

interface NewInvestigationModalProps {
  onCreate: (draft: Omit<Investigation, "id" | "status">) => void;
  onClose: () => void;
}

function NewInvestigationModal({ onCreate, onClose }: NewInvestigationModalProps) {
  const { toast } = useToast();
  const [assetName, setAssetName] = useState("");
  const [failureTitle, setFailureTitle] = useState("");
  const [failureDate, setFailureDate] = useState(todayIso());
  const [leadInvestigator, setLeadInvestigator] = useState(INVESTIGATORS[0]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!assetName.trim() || !failureTitle.trim()) {
      toast("Asset name and failure title are required.", "error");
      return;
    }
    onCreate({
      assetName: assetName.trim(),
      failureTitle: failureTitle.trim(),
      failureDate,
      leadInvestigator
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[88vh] flex flex-col"
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Target className="h-4 w-4 text-yellow-400" />
              <span>Start New RCA Investigation</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Opens a blank workspace for the 5 Whys, fishbone, and action plan.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close new investigation form"
            className="text-slate-500 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 min-h-0 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
              Asset Name<span className="text-yellow-400 ml-0.5">*</span>
            </span>
            <input
              type="text"
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
              placeholder="Boiler Feed Pump B"
              className={inputClass}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
              Failure Title<span className="text-yellow-400 ml-0.5">*</span>
            </span>
            <input
              type="text"
              value={failureTitle}
              onChange={(e) => setFailureTitle(e.target.value)}
              placeholder="Bearing Failure"
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                Failure Date
              </span>
              <input
                type="date"
                value={failureDate}
                onChange={(e) => setFailureDate(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                Lead Investigator
              </span>
              <div className="relative">
                <select
                  value={leadInvestigator}
                  onChange={(e) => setLeadInvestigator(e.target.value)}
                  className={`${inputClass} appearance-none pr-9 cursor-pointer`}
                >
                  {INVESTIGATORS.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex items-center gap-1.5 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-bold rounded-lg cursor-pointer transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create Investigation</span>
          </button>
        </div>
      </form>
    </div>
  );
}

// ===== Fishbone category card =====

function FishboneCard({
  category,
  icon: Icon,
  blurb,
  causes,
  onAdd,
  onRemove
}: {
  category: FishboneCategory;
  icon: typeof Wrench;
  blurb: string;
  causes: string[];
  onAdd: (cause: string) => void;
  onRemove: (index: number) => void;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setDraft("");
  };

  return (
    <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 space-y-3 flex flex-col">
      <div className="flex items-center gap-2">
        <span className="h-7 w-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
          <Icon className="h-3.5 w-3.5 text-yellow-400" />
        </span>
        <div className="min-w-0">
          <h5 className="text-xs font-bold text-slate-200">{category}</h5>
          <p className="text-[10px] text-slate-500 truncate">{blurb}</p>
        </div>
      </div>

      <ul className="space-y-1.5 flex-1">
        {causes.length === 0 ? (
          <li className="text-[11px] text-slate-600 italic">No causes recorded</li>
        ) : (
          causes.map((cause, index) => (
            <li
              key={`${category}-${index}`}
              className="group flex items-start gap-1.5 text-[11px] text-slate-300 bg-slate-900/50 border border-slate-800 rounded-lg px-2 py-1.5"
            >
              <span className="text-yellow-400 shrink-0">·</span>
              <span className="flex-1 leading-snug">{cause}</span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={`Remove cause from ${category}`}
                className="text-slate-600 hover:text-red-400 transition-colors cursor-pointer shrink-0"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))
        )}
      </ul>

      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="Add potential cause..."
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-yellow-400/60"
        />
        <button
          type="button"
          onClick={commit}
          aria-label={`Add cause to ${category}`}
          className="px-2 py-1.5 bg-slate-950 border border-slate-800 hover:border-yellow-400/50 hover:text-yellow-400 text-slate-400 rounded-lg cursor-pointer transition-colors shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ===== Page =====

export default function RootCauseAnalysis({ selectedCompanyId }: RootCauseAnalysisProps) {
  const { toast } = useToast();
  const [investigations, setInvestigations] = useState<Investigation[]>(INITIAL_INVESTIGATIONS);
  const [workspaces, setWorkspaces] = useState<Record<number, Workspace>>(INITIAL_WORKSPACES);
  const [activeId, setActiveId] = useState<number>(INITIAL_INVESTIGATIONS[0].id);
  const [showNewModal, setShowNewModal] = useState(false);

  const activeInvestigation =
    investigations.find((i) => i.id === activeId) ?? investigations[0];
  const workspace = workspaces[activeId] ?? emptyWorkspace();

  const updateWorkspace = (patch: Partial<Workspace>) => {
    setWorkspaces((prev) => ({
      ...prev,
      [activeId]: { ...(prev[activeId] ?? emptyWorkspace()), ...patch }
    }));
  };

  // --- 5 Whys ---
  const setWhy = (index: number, value: string) => {
    const next = [...workspace.whys];
    next[index] = value;
    updateWorkspace({ whys: next });
  };

  const addWhy = () => {
    if (workspace.whys.length >= MAX_WHYS) return;
    updateWorkspace({ whys: [...workspace.whys, ""] });
  };

  const removeWhy = (index: number) => {
    updateWorkspace({ whys: workspace.whys.filter((_, i) => i !== index) });
  };

  // --- Fishbone ---
  const addCause = (category: FishboneCategory, cause: string) => {
    updateWorkspace({
      fishbone: { ...workspace.fishbone, [category]: [...workspace.fishbone[category], cause] }
    });
  };

  const removeCause = (category: FishboneCategory, index: number) => {
    updateWorkspace({
      fishbone: {
        ...workspace.fishbone,
        [category]: workspace.fishbone[category].filter((_, i) => i !== index)
      }
    });
  };

  // --- Action plan ---
  const updateAction = (id: number, patch: Partial<ActionItem>) => {
    updateWorkspace({
      actions: workspace.actions.map((a) => (a.id === id ? { ...a, ...patch } : a))
    });
  };

  const addAction = () => {
    const nextId = workspace.actions.reduce((max, a) => Math.max(max, a.id), 0) + 1;
    updateWorkspace({
      actions: [
        ...workspace.actions,
        { id: nextId, action: "", assignedTo: INVESTIGATORS[0], dueDate: todayIso(), status: "Open" }
      ]
    });
  };

  const removeAction = (id: number) => {
    updateWorkspace({ actions: workspace.actions.filter((a) => a.id !== id) });
  };

  const createInvestigation = (draft: Omit<Investigation, "id" | "status">) => {
    const nextId = investigations.reduce((max, i) => Math.max(max, i.id), 0) + 1;
    const created: Investigation = { ...draft, id: nextId, status: "In Progress" };
    setInvestigations((prev) => [created, ...prev]);
    setWorkspaces((prev) => ({ ...prev, [nextId]: emptyWorkspace() }));
    setActiveId(nextId);
    setShowNewModal(false);
    toast(`RCA opened for ${created.assetName}.`, "success");
  };

  const completedActions = workspace.actions.filter((a) => a.status === "Complete").length;

  return (
    <div className="space-y-6">

      {/* ===== Section A: Active Investigations ===== */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Target className="h-4 w-4 text-yellow-400" />
              <span>Active Investigations</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Structured failure investigations across the monitored fleet
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-bold rounded-xl cursor-pointer transition-colors shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Start New RCA Investigation</span>
          </button>
        </div>

        <ul className="space-y-2">
          {investigations.map((item) => {
            const isActive = item.id === activeId;
            return (
              <li
                key={item.id}
                className={`rounded-xl border p-3.5 transition-colors ${
                  isActive
                    ? "bg-yellow-400/5 border-yellow-400/30"
                    : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-100">{item.assetName}</span>
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${STATUS_BADGES[item.status]}`}>
                        {item.status}
                      </span>
                      {isActive && (
                        <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest">
                          Open in workspace
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{item.failureTitle}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 lg:gap-6 shrink-0">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                        Failure Date
                      </span>
                      <span className="text-[11px] text-slate-300 font-mono">
                        {formatDate(item.failureDate)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                        Lead Investigator
                      </span>
                      <span className="text-[11px] text-slate-300">{item.leadInvestigator}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveId(item.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-yellow-400/50 hover:text-yellow-400 text-slate-300 text-[11px] font-bold rounded-lg cursor-pointer transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>View</span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ===== Section B: Investigation Workspace ===== */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate">
              RCA: {activeInvestigation.assetName} — {activeInvestigation.failureTitle}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Failed {formatDate(activeInvestigation.failureDate)} · Led by{" "}
              {activeInvestigation.leadInvestigator}
            </p>
          </div>
          <span className={`px-2 py-1 rounded border text-[10px] font-bold shrink-0 self-start sm:self-auto ${STATUS_BADGES[activeInvestigation.status]}`}>
            {activeInvestigation.status}
          </span>
        </div>

        <div className="p-5 space-y-6">

          {/* --- 5 Whys --- */}
          <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <span>The 5 Whys</span>
              </h4>
              <span className="text-[10px] font-bold text-slate-400 font-mono">
                {workspace.whys.length} of {MAX_WHYS} levels
              </span>
            </div>

            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                Problem Statement
              </span>
              <input
                type="text"
                value={workspace.problem}
                onChange={(e) => updateWorkspace({ problem: e.target.value })}
                placeholder="Describe the failure as observed..."
                className={inputClass}
              />
            </label>

            <ol className="space-y-2">
              {workspace.whys.map((why, index) => (
                <li key={index} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-[10px] font-bold text-yellow-400 uppercase tracking-widest">
                    Why {index + 1}
                  </span>
                  <input
                    type="text"
                    value={why}
                    onChange={(e) => setWhy(index, e.target.value)}
                    placeholder="Why did the previous statement happen?"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => removeWhy(index)}
                    aria-label={`Remove why ${index + 1}`}
                    className="text-slate-600 hover:text-red-400 transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ol>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={addWhy}
                disabled={workspace.whys.length >= MAX_WHYS}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-800 text-slate-300 text-xs font-bold rounded-lg transition-colors enabled:hover:border-yellow-400/50 enabled:hover:text-yellow-400 enabled:cursor-pointer disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Why</span>
              </button>
              {workspace.whys.length >= MAX_WHYS && (
                <span className="text-[10px] text-slate-500">
                  Five levels reached — the last answer is usually the root cause.
                </span>
              )}
            </div>
          </div>

          {/* --- Fishbone --- */}
          <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-yellow-400" />
                <span>Fishbone (Ishikawa) Categories</span>
              </h4>
              <span className="text-[10px] font-bold text-slate-400 font-mono">
                {Object.values(workspace.fishbone).reduce((sum, list) => sum + list.length, 0)} causes logged
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {FISHBONE_CATEGORIES.map((category) => (
                <FishboneCard
                  key={category.id}
                  category={category.id}
                  icon={category.icon}
                  blurb={category.blurb}
                  causes={workspace.fishbone[category.id]}
                  onAdd={(cause) => addCause(category.id, cause)}
                  onRemove={(index) => removeCause(category.id, index)}
                />
              ))}
            </div>
          </div>

          {/* --- Action Plan --- */}
          <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                <ClipboardCheck className="h-4 w-4 text-yellow-400" />
                <span>Action Plan</span>
              </h4>
              <span className="text-[10px] font-bold text-slate-400 font-mono">
                {completedActions} of {workspace.actions.length} actions complete
              </span>
            </div>

            {workspace.actions.length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <ClipboardCheck className="h-8 w-8 text-slate-700 mx-auto" />
                <p className="text-xs font-bold text-slate-400">No corrective actions yet</p>
                <p className="text-[11px] text-slate-500">
                  Add the actions that address the root cause identified above.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="w-10 pb-2" />
                      <th className="text-left pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Action Item
                      </th>
                      <th className="text-left pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-40">
                        Assigned To
                      </th>
                      <th className="text-left pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-36">
                        Due Date
                      </th>
                      <th className="text-left pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-36">
                        Status
                      </th>
                      <th className="w-10 pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.actions.map((action) => {
                      const isComplete = action.status === "Complete";
                      return (
                        <tr key={action.id} className="border-b border-slate-800/60 last:border-0">
                          <td className="py-2.5 pr-2">
                            <input
                              type="checkbox"
                              checked={isComplete}
                              onChange={() =>
                                updateAction(action.id, { status: isComplete ? "Open" : "Complete" })
                              }
                              aria-label={`Mark action complete: ${action.action || "untitled"}`}
                              className="h-4 w-4 accent-yellow-400 cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 pr-3">
                            <input
                              type="text"
                              value={action.action}
                              onChange={(e) => updateAction(action.id, { action: e.target.value })}
                              placeholder="Describe the corrective action..."
                              className={`${inputClass} ${isComplete ? "line-through text-slate-500" : ""}`}
                            />
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="relative">
                              <select
                                value={action.assignedTo}
                                onChange={(e) => updateAction(action.id, { assignedTo: e.target.value })}
                                className={`${inputClass} appearance-none pr-8 cursor-pointer`}
                              >
                                {INVESTIGATORS.map((name) => (
                                  <option key={name} value={name}>{name}</option>
                                ))}
                              </select>
                              <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </td>
                          <td className="py-2.5 pr-3">
                            <input
                              type="date"
                              value={action.dueDate}
                              onChange={(e) => updateAction(action.id, { dueDate: e.target.value })}
                              className={`${inputClass} font-mono`}
                            />
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="relative">
                              <select
                                value={action.status}
                                onChange={(e) =>
                                  updateAction(action.id, { status: e.target.value as ActionStatus })
                                }
                                className={`appearance-none w-full rounded-lg border px-2.5 py-2 pr-8 text-[11px] font-bold cursor-pointer focus:outline-none ${ACTION_STATUS_BADGES[action.status]}`}
                              >
                                {ACTION_STATUSES.map((status) => (
                                  <option key={status} value={status} className="bg-slate-950 text-slate-200">
                                    {status}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                            </div>
                          </td>
                          <td className="py-2.5">
                            <button
                              type="button"
                              onClick={() => removeAction(action.id)}
                              aria-label="Remove action item"
                              className="text-slate-600 hover:text-red-400 transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addAction}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-800 hover:border-yellow-400/50 hover:text-yellow-400 text-slate-300 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Action</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  toast(`Action plan saved for ${activeInvestigation.assetName}.`, "success")
                }
                className="flex items-center gap-1.5 px-3 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Save Action Plan</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {showNewModal && (
        <NewInvestigationModal
          onCreate={createInvestigation}
          onClose={() => setShowNewModal(false)}
        />
      )}
    </div>
  );
}
