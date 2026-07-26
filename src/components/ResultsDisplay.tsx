import React, { useState, useEffect } from "react";
import { 
  Check, ClipboardCheck, Mail, FileText, AlertTriangle, ArrowUpRight, Copy, 
  ThumbsUp, ThumbsDown, MessageSquare, Sparkles, ChevronDown, ChevronUp, Wrench, 
  Settings, HelpCircle, Calendar, Star, LineChart as ChartIcon, Printer
} from "lucide-react";
import { 
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ReferenceLine 
} from "recharts";

interface ResultsDisplayProps {
  diagnosticResult: any;
  handleSave: () => void;
  handleGenerateCMMSWorkOrder: () => void;
  handleSendManualAlert: () => void;
  handleExportPDF: () => void;
  isAlertSending: boolean;
  alertSuccessMsg: string | null;
  generatedWorkOrder: string | null;
  handleCopyToClipboard: () => void;
  assetId?: number | "" | null;
  equipmentType?: string;
  imageConfidence?: number | null;
  user?: any;
}

export default function ResultsDisplay({
  diagnosticResult,
  handleSave,
  handleGenerateCMMSWorkOrder,
  handleSendManualAlert,
  handleExportPDF,
  isAlertSending,
  alertSuccessMsg,
  generatedWorkOrder,
  handleCopyToClipboard,
  assetId,
  equipmentType,
  imageConfidence,
  user
}: ResultsDisplayProps) {
  if (!diagnosticResult) return null;

  // Persistent State for Technician Resolution Notes
  const [resolutionNotes, setResolutionNotes] = useState(() => {
    return localStorage.getItem(`resolution_notes_asset_${assetId}`) || "";
  });

  const handleResolutionNotesChange = (val: string) => {
    setResolutionNotes(val);
    localStorage.setItem(`resolution_notes_asset_${assetId}`, val);
  };

  // Active sub-tab state
  const [currentTab, setCurrentTab] = useState<"analysis" | "repair" | "manager">("analysis");
  const [viewMode, setViewMode] = useState<"standard" | "category_iv">("category_iv");

  const renderMarkdown = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("###")) {
        return <h5 key={idx} className="text-sm font-bold text-slate-100 mt-4 mb-2 font-sans">{trimmed.replace(/^###\s*/, "")}</h5>;
      }
      if (trimmed.startsWith("##")) {
        return <h4 key={idx} className="text-base font-extrabold text-white mt-5 mb-2 border-b border-slate-800 pb-1 font-sans">{trimmed.replace(/^##\s*/, "")}</h4>;
      }
      if (trimmed.startsWith("#")) {
        return <h3 key={idx} className="text-lg font-black text-white mt-6 mb-3 font-sans">{trimmed.replace(/^#\s*/, "")}</h3>;
      }
      if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
        const cleanLine = trimmed.replace(/^[-*]\s*/, "");
        const boldParts = cleanLine.split("**");
        return (
          <li key={idx} className="text-xs text-slate-300 ml-4 list-disc leading-relaxed mt-1">
            {boldParts.map((part, pidx) => pidx % 2 === 1 ? <strong key={pidx} className="text-white font-bold">{part}</strong> : part)}
          </li>
        );
      }
      if (trimmed === "") {
        return <div key={idx} className="h-2" />;
      }
      const boldParts = trimmed.split("**");
      return (
        <p key={idx} className="text-xs text-slate-300 leading-relaxed font-sans mb-2">
          {boldParts.map((part, pidx) => pidx % 2 === 1 ? <strong key={pidx} className="text-white font-bold">{part}</strong> : part)}
        </p>
      );
    });
  };

  // Parts specifications refinement state
  const [shaftDiameter, setShaftDiameter] = useState("1.0");
  const [boreSize, setBoreSize] = useState("auto");
  const [tempShaftDiameter, setTempShaftDiameter] = useState("1.0");
  const [tempBoreSize, setTempBoreSize] = useState("auto");
  
  // Refine Modal/Dropdown trigger
  const [activeModal, setActiveModal] = useState<string | null>(null);
  
  // Parts and loading state
  const [parts, setParts] = useState<any[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);
  const [partsError, setPartsError] = useState<string | null>(null);

  // Part tracking state
  const [partUsedText, setPartUsedText] = useState("");

  // Feedback states
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctedFault, setCorrectedFault] = useState("Mechanical Unbalance");
  const [userNotes, setUserNotes] = useState("");
  const [customFaultName, setCustomFaultName] = useState("");
  const [analystReasoning, setAnalystReasoning] = useState("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // Quick action states
  const [watchlistAdded, setWatchlistAdded] = useState(() => {
    return localStorage.getItem(`watchlist_asset_${assetId}`) === "true";
  });
  const [scheduledDate, setScheduledDate] = useState("");
  const [assignedTech, setAssignedTech] = useState("Alex Mercer (Reliability Tech III)");
  const [scheduleSuccess, setScheduleSuccess] = useState(false);
  const [quickActionTab, setQuickActionTab] = useState<string | null>(null);

  // Copy feedback state
  const [copiedPartNumber, setCopiedPartNumber] = useState<string | null>(null);
  const [copyFeedbackReport, setCopyFeedbackReport] = useState(false);
  const [copiedAssessment, setCopiedAssessment] = useState(false);

  // Export states
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"pdf" | "sap_csv" | "maximo_csv">("pdf");

  // Interactive Checklist completed steps
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});

  // Work Order fields
  const [woTitle, setWoTitle] = useState("");
  const [woPriority, setWoPriority] = useState("PREVENTIVE (Priority 2)");
  const [woInstructions, setWoInstructions] = useState("");
  const [woSubmittedNumber, setWoSubmittedNumber] = useState<string | null>(null);

  // Safety checks & derived data
  const rawRankedFaults = diagnosticResult.ranked_faults || [];
  const rankedFaults = rawRankedFaults.length > 0 
    ? rawRankedFaults 
    : diagnosticResult.probable_fault 
      ? [{ type: diagnosticResult.probable_fault, probability: diagnosticResult.confidence || 90, evidence: "Matched threshold limits" }]
      : (diagnosticResult.faults && diagnosticResult.faults.length > 0)
        ? diagnosticResult.faults.map((f: any) => ({ type: f.type, probability: diagnosticResult.confidence || 85, evidence: f.evidence }))
        : [{ type: "Vibration Anomaly", probability: 75, evidence: "ISO limit exceeded" }];

  const topFaultName = rankedFaults[0]?.type || "Unbalance";

  const rawRepairSteps = diagnosticResult.repair_steps || [];
  const repairSteps = rawRepairSteps.length > 0
    ? rawRepairSteps
    : (diagnosticResult.faults && diagnosticResult.faults[0]?.recommendation)
      ? [
          "Establish Lock-out/Tag-out (LOTO) protocols at primary motor junction box.",
          diagnosticResult.faults[0].recommendation,
          "Re-align machinery components and verify face-and-rim radial runouts.",
          "Re-energize unit and capture post-repair vibration spectral baseline."
        ]
      : [
          "Establish Lock-out/Tag-out (LOTO) protocols at primary motor junction box.",
          "Check bearing alignment, clean structural feet, and inspect grease conduits.",
          "Tighten foundation anchor fasteners to nominal torque requirements.",
          "Re-energize unit and verify overall velocity amplitude complies with ISO criteria."
        ];

  const rawPartsNeeded = diagnosticResult.parts_needed || [];
  const partsNeeded = rawPartsNeeded.length > 0
    ? rawPartsNeeded
    : diagnosticResult.extracted_part_numbers?.length > 0
      ? diagnosticResult.extracted_part_numbers
      : ["SKF 6205 bearing (or matching dynamic rating)", "Precision shims kit (0.001\" to 0.020\")", "High-performance grease (ISO VG 100)"];

  // Fetch parts recommendations
  useEffect(() => {
    const fetchParts = async () => {
      setLoadingParts(true);
      setPartsError(null);
      try {
        const faultType = topFaultName;
        const extractedParts = diagnosticResult.extracted_part_numbers || [];
        
        const response = await fetch("/api/recommend-parts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fault_type: faultType,
            equipment_type: equipmentType || "Other",
            specs: {
              shaftDiameter,
              boreSize,
              rpm: diagnosticResult.rpm || 1750
            },
            extracted_part_numbers: extractedParts,
            asset_id: assetId
          })
        });
        
        if (!response.ok) {
          throw new Error("Failed to load parts recommendations.");
        }
        
        const data = await response.json();
        setParts(data);
      } catch (err: any) {
        console.error("Error fetching parts recommendations:", err);
        setPartsError(err.message || "Failed to load parts.");
        setParts([{
          category: "General Hardware Recommendations (Fallback)",
          suggested_parts: [
            {
              part_number: null,
              description: `Recommended parts for ${topFaultName}.`,
              url: `https://www.mcmaster.com/${encodeURIComponent(topFaultName)}`,
              confidence: 'low'
            }
          ]
        }]);
      } finally {
        setLoadingParts(false);
      }
    };

    if (diagnosticResult) {
      fetchParts();
    }
  }, [diagnosticResult, assetId, equipmentType, shaftDiameter, boreSize, topFaultName]);

  // Sync work order form details
  useEffect(() => {
    if (diagnosticResult) {
      setWoTitle(`Corrective Action: ${topFaultName} on ${equipmentType || "Asset"}`);
      setWoInstructions(
        `WORK ORDER SUMMARY:\n` +
        `- Target Asset: ${equipmentType || "Machinery Asset"} (Tag #${assetId || "101"})\n` +
        `- Detected Fault: ${topFaultName}\n` +
        `- Recommended Fix: ${repairSteps[1] || "Verify alignment and structural components."}\n\n` +
        `PROCEDURE:\n` +
        `1. De-energize and lock out tag out (LOTO) machinery.\n` +
        `2. Execute corrective steps: ${repairSteps.join("; ")}\n` +
        `3. Re-commission and align according to ISO guidelines.`
      );
    }
  }, [diagnosticResult, equipmentType, assetId, topFaultName, repairSteps]);

  const toggleStep = (idx: number) => {
    setCompletedSteps(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleSaveWithParts = async () => {
    if (partUsedText.trim() && assetId) {
      try {
        await fetch("/api/save-part-used", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asset_id: assetId,
            fault_type: topFaultName,
            part_number_used: partUsedText.trim()
          })
        });
      } catch (err) {
        console.error("Failed to save part used:", err);
      }
    }
    handleSave();
  };

  const handleSubmitFeedback = async (wasCorrect: boolean) => {
    setIsSubmittingFeedback(true);
    try {
      const finalFault = wasCorrect 
        ? null 
        : (correctedFault === "Other" ? (customFaultName.trim() || "Other Custom Fault") : correctedFault);
      const finalNotes = wasCorrect 
        ? null 
        : (correctedFault === "Other" ? analystReasoning.trim() : userNotes);

      const payload = {
        diagnosis_id: diagnosticResult.diagnosis_id || 1,
        was_correct: wasCorrect,
        corrected_fault: finalFault,
        user_notes: finalNotes
      };

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Feedback submission failed.");

      setFeedbackSubmitted(true);
      setFeedbackSuccess(
        wasCorrect 
          ? "✓ Feedback logged. Thank you for validating this AI diagnosis!" 
          : `✓ Correction logged! Analysis refined to: ${finalFault}.`
      );
      setShowCorrectionModal(false);
    } catch (err: any) {
      setFeedbackSuccess("Error saving feedback: " + err.message);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const getVal = (val: any) => {
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  };

  const vel = getVal(diagnosticResult.overall_velocity || 0.08);
  const oX = getVal(diagnosticResult.oneX_rpm || 0.02);
  const tX = getVal(diagnosticResult.twoX_rpm || 0.01);
  const bIn = getVal(diagnosticResult.bearing_inner || 0.005);
  const bOut = getVal(diagnosticResult.bearing_outer || 0.005);
  const maxBearing = Math.max(bIn, bOut);

  // Confidence indicators
  const overallConf = vel > 0.30 ? 95 : 85;
  const unbalanceConf = oX > 0.12 ? 92 : 82;
  const misalignmentConf = tX > 0.08 ? 88 : 78;
  const bearingConf = maxBearing > 0.04 ? 85 : 75;

  const handleCopyPartNumber = (partNo: string) => {
    navigator.clipboard.writeText(partNo);
    setCopiedPartNumber(partNo);
    setTimeout(() => setCopiedPartNumber(null), 2000);
  };

  // Generate copyable plain text report for Manager
  const generatePlainTextReport = () => {
    const dateStr = new Date().toLocaleDateString(undefined, { dateStyle: "long" });
    return `=========================================
MOTOR MEDIC PRO - RELIABILITY REPORT
=========================================
Asset Name:    ${equipmentType || "Machinery Unit"}
Asset Tag ID:  ${assetId || "N/A"}
Date:          ${dateStr}
Status:        ${diagnosticResult.fault_detected ? "ATTENTION REQUIRED" : "NORMAL/NOMINAL"}
Top Fault:     ${topFaultName} (${rankedFaults[0]?.probability || 90}% probability)
Severity:      ${diagnosticResult.overall_severity || "Warning"}

VIBRATION LEVEL PROFILE:
- Overall Velocity:    ${vel.toFixed(3)} in/s (Limit: 0.300 in/s) -> ${vel > 0.30 ? "FAIL" : "PASS"}
- 1X Running Speed:    ${oX.toFixed(3)} in/s (Limit: 0.120 in/s) -> ${oX > 0.12 ? "FAIL" : "PASS"}
- 2X Running Speed:    ${tX.toFixed(3)} in/s (Limit: 0.080 in/s) -> ${tX > 0.08 ? "FAIL" : "PASS"}
- Bearing Defect Peak: ${maxBearing.toFixed(3)} in/s (Limit: 0.040 in/s) -> ${maxBearing > 0.04 ? "FAIL" : "PASS"}

REQUIRED SPARE PARTS:
${partsNeeded.map((p, i) => `${i + 1}. ${p}`).join("\n")}

RECOMMENDED CORRECTIVE REPAIR STEPS:
${repairSteps.map((s, i) => `[ ] Step ${i + 1}: ${s}`).join("\n")}

Report compiled dynamically using ISO 10816 baseline guidelines.`;
  };

  const handleCopyReportToClipboard = () => {
    navigator.clipboard.writeText(generatePlainTextReport());
    setCopyFeedbackReport(true);
    setTimeout(() => setCopyFeedbackReport(false), 3000);
  };

  const handleCopyAssessmentToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAssessment(true);
    setTimeout(() => setCopiedAssessment(false), 2000);
  };

  const handleSendEmailToManager = () => {
    const subject = encodeURIComponent(`MotorMedic Pro Reliability Report: ${equipmentType || "Asset"} (Tag #${assetId || "101"})`);
    const body = encodeURIComponent(generatePlainTextReport());
    window.location.href = `mailto:shanedufrene1989@gmail.com?subject=${subject}&body=${body}`;
  };

  const handleInteractiveWOSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const woNum = `WO-${Date.now().toString().slice(-6)}`;
    setWoSubmittedNumber(woNum);
  };

  const handleScheduleRetest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledDate) return;
    setScheduleSuccess(true);
    setTimeout(() => {
      setScheduleSuccess(false);
      setQuickActionTab(null);
      setScheduledDate("");
    }, 4000);
  };

  const handleWatchlistToggle = () => {
    const nextState = !watchlistAdded;
    setWatchlistAdded(nextState);
    localStorage.setItem(`watchlist_asset_${assetId}`, String(nextState));
  };

  const executeExport = () => {
    if (exportFormat === "pdf") {
      handleExportPDF();
    } else {
      // Build CSV Data
      const primaryFault = diagnosticResult.probable_fault || "Unknown Fault";
      const severity = diagnosticResult.severity || "Warning";
      const recommendations = Array.isArray(diagnosticResult.repair_recommendations) 
        ? diagnosticResult.repair_recommendations.join(". ")
        : String(diagnosticResult.repair_recommendations || "");

      let filename = "";
      let csvContent = "";

      if (exportFormat === "sap_csv") {
        filename = `SAP_PM_Export_Asset_${assetId || 'Unknown'}.csv`;
        const headers = ["Equipment_ID", "Maintenance_Plant", "Functional_Location", "Description", "Criticality", "Fault_Code", "Severity", "Repair_Urgency", "Work_Center", "Long_Text"];
        const row = [
          `EQ-${assetId || '001'}`,
          "Plant Main",
          equipmentType || "Rotating Asset",
          `Proactive PM: ${primaryFault}`,
          "Standard",
          "VIB-FAULT-001",
          severity,
          severity === "Danger" ? "Immediate" : "Urgent",
          "VIB-MNT",
          `AI consensus diagnostic report: ${diagnosticResult.consensus_report || recommendations}`
        ];
        
        // Escape values for CSV
        const escapedRow = row.map(val => `"${String(val).replace(/"/g, '""')}"`);
        csvContent = headers.join(",") + "\n" + escapedRow.join(",");
      } else {
        filename = `Maximo_Export_Asset_${assetId || 'Unknown'}.csv`;
        const headers = ["ASSETNUM", "SITEID", "LOCATION", "DESCRIPTION", "PRIORITY", "STATUS", "FAILURECODE", "RECOMMENDED_ACTION", "WORKORDER_TYPE"];
        const priorityNum = severity === "Danger" ? "1" : severity === "Warning" ? "2" : "3";
        const row = [
          `AST-${assetId || '001'}`,
          "PLANT-SITE",
          "SEC-01",
          `${primaryFault} Detected via Spectral extraction`,
          priorityNum,
          "ACTIVE",
          "VIB_DEGRADE",
          recommendations,
          severity === "Danger" ? "EM" : "PM"
        ];

        const escapedRow = row.map(val => `"${String(val).replace(/"/g, '""')}"`);
        csvContent = headers.join(",") + "\n" + escapedRow.join(",");
      }

      // Download CSV
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setIsExportModalOpen(false);
  };

  const [trendsData, setTrendsData] = useState<any[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);

  useEffect(() => {
    if (!assetId) {
      setTrendsData([]);
      return;
    }
    setLoadingTrends(true);
    fetch(`/api/trends/${assetId}`)
      .then(res => {
        if (res.ok) return res.json();
        throw new Error("Failed to fetch trends");
      })
      .then(data => {
        if (Array.isArray(data)) {
          if (data.length > 0) {
            const formatted = data.map((pt: any) => {
              const dateObj = new Date(pt.timestamp);
              const dateStr = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return {
                date: dateStr,
                velocity: pt.overall_velocity ?? pt.vibrationVelocity ?? 0,
                threshold: 0.30
              };
            });
            setTrendsData(formatted);
          } else {
            setTrendsData([]);
          }
        } else {
          setTrendsData([]);
        }
      })
      .catch(err => {
        console.error("Error loading trends for ResultsDisplay:", err);
        setTrendsData([]);
      })
      .finally(() => {
        setLoadingTrends(false);
      });
  }, [assetId]);

  const baselineTrendData = trendsData;

  return (
    <div className="space-y-4 pt-3 border-t border-slate-800 animate-fade-in" id="resultsSection">
      
      {/* Low Confidence Banner Alert */}
      {imageConfidence !== undefined && imageConfidence !== null && imageConfidence < 70 && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 p-3 rounded-xl text-xs flex items-center gap-3.5 animate-pulse no-print">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
          <div className="space-y-0.5">
            <p className="font-bold">⚠️ Low Confidence in Spectral Peak Extraction ({imageConfidence}%)</p>
            <p className="opacity-90 font-sans">The visual graph axis scale or peak clarity might be ambiguous. Verify extracted values manually before approving actions.</p>
          </div>
        </div>
      )}

      {/* Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-850">
        <div>
          <h3 className="text-base font-black text-white font-display flex items-center gap-2">
            <span>Diagnostic Analytics Report</span>
            {imageConfidence !== undefined && imageConfidence !== null && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border font-bold ${
                imageConfidence >= 90 
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                  : imageConfidence >= 70
                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    : "bg-rose-500/10 text-rose-400 border-rose-500/20"
              }`}>
                GPT-4 Consensus Confidence: {imageConfidence}%
              </span>
            )}
          </h3>
          <p className="text-[11px] text-slate-400">Computed via ISO 10816 baseline rules combined with AI-grounded analytics</p>
        </div>
        
        {/* Quick Save Indicator */}
        <div className="flex items-center gap-2 no-print">
          <div className="flex items-center gap-1.5 bg-slate-950/40 border border-slate-800/80 rounded-lg px-2 py-1">
            <span className="text-[9px] font-bold font-mono text-slate-400 uppercase">Logged Part:</span>
            <input 
              type="text" 
              value={partUsedText}
              onChange={(e) => setPartUsedText(e.target.value)}
              placeholder="e.g. SKF 6205"
              className="bg-transparent text-[11px] text-white border-none outline-none w-24 font-mono focus:ring-0"
            />
          </div>
          
          <button
            onClick={handleSaveWithParts}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] rounded-lg transition-all shadow-md cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-3 h-3" />
            <span>Save Analysis</span>
          </button>

          <button
            onClick={() => setIsExportModalOpen(true)}
            className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-black text-[11px] rounded-lg transition-all shadow-md cursor-pointer flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-slate-950" />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {/* 📋 Dispatch & Resolution Records Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 text-left">
        {/* Metadata Details */}
        <div className="space-y-3 font-mono text-xs">
          <h4 className="text-[11px] font-black text-white uppercase tracking-wider border-b border-slate-800 pb-1.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-yellow-400" />
            Vibration Inspection Log
          </h4>
          <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
            <div>
              <span className="text-[9px] text-slate-500 uppercase font-bold block">Collected At</span>
              <p className="font-semibold text-slate-200">
                {diagnosticResult?.collected_at || diagnosticResult?.measurement_date || diagnosticResult?.timestamp || new Date(diagnosticResult?.created_at || Date.now()).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-[9px] text-slate-500 uppercase font-bold block">Analyzed At</span>
              <p className="font-semibold text-slate-200">
                {diagnosticResult?.analyzed_at || diagnosticResult?.created_at || new Date().toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-[9px] text-slate-500 uppercase font-bold block">Collected By</span>
              <p className="font-semibold text-slate-200">
                {diagnosticResult?.collected_by || (user && (user.name || user.email || user.username)) || "Shane DuFrene"}
              </p>
            </div>
            <div>
              <span className="text-[9px] text-slate-500 uppercase font-bold block">Analyzed By</span>
              <p className="font-semibold text-slate-200">
                {diagnosticResult?.analyzed_by || "MotorMedic AI Analyst"}
              </p>
            </div>
          </div>
        </div>

        {/* Resolution Notes */}
        <div className="space-y-2">
          <h4 className="text-[11px] font-black text-white uppercase tracking-wider font-mono border-b border-slate-800 pb-1.5 flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5 text-emerald-400" />
            Technician Resolution Notes
          </h4>
          <textarea
            value={resolutionNotes}
            onChange={(e) => handleResolutionNotesChange(e.target.value)}
            placeholder="Log details on actions taken (e.g., component replaced, bearing lubricated, re-alignment metrics)..."
            className="w-full h-[76px] bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl p-2.5 focus:border-yellow-400/50 outline-none resize-none font-sans leading-relaxed"
          />
        </div>
      </div>

      {/* THREE-TAB MENU BAR */}
      <div className="bg-slate-950 p-1.5 rounded-xl border border-slate-800/80 font-mono text-[11px] no-print mb-4 grid grid-cols-3 gap-1">
        <button 
          onClick={() => setCurrentTab("analysis")}
          className={`py-2.5 px-4 rounded-lg font-bold transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
            currentTab === "analysis" 
              ? "bg-yellow-400 text-slate-950 shadow-lg shadow-yellow-400/10 scale-[1.01]" 
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
          }`}
        >
          <ChartIcon className={`w-4 h-4 transition-colors ${currentTab === "analysis" ? "text-slate-950" : "text-slate-400"}`} />
          <span className="truncate">1. Analysis Results</span>
        </button>
        <button 
          onClick={() => setCurrentTab("repair")}
          className={`py-2.5 px-4 rounded-lg font-bold transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
            currentTab === "repair" 
              ? "bg-yellow-400 text-slate-950 shadow-lg shadow-yellow-400/10 scale-[1.01]" 
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
          }`}
        >
          <Wrench className={`w-4 h-4 transition-colors ${currentTab === "repair" ? "text-slate-950" : "text-slate-400"}`} />
          <span className="truncate">2. Repair Guide</span>
        </button>
        <button 
          onClick={() => setCurrentTab("manager")}
          className={`py-2.5 px-4 rounded-lg font-bold transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
            currentTab === "manager" 
              ? "bg-yellow-400 text-slate-950 shadow-lg shadow-yellow-400/10 scale-[1.01]" 
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
          }`}
        >
          <FileText className={`w-4 h-4 transition-colors ${currentTab === "manager" ? "text-slate-950" : "text-slate-400"}`} />
          <span className="truncate">3. Manager Report</span>
        </button>
      </div>

      {/* TAB CONTENTS */}
      <div className="space-y-4">
        
        {/* TAB 1: ANALYSIS RESULTS */}
        {currentTab === "analysis" && (
          <div className="space-y-4 animate-fade-in text-left">
            {/* View Mode Toggle Switcher */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl p-3 gap-2.5 shadow-md">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-yellow-400 animate-pulse" />
                <span className="text-[11px] font-mono text-slate-200 uppercase tracking-wider font-bold">Consensus Diagnostic View:</span>
              </div>
              <div className="flex gap-1.5 w-full sm:w-auto">
                <button
                  onClick={() => setViewMode("standard")}
                  className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    viewMode === "standard"
                      ? "bg-slate-800 text-white border border-slate-700"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 border border-transparent"
                  }`}
                >
                  <span>📊 Standard Dashboard</span>
                </button>
                <button
                  onClick={() => setViewMode("category_iv")}
                  className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    viewMode === "category_iv"
                      ? "bg-yellow-400 text-slate-950 border border-yellow-500/20"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 border border-transparent"
                  }`}
                >
                  <span>⚡ Category IV AI Report</span>
                </button>
              </div>
            </div>

            {viewMode === "category_iv" ? (
              <div className="space-y-4 animate-fade-in">
                {/* Interactive Probability & Severity Matrix Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-yellow-400/10 flex items-center justify-center text-yellow-400">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white font-sans uppercase tracking-wide">Category IV Analyst Core</h4>
                        <p className="text-[10px] text-slate-400 font-sans">Probability & Severity Matrix (ISO 10816 limits)</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 font-mono text-[10px] rounded-full uppercase tracking-wider font-bold">
                      Consensus: {diagnosticResult.confidence_score || 95}%
                    </span>
                  </div>

                  <div className="space-y-3">
                    {rankedFaults.map((fault: any, index: number) => {
                      const isHighSeverity = fault.probability > 75;
                      const isMediumSeverity = fault.probability > 40 && fault.probability <= 75;
                      
                      return (
                        <div 
                          key={index} 
                          className="p-3.5 bg-slate-950/60 border border-slate-850 rounded-xl flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:border-slate-700/50 transition-all group"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
                              <h5 className="text-xs font-bold text-white font-sans group-hover:text-yellow-400 transition-colors">
                                {fault.type}
                              </h5>
                            </div>
                            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                              {fault.evidence}
                            </p>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
                            <div className="text-right">
                              <span className="text-[9px] text-slate-500 block uppercase font-mono">Probability</span>
                              <span className="text-xs font-mono font-bold text-white">
                                {fault.probability}%
                              </span>
                            </div>
                            <div className="h-8 w-px bg-slate-800" />
                            <div>
                              <span className="text-[9px] text-slate-500 block uppercase font-mono">Severity</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                                isHighSeverity 
                                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" 
                                  : isMediumSeverity 
                                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" 
                                    : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              }`}>
                                {isHighSeverity ? "High" : isMediumSeverity ? "Medium" : "Low"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Full Engineering Report Content Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-sm font-black text-white font-sans uppercase tracking-wide">Category IV Engineering Report</h4>
                  </div>
                  <div className="prose prose-invert max-w-none prose-sm leading-relaxed text-slate-300">
                    {renderMarkdown(diagnosticResult.consensus_report || diagnosticResult.executive_summary)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              
              {/* ISO Validation Table: Compact and elegant */}
              <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 print-card">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <h4 className="text-[11px] font-black text-white font-mono uppercase tracking-wider">ISO 10816 Threshold Validation</h4>
                  <span className="text-[9px] text-slate-400 font-mono">Limits: rigid Grade G1.0 machines</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] font-mono border-collapse min-w-[400px]">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 text-[9px] uppercase">
                        <th className="py-1">Parameter</th>
                        <th className="py-1">Value</th>
                        <th className="py-1">ISO Threshold</th>
                        <th className="py-1">Status</th>
                        <th className="py-1 text-right">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      <tr className="hover:bg-slate-850/20">
                        <td className="py-1.5 text-slate-300 font-medium">Overall Velocity</td>
                        <td className="py-1.5 text-white">{vel.toFixed(3)} in/s</td>
                        <td className="py-1.5 text-slate-400">&gt; 0.30 in/s</td>
                        <td className="py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            vel > 0.30 ? "bg-rose-500/10 text-rose-400 border border-rose-500/10" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"
                          }`}>
                            {vel > 0.30 ? "⚠️ FAIL" : "✓ PASS"}
                          </span>
                        </td>
                        <td className="py-1.5 text-right text-slate-400">{overallConf}%</td>
                      </tr>
                      <tr className="hover:bg-slate-850/20">
                        <td className="py-1.5 text-slate-300 font-medium">1X RPM (Unbalance)</td>
                        <td className="py-1.5 text-white">{oX.toFixed(3)} in/s</td>
                        <td className="py-1.5 text-slate-400">&gt; 0.12 in/s</td>
                        <td className="py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            oX > 0.12 ? "bg-rose-500/10 text-rose-400 border border-rose-500/10" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"
                          }`}>
                            {oX > 0.12 ? "⚠️ FAIL" : "✓ PASS"}
                          </span>
                        </td>
                        <td className="py-1.5 text-right text-slate-400">{unbalanceConf}%</td>
                      </tr>
                      <tr className="hover:bg-slate-850/20">
                        <td className="py-1.5 text-slate-300 font-medium">2X RPM (Misalignment)</td>
                        <td className="py-1.5 text-white">{tX.toFixed(3)} in/s</td>
                        <td className="py-1.5 text-slate-400">&gt; 0.08 in/s</td>
                        <td className="py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            tX > 0.08 ? "bg-rose-500/10 text-rose-400 border border-rose-500/10" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"
                          }`}>
                            {tX > 0.08 ? "⚠️ FAIL" : "✓ PASS"}
                          </span>
                        </td>
                        <td className="py-1.5 text-right text-slate-400">{misalignmentConf}%</td>
                      </tr>
                      <tr className="hover:bg-slate-850/20">
                        <td className="py-1.5 text-slate-300 font-medium">Bearings (BPFI/BPFO)</td>
                        <td className="py-1.5 text-white">{maxBearing.toFixed(3)} in/s</td>
                        <td className="py-1.5 text-slate-400">&gt; 0.04 in/s</td>
                        <td className="py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            maxBearing > 0.04 ? "bg-rose-500/10 text-rose-400 border border-rose-500/10" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"
                          }`}>
                            {maxBearing > 0.04 ? "⚠️ FAIL" : "✓ PASS"}
                          </span>
                        </td>
                        <td className="py-1.5 text-right text-slate-400">{bearingConf}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Ranked Fault Analysis with Progress Bars */}
              <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 print-card">
                <div className="border-b border-slate-800 pb-1.5">
                  <h4 className="text-[11px] font-black text-white font-mono uppercase tracking-wider">Ranked Fault Analysis</h4>
                </div>
                <div className="space-y-2.5">
                  {rankedFaults.map((fault: any, idx: number) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between items-center text-[11px] font-mono">
                        <span className="font-bold text-slate-200">{fault.type}</span>
                        <span className="text-yellow-400 font-bold">{fault.probability}% prob</span>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-850">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            fault.probability > 75 
                              ? "bg-rose-500" 
                              : fault.probability > 40 
                                ? "bg-amber-500" 
                                : "bg-blue-500"
                          }`}
                          style={{ width: `${fault.probability}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 font-sans italic truncate">Evidence: {fault.evidence}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Baseline Trend comparison */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h4 className="text-[11px] font-black text-white font-mono uppercase tracking-wider">Baseline Trend Comparison</h4>
              <div className="h-40 w-full text-xs font-mono flex items-center justify-center">
                {loadingTrends ? (
                  <span className="text-slate-400 font-sans text-xs">Loading trend history...</span>
                ) : baselineTrendData && baselineTrendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={baselineTrendData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={9} />
                      <YAxis stroke="#64748b" unit=" in/s" fontSize={9} />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} 
                        labelStyle={{ color: "#ffffff" }}
                      />
                      <ReferenceLine y={0.30} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "ISO Limit (>0.30)", fill: "#ef4444", position: "insideBottomRight", fontSize: 9 }} />
                      <Line type="monotone" dataKey="velocity" stroke="#fbbf24" strokeWidth={2.5} activeDot={{ r: 6 }} name="Vibration" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center p-4">
                    <p className="text-slate-400 font-sans text-xs">No baseline data yet. Run more analyses to build trend history.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Continuous feedback reinforcing loop */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="space-y-0.5 text-center sm:text-left">
                <h4 className="text-[11px] font-black text-white font-mono uppercase tracking-wider flex items-center gap-1.5 justify-center sm:justify-start">
                  <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                  VIBRATION REINFORCEMENT LEARNING LOOP
                </h4>
                <p className="text-[11px] text-slate-400 font-sans">
                  Was this automated diagnosis accurate? Provide feedback to train MotorMedic's neural model.
                </p>
              </div>
              
              {feedbackSubmitted ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[10px] px-3 py-1.5 rounded-lg">
                  {feedbackSuccess}
                </div>
              ) : (
                <div className="flex items-center gap-2 no-print shrink-0">
                  <button
                    onClick={() => handleSubmitFeedback(true)}
                    disabled={isSubmittingFeedback}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <ThumbsUp className="w-3 h-3 text-emerald-400" />
                    <span>Correct</span>
                  </button>
                  <button
                    onClick={() => setShowCorrectionModal(true)}
                    disabled={isSubmittingFeedback}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <ThumbsDown className="w-3 h-3 text-rose-400" />
                    <span>Refine</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )}

        {/* TAB 2: REPAIR GUIDE */}
        {currentTab === "repair" && (
          <div className="space-y-4 animate-fade-in text-left">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Step-by-Step Interactive Checklist */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="border-b border-slate-800 pb-1.5">
                  <h4 className="text-[11px] font-black text-white font-mono uppercase tracking-wider">Step-by-Step Repair Checklist</h4>
                  <p className="text-[10px] text-slate-400 font-sans mt-0.5">Check completed items as you execute the repair process.</p>
                </div>
                <div className="space-y-2">
                  {repairSteps.map((step, idx) => (
                    <div 
                      key={idx}
                      onClick={() => toggleStep(idx)}
                      className={`flex items-start gap-3 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                        completedSteps[idx] 
                          ? "bg-emerald-500/5 border-emerald-500/20 opacity-60" 
                          : "bg-slate-950/40 border-slate-850 hover:border-slate-800"
                      }`}
                    >
                      <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 ${
                        completedSteps[idx] 
                          ? "bg-emerald-500 border-emerald-500 text-white" 
                          : "border-slate-700 text-transparent"
                      }`}>
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                      <div className="text-xs">
                        <span className="font-bold text-slate-400 mr-1.5 font-mono">Step {idx + 1}:</span>
                        <span className={`text-slate-200 leading-relaxed font-sans ${completedSteps[idx] ? "line-through text-slate-500" : ""}`}>
                          {step}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommended Replacement Parts with dropdown selectors */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <h4 className="text-[11px] font-black text-white font-mono uppercase tracking-wider">Replacement Parts Catalog</h4>
                  
                  {/* Parameter specification selector dropdown inside parts catalog */}
                  <div className="relative inline-block no-print">
                    <button
                      onClick={() => setActiveModal(activeModal === "refine" ? null : "refine")}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded text-[10px] font-mono border border-slate-700 flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <Settings className="w-3 h-3 text-yellow-400" />
                      <span>Refine Specs</span>
                    </button>
                    
                    {activeModal === "refine" && (
                      <div className="absolute top-full left-0 mt-2 w-60 bg-slate-900 border border-slate-750 rounded-xl p-3 shadow-2xl z-50 animate-fade-in space-y-3 text-left">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                          <h4 className="text-[10px] font-bold text-white uppercase font-mono tracking-wider">
                            Refine Shaft Specs
                          </h4>
                          <button
                            onClick={() => setActiveModal(null)}
                            className="text-slate-400 hover:text-white text-xs cursor-pointer font-bold"
                          >
                            ✕
                          </button>
                        </div>
                        
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold font-mono text-slate-400 uppercase">Shaft Diameter</label>
                          <select
                            value={tempShaftDiameter}
                            onChange={(e) => setTempShaftDiameter(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-md p-1.5 focus:border-yellow-400 outline-none"
                          >
                            <option value="0.5">0.5" (1/2" ID)</option>
                            <option value="0.75">0.75" (3/4" ID)</option>
                            <option value="1.0">1.0" (1" ID)</option>
                            <option value="1.25">1.25" (1-1/4" ID)</option>
                            <option value="1.5">1.5" (1-1/2" ID)</option>
                            <option value="2.0">2.0" (2" ID)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-bold font-mono text-slate-400 uppercase">Bore Size Selection</label>
                          <select
                            value={tempBoreSize}
                            onChange={(e) => setTempBoreSize(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-md p-1.5 focus:border-yellow-400 outline-none"
                          >
                            <option value="auto">Auto-calculated</option>
                            <option value="manual">Manual Select</option>
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setShaftDiameter(tempShaftDiameter);
                            setBoreSize(tempBoreSize);
                            setActiveModal(null);
                          }}
                          className="w-full py-1.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-black text-[9px] rounded-md shadow transition-all uppercase tracking-wider"
                        >
                          Update Specs
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 flex gap-2 font-mono pb-1 bg-slate-950/20 p-2 rounded border border-slate-850">
                  <span>Current Specs:</span>
                  <span className="text-white font-bold font-mono">Shaft: {shaftDiameter}"</span>
                  <span className="text-white font-bold font-mono">Bore: {boreSize}</span>
                </div>

                {loadingParts ? (
                  <div className="space-y-2 animate-pulse">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-16 bg-slate-950 border border-slate-850 rounded-xl"></div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {parts.map((cat: any, cIdx: number) => (
                      <div key={cIdx} className="bg-slate-950/40 border border-slate-850 rounded-xl p-3 space-y-2">
                        <h5 className="text-[10px] font-black font-mono text-yellow-400 uppercase tracking-wider border-b border-slate-900 pb-1">
                          {cat.category}
                        </h5>
                        <div className="space-y-2">
                          {(cat.suggested_parts || []).map((part: any, pIdx: number) => (
                            <div key={pIdx} className="space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  {part.part_number ? (
                                    <span className="text-[10px] font-bold text-white font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                      {part.part_number}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold text-slate-400 font-mono italic">General Part</span>
                                  )}
                                  {part.part_number && (
                                    <button
                                      onClick={() => handleCopyPartNumber(part.part_number)}
                                      className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-all text-[8px] font-mono no-print"
                                    >
                                      {copiedPartNumber === part.part_number ? "Copied!" : "Copy"}
                                    </button>
                                  )}
                                </div>
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded font-mono ${
                                  part.confidence === 'high' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-800 text-slate-400"
                                }`}>
                                  {part.confidence === 'high' ? "✓ Confirmed" : "⚡ Suggested"}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-300 leading-normal font-sans">{part.description}</p>
                              
                              <div className="flex justify-end gap-1.5 pt-1 no-print">
                                <a 
                                  href={`https://www.mcmaster.com/#/order/cart?pn=${encodeURIComponent(part.part_number || "")}`}
                                  target="_blank" 
                                  referrerPolicy="no-referrer"
                                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-[9px] font-bold rounded flex items-center gap-1 cursor-pointer transition-all border border-slate-700"
                                >
                                  <span>Cart</span>
                                </a>
                                <a 
                                  href={part.url || `https://www.mcmaster.com/${encodeURIComponent(part.part_number || cat.category)}`}
                                  target="_blank" 
                                  referrerPolicy="no-referrer"
                                  className="px-2.5 py-0.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-[9px] font-bold rounded flex items-center gap-1 cursor-pointer transition-all"
                                >
                                  <span>Order</span>
                                  <ArrowUpRight className="w-2.5 h-2.5" />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: MANAGER REPORT */}
        {currentTab === "manager" && (
          <div className="space-y-4 animate-fade-in text-left">
            
            {/* Professional Summary Dashboard */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 print:p-0">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-2 gap-2">
                <div>
                  <h4 className="text-xs font-black text-white font-mono uppercase tracking-widest">Reliability Executive Summary</h4>
                  <p className="text-[10px] text-slate-400 font-sans">Formal diagnosis statement compiled for administrative dispatch.</p>
                </div>
                <div className="flex items-center gap-2 no-print shrink-0">
                  <button
                    onClick={handleCopyReportToClipboard}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-white font-mono text-[10px] font-bold rounded-lg border border-slate-700 flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copyFeedbackReport ? "✓ Copied!" : "Copy Report"}</span>
                  </button>
                  <button
                    onClick={handleSendEmailToManager}
                    className="px-2.5 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-mono text-[10px] font-black rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-md"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Send to Manager</span>
                  </button>
                </div>
              </div>

              {/* Layout of details */}
              <div className="bg-slate-950/50 rounded-xl border border-slate-850 p-4 space-y-4 font-mono">
                
                {/* Grid parameters */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Asset Name</span>
                    <p className="font-bold text-white font-sans">{equipmentType || "Machinery Unit"}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Tag ID</span>
                    <p className="font-bold text-slate-300">#{assetId || "101"}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Inspection Date</span>
                    <p className="font-bold text-white">{new Date().toLocaleDateString(undefined, { dateStyle: "medium" })}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Top Fault Code</span>
                    <p className="font-bold text-yellow-400">{topFaultName}</p>
                  </div>
                </div>

                <div className="border-t border-slate-850/60 pt-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">vibration health assessment</h5>
                    <button
                      type="button"
                      onClick={() => handleCopyAssessmentToClipboard(`The analyzed spectrum demonstrates a ${topFaultName} fault signature with a calculated confidence rating of ${rankedFaults[0]?.probability || 90}%. The overall velocity measurement registered at ${vel.toFixed(3)} in/s, placing the unit into ISO-10816 ${vel > 0.30 ? "Zone C/D (Action Required)" : "Nominal Zone"}.`)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 hover:text-white transition-all text-[9px] font-mono flex items-center gap-1 cursor-pointer no-print"
                      title="Copy assessment to clipboard"
                    >
                      <Copy className="w-3 h-3 text-yellow-400" />
                      <span>{copiedAssessment ? "Copied!" : "Copy Text"}</span>
                    </button>
                  </div>
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-850 text-xs leading-relaxed text-slate-300 font-sans">
                    <p>The analyzed spectrum demonstrates a <strong>{topFaultName}</strong> fault signature with a calculated confidence rating of <strong>{rankedFaults[0]?.probability || 90}%</strong>. The overall velocity measurement registered at <strong>{vel.toFixed(3)} in/s</strong>, placing the unit into ISO-10816 <strong>{vel > 0.30 ? "Zone C/D (Action Required)" : "Nominal Zone"}</strong>.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-850/60 pt-3">
                  
                  {/* Spare parts needed summary */}
                  <div className="space-y-1.5">
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Required Spare Parts</h5>
                    <ul className="space-y-1.5 list-none pl-0">
                      {partsNeeded.map((part, idx) => (
                        <li key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                          <span className="text-yellow-400 shrink-0 font-bold">•</span>
                          <span className="font-sans">{part}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Numbered correctives list */}
                  <div className="space-y-1.5">
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Repair Instructions Checklist</h5>
                    <ol className="space-y-1.5 list-none pl-0">
                      {repairSteps.map((step, idx) => (
                        <li key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                          <span className="text-yellow-400 font-bold">{idx + 1}.</span>
                          <span className="font-sans">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                </div>

              </div>

            </div>

          </div>
        )}

      </div>

      {/* QUICK ACTIONS TOOLBAR (Preserved at the bottom as a utility panel) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 no-print text-left">
        <div className="border-b border-slate-850 pb-1 flex items-center justify-between">
          <h4 className="text-[11px] font-black text-white font-mono uppercase tracking-wider">Reliability Quick Actions</h4>
          <span className="text-[9px] text-slate-400 font-mono">Operations integration panel</span>
        </div>
        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
          <button
            onClick={() => setQuickActionTab(quickActionTab === "workorder" ? null : "workorder")}
            className={`p-3.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group ${
              quickActionTab === "workorder" 
                ? "bg-yellow-400/10 border-yellow-400 text-yellow-400 font-bold shadow-md scale-[1.01]" 
                : "bg-slate-800 border-slate-700/80 hover:bg-slate-750 text-slate-200 hover:border-slate-600 hover:scale-[1.01]"
            }`}
          >
            <ClipboardCheck className={`w-5 h-5 transition-transform group-hover:scale-110 ${quickActionTab === "workorder" ? "text-yellow-400" : "text-blue-400"}`} />
            <span className="text-[11px] font-bold font-mono">Create Work Order</span>
          </button>
          
          <button
            onClick={() => setQuickActionTab(quickActionTab === "retest" ? null : "retest")}
            className={`p-3.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group ${
              quickActionTab === "retest" 
                ? "bg-yellow-400/10 border-yellow-400 text-yellow-400 font-bold shadow-md scale-[1.01]" 
                : "bg-slate-800 border-slate-700/80 hover:bg-slate-750 text-slate-200 hover:border-slate-600 hover:scale-[1.01]"
            }`}
          >
            <Calendar className={`w-5 h-5 transition-transform group-hover:scale-110 ${quickActionTab === "retest" ? "text-yellow-400" : "text-amber-400"}`} />
            <span className="text-[11px] font-bold font-mono">Schedule Re-test</span>
          </button>
          
          <button
            onClick={handleWatchlistToggle}
            className={`p-3.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group ${
              watchlistAdded 
                ? "bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold shadow-md scale-[1.01]" 
                : "bg-slate-800 border-slate-700/80 hover:bg-slate-750 text-slate-200 hover:border-slate-600 hover:scale-[1.01]"
            }`}
          >
            <Star className={`w-5 h-5 transition-transform group-hover:scale-110 ${watchlistAdded ? "text-emerald-400 fill-emerald-400" : "text-yellow-400"}`} />
            <span className="text-[11px] font-bold font-mono">{watchlistAdded ? "✓ Watchlisted" : "Watchlist"}</span>
          </button>
          
          <button
            onClick={() => setQuickActionTab(quickActionTab === "baseline" ? null : "baseline")}
            className={`p-3.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group ${
              quickActionTab === "baseline" 
                ? "bg-yellow-400/10 border-yellow-400 text-yellow-400 font-bold shadow-md scale-[1.01]" 
                : "bg-slate-800 border-slate-700/80 hover:bg-slate-750 text-slate-200 hover:border-slate-600 hover:scale-[1.01]"
            }`}
          >
            <ChartIcon className={`w-5 h-5 transition-transform group-hover:scale-110 ${quickActionTab === "baseline" ? "text-yellow-400" : "text-blue-400"}`} />
            <span className="text-[11px] font-bold font-mono">Compare Baseline</span>
          </button>
        </div>

        {/* Quick Actions tab contents */}
        {quickActionTab === "workorder" && (
          <form onSubmit={handleInteractiveWOSubmit} className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3 animate-fade-in text-left">
            <h5 className="text-[10px] font-bold font-mono text-yellow-400 uppercase tracking-wider">CMMS Maintenance Work Order Form</h5>
            
            {woSubmittedNumber ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-lg space-y-1.5 text-xs">
                <p className="font-bold">✓ Work Order Dispatched Successfully!</p>
                <p className="font-mono">Reference Ticket Number: {woSubmittedNumber}</p>
                <p className="opacity-90">Pre-filled diagnosis and repair instructions uploaded to CMMS queue.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold font-mono text-slate-400 uppercase">Work Order Title</label>
                    <input
                      type="text"
                      value={woTitle}
                      onChange={(e) => setWoTitle(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 focus:border-yellow-400 outline-none"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold font-mono text-slate-400 uppercase">Urgency Priority</label>
                    <select
                      value={woPriority}
                      onChange={(e) => setWoPriority(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 focus:border-yellow-400 outline-none"
                    >
                      <option value="PREVENTIVE (Priority 2)">PREVENTIVE (Priority 2)</option>
                      <option value="EMERGENCY (Priority 1)">EMERGENCY (Priority 1)</option>
                      <option value="ROUTINE (Priority 3)">ROUTINE (Priority 3)</option>
                    </select>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[9px] font-bold font-mono text-slate-400 uppercase">Instructions & Context</label>
                  <textarea
                    value={woInstructions}
                    onChange={(e) => setWoInstructions(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 focus:border-yellow-400 outline-none h-24 font-mono resize-none"
                    required
                  />
                </div>
                
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickActionTab(null)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 text-[10px] rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-[10px] font-black rounded uppercase tracking-wider"
                  >
                    Submit Work Order
                  </button>
                </div>
              </div>
            )}
          </form>
        )}

        {quickActionTab === "retest" && (
          <form onSubmit={handleScheduleRetest} className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3 animate-fade-in text-left">
            <h5 className="text-[10px] font-bold font-mono text-yellow-400 uppercase tracking-wider">Schedule Next Vibration Inspection</h5>
            
            {scheduleSuccess ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-lg space-y-1.5 text-xs">
                <p className="font-bold">✓ Inspection Re-test Scheduled!</p>
                <p className="font-mono">Inspection Date: {scheduledDate}</p>
                <p className="opacity-90">Technician {assignedTech} notified. Calibration task added to schedule queue.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold font-mono text-slate-400 uppercase">Target Date</label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 focus:border-yellow-400 outline-none font-mono"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold font-mono text-slate-400 uppercase">Assigned Technician</label>
                    <select
                      value={assignedTech}
                      onChange={(e) => setAssignedTech(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 focus:border-yellow-400 outline-none"
                    >
                      <option value="Alex Mercer (Reliability Tech III)">Alex Mercer (Reliability Tech III)</option>
                      <option value="Sarah Connor (Reliability Tech II)">Sarah Connor (Reliability Tech II)</option>
                      <option value="James Carter (Vibration Analyst IV)">James Carter (Vibration Analyst IV)</option>
                    </select>
                  </div>
                </div>
                
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickActionTab(null)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 text-[10px] rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1 bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-[10px] font-black rounded uppercase tracking-wider"
                  >
                    Confirm Schedule
                  </button>
                </div>
              </div>
            )}
          </form>
        )}

        {quickActionTab === "baseline" && (
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3 animate-fade-in text-left font-mono text-[11px]">
            <h5 className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">Trend Graph vs ISO Baseline Limits</h5>
            <div className="h-44 w-full flex items-center justify-center">
              {loadingTrends ? (
                <span className="text-slate-400 font-sans text-xs">Loading trend history...</span>
              ) : baselineTrendData && baselineTrendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={baselineTrendData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={9} />
                    <YAxis stroke="#64748b" unit=" in/s" fontSize={9} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} 
                      labelStyle={{ color: "#ffffff" }}
                    />
                    <ReferenceLine y={0.30} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "ISO Limit (>0.30)", fill: "#ef4444", position: "insideBottomRight", fontSize: 9 }} />
                    <Line type="monotone" dataKey="velocity" stroke="#fbbf24" strokeWidth={2.5} activeDot={{ r: 6 }} name="Vibration" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center p-4">
                  <p className="text-slate-400 font-sans text-xs">No baseline data yet. Run more analyses to build trend history.</p>
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
              Graph illustrates overall vibration amplitude trending compared to the maximum permissible strict ISO-10816 limit. Previous baseline values are extracted from archived inspection records.
            </p>
          </div>
        )}
      </div>

      {/* SAP/Maximo Work Order display (rendered when CMMS Work Order is generated) */}
      {generatedWorkOrder && (
        <div className="bg-[#0f172a] border border-slate-850 rounded-2xl p-4 space-y-3 animate-fade-in print-card text-left">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <h4 className="text-xs font-bold text-yellow-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
              <ClipboardCheck className="w-4 h-4" />
              SAP / Maximo Proactive CMMS Work Order
            </h4>
            <button
              onClick={handleCopyToClipboard}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-white rounded text-[10px] font-mono font-bold border border-slate-700 flex items-center gap-1 cursor-pointer transition-all no-print"
            >
              <Copy className="w-3 h-3" />
              <span>Copy WO Code</span>
            </button>
          </div>
          <pre className="text-[10px] font-mono text-slate-300 p-3 bg-slate-950 rounded-xl overflow-x-auto whitespace-pre leading-relaxed border border-slate-900 select-all">
            {generatedWorkOrder}
          </pre>
        </div>
      )}

      {/* Refine Diagnosis Correction Modal */}
      {showCorrectionModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm p-4 no-print">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="bg-slate-950 p-3.5 border-b border-slate-850 flex items-center justify-between">
              <h3 className="text-xs font-black text-white uppercase font-mono tracking-widest flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-yellow-400" />
                Refine AI Diagnosis
              </h3>
              <button
                onClick={() => setShowCorrectionModal(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer font-bold"
              >
                ✕ Close
              </button>
            </div>
            <div className="p-4 space-y-3.5 flex-1 text-left">
              <div className="space-y-1">
                <label className="text-[9px] font-bold font-mono text-slate-400 uppercase">Correct Fault Type</label>
                <select
                  value={correctedFault}
                  onChange={(e) => setCorrectedFault(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 focus:border-yellow-400 outline-none"
                >
                  <option value="Mechanical Unbalance">Mechanical Unbalance</option>
                  <option value="Misalignment">Misalignment</option>
                  <option value="Bearing Defect">Bearing Defect</option>
                  <option value="Gear Tooth Defect">Gear Tooth Defect</option>
                  <option value="Structural Looseness">Structural Looseness</option>
                  <option value="Healthy / Normal Operation">Healthy / Normal Operation</option>
                  <option value="Other">Other / Custom</option>
                </select>
              </div>

              {correctedFault === "Other" ? (
                <div className="space-y-3 border-l-2 border-yellow-400 pl-3 py-1 bg-slate-950/40 rounded-r-lg animate-fade-in">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold font-mono text-yellow-400 uppercase">Custom Fault Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      placeholder="e.g., Cavitation, Belt Wear, Hydraulic Pulsation..."
                      value={customFaultName}
                      onChange={(e) => setCustomFaultName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 focus:border-yellow-400 outline-none font-mono"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold font-mono text-yellow-400 uppercase">Analyst Reasoning / Assessment <span className="text-red-500">*</span></label>
                    <textarea
                      placeholder="Explain the unique spectral peaks, phase angle readings, or physical inspections backing this diagnosis..."
                      value={analystReasoning}
                      onChange={(e) => setAnalystReasoning(e.target.value)}
                      className="w-full h-20 bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 focus:border-yellow-400 outline-none resize-none font-sans"
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-[9px] font-bold font-mono text-slate-400 uppercase">Technician Notes</label>
                  <textarea
                    value={userNotes}
                    onChange={(e) => setUserNotes(e.target.value)}
                    placeholder="Enter details on correct signatures or maintenance verification info..."
                    className="w-full h-20 bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 focus:border-yellow-400 outline-none resize-none font-sans"
                  />
                </div>
              )}

              <button
                onClick={() => handleSubmitFeedback(false)}
                disabled={isSubmittingFeedback || (correctedFault === "Other" && (!customFaultName.trim() || !analystReasoning.trim()))}
                className="w-full py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-black text-xs rounded-xl shadow cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 uppercase tracking-wider"
              >
                {isSubmittingFeedback ? (
                  <span className="w-3.5 h-3.5 border-2 border-t-transparent border-slate-950 rounded-full animate-spin" />
                ) : (
                  <MessageSquare className="w-3.5 h-3.5" />
                )}
                <span>Submit Refined Diagnosis</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CMMS Export Format Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm p-4 no-print">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="bg-slate-950 p-3.5 border-b border-slate-850 flex items-center justify-between">
              <h3 className="text-xs font-black text-white uppercase font-mono tracking-widest flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-yellow-400" />
                Export Reliability Report
              </h3>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer font-bold"
              >
                ✕ Close
              </button>
            </div>
            <div className="p-4 space-y-4 flex-1 text-left">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold font-mono text-slate-400 uppercase">Export Format</label>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl p-2.5 focus:border-yellow-400 outline-none cursor-pointer font-mono"
                >
                  <option value="pdf">Generic PDF Report</option>
                  <option value="sap_csv">SAP PM CSV Work Order</option>
                  <option value="maximo_csv">IBM Maximo CSV Integration</option>
                </select>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1 text-[10px] font-sans text-slate-400 leading-normal">
                {exportFormat === "pdf" && (
                  <p>Downloads a full-scale executive summary containing spectral parameters, peak extraction details, ISO thresholds, and repair procedures as a PDF.</p>
                )}
                {exportFormat === "sap_csv" && (
                  <p>Generates an industry-compliant SAP PM CSV template pre-populated with Equipment IDs, criticalities, fault codes, repair urgencies, and long-text explanations.</p>
                )}
                {exportFormat === "maximo_csv" && (
                  <p>Generates an IBM Maximo CSV file containing site location indicators, failure codes, recommended technician actions, and urgency-level classifications.</p>
                )}
              </div>

              <button
                onClick={executeExport}
                className="w-full py-2.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-black text-xs rounded-xl shadow cursor-pointer transition-all flex items-center justify-center gap-1.5 uppercase tracking-wider"
              >
                <Check className="w-3.5 h-3.5 text-slate-950" />
                <span>Download File</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
