import React, { useState, useRef } from "react";
import { DiagnosticResponse } from "../types";
import { 
  Zap, Droplet, Wrench, AlertTriangle, FileText, UploadCloud, Trash2, 
  Video, Mic, MicOff, Check, Copy, Settings, Info, RefreshCw, HelpCircle, Camera, Globe, ArrowUpRight 
} from "lucide-react";

interface DiagnoseProps {
  onSaveReport: (category: "Mechanical" | "Electrical" | "Hydraulic", symptoms: string, specs: Record<string, string>, data: DiagnosticResponse, fileName?: string, fileType?: string) => void;
  isSandbox?: boolean;
  setIsSandbox?: (val: boolean) => void;
}

export default function Diagnose({ onSaveReport, isSandbox = false, setIsSandbox }: DiagnoseProps) {
  // Category state
  const [category, setCategory] = useState<"Mechanical" | "Electrical" | "Hydraulic">("Mechanical");
  
  // Input fields
  const [symptoms, setSymptoms] = useState("");
  
  // Advanced specs state
  const [specs, setSpecs] = useState<Record<string, string>>({
    specRpm: "N/A",
    specOrientation: "N/A",
    specDrive: "N/A",
    specFanBlades: "N/A",
    specPumpImpellers: "N/A",
    specPinionTeeth: "N/A",
    specGearTeeth: "N/A",
  });

  // Uploaded files
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    type: "image" | "text";
    data: string; // Base64 or plain string
    mimeType?: string;
  } | null>(null);

  // Video preview
  const [videoFile, setVideoFile] = useState<{
    name: string;
    url: string;
  } | null>(null);

  // Voice dictation
  const [isDictating, setIsDictating] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Diagnostic states
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResponse | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [analysisCache, setAnalysisCache] = useState<Record<string, DiagnosticResponse>>({});

  // QA Testing Mode & Diagnostic Verification Loop
  const [testingMode, setTestingMode] = useState<boolean>(true);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<boolean>(false);
  const [feedbackStatus, setFeedbackStatus] = useState<"correct" | "incorrect" | null>(null);
  const [correctedDiagnosis, setCorrectedDiagnosis] = useState<string>("");
  const [isFeedbackSubmitting, setIsFeedbackSubmitting] = useState<boolean>(false);
  const [feedbackError, setFeedbackError] = useState<string>("");

  // 1. Condition Monitoring Technology Selector
  const [selectedTech, setSelectedTech] = useState<string>("");

  // 2. Baseline Comparison state
  const [baselineMode, setBaselineMode] = useState<"text" | "file">("text");
  const [baselineText, setBaselineText] = useState("");
  const [baselineFile, setBaselineFile] = useState<{ name: string; content: string } | null>(null);

  // 3. Maintenance Logs state
  const [sidebarTab, setSidebarTab] = useState<"specs" | "maintenance">("specs");
  const [maintenanceLogs, setMaintenanceLogs] = useState<Array<{
    id: string;
    date: string;
    action: string;
    partsUsed: string;
    technician: string;
    notes: string;
  }>>(() => {
    try {
      const stored = localStorage.getItem("reliability_maintenance_logs_v6");
      return stored ? JSON.parse(stored) : [
        {
          id: "m-1",
          date: "2026-05-15",
          action: "Inboard bearing replacement & alignment",
          partsUsed: "SKF 6205 sealed bearing",
          technician: "R. Thompson",
          notes: "Bearing replaced during scheduled 24-month shutdown. Recalibrated laser alignment to < 0.02mm."
        }
      ];
    } catch (e) {
      return [];
    }
  });

  const saveMaintenanceLogs = (updated: any[]) => {
    setMaintenanceLogs(updated);
    localStorage.setItem("reliability_maintenance_logs_v6", JSON.stringify(updated));
  };

  const [showAddLog, setShowAddLog] = useState(false);
  const [newLogDate, setNewLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [newLogAction, setNewLogAction] = useState("");
  const [newLogParts, setNewLogParts] = useState("");
  const [newLogTech, setNewLogTech] = useState("");
  const [newLogNotes, setNewLogNotes] = useState("");

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const nameplateInputRef = useRef<HTMLInputElement>(null);

  // Nameplate scanner state
  const [isScanningNameplate, setIsScanningNameplate] = useState(false);
  const [nameplateScanMessage, setNameplateScanMessage] = useState("");

  const handleNameplateFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanningNameplate(true);
    setNameplateScanMessage("Scanning OCR & parsing specifications...");
    setErrorMsg("");

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
      });

      const storedKey = localStorage.getItem("reliability_custom_gemini_key") || "";
      const headers: Record<string, string> = { 
        "Content-Type": "application/json",
        "x-sandbox-mode": String(isSandbox)
      };
      if (storedKey) {
        headers["x-gemini-api-key"] = storedKey;
      }

      const response = await fetch("/api/scan-nameplate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          fileData: base64Data,
          fileMimeType: file.type
        })
      });

      if (!response.ok) {
        throw new Error("Failed to scan nameplate. Please try again with a clearer image.");
      }

      const result = await response.json();
      setSpecs({
        specRpm: result.specRpm || "N/A",
        specOrientation: result.specOrientation || "N/A",
        specDrive: result.specDrive || "N/A",
        specFanBlades: result.specFanBlades || "N/A",
        specPumpImpellers: result.specPumpImpellers || "N/A",
        specPinionTeeth: result.specPinionTeeth || "N/A",
      });

      setNameplateScanMessage(`Successfully read: ${result.equipmentName || "Machinery Spec Plate"}`);
      setTimeout(() => setNameplateScanMessage(""), 6000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to scan nameplate image.");
      setNameplateScanMessage("");
    } finally {
      setIsScanningNameplate(false);
    }
  };

  // Handle specs change
  const handleSpecChange = (key: string, value: string) => {
    setSpecs((prev) => ({ ...prev, [key]: value }));
  };

  // Drag and drop / file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const processFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const reader = new FileReader();

    if (["png", "jpg", "jpeg", "webp"].includes(ext || "")) {
      reader.onload = (ev) => {
        setUploadedFile({
          name: file.name,
          type: "image",
          data: ev.target?.result as string,
          mimeType: file.type,
        });
      };
      reader.readAsDataURL(file);
    } else {
      // Default to read as text for CSV, TXT, JSON, logs etc.
      reader.onload = (ev) => {
        setUploadedFile({
          name: file.name,
          type: "text",
          data: (ev.target?.result as string).substring(0, 15000), // Safety limit for prompt size
          mimeType: file.type,
        });
      };
      reader.readAsText(file);
    }
  };

  // Video uploading
  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 15 * 1024 * 1024) {
      alert("File size exceeds 15MB. Please upload a smaller inspection video.");
      return;
    }

    setVideoFile({
      name: file.name,
      url: URL.createObjectURL(file),
    });
  };

  // Speech Recognition dictation
  const startSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please try using Chrome or Safari.");
      return;
    }

    if (!recognitionRef.current) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onresult = (event: any) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + " ";
          }
        }
        if (finalTranscript) {
          setSymptoms((prev) => prev + (prev.endsWith(" ") || prev === "" ? "" : " ") + finalTranscript);
        }
      };

      rec.onerror = (e: any) => {
        console.error("Speech Recognition Error:", e);
        setIsDictating(false);
      };

      rec.onend = () => {
        setIsDictating(false);
      };

      recognitionRef.current = rec;
    }

    try {
      setIsDictating(true);
      recognitionRef.current.start();
    } catch (err) {
      console.error(err);
      setIsDictating(false);
    }
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsDictating(false);
  };

  const toggleDictation = () => {
    if (isDictating) {
      stopSpeechRecognition();
    } else {
      startSpeechRecognition();
    }
  };

  // Calculate frequencies based on specs for helpful visualization
  const getFrequencies = () => {
    const rpm = parseFloat(specs.specRpm);
    if (isNaN(rpm)) return null;
    const rps = rpm / 60;
    
    const freqs: Record<string, string> = {
      "Running Speed (1X)": `${rps.toFixed(2)} Hz (${rpm} CPM)`,
    };

    const blades = parseInt(specs.specFanBlades);
    if (!isNaN(blades)) {
      freqs["Blade Pass Frequency (BPF)"] = `${(rps * blades).toFixed(2)} Hz`;
    }

    const pinion = parseInt(specs.specPinionTeeth);
    if (!isNaN(pinion)) {
      freqs["Gear Mesh Frequency (GMF)"] = `${(rps * pinion).toFixed(2)} Hz`;
    }

    const impellers = parseInt(specs.specPumpImpellers);
    if (!isNaN(impellers)) {
      freqs["Vane Pass Frequency (VPF)"] = `${(rps * impellers).toFixed(2)} Hz`;
    }

    return freqs;
  };

  const machineryFrequencies = getFrequencies();

  const playCatastrophicAlarm = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.type = "sine";
      // Pulse between 880Hz and 1200Hz to create a standard plant alarm wave
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime + 0.15);
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + 0.3);
      oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime + 0.45);
      
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.8);
    } catch (err) {
      console.warn("Audio Context blocked or unsupported:", err);
    }
  };

  // Diagnose triggering
  const triggerDiagnostics = async () => {
    if (!selectedTech) {
      setErrorMsg("Mandatory: Please select a Condition Monitoring technology at the top before diagnosing.");
      return;
    }
    if (!symptoms.trim() && !uploadedFile) {
      setErrorMsg("Please specify machinery symptoms or upload an engineering data file to run diagnosis.");
      return;
    }

    const cacheKey = JSON.stringify({
      category,
      symptoms: symptoms.trim(),
      specs,
      technology: selectedTech,
      baselineData: baselineMode === "text" ? baselineText : baselineFile?.name || "",
      uploadedFileName: uploadedFile?.name || "",
      uploadedFileDataLength: uploadedFile?.data ? uploadedFile.data.length : 0,
    });

    // Check cache first to avoid redundant live API tokens
    if (analysisCache[cacheKey]) {
      console.log("Serving diagnostic result from local session cache...");
      const cachedResult = analysisCache[cacheKey];
      setDiagnosticResult(cachedResult);
      setErrorMsg("");
      setFeedbackSubmitted(false);
      setFeedbackStatus(null);
      setCorrectedDiagnosis("");
      setFeedbackError("");
      if (cachedResult.failure_stage === "Catastrophic") {
        playCatastrophicAlarm();
      }
      return;
    }

    setErrorMsg("");
    setIsLoading(true);
    setDiagnosticResult(null);
    setFeedbackSubmitted(false);
    setFeedbackStatus(null);
    setCorrectedDiagnosis("");
    setFeedbackError("");

    // Dynamic rotation of loading statements
    const messages = [
      "Interrogating machine thermal signatures...",
      "Correlating base RPM against dynamic frequency bands...",
      "Extracting physical fault probabilities using Gemini AI...",
      "Analyzing mechanical stress components and LOTO prerequisites...",
      "Drafting reliability report and structural business brief...",
    ];

    let msgIdx = 0;
    setLoadingMessage(messages[0]);
    const timer = setInterval(() => {
      msgIdx = (msgIdx + 1) % messages.length;
      setLoadingMessage(messages[msgIdx]);
    }, 2800);

    try {
      const storedKey = localStorage.getItem("reliability_custom_gemini_key") || "";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-sandbox-mode": String(isSandbox)
      };
      if (storedKey) {
        headers["x-gemini-api-key"] = storedKey;
      }

      const payload = {
        category,
        symptoms,
        specs,
        fileData: uploadedFile?.data,
        fileType: uploadedFile?.type,
        fileName: uploadedFile?.name,
        fileMimeType: uploadedFile?.mimeType,
        technology: selectedTech,
        baselineData: baselineMode === "text" ? baselineText : (baselineFile ? `${baselineFile.name}: ${baselineFile.content}` : ""),
        maintenanceHistory: maintenanceLogs
      };

      const fetchWithRetryAndTimeout = async (retriesLeft: number): Promise<any> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        try {
          const response = await fetch("/api/diagnose", {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          const contentType = response.headers.get("content-type");
          if (!response.ok || !contentType || !contentType.includes("application/json")) {
            throw new Error("Invalid response or server error");
          }

          return await response.json();
        } catch (err: any) {
          clearTimeout(timeoutId);
          if (retriesLeft > 0) {
            console.warn(`Fetch attempt failed. Retrying in 5 seconds... (${retriesLeft} retries remaining).`, err);
            setLoadingMessage("Connecting to analysis server... this may take a moment.");
            await new Promise((resolve) => setTimeout(resolve, 5000));
            return fetchWithRetryAndTimeout(retriesLeft - 1);
          }
          throw err;
        }
      };

      const result = await fetchWithRetryAndTimeout(3);
      
      // Store in session cache
      setAnalysisCache((prev) => ({ ...prev, [cacheKey]: result }));
      setDiagnosticResult(result);

      if (result.failure_stage === "Catastrophic") {
        playCatastrophicAlarm();
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Analysis is taking longer than expected. Please try again in a moment.");
    } finally {
      clearInterval(timer);
      setIsLoading(false);
    }
  };

  // Submit verification feedback to Neon database ML log
  const handleSubmitFeedback = async (wasCorrect: boolean, correctedValue?: string) => {
    if (!diagnosticResult?.db_id) {
      setFeedbackError("No database tracking ID associated with this analysis. Feedback cannot be saved.");
      return;
    }

    setIsFeedbackSubmitting(true);
    setFeedbackError("");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: diagnosticResult.db_id,
          was_correct: wasCorrect,
          corrected_diagnosis: correctedValue || null
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit feedback");
      }

      setFeedbackSubmitted(true);
      setFeedbackStatus(wasCorrect ? "correct" : "incorrect");
    } catch (err: any) {
      console.error(err);
      setFeedbackError(err.message || "Failed to submit verification feedback to the server.");
    } finally {
      setIsFeedbackSubmitting(false);
    }
  };

  // Copy CMMS Work Order
  const handleCopyCMMS = () => {
    if (!diagnosticResult) return;

    const d = diagnosticResult;
    const faults = d.probable_faults
      .map((f) => `- ${f.fault} (Confidence: ${f.confidence}, ${f.probability}%): ${f.description}`)
      .join("\n");
    const actions = d.immediate_actions
      .map(
        (a) =>
          `- [Priority ${a.priority}] ${a.action}\n  Rationale: ${a.rationale}${
            a.safety_warning ? `\n  ⚠️ SAFETY: ${a.safety_warning}` : ""
          }\n  Time: ${a.estimated_time || "N/A"} | Tools: ${(a.required_tools || []).join(", ") || "Standard"}`
      )
      .join("\n");

    const cmmsText = `================================================
CMMS MAINTENANCE WORK ORDER REQUEST
================================================
System Category : ${category}
Date            : ${new Date().toLocaleString()}
Observed Symptoms: ${symptoms || "No symptoms stated. Analysed from data file."}
------------------------------------------------
PROBABLE FAULTS DIAGNOSED:
${faults}

CORRECTIVE ACTIONS REQUIRED:
${actions}

------------------------------------------------
EXECUTIVE ANALYSIS BRIEF:
Severity Level  : ${d.manager_summary.severity}
Est. Downtime   : ${d.manager_summary.estimated_downtime}
Repair Estimate : ${d.manager_summary.cost_estimate}
Business Impact : ${d.manager_summary.business_impact}
================================================`;

    navigator.clipboard.writeText(cmmsText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  };

  // Trigger Local Save
  const handleSave = () => {
    if (!diagnosticResult) return;
    onSaveReport(
      category,
      symptoms,
      specs,
      diagnosticResult,
      uploadedFile?.name,
      uploadedFile?.type
    );
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white font-display">Machinery Fault Diagnosis</h2>
          <p className="text-xs text-slate-400">Provide observations, upload data telemetry, and get a reliability brief</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 shrink-0">
          <span className="text-xs font-semibold text-slate-300 pl-1.5">Testing/QA Mode:</span>
          <button
            onClick={() => setTestingMode(!testingMode)}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              testingMode 
                ? "bg-amber-500 text-slate-950 font-extrabold shadow-md hover:bg-amber-400" 
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            {testingMode ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* Engine Status Banner */}
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
        <div className="space-y-1 max-w-2xl">
          <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
            <Globe className="w-4 h-4 animate-pulse text-emerald-400" />
            LIVE PRODUCTION AI ENGINE ACTIVE
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Your diagnostic requests are processed by the <strong>Live Gemini Model</strong> using your custom 30-year CAT IV Master Reliability Engineer ruleset. It runs real-time <strong>Google Search Grounding</strong> to verify manufacturer & ISO 10816 specs and perform vibration calculations.
          </p>
        </div>
      </div>

      {/* MANDATORY CM TECHNOLOGY SELECTOR */}
      <div className="bg-[#0b1329] border border-slate-800/80 rounded-2xl p-5 space-y-4 shadow-lg relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-400 text-[10px] font-extrabold text-slate-950">
              Prereq
            </span>
            <h3 className="text-sm font-bold text-white font-display uppercase tracking-wider">
              Select Condition Monitoring Technology (Mandatory)
            </h3>
          </div>
          {selectedTech ? (
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              ✓ Active: {selectedTech}
            </span>
          ) : (
            <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 animate-pulse">
              ⚠️ Selection Required
            </span>
          )}
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-1">
          {[
            { id: "Vibration Analysis", label: "Vibration", icon: "📊" },
            { id: "Infrared Thermography", label: "Infrared / Thermal", icon: "🌡️" },
            { id: "Ultrasonic Testing", label: "Ultrasonic / AE", icon: "🔊" },
            { id: "Motor Circuit Analysis (MCA)", label: "Motor Circuit / MCA", icon: "⚡" },
            { id: "Oil Analysis", label: "Oil Tribology", icon: "🧪" },
            { id: "Multi-Modal", label: "Multi-Modal Fusion", icon: "🌀" }
          ].map((tech) => {
            const isSelected = selectedTech === tech.id;
            return (
              <button
                type="button"
                key={tech.id}
                onClick={() => setSelectedTech(tech.id)}
                className={`p-3.5 rounded-xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                  isSelected
                    ? "bg-yellow-400/10 border-yellow-400 text-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.15)] font-bold scale-[1.02]"
                    : "bg-slate-950/50 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <span className="text-lg">{tech.icon}</span>
                <span className="text-[10px] leading-tight font-medium uppercase tracking-wide block">{tech.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-400 leading-normal font-mono">
          * Activating a technology configures the backend multi-model consensus engine with specialized ISO standards, target bands (e.g., ISO 10816, BPFI/BPFO, ΔT limits, or oil particle thresholds), preventing AI model hallucinations.
        </p>
      </div>

      {/* Main Grid: Input Form vs Advanced Specs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Diagnostic Form (Col Span 8) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Category Picker */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-yellow-400" />
              1. System Category
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: "Mechanical", icon: Wrench, color: "text-amber-400" },
                { id: "Electrical", icon: Zap, color: "text-yellow-400" },
                { id: "Hydraulic", icon: Droplet, color: "text-cyan-400" },
              ].map((item) => {
                const IconComp = item.icon;
                const isSelected = category === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCategory(item.id as any)}
                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border font-semibold text-sm transition-all duration-200 ${
                      isSelected
                        ? "bg-yellow-400 text-slate-950 border-yellow-400 shadow-md scale-[1.02]"
                        : "bg-slate-900/40 border-slate-800 text-slate-300 hover:bg-slate-800/40 hover:border-slate-700"
                    }`}
                  >
                    <IconComp className={`w-5 h-5 ${isSelected ? "text-slate-950" : item.color}`} />
                    <span>{item.id}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Observed Symptoms Text Box */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 relative">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                2. Equipment Symptoms & Observations
              </h3>
              <button
                onClick={toggleDictation}
                title={isDictating ? "Stop speech-to-text dictation" : "Start speech-to-text dictation"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isDictating
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                }`}
              >
                {isDictating ? (
                  <>
                    <MicOff className="w-3.5 h-3.5" /> Stop Voice
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 text-yellow-400" /> Voice Dictate
                  </>
                )}
              </button>
            </div>

            <div className="relative">
              <textarea
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="E.g. Motor frame temperature measured at 85°C. Axial vibration spectrum displays dominant peaks at 1X operating frequency (1800 RPM), with radial vibrations at harmonic frequency ranges..."
                className="w-full h-36 bg-slate-950 text-slate-100 rounded-xl p-4 border border-slate-800 focus:border-yellow-400 focus:outline-none text-sm placeholder:text-slate-650 resize-none font-sans"
              />
              {isDictating && (
                <div className="absolute bottom-3 right-3 text-[10px] bg-slate-900 text-red-400 font-bold border border-red-500/20 px-2 py-1 rounded animate-pulse">
                  Listening to microphone...
                </div>
              )}
            </div>
          </div>

          {/* Telemetry and Image upload zone */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              3. Diagnostic Telemetry & Media Files
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Universal File upload */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/40 rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-2 group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".csv,.txt,.json,.log,.xlsx,.xls,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                />
                
                {uploadedFile ? (
                  <div className="w-full space-y-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between bg-slate-900 border border-emerald-500/30 rounded-xl p-2.5">
                      <div className="flex items-center gap-2 max-w-[70%] text-left">
                        <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
                        <div className="truncate text-xs">
                          <p className="font-bold text-slate-200 truncate">{uploadedFile.name}</p>
                          <p className="text-[10px] text-slate-400 uppercase">{uploadedFile.type} file loaded</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setUploadedFile(null)}
                        className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {uploadedFile.type === "image" && (
                      <div className="max-h-32 rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
                        <img 
                          src={uploadedFile.data} 
                          alt="Machinery Upload Preview" 
                          className="max-h-32 mx-auto object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <UploadCloud className="w-8 h-8 text-slate-500 group-hover:text-yellow-400 transition-colors" />
                    <div className="text-xs">
                      <p className="font-semibold text-slate-300">Telemetry Data or Image</p>
                      <p className="text-[10px] text-slate-500 mt-1">PNG, JPG, CSV, JSON, TXT</p>
                    </div>
                  </>
                )}
              </div>

              {/* Video Inspection upload */}
              <div 
                onClick={() => videoInputRef.current?.click()}
                className="border-2 border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/40 rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-2 group"
              >
                <input
                  type="file"
                  ref={videoInputRef}
                  onChange={handleVideoChange}
                  accept="video/mp4,video/quicktime,video/webm"
                  className="hidden"
                />

                {videoFile ? (
                  <div className="w-full space-y-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between bg-slate-900 border border-cyan-500/30 rounded-xl p-2.5">
                      <div className="flex items-center gap-2 max-w-[70%] text-left">
                        <Video className="w-5 h-5 text-cyan-400 shrink-0" />
                        <div className="truncate text-xs">
                          <p className="font-bold text-slate-200 truncate">{videoFile.name}</p>
                          <p className="text-[10px] text-slate-400">Inspection video loaded</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setVideoFile(null)}
                        className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="rounded-lg overflow-hidden border border-slate-800">
                      <video src={videoFile.url} controls className="max-h-32 w-full object-cover" />
                    </div>
                  </div>
                ) : (
                  <>
                    <Video className="w-8 h-8 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                    <div className="text-xs">
                      <p className="font-semibold text-slate-300">Visual Inspection Video</p>
                      <p className="text-[10px] text-slate-500 mt-1">MP4, WEBM (Max 15MB)</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Baseline Comparison & Delta Input Card */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                4. Baseline Comparison Parameters
              </h3>
              <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setBaselineMode("text")}
                  className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all ${
                    baselineMode === "text" ? "bg-slate-850 text-white font-bold" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Text Metrics
                </button>
                <button
                  type="button"
                  onClick={() => setBaselineMode("file")}
                  className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all ${
                    baselineMode === "file" ? "bg-slate-850 text-white font-bold" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Upload Baseline (CSV)
                </button>
              </div>
            </div>

            {baselineMode === "text" ? (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Enter Raw Baseline Parameters / Metrics
                </label>
                <input
                  type="text"
                  value={baselineText}
                  onChange={(e) => setBaselineText(e.target.value)}
                  placeholder="E.g., Vibration: 0.12 in/s RMS, Temperature: 42°C, Amperage: 35.2 A"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-yellow-400 font-sans"
                />
                <p className="text-[10px] text-slate-500">
                  Provide known commissioning or healthy signatures. Delta calculations will compare diagnosed values against these.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Select CSV/TXT Baseline Dataset
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = ".csv,.txt";
                      input.onchange = (e: any) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            setBaselineFile({
                              name: file.name,
                              content: (reader.result as string).substring(0, 5000)
                            });
                          };
                          reader.readAsText(file);
                        }
                      };
                      input.click();
                    }}
                    className="px-3 py-2 bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-xs rounded-lg transition-all"
                  >
                    Select File
                  </button>
                  {baselineFile ? (
                    <span className="text-xs text-emerald-400 truncate font-mono">
                      📎 {baselineFile.name} Loaded
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">No baseline file selected</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-xs text-red-400">
              <p className="font-bold">Diagnostics Error:</p>
              <p className="mt-0.5">{errorMsg}</p>
            </div>
          )}

          {/* Diagnose Button & Loading State */}
          <div className="pt-2">
            {isLoading ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center space-y-4">
                <RefreshCw className="w-8 h-8 text-yellow-400 animate-spin" />
                <div className="text-center space-y-1">
                  <p className="font-semibold text-slate-200 text-sm">Generating AI Diagnostics Report</p>
                  <p className="text-xs text-slate-400 italic animate-pulse">{loadingMessage}</p>
                </div>
              </div>
            ) : (
              <button
                onClick={triggerDiagnostics}
                className="w-full bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-bold py-4 rounded-xl shadow-lg transition-all text-sm flex items-center justify-center gap-2"
              >
                <Wrench className="w-4 h-4" />
                <span>DIAGNOSE MACHINERY FAULT</span>
              </button>
            )}
          </div>
        </div>

        {/* Specifications & Calculated Frequencies Panel (Col Span 4) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Tab buttons for Specs vs Maintenance */}
          <div className="flex bg-slate-900/60 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setSidebarTab("specs")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                sidebarTab === "specs" 
                  ? "bg-yellow-400 text-slate-950 shadow" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Specs & Physics
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab("maintenance")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                sidebarTab === "maintenance" 
                  ? "bg-yellow-400 text-slate-950 shadow" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Maintenance History ({maintenanceLogs.length})
            </button>
          </div>

          {sidebarTab === "specs" ? (
            <div className="space-y-6 animate-fade-in">
              {/* Specifications Panel */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <Settings className="w-4 h-4 text-slate-400" />
                    <h3 className="text-sm font-bold text-white font-display">Machinery Specs</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => nameplateInputRef.current?.click()}
                    disabled={isScanningNameplate}
                    className="px-2 py-1 bg-yellow-400 hover:bg-yellow-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-[10px] rounded flex items-center gap-1 shadow transition-all"
                    title="Scan nameplate plate image to auto-fill specs"
                  >
                    <Camera className="w-3 h-3" />
                    <span>Auto-Scan</span>
                  </button>
                  <input
                    type="file"
                    ref={nameplateInputRef}
                    onChange={handleNameplateFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                </div>

                {/* Scanning feedback */}
                {nameplateScanMessage && (
                  <div className={`text-[10px] font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 ${
                    isScanningNameplate 
                      ? "bg-yellow-400/10 text-yellow-400 border border-yellow-400/25 animate-pulse" 
                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                  }`}>
                    {isScanningNameplate ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="truncate">{nameplateScanMessage}</span>
                  </div>
                )}

                <div className="space-y-4">
                  {/* Base RPM */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Base Operating RPM</label>
                    <select
                      value={specs.specRpm}
                      onChange={(e) => handleSpecChange("specRpm", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-yellow-400"
                    >
                      <option value="N/A">N/A (Not Specified)</option>
                      <option value="900">900 RPM (Low Speed Motor)</option>
                      <option value="1200">1200 RPM (6-pole induction)</option>
                      <option value="1800">1800 RPM (Standard 4-pole motor)</option>
                      <option value="3600">3600 RPM (High Speed / 2-pole)</option>
                      <option value="10000">10000 RPM (Turbine / Expander)</option>
                    </select>
                  </div>

                  {/* Orientation */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Shaft Orientation</label>
                    <select
                      value={specs.specOrientation}
                      onChange={(e) => handleSpecChange("specOrientation", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-yellow-400"
                    >
                      <option value="N/A">N/A</option>
                      <option value="Horizontal">Horizontal Shaft Mount</option>
                      <option value="Vertical">Vertical Shaft Mount</option>
                    </select>
                  </div>

                  {/* Drive Type */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Drive Coupling Type</label>
                    <select
                      value={specs.specDrive}
                      onChange={(e) => handleSpecChange("specDrive", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-yellow-400"
                    >
                      <option value="N/A">N/A</option>
                      <option value="Direct">Direct Drive (Flexible Coupling)</option>
                      <option value="Belt">Belt-driven (V-Belts/Sheaves)</option>
                      <option value="Gearbox">Gearbox coupled</option>
                    </select>
                  </div>

                  {/* Fan Blades */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Fan Blade Count</label>
                    <select
                      value={specs.specFanBlades}
                      onChange={(e) => handleSpecChange("specFanBlades", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-yellow-400"
                    >
                      <option value="N/A">N/A</option>
                      <option value="4">4 Blades (BPF = 4X)</option>
                      <option value="6">6 Blades (BPF = 6X)</option>
                      <option value="8">8 Blades (BPF = 8X)</option>
                      <option value="12">12 Blades (BPF = 12X)</option>
                    </select>
                  </div>

                  {/* Impeller count */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pump Impeller Vanes</label>
                    <select
                      value={specs.specPumpImpellers}
                      onChange={(e) => handleSpecChange("specPumpImpellers", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-yellow-400"
                    >
                      <option value="N/A">N/A</option>
                      <option value="3">3 Vanes</option>
                      <option value="5">5 Vanes</option>
                      <option value="7">7 Vanes</option>
                    </select>
                  </div>

                  {/* Gear pinion teeth */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pinion Teeth (Gearing)</label>
                    <select
                      value={specs.specPinionTeeth}
                      onChange={(e) => handleSpecChange("specPinionTeeth", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-yellow-400"
                    >
                      <option value="N/A">N/A</option>
                      <option value="17">17 Teeth</option>
                      <option value="23">23 Teeth</option>
                      <option value="29">29 Teeth</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Calculated Frequencies Widget */}
              {machineryFrequencies && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-1.5 pb-2 border-b border-slate-800">
                    <Info className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Physics Frequency Bands</h4>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(machineryFrequencies).map(([label, val]) => (
                      <div key={label} className="flex justify-between items-center text-xs bg-slate-950/60 px-3 py-2 rounded-lg border border-slate-800">
                        <span className="text-slate-400 font-medium">{label}</span>
                        <span className="text-yellow-400 font-mono font-bold">{val}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Frequency bounds calculated utilizing fundamental mechanical rotordynamics formulas. These frequencies form the anchor bands evaluated during AI vibration diagnostic correlations.
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Maintenance Timeline Panel */
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 animate-fade-in text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-bold text-white font-display">Maintenance Logs</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddLog(!showAddLog)}
                  className="px-2.5 py-1 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-bold text-[10px] rounded shadow transition-all"
                >
                  {showAddLog ? "Cancel" : "+ Log Event"}
                </button>
              </div>

              {showAddLog && (
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-3 animate-fade-in">
                  <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest">Add New Log Entry</p>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Action / Repair Description</label>
                      <input
                        type="text"
                        required
                        value={newLogAction}
                        onChange={(e) => setNewLogAction(e.target.value)}
                        placeholder="E.g., Bearing replaced, shaft balanced"
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-white focus:outline-none focus:border-yellow-400"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Parts Used</label>
                        <input
                          type="text"
                          value={newLogParts}
                          onChange={(e) => setNewLogParts(e.target.value)}
                          placeholder="SKF bearing, belt"
                          className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-white focus:outline-none focus:border-yellow-400"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Technician Name</label>
                        <input
                          type="text"
                          value={newLogTech}
                          onChange={(e) => setNewLogTech(e.target.value)}
                          placeholder="J. Doe"
                          className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-white focus:outline-none focus:border-yellow-400"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Date</label>
                      <input
                        type="date"
                        value={newLogDate}
                        onChange={(e) => setNewLogDate(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-white focus:outline-none focus:border-yellow-400"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Technical Notes / Comments</label>
                      <textarea
                        value={newLogNotes}
                        onChange={(e) => setNewLogNotes(e.target.value)}
                        placeholder="Laser aligned coupling to <0.02mm clearance tolerance..."
                        rows={2}
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-white focus:outline-none focus:border-yellow-400 resize-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!newLogAction) return;
                        const newEntry = {
                          id: "m-" + Date.now(),
                          date: newLogDate,
                          action: newLogAction,
                          partsUsed: newLogParts || "N/A",
                          technician: newLogTech || "Operator",
                          notes: newLogNotes || "N/A"
                        };
                        saveMaintenanceLogs([newEntry, ...maintenanceLogs]);
                        setNewLogAction("");
                        setNewLogParts("");
                        setNewLogTech("");
                        setNewLogNotes("");
                        setShowAddLog(false);
                      }}
                      className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 font-bold text-white rounded text-[10px]"
                    >
                      Save to Maintenance Records
                    </button>
                  </div>
                </div>
              )}

              {/* Maintenance Timeline View */}
              <div className="space-y-4">
                {maintenanceLogs.length === 0 ? (
                  <p className="text-center py-6 text-slate-500 font-mono text-[10px]">No logged maintenance events found.</p>
                ) : (
                  <div className="relative border-l border-slate-800 pl-4 ml-2 space-y-4">
                    {maintenanceLogs.map((log) => (
                      <div key={log.id} className="relative space-y-1">
                        {/* Dot marker */}
                        <div className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-yellow-400 border-2 border-[#080c14] shadow" />
                        
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[9px] text-yellow-400 font-bold">{log.date}</span>
                          <span className="text-[8px] text-slate-500 font-bold">Tech: {log.technician}</span>
                        </div>
                        
                        <p className="font-bold text-slate-200 text-[11px] leading-tight">{log.action}</p>
                        
                        {log.partsUsed && log.partsUsed !== "N/A" && (
                          <p className="text-[9px] text-slate-400 font-mono">🔧 Parts: {log.partsUsed}</p>
                        )}
                        
                        {log.notes && log.notes !== "N/A" && (
                          <p className="text-[10px] text-slate-400 leading-normal bg-slate-950/40 p-1.5 rounded border border-slate-900 font-mono">{log.notes}</p>
                        )}

                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = maintenanceLogs.filter(l => l.id !== log.id);
                              saveMaintenanceLogs(updated);
                            }}
                            className="text-[9px] text-red-500/85 hover:text-red-400 font-bold bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10"
                          >
                            Delete entry
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-[10px] text-slate-500 italic mt-3 font-mono leading-normal">
                * When a diagnostics analysis is triggered, this historical log timeline is auto-injected. The fallback sequence evaluates recently replaced parts against active wear signatures to detect poor installation or recurring root causes.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Diagnosis Results Section */}
      {diagnosticResult && (
        <div id="resultsSection" className="space-y-6 pt-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
            <div>
              <h3 className="text-lg font-bold text-white font-display">Diagnostic Results Brief</h3>
              <p className="text-xs text-slate-400">Review probability analysis, corrective guidelines, and economic summaries</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition-all shadow"
              >
                Save Report to History
              </button>
              <button
                onClick={handleCopyCMMS}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-yellow-400 border border-slate-700 font-semibold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? "Copied!" : "Copy CMMS Work Order"}</span>
              </button>
            </div>
          </div>

          {/* TESTING / QA VERIFICATION & MACHINE LEARNING FEEDBACK CARD */}
          {testingMode && (
            <div className="bg-amber-500/10 border border-dashed border-amber-500/30 rounded-2xl p-5 space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-500/20">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold font-mono">TESTING MODE</span>
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">Diagnostic Verification Panel</h4>
                    <p className="text-[10px] text-amber-400 font-mono">Active Session ML Loop • Record ID: {diagnosticResult.db_id || "Staged Offline"}</p>
                  </div>
                </div>
                {diagnosticResult.db_id ? (
                  <span className="text-[9px] font-bold uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                    ⚡ Database Bound
                  </span>
                ) : (
                  <span className="text-[9px] font-bold uppercase text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-md">
                    ⚠️ Offline Sandbox
                  </span>
                )}
              </div>

              {!feedbackSubmitted ? (
                <div className="space-y-4">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Verify the accuracy of this AI-generated machinery diagnosis. Your expert validation will be logged in the database to train the fault consensus engine for future diagnostics.
                  </p>

                  {feedbackError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-xs text-red-400 font-mono">
                      {feedbackError}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={isFeedbackSubmitting}
                      onClick={() => handleSubmitFeedback(true)}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-md transition-all shrink-0"
                    >
                      {isFeedbackSubmitting && feedbackStatus === null ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <span>✓</span>
                      )}
                      <span>Correct Diagnosis</span>
                    </button>

                    <button
                      type="button"
                      disabled={isFeedbackSubmitting}
                      onClick={() => {
                        setFeedbackStatus("incorrect");
                        setFeedbackError("");
                      }}
                      className={`px-4 py-2.5 disabled:opacity-50 font-bold text-xs rounded-xl flex items-center gap-2 transition-all shrink-0 ${
                        feedbackStatus === "incorrect" 
                          ? "bg-red-500 text-white shadow-md" 
                          : "bg-slate-800 hover:bg-slate-700 text-red-400 border border-slate-700"
                      }`}
                    >
                      <span>✗</span>
                      <span>Incorrect Diagnosis</span>
                    </button>
                  </div>

                  {feedbackStatus === "incorrect" && (
                    <div className="space-y-3 pt-2 border-t border-slate-800/60 animate-fade-in">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Provide Correct Diagnosis (Human Expert Overrides AI Consensus):
                        </label>
                        <textarea
                          rows={2}
                          value={correctedDiagnosis}
                          onChange={(e) => setCorrectedDiagnosis(e.target.value)}
                          placeholder="State the correct mechanical fault (e.g. Loose rotor bars, belt slippage, misaligned coupling)..."
                          className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400/50 rounded-xl p-3 text-xs text-slate-200 focus:outline-none placeholder-slate-600"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={isFeedbackSubmitting || !correctedDiagnosis.trim()}
                          onClick={() => handleSubmitFeedback(false, correctedDiagnosis)}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-extrabold text-xs rounded-lg transition-all shadow-md flex items-center gap-1.5"
                        >
                          {isFeedbackSubmitting ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : null}
                          <span>Submit Corrected Diagnosis</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-950/40 border border-amber-500/20 p-4 rounded-xl space-y-2 animate-fade-in">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <span className="text-base">✓</span>
                    <h5 className="text-xs font-bold uppercase tracking-wider">Expert Feedback Submitted</h5>
                  </div>
                  <p className="text-xs text-slate-300">
                    Thank you! The AI diagnosis was marked as{" "}
                    <strong className={feedbackStatus === "correct" ? "text-emerald-400" : "text-red-400"}>
                      {feedbackStatus === "correct" ? "CORRECT" : "INCORRECT"}
                    </strong>
                    .
                  </p>
                  {feedbackStatus === "incorrect" && correctedDiagnosis && (
                    <div className="p-2.5 bg-slate-950 border border-slate-850 rounded-lg mt-1 font-mono text-[10px] text-slate-400">
                      <span className="text-amber-400 font-bold">Correction Logged:</span> {correctedDiagnosis}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500 leading-normal font-mono pt-1">
                    * Saved directly into Neon database. Subsequent diagnostic queries for similar symptoms/assets will learn from this correction.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* FAILURE STAGE CLASSIFICATION GAUGE */}
          {diagnosticResult.failure_stage && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">📈</span>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Machinery Failure Stage Classification</h4>
                </div>
                <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                  diagnosticResult.failure_stage === "Catastrophic" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                  diagnosticResult.failure_stage === "Advanced" ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" :
                  diagnosticResult.failure_stage === "Early" ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" :
                  "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                }`}>
                  Current: {diagnosticResult.failure_stage}
                </span>
              </div>

              {/* Horizontal bar gauge */}
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <div className={`p-1 rounded ${diagnosticResult.failure_stage === "Incipient" ? "bg-emerald-500 text-slate-950 font-extrabold" : "bg-slate-950/40"}`}>
                    1. Incipient
                  </div>
                  <div className={`p-1 rounded ${diagnosticResult.failure_stage === "Early" ? "bg-yellow-500 text-slate-950 font-extrabold" : "bg-slate-950/40"}`}>
                    2. Early
                  </div>
                  <div className={`p-1 rounded ${diagnosticResult.failure_stage === "Advanced" ? "bg-orange-500 text-slate-950 font-extrabold" : "bg-slate-950/40"}`}>
                    3. Advanced
                  </div>
                  <div className={`p-1 rounded ${diagnosticResult.failure_stage === "Catastrophic" ? "bg-red-500 text-slate-950 font-extrabold animate-pulse" : "bg-slate-950/40"}`}>
                    4. Catastrophic
                  </div>
                </div>

                {/* Progress track */}
                <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden flex">
                  <div className={`h-full flex-1 ${
                    ["Incipient", "Early", "Advanced", "Catastrophic"].indexOf(diagnosticResult.failure_stage) >= 0 ? "bg-emerald-500" : "bg-slate-800"
                  }`} />
                  <div className={`h-full flex-1 ${
                    ["Early", "Advanced", "Catastrophic"].indexOf(diagnosticResult.failure_stage) >= 0 ? "bg-yellow-500" : "bg-slate-850"
                  }`} />
                  <div className={`h-full flex-1 ${
                    ["Advanced", "Catastrophic"].indexOf(diagnosticResult.failure_stage) >= 0 ? "bg-orange-500" : "bg-slate-850"
                  }`} />
                  <div className={`h-full flex-1 ${
                    ["Catastrophic"].indexOf(diagnosticResult.failure_stage) >= 0 ? "bg-red-500 animate-pulse" : "bg-slate-850"
                  }`} />
                </div>
                <p className="text-[10px] text-slate-400 font-mono leading-normal pt-1">
                  * <strong>Incipient</strong> indicates micro-wear (sub-harmonic frequencies/micro-thermal ΔT); <strong>Early</strong> indicates initial physical fatigue; <strong>Advanced</strong> indicates distinct failure symptoms with loss of operating margin; <strong>Catastrophic</strong> indicates immediate mechanical failure hazard requiring LOTO.
                </p>
              </div>
            </div>
          )}

          {/* BASELINE DELTA CALCULATION WIDGET */}
          {diagnosticResult.baseline_delta && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-1.5 pb-2 border-b border-slate-800/60">
                <span className="text-sm">⚖️</span>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Historical Baseline Delta Calculations</h4>
              </div>
              <div className="bg-slate-950/40 border border-slate-800/50 p-3 rounded-xl font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                {diagnosticResult.baseline_delta}
              </div>
            </div>
          )}

          {/* Healthy Machinery Alert Banner */}
          {(!diagnosticResult.probable_faults || diagnosticResult.probable_faults.length === 0) && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-5 shadow-lg border-l-4 border-l-emerald-500 animate-fade-in">
              <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-400 shrink-0">
                <Check className="w-8 h-8 animate-pulse" />
              </div>
              <div className="space-y-1 text-center sm:text-left flex-1">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h4 className="text-base font-bold text-emerald-400">MACHINERY OPERATING FINE - ALL SYSTEMS NOMINAL</h4>
                  <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded text-[9px] font-mono font-bold text-emerald-300">ISO 10816 STATUS: EXCELLENT</span>
                </div>
                <p className="text-slate-300 text-xs leading-relaxed max-w-4xl">
                  {diagnosticResult.manager_summary?.executive_brief || "The asset has been fully evaluated against baseline parameters. All diagnostic vectors, physical markers, and spectral bands reside fully within standard safe limits. Continual operational runtime is certified with zero scheduled offline maintenance impact."}
                </p>
                <div className="text-[10px] text-slate-400 flex items-center gap-1.5 justify-center sm:justify-start mt-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                  <span>System Reliability Index: 100% | Zero Abnormal Signals Flagged</span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Probable Faults */}
            <div className={`bg-slate-900/60 border border-slate-800 rounded-2xl p-5 border-l-4 space-y-4 ${
              !diagnosticResult.probable_faults || diagnosticResult.probable_faults.length === 0
                ? "border-emerald-500"
                : "border-rose-500"
            }`}>
              <h4 className={`font-bold text-sm flex items-center gap-1.5 pb-2 border-b border-slate-800 ${
                !diagnosticResult.probable_faults || diagnosticResult.probable_faults.length === 0
                  ? "text-emerald-400"
                  : "text-rose-400"
              }`}>
                {!diagnosticResult.probable_faults || diagnosticResult.probable_faults.length === 0 ? (
                  <Check className="w-4.5 h-4.5" />
                ) : (
                  <AlertTriangle className="w-4.5 h-4.5" />
                )}
                Probable Faults & Physics
              </h4>
              <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                {!diagnosticResult.probable_faults || diagnosticResult.probable_faults?.length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <Check className="w-8 h-8 text-emerald-400/30 mx-auto" />
                    <p className="text-xs font-bold text-emerald-400">100% Fine & Stable</p>
                    <p className="text-[10px] text-slate-500 max-w-[200px] mx-auto leading-relaxed">No abnormal frequencies or physical wear profiles detected.</p>
                  </div>
                ) : (
                  diagnosticResult.probable_faults?.map((f, i) => (
                    <div key={i} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2.5">
                      <div className="flex justify-between items-start gap-2">
                        <h5 className="text-xs font-bold text-slate-200">{f.fault}</h5>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                          f.confidence === "High" 
                            ? "text-red-400 bg-red-400/10 border-red-400/20" 
                            : f.confidence === "Medium"
                            ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                            : "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"
                        }`}>
                          {f.confidence} ({f.probability}%)
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-350 leading-relaxed font-sans">{f.description}</p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className="text-[9px] font-medium bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-850">
                          {f.subsystem}
                        </span>
                        <span className="text-[9px] font-medium bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-850">
                          {f.failure_mode}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Card 2: Corrective Actions */}
            <div className={`bg-slate-900/60 border border-slate-800 rounded-2xl p-5 border-l-4 space-y-4 ${
              !diagnosticResult.probable_faults || diagnosticResult.probable_faults.length === 0
                ? "border-emerald-500"
                : "border-amber-500"
            }`}>
              <h4 className={`font-bold text-sm flex items-center gap-1.5 pb-2 border-b border-slate-800 ${
                !diagnosticResult.probable_faults || diagnosticResult.probable_faults.length === 0
                  ? "text-emerald-400"
                  : "text-amber-400"
              }`}>
                <Wrench className="w-4.5 h-4.5" />
                Corrective Guidance
              </h4>
              <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                {!diagnosticResult.immediate_actions || diagnosticResult.immediate_actions?.length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <Check className="w-8 h-8 text-emerald-400/30 mx-auto" />
                    <p className="text-xs font-bold text-emerald-400">Routine Check Only</p>
                    <p className="text-[10px] text-slate-500 max-w-[200px] mx-auto leading-relaxed">Continue regular baseline readings as scheduled.</p>
                  </div>
                ) : (
                  diagnosticResult.immediate_actions?.map((a, i) => (
                    <div key={i} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
                      <div className="flex justify-between items-start gap-1.5">
                        <h5 className="text-xs font-bold text-slate-200">
                          {i+1}. {a.action}
                        </h5>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                          a.priority === "High" 
                            ? "text-red-400 bg-red-400/10 border-red-400/20" 
                            : "text-slate-400 bg-slate-800 border-slate-700"
                        }`}>
                          {a.priority}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed font-sans">{a.rationale}</p>
                      
                      {a.safety_warning && (
                        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-350 p-2 rounded-lg text-[10px] leading-relaxed">
                          <span className="font-bold">⚠️ SAFETY PRECAUTION: </span>
                          {a.safety_warning}
                        </div>
                      )}

                      <div className="pt-1.5 text-[10px] text-slate-500 flex items-center justify-between border-t border-slate-850">
                        <span>⏱ Est: {a.estimated_time || "N/A"}</span>
                        <span className="truncate max-w-[60%]" title={(a.required_tools || []).join(", ")}>
                          🔧 {(a.required_tools || []).slice(0, 3).join(", ")}
                          {(a.required_tools || []).length > 3 && "..."}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Card 3: Plant Operations Brief */}
            <div className={`bg-slate-900/60 border border-slate-800 rounded-2xl p-5 border-l-4 space-y-4 ${
              !diagnosticResult.probable_faults || diagnosticResult.probable_faults.length === 0
                ? "border-emerald-500"
                : "border-cyan-500"
            }`}>
              <h4 className={`font-bold text-sm flex items-center gap-1.5 pb-2 border-b border-slate-800 ${
                !diagnosticResult.probable_faults || diagnosticResult.probable_faults.length === 0
                  ? "text-emerald-400"
                  : "text-cyan-400"
              }`}>
                <FileText className="w-4.5 h-4.5" />
                Plant Management Brief
              </h4>
              <div className="space-y-4 text-xs">
                {/* Severity Badge */}
                <div className="flex justify-between items-center bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 font-medium">Criticality Status</span>
                  <span className={`px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-lg border ${
                    diagnosticResult.manager_summary?.severity === "Critical"
                      ? "text-red-400 bg-red-500/15 border-red-500/30"
                      : diagnosticResult.manager_summary?.severity === "High"
                      ? "text-amber-400 bg-amber-500/15 border-amber-500/30"
                      : "text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
                  }`}>
                    {diagnosticResult.manager_summary?.severity || "Low"}
                  </span>
                </div>

                {/* Executive Brief */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Executive Brief</span>
                  <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800 leading-relaxed text-slate-300 text-[11px] font-sans">
                    {diagnosticResult.manager_summary?.executive_brief}
                  </div>
                </div>

                {/* Downtime & Cost info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-0.5">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Est. Downtime</span>
                    <p className="font-bold text-slate-200 text-xs">{diagnosticResult.manager_summary?.estimated_downtime}</p>
                  </div>
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-0.5">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Repair Cost Est</span>
                    <p className="font-bold text-emerald-400 text-xs">{diagnosticResult.manager_summary?.cost_estimate}</p>
                  </div>
                </div>

                {/* Operations Business Impact */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Operations Business Impact</span>
                  <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 leading-relaxed font-sans">
                    {diagnosticResult.manager_summary?.business_impact}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Grounded Web Research Sources */}
          {diagnosticResult.sources && diagnosticResult.sources.length > 0 && (
            <div className="bg-slate-900/40 border border-slate-800/85 rounded-2xl p-5 space-y-3 mt-6">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5 text-xs font-bold text-yellow-400 uppercase tracking-wider font-display">
                  <Globe className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span>Grounded Live Web Research Citations</span>
                </div>
                <span className="text-[10px] font-mono text-slate-500">
                  Verified via {diagnosticResult.attemptedModel || "Gemini Search Grounding"}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                The diagnostic engine actively queried the live internet to cross-verify machinery configurations, nominal vibration profiles, and standards (e.g., ISO 10816) to prevent guessing and ensure zero hallucination:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {diagnosticResult.sources.map((src, idx) => (
                  <a
                    key={idx}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 p-3 bg-slate-950/60 hover:bg-slate-900/60 border border-slate-850 hover:border-slate-700 rounded-xl transition-all group"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-semibold text-slate-200 group-hover:text-yellow-400 transition-colors truncate font-sans">
                        {src.title}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono truncate">
                        {src.uri}
                      </p>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-yellow-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
