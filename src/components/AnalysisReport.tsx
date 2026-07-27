import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, Calendar, CheckCircle2, ChevronDown, ClipboardCheck, Clock,
  DollarSign, Download, Eye, FileText, Filter, Info, Layers, LineChart, Mail, MapPin,
  MessageSquare, Plus, Search, Sparkles, Trash2, Wrench, X
} from "lucide-react";
import { useToast } from "./Toast";
import PartsInventoryModal, {
  formatUsd, getStockStatus, usePartsInventory, type InventoryPart
} from "./PartsInventory";
import WorkOrderGenerator from "./WorkOrderGenerator";

type ReportTab = "results" | "library" | "actions";

interface AnalysisReportProps {
  selectedCompanyId?: number;
}

const MOCK_ASSETS = [
  { id: 1, name: "Boiler Feed Pump B" },
  { id: 2, name: "Primary Induction Motor" },
  { id: 3, name: "Cooling Tower Fan 4" },
  { id: 4, name: "Screw Compressor RS37i" }
];

const TABS: { id: ReportTab; label: string }[] = [
  { id: "results", label: "1. Analysis Results" },
  { id: "library", label: "2. Spectrum Library" },
  { id: "actions", label: "3. Repair & Actions" }
];

const REPORT_SUMMARY = {
  assetName: "Pump Unit",
  tagId: "PMP-1042-A",
  inspectionDate: "Jul 24, 2026",
  topFaultCode: "VIB-1X-UNB",
  assessment:
    "The analyzed spectrum demonstrates a Healthy Operations fault signature. Overall velocity remains inside ISO 10816 Zone A with a dominant 1X running-speed peak and no elevated bearing defect frequencies. Harmonic content is low and the noise floor is stable against the prior route, indicating no developing mechanical fault at this time."
};

// ISO 10816 velocity thresholds (in/s RMS) — matches the backend zone logic.
const ISO_SCALE_MAX = 1.1;
const ISO_READING = 0.08;
const ISO_ZONES = [
  {
    label: "Nominal", zone: "A", from: 0, to: 0.28,
    bar: "bg-emerald-500", text: "text-emerald-400",
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
  },
  {
    label: "Warning", zone: "B/C", from: 0.28, to: 0.71,
    bar: "bg-yellow-400", text: "text-yellow-400",
    badge: "bg-yellow-400/10 text-yellow-400 border-yellow-400/25"
  },
  {
    label: "Danger", zone: "D", from: 0.71, to: ISO_SCALE_MAX,
    bar: "bg-red-500", text: "text-red-400",
    badge: "bg-red-500/10 text-red-400 border-red-500/25"
  }
];

type FaultSeverity = "Low" | "Medium" | "High";

const FAULT_MATRIX: { name: string; code: string; probability: number; severity: FaultSeverity }[] = [
  { name: "Unbalance", code: "1X Radial", probability: 62, severity: "Medium" },
  { name: "Misalignment", code: "2X Axial", probability: 38, severity: "Low" },
  { name: "Bearing Defect", code: "BPFO", probability: 19, severity: "Low" },
  { name: "Mechanical Looseness", code: "Sub-harmonic", probability: 11, severity: "Low" }
];

const SEVERITY_STYLES: Record<FaultSeverity, string> = {
  Low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  Medium: "bg-yellow-400/10 text-yellow-400 border-yellow-400/25",
  High: "bg-red-500/10 text-red-400 border-red-500/25"
};

// Overall velocity in mm/s RMS. 2.03 mm/s is the metric equivalent of the 0.08 in/s ISO reading.
const TREND_DATA = [
  { date: "Jul 18", value: 1.85 },
  { date: "Jul 19", value: 1.92 },
  { date: "Jul 20", value: 2.10 },
  { date: "Jul 21", value: 1.98 },
  { date: "Jul 22", value: 2.18 },
  { date: "Jul 23", value: 2.05 },
  { date: "Jul 24", value: 2.03 }
];
const TREND_MAX = 3;

// ===== Spectrum Library data =====

// Anchored to the report inspection date so the date-range filters stay deterministic.
const LIBRARY_TODAY = new Date("2026-07-24T00:00:00");

type PointGroup = "drive" | "nondrive" | "axial";

interface SpectrumPeak {
  freq: number; // normalised 0-1 position across the frequency axis
  amp: number;  // normalised 0-1 height
  width?: number;
}

interface SpectrumRecord {
  id: number;
  date: string;
  time: string;
  point: string;
  pointGroup: PointGroup;
  overall: number; // mm/s RMS
  dominant: string;
  peaks: SpectrumPeak[];
}

const SPECTRA: SpectrumRecord[] = [
  { id: 1, date: "2026-07-24", time: "09:14", point: "Drive End Horizontal", pointGroup: "drive", overall: 2.03, dominant: "1X", peaks: [{ freq: 0.12, amp: 0.82 }, { freq: 0.24, amp: 0.24 }, { freq: 0.48, amp: 0.11 }] },
  { id: 2, date: "2026-07-22", time: "10:02", point: "Drive End Vertical", pointGroup: "drive", overall: 2.18, dominant: "1X", peaks: [{ freq: 0.12, amp: 0.74 }, { freq: 0.24, amp: 0.31 }, { freq: 0.61, amp: 0.14 }] },
  { id: 3, date: "2026-07-19", time: "14:37", point: "Non-Drive End Horizontal", pointGroup: "nondrive", overall: 1.86, dominant: "1X", peaks: [{ freq: 0.11, amp: 0.63 }, { freq: 0.33, amp: 0.18 }] },
  { id: 4, date: "2026-07-11", time: "08:20", point: "Axial", pointGroup: "axial", overall: 2.41, dominant: "2X", peaks: [{ freq: 0.12, amp: 0.42 }, { freq: 0.25, amp: 0.68 }, { freq: 0.37, amp: 0.22 }] },
  { id: 5, date: "2026-07-02", time: "11:55", point: "Drive End Horizontal", pointGroup: "drive", overall: 1.94, dominant: "1X", peaks: [{ freq: 0.12, amp: 0.70 }, { freq: 0.52, amp: 0.16 }] },
  { id: 6, date: "2026-06-26", time: "15:41", point: "Non-Drive End Vertical", pointGroup: "nondrive", overall: 2.62, dominant: "BPFO", peaks: [{ freq: 0.13, amp: 0.44 }, { freq: 0.58, amp: 0.57 }, { freq: 0.66, amp: 0.38 }, { freq: 0.74, amp: 0.26 }] },
  { id: 7, date: "2026-06-10", time: "09:08", point: "Drive End Horizontal", pointGroup: "drive", overall: 1.72, dominant: "1X", peaks: [{ freq: 0.12, amp: 0.58 }, { freq: 0.24, amp: 0.15 }] },
  { id: 8, date: "2026-05-28", time: "13:26", point: "Axial", pointGroup: "axial", overall: 1.68, dominant: "1X", peaks: [{ freq: 0.12, amp: 0.55 }, { freq: 0.29, amp: 0.19 }] },
  { id: 9, date: "2026-05-06", time: "10:49", point: "Non-Drive End Horizontal", pointGroup: "nondrive", overall: 1.55, dominant: "1X", peaks: [{ freq: 0.11, amp: 0.49 }, { freq: 0.41, amp: 0.13 }] },
  { id: 10, date: "2026-04-02", time: "16:03", point: "Drive End Horizontal", pointGroup: "drive", overall: 1.48, dominant: "1X", peaks: [{ freq: 0.12, amp: 0.46 }] }
];

const DATE_FILTERS: { id: string; label: string; days: number | null }[] = [
  { id: "7d", label: "Last 7 Days", days: 7 },
  { id: "30d", label: "Last 30 Days", days: 30 },
  { id: "90d", label: "Last 90 Days", days: 90 },
  { id: "all", label: "All Time", days: null }
];

const POINT_FILTERS: { id: PointGroup | "all"; label: string }[] = [
  { id: "all", label: "All Points" },
  { id: "drive", label: "Drive End" },
  { id: "nondrive", label: "Non-Drive End" },
  { id: "axial", label: "Axial" }
];

const DEFAULT_DATE_FILTER = "all";

function formatSpectrumDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function overallBadgeStyle(overall: number) {
  if (overall >= 2.8) return "bg-red-500/15 text-red-400 border-red-500/30";
  if (overall >= 2.2) return "bg-yellow-400/15 text-yellow-400 border-yellow-400/30";
  return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
}

// Builds a plausible FFT shape: gaussian peaks over a deterministic noise floor.
// Seeded from the record id so the trace never changes between renders.
function buildSpectrumPoints(peaks: SpectrumPeak[], seed: number, samples = 150) {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const x = i / (samples - 1);
    let y = 0;
    for (const peak of peaks) {
      const width = peak.width ?? 0.014;
      y += peak.amp * Math.exp(-((x - peak.freq) ** 2) / (2 * width * width));
    }
    const noise = Math.abs(Math.sin((i + 1) * (seed + 1) * 12.9898) * 43758.5453) % 1;
    y += 0.03 + noise * 0.05;
    points.push({ x, y: Math.min(y, 1) });
  }
  return points;
}

function SpectrumTrace({
  record,
  className = "w-full h-28"
}: {
  record: SpectrumRecord;
  className?: string;
}) {
  // useId() contains colons, which are unsafe inside an SVG url(#...) reference.
  const gradientId = `spectrum-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const width = 300;
  const height = 120;
  const points = useMemo(() => buildSpectrumPoints(record.peaks, record.id), [record]);

  const toX = (x: number) => x * width;
  const toY = (y: number) => height - 4 - y * (height - 14);
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.x).toFixed(1)} ${toY(p.y).toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#facc15" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(g => (
        <line
          key={g}
          x1={g * width}
          y1="0"
          x2={g * width}
          y2={height}
          stroke="#1e293b"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke="#facc15" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function SpectrumMetrics({ record }: { record: SpectrumRecord }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="bg-slate-950/60 border border-slate-800 rounded-lg py-2">
        <span className="text-[9px] text-slate-500 uppercase font-mono block">Overall</span>
        <span className="text-xs font-bold text-white font-mono">{record.overall.toFixed(2)}</span>
      </div>
      <div className="bg-slate-950/60 border border-slate-800 rounded-lg py-2">
        <span className="text-[9px] text-slate-500 uppercase font-mono block">Dominant</span>
        <span className="text-xs font-bold text-yellow-400 font-mono">{record.dominant}</span>
      </div>
      <div className="bg-slate-950/60 border border-slate-800 rounded-lg py-2">
        <span className="text-[9px] text-slate-500 uppercase font-mono block">Peaks</span>
        <span className="text-xs font-bold text-slate-200 font-mono">{record.peaks.length}</span>
      </div>
    </div>
  );
}

// ===== Repair & Actions data =====

const DAYS_SINCE_SERVICE = 47;
export const ESTIMATED_LABOR_HOURS = 4;

const REPAIR_STEPS = [
  {
    id: 1,
    title: "Establish Lock-out/Tag-out (LOTO) protocols",
    description: "Isolate the drive, discharge stored energy, and apply personal locks before any contact with rotating elements."
  },
  {
    id: 2,
    title: "Check bearing alignment and clean structural feet",
    description: "Dial-indicate the coupling, then remove scale and paint from all mounting feet to guarantee metal-to-metal seating."
  },
  {
    id: 3,
    title: "Tighten foundation anchor fasteners to nominal torque",
    description: "Torque anchors in a diagonal sequence to the manufacturer specification and record final values."
  },
  {
    id: 4,
    title: "Re-energize unit and verify vibration levels",
    description: "Restart under normal load and confirm overall velocity has returned inside ISO 10816 Zone A."
  }
];

/** Report parts reference inventory records by id so pricing always comes from the database. */
export interface ReportPart {
  partId: number;
  quantity: number;
}

const INITIAL_REPORT_PARTS: ReportPart[] = [
  { partId: 1, quantity: 2 },
  { partId: 2, quantity: 1 },
  { partId: 3, quantity: 4 }
];

type RecommendationPriority = "High" | "Medium" | "Low";

const AI_RECOMMENDATIONS: { id: number; text: string; priority: RecommendationPriority; rationale: string }[] = [
  {
    id: 1,
    text: "Replace drive-end bearing within 30 days",
    priority: "High",
    rationale: "BPFO sidebands are rising against the June baseline."
  },
  {
    id: 2,
    text: "Perform precision laser shaft alignment at next shutdown",
    priority: "Medium",
    rationale: "Elevated 2X axial content suggests residual angular misalignment."
  },
  {
    id: 3,
    text: "Add unit to the monthly vibration route for trend confirmation",
    priority: "Low",
    rationale: "Thirty-day interval will confirm whether 1X amplitude stabilises."
  }
];

const PRIORITY_STYLES: Record<RecommendationPriority, string> = {
  High: "bg-red-500/10 text-red-400 border-red-500/25",
  Medium: "bg-yellow-400/10 text-yellow-400 border-yellow-400/25",
  Low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
};

interface RepairActionsPanelProps {
  inventory: InventoryPart[];
  reportParts: ReportPart[];
  onOpenInventory: () => void;
  onCreateWorkOrder: () => void;
  onChangeQuantity: (partId: number, quantity: number) => void;
  onRemovePart: (partId: number) => void;
}

function RepairActionsPanel({
  inventory,
  reportParts,
  onOpenInventory,
  onCreateWorkOrder,
  onChangeQuantity,
  onRemovePart
}: RepairActionsPanelProps) {
  const { toast } = useToast();
  // Seeded to match the reference progress counts (2 of 4 steps, 1 of 3 recommendations).
  const [completedSteps, setCompletedSteps] = useState<number[]>([1, 2]);
  const [addressedRecs, setAddressedRecs] = useState<number[]>([3]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [noteEditorId, setNoteEditorId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const stepsComplete = completedSteps.length;
  const allStepsComplete = stepsComplete === REPAIR_STEPS.length;
  const stepPercent = (stepsComplete / REPAIR_STEPS.length) * 100;

  // Join the report's part references against the inventory so descriptions and
  // pricing stay authoritative even after an inventory record is edited.
  const partLines = useMemo(
    () =>
      reportParts
        .map(line => {
          const part = inventory.find(p => p.id === line.partId);
          return part ? { ...line, part } : null;
        })
        .filter((line): line is { partId: number; quantity: number; part: InventoryPart } => line !== null),
    [reportParts, inventory]
  );

  const partsTotal = partLines.reduce((sum, line) => sum + line.quantity * line.part.unitPrice, 0);

  const availability = useMemo(() => {
    if (partLines.length === 0) {
      return { value: "No Parts Listed", tone: "text-slate-400", icon: Layers };
    }
    if (partLines.some(line => line.part.quantityInStock <= 0)) {
      return { value: "Backordered", tone: "text-red-400", icon: AlertTriangle };
    }
    if (partLines.some(line => line.part.quantityInStock < line.quantity)) {
      return { value: "Partial Stock", tone: "text-yellow-400", icon: AlertTriangle };
    }
    return { value: "In Stock", tone: "text-emerald-400", icon: CheckCircle2 };
  }, [partLines]);

  const quickStats = [
    { label: "Days Since Last Service", value: String(DAYS_SINCE_SERVICE), icon: Clock, tone: "text-yellow-400" },
    { label: "Estimated Repair Time", value: `${ESTIMATED_LABOR_HOURS} hours`, icon: Wrench, tone: "text-slate-200" },
    { label: "Parts Availability", value: availability.value, icon: availability.icon, tone: availability.tone }
  ];

  const toggleStep = (id: number) => {
    setCompletedSteps(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const toggleRec = (id: number) => {
    setAddressedRecs(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const openNoteEditor = (id: number) => {
    setNoteEditorId(id);
    setNoteDraft(notes[id] ?? "");
  };

  const saveNote = (id: number) => {
    const trimmed = noteDraft.trim();
    setNotes(prev => {
      const next = { ...prev };
      if (trimmed) next[id] = trimmed;
      else delete next[id];
      return next;
    });
    setNoteEditorId(null);
    setNoteDraft("");
  };

  return (
    <div className="space-y-5">

      {/* ===== 5. Quick Stats Row ===== */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {quickStats.map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
              <span className="h-9 w-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                <Icon className={`h-4 w-4 ${stat.tone}`} />
              </span>
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block truncate">
                  {stat.label}
                </span>
                <span className={`text-sm font-bold block ${stat.tone}`}>{stat.value}</span>
              </div>
            </div>
          );
        })}
      </section>

      {/* ===== Two-column: Checklist (left) + Parts (right) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ===== 1. Step-by-Step Repair Checklist ===== */}
        <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
              <ClipboardCheck className="h-4 w-4 text-yellow-400" />
              <span>Repair Procedure</span>
            </h4>
            <span className="text-[10px] font-bold text-slate-400 font-mono">
              {stepsComplete} of {REPAIR_STEPS.length} steps completed
            </span>
          </div>

          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-yellow-400 rounded-full transition-all duration-300"
              style={{ width: `${stepPercent}%` }}
            />
          </div>

          <ol className="space-y-2 flex-1">
            {REPAIR_STEPS.map((step, index) => {
              const isDone = completedSteps.includes(step.id);
              return (
                <li key={step.id}>
                  <label
                    className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      isDone
                        ? "bg-emerald-500/5 border-emerald-500/25"
                        : "bg-slate-900/50 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => toggleStep(step.id)}
                      className="h-4 w-4 mt-0.5 accent-yellow-400 cursor-pointer shrink-0"
                    />
                    <div className="min-w-0 space-y-0.5">
                      <p className={`text-xs font-bold ${isDone ? "text-slate-500 line-through" : "text-slate-200"}`}>
                        <span className="font-mono text-yellow-400/80 mr-1.5">{index + 1}.</span>
                        {step.title}
                      </p>
                      <p className="text-[11px] text-slate-500 leading-relaxed">{step.description}</p>
                    </div>
                  </label>
                </li>
              );
            })}
          </ol>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setCompletedSteps(REPAIR_STEPS.map(s => s.id))}
              disabled={allStepsComplete}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-yellow-400 text-slate-950 text-xs font-bold rounded-lg transition-colors enabled:hover:bg-yellow-500 enabled:cursor-pointer disabled:opacity-40"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{allStepsComplete ? "All Steps Complete" : "Mark All Complete"}</span>
            </button>
            {stepsComplete > 0 && (
              <button
                type="button"
                onClick={() => setCompletedSteps([])}
                className="px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </section>

        {/* ===== 2. Replacement Parts Catalog ===== */}
        <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-yellow-400" />
              <span>Required Parts</span>
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 font-mono">
                {partLines.length} line items
              </span>
              <button
                type="button"
                onClick={onOpenInventory}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-950 border border-slate-800 hover:border-yellow-400/50 hover:text-yellow-400 text-slate-300 text-[10px] font-bold rounded cursor-pointer transition-colors"
              >
                <Search className="h-3 w-3" />
                <span>Search Inventory</span>
              </button>
            </div>
          </div>

          {partLines.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 space-y-3">
              <Layers className="h-8 w-8 text-slate-700" />
              <p className="text-xs font-bold text-slate-400">No parts attached to this report</p>
              <p className="text-[11px] text-slate-500 max-w-xs">
                Search the stockroom inventory to attach parts. Pricing and stock levels are pulled
                from the inventory database.
              </p>
              <button
                type="button"
                onClick={onOpenInventory}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Search Inventory</span>
              </button>
            </div>
          ) : (
            <ul className="space-y-2 flex-1">
              {partLines.map(({ partId, quantity, part }) => {
                const stock = getStockStatus(part);
                const shortfall = part.quantityInStock < quantity;

                return (
                  <li
                    key={partId}
                    className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 space-y-2.5 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-200 truncate" title={part.description}>
                          {part.description}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {part.partNumber} &middot; {part.supplierName}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${stock.badge}`}>
                          {stock.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRemovePart(partId)}
                          aria-label={`Remove ${part.partNumber} from report`}
                          className="text-slate-600 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/70">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Qty</span>
                        <input
                          type="number"
                          min="1"
                          value={quantity}
                          onChange={e => onChangeQuantity(partId, parseInt(e.target.value, 10) || 1)}
                          aria-label={`Quantity for ${part.partNumber}`}
                          className="w-14 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[10px] font-bold text-slate-200 font-mono focus:outline-none focus:border-yellow-400/60"
                        />
                        <span className="text-[10px] text-slate-500 font-mono">
                          &times; {formatUsd(part.unitPrice)} ={" "}
                          <span className="text-slate-300 font-bold">
                            {formatUsd(part.unitPrice * quantity)}
                          </span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          toast(
                            `Purchase request for ${quantity} x ${part.partNumber} sent to ${part.supplierName}.`,
                            "success"
                          )
                        }
                        className="flex items-center gap-1 px-2.5 py-1 bg-slate-950 border border-slate-800 hover:border-yellow-400/50 hover:text-yellow-400 text-slate-300 text-[10px] font-bold rounded cursor-pointer transition-colors shrink-0"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Order</span>
                      </button>
                    </div>

                    {shortfall && (
                      <p className="text-[10px] text-yellow-400 flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span>
                          Only {part.quantityInStock} on hand &middot; {part.leadTimeDays} day lead time
                        </span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between px-3 py-2.5 bg-slate-900/60 border border-slate-800 rounded-lg">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                <span>Total Estimated Cost</span>
              </span>
              <span className="text-sm font-bold text-emerald-400 font-mono">
                {formatUsd(partsTotal)}
              </span>
            </div>
            <button
              type="button"
              disabled={partLines.length === 0}
              onClick={() =>
                toast(`Consolidated purchase order raised for ${partLines.length} line items.`, "success")
              }
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-800 text-slate-300 text-xs font-bold rounded-lg transition-colors enabled:hover:border-yellow-400/50 enabled:hover:text-yellow-400 enabled:cursor-pointer disabled:opacity-40"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Order All from Supplier</span>
            </button>
          </div>
        </section>
      </div>

      {/* ===== 3. AI Recommendations Tracker ===== */}
      <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-yellow-400" />
            <span>AI-Generated Recommendations</span>
          </h4>
          <span className="text-[10px] font-bold text-slate-400 font-mono">
            {addressedRecs.length} of {AI_RECOMMENDATIONS.length} recommendations addressed
          </span>
        </div>

        <ul className="space-y-2">
          {AI_RECOMMENDATIONS.map(rec => {
            const isAddressed = addressedRecs.includes(rec.id);
            const isEditing = noteEditorId === rec.id;
            const savedNote = notes[rec.id];

            return (
              <li
                key={rec.id}
                className={`rounded-lg border p-3 space-y-2.5 transition-colors ${
                  isAddressed ? "bg-emerald-500/5 border-emerald-500/25" : "bg-slate-900/50 border-slate-800"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isAddressed}
                    onChange={() => toggleRec(rec.id)}
                    aria-label={`Mark as complete: ${rec.text}`}
                    className="h-4 w-4 mt-0.5 accent-yellow-400 cursor-pointer shrink-0"
                  />

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-bold shrink-0 ${PRIORITY_STYLES[rec.priority]}`}
                      >
                        {rec.priority}
                      </span>
                      <p className={`text-xs font-bold ${isAddressed ? "text-slate-500 line-through" : "text-slate-200"}`}>
                        {rec.text}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{rec.rationale}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => (isEditing ? setNoteEditorId(null) : openNoteEditor(rec.id))}
                    className="flex items-center gap-1 px-2.5 py-1 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-[10px] font-bold rounded cursor-pointer transition-colors shrink-0"
                  >
                    <MessageSquare className="h-3 w-3" />
                    <span>{savedNote ? "Edit Note" : "Add Note"}</span>
                  </button>
                </div>

                {savedNote && !isEditing && (
                  <p className="text-[11px] text-slate-400 italic border-l-2 border-yellow-400/50 pl-2.5 ml-7">
                    {savedNote}
                  </p>
                )}

                {isEditing && (
                  <div className="ml-7 space-y-2">
                    <textarea
                      value={noteDraft}
                      onChange={e => setNoteDraft(e.target.value)}
                      rows={2}
                      placeholder="Technician feedback, field observations, or deferral reason..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[11px] text-slate-200 focus:outline-none focus:border-yellow-400/60 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveNote(rec.id)}
                        className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-[10px] font-bold rounded cursor-pointer transition-colors"
                      >
                        Save Note
                      </button>
                      <button
                        type="button"
                        onClick={() => setNoteEditorId(null)}
                        className="px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 text-[10px] font-bold rounded cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ===== 4. Export & Share ===== */}
      <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
          <Download className="h-4 w-4 text-yellow-400" />
          <span>Report Distribution</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: "Export as PDF",
              hint: "Full technical report",
              icon: FileText,
              primary: true,
              onClick: () => toast("Full technical report exported as PDF.", "success")
            },
            {
              label: "Export as CSV",
              hint: "Raw measurement data",
              icon: Download,
              primary: false,
              onClick: () => toast("Raw measurement data exported as CSV.", "success")
            },
            {
              label: "Email to Manager",
              hint: "Sends summary",
              icon: Mail,
              primary: false,
              onClick: () => toast("Summary emailed to the reliability manager.", "success")
            },
            {
              label: "Create Work Order",
              hint: "Pre-populated with findings",
              icon: Wrench,
              primary: false,
              onClick: onCreateWorkOrder
            }
          ].map(action => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className={`flex flex-col items-start gap-1.5 p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  action.primary
                    ? "bg-yellow-400 border-yellow-400 text-slate-950 hover:bg-yellow-500"
                    : "bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-xs font-bold">{action.label}</span>
                <span className={`text-[10px] ${action.primary ? "text-slate-800" : "text-slate-500"}`}>
                  {action.hint}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SpectrumLibraryPanel() {
  const [compareMode, setCompareMode] = useState(false);
  const [dateFilter, setDateFilter] = useState<string>(DEFAULT_DATE_FILTER);
  const [pointFilter, setPointFilter] = useState<PointGroup | "all">("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [syncScroll, setSyncScroll] = useState(true);
  const [scrubId, setScrubId] = useState<number | null>(SPECTRA[0].id);

  const scrollRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isSyncing = useRef(false);

  // Newest first for the grid.
  const filtered = useMemo(() => {
    const days = DATE_FILTERS.find(f => f.id === dateFilter)?.days ?? null;
    return SPECTRA.filter(s => {
      if (pointFilter !== "all" && s.pointGroup !== pointFilter) return false;
      if (days === null) return true;
      const ageDays = (LIBRARY_TODAY.getTime() - new Date(`${s.date}T00:00:00`).getTime()) / 86_400_000;
      return ageDays <= days;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [dateFilter, pointFilter]);

  // Oldest first for the timeline scrubber.
  const chronological = useMemo(() => [...filtered].reverse(), [filtered]);

  // Leaving compare mode must not leave selections or an open comparison behind.
  useEffect(() => {
    if (!compareMode) {
      setSelectedIds([]);
      setComparisonOpen(false);
    }
  }, [compareMode]);

  // Drop selections and scrub position that the active filters no longer include.
  useEffect(() => {
    const visible = new Set(filtered.map(s => s.id));
    setSelectedIds(prev => prev.filter(id => visible.has(id)));
    setScrubId(prev => (prev !== null && visible.has(prev) ? prev : filtered[0]?.id ?? null));
  }, [filtered]);

  const filtersActive = dateFilter !== DEFAULT_DATE_FILTER || pointFilter !== "all";
  const selectionFull = selectedIds.length >= 4;
  const selectedRecords = filtered.filter(s => selectedIds.includes(s.id));
  const detailRecord = detailId !== null ? SPECTRA.find(s => s.id === detailId) ?? null : null;
  const scrubIndex = Math.max(0, chronological.findIndex(s => s.id === scrubId));

  const toggleSelected = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 4 ? prev : [...prev, id]
    );
  };

  const clearFilters = () => {
    setDateFilter(DEFAULT_DATE_FILTER);
    setPointFilter("all");
  };

  const handleSyncedScroll = (index: number) => (event: React.UIEvent<HTMLDivElement>) => {
    if (!syncScroll || isSyncing.current) return;
    isSyncing.current = true;
    const { scrollLeft } = event.currentTarget;
    scrollRefs.current.forEach((el, i) => {
      if (el && i !== index) el.scrollLeft = scrollLeft;
    });
    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  };

  return (
    <div className="space-y-5">

      {/* ===== 5. Filter Controls ===== */}
      <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">

          <div className="space-y-1.5 flex-1 min-w-0">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Filter className="h-3 w-3 text-yellow-400" />
              <span>Date Range</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DATE_FILTERS.map(filter => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setDateFilter(filter.id)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer border ${
                    dateFilter === filter.id
                      ? "bg-yellow-400 text-slate-950 border-yellow-400"
                      : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <MapPin className="h-3 w-3 text-yellow-400" />
              <span>Measurement Point</span>
            </label>
            <div className="relative">
              <select
                value={pointFilter}
                onChange={e => setPointFilter(e.target.value as PointGroup | "all")}
                className="appearance-none bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-9 py-1.5 text-[11px] font-bold text-slate-200 cursor-pointer focus:outline-none focus:border-yellow-400/60"
              >
                {POINT_FILTERS.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Compare Mode lives with the library filters because Tab 2 is its only consumer. */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Layers className="h-3 w-3 text-yellow-400" />
              <span>Compare Mode</span>
            </label>
            <button
              type="button"
              role="switch"
              aria-checked={compareMode}
              onClick={() => setCompareMode(prev => !prev)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 cursor-pointer transition-colors ${
                compareMode
                  ? "bg-yellow-400/10 border-yellow-400/40"
                  : "bg-slate-950 border-slate-800 hover:border-slate-700"
              }`}
            >
              <span
                className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${
                  compareMode ? "bg-yellow-400" : "bg-slate-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                    compareMode ? "left-4" : "left-0.5"
                  }`}
                />
              </span>
              <span
                className={`text-[11px] font-bold ${compareMode ? "text-yellow-400" : "text-slate-400"}`}
              >
                {compareMode ? "ON" : "OFF"}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={clearFilters}
            disabled={!filtersActive}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors bg-slate-950 border-slate-800 text-slate-400 enabled:hover:text-white enabled:hover:border-slate-700 enabled:cursor-pointer disabled:opacity-40"
          >
            Clear Filters
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/70">
          <span className="text-[10px] text-slate-500 font-mono">
            Showing {filtered.length} of {SPECTRA.length} spectra
          </span>
          {compareMode && (
            <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1.5">
              <Info className="h-3 w-3 text-yellow-400" />
              Select 2-4 spectra to compare side-by-side
            </span>
          )}
        </div>
      </section>

      {/* Compare action bar */}
      {compareMode && selectedIds.length >= 2 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-yellow-400/10 border border-yellow-400/30 rounded-xl px-4 py-3">
          <span className="text-xs font-bold text-yellow-400">
            {selectedIds.length} spectra selected{selectionFull ? " (maximum reached)" : ""}
          </span>
          <button
            type="button"
            onClick={() => setComparisonOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Compare Selected ({selectedIds.length})</span>
          </button>
        </div>
      )}

      {/* ===== 1. Spectrum Image Grid ===== */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl">
          <Info className="h-6 w-6 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-400 font-medium">No spectra match the current filters</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 text-[11px] font-bold rounded-lg cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(record => {
            const isSelected = selectedIds.includes(record.id);
            const isScrubbed = record.id === scrubId;
            return (
              <div
                key={record.id}
                onClick={() => (compareMode ? toggleSelected(record.id) : setDetailId(record.id))}
                className={`relative bg-slate-900 border rounded-xl overflow-hidden transition-all cursor-pointer group ${
                  isSelected
                    ? "border-yellow-400 shadow-lg shadow-yellow-400/10"
                    : isScrubbed
                      ? "border-yellow-400/50"
                      : "border-slate-800 hover:border-slate-700"
                }`}
              >
                {/* Selection checkbox */}
                {compareMode && (
                  <label
                    className="absolute top-2 right-2 z-10 flex items-center justify-center"
                    onClick={e => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!isSelected && selectionFull}
                      onChange={() => toggleSelected(record.id)}
                      aria-label={`Select spectrum from ${formatSpectrumDate(record.date)}`}
                      className="h-4 w-4 accent-yellow-400 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </label>
                )}

                {/* Spectrum visual */}
                <div className="relative bg-slate-950 border-b border-slate-800">
                  <SpectrumTrace record={record} />
                  <span
                    className={`absolute bottom-2 left-2 px-1.5 py-0.5 rounded border text-[9px] font-bold font-mono ${overallBadgeStyle(record.overall)}`}
                  >
                    {record.overall.toFixed(2)} mm/s
                  </span>
                  {!compareMode && (
                    <span className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[9px] font-bold text-slate-300">
                      <Eye className="h-3 w-3" />
                      View
                    </span>
                  )}
                </div>

                {/* Meta */}
                <div className="p-3 space-y-0.5">
                  <p className="text-xs font-bold text-slate-200 truncate" title={record.point}>
                    {record.point}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    {formatSpectrumDate(record.date)} &middot; {record.time}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== 4. Time Slider ===== */}
      {chronological.length > 1 && (
        <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-yellow-400" />
              <span>Spectrum Timeline</span>
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">
              {chronological[scrubIndex]
                ? `${formatSpectrumDate(chronological[scrubIndex].date)} · ${chronological[scrubIndex].point}`
                : "—"}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={chronological.length - 1}
            step={1}
            value={scrubIndex}
            onChange={e => setScrubId(chronological[parseInt(e.target.value, 10)]?.id ?? null)}
            aria-label="Scrub through historical spectra"
            className="w-full accent-yellow-400 cursor-pointer"
          />

          {/* Date markers */}
          <div className="flex justify-between gap-1">
            {chronological.map((record, i) => (
              <button
                key={record.id}
                type="button"
                onClick={() => setScrubId(record.id)}
                title={`${formatSpectrumDate(record.date)} — ${record.point}`}
                className="flex flex-col items-center gap-1 flex-1 min-w-0 cursor-pointer group"
              >
                <span
                  className={`h-2 w-2 rounded-full transition-all ${
                    i === scrubIndex
                      ? "bg-yellow-400 ring-2 ring-yellow-400/30 scale-125"
                      : "bg-slate-600 group-hover:bg-slate-400"
                  }`}
                />
                <span
                  className={`text-[9px] font-mono truncate w-full text-center ${
                    i === scrubIndex ? "text-yellow-400 font-bold" : "text-slate-600"
                  }`}
                >
                  {record.date.slice(5)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ===== 3. Side-by-Side Comparison View ===== */}
      {comparisonOpen && selectedRecords.length >= 2 && (
        <>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]" onClick={() => setComparisonOpen(false)} />
          <div className="fixed inset-3 sm:inset-6 lg:inset-10 z-[60] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">

            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="h-4 w-4 text-yellow-400" />
                <span>Side-by-Side Comparison ({selectedRecords.length})</span>
              </h3>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={syncScroll}
                  onClick={() => setSyncScroll(prev => !prev)}
                  className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 cursor-pointer hover:border-slate-700 transition-colors"
                >
                  <span className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${syncScroll ? "bg-yellow-400" : "bg-slate-700"}`}>
                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${syncScroll ? "left-4" : "left-0.5"}`} />
                  </span>
                  <span className={`text-[11px] font-bold ${syncScroll ? "text-yellow-400" : "text-slate-400"}`}>
                    Sync Scroll
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setComparisonOpen(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-[11px] font-bold rounded-lg cursor-pointer transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Close Comparison</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-[10px] text-slate-500 font-mono mb-3">
                {syncScroll
                  ? "Sync Scroll is on — panning one spectrum pans all others."
                  : "Sync Scroll is off — each spectrum pans independently."}
              </p>

              <div className={`grid gap-4 ${selectedRecords.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-2 xl:grid-cols-4"}`}>
                {selectedRecords.map((record, index) => (
                  <div key={record.id} className="bg-slate-950/50 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                    <div className="px-3 py-2.5 border-b border-slate-800">
                      <p className="text-xs font-bold text-white truncate" title={record.point}>{record.point}</p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {formatSpectrumDate(record.date)} &middot; {record.time}
                      </p>
                    </div>

                    <div
                      ref={el => { scrollRefs.current[index] = el; }}
                      onScroll={handleSyncedScroll(index)}
                      className="overflow-x-auto bg-slate-950 border-b border-slate-800 scrollbar-none"
                    >
                      <div className="w-[220%]">
                        <SpectrumTrace record={record} className="w-full h-44" />
                      </div>
                    </div>

                    <div className="p-3">
                      <SpectrumMetrics record={record} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===== 2. Detailed single-spectrum view (Compare Mode off) ===== */}
      {detailRecord && (
        <>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]" onClick={() => setDetailId(null)} />
          <div className="fixed inset-x-3 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-2xl z-[60] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white">{detailRecord.point}</h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                  {REPORT_SUMMARY.assetName} &middot; {REPORT_SUMMARY.tagId} &middot;{" "}
                  {formatSpectrumDate(detailRecord.date)} &middot; {detailRecord.time}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailId(null)}
                aria-label="Close detailed view"
                className="text-slate-500 hover:text-white shrink-0 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <SpectrumTrace record={detailRecord} className="w-full h-56" />
              </div>
              <SpectrumMetrics record={detailRecord} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AnalysisResultsPanel() {
  const markerPercent = Math.min((ISO_READING / ISO_SCALE_MAX) * 100, 100);
  const readingZone = ISO_ZONES.find(z => ISO_READING >= z.from && ISO_READING < z.to) ?? ISO_ZONES[0];

  // Trend chart geometry. The SVG scales as a unit via viewBox, so no library is needed.
  const chart = { width: 720, height: 240, left: 62, right: 704, top: 18, bottom: 188 };
  const pointX = (i: number) =>
    chart.left + (i * (chart.right - chart.left)) / (TREND_DATA.length - 1);
  const pointY = (value: number) =>
    chart.bottom - (value / TREND_MAX) * (chart.bottom - chart.top);
  const linePath = TREND_DATA.map((d, i) => `${i === 0 ? "M" : "L"} ${pointX(i)} ${pointY(d.value)}`).join(" ");
  const areaPath = `${linePath} L ${pointX(TREND_DATA.length - 1)} ${chart.bottom} L ${chart.left} ${chart.bottom} Z`;
  const yTicks = [0, 0.75, 1.5, 2.25, 3];

  return (
    <div className="space-y-5">

      {/* ===== 1. Executive Summary ===== */}
      <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Asset</span>
            <span className="text-sm font-bold text-white block truncate">{REPORT_SUMMARY.assetName}</span>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Tag ID</span>
            <span className="text-sm font-bold text-slate-200 font-mono block truncate">{REPORT_SUMMARY.tagId}</span>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Inspection Date</span>
            <span className="text-sm font-semibold text-slate-200 block truncate">{REPORT_SUMMARY.inspectionDate}</span>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Top Fault Code</span>
            <span className="text-sm font-bold text-yellow-400 font-mono block truncate">{REPORT_SUMMARY.topFaultCode}</span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-2">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>Vibration Health Assessment</span>
          </h4>
          <p className="text-xs text-slate-400 leading-relaxed">{REPORT_SUMMARY.assessment}</p>
        </div>
      </section>

      {/* ===== 2. ISO 10816 Severity Visualization ===== */}
      <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-yellow-400" />
            <span>ISO 10816 Severity</span>
          </h4>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-white font-mono">{ISO_READING.toFixed(2)}</span>
            <span className="text-[10px] text-slate-500 font-mono uppercase">in/s RMS</span>
            <span className={`ml-1.5 px-2 py-0.5 rounded border text-[10px] font-bold ${readingZone.badge}`}>
              ZONE {readingZone.zone} &middot; {readingZone.label.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="pt-6 pb-1">
          <div className="relative">
            {/* Zone bar */}
            <div className="flex h-4 rounded-full overflow-hidden border border-slate-800">
              {ISO_ZONES.map(zone => (
                <div
                  key={zone.zone}
                  className={zone.bar}
                  style={{ width: `${((zone.to - zone.from) / ISO_SCALE_MAX) * 100}%` }}
                  title={`Zone ${zone.zone}: ${zone.label}`}
                />
              ))}
            </div>

            {/* Current reading marker */}
            <div
              className="absolute -top-6 flex flex-col items-center -translate-x-1/2"
              style={{ left: `${markerPercent}%` }}
            >
              <span className="px-1.5 py-0.5 bg-white text-slate-950 text-[9px] font-bold rounded whitespace-nowrap shadow">
                {ISO_READING.toFixed(2)}
              </span>
              <span className="w-0.5 h-7 bg-white" />
            </div>
          </div>

          {/* Zone labels */}
          <div className="flex mt-2">
            {ISO_ZONES.map(zone => (
              <div
                key={zone.zone}
                className="text-center px-1"
                style={{ width: `${((zone.to - zone.from) / ISO_SCALE_MAX) * 100}%` }}
              >
                <span className={`text-[10px] font-bold block truncate ${zone.text}`}>{zone.label}</span>
                <span className="text-[9px] text-slate-500 font-mono block">
                  {zone.from.toFixed(2)}&ndash;{zone.to.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 3. Fault Probability Matrix ===== */}
      <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-yellow-400" />
          <span>Fault Probability Matrix</span>
        </h4>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[420px]">
            <thead>
              <tr className="border-b border-slate-800 text-[9px] text-slate-500 uppercase font-mono tracking-wider">
                <th className="py-2 pr-3 font-bold">Fault</th>
                <th className="py-2 px-3 font-bold">Probability</th>
                <th className="py-2 pl-3 font-bold text-right">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {FAULT_MATRIX.map(fault => (
                <tr key={fault.name} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-3 pr-3">
                    <span className="text-xs font-semibold text-slate-200 block">{fault.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{fault.code}</span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-[60px] h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-yellow-400 rounded-full"
                          style={{ width: `${fault.probability}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-200 font-mono w-9 text-right">
                        {fault.probability}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${SEVERITY_STYLES[fault.severity]}`}
                    >
                      {fault.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===== 4. Overall Vibration Trend ===== */}
      <section className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
            <LineChart className="h-4 w-4 text-yellow-400" />
            <span>Overall Vibration Trend</span>
          </h4>
          <span className="text-[10px] text-slate-500 font-mono uppercase">Last 7 days</span>
        </div>

        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="w-full h-56" role="img" aria-label="Overall vibration trend over the last 7 days">
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#facc15" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Horizontal gridlines + Y axis ticks */}
          {yTicks.map(tick => (
            <g key={tick}>
              <line
                x1={chart.left}
                y1={pointY(tick)}
                x2={chart.right}
                y2={pointY(tick)}
                stroke="#1e293b"
                strokeWidth="1"
                strokeDasharray={tick === 0 ? undefined : "4 4"}
              />
              <text x={chart.left - 10} y={pointY(tick) + 4} textAnchor="end" fill="#64748b" fontSize="11" fontFamily="monospace">
                {tick.toFixed(2)}
              </text>
            </g>
          ))}

          {/* Y axis caption */}
          <text
            x="16"
            y={(chart.top + chart.bottom) / 2}
            fill="#94a3b8"
            fontSize="11"
            fontWeight="bold"
            textAnchor="middle"
            transform={`rotate(-90 16 ${(chart.top + chart.bottom) / 2})`}
          >
            mm/s RMS
          </text>

          {/* Area + line */}
          <path d={areaPath} fill="url(#trendFill)" />
          <path d={linePath} fill="none" stroke="#facc15" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

          {/* Data points and X axis labels */}
          {TREND_DATA.map((d, i) => (
            <g key={d.date}>
              <circle cx={pointX(i)} cy={pointY(d.value)} r="4" fill="#0f172a" stroke="#facc15" strokeWidth="2.5" />
              <text x={pointX(i)} y={pointY(d.value) - 12} textAnchor="middle" fill="#e2e8f0" fontSize="11" fontFamily="monospace" fontWeight="bold">
                {d.value.toFixed(2)}
              </text>
              <text x={pointX(i)} y={chart.bottom + 26} textAnchor="middle" fill="#64748b" fontSize="11" fontFamily="monospace">
                {d.date}
              </text>
            </g>
          ))}
        </svg>
      </section>
    </div>
  );
}

const EXPORT_FORMATS = [
  { id: "pdf", label: "PDF", hint: "Full technical report" },
  { id: "csv", label: "CSV", hint: "Raw measurement data" },
  { id: "excel", label: "Excel", hint: "Workbook with charts" }
];

export default function AnalysisReport({ selectedCompanyId }: AnalysisReportProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ReportTab>("results");
  const [selectedAssetId, setSelectedAssetId] = useState<number>(MOCK_ASSETS[0].id);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { inventory, savePart } = usePartsInventory();
  const [reportParts, setReportParts] = useState<ReportPart[]>(INITIAL_REPORT_PARTS);
  const [showInventory, setShowInventory] = useState(false);
  const [showWorkOrder, setShowWorkOrder] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);

  const selectedAsset = MOCK_ASSETS.find(a => a.id === selectedAssetId) ?? MOCK_ASSETS[0];

  // Dismiss the export menu on any outside click.
  useEffect(() => {
    if (!exportOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [exportOpen]);

  const addPartToReport = (part: InventoryPart) => {
    setReportParts(prev =>
      prev.some(line => line.partId === part.id) ? prev : [...prev, { partId: part.id, quantity: 1 }]
    );
  };

  const changePartQuantity = (partId: number, quantity: number) => {
    setReportParts(prev =>
      prev.map(line => (line.partId === partId ? { ...line, quantity: Math.max(1, quantity) } : line))
    );
  };

  const removePartFromReport = (partId: number) => {
    setReportParts(prev => prev.filter(line => line.partId !== partId));
  };

  // Resolved against inventory so the work order carries live descriptions and pricing.
  const workOrderParts = reportParts
    .map(line => {
      const part = inventory.find(p => p.id === line.partId);
      return part
        ? {
            partNumber: part.partNumber,
            description: part.description,
            quantity: line.quantity,
            unitPrice: part.unitPrice
          }
        : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const handleExport = (format: string) => {
    setExportOpen(false);
    toast(`Analysis report exported as ${format}.`, "success");
  };

  return (
    <div className="space-y-6 pb-28">

      {/* ===== A. Top Navigation Bar ===== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-col xl:flex-row xl:items-end gap-4">

          {/* Asset Selector */}
          <div className="space-y-1.5 flex-1 min-w-0">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
              Asset
            </label>
            <div className="relative">
              <select
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(parseInt(e.target.value, 10))}
                className="w-full appearance-none bg-slate-950 border border-slate-800 rounded-xl pl-3 pr-9 py-2.5 text-sm font-semibold text-white cursor-pointer focus:outline-none focus:border-yellow-400/60"
              >
                {MOCK_ASSETS.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-4 w-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Date Range Picker */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Calendar className="h-3 w-3 text-yellow-400" />
              <span>Date Range</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-yellow-400/60"
              />
              <span className="text-slate-600 text-xs font-bold">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-yellow-400/60"
              />
            </div>
          </div>

          {/* Primary Actions */}
          <div className="space-y-1.5 xl:border-l xl:border-slate-800 xl:pl-4">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
              Actions
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowWorkOrder(true)}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-bold rounded-xl cursor-pointer transition-colors"
              >
                <Wrench className="h-3.5 w-3.5" />
                <span>Create Work Order</span>
              </button>

              {/* Export dropdown */}
              <div className="relative" ref={exportRef}>
                <button
                  type="button"
                  onClick={() => setExportOpen(prev => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={exportOpen}
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:text-white text-slate-300 text-xs font-bold rounded-xl cursor-pointer transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export Report</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${exportOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {exportOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1.5 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 z-30"
                  >
                    {EXPORT_FORMATS.map(format => (
                      <button
                        key={format.id}
                        type="button"
                        role="menuitem"
                        onClick={() => handleExport(format.label)}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-950 cursor-pointer transition-colors group"
                      >
                        <span className="text-xs font-bold text-slate-200 group-hover:text-yellow-400 block">
                          {format.label}
                        </span>
                        <span className="text-[10px] text-slate-500 block">{format.hint}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowInventory(true)}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:text-white text-slate-300 text-xs font-bold rounded-xl cursor-pointer transition-colors"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Parts Search</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  toast(`Re-test scheduled for ${selectedAsset.name} in 30 days.`, "success")
                }
                className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:text-white text-slate-300 text-xs font-bold rounded-xl cursor-pointer transition-colors"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>Schedule Re-test</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== B. Main Content Area (Tabs) ===== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">

        {/* Tab Navigation */}
        <div className="flex gap-1 border-b border-slate-800 px-3 pt-3 overflow-x-auto scrollbar-none">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 rounded-t-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer border-b-2 ${
                  isActive
                    ? "bg-slate-950/60 text-yellow-400 border-yellow-400"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-950/30 border-transparent"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Panels */}
        <div className="p-6 min-h-[360px]">
          {activeTab === "results" && <AnalysisResultsPanel />}
          {activeTab === "library" && <SpectrumLibraryPanel />}
          {activeTab === "actions" && (
            <RepairActionsPanel
              inventory={inventory}
              reportParts={reportParts}
              onOpenInventory={() => setShowInventory(true)}
              onCreateWorkOrder={() => setShowWorkOrder(true)}
              onChangeQuantity={changePartQuantity}
              onRemovePart={removePartFromReport}
            />
          )}
        </div>
      </div>

      {/* ===== C. Floating Quick Actions Bar ===== */}
      <div className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-wrap justify-center gap-2 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl px-3 py-2.5 shadow-2xl">
        <button
          type="button"
          onClick={() => toast(`${selectedAsset.name} added to the watchlist.`, "success")}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:text-white text-slate-300 text-xs font-bold rounded-lg transition-colors cursor-pointer"
        >
          <Eye className="h-3.5 w-3.5" />
          <span>Watchlist</span>
        </button>
        <button
          type="button"
          onClick={() => toast("Comparing current spectrum against the stored baseline.", "info")}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:text-white text-slate-300 text-xs font-bold rounded-lg transition-colors cursor-pointer"
        >
          <LineChart className="h-3.5 w-3.5" />
          <span>Compare Baseline</span>
        </button>
      </div>

      {/* ===== Modals ===== */}
      {showInventory && (
        <PartsInventoryModal
          inventory={inventory}
          reportPartIds={reportParts.map(line => line.partId)}
          onAddToReport={addPartToReport}
          onSavePart={savePart}
          onClose={() => setShowInventory(false)}
        />
      )}

      {showWorkOrder && (
        <WorkOrderGenerator
          assetName={selectedAsset.name}
          tagId={REPORT_SUMMARY.tagId}
          faultCode={REPORT_SUMMARY.topFaultCode}
          faultSeverity={FAULT_MATRIX[0].severity}
          recommendations={AI_RECOMMENDATIONS.map(r => ({ text: r.text, priority: r.priority }))}
          parts={workOrderParts}
          estimatedHours={ESTIMATED_LABOR_HOURS}
          onClose={() => setShowWorkOrder(false)}
        />
      )}
    </div>
  );
}
