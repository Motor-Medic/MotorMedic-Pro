import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, Bot, Check, CheckCircle2, ChevronDown, ChevronRight,
  Clock, Download, FileText, Search, Sparkles, Wrench, X
} from "lucide-react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip as RechartsTooltip, XAxis, YAxis
} from "recharts";
import { getEquipmentData, getFlatEquipment, type EquipComponent, type FlatEquipAsset } from "../data/equipmentDb";
import { SavedReport } from "../types";
import { useToast } from "./Toast";
import OnboardingEmptyState from "./OnboardingEmptyState";
import {
  fetchDiagnosisLogs,
  type SavedDiagnosisLog
} from "../lib/analysisPersistence";

/* ========================================================================== */
/* Props (kept for History.tsx wrapper)                                       */
/* ========================================================================== */

interface DiagnosisLogsProps {
  reports?: SavedReport[];
  onSelectReport?: (report: SavedReport) => void;
  onDeleteReport?: (id: string) => void;
  onStartDiagnosis?: () => void;
}

/* ========================================================================== */
/* Domain                                                                     */
/* ========================================================================== */

type Severity = "Critical" | "Warning" | "Info";
type LogStatus = "Pending" | "Acknowledged" | "Resolved" | "In Progress";
type EventSource = "Predictive Scan" | "Manual Check" | "Automated Alarm";
type DatePreset = "7d" | "30d" | "custom";

interface SparkPoint {
  t: string;
  vib: number;
}

interface LogEvent {
  id: string;
  timestamp: string;
  sortKey: number;
  assetName: string;
  assetTag: string;
  source: EventSource;
  severity: Severity;
  summary: string;
  confidence: number;
  primaryFault: string;
  secondaryFault: string;
  recommendedActions: string[];
  status: LogStatus;
  sparkline: SparkPoint[];
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  workOrder?: string;
  workOrderAt?: string;
  resolvedAt?: string;
  resolutionNotes: string;
}

interface Incident {
  id: string;
  number: number;
  title: string;
  assetName: string;
  assetTag: string;
  status: LogStatus;
  severity: Severity;
  events: LogEvent[];
}

const INPUT =
  "w-full min-h-[40px] bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400/60";

const SELECT =
  "w-full min-h-[40px] px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 truncate disabled:opacity-50 focus:outline-none focus:border-amber-400/60";

function spark(seed: number, peak: number): SparkPoint[] {
  return Array.from({ length: 14 }, (_, i) => ({
    t: `${i}`,
    vib: Math.max(0.4, +(peak * (0.45 + i / 20) + Math.sin((i + seed) / 2.2) * 0.35).toFixed(2))
  }));
}

function makeEvent(partial: Omit<LogEvent, "sparkline" | "resolutionNotes"> & Partial<Pick<LogEvent, "sparkline" | "resolutionNotes">>): LogEvent {
  return {
    resolutionNotes: "",
    sparkline: spark(partial.sortKey % 17, partial.severity === "Critical" ? 4.8 : partial.severity === "Warning" ? 3.2 : 1.6),
    ...partial
  };
}

const MOCK_EVENTS: LogEvent[] = [
  makeEvent({
    id: "e1",
    timestamp: "Today, 09:14 AM",
    sortKey: 900,
    assetName: "Boiler Feed Pump A",
    assetTag: "P-101A",
    source: "Predictive Scan",
    severity: "Critical",
    summary: "System detected 85% confidence of Outer Race Bearing Defect (BPFO).",
    confidence: 85,
    primaryFault: "Outer race spalling (BPFO)",
    secondaryFault: "Lubrication film breakdown",
    recommendedActions: ["Schedule bearing replacement within 72h", "Verify grease type vs OEM", "Increase route frequency to daily"],
    status: "In Progress",
    acknowledgedBy: "J. Whitfield",
    acknowledgedAt: "Today, 09:20 AM",
    workOrder: "WO-8842",
    workOrderAt: "Today, 09:45 AM"
  }),
  makeEvent({
    id: "e2",
    timestamp: "Today, 08:02 AM",
    sortKey: 860,
    assetName: "Boiler Feed Pump A",
    assetTag: "P-101A",
    source: "Automated Alarm",
    severity: "Warning",
    summary: "Zone C vibration alarm — overall velocity 3.45 mm/s RMS.",
    confidence: 78,
    primaryFault: "Elevated broadband vibration",
    secondaryFault: "Possible early bearing wear",
    recommendedActions: ["Confirm with predictive scan", "Check lubricant condition"],
    status: "Acknowledged",
    acknowledgedBy: "J. Whitfield",
    acknowledgedAt: "Today, 08:15 AM"
  }),
  makeEvent({
    id: "e3",
    timestamp: "Today, 06:40 AM",
    sortKey: 820,
    assetName: "Boiler Feed Pump A",
    assetTag: "P-101A",
    source: "Automated Alarm",
    severity: "Warning",
    summary: "NDE horizontal point crossed warning limit (2.95 mm/s).",
    confidence: 70,
    primaryFault: "NDE bearing vibration rise",
    secondaryFault: "Thermal growth misalignment contribution",
    recommendedActions: ["Inspect coupling alignment"],
    status: "Acknowledged",
    acknowledgedBy: "M. Delgado",
    acknowledgedAt: "Today, 07:05 AM"
  }),
  makeEvent({
    id: "e4",
    timestamp: "Yesterday, 04:18 PM",
    sortKey: 700,
    assetName: "Boiler Feed Pump A",
    assetTag: "P-101A",
    source: "Manual Check",
    severity: "Info",
    summary: "Manual ultrasound grease check — dB elevated before top-off.",
    confidence: 62,
    primaryFault: "Lubrication starvation indicators",
    secondaryFault: "None",
    recommendedActions: ["Document grease amount", "Retest after 24h"],
    status: "Resolved",
    acknowledgedBy: "S. Barrett",
    acknowledgedAt: "Yesterday, 04:30 PM",
    resolvedAt: "Yesterday, 05:10 PM",
    resolutionNotes: "Added 2.5g Polyrex EM; ultrasound dropped 8 dB."
  }),
  makeEvent({
    id: "e5",
    timestamp: "Yesterday, 11:05 AM",
    sortKey: 650,
    assetName: "Boiler Feed Pump A",
    assetTag: "P-101A",
    source: "Predictive Scan",
    severity: "Warning",
    summary: "System flagged progressive 1X sideband growth around BPFO.",
    confidence: 74,
    primaryFault: "Developing outer race defect",
    secondaryFault: "Possible contamination",
    recommendedActions: ["Oil/grease sample", "Plan bearing kit"],
    status: "Acknowledged",
    acknowledgedBy: "R. Chen",
    acknowledgedAt: "Yesterday, 11:40 AM"
  }),
  makeEvent({
    id: "e6",
    timestamp: "Today, 08:42 AM",
    sortKey: 880,
    assetName: "Extruder Gearbox GB-302",
    assetTag: "GB-302",
    source: "Automated Alarm",
    severity: "Critical",
    summary: "Severe gear mesh vibration — GMF peak 5.85 mm/s with sidebands.",
    confidence: 91,
    primaryFault: "Intermediate pinion tooth pitting",
    secondaryFault: "Oil temperature excursion",
    recommendedActions: ["Create urgent WO", "Pull oil sample for ferrography", "Reduce load if possible"],
    status: "Pending"
  }),
  makeEvent({
    id: "e7",
    timestamp: "Today, 07:10 AM",
    sortKey: 840,
    assetName: "Extruder Gearbox GB-302",
    assetTag: "GB-302",
    source: "Predictive Scan",
    severity: "Critical",
    summary: "System 91% confidence of gear tooth defect progression on HSS.",
    confidence: 91,
    primaryFault: "Gear tooth pitting",
    secondaryFault: "Lubricant degradation",
    recommendedActions: ["Inspect sight glass", "Schedule gearbox inspection"],
    status: "Acknowledged",
    acknowledgedBy: "T. Okafor",
    acknowledgedAt: "Today, 07:25 AM"
  }),
  makeEvent({
    id: "e8",
    timestamp: "Yesterday, 09:30 PM",
    sortKey: 620,
    assetName: "Extruder Gearbox GB-302",
    assetTag: "GB-302",
    source: "Automated Alarm",
    severity: "Warning",
    summary: "Oil temperature above warning (88°C sustained 12 min).",
    confidence: 68,
    primaryFault: "Thermal overload",
    secondaryFault: "Possible cooler fouling",
    recommendedActions: ["Check cooler flow", "Verify oil level"],
    status: "Acknowledged",
    acknowledgedBy: "T. Okafor",
    acknowledgedAt: "Yesterday, 09:45 PM"
  }),
  makeEvent({
    id: "e9",
    timestamp: "Today, 10:05 AM",
    sortKey: 910,
    assetName: "Drive Motor M-101A",
    assetTag: "M-101A",
    source: "Predictive Scan",
    severity: "Critical",
    summary: "System detected stator insulation stress pattern + DE bearing heat rise.",
    confidence: 82,
    primaryFault: "DE bearing lubrication issue",
    secondaryFault: "Possible soft foot",
    recommendedActions: ["Ultrasound grease", "Check soft foot", "Megger if downtime allows"],
    status: "Pending"
  }),
  makeEvent({
    id: "e10",
    timestamp: "Today, 05:55 AM",
    sortKey: 800,
    assetName: "Cooling Tower Fan 4",
    assetTag: "FN-04",
    source: "Automated Alarm",
    severity: "Warning",
    summary: "1X imbalance elevated to 3.3 mm/s after weather event.",
    confidence: 77,
    primaryFault: "Aerodynamic / mass imbalance",
    secondaryFault: "Debris on blades",
    recommendedActions: ["Inspect blade fouling", "Field balance if residual high"],
    status: "Acknowledged",
    acknowledgedBy: "R. Chen",
    acknowledgedAt: "Today, 06:20 AM"
  }),
  makeEvent({
    id: "e11",
    timestamp: "Yesterday, 02:14 PM",
    sortKey: 580,
    assetName: "Cooling Tower Fan 4",
    assetTag: "FN-04",
    source: "Manual Check",
    severity: "Info",
    summary: "Manual route — blades cleaned, residual vibration pending recheck.",
    confidence: 55,
    primaryFault: "Fouling removed",
    secondaryFault: "None",
    recommendedActions: ["Recollect vibration tomorrow"],
    status: "Resolved",
    resolvedAt: "Yesterday, 03:00 PM",
    resolutionNotes: "Washered blades; awaiting next route."
  }),
  makeEvent({
    id: "e12",
    timestamp: "Jul 28, 04:40 PM",
    sortKey: 480,
    assetName: "Screw Compressor RS37i",
    assetTag: "CMP-37",
    source: "Predictive Scan",
    severity: "Warning",
    summary: "System noted rising discharge temperature signature vs baseline.",
    confidence: 71,
    primaryFault: "Aftercooler efficiency drop",
    secondaryFault: "Filter differential rising",
    recommendedActions: ["Clean aftercooler", "Replace inlet filter"],
    status: "Resolved",
    acknowledgedBy: "S. Barrett",
    acknowledgedAt: "Jul 28, 05:00 PM",
    workOrder: "WO-8799",
    workOrderAt: "Jul 28, 05:30 PM",
    resolvedAt: "Jul 29, 11:00 AM",
    resolutionNotes: "Cleaned cooler tubes; temps returned to baseline."
  }),
  makeEvent({
    id: "e13",
    timestamp: "Jul 28, 11:22 AM",
    sortKey: 450,
    assetName: "Primary Induction Motor",
    assetTag: "M-210",
    source: "Manual Check",
    severity: "Warning",
    summary: "Manual alignment check — angular offset 0.08° beyond tolerance.",
    confidence: 66,
    primaryFault: "Misalignment",
    secondaryFault: "Coupling wear",
    recommendedActions: ["Laser realign hot", "Inspect coupling inserts"],
    status: "In Progress",
    acknowledgedBy: "R. Chen",
    acknowledgedAt: "Jul 28, 11:45 AM",
    workOrder: "WO-8801",
    workOrderAt: "Jul 28, 01:00 PM"
  }),
  makeEvent({
    id: "e14",
    timestamp: "Jul 27, 08:15 AM",
    sortKey: 400,
    assetName: "Slurry Recirc Pump P-402",
    assetTag: "P-402",
    source: "Automated Alarm",
    severity: "Critical",
    summary: "Cavitation signature — broadband high-frequency energy spike.",
    confidence: 80,
    primaryFault: "Cavitation / NPSH shortfall",
    secondaryFault: "Strainer restriction",
    recommendedActions: ["Clean suction strainer", "Verify tank level"],
    status: "Resolved",
    acknowledgedBy: "J. Whitfield",
    acknowledgedAt: "Jul 27, 08:30 AM",
    workOrder: "WO-8770",
    workOrderAt: "Jul 27, 09:00 AM",
    resolvedAt: "Jul 27, 02:15 PM",
    resolutionNotes: "Strainer cleaned; cavitation energy normalized."
  }),
  makeEvent({
    id: "e15",
    timestamp: "Jul 26, 03:50 PM",
    sortKey: 350,
    assetName: "Conveyor Gearbox 3",
    assetTag: "CV-GB-3",
    source: "Predictive Scan",
    severity: "Info",
    summary: "System baseline — healthy mesh pattern, no action required.",
    confidence: 94,
    primaryFault: "None",
    secondaryFault: "None",
    recommendedActions: ["Continue monthly route"],
    status: "Resolved",
    resolvedAt: "Jul 26, 03:55 PM",
    resolutionNotes: "Closed as informational."
  }),
  makeEvent({
    id: "e16",
    timestamp: "Jul 25, 10:12 AM",
    sortKey: 300,
    assetName: "Drive Motor M-101A",
    assetTag: "M-101A",
    source: "Automated Alarm",
    severity: "Warning",
    summary: "DE bearing temperature warning (78°C for 8 minutes).",
    confidence: 69,
    primaryFault: "Thermal rise at DE",
    secondaryFault: "Possible overgreasing or undergreasing",
    recommendedActions: ["Ultrasound-assisted greasing"],
    status: "Acknowledged",
    acknowledgedBy: "M. Delgado",
    acknowledgedAt: "Jul 25, 10:40 AM"
  }),
  makeEvent({
    id: "e17",
    timestamp: "Jul 24, 07:05 AM",
    sortKey: 250,
    assetName: "Heat Exchanger Bundle 12",
    assetTag: "HX-12",
    source: "Manual Check",
    severity: "Info",
    summary: "Manual thermography — no hot spots on shell flanges.",
    confidence: 88,
    primaryFault: "None",
    secondaryFault: "None",
    recommendedActions: ["Archive IR images"],
    status: "Resolved",
    resolvedAt: "Jul 24, 07:20 AM"
  }),
  makeEvent({
    id: "e18",
    timestamp: "Jul 23, 01:40 PM",
    sortKey: 200,
    assetName: "Screw Compressor RS37i",
    assetTag: "CMP-37",
    source: "Automated Alarm",
    severity: "Warning",
    summary: "Filter DP alarm — inlet differential above setpoint.",
    confidence: 73,
    primaryFault: "Inlet filter loading",
    secondaryFault: "None",
    recommendedActions: ["Replace filter element"],
    status: "Resolved",
    workOrder: "WO-8755",
    workOrderAt: "Jul 23, 02:10 PM",
    resolvedAt: "Jul 23, 04:00 PM",
    resolutionNotes: "Filter replaced; DP normal."
  })
];

/** Group related alerts into incidents (same asset + high severity cluster). */
function buildIncidents(events: LogEvent[]): Incident[] {
  const pumpA = events.filter((e) => e.assetTag === "P-101A").sort((a, b) => b.sortKey - a.sortKey);
  const gb302 = events.filter((e) => e.assetTag === "GB-302").sort((a, b) => b.sortKey - a.sortKey);
  const fan = events.filter((e) => e.assetTag === "FN-04").sort((a, b) => b.sortKey - a.sortKey);
  const singles = events.filter(
    (e) => !["P-101A", "GB-302", "FN-04"].includes(e.assetTag)
  );

  const incidents: Incident[] = [];

  if (pumpA.length) {
    incidents.push({
      id: "inc-402",
      number: 402,
      title: "Boiler Feed Pump A — Bearing Degradation",
      assetName: "Boiler Feed Pump A",
      assetTag: "P-101A",
      status: "In Progress",
      severity: "Critical",
      events: pumpA
    });
  }
  if (gb302.length) {
    incidents.push({
      id: "inc-418",
      number: 418,
      title: "Extruder Gearbox GB-302 — Gear Mesh Failure Path",
      assetName: "Extruder Gearbox GB-302",
      assetTag: "GB-302",
      status: "Pending",
      severity: "Critical",
      events: gb302
    });
  }
  if (fan.length) {
    incidents.push({
      id: "inc-391",
      number: 391,
      title: "Cooling Tower Fan 4 — Imbalance After Weather",
      assetName: "Cooling Tower Fan 4",
      assetTag: "FN-04",
      status: "Acknowledged",
      severity: "Warning",
      events: fan
    });
  }

  singles.forEach((e, idx) => {
    incidents.push({
      id: `inc-single-${e.id}`,
      number: 500 + idx,
      title: `${e.assetName} — ${e.primaryFault === "None" ? e.summary.slice(0, 48) : e.primaryFault}`,
      assetName: e.assetName,
      assetTag: e.assetTag,
      status: e.status,
      severity: e.severity,
      events: [e]
    });
  });

  return incidents.sort(
    (a, b) => Math.max(...b.events.map((e) => e.sortKey)) - Math.max(...a.events.map((e) => e.sortKey))
  );
}

/* ========================================================================== */
/* UI helpers                                                                 */
/* ========================================================================== */

function severityBadge(sev: Severity) {
  if (sev === "Critical") return "bg-red-500/15 text-red-300 border-red-500/40";
  if (sev === "Warning") return "bg-amber-400/15 text-amber-300 border-amber-400/40";
  return "bg-sky-500/15 text-sky-300 border-sky-500/40";
}

function statusBadge(status: LogStatus) {
  if (status === "Resolved") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
  if (status === "Acknowledged" || status === "In Progress")
    return "bg-amber-400/15 text-amber-300 border-amber-400/40";
  return "bg-slate-700/50 text-slate-300 border-slate-600";
}

function SourceIcon({ source }: { source: EventSource }) {
  if (source === "Predictive Scan") return <Bot className="h-3.5 w-3.5 text-violet-300" />;
  if (source === "Manual Check") return <Wrench className="h-3.5 w-3.5 text-sky-300" />;
  return <AlertTriangle className="h-3.5 w-3.5 text-orange-300" />;
}

function Sparkline({ data }: { data: SparkPoint[] }) {
  return (
    <div className="h-12 w-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="vib" stroke="#fbbf24" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ========================================================================== */
/* Detail panel                                                               */
/* ========================================================================== */

function DetailPanel({
  event,
  onClose,
  onSaveNotes,
  onAck,
  onCreateWo
}: {
  event: LogEvent;
  onClose: () => void;
  onSaveNotes: (notes: string) => void;
  onAck: () => void;
  onCreateWo: () => void;
}) {
  const [notes, setNotes] = useState(event.resolutionNotes);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer" onClick={onClose} aria-label="Close" />
      <aside className="relative w-full max-w-lg h-full bg-slate-900 border-l border-slate-800 shadow-2xl overflow-y-auto flex flex-col">
        <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800 p-4 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-mono text-amber-300 font-bold">{event.id.toUpperCase()}</p>
              <h3 className="text-base font-bold text-white truncate">
                {event.assetName} · {event.assetTag}
              </h3>
              <p className="text-[11px] text-slate-500">{event.timestamp}</p>
            </div>
            <button type="button" onClick={onClose} className="text-slate-500 hover:text-white cursor-pointer p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${severityBadge(event.severity)}`}>
              {event.severity}
            </span>
            <span className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${statusBadge(event.status)}`}>
              {event.status}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-700 text-[10px] font-bold text-slate-300">
              <SourceIcon source={event.source} /> {event.source}
            </span>
          </div>
        </div>

        <div className="p-4 space-y-4 flex-1">
          <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Diagnosis Details</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Diagnostic Confidence</span>
              <span className="font-mono font-bold text-amber-300">{event.confidence}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-amber-400" style={{ width: `${event.confidence}%` }} />
            </div>
            <p className="text-xs text-slate-300 pt-1">{event.summary}</p>
            <p className="text-xs text-slate-400">
              <span className="text-slate-500 font-bold">Primary: </span>
              {event.primaryFault}
            </p>
            <p className="text-xs text-slate-400">
              <span className="text-slate-500 font-bold">Secondary: </span>
              {event.secondaryFault}
            </p>
            <ul className="text-xs text-slate-300 space-y-1 pt-1">
              {event.recommendedActions.map((a) => (
                <li key={a} className="flex gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  {a}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Vibration Snapshot</p>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={event.sparkline}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="t" hide />
                  <YAxis tick={{ fill: "#64748b", fontSize: 10 }} width={28} />
                  <RechartsTooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }}
                  />
                  <Line type="monotone" dataKey="vib" stroke="#fbbf24" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Resolution Tracker</p>
            <TimelineStep label="Alert Triggered" value={event.timestamp} done />
            <TimelineStep
              label="Acknowledged by"
              value={event.acknowledgedBy ? `${event.acknowledgedBy} (${event.acknowledgedAt})` : "—"}
              done={!!event.acknowledgedBy}
            />
            <TimelineStep
              label="Work Order Created"
              value={event.workOrder ? `${event.workOrder} (${event.workOrderAt})` : "—"}
              done={!!event.workOrder}
            />
            <TimelineStep label="Resolved" value={event.resolvedAt ?? "Open"} done={!!event.resolvedAt} />
          </section>

          <section className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Resolution Notes</p>
            <textarea
              className={`${INPUT} min-h-[96px] resize-y`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How was this fixed?"
            />
            <button
              type="button"
              onClick={() => onSaveNotes(notes)}
              className="min-h-[40px] px-4 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer"
            >
              Save Notes
            </button>
          </section>
        </div>

        <div className="sticky bottom-0 border-t border-slate-800 bg-slate-900 p-3 flex flex-wrap gap-2">
          {event.status === "Pending" && (
            <button
              type="button"
              onClick={onAck}
              className="min-h-[40px] px-3 rounded-xl border border-emerald-500/40 text-emerald-300 text-xs font-bold cursor-pointer"
            >
              Acknowledge
            </button>
          )}
          {!event.workOrder && (
            <button
              type="button"
              onClick={onCreateWo}
              className="min-h-[40px] px-3 rounded-xl border border-amber-400/40 text-amber-200 text-xs font-bold cursor-pointer"
            >
              Create Work Order
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-3 rounded-xl border border-slate-700 text-slate-300 text-xs font-bold cursor-pointer ml-auto"
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}

function TimelineStep({ label, value, done }: { label: string; value: string; done?: boolean }) {
  return (
    <div className="flex gap-3 text-xs">
      <div className="flex flex-col items-center">
        <span className={`h-2.5 w-2.5 rounded-full ${done ? "bg-amber-400" : "bg-slate-600"}`} />
        <span className="flex-1 w-px bg-slate-800 min-h-[16px]" />
      </div>
      <div className="pb-2">
        <p className="text-slate-500 font-bold">{label}</p>
        <p className="text-slate-200">{value}</p>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Page                                                                       */
/* ========================================================================== */

export default function DiagnosisLogs({
  reports = [],
  onSelectReport,
  onDeleteReport,
  onStartDiagnosis
}: DiagnosisLogsProps) {
  const { toast } = useToast();
  void reports;
  void onSelectReport;
  void onDeleteReport;
  void onStartDiagnosis;

  const [events, setEvents] = useState<LogEvent[]>([]);
  const [equipTick, setEquipTick] = useState(0);
  const [search, setSearch] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [browseRoute, setBrowseRoute] = useState("");
  const [browseAssetTag, setBrowseAssetTag] = useState("");
  const [browseComponent, setBrowseComponent] = useState("");
  const [selectedEquipTag, setSelectedEquipTag] = useState<string | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | LogStatus>("All");
  const [sourceFilter, setSourceFilter] = useState<"All" | EventSource>("All");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["inc-402"]));
  const [detailId, setDetailId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dbLogs, setDbLogs] = useState<SavedDiagnosisLog[]>([]);
  const [dbLogsError, setDbLogsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchDiagnosisLogs({ limit: 100 });
        if (!cancelled) {
          setDbLogs(rows);
          setDbLogsError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setDbLogsError(err instanceof Error ? err.message : "Failed to load logs");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const flatEquipment = useMemo(() => {
    void equipTick;
    return getFlatEquipment();
  }, [equipTick]);
  const equipmentRoutes = useMemo(() => {
    void equipTick;
    return getEquipmentData();
  }, [equipTick]);

  const selectedEquip = flatEquipment.find((e) => e.tag === selectedEquipTag) ?? null;

  const searchResults = useMemo(() => {
    const q = assetSearch.trim().toLowerCase();
    if (!q) return flatEquipment;
    return flatEquipment.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.tag.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.location.toLowerCase().includes(q) ||
        a.routeName.toLowerCase().includes(q) ||
        a.hierarchyPath.toLowerCase().includes(q)
    );
  }, [assetSearch, flatEquipment]);

  const routeOptions = useMemo(() => equipmentRoutes.map((r) => r.name), [equipmentRoutes]);

  const assetOptions = useMemo(() => {
    if (!browseRoute) return [] as FlatEquipAsset[];
    return flatEquipment.filter((a) => a.routeName === browseRoute);
  }, [browseRoute, flatEquipment]);

  const componentOptions = useMemo(() => {
    if (!browseAssetTag) return [] as EquipComponent[];
    const asset = flatEquipment.find(
      (a) => a.tag === browseAssetTag && (!browseRoute || a.routeName === browseRoute)
    );
    return asset?.components ?? [];
  }, [browseRoute, browseAssetTag, flatEquipment]);

  useEffect(() => {
    if (!searchOpen) return;
    const onDown = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [searchOpen]);

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);

  const applyEquipmentSelection = (tag: string, component?: string | null) => {
    const asset = flatEquipment.find((a) => a.tag === tag);
    if (!asset) {
      toast("Asset not found in Equipment DB.", "warning");
      return;
    }
    setSelectedEquipTag(tag);
    setSelectedComponent(component ?? null);
    setBrowseRoute(asset.routeName);
    setBrowseAssetTag(asset.tag);
    setBrowseComponent(component ?? "");
    setAssetSearch("");
    setSearchOpen(false);
    toast(
      component
        ? `Showing logs for ${asset.name} · ${component}.`
        : `Showing logs for ${asset.name} (${asset.tag}).`,
      "success"
    );
  };

  const clearEquipmentSelection = () => {
    setSelectedEquipTag(null);
    setSelectedComponent(null);
    setBrowseRoute("");
    setBrowseAssetTag("");
    setBrowseComponent("");
    setAssetSearch("");
  };

  const addFromBrowse = () => {
    if (!browseRoute || !browseAssetTag || !browseComponent) {
      toast("Select Route, Asset, and Component first.", "warning");
      return;
    }
    applyEquipmentSelection(browseAssetTag, browseComponent);
  };

  const startHover = (id: string) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoverId(id), 160);
  };

  const endHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setHoverId(null);
  };

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (selectedEquipTag && e.assetTag !== selectedEquipTag) return false;
      if (statusFilter !== "All" && e.status !== statusFilter) return false;
      if (sourceFilter !== "All" && e.source !== sourceFilter) return false;
      if (datePreset === "7d" && e.sortKey < 500) return false;
      if (datePreset === "custom" && customFrom && customTo) {
        // mock: keep all when custom set for demo
      }
      if (!q) return true;
      return (
        e.assetName.toLowerCase().includes(q) ||
        e.assetTag.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.primaryFault.toLowerCase().includes(q)
      );
    });
  }, [events, search, selectedEquipTag, statusFilter, sourceFilter, datePreset, customFrom, customTo]);

  const incidents = useMemo(() => buildIncidents(filteredEvents), [filteredEvents]);

  const summary = useMemo(() => {
    const total = events.length;
    const critical = events.filter((e) => e.severity === "Critical" && e.status !== "Resolved").length;
    const bearingShare = Math.round(
      (events.filter((e) => /bearing|bpfo|race/i.test(e.summary + e.primaryFault)).length / Math.max(1, events.length)) *
        100
    );
    return {
      total: 142,
      critical: Math.max(8, critical),
      avgResolution: "4.2 hrs",
      insight: `${bearingShare}% of alerts were bearing-related this week.`
    };
  }, [events]);

  const detail = events.find((e) => e.id === detailId) ?? null;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const patchEvent = (id: string, patch: Partial<LogEvent>) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const exportCsv = () => {
    const header = "id,timestamp,asset,tag,source,severity,status,summary\n";
    const rows = filteredEvents
      .map(
        (e) =>
          `"${e.id}","${e.timestamp}","${e.assetName}","${e.assetTag}","${e.source}","${e.severity}","${e.status}","${e.summary.replace(/"/g, "'")}"`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "diagnosis-logs.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast("Diagnosis logs exported as CSV.", "success");
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white inline-flex items-center gap-2">
            <Activity className="h-5 w-5 text-amber-400" />
            Diagnosis Logs
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Automatically grouped incidents with inline context — less noise, faster decisions.
          </p>
        </div>
      </div>

      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white">Run Diagnostics History</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Saved when analyses complete · {dbLogs.length} entr
              {dbLogs.length === 1 ? "y" : "ies"}
            </p>
          </div>
        </div>
        {dbLogsError && <p className="text-xs text-amber-400">{dbLogsError}</p>}
        {dbLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-10 px-4">
            <Activity className="h-8 w-8 text-slate-600 mb-3" />
            <p className="text-sm font-semibold text-slate-300">No data available</p>
            <p className="text-xs text-slate-500 mt-1">
              No diagnosis runs saved yet. Complete a Run Diagnostics analysis to populate this list.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-3 font-bold">Status</th>
                  <th className="py-2 pr-3 font-bold">Asset</th>
                  <th className="py-2 pr-3 font-bold">Type</th>
                  <th className="py-2 pr-3 font-bold">Completed</th>
                  <th className="py-2 font-bold">Summary</th>
                </tr>
              </thead>
              <tbody>
                {dbLogs.map((log) => {
                  const summary = log.result_summary || {};
                  const primary =
                    typeof summary.primary_fault === "string"
                      ? summary.primary_fault
                      : typeof summary.summary === "string"
                        ? summary.summary
                        : "—";
                  const health =
                    summary.health_score != null ? ` · H${summary.health_score}` : "";
                  return (
                    <tr
                      key={log.id}
                      className="border-b border-slate-800/80 hover:bg-slate-950/50"
                    >
                      <td className="py-2.5 pr-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md font-bold ${
                            log.status === "success"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-red-500/15 text-red-300"
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-300 whitespace-nowrap">
                        {log.asset_id || "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-400 whitespace-nowrap">
                        {log.analysis_type || "vibration"}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-400 whitespace-nowrap">
                        {log.completed_at
                          ? new Date(log.completed_at).toLocaleString()
                          : log.started_at
                            ? new Date(log.started_at).toLocaleString()
                            : "—"}
                      </td>
                      <td className="py-2.5 text-slate-300 max-w-[280px] truncate">
                        {primary}
                        {health}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {flatEquipment.length === 0 && dbLogs.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 flex flex-col items-center justify-center text-center py-12 px-4">
          <Activity className="h-8 w-8 text-slate-600 mb-3" />
          <p className="text-sm font-semibold text-slate-300">No data available</p>
          <p className="text-xs text-slate-500 mt-1">
            Complete a Run Diagnostics analysis to populate diagnosis history.
          </p>
        </div>
      ) : null}

      {/* Mock incident timeline disabled — only DB diagnosis_logs are shown above */}
      {false && flatEquipment.length > 0 && events.length > 0 ? (
      <>
      {/* Equipment selection — Trend Analyzer pattern */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3 overflow-visible">
        <div className="space-y-2.5" ref={searchRef}>
          {/* 1. Search — full width */}
          <div className="relative w-full min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <input
              type="search"
              value={assetSearch}
              onChange={(e) => {
                setAssetSearch(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search assets by name, tag, ID, or location..."
              className="w-full min-h-[40px] pl-9 pr-3 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-200 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
            {searchOpen && (
              <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 shadow-2xl p-1.5 space-y-0.5">
                {searchResults.length === 0 ? (
                  <p className="text-xs text-slate-500 px-2 py-3">No matching assets.</p>
                ) : (
                  searchResults.map((asset) => {
                    const on = selectedEquipTag === asset.tag;
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => applyEquipmentSelection(asset.tag, asset.components[0]?.name ?? null)}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs cursor-pointer ${
                          on ? "bg-amber-400/10 text-amber-300" : "text-slate-300 hover:bg-slate-900"
                        }`}
                      >
                        <span className="flex items-start gap-2">
                          <span
                            className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                              on ? "bg-amber-400 border-amber-400 text-slate-950" : "border-slate-600"
                            }`}
                          >
                            {on && <Check className="h-3 w-3" strokeWidth={3} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-bold truncate">
                              {asset.name} · {asset.tag}
                            </span>
                            <span className="block text-[10px] text-slate-500 truncate mt-0.5">
                              {asset.hierarchyPath}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* 2. Hierarchical dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 min-w-0">
            <div className="min-w-0">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                Select Route
              </label>
              <select
                value={browseRoute}
                onChange={(e) => {
                  setBrowseRoute(e.target.value);
                  setBrowseAssetTag("");
                  setBrowseComponent("");
                }}
                className={SELECT}
              >
                <option value="">Select Route</option>
                {routeOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                Select Asset
              </label>
              <select
                value={browseAssetTag}
                onChange={(e) => {
                  setBrowseAssetTag(e.target.value);
                  setBrowseComponent("");
                }}
                disabled={!browseRoute}
                className={SELECT}
              >
                <option value="">Select Asset</option>
                {assetOptions.map((a) => (
                  <option key={a.tag} value={a.tag}>
                    {a.name} - {a.tag}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                Select Component
              </label>
              <select
                value={browseComponent}
                onChange={(e) => setBrowseComponent(e.target.value)}
                disabled={!browseAssetTag}
                className={SELECT}
              >
                <option value="">Select Component</option>
                {componentOptions.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 3. Add to selection */}
          <button
            type="button"
            onClick={addFromBrowse}
            className="min-h-[40px] px-4 rounded-xl bg-amber-400/15 border border-amber-400/40 text-amber-300 text-xs font-bold hover:bg-amber-400/25 cursor-pointer"
          >
            Add to selection
          </button>

          {selectedEquip && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
              <span className="inline-flex max-w-full items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-amber-400/40 text-amber-300 text-[11px] font-bold w-fit">
                <span className="truncate">
                  {selectedEquip.name} · {selectedEquip.tag}
                  {selectedComponent ? ` · ${selectedComponent}` : ""}
                </span>
                <button
                  type="button"
                  onClick={clearEquipmentSelection}
                  className="hover:text-white cursor-pointer shrink-0 text-amber-400/80"
                  aria-label="Clear equipment selection"
                  title="Clear selection"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
              <p className="text-xs text-slate-400">
                Showing{" "}
                <span className="font-bold text-amber-300">{filteredEvents.length}</span>{" "}
                {filteredEvents.length === 1 ? "log" : "logs"} for{" "}
                <span className="font-semibold text-white">{selectedEquip.name}</span>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <SummaryCard label="Total Diagnoses (30 Days)" value={String(summary.total)} />
        <SummaryCard label="Critical Incidents" value={String(summary.critical)} tone="red" />
        <SummaryCard label="Avg. Resolution Time" value={summary.avgResolution} tone="green" />
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200/80 inline-flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" /> Weekly Insight
          </p>
          <p className="text-sm font-bold text-amber-100 leading-snug">{summary.insight}</p>
        </div>
      </div>

      {/* Log filters */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className={`${INPUT} pl-10`}
              placeholder="Search logs by asset, tag, or keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className={`${INPUT} w-auto`}
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="custom">Custom</option>
            </select>
            {datePreset === "custom" && (
              <>
                <input type="date" className={`${INPUT} w-auto`} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                <input type="date" className={`${INPUT} w-auto`} value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </>
            )}
            <select
              className={`${INPUT} w-auto`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "All" | LogStatus)}
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Acknowledged">Acknowledged</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
            </select>
            <select
              className={`${INPUT} w-auto`}
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as "All" | EventSource)}
            >
              <option value="All">All Sources</option>
              <option value="Predictive Scan">Predictive Scan</option>
              <option value="Manual Check">Manual Check</option>
              <option value="Automated Alarm">Automated Alarm</option>
            </select>
            <button
              type="button"
              onClick={exportCsv}
              className="min-h-[40px] px-3 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" /> Export Logs (CSV)
            </button>
          </div>
        </div>
      </section>

      {/* Smart feed */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-visible">
        <div className="p-3 border-b border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-white px-1">Smart Log Feed</p>
            <p className="text-[11px] text-slate-500">
              {incidents.length} incidents · {filteredEvents.length} events
            </p>
          </div>
        </div>

        <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-800/80 rounded-b-2xl border-t border-slate-800">
          {incidents.length === 0 && (
            <p className="p-8 text-center text-sm text-slate-500">No logs match your filters.</p>
          )}

          {incidents.map((inc) => {
            const isOpen = expanded.has(inc.id);
            const multi = inc.events.length > 1;
            return (
              <div key={inc.id} className="bg-slate-900/40">
                {/* Incident header */}
                <button
                  type="button"
                  onClick={() => (multi ? toggleExpand(inc.id) : setDetailId(inc.events[0].id))}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <span className="mt-1 text-slate-500">
                    {multi ? (
                      isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4 text-slate-600" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        Incident #{inc.number}: {inc.title}
                      </span>
                      {multi && (
                        <span className="inline-flex px-2 py-0.5 rounded-md border border-violet-500/30 bg-violet-500/10 text-violet-200 text-[10px] font-bold">
                          {inc.events.length} related alerts
                        </span>
                      )}
                      <span className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${statusBadge(inc.status)}`}>
                        {inc.status}
                      </span>
                      <span className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${severityBadge(inc.severity)}`}>
                        {inc.severity}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {inc.assetTag} · Latest: {inc.events[0]?.timestamp}
                    </p>
                  </div>
                </button>

                {/* Expanded / single events */}
                {(isOpen || !multi) && (
                  <div className={`${multi ? "pl-8 pr-3 pb-3 space-y-2" : "px-3 pb-3"}`}>
                    {inc.events.map((ev) => (
                      <div
                        key={ev.id}
                        className="relative group rounded-xl border border-slate-800 bg-slate-950/50 p-3 hover:border-slate-600 transition-colors"
                        onMouseEnter={() => startHover(ev.id)}
                        onMouseLeave={endHover}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-start gap-3">
                          <div className="min-w-[140px] relative z-10">
                            <p className="text-[11px] font-mono text-slate-400 inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {ev.timestamp}
                            </p>
                            <p className="text-xs font-bold text-white mt-0.5">{ev.assetName}</p>
                            <p className="text-[10px] font-mono text-amber-300">{ev.assetTag}</p>
                            {hoverId === ev.id && (
                              <div className="mt-2 rounded-xl border border-slate-700 bg-slate-800 p-2.5 shadow-2xl min-w-[180px] max-w-[200px]">
                                <p className="text-[10px] font-bold text-white mb-1.5">Vibration context</p>
                                <Sparkline data={ev.sparkline} />
                                <p className="text-[9px] text-slate-400 mt-1 font-mono">mm/s RMS · pre-event</p>
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex flex-wrap gap-1.5 items-center">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-700 text-[10px] font-bold text-slate-300">
                                <SourceIcon source={ev.source} /> {ev.source}
                              </span>
                              <span className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${severityBadge(ev.severity)}`}>
                                {ev.severity}
                              </span>
                              <span className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${statusBadge(ev.status)}`}>
                                {ev.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed">{ev.summary}</p>
                          </div>

                          <div className="flex flex-wrap gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setDetailId(ev.id)}
                              className="min-h-[32px] px-2.5 rounded-lg border border-amber-400/40 text-amber-200 text-[10px] font-bold cursor-pointer"
                            >
                              View Full Report
                            </button>
                            {ev.status === "Pending" && (
                              <button
                                type="button"
                                onClick={() => {
                                  patchEvent(ev.id, {
                                    status: "Acknowledged",
                                    acknowledgedBy: "You",
                                    acknowledgedAt: "Just now"
                                  });
                                  toast("Event acknowledged.", "success");
                                }}
                                className="min-h-[32px] px-2.5 rounded-lg border border-emerald-500/40 text-emerald-300 text-[10px] font-bold cursor-pointer"
                              >
                                Acknowledge
                              </button>
                            )}
                            {!ev.workOrder && (
                              <button
                                type="button"
                                onClick={() => {
                                  const wo = `WO-${8800 + Math.floor(Math.random() * 90)}`;
                                  patchEvent(ev.id, {
                                    workOrder: wo,
                                    workOrderAt: "Just now",
                                    status: ev.status === "Pending" ? "In Progress" : ev.status
                                  });
                                  toast(`Work order ${wo} created.`, "success");
                                }}
                                className="min-h-[32px] px-2.5 rounded-lg border border-slate-600 text-slate-300 text-[10px] font-bold cursor-pointer"
                              >
                                Create Work Order
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {detail && (
        <DetailPanel
          event={detail}
          onClose={() => setDetailId(null)}
          onSaveNotes={(notes) => {
            patchEvent(detail.id, { resolutionNotes: notes });
            toast("Resolution notes saved.", "success");
          }}
          onAck={() => {
            patchEvent(detail.id, {
              status: "Acknowledged",
              acknowledgedBy: "You",
              acknowledgedAt: "Just now"
            });
            toast("Event acknowledged.", "success");
          }}
          onCreateWo={() => {
            const wo = `WO-${8800 + Math.floor(Math.random() * 90)}`;
            patchEvent(detail.id, {
              workOrder: wo,
              workOrderAt: "Just now",
              status: "In Progress"
            });
            toast(`Work order ${wo} created.`, "success");
          }}
        />
      )}
      </>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "red" | "green";
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
      <p
        className={`text-2xl font-bold font-mono ${
          tone === "red" ? "text-red-300" : tone === "green" ? "text-emerald-300" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
