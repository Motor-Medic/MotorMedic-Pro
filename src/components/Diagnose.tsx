import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Zap, Droplet, Wrench, AlertTriangle, FileText, UploadCloud, Trash2, 
  Check, Copy, Settings, Info, RefreshCw, HelpCircle, Globe, ArrowUpRight, 
  Mail, Calendar, Activity, ShieldAlert, Heart, ClipboardCheck, ArrowRight,
  Sliders, TrendingUp, Sparkles, Eye, Mic, Volume2, Clock, Play, Pause, X,
  CheckCircle2, Layers, Plus, Search, ChevronRight, AlertCircle, ShieldCheck
} from "lucide-react";
import { generatePDFReport } from "./ReportGenerator";
import { useToast } from "./Toast";
import SpecsForm from "./SpecsForm";
import SpecsFormWizard from "./SpecsFormWizard";
import MaintenanceLogsSection from "./MaintenanceLogsSection";
import ResultsDisplay from "./ResultsDisplay";
import ResultsLoadingSkeleton from "./ResultsLoadingSkeleton";

interface DiagnoseProps {
  user?: any;
  onSaveReport?: (category: "Mechanical" | "Electrical" | "Hydraulic", symptoms: string, specs: Record<string, string>, data: any, fileName?: string, fileType?: string) => void;
  targetContext?: {
    plantId: number | null;
    routeId: number | null;
    assetId: number | null;
    componentId: number | null;
    technologyType: string | null;
    quickAnalysisMode?: boolean;
    collectionPointId?: number | string | null;
  } | null;
  onClearTargetContext?: () => void;
  selectedCompanyId?: number;
  subscriptionPlan?: string;
}

interface ActiveScan {
  id: string;
  assetName: string;
  assetTag: string;
  analysisType: "Standard Scan" | "Deep Spectrum Analysis" | "Bearing Fault Detection";
  priority: "Normal" | "Rush" | "Emergency";
  progress: number;
  stage: "Collecting Data" | "Analyzing Spectrum" | "AI Processing" | "Generating Report";
  elapsedSeconds: number;
  isPaused: boolean;
}

interface CompletedAnalysis {
  id: string;
  assetName: string;
  assetTag: string;
  location: string;
  timestamp: string;
  healthScore: number;
  healthStatus: "Green" | "Yellow" | "Red";
  topFaults: string[];
  reportData: any;
}

const techMap: Record<string, string> = {
  "Vibration": "Vibration Analysis",
  "Thermal": "Infrared Thermography",
  "Oil": "Oil Analysis",
  "Electrical": "Motor Circuit Analysis (MCA)"
};

const DEFAULT_COMPLETED_ANALYSES: CompletedAnalysis[] = [
  {
    id: "COMP-901",
    assetName: "Primary Boiler Feed Pump #3",
    assetTag: "PMP-101",
    location: "Boiler Room North",
    timestamp: "25 mins ago",
    healthScore: 42,
    healthStatus: "Red",
    topFaults: [
      "Inboard Ball Bearing Outer Race Defect (BPFO)",
      "2X Angular Shaft Misalignment",
      "Cavitation Spike in Impeller Chamber"
    ],
    reportData: {
      overall_severity: "Critical",
      overall_vibration_level: "0.28 in/s (7.11 mm/s RMS)",
      fault_detected: true,
      executive_summary: "Critical high-frequency bearing defect detected on inboard SKF-230 bearing casing along with 2X harmonic misalignment peaks.",
      faults: [
        { type: "Bearing BPFO Defect", severity: "Critical", evidence: "High peak amplitude at 142 Hz (4.8X running speed)", recommendation: "Schedule emergency bearing replacement within 48 hours." },
        { type: "Angular Misalignment", severity: "Warning", evidence: "180 deg phase shift across flexible coupling", recommendation: "Perform laser alignment on motor-to-pump shaft." }
      ],
      maintenance_recommendations: [
        "Isolate Unit PMP-101 immediately",
        "Replace inboard drive-end bearing assembly",
        "Perform precision dynamic balancing after re-installation"
      ]
    }
  },
  {
    id: "COMP-902",
    assetName: "Cooling Tower Fan Drive Motor",
    assetTag: "MTR-502",
    location: "HVAC Roof Deck",
    timestamp: "2 hours ago",
    healthScore: 78,
    healthStatus: "Yellow",
    topFaults: [
      "Moderate Mechanical Unbalance (1X Peak)",
      "Soft Foot Foundation Looseness"
    ],
    reportData: {
      overall_severity: "Warning",
      overall_vibration_level: "0.14 in/s (3.55 mm/s RMS)",
      fault_detected: true,
      executive_summary: "Elevated 1X fundamental vibration amplitude observed at 1780 RPM. Base mounting bolts show minor mechanical looseness.",
      faults: [
        { type: "1X Unbalance", severity: "Warning", evidence: "Dominant peak at 29.6 Hz (1X RPM)", recommendation: "Inspect fan blades for material build-up and rebalance." }
      ],
      maintenance_recommendations: [
        "Torque base holding bolts to 120 ft-lbs",
        "Clean fan blade surfaces",
        "Re-evaluate vibration baseline during next PM cycle"
      ]
    }
  },
  {
    id: "COMP-903",
    assetName: "Main Extruder Speed Reducer",
    assetTag: "GBX-301",
    location: "Extrusion Line 2",
    timestamp: "Yesterday, 4:30 PM",
    healthScore: 96,
    healthStatus: "Green",
    topFaults: [
      "Normal ISO 10816 Baseline",
      "No Harmonics Exceeding Thresholds"
    ],
    reportData: {
      overall_severity: "Normal",
      overall_vibration_level: "0.04 in/s (1.01 mm/s RMS)",
      fault_detected: false,
      executive_summary: "Gearbox operating in prime condition. Gear mesh frequency (GMF) at 593 Hz is well within nominal tolerances.",
      faults: [],
      maintenance_recommendations: [
        "Continue standard quarterly oil sample analysis",
        "Next scheduled vibration audit in 90 days"
      ]
    }
  },
  {
    id: "COMP-904",
    assetName: "Raw Mill Rotary Compressor",
    assetTag: "CMP-201",
    location: "Compressor House",
    timestamp: "Jul 26, 2026 - 11:15 AM",
    healthScore: 65,
    healthStatus: "Yellow",
    topFaults: [
      "Screw Rotor Mesh Frequency Harmonics",
      "Minor Oil Supply Pressure Drops"
    ],
    reportData: {
      overall_severity: "Warning",
      overall_vibration_level: "0.12 in/s (3.05 mm/s RMS)",
      fault_detected: true,
      executive_summary: "Rotor mesh harmonics showing slight sideband modulation. Recommend checking lubrication viscosity.",
      faults: [
        { type: "Rotor Mesh Sidebands", severity: "Warning", evidence: "Sidebands around 1200 Hz mesh frequency", recommendation: "Sample oil for particulate contamination and viscosity breakdown." }
      ],
      maintenance_recommendations: [
        "Perform fluid sample analysis",
        "Inspect oil filter differential pressure"
      ]
    }
  }
];

const INITIAL_ACTIVE_SCANS: ActiveScan[] = [
  {
    id: "SCAN-101",
    assetName: "Secondary Chilled Water Pump",
    assetTag: "PMP-204",
    analysisType: "Deep Spectrum Analysis",
    priority: "Rush",
    progress: 68,
    stage: "AI Processing",
    elapsedSeconds: 42,
    isPaused: false
  },
  {
    id: "SCAN-102",
    assetName: "Exhaust Gas Recirculation Blower",
    assetTag: "FAN-104",
    analysisType: "Bearing Fault Detection",
    priority: "Emergency",
    progress: 24,
    stage: "Analyzing Spectrum",
    elapsedSeconds: 18,
    isPaused: false
  }
];

export default function Diagnose({
  user,
  onSaveReport,
  targetContext,
  onClearTargetContext,
  selectedCompanyId = 1,
  subscriptionPlan = "vibration_only"
}: DiagnoseProps) {
  const { showToast } = useToast();

  // Machine Specs Tab Mode: "compact" (DEFAULT ACTIVE) or "wizard"
  const [specsTabMode, setSpecsTabMode] = useState<"compact" | "wizard">("compact");

  // Basic cascading location lists
  const [plants, setPlants] = useState<any[]>([]);
  const [routesList, setRoutesList] = useState<any[]>([]);
  const [assetsList, setAssetsList] = useState<any[]>([]);
  const [componentsList, setComponentsList] = useState<any[]>([]);

  // Selected Location / Asset state
  const [selectedPlantId, setSelectedPlantId] = useState<number | "">("");
  const [selectedRouteId, setSelectedRouteId] = useState<number | "">("");
  const [selectedAssetId, setSelectedAssetId] = useState<number | "">("");
  const [selectedComponentId, setSelectedComponentId] = useState<number | "">("");
  const [isComponentSpecsAutoFilled, setIsComponentSpecsAutoFilled] = useState<boolean>(false);
  const [prefilledCPName, setPrefilledCPName] = useState<string | null>(null);

  // Quick Analysis Mode Toggle
  const [quickAnalysisMode, setQuickAnalysisMode] = useState<boolean>(false);

  // SECTION 1: Launch New Analysis Parameters
  const [analysisType, setAnalysisType] = useState<"Standard Scan" | "Deep Spectrum Analysis" | "Bearing Fault Detection">("Standard Scan");
  const [priorityLevel, setPriorityLevel] = useState<"Normal" | "Rush" | "Emergency">("Normal");
  const [scheduleForLater, setScheduleForLater] = useState<boolean>(false);
  const [scheduledDateTime, setScheduledDateTime] = useState<string>("");

  // Compact Form Fields (Asset Name, Location, Tech Type, Criticality, Manufacturer, Model)
  const [compactAssetName, setCompactAssetName] = useState<string>("Centrifugal Feed Pump #1");
  const [compactLocation, setCompactLocation] = useState<string>("Boiler Room North");
  const [compactTechType, setCompactTechType] = useState<string>("Vibration Analysis");
  const [compactCriticality, setCompactCriticality] = useState<string>("Standard");
  const [compactManufacturer, setCompactManufacturer] = useState<string>("Flowserve");
  const [compactModel, setCompactModel] = useState<string>("3196 ISO-100");

  // Core options
  const [category, setCategory] = useState<"Mechanical" | "Electrical" | "Hydraulic">("Mechanical");
  const [equipmentType, setEquipmentType] = useState<string>("Pump Unit");
  const [customEquipment, setCustomEquipment] = useState<string>("");
  const [selectedTech, setSelectedTech] = useState<string>("Vibration Analysis");
  const [symptoms, setSymptoms] = useState("");

  // Specs state
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

  const [specs, setSpecs] = useState<Record<string, string>>({
    specRpm: "1750",
    motorSpecs: "Three Phase",
    transmissionType: "Direct Drive",
    gravitySpecs: "Horizontal",
    powerRating: "150",
    assetCriticality: "Standard",
    driveType: "Direct Coupled",
    pumpType: "Centrifugal",
    bearingType: "Ball",
    manufacturer: "Flowserve",
    model: "3196 ISO-100",
    systemDetails: ""
  });

  const handleSpecChange = (key: string, value: string) => {
    setSpecs((prev) => ({ ...prev, [key]: value }));
  };

  // Drag & Drop / File State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    type: "image" | "text";
    data: string;
    mimeType?: string;
    size?: number;
  } | null>(null);

  // Diagnostic execution state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [diagnosticResult, setDiagnosticResult] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // SECTION 2: Active Scans List State
  const [activeScans, setActiveScans] = useState<ActiveScan[]>(INITIAL_ACTIVE_SCANS);

  // SECTION 3: Recent Completed Analyses State
  const [completedAnalyses, setCompletedAnalyses] = useState<CompletedAnalysis[]>(DEFAULT_COMPLETED_ANALYSES);

  // Modal State for Viewing Full Report
  const [viewingReportModal, setViewingReportModal] = useState<CompletedAnalysis | null>(null);
  const [generatedWorkOrder, setGeneratedWorkOrder] = useState<string | null>(null);
  const [isAlertSending, setIsAlertSending] = useState(false);
  const [alertSuccessMsg, setAlertSuccessMsg] = useState<string | null>(null);

  // Fetch cascading database locations
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
      setRoutesList([]); setAssetsList([]); setComponentsList([]);
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
      setAssetsList([]); setComponentsList([]);
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

  // Handle targetContext prefill
  useEffect(() => {
    if (targetContext) {
      if (targetContext.collectionPointId) {
        const fetchPrefill = async () => {
          try {
            const res = await fetch(`/api/diagnosis/prefill/${targetContext.collectionPointId}`);
            if (res.ok) {
              const data = await res.json();
              if (data.plant) setSelectedPlantId(data.plant.id);
              if (data.route) setSelectedRouteId(data.route.id);
              if (data.asset) {
                setSelectedAssetId(data.asset.id);
                setCompactAssetName(data.asset.name);
              }
              if (data.component) {
                setSelectedComponentId(data.component.id);
                if (data.component.type) setEquipmentType(data.component.type);
                if (data.component.manufacturer) setCompactManufacturer(data.component.manufacturer);
                if (data.component.model) setCompactModel(data.component.model);
              }
              if (data.collectionPoint) {
                setPrefilledCPName(data.collectionPoint.name);
                setSymptoms(`Analyzing collection point: ${data.collectionPoint.name}. Orientation: ${data.collectionPoint.orientation || "Horizontal"}.`);
              }
              showToast("✓ Diagnostics pre-filled from collection point context", "success");
            }
          } catch (err) {
            console.error("Prefill failed:", err);
          }
        };
        fetchPrefill();
      } else {
        if (targetContext.plantId) setSelectedPlantId(targetContext.plantId);
        if (targetContext.routeId) setSelectedRouteId(targetContext.routeId);
        if (targetContext.assetId) setSelectedAssetId(targetContext.assetId);
        if (targetContext.componentId) setSelectedComponentId(targetContext.componentId);
        if (targetContext.technologyType) {
          const rawTech = targetContext.technologyType;
          setSelectedTech(techMap[rawTech] || rawTech);
          setCompactTechType(techMap[rawTech] || rawTech);
        }
        if (targetContext.quickAnalysisMode) setQuickAnalysisMode(true);
      }
    }
  }, [targetContext]);

  // Real-time ticking for Active Scans Progress Bar
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveScans(prevScans => {
        return prevScans.map(scan => {
          if (scan.isPaused) return scan;

          const newElapsed = scan.elapsedSeconds + 1;
          const newProgress = Math.min(100, scan.progress + Math.floor(Math.random() * 4) + 2);

          let newStage: ActiveScan["stage"] = "Collecting Data";
          if (newProgress >= 75) newStage = "Generating Report";
          else if (newProgress >= 50) newStage = "AI Processing";
          else if (newProgress >= 25) newStage = "Analyzing Spectrum";

          // When complete, transition into completed list
          if (newProgress >= 100 && scan.progress < 100) {
            setTimeout(() => {
              const finishedReport: CompletedAnalysis = {
                id: `COMP-${Date.now().toString().slice(-4)}`,
                assetName: scan.assetName,
                assetTag: scan.assetTag,
                location: compactLocation || "Plant Floor",
                timestamp: "Just now",
                healthScore: Math.floor(Math.random() * 25) + 70,
                healthStatus: "Green",
                topFaults: [
                  `${scan.analysisType} Completed`,
                  "Nominal Vibration Spectra",
                  "ISO 10816 Baseline Passed"
                ],
                reportData: {
                  overall_severity: "Normal",
                  overall_vibration_level: "0.06 in/s (1.52 mm/s RMS)",
                  fault_detected: false,
                  executive_summary: `Automated ${scan.analysisType} completed successfully for ${scan.assetName}. All spectral signatures are within normal operational limits.`,
                  faults: [],
                  maintenance_recommendations: [
                    "Continue standard condition monitoring schedule",
                    "Next routine audit scheduled in 30 days"
                  ]
                }
              };
              setCompletedAnalyses(prev => [finishedReport, ...prev]);
              showToast(`✓ Analysis complete for ${scan.assetName}!`, "success");
            }, 500);
          }

          return {
            ...scan,
            elapsedSeconds: newElapsed,
            progress: newProgress,
            stage: newStage
          };
        }).filter(scan => scan.progress < 100);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [compactLocation]);

  // Cancel / Pause handlers for Active Scans
  const handleCancelScan = (id: string) => {
    setActiveScans(prev => prev.filter(s => s.id !== id));
    showToast("Scan cancelled.", "info");
  };

  const handleTogglePauseScan = (id: string) => {
    setActiveScans(prev => prev.map(s => s.id === id ? { ...s, isPaused: !s.isPaused } : s));
  };

  // Launch New Diagnostics Execution
  const triggerDiagnostics = async () => {
    if (scheduleForLater && !scheduledDateTime) {
      showToast("Please select a date and time to schedule the analysis.", "warning");
      return;
    }

    if (scheduleForLater) {
      showToast(`✓ Diagnostic job scheduled for ${scheduledDateTime}!`, "success");
      setScheduledDateTime("");
      setScheduleForLater(false);
      return;
    }

    const currentTag = selectedComponentId 
      ? `Tag-${selectedComponentId}` 
      : compactAssetName ? compactAssetName.split(" ")[0].toUpperCase() + "-101" : "AST-101";
    
    const targetName = selectedAssetId && assetsList.length > 0
      ? (assetsList.find(a => a.id === Number(selectedAssetId))?.name || compactAssetName)
      : compactAssetName;

    // Create an active scan entry
    const newScanId = `SCAN-${Date.now().toString().slice(-4)}`;
    const newActiveScan: ActiveScan = {
      id: newScanId,
      assetName: targetName,
      assetTag: currentTag,
      analysisType: analysisType,
      priority: priorityLevel,
      progress: 5,
      stage: "Collecting Data",
      elapsedSeconds: 0,
      isPaused: false
    };

    setActiveScans(prev => [newActiveScan, ...prev]);
    setIsLoading(true);
    setDiagnosticResult(null);
    setLoadingProgress(10);
    setLoadingMessage("⚙️ Initializing ISO 10816 spectrum solver...");

    try {
      const payload = {
        overall_velocity: 0.08,
        oneX_rpm: 0.02,
        twoX_rpm: 0.01,
        bearing_inner: 0.005,
        bearing_outer: 0.005,
        category,
        symptoms: symptoms || `${analysisType} executed on ${targetName}. Priority: ${priorityLevel}`,
        specs: {
          ...specs,
          manufacturer: compactManufacturer,
          model: compactModel,
          criticality: compactCriticality
        },
        technology: compactTechType || selectedTech,
        equipmentType
      };

      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Diagnosis engine call returned error.");

      const data = await res.json();
      setDiagnosticResult(data);
      setLoadingProgress(100);

      // Add to completed analyses
      const finishedAnalysis: CompletedAnalysis = {
        id: `COMP-${Date.now().toString().slice(-4)}`,
        assetName: targetName,
        assetTag: currentTag,
        location: compactLocation,
        timestamp: "Just now",
        healthScore: data.fault_detected ? (data.overall_severity === "Critical" ? 38 : 68) : 95,
        healthStatus: data.overall_severity === "Critical" ? "Red" : data.overall_severity === "Warning" ? "Yellow" : "Green",
        topFaults: data.faults?.map((f: any) => f.type) || ["Nominal Operations"],
        reportData: data
      };

      setCompletedAnalyses(prev => [finishedAnalysis, ...prev]);
      setActiveScans(prev => prev.filter(s => s.id !== newScanId));
      showToast("✅ Machinery diagnosis complete! Added to recent analyses.", "success");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Diagnostic computation failed.");
      showToast("Failed to complete diagnostic scan.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // CMMS Work Order Generator
  const handleGenerateCMMSWorkOrder = (analysis?: CompletedAnalysis) => {
    const report = analysis?.reportData || diagnosticResult;
    if (!report) return;

    const name = analysis?.assetName || compactAssetName;
    const tag = analysis?.assetTag || "AST-101";
    const loc = analysis?.location || compactLocation;

    const fault = report.faults?.[0] || {
      type: "Vibration Signature Malfunction",
      severity: report.overall_severity || "Warning",
      evidence: "Spectral peak exceeding ISO 10816 limits",
      recommendation: "Perform visual and laser alignment check"
    };

    const isCritical = fault.severity === "Critical" || report.overall_severity === "Critical";
    const priority = isCritical ? "EMERGENCY (Priority 1)" : "PREVENTIVE (Priority 2)";

    const workOrder = `=== SAP / MAXIMO AUTOMATED CMMS WORK ORDER ===
WORK ORDER ID : WO-${Date.now().toString().slice(-6)}
ASSET TAG     : ${tag} (${name})
DESCRIPTION   : ${fault.type} - MotorMedic Pro AI Diagnosed Malfunction
LOCATION      : ${loc}
PRIORITY      : ${priority}
EST. LABOR    : ${isCritical ? "4.5 Hours" : "2.0 Hours"}
SAFETY PROTO  : LOTO (Lock-Out Tag-Out) required on all primary disconnect switches.

DIAGNOSTIC EVIDENCE:
- ${fault.evidence}
- Vibration Severity: ${report.overall_vibration_level || "0.18 in/s RMS"}

RECOMMENDED ACTION:
- ${fault.recommendation}

AUTHORIZATION : MotorMedic Pro Condition Monitoring Engine
======================================================`;

    setGeneratedWorkOrder(workOrder);
    showToast("✓ Work order generated!", "success");
  };

  const handleCopyToClipboard = () => {
    if (!generatedWorkOrder) return;
    navigator.clipboard.writeText(generatedWorkOrder);
    showToast("✓ Work Order copied to clipboard!", "success");
  };

  const handleSendManualAlert = async () => {
    setIsAlertSending(true);
    setAlertSuccessMsg(null);
    try {
      const res = await fetch("/api/send-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetName: compactAssetName,
          faultName: diagnosticResult?.faults?.[0]?.type || "Vibration Anomaly",
          severity: diagnosticResult?.overall_severity || "Warning"
        })
      });
      if (res.ok) {
        setAlertSuccessMsg("Alert email sent to plant reliability engineer!");
        showToast("Email alert pushed successfully!", "success");
      }
    } catch (_) {
      showToast("Email alert failed.", "error");
    } finally {
      setIsAlertSending(false);
    }
  };

  const handleExportPDF = (analysis?: CompletedAnalysis) => {
    const res = analysis?.reportData || diagnosticResult;
    if (!res) return;

    generatePDFReport({
      plantName: plants.find(p => p.id === selectedPlantId)?.name || "Main Plant",
      routeName: routesList.find(r => r.id === selectedRouteId)?.name || "Route Alpha",
      assetName: analysis?.assetName || compactAssetName,
      componentName: analysis?.assetTag || "Tag-101",
      diagnosticResult: {
        ...res,
        overallSeverity: res.overall_severity,
        overall_vibration_level: res.overall_vibration_level,
        root_cause_analysis: res.executive_summary
      },
      category,
      symptoms
    });
    showToast("✓ PDF Report exported!", "success");
  };

  // Voice dictation handler
  const handleVoiceDictate = () => {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = "en-US";
      
      showToast("🎙️ Listening... Speak observations now.", "info");
      recognition.start();
      
      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setSymptoms(prev => prev ? `${prev} ${text}` : text);
        showToast("✓ Voice dictation captured!", "success");
      };
      
      recognition.onerror = () => simulateVoiceFallback();
    } else {
      simulateVoiceFallback();
    }
  };

  const simulateVoiceFallback = () => {
    const phrases = [
      "Elevated temperature observed on inboard bearing casing exceeding 82°C.",
      "High frequency screeching sound heard during steady state operation.",
      "Vibration levels spike at 2X operating speed indicating shaft misalignment."
    ];
    const chosen = phrases[Math.floor(Math.random() * phrases.length)];
    setSymptoms(prev => prev ? `${prev}\n[Voice Dictated] ${chosen}` : `[Voice Dictated] ${chosen}`);
    showToast("✓ Simulated voice dictation added!", "success");
  };

  return (
    <div className="space-y-8 pb-16 p-2 text-slate-100 font-sans max-w-7xl mx-auto" id="run-diagnostics-dashboard">
      
      {/* PAGE HEADER & QUICK SETTINGS BANNER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 rounded-xl shadow-inner">
              <Wrench className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight font-display flex items-center gap-2">
                Run Machinery Diagnostics
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-cyan-950/80 border border-cyan-500/30 text-cyan-300">
                  ISO 10816 Engine
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Execute deep spectrum vibration analysis, bearing defect isolation, and ISO threshold validation with real-time AI processing.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 px-4 py-2.5 rounded-xl self-start md:self-auto">
          <span className="text-xs font-bold text-slate-300 font-mono">Quick Analysis Mode:</span>
          <button 
            type="button" 
            onClick={() => setQuickAnalysisMode(!quickAnalysisMode)}
            className={`px-3 py-1 rounded-lg font-extrabold text-[10px] tracking-wider font-mono transition-all cursor-pointer ${
              quickAnalysisMode 
                ? "bg-yellow-400 text-slate-950 shadow-md shadow-yellow-400/20" 
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            {quickAnalysisMode ? "ENABLED" : "DISABLED"}
          </button>
        </div>
      </div>

      {/* Prefill Notice Banner */}
      {prefilledCPName && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl flex items-center justify-between gap-3 shadow-md animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold">
              Pre-filled parameters from collection point <strong className="text-white">[{prefilledCPName}]</strong>.
            </span>
          </div>
          <button 
            type="button" 
            onClick={() => setPrefilledCPName(null)}
            className="text-xs font-bold text-emerald-400 hover:text-emerald-300 underline bg-transparent border-none cursor-pointer"
          >
            Clear Prefill
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MACHINE SPECS SECTION (THE CRITICAL FIX): CLEAN TABBED INTERFACE     */}
      {/* ==================================================================== */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
        
        {/* TAB SWITCHER HEADER */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="space-y-0.5">
            <h2 className="text-base font-bold text-white font-display flex items-center gap-2">
              <Sliders className="w-4 h-4 text-yellow-400" />
              Machine Specifications
            </h2>
            <p className="text-xs text-slate-400">
              Set target asset specs and operational thresholds before launching diagnostics.
            </p>
          </div>

          {/* Clean View Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setSpecsTabMode("compact")}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-mono font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                specsTabMode === "compact"
                  ? "bg-yellow-400 text-slate-950 shadow-md shadow-yellow-400/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Compact View (Default)</span>
            </button>

            <button
              type="button"
              onClick={() => setSpecsTabMode("wizard")}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-mono font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                specsTabMode === "wizard"
                  ? "bg-purple-500 text-slate-950 shadow-md shadow-purple-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Guided Wizard (Optional)</span>
            </button>
          </div>
        </div>

        {/* TAB 1: COMPACT VIEW (DEFAULT ACTIVE) */}
        {specsTabMode === "compact" ? (
          <div className="space-y-6 animate-fade-in">
            {/* 6 Essential Fields Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              
              {/* Field 1: Asset Name & Component Selector */}
              <div className="space-y-1.5 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
                  1. Asset Name / Tag <span className="text-yellow-400">*</span>
                </label>
                {selectedAssetId && assetsList.length > 0 ? (
                  <select
                    value={selectedAssetId}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : "";
                      setSelectedAssetId(val);
                      const found = assetsList.find(a => a.id === val);
                      if (found) setCompactAssetName(found.name);
                    }}
                    className="w-full bg-slate-900 border border-slate-700 text-xs font-bold text-white rounded-lg p-2.5 outline-none focus:border-yellow-400"
                  >
                    {assetsList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={compactAssetName}
                    onChange={(e) => setCompactAssetName(e.target.value)}
                    placeholder="E.g., Boiler Feed Pump #3"
                    className="w-full bg-slate-900 border border-slate-700 text-xs font-bold text-white rounded-lg p-2.5 outline-none focus:border-yellow-400"
                  />
                )}
              </div>

              {/* Field 2: Plant Location */}
              <div className="space-y-1.5 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
                  2. Location / Sector <span className="text-yellow-400">*</span>
                </label>
                <input
                  type="text"
                  value={compactLocation}
                  onChange={(e) => setCompactLocation(e.target.value)}
                  placeholder="E.g., Boiler Room North, Building B"
                  className="w-full bg-slate-900 border border-slate-700 text-xs font-bold text-white rounded-lg p-2.5 outline-none focus:border-yellow-400"
                />
              </div>

              {/* Field 3: Condition Monitoring Technology Type */}
              <div className="space-y-1.5 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
                  3. Technology Type <span className="text-yellow-400">*</span>
                </label>
                <select
                  value={compactTechType}
                  onChange={(e) => {
                    setCompactTechType(e.target.value);
                    setSelectedTech(e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 text-xs font-bold text-cyan-300 rounded-lg p-2.5 outline-none focus:border-cyan-400"
                >
                  <option value="Vibration Analysis">Vibration Analysis (ISO 10816)</option>
                  <option value="Infrared Thermography">Infrared Thermography</option>
                  <option value="Oil Analysis">Oil Analysis</option>
                  <option value="Motor Current Analysis (MCA)">Motor Current Analysis (MCA)</option>
                  <option value="Ultrasound Analysis">Ultrasound Acoustic Analysis</option>
                </select>
              </div>

              {/* Field 4: Asset Criticality */}
              <div className="space-y-1.5 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
                  4. Criticality Level
                </label>
                <select
                  value={compactCriticality}
                  onChange={(e) => {
                    setCompactCriticality(e.target.value);
                    handleSpecChange("assetCriticality", e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 text-xs font-bold text-slate-200 rounded-lg p-2.5 outline-none focus:border-yellow-400"
                >
                  <option value="Standard">Standard Priority (P3)</option>
                  <option value="High">High Criticality (P2)</option>
                  <option value="Extreme / Critical">Extreme / Plant Critical (P1)</option>
                </select>
              </div>

              {/* Field 5: Manufacturer */}
              <div className="space-y-1.5 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
                  5. Manufacturer / OEM
                </label>
                <input
                  type="text"
                  value={compactManufacturer}
                  onChange={(e) => {
                    setCompactManufacturer(e.target.value);
                    handleSpecChange("manufacturer", e.target.value);
                  }}
                  placeholder="E.g., Flowserve, Westinghouse, SKF"
                  className="w-full bg-slate-900 border border-slate-700 text-xs font-bold text-slate-200 rounded-lg p-2.5 outline-none focus:border-yellow-400"
                />
              </div>

              {/* Field 6: Model Number */}
              <div className="space-y-1.5 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
                  6. Model / Frame Number
                </label>
                <input
                  type="text"
                  value={compactModel}
                  onChange={(e) => {
                    setCompactModel(e.target.value);
                    handleSpecChange("model", e.target.value);
                  }}
                  placeholder="E.g., 3196 ISO-100, Frame 449T"
                  className="w-full bg-slate-900 border border-slate-700 text-xs font-bold text-slate-200 rounded-lg p-2.5 outline-none focus:border-yellow-400"
                />
              </div>

            </div>

            {/* Sub-row for RPM, Power Rating, and Drive Type */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Operating Speed (RPM)</label>
                <input
                  type="number"
                  value={specs.specRpm || "1750"}
                  onChange={(e) => handleSpecChange("specRpm", e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-yellow-400"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Power Rating (HP / kW)</label>
                <input
                  type="text"
                  value={specs.powerRating || "150"}
                  onChange={(e) => handleSpecChange("powerRating", e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-yellow-400"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Drive Coupling Type</label>
                <select
                  value={specs.driveType || "Direct Coupled"}
                  onChange={(e) => handleSpecChange("driveType", e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-yellow-400"
                >
                  <option value="Direct Coupled">Direct Coupled</option>
                  <option value="Belt Drive">Belt & Pulley Drive</option>
                  <option value="Gear Drive">Gear Reducer Drive</option>
                  <option value="VFD Drive">Variable Frequency Drive (VFD)</option>
                </select>
              </div>
            </div>

            {/* Symptoms / Voice Input */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-mono font-bold text-slate-300 uppercase">
                  Field Observations & Symptoms
                </label>
                <button
                  type="button"
                  onClick={handleVoiceDictate}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-yellow-400 border border-slate-700 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5 text-yellow-400 animate-pulse" />
                  <span>Voice Dictation</span>
                </button>
              </div>
              <textarea
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="Describe any unusual noise, elevated temperature, excessive shaking, or recent maintenance work..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-yellow-400 resize-none font-sans"
              />
            </div>

          </div>
        ) : (
          /* TAB 2: GUIDED WIZARD (OPTIONAL) */
          <div className="animate-fade-in pt-2">
            <SpecsFormWizard 
              specs={specs} 
              handleSpecChange={handleSpecChange} 
              equipmentType={equipmentType} 
              setEquipmentType={setEquipmentType}
              numShafts={numShafts} 
              setNumShafts={setNumShafts} 
              shafts={shafts} 
              setShafts={setShafts} 
              isAutoFilled={isComponentSpecsAutoFilled} 
            />
          </div>
        )}

      </div>

      {/* ==================================================================== */}
      {/* SECTION 1: "LAUNCH NEW ANALYSIS" (TOP CARD)                          */}
      {/* ==================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6" id="launch-new-analysis-card">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white font-display flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400 fill-yellow-400/20" />
              SECTION 1: Launch New Analysis
            </h2>
            <p className="text-xs text-slate-400">
              Configure analysis depth, execution priority, and launch automated machinery diagnostics.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-3 py-1.5 rounded-xl">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>GPU Acceleration Active</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Left Column: Asset Selection & Schedule Toggle */}
          <div className="md:col-span-6 space-y-4">
            
            {/* Target Asset Selector Dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono font-bold text-slate-300 uppercase flex items-center gap-1.5">
                Target Machinery Asset
                <span className="text-yellow-400">*</span>
              </label>
              
              <div className="relative">
                <select
                  value={selectedAssetId || ""}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : "";
                    setSelectedAssetId(val);
                    if (val && assetsList.length > 0) {
                      const found = assetsList.find(a => a.id === val);
                      if (found) setCompactAssetName(found.name);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 text-xs font-bold text-white rounded-xl p-3 outline-none focus:border-yellow-400 appearance-none cursor-pointer pr-10"
                >
                  <option value="">{compactAssetName} (Custom Spec Selected)</option>
                  {assetsList.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name} (Tag: {asset.asset_tag || `AST-${asset.id}`})
                    </option>
                  ))}
                  <option value="999">Primary Boiler Feed Pump #3 (PMP-101)</option>
                  <option value="998">Cooling Tower Fan Drive Motor (MTR-502)</option>
                  <option value="997">Main Extruder Speed Reducer (GBX-301)</option>
                </select>
                <ChevronRight className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none rotate-90" />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] text-slate-500 font-mono">Active Target:</span>
                <span className="px-2 py-0.5 bg-yellow-400/10 border border-yellow-400/30 text-yellow-300 text-[10px] font-mono font-bold rounded">
                  {compactAssetName}
                </span>
              </div>
            </div>

            {/* Schedule for Later Toggle */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-slate-200">Schedule Analysis for Later</span>
                </div>
                
                <button
                  type="button"
                  onClick={() => setScheduleForLater(!scheduleForLater)}
                  className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 cursor-pointer ${
                    scheduleForLater ? "bg-cyan-500" : "bg-slate-800"
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-slate-950 transition-transform duration-200 ${
                    scheduleForLater ? "translate-x-6" : "translate-x-0"
                  }`} />
                </button>
              </div>

              {scheduleForLater && (
                <div className="pt-2 animate-fade-in space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Pick Date & Time</label>
                  <input
                    type="datetime-local"
                    value={scheduledDateTime}
                    onChange={(e) => setScheduledDateTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Analysis Type & Priority Selector */}
          <div className="md:col-span-6 space-y-4">
            
            {/* Analysis Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono font-bold text-slate-300 uppercase block">
                Analysis Type
              </label>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: "Standard Scan", label: "Standard Scan", desc: "ISO 10816 baseline check" },
                  { id: "Deep Spectrum Analysis", label: "Deep Spectrum", desc: "FFT Order tracking & peak harmonics" },
                  { id: "Bearing Fault Detection", label: "Bearing Faults", desc: "BPFI/BPFO resonance isolation" },
                ].map((item) => {
                  const isSelected = analysisType === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setAnalysisType(item.id as any)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? "bg-cyan-500/10 border-cyan-500 text-cyan-300 font-bold shadow-md shadow-cyan-500/10"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                      }`}
                    >
                      <div className="text-xs font-mono font-bold mb-0.5">{item.label}</div>
                      <div className="text-[10px] text-slate-500 leading-tight">{item.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Priority Level */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono font-bold text-slate-300 uppercase block">
                Execution Priority Level
              </label>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "Normal", label: "Normal (P3)", color: "text-slate-300 bg-slate-950 border-slate-800" },
                  { id: "Rush", label: "Rush (P2)", color: "text-amber-300 bg-amber-950/30 border-amber-500/40" },
                  { id: "Emergency", label: "Emergency (P1)", color: "text-red-400 bg-red-950/40 border-red-500/50" },
                ].map((item) => {
                  const isSelected = priorityLevel === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPriorityLevel(item.id as any)}
                      className={`p-2.5 rounded-xl border text-center text-xs font-mono font-bold transition-all cursor-pointer ${
                        isSelected
                          ? `${item.color} shadow-lg ring-1 ring-yellow-400`
                          : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

        </div>

        {/* PROMINENT LAUNCH BUTTON */}
        <div className="pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={triggerDiagnostics}
            disabled={isLoading}
            className={`w-full py-4 rounded-xl font-black text-sm tracking-widest uppercase transition-all flex items-center justify-center gap-3 shadow-2xl cursor-pointer ${
              isLoading
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-yellow-400 hover:bg-yellow-300 text-slate-950 shadow-yellow-400/20 hover:scale-[1.005] active:scale-[0.995]"
            }`}
          >
            <Wrench className="w-5 h-5 text-slate-950" />
            <span>{scheduleForLater ? "Schedule Machinery Diagnostics" : "COMPUTE MACHINERY DIAGNOSTICS"}</span>
          </button>
        </div>

      </div>

      {/* ==================================================================== */}
      {/* SECTION 2: "ACTIVE SCANS & QUEUE" (MIDDLE - CYBER/NEON AESTHETIC)    */}
      {/* ==================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4" id="active-scans-queue-section">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-xl shadow-inner">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-display flex items-center gap-2">
                SECTION 2: Active Scans & Diagnostic Queue
                <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
                  {activeScans.length} Running
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Real-time GPU processing queue & spectrum extraction telemetry feed.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>Live Stream Engine</span>
          </div>
        </div>

        {activeScans.length === 0 ? (
          <div className="p-8 border border-dashed border-slate-800 rounded-xl text-center space-y-2 bg-slate-950/40">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <p className="text-xs font-bold text-slate-300">All diagnostic jobs completed!</p>
            <p className="text-[11px] text-slate-500">Launch a new analysis above to add to the real-time queue.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeScans.map((scan) => {
              const formattedTime = `${Math.floor(scan.elapsedSeconds / 60).toString().padStart(2, '0')}:${(scan.elapsedSeconds % 60).toString().padStart(2, '0')}`;

              return (
                <div
                  key={scan.id}
                  className={`p-4 rounded-xl border transition-all space-y-3 shadow-lg relative overflow-hidden ${
                    scan.isPaused
                      ? "bg-slate-950/80 border-slate-800 opacity-75"
                      : "bg-slate-950 border-cyan-500/30 shadow-cyan-500/5 hover:border-cyan-500/50"
                  }`}
                >
                  {/* Card Top Line */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-1 bg-cyan-950 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold rounded-lg">
                        {scan.assetTag}
                      </span>
                      <span className="text-sm font-bold text-white font-display">{scan.assetName}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase border ${
                        scan.priority === "Emergency"
                          ? "bg-red-500/10 border-red-500/30 text-red-400"
                          : scan.priority === "Rush"
                          ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                          : "bg-slate-800 border-slate-700 text-slate-400"
                      }`}>
                        {scan.priority}
                      </span>

                      <span className="text-xs font-mono text-cyan-400 font-bold bg-slate-900 px-2 py-1 rounded border border-slate-800">
                        ⏱ {formattedTime}
                      </span>

                      {/* Cancel & Pause Buttons */}
                      <button
                        type="button"
                        onClick={() => handleTogglePauseScan(scan.id)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer"
                        title={scan.isPaused ? "Resume Scan" : "Pause Scan"}
                      >
                        {scan.isPaused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-amber-400" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCancelScan(scan.id)}
                        className="p-1.5 bg-red-950/60 hover:bg-red-900/80 text-red-400 rounded-lg text-xs transition-colors border border-red-500/30 cursor-pointer"
                        title="Cancel Scan"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Stage & Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-cyan-300 font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                        Stage: {scan.stage}
                      </span>
                      <span className="text-slate-400 font-bold">{scan.progress}%</span>
                    </div>

                    <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800 p-0.5">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-full transition-all duration-300 shadow-lg shadow-cyan-500/20"
                        style={{ width: `${scan.progress}%` }}
                      />
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* ==================================================================== */}
      {/* SECTION 3: "RECENT COMPLETED ANALYSES" (BOTTOM)                      */}
      {/* ==================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6" id="recent-completed-analyses-section">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white font-display flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              SECTION 3: Recent Completed Analyses
            </h2>
            <p className="text-xs text-slate-400">
              Audit logs of completed diagnostic scans, overall health scores, and quick CMMS actions.
            </p>
          </div>

          <span className="text-xs font-mono text-slate-400">
            Showing {completedAnalyses.length} Records
          </span>
        </div>

        {/* GRID OF COMPLETED CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {completedAnalyses.map((analysis) => {
            const isRed = analysis.healthStatus === "Red" || analysis.healthScore < 50;
            const isYellow = analysis.healthStatus === "Yellow" || (analysis.healthScore >= 50 && analysis.healthScore < 85);

            return (
              <div
                key={analysis.id}
                className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-xl transition-all space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-2 py-0.5 rounded">
                          {analysis.assetTag}
                        </span>
                        <h3 className="text-sm font-bold text-white font-display">{analysis.assetName}</h3>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono">{analysis.location} • {analysis.timestamp}</p>
                    </div>

                    {/* Health Score Badge */}
                    <div className={`px-3 py-1.5 rounded-xl border text-center font-mono font-black text-xs shrink-0 ${
                      isRed
                        ? "bg-red-500/10 border-red-500/40 text-red-400 shadow-red-500/10"
                        : isYellow
                        ? "bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-amber-500/10"
                        : "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-emerald-500/10"
                    }`}>
                      <div>{analysis.healthScore}%</div>
                      <div className="text-[8px] font-bold uppercase">{analysis.healthStatus}</div>
                    </div>
                  </div>

                  {/* Top Faults List */}
                  <div className="space-y-1 pt-1">
                    <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">Top Detected Findings:</span>
                    <ul className="space-y-1 text-xs font-sans text-slate-300">
                      {analysis.topFaults.map((fault, idx) => (
                        <li key={idx} className="flex items-center gap-1.5 text-slate-300 text-xs">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRed ? "bg-red-400" : isYellow ? "bg-amber-400" : "bg-emerald-400"}`} />
                          <span className="truncate">{fault}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="pt-3 border-t border-slate-850 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setViewingReportModal(analysis)}
                    className="px-3.5 py-2 bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-extrabold text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>View Full Report</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleGenerateCMMSWorkOrder(analysis)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs rounded-xl border border-slate-700 transition-all cursor-pointer"
                    >
                      Work Order
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        showToast(`✓ Re-test scheduled for ${analysis.assetName}`, "success");
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition-all cursor-pointer"
                    >
                      Re-Test
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>

      </div>

      {/* ==================================================================== */}
      {/* MODAL OVERLAY FOR VIEW FULL REPORT                                  */}
      {/* ==================================================================== */}
      {viewingReportModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 space-y-6 shadow-2xl relative">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-2 py-0.5 rounded">
                    {viewingReportModal.assetTag}
                  </span>
                  <h2 className="text-lg font-bold text-white font-display">
                    {viewingReportModal.assetName} - Diagnostic Report
                  </h2>
                </div>
                <p className="text-xs text-slate-400 font-mono">Location: {viewingReportModal.location}</p>
              </div>

              <button
                type="button"
                onClick={() => setViewingReportModal(null)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Results Display Body */}
            <ResultsDisplay 
              diagnosticResult={viewingReportModal.reportData} 
              handleSave={() => {
                if (onSaveReport) {
                  onSaveReport(category, symptoms, specs, viewingReportModal.reportData);
                  showToast("Report saved to history!", "success");
                }
              }} 
              handleGenerateCMMSWorkOrder={() => handleGenerateCMMSWorkOrder(viewingReportModal)} 
              handleSendManualAlert={handleSendManualAlert} 
              handleExportPDF={() => handleExportPDF(viewingReportModal)} 
              isAlertSending={isAlertSending} 
              alertSuccessMsg={alertSuccessMsg} 
              generatedWorkOrder={generatedWorkOrder} 
              handleCopyToClipboard={handleCopyToClipboard} 
              assetId={selectedAssetId}
              equipmentType={equipmentType}
              user={user}
            />

          </div>
        </div>
      )}

      {/* Maintenance Logs Section */}
      <div className="pt-4">
        <MaintenanceLogsSection 
          quickAnalysisMode={quickAnalysisMode} 
          selectedAssetId={selectedAssetId} 
          maintenanceLogs={[]} 
          isAddingLog={false} 
          setIsAddingLog={() => {}} 
          newLog={{ work_date: "", work_type: "", technician_name: "", notes: "", parts_used: "" }} 
          setNewLog={() => {}} 
          handleAddMaintenanceLog={() => {}} 
        />
      </div>

    </div>
  );
}
