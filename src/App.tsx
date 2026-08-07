import React, { useState, useEffect } from "react";
import { SavedReport, SystemHealth, DiagnosticResponse, TrendDataPoint } from "./types";
import Dashboard from "./components/Dashboard";
import Diagnose from "./components/Diagnose";
import History from "./components/History";
import ReportDetails from "./components/ReportDetails";
import Trends from "./components/Trends";
import MountingPlanner from "./components/MountingPlanner";
import Assets from "./components/Assets";
import OnboardingWizard from "./components/OnboardingWizard";
import Login, { UserSession } from "./components/Login";
import AdminPanel from "./components/AdminPanel";
import LegalDocuments from "./components/LegalDocuments";
import Terms from "./components/Terms";
import Privacy from "./components/Privacy";
import AlertsControl from "./components/AlertsControl";
import AIChatbot from "./components/AIChatbot";
import AIDataMigration from "./components/AIDataMigration";
import AnalysisReport from "./components/AnalysisReport";
import RootCauseAnalysis from "./components/RootCauseAnalysis";
import MaintenanceCalendar from "./components/MaintenanceCalendar";
import FMEA from "./components/FMEA";
import ScrollToTop from "./components/ScrollToTop";
import AppLink from "./components/AppLink";
import { type AppTab, TAB_TO_PATH, tabFromPath, navigateToTab } from "./navigation";
import { 
  Activity, Wrench, Clock, Database, ShieldAlert, CheckCircle2, LineChart, Compass, Key, Eye, EyeOff, ShieldCheck, Bell, BellRing, Folder, LogOut, Menu, X, Settings,
  Sun, Moon, Sparkles, FileText, Target, Calendar
} from "lucide-react";

const STORAGE_KEY = "reliability_reports_v6";
const TREND_STORAGE_KEY = "reliability_trends_v6";

export interface Notification {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  read: boolean;
  equipmentName: string;
}

export default function App() {
  const [user, setUser] = useState<UserSession | null>(() => {
    const stored = localStorage.getItem("motormedic_user_session");
    if (stored) {
      try { return JSON.parse(stored); } catch (e) { return null; }
    }
    return null;
  });

  const [selectedCompanyId, setSelectedCompanyId] = useState<number>(() => {
    const stored = localStorage.getItem("reliability_selected_company_id");
    return stored ? parseInt(stored, 10) : 1; // Default to Allied Reliability
  });

  useEffect(() => {
    if (user) {
      setSelectedCompanyId(user.company_id);
      localStorage.setItem("motormedic_user_session", JSON.stringify(user));
    } else {
      localStorage.removeItem("motormedic_user_session");
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem("reliability_selected_company_id", String(selectedCompanyId));
  }, [selectedCompanyId]);

  const [activeTab, setActiveTab] = useState<AppTab>(() => tabFromPath(window.location.pathname) ?? "dashboard");
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("motormedic_theme") || "dark";
  });

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("motormedic_theme", nextTheme);
  };

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const [showLegalDoc, setShowLegalDoc] = useState<"terms" | "privacy" | null>(null);

  // Custom router state for /terms and /privacy URLs
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      setCurrentPath(path);
      const tab = tabFromPath(path);
      if (tab) {
        setActiveTab(tab);
        setSelectedReport(null);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  const [companies, setCompanies] = useState<any[]>([]);

  const fetchCompanies = () => {
    fetch("/api/companies")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setCompanies(data);
        }
      })
      .catch(err => console.error("Failed to load companies:", err));
  };

  useEffect(() => {
    fetchCompanies();
  }, [selectedCompanyId]);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<SavedReport | null>(null);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [isHamburgerOpen, setIsHamburgerOpen] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState<boolean>(false);
  const [targetContext, setTargetContext] = useState<{
    plantId: number | null;
    routeId: number | null;
    assetId: number | null;
    componentId: number | null;
    technologyType: string | null;
    collectionPointId?: number | string | null;
  } | null>(null);
  const [trendsAssetId, setTrendsAssetId] = useState<string | undefined>(undefined);

  const handleStartDiagnosis = (
    plantId: number | null, 
    routeId: number | null, 
    assetId: number | null, 
    componentId: number | null, 
    technologyType: string,
    collectionPointId?: number | string | null
  ) => {
    setTargetContext({ plantId, routeId, assetId, componentId, technologyType, collectionPointId });
    navigateToTab("diagnose");
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefillId = params.get("prefillId");
    if (prefillId) {
      handleStartDiagnosis(null, null, null, null, "Vibration", prefillId);
    }
  }, []);

  const handleSecureLogout = () => {
    // Completely clear user session tokens & preferences from storage
    localStorage.removeItem("motormedic_user_session");
    sessionStorage.clear();
    
    // Clear states
    setUser(null);
    setSelectedReport(null);
    setActiveTab("dashboard");

    // Replace history entries and reload to guarantee "Back" button blocks access
    window.history.pushState(null, "", window.location.origin);
    window.location.replace(window.location.origin);
  };

  const [customApiKey, setCustomApiKey] = useState<string>(() => localStorage.getItem("reliability_custom_gemini_key") || "");
  const [showCredsModal, setShowCredsModal] = useState<boolean>(false);
  const [tempApiKey, setTempApiKey] = useState<string>("");
  const [showKeyPassword, setShowKeyPassword] = useState<boolean>(false);

  // Onboarding Wizard states
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [hasCheckedOnboarding, setHasCheckedOnboarding] = useState<boolean>(false);
  const [hasSkippedOnboarding] = useState<boolean>(() => {
    return localStorage.getItem("motor_medic_onboarding_skipped") === "true";
  });

  const checkOnboardingCount = async () => {
    if (hasCheckedOnboarding || hasSkippedOnboarding) return;
    try {
      const res = await fetch(`/api/plants/count?company_id=${selectedCompanyId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.count === 0) {
          setShowOnboarding(true);
        }
        setHasCheckedOnboarding(true);
      }
    } catch (err) {
      console.error("Failed to fetch plants count for onboarding:", err);
    }
  };

  useEffect(() => {
    if (activeTab === "dashboard" || activeTab === "assets") {
      checkOnboardingCount();
    }
  }, [activeTab, selectedCompanyId]);

  const handleOnboardingComplete = () => {
    localStorage.setItem("motor_medic_onboarding_skipped", "false");
    setShowOnboarding(false);
    navigateToTab("dashboard");
    // Trigger any reload or custom events needed to refresh components
    window.location.reload();
  };

  // Initialize/Load Notifications
  useEffect(() => {
    try {
      const stored = localStorage.getItem("reliability_notifications_v6");
      if (stored) {
        setNotifications(JSON.parse(stored));
      } else {
        const initialMockNotifications: Notification[] = [
          {
            id: "notif-mock-1",
            timestamp: new Date(Date.now() - 3 * 24 * 3600 * 1000).toLocaleString(),
            title: "⚠️ CRITICAL FAULT: Boiler Feed Pump A",
            message: "Inboard Bearing Raceway Degradation (Inner Ring Flaking) - Advanced Stage",
            severity: "High",
            read: false,
            equipmentName: "Boiler Feed Pump A"
          }
        ];
        setNotifications(initialMockNotifications);
        localStorage.setItem("reliability_notifications_v6", JSON.stringify(initialMockNotifications));
      }
    } catch (e) {
      console.error("Failed to load notifications", e);
    }
  }, []);

  const saveNotifications = (updated: Notification[]) => {
    setNotifications(updated);
    localStorage.setItem("reliability_notifications_v6", JSON.stringify(updated));
  };

  useEffect(() => {
    localStorage.setItem("reliability_custom_gemini_key", customApiKey);
  }, [customApiKey]);

  const fetchRealDiagnosisLogs = async (plantId: number) => {
    try {
      const res = await fetch(`/api/diagnosis-logs?plant_id=${plantId}`);
      if (res.ok) {
        const data = await res.json();
        const mapped: SavedReport[] = data.map((row: any) => {
          let aiResp: any = {};
          try {
            aiResp = typeof row.ai_response === 'string' ? JSON.parse(row.ai_response) : row.ai_response;
          } catch (e) {
            aiResp = row.ai_response || {};
          }

          let inputData: any = {};
          try {
            inputData = typeof row.input_data === 'string' ? JSON.parse(row.input_data) : row.input_data;
          } catch (e) {
            inputData = row.input_data || {};
          }

          return {
            id: String(row.id),
            date: row.timestamp ? new Date(row.timestamp).toLocaleString() : new Date().toLocaleString(),
            category: row.equipment_type || "Mechanical",
            symptoms: inputData.symptoms || "Diagnostic File Asset Assessment",
            specs: inputData.specs || {},
            fileName: inputData.fileName || undefined,
            fileType: "text",
            data: {
              equipment_status: aiResp.equipment_status || "FAULT_DETECTED",
              confidence_score: aiResp.confidence_score || 85,
              overall_vibration_level: aiResp.overall_vibration_level || "0.32 in/s RMS",
              iso_severity_zone: aiResp.iso_severity_zone || "C",
              probable_faults: aiResp.probable_faults || [
                {
                  fault_name: aiResp.probable_fault || "Unknown Anomaly",
                  confidence: aiResp.confidence_score ? `${aiResp.confidence_score}%` : "High",
                  probability: aiResp.confidence_score || 85,
                  supporting_evidence: aiResp.fault_explanation || "",
                  calculated_frequencies: "N/A",
                  physical_explanation: aiResp.recommended_actions || "",
                  fault: aiResp.probable_fault || "Unknown Anomaly",
                  description: aiResp.fault_explanation || ""
                }
              ],
              failure_stage: aiResp.failure_stage || "Moderate",
              manager_summary: aiResp.manager_summary || {
                severity: aiResp.overall_severity || aiResp.severity || "Medium",
                actions_required: aiResp.recommended_actions || "Inspect machinery component."
              },
              maintenance_actions: aiResp.maintenance_actions || []
            }
          };
        });
        setReports(mapped);
      }
    } catch (err) {
      console.error("Failed to fetch real diagnosis logs:", err);
    }
  };

  useEffect(() => {
    if (user && user.plant_id) {
      fetchRealDiagnosisLogs(user.plant_id);
    }
  }, [user]);

  // Initialize/Load from LocalStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setReports(JSON.parse(stored));
      } else {
        // Hydrate with 2 realistic pre-populated diagnostics to make the dashboard look stunning on first load!
        const initialMockReports: SavedReport[] = [
          {
            id: "mock-1",
            date: new Date(Date.now() - 3 * 24 * 3600 * 1000).toLocaleString(), // 3 days ago
            category: "Mechanical",
            symptoms: "Inboard bearing housing of the cooling pump shows elevated acoustic emissive noise and thermal temperature of 82°C. Shaft vibrations display spectral energy peaks at 1X operating frequency.",
            specs: {
              specRpm: "1800",
              specOrientation: "Horizontal",
              specDrive: "Direct",
              specFanBlades: "N/A",
              specPumpImpellers: "5",
              specPinionTeeth: "N/A",
            },
            fileName: "pump_vibration_spectra.csv",
            fileType: "text",
            data: {
              equipment_status: "FAULT_DETECTED",
              confidence_score: 88,
              overall_vibration_level: "0.36 in/s RMS",
              iso_severity_zone: "C",
              probable_faults: [
                {
                  fault_name: "Inboard Bearing Raceway Degradation (Inner Ring Flaking)",
                  confidence: "High",
                  probability: 88,
                  supporting_evidence: "Acoustic emission spikes and 82°C thermal spot measurement. High amplitude vibration spectral energy matched precisely with BPFI limits.",
                  calculated_frequencies: "BPFI frequency calculated at 148 Hz based on 1800 RPM base speed (1800/60 * 4.93 bearing coefficient). Detected peak at 147.8 Hz matches outer/inner defect geometry.",
                  physical_explanation: "Subsurface shear stresses cause rolling contact fatigue, producing micro-pitting in the load zone. Element strikes generate high-frequency elastic stress waves.",
                  fault: "Inboard Bearing Raceway Degradation (Inner Ring Flaking)", // legacy support
                  description: "Dominant energy spectral peaks aligned precisely with Calculated BPFI (Blade Pass Frequency of Inner Ring) frequencies, indicating localized fatigue spelling or micro-pitting in the load zone." // legacy support
                }
              ],
              runner_up_faults: [
                {
                  fault_name: "Inadequate bearing lubrication film",
                  probability: 65,
                  why_ruled_out: "Grease degradation explains temperature rises, but does not match the sharp, distinct BPFI vibrational peak observed in the spectrum."
                }
              ],
              verification_steps: [
                "Perform dynamic shock pulse testing to measure inner-ring defect crest factor",
                "Execute thermal housing profiles using infrared thermography camera"
              ],
              immediate_actions: [
                {
                  action: "Schedule laser shaft alignment verification",
                  priority: "2",
                  timeline: "Within 14 operating days",
                  safety_warning: "Observe 10-minute cool-down prior to housing contact. Shut down power.",
                  rationale: "To confirm zero angular or radial offset which can overload inboard raceway bearings." // legacy support
                },
                {
                  action: "Replenish lithium-complex high-temperature grease",
                  priority: "3",
                  timeline: "Immediately",
                  safety_warning: "Do not over-grease to prevent seal blowout.",
                  rationale: "To restore hydrodynamic oil-film barrier and lower frictional running temperatures." // legacy support
                }
              ],
              root_cause_analysis: "1. Why did the bearing fail? Excessive inner ring wear. 2. Why inner ring wear? Rolling contact fatigue under cyclic loading. 3. Why cyclic loading? Minor shaft coupling misalignment over long operation. 4. Why misalignment? Thermal growth of machinery wasn't accounted for. 5. Why missed? Lack of pre-commissioning alignment checks.",
              financial_impact: {
                estimated_downtime_cost: "$12,500 (unplanned line stoppage)",
                estimated_repair_cost: "$950 (planned off-peak swap)",
                savings_from_proactive_repair: "$11,550"
              },
              manager_summary: {
                severity: "High",
                executive_brief: "The inboard cooling pump bearing is operating in Stage-2 fatigue wear. Continuous operation is certified until the next scheduled maintenance window. Plan replacement within 14 days.",
                estimated_downtime: "2.5 hours",
                cost_estimate: "$950",
                business_impact: "Losing backup pump redundancy creates high risk of a single point of failure."
              },
              technician_instructions: "Shut down asset using LOTO. Purge old lubricant and grease with high-temp synthetic SHC 100 grease. Plan bearing swap.",
              data_sources_analyzed: "CSV spectral vibration data, thermal spot logs, and operator symptom reports."
            }
          },
          {
            id: "mock-2",
            date: new Date(Date.now() - 1 * 24 * 3600 * 1000).toLocaleString(), // 1 day ago
            category: "Hydraulic",
            symptoms: "Main system valve block experiencing high pressure ripple pulses. Actuator speed shows sluggish movement during extending strokes.",
            specs: {
              specRpm: "N/A",
              specOrientation: "N/A",
              specDrive: "N/A",
              specFanBlades: "N/A",
              specPumpImpellers: "N/A",
              specPinionTeeth: "N/A",
            },
            data: {
              equipment_status: "MINOR_ISSUES",
              confidence_score: 72,
              overall_vibration_level: "0.21 in/s RMS",
              iso_severity_zone: "B",
              probable_faults: [
                {
                  fault_name: "Proportional Directional Valve Spool Cavitation",
                  confidence: "Medium",
                  probability: 72,
                  supporting_evidence: "Crackling sound and sluggish cylinder strokes under high pressures.",
                  calculated_frequencies: "Not vibration frequency dependent. Driven by local system pressure drops exceeding oil vapor pressure limits.",
                  physical_explanation: "Local vapor bubble formation and subsequent high-velocity micro-jet implosion eroding spool metal lands.",
                  fault: "Proportional Directional Valve Spool Cavitation", // legacy support
                  description: "Sluggish strokes combined with micro-shocks indicate localized low pressure zones releasing vapor bubbles that implode against spool land surfaces." // legacy support
                }
              ],
              runner_up_faults: [
                {
                  fault_name: "Internal Cylinder Seal Bypass Leakage",
                  probability: 45,
                  why_ruled_out: "Explains sluggish cylinder extension but does not generate the localized crackling sound heard inside the spool block."
                }
              ],
              verification_steps: [
                "Install localized pressure transducer to capture micro-shock pressure ripples",
                "Measure case drain flow rate to quantify internal leakage"
              ],
              immediate_actions: [
                {
                  action: "Inspect suction line strainer elements",
                  priority: "3",
                  timeline: "Within 30 operating days",
                  safety_warning: "Observe standard pressure de-energization guidelines before opening suction line.",
                  rationale: "Partial blockage creates suction vacuum, promoting severe oil aeration and subsequent cavitation." // legacy support
                }
              ],
              root_cause_analysis: "1. Why sluggish cylinder stroke? Reduced fluid flow. 2. Why reduced flow? Spool erosion limiting full valve stroke. 3. Why erosion? High-velocity vapor bubble implosion (cavitation). 4. Why cavitation? Severe local vacuum in suction lines. 5. Why suction vacuum? Partially clogged suction line strainer element.",
              financial_impact: {
                estimated_downtime_cost: "$8,200",
                estimated_repair_cost: "$350 (filter element replacement)",
                savings_from_proactive_repair: "$7,850"
              },
              manager_summary: {
                severity: "Medium",
                executive_brief: "Sluggish hydraulic strokes are caused by hydraulic micro-cavitation inside the directional spool block. Clean strainers immediately to prevent wear.",
                estimated_downtime: "3 hours",
                cost_estimate: "$350",
                business_impact: "Cylinder extension lags by 15%, causing slight process delays but zero safety concerns."
              },
              technician_instructions: "Isolate power. Close gate valves. Remove suction-side filter, inspect and clean mesh, replace if necessary.",
              data_sources_analyzed: "Symptoms logging, line pressure readings, and visual stroke travel timings."
            }
          }
        ];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initialMockReports));
        setReports(initialMockReports);
      }
    } catch (e) {
      console.error("Failed to read local storage for diagnostics", e);
    }

    // Load trends
    try {
      const storedTrends = localStorage.getItem(TREND_STORAGE_KEY);
      if (storedTrends) {
        setTrendData(JSON.parse(storedTrends));
      } else {
        // Hydrate with realistic historical data demonstrating actual drift trends!
        const initialMockTrends: TrendDataPoint[] = [
          // Boiler Feed Pump A (Rising vibration/temp trend)
          {
            id: "t-1",
            timestamp: new Date(Date.now() - 4 * 24 * 3600 * 1000).toLocaleString(),
            equipmentName: "Boiler Feed Pump A",
            vibrationVelocity: 1.2,
            bearingTemperature: 45.0,
            hydraulicPressure: 150,
            electricalAmperage: 35.0
          },
          {
            id: "t-2",
            timestamp: new Date(Date.now() - 3 * 24 * 3600 * 1000).toLocaleString(),
            equipmentName: "Boiler Feed Pump A",
            vibrationVelocity: 1.6,
            bearingTemperature: 49.0,
            hydraulicPressure: 152,
            electricalAmperage: 35.2
          },
          {
            id: "t-3",
            timestamp: new Date(Date.now() - 2 * 24 * 3600 * 1000).toLocaleString(),
            equipmentName: "Boiler Feed Pump A",
            vibrationVelocity: 2.2,
            bearingTemperature: 58.5,
            hydraulicPressure: 148,
            electricalAmperage: 36.5
          },
          {
            id: "t-4",
            timestamp: new Date(Date.now() - 1 * 24 * 3600 * 1000).toLocaleString(),
            equipmentName: "Boiler Feed Pump A",
            vibrationVelocity: 3.1,
            bearingTemperature: 71.0,
            hydraulicPressure: 149,
            electricalAmperage: 38.0
          },
          {
            id: "t-5",
            timestamp: new Date().toLocaleString(),
            equipmentName: "Boiler Feed Pump A",
            vibrationVelocity: 4.8,
            bearingTemperature: 86.5,
            hydraulicPressure: 147,
            electricalAmperage: 41.5
          },

          // Hydraulic Manifold C
          {
            id: "t-6",
            timestamp: new Date(Date.now() - 3 * 24 * 3600 * 1000).toLocaleString(),
            equipmentName: "Hydraulic Manifold C",
            vibrationVelocity: 0.8,
            bearingTemperature: 38.0,
            hydraulicPressure: 210,
            electricalAmperage: 12.0
          },
          {
            id: "t-7",
            timestamp: new Date(Date.now() - 2 * 24 * 3600 * 1000).toLocaleString(),
            equipmentName: "Hydraulic Manifold C",
            vibrationVelocity: 0.9,
            bearingTemperature: 39.5,
            hydraulicPressure: 198,
            electricalAmperage: 12.5
          },
          {
            id: "t-8",
            timestamp: new Date(Date.now() - 1 * 24 * 3600 * 1000).toLocaleString(),
            equipmentName: "Hydraulic Manifold C",
            vibrationVelocity: 1.1,
            bearingTemperature: 41.0,
            hydraulicPressure: 175,
            electricalAmperage: 13.0
          },
          {
            id: "t-9",
            timestamp: new Date().toLocaleString(),
            equipmentName: "Hydraulic Manifold C",
            vibrationVelocity: 1.3,
            bearingTemperature: 43.0,
            hydraulicPressure: 145,
            electricalAmperage: 13.8
          },

          // Main Inductor Motor B
          {
            id: "t-10",
            timestamp: new Date(Date.now() - 2 * 24 * 3600 * 1000).toLocaleString(),
            equipmentName: "Main Inductor Motor B",
            vibrationVelocity: 0.9,
            bearingTemperature: 51.0,
            hydraulicPressure: 0,
            electricalAmperage: 72.0
          },
          {
            id: "t-11",
            timestamp: new Date(Date.now() - 1 * 24 * 3600 * 1000).toLocaleString(),
            equipmentName: "Main Inductor Motor B",
            vibrationVelocity: 1.0,
            bearingTemperature: 52.0,
            hydraulicPressure: 0,
            electricalAmperage: 71.8
          },
          {
            id: "t-12",
            timestamp: new Date().toLocaleString(),
            equipmentName: "Main Inductor Motor B",
            vibrationVelocity: 1.2,
            bearingTemperature: 55.0,
            hydraulicPressure: 0,
            electricalAmperage: 74.0
          }
        ];
        localStorage.setItem(TREND_STORAGE_KEY, JSON.stringify(initialMockTrends));
        setTrendData(initialMockTrends);
      }
    } catch (e) {
      console.error("Failed to load trend database:", e);
    }
  }, []);

  // Save diagnostic report handler
  const handleSaveReport = (
    category: "Mechanical" | "Electrical" | "Hydraulic",
    symptoms: string,
    specs: Record<string, string>,
    data: DiagnosticResponse,
    fileName?: string,
    fileType?: string
  ) => {
    const newReport: SavedReport = {
      id: "report-" + Date.now(),
      date: new Date().toLocaleString(),
      category,
      symptoms,
      specs,
      fileName,
      fileType,
      data,
    };

    const updated = [newReport, ...reports];
    setReports(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setSelectedReport(newReport);
    // Diagnostic report saved cleanly to state and localStorage

    if (user && user.plant_id) {
      setTimeout(() => fetchRealDiagnosisLogs(user.plant_id), 1200);
    }

    // Also automatically log a trend data point based on this report's values if present!
    // Try to parse dynamic values from the symptom description or preset them realistically
    const equipmentName = specs.equipmentName || `${category} Unit ${reports.length + 1}`;
    
    // Attempt to extract vibration, temperature from symptoms text or pick defaults matching severity
    let vibe = 1.5;
    let temp = 55.0;
    if (data.manager_summary.severity === "Critical") { vibe = 5.2; temp = 88.0; }
    else if (data.manager_summary.severity === "High") { vibe = 3.6; temp = 74.5; }
    else if (data.manager_summary.severity === "Medium") { vibe = 2.4; temp = 62.0; }

    const newTrend: TrendDataPoint = {
      id: "t-" + Date.now(),
      timestamp: new Date().toLocaleString(),
      equipmentName,
      vibrationVelocity: vibe,
      bearingTemperature: temp,
      hydraulicPressure: category === "Hydraulic" ? 160 : 0,
      electricalAmperage: category === "Electrical" ? 45.0 : 0
    };

    const updatedTrends = [...trendData, newTrend];
    setTrendData(updatedTrends);
    localStorage.setItem(TREND_STORAGE_KEY, JSON.stringify(updatedTrends));

    // Append custom in-app notification if high-severity/critical
    const isCritical = data.manager_summary?.severity === "Critical" || 
                       data.manager_summary?.severity === "High" || 
                       data.failure_stage === "Advanced" || 
                       data.failure_stage === "Catastrophic";
    if (isCritical) {
      const newNotification: Notification = {
        id: "notif-" + Date.now(),
        timestamp: new Date().toLocaleString(),
        title: `⚠️ CRITICAL FAULT: ${equipmentName}`,
        message: `${data.probable_faults?.[0]?.fault_name || "Mechanical Anomaly"} identified in ${data.failure_stage || "Advanced"} stage.`,
        severity: (data.manager_summary?.severity as any) || "High",
        read: false,
        equipmentName
      };
      saveNotifications([newNotification, ...notifications]);
    }
  };

  // Add custom manual trend point
  const handleAddTrendPoint = (point: Omit<TrendDataPoint, "id" | "timestamp">) => {
    const newPoint: TrendDataPoint = {
      ...point,
      id: "t-" + Date.now(),
      timestamp: new Date().toLocaleString()
    };
    const updated = [...trendData, newPoint];
    setTrendData(updated);
    localStorage.setItem(TREND_STORAGE_KEY, JSON.stringify(updated));
  };

  // Delete report handler
  const handleDeleteReport = async (id: string) => {
    const isDbId = !isNaN(Number(id));
    if (isDbId) {
      try {
        const res = await fetch(`/api/diagnosis-logs/${id}`, { method: "DELETE" });
        if (res.ok) {
          if (user && user.plant_id) {
            fetchRealDiagnosisLogs(user.plant_id);
          }
        }
      } catch (err) {
        console.error("Failed to delete diagnosis log on backend:", err);
      }
    } else {
      const updated = reports.filter((r) => r.id !== id);
      setReports(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
    if (selectedReport?.id === id) {
      setSelectedReport(null);
    }
  };

  // Clear all history handler
  const handleClearHistory = () => {
    setReports([]);
    localStorage.removeItem(STORAGE_KEY);
    setSelectedReport(null);
  };

  // Calculate health dynamically based on reports
  const calculateSystemHealth = (): SystemHealth => {
    let mechanical = 100;
    let electrical = 100;
    let hydraulic = 100;

    reports.forEach((r) => {
      const sev = r.data?.manager_summary?.severity;
      let penalty = 0;
      if (sev === "Critical") penalty = 35;
      else if (sev === "High") penalty = 20;
      else if (sev === "Medium") penalty = 8;
      else if (sev === "Low") penalty = 3;

      if (r.category === "Mechanical") mechanical = Math.max(10, mechanical - penalty);
      else if (r.category === "Electrical") electrical = Math.max(10, electrical - penalty);
      else if (r.category === "Hydraulic") hydraulic = Math.max(10, hydraulic - penalty);
    });

    return { mechanical, electrical, hydraulic };
  };

  const systemHealth = calculateSystemHealth();

  // Navigation identity for scroll-to-top (SPA uses tab state, not Next.js routes)
  const scrollRouteKey = [
    currentPath,
    showLegalDoc ?? "",
    user ? activeTab : "logged-out",
    selectedReport?.id ?? ""
  ].join("|");

  if (currentPath === "/terms") {
    return (
      <>
        <ScrollToTop routeKey={scrollRouteKey} />
        <Terms
          onBack={() => {
            window.history.pushState(null, "", "/");
            setCurrentPath("/");
          }}
        />
      </>
    );
  }

  if (currentPath === "/privacy") {
    return (
      <>
        <ScrollToTop routeKey={scrollRouteKey} />
        <Privacy
          onBack={() => {
            window.history.pushState(null, "", "/");
            setCurrentPath("/");
          }}
        />
      </>
    );
  }

  if (showLegalDoc) {
    return (
      <>
        <ScrollToTop routeKey={scrollRouteKey} />
        {showLegalDoc === "terms" ? (
          <Terms onBack={() => setShowLegalDoc(null)} />
        ) : (
          <Privacy onBack={() => setShowLegalDoc(null)} />
        )}
      </>
    );
  }

  if (!user) {
    return (
      <>
        <ScrollToTop routeKey={scrollRouteKey} />
        <Login onLoginSuccess={(u) => setUser(u)} onShowLegal={(tab) => setShowLegalDoc(tab)} />
      </>
    );
  }

  return (
    <div
      className={`min-h-screen w-full flex flex-col transition-colors duration-200 ${
      theme === "dark" ? "bg-[#080c14] text-slate-100" : "bg-slate-50 text-slate-900"
    }`}
    >
      <ScrollToTop routeKey={scrollRouteKey} />
      {/* Dynamic Background Noise/Glow effect */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-yellow-500/5 rounded-full filter blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full filter blur-[120px] pointer-events-none"></div>

      {/* Top Header — sticky chrome; page body scrolls beneath */}
      <header className={`sticky top-0 shrink-0 z-40 backdrop-blur-md border-b px-4 sm:px-6 lg:px-8 py-4 transition-colors duration-200 ${
        theme === "dark" ? "bg-[#0c1220]/95 border-slate-800/80" : "bg-white/95 border-slate-200"
      }`}>
        <div className="w-full max-w-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Hamburger Menu Button */}
            <button
              onClick={() => setIsHamburgerOpen(!isHamburgerOpen)}
              className={`lg:hidden p-2 rounded-xl border transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0 ${
                theme === "dark" ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-white" : "bg-white border-slate-200 text-slate-600 hover:text-slate-900"
              }`}
              aria-label="Toggle navigation menu"
            >
              {isHamburgerOpen ? <X className="w-5 h-5 text-yellow-400" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Navy Blue & Gold Placeholder Logo (Height exactly 40px) */}
            <div className="flex items-center gap-2.5 px-3.5 bg-[#0a192f] border border-[#d4af37]/30 rounded-xl shadow-lg" style={{ height: '40px' }} id="app-brand-logo">
              <Activity className="w-4.5 h-4.5 text-[#d4af37] animate-pulse" />
              <div className="flex flex-col justify-center">
                <span className="text-xs font-black tracking-tight text-[#d4af37] font-display uppercase">
                  MotorMedic <span className={theme === "dark" ? "text-slate-100 font-bold" : "text-white font-bold"}>Pro</span>
                </span>
                <span className="text-[7px] font-mono font-semibold tracking-widest text-[#d4af37]/75 uppercase leading-none">Reliability SaaS</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className={`p-2.5 rounded-xl border transition-all duration-200 cursor-pointer shrink-0 ${
                theme === "dark" 
                  ? "bg-slate-900 border-slate-800 text-yellow-400 hover:bg-slate-800" 
                  : "bg-white border-slate-200 text-indigo-600 hover:bg-slate-100"
              }`}
              title={theme === "dark" ? "Activate Light Mode" : "Activate Dark Mode"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-indigo-600" />}
            </button>

            {/* Notification Bell Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)}
                className={`relative p-2.5 rounded-xl border transition-all duration-200 ${
                  theme === "dark" ? "bg-slate-900 border-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white" : "bg-white border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900"
                }`}
                id="notificationBell"
              >
                {notifications.filter(n => !n.read).length > 0 ? (
                  <>
                    <BellRing className="w-4 h-4 text-yellow-400 animate-bounce" />
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-slate-950 animate-pulse">
                      {notifications.filter(n => !n.read).length}
                    </span>
                  </>
                ) : (
                  <Bell className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {showNotificationsDropdown && (
                <div className="absolute right-0 mt-3 w-80 sm:w-96 rounded-2xl bg-[#0d1527] border border-slate-800/90 shadow-2xl z-50 p-4 space-y-3 animate-fade-in text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="font-bold text-white text-sm flex items-center gap-1.5">
                      <Bell className="w-4 h-4 text-yellow-400" />
                      Condition Alerts
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const marked = notifications.map(n => ({ ...n, read: true }));
                          saveNotifications(marked);
                        }}
                        className="text-[10px] text-yellow-400 hover:underline font-semibold"
                      >
                        Mark read
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        onClick={() => saveNotifications([])}
                        className="text-[10px] text-slate-400 hover:underline font-semibold"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {notifications.length === 0 ? (
                      <p className="text-center py-6 text-slate-500 font-mono text-[11px]">No active critical notifications.</p>
                    ) : (
                      notifications.map(notif => (
                        <div
                          key={notif.id}
                          className={`p-2.5 rounded-lg border text-[11px] leading-relaxed transition-all ${
                            notif.read 
                              ? "bg-slate-950/40 border-slate-900/60 text-slate-400" 
                              : "bg-red-500/5 border-red-500/20 text-slate-200"
                          }`}
                        >
                          <div className="flex justify-between items-start gap-1">
                            <span className="font-bold text-white block">{notif.title}</span>
                            <span className="text-[9px] text-slate-500 shrink-0 font-mono">{notif.timestamp.split(',')[1] || notif.timestamp}</span>
                          </div>
                          <p className="mt-1 text-slate-300 text-[10px]">{notif.message}</p>
                          <div className="mt-1.5 flex items-center justify-between text-[9px]">
                            <span className={`px-1.5 py-0.5 rounded font-mono font-bold ${
                              notif.severity === "Critical" || notif.severity === "High" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"
                            }`}>
                              SEVERITY: {notif.severity.toUpperCase()}
                            </span>
                            {!notif.read && (
                              <button
                                onClick={() => {
                                  const updated = notifications.map(n => n.id === notif.id ? { ...n, read: true } : n);
                                  saveNotifications(updated);
                                }}
                                className="text-yellow-400 hover:text-yellow-500 font-bold"
                              >
                                Mark Read
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden sm:block text-right text-[10px] text-slate-400">
              <p className="font-semibold text-slate-300">User: <span className="text-emerald-400 font-bold font-mono">{user?.username}</span></p>
              <p className="font-mono text-slate-500 uppercase">{user?.role} Access</p>
            </div>

            <button
              onClick={handleSecureLogout}
              className="p-2.5 rounded-xl bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300 transition-all duration-200 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
              title="Sign Out"
              id="signOutButton"
            >
              <LogOut className="w-4.5 h-4.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container — sidebar + content scroll together with the page */}
      <div className="flex w-full max-w-full flex-1 flex-col lg:flex-row relative z-10">
        {/* Desktop Sidebar Navigation — static flex child (no sticky/overflow trap) */}
        <nav className={`hidden lg:flex lg:flex-col w-60 xl:w-64 shrink-0 p-4 xl:p-5 border-r ${
          theme === "dark" ? "bg-[#0a101c]/80 border-slate-800" : "bg-white/80 border-slate-200"
        }`}>
          {/* OVERVIEW */}
          <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wider mb-2 mt-4 px-3">Overview</p>
          <div className="space-y-1">
            <AppLink
              href={TAB_TO_PATH.dashboard}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                activeTab === "dashboard" && !selectedReport
                  ? "bg-yellow-400 text-slate-950 shadow font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
              }`}
            >
              <Database className="w-4.5 h-4.5" />
              <span>Health Dashboard</span>
            </AppLink>

            <AppLink
              href={TAB_TO_PATH.assets}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                activeTab === "assets" && !selectedReport
                  ? "bg-yellow-400 text-slate-950 shadow font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
              }`}
            >
              <Folder className="w-4.5 h-4.5" />
              <span>Equipment DB</span>
            </AppLink>
          </div>

          {/* MONITORING & ANALYTICS */}
          <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wider mb-2 mt-6 px-3">Monitoring & Analytics</p>
          <div className="space-y-1">
            {user?.role !== 'mechanic' && (
              <AppLink
                href={TAB_TO_PATH.diagnose}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                  activeTab === "diagnose" && !selectedReport
                    ? "bg-yellow-400 text-slate-950 shadow font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                }`}
              >
                <Wrench className="w-4.5 h-4.5" />
                <span>Run Diagnostics</span>
              </AppLink>
            )}

            {user?.role !== 'mechanic' && (
              <AppLink
                href={TAB_TO_PATH.trends}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                  activeTab === "trends" && !selectedReport
                    ? "bg-yellow-400 text-slate-950 shadow font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                }`}
              >
                <LineChart className="w-4.5 h-4.5" />
                <span>Trend Analyzer</span>
              </AppLink>
            )}

            {user?.role !== 'mechanic' && (
              <AppLink
                href={TAB_TO_PATH.sensors}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                  activeTab === "sensors" && !selectedReport
                    ? "bg-yellow-400 text-slate-950 shadow font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                }`}
              >
                <Compass className="w-4.5 h-4.5" />
                <span>Mounting Planner</span>
              </AppLink>
            )}

            <AppLink
              href={TAB_TO_PATH.migration}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                activeTab === "migration" && !selectedReport
                  ? "bg-yellow-400 text-slate-950 shadow font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
              }`}
            >
              <Sparkles className="w-4.5 h-4.5 text-yellow-400" />
              <span>Automated Data Migration</span>
            </AppLink>
          </div>

          {/* RELIABILITY ENGINEERING */}
          <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wider mb-2 mt-6 px-3">Reliability Engineering</p>
          <div className="space-y-1">
            <AppLink
              href={TAB_TO_PATH.analysis}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                activeTab === "analysis" && !selectedReport
                  ? "bg-yellow-400 text-slate-950 shadow font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
              }`}
              id="sidebar-analysis-btn"
            >
              <FileText className="w-4.5 h-4.5" />
              <span>Analysis Reports</span>
            </AppLink>

            <AppLink
              href={TAB_TO_PATH.rca}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                activeTab === "rca" && !selectedReport
                  ? "bg-yellow-400 text-slate-950 shadow font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
              }`}
              id="sidebar-rca-btn"
            >
              <Target className="w-4.5 h-4.5" />
              <span>Root Cause Analysis</span>
            </AppLink>

            <AppLink
              href={TAB_TO_PATH.fmea}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                activeTab === "fmea" && !selectedReport
                  ? "bg-yellow-400 text-slate-950 shadow font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
              }`}
              id="sidebar-fmea-btn"
            >
              <ShieldAlert className="w-4.5 h-4.5" />
              <span>FMEA Analysis</span>
            </AppLink>
          </div>

          {/* OPERATIONS & ALERTS */}
          <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wider mb-2 mt-6 px-3">Operations & Alerts</p>
          <div className="space-y-1">
            <AppLink
              href={TAB_TO_PATH.calendar}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                activeTab === "calendar" && !selectedReport
                  ? "bg-yellow-400 text-slate-950 shadow font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
              }`}
              id="sidebar-calendar-btn"
            >
              <Calendar className="w-4.5 h-4.5" />
              <span>Maintenance Calendar</span>
            </AppLink>

            {user?.role !== 'mechanic' && (
              <AppLink
                href={TAB_TO_PATH.alerts}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                  activeTab === "alerts" && !selectedReport
                    ? "bg-yellow-400 text-slate-950 shadow font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                }`}
                id="sidebar-alerts-btn"
              >
                <Bell className="w-4.5 h-4.5" />
                <span>Alerts Control</span>
              </AppLink>
            )}

            <AppLink
              href={TAB_TO_PATH.history}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                activeTab === "history" && !selectedReport
                  ? "bg-yellow-400 text-slate-950 shadow font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
              }`}
            >
              <Clock className="w-4.5 h-4.5" />
              <span>Diagnosis Logs</span>
            </AppLink>
          </div>

          {/* ADMINISTRATION */}
          {user?.role !== 'mechanic' && (
            <>
              <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wider mb-2 mt-6 px-3">Administration</p>
              <div className="space-y-1">
                <AppLink
                  href={TAB_TO_PATH.admin}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                    activeTab === "admin" && !selectedReport
                      ? "bg-yellow-400 text-slate-950 shadow font-bold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                  }`}
                  id="sidebar-admin-btn"
                >
                  <Settings className="w-4.5 h-4.5" />
                  <span>Tenant Settings</span>
                </AppLink>
              </div>
            </>
          )}

          <div className="pt-4 border-t border-slate-900 mt-6 space-y-2">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-3">Legal & Policy</p>
            <div className="flex flex-col gap-1.5 pl-3 text-[11px] text-slate-400">
              <button
                onClick={() => setShowLegalDoc("terms")}
                className="hover:text-yellow-400 text-left transition-colors cursor-pointer bg-transparent border-none p-0 outline-none"
              >
                Terms of Service
              </button>
              <button
                onClick={() => setShowLegalDoc("privacy")}
                className="hover:text-yellow-400 text-left transition-colors cursor-pointer bg-transparent border-none p-0 outline-none"
              >
                Privacy Policy
              </button>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-900 mt-4">
            <div className="bg-slate-900/40 border border-slate-850 rounded-xl p-4 text-xs space-y-2">
              <span className="font-bold text-slate-300">Integrations active:</span>
              <p className="text-[10px] text-slate-400 leading-normal">
                Standard client-side local cache synchronized with MotorMedic structured diagnostic schemas.
              </p>
            </div>
          </div>
        </nav>

        {/* Content Panel — no independent scrollbar; page body scrolls */}
        <main
          id="main-scroll-area"
          className="flex-1 min-w-0 w-full p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 relative"
        >
          <div className="w-full max-w-full min-w-0 bg-[#0c1220]/55 border border-slate-900/80 rounded-2xl p-4 sm:p-6 shadow-xl relative backdrop-blur-sm">
          {selectedReport ? (
            <ReportDetails
              report={selectedReport}
              onBack={() => setSelectedReport(null)}
              onDelete={handleDeleteReport}
            />
          ) : activeTab === "dashboard" ? (
            <Dashboard
              companyId={selectedCompanyId}
              onNavigate={(tab) => {
                navigateToTab(tab as AppTab);
              }}
              onSelectReport={(report) => setSelectedReport(report)}
              onStartQuickAnalysis={() => {
                setTargetContext({
                  plantId: null,
                  routeId: null,
                  assetId: null,
                  componentId: null,
                  technologyType: null,
                  quickAnalysisMode: true
                });
                navigateToTab("diagnose");
              }}
              onAddAsset={() => setShowOnboarding(true)}
            />
          ) : activeTab === "assets" ? (
            <Assets 
              user={user}
              reports={reports} 
              onSelectReport={(report) => setSelectedReport(report)} 
              onStartDiagnosis={handleStartDiagnosis}
              selectedCompanyId={selectedCompanyId}
              setSelectedCompanyId={setSelectedCompanyId}
              subscriptionPlan={companies.find(c => c.id === selectedCompanyId)?.subscription_plan || "vibration_only"}
              onNavigateToMigration={() => {
                navigateToTab("migration");
              }}
              onNavigateToTrends={(assetId) => {
                setTrendsAssetId(assetId);
                navigateToTab("trends");
              }}
            />
          ) : activeTab === "migration" ? (
            <AIDataMigration 
              selectedCompanyId={selectedCompanyId} 
              onNavigateToAssets={() => {
                navigateToTab("assets");
              }}
            />
          ) : activeTab === "analysis" ? (
            <AnalysisReport
              selectedCompanyId={selectedCompanyId}
              onNavigateToCalendar={(asset) =>
                navigateToTab("calendar", {
                  asset: asset || "Boiler Feed Pump A - P-101A"
                })
              }
            />
          ) : activeTab === "rca" ? (
            <RootCauseAnalysis selectedCompanyId={selectedCompanyId} />
          ) : activeTab === "calendar" ? (
            <MaintenanceCalendar
              selectedCompanyId={selectedCompanyId}
              onNavigateToTrends={(assetId) => {
                if (assetId) setTrendsAssetId(assetId);
                navigateToTab("trends");
              }}
            />
          ) : activeTab === "fmea" ? (
            <FMEA selectedCompanyId={selectedCompanyId} />
          ) : activeTab === "diagnose" ? (
            <Diagnose 
              user={user}
              onSaveReport={handleSaveReport} 
              targetContext={targetContext}
              onClearTargetContext={() => setTargetContext(null)}
              selectedCompanyId={selectedCompanyId}
              subscriptionPlan={companies.find(c => c.id === selectedCompanyId)?.subscription_plan || "vibration_only"}
              onNavigateToCalendar={(asset) =>
                navigateToTab("calendar", asset ? { asset } : undefined)
              }
            />
          ) : activeTab === "trends" ? (
            <Trends 
              selectedCompanyId={selectedCompanyId} 
              subscriptionPlan={companies.find(c => c.id === selectedCompanyId)?.subscription_plan || "vibration_only"}
              selectedAssetId={trendsAssetId}
            />
          ) : activeTab === "admin" ? (
            <AdminPanel
              companies={companies}
              onSubscriptionChange={fetchCompanies}
              selectedCompanyId={selectedCompanyId}
            />
          ) : activeTab === "alerts" ? (
            <AlertsControl userId={user?.id || 3} />
          ) : activeTab === "sensors" ? (
            <MountingPlanner />
          ) : (
            <History
              reports={reports}
              onSelectReport={(report) => setSelectedReport(report)}
              onDeleteReport={handleDeleteReport}
              onClearHistory={handleClearHistory}
            />
          )}
          </div>

          {/* Legal Footer — scrolls with main content */}
          <footer className="w-full py-6 mt-8 border-t border-slate-900 text-center text-slate-500 text-[11px] relative z-20" id="app-legal-footer">
            <div className="w-full max-w-full flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="font-sans">© 2026 MotorMedic Pro. All rights reserved.</span>
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setShowLegalDoc("terms")}
                  className="hover:text-yellow-400 hover:underline transition-colors cursor-pointer bg-transparent border-none p-0 outline-none font-sans"
                  id="footer-terms-btn"
                >
                  Terms of Service
                </button>
                <button
                  onClick={() => setShowLegalDoc("privacy")}
                  className="hover:text-yellow-400 hover:underline transition-colors cursor-pointer bg-transparent border-none p-0 outline-none font-sans"
                  id="footer-privacy-btn"
                >
                  Privacy Policy
                </button>
              </div>
            </div>
          </footer>
        </main>
      </div>

      {/* Floating Bottom Navigation for Mobile screens */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0c1220]/95 backdrop-blur-md border-t border-slate-800/80 px-2 py-2.5 flex justify-around items-center">
        <button
          onClick={() => {
            navigateToTab("dashboard");
          }}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-xs font-semibold ${
            activeTab === "dashboard" && !selectedReport ? "text-yellow-400" : "text-slate-400"
          }`}
        >
          <Database className="w-5 h-5" />
          <span className="text-[9px]">Dashboard</span>
        </button>

        <button
          onClick={() => {
            navigateToTab("assets");
          }}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-xs font-semibold ${
            activeTab === "assets" && !selectedReport ? "text-yellow-400" : "text-slate-400"
          }`}
        >
          <Folder className="w-5 h-5" />
          <span className="text-[9px]">Assets</span>
        </button>

        <button
          onClick={() => {
            navigateToTab("diagnose");
          }}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-xs font-semibold ${
            activeTab === "diagnose" && !selectedReport ? "text-yellow-400" : "text-slate-400"
          }`}
        >
          <Wrench className="w-5 h-5" />
          <span className="text-[9px]">Diagnose</span>
        </button>

        <button
          onClick={() => {
            navigateToTab("sensors");
          }}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-xs font-semibold ${
            activeTab === "sensors" && !selectedReport ? "text-yellow-400" : "text-slate-400"
          }`}
        >
          <Compass className="w-5 h-5" />
          <span className="text-[9px]">Mounting</span>
        </button>

        <button
          onClick={() => {
            navigateToTab("trends");
          }}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-xs font-semibold ${
            activeTab === "trends" && !selectedReport ? "text-yellow-400" : "text-slate-400"
          }`}
        >
          <LineChart className="w-5 h-5" />
          <span className="text-[9px]">Trends</span>
        </button>

        <button
          onClick={() => {
            navigateToTab("history");
          }}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-xs font-semibold ${
            activeTab === "history" && !selectedReport ? "text-yellow-400" : "text-slate-400"
          }`}
        >
          <Clock className="w-5 h-5" />
          <span className="text-[9px]">History</span>
        </button>
      </nav>

      {/* Responsive Slide-out Drawer Menu (Hamburger) */}
      {isHamburgerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop Overlay */}
          <div 
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => setIsHamburgerOpen(false)}
          />
          
          {/* Drawer Panel */}
          <div className="relative flex flex-col w-72 max-w-[80vw] h-full bg-[#0d1323] border-r border-slate-800/85 p-6 space-y-6 shadow-2xl overflow-y-auto z-10 transition-transform">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-yellow-400" />
                <span className="font-bold text-white tracking-tight">MotorMedic Pro</span>
              </div>
              <button 
                onClick={() => setIsHamburgerOpen(false)}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1">
              <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wider mb-2 mt-0 px-2">Overview</p>
              <div className="space-y-1.5">
                <AppLink
                  href={TAB_TO_PATH.dashboard}
                  onClick={() => setIsHamburgerOpen(false)}
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === "dashboard" && !selectedReport
                      ? "bg-yellow-400 text-slate-950 shadow font-bold"
                      : "text-slate-300 hover:text-white active:bg-slate-900"
                  }`}
                >
                  <Database className="w-5 h-5 shrink-0" />
                  <span>Health Dashboard</span>
                </AppLink>

                <AppLink
                  href={TAB_TO_PATH.assets}
                  onClick={() => setIsHamburgerOpen(false)}
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === "assets" && !selectedReport
                      ? "bg-yellow-400 text-slate-950 shadow font-bold"
                      : "text-slate-300 hover:text-white active:bg-slate-900"
                  }`}
                >
                  <Folder className="w-5 h-5 shrink-0" />
                  <span>Equipment DB</span>
                </AppLink>
              </div>

              <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wider mb-2 mt-6 px-2">Monitoring & Analytics</p>
              <div className="space-y-1.5">
                {user?.role !== 'mechanic' && (
                  <AppLink
                    href={TAB_TO_PATH.diagnose}
                    onClick={() => setIsHamburgerOpen(false)}
                    className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                      activeTab === "diagnose" && !selectedReport
                        ? "bg-yellow-400 text-slate-950 shadow font-bold"
                        : "text-slate-300 hover:text-white active:bg-slate-900"
                    }`}
                  >
                    <Wrench className="w-5 h-5 shrink-0" />
                    <span>Run Diagnostics</span>
                  </AppLink>
                )}

                {user?.role !== 'mechanic' && (
                  <AppLink
                    href={TAB_TO_PATH.trends}
                    onClick={() => setIsHamburgerOpen(false)}
                    className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                      activeTab === "trends" && !selectedReport
                        ? "bg-yellow-400 text-slate-950 shadow font-bold"
                        : "text-slate-300 hover:text-white active:bg-slate-900"
                    }`}
                  >
                    <LineChart className="w-5 h-5 shrink-0" />
                    <span>Trend Analyzer</span>
                  </AppLink>
                )}

                {user?.role !== 'mechanic' && (
                  <AppLink
                    href={TAB_TO_PATH.sensors}
                    onClick={() => setIsHamburgerOpen(false)}
                    className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                      activeTab === "sensors" && !selectedReport
                        ? "bg-yellow-400 text-slate-950 shadow font-bold"
                        : "text-slate-300 hover:text-white active:bg-slate-900"
                    }`}
                  >
                    <Compass className="w-5 h-5 shrink-0" />
                    <span>Mounting Planner</span>
                  </AppLink>
                )}

                <AppLink
                  href={TAB_TO_PATH.migration}
                  onClick={() => setIsHamburgerOpen(false)}
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === "migration" && !selectedReport
                      ? "bg-yellow-400 text-slate-950 shadow font-bold"
                      : "text-slate-300 hover:text-white active:bg-slate-900"
                  }`}
                >
                  <Sparkles className="w-5 h-5 shrink-0 text-yellow-400" />
                  <span>Automated Data Migration</span>
                </AppLink>
              </div>

              <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wider mb-2 mt-6 px-2">Reliability Engineering</p>
              <div className="space-y-1.5">
                <AppLink
                  href={TAB_TO_PATH.analysis}
                  onClick={() => setIsHamburgerOpen(false)}
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === "analysis" && !selectedReport
                      ? "bg-yellow-400 text-slate-950 shadow font-bold"
                      : "text-slate-300 hover:text-white active:bg-slate-900"
                  }`}
                  id="drawer-analysis-btn"
                >
                  <FileText className="w-5 h-5 shrink-0" />
                  <span>Analysis Reports</span>
                </AppLink>

                <AppLink
                  href={TAB_TO_PATH.rca}
                  onClick={() => setIsHamburgerOpen(false)}
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === "rca" && !selectedReport
                      ? "bg-yellow-400 text-slate-950 shadow font-bold"
                      : "text-slate-300 hover:text-white active:bg-slate-900"
                  }`}
                  id="drawer-rca-btn"
                >
                  <Target className="w-5 h-5 shrink-0" />
                  <span>Root Cause Analysis</span>
                </AppLink>

                <AppLink
                  href={TAB_TO_PATH.fmea}
                  onClick={() => setIsHamburgerOpen(false)}
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === "fmea" && !selectedReport
                      ? "bg-yellow-400 text-slate-950 shadow font-bold"
                      : "text-slate-300 hover:text-white active:bg-slate-900"
                  }`}
                  id="drawer-fmea-btn"
                >
                  <ShieldAlert className="w-5 h-5 shrink-0" />
                  <span>FMEA Analysis</span>
                </AppLink>
              </div>

              <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wider mb-2 mt-6 px-2">Operations & Alerts</p>
              <div className="space-y-1.5">
                <AppLink
                  href={TAB_TO_PATH.calendar}
                  onClick={() => setIsHamburgerOpen(false)}
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === "calendar" && !selectedReport
                      ? "bg-yellow-400 text-slate-950 shadow font-bold"
                      : "text-slate-300 hover:text-white active:bg-slate-900"
                  }`}
                  id="drawer-calendar-btn"
                >
                  <Calendar className="w-5 h-5 shrink-0" />
                  <span>Maintenance Calendar</span>
                </AppLink>

                {user?.role !== 'mechanic' && (
                  <AppLink
                    href={TAB_TO_PATH.alerts}
                    onClick={() => setIsHamburgerOpen(false)}
                    className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                      activeTab === "alerts" && !selectedReport
                        ? "bg-yellow-400 text-slate-950 shadow font-bold"
                        : "text-slate-300 hover:text-white active:bg-slate-900"
                    }`}
                    id="drawer-alerts-btn"
                  >
                    <Bell className="w-5 h-5 shrink-0 animate-pulse" />
                    <span>Alerts Control</span>
                  </AppLink>
                )}

                <AppLink
                  href={TAB_TO_PATH.history}
                  onClick={() => setIsHamburgerOpen(false)}
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === "history" && !selectedReport
                      ? "bg-yellow-400 text-slate-950 shadow font-bold"
                      : "text-slate-300 hover:text-white active:bg-slate-900"
                  }`}
                >
                  <Clock className="w-5 h-5 shrink-0" />
                  <span>Diagnosis Logs</span>
                </AppLink>
              </div>

              {user?.role !== 'mechanic' && (
                <>
                  <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wider mb-2 mt-6 px-2">Administration</p>
                  <div className="space-y-1.5">
                    <AppLink
                      href={TAB_TO_PATH.admin}
                      onClick={() => setIsHamburgerOpen(false)}
                      className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                        activeTab === "admin" && !selectedReport
                          ? "bg-yellow-400 text-slate-950 shadow font-bold"
                          : "text-slate-300 hover:text-white active:bg-slate-900"
                      }`}
                      id="drawer-admin-btn"
                    >
                      <Settings className="w-5 h-5 shrink-0" />
                      <span>Tenant Settings</span>
                    </AppLink>
                  </div>
                </>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800 space-y-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-2">Legal & Policy</p>
              <div className="flex flex-col gap-2 pl-2 text-xs text-slate-300">
                <button
                  onClick={() => {
                    setShowLegalDoc("terms");
                    setIsHamburgerOpen(false);
                  }}
                  className="hover:text-yellow-400 text-left transition-colors cursor-pointer bg-transparent border-none p-0 outline-none font-sans"
                >
                  Terms of Service
                </button>
                <button
                  onClick={() => {
                    setShowLegalDoc("privacy");
                    setIsHamburgerOpen(false);
                  }}
                  className="hover:text-yellow-400 text-left transition-colors cursor-pointer bg-transparent border-none p-0 outline-none font-sans"
                >
                  Privacy Policy
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 text-[10px] text-slate-500 font-mono space-y-1">
              <p>User: <span className="text-emerald-400 font-bold">{user?.username}</span></p>
              <p>Role: {user?.role.toUpperCase()}</p>
            </div>
          </div>
        </div>
      )}

      {showOnboarding && (
        <OnboardingWizard 
          onClose={() => setShowOnboarding(false)} 
          companyId={selectedCompanyId} 
          onSetupComplete={handleOnboardingComplete} 
        />
      )}

      {/* Support Chatbot */}
      <AIChatbot />

    </div>
  );
}
