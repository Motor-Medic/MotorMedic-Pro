import React, { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, ClipboardCheck,
  Eye, Plus, ShieldAlert, Trash2, X
} from "lucide-react";
import { useToast } from "./Toast";

interface FMEAProps {
  selectedCompanyId?: number;
}

// ===== Domain =====

type FmeaStatus = "Draft" | "In Review" | "Approved";

interface FmeaRecord {
  id: number;
  assetName: string;
  title: string;
  dateCreated: string;
  status: FmeaStatus;
}

interface FmeaRow {
  id: number;
  failureMode: string;
  effects: string;
  severity: number;
  causes: string;
  occurrence: number;
  controls: string;
  detection: number;
  recommendedAction: string;
  addressed: boolean;
}

const FMEA_STATUSES: FmeaStatus[] = ["Draft", "In Review", "Approved"];

const STATUS_BADGES: Record<FmeaStatus, string> = {
  Draft: "bg-slate-700/20 text-slate-400 border-slate-700",
  "In Review": "bg-yellow-400/10 text-yellow-400 border-yellow-400/25",
  Approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
};

const SCALE = Array.from({ length: 10 }, (_, i) => i + 1);

const HIGH_RPN_THRESHOLD = 200;
const MEDIUM_RPN_THRESHOLD = 70;

/** RPN is always derived from S x O x D — never stored, so it cannot drift. */
const calcRpn = (row: FmeaRow) => row.severity * row.occurrence * row.detection;

const getRpnStyle = (rpn: number) => {
  if (rpn > HIGH_RPN_THRESHOLD) {
    return {
      level: "High",
      cell: "bg-red-500/15 border-red-500/40 text-red-300",
      badge: "bg-red-500/10 text-red-400 border-red-500/25"
    };
  }
  if (rpn >= MEDIUM_RPN_THRESHOLD) {
    return {
      level: "Medium",
      cell: "bg-yellow-400/15 border-yellow-400/40 text-yellow-200",
      badge: "bg-yellow-400/10 text-yellow-400 border-yellow-400/25"
    };
  }
  return {
    level: "Low",
    cell: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
  };
};

const formatDate = (iso: string) => {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const INITIAL_RECORDS: FmeaRecord[] = [
  { id: 1, assetName: "Boiler Feed Pump B", title: "Criticality Analysis", dateCreated: "2026-07-12", status: "In Review" },
  { id: 2, assetName: "Cooling Tower Fan 4", title: "Drive Train Review", dateCreated: "2026-06-20", status: "Approved" },
  { id: 3, assetName: "Screw Compressor RS37i", title: "Air End Risk Assessment", dateCreated: "2026-05-08", status: "Approved" },
  { id: 4, assetName: "Primary Induction Motor", title: "Electrical Failure Modes", dateCreated: "2026-03-15", status: "Draft" }
];

const INITIAL_WORKSHEETS: Record<number, FmeaRow[]> = {
  1: [
    { id: 1, failureMode: "Bearing Seizure", effects: "Pump stops, production halt", severity: 9, causes: "Lubrication failure", occurrence: 4, controls: "Monthly vibration monitoring", detection: 3, recommendedAction: "", addressed: false },
    { id: 2, failureMode: "Shaft Misalignment", effects: "Accelerated seal and coupling wear", severity: 6, causes: "Thermal growth not compensated at operating temperature", occurrence: 5, controls: "Quarterly laser alignment check", detection: 4, recommendedAction: "", addressed: false },
    { id: 3, failureMode: "Mechanical Seal Leak", effects: "Process fluid loss, environmental release, forced outage", severity: 8, causes: "Seal face wear from intermittent dry running", occurrence: 6, controls: "Visual inspection on operator rounds", detection: 6, recommendedAction: "Fit seal flush plan 53B and add low-level interlock to prevent dry running.", addressed: false },
    { id: 4, failureMode: "Impeller Erosion", effects: "Reduced flow and head, higher energy draw", severity: 5, causes: "Cavitation from partially restricted suction strainer", occurrence: 4, controls: "Annual internal inspection", detection: 7, recommendedAction: "", addressed: false },
    { id: 5, failureMode: "Motor Winding Failure", effects: "Complete loss of pump function, extended downtime", severity: 9, causes: "Insulation degradation from sustained overheating", occurrence: 5, controls: "Annual thermography survey", detection: 5, recommendedAction: "Add continuous winding RTD monitoring and trend against load.", addressed: true }
  ],
  2: [
    { id: 1, failureMode: "Blade Imbalance", effects: "Excessive vibration, gearbox bearing damage", severity: 7, causes: "Debris accumulation on blades", occurrence: 5, controls: "Monthly vibration route", detection: 3, recommendedAction: "", addressed: false },
    { id: 2, failureMode: "Gearbox Oil Degradation", effects: "Gear tooth wear leading to seizure", severity: 8, causes: "Extended oil change interval", occurrence: 4, controls: "Quarterly oil analysis", detection: 3, recommendedAction: "", addressed: false }
  ],
  3: [
    { id: 1, failureMode: "Discharge Temperature Excursion", effects: "Unplanned trip, loss of plant air", severity: 7, causes: "Fouled aftercooler", occurrence: 6, controls: "DCS high-temperature alarm", detection: 2, recommendedAction: "", addressed: false },
    { id: 2, failureMode: "Air End Bearing Wear", effects: "Catastrophic air end failure", severity: 9, causes: "Contaminated lubricant", occurrence: 3, controls: "Vibration and oil analysis", detection: 4, recommendedAction: "", addressed: false }
  ],
  4: [
    { id: 1, failureMode: "Stator Insulation Breakdown", effects: "Motor burnout, extended downtime", severity: 9, causes: "Repeated thermal cycling", occurrence: 4, controls: "Annual insulation resistance test", detection: 6, recommendedAction: "Increase megger test frequency to quarterly and trend polarization index.", addressed: false },
    { id: 2, failureMode: "Rotor Bar Cracking", effects: "Torque pulsation, efficiency loss", severity: 6, causes: "Frequent across-the-line starts", occurrence: 4, controls: "Motor current signature analysis", detection: 5, recommendedAction: "", addressed: false }
  ]
};

const inputClass =
  "w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-yellow-400/60";

const scaleSelectClass =
  "w-full appearance-none bg-slate-950 border border-slate-800 rounded-lg pl-2.5 pr-6 py-1.5 text-[11px] font-bold text-slate-200 font-mono cursor-pointer focus:outline-none focus:border-yellow-400/60";

// ===== Create FMEA modal =====

function CreateFmeaModal({
  onCreate,
  onClose
}: {
  onCreate: (draft: Omit<FmeaRecord, "id">) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [assetName, setAssetName] = useState("");
  const [title, setTitle] = useState("Criticality Analysis");
  const [dateCreated, setDateCreated] = useState(todayIso());
  const [status, setStatus] = useState<FmeaStatus>("Draft");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!assetName.trim() || !title.trim()) {
      toast("Asset name and analysis title are required.", "error");
      return;
    }
    onCreate({ assetName: assetName.trim(), title: title.trim(), dateCreated, status });
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
              <ShieldAlert className="h-4 w-4 text-yellow-400" />
              <span>Create New FMEA</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Opens a blank worksheet ready for failure modes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close create FMEA form"
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
              className={`${inputClass} py-2 text-xs`}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
              Analysis Title<span className="text-yellow-400 ml-0.5">*</span>
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Criticality Analysis"
              className={`${inputClass} py-2 text-xs`}
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                Date Created
              </span>
              <input
                type="date"
                value={dateCreated}
                onChange={(e) => setDateCreated(e.target.value)}
                className={`${inputClass} py-2 text-xs font-mono`}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                Status
              </span>
              <div className="relative">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as FmeaStatus)}
                  className={`${inputClass} py-2 text-xs appearance-none pr-9 cursor-pointer`}
                >
                  {FMEA_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
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
            <span>Create FMEA</span>
          </button>
        </div>
      </form>
    </div>
  );
}

// ===== Page =====

export default function FMEA({ selectedCompanyId }: FMEAProps) {
  const { toast } = useToast();
  const [records, setRecords] = useState<FmeaRecord[]>(INITIAL_RECORDS);
  const [worksheets, setWorksheets] = useState<Record<number, FmeaRow[]>>(INITIAL_WORKSHEETS);
  const [activeId, setActiveId] = useState<number>(INITIAL_RECORDS[0].id);
  const [showModal, setShowModal] = useState(false);

  const activeRecord = records.find((r) => r.id === activeId) ?? records[0];
  const rows = worksheets[activeId] ?? [];

  const setRows = (next: FmeaRow[]) =>
    setWorksheets((prev) => ({ ...prev, [activeId]: next }));

  const updateRow = (id: number, patch: Partial<FmeaRow>) =>
    setRows(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const addRow = () => {
    const nextId = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
    setRows([
      ...rows,
      {
        id: nextId,
        failureMode: "",
        effects: "",
        severity: 5,
        causes: "",
        occurrence: 5,
        controls: "",
        detection: 5,
        recommendedAction: "",
        addressed: false
      }
    ]);
  };

  const removeRow = (id: number) => setRows(rows.filter((row) => row.id !== id));

  /** Highest RPN per FMEA, derived so the overview list tracks worksheet edits. */
  const highestRpnFor = (recordId: number) => {
    const sheet = worksheets[recordId] ?? [];
    return sheet.reduce((max, row) => Math.max(max, calcRpn(row)), 0);
  };

  const summary = useMemo(() => {
    const scored = rows.map(calcRpn);
    return {
      high: scored.filter((rpn) => rpn > HIGH_RPN_THRESHOLD).length,
      medium: scored.filter((rpn) => rpn >= MEDIUM_RPN_THRESHOLD && rpn <= HIGH_RPN_THRESHOLD).length,
      low: scored.filter((rpn) => rpn < MEDIUM_RPN_THRESHOLD).length,
      highest: scored.reduce((max, rpn) => Math.max(max, rpn), 0)
    };
  }, [rows]);

  const highRiskRows = useMemo(
    () =>
      rows
        .filter((row) => calcRpn(row) > HIGH_RPN_THRESHOLD)
        .sort((a, b) => calcRpn(b) - calcRpn(a)),
    [rows]
  );

  const addressedCount = highRiskRows.filter((row) => row.addressed).length;

  const createRecord = (draft: Omit<FmeaRecord, "id">) => {
    const nextId = records.reduce((max, r) => Math.max(max, r.id), 0) + 1;
    setRecords((prev) => [{ ...draft, id: nextId }, ...prev]);
    setWorksheets((prev) => ({ ...prev, [nextId]: [] }));
    setActiveId(nextId);
    setShowModal(false);
    toast(`FMEA worksheet opened for ${draft.assetName}.`, "success");
  };

  return (
    <div className="space-y-6">

      {/* ===== Section A: Overview ===== */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-yellow-400" />
              <span>FMEA Overview</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Failure mode and effects analyses across the monitored fleet
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-bold rounded-xl cursor-pointer transition-colors shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create New FMEA</span>
          </button>
        </div>

        <ul className="space-y-2">
          {records.map((record) => {
            const isActive = record.id === activeId;
            const rpn = highestRpnFor(record.id);
            const style = getRpnStyle(rpn);

            return (
              <li
                key={record.id}
                className={`rounded-xl border p-3.5 transition-colors ${
                  isActive
                    ? "bg-yellow-400/5 border-yellow-400/30"
                    : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-100">{record.assetName}</span>
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${STATUS_BADGES[record.status]}`}>
                        {record.status}
                      </span>
                      {isActive && (
                        <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest">
                          Open in worksheet
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{record.title}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 lg:gap-6 shrink-0">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                        Date Created
                      </span>
                      <span className="text-[11px] text-slate-300 font-mono">
                        {formatDate(record.dateCreated)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                        Highest RPN
                      </span>
                      <span className={`inline-block px-1.5 py-0.5 rounded border text-[11px] font-bold font-mono ${style.badge}`}>
                        {rpn || "—"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveId(record.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-yellow-400/50 hover:text-yellow-400 text-slate-300 text-[11px] font-bold rounded-lg cursor-pointer transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Open</span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ===== Section B: Worksheet ===== */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate">
              FMEA: {activeRecord.assetName} — {activeRecord.title}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Created {formatDate(activeRecord.dateCreated)} · RPN = Severity × Occurrence × Detection
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="px-2 py-1 rounded border text-[10px] font-bold bg-red-500/10 text-red-400 border-red-500/25">
              {summary.high} High
            </span>
            <span className="px-2 py-1 rounded border text-[10px] font-bold bg-yellow-400/10 text-yellow-400 border-yellow-400/25">
              {summary.medium} Medium
            </span>
            <span className="px-2 py-1 rounded border text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
              {summary.low} Low
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {rows.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <ClipboardCheck className="h-8 w-8 text-slate-700 mx-auto" />
              <p className="text-xs font-bold text-slate-400">No failure modes recorded</p>
              <p className="text-[11px] text-slate-500">
                Add the first failure mode to begin scoring this asset.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1240px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left pb-2 pr-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[190px]">
                      Failure Mode
                    </th>
                    <th className="text-left pb-2 pr-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[220px]">
                      Potential Effects
                    </th>
                    <th className="text-center pb-2 pr-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[70px]">
                      S
                    </th>
                    <th className="text-left pb-2 pr-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[200px]">
                      Potential Causes
                    </th>
                    <th className="text-center pb-2 pr-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[70px]">
                      O
                    </th>
                    <th className="text-left pb-2 pr-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[200px]">
                      Current Controls
                    </th>
                    <th className="text-center pb-2 pr-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[70px]">
                      D
                    </th>
                    <th className="text-center pb-2 pr-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[90px]">
                      RPN
                    </th>
                    <th className="w-10 pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const rpn = calcRpn(row);
                    const style = getRpnStyle(rpn);

                    return (
                      <tr key={row.id} className="border-b border-slate-800/60 last:border-0 align-top">
                        <td className="py-2.5 pr-3">
                          <input
                            type="text"
                            value={row.failureMode}
                            onChange={(e) => updateRow(row.id, { failureMode: e.target.value })}
                            placeholder="Bearing Seizure"
                            className={inputClass}
                          />
                        </td>
                        <td className="py-2.5 pr-3">
                          <textarea
                            value={row.effects}
                            onChange={(e) => updateRow(row.id, { effects: e.target.value })}
                            rows={2}
                            placeholder="Pump stops, production halt"
                            className={`${inputClass} resize-none leading-snug`}
                          />
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="relative">
                            <select
                              value={row.severity}
                              onChange={(e) => updateRow(row.id, { severity: Number(e.target.value) })}
                              aria-label={`Severity for ${row.failureMode || "new failure mode"}`}
                              className={scaleSelectClass}
                            >
                              {SCALE.map((n) => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                            <ChevronDown className="h-3 w-3 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <input
                            type="text"
                            value={row.causes}
                            onChange={(e) => updateRow(row.id, { causes: e.target.value })}
                            placeholder="Lubrication failure"
                            className={inputClass}
                          />
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="relative">
                            <select
                              value={row.occurrence}
                              onChange={(e) => updateRow(row.id, { occurrence: Number(e.target.value) })}
                              aria-label={`Occurrence for ${row.failureMode || "new failure mode"}`}
                              className={scaleSelectClass}
                            >
                              {SCALE.map((n) => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                            <ChevronDown className="h-3 w-3 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <input
                            type="text"
                            value={row.controls}
                            onChange={(e) => updateRow(row.id, { controls: e.target.value })}
                            placeholder="Monthly vibration monitoring"
                            className={inputClass}
                          />
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="relative">
                            <select
                              value={row.detection}
                              onChange={(e) => updateRow(row.id, { detection: Number(e.target.value) })}
                              aria-label={`Detection for ${row.failureMode || "new failure mode"}`}
                              className={scaleSelectClass}
                            >
                              {SCALE.map((n) => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                            <ChevronDown className="h-3 w-3 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className={`rounded-lg border px-2 py-1.5 text-center ${style.cell}`}>
                            <span className="block text-sm font-bold font-mono leading-none">{rpn}</span>
                            <span className="block text-[9px] font-bold uppercase tracking-wider opacity-80 mt-0.5">
                              {style.level}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5">
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            aria-label={`Remove ${row.failureMode || "row"}`}
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

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-800 hover:border-yellow-400/50 hover:text-yellow-400 text-slate-300 text-xs font-bold rounded-lg cursor-pointer transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Row</span>
            </button>

            {rows.length > 0 && (
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Activity className="h-3 w-3 text-yellow-400" />
                <span>Highest RPN: {summary.highest}</span>
              </span>
            )}
          </div>

          <p className="text-[10px] text-slate-500 leading-relaxed">
            Scales run 1–10. Severity 10 is catastrophic, Occurrence 10 is very frequent, and
            Detection 10 means the failure is effectively impossible to detect before it occurs.
          </p>
        </div>
      </section>

      {/* ===== Section C: Action Plan ===== */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <span>Recommended Actions for High RPN Items</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Failure modes scoring above {HIGH_RPN_THRESHOLD} require a documented mitigation
            </p>
          </div>
          {highRiskRows.length > 0 && (
            <span className="text-[10px] font-bold text-slate-400 font-mono shrink-0">
              {addressedCount} of {highRiskRows.length} addressed
            </span>
          )}
        </div>

        {highRiskRows.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-500/60 mx-auto" />
            <p className="text-xs font-bold text-emerald-400">No high-risk failure modes</p>
            <p className="text-[11px] text-slate-500">
              Every scored failure mode on this worksheet is at or below an RPN of{" "}
              {HIGH_RPN_THRESHOLD}.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {highRiskRows.map((row) => {
              const rpn = calcRpn(row);
              return (
                <li
                  key={row.id}
                  className={`rounded-xl border p-4 space-y-3 transition-colors ${
                    row.addressed
                      ? "bg-emerald-500/5 border-emerald-500/25"
                      : "bg-slate-950/40 border-red-500/25"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={row.addressed}
                      onChange={() => updateRow(row.id, { addressed: !row.addressed })}
                      aria-label={`Mark as addressed: ${row.failureMode || "failure mode"}`}
                      className="h-4 w-4 mt-0.5 accent-yellow-400 cursor-pointer shrink-0"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs font-bold ${row.addressed ? "text-slate-500 line-through" : "text-slate-100"}`}>
                          {row.failureMode || "Untitled failure mode"}
                        </span>
                        <span className="px-1.5 py-0.5 rounded border text-[10px] font-bold font-mono bg-red-500/10 text-red-400 border-red-500/25">
                          RPN {rpn}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          S{row.severity} × O{row.occurrence} × D{row.detection}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        {row.effects || "No effects recorded."}
                      </p>
                    </div>
                  </div>

                  <label className="block space-y-1.5 ml-7">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                      Recommended Corrective Action
                    </span>
                    <textarea
                      value={row.recommendedAction}
                      onChange={(e) => updateRow(row.id, { recommendedAction: e.target.value })}
                      rows={2}
                      placeholder="Describe the mitigation that will reduce severity, occurrence, or improve detection..."
                      className={`${inputClass} resize-none leading-relaxed`}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {showModal && (
        <CreateFmeaModal onCreate={createRecord} onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}
