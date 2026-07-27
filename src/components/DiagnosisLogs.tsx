import React, { useState, useMemo } from "react";
import { SavedReport } from "../types";
import { 
  Calendar, Search, Filter, Trash2, FileText, ChevronRight, AlertCircle, AlertTriangle, Wrench, 
  ShieldAlert, Activity, CheckCircle2, XCircle, Download, Share2, Plus, RefreshCw, 
  ChevronDown, ChevronUp, Sparkles, Layers, Sliders, CheckSquare, Square, Eye, 
  Clock, ArrowUpDown, ShieldCheck, Mail, Send, Check, AlertOctagon, BarChart2, 
  PieChart, Settings, ExternalLink, Printer, User, Zap, Hash, X
} from "lucide-react";

export interface LogEntry {
  id: string;
  timestamp: string;
  assetName: string;
  assetId: string;
  serialNumber: string;
  assetType: "Motor" | "Pump" | "Gearbox" | "Fan" | "Compressor" | "Extruder";
  diagnosticType: "Vibration FFT" | "Ultrasound" | "Thermography" | "Multi-Tech AI";
  status: "Completed" | "Failed" | "In Review";
  healthScore: number; // 0 - 100
  severity: "Healthy" | "Warning" | "Critical";
  keyFindings: string;
  reviewed: boolean;
  operator: string;
  aiSummary: string;
  vibrationPoints: { point: string; value: number; unit: string; isoLimit: number; status: "Good" | "Warning" | "Critical" }[];
  faultFrequencies: { frequencyHz: number; peakVal: string; faultType: string; severity: "Low" | "Medium" | "High" | "Severe" }[];
  recommendedActions: { priority: "P1 - Urgent" | "P2 - Planned" | "P3 - Routine"; action: string; timeframe: string }[];
}

const INITIAL_MOCK_LOGS: LogEntry[] = [
  {
    id: "DIAG-2026-0891",
    timestamp: "2026-07-27 08:30 AM",
    assetName: "Boiler Feed Pump A",
    assetId: "pump-feed-01",
    serialNumber: "BFP-8842-X",
    assetType: "Pump",
    diagnosticType: "Vibration FFT",
    status: "Completed",
    healthScore: 42,
    severity: "Critical",
    keyFindings: "Severe 178.2 Hz Outer Race Bearing Peak (BPFO). Lubrication Breakdown.",
    reviewed: false,
    operator: "Shane Dufrene",
    aiSummary: "FFT spectral decomposition reveals high-amplitude impacts at 178.2 Hz corresponding to SKF 6314 outer race ball pass frequency. Peak g-level reached 4.8g Peak-to-Peak in horizontal axis. Immediate bearing flush and replacement recommended within 72 hours.",
    vibrationPoints: [
      { point: "1H (DE Horizontal)", value: 5.85, unit: "mm/s RMS", isoLimit: 4.5, status: "Critical" },
      { point: "1V (DE Vertical)", value: 3.20, unit: "mm/s RMS", isoLimit: 2.8, status: "Warning" },
      { point: "2H (NDE Horizontal)", value: 2.10, unit: "mm/s RMS", isoLimit: 2.8, status: "Good" },
      { point: "2A (DE Axial)", value: 1.85, unit: "mm/s RMS", isoLimit: 2.8, status: "Good" }
    ],
    faultFrequencies: [
      { frequencyHz: 178.2, peakVal: "4.82 g Peak", faultType: "BPFO (Outer Race Defect)", severity: "Severe" },
      { frequencyHz: 356.4, peakVal: "1.95 g Peak", faultType: "2X BPFO Harmonic", severity: "High" },
      { frequencyHz: 29.8, peakVal: "2.10 mm/s", faultType: "1X Running Speed", severity: "Medium" }
    ],
    recommendedActions: [
      { priority: "P1 - Urgent", action: "Perform grease analysis and schedule DE bearing SKF 6314 replacement during upcoming maintenance window.", timeframe: "Within 72 Hours" },
      { priority: "P2 - Planned", action: "Re-align pump to driver using laser alignment tool post-bearing installation.", timeframe: "Next Outage" },
      { priority: "P3 - Routine", action: "Re-calibrate 4-20mA online vibration transmitter.", timeframe: "30 Days" }
    ]
  },
  {
    id: "DIAG-2026-0885",
    timestamp: "2026-07-26 04:15 PM",
    assetName: "Extruder Gearbox GB-302",
    assetId: "gearbox-gb-302",
    serialNumber: "GBX-9901-C",
    assetType: "Gearbox",
    diagnosticType: "Multi-Tech AI",
    status: "Completed",
    healthScore: 58,
    severity: "Critical",
    keyFindings: "Gear Mesh Frequency (GMF) sidebands elevated + Oil Temp 88°C.",
    reviewed: true,
    operator: "Dave Miller",
    aiSummary: "Combined vibration and thermal telemetry indicates progressive gear tooth pitting on the intermediate pinions. GMF peaks at 420 Hz with 1X running speed sidebands.",
    vibrationPoints: [
      { point: "HSS 1H (Input Shaft)", value: 4.80, unit: "mm/s RMS", isoLimit: 4.5, status: "Critical" },
      { point: "ISS 2H (Intermediate)", value: 3.90, unit: "mm/s RMS", isoLimit: 2.8, status: "Warning" },
      { point: "LSS 3V (Output Shaft)", value: 2.40, unit: "mm/s RMS", isoLimit: 2.8, status: "Good" }
    ],
    faultFrequencies: [
      { frequencyHz: 420.0, peakVal: "3.80 mm/s", faultType: "GMF (Gear Mesh Frequency)", severity: "High" },
      { frequencyHz: 840.0, peakVal: "1.60 mm/s", faultType: "2X GMF Harmonic", severity: "Medium" }
    ],
    recommendedActions: [
      { priority: "P1 - Urgent", action: "Inspect gear teeth via optical borescope port.", timeframe: "24-48 Hours" },
      { priority: "P2 - Planned", action: "Filter gearbox lube oil and check particle count (ISO 4406).", timeframe: "7 Days" }
    ]
  },
  {
    id: "DIAG-2026-0870",
    timestamp: "2026-07-25 11:10 AM",
    assetName: "Main Induction Motor B",
    assetId: "motor-ind-02",
    serialNumber: "MTR-5520-A",
    assetType: "Motor",
    diagnosticType: "Vibration FFT",
    status: "Completed",
    healthScore: 76,
    severity: "Warning",
    keyFindings: "Moderate 2X Shaft Misalignment & Phase Angular Offset.",
    reviewed: false,
    operator: "Sarah Jenkins",
    aiSummary: "Dominant 2X running speed peak (59.6 Hz) observed in axial and radial directions. Phase angle measurements confirm 180° angular offset across rigid coupling.",
    vibrationPoints: [
      { point: "DE Axial", value: 3.45, unit: "mm/s RMS", isoLimit: 2.8, status: "Warning" },
      { point: "DE Horizontal", value: 2.65, unit: "mm/s RMS", isoLimit: 2.8, status: "Good" },
      { point: "NDE Horizontal", value: 1.90, unit: "mm/s RMS", isoLimit: 2.8, status: "Good" }
    ],
    faultFrequencies: [
      { frequencyHz: 59.6, peakVal: "3.20 mm/s", faultType: "2X Speed (Angular Misalignment)", severity: "Medium" },
      { frequencyHz: 29.8, peakVal: "1.80 mm/s", faultType: "1X Speed (Unbalance component)", severity: "Low" }
    ],
    recommendedActions: [
      { priority: "P2 - Planned", action: "Schedule precision laser alignment on motor-to-driven unit coupling.", timeframe: "Next Maintenance Window" }
    ]
  },
  {
    id: "DIAG-2026-0862",
    timestamp: "2026-07-24 02:45 PM",
    assetName: "Cooling Tower Fan 204",
    assetId: "fan-ct-204",
    serialNumber: "FAN-1044-B",
    assetType: "Fan",
    diagnosticType: "Ultrasound",
    status: "Completed",
    healthScore: 92,
    severity: "Healthy",
    keyFindings: "Smooth acoustic profile. Minimal friction or turbulence.",
    reviewed: true,
    operator: "Alex Rivera",
    aiSummary: "Ultrasound decibel levels measured at 14 dBuV (within 2 dBuV of baseline). No early bearing micro-faulting or aerodynamic blade stall detected.",
    vibrationPoints: [
      { point: "Brg 1H", value: 1.15, unit: "mm/s RMS", isoLimit: 2.8, status: "Good" },
      { point: "Brg 2V", value: 0.95, unit: "mm/s RMS", isoLimit: 2.8, status: "Good" }
    ],
    faultFrequencies: [],
    recommendedActions: [
      { priority: "P3 - Routine", action: "Continue standard bi-monthly ultrasound screening.", timeframe: "60 Days" }
    ]
  },
  {
    id: "DIAG-2026-0850",
    timestamp: "2026-07-23 09:20 AM",
    assetName: "Air Compressor C-101",
    assetId: "comp-air-101",
    serialNumber: "CMP-7712-Z",
    assetType: "Compressor",
    diagnosticType: "Thermography",
    status: "Completed",
    healthScore: 88,
    severity: "Healthy",
    keyFindings: "Normal thermal gradient. Discharge valve delta T = 12°C.",
    reviewed: true,
    operator: "Shane Dufrene",
    aiSummary: "IR thermogram indicates uniform heat dissipation across 1st and 2nd stage compression cylinders. No intercooler bypass or leaking discharge valves.",
    vibrationPoints: [
      { point: "DE Radial", value: 1.40, unit: "mm/s RMS", isoLimit: 2.8, status: "Good" }
    ],
    faultFrequencies: [],
    recommendedActions: [
      { priority: "P3 - Routine", action: "Verify oil filter differential pressure indicator.", timeframe: "30 Days" }
    ]
  },
  {
    id: "DIAG-2026-0841",
    timestamp: "2026-07-22 01:05 PM",
    assetName: "Slurry Recirculation Pump P-402",
    assetId: "pump-slurry-402",
    serialNumber: "PMP-3319-K",
    assetType: "Pump",
    diagnosticType: "Multi-Tech AI",
    status: "Completed",
    healthScore: 35,
    severity: "Critical",
    keyFindings: "High Hydraulic Cavitation Impacting + Thermal Spike (92.4°C).",
    reviewed: false,
    operator: "Dave Miller",
    aiSummary: "High frequency random noise floor elevation (2 kHz - 10 kHz) accompanied by transient pressure pulsations. Suction NPSH margin insufficient causing severe impellor erosion.",
    vibrationPoints: [
      { point: "Suction Casing 1H", value: 6.20, unit: "mm/s RMS", isoLimit: 4.5, status: "Critical" },
      { point: "DE Bearing 2V", value: 4.90, unit: "mm/s RMS", isoLimit: 2.8, status: "Critical" }
    ],
    faultFrequencies: [
      { frequencyHz: 3200.0, peakVal: "6.50 g Peak", faultType: "Hydraulic Cavitation Broadband Noise", severity: "Severe" }
    ],
    recommendedActions: [
      { priority: "P1 - Urgent", action: "Increase suction head pressure and clear inlet strainer restriction.", timeframe: "Immediate" },
      { priority: "P2 - Planned", action: "Inspect impeller wet-end for erosion pitting.", timeframe: "Within 48 Hours" }
    ]
  },
  {
    id: "DIAG-2026-0830",
    timestamp: "2026-07-21 10:40 AM",
    assetName: "Exhaust Blower Fan 101",
    assetId: "fan-ex-101",
    serialNumber: "FAN-0021-M",
    assetType: "Fan",
    diagnosticType: "Vibration FFT",
    status: "Failed",
    healthScore: 0,
    severity: "Critical",
    keyFindings: "Sensor Signal Disconnect / Open Circuit detected on Axis 2.",
    reviewed: false,
    operator: "System Auto-Diagnostic",
    aiSummary: "Automated scan failed due to loss of sensor bias voltage (IEPE constant current drop). Signal saturated at +24V DC.",
    vibrationPoints: [],
    faultFrequencies: [],
    recommendedActions: [
      { priority: "P1 - Urgent", action: "Inspect accelerometer cable connections and BNC junction box ground.", timeframe: "Immediate" }
    ]
  },
  {
    id: "DIAG-2026-0818",
    timestamp: "2026-07-20 03:30 PM",
    assetName: "Hydraulic Power Unit HPU-01",
    assetId: "hpu-unit-01",
    serialNumber: "HPU-9081-R",
    assetType: "Pump",
    diagnosticType: "Vibration FFT",
    status: "Completed",
    healthScore: 95,
    severity: "Healthy",
    keyFindings: "Pristine operation. All vibration components under 0.8 mm/s.",
    reviewed: true,
    operator: "Sarah Jenkins",
    aiSummary: "Excellent operating baseline across all 6 measurement locations. Piston pump frequency harmonics clean and stable.",
    vibrationPoints: [
      { point: "Pump DE 1H", value: 0.65, unit: "mm/s RMS", isoLimit: 2.8, status: "Good" },
      { point: "Motor DE 2V", value: 0.72, unit: "mm/s RMS", isoLimit: 2.8, status: "Good" }
    ],
    faultFrequencies: [],
    recommendedActions: [
      { priority: "P3 - Routine", action: "Standard routine quarter scan.", timeframe: "90 Days" }
    ]
  }
];

interface DiagnosisLogsProps {
  reports?: SavedReport[];
  onSelectReport?: (report: SavedReport) => void;
  onDeleteReport?: (id: string) => void;
  onStartDiagnosis?: () => void;
}

export default function DiagnosisLogs({
  reports = [],
  onSelectReport,
  onDeleteReport,
  onStartDiagnosis
}: DiagnosisLogsProps) {
  
  // Primary Logs Dataset State
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_MOCK_LOGS);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [assetTypeFilter, setAssetTypeFilter] = useState<string>("All");
  const [severityFilter, setSeverityFilter] = useState<string>("All");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [activePreset, setActivePreset] = useState<string>("default");

  // Selection & Bulk Actions
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  
  // Expanded Row State (Inline)
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Detailed Modal State
  const [activeModalLog, setActiveModalLog] = useState<LogEntry | null>(null);

  // Schedule Modal & Share Modal
  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [shareEmail, setShareEmail] = useState<string>("shanedufrene1989@gmail.com");
  const [shareSuccess, setShareSuccess] = useState<boolean>(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Toast Notification
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "info" | "warning" } | null>(null);

  const showToast = (text: string, type: "success" | "info" | "warning" = "success") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Convert saved reports prop into LogEntry format if user has real saved reports
  const mergedLogs = useMemo(() => {
    if (!reports || reports.length === 0) return logs;

    const convertedReports: LogEntry[] = reports.map((r) => {
      const severityMap: Record<string, "Healthy" | "Warning" | "Critical"> = {
        Critical: "Critical",
        High: "Critical",
        Medium: "Warning",
        Low: "Healthy"
      };

      const data = r.data as any;
      const sev = severityMap[data?.manager_summary?.severity || "Low"] || "Healthy";
      const score = sev === "Critical" ? 45 : sev === "Warning" ? 72 : 94;

      return {
        id: r.id,
        timestamp: r.date,
        assetName: data?.manager_summary?.primary_fault ? `Asset (${r.category})` : "Monitored Machinery",
        assetId: `asset-${r.id.slice(-4)}`,
        serialNumber: r.fileName ? r.fileName.replace(".txt", "") : "SN-UNKNOWN",
        assetType: r.category === "Electrical" ? "Motor" : "Pump",
        diagnosticType: "Multi-Tech AI",
        status: "Completed",
        healthScore: score,
        severity: sev,
        keyFindings: data?.manager_summary?.summary || r.symptoms,
        reviewed: true,
        operator: "Reliability Engineer",
        aiSummary: data?.manager_summary?.technical_narrative || r.symptoms,
        vibrationPoints: [
          { point: "Main Axis 1H", value: 3.2, unit: "mm/s RMS", isoLimit: 2.8, status: sev === "Critical" ? "Critical" : "Good" }
        ],
        faultFrequencies: data?.probable_faults?.map((f: any) => ({
          frequencyHz: 120.0,
          peakVal: "2.8 g",
          faultType: f.fault,
          severity: sev === "Critical" ? "Severe" : "Medium"
        })) || [],
        recommendedActions: data?.recommended_actions?.map((act: any, i: number) => ({
          priority: i === 0 ? "P1 - Urgent" : "P2 - Planned",
          action: act,
          timeframe: i === 0 ? "Immediate" : "7 Days"
        })) || []
      };
    });

    // Combine converted user saved reports with initial mock logs, ensuring unique IDs
    const existingIds = new Set(convertedReports.map((c) => c.id));
    const uniqueMocks = logs.filter((m) => !existingIds.has(m.id));
    return [...convertedReports, ...uniqueMocks];
  }, [reports, logs]);

  // Filtered dataset calculation
  const filteredLogs = useMemo(() => {
    return mergedLogs.filter((log) => {
      // Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = log.assetName.toLowerCase().includes(query);
        const matchId = log.id.toLowerCase().includes(query);
        const matchSerial = log.serialNumber.toLowerCase().includes(query);
        const matchFindings = log.keyFindings.toLowerCase().includes(query);
        const matchOperator = log.operator.toLowerCase().includes(query);
        if (!matchName && !matchId && !matchSerial && !matchFindings && !matchOperator) return false;
      }

      // Asset Type
      if (assetTypeFilter !== "All" && log.assetType !== assetTypeFilter) return false;

      // Severity
      if (severityFilter !== "All") {
        if (severityFilter === "Healthy" && log.healthScore < 80) return false;
        if (severityFilter === "Warning" && (log.healthScore < 60 || log.healthScore >= 80)) return false;
        if (severityFilter === "Critical" && log.healthScore >= 60 && log.status !== "Failed") return false;
        if (severityFilter === "Failed" && log.status !== "Failed") return false;
      }

      // Date Range
      if (fromDate) {
        if (new Date(log.timestamp) < new Date(fromDate)) return false;
      }
      if (toDate) {
        if (new Date(log.timestamp) > new Date(toDate + " 23:59:59")) return false;
      }

      return true;
    });
  }, [mergedLogs, searchQuery, assetTypeFilter, severityFilter, fromDate, toDate]);

  // Paginated dataset calculation
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredLogs.slice(startIndex, startIndex + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;

  // Stats Analytics Calculation
  const totalRuns = mergedLogs.length;
  const avgHealth = Math.round(
    mergedLogs.reduce((acc, curr) => acc + (curr.status === "Failed" ? 0 : curr.healthScore), 0) / (totalRuns || 1)
  );
  const criticalCount = mergedLogs.filter((l) => l.severity === "Critical" || l.healthScore < 60).length;
  const warningCount = mergedLogs.filter((l) => l.severity === "Warning" && l.healthScore >= 60).length;
  const healthyCount = mergedLogs.filter((l) => l.healthScore >= 80).length;

  // Selection Checkbox Logic
  const handleSelectAll = () => {
    if (selectedLogIds.length === paginatedLogs.length) {
      setSelectedLogIds([]);
    } else {
      setSelectedLogIds(paginatedLogs.map((l) => l.id));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    if (selectedLogIds.includes(id)) {
      setSelectedLogIds((prev) => prev.filter((item) => item !== id));
    } else {
      setSelectedLogIds((prev) => [...prev, id]);
    }
  };

  // Bulk Actions
  const handleBulkMarkReviewed = () => {
    setLogs((prev) =>
      prev.map((log) => (selectedLogIds.includes(log.id) ? { ...log, reviewed: true } : log))
    );
    showToast(`✓ Marked ${selectedLogIds.length} diagnostic run(s) as reviewed`, "success");
    setSelectedLogIds([]);
  };

  const handleBulkDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${selectedLogIds.length} diagnostic log(s)?`)) {
      setLogs((prev) => prev.filter((log) => !selectedLogIds.includes(log.id)));
      showToast(`Deleted ${selectedLogIds.length} log entry(ies)`, "info");
      setSelectedLogIds([]);
    }
  };

  const handleBulkExportCSV = () => {
    const selectedData = mergedLogs.filter((l) => selectedLogIds.includes(l.id));
    const headers = ["Diagnostic ID", "Timestamp", "Asset Name", "Asset Type", "Status", "Health Score", "Severity", "Findings", "Operator"];
    const rows = selectedData.map((l) => [
      l.id,
      `"${l.timestamp}"`,
      `"${l.assetName}"`,
      l.assetType,
      l.status,
      l.healthScore,
      l.severity,
      `"${l.keyFindings.replace(/"/g, '""')}"`,
      `"${l.operator}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `motormedic_selected_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`✓ Exported ${selectedData.length} logs to CSV`, "success");
  };

  // Apply Quick Filter Presets
  const handleApplyPreset = (presetKey: string) => {
    setActivePreset(presetKey);
    if (presetKey === "critical_30d") {
      setSeverityFilter("Critical");
      setAssetTypeFilter("All");
      setFromDate("");
      setToDate("");
      showToast("Filter Applied: Critical & Attention Assets", "info");
    } else if (presetKey === "gearboxes") {
      setAssetTypeFilter("Gearbox");
      setSeverityFilter("All");
      showToast("Filter Applied: Gearboxes Only", "info");
    } else if (presetKey === "healthy") {
      setSeverityFilter("Healthy");
      setAssetTypeFilter("All");
      showToast("Filter Applied: Healthy Assets (80-100)", "info");
    } else {
      setSearchQuery("");
      setAssetTypeFilter("All");
      setSeverityFilter("All");
      setFromDate("");
      setToDate("");
      showToast("Cleared all search and category filters", "info");
    }
  };

  // Printable Report Generation
  const handlePrintPDF = () => {
    window.print();
  };

  return (
    <div className="space-y-6 text-slate-100 font-sans max-w-7xl mx-auto print:p-0 print:bg-white print:text-black">
      
      {/* ------------------- TOAST NOTIFICATION ------------------- */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce print:hidden">
          <div className={`px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md flex items-center gap-3 text-xs font-bold ${
            toastMsg.type === "success"
              ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-300"
              : toastMsg.type === "warning"
              ? "bg-amber-950/90 border-amber-500/50 text-amber-300"
              : "bg-slate-900/90 border-cyan-500/50 text-cyan-300"
          }`}>
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{toastMsg.text}</span>
          </div>
        </div>
      )}

      {/* ------------------- TOP HEADER BAR ------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800 print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl text-cyan-400 shadow-inner">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white font-display tracking-tight flex items-center gap-2">
              AI Diagnostic Logs & Vibration Runs
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-cyan-400">
                Category IV Archive
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Historical spectrum analysis, health trends, and automated vibration scan records
            </p>
          </div>
        </div>

        {/* Quick Actions Panel */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={onStartDiagnosis}
            className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition-all active:scale-95 flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            <span>Run New Diagnosis</span>
          </button>

          <button
            onClick={() => setShowScheduleModal(true)}
            className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
          >
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Schedule Auto Scan</span>
          </button>

          <button
            onClick={handleBulkExportCSV}
            className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
            title="Download Complete Archive CSV"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>Export Archive</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 1. VISUAL ANALYTICS SUMMARY (TOP SECTION)                            */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        
        {/* Metric 1: Total Diagnostics Run */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Diagnostics Run</span>
            <div className="text-2xl font-extrabold text-white font-mono flex items-baseline gap-2">
              {totalRuns}
              <span className="text-[11px] font-sans font-bold text-emerald-400">
                +12% mo.
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Complete plant scan log</p>
          </div>
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-2xl">
            <BarChart2 className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 2: Average Health Score */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Average Plant Health</span>
            <div className="text-2xl font-extrabold text-white font-mono flex items-baseline gap-2">
              {avgHealth} <span className="text-xs text-slate-500">/ 100</span>
            </div>
            {/* Health Bar Mini */}
            <div className="w-28 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1 border border-slate-700">
              <div 
                className={`h-full ${avgHealth >= 80 ? "bg-emerald-400" : avgHealth >= 60 ? "bg-amber-400" : "bg-red-400"}`}
                style={{ width: `${avgHealth}%` }}
              />
            </div>
          </div>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 3: Most Common Fault Type */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Top Detected Signature</span>
            <div className="text-sm font-extrabold text-amber-300 font-display truncate max-w-[150px]">
              Bearing Outer Race (BPFO)
            </div>
            <p className="text-[11px] text-slate-400">28% of all fault occurrences</p>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 4: Assets Needing Attention */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Assets Needing Attention</span>
            <div className="text-2xl font-extrabold text-red-400 font-mono flex items-baseline gap-2">
              {criticalCount + warningCount}
              <span className="text-[11px] font-sans font-bold text-slate-400">
                ({criticalCount} Critical)
              </span>
            </div>
            <p className="text-[11px] text-slate-400">ISO Zone C & D breaches</p>
          </div>
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl">
            <AlertOctagon className="w-6 h-6 animate-pulse" />
          </div>
        </div>

      </div>

      {/* Mini Trend & Status Distribution Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 print:hidden">
        
        {/* Diagnostics Activity Trend (2 Cols) */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-850">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-display">
                Diagnostics Activity Spectrum (Last 30 Days)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Daily Runs Baseline</span>
          </div>

          {/* HTML/CSS Bar Graph Visualizer */}
          <div className="h-28 flex items-end justify-between gap-1.5 pt-4 px-2 border-b border-slate-800">
            {[4, 6, 8, 3, 5, 12, 9, 14, 11, 7, 15, 10, 8, 18, 12, 9, 14, 16, 20, 13, 11, 8, 15, 19, 14, 10, 12, 16, 22, 18].map((val, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                {/* Tooltip */}
                <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950 text-cyan-300 text-[9px] font-mono px-1.5 py-0.5 rounded border border-slate-700 pointer-events-none whitespace-nowrap z-10">
                  Day {idx + 1}: {val} scans
                </div>
                <div 
                  className={`w-full rounded-t-sm transition-all duration-300 ${
                    idx === 28 ? "bg-cyan-400 shadow-lg shadow-cyan-500/50" : val > 15 ? "bg-cyan-500/80" : "bg-slate-700 hover:bg-cyan-500/60"
                  }`}
                  style={{ height: `${(val / 22) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>July 1, 2026</span>
            <span>July 15, 2026</span>
            <span>Today (July 27)</span>
          </div>
        </div>

        {/* Health Status Distribution Pie / Bar (1 Col) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-850">
            <PieChart className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-display">
              Health Status Breakdown
            </h3>
          </div>

          <div className="space-y-3 pt-1">
            {/* Healthy Row */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Healthy (80-100)
                </span>
                <span className="font-mono text-slate-200">{healthyCount} ({Math.round((healthyCount / totalRuns) * 100)}%)</span>
              </div>
              <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(healthyCount / totalRuns) * 100}%` }} />
              </div>
            </div>

            {/* Warning Row */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-amber-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Warning (60-79)
                </span>
                <span className="font-mono text-slate-200">{warningCount} ({Math.round((warningCount / totalRuns) * 100)}%)</span>
              </div>
              <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(warningCount / totalRuns) * 100}%` }} />
              </div>
            </div>

            {/* Critical Row */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-red-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400" /> Critical (0-59)
                </span>
                <span className="font-mono text-slate-200">{criticalCount} ({Math.round((criticalCount / totalRuns) * 100)}%)</span>
              </div>
              <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div className="h-full bg-red-400 rounded-full" style={{ width: `${(criticalCount / totalRuns) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ==================================================================== */}
      {/* 2. ADVANCED FILTERING & SEARCH PANEL                                 */}
      {/* ==================================================================== */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 print:hidden">
        
        {/* Preset Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider font-display">Filter Presets:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleApplyPreset("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activePreset === "all" ? "bg-cyan-500 text-slate-950 shadow-md" : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-white"
              }`}
            >
              All Records ({mergedLogs.length})
            </button>

            <button
              onClick={() => handleApplyPreset("critical_30d")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activePreset === "critical_30d" ? "bg-red-500 text-white shadow-md" : "bg-slate-950 text-red-400 border border-slate-800 hover:bg-red-950/40"
              }`}
            >
              ⚠️ Critical & Attention
            </button>

            <button
              onClick={() => handleApplyPreset("gearboxes")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activePreset === "gearboxes" ? "bg-amber-500 text-slate-950 shadow-md" : "bg-slate-950 text-amber-400 border border-slate-800 hover:bg-amber-950/40"
              }`}
            >
              ⚙️ Gearbox Scans
            </button>

            <button
              onClick={() => handleApplyPreset("healthy")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activePreset === "healthy" ? "bg-emerald-500 text-slate-950 shadow-md" : "bg-slate-950 text-emerald-400 border border-slate-800 hover:bg-emerald-950/40"
              }`}
            >
              ✅ Healthy Baseline
            </button>
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          
          {/* Search Bar (Col 4) */}
          <div className="lg:col-span-4 relative">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search asset, serial #, or diagnostic ID..."
              className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-cyan-400 focus:outline-none rounded-xl pl-10 pr-4 py-2.5 text-xs text-white"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")} 
                className="absolute right-3 top-3 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Asset Type Dropdown (Col 2) */}
          <div className="lg:col-span-2 relative">
            <select
              value={assetTypeFilter}
              onChange={(e) => setAssetTypeFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-cyan-400 text-xs font-semibold text-slate-200 rounded-xl p-2.5 appearance-none focus:outline-none cursor-pointer pr-8"
            >
              <option value="All">All Asset Types</option>
              <option value="Motor">Motors</option>
              <option value="Pump">Pumps</option>
              <option value="Gearbox">Gearboxes</option>
              <option value="Fan">Fans & Blowers</option>
              <option value="Compressor">Compressors</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
          </div>

          {/* Health Status Filter (Col 2) */}
          <div className="lg:col-span-2 relative">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-cyan-400 text-xs font-semibold text-slate-200 rounded-xl p-2.5 appearance-none focus:outline-none cursor-pointer pr-8"
            >
              <option value="All">All Health Statuses</option>
              <option value="Healthy">Healthy (80-100)</option>
              <option value="Warning">Warning (60-79)</option>
              <option value="Critical">Critical (0-59)</option>
              <option value="Failed">Failed Scans</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
          </div>

          {/* From Date (Col 2) */}
          <div className="lg:col-span-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-mono rounded-xl p-2.5 focus:outline-none focus:border-cyan-400"
              placeholder="From Date"
            />
          </div>

          {/* Clear Filters (Col 2) */}
          <div className="lg:col-span-2 flex items-center">
            <button
              onClick={() => handleApplyPreset("clear")}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              <span>Reset Filters</span>
            </button>
          </div>

        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. BULK ACTIONS FLOATING TOOLBAR                                     */}
      {/* ==================================================================== */}
      {selectedLogIds.length > 0 && (
        <div className="bg-cyan-950/90 border border-cyan-500/40 rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in print:hidden">
          <div className="flex items-center gap-3">
            <CheckSquare className="w-5 h-5 text-cyan-400" />
            <span className="text-xs font-bold text-white">
              <strong className="text-cyan-300 font-mono text-sm">{selectedLogIds.length}</strong> log entry(ies) selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkMarkReviewed}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 text-cyan-300 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5 text-cyan-400" />
              <span>Mark Reviewed</span>
            </button>

            <button
              onClick={handleBulkExportCSV}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 text-slate-200 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={handleBulkDelete}
              className="px-3.5 py-1.5 bg-red-950/60 hover:bg-red-900/60 border border-red-500/30 text-red-300 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. MAIN LOGS TABLE GRID & EXPANDABLE ROWS                            */}
      {/* ==================================================================== */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="p-4 w-10 text-center print:hidden">
                  <button onClick={handleSelectAll} className="text-slate-400 hover:text-white">
                    {selectedLogIds.length === paginatedLogs.length && paginatedLogs.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="p-4 font-display">Date / Time</th>
                <th className="p-4 font-display">Asset & Serial #</th>
                <th className="p-4 font-display">Diagnostic Type</th>
                <th className="p-4 font-display text-center">Health Score</th>
                <th className="p-4 font-display">Key Findings</th>
                <th className="p-4 font-display text-right print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 text-xs">
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400 space-y-2">
                    <AlertCircle className="w-10 h-10 text-slate-600 mx-auto" />
                    <p className="font-bold text-white">No Diagnostic Logs Match Criteria</p>
                    <p className="text-xs text-slate-500">Try adjusting your keyword search, asset type, or date filters.</p>
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => {
                  const isSelected = selectedLogIds.includes(log.id);
                  const isExpanded = expandedLogId === log.id;
                  
                  // Score styling
                  const scoreColor =
                    log.status === "Failed"
                      ? "text-red-400 bg-red-950/60 border-red-500/40"
                      : log.healthScore >= 80
                      ? "text-emerald-400 bg-emerald-950/60 border-emerald-500/40"
                      : log.healthScore >= 60
                      ? "text-amber-400 bg-amber-950/60 border-amber-500/40"
                      : "text-red-400 bg-red-950/60 border-red-500/40";

                  return (
                    <React.Fragment key={log.id}>
                      <tr className={`hover:bg-slate-850/60 transition-colors ${isSelected ? "bg-cyan-950/30" : ""}`}>
                        
                        {/* Checkbox */}
                        <td className="p-4 text-center print:hidden">
                          <button onClick={() => handleToggleSelectOne(log.id)} className="text-slate-400 hover:text-white">
                            {isSelected ? <CheckSquare className="w-4 h-4 text-cyan-400" /> : <Square className="w-4 h-4" />}
                          </button>
                        </td>

                        {/* Date / Time */}
                        <td className="p-4 font-mono text-slate-300">
                          <div className="font-bold text-white">{log.timestamp}</div>
                          <div className="text-[10px] text-slate-500 font-mono">ID: {log.id}</div>
                        </td>

                        {/* Asset & Serial */}
                        <td className="p-4">
                          <div className="font-bold text-white font-display text-sm">{log.assetName}</div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                            <span className="px-1.5 py-0.2 bg-slate-800 rounded border border-slate-700 text-cyan-300">
                              {log.assetType}
                            </span>
                            <span>S/N: {log.serialNumber}</span>
                          </div>
                        </td>

                        {/* Diagnostic Type */}
                        <td className="p-4 font-semibold text-slate-300">
                          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 flex items-center gap-1.5 w-fit">
                            <Sparkles className="w-3 h-3 text-cyan-400" />
                            {log.diagnosticType}
                          </span>
                        </td>

                        {/* Health Score Pill */}
                        <td className="p-4 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl font-mono font-extrabold text-xs border ${scoreColor}`}>
                            {log.status === "Failed" ? "FAIL" : `${log.healthScore} / 100`}
                          </span>
                        </td>

                        {/* Key Findings */}
                        <td className="p-4 max-w-xs text-slate-300 truncate font-sans" title={log.keyFindings}>
                          {log.keyFindings}
                        </td>

                        {/* Actions */}
                        <td className="p-4 text-right print:hidden">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                              title={isExpanded ? "Collapse inline view" : "Expand inline view"}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>

                            <button
                              onClick={() => setActiveModalLog(log)}
                              className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-bold text-xs rounded-xl transition-all flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Report</span>
                            </button>
                          </div>
                        </td>

                      </tr>

                      {/* Expandable Inline Row Details */}
                      {isExpanded && (
                        <tr className="bg-slate-950/80 border-b border-slate-800">
                          <td colSpan={7} className="p-5 space-y-4">
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                                <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5 font-display">
                                  <Sparkles className="w-4 h-4" />
                                  AI Diagnostic Executive Technical Summary
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  Inspected by: {log.operator}
                                </span>
                              </div>

                              <p className="text-xs text-slate-200 leading-relaxed font-sans">
                                {log.aiSummary}
                              </p>

                              {/* Vibration Points Mini Preview */}
                              {log.vibrationPoints.length > 0 && (
                                <div className="space-y-1.5 pt-2">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    Spectral Measurement Points:
                                  </span>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                    {log.vibrationPoints.map((vp, idx) => (
                                      <div key={idx} className="bg-slate-950 p-2 rounded-lg border border-slate-800 text-[11px] flex justify-between items-center">
                                        <span className="text-slate-400 font-mono">{vp.point}</span>
                                        <span className={`font-mono font-bold ${vp.status === "Critical" ? "text-red-400" : vp.status === "Warning" ? "text-amber-400" : "text-emerald-400"}`}>
                                          {vp.value} {vp.unit}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="flex justify-end pt-1">
                                <button
                                  onClick={() => setActiveModalLog(log)}
                                  className="text-xs text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 underline"
                                >
                                  Open Full Interactive Spectrum Report <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer Controls */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400 print:hidden">
          <div className="flex items-center gap-2">
            <span>Showing</span>
            <span className="font-bold text-white font-mono">
              {filteredLogs.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </span>
            <span>to</span>
            <span className="font-bold text-white font-mono">
              {Math.min(currentPage * pageSize, filteredLogs.length)}
            </span>
            <span>of</span>
            <span className="font-bold text-white font-mono">{filteredLogs.length}</span>
            <span>diagnostic entries</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Page Size Selector */}
            <div className="flex items-center gap-2">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-slate-900 border border-slate-800 text-white rounded-lg px-2 py-1 focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Page Buttons */}
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 disabled:opacity-40 rounded-lg transition-colors font-bold"
              >
                Prev
              </button>
              <span className="px-2 font-mono text-cyan-400 font-bold">
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 disabled:opacity-40 rounded-lg transition-colors font-bold"
              >
                Next
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* ==================================================================== */}
      {/* 5. DETAILED LOG VIEW MODAL                                           */}
      {/* ==================================================================== */}
      {activeModalLog && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fade-in print:p-0 print:static print:bg-white">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-6 relative max-h-[90vh] overflow-y-auto my-auto print:max-h-none print:shadow-none print:border-none print:bg-white print:text-black">
            
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800 print:border-black">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] font-bold">
                    {activeModalLog.id}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {activeModalLog.timestamp}
                  </span>
                </div>
                <h2 className="text-2xl font-extrabold text-white font-display print:text-black">
                  {activeModalLog.assetName}
                </h2>
                <p className="text-xs text-slate-400 print:text-gray-700">
                  Serial Number: <strong className="text-slate-200 font-mono">{activeModalLog.serialNumber}</strong> | Type: {activeModalLog.assetType}
                </p>
              </div>

              {/* Health Score Badge & Modal Close */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Health Score</span>
                  <span className={`text-2xl font-extrabold font-mono ${
                    activeModalLog.healthScore >= 80 ? "text-emerald-400" : activeModalLog.healthScore >= 60 ? "text-amber-400" : "text-red-400"
                  }`}>
                    {activeModalLog.healthScore} / 100
                  </span>
                </div>

                <button
                  onClick={() => setActiveModalLog(null)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-colors print:hidden"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* AI Technical Narrative Summary */}
            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-850 space-y-2 print:bg-gray-50 print:border-gray-200">
              <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-display flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                AI Generated Diagnostic Synthesis
              </h3>
              <p className="text-xs text-slate-200 leading-relaxed font-sans print:text-black">
                {activeModalLog.aiSummary}
              </p>
            </div>

            {/* Vibration Measurements Table */}
            {activeModalLog.vibrationPoints.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-display flex items-center gap-2 print:text-black">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  Vibration Measurement Points & ISO 10816 Limits
                </h3>

                <div className="bg-slate-950 border border-slate-850 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-900 border-b border-slate-800 text-[10px] font-bold uppercase text-slate-400">
                        <th className="p-3">Measurement Axis</th>
                        <th className="p-3">Measured Value</th>
                        <th className="p-3">ISO Limit</th>
                        <th className="p-3 text-right">Condition Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 font-mono">
                      {activeModalLog.vibrationPoints.map((pt, i) => (
                        <tr key={i} className="hover:bg-slate-900/40">
                          <td className="p-3 font-bold text-white">{pt.point}</td>
                          <td className="p-3 text-cyan-300 font-extrabold">{pt.value} {pt.unit}</td>
                          <td className="p-3 text-slate-400">{pt.isoLimit} {pt.unit}</td>
                          <td className="p-3 text-right">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              pt.status === "Critical" ? "bg-red-500/20 text-red-300 border border-red-500/40" : pt.status === "Warning" ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            }`}>
                              {pt.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Detected Fault Frequencies */}
            {activeModalLog.faultFrequencies.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-display flex items-center gap-2 print:text-black">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Dominant Fault Frequencies & Spectral Peaks
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activeModalLog.faultFrequencies.map((ff, i) => (
                    <div key={i} className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-white block">{ff.faultType}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Frequency: <strong className="text-cyan-300">{ff.frequencyHz} Hz</strong> | Peak: {ff.peakVal}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        ff.severity === "Severe" ? "bg-red-500/20 text-red-300 border border-red-500/40" : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      }`}>
                        {ff.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prioritized Recommended Actions */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-display flex items-center gap-2 print:text-black">
                <Wrench className="w-4 h-4 text-emerald-400" />
                Prioritized Maintenance Action Plan
              </h3>

              <div className="space-y-2">
                {activeModalLog.recommendedActions.map((rec, i) => (
                  <div key={i} className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 flex items-start gap-3">
                    <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-bold text-[10px] shrink-0 font-mono mt-0.5">
                      {rec.priority}
                    </span>
                    <div className="space-y-0.5 flex-1">
                      <p className="text-xs font-semibold text-slate-200">{rec.action}</p>
                      <span className="text-[10px] text-slate-400 font-mono block">Recommended Timeframe: {rec.timeframe}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Bottom Bar: Export & Share Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-800 print:hidden">
              <span className="text-[10px] text-slate-400 font-mono">
                Operator: {activeModalLog.operator}
              </span>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowShareModal(true)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-cyan-300 font-bold text-xs rounded-xl transition-all flex items-center gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share Report</span>
                </button>

                <button
                  onClick={handlePrintPDF}
                  className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-xl transition-all flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  <span>Export Report PDF</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 6. SHARE REPORT EMAIL MODAL                                          */}
      {/* ==================================================================== */}
      {showShareModal && activeModalLog && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 relative">
            <button
              onClick={() => setShowShareModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
              <Mail className="w-5 h-5 text-cyan-400" />
              Email Diagnostic Log Report
            </h3>

            <p className="text-xs text-slate-400">
              Dispatch detailed PDF report for <strong className="text-white">{activeModalLog.assetName}</strong> to maintenance team.
            </p>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-slate-300">Recipient Email</label>
              <input
                type="email"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl p-3 text-xs focus:border-cyan-400 focus:outline-none"
                placeholder="maintenance@motormedicpro.com"
              />
            </div>

            {shareSuccess && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Report successfully dispatched to {shareEmail}!</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShareSuccess(true);
                  setTimeout(() => {
                    setShareSuccess(false);
                    setShowShareModal(false);
                    showToast(`Dispatched diagnostic summary to ${shareEmail}`, "success");
                  }, 1200);
                }}
                className="px-5 py-2 bg-cyan-500 text-slate-950 rounded-xl text-xs font-extrabold flex items-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Dispatches</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 7. SCHEDULE AUTO DIAGNOSTICS MODAL                                   */}
      {/* ==================================================================== */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 relative">
            <button
              onClick={() => setShowScheduleModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              Schedule Automated Diagnostics
            </h3>

            <p className="text-xs text-slate-400">
              Configure background automated spectrum polling and AI condition scans for connected plant sensors.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-300 block mb-1">Polling Interval</label>
                <select className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl p-2.5 focus:border-amber-400 focus:outline-none">
                  <option value="1h">Every 1 Hour (High Criticality)</option>
                  <option value="6h">Every 6 Hours (Standard)</option>
                  <option value="24h">Daily (24 Hours)</option>
                  <option value="7d">Weekly Scan</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-300 block mb-1">Target Asset Route</label>
                <select className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl p-2.5 focus:border-amber-400 focus:outline-none">
                  <option value="all">All Plant Machinery Routes</option>
                  <option value="line1">Polymer Line 1 Critical Assets</option>
                  <option value="boilers">Powerhouse Boiler Pumps</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowScheduleModal(false);
                  showToast("✓ Automated diagnostic polling schedule updated", "success");
                }}
                className="px-5 py-2 bg-amber-500 text-slate-950 rounded-xl text-xs font-extrabold flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save Schedule</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
