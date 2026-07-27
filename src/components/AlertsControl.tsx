import React, { useState, useMemo } from "react";
import { 
  Bell, ShieldAlert, AlertTriangle, CheckCircle2, XCircle, Plus, Trash2, 
  Download, RefreshCw, Sliders, Mail, MessageSquare, Send, Check, Search, 
  Filter, Clock, UserPlus, Users, Volume2, Sparkles, ChevronDown, 
  Settings, FileText, X, AlertOctagon, Activity, ToggleLeft, ToggleRight,
  ShieldCheck, Info, RotateCcw
} from "lucide-react";

interface ActiveAlert {
  id: string;
  assetName: string;
  assetId: string;
  location: string;
  alertType: string;
  severity: "critical" | "warning";
  timeTriggered: string;
  timestamp: string;
  currentValue: number;
  thresholdLimit: number;
  unit: string;
  status: "active" | "acknowledged";
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

interface AlertHistoryItem {
  id: string;
  date: string;
  timestamp: string;
  assetName: string;
  alertType: string;
  severity: "critical" | "warning" | "info";
  status: "Resolved" | "Acknowledged" | "Auto-Cleared" | "Dismissed";
  duration: string;
  resolvedBy: string;
}

interface Recipient {
  id: string;
  name: string;
  contact: string; // Email or phone
  channel: "email" | "sms" | "both";
  role: string;
  active: boolean;
}

interface AssetThreshold {
  assetId: string;
  assetName: string;
  warningVib: number;
  criticalVib: number;
  warningTemp: number;
  criticalTemp: number;
  customNotes?: string;
}

const DEFAULT_THRESHOLDS: AssetThreshold[] = [
  {
    assetId: "all",
    assetName: "All Assets (Global Default)",
    warningVib: 2.8,
    criticalVib: 4.5,
    warningTemp: 75.0,
    criticalTemp: 90.0,
    customNotes: "Standard ISO 10816-3 Class II Rigid Machinery limits."
  },
  {
    assetId: "pump-a-de-h",
    assetName: "Boiler Feed Pump A (Drive End 1H)",
    warningVib: 2.5,
    criticalVib: 4.2,
    warningTemp: 70.0,
    criticalTemp: 85.0,
    customNotes: "High critical feed pump; tighter tolerance configured."
  },
  {
    assetId: "motor-b-de-r",
    assetName: "Main Induction Motor B (Inboard 1R)",
    warningVib: 2.8,
    criticalVib: 4.5,
    warningTemp: 75.0,
    criticalTemp: 90.0,
    customNotes: "Standard 4-pole motor baseline."
  },
  {
    assetId: "fan-204-brg1-h",
    assetName: "Cooling Tower Fan 204 (Brg 1H)",
    warningVib: 3.2,
    criticalVib: 5.0,
    warningTemp: 80.0,
    criticalTemp: 95.0,
    customNotes: "Flexible structure allowance."
  },
  {
    assetId: "gearbox-302-hss-h",
    assetName: "Extruder Gearbox GB-302 (HSS 1H)",
    warningVib: 3.0,
    criticalVib: 4.8,
    warningTemp: 80.0,
    criticalTemp: 95.0,
    customNotes: "High mesh gear frequency tolerances."
  }
];

const INITIAL_ACTIVE_ALERTS: ActiveAlert[] = [
  {
    id: "ALT-8092",
    assetName: "Extruder Gearbox GB-302",
    assetId: "gearbox-302-hss-h",
    location: "Polymer Line 3 — Bay C",
    alertType: "Severe Gear Mesh Vibration & Tooth Pitting",
    severity: "critical",
    timeTriggered: "14 mins ago",
    timestamp: "2026-07-27 08:42 AM",
    currentValue: 5.85,
    thresholdLimit: 4.50,
    unit: "mm/s RMS",
    status: "active"
  },
  {
    id: "ALT-8088",
    assetName: "Boiler Feed Pump A (NDE 2V)",
    assetId: "pump-a-nde-v",
    location: "Powerhouse — Floor 1",
    alertType: "Outer Race Bearing Fault Peak (178.2 Hz BPFO)",
    severity: "warning",
    timeTriggered: "48 mins ago",
    timestamp: "2026-07-27 08:08 AM",
    currentValue: 3.45,
    thresholdLimit: 2.80,
    unit: "mm/s RMS",
    status: "active"
  },
  {
    id: "ALT-8075",
    assetName: "Slurry Recirculation Pump P-402",
    assetId: "pump-p-402",
    location: "Chemical Processing — Unit 4",
    alertType: "High Bearing Thermal Overheat",
    severity: "critical",
    timeTriggered: "2 hours ago",
    timestamp: "2026-07-27 06:55 AM",
    currentValue: 92.4,
    thresholdLimit: 90.0,
    unit: "°C",
    status: "active"
  }
];

const INITIAL_HISTORY: AlertHistoryItem[] = [
  {
    id: "ALT-8061",
    date: "2026-07-26 18:22",
    timestamp: "2026-07-26 06:22 PM",
    assetName: "Main Induction Motor B",
    alertType: "Shaft Misalignment (2X Speed Peak)",
    severity: "warning",
    status: "Resolved",
    duration: "42 mins",
    resolvedBy: "Dave Miller (Reliability Tech)"
  },
  {
    id: "ALT-8044",
    date: "2026-07-25 11:05",
    timestamp: "2026-07-25 11:05 AM",
    assetName: "Cooling Tower Fan 204",
    alertType: "Aerodynamic Blade Unbalance (1X Peak)",
    severity: "warning",
    status: "Auto-Cleared",
    duration: "15 mins",
    resolvedBy: "System Auto-Reset"
  },
  {
    id: "ALT-8012",
    date: "2026-07-24 03:14",
    timestamp: "2026-07-24 03:14 AM",
    assetName: "Boiler Feed Pump A",
    alertType: "Hydraulic Cavitation Surge",
    severity: "critical",
    status: "Acknowledged",
    duration: "1 hr 10 mins",
    resolvedBy: "Sarah Jenkins (Plant Mgr)"
  },
  {
    id: "ALT-7990",
    date: "2026-07-22 14:30",
    timestamp: "2026-07-22 02:30 PM",
    assetName: "Raw Mill Drive Gearbox",
    alertType: "Lube Oil Pressure Drop",
    severity: "critical",
    status: "Resolved",
    duration: "28 mins",
    resolvedBy: "John Doe (Lead Mech)"
  },
  {
    id: "ALT-7952",
    date: "2026-07-20 09:15",
    timestamp: "2026-07-20 09:15 AM",
    assetName: "Exhaust Blower Fan 101",
    alertType: "Vibration ISO Zone C Threshold Breach",
    severity: "warning",
    status: "Dismissed",
    duration: "5 mins",
    resolvedBy: "Operator Override"
  }
];

const INITIAL_RECIPIENTS: Recipient[] = [
  {
    id: "rec-1",
    name: "Shane Dufrene",
    contact: "shanedufrene1989@gmail.com",
    channel: "both",
    role: "Lead Reliability Engineer",
    active: true
  },
  {
    id: "rec-2",
    name: "Control Room Ops Desk",
    contact: "+1 (555) 019-2834",
    channel: "sms",
    role: "On-Call Operations",
    active: true
  },
  {
    id: "rec-3",
    name: "Plant Maintenance Dispatch",
    contact: "maintenance@motormedicpro.internal",
    channel: "email",
    role: "Work Order Dispatch",
    active: true
  }
];

export default function AlertsControl({ userId }: { userId?: number }) {
  // Navigation View State
  const [activeTab, setActiveTab] = useState<"dashboard" | "history">("dashboard");

  // Active Alerts State
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>(INITIAL_ACTIVE_ALERTS);

  // Threshold Form State
  const [thresholds, setThresholds] = useState<AssetThreshold[]>(DEFAULT_THRESHOLDS);
  const [selectedAssetId, setSelectedAssetId] = useState<string>("all");
  const [warningVibInput, setWarningVibInput] = useState<string>("2.8");
  const [criticalVibInput, setCriticalVibInput] = useState<string>("4.5");
  const [warningTempInput, setWarningTempInput] = useState<string>("75.0");
  const [criticalTempInput, setCriticalTempInput] = useState<string>("90.0");
  const [savingThresholds, setSavingThresholds] = useState<boolean>(false);

  // Notification Preferences State
  const [emailAlerts, setEmailAlerts] = useState<boolean>(true);
  const [smsAlerts, setSmsAlerts] = useState<boolean>(true);
  const [inAppAlerts, setInAppAlerts] = useState<boolean>(true);

  // Recipients State
  const [recipients, setRecipients] = useState<Recipient[]>(INITIAL_RECIPIENTS);
  const [showAddRecipient, setShowAddRecipient] = useState<boolean>(false);
  const [newRecName, setNewRecName] = useState<string>("");
  const [newRecContact, setNewRecContact] = useState<string>("");
  const [newRecRole, setNewRecRole] = useState<string>("Reliability Tech");
  const [newRecChannel, setNewRecChannel] = useState<"email" | "sms" | "both">("email");

  // Toast State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "info" | "warning" } | null>(null);

  // History & Table State
  const [alertHistory, setAlertHistory] = useState<AlertHistoryItem[]>(INITIAL_HISTORY);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [dateRangeFilter, setDateRangeFilter] = useState<string>("30d");

  // Test Notification State
  const [isTestingNotification, setIsTestingNotification] = useState<boolean>(false);

  // Show Toast Helper
  const triggerToast = (text: string, type: "success" | "info" | "warning" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Sync threshold input values when asset selection dropdown changes
  const handleAssetSelectChange = (assetId: string) => {
    setSelectedAssetId(assetId);
    const existing = thresholds.find((t) => t.assetId === assetId) || thresholds[0];
    setWarningVibInput(existing.warningVib.toString());
    setCriticalVibInput(existing.criticalVib.toString());
    setWarningTempInput(existing.warningTemp.toString());
    setCriticalTempInput(existing.criticalTemp.toString());
  };

  // Handle Threshold Save
  const handleSaveThresholds = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingThresholds(true);

    const wVib = parseFloat(warningVibInput) || 2.8;
    const cVib = parseFloat(criticalVibInput) || 4.5;
    const wTemp = parseFloat(warningTempInput) || 75.0;
    const cTemp = parseFloat(criticalTempInput) || 90.0;

    setTimeout(() => {
      setThresholds((prev) => {
        const index = prev.findIndex((t) => t.assetId === selectedAssetId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            warningVib: wVib,
            criticalVib: cVib,
            warningTemp: wTemp,
            criticalTemp: cTemp
          };
          return updated;
        } else {
          const assetObj = DEFAULT_THRESHOLDS.find((t) => t.assetId === selectedAssetId);
          return [
            ...prev,
            {
              assetId: selectedAssetId,
              assetName: assetObj ? assetObj.assetName : selectedAssetId,
              warningVib: wVib,
              criticalVib: cVib,
              warningTemp: wTemp,
              criticalTemp: cTemp
            }
          ];
        }
      });

      setSavingThresholds(false);
      const targetName = DEFAULT_THRESHOLDS.find((t) => t.assetId === selectedAssetId)?.assetName || "Selected Asset";
      triggerToast(`✓ Custom limits saved for ${targetName}: Warning @ ${wVib} mm/s, Critical @ ${cVib} mm/s`, "success");
    }, 600);
  };

  // Handle Preset Selection
  const applyPreset = (presetName: string, wV: number, cV: number, wT: number, cT: number) => {
    setWarningVibInput(wV.toString());
    setCriticalVibInput(cV.toString());
    setWarningTempInput(wT.toString());
    setCriticalTempInput(cT.toString());
    triggerToast(`Applied ${presetName} standards: ${wV}/${cV} mm/s RMS`, "info");
  };

  // Acknowledge Alert Handler
  const handleAcknowledgeAlert = (id: string) => {
    setActiveAlerts((prev) =>
      prev.map((alert) =>
        alert.id === id
          ? {
              ...alert,
              status: "acknowledged",
              acknowledgedBy: "Operator (You)",
              acknowledgedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            }
          : alert
      )
    );

    const alertItem = activeAlerts.find((a) => a.id === id);
    triggerToast(`✓ Alert ${id} (${alertItem?.assetName}) acknowledged by operator`, "success");
  };

  // Dismiss Alert Handler
  const handleDismissAlert = (id: string) => {
    const alertItem = activeAlerts.find((a) => a.id === id);
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));

    // Archive to history
    if (alertItem) {
      const newHistoryItem: AlertHistoryItem = {
        id: alertItem.id,
        date: new Date().toISOString().slice(0, 16).replace("T", " "),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }),
        assetName: alertItem.assetName,
        alertType: alertItem.alertType,
        severity: alertItem.severity,
        status: "Dismissed",
        duration: "Just now",
        resolvedBy: "Operator Dismissal"
      };
      setAlertHistory((prev) => [newHistoryItem, ...prev]);
    }

    triggerToast(`Alert ${id} dismissed and logged to dispatch audit history`, "info");
  };

  // Test Notification Dispatch Handler
  const handleTestNotification = () => {
    setIsTestingNotification(true);
    setTimeout(() => {
      setIsTestingNotification(false);
      const activeChannels = [
        emailAlerts ? "Email" : null,
        smsAlerts ? "SMS" : null,
        inAppAlerts ? "In-App" : null
      ].filter(Boolean).join(", ");

      triggerToast(
        `✓ Test alert dispatched to ${recipients.filter((r) => r.active).length} active recipient(s) via [${activeChannels || "In-App"}]`,
        "success"
      );
    }, 1200);
  };

  // Add Recipient Handler
  const handleAddRecipient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRecName || !newRecContact) {
      triggerToast("Please enter a valid recipient name and email/phone", "warning");
      return;
    }

    const newRec: Recipient = {
      id: `rec-${Date.now()}`,
      name: newRecName,
      contact: newRecContact,
      channel: newRecChannel,
      role: newRecRole,
      active: true
    };

    setRecipients((prev) => [...prev, newRec]);
    setNewRecName("");
    setNewRecContact("");
    setShowAddRecipient(false);
    triggerToast(`✓ Added ${newRecName} to alert dispatch recipients list`, "success");
  };

  // Remove Recipient Handler
  const handleRemoveRecipient = (id: string) => {
    const rec = recipients.find((r) => r.id === id);
    setRecipients((prev) => prev.filter((r) => r.id !== id));
    triggerToast(`Removed ${rec?.name || "recipient"} from notification dispatches`, "info");
  };

  // Filtered Alert History Data
  const filteredHistory = useMemo(() => {
    return alertHistory.filter((item) => {
      // Severity Filter
      if (severityFilter !== "all" && item.severity !== severityFilter) {
        return false;
      }
      // Search Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = item.assetName.toLowerCase().includes(query);
        const matchesType = item.alertType.toLowerCase().includes(query);
        const matchesId = item.id.toLowerCase().includes(query);
        const matchesResolver = item.resolvedBy.toLowerCase().includes(query);
        if (!matchesName && !matchesType && !matchesId && !matchesResolver) return false;
      }
      return true;
    });
  }, [alertHistory, severityFilter, searchQuery]);

  // Export CSV Handler
  const handleExportCSV = () => {
    const headers = ["Alert ID", "Date/Time", "Asset Name", "Alert Type", "Severity", "Status", "Duration", "Resolved By"];
    const rows = filteredHistory.map((item) => [
      item.id,
      `"${item.timestamp}"`,
      `"${item.assetName}"`,
      `"${item.alertType}"`,
      item.severity.toUpperCase(),
      item.status,
      `"${item.duration}"`,
      `"${item.resolvedBy}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `motormedic_alert_history_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    triggerToast("✓ Exported alert audit history to CSV file", "success");
  };

  // Critical & Warning Counts
  const criticalCount = activeAlerts.filter((a) => a.severity === "critical").length;
  const warningCount = activeAlerts.filter((a) => a.severity === "warning").length;

  return (
    <div className="space-y-6 text-slate-100 font-sans max-w-7xl mx-auto" id="alerts-control-module">
      
      {/* ------------------- TOAST NOTIFICATION FLOATER ------------------- */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div className={`px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md flex items-center gap-3 text-xs font-bold ${
            toastMessage.type === "success"
              ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-300"
              : toastMessage.type === "warning"
              ? "bg-amber-950/90 border-amber-500/50 text-amber-300"
              : "bg-slate-900/90 border-cyan-500/50 text-cyan-300"
          }`}>
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* ------------------- MAIN HEADER & NAVIGATION TABS ------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 shadow-inner">
            <Bell className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight font-display flex items-center gap-2">
              Alerts Control Center
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-amber-400">
                Live Dispatch Active
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage vibration limits, active condition alerts, automated dispatches, and audit logs
            </p>
          </div>
        </div>

        {/* View Tabs Toggle */}
        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 shadow-xl">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "dashboard"
                ? "bg-cyan-500 text-slate-950 shadow-lg"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Active Dashboard & Thresholds</span>
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 relative ${
              activeTab === "history"
                ? "bg-cyan-500 text-slate-950 shadow-lg"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Alert History & Logs</span>
            <span className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.2 rounded-full font-mono border border-slate-700">
              {alertHistory.length}
            </span>
          </button>
        </div>
      </div>

      {activeTab === "dashboard" ? (
        <div className="space-y-8 animate-fade-in">
          
          {/* ==================================================================== */}
          {/* 1. ACTIVE ALERTS DASHBOARD (TOP SECTION)                             */}
          {/* ==================================================================== */}
          <div className="space-y-4">
            
            {/* Top Metric Cards Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              {/* Prominent Active Alerts Summary Card */}
              <div className="bg-gradient-to-br from-red-950/40 via-slate-900 to-slate-900 border border-red-500/30 rounded-2xl p-5 shadow-2xl relative overflow-hidden flex items-center justify-between">
                <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-2xl pointer-events-none" />
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-red-300/80 block">Active Condition Alerts</span>
                  <div className="text-3xl font-extrabold text-white font-mono flex items-baseline gap-2">
                    {activeAlerts.length}
                    <span className="text-xs font-bold font-sans text-red-400">
                      ({criticalCount} Critical)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {criticalCount > 0 ? "⚠️ Immediate engineering review required" : "All active conditions manageable"}
                  </p>
                </div>
                <div className="p-3 bg-red-500/20 border border-red-500/40 text-red-400 rounded-2xl shadow-lg">
                  <AlertOctagon className="w-8 h-8 animate-bounce" />
                </div>
              </div>

              {/* Warning Count Card */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90 block">Warning Threshold Breaches</span>
                  <div className="text-3xl font-extrabold text-amber-400 font-mono">
                    {warningCount}
                  </div>
                  <p className="text-[11px] text-slate-400">ISO Zone C vibration elevated</p>
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-2xl">
                  <AlertTriangle className="w-7 h-7" />
                </div>
              </div>

              {/* Monitored Channels Card */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">Monitored Telemetry Channels</span>
                  <div className="text-3xl font-extrabold text-white font-mono">
                    24 / 24
                  </div>
                  <p className="text-[11px] text-slate-400">100% sensor connection healthy</p>
                </div>
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl">
                  <ShieldCheck className="w-7 h-7" />
                </div>
              </div>

            </div>

            {/* Active Alerts List Container */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-400" />
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider font-display">
                    Currently Active Equipment Alerts ({activeAlerts.length})
                  </h2>
                </div>
                {activeAlerts.length > 0 && (
                  <button
                    onClick={() => {
                      setActiveAlerts((prev) =>
                        prev.map((a) => ({ ...a, status: "acknowledged", acknowledgedBy: "Operator (Bulk)" }))
                      );
                      triggerToast("✓ All active alerts acknowledged", "success");
                    }}
                    className="text-[11px] text-slate-400 hover:text-cyan-300 underline font-semibold transition-colors"
                  >
                    Acknowledge All Alerts
                  </button>
                )}
              </div>

              {activeAlerts.length === 0 ? (
                <div className="py-12 text-center space-y-3 bg-slate-950/40 rounded-xl border border-slate-850">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto opacity-80" />
                  <h3 className="text-sm font-bold text-white">No Active Alerts Triggered</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    All monitored machinery parameters are operating smoothly within ISO 10816 Zone A & B baseline limits.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeAlerts.map((alert) => {
                    const isCritical = alert.severity === "critical";
                    const isAcked = alert.status === "acknowledged";

                    return (
                      <div
                        key={alert.id}
                        className={`p-4 rounded-xl border transition-all duration-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                          isCritical
                            ? "bg-red-950/20 border-red-500/40 hover:border-red-500/70"
                            : "bg-amber-950/20 border-amber-500/40 hover:border-amber-500/70"
                        }`}
                      >
                        {/* Alert Left Details */}
                        <div className="flex items-start gap-3.5">
                          <div className={`p-2.5 rounded-xl border mt-0.5 shrink-0 ${
                            isCritical
                              ? "bg-red-500/20 border-red-500/40 text-red-400"
                              : "bg-amber-500/20 border-amber-500/40 text-amber-400"
                          }`}>
                            {isCritical ? <AlertOctagon className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                          </div>

                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-white font-display">
                                {alert.assetName}
                              </span>
                              
                              {/* Severity Badge */}
                              <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                                isCritical
                                  ? "bg-red-500/15 border-red-500/40 text-red-300"
                                  : "bg-amber-500/15 border-amber-500/40 text-amber-300"
                              }`}>
                                {alert.severity}
                              </span>

                              {/* Acknowledged Badge */}
                              {isAcked && (
                                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Acknowledged
                                </span>
                              )}

                              <span className="text-[10px] text-slate-500 font-mono">
                                ID: {alert.id}
                              </span>
                            </div>

                            <p className="text-xs text-slate-200 font-semibold">
                              {alert.alertType}
                            </p>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 pt-0.5">
                              <span>Location: <strong className="text-slate-300">{alert.location}</strong></span>
                              <span>Triggered: <strong className="text-slate-300">{alert.timeTriggered}</strong> ({alert.timestamp})</span>
                              <span>
                                Reading: <strong className="text-amber-300 font-mono">{alert.currentValue} {alert.unit}</strong> (Limit: {alert.thresholdLimit} {alert.unit})
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right Action Buttons */}
                        <div className="flex items-center gap-2.5 shrink-0 self-end lg:self-center">
                          {!isAcked ? (
                            <button
                              onClick={() => handleAcknowledgeAlert(alert.id)}
                              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 hover:text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                            >
                              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                              <span>Acknowledge</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-cyan-400/90 font-mono bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
                              Acked by {alert.acknowledgedBy}
                            </span>
                          )}

                          <button
                            onClick={() => handleDismissAlert(alert.id)}
                            className="px-3.5 py-2 bg-slate-800/80 hover:bg-red-500/20 border border-slate-700 hover:border-red-500/40 text-slate-300 hover:text-red-300 font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                          >
                            <X className="w-4 h-4" />
                            <span>Dismiss</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* ==================================================================== */}
          {/* 2. THRESHOLD CONFIGURATION (MIDDLE SECTION)                          */}
          {/* ==================================================================== */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white font-display tracking-tight">
                    Custom Vibration & Thermal Threshold Limits
                  </h2>
                  <p className="text-xs text-slate-400">
                    Set ISO 10816 velocity bounds (mm/s RMS) and temperature alarms for specific machinery assets
                  </p>
                </div>
              </div>

              {/* ISO Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Presets:</span>
                <button
                  onClick={() => applyPreset("ISO Class II", 2.8, 4.5, 75, 90)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-semibold rounded-lg transition-colors"
                >
                  Class II (Default)
                </button>
                <button
                  onClick={() => applyPreset("ISO Class III (Rigid)", 3.5, 7.1, 80, 95)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-semibold rounded-lg transition-colors"
                >
                  Class III (Heavy)
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveThresholds} className="space-y-6">
              
              {/* Asset Dropdown Selector */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                  <span>Target Equipment / Group</span>
                  <span className="text-cyan-400 text-[10px] font-mono">ISO 10816-3 Configured</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedAssetId}
                    onChange={(e) => handleAssetSelectChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-100 font-semibold text-xs rounded-xl p-3 focus:outline-none focus:border-cyan-400 transition-colors cursor-pointer appearance-none pr-10"
                  >
                    {DEFAULT_THRESHOLDS.map((asset) => (
                      <option key={asset.assetId} value={asset.assetId}>
                        {asset.assetName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                </div>
              </div>

              {/* Threshold Fields Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* Warning Vibration Field */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <label className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    Warning Vibration (mm/s RMS)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="20.0"
                    value={warningVibInput}
                    onChange={(e) => setWarningVibInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-750 text-white font-mono text-sm font-bold rounded-lg p-2.5 focus:border-amber-400 focus:outline-none"
                    placeholder="2.8"
                  />
                  <p className="text-[10px] text-slate-400">Triggers ISO Zone C Warning status</p>
                </div>

                {/* Critical Vibration Field */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <label className="text-[10px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
                    Critical Vibration (mm/s RMS)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.0"
                    max="50.0"
                    value={criticalVibInput}
                    onChange={(e) => setCriticalVibInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-750 text-white font-mono text-sm font-bold rounded-lg p-2.5 focus:border-red-400 focus:outline-none"
                    placeholder="4.5"
                  />
                  <p className="text-[10px] text-slate-400">Triggers ISO Zone D Critical alarm</p>
                </div>

                {/* Warning Temperature Field */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <label className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-amber-400" />
                    Warning Thermal (°C)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={warningTempInput}
                    onChange={(e) => setWarningTempInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-750 text-white font-mono text-sm font-bold rounded-lg p-2.5 focus:border-amber-400 focus:outline-none"
                    placeholder="75.0"
                  />
                  <p className="text-[10px] text-slate-400">Bearing thermal warning point</p>
                </div>

                {/* Critical Temperature Field */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <label className="text-[10px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                    Critical Thermal (°C)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={criticalTempInput}
                    onChange={(e) => setCriticalTempInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-750 text-white font-mono text-sm font-bold rounded-lg p-2.5 focus:border-red-400 focus:outline-none"
                    placeholder="90.0"
                  />
                  <p className="text-[10px] text-slate-400">Trips urgent thermal dispatch</p>
                </div>

              </div>

              {/* Dynamic ISO Visual Bar Indicator */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                  <span>Visual ISO 10816 Zone Spectrum Preview</span>
                  <span className="font-mono text-cyan-400">0.0 - 10.0 mm/s</span>
                </div>
                
                <div className="h-4 w-full rounded-full bg-slate-900 overflow-hidden flex border border-slate-800 relative">
                  {/* Zone A/B Good */}
                  <div 
                    style={{ width: `${Math.min(100, (parseFloat(warningVibInput || "2.8") / 10.0) * 100)}%` }} 
                    className="bg-emerald-500/40 border-r border-emerald-400 flex items-center justify-center text-[9px] font-bold text-emerald-200"
                  >
                    Good (&lt;{warningVibInput})
                  </div>

                  {/* Zone C Warning */}
                  <div 
                    style={{ width: `${Math.max(0, ((parseFloat(criticalVibInput || "4.5") - parseFloat(warningVibInput || "2.8")) / 10.0) * 100)}%` }} 
                    className="bg-amber-500/40 border-r border-amber-400 flex items-center justify-center text-[9px] font-bold text-amber-200"
                  >
                    Warning ({warningVibInput} - {criticalVibInput})
                  </div>

                  {/* Zone D Danger */}
                  <div 
                    className="flex-1 bg-red-500/40 flex items-center justify-center text-[9px] font-bold text-red-200"
                  >
                    Critical Danger (&gt;{criticalVibInput})
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingThresholds}
                  className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-xl transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                >
                  {savingThresholds ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Save Custom Threshold Limits</span>
                </button>
              </div>

            </form>
          </div>

          {/* ==================================================================== */}
          {/* 3. NOTIFICATION PREFERENCES (BOTTOM SECTION)                         */}
          {/* ==================================================================== */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white font-display tracking-tight">
                    Notification Preferences & Dispatch Channels
                  </h2>
                  <p className="text-xs text-slate-400">
                    Configure real-time alert routing, dispatch channels, and recipient lists
                  </p>
                </div>
              </div>

              {/* Test Notification Button */}
              <button
                type="button"
                onClick={handleTestNotification}
                disabled={isTestingNotification}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 disabled:opacity-50"
              >
                {isTestingNotification ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                ) : (
                  <Send className="w-4 h-4 text-amber-400" />
                )}
                <span>Test Notification Dispatch</span>
              </button>
            </div>

            {/* Notification Channel Toggles Grid (Tablet Friendly Large Toggles) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Email Alerts Toggle */}
              <div 
                onClick={() => setEmailAlerts(!emailAlerts)}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                  emailAlerts
                    ? "bg-cyan-950/20 border-cyan-500/40 text-slate-100"
                    : "bg-slate-950 border-slate-800 text-slate-400"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Mail className={`w-5 h-5 ${emailAlerts ? "text-cyan-400" : "text-slate-500"}`} />
                  <div>
                    <h3 className="text-xs font-bold text-white">Email Dispatches</h3>
                    <p className="text-[10px] text-slate-400">Instant email on condition alert</p>
                  </div>
                </div>
                <div className="text-cyan-400">
                  {emailAlerts ? <ToggleRight className="w-8 h-8 text-cyan-400" /> : <ToggleLeft className="w-8 h-8 text-slate-600" />}
                </div>
              </div>

              {/* SMS Alerts Toggle */}
              <div 
                onClick={() => setSmsAlerts(!smsAlerts)}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                  smsAlerts
                    ? "bg-cyan-950/20 border-cyan-500/40 text-slate-100"
                    : "bg-slate-950 border-slate-800 text-slate-400"
                }`}
              >
                <div className="flex items-center gap-3">
                  <MessageSquare className={`w-5 h-5 ${smsAlerts ? "text-cyan-400" : "text-slate-500"}`} />
                  <div>
                    <h3 className="text-xs font-bold text-white">SMS Text Dispatches</h3>
                    <p className="text-[10px] text-slate-400">Urgent text for Critical alerts</p>
                  </div>
                </div>
                <div className="text-cyan-400">
                  {smsAlerts ? <ToggleRight className="w-8 h-8 text-cyan-400" /> : <ToggleLeft className="w-8 h-8 text-slate-600" />}
                </div>
              </div>

              {/* In-App Notifications Toggle */}
              <div 
                onClick={() => setInAppAlerts(!inAppAlerts)}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                  inAppAlerts
                    ? "bg-cyan-950/20 border-cyan-500/40 text-slate-100"
                    : "bg-slate-950 border-slate-800 text-slate-400"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Bell className={`w-5 h-5 ${inAppAlerts ? "text-cyan-400" : "text-slate-500"}`} />
                  <div>
                    <h3 className="text-xs font-bold text-white">In-App Banners</h3>
                    <p className="text-[10px] text-slate-400">Real-time modal & sound chime</p>
                  </div>
                </div>
                <div className="text-cyan-400">
                  {inAppAlerts ? <ToggleRight className="w-8 h-8 text-cyan-400" /> : <ToggleLeft className="w-8 h-8 text-slate-600" />}
                </div>
              </div>

            </div>

            {/* Alert Recipients Management */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-display">
                    Alert Recipients List ({recipients.length})
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddRecipient(true)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-400 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add Recipient</span>
                </button>
              </div>

              {/* Recipients Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {recipients.map((rec) => (
                  <div key={rec.id} className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 flex items-center justify-between gap-2">
                    <div className="space-y-0.5 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white truncate">{rec.name}</span>
                        <span className="text-[9px] px-1.5 py-0.2 bg-slate-800 text-cyan-300 font-mono rounded border border-slate-700">
                          {rec.channel.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono truncate">{rec.contact}</p>
                      <p className="text-[10px] text-slate-500">{rec.role}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveRecipient(rec.id)}
                      className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-900 transition-colors shrink-0"
                      title="Remove recipient"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Recipient Form Modal */}
              {showAddRecipient && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 relative">
                    <button
                      type="button"
                      onClick={() => setShowAddRecipient(false)}
                      className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800"
                    >
                      <X className="w-4 h-4" />
                    </button>

                    <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                      <UserPlus className="w-5 h-5 text-cyan-400" />
                      Add Alert Recipient
                    </h3>

                    <form onSubmit={handleAddRecipient} className="space-y-3 text-xs">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Full Name *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. John Doe"
                          value={newRecName}
                          onChange={(e) => setNewRecName(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl p-2.5 focus:border-cyan-400 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Email Address or Mobile Phone Number *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. jdoe@plant.com or +1 555-0192"
                          value={newRecContact}
                          onChange={(e) => setNewRecContact(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 text-white font-mono rounded-xl p-2.5 focus:border-cyan-400 focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Dispatch Channel
                          </label>
                          <select
                            value={newRecChannel}
                            onChange={(e) => setNewRecChannel(e.target.value as any)}
                            className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl p-2.5 focus:border-cyan-400 focus:outline-none"
                          >
                            <option value="email">Email Only</option>
                            <option value="sms">SMS Text Only</option>
                            <option value="both">Both Email & SMS</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Role / Department
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Reliability Tech"
                            value={newRecRole}
                            onChange={(e) => setNewRecRole(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl p-2.5 focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg mt-2"
                      >
                        Save Recipient
                      </button>
                    </form>
                  </div>
                </div>
              )}

            </div>

          </div>

        </div>
      ) : (
        /* ==================================================================== */
        /* 4. ALERT HISTORY (TAB OR SEPARATE VIEW)                               */
        /* ==================================================================== */
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 animate-fade-in">
          
          {/* Header & Controls Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h2 className="text-base font-bold text-white font-display tracking-tight flex items-center gap-2">
                <Clock className="w-5 h-5 text-cyan-400" />
                Alert Dispatch Audit History Log
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Historical record of all condition breaches, dispatches, and operator resolutions
              </p>
            </div>

            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition-all active:scale-95 shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Export History CSV</span>
            </button>
          </div>

          {/* Filters Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
            
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                placeholder="Search asset, alert type, ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>

            {/* Severity Filter */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Severity:</span>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none focus:border-cyan-400 cursor-pointer"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical Only</option>
                <option value="warning">Warning Only</option>
              </select>
            </div>

            {/* Date Range Filter */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Range:</span>
              <select
                value={dateRangeFilter}
                onChange={(e) => setDateRangeFilter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none focus:border-cyan-400 cursor-pointer"
              >
                <option value="all">All Time</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
            </div>

          </div>

          {/* Alert History Data Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-800">
                  <th className="p-3">Alert ID / Date</th>
                  <th className="p-3">Asset Name</th>
                  <th className="p-3">Alert Condition</th>
                  <th className="p-3">Severity</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Resolved / Dismissed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-900/60 font-mono">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500 font-sans">
                      No alert audit records match current filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-white">{item.id}</div>
                        <div className="text-[10px] text-slate-400">{item.timestamp}</div>
                      </td>

                      <td className="p-3 font-sans font-semibold text-slate-200">
                        {item.assetName}
                      </td>

                      <td className="p-3 font-sans text-slate-300">
                        {item.alertType}
                      </td>

                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-sans uppercase ${
                          item.severity === "critical"
                            ? "bg-red-500/15 text-red-400 border border-red-500/30"
                            : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        }`}>
                          {item.severity}
                        </span>
                      </td>

                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-sans ${
                          item.status === "Resolved"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : item.status === "Acknowledged"
                            ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                            : "bg-slate-800 text-slate-400 border border-slate-700"
                        }`}>
                          {item.status}
                        </span>
                      </td>

                      <td className="p-3 font-sans text-slate-300 text-[11px]">
                        <div>{item.resolvedBy}</div>
                        <div className="text-[10px] text-slate-500 font-mono">Duration: {item.duration}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
            <span>Showing {filteredHistory.length} of {alertHistory.length} recorded alert logs</span>
            <span>Audit trail compliant with ISO 10816 condition logging</span>
          </div>

        </div>
      )}

    </div>
  );
}
