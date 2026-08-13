import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Bell, BellOff, BellRing, Check, CheckCircle2, Clipboard, Clock, Copy,
  ExternalLink, Loader2, Lock, Microscope, Plus, Search, Settings, Shield, Sparkles,
  TrendingUp, Upload, Wand2, Webhook, X, Zap
} from "lucide-react";
import { navigateToTab } from "../navigation";
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis
} from "recharts";
import { getEquipmentData, getFlatEquipment, type EquipComponent } from "../data/equipmentDb";
import { useToast } from "./Toast";
import {
  acknowledgeAlert,
  fetchAlerts,
  type SavedAlert
} from "../lib/analysisPersistence";

/* ========================================================================== */
/* Props                                                                      */
/* ========================================================================== */

interface AlertsControlProps {
  userId?: number;
}

/* ========================================================================== */
/* Domain                                                                     */
/* ========================================================================== */

type AssetStatus = "Normal" | "Warning" | "Critical";
type AlarmKind = "Warning" | "Critical";
type AlarmStatus = "New" | "Acknowledged" | "Suppressed" | "Shelved";
type ShelveReason =
  | "Scheduled Maintenance"
  | "Known Sensor Fault"
  | "Process Startup / Ramp"
  | "False Positive / Noise";
type ShelveDurationId = "2h" | "8h" | "24h" | "custom";
type CmmsTarget =
  | "SAP PM / S4/HANA Asset Management"
  | "IBM Maximo Enterprise"
  | "MaintainX"
  | "Fiix CMMS"
  | "Infor EAM / Hexagon"
  | "Other";
type CmmsPriority =
  | "High Priority - Emergency PM"
  | "Medium Priority - Planned PM"
  | "Low Priority - Inspect Next Round";
type BatchScope = "plant" | "boiler" | "selected5";
type MachineClassId = "rigid-gt15" | "rigid-lte15" | "flex-gt15" | "flex-lte15";
type AlertsCmmsId = CmmsTarget;

interface AlertAsset {
  id: string;
  name: string;
  tag: string;
  location: string;
  currentVib: number;
  warningLimit: number;
  criticalLimit: number;
  monitoring: boolean;
  muted: boolean;
  shelvedUntil: number | null;
  shelveReason: ShelveReason | null;
  shelveNotes: string | null;
  isoVerified: boolean;
  aiRecommend: number;
  trend: { t: string; vib: number }[];
}

interface NotifyConfig {
  inApp: boolean;
  email: boolean;
  smsCritical: boolean;
  cmmsWebhook: boolean;
  recipients: string[];
  delayMinutes: number;
  autoSuppressMaintenance: boolean;
  floodGuard: boolean;
  escalationL1: number;
  escalationL2: number;
  escalationL3: number;
  cmmsTarget: CmmsTarget;
  cmmsAutoWo: boolean;
  cmmsPriority: CmmsPriority;
  cmmsTemplate: string;
  cmmsCriticalMms: number;
}

type ShelveTarget =
  | { kind: "asset"; assetId: string }
  | { kind: "alarms"; alarmIds: string[] };

type AlertsPageTab = "alarms" | "thresholds" | "escalation" | "cmms";

interface AiSuggestion {
  group: string;
  baseline: number;
  warning: number;
  critical: number;
  warningZone: string;
  criticalZone: string;
}

interface HistoryAlarm {
  id: string;
  time: string;
  assetId: string;
  assetLabel: string;
  kind: AlarmKind;
  value: number;
  limit: number;
  unit: string;
  status: AlarmStatus;
}

const ISO = {
  abMax: 2.3,
  cMax: 4.5,
  dMax: 11
};

const AI_ISO_SUGGESTION: AiSuggestion = {
  group: "Group 2 Rigid Machine (>15kW)",
  baseline: 1.2,
  warning: 2.8,
  critical: 4.5,
  warningZone: "ISO Zone C",
  criticalZone: "ISO Zone D"
};

const SHELVE_REASONS: ShelveReason[] = [
  "Scheduled Maintenance",
  "Known Sensor Fault",
  "Process Startup / Ramp",
  "False Positive / Noise"
];

const SHELVE_DURATIONS: { id: ShelveDurationId; label: string; hours: number | null }[] = [
  { id: "2h", label: "2 Hours", hours: 2 },
  { id: "8h", label: "8 Hours (Shift)", hours: 8 },
  { id: "24h", label: "24 Hours", hours: 24 },
  { id: "custom", label: "Custom Date", hours: null }
];

const CMMS_TARGETS: { id: AlertsCmmsId; label: string }[] = [
  { id: "SAP PM / S4/HANA Asset Management", label: "SAP PM / S4/HANA Asset Management" },
  { id: "IBM Maximo Enterprise", label: "IBM Maximo Enterprise" },
  { id: "MaintainX", label: "MaintainX" },
  { id: "Fiix CMMS", label: "Fiix CMMS" },
  { id: "Infor EAM / Hexagon", label: "Infor EAM / Hexagon" },
  { id: "Other", label: "Other (Custom / Legacy CMMS)" }
];

const CMMS_EXTRACTED_FIELDS = [
  "Equipment_ID",
  "Order_Type",
  "Malfunction_Desc",
  "Priority_Code",
  "Parts_Required",
  "Tech_Notes"
] as const;

const CMMS_PRIORITIES: CmmsPriority[] = [
  "High Priority - Emergency PM",
  "Medium Priority - Planned PM",
  "Low Priority - Inspect Next Round"
];

const FACILITY_ASSET_COUNT = 142;
const BOILER_FEED_IDS = new Set(["p-101a", "p-101b", "m-101a"]);
const SELECTED_FIVE_IDS = new Set(["gb-302", "m-101a", "p-101a", "fn-04", "p-402"]);

const MACHINE_CLASSES: {
  id: MachineClassId;
  label: string;
  warning: number;
  critical: number;
  group: string;
}[] = [
  { id: "rigid-gt15", label: "Rigid foundation · Motors > 15 kW (ISO Group 2)", warning: 2.8, critical: 4.5, group: "Group 2 Rigid" },
  { id: "rigid-lte15", label: "Rigid foundation · Motors ≤ 15 kW (ISO Group 1)", warning: 1.8, critical: 2.8, group: "Group 1 Rigid" },
  { id: "flex-gt15", label: "Flexible foundation · Motors > 15 kW (ISO Group 2)", warning: 4.5, critical: 7.1, group: "Group 2 Flexible" },
  { id: "flex-lte15", label: "Flexible foundation · Motors ≤ 15 kW (ISO Group 1)", warning: 2.8, critical: 4.5, group: "Group 1 Flexible" }
];

function hypothesisForAlarm(alarm: HistoryAlarm): string {
  const label = alarm.assetLabel.toLowerCase();
  if (label.includes("gear")) return "Gear mesh wear / eccentricity — 1× GMF sidebands rising with load.";
  if (label.includes("fan") || label.includes("tower")) return "Aerodynamic unbalance or blade-pass excitation on the fan assembly.";
  if (label.includes("compressor")) return "Airend bearing distress — likely outer race (BPFO) with lubrication starvation.";
  if (alarm.kind === "Critical" || alarm.value >= 4.5) {
    return "Outer race bearing fault (BPFO) — spalling likely in progress. Immediate inspection required.";
  }
  return "Early-stage rolling-element defect or lubrication starvation — 1× / BPFO precursors.";
}

function fmeaModesForAlarm(alarm: HistoryAlarm): {
  mode: string;
  code: string;
  rpn: number;
  ap: "H" | "M" | "L";
  action: string;
}[] {
  const label = alarm.assetLabel.toLowerCase();
  if (label.includes("gear")) {
    return [
      { mode: "Gear tooth pitting / scuffing", code: "GMF 1×", rpn: 168, ap: "H", action: "Oil debris + mesh inspection" },
      { mode: "Input shaft bearing spall", code: "BPFO", rpn: 120, ap: "H", action: "Ultrasound gSE survey" },
      { mode: "Soft-foot / housing distortion", code: "2× RPM", rpn: 72, ap: "M", action: "Laser alignment check" }
    ];
  }
  if (label.includes("fan") || label.includes("tower")) {
    return [
      { mode: "Fan unbalance / blade deposit", code: "1× RPM", rpn: 96, ap: "M", action: "Clean & balance rotor" },
      { mode: "Motor DE bearing wear", code: "BPFO", rpn: 112, ap: "H", action: "Regrease + trend ultrasound" },
      { mode: "Looseness in pedestal", code: "Harmonics", rpn: 80, ap: "M", action: "Torque foundation bolts" }
    ];
  }
  return [
    { mode: "Outer Race Bearing Fault", code: "BPFO", rpn: 144, ap: "H", action: "Replace NDE bearing / inspect lube" },
    { mode: "Inner race defect", code: "BPFI", rpn: 108, ap: "H", action: "Confirm with envelope spectrum" },
    { mode: "Shaft misalignment", code: "2× RPM", rpn: 90, ap: "M", action: "Laser align coupling" },
    { mode: "Lubrication starvation", code: "gSE / temp", rpn: 84, ap: "M", action: "Precision lubrication protocol" }
  ];
}

function formatRemaining(until: number, now: number): string {
  const ms = Math.max(0, until - now);
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m left`;
  return `${h}h ${m}m left`;
}

function resolveShelveUntil(duration: ShelveDurationId, customDate: string): number {
  if (duration === "custom" && customDate) {
    const ts = new Date(customDate).getTime();
    if (!Number.isNaN(ts) && ts > Date.now()) return ts;
  }
  const hours = SHELVE_DURATIONS.find((d) => d.id === duration)?.hours ?? 8;
  return Date.now() + hours * 60 * 60 * 1000;
}

const INPUT =
  "w-full min-h-[36px] bg-[#0A0E1A] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#FFC700]/70";

const SELECT =
  "w-full min-h-[40px] px-3 rounded-xl bg-[#0A0E1A] border border-slate-700 text-xs text-slate-200 truncate disabled:opacity-50 focus:outline-none focus:border-[#FFC700]/70";

function statusFromVib(vib: number, warn: number, crit: number): AssetStatus {
  if (vib >= crit) return "Critical";
  if (vib >= warn) return "Warning";
  return "Normal";
}

function statusBadge(status: AssetStatus) {
  if (status === "Critical") return "bg-red-500/15 text-red-300 border-red-500/40";
  if (status === "Warning") return "bg-amber-400/15 text-amber-300 border-amber-400/40";
  return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
}

function makeTrend(seed: number, base: number): { t: string; vib: number }[] {
  return Array.from({ length: 30 }, (_, i) => {
    const wave = Math.sin((i + seed) / 4) * 0.35;
    const drift = (i / 30) * (base > 3 ? 0.8 : 0.2);
    const noise = ((seed * 17 + i * 13) % 10) / 40;
    return {
      t: `D${i + 1}`,
      vib: Math.max(0.4, +(base * 0.55 + wave + drift + noise).toFixed(2))
    };
  });
}

const INITIAL_ASSETS: AlertAsset[] = [
  {
    id: "p-101a",
    name: "Boiler Feed Pump A",
    tag: "P-101A",
    location: "Powerhouse — Floor 1",
    currentVib: 3.45,
    warningLimit: 2.8,
    criticalLimit: 4.5,
    monitoring: true,
    muted: false,
    shelvedUntil: null,
    shelveReason: null,
    shelveNotes: null,
    isoVerified: false,
    aiRecommend: 2.8,
    trend: makeTrend(1, 3.2)
  },
  {
    id: "p-101b",
    name: "Boiler Feed Pump B",
    tag: "P-101B",
    location: "Powerhouse — Floor 1",
    currentVib: 1.9,
    warningLimit: 2.8,
    criticalLimit: 4.5,
    monitoring: true,
    muted: false,
    shelvedUntil: null,
    shelveReason: null,
    shelveNotes: null,
    isoVerified: false,
    aiRecommend: 2.6,
    trend: makeTrend(2, 1.8)
  },
  {
    id: "m-101a",
    name: "Drive Motor M-101A",
    tag: "M-101A",
    location: "Powerhouse — Floor 1",
    currentVib: 4.9,
    warningLimit: 2.8,
    criticalLimit: 4.5,
    monitoring: true,
    muted: false,
    shelvedUntil: null,
    shelveReason: null,
    shelveNotes: null,
    isoVerified: false,
    aiRecommend: 2.5,
    trend: makeTrend(3, 4.2)
  },
  {
    id: "fn-04",
    name: "Cooling Tower Fan 4",
    tag: "FN-04",
    location: "Roof Deck",
    currentVib: 3.1,
    warningLimit: 3.2,
    criticalLimit: 5.0,
    monitoring: true,
    muted: false,
    shelvedUntil: null,
    shelveReason: null,
    shelveNotes: null,
    isoVerified: false,
    aiRecommend: 3.0,
    trend: makeTrend(4, 2.9)
  },
  {
    id: "cmp-37",
    name: "Screw Compressor RS37i",
    tag: "CMP-37",
    location: "Utility Pad",
    currentVib: 2.2,
    warningLimit: 3.0,
    criticalLimit: 4.8,
    monitoring: true,
    muted: true,
    shelvedUntil: Date.now() + Math.round(6.5 * 60 * 60 * 1000),
    shelveReason: "Scheduled Maintenance",
    shelveNotes: "Bearing re-greasing in progress by Team B",
    isoVerified: false,
    aiRecommend: 2.9,
    trend: makeTrend(5, 2.1)
  },
  {
    id: "gb-302",
    name: "Extruder Gearbox GB-302",
    tag: "GB-302",
    location: "Polymer Line 3",
    currentVib: 5.85,
    warningLimit: 3.0,
    criticalLimit: 4.8,
    monitoring: true,
    muted: false,
    shelvedUntil: null,
    shelveReason: null,
    shelveNotes: null,
    isoVerified: false,
    aiRecommend: 2.9,
    trend: makeTrend(6, 4.8)
  },
  {
    id: "p-402",
    name: "Slurry Recirc Pump P-402",
    tag: "P-402",
    location: "Chemical Unit 4",
    currentVib: 2.6,
    warningLimit: 2.8,
    criticalLimit: 4.5,
    monitoring: false,
    muted: false,
    shelvedUntil: null,
    shelveReason: null,
    shelveNotes: null,
    isoVerified: false,
    aiRecommend: 2.7,
    trend: makeTrend(7, 2.4)
  },
  {
    id: "cv-gb3",
    name: "Conveyor Gearbox 3",
    tag: "CV-GB-3",
    location: "Conveyor Gallery",
    currentVib: 1.4,
    warningLimit: 2.8,
    criticalLimit: 4.5,
    monitoring: true,
    muted: false,
    shelvedUntil: null,
    shelveReason: null,
    shelveNotes: null,
    isoVerified: false,
    aiRecommend: 2.5,
    trend: makeTrend(8, 1.3)
  },
  {
    id: "m-210",
    name: "Primary Induction Motor",
    tag: "M-210",
    location: "Drive Hall",
    currentVib: 3.6,
    warningLimit: 2.8,
    criticalLimit: 4.5,
    monitoring: true,
    muted: false,
    shelvedUntil: null,
    shelveReason: null,
    shelveNotes: null,
    isoVerified: false,
    aiRecommend: 2.8,
    trend: makeTrend(9, 3.3)
  },
  {
    id: "hx-12",
    name: "Heat Exchanger Bundle 12",
    tag: "HX-12",
    location: "Process Area B",
    currentVib: 0.9,
    warningLimit: 2.5,
    criticalLimit: 4.0,
    monitoring: true,
    muted: false,
    shelvedUntil: null,
    shelveReason: null,
    shelveNotes: null,
    isoVerified: false,
    aiRecommend: 2.4,
    trend: makeTrend(10, 0.85)
  }
];

const DEFAULT_NOTIFY: NotifyConfig = {
  inApp: true,
  email: true,
  smsCritical: false,
  cmmsWebhook: false,
  recipients: ["reliability@plant.com", "oncall@motormedic.pro"],
  delayMinutes: 5,
  autoSuppressMaintenance: true,
  floodGuard: true,
  escalationL1: 0,
  escalationL2: 15,
  escalationL3: 45,
  cmmsTarget: "SAP PM / S4/HANA Asset Management",
  cmmsAutoWo: true,
  cmmsPriority: "High Priority - Emergency PM",
  cmmsTemplate:
    "AUTOMATED ALARM: ISO 20816 Threshold Exceeded on {Asset_Name}. Immediate bearing vibration inspection required.",
  cmmsCriticalMms: 4.5
};

const INITIAL_HISTORY: HistoryAlarm[] = [
  { id: "a1", time: "Today 08:42", assetId: "gb-302", assetLabel: "GB-302 Extruder Gearbox", kind: "Critical", value: 5.85, limit: 4.8, unit: "mm/s", status: "New" },
  { id: "a2", time: "Today 08:08", assetId: "p-101a", assetLabel: "P-101A Boiler Feed Pump A", kind: "Warning", value: 3.45, limit: 2.8, unit: "mm/s", status: "New" },
  { id: "a3", time: "Today 07:55", assetId: "m-101a", assetLabel: "M-101A Drive Motor", kind: "Critical", value: 4.9, limit: 4.5, unit: "mm/s", status: "New" },
  { id: "a4", time: "Today 06:40", assetId: "m-210", assetLabel: "M-210 Induction Motor", kind: "Warning", value: 3.6, limit: 2.8, unit: "mm/s", status: "Acknowledged" },
  { id: "a5", time: "Today 05:12", assetId: "fn-04", assetLabel: "FN-04 Cooling Tower Fan", kind: "Warning", value: 3.3, limit: 3.2, unit: "mm/s", status: "Acknowledged" },
  { id: "a6", time: "Yesterday 22:18", assetId: "cmp-37", assetLabel: "CMP-37 Screw Compressor", kind: "Warning", value: 3.1, limit: 3.0, unit: "mm/s", status: "Shelved" },
  { id: "a7", time: "Yesterday 19:05", assetId: "p-402", assetLabel: "P-402 Slurry Recirc", kind: "Critical", value: 4.7, limit: 4.5, unit: "mm/s", status: "Acknowledged" },
  { id: "a8", time: "Yesterday 16:44", assetId: "gb-302", assetLabel: "GB-302 Extruder Gearbox", kind: "Warning", value: 3.4, limit: 3.0, unit: "mm/s", status: "Acknowledged" },
  { id: "a9", time: "Yesterday 14:20", assetId: "p-101b", assetLabel: "P-101B Boiler Feed Pump B", kind: "Warning", value: 2.9, limit: 2.8, unit: "mm/s", status: "Acknowledged" },
  { id: "a10", time: "Yesterday 11:02", assetId: "m-101a", assetLabel: "M-101A Drive Motor", kind: "Warning", value: 3.1, limit: 2.8, unit: "mm/s", status: "Acknowledged" },
  { id: "a11", time: "Jul 28 23:40", assetId: "fn-04", assetLabel: "FN-04 Cooling Tower Fan", kind: "Critical", value: 5.2, limit: 5.0, unit: "mm/s", status: "Acknowledged" },
  { id: "a12", time: "Jul 28 18:15", assetId: "cv-gb3", assetLabel: "CV-GB-3 Conveyor Gearbox", kind: "Warning", value: 2.95, limit: 2.8, unit: "mm/s", status: "Suppressed" },
  { id: "a13", time: "Jul 28 12:08", assetId: "p-101a", assetLabel: "P-101A Boiler Feed Pump A", kind: "Warning", value: 3.1, limit: 2.8, unit: "mm/s", status: "Acknowledged" },
  { id: "a14", time: "Jul 28 09:33", assetId: "m-210", assetLabel: "M-210 Induction Motor", kind: "Critical", value: 4.8, limit: 4.5, unit: "mm/s", status: "Acknowledged" },
  { id: "a15", time: "Jul 27 21:50", assetId: "gb-302", assetLabel: "GB-302 Extruder Gearbox", kind: "Warning", value: 3.2, limit: 3.0, unit: "mm/s", status: "Acknowledged" },
  { id: "a16", time: "Jul 27 15:22", assetId: "cmp-37", assetLabel: "CMP-37 Screw Compressor", kind: "Warning", value: 3.4, limit: 3.0, unit: "mm/s", status: "Acknowledged" },
  { id: "a17", time: "Jul 27 10:05", assetId: "p-402", assetLabel: "P-402 Slurry Recirc", kind: "Warning", value: 3.0, limit: 2.8, unit: "mm/s", status: "Acknowledged" },
  { id: "a18", time: "Jul 26 20:41", assetId: "fn-04", assetLabel: "FN-04 Cooling Tower Fan", kind: "Warning", value: 3.5, limit: 3.2, unit: "mm/s", status: "Acknowledged" },
  { id: "a19", time: "Jul 26 08:12", assetId: "p-101a", assetLabel: "P-101A Boiler Feed Pump A", kind: "Critical", value: 4.6, limit: 4.5, unit: "mm/s", status: "Acknowledged" },
  { id: "a20", time: "Jul 25 16:30", assetId: "m-101a", assetLabel: "M-101A Drive Motor", kind: "Warning", value: 2.95, limit: 2.8, unit: "mm/s", status: "Suppressed" }
];

/* ========================================================================== */
/* UI helpers                                                                 */
/* ========================================================================== */

function SummaryCard({
  label,
  value,
  tone,
  icon: Icon,
  pulse
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "green" | "slate";
  icon: typeof Bell;
  pulse?: boolean;
}) {
  const tones = {
    red: "border-red-500/40 bg-red-500/10",
    amber: "border-amber-400/40 bg-amber-400/10",
    green: "border-emerald-500/40 bg-emerald-500/10",
    slate: "border-slate-600 bg-slate-800/60"
  };
  const text = {
    red: "text-red-300",
    amber: "text-amber-300",
    green: "text-emerald-300",
    slate: "text-slate-300"
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
        <Icon className={`h-4 w-4 ${text[tone]}`} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        {pulse && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
        )}
        <p className={`text-3xl font-bold font-mono ${text[tone]}`}>{value}</p>
      </div>
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-full transition-colors cursor-pointer ${
        on ? "bg-[#FFC700]" : "bg-slate-700"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-slate-950 transition-transform ${
          on ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

/* ========================================================================== */
/* ISA 18.2 Shelving Modal                                                    */
/* ========================================================================== */

function ShelveModal({
  titleHint,
  onCancel,
  onConfirm
}: {
  titleHint?: string;
  onCancel: () => void;
  onConfirm: (payload: { reason: ShelveReason; until: number; notes: string }) => void;
}) {
  const [reason, setReason] = useState<ShelveReason>("Scheduled Maintenance");
  const [duration, setDuration] = useState<ShelveDurationId>("8h");
  const [customDate, setCustomDate] = useState("");
  const [notes, setNotes] = useState("Bearing re-greasing in progress by Team B");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shelve-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-[#0A0E1A] shadow-2xl overflow-hidden"
      >
        <div className="p-4 border-b border-slate-800 flex items-start justify-between gap-3">
          <div>
            <h3 id="shelve-modal-title" className="text-base font-bold text-white inline-flex items-center gap-2">
              <Shield className="h-4 w-4 text-cyan-300" />
              ISA 18.2 Alarm Shelving Request
            </h3>
            {titleHint && <p className="text-xs text-slate-400 mt-1">{titleHint}</p>}
          </div>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer" aria-label="Cancel shelving">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Required Reason</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SHELVE_REASONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setReason(item)}
                  className={`min-h-[40px] px-3 py-2 rounded-xl border text-left text-xs font-semibold cursor-pointer ${
                    reason === item
                      ? "border-cyan-400 bg-cyan-400/10 text-cyan-200"
                      : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Duration</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SHELVE_DURATIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDuration(item.id)}
                  className={`min-h-[40px] px-2 py-2 rounded-xl border text-center text-[11px] font-bold cursor-pointer ${
                    duration === item.id
                      ? "border-[#FFC700] bg-[#FFC700]/10 text-[#FFC700]"
                      : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {duration === "custom" && (
              <input
                type="datetime-local"
                className={`${INPUT} mt-2`}
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
              />
            )}
          </div>

          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Operator Notes</span>
            <textarea
              rows={3}
              className={`${INPUT} min-h-[84px] resize-y`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Bearing re-greasing in progress by Team B"
            />
          </label>
        </div>

        <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[42px] px-4 rounded-xl border border-slate-700 text-sm font-bold text-slate-200 hover:border-slate-500 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm({
                reason,
                until: resolveShelveUntil(duration, customDate),
                notes: notes.trim()
              })
            }
            className="min-h-[42px] px-4 rounded-xl bg-cyan-400 text-slate-950 text-sm font-bold cursor-pointer inline-flex items-center justify-center gap-1.5"
          >
            <Shield className="h-4 w-4" />
            Confirm Shelve
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* AI Batch Threshold Generator                                               */
/* ========================================================================== */

function BatchThresholdModal({
  onCancel,
  onApply
}: {
  onCancel: () => void;
  onApply: (scope: BatchScope, machineClass: MachineClassId) => void;
}) {
  const [scope, setScope] = useState<BatchScope>("plant");
  const [machineClass, setMachineClass] = useState<MachineClassId>("rigid-gt15");
  const klass = MACHINE_CLASSES.find((c) => c.id === machineClass) ?? MACHINE_CLASSES[0];
  const applyCount =
    scope === "plant" ? FACILITY_ASSET_COUNT : scope === "boiler" ? BOILER_FEED_IDS.size : SELECTED_FIVE_IDS.size;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-iso-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl border border-slate-700 bg-[#0A0E1A] shadow-2xl overflow-hidden"
      >
        <div className="p-4 border-b border-slate-800 flex items-start justify-between gap-3">
          <div>
            <h3 id="batch-iso-title" className="text-base font-bold text-white inline-flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-[#FFC700]" />
              AI ISO 20816 Facility Threshold Generator
            </h3>
            <p className="text-xs text-slate-400 mt-1">Bulk-apply class-correct ISO limits across routes without editing row-by-row.</p>
          </div>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Target Scope</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  { id: "plant" as const, label: "Entire Plant", hint: `${FACILITY_ASSET_COUNT} assets` },
                  { id: "boiler" as const, label: "Boiler Feed Route", hint: `${BOILER_FEED_IDS.size} assets` },
                  { id: "selected5" as const, label: "Selected 5 Assets", hint: "Critical watchlist" }
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScope(item.id)}
                  className={`min-h-[56px] px-3 py-2 rounded-xl border text-left cursor-pointer ${
                    scope === item.id
                      ? "border-[#FFC700] bg-[#FFC700]/10 text-[#FFC700]"
                      : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <span className="block text-xs font-bold">{item.label}</span>
                  <span className="block text-[10px] text-slate-500 mt-0.5">{item.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Machine Class Filter</span>
            <select className={SELECT} value={machineClass} onChange={(e) => setMachineClass(e.target.value as MachineClassId)}>
              {MACHINE_CLASSES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 pt-1">
              Applies Warn {klass.warning.toFixed(1)} / Crit {klass.critical.toFixed(1)} mm/s · {klass.group} · ISO 20816-3
            </p>
          </label>
        </div>

        <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[42px] px-4 rounded-xl border border-slate-700 text-sm font-bold text-slate-200 hover:border-slate-500 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApply(scope, machineClass)}
            className="min-h-[42px] px-4 rounded-xl bg-[#FFC700] text-slate-950 text-sm font-bold cursor-pointer inline-flex items-center justify-center gap-1.5"
          >
            <Zap className="h-4 w-4" />
            Apply ISO Standard Limits to {applyCount} Assets
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* RCA launch modal                                                           */
/* ========================================================================== */

function RcaLaunchModal({
  alarm,
  onClose
}: {
  alarm: HistoryAlarm;
  onClose: () => void;
}) {
  const hypothesis = hypothesisForAlarm(alarm);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rca-launch-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-[#0A0E1A] shadow-2xl overflow-hidden"
      >
        <div className="p-4 border-b border-slate-800 flex items-start justify-between gap-3">
          <div>
            <h3 id="rca-launch-title" className="text-base font-bold text-white inline-flex items-center gap-2">
              <Microscope className="h-4 w-4 text-[#FFC700]" />
              Launch Root Cause Analysis
            </h3>
            <p className="text-xs text-slate-400 mt-1">Case pre-filled from alarm telemetry — ready for PROACT / 5-Whys.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Asset ID</p>
              <p className="font-mono text-cyan-300 mt-1">{alarm.assetId.toUpperCase()}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Timestamp</p>
              <p className="font-mono text-slate-200 mt-1">{alarm.time}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 col-span-2">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Alarm</p>
              <p className="text-slate-200 mt-1">
                {alarm.assetLabel} · {alarm.kind} · {alarm.value} {alarm.unit} (limit {alarm.limit})
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-[#FFC700]/30 bg-[#FFC700]/5 p-3">
            <p className="text-[10px] uppercase tracking-widest text-[#FFC700] font-bold">Failure mode hypothesis</p>
            <p className="text-xs text-slate-200 mt-1.5 leading-relaxed">{hypothesis}</p>
          </div>
        </div>
        <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 rounded-xl border border-slate-700 text-sm font-bold text-slate-200 cursor-pointer"
          >
            Stay on Alerts
          </button>
          <button
            type="button"
            onClick={() => {
              navigateToTab("rca", {
                asset: alarm.assetLabel,
                assetId: alarm.assetId,
                time: alarm.time,
                hypothesis
              });
            }}
            className="min-h-[42px] px-4 rounded-xl bg-[#FFC700] text-slate-950 text-sm font-bold cursor-pointer inline-flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="h-4 w-4" />
            Open Full RCA Workspace
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Visual Threshold Editor                                                    */
/* ========================================================================== */

function ThresholdEditor({
  asset,
  onChangeAsset,
  onClose,
  dragMode,
  setDragMode
}: {
  asset: AlertAsset;
  onChangeAsset: (patch: Partial<AlertAsset>) => void;
  onClose: () => void;
  dragMode: "warning" | "critical" | null;
  setDragMode: (m: "warning" | "critical" | null) => void;
}) {
  const { toast } = useToast();
  const chartRef = useRef<HTMLDivElement | null>(null);
  const yMax = Math.max(ISO.dMax, asset.criticalLimit + 1.5, asset.currentVib + 1);
  const [showAiCard, setShowAiCard] = useState(false);

  const applyYFromPointer = (clientY: number, target: "warning" | "critical") => {
    const el = chartRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = 1 - (clientY - rect.top) / rect.height;
    const value = Math.max(0.5, Math.min(yMax, +(ratio * yMax).toFixed(1)));
    if (target === "warning") {
      onChangeAsset({
        warningLimit: Math.min(value, asset.criticalLimit - 0.2)
      });
    } else {
      onChangeAsset({
        criticalLimit: Math.max(value, asset.warningLimit + 0.2)
      });
    }
  };

  return (
    <aside className="bg-[#0A0E1A] border border-slate-800 rounded-2xl p-4 space-y-4 h-full flex flex-col min-h-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Visual Threshold Editor</p>
          <h3 className="text-sm font-bold text-white truncate mt-0.5">
            {asset.name} · {asset.tag}
          </h3>
          <p className="text-[11px] text-slate-500">{asset.location}</p>
        </div>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-white cursor-pointer p-1">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            30-day vibration velocity · mm/s RMS · ISO 20816
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setDragMode(dragMode === "warning" ? null : "warning")}
              className={`min-h-[30px] px-2 rounded-lg text-[10px] font-bold border cursor-pointer ${
                dragMode === "warning"
                  ? "bg-amber-400 text-slate-950 border-amber-400"
                  : "border-amber-400/40 text-amber-300"
              }`}
            >
              Drag Warning
            </button>
            <button
              type="button"
              onClick={() => setDragMode(dragMode === "critical" ? null : "critical")}
              className={`min-h-[30px] px-2 rounded-lg text-[10px] font-bold border cursor-pointer ${
                dragMode === "critical"
                  ? "bg-red-500 text-white border-red-500"
                  : "border-red-500/40 text-red-300"
              }`}
            >
              Drag Critical
            </button>
          </div>
        </div>
        <div
          ref={chartRef}
          className={`h-52 w-full ${dragMode ? "cursor-ns-resize" : ""}`}
          onMouseMove={(e) => {
            if (!dragMode || e.buttons !== 1) return;
            applyYFromPointer(e.clientY, dragMode);
          }}
          onClick={(e) => {
            if (!dragMode) return;
            applyYFromPointer(e.clientY, dragMode);
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={asset.trend} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={{ fill: "#64748b", fontSize: 9 }} interval={4} />
              <YAxis
                domain={[0, yMax]}
                tick={{ fill: "#64748b", fontSize: 9 }}
                label={{ value: "mm/s", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 9 }}
              />
              <RechartsTooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }}
              />
              <ReferenceArea y1={0} y2={ISO.abMax} shape={(props: any) => <rect x={props.x} y={props.y} width={props.width} height={props.height} fill="#10b981" fillOpacity={0.16} />} />
              <ReferenceArea y1={ISO.abMax} y2={ISO.cMax} shape={(props: any) => <rect x={props.x} y={props.y} width={props.width} height={props.height} fill="#f59e0b" fillOpacity={0.16} />} />
              <ReferenceArea y1={ISO.cMax} y2={yMax} shape={(props: any) => <rect x={props.x} y={props.y} width={props.width} height={props.height} fill="#ef4444" fillOpacity={0.18} />} />
              <ReferenceLine
                y={asset.warningLimit}
                stroke="#FFC700"
                strokeDasharray="7 4"
                strokeWidth={2.5}
                label={{ value: `WARN ${asset.warningLimit}`, fill: "#FFC700", fontSize: 10, position: "insideTopRight" }}
              />
              <ReferenceLine
                y={asset.criticalLimit}
                stroke="#ef4444"
                strokeDasharray="7 4"
                strokeWidth={2.5}
                label={{ value: `CRIT ${asset.criticalLimit}`, fill: "#f87171", fontSize: 10, position: "insideTopRight" }}
              />
              <Area type="monotone" dataKey="vib" fill="#38bdf8" fillOpacity={0.15} stroke="none" />
              <Line type="monotone" dataKey="vib" stroke="#38bdf8" strokeWidth={2.25} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-1 text-[10px] text-slate-400">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500" /> Zone A/B</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-amber-500" /> Zone C</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-red-500" /> Zone D</span>
        </div>
        <p className="text-[10px] text-slate-500 px-1">
          {dragMode
            ? `Click the chart to set the ${dragMode} threshold in real time.`
            : "Enable Drag Warning / Drag Critical, then click the chart to adjust."}
        </p>
      </div>

      {/* Limit inputs + suggest */}
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[10px] font-bold text-[#FFC700] uppercase tracking-widest flex items-center justify-between">
            Warning Limit
            <span className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowAiCard((open) => !open);
                  toast(
                    `AI Calculation: ${AI_ISO_SUGGESTION.group}. Baseline: ${AI_ISO_SUGGESTION.baseline} mm/s. Recommended Warning: ${AI_ISO_SUGGESTION.warning} mm/s (${AI_ISO_SUGGESTION.warningZone}), Critical: ${AI_ISO_SUGGESTION.critical} mm/s (${AI_ISO_SUGGESTION.criticalZone}).`,
                    "info"
                  );
                }}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#FFC700]/15 border border-[#FFC700]/40 text-[#FFC700] text-[9px] font-bold cursor-pointer"
              >
                <Sparkles className="h-3 w-3" /> Suggest
              </button>
              {showAiCard && (
                <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-xl border border-[#FFC700]/30 bg-[#0A0E1A] p-3 text-left shadow-2xl normal-case tracking-normal font-normal">
                  <p className="text-[10px] font-bold text-[#FFC700] uppercase tracking-widest mb-1.5">AI Calculation</p>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {AI_ISO_SUGGESTION.group}. Baseline: {AI_ISO_SUGGESTION.baseline} mm/s. Recommended Warning: {AI_ISO_SUGGESTION.warning} mm/s ({AI_ISO_SUGGESTION.warningZone}), Critical: {AI_ISO_SUGGESTION.critical} mm/s ({AI_ISO_SUGGESTION.criticalZone}).
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeAsset({
                        warningLimit: AI_ISO_SUGGESTION.warning,
                        criticalLimit: AI_ISO_SUGGESTION.critical,
                        aiRecommend: AI_ISO_SUGGESTION.warning,
                        isoVerified: true
                      });
                      setShowAiCard(false);
                      toast("Applied AI ISO 20816-3 recommendation.", "success");
                    }}
                    className="mt-2 w-full min-h-[32px] rounded-lg bg-[#FFC700] text-slate-950 text-[11px] font-bold cursor-pointer"
                  >
                    Apply AI Recommendation
                  </button>
                </div>
              )}
            </span>
          </span>
          <input
            type="number"
            step={0.1}
            min={0.5}
            className={INPUT}
            value={asset.warningLimit}
            onChange={(e) =>
              onChangeAsset({ warningLimit: Math.min(Number(e.target.value) || 0, asset.criticalLimit - 0.1) })
            }
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold text-red-300 uppercase tracking-widest">Critical Limit</span>
          <input
            type="number"
            step={0.1}
            min={0.5}
            className={INPUT}
            value={asset.criticalLimit}
            onChange={(e) =>
              onChangeAsset({ criticalLimit: Math.max(Number(e.target.value) || 0, asset.warningLimit + 0.1) })
            }
          />
        </label>
      </div>
    </aside>
  );
}

/* ========================================================================== */
/* Routing & Escalation Panel                                                 */
/* ========================================================================== */

function EscalationSettingsPanel({
  asset,
  notify,
  onChangeNotify,
  onRequestShelve,
  onUnshelve,
  now
}: {
  asset: AlertAsset;
  notify: NotifyConfig;
  onChangeNotify: (patch: Partial<NotifyConfig>) => void;
  onRequestShelve: () => void;
  onUnshelve: () => void;
  now: number;
}) {
  const [newRecipient, setNewRecipient] = useState("");
  const [isEscalationEnabled, setIsEscalationEnabled] = useState(true);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-[#0A0E1A] p-3 sm:p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Editing notifications for</p>
        <p className="text-sm font-bold text-white mt-1">
          {asset.name} · <span className="font-mono text-[#FFC700]">{asset.tag}</span>
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-[#0A0E1A] p-4 space-y-2.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Notification Recipient Matrix</p>
        <label className="flex items-center justify-between gap-2 text-xs text-slate-300 cursor-pointer">
          <span>In-App Dashboard Alert</span>
          <Toggle on={notify.inApp} onChange={(v) => onChangeNotify({ inApp: v })} label="In-app" />
        </label>
        <div className="space-y-2">
          <label className="flex items-center justify-between gap-2 text-xs text-slate-300 cursor-pointer">
            <span>Email Notification</span>
            <Toggle on={notify.email} onChange={(v) => onChangeNotify({ email: v })} label="Email" />
          </label>
          {notify.email && (
            <div className="pl-0.5 space-y-2">
              <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                {notify.recipients.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-[#FFC700]/30 bg-[#FFC700]/10 text-[10px] font-mono text-[#FFC700]"
                  >
                    {r}
                    <button
                      type="button"
                      className="text-[#FFC700]/70 hover:text-red-300 cursor-pointer"
                      onClick={() => onChangeNotify({ recipients: notify.recipients.filter((x) => x !== r) })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className={INPUT}
                  placeholder="reliability@plant.com"
                  value={newRecipient}
                  onChange={(e) => setNewRecipient(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (!newRecipient.trim()) return;
                    onChangeNotify({ recipients: [...notify.recipients, newRecipient.trim()] });
                    setNewRecipient("");
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newRecipient.trim()) return;
                    onChangeNotify({ recipients: [...notify.recipients, newRecipient.trim()] });
                    setNewRecipient("");
                  }}
                  className="min-h-[36px] px-3 rounded-lg bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-200 cursor-pointer inline-flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
            </div>
          )}
        </div>
        <label className="flex items-center justify-between gap-2 text-xs text-slate-300 cursor-pointer">
          <span>SMS / WhatsApp Alert for Critical Alarms</span>
          <Toggle on={notify.smsCritical} onChange={(v) => onChangeNotify({ smsCritical: v })} label="SMS / WhatsApp" />
        </label>
        <label className="flex items-center justify-between gap-2 text-xs text-slate-300 cursor-pointer">
          <span className="inline-flex items-center gap-1.5">
            <Webhook className="h-3.5 w-3.5 text-slate-500" />
            CMMS Webhook Trigger (Auto-Create Work Order)
          </span>
          <Toggle on={notify.cmmsWebhook} onChange={(v) => onChangeNotify({ cmmsWebhook: v })} label="CMMS webhook" />
        </label>
      </div>

      <div
        className={`rounded-2xl border bg-[#0A0E1A] p-4 space-y-3 transition-colors ${
          isEscalationEnabled ? "border-[#FFC700]/35" : "border-slate-800"
        }`}
      >
        <div className="flex justify-between items-center mb-4 gap-3">
          <div className="min-w-0 flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Notification Escalation Engine
            </p>
            <span
              className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${
                isEscalationEnabled
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-700 bg-slate-900 text-slate-500"
              }`}
            >
              {isEscalationEnabled ? "🟢 Escalation Active" : "⚪ Escalation Disabled"}
            </span>
          </div>
          <Toggle
            on={isEscalationEnabled}
            onChange={setIsEscalationEnabled}
            label="Enable escalation engine"
          />
        </div>

        <div
          className={`space-y-3 transition-opacity ${
            isEscalationEnabled ? "opacity-100" : "opacity-40 pointer-events-none"
          }`}
          aria-disabled={!isEscalationEnabled}
        >
          <label className="block space-y-1">
            <span className="text-[11px] text-slate-300 font-semibold">
              Level 1 ({notify.escalationL1} min delay): Push notification to Shift Technician
            </span>
            <input
              type="range"
              min={0}
              max={10}
              value={notify.escalationL1}
              onChange={(e) => onChangeNotify({ escalationL1: Number(e.target.value) })}
              className="w-full accent-[#FFC700]"
              tabIndex={isEscalationEnabled ? 0 : -1}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-slate-300 font-semibold">
              Level 2 (Unacknowledged after {notify.escalationL2} min): Send SMS &amp; Email to Reliability Lead
            </span>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={notify.escalationL2}
              onChange={(e) => onChangeNotify({ escalationL2: Number(e.target.value) })}
              className="w-full accent-amber-400"
              tabIndex={isEscalationEnabled ? 0 : -1}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-slate-300 font-semibold">
              Level 3 (Unacknowledged after {notify.escalationL3} min): Trigger CMMS Emergency Work Order &amp; Notify Plant Manager
            </span>
            <input
              type="range"
              min={15}
              max={120}
              step={5}
              value={notify.escalationL3}
              onChange={(e) => onChangeNotify({ escalationL3: Number(e.target.value) })}
              className="w-full accent-red-500"
              tabIndex={isEscalationEnabled ? 0 : -1}
            />
          </label>
        </div>

        <div className="min-h-[44px]">
          {!isEscalationEnabled && (
            <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200 leading-relaxed">
              💡 Escalation disabled. Notifications will only send to immediate primary recipients without tiered follow-ups.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-[#0A0E1A] p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 inline-flex items-center gap-1">
          <Settings className="h-3.5 w-3.5" /> ISA 18.2 Alarm Flood Protection &amp; Advanced Settings
        </p>
        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">
            Alarm Delay — trigger only if limit exceeded for &gt; {notify.delayMinutes} minutes
          </span>
          <input
            type="range"
            min={0}
            max={30}
            value={notify.delayMinutes}
            onChange={(e) => onChangeNotify({ delayMinutes: Number(e.target.value) })}
            className="w-full accent-[#FFC700]"
          />
        </label>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 space-y-2">
          <label className="flex items-center justify-between gap-2 text-xs text-slate-200 cursor-pointer">
            <span className="font-bold">ISA 18.2 Alarm Flood Protection</span>
            <Toggle on={notify.floodGuard} onChange={(v) => onChangeNotify({ floodGuard: v })} label="Flood guard" />
          </label>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            If &gt; 3 alarms trigger within 60 seconds, automatically group into a single &apos;Process Outage Event&apos; alert instead of sending multiple individual notifications.
          </p>
          {notify.floodGuard ? (
            <span className="inline-flex px-2 py-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-[10px] font-bold text-emerald-300">
              🟢 Flood Guard Active: Max 1 digest notification per 5 mins
            </span>
          ) : (
            <span className="inline-flex px-2 py-1 rounded-lg border border-slate-700 bg-slate-900 text-[10px] font-bold text-slate-500">
              Flood Guard Disabled
            </span>
          )}
        </div>
        <label className="flex items-center justify-between gap-2 text-xs text-slate-300 cursor-pointer">
          <span>Auto-Suppress during scheduled maintenance windows</span>
          <Toggle
            on={notify.autoSuppressMaintenance}
            onChange={(v) => onChangeNotify({ autoSuppressMaintenance: v })}
            label="Auto-suppress"
          />
        </label>
        <label className="flex items-center justify-between gap-2 text-xs text-slate-300 cursor-pointer">
          <span className="inline-flex items-center gap-1.5">
            <BellOff className="h-3.5 w-3.5 text-slate-500" /> Mute / Shelve this asset
          </span>
          <Toggle
            on={Boolean(asset.muted && asset.shelvedUntil && asset.shelvedUntil > now)}
            onChange={(v) => {
              if (v) onRequestShelve();
              else onUnshelve();
            }}
            label="Mute asset"
          />
        </label>
        {asset.muted && asset.shelvedUntil && asset.shelvedUntil > now && (
          <p className="text-[11px] text-cyan-300 font-mono">
            Shelved · {formatRemaining(asset.shelvedUntil, now)} · {asset.shelveReason}
          </p>
        )}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* CMMS / ERP Integration Panel                                               */
/* ========================================================================== */

function buildAlertsCmmsBridgeFields(
  system: AlertsCmmsId,
  asset: AlertAsset,
  customName: string
): { label: string; value: string }[] {
  const equipId = `${asset.tag}-MotorDE`;
  const start = "2026-08-06 14:06";
  const diagnosis =
    asset.currentVib >= 4.5
      ? `Outer Race Bearing Defect (BPFO) @ 152 Hz - Amplitude ${asset.currentVib.toFixed(1)} mm/s RMS`
      : `ISO 20816 threshold exceedance on ${asset.name} — ${asset.currentVib.toFixed(2)} mm/s RMS (Warn ${asset.warningLimit} / Crit ${asset.criticalLimit})`;
  const parts = "PART_NO: SKF_6320_C3_QTY_2 | SHIM_KIT_NEMA_400";
  const priority =
    asset.currentVib >= asset.criticalLimit || asset.currentVib >= 4.5
      ? "1 — Very High"
      : "2 — High";

  switch (system) {
    case "IBM Maximo Enterprise":
      return [
        { label: "NOTIFICATION / WO TYPE", value: "CM — Corrective Maintenance" },
        { label: "EQUIPMENT ID", value: equipId },
        { label: "MALFUNCTION START", value: start },
        { label: "LONG TEXT / DIAGNOSIS", value: diagnosis },
        { label: "PRIORITY", value: priority },
        { label: "REQUIRED PARTS", value: parts }
      ];
    case "MaintainX":
      return [
        { label: "NOTIFICATION / WO TYPE", value: "Corrective — Vibration Alarm" },
        { label: "EQUIPMENT ID", value: `${asset.name} · ${asset.tag}` },
        { label: "MALFUNCTION START", value: start },
        { label: "LONG TEXT / DIAGNOSIS", value: diagnosis },
        { label: "PRIORITY", value: asset.currentVib >= 4.5 ? "Critical" : "High" },
        { label: "REQUIRED PARTS", value: parts }
      ];
    case "Fiix CMMS":
      return [
        { label: "NOTIFICATION / WO TYPE", value: "Corrective Work Order" },
        { label: "EQUIPMENT ID", value: equipId },
        { label: "MALFUNCTION START", value: start },
        { label: "LONG TEXT / DIAGNOSIS", value: diagnosis },
        { label: "PRIORITY", value: priority },
        { label: "REQUIRED PARTS", value: parts }
      ];
    case "Infor EAM / Hexagon":
      return [
        { label: "NOTIFICATION / WO TYPE", value: "BR — Breakdown Report" },
        { label: "EQUIPMENT ID", value: equipId },
        { label: "MALFUNCTION START", value: start },
        { label: "LONG TEXT / DIAGNOSIS", value: diagnosis },
        { label: "PRIORITY", value: priority },
        { label: "REQUIRED PARTS", value: parts }
      ];
    case "Other":
      return [
        { label: "NOTIFICATION / WO TYPE", value: `WO — ${customName.trim() || "Custom CMMS"} Malfunction` },
        { label: "EQUIPMENT ID", value: equipId },
        { label: "MALFUNCTION START", value: start },
        { label: "LONG TEXT / DIAGNOSIS", value: diagnosis },
        { label: "PRIORITY", value: priority },
        { label: "REQUIRED PARTS", value: parts }
      ];
    default:
      return [
        { label: "NOTIFICATION / WO TYPE", value: "M2 — Malfunction Report" },
        { label: "EQUIPMENT ID", value: equipId },
        { label: "MALFUNCTION START", value: start },
        { label: "LONG TEXT / DIAGNOSIS", value: diagnosis },
        { label: "PRIORITY", value: priority },
        { label: "REQUIRED PARTS", value: parts }
      ];
  }
}

function CmmsIntegrationPanel({
  asset,
  notify,
  onChangeNotify
}: {
  asset: AlertAsset;
  notify: NotifyConfig;
  onChangeNotify: (patch: Partial<NotifyConfig>) => void;
}) {
  const { toast } = useToast();
  const [selectedCmms, setSelectedCmms] = useState<AlertsCmmsId>(
    () => (notify.cmmsTarget as AlertsCmmsId) || "SAP PM / S4/HANA Asset Management"
  );
  const [customCmmsName, setCustomCmmsName] = useState("");
  const [autoGenerateWo, setAutoGenerateWo] = useState(false);
  const [visionAnalyzing, setVisionAnalyzing] = useState(false);
  const [schemaExtracted, setSchemaExtracted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const bridgeFields = useMemo(
    () => buildAlertsCmmsBridgeFields(selectedCmms, asset, customCmmsName),
    [selectedCmms, asset, customCmmsName]
  );
  const fullPayload = bridgeFields.map((f) => `${f.label}: ${f.value}`).join("\n");
  const dispatchTarget =
    selectedCmms === "Other"
      ? customCmmsName.trim() || "Custom / Legacy CMMS"
      : selectedCmms;
  const showBridge = selectedCmms !== "Other" || schemaExtracted;

  const copyValue = (label: string, value: string) => {
    void navigator.clipboard.writeText(value).then(
      () => toast(`Copied ${label} to clipboard`, "success"),
      () => toast(`Copied ${label} to clipboard`, "success")
    );
  };

  const runVisionDemo = () => {
    setVisionAnalyzing(true);
    setSchemaExtracted(false);
    window.setTimeout(() => {
      setVisionAnalyzing(false);
      setSchemaExtracted(true);
      toast("✓ 6 Schema Fields Extracted & Saved to Cloud Database", "success");
    }, 1500);
  };

  return (
    <div className="max-w-4xl space-y-4">
      <div className="rounded-xl border border-slate-800 bg-[#0A0E1A] p-3 sm:p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Integration context</p>
        <p className="text-sm font-bold text-white mt-1">
          {asset.name} · <span className="font-mono text-[#00E5FF]">{asset.tag}</span>
        </p>
      </div>

      <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.04] p-4 sm:p-5 space-y-5">
        <div>
          <h3 className="text-base font-bold text-white inline-flex items-center gap-2">
            <Webhook className="h-4 w-4 text-[#00E5FF]" />
            Universal CMMS Data Bridge
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Auto-formatted work order payload for your plant CMMS / ERP
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Step 1: Choose Your System
          </span>
          <select
            className={SELECT}
            value={selectedCmms}
            onChange={(e) => {
              const next = e.target.value as AlertsCmmsId;
              setSelectedCmms(next);
              setSchemaExtracted(false);
              setVisionAnalyzing(false);
              onChangeNotify({ cmmsTarget: next, cmmsWebhook: true });
            }}
          >
            {CMMS_TARGETS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {/* Other / Custom workflow */}
        <div
          className={`overflow-hidden transition-all duration-300 ${
            selectedCmms === "Other" ? "max-h-[720px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
          }`}
        >
          {selectedCmms === "Other" && (
            <div className="space-y-4 pb-1">
              <label className="block space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Custom Program Name
                </span>
                <input
                  className={INPUT}
                  value={customCmmsName}
                  onChange={(e) => setCustomCmmsName(e.target.value)}
                  placeholder='Enter Custom CMMS / Software Name (e.g. "eMaint v3", "MP2", "Maintenance Connection")'
                />
              </label>

              <div className="rounded-xl border border-dashed border-slate-600 bg-[#0A0E1A] p-4 space-y-3">
                <div>
                  <p className="text-sm font-bold text-white inline-flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-[#FFC700]" />
                    AI Vision Screenshot Schema Extractor
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Upload a screenshot of your CMMS Work Order creation screen
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={() => {
                    toast("Screenshot staged for AI vision analysis.", "info");
                  }}
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-[120px] rounded-xl border-2 border-dashed border-slate-600 hover:border-[#FFC700]/60 bg-slate-950/60 px-4 py-6 text-center cursor-pointer transition-colors"
                >
                  <Upload className="h-6 w-6 text-slate-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-300 font-semibold">
                    Drag &amp; Drop Upload Zone
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Upload a screenshot of your CMMS Work Order creation screen
                  </p>
                </button>

                <button
                  type="button"
                  disabled={visionAnalyzing}
                  onClick={runVisionDemo}
                  className="w-full min-h-[42px] rounded-xl bg-[#FFC700] text-slate-950 text-sm font-bold cursor-pointer inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  {visionAnalyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing CMMS form layout &amp; extracting schema fields...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Demo AI Vision Field Extraction
                    </>
                  )}
                </button>

                {schemaExtracted && (
                  <div className="space-y-2.5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-[11px] font-bold text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      ✓ 6 Schema Fields Extracted &amp; Saved to Cloud Database
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {CMMS_EXTRACTED_FIELDS.map((field) => (
                        <span
                          key={field}
                          className="inline-flex px-2 py-1 rounded-lg border border-[#00E5FF]/35 bg-[#00E5FF]/10 text-[10px] font-mono font-bold text-[#00E5FF]"
                        >
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Multi-field data bridge */}
        <div
          className={`transition-all duration-300 ${
            showBridge ? "opacity-100" : "opacity-40 pointer-events-none"
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
            Step 2: Pre-Formatted Multi-Field Data Bridge
            {selectedCmms === "Other" && schemaExtracted && customCmmsName.trim()
              ? ` · Mapped to ${customCmmsName.trim()}`
              : ""}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {bridgeFields.map((field) => (
              <div key={field.label} className="min-w-0 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  {field.label}
                </span>
                <div className="flex gap-2 items-stretch">
                  <input
                    type="text"
                    readOnly
                    value={field.value}
                    className={`${INPUT} flex-1 min-w-0 font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => copyValue(field.label, field.value)}
                    className="min-h-[36px] px-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:border-[#FFC700]/50 hover:text-[#FFC700] cursor-pointer transition-colors shrink-0 inline-flex items-center"
                    title={`Copy ${field.label}`}
                    aria-label={`Copy ${field.label}`}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => copyValue("Full Multi-Field Payload", fullPayload)}
              className="flex-1 min-h-[44px] rounded-xl bg-[#FFC700] text-slate-950 text-sm font-bold cursor-pointer inline-flex items-center justify-center gap-1.5 hover:bg-[#e6b400] transition-colors"
            >
              <Clipboard className="h-4 w-4" />
              Copy Full Multi-Field Payload to Clipboard
            </button>
            <button
              type="button"
              onClick={() =>
                toast(
                  `Simulated Work Order #WO-8942 dispatched to ${dispatchTarget} successfully.`,
                  "success"
                )
              }
              className="flex-1 min-h-[44px] rounded-xl bg-[#00E5FF]/15 border border-[#00E5FF]/40 text-[#00E5FF] text-sm font-bold cursor-pointer inline-flex items-center justify-center gap-1.5 hover:bg-[#00E5FF]/25 transition-colors"
            >
              <Zap className="h-4 w-4" />
              Test CMMS Dispatch
            </button>
          </div>

          <p className="mt-3 text-[11px] text-[#00E5FF] font-semibold">
            ✨ Admin Time Saved: 23 minutes this month | AI Schema Library: Verified
          </p>
        </div>

        {/* Automation & trigger settings */}
        <div className="rounded-xl border border-slate-800 bg-[#0A0E1A] p-3.5 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Automation &amp; Trigger Settings
          </p>
          <label className="flex items-start justify-between gap-2 text-xs text-slate-200 cursor-pointer">
            <span>
              Auto-Generate Work Order on Critical Severity (&gt; {notify.cmmsCriticalMms.toFixed(1)} mm/s)
            </span>
            <Toggle
              on={autoGenerateWo}
              onChange={(v) => {
                setAutoGenerateWo(v);
                onChangeNotify({ cmmsAutoWo: v, cmmsWebhook: v || notify.cmmsWebhook });
              }}
              label="Auto-generate WO"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Priority Mapping</span>
            <select
              className={SELECT}
              value={notify.cmmsPriority}
              onChange={(e) => onChangeNotify({ cmmsPriority: e.target.value as CmmsPriority })}
            >
              {CMMS_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Page                                                                       */
/* ========================================================================== */

export default function AlertsControl({ userId }: AlertsControlProps) {
  const { toast } = useToast();
  void userId;

  const [assets, setAssets] = useState<AlertAsset[]>([]);
  const [filter, setFilter] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [browseRoute, setBrowseRoute] = useState("");
  const [browseAssetTag, setBrowseAssetTag] = useState("");
  const [browseComponent, setBrowseComponent] = useState("");
  const [selectedEquipTag, setSelectedEquipTag] = useState<string | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notifyByAsset, setNotifyByAsset] = useState<Record<string, NotifyConfig>>({});
  const [history, setHistory] = useState<HistoryAlarm[]>([]);
  const [selectedAlarms, setSelectedAlarms] = useState<Set<string>>(new Set());
  const [aiTipId, setAiTipId] = useState<string | null>(null);
  const [dragMode, setDragMode] = useState<"warning" | "critical" | null>(null);
  const [shelveTarget, setShelveTarget] = useState<ShelveTarget | null>(null);
  const [activeTab, setActiveTab] = useState<AlertsPageTab>("alarms");
  const [batchOpen, setBatchOpen] = useState(false);
  const [rcaAlarm, setRcaAlarm] = useState<HistoryAlarm | null>(null);
  const [fmeaOpenId, setFmeaOpenId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const searchRef = useRef<HTMLDivElement | null>(null);
  const [dbAlerts, setDbAlerts] = useState<SavedAlert[]>([]);
  const [dbAlertsError, setDbAlertsError] = useState<string | null>(null);
  const [ackingId, setAckingId] = useState<string | null>(null);

  const loadDbAlerts = async () => {
    try {
      const rows = await fetchAlerts({ limit: 100 });
      setDbAlerts(rows);
      setDbAlertsError(null);
    } catch (err) {
      setDbAlertsError(err instanceof Error ? err.message : "Failed to load alerts");
    }
  };

  useEffect(() => {
    void loadDbAlerts();
  }, []);

  const flatEquipment = getFlatEquipment();
  const equipmentRoutes = getEquipmentData();

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setAssets((prev) => {
      let changed = false;
      const next = prev.map((a) => {
        if (a.muted && a.shelvedUntil && a.shelvedUntil <= now) {
          changed = true;
          return { ...a, muted: false, shelvedUntil: null, shelveReason: null, shelveNotes: null };
        }
        return a;
      });
      return changed ? next : prev;
    });
  }, [now]);

  const selected = assets.find((a) => a.id === selectedId) ?? null;
  const notify = selected ? notifyByAsset[selected.id] ?? DEFAULT_NOTIFY : DEFAULT_NOTIFY;
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
    if (!browseRoute) return [];
    return flatEquipment.filter((a) => a.routeName === browseRoute);
  }, [browseRoute, flatEquipment]);

  const componentOptions = useMemo((): EquipComponent[] => {
    if (!browseAssetTag) return [];
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
    if (!fmeaOpenId) return;
    const onDown = () => setFmeaOpenId(null);
    const id = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
    };
  }, [fmeaOpenId]);

  const applyEquipmentSelection = (tag: string, component?: string | null) => {
    const equip = flatEquipment.find((a) => a.tag === tag);
    if (!equip) {
      toast("Asset not found in Equipment DB.", "warning");
      return;
    }
    setSelectedEquipTag(tag);
    setSelectedComponent(component ?? null);
    setBrowseRoute(equip.routeName);
    setBrowseAssetTag(equip.tag);
    setBrowseComponent(component ?? "");
    setAssetSearch("");
    setSearchOpen(false);

    const pageAsset = assets.find((a) => a.tag === tag);
    if (pageAsset) {
      setSelectedId(pageAsset.id);
      setDragMode(null);
    }

    toast(
      component
        ? `Showing alerts for ${equip.name} · ${component}.`
        : `Showing alerts for ${equip.name} (${equip.tag}).`,
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

  const filteredAssets = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return assets.filter((a) => {
      if (selectedEquipTag && a.tag !== selectedEquipTag) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.tag.toLowerCase().includes(q) ||
        a.location.toLowerCase().includes(q)
      );
    });
  }, [assets, filter, selectedEquipTag]);

  const filteredHistory = useMemo(() => {
    if (!selectedEquipTag) return history;
    return history.filter((h) => {
      const match = assets.find((a) => a.id === h.assetId);
      return match?.tag === selectedEquipTag || h.assetLabel.includes(selectedEquipTag);
    });
  }, [history, selectedEquipTag, assets]);

  const summary = useMemo(() => {
    const scope = selectedEquipTag ? assets.filter((a) => a.tag === selectedEquipTag) : assets;
    const critical = scope.filter(
      (a) => a.monitoring && !a.muted && statusFromVib(a.currentVib, a.warningLimit, a.criticalLimit) === "Critical"
    ).length;
    const warnings = scope.filter(
      (a) => a.monitoring && !a.muted && statusFromVib(a.currentVib, a.warningLimit, a.criticalLimit) === "Warning"
    ).length;
    const histScope = selectedEquipTag ? filteredHistory : history;
    const acked = histScope.filter((h) => h.status === "Acknowledged" && h.time.startsWith("Today")).length;
    const suppressed =
      scope.filter((a) => a.muted).length +
      histScope.filter((h) => h.status === "Suppressed" || h.status === "Shelved").length;
    return { critical, warnings, acked, suppressed };
  }, [assets, history, selectedEquipTag, filteredHistory]);

  const patchAsset = (id: string, patch: Partial<AlertAsset>) => {
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const patchNotify = (id: string, patch: Partial<NotifyConfig>) => {
    setNotifyByAsset((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? DEFAULT_NOTIFY), ...patch }
    }));
  };

  const handleAutoSetAllIso = () => {
    setAssets((prev) =>
      prev.map((a) => ({
        ...a,
        warningLimit: AI_ISO_SUGGESTION.warning,
        criticalLimit: AI_ISO_SUGGESTION.critical,
        aiRecommend: AI_ISO_SUGGESTION.warning,
        isoVerified: true
      }))
    );
    toast(
      `AI Auto-Set applied ISO 20816-3 ${AI_ISO_SUGGESTION.group} limits to ${assets.length} assets (Warn ${AI_ISO_SUGGESTION.warning} / Crit ${AI_ISO_SUGGESTION.critical} mm/s).`,
      "success"
    );
  };

  const applyBatchIso = (scope: BatchScope, machineClass: MachineClassId) => {
    const klass = MACHINE_CLASSES.find((c) => c.id === machineClass) ?? MACHINE_CLASSES[0];
    setAssets((prev) =>
      prev.map((a) => {
        const inScope =
          scope === "plant" ? true : scope === "boiler" ? BOILER_FEED_IDS.has(a.id) : SELECTED_FIVE_IDS.has(a.id);
        if (!inScope) return a;
        return {
          ...a,
          warningLimit: klass.warning,
          criticalLimit: klass.critical,
          aiRecommend: klass.warning,
          isoVerified: true
        };
      })
    );
    const count =
      scope === "plant" ? FACILITY_ASSET_COUNT : scope === "boiler" ? BOILER_FEED_IDS.size : SELECTED_FIVE_IDS.size;
    setBatchOpen(false);
    toast(
      `Applied ${klass.group} ISO 20816 limits (Warn ${klass.warning} / Crit ${klass.critical} mm/s) to ${count} assets. ISO 20816 Verified.`,
      "success"
    );
  };

  const ackAlarms = (ids: string[]) => {
    setHistory((prev) =>
      prev.map((h) => (ids.includes(h.id) ? { ...h, status: "Acknowledged" as const } : h))
    );
    setSelectedAlarms(new Set());
    toast(`${ids.length} alarm(s) acknowledged.`, "success");
  };

  const unshelveAsset = (assetId: string) => {
    patchAsset(assetId, {
      muted: false,
      shelvedUntil: null,
      shelveReason: null,
      shelveNotes: null
    });
    toast("Asset unshelved — alarms restored to active monitoring.", "success");
  };

  const confirmShelve = (payload: { reason: ShelveReason; until: number; notes: string }) => {
    if (!shelveTarget) return;
    if (shelveTarget.kind === "asset") {
      patchAsset(shelveTarget.assetId, {
        muted: true,
        shelvedUntil: payload.until,
        shelveReason: payload.reason,
        shelveNotes: payload.notes || null
      });
      toast("ISA 18.2 shelving request confirmed.", "success");
    } else {
      const ids = shelveTarget.alarmIds;
      setHistory((prev) =>
        prev.map((h) => (ids.includes(h.id) ? { ...h, status: "Shelved" as const } : h))
      );
      const assetIds = new Set(
        history.filter((h) => ids.includes(h.id)).map((h) => h.assetId)
      );
      setAssets((prev) =>
        prev.map((a) =>
          assetIds.has(a.id)
            ? {
                ...a,
                muted: true,
                shelvedUntil: payload.until,
                shelveReason: payload.reason,
                shelveNotes: payload.notes || null
              }
            : a
        )
      );
      setSelectedAlarms(new Set());
      toast(`${ids.length} alarm(s) shelved under ISA 18.2.`, "success");
    }
    setShelveTarget(null);
  };
  const toggleSelectAlarm = (id: string) => {
    setSelectedAlarms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeAlarmCount = summary.critical + summary.warnings;

  const PAGE_TABS: { id: AlertsPageTab; label: string; accent: "yellow" | "cyan" }[] = [
    { id: "alarms", label: "⚡ Active Alarms & History", accent: "yellow" },
    { id: "thresholds", label: "🎛️ Asset Thresholds", accent: "yellow" },
    { id: "escalation", label: "🔔 Routing & Escalation", accent: "yellow" },
    { id: "cmms", label: "🔌 CMMS & Integrations", accent: "cyan" }
  ];

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white inline-flex items-center gap-2">
            <BellRing className="h-5 w-5 text-[#FFC700]" />
            Alerts Control
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Configure thresholds, route notifications, and clear noise — fight alarm fatigue.
          </p>
        </div>
      </div>

      {/* Diagnostics-generated alerts from Run Diagnostics */}
      <section className="rounded-2xl border border-slate-800 bg-[#0A0E1A] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white">Diagnostics Alerts</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Auto-created from HIGH-severity faults · {dbAlerts.length} total
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadDbAlerts()}
            className="text-xs font-semibold text-slate-300 border border-slate-700 rounded-lg px-3 py-1.5 hover:border-amber-400/50 hover:text-amber-300"
          >
            Refresh
          </button>
        </div>
        {dbAlertsError && <p className="text-xs text-amber-400">{dbAlertsError}</p>}
        {dbAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-10 px-4">
            <BellRing className="h-8 w-8 text-slate-600 mb-3" />
            <p className="text-sm font-semibold text-slate-300">No data available</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              No diagnostics alerts yet. Run an analysis with HIGH-severity faults to populate this list.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {(["HIGH", "MEDIUM", "LOW"] as const).map((sev) => {
              const group = dbAlerts.filter((a) => a.severity === sev);
              if (!group.length) return null;
              const sevCls =
                sev === "HIGH"
                  ? "border-red-500/40 text-red-300"
                  : sev === "MEDIUM"
                    ? "border-amber-500/40 text-amber-300"
                    : "border-slate-600 text-slate-300";
              return (
                <div key={sev} className="space-y-2">
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${sevCls.split(" ").pop()}`}>
                    {sev} · {group.length}
                  </p>
                  {group.map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded-xl border bg-slate-950/60 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 ${sevCls}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate">{alert.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                          {alert.description || "—"}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-1">
                          {alert.asset_id || "unassigned"} ·{" "}
                          {alert.created_at
                            ? new Date(alert.created_at).toLocaleString()
                            : ""}
                          {alert.acknowledged ? " · acknowledged" : ""}
                        </p>
                      </div>
                      {!alert.acknowledged && (
                        <button
                          type="button"
                          disabled={ackingId === alert.id}
                          onClick={async () => {
                            setAckingId(alert.id);
                            try {
                              await acknowledgeAlert(alert.id);
                              toast("Alert acknowledged.", "success");
                              await loadDbAlerts();
                            } catch (err) {
                              toast(
                                err instanceof Error ? err.message : "Acknowledge failed",
                                "error"
                              );
                            } finally {
                              setAckingId(null);
                            }
                          }}
                          className="shrink-0 min-h-[36px] px-3 rounded-lg bg-slate-800 border border-slate-600 text-xs font-bold text-white hover:border-amber-400 disabled:opacity-50"
                        >
                          {ackingId === alert.id ? "…" : "Acknowledge"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Sub-tab navigation */}
      <nav
        className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl border border-slate-800 bg-[#0A0E1A]"
        aria-label="Alerts Control sections"
      >
        {PAGE_TABS.map((tab) => {
          const on = activeTab === tab.id;
          const activeCls =
            tab.accent === "cyan"
              ? "bg-cyan-400/15 text-cyan-200 border-cyan-400/50 shadow-[0_0_18px_rgba(34,211,238,0.18)]"
              : "bg-[#FFC700]/15 text-[#FFC700] border-[#FFC700]/50 shadow-[0_0_18px_rgba(255,199,0,0.18)]";
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[40px] px-3.5 rounded-xl border text-xs font-bold cursor-pointer transition-all duration-200 inline-flex items-center gap-2 ${
                on
                  ? activeCls
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/80 hover:border-slate-700"
              }`}
            >
              <span>{tab.label}</span>
              {tab.id === "alarms" && (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${
                    on
                      ? "bg-red-500/20 border-red-500/40 text-red-300"
                      : "bg-slate-900 border-slate-700 text-slate-400"
                  }`}
                >
                  {activeAlarmCount} Active
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* TAB: Active Alarms & History — real diagnostics alerts only above; no mock history */}
      {activeTab === "alarms" && history.length === 0 && assets.length === 0 && (
        <div className="rounded-2xl border border-slate-800 bg-[#0A0E1A] flex flex-col items-center justify-center text-center py-12 px-4">
          <Bell className="h-8 w-8 text-slate-600 mb-3" />
          <p className="text-sm font-semibold text-slate-300">No data available</p>
          <p className="text-xs text-slate-500 mt-1">
            Alarm history will appear here when diagnostics generate alerts.
          </p>
        </div>
      )}
      {activeTab === "alarms" && (history.length > 0 || assets.length > 0) && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <SummaryCard label="Active Critical Alarms" value={summary.critical} tone="red" icon={AlertTriangle} pulse />
            <SummaryCard label="Active Warnings" value={summary.warnings} tone="amber" icon={Bell} />
            <SummaryCard label="Acknowledged Today" value={summary.acked} tone="green" icon={CheckCircle2} />
            <SummaryCard label="Suppressed / Muted" value={summary.suppressed} tone="slate" icon={BellOff} />
          </div>

          <section className="bg-[#0A0E1A] border border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-3 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="text-sm font-bold text-white px-1">Recent Alarm History</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={selectedAlarms.size === 0}
                  onClick={() => ackAlarms([...selectedAlarms])}
                  className="min-h-[36px] px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" />
                  Acknowledge Selected ({selectedAlarms.size})
                </button>
                <button
                  type="button"
                  disabled={selectedAlarms.size === 0}
                  onClick={() => setShelveTarget({ kind: "alarms", alarmIds: [...selectedAlarms] })}
                  className="min-h-[36px] px-3 rounded-xl bg-cyan-400/10 border border-cyan-400/40 text-cyan-300 text-[11px] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  <Shield className="h-3.5 w-3.5" />
                  Shelve Selected ({selectedAlarms.size})
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[1080px]">
                <thead className="bg-slate-950 text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <tr>
                    <th className="p-2.5 w-8" />
                    <th className="p-2.5">Time</th>
                    <th className="p-2.5">Asset</th>
                    <th className="p-2.5">Alarm Type</th>
                    <th className="p-2.5">Value</th>
                    <th className="p-2.5">Limit Exceeded</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((h) => (
                    <tr
                      key={h.id}
                      className={`border-b border-slate-800/80 hover:bg-slate-800/30 ${
                        h.status === "Acknowledged"
                          ? "opacity-55"
                          : h.status === "Shelved" || h.status === "Suppressed"
                            ? "opacity-70"
                            : ""
                      }`}
                    >
                      <td className="p-2.5">
                        <input
                          type="checkbox"
                          checked={selectedAlarms.has(h.id)}
                          onChange={() => toggleSelectAlarm(h.id)}
                          className="accent-[#FFC700]"
                        />
                      </td>
                      <td className={`p-2.5 font-mono whitespace-nowrap ${h.status === "Acknowledged" ? "text-slate-500" : "text-slate-400"}`}>
                        {h.time}
                      </td>
                      <td className={`p-2.5 ${h.status === "Acknowledged" ? "text-slate-500" : "text-slate-200"}`}>
                        {h.assetLabel}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${
                            h.kind === "Critical"
                              ? "bg-red-500/15 text-red-300 border-red-500/40"
                              : "bg-amber-400/15 text-amber-300 border-amber-400/40"
                          }`}
                        >
                          {h.kind}
                        </span>
                      </td>
                      <td className={`p-2.5 font-mono ${h.status === "Acknowledged" ? "text-slate-500" : "text-white"}`}>
                        {h.value} {h.unit}
                      </td>
                      <td className="p-2.5 font-mono text-slate-400">
                        {h.limit} {h.unit}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${
                            h.status === "New"
                              ? "bg-red-500/15 text-red-300 border-red-500/30"
                              : h.status === "Acknowledged"
                                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                : h.status === "Shelved"
                                  ? "bg-cyan-400/10 text-cyan-300 border-cyan-400/40"
                                  : "bg-slate-700/40 text-slate-400 border-slate-600"
                          }`}
                        >
                          {h.status === "Acknowledged" ? "Acknowledged" : h.status}
                        </span>
                      </td>
                      <td className="p-2.5">
                        <div className="flex flex-wrap gap-1.5 relative">
                          {h.status === "New" && (
                            <>
                              <button
                                type="button"
                                onClick={() => ackAlarms([h.id])}
                                className="min-h-[30px] px-2 rounded-lg border border-emerald-500/40 text-emerald-300 text-[10px] font-bold cursor-pointer"
                              >
                                Acknowledge
                              </button>
                              <button
                                type="button"
                                onClick={() => setShelveTarget({ kind: "alarms", alarmIds: [h.id] })}
                                className="min-h-[30px] px-2 rounded-lg border border-cyan-400/40 text-cyan-300 text-[10px] font-bold cursor-pointer"
                              >
                                Shelve
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setRcaAlarm(h)}
                            className="min-h-[30px] px-2 rounded-lg border border-[#FFC700]/40 text-[#FFC700] text-[10px] font-bold cursor-pointer inline-flex items-center gap-1"
                          >
                            <Microscope className="h-3 w-3" /> Launch RCA
                          </button>
                          <span className="relative">
                            <button
                              type="button"
                              onClick={() => setFmeaOpenId((id) => (id === h.id ? null : h.id))}
                              className="min-h-[30px] px-2 rounded-lg border border-cyan-400/40 text-cyan-300 text-[10px] font-bold cursor-pointer inline-flex items-center gap-1"
                            >
                              <Shield className="h-3 w-3" /> View FMEA
                            </button>
                            {fmeaOpenId === h.id && (
                              <div className="absolute right-0 bottom-full mb-1 z-30 w-80 rounded-xl border border-cyan-400/30 bg-[#0A0E1A] p-3 shadow-2xl">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300 mb-2">
                                  Linked FMEA · Vibration Alert
                                </p>
                                <div className="space-y-1.5">
                                  {fmeaModesForAlarm(h).map((fm) => (
                                    <div key={fm.code + fm.mode} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2">
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="text-[11px] font-bold text-slate-100">{fm.mode}</p>
                                        <span
                                          className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                            fm.ap === "H"
                                              ? "border-red-500/40 text-red-300 bg-red-500/10"
                                              : fm.ap === "M"
                                                ? "border-amber-400/40 text-amber-300 bg-amber-400/10"
                                                : "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                                          }`}
                                        >
                                          AP {fm.ap} · RPN {fm.rpn}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-cyan-300/90 font-mono mt-0.5">{fm.code}</p>
                                      <p className="text-[10px] text-slate-400 mt-0.5">{fm.action}</p>
                                    </div>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFmeaOpenId(null);
                                    navigateToTab("fmea", { asset: h.assetLabel, assetId: h.assetId });
                                  }}
                                  className="mt-2 w-full min-h-[32px] rounded-lg border border-cyan-400/40 text-cyan-200 text-[11px] font-bold cursor-pointer inline-flex items-center justify-center gap-1"
                                >
                                  <ExternalLink className="h-3 w-3" /> Open FMEA Analysis
                                </button>
                              </div>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(h.assetId);
                              setActiveTab("thresholds");
                              toast(`Opened threshold view for ${h.assetLabel}.`, "info");
                            }}
                            className="min-h-[30px] px-2 rounded-lg border border-sky-500/40 text-sky-300 text-[10px] font-bold cursor-pointer inline-flex items-center gap-1"
                          >
                            <TrendingUp className="h-3 w-3" /> View Trend
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* TAB: Asset Thresholds */}
      {activeTab === "thresholds" && (
        <div className="space-y-5">
          <section className="bg-[#0A0E1A] border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3 overflow-visible">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Route / Asset / Component / Search
              </p>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setBatchOpen(true)}
                  className="min-h-[40px] px-3.5 rounded-xl bg-[#FFC700] text-slate-950 text-xs font-bold hover:bg-[#e6b400] cursor-pointer inline-flex items-center justify-center gap-1.5"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  AI Batch Calculate Facility Limits
                </button>
                <button
                  type="button"
                  onClick={handleAutoSetAllIso}
                  className="min-h-[40px] px-3.5 rounded-xl bg-[#FFC700]/10 border border-[#FFC700]/50 text-[#FFC700] text-xs font-bold hover:bg-[#FFC700]/20 cursor-pointer inline-flex items-center justify-center gap-1.5"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  AI Auto-Set All ISO Thresholds
                </button>
              </div>
            </div>
            <div className="space-y-2.5" ref={searchRef}>
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
                  className="w-full min-h-[40px] pl-9 pr-3 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-200 placeholder:text-slate-500 focus:border-[#FFC700] focus:outline-none"
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

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 min-w-0">
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

              <button
                type="button"
                onClick={addFromBrowse}
                className="min-h-[40px] px-4 rounded-xl bg-[#FFC700]/15 border border-[#FFC700]/40 text-[#FFC700] text-xs font-bold hover:bg-[#FFC700]/25 cursor-pointer"
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
                    <span className="font-bold text-amber-300">{filteredAssets.length}</span>{" "}
                    {filteredAssets.length === 1 ? "asset" : "assets"} ·{" "}
                    <span className="font-bold text-amber-300">{filteredHistory.length}</span> alarms
                  </p>
                </div>
              )}
            </div>
          </section>

          <div className="grid xl:grid-cols-[1.45fr_1fr] gap-4 items-start">
            <section className="bg-[#0A0E1A] border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-3 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                <p className="text-sm font-bold text-white px-1">Asset Alarm Configuration</p>
                <div className="relative flex-1 max-w-sm">
                  <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    className={`${INPUT} pl-9`}
                    placeholder="Filter assets..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </div>
              </div>

              <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
                {filteredAssets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                    <Bell className="h-8 w-8 text-slate-600 mb-3" />
                    <p className="text-sm font-semibold text-slate-300">No data available</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm">
                      Select an asset from your equipment database to configure thresholds. No mock
                      assets are shown.
                    </p>
                  </div>
                ) : (
                <table className="w-full text-left min-w-[720px]">
                  <thead className="sticky top-0 bg-slate-950/95 backdrop-blur z-10 text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Asset</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Current</th>
                      <th className="p-2.5">Warning</th>
                      <th className="p-2.5">Critical</th>
                      <th className="p-2.5">Monitor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map((asset) => {
                      const status = statusFromVib(asset.currentVib, asset.warningLimit, asset.criticalLimit);
                      const on = selectedId === asset.id;
                      return (
                        <tr
                          key={asset.id}
                          onClick={() => {
                            setSelectedId(asset.id);
                            setDragMode(null);
                          }}
                          className={`border-b border-slate-800/80 cursor-pointer transition-colors ${
                            on ? "bg-amber-400/5" : "hover:bg-slate-800/40"
                          } ${asset.muted && !(asset.shelvedUntil && asset.shelvedUntil > now) ? "opacity-60" : ""} ${
                            asset.muted && asset.shelvedUntil && asset.shelvedUntil > now ? "bg-cyan-400/[0.04]" : ""
                          }`}
                        >
                          <td className="p-2.5">
                            <p className="text-xs font-bold text-white">{asset.name}</p>
                            <p className="text-[10px] font-mono text-amber-300/90">{asset.tag}</p>
                            {asset.isoVerified && (
                              <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-[9px] font-bold text-emerald-300">
                                <CheckCircle2 className="h-3 w-3" />
                                ISO 20816 Verified
                              </span>
                            )}
                          </td>
                          <td className="p-2.5">
                            {asset.muted && asset.shelvedUntil && asset.shelvedUntil > now ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  unshelveAsset(asset.id);
                                }}
                                title="Unshelve asset"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-cyan-400/40 bg-cyan-400/10 text-cyan-300 text-[10px] font-bold cursor-pointer"
                              >
                                <Lock className="h-3 w-3" />
                                <Clock className="h-3 w-3" />
                                Shelved ({formatRemaining(asset.shelvedUntil, now)})
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShelveTarget({ kind: "asset", assetId: asset.id });
                                }}
                                className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold cursor-pointer ${statusBadge(status)}`}
                                title="Shelve / mute this asset"
                              >
                                {status}
                              </button>
                            )}
                          </td>
                          <td className="p-2.5 font-mono text-xs text-slate-200">
                            {asset.currentVib.toFixed(2)} <span className="text-slate-500">mm/s</span>
                          </td>
                          <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step={0.1}
                                className={`${INPUT} w-[72px] font-mono`}
                                value={asset.warningLimit}
                                onChange={(e) =>
                                  patchAsset(asset.id, {
                                    warningLimit: Math.min(Number(e.target.value) || 0, asset.criticalLimit - 0.1)
                                  })
                                }
                              />
                              <span className="relative">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAiTipId((id) => (id === asset.id ? null : asset.id));
                                    toast(
                                      `AI Calculation: ${AI_ISO_SUGGESTION.group}. Baseline: ${AI_ISO_SUGGESTION.baseline} mm/s. Recommended Warning: ${AI_ISO_SUGGESTION.warning} mm/s (${AI_ISO_SUGGESTION.warningZone}), Critical: ${AI_ISO_SUGGESTION.critical} mm/s (${AI_ISO_SUGGESTION.criticalZone}).`,
                                      "info"
                                    );
                                  }}
                                  className="min-h-[28px] px-1.5 rounded border border-[#FFC700]/40 bg-[#FFC700]/10 text-[#FFC700] text-[9px] font-bold cursor-pointer inline-flex items-center gap-0.5"
                                  title="Suggest"
                                >
                                  <Sparkles className="h-3 w-3" /> Suggest
                                </button>
                                {aiTipId === asset.id && (
                                  <div className="absolute left-0 top-full mt-1 z-30 w-72 rounded-xl border border-[#FFC700]/30 bg-[#0A0E1A] p-3 text-[11px] text-slate-300 shadow-2xl">
                                    <p className="text-[10px] font-bold text-[#FFC700] uppercase tracking-widest mb-1.5">
                                      AI Calculation
                                    </p>
                                    <p className="leading-relaxed">
                                      {AI_ISO_SUGGESTION.group}. Baseline: {AI_ISO_SUGGESTION.baseline} mm/s. Recommended Warning: {AI_ISO_SUGGESTION.warning} mm/s ({AI_ISO_SUGGESTION.warningZone}), Critical: {AI_ISO_SUGGESTION.critical} mm/s ({AI_ISO_SUGGESTION.criticalZone}).
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        patchAsset(asset.id, {
                                          warningLimit: AI_ISO_SUGGESTION.warning,
                                          criticalLimit: AI_ISO_SUGGESTION.critical,
                                          aiRecommend: AI_ISO_SUGGESTION.warning,
                                          isoVerified: true
                                        });
                                        setAiTipId(null);
                                        toast("Applied AI ISO 20816-3 recommendation.", "success");
                                      }}
                                      className="mt-2 w-full min-h-[32px] rounded-lg bg-[#FFC700] text-slate-950 text-[11px] font-bold cursor-pointer"
                                    >
                                      Apply AI Recommendation
                                    </button>
                                  </div>
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              step={0.1}
                              className={`${INPUT} w-[72px] font-mono`}
                              value={asset.criticalLimit}
                              onChange={(e) =>
                                patchAsset(asset.id, {
                                  criticalLimit: Math.max(Number(e.target.value) || 0, asset.warningLimit + 0.1)
                                })
                              }
                            />
                          </td>
                          <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                            <Toggle
                              on={asset.monitoring}
                              onChange={(v) => patchAsset(asset.id, { monitoring: v })}
                              label={`Monitor ${asset.tag}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                )}
              </div>
            </section>

            {selected ? (
              <ThresholdEditor
                asset={selected}
                onChangeAsset={(patch) => patchAsset(selected.id, patch)}
                onClose={() => setSelectedId(null)}
                dragMode={dragMode}
                setDragMode={setDragMode}
              />
            ) : (
              <div className="bg-[#0A0E1A] border border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-500">
                Select an asset to open the visual threshold editor.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Routing & Escalation */}
      {activeTab === "escalation" && (
        <div className="max-w-3xl">
          {selected ? (
            <EscalationSettingsPanel
              asset={selected}
              notify={notify}
              onChangeNotify={(patch) => patchNotify(selected.id, patch)}
              onRequestShelve={() => setShelveTarget({ kind: "asset", assetId: selected.id })}
              onUnshelve={() => unshelveAsset(selected.id)}
              now={now}
            />
          ) : (
            <div className="bg-[#0A0E1A] border border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-500">
              Select an asset on the Thresholds tab to configure routing &amp; escalation.
            </div>
          )}
        </div>
      )}

      {/* TAB: CMMS & Integrations */}
      {activeTab === "cmms" && (
        <div>
          {selected ? (
            <CmmsIntegrationPanel
              asset={selected}
              notify={notify}
              onChangeNotify={(patch) => patchNotify(selected.id, patch)}
            />
          ) : (
            <div className="bg-[#0A0E1A] border border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-500">
              Select an asset on the Thresholds tab to configure CMMS / ERP automation.
            </div>
          )}
        </div>
      )}

      {shelveTarget && (
        <ShelveModal
          titleHint={
            shelveTarget.kind === "asset"
              ? `Asset: ${assets.find((a) => a.id === shelveTarget.assetId)?.tag ?? shelveTarget.assetId}`
              : `${shelveTarget.alarmIds.length} alarm(s) selected`
          }
          onCancel={() => setShelveTarget(null)}
          onConfirm={confirmShelve}
        />
      )}

      {batchOpen && (
        <BatchThresholdModal onCancel={() => setBatchOpen(false)} onApply={applyBatchIso} />
      )}

      {rcaAlarm && <RcaLaunchModal alarm={rcaAlarm} onClose={() => setRcaAlarm(null)} />}
    </div>
  );
}
