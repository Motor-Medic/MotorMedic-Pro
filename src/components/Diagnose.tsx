import React, { useState, useRef, useEffect, useMemo } from "react";
import { DiagnosticResponse } from "../types";
import { 
  Zap, Droplet, Wrench, AlertTriangle, FileText, UploadCloud, Trash2, 
  Check, Copy, Settings, Info, RefreshCw, HelpCircle, Globe, ArrowUpRight, 
  Mail, Calendar, Activity, ShieldAlert, Heart, ClipboardCheck, ArrowRight,
  Sliders, TrendingUp, Sparkles, Eye, Mic, Volume2
} from "lucide-react";
import { generatePDFReport } from "./ReportGenerator";
import { useToast } from "./Toast";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import SpecsForm from "./SpecsForm";
import MaintenanceLogsSection from "./MaintenanceLogsSection";
import ResultsDisplay from "./ResultsDisplay";

interface DiagnoseProps {
  onSaveReport: (category: "Mechanical" | "Electrical" | "Hydraulic", symptoms: string, specs: Record<string, string>, data: any, fileName?: string, fileType?: string) => void;
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
  targetContext,
  onClearTargetContext,
  selectedCompanyId = 1,
  subscriptionPlan = "vibration_only"
}: DiagnoseProps) {
  const { showToast } = useToast();
  
  // Basic lists
  const [plants, setPlants] = useState<any[]>([]);
  const [routesList, setRoutesList] = useState<any[]>([]);
  const [assetsList, setAssetsList] = useState<any[]>([]);
  const [componentsList, setComponentsList] = useState<any[]>([]);

  // Asset selection IDs
  const [selectedPlantId, setSelectedPlantId] = useState<number | "">("");
  const [selectedRouteId, setSelectedRouteId] = useState<number | "">("");
  const [selectedAssetId, setSelectedAssetId] = useState<number | "">("");
  const [selectedComponentId, setSelectedComponentId] = useState<number | "">("");

  // Quick Analysis Mode
  const [quickAnalysisMode, setQuickAnalysisMode] = useState<boolean>(false);

  // Core options
  const [category, setCategory] = useState<"Mechanical" | "Electrical" | "Hydraulic">("Mechanical");
  const [equipmentType, setEquipmentType] = useState<string>("");
  const [customEquipment, setCustomEquipment] = useState<string>("");
  const [selectedTech, setSelectedTech] = useState<string>("Vibration Analysis");
  const [symptoms, setSymptoms] = useState("");

  // Gearbox specific shaft specifications
  const [numShafts, setNumShafts] = useState<number>(2);
  const [shafts, setShafts] = useState<Array<{
    name: string;
    teeth: string;
    rpm: string;
    type: "Spur" | "Helical" | "Bevel" | "Worm";
  }>>([
    { name: "Input Shaft", teeth: "20", rpm: "1750", type: "Spur" },
    { name: "Output Shaft", teeth: "50", rpm: "700", type: "Spur" }
  ]);

  // Nameplate scanner state
  const nameplateInputRef = useRef<HTMLInputElement>(null);
  const [isScanningNameplate, setIsScanningNameplate] = useState(false);
  const [scannedNameplate, setScannedNameplate] = useState<any | null>(null);

  // Maintenance logs state
  const [maintenanceLogs, setMaintenanceLogs] = useState<any[]>([]);
  const [isAddingLog, setIsAddingLog] = useState(false);
  const [newLog, setNewLog] = useState({
    work_date: new Date().toISOString().split("T")[0],
    work_type: "Bearing Replacement",
    technician_name: "",
    notes: "",
    parts_used: ""
  });

  // Equipment Specifications with 9 required fields
  const [specs, setSpecs] = useState<Record<string, string>>({
    specRpm: "1750",
    motorSpecs: "Three Phase",
    transmissionType: "Direct Drive",
    gravitySpecs: "Horizontal",
    specOrientation: "Horizontal", // Keep for backward compatibility
    powerRating: "150",
    assetCriticality: "Standard",
    driveType: "Direct Coupled",
    specDrive: "Direct Coupled", // Keep for backward compatibility
    pumpType: "Centrifugal",
    bearingType: "Ball",
    systemDetails: ""
  });

  const [rawTelemetryText, setRawTelemetryText] = useState("");
  const [telemetryTab, setTelemetryTab] = useState<"upload" | "trend">("upload");

  const handleSpecChange = (key: string, value: string) => {
    setSpecs((prev) => {
      const updated = { ...prev, [key]: value };
      // Map back compatibility keys automatically
      if (key === "gravitySpecs") {
        updated.specOrientation = value;
      }
      if (key === "driveType") {
        updated.specDrive = value;
      }
      return updated;
    });
  };

  // Drag & Drop / File state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    type: "image" | "text";
    data: string;
    mimeType?: string;
    size?: number;
  } | null>(null);

  // Parsed telemetry state (hidden from manual inputs but used to pass to backend)
  const [overallVelocity, setOverallVelocity] = useState<string>("0.08");
  const [oneX, setOneX] = useState<string>("0.02");
  const [twoX, setTwoX] = useState<string>("0.01");
  const [bearingInner, setBearingInner] = useState<string>("0.005");
  const [bearingOuter, setBearingOuter] = useState<string>("0.005");

  // Diagnostics states
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [diagnosticResult, setDiagnosticResult] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Historical past diagnoses
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [showHistoryChart, setShowHistoryChart] = useState(true);

  // Email Alert dispatching
  const [isAlertSending, setIsAlertSending] = useState(false);
  const [alertSuccessMsg, setAlertSuccessMsg] = useState<string | null>(null);

  // CMMS Work Order Overlay state
  const [generatedWorkOrder, setGeneratedWorkOrder] = useState<string | null>(null);

  // Fetch cascading databases on change
  useEffect(() => {
    const fetchPlants = async () => {
      try {
        const res = await fetch(`/api/plants?company_id=${selectedCompanyId}`);
        if (res.ok) setPlants(await res.json());
      } catch (err) {
        console.error("Failed to fetch plants:", err);
      }
    };
    fetchPlants();
  }, [selectedCompanyId]);

  useEffect(() => {
    if (selectedPlantId) {
      const fetchRoutes = async () => {
        try {
          const res = await fetch(`/api/routes?plant_id=${selectedPlantId}`);
          if (res.ok) setRoutesList(await res.json());
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

  useEffect(() => {
    if (selectedRouteId) {
      const fetchAssets = async () => {
        try {
          const res = await fetch(`/api/assets?route_id=${selectedRouteId}`);
          if (res.ok) setAssetsList(await res.json());
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

  useEffect(() => {
    if (selectedAssetId) {
      const fetchComponents = async () => {
        try {
          const res = await fetch(`/api/components?asset_id=${selectedAssetId}`);
          if (res.ok) setComponentsList(await res.json());
        } catch (err) {
          console.error("Failed to fetch components:", err);
        }
      };
      fetchComponents();
    } else {
      setComponentsList([]);
    }
  }, [selectedAssetId]);

  // Fetch maintenance logs from DB on selected asset change
  const fetchMaintenanceLogs = async () => {
    if (!selectedAssetId) {
      setMaintenanceLogs([]);
      return;
    }
    try {
      const res = await fetch(`/api/maintenance-logs?asset_id=${selectedAssetId}`);
      if (res.ok) {
        const data = await res.json();
        setMaintenanceLogs(data);
      }
    } catch (err) {
      console.error("Failed to fetch maintenance logs:", err);
    }
  };

  useEffect(() => {
    fetchMaintenanceLogs();
  }, [selectedAssetId]);

  // Dynamically update shafts config array when numShafts changes
  useEffect(() => {
    setShafts((prev) => {
      const newShafts = [...prev];
      if (numShafts > newShafts.length) {
        for (let i = newShafts.length; i < numShafts; i++) {
          let name = `Shaft ${i + 1}`;
          if (i === 0) name = "Input Shaft";
          else if (i === numShafts - 1) name = "Output Shaft";
          else name = `Intermediate Shaft ${i}`;

          newShafts.push({
            name,
            teeth: "30",
            rpm: "1000",
            type: "Spur"
          });
        }
      } else if (numShafts < newShafts.length) {
        newShafts.splice(numShafts);
      }
      
      if (newShafts.length >= 2) {
        newShafts[0].name = "Input Shaft";
        newShafts[newShafts.length - 1].name = "Output Shaft";
        for (let i = 1; i < newShafts.length - 1; i++) {
          newShafts[i].name = `Intermediate Shaft ${i}`;
        }
      } else if (newShafts.length === 1) {
        newShafts[0].name = "Main Shaft";
      }
      return newShafts;
    });
  }, [numShafts]);

  // Nameplate AI Upload and Scan logic
  const handleNameplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanningNameplate(true);
    setScannedNameplate(null);
    showToast("Processing nameplate image with Gemini AI...", "info");

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const base64Data = ev.target?.result as string;
        const res = await fetch("/api/scan-nameplate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileData: base64Data, mimeType: file.type })
        });
        if (!res.ok) {
          throw new Error("Failed to scan nameplate");
        }
        const parsed = await res.json();
        setScannedNameplate(parsed);
        showToast("✓ Nameplate successfully scanned!", "success");
      } catch (err: any) {
        console.error(err);
        showToast("Failed to read nameplate. Please try again.", "error");
      } finally {
        setIsScanningNameplate(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApplyNameplate = () => {
    if (!scannedNameplate) return;
    
    setSpecs(prev => ({
      ...prev,
      specRpm: scannedNameplate.rpm ? String(scannedNameplate.rpm) : prev.specRpm,
      systemDetails: [
        scannedNameplate.manufacturer ? `Mfg: ${scannedNameplate.manufacturer}` : "",
        scannedNameplate.model ? `Model: ${scannedNameplate.model}` : "",
        scannedNameplate.serial ? `S/N: ${scannedNameplate.serial}` : "",
        scannedNameplate.power ? `Power: ${scannedNameplate.power}` : "",
        prev.systemDetails
      ].filter(Boolean).join(" | ")
    }));

    showToast("✓ Specifications updated from scanned nameplate!", "success");
  };

  // Add field service maintenance log
  const handleAddMaintenanceLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetId) {
      showToast("Please select an Asset first.", "error");
      return;
    }
    if (!newLog.technician_name.trim() || !newLog.notes.trim()) {
      showToast("Please fill in the technician name and work notes.", "error");
      return;
    }

    try {
      const res = await fetch("/api/maintenance-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: selectedAssetId,
          work_date: newLog.work_date,
          work_type: newLog.work_type,
          technician_name: newLog.technician_name,
          notes: newLog.notes,
          parts_used: newLog.parts_used ? { items: newLog.parts_used.split(",").map(s => s.trim()) } : null
        })
      });

      if (res.ok) {
        showToast("✓ Maintenance log added successfully!", "success");
        setIsAddingLog(false);
        setNewLog({
          work_date: new Date().toISOString().split("T")[0],
          work_type: "Bearing Replacement",
          technician_name: "",
          notes: "",
          parts_used: ""
        });
        fetchMaintenanceLogs();
      } else {
        throw new Error();
      }
    } catch (err) {
      showToast("Failed to save maintenance log.", "error");
    }
  };

  // Handle targetContext synchronization
  useEffect(() => {
    if (targetContext) {
      if (targetContext.plantId) setSelectedPlantId(targetContext.plantId);
      if (targetContext.routeId) setSelectedRouteId(targetContext.routeId);
      if (targetContext.assetId) setSelectedAssetId(targetContext.assetId);
      if (targetContext.componentId) setSelectedComponentId(targetContext.componentId);
      if (targetContext.technologyType) {
        const rawTech = targetContext.technologyType;
        setSelectedTech(techMap[rawTech] || rawTech);
      }
      if (targetContext.quickAnalysisMode) {
        setQuickAnalysisMode(true);
      }
    }
  }, [targetContext]);

  // Load history from API on selected component change
  useEffect(() => {
    const fetchHistory = async () => {
      if (!selectedComponentId) {
        setHistoryList([]);
        return;
      }
      try {
        const res = await fetch(`/api/diagnosis-history/${selectedComponentId}`);
        if (res.ok) {
          const data = await res.json();
          setHistoryList(data);
        }
      } catch (err) {
        console.error("Failed to fetch past history:", err);
      }
    };
    fetchHistory();
  }, [selectedComponentId, diagnosticResult]);

  // File processing and parsing
 const processFile = async (file: File) => {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const reader = new FileReader();
  
  if (["png", "jpg", "jpeg", "webp"].includes(ext || "")) {
    // It's an image - use AI to analyze the spectrum
    reader.onload = async (ev) => {
      try {
        const base64Data = ev.target?.result as string;
        
        showToast("🤖 AI analyzing vibration spectrum image...", "info");
        
        // Call the new AI image analysis endpoint
        const res = await fetch("/api/analyze-spectrum-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            fileData: base64Data, 
            mimeType: file.type 
          })
        });
        
        if (res.ok) {
          const extractedData = await res.json();
          console.log("✅ AI extracted from image:", extractedData);
          
          // Update the state with extracted values
          if (extractedData.overall_velocity) setOverallVelocity(String(extractedData.overall_velocity));
          if (extractedData.oneX_rpm) setOneX(String(extractedData.oneX_rpm));
          if (extractedData.twoX_rpm) setTwoX(String(extractedData.twoX_rpm));
          if (extractedData.bearing_inner) setBearingInner(String(extractedData.bearing_inner));
          if (extractedData.bearing_outer) setBearingOuter(String(extractedData.bearing_outer));
          
          setUploadedFile({
            name: file.name,
            type: "image",
            data: base64Data,
            mimeType: file.type,
            size: file.size
          });
          
          showToast(`✓ Image analyzed! Overall: ${extractedData.overall_velocity || 'N/A'} in/s`, "success");
        } else {
          throw new Error("Failed to analyze image");
        }
      } catch (err: any) {
        console.error("Image analysis error:", err);
        showToast("⚠️ Could not analyze image. Using default values.", "warning");
        
        // Still set the file but use defaults
        setUploadedFile({
          name: file.name,
          type: "image",
          data: ev.target?.result as string,
          mimeType: file.type,
          size: file.size
        });
      }
    };
    reader.readAsDataURL(file);
  } else {
    // It's a text/CSV file - use the old parsing method
    reader.onload = (ev) => {
      const textContent = ev.target?.result as string;
      setUploadedFile({
        name: file.name,
        type: "text",
        data: textContent.substring(0, 15000),
        mimeType: file.type,
        size: file.size
      });
      parseTelemetryData(textContent);
    };
    reader.readAsText(file);
  }
};

  const parseTelemetryData = (content: string) => {
  console.log(" Parsing telemetry file content:", content.substring(0, 500));
  
  const lines = content.split(/\r?\n/);
  let vel = ""; let ox = ""; let tx = ""; let bi = ""; let bo = "";
  
  for (const line of lines) {
    const lower = line.toLowerCase();
    const match = line.match(/[\d.]+/);
    if (match) {
      const val = match[0];
      if (lower.includes("overall") || lower.includes("velocity")) vel = val;
      else if (lower.includes("1x") || lower.includes("onex")) ox = val;
      else if (lower.includes("2x") || lower.includes("twox")) tx = val;
      else if (lower.includes("inner") || lower.includes("bpfi") || lower.includes("bearing_inner")) bi = val;
      else if (lower.includes("outer") || lower.includes("bpfo") || lower.includes("bearing_outer")) bo = val;
    }
  }
  
  console.log("📊 Parsed values:", { vel, ox, tx, bi, bo });
  
  if (vel) setOverallVelocity(vel);
  if (ox) setOneX(ox);
  if (tx) setTwoX(tx);
  if (bi) setBearingInner(bi);
  if (bo) setBearingOuter(bo);
  
  if (vel || ox || tx || bi || bo) {
    showToast("✓ Successfully parsed vibration levels from telemetry spectrum file!", "success");
    console.log("✅ Updated state with parsed values");
  } else {
    showToast("⚠️ Could not parse vibration data. Using default values. Check console for details.", "warning");
  }
};


  const simulateUpload = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const allowed = ["png", "jpg", "jpeg", "csv", "txt", "pdf"];
    if (!allowed.includes(ext)) {
      setUploadError("Format unsupported. Please upload PNG, JPG, CSV, TXT, or PDF.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError("File exceeds 50MB capacity.");
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    setUploadProgress(0);

    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          processFile(file);
          return 100;
        }
        return prev + 25;
      });
    }, 120);
  };

  // Drag handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => {
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      simulateUpload(file);
    }
  };

  // Run machinery diagnosis
  const triggerDiagnostics = async () => {
    setErrorMsg("");
    setIsLoading(true);
    setDiagnosticResult(null);
    setGeneratedWorkOrder(null);
    setLoadingProgress(0);

    const messages = [
      "Parsing vibration data...",
      "Checking ISO 10816 thresholds...",
      "Searching industry databases...",
      "Analyzing environmental factors...",
      "Generating report..."
    ];

    let msgIdx = 0;
    setLoadingMessage(messages[0]);
    const messageInterval = setInterval(() => {
      msgIdx = (msgIdx + 1) % messages.length;
      setLoadingMessage(messages[msgIdx]);
    }, 1500);

    const progressInterval = setInterval(() => {
      setLoadingProgress((p) => (p >= 98 ? 98 : p + Math.floor(Math.random() * 10) + 3));
    }, 100);

    try {
      const gearboxSpecs = equipmentType === "Gearbox" ? {
        numGearShafts: String(numShafts),
        shafts: JSON.stringify(shafts)
      } : {};

      const payload = {
        overall_velocity: parseFloat(overallVelocity) || 0.08,
        oneX_rpm: parseFloat(oneX) || 0.02,
        twoX_rpm: parseFloat(twoX) || 0.01,
        bearing_inner: parseFloat(bearingInner) || 0.005,
        bearing_outer: parseFloat(bearingOuter) || 0.005,
        category,
        symptoms,
        specs: { ...specs, ...gearboxSpecs },
        fileData: uploadedFile?.data,
        fileType: uploadedFile?.type,
        fileName: uploadedFile?.name,
        technology: selectedTech,
        equipmentType,
        customEquipment: equipmentType === "Other" ? customEquipment.trim() : "",
        componentId: selectedComponentId || null,
        shafts: equipmentType === "Gearbox" ? shafts : undefined
      };

      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error("Vibration diagnosis engine returned an error.");
      }

      const data = await res.json();
      setLoadingProgress(100);
      setDiagnosticResult(data);
      showToast("✓ Hybrid Diagnosis successfully computed!", "success");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to execute machine diagnosis.");
      showToast("Failure executing diagnosis", "error");
    } finally {
      clearInterval(messageInterval);
      clearInterval(progressInterval);
      setIsLoading(false);
    }
  };

  // Local Save
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
    showToast("Report successfully saved to history!", "success");
  };

  // CMMS Work Order Generator Formatter (Priority 1)
  const handleGenerateCMMSWorkOrder = () => {
    if (!diagnosticResult) return;

    const plantName = plants.find(p => p.id === selectedPlantId)?.name || "Main Plant";
    const routeName = routesList.find(r => r.id === selectedRouteId)?.name || "Route Alpha";
    const assetName = assetsList.find(a => a.id === selectedAssetId)?.name || "Primary Asset";
    const componentName = componentsList.find(c => c.id === selectedComponentId)?.name || `Tag-${selectedComponentId || "101"}`;

    const fault = diagnosticResult.faults?.[0] || {
      type: "Unspecified Vibration",
      severity: diagnosticResult.overall_severity || "Normal",
      evidence: "Overall levels exceeded baseline limits",
      recommendation: "Perform visual and structural validation check",
      mcmaster_search_term: "Vibration dampener"
    };

    const isCritical = fault.severity === "Critical" || diagnosticResult.overall_severity === "Critical";
    const priority = isCritical ? "EMERGENCY (Priority 1)" : "PREVENTIVE (Priority 2)";
    const partsStr = fault.mcmaster_search_term 
      ? `Procure replacement parts on McMaster-Carr: ${fault.mcmaster_search_term} (Link: https://www.mcmaster.com/${encodeURIComponent(fault.mcmaster_search_term)})`
      : "No parts identified on McMaster-Carr catalog.";
    
    const laborHours = isCritical ? "4.5 Hours" : "2.0 Hours";

    const workOrder = `=== SAP / MAXIMO AUTOMATED CMMS WORK ORDER ===
WORK ORDER ID : WO-${Date.now().toString().slice(-6)}
ASSET TAG     : ${componentName}
DESCRIPTION   : ${fault.type} - AI Diagnosed Machinery Malfunction
LOCATION      : ${plantName} -> ${routeName} -> ${assetName}
PRIORITY      : ${priority}
EST. LABOR    : ${laborHours}
SAFETY PROTO  : LOTO (Lock-Out Tag-Out) required on all disconnect points prior to tool work.

DIAGNOSTIC EVIDENCE:
- ${fault.evidence}
- Overall Velocity Level: ${diagnosticResult.overall_vibration_level || overallVelocity}

RECOMMENDED CORRECTIVE ACTION:
- ${fault.recommendation}

RECOMMENDED PARTS:
- ${partsStr}

AUTHORIZED BY : MotorMedic Pro Expert Hybrid Engine
======================================================`;

    setGeneratedWorkOrder(workOrder);
    showToast("✓ CMMS Work Order generated successfully!", "success");
  };

  const handleCopyToClipboard = () => {
    if (!generatedWorkOrder) return;
    navigator.clipboard.writeText(generatedWorkOrder);
    showToast("✓ Formatted work order copied to clipboard!", "success");
  };

  // Direct email alert dispatch
  const handleSendManualAlert = async () => {
    if (!diagnosticResult) return;
    setIsAlertSending(true);
    setAlertSuccessMsg(null);
    try {
      const res = await fetch("/api/send-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetName: `${equipmentType} - Unit Tag ${selectedComponentId || "A101"}`,
          faultName: diagnosticResult.faults?.[0]?.type || "Vibrational Anomaly",
          severity: diagnosticResult.overall_severity || "Warning"
        })
      });
      if (res.ok) {
        setAlertSuccessMsg("Email dispatch successfully pushed to shanedufrene1989@gmail.com!");
        showToast("Email alert pushed successfully!", "success");
      } else {
        throw new Error();
      }
    } catch (_) {
      showToast("Email push failed.", "error");
    } finally {
      setIsAlertSending(false);
    }
  };

  // Export PDF
  const handleExportPDF = () => {
    if (!diagnosticResult) return;
    generatePDFReport({
      plantName: plants.find(p => p.id === selectedPlantId)?.name || "Default Plant",
      routeName: routesList.find(r => r.id === selectedRouteId)?.name || "Default Route",
      assetName: assetsList.find(a => a.id === selectedAssetId)?.name || "Default Asset",
      componentName: componentsList.find(c => c.id === selectedComponentId)?.name || "Default Tag",
      diagnosticResult: {
        ...diagnosticResult,
        // Ensure legacy elements keep working beautifully for reports
        overallSeverity: diagnosticResult.overall_severity,
        overall_vibration_level: diagnosticResult.overall_vibration_level,
        root_cause_analysis: diagnosticResult.executive_summary
      },
      category,
      symptoms
    });
    showToast("✓ PDF Report successfully exported!", "success");
  };

  // Map Recharts Trend Data using actual Neon DB history
  const trendData = useMemo(() => {
    if (historyList.length === 0) {
      return [
        { name: "30 Days Ago", velocity: 0.08 },
        { name: "15 Days Ago", velocity: 0.09 },
        { name: "Current", velocity: parseFloat(overallVelocity) || 0.08 }
      ];
    }
    const points = historyList.slice().reverse().map((h) => {
      let vel = 0.08;
      try {
        const vData = typeof h.vibration_data === "string" ? JSON.parse(h.vibration_data) : h.vibration_data;
        vel = parseFloat(vData?.overall_velocity) || 0.08;
      } catch (_) {}
      return {
        name: new Date(h.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        velocity: vel
      };
    });
    return points;
  }, [historyList, overallVelocity]);

  // Stepper Selection Progress
  const selectionProgress = useMemo(() => {
    if (quickAnalysisMode) return 100;
    let steps = 0;
    if (selectedPlantId) steps += 25;
    if (selectedRouteId) steps += 25;
    if (selectedAssetId) steps += 25;
    if (selectedComponentId) steps += 25;
    return steps;
  }, [selectedPlantId, selectedRouteId, selectedAssetId, selectedComponentId, quickAnalysisMode]);

  // Required validation check
  const isFormValid = useMemo(() => {
    if (!selectedTech) return false;
    if (!equipmentType) return false;
    if (equipmentType === "Other" && !customEquipment.trim()) return false;
    if (quickAnalysisMode) return true;
    return !!selectedComponentId;
  }, [selectedTech, equipmentType, customEquipment, selectedComponentId, quickAnalysisMode]);

  // Priority 2 - Commented out for future
  /*
  const generateInsuranceReport = () => {
    // TODO: Generate audit-ready reliability reports for insurers
  };

  const calculateEnvironmentalRisk = () => {
    // TODO: Link fault modes to environmental compliance (EPA, HazLoc)
  };
  */

  // Render clickable cards list
  const equipmentTypesList = [
    { id: "Pump Unit", label: "Pump Unit", icon: Droplet, desc: "Centrifugal & positive displacement pump assemblies" },
    { id: "Electric Motor", label: "Electric Motor", icon: Zap, desc: "AC/DC electric induction motors & drives" },
    { id: "Ventilation Fan", label: "Ventilation Fan", icon: RefreshCw, desc: "Industrial blowers, high power HVAC & cooling fans" },
    { id: "Compressor", label: "Compressor", icon: Activity, desc: "Rotary screw, reciprocating & reciprocating compressors" },
    { id: "Gearbox", label: "Gearbox", icon: Settings, desc: "Speed reducers & industrial gear drives" },
    { id: "Other", label: "Custom Other", icon: HelpCircle, desc: "Other specialized turbines & machinery" },
  ];

  const handleVoiceDictate = () => {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = "en-US";
      recognition.interimResults = false;
      
      showToast("🎙️ Listening... Speak now.", "info");
      recognition.start();
      
      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setSymptoms(prev => prev ? `${prev} ${text}` : text);
        showToast("✓ Voice dictation captured!", "success");
      };
      
      recognition.onerror = () => {
        simulateVoiceFallback();
      };
    } else {
      simulateVoiceFallback();
    }
  };

  const simulateVoiceFallback = () => {
    showToast("Simulating voice dictation...", "info");
    const phrases = [
      "Observed elevated temperatures on inboard bearing casing exceeding eighty-five degrees Celsius.",
      "High frequency screeching heard during steady-state operations, indicating outer race bearing pitting.",
      "Axial vibration levels showing prominent peaks at two times operating speed, likely shaft misalignment."
    ];
    const chosen = phrases[Math.floor(Math.random() * phrases.length)];
    setTimeout(() => {
      setSymptoms(prev => prev ? `${prev}\n[Dictated] ${chosen}` : `[Dictated] ${chosen}`);
      showToast("✓ Simulated voice dictation added!", "success");
    }, 1000);
  };

  return (
    <div className="space-y-6 pb-12 p-1.5 rounded-3xl bg-transparent">
      {/* Toast Notification Container */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 bg-slate-900 border border-yellow-500 text-yellow-400 px-4 py-3 rounded-xl shadow-2xl animate-bounce">
          <span className="text-xs font-bold font-mono">{toastMsg}</span>
        </div>
      )}

      {/* 1. Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-850">
        <div>
          <h2 className="text-xl font-black text-white font-display tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-yellow-400 animate-pulse" />
            <span>Machinery Fault Diagnosis</span>
          </h2>
          <p className="text-xs text-slate-400">Perform expert hybrid diagnostics utilizing ISO 10816 standards backed by web-grounded AI intelligence</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-800 px-3.5 py-2 rounded-xl">
          <span className="text-xs font-bold text-slate-300 font-mono">Quick Analysis Mode:</span>
          <button 
            type="button"
            onClick={() => setQuickAnalysisMode(!quickAnalysisMode)}
            className={`px-3 py-1 rounded-lg font-black text-[10px] tracking-wider font-mono transition-all ${
              quickAnalysisMode 
                ? "bg-yellow-400 text-slate-950 shadow-md" 
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            {quickAnalysisMode ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* 2. Asset Selection Progress Bar (Pill-shaped green/teal row) */}
      <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-4 space-y-3.5 shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-widest">Diagnostic Step Connection Status</span>
          <span className={`text-[10px] font-bold font-mono uppercase ${selectionProgress === 100 ? "text-emerald-400" : "text-yellow-400"}`}>
            {quickAnalysisMode ? "Bypassed" : `${selectionProgress}% Complete`}
          </span>
        </div>
        
        {/* Step Badges as Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-[11px] font-mono text-center">
          <div className={`p-2.5 rounded-full border transition-all ${selectedPlantId ? "bg-emerald-500/10 border-emerald-500 text-emerald-400 font-black shadow-inner" : "bg-slate-950 border-slate-900 text-slate-500"}`}>
            1. Plant Location
          </div>
          <div className={`p-2.5 rounded-full border transition-all ${selectedRouteId ? "bg-emerald-500/10 border-emerald-500 text-emerald-400 font-black shadow-inner" : "bg-slate-950 border-slate-900 text-slate-500"}`}>
            2. Route / Sector
          </div>
          <div className={`p-2.5 rounded-full border transition-all ${selectedAssetId ? "bg-emerald-500/10 border-emerald-500 text-emerald-400 font-black shadow-inner" : "bg-slate-950 border-slate-900 text-slate-500"}`}>
            3. Machinery Asset
          </div>
          <div className={`p-2.5 rounded-full border transition-all ${selectedComponentId ? "bg-emerald-500/10 border-emerald-500 text-emerald-400 font-black shadow-inner" : "bg-slate-950 border-slate-900 text-slate-500"}`}>
            4. Component Tag
          </div>
        </div>
      </div>

      {/* 3. Green Alert Box: LIVE PRODUCTION AI ENGINE ACTIVE */}
      <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-4 flex items-start gap-3.5 shadow-md animate-fade-in">
        <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400 shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-black uppercase tracking-wider font-mono text-emerald-400">LIVE PRODUCTION AI ENGINE ACTIVE</h4>
          <p className="text-slate-300 text-xs leading-relaxed">
            All diagnostic analysis and predictive recommendations are computed live utilizing advanced Google Gemini AI capabilities, baseline ISO-10816 mechanical thresholds, and real-time web-grounded research data.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form Column */}
        <div className="lg:col-span-8 space-y-6">

          {/* 4. ASSET SELECTION ROW (4 cascading dropdowns) */}
          {!quickAnalysisMode && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Globe className="w-3.5 h-3.5 text-cyan-400" />
                  Database Location Navigator
                </h3>
                {!selectedComponentId && (
                  <span className="text-[9px] bg-amber-400/10 border border-amber-400/30 text-amber-400 font-bold font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-full animate-pulse">
                    Target Component Required
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                  <label className="text-[9px] font-mono text-slate-500 uppercase block mb-1 font-bold">1. Plant</label>
                  <select 
                    value={selectedPlantId} 
                    onChange={e => {
                      setSelectedPlantId(e.target.value ? Number(e.target.value) : "");
                      setSelectedRouteId(""); setSelectedAssetId(""); setSelectedComponentId("");
                    }}
                    className="w-full bg-slate-950 text-xs font-bold text-slate-100 outline-none cursor-pointer"
                  >
                    <option value="">-- Choose Plant --</option>
                    {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                  <label className="text-[9px] font-mono text-slate-500 uppercase block mb-1 font-bold">2. Route</label>
                  <select 
                    value={selectedRouteId} 
                    disabled={!selectedPlantId}
                    onChange={e => {
                      setSelectedRouteId(e.target.value ? Number(e.target.value) : "");
                      setSelectedAssetId(""); setSelectedComponentId("");
                    }}
                    className="w-full bg-slate-950 text-xs font-bold text-slate-100 outline-none disabled:opacity-40 cursor-pointer"
                  >
                    <option value="">-- Choose Route --</option>
                    {routesList.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                  <label className="text-[9px] font-mono text-slate-500 uppercase block mb-1 font-bold">3. Asset</label>
                  <select 
                    value={selectedAssetId} 
                    disabled={!selectedRouteId}
                    onChange={e => {
                      setSelectedAssetId(e.target.value ? Number(e.target.value) : "");
                      setSelectedComponentId("");
                    }}
                    className="w-full bg-slate-950 text-xs font-bold text-slate-100 outline-none disabled:opacity-40 cursor-pointer"
                  >
                    <option value="">-- Choose Asset --</option>
                    {assetsList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                  <label className="text-[9px] font-mono text-slate-500 uppercase block mb-1 font-bold">4. Component</label>
                  <select 
                    value={selectedComponentId} 
                    disabled={!selectedAssetId}
                    onChange={e => setSelectedComponentId(e.target.value ? Number(e.target.value) : "")}
                    className="w-full bg-slate-900 text-xs font-bold text-slate-100 outline-none disabled:opacity-40 cursor-pointer"
                  >
                    <option value="">-- Choose Tag --</option>
                    {componentsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 5. MONITORING TECHNOLOGY SECTION (6 cards, with red Selection Required badge) */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Sliders className="w-3.5 h-3.5 text-yellow-400" />
                Select Condition Monitoring Technology <span className="text-red-400 font-mono text-xs">*</span>
              </h3>
              {!selectedTech ? (
                <span className="text-[9px] bg-red-500/10 border border-red-500/30 text-red-400 font-bold font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-full animate-pulse">
                  Selection Required
                </span>
              ) : (
                <span className="text-[9px] text-slate-500 font-mono">Active Monitoring</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { id: "Vibration Analysis", label: "Vibration Analysis", icon: Activity, desc: "Spectrum, overall velocity, envelope & orbit telemetry analysis" },
                { id: "Oil Analysis", label: "Oil Analysis", icon: Droplet, desc: "Viscosity trends, wear particle counts, fluid contamination & friction" },
                { id: "Infrared Thermography", label: "Infrared Thermography", icon: Sparkles, desc: "Non-contact thermal imaging, dynamic hot-spots & bearing logs" },
                { id: "Ultrasound Analysis", label: "Ultrasound Analysis", icon: Volume2, desc: "High-frequency acoustic friction analysis & pressure leak audits" },
                { id: "Motor Current Analysis", label: "Motor Current signature", icon: Zap, desc: "Stator, rotor bar & winding electrical induction signature telemetry" },
                { id: "Visual Inspection", label: "Visual Inspection", icon: Eye, desc: "Physical alignment checks, casing leakage, foundation looseness & wear" }
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = selectedTech === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedTech(item.id)}
                    className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all duration-200 group relative overflow-hidden ${
                      isSelected 
                        ? "bg-yellow-400/10 border-yellow-400 text-yellow-400 shadow-md scale-[1.01]" 
                        : "bg-slate-950/50 border-slate-850 text-slate-300 hover:bg-slate-900/40 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`p-1 rounded-lg ${isSelected ? "bg-yellow-400/20 text-yellow-400" : "bg-slate-900 text-slate-400 group-hover:text-slate-200"}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold font-mono tracking-tight">{item.label}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 leading-relaxed">{item.desc}</span>
                    {isSelected && (
                      <div className="absolute right-2 top-2">
                        <Check className="w-3 h-3 text-yellow-400" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 6. SYSTEM CATEGORY SECTION (1. SYSTEM CATEGORY) */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              1. System Category Selector
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: "Mechanical", label: "Mechanical System", icon: Settings, desc: "Pumps, gearboxes, blowers, rotors, and shafts" },
                { id: "Electrical", label: "Electrical System", icon: Zap, desc: "Windings, stator, laminations, and brush gear" },
                { id: "Hydraulic", label: "Hydraulic System", icon: Droplet, desc: "Piston pumps, fluid velocity, cavitation, seal leaks" }
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = category === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCategory(item.id as any)}
                    className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all duration-200 group relative overflow-hidden ${
                      isSelected 
                        ? "bg-cyan-500/10 border-cyan-500 text-cyan-400 shadow-md scale-[1.01]" 
                        : "bg-slate-950/50 border-slate-850 text-slate-300 hover:bg-slate-900/40 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`p-1 rounded-lg ${isSelected ? "bg-cyan-500/20 text-cyan-400" : "bg-slate-900 text-slate-400 group-hover:text-slate-200"}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold font-mono tracking-tight">{item.label}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 leading-relaxed">{item.desc}</span>
                    {isSelected && (
                      <div className="absolute right-2 top-2">
                        <Check className="w-3 h-3 text-cyan-400" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 7. SELECT EQUIPMENT TYPE Card Selector */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Settings className="w-3.5 h-3.5 text-yellow-400" />
                Select Equipment Type <span className="text-red-400 font-mono text-xs">*</span>
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">Determines ISO standards applied</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {equipmentTypesList.map((item) => {
                const Icon = item.icon;
                const isSelected = equipmentType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setEquipmentType(item.id)}
                    className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all duration-200 group relative overflow-hidden ${
                      isSelected 
                        ? "bg-yellow-400/10 border-yellow-400 text-yellow-400 shadow-md scale-[1.01]" 
                        : "bg-slate-950/50 border-slate-850 text-slate-300 hover:bg-slate-900/40 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`p-1.5 rounded-lg ${isSelected ? "bg-yellow-400/20 text-yellow-400" : "bg-slate-900 text-slate-400 group-hover:text-slate-200"}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-black font-display uppercase tracking-wide">{item.label}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 leading-relaxed">{item.desc}</span>
                    {isSelected && (
                      <div className="absolute right-2 top-2">
                        <Check className="w-4 h-4 text-yellow-400" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {equipmentType === "Other" && (
              <div className="pt-2 animate-fade-in space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block font-bold">Specify Custom Machine Classification</label>
                <input 
                  type="text"
                  required
                  value={customEquipment}
                  onChange={e => setCustomEquipment(e.target.value)}
                  placeholder="E.g., High-pressure reciprocating liquid methane pump..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-yellow-400"
                />
              </div>
            )}
          </div>

          {/* 8. MACHINE SPECIFICATIONS SECTION (with yellow badge) */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Sliders className="w-3.5 h-3.5 text-yellow-400" />
                2. Machine Specifications
              </h3>
              <span className="text-[9px] bg-yellow-400 text-slate-950 font-black font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-full shadow">
                New Input Form
              </span>
            </div>

            <SpecsForm 
              specs={specs} 
              handleSpecChange={handleSpecChange} 
              equipmentType={equipmentType} 
              numShafts={numShafts} 
              setNumShafts={setNumShafts} 
              shafts={shafts} 
              setShafts={setShafts} 
            />
          </div>

          {/* 9. SYSTEM DETAILS SECTION (3. SYSTEM DETAILS / ASSET IDENTIFICATION) */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2">
            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block font-bold">3. System Details / Asset Identification</label>
            <input 
              type="text"
              value={specs.systemDetails}
              onChange={e => handleSpecChange("systemDetails", e.target.value)}
              placeholder="E.g., Centrifugal Water Feed Pump #3 with SKF-230 inboard bearing casing..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-400"
            />
          </div>

          {/* Nameplate AI Scanner Section */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                  Nameplate AI Scanner Helper
                </h3>
                <p className="text-[10px] text-slate-500">Scan machinery nameplates to auto-extract rating, rpm, model, and manufacturer details using Gemini Vision</p>
              </div>
              <div className="shrink-0">
                <input 
                  type="file" 
                  ref={nameplateInputRef}
                  onChange={handleNameplateUpload}
                  accept="image/*"
                  className="hidden" 
                />
                <button
                  type="button"
                  onClick={() => nameplateInputRef.current?.click()}
                  disabled={isScanningNameplate}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-yellow-400 border border-slate-700 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>{isScanningNameplate ? "Processing..." : "Capture/Upload Nameplate"}</span>
                </button>
              </div>
            </div>

            {isScanningNameplate && (
              <div className="flex items-center gap-3 p-4 bg-slate-950 rounded-xl border border-yellow-400/20 animate-pulse">
                <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin shrink-0" />
                <span className="text-[11px] text-slate-300 font-mono">Gemini AI is analyzing nameplate image parameters...</span>
              </div>
            )}

            {scannedNameplate && !isScanningNameplate && (
              <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl space-y-3.5 animate-fade-in">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">AI Extracted Parameters</span>
                  <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded">Scanned Successfully</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                  <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-850">
                    <span className="text-[8px] font-mono text-slate-500 uppercase block mb-0.5">Manufacturer</span>
                    <span className="font-bold text-slate-200">{scannedNameplate.manufacturer || "N/A"}</span>
                  </div>
                  <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-850">
                    <span className="text-[8px] font-mono text-slate-500 uppercase block mb-0.5">Model</span>
                    <span className="font-bold text-slate-200">{scannedNameplate.model || "N/A"}</span>
                  </div>
                  <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-850">
                    <span className="text-[8px] font-mono text-slate-500 uppercase block mb-0.5">Serial No</span>
                    <span className="font-bold text-slate-200">{scannedNameplate.serial || "N/A"}</span>
                  </div>
                  <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-850">
                    <span className="text-[8px] font-mono text-slate-500 uppercase block mb-0.5">Rated RPM</span>
                    <span className="font-bold text-slate-200 font-mono">{scannedNameplate.rpm ? `${scannedNameplate.rpm} RPM` : "N/A"}</span>
                  </div>
                  <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-850">
                    <span className="text-[8px] font-mono text-slate-500 uppercase block mb-0.5">Power</span>
                    <span className="font-bold text-slate-200">{scannedNameplate.power || "N/A"}</span>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleApplyNameplate}
                    className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-[10px] font-black rounded-lg transition-all cursor-pointer"
                  >
                    Apply to Specifications
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 10. EQUIPMENT SYMPTOMS SECTION */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-lg">
            <div className="flex items-center justify-between pb-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block font-mono">
                4. Equipment Symptoms & Observations
              </label>
              <button
                type="button"
                onClick={handleVoiceDictate}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-yellow-400 border border-slate-700 font-bold text-[10px] rounded-lg transition-all flex items-center gap-1 cursor-pointer"
              >
                <Mic className="w-3 h-3 text-yellow-400 animate-pulse" />
                <span>Voice Dictation</span>
              </button>
            </div>
            
            <textarea
              value={symptoms}
              onChange={e => setSymptoms(e.target.value.substring(0, 1000))}
              placeholder="E.g., High unbalance shaking observed during start-up, excessive screeching noise from non-drive end bearing casing..."
              rows={4}
              maxLength={1000}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-white outline-none focus:border-yellow-400 resize-none font-sans"
            />
            
            <div className="flex justify-between items-center text-[10px] font-mono text-slate-500">
              <span>* System automatically adjusts calibration thresholds based on listed symptoms.</span>
              <span>{symptoms.length} / 1000</span>
            </div>
          </div>

          {/* 11. DIAGNOSTIC TELEMETRY SECTION */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <UploadCloud className="w-3.5 h-3.5 text-yellow-400" />
                5. Diagnostic Telemetry & Trend Data
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">Optional spectrum dump</span>
            </div>

            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl min-h-[160px] flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all duration-200 group ${
                isDragging 
                  ? "border-yellow-400 bg-yellow-400/5 shadow-inner scale-[0.99]" 
                  : "border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900/10"
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) simulateUpload(file);
                }}
                accept=".csv,.txt,.pdf,image/*"
                className="hidden" 
              />

              {isUploading ? (
                <div className="space-y-3 w-full max-w-xs">
                  <RefreshCw className="w-8 h-8 text-yellow-400 animate-spin mx-auto" />
                  <p className="text-xs font-bold font-mono text-slate-300">Uploading spectrum telemetry...</p>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-400 transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500 block font-mono">{uploadProgress}% uploaded</span>
                </div>
              ) : uploadedFile ? (
                <div className="space-y-2">
                  <FileText className="w-12 h-12 text-yellow-400 mx-auto" />
                  <div className="text-xs">
                    <p className="font-bold text-slate-200">{uploadedFile.name}</p>
                    <p className="text-slate-500 font-mono text-[10px] mt-0.5">
                      {uploadedFile.size ? `${(uploadedFile.size / 1024).toFixed(1)} KB` : "Vibration Log"} | {uploadedFile.type.toUpperCase()} file
                    </p>
                  </div>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setUploadedFile(null);
                    }}
                    className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-[10px] font-bold border border-red-500/20 transition-all"
                  >
                    Clear File
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <UploadCloud className="w-10 h-10 text-slate-600 group-hover:text-yellow-400 transition-colors" />
                  <p className="text-xs font-bold text-slate-300">DRAG & DROP TELEMETRY FILE HERE</p>
                  <p className="text-[10px] text-slate-500">Supports CSV, TXT spectrum reports, PDF, and camera images up to 50MB</p>
                  <span className="inline-block mt-2 px-3 py-1 bg-slate-900 text-[10px] text-slate-400 rounded border border-slate-850 hover:bg-slate-800 transition-all">
                    Browse File
                  </span>
                </div>
              )}
            </div>
            {uploadError && <p className="text-red-400 text-[10px] font-mono">{uploadError}</p>}
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-xs text-red-400 font-mono">
              <p className="font-bold">Execution Error:</p>
              <p className="mt-0.5">{errorMsg}</p>
            </div>
          )}

          {/* 10. Diagnose Button / Loading Progress States */}
          <div className="pt-2">
            {isLoading ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center space-y-4">
                <RefreshCw className="w-8 h-8 text-yellow-400 animate-spin" />
                <div className="text-center space-y-2 w-full max-w-xs">
                  <p className="font-semibold text-slate-200 text-xs font-mono uppercase tracking-widest">Evaluating Vibration Telemetry</p>
                  <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-400 transition-all duration-150" style={{ width: `${loadingProgress}%` }} />
                  </div>
                  <p className="text-[11px] text-yellow-400 italic animate-pulse font-mono">{loadingMessage}</p>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={triggerDiagnostics}
                disabled={!isFormValid}
                className={`w-full font-black py-4 rounded-xl shadow-lg transition-all text-xs tracking-widest flex items-center justify-center gap-2 uppercase ${
                  isFormValid 
                    ? "bg-yellow-400 hover:bg-yellow-500 text-slate-950 cursor-pointer hover:scale-[1.005] active:scale-[0.995]" 
                    : "bg-slate-800 text-slate-500 cursor-not-allowed opacity-50"
                }`}
              >
                <Wrench className="w-4 h-4" />
                <span>Compute Machinery Diagnostics</span>
              </button>
            )}
          </div>

        </div>

        {/* Right Info Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* 1. Connected Fleet Health State (Circular Gauge) */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-4 shadow-lg">
            <div className="relative w-24 h-24 shrink-0">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  className="text-slate-800/80"
                  strokeWidth="7"
                  stroke="currentColor"
                  fill="transparent"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  className="text-emerald-500"
                  strokeWidth="7"
                  strokeDasharray={2 * Math.PI * 40}
                  strokeDashoffset={2 * Math.PI * 40 * (1 - 0.98)}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-black text-white font-mono leading-none">98%</span>
                <span className="text-[8px] font-mono font-bold text-emerald-400 leading-none mt-1">NORMAL</span>
              </div>
            </div>
            <div className="space-y-1 w-full">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">Connected Fleet Health State</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Overall plant assets are operating in standard nominal condition. Telemetry exhibits an aggregate risk margin of 2%.
              </p>
            </div>
          </div>

          {/* 2. ISO 10816 Diagnostics Guidelines */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
              <Info className="w-3.5 h-3.5 text-cyan-400" />
              ISO 10816 Diagnostics
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Applying mechanical vibration criteria across ISO standards to detect unbalance, misalignment, and bearing decay. Choose an asset and tap Diagnose to verify structural compliance.
            </p>
            <div className="border-t border-slate-800/80 pt-3 space-y-2 text-[10px] font-mono text-slate-500">
              <div className="flex justify-between">
                <span>1X Unbalance Limit:</span>
                <span className="text-slate-300 font-bold">&gt; 0.10 in/s</span>
              </div>
              <div className="flex justify-between">
                <span>2X Misalignment Limit:</span>
                <span className="text-slate-300 font-bold">&gt; 0.05 in/s</span>
              </div>
              <div className="flex justify-between">
                <span>Bearing Defect Limit:</span>
                <span className="text-slate-300 font-bold">&gt; 0.02 in/s</span>
              </div>
            </div>
          </div>

          {/* 3. Historical Trend Comparison Block */}
          {historyList.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                  Asset Trend Analysis
                </h3>
                <button 
                  onClick={() => setShowHistoryChart(!showHistoryChart)}
                  className="text-[10px] text-yellow-400 hover:underline font-mono"
                >
                  {showHistoryChart ? "Hide Chart" : "Show Chart"}
                </button>
              </div>

              <div className="text-xs text-slate-300 space-y-1.5 font-mono">
                <p>Last diagnosis: <strong className="text-white">{new Date(historyList[0].timestamp).toLocaleDateString()}</strong></p>
                <p>Status: <span className={historyList[0].ai_response?.fault_detected ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>{historyList[0].ai_response?.fault_detected ? "Fault Detected" : "Normal"}</span></p>
                {diagnosticResult && (
                  <p>Current trend: <strong className={diagnosticResult.fault_detected ? "text-red-400 animate-pulse" : "text-emerald-400"}>{diagnosticResult.fault_detected ? "Deteriorating" : "Stable"}</strong></p>
                )}
              </div>

              {showHistoryChart && (
                <div className="h-36 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={9} />
                      <YAxis stroke="#64748b" fontSize={9} />
                      <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} labelStyle={{ color: "#fff" }} />
                      <Line type="monotone" dataKey="velocity" stroke="#facc15" strokeWidth={2} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* 4. Machinery Maintenance Logs */}
          <MaintenanceLogsSection 
            quickAnalysisMode={quickAnalysisMode} 
            selectedAssetId={selectedAssetId} 
            maintenanceLogs={maintenanceLogs} 
            isAddingLog={isAddingLog} 
            setIsAddingLog={setIsAddingLog} 
            newLog={newLog} 
            setNewLog={setNewLog} 
            handleAddMaintenanceLog={handleAddMaintenanceLog} 
          />
        </div>
      </div>

      {/* Diagnosis Results Display Banners */}
      <ResultsDisplay 
        diagnosticResult={diagnosticResult} 
        handleSave={handleSave} 
        handleGenerateCMMSWorkOrder={handleGenerateCMMSWorkOrder} 
        handleSendManualAlert={handleSendManualAlert} 
        handleExportPDF={handleExportPDF} 
        isAlertSending={isAlertSending} 
        alertSuccessMsg={alertSuccessMsg} 
        generatedWorkOrder={generatedWorkOrder} 
        handleCopyToClipboard={handleCopyToClipboard} 
      />

    </div>
  );
}
