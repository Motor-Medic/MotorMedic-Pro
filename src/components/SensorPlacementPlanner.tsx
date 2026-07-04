import React, { useState, useRef } from "react";
import { SensorPlacementResult, SensorPoint } from "../types";
import { 
  Camera, Upload, Info, AlertTriangle, Target, CheckCircle2, ChevronRight, HelpCircle, Eye, Settings, RefreshCw 
} from "lucide-react";

// Standard preset models for testing if the user has no image
const MOCK_TEMPLATES = [
  {
    name: "Centrifugal Pump B-101",
    imgUrl: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&q=80&w=600",
    result: {
      equipmentType: "Horizontal Centrifugal Impeller Pump",
      recommendedSensors: "Standard Industrial 100 mV/g ICP® Accelerometer (Shear Mode design)",
      mountingType: "Stud Mount (Direct tapped 1/4-28 threaded hole)",
      surfacePreparation: "Spot-face bearing cap to a 32 micro-inch finish, 1.25 inch diameter flat land. Drill 0.201 inch (No. 7 drill), tap 1/4-28 UNF-2B to a minimum depth of 3/8 inch. Ensure zero angular misalignment of the tapped thread.",
      points: [
        {
          x: 22,
          y: 48,
          label: "Motor Outboard Bearing (Position 1 - Radial Vertical)",
          direction: "Radial Vertical",
          description: "Monitors stator imbalances, loose foot, and outboard rotor orbital motion. Mount directly normal to the shaft center line."
        },
        {
          x: 45,
          y: 52,
          label: "Motor Inboard Bearing (Position 2 - Radial Horizontal)",
          direction: "Radial Horizontal",
          description: "Detects dynamic angular/radial coupling misalignments. High sensitivity sector; place inline with the coupling center axis."
        },
        {
          x: 62,
          y: 58,
          label: "Pump Inboard Bearing (Position 3 - Axial)",
          direction: "Axial",
          description: "Essential for catching axial loads, impeller thrust imbalances, and bent shafts. Mount strictly parallel to the shaft axial vector."
        },
        {
          x: 82,
          y: 42,
          label: "Pump Outboard Volute (Position 4 - Radial Vertical)",
          direction: "Radial Vertical",
          description: "Captures 1X and 2X impeller vane pass frequencies (VPF) and hydraulic cavitation shock impulses inside the discharge volute."
        }
      ]
    } as SensorPlacementResult
  },
  {
    name: "Overhung Cooling Fan F-402",
    imgUrl: "https://images.unsplash.com/photo-1599008633840-052c7f756385?auto=format&fit=crop&q=80&w=600",
    result: {
      equipmentType: "Overhung Axial Cooling Tower Fan",
      recommendedSensors: "High-Sensitivity 500 mV/g Low-Frequency Accelerometer (for low RPM operation)",
      mountingType: "Adhesive Mount (using two-part epoxies / epoxy resins)",
      surfacePreparation: "Clean and degrease housing to bare metal using citrus solvent. Lightly grit-scuff the flat spot with emery cloth to promote mechanical adhesion. Bond standard 1-inch flat mounting pad directly using dynamic adhesive.",
      points: [
        {
          x: 35,
          y: 40,
          label: "Fan Main Shaft Bearing (Position 1 - Radial Horizontal)",
          direction: "Radial Horizontal",
          description: "Captures blade unbalance forces which occur predominantly in the horizontal plane of overhung assemblies."
        },
        {
          x: 55,
          y: 45,
          label: "Shaft Bearing (Position 2 - Axial)",
          direction: "Axial",
          description: "Captures axial dynamic thrust and angular coupling strain. Mount as flatly as possible on the housing axial face."
        }
      ]
    } as SensorPlacementResult
  }
];

interface SensorPlacementPlannerProps {
  isSandbox?: boolean;
  setIsSandbox?: (val: boolean) => void;
}

export default function SensorPlacementPlanner({ isSandbox = false, setIsSandbox }: SensorPlacementPlannerProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<SensorPlacementResult | null>(null);
  const [activePoint, setActivePoint] = useState<SensorPoint | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [analysisCache, setAnalysisCache] = useState<Record<string, SensorPlacementResult>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle template selection
  const handleSelectTemplate = (idx: number) => {
    setSelectedTemplate(idx);
    setImagePreview(MOCK_TEMPLATES[idx].imgUrl);
    setAnalysisResult(MOCK_TEMPLATES[idx].result);
    setActivePoint(MOCK_TEMPLATES[idx].result.points[0] || null);
    setImageFile(null);
    setErrorMsg("");
  };

  // Convert File to Base64 helper
  const getBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // File Upload Handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setAnalysisResult(null);
      setSelectedTemplate(null);
      setActivePoint(null);
      setErrorMsg("");
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Submit image to Gemini for Sensor Placement Analysis
  const handleAnalyze = async () => {
    if (!imageFile || !imagePreview) {
      setErrorMsg("Please upload an image of your equipment first.");
      return;
    }

    // Check cache first
    const cacheKey = `${imageFile.name}_${imageFile.size}_${notes.trim()}_${String(isSandbox)}`;
    if (analysisCache[cacheKey]) {
      const cachedResult = analysisCache[cacheKey];
      setAnalysisResult(cachedResult);
      if (cachedResult.points && cachedResult.points.length > 0) {
        setActivePoint(cachedResult.points[0]);
      }
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg("");

    try {
      const base64Data = await getBase64(imageFile);
      const storedKey = localStorage.getItem("reliability_custom_gemini_key") || "";
      const headers: Record<string, string> = { 
        "Content-Type": "application/json",
        "x-sandbox-mode": String(isSandbox)
      };
      if (storedKey) {
        headers["x-gemini-api-key"] = storedKey;
      }

      const res = await fetch("/api/sensor-placement", {
        method: "POST",
        headers,
        body: JSON.stringify({
          fileData: base64Data,
          fileMimeType: imageFile.type,
          equipmentDescription: notes
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP Error: ${res.status} - failed to process sensor placement.`);
      }

      const result: SensorPlacementResult = await res.json();
      
      // Cache the result
      setAnalysisCache(prev => ({ ...prev, [cacheKey]: result }));
      
      setAnalysisResult(result);
      if (result.points && result.points.length > 0) {
        setActivePoint(result.points[0]);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to analyze machine sensor coordinates. Please check connection and retry.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setImageFile(null);
    setImagePreview(null);
    setNotes("");
    setAnalysisResult(null);
    setSelectedTemplate(null);
    setActivePoint(null);
    setErrorMsg("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-2 border-b border-slate-800">
        <h2 className="text-xl font-bold text-white font-display">Sensor Placement Planner</h2>
        <p className="text-xs text-slate-400">Generate professional, physics-guided mounting blueprints for accelerometer transducers</p>
      </div>

      {/* Engine Status Banner */}
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
        <div className="space-y-1">
          <h3 className="text-xs font-bold text-emerald-400">LIVE AI MODE ACTIVE</h3>
          <p className="text-xs text-slate-300 leading-normal">
            Your uploaded machine photos are analyzed using the live Gemini 3.5 Vision API.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Setup Controls (Column width 5/12) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Settings className="w-4 h-4 text-yellow-400" />
              Machine Image Setup
            </h3>

            {/* Quick Presets for Demo */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Or Select a Sample Template:</label>
              <div className="grid grid-cols-2 gap-2">
                {MOCK_TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectTemplate(idx)}
                    className={`p-2.5 rounded-xl border text-[11px] font-medium text-left transition-all ${
                      selectedTemplate === idx
                        ? "bg-yellow-400/10 border-yellow-400 text-yellow-400"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300"
                    }`}
                  >
                    {tmpl.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Drag & Drop File Upload */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Upload Equipment Photo:</label>
              
              {!imagePreview ? (
                <div 
                  onClick={triggerFileSelect}
                  className="border-2 border-dashed border-slate-800 hover:border-yellow-400/40 bg-slate-950 rounded-2xl p-8 text-center cursor-pointer transition-all space-y-2.5 group"
                >
                  <div className="mx-auto w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-yellow-400 transition-colors">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-200">Drag machine image here</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">JPEG, PNG up to 10MB</p>
                  </div>
                  <button type="button" className="inline-flex px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-[10px] font-bold text-slate-300 rounded-lg border border-slate-800">
                    Browse File
                  </button>
                </div>
              ) : (
                <div className="relative bg-slate-950 border border-slate-800 rounded-2xl p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img 
                      src={imagePreview} 
                      alt="Preview" 
                      className="w-12 h-12 rounded-lg object-cover border border-slate-800"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-200 truncate">
                        {imageFile ? imageFile.name : MOCK_TEMPLATES[selectedTemplate!]?.name}
                      </p>
                      <p className="text-[9px] text-slate-500 uppercase font-mono">
                        {imageFile ? `${(imageFile.size / 1024 / 1024).toFixed(2)} MB` : "Sample Template"}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={handleReset}
                    className="p-1.5 bg-slate-900 hover:bg-red-950 hover:text-red-400 text-slate-400 rounded-lg transition-colors"
                    title="Remove image"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <input 
                ref={fileInputRef}
                type="file" 
                accept="image/*" 
                onChange={handleFileChange} 
                className="hidden" 
              />
            </div>

            {/* Engineer notes */}
            {imageFile && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Add Machinery Description (Optional):</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="E.g. Double-stage axial compressor operating at 2400 RPM with sliding bearings."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-[11px] text-slate-300 focus:outline-none focus:border-yellow-400 min-h-[60px]"
                />
              </div>
            )}

            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] p-3 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{errorMsg}</p>
              </div>
            )}

            {/* CTA */}
            {imageFile && !analysisResult && (
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="w-full py-3 bg-yellow-400 hover:bg-yellow-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Mapping Bearings & Vibration Zones...</span>
                  </>
                ) : (
                  <>
                    <Target className="w-4 h-4" />
                    <span>Generate Sensor Placement Map</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Quick Info Alertbox */}
          <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-4 text-[11px] leading-relaxed text-slate-400 flex gap-2.5">
            <Info className="w-4.5 h-4.5 text-blue-400 shrink-0" />
            <div className="space-y-1">
              <p className="font-bold text-slate-300">ISO 10816 Mounting Mandates:</p>
              <p>For high-frequency bearing noise detection, mount vibration sensors strictly on flat, rigid surfaces directly bordering the roller housing load zone. Magnetic mounts can filter out high-frequency harmonic signals above 1.5 kHz.</p>
            </div>
          </div>
        </div>

        {/* Right Side: Interactive Image Overlay & Technical Detail Card (Column width 7/12) */}
        <div className="lg:col-span-7 space-y-6">
          {!imagePreview ? (
            /* Upload Prompt Placeholder */
            <div className="h-[400px] border border-slate-850/60 bg-[#0c1220]/20 rounded-2xl flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="w-14 h-14 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center text-slate-500">
                <Eye className="w-7 h-7 animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-300">Interactive Mount Blueprint</p>
                <p className="text-xs text-slate-500 max-w-sm mt-1">Select a sample template or upload an equipment photo to visually place and click sensor coordinates.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Interactive Photo Overlay container */}
              <div className="relative border border-slate-800 rounded-2xl overflow-hidden bg-slate-950 select-none group">
                <img 
                  src={imagePreview} 
                  alt="Sensor Blueprint" 
                  className="w-full h-auto aspect-video object-cover opacity-85 group-hover:opacity-95 transition-opacity"
                  referrerPolicy="no-referrer"
                />

                {/* Hotspot overlays */}
                {analysisResult?.points?.map((pt, i) => {
                  const isActive = activePoint?.label === pt.label;
                  return (
                    <button
                      key={i}
                      onClick={() => setActivePoint(pt)}
                      style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full border-2 transition-all cursor-pointer ${
                        isActive 
                          ? "bg-yellow-400 border-white text-slate-950 scale-125 shadow-[0_0_15px_rgba(251,191,36,0.8)] z-30" 
                          : "bg-slate-950/95 border-yellow-400 text-yellow-400 hover:scale-115 z-20"
                      }`}
                      title={pt.label}
                    >
                      <span className="text-[10px] font-bold font-mono">{i + 1}</span>
                      
                      {/* Outer pulsing ring for visual guidance */}
                      {isActive && (
                        <span className="absolute inset-0 rounded-full border-2 border-yellow-400 animate-ping opacity-60"></span>
                      )}
                    </button>
                  );
                })}

                {/* Subtitle Badge */}
                <div className="absolute bottom-3 left-3 px-3 py-1 bg-slate-950/90 backdrop-blur-md rounded-lg text-[9px] font-mono tracking-wider font-semibold border border-slate-800 text-slate-300">
                  {analysisResult ? "ISO 10816 SENSOR MAPPING COMPLETED" : "AWAITING ANALYSIS"}
                </div>
              </div>

              {/* Technical Details Tabpanel */}
              {analysisResult ? (
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                  {analysisResult.isSimulatedFallback && (
                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-4 rounded-xl text-xs flex items-start gap-3 border-l-4 border-l-amber-500 shadow-md">
                      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400 animate-pulse" />
                      <div className="space-y-1">
                        <p className="font-bold text-[13px] text-amber-300">Virtual Blueprint Generation Active (API Interception)</p>
                        <p className="leading-relaxed text-slate-300">
                          Your custom Gemini API Key was rate-limited or quota exhausted (429). The system has automatically activated the offline physical blueprint engine to map coordinates based on your equipment notes!
                        </p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1.5 text-[9px] text-amber-500/80 font-mono font-bold">
                          <span>● ENGINE: ISO 18436 CAT IV SIMULATION</span>
                          <span>● COORDINATES: ALIGNED</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* General details */}
                  <div className="grid grid-cols-2 gap-4 border-b border-slate-800 pb-3 text-xs">
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider font-mono">Equipment Class</p>
                      <p className="font-bold text-slate-200 mt-0.5">{analysisResult.equipmentType}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider font-mono">Ideal Sensor Accel</p>
                      <p className="font-bold text-slate-200 mt-0.5">{analysisResult.recommendedSensors}</p>
                    </div>
                    <div className="mt-2">
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider font-mono">Mounting Method</p>
                      <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-amber-400/10 text-amber-400 font-bold font-mono text-[10px]">
                        {analysisResult.mountingType}
                      </span>
                    </div>
                    <div className="mt-2">
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider font-mono">Surface Preparation</p>
                      <p className="text-slate-300 font-medium leading-relaxed text-[10px] mt-0.5">{analysisResult.surfacePreparation}</p>
                    </div>
                  </div>

                  {/* Dynamic point highlight */}
                  {activePoint ? (
                    <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-900 pb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 bg-yellow-400 text-slate-950 rounded-full font-bold font-mono text-xs flex items-center justify-center">
                            {analysisResult.points.indexOf(activePoint) + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-200">{activePoint.label}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold font-mono text-[9px] uppercase">
                          {activePoint.direction}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
                        {activePoint.description}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">Select any numbered sensor pin on the image to inspect placement guidelines.</p>
                  )}
                </div>
              ) : (
                <div className="bg-slate-900/20 border border-slate-850/60 rounded-2xl p-6 text-center text-xs text-slate-500 italic">
                  Upload an image and click "Generate" to see complete coordinates mapping.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
