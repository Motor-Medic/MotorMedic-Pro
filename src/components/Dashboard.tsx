import React, { useState, useEffect } from "react";
import { 
  Activity, AlertTriangle, CheckCircle2, DollarSign, ArrowRight, TrendingUp, 
  Wrench, FileText, Plus, RefreshCw, Calendar, Sparkles, AlertOctagon,
  ShieldCheck, Layers, Clipboard, Building
} from "lucide-react";
import { 
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid
} from "recharts";
import { jsPDF } from "jspdf";

interface DashboardProps {
  companyId: number;
  onNavigate: (tab: "diagnose" | "history" | "trends" | "sensors" | "assets") => void;
  onSelectReport?: (report: any) => void;
  onStartQuickAnalysis: () => void;
  onAddAsset: () => void;
}

interface HealthSummary {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
}

interface CriticalAlert {
  id: number;
  name: string;
  fault_type: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  detected_at: string;
}

interface FaultDistributionItem {
  name: string;
  count: number;
  percentage: number;
}

interface HealthTrendItem {
  date: string;
  percentage: number;
}

interface RecentActivityItem {
  id: number;
  timestamp: string;
  asset_name: string;
  fault: string;
  severity: string;
  engineer_name: string;
}

interface RoiMetrics {
  critical_faults_prevented: number;
  estimated_savings: number;
  planned_ratio: number;
  unplanned_ratio: number;
  efficiency_improvement: number;
}

export default function Dashboard({ 
  companyId, 
  onNavigate, 
  onSelectReport,
  onStartQuickAnalysis,
  onAddAsset 
}: DashboardProps) {
  
  // States for API data
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [alerts, setAlerts] = useState<CriticalAlert[]>([]);
  const [distribution, setDistribution] = useState<FaultDistributionItem[]>([]);
  const [trend, setTrend] = useState<HealthTrendItem[]>([]);
  const [activities, setActivities] = useState<RecentActivityItem[]>([]);
  const [roi, setRoi] = useState<RoiMetrics | null>(null);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);

  // Fetch Dashboard Data
  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParam = `?company_id=${companyId}`;
      
      const [summaryRes, alertsRes, distRes, trendRes, activityRes, roiRes] = await Promise.all([
        fetch(`/api/dashboard/health-summary${queryParam}`),
        fetch(`/api/dashboard/critical-alerts${queryParam}`),
        fetch(`/api/dashboard/fault-distribution${queryParam}`),
        fetch(`/api/dashboard/health-trend${queryParam}`),
        fetch(`/api/dashboard/recent-activity${queryParam}`),
        fetch(`/api/dashboard/roi-calculation${queryParam}`)
      ]);

      if (!summaryRes.ok || !alertsRes.ok || !distRes.ok || !trendRes.ok || !activityRes.ok || !roiRes.ok) {
        throw new Error("One or more dashboard endpoints failed to respond.");
      }

      const summaryData = await summaryRes.json();
      const alertsData = await alertsRes.json();
      const distData = await distRes.json();
      const trendData = await trendRes.json();
      const activityData = await activityRes.json();
      const roiData = await roiRes.json();

      setSummary(summaryData);
      setAlerts(alertsData);
      setDistribution(distData.distribution || []);
      setTrend(trendData);
      setActivities(activityData);
      setRoi(roiData);
    } catch (err: any) {
      console.error("Failed to load Executive Dashboard data:", err);
      setError(err?.message || "Connection timed out. Loading system diagnostics cache...");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [companyId]);

  // Color mappings for severity
  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case "Critical":
        return "bg-rose-500/10 border-rose-500/30 text-rose-400 font-bold";
      case "High":
        return "bg-amber-500/10 border-amber-500/30 text-amber-400 font-semibold";
      case "Medium":
        return "bg-yellow-500/10 border-yellow-500/20 text-yellow-400";
      default:
        return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
    }
  };

  // Recharts color palettes
  const FAULT_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444", "#64748b"];

  // Overall health percentage logic
  const overallHealth = summary ? Math.round((summary.healthy / (summary.total || 1)) * 100) : 87;
  const getHealthColor = (pct: number) => {
    if (pct > 80) return "text-emerald-400";
    if (pct >= 60) return "text-amber-400";
    return "text-rose-400";
  };
  const getHealthSvgStroke = (pct: number) => {
    if (pct > 80) return "#10b981";
    if (pct >= 60) return "#f59e0b";
    return "#ef4444";
  };

  // Generate jsPDF Report
  const handleExportPdfReport = () => {
    setExportingPdf(true);
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      const pageHeight = 297;
      const pageWidth = 210;
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);

      // Border & Header
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.3);
      doc.rect(margin - 2, margin - 2, contentWidth + 4, pageHeight - (margin * 2) + 4);

      // Corporate Blue Header Banner
      doc.setFillColor(8, 47, 73); // Deep Navy
      doc.rect(margin - 1, margin - 1, contentWidth + 2, 22, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text("EXECUTIVE RELIABILITY ASSURANCE REPORT", margin + 5, margin + 8);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(186, 230, 253);
      doc.text(`Generated on: ${new Date().toLocaleString()} • Company Scope ID: ${companyId}`, margin + 5, margin + 14);

      let curY = margin + 30;

      // Section 1: Overview
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text("1. PLANT HEALTH OVERVIEW", margin, curY);
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, curY + 2, margin + contentWidth, curY + 2);
      curY += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.text(`Overall Plant Machinery Health: ${overallHealth}% Healthy`, margin, curY);
      doc.text(`Total Monitored Assets: ${summary?.total || 0}`, margin + 80, curY);
      curY += 6;
      doc.text(`Healthy: ${summary?.healthy || 0}   |   Warning Mode: ${summary?.warning || 0}   |   Critical State: ${summary?.critical || 0}`, margin, curY);
      curY += 12;

      // Section 2: Preventative Financial Impact
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text("2. FINANCIAL VALUATION & PREVENTED FAILURES", margin, curY);
      doc.line(margin, curY + 2, margin + contentWidth, curY + 2);
      curY += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.text(`Estimated Faults Intercepted (30 Days): ${roi?.critical_faults_prevented || 0} Incidents`, margin, curY);
      doc.text(`Average Downtime Cost Prevented per Incident: $10,000`, margin + 90, curY);
      curY += 6;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(16, 185, 129); // Emerald
      doc.text(`TOTAL ESTIMATED AVOIDABLE DOWNTIME SAVINGS: $${(roi?.estimated_savings || 0).toLocaleString()}`, margin, curY);
      curY += 6;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.text(`Maintenance Scheduling Efficiency Improvement Ratio: ${roi?.efficiency_improvement || 0}%`, margin, curY);
      curY += 14;

      // Section 3: Critical Risks & Fault Type Breakdown
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text("3. CRITICAL ALERTS & FAULT TYPE CLASSIFICATION", margin, curY);
      doc.line(margin, curY + 2, margin + contentWidth, curY + 2);
      curY += 8;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text("FAULT TYPE", margin, curY);
      doc.text("COUNT", margin + 60, curY);
      doc.text("PERCENTAGE SHARE", margin + 90, curY);
      curY += 4;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      distribution.forEach(item => {
        if (curY < 260) {
          doc.text(item.name, margin, curY);
          doc.text(String(item.count), margin + 60, curY);
          doc.text(`${item.percentage}%`, margin + 90, curY);
          curY += 5.5;
        }
      });

      curY += 8;

      // Section 4: Critical Machinery Alerts
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text("4. ACTIVE HIGH-SEVERITY MACHINERY ALERTS", margin, curY);
      curY += 4;

      if (alerts.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(16, 185, 129);
        doc.text("All monitored equipment operating within normal safe thresholds.", margin, curY);
      } else {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("ASSET NAME", margin, curY);
        doc.text("FAULT DETECTED", margin + 60, curY);
        doc.text("SEVERITY", margin + 110, curY);
        doc.text("DETECTION DATE", margin + 140, curY);
        curY += 4;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(51, 65, 85);
        alerts.slice(0, 8).forEach(alert => {
          if (curY < 275) {
            doc.text(alert.name, margin, curY);
            doc.text(alert.fault_type, margin + 60, curY);
            doc.text(alert.severity, margin + 110, curY);
            doc.text(new Date(alert.detected_at).toLocaleDateString(), margin + 140, curY);
            curY += 5;
          }
        });
      }

      // Footer
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("MotorMedic Pro AI Reliability Assurance Platform • Enterprise Analytics Suite", margin, pageHeight - margin + 4);
      doc.text("Page 1 of 1", pageWidth - margin - 15, pageHeight - margin + 4);

      doc.save(`Executive_Reliability_Report_${companyId}.pdf`);
    } catch (err) {
      console.error("Failed to export PDF report:", err);
    } finally {
      setExportingPdf(false);
    }
  };

  // Render Loading Skeleton Layout
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-28 bg-slate-900/40 rounded-2xl border border-slate-800/80 p-6 flex flex-col justify-between">
          <div className="h-4 bg-slate-800 rounded w-1/4"></div>
          <div className="h-6 bg-slate-800 rounded w-1/2"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-80 bg-slate-900/40 rounded-2xl border border-slate-800/80 p-6"></div>
          <div className="h-80 bg-slate-900/40 rounded-2xl border border-slate-800/80 p-6"></div>
          <div className="h-80 bg-slate-900/40 rounded-2xl border border-slate-800/80 p-6"></div>
        </div>
        <div className="h-48 bg-slate-900/40 rounded-2xl border border-slate-800/80"></div>
      </div>
    );
  }

  // Render Error state gracefully
  if (error && !summary) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-4">
        <AlertOctagon className="w-12 h-12 text-rose-500" />
        <h3 className="text-lg font-bold font-display">Failed to load analytics dashboard</h3>
        <p className="text-sm text-slate-400 max-w-md">{error}</p>
        <button 
          onClick={fetchDashboardData}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Quick Actions Bar */}
      <div className="relative overflow-hidden bg-slate-950 border border-slate-900/80 rounded-2xl p-6 sm:p-8">
        <div className="absolute top-0 right-0 p-6 opacity-5 sm:opacity-10 pointer-events-none">
          <Activity className="w-48 h-48 text-yellow-400" />
        </div>
        
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-full">
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse"></span>
              EXECUTIVE ANALYTICS OVERVIEW
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight font-display text-white">
              Facility Health Dashboard
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-xl">
              Real-time equipment reliability indexes, financial avoided-downtime estimates, and machine-learning diagnostic trends across your enterprise.
            </p>
          </div>
          {/* Quick Actions Bar */}
          <div className="flex flex-wrap gap-2 sm:gap-2.5 items-center w-full lg:w-auto lg:justify-end" id="dashboard-quick-actions">
            <button
              onClick={onStartQuickAnalysis}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-semibold text-[11px] sm:text-xs rounded-xl transition-all shadow-md whitespace-nowrap flex-1 sm:flex-none cursor-pointer"
              id="dashboard-btn-quick-analysis"
            >
              <Activity className="w-3.5 h-3.5 shrink-0" />
              <span>Run Quick Analysis</span>
            </button>
            <button
              onClick={() => onNavigate("assets")}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 bg-slate-900 border border-slate-850 hover:bg-slate-850 text-slate-200 font-semibold text-[11px] sm:text-xs rounded-xl transition-all whitespace-nowrap flex-1 sm:flex-none cursor-pointer"
              id="dashboard-btn-view-assets"
            >
              <Building className="w-3.5 h-3.5 shrink-0" />
              <span>View All Assets</span>
            </button>
            <button
              onClick={handleExportPdfReport}
              disabled={exportingPdf}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 bg-slate-900 border border-slate-850 hover:bg-slate-850 text-slate-200 font-semibold text-[11px] sm:text-xs rounded-xl transition-all disabled:opacity-50 whitespace-nowrap flex-1 sm:flex-none cursor-pointer"
              id="dashboard-btn-export-pdf"
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>{exportingPdf ? "Generating..." : "Export Report"}</span>
            </button>
            <button
              onClick={onAddAsset}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 bg-slate-900 border border-slate-850 hover:bg-slate-850 text-slate-200 font-semibold text-[11px] sm:text-xs rounded-xl transition-all whitespace-nowrap flex-1 sm:flex-none cursor-pointer"
              id="dashboard-btn-add-asset"
            >
              <Plus className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
              <span>Add New Asset</span>
            </button>
          </div>
        </div>
      </div>
 
      {/* Top Section Layout (Plant Health circular gauge & statistics cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6" id="dashboard-top-metrics">
        
        {/* Fault Distribution Chart Card (Column span 7) */}
        <div className="md:col-span-1 lg:col-span-7 bg-slate-900/60 border border-slate-850 rounded-2xl p-6 flex flex-col justify-between" id="dashboard-fault-distribution-card">
          <div className="flex items-center justify-between pb-3 border-b border-slate-850/80 mb-4">
            <div>
              <h3 className="text-sm font-bold text-white font-display">Fault Analysis Distribution</h3>
              <p className="text-[11px] text-slate-400">Classification share of detected defects in the last 30 days</p>
            </div>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
 
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center flex-1 py-2">
            {/* Recharts Pie Chart (Col span 6) */}
            <div className="md:col-span-6 h-48 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="count"
                  >
                    {distribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={FAULT_COLORS[index % FAULT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "10px", color: "#f8fafc" }}
                    itemStyle={{ color: "#f8fafc" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xs text-slate-400">Detected</span>
                <span className="text-xl font-bold text-white font-mono">
                  {distribution.reduce((acc, curr) => acc + curr.count, 0)}
                </span>
              </div>
            </div>
 
            {/* Custom Grid Legend (Col span 6) */}
            <div className="md:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 max-h-[160px] overflow-y-auto pr-1">
              {distribution.map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between text-xs py-1 px-2 bg-slate-950/40 rounded border border-slate-850/60">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span 
                      className="w-2.5 h-2.5 rounded-full shrink-0" 
                      style={{ backgroundColor: FAULT_COLORS[idx % FAULT_COLORS.length] }}
                    ></span>
                    <span className="text-slate-300 truncate font-medium">{item.name}</span>
                  </div>
                  <span className="text-white font-semibold font-mono shrink-0 ml-2">
                    {item.count} <span className="text-[10px] text-slate-500 font-normal">({item.percentage}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Plant Health Circular Gauge Card (Column span 5) - Moved to the right side of the layout */}
        <div className="md:col-span-1 lg:col-span-5 bg-slate-900/60 border border-slate-850 rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden" id="dashboard-health-gauge-card">
          <div className="flex items-center justify-between pb-3 border-b border-slate-850/80 mb-5">
            <div>
              <h3 className="text-sm font-bold text-white font-display">Overall Plant Health Index</h3>
              <p className="text-[11px] text-slate-400">Aggregated real-time condition index</p>
            </div>
            <Activity className="w-4 h-4 text-slate-400" />
          </div>
 
          <div className="flex flex-col sm:flex-row items-center justify-around py-4 gap-6">
            {/* SVG Circular Gauge */}
            <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                {/* Background Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="8"
                />
                {/* Foreground Filled Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke={getHealthSvgStroke(overallHealth)}
                  strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - overallHealth / 100)}`}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute text-center">
                <span className={`text-3xl font-extrabold font-display ${getHealthColor(overallHealth)}`}>
                  {overallHealth}%
                </span>
                <p className="text-[9px] text-slate-400 font-medium tracking-wider uppercase">Operating</p>
              </div>
            </div>
 
            {/* Breakdown Listing */}
            <div className="space-y-3.5 w-full sm:w-auto">
              <div className="flex items-center justify-between sm:justify-start gap-4">
                <span className="text-xs font-semibold text-slate-400">Total Assets</span>
                <span className="text-sm font-bold text-white font-mono bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700">{summary?.total || 0}</span>
              </div>
              <div className="flex items-center justify-between sm:justify-start gap-4">
                <span className="text-xs font-semibold text-emerald-400">Healthy</span>
                <span className="text-sm font-bold text-emerald-400 font-mono bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/50">{summary?.healthy || 0}</span>
              </div>
              <div className="flex items-center justify-between sm:justify-start gap-4">
                <span className="text-xs font-semibold text-yellow-400">Warning Mode</span>
                <span className="text-sm font-bold text-yellow-400 font-mono bg-yellow-950/40 px-2 py-0.5 rounded border border-yellow-900/50">{summary?.warning || 0}</span>
              </div>
              <div className="flex items-center justify-between sm:justify-start gap-4">
                <span className="text-xs font-semibold text-rose-400 font-bold">Critical Risk</span>
                <span className="text-sm font-bold text-rose-400 font-mono bg-rose-950/40 px-2 py-0.5 rounded border border-rose-900/50">{summary?.critical || 0}</span>
              </div>
            </div>
          </div>
 
          <div className="mt-4 bg-slate-950/40 rounded-xl p-3 border border-slate-850/80 text-[11px] text-slate-400 leading-relaxed">
            <span className="font-semibold text-slate-300">Analysis Method:</span> Health scoring is determined via active Fourier-transform frequency peaks, thermal logs, and deep model synthesis diagnostics.
          </div>
        </div>

      </div>

      {/* Main Grid: Critical Alerts & Trending Health Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
        
        {/* Critical Alerts Panel (Column span 5) */}
        <div className="md:col-span-1 lg:col-span-5 bg-slate-900/60 border border-slate-850 rounded-2xl p-6 flex flex-col h-[380px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-850/80 mb-4">
            <div>
              <h3 className="text-sm font-bold text-white font-display flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-rose-400" />
                Critical & High Machinery Alerts
              </h3>
              <p className="text-[11px] text-slate-400">Immediate mechanical/electrical risks</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1.5">
            {alerts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-3.5 py-10">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full animate-bounce">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">All equipment operating normally</h4>
                  <p className="text-xs text-slate-400 max-w-xs mt-1">
                    No active faults above nominal vibration limits detected in this scope.
                  </p>
                </div>
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  onClick={() => onNavigate("assets")}
                  className="group bg-slate-950/40 border border-slate-850 hover:border-slate-700 rounded-xl p-3.5 cursor-pointer transition-all flex items-start justify-between gap-3"
                >
                  <div className="space-y-1 max-w-[70%]">
                    <p className="text-xs font-bold text-white truncate group-hover:text-yellow-400 transition-colors">
                      {alert.name}
                    </p>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-300">{alert.fault_type}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Detected: {new Date(alert.detected_at).toLocaleDateString()}
                    </p>
                  </div>

                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border tracking-wider shrink-0 ${getSeverityBadgeClass(alert.severity)}`}>
                    {alert.severity}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Trending Health Chart Card (Column span 7) */}
        <div className="md:col-span-1 lg:col-span-7 bg-slate-900/60 border border-slate-850 rounded-2xl p-6 flex flex-col h-[380px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-850/80 mb-4">
            <div>
              <h3 className="text-sm font-bold text-white font-display">Plant Health Trend (90 Days)</h3>
              <p className="text-[11px] text-slate-400">Weekly percentage of healthy, defect-free machinery</p>
            </div>
            <TrendingUp className="w-4 h-4 text-emerald-400 animate-pulse" />
          </div>

          <div className="flex-1 w-full min-h-0 py-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis 
                  dataKey="date" 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={10} 
                  domain={[50, 100]}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${val}%`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "10px", color: "#f8fafc" }}
                  labelStyle={{ color: "#94a3b8", fontWeight: "bold" }}
                />
                <Line 
                  type="monotone" 
                  dataKey="percentage" 
                  name="Healthy Machinery %" 
                  stroke="#10b981" 
                  strokeWidth={2.5}
                  dot={{ r: 3, stroke: "#10b981", strokeWidth: 1, fill: "#0f172a" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* ROI & Prevented Failures Valuation Panel (Bottom Section) */}
      <div className="bg-slate-900/60 border border-slate-850 rounded-2xl p-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-850/80 mb-5">
          <div>
            <h3 className="text-sm font-bold text-white font-display">Avoided Downtime Financial Valuation (ROI)</h3>
            <p className="text-[11px] text-slate-400">Estimated commercial savings through proactive fault detection</p>
          </div>
          <DollarSign className="w-4 h-4 text-emerald-400" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Prevented Faults Stat */}
          <div className="bg-slate-950/40 border border-slate-850/80 rounded-xl p-5 flex items-center gap-4">
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Critical Faults Prevented</span>
              <p className="text-2xl font-extrabold text-white font-mono mt-0.5">{roi?.critical_faults_prevented || 0}</p>
              <p className="text-[10px] text-slate-500 mt-1">Intercepted before terminal failure</p>
            </div>
          </div>

          {/* Savings Estimator */}
          <div className="bg-slate-950/40 border border-slate-850/80 rounded-xl p-5 flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
              <DollarSign className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Avoided Downtime Savings</span>
              <p className="text-2xl font-extrabold text-emerald-400 font-mono mt-0.5">
                ${(roi?.estimated_savings || 0).toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">Based on standard $10,000 avg downtime cost</p>
            </div>
          </div>

          {/* Efficiency Metric */}
          <div className="bg-slate-950/40 border border-slate-850/80 rounded-xl p-5 flex items-center gap-4">
            <div className="p-3 bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 rounded-xl">
              <Wrench className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Maintenance Ratio</span>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-extrabold text-white font-mono mt-0.5">
                  {roi?.planned_ratio || 85}% <span className="text-xs text-slate-400">Planned</span>
                </p>
              </div>
              <p className="text-[10px] text-emerald-400 font-medium mt-1">
                🏆 {roi?.efficiency_improvement || 0}% overall ratio improvement
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* Recent Activity Feed Block */}
      <div className="bg-slate-900/60 border border-slate-850 rounded-2xl p-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-850/80 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white font-display">Recent Diagnostics Log Feed</h3>
            <p className="text-[11px] text-slate-400">Latest analysis audits conducted at the facility</p>
          </div>
          <Clipboard className="w-4 h-4 text-slate-400" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/50 text-slate-400 uppercase tracking-wider text-[10px] font-bold">
              <tr>
                <th className="p-3 rounded-l-lg">Timestamp</th>
                <th className="p-3">Asset</th>
                <th className="p-3">Condition Result</th>
                <th className="p-3">Severity</th>
                <th className="p-3 rounded-r-lg">Authorized Analyst</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850/50">
              {activities.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500 italic">
                    No diagnostics executed yet.
                  </td>
                </tr>
              ) : (
                activities.map((activity) => (
                  <tr key={activity.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="p-3 text-slate-400 font-mono text-[11px]">
                      {new Date(activity.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3 font-semibold text-white">
                      {activity.asset_name}
                    </td>
                    <td className="p-3 font-medium text-slate-300">
                      {activity.fault}
                    </td>
                    <td className="p-3">
                      <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 font-bold rounded border ${getSeverityBadgeClass(activity.severity)}`}>
                        {activity.severity}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400">
                      {activity.engineer_name}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
