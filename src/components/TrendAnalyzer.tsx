import React, { useState, useMemo } from "react";
import { TrendDataPoint } from "../types";
import { 
  ComposedChart, LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Legend 
} from "recharts";
import { 
  TrendingUp, Calendar, AlertTriangle, CheckCircle2, PlusCircle, Wrench, 
  Thermometer, Gauge, Zap, Activity, Sparkles, Layers, Filter, Clock, 
  ArrowUpRight, ShieldAlert, Info, Sliders, Download, Maximize2, RefreshCw,
  X, Check
} from "lucide-react";

interface TrendAnalyzerProps {
  trendData?: TrendDataPoint[];
  onAddTrendPoint?: (point: Omit<TrendDataPoint, "id" | "timestamp">) => void;
  selectedAssetId?: string;
}

type TimeRange = "7d" | "30d" | "90d" | "1y";
type SensorAxis = "ALL" | "H" | "V" | "A";

interface AssetSpec {
  id: string;
  name: string;
  point: string;
  type: string;
  isoZone: "Zone A" | "Zone B" | "Zone C" | "Zone D";
  statusText: string;
  currentVib: number;
  baselineVib: number;
  rpm: number;
  dominantFreq: string;
  aiSummary: string;
  recommendedAction: string;
  rulDays: string;
}

const ASSET_SPEC_LIST: AssetSpec[] = [
  {
    id: "pump-a-de-h",
    name: "Boiler Feed Pump A",
    point: "Drive End Horizontal (1H)",
    type: "Centrifugal Pump",
    isoZone: "Zone A",
    statusText: "HEALTHY / NORMAL",
    currentVib: 1.62,
    baselineVib: 1.20,
    rpm: 1780,
    dominantFreq: "29.7 Hz (1X Shaft Speed)",
    aiSummary: "Trend is stable. Vibration levels are within ISO Zone A (Good). No anomalous peaks detected in the spectrum.",
    recommendedAction: "Continue routine 30-day vibration sampling. Lubrication condition normal.",
    rulDays: "> 180 Days"
  },
  {
    id: "pump-a-nde-v",
    name: "Boiler Feed Pump A",
    point: "Non-Drive End Vertical (2V)",
    type: "Centrifugal Pump",
    isoZone: "Zone C",
    statusText: "WARNING / ALERT",
    currentVib: 3.45,
    baselineVib: 1.35,
    rpm: 1780,
    dominantFreq: "178.2 Hz (BPFO Bearing Outer Race)",
    aiSummary: "Elevated vibration trend detected in ISO Zone C (Warning). High 178.2 Hz peak indicates early outer race defect on bearing 6314.",
    recommendedAction: "Perform ultrasonic grease scan. Schedule bearing replacement during next planned outage within 30 days.",
    rulDays: "25 - 35 Days"
  },
  {
    id: "motor-b-de-r",
    name: "Main Induction Motor B",
    point: "Inboard Radial (1R)",
    type: "Electric Motor (4-Pole)",
    isoZone: "Zone B",
    statusText: "ACCEPTABLE",
    currentVib: 2.25,
    baselineVib: 1.10,
    rpm: 1785,
    dominantFreq: "59.5 Hz (2X Misalignment Peak)",
    aiSummary: "Vibration is within ISO Zone B (Acceptable). Slight 2X harmonic rise indicates minor shaft angular misalignment.",
    recommendedAction: "Check thermal growth alignment offsets during next shutdown.",
    rulDays: "90 - 120 Days"
  },
  {
    id: "fan-204-brg1-h",
    name: "Cooling Tower Fan 204",
    point: "Bearing 1 Horizontal (1H)",
    type: "Industrial Fan",
    isoZone: "Zone B",
    statusText: "ACCEPTABLE",
    currentVib: 2.65,
    baselineVib: 1.40,
    rpm: 890,
    dominantFreq: "14.8 Hz (1X Unbalance)",
    aiSummary: "Vibration level is stable in ISO Zone B. Blade pass frequency harmonics are within expected tolerances.",
    recommendedAction: "Inspect fan blades for dirt accumulation at next PM cycle.",
    rulDays: "> 120 Days"
  },
  {
    id: "gearbox-302-hss-h",
    name: "Extruder Gearbox GB-302",
    point: "High Speed Shaft Horizontal (1H)",
    type: "Helical Gearbox",
    isoZone: "Zone D",
    statusText: "CRITICAL / DANGER",
    currentVib: 5.85,
    baselineVib: 1.60,
    rpm: 1480,
    dominantFreq: "493.3 Hz (Gear Mesh Frequency GMF)",
    aiSummary: "CRITICAL ALERT: Vibration levels exceeded ISO Zone D (> 4.5 mm/s). High amplitude gear mesh harmonics indicate severe tooth pitting or wear.",
    recommendedAction: "IMMEDIATE INSPECTION REQUIRED: Perform oil sample particle analysis and scope gearbox internals.",
    rulDays: "< 7 Days"
  }
];

// Helper to generate realistic trend time series data
function generateTrendTimeSeries(
  asset: AssetSpec, 
  timeRange: TimeRange, 
  axis: SensorAxis
) {
  const pointsCount = timeRange === "7d" ? 14 : timeRange === "30d" ? 30 : timeRange === "90d" ? 45 : 60;
  const now = new Date();
  const dayStep = timeRange === "7d" ? 0.5 : timeRange === "30d" ? 1 : timeRange === "90d" ? 2 : 6;
  
  const baseVib = asset.baselineVib;
  const targetVib = asset.currentVib;
  
  // Axis factor adjustment
  const axisFactor = axis === "H" ? 1.0 : axis === "V" ? 0.88 : axis === "A" ? 0.75 : 1.0;

  const list = [];
  for (let i = pointsCount - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * dayStep * 24 * 3600 * 1000);
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const fullDateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

    // Progress curve from baseline to target with noise
    const progress = (pointsCount - 1 - i) / (pointsCount - 1);
    const noise = (Math.sin(i * 1.5) * 0.12) + (Math.cos(i * 0.7) * 0.08);
    const calculatedVib = Math.max(0.2, Number(( (baseVib + (targetVib - baseVib) * Math.pow(progress, 1.2) + noise) * axisFactor ).toFixed(2)));
    const baselineVal = Number((baseVib * axisFactor).toFixed(2));
    
    // ISO classification for point
    let zone = "Zone A";
    if (calculatedVib >= 4.5) zone = "Zone D";
    else if (calculatedVib >= 2.8) zone = "Zone C";
    else if (calculatedVib >= 1.8) zone = "Zone B";

    list.push({
      timestamp: fullDateStr,
      displayDate: dateStr,
      vibration: calculatedVib,
      baseline: baselineVal,
      rpm: asset.rpm + Math.floor(Math.sin(i) * 6),
      temperature: Math.round(52 + progress * 24 + Math.sin(i) * 3),
      isoZone: zone,
      peakFreq: asset.dominantFreq
    });
  }

  return list;
}

// Helper to generate simulated FFT Spectrum data (0 to 1000 Hz)
function generateFFTSpectrum(asset: AssetSpec) {
  const bars = [];
  const runSpeedHz = Number((asset.rpm / 60).toFixed(1)); // 1X
  
  for (let f = 10; f <= 1000; f += 10) {
    let amp = 0.04 + Math.sin(f * 0.3) * 0.02 + Math.cos(f * 0.1) * 0.015;
    let faultType: "normal" | "fundamental" | "warning" | "critical" = "normal";
    let label = "";

    // 1X Running Speed
    if (Math.abs(f - runSpeedHz) < 8) {
      amp = asset.isoZone === "Zone D" ? 1.85 : 1.25;
      faultType = "fundamental";
      label = `1X Speed (${runSpeedHz} Hz)`;
    } 
    // 2X Harmonic (Misalignment)
    else if (Math.abs(f - runSpeedHz * 2) < 8) {
      amp = asset.isoZone === "Zone C" ? 2.10 : asset.isoZone === "Zone D" ? 2.40 : 0.45;
      faultType = asset.isoZone === "Zone C" || asset.isoZone === "Zone D" ? "warning" : "normal";
      label = `2X Harmonic (${(runSpeedHz * 2).toFixed(1)} Hz)`;
    } 
    // 3X Harmonic
    else if (Math.abs(f - runSpeedHz * 3) < 8) {
      amp = 0.35 + Math.random() * 0.15;
      faultType = "normal";
      label = `3X Harmonic`;
    }
    // BPFO Outer Race Fault (~178 Hz)
    else if (Math.abs(f - 180) < 8 && (asset.id.includes("nde") || asset.isoZone === "Zone C")) {
      amp = 2.95;
      faultType = "critical";
      label = "BPFO Outer Race Bearing Fault (178.2 Hz)";
    }
    // Gear Mesh Frequency GMF (~490 Hz)
    else if (Math.abs(f - 490) < 12 && asset.id.includes("gearbox")) {
      amp = 4.20;
      faultType = "critical";
      label = "Gear Mesh Frequency GMF (493.3 Hz)";
    }
    // Vane Pass Frequency (~350 Hz)
    else if (Math.abs(f - 350) < 10 && asset.id.includes("pump")) {
      amp = 0.85;
      faultType = "warning";
      label = "Vane Pass Frequency (356.4 Hz)";
    }

    bars.push({
      frequency: f,
      amplitude: Number(Math.max(0.02, amp).toFixed(2)),
      faultType,
      label,
      harmonicOrder: (f / runSpeedHz).toFixed(2) + "X"
    });
  }

  return bars;
}

export default function TrendAnalyzer({ trendData, onAddTrendPoint, selectedAssetId }: TrendAnalyzerProps) {
  // Main Selection & Filter States
  const [selectedAssetKey, setSelectedAssetKey] = useState<string>(selectedAssetId || ASSET_SPEC_LIST[0].id);
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [sensorAxis, setSensorAxis] = useState<SensorAxis>("H");
  const [compareBaseline, setCompareBaseline] = useState<boolean>(true);
  
  // Manual Entry Form Modal State
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [manualVib, setManualVib] = useState<string>("");
  const [manualTemp, setManualTemp] = useState<string>("");
  const [manualRpm, setManualRpm] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");

  // Get active asset object
  const activeAsset = useMemo(() => {
    return ASSET_SPEC_LIST.find((a) => a.id === selectedAssetKey) || ASSET_SPEC_LIST[0];
  }, [selectedAssetKey]);

  // Time Series Data calculation
  const trendTimeSeriesData = useMemo(() => {
    return generateTrendTimeSeries(activeAsset, timeRange, sensorAxis);
  }, [activeAsset, timeRange, sensorAxis]);

  // Spectrum Data calculation
  const fftSpectrumData = useMemo(() => {
    return generateFFTSpectrum(activeAsset);
  }, [activeAsset]);

  // Active fault peaks filtered for annotations
  const faultPeaks = useMemo(() => {
    return fftSpectrumData.filter((bar) => bar.faultType === "critical" || bar.faultType === "warning");
  }, [fftSpectrumData]);

  // Handle Manual Log Submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualVib) {
      setSuccessMsg("⚠️ Please enter a valid vibration reading.");
      return;
    }

    if (onAddTrendPoint) {
      onAddTrendPoint({
        equipmentName: activeAsset.name,
        vibrationVelocity: parseFloat(manualVib),
        bearingTemperature: parseFloat(manualTemp || "60"),
        hydraulicPressure: 120,
        electricalAmperage: 38.5
      });
    }

    setSuccessMsg(`✓ Telemetry logged for ${activeAsset.name} (${manualVib} mm/s RMS)`);
    setManualVib("");
    setManualTemp("");
    setManualRpm("");
    setTimeout(() => {
      setSuccessMsg("");
      setShowAddForm(false);
    }, 2000);
  };

  // Status color pill generator
  const getZoneBadge = (zone: string) => {
    switch (zone) {
      case "Zone A":
        return { bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400", label: "ISO Zone A (Good)" };
      case "Zone B":
        return { bg: "bg-cyan-500/10 border-cyan-500/30 text-cyan-400", label: "ISO Zone B (Acceptable)" };
      case "Zone C":
        return { bg: "bg-amber-500/10 border-amber-500/30 text-amber-400", label: "ISO Zone C (Warning)" };
      case "Zone D":
        return { bg: "bg-red-500/10 border-red-500/30 text-red-400", label: "ISO Zone D (Danger)" };
      default:
        return { bg: "bg-slate-800 border-slate-700 text-slate-300", label: zone };
    }
  };

  const zoneInfo = getZoneBadge(activeAsset.isoZone);

  return (
    <div className="space-y-6 text-slate-100 font-sans">
      
      {/* ------------------- HEADER & ACTIONS BAR ------------------- */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400 shadow-inner">
              <TrendingUp className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight font-display flex items-center gap-2">
                Machinery Trend Analyzer
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-cyan-400">
                  ISO 10816-3
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Category IV vibration velocity trends, frequency spectrum (FFT), and automated ISO diagnostic bounds
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-all shadow-md active:scale-95"
          >
            <PlusCircle className="w-4 h-4 text-cyan-400" />
            <span>Manual Telemetry Log</span>
          </button>

          <button
            onClick={() => alert("Exporting vibration trends dataset to CSV...")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Export Trend CSV</span>
          </button>
        </div>
      </div>

      {/* ------------------- ASSET SELECTOR & CONTROLS BAR ------------------- */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
          
          {/* 1. Asset & Measurement Point Dropdown */}
          <div className="space-y-1 lg:col-span-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Select Equipment Asset & Measurement Point</span>
              <span className="text-cyan-400 font-mono text-[9px]">{activeAsset.type}</span>
            </label>
            <select
              value={selectedAssetKey}
              onChange={(e) => setSelectedAssetKey(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-semibold focus:outline-none focus:border-cyan-400 transition-colors cursor-pointer"
            >
              {ASSET_SPEC_LIST.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name} — {asset.point} [{asset.isoZone}]
                </option>
              ))}
            </select>
          </div>

          {/* 2. Time Range Selector Toggle */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Time Range
            </label>
            <div className="grid grid-cols-4 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {(["7d", "30d", "90d", "1y"] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                    timeRange === range
                      ? "bg-cyan-500 text-slate-950 shadow-md"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {range.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Sensor Direction & Baseline Switch */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Options & Baseline
            </label>
            <div className="flex items-center gap-2">
              {/* Sensor Direction */}
              <div className="flex-1 bg-slate-950 p-1 rounded-xl border border-slate-800 flex justify-between">
                {(["ALL", "H", "V", "A"] as SensorAxis[]).map((ax) => (
                  <button
                    key={ax}
                    onClick={() => setSensorAxis(ax)}
                    className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-all ${
                      sensorAxis === ax
                        ? "bg-slate-800 text-cyan-400 border border-cyan-500/30"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {ax}
                  </button>
                ))}
              </div>

              {/* Compare Baseline Toggle */}
              <button
                onClick={() => setCompareBaseline(!compareBaseline)}
                className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                  compareBaseline
                    ? "bg-purple-500/10 border-purple-500/40 text-purple-300"
                    : "bg-slate-950 border-slate-800 text-slate-400"
                }`}
                title="Toggle baseline reference line comparison"
              >
                <div className={`w-2 h-2 rounded-full ${compareBaseline ? "bg-purple-400 animate-ping" : "bg-slate-600"}`} />
                <span>Baseline</span>
              </button>
            </div>
          </div>

        </div>

        {/* Live Metrics Summary Bar */}
        <div className="pt-3 border-t border-slate-800/60 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-850 flex items-center justify-between">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Current Velocity</span>
              <span className="text-sm font-bold text-white font-mono">{activeAsset.currentVib} <span className="text-[10px] text-slate-400">mm/s RMS</span></span>
            </div>
            <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
          </div>

          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-850 flex items-center justify-between">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">ISO 10816 Zone</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-md border inline-block mt-0.5 ${zoneInfo.bg}`}>
                {zoneInfo.label}
              </span>
            </div>
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          </div>

          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-850 flex items-center justify-between">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Machine Speed</span>
              <span className="text-sm font-bold text-white font-mono">{activeAsset.rpm} <span className="text-[10px] text-slate-400">RPM</span></span>
            </div>
            <Gauge className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>

          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-850 flex items-center justify-between">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Dominant Peak</span>
              <span className="text-xs font-bold text-amber-300 font-mono truncate max-w-[120px] block">{activeAsset.dominantFreq}</span>
            </div>
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
          </div>
        </div>
      </div>

      {/* ------------------- MAIN TREND CHART (OVERALL VIBRATION) ------------------- */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">
              1. Overall Vibration Trend (mm/s RMS)
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold">
            <span className="flex items-center gap-1 text-emerald-400"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/40 inline-block"></span> Zone A/B Good (0 - 2.8)</span>
            <span className="flex items-center gap-1 text-amber-400"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500/20 border border-amber-500/40 inline-block"></span> Zone C Warning (2.8 - 4.5)</span>
            <span className="flex items-center gap-1 text-red-400"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/20 border border-red-500/40 inline-block"></span> Zone D Danger (&gt;4.5)</span>
          </div>
        </div>

        {/* Recharts Main Trend Container */}
        <div className="h-80 w-full text-xs">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trendTimeSeriesData} margin={{ top: 15, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              
              <XAxis 
                dataKey="displayDate" 
                stroke="#64748b" 
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                tickLine={false}
              />
              
              <YAxis 
                stroke="#64748b" 
                domain={[0, Math.max(7, Math.ceil(activeAsset.currentVib + 1.5))]} 
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                unit=" mm/s"
              />

              {/* Custom Hover Tooltip */}
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    const zBadge = getZoneBadge(data.isoZone);
                    return (
                      <div className="bg-slate-950/95 border border-slate-750 p-3.5 rounded-xl shadow-2xl backdrop-blur-md space-y-2 min-w-[210px] text-xs">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                          <span className="font-bold text-white">{data.timestamp}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${zBadge.bg}`}>
                            {data.isoZone}
                          </span>
                        </div>
                        <div className="space-y-1 text-slate-300 font-mono text-[11px]">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Overall Vib:</span>
                            <span className="font-bold text-cyan-400">{data.vibration} mm/s RMS</span>
                          </div>
                          {compareBaseline && (
                            <div className="flex justify-between text-purple-300">
                              <span className="text-slate-400">Baseline:</span>
                              <span>{data.baseline} mm/s</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-slate-400">Machine Speed:</span>
                            <span className="text-emerald-400">{data.rpm} RPM</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Bearing Temp:</span>
                            <span className="text-amber-400">{data.temperature} °C</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />

              {/* ISO 10816 Zone Background Regions */}
              <ReferenceArea y1={0} y2={2.8} shape={(props: any) => <rect x={props.x} y={props.y} width={props.width} height={props.height} fill="#10b981" fillOpacity={0.08} />} />
              <ReferenceArea y1={2.8} y2={4.5} shape={(props: any) => <rect x={props.x} y={props.y} width={props.width} height={props.height} fill="#f59e0b" fillOpacity={0.12} />} />
              <ReferenceArea y1={4.5} y2={12.0} shape={(props: any) => <rect x={props.x} y={props.y} width={props.width} height={props.height} fill="#ef4444" fillOpacity={0.15} />} />

              {/* Threshold Lines */}
              <ReferenceLine y={2.8} stroke="#fbbf24" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: "ISO Warning Limit (2.8 mm/s)", fill: "#fbbf24", position: "insideTopRight", fontSize: 10, fontWeight: "bold" }} />
              <ReferenceLine y={4.5} stroke="#f87171" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: "ISO Danger Limit (4.5 mm/s)", fill: "#f87171", position: "insideTopRight", fontSize: 10, fontWeight: "bold" }} />

              {/* Baseline Reference Line/Curve */}
              {compareBaseline && (
                <Line 
                  type="monotone" 
                  dataKey="baseline" 
                  stroke="#a855f7" 
                  strokeWidth={2} 
                  strokeDasharray="5 5" 
                  dot={false}
                  name="Baseline Reference" 
                />
              )}

              {/* Main Overall Vibration Line (Bright Cyan Neon) */}
              <Line 
                type="monotone" 
                dataKey="vibration" 
                stroke="#06b6d4" 
                strokeWidth={3} 
                dot={{ r: 4, fill: "#06b6d4", stroke: "#083344", strokeWidth: 2 }}
                activeDot={{ r: 7, fill: "#22d3ee", stroke: "#ffffff", strokeWidth: 2 }}
                name="Overall Vibration (mm/s RMS)" 
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <p className="text-[11px] text-slate-400 text-center leading-normal">
          ISO 10816-3 Class II / III machinery criteria: Green (Good 0-2.8 mm/s RMS), Yellow (Warning 2.8-4.5 mm/s RMS), Red (Unrestricted Danger &gt;4.5 mm/s RMS).
        </p>
      </div>

      {/* ------------------- SECONDARY CHART (FFT FREQUENCY SPECTRUM) ------------------- */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">
              2. Simulated Frequency Spectrum (FFT View: 0 - 1000 Hz)
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold">
            <span className="flex items-center gap-1 text-cyan-400"><span className="w-2.5 h-2.5 rounded-sm bg-cyan-500 inline-block"></span> 1X Running Speed</span>
            <span className="flex items-center gap-1 text-amber-400"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block"></span> Harmonic / Warning Peak</span>
            <span className="flex items-center gap-1 text-red-400"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block"></span> Critical Fault Peak</span>
          </div>
        </div>

        {/* Fault Peaks Banner Callout */}
        {faultPeaks.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-red-400 font-bold">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>Detected Spectral Fault Peak(s):</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {faultPeaks.map((peak, idx) => (
                <span key={idx} className="bg-slate-950 border border-red-500/30 text-red-300 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1">
                  {peak.label} — {peak.amplitude} mm/s
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recharts Bar Chart FFT Spectrum */}
        <div className="h-64 w-full text-xs">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={fftSpectrumData} margin={{ top: 15, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              
              <XAxis 
                dataKey="frequency" 
                stroke="#64748b" 
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                tickFormatter={(v) => `${v} Hz`}
              />
              
              <YAxis 
                stroke="#64748b" 
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                unit=" mm/s"
              />

              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const bar = payload[0].payload;
                    return (
                      <div className="bg-slate-950/95 border border-slate-800 p-3 rounded-xl shadow-2xl text-xs space-y-1.5 font-mono">
                        <div className="font-bold text-white flex items-center justify-between gap-4">
                          <span>Freq: {bar.frequency} Hz</span>
                          <span className="text-[10px] text-cyan-400">{bar.harmonicOrder}</span>
                        </div>
                        <div className="text-amber-400 font-bold">
                          Amplitude: {bar.amplitude} mm/s RMS
                        </div>
                        {bar.label && (
                          <div className="text-red-400 text-[10px] pt-1 border-t border-slate-800 font-sans font-bold">
                            ⚠️ {bar.label}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />

              <Bar dataKey="amplitude" radius={[3, 3, 0, 0]}>
                {fftSpectrumData.map((entry, index) => {
                  let fillColor = "#334155"; // Noise floor slate
                  if (entry.faultType === "critical") fillColor = "#ef4444";
                  else if (entry.faultType === "warning") fillColor = "#f59e0b";
                  else if (entry.faultType === "fundamental") fillColor = "#06b6d4";

                  return <Cell key={`cell-${index}`} fill={fillColor} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ------------------- AI INSIGHTS PANEL ------------------- */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden space-y-5">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-amber-500/20 to-cyan-500/20 rounded-xl border border-amber-500/30 text-amber-300">
              <Sparkles className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-display tracking-tight flex items-center gap-2">
                AI Diagnostic Summary
                <span className="text-[9px] font-mono font-normal px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Antigravity Engine
                </span>
              </h3>
              <p className="text-xs text-slate-400">Automated ISO 10816 pattern recognition and remaining useful life assessment</p>
            </div>
          </div>

          <div className={`px-3.5 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-2 ${zoneInfo.bg}`}>
            <ShieldAlert className="w-4 h-4" />
            <span>{zoneInfo.label}</span>
          </div>
        </div>

        {/* Main AI Text Brief */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-slate-200 text-xs leading-relaxed space-y-2">
          <div className="flex items-start gap-2 text-cyan-300 font-semibold">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{activeAsset.aiSummary}</p>
          </div>
        </div>

        {/* AI Insight Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-950/60 border border-slate-850 p-3.5 rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Recommended Action</span>
            <p className="text-xs text-slate-200 font-semibold leading-snug">{activeAsset.recommendedAction}</p>
          </div>

          <div className="bg-slate-950/60 border border-slate-850 p-3.5 rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Estimated Remaining Useful Life (RUL)</span>
            <p className="text-xs text-cyan-400 font-bold font-mono">{activeAsset.rulDays}</p>
          </div>

          <div className="bg-slate-950/60 border border-slate-850 p-3.5 rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">ISO Category & Standard</span>
            <p className="text-xs text-amber-300 font-semibold">ISO 10816-3 Class II (15-75kW Rigid)</p>
          </div>
        </div>
      </div>

      {/* ------------------- MANUAL TELEMETRY LOG MODAL ------------------- */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-fade-in relative">
            <button 
              onClick={() => setShowAddForm(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-cyan-400" />
                Log Manual Telemetry Reading
              </h3>
              <p className="text-xs text-slate-400">Add a handheld vibration analyzer reading to the trend database</p>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Selected Equipment
                </label>
                <input 
                  type="text" 
                  disabled 
                  value={`${activeAsset.name} (${activeAsset.point})`}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl p-2.5 cursor-not-allowed opacity-80"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Overall Vibration Velocity (mm/s RMS) *
                </label>
                <input 
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. 2.45"
                  value={manualVib}
                  onChange={(e) => setManualVib(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 text-xs rounded-xl p-2.5 focus:border-cyan-400 focus:outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Bearing Temp (°C)
                  </label>
                  <input 
                    type="number"
                    step="0.5"
                    placeholder="e.g. 62"
                    value={manualTemp}
                    onChange={(e) => setManualTemp(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 text-xs rounded-xl p-2.5 focus:border-cyan-400 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Speed (RPM)
                  </label>
                  <input 
                    type="number"
                    placeholder="e.g. 1780"
                    value={manualRpm}
                    onChange={(e) => setManualRpm(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 text-xs rounded-xl p-2.5 focus:border-cyan-400 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {successMsg && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg mt-2"
              >
                Commit Reading to History
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
