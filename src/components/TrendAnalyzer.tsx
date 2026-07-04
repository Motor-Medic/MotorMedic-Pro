import React, { useState } from "react";
import { TrendDataPoint } from "../types";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine 
} from "recharts";
import { 
  TrendingUp, Calendar, AlertTriangle, CheckCircle2, PlusCircle, Wrench, Thermometer, Gauge, Zap 
} from "lucide-react";

interface TrendAnalyzerProps {
  trendData: TrendDataPoint[];
  onAddTrendPoint: (point: Omit<TrendDataPoint, "id" | "timestamp">) => void;
}

export default function TrendAnalyzer({ trendData, onAddTrendPoint }: TrendAnalyzerProps) {
  const [selectedEquipment, setSelectedEquipment] = useState("Boiler Feed Pump A");
  
  // New trend point form state
  const [equipmentName, setEquipmentName] = useState("Boiler Feed Pump A");
  const [vibration, setVibration] = useState("");
  const [temperature, setTemperature] = useState("");
  const [pressure, setPressure] = useState("");
  const [amperage, setAmperage] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // Get unique list of equipment with trend data
  const equipmentList = Array.from(new Set(trendData.map((pt) => pt.equipmentName)));

  // Filter trend data for selected equipment
  const activeTrendData = trendData
    .filter((pt) => pt.equipmentName === selectedEquipment)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Handle submit new point
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vibration || !temperature || !pressure || !amperage) {
      alert("Please fill in all parameter fields.");
      return;
    }

    onAddTrendPoint({
      equipmentName,
      vibrationVelocity: parseFloat(vibration),
      bearingTemperature: parseFloat(temperature),
      hydraulicPressure: parseFloat(pressure),
      electricalAmperage: parseFloat(amperage)
    });

    // Reset form
    setVibration("");
    setTemperature("");
    setPressure("");
    setAmperage("");
    setSuccessMsg("Continuous telemetry point successfully logged to historical trend database!");
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  // Safe latest values
  const latestPoint = activeTrendData[activeTrendData.length - 1];

  // Get status indicators based on latest point thresholds
  const getVibrationStatus = (val?: number) => {
    if (!val) return { text: "No Data", color: "text-slate-400 bg-slate-800" };
    if (val >= 4.5) return { text: "ALARM (ISO 10816)", color: "text-red-400 bg-red-400/10 border-red-500/20" };
    if (val >= 2.8) return { text: "WARNING", color: "text-amber-400 bg-amber-400/10 border-amber-500/20" };
    return { text: "NOMINAL", color: "text-emerald-400 bg-emerald-400/10 border-emerald-500/20" };
  };

  const getTemperatureStatus = (val?: number) => {
    if (!val) return { text: "No Data", color: "text-slate-400 bg-slate-800" };
    if (val >= 85) return { text: "CRITICAL TEMP", color: "text-red-400 bg-red-400/10 border-red-500/20" };
    if (val >= 70) return { text: "ELEVATED", color: "text-amber-400 bg-amber-400/10 border-amber-500/20" };
    return { text: "NOMINAL", color: "text-emerald-400 bg-emerald-400/10 border-emerald-500/20" };
  };

  const vibStatus = getVibrationStatus(latestPoint?.vibrationVelocity);
  const tempStatus = getTemperatureStatus(latestPoint?.bearingTemperature);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white font-display">Machinery Trend Analyzer</h2>
          <p className="text-xs text-slate-400">Track dynamic physical telemetry metrics across system life cycles</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          <span>{showAddForm ? "View Trending Charts" : "Manual Log Telemetry"}</span>
        </button>
      </div>

      {showAddForm ? (
        /* Manual Entry Form */
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 max-w-xl mx-auto space-y-5">
          <div className="border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold text-white font-display">Log New Machinery Readings</h3>
            <p className="text-[11px] text-slate-400">Insert continuous operational readings into the plant database</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Equipment Target</label>
              <select
                value={equipmentName}
                onChange={(e) => {
                  setEquipmentName(e.target.value);
                  setEquipmentName(e.target.value);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-yellow-400"
              >
                <option value="Boiler Feed Pump A">Boiler Feed Pump A (Mechanical System)</option>
                <option value="Hydraulic Manifold C">Hydraulic Manifold C (Hydraulic System)</option>
                <option value="Main Inductor Motor B">Main Inductor Motor B (Electrical System)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Vibration */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                  Vibration (mm/s RMS)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="E.g. 1.8"
                  value={vibration}
                  onChange={(e) => setVibration(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-yellow-400"
                />
              </div>

              {/* Temperature */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
                  <Thermometer className="w-3.5 h-3.5 text-red-400" />
                  Temperature (°C)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="E.g. 62.5"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-yellow-400"
                />
              </div>

              {/* Hydraulic Pressure */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
                  <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                  Pressure (bar)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  placeholder="E.g. 185"
                  value={pressure}
                  onChange={(e) => setPressure(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-yellow-400"
                />
              </div>

              {/* Electrical Amperage */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-yellow-400" />
                  Amperage (Amps)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="E.g. 42.1"
                  value={amperage}
                  onChange={(e) => setAmperage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-yellow-400"
                />
              </div>
            </div>

            {successMsg && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-3.5 rounded-lg flex items-start gap-2 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{successMsg}</p>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-bold rounded-lg text-xs transition-colors shadow-md"
            >
              COMMIT READINGS TO TREND LOGS
            </button>
          </form>
        </div>
      ) : (
        /* Trend Analytics Charts View */
        <div className="space-y-6">
          {/* Equipment Picker & Latest telemetry summary */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Asset Filter:</span>
              <select
                value={selectedEquipment}
                onChange={(e) => setSelectedEquipment(e.target.value)}
                className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-yellow-400 min-w-[200px]"
              >
                {equipmentList.map((eq) => (
                  <option key={eq} value={eq}>{eq}</option>
                ))}
              </select>
            </div>

            {latestPoint && (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {/* Vibration Indicator */}
                <div className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 ${vibStatus.color}`}>
                  <span className="font-semibold text-[10px] uppercase">Vib: {latestPoint.vibrationVelocity} mm/s</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 bg-black/25 rounded-md">{vibStatus.text}</span>
                </div>

                {/* Temperature Indicator */}
                <div className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 ${tempStatus.color}`}>
                  <span className="font-semibold text-[10px] uppercase">Temp: {latestPoint.bearingTemperature}°C</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 bg-black/25 rounded-md">{tempStatus.text}</span>
                </div>
              </div>
            )}
          </div>

          {activeTrendData.length === 0 ? (
            <div className="bg-slate-900/30 border border-slate-850 rounded-2xl py-12 text-center text-xs text-slate-500">
              No trend data available for this machine.
            </div>
          ) : (
            /* The Charts Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Chart 1: Vibration Level (ISO 10816 Alignment) */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Vibration Level Trend</h3>
                  </div>
                  <span className="text-[9px] text-slate-400 font-mono">mm/s RMS Velocity</span>
                </div>
                
                <div className="h-60 w-full text-[10px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={activeTrendData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="timestamp" stroke="#64748b" tickFormatter={(t) => t.split(",")[0]} />
                      <YAxis stroke="#64748b" domain={[0, 'auto']} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#0b0f19", borderColor: "#1e293b", borderRadius: "10px" }} 
                        labelStyle={{ color: "#f8fafc", fontWeight: "bold" }}
                      />
                      {/* Warning Limit reference line at 2.8 mm/s */}
                      <ReferenceLine y={2.8} label={{ value: "Warning", fill: "#fbbf24", position: "right", fontSize: 9 }} stroke="#fbbf24" strokeDasharray="3 3" />
                      {/* Alarm Limit reference line at 4.5 mm/s */}
                      <ReferenceLine y={4.5} label={{ value: "Alarm", fill: "#f87171", position: "right", fontSize: 9 }} stroke="#f87171" strokeDasharray="3 3" />
                      <Line type="monotone" dataKey="vibrationVelocity" stroke="#f59e0b" strokeWidth={2.5} activeDot={{ r: 6 }} name="Vibration Velocity (mm/s)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-slate-500 text-center leading-normal">
                  Red line indicates standard ISO-10816 Category II Alarm limits. Continuous operation above 4.5 mm/s can induce catastrophic structural coupling failure.
                </p>
              </div>

              {/* Chart 2: Bearing Temperature */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Thermometer className="w-4 h-4 text-red-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Bearing Temperature Trend</h3>
                  </div>
                  <span className="text-[9px] text-slate-400 font-mono">Degrees Celsius (°C)</span>
                </div>
                
                <div className="h-60 w-full text-[10px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={activeTrendData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="timestamp" stroke="#64748b" tickFormatter={(t) => t.split(",")[0]} />
                      <YAxis stroke="#64748b" domain={[0, 'auto']} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#0b0f19", borderColor: "#1e293b", borderRadius: "10px" }} 
                        labelStyle={{ color: "#f8fafc", fontWeight: "bold" }}
                      />
                      {/* Danger Temp threshold */}
                      <ReferenceLine y={85} label={{ value: "Alarm (85°C)", fill: "#f87171", position: "right", fontSize: 9 }} stroke="#f87171" strokeDasharray="3 3" />
                      <Line type="monotone" dataKey="bearingTemperature" stroke="#ef4444" strokeWidth={2.5} activeDot={{ r: 6 }} name="Temperature (°C)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-slate-500 text-center leading-normal">
                  Bearing surface temperatures exceeding 85°C signify direct hydrodynamic film breakdown or severe dynamic over-lubrication.
                </p>
              </div>

              {/* Chart 3: Hydraulic Pressure (Bar) */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Gauge className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Hydraulic Pressure Trend</h3>
                  </div>
                  <span className="text-[9px] text-slate-400 font-mono">System Pressure (Bar)</span>
                </div>
                
                <div className="h-60 w-full text-[10px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={activeTrendData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="timestamp" stroke="#64748b" tickFormatter={(t) => t.split(",")[0]} />
                      <YAxis stroke="#64748b" domain={[0, 'auto']} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#0b0f19", borderColor: "#1e293b", borderRadius: "10px" }} 
                        labelStyle={{ color: "#f8fafc", fontWeight: "bold" }}
                      />
                      <Line type="monotone" dataKey="hydraulicPressure" stroke="#06b6d4" strokeWidth={2.5} activeDot={{ r: 6 }} name="Pressure (bar)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-slate-500 text-center leading-normal">
                  Continuous tracking of pressure pulses supports early recognition of internal proportional valve wear or accumulator charge degradation.
                </p>
              </div>

              {/* Chart 4: Electrical Amperage */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Motor Operating Amperage</h3>
                  </div>
                  <span className="text-[9px] text-slate-400 font-mono">RMS Amps</span>
                </div>
                
                <div className="h-60 w-full text-[10px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={activeTrendData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="timestamp" stroke="#64748b" tickFormatter={(t) => t.split(",")[0]} />
                      <YAxis stroke="#64748b" domain={[0, 'auto']} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#0b0f19", borderColor: "#1e293b", borderRadius: "10px" }} 
                        labelStyle={{ color: "#f8fafc", fontWeight: "bold" }}
                      />
                      <Line type="monotone" dataKey="electricalAmperage" stroke="#eab308" strokeWidth={2.5} activeDot={{ r: 6 }} name="Amps" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-slate-500 text-center leading-normal">
                  Sudden drops in running speed and concurrent high current spikes point directly to stator phase unbalances or localized rotor bar fractures.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
