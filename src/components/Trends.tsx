import React, { useState, useEffect, useMemo } from "react";
import { 
  TrendingUp, Calendar, AlertTriangle, CheckCircle2, Wrench, Thermometer, 
  Gauge, Zap, Database, Sliders, Download, RefreshCw, FileText, 
  ChevronDown, ChevronUp, Filter, Clock, Search, Building, ArrowRight,
  Info, Sparkles, Plus, AlertOctagon, Layers, Compass, HelpCircle
} from "lucide-react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  ReferenceLine, Brush, Legend 
} from "recharts";
import { motion, AnimatePresence } from "motion/react";

// --- Error Boundary and Safe Formatting Helpers ---
class ChartErrorBoundary extends React.Component<{ children: React.ReactNode; key?: string | number }, { hasError: boolean }> {
  props: { children: React.ReactNode; key?: string | number };
  state: { hasError: boolean };
  constructor(props: { children: React.ReactNode; key?: string | number }) {
    super(props);
    this.props = props;
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("Chart Error Boundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-slate-950/40 border border-red-500/10 rounded-xl p-4 text-center">
          <AlertOctagon className="w-5 h-5 text-red-500 mb-1" />
          <p className="text-red-400 text-xs font-semibold">Chart display error</p>
          <p className="text-slate-500 text-[10px] mt-1">Unable to render this specific chart.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function safeToFixed(value: any, decimals: number = 4, fallback: string = "0.0000"): string {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  if (isNaN(num)) return fallback;
  return num.toFixed(decimals);
}

// --- Types ---
interface Plant {
  id: number;
  name: string;
  location: string | null;
}

interface RouteArea {
  id: number;
  plant_id: number;
  name: string;
  description: string | null;
}

interface Asset {
  id: number;
  route_id: number;
  name: string;
  tag_number?: string;
  type?: string;
  manufacturer?: string;
  status?: string;
}

interface ComponentAsset {
  id: number;
  asset_id: number;
  name: string;
  type: string;
  manufacturer?: string;
  model?: string;
  specifications?: any;
}

interface AnalysisRecord {
  id: number;
  measurement_point_id: number;
  data_point_name: string;
  state: string;
  op_speed: number;
  measurement_value: number;
  units: string;
  measurement_date: string;
  notes: string;
  alarm_status: boolean;
  diagnosis_result: any;
}

interface TrendsProps {
  selectedCompanyId?: number;
  subscriptionPlan?: string;
}

export default function Trends({ selectedCompanyId = 1, subscriptionPlan = "vibration_only" }: TrendsProps) {
  // --- Cascading Dropdown States ---
  const [plants, setPlants] = useState<Plant[]>([]);
  const [routes, setRoutes] = useState<RouteArea[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [components, setComponents] = useState<ComponentAsset[]>([]);

  const [selectedPlantId, setSelectedPlantId] = useState<number | "">("");
  const [selectedRouteId, setSelectedRouteId] = useState<number | "">("");
  const [selectedAssetId, setSelectedAssetId] = useState<number | "">("");
  const [selectedComponentId, setSelectedComponentId] = useState<number | "">("");

  const [loadingPlants, setLoadingPlants] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingComponents, setLoadingComponents] = useState(false);

  // --- Filter states ---
  const [selectedTech, setSelectedTech] = useState<string>("All"); // "All", "Vibration", "Infrared", "Ultrasound", "MCA", "Oil Analysis"
  const [timeRange, setTimeRange] = useState<string>("30D"); // "7D", "30D", "90D", "1Y", "ALL", "CUSTOM"
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // --- Subscription Technology Filtering ---
  const allowedTechKeys = useMemo(() => {
    switch (subscriptionPlan) {
      case 'vibration_only':
        return ['vibration'];
      case 'ir_only':
        return ['infrared'];
      case 'vibration_ir':
        return ['vibration', 'infrared'];
      case 'full_suite':
      case 'custom':
      default:
        return ['vibration', 'infrared', 'ultrasound', 'mca', 'oil_analysis'];
    }
  }, [subscriptionPlan]);

  const allTabs = useMemo(() => [
    { id: "All", label: "All Technologies", key: "all" },
    { id: "Vibration", label: "Vibration Analysis", key: "vibration" },
    { id: "Thermal", label: "Infrared Thermography", key: "infrared" },
    { id: "Ultrasound", label: "Ultrasound", key: "ultrasound" },
    { id: "Electrical", label: "Motor Circuit (MCA)", key: "mca" },
    { id: "Oil", label: "Oil Analysis", key: "oil_analysis" }
  ], []);

  const allowedTabs = useMemo(() => {
    return allTabs.filter(tab => tab.key === "all" || allowedTechKeys.includes(tab.key));
  }, [allowedTechKeys, allTabs]);

  useEffect(() => {
    const activeTabObj = allTabs.find(t => t.id === selectedTech);
    if (activeTabObj && activeTabObj.key !== "all" && !allowedTechKeys.includes(activeTabObj.key)) {
      setSelectedTech("All");
    }
  }, [allowedTechKeys, selectedTech, allTabs]);

  // --- Historical Trend State ---
  const [rawTrendData, setRawTrendData] = useState<AnalysisRecord[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [errorTrends, setErrorTrends] = useState<string | null>(null);

  // --- Interaction States ---
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const [tableFilters, setTableFilters] = useState<Record<string, string>>({});
  const [tableSort, setTableSort] = useState<Record<string, { field: string; order: "asc" | "desc" }>>({});
  const [selectedAlarmDetails, setSelectedAlarmDetails] = useState<{ paramName: string; details: any } | null>(null);
  const [compareMetric, setCompareMetric] = useState<Record<string, string>>({}); // metricName -> otherMetricName to compare
  const [showBaseline, setShowBaseline] = useState<Record<string, boolean>>({}); // metricName -> show nominal dashed line
  const [showPrintReport, setShowPrintReport] = useState(false);

  // --- Load Initial Plants ---
  useEffect(() => {
    async function fetchPlants() {
      setLoadingPlants(true);
      try {
        const res = await fetch(`/api/plants?company_id=${selectedCompanyId}`);
        if (res.ok) {
          const data = await res.json();
          setPlants(data);
          // Auto select first plant if available
          if (data.length > 0) {
            setSelectedPlantId(data[0].id);
          } else {
            setSelectedPlantId("");
          }
        }
      } catch (err) {
        console.error("Error fetching plants:", err);
      } finally {
        setLoadingPlants(false);
      }
    }
    fetchPlants();
  }, [selectedCompanyId]);

  // --- Load Routes when Plant changes ---
  useEffect(() => {
    if (selectedPlantId === "") {
      setRoutes([]);
      setSelectedRouteId("");
      return;
    }
    async function fetchRoutes() {
      setLoadingRoutes(true);
      try {
        const res = await fetch(`/api/routes?plant_id=${selectedPlantId}`);
        if (res.ok) {
          const data = await res.json();
          setRoutes(data);
          if (data.length > 0) {
            setSelectedRouteId(data[0].id);
          } else {
            setSelectedRouteId("");
          }
        }
      } catch (err) {
        console.error("Error fetching routes:", err);
      } finally {
        setLoadingRoutes(false);
      }
    }
    fetchRoutes();
  }, [selectedPlantId]);

  // --- Load Assets when Route changes ---
  useEffect(() => {
    if (selectedRouteId === "") {
      setAssets([]);
      setSelectedAssetId("");
      return;
    }
    async function fetchAssets() {
      setLoadingAssets(true);
      try {
        const res = await fetch(`/api/assets?route_id=${selectedRouteId}`);
        if (res.ok) {
          const data = await res.json();
          setAssets(data);
          if (data.length > 0) {
            setSelectedAssetId(data[0].id);
          } else {
            setSelectedAssetId("");
          }
        }
      } catch (err) {
        console.error("Error fetching assets:", err);
      } finally {
        setLoadingAssets(false);
      }
    }
    fetchAssets();
  }, [selectedRouteId]);

  // --- Load Components when Asset changes ---
  useEffect(() => {
    if (selectedAssetId === "") {
      setComponents([]);
      setSelectedComponentId("");
      return;
    }
    async function fetchComponents() {
      setLoadingComponents(true);
      try {
        const res = await fetch(`/api/components?asset_id=${selectedAssetId}`);
        if (res.ok) {
          const data = await res.json();
          setComponents(data);
          if (data.length > 0) {
            setSelectedComponentId(data[0].id);
          } else {
            setSelectedComponentId("");
          }
        }
      } catch (err) {
        console.error("Error fetching components:", err);
      } finally {
        setLoadingComponents(false);
      }
    }
    fetchComponents();
  }, [selectedAssetId]);

  // --- Load Trend History when Selected Component OR Tech Filter changes ---
  useEffect(() => {
    if (selectedComponentId === "") {
      setRawTrendData([]);
      return;
    }
    
    async function fetchTrendHistory() {
      setLoadingTrends(true);
      setErrorTrends(null);
      try {
        // Map UI tech name to API query param
        let techQuery = selectedTech;
        if (selectedTech === "All Technologies" || selectedTech === "All") {
          techQuery = "All";
        }
        
        const res = await fetch(`/api/analysis-history/${selectedComponentId}?technology=${techQuery}&isComponent=true`);
        if (res.ok) {
          const data = await res.json();
          console.log(`[Trends Debug] Successfully fetched trend history for component ${selectedComponentId}, tech ${techQuery}. Total records:`, data ? data.length : 0);
          if (data && data.length > 0) {
            console.log(`[Trends Debug] Sample record:`, data[0]);
          }
          setRawTrendData(data);
        } else {
          setErrorTrends("Failed to load historical trend telemetry from diagnostic server.");
        }
      } catch (err) {
        console.error("Error fetching trend history:", err);
        setErrorTrends("Network error: Could not reach the trending telemetry server.");
      } finally {
        setLoadingTrends(false);
      }
    }
    
    fetchTrendHistory();
  }, [selectedComponentId, selectedTech]);

  // --- Filtered Data by Time Range ---
  const filteredTrendData = useMemo(() => {
    if (!rawTrendData || !Array.isArray(rawTrendData) || rawTrendData.length === 0) return [];

    const now = new Date();
    let thresholdDate = new Date(0); // Epoch

    if (timeRange === "7D") {
      thresholdDate = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    } else if (timeRange === "30D") {
      thresholdDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    } else if (timeRange === "90D") {
      thresholdDate = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
    } else if (timeRange === "1Y") {
      thresholdDate = new Date(now.getTime() - 365 * 24 * 3600 * 1000);
    } else if (timeRange === "CUSTOM" && customStartDate) {
      thresholdDate = new Date(customStartDate);
    }

    let endThresholdDate = new Date(32503680000000); // Year 3000
    if (timeRange === "CUSTOM" && customEndDate) {
      endThresholdDate = new Date(customEndDate + "T23:59:59");
    }

    return rawTrendData.filter(pt => {
      if (!pt || !pt.measurement_date) return false;
      const d = new Date(pt.measurement_date);
      return d >= thresholdDate && d <= endThresholdDate;
    });
  }, [rawTrendData, timeRange, customStartDate, customEndDate]);

  // --- Grouped Data by Metric Name for rendering individual charts ---
  const metricsData = useMemo(() => {
    const groups: Record<string, AnalysisRecord[]> = {};
    const trendDataArray = Array.isArray(filteredTrendData) ? filteredTrendData : [];
    trendDataArray.forEach(pt => {
      if (!pt) return;
      const metric = pt.data_point_name || "Unknown Parameter";
      if (!groups[metric]) {
        groups[metric] = [];
      }
      groups[metric].push(pt);
    });

    // Ensure they are sorted by date ascending for charts
    Object.keys(groups).forEach(key => {
      if (Array.isArray(groups[key])) {
        groups[key].sort((a, b) => {
          const timeA = a?.measurement_date ? new Date(a.measurement_date).getTime() : 0;
          const timeB = b?.measurement_date ? new Date(b.measurement_date).getTime() : 0;
          return timeA - timeB;
        });
      }
    });

    return groups;
  }, [filteredTrendData]);

  // --- Technical Information Metadata based on technology ---
  const techHeaders = {
    "Vibration": {
      title: "Vibration Analysis (ISO 10816)",
      desc: "Broadband vibration velocity tracks core mechanical deterioration, unbalance, and misalignment. High-frequency acceleration peak values indicate early bearing shell flaking and gear teeth degradation.",
      icon: "📊"
    },
    "Thermal": {
      title: "Infrared Thermography & Bearing Surface Temperatures",
      desc: "Surface temperature tracking identifies frictional overloads, hydrodynamic film deterioration, or localized resistance spikes in coils and motor terminals.",
      icon: "🌡️"
    },
    "Ultrasound": {
      title: "Acoustic Ultrasound Analysis",
      desc: "High-frequency acoustic emission measurements (dBμV) capture turbulent friction spikes, early-stage bearing race damage, and gas/hydraulic seal leaks long before vibrational shifts appear.",
      icon: "🧪"
    },
    "Electrical": {
      title: "Motor Circuit Analysis (MCA) & Stator Testing",
      desc: "Phase resistance, impedance, and unbalance indicators support direct non-destructive stator condition assessments. Insulation resistances gauge ground wall integrity.",
      icon: "⚡"
    },
    "Oil": {
      title: "Oil tribology & Wear Metal Analysis",
      desc: "Viscosity drifts flag chemical oil shearing or dilution, water ppm captures seal leakages, and ferrous density / wear metal trends show active mechanical destruction.",
      icon: "⚙️"
    }
  };

  // --- Get metadata of currently selected items to show context ---
  const currentPlant = plants.find(p => p.id === selectedPlantId);
  const currentRoute = routes.find(r => r.id === selectedRouteId);
  const currentAsset = assets.find(a => a.id === selectedAssetId);
  const currentComponent = components.find(c => c.id === selectedComponentId);

  // --- Export Table to CSV helper ---
  const handleExportCSV = (metricName: string, records: AnalysisRecord[]) => {
    if (records.length === 0) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Measurement Date,Parameter Name,Value,Units,Operating Speed (RPM),Status,Notes\r\n";
    
    records.forEach(r => {
      const date = new Date(r.measurement_date).toLocaleString();
      const name = r.data_point_name;
      const val = r.measurement_value;
      const units = r.units;
      const speed = r.op_speed || "N/A";
      const status = r.alarm_status ? "ALARM" : "NORMAL";
      const notes = r.notes ? r.notes.replace(/"/g, '""') : "";
      csvContent += `"${date}","${name}",${val},"${units}","${speed}","${status}","${notes}"\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${metricName.toLowerCase().replace(/\s+/g, "_")}_trend_data.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Generate baseline line value ---
  const getBaselineValue = (metricName: string): number => {
    if (metricName.includes("Velocity")) return 0.08;
    if (metricName.includes("Acceleration")) return 0.6;
    if (metricName.includes("Displacement")) return 1.2;
    if (metricName.includes("Temperature")) return 110.0;
    if (metricName.includes("Delta")) return 3.0;
    if (metricName.includes("dB Level")) return 16.0;
    if (metricName.includes("Crest")) return 2.0;
    if (metricName.includes("Resistance")) return 0.245;
    if (metricName.includes("Impedance")) return 12.1;
    if (metricName.includes("Unbalance")) return 0.5;
    if (metricName.includes("Viscosity")) return 46.0;
    return 10.0;
  };

  // --- Handle Browser Print Window ---
  const triggerPrintReport = () => {
    window.print();
  };

  if (loadingPlants && plants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center min-h-[400px] bg-slate-950/20 border border-slate-900 rounded-2xl space-y-4 animate-pulse">
        <RefreshCw className="w-8 h-8 animate-spin text-yellow-400" />
        <div className="text-sm text-slate-300 font-bold">Loading data...</div>
        <p className="text-xs text-slate-500 max-w-xs leading-relaxed">Fetching plant facilities and telemetry structures...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 print:p-0 print:space-y-4">
      
      {/* ----------------- Top Header ----------------- */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-800 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-yellow-400/10 border border-yellow-400/20 rounded-lg text-yellow-400">
              <TrendingUp className="w-5 h-5 animate-pulse" />
            </span>
            <h2 className="text-xl font-bold text-white font-display">Machinery Trends & Telemetry</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Conduct multi-technology trend analyses across plant life-cycles to detect pre-fault signatures
          </p>
        </div>
        
        {/* Export Report Buttons */}
        {selectedComponentId && rawTrendData.length > 0 && (
          <button
            onClick={() => setShowPrintReport(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 border border-slate-800 text-slate-200 hover:text-white hover:bg-slate-800 font-bold text-xs rounded-xl shadow-lg transition-all"
          >
            <FileText className="w-4 h-4 text-yellow-400" />
            <span>Generate Trend Report</span>
          </button>
        )}
      </div>

      {/* ----------------- 1. Cascading Asset Selection ----------------- */}
      <div className="bg-slate-950/60 border border-slate-900 rounded-2xl p-5 space-y-4 shadow-xl print:hidden">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-900/60">
          <Building className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
            Target Asset for Trending Analysis
          </h3>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Plant Dropdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center justify-between">
              <span>Plant Location</span>
              {loadingPlants && <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />}
            </label>
            <div className="relative">
              <select
                value={selectedPlantId}
                onChange={(e) => {
                  setSelectedPlantId(e.target.value === "" ? "" : Number(e.target.value));
                  setSelectedRouteId("");
                  setSelectedAssetId("");
                  setSelectedComponentId("");
                }}
                disabled={loadingPlants}
                className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-yellow-400 transition-colors cursor-pointer appearance-none disabled:opacity-50"
              >
                <option value="">-- Select Plant Location --</option>
                {Array.isArray(plants) ? plants.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} {p.location ? `(${p.location})` : ""}</option>
                )) : null}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Route Dropdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center justify-between">
              <span>Route / Area</span>
              {loadingRoutes && <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />}
            </label>
            <div className="relative">
              <select
                value={selectedRouteId}
                onChange={(e) => {
                  setSelectedRouteId(e.target.value === "" ? "" : Number(e.target.value));
                  setSelectedAssetId("");
                  setSelectedComponentId("");
                }}
                disabled={loadingRoutes || selectedPlantId === ""}
                className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-yellow-400 transition-colors cursor-pointer appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">-- Select Route Area --</option>
                {Array.isArray(routes) ? routes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                )) : null}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Asset Dropdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center justify-between">
              <span>Machinery Asset</span>
              {loadingAssets && <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />}
            </label>
            <div className="relative">
              <select
                value={selectedAssetId}
                onChange={(e) => {
                  setSelectedAssetId(e.target.value === "" ? "" : Number(e.target.value));
                  setSelectedComponentId("");
                }}
                disabled={loadingAssets || selectedRouteId === ""}
                className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-yellow-400 transition-colors cursor-pointer appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">-- Select Machinery Asset --</option>
                {Array.isArray(assets) ? assets.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} {a.tag_number ? `[${a.tag_number}]` : ""}</option>
                )) : null}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Component Dropdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center justify-between">
              <span>Sub-Component</span>
              {loadingComponents && <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />}
            </label>
            <div className="relative">
              <select
                value={selectedComponentId}
                onChange={(e) => {
                  setSelectedComponentId(e.target.value === "" ? "" : Number(e.target.value));
                }}
                disabled={loadingComponents || selectedAssetId === ""}
                className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-yellow-400 transition-colors cursor-pointer appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">-- Select Sub-Component --</option>
                {Array.isArray(components) ? components.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                )) : null}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

        </div>
      </div>

      {/* Disabled Trending State Placeholder */}
      {selectedComponentId === "" && (
        <div className="bg-slate-900/20 border border-slate-900/60 rounded-3xl py-24 px-6 text-center space-y-4 max-w-2xl mx-auto flex flex-col items-center">
          <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-between justify-center border border-slate-800 text-slate-500 mb-2">
            <Compass className="w-8 h-8 animate-spin" style={{ animationDuration: "12s" }} />
          </div>
          <h3 className="text-base font-bold text-slate-200 font-display">Target Machinery Selection Required</h3>
          <p className="text-xs text-slate-400 leading-relaxed max-w-md">
            To view deep technology telemetry, select a specific Plant Location, Route, Machinery Asset, and sub-component in the dropdown selector above.
          </p>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-yellow-500/80 bg-yellow-500/5 px-3 py-1.5 border border-yellow-500/10 rounded-full mt-4">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>AI TREND SEEDING IS ACTIVE FOR ALL ASSETS</span>
          </div>
        </div>
      )}

      {selectedComponentId !== "" && (
        <>
          {/* ----------------- 2. Technology Filter Tabs & Time Controls ----------------- */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 print:hidden">
            
            {/* Tech Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {allowedTabs.map((tab) => {
                const isActive = selectedTech === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedTech(tab.id)}
                    className={`px-3 py-2 rounded-xl font-bold text-[11px] transition-all whitespace-nowrap border ${
                      isActive 
                        ? "bg-yellow-400 border-yellow-400 text-slate-950 shadow-lg shadow-yellow-400/5" 
                        : "bg-slate-950/40 border-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-950/80"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Time Range Filter Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-1 flex items-center gap-1">
                {[
                  { id: "7D", label: "7 Days" },
                  { id: "30D", label: "30 Days" },
                  { id: "90D", label: "90 Days" },
                  { id: "1Y", label: "1 Year" },
                  { id: "ALL", label: "All Time" },
                  { id: "CUSTOM", label: "Custom Range" }
                ].map((btn) => {
                  const isActive = timeRange === btn.id;
                  return (
                    <button
                      key={btn.id}
                      onClick={() => setTimeRange(btn.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                        isActive 
                          ? "bg-slate-800 text-slate-100" 
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {btn.label}
                    </button>
                  );
                })}
              </div>

              {/* Custom Date Picker Inputs */}
              {timeRange === "CUSTOM" && (
                <div className="flex items-center gap-1.5 animate-fade-in bg-slate-950/40 border border-slate-900 rounded-xl p-1 px-2.5">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="bg-transparent border-none text-[10px] font-semibold text-slate-300 focus:outline-none focus:ring-0 w-24 [color-scheme:dark]"
                  />
                  <span className="text-slate-600 text-[10px] font-bold font-mono">→</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="bg-transparent border-none text-[10px] font-semibold text-slate-300 focus:outline-none focus:ring-0 w-24 [color-scheme:dark]"
                  />
                </div>
              )}
            </div>

          </div>

          {/* Asset Context Ribbon */}
          <div className="bg-slate-950/30 border border-slate-900 rounded-xl p-3 px-4 text-xs flex flex-wrap items-center justify-between gap-3 text-slate-300">
            <div className="flex items-center flex-wrap gap-2 text-[11px] font-medium font-mono text-slate-400">
              <span className="text-slate-200">{currentPlant?.name || "Plant"}</span>
              <span>/</span>
              <span className="text-slate-200">{currentRoute?.name || "Route"}</span>
              <span>/</span>
              <span className="text-slate-200">{currentAsset?.name || "Asset"}</span>
              <span>/</span>
              <span className="text-yellow-400 font-semibold">{currentComponent?.name || "Component"}</span>
            </div>
            
            {rawTrendData.length > 0 && (
              <div className="text-[10px] font-bold bg-slate-900/60 border border-slate-800/60 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>TELEMETRY FEED: {rawTrendData.length} TOTAL DATAPOINTS RETRIEVED</span>
              </div>
            )}
          </div>

          {/* ----------------- 3. Trending Display Area ----------------- */}
          {loadingTrends ? (
            /* Loading State Skeleton */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-slate-900/40 border border-slate-850 rounded-2xl p-6 h-96 space-y-4 animate-pulse">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800/40">
                    <div className="h-4 w-40 bg-slate-800 rounded-md" />
                    <div className="h-3 w-16 bg-slate-800 rounded-md" />
                  </div>
                  <div className="h-56 bg-slate-950/40 rounded-xl border border-slate-900" />
                  <div className="h-6 bg-slate-900/50 rounded-lg w-full" />
                </div>
              ))}
            </div>
          ) : errorTrends ? (
            /* Error state */
            <div className="bg-red-500/5 border border-red-500/10 rounded-2xl py-12 text-center text-xs text-red-400 max-w-lg mx-auto p-6 space-y-2">
              <AlertOctagon className="w-8 h-8 mx-auto text-red-500 animate-bounce" />
              <h4 className="font-bold text-sm text-slate-100">Telemetry Query Failure</h4>
              <p className="text-slate-400 max-w-xs mx-auto leading-relaxed">{errorTrends}</p>
            </div>
          ) : filteredTrendData.length === 0 ? (
            /* No data state */
            <div className="bg-slate-900/30 border border-slate-850 rounded-2xl py-16 text-center text-xs text-slate-500 max-w-md mx-auto p-6 space-y-2">
              <Database className="w-8 h-8 mx-auto text-slate-600 animate-pulse" />
              <h4 className="font-bold text-sm text-slate-400">No Telemetry Recorded</h4>
              <p className="text-slate-500 max-w-xs mx-auto leading-relaxed">
                No historical records exist for this component and technology filter within the active time range.
              </p>
            </div>
          ) : (
            /* Main Trending Display Grid */
            <div className="space-y-10">
              
              {/* Separate technologies into organized visual groups */}
              {Object.entries(techHeaders).filter(([techKey]) => {
                let key = "vibration";
                if (techKey === "Vibration") key = "vibration";
                else if (techKey === "Thermal") key = "infrared";
                else if (techKey === "Ultrasound") key = "ultrasound";
                else if (techKey === "Electrical") key = "mca";
                else if (techKey === "Oil") key = "oil_analysis";
                return allowedTechKeys.includes(key);
              }).map(([techKey, meta]) => {
                // Find if there is any metric matching this technology
                // The metrics mapping:
                const technologyMetrics = Object.keys(metricsData).filter(metricName => {
                  const pts = metricsData[metricName];
                  if (!Array.isArray(pts) || pts.length === 0) return false;
                  const firstPt = pts[0];
                  if (!firstPt) return false;
                  const tType = firstPt.technology_type || firstPt.diagnosis_result?.technology || "Vibration";
                  return tType === techKey;
                });

                if (technologyMetrics.length === 0) return null;

                return (
                  <div key={techKey} className="space-y-4">
                    
                    {/* Technology Section Header Banner */}
                    <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-4 flex items-start gap-3.5">
                      <span className="text-2xl mt-0.5">{meta.icon}</span>
                      <div>
                        <h4 className="text-sm font-bold text-white font-display flex items-center gap-2">
                          {meta.title}
                        </h4>
                        <p className="text-xs text-slate-400 leading-relaxed mt-1">{meta.desc}</p>
                      </div>
                    </div>

                    {/* Chart Cards Grid */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      {technologyMetrics.map((metricName) => {
                        const data = metricsData[metricName];
                        if (!Array.isArray(data) || data.length === 0) return null;

                        // Calculate statistical values safely
                        const values = Array.isArray(data) ? data.map(pt => pt?.measurement_value || 0) : [];
                        const minVal = values.length > 0 ? Math.min(...values) : 0;
                        const maxVal = values.length > 0 ? Math.max(...values) : 0;
                        const avgVal = values.length > 0 ? (values.reduce((sum, v) => sum + v, 0) / values.length) : 0;
                        const latestPt = Array.isArray(data) && data.length > 0 ? data[data.length - 1] : {} as any;
                        const alarmThreshold = latestPt?.diagnosis_result?.alarm_threshold || 1.0;
                        const isLowerAlarm = latestPt?.data_point_name?.includes("Resistance") || latestPt?.data_point_name?.includes("Viscosity") || latestPt?.data_point_name?.includes("Zinc") || latestPt?.data_point_name?.includes("Phosphorus");
                        
                        // Alarm assessment
                        let isCurrentlyAlarmed = false;
                        if (isLowerAlarm) {
                          isCurrentlyAlarmed = (latestPt?.measurement_value || 0) <= alarmThreshold;
                        } else {
                          isCurrentlyAlarmed = (latestPt?.measurement_value || 0) >= alarmThreshold;
                        }

                        const units = latestPt?.units || "";

                        // Find other metrics in same tech group for comparison
                        const otherMetricsForComparison = technologyMetrics.filter(m => m !== metricName);

                        return (
                          <ChartErrorBoundary key={metricName}>
                            <div className="bg-slate-900/60 border border-slate-850 rounded-2xl p-5 space-y-4 flex flex-col justify-between hover:border-slate-800 transition-all duration-300 shadow-xl print:shadow-none print:border print:border-slate-900">
                              
                              {/* Card Header */}
                              <div className="flex items-start justify-between gap-4 border-b border-slate-800/60 pb-3">
                                <div>
                                  <h5 className="text-xs font-bold text-slate-200 uppercase tracking-wide leading-snug">
                                    {metricName}
                                  </h5>
                                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                                    Units: {units} | Operating Speed: {latestPt?.op_speed !== undefined && latestPt?.op_speed !== null ? `${safeToFixed(latestPt.op_speed, 0)} RPM` : "Variable"}
                                  </p>
                                </div>

                                {/* Alarm Indicator Badge */}
                                <button
                                  onClick={() => setSelectedAlarmDetails({
                                    paramName: metricName,
                                    details: latestPt?.diagnosis_result
                                  })}
                                  className={`px-2.5 py-1 rounded-lg border font-bold text-[9px] flex items-center gap-1.5 transition-all hover:scale-102 uppercase ${
                                    isCurrentlyAlarmed 
                                      ? "bg-red-500/10 border-red-500/30 text-red-400" 
                                      : (latestPt?.measurement_value || 0) >= (alarmThreshold * 0.7) && !isLowerAlarm
                                        ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                                        : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                  }`}
                                >
                                  {isCurrentlyAlarmed ? (
                                    <>
                                      <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                                      <span>Critical Alarm</span>
                                    </>
                                  ) : (latestPt?.measurement_value || 0) >= (alarmThreshold * 0.7) && !isLowerAlarm ? (
                                    <>
                                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                      <span>Warning Status</span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                      <span>Normal status</span>
                                    </>
                                  )}
                                </button>
                              </div>

                              {/* Comparison Panel (Subtle inline options) */}
                              <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-400 bg-slate-950/30 border border-slate-900/60 rounded-xl p-2 px-3 print:hidden">
                                <label className="flex items-center gap-1.5 font-semibold cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={showBaseline[metricName] || false}
                                    onChange={(e) => {
                                      setShowBaseline(prev => ({ ...prev, [metricName]: e.target.checked }));
                                    }}
                                    className="rounded bg-slate-950 border-slate-800 text-yellow-400 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
                                  />
                                  <span>Show baseline ({getBaselineValue(metricName)} {units})</span>
                                </label>

                                {otherMetricsForComparison.length > 0 && (
                                  <div className="flex items-center gap-1.5">
                                    <Layers className="w-3 h-3 text-slate-500" />
                                    <span>Compare with:</span>
                                    <select
                                      value={compareMetric[metricName] || ""}
                                      onChange={(e) => {
                                        setCompareMetric(prev => ({ ...prev, [metricName]: e.target.value }));
                                      }}
                                      className="bg-slate-950 border border-slate-900 rounded-lg px-2 py-0.5 text-[9px] text-slate-300 focus:outline-none"
                                    >
                                      <option value="">-- None --</option>
                                      {otherMetricsForComparison.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>

                              {/* ----------------- Recharts Trending Chart ----------------- */}
                              <div className="h-64 w-full text-[9px] font-mono select-none flex items-center justify-center bg-slate-950/20 rounded-xl border border-slate-900/40">
                                {!data || data.length === 0 ? (
                                  <div className="p-4 text-slate-400 text-center">No trend data available for this selection.</div>
                                ) : (
                                  <ChartErrorBoundary>
                                    <ResponsiveContainer width="100%" height="100%">
                                      <LineChart 
                                        data={data} 
                                        margin={{ top: 15, right: 15, left: -25, bottom: 5 }}
                                      >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" strokeOpacity={0.6} />
                                        <XAxis 
                                          dataKey="measurement_date" 
                                          stroke="#64748b" 
                                          tickFormatter={(str) => {
                                            if (!str) return "";
                                            const d = new Date(str);
                                            return `${d.getMonth() + 1}/${d.getDate()}`;
                                          }}
                                        />
                                        <YAxis stroke="#64748b" domain={['auto', 'auto']} />
                                        <Tooltip 
                                          contentStyle={{ backgroundColor: "#0b0f19", borderColor: "#1e293b", borderRadius: "10px" }} 
                                          labelStyle={{ color: "#f8fafc", fontWeight: "bold" }}
                                          labelFormatter={(label) => label ? new Date(label).toLocaleString() : ""}
                                        />
                                        
                                        <Legend verticalAlign="top" height={36} />

                                        {/* Alarm reference line */}
                                        <ReferenceLine 
                                          y={alarmThreshold} 
                                          label={{ value: `Alarm (${alarmThreshold} ${units})`, fill: "#ef4444", position: "insideBottomRight", fontSize: 8, fontWeight: "bold" }} 
                                          stroke="#ef4444" 
                                          strokeDasharray="4 4" 
                                          strokeWidth={1.5}
                                        />

                                        {/* Baseline comparison line if active */}
                                        {showBaseline[metricName] && (
                                          <ReferenceLine 
                                            y={getBaselineValue(metricName)} 
                                            label={{ value: `Baseline (${getBaselineValue(metricName)})`, fill: "#34d399", position: "insideTopRight", fontSize: 8 }} 
                                            stroke="#34d399" 
                                            strokeDasharray="3 3" 
                                            strokeWidth={1.5}
                                          />
                                        )}

                                        {/* Primary Value Line */}
                                        <Line 
                                          type="monotone" 
                                          dataKey="measurement_value" 
                                          stroke={isCurrentlyAlarmed ? "#f87171" : (latestPt?.measurement_value || 0) >= (alarmThreshold * 0.7) && !isLowerAlarm ? "#fbbf24" : "#22d3ee"} 
                                          strokeWidth={2.5} 
                                          name={metricName}
                                          activeDot={{ r: 6 }} 
                                        />

                                        {/* Comparison metric value line if selected */}
                                        {compareMetric[metricName] && metricsData[compareMetric[metricName]] && (
                                          <Line 
                                            type="monotone" 
                                            data={metricsData[compareMetric[metricName]]}
                                            dataKey="measurement_value" 
                                            stroke="#c084fc" 
                                            strokeWidth={2} 
                                            strokeDasharray="5 5"
                                            name={compareMetric[metricName]}
                                            activeDot={{ r: 5 }} 
                                          />
                                        )}

                                        {/* Brush tool for pan/zoom capability */}
                                        <Brush 
                                          dataKey="measurement_date" 
                                          height={20} 
                                          stroke="#1e293b" 
                                          fill="#090d16"
                                          tickFormatter={(str) => {
                                            if (!str) return "";
                                            const d = new Date(str);
                                            return `${d.getMonth() + 1}/${d.getDate()}`;
                                          }}
                                          className="print:hidden"
                                        />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </ChartErrorBoundary>
                                )}
                              </div>

                            {/* Min / Max / Average Status Stats */}
                            <div className="grid grid-cols-3 gap-2 bg-slate-950/40 border border-slate-900/60 rounded-xl p-2.5 text-center text-[10px]">
                              <div>
                                <span className="text-slate-500 block uppercase font-mono text-[9px]">Minimum</span>
                                <span className="font-bold text-slate-300 font-mono">{safeToFixed(minVal, 4)} {units}</span>
                              </div>
                              <div className="border-x border-slate-900">
                                <span className="text-slate-500 block uppercase font-mono text-[9px]">Average</span>
                                <span className="font-bold text-slate-300 font-mono">{safeToFixed(avgVal, 4)} {units}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 block uppercase font-mono text-[9px]">Maximum</span>
                                <span className="font-bold text-slate-100 font-mono">{safeToFixed(maxVal, 4)} {units}</span>
                              </div>
                            </div>

                            {/* Raw Data Table Expand Button */}
                            <div className="border-t border-slate-900 pt-3 flex items-center justify-between gap-4 print:hidden">
                              <button
                                type="button"
                                onClick={() => handleExportCSV(metricName, data)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white transition-colors"
                              >
                                <Download className="w-3.5 h-3.5 text-yellow-400" />
                                <span>Export to CSV</span>
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => setExpandedTables(prev => ({ ...prev, [metricName]: !prev[metricName] }))}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
                              >
                                <span>{expandedTables[metricName] ? "Hide Raw Data" : "View Raw Data"}</span>
                                {expandedTables[metricName] ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>

                            {/* ----------------- 5. Expandable Sortable Filterable Raw Data Table ----------------- */}
                            <AnimatePresence>
                              {expandedTables[metricName] && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden border-t border-slate-900 pt-4 space-y-3"
                                >
                                  {/* Table Controls (Search filter) */}
                                  <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                      <input
                                        type="text"
                                        placeholder="Filter notes or status..."
                                        value={tableFilters[metricName] || ""}
                                        onChange={(e) => setTableFilters(prev => ({ ...prev, [metricName]: e.target.value }))}
                                        className="w-full bg-slate-950 border border-slate-900 rounded-lg pl-8 pr-3 py-1.5 text-[10px] text-slate-200 focus:outline-none focus:border-yellow-400"
                                      />
                                    </div>
                                    {(tableFilters[metricName] || tableSort[metricName]) && (
                                      <button
                                        onClick={() => {
                                          setTableFilters(prev => ({ ...prev, [metricName]: "" }));
                                          setTableSort(prev => ({ ...prev, [metricName]: { field: "measurement_date", order: "desc" } }));
                                        }}
                                        className="text-[9px] font-bold text-yellow-500 hover:text-yellow-400 transition-all px-2 py-1 bg-yellow-400/5 rounded border border-yellow-400/15"
                                      >
                                        Clear Filter
                                      </button>
                                    )}
                                  </div>

                                  {/* Render actual HTML Table */}
                                  <div className="overflow-x-auto border border-slate-900 rounded-xl bg-slate-950/40">
                                    <table className="w-full text-[10px] font-medium border-collapse text-left">
                                      <thead>
                                        <tr className="border-b border-slate-900 bg-slate-950 text-slate-400 font-mono text-[9px] uppercase tracking-wider">
                                          <th 
                                            onClick={() => {
                                              const currentOrder = tableSort[metricName]?.field === "measurement_date" ? tableSort[metricName].order : "desc";
                                              setTableSort(prev => ({
                                                ...prev,
                                                [metricName]: { field: "measurement_date", order: currentOrder === "asc" ? "desc" : "asc" }
                                              }));
                                            }}
                                            className="p-2 px-3 cursor-pointer hover:bg-slate-900 text-slate-200"
                                          >
                                            Date / Time {tableSort[metricName]?.field === "measurement_date" ? (tableSort[metricName].order === "asc" ? "▲" : "▼") : ""}
                                          </th>
                                          <th 
                                            onClick={() => {
                                              const currentOrder = tableSort[metricName]?.field === "measurement_value" ? tableSort[metricName].order : "desc";
                                              setTableSort(prev => ({
                                                ...prev,
                                                [metricName]: { field: "measurement_value", order: currentOrder === "asc" ? "desc" : "asc" }
                                              }));
                                            }}
                                            className="p-2 cursor-pointer hover:bg-slate-900 text-slate-200 text-right"
                                          >
                                            Value {tableSort[metricName]?.field === "measurement_value" ? (tableSort[metricName].order === "asc" ? "▲" : "▼") : ""}
                                          </th>
                                          <th className="p-2">Units</th>
                                          <th className="p-2 text-right">RPM</th>
                                          <th className="p-2 text-center">Status</th>
                                          <th className="p-2">Notes</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-900/60 text-slate-300">
                                        {(() => {
                                          let records = Array.isArray(data) ? [...data] : [];
                                          // Apply Filter
                                          const txt = (tableFilters[metricName] || "").toLowerCase();
                                          if (txt) {
                                            records = records.filter(r => 
                                              (r.notes || "").toLowerCase().includes(txt) || 
                                              (r.state || "").toLowerCase().includes(txt)
                                            );
                                          }
                                          // Apply Sort
                                          const sortObj = tableSort[metricName];
                                          if (sortObj) {
                                            records.sort((a, b) => {
                                              let valA: any = a[sortObj.field as keyof AnalysisRecord];
                                              let valB: any = b[sortObj.field as keyof AnalysisRecord];
                                              
                                              if (sortObj.field === "measurement_date") {
                                                valA = new Date(valA).getTime();
                                                valB = new Date(valB).getTime();
                                              }
                                              
                                              if (valA < valB) return sortObj.order === "asc" ? -1 : 1;
                                              if (valA > valB) return sortObj.order === "asc" ? 1 : -1;
                                              return 0;
                                            });
                                          } else {
                                            // default date desc
                                            records.sort((a, b) => new Date(b.measurement_date).getTime() - new Date(a.measurement_date).getTime());
                                          }

                                          return records.map((row) => (
                                            <tr key={row.id} className="hover:bg-slate-950/60 transition-colors">
                                              <td className="p-2 px-3 font-mono text-slate-400 whitespace-nowrap">
                                                {new Date(row.measurement_date).toLocaleString()}
                                              </td>
                                              <td className="p-2 text-right font-bold text-slate-200 font-mono">
                                                {row.measurement_value}
                                              </td>
                                              <td className="p-2 font-mono text-slate-500">{row.units}</td>
                                              <td className="p-2 text-right text-slate-400 font-mono">{row.op_speed !== undefined && row.op_speed !== null ? `${safeToFixed(row.op_speed, 0)}` : "N/A"}</td>
                                              <td className="p-2 text-center">
                                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                                  row.alarm_status 
                                                    ? "bg-red-400/10 text-red-400 border border-red-500/10" 
                                                    : "bg-emerald-400/10 text-emerald-400 border border-emerald-500/10"
                                                }`}>
                                                  {row.alarm_status ? "ALARM" : "NOMINAL"}
                                                </span>
                                              </td>
                                              <td className="p-2 text-slate-400 leading-normal max-w-xs truncate" title={row.notes}>
                                                {row.notes}
                                              </td>
                                            </tr>
                                          ));
                                        })()}
                                      </tbody>
                                    </table>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                          </div>
                        </ChartErrorBoundary>
                      );
                    })}
                  </div>

                  </div>
                );
              })}

            </div>
          )}
        </>
      )}

      {/* ----------------- 4. Alarm Information Popover Modal ----------------- */}
      <AnimatePresence>
        {selectedAlarmDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl relative"
            >
              <div className="flex items-start gap-3 pb-3 border-b border-slate-800">
                <span className="p-2 bg-red-400/10 border border-red-400/20 rounded-xl text-red-500 shrink-0">
                  <AlertOctagon className="w-5 h-5 animate-bounce" />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-slate-200">
                    Alarm Diagnostic Insights
                  </h4>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono mt-0.5">
                    Parameter: {selectedAlarmDetails.paramName}
                  </p>
                </div>
              </div>

              <div className="space-y-3.5 text-xs text-slate-300 leading-relaxed">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Deterioration Level</span>
                  <p className="bg-slate-950 p-3 rounded-xl border border-slate-900 font-medium text-slate-300">
                    {selectedAlarmDetails.details?.diagnostic_brief || "Local operating parameters show direct violations of manufacturer tolerances. Fatigue wear and micro-contact friction detected."}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Recommended Correction</span>
                  <p className="bg-slate-950 p-3 rounded-xl border border-slate-900 font-medium text-yellow-400">
                    {selectedAlarmDetails.details?.recommendation || "Verify machine alignment using laser tooling, purge and replenish lithium-complex grease. If symptoms persist, schedule scheduled component overhaul."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-center bg-slate-950 p-2.5 rounded-xl border border-slate-900">
                  <div>
                    <span className="text-[9px] font-semibold text-slate-500 block uppercase">Trigger Value</span>
                    <span className="font-bold text-red-400 font-mono text-xs">
                      {selectedAlarmDetails.details?.current_value !== undefined && selectedAlarmDetails.details?.current_value !== null ? safeToFixed(selectedAlarmDetails.details.current_value, 4) : "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-semibold text-slate-500 block uppercase">Tolerance Threshold</span>
                    <span className="font-bold text-slate-300 font-mono text-xs">
                      {selectedAlarmDetails.details?.alarm_threshold || "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedAlarmDetails(null)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold rounded-xl text-xs transition-colors border border-slate-700/60"
              >
                DISMISS INSIGHTS
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ----------------- 5. Export Printable Report Modal ----------------- */}
      <AnimatePresence>
        {showPrintReport && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950 p-4 sm:p-6 lg:p-10 flex flex-col items-center">
            
            {/* Top Toolbar */}
            <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4 mb-6 shadow-2xl print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-yellow-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Print Preview and Generation Panel</h4>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPrintReport(false)}
                  className="px-3.5 py-2 bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-xl font-bold text-xs transition-colors"
                >
                  Close Preview
                </button>
                <button
                  onClick={triggerPrintReport}
                  className="px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md"
                >
                  <Download className="w-4 h-4" />
                  <span>Download / Print PDF</span>
                </button>
              </div>
            </div>

            {/* Printable Area Layout */}
            <div className="w-full max-w-4xl bg-white text-slate-900 p-8 sm:p-12 rounded-2xl shadow-2xl print:shadow-none print:p-0 print:m-0 flex flex-col justify-between min-h-[297mm]">
              
              <div className="space-y-6">
                
                {/* Brand Header */}
                <div className="border-b-4 border-slate-900 pb-4 flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase font-display">
                      MotorMedic Pro <span className="text-yellow-600 font-bold">Trends</span>
                    </h1>
                    <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mt-1">
                      Continuous Machinery Condition Telemetry Report
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded border border-slate-200">
                      SECURE REPORT KEY: #MM-{selectedComponentId}-{Date.now().toString().slice(-6)}
                    </span>
                    <p className="text-[9px] text-slate-500 font-mono mt-1.5">
                      GENERATED ON: {new Date().toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Metadata Table */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Plant Site</span>
                    <span className="font-bold text-slate-800">{currentPlant?.name || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Route Area</span>
                    <span className="font-bold text-slate-800">{currentRoute?.name || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Target Machinery</span>
                    <span className="font-bold text-slate-800">{currentAsset?.name || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Sub-Component</span>
                    <span className="font-bold text-yellow-600 font-black">{currentComponent?.name || "N/A"}</span>
                  </div>
                </div>

                {/* Diagnostic Overview Summary */}
                <div className="border border-slate-200 rounded-xl p-5 space-y-3 bg-slate-50">
                  <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                    Executive Analysis Brief
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-600">
                    A multi-technology analysis was conducted on the sub-component <strong className="text-slate-800">{currentComponent?.name}</strong>. 
                    A total of {rawTrendData.length} physical telemetry readings were processed across the selected intervals. 
                    {rawTrendData.some(r => r.alarm_status) ? (
                      <span className="text-red-600 font-bold"> Warning and critical limits have been violated in active parameters. Proactive corrective maintenance is recommended to restore nominal baseline tolerances.</span>
                    ) : (
                      <span className="text-emerald-600 font-bold"> All tracked telemetry metrics are operating within acceptable ISO standards. Routine monitoring scheduled.</span>
                    )}
                  </p>
                </div>

                {/* Charts list as static layout list for print */}
                <div className="space-y-6 pt-4">
                  <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider border-b-2 border-slate-800 pb-1.5">
                    Trend Metric Profiles
                  </h3>
                  
                  {Array.isArray(Object.entries(metricsData)) && (Object.entries(metricsData) as [string, AnalysisRecord[]][]).filter(([_, records]) => {
                    if (!Array.isArray(records) || records.length === 0) return false;
                    const firstPt = records[0];
                    if (!firstPt) return false;
                    const rowTech = ((firstPt as any).technology_type || firstPt.diagnosis_result?.technology || "Vibration").toLowerCase();
                    let rowKey = "vibration";
                    if (rowTech.includes("vibration")) rowKey = "vibration";
                    else if (rowTech.includes("thermal") || rowTech.includes("infrared")) rowKey = "infrared";
                    else if (rowTech.includes("ultrasound")) rowKey = "ultrasound";
                    else if (rowTech.includes("electrical") || rowTech.includes("mca")) rowKey = "mca";
                    else if (rowTech.includes("oil")) rowKey = "oil_analysis";
                    return allowedTechKeys.includes(rowKey);
                  }).map(([name, records]) => {
                    if (!Array.isArray(records) || records.length === 0) return null;
                    const latest = records[records.length - 1];
                    const alarmVal = latest?.diagnosis_result?.alarm_threshold || 1.0;
                    const val = latest?.measurement_value || 0;
                    const status = val >= alarmVal ? "ALARM" : "NORMAL";

                    return (
                      <div key={name} className="border border-slate-200 rounded-xl p-4 grid grid-cols-3 gap-6 items-center bg-white page-break-inside-avoid">
                        <div className="col-span-1 space-y-1.5">
                          <h4 className="text-[11px] font-black uppercase text-slate-800">{name}</h4>
                          <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-bold ${
                            status === "ALARM" ? "bg-red-100 text-red-800 border border-red-200" : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          }`}>
                            STATUS: {status}
                          </span>
                          <div className="text-[10px] font-mono text-slate-500 space-y-0.5">
                            <p>Current: {safeToFixed(val, 4)} {latest?.units || ""}</p>
                            <p>Alarm Limit: {alarmVal} {latest?.units || ""}</p>
                            <p>Operating Speed: {latest && latest.op_speed !== undefined && latest.op_speed !== null ? `${safeToFixed(latest.op_speed, 0)} RPM` : "N/A"}</p>
                          </div>
                        </div>

                        {/* Miniature Sparkline chart for print output */}
                        <div className="col-span-2 h-24 flex items-center justify-center">
                          {!records || records.length === 0 ? (
                            <div className="p-4 text-gray-400 text-[10px]">No trend data available.</div>
                          ) : (
                            <ChartErrorBoundary>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={records}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                  <XAxis dataKey="measurement_date" hide />
                                  <YAxis domain={['auto', 'auto']} hide />
                                  <ReferenceLine y={alarmVal} stroke="#ef4444" strokeDasharray="3 3" />
                                  <Line type="monotone" dataKey="measurement_value" stroke={status === "ALARM" ? "#ef4444" : "#0284c7"} strokeWidth={2} dot={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            </ChartErrorBoundary>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>

              {/* Printable Footer */}
              <div className="border-t border-slate-200 pt-6 mt-12 text-center text-[9px] text-slate-400 flex items-center justify-between">
                <span>© {new Date().getFullYear()} MotorMedic Pro condition monitoring group. All rights reserved.</span>
                <span>Page 1 of 1</span>
              </div>

            </div>

          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
