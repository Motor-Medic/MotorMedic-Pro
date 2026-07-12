import React, { useState, useRef, useEffect, useMemo } from "react";
import { DiagnosticResponse } from "../types";
import { 
  Zap, Droplet, Wrench, AlertTriangle, FileText, UploadCloud, Trash2, 
  Video, Mic, MicOff, Check, Copy, Settings, Info, RefreshCw, HelpCircle, Camera, Globe, ArrowUpRight, Mail
} from "lucide-react";
import { generatePDFReport } from "./ReportGenerator";
import { useToast } from "./Toast";

interface DiagnoseProps {
  onSaveReport: (category: "Mechanical" | "Electrical" | "Hydraulic", symptoms: string, specs: Record<string, string>, data: DiagnosticResponse, fileName?: string, fileType?: string) => void;
  isSandbox?: boolean;
  setIsSandbox?: (val: boolean) => void;
  targetContext?: {
    plantId: number | null;
    routeId: number | null;
    assetId: number | null;
    componentId: number | null;
    technologyType: string | null;
    quickAnalysisMode?: boolean;
  } | null;
  onClearTargetContext?: () => void;
  selectedCompanyId?: number;
  subscriptionPlan?: string;
}

const techMap: Record<string, string> = {
  "Vibration": "Vibration Analysis",
  "Thermal": "Infrared Thermography",
  "Oil": "Oil Analysis",
  "Electrical": "Motor Circuit Analysis (MCA)"
};

export default function Diagnose({ 
  onSaveReport, 
  isSandbox = false, 
  setIsSandbox,
  targetContext,
  onClearTargetContext,
  selectedCompanyId = 1,
  subscriptionPlan = "vibration_only"
}: DiagnoseProps) {
  const { showToast } = useToast();
  
  // File upload validation error state
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Cascading dropdown states
  const [plants, setPlants] = useState<any[]>([]);
  const [routesList, setRoutesList] = useState<any[]>([]);
  const [assetsList, setAssetsList] = useState<any[]>([]);
  const [componentsList, setComponentsList] = useState<any[]>([]);

  const [selectedPlantId, setSelectedPlantId] = useState<number | "">("");
  const [selectedRouteId, setSelectedRouteId] = useState<number | "">("");
  const [selectedAssetId, setSelectedAssetId] = useState<number | "">("");
  const [selectedComponentId, setSelectedComponentId] = useState<number | "">("");

  // Quick Analysis Mode (Test Mode) & Link-Saving States
  const [quickAnalysisMode, setQuickAnalysisMode] = useState<boolean>(false);
  const [showLinkModal, setShowLinkModal] = useState<boolean>(false);
  const [modalPlantId, setModalPlantId] = useState<number | "">("");
  const [modalRouteId, setModalRouteId] = useState<number | "">("");
  const [modalAssetId, setModalAssetId] = useState<number | "">("");
  const [modalComponentId, setModalComponentId] = useState<number | "">("");
  const [modalRoutesList, setModalRoutesList] = useState<any[]>([]);
  const [modalAssetsList, setModalAssetsList] = useState<any[]>([]);
  const [modalComponentsList, setModalComponentsList] = useState<any[]>([]);
  const [isLinking, setIsLinking] = useState<boolean>(false);
  
  // Notification Toast State
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Manual Email Alert State
  const [isAlertSending, setIsAlertSending] = useState<boolean>(false);
  const [alertSuccessMsg, setAlertSuccessMsg] = useState<string | null>(null);

  // Fetch plants list on mount and when company changes
  useEffect(() => {
    const fetchPlants = async () => {
      try {
        const res = await fetch(`/api/plants?company_id=${selectedCompanyId}`);
        if (res.ok) {
          const data = await res.json();
          setPlants(data);
        }
      } catch (err) {
        console.error("Failed to fetch plants:", err);
      }
    };
    fetchPlants();
  }, [selectedCompanyId]);

  // Fetch routes when plant is selected
  useEffect(() => {
    if (selectedPlantId) {
      const fetchRoutes = async () => {
        try {
          const res = await fetch(`/api/routes?plant_id=${selectedPlantId}`);
          if (res.ok) {
            const data = await res.json();
            setRoutesList(data);
          }
        } catch (err) {
          console.error("Failed to fetch routes:", err);
        }
      };
      fetchRoutes();
    } else {
      setRoutesList([]);
      setAssetsList([]);
      setComponentsList([]);
    }
  }, [selectedPlantId]);

  // Fetch assets when route is selected
  useEffect(() => {
    if (selectedRouteId) {
      const fetchAssets = async () => {
        try {
          const res = await fetch(`/api/assets?route_id=${selectedRouteId}`);
          if (res.ok) {
            const data = await res.json();
            setAssetsList(data);
          }
        } catch (err) {
          console.error("Failed to fetch assets:", err);
        }
      };
      fetchAssets();
    } else {
      setAssetsList([]);
      setComponentsList([]);
    }
  }, [selectedRouteId]);

  // Fetch components when asset is selected
  useEffect(() => {
    if (selectedAssetId) {
      const fetchComponents = async () => {
        try {
          const res = await fetch(`/api/components?asset_id=${selectedAssetId}`);
          if (res.ok) {
            const data = await res.json();
            setComponentsList(data);
          }
        } catch (err) {
          console.error("Failed to fetch components:", err);
        }
      };
      fetchComponents();
    } else {
      setComponentsList([]);
    }
  }, [selectedAssetId]);

  // Synchronize targetContext with state
  useEffect(() => {
    if (targetContext) {
      if (targetContext.plantId) setSelectedPlantId(targetContext.plantId);
      if (targetContext.routeId) setSelectedRouteId(targetContext.routeId);
      if (targetContext.assetId) setSelectedAssetId(targetContext.assetId);
      if (targetContext.componentId) setSelectedComponentId(targetContext.componentId);
      if (targetContext.technologyType) {
        const rawTech = targetContext.technologyType;
        const mappedTech = techMap[rawTech] || rawTech;
        setSelectedTech(mappedTech);
      }
      if (targetContext.quickAnalysisMode) {
        setQuickAnalysisMode(true);
      }
    }
  }, [targetContext]);

  // Modal cascading dropdown hooks
  useEffect(() => {
    if (showLinkModal && modalPlantId) {
      const fetchRoutes = async () => {
        try {
          const res = await fetch(`/api/routes?plant_id=${modalPlantId}`);
          if (res.ok) {
            const data = await res.json();
            setModalRoutesList(data);
          }
        } catch (err) {
          console.error("Failed to fetch routes in modal:", err);
        }
      };
      fetchRoutes();
    } else {
      setModalRoutesList([]);
      setModalAssetsList([]);
      setModalComponentsList([]);
    }
  }, [modalPlantId, showLinkModal]);

  useEffect(() => {
    if (showLinkModal && modalRouteId) {
      const fetchAssets = async () => {
        try {
          const res = await fetch(`/api/assets?route_id=${modalRouteId}`);
          if (res.ok) {
            const data = await res.json();
            setModalAssetsList(data);
          }
        } catch (err) {
          console.error("Failed to fetch assets in modal:", err);
        }
      };
      fetchAssets();
    } else {
      setModalAssetsList([]);
      setModalComponentsList([]);
    }
  }, [modalRouteId, showLinkModal]);

  useEffect(() => {
    if (showLinkModal && modalAssetId) {
      const fetchComponents = async () => {
        try {
          const res = await fetch(`/api/components?asset_id=${modalAssetId}`);
          if (res.ok) {
            const data = await res.json();
            setModalComponentsList(data);
          }
        } catch (err) {
          console.error("Failed to fetch components in modal:", err);
        }
      };
      fetchComponents();
    } else {
      setModalComponentsList([]);
    }
  }, [modalAssetId, showLinkModal]);

  // Auto-clear Toast notifications
  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  // Auto-clear manual email alert feedback
  useEffect(() => {
    if (alertSuccessMsg) {
      const timer = setTimeout(() => setAlertSuccessMsg(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [alertSuccessMsg]);

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
  const [isReportCopied, setIsReportCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [analysisCache, setAnalysisCache] = useState<Record<string, DiagnosticResponse>>({});
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // QA Testing Mode & Diagnostic Verification Loop
  const [testingMode, setTestingMode] = useState<boolean>(() => {
    const envVal = (import.meta as any).env?.VITE_TESTING_MODE;
    console.log("🔍 [MotorMedic DEBUG] Raw import.meta.env.VITE_TESTING_MODE value:", envVal);
    if (envVal !== undefined && envVal !== null) {
      const isTrue = String(envVal).toLowerCase() === "true";
      console.log(`🔍 [MotorMedic DEBUG] Parsed VITE_TESTING_MODE as boolean: ${isTrue}`);
      return isTrue;
    }
    console.log("🔍 [MotorMedic DEBUG] VITE_TESTING_MODE is not set. Defaulting to true.");
    return true;
  });

  // Alias variable to support both checking patterns securely and prevent ReferenceErrors
  const isTestingMode = testingMode;

  useEffect(() => {
    console.log("🚀 [MotorMedic Debug EFFECT] VITE_TESTING_MODE env var:", (import.meta as any).env?.VITE_TESTING_MODE);
    console.log("🚀 [MotorMedic Debug EFFECT] testingMode State is currently:", testingMode);
    console.log("🚀 [MotorMedic Debug EFFECT] isTestingMode alias is currently:", isTestingMode);
    console.log("🚀 [MotorMedic Debug EFFECT] current diagnosticResult:", diagnosticResult);
    if (diagnosticResult) {
      console.log("🚀 [MotorMedic Debug EFFECT] diagnosticResult has db_id:", diagnosticResult.db_id);
    }
  }, [testingMode, isTestingMode, diagnosticResult]);

  const [feedbackSubmitted, setFeedbackSubmitted] = useState<boolean>(false);
  const [feedbackStatus, setFeedbackStatus] = useState<"correct" | "incorrect" | null>(null);
  const [correctedDiagnosis, setCorrectedDiagnosis] = useState<string>("");
  const [isFeedbackSubmitting, setIsFeedbackSubmitting] = useState<boolean>(false);
  const [feedbackError, setFeedbackError] = useState<string>("");

  // Correction workflow form states
  const [actualFaultType, setActualFaultType] = useState<string>("Unbalance");
  const [actualDetails, setActualDetails] = useState<string>("");
  const [actualSeverity, setActualSeverity] = useState<string>("Medium");

  // 1. Condition Monitoring Technology Selector
  const [selectedTech, setSelectedTech] = useState<string>("");

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

  const allTechs = useMemo(() => [
    { id: "Vibration Analysis", label: "Vibration", icon: "📊", key: "vibration" },
    { id: "Infrared Thermography", label: "Infrared / Thermal", icon: "🌡️", key: "infrared" },
    { id: "Ultrasonic Testing", label: "Ultrasonic / AE", icon: "🔊", key: "ultrasound" },
    { id: "Motor Circuit Analysis (MCA)", label: "Motor Circuit / MCA", icon: "⚡", key: "mca" },
    { id: "Oil Analysis", label: "Oil Tribology", icon: "🧪", key: "oil_analysis" },
    { id: "Multi-Modal", label: "Multi-Modal Fusion", icon: "🌀", key: "multi_modal" }
  ], []);

  const allowedTechs = useMemo(() => {
    return allTechs.filter(tech => {
      if (tech.key === "multi_modal") {
        return allowedTechKeys.length >= 2;
      }
      return allowedTechKeys.includes(tech.key);
    });
  }, [allowedTechKeys, allTechs]);

  useEffect(() => {
    if (selectedTech && !allowedTechs.some(t => t.id === selectedTech)) {
      if (allowedTechs.length > 0) {
        setSelectedTech(allowedTechs[0].id);
      } else {
        setSelectedTech("");
      }
    }
  }, [allowedTechs, selectedTech]);

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

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const allowedExtensions = ["png", "jpg", "jpeg", "csv", "json", "txt", "pdf"];

    // Validate extension
    if (!allowedExtensions.includes(ext)) {
      setUploadError("Invalid file type. Please upload an Image, CSV, JSON, TXT, or PDF under 50MB.");
      if (e.target) e.target.value = "";
      return;
    }

    // Validate size (50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError("Invalid file type. Please upload an Image, CSV, JSON, TXT, or PDF under 50MB.");
      if (e.target) e.target.value = "";
      return;
    }

    setUploadError(null);
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
    if (!selectedComponentId && !quickAnalysisMode) {
      setErrorMsg("Mandatory: Please select a Target Plant, Route, Asset, and Component at the top before diagnosing, or turn on Quick Analysis Mode.");
      return;
    }
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
      componentId: selectedComponentId || null,
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
      "Consulting AI models...",
      "Searching web for manufacturer specs...",
      "Constructing database RAG context & historical machine trends...",
      "Models are debating findings...",
      "Resolving consensus or voting on final diagnosis...",
      "Finalizing consensus-driven diagnostics report..."
    ];

    let msgIdx = 0;
    setLoadingMessage(messages[0]);
    const timer = setInterval(() => {
      msgIdx = (msgIdx + 1) % messages.length;
      setLoadingMessage(messages[msgIdx]);
    }, 2500);

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
        maintenanceHistory: maintenanceLogs,
        componentId: selectedComponentId || null,
        technologyType: selectedTech,
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
          if (!response.ok) {
            let errMsg = "Diagnosis failed";
            if (contentType && contentType.includes("application/json")) {
              try {
                const errData = await response.json();
                if (errData && errData.error) {
                  errMsg = errData.error;
                }
              } catch (_) {}
            }
            throw new Error(errMsg);
          }

          if (!contentType || !contentType.includes("application/json")) {
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
      console.error("Diagnostics execution error:", err);
      const isNetwork = !navigator.onLine || err.message?.toLowerCase().includes("failed to fetch") || err.name === "TypeError" || err.name === "AbortError";
      if (isNetwork) {
        showToast("Network error. Please check your connection and try again.", "error");
        setErrorMsg("Network error. Please check your connection and try again.");
      } else {
        const msg = err.message || "";
        let displayError = "Diagnosis failed. Please check your API keys in settings and try again.";
        if (msg && !msg.toLowerCase().includes("all ai models failed") && !msg.toLowerCase().includes("diagnosis failed") && !msg.toLowerCase().includes("invalid response") && !msg.toLowerCase().includes("server error")) {
          displayError = msg;
        }
        showToast(displayError, "error");
        setErrorMsg(displayError);
      }
    } finally {
      clearInterval(timer);
      setIsLoading(false);
    }
  };

  // Submit verification feedback to Neon database ML log
  const handleSubmitFeedback = async (
    wasCorrect: boolean,
    correctedFaultType?: string,
    correctedDetails?: string,
    correctedSeverity?: string
  ) => {
    setIsFeedbackSubmitting(true);
    setFeedbackError("");

    try {
      const response = await fetch("/api/analysis/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis_id: diagnosticResult?.db_id || null,
          is_correct: wasCorrect,
          actual_fault_type: wasCorrect ? null : (correctedFaultType || null),
          actual_details: wasCorrect ? null : (correctedDetails || null),
          actual_severity: wasCorrect ? null : (correctedSeverity || null)
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit feedback");
      }

      setFeedbackSubmitted(true);
      setFeedbackStatus(wasCorrect ? "correct" : "incorrect");

      if (wasCorrect) {
        showToast("Feedback saved. Thank you!", "success");
        setToastMsg("Feedback saved. Thank you!");
      } else {
        showToast("Correction saved. AI will learn from this!", "success");
        setToastMsg("Correction saved. AI will learn from this!");
      }
    } catch (err: any) {
      console.error(err);
      setFeedbackError(err.message || "Failed to submit verification feedback to the server.");
      showToast("Error saving feedback.", "error");
    } finally {
      setIsFeedbackSubmitting(false);
    }
  };

  // Copy CMMS Work Order with dynamic and enhanced formatting
  const handleCopyCMMS = () => {
    if (!diagnosticResult) return;

    const d = diagnosticResult;
    const selectedPlant = plants.find(p => p.id === selectedPlantId);
    const selectedRoute = routesList.find(r => r.id === selectedRouteId);
    const selectedAsset = assetsList.find(a => a.id === selectedAssetId);
    const selectedComponent = componentsList.find(c => c.id === selectedComponentId);

    const plantName = selectedPlant?.name || "Unspecified Plant";
    const routeName = selectedRoute?.name || "Unspecified Route";
    const assetName = selectedAsset?.name || "Unspecified Asset";
    const componentName = selectedComponent?.name || "Unspecified Component";

    const tag = specs?.tag || specs?.tagNumber || specs?.tag_number || "TAG-UNSPECIFIED";
    const primaryFault = d.probable_faults?.[0]?.fault_name || d.probable_faults?.[0]?.fault || "Undetermined Anomaly";
    const severity = d.manager_summary?.severity || "Medium";
    const primaryAction = d.immediate_actions?.[0]?.action || "Perform verification scan and contact engineer.";

    let dueDate = "Medium Priority (Within 1 Month)";
    const sevLower = severity.toLowerCase();
    if (sevLower === "critical") {
      dueDate = "Immediate (Within 24 Hours)";
    } else if (sevLower === "high") {
      dueDate = "High Priority (Within 1 Week)";
    } else if (sevLower === "medium") {
      dueDate = "Medium Priority (Within 1 Month)";
    } else if (sevLower === "low") {
      dueDate = "Routine (Next Scheduled Shutdown)";
    }

    const timestamp = new Date().toLocaleString();

    const cmmsText = `===============================================
🔧 CMMS WORK ORDER REQUISITION - AUTOMATIC AI DISPATCH
===============================================
ASSET: ${plantName} > ${routeName} > ${assetName} > ${componentName}
TAG: ${tag}
ISSUE: ${primaryFault}
SEVERITY LEVEL: ${severity}
RECOMMENDED ACTION: ${primaryAction}
DUE DATE: ${dueDate}
GENERATION TIMESTAMP: ${timestamp}
DISPATCHED BY: MotorMedic Pro AI
===============================================`;

    navigator.clipboard.writeText(cmmsText);
    setIsCopied(true);
    setToastMsg("Work order copied to clipboard! Ready to paste into SAP/Maximo.");
    setTimeout(() => setIsCopied(false), 3000);
  };

  // Format and copy the complete diagnostic report to clipboard
  const handleCopyFullReport = () => {
    if (!diagnosticResult) return;

    const d = diagnosticResult;
    const selectedPlant = plants.find(p => p.id === selectedPlantId);
    const selectedRoute = routesList.find(r => r.id === selectedRouteId);
    const selectedAsset = assetsList.find(a => a.id === selectedAssetId);
    const selectedComponent = componentsList.find(c => c.id === selectedComponentId);

    const plantName = selectedPlant?.name || "Unspecified Plant";
    const routeName = selectedRoute?.name || "Unspecified Route";
    const assetName = selectedAsset?.name || "Unspecified Asset";
    const componentName = selectedComponent?.name || "Unspecified Component";
    const tag = specs?.tag || specs?.tagNumber || specs?.tag_number || "TAG-UNSPECIFIED";

    const timestamp = new Date().toLocaleString();

    let text = `==================================================
📋 MOTOR_MEDIC PRO AI DIAGNOSTIC REPORT
==================================================
ASSET CONTEXT:
  - Plant: ${plantName}
  - Route: ${routeName}
  - Asset: ${assetName}
  - Component: ${componentName}
  - Tag: ${tag}
  - Timestamp: ${timestamp}

HEALTH STATUS SUMMARY:
  - Equipment Status: ${d.equipment_status}
  - Overall Vibration Level: ${d.overall_vibration_level || "N/A"}
  - ISO 10816 Zone: ${d.iso_severity_zone || "N/A"}
  - Confidence Score: ${d.confidence_score}%

EXECUTIVE BRIEF:
${d.manager_summary?.executive_brief || "No summary brief available."}

DIAGNOSTIC REASONING:
${d.manager_summary?.reasoning || "No reasoning details available."}

PROBABLE FAULTS IDENTIFIED:
`;

    if (d.probable_faults && d.probable_faults.length > 0) {
      d.probable_faults.forEach((f, idx) => {
        text += `  [${idx + 1}] Fault: ${f.fault_name || f.fault || "Unknown Anomaly"}\n`;
        text += `      Probability: ${f.probability}%\n`;
        text += `      Confidence Level: ${f.confidence}\n`;
        if (f.description) text += `      Details: ${f.description}\n`;
      });
    } else {
      text += "  - No specific faults detected (Normal Operation).\n";
    }

    if (d.immediate_actions && d.immediate_actions.length > 0) {
      text += `\nRECOMMENDED ACTIONS:\n`;
      d.immediate_actions.forEach((act: any, idx) => {
        text += `  - [Action ${idx + 1}]: ${act.action || act} (Priority: ${act.priority || "Normal"})\n`;
      });
    }

    text += `\n==================================================\nDISPATCHED BY: MotorMedic Pro AI Multi-Agent Console`;

    navigator.clipboard.writeText(text);
    setIsReportCopied(true);
    setToastMsg("Report copied to clipboard!");
    setTimeout(() => setIsReportCopied(false), 3000);
  };

  // Export PDF Report using ReportGenerator module
  const handleExportPDF = () => {
    if (!diagnosticResult) return;

    const selectedPlant = plants.find(p => p.id === selectedPlantId);
    const selectedRoute = routesList.find(r => r.id === selectedRouteId);
    const selectedAsset = assetsList.find(a => a.id === selectedAssetId);
    const selectedComponent = componentsList.find(c => c.id === selectedComponentId);

    const plantName = selectedPlant?.name || "Unspecified Plant";
    const routeName = selectedRoute?.name || "Unspecified Route";
    const assetName = selectedAsset?.name || "Unspecified Asset";
    const componentName = selectedComponent?.name || "Unspecified Component";

    generatePDFReport({
      plantName,
      routeName,
      assetName,
      componentName,
      diagnosticResult,
      category,
      symptoms
    });

    setToastMsg("✓ PDF Report successfully generated and downloaded!");
  };

  // Confirm and Link an analysis run in Quick Mode to a database Component
  const handleConfirmLinkAndSave = async () => {
    if (!diagnosticResult?.db_id || !modalComponentId) return;

    setIsLinking(true);
    try {
      const response = await fetch("/api/save-temporary-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: diagnosticResult.db_id,
          componentId: modalComponentId
        })
      });

      if (!response.ok) {
        throw new Error("Failed to link asset and save.");
      }

      const resData = await response.json();
      
      // Update local diagnosticResult so it is marked permanent
      setDiagnosticResult(prev => prev ? { ...prev, is_temporary: false } : null);
      setToastMsg("✓ Analysis successfully linked to asset & saved permanently!");
      showToast("Analysis successfully linked to asset & saved permanently!", "success");
      setShowLinkModal(false);
    } catch (err: any) {
      console.error(err);
      showToast("Failed to save analysis. Please try again.", "error");
      setErrorMsg("Failed to save analysis. Please try again.");
    } finally {
      setIsLinking(false);
    }
  };

  // Direct manual dispatch of critical email alert
  const handleSendManualAlert = async () => {
    if (!diagnosticResult) return;
    setIsAlertSending(true);
    setAlertSuccessMsg(null);

    const selectedPlant = plants.find(p => p.id === selectedPlantId);
    const selectedRoute = routesList.find(r => r.id === selectedRouteId);
    const selectedAsset = assetsList.find(a => a.id === selectedAssetId);
    const selectedComponent = componentsList.find(c => c.id === selectedComponentId);

    const assetName = selectedAsset?.name 
      ? `${selectedAsset.name} (${selectedComponent?.name || "Component"})`
      : "Machinery Asset Unit";

    const primaryFault = diagnosticResult.probable_faults?.[0]?.fault_name || 
                         diagnosticResult.probable_faults?.[0]?.fault || 
                         "Undetermined Fault Pattern";

    const severity = diagnosticResult.manager_summary?.severity || "High";

    try {
      const res = await fetch("/api/send-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetName,
          faultName: primaryFault,
          severity
        })
      });

      if (res.ok) {
        setAlertSuccessMsg("Alert notification dispatched successfully to shanedufrene1989@gmail.com!");
        setToastMsg("✓ Critical Email Alert dispatched successfully!");
        showToast("✓ Critical Email Alert dispatched successfully!", "success");
      } else {
        throw new Error("Failed to dispatch alert.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Failed to send critical email notification alert.");
      showToast("Failed to send critical email notification alert.", "error");
    } finally {
      setIsAlertSending(false);
    }
  };

  // Run AI Integrity Test
  const handleRunAIIntegrityTest = async () => {
    setIsRunningTest(true);
    setTestResult(null);
    setErrorMsg("");
    try {
      showToast("Starting AI Diagnostics Integrity Test with known Bearing defect telemetry...", "info");
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      
      const customKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || localStorage.getItem("custom_gemini_api_key");
      if (customKey) {
        headers["X-Gemini-API-Key"] = customKey;
      }

      const response = await fetch("/api/test-diagnosis", {
        method: "GET",
        headers
      });

      if (!response.ok) {
        throw new Error(`Test request failed with status ${response.status}`);
      }

      const data = await response.json();
      setTestResult(data);
      if (data.success) {
        if (data.isCorrectDiagnosis) {
          showToast("AI Integrity Test PASSED! Correctly diagnosed bearing defect from spectrum peaks.", "success");
        } else {
          showToast(`AI Integrity Test completed with unexpected diagnosis: ${data.actual}`, "warning");
        }
        if (data.result) {
          setDiagnosticResult(data.result);
          // Set symptoms/specs state to matching test values so visual matches what was tested
          setSymptoms("High frequency accelerometer readings indicate distinct peak at 122 Hz, corresponding to BPFO outer race defect frequency. Motor overall velocity is 0.22 in/s RMS.");
          setCategory("Centrifugal Pump");
          setSpecs({
            manufacturer: "SKF",
            model: "6205-2Z",
            rpm: "1800",
            vibration_level: "0.22 in/s"
          });
        }
      } else {
        throw new Error(data.error || "Unknown test failure");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`AI Integrity Test Failed: ${err.message}`);
      showToast(`AI Integrity Test Failed: ${err.message}`, "error");
    } finally {
      setIsRunningTest(false);
    }
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
    setToastMsg("✓ Report successfully saved to local web history!");
  };

  return (
    <div className={`space-y-6 pb-12 transition-all duration-300 p-2 rounded-3xl ${
      quickAnalysisMode 
        ? "bg-amber-950/10 border border-amber-500/10 shadow-inner" 
        : "bg-transparent border border-transparent"
    }`}>
      {/* Toast Notification Container */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 bg-slate-900 border border-yellow-500 text-yellow-400 px-4 py-3 rounded-xl shadow-2xl animate-bounce">
          <span className="text-xs font-bold font-mono">{toastMsg}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white font-display">Machinery Fault Diagnosis</h2>
          <p className="text-xs text-slate-400">Provide observations, upload data telemetry, and get a reliability brief</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Quick Analysis Mode Toggle Switch */}
          <label className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl cursor-pointer hover:border-amber-500/50 transition-all select-none shadow">
            <input 
              type="checkbox"
              checked={quickAnalysisMode}
              onChange={(e) => {
                setQuickAnalysisMode(e.target.checked);
                if (e.target.checked) {
                  setErrorMsg("");
                }
              }}
              className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500 h-4 w-4 cursor-pointer"
            />
            <span className="text-xs font-bold text-slate-200">
              📊 Quick Analysis Mode <span className="text-[10px] text-amber-400 font-medium">(No DB Required)</span>
            </span>
          </label>

          <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 shrink-0 shadow">
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

          {testingMode && (
            <button
              onClick={handleRunAIIntegrityTest}
              disabled={isRunningTest}
              className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 font-bold text-xs rounded-xl transition-all shadow flex items-center gap-1.5"
            >
              {isRunningTest ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : (
                <Check className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>{isRunningTest ? "Running Test..." : "Run AI Integrity Test"}</span>
            </button>
          )}
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

      {/* TARGET ASSET FOR ANALYSIS (CONTEXT-AWARE NAVIGATION) */}
      <div className="bg-[#0b1329] border border-slate-800/80 rounded-2xl p-5 space-y-4 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-400 text-[10px] font-extrabold text-slate-950">
              Target
            </span>
            <h3 className="text-sm font-bold text-white font-display uppercase tracking-wider">
              Target Asset for Analysis
            </h3>
          </div>
          {quickAnalysisMode ? (
            <span className="text-[10px] font-extrabold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              ⚡ Quick Analysis Active
            </span>
          ) : targetContext ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-400/20">
                🔗 Assets Page Context Active
              </span>
              <button
                type="button"
                onClick={() => {
                  if (onClearTargetContext) onClearTargetContext();
                  setSelectedPlantId("");
                  setSelectedRouteId("");
                  setSelectedAssetId("");
                  setSelectedComponentId("");
                }}
                className="text-[10px] text-rose-400 hover:text-rose-300 underline font-semibold"
              >
                Clear / Change Target
              </button>
            </div>
          ) : selectedComponentId ? (
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              ✓ Component Ready
            </span>
          ) : (
            <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 animate-pulse">
              ⚠️ Target Component Required
            </span>
          )}
        </div>

        {quickAnalysisMode ? (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-xs space-y-2 text-amber-300">
            <span className="font-bold flex items-center gap-1.5 text-amber-400">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
              ⚡ Quick Analysis Mode (No Database Selection Required) Active
            </span>
            <p className="leading-relaxed">
              Quick Analysis Mode is **ON**. You can upload a telemetry file or video inspection and click "Diagnose Machinery Fault" immediately without choosing any plant or asset targets. Results will be computed in real-time, but they will **NOT** be permanently saved under any database asset unless manually linked.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Plant Dropdown */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">1. Select Plant</label>
                <select
                  value={selectedPlantId}
                  disabled={!!targetContext}
                  onChange={(e) => {
                    setSelectedPlantId(e.target.value ? Number(e.target.value) : "");
                    setSelectedRouteId("");
                    setSelectedAssetId("");
                    setSelectedComponentId("");
                  }}
                  className="w-full bg-slate-950 text-xs font-semibold text-slate-200 border border-slate-850 focus:border-yellow-400 rounded-xl px-3 py-2.5 outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <option value="">-- Choose Plant --</option>
                  {plants.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Route Dropdown */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">2. Select Route / Area</label>
                <select
                  value={selectedRouteId}
                  disabled={!!targetContext || !selectedPlantId}
                  onChange={(e) => {
                    setSelectedRouteId(e.target.value ? Number(e.target.value) : "");
                    setSelectedAssetId("");
                    setSelectedComponentId("");
                  }}
                  className="w-full bg-slate-950 text-xs font-semibold text-slate-200 border border-slate-850 focus:border-yellow-400 rounded-xl px-3 py-2.5 outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <option value="">-- Choose Route --</option>
                  {routesList.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              {/* Asset Dropdown */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">3. Select Asset</label>
                <select
                  value={selectedAssetId}
                  disabled={!!targetContext || !selectedRouteId}
                  onChange={(e) => {
                    setSelectedAssetId(e.target.value ? Number(e.target.value) : "");
                    setSelectedComponentId("");
                  }}
                  className="w-full bg-slate-950 text-xs font-semibold text-slate-200 border border-slate-850 focus:border-yellow-400 rounded-xl px-3 py-2.5 outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <option value="">-- Choose Asset --</option>
                  {assetsList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} {a.tag_number ? `(${a.tag_number})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Component Dropdown */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">4. Select Component</label>
                <select
                  value={selectedComponentId}
                  disabled={!!targetContext || !selectedAssetId}
                  onChange={(e) => {
                    setSelectedComponentId(e.target.value ? Number(e.target.value) : "");
                  }}
                  className="w-full bg-slate-950 text-xs font-semibold text-slate-200 border border-slate-850 focus:border-yellow-400 rounded-xl px-3 py-2.5 outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <option value="">-- Choose Component --</option>
                  {componentsList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.type ? `(${c.type})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!selectedComponentId && (
              <p className="text-[11px] font-mono text-amber-400/80 bg-amber-500/5 border border-amber-500/10 px-3 py-2 rounded-xl">
                ⚠️ Attention: Universal File Upload, Video Inspection, and the 'Diagnose Machinery Fault' button remain disabled until you select a Target Component. This guarantees context accuracy in the asset management database.
              </p>
            )}
          </>
        )}
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
          {allowedTechs.map((tech) => {
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
          {/* Section 1: Category Picker */}
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

          {/* Section 2: Machine Specifications Panel */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-yellow-400" />
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">2. Machine Specifications</h3>
              </div>
              <button
                type="button"
                onClick={() => nameplateInputRef.current?.click()}
                disabled={isScanningNameplate}
                className="px-2.5 py-1 bg-yellow-400 hover:bg-yellow-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-[10px] rounded flex items-center gap-1 shadow transition-all"
                title="Scan nameplate plate image to auto-fill specs"
              >
                <Camera className="w-3 h-3" />
                <span>Auto-Scan Plate</span>
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

            {/* Structured Specifications Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              {/* Group 1: Motor specs */}
              <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-4 space-y-3.5">
                <div className="border-b border-slate-800 pb-1.5">
                  <h4 className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">Motor Specs</h4>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Base Operating RPM</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={specs.specRpm === "N/A" ? "" : specs.specRpm}
                        onChange={(e) => handleSpecChange("specRpm", e.target.value || "N/A")}
                        placeholder="e.g. 1800"
                        className="w-full bg-slate-950 border border-slate-800 focus:border-yellow-400 rounded-lg p-2 pr-10 text-xs text-slate-200 focus:outline-none font-mono"
                      />
                      <span className="absolute right-2.5 top-2 text-[9px] font-bold text-slate-500">RPM</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Shaft Orientation</label>
                    <select
                      value={specs.specOrientation}
                      onChange={(e) => handleSpecChange("specOrientation", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-yellow-400 rounded-lg p-2 text-xs text-slate-200 focus:outline-none font-mono"
                    >
                      <option value="N/A">N/A</option>
                      <option value="Horizontal">Horizontal Mount</option>
                      <option value="Vertical">Vertical Mount</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Group 2: Bearing & Transmission specs */}
              <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-4 space-y-3.5">
                <div className="border-b border-slate-800 pb-1.5">
                  <h4 className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Transmission Specs</h4>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Drive Coupling Type</label>
                    <select
                      value={specs.specDrive}
                      onChange={(e) => handleSpecChange("specDrive", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-yellow-400 rounded-lg p-2 text-xs text-slate-200 focus:outline-none font-mono"
                    >
                      <option value="N/A">N/A</option>
                      <option value="Direct">Direct Drive</option>
                      <option value="Belt">Belt-driven</option>
                      <option value="Gearbox">Gearbox coupled</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Pinion Teeth Count</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={specs.specPinionTeeth === "N/A" ? "" : specs.specPinionTeeth}
                        onChange={(e) => handleSpecChange("specPinionTeeth", e.target.value || "N/A")}
                        placeholder="e.g. 17"
                        className="w-full bg-slate-950 border border-slate-800 focus:border-yellow-400 rounded-lg p-2 pr-12 text-xs text-slate-200 focus:outline-none font-mono"
                      />
                      <span className="absolute right-2.5 top-2 text-[9px] font-bold text-slate-500">TEETH</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Group 3: Operating conditions & Geometry */}
              <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-4 space-y-3.5">
                <div className="border-b border-slate-800 pb-1.5">
                  <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Geometry Specs</h4>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Fan Blade Count</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={specs.specFanBlades === "N/A" ? "" : specs.specFanBlades}
                        onChange={(e) => handleSpecChange("specFanBlades", e.target.value || "N/A")}
                        placeholder="e.g. 4"
                        className="w-full bg-slate-950 border border-slate-800 focus:border-yellow-400 rounded-lg p-2 pr-12 text-xs text-slate-200 focus:outline-none font-mono"
                      />
                      <span className="absolute right-2.5 top-2 text-[9px] font-bold text-slate-500">BLADES</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Pump Impeller Vanes</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={specs.specPumpImpellers === "N/A" ? "" : specs.specPumpImpellers}
                        onChange={(e) => handleSpecChange("specPumpImpellers", e.target.value || "N/A")}
                        placeholder="e.g. 5"
                        className="w-full bg-slate-950 border border-slate-800 focus:border-yellow-400 rounded-lg p-2 pr-12 text-xs text-slate-200 focus:outline-none font-mono"
                      />
                      <span className="absolute right-2.5 top-2 text-[9px] font-bold text-slate-500">VANES</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Gear Teeth Count</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={specs.specGearTeeth === "N/A" ? "" : specs.specGearTeeth}
                        onChange={(e) => handleSpecChange("specGearTeeth", e.target.value || "N/A")}
                        placeholder="e.g. 29"
                        className="w-full bg-slate-950 border border-slate-800 focus:border-yellow-400 rounded-lg p-2 pr-12 text-xs text-slate-200 focus:outline-none font-mono"
                      />
                      <span className="absolute right-2.5 top-2 text-[9px] font-bold text-slate-500">TEETH</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Baseline Comparison & Delta Input Card */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                3. Baseline Comparison Parameters
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

          {/* Section 4: Observed Symptoms Text Box */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 relative">
            <div className="flex justify-between items-center gap-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                4. Equipment Symptoms & Observations
              </h3>
              <button
                onClick={toggleDictation}
                title={isDictating ? "Stop speech-to-text dictation" : "Start speech-to-text dictation"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
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

          {/* Section 5: Telemetry and Image upload zone */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              5. Diagnostic Telemetry & Media Files
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Universal File upload */}
              <div className="flex flex-col gap-1.5 w-full">
                <div 
                  onClick={() => {
                    if (quickAnalysisMode || selectedComponentId) {
                      fileInputRef.current?.click();
                    } else {
                      setErrorMsg("Please select a Target Component at the top before uploading telemetry files.");
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-5 text-center transition-all flex flex-col items-center justify-center space-y-2 group ${
                    (quickAnalysisMode || selectedComponentId) 
                      ? "border-slate-800 hover:border-slate-700 bg-slate-950/40 cursor-pointer" 
                      : "border-slate-900/60 bg-slate-950/10 cursor-not-allowed opacity-40"
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".csv,.txt,.json,.log,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.pdf"
                    className="hidden"
                    disabled={!(quickAnalysisMode || selectedComponentId)}
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
                          className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg cursor-pointer"
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
                        <p className="text-[10px] text-slate-500 mt-1">PNG, JPG, CSV, JSON, TXT, PDF</p>
                      </div>
                    </>
                  )}
                </div>
                {uploadError && (
                  <p className="text-[11px] text-red-500 font-semibold mt-1">
                    {uploadError}
                  </p>
                )}
              </div>

              {/* Video Inspection upload */}
              <div 
                onClick={() => {
                  if (quickAnalysisMode || selectedComponentId) {
                    videoInputRef.current?.click();
                  } else {
                    setErrorMsg("Please select a Target Component at the top before uploading inspection videos.");
                  }
                }}
                className={`border-2 border-dashed rounded-xl p-5 text-center transition-all flex flex-col items-center justify-center space-y-2 group ${
                  (quickAnalysisMode || selectedComponentId) 
                    ? "border-slate-800 hover:border-slate-700 bg-slate-950/40 cursor-pointer" 
                    : "border-slate-900/60 bg-slate-950/10 cursor-not-allowed opacity-40"
                }`}
              >
                <input
                  type="file"
                  ref={videoInputRef}
                  onChange={handleVideoChange}
                  accept="video/mp4,video/quicktime,video/webm"
                  className="hidden"
                  disabled={!(quickAnalysisMode || selectedComponentId)}
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
            ) : (() => {
              const isAnalyzeDisabled = (!uploadedFile && !videoFile) || (!quickAnalysisMode && !selectedComponentId);
              return (
                <button
                  onClick={triggerDiagnostics}
                  disabled={isAnalyzeDisabled}
                  className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all text-sm flex items-center justify-center gap-2 ${
                    !isAnalyzeDisabled 
                      ? "bg-yellow-400 hover:bg-yellow-500 text-slate-950 cursor-pointer" 
                      : "bg-slate-800 text-slate-500 cursor-not-allowed opacity-50"
                  }`}
                >
                  <Wrench className="w-4 h-4" />
                  <span>DIAGNOSE MACHINERY FAULT</span>
                </button>
              );
            })()}
          </div>
        </div>

        {/* Real-time Diagnostics Reference Columns (Col Span 4) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Physics Frequency Bands */}
          {machineryFrequencies ? (
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
          ) : (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 text-center py-8">
              <Info className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Physics Frequency Bands</h4>
              <p className="text-[10px] text-slate-500 mt-2 leading-normal">
                Enter Base Operating RPM in Machine Specifications to calculate mechanical Rotordynamics bounds.
              </p>
            </div>
          )}

          {/* Maintenance Timeline Panel */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
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
        </div>
      </div>

      {/* Diagnosis Results Section */}
      {diagnosticResult && (
        <div id="resultsSection" className="space-y-6 pt-4 animate-fade-in">
          {diagnosticResult.modelsExcluded && diagnosticResult.modelsExcluded.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 px-4 py-3.5 rounded-xl text-xs flex flex-col gap-1.5 animate-fade-in shadow-sm">
              <div className="flex items-center gap-2 font-bold text-[13px]">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Note: Only {diagnosticResult.modelsUsed?.length || (3 - diagnosticResult.modelsExcluded.length)} of 3 AI models were available for this analysis.</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed pl-6">
                Excluded models: {diagnosticResult.modelsExcluded.join(", ")}.
                {diagnosticResult.note && <span className="ml-1 text-slate-200 font-medium">{diagnosticResult.note}</span>}
              </p>
            </div>
          )}

          {alertSuccessMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl text-xs flex items-center gap-2 animate-fade-in">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{alertSuccessMsg}</span>
            </div>
          )}

          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-2 border-b border-slate-800">
            <div>
              <h3 className="text-lg font-bold text-white font-display">Diagnostic Results Brief</h3>
              <p className="text-xs text-slate-400">Review probability analysis, corrective guidelines, and economic summaries</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {diagnosticResult.is_temporary && (
                <div className="flex items-center gap-2 mr-2">
                  <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg">
                    ⚠️ Results not saved
                  </span>
                  <button
                    onClick={() => {
                      setModalPlantId("");
                      setModalRouteId("");
                      setModalAssetId("");
                      setModalComponentId("");
                      setShowLinkModal(true);
                    }}
                    className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-extrabold text-xs rounded-lg transition-all shadow-md flex items-center gap-1"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Link to Asset & Save</span>
                  </button>
                </div>
              )}

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
              <button
                onClick={handleCopyFullReport}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 font-semibold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow"
              >
                {isReportCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isReportCopied ? "Copied!" : "Copy Report to Clipboard"}</span>
              </button>
              <button
                onClick={handleExportPDF}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-rose-400 border border-slate-700 font-semibold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Export to PDF</span>
              </button>

              <button
                onClick={handleSendManualAlert}
                disabled={isAlertSending}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-red-400 border border-slate-700 font-semibold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow disabled:opacity-50"
              >
                {isAlertSending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Mail className="w-3.5 h-3.5" />
                )}
                <span>{isAlertSending ? "Sending..." : "Dispatch Email Alert"}</span>
              </button>
            </div>
          </div>

          {/* AI Correction and Feedback Loop */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl" id="feedback-section">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6.5 w-6.5 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Zap className="w-4 h-4 animate-pulse" />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">AI Correction & Feedback Loop</h4>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Consensus ID: {diagnosticResult.db_id || "Staged Session (Local)"}
                  </p>
                </div>
              </div>
              <span className="text-[9px] font-mono uppercase tracking-wider font-bold text-slate-500 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800/60">
                Machine Learning Loop
              </span>
            </div>

            {!feedbackSubmitted ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Verify the AI's diagnostic accuracy. Your validation corrects potential anomalies and trains our decentralized neural network for future predictive consensus.
                </p>

                {feedbackError && (
                  <div className="p-3 bg-red-950/40 border border-red-500/20 rounded-xl text-xs text-red-400 font-mono">
                    {feedbackError}
                  </div>
                )}

                {/* Primary Feedback Choice Buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    disabled={isFeedbackSubmitting || isLoading}
                    onClick={() => handleSubmitFeedback(true)}
                    className="flex-1 px-5 py-3.5 bg-emerald-600/90 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-950/10 transition-all cursor-pointer border border-emerald-500/20"
                    id="feedback-correct-btn"
                  >
                    {isFeedbackSubmitting && feedbackStatus === "correct" ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <span className="text-base">✅</span>
                    )}
                    <span>Diagnosis Correct</span>
                  </button>

                  <button
                    type="button"
                    disabled={isFeedbackSubmitting || isLoading}
                    onClick={() => {
                      setFeedbackStatus("incorrect");
                      setFeedbackError("");
                    }}
                    className={`flex-1 px-5 py-3.5 disabled:opacity-40 font-bold text-sm rounded-xl flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                      feedbackStatus === "incorrect"
                        ? "bg-red-600 text-white border border-red-500/30"
                        : "bg-slate-950 hover:bg-slate-900 text-red-400 border border-slate-800"
                    }`}
                    id="feedback-incorrect-btn"
                  >
                    <span className="text-base">❌</span>
                    <span>Diagnosis Incorrect</span>
                  </button>
                </div>

                {/* Dropdown & Details Correction workflow (When 'Incorrect' is selected) */}
                {feedbackStatus === "incorrect" && (
                  <div className="space-y-4 pt-4 border-t border-slate-800/80 animate-fade-in" id="correction-form">
                    <div className="bg-slate-950/40 rounded-xl p-4 border border-slate-800 space-y-4">
                      
                      {/* Grid for Dropdowns */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Field 1: Actual Fault Type */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Actual Fault Type:
                          </label>
                          <select
                            value={actualFaultType}
                            onChange={(e) => setActualFaultType(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs font-semibold rounded-lg px-3 py-2.5 outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20"
                            id="correction-fault-type"
                          >
                            <option value="Unbalance">Unbalance</option>
                            <option value="Misalignment">Misalignment</option>
                            <option value="Bearing Defect">Bearing Defect</option>
                            <option value="Looseness">Looseness</option>
                            <option value="Rub">Rub</option>
                            <option value="Electrical">Electrical</option>
                            <option value="Cavitation">Cavitation</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>

                        {/* Field 3: Severity */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Actual Severity:
                          </label>
                          <select
                            value={actualSeverity}
                            onChange={(e) => setActualSeverity(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs font-semibold rounded-lg px-3 py-2.5 outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20"
                            id="correction-severity"
                          >
                            <option value="Critical">Critical</option>
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                          </select>
                        </div>
                      </div>

                      {/* Field 2: Specific Details */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Specific Details (Optional):
                        </label>
                        <input
                          type="text"
                          value={actualDetails}
                          onChange={(e) => setActualDetails(e.target.value)}
                          placeholder="e.g. Inner Race Defect on Drive End Bearing"
                          className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2.5 outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 placeholder-slate-600"
                          id="correction-details"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={isFeedbackSubmitting}
                        onClick={() => {
                          handleSubmitFeedback(false, actualFaultType, actualDetails, actualSeverity);
                        }}
                        className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-lg transition-all shadow-md flex items-center gap-2 cursor-pointer"
                        id="submit-correction-btn"
                      >
                        {isFeedbackSubmitting ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <span>🚀</span>
                        )}
                        <span>Submit Correction & Train AI</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-950/50 border border-emerald-500/20 p-5 rounded-xl space-y-2 animate-fade-in">
                <div className="flex items-center gap-2 text-emerald-400">
                  <span className="text-lg">✓</span>
                  <h5 className="text-xs font-bold uppercase tracking-wider">Expert Feedback Logged</h5>
                </div>
                <p className="text-xs text-slate-300">
                  Thank you! The AI diagnosis was marked as{" "}
                  <strong className={feedbackStatus === "correct" ? "text-emerald-400" : "text-red-400"}>
                    {feedbackStatus === "correct" ? "CORRECT" : "INCORRECT"}
                  </strong>
                  .
                </p>
                {feedbackStatus === "incorrect" && (
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg mt-2 font-mono text-[11px] text-slate-300 space-y-1">
                    <div><span className="text-slate-500">Correct Fault:</span> <span className="text-red-400 font-bold">{actualFaultType}</span></div>
                    {actualDetails && <div><span className="text-slate-500">Details:</span> <span className="text-slate-200">{actualDetails}</span></div>}
                    <div><span className="text-slate-500">Severity:</span> <span className="text-orange-400 font-bold">{actualSeverity}</span></div>
                  </div>
                )}
                <p className="text-[10px] text-slate-500 leading-normal font-mono pt-1">
                  * Saved in training queue. Subsequent diagnosis requests for matching signatures will adapt and optimize according to this feedback.
                </p>
              </div>
            )}
          </div>

          {/* GAUGES GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Fault Confidence Meter */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 pb-2 border-b border-slate-800/60">
                <span className="text-sm">🎯</span>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Fault Confidence Meter</h4>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-start gap-6 py-2">
                <div className="relative w-36 h-20 shrink-0 z-10 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-180" viewBox="0 0 120 70">
                    <path
                      d="M 10 60 A 50 50 0 0 1 110 60"
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth="10"
                      strokeLinecap="round"
                    />
                    <path
                      d="M 10 60 A 50 50 0 0 1 110 60"
                      fill="none"
                      stroke="currentColor"
                      className={`${
                        (diagnosticResult.confidence_score ?? 85) >= 85 ? "text-emerald-500" :
                        (diagnosticResult.confidence_score ?? 85) >= 70 ? "text-amber-500" :
                        "text-rose-500"
                      } transition-all duration-1000 ease-out`}
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={157}
                      strokeDashoffset={157 - (Math.min(Math.max(diagnosticResult.confidence_score ?? 85, 0), 100) / 100) * 157}
                    />
                  </svg>
                  <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
                    <span className="text-2xl font-extrabold text-white tracking-tight leading-none">
                      {diagnosticResult.confidence_score ?? 85}%
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mt-1">AI Confidence</span>
                  </div>
                </div>
                <div className="space-y-1.5 text-center sm:text-left relative z-20 flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-200">
                    Confidence Rating: <span className={
                      (diagnosticResult.confidence_score ?? 85) >= 85 ? "text-emerald-400 font-bold" :
                      (diagnosticResult.confidence_score ?? 85) >= 70 ? "text-amber-400 font-bold" :
                      "text-rose-400 font-bold"
                    }>
                      {(diagnosticResult.confidence_score ?? 85) >= 85 ? "High / Confirmed" :
                       (diagnosticResult.confidence_score ?? 85) >= 70 ? "Moderate / Trending" :
                       "Low / Uncertain"}
                    </span>
                  </p>
                  <p className="text-[10px] text-slate-400 leading-relaxed font-sans max-w-sm whitespace-normal overflow-wrap-break-word">
                    Reflects the mathematical consensus rating and validation of spectral peaks across the active CAT IV Reliability AI models. Scores above 70% indicate high alignment.
                  </p>
                </div>
              </div>
            </div>

            {/* Machinery Failure Stage Classification */}
            {diagnosticResult.failure_stage && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">📈</span>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Failure Stage Classification</h4>
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
                    * <strong>Incipient</strong>: micro-wear (sub-harmonic frequencies); <strong>Early</strong>: initial physical fatigue; <strong>Advanced</strong>: distinct failure symptoms; <strong>Catastrophic</strong>: hazard requiring LOTO.
                  </p>
                </div>
              </div>
            )}
          </div>

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
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1" style={{ whiteSpace: "normal", overflowWrap: "break-word" }}>
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
                      <p className="text-[11px] text-slate-350 leading-relaxed font-sans whitespace-normal break-words" style={{ whiteSpace: "normal", overflowWrap: "break-word" }}>{f.description}</p>
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
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1" style={{ whiteSpace: "normal", overflowWrap: "break-word" }}>
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
                      <p className="text-[11px] text-slate-400 leading-relaxed font-sans whitespace-normal break-words" style={{ whiteSpace: "normal", overflowWrap: "break-word" }}>{a.rationale}</p>
                      
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
              <div className="space-y-4 text-xs max-h-[400px] overflow-y-auto pr-1" style={{ whiteSpace: "normal", overflowWrap: "break-word" }}>
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
                  <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800 leading-relaxed text-slate-300 text-[11px] font-sans whitespace-normal break-words" style={{ whiteSpace: "normal", overflowWrap: "break-word" }}>
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
                  <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 leading-relaxed font-sans whitespace-normal break-words" style={{ whiteSpace: "normal", overflowWrap: "break-word" }}>
                    {diagnosticResult.manager_summary?.business_impact}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Multi-Agent Debate System Summary & Rounds Log */}
          {diagnosticResult.debate_summary && (
            <div className="bg-[#0f172a] border border-indigo-500/35 hover:border-indigo-500/50 rounded-2xl p-6 space-y-5 mt-6 transition-all shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400">
                    <Zap className="w-4 h-4 animate-bounce" />
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider font-display">Multi-Agent Consensus Debate Report</h4>
                    <p className="text-[10px] text-slate-400 font-mono">Consensus-driven vibration analytics protocol</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-500/20 uppercase tracking-wider font-mono">
                    Consensus reached by {diagnosticResult.active_models_count || 3} active models
                  </span>
                </div>
              </div>
              
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-indigo-300 uppercase tracking-wider font-bold">Consensus Resolution Summary</span>
                <p className="text-xs text-slate-200 leading-relaxed font-sans bg-indigo-950/30 p-4 rounded-xl border border-indigo-500/20 font-medium">
                  {diagnosticResult.debate_summary}
                </p>
              </div>

              {diagnosticResult.debate_rounds_log && diagnosticResult.debate_rounds_log.length > 0 && (
                <div className="space-y-4 pt-2">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">Deliberation & Vote Transcript</span>
                  <div className="space-y-4">
                    {diagnosticResult.debate_rounds_log.map((roundLog: any, idx: number) => (
                      <div key={idx} className="bg-slate-950/60 p-5 rounded-xl border border-slate-850 space-y-4 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-indigo-300 font-mono">
                            Round {roundLog.round}: {roundLog.round === 1 ? "Independent Diagnoses" : "Peer Review & Debate"}
                          </span>
                          <span className={`text-[10px] px-2.5 py-0.5 rounded font-bold uppercase tracking-wider font-mono ${roundLog.round === 1 ? "bg-slate-900 text-slate-300 border border-slate-800" : "bg-indigo-950 text-indigo-300 border border-indigo-900"}`}>
                            {roundLog.round === 1 ? "Initial Vote" : "Debate Loop"}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {Object.entries(roundLog.votes || {}).map(([agentName, vote]: any) => {
                            const isExcluded = (vote || "").toLowerCase().includes("silently excluded") || (vote || "").toLowerCase().includes("offline");
                            const isAligned = vote && diagnosticResult.primary_fault_name && !isExcluded && (
                              vote.toLowerCase().replace(/[^a-z0-9]/g, "").includes(diagnosticResult.primary_fault_name.toLowerCase().replace(/[^a-z0-9]/g, "")) ||
                              diagnosticResult.primary_fault_name.toLowerCase().replace(/[^a-z0-9]/g, "").includes(vote.toLowerCase().replace(/[^a-z0-9]/g, ""))
                            );
                            return (
                              <div key={agentName} className={`p-3.5 rounded-xl border space-y-2 transition-all ${
                                isExcluded
                                  ? "bg-red-500/5 border-red-500/10 text-red-400 opacity-60"
                                  : isAligned
                                  ? "bg-indigo-500/5 border-indigo-500/30 text-indigo-300 shadow-sm"
                                  : "bg-slate-900/40 border-slate-850 text-slate-300"
                              }`}>
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[10px] font-bold text-slate-400 tracking-tight truncate">
                                    {agentName}
                                  </span>
                                  {isAligned && (
                                    <span className="text-[9px] font-bold bg-indigo-500/10 text-indigo-400 px-1.5 py-0.2 rounded border border-indigo-500/20 shrink-0 uppercase tracking-widest font-mono">
                                      ✓ Aligned
                                    </span>
                                  )}
                                  {isExcluded && (
                                    <span className="text-[9px] font-bold bg-red-500/10 text-red-400 px-1.5 py-0.2 rounded border border-red-500/20 shrink-0 uppercase tracking-widest font-mono animate-pulse">
                                      Offline
                                    </span>
                                  )}
                                </div>
                                <div className="font-extrabold text-sm truncate flex items-center gap-1.5">
                                  {isExcluded ? (
                                    <span className="text-red-400 text-xs">Silently Excluded / Key Offline</span>
                                  ) : (
                                    <span className={isAligned ? "text-indigo-200" : "text-slate-200"}>
                                      {vote || "None"}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 leading-relaxed pt-2 border-t border-slate-800/40 line-clamp-4 hover:line-clamp-none transition-all cursor-pointer font-sans">
                                  {roundLog.reasonings?.[agentName] || "No detailed explanation provided."}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

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

      {/* LINK TO ASSET & SAVE MODAL */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white font-display uppercase tracking-wider flex items-center gap-2">
                <Wrench className="w-4 h-4 text-yellow-400" />
                Link Analysis to Database Asset
              </h3>
              <button 
                onClick={() => setShowLinkModal(false)}
                className="text-slate-400 hover:text-white transition-colors text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Select which plant component you would like to permanently link this diagnostic analysis to in the system database. Once confirmed, this run will be marked as a permanent record.
            </p>

            <div className="space-y-4">
              {/* Plant Select */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-slate-500 uppercase">1. Plant Location</label>
                <select
                  value={modalPlantId}
                  onChange={(e) => {
                    setModalPlantId(e.target.value ? Number(e.target.value) : "");
                    setModalRouteId("");
                    setModalAssetId("");
                    setModalComponentId("");
                  }}
                  className="w-full bg-slate-950 text-xs font-semibold text-slate-200 border border-slate-800 rounded-xl px-3 py-2.5 outline-none focus:border-yellow-400"
                >
                  <option value="">-- Choose Plant --</option>
                  {plants.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Route Select */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-slate-500 uppercase">2. Route / Area</label>
                <select
                  value={modalRouteId}
                  disabled={!modalPlantId}
                  onChange={(e) => {
                    setModalRouteId(e.target.value ? Number(e.target.value) : "");
                    setModalAssetId("");
                    setModalComponentId("");
                  }}
                  className="w-full bg-slate-950 text-xs font-semibold text-slate-200 border border-slate-800 rounded-xl px-3 py-2.5 outline-none focus:border-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">-- Choose Route --</option>
                  {modalRoutesList.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              {/* Asset Select */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-slate-500 uppercase">3. Equipment Asset</label>
                <select
                  value={modalAssetId}
                  disabled={!modalRouteId}
                  onChange={(e) => {
                    setModalAssetId(e.target.value ? Number(e.target.value) : "");
                    setModalComponentId("");
                  }}
                  className="w-full bg-slate-950 text-xs font-semibold text-slate-200 border border-slate-800 rounded-xl px-3 py-2.5 outline-none focus:border-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">-- Choose Asset --</option>
                  {modalAssetsList.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {/* Component Select */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-slate-500 uppercase">4. Component</label>
                <select
                  value={modalComponentId}
                  disabled={!modalAssetId}
                  onChange={(e) => {
                    setModalComponentId(e.target.value ? Number(e.target.value) : "");
                  }}
                  className="w-full bg-slate-950 text-xs font-semibold text-slate-200 border border-slate-800 rounded-xl px-3 py-2.5 outline-none focus:border-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">-- Choose Component --</option>
                  {modalComponentsList.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-slate-850">
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLinkAndSave}
                disabled={!modalComponentId || isLinking}
                className={`flex-1 py-2.5 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  modalComponentId && !isLinking
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md cursor-pointer"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed opacity-50"
                }`}
              >
                {isLinking ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm Save</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
